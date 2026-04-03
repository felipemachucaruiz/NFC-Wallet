# Railway Deployment Guide

This guide walks through deploying both backend services (**API Server** and
**Attendee API**) to Railway and rebuilding the Expo web app to point at the
new Railway URLs.

---

## Prerequisites

- A [Railway](https://railway.app) account
- The [Railway CLI](https://docs.railway.app/develop/cli) installed (`npm i -g @railway/cli`)
- Node.js 20+ and pnpm installed locally
- The monorepo cloned and dependencies installed (`pnpm install`)

---

## 1. Create a Railway Project

1. Go to [railway.app](https://railway.app) and click **New Project**.
2. Choose **Empty Project** and give it a name (e.g. `tapee`).

---

## 2. Add Both API Services

Each service maps to one directory inside this monorepo. Railway supports
monorepos via the **Root Directory** setting.

### API Server

1. In your Railway project, click **+ New** → **GitHub Repo** (or **Empty Service** if using the CLI).
2. Set **Root Directory** to `artifacts/api-server`.
3. Railway will detect the `railway.toml` and use the build / start / release commands defined there.

### Attendee API

Repeat the same steps with **Root Directory** set to `artifacts/attendee-api`.

> **Using the CLI instead?**
> ```bash
> railway link          # link CLI to your project
> railway up --service api-server       --rootDirectory artifacts/api-server
> railway up --service attendee-api     --rootDirectory artifacts/attendee-api
> ```

---

## 3. Provision PostgreSQL

Both services share a single PostgreSQL database.

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**.
2. Railway creates the database and exposes a `DATABASE_URL` variable.
3. In each service's **Variables** tab, click **Reference another service's variable**
   and select the PostgreSQL plugin's `DATABASE_URL`.

This ensures both services connect to the same database.

---

## 4. Set Required Environment Variables

In each service's **Variables** tab on Railway, set the following.  
See the per-service `.env.example` files for the full list of optional variables.

### Variables required by both services

| Variable | Description |
|---|---|
| `DATABASE_URL` | Automatically set by linking the PostgreSQL plugin (step 3). |
| `PORT` | Set automatically by Railway — do **not** override this. |
| `TRUSTED_PROXY` | Set to `true` — Railway terminates TLS and forwards real client IPs. |
| `CLIENT_ID` | Your OIDC client ID. On Replit this was `REPL_ID`; on Railway set `CLIENT_ID` directly. |
| `OIDC_ISSUER_URL` | Your OIDC provider's issuer URL. Defaults to `https://replit.com/oidc` if omitted. |
| `NODE_ENV` | Set to `production`. |

### Additional variables for Attendee API only

| Variable | Description |
|---|---|
| `WOMPI_BASE_URL` | `https://production.wompi.co/v1` for live payments (optional). |
| `WOMPI_PUBLIC_KEY` | Wompi dashboard public key (optional). |
| `WOMPI_PRIVATE_KEY` | Wompi dashboard private key (optional). |
| `WOMPI_EVENTS_SECRET` | Wompi webhook secret (optional). |
| `APP_URL` | Public URL of the attendee web app, used for Wompi redirect URLs (optional). |

### Additional variables for API Server only

| Variable | Description |
|---|---|
| `HMAC_SECRET` | Global HMAC signing secret for bracelet transactions (optional). |
| `HMAC_MASTER_KEY` | Master key for deriving per-event HMAC secrets (optional). |

---

## 5. Deploy and Confirm Migrations Ran

Railway automatically runs the **release command** (`drizzle-kit migrate`) before
starting each service. This applies all pending SQL migrations in `lib/db/migrations/`
to the database.

To deploy manually via the CLI:
```bash
railway up --service api-server
railway up --service attendee-api
```

To verify migrations ran, open the service's **Deploy logs** in the Railway dashboard
and look for output from `drizzle-kit migrate`. All migration files should appear as
`[applied]` or `[already applied]`.

To confirm the services are healthy, hit each service's health check endpoint:
```bash
curl https://<api-server-domain>.up.railway.app/api/healthz
curl https://<attendee-api-domain>.up.railway.app/api/healthz
```

Both should return `{"status":"ok"}`.

---

## 6. Get the Railway Service URLs

In each service's **Settings** tab on Railway, find the **Public Domain**. It looks like:
```
my-api-server-production.up.railway.app
my-attendee-api-production.up.railway.app
```

Note these URLs — you need them in the next step.

---

## 7. Rebuild the Expo Web App with Railway Domains

The mobile app bundles the API domain at **Metro build time**. Simply updating
`.env` after the bundle is built has no effect — you must rebuild.

Set the two environment variables and export:

```bash
cd artifacts/mobile

EXPO_PUBLIC_DOMAIN=my-api-server-production.up.railway.app \
EXPO_PUBLIC_ATTENDEE_DOMAIN=my-attendee-api-production.up.railway.app \
npx expo export --platform web
```

This produces a `dist/` directory with a fully self-contained web bundle that
calls your Railway services.

> **What these variables do:**
> - `EXPO_PUBLIC_DOMAIN` — host-only domain (no `https://`) for the API Server.
> - `EXPO_PUBLIC_ATTENDEE_DOMAIN` — host-only domain for the Attendee API. If
>   omitted, all requests fall back to `EXPO_PUBLIC_DOMAIN`.

---

## 8. (Optional) Environment-Specific `.env` Files

Copy each service's `.env.example` to `.env` for local development:

```bash
cp artifacts/api-server/.env.example   artifacts/api-server/.env
cp artifacts/attendee-api/.env.example artifacts/attendee-api/.env
cp artifacts/mobile/.env.example       artifacts/mobile/.env
```

Fill in the values and keep these files **out of version control** (they are
already listed in `.gitignore`).

---

## Architecture Overview

```
Railway Project
├── api-server          (artifacts/api-server)
│   ├── Build:   pnpm install && pnpm run build
│   ├── Release: drizzle-kit migrate
│   └── Start:   pnpm run start
│
├── attendee-api        (artifacts/attendee-api)
│   ├── Build:   pnpm install && pnpm run build
│   ├── Release: drizzle-kit migrate
│   └── Start:   pnpm run start
│
└── PostgreSQL plugin   (shared DATABASE_URL)

Mobile (Expo web bundle)
└── Built locally with EXPO_PUBLIC_DOMAIN + EXPO_PUBLIC_ATTENDEE_DOMAIN
    pointing to the Railway service domains above.
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Service crashes on start | Missing `DATABASE_URL` | Link the PostgreSQL plugin in the service's Variables tab |
| Auth redirects fail | Wrong `CLIENT_ID` or `OIDC_ISSUER_URL` | Verify the OIDC provider matches the client ID |
| Mobile app calls wrong API | `EXPO_PUBLIC_DOMAIN` not set before build | Rebuild the Expo web bundle with the correct env vars |
| Rate limiter blocks all traffic | `TRUSTED_PROXY` not set | Set `TRUSTED_PROXY=true` in the service's Variables |
| Migrations not applied | Release command failed | Check Deploy logs; ensure `DATABASE_URL` is set before first deploy |
