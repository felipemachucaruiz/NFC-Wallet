## Overview

This project implements a contactless cashless event payment system tailored for the Colombian market. It facilitates transactions using NFC bracelets, supports various user roles including attendees, merchants, and administrators, and integrates features like commission tracking, merchant payouts, and comprehensive inventory management with auto-restock capabilities. The system aims to provide a secure and efficient payment solution for events, enhancing the attendee experience and streamlining operations for organizers and merchants.

## User Preferences

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

## System Architecture

The project is a pnpm workspace monorepo utilizing TypeScript. The core stack includes Node.js 24, Express 5 for the API server, PostgreSQL with Drizzle ORM for data persistence, and Zod for validation.

**Artifacts:**
- `artifacts/api-server` — Express 5 API server, serves all staff/admin endpoints at `/api`
- `artifacts/attendee-api` — Separate Express 5 API server for attendee-facing endpoints at `/api` (attendee app)
- `artifacts/mobile` — Expo React Native staff mobile app
- `artifacts/attendee-app` — Expo React Native attendee mobile app
- `artifacts/web-admin` — React + Vite web admin portal at `/web-admin/`; serves `admin` and `event_admin` users with login, 2FA, forgot/reset password, and dashboard scaffolding

**UI/UX Decisions:**
- **Attendee App:** Features a "Tapee Black" dark theme with cyan accents, supports NFC read-only functions, push notifications, and i18n (ES/EN).
- **Mobile Apps (Staff and Attendee):** Built with Expo React Native, supporting OTA updates.
- **Web Admin:** Dark theme with Tapee cyan (`#00f1ff`) accents, sidebar navigation, role-based routing for `admin` vs `event_admin`.

**Technical Implementations:**
- **NFC Security:** Uses HMAC-SHA256 for securing NFC bracelet payloads (`balance:counter`) to prevent rollback attacks.
- **Monetary Values:** All monetary values are handled in Colombian Pesos (COP) as integers.
- **Authentication:** Employs email and password authentication with bcrypt, utilizing server-side sessions.
- **Inventory Management:** Supports two modes: `location_based` (self-managed stock per location) and `centralized_warehouse` (warehouse dispatches). Includes features for inventory audits and tracking damaged goods.
- **Auto-Restock:** Automatically creates restock orders when inventory levels fall below a defined threshold after a transaction.
- **Commission Tracking:** Calculates and stores commissions per transaction.
- **NFC Chip Type Configuration:** Allows per-event configuration for `ntag_21x` or `mifare_classic` chip types, with informational alerts if there's a mismatch.
- **Role-Based Access Control (RBAC):** Defined roles include `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, and `admin`.
- **API Design:** The API server (Express 5) serves all routes under the `/api` prefix, with comprehensive route groups for managing events, users, merchants, inventory, transactions, and reports.
- **Database Schema:** Drizzle ORM defines schemas for various entities including users, events, merchants, products, inventory, transactions, and payment intents.
- **API Codegen:** OpenAPI 3.1 specification is used with Orval for generating API clients and Zod schemas.

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **API Framework:** Express 5
- **Validation:** Zod v3
- **Mobile Development:** Expo (React Native)
- **Payment Gateway:** Wompi (for Nequi/PSE digital top-ups)
- **NFC Hardware:** NTAG213/215, Mifare Classic compatible NFC chips
- **OAuth/OIDC:** `openid-client` (for legacy OIDC routes)
- **Hashing:** bcrypt (for password management)
- **Push Notifications:** Expo Notifications
- **Location Services:** Expo Location
- **Image Handling:** Expo Image Picker
- **Mapping:** React Native Maps (with Google Maps API)
- **Local Storage:** Expo Secure Store
- **State Management:** Tanstack React Query
- **Analytics/Monitoring:** Sentry