// Test de integración del router extraído (routes/ordenes.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Sigue la
// plantilla de cxp.test.js / catalogo.test.js (#6).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountOrdenes = require('../routes/ordenes');

// Esquemas copiados de server.js (ordenes_compra, ordenes_compra_items,
// proveedor_productos, cxp, cxp_abonos, terceros, cajas) y de init-db.js
// (movs, cats). movs incluye ademas las columnas que server.js agrega por
// migración (cxp_id, created_at, abono_id, orden_id, afecta_saldo, import_id)
// y terceros las suyas (grupo_sugerido, categoria_sugerida, tipo_proveedor).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ordenes_compra (
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
);
CREATE TABLE IF NOT EXISTS ordenes_compra_items (
  id TEXT PRIMARY KEY,
  orden_id TEXT NOT NULL,
  producto TEXT NOT NULL,
  unidad TEXT DEFAULT 'KG',
  cantidad_estimada REAL DEFAULT 0,
  precio_estimado REAL DEFAULT 0,
  total_estimado REAL DEFAULT 0,
  cantidad_real REAL,
  precio_real REAL,
  total_real REAL,
  categoria_contable TEXT,
  notas TEXT,
  mov_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS proveedor_productos (
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
);
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
CREATE TABLE IF NOT EXISTS terceros (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'PROVEEDOR',
  categoria_id_sugerida TEXT,
  telefono TEXT,
  notas TEXT,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  grupo_sugerido TEXT,
  categoria_sugerida TEXT,
  tipo_proveedor TEXT DEFAULT 'PRODUCTO'
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
`;

const HOY = new Date().toISOString().slice(0, 10);

function setup(rol = 'admin') {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  const now = Date.now();
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at, deleted) VALUES ('caja-principal', 'EFECTIVO', 'Caja Principal', ?, 0)").run(now);
  db.prepare("INSERT INTO cajas (id, tipo, nombre, updated_at, deleted) VALUES ('caja-banco', 'BANCO', 'Banco BBVA', ?, 0)").run(now);
  db.prepare("INSERT INTO terceros (id, nombre, tipo, updated_at, deleted) VALUES ('t1', 'PROVEEDOR UNO', 'PROVEEDOR', ?, 0)").run(now);
  db.prepare("INSERT INTO cats (id, tipo, nombre, updated_at, deleted) VALUES ('cat-merc', 'GASTO', 'MERCANCIA', ?, 0)").run(now);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol }; next(); };
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountOrdenes(app, db, {
    requireAuth: pass, requirePin: pass, requireAdmin: pass,
    audit: () => {}, newId, userCanUseCaja: () => true,
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

// Orden base valida para POST /api/ordenes
function ordenBase(extra = {}) {
  return {
    proveedor_id: 't1', proveedor_nombre: 'PROVEEDOR UNO', comprador_nombre: 'Juan',
    caja_id: 'caja-principal', metodo_pago: 'EFECTIVO',
    items: [{ producto: 'HARINA', unidad: 'KG', cantidad_estimada: 10, precio_estimado: 100 }],
    ...extra,
  };
}

test('ordenes: GET /api/ordenes vacio -> 200 []; stats/resumen -> 200 en ceros; detalle inexistente -> 404', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/ordenes');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.ordenes, []);

    r = await call(port, 'GET', '/api/ordenes/stats/resumen');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.hoy, { total: 0, entregado: 0, real: 0 });
    assert.deepStrictEqual(r.body.mes, { total: 0, real: 0 });
    assert.deepStrictEqual(r.body.pendientes_pago, { count: 0, total: 0 });
    assert.strictEqual(r.body.borradores, 0);

    r = await call(port, 'GET', '/api/ordenes/no-existe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Orden no encontrada');
  } finally { server.close(); }
});

test('ordenes: POST crea BORRADOR con anticipo -> mov compra en BD, items filtrados, upsert catalogo proveedor; filtros de listado', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/ordenes', ordenBase({
      monto_entregado: 900, numero_orden: 'OC-001', observaciones: 'urgente',
      items: [
        { producto: 'HARINA', unidad: 'KG', cantidad_estimada: 10, precio_estimado: 100 },
        { producto: 'AZUCAR', unidad: 'KG', cantidad_estimada: 0, precio_estimado: 50 }, // se filtra
      ],
    }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    const id = r.body.orden.id;
    assert.ok(id.startsWith('ord-'));

    // Verificacion directa en BD
    const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(id);
    assert.strictEqual(row.estado, 'BORRADOR');
    assert.strictEqual(row.caja_nombre, 'Caja Principal'); // resuelto desde cajas
    assert.strictEqual(row.monto_estimado, 1000);
    assert.strictEqual(row.monto_entregado, 900);
    assert.strictEqual(row.monto_real, 0);
    assert.strictEqual(row.numero_orden, 'OC-001');

    // El item con cantidad 0 fue filtrado
    const items = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(id);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].producto, 'HARINA');
    assert.strictEqual(items[0].total_estimado, 1000);
    assert.strictEqual(items[0].categoria_contable, 'MERCANCIA');

    // Mov de anticipo
    const mov = db.prepare('SELECT * FROM movs WHERE id = ?').get(row.mov_salida_id);
    assert.strictEqual(mov.tipo, 'GASTO');
    assert.strictEqual(mov.categoria, 'MERCANCIA');
    assert.strictEqual(mov.monto, 900);
    assert.strictEqual(mov.src, 'compra');
    assert.strictEqual(mov.caja, 'caja-principal');
    assert.strictEqual(mov.orden_id, id);
    assert.strictEqual(mov.concepto, 'Compra a PROVEEDOR UNO · Juan');
    assert.strictEqual(mov.notas, `Anticipo de orden ${id}`);

    // Upsert al catalogo del proveedor (solo el item guardado)
    const pp = db.prepare('SELECT * FROM proveedor_productos WHERE proveedor_id = ? AND deleted = 0').all('t1');
    assert.strictEqual(pp.length, 1);
    assert.strictEqual(pp[0].producto, 'HARINA');
    assert.strictEqual(pp[0].precio_actual, 100);

    // Detalle por HTTP
    r = await call(port, 'GET', `/api/ordenes/${id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.items.length, 1);

    // Listado + filtros
    r = await call(port, 'GET', '/api/ordenes');
    assert.strictEqual(r.body.ordenes.length, 1);
    assert.strictEqual(r.body.ordenes[0].items.length, 1);
    r = await call(port, 'GET', '/api/ordenes?estado=BORRADOR&proveedor_id=t1');
    assert.strictEqual(r.body.ordenes.length, 1);
    r = await call(port, 'GET', '/api/ordenes?estado=PAGADA');
    assert.strictEqual(r.body.ordenes.length, 0);
    r = await call(port, 'GET', '/api/ordenes?fecha_desde=2099-01-01');
    assert.strictEqual(r.body.ordenes.length, 0);

    // Stats: la orden de hoy cuenta como borrador
    r = await call(port, 'GET', '/api/ordenes/stats/resumen');
    assert.strictEqual(r.body.hoy.total, 1);
    assert.strictEqual(r.body.hoy.entregado, 900);
    assert.strictEqual(r.body.borradores, 1);
  } finally { server.close(); }
});

test('ordenes: PUT edita BORRADOR (rehace anticipo e items) y POST /cerrar con anticipo suficiente -> PAGADA + movs por item + devolucion', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/ordenes', ordenBase({ monto_entregado: 500 }));
    const id = r.body.orden.id;
    const movAnticipo1 = db.prepare('SELECT mov_salida_id FROM ordenes_compra WHERE id = ?').get(id).mov_salida_id;

    // PUT: sube el anticipo a 1000 -> borra el mov anterior y crea uno nuevo
    r = await call(port, 'PUT', `/api/ordenes/${id}`, ordenBase({ monto_entregado: 1000 }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(movAnticipo1).deleted, 1);
    const row1 = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(id);
    assert.strictEqual(row1.monto_entregado, 1000);
    assert.notStrictEqual(row1.mov_salida_id, movAnticipo1);
    const mov2 = db.prepare('SELECT * FROM movs WHERE id = ?').get(row1.mov_salida_id);
    assert.strictEqual(mov2.monto, 1000);
    assert.strictEqual(mov2.notas, `Anticipo de orden ${id} (editado)`);
    // Items rehechos (los viejos quedan soft-deleted)
    const itemsVivos = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(id);
    assert.strictEqual(itemsVivos.length, 1);

    // CERRAR: real 10 x 90 = 900 < anticipo 1000 -> PAGADA, sobrante 100 devuelto
    r = await call(port, 'POST', `/api/ordenes/${id}/cerrar`, {
      items: [{ id: itemsVivos[0].id, cantidad_real: 10, precio_real: 90, categoria_contable: 'MERCANCIA' }],
      fecha_cierre: HOY,
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.estadoFinal, 'PAGADA');
    assert.strictEqual(r.body.cxpIdCreada, null);
    assert.strictEqual(r.body.movItemsCreados.length, 1);

    const row2 = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(id);
    assert.strictEqual(row2.estado, 'PAGADA');
    assert.strictEqual(row2.monto_real, 900);
    assert.strictEqual(row2.ajuste, -100);
    assert.strictEqual(row2.fecha_cierre, HOY);
    assert.strictEqual(row2.cxp_id, null);

    // El anticipo se reversa y se sustituye por movs por item
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(row1.mov_salida_id).deleted, 1);
    const movItem = db.prepare("SELECT * FROM movs WHERE orden_id = ? AND src = 'compra-item' AND deleted = 0").get(id);
    assert.strictEqual(movItem.tipo, 'GASTO');
    assert.strictEqual(movItem.monto, 900);
    assert.strictEqual(movItem.concepto, 'HARINA (10 KG) · PROVEEDOR UNO');
    assert.strictEqual(movItem.notas, `Orden ${id}`);
    assert.strictEqual(db.prepare('SELECT mov_id FROM ordenes_compra_items WHERE id = ?').get(itemsVivos[0].id).mov_id, movItem.id);

    // Devolucion del sobrante (INGRESO 100)
    const movDev = db.prepare('SELECT * FROM movs WHERE id = ?').get(row2.mov_ajuste_id);
    assert.strictEqual(movDev.tipo, 'INGRESO');
    assert.strictEqual(movDev.categoria, 'OTROS INGRESOS');
    assert.strictEqual(movDev.monto, 100);
    assert.strictEqual(movDev.src, 'compra-dev');
    assert.strictEqual(movDev.concepto, 'Devolución compra PROVEEDOR UNO');

    // El catalogo del proveedor toma el precio real
    const pp = db.prepare('SELECT * FROM proveedor_productos WHERE proveedor_id = ? AND deleted = 0').get('t1');
    assert.strictEqual(pp.precio_actual, 90);
    assert.strictEqual(pp.ultimo_precio_orden_id, id);
    assert.strictEqual(pp.ultimo_precio_fecha, HOY);

    // Ya cerrada: no se puede volver a editar ni cerrar
    r = await call(port, 'PUT', `/api/ordenes/${id}`, ordenBase());
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Solo se pueden editar órdenes en BORRADOR');
    r = await call(port, 'POST', `/api/ordenes/${id}/cerrar`, { items: [{ id: itemsVivos[0].id, cantidad_real: 1, precio_real: 1 }] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Solo se pueden cerrar órdenes en BORRADOR');
  } finally { server.close(); }
});

test('ordenes: validaciones -> 400; rol consulta -> 403; rutas sobre orden inexistente -> 404', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/ordenes', ordenBase({ proveedor_nombre: undefined }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Falta proveedor');

    r = await call(port, 'POST', '/api/ordenes', ordenBase({ caja_id: undefined }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Falta caja');

    r = await call(port, 'POST', '/api/ordenes', ordenBase({ metodo_pago: 'CHEQUE' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Método de pago inválido');

    r = await call(port, 'POST', '/api/ordenes', ordenBase({ items: [] }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Debe agregar al menos un producto');

    r = await call(port, 'POST', '/api/ordenes', ordenBase({ items: [{ producto: 'HARINA', cantidad_estimada: 0, precio_estimado: 10 }] }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Captura cantidad en al menos un producto para guardar la orden');

    r = await call(port, 'POST', '/api/ordenes', ordenBase({ monto_entregado: -5 }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Monto entregado no puede ser negativo');

    // Orden real en BORRADOR: no se puede pagar (aun no tiene CxP) ni cerrar sin items
    r = await call(port, 'POST', '/api/ordenes', ordenBase());
    const id = r.body.orden.id;
    r = await call(port, 'POST', `/api/ordenes/${id}/pagar`, { monto: 10, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Solo se pueden pagar órdenes en estado PENDIENTE_PAGO');

    r = await call(port, 'POST', `/api/ordenes/${id}/cerrar`, { items: [] });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Debe enviar items con valores reales');

    // 404 en las rutas por :id
    for (const [method, path] of [['PUT', ''], ['POST', '/cerrar'], ['POST', '/pagar'], ['POST', '/cancelar'], ['DELETE', '']]) {
      const rr = await call(port, method, `/api/ordenes/no-existe${path}`, ordenBase());
      assert.strictEqual(rr.status, 404, `${method} ${path}`);
      assert.strictEqual(rr.body.error, 'Orden no encontrada');
    }
  } finally { server.close(); }

  const consulta = setup('consulta');
  try {
    for (const [method, path] of [['POST', ''], ['PUT', '/x'], ['POST', '/x/cerrar'], ['POST', '/x/pagar'], ['POST', '/x/cancelar'], ['DELETE', '/x']]) {
      const r = await call(consulta.port, method, `/api/ordenes${path}`, ordenBase());
      assert.strictEqual(r.status, 403, `${method} ${path}`);
      assert.strictEqual(r.body.error, 'Sin permiso');
    }
  } finally { consulta.server.close(); }
});

test('ordenes: POST /cancelar y DELETE revierten movs e items', async () => {
  const { db, server, port } = setup();
  try {
    // Cancelar
    let r = await call(port, 'POST', '/api/ordenes', ordenBase({ monto_entregado: 300 }));
    const idCancelar = r.body.orden.id;
    r = await call(port, 'POST', `/api/ordenes/${idCancelar}/cancelar`, {});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(db.prepare('SELECT estado FROM ordenes_compra WHERE id = ?').get(idCancelar).estado, 'CANCELADA');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE orden_id = ? AND deleted = 0').get(idCancelar).n, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').get(idCancelar).n, 0);
    r = await call(port, 'POST', `/api/ordenes/${idCancelar}/cancelar`, {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Ya está cancelada');

    // Delete
    r = await call(port, 'POST', '/api/ordenes', ordenBase({ monto_entregado: 400 }));
    const idBorrar = r.body.orden.id;
    r = await call(port, 'DELETE', `/api/ordenes/${idBorrar}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.movs_revertidos, 1);
    assert.strictEqual(r.body.cxp_borrada, null);
    assert.strictEqual(db.prepare('SELECT deleted FROM ordenes_compra WHERE id = ?').get(idBorrar).deleted, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM movs WHERE orden_id = ? AND deleted = 0').get(idBorrar).n, 0);

    // La orden borrada ya no aparece ni por listado ni por detalle
    r = await call(port, 'GET', '/api/ordenes');
    assert.deepStrictEqual(r.body.ordenes.map(o => o.id), [idCancelar]);
    r = await call(port, 'GET', `/api/ordenes/${idBorrar}`);
    assert.strictEqual(r.status, 404);
  } finally { server.close(); }
});
