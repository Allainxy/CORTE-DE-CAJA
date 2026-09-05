// Test de integración del router extraído (routes/terceros.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Mismo patrón
// que test/catalogo.test.js (#6).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountTerceros = require('../routes/terceros');

function setup() {
  const db = new Database(':memory:');
  // CREATE TABLE copiados de server.js (migraciones), incluyendo los ALTER TABLE
  // de terceros (grupo_sugerido, categoria_sugerida, tipo_proveedor).
  db.exec(`CREATE TABLE IF NOT EXISTS terceros (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'PROVEEDOR',
  categoria_id_sugerida TEXT,
  telefono TEXT,
  notas TEXT,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
  db.exec(`ALTER TABLE terceros ADD COLUMN grupo_sugerido TEXT`);
  db.exec(`ALTER TABLE terceros ADD COLUMN categoria_sugerida TEXT`);
  db.exec(`ALTER TABLE terceros ADD COLUMN tipo_proveedor TEXT DEFAULT 'PRODUCTO'`);
  db.exec(`CREATE TABLE IF NOT EXISTS proveedor_productos (
  id TEXT PRIMARY KEY,
  proveedor_id TEXT NOT NULL,
  producto TEXT NOT NULL,
  unidad TEXT DEFAULT 'KG',
  cantidad_default REAL DEFAULT 0,
  precio_actual REAL DEFAULT 0,
  ultimo_precio_orden_id TEXT,
  ultimo_precio_fecha TEXT,
  categoria_contable TEXT DEFAULT 'MERCANCIA',
  activo INTEGER DEFAULT 1,
  orden_visual INTEGER DEFAULT 0,
  notas TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS cxp (
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
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS ordenes_compra (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  numero_orden TEXT,
  proveedor_id TEXT,
  proveedor_nombre TEXT NOT NULL,
  comprador_nombre TEXT,
  metodo_pago TEXT NOT NULL,
  caja_id TEXT NOT NULL,
  caja_nombre TEXT,
  monto_estimado REAL DEFAULT 0,
  monto_entregado REAL DEFAULT 0,
  monto_real REAL DEFAULT 0,
  ajuste REAL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  mov_salida_id TEXT,
  mov_ajuste_id TEXT,
  cxp_id TEXT,
  observaciones TEXT,
  fecha_cierre TEXT,
  user_id TEXT,
  user_nombre TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol: 'admin' }; next(); };
  const audit = () => {};
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountTerceros(app, db, { requireAuth: pass, requirePin: pass, requireAdmin: pass, audit, newId });
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

test('terceros: GET /api/terceros vacío → POST crea proveedor → GET lo devuelve con productos_count', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/terceros');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.terceros, []);

    r = await call(port, 'POST', '/api/terceros', { nombre: '  Carnes del Norte ', tipo: 'PROVEEDOR', telefono: '5551234', categoria_sugerida: 'MERCANCIA' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.ok(r.body.id.startsWith('ter-'));
    const id = r.body.id;

    // Verificación directa en BD
    const row = db.prepare('SELECT * FROM terceros WHERE id = ?').get(id);
    assert.strictEqual(row.nombre, 'Carnes del Norte'); // trim
    assert.strictEqual(row.tipo, 'PROVEEDOR');
    assert.strictEqual(row.tipo_proveedor, 'PRODUCTO'); // default
    assert.strictEqual(row.activo, 1);
    assert.strictEqual(row.deleted, 0);

    r = await call(port, 'GET', '/api/terceros');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.terceros.length, 1);
    assert.strictEqual(r.body.terceros[0].id, id);
    assert.strictEqual(r.body.terceros[0].productos_count, 0);

    // Filtro por tipo: un CLIENTE no aparece al pedir PROVEEDOR
    await call(port, 'POST', '/api/terceros', { nombre: 'Cliente X', tipo: 'CLIENTE' });
    r = await call(port, 'GET', '/api/terceros?tipo=PROVEEDOR');
    assert.strictEqual(r.body.terceros.length, 1);
    r = await call(port, 'GET', '/api/terceros?tipo=CLIENTE');
    assert.strictEqual(r.body.terceros.length, 1);
    assert.strictEqual(r.body.terceros[0].nombre, 'Cliente X');
    assert.strictEqual(r.body.terceros[0].productos_count, undefined); // solo proveedores
  } finally { server.close(); }
});

test('terceros: POST sin nombre → 400', async () => {
  const { server, port } = setup();
  try {
    const r = await call(port, 'POST', '/api/terceros', { tipo: 'PROVEEDOR' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Nombre requerido');
  } finally { server.close(); }
});

test('terceros: PUT /:id/productos bulk crea, reemplaza y soft-deletea los que no vienen', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/terceros', { nombre: 'Proveedor P', tipo: 'PROVEEDOR', categoria_sugerida: 'MERCANCIA' });
    const id = r.body.id;

    r = await call(port, 'PUT', `/api/terceros/${id}/productos`, {
      productos: [
        { producto: 'Pollo', unidad: 'KG', cantidad_default: 10, precio_actual: 85 },
        { producto: 'Res', unidad: 'KG', cantidad_default: 5, precio_actual: 190, categoria_contable: 'CARNE' },
        { producto: '   ' } // vacío: se ignora
      ]
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);

    r = await call(port, 'GET', `/api/terceros/${id}/productos`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.productos.length, 2);
    const pollo = r.body.productos.find(p => p.producto === 'Pollo');
    const res_ = r.body.productos.find(p => p.producto === 'Res');
    assert.ok(pollo.id.startsWith('pp-'));
    assert.strictEqual(pollo.categoria_contable, 'MERCANCIA'); // hereda categoria_sugerida del tercero
    assert.strictEqual(res_.categoria_contable, 'CARNE');
    assert.strictEqual(pollo.orden_visual, 1);
    assert.strictEqual(res_.orden_visual, 2);

    // Lista de terceros refleja productos_count
    r = await call(port, 'GET', '/api/terceros');
    assert.strictEqual(r.body.terceros[0].productos_count, 2);

    // Reemplazo: solo Pollo (con id, precio nuevo) → Res queda soft-deleted
    r = await call(port, 'PUT', `/api/terceros/${id}/productos`, {
      productos: [{ id: pollo.id, producto: 'Pollo', unidad: 'KG', cantidad_default: 12, precio_actual: 90 }]
    });
    assert.strictEqual(r.status, 200);
    const rows = db.prepare('SELECT id, producto, precio_actual, deleted FROM proveedor_productos WHERE proveedor_id = ?').all(id);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows.find(x => x.id === pollo.id).precio_actual, 90);
    assert.strictEqual(rows.find(x => x.id === pollo.id).deleted, 0);
    assert.strictEqual(rows.find(x => x.id === res_.id).deleted, 1);

    // Proveedor inexistente → 404
    r = await call(port, 'PUT', '/api/terceros/no-existe/productos', { productos: [] });
    assert.strictEqual(r.status, 404);
  } finally { server.close(); }
});

test('terceros: DELETE bloqueado con cxp asociada (400) y OK sin dependencias (soft-delete en cascada)', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/terceros', { nombre: 'Proveedor D', tipo: 'PROVEEDOR' });
    const id = r.body.id;
    await call(port, 'PUT', `/api/terceros/${id}/productos`, { productos: [{ producto: 'Queso' }] });

    db.prepare("INSERT INTO cxp (id, tercero_id, concepto, fecha_creacion, updated_at, deleted) VALUES ('cx1', ?, 'Factura', '2026-09-01', 0, 0)").run(id);
    r = await call(port, 'DELETE', `/api/terceros/${id}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Tiene 1 cuentas asociadas');

    db.prepare("UPDATE cxp SET deleted = 1 WHERE id = 'cx1'").run();
    r = await call(port, 'DELETE', `/api/terceros/${id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT deleted FROM terceros WHERE id = ?').get(id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM proveedor_productos WHERE proveedor_id = ?').get(id).deleted, 1);

    // Ya no aparece en la lista ni se puede borrar de nuevo
    r = await call(port, 'GET', '/api/terceros');
    assert.deepStrictEqual(r.body.terceros, []);
    r = await call(port, 'DELETE', `/api/terceros/${id}`);
    assert.strictEqual(r.status, 404);
  } finally { server.close(); }
});
