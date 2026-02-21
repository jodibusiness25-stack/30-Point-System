const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "tracker.sqlite");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function ensureTeamsTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(
    `
    INSERT OR IGNORE INTO teams (id, name, slug)
    VALUES (1, 'Stakks Unit', 'stakks-unit')
    `
  );
}

async function ensureUsersTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      displayName TEXT NOT NULL DEFAULT '',
      teamId INTEGER NOT NULL DEFAULT 1,
      roleTitle TEXT NOT NULL DEFAULT '',
      passwordHash TEXT NOT NULL DEFAULT '',
      isLegacy INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    INSERT OR IGNORE INTO users (id, email, passwordHash, isLegacy)
    VALUES (1, 'legacy@local', '', 1)
  `);

  const columns = await all("PRAGMA table_info(users)");
  const hasDisplayName = columns.some((col) => col.name === "displayName");
  if (!hasDisplayName) {
    await run("ALTER TABLE users ADD COLUMN displayName TEXT NOT NULL DEFAULT ''");
  }
  const hasTeamId = columns.some((col) => col.name === "teamId");
  if (!hasTeamId) {
    await run("ALTER TABLE users ADD COLUMN teamId INTEGER NOT NULL DEFAULT 1");
  }
  const hasRoleTitle = columns.some((col) => col.name === "roleTitle");
  if (!hasRoleTitle) {
    await run("ALTER TABLE users ADD COLUMN roleTitle TEXT NOT NULL DEFAULT ''");
  }
  await run(`
    UPDATE users
    SET displayName = CASE
      WHEN isLegacy = 1 THEN 'Legacy User'
      WHEN TRIM(displayName) = '' THEN SUBSTR(email, 1, INSTR(email, '@') - 1)
      ELSE displayName
    END
    WHERE displayName IS NULL OR TRIM(displayName) = ''
  `);
  await run("UPDATE users SET teamId = 1 WHERE teamId IS NULL OR teamId <= 0");
  await run(`
    UPDATE users
    SET roleTitle = 'Team Lead'
    WHERE id = (
      SELECT id
      FROM users
      WHERE isLegacy = 0
      ORDER BY datetime(createdAt) ASC, id ASC
      LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM users WHERE isLegacy = 0 AND roleTitle = 'Team Lead'
    )
  `);
  await run(`
    UPDATE users
    SET roleTitle = 'Member'
    WHERE isLegacy = 0 AND (roleTitle IS NULL OR TRIM(roleTitle) = '')
  `);
}

async function createDailyLogsTableV2IfNeeded() {
  const columns = await all("PRAGMA table_info(daily_logs)");
  const hasDailyLogs = columns.length > 0;
  const hasUserId = columns.some((col) => col.name === "userId");

  if (!hasDailyLogs) {
    await run(`
      CREATE TABLE daily_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        logDate TEXT NOT NULL,
        phoneContacts INTEGER NOT NULL DEFAULT 0,
        appointmentsSet INTEGER NOT NULL DEFAULT 0,
        newNames INTEGER NOT NULL DEFAULT 0,
        completedFactFinders INTEGER NOT NULL DEFAULT 0,
        applications INTEGER NOT NULL DEFAULT 0,
        deliveries INTEGER NOT NULL DEFAULT 0,
        referrals INTEGER NOT NULL DEFAULT 0,
        dials INTEGER NOT NULL DEFAULT 0,
        dialGoal INTEGER NOT NULL DEFAULT 0,
        dialGoalHit INTEGER NOT NULL DEFAULT 0,
        fycTarget INTEGER NOT NULL DEFAULT 0,
        fycCompleted INTEGER NOT NULL DEFAULT 0,
        fycNotes TEXT NOT NULL DEFAULT '',
        totalPoints INTEGER NOT NULL DEFAULT 0,
        dialToContactRatio REAL,
        motionTaskId TEXT,
        motionSyncStatus TEXT NOT NULL DEFAULT 'pending',
        motionSyncAttempts INTEGER NOT NULL DEFAULT 0,
        motionLastError TEXT NOT NULL DEFAULT '',
        saveRevision INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, logDate)
      )
    `);
    return;
  }

  if (hasUserId) {
    return;
  }

  await run(`
    CREATE TABLE daily_logs_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      logDate TEXT NOT NULL,
      phoneContacts INTEGER NOT NULL DEFAULT 0,
      appointmentsSet INTEGER NOT NULL DEFAULT 0,
      newNames INTEGER NOT NULL DEFAULT 0,
      completedFactFinders INTEGER NOT NULL DEFAULT 0,
      applications INTEGER NOT NULL DEFAULT 0,
      deliveries INTEGER NOT NULL DEFAULT 0,
      referrals INTEGER NOT NULL DEFAULT 0,
      dials INTEGER NOT NULL DEFAULT 0,
      dialGoal INTEGER NOT NULL DEFAULT 0,
      dialGoalHit INTEGER NOT NULL DEFAULT 0,
      fycTarget INTEGER NOT NULL DEFAULT 0,
      fycCompleted INTEGER NOT NULL DEFAULT 0,
      fycNotes TEXT NOT NULL DEFAULT '',
      totalPoints INTEGER NOT NULL DEFAULT 0,
      dialToContactRatio REAL,
      motionTaskId TEXT,
      motionSyncStatus TEXT NOT NULL DEFAULT 'pending',
      motionSyncAttempts INTEGER NOT NULL DEFAULT 0,
      motionLastError TEXT NOT NULL DEFAULT '',
      saveRevision INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, logDate)
    )
  `);

  await run(`
    INSERT INTO daily_logs_v2 (
      userId,
      logDate,
      phoneContacts,
      appointmentsSet,
      newNames,
      completedFactFinders,
      applications,
      deliveries,
      referrals,
      dials,
      dialGoal,
      dialGoalHit,
      fycTarget,
      fycCompleted,
      fycNotes,
      totalPoints,
      dialToContactRatio,
      motionTaskId,
      motionSyncStatus,
      motionSyncAttempts,
      motionLastError,
      saveRevision,
      createdAt,
      updatedAt
    )
    SELECT
      1,
      logDate,
      phoneContacts,
      appointmentsSet,
      newNames,
      completedFactFinders,
      applications,
      deliveries,
      referrals,
      dials,
      COALESCE(dialGoal, 0),
      COALESCE(dialGoalHit, 0),
      fycTarget,
      fycCompleted,
      fycNotes,
      totalPoints,
      dialToContactRatio,
      motionTaskId,
      COALESCE(motionSyncStatus, CASE WHEN motionTaskId IS NOT NULL THEN 'synced' ELSE 'pending' END),
      COALESCE(motionSyncAttempts, 0),
      COALESCE(motionLastError, ''),
      COALESCE(NULLIF(saveRevision, 0), 1),
      createdAt,
      updatedAt
    FROM daily_logs
  `);

  await run("DROP TABLE daily_logs");
  await run("ALTER TABLE daily_logs_v2 RENAME TO daily_logs");
}

async function ensureUserPlayerStateTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS user_player_state (
      userId INTEGER PRIMARY KEY,
      lifetimeXP INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      levelXP INTEGER NOT NULL DEFAULT 0,
      xpToNext INTEGER NOT NULL DEFAULT 30,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const hasOld = await get(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'player_state'"
  );
  const old = hasOld
    ? await get("SELECT lifetimeXP, level, levelXP, xpToNext FROM player_state WHERE id = 1")
    : null;
  if (old) {
    await run(
      `
      INSERT OR IGNORE INTO user_player_state (userId, lifetimeXP, level, levelXP, xpToNext, updatedAt)
      VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [old.lifetimeXP, old.level, old.levelXP, old.xpToNext]
    );
  } else {
    await run(
      `
      INSERT OR IGNORE INTO user_player_state (userId, lifetimeXP, level, levelXP, xpToNext)
      VALUES (1, 0, 1, 0, 30)
      `
    );
  }
}

async function ensureUserSettingsTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      userId INTEGER PRIMARY KEY,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      defaultDialGoal INTEGER NOT NULL DEFAULT 100,
      defaultDailyAppointmentGoal INTEGER NOT NULL DEFAULT 3,
      defaultWeeklyAppointmentGoal INTEGER NOT NULL DEFAULT 15,
      showCurrentStats INTEGER NOT NULL DEFAULT 1,
      motionApiKey TEXT NOT NULL DEFAULT '',
      motionProjectId TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await all("PRAGMA table_info(user_settings)");
  const hasShowCurrentStats = columns.some((col) => col.name === "showCurrentStats");
  if (!hasShowCurrentStats) {
    await run("ALTER TABLE user_settings ADD COLUMN showCurrentStats INTEGER NOT NULL DEFAULT 1");
  }

  const hasOld = await get(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'"
  );
  const old = hasOld
    ? await get(`
      SELECT
        timezone,
        defaultDialGoal,
        defaultDailyAppointmentGoal,
        defaultWeeklyAppointmentGoal
      FROM app_settings
      WHERE id = 1
    `)
    : null;

  await run(
    `
    INSERT OR IGNORE INTO user_settings (
      userId,
      timezone,
      defaultDialGoal,
      defaultDailyAppointmentGoal,
      defaultWeeklyAppointmentGoal,
      showCurrentStats
    )
    VALUES (1, ?, ?, ?, ?, 1)
    `,
    [
      old?.timezone || "America/New_York",
      old?.defaultDialGoal || 100,
      old?.defaultDailyAppointmentGoal || 3,
      old?.defaultWeeklyAppointmentGoal || 15
    ]
  );
}

async function ensureFriendAndActivityTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromUserId INTEGER NOT NULL,
      toUserId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      respondedAt TEXT,
      UNIQUE(fromUserId, toUserId)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ownerUserId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      startDate TEXT NOT NULL,
      startedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      endedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_session_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      joinedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      leftAt TEXT,
      UNIQUE(sessionId, userId)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_session_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      fromUserId INTEGER NOT NULL,
      toUserId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      respondedAt TEXT,
      UNIQUE(sessionId, toUserId)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_session_scores (
      sessionId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sessionId, userId)
    )
  `);
}

async function ensurePasswordResetTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAtMs INTEGER NOT NULL,
      usedAtMs INTEGER,
      requestIp TEXT NOT NULL DEFAULT '',
      requestUserAgent TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function initDb() {
  await run("PRAGMA journal_mode = WAL");
  await run("PRAGMA synchronous = NORMAL");
  await run("PRAGMA busy_timeout = 5000");

  await ensureTeamsTable();
  await ensureUsersTable();
  await createDailyLogsTableV2IfNeeded();
  await ensureUserPlayerStateTable();
  await ensureUserSettingsTable();
  await ensureFriendAndActivityTables();
  await ensurePasswordResetTable();

  await run(
    "CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(userId, logDate DESC)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_daily_logs_user_motion ON daily_logs(userId, motionSyncStatus, logDate)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests(toUserId, status, createdAt DESC)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_activity_sessions_owner_status ON activity_sessions(ownerUserId, status, startedAt DESC)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_activity_participants_user ON activity_session_participants(userId, sessionId)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_activity_invites_to_status ON activity_session_invites(toUserId, status, createdAt DESC)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_password_resets_user_created ON password_reset_tokens(userId, createdAt DESC)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_reset_tokens(expiresAtMs, usedAtMs)"
  );
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
