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
- **Roles**: `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, `admin`
- **Currency**: All monetary values in Colombian Pesos (COP, integer)
- **lib packages must be built** before api-server can typecheck: run `pnpm exec tsc -p tsconfig.json` in `lib/db` and `lib/api-zod`

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port from $PORT env, default 8080)
│   └── mobile/             # Expo React Native app (6 role-based portals)
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

## Pending Setup

- **Wompi keys not yet configured**: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, and `APP_URL` must be added as secrets before digital top-ups (Nequi/PSE) will work. Get sandbox keys from https://commerce.wompi.co
