# Informe de Pruebas de Saturación — Tapee

**Fecha:** 9 de Abril 2026
**Entorno:** Producción (Railway)
**APIs probadas:** attendee.tapee.app + prod.tapee.app

---

## Resumen Ejecutivo

Con **100 usuarios simultáneos** el sistema ya muestra signos de estrés:
- El 29.6% de peticiones fueron rechazadas por rate limiting (429)
- La latencia p95 alcanzó 2.3 segundos
- La latencia p99 alcanzó 25 segundos
- El registro de cuentas nuevas toma ~18 segundos bajo carga (bcrypt)

**Veredicto:** La configuración actual soporta ~50-80 usuarios concurrentes cómodamente. Para 5,000+ usuarios se requieren cambios significativos de infraestructura.

---

## Resultados Detallados (Perfil Light — 100 usuarios)

| Métrica | Valor |
|---------|-------|
| Duración total | 102s |
| Total peticiones | 2,428 |
| Peticiones exitosas (2xx) | 1,348 (55.5%) |
| Rate limited (429) | 719 (29.6%) |
| Tasa de éxito real (sin 429/404/400) | 98.7% |
| RPS promedio | 23.8 req/s |
| Latencia p50 | 103ms |
| Latencia p90 | 587ms |
| Latencia p95 | 2,363ms |
| Latencia p99 | 25,418ms |

### Latencia por Endpoint

| Endpoint | Count | p50 | p95 | p99 |
|----------|-------|-----|-----|-----|
| GET /me/bracelets | 512 | 101ms | 1,066ms | 14,385ms |
| GET /me/transactions | 325 | 103ms | 1,444ms | 19,243ms |
| GET /events/nearby | 270 | 101ms | 1,037ms | 3,734ms |
| GET /auth/user | 248 | 101ms | 1,331ms | 16,795ms |
| POST /auth/create-account | 80 | 18,675ms | 30,325ms | 30,378ms |
| STAFF GET /events | 146 | 107ms | 176ms | 1,909ms |
| STAFF GET /merchants | 85 | 108ms | 164ms | 947ms |
| STAFF GET /reports/revenue | 66 | 114ms | 176ms | 502ms |

---

## Cuellos de Botella Identificados

### 1. Rate Limiting de Railway
Railway aplica rate limiting agresivo. Con 24 RPS ya se activa.
**Impacto:** Alto — bloquea peticiones legítimas bajo carga.

### 2. Bcrypt (Registro de cuentas)
El hashing con 12 rounds de bcrypt bloquea el event loop de Node.js por ~18 segundos bajo carga.
**Impacto:** Medio — afecta el registro durante picos, pero no las operaciones normales del evento.

### 3. Conexiones de base de datos
Un solo servidor Express con pool de conexiones limitado se satura rápido.
**Impacto:** Alto — causa timeouts en cascada.

### 4. Single Instance (Sin réplicas)
Cada API corre en una sola instancia. No hay redundancia ni distribución de carga.
**Impacto:** Crítico para 5,000+ usuarios.

---

## Recomendaciones por Nivel de Escala

### Nivel 1: 500 usuarios simultáneos (~$50-80/mes)
- [ ] Escalar cada API a **2 replicas** en Railway
- [ ] Subir a **1 vCPU / 1 GB RAM** por instancia
- [ ] Reducir bcrypt rounds de 12 a 10 para registro
- [ ] Agregar índices de base de datos para queries frecuentes
- [ ] Configurar connection pooling en Drizzle (max 20 conexiones)

### Nivel 2: 2,000 usuarios simultáneos (~$150-250/mes)
- [ ] Escalar a **3-4 réplicas** por servicio API
- [ ] Subir a **2 vCPU / 2 GB RAM** por instancia
- [ ] **Agregar Redis** para caché de sesiones (elimina queries de sesión repetitivos)
- [ ] Agregar Redis para caché de datos calientes (eventos activos, productos, merchants)
- [ ] **PgBouncer** para connection pooling de PostgreSQL
- [ ] Mover bcrypt a un worker thread para no bloquear el event loop
- [ ] Implementar caché de respuestas HTTP (ETag/Cache-Control) para datos que cambian poco

### Nivel 3: 5,000+ usuarios simultáneos (~$400-700/mes)
- [ ] Escalar a **6-8 réplicas** por servicio API
- [ ] Subir a **2 vCPU / 4 GB RAM** por instancia
- [ ] **Redis obligatorio** para sesiones + caché
- [ ] **PgBouncer obligatorio** en modo transaction
- [ ] **Read replica** de PostgreSQL para queries de solo lectura (bracelets, transacciones, reportes)
- [ ] Rate limiting propio (no depender solo de Railway)
- [ ] Load balancer con health checks
- [ ] Monitoreo con alertas (Datadog, New Relic, o Railway metrics)

### Nivel 4: 10,000+ usuarios simultáneos (~$1,000-2,000/mes)
- [ ] **Arquitectura de microservicios** — separar auth, payments, bracelets en servicios independientes
- [ ] **PostgreSQL managed** (Railway Pro o AWS RDS) con auto-scaling
- [ ] **CDN** para assets estáticos
- [ ] **Queue system** (BullMQ + Redis) para operaciones pesadas (reembolsos, reportes)
- [ ] Considerar migración a AWS/GCP con auto-scaling groups

---

## Estimación de Costos Railway

| Config | Réplicas/servicio | vCPU | RAM | Costo API/mes | DB/mes | Redis/mes | Total/mes |
|--------|-------------------|------|-----|---------------|--------|-----------|-----------|
| Actual | 1 | 0.5 | 0.5GB | ~$10 | ~$5 | — | ~$15 |
| 500 users | 2 | 1 | 1GB | ~$40 | ~$10 | — | ~$50 |
| 2,000 users | 4 | 2 | 2GB | ~$120 | ~$20 | ~$15 | ~$155 |
| 5,000 users | 8 | 2 | 4GB | ~$320 | ~$50 | ~$25 | ~$395 |
| 10,000 users | 12+ | 4 | 4GB | ~$720 | ~$100 | ~$40 | ~$860 |

*Nota: Estos son estimados. Railway cobra por uso, no por plan fijo.*

---

## Siguientes Pasos Recomendados

1. **Inmediato (gratis):** Optimizar queries lentas, agregar índices, reducir bcrypt rounds
2. **Corto plazo ($50/mes):** Escalar a 2 réplicas por servicio
3. **Antes del primer evento grande:** Agregar Redis para sesiones, escalar a 4 réplicas
4. **Para múltiples eventos simultáneos:** Implementar Nivel 3 completo

---

## Cómo Re-ejecutar las Pruebas

```bash
cd load-test

# Instalar dependencias
npm install

# Perfiles disponibles:
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:light   # 100 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:medium  # 500 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:heavy   # 2,000 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:spike   # 5,000+ usuarios
```

Se recomienda correr los perfiles progresivamente (light → medium → heavy) para identificar el punto exacto de quiebre.
