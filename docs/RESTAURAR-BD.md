# Restaurar la base de datos completa

> Implementación: `backend/lib/restore.js` (lógica), rutas en `backend/server.js`
> (`/api/backup/restore-full/inspect`, `/api/backup/restore-full`, `/api/backup/restore-status`),
> CLI `backend/scripts/restore-db.js`, cliente en `api.js` / `app.jsx` / `db.js` / `backup-view.jsx`.
> Tests: `backend/test/restore.test.js` (librería + CLI) y `backend/test/restore-e2e.test.js`
> (servidor real: capturar → respaldar → restaurar → reiniciar → verificar).

## Por qué no era seguro antes

La ruta vieja copiaba el archivo subido encima de `kbotanas.db` **con la conexión abierta en modo
WAL** y el `-wal` viejo al lado: SQLite lo reaplica sobre el archivo nuevo (corrupción silenciosa).
El respaldo de seguridad era un `copyFileSync` que omitía lo que aún vivía en el WAL. Nunca llegó a
funcionar (fallaba antes por `users.deleted`, columna inexistente) y quedó deshabilitada en 1.17.0.

## Garantías del diseño actual

1. **La BD viva solo cambia por un `rename` atómico** de un archivo ya preparado y verificado.
   Nada escribe en ella después del rename. Si algo falla antes, la original queda intacta.
2. **Archivo preparado ("staged") autocontenido**, en `data/restore-staging/` (0700/0600):
   - **Solo tablas e índices "planos"**, verificado leyendo solo el esquema y ANTES de
     `integrity_check`: se rechazan triggers, vistas, tablas virtuales, columnas generadas e índices
     parciales o de expresión; y claves foráneas (p. ej. `ON DELETE CASCADE`: better-sqlite3 activa
     `foreign_keys`), `CHECK` o `UNIQUE` que la misma tabla de la BD viva no tenga.
   - `integrity_check` (sin evaluar `CHECK`), tablas mínimas (`users`, `movs`, `cats`) y columnas de `users`.
   - **Epoch nuevo dentro del archivo** (`app_settings.db_epoch` + `db_epoch_at`): viaja con el rename.
   - **Se conservan de la BD actual** `users`, `user_cajas` y `audit_log`: restaurar no revive
     accesos dados de baja ni contraseñas viejas, no bloquea al admin, y la bitácora no retrocede.
3. **Arranque en seco**: `node server.js` con `KBOT_MIGRATE_ONLY=1` sobre una copia (migraciones +
   mounts, sale antes de `listen`), y el esquema resultante debe contener todas las tablas, columnas
   y **llaves (PK/UNIQUE)** de la BD viva: las rutas hacen `ON CONFLICT(id)`, así que una tabla sin su
   PK rompería todas las escrituras. 17 tablas de producción (ventas, nómina, viáticos…) no las crea
   ninguna migración: un respaldo anterior a esos módulos se rechaza en vez de dejar pantallas rotas.
4. **Aplicación** (`applyRestore`), con la API en 503 para todo lo demás:
   respaldo de seguridad con `db.backup()` (incluye el WAL) en `backups/auto/kbotanas-PRE-RESTORE-*.db`
   → `wal_checkpoint(TRUNCATE)` debe completarse (si otro proceso lee: 409, no se toca nada)
   → marker `data/.restore-state.json` {pending, expectedEpoch, safety} → `db.close()`
   → si quedan `-wal/-shm/-journal` (otro proceso con la BD abierta): 409, sin swap, reinicio
   → `rename(staged → kbotanas.db)` → respuesta → `process.exit(0)` (pm2 reinicia).
5. **Arranque** (`bootGuard`, antes de abrir la BD): `pending` + epoch del archivo = esperado →
   `booting`; epoch distinto → `aborted` (el swap no ocurrió). `booting` al arrancar otra vez
   (el arranque con la BD restaurada se cayó, < 5 min) → **vuelve solo al respaldo de seguridad**
   borrando antes `-wal/-shm/-journal`. `finishBoot` (en `listen`) retira el marker primero y registra
   `RESTORE_FULL_APPLIED` / `ROLLED_BACK` / `ABORTED`… en `audit_log` y en `data/.restore-last.json`
   (lo muestra la pantalla de Restaurar). Un `pm2 stop/reload` (SIGINT/SIGTERM) durante ese arranque
   no cuenta como fallo: el marker vuelve a `pending` y el siguiente arranque lo retoma.
6. `db_epoch`/`db_epoch_at` son claves reservadas: `PUT /api/settings/:key` las rechaza (403).

## Clientes (dispositivos con copia local)

- `GET /api/epoch` → `{epoch, epoch_at}`. `api.js` lo verifica **en cada sincronización** (dentro de
  `flushQueue`, una sola a la vez por pestaña, haya cola o no) y **no envía la cola sin epoch
  confirmado** (un 404 = servidor sin soporte de epoch, p. ej. tras revertir un deploy: se envía como antes).
- Todas las llamadas a `/api/` llevan `X-DB-Epoch` con el epoch de los datos que **esa pestaña** tiene
  en memoria (no el de `localStorage`, que comparten las pestañas). El servidor responde
  **409 `DB_EPOCH_STALE`** a escrituras con otro epoch, y **503** a las que llegan sin header después
  de una restauración (la versión anterior de la app reintenta los 5xx; los 4xx los descartaba).
- Si otra pestaña reconstruye, esta se recarga (evento `storage`). Un navegador nuevo sin datos
  adopta el epoch sin reconstruir ni mostrar aviso.
- Al detectar una restauración: la cola hecha con la copia vieja pasa a **revisión**
  (`kbot_queue_review`, visible con aviso y botones Reenviar / Descartar), se vacía IndexedDB,
  `kbot_since = 0` y la app recarga con los datos del servidor. Idempotente (`kbot_reset_pending`).
- Bump de `?v=` y del `CACHE` de `sw.js`: las pestañas abiertas se recargan solas con el código nuevo.

## Operación

- **Desde la app** (admin): Respaldos → Restaurar BD → elegir `.db` (máx. 18 MB: nginx corta en 25 MB
  y viaja en base64) → **Analizar** (vista previa respaldo vs. actual, válida 15 min) → RESTAURAR +
  contraseña. El respaldo de seguridad aparece en "Respaldos automáticos".
- **Por SSH** (servidor detenido):
  ```
  pm2 stop corte-kbomx
  node /opt/corte-kbomx/backend/scripts/restore-db.js --db /opt/corte-kbomx/data/kbotanas.db --from <respaldo.db>
  pm2 start corte-kbomx
  ```
  Nunca restaurar con `cp`: con el proceso vivo o un `-wal/-journal` viejo al lado, SQLite los reaplica.
  Sin `--yes` pide escribir RESTAURAR (y exige terminal). Un marker terminal de un intento anterior se aparta.
- **Rollback de un deploy** (lo imprime `deploy.sh`): 1) BD, solo si hace falta, con el código actual;
  2) código + frontend con `git reset --hard <antes>` y `deploy.sh --sync-only` (desde una copia del
  script). Si la versión revertida ya agregó columnas, la restauración se niega por esquema:
  primero `git reset`, luego `restore-db.js … --allow-schema-diff` (avisa en vez de rechazar).
- **Deshacer una restauración**: restaurar el `kbotanas-PRE-RESTORE-*.db` correspondiente (misma vía).
- `POST /api/backup/restore-table/:name` queda deshabilitado (no cambiaba el epoch y podía borrarlo).
- **Límite conocido**: la contraseña de la restauración confirma la operación, pero no protege de una
  sesión de admin robada (esa sesión puede cambiar su propia contraseña sin conocer la actual). La
  mitigación es el respaldo PRE-RESTORE automático y la bitácora conservada.

## Crítica del diseño

Se sometió a revisión independiente desde 4 ángulos (WAL/atomicidad, fallos/recuperación, clientes,
seguridad) con verificación adversarial de cada hallazgo: 33 confirmados, 4 refutados. Los
confirmados están incorporados arriba, con dos matices: recalcular en el servidor el `saldo_sistema`
del arqueo (CLIENTES-6) y mostrar diferencias de usuarios en la vista previa (CLIENTES-7) no se
implementaron tal cual porque quedan cubiertos por el 409 de escrituras con epoch viejo y por
conservar `users` de la BD actual, respectivamente.

Después, la implementación pasó una revisión adversarial desde 5 ángulos (backend, cliente,
seguridad, regresiones, despliegue): 29 hallazgos confirmados, 4 refutados, todos de severidad media
o baja. Quedan corregidos (validación de FK/CHECK/UNIQUE y llaves, claves de epoch reservadas, 503
para clientes viejos, epoch por pestaña, rollback con `--sync-only` y `--allow-schema-diff`, entre
otros) salvo el límite de sesión robada documentado arriba.
