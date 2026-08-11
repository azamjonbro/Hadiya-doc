# Authentication & RBAC Architecture

## Passwords
argon2id hashing. No plaintext or reversible storage anywhere, including logs.

## Tokens
- **Access token**: short-lived JWT (~15 min), held in memory on the
  frontend (not localStorage), sent as `Authorization: Bearer`.
- **Refresh token**: `httpOnly`, `Secure`, `SameSite=strict` cookie. Stored
  **hashed** in the `sessions` collection. Rotated on every use
  (`replacedBy` chain). If a token is presented that's already been rotated
  away, the entire session family is revoked — that's the theft-detection
  signal.
- `/auth/refresh` is the only cookie-authenticated endpoint and carries a
  double-submit CSRF token, since it's the one place a cookie alone drives
  an action.

## Login hardening
- Pluggable CAPTCHA provider (default hCaptcha).
- `express-rate-limit` + `express-slow-down` on `/auth/login`.
- Account lockout: `failedLoginAttempts`/`lockedUntil` on the `users` doc,
  reset on successful login.
- Every login attempt (success or failure) is written to `auditLogs`.

## No public registration
Only `SUPERADMIN`/`ADMIN`/`MANAGER` create users, and a `MANAGER` can only
create employee-tier roles within their own department (checked
server-side, not just hidden in the UI). SuperAdmin is seeded from
`SUPERADMIN_EMAIL` / `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` env vars
**only if no SUPERADMIN exists yet** — the seed script is idempotent and
never overwrites an existing account. Production deployments must set a
real password; there is no baked-in default.

## RBAC: permission-based, not role-name-based
- The `roles` collection maps a role name to a list of permission keys
  (`course:create`, `video:upload:review`, `report:export`, ...).
- `requirePermission('course:create')` middleware checks the caller's
  resolved permission set, embedded as claims in the access token at
  issuance so authorization checks don't need a DB round-trip per request.
- **Adding a new role is a data operation, not a code change** — insert a
  `roles` document with the desired permission list. The six seeded roles
  (`SUPERADMIN, ADMIN, MANAGER, EMPLOYEE, CALL_OPERATOR, SELLER`) are just
  the initial rows in that collection.
- Resource-level checks layer on top of permission checks: having
  `video:view` doesn't mean *every* video — the middleware also verifies
  the caller has an active `courseAssignment` for that video's course (or
  is an admin-tier role that bypasses assignment scoping).

## Frontend guards are UX only
Route guards (`beforeEach`) and permission-gated UI (`v-if`) exist in both
`front/` and `admin/` purely to avoid showing users controls they can't use.
Every single one of them is backed by the exact same check enforced on the
backend — bypassing the frontend guard (devtools, direct API calls,
modified requests) hits the same 401/403 the UI would have shown. `/401`,
`/403`, and `/404` are real routed pages driven by actual API response
codes, not client-side guesses.
