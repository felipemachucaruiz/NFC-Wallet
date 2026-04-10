# Overview

This project implements a contactless cashless event payment system tailored for the Colombian market. Its primary purpose is to enable event attendees to make payments using NFC bracelets, facilitate merchants in charging for products, and allow bank staff to handle top-ups. The system includes robust features such as commission tracking, merchant payouts, comprehensive warehouse and inventory management with automated restock capabilities, and a full audit trail for all transactions.

The business vision is to modernize event payments in Colombia, offering a secure, efficient, and user-friendly experience. Market potential lies in the growing demand for cashless solutions at events, reducing friction and enhancing security for both attendees and vendors. The project aims to become the leading contactless payment solution for events across Colombia.

# User Preferences

- I want iterative development.
- I prefer detailed explanations.
- Ask before making major changes.
- Do not make changes to the folder `lib/api-spec`.
- Do not make changes to the folder `lib/api-client-react`.
- Do not make changes to the folder `lib/api-zod`.
- Do not make changes to the folder `scripts`.
- Do not make changes to the file `artifacts/attendee-app/ota-update.sh`.
- Do not make changes to the file `artifacts/mobile/ota-update.sh`.
- The user prefers to be communicated with using clear and simple language.
- The user prefers a functional programming paradigm where applicable.
- The user wants the agent to focus on completing one task at a time and getting confirmation before moving to the next.
- I want to follow a Test-Driven Development (TDD) approach where applicable.
- Do not make changes to the `lib/db` folder without explicit approval.
- EAS CLI commands (build, update) need `timeout 90` wrapper and 120000ms tool timeout — they always time out on the first attempt with shorter timeouts.

# System Architecture

The project is built as a pnpm monorepo using TypeScript (v5.9). It leverages Node.js (v24) with Express (v5) for the API server and PostgreSQL with Drizzle ORM for database management.

**Artifacts:**
- `artifacts/api-server` — Express 5 API server, serves all staff/admin endpoints at `/api`
- `artifacts/attendee-api` — Separate Express 5 API server for attendee-facing endpoints at `/api` (attendee app)
- `artifacts/mobile` — Expo React Native staff mobile app
- `artifacts/attendee-app` — Expo React Native attendee mobile app
- `artifacts/admin-web` — React + Vite web admin portal at `/admin-web/`; serves `admin` and `event_admin` users with login (2FA), forgot/reset password, dashboard, events, users, merchants, bracelets, access zones, payouts, reports. Includes **ticketing management** module: Event Days, Venue Map Editor (canvas-based section drawing), Venue Location, Ticket Types, Sales Config, Sales Dashboard, Orders, and Check-in Dashboard. Events have module toggles (`ticketingEnabled`, `nfcBraceletsEnabled`) that gate sidebar navigation and route access via `ModuleGatedRoute`.
- `artifacts/ticket-storefront` — React + Vite public ticketing storefront at `/ticket-storefront/`; designed for independent Railway deployment with configurable API URL (`VITE_API_BASE_URL`). Features: event listing with search, event detail with ticket selection, checkout with Nequi/PSE payments via Wompi, order status polling. Bilingual (Spanish UI).

**UI/UX Decisions:**
- **Tickets Storefront (`artifacts/tickets`):** Public-facing ticketing web app at `/tickets/` (port 22881). React + Vite with dark Tapee theme, i18n (ES/EN default). Features: event discovery with search/filter, event detail with interactive SVG venue maps, ticket selection with per-attendee forms, mock auth (localStorage), Wompi checkout (card/Nequi/PSE), payment status animations, My Tickets with QR codes and wallet buttons, account profile. All data is mock (no backend). Uses wouter routing, TanStack Query, shadcn/ui.
- **Attendee App:** Features a "Tapee Black" dark theme with cyan accents on a #0a0a0a background for a modern and sleek user experience. Supports NFC read-only functions, push notifications, and i18n (ES/EN). Includes a complete ticket purchase flow: Events tab (catalogue with search/filters), Event Detail (hero image, multi-day schedule, pricing, venue map), Venue Map (color-coded section selection), Ticket Quantity, Attendee Data Form (nominative tickets), Checkout (Nequi/PSE/Card via Wompi), Payment Status, My Tickets (with QR codes, wallet integration, check-in status), and Ticket Detail.
- **Mobile Apps (Staff and Attendee):** Built with Expo React Native, supporting OTA updates and ensuring a consistent cross-platform experience.
- **Web Admin:** Dark theme with Tapee cyan (`#00f1ff`) accents, sidebar navigation, role-based routing for `admin` vs `event_admin`.

**Technical Implementations:**
- **NFC Security:** Uses HMAC-SHA256 for securing NFC bracelet payloads (`balance:counter`) to prevent rollback attacks.
- **Monetary Values:** Multi-currency support for Latin America. Events are currency-configurable (COP, MXN, CLP, ARS, PEN, UYU, BOB, BRL, USD). Existing COP events continue working unchanged. Admin financial views show amounts in the event's currency. Exchange rate service caches rates in the `exchange_rates` table (12hr TTL) using exchangerate-api.com. Shared currency utilities in `lib/db/src/currency.ts` provide `formatCurrency()`, `CURRENCY_CONFIGS`, and exchange rate functions.
- **Authentication:** Employs email and password authentication with bcrypt, utilizing server-side sessions stored in the database.
- **Inventory Management:** Supports two modes: `location_based` (self-managed stock per location) and `centralized_warehouse` (warehouse dispatches). Includes features for inventory audits and tracking damaged goods.
- **Auto-Restock:** Automatically creates restock orders when inventory levels fall below a defined threshold (`restockTrigger`) after a transaction, provided no pending restock order exists.
- **Commission Tracking:** Calculates and stores commissions per transaction, calculated as `Math.round(gross × rate / 100)`.
- **NFC Chip Type Configuration:** Allows per-event configuration for `ntag_21x` or `mifare_classic` chip types, with informational alerts if there's a mismatch.
- **Role-Based Access Control (RBAC):** Defined roles include `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, and `admin`.
- **API Design:** The API server (Express 5) serves all routes under the `/api` prefix, defined by OpenAPI 3.1 specification.
- **Database Schema:** Drizzle ORM defines schemas for various entities including users, events, merchants, products, inventory, transactions, payment intents, and ticketing (event_days, venues, venue_sections, ticket_types, ticket_orders, tickets, ticket_check_ins).
- **Ticketing System:** Full ticket sales backend with multi-day event support, venue sections, concurrency-safe inventory, QR code check-in, Apple/Google Wallet passes, and bilingual email confirmations. Events have feature flags (`ticketing_enabled`, `nfc_bracelets_enabled`) for modular feature gating. Ticket purchase flow: create order → Wompi payment (card/nequi/pse) → webhook confirms → generate QR codes → send emails.
- **API Codegen:** OpenAPI 3.1 specification is used with Orval for generating API clients and Zod schemas.
- **Validation:** Zod v3 is used for robust schema validation, integrated with `drizzle-zod`.
- **Cost of Goods Sold (COGS) Tracking:** `unit_cost_snapshot` is stored on transaction line items, and products include both `price_cop` and `cost_cop` for accurate COGS calculation.

# Deployment & Hosting

All apps are deployed and managed on **Railway** (not Replit deployments). Railway auto-deploys from the GitHub repo (`felipemachucaruiz/NFC-Wallet`). **CRITICAL: Two separate branches control different services:**

- **`master` branch** → API services (Tapee Staff at `prod.tapee.app`, Tapee Wallet at `attendee.tapee.app`)
- **`main` branch** → Web Admin only (Tapee Web Admin at `admin.tapee.app`)

**⚠️ NEVER push API changes to `main`. NEVER push web admin changes to `master`. Pushing to the wrong branch WILL overwrite production services and cause downtime.**

```bash
# Push API changes (api-server, attendee-api) → master branch
git push "https://${GITHUB_TOKEN}@github.com/felipemachucaruiz/NFC-Wallet.git" master:master

# Push Web Admin changes (admin-web) → main branch (ONLY when explicitly requested)
git push "https://${GITHUB_TOKEN}@github.com/felipemachucaruiz/NFC-Wallet.git" master:main
```

A **Railway API key** is available in environment secrets for programmatic access to Railway services if needed.

**Railway domains & health checks:**
- `prod.tapee.app` — Tapee Staff API (api-server) — deploys from `master` — health: `/api/healthz`
- `attendee.tapee.app` — Tapee Wallet API (attendee-api) — deploys from `master` — health: `/api/healthz`
- `admin.tapee.app` — Tapee Web Admin (admin-web) — deploys from `main` — health: `/health`

**Health check paths:** APIs use `/api/healthz` (NOT `/api/health`). Web Admin uses `/health`.

## Mobile App Updates — OTAs Fixed (Fingerprint-Based)

OTA updates now use **fingerprint-based `runtimeVersion`** instead of a static `"1.0.0"`. This ensures OTAs are only delivered to binaries with matching native module fingerprints, preventing crashes from native module mismatches. After building new APKs with the fingerprint config, OTAs can be safely published via `eas update`.

**Important:** Existing binaries still have static `runtimeVersion: "1.0.0"` — they won't receive fingerprint-tagged OTAs. Users must update to the latest APK first.

## Mobile App APK Builds

OTA updates cannot rescue apps that crash before the update check runs. When native fixes or channel changes are made, build new APKs. Builds run on Expo's servers (~15–20 min); use `--no-wait` so the shell returns immediately.

```bash
# Staff APK (profile: production-apk → channel: production)
cd /home/runner/workspace/artifacts/mobile
npx eas-cli build --platform android --profile production-apk --non-interactive --no-wait

# Attendee APK (profile: production-apk → channel: production)
cd /home/runner/workspace/artifacts/attendee-app
npx eas-cli build --platform android --profile production-apk --non-interactive --no-wait
```
Download links appear on expo.dev when builds finish.

# External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **API Framework:** Express 5
- **Validation:** Zod v3
- **Mobile Development:** Expo (React Native)
- **Payment Gateway:** Wompi (for Nequi/PSE/card payments — top-ups and ticket purchases)
  - Requires `WOMPI_BASE_URL`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, and `APP_URL` environment variables.
- **Email Service:** Brevo (for ticket confirmation and invitation emails)
  - Requires `BREVO_API_KEY` environment variable.
- **Wallet Passes:**
  - Apple Wallet: Requires `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_KEY`, `APPLE_WWDR_CERT`, `APPLE_PASS_KEY_PASSPHRASE`.
  - Google Wallet: Requires `GOOGLE_WALLET_ISSUER_ID`.
- **QR Code Signing:** Requires `TICKET_QR_SECRET` for HMAC-signed QR tokens.
- **NFC Hardware:** NTAG213/215, Mifare Classic compatible NFC chips
- **OAuth/OIDC:** `openid-client` (for legacy OIDC routes)
- **Hashing:** bcrypt (for password management)
- **Push Notifications:** Expo Notifications
- **Location Services:** Expo Location
- **Image Handling:** Expo Image Picker
- **Mapping:** React Native Maps (with Google Maps API), requiring `GOOGLE_MAPS_API_KEY`.
- **Local Storage:** Expo Secure Store
- **State Management:** Tanstack React Query
- **Analytics/Monitoring:** Sentry
- **API Definition & Codegen:** OpenAPI 3.1 specification and Orval.
- **Offline Queuing:** `expo-sqlite` in the staff mobile application.

# OTA Updates — Fingerprint-Protected

OTA updates now use **fingerprint-based runtime versioning** (`runtimeVersion: { policy: "fingerprint" }`). This computes a hash of the native configuration at build time. OTAs are only delivered to binaries whose fingerprint matches, preventing the native module mismatch crashes that occurred with the old static `runtimeVersion: "1.0.0"`.

**Key points:**
- Stale `app.json` files were removed; `app.config.js` is the single source of truth
- `EAS_SKIP_AUTO_FINGERPRINT=1` was removed from all build/update scripts
- After building new APKs, OTAs can be safely published via `eas update`
- Existing binaries with `runtimeVersion: "1.0.0"` won't receive new fingerprint-tagged OTAs — users must update to the latest APK

# Admin Web Portal (artifacts/admin-web)

**Tapee Admin Portal** — A full-featured web admin portal for the cashless event payment system.

- **Technology:** React + Vite, TailwindCSS, ShadCN UI components, Wouter for routing, TanStack Query
- **Port:** 24276 (preview path: `/admin-web`)
- **Authentication:** Custom JWT session auth — login returns a `{ token }` stored in `localStorage` as `tapee_admin_token`, passed as `Authorization: Bearer <token>` on all API calls. `setAuthTokenGetter` from `@workspace/api-client-react` wires this up.
- **Vite Proxy:** `/admin-web/_srv` is proxied to `https://prod.tapee.app` (production Railway API). The `_srv` suffix avoids Replit infrastructure intercepting paths containing `/api/` segments. Client-side code uses `setBaseUrl(BASE_URL + "_srv")` and `API_BASE = BASE_URL + "_srv"`. NEVER use `_proxy` as the suffix — Replit intercepts POST requests with `/api/` in the path.

**Roles:**
- **SaaS Admin** (`role=admin`): Dashboard, Events, Promoters, Users, Products, Transactions, Inventory, Fraud Alerts, Payouts, Reports
- **Event Admin** (`role=event_admin`): Event Dashboard, Staff (Event Users), Merchants, Products, Locations, Bracelets, Access Zones, Transactions, Inventory, Refund Requests, Payouts, Settlement Report, Reports

**Key Implementation Notes:**
- Startup migration in `artifacts/api-server/src/index.ts` no longer force-resets the admin password (was removed after task-79 recovery is complete)
- PayoutPaymentMethod enum values: `transfer | nequi | cash` (not bank_transfer/other)
- `UserRole` enum must be used for role assignments
- Monetary values use the event's configured currency (default COP)
