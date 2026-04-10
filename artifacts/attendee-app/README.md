# Tapee Wallet — Attendee App

Expo React Native attendee-facing application for the Tapee cashless event payment platform. Allows event attendees in Colombia to check their NFC bracelet balance, view transaction history, top up digitally (Nequi / PSE via Wompi), and manage their bracelet.

---

## Overview

The attendee app is the consumer-facing product. It is intentionally lightweight and focused on self-service. Attendees do not need to log in with a password — authentication is bracelet-scoped via NFC read + server-side session.

### Core Screens

| Screen | Description |
|--------|-------------|
| **Balance / Home** | Real-time bracelet balance + recent transactions |
| **Top Up** | Digital top-up via Nequi or PSE (Wompi) |
| **Transaction History** | Full list of purchases and top-ups |
| **Add Bracelet** | Link a new NFC bracelet to the account |
| **Block Bracelet** | Report a lost/stolen bracelet |
| **Unlink Bracelet** | Remove a bracelet from the account |
| **Refund Request** | Submit a refund for a disputed transaction |
| **Select Event** | Switch between multiple events the bracelet is active for |
| **Check Balance** | Quick NFC tap to read bracelet balance (offline-capable) |
| **Payment Status** | Real-time polling for pending Wompi payment results |
| **Settings** | Language toggle (ES/EN), notification preferences |
| **Forgot / Reset Password** | Self-service credential recovery |

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Expo SDK 54 (React Native) |
| Navigation | Expo Router (file-based) |
| State / Queries | TanStack React Query |
| API Client | `@workspace/api-client-react` (OpenAPI-generated, attendee API) |
| NFC | `react-native-nfc-manager` (read-only for balance check) |
| Auth Storage | `expo-secure-store` |
| Push Notifications | Expo Notifications (dynamic import) |
| i18n | `i18next` + `react-i18next` (ES/EN) |
| Theme | Tapee Black — dark `#0a0a0a` background, cyan `#00f1ff` accents |

---

## Project Structure

```
artifacts/attendee-app/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root layout — providers, splash
│   ├── index.tsx               # Entry / redirect
│   ├── login.tsx
│   ├── forgot-password.tsx
│   ├── reset-password.tsx
│   ├── select-event.tsx
│   ├── add-bracelet.tsx
│   ├── block-bracelet.tsx
│   ├── unlink-bracelet.tsx
│   ├── top-up.tsx
│   ├── refund-request.tsx
│   ├── check-balance.tsx
│   ├── payment-status/
│   └── (tabs)/                 # Bottom tab navigator (balance, history, settings)
├── components/
│   ├── AnimatedSplash.tsx
│   ├── ErrorBoundary.tsx
│   └── CustomAlert.tsx
├── contexts/
│   └── AuthContext.tsx
├── hooks/
│   └── usePushNotifications.ts
├── i18n/                       # i18next setup, ES/EN translations
└── utils/
    └── nfc.ts                  # NFC manager (safe try-require)
```

---

## Key Features

### NFC Balance Check (Offline-Capable)
The bracelet stores a signed `balance:counter` payload in HMAC-SHA256. The attendee app can verify the signature and display the balance without a network call — useful in areas with poor connectivity at large events.

### Digital Top-Up (Wompi)
Attendees can add funds to their bracelet balance via:
- **Nequi** — instant mobile wallet transfer
- **PSE** — Colombian bank transfer

The app polls the `payment-status` screen until Wompi confirms the transaction, then credits the bracelet automatically.

### Bilingual (ES / EN)
All UI text is managed through `i18next`. Language is detected dynamically at runtime using a safe dynamic import of `expo-localization`. Attendees can override via Settings.

---

## Backend

The attendee app talks exclusively to the **Attendee API** (`https://attendee.tapee.app`). It never calls the staff API (`prod.tapee.app`). The API client base URL is configured in `constants/domain.ts`.

---

## Environment / Configuration

| Variable | Description |
|----------|-------------|
| `ATTENDEE_API_BASE_URL` | `https://attendee.tapee.app` |
| `WOMPI_PUBLIC_KEY` | Wompi public key for payment widget |
| `HMAC_SECRET` | Shared secret for NFC payload verification |

Set via Expo `extra` in `app.json` or EAS Secrets for production builds.

---

## Running Locally

```bash
# From repo root
pnpm install

# Start Expo dev server for the attendee app
pnpm --filter @workspace/attendee-app run dev
```

---

## Building for Production

```bash
# EAS Build (iOS)
eas build --platform ios --profile production --non-interactive

# EAS Build (Android)
eas build --platform android --profile production --non-interactive

```

---

## App IDs

| Platform | Bundle ID |
|----------|-----------|
| iOS | `com.tapee.attendee` |
| Android | `com.tapee.attendee` |
