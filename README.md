# FlowMate — AI Project Management Assistant

**Version 2.8.0 — Full Persistent Workspace + AI Everywhere**

A Slack-style organization workspace implemented entirely in **JavaScript with Node.js**. It combines team channels, controlled organization membership, profiles, notifications, user activity, themes, and AI-assisted project-management workflows.

## AI Everywhere

- Real Gemini-backed **Generate AI Plan** when `GEMINI_API_KEY` is configured, with local fallback behavior if external AI is unavailable.
- AI Suggest is available on supported writing fields, including Generate AI Plan extra instructions, with **Accept / Edit / Regenerate / Cancel** review before applying text.
- AI keys stay on the server and are never intentionally sent to the browser.


## Version 2.8 persistence update

- Sign in / Create ID card is centered on a clean, blank authentication screen.
- **Forgot password?** flow sends a 6-digit recovery code by SMTP and supports secure password replacement.
- Password reset codes are hashed, expiring, one-time use, and a successful reset revokes existing login sessions.
- **Turso libSQL is now the primary production database when configured.** Users, sessions, organizations, memberships, invitations, profiles, settings, notifications, channels/messages, projects, AI plans/tasks, risks, decisions, updates, change requests, suggestions, and audit logs all use the same persistent cloud database.
- Local development remains zero-config: if Turso variables are absent, the app automatically uses the existing local SQLite database.
- `/api/health/ready` reports `database_storage` as `turso` or `local-sqlite`, plus a `persistent` boolean.
- The AI Everywhere flow remains server-side and can use Gemini without exposing the API key to the browser.
- See **`DATABASE_SETUP_STEP_BY_STEP.md`** and **`RENDER_REDEPLOY_GUIDE.md`** for deployment.

## Fresh-start behaviour

- The application opens on **Sign in / Create ID**.
- No demo users, organization, channels, projects, tasks, messages, or reports are included.
- A newly registered user starts with an account only.
- Organization creation is optional after registration.
- Users without an active organization membership remain on onboarding instead of seeing the workspace.
- The workspace unlocks only after the user creates an organization or an accepted invitation is approved.

## Iteration 4 production polish

- Responsive mobile navigation drawer, compact top bar, touch-friendly controls, adaptive dialogs, tables, chat, cards, and forms.
- Accessibility improvements: skip link, semantic tabs and navigation, visible keyboard focus, focus-trapped dialogs, ARIA busy/live states, reduced-motion support, and forced-colour compatibility.
- Global and button-level loading states, request timeouts, offline/online feedback, recoverable error screens, and request reference IDs.
- HttpOnly `SameSite=Strict` session cookies backed by revocable server-side sessions. The Settings page lists active devices and supports current/other-device sign-out.
- Stronger password validation and versioned scrypt hashes while remaining compatible with accounts created by earlier iterations.
- Security headers, same-origin mutation protection, rate limiting, body-size limits, content-type validation, method handling, safer health responses, and production secret validation.
- Liveness/readiness endpoints, graceful shutdown, hardened server timeouts, and Docker deployment files. Local/Docker SQLite can use a volume; cloud production should configure Turso so the entire workspace survives app restarts/redeploys.

## Iteration 3 features

- Dedicated **Profile** page for name, avatar, role/department context, and workspace status.
- Dedicated **Settings** page with **Light and Dark** themes plus a quick toggle button.
- Theme preference is stored server-side and cached locally to prevent a startup flash.
- Dedicated **Notifications** page with unread count, mark-read, mark-all-read, and contextual navigation.
- Dedicated **Account activity** page for account creation, sign-ins, profile/settings/status changes, invitations, and membership events.
- Workspace statuses include:
  - 🟢 Available
  - 🔴 Busy
  - 🏖️ On Leave
  - 🏠 Remote
  - 🟡 In a Meeting
  - 🎯 Focus Time
  - ✈️ Travelling
  - custom emoji and label
- Status badges appear beside a user's name in channels, the People directory, member administration, task ownership, Kanban cards, and the sidebar.
- Live presence remains separate and supports Automatic, Online, Away, Do not disturb, and Appear offline.
- Notification preferences can independently control workspace, mention, invitation, and account-activity alerts.
- @username mentions generate private notifications.

## Organization and member features

- Dedicated **People directory** available to every active organization member.
- Member cards display avatar, full name, username, email, role, department, membership state, live presence, workspace status, status note, and last active time.
- Browser heartbeat keeps active users online and automatically moves inactive users to away/offline.
- CEO/admin can update roles, departments, active/suspended membership, and remove members.
- Invitations include a proposed role and department, with acceptance and final CEO/admin approval.
- Managers can cancel open invitations within their permission level.
- Users belonging to multiple organizations can switch from the sidebar.
- Any user can create an additional organization from inside the workspace and switch to it immediately.

## Requirements implemented

- Every person creates a unique user ID with username, email, full name, and password.
- Any registered user can create an organization and becomes its **CEO**.
- CEO can grant **admin**, **moderator**, or **member** access.
- Admin can manage moderators and members; moderators can invite members.
- Invitations require the exact registered username or email address.
- Joining is a two-step process: invited-user acceptance followed by CEO/admin approval.
- Dashboard, projects, tasks, channels, reports, and team administration require active organization membership.
- Projects, tasks, plans, risks, decisions, meeting notes, changes, reports, audit logs, JSON export, and CSV export are organization-scoped.
- Notifications and account activity are private to the signed-in user.

## Technology

- Node.js 22.5 or newer
- Built-in `node:http` web server
- Built-in `node:sqlite` database for zero-config local development
- Built-in `node:crypto` versioned scrypt password hashing, signed tokens, and server-side revocable sessions
- Plain HTML, CSS, and browser JavaScript
- `@libsql/client` for persistent Turso libSQL storage of the complete workspace when configured
- `nodemailer` for SMTP password-recovery email when configured

> `node:sqlite` may display an experimental API warning in Node.js 22. The application and tests still run normally.

## Run the application

From the extracted project folder:

```bash
npm start
```

Open:

```text
http://127.0.0.1:8000
```

The first page is Sign in. Select **Create ID** to register the first real user. For public deployment with persistent data, configure Turso before creating production users; see `DATABASE_SETUP_STEP_BY_STEP.md`.

## Reset all data

To permanently remove every account, organization, project, channel, message, notification, activity record, and other record:

```bash
npm run reset
npm start
```

The older `npm run seed` command is retained for compatibility and performs the same empty reset. It does not create demo data.

## Run tests

```bash
npm test
```

## Permission summary

| Action | CEO | Admin | Moderator | Member |
|---|:---:|:---:|:---:|:---:|
| Create/switch organizations | Yes | Yes | Yes | Yes |
| Invite admin | Yes | No | No | No |
| Invite moderator | Yes | Yes | No | No |
| Invite member | Yes | Yes | Yes | No |
| Final join approval | Yes | Yes | No | No |
| Change admin access | Yes | No | No | No |
| Manage moderators/members | Yes | Yes | Limited | No |
| Create channels/projects | Yes | Yes | Yes | No |
| View people directory & statuses | Yes | Yes | Yes | Yes |
| Manage own profile/settings/status | Yes | Yes | Yes | Yes |
| View own notifications/activity | Yes | Yes | Yes | Yes |
| Read channels/projects | Yes | Yes | Yes | Yes |
| Update project work | Yes | Yes | Yes | Yes |
| Approve AI proposals | Yes | Yes | Yes | No |

## Configuration

Use `.env.example` as the settings template for local/shell configuration. On Render, add the values in the service **Environment** settings. Important production settings:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=8000
DATABASE_PATH=data/project_assistant_js.db   # local fallback only
TOKEN_SECRET=replace-with-a-random-secret-of-at-least-32-characters
TOKEN_TTL_HOURS=24
SECURE_COOKIES=true
TRUST_PROXY=true
REQUEST_TIMEOUT_MS=30000
REQUEST_BODY_LIMIT_BYTES=1000000
AUTH_RATE_LIMIT_PER_15_MINUTES=60
API_RATE_LIMIT_PER_MINUTE=300
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-database-token
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
PASSWORD_RESET_CODE_TTL_MINUTES=15
```

When `NODE_ENV=production`, Orbit refuses to start if `TOKEN_SECRET` is missing or shorter than 32 characters. Set `SECURE_COOKIES=true` only when the public application is served over HTTPS. Set `TRUST_PROXY=true` only behind a trusted reverse proxy.

## Health endpoints

```text
GET /api/health
GET /api/health/live
GET /api/health/ready
```

The readiness endpoint checks database availability and is used by the included Docker health check.

## Docker deployment

Set a production secret, then build and run:

```bash
TOKEN_SECRET="replace-with-a-long-random-secret" docker compose up --build -d
```

Open `http://127.0.0.1:8000`. The `orbit-data` Docker volume is useful for local/container SQLite development. For public cloud deployment, configure Turso so all workspace records use the remote database. Use HTTPS with `SECURE_COOKIES=true` and `TRUST_PROXY=true`.

When Turso is not configured, local SQLite is still used and `DATABASE_PATH` controls its location.

## Folder structure

```text
src/
  auth.js          Password hashing, secure cookies, signed tokens, and session helpers
  config.js        Environment configuration
  db.js            SQLite/Turso async database adapter and full workspace schema
  aiEngine.js      Local JavaScript planning/risk engine
  server.js        HTTP API, authorization, notifications, and static delivery
public/
  index.html       Sign-in, onboarding, and workspace shell
  styles.css       Accessible responsive Light/Dark interface, mobile navigation, and loading/error states
  app.js           Authentication, resilient API handling, accessibility, sessions, workspace, and project UI
Dockerfile         Production container image and health check
docker-compose.yml Local/container SQLite deployment
scripts/
  reset.js         Rebuild a completely empty database
  seed.js          Compatibility alias for the empty reset
```
