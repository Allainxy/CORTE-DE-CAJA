// Test de integración del router extraído (routes/cxp.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Sigue la
// plantilla de catalogo.test.js (#6).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountCxp = require('../routes/cxp');

// Esquemas copiados de server.js (cxp, cxp_facturas, cxp_abonos, cajas, terceros)
// y de init-db.js (movs, cats). movs incluye ademas las columnas que server.js
// agrega por migración (cxp_id, abono_id, created_at, orden_id, afecta_saldo, import_id).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS cxp (
  id TEXT PRIMARY KEY,
  direccion TEXT NOT NULL DEFAULT 'PAGAR',
  tercero_id TEXT,
  tercero_nombre TEXT,
  concepto TEXT NOT NULL,
  categoria_id TEXT,
  monto_total REAL NOT NULL DEFAULT 0,
  fecha_creacion TEXT NOT NULL,
  fecha_vencimiento TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT,
  user_id TEXT,
  user_nombre TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cxp_facturas (
  id TEXT PRIMARY KEY,
  cxp_id TEXT NOT NULL,
  numero TEXT,
  uuid TEXT,
  fecha TEXT,
  monto REAL NOT NULL,
  notas TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cxp_abonos (
  id TEXT PRIMARY KEY,
  cxp_id TEXT NOT NULL,
  factura_id TEXT,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL,
  caja_id TEXT NOT NULL,
  caja_nombre TEXT,
  mov_id TEXT,
  metodo TEXT DEFAULT 'EFECTIVO',
  referencia TEXT,
  notas TEXT,
  user_id TEXT,
  user_nombre TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE movs (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  concepto TEXT,
  monto REAL NOT NULL,
  metodo TEXT DEFAULT 'EFECTIVO',
  caja TEXT DEFAULT 'caja-principal',
  caja_destino TEXT,
  transfer_id TEXT,
  usuario TEXT,
  notas TEXT,
  src TEXT DEFAULT 'manual',
  user_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  cxp_id TEXT,
  created_at INTEGER,
  abono_id TEXT,
  orden_id TEXT,
  afecta_saldo INTEGER DEFAULT 1,
  import_id TEXT
);
CREATE TABLE IF NOT EXISTS cajas (
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
);
CREATE TABLE cats (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  group_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS terceros (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'PROVEEDOR',
  categoria_id_sugerida TEXT,
  telefono TEXT,
  notas TEXT,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
`;

function setup(rol = 'admin') {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  const now = Date.now();
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at, deleted) VALUES ('caja-principal', 'EFECTIVO', 'Caja Principal', ?, 0)").run(now);
  db.prepare("INSERT INTO terceros (id, nombre, tipo, updated_at, deleted) VALUES ('t1', 'PROVEEDOR UNO', 'PROVEEDOR', ?, 0)").run(now);
  db.prepare("INSERT INTO cats (id, tipo, nombre, updated_at, deleted) VALUES ('cat-luz', 'GASTO', 'LUZ', ?, 0)").run(now);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol }; next(); };
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountCxp(app, db, { requireAuth: pass, requirePin: pass, requireAdmin: pass, audit: () => {}, newId });
  const server = app.listen(0);
  return { db, server, port: server.address().port };
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

test('cxp: GET /api/cxp vacio -> 200 []; GET /api/cxp/stats/resumen -> 200 con PAGAR/COBRAR', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/cxp');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.cxp, []);
    r = await call(port, 'GET', '/api/cxp/stats/resumen');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.stats.PAGAR, { total_cuentas: 0, total_saldo: 0, vencidas: 0, proximas_7d: 0 });
    assert.deepStrictEqual(r.body.stats.COBRAR, { total_cuentas: 0, total_saldo: 0, vencidas: 0, proximas_7d: 0 });
    r = await call(port, 'GET', '/api/cxp/no-existe');
    assert.strictEqual(r.status, 404);
  } finally { server.close(); }
});

test('cxp: POST crea cuenta PAGAR con factura y abono_inicial -> 200, queda PARCIAL en BD con mov en caja', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/cxp', {
      direccion: 'PAGAR', tercero_id: 't1', concepto: 'Compra de harina', categoria_id: 'cat-luz',
      monto_total: 1500, fecha_creacion: '2026-09-01', fecha_vencimiento: '2026-09-30',
      facturas: [{ numero: 'F-001', monto: 1500 }],
      abono_inicial: { monto: 500, caja_id: 'caja-principal', metodo: 'EFECTIVO', referencia: 'REF1' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    const id = r.body.id;
    assert.ok(id.startsWith('cxp-'));

    // Verificacion directa en BD
    const row = db.prepare('SELECT * FROM cxp WHERE id = ?').get(id);
    assert.strictEqual(row.estado, 'PARCIAL');
    assert.strictEqual(row.tercero_nombre, 'PROVEEDOR UNO'); // resuelto desde terceros
    assert.strictEqual(row.monto_total, 1500);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM cxp_facturas WHERE cxp_id = ? AND deleted = 0').get(id).n, 1);
    const abono = db.prepare('SELECT * FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(id);
    assert.strictEqual(abono.monto, 500);
    assert.strictEqual(abono.caja_nombre, 'Caja Principal');
    const mov = db.prepare('SELECT * FROM movs WHERE id = ?').get(abono.mov_id);
    assert.strictEqual(mov.tipo, 'GASTO');
    assert.strictEqual(mov.monto, 500);
    assert.strictEqual(mov.src, 'cxp');
    assert.strictEqual(mov.cxp_id, id);
    assert.strictEqual(mov.abono_id, abono.id);
    assert.strictEqual(mov.concepto, 'Pago a: PROVEEDOR UNO (REF1)');

    // Detalle por HTTP enriquecido
    r = await call(port, 'GET', `/api/cxp/${id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.cxp.pagado, 500);
    assert.strictEqual(r.body.cxp.saldo, 1000);
    assert.strictEqual(r.body.cxp.facturas.length, 1);
    assert.strictEqual(r.body.cxp.abonos.length, 1);

    // Lista con filtro
    r = await call(port, 'GET', '/api/cxp?direccion=PAGAR&estado=PARCIAL');
    assert.strictEqual(r.body.cxp.length, 1);
    r = await call(port, 'GET', '/api/cxp?direccion=COBRAR');
    assert.strictEqual(r.body.cxp.length, 0);
  } finally { server.close(); }
});

test('cxp: abonos por HTTP -> PARCIAL -> PAGADA; exceso -> 400; DELETE abono revierte mov y estado', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/cxp', { direccion: 'COBRAR', concepto: 'Venta a credito', monto_total: 1000 });
    assert.strictEqual(r.status, 200);
    const id = r.body.id;
    assert.strictEqual(db.prepare('SELECT estado FROM cxp WHERE id = ?').get(id).estado, 'PENDIENTE');

    r = await call(port, 'POST', `/api/cxp/${id}/abonos`, { monto: 400, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.estado, 'PARCIAL');
    const abono1 = r.body.id;
    const mov1 = db.prepare('SELECT * FROM movs WHERE id = ?').get(r.body.mov_id);
    assert.strictEqual(mov1.tipo, 'INGRESO'); // COBRAR -> INGRESO
    assert.strictEqual(mov1.concepto, 'Cobro de: Venta a credito');

    r = await call(port, 'POST', `/api/cxp/${id}/abonos`, { monto: 600, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.estado, 'PAGADA');
    assert.strictEqual(db.prepare('SELECT estado FROM cxp WHERE id = ?').get(id).estado, 'PAGADA');

    r = await call(port, 'POST', `/api/cxp/${id}/abonos`, { monto: 1, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /excede saldo restante/);

    r = await call(port, 'POST', `/api/cxp/${id}/abonos`, { monto: 1 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Caja requerida');

    r = await call(port, 'DELETE', `/api/cxp/abonos/${abono1}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT deleted FROM cxp_abonos WHERE id = ?').get(abono1).deleted, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(mov1.id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT estado FROM cxp WHERE id = ?').get(id).estado, 'PARCIAL');
  } finally { server.close(); }
});

test('cxp: validaciones -> 400; rol consulta -> 403; DELETE cuenta revierte abonos y movs', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/cxp', { monto_total: 100 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Concepto requerido');
    r = await call(port, 'POST', '/api/cxp', { concepto: 'X', monto_total: 0 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Monto inválido');

    r = await call(port, 'POST', '/api/cxp', { concepto: 'Cuenta a borrar', monto_total: 300,
      abono_inicial: { monto: 100, caja_id: 'caja-principal' } });
    const id = r.body.id;
    r = await call(port, 'DELETE', `/api/cxp/${id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.abonos_revertidos, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM cxp WHERE id = ?').get(id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE cxp_id = ? AND deleted = 0').get(id).n, 0);
    r = await call(port, 'GET', '/api/cxp');
    assert.deepStrictEqual(r.body.cxp, []);
  } finally { server.close(); }

  const consulta = setup('consulta');
  try {
    const r = await call(consulta.port, 'POST', '/api/cxp', { concepto: 'X', monto_total: 10 });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.error, 'Sin permiso');
  } finally { consulta.server.close(); }
});
