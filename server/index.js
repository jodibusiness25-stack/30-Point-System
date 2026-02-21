require("dotenv").config();
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { initDb, run, get, all } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const LEVEL_EXP_BASE = Number(process.env.LEVEL_EXP_BASE) || 1.2;
const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/New_York";
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
const MOTION_API_BASE_URL =
  process.env.MOTION_API_BASE_URL || "https://api.usemotion.com";
const GLOBAL_MOTION_API_KEY = process.env.MOTION_API_KEY || "";
const GLOBAL_MOTION_PROJECT_ID = process.env.MOTION_PROJECT_ID || "";

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir));

const POINTS = {
  phoneContacts: 1,
  appointmentsSet: 2,
  newNames: 2,
  completedFactFinders: 2,
  applications: 3,
  deliveries: 5,
  referrals: 3
};
const METRIC_KEYS = Object.keys(POINTS);
const MAX_COUNT = 10000;
const MAX_FYC_NOTES_LENGTH = 2000;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_SESSION_NAME_LENGTH = 80;
const MOTION_RETRY_MAX_ATTEMPTS = 10;
const MOTION_RETRY_BATCH_SIZE = 10;
const MOTION_RETRY_INTERVAL_MS = 10 * 60 * 1000;
const MOTION_ALERT_PENDING_THRESHOLD = Number(process.env.MOTION_ALERT_PENDING_THRESHOLD) || 25;
const MOTION_ALERT_FAILED_THRESHOLD = Number(process.env.MOTION_ALERT_FAILED_THRESHOLD) || 5;
const BACKUP_CHECK_INTERVAL_MS = (Number(process.env.BACKUP_CHECK_INTERVAL_MINUTES) || 30) * 60 * 1000;
const SQLITE_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "tracker.sqlite");
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(SQLITE_PATH), "backups");
let motionRetryTimer = null;
let backupTimer = null;
let lastBackupDay = null;
const TEAM_ROLE = {
  LEAD: "Team Lead",
  PARTNER: "Partner",
  MEMBER: "Member"
};

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(MAX_COUNT, Math.floor(num));
}

function normalizeDisplayName(raw, fallback = "") {
  const value = String(raw || "").trim().replace(/\s+/g, " ");
  if (!value) return String(fallback || "").trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return value.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

function normalizeSessionName(raw) {
  const value = String(raw || "").trim().replace(/\s+/g, " ");
  return value.slice(0, MAX_SESSION_NAME_LENGTH);
}

function normalizePayload(payload = {}) {
  return {
    logDate: String(payload.logDate || "").trim(),
    phoneContacts: toInt(payload.phoneContacts),
    appointmentsSet: toInt(payload.appointmentsSet),
    newNames: toInt(payload.newNames),
    completedFactFinders: toInt(payload.completedFactFinders),
    applications: toInt(payload.applications),
    deliveries: toInt(payload.deliveries),
    referrals: toInt(payload.referrals),
    dials: toInt(payload.dials),
    dialGoal: toInt(payload.dialGoal),
    fycTarget: toInt(payload.fycTarget),
    fycCompleted: toInt(payload.fycCompleted),
    fycNotes: String(payload.fycNotes || "").trim().slice(0, MAX_FYC_NOTES_LENGTH)
  };
}

function formatDateUTC(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODateUTC(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function getIsoDateInTimeZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getWeekStartMonday(isoDate) {
  const date = parseISODateUTC(isoDate);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return formatDateUTC(date);
}

function nowTimestampKey() {
  return new Date().toISOString().replaceAll(":", "-");
}

function sanitizeTableName(name) {
  return String(name || "").replaceAll('"', '""');
}

async function createNightlyBackupSnapshot(reason = "scheduled") {
  const backupDay = getIsoDateInTimeZone(APP_TIMEZONE);
  const filePath = path.join(BACKUP_DIR, `snapshot-${backupDay}.json`);
  if (fs.existsSync(filePath)) {
    lastBackupDay = backupDay;
    return { skipped: true, reason: "already_exists", filePath };
  }

  const tables = await all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
  );
  const snapshot = {
    createdAt: new Date().toISOString(),
    reason,
    timezone: APP_TIMEZONE,
    day: backupDay,
    tables: {}
  };
  for (const table of tables) {
    const safeName = sanitizeTableName(table.name);
    snapshot.tables[table.name] = await all(`SELECT * FROM "${safeName}"`);
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(snapshot), "utf8");
  lastBackupDay = backupDay;
  return { skipped: false, filePath };
}

async function maybeRunNightlyBackup(reason = "scheduled") {
  try {
    const backupDay = getIsoDateInTimeZone(APP_TIMEZONE);
    if (backupDay === lastBackupDay) return;
    await createNightlyBackupSnapshot(reason);
  } catch (error) {
    console.error("Backup worker error:", error.message);
  }
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function getPeriodRange(period, todayIsoDate, customFrom, customTo) {
  const end = parseISODateUTC(todayIsoDate);
  let start = new Date(end);
  switch (String(period || "7d").toLowerCase()) {
    case "7d":
      start.setUTCDate(end.getUTCDate() - 6);
      break;
    case "14d":
      start.setUTCDate(end.getUTCDate() - 13);
      break;
    case "30d":
      start.setUTCDate(end.getUTCDate() - 29);
      break;
    case "this_week":
    case "week":
      start = parseISODateUTC(getWeekStartMonday(formatDateUTC(end)));
      break;
    case "this_month":
    case "month":
      start = startOfMonth(end);
      break;
    case "ytd":
      start = startOfYear(end);
      break;
    case "custom": {
      const parsedFrom = customFrom ? parseISODateUTC(customFrom) : null;
      const parsedTo = customTo ? parseISODateUTC(customTo) : null;
      if (!parsedFrom || Number.isNaN(parsedFrom.getTime())) {
        throw new Error("Invalid custom start date");
      }
      if (!parsedTo || Number.isNaN(parsedTo.getTime())) {
        throw new Error("Invalid custom end date");
      }
      if (parsedFrom.getTime() > parsedTo.getTime()) {
        throw new Error("Custom start date must be on or before end date");
      }
      const daySpan = Math.floor(
        (parsedTo.getTime() - parsedFrom.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daySpan > 3660) throw new Error("Custom range is too large");
      return { from: formatDateUTC(parsedFrom), to: formatDateUTC(parsedTo) };
    }
    default:
      start.setUTCDate(end.getUTCDate() - 6);
  }
  return { from: formatDateUTC(start), to: formatDateUTC(end) };
}

function validateLogDate(logDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return "logDate must be YYYY-MM-DD";
  }
  const parsed = parseISODateUTC(logDate);
  if (Number.isNaN(parsed.getTime())) return "Invalid logDate";
  const maxFuture = parseISODateUTC(getIsoDateInTimeZone(APP_TIMEZONE));
  maxFuture.setUTCDate(maxFuture.getUTCDate() + 7);
  if (parsed.getTime() > maxFuture.getTime()) {
    return "logDate is too far in the future";
  }
  return null;
}

function calculateStats(log) {
  const totalPoints = METRIC_KEYS.reduce((sum, key) => sum + log[key] * POINTS[key], 0);
  const dialToContactRatio =
    log.phoneContacts > 0 ? log.dials / log.phoneContacts : null;
  const dialGoalHit = log.dialGoal > 0 ? log.dials >= log.dialGoal : false;
  return { totalPoints, dialToContactRatio, dialGoalHit };
}

function formatRatio(ratio) {
  return ratio === null ? "N/A" : ratio.toFixed(2);
}

function xpToNextForLevel(level) {
  return Math.round(30 * LEVEL_EXP_BASE ** (level - 1));
}

function derivePlayerStateFromLifetime(lifetimeXP) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(lifetimeXP));
  let xpToNext = xpToNextForLevel(level);
  while (remaining >= xpToNext) {
    remaining -= xpToNext;
    level += 1;
    xpToNext = xpToNextForLevel(level);
  }
  return {
    lifetimeXP: Math.max(0, Math.floor(lifetimeXP)),
    level,
    levelXP: remaining,
    xpToNext
  };
}

function signAuthToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, AUTH_SECRET, {
    expiresIn: "30d"
  });
}

function authFromHeader(req) {
  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return null;
  const token = raw.slice(7);
  try {
    return jwt.verify(token, AUTH_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const auth = authFromHeader(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.auth = auth;
  next();
}

async function countRealUsers() {
  const row = await get("SELECT COUNT(1) AS count FROM users WHERE isLegacy = 0");
  return row?.count || 0;
}

async function claimLegacyDataForUser(userId) {
  await run("UPDATE daily_logs SET userId = ? WHERE userId = 1", [userId]);
  const legacyState = await get(
    "SELECT lifetimeXP, level, levelXP, xpToNext FROM user_player_state WHERE userId = 1"
  );
  if (legacyState) {
    await run(
      `
      INSERT OR REPLACE INTO user_player_state (userId, lifetimeXP, level, levelXP, xpToNext, updatedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [userId, legacyState.lifetimeXP, legacyState.level, legacyState.levelXP, legacyState.xpToNext]
    );
  }
  const legacySettings = await get(
    `
    SELECT timezone, defaultDialGoal, defaultDailyAppointmentGoal, defaultWeeklyAppointmentGoal, motionApiKey, motionProjectId
    FROM user_settings
    WHERE userId = 1
    `
  );
  if (legacySettings) {
    await run(
      `
      INSERT OR REPLACE INTO user_settings (
        userId, timezone, defaultDialGoal, defaultDailyAppointmentGoal, defaultWeeklyAppointmentGoal, motionApiKey, motionProjectId, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        userId,
        legacySettings.timezone,
        legacySettings.defaultDialGoal,
        legacySettings.defaultDailyAppointmentGoal,
        legacySettings.defaultWeeklyAppointmentGoal,
        legacySettings.motionApiKey || "",
        legacySettings.motionProjectId || ""
      ]
    );
  }
}

async function getUserById(userId) {
  return get(
    `
    SELECT u.id, u.email, u.displayName, u.teamId, u.roleTitle, u.isLegacy, u.createdAt, t.name AS teamName, t.slug AS teamSlug
    FROM users u
    LEFT JOIN teams t ON t.id = u.teamId
    WHERE u.id = ?
    `,
    [userId]
  );
}

async function getUserByEmail(email) {
  return get(
    `
    SELECT u.id, u.email, u.displayName, u.teamId, u.roleTitle, u.passwordHash, u.isLegacy, u.createdAt, t.name AS teamName, t.slug AS teamSlug
    FROM users u
    LEFT JOIN teams t ON t.id = u.teamId
    WHERE u.email = ?
    `,
    [email]
  );
}

function publicUser(user) {
  if (!user) return null;
  const fallback = String(user.email || "User").split("@")[0] || "User";
  return {
    id: user.id,
    email: user.email,
    displayName: normalizeDisplayName(user.displayName, fallback),
    createdAt: user.createdAt || null,
    teamId: user.teamId || 1,
    teamName: user.teamName || "Stakks Unit",
    teamSlug: user.teamSlug || "stakks-unit",
    roleTitle: String(user.roleTitle || "").trim()
  };
}

function canManageTeam(user) {
  const role = String(user?.roleTitle || "").trim();
  return role === TEAM_ROLE.LEAD || role === TEAM_ROLE.PARTNER;
}

function slugifyTeamName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function getTeamRoleRoster(teamId) {
  const lead = await get(
    `
    SELECT id, email, displayName, roleTitle
    FROM users
    WHERE teamId = ? AND roleTitle = ?
    ORDER BY datetime(createdAt) ASC, id ASC
    LIMIT 1
    `,
    [teamId, TEAM_ROLE.LEAD]
  );
  const partner = await get(
    `
    SELECT id, email, displayName, roleTitle
    FROM users
    WHERE teamId = ? AND roleTitle = ?
    ORDER BY datetime(createdAt) ASC, id ASC
    LIMIT 1
    `,
    [teamId, TEAM_ROLE.PARTNER]
  );
  return {
    teamLead: lead ? publicUser(lead) : null,
    partner: partner ? publicUser(partner) : null
  };
}

async function getRelationship(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) {
    return { isTeammate: false, isFriend: false };
  }
  const viewer = await getUserById(viewerId);
  const target = await getUserById(targetId);
  const isTeammate = Boolean(viewer && target && Number(viewer.teamId) === Number(target.teamId));
  const friend = await get(
    `
    SELECT 1 AS ok
    FROM friend_requests
    WHERE
      ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))
      AND status = 'accepted'
    LIMIT 1
    `,
    [viewerId, targetId, targetId, viewerId]
  );
  return { isTeammate, isFriend: Boolean(friend) };
}

async function ensureUserPlayerState(userId) {
  const existing = await get(
    "SELECT lifetimeXP, level, levelXP, xpToNext FROM user_player_state WHERE userId = ?",
    [userId]
  );
  if (existing) return existing;
  const base = derivePlayerStateFromLifetime(0);
  await run(
    `
    INSERT OR REPLACE INTO user_player_state (userId, lifetimeXP, level, levelXP, xpToNext, updatedAt)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [userId, base.lifetimeXP, base.level, base.levelXP, base.xpToNext]
  );
  return base;
}

async function writeUserPlayerState(userId, state) {
  await run(
    `
    INSERT OR REPLACE INTO user_player_state (userId, lifetimeXP, level, levelXP, xpToNext, updatedAt)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [userId, state.lifetimeXP, state.level, state.levelXP, state.xpToNext]
  );
}

async function getUserSettingsRow(userId) {
  const row = await get(
    `
    SELECT
      timezone,
      defaultDialGoal,
      defaultDailyAppointmentGoal,
      defaultWeeklyAppointmentGoal,
      showCurrentStats,
      motionApiKey,
      motionProjectId
    FROM user_settings
    WHERE userId = ?
    `,
    [userId]
  );
  if (row) return row;
  await run(
    `
    INSERT OR REPLACE INTO user_settings (
      userId, timezone, defaultDialGoal, defaultDailyAppointmentGoal, defaultWeeklyAppointmentGoal, showCurrentStats, motionApiKey, motionProjectId, updatedAt
    ) VALUES (?, ?, 100, 3, 15, 1, '', '', CURRENT_TIMESTAMP)
    `,
    [userId, APP_TIMEZONE]
  );
  return {
    timezone: APP_TIMEZONE,
    defaultDialGoal: 100,
    defaultDailyAppointmentGoal: 3,
    defaultWeeklyAppointmentGoal: 15,
    showCurrentStats: 1,
    motionApiKey: "",
    motionProjectId: ""
  };
}

function publicSettings(userSettings) {
  return {
    timezone: userSettings.timezone || APP_TIMEZONE,
    defaultDialGoal: toInt(userSettings.defaultDialGoal),
    defaultDailyAppointmentGoal: toInt(userSettings.defaultDailyAppointmentGoal),
    defaultWeeklyAppointmentGoal: toInt(userSettings.defaultWeeklyAppointmentGoal),
    showCurrentStats: Number(userSettings.showCurrentStats) ? 1 : 0,
    motionProjectId: userSettings.motionProjectId || "",
    hasMotionApiKey: Boolean(userSettings.motionApiKey)
  };
}

async function getResponseSettings(userId) {
  const userSettings = await getUserSettingsRow(userId);
  return {
    ...publicSettings(userSettings),
    today: getIsoDateInTimeZone(userSettings.timezone || APP_TIMEZONE)
  };
}

async function writeSettingsPatch(userId, patch = {}) {
  const current = await getUserSettingsRow(userId);
  const next = {
    timezone: patch.timezone || current.timezone || APP_TIMEZONE,
    defaultDialGoal:
      patch.defaultDialGoal === undefined ? current.defaultDialGoal : toInt(patch.defaultDialGoal),
    defaultDailyAppointmentGoal:
      patch.defaultDailyAppointmentGoal === undefined
        ? current.defaultDailyAppointmentGoal
        : toInt(patch.defaultDailyAppointmentGoal),
    defaultWeeklyAppointmentGoal:
      patch.defaultWeeklyAppointmentGoal === undefined
        ? current.defaultWeeklyAppointmentGoal
        : toInt(patch.defaultWeeklyAppointmentGoal),
    showCurrentStats:
      patch.showCurrentStats === undefined
        ? Number(current.showCurrentStats) ? 1 : 0
        : Number(patch.showCurrentStats) ? 1 : 0,
    motionApiKey:
      patch.motionApiKey === undefined ? current.motionApiKey || "" : String(patch.motionApiKey || ""),
    motionProjectId:
      patch.motionProjectId === undefined
        ? current.motionProjectId || ""
        : String(patch.motionProjectId || "")
  };
  await run(
    `
    INSERT OR REPLACE INTO user_settings (
      userId, timezone, defaultDialGoal, defaultDailyAppointmentGoal, defaultWeeklyAppointmentGoal, showCurrentStats, motionApiKey, motionProjectId, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      userId,
      next.timezone,
      next.defaultDialGoal,
      next.defaultDailyAppointmentGoal,
      next.defaultWeeklyAppointmentGoal,
      next.showCurrentStats,
      next.motionApiKey,
      next.motionProjectId
    ]
  );
}

async function queueUserLogsForMotionSync(userId) {
  await run(
    `
    UPDATE daily_logs
    SET
      motionSyncStatus = 'pending',
      motionSyncAttempts = 0,
      motionLastError = '',
      updatedAt = CURRENT_TIMESTAMP
    WHERE userId = ?
    `,
    [userId]
  );
}

function resolveMotionCredentials(userSettings) {
  return {
    apiKey: userSettings.motionApiKey || GLOBAL_MOTION_API_KEY,
    projectId: userSettings.motionProjectId || GLOBAL_MOTION_PROJECT_ID
  };
}

function buildMotionDescription(log, stats, playerState, syncMeta = {}) {
  const saveKind = syncMeta.saveKind || "update";
  const saveRevision = Number(syncMeta.saveRevision || 1);
  return [
    `Date: ${log.logDate}`,
    `Save Type: ${saveKind === "new_day" ? "NEW_DAY" : "UPDATE"}`,
    `Save Revision: ${saveRevision}`,
    "",
    "Points Breakdown:",
    `- Phone Contacts (${POINTS.phoneContacts} pt): ${log.phoneContacts}`,
    `- Appointments Set (${POINTS.appointmentsSet} pts): ${log.appointmentsSet}`,
    `- New Names (${POINTS.newNames} pts): ${log.newNames}`,
    `- Completed Fact Finders (${POINTS.completedFactFinders} pts): ${log.completedFactFinders}`,
    `- Applications (${POINTS.applications} pts): ${log.applications}`,
    `- Deliveries (${POINTS.deliveries} pts): ${log.deliveries}`,
    `- Referrals (${POINTS.referrals} pts): ${log.referrals}`,
    "",
    `Daily Points: ${stats.totalPoints}`,
    `Dials: ${log.dials}`,
    `Dial Goal: ${log.dialGoal}`,
    `Dial Goal Hit: ${stats.dialGoalHit ? "Yes" : "No"}`,
    `Dial-to-Contact Ratio: ${formatRatio(stats.dialToContactRatio)}`,
    "",
    "Level Progress:",
    `- Level: ${playerState.level}`,
    `- Level Progress: ${playerState.levelXP}/${playerState.xpToNext}`,
    `- Lifetime Points: ${playerState.lifetimeXP}`,
    "",
    "FYC Tracker:",
    `- Target: ${log.fycTarget}`,
    `- Completed: ${log.fycCompleted}`,
    `- Notes: ${log.fycNotes || "None"}`
  ].join("\n");
}

async function createMotionTask(log, stats, playerState, syncMeta, creds) {
  if (!creds.apiKey || !creds.projectId) {
    return { motionTaskId: null, skipped: true, reason: "Missing Motion credentials" };
  }
  try {
    const response = await axios.post(
      `${MOTION_API_BASE_URL}/v1/tasks`,
      {
        name: `Daily Activity - ${log.logDate}`,
        description: buildMotionDescription(log, stats, playerState, syncMeta),
        projectId: creds.projectId
      },
      { headers: { "X-API-Key": creds.apiKey, "Content-Type": "application/json" } }
    );
    return { motionTaskId: response.data?.id || response.data?.task?.id || null, skipped: false };
  } catch (error) {
    console.error("Motion create task error:", error.response?.status, error.response?.data || error.message);
    return { motionTaskId: null, skipped: true, reason: "Failed to create Motion task" };
  }
}

async function updateMotionTask(motionTaskId, log, stats, playerState, syncMeta, creds) {
  if (!creds.apiKey || !creds.projectId || !motionTaskId) {
    return { motionTaskId, skipped: true, reason: "Missing Motion credentials or task id" };
  }
  const payload = {
    name: `Daily Activity - ${log.logDate}`,
    description: buildMotionDescription(log, stats, playerState, syncMeta),
    projectId: creds.projectId
  };
  const headers = { "X-API-Key": creds.apiKey, "Content-Type": "application/json" };
  try {
    await axios.patch(`${MOTION_API_BASE_URL}/v1/tasks/${motionTaskId}`, payload, { headers });
    return { motionTaskId, skipped: false };
  } catch (patchError) {
    try {
      await axios.put(`${MOTION_API_BASE_URL}/v1/tasks/${motionTaskId}`, payload, { headers });
      return { motionTaskId, skipped: false };
    } catch (putError) {
      console.error("Motion update task error:", putError.response?.status, putError.response?.data || putError.message);
      return { motionTaskId, skipped: true, reason: "Failed to update Motion task; kept existing id" };
    }
  }
}

function decorateLog(row) {
  return { ...row, weekStartMonday: getWeekStartMonday(row.logDate) };
}

async function markMotionSyncStatus(logId, patch) {
  await run(
    `
    UPDATE daily_logs
    SET motionSyncStatus = ?, motionSyncAttempts = ?, motionLastError = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [patch.motionSyncStatus, patch.motionSyncAttempts, patch.motionLastError || "", logId]
  );
}

async function readLogById(logId) {
  return get(
    `
    SELECT
      id, userId, logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders,
      applications, deliveries, referrals, dials, dialGoal, dialGoalHit, fycTarget, fycCompleted,
      fycNotes, totalPoints, dialToContactRatio, motionTaskId, motionSyncStatus, motionSyncAttempts,
      motionLastError, saveRevision, updatedAt
    FROM daily_logs
    WHERE id = ?
    `,
    [logId]
  );
}

async function syncMotionForLogId(logId) {
  const record = await readLogById(logId);
  if (!record) return { skipped: true, reason: "Log not found", motionTaskId: null, action: null };
  const attempts = Number(record.motionSyncAttempts || 0);
  if (attempts >= MOTION_RETRY_MAX_ATTEMPTS) {
    return { skipped: true, reason: "Max Motion retry attempts reached", motionTaskId: record.motionTaskId || null, action: null };
  }

  const userSettings = await getUserSettingsRow(record.userId);
  const creds = resolveMotionCredentials(userSettings);
  const log = normalizePayload(record);
  log.logDate = record.logDate;
  const stats = calculateStats(log);
  const playerState = await ensureUserPlayerState(record.userId);
  const saveKind = Number(record.saveRevision || 1) <= 1 ? "new_day" : "update";
  const motionAction = record.motionTaskId ? "update" : "create";

  const motionResult = record.motionTaskId
    ? await updateMotionTask(record.motionTaskId, log, stats, playerState, { saveKind, saveRevision: record.saveRevision }, creds)
    : await createMotionTask(log, stats, playerState, { saveKind, saveRevision: record.saveRevision }, creds);

  if (!motionResult.skipped) {
    const finalMotionTaskId = motionResult.motionTaskId || record.motionTaskId || null;
    if (finalMotionTaskId && finalMotionTaskId !== record.motionTaskId) {
      await run("UPDATE daily_logs SET motionTaskId = ? WHERE id = ?", [finalMotionTaskId, logId]);
    }
    await markMotionSyncStatus(logId, {
      motionSyncStatus: "synced",
      motionSyncAttempts: attempts + 1,
      motionLastError: ""
    });
    return { skipped: false, reason: null, motionTaskId: finalMotionTaskId, action: motionAction };
  }

  const missingMotionConfig = /Missing Motion/i.test(motionResult.reason || "");
  if (missingMotionConfig) {
    await markMotionSyncStatus(logId, {
      motionSyncStatus: "pending",
      motionSyncAttempts: attempts,
      motionLastError: motionResult.reason || "Missing Motion configuration"
    });
    return { skipped: true, reason: motionResult.reason, motionTaskId: record.motionTaskId || null, action: motionAction };
  }

  await markMotionSyncStatus(logId, {
    motionSyncStatus: attempts + 1 >= MOTION_RETRY_MAX_ATTEMPTS ? "failed" : "pending",
    motionSyncAttempts: attempts + 1,
    motionLastError: motionResult.reason || "Motion sync failed"
  });
  return { skipped: true, reason: motionResult.reason || "Motion sync failed", motionTaskId: record.motionTaskId || null, action: motionAction };
}

async function retryPendingMotionSync() {
  try {
    const pending = await all(
      `
      SELECT id
      FROM daily_logs
      WHERE motionSyncStatus = 'pending' AND motionSyncAttempts < ?
      ORDER BY updatedAt ASC
      LIMIT ?
      `,
      [MOTION_RETRY_MAX_ATTEMPTS, MOTION_RETRY_BATCH_SIZE]
    );
    for (const row of pending) {
      await syncMotionForLogId(row.id);
    }
  } catch (error) {
    console.error("Motion retry worker error:", error.message);
  }
}

async function backfillUserMotionHistory(userId) {
  const ids = await all(
    `
    SELECT id
    FROM daily_logs
    WHERE userId = ?
    ORDER BY logDate ASC
    `,
    [userId]
  );
  for (const row of ids) {
    await syncMotionForLogId(row.id);
  }
  const pending = await get(
    "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'pending'",
    [userId]
  );
  const failed = await get(
    "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'failed'",
    [userId]
  );
  return {
    totalLogs: ids.length,
    pendingSyncCount: pending?.count || 0,
    failedSyncCount: failed?.count || 0
  };
}

async function getDashboardSummary(userId) {
  const totals = await get(
    `
    SELECT
      COUNT(1) AS totalLogs,
      COALESCE(SUM(totalPoints), 0) AS totalXP,
      COALESCE(SUM(dials), 0) AS totalDials,
      COALESCE(SUM(appointmentsSet), 0) AS totalAppointments
    FROM daily_logs
    WHERE userId = ?
    `,
    [userId]
  );
  const pending = await get(
    "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'pending'",
    [userId]
  );
  const failed = await get(
    "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'failed'",
    [userId]
  );
  const synced = await get(
    "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'synced'",
    [userId]
  );
  const lastSaved = await get(
    "SELECT logDate, updatedAt, saveRevision FROM daily_logs WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1",
    [userId]
  );
  return {
    totalLogs: totals?.totalLogs || 0,
    totalXP: totals?.totalXP || 0,
    totalDials: totals?.totalDials || 0,
    totalAppointments: totals?.totalAppointments || 0,
    motion: {
      syncedCount: synced?.count || 0,
      pendingSyncCount: pending?.count || 0,
      failedSyncCount: failed?.count || 0
    },
    lastSaved: lastSaved
      ? {
          logDate: lastSaved.logDate,
          updatedAt: lastSaved.updatedAt,
          saveRevision: lastSaved.saveRevision || 1
        }
      : null
  };
}

async function getFriendRows(userId) {
  return all(
    `
    SELECT DISTINCT u.id, u.email, u.displayName
    FROM users u
    INNER JOIN friend_requests fr
      ON (
        (fr.fromUserId = ? AND fr.toUserId = u.id) OR
        (fr.toUserId = ? AND fr.fromUserId = u.id)
      )
    WHERE fr.status = 'accepted' AND u.isLegacy = 0
    ORDER BY u.displayName COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC
    `,
    [userId, userId]
  );
}

async function getFriendState(userId) {
  const friends = await getFriendRows(userId);
  const incomingRequests = await all(
    `
    SELECT fr.id, fr.fromUserId AS userId, u.email, u.displayName, fr.createdAt
    FROM friend_requests fr
    INNER JOIN users u ON u.id = fr.fromUserId
    WHERE fr.toUserId = ? AND fr.status = 'pending' AND u.isLegacy = 0
    ORDER BY fr.createdAt DESC
    `,
    [userId]
  );
  const outgoingRequests = await all(
    `
    SELECT fr.id, fr.toUserId AS userId, u.email, u.displayName, fr.createdAt
    FROM friend_requests fr
    INNER JOIN users u ON u.id = fr.toUserId
    WHERE fr.fromUserId = ? AND fr.status = 'pending' AND u.isLegacy = 0
    ORDER BY fr.createdAt DESC
    `,
    [userId]
  );
  return { friends, incomingRequests, outgoingRequests };
}

async function getActiveSessionForUser(userId) {
  return get(
    `
    SELECT s.id, s.name, s.ownerUserId, s.status, s.startDate, s.startedAt, s.endedAt
    FROM activity_sessions s
    INNER JOIN activity_session_participants p ON p.sessionId = s.id
    WHERE p.userId = ? AND p.leftAt IS NULL AND s.status = 'active'
    ORDER BY s.startedAt DESC
    LIMIT 1
    `,
    [userId]
  );
}

async function getSessionParticipants(sessionId) {
  return all(
    `
    SELECT p.userId, u.email, u.displayName, p.joinedAt, p.leftAt
    FROM activity_session_participants p
    INNER JOIN users u ON u.id = p.userId
    WHERE p.sessionId = ?
    ORDER BY p.joinedAt ASC
    `,
    [sessionId]
  );
}

async function getSessionLeaderboard(sessionId) {
  return all(
    `
    SELECT sc.userId, u.displayName, u.email, sc.score, sc.updatedAt
    FROM activity_session_scores sc
    INNER JOIN users u ON u.id = sc.userId
    WHERE sc.sessionId = ?
    ORDER BY sc.score DESC, u.displayName COLLATE NOCASE ASC
    `,
    [sessionId]
  );
}

async function getSessionInvites(sessionId) {
  return all(
    `
    SELECT i.id, i.toUserId, i.status, i.createdAt, u.displayName, u.email
    FROM activity_session_invites i
    INNER JOIN users u ON u.id = i.toUserId
    WHERE i.sessionId = ?
    ORDER BY i.createdAt DESC
    `,
    [sessionId]
  );
}

async function buildSessionView(session, viewerUserId) {
  if (!session) return null;
  const participants = await getSessionParticipants(session.id);
  const leaderboard = await getSessionLeaderboard(session.id);
  const invites = await getSessionInvites(session.id);
  const friendState = await getFriendState(viewerUserId);
  const memberIds = new Set(participants.map((p) => p.userId));
  const invitedIds = new Set(
    invites.filter((invite) => invite.status === "pending").map((invite) => invite.toUserId)
  );
  const invitableFriends = friendState.friends.filter(
    (friend) => !memberIds.has(friend.id) && !invitedIds.has(friend.id)
  );
  return {
    ...session,
    participants,
    leaderboard,
    invites,
    invitableFriends
  };
}

async function applyActivityScoreDelta(userId, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  const activeSession = await getActiveSessionForUser(userId);
  if (!activeSession) return;
  await run(
    `
    INSERT OR IGNORE INTO activity_session_scores (sessionId, userId, score, updatedAt)
    VALUES (?, ?, 0, CURRENT_TIMESTAMP)
    `,
    [activeSession.id, userId]
  );
  await run(
    `
    UPDATE activity_session_scores
    SET score = score + ?, updatedAt = CURRENT_TIMESTAMP
    WHERE sessionId = ? AND userId = ?
    `,
    [Math.floor(delta), activeSession.id, userId]
  );
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = normalizeDisplayName(req.body?.displayName, email.split("@")[0] || "User");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    if (!displayName) {
      res.status(400).json({ error: "Display name is required" });
      return;
    }
    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const realUsersBefore = await countRealUsers();
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await run(
      "INSERT INTO users (email, displayName, teamId, roleTitle, passwordHash, isLegacy) VALUES (?, ?, 1, ?, ?, 0)",
      [email, displayName, realUsersBefore === 0 ? "Team Lead" : "", passwordHash]
    );
    const userId = created.lastID;

    await ensureUserPlayerState(userId);
    await writeSettingsPatch(userId, {});
    if (realUsersBefore === 0) {
      await claimLegacyDataForUser(userId);
    }

    const user = await getUserById(userId);
    const token = signAuthToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({ error: "Failed to register" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await getUserByEmail(email);
    if (!user || user.isLegacy) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const ok = await bcrypt.compare(password, user.passwordHash || "");
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signAuthToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await getUserById(req.auth.userId);
  if (!user || user.isLegacy) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ user: publicUser(user) });
});

async function teammateStatePayload(userId) {
  const state = await getFriendState(userId);
  return { friends: state, teammates: state };
}

async function handleTeammateRequest(req, res) {
  try {
    const userId = req.auth.userId;
    const targetEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!targetEmail) {
      res.status(400).json({ error: "Teammate email is required" });
      return;
    }
    const target = await getUserByEmail(targetEmail);
    if (!target || target.isLegacy) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: "You cannot add yourself as a teammate" });
      return;
    }
    const existingAccepted = await get(
      `
      SELECT id
      FROM friend_requests
      WHERE
        ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))
        AND status = 'accepted'
      `,
      [userId, target.id, target.id, userId]
    );
    if (existingAccepted) {
      res.status(409).json({ error: "You are already teammates" });
      return;
    }

    const reversePending = await get(
      `
      SELECT id
      FROM friend_requests
      WHERE fromUserId = ? AND toUserId = ? AND status = 'pending'
      `,
      [target.id, userId]
    );
    if (reversePending) {
      await run(
        `
        UPDATE friend_requests
        SET status = 'accepted', respondedAt = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [reversePending.id]
      );
      res.json({ message: "Teammate request accepted", ...(await teammateStatePayload(userId)) });
      return;
    }

    const existingForward = await get(
      `
      SELECT id, status
      FROM friend_requests
      WHERE fromUserId = ? AND toUserId = ?
      `,
      [userId, target.id]
    );
    if (existingForward?.status === "pending") {
      res.json({
        message: "Teammate request already pending",
        ...(await teammateStatePayload(userId))
      });
      return;
    }
    if (existingForward) {
      await run(
        `
        UPDATE friend_requests
        SET status = 'pending', createdAt = CURRENT_TIMESTAMP, respondedAt = NULL
        WHERE id = ?
        `,
        [existingForward.id]
      );
      res.json({ message: "Teammate request sent", ...(await teammateStatePayload(userId)) });
      return;
    }

    await run(
      `
      INSERT OR IGNORE INTO friend_requests (fromUserId, toUserId, status)
      VALUES (?, ?, 'pending')
      `,
      [userId, target.id]
    );
    res.json({ message: "Teammate request sent", ...(await teammateStatePayload(userId)) });
  } catch (error) {
    console.error("Teammate request error:", error.message);
    res.status(500).json({ error: "Failed to send teammate request" });
  }
}

async function handleTeammateRespond(req, res) {
  try {
    const userId = req.auth.userId;
    const requestId = Number(req.body?.requestId || 0);
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!requestId || !["accept", "decline"].includes(action)) {
      res.status(400).json({ error: "Invalid request response" });
      return;
    }
    const requestRow = await get(
      "SELECT id FROM friend_requests WHERE id = ? AND toUserId = ? AND status = 'pending'",
      [requestId, userId]
    );
    if (!requestRow) {
      res.status(404).json({ error: "Teammate request not found" });
      return;
    }
    await run(
      `
      UPDATE friend_requests
      SET status = ?, respondedAt = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [action === "accept" ? "accepted" : "declined", requestId]
    );
    res.json({ message: `Teammate request ${action}ed`, ...(await teammateStatePayload(userId)) });
  } catch (error) {
    console.error("Teammate respond error:", error.message);
    res.status(500).json({ error: "Failed to respond to teammate request" });
  }
}

app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    res.json(await teammateStatePayload(req.auth.userId));
  } catch (error) {
    console.error("Teammates load error:", error.message);
    res.status(500).json({ error: "Failed to load teammates" });
  }
});

app.post("/api/friends/request", requireAuth, async (req, res) => {
  handleTeammateRequest(req, res);
});

app.post("/api/friends/respond", requireAuth, async (req, res) => {
  handleTeammateRespond(req, res);
});

app.get("/api/teammates", requireAuth, async (req, res) => {
  try {
    res.json(await teammateStatePayload(req.auth.userId));
  } catch (error) {
    console.error("Teammates load error:", error.message);
    res.status(500).json({ error: "Failed to load teammates" });
  }
});

app.post("/api/teammates/request", requireAuth, async (req, res) => {
  handleTeammateRequest(req, res);
});

app.post("/api/teammates/respond", requireAuth, async (req, res) => {
  handleTeammateRespond(req, res);
});

app.get("/api/activity/state", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const activeSession = await getActiveSessionForUser(userId);
    const sessionView = await buildSessionView(activeSession, userId);
    const teammateState = await getFriendState(userId);
    const incomingInvites = await all(
      `
      SELECT i.id, i.sessionId, i.createdAt, s.name, s.startedAt, s.ownerUserId, u.displayName AS ownerDisplayName
      FROM activity_session_invites i
      INNER JOIN activity_sessions s ON s.id = i.sessionId
      INNER JOIN users u ON u.id = s.ownerUserId
      WHERE i.toUserId = ? AND i.status = 'pending' AND s.status = 'active'
      ORDER BY i.createdAt DESC
      `,
      [userId]
    );
    res.json({
      activeSession: sessionView,
      incomingInvites,
      friends: teammateState,
      teammates: teammateState
    });
  } catch (error) {
    console.error("Activity state error:", error.message);
    res.status(500).json({ error: "Failed to load activity state" });
  }
});

app.post("/api/activity/start", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const name = normalizeSessionName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "Session name is required" });
      return;
    }
    const existing = await getActiveSessionForUser(userId);
    if (existing) {
      res.status(409).json({ error: "You already have an active session" });
      return;
    }
    const userSettings = await getUserSettingsRow(userId);
    const sessionDate = getIsoDateInTimeZone(userSettings.timezone || APP_TIMEZONE);
    const created = await run(
      `
      INSERT INTO activity_sessions (name, ownerUserId, status, startDate, startedAt, updatedAt)
      VALUES (?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [name, userId, sessionDate]
    );
    const sessionId = created.lastID;
    await run(
      `
      INSERT INTO activity_session_participants (sessionId, userId, joinedAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      `,
      [sessionId, userId]
    );
    await run(
      `
      INSERT OR REPLACE INTO activity_session_scores (sessionId, userId, score, updatedAt)
      VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      `,
      [sessionId, userId]
    );
    const session = await get("SELECT * FROM activity_sessions WHERE id = ?", [sessionId]);
    res.json({ message: "Session started", activeSession: await buildSessionView(session, userId) });
  } catch (error) {
    console.error("Activity start error:", error.message);
    res.status(500).json({ error: "Failed to start session" });
  }
});

app.post("/api/activity/invite", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const sessionId = Number(req.body?.sessionId || 0);
    const friendUserId = Number(req.body?.teammateUserId || req.body?.friendUserId || 0);
    if (!sessionId || !friendUserId) {
      res.status(400).json({ error: "sessionId and teammateUserId are required" });
      return;
    }
    const session = await get(
      "SELECT id, ownerUserId, status FROM activity_sessions WHERE id = ?",
      [sessionId]
    );
    if (!session || session.status !== "active") {
      res.status(404).json({ error: "Active session not found" });
      return;
    }
    const isParticipant = await get(
      `
      SELECT 1 AS ok
      FROM activity_session_participants
      WHERE sessionId = ? AND userId = ? AND leftAt IS NULL
      `,
      [sessionId, userId]
    );
    if (!isParticipant) {
      res.status(403).json({ error: "Only active participants can invite" });
      return;
    }
    const friendRelation = await get(
      `
      SELECT 1 AS ok
      FROM friend_requests
      WHERE
        ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))
        AND status = 'accepted'
      `,
      [userId, friendUserId, friendUserId, userId]
    );
    if (!friendRelation) {
      res.status(403).json({ error: "Can only invite accepted teammates" });
      return;
    }
    const alreadyMember = await get(
      `
      SELECT 1 AS ok
      FROM activity_session_participants
      WHERE sessionId = ? AND userId = ?
      `,
      [sessionId, friendUserId]
    );
    if (alreadyMember) {
      res.status(409).json({ error: "Teammate is already in this session" });
      return;
    }
    await run(
      `
      INSERT OR REPLACE INTO activity_session_invites (
        id, sessionId, fromUserId, toUserId, status, createdAt, respondedAt
      )
      VALUES (
        (SELECT id FROM activity_session_invites WHERE sessionId = ? AND toUserId = ?),
        ?, ?, ?, 'pending', CURRENT_TIMESTAMP, NULL
      )
      `,
      [sessionId, friendUserId, sessionId, userId, friendUserId]
    );
    const refreshed = await get("SELECT * FROM activity_sessions WHERE id = ?", [sessionId]);
    res.json({ message: "Invite sent", activeSession: await buildSessionView(refreshed, userId) });
  } catch (error) {
    console.error("Activity invite error:", error.message);
    res.status(500).json({ error: "Failed to invite teammate" });
  }
});

app.post("/api/activity/respond-invite", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const inviteId = Number(req.body?.inviteId || 0);
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!inviteId || !["accept", "decline"].includes(action)) {
      res.status(400).json({ error: "Invalid invite response" });
      return;
    }
    const invite = await get(
      `
      SELECT i.id, i.sessionId, i.status, s.status AS sessionStatus
      FROM activity_session_invites i
      INNER JOIN activity_sessions s ON s.id = i.sessionId
      WHERE i.id = ? AND i.toUserId = ?
      `,
      [inviteId, userId]
    );
    if (!invite || invite.status !== "pending") {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    if (action === "accept" && invite.sessionStatus !== "active") {
      res.status(409).json({ error: "This session is no longer active" });
      return;
    }

    await run(
      `
      UPDATE activity_session_invites
      SET status = ?, respondedAt = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [action === "accept" ? "accepted" : "declined", inviteId]
    );

    if (action === "accept") {
      await run(
        `
        INSERT OR REPLACE INTO activity_session_participants (
          id, sessionId, userId, joinedAt, leftAt
        )
        VALUES (
          (SELECT id FROM activity_session_participants WHERE sessionId = ? AND userId = ?),
          ?, ?, CURRENT_TIMESTAMP, NULL
        )
        `,
        [invite.sessionId, userId, invite.sessionId, userId]
      );
      await run(
        `
        INSERT OR IGNORE INTO activity_session_scores (sessionId, userId, score, updatedAt)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        `,
        [invite.sessionId, userId]
      );
    }

    const activeSession = await getActiveSessionForUser(userId);
    res.json({
      message: action === "accept" ? "Joined session" : "Invite declined",
      activeSession: await buildSessionView(activeSession, userId)
    });
  } catch (error) {
    console.error("Activity respond invite error:", error.message);
    res.status(500).json({ error: "Failed to respond to invite" });
  }
});

app.post("/api/activity/leave", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const sessionId = Number(req.body?.sessionId || 0);
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    const session = await get("SELECT id, ownerUserId, status FROM activity_sessions WHERE id = ?", [sessionId]);
    if (!session || session.status !== "active") {
      res.status(404).json({ error: "Active session not found" });
      return;
    }
    if (session.ownerUserId === userId) {
      res.status(400).json({ error: "Owner cannot leave active session. Stop it instead." });
      return;
    }
    await run(
      `
      UPDATE activity_session_participants
      SET leftAt = CURRENT_TIMESTAMP
      WHERE sessionId = ? AND userId = ? AND leftAt IS NULL
      `,
      [sessionId, userId]
    );
    const activeSession = await getActiveSessionForUser(userId);
    res.json({ message: "Left session", activeSession: await buildSessionView(activeSession, userId) });
  } catch (error) {
    console.error("Activity leave error:", error.message);
    res.status(500).json({ error: "Failed to leave session" });
  }
});

app.post("/api/activity/stop", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const sessionId = Number(req.body?.sessionId || 0);
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    const session = await get(
      "SELECT id, ownerUserId, status FROM activity_sessions WHERE id = ?",
      [sessionId]
    );
    if (!session || session.status !== "active") {
      res.status(404).json({ error: "Active session not found" });
      return;
    }
    if (session.ownerUserId !== userId) {
      res.status(403).json({ error: "Only the session owner can stop this session" });
      return;
    }

    await run(
      `
      UPDATE activity_sessions
      SET status = 'ended', endedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [sessionId]
    );
    await run(
      `
      UPDATE activity_session_participants
      SET leftAt = COALESCE(leftAt, CURRENT_TIMESTAMP)
      WHERE sessionId = ?
      `,
      [sessionId]
    );
    res.json({ message: "Session stopped" });
  } catch (error) {
    console.error("Activity stop error:", error.message);
    res.status(500).json({ error: "Failed to stop session" });
  }
});

app.get("/api/activity/history", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const sessions = await all(
      `
      SELECT DISTINCT s.id, s.name, s.ownerUserId, s.status, s.startDate, s.startedAt, s.endedAt
      FROM activity_sessions s
      INNER JOIN activity_session_participants p ON p.sessionId = s.id
      WHERE p.userId = ?
      ORDER BY s.startedAt DESC
      `,
      [userId]
    );
    const enriched = [];
    for (const session of sessions) {
      const participants = await getSessionParticipants(session.id);
      const leaderboard = await getSessionLeaderboard(session.id);
      enriched.push({ ...session, participants, leaderboard });
    }
    res.json({
      sessions: enriched,
      byDate: enriched.reduce((acc, session) => {
        if (!acc[session.startDate]) acc[session.startDate] = [];
        acc[session.startDate].push({
          id: session.id,
          name: session.name,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          leaderboard: session.leaderboard,
          participants: session.participants
        });
        return acc;
      }, {})
    });
  } catch (error) {
    console.error("Activity history error:", error.message);
    res.status(500).json({ error: "Failed to load activity history" });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const user = await getUserById(userId);
    if (!user || user.isLegacy) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const playerState = await ensureUserPlayerState(userId);
    const settings = await getResponseSettings(userId);
    const dashboard = await getDashboardSummary(userId);
    res.json({
      profile: {
        user: publicUser(user),
        teamRoles: await getTeamRoleRoster(user.teamId || 1),
        playerState,
        settings,
        dashboard
      }
    });
  } catch (error) {
    console.error("Profile load error:", error.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const current = await getUserById(userId);
    if (!current || current.isLegacy) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const nextName = normalizeDisplayName(
      req.body?.displayName,
      current.displayName || current.email.split("@")[0] || "User"
    );
    if (!nextName) {
      res.status(400).json({ error: "Display name is required" });
      return;
    }

    await run("UPDATE users SET displayName = ? WHERE id = ?", [nextName, userId]);
    await writeSettingsPatch(userId, {
      timezone: req.body?.timezone,
      defaultDialGoal: req.body?.defaultDialGoal,
      defaultDailyAppointmentGoal: req.body?.defaultDailyAppointmentGoal,
      defaultWeeklyAppointmentGoal: req.body?.defaultWeeklyAppointmentGoal,
      showCurrentStats: req.body?.showCurrentStats,
      motionApiKey: req.body?.motionApiKey,
      motionProjectId: req.body?.motionProjectId
    });

    const updatedUser = await getUserById(userId);
    const profile = {
      user: publicUser(updatedUser),
      teamRoles: await getTeamRoleRoster(updatedUser.teamId || 1),
      playerState: await ensureUserPlayerState(userId),
      settings: await getResponseSettings(userId),
      dashboard: await getDashboardSummary(userId)
    };

    res.json({ message: "Profile updated", profile });
  } catch (error) {
    console.error("Profile update error:", error.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post("/api/team/create", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const user = await getUserById(userId);
    if (!user || user.isLegacy) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamName = String(req.body?.teamName || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!teamName) {
      res.status(400).json({ error: "Team name is required" });
      return;
    }
    const baseSlug = slugifyTeamName(teamName);
    if (!baseSlug) {
      res.status(400).json({ error: "Invalid team name" });
      return;
    }
    let slug = baseSlug;
    let suffix = 2;
    while (await get("SELECT id FROM teams WHERE slug = ?", [slug])) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const created = await run("INSERT INTO teams (name, slug) VALUES (?, ?)", [teamName, slug]);
    const teamId = created.lastID;
    await run("UPDATE users SET teamId = ?, roleTitle = ? WHERE id = ?", [teamId, TEAM_ROLE.PARTNER, userId]);
    const updatedUser = await getUserById(userId);
    res.json({
      message: "Team created",
      user: publicUser(updatedUser),
      teamRoles: await getTeamRoleRoster(teamId)
    });
  } catch (error) {
    console.error("Team create error:", error.message);
    res.status(500).json({ error: "Failed to create team" });
  }
});

app.post("/api/team/assign-role", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const actor = await getUserById(userId);
    if (!actor || actor.isLegacy) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!canManageTeam(actor)) {
      res.status(403).json({ error: "Only Team Lead or Partner can assign roles" });
      return;
    }

    const targetEmail = String(req.body?.email || "").trim().toLowerCase();
    const nextRole = String(req.body?.roleTitle || "").trim();
    const allowedRoles = [TEAM_ROLE.MEMBER, TEAM_ROLE.PARTNER, TEAM_ROLE.LEAD];
    if (!targetEmail || !allowedRoles.includes(nextRole)) {
      res.status(400).json({ error: "Valid teammate email and role are required" });
      return;
    }
    if (nextRole === TEAM_ROLE.LEAD && actor.roleTitle !== TEAM_ROLE.PARTNER) {
      res.status(403).json({ error: "Only Partner can assign Team Lead role" });
      return;
    }

    const target = await getUserByEmail(targetEmail);
    if (!target || target.isLegacy) {
      res.status(404).json({ error: "Teammate not found" });
      return;
    }
    if (Number(target.teamId) !== Number(actor.teamId)) {
      res.status(403).json({ error: "Teammate must be in your team" });
      return;
    }

    if (nextRole === TEAM_ROLE.PARTNER) {
      const existingPartner = await get(
        "SELECT id FROM users WHERE teamId = ? AND roleTitle = ? AND id <> ? LIMIT 1",
        [actor.teamId, TEAM_ROLE.PARTNER, target.id]
      );
      if (existingPartner) {
        res.status(409).json({ error: "Partner role is already assigned. Reassign current partner first." });
        return;
      }
    }

    if (nextRole === TEAM_ROLE.LEAD) {
      await run(
        "UPDATE users SET roleTitle = ? WHERE teamId = ? AND roleTitle = ?",
        [TEAM_ROLE.MEMBER, actor.teamId, TEAM_ROLE.LEAD]
      );
    }

    await run("UPDATE users SET roleTitle = ? WHERE id = ?", [nextRole, target.id]);
    const refreshedActor = await getUserById(userId);
    res.json({
      message: "Role updated",
      user: publicUser(refreshedActor),
      teamRoles: await getTeamRoleRoster(actor.teamId)
    });
  } catch (error) {
    console.error("Team assign role error:", error.message);
    res.status(500).json({ error: "Failed to assign role" });
  }
});

app.post("/api/team/add-member", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const actor = await getUserById(userId);
    if (!actor || actor.isLegacy) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (![TEAM_ROLE.LEAD, TEAM_ROLE.PARTNER].includes(String(actor.roleTitle || ""))) {
      res.status(403).json({ error: "Only Team Lead or Partner can add members to the team" });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Member email is required" });
      return;
    }
    const target = await getUserByEmail(email);
    if (!target || target.isLegacy) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await run("UPDATE users SET teamId = ?, roleTitle = ? WHERE id = ?", [
      actor.teamId,
      TEAM_ROLE.MEMBER,
      target.id
    ]);
    res.json({
      message: "Member added to team",
      teamRoles: await getTeamRoleRoster(actor.teamId)
    });
  } catch (error) {
    console.error("Team add member error:", error.message);
    res.status(500).json({ error: "Failed to add member to team" });
  }
});

app.get("/api/people/:userId", requireAuth, async (req, res) => {
  try {
    const viewerId = req.auth.userId;
    const targetId = Number(req.params.userId || 0);
    if (!targetId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const target = await getUserById(targetId);
    if (!target || target.isLegacy) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    const relation = await getRelationship(viewerId, targetId);
    const settings = await getUserSettingsRow(targetId);
    const isSelf = viewerId === targetId;
    const sameTeam = relation.isTeammate;
    const user = publicUser(target);
    const roleTitle = user.roleTitle;
    const canSeeRole =
      isSelf || roleTitle === TEAM_ROLE.MEMBER || sameTeam;
    const canSeeStats = isSelf || Number(settings.showCurrentStats) === 1;

    let stats = null;
    if (canSeeStats) {
      const playerState = await ensureUserPlayerState(targetId);
      const latest = await get(
        `
        SELECT totalPoints, logDate, updatedAt
        FROM daily_logs
        WHERE userId = ?
        ORDER BY logDate DESC
        LIMIT 1
        `,
        [targetId]
      );
      stats = {
        playerState,
        latestDailyXP: latest?.totalPoints || 0,
        latestLogDate: latest?.logDate || null,
        latestUpdatedAt: latest?.updatedAt || null
      };
    }

    res.json({
      person: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        teamName: user.teamName,
        roleTitle: canSeeRole ? roleTitle : "",
        relation,
        showCurrentStats: Number(settings.showCurrentStats) ? 1 : 0,
        stats
      }
    });
  } catch (error) {
    console.error("People profile error:", error.message);
    res.status(500).json({ error: "Failed to load person profile" });
  }
});

app.get("/api/player-state", requireAuth, async (req, res) => {
  try {
    const playerState = await ensureUserPlayerState(req.auth.userId);
    res.json({ playerState });
  } catch (error) {
    res.status(500).json({ error: "Failed to load player state" });
  }
});

app.get("/api/settings", requireAuth, async (req, res) => {
  try {
    res.json({ settings: await getResponseSettings(req.auth.userId) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

app.post("/api/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const before = await getUserSettingsRow(userId);
    const hadMotionBefore = Boolean(
      (before.motionApiKey || GLOBAL_MOTION_API_KEY) &&
        (before.motionProjectId || GLOBAL_MOTION_PROJECT_ID)
    );

    await writeSettingsPatch(req.auth.userId, {
      timezone: req.body?.timezone,
      defaultDialGoal: req.body?.defaultDialGoal,
      defaultDailyAppointmentGoal: req.body?.defaultDailyAppointmentGoal,
      defaultWeeklyAppointmentGoal: req.body?.defaultWeeklyAppointmentGoal,
      showCurrentStats: req.body?.showCurrentStats,
      motionApiKey: req.body?.motionApiKey,
      motionProjectId: req.body?.motionProjectId
    });
    const after = await getUserSettingsRow(userId);
    const hasMotionAfter = Boolean(
      (after.motionApiKey || GLOBAL_MOTION_API_KEY) &&
        (after.motionProjectId || GLOBAL_MOTION_PROJECT_ID)
    );

    let backfill = null;
    const shouldBackfill =
      hasMotionAfter &&
      (req.body?.motionApiKey !== undefined ||
        req.body?.motionProjectId !== undefined ||
        !hadMotionBefore);
    if (shouldBackfill) {
      await queueUserLogsForMotionSync(userId);
      const total = await get(
        "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ?",
        [userId]
      );
      backfill = {
        started: true,
        queuedLogs: total?.count || 0
      };
      setImmediate(() => {
        backfillUserMotionHistory(userId).catch((error) => {
          console.error("Motion history backfill error:", error.message);
        });
      });
    }

    res.json({
      message: "Settings saved",
      settings: await getResponseSettings(userId),
      backfill
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const rows = await all(
      `
      SELECT
        id, logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders,
        applications, deliveries, referrals, dials, dialGoal, dialGoalHit, fycTarget,
        fycCompleted, fycNotes, totalPoints, dialToContactRatio, motionTaskId,
        motionSyncStatus, motionSyncAttempts, motionLastError, saveRevision, updatedAt
      FROM daily_logs
      WHERE userId = ?
      ORDER BY logDate DESC
      `,
      [userId]
    );
    const pending = await get(
      "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'pending'",
      [userId]
    );
    const failed = await get(
      "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'failed'",
      [userId]
    );
    res.json({
      logs: rows.map(decorateLog),
      playerState: await ensureUserPlayerState(userId),
      settings: await getResponseSettings(userId),
      motion: {
        pendingSyncCount: pending?.count || 0,
        failedSyncCount: failed?.count || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const dbCheck = await get("SELECT 1 AS ok");
    const pending = await get("SELECT COUNT(1) AS count FROM daily_logs WHERE motionSyncStatus = 'pending'");
    const failed = await get("SELECT COUNT(1) AS count FROM daily_logs WHERE motionSyncStatus = 'failed'");
    const pendingCount = pending?.count || 0;
    const failedCount = failed?.count || 0;
    const alerts = {
      motionPendingHigh: pendingCount >= MOTION_ALERT_PENDING_THRESHOLD,
      motionFailedHigh: failedCount >= MOTION_ALERT_FAILED_THRESHOLD
    };
    const status = alerts.motionPendingHigh || alerts.motionFailedHigh ? "warn" : "ok";
    res.json({
      status,
      time: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      timezone: APP_TIMEZONE,
      db: dbCheck?.ok === 1 ? "ok" : "degraded",
      motion: {
        pendingSyncCount: pendingCount,
        failedSyncCount: failedCount
      },
      alerts,
      backup: {
        dir: BACKUP_DIR,
        lastBackupDay
      }
    });
  } catch {
    res.status(500).json({ status: "error", time: new Date().toISOString(), error: "Health check failed" });
  }
});

app.get("/api/export", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const logs = await all("SELECT * FROM daily_logs WHERE userId = ? ORDER BY logDate ASC", [userId]);
    const sessions = await all(
      `
      SELECT DISTINCT s.*
      FROM activity_sessions s
      INNER JOIN activity_session_participants p ON p.sessionId = s.id
      WHERE p.userId = ?
      ORDER BY s.startedAt ASC
      `,
      [userId]
    );
    const participants = await all(
      `
      SELECT p.*
      FROM activity_session_participants p
      INNER JOIN activity_sessions s ON s.id = p.sessionId
      INNER JOIN activity_session_participants me ON me.sessionId = s.id AND me.userId = ?
      `,
      [userId]
    );
    const scores = await all(
      `
      SELECT sc.*
      FROM activity_session_scores sc
      INNER JOIN activity_sessions s ON s.id = sc.sessionId
      INNER JOIN activity_session_participants me ON me.sessionId = s.id AND me.userId = ?
      `,
      [userId]
    );
    res.json({
      exportedAt: new Date().toISOString(),
      timezone: APP_TIMEZONE,
      logs,
      activity: {
        sessions,
        participants,
        scores
      },
      playerState: await ensureUserPlayerState(userId),
      settings: await getResponseSettings(userId)
    });
  } catch {
    res.status(500).json({ error: "Export failed" });
  }
});

app.post("/api/motion/retry", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const pendingRows = await all(
      `
      SELECT id
      FROM daily_logs
      WHERE userId = ? AND motionSyncStatus = 'pending' AND motionSyncAttempts < ?
      ORDER BY updatedAt ASC
      LIMIT ?
      `,
      [userId, MOTION_RETRY_MAX_ATTEMPTS, MOTION_RETRY_BATCH_SIZE]
    );
    for (const row of pendingRows) {
      await syncMotionForLogId(row.id);
    }
    const pending = await get(
      "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'pending'",
      [userId]
    );
    const failed = await get(
      "SELECT COUNT(1) AS count FROM daily_logs WHERE userId = ? AND motionSyncStatus = 'failed'",
      [userId]
    );
    res.json({
      message: "Motion retry run complete",
      motion: { pendingSyncCount: pending?.count || 0, failedSyncCount: failed?.count || 0 }
    });
  } catch {
    res.status(500).json({ error: "Motion retry failed" });
  }
});

app.get("/api/analytics", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const metric = String(req.query.metric || "").trim();
    if (!METRIC_KEYS.includes(metric)) {
      res.status(400).json({ error: "Invalid metric" });
      return;
    }
    const settings = await getUserSettingsRow(userId);
    const today = getIsoDateInTimeZone(settings.timezone || APP_TIMEZONE);
    const range = getPeriodRange(String(req.query.period || "7d"), today, req.query.from, req.query.to);
    const rows = await all(
      `
      SELECT logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders, applications, deliveries, referrals
      FROM daily_logs
      WHERE userId = ? AND logDate BETWEEN ? AND ?
      ORDER BY logDate ASC
      `,
      [userId, range.from, range.to]
    );
    res.json({
      metric,
      period: String(req.query.period || "7d"),
      range,
      line: rows.map((row) => ({ logDate: row.logDate, value: row[metric] })),
      bar: rows.map((row) => ({ logDate: row.logDate, points: row[metric] * POINTS[metric] })),
      donut: METRIC_KEYS.map((key) => ({
        metric: key,
        points: rows.reduce((sum, row) => sum + row[key] * POINTS[key], 0)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

app.post("/api/log", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const log = normalizePayload(req.body);
    const dateError = validateLogDate(log.logDate);
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }
    const stats = calculateStats(log);
    const existing = await get(
      "SELECT id, totalPoints FROM daily_logs WHERE userId = ? AND logDate = ?",
      [userId, log.logDate]
    );
    const saveKind = existing ? "update" : "new_day";
    const previousPoints = existing?.totalPoints || 0;
    const earnedXPDelta = stats.totalPoints - previousPoints;

    await run("BEGIN IMMEDIATE TRANSACTION");
    let playerBefore;
    try {
      playerBefore = await ensureUserPlayerState(userId);
      if (existing) {
        await run(
          `
          UPDATE daily_logs
          SET
            phoneContacts = ?, appointmentsSet = ?, newNames = ?, completedFactFinders = ?,
            applications = ?, deliveries = ?, referrals = ?, dials = ?, dialGoal = ?,
            dialGoalHit = ?, fycTarget = ?, fycCompleted = ?, fycNotes = ?, totalPoints = ?,
            dialToContactRatio = ?, motionSyncStatus = 'pending', motionSyncAttempts = 0,
            motionLastError = '', saveRevision = COALESCE(saveRevision, 0) + 1,
            updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [
            log.phoneContacts, log.appointmentsSet, log.newNames, log.completedFactFinders,
            log.applications, log.deliveries, log.referrals, log.dials, log.dialGoal,
            stats.dialGoalHit ? 1 : 0, log.fycTarget, log.fycCompleted, log.fycNotes,
            stats.totalPoints, stats.dialToContactRatio, existing.id
          ]
        );
      } else {
        await run(
          `
          INSERT INTO daily_logs (
            userId, logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders,
            applications, deliveries, referrals, dials, dialGoal, dialGoalHit, fycTarget,
            fycCompleted, fycNotes, totalPoints, dialToContactRatio, motionSyncStatus,
            motionSyncAttempts, motionLastError, saveRevision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId, log.logDate, log.phoneContacts, log.appointmentsSet, log.newNames,
            log.completedFactFinders, log.applications, log.deliveries, log.referrals, log.dials,
            log.dialGoal, stats.dialGoalHit ? 1 : 0, log.fycTarget, log.fycCompleted,
            log.fycNotes, stats.totalPoints, stats.dialToContactRatio, "pending", 0, "", 1
          ]
        );
      }

      await writeSettingsPatch(userId, { defaultDialGoal: log.dialGoal });
      const xpRow = await get("SELECT COALESCE(SUM(totalPoints), 0) AS lifetimeXP FROM daily_logs WHERE userId = ?", [userId]);
      const playerAfter = derivePlayerStateFromLifetime(xpRow?.lifetimeXP || 0);
      await writeUserPlayerState(userId, playerAfter);
      await run("COMMIT");

      const saved = await get(
        `
        SELECT
          id, logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders, applications,
          deliveries, referrals, dials, dialGoal, dialGoalHit, fycTarget, fycCompleted, fycNotes,
          totalPoints, dialToContactRatio, motionTaskId, motionSyncStatus, motionSyncAttempts,
          motionLastError, saveRevision, updatedAt
        FROM daily_logs
        WHERE userId = ? AND logDate = ?
        `,
        [userId, log.logDate]
      );

      try {
        await applyActivityScoreDelta(userId, earnedXPDelta);
      } catch (activityScoreError) {
        console.error("Activity score update error:", activityScoreError.message);
      }

      const motionResult = await syncMotionForLogId(saved.id);
      const refreshed = await get(
        `
        SELECT
          id, logDate, phoneContacts, appointmentsSet, newNames, completedFactFinders, applications,
          deliveries, referrals, dials, dialGoal, dialGoalHit, fycTarget, fycCompleted, fycNotes,
          totalPoints, dialToContactRatio, motionTaskId, motionSyncStatus, motionSyncAttempts,
          motionLastError, saveRevision, updatedAt
        FROM daily_logs
        WHERE id = ?
        `,
        [saved.id]
      );

      res.json({
        message: "Log saved",
        log: decorateLog(refreshed),
        playerState: playerAfter,
        settings: await getResponseSettings(userId),
        levelUp: {
          occurred: Math.max(0, playerAfter.level - playerBefore.level) > 0,
          levelsGained: Math.max(0, playerAfter.level - playerBefore.level)
        },
        saveKind,
        earnedXP: stats.totalPoints,
        earnedXPDelta,
        motion: {
          motionTaskId: refreshed.motionTaskId || null,
          skipped: motionResult.skipped,
          reason: motionResult.reason || null,
          action: motionResult.action || null
        }
      });
    } catch (transactionError) {
      await run("ROLLBACK");
      throw transactionError;
    }
  } catch (error) {
    console.error("Save log error:", error.message);
    res.status(500).json({ error: "Failed to save log" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

function startMotionRetryWorker() {
  if (motionRetryTimer) return;
  motionRetryTimer = setInterval(() => {
    retryPendingMotionSync();
  }, MOTION_RETRY_INTERVAL_MS);
}

function stopMotionRetryWorker() {
  if (!motionRetryTimer) return;
  clearInterval(motionRetryTimer);
  motionRetryTimer = null;
}

function startBackupWorker() {
  if (backupTimer) return;
  backupTimer = setInterval(() => {
    maybeRunNightlyBackup("interval");
  }, BACKUP_CHECK_INTERVAL_MS);
}

function stopBackupWorker() {
  if (!backupTimer) return;
  clearInterval(backupTimer);
  backupTimer = null;
}

initDb()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      startMotionRetryWorker();
      retryPendingMotionSync();
      startBackupWorker();
      maybeRunNightlyBackup("startup");
    });
    const shutdown = () => {
      stopMotionRetryWorker();
      stopBackupWorker();
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((error) => {
    console.error("DB init failed:", error.message);
    process.exit(1);
  });
