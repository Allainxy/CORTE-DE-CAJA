# Changelog · K-BOTANAS Control de Caja

Todos los cambios relevantes del sistema quedan documentados aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) con secciones de **resumen ejecutivo** y **detalle técnico** por release.

El proyecto sigue [versionado semántico](https://semver.org/lang/es/) — `MAYOR.MENOR.PARCHE`:
- **MAYOR**: cambios que rompen compatibilidad
- **MENOR**: features nuevas compatibles hacia atrás
- **PARCHE**: solo correcciones de bugs

---

## [1.16.0] — 2026-05-24

### 📌 Resumen ejecutivo

Tres mejoras a Movimientos y dos módulos nuevos de análisis.

**Movimientos — orden por hora real y vista más clara.** La lista ahora se ordena por el momento exacto de ejecución (fecha + hora), no solo por fecha, así el último movimiento capturado siempre queda hasta arriba. Cada renglón muestra la hora, los movimientos se agrupan por día ("HOY", "AYER", fecha) y el más reciente lleva la etiqueta **ÚLTIMO**. Se corrigió el empalme visual entre las columnas CAJA y USUARIO y los botones de acción quedan alineados a la derecha.

**Arranque más rápido.** Se cambió React a su build de producción y la librería de Excel (~900 KB) ya no se carga en cada arranque, sino solo al momento de exportar. El ingreso a la app se siente más ágil.

**Usuarios — error corregido.** La pantalla de Usuarios fallaba con "KBotAPI.listUsers is not a function" porque al cliente le faltaban los métodos de gestión de usuarios, aunque el backend sí tenía los endpoints. Se agregaron a `api.js`.

**Nuevo módulo: Resumen por día.** Vista de corte diario que agrupa los movimientos por día y, dentro de cada día, por categoría (ventas en total, cada nómina por concepto, etc.), con ingresos/egresos, subtotal por día y totales generales. Reemplaza el seguimiento manual en Excel. Incluye exportación a Excel.

**Nuevo módulo: Reporte Financiero (flujo de efectivo).** Estado de flujo de efectivo por semana, mes o año con columnas semanales, al estilo de la hoja de Excel: Ingresos − Costo de venta = Utilidad bruta − Gastos = Flujo operativo, más una sección informativa de transferencias entre cajas que no afecta el flujo. Las categorías se clasifican en las secciones mediante un panel de arrastrar (drag & drop) y, dentro de cada sección, se agrupan por el grupo contable del sistema (colapsable). La clasificación se guarda **global** en el servidor, compartida por todos los usuarios.

### ✨ Added

#### Módulo Resumen por día (`daily-view.jsx`)

- Nueva vista (`active === 'diario'`) accesible desde el menú lateral con ícono de calendario.
- Agrupa movimientos por día → categoría, con columnas INGRESOS / EGRESOS, subtotal por día y banda de totales del rango.
- Filtro de fechas DESDE/HASTA; respeta el filtro de caja global.
- Exportación a Excel (formato MES / SEMANA / FECHA / CONCEPTO / INGRESOS / EGRESOS con subtotales).

#### Módulo Reporte Financiero (`finrep-view.jsx`)

- Nueva vista (`active === 'finrep'`) accesible desde el menú lateral.
- Periodos seleccionables: Semana / Mes / Año, con columnas semanales (o mensuales en vista anual).
- Modo **Rango** con selector de fechas (calendario DESDE / HASTA): filtra el reporte por un rango libre y genera columnas semanales que cubren el periodo (o una sola columna TOTAL si el rango supera 14 semanas).
- Cuatro secciones: Ingresos, Costo de venta, Gastos, Transferencias/Otros. Filas derivadas Utilidad Bruta y Flujo Operativo.
- Clasificación categoría→sección por drag & drop; dentro de cada sección las categorías se anidan por grupo contable (`group_id`) con subtotal por grupo y grupos colapsables.
- Transferencias detectadas por `transfer_id` se ubican automáticamente en la sección informativa.
- Exportación a Excel con la jerarquía completa (sección → grupo → categoría → subtotales).

#### Configuración global clave-valor (`app_settings`)

- Nueva tabla `app_settings (key, value, updated_at, updated_by)` con migración idempotente.
- Endpoints `GET /api/settings/:key` (cualquier usuario autenticado) y `PUT /api/settings/:key` (solo admin/gerente).
- Usado por el Reporte Financiero para guardar la clasificación de categorías (clave `finrep_classification`), compartida por todos los usuarios y dispositivos.
- Métodos `getSetting` / `setSetting` añadidos a `api.js`.

#### Gestión de usuarios en el cliente (`api.js`)

- Se agregaron los métodos `listUsers`, `createUser`, `updateUser`, `deleteUser`, `resetPassword`, `generatePin`, `setUserCajas`, que consumen los endpoints `/api/users` ya existentes en el backend.

#### Sincronización entre usuarios — botón Actualizar + auto-sync

- Antes los cambios de un usuario no los veía otro hasta recargar la página (el sync solo corría una vez al cargar). Ahora hay un botón **"↻ ACTUALIZAR"** en la barra superior que trae al instante los últimos cambios del servidor y muestra **"✓ ACTUALIZADO"** al terminar, y un **auto-sync incremental cada 30 segundos** (ligero, usa el cursor `since`) que también se dispara al volver a enfocar la pestaña. El auto-sync se **pausa mientras hay un formulario/modal abierto** (Capturar, Transferencia, Editar) para no estorbar la captura. Así los cambios entre usuarios se propagan solos sin recargar.

#### Menú lateral — scroll para alcanzar todas las opciones

- El menú lateral tenía `overflow: hidden`, por lo que al crecer la lista de opciones (Reporte Financiero, Categorías, Usuarios, Backup, etc.) las de abajo quedaban cortadas e inalcanzables. Ahora el área de navegación tiene scroll vertical con una barra delgada y discreta, y se puede bajar a todas las opciones.

#### Service worker — versiones viejas se quedaban pegadas (PWA)

- El service worker se registraba siempre con la misma URL (`sw.js?v=2026-05-12g`) y el mismo nombre de cache (`kbot-v2`), por lo que el navegador nunca detectaba un SW nuevo: las máquinas se quedaban corriendo una build vieja indefinidamente (el botón Actualizar y el auto-sync no servían porque el código era anterior a ellos). Ahora el cache lleva versión con fecha (`kbot-2026-05-24k`) y el registro del SW se versiona junto con cada deploy, de modo que al activarse limpia los caches viejos y carga la versión nueva. Esto evita tener que limpiar el cache máquina por máquina.

#### Comprobación de viáticos sumaba de más al saldo (doble ajuste)

- Al comprobar un viático, el sistema borraba el movimiento del anticipo (devolviendo su monto completo a la caja) **y además** creaba un movimiento de devolución (sobrante) o faltante. Ese doble ajuste sumaba/restaba de más al saldo. Ejemplo: anticipo $500, comprobado $350 en casetas → la caja terminaba con +$150 de más. Ahora, al borrarse el anticipo completo, el gasto comprobado es el único que mueve la caja (neto correcto = −costo real), y ya no se crean los movimientos de devolución/faltante. La diferencia se sigue calculando y mostrando en el registro del viático, solo deja de generar un movimiento que descuadraba.

#### Gastos de ruta volvían a afectar el saldo de caja

- **Causa principal (frontend):** el cálculo del saldo de caja en el cliente (`computeSaldoCaja` en `app-shell.jsx` y la función equivalente en `app.jsx`) **no respetaba el flag `afecta_saldo`** — restaba todos los gastos, incluidos los de ruta marcados con `afecta_saldo = 0`. Por eso el saldo se veía descontado en pantalla aunque el servidor (que sí respeta el flag en `calcularSaldoCaja`) lo calculaba bien. Se corrigieron ambas funciones del frontend para ignorar los movimientos con `afecta_saldo = 0`, igual que el backend.
- **Refuerzo (backend):** el backfill que corregía registros existentes solo corría una vez (al crear la columna). Se agregó una **auto-corrección idempotente en cada arranque** que marca a 0 cualquier gasto de ruta (`src='venta-detalle'`) que haya quedado con el flag distinto de 0, como red de seguridad.

### 🐛 Fixed

#### Pantalla de Usuarios — "KBotAPI.listUsers is not a function"

- `users-view.jsx` invocaba métodos de `KBotAPI` que no existían en `api.js` (commit previo incompleto). Se agregaron los siete métodos faltantes. El backend ya exponía los endpoints correspondientes.

#### Transferencias entre cajas y gestión de cajas — métodos faltantes en `api.js`

- Mismo patrón que el de Usuarios: la transferencia entre cajas fallaba con "KBotAPI.transferir is not a function", y la creación/edición/archivado/borrado de cajas habrían fallado igual. El backend tenía los endpoints (`/api/transferencia`, `/api/cajas`) pero al cliente le faltaban los métodos. Se agregaron a `api.js`: `transferir`, `syncCaja`, `updateCaja`, `archivarCaja`, `deleteCaja`. Se hizo además un cruce completo de todas las llamadas `KBotAPI.*` del frontend contra los métodos definidos para descartar otros huecos.

#### Orden de la lista de Movimientos

- Antes ordenaba solo por `m.fecha` (fecha sin hora), por lo que los movimientos del mismo día quedaban en orden arbitrario y el último capturado no aparecía arriba. Ahora ordena por el timestamp real de ejecución (`created_at` → hora embebida en el id manual → `updated_at` → fecha como respaldo).

#### Empalme visual CAJA / USUARIO en Movimientos

- La rejilla de la tabla definía 7 columnas pero cada fila tenía 8 celdas (faltaba la de acciones), provocando que el badge de CAJA se desbordara sobre USUARIO y que los botones de acción se envolvieran. Se definió una rejilla de 8 columnas en escritorio y se contuvo el badge. El layout móvil no cambia.

#### Categorías sin grupo no aparecían en Categorías y Presupuestos

- **Causa real:** algunos módulos (Nómina, Ventas, Viáticos) registran movimientos con un nombre de categoría pero solo crean el registro en la tabla `cats` cuando encuentran el grupo destino. Si el grupo no existía en ese momento, la categoría quedaba **sin ningún registro en `cats`** — visible en Movimientos y en el Reporte Financiero (que lee el nombre desde `movs`) pero ausente de la pantalla de Categorías (que lee la tabla `cats`).
- **Fix backend (backfill idempotente):** al arrancar, el servidor crea en `cats` un registro por cada `(tipo, categoría)` que aparezca en `movs` y no exista en `cats`, con `group_id = NULL`. El frontend los recibe en el siguiente sync.
- **Fix frontend:** además, las categorías cuyo `group_id` apunta a un grupo inexistente, borrado o de otro tipo ahora se muestran en el bloque **"⚠️ SIN GRUPO ASIGNADO"** (resaltado), desde donde se les asigna grupo con el botón de editar. Antes el render solo recorría los grupos activos más el bucket de `group_id` nulo, por lo que estas categorías quedaban invisibles.

### 🔧 Changed

#### `movs-list.jsx`

- Columna "FECHA" renombrada a "FECHA/HORA"; muestra la hora bajo la fecha.
- Separadores por día y etiqueta ÚLTIMO en el movimiento más reciente; encabezado de tabla pegajoso (sticky).
- La exportación a Excel carga la librería SheetJS bajo demanda en lugar de en el arranque.

#### `index.html`

- React cambiado de build de desarrollo a producción (con SRI verificado).
- Se eliminó la carga eager de `xlsx.full.min.js` (~900 KB) en el arranque.

#### Resumen por día y Reporte Financiero — movimientos que no afectan el saldo

- Los movimientos marcados como "no afecta saldo" (`afecta_saldo = 0`) —gastos que el vendedor ya descontó del efectivo entregado— ya no se suman a los totales ni subtotales de ambos módulos (antes se contaban doble). Ahora se muestran en un bloque informativo aparte: en Resumen por día, una sección "ⓘ NO AFECTA SALDO" dentro de cada día; en Reporte Financiero, una sección informativa "NO AFECTA SALDO" que no toca el Flujo Operativo. Mismo criterio que la lista de Movimientos.

#### `sync-frontend-files.sh`

- El script de sincronización ahora despliega todos los archivos de frontend desde una sola lista (incluye `api.js`, `daily-view.jsx`, `finrep-view.jsx`, `app.jsx`, `app-shell.jsx`) y verifica marcas actualizadas.

---

## [1.15.2] — 2026-05-19

### 📌 Resumen ejecutivo

**Fix crítico de saldos:** los gastos y gasolina capturados en los cortes de ruta ya no descuentan dos veces de la Caja Principal. Antes del fix, cuando un vendedor entregaba el efectivo de su ruta (que ya venía neto de gastos), el sistema registraba el INGRESO por el efectivo entregado **y además** un GASTO contra la misma caja por el monto que el vendedor había usado en ruta — descontando el mismo dinero dos veces.

**Ejemplo (caso real, RUTA 2 del 18/05):** venta sistema $4,580.54 · efectivo entregado $4,308.50 · gastos de ruta $272. Saldo que aplicaba a Caja Principal hasta esta versión: $4,036.50 (mal, doble descuento). Saldo correcto post-fix: $4,308.50.

**Para qué sirve:** los saldos de Caja Principal vuelven a corresponder con el efectivo físico que realmente hay en caja. Los gastos de ruta siguen apareciendo en Movimientos y reportes (para trazabilidad y análisis de gasto por categoría), pero llevan un badge **"no afecta saldo"** y no impactan el balance.

**Backfill retroactivo:** la migración corrige automáticamente todos los movimientos históricos. No se requiere acción manual; al primer arranque del servidor con esta versión, se ejecuta un `UPDATE movs SET afecta_saldo = 0 WHERE src = 'venta-detalle' AND tipo = 'GASTO'` y el log reporta cuántos movs se ajustaron.

### 🐛 Fixed

#### Bug F6 — Doble descuento de gastos/gasolina en Caja Principal

**Síntoma:** el saldo de Caja Principal en `/api/cajas` y en el dashboard ejecutivo aparecía por debajo de lo que el efectivo físico mostraba. La diferencia acumulada equivalía a la suma de gastos y gasolina capturados en cortes de ruta a lo largo del tiempo.

**Causa raíz:** el endpoint `POST /api/ventas/cortes/detalle` (`backend/server.js`) insertaba movimientos de tipo GASTO contra `caja = caja_efectivo_id` por los importes de gastos/gasolina. La función `calcularSaldoCaja()` los restaba del saldo. Pero ese dinero **nunca entró a la caja física**: el vendedor ya lo había gastado en ruta antes de entregar el efectivo neto. El INGRESO registrado ya era neto, y restar el GASTO encima descontaba el mismo dinero por segunda vez.

**Fix:** introducción del flag `afecta_saldo INTEGER DEFAULT 1` en la tabla `movs`. Los movimientos de gastos/gasolina provenientes de cortes de ruta se insertan con `afecta_saldo = 0`. `calcularSaldoCaja()` y `saldosCajas` del dashboard ahora filtran `COALESCE(afecta_saldo, 1) = 1`, excluyendo estos registros del balance sin perderlos para trazabilidad.

### ✨ Added

#### Columna `afecta_saldo` en tabla `movs`

- **Schema:** `afecta_saldo INTEGER DEFAULT 1` (NOT NULL implícito vía DEFAULT, retrocompatible con `COALESCE`).
- **Semántica:**
  - `1` (default) — comportamiento normal: el movimiento mueve el saldo de su caja.
  - `0` — registro informativo: aparece en Movimientos y reportes por categoría, pero no afecta el balance de la caja.
- **Migración idempotente:** `ALTER TABLE movs ADD COLUMN afecta_saldo INTEGER DEFAULT 1` ejecutado solo si la columna no existe.
- **Backfill retroactivo:** la primera vez que la migración corre, ejecuta `UPDATE movs SET afecta_saldo = 0 WHERE src = 'venta-detalle' AND tipo = 'GASTO' AND deleted = 0` para corregir el histórico. El log de arranque reporta el conteo de movs corregidos.

#### Badge "no afecta saldo" en lista de Movimientos

- En `movs-list.jsx`, las filas con `afecta_saldo = 0` muestran un badge color índigo (`#E0E7FF` / `#3730A3`) con tooltip explicativo. Facilita auditoría visual.

#### Columna `afecta_saldo` en exportaciones

- El endpoint `GET /api/export` (CSV y XLSX) incluye la columna `afecta_saldo` para que los reportes externos puedan distinguir movimientos contables de los que mueven caja.

### 🔧 Changed

#### Endpoint `POST /api/ventas/cortes/detalle`

- Las inserciones de movs de GASTOS y GASOLINA ahora incluyen `afecta_saldo = 0` en los `INSERT INTO movs (...)`. La inserción de EFECTIVO (INGRESO) sigue con `afecta_saldo = 1` (default).
- Comentario de cabecera del endpoint actualizado a v1.15.2.

#### Frontend — `ventas-view.jsx`

- Label del selector de caja: de *"Caja efectivo (entradas + gastos + gasolina)"* a *"Caja efectivo (solo entradas)"*.
- Hint de la tabla: ahora explica que solo EFECTIVO mueve la caja; GASTOS y GASOLINA quedan registrados pero no afectan saldo porque ya estaban descontados del efectivo entregado.

### ⚠️ Pendientes / deuda técnica reconocida

- **Dashboard `/api/inteligencia/dashboard` — neto operacional subestimado:** el cálculo de `neto = ingresos - gastos` (líneas ~3777) usa `sumMovs` sobre INGRESOS y GASTOS de toda la tabla `movs`. Como el INGRESO registrado por los cortes ya está neto de gastos de ruta, y el GASTO sigue contando para el P&L (correctamente, son gasto real del negocio), el "neto" del dashboard queda subestimado por el monto de gastos de ruta. Este sesgo ya existía antes del fix; corregirlo requiere que el cálculo de ingresos del dashboard use la tabla `ventas` y `ventas_detalle_cortes.venta_sistema` en lugar de `movs.tipo='INGRESO'`. **Programado para un sprint futuro de reportes ejecutivos.**
- **Otros endpoints que crean movs (compras, nómina, viáticos, transferencias, etc.):** no fueron tocados en este patch. Si en el futuro se identifica algún otro caso de "gasto que no debe mover caja" (por ejemplo, gastos ya provisionados que pasan por CxP), la columna `afecta_saldo` ya está disponible para usarse.

### 🚀 Deploy notes

1. Pull del código en el droplet, `pm2 restart kbotanas-erp` (o equivalente).
2. **Validar en log de arranque** que aparezca: `🔧 Migración v1.15.2: columna afecta_saldo agregada a movs (N movimientos históricos corregidos retroactivamente)`. El número N debe ser positivo si había cortes registrados con gastos/gasolina.
3. Verificar saldo de Caja Principal en `/api/cajas` antes y después — debería subir por el monto acumulado de gastos+gasolina de todos los cortes históricos.
4. Spot-check en `/movimientos`: los movs de gastos de ruta deben mostrar el badge **"no afecta saldo"**.
5. Crear un corte de prueba con gastos > 0 y verificar que el saldo de la caja sube SOLO por el monto de efectivo, no se descuenta el gasto.

---

## [1.15.1] — 2026-05-12

### 📌 Resumen ejecutivo

Visibilidad extendida en **Corte del día**: la tabla ahora muestra al final los totales de **DETALLE / MAYOREO / DULCERÍA / MAQUILA** del mismo día y un **GRAN TOTAL** que suma rutas + ventas adicionales.

**Para qué sirve:** antes solo se veían los totales por ruta. Ahora se ve en una sola pantalla cuánto entró TODO el día (efectivo, transferencia, total facturado), sin importar el canal de venta.

### ✨ Added

#### Módulo Ventas — Totales Adicionales por Canal (F5)

- **Nuevo endpoint** `GET /api/ventas/totales-dia?fecha=YYYY-MM-DD`
  - Devuelve totales agrupados por canal (DETALLE/MAYOREO/DULCERIA/MAQUILA)
  - Cada canal con: `count`, `venta_sistema`, `efectivo`, `transferencia`
  - Incluye `gran_total` consolidado de los 4 canales
  - Método de pago se determina por `movs.metodo` (vinculado a la venta vía `ventas.mov_id`):
    - Caja tipo EFECTIVO → contabiliza como efectivo
    - Caja tipo BANCO/TARJETA → contabiliza como transferencia
    - Sin `mov_id` (raro): asume EFECTIVO por defecto
  - Solo cuenta ventas con `deleted=0` (respeta soft-delete + cascade de B2)

- **UI extendida en `DetalleExcelPanel`** (ventas-view.jsx):
  - Tras el `<tfoot>` con TOTALES por ruta, se renderizan 6 filas nuevas:
    - 1 banner amarillo: `💵 VENTAS ADICIONALES DEL DÍA — informativo, no editable`
    - 4 filas (una por canal): `+ DETALLE · N ventas`, `+ MAYOREO · N ventas`, etc.
    - 1 fila verde fuerte: `🟢 GRAN TOTAL DEL DÍA (rutas + ventas adicionales)`
  - Las filas son no-editables (fondo amarillo claro, texto itálico)
  - Auto-refresh cuando se guarda/elimina cualquier fila del corte

### 🐛 Fixed

#### Bug F5.1 — Orden de rutas en Express

**Síntoma:** el endpoint `GET /api/ventas/totales-dia` retornaba 404 incluso después de desplegarse correctamente.

**Causa raíz:** Express resuelve rutas en orden de registro. El patcher F5 insertó `GET /api/ventas/totales-dia` en línea 3221, pero ya existía `GET /api/ventas/:id` en línea 3207. La ruta `:id` con su parámetro catch-all matcheaba primero la URL `/api/ventas/totales-dia` (interpretando `id='totales-dia'`), retornaba `{ error: 'no existe' }` con 404, y nunca llegaba al endpoint específico.

**Fix:** mover el bloque del endpoint a una posición ANTES de `GET /api/ventas/:id` en server.js. El marker `F5_ROUTE_ORDER_FIXED` deja constancia del cambio.

**Lección general:** en Express, **siempre registrar rutas específicas antes que rutas con parámetros**. Patrón aplicable a futuros endpoints:

```js
// CORRECTO
app.get('/api/ventas/totales-dia', ...);  // específica primero
app.get('/api/ventas/:id', ...);           // catch-all después

// INCORRECTO (causa este bug)
app.get('/api/ventas/:id', ...);          // catch-all atrapa todo
app.get('/api/ventas/totales-dia', ...);  // nunca se llega aquí
```

### ⚠️ Notas operacionales (incidente del 12 may 2026 ~22:00)

Durante el despliegue de F5 se identificó un riesgo de configuración pm2 que es importante documentar:

**Lo que pasó:** al diagnosticar el bug F5.1, se intentó `pm2 delete corte-kbomx + pm2 start /opt/corte-kbomx/backend/server.js` desde un directorio temporal. Esto perdió las **variables de entorno** del proceso original (`PORT` y `DB_FILE`) y arrancó server.js con sus defaults internos, causando:

- Server.js intentó escuchar en su puerto default 3001 (en lugar del esperado 3401 que nginx redirige)
- Conflicto con otro proceso ya en 3001 → `EADDRINUSE`
- Algunas variantes intentaron conectar a la BD en path relativo (sin `DB_FILE`) → `no such table: cats` porque no encontraban `kbotanas.db`
- Resultado: caída completa de `corte.kbomx.com` por ~30 min mientras se diagnosticaba

**Configuración correcta** (para iniciar/reiniciar pm2 después de un reboot del VPS o crash):

```bash
pm2 delete corte-kbomx 2>/dev/null

cd /opt/corte-kbomx/backend && \
PORT=3401 \
DB_FILE=/opt/corte-kbomx/data/kbotanas.db \
NODE_ENV=production \
  pm2 start server.js \
    --name corte-kbomx \
    --cwd /opt/corte-kbomx/backend

pm2 save   # ← CRÍTICO: guarda env vars + cwd para que persistan entre reboots
```

**Puntos clave:**
- Puerto **3401** es el que nginx redirige (`location /api/ → proxy_pass http://127.0.0.1:3401`)
- Puerto **3000** está ocupado por Docker (`kbotanas-backend`, sistema diferente — NO tocar)
- Puerto **3001** queda con otros procesos pm2
- `DB_FILE` apunta a `/opt/corte-kbomx/data/kbotanas.db` (path absoluto)
- `pm2 save` es OBLIGATORIO para que las env vars sobrevivan a reinicios

**Para futuro:** se recomienda crear un `ecosystem.config.js` que documente estas variables formalmente y elimine el riesgo de errores manuales. Quedó como mejora pendiente.

### 📡 Endpoints nuevos

```
GET /api/ventas/totales-dia?fecha=YYYY-MM-DD
  → { fecha, por_canal: [{ canal, count, venta_sistema, efectivo, transferencia }], gran_total: {...} }
```

### 🛡️ Verificación

- ✅ SQL validado con tests funcionales en sql.js (5 escenarios: ventas activas, deleted, otras fechas, sin mov_id, agrupación por canal)
- ✅ `node --check` server.js OK
- ✅ Babel parser ventas-view.jsx OK
- ✅ Idempotente (markers: `F5_TOTALES_DIA`, `F5_ROUTE_ORDER_FIXED`, `F5_FRONTEND`)
- ✅ Compatibilidad: requiere F4 + F4.1 previamente desplegados
- ✅ Verificado visualmente en producción (banner + 4 canales + GRAN TOTAL aparecen correctamente)

---

## [1.15.0] — 2026-05-12

### 📌 Resumen ejecutivo

Release grande con foco en **módulo Nómina**, **órdenes de compra** y **control de cierres**.

**Lo que cambia para el usuario:**

- 🆕 **Nómina puede pagarse uno por uno** — ya no es necesario "Cerrar y pagar" a todos a la vez. Cada empleado tiene su botón 💰 individual. Las filas pagadas se ponen verdes (✅). Práctico para días donde unos cobran viernes y otros sábado.
- 🆕 **Cierre de día en Captura por Vendedor** — botón "🔒 Cerrar día" bloquea todos los inputs del día hasta que admin/gerente reabra con PIN. Evita cambios accidentales en cortes ya validados.
- 🆕 **Comisiones Mensuales** — nuevo tab en Nómina para captura mensual de bonos/comisiones de vendedores ruta. Al cerrar el mes genera un GASTO automático.
- 🆕 **Sync empleados a periodo abierto** — botón 🔄 que agrega empleados activos faltantes al periodo de nómina vigente.
- 🆕 **Comisionistas mayoreo 5%** — nueva columna en ventas + dropdown UI para asignar comisionistas a ventas MAYOREO sin escalonar.
- 🆕 **Cross-feed Mayoreo→Detalle** — las ventas MAYOREO/DULCERIA/MAQUILA aparecen como filas virtuales no-editables al final del corte detalle, con breakdown de comisiones para comisionistas (5%).
- 🆕 **Exports Excel + PDF de nómina** con formato exacto: 14 columnas, zebra amarillo, columna GARANTÍA azul, subtotales rojos por ruta, TOTAL GENERAL negro, header K-BOTANAS rojo con banda amarilla.
- 🆕 **TOTAL por fila en Órdenes de Compra** — el modal de "Nueva Orden de Compra" ahora muestra `cant × precio` en cada fila (vacío si cant=0). Ya no hay que calcular mental.
- 🐛 **Fix B2** — eliminar un movimiento desde el módulo Movimientos ahora cascadea correctamente a la venta vinculada. Antes se quedaban ventas huérfanas (`deleted=0` pero su mov `deleted=1`) que seguían apareciendo en TOTALES y Reportes.
- 🐛 **Print de PDF de órdenes** — ahora cada orden ocupa su propia página. Antes los encabezados de varias órdenes se traslapaban al imprimir/exportar.
- 🐛 **PDF de nómina** — abrevia rutas largas (`ADMINISTRACION` → `ADMIN`, `ENVASADO` → `ENVS`, etc.) para evitar cortes feos en el header.

**Lo que cambia para devs/admins:**
- Nueva tabla `nominas_periodos`, `nominas_pagos` (más campos), `comisiones_mensuales_periodos`, `comisiones_mensuales_pagos`
- 3 nuevos módulos backend: `nomina-extensions.js`, `nomina-pagos-individuales.js`, `ventas-cierres-dia.js`
- Helpers de exports: `nomina-exports-excel.js`, `nomina-exports-pdf.js`
- Tabla `ventas_cierres_dia` (ya existía en schema, ahora implementada)
- Columna `ventas.comisionista_empleado_id` (TEXT, FK opcional)
- Columnas `nominas_pagos.pagado` / `pagado_at` / `pagado_por`
- `DELETE /api/movs/:id` ahora cascadea a `ventas` y `ventas_detalle_cortes` (6 columnas mov_*_id)
- 19 endpoints nuevos relacionados con nómina, comisiones mensuales y cierres de día

---

### ✨ Added (nuevo)

#### Módulo Nómina

- **Pagos individuales** (`F1`)
  - Schema: `nominas_pagos.pagado INTEGER DEFAULT 0`, `pagado_at INTEGER`, `pagado_por TEXT`
  - Endpoints: `POST /api/nomina/pagos/:id/pagar`, `POST .../desmarcar-pagado`
  - UI: botón 💰 (naranja, pendiente) / ✅ (verde, pagado) en cada fila
  - Estilo visual: fila verde claro cuando `pagado=1`, botón 🗑 deshabilitado para pagos marcados
  - Cierre global respeta los ya pagados (no re-paga, suma al total final)
  - Cascade automático de abonos a préstamos al pagar (no se revierten al desmarcar — warning explícito)

- **Comisiones Mensuales** (`T4`)
  - Sub-tab "📅 Comisiones Mensuales" en NominaView
  - Solo aplica a empleados con `tipo=VENDEDOR` y `departamento=VENTAS`
  - Tablas: `comisiones_mensuales_periodos`, `comisiones_mensuales_pagos`
  - Endpoints: `GET /api/comisiones-mensuales/periodos`, `POST .../periodos`, `GET .../periodos/:id`, `PATCH .../pagos/:id`, `POST .../periodos/:id/cerrar`
  - Captura manual de % aplicado, bono base, comisiones manuales, observaciones por vendedor
  - Al cerrar genera mov GASTO automático en la caja seleccionada

- **Cross-feed Mayoreo → Detalle** (`T1`)
  - Las ventas MAYOREO/DULCERIA/MAQUILA aparecen como filas virtuales al final del corte detalle
  - No editables, decoración visual (gris itálica)
  - Breakdown automático de comisión 5% si tienen `comisionista_empleado_id` asignado
  - NO suman a la comisión escalonada del vendedor

- **Comisionistas mayoreo 5%** (`T3`)
  - Nueva columna `ventas.comisionista_empleado_id TEXT` (FK opcional a empleados)
  - Dropdown UI en ventas mayoreo para asignar
  - Cálculo de comisión 5% sin escalonar (no usa la tabla de % por monto)

- **Sync empleados a periodo abierto** (`T2`)
  - Botón 🔄 "Sync empleados" en NominaView (solo periodo ABIERTO)
  - Endpoint: `POST /api/nomina/periodos/:id/sync-empleados`
  - Agrega filas de pago para empleados activos que faltaban (no toca los existentes)

- **Exports Excel + PDF formato K-BOTANAS** (`T5`)
  - Endpoint: `GET /api/nomina/periodos/:id/export.xlsx`
  - Endpoint: `GET /api/nomina/periodos/:id/export.pdf`
  - 14 columnas: RUTA, VENDEDOR, RANKING, FALTAS, VENTAS, COMISIÓN %, COMISIÓN TOTAL, SUELDO BASE, META, RANKING, DESC, TOTAL, GARANTÍA, FIRMA
  - Excel: zebra `#FFF2CC` (amarillo), GARANTÍA azul cielo `#5DADE2`, subtotales por ruta en rojo, TOTAL GENERAL en negro
  - PDF: LETTER landscape, header K-BOTANAS rojo con banda amarilla, mismo esquema de colores
  - Abreviaciones de departamentos (`ADMINISTRACION`→`ADMIN`, `ENVASADO`→`ENVS`, etc.) para evitar cortes

#### Módulo Ventas

- **Cierre de día con PIN** (`F4`)
  - Botón "🔒 Cerrar día" en tab "📅 Corte del día"
  - Tabla `ventas_cierres_dia` (estaba en schema, ahora implementada)
  - Endpoints: `GET /api/ventas/cierres-dia?fecha=YYYY-MM-DD`, `POST .../cerrar`, `POST .../reabrir`
  - Requiere admin/gerente + PIN (reusa middleware `requirePin`)
  - Cierre congela los inputs de la tabla + botón "+ Fila manual" + DELETE de filas
  - Banner rojo cuando cerrado: "🔒 DÍA CERRADO · por X · fecha · comentario"
  - Reapertura requiere motivo obligatorio (auditado)
  - Defensa en profundidad: `POST/DELETE /api/ventas/cortes/detalle*` rechazan con `423 Locked` si día cerrado

#### Módulo Compras

- **Columna TOTAL por fila** (`F2`)
  - En modal "Nueva Orden de Compra" / "Editar Orden"
  - Posición: entre CATEGORÍA y ✕
  - Muestra `fmtMXN(cant × precio)` en negrita monoespaciada
  - Vacío cuando `cant = 0` (consistente con `opacity:0.55` de filas sin cantidad)

### 🐛 Fixed (corregido)

#### Bug B2 — Ventas/Cortes huérfanos al eliminar movimientos

**Síntoma:** una venta MAYOREO de $3,000 seguía apareciendo en TOTALES (semana/mes/año) y en Reportes después de "eliminarla". El movimiento sí se borraba pero la venta no.

**Causa raíz:** `DELETE /api/movs/:id` no cascadeaba a las tablas que referencian `mov_id`. El usuario había eliminado el movimiento directamente desde el módulo Movimientos (no la venta), dejándola huérfana (`deleted=0` aunque su mov estaba `deleted=1`). Los endpoints de TOTALES filtran `deleted=0`, así que la venta seguía sumando.

**Fix:**
- SQL one-off: limpia ventas huérfanas existentes (`UPDATE ventas SET deleted=1 WHERE ... INNER JOIN movs WHERE mov.deleted=1`)
- SQL one-off: limpia cortes detalle huérfanos (considera las 6 columnas `mov_*_id` reales: `mov_efectivo_id`, `mov_transferencia_id`, `mov_credito_id`, `mov_gastos_id`, `mov_devoluciones_id`, `mov_gasolina_id`)
- Backend: `DELETE /api/movs/:id` ahora ejecuta dentro de una transaction que:
  1. Soft-deletea el mov
  2. Busca ventas con `mov_id = ?` → cascade soft-delete
  3. Busca cortes con cualquiera de sus 6 `mov_*_id` apuntando al mov:
     - Si el corte tiene solo este mov → soft-delete del corte
     - Si tiene otros movs vivos → solo limpia esa referencia (`SET mov_X_id = NULL`)
  4. Audit log queda con `cascade-delete` o `cascade-clear-ref`

**Verificación final:** prueba en producción confirmó audit entry `cascade-delete · ventas · v-1778619892257-1336 · cascadeo desde mov m-venta-1778619892257-7633 (MAYOREO · 100)`.

#### Bug B1 — `comisionista_empleado_id` con tipo incorrecto

**Síntoma:** los JOINs entre ventas y empleados a través de `comisionista_empleado_id` no matcheaban.

**Causa:** la columna se creó como `INTEGER` pero `empleados.id` es `TEXT` (formato `emp-base-2`).

**Fix:** migración SQL que crea columna nueva TEXT, copia valores con CAST, drop la vieja, rename.

#### Bug B3 — Rutas largas cortadas en PDF de nómina

**Síntoma:** `ADMINISTRACION` aparecía como `ADMINIS-TRACIO`, `ENVASADO` como `ENVASA-DO`.

**Fix:** mapa de abreviaciones de departamentos (`ADMIN`, `ALMA`, `DULC`, `ENVS`, `GOMI`, `CACA`, `CHOC`, `PROD`, `MAQ`, `VTAS`). Códigos `R-XX` de vendedores se mantienen intactos.

#### Bug F3 — Print/PDF de órdenes de compra con traslape

**Síntoma:** al exportar PDF de varias órdenes de compra, los encabezados de diferentes órdenes se traslapaban visualmente en lugar de quedar en páginas separadas.

**Causa raíz:** el CSS `@media print` original tenía 3 problemas combinados:
1. `body * { visibility: hidden }` oculta pero NO remueve del flujo
2. `position: absolute` en `#pdf-content` rompe `page-break-after` (spec CSS)
3. Falta `page-break-inside: avoid` permitía partir órdenes a la mitad

**Fix definitivo (F3.2):** la función `imprimir()` mueve `#pdf-content` al body directamente antes de `window.print()` (con clase `kbomx-print-active`), y lo restaura con `afterprint` event. CSS simple: `body.kbomx-print-active > *:not(#pdf-content) { display: none }`.

#### Bug F4.1 — Banner de cierre no se actualizaba después del POST

**Síntoma:** tras cerrar el día con éxito, el botón seguía diciendo "🔒 Cerrar día" en lugar de cambiar a "🔓 Reabrir día". Usuario terminaba pulsándolo varias veces.

**Causa:** el handler hacía `await cargarCierre()` después del POST exitoso. Si ese GET fallaba, el `catch` silencioso (`{ /* silencioso */ }`) dejaba `cierreInfo` con `cerrado: false`.

**Fix:** usar la respuesta directa del POST (que ya trae el objeto `cierre`) para actualizar el estado inmediatamente. `cargarCierre()` pasa a background con `console.error` visible.

#### Bugs varios (proceso de descubrimiento durante el desarrollo)

Durante la implementación del módulo nómina (FIX 001-006 → consolidados en v1.15.0) se descubrieron y corrigieron los siguientes problemas del schema/auth:

- `cats.grupo` no existe → es `tipo` (INGRESO/GASTO)
- `cats.activo` no existe → es `deleted` (inverso)
- IDs son TEXT no INTEGER → `parseInt(req.params.id)` rompía endpoints nómina
- better-sqlite3 es síncrono — se creó wrapper de detección
- Tabla mayoreo no se llama `ventas_mayoreo` sino `ventas` con `canal='MAYOREO'`
- `movs.categoria` guarda NOMBRE (no ID) — INSERT INTO movs requiere lookup
- Estado en MAYÚSCULAS `'ABIERTO'` no `'abierto'`
- `window.apiFetch` NO existe globalmente — el patrón canónico es `window.KBotAPI.token()`
- `function showToast` con hoisting se vuelve `window.showToast` → recursión infinita (fix: renombrar a `_cmtToast`)

### 🔧 Changed (modificado)

- `DELETE /api/movs/:id` ahora opera dentro de transaction con cascade (`CASCADE_MOV_V2`)
- `POST /api/nomina/periodos/:id/cerrar` ahora respeta `pagado=1` (skip pagos ya pagados individualmente, suma sus totales al total del periodo)
- `POST /api/ventas/cortes/detalle` y `DELETE .../detalle/:id` rechazan con `423 Locked` si el día está cerrado
- PDF de nómina: `mapPagoToRow` usa nueva función `rutaCorta()` que aplica abreviaciones

### 🗄️ Schema cambios

```sql
-- B1: tipo de columna
ALTER TABLE ventas ADD COLUMN comisionista_empleado_id TEXT;  -- (era INTEGER)

-- F1: tracking de pagos individuales
ALTER TABLE nominas_pagos ADD COLUMN pagado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nominas_pagos ADD COLUMN pagado_at INTEGER;
ALTER TABLE nominas_pagos ADD COLUMN pagado_por TEXT;

-- F4: tabla ya existía en schema, ahora se usa
-- ventas_cierres_dia (no requirió migración)

-- T4: comisiones mensuales (nuevas)
CREATE TABLE comisiones_mensuales_periodos (...);
CREATE TABLE comisiones_mensuales_pagos (...);
```

### 📡 Endpoints nuevos

```
Nómina (módulo nomina-extensions.js):
  POST /api/nomina/periodos/:id/sync-empleados
  POST /api/nomina/periodos/:id/recalcular
  GET  /api/nomina/periodos/:id/export.xlsx
  GET  /api/nomina/periodos/:id/export.pdf
  ... (más, total 10 endpoints T2 + T3 + T4 + T5)

Pagos individuales (módulo nomina-pagos-individuales.js):
  POST /api/nomina/pagos/:id/pagar
  POST /api/nomina/pagos/:id/desmarcar-pagado

Comisiones Mensuales (parte de nomina-extensions.js):
  GET  /api/comisiones-mensuales/periodos
  POST /api/comisiones-mensuales/periodos
  GET  /api/comisiones-mensuales/periodos/:id
  PATCH /api/comisiones-mensuales/pagos/:id
  POST /api/comisiones-mensuales/periodos/:id/cerrar

Cierres de día (módulo ventas-cierres-dia.js):
  GET  /api/ventas/cierres-dia?fecha=YYYY-MM-DD
  POST /api/ventas/cierres-dia/cerrar
  POST /api/ventas/cierres-dia/reabrir
```

### 📦 Archivos nuevos en backend

- `/opt/corte-kbomx/backend/nomina-extensions.js`
- `/opt/corte-kbomx/backend/nomina-exports-excel.js`
- `/opt/corte-kbomx/backend/nomina-exports-pdf.js`
- `/opt/corte-kbomx/backend/nomina-pagos-individuales.js`
- `/opt/corte-kbomx/backend/ventas-cierres-dia.js`

### 📦 Archivos nuevos en frontend

- `/var/www/corte.kbomx.com/comisiones-mensuales-tab.jsx`

### 🚀 Despliegues parciales (cronología del 2026-05-12)

Esta release v1.15.0 consolida todo lo desplegado durante el día 12 de mayo. La cronología real de releases incrementales fue:

1. **04:47** — Inicio sesión 1 · Plan de 5 tareas T1-T5
2. **07:12** — Sesión 2 · `mejoras-nomina-v1.zip` + `ventas-crossfeed-v1.zip` (T1-T5 implementadas)
3. **07:12-09:00** — 6 hotfixes incrementales (FIX-001 a FIX-006) descubriendo el schema real
4. **09:00** — Auditoría holística → `mejoras-nomina-v2.zip` (consolidación + B1 + B3 + B5)
5. **14:00** — `mejoras-nomina-v2.1-fix-b2.zip` (cascade ventas)
6. **15:00** — `f1-pagos-individuales.zip`
7. **16:00** — `f2-compras-total-fila.zip`
8. **16:30** — `f3-print-pdf-fix.zip` → `f3.1-print-fix.zip` → **`f3.2-print-fix.zip`** (versión final)
9. **17:00** — `f4-cierre-dia-ventas.zip` → **`f4.1-hotfix.zip`** (versión final)
10. **20:00** — `mejoras-nomina-v2.2-fix-cortes.zip` → **`mejoras-nomina-v2.2-consolidated.zip`** (versión final que cerró B2)

### 🛡️ Verificación post-deploy

- ✅ Babel parser confirma JSX válido en todos los archivos modificados
- ✅ `node --check` confirma JS válido en backend
- ✅ Idempotencia de todos los patches (markers + backups timestamped)
- ✅ Auto-rollback automático si el backend falla parse post-patch
- ✅ Bug B2 verificado en producción: audit entry `cascade-delete · ventas · v-1778619892257-1336 · cascadeo desde mov m-venta-1778619892257-7633 (MAYOREO · 100) · 21:06:22`

---

## [1.14.2] — versión base previa al 2026-05-12

Estado del sistema antes del trabajo del 12 de mayo. No documentado en este formato — referirse a `git log` o backups previos a `/opt/corte-kbomx/backups/v2-20260512-072448/` si se requieren detalles.

---

[1.15.0]: https://corte.kbomx.com/changelog#1.15.0
[1.14.2]: https://corte.kbomx.com/changelog#1.14.2
