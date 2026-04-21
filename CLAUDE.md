# CLAUDE.md — Tapee NFC Wallet Monorepo

Guía de instrucciones para Claude Code en este entorno local (macOS).

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
  mobile/           → App Expo RN (staff)
  attendee-app/     → App Expo RN (asistentes)
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

- `timeout` no existe en macOS — usar `timeout: 90000` en el Bash tool o simplemente `npx eas-cli` con `--no-wait`.
- **Siempre** usar el perfil `production-apk`. NUNCA usar `preview` ni `development` — producen APKs que crashean al lanzar.
- Comando correcto (desde el directorio de la app):
  ```bash
  EXPO_TOKEN=<token> npx eas-cli build --platform android --profile production-apk --non-interactive --no-wait
  ```
- El EXPO_TOKEN está guardado en memoria local de Claude (no en este archivo).

### 3. Versioning — Incrementar ANTES de cada APK

| App | Archivo | Versión actual |
|-----|---------|----------------|
| Staff | `artifacts/mobile/app.config.js` | **1.0.18** (buildNumber 18, versionCode 18) |
| Attendee | `artifacts/attendee-app/app.json` | **9** |

Antes de cada nuevo APK de la app staff, incrementar en `artifacts/mobile/app.config.js` los tres valores juntos:
- `version` → ej. `"1.0.12"` → `"1.0.13"`
- `buildNumber` → ej. `"12"` → `"13"`
- `versionCode` → ej. `12` → `13`

El patch de `version` siempre coincide con `buildNumber` y `versionCode`.

**Importante:** cambiar `version` cambia el `runtimeVersion` (política `appVersion`), por lo que las OTAs de la versión anterior NO aplican al nuevo APK. Cada APK tiene su propio canal OTA independiente.

### 4. OTA Updates

Publicar OTA (sin nuevo APK) cuando el cambio es solo JS/TS — no toca código nativo:
```bash
EXPO_TOKEN=<token> npx eas-cli update --channel production-apk --message "descripción" --non-interactive
```
Ejecutar desde `artifacts/mobile/`. Las OTAs solo aplican a dispositivos con el mismo `runtimeVersion`.

**Cambios que REQUIEREN APK nuevo (no son OTA-bles):**
- Cambios en módulos nativos (`modules/barcode-receiver/android/`)
- Nuevos plugins de Expo
- Cambios en `app.config.js` que afecten manifiestos nativos

### 5. SSL Pinning — NUNCA Re-agregar

No agregar bloques `<pin-set>` en configuraciones NSC. El archivo `withNetworkSecurityConfig.js` fue eliminado intencionalmente de ambas apps. No restaurarlo.

---

## Railway (Producción)

**Dominios:**
- `prod.tapee.app` → Staff API (`artifacts/api-server`)
- `attendee.tapee.app` → Attendee API (`artifacts/attendee-api`)
- `admin.tapee.app` → Web Admin (`artifacts/admin-web`)
- `tickets.tapee.app` → Ticket storefront (`artifacts/tickets`)

**Ramas de despliegue — CRÍTICO:**
- `master` → Todo excepto Web Admin (APIs, apps móviles, tickets storefront)
- `main` → Web Admin (`artifacts/admin-web`) ÚNICAMENTE

Hacer push a la rama equivocada causa downtime en producción.

**Sincronización de DB:** Usar `psql "$RAILWAY_DATABASE_URL"` para aplicar SQL directamente. `drizzle-kit push` puede quedarse colgado con prompts interactivos.

---

## Hardware — PDA con Lector de Códigos de Barra

Los dispositivos de gate usan un PDA Android gestionado con **ScaleFusion MDM**.

El lector está configurado para emitir broadcasts con:
- **Action:** `scan.rcv.message`
- **Extra key:** `barcodeData`
- **Decode:** UTF-8, sin terminador, sin prefijo/sufijo

El módulo nativo `modules/barcode-receiver` recibe estos broadcasts. En Android 13+ se requiere el flag `RECEIVER_EXPORTED` al registrar el receiver dinámicamente — ya está implementado desde build #12.

---

## Demo Login

Existe un panel oculto en la pantalla de login (5 toques al logo) que permite cambiar de rol sin credenciales.

- **Endpoint:** `POST /api/auth/demo-login` — retorna 404 si `DEMO_SECRET` no está configurado en Railway.
- **Roles disponibles:** `bank`, `gate`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, `admin`, `box_office`
- **Usuarios demo:** `demo_<role>` en la DB, todos vinculados al evento demo (slug `demo-tapee`).
- El secreto está guardado en memoria local de Claude.

---

## Arquitectura Clave (Referencia Rápida)

- **Auth:** Email/password (bcrypt), Google OAuth, WhatsApp OTP. Sesiones en DB (server-side).
- **Pagos:** Wompi — Nequi, PSE, tarjeta tokenizada.
- **NFC:** HMAC-SHA256 para payloads. Soporta NTAG213/215 y Mifare Classic.
- **RBAC:** `attendee`, `bank`, `gate`, `merchant_staff`, `merchant_admin`, `warehouse_admin`, `event_admin`, `box_office`, `admin`, `ticketing_auditor`.
- **API:** Express 5, rutas bajo `/api`, definidas en OpenAPI 3.1. Codegen con Orval.
- **Validación:** Zod v3 + drizzle-zod.
- **Monitoreo:** Sentry en los 6 servicios. Solo en producción.
- **Estado mobile:** Tanstack React Query. Offline queue con AsyncStorage, scoped por `userId`.
- **Mensajería:** Gupshup (WhatsApp). Emails: Brevo.

---

## Variables de Entorno (nombres — valores en memoria local de Claude)

- `EXPO_TOKEN` — EAS CLI authentication
- `DEMO_SECRET` — Railway: habilita endpoint de demo login en api-server
- `EXPO_PUBLIC_DEMO_SECRET` — Mobile: activa panel de demo en app (`artifacts/mobile/.env`)
- `RAILWAY_TOKEN` — Railway API/CLI token
- `RAILWAY_ACCOUNT_TOKEN` — Railway account-level token
- `RAILWAY_DATABASE_URL` — Connection string de la DB PostgreSQL en Railway
