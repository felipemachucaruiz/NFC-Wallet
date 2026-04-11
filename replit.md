# Overview

This project delivers a contactless, cashless event payment system specifically for the Colombian market. It enables event attendees to use NFC bracelets for payments, facilitates merchants in charging for products, and allows bank staff to manage top-ups. Key features include commission tracking, merchant payouts, comprehensive warehouse and inventory management with automated restock capabilities, and a full audit trail for all transactions. The system aims to modernize event payments in Colombia, providing a secure, efficient, and user-friendly experience, and ultimately become the leading contactless payment solution for events across the country.

# User Preferences

- I want iterative development.
- I prefer detailed explanations.
- Ask before making major changes.
- Do not make changes to the folder `lib/api-spec`.
- Do not make changes to the folder `lib/api-client-react`.
- Do not make changes to the folder `lib/api-zod`.
- Do not make changes to the folder `scripts`.
- The user prefers to be communicated with using clear and simple language.
- The user prefers a functional programming paradigm where applicable.
- The user wants the agent to focus on completing one task at a time and getting confirmation before moving to the next.
- I want to follow a Test-Driven Development (TDD) approach where applicable.
- Do not make changes to the `lib/db` folder without explicit approval.
- EAS CLI commands (build, update) need `timeout 90` wrapper (first try) or `timeout 120` and 120000ms tool timeout.
- **CRITICAL — EAS Build Profiles:** ALWAYS use `production-apk` profile for both mobile apps. NEVER use `preview` or `development` profiles — they produce APKs that crash on launch. The correct command is: `eas build --platform android --profile production-apk --non-interactive --no-wait`
- **CRITICAL — Build Numbers:** Staff app (`artifacts/mobile`) buildNumber is currently `"7"`. Attendee app (`artifacts/attendee-app`) buildNumber is currently `"9"`. Increment before each new build.
- **CRITICAL — No expo-updates:** Both mobile apps had `expo-updates` removed entirely. Do NOT re-add it. No `runtimeVersion`, no `UpdateBanner`, no OTA updates.
- **CRITICAL — No SSL Pinning:** No `<pin-set>` blocks in NSC config. `withNetworkSecurityConfig.js` was deleted from both apps. Do NOT re-add.

# System Architecture

The project is a pnpm monorepo using TypeScript (v5.9) and Node.js (v24). It features an Express (v5) API server and PostgreSQL with Drizzle ORM.

**Artifacts:**
- `artifacts/api-server`: Express 5 API for staff/admin.
- `artifacts/attendee-api`: Separate Express 5 API for attendee-facing endpoints.
- `artifacts/mobile`: Expo React Native staff mobile app.
- `artifacts/attendee-app`: Expo React Native attendee mobile app.
- `artifacts/admin-web`: React + Vite web admin portal for `admin` and `event_admin` roles, including ticketing management (Venue Map Editor, Sales Config, Orders, Check-in Dashboard). Features module toggles (`ticketingEnabled`, `nfcBraceletsEnabled`) for dynamic navigation and route access.
- `artifacts/tickets`: React + Vite public ticket-selling app ("Tapee Tickets"), wired to the Attendee API backend for real event listing, ticket purchasing (Nequi/PSE via Wompi), auth, and digital tickets with QR codes. Bilingual (ES/EN). Consolidates the former `ticket-storefront` which was removed.

**UI/UX Decisions:**
- **Tickets Storefront:** Public-facing web app with a dark Tapee theme, i18n (ES/EN), event discovery, interactive SVG venue maps, Wompi checkout, and digital tickets with QR codes.
- **Attendee App:** Features a "Tapee Black" dark theme with cyan accents, NFC read-only functions, push notifications, and i18n (ES/EN). Includes a full ticket purchase flow with event catalogue, detail, venue maps, attendee forms, and Wompi checkout.
- **Mobile Apps (Staff and Attendee):** Built with Expo React Native, distributed via APK builds.
- **Web Admin:** Dark theme with Tapee cyan accents, sidebar navigation, and role-based routing.

**Technical Implementations:**
- **NFC Security:** HMAC-SHA256 for securing NFC bracelet payloads to prevent rollback attacks.
- **QR Ticket + NFC Gate Registration:** Atomic database transactions for validating QR tickets, showing attendee profiles, and linking NFC bracelets. Supports multi-day passes. Gate has two distinct flows: (1) "Entrance Check-in" — barcode/QR scan → validate ticket → record entry without bracelet (`POST /api/gate/ticket-checkin-only`); (2) "Register Bracelet" — barcode/QR scan → validate ticket → NFC bracelet tap → check-in + bracelet link (`POST /api/gate/ticket-checkin`). Primary input is hardware barcode scanner (PDA TextInput), camera as fallback.
- **Monetary Values:** Multi-currency support for Latin America with configurable event currencies (e.g., COP, MXN). Exchange rates cached via exchangerate-api.com.
- **Authentication:** Email/password with bcrypt, Google OAuth, and WhatsApp OTP. Server-side database-stored sessions. Auto-account creation: when tickets are purchased for someone without an account, a passwordless attendee account is auto-created and the ticket is linked immediately. The attendee receives an activation email to set their password. If they register manually later with the same email, the existing passwordless account is upgraded instead of rejected.
- **Inventory Management:** Supports `location_based` and `centralized_warehouse` modes, including audits and damaged goods tracking.
- **Auto-Restock:** Automatic creation of restock orders based on inventory thresholds.
- **Commission Tracking:** Commissions calculated as `Math.round(gross × rate / 100)`.
- **NFC Chip Type Configuration:** Per-event configuration for `ntag_21x` or `mifare_classic`.
- **Role-Based Access Control (RBAC):** Roles include `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, and `admin`.
- **API Design:** Express 5 API server with routes under `/api`, defined by OpenAPI 3.1.
- **Database Schema:** Drizzle ORM for entities like users, events, products, inventory, transactions, and ticketing.
- **Ticketing System:** Full backend with multi-day support, venue sections, per-ticket service fees (admin-configured), concurrency-safe inventory, QR code check-in, wallet passes, bilingual email confirmations, and **pricing stages** (preventa, etapa 1, etc.) with date-based activation logic. The `ticket_pricing_stages` table stores named pricing stages per ticket type with start/end dates. Active stage resolution happens in the attendee-api catalogue, and the purchase flow locks in the active stage price at checkout time. Numbered units (VIP tables/palcos) can be placed on the venue map with `map_x`/`map_y` coordinates (percentage-based), allowing attendees to see and select specific tables on the interactive map.
- **WhatsApp Template Management:** Admin UI at `/whatsapp-templates` for registering Gupshup WhatsApp templates and mapping them to triggers (ticket_purchased, otp_verification, event_reminder, ticket_refund, welcome_message, custom). Supports per-event overrides with priority ordering. Backend dynamically resolves templates at send time, falling back to hardcoded text when no template is configured. DB tables: `whatsapp_templates`, `whatsapp_trigger_mappings`.
- **WhatsApp Message Log:** Every outgoing WhatsApp message (templates, text, documents, images) is logged in the `whatsapp_message_log` table with destination, status (sent/failed/pending), payload, error details, and related context (order, ticket, event). Admin UI in the "Registro de Mensajes" tab shows stats cards, searchable/filterable table with expandable details, and a resend button for failed/pending messages. The resend endpoint replays the original Gupshup API call from stored payload.
- **Guest Lists:** Admins can create shareable guest lists per event with name, max guests, public/private visibility, and optional expiry. Each list gets a unique slug-based link. Guests sign up via the Tickets web app (name/email/phone), receiving a free QR-code ticket and confirmation email. Schema: `guest_lists` and `guest_list_entries` tables. Admin routes in api-server, public signup routes in attendee-api.
- **API Codegen:** OpenAPI 3.1 with Orval for client and Zod schema generation.
- **Validation:** Zod v3 integrated with `drizzle-zod`.
- **Cost of Goods Sold (COGS) Tracking:** `unit_cost_snapshot` on line items and `price_cop`/`cost_cop` on products.
- **Deployment Strategy:** Critical separation of `master` (API services) and `main` (Web Admin) branches for Railway deployments. Pushing to the wrong branch causes production downtime.
- **Mobile App Updates:** Distributed via APK builds only (OTA updates removed).

# Railway (Production Hosting)

The production services are hosted on Railway. Access credentials are stored as Replit secrets:
- `RAILWAY_TOKEN` — Railway API/CLI token
- `RAILWAY_ACCOUNT_TOKEN` — Railway account-level token
- `RAILWAY_DATABASE_URL` — Direct connection string for the production PostgreSQL database

**Railway domains:**
- `prod.tapee.app` — Staff API (api-server)
- `attendee.tapee.app` — Attendee API (attendee-api)
- `admin.tapee.app` — Web Admin portal
- `tickets.tapee.app` — Ticket storefront

**DB schema sync:** When new tables/columns are added to `lib/db/src/schema`, the production DB must be updated. Use `psql "$RAILWAY_DATABASE_URL"` to apply SQL directly, since `drizzle-kit push` may hang with interactive prompts.

**Deployment branches:** `master` → API services + mobile. `main` → Web Admin ONLY. See scratchpad for push flow details.

# External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **API Framework:** Express 5
- **Validation:** Zod v3
- **Mobile Development:** Expo (React Native)
- **Payment Gateway:** Wompi (Nequi/PSE/card payments)
- **Email Service:** Brevo
- **WhatsApp Messaging:** Gupshup API (ticket delivery, OTP, event reminders)
- **Wallet Passes:** Apple Wallet, Google Wallet
- **Ticket Transfer:** POST /api/tickets/:ticketId/transfer — reassign ticket ownership with auto-account creation, email + WhatsApp notifications
- **QR Code Signing:** Custom HMAC-signed QR tokens
- **NFC Hardware:** NTAG213/215, Mifare Classic compatible NFC chips
- **OAuth/OIDC:** `openid-client`
- **Hashing:** bcrypt
- **Push Notifications:** Expo Notifications
- **Location Services:** Expo Location
- **Image Handling:** Expo Image Picker
- **Mapping:** React Native Maps (with Google Maps API)
- **Local Storage:** Expo Secure Store
- **State Management:** Tanstack React Query
- **Analytics/Monitoring:** Sentry
- **API Definition & Codegen:** OpenAPI 3.1 specification and Orval
- **Offline Queuing:** `expo-sqlite` (in staff mobile app)
