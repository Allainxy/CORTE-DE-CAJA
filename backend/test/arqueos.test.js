// Test de integración del router extraído (routes/arqueos.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP.
// Mismo esqueleto que test/catalogo.test.js (#6).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountArqueos = require('../routes/arqueos');

// CREATE TABLE copiados tal cual de las migraciones de server.js.
// El bloque de arqueos toca cajas + arqueos (y user_cajas vía userCanUseCaja);
// NO toca movs, por eso no se crea aquí.
function setup(user) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS cajas (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  banco TEXT,
  numero TEXT,
  saldo_inicial REAL DEFAULT 0,
  fecha_inicial TEXT,
  moneda TEXT DEFAULT 'MXN',
  permite_negativo INTEGER DEFAULT 0,
  archivada INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0,
  color TEXT,
  icon TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS arqueos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  ts INTEGER NOT NULL,
  caja_id TEXT NOT NULL,
  caja_nombre TEXT,
  user_id TEXT,
  user_nombre TEXT,
  saldo_sistema REAL NOT NULL,
  saldo_fisico REAL NOT NULL,
  diferencia REAL NOT NULL,
  estado TEXT NOT NULL,
  observaciones TEXT,
  denominaciones TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS user_cajas (
  user_id TEXT NOT NULL,
  caja_id TEXT NOT NULL,
  PRIMARY KEY (user_id, caja_id)
)`);

  const app = express();
  app.use(express.json());
  const u = user || { id: 'u1', nombre: 'Test', rol: 'admin' };
  const pass = (req, _res, next) => { req.user = u; next(); };
  const auditCalls = [];
  const audit = (_req, accion, entidad, id, detalle) => { auditCalls.push({ accion, entidad, id, detalle }); };
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountArqueos(app, db, { requireAuth: pass, requirePin: pass, requireAdmin: pass, audit, newId, userCanUseCaja: () => true });
  const server = app.listen(0);
  return { db, server, port: server.address().port, auditCalls };
}

function call(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

function seedCaja(db, id, nombre, tipo = 'EFECTIVO', archivada = 0) {
  db.prepare('INSERT INTO cajas (id, tipo, nombre, archivada, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)')
    .run(id, tipo, nombre, archivada, Date.now());
}

function seedArqueo(db, a) {
  db.prepare(`INSERT INTO arqueos (
    id, fecha, ts, caja_id, caja_nombre, user_id, user_nombre,
    saldo_sistema, saldo_fisico, diferencia, estado, observaciones, denominaciones,
    updated_at, deleted
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    a.id, a.fecha, a.ts, a.caja_id, a.caja_nombre || 'CAJA', a.user_id || 'u1', a.user_nombre || 'Test',
    a.saldo_sistema ?? 100, a.saldo_fisico ?? 100, a.diferencia ?? 0, a.estado || 'CUADRADO',
    a.observaciones || null, a.denominaciones || null, a.ts, a.deleted || 0
  );
}

test('arqueos: GET /api/arqueos vacío → 200 []; con filas ordena por ts DESC, parsea denominaciones, filtra y excluye borrados', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/arqueos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.arqueos, []);

    seedCaja(db, 'c1', 'CAJA CHICA');
    seedArqueo(db, { id: 'a1', fecha: '2026-09-01', ts: 1000, caja_id: 'c1', estado: 'CUADRADO', denominaciones: '{"500":2}' });
    seedArqueo(db, { id: 'a2', fecha: '2026-09-03', ts: 2000, caja_id: 'c1', estado: 'FALTANTE', diferencia: -10, denominaciones: 'no-es-json' });
    seedArqueo(db, { id: 'a3', fecha: '2026-09-04', ts: 3000, caja_id: 'c1', deleted: 1 });

    r = await call(port, 'GET', '/api/arqueos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.arqueos.map(a => a.id), ['a2', 'a1']); // ts DESC, sin a3 (deleted)
    assert.deepStrictEqual(r.body.arqueos[1].denominaciones, { 500: 2 });   // JSON válido → objeto
    assert.strictEqual(r.body.arqueos[0].denominaciones, null);            // JSON inválido → null

    r = await call(port, 'GET', '/api/arqueos?estado=FALTANTE');
    assert.deepStrictEqual(r.body.arqueos.map(a => a.id), ['a2']);
    r = await call(port, 'GET', '/api/arqueos?desde=2026-09-02');
    assert.deepStrictEqual(r.body.arqueos.map(a => a.id), ['a2']);
    r = await call(port, 'GET', '/api/arqueos?hasta=2026-09-02');
    assert.deepStrictEqual(r.body.arqueos.map(a => a.id), ['a1']);
    r = await call(port, 'GET', '/api/arqueos?caja_id=c1&limit=1');
    assert.strictEqual(r.body.arqueos.length, 1);
    r = await call(port, 'GET', '/api/arqueos?caja_id=otra');
    assert.deepStrictEqual(r.body.arqueos, []);
  } finally { server.close(); }
});

test('arqueos: GET /api/arqueos/:id 404/200 y DELETE (admin+PIN) → 200, deleted=1 en BD, audita; no-admin → 403', async () => {
  const { db, server, port, auditCalls } = setup();
  try {
    let r = await call(port, 'GET', '/api/arqueos/nope');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Arqueo no encontrado');

    seedCaja(db, 'c1', 'CAJA CHICA');
    seedArqueo(db, { id: 'a1', fecha: '2026-09-01', ts: 1000, caja_id: 'c1', caja_nombre: 'CAJA CHICA', diferencia: 5.5, estado: 'SOBRANTE', denominaciones: '{"100":1}' });

    r = await call(port, 'GET', '/api/arqueos/a1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.arqueo.id, 'a1');
    assert.deepStrictEqual(r.body.arqueo.denominaciones, { 100: 1 });

    r = await call(port, 'DELETE', '/api/arqueos/a1');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { ok: true });
    assert.strictEqual(db.prepare("SELECT deleted FROM arqueos WHERE id = 'a1'").get().deleted, 1);
    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].accion, 'delete');
    assert.strictEqual(auditCalls[0].entidad, 'arqueo');
    assert.strictEqual(auditCalls[0].id, 'a1');
    assert.deepStrictEqual(JSON.parse(auditCalls[0].detalle), { caja: 'CAJA CHICA', diferencia: 5.5 });

    r = await call(port, 'GET', '/api/arqueos/a1');
    assert.strictEqual(r.status, 404); // ya borrado lógicamente
    r = await call(port, 'DELETE', '/api/arqueos/a1');
    assert.strictEqual(r.status, 404); // segundo borrado no encuentra
  } finally { server.close(); }

  const g = setup({ id: 'u2', nombre: 'Gerente', rol: 'gerente' });
  try {
    seedCaja(g.db, 'c1', 'CAJA CHICA');
    seedArqueo(g.db, { id: 'a1', fecha: '2026-09-01', ts: 1000, caja_id: 'c1' });
    const r = await call(g.port, 'DELETE', '/api/arqueos/a1');
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.error, 'Solo admin puede borrar arqueos');
    assert.strictEqual(g.db.prepare("SELECT deleted FROM arqueos WHERE id = 'a1'").get().deleted, 0);
  } finally { g.server.close(); }
});

test('arqueos: GET /api/arqueos/stats/ultimos → último arqueo por caja EFECTIVO activa (ignora BANCO y archivadas)', async () => {
  const { db, server, port } = setup();
  try {
    seedCaja(db, 'c1', 'CAJA CHICA', 'EFECTIVO');
    seedCaja(db, 'c2', 'BANCO BBVA', 'BANCO');
    seedCaja(db, 'c3', 'CAJA VIEJA', 'EFECTIVO', 1);
    seedCaja(db, 'c4', 'CAJA SIN ARQUEOS', 'EFECTIVO');
    seedArqueo(db, { id: 'a1', fecha: '2026-09-01', ts: 1000, caja_id: 'c1', estado: 'CUADRADO' });
    seedArqueo(db, { id: 'a2', fecha: '2026-09-03', ts: 2000, caja_id: 'c1', estado: 'FALTANTE', diferencia: -3 });
    seedArqueo(db, { id: 'a9', fecha: '2026-09-04', ts: 9000, caja_id: 'c1', deleted: 1 });

    const r = await call(port, 'GET', '/api/arqueos/stats/ultimos');
    assert.strictEqual(r.status, 200);
    const byCaja = Object.fromEntries(r.body.cajas.map(c => [c.caja_id, c]));
    assert.deepStrictEqual(Object.keys(byCaja).sort(), ['c1', 'c4']);
    assert.strictEqual(byCaja.c1.caja_nombre, 'CAJA CHICA');
    assert.strictEqual(byCaja.c1.ultimo.id, 'a2'); // el más reciente no borrado
    assert.strictEqual(byCaja.c1.ultimo.estado, 'FALTANTE');
    assert.strictEqual(byCaja.c4.ultimo, null);
  } finally { server.close(); }
});

// Validaciones del POST que ocurren ANTES de la llamada a userCanUseCaja():
// todas se pueden probar sin resolver el bloqueante.
test('arqueos: POST /api/arqueos validaciones → 403 consulta, 400 sin caja_id / saldos, 404 caja, 400 caja no EFECTIVO; no inserta nada', async () => {
  const c = setup({ id: 'u3', nombre: 'Lector', rol: 'consulta' });
  try {
    const r = await call(c.port, 'POST', '/api/arqueos', { caja_id: 'c1', saldo_sistema: 1, saldo_fisico: 1 });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.error, 'No puedes crear arqueos');
  } finally { c.server.close(); }

  const { db, server, port } = setup();
  try {
    seedCaja(db, 'c1', 'CAJA CHICA', 'EFECTIVO');
    seedCaja(db, 'c2', 'BANCO BBVA', 'BANCO');

    let r = await call(port, 'POST', '/api/arqueos', { saldo_sistema: 1, saldo_fisico: 1 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_id requerido');
    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'c1', saldo_sistema: '100', saldo_fisico: 100 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'saldo_sistema inválido');
    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'c1', saldo_sistema: 100 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'saldo_fisico inválido');
    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'nope', saldo_sistema: 100, saldo_fisico: 100 });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Caja no encontrada');
    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'c2', saldo_sistema: 100, saldo_fisico: 100 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Solo se pueden arquear cajas tipo EFECTIVO');

    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM arqueos').get().n, 0);
  } finally { server.close(); }
});

// BLOQUEANTE #6: el camino feliz del POST llama a userCanUseCaja() (server.js ~597),
// que hoy NO se inyecta por opts. Cuando se resuelva (opts.userCanUseCaja o
// helper movido), quitar el skip y, si aplica, pasar el helper en setup().
test('arqueos: POST /api/arqueos crea arqueo → 200 {ok,id,estado,diferencia} y queda en BD', async () => {
  const { db, server, port, auditCalls } = setup();
  try {
    seedCaja(db, 'c1', 'CAJA CHICA', 'EFECTIVO');
    let r = await call(port, 'POST', '/api/arqueos', {
      caja_id: 'c1', saldo_sistema: 100, saldo_fisico: 90.5,
      denominaciones: { 50: 1, 20: 2 }, observaciones: 'faltó cambio', fecha: '2026-09-05'
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.estado, 'FALTANTE');
    assert.strictEqual(r.body.diferencia, -9.5);
    assert.ok(r.body.id.startsWith('arq-'));

    const row = db.prepare('SELECT * FROM arqueos WHERE id = ?').get(r.body.id);
    assert.strictEqual(row.caja_nombre, 'CAJA CHICA');
    assert.strictEqual(row.user_id, 'u1');
    assert.strictEqual(row.fecha, '2026-09-05');
    assert.strictEqual(row.estado, 'FALTANTE');
    assert.strictEqual(row.diferencia, -9.5);
    assert.deepStrictEqual(JSON.parse(row.denominaciones), { 50: 1, 20: 2 });
    assert.strictEqual(row.deleted, 0);
    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].accion, 'create');

    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'c1', saldo_sistema: 100, saldo_fisico: 100.005 });
    assert.strictEqual(r.body.estado, 'CUADRADO'); // |dif| <= 0.01 → cuadrado
    r = await call(port, 'POST', '/api/arqueos', { caja_id: 'c1', saldo_sistema: 100, saldo_fisico: 101 });
    assert.strictEqual(r.body.estado, 'SOBRANTE');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM arqueos WHERE deleted = 0').get().n, 3);
  } finally { server.close(); }
});
