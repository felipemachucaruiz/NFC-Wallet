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
- **Inventory Audits**: Warehouse admins can initiate an inventory audit (physical count vs system count), submit it, and the system adjusts stock with a delta record. Tables: `inventory_audits`, `inventory_audit_items`.
- **Damaged Goods**: Warehouse admins log damaged/lost/expired goods with a reason code. Stock is immediately decremented. Table: `damaged_goods`. Both features have audit history visible in the warehouse section and are included in the admin inventory report.
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

### ⚠️ CRITICAL OTA RULE — ALWAYS PUSH TO BOTH BRANCHES

**Every OTA must go to BOTH `preview` AND `production`. Always. No exceptions.**

**Staff app** (`artifacts/mobile`):
```bash
cd artifacts/mobile
bash ota-update.sh preview "Description of changes"
bash ota-update.sh production "Description of changes"
```

**Attendee app** (`artifacts/attendee-app`):
```bash
cd artifacts/attendee-app
bash ota-update.sh "Description of changes"
# The script automatically pushes to both preview and production.
```

Both scripts set `EAS_SKIP_AUTO_FINGERPRINT=1` and hardcode the production domains automatically — never pass env vars manually.

**After sending an OTA** users must: open app → wait 15s → force close → reopen.

**When you DO need a full APK build (no OTA possible):**
- New native module added (NFC, camera, etc.)
- `app.json` permissions or splash changes
- Major Expo SDK upgrade

**EAS config:**
- Account: `felipemachucadj` (already logged in)
- Staff project ID: `26d76893-d65f-457a-b2eb-7fa177110638`
- Channels: `preview` (production APK), `production` (production APK), `development` (dev client APK)
- Runtime version policy: `appVersion` — tied to the version field in app.json

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

## Network Security

SSL/TLS certificate pinning has been **removed** from both apps.

- `artifacts/mobile/utils/pinnedFetch.ts` is now a simple passthrough to standard `fetch` with a 30-second timeout. The `react-native-ssl-pinning` dependency and `withSslPinning` config plugin remain in the codebase but are no longer active.
- All API traffic is still encrypted via standard HTTPS (TLS 1.2+) as enforced by Railway.
- Root cause of removal: the `withSslPinning` Expo config plugin was copying cert files to `android/app/src/main/assets/` but `react-native-ssl-pinning` on Android reads from `res/raw/`. This caused a native Android crash immediately after the first authenticated API call.

> If certificate pinning is re-added in future, fix the plugin to copy to `res/raw/` on Android and `<AppName>/` on iOS (Xcode bundle resources).

## Pending APK Builds (New Native Modules Added)

Both apps need fresh APK builds because new native modules were added. OTAs cannot deliver native modules — the existing APKs have lazy-load guards so they work normally until the new APKs are installed.

### Native modules added (not yet in current APKs):
| Module | Staff app | Attendee app |
|--------|-----------|--------------|
| `expo-notifications` | ✅ added | ✅ added |
| `expo-sqlite` | ✅ added | — |

### Build commands (run from the app directory):
```bash
# Staff app
cd artifacts/mobile
pnpm exec eas build --profile production-apk --platform android --non-interactive --no-wait

# Attendee app  
cd artifacts/attendee-app
pnpm exec eas build --profile production-apk --platform android --non-interactive --no-wait
```

EAS account: `felipemachucadj` (logged in).  
Both builds use the `production-apk` profile → channel: `production`, APK output.

> **Note**: The 246 MB archive makes EAS upload slow from Replit. Trigger builds from local machine or EAS dashboard (https://expo.dev) if upload times out.

### After new APKs are installed → push OTA to activate native features:
```bash
# Staff app (BOTH channels always)
cd artifacts/mobile
bash ota-update.sh preview  "feat: activate expo-sqlite offline queue + push notifications"
bash ota-update.sh production "feat: activate expo-sqlite offline queue + push notifications"

# Attendee app (script pushes both automatically)
cd artifacts/attendee-app
bash ota-update.sh "feat: activate push notifications"
```

### Plugins confirmed in app.config.js:
- **Staff app** (`artifacts/mobile/app.config.js`): `expo-notifications` ✅, `expo-location` ✅, `expo-image-picker` ✅, `react-native-maps` (via `withGoogleMapsManifest` plugin) ✅, `expo-sqlite` (no plugin needed) ✅
- **Attendee app** (`artifacts/attendee-app/app.config.js`): `expo-notifications` ✅  

### Maps SDK (staff app only):
- `react-native-maps@1.20.1` — no bundled `app.plugin.js`, so manual `./plugins/withGoogleMapsManifest` injects `com.google.android.geo.API_KEY` meta-data
- API key read from `GOOGLE_MAPS_API_KEY` env var at build time (set in `eas.json` env section)
- At runtime: `Constants.expoConfig.extra.googleMapsApiKey` used in `LocationMapPicker.tsx`
- `LocationMapPicker.tsx` uses a lazy `require('react-native-maps')` → graceful fallback if native module missing

---

## Pending Setup

- **Wompi keys not yet configured**: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, and `APP_URL` must be added as secrets before digital top-ups (Nequi/PSE) will work. Get sandbox keys from https://commerce.wompi.co
