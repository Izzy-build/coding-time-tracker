# Coding Time Tracker API

Backend for a CLI-based coding-time tracker with a public leaderboard.
TypeScript, Node.js, Fastify 5, PostgreSQL, Drizzle ORM, Zod, JWT, Argon2id, OpenAPI/Swagger.

**The CLI measures coding time.** About every 5 minutes it reports the *new* seconds since its previous
report, and the backend adds them to the user's cumulative total with one atomic SQL increment.
There are no sessions, heartbeats, idle timers or server-side duration calculations.

## Frontend

The web UI lives in [`frontend/`](frontend/README.md) (Next.js, separate `package.json`; it only consumes the API below). Run it on port 3001.

## Quick start

Requirements: Node.js >= 22.12, Docker (or a local PostgreSQL 16).

```bash
npm ci
docker compose up -d                 # PostgreSQL :5432 (creates `ctt` and `ctt_test`)
cp .env.example .env                 # then set JWT_ACCESS_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run db:migrate
npm run dev                          # http://localhost:3000   Swagger UI: /docs
```

Already have a `.env` from the previous version? It keeps working: every new variable has a default, and the
removed ones (`HEARTBEAT_INTERVAL_SECONDS`, `IDLE_TIMEOUT_SECONDS`, `SESSION_SWEEP_INTERVAL_SECONDS`,
`REFRESH_TOKEN_TTL_DAYS`) are simply ignored; delete them when convenient.

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Apply migrations | `npm run db:migrate` (`npm run db:migrate:prod` against the build) |
| New migration after editing `src/db/schema.ts` | `npm run db:generate` |
| Tests (real PostgreSQL, `TEST_DATABASE_URL`) | `npm test` |
| Lint / typecheck / build / run build | `npm run lint` / `npm run typecheck` / `npm run build` / `npm start` |

## API (all under `/api/v1`)

| Endpoint | Credential | Purpose |
| --- | --- | --- |
| `POST /signin` | none | Create the account if the email is new, otherwise log in. Returns a website JWT (201 created / 200 login) |
| `GET /token/get` | website JWT | Generate the CLI token (`ctt_` + 21 letters/digits = 25 chars). 409 `TOKEN_ALREADY_EXISTS` if one is active |
| `GET /token/update` | website JWT | Rotate: revoke the current token immediately, return a new one |
| `GET /validate/:token` | CLI token | `200 {"message":"User exists"}` or `401 {"message":"User does not exist"}` |
| `POST /report` | CLI token (body) | `{ "token", "seconds" }` -> `{ message, addedSeconds, totalSeconds }` |
| `GET /profile/:token` | CLI token | Safe profile: `userId, username, name, email, createdAt, totalSeconds` |
| `GET /leaderboard` | none | Users by cumulative seconds, paginated (`page`, `pageSize`) |

Swagger UI at `/docs`, raw spec at `/docs/json` (disable with `DOCS_ENABLED=false`).

Errors use `{ "error": { "code", "message" } }` (400 / 401 / 404 / 409 / 413 / 429 / 500). The single deliberate
exception is the failure body of `/validate/:token`, which is `{ "message": "User does not exist" }` to match the CLI contract.

### Reporting rules

- `seconds` must be an integer from 1 to `REPORT_MAX_SECONDS` (default 3600). Zero, negative, decimal, string,
  null and over-limit values are rejected with 400.
- The increment is `INSERT ... ON CONFLICT (user_id) DO UPDATE SET total_seconds = total_seconds + $n`:
  concurrent reports serialise on the row lock, so none is lost (tested with 20 parallel requests).
- Totals are stored as integer seconds (`bigint`), never hours.
- **Retries / duplicates:** there is no `reportId` in this version (the CLI developer has not agreed to send one).
  If a response is lost and the CLI resends the same delta, it is counted twice. Recommended CLI behaviour: only
  reset its local counter after a 2xx. If an idempotency key is wanted later, add an optional `reportId` with a
  unique constraint on `(user_id, report_id)`.

### Credentials

- **Website JWT** (HS256, claims `sub`, `typ`, `iss`, `iat`, `exp` only; default lifetime 7 days via
  `JWT_ACCESS_TTL_SECONDS`): accepted only by `/token/:action`.
- **CLI token**: exactly **25 characters**, `ctt_` + 21 random characters from `[A-Za-z0-9]`
  (e.g. `ctt_A7k92LmX4pQ8zN3bT6vR1`, ~125 bits from the OS CSPRNG via `crypto.randomInt`). Only its SHA-256 hash is
  stored (unique index -> one indexed lookup per request). Exactly one active token per user (enforced by a partial
  unique index). Because only the hash is stored, the raw
  value can be shown once; a user who lost it calls `/token/update`.
- Neither credential is accepted in place of the other.
- **Early rejection:** `/validate`, `/report` and `/profile` all go through one function (`TokensService.resolve`),
  which first checks the format `^ctt_[A-Za-z0-9]{21}$` (string, exactly 25 chars, prefix, alphabet). A malformed token
  is rejected *before* hashing and before any database query (tested by spying on the DB pool). The flow is
  `format check -> SHA-256 -> indexed lookup`. Malformed or unknown tokens give 401 (`/validate`:
  `{"message":"User does not exist"}`); a missing / non-string `token` in `/report` gives 400.

## Database

```
users          id, username (unique, case-insens.), name?, email (unique, lowercase), password_hash, created_at, updated_at
cli_tokens     id, user_id -> users, token_hash (unique), created_at, revoked_at   [one active token per user]
coding_stats   id, user_id -> users (unique), total_seconds bigint >= 0, updated_at [index: total_seconds DESC]
```

### Migrations (history preserved, nothing deleted)

| File | What it does |
| --- | --- |
| `0000_init.sql` | Original schema (unchanged) |
| `0001_add_cli_architecture.sql` | **Expand:** creates `cli_tokens`, `coding_stats`, adds `users.name`, then **copies data**: one stats row per user with their old session total, and each user's newest *active* old CLI token (so existing CLI installs keep working) |
| `0002_drop_session_system.sql` | **Contract:** drops `coding_sessions`, `activity_heartbeats`, `api_tokens`, `refresh_tokens` and the status enum |

Expand-then-contract means a production database can take 0001, verify the carried-over data, and only then
take 0002. For a throw-away dev database you may instead `docker compose down -v` and re-run `npm run db:migrate`.
Refresh tokens are not migrated (that mechanism no longer exists; users sign in again).

## Security notes

Argon2id passwords (every sign-in path costs one Argon2 operation); strict per-IP rate limit on `/signin`
(`AUTH_RATE_LIMIT_MAX`) and a separate one on the CLI endpoints (`CLI_RATE_LIMIT_MAX`); Zod validation everywhere;
CORS allow-list; Helmet headers (incl. `Referrer-Policy: no-referrer`); `Cache-Control: no-store` on every
secret-bearing response; 16 KB body limit.

CLI tokens appear in URLs, so request logging masks them (`ctt_[REDACTED]`), and unexpected-error logging strips SQL
parameters. Both are covered by tests. Put the API behind TLS, and be aware that reverse proxies / CDNs may keep their
own access logs of URLs.

Known limits:
- Leaderboard integrity rests on the CLI being honest; the backend only bounds each report (`REPORT_MAX_SECONDS`)
  and the request rate. A scripted client can still inflate totals at up to `REPORT_MAX_SECONDS` per request.
- `/signin` creating accounts means a wrong password for a *known* email (401) differs from creating a new one (201),
  so email existence is inferable; the rate limit is the mitigation. Add email verification if that matters.
- Rate limits are in-memory per process (use a shared store when running several instances); set `TRUST_PROXY=true`
  only behind a trusted proxy.
- `GET` endpoints that change state (`/token/get`, `/token/update`) are mandated by the contract; they require an
  `Authorization` header (not a cookie), so they are not CSRF-able, and they are never cached.
