# Diseños pendientes (items riesgosos del roadmap)

> Generados por agentes de diseño (solo lectura) el 2026-06-18. NO ejecutados.
> Requieren decisión/sign-off antes de implementar. Referencia: `docs/AUDITORIA-2026-06.md`.

---

## #1 — Migración de dinero REAL (float) → ENTEROS-CENTAVOS

### 1. Inventario de columnas REAL de dinero

Declaradas en código (`backend/init-db.js` y `backend/server.js`):

| Tabla | Columna(s) REAL |
|---|---|
| `movs` | `monto` |
| `cajas` | `saldo_inicial` |
| `budgets` | `monto` |
| `arqueos` | `saldo_sistema`, `saldo_fisico`, `diferencia` |
| `proveedor_productos` | `precio_actual` (cantidad_* NO es dinero) |
| `cxp` | `monto_total` |
| `cxp_facturas` | `monto` |
| `cxp_abonos` | `monto` |
| `ordenes_compra` | `monto_estimado`, `monto_entregado`, `monto_real`, `ajuste` |
| `ordenes_compra_items` | `precio_estimado`, `total_estimado`, `precio_real`, `total_real` (cantidad_* NO) |

Tablas "vivas" NO declaradas en repo (confirmar con `PRAGMA table_info`): `empleados.sueldo_base`; `ventas` (`importe`); `prestamos.monto_original`/`saldo_actual`; `prestamos_abonos.monto`; `nominas_pagos` (`neto`,`comisiones`,`prestamos_abonados`,`total`); `comisiones_mensuales_pagos/_periodos`; `viaticos`/`viaticos_conceptos`; `bonos_config.monto`; `ventas_detalle_cortes` (efectivo, transferencia, etc.). **Paso 0 obligatorio:** generar inventario real con `sqlite_master` + `PRAGMA table_info`, NO confiar solo en el repo. Distinguir cantidades y `porcentaje` (NO son centavos).

### 2. Estrategia de migración (script idempotente `backend/migrate-centavos.js`)
1. Backup previo (`fs.copyFileSync` + `.dump`).
2. Idempotencia: tabla `migrations(id, applied_at)`; abortar si `centavos-v1` ya aplicada.
3. Verificación pre: guardar `SUM()` por columna.
4. Conversión en una transacción: `UPDATE t SET col = CAST(ROUND(col*100) AS INTEGER)`.
5. Flag `--dry-run` (BEGIN…ROLLBACK + diff de sumas).
6. Verificación post: `SUM(nueva) === Math.round(SUM_pre*100)`; si falla, ROLLBACK.

### 3. Backend
- Helpers `toPesos(c)=c/100`, `toCent(p)=Math.round(p*100)`. **Decisión recomendada: API devuelve centavos enteros**; frontend convierte al render.
- Escritura: `toCent()` en INSERT/UPDATE de dinero.
- Saldos: `calcularSaldoCaja` funciona idéntico con enteros (más exacto); eliminar los `Math.round(x*100)/100` y `+0.01` que dejan de ser necesarios.
- Exports (excel/pdf/csv) e import: dividir/multiplicar /100 en el borde.

### 4. Frontend
- `fmtMXN` (duplicado) pasa a `n => '$' + (Number(n)/100).toLocaleString(...)`.
- Inputs siguen capturando pesos; multiplicar ×100 una sola vez en la capa API.

### 5. Riesgos y rollback
- Doble conversión (mitigado por tabla `migrations`); desfase front/back (desplegar juntos); columna viva olvidada (Paso 0 crítico). Rollback = restaurar backup + revertir código.

### 6. Orden con downtime mínimo (~1-2 min)
`pm2 stop` → backup → `migrate-centavos.js` → desplegar código → `pm2 start` → verificar saldos vs valores pre.

---

## #3 — Resolución de conflictos real (last-write-wins)

**Problema:** `server.js:633` usa `now = Date.now()` del servidor y el UPDATE del UPSERT es incondicional → gana el último en LLEGAR, no la edición más reciente. Un guard con el reloj del servidor es inútil.

1. **Cliente envía `updated_at` lógico**: sellar `mov.updated_at = Date.now()` en el momento de la EDICIÓN (no del envío); viaja inmutable en la cola, así un mov editado offline conserva su timestamp real.
2. **Server UPSERT condicional**: leer `ua = Number(m.updated_at)`, validar/acotar contra futuro (`Math.min(ua||now, now+SKEW)`), y cambiar a `ON CONFLICT(id) DO UPDATE SET … updated_at=excluded.updated_at WHERE excluded.updated_at > movs.updated_at`. Responder `{ok, applied:<bool>}`. Igual en `/api/movs/bulk`.
3. **Clock-skew**: `/api/sync` ya devuelve `serverTime`; calcular `offset = serverTime - Date.now()` y sellar con `Date.now()+offset`. Tolerancia `SKEW_MS` (~5 min).
4. **Compat**: server tolerante primero (fallback a `now` si falta `updated_at`); clientes después. Sin migración de esquema (`updated_at` ya existe). Rollback = quitar el `WHERE`.
5. **Cola/sync**: `applied:false` devuelve 200 → se quita de la cola normal; reintentos idempotentes; `since` sigue basado en `serverTime`.

Archivos: `server.js:630-668`, `api.js:43-46,99-117`.

---

## #6 — Extracción incremental del monolito `server.js`

Ya existe patrón probado en prod: `module.exports = function mountX(app, db, opts)` (ver `ventas-cierres-dia.js:44`, montado en `server.js:3443`). Replicar dominio por dominio.

**Módulos propuestos:** `routes/{movs,cats,cajas,transferencia,arqueos,terceros,cxp,ordenes,ventas,viaticos,users,import,nomina}.js` + capa `repositories/` para los 488 `db.prepare`. Middlewares compartidos (`auth`, `requirePin`, `audit`) se definen una vez en server.js y se inyectan vía `opts`.

**Preservar orden de rutas (HOTFIX_ROUTE_ORDER):** mantener el mount de `ventas-cierres-dia` ANTES de `/api/ventas/:id`; dentro de cada router, rutas literales antes de `/:id`. Añadir test que verifique que `GET /api/ventas/cierres-dia` no cae en `:id`.

**Secuencia (menor riesgo primero):** cats → arqueos/terceros → cxp/viaticos → ordenes → ventas (último de los grandes por el HOTFIX) → nomina. Por paso: cortar a `routes/X.js`, mount en misma posición, `npm start`, smoke-test, commit.

**Habilitar tests primero:** extraer `db.js` (instancia exportada), `middleware/auth.js`, y `app.js` (express configurado sin `listen`) → permite **supertest** por dominio.

---

## F4 — Unificación de helpers de formato

**Canónico:** `app-shell.jsx` (expuesto en `window`): `fmtMXN` (L293), `fmtMXNshort` (L294), `fmtDate` (L312). NO existe `fmtFecha` ni `fmtNomMXN` en el canónico.

**Seguras de deduplicar (equivalentes):**
- `fmtMXN` en viaticos/ventas/reports (`Number(n||0)` vs `Number(n)||0` es equivalente).
- `fmt` en comisiones-mensuales-tab (idéntica).
- `fmtFecha` (3 copias byte-idénticas; equivale a `fmtDate`).

**DIVERGEN — no tocar a ciegas:**
- `fmtMXNshort` en reports.jsx (maneja negativos + `.toFixed(2)` en millones) vs canónico (`.toFixed(1)`, sin signo).
- `fmtMXNshort` en ventas.jsx (sin rama de millones).
- `fmtNomMXN` en nomina.jsx (`Math.round(*100)/100` previo — intencional).

**Plan:** (1) agregar al `window` export alias `fmtFecha:fmtDate` + mover `fmtNomMXN` tal cual. (2) Fase A (cero riesgo): borrar las defs locales IDÉNTICAS confiando en globales (verificar orden de `<script>`: app-shell carga antes). (3) Fase B (decisión de producto): elegir UNA semántica para `fmtMXNshort` con snapshot visual antes/después. (4) Conservar el redondeo de `fmtNomMXN`.
