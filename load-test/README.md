# Tapee Load Test

Pruebas de saturación para las APIs de Tapee.

## Perfiles de carga

| Perfil   | Attendees | Staff | Duración | RPS/usuario | Total aprox. |
|----------|-----------|-------|----------|-------------|--------------|
| `light`  | 80        | 20    | 60s      | 0.5         | ~50 req/s    |
| `medium` | 400       | 100   | 120s     | 1           | ~500 req/s   |
| `heavy`  | 1,600     | 400   | 180s     | 2           | ~4,000 req/s |
| `spike`  | 4,000     | 1,000 | 120s     | 3           | ~15,000 req/s|

## Ejecución

```bash
cd load-test
npm install

# Perfiles disponibles:
npm run test:light    # 100 usuarios
npm run test:medium   # 500 usuarios
npm run test:heavy    # 2,000 usuarios
npm run test:spike    # 5,000+ usuarios
```

## Variables de entorno

- `ATTENDEE_API` - URL del attendee API (default: `https://attendee.tapee.app`)
- `STAFF_API` - URL del staff API (default: `https://prod.tapee.app`)
- `STAFF_USER` - Username staff para login (default: `admin`)
- `STAFF_PASSWORD` - Password staff para login (default: `admin`)
- `PROFILE` - Perfil de carga: light, medium, heavy, spike

## Escenarios simulados

### Attendee (80% del tráfico)
- Consulta de pulseras (30%)
- Historial de transacciones (20%)
- Eventos cercanos (15%)
- Info de usuario (15%)
- Vincular pulsera (10%)
- Estado de pago (10%)

### Staff (20% del tráfico)
- Listar eventos (25%)
- Transacciones (20%)
- Comercios (15%)
- Reportes de revenue (10%)
- Usuarios (10%)
- Alertas de fraude (10%)
- Sync de pulseras (10%)

## Reportes

Se genera un JSON con métricas detalladas + recomendaciones de infraestructura.
