// Test de integración del router extraído (routes/viaticos.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Sigue la
// plantilla de test/catalogo.test.js (#6).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountViaticos = require('../routes/viaticos');

const CAT_ANTICIPO = 'ANTICIPOS VIATICOS';

function setup() {
  const db = new Database(':memory:');
  // movs, cajas, cats, groups: copiados de init-db.js.
  // viaticos / viaticos_conceptos: NO están declaradas en el repo (ver
  // docs/DISENOS-PENDIENTES.md, "Tablas vivas NO declaradas en repo"); las
  // columnas se derivan del SQL que ejecuta el router.
  db.exec(`
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
      deleted INTEGER DEFAULT 0
    );
    CREATE TABLE cajas (
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
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      orden INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0
    );
    CREATE TABLE viaticos (
      id TEXT PRIMARY KEY,
      fecha TEXT NOT NULL,
      empleado_nombre TEXT NOT NULL,
      empleado_id TEXT,
      concepto TEXT,
      monto_anticipo REAL NOT NULL DEFAULT 0,
      metodo TEXT DEFAULT 'EFECTIVO',
      caja_origen TEXT,
      estado TEXT DEFAULT 'ABIERTO',
      fecha_comprobacion TEXT,
      monto_comprobado REAL DEFAULT 0,
      diferencia REAL DEFAULT 0,
      caja_ajuste TEXT,
      mov_anticipo_id TEXT,
      mov_devolucion_id TEXT,
      mov_faltante_id TEXT,
      comentario TEXT,
      usuario TEXT,
      user_id TEXT,
      created_at INTEGER,
      updated_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0
    );
    CREATE TABLE viaticos_conceptos (
      id TEXT PRIMARY KEY,
      viatico_id TEXT NOT NULL,
      categoria TEXT NOT NULL,
      concepto TEXT,
      monto REAL NOT NULL DEFAULT 0,
      mov_id TEXT,
      orden INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0
    );
  `);
  const now = Date.now();
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at) VALUES ('caja-principal', 'EFECTIVO', 'CAJA PRINCIPAL', ?)").run(now);
  db.prepare("INSERT INTO groups (id, tipo, nombre, orden, updated_at) VALUES ('g-vt', 'GASTO', 'VIATICOS', 1, ?)").run(now);
  const insCat = db.prepare('INSERT INTO cats (id, tipo, nombre, group_id, updated_at) VALUES (?, ?, ?, ?, ?)');
  insCat.run('c-ant', 'GASTO', CAT_ANTICIPO, null, now);
  insCat.run('c-gas', 'GASTO', 'GASOLINA', 'g-vt', now);
  insCat.run('c-cas', 'GASTO', 'CASETAS', 'g-vt', now);
  insCat.run('c-ven', 'INGRESO', 'VENTAS', null, now);

  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol: 'admin' }; next(); };
  mountViaticos(app, db, {
    requireAuth: pass, requirePin: pass, requireAdmin: pass,
    audit: () => {},
    newId: (p = '') => p + Math.random().toString(36).slice(2),
  });
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

test('viaticos: GET lista / stats / categorias con BD vacía → 200', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/viaticos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/viaticos/stats/abiertos');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.count, 0);
    assert.strictEqual(r.body.total_anticipos, 0);
    assert.strictEqual(r.body.saldo_pendiente, 0);
    assert.ok(!r.body.mas_antiguo);

    // Excluye ANTICIPOS VIATICOS y las INGRESO; grupo VIATICOS primero, por nombre
    r = await call(port, 'GET', '/api/viaticos/categorias/gasto');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.map(c => c.nombre), ['CASETAS', 'GASOLINA']);
    assert.strictEqual(r.body[0].grupo, 'VIATICOS');

    r = await call(port, 'GET', '/api/viaticos/no-existe');
    assert.strictEqual(r.status, 404);
  } finally { server.close(); }
});

test('viaticos: POST crea anticipo → 200, viatico ABIERTO + mov GASTO ANTICIPOS VIATICOS en BD', async () => {
  const { db, server, port } = setup();
  try {
    const r = await call(port, 'POST', '/api/viaticos', {
      fecha: '2026-09-01', empleado_nombre: 'juan perez', monto_anticipo: 1500,
      caja_origen: 'caja-principal', metodo: 'efectivo', comentario: 'Ruta norte',
    });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.id.startsWith('vt-'));
    assert.strictEqual(r.body.estado, 'ABIERTO');
    assert.strictEqual(r.body.empleado_nombre, 'JUAN PEREZ');
    assert.strictEqual(r.body.monto_anticipo, 1500);
    assert.strictEqual(r.body.monto_comprobado, 0);
    assert.strictEqual(r.body.diferencia, 1500);
    assert.strictEqual(r.body.concepto, 'Viáticos · JUAN PEREZ');
    assert.strictEqual(r.body.caja_origen_nombre, 'CAJA PRINCIPAL');

    // BD: fila en viaticos + mov GASTO del anticipo con src 'viatico'
    const v = db.prepare('SELECT * FROM viaticos WHERE id = ?').get(r.body.id);
    assert.ok(v);
    assert.strictEqual(v.usuario, 'Test');
    assert.strictEqual(v.user_id, 'u');
    const mov = db.prepare('SELECT * FROM movs WHERE id = ?').get(v.mov_anticipo_id);
    assert.ok(mov);
    assert.ok(mov.id.startsWith('m-vt-ant-'));
    assert.strictEqual(mov.tipo, 'GASTO');
    assert.strictEqual(mov.categoria, CAT_ANTICIPO);
    assert.strictEqual(mov.monto, 1500);
    assert.strictEqual(mov.metodo, 'EFECTIVO');
    assert.strictEqual(mov.caja, 'caja-principal');
    assert.strictEqual(mov.src, 'viatico');
    assert.strictEqual(mov.notas, 'Ruta norte');
    assert.strictEqual(mov.deleted, 0);

    // Lista, detalle y stats lo reflejan
    let g = await call(port, 'GET', '/api/viaticos');
    assert.strictEqual(g.body.length, 1);
    assert.strictEqual(g.body[0].conceptos_count, 0);
    g = await call(port, 'GET', '/api/viaticos/' + r.body.id);
    assert.strictEqual(g.status, 200);
    assert.deepStrictEqual(g.body.conceptos, []);
    g = await call(port, 'GET', '/api/viaticos/stats/abiertos');
    assert.strictEqual(g.body.count, 1);
    assert.strictEqual(g.body.saldo_pendiente, 1500);
    assert.strictEqual(g.body.mas_antiguo.empleado_nombre, 'JUAN PEREZ');

    // Validaciones → 400 (mismos mensajes que server.js)
    let bad = await call(port, 'POST', '/api/viaticos', { empleado_nombre: 'X', monto_anticipo: 100 });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, 'caja_origen requerida');
    bad = await call(port, 'POST', '/api/viaticos', { empleado_nombre: 'X', monto_anticipo: 0, caja_origen: 'caja-principal' });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, 'monto_anticipo debe ser positivo');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM viaticos').get().n, 1);
  } finally { server.close(); }
});

test('viaticos: flujo comprobar (movs reales, anticipo borrado) y cancelar (revierte)', async () => {
  const { db, server, port } = setup();
  try {
    const c = await call(port, 'POST', '/api/viaticos', { empleado_nombre: 'ANA', monto_anticipo: 1000, caja_origen: 'caja-principal' });
    assert.strictEqual(c.status, 200);
    const id = c.body.id;
    const movAnt = c.body.mov_anticipo_id;

    // Sin conceptos / categoría reservada → 400 y la transacción no deja rastro
    let r = await call(port, 'POST', `/api/viaticos/${id}/comprobar`, { conceptos: [] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'debe agregar al menos un concepto');
    r = await call(port, 'POST', `/api/viaticos/${id}/comprobar`, { conceptos: [{ categoria: CAT_ANTICIPO, monto: 10 }] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(movAnt).deleted, 0);

    r = await call(port, 'POST', `/api/viaticos/${id}/comprobar`, {
      fecha_comprobacion: '2026-09-03',
      comentario: 'Viaje CDMX',
      conceptos: [
        { categoria: 'gasolina', concepto: 'Pemex', monto: 600 },
        { categoria: 'CASETAS', monto: 250.5 },
      ],
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.estado, 'COMPROBADO');
    assert.strictEqual(r.body.monto_comprobado, 850.5);
    assert.strictEqual(r.body.diferencia, 149.5);
    assert.strictEqual(r.body.fecha_comprobacion, '2026-09-03');
    assert.strictEqual(r.body.caja_ajuste, 'caja-principal');
    assert.strictEqual(r.body.caja_ajuste_nombre, 'CAJA PRINCIPAL');
    assert.strictEqual(r.body.comentario, 'Viaje CDMX');
    assert.strictEqual(r.body.mov_devolucion_id, null);
    assert.strictEqual(r.body.mov_faltante_id, null);

    // BD: anticipo soft-deleted, 2 movs reales de comprobación, 2 conceptos
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(movAnt).deleted, 1);
    const reales = db.prepare("SELECT * FROM movs WHERE src = 'viatico-comprobacion' AND deleted = 0 ORDER BY monto DESC").all();
    assert.strictEqual(reales.length, 2);
    assert.ok(reales[0].id.startsWith('m-vt-gst-'));
    assert.strictEqual(reales[0].categoria, 'GASOLINA');
    assert.strictEqual(reales[0].concepto, 'Pemex');
    assert.strictEqual(reales[0].monto, 600);
    assert.strictEqual(reales[0].fecha, '2026-09-03');
    assert.strictEqual(reales[0].caja, 'caja-principal');
    assert.strictEqual(reales[1].categoria, 'CASETAS');
    assert.strictEqual(reales[1].concepto, 'CASETAS');
    assert.ok(reales[1].notas.includes('ANA') && reales[1].notas.includes('Viaje CDMX'));
    const conceptos = db.prepare('SELECT * FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0 ORDER BY orden').all(id);
    assert.strictEqual(conceptos.length, 2);
    assert.deepStrictEqual(conceptos.map(x => x.categoria), ['GASOLINA', 'CASETAS']);
    assert.ok(conceptos.every(x => x.id.startsWith('vc-')));

    let g = await call(port, 'GET', '/api/viaticos/' + id);
    assert.strictEqual(g.body.conceptos.length, 2);
    g = await call(port, 'GET', '/api/viaticos/stats/abiertos');
    assert.strictEqual(g.body.count, 0);

    // Re-comprobar → 400
    r = await call(port, 'POST', `/api/viaticos/${id}/comprobar`, { conceptos: [{ categoria: 'GASOLINA', monto: 1 }] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'viatico ya está comprobado');

    // Cancelar: revierte anticipo + los 2 movs reales
    r = await call(port, 'DELETE', '/api/viaticos/' + id);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { ok: true, movs_revertidos: 3 });
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE deleted = 0').get().n, 0);
    const v = db.prepare('SELECT estado, deleted FROM viaticos WHERE id = ?').get(id);
    assert.strictEqual(v.estado, 'CANCELADO');
    assert.strictEqual(v.deleted, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0').get(id).n, 0);
    g = await call(port, 'GET', '/api/viaticos/' + id);
    assert.strictEqual(g.status, 404);
    g = await call(port, 'GET', '/api/viaticos');
    assert.deepStrictEqual(g.body, []);
  } finally { server.close(); }
});
