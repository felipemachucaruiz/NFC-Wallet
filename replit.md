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
- `artifacts/admin-web` — React + Vite web admin portal at `/admin-web/`; serves `admin` and `event_admin` users with login (2FA), forgot/reset password, dashboard, events, users, merchants, bracelets, access zones, payouts, reports

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

# OTA Update Safety Rules (CRITICAL — READ BEFORE TOUCHING EITHER MOBILE APP)

Both Expo apps (`artifacts/mobile` and `artifacts/attendee-app`) use `runtimeVersion: { policy: "appVersion" }`. This means **any OTA published for the same app version is applied to ALL devices, even if native modules have changed**. A bad OTA bundle causes a permanent crash that only clears on app reinstall.

## What causes a permanent OTA crash

A static top-level `import` of a native module that was NOT in the native binary when the app was built.

When Metro loads the JS bundle, it executes all `import` statements synchronously before any React component renders. If a `require()` call for a native module fails (module not in binary), it throws and crashes the entire JS runtime. Since this happens before `<ErrorBoundary>` mounts, nothing can catch it. The app crashes on every subsequent launch.

## Safe pattern for any native/third-party module

**NEVER do this in a file that loads at startup:**
```ts
import * as Something from "some-native-package"; // static = permanent crash if not in binary
```

**ALWAYS do this instead:**
```ts
// For value imports:
async function getDeviceLanguage() {
  try {
    const { getLocales } = await import("expo-localization"); // dynamic = catchable
    return getLocales()[0]?.languageCode ?? "es";
  } catch {
    return "es"; // safe default
  }
}

// For JSX component imports (providers, wrappers):
const KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> = (() => {
  try {
    return require("react-native-keyboard-controller").KeyboardProvider;
  } catch {
    return ({ children }) => <>{children}</>; // transparent fallback
  }
})();
```

## Currently protected (both apps)

| Module | Pattern | File |
|--------|---------|------|
| `expo-localization` | dynamic `import()` in try-catch | `i18n/index.ts` |
| `react-native-nfc-manager` | try-require at module level | `utils/nfc.ts` |
| `react-native-keyboard-controller` | IIFE try-require + fallback | `app/_layout.tsx` |

## Modules NOT in app.json plugins (require special care on OTA)

These were NOT listed in either app's `app.json` plugins at the time of last known native build. Treat any changes to files that import these as high-risk for OTA:
- `expo-localization` — now safe (dynamic import)
- `react-native-keyboard-controller` — now safe (try-require)
- `expo-secure-store` — in AuthContext (monitor; core Expo SDK, likely safe)
- `expo-notifications` — in usePushNotifications (monitor)

## Before publishing an OTA

1. **Check every new `import` statement** added since the last native build — if it imports a native module, apply the safe pattern above.
2. Pure-JS packages (`i18next`, `react-i18next`, `@tanstack/react-query`, etc.) are always safe.
3. Any `expo-*` or `react-native-*` package added after the last EAS Build requires the safe pattern.
4. Run a quick grep before publishing: `grep -rn "^import.*from ['\"]expo-\|^import.*from ['\"]react-native-" artifacts/mobile/app/_layout.tsx artifacts/attendee-app/app/_layout.tsx` — all results should either be known-safe core packages or already use the try-require pattern.

## Recovery from a crashed device

Users whose app is permanently crashed must **uninstall and reinstall** to recover. A new OTA alone will not fix them (the crashed bundle prevents the OTA check from running). Push a fixed OTA first so that fresh installs + reinstalls get the working bundle.

## Long-term fix

Change `runtimeVersion.policy` from `"appVersion"` to `"fingerprint"` in both `app.json` files, then rebuild native binaries. With fingerprint policy, Expo rejects OTA bundles whose native dependency set doesn't match the installed binary — preventing this entire class of crash.

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
- All monetary values in COP (integer cents)
