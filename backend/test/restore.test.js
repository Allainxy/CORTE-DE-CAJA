// Tests de lib/restore.js (restauración segura de la BD completa) con archivos
// SQLite reales en un directorio temporal: WAL con escrituras sin checkpoint,
// lectores concurrentes, fallos a mitad del swap, arranque en seco de server.js
// y los estados del marker que resuelve bootGuard/finishBoot.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const R = require('../lib/restore');

const SERVER = path.join(__dirname, '..', 'server.js');
const INIT_DB = path.join(__dirname, '..', 'init-db.js');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kbot-restore-')); }
function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* Windows */ } }

// BD con el núcleo del esquema del sistema; `tag` marca las filas para distinguir orígenes
function makeDb(file, { tag = 'X', movs = 3, extraSql = '', wal = true } = {}) {
  const d = new Database(file);
  if (wal) d.pragma('journal_mode = WAL');
  d.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password TEXT, nombre TEXT, rol TEXT, activo INTEGER DEFAULT 1, created_at INTEGER);
    CREATE TABLE user_cajas (user_id TEXT, caja_id TEXT, PRIMARY KEY (user_id, caja_id));
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT, user_nombre TEXT, rol TEXT, accion TEXT, entidad TEXT, entidad_id TEXT, detalle TEXT, pin_validado INTEGER DEFAULT 0);
    CREATE INDEX idx_audit_ts ON audit_log(ts);
    CREATE TABLE movs (id TEXT PRIMARY KEY, fecha TEXT, tipo TEXT, categoria TEXT, monto REAL, caja TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0);
    CREATE TABLE cats (id TEXT PRIMARY KEY, tipo TEXT, nombre TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0);
    CREATE TABLE cajas (id TEXT PRIMARY KEY, nombre TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0);
    ${extraSql}`);
  const ins = d.prepare("INSERT INTO movs VALUES (?, ?, 'GASTO', 'LUZ', ?, 'caja-principal', ?, 0)");
  for (let i = 0; i < movs; i++) ins.run(`${tag}-${i}`, `2026-0${1 + (i % 9)}-15`, 10 + i, 1000 + i);
  d.prepare("INSERT INTO users (id, username, password, nombre, rol) VALUES (?, 'admin', ?, 'Admin', 'admin')").run('u-admin', 'hash-' + tag);
  d.prepare("INSERT INTO audit_log (ts, accion, entidad) VALUES (?, ?, 'test')").run(Date.now(), 'AUDIT-' + tag);
  return d;
}
function closedDbBuffer(file, opts) { makeDb(file, opts).close(); return fs.readFileSync(file); }
const count = (file, sql) => { const d = new Database(file, { fileMustExist: true }); try { return d.prepare(sql).get().n; } finally { d.close(); } };

async function expectRestoreError(p, re, status) {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof R.RestoreError, 'se esperaba RestoreError, llegó: ' + e);
    if (re) assert.match(e.message, re);
    if (status) assert.strictEqual(e.status, status);
    return true;
  });
}

test('stageUpload rechaza lo que no es una BD de este sistema y no deja restos', async () => {
  const dir = tmpdir();
  try {
    const stagingDir = path.join(dir, 'staging');
    await expectRestoreError(R.stageUpload({ buffer: Buffer.alloc(100), stagingDir }), /pequeño/);
    await expectRestoreError(R.stageUpload({ buffer: Buffer.alloc(5000, 1), stagingDir }), /SQLite válido/);
    const big = closedDbBuffer(path.join(dir, 'big.db'), { tag: 'B' });
    await expectRestoreError(R.stageUpload({ buffer: big, stagingDir, maxBytes: 2048 }), /grande/, 413);
    // Página dañada
    const good = closedDbBuffer(path.join(dir, 'c.db'), { tag: 'C', movs: 400, wal: false });
    const bad = Buffer.from(good);
    bad.fill(0xAB, 4096 * 2, 4096 * 2 + 3000);
    await expectRestoreError(R.stageUpload({ buffer: bad, stagingDir }), /dañad|válida/);
    // Sin tabla requerida / users sin columna password
    const f1 = path.join(dir, 'nocats.db');
    const d1 = makeDb(f1, { tag: 'N' }); d1.exec('DROP TABLE cats'); d1.close();
    await expectRestoreError(R.stageUpload({ buffer: fs.readFileSync(f1), stagingDir }), /tabla "cats"/);
    const f2 = path.join(dir, 'nopass.db');
    const d2 = makeDb(f2, { tag: 'P' }); d2.exec('ALTER TABLE users DROP COLUMN password'); d2.close();
    await expectRestoreError(R.stageUpload({ buffer: fs.readFileSync(f2), stagingDir }), /password/);
    assert.deepStrictEqual(fs.readdirSync(stagingDir), [], 'staging debe quedar vacío');
  } finally { rmrf(dir); }
});

test('stageUpload rechaza triggers, vistas, tablas virtuales y columnas generadas', async () => {
  const dir = tmpdir();
  try {
    const stagingDir = path.join(dir, 'staging');
    const variantes = {
      trigger: "CREATE TRIGGER t_bd AFTER INSERT ON movs BEGIN UPDATE users SET rol = 'admin'; END;",
      vista: 'CREATE VIEW v_movs AS SELECT * FROM movs;',
      virtual: 'CREATE VIRTUAL TABLE buscar USING fts5(texto);',
      generada: 'CREATE TABLE calc (a INTEGER, b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL);',
    };
    for (const [nombre, sql] of Object.entries(variantes)) {
      const buf = closedDbBuffer(path.join(dir, nombre + '.db'), { tag: nombre, extraSql: sql });
      await expectRestoreError(R.stageUpload({ buffer: buf, stagingDir }), /no permitidos|generadas/);
    }
    assert.deepStrictEqual(fs.readdirSync(stagingDir), []);
  } finally { rmrf(dir); }
});

test('stageUpload acepta un respaldo válido: epoch nuevo adentro, conserva users/user_cajas/audit_log de la BD viva y queda autocontenido', async () => {
  const dir = tmpdir();
  try {
    const live = makeDb(path.join(dir, 'live.db'), { tag: 'LIVE', movs: 5 });
    live.prepare("INSERT INTO users (id, username, password, nombre, rol) VALUES ('u-nuevo', 'nuevo', 'h', 'Nuevo', 'usuario')").run();
    live.prepare("INSERT INTO user_cajas VALUES ('u-nuevo', 'caja-2')").run();
    // El respaldo trae un admin inyectado y la contraseña vieja
    const upFile = path.join(dir, 'up.db');
    const up = makeDb(upFile, { tag: 'UP', movs: 3 });
    up.prepare("INSERT INTO users (id, username, password, nombre, rol) VALUES ('u-intruso', 'intruso', 'x', 'Intruso', 'admin')").run();
    up.close();

    const st = await R.stageUpload({ buffer: fs.readFileSync(upFile), stagingDir: path.join(dir, 'staging'), liveDb: live, by: 'Test' });
    assert.deepStrictEqual(R.existingSidecars(st.stagedPath), []);
    assert.deepStrictEqual(st.preserved, ['users', 'user_cajas', 'audit_log']);
    assert.strictEqual(st.stats.movs, 3);
    assert.strictEqual(st.stats.usuarios, 2); // estadística del respaldo tal como vino

    const s = new Database(st.stagedPath, { fileMustExist: true });
    try {
      assert.strictEqual(s.prepare('SELECT COUNT(*) n FROM movs').get().n, 3, 'los datos vienen del respaldo');
      assert.deepStrictEqual(s.prepare('SELECT id, password FROM users ORDER BY id').all(),
        [{ id: 'u-admin', password: 'hash-LIVE' }, { id: 'u-nuevo', password: 'h' }], 'usuarios = los de la BD viva');
      assert.strictEqual(s.prepare("SELECT COUNT(*) n FROM user_cajas WHERE user_id = 'u-nuevo'").get().n, 1);
      assert.deepStrictEqual(s.prepare('SELECT accion FROM audit_log').all().map(r => r.accion), ['AUDIT-LIVE']);
      assert.ok(s.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_audit_ts'").get());
      const ep = R.readEpoch(s);
      assert.strictEqual(ep.epoch, st.epoch);
      assert.strictEqual(ep.at, st.epochAt);
      assert.strictEqual(s.pragma('journal_mode', { simple: true }), 'wal');
    } finally { s.close(); }
    live.close();
  } finally { rmrf(dir); }
});

test('dryRunBoot arranca server.js sobre un respaldo antiguo (init-db) y compareSchema detecta lo que le falta; un respaldo que rompe migraciones se rechaza', async () => {
  const dir = tmpdir();
  try {
    const stagingDir = path.join(dir, 'staging');
    const old = path.join(dir, 'old.db');
    const r = spawnSync(process.execPath, [INIT_DB], { env: { ...process.env, DB_FILE: old }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const st = await R.stageUpload({ sourceFile: old, stagingDir });
    const { schema } = await R.dryRunBoot({ stagedPath: st.stagedPath, serverScript: SERVER, stagingDir, restoreId: st.restoreId });
    for (const t of ['app_settings', 'audit_log', 'cxp', 'ordenes_compra', 'movs']) assert.ok(schema[t], 'la migración creó ' + t);
    assert.ok(schema.movs.includes('afecta_saldo'));
    // Tabla/columna que existen en la BD viva y no en el candidato
    const live = { ...schema, ventas: ['id', 'fecha'], movs: [...schema.movs, 'columna_nueva'] };
    const diff = R.compareSchema(schema, live);
    assert.strictEqual(diff.ok, false);
    assert.deepStrictEqual(diff.missingTables, ['ventas']);
    assert.deepStrictEqual(diff.missingColumns, [{ table: 'movs', columns: ['columna_nueva'] }]);
    assert.strictEqual(R.compareSchema(schema, schema).ok, true);
    // El arranque en seco no deja la copia ni sus -wal/-shm
    assert.deepStrictEqual(fs.readdirSync(stagingDir).filter(f => f.includes('dryrun')), []);

    // movs sin sus columnas básicas: las migraciones de server.js fallan → 422
    const roto = path.join(dir, 'roto.db');
    const d = makeDb(roto, { tag: 'R', movs: 0 });
    d.exec('DROP TABLE movs; CREATE TABLE movs (id TEXT PRIMARY KEY);');
    d.close();
    const st2 = await R.stageUpload({ sourceFile: roto, stagingDir });
    await expectRestoreError(R.dryRunBoot({ stagedPath: st2.stagedPath, serverScript: SERVER, stagingDir, restoreId: st2.restoreId }), /prueba de arranque/, 422);
  } finally { rmrf(dir); }
});

test('assertSchemaSafe con la BD viva: rechaza FK/CHECK/UNIQUE que la viva no tiene e índices parciales o de expresión; acepta los mismos que la viva', async () => {
  const dir = tmpdir();
  try {
    const stagingDir = path.join(dir, 'staging');
    const CON = `CREATE TABLE ventas (id TEXT PRIMARY KEY, canal TEXT CHECK (canal IN ('RUTA', 'MOSTRADOR')), monto REAL);
      CREATE TABLE abonos (id TEXT PRIMARY KEY, venta_id TEXT REFERENCES ventas(id), codigo TEXT UNIQUE);`;
    const live = makeDb(path.join(dir, 'live.db'), { tag: 'LIVE', extraSql: CON });
    const casos = {
      'cascada nueva': `CREATE TABLE ventas (id TEXT PRIMARY KEY, canal TEXT CHECK (canal IN ('RUTA', 'MOSTRADOR')), monto REAL);
        CREATE TABLE abonos (id TEXT PRIMARY KEY, venta_id TEXT REFERENCES ventas(id) ON DELETE CASCADE, codigo TEXT UNIQUE);`,
      'fk en tabla que la viva no tiene': CON + 'CREATE TABLE nueva (id TEXT PRIMARY KEY, x TEXT REFERENCES movs(id) ON DELETE CASCADE);',
      'check extra': `CREATE TABLE ventas (id TEXT PRIMARY KEY, canal TEXT CHECK (canal IN ('RUTA', 'MOSTRADOR')), monto REAL CHECK (monto < 0));
        CREATE TABLE abonos (id TEXT PRIMARY KEY, venta_id TEXT REFERENCES ventas(id), codigo TEXT UNIQUE);`,
      'unique extra': CON + 'CREATE UNIQUE INDEX u_movs_monto ON movs(monto);',
      'indice parcial': CON + 'CREATE INDEX p_movs ON movs(fecha) WHERE deleted = 0;',
      'indice de expresion': CON + 'CREATE INDEX e_movs ON movs(lower(categoria));',
    };
    for (const [nombre, sql] of Object.entries(casos)) {
      const buf = closedDbBuffer(path.join(dir, nombre.replace(/\s/g, '_') + '.db'), { tag: 'X', extraSql: sql });
      await expectRestoreError(R.stageUpload({ buffer: buf, stagingDir, liveDb: live }), /no tiene|parcial o de expresión/);
    }
    // Las mismas restricciones que la viva (con otro espaciado/mayúsculas) sí pasan
    const igual = `CREATE TABLE ventas (id TEXT PRIMARY KEY, canal TEXT check(canal   IN ('RUTA', 'MOSTRADOR')), monto REAL);
      CREATE TABLE abonos (id TEXT PRIMARY KEY, venta_id TEXT REFERENCES ventas(id), codigo TEXT UNIQUE);`;
    const st = await R.stageUpload({ buffer: closedDbBuffer(path.join(dir, 'igual.db'), { tag: 'I', extraSql: igual }), stagingDir, liveDb: live });
    assert.ok(st.stagedPath);
    live.close();
  } finally { rmrf(dir); }
});

test('compareSchema exige las PK/UNIQUE de la BD viva (una tabla recreada con CREATE TABLE AS pierde su PK)', () => {
  const dir = tmpdir();
  try {
    const live = makeDb(path.join(dir, 'live.db'), { tag: 'L' });
    const cand = makeDb(path.join(dir, 'cand.db'), { tag: 'C' });
    cand.exec('CREATE TABLE movs2 AS SELECT * FROM movs; DROP TABLE movs; ALTER TABLE movs2 RENAME TO movs;');
    const diff = R.compareSchema(R.schemaOf(cand), R.schemaOf(live), R.keysOf(cand), R.keysOf(live));
    assert.strictEqual(diff.ok, false);
    assert.deepStrictEqual(diff.missingTables, []);
    assert.deepStrictEqual(diff.missingColumns, []);
    assert.deepStrictEqual(diff.missingKeys, [{ table: 'movs', keys: ['pk:id'] }]);
    assert.strictEqual(R.compareSchema(R.schemaOf(live), R.schemaOf(live), R.keysOf(live), R.keysOf(live)).ok, true);
    // epoch_at no numérico (p.ej. 'null') no cuenta como restauración
    live.exec(R.APP_SETTINGS_DDL);
    live.prepare("INSERT INTO app_settings VALUES ('db_epoch', 'e1', 1, 'x'), ('db_epoch_at', 'null', 1, 'x')").run();
    assert.deepStrictEqual(R.readEpoch(live), { epoch: 'e1', at: null });
    live.close(); cand.close();
  } finally { rmrf(dir); }
});

// Prepara BD viva (WAL con escrituras SIN checkpoint) + staged listo para aplicar
async function setupApply(dir) {
  const dbFile = path.join(dir, 'data', 'kbotanas.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const live = makeDb(dbFile, { tag: 'LIVE', movs: 0 });
  live.pragma('wal_autocheckpoint = 0');
  const ins = live.prepare("INSERT INTO movs VALUES (?, '2026-09-01', 'GASTO', 'LUZ', 1, 'caja-principal', 1, 0)");
  for (let i = 0; i < 50; i++) ins.run('LIVE-' + i);
  assert.ok(fs.statSync(dbFile + '-wal').size > 0, 'hay datos solo en el WAL');
  const buf = closedDbBuffer(path.join(dir, 'up.db'), { tag: 'RESTOR', movs: 3 });
  const p = R.paths(dbFile);
  const st = await R.stageUpload({ buffer: buf, stagingDir: p.stagingDir, liveDb: live });
  const safetyPath = path.join(dir, 'PRE-RESTORE.db');
  return { dbFile, live, st, p, safetyPath, args: { db: live, dbFile, stagedPath: st.stagedPath, expectedEpoch: st.epoch, safetyPath, markerPath: p.markerPath, restoreId: st.restoreId, by: { id: 'u-admin', nombre: 'Admin', rol: 'admin' } } };
}

test('applyRestore con la BD viva en WAL: el safety trae lo del WAL, la BD queda con el respaldo, sin sidecars viejos, epoch esperado y marker pending', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, live, st, p, safetyPath, args } = await setupApply(dir);
    const r = await R.applyRestore(args);
    assert.strictEqual(r.renamed, true);
    assert.strictEqual(live.open, false, 'la conexión viva se cerró');
    assert.strictEqual(fs.existsSync(st.stagedPath), false, 'el staged se movió a su lugar');
    assert.deepStrictEqual(R.existingSidecars(dbFile), []);
    assert.strictEqual(count(safetyPath, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'"), 50, 'el safety incluye lo que solo vivía en el WAL');
    assert.strictEqual(count(dbFile, 'SELECT COUNT(*) n FROM movs'), 3);
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'RESTOR-%'"), 3);
    assert.strictEqual(R.readEpochFromFile(dbFile).epoch, st.epoch);
    const m = R.readMarker(p.markerPath).marker;
    assert.strictEqual(m.state, 'pending');
    assert.strictEqual(m.expectedEpoch, st.epoch);
    assert.strictEqual(m.safety, safetyPath);
  } finally { rmrf(dir); }
});

test('applyRestore no toca nada si otro proceso está leyendo la BD (409) y la conexión sigue abierta', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, live, st, p, safetyPath, args } = await setupApply(dir);
    const reader = new Database(dbFile);
    reader.prepare('BEGIN').run();
    reader.prepare('SELECT COUNT(*) FROM movs').get(); // lector con snapshot sobre el WAL
    try {
      await expectRestoreError(R.applyRestore(args), /en uso/, 409);
    } finally { reader.prepare('COMMIT').run(); reader.close(); }
    assert.strictEqual(live.open, true);
    assert.strictEqual(live.prepare("SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'").get().n, 50);
    assert.strictEqual(fs.existsSync(p.markerPath), false);
    assert.strictEqual(fs.existsSync(safetyPath), false, 'sin restauración no queda PRE-RESTORE');
    assert.strictEqual(fs.existsSync(st.stagedPath), true, 'el staged sigue para reintentar');
    live.close();
  } finally { rmrf(dir); }
});

test('applyRestore: si el -wal sigue tras cerrar (otra conexión abierta) no hace el swap y pide reiniciar', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, st, p, safetyPath, args } = await setupApply(dir);
    // Otro proceso que ya usó la BD y quedó inactivo (sin transacción): no bloquea el
    // checkpoint, pero su lock compartido impide que el cierre borre el -wal.
    const other = new Database(dbFile);
    other.prepare('SELECT COUNT(*) FROM movs').get();
    try {
      await assert.rejects(R.applyRestore(args), (e) => {
        assert.strictEqual(e.mustExit, true);
        assert.strictEqual(e.renamed, false);
        assert.strictEqual(e.status, 409);
        return true;
      });
      assert.strictEqual(other.prepare("SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'").get().n, 50, 'la BD original sigue intacta');
    } finally { other.close(); }
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'"), 50);
    assert.strictEqual(fs.existsSync(p.markerPath), false);
    assert.strictEqual(fs.existsSync(safetyPath), false);
    assert.strictEqual(fs.existsSync(st.stagedPath), true);
  } finally { rmrf(dir); }
});

test('applyRestore: un fallo justo antes del rename deja la BD original completa', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, p, safetyPath, args } = await setupApply(dir);
    args.hooks = { beforeRename: () => { throw new Error('disco desconectado (simulado)'); } };
    await assert.rejects(R.applyRestore(args), (e) => e.mustExit === true && e.renamed === false);
    assert.deepStrictEqual(R.existingSidecars(dbFile), []);
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'"), 50, 'lo que vivía en el WAL quedó consolidado en la original');
    assert.strictEqual(fs.existsSync(p.markerPath), false);
    assert.strictEqual(fs.existsSync(safetyPath), false);
  } finally { rmrf(dir); }
});

test('bootGuard: pending→booting si el epoch coincide, aborted si no; booting reciente revierte al safety borrando sidecars; booting viejo no revierte; marker ilegible y modo dry-run no rompen', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, st, p, safetyPath, args } = await setupApply(dir);
    await R.applyRestore(args);
    const silent = { log() {}, error() {} };
    fs.mkdirSync(p.stagingDir, { recursive: true });
    fs.writeFileSync(path.join(p.stagingDir, 'restore-x-upload.db'), 'resto');

    // Modo arranque en seco: no hace nada
    process.env.KBOT_MIGRATE_ONLY = '1';
    try { assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'skip'); } finally { delete process.env.KBOT_MIGRATE_ONLY; }
    assert.strictEqual(R.readMarker(p.markerPath).marker.state, 'pending');

    // pending + epoch correcto → booting (y purga staging)
    const t0 = Date.now();
    assert.strictEqual(R.bootGuard({ dbFile, log: silent, now: t0 }).action, 'booting');
    assert.strictEqual(R.readMarker(p.markerPath).marker.bootingAt, t0);
    assert.deepStrictEqual(fs.readdirSync(p.stagingDir), []);

    // booting reciente (el arranque se cayó) → rollback; los sidecars de la BD caída no se reaplican
    fs.writeFileSync(dbFile + '-journal', Buffer.alloc(1024, 7));
    fs.writeFileSync(dbFile + '-wal', Buffer.alloc(1024, 7));
    assert.strictEqual(R.bootGuard({ dbFile, log: silent, now: t0 + 5000 }).action, 'rolled_back');
    assert.deepStrictEqual(R.existingSidecars(dbFile), []);
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'"), 50, 'volvió al respaldo de seguridad');
    assert.strictEqual(R.readMarker(p.markerPath).marker.state, 'rolled_back');
    assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'terminal');

    // Señal de pm2 durante un arranque 'booting' → vuelve a 'pending' (no es un fallo)
    R.writeJsonAtomic(p.markerPath, { state: 'booting', bootingAt: t0, safety: safetyPath, expectedEpoch: st.epoch });
    assert.strictEqual(R.markerBackToPending(dbFile), true);
    assert.strictEqual(R.readMarker(p.markerPath).marker.state, 'pending');
    assert.strictEqual(R.markerBackToPending(dbFile), false, 'solo desde booting');

    // booting viejo → no revierte
    R.writeJsonAtomic(p.markerPath, { state: 'booting', bootingAt: t0 - R.BOOT_ROLLBACK_WINDOW_MS - 1000, safety: safetyPath, expectedEpoch: st.epoch });
    assert.strictEqual(R.bootGuard({ dbFile, log: silent, now: t0 }).action, 'stale');
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id LIKE 'LIVE-%'"), 50);

    // booting sin safety → rollback_failed, sin lanzar
    R.writeJsonAtomic(p.markerPath, { state: 'booting', bootingAt: t0, safety: path.join(dir, 'no-existe.db') });
    assert.strictEqual(R.bootGuard({ dbFile, log: silent, now: t0 + 1000 }).action, 'rollback_failed');

    // pending cuyo archivo no llegó a colocarse → aborted
    R.writeJsonAtomic(p.markerPath, { state: 'pending', expectedEpoch: 'otro-epoch', safety: safetyPath });
    assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'aborted');

    // marker ilegible
    fs.writeFileSync(p.markerPath, '{ roto');
    assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'bad-marker');
    assert.strictEqual(fs.existsSync(p.markerPath), false);
    assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'none');
  } finally { rmrf(dir); }
});

test('scripts/restore-db.js restaura por CLI (servidor detenido) y el siguiente arranque la completa', { timeout: 120000 }, async () => {
  const dir = tmpdir();
  try {
    const dbFile = path.join(dir, 'data', 'kbotanas.db');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const run = (f) => spawnSync(process.execPath, [INIT_DB], { env: { ...process.env, DB_FILE: f }, encoding: 'utf8' });
    assert.strictEqual(run(dbFile).status, 0);
    // La BD viva de producción ya pasó por las migraciones del servidor
    const mig = spawnSync(process.execPath, [SERVER], { env: { ...process.env, DB_FILE: dbFile, BACKUP_DIR: path.join(dir, 'bk'), JWT_SECRET: 'x', KBOT_MIGRATE_ONLY: '1' }, encoding: 'utf8' });
    assert.strictEqual(mig.status, 0, mig.stdout + mig.stderr);
    const respaldo = path.join(dir, 'respaldo.db');
    assert.strictEqual(run(respaldo).status, 0);
    const d = new Database(respaldo);
    d.prepare("INSERT INTO movs (id, fecha, tipo, categoria, monto, updated_at) VALUES ('DEL-RESPALDO', '2026-01-01', 'GASTO', 'LUZ', 5, 1)").run();
    d.close();
    const epochAntes = R.readEpochFromFile(dbFile).epoch;
    const CLI = path.join(__dirname, '..', 'scripts', 'restore-db.js');
    const sinArgs = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
    assert.strictEqual(sinArgs.status, 1, 'sin --db/--from no hace nada');
    const r = spawnSync(process.execPath, [CLI, '--db', dbFile, '--from', respaldo, '--yes', '--backups', path.join(dir, 'backups'), '--pm2-name', 'no-existe-en-test'], { encoding: 'utf8', timeout: 90000 });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Restaurada/);
    const p = R.paths(dbFile);
    assert.strictEqual(R.readMarker(p.markerPath).marker.state, 'pending');
    assert.notStrictEqual(R.readEpochFromFile(dbFile).epoch, epochAntes);
    assert.strictEqual(count(dbFile, "SELECT COUNT(*) n FROM movs WHERE id = 'DEL-RESPALDO'"), 1);
    assert.strictEqual(fs.readdirSync(path.join(dir, 'backups', 'auto')).filter(f => f.startsWith('kbotanas-PRE-RESTORE-')).length, 1);
    // Siguiente arranque del servidor: booting → APPLIED
    const silent = { log() {}, error() {} };
    assert.strictEqual(R.bootGuard({ dbFile, log: silent }).action, 'booting');
    const db = new Database(dbFile);
    try {
      assert.strictEqual(R.finishBoot({ db, dbFile, log: silent }).accion, 'RESTORE_FULL_APPLIED');
      // La versión desplegada agregó una columna que el respaldo (PRE-DEPLOY) no tiene
      db.exec('ALTER TABLE movs ADD COLUMN nueva TEXT');
    } finally { db.close(); }
    R.writeJsonAtomic(p.markerPath, { state: 'aborted' }); // marker terminal de un intento previo
    const cli = (...extra) => spawnSync(process.execPath, [CLI, '--db', dbFile, '--from', respaldo, '--yes', '--backups', path.join(dir, 'backups'), '--pm2-name', 'no-existe-en-test', ...extra], { encoding: 'utf8', timeout: 90000 });
    const r2 = cli();
    assert.strictEqual(r2.status, 1);
    assert.match(r2.stderr, /faltan partes.*nueva.*--allow-schema-diff/s);
    assert.strictEqual(fs.existsSync(p.markerPath), false, 'el marker terminal se apartó');
    assert.ok(fs.readdirSync(p.dataDir).some(f => f.startsWith('.restore-state.json.done-')));
    const r3 = cli('--allow-schema-diff');
    assert.strictEqual(r3.status, 0, r3.stdout + r3.stderr);
    assert.match(r3.stderr, /--allow-schema-diff: al respaldo le faltan/);
    assert.strictEqual(R.readMarker(p.markerPath).marker.state, 'pending');
  } finally { rmrf(dir); }
});

test('finishBoot registra APPLIED / NOT_APPLIED / ROLLED_BACK en audit_log, retira el marker y deja el resultado para restore-status', async () => {
  const dir = tmpdir();
  try {
    const { dbFile, st, p, safetyPath, args } = await setupApply(dir);
    await R.applyRestore(args);
    const silent = { log() {}, error() {} };
    R.bootGuard({ dbFile, log: silent });
    const db = new Database(dbFile);
    try {
      const r1 = R.finishBoot({ db, dbFile, log: silent });
      assert.strictEqual(r1.accion, 'RESTORE_FULL_APPLIED');
      assert.strictEqual(fs.existsSync(p.markerPath), false);
      const row = db.prepare("SELECT * FROM audit_log WHERE accion LIKE 'RESTORE_FULL_%'").get();
      assert.strictEqual(row.accion, 'RESTORE_FULL_APPLIED');
      assert.strictEqual(row.user_id, 'u-admin');
      assert.strictEqual(row.entidad_id, st.restoreId);
      const status = R.restoreStatus(dbFile);
      assert.strictEqual(status.inProgress, false);
      assert.strictEqual(status.last.accion, 'RESTORE_FULL_APPLIED');
      assert.strictEqual(status.last.safety, path.basename(safetyPath));
      assert.strictEqual(R.finishBoot({ db, dbFile, log: silent }), null, 'sin marker no hace nada');

      R.writeJsonAtomic(p.markerPath, { state: 'booting', expectedEpoch: 'otro', safety: safetyPath });
      assert.strictEqual(R.finishBoot({ db, dbFile, log: silent }).accion, 'RESTORE_FULL_NOT_APPLIED');
      R.writeJsonAtomic(p.markerPath, { state: 'rolled_back', safety: safetyPath });
      assert.strictEqual(R.finishBoot({ db, dbFile, log: silent }).accion, 'RESTORE_FULL_ROLLED_BACK');
      assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE accion LIKE 'RESTORE_FULL_%'").get().n, 3);
    } finally { db.close(); }
  } finally { rmrf(dir); }
});
