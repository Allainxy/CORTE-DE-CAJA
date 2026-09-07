// Test de integración del router extraído (routes/ventas.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Sigue la
// plantilla de cxp.test.js (#6).
//
// NOTA SOBRE LOS ESQUEMAS: cajas y groups se copiaron de server.js
// (CREATE TABLE IF NOT EXISTS cajas / groups); movs y cats de init-db.js
// (movs + la columna afecta_saldo que server.js agrega por migración, igual que
// hace cxp.test.js). Las 5 tablas de ventas (ventas, ventas_detalle_cortes,
// ventas_cierres_dia, ventas_rutas, vendedores) NO tienen CREATE TABLE en el
// repo — se crean por migración fuera de estos archivos — así que sus columnas
// se reconstruyeron literalmente de los INSERT/SELECT de server.js y
// ventas-cierres-dia.js (ver notas del extract).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountVentas = require('../routes/ventas');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  canal TEXT NOT NULL,
  ruta TEXT,
  vendedor_id TEXT,
  cliente TEXT,
  numero_pedido TEXT,
  comentario TEXT,
  importe REAL NOT NULL,
  caja_id TEXT,
  mov_id TEXT,
  origen TEXT,
  usuario TEXT,
  user_id TEXT,
  created_at INTEGER,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ventas_detalle_cortes (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  ruta TEXT NOT NULL,
  vendedor_id TEXT,
  vendedor_nombre TEXT,
  venta_sistema REAL DEFAULT 0,
  efectivo REAL DEFAULT 0,
  transferencia REAL DEFAULT 0,
  credito REAL DEFAULT 0,
  gastos REAL DEFAULT 0,
  devoluciones REAL DEFAULT 0,
  gasolina REAL DEFAULT 0,
  diferencia REAL DEFAULT 0,
  caja_efectivo_id TEXT,
  caja_banco_id TEXT,
  mov_efectivo_id TEXT,
  mov_transferencia_id TEXT,
  mov_credito_id TEXT,
  mov_gastos_id TEXT,
  mov_devoluciones_id TEXT,
  mov_gasolina_id TEXT,
  comentario TEXT,
  usuario TEXT,
  user_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ventas_cierres_dia (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'TODOS',
  bloqueado_at INTEGER,
  bloqueado_por_id TEXT,
  bloqueado_por_nombre TEXT,
  comentario TEXT,
  desbloqueado_at INTEGER,
  desbloqueado_por_id TEXT,
  desbloqueado_por_nombre TEXT,
  desbloqueado_motivo TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ventas_rutas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  activa INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vendedores (
  id TEXT PRIMARY KEY,
  sys_code TEXT,
  nombre TEXT NOT NULL,
  ruta_default TEXT,
  telefono TEXT,
  notas TEXT,
  tipo TEXT DEFAULT 'AUTOVENTA',
  activo INTEGER DEFAULT 1,
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
  afecta_saldo INTEGER DEFAULT 1
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
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
`;

function setup(rol = 'admin') {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  const now = Date.now();
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at, deleted) VALUES ('caja-principal', 'EFECTIVO', 'Caja Principal', ?, 0)").run(now);
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at, deleted) VALUES ('caja-banco', 'BANCO', 'Cuenta Banco', ?, 0)").run(now);
  db.prepare("INSERT INTO cajas (id, tipo, nombre, archivada, updated_at, deleted) VALUES ('caja-vieja', 'EFECTIVO', 'Caja Archivada', 1, ?, 0)").run(now);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol }; next(); };
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountVentas(app, db, {
    requireAuth: pass, requirePin: pass, requireAdmin: pass,
    audit: () => {}, newId, userCanUseCaja: () => true, log: () => {},
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

test('ventas: listados vacios -> 200; catalogos de rutas y vendedores; reportes/totales', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/ventas');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/ventas/rutas');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/ventas/vendedores');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/ventas/cortes/detalle');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/ventas/reportes/totales');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.rangos.hoy);
    for (const k of ['hoy', 'semana', 'mes', 'anio']) {
      assert.strictEqual(r.body[k].total, 0);
      assert.strictEqual(r.body[k].n, 0);
      assert.deepStrictEqual(r.body[k].por_canal, []);
    }

    // Catalogo de rutas: crear, reactivar idempotente, editar, soft-delete
    r = await call(port, 'POST', '/api/ventas/rutas', { nombre: ' ruta 1 ' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.nombre, 'RUTA 1'); // trim + uppercase
    assert.strictEqual(r.body.activa, 1);
    const rutaId = r.body.id;

    r = await call(port, 'POST', '/api/ventas/rutas', { nombre: 'RUTA 1' });
    assert.strictEqual(r.body.id, rutaId); // no duplica

    r = await call(port, 'DELETE', `/api/ventas/rutas/${rutaId}`);
    assert.strictEqual(r.status, 200);
    r = await call(port, 'GET', '/api/ventas/rutas');
    assert.deepStrictEqual(r.body, []); // inactiva no aparece
    r = await call(port, 'GET', '/api/ventas/rutas?todas=1');
    assert.strictEqual(r.body.length, 1);
    assert.strictEqual(r.body[0].activa, 0);

    r = await call(port, 'PUT', `/api/ventas/rutas/${rutaId}`, { activa: 1 });
    assert.strictEqual(r.body.activa, 1);

    // Catalogo de vendedores
    r = await call(port, 'POST', '/api/ventas/vendedores', { nombre: 'Juan Perez', ruta_default: 'RUTA 1', tipo: 'DISTRIBUIDOR' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.tipo, 'DISTRIBUIDOR');
    assert.strictEqual(r.body.activo, 1);
    assert.ok(r.body.id.startsWith('vd-'));
    const vdId = r.body.id;

    r = await call(port, 'PUT', `/api/ventas/vendedores/${vdId}`, { nombre: 'Juan P.', tipo: 'BASURA' });
    assert.strictEqual(r.body.nombre, 'Juan P.');
    assert.strictEqual(r.body.tipo, 'AUTOVENTA'); // tipo invalido cae a AUTOVENTA

    r = await call(port, 'GET', '/api/ventas/vendedores');
    assert.strictEqual(r.body.length, 1);
  } finally { server.close(); }
});

test('ventas: POST /api/ventas crea venta + mov INGRESO, auto-registra ruta y categoria; totales-dia desglosa efectivo/transferencia', async () => {
  const { db, server, port } = setup();
  try {
    // DETALLE en caja EFECTIVO -> mov metodo EFECTIVO, ruta auto-registrada
    let r = await call(port, 'POST', '/api/ventas', {
      canal: 'detalle', ruta: ' ruta 7 ', importe: 100.5, caja_id: 'caja-principal',
      fecha: '2026-09-01', cliente: 'Tienda Ana', comentario: 'nota libre',
    });
    assert.strictEqual(r.status, 200);
    const ventaId = r.body.id;
    assert.ok(ventaId.startsWith('v-'));
    assert.strictEqual(r.body.canal, 'DETALLE');
    assert.strictEqual(r.body.ruta, 'RUTA 7');
    assert.strictEqual(r.body.caja_nombre, 'Caja Principal');

    // Verificacion directa en BD
    const row = db.prepare('SELECT * FROM ventas WHERE id = ?').get(ventaId);
    assert.strictEqual(row.importe, 100.5);
    assert.strictEqual(row.origen, 'modulo-ventas');
    assert.strictEqual(row.usuario, 'Test');
    assert.strictEqual(row.user_id, 'u');
    assert.strictEqual(row.deleted, 0);

    const mov = db.prepare('SELECT * FROM movs WHERE id = ?').get(row.mov_id);
    assert.strictEqual(mov.tipo, 'INGRESO');
    assert.strictEqual(mov.monto, 100.5);
    assert.strictEqual(mov.metodo, 'EFECTIVO');
    assert.strictEqual(mov.caja, 'caja-principal');
    assert.strictEqual(mov.src, 'venta');
    assert.strictEqual(mov.categoria, 'VENTAS - DETALLE');
    assert.strictEqual(mov.concepto, 'VENTA DETALLE · RUTA 7 · Tienda Ana');

    // ensureCategoriaVenta creo la categoria y el grupo INGRESO
    const cat = db.prepare("SELECT * FROM cats WHERE nombre = 'VENTAS - DETALLE'").get();
    assert.strictEqual(cat.tipo, 'INGRESO');
    assert.ok(cat.group_id);
    assert.strictEqual(db.prepare('SELECT tipo FROM groups WHERE id = ?').get(cat.group_id).tipo, 'INGRESO');

    // La ruta se auto-registro en el catalogo
    assert.strictEqual(db.prepare("SELECT activa FROM ventas_rutas WHERE nombre = 'RUTA 7'").get().activa, 1);

    // MAYOREO en caja BANCO -> mov metodo TRANSFERENCIA, origen captura-rapida
    r = await call(port, 'POST', '/api/ventas', {
      canal: 'MAYOREO', importe: 250, caja_id: 'caja-banco', fecha: '2026-09-01', origen: 'captura-rapida',
    });
    assert.strictEqual(r.status, 200);
    const mov2 = db.prepare('SELECT * FROM movs WHERE id = ?').get(r.body.mov_id);
    assert.strictEqual(mov2.metodo, 'TRANSFERENCIA');
    assert.strictEqual(mov2.src, 'venta-rapida');
    assert.strictEqual(mov2.concepto, 'VENTA MAYOREO [CAPTURA RÁPIDA]');

    // GET detalle por HTTP
    r = await call(port, 'GET', `/api/ventas/${ventaId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.id, ventaId);
    assert.strictEqual(r.body.caja_nombre, 'Caja Principal');

    // Listado + filtros
    r = await call(port, 'GET', '/api/ventas');
    assert.strictEqual(r.body.length, 2);
    r = await call(port, 'GET', '/api/ventas?canal=detalle');
    assert.strictEqual(r.body.length, 1);
    r = await call(port, 'GET', `/api/ventas?ruta=${encodeURIComponent('ruta 7')}`);
    assert.strictEqual(r.body.length, 1);
    r = await call(port, 'GET', '/api/ventas?cliente=Ana');
    assert.strictEqual(r.body.length, 1);
    r = await call(port, 'GET', '/api/ventas?desde=2026-09-02');
    assert.strictEqual(r.body.length, 0);

    // totales-dia: DETALLE efectivo 100.5, MAYOREO transferencia 250
    r = await call(port, 'GET', '/api/ventas/totales-dia?fecha=2026-09-01');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.fecha, '2026-09-01');
    assert.strictEqual(r.body.por_canal.length, 4);
    const porCanal = Object.fromEntries(r.body.por_canal.map(c => [c.canal, c]));
    assert.strictEqual(porCanal.DETALLE.efectivo, 100.5);
    assert.strictEqual(porCanal.DETALLE.transferencia, 0);
    assert.strictEqual(porCanal.MAYOREO.transferencia, 250);
    assert.strictEqual(porCanal.MAYOREO.efectivo, 0);
    assert.strictEqual(porCanal.DULCERIA.count, 0);
    assert.strictEqual(porCanal.MAQUILA.count, 0);
    assert.strictEqual(r.body.gran_total.count, 2);
    assert.strictEqual(r.body.gran_total.venta_sistema, 350.5);

    // DELETE venta: soft-delete de venta y su mov
    r = await call(port, 'DELETE', `/api/ventas/${ventaId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(db.prepare('SELECT deleted FROM ventas WHERE id = ?').get(ventaId).deleted, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(row.mov_id).deleted, 1);
    r = await call(port, 'GET', '/api/ventas');
    assert.strictEqual(r.body.length, 1);
  } finally { server.close(); }
});

test('ventas: validaciones -> 400/404 con los mensajes exactos del bloque original', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/ventas', { canal: 'PIRATA', importe: 10, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'canal inválido');

    r = await call(port, 'POST', '/api/ventas', { canal: 'MAYOREO', importe: 0, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'importe debe ser > 0');

    r = await call(port, 'POST', '/api/ventas', { canal: 'MAYOREO', importe: 10 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_id requerida');

    r = await call(port, 'POST', '/api/ventas', { canal: 'MAYOREO', importe: 10, caja_id: 'no-existe' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja no existe o está eliminada');

    r = await call(port, 'POST', '/api/ventas', { canal: 'MAYOREO', importe: 10, caja_id: 'caja-vieja' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja archivada, no se puede usar');

    r = await call(port, 'POST', '/api/ventas', { canal: 'DETALLE', importe: 10, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'ruta requerida para DETALLE');

    // Ningun intento fallido dejo basura en BD
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM ventas').get().n, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs').get().n, 0);

    r = await call(port, 'GET', '/api/ventas/no-existe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'no existe');

    r = await call(port, 'DELETE', '/api/ventas/no-existe');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'venta no existe');

    r = await call(port, 'POST', '/api/ventas/rutas', { nombre: '   ' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'nombre requerido');

    r = await call(port, 'PUT', '/api/ventas/rutas/9999', { nombre: 'X' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'ruta no existe');

    r = await call(port, 'POST', '/api/ventas/vendedores', { nombre: '' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'nombre requerido');

    r = await call(port, 'PUT', '/api/ventas/vendedores/no-existe', { nombre: 'X' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'vendedor no existe');

    r = await call(port, 'GET', '/api/ventas/totales-dia?fecha=01-09-2026');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'fecha requerida (YYYY-MM-DD)');

    r = await call(port, 'POST', '/api/ventas/cortes/detalle', { fecha: '2026-09-01', ruta: '' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'ruta requerida');

    r = await call(port, 'POST', '/api/ventas/cortes/detalle', { fecha: '2026-09-01', ruta: 'RUTA 1', efectivo: 100 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_efectivo_id requerida si hay efectivo');

    r = await call(port, 'POST', '/api/ventas/cortes/detalle', { fecha: '2026-09-01', ruta: 'RUTA 1', gasolina: 50 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_efectivo_id requerida si hay gastos o gasolina');

    r = await call(port, 'DELETE', '/api/ventas/cortes/detalle/no-existe');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'corte no existe');
  } finally { server.close(); }
});

// HOTFIX_ROUTE_ORDER_CIERRES_DIA — el mount de ventas-cierres-dia va ANTES de
// app.get('/api/ventas/:id'). Si se registrara despues, Express matchearia
// /api/ventas/cierres-dia como :id y devolveria 404 {error:'no existe'}.
test('ventas: GET /api/ventas/cierres-dia NO cae en el handler de /api/ventas/:id (guard del HOTFIX)', async () => {
  const { server, port } = setup();
  try {
    const r = await call(port, 'GET', '/api/ventas/cierres-dia?fecha=2026-09-01');

    // Lo que pasaria si el orden de registro estuviera roto:
    assert.notStrictEqual(r.status, 404);
    assert.notStrictEqual(r.body && r.body.error, 'no existe');

    // Shape real de cierres-dia
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['cerrado', 'cierre', 'fecha', 'historial']);
    assert.strictEqual(r.body.fecha, '2026-09-01');
    assert.strictEqual(r.body.cerrado, false);
    assert.strictEqual(r.body.cierre, null);
    assert.deepStrictEqual(r.body.historial, []);

    // La validacion propia de cierres-dia responde (no la de /api/ventas/:id)
    const bad = await call(port, 'GET', '/api/ventas/cierres-dia?fecha=nope');
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, 'fecha requerida (YYYY-MM-DD)');

    // Contraste: un id inventado SI cae en /api/ventas/:id
    const noVenta = await call(port, 'GET', '/api/ventas/cierres-dias');
    assert.strictEqual(noVenta.status, 404);
    assert.strictEqual(noVenta.body.error, 'no existe');

    // Las rutas hermanas del mount tambien responden (POST /cerrar)
    const cerrar = await call(port, 'POST', '/api/ventas/cierres-dia/cerrar', { fecha: '2026-09-01' });
    assert.strictEqual(cerrar.status, 200);
    assert.strictEqual(cerrar.body.ok, true);
  } finally { server.close(); }
});

test('ventas: corte de detalle crea movs (efectivo INGRESO, gastos/gasolina GASTO afecta_saldo=0) y respeta el guard de dia cerrado (423)', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/ventas/vendedores', { nombre: 'Pedro Ruta', ruta_default: 'RUTA 3' });
    const vdId = r.body.id;

    r = await call(port, 'POST', '/api/ventas/cortes/detalle', {
      fecha: '2026-09-02', ruta: 'ruta 3', vendedor_id: vdId,
      venta_sistema: 1000, efectivo: 700, transferencia: 100, tarjetas: 50,
      cheque_vale: 25, credito: 100, gastos: 60, gasolina: 40, devoluciones: 10,
      caja_efectivo_id: 'caja-principal', comentario: 'corte del dia',
    });
    assert.strictEqual(r.status, 200);
    const corteId = r.body.id;
    assert.ok(corteId.startsWith('cd-'));
    assert.strictEqual(r.body.ruta, 'RUTA 3');
    assert.strictEqual(r.body.vendedor_nombre, 'Pedro Ruta'); // resuelto desde vendedores

    // diferencia = (efectivo+transf+cheque_vale+tarjetas+credito+gastos) - venta_sistema
    const corte = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ?').get(corteId);
    assert.strictEqual(corte.diferencia, 35);
    assert.strictEqual(corte.efectivo, 700);
    // cheque_vale y tarjetas se persisten como tag en el comentario
    assert.strictEqual(corte.comentario, 'corte del dia [cheque/vale=25.00; tarjetas=50.00]');

    // Solo efectivo, gastos y gasolina generan mov; transferencia/credito/tarjetas/cheque no
    assert.ok(corte.mov_efectivo_id);
    assert.ok(corte.mov_gastos_id);
    assert.ok(corte.mov_gasolina_id);
    assert.strictEqual(corte.mov_transferencia_id, null);
    assert.strictEqual(corte.mov_credito_id, null);
    assert.strictEqual(corte.mov_devoluciones_id, null);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE deleted = 0').get().n, 3);

    const movEfec = db.prepare('SELECT * FROM movs WHERE id = ?').get(corte.mov_efectivo_id);
    assert.strictEqual(movEfec.tipo, 'INGRESO');
    assert.strictEqual(movEfec.monto, 700);
    assert.strictEqual(movEfec.afecta_saldo, 1);
    assert.strictEqual(movEfec.src, 'venta-detalle');
    assert.strictEqual(movEfec.categoria, 'VENTAS - DETALLE');
    assert.strictEqual(movEfec.concepto, 'Corte RUTA 3 · Pedro Ruta (efectivo)');

    const movGas = db.prepare('SELECT * FROM movs WHERE id = ?').get(corte.mov_gastos_id);
    assert.strictEqual(movGas.tipo, 'GASTO');
    assert.strictEqual(movGas.categoria, 'GASTOS DE RUTA');
    assert.strictEqual(movGas.afecta_saldo, 0); // no mueve la caja fisica
    assert.strictEqual(db.prepare('SELECT categoria FROM movs WHERE id = ?').get(corte.mov_gasolina_id).categoria, 'GASOLINA');

    // Update idempotente por id: borra los movs previos y los recrea
    r = await call(port, 'POST', '/api/ventas/cortes/detalle', {
      id: corteId, fecha: '2026-09-02', ruta: 'RUTA 3', vendedor_id: vdId,
      venta_sistema: 1000, efectivo: 1000, caja_efectivo_id: 'caja-principal',
    });
    assert.strictEqual(r.status, 200);
    const corte2 = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ?').get(corteId);
    assert.strictEqual(corte2.diferencia, 0);
    assert.strictEqual(corte2.efectivo, 1000);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(corte.mov_efectivo_id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE deleted = 0').get().n, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM ventas_detalle_cortes WHERE deleted = 0').get().n, 1);

    r = await call(port, 'GET', `/api/ventas/cortes/detalle?ruta=${encodeURIComponent('ruta 3')}`);
    assert.strictEqual(r.body.length, 1);
    assert.strictEqual(r.body[0].vendedor_nombre_actual, 'Pedro Ruta');

    // Cerrar el dia -> POST y DELETE de cortes deben responder 423
    r = await call(port, 'POST', '/api/ventas/cierres-dia/cerrar', { fecha: '2026-09-02' });
    assert.strictEqual(r.status, 200);

    r = await call(port, 'POST', '/api/ventas/cortes/detalle', {
      fecha: '2026-09-02', ruta: 'RUTA 9', venta_sistema: 10, efectivo: 10, caja_efectivo_id: 'caja-principal',
    });
    assert.strictEqual(r.status, 423);
    assert.match(r.body.error, /^El día 2026-09-02 está cerrado\./);

    r = await call(port, 'DELETE', `/api/ventas/cortes/detalle/${corteId}`);
    assert.strictEqual(r.status, 423);
    assert.match(r.body.error, /^El día 2026-09-02 está cerrado\./);
    assert.strictEqual(db.prepare('SELECT deleted FROM ventas_detalle_cortes WHERE id = ?').get(corteId).deleted, 0);

    // Reabrir -> DELETE vuelve a funcionar y cascadea los movs vivos
    r = await call(port, 'POST', '/api/ventas/cierres-dia/reabrir', { fecha: '2026-09-02', motivo: 'correccion' });
    assert.strictEqual(r.status, 200);

    r = await call(port, 'DELETE', `/api/ventas/cortes/detalle/${corteId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.movsBorrados, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM ventas_detalle_cortes WHERE id = ?').get(corteId).deleted, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE deleted = 0').get().n, 0);

    // reportes/totales suma ventas simples + cortes (el corte ya esta borrado)
    r = await call(port, 'GET', '/api/ventas/reportes/totales');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.anio.total, 0);
  } finally { server.close(); }
});
