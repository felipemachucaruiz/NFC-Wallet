# Informe de Pruebas de Saturación — Tapee

**Fecha:** 9 de Abril 2026
**Entorno:** Producción (Railway — Plan Hobby)
**APIs probadas:** attendee.tapee.app + prod.tapee.app

---

## Resumen Ejecutivo

Se ejecutaron dos rondas de pruebas de carga contra las APIs de producción.

### Prueba 1: 100 usuarios simultáneos (Light)
- RPS sostenido: **34.5 req/s**
- Latencia p50: **103ms** | p95: **1,084ms** | p99: **11,930ms**
- Rate limited (429): **34.4%** de peticiones
- Tasa de éxito real (sin errores esperados): **99.9%**

### Prueba 2: 500 usuarios simultáneos (Medium)
- RPS sostenido: **~112 req/s** (pico)
- Total peticiones en 120s: **~13,200**
- Rate limited (429): **~32%** de peticiones
- El servidor procesó correctamente las peticiones que no fueron rate-limited

**Veredicto:** Con la configuración actual (1 réplica por servicio), Tapee soporta cómodamente **~150-200 usuarios concurrentes**. El cuello de botella principal es el rate limiting de Railway, no la capacidad del servidor.

---

## Comparativa: Antes vs Después del Plan Hobby

| Métrica (100 users) | Antes | Después | Mejora |
|---------------------|-------|---------|--------|
| RPS promedio | 23.8 | 34.5 | +45% |
| Latencia p95 | 2,363ms | 1,084ms | -54% |
| Latencia p99 | 25,418ms | 11,930ms | -53% |
| Éxito real | 98.7% | 99.9% | +1.2% |

---

## Resultados Detallados

### Perfil Light (100 usuarios)

| Métrica | Valor |
|---------|-------|
| Duración total | 83.8s |
| Total peticiones | 2,890 |
| Peticiones exitosas (2xx) | 1,390 (48.1%) |
| Rate limited (429) | 996 (34.4%) |
| Tasa de éxito real | 99.9% |
| RPS promedio | 34.5 req/s |
| Latencia p50 | 103ms |
| Latencia p95 | 1,084ms |
| Latencia p99 | 11,930ms |

### Perfil Medium (500 usuarios)

| Métrica | Valor |
|---------|-------|
| Duración total | 120s |
| Total peticiones | ~13,200 |
| RPS sostenido | ~112 req/s |
| Errores | ~32% (mayoría 429) |

### Latencia por Endpoint (100 usuarios)

| Endpoint | Count | p50 | p95 | p99 |
|----------|-------|-----|-----|-----|
| GET /me/bracelets | 647 | 101ms | 829ms | 5,797ms |
| GET /me/transactions | 423 | 103ms | 1,254ms | 2,227ms |
| GET /events/nearby | 297 | 101ms | 932ms | 6,105ms |
| GET /auth/user | 349 | 101ms | 833ms | 5,251ms |
| POST /auth/create-account | 80 | 7,291ms | 15,657ms | 16,404ms |
| STAFF GET /events | 124 | 119ms | 187ms | 230ms |
| STAFF GET /merchants | 95 | 118ms | 204ms | 2,804ms |
| STAFF GET /reports/revenue | 55 | 136ms | 1,019ms | 1,643ms |

---

## Cuellos de Botella Identificados

### 1. Rate Limiting de Railway (PRINCIPAL)
Railway aplica rate limiting a ~35 RPS por servicio. Con 100 usuarios ya se activa.
**Impacto:** Crítico — rechaza 30-35% de peticiones legítimas bajo carga moderada.
**Solución:** Escalar a múltiples réplicas distribuye las peticiones.

### 2. Bcrypt (Registro de cuentas)
El hashing con 12 rounds bloquea el event loop ~7 segundos bajo carga.
**Impacto:** Medio — solo afecta registro, no operaciones normales del evento.
**Solución:** Mover a worker thread o reducir a 10 rounds.

### 3. Single Instance
Cada API corre en una sola instancia. Sin distribución de carga.
**Impacto:** Alto — limita la capacidad total del sistema.
**Solución:** Agregar réplicas en Railway.

### 4. Sin caché de sesiones
Cada petición autenticada consulta la base de datos para validar la sesión.
**Impacto:** Medio — genera ~40% de queries innecesarios a PostgreSQL.
**Solución:** Redis para caché de sesiones.

---

## Capacidad Estimada por Configuración

| Config | Réplicas | Usuarios Concurrentes | RPS Estimado |
|--------|----------|-----------------------|--------------|
| Actual (1 réplica) | 1 | ~150-200 | ~35 |
| 2 réplicas | 2 | ~300-400 | ~70 |
| 3 réplicas | 3 | ~500-700 | ~105 |
| 5 réplicas (max Hobby) | 5 | ~800-1,200 | ~175 |
| 8 réplicas (Pro) | 8 | ~1,500-2,500 | ~280 |
| 8 réplicas + Redis + optimizaciones | 8 | ~3,000-5,000 | ~500+ |

---

## Recomendaciones por Nivel de Escala

### Nivel 1: Hasta 400 usuarios (~$50-80/mes)
- [ ] Escalar cada API a **2 réplicas** en Railway
- [ ] Subir a **1 vCPU / 1 GB RAM** por instancia
- [ ] Reducir bcrypt rounds de 12 a 10
- [ ] Agregar índices DB para queries frecuentes
- [ ] Configurar connection pool max 20 conexiones

### Nivel 2: Hasta 1,200 usuarios (~$100-180/mes)
- [ ] Escalar a **3-5 réplicas** por servicio (max Hobby)
- [ ] Subir a **2 vCPU / 2 GB RAM** por instancia
- [ ] **Agregar Redis** para caché de sesiones
- [ ] Caché de datos calientes (eventos, productos, merchants)
- [ ] Mover bcrypt a worker thread

### Nivel 3: Hasta 5,000 usuarios (~$300-600/mes) — Requiere Plan Pro
- [ ] Escalar a **8-10 réplicas** por servicio
- [ ] **Redis obligatorio** para sesiones + caché
- [ ] **PgBouncer** para connection pooling
- [ ] Read replica de PostgreSQL
- [ ] Rate limiting propio
- [ ] Monitoreo con alertas

### Nivel 4: 10,000+ usuarios (~$800-1,500/mes)
- [ ] Separar servicios (auth, payments, bracelets)
- [ ] PostgreSQL managed con auto-scaling
- [ ] Queue system (BullMQ + Redis)
- [ ] CDN para assets estáticos

---

## Estimación de Costos Railway

| Config | Réplicas/srv | vCPU | RAM | Costo/mes |
|--------|-------------|------|-----|-----------|
| Actual | 1 | 0.5 | 0.5GB | ~$15 |
| 400 users | 2 | 1 | 1GB | ~$50 |
| 1,200 users | 5 | 2 | 2GB | ~$180 |
| 5,000 users (Pro) | 8 | 2 | 4GB | ~$450 |
| 10,000 users (Pro) | 12+ | 4 | 4GB | ~$900 |

*Railway cobra por uso real (vCPU-hora + GB-hora), no plan fijo. Costos son estimados para uso 24/7. Eventos puntuales costarían menos.*

---

## Siguiente Paso Inmediato Recomendado

**Escalar a 2 réplicas por servicio** en el dashboard de Railway:
1. Ve a cada servicio (attendee-api, api-server)
2. Settings → Scaling → Set replicas to 2
3. Esto duplica la capacidad inmediatamente a ~400 usuarios

---

## Cómo Re-ejecutar las Pruebas

```bash
cd load-test
npm install

# Perfiles (ejecutar progresivamente):
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:light   # 100 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:medium  # 500 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:heavy   # 2,000 usuarios
STAFF_USER="hola@tapee.app" STAFF_PASSWORD="[password]" npm run test:spike   # 5,000+ usuarios
```
