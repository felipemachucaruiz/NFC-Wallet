# Workspace

## Overview

Contactless cashless event payment system for the Colombian market. Attendees load money onto NFC bracelets (NTAG213/215) secured with HMAC-SHA256 signing. Merchants charge bracelets via a product cart. Bank staff handle top-ups. Includes commission tracking, merchant payouts, warehouse/inventory management with auto-restock, and full audit trail.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod v3 (import as `"zod"`, NOT `"zod/v4"`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Email + password (bcrypt) with server-side sessions (SID in DB); `openid-client` kept for legacy OIDC routes
- **NFC security**: HMAC-SHA256 (`balance:counter` signed with `HMAC_SECRET`)

## Key Design Decisions

- **Zod import**: Always `import { z } from "zod"` — the project uses zod v3.x
- **Bracelet payload**: `{ balance, counter, hmac }` stored on NTAG213/215. HMAC = sha256(`balance:counter`, HMAC_SECRET). Counter prevents rollback attacks.
- **Commission**: `commission = Math.round(gross × rate / 100)`, stored per transaction log
- **COGS tracking**: `unit_cost_snapshot` on transaction line items; products have both `price_cop` and `cost_cop`
- **Auto-restock**: After each transaction, if location inventory ≤ `restockTrigger` and no pending restock order, one is auto-created
- **Inventory Mode**: Per-event toggle between `location_based` (each location self-manages stock) and `centralized_warehouse` (warehouse dispatches to locations). Event admin toggles via settings screen. In `location_based` mode, warehouse dispatch and restock order endpoints return 409; warehouse admin screens show an informational state; merchant-admin stock screen shows a "self-managed stock" banner.
- **NFC Chip Type**: Per-event configuration of wristband hardware via `nfc_chip_type` column (`ntag_21x` or `mifare_classic`). Event admin selects chip type in event settings. POS and bank screens show an informational (non-blocking) alert when the detected chip type doesn't match the event's configured type.
- **Roles**: `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, `admin`
- **Currency**: All monetary values in Colombian Pesos (COP, integer)
- **lib packages must be built** before api-server can typecheck: run `pnpm exec tsc -p tsconfig.json` in `lib/db` and `lib/api-zod`

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port from $PORT env, default 8080)
│   ├── mobile/             # Expo React Native app (6 role-based portals) — port 18115
│   └── attendee-app/       # Expo React Native consumer wallet app — port 18116
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`)
- **Build lib packages first**: `cd lib/db && pnpm exec tsc -p tsconfig.json` then `cd lib/api-zod && pnpm exec tsc -p tsconfig.json`
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck; actual JS bundling by esbuild

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Mobile OTA Update Workflow (EAS Update)

`expo-updates` is configured. JS/TS changes do NOT require a new APK — push them OTA in ~60 seconds.

**Push an update (from workspace root):**
```bash
cd artifacts/mobile
pnpm run update -- --message "Description of changes"
# or for development channel:
pnpm run update:dev -- --message "Description of changes"
```

**When you DO need a full APK build:**
- New native module added (NFC, camera, etc.)
- `app.json` permissions or splash changes
- Major Expo SDK upgrade

**EAS config:**
- Account: `felipemachucadj` (already logged in)
- Project ID: `26d76893-d65f-457a-b2eb-7fa177110638`
- Channels: `preview` (production-like APK), `development` (dev client APK)
- Runtime version policy: `appVersion` — tied to the version field in app.json
- Dashboard: https://expo.dev/accounts/felipemachucadj/projects/mobile/updates

**Note:** The next APK build (`pnpm run build:apk`) will embed expo-updates so devices can auto-receive OTA updates on launch.

## Packages

### `artifacts/attendee-app` (`@workspace/attendee-app`)

Consumer-facing Expo mobile wallet app for event attendees. Tapee Black dark theme (cyan accents on #0a0a0a), NFC read-only support, push notifications, i18n (ES/EN).

**Screens:**
- `login.tsx` — sign in + register (attendee role only)
- `(tabs)/home.tsx` — bracelet cards with balance, quick actions, NFC scan
- `(tabs)/history.tsx` — paginated transaction history
- `(tabs)/profile.tsx` — profile, refund requests list, language switcher, logout
- `top-up.tsx` — digital top-up via Nequi or PSE bank portal
- `block-bracelet.tsx` — block/freeze a wristband
- `refund-request.tsx` — submit a refund request
- `payment-status/[id].tsx` — polls payment intent status

**Key patterns:**
- Auth is pure fetch (no `api-client-react` dependency) — token stored in `expo-secure-store`
- API hooks in `hooks/useAttendeeApi.ts` using `@tanstack/react-query`
- NFC is read-only (`utils/nfc.ts`) — attendees scan to identify bracelets
- Push tokens registered at `POST /api/attendee/me/push-token`
- Port: 18116

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. All routes under `/api` prefix.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — CORS, JSON parsing, cookieParser, authMiddleware, routes at `/api`
- Routes: `src/routes/index.ts` mounts all 16 sub-routers
- Auth: `src/lib/auth.ts` (session management), `src/middlewares/requireRole.ts` (RBAC)
- Password auth routes: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/create-account`, `POST /api/auth/setup`
- `pnpm --filter @workspace/api-server run dev` — dev server

**Route Groups (all under /api):**
- `GET /healthz` — health check (no auth)
- `GET /auth/me`, `GET /auth/signing-key` — auth & NFC signing key
- `GET|PATCH /users/:id` — user management (admin)
- `GET|POST /events` + `GET|PATCH|DELETE /events/:id` — event management
- `POST /bracelets`, `GET|PATCH /bracelets/:nfcUid` — bracelet registration & management
- `POST /topups`, `GET /topups/my-shift` — top-ups with HMAC signing
- `GET|POST /merchants`, `GET|PATCH /merchants/:id`, `GET /merchants/:id/earnings` — merchants
- `GET|POST /locations`, `GET|PATCH /locations/:id`, `POST /locations/:id/staff` — locations
- `GET|POST /products`, `GET|PATCH|DELETE /products/:id` — products
- `PATCH /inventory/warehouses/:warehouseId`, `PATCH /inventory/locations/:locationId` — inventory
- `GET|POST /warehouses` — warehouses
- `GET /stock-movements`, `POST /stock-movements/dispatch`, `POST /stock-movements/transfer` — stock
- `GET|PATCH /restock-orders`, `PATCH /restock-orders/:id` — restock
- `POST /transactions/log`, `POST /transactions/sync` — transactions (commission + auto-restock)
- `GET|POST /payouts`, `PATCH /payouts/:id` — merchant payouts
- `GET /reports/revenue`, `GET /reports/topups`, `GET /reports/inventory` — reports
- `POST /admin/tamper-report`, `GET /admin/snapshot` — admin
- `POST /payments/initiate` — digital top-up initiation via Wompi (Nequi/PSE)
- `GET /payments/:id/status` — poll digital payment status
- `POST /payments/webhook` — Wompi webhook (HMAC-validated)

### `lib/db` (`@workspace/db`)

Drizzle ORM + PostgreSQL. Schema tables:
- `sessions`, `users` (role enum), `events`, `merchants`, `locations`, `products`
- `warehouses`, `warehouse_inventory`, `location_inventory`
- `restock_orders`, `stock_movements`, `user_location_assignments`
- `bracelets`, `transaction_logs`, `transaction_line_items`, `top_ups`, `merchant_payouts`
- `wompi_payment_intents` — digital payment intents (Nequi/PSE via Wompi)

- `pnpm --filter @workspace/db run push` — push schema to DB

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec (`openapi.yaml`) and Orval codegen config. Run: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas. `src/index.ts` exports from `./generated/api` (Zod schemas) plus explicit type-only exports for `AuthUser` and `UserRole` from `./generated/types/`.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts. Run: `pnpm --filter @workspace/scripts run <script>`

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (provided by Replit)
- `HMAC_SECRET` — NFC bracelet payload signing key
- `SESSION_SECRET` — Express session secret
- `PORT` — server port (default 8080)
- `REPLIT_DOMAINS` — for OIDC redirect URIs
- `WOMPI_BASE_URL` — Wompi API base URL (default: `https://sandbox.wompi.co/v1`; production: `https://production.wompi.co/v1`)
- `WOMPI_PUBLIC_KEY` — Wompi public key (required for digital top-ups)
- `WOMPI_PRIVATE_KEY` — Wompi private key (required for digital top-ups)
- `WOMPI_EVENTS_SECRET` — Wompi webhook signature secret (for checksum validation)
- `APP_URL` — Public app URL (used for PSE redirect_url)

## Certificate Pinning

Both apps pin the Tapee API TLS certificate using `react-native-ssl-pinning@1.6.0`.

### How it works
- `artifacts/mobile/utils/pinnedFetch.ts` and `artifacts/attendee-app/utils/pinnedFetch.ts` wrap all API `fetch` calls with cert pinning for Tapee API domains.
- Pinning is domain-aware: only Tapee API hostnames (`API_DOMAIN` / `ATTENDEE_API_BASE_URL` host) are pinned. Auth endpoints (OIDC) are NOT pinned.
- **Release builds** (`__DEV__ === false`): if the native module is not compiled in, `pinnedFetch` **throws a hard error** for any Tapee API request — fail-closed, no silent bypass.
- **Development/Expo Go builds** (`__DEV__ === true`): if the native module is absent, `pinnedFetch` logs a warning and falls back to standard `fetch` so the JS bundle can be tested without a native rebuild.
- Cert files (`.cer`, DER format) live in `assets/certs/` in each app and are copied to native directories by the `withSslPinning` Expo config plugin during EAS prebuild.
- Active cert filenames are controlled by `EXPO_PUBLIC_SSL_CERTS` (comma-separated, without extension). Defaults to `tapee_api`.

### Current pinned certs
Two separate cert files — both must be compiled into native builds:

| File | Domain | SPKI SHA-256 | Expiry |
|------|--------|-------------|--------|
| `tapee_api.cer` | `prod.tapee.app` | `qZeuQmHlu+HfY+6kzKAG1DHDu01gEmkM5zM4UJh+CBU=` | Jul 2 2026 |
| `attendee_api.cer` | `attendee.tapee.app` | `t6a7uh5TulAD/pgVznCOpTdlAlH6vFGvYeWrrUrs96Y=` | Jul 2 2026 |

Both apps pin against both certs (`EXPO_PUBLIC_SSL_CERTS=tapee_api,attendee_api`).
Certs are short-lived (Let's Encrypt ~90 days). When a cert renews with a **new key**, re-extract the DER file and trigger a new native EAS build. If the same key is reused, an OTA suffices.

### Certificate rotation procedure (before old cert expires)

1. **Get new cert DER file**:
   ```bash
   openssl s_client -connect <API_DOMAIN>:443 </dev/null 2>/dev/null | \
     openssl x509 -outform DER -out tapee_api_next.cer
   # Verify SPKI hash:
   openssl x509 -inform DER -in tapee_api_next.cer -noout -pubkey | \
     openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
   ```

2. **Add new cert file** alongside existing:
   - Copy `tapee_api_next.cer` → `artifacts/mobile/assets/certs/tapee_api_next.cer`
   - Copy same → `artifacts/attendee-app/assets/certs/tapee_api_next.cer`
   - Update `app.json` `certFiles` in both apps to include `"tapee_api_next.cer"`
   - **Push a new native build** (EAS) so `tapee_api_next.cer` is compiled into the binary.

3. **Activate new cert via OTA** (once native build is live):
   - Set `EXPO_PUBLIC_SSL_CERTS=tapee_api_next,tapee_api` in the OTA build env (both old + new during transition).
   - Push OTA for both apps. The JS now accepts both old and new certs.

4. **After old cert expires** (or full user rollout complete):
   - Set `EXPO_PUBLIC_SSL_CERTS=tapee_api_next` (drop old cert from the JS list).
   - Push another OTA.
   - Optionally: next native build removes `tapee_api.cer` from `certFiles`.

> **For production domains** (`.replit.app` or custom domain): the cert will come from a public CA (Cloudflare/Let's Encrypt). Use the same procedure to extract the cert and SPKI hash from the production domain before publishing.

## Pending Setup

- **Wompi keys not yet configured**: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, and `APP_URL` must be added as secrets before digital top-ups (Nequi/PSE) will work. Get sandbox keys from https://commerce.wompi.co
