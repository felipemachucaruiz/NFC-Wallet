# CLAUDE.md — Tapee NFC Wallet Monorepo

Guía de instrucciones para Claude Code en este entorno local (Windows 11, migrado desde Replit).

---

## Proyecto

Sistema de pagos cashless sin contacto con pulseras NFC para eventos en Colombia. El sistema cubre tres actores: asistentes (pagos/recargas), comerciantes (cobros) y staff bancario (gestión).

**Stack:** pnpm monorepo · TypeScript 5.9 · Node.js 24 · Express 5 · PostgreSQL · Drizzle ORM · Expo React Native · React + Vite

---

## Estructura del Monorepo

```
artifacts/
  api-server/       → API Express 5 para staff/admin
  attendee-api/     → API Express 5 para asistentes
  mobile/           → App Expo RN (staff)      ← buildNumber actual: 7
  attendee-app/     → App Expo RN (asistentes) ← buildNumber actual: 9
  admin-web/        → Portal web admin (React + Vite)
  tickets/          → Tienda pública de tickets "Tapee Tickets" (React + Vite)
lib/
  api-spec/         ← PROTEGIDO
  api-client-react/ ← PROTEGIDO
  api-zod/          ← PROTEGIDO
  db/               ← PROTEGIDO (ver abajo)
scripts/            ← PROTEGIDO
```

---

## Reglas de Oro — SIEMPRE Aplicar

### 1. Carpetas Protegidas

**NO modificar sin permiso explícito del usuario:**

- `lib/api-spec/`
- `lib/api-client-react/`
- `lib/api-zod/`
- `lib/db/`
- `scripts/`

Si una tarea requiere tocar estas carpetas, detener y pedir confirmación primero.

### 2. Builds de Expo (EAS)

- **Siempre** usar `timeout 90` (primer intento) o `timeout 120` con `timeout: 120000` en el tool si es necesario.
- **Siempre** usar el perfil `production-apk`. NUNCA usar `preview` ni `development` — producen APKs que crashean al lanzar.
- Comando correcto:
  ```bash
  timeout 90 eas build --platform android --profile production-apk --non-interactive --no-wait
  ```

### 3. Build Numbers — Incrementar ANTES de cada build

| App | Archivo | buildNumber actual |
|-----|---------|-------------------|
| Staff | `artifacts/mobile/app.config.js` | **12** (version 1.0.12) |
| Attendee | `artifacts/attendee-app/app.json` | **9** |

Antes de cada nuevo APK, incrementar en `artifacts/mobile/app.config.js` los tres valores juntos:
- `version` → ej. `"1.0.11"` → `"1.0.12"`
- `buildNumber` → ej. `"11"` → `"12"`
- `versionCode` → ej. `11` → `12`

El número de patch de `version` siempre debe coincidir con `buildNumber` y `versionCode`. Esto también cambia el `runtimeVersion` (política `appVersion`), lo que significa que las OTAs publicadas para la versión anterior NO se aplican al nuevo APK — cada APK tiene su propio canal de OTA.

### 4. Entorno Windows — Errores de `preinstall`

Ignorar errores de scripts `preinstall` que llaman a `sh` (p. ej. `sh scripts/...`). El entorno local es Windows PowerShell/bash y esos scripts están diseñados para Unix. No intentar corregirlos ni workaroundearlos salvo indicación explícita.

### 5. SSL Pinning — NUNCA Re-agregar

No agregar bloques `<pin-set>` en configuraciones NSC. El archivo `withNetworkSecurityConfig.js` fue eliminado intencionalmente de ambas apps. No restaurarlo.

---

## OTA Updates (expo-updates)

Ambas apps tienen `expo-updates` con `runtimeVersion: { policy: "appVersion" }`. Los bundles OTA solo aplican a binarios con la misma `appVersion`.

| App | EAS Update URL | Canal producción |
|-----|---------------|-----------------|
| Staff | `https://u.expo.dev/26d76893-d65f-457a-b2eb-7fa177110638` | `production-apk` |
| Attendee | `https://u.expo.dev/47da8b6a-72b7-4bc9-af31-c34ee51a0441` | `production-apk` |

---

## Railway (Producción)

**Dominios:**
- `prod.tapee.app` → Staff API (`artifacts/api-server`)
- `attendee.tapee.app` → Attendee API (`artifacts/attendee-api`)
- `admin.tapee.app` → Web Admin (`artifacts/admin-web`)
- `tickets.tapee.app` → Ticket storefront (`artifacts/tickets`)

**Ramas de despliegue — CRÍTICO:**
- `master` → APIs (api-server, attendee-api) + apps móviles
- `main` → Web Admin ÚNICAMENTE

Hacer push a la rama equivocada causa downtime en producción.

**Sincronización de DB:** Usar `psql "$RAILWAY_DATABASE_URL"` para aplicar SQL directamente. `drizzle-kit push` puede quedarse colgado con prompts interactivos.

---

## Preferencias de Desarrollo

- **Desarrollo iterativo:** completar una tarea a la vez, confirmar antes de pasar a la siguiente.
- **TDD:** aplicar Test-Driven Development donde sea aplicable.
- **Paradigma funcional:** preferir programación funcional donde aplique.
- **Preguntar antes de cambios mayores** (refactors grandes, cambios de arquitectura, tocar carpetas protegidas).
- **Explicaciones claras y simples:** sin tecnicismos innecesarios.
- No agregar features, refactors o "mejoras" más allá de lo pedido.
- No agregar manejo de errores especulativo ni validaciones para escenarios imposibles.

---

## Arquitectura Clave (Referencia Rápida)

- **Auth:** Email/password (bcrypt), Google OAuth, WhatsApp OTP. Sesiones en DB (server-side).
- **Pagos:** Wompi — Nequi, PSE, tarjeta tokenizada.
- **NFC:** HMAC-SHA256 para payloads. Soporta NTAG213/215 y Mifare Classic.
- **RBAC:** `attendee`, `bank`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, `admin`.
- **API:** Express 5, rutas bajo `/api`, definidas en OpenAPI 3.1. Codegen con Orval.
- **Validación:** Zod v3 + drizzle-zod.
- **Monitoreo:** Sentry en los 6 servicios. Solo en producción.
- **Estado mobile:** Tanstack React Query. Offline queue via `expo-sqlite` (staff app).
- **Mensajería:** Gupshup (WhatsApp). Emails: Brevo.

---

## Variables de Entorno Relevantes

- `RAILWAY_TOKEN` — Railway API/CLI token
- `RAILWAY_ACCOUNT_TOKEN` — Railway account-level token
- `RAILWAY_DATABASE_URL` — Connection string de la DB PostgreSQL en Railway
