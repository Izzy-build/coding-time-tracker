# Coding Time Tracker: web frontend

Next.js (App Router) + React + TypeScript + Tailwind CSS. It talks to the existing Fastify backend in the parent
folder and **changes nothing in it**.

Pages: landing `/` · sign in / create account `/auth` · dashboard (total time + CLI token) `/dashboard` ·
profile `/profile` · leaderboard `/leaderboard`.

## Run it

```bash
# 1) backend (parent folder), as usual: docker compose up -d && npm run db:migrate && npm run dev   -> http://127.0.0.1:3000
# 2) frontend
cd frontend
npm ci
cp .env.example .env.local        # defaults work for local development
npm run dev                       # http://localhost:3001
```

The frontend uses port **3001** because the backend already owns 3000.

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | develop / production build / serve the build (port 3001) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint 9 flat config |
| `npm test` | unit tests (Vitest): API client, stores, validation, formatting |
| `npm run e2e` | browser tests (Playwright) against a **running** backend + frontend, see below |

## Environment variables (`.env.local`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | *(empty)* | Empty: the browser calls same-origin `/api/v1/*` and Next proxies it to `BACKEND_URL`. Set it (e.g. `http://127.0.0.1:3000`) to call the backend directly. |
| `BACKEND_URL` | `http://127.0.0.1:3000` | Server-side proxy target. Read at **build** time, so set it before `npm run build`. |

**Why a proxy by default?** The backend's CORS allow-list (`CORS_ORIGINS`) defaults to `http://localhost:3000`, which is the
backend's own address, so a browser app on any other port would be blocked. The proxy makes every API call same-origin, so
no backend change is needed. If you prefer direct calls, set `NEXT_PUBLIC_API_URL` **and** add this app's origin
(e.g. `http://localhost:3001`) to the backend's `CORS_ORIGINS`.

## How it integrates with the API

```
src/lib/api/        client.ts (the only fetch), auth.ts, tokens.ts, profile.ts, leaderboard.ts, schemas.ts (Zod), errors.ts
src/lib/auth/       session store (JWT), CLI-token store, auth context
src/components/     ui primitives, auth form, dashboard (TotalTimeCard, TokenPanel), leaderboard, profile
src/app/            routes; (app)/ is the signed-in group with the route guard
```

- **Sign-in:** one form, same `POST /signin`. The UI tells the user what happened: 201 on the *Sign in* tab means an account
  was just created (usually a mistyped email) and a sticky warning says so; 200 on *Create account* says "you already had an account".
- **JWT:** kept in `localStorage` with its expiry. It expires on time even if the tab stays open, an expired stored session is
  purged, and a JWT rejected by the API signs the user out once with an explanation. The guard redirects at most once and
  the sign-in page only redirects *away* when a session exists, so the two cannot loop.
- **CLI token:** the backend stores only a hash, so the raw token can never be fetched again, and `GET /token/get` answers 409 once
  one exists. The UI therefore: shows the token once after generating/rotating (masked bullets by default, never in the DOM
  while hidden; reveal and copy buttons); keeps it **only in `sessionStorage`** (this tab, cleared on close and on sign-out,
  bound to the user id); and, when a token exists but isn't held in this tab, says so and offers "Update token".
  Updating always asks for confirmation first.
- **Total coding time:** with the token in this tab it comes from `GET /profile/:token`. Without it (returning user, new tab)
  the dashboard finds the user on the public leaderboard (scans up to 20 pages of 100). `/validate` and `/report` are CLI
  endpoints and are not used by the UI.
- **Secrets:** the password is only ever sent to `/signin` and never stored; nothing is logged; CLI tokens appear only in the
  two URLs the backend contract requires (`/profile/:token`, which the UI uses only when needed); `Referrer-Policy: no-referrer`,
  a CSP, `X-Frame-Options` and `nosniff` are set in `next.config.ts`.

## End-to-end tests

```bash
# backend running with a raised sign-in limit (every test signs up fresh users): AUTH_RATE_LIMIT_MAX=200
# frontend running: npm run build && npm start
npx playwright install chromium     # once
npm run e2e                         # desktop journey + states + mobile/tablet/laptop layout checks
```

`E2E_BASE_URL` (default `http://127.0.0.1:3001`) and `E2E_API_URL` (default `http://127.0.0.1:3000`) override the targets.
The tests act as the CLI by calling `/validate` and `/report` on the backend directly. Screenshots go to `E2E_SHOTS_DIR`
(default `test-results/screens`).

## Notes and known limits

- `eslint-config-next` is **not** used: its dependency chain includes `braces <= 3.0.3` (high-severity advisory, no patched release),
  and `npm audit fix --force` would only downgrade it to Next 14's config. ESLint is configured directly with
  `typescript-eslint`, `react-hooks` and `jsx-a11y`, so Next's own lint rules are not included.
- TypeScript is pinned to 6.0.3 (Next's build uses the classic compiler API; TypeScript 7 is the native port).
- Fonts are the system font stack (no external requests).
- The CLI token cannot be recovered after you close the tab: that is the backend's hash-only design. Rotate to get a new one.
