# Tapee — Contactless Cashless Event Payments

A contactless cashless payment platform for the Colombian event market. Attendees load money onto NFC wristbands (NTAG213/215) secured with HMAC-SHA256 signing. Merchants charge wristbands via a product cart. Bank staff handle top-ups. Includes commission tracking, merchant payouts, warehouse inventory management with auto-restock, and a full audit trail.

Built as a pnpm monorepo with TypeScript throughout.

---

## Apps

### Staff App (`artifacts/mobile`)
Expo React Native app with six role-based portals:
- **Bank** — top-up wristbands, manage shifts
- **Merchant Staff** — POS cart, NFC charge
- **Merchant Admin** — reports, staff management, stock
- **Warehouse Admin** — inventory dispatch, restock orders
- **Event Admin** — event settings, merchant/location setup
- **Admin** — full system access, user management

Bilingual (Spanish / English), fully offline-capable with sync queue, NFC read/write.

### Attendee App (`artifacts/attendee-app`)
Consumer-facing Expo wallet app. Attendees check their wristband balance, view transaction history, request refunds, and initiate digital top-ups via Nequi or PSE.

Tapee Black dark theme (cyan accents on `#0a0a0a`), NFC read-only.

### API Server (`artifacts/api-server`)
Express 5 REST API. All routes under `/api`. Handles auth, events, bracelets, top-ups, transactions, merchants, inventory, payouts, reports, and Wompi payment webhooks.

### Attendee API (`artifacts/attendee-api`)
Separate Express API for attendee-facing operations — balance checks, payment initiation, push token registration, and refund requests.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 |
| Mobile | Expo SDK 54 / React Native |
| API | Express 5 |
| Database | PostgreSQL 16 + Drizzle ORM |
| Validation | Zod v3, drizzle-zod |
| API codegen | Orval (from OpenAPI 3.1 spec) |
| Auth | Email + bcrypt, server-side sessions |
| NFC security | HMAC-SHA256 (`balance:counter` signed with `HMAC_SECRET`) |
| Payments | Wompi (Nequi / PSE) |
| Mobile builds | EAS Build + EAS Update (OTA) |

---

## Repository Structure

```
├── artifacts/
│   ├── api-server/        # Express API (port $PORT, default 8080)
│   ├── attendee-api/      # Attendee-facing Express API (port 3001)
│   ├── mobile/            # Staff Expo app (port 18115)
│   └── attendee-app/      # Consumer Expo wallet app (port 18116)
├── lib/
│   ├── api-spec/          # OpenAPI 3.1 spec + Orval codegen config
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-zod/           # Generated Zod schemas
│   └── db/                # Drizzle ORM schema + DB connection
├── scripts/               # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- Node.js 24+
- pnpm 10+
- PostgreSQL 16

### Install dependencies
```bash
pnpm install
```

### Environment variables
Create a `.env` file or set these secrets in your environment:

```env
DATABASE_URL=postgresql://...
HMAC_SECRET=<random 32+ char string>
SESSION_SECRET=<random 32+ char string>
PORT=8080

# Wompi (digital top-ups — Nequi / PSE)
WOMPI_BASE_URL=https://sandbox.wompi.co/v1
WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_EVENTS_SECRET=
APP_URL=https://yourdomain.com
```

### Database setup
```bash
pnpm --filter @workspace/db run push
```

### Run in development
```bash
# API server
pnpm --filter @workspace/api-server run dev

# Attendee API
PORT=3001 pnpm --filter @workspace/attendee-api run dev

# Staff mobile app
pnpm --filter @workspace/mobile run dev

# Attendee mobile app
pnpm --filter @workspace/attendee-app run dev
```

### Build
```bash
pnpm run build
```

---

## NFC Security

Wristband payloads contain `{ balance, counter, hmac }`. The HMAC is computed as:

```
HMAC-SHA256(key=HMAC_SECRET, message="balance:counter")
```

The `counter` is incremented on every write and prevents replay/rollback attacks. The signing key is fetched from `/api/auth/signing-key` (authenticated staff only).

---

## Mobile OTA Updates

JavaScript changes do not require a new APK — push them over the air in ~60 seconds:

```bash
# Staff app
cd artifacts/mobile
EXPO_TOKEN=$EXPO_TOKEN EXPO_PUBLIC_DOMAIN=$YOUR_DOMAIN \
  npx eas update --channel preview --message "Description" --non-interactive

# Attendee app
cd artifacts/attendee-app
EXPO_TOKEN=$EXPO_TOKEN \
  EXPO_PUBLIC_DOMAIN=$YOUR_DOMAIN \
  EXPO_PUBLIC_ATTENDEE_DOMAIN="$YOUR_DOMAIN/attendee-api" \
  npx eas update --channel preview --message "Description" --non-interactive
```

A new native EAS build is required when adding native modules, changing `app.config.js` permissions, or upgrading the Expo SDK. OTAs use fingerprint-based `runtimeVersion` — only binaries with matching native fingerprints will receive updates.

---

## EAS Project Info

| App | Project ID | Channel |
|---|---|---|
| Staff app | `26d76893-d65f-457a-b2eb-7fa177110638` | `preview` |
| Attendee app | `47da8b6a-72b7-4bc9-af31-c34ee51a0441` | `preview` |

---

## Roles

| Role | Access |
|---|---|
| `admin` | Full system |
| `event_admin` | Events, merchants, locations, reports |
| `merchant_admin` | Merchant reports, staff, stock |
| `merchant_staff` | POS — charge wristbands |
| `bank` | Top-ups, shift management |
| `warehouse_admin` | Inventory dispatch, restock |
| `attendee` | Consumer wallet (attendee app only) |

---

## Currency

All monetary values are stored and transmitted in Colombian Pesos (COP) as integers.

---

## License

Private — all rights reserved.
