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

# System Architecture

The project is built as a pnpm monorepo using TypeScript (v5.9). It leverages Node.js (v24) with Express (v5) for the API server and PostgreSQL with Drizzle ORM for database management.

**Artifacts:**
- `artifacts/api-server` — Express 5 API server, serves all staff/admin endpoints at `/api`
- `artifacts/attendee-api` — Separate Express 5 API server for attendee-facing endpoints at `/api` (attendee app)
- `artifacts/mobile` — Expo React Native staff mobile app
- `artifacts/attendee-app` — Expo React Native attendee mobile app
- `artifacts/web-admin` — React + Vite web admin portal at `/web-admin/`; serves `admin` and `event_admin` users with login, 2FA, forgot/reset password, and dashboard scaffolding

**UI/UX Decisions:**
- **Attendee App:** Features a "Tapee Black" dark theme with cyan accents on a #0a0a0a background for a modern and sleek user experience. Supports NFC read-only functions, push notifications, and i18n (ES/EN).
- **Mobile Apps (Staff and Attendee):** Built with Expo React Native, supporting OTA updates and ensuring a consistent cross-platform experience.
- **Web Admin:** Dark theme with Tapee cyan (`#00f1ff`) accents, sidebar navigation, role-based routing for `admin` vs `event_admin`.

**Technical Implementations:**
- **NFC Security:** Uses HMAC-SHA256 for securing NFC bracelet payloads (`balance:counter`) to prevent rollback attacks.
- **Monetary Values:** All monetary values are handled in Colombian Pesos (COP) as integers.
- **Authentication:** Employs email and password authentication with bcrypt, utilizing server-side sessions stored in the database.
- **Inventory Management:** Supports two modes: `location_based` (self-managed stock per location) and `centralized_warehouse` (warehouse dispatches). Includes features for inventory audits and tracking damaged goods.
- **Auto-Restock:** Automatically creates restock orders when inventory levels fall below a defined threshold (`restockTrigger`) after a transaction, provided no pending restock order exists.
- **Commission Tracking:** Calculates and stores commissions per transaction, calculated as `Math.round(gross × rate / 100)`.
- **NFC Chip Type Configuration:** Allows per-event configuration for `ntag_21x` or `mifare_classic` chip types, with informational alerts if there's a mismatch.
- **Role-Based Access Control (RBAC):** Defined roles include `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, and `admin`.
- **API Design:** The API server (Express 5) serves all routes under the `/api` prefix, defined by OpenAPI 3.1 specification.
- **Database Schema:** Drizzle ORM defines schemas for various entities including users, events, merchants, products, inventory, transactions, and payment intents.
- **API Codegen:** OpenAPI 3.1 specification is used with Orval for generating API clients and Zod schemas.
- **Validation:** Zod v3 is used for robust schema validation, integrated with `drizzle-zod`.
- **Cost of Goods Sold (COGS) Tracking:** `unit_cost_snapshot` is stored on transaction line items, and products include both `price_cop` and `cost_cop` for accurate COGS calculation.

# External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **API Framework:** Express 5
- **Validation:** Zod v3
- **Mobile Development:** Expo (React Native)
- **Payment Gateway:** Wompi (for Nequi/PSE digital top-ups)
  - Requires `WOMPI_BASE_URL`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, and `APP_URL` environment variables.
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

# Admin Web Portal (artifacts/admin-web)

**Tapee Admin Portal** — A full-featured web admin portal for the cashless event payment system.

- **Technology:** React + Vite, TailwindCSS, ShadCN UI components, Wouter for routing, TanStack Query
- **Port:** 24276 (preview path: `/admin-web`)
- **Authentication:** Custom JWT session auth — login returns a `{ token }` stored in `localStorage` as `tapee_admin_token`, passed as `Authorization: Bearer <token>` on all API calls. `setAuthTokenGetter` from `@workspace/api-client-react` wires this up.
- **Vite Proxy:** `/api/*` is proxied to `localhost:8080` (the API server) for development. CORS on the API server is open in `NODE_ENV !== 'production'`.

**Roles:**
- **SaaS Admin** (`role=admin`): Dashboard, Events, Promoters, Users, Fraud Alerts, Payouts, Reports
- **Event Admin** (`role=event_admin`): Event Dashboard, Staff (Event Users), Merchants, Bracelets, Access Zones, Payouts, Reports

**Key Implementation Notes:**
- Startup migration in `artifacts/api-server/src/index.ts` no longer force-resets the admin password (was removed after task-79 recovery is complete)
- PayoutPaymentMethod enum values: `transfer | nequi | cash` (not bank_transfer/other)
- `UserRole` enum must be used for role assignments
- All monetary values in COP (integer cents)
