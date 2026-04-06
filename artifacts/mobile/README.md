# Tapee Staff — Mobile App

Expo React Native staff application for the Tapee cashless event payment platform. Used by bank staff, merchant POS operators, warehouse admins, event admins, and gate operators at events in Colombia.

---

## Overview

The staff app covers every operational role at a Tapee-powered event:

| Role | Capabilities |
|------|-------------|
| **Bank Staff** | NFC bracelet top-ups, bracelet linking / unlinking, blocked bracelet management |
| **Merchant POS** | Product sales charged against NFC bracelets, cart management, offline queue |
| **Merchant Admin** | Sales reports, inventory management, restock requests |
| **Warehouse Admin** | Stock dispatch, restock order fulfilment, inventory audits |
| **Event Admin** | Full event dashboard, all merchant/location/user oversight |
| **Gate** | Bracelet access zone validation |

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Expo SDK 54 (React Native) |
| Navigation | Expo Router (file-based) |
| State / Queries | TanStack React Query |
| API Client | `@workspace/api-client-react` (OpenAPI-generated) |
| NFC | `react-native-nfc-manager` |
| Offline Queue | `expo-sqlite` |
| Auth Storage | `expo-secure-store` |
| Fonts | `@expo-google-fonts/inter` |
| Security | HMAC-SHA256 bracelet payload verification |
| OTA Updates | `expo-updates` |
| Push Notifications | Expo Notifications (dynamic import) |
| i18n | `i18next` + `react-i18next` (ES/EN) |
| Image Picker | `expo-image-picker` |

---

## Project Structure

```
artifacts/mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout — providers, splash, OTA check
│   ├── login.tsx
│   ├── (bank)/             # Bank staff screens (top-up, link, unlink bracelets)
│   ├── (merchant-pos)/     # POS screens (cart, charge, receipt)
│   ├── (merchant-admin)/   # Merchant admin (reports, inventory)
│   ├── (warehouse)/        # Warehouse screens (dispatch, restock)
│   ├── (event-admin)/      # Event admin overview
│   ├── (gate)/             # Gate / access zone scanner
│   └── (attendee)/         # Attendee-facing self-service screens
├── components/
│   ├── AnimatedSplash.tsx
│   ├── PasscodeScreen.tsx
│   ├── FraudAlertsScreen.tsx
│   ├── OfflineBanner.tsx
│   ├── UpdateBanner.tsx
│   └── ui/                 # Shared UI primitives
├── contexts/
│   ├── AuthContext.tsx
│   ├── AttestationContext.tsx
│   ├── CartContext.tsx
│   ├── OfflineQueueContext.tsx
│   ├── ZoneCacheContext.tsx
│   └── BannedBraceletsContext.tsx
├── hooks/
│   ├── usePushNotifications.ts
│   ├── useAttestation.ts
│   └── useRoleGuard.ts
├── i18n/                   # i18next setup, ES/EN translations
├── utils/
│   ├── nfc.ts              # NFC manager (safe try-require)
│   └── pinnedFetch.ts      # TLS-pinned fetch wrapper
└── constants/
    └── domain.ts           # API base URL
```

---

## Key Features

### NFC Bracelet Operations
All NFC writes and reads are protected by HMAC-SHA256. The payload format is `balance:counter` — the counter prevents rollback attacks. Bracelets can be linked, unlinked, topped-up, and blocked from within the app.

### Offline Queue
When the device loses connectivity, all POS transactions are queued in a local SQLite database. On reconnection, the queue is flushed automatically and the server balance reconciles.

### Passcode Lock
A configurable passcode screen (via `PasscodeContext`) prevents unauthorized access when the device is left unattended between transactions.

### Fraud Alerts
The `FraudAlertsScreen` surfaces suspicious transaction patterns detected by the backend, with staff able to mark alerts as reviewed.

### OTA Updates
The app checks for OTA updates on launch via `expo-updates`. A non-blocking `UpdateBanner` notifies staff of available updates without interrupting the active session.

---

## OTA Safety

> **Important for contributors**

This app uses `runtimeVersion: { policy: "appVersion" }`, meaning **any OTA published against the same version is applied to all devices**. Statically importing a native module that wasn't in the native binary at build time will permanently crash the JS runtime before any error boundary renders.

**Safe patterns are required for:**
- Any `expo-*` or `react-native-*` module added after the last EAS build
- Dynamic values: use `await import(...)` inside a try-catch
- JSX providers: use IIFE `try { require(...) } catch { return fallback }`

See `replit.md` → *OTA Update Safety Rules* for the full checklist.

---

## Environment / Configuration

| Variable | Description |
|----------|-------------|
| `API_BASE_URL` | Production API base — `https://prod.tapee.app` |
| `HMAC_SECRET` | Shared secret for NFC payload signing |

Set via Expo `extra` in `app.json` or EAS Secrets for production builds.

---

## Running Locally

```bash
# From repo root
pnpm install

# Start Expo dev server for the staff app
pnpm --filter @workspace/mobile run dev
```

Scan the QR code with Expo Go (development) or run on a device/simulator with the native binary installed.

---

## Building for Production

```bash
# EAS Build (iOS)
eas build --platform ios --profile production --non-interactive

# EAS Build (Android)
eas build --platform android --profile production --non-interactive

# Publish OTA update (after running eas build at least once)
eas update --channel production --message "your update message"
```

---

## App IDs

| Platform | Bundle ID |
|----------|-----------|
| iOS | `com.tapee.staff` |
| Android | `com.tapee.app` |
