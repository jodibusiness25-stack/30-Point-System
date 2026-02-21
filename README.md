# Daily 30-Point Activity Tracker (Premium UI)

Full-stack tracker with a NYL-style navy dashboard, points + leveling, drill-down analytics, SQLite persistence, and Motion API sync.

## Stack
- Frontend: plain HTML/CSS/JS (`/client`)
- Backend: Node.js + Express (`/server`)
- DB: SQLite (`/server/tracker.sqlite`)
- Charts: Chart.js CDN (drawer charts only)

## Core Features
- Daily metrics input and real-time points calculation
- Save to backend (`POST /api/log`)
- SQLite upsert by date
- Motion task create/update per date (server-side API key only)
- Monday-start week logic (`weekStartMonday` on logs)

## Premium UI Features
- Points and level system with lifetime progression
- Daily progress bar (0-30) + overflow strata stripes for >30
- Configurable daily dial goal with hit-state + scaling progression tiers
- Configurable daily + weekly appointment goals with live dashboard progress bars
- Monthly activity calendar with Apple-ring-inspired daily quick view
- Level progress bar: `Level X • levelXP / xpToNext`
- Time-aware greeting integrated into header (Eastern Time)
- Personalized greeting using account display name
- Full profile drawer for account, level, settings, and dashboard management
- Teammate system (requests + accepted teammates)
- Shared activity sessions with invites, live timer, and running leaderboard
- Activity Mode state on dashboard while a session is active
- Activity sessions history screen with final leaderboard, participants, start/end, duration
- Calendar integration for session days with quick session drill-down
- Startup dashboard animation on first open (session) with premium ring motion
- Dynamic palette that shifts by time of day (morning/afternoon/evening/night)
- Minimal level-up celebration (toast + shimmer + subtle micro-confetti)
- Compact metric tiles with:
  - Count
  - Points contributed
  - `(xN)` multiplier
  - 7-day inline SVG sparkline
- Metric drill-down drawer:
  - Periods: `7D, 14D, 30D, This Week (Mon), This Month, YTD, Custom`
  - Line chart (daily count)
  - Bar chart (daily metric points)
  - Donut chart (period point share by metric)
- Minimal icon actions: Save, Reset, History (with aria-label + tooltip)
- Dark mode + compact mode toggles (persisted in `localStorage`)

## Points / Level Rules
- Daily goal: `30 Points`
- Formula:
  - `XPToNext(L) = round(30 * (LEVEL_EXP_BASE ** (L - 1)))`
  - Default `LEVEL_EXP_BASE = 1.20`
- Stored in SQLite `player_state`:
- Stored per user in SQLite `user_player_state`:
  - `lifetimeXP, level, levelXP, xpToNext`
- Save behavior:
  - Computes earned points from the current day
  - Uses delta vs previously saved same-day points (safe on edits)
  - Applies multi-level ups automatically
  - Stores daily dial goal and whether goal was hit
  - Recomputes lifetime points from all saved logs for consistency on edits/concurrent saves

## Motion Task Content
Task title:
- `Daily Activity - YYYY-MM-DD`

Description includes:
- Full metric breakdown
- Daily points / total points
- Dials and ratio
- Level progress (`levelXP/xpToNext`) and lifetime points
- FYC section

If date already has `motionTaskId`, backend attempts task update. If update fails, existing ID is kept and duplicate create is skipped.

## Project Structure
```text
client/
  index.html
  styles.css
  app.js
  charts.js
server/
  package.json
  db.js
  index.js
```

## Setup
1. Install server dependencies:
```bash
cd /Users/jodizaky/Documents/masterboard:/server
npm install
```

2. Create `/Users/jodizaky/Documents/masterboard:/server/.env`:
```env
PORT=3000
MOTION_API_KEY=your_motion_api_key_here
MOTION_PROJECT_ID=your_motion_project_id_here
LEVEL_EXP_BASE=1.20
APP_TIMEZONE=America/New_York
MOTION_API_BASE_URL=https://api.usemotion.com
SQLITE_PATH=/Users/jodizaky/Documents/masterboard:/server/tracker.sqlite
BACKUP_DIR=/Users/jodizaky/Documents/masterboard:/server/backups
BACKUP_CHECK_INTERVAL_MINUTES=30
MOTION_ALERT_PENDING_THRESHOLD=25
MOTION_ALERT_FAILED_THRESHOLD=5
APP_PUBLIC_URL=https://your-domain-or-localhost:3000
PASSWORD_RESET_TTL_MINUTES=60
PASSWORD_RESET_MIN_INTERVAL_SECONDS=30
# Optional debug helper (returns token in API response). Keep 0 in production.
PASSWORD_RESET_DEBUG_RESPONSE=0
```

3. Start:
```bash
npm run dev
```
or
```bash
npm start
```

4. Open:
- `http://localhost:3000`

## Always-On Deployment (Render + Persistent Disk)
This repo is configured for always-on deployment with Render.

- `render.yaml` defines the web service and a persistent disk.
- SQLite data path is set through `SQLITE_PATH=/var/data/tracker.sqlite`.

Deploy:
1. Push repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Confirm env vars and add secrets:
   - `MOTION_API_KEY`
   - `MOTION_PROJECT_ID`
4. Deploy, then use the Render URL (or your custom domain).

## API Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/profile`
- `POST /api/profile`
- `GET /api/teammates` (alias: `/api/friends`)
- `POST /api/teammates/request` (alias: `/api/friends/request`)
- `POST /api/teammates/respond` (alias: `/api/friends/respond`)
- `GET /api/people/:userId`
- `GET /api/activity/state`
- `POST /api/activity/start`
- `POST /api/activity/invite`
- `POST /api/activity/respond-invite`
- `POST /api/activity/leave`
- `POST /api/activity/stop`
- `GET /api/activity/history`
- `POST /api/team/create`
- `POST /api/team/assign-role`
- `POST /api/team/add-member`
- `POST /api/log`
- `GET /api/history`
- `GET /api/player-state`
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/health`
- `POST /api/motion/retry`
- `GET /api/export`
- `GET /api/analytics?metric=phoneContacts&period=7d`
- `GET /api/analytics?metric=applications&period=custom&from=2026-01-01&to=2026-01-31`

## Appointment Goals
- Daily appointment goal and weekly appointment goal are stored in server settings.
- Weekly progress is Monday-start and updates live on dashboard based on selected date week.
- Goal changes are persistent and do not create duplicate day logs.
- Settings keys:
  - `defaultDailyAppointmentGoal`
  - `defaultWeeklyAppointmentGoal`

## Activity Calendar
- Calendar is Monday-first and month-navigable.
- Each day shows 3 mini rings for quick progress:
  - Outer ring: Points vs 30
  - Middle ring: Dials vs dial goal
  - Inner ring: Appointments vs daily appointment goal
- Tap any day to view quick details and jump the form date.
- Includes ring legend and goal-hit glow states for faster scanning.

## Quick Calculator
- Inline sleek calculator card on dashboard.
- Keypad and keyboard Enter support.
- Stores running history capped to the most recent 5 calculations.

## Theme Customization
Edit CSS variables in `/Users/jodizaky/Documents/masterboard:/client/styles.css`:
- `--bg, --card, --text, --muted, --border, --shadow, --radius`
- `--primary, --primary-2, --accent, --success, --warning, --danger`

Dark mode overrides are under `body.theme-dark`.

## Leveling Speed Customization
Change exponent base from default `1.20`:
- Recommended: set `LEVEL_EXP_BASE` in `/server/.env`
```env
LEVEL_EXP_BASE=1.15
```
- Lower value => faster leveling
- Higher value => slower leveling

## Timezone
- App logic is standardized to Eastern Time via:
  - `APP_TIMEZONE=America/New_York`
- This affects:
  - server-side "today"
  - period filters (`7D`, `This Week`, etc.)
  - Monday-start weekly logic behavior

## Sustainability / Failsafes
- SQLite durability tuned for long-running local use:
  - `WAL` journal mode
  - busy timeout
  - sync mode tuned for reliability/performance balance
- Input guardrails:
  - numeric fields clamped to safe max values
  - `fycNotes` length limited
  - date validation and custom analytics range limits
- Motion outbox model:
  - each log keeps `motionSyncStatus`, `motionSyncAttempts`, `motionLastError`
  - failed Motion sync does not block local save
  - automatic retry worker runs every 10 minutes
  - manual retry endpoint: `POST /api/motion/retry`
- Health and observability:
  - `GET /api/health` includes pending/failed Motion counts
  - includes alert flags when pending/failed exceed thresholds
  - includes backup worker status (`backup.lastBackupDay`, `backup.dir`)
  - UI shows Motion sync badge (`OK`, `pending`, `failed`) and per-row sync status
- Nightly backup snapshots:
  - server writes one JSON snapshot per day into `BACKUP_DIR`
  - backup runs automatically on startup and interval checks
- Data portability:
  - `GET /api/export` returns all logs + settings + player state JSON for backup/migration
- Client resilience:
  - local draft autosave and restore
  - unsaved changes warning on page unload
  - debounced autosave + interval autosave to backend/Motion throughout day
  - autosave avoids writing empty all-zero days unless manually saved

## Motion Dedup + Save Semantics
- One Motion task per date is enforced by local `motionTaskId`:
  - first save for date => create task
  - later saves same date => update same task (no duplicates)
- Server emits `saveKind`:
  - `new_day` on first save of date
  - `update` on subsequent saves
- Each day tracks `saveRevision` (increments on every save).
- Motion description includes:
  - `Save Type: NEW_DAY | UPDATE`
  - `Save Revision: N`
- When Motion credentials are linked/updated for a user (`POST /api/settings` with `motionApiKey`/`motionProjectId`), the server auto-queues and backfills that user's full history to Motion.

## Maintenance Routine (recommended)
1. Check `GET /api/health` weekly.
2. If Motion shows pending/failed items, run `POST /api/motion/retry`.
3. Backup data periodically with `GET /api/export`.
4. Before editing/deploying, run:
```bash
./scripts/safe-deploy-check.sh
```

## Multi-User Isolation
- The app now uses account auth (register/login) and scopes all data by `userId`.
- Each user gets completely separate:
  - logs/history
  - points/levels
  - goals/settings
  - Motion sync state/task links
- One user cannot query another user's data through API endpoints.

## Profile Management
- Registration supports `displayName`.
- Profile panel lets each user manage:
  - Account: `displayName`, email, joined date
  - Progress: level and lifetime points
  - Settings: timezone, dial goal, daily/weekly appointment goals, Motion credentials/project
  - Dashboard management: Motion retry + JSON export
- Greeting pulls from `displayName` and updates immediately after profile save.
- Team context is shown in profile and header brand roll (`teamName`).

## Team Model
- The app now has a `teams` table with default team `Stakks Unit`.
- New and existing users are assigned `teamId=1` by default so all members see `Stakks Unit`.
- The first real account (legacy owner) is auto-titled `Team Lead`.
- Auth/profile responses include:
  - `teamId`
  - `teamName`
  - `teamSlug`
- `roleTitle` is included for team position display.
- Stakks Unit dashboard shows a compact gold `Team Lead` marker only for the Stakks lead user.
- A reserved Partner slot is shown in profile (`Partner: Unassigned` until assigned).
- For future multi-team expansion:
  1. Keep `teams` as-is for team metadata.
  2. Add `team_memberships(userId, teamId, role, joinedAt)` for many-to-many membership.
  3. Add `users.activeTeamId` (or session-level active team) to switch dashboard context cleanly.
  4. Scope activity sessions/friends/leaderboards by active team when needed.

## Team Position Management
- Create a new team from profile:
  - `POST /api/team/create` with `{ teamName }`
  - Creator is assigned `Partner` for that new team.
- Assign roles inside your team:
  - `POST /api/team/assign-role` with `{ email, roleTitle }`
  - Allowed roles: `Member`, `Partner`, `Team Lead`
  - Only `Partner` can assign `Team Lead` (Team Leads cannot appoint Team Leads)
  - `Partner` slot is single-occupancy per team
- Add member to your team:
  - `POST /api/team/add-member` with `{ email }`
  - Only `Team Lead` or `Partner` can add members to the team
  - Members cannot add people to their team
- Friendship remains cross-team:
  - users can send teammate/friend requests across different teams/units
- Profile privacy:
  - settings include `showCurrentStats` (on/off)
  - when off, current stats are hidden from other users
- Connection profile visibility:
  - profile preview shows relation tags (`Teammate`, `Friend`)
  - `Team Lead` and `Partner` titles are only visible within the same team
  - outside the team, privileged titles are hidden
- To assign Partner later:
  1. Open profile.
  2. In Team Roles, enter teammate email.
  3. Select `Partner`.
  4. Click Assign.

## Shared Activity System
- Start a named session from the dashboard.
- Invite accepted teammates into the active session.
- Site automatically enters `Activity Mode` with:
  - session name visibility
  - running timer
  - participant list
  - live leaderboard
- Leaderboard score updates from point deltas whenever participants save during the active session.
- Sessions are persisted and shown in:
  - dedicated Activity Sessions screen
  - calendar day detail cards for corresponding start dates
- Session history shows final leaderboard, duration, start/end times, and participants.

## Env (new)
Add this in `/server/.env`:
```env
AUTH_SECRET=replace_with_long_random_secret
APP_PUBLIC_URL=https://your-deployed-domain
PASSWORD_RESET_TTL_MINUTES=60
PASSWORD_RESET_MIN_INTERVAL_SECONDS=30
PASSWORD_RESET_DEBUG_RESPONSE=0
```

## Account Recovery / Password Reset
- Auth card now includes:
  - `Forgot password?` (requests reset token/link)
  - `Have reset code?` (enter token + new password)
- Security behavior:
  - reset token is random and stored hashed in SQLite
  - token expires (default 60 minutes)
  - single-use token (cannot be reused)
  - short request throttling to prevent spam
- In non-production (or when `PASSWORD_RESET_DEBUG_RESPONSE=1`), API also returns reset token/link in response to speed local testing.

## Mac Env Vars
Temporary (current terminal):
```bash
export MOTION_API_KEY="your_motion_api_key_here"
export MOTION_PROJECT_ID="your_motion_project_id_here"
export PORT=3000
export LEVEL_EXP_BASE=1.20
export APP_TIMEZONE="America/New_York"
export SQLITE_PATH="/Users/jodizaky/Documents/masterboard:/server/tracker.sqlite"
```

Persistent (`~/.zshrc`):
```bash
echo 'export MOTION_API_KEY="your_motion_api_key_here"' >> ~/.zshrc
echo 'export MOTION_PROJECT_ID="your_motion_project_id_here"' >> ~/.zshrc
echo 'export PORT=3000' >> ~/.zshrc
echo 'export LEVEL_EXP_BASE=1.20' >> ~/.zshrc
echo 'export APP_TIMEZONE="America/New_York"' >> ~/.zshrc
echo 'export SQLITE_PATH="/Users/jodizaky/Documents/masterboard:/server/tracker.sqlite"' >> ~/.zshrc
source ~/.zshrc
```
