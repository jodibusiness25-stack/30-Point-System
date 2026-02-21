const API_BASE_URL = window.location.origin;
const DAILY_GOAL_XP = 30;
const METRICS = [
  { key: "phoneContacts", label: "Phone Contacts", points: 1 },
  { key: "appointmentsSet", label: "Appointments Set", points: 2 },
  { key: "newNames", label: "New Names", points: 2 },
  { key: "completedFactFinders", label: "Completed Fact Finders", points: 2 },
  { key: "applications", label: "Applications", points: 3 },
  { key: "deliveries", label: "Deliveries", points: 5 },
  { key: "referrals", label: "Referrals", points: 3 }
];

const state = {
  history: [],
  playerState: { lifetimeXP: 0, level: 1, levelXP: 0, xpToNext: 30 },
  settings: {
    timezone: "America/New_York",
    defaultDialGoal: 100,
    defaultDailyAppointmentGoal: 3,
    defaultWeeklyAppointmentGoal: 15,
    today: null
  },
  motion: { pendingSyncCount: 0, failedSyncCount: 0 },
  drawerMetric: null,
  drawerPeriod: "7d",
  displayedXP: 0,
  xpAnimFrame: null,
  isDirty: false,
  isSaving: false,
  hasPendingAutosave: false,
  autosaveTimer: null,
  autosaveIntervalId: null,
  crossDeviceSyncIntervalId: null,
  dayRolloverIntervalId: null,
  currentTimezoneDate: null,
  rolloverInProgress: false,
  greetingIntervalId: null,
  activityLiveIntervalId: null,
  activityTimerIntervalId: null,
  activity: {
    activeSession: null,
    incomingInvites: [],
    teammates: { friends: [], incomingRequests: [], outgoingRequests: [] },
    selectedConnectionUserId: null,
    sessions: [],
    byDate: {},
    leaderboardRanks: {}
  },
  calendar: { year: null, month: null, selectedDate: null },
  calculator: { history: [] },
  auth: { token: null, user: null },
  profile: null,
  layout: { editMode: false, order: [], heights: {} },
  dashboardInitialized: false
};
const DRAFT_STORAGE_KEY = "daily_activity_tracker_draft_v1";
const CALC_HISTORY_KEY = "dashboard_calc_history_v1";
const AUTH_TOKEN_KEY = "dashboard_auth_token_v1";
const STARTUP_SEEN_KEY = "dashboard_startup_seen_v1";
const WIDGET_LAYOUT_KEY = "dashboard_widget_layout_v1";

const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authForm = document.getElementById("authForm");
const authDisplayName = document.getElementById("authDisplayName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const layoutEditBtn = document.getElementById("layoutEditBtn");
const profileChip = document.getElementById("profileChip");
const profileChipInitials = document.getElementById("profileChipInitials");
const profileChipName = document.getElementById("profileChipName");
const profileChipRole = document.getElementById("profileChipRole");
const profileBtn = document.getElementById("profileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const startupSplash = document.getElementById("startupSplash");
const form = document.getElementById("logForm");
const metricGrid = document.getElementById("metricGrid");
const dateInput = document.getElementById("logDate");
const totalXPEl = document.getElementById("totalXP");
const lifetimeXPEl = document.getElementById("lifetimeXP");
const levelLabelEl = document.getElementById("levelLabel");
const pointsPieEl = document.getElementById("pointsPie");
const ratioDisplayEl = document.getElementById("ratioDisplay");
const messageEl = document.getElementById("message");
const motionSyncBadgeEl = document.getElementById("motionSyncBadge");
const autosaveBadgeEl = document.getElementById("autosaveBadge");
const greetingTextEl = document.getElementById("greetingText");
const teamBrandEl = document.getElementById("teamBrand");
const teamLeadMiniEl = document.getElementById("teamLeadMini");
const dailyProgressFillEl = document.getElementById("dailyProgressFill");
const levelProgressFillEl = document.getElementById("levelProgressFill");
const levelProgressTextEl = document.getElementById("levelProgressText");
const strataContainerEl = document.getElementById("strataContainer");
const dialStrataContainerEl = document.getElementById("dialStrataContainer");
const dialGoalFillEl = document.getElementById("dialGoalFill");
const dialGoalStatusEl = document.getElementById("dialGoalStatus");
const dialGoalMetaEl = document.getElementById("dialGoalMeta");
const apptDailyStatusEl = document.getElementById("apptDailyStatus");
const apptDailyMetaEl = document.getElementById("apptDailyMeta");
const apptDailyFillEl = document.getElementById("apptDailyFill");
const apptWeeklyStatusEl = document.getElementById("apptWeeklyStatus");
const apptWeeklyMetaEl = document.getElementById("apptWeeklyMeta");
const apptWeeklyFillEl = document.getElementById("apptWeeklyFill");
const levelToastAnchorEl = document.getElementById("levelToastAnchor");
const levelShimmerEl = document.getElementById("levelShimmer");
const historyCard = document.getElementById("historyCard");
const historyBody = document.querySelector("#historyTable tbody");
const historyBtn = document.getElementById("historyBtn");
const sessionsBtn = document.getElementById("sessionsBtn");
const sessionsHistoryCard = document.getElementById("sessionsHistoryCard");
const sessionsTableBody = document.querySelector("#sessionsTable tbody");
const activityWidget = document.getElementById("activityWidget");
const activityModeLabel = document.getElementById("activityModeLabel");
const startSessionBtn = document.getElementById("startSessionBtn");
const incomingInvitesEl = document.getElementById("incomingInvites");
const friendRequestsEl = document.getElementById("friendRequests");
const friendEmailInput = document.getElementById("friendEmailInput");
const sendFriendRequestBtn = document.getElementById("sendFriendRequestBtn");
const networkListEl = document.getElementById("networkList");
const networkPreviewEl = document.getElementById("networkPreview");
const activeSessionPanel = document.getElementById("activeSessionPanel");
const activeSessionNameEl = document.getElementById("activeSessionName");
const activeSessionTimerEl = document.getElementById("activeSessionTimer");
const activeSessionOwnerTagEl = document.getElementById("activeSessionOwnerTag");
const activeSessionStartTimeEl = document.getElementById("activeSessionStartTime");
const inviteFriendSelect = document.getElementById("inviteFriendSelect");
const inviteFriendBtn = document.getElementById("inviteFriendBtn");
const leaveSessionBtn = document.getElementById("leaveSessionBtn");
const stopSessionBtn = document.getElementById("stopSessionBtn");
const sessionParticipantsList = document.getElementById("sessionParticipantsList");
const sessionLeaderboardList = document.getElementById("sessionLeaderboardList");
const activityMessageEl = document.getElementById("activityMessage");
const calcFab = document.getElementById("calcFab");
const calcPanel = document.getElementById("calcPanel");
const calcCloseBtn = document.getElementById("calcCloseBtn");
const calcDisplay = document.getElementById("calcDisplay");
const calcEqualsBtn = document.getElementById("calcEqualsBtn");
const calcClearBtn = document.getElementById("calcClearBtn");
const calcHistoryEl = document.getElementById("calcHistory");
const calendarGridEl = document.getElementById("calendarGrid");
const calendarMonthLabelEl = document.getElementById("calendarMonthLabel");
const calendarDetailEl = document.getElementById("calendarDetail");
const calendarSessionsDetailEl = document.getElementById("calendarSessionsDetail");
const calendarPrevBtn = document.getElementById("calendarPrevBtn");
const calendarNextBtn = document.getElementById("calendarNextBtn");
const calendarTodayBtn = document.getElementById("calendarTodayBtn");
const resetBtn = document.getElementById("resetBtn");
const darkToggle = document.getElementById("darkToggle");
const compactToggle = document.getElementById("compactToggle");
const drawer = document.getElementById("metricDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerTitle = document.getElementById("drawerTitle");
const drawerSub = document.getElementById("drawerSub");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");
const periodButtons = Array.from(document.querySelectorAll(".period-btn"));
const customRangeWrap = document.getElementById("customRangeWrap");
const customFromInput = document.getElementById("customFrom");
const customToInput = document.getElementById("customTo");
const applyCustomBtn = document.getElementById("applyCustomBtn");
const profileDrawer = document.getElementById("profileDrawer");
const profileBackdrop = document.getElementById("profileBackdrop");
const profileCloseBtn = document.getElementById("profileCloseBtn");
const profileSaveBtn = document.getElementById("profileSaveBtn");
const profileRetryMotionBtn = document.getElementById("profileRetryMotionBtn");
const profileExportBtn = document.getElementById("profileExportBtn");
const profileSummaryTextEl = document.getElementById("profileSummaryText");
const profileDisplayNameEl = document.getElementById("profileDisplayName");
const profileEmailEl = document.getElementById("profileEmail");
const profileTeamLineEl = document.getElementById("profileTeamLine");
const profileRoleLineEl = document.getElementById("profileRoleLine");
const profileJoinedAtEl = document.getElementById("profileJoinedAt");
const profileLevelLineEl = document.getElementById("profileLevelLine");
const profileLifetimeLineEl = document.getElementById("profileLifetimeLine");
const profileTimezoneEl = document.getElementById("profileTimezone");
const profileDialGoalEl = document.getElementById("profileDialGoal");
const profileDailyApptGoalEl = document.getElementById("profileDailyApptGoal");
const profileWeeklyApptGoalEl = document.getElementById("profileWeeklyApptGoal");
const profileShowStatsEl = document.getElementById("profileShowStats");
const profileMotionApiKeyEl = document.getElementById("profileMotionApiKey");
const profileMotionProjectIdEl = document.getElementById("profileMotionProjectId");
const profileDashboardStatsEl = document.getElementById("profileDashboardStats");
const profileMessageEl = document.getElementById("profileMessage");
const teamLeadSlotEl = document.getElementById("teamLeadSlot");
const teamPartnerSlotEl = document.getElementById("teamPartnerSlot");
const teamRoleManagerEl = document.getElementById("teamRoleManager");
const assignRoleEmailEl = document.getElementById("assignRoleEmail");
const assignRoleSelectEl = document.getElementById("assignRoleSelect");
const assignRoleBtn = document.getElementById("assignRoleBtn");
const createTeamNameEl = document.getElementById("createTeamName");
const createTeamBtn = document.getElementById("createTeamBtn");
const teamLeadAddMemberEl = document.getElementById("teamLeadAddMember");
const addMemberEmailEl = document.getElementById("addMemberEmail");
const addMemberBtn = document.getElementById("addMemberBtn");
const chartManager = window.DashboardCharts.createManager();
let draggedWidgetId = null;
let layoutResizeObserver = null;

const canvasMap = {
  line: document.getElementById("lineChart"),
  bar: document.getElementById("barChart"),
  donut: document.getElementById("donutChart")
};

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.auth.token) {
    headers.Authorization = `Bearer ${state.auth.token}`;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 401 && state.auth.token) {
    setAuth(null, null);
  }
  return { response, data };
}

function todayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoDateInTimeZone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return todayISODate();
  return `${year}-${month}-${day}`;
}

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

function metricByKey(key) {
  return METRICS.find((item) => item.key === key);
}

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function showActivityMessage(text, isError = false) {
  if (!activityMessageEl) return;
  activityMessageEl.textContent = text;
  activityMessageEl.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showAuthMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.classList.toggle("error", isError);
}

function applyAuthView() {
  const authed = Boolean(state.auth.token);
  authGate.classList.toggle("hidden", authed);
  appShell.classList.toggle("hidden", !authed);
}

function setAuth(token, user) {
  state.auth.token = token || null;
  state.auth.user = user || null;
  state.profile = null;
  if (state.auth.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, state.auth.token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  applyAuthView();
  updateProfileChip();
  updateTeamBrand();
}

function nameToInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function updateProfileChip() {
  const name = String(state.auth.user?.displayName || "User").trim() || "User";
  if (profileChipName) profileChipName.textContent = name;
  if (profileChipInitials) profileChipInitials.textContent = nameToInitials(name);
  const roleTitle = String(state.auth.user?.roleTitle || "").trim();
  if (profileChipRole) {
    profileChipRole.textContent = roleTitle || "";
    profileChipRole.classList.toggle("hidden", !roleTitle);
  }
}

function updateTeamBrand() {
  const teamName = String(state.auth.user?.teamName || "Stakks Unit").trim() || "Stakks Unit";
  if (teamBrandEl) {
    teamBrandEl.textContent = teamName;
    teamBrandEl.setAttribute("aria-label", teamName);
  }
  const role = String(state.auth.user?.roleTitle || "").trim();
  const teamSlug = String(state.auth.user?.teamSlug || "");
  const shouldShowMini = role === "Team Lead" && teamSlug === "stakks-unit";
  if (teamLeadMiniEl) {
    teamLeadMiniEl.classList.toggle("hidden", !shouldShowMini);
  }
}

async function authLoginOrRegister(mode) {
  const email = String(authEmail.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  const displayName = String(authDisplayName?.value || "").trim();
  if (!email || !password) {
    showAuthMessage("Email and password are required.", true);
    return;
  }
  try {
    const body = { email, password };
    if (mode === "register") {
      body.displayName = displayName;
    }
    const { response, data } = await apiFetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(data?.error || `${mode} failed`);
    setAuth(data.token, data.user);
    showAuthMessage("");
    await bootstrapDashboard();
  } catch (error) {
    showAuthMessage(error.message || "Authentication failed", true);
  }
}

async function verifyAuthToken() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    setAuth(null, null);
    return false;
  }
  setAuth(token, null);
  const { response, data } = await apiFetch("/api/auth/me");
  if (!response.ok) {
    setAuth(null, null);
    return false;
  }
  state.auth.user = data.user;
  return true;
}

function setupAuthEvents() {
  loginBtn.addEventListener("click", () => authLoginOrRegister("login"));
  registerBtn.addEventListener("click", () => authLoginOrRegister("register"));
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    authLoginOrRegister("login");
  });
  logoutBtn.addEventListener("click", () => {
    setAuth(null, null);
    closeProfileDrawer();
    state.history = [];
    state.activity.activeSession = null;
    state.activity.sessions = [];
    state.activity.byDate = {};
    state.activity.incomingInvites = [];
    state.isDirty = false;
    if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
    if (state.autosaveIntervalId) {
      clearInterval(state.autosaveIntervalId);
      state.autosaveIntervalId = null;
    }
    if (state.greetingIntervalId) {
      clearInterval(state.greetingIntervalId);
      state.greetingIntervalId = null;
    }
    if (state.dayRolloverIntervalId) {
      clearInterval(state.dayRolloverIntervalId);
      state.dayRolloverIntervalId = null;
    }
    if (state.crossDeviceSyncIntervalId) {
      clearInterval(state.crossDeviceSyncIntervalId);
      state.crossDeviceSyncIntervalId = null;
    }
    if (state.activityLiveIntervalId) {
      clearInterval(state.activityLiveIntervalId);
      state.activityLiveIntervalId = null;
    }
    if (state.activityTimerIntervalId) {
      clearInterval(state.activityTimerIntervalId);
      state.activityTimerIntervalId = null;
    }
    updateActivityModeClass();
    renderActivityWidget();
    renderSessionHistory();
    showMessage("");
    showAuthMessage("Signed out.");
  });
}

function updateAutosaveBadge(text, tone = "idle") {
  autosaveBadgeEl.classList.remove("pending", "failed", "saving");
  if (tone === "pending") autosaveBadgeEl.classList.add("pending");
  if (tone === "failed") autosaveBadgeEl.classList.add("failed");
  if (tone === "saving") autosaveBadgeEl.classList.add("saving");
  autosaveBadgeEl.textContent = text;
}

function updateMotionSyncBadge() {
  const pending = Number(state.motion.pendingSyncCount || 0);
  const failed = Number(state.motion.failedSyncCount || 0);
  motionSyncBadgeEl.classList.remove("pending", "failed");
  if (failed > 0) {
    motionSyncBadgeEl.classList.add("failed");
    motionSyncBadgeEl.textContent = `Motion Sync: ${failed} failed`;
    return;
  }
  if (pending > 0) {
    motionSyncBadgeEl.classList.add("pending");
    motionSyncBadgeEl.textContent = `Motion Sync: ${pending} pending`;
  } else {
    motionSyncBadgeEl.textContent = "Motion Sync: OK";
  }
}

function getDaySegment(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 12);
  if (hour < 12) return { greeting: "Good morning", palette: "morning" };
  if (hour < 17) return { greeting: "Good afternoon", palette: "afternoon" };
  if (hour < 22) return { greeting: "Good evening", palette: "evening" };
  return { greeting: "Good night", palette: "night" };
}

function updateGreeting() {
  const timezone = state.settings.timezone || "America/New_York";
  const tone = getDaySegment(timezone);
  const name = String(state.auth.user?.displayName || "").trim();
  const safeName = name || "there";
  updateProfileChip();
  updateTeamBrand();
  greetingTextEl.textContent = `${tone.greeting}, ${safeName} • ${timezone.replace("_", " ")}`;
  document.body.classList.remove(
    "palette-morning",
    "palette-afternoon",
    "palette-evening",
    "palette-night"
  );
  document.body.classList.add(`palette-${tone.palette}`);
}

function getTrackerTodayISO() {
  return isoDateInTimeZone(state.settings.timezone || "America/New_York");
}

async function maybeRunStartupAnimation() {
  const seen = sessionStorage.getItem(STARTUP_SEEN_KEY) === "1";
  if (seen || !startupSplash) return;
  startupSplash.classList.remove("hidden");
  await new Promise((resolve) => {
    setTimeout(resolve, 1650);
  });
  startupSplash.classList.add("hidden");
  sessionStorage.setItem(STARTUP_SEEN_KEY, "1");
}

function applyStoredThemeModes() {
  const dark = localStorage.getItem("theme_dark") === "1";
  const compact = localStorage.getItem("theme_compact") === "1";
  darkToggle.checked = dark;
  compactToggle.checked = compact;
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("compact", compact);
}

function setupThemeModeEvents() {
  darkToggle.addEventListener("change", () => {
    const on = darkToggle.checked;
    localStorage.setItem("theme_dark", on ? "1" : "0");
    document.body.classList.toggle("theme-dark", on);
  });

  compactToggle.addEventListener("change", () => {
    const on = compactToggle.checked;
    localStorage.setItem("theme_compact", on ? "1" : "0");
    document.body.classList.toggle("compact", on);
  });
}

function buildMetricTiles() {
  const dialsTile = `
    <article class="metric-tile dials-tile no-analytics" data-analytics="false">
      <div class="tile-head">
        <span class="tile-title">Dial Tracker</span>
        <span class="tile-chevron">›</span>
      </div>
      <div class="tile-value">
        <strong id="count-dials">0</strong>
        <span class="tile-points" id="points-dials">ratio --</span>
      </div>
      <div class="tile-input dial-input">
        <button type="button" class="step-btn" data-step-target="dials" data-step-dir="-1" aria-label="Decrease Dials">−</button>
        <input type="hidden" id="dials" name="dials" value="0" />
        <button type="button" class="step-btn" data-step-target="dials" data-step-dir="1" aria-label="Increase Dials">+</button>
      </div>
      <svg class="sparkline" viewBox="0 0 100 22" preserveAspectRatio="none" id="spark-dials">
        <path d="M0,11 L100,11"></path>
      </svg>
    </article>
  `;

  const metricTiles = METRICS.map(
    (metric) => `
      <article class="metric-tile" data-metric="${metric.key}" data-analytics="true" role="button" tabindex="0" aria-label="${metric.label} analytics">
        <div class="tile-head">
          <span class="tile-title">${metric.label}</span>
          <span class="tile-chevron">›</span>
        </div>
        <div class="tile-value">
          <strong id="count-${metric.key}">0</strong>
          <span class="tile-points" id="points-${metric.key}">0 pts</span>
        </div>
        <div class="tile-input">
          <button type="button" class="step-btn" data-step-target="${metric.key}" data-step-dir="-1" aria-label="Decrease ${metric.label}">−</button>
          <input type="hidden" id="${metric.key}" name="${metric.key}" value="0" />
          <button type="button" class="step-btn" data-step-target="${metric.key}" data-step-dir="1" aria-label="Increase ${metric.label}">+</button>
        </div>
        <svg class="sparkline" viewBox="0 0 100 22" preserveAspectRatio="none" id="spark-${metric.key}">
          <path d="M0,11 L100,11"></path>
        </svg>
      </article>
    `
  ).join("");

  metricGrid.innerHTML = `${dialsTile}${metricTiles}`;
}

function getFormPayload() {
  const formData = new FormData(form);
  const payload = {
    logDate: formData.get("logDate"),
    dials: toInt(formData.get("dials")),
    dialGoal: toInt(formData.get("dialGoal")),
    fycTarget: toInt(formData.get("fycTarget")),
    fycCompleted: toInt(formData.get("fycCompleted")),
    fycNotes: String(formData.get("fycNotes") || "").trim()
  };
  METRICS.forEach((metric) => {
    payload[metric.key] = toInt(formData.get(metric.key));
  });
  return payload;
}

function weekStartMondayIso(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function parseDateTimeSafe(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  let normalized = raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    normalized = `${raw.replace(" ", "T")}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    normalized = `${raw}T00:00:00Z`;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthName(year, month) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month, 1)));
}

function hasMeaningfulData(payload) {
  const metricSum = METRICS.reduce((sum, metric) => sum + toInt(payload[metric.key]), 0);
  return (
    metricSum > 0 ||
    toInt(payload.dials) > 0 ||
    toInt(payload.fycTarget) > 0 ||
    toInt(payload.fycCompleted) > 0 ||
    String(payload.fycNotes || "").trim().length > 0
  );
}

function saveDraft(payload) {
  try {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() })
    );
  } catch (error) {
    // Ignore storage failures.
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return;
    const fields = [
      "logDate",
      "dials",
      "dialGoal",
      "fycTarget",
      "fycCompleted",
      "fycNotes",
      ...METRICS.map((metric) => metric.key)
    ];
    fields.forEach((field) => {
      const el = document.getElementById(field);
      if (!el || draft[field] === undefined || draft[field] === null) return;
      el.value = String(draft[field]);
    });
  } catch (error) {
    // Ignore malformed drafts.
  }
}

function calculateLiveStats(payload) {
  const metricPoints = {};
  const totalXP = METRICS.reduce((sum, metric) => {
    const points = payload[metric.key] * metric.points;
    metricPoints[metric.key] = points;
    return sum + points;
  }, 0);
  const ratio = payload.phoneContacts > 0 ? payload.dials / payload.phoneContacts : null;
  const dialGoalHit = payload.dialGoal > 0 ? payload.dials >= payload.dialGoal : false;
  return { totalXP, metricPoints, ratio, dialGoalHit };
}

function ratioText(value) {
  return value === null ? "" : value.toFixed(2);
}

function animateXPValue(nextValue) {
  const startValue = state.displayedXP;
  const endValue = Math.max(0, Math.floor(nextValue));
  if (state.xpAnimFrame) {
    cancelAnimationFrame(state.xpAnimFrame);
  }
  if (startValue === endValue) {
    totalXPEl.textContent = String(endValue);
    return;
  }

  const duration = 260;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = 1 - (1 - t) * (1 - t);
    const current = Math.round(startValue + (endValue - startValue) * eased);
    state.displayedXP = current;
    totalXPEl.textContent = String(current);
    if (t < 1) {
      state.xpAnimFrame = requestAnimationFrame(step);
    }
  }

  state.xpAnimFrame = requestAnimationFrame(step);
}

function applyStatus(totalXP) {
  document.body.classList.remove("status-red", "status-yellow", "status-green");
  if (totalXP >= DAILY_GOAL_XP) {
    document.body.classList.add("status-green");
  } else if (totalXP > 0) {
    document.body.classList.add("status-yellow");
  } else {
    document.body.classList.add("status-red");
  }
}

function updatePointsPie(metricPoints, totalXP) {
  if (!pointsPieEl) return;
  if (!totalXP || totalXP <= 0) {
    pointsPieEl.style.background =
      "radial-gradient(circle at center, color-mix(in srgb, var(--card) 96%, var(--bg)) 42%, transparent 43%), conic-gradient(#2f66b8 0deg, #2f66b8 360deg)";
    pointsPieEl.title = "No points yet";
    return;
  }
  const palette = ["#2f66b8", "#34c6b3", "#f3b15a", "#f34f8f", "#7b8fb6", "#49c887", "#a678e2"];
  const entries = METRICS.map((metric, idx) => ({
    label: metric.label,
    value: Math.max(0, Number(metricPoints[metric.key] || 0)),
    color: palette[idx % palette.length]
  })).filter((item) => item.value > 0);
  if (!entries.length) {
    pointsPieEl.title = "No points yet";
    return;
  }

  let cursor = 0;
  const slices = entries
    .map((item) => {
      const start = cursor;
      const sweep = (item.value / totalXP) * 360;
      cursor += sweep;
      return `${item.color} ${start.toFixed(2)}deg ${cursor.toFixed(2)}deg`;
    })
    .join(", ");
  pointsPieEl.style.background =
    `radial-gradient(circle at center, color-mix(in srgb, var(--card) 96%, var(--bg)) 42%, transparent 43%), conic-gradient(${slices})`;
  pointsPieEl.title = entries.map((item) => `${item.label}: ${item.value} pts`).join(" • ");
}

function renderStrata(totalXP) {
  const strataCount = Math.max(0, Math.floor(totalXP / DAILY_GOAL_XP) - 1);
  if (strataCount <= 0) {
    strataContainerEl.innerHTML = "";
    return;
  }
  strataContainerEl.innerHTML = Array.from({ length: strataCount })
    .map((_, idx) => `<div class="strata strata-${idx % 4}"></div>`)
    .join("");
}

function renderDialGoalTracker(payload, stats) {
  const goal = payload.dialGoal;
  if (goal <= 0) {
    dialGoalStatusEl.textContent = "Dial Goal: Not set";
    dialGoalStatusEl.classList.remove("hit", "miss");
    dialGoalMetaEl.textContent = "";
    dialGoalFillEl.style.width = "0%";
    dialStrataContainerEl.innerHTML = "";
    return;
  }

  const pct = Math.max(0, Math.min(100, (payload.dials / goal) * 100));
  const tiers = Math.max(0, Math.floor(payload.dials / goal) - 1);
  dialGoalFillEl.style.width = `${pct}%`;
  dialGoalStatusEl.textContent = stats.dialGoalHit ? "Dial Goal Hit" : "Dial Goal In Progress";
  dialGoalStatusEl.classList.toggle("hit", stats.dialGoalHit);
  dialGoalStatusEl.classList.toggle("miss", !stats.dialGoalHit);
  dialGoalMetaEl.textContent = `${payload.dials} / ${goal}`;
  dialStrataContainerEl.innerHTML = Array.from({ length: tiers })
    .map((_, idx) => `<div class="strata strata-${idx % 4}"></div>`)
    .join("");
}

function renderAppointmentGoalTracker(payload) {
  const dailyGoal = toInt(state.settings.defaultDailyAppointmentGoal);
  const weeklyGoal = toInt(state.settings.defaultWeeklyAppointmentGoal);
  const dailyDone = toInt(payload.appointmentsSet);
  const targetWeek = weekStartMondayIso(payload.logDate || state.settings.today || todayISODate());

  const appointmentByDate = new Map(
    state.history.map((row) => [row.logDate, toInt(row.appointmentsSet)])
  );
  if (payload.logDate) {
    appointmentByDate.set(payload.logDate, dailyDone);
  }

  let weeklyDone = 0;
  appointmentByDate.forEach((value, date) => {
    if (weekStartMondayIso(date) === targetWeek) {
      weeklyDone += toInt(value);
    }
  });

  const dailyPct =
    dailyGoal > 0 ? Math.max(0, Math.min(100, (dailyDone / dailyGoal) * 100)) : 0;
  const weeklyPct =
    weeklyGoal > 0 ? Math.max(0, Math.min(100, (weeklyDone / weeklyGoal) * 100)) : 0;

  apptDailyFillEl.style.width = `${dailyPct}%`;
  apptWeeklyFillEl.style.width = `${weeklyPct}%`;
  apptDailyStatusEl.textContent = `Daily Appointments: ${dailyDone} / ${dailyGoal}`;
  apptWeeklyStatusEl.textContent = `Weekly Appointments: ${weeklyDone} / ${weeklyGoal}`;
  apptDailyMetaEl.textContent = dailyGoal > 0 && dailyDone >= dailyGoal ? "Goal hit" : "In progress";
  apptWeeklyMetaEl.textContent =
    weeklyGoal > 0 && weeklyDone >= weeklyGoal ? "Goal hit" : "In progress";
}

function updateLevelUI() {
  const player = state.playerState;
  lifetimeXPEl.textContent = String(player.lifetimeXP);
  levelLabelEl.textContent = String(player.level);
  levelProgressTextEl.textContent = `Level ${player.level} • ${player.levelXP} / ${player.xpToNext}`;
  const pct = player.xpToNext > 0 ? (player.levelXP / player.xpToNext) * 100 : 0;
  levelProgressFillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function updateLiveUI(options = {}) {
  const markDirty = options.markDirty !== false;
  const payload = getFormPayload();
  const stats = calculateLiveStats(payload);
  animateXPValue(stats.totalXP);
  ratioDisplayEl.textContent = ratioText(stats.ratio);
  if (markDirty) {
    saveDraft(payload);
    state.isDirty = true;
    scheduleAutosave(8000);
  }
  METRICS.forEach((metric) => {
    document.getElementById(`count-${metric.key}`).textContent = String(payload[metric.key]);
    document.getElementById(`points-${metric.key}`).textContent = `${stats.metricPoints[metric.key]} pts`;
  });
  const dialsCountEl = document.getElementById("count-dials");
  const dialsPointsEl = document.getElementById("points-dials");
  if (dialsCountEl) dialsCountEl.textContent = String(payload.dials);
  if (dialsPointsEl) {
    dialsPointsEl.textContent =
      stats.ratio === null ? "ratio --" : `ratio ${stats.ratio.toFixed(2)}x`;
  }
  dailyProgressFillEl.style.width = `${Math.min(100, (stats.totalXP / DAILY_GOAL_XP) * 100)}%`;
  applyStatus(stats.totalXP);
  renderStrata(stats.totalXP);
  updatePointsPie(stats.metricPoints, stats.totalXP);
  renderDialGoalTracker(payload, stats);
  renderAppointmentGoalTracker(payload);
}

function sparklinePath(values) {
  if (!values.length) return "M4,11 L96,11";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStart = 4;
  const xEnd = 96;
  const yTop = 2;
  const yBottom = 20;
  return values
    .map((value, idx) => {
      const x = xStart + (idx / Math.max(1, values.length - 1)) * (xEnd - xStart);
      const y = yBottom - ((value - min) / range) * (yBottom - yTop);
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function recentDaysISO(days) {
  const now = new Date();
  const list = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    list.push(`${y}-${m}-${day}`);
  }
  return list;
}

function updateSparklines() {
  const byDate = new Map(state.history.map((row) => [row.logDate, row]));
  const dates = recentDaysISO(7);
  const dialValues = dates.map((date) => toInt(byDate.get(date)?.dials));
  const dialPath = sparklinePath(dialValues);
  const dialEl = document.querySelector("#spark-dials path");
  if (dialEl) dialEl.setAttribute("d", dialPath);
  METRICS.forEach((metric) => {
    const values = dates.map((date) => toInt(byDate.get(date)?.[metric.key]));
    const path = sparklinePath(values);
    const el = document.querySelector(`#spark-${metric.key} path`);
    if (el) el.setAttribute("d", path);
  });
}

function applyLogToForm(row) {
  if (!row) return;
  METRICS.forEach((metric) => {
    const input = document.getElementById(metric.key);
    if (input) input.value = String(toInt(row[metric.key]));
  });
  const dialsInput = document.getElementById("dials");
  if (dialsInput) dialsInput.value = String(toInt(row.dials));
  const fycTargetInput = document.getElementById("fycTarget");
  if (fycTargetInput) fycTargetInput.value = String(toInt(row.fycTarget));
  const fycCompletedInput = document.getElementById("fycCompleted");
  if (fycCompletedInput) fycCompletedInput.value = String(toInt(row.fycCompleted));
  const fycNotesInput = document.getElementById("fycNotes");
  if (fycNotesInput) fycNotesInput.value = String(row.fycNotes || "");
  const dialGoalInput = document.getElementById("dialGoal");
  if (dialGoalInput) {
    const rowDialGoal = toInt(row.dialGoal);
    dialGoalInput.value = String(
      rowDialGoal > 0 ? rowDialGoal : state.settings.defaultDialGoal ?? 100
    );
  }
}

function applySelectedDateFromHistory() {
  if (!isValidLogDate(dateInput.value)) return;
  const row = state.history.find((item) => item.logDate === dateInput.value);
  if (!row) return;
  applyLogToForm(row);
  updateLiveUI({ markDirty: false });
}

function formatFycCell(row) {
  return `${row.fycCompleted}/${row.fycTarget}${row.fycNotes ? ` (${row.fycNotes})` : ""}`;
}

function renderHistory() {
  if (!state.history.length) {
    historyBody.innerHTML = `<tr><td colspan="12">No logs yet.</td></tr>`;
    return;
  }
  historyBody.innerHTML = state.history
    .map(
      (row) => `
      <tr>
        <td>${row.logDate}</td>
        <td>${row.totalPoints}</td>
        <td>${row.phoneContacts}</td>
        <td>${row.dials}</td>
        <td>${row.dialGoal ?? ""}</td>
        <td>${Number(row.dialGoalHit) ? "Yes" : "No"}</td>
        <td>${row.dialToContactRatio == null ? "" : Number(row.dialToContactRatio).toFixed(2)}</td>
        <td>${formatFycCell(row)}</td>
        <td>${row.weekStartMonday}</td>
        <td>${row.motionSyncStatus || ""}</td>
        <td>${row.saveRevision || ""}</td>
        <td>${row.motionTaskId || ""}</td>
      </tr>
    `
    )
    .join("");
}

function getDayActivity(logDate) {
  const row = state.history.find((item) => item.logDate === logDate);
  if (!row) {
    return { xpPct: 0, dialPct: 0, apptPct: 0, xp: 0, dials: 0, appts: 0 };
  }
  const dialGoal = toInt(row.dialGoal || state.settings.defaultDialGoal || 0);
  const apptGoal = toInt(state.settings.defaultDailyAppointmentGoal || 0);
  const xp = toInt(row.totalPoints);
  const dials = toInt(row.dials);
  const appts = toInt(row.appointmentsSet);
  return {
    xpPct: Math.max(0, Math.min(1, xp / DAILY_GOAL_XP)),
    dialPct: dialGoal > 0 ? Math.max(0, Math.min(1, dials / dialGoal)) : 0,
    apptPct: apptGoal > 0 ? Math.max(0, Math.min(1, appts / apptGoal)) : 0,
    xp,
    dials,
    appts
  };
}

function ringOffset(radius, pct) {
  const circumference = 2 * Math.PI * radius;
  return circumference * (1 - pct);
}

function renderCalendarDetail(logDate) {
  if (!logDate) {
    calendarDetailEl.textContent = "Select a day to view quick activity details.";
    calendarSessionsDetailEl.innerHTML = "";
    return;
  }
  const row = state.history.find((item) => item.logDate === logDate);
  const sessions = state.activity.byDate?.[logDate] || [];
  const sessionSummary = sessions.length
    ? ` • Sessions ${sessions.length}: ${sessions.map((s) => s.name).slice(0, 2).join(", ")}`
    : "";
  if (!row) {
    calendarDetailEl.textContent = `${logDate}: No saved activity yet${sessionSummary}.`;
  } else {
    calendarDetailEl.textContent = `${logDate} • Points ${row.totalPoints}/30 • Dials ${row.dials}/${row.dialGoal || state.settings.defaultDialGoal || 0} • Appointments ${row.appointmentsSet}/${state.settings.defaultDailyAppointmentGoal || 0}${sessionSummary}`;
  }
  if (!sessions.length) {
    calendarSessionsDetailEl.innerHTML = "";
    return;
  }
  calendarSessionsDetailEl.innerHTML = sessions
    .map((session) => {
      const winner = session.leaderboard?.[0];
      const winnerText = winner
        ? `${winner.displayName || winner.email} (${toInt(winner.score)} pts)`
        : "No winner yet";
      const participantsText = (session.participants || [])
        .map((p) => p.displayName || p.email)
        .join(", ");
      return `
        <article class="calendar-session-card">
          <p><strong>${escapeHtml(session.name)}</strong> • ${escapeHtml(session.status)}</p>
          <p>Start: ${escapeHtml(formatDateTimeShort(session.startedAt))} • End: ${escapeHtml(formatDateTimeShort(session.endedAt))}</p>
          <p>Duration: ${formatClockDuration(session.startedAt, session.endedAt)}</p>
          <p>Winner: ${escapeHtml(winnerText)}</p>
          <p>Participants: ${escapeHtml(participantsText || "-")}</p>
        </article>
      `;
    })
    .join("");
}

function renderCalendar() {
  if (state.calendar.year === null || state.calendar.month === null) return;
  const year = state.calendar.year;
  const month = state.calendar.month;
  calendarMonthLabelEl.textContent = monthName(year, month);

  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7;
  const monthDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    let dayNum;
    let cellMonth = month;
    let cellYear = year;
    let outside = false;

    if (i < firstWeekday) {
      outside = true;
      dayNum = prevMonthDays - firstWeekday + i + 1;
      cellMonth = month - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
    } else if (i >= firstWeekday + monthDays) {
      outside = true;
      dayNum = i - (firstWeekday + monthDays) + 1;
      cellMonth = month + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    } else {
      dayNum = i - firstWeekday + 1;
    }

    const cellDate = formatIsoDateUTC(new Date(Date.UTC(cellYear, cellMonth, dayNum)));
    const activity = getDayActivity(cellDate);
    const selected = state.calendar.selectedDate === cellDate ? "selected" : "";
    const today = (state.settings.today || todayISODate()) === cellDate ? "today" : "";
    const outsideClass = outside ? "outside" : "";
    const goalHit =
      activity.xpPct >= 1 || activity.dialPct >= 1 || activity.apptPct >= 1
        ? "goal-hit"
        : "";
    const sessionsForDay = state.activity.byDate?.[cellDate] || [];
    const hasSession = sessionsForDay.length ? "has-session" : "";
    const xpComplete = activity.xpPct >= 1 ? "complete" : "";
    const dialComplete = activity.dialPct >= 1 ? "complete" : "";
    const apptComplete = activity.apptPct >= 1 ? "complete" : "";

    cells.push(`
      <button type="button" class="calendar-day ${outsideClass} ${selected} ${today} ${goalHit} ${hasSession}" data-date="${cellDate}">
        <span class="calendar-date">${dayNum}</span>
        <svg class="ring-stack" viewBox="0 0 44 44" aria-hidden="true">
          <circle class="ring-bg" cx="22" cy="22" r="18" stroke-width="3"></circle>
          <circle class="ring-progress ring-xp ${xpComplete}" cx="22" cy="22" r="18" stroke-width="3" stroke-dasharray="${2 * Math.PI * 18}" stroke-dashoffset="${ringOffset(18, activity.xpPct)}"></circle>
          <circle class="ring-bg" cx="22" cy="22" r="13.2" stroke-width="3"></circle>
          <circle class="ring-progress ring-dial ${dialComplete}" cx="22" cy="22" r="13.2" stroke-width="3" stroke-dasharray="${2 * Math.PI * 13.2}" stroke-dashoffset="${ringOffset(13.2, activity.dialPct)}"></circle>
          <circle class="ring-bg" cx="22" cy="22" r="8.4" stroke-width="3"></circle>
          <circle class="ring-progress ring-appt ${apptComplete}" cx="22" cy="22" r="8.4" stroke-width="3" stroke-dasharray="${2 * Math.PI * 8.4}" stroke-dashoffset="${ringOffset(8.4, activity.apptPct)}"></circle>
        </svg>
        <span class="day-score">${activity.xp} pts</span>
        ${sessionsForDay.length ? `<span class="session-dot" title="${sessionsForDay.length} session(s)">●</span>` : ""}
      </button>
    `);
  }

  calendarGridEl.innerHTML = cells.join("");
  renderCalendarDetail(state.calendar.selectedDate);
}

function formatClockDuration(startedAt, endedAt = null) {
  if (!startedAt) return "00:00:00";
  const startDate = parseDateTimeSafe(startedAt);
  const endDate = endedAt ? parseDateTimeSafe(endedAt) : new Date();
  const start = startDate ? startDate.getTime() : Number.NaN;
  const end = endDate ? endDate.getTime() : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "00:00:00";
  const totalSec = Math.floor((end - start) / 1000);
  const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
}

function formatDateTimeShort(value) {
  if (!value) return "-";
  const date = parseDateTimeSafe(value);
  if (!date) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function currentUserId() {
  return Number(state.auth.user?.id || 0);
}

function updateActivityModeClass() {
  const active = Boolean(state.activity.activeSession);
  document.body.classList.toggle("activity-mode", active);
  if (active) {
    const sessionName = state.activity.activeSession.name || "Active Session";
    activityModeLabel.textContent = `Activity Mode • ${sessionName}`;
  } else {
    activityModeLabel.textContent = "Start a session with teammates";
  }
}

function renderIncomingInvites() {
  const invites = state.activity.incomingInvites || [];
  if (!invites.length) {
    incomingInvitesEl.innerHTML = "";
    return;
  }
  incomingInvitesEl.innerHTML = invites
    .map(
      (invite) => `
      <div class="invite-row">
        <span>${escapeHtml(invite.ownerDisplayName || "Teammate")} invited you to <strong>${escapeHtml(invite.name)}</strong></span>
        <div class="invite-actions">
          <button type="button" class="icon-btn invite-accept" data-invite-id="${invite.id}" aria-label="Accept invite" title="Accept"><span aria-hidden="true">✓</span></button>
          <button type="button" class="icon-btn invite-decline" data-invite-id="${invite.id}" aria-label="Decline invite" title="Decline"><span aria-hidden="true">✕</span></button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderFriendRequests() {
  const incoming = state.activity.teammates?.incomingRequests || [];
  const outgoing = state.activity.teammates?.outgoingRequests || [];
  const lines = [];
  incoming.forEach((req) => {
    lines.push(`
      <div class="invite-row">
        <span>Teammate request from <strong>${escapeHtml(req.displayName || req.email)}</strong></span>
        <div class="invite-actions">
          <button type="button" class="icon-btn friend-accept" data-request-id="${req.id}" aria-label="Accept teammate request" title="Accept"><span aria-hidden="true">✓</span></button>
          <button type="button" class="icon-btn friend-decline" data-request-id="${req.id}" aria-label="Decline teammate request" title="Decline"><span aria-hidden="true">✕</span></button>
        </div>
      </div>
    `);
  });
  outgoing.forEach((req) => {
    lines.push(`
      <div class="invite-row muted">
        <span>Pending teammate request to <strong>${escapeHtml(req.displayName || req.email)}</strong></span>
      </div>
    `);
  });
  friendRequestsEl.innerHTML = lines.join("");
}

function renderSessionHistory() {
  const sessions = state.activity.sessions || [];
  if (!sessions.length) {
    sessionsTableBody.innerHTML = `<tr><td colspan="7">No shared sessions yet.</td></tr>`;
    return;
  }
  sessionsTableBody.innerHTML = sessions
    .map((session) => {
      const participants = Array.isArray(session.participants) ? session.participants : [];
      const leaderboard = Array.isArray(session.leaderboard) ? session.leaderboard : [];
      const leaderboardText = leaderboard.length
        ? leaderboard
            .slice(0, 5)
            .map((row, idx) => `${idx + 1}. ${row.displayName || row.email} (${toInt(row.score)})`)
            .join(" | ")
        : "-";
      const duration = formatClockDuration(session.startedAt, session.endedAt);
      const participantNames = participants
        .map((p) => p.displayName || p.email)
        .join(", ");
      return `
        <tr>
          <td>${escapeHtml(session.name)}</td>
          <td>${escapeHtml(session.status)}</td>
          <td>${escapeHtml(formatDateTimeShort(session.startedAt))}</td>
          <td>${escapeHtml(formatDateTimeShort(session.endedAt))}</td>
          <td>${duration}</td>
          <td>${escapeHtml(participantNames || "-")}</td>
          <td>${escapeHtml(leaderboardText)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderActiveSession() {
  const session = state.activity.activeSession;
  if (!session) {
    activeSessionPanel.classList.add("hidden");
    startSessionBtn.classList.remove("hidden");
    state.activity.leaderboardRanks = {};
    if (state.activityTimerIntervalId) {
      clearInterval(state.activityTimerIntervalId);
      state.activityTimerIntervalId = null;
    }
    updateActivityModeClass();
    return;
  }

  activeSessionPanel.classList.remove("hidden");
  startSessionBtn.classList.add("hidden");
  activeSessionNameEl.textContent = session.name || "Session";
  activeSessionStartTimeEl.textContent = `Started ${formatDateTimeShort(session.startedAt)}`;
  const owner = Number(session.ownerUserId) === currentUserId();
  activeSessionOwnerTagEl.textContent = owner ? "Owner" : "Participant";
  stopSessionBtn.classList.toggle("hidden", !owner);
  leaveSessionBtn.classList.toggle("hidden", owner);

  const participants = Array.isArray(session.participants) ? session.participants : [];
  sessionParticipantsList.innerHTML = participants.length
    ? participants
        .map((p) => `<li>${escapeHtml(p.displayName || p.email)}${p.leftAt ? " (left)" : ""}</li>`)
        .join("")
    : "<li>No participants yet.</li>";

  const leaderboard = Array.isArray(session.leaderboard) ? session.leaderboard : [];
  if (leaderboard.length) {
    const previousRanks = state.activity.leaderboardRanks || {};
    const nextRanks = {};
    sessionLeaderboardList.innerHTML = leaderboard
      .map((row, idx) => {
        const key = String(row.userId || row.email || row.displayName || idx);
        const nextRank = idx + 1;
        const prevRank = Number(previousRanks[key] || 0);
        nextRanks[key] = nextRank;
        let moveClass = "rank-new";
        if (prevRank > 0) {
          if (nextRank < prevRank) moveClass = "rank-up";
          else if (nextRank > prevRank) moveClass = "rank-down";
          else moveClass = "rank-hold";
        }
        return `<li class="leader-row ${moveClass}" style="--row-index:${idx};"><span class="leader-name">${escapeHtml(
          row.displayName || row.email
        )}</span> <strong>${toInt(row.score)} pts</strong></li>`;
      })
      .join("");
    state.activity.leaderboardRanks = nextRanks;
  } else {
    sessionLeaderboardList.innerHTML = "<li>No scores yet.</li>";
    state.activity.leaderboardRanks = {};
  }

    const invitable = Array.isArray(session.invitableFriends) ? session.invitableFriends : [];
  inviteFriendSelect.innerHTML = invitable.length
    ? invitable
        .map((friend) => `<option value="${friend.id}">${escapeHtml(friend.displayName || friend.email)}</option>`)
        .join("")
    : '<option value="">No invitable teammates</option>';
  inviteFriendBtn.disabled = !invitable.length;

  const tick = () => {
    activeSessionTimerEl.textContent = formatClockDuration(session.startedAt);
  };
  tick();
  if (state.activityTimerIntervalId) clearInterval(state.activityTimerIntervalId);
  state.activityTimerIntervalId = setInterval(tick, 1000);
  updateActivityModeClass();
}

function attachInviteActions() {
  incomingInvitesEl.querySelectorAll(".invite-accept").forEach((button) => {
    button.addEventListener("click", () => respondToInvite(button.dataset.inviteId, "accept"));
  });
  incomingInvitesEl.querySelectorAll(".invite-decline").forEach((button) => {
    button.addEventListener("click", () => respondToInvite(button.dataset.inviteId, "decline"));
  });
  friendRequestsEl.querySelectorAll(".friend-accept").forEach((button) => {
    button.addEventListener("click", () => respondToFriendRequest(button.dataset.requestId, "accept"));
  });
  friendRequestsEl.querySelectorAll(".friend-decline").forEach((button) => {
    button.addEventListener("click", () => respondToFriendRequest(button.dataset.requestId, "decline"));
  });
}

function renderActivityWidget() {
  renderFriendRequests();
  renderIncomingInvites();
  attachInviteActions();
  renderActiveSession();
  renderNetworkList();
}

function renderNetworkList() {
  const connections = state.activity.teammates?.friends || [];
  if (!connections.length) {
    state.activity.selectedConnectionUserId = null;
    networkListEl.innerHTML = "<li>No connections yet.</li>";
    networkPreviewEl.classList.add("muted");
    networkPreviewEl.textContent = "No connection selected.";
    return;
  }
  const selectedId = Number(state.activity.selectedConnectionUserId || 0);
  networkListEl.innerHTML = connections
    .map(
      (user) =>
        `<li><button type="button" class="linkish-btn view-person-btn${
          Number(user.id) === selectedId ? " is-active" : ""
        }" data-user-id="${user.id}">${escapeHtml(
          user.displayName || user.email
        )}</button></li>`
    )
    .join("");
  networkListEl.querySelectorAll(".view-person-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.activity.selectedConnectionUserId = Number(button.dataset.userId);
      renderNetworkList();
      viewPersonProfile(button.dataset.userId);
    });
  });
}

async function viewPersonProfile(userId) {
  try {
    const { response, data } = await apiFetch(`/api/people/${Number(userId)}`);
    if (!response.ok) throw new Error(data?.error || "Failed to load profile");
    const person = data.person;
    const relationTags = [];
    if (person.relation?.isTeammate) relationTags.push("Teammate");
    if (person.relation?.isFriend) relationTags.push("Friend");
    if (!relationTags.length) relationTags.push("Connection");
    const roleLine = person.roleTitle ? `<p>Role: ${escapeHtml(person.roleTitle)}</p>` : "";
    const statsLine = person.stats
      ? `<p>Current: Level ${person.stats.playerState.level} • Lifetime Points ${person.stats.playerState.lifetimeXP} • Latest Daily Points ${person.stats.latestDailyXP}</p>`
      : `<p>Current stats are private.</p>`;
    networkPreviewEl.classList.remove("muted");
    networkPreviewEl.innerHTML = `
      <div>
        <p><strong>${escapeHtml(person.displayName || person.email)}</strong></p>
        <p>${escapeHtml(person.teamName || "")} • ${escapeHtml(relationTags.join(" • "))}</p>
        ${roleLine}
        ${statsLine}
      </div>
    `;
  } catch (error) {
    networkPreviewEl.classList.add("muted");
    networkPreviewEl.textContent = error.message || "Could not load profile preview.";
  }
}

async function loadActivityState(options = {}) {
  const silent = options.silent === true;
  try {
    const { response, data } = await apiFetch("/api/activity/state");
    if (!response.ok) throw new Error(data?.error || "Failed to load activity state");
    state.activity.activeSession = data.activeSession || null;
    state.activity.incomingInvites = Array.isArray(data.incomingInvites) ? data.incomingInvites : [];
    state.activity.teammates = data.teammates || data.friends || state.activity.teammates;
    renderActivityWidget();
  } catch (error) {
    if (!silent) {
      showActivityMessage(error.message || "Could not load activity state", true);
    }
  }
}

async function loadActivityHistory(options = {}) {
  const silent = options.silent === true;
  try {
    const { response, data } = await apiFetch("/api/activity/history");
    if (!response.ok) throw new Error(data?.error || "Failed to load session history");
    state.activity.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.activity.byDate = data.byDate || {};
    renderSessionHistory();
    renderCalendar();
  } catch (error) {
    if (!silent) {
      showActivityMessage(error.message || "Could not load session history", true);
    }
  }
}

async function startSharedSession() {
  const sessionName = window.prompt("Name this shared activity session");
  if (sessionName === null) return;
  if (!String(sessionName).trim()) {
    showActivityMessage("Session name is required.", true);
    return;
  }
  try {
    const { response, data } = await apiFetch("/api/activity/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sessionName })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to start session");
    state.activity.activeSession = data.activeSession || null;
    showActivityMessage(`Session started: ${sessionName}`);
    await loadActivityState();
    await loadActivityHistory();
  } catch (error) {
    showActivityMessage(error.message || "Could not start session", true);
  }
}

async function inviteFriendToSession() {
  const session = state.activity.activeSession;
  const friendUserId = Number(inviteFriendSelect.value || 0);
  if (!session?.id || !friendUserId) return;
  try {
    const { response, data } = await apiFetch("/api/activity/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, teammateUserId: friendUserId })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to invite teammate");
    state.activity.activeSession = data.activeSession || null;
    renderActivityWidget();
    showActivityMessage("Invite sent.");
  } catch (error) {
    showActivityMessage(error.message || "Could not invite teammate", true);
  }
}

async function sendFriendRequest() {
  const email = String(friendEmailInput.value || "").trim().toLowerCase();
  if (!email) {
    showActivityMessage("Teammate email is required.", true);
    return;
  }
  try {
    const { response, data } = await apiFetch("/api/teammates/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to send teammate request");
    friendEmailInput.value = "";
    state.activity.teammates = data.teammates || data.friends || state.activity.teammates;
    renderActivityWidget();
    showActivityMessage(data?.message || "Teammate request sent.");
  } catch (error) {
    showActivityMessage(error.message || "Could not send teammate request", true);
  }
}

async function respondToFriendRequest(requestId, action) {
  try {
    const { response, data } = await apiFetch("/api/teammates/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: Number(requestId), action })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to respond to teammate request");
    state.activity.teammates = data.teammates || data.friends || state.activity.teammates;
    await loadActivityState();
    renderActivityWidget();
    showActivityMessage(data?.message || `Request ${action}ed.`);
  } catch (error) {
    showActivityMessage(error.message || "Could not respond to teammate request", true);
  }
}

async function respondToInvite(inviteId, action) {
  try {
    const { response, data } = await apiFetch("/api/activity/respond-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId: Number(inviteId), action })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to respond to invite");
    state.activity.activeSession = data.activeSession || null;
    await loadActivityState();
    await loadActivityHistory();
    showActivityMessage(action === "accept" ? "Joined session." : "Invite declined.");
  } catch (error) {
    showActivityMessage(error.message || "Could not respond to invite", true);
  }
}

async function leaveActiveSession() {
  const session = state.activity.activeSession;
  if (!session?.id) return;
  try {
    const { response, data } = await apiFetch("/api/activity/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to leave session");
    state.activity.activeSession = data.activeSession || null;
    await loadActivityState();
    await loadActivityHistory();
    showActivityMessage("You left the session.");
  } catch (error) {
    showActivityMessage(error.message || "Could not leave session", true);
  }
}

async function stopActiveSession() {
  const session = state.activity.activeSession;
  if (!session?.id) return;
  try {
    const { response, data } = await apiFetch("/api/activity/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to stop session");
    showActivityMessage(data?.message || "Session stopped.");
    state.activity.activeSession = null;
    await loadActivityState();
    await loadActivityHistory();
  } catch (error) {
    showActivityMessage(error.message || "Could not stop session", true);
  }
}

async function loadHistory(options = {}) {
  const silent = options.silent === true;
  const applySelectedDate = options.applySelectedDate === true;
  try {
    const { response, data } = await apiFetch("/api/history");
    if (!response.ok) throw new Error(data.error || "Failed to fetch history");
    state.history = Array.isArray(data.logs) ? data.logs : [];
    if (data.playerState) state.playerState = data.playerState;
    if (data.settings) state.settings = data.settings;
    if (data.motion) state.motion = data.motion;
    updateGreeting();
    renderHistory();
    updateLevelUI();
    updateSparklines();
    if (applySelectedDate && !state.isDirty) {
      applySelectedDateFromHistory();
    } else {
      updateLiveUI({ markDirty: false });
    }
    updateMotionSyncBadge();
    renderCalendar();
  } catch (error) {
    if (!silent) {
      showMessage(error.message || "Could not load history", true);
    }
  }
}

async function loadSettings() {
  try {
    const { response, data } = await apiFetch("/api/settings");
    if (!response.ok) throw new Error(data.error || "Failed to fetch settings");
    if (data.settings) state.settings = data.settings;
    updateGreeting();
    updateMotionSyncBadge();
  } catch (error) {
    showMessage(error.message || "Could not load settings", true);
  }
}

function formatDateTime(value) {
  if (!value) return "";
  const date = parseDateTimeSafe(value);
  if (!date) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderProfileForm(profile) {
  if (!profile) return;
  const user = profile.user || {};
  const settings = profile.settings || {};
  const player = profile.playerState || {};
  const dashboard = profile.dashboard || {};
  state.profile = profile;
  state.auth.user = user;

  profileDisplayNameEl.value = user.displayName || "";
  profileEmailEl.value = user.email || "";
  profileTeamLineEl.textContent = `Team: ${user.teamName || "Stakks Unit"}`;
  profileRoleLineEl.textContent = user.roleTitle ? `Title: ${user.roleTitle}` : "";
  profileJoinedAtEl.textContent = user.createdAt
    ? `Joined ${formatDateTime(user.createdAt)}`
    : "";
  const teamLead = profile.teamRoles?.teamLead;
  const partner = profile.teamRoles?.partner;
  teamLeadSlotEl.textContent = `Team Lead: ${teamLead ? teamLead.displayName || teamLead.email : "Unassigned"}`;
  teamPartnerSlotEl.textContent = `Partner: ${partner ? partner.displayName || partner.email : "Unassigned"}`;
  profileLevelLineEl.textContent = `Level ${player.level || 1} • ${
    player.levelXP || 0
  } / ${player.xpToNext || 30}`;
  profileLifetimeLineEl.textContent = `Lifetime Points: ${player.lifetimeXP || 0}`;

  profileTimezoneEl.value = settings.timezone || "America/New_York";
  profileDialGoalEl.value = String(settings.defaultDialGoal ?? 100);
  profileDailyApptGoalEl.value = String(settings.defaultDailyAppointmentGoal ?? 3);
  profileWeeklyApptGoalEl.value = String(settings.defaultWeeklyAppointmentGoal ?? 15);
  profileShowStatsEl.checked = Number(settings.showCurrentStats ?? 1) === 1;
  profileMotionApiKeyEl.value = "";
  profileMotionProjectIdEl.value = settings.motionProjectId || "";

  const motion = dashboard.motion || {};
  const lastSaved = dashboard.lastSaved
    ? `Last Save ${dashboard.lastSaved.logDate} (rev ${dashboard.lastSaved.saveRevision})`
    : "No saves yet";
  profileDashboardStatsEl.textContent =
    `Logs ${dashboard.totalLogs || 0} • Points ${dashboard.totalXP || 0} • Pending ${
      motion.pendingSyncCount || 0
    } • Failed ${motion.failedSyncCount || 0} • ${lastSaved}`;
  profileSummaryTextEl.textContent = `Manage account and dashboard settings`;
  profileMessageEl.textContent = "";
  const canManageRoles = ["Team Lead", "Partner"].includes(String(user.roleTitle || ""));
  teamRoleManagerEl.classList.toggle("hidden", !canManageRoles);
  teamLeadAddMemberEl.classList.toggle(
    "hidden",
    !["Team Lead", "Partner"].includes(String(user.roleTitle || ""))
  );
  assignRoleSelectEl.innerHTML = [
    `<option value="Member">Member</option>`,
    `<option value="Partner">Partner</option>`,
    user.roleTitle === "Partner" ? `<option value="Team Lead">Team Lead</option>` : ""
  ].join("");
  updateGreeting();
}

async function loadProfile() {
  const { response, data } = await apiFetch("/api/profile");
  if (!response.ok) throw new Error(data?.error || "Failed to load profile");
  renderProfileForm(data.profile);
  return data.profile;
}

function openProfileDrawer() {
  closeDrawer();
  profileDrawer.classList.remove("hidden");
  profileBackdrop.classList.remove("hidden");
  profileDrawer.setAttribute("aria-hidden", "false");
  loadProfile().catch((error) => {
    showMessage(error.message || "Could not load profile", true);
  });
}

function closeProfileDrawer() {
  profileDrawer.classList.add("hidden");
  profileBackdrop.classList.add("hidden");
  profileDrawer.setAttribute("aria-hidden", "true");
}

function setButtonBusy(buttonEl, busy) {
  if (!buttonEl) return;
  buttonEl.disabled = Boolean(busy);
  buttonEl.classList.toggle("busy", Boolean(busy));
}

function showProfileMessage(text, isError = false) {
  if (!profileMessageEl) return;
  profileMessageEl.textContent = text;
  profileMessageEl.classList.toggle("error", Boolean(isError));
}

async function saveProfile() {
  setButtonBusy(profileSaveBtn, true);
  showProfileMessage("");
  try {
    const payload = {
      displayName: String(profileDisplayNameEl.value || "").trim(),
      timezone: String(profileTimezoneEl.value || "").trim() || "America/New_York",
      defaultDialGoal: toInt(profileDialGoalEl.value),
      defaultDailyAppointmentGoal: toInt(profileDailyApptGoalEl.value),
      defaultWeeklyAppointmentGoal: toInt(profileWeeklyApptGoalEl.value),
      showCurrentStats: profileShowStatsEl.checked ? 1 : 0,
      motionProjectId: String(profileMotionProjectIdEl.value || "").trim()
    };
    const motionApiKey = String(profileMotionApiKeyEl.value || "").trim();
    if (motionApiKey) {
      payload.motionApiKey = motionApiKey;
    }
    const { response, data } = await apiFetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(data?.error || "Failed to save profile");
    renderProfileForm(data.profile);
    state.settings = data.profile.settings || state.settings;
    state.currentTimezoneDate = getTrackerTodayISO();
    state.playerState = data.profile.playerState || state.playerState;
    document.getElementById("dialGoal").value = String(state.settings.defaultDialGoal ?? 100);
    document.getElementById("dailyAppointmentGoal").value = String(
      state.settings.defaultDailyAppointmentGoal ?? 3
    );
    document.getElementById("weeklyAppointmentGoal").value = String(
      state.settings.defaultWeeklyAppointmentGoal ?? 15
    );
    updateLevelUI();
    updateLiveUI({ markDirty: false });
    renderCalendar();
    showMessage("Profile saved.");
    showProfileMessage("Profile saved.");
  } catch (error) {
    showMessage(error.message || "Could not save profile", true);
    showProfileMessage(error.message || "Could not save profile", true);
  } finally {
    setButtonBusy(profileSaveBtn, false);
  }
}

async function retryMotionFromProfile() {
  setButtonBusy(profileRetryMotionBtn, true);
  showProfileMessage("");
  try {
    const { response, data } = await apiFetch("/api/motion/retry", { method: "POST" });
    if (!response.ok) throw new Error(data?.error || "Motion retry failed");
    if (data.motion) state.motion = data.motion;
    updateMotionSyncBadge();
    await loadProfile();
    await loadHistory();
    showMessage("Motion retry run complete.");
    showProfileMessage("Motion retry complete.");
  } catch (error) {
    showMessage(error.message || "Could not retry Motion sync", true);
    showProfileMessage(error.message || "Could not retry Motion sync", true);
  } finally {
    setButtonBusy(profileRetryMotionBtn, false);
  }
}

async function exportUserData() {
  setButtonBusy(profileExportBtn, true);
  showProfileMessage("");
  try {
    const { response, data } = await apiFetch("/api/export");
    if (!response.ok) throw new Error(data?.error || "Export failed");
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daily-activity-export-${todayISODate()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showMessage("Export downloaded.");
    showProfileMessage("Export downloaded.");
  } catch (error) {
    showMessage(error.message || "Could not export data", true);
    showProfileMessage(error.message || "Could not export data", true);
  } finally {
    setButtonBusy(profileExportBtn, false);
  }
}

async function createTeamFromProfile() {
  const teamName = String(createTeamNameEl.value || "").trim();
  if (!teamName) {
    showProfileMessage("Team name is required.", true);
    return;
  }
  setButtonBusy(createTeamBtn, true);
  showProfileMessage("");
  try {
    const { response, data } = await apiFetch("/api/team/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to create team");
    if (data.user) state.auth.user = data.user;
    createTeamNameEl.value = "";
    await loadProfile();
    await loadActivityState();
    showMessage("Team created.");
    showProfileMessage("Team created. You are now the Partner for this team.");
  } catch (error) {
    showProfileMessage(error.message || "Could not create team", true);
  } finally {
    setButtonBusy(createTeamBtn, false);
  }
}

async function assignTeamRoleFromProfile() {
  const email = String(assignRoleEmailEl.value || "").trim().toLowerCase();
  const roleTitle = String(assignRoleSelectEl.value || "").trim();
  if (!email || !roleTitle) {
    showProfileMessage("Teammate email and role are required.", true);
    return;
  }
  setButtonBusy(assignRoleBtn, true);
  showProfileMessage("");
  try {
    const { response, data } = await apiFetch("/api/team/assign-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, roleTitle })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to assign role");
    if (data.user) state.auth.user = data.user;
    assignRoleEmailEl.value = "";
    await loadProfile();
    showProfileMessage("Role updated.");
  } catch (error) {
    showProfileMessage(error.message || "Could not assign role", true);
  } finally {
    setButtonBusy(assignRoleBtn, false);
  }
}

async function addMemberToTeamFromProfile() {
  const email = String(addMemberEmailEl.value || "").trim().toLowerCase();
  if (!email) {
    showProfileMessage("Member email is required.", true);
    return;
  }
  setButtonBusy(addMemberBtn, true);
  showProfileMessage("");
  try {
    const { response, data } = await apiFetch("/api/team/add-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error(data?.error || "Failed to add member");
    addMemberEmailEl.value = "";
    await loadProfile();
    await loadActivityState();
    showProfileMessage("Member added to team.");
  } catch (error) {
    showProfileMessage(error.message || "Could not add member", true);
  } finally {
    setButtonBusy(addMemberBtn, false);
  }
}

async function saveGoalSettings(patch) {
  try {
    const { response, data } = await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) throw new Error(data.error || "Failed to save goal settings");
    if (data.settings) {
      state.settings = data.settings;
      state.currentTimezoneDate = getTrackerTodayISO();
      updateGreeting();
      updateLiveUI({ markDirty: false });
      renderCalendar();
    }
  } catch (error) {
    showMessage(error.message || "Could not save goal settings", true);
  }
}

function showLevelToast(level, levelsGained) {
  const toast = document.createElement("div");
  toast.className = "level-toast";
  const pill = levelsGained > 1 ? `LEVEL UP x${levelsGained}` : "LEVEL UP";
  toast.innerHTML = `<strong>${pill}</strong>Level ${level}`;
  levelToastAnchorEl.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);

  levelShimmerEl.classList.remove("active");
  void levelShimmerEl.offsetWidth;
  levelShimmerEl.classList.add("active");
  setTimeout(() => levelShimmerEl.classList.remove("active"), 620);

  const wrap = document.createElement("div");
  wrap.className = "confetti-wrap";
  for (let i = 0; i < 10; i += 1) {
    const dot = document.createElement("span");
    dot.className = "confetti-dot";
    dot.style.left = `${36 + Math.random() * 58}%`;
    dot.style.top = `${30 + Math.random() * 35}%`;
    dot.style.background = ["#2f66b8", "#32a9a2", "#7d97ba"][i % 3];
    dot.style.setProperty("--dx", `${(Math.random() - 0.5) * 40}px`);
    wrap.appendChild(dot);
  }
  document.querySelector(".xp-card").appendChild(wrap);
  setTimeout(() => wrap.remove(), 900);
}

function isValidLogDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

async function persistLog({ silent = false } = {}) {
  if (state.isSaving) {
    state.hasPendingAutosave = true;
    return false;
  }

  const payload = getFormPayload();
  if (!isValidLogDate(payload.logDate)) {
    if (!silent) showMessage("Select a valid date before saving.", true);
    return false;
  }
  if (silent && !hasMeaningfulData(payload)) {
    updateAutosaveBadge("Autosave: Idle");
    state.isDirty = false;
    return false;
  }

  state.isSaving = true;
  updateAutosaveBadge("Autosave: Saving...", "saving");
  if (!silent) showMessage("");

  try {
    const { response, data } = await apiFetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(data.error || "Save failed");

    if (data.playerState) {
      state.playerState = data.playerState;
      updateLevelUI();
    }
    if (data.settings) {
      state.settings = data.settings;
      updateGreeting();
    }
    if (data.levelUp?.occurred) {
      showLevelToast(state.playerState.level, data.levelUp.levelsGained);
    }

    const saveKindText = data.saveKind === "new_day" ? "New day" : "Updated";
    const motionActionText = data.motion?.action ? ` (${data.motion.action})` : "";
    const motionInfo = data.motion?.motionTaskId
      ? ` Motion task${motionActionText}: ${data.motion.motionTaskId}.`
      : data.motion?.reason
        ? ` Motion: ${data.motion.reason}.`
        : "";

    if (!silent) {
      showMessage(`${saveKindText} saved ${payload.logDate}.${motionInfo}`);
    }
    const timeText = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    updateAutosaveBadge(`Autosave: Saved ${timeText}`);

    localStorage.removeItem(DRAFT_STORAGE_KEY);
    state.isDirty = false;
    await loadHistory();
    if (state.activity.activeSession) {
      await loadActivityState();
      await loadActivityHistory();
    }
    return true;
  } catch (error) {
    updateAutosaveBadge("Autosave: Failed", "failed");
    if (!silent) {
      showMessage(error.message || "Save failed", true);
    }
    return false;
  } finally {
    state.isSaving = false;
    if (state.hasPendingAutosave) {
      state.hasPendingAutosave = false;
      scheduleAutosave(3000);
    }
  }
}

function scheduleAutosave(delayMs = 8000) {
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
  }
  if (!state.isDirty) return;
  updateAutosaveBadge("Autosave: Pending...", "pending");
  state.autosaveTimer = setTimeout(() => {
    persistLog({ silent: true });
  }, delayMs);
}

function startAutosaveInterval() {
  if (state.autosaveIntervalId) return;
  state.autosaveIntervalId = setInterval(() => {
    if (!state.isDirty) return;
    persistLog({ silent: true });
  }, 120000);
}

async function saveLog(event) {
  event.preventDefault();
  await persistLog({ silent: false });
}

function resetForm() {
  resetFormForDate(state.settings.today || getTrackerTodayISO());
}

function resetFormForDate(targetDate, options = {}) {
  const silent = options.silent === true;
  form.reset();
  dateInput.value = targetDate;
  METRICS.forEach((metric) => {
    const input = document.getElementById(metric.key);
    if (input) input.value = "0";
  });
  ["dials", "fycTarget", "fycCompleted"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = "0";
  });
  document.getElementById("dialGoal").value = String(
    state.settings.defaultDialGoal ?? 100
  );
  document.getElementById("dailyAppointmentGoal").value = String(
    state.settings.defaultDailyAppointmentGoal ?? 3
  );
  document.getElementById("weeklyAppointmentGoal").value = String(
    state.settings.defaultWeeklyAppointmentGoal ?? 15
  );
  document.getElementById("fycNotes").value = "";
  updateLiveUI({ markDirty: false });
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.isDirty = false;
  updateAutosaveBadge("Autosave: Idle");
  if (!silent) showMessage("");
}

async function handleDayRollover(nextDate) {
  if (state.rolloverInProgress || state.isSaving) return;
  if (!isValidLogDate(nextDate)) return;
  const activeDate = String(dateInput.value || "");
  if (activeDate === nextDate) {
    state.currentTimezoneDate = nextDate;
    return;
  }

  state.rolloverInProgress = true;
  try {
    const payloadBeforeReset = getFormPayload();
    const shouldSavePreviousDay =
      isValidLogDate(activeDate) &&
      activeDate !== nextDate &&
      hasMeaningfulData(payloadBeforeReset);

    if (shouldSavePreviousDay) {
      const saved = await persistLog({ silent: true });
      if (!saved) {
        showMessage("Midnight rollover paused: previous day could not be saved yet.", true);
        return;
      }
    }

    state.settings.today = nextDate;
    setCalendarFromDate(nextDate);
    state.calendar.selectedDate = nextDate;
    resetFormForDate(nextDate, { silent: true });
    renderCalendar();
    await loadHistory();
    showMessage(`New day started (${nextDate}). Daily trackers reset.`);
    state.currentTimezoneDate = nextDate;
  } finally {
    state.rolloverInProgress = false;
  }
}

function startDayRolloverMonitor() {
  if (state.dayRolloverIntervalId) return;
  state.currentTimezoneDate = getTrackerTodayISO();
  state.dayRolloverIntervalId = setInterval(() => {
    const todayInZone = getTrackerTodayISO();
    if (todayInZone === state.currentTimezoneDate) return;
    handleDayRollover(todayInZone);
  }, 30000);
}

function startCrossDeviceSyncMonitor() {
  if (state.crossDeviceSyncIntervalId) return;
  state.crossDeviceSyncIntervalId = setInterval(() => {
    if (!state.auth.token) return;
    if (state.isSaving || state.rolloverInProgress) return;
    const canApply = !state.isDirty && !document.hidden;
    loadHistory({ silent: true, applySelectedDate: canApply });
    if (canApply) {
      loadActivityState();
      loadActivityHistory();
    }
  }, 15000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!state.auth.token) return;
    if (state.isSaving || state.rolloverInProgress) return;
    const canApply = !state.isDirty;
    loadHistory({ silent: true, applySelectedDate: canApply });
    loadActivityState();
    loadActivityHistory();
  });
}

function startActivityLiveMonitor() {
  if (state.activityLiveIntervalId) return;
  state.activityLiveIntervalId = setInterval(async () => {
    if (!state.auth.token) return;
    if (!state.activity.activeSession) return;
    if (state.isSaving || state.rolloverInProgress) return;
    await loadActivityState({ silent: true });
    await loadActivityHistory({ silent: true });
  }, 4000);
}

function periodLabel(period) {
  return {
    "7d": "7D",
    "14d": "14D",
    "30d": "30D",
    this_week: "This Week",
    this_month: "This Month",
    ytd: "YTD",
    custom: "Custom"
  }[period] || "7D";
}

async function loadDrawerCharts() {
  if (!state.drawerMetric) return;
  const params = new URLSearchParams({
    metric: state.drawerMetric,
    period: state.drawerPeriod
  });
  if (state.drawerPeriod === "custom") {
    params.set("from", customFromInput.value);
    params.set("to", customToInput.value);
  }
  try {
    const { response, data: payload } = await apiFetch(`/api/analytics?${params.toString()}`);
    if (!response.ok) throw new Error(payload.error || "Could not load analytics");
    const metric = metricByKey(state.drawerMetric);
    drawerSub.textContent = `${periodLabel(state.drawerPeriod)} • ${payload.range.from} to ${payload.range.to}`;
    chartManager.renderAll(canvasMap, payload, metric.label);
  } catch (error) {
    drawerSub.textContent = error.message || "Analytics unavailable";
  }
}

function openDrawer(metricKey) {
  closeProfileDrawer();
  const metric = metricByKey(metricKey);
  if (!metric) return;
  state.drawerMetric = metricKey;
  drawerTitle.textContent = metric.label;
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  loadDrawerCharts();
}

function closeDrawer() {
  drawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
}

function setupDrawerEvents() {
  metricGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("input") || target.closest(".step-btn") || target.closest(".tile-input")) return;
    const tile = target.closest(".metric-tile");
    if (!tile) return;
    if (tile.dataset.analytics !== "true") return;
    openDrawer(tile.dataset.metric);
  });

  metricGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("input") || event.target.closest(".step-btn") || event.target.closest(".tile-input")) return;
    const tile = event.target.closest(".metric-tile");
    if (!tile) return;
    if (tile.dataset.analytics !== "true") return;
    event.preventDefault();
    openDrawer(tile.dataset.metric);
  });

  drawerCloseBtn.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closeProfileDrawer();
    }
  });

  periodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      periodButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.drawerPeriod = btn.dataset.period;
      customRangeWrap.classList.toggle("hidden", state.drawerPeriod !== "custom");
      if (state.drawerPeriod !== "custom") {
        loadDrawerCharts();
      }
    });
  });

  applyCustomBtn.addEventListener("click", () => {
    if (!customFromInput.value || !customToInput.value) return;
    loadDrawerCharts();
  });
}

function setupProfileEvents() {
  if (profileChip) profileChip.addEventListener("click", openProfileDrawer);
  if (profileBtn) profileBtn.addEventListener("click", openProfileDrawer);
  if (profileCloseBtn) profileCloseBtn.addEventListener("click", closeProfileDrawer);
  if (profileBackdrop) profileBackdrop.addEventListener("click", closeProfileDrawer);
  if (profileSaveBtn) profileSaveBtn.addEventListener("click", saveProfile);
  if (profileRetryMotionBtn) profileRetryMotionBtn.addEventListener("click", retryMotionFromProfile);
  if (profileExportBtn) profileExportBtn.addEventListener("click", exportUserData);
  if (createTeamBtn) createTeamBtn.addEventListener("click", createTeamFromProfile);
  if (assignRoleBtn) assignRoleBtn.addEventListener("click", assignTeamRoleFromProfile);
  if (addMemberBtn) addMemberBtn.addEventListener("click", addMemberToTeamFromProfile);
  if (createTeamNameEl) {
    createTeamNameEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createTeamFromProfile();
      }
    });
  }
  if (assignRoleEmailEl) {
    assignRoleEmailEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        assignTeamRoleFromProfile();
      }
    });
  }
  if (addMemberEmailEl) {
    addMemberEmailEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addMemberToTeamFromProfile();
      }
    });
  }
}

function setCalendarFromDate(isoDate) {
  const date = parseIsoDate(isoDate || state.settings.today || todayISODate());
  state.calendar.year = date.getUTCFullYear();
  state.calendar.month = date.getUTCMonth();
  state.calendar.selectedDate = formatIsoDateUTC(date);
}

function setupCalendarEvents() {
  calendarGridEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".calendar-day");
    if (!btn) return;
    const date = btn.dataset.date;
    state.calendar.selectedDate = date;
    if (dateInput.value !== date) {
      dateInput.value = date;
      updateLiveUI({ markDirty: false });
    }
    renderCalendar();
  });

  calendarPrevBtn.addEventListener("click", () => {
    const next = new Date(Date.UTC(state.calendar.year, state.calendar.month - 1, 1));
    state.calendar.year = next.getUTCFullYear();
    state.calendar.month = next.getUTCMonth();
    renderCalendar();
  });

  calendarNextBtn.addEventListener("click", () => {
    const next = new Date(Date.UTC(state.calendar.year, state.calendar.month + 1, 1));
    state.calendar.year = next.getUTCFullYear();
    state.calendar.month = next.getUTCMonth();
    renderCalendar();
  });

  calendarTodayBtn.addEventListener("click", () => {
    setCalendarFromDate(state.settings.today || todayISODate());
    dateInput.value = state.calendar.selectedDate;
    updateLiveUI({ markDirty: false });
    renderCalendar();
  });
}

function loadCalcHistory() {
  try {
    const raw = localStorage.getItem(CALC_HISTORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    state.calculator.history = parsed.slice(0, 5);
  } catch (error) {
    state.calculator.history = [];
  }
}

function persistCalcHistory() {
  try {
    localStorage.setItem(
      CALC_HISTORY_KEY,
      JSON.stringify(state.calculator.history.slice(0, 5))
    );
  } catch (error) {
    // ignore storage errors
  }
}

function renderCalcHistory() {
  if (!state.calculator.history.length) {
    calcHistoryEl.innerHTML = "<li>No calculations yet.</li>";
    return;
  }
  calcHistoryEl.innerHTML = state.calculator.history
    .slice(0, 5)
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function sanitizeExpression(expr) {
  const clean = String(expr || "").replace(/\s+/g, "");
  if (!/^[0-9+\-*/().]+$/.test(clean)) {
    return null;
  }
  return clean;
}

function evaluateExpression() {
  const expression = sanitizeExpression(calcDisplay.value);
  if (!expression) {
    calcDisplay.value = "Invalid";
    return;
  }
  try {
    const result = Function(`"use strict"; return (${expression});`)();
    if (typeof result !== "number" || !Number.isFinite(result)) {
      calcDisplay.value = "Invalid";
      return;
    }
    const displayResult = Number(result.toFixed(8)).toString();
    const entry = `${expression} = ${displayResult}`;
    state.calculator.history.unshift(entry);
    state.calculator.history = state.calculator.history.slice(0, 5);
    persistCalcHistory();
    renderCalcHistory();
    calcDisplay.value = displayResult;
  } catch (error) {
    calcDisplay.value = "Invalid";
  }
}

function setupCalculatorEvents() {
  if (!calcPanel || !calcDisplay || !calcEqualsBtn || !calcClearBtn || !calcHistoryEl) return;
  loadCalcHistory();
  renderCalcHistory();

  if (calcFab) {
    calcFab.addEventListener("click", () => {
      calcPanel.classList.toggle("hidden");
      calcPanel.setAttribute("aria-hidden", calcPanel.classList.contains("hidden") ? "true" : "false");
      if (!calcPanel.classList.contains("hidden")) {
        calcDisplay.focus();
      }
    });
  }

  if (calcCloseBtn) {
    calcCloseBtn.addEventListener("click", () => {
      calcPanel.classList.add("hidden");
      calcPanel.setAttribute("aria-hidden", "true");
    });
  }

  calcPanel.addEventListener("click", (event) => {
    const key = event.target.closest(".calc-key");
    if (!key || key.id === "calcEqualsBtn") return;
    const value = key.dataset.calc;
    if (!value) return;
    calcDisplay.value += value;
  });

  calcEqualsBtn.addEventListener("click", evaluateExpression);
  calcClearBtn.addEventListener("click", () => {
    calcDisplay.value = "";
  });

  calcDisplay.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      evaluateExpression();
    }
  });

  if (calcFab || calcCloseBtn) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !calcPanel.classList.contains("hidden")) {
        calcPanel.classList.add("hidden");
        calcPanel.setAttribute("aria-hidden", "true");
      }
    });
  }
}

function setupFormEvents() {
  form.addEventListener("submit", saveLog);
  form.addEventListener("input", (event) => {
    if (
      event.target.id === "dailyAppointmentGoal" ||
      event.target.id === "weeklyAppointmentGoal"
    ) {
      updateLiveUI({ markDirty: false });
      return;
    }
    updateLiveUI();
  });
  form.addEventListener("click", (event) => {
    const btn = event.target.closest(".step-btn");
    if (!btn) return;
    const inputId = btn.dataset.stepTarget;
    const dir = Number(btn.dataset.stepDir || 0);
    const input = document.getElementById(inputId);
    if (!input) return;
    const next = Math.max(0, toInt(input.value) + dir);
    input.value = String(next);
    updateLiveUI();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.getElementById("dialGoal").addEventListener("change", (event) => {
    saveGoalSettings({ defaultDialGoal: toInt(event.target.value) });
  });
  document.getElementById("dailyAppointmentGoal").addEventListener("change", (event) => {
    saveGoalSettings({ defaultDailyAppointmentGoal: toInt(event.target.value) });
  });
  document.getElementById("weeklyAppointmentGoal").addEventListener("change", (event) => {
    saveGoalSettings({ defaultWeeklyAppointmentGoal: toInt(event.target.value) });
  });
  resetBtn.addEventListener("click", resetForm);
  historyBtn.addEventListener("click", () => historyCard.classList.toggle("hidden"));
  sessionsBtn.addEventListener("click", () => sessionsHistoryCard.classList.toggle("hidden"));
  dateInput.addEventListener("change", () => {
    if (!isValidLogDate(dateInput.value)) return;
    const date = parseIsoDate(dateInput.value);
    state.calendar.year = date.getUTCFullYear();
    state.calendar.month = date.getUTCMonth();
    state.calendar.selectedDate = dateInput.value;
    if (!state.isDirty) {
      applySelectedDateFromHistory();
    }
    renderCalendar();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!state.isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function setupActivityEvents() {
  startSessionBtn.addEventListener("click", startSharedSession);
  inviteFriendBtn.addEventListener("click", inviteFriendToSession);
  leaveSessionBtn.addEventListener("click", leaveActiveSession);
  stopSessionBtn.addEventListener("click", stopActiveSession);
  sendFriendRequestBtn.addEventListener("click", sendFriendRequest);
  friendEmailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendFriendRequest();
    }
  });
}

async function bootstrapDashboard() {
  if (!state.dashboardInitialized) {
    buildMetricTiles();
    applyStoredThemeModes();
    updateGreeting();
    setupThemeModeEvents();
    setupDrawerEvents();
    setupProfileEvents();
    setupCalendarEvents();
    setupCalculatorEvents();
    setupFormEvents();
    setupActivityEvents();
    state.dashboardInitialized = true;
  }
  await maybeRunStartupAnimation();
  await loadSettings();
  state.currentTimezoneDate = getTrackerTodayISO();
  updateGreeting();
  const baseToday = state.settings.today || getTrackerTodayISO();
  setCalendarFromDate(baseToday);
  dateInput.value = state.calendar.selectedDate || baseToday;
  document.getElementById("dialGoal").value = String(
    state.settings.defaultDialGoal ?? 100
  );
  document.getElementById("dailyAppointmentGoal").value = String(
    state.settings.defaultDailyAppointmentGoal ?? 3
  );
  document.getElementById("weeklyAppointmentGoal").value = String(
    state.settings.defaultWeeklyAppointmentGoal ?? 15
  );
  customToInput.value = baseToday;
  {
    const d = new Date(`${baseToday}T00:00:00`);
    d.setDate(d.getDate() - 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    customFromInput.value = `${y}-${m}-${day}`;
  }
  restoreDraft();
  if (isValidLogDate(dateInput.value)) {
    setCalendarFromDate(dateInput.value);
  }
  updateLiveUI();
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.isDirty = false;
  updateAutosaveBadge("Autosave: Idle");
  startAutosaveInterval();
  startDayRolloverMonitor();
  startCrossDeviceSyncMonitor();
  startActivityLiveMonitor();
  if (!state.greetingIntervalId) {
    state.greetingIntervalId = setInterval(updateGreeting, 60000);
  }
  renderCalendar();
  await loadHistory();
  await loadActivityState();
  await loadActivityHistory();
}

async function init() {
  setupAuthEvents();
  const validToken = await verifyAuthToken();
  if (!validToken) {
    applyAuthView();
    return;
  }
  applyAuthView();
  await bootstrapDashboard();
}

init();
