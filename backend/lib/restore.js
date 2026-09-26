// ============================================================================
// lib/restore.js — Restauración segura de la base de datos completa.
//
// Principio: la BD viva SOLO cambia por un rename atómico de un archivo ya
// preparado y verificado (epoch nuevo adentro, tablas de acceso/bitácora
// conservadas, arranque en seco OK, esquema completo). Nada escribe en la BD
// después del rename. Si algo falla antes, la original queda intacta; si el
// arranque con la BD restaurada falla, bootGuard vuelve al respaldo de
// seguridad. Diseño y crítica: docs/RESTAURAR-BD.md
//
// Lo usan: server.js (rutas /api/backup/restore-full*, arranque) y
// scripts/restore-db.js (restauración por SSH con el servidor detenido).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

// nginx corta el cuerpo en 25 MB y el archivo viaja en base64 dentro de JSON (+33%)
const MAX_BYTES = 18 * 1024 * 1024;
const MIN_BYTES = 1024;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
const REQUIRED_TABLES = ['users', 'movs', 'cats'];
const USERS_REQUIRED_COLS = ['id', 'username', 'password', 'rol'];
// Se toman de la BD ACTUAL, no del respaldo: usuarios/contraseñas/roles vigentes
// (restaurar no revive accesos dados de baja ni bloquea al admin) y una bitácora
// que nunca retrocede.
const PRESERVED_TABLES = ['users', 'user_cajas', 'audit_log'];
const SIDECARS = ['-wal', '-shm', '-journal'];
// pm2 reinicia un arranque caído en segundos; un marker 'booting' más viejo que
// esto no es un arranque fallido reciente y NO dispara rollback automático.
const BOOT_ROLLBACK_WINDOW_MS = 5 * 60 * 1000;
// Por debajo del proxy_read_timeout de 60 s de nginx
const DRY_RUN_TIMEOUT_MS = 30 * 1000;
const MIGRATE_ONLY_OK = 'KBOT_MIGRATE_ONLY_OK';
const APP_SETTINGS_DDL = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
)`;

class RestoreError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'RestoreError';
    this.status = status;
    Object.assign(this, extra);
  }
}

// ---------- rutas y utilidades de archivo ----------
function paths(dbFile) {
  const dataDir = path.dirname(path.resolve(dbFile));
  return {
    dataDir,
    stagingDir: path.join(dataDir, 'restore-staging'),
    markerPath: path.join(dataDir, '.restore-state.json'),
    lastPath: path.join(dataDir, '.restore-last.json'),
  };
}

const newRestoreId = () => Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
const qi = (name) => '"' + String(name).replace(/"/g, '""') + '"';

function existingSidecars(file) { return SIDECARS.filter(s => fs.existsSync(file + s)); }
function removeSidecars(file) { for (const s of SIDECARS) fs.rmSync(file + s, { force: true }); }
function removeWithSidecars(file) {
  if (!file) return;
  fs.rmSync(file, { force: true });
  removeSidecars(file);
}

function fsyncFile(file) {
  const fd = fs.openSync(file, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function fsyncDir(dir) {
  if (process.platform === 'win32') return; // Windows no permite fsync de directorios
  let fd;
  try { fd = fs.openSync(dir, 'r'); fs.fsyncSync(fd); } catch (_) { /* best effort */ } finally { if (fd !== undefined) fs.closeSync(fd); }
}

// Escritura atómica y durable (tmp + fsync + rename + fsync del directorio)
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fsyncFile(tmp);
  fs.renameSync(tmp, file);
  fsyncDir(path.dirname(file));
}

function readMarker(markerPath) {
  if (!fs.existsSync(markerPath)) return { exists: false };
  try { return { exists: true, marker: JSON.parse(fs.readFileSync(markerPath, 'utf8')) }; }
  catch (e) { return { exists: true, error: e }; }
}

// ---------- inspección de una BD ----------
function hasTable(db, t) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
}
function tableColumns(db, t) {
  return db.prepare(`PRAGMA table_info(${qi(t)})`).all().map(c => c.name);
}
function schemaOf(db) {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    out[name] = tableColumns(db, name);
  }
  return out;
}
function readEpoch(db) {
  try {
    const rows = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('db_epoch', 'db_epoch_at')").all();
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const at = Number(m.db_epoch_at);
    return { epoch: m.db_epoch || null, at: Number.isFinite(at) && at > 0 ? at : null };
  } catch (_) {
    return { epoch: null, at: null };
  }
}
function readEpochFromFile(file) {
  const d = new Database(file, { fileMustExist: true });
  try { return readEpoch(d); } finally { d.close(); }
}

// Cláusulas CHECK(...) de un CREATE TABLE (paréntesis balanceados), normalizadas: sin espacios
// y en minúsculas FUERA de comillas (dentro de un literal el texto sí importa)
function checkClauses(sql) {
  const out = [];
  const re = /\bCHECK\s*\(/gi;
  let m;
  while ((m = re.exec(sql || ''))) {
    let i = re.lastIndex, depth = 1, q = null, norm = 'check(';
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (q) { norm += ch; if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') q = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (!/\s/.test(ch)) norm += ch.toLowerCase();
    }
    out.push(norm);
    re.lastIndex = i;
  }
  return out;
}
const fkKey = (f) => [f.table, f.from, f.to, f.on_update, f.on_delete, f.match].join('|').toLowerCase();
function uniqueSets(db, t) {
  return db.prepare(`PRAGMA index_list(${qi(t)})`).all()
    .filter(i => i.unique && i.origin !== 'pk')
    .map(i => db.prepare(`PRAGMA index_info(${qi(i.name)})`).all().map(c => c.name).join(',').toLowerCase());
}

// Solo tablas e índices "planos". Un .db podría traer lógica escondida que se ejecute con las
// escrituras (triggers, vistas, tablas virtuales, columnas generadas) o que borre/bloquee datos
// (FK con ON DELETE CASCADE —better-sqlite3 activa foreign_keys—, CHECK, UNIQUE, índices
// parciales o de expresión). Con `liveDb`, esas restricciones solo se aceptan si la misma tabla
// de la BD viva ya las tiene. Solo lee sqlite_master/PRAGMA: no evalúa nada del archivo.
function assertSchemaSafe(db, liveDb) {
  const bad = db.prepare(`SELECT type, name FROM sqlite_master
    WHERE type NOT IN ('table', 'index')
       OR (type = 'table' AND (sql IS NULL OR sql NOT LIKE 'CREATE TABLE%'))`).all();
  if (bad.length) {
    throw new RestoreError('El respaldo contiene objetos no permitidos (' +
      bad.slice(0, 5).map(b => `${b.type} ${b.name}`).join(', ') + '). Solo se aceptan tablas e índices.');
  }
  const liveSql = (t) => liveDb && (liveDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) || {}).sql;
  for (const { name, sql } of db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all()) {
    const hidden = db.prepare(`PRAGMA table_xinfo(${qi(name)})`).all().filter(c => c.hidden);
    if (hidden.length) throw new RestoreError(`El respaldo contiene columnas generadas u ocultas en "${name}". No se acepta.`);
    for (const ix of db.prepare(`PRAGMA index_list(${qi(name)})`).all()) {
      const expr = db.prepare(`PRAGMA index_xinfo(${qi(ix.name)})`).all().some(c => c.key && c.cid === -2);
      if (ix.partial || expr) throw new RestoreError(`El respaldo contiene un índice parcial o de expresión ("${ix.name}"). No se acepta.`);
    }
    if (!liveDb) continue;
    const lsql = liveSql(name);
    const liveFks = lsql ? new Set(liveDb.prepare(`PRAGMA foreign_key_list(${qi(name)})`).all().map(fkKey)) : new Set();
    const extraFk = db.prepare(`PRAGMA foreign_key_list(${qi(name)})`).all().map(fkKey).filter(k => !liveFks.has(k));
    if (extraFk.length) throw new RestoreError(`El respaldo tiene claves foráneas que la base actual no tiene en "${name}" (${extraFk[0]}). No se acepta.`);
    const liveChecks = new Set(checkClauses(lsql));
    const extraCheck = checkClauses(sql).filter(c => !liveChecks.has(c));
    if (extraCheck.length) throw new RestoreError(`El respaldo tiene restricciones CHECK que la base actual no tiene en "${name}". No se acepta.`);
    const liveUniq = lsql ? new Set(uniqueSets(liveDb, name)) : new Set();
    const extraUniq = uniqueSets(db, name).filter(u => !liveUniq.has(u));
    if (extraUniq.length) throw new RestoreError(`El respaldo tiene restricciones UNIQUE que la base actual no tiene en "${name}" (${extraUniq[0]}). No se acepta.`);
  }
}

// Llaves por tabla: PK y conjuntos UNIQUE. Las rutas hacen UPSERT con ON CONFLICT(id)/(key):
// una tabla sin su PK (p. ej. recreada con CREATE TABLE AS) rompería todas las escrituras.
function keysOf(db) {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    const pk = db.prepare(`PRAGMA table_info(${qi(name)})`).all().filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name.toLowerCase());
    out[name] = [...(pk.length ? ['pk:' + pk.join(',')] : []), ...uniqueSets(db, name).map(u => 'u:' + u)];
  }
  return out;
}

function statsOf(db) {
  const out = { movs: null, ultimo_mov: null, ultima_modificacion: null, cajas: null, usuarios: null };
  const one = (sql) => db.prepare(sql).get();
  if (hasTable(db, 'movs')) {
    const cols = tableColumns(db, 'movs');
    const vivo = cols.includes('deleted') ? ' WHERE deleted = 0' : '';
    out.movs = one(`SELECT COUNT(*) AS n FROM movs${vivo}`).n;
    if (cols.includes('fecha')) out.ultimo_mov = one(`SELECT MAX(fecha) AS f FROM movs${vivo}`).f || null;
    if (cols.includes('updated_at')) {
      const u = one('SELECT MAX(updated_at) AS u FROM movs').u;
      out.ultima_modificacion = u ? Number(u) : null;
    }
  }
  if (hasTable(db, 'cajas')) {
    out.cajas = one(`SELECT COUNT(*) AS n FROM cajas${tableColumns(db, 'cajas').includes('deleted') ? ' WHERE deleted = 0' : ''}`).n;
  }
  if (hasTable(db, 'users')) out.usuarios = one('SELECT COUNT(*) AS n FROM users').n;
  return out;
}

function writeEpoch(db, epoch, epochAt, by) {
  db.exec(APP_SETTINGS_DDL);
  const up = db.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
  db.transaction(() => {
    up.run('db_epoch', epoch, epochAt, by || 'restore');
    up.run('db_epoch_at', String(epochAt), epochAt, by || 'restore');
  })();
}

// Reemplaza en `target` las PRESERVED_TABLES por las de `live` (esquema, índices y filas).
function preserveTables(target, live) {
  if (!live) return [];
  const done = [];
  target.transaction(() => {
    for (const t of PRESERVED_TABLES) {
      const def = live.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      if (!def || !def.sql) continue;
      const indexes = live.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(t);
      target.exec(`DROP TABLE IF EXISTS ${qi(t)}`);
      target.exec(def.sql);
      for (const i of indexes) target.exec(i.sql);
      const cols = tableColumns(live, t);
      const colList = cols.map(qi).join(', ');
      const ins = target.prepare(`INSERT INTO ${qi(t)} (${colList}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const row of live.prepare(`SELECT ${colList} FROM ${qi(t)}`).raw().iterate()) ins.run(row);
      done.push(t);
    }
  })();
  return done;
}

function verifyFile(file) {
  const d = new Database(file, { fileMustExist: true });
  try {
    const r = d.pragma('quick_check', { simple: true });
    if (r !== 'ok') throw new RestoreError(`Verificación fallida de ${path.basename(file)}: ${r}`, 500);
  } finally { d.close(); }
}

// ---------- 1) Preparar el archivo subido ----------
// Valida, escribe el epoch nuevo y copia las tablas conservadas desde `liveDb`.
// El resultado (stagedPath) es autocontenido: sin -wal/-shm/-journal.
async function stageUpload(opts) {
  const { stagingDir, liveDb } = opts;
  const restoreId = opts.restoreId || newRestoreId();
  const maxBytes = opts.maxBytes || MAX_BYTES;
  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  const staged = path.join(stagingDir, `restore-${restoreId}-staged.db`);
  let db = null;
  try {
    if (opts.buffer) {
      const b = opts.buffer;
      if (b.length < MIN_BYTES) throw new RestoreError('Archivo demasiado pequeño: no parece una base de datos válida.');
      if (b.length > maxBytes) throw new RestoreError(`Archivo demasiado grande (máximo ${Math.round(maxBytes / 1048576)} MB).`, 413);
      if (!b.subarray(0, 16).equals(SQLITE_MAGIC)) throw new RestoreError('No es un archivo SQLite válido.');
      fs.writeFileSync(staged, b, { flag: 'wx', mode: 0o600 });
    } else if (opts.sourceFile) {
      // CLI: copiar el archivo (y su -wal si viene en par) sin tocar el original
      const src = opts.sourceFile;
      if (!fs.existsSync(src)) throw new RestoreError('No existe el archivo ' + src);
      const size = fs.statSync(src).size;
      if (size < MIN_BYTES) throw new RestoreError('Archivo demasiado pequeño: no parece una base de datos válida.');
      const head = Buffer.alloc(16);
      const fd = fs.openSync(src, 'r');
      try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
      if (!head.equals(SQLITE_MAGIC)) throw new RestoreError('No es un archivo SQLite válido.');
      fs.copyFileSync(src, staged, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(staged, 0o600);
      if (fs.existsSync(src + '-wal')) fs.copyFileSync(src + '-wal', staged + '-wal');
    } else {
      throw new RestoreError('Falta el archivo a restaurar.');
    }

    db = new Database(staged, { fileMustExist: true });
    // Primero la estructura (solo lee el esquema) y después la integridad, sin evaluar CHECK:
    // así un archivo hostil no puede congelar el servidor durante el análisis.
    assertSchemaSafe(db, liveDb);
    db.pragma('ignore_check_constraints = ON');
    const ic = db.pragma('integrity_check', { simple: true });
    if (ic !== 'ok') throw new RestoreError('El respaldo está dañado (integrity_check: ' + String(ic).slice(0, 200) + ').');
    for (const t of REQUIRED_TABLES) {
      if (!hasTable(db, t)) throw new RestoreError(`El respaldo no tiene la tabla "${t}": no parece una BD de este sistema.`);
    }
    const faltan = USERS_REQUIRED_COLS.filter(c => !tableColumns(db, 'users').includes(c));
    if (faltan.length) throw new RestoreError(`La tabla users del respaldo no tiene: ${faltan.join(', ')}.`);

    // El epoch nuevo viaja DENTRO del archivo: el rename lo coloca junto con los datos.
    db.pragma('journal_mode = WAL');
    const epoch = crypto.randomUUID();
    const epochAt = Date.now();
    writeEpoch(db, epoch, epochAt, opts.by);
    const preserved = preserveTables(db, liveDb);
    const stats = statsOf(db); // lo que quedará (usuarios ya conservados de la BD actual)
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
    const left = existingSidecars(staged);
    if (left.length) throw new RestoreError('No se pudo consolidar el archivo preparado (' + left.join(', ') + ').', 500);
    return { restoreId, stagedPath: staged, epoch, epochAt, stats, preserved };
  } catch (e) {
    if (db) { try { db.close(); } catch (_) { /* ignore */ } }
    removeWithSidecars(staged);
    if (e instanceof RestoreError) throw e;
    if (e && typeof e.code === 'string' && e.code.startsWith('SQLITE_')) {
      throw new RestoreError(`El archivo no es una base de datos SQLite válida o está dañado (${e.code}).`);
    }
    throw e;
  }
}

// ---------- 2) Arranque en seco ----------
// Corre `node server.js` sobre una COPIA del archivo preparado con
// KBOT_MIGRATE_ONLY=1: ejecuta migraciones y mounts y sale antes de listen.
// Devuelve el esquema resultante (para compararlo con el de la BD viva).
function dryRunBoot(opts) {
  const { stagedPath, serverScript, stagingDir, restoreId } = opts;
  const dry = path.join(stagingDir, `restore-${restoreId}-dryrun.db`);
  const backupDir = path.join(stagingDir, `restore-${restoreId}-dryrun-backups`);
  fs.copyFileSync(stagedPath, dry, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(dry, 0o600);
  const cleanup = () => {
    removeWithSidecars(dry);
    fs.rmSync(backupDir, { recursive: true, force: true });
  };
  const env = {
    ...process.env,
    DB_FILE: dry,
    BACKUP_DIR: backupDir,
    PORT: '0',
    JWT_SECRET: 'dry-run-' + crypto.randomBytes(16).toString('hex'), // sale antes de firmar nada
    KBOT_MIGRATE_ONLY: '1',
  };
  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    const cap = (d) => { if (out.length < 20000) out += d.toString(); };
    const child = spawn(process.execPath, [serverScript], { cwd: path.dirname(serverScript), env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs || DRY_RUN_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, reason: 'no se pudo lanzar el proceso: ' + e.message, out }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ ok: false, reason: 'tardó más de ' + Math.round((opts.timeoutMs || DRY_RUN_TIMEOUT_MS) / 1000) + ' s', out });
      if (code !== 0 || !out.includes(MIGRATE_ONLY_OK)) return resolve({ ok: false, reason: 'el servidor terminó con código ' + code, out });
      resolve({ ok: true, out });
    });
  }).then((res) => {
    try {
      if (!res.ok) {
        const tail = res.out.split('\n').filter(l => /error|fatal|sqlite/i.test(l)).slice(-5).join('\n') || res.out.slice(-800);
        throw new RestoreError('El respaldo no pasó la prueba de arranque (' + res.reason + ').', 422, { dryRunOutput: tail });
      }
      const d = new Database(dry, { fileMustExist: true });
      try { return { schema: schemaOf(d), keys: keysOf(d) }; } finally { d.close(); }
    } finally { cleanup(); }
  });
}

// Tablas/columnas que la BD viva tiene y el candidato (ya migrado) no:
// 17 tablas de producción (ventas, nómina, viáticos…) no las crea ninguna
// migración, así que un respaldo anterior a esos módulos dejaría pantallas rotas.
// Con `candidateKeys`/`liveKeys` (keysOf) también exige las mismas PK/UNIQUE de la BD viva.
function compareSchema(candidate, live, candidateKeys, liveKeys) {
  const missingTables = [];
  const missingColumns = [];
  const missingKeys = [];
  for (const [t, cols] of Object.entries(live)) {
    if (!candidate[t]) { missingTables.push(t); continue; }
    const falt = cols.filter(c => !candidate[t].includes(c));
    if (falt.length) missingColumns.push({ table: t, columns: falt });
    if (candidateKeys && liveKeys && liveKeys[t]) {
      const k = liveKeys[t].filter(x => !(candidateKeys[t] || []).includes(x));
      if (k.length) missingKeys.push({ table: t, keys: k });
    }
  }
  return { ok: !missingTables.length && !missingColumns.length && !missingKeys.length, missingTables, missingColumns, missingKeys };
}

function assertStagedReady(stagedPath, expectedEpoch) {
  if (!fs.existsSync(stagedPath)) throw new RestoreError('El archivo preparado ya no existe; vuelve a analizar el respaldo.', 410);
  const { epoch } = readEpochFromFile(stagedPath);
  if (!expectedEpoch || epoch !== expectedEpoch) throw new RestoreError('El archivo preparado no coincide con el analizado.', 409);
  const left = existingSidecars(stagedPath);
  if (left.length) throw new RestoreError('El archivo preparado no está consolidado (' + left.join(', ') + ').', 500);
}

// ---------- 3) Aplicar (en el proceso del servidor o en el CLI) ----------
// `db` es la conexión viva: se CIERRA aquí. Si el error trae mustExit=true, la
// conexión ya se cerró y el proceso debe reiniciar para reabrir la BD original.
async function applyRestore(o) {
  const { db, dbFile, stagedPath, expectedEpoch, safetyPath, markerPath } = o;
  const hooks = o.hooks || {};

  // 0) El staged sigue siendo el que se analizó
  assertStagedReady(stagedPath, expectedEpoch);

  // 1) Lo último de las tablas conservadas (incluye la entrada RESTORE_FULL_INIT)
  const s = new Database(stagedPath, { fileMustExist: true });
  try {
    preserveTables(s, db);
    s.pragma('wal_checkpoint(TRUNCATE)');
  } finally { s.close(); }
  if (existingSidecars(stagedPath).length) throw new RestoreError('El archivo preparado no quedó consolidado.', 500);

  // 2) Respaldo de seguridad consistente (incluye lo que vive en el WAL)
  try {
    await db.backup(safetyPath);
    fs.chmodSync(safetyPath, 0o600);
    verifyFile(safetyPath);

    // 3) ¿Otro proceso lee la BD ahora? (p. ej. el respaldo nocturno con sqlite3)
    if (hooks.beforeProbe) hooks.beforeProbe();
    const prevTimeout = db.pragma('busy_timeout', { simple: true });
    db.pragma('busy_timeout = 500');
    const ck = db.pragma('wal_checkpoint(TRUNCATE)')[0] || {};
    db.pragma(`busy_timeout = ${Number(prevTimeout) || 5000}`);
    if (ck.busy) throw new RestoreError('La base de datos está en uso por otro proceso (p. ej. el respaldo automático). No se restauró nada; intenta de nuevo en un minuto.', 409);

    // 4) Marker: el arranque sabrá qué epoch esperar y a qué respaldo volver
    writeJsonAtomic(markerPath, {
      state: 'pending', restoreId: o.restoreId || null, expectedEpoch,
      safety: safetyPath, by: o.by || null, ts: Date.now(),
    });
  } catch (e) {
    // No se tocó la BD: sin restauración no debe quedar un PRE-RESTORE ni un marker
    removeWithSidecars(safetyPath);
    try { fs.rmSync(markerPath, { force: true }); } catch (_) { /* ignore */ }
    throw e;
  }

  // --- La conexión se cierra: cualquier error de aquí en adelante obliga a reiniciar ---
  let renamed = false;
  try {
    db.close();
    const left = existingSidecars(dbFile);
    if (left.length) {
      throw new RestoreError(`Otro proceso mantiene abierta la base de datos (${left.join(', ')} siguen tras cerrar). No se restauró nada.`, 409);
    }
    if (hooks.beforeRename) hooks.beforeRename();
    try { fs.chmodSync(stagedPath, fs.statSync(dbFile).mode & 0o777); } catch (_) { /* conserva 0600 */ }
    if (existingSidecars(stagedPath).length || existingSidecars(dbFile).length) {
      throw new RestoreError('Aparecieron archivos -wal/-shm/-journal inesperados. No se restauró nada.', 409);
    }
    fs.renameSync(stagedPath, dbFile); // ← único punto de commit
    renamed = true;
    fsyncDir(path.dirname(dbFile));
    return { safetyPath, renamed };
  } catch (e) {
    if (!renamed) {
      // renameSync es atómico: si lanzó, la BD original sigue en su lugar
      try { fs.rmSync(markerPath, { force: true }); } catch (_) { /* bootGuard lo resolverá por epoch */ }
      removeWithSidecars(safetyPath);
    }
    e.mustExit = true;
    e.renamed = renamed;
    throw e;
  }
}

// ---------- 4) Arranque del servidor ----------
function rollbackToSafety(dbFile, safety) {
  if (!safety || !fs.existsSync(safety)) throw new Error('no existe el respaldo de seguridad ' + safety);
  verifyFile(safety);
  const tmp = dbFile + '.rollback-tmp';
  removeWithSidecars(tmp);
  fs.copyFileSync(safety, tmp);
  try { fs.chmodSync(tmp, fs.statSync(dbFile).mode & 0o777); } catch (_) { /* default */ }
  fsyncFile(tmp);
  removeSidecars(tmp);
  // -wal/-shm/-journal de la BD restaurada NO deben quedar junto al safety:
  // SQLite los reaplicaría encima y lo mutilaría sin que integrity_check lo note.
  removeSidecars(dbFile);
  if (existingSidecars(dbFile).length) throw new Error('no se pudieron borrar los -wal/-shm/-journal de ' + dbFile);
  fs.renameSync(tmp, dbFile);
  fsyncDir(path.dirname(dbFile));
}

function purgeStaging(stagingDir) {
  if (!fs.existsSync(stagingDir)) return;
  for (const f of fs.readdirSync(stagingDir)) fs.rmSync(path.join(stagingDir, f), { recursive: true, force: true });
}

// Al INICIO de server.js, antes de abrir la BD. Nunca lanza.
function bootGuard(opts) {
  const log = opts.log || console;
  if (process.env.KBOT_MIGRATE_ONLY === '1') return { action: 'skip' };
  const { markerPath, stagingDir } = paths(opts.dbFile);
  const now = opts.now || Date.now();
  try {
    try { purgeStaging(stagingDir); } catch (_) { /* restos de un intento previo */ }
    const r = readMarker(markerPath);
    if (!r.exists) return { action: 'none' };
    if (r.error) {
      const bad = markerPath + '.bad-' + now;
      try { fs.renameSync(markerPath, bad); } catch (_) { /* ignore */ }
      log.error('[restore] marker ilegible, se aparta a ' + bad + ':', r.error.message);
      return { action: 'bad-marker' };
    }
    const m = r.marker;
    if (m.state === 'pending') {
      let cur = null;
      try { cur = readEpochFromFile(opts.dbFile).epoch; } catch (_) { /* sin BD legible */ }
      if (cur && cur === m.expectedEpoch) {
        writeJsonAtomic(markerPath, { ...m, state: 'booting', bootingAt: now });
        log.log('[restore] arrancando con la BD restaurada ' + (m.restoreId || ''));
        return { action: 'booting' };
      }
      writeJsonAtomic(markerPath, { ...m, state: 'aborted', note: 'el archivo restaurado no llegó a colocarse; sigue la BD anterior' });
      log.error('[restore] la restauración ' + (m.restoreId || '') + ' no llegó a aplicarse; se conserva la BD anterior');
      return { action: 'aborted' };
    }
    if (m.state === 'booting') {
      if (now - (Number(m.bootingAt) || 0) > BOOT_ROLLBACK_WINDOW_MS) {
        writeJsonAtomic(markerPath, { ...m, state: 'stale', note: 'marker booting antiguo: no se revierte automáticamente' });
        log.error('[restore] FATAL: marker "booting" antiguo; NO se revierte. Revisar a mano. Respaldo de seguridad: ' + m.safety);
        return { action: 'stale' };
      }
      try {
        rollbackToSafety(opts.dbFile, m.safety);
        writeJsonAtomic(markerPath, { ...m, state: 'rolled_back', rolledBackAt: now });
        log.error('[restore] el arranque con la BD restaurada falló; se volvió al respaldo de seguridad ' + m.safety);
        return { action: 'rolled_back' };
      } catch (e) {
        try { writeJsonAtomic(markerPath, { ...m, state: 'rollback_failed', error: String(e && e.message) }); } catch (_) { /* ignore */ }
        log.error('[restore] FATAL: no se pudo volver al respaldo de seguridad ' + m.safety + ':', e && e.message);
        return { action: 'rollback_failed' };
      }
    }
    return { action: 'terminal', state: m.state };
  } catch (e) {
    log.error('[restore] bootGuard: error inesperado (se arranca sin cambios):', e && e.message);
    return { action: 'error' };
  }
}

// Si pm2 detiene/recarga el proceso (SIGINT/SIGTERM) mientras arranca con la BD restaurada,
// eso no es un arranque fallido: el marker vuelve a 'pending' (su epoch sigue coincidiendo) y el
// siguiente arranque lo retoma sin revertir. Un crash real no pasa por aquí y sí revierte.
function markerBackToPending(dbFile) {
  const { markerPath } = paths(dbFile);
  try {
    const r = readMarker(markerPath);
    if (r.exists && !r.error && r.marker.state === 'booting') {
      writeJsonAtomic(markerPath, { ...r.marker, state: 'pending', bootingAt: null });
      return true;
    }
  } catch (_) { /* best effort */ }
  return false;
}

const FINAL_ACTIONS = {
  rolled_back: 'RESTORE_FULL_ROLLED_BACK',
  aborted: 'RESTORE_FULL_ABORTED',
  rollback_failed: 'RESTORE_FULL_ROLLBACK_FAILED',
  stale: 'RESTORE_FULL_STALE_MARKER',
};

// En el callback de app.listen. Registra el resultado y retira el marker. Nunca lanza.
function finishBoot(opts) {
  const log = opts.log || console;
  if (process.env.KBOT_MIGRATE_ONLY === '1') return null;
  const { markerPath, lastPath } = paths(opts.dbFile);
  let m;
  try {
    const r = readMarker(markerPath);
    if (!r.exists || r.error) return null;
    m = r.marker;
  } catch (_) { return null; }
  let accion = FINAL_ACTIONS[m.state] || 'RESTORE_FULL_UNKNOWN';
  if (m.state === 'booting') {
    accion = readEpoch(opts.db).epoch === m.expectedEpoch ? 'RESTORE_FULL_APPLIED' : 'RESTORE_FULL_NOT_APPLIED';
  }
  const result = {
    accion, state: m.state, restoreId: m.restoreId || null, by: m.by || null,
    safety: m.safety ? path.basename(m.safety) : null, startedAt: m.ts || null,
    finishedAt: Date.now(), error: m.error || null, note: m.note || null,
  };
  // Primero el estado terminal: si el marker sobreviviera a un arranque exitoso,
  // un reinicio posterior podría revertir datos reales.
  try { writeJsonAtomic(lastPath, result); } catch (e) { log.error('[restore] no se pudo guardar el resultado:', e.message); }
  try { fs.rmSync(markerPath, { force: true }); } catch (e) { log.error('[restore] no se pudo retirar el marker:', e.message); }
  try {
    opts.db.prepare(`INSERT INTO audit_log (ts, user_id, user_nombre, rol, accion, entidad, entidad_id, detalle, pin_validado)
      VALUES (?, ?, ?, ?, ?, 'backup', ?, ?, 0)`).run(
      Date.now(), m.by?.id || null, m.by?.nombre || null, m.by?.rol || null, accion, m.restoreId || null,
      JSON.stringify({ safety: result.safety, state: m.state, error: result.error, note: result.note }));
  } catch (e) { log.error('[restore] no se pudo registrar en audit_log:', e.message); }
  log.log('[restore] ' + accion + (result.safety ? ' · respaldo de seguridad: ' + result.safety : ''));
  return result;
}

function restoreStatus(dbFile) {
  const { markerPath, lastPath } = paths(dbFile);
  let last = null;
  try { if (fs.existsSync(lastPath)) last = JSON.parse(fs.readFileSync(lastPath, 'utf8')); } catch (_) { /* ignore */ }
  return { inProgress: fs.existsSync(markerPath), last };
}

module.exports = {
  MAX_BYTES, PRESERVED_TABLES, BOOT_ROLLBACK_WINDOW_MS, MIGRATE_ONLY_OK, APP_SETTINGS_DDL,
  RestoreError, paths, newRestoreId, existingSidecars, removeWithSidecars, writeJsonAtomic, readMarker,
  schemaOf, keysOf, readEpoch, readEpochFromFile, statsOf, assertSchemaSafe, preserveTables,
  stageUpload, dryRunBoot, compareSchema, applyRestore, rollbackToSafety, purgeStaging,
  bootGuard, markerBackToPending, finishBoot, restoreStatus,
};
