// Prueba de punta a punta de la restauración con el servidor REAL (server.js como
// proceso hijo, igual que en producción bajo pm2): captura → respaldo → más
// capturas → analizar → restaurar → el proceso sale → se relanza (como pm2) →
// finishBoot registra el resultado; epoch nuevo; escrituras con epoch viejo → 409;
// usuarios y bitácora conservados; respaldo de seguridad con lo que se reemplazó.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const BACKEND = path.join(__dirname, '..');
const SECRET = 'e2e-' + Math.random().toString(36).slice(2);
const ADMIN_PASS = 'kbot2026'; // contraseña que pone init-db.js

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(BACKEND, 'server.js')], { cwd: BACKEND, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.out = '';
    const onData = (d) => { child.out += d; if (child.out.includes('corriendo en')) resolve(child); };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { child.out += d; });
    child.exited = new Promise(r => child.on('exit', (code) => r(code)));
    child.exited.then((code) => reject(new Error('el servidor salió antes de arrancar (' + code + '):\n' + child.out.slice(-1500))));
  });
}

function call(port, method, p, { body, token, epoch } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (epoch) headers['X-DB-Epoch'] = epoch;
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        if ((res.headers['content-type'] || '').includes('json')) { try { json = JSON.parse(buf.toString()); } catch (_) { /* ignore */ } }
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    r.setTimeout(60000, () => r.destroy(new Error('timeout ' + p)));
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const mov = (id) => ({ id, fecha: '2026-09-20', tipo: 'GASTO', categoria: 'LUZ', concepto: id, monto: 100, caja: 'caja-principal' });

test('restauración completa de punta a punta con el servidor real', { timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbot-e2e-'));
  const dbFile = path.join(dir, 'data', 'kbotanas.db');
  const backupDir = path.join(dir, 'backups');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const init = spawnSync(process.execPath, [path.join(BACKEND, 'init-db.js')], { env: { ...process.env, DB_FILE: dbFile }, encoding: 'utf8' });
  assert.strictEqual(init.status, 0, init.stderr);

  const port = await freePort();
  const env = { DB_FILE: dbFile, BACKUP_DIR: backupDir, JWT_SECRET: SECRET, PORT: String(port), KBOT_MIGRATE_ONLY: '' };
  const token = jwt.sign({ id: 'u-admin', username: 'admin', rol: 'admin', nombre: 'Administrador' }, SECRET, { expiresIn: '10m' });
  let srv = await startServer(env);
  try {
    // Epoch inicial: sin epoch_at (nunca se ha restaurado) → escrituras sin header se aceptan
    let r = await call(port, 'GET', '/api/epoch');
    assert.strictEqual(r.status, 401, '/api/epoch exige sesión');
    r = await call(port, 'GET', '/api/epoch', { token });
    const e1 = r.body.epoch;
    assert.ok(e1);
    assert.strictEqual(r.body.epoch_at, null);
    r = await call(port, 'POST', '/api/movs', { token, body: mov('M0-antes-del-respaldo') });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));

    // Respaldo (descarga consistente) y luego más cambios que la restauración debe deshacer
    r = await call(port, 'GET', '/api/backup/full-db', { token });
    assert.strictEqual(r.status, 200);
    const respaldo = r.raw;
    r = await call(port, 'POST', '/api/movs', { token, epoch: e1, body: mov('M1-despues-del-respaldo') });
    assert.strictEqual(r.status, 200);
    r = await call(port, 'POST', '/api/users', { token, epoch: e1, body: { username: 'nueva', nombre: 'Usuaria Nueva', rol: 'usuario', password: 'secreto123' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));

    // Aplicar sin analizar → 410; analizar → vista previa
    r = await call(port, 'POST', '/api/backup/restore-full', { token, body: { staging_id: 'x', confirmation_token: 'RESTAURAR', password: ADMIN_PASS } });
    assert.strictEqual(r.status, 410);
    r = await call(port, 'POST', '/api/backup/restore-full/inspect', { token, body: { db_base64: respaldo.toString('base64') } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const stagingId = r.body.staging_id;
    assert.strictEqual(r.body.respaldo.movs, 1);
    assert.strictEqual(r.body.actual.movs, 2);
    assert.deepStrictEqual(r.body.conserva, ['users', 'user_cajas', 'audit_log']);

    // Confirmaciones
    r = await call(port, 'POST', '/api/backup/restore-full', { token, body: { staging_id: stagingId, confirmation_token: 'restaurar', password: ADMIN_PASS } });
    assert.strictEqual(r.status, 400);
    r = await call(port, 'POST', '/api/backup/restore-full', { token, body: { staging_id: stagingId, confirmation_token: 'RESTAURAR', password: 'mala' } });
    assert.strictEqual(r.status, 403);

    // Aplicar → el proceso sale solo (pm2 lo relanzaría)
    r = await call(port, 'POST', '/api/backup/restore-full', { token, body: { staging_id: stagingId, confirmation_token: 'RESTAURAR', password: ADMIN_PASS } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const safetyName = r.body.safety_backup;
    assert.match(safetyName, /^kbotanas-PRE-RESTORE-.*\.db$/);
    assert.strictEqual(await srv.exited, 0, 'sale con 0 para que pm2 reinicie');

    srv = await startServer(env); // "pm2" relanza

    r = await call(port, 'GET', '/api/backup/restore-status', { token });
    assert.strictEqual(r.body.inProgress, false);
    assert.strictEqual(r.body.last.accion, 'RESTORE_FULL_APPLIED');
    assert.strictEqual(r.body.last.safety, safetyName);

    // Epoch nuevo con epoch_at: escrituras con el viejo o sin header → 409
    r = await call(port, 'GET', '/api/epoch', { token });
    const e2 = r.body.epoch;
    assert.notStrictEqual(e2, e1);
    assert.strictEqual(typeof r.body.epoch_at, 'number');
    r = await call(port, 'POST', '/api/movs', { token, epoch: e1, body: mov('M2-epoch-viejo') });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.code, 'DB_EPOCH_STALE');
    // Sin header (app de versión anterior) → 503: esa versión reintenta en vez de descartar
    r = await call(port, 'POST', '/api/movs', { token, body: mov('M3-sin-header') });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.code, 'DB_EPOCH_STALE');
    r = await call(port, 'POST', '/API/MOVS', { token, body: mov('M3b-mayusculas') });
    assert.strictEqual(r.status, 503, 'Express enruta sin distinguir mayúsculas: el filtro también');
    r = await call(port, 'POST', '/api/movs', { token, epoch: e2, body: mov('M4-epoch-nuevo') });
    assert.strictEqual(r.status, 200);
    // El epoch no se puede tocar por la API de ajustes
    r = await call(port, 'PUT', '/api/settings/db_epoch', { token, epoch: e2, body: { value: '' } });
    assert.strictEqual(r.status, 403);
    r = await call(port, 'PUT', '/api/settings/DB_EPOCH_AT', { token, epoch: e2, body: { value: null } });
    assert.strictEqual(r.status, 403);

    // Datos = los del respaldo (+ lo capturado después con el epoch nuevo)
    r = await call(port, 'GET', '/api/movs', { token });
    assert.deepStrictEqual(r.body.movs.map(m => m.id).sort(), ['M0-antes-del-respaldo', 'M4-epoch-nuevo']);
    // Usuarios conservados de la BD de antes de restaurar
    r = await call(port, 'GET', '/api/users', { token });
    assert.ok(r.body.users.some(u => u.username === 'nueva'), 'la usuaria creada después del respaldo se conserva');
  } finally {
    srv.kill();
    await srv.exited.catch(() => {});
  }

  // Bitácora conservada y completa; el respaldo de seguridad tiene lo que se reemplazó
  const d = new Database(dbFile, { fileMustExist: true });
  try {
    const acciones = d.prepare("SELECT accion FROM audit_log WHERE entidad = 'backup' ORDER BY id").all().map(x => x.accion);
    for (const a of ['BACKUP_DOWNLOAD_DB', 'RESTORE_FULL_INSPECT', 'RESTORE_PASSWORD_FAIL', 'RESTORE_FULL_INIT', 'RESTORE_FULL_APPLIED']) {
      assert.ok(acciones.includes(a), 'audit_log incluye ' + a + ' — tiene: ' + acciones.join(','));
    }
  } finally { d.close(); }
  const safety = fs.readdirSync(path.join(backupDir, 'auto')).find(f => f.startsWith('kbotanas-PRE-RESTORE-'));
  const s = new Database(path.join(backupDir, 'auto', safety), { fileMustExist: true });
  try { assert.ok(s.prepare("SELECT 1 FROM movs WHERE id = 'M1-despues-del-respaldo'").get(), 'el safety guarda lo que se reemplazó'); } finally { s.close(); }
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'data')).filter(f => f !== 'kbotanas.db' && !f.startsWith('kbotanas.db-') && f !== '.restore-last.json' && f !== 'restore-staging'), [], 'sin restos en data/');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* Windows */ }
});
