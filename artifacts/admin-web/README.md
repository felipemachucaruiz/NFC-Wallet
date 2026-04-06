# Tapee Admin Portal — Web App

React + Vite web admin portal for the Tapee cashless event payment platform. Provides full operational oversight for SaaS admins and per-event management for event admins.

**Production URL:** Deployed on Railway, served by a Node/Express static server.

---

## Roles & Access

### SaaS Admin (`role: admin`)
Full platform-level access:

| Page | Description |
|------|-------------|
| Dashboard | Platform KPIs — revenue, transactions, active events |
| Events | Create and manage events |
| Promoters | Manage event promoters |
| Users | Platform-wide user management |
| Products | Global product catalogue |
| Transactions | All transactions across all events |
| Inventory | Cross-event stock overview |
| Fraud Alerts | Suspicious transaction flags |
| Payouts | Merchant payout management |
| Reports | Revenue, COGS, commission reports |

### Event Admin (`role: event_admin`)
Scoped to their assigned event:

| Page | Description |
|------|-------------|
| Event Dashboard | Event-level KPIs |
| Staff (Event Users) | Assign/remove staff roles for the event |
| Merchants | Manage merchants participating in the event |
| Products | Event-specific product catalogue |
| Locations | Physical sales locations within the event |
| Bracelets | Bracelet issuance and status |
| Access Zones | Gate zone configuration |
| Transactions | All transactions within the event |
| Inventory | Per-location stock levels |
| Refund Requests | Review and approve attendee refund requests |
| Payouts | Event-level merchant payouts |
| Settlement Report | End-of-event financial settlement |
| Reports | Event revenue and sales breakdown |

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + Vite 7 |
| Routing | Wouter |
| Styling | TailwindCSS v4 + ShadCN UI components |
| Data Fetching | TanStack Query |
| API Client | `@workspace/api-client-react` (OpenAPI-generated) |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Auth | Custom JWT session (`Authorization: Bearer <token>`) |
| Node version | **≥ 20.19** (required by Vite 7 + Tailwind oxide) |

---

## Project Structure

```
artifacts/admin-web/
├── server/
│   └── index.js            # Production Express server (Railway)
│                           # Serves Vite static build
│                           # Proxies /_srv/* → https://prod.tapee.app
├── src/
│   ├── App.tsx             # Route definitions, role-based layout switching
│   ├── main.tsx
│   ├── index.css
│   ├── pages/
│   │   ├── login.tsx
│   │   ├── dashboard.tsx
│   │   ├── events.tsx
│   │   ├── users.tsx
│   │   ├── products.tsx
│   │   ├── transactions.tsx
│   │   ├── inventory.tsx
│   │   ├── fraud-alerts.tsx
│   │   ├── payouts.tsx
│   │   ├── promoters.tsx
│   │   ├── reports.tsx
│   │   ├── event-dashboard.tsx
│   │   ├── event-users.tsx
│   │   ├── event-merchants.tsx
│   │   ├── event-products.tsx
│   │   ├── event-locations.tsx
│   │   ├── event-bracelets.tsx
│   │   ├── event-access-zones.tsx
│   │   ├── event-transactions.tsx
│   │   ├── event-inventory.tsx
│   │   ├── event-refund-requests.tsx
│   │   ├── event-payouts.tsx
│   │   ├── event-settlement.tsx
│   │   └── event-reports.tsx
│   ├── components/         # Shared UI components
│   ├── hooks/              # Data-fetching hooks
│   └── lib/                # Utilities, formatters
├── vite.config.ts          # Dev proxy + conditional Replit plugins
├── tailwind.config.ts
└── package.json
```

---

## Authentication

Login returns a `{ token }` JWT stored in `localStorage` as `tapee_admin_token`. Every API request includes `Authorization: Bearer <token>`. The `setAuthTokenGetter` function from `@workspace/api-client-react` wires this up globally.

On login, the role field in the token determines which layout and route set is rendered:
- `admin` → full SaaS sidebar
- `event_admin` → event-scoped sidebar (requires selecting an event)

---

## API Proxy

**Development (Replit):** Vite dev server proxies `/admin-web/_srv/*` → `https://prod.tapee.app` (strips `Origin` and `Referer` headers since the production API whitelists specific origins).

**Production (Railway):** The Express server (`server/index.js`) handles the same proxy at `/_srv/*`.

> The suffix `_srv` is intentional — Replit's infrastructure intercepts paths containing `/api/` and breaks POST requests. Never change this to `_proxy` or `_api`.

---

## Deployment (Railway)

The app is deployed on Railway via GitHub auto-deploy on push to `main`.

### Build
```
pnpm install && pnpm --filter @workspace/admin-web run build
```

### Start
```
node artifacts/admin-web/server/index.js
```

### Environment Variables (Railway)

| Variable | Description |
|----------|-------------|
| `PORT` | Injected automatically by Railway |
| `PROD_API_URL` | `https://prod.tapee.app` (proxied at `/_srv`) |

Node.js version **≥ 20.19** is required. The repo root contains a `.node-version` file and an `engines.node` field in `package.json` to enforce this in Railway's Nixpacks builder.

---

## Running Locally (Replit)

```bash
# From repo root
pnpm install

# Start the admin-web dev server
pnpm --filter @workspace/admin-web run dev
```

The portal is available at the `/admin-web` preview path.

---

## Design

- **Theme:** Dark, matching Tapee brand
- **Primary colour:** Cyan `#00f1ff` (`C.primary`)
- **Primary text on cyan:** `#0a0a0a` (`C.primaryText`)
- **Background:** `#0a0a0a`
- **Components:** ShadCN UI (Radix-based, fully accessible)
- **Monetary values:** All amounts displayed and stored in Colombian Pesos (COP) as integers
