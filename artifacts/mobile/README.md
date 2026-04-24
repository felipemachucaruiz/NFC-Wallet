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
| Push Notifications | Expo Notifications (dynamic import) |
| i18n | `i18next` + `react-i18next` (ES/EN) |
| Image Picker | `expo-image-picker` |

---

## Project Structure

```
artifacts/mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout — providers, splash
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
│   └── fetchWithTimeout.ts # Fetch wrapper with 30s timeout
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

# EAS Build (Android — app bundle)
eas build --platform android --profile production --non-interactive

# EAS Build (Android — distributable APK)
eas build --platform android --profile production-apk --non-interactive
```

### Android Signing — Required EAS Secrets

Production and `production-apk` builds use a **locally managed keystore** with real certificate subject fields (`CN=Tapee, O=Tapee SAS, OU=Engineering, C=CO`). The keystore is never committed to source control. Instead, four EAS secrets must be set for the project (`@felipemachucadj/mobile`) before any Android production build:

| Secret name | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded PKCS12 keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore (store) password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore (`tapee-key`) |
| `ANDROID_KEY_PASSWORD` | Private key password |

These secrets are already set in EAS for this project. If a build machine does not have them, the build will fail early with a clear error from `scripts/decode-keystore.js`.

**How it works:** The EAS `prebuildCommand` in `eas.json` runs `node scripts/decode-keystore.js` before `expo prebuild`. That script decodes `ANDROID_KEYSTORE_BASE64` into `tapee-release.keystore` and writes a `credentials.json` file. EAS reads `credentials.json` (via `credentialsSource: "local"`) and uses it to sign the output artifact.

To rotate the keystore, generate a new one, base64-encode it, and update the four EAS secrets via `eas secret:push` or the Expo dashboard.

---

## App IDs

| Platform | Bundle ID |
|----------|-----------|
| iOS | `com.tapee.staff` |
| Android | `com.tapee.app` |
