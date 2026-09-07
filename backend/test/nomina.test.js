// Test de integración del router extraído (routes/nomina.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Sigue la
// plantilla de cxp.test.js (#6).
//
// NOTA sobre el esquema: las tablas de nómina (departamentos, empleados,
// nominas_periodos, nominas_pagos, prestamos, prestamos_abonos,
// comisiones_tabla, bonos_config) NO tienen CREATE TABLE en el repo — se
// crearon fuera de server.js / init-db.js. Sus columnas se reconstruyeron
// literalmente de los INSERT/UPDATE/SELECT del bloque extraído (server.js
// 3808-4829) más nomina-pagos-individuales.js (pagado/pagado_at/pagado_por).
// movs, cajas, cats y groups sí están copiadas de init-db.js + las columnas que
// server.js agrega por migración (igual que en cxp.test.js).
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountNomina = require('../routes/nomina');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria_nomina TEXT,
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS empleados (
  id TEXT PRIMARY KEY,
  numero INTEGER,
  nombre TEXT NOT NULL,
  departamento_id TEXT,
  tipo TEXT DEFAULT 'PLANTA',
  sueldo_base REAL DEFAULT 0,
  vendedor_id TEXT,
  fecha_ingreso TEXT,
  telefono TEXT,
  banco TEXT,
  cuenta TEXT,
  notas TEXT,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comisiones_tabla (
  id TEXT PRIMARY KEY,
  venta_minima REAL DEFAULT 0,
  pct_comision REAL DEFAULT 0,
  bono_meta REAL DEFAULT 0,
  orden INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bonos_config (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'RANKING',
  posicion REAL DEFAULT 0,
  monto REAL DEFAULT 0,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS nominas_periodos (
  id TEXT PRIMARY KEY,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  fecha_pago TEXT NOT NULL,
  comisiones_desde TEXT,
  comisiones_hasta TEXT,
  bono_mensual_mes TEXT,
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  total_nomina REAL DEFAULT 0,
  empleados_pagados INTEGER DEFAULT 0,
  caja_id TEXT,
  comentario TEXT,
  usuario TEXT,
  user_id TEXT,
  cerrado_at INTEGER,
  cerrado_por TEXT,
  created_at INTEGER,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS nominas_pagos (
  id TEXT PRIMARY KEY,
  periodo_id TEXT NOT NULL,
  empleado_id TEXT,
  empleado_nombre TEXT,
  departamento_id TEXT,
  departamento_nombre TEXT,
  categoria_nomina TEXT,
  caja_id TEXT,
  neto REAL DEFAULT 0,
  comisiones REAL DEFAULT 0,
  comisiones_detalle TEXT,
  prestamos_abonados REAL DEFAULT 0,
  total REAL DEFAULT 0,
  orden INTEGER DEFAULT 0,
  mov_id TEXT,
  comentario TEXT,
  pagado INTEGER DEFAULT 0,
  pagado_at INTEGER,
  pagado_por TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prestamos (
  id TEXT PRIMARY KEY,
  empleado_id TEXT NOT NULL,
  empleado_nombre TEXT,
  fecha TEXT NOT NULL,
  monto_original REAL NOT NULL,
  saldo_actual REAL NOT NULL,
  abono_sugerido_semanal REAL DEFAULT 0,
  motivo TEXT,
  caja_origen TEXT,
  metodo TEXT DEFAULT 'EFECTIVO',
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  mov_entrega_id TEXT,
  fecha_saldado TEXT,
  comentario TEXT,
  usuario TEXT,
  user_id TEXT,
  created_at INTEGER,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prestamos_abonos (
  id TEXT PRIMARY KEY,
  prestamo_id TEXT NOT NULL,
  periodo_id TEXT,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL,
  metodo TEXT DEFAULT 'EFECTIVO',
  caja_id TEXT,
  mov_id TEXT,
  comentario TEXT,
  usuario TEXT,
  user_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vendedores (
  id TEXT PRIMARY KEY,
  sys_code TEXT,
  nombre TEXT NOT NULL,
  ruta_default TEXT,
  telefono TEXT,
  notas TEXT,
  tipo TEXT,
  activo INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  canal TEXT,
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
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ventas_detalle_cortes (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  ruta TEXT,
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
CREATE TABLE groups (
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
  db.prepare("INSERT INTO groups (id, tipo, nombre, updated_at, deleted) VALUES ('g-nomina', 'GASTO', 'NOMINA', ?, 0)").run(now);
  db.prepare("INSERT INTO vendedores (id, nombre, activo, updated_at, deleted) VALUES ('vd1', 'ANA LOPEZ', 1, ?, 0)").run(now);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol }; next(); };
  const newId = (p = '') => p + Math.random().toString(36).slice(2);
  mountNomina(app, db, {
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

// Réplica exacta de los helpers de fechas del bloque, para calcular en el test
// la misma ventana de comisiones que calcula POST /api/nomina/periodos.
function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function lunesDe(fechaPago) {
  const dPago = new Date(fechaPago + 'T12:00:00');
  const dow = dPago.getDay();
  const lunes = new Date(dPago);
  lunes.setDate(lunes.getDate() + (dow === 0 ? -6 : 1 - dow));
  return lunes.toISOString().slice(0, 10);
}

test('nomina: GET de listados vacios -> 200 con [] y stats en cero', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/nomina/departamentos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/empleados');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/comisiones-tabla');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/bonos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/periodos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/prestamos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, []);

    r = await call(port, 'GET', '/api/nomina/stats');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.periodo_abierto, undefined); // .get() sin filas -> undefined -> se omite en el JSON
    assert.strictEqual(r.body.empleados_activos, 0);
    assert.deepStrictEqual(r.body.prestamos_activos, { n: 0, saldo: 0 });
  } finally { server.close(); }
});

test('nomina: alta depto + empleados, periodo con comisiones y cierre (verificacion en BD)', async () => {
  const { db, server, port } = setup();
  try {
    // 1) Departamento: crea tambien la categoria GASTO "NOMINA VENTAS"
    let r = await call(port, 'POST', '/api/nomina/departamentos', { nombre: '  ventas  ', orden: 2 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.nombre, 'VENTAS');
    assert.strictEqual(r.body.categoria_nomina, 'NOMINA VENTAS');
    const deptId = r.body.id;
    assert.ok(deptId.startsWith('dept-'));
    const cat = db.prepare("SELECT * FROM cats WHERE nombre = 'NOMINA VENTAS' AND tipo = 'GASTO'").get();
    assert.ok(cat, 'debe crear la categoria GASTO del departamento');
    assert.strictEqual(cat.group_id, 'g-nomina');

    // 2) Escalon de comision: >= 10000 paga 5% + bono meta 200
    r = await call(port, 'POST', '/api/nomina/comisiones-tabla', { venta_minima: 10000, pct_comision: 0.05, bono_meta: 200 });
    assert.strictEqual(r.status, 200);

    // 3) Empleados (VENDEDOR vinculado a vd1 + PLANTA)
    r = await call(port, 'POST', '/api/nomina/empleados', { nombre: 'Ana Lopez', departamento_id: deptId, tipo: 'vendedor', sueldo_base: 1000, vendedor_id: 'vd1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.tipo, 'VENDEDOR');
    const anaId = r.body.id;
    r = await call(port, 'POST', '/api/nomina/empleados', { nombre: 'Juan Perez', departamento_id: deptId, sueldo_base: 2000 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.tipo, 'PLANTA');

    // 4) Ventas de la semana anterior para vd1 (12000 = 7000 efectivo + 5000 transferencia)
    const fechaPago = '2026-09-04';
    const fechaInicio = lunesDe(fechaPago);
    const comisionesDesde = addDaysISO(fechaInicio, -7);
    db.prepare(`INSERT INTO ventas_detalle_cortes (id, fecha, vendedor_id, efectivo, transferencia, updated_at, deleted)
      VALUES ('vdc1', ?, 'vd1', 7000, 5000, ?, 0)`).run(comisionesDesde, Date.now());

    // 5) Crear periodo -> precarga los 2 empleados activos con sugerencias
    r = await call(port, 'POST', '/api/nomina/periodos', { caja_id: 'caja-principal', fecha_pago: fechaPago });
    assert.strictEqual(r.status, 200);
    const periodoId = r.body.id;
    assert.ok(periodoId.startsWith('np-'));
    assert.strictEqual(r.body.estado, 'ABIERTO');
    assert.strictEqual(r.body.fecha_inicio, fechaInicio);
    assert.strictEqual(r.body.fecha_fin, addDaysISO(fechaInicio, 6));
    assert.strictEqual(r.body.comisiones_desde, comisionesDesde);
    assert.strictEqual(r.body.comisiones_hasta, addDaysISO(fechaInicio, -1));
    assert.strictEqual(r.body.caja_nombre, 'Caja Principal');

    // Verificacion directa en BD de los pagos precargados
    const pagos = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ? AND deleted = 0 ORDER BY orden').all(periodoId);
    assert.strictEqual(pagos.length, 2);
    const ana = pagos.find(p => p.empleado_id === anaId);
    assert.strictEqual(ana.neto, 1000);
    assert.strictEqual(ana.comisiones, 800);   // 12000 * 0.05 + 200
    assert.strictEqual(ana.total, 1800);
    assert.strictEqual(ana.categoria_nomina, 'NOMINA VENTAS');
    const detalle = JSON.parse(ana.comisiones_detalle);
    assert.strictEqual(detalle.ventas_s1, 12000);
    assert.strictEqual(detalle.comision_base, 600);
    assert.strictEqual(detalle.bono_meta, 200);
    const juan = pagos.find(p => p.empleado_id !== anaId);
    assert.strictEqual(juan.total, 2000);
    assert.strictEqual(juan.comisiones, 0);

    // Detalle por HTTP
    r = await call(port, 'GET', `/api/nomina/periodos/${periodoId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.pagos.length, 2);

    // 6) Editar un pago (baja el neto de Juan)
    r = await call(port, 'PUT', `/api/nomina/pagos/${juan.id}`, { neto: 1500 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.total, 1500);

    // 7) Cerrar el periodo -> genera movs GASTO y marca todo pagado
    r = await call(port, 'POST', `/api/nomina/periodos/${periodoId}/cerrar`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.estado, 'CERRADO');
    assert.strictEqual(r.body.total_nomina, 3300); // 1800 + 1500
    assert.strictEqual(r.body.empleados_pagados, 2);

    const movs = db.prepare("SELECT * FROM movs WHERE src = 'nomina' AND deleted = 0 ORDER BY monto").all();
    assert.strictEqual(movs.length, 2);
    assert.strictEqual(movs[0].tipo, 'GASTO');
    assert.strictEqual(movs[0].monto, 1500);
    assert.strictEqual(movs[1].monto, 1800);
    assert.strictEqual(movs[1].categoria, 'NOMINA VENTAS');
    assert.strictEqual(movs[1].caja, 'caja-principal');
    assert.ok(movs[1].id.startsWith('m-nom-'));
    const pagosCerrados = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ?').all(periodoId);
    assert.ok(pagosCerrados.every(p => p.pagado === 1 && p.mov_id));
    assert.ok(pagosCerrados.every(p => p.pagado_por === 'Test'));

    // Ya cerrado: no se puede volver a cerrar ni borrar
    r = await call(port, 'POST', `/api/nomina/periodos/${periodoId}/cerrar`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'periodo ya está cerrado');
    r = await call(port, 'DELETE', `/api/nomina/periodos/${periodoId}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'no se puede eliminar un periodo CERRADO');
  } finally { server.close(); }
});

test('nomina: prestamo -> mov GASTO, abonos -> mov INGRESO y saldo, borrar abono revierte', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/nomina/empleados', { nombre: 'Luis Ruiz', sueldo_base: 1200 });
    const empId = r.body.id;

    r = await call(port, 'POST', '/api/nomina/prestamos', {
      empleado_id: empId, monto_original: 1000, caja_origen: 'caja-principal',
      abono_sugerido_semanal: 100, motivo: 'Emergencia medica',
    });
    assert.strictEqual(r.status, 200);
    const prId = r.body.id;
    assert.ok(prId.startsWith('pr-'));
    assert.strictEqual(r.body.estado, 'ACTIVO');
    assert.strictEqual(r.body.saldo_actual, 1000);
    assert.strictEqual(r.body.caja_origen_nombre, 'Caja Principal');

    const movEntrega = db.prepare('SELECT * FROM movs WHERE id = ?').get(r.body.mov_entrega_id);
    assert.strictEqual(movEntrega.tipo, 'GASTO');
    assert.strictEqual(movEntrega.categoria, 'PRESTAMOS EMPLEADOS');
    assert.strictEqual(movEntrega.monto, 1000);
    assert.strictEqual(movEntrega.src, 'prestamo');
    assert.strictEqual(movEntrega.concepto, 'Préstamo a Luis Ruiz');
    assert.ok(movEntrega.id.startsWith('m-pr-'));

    // Abono manual 400 -> INGRESO
    r = await call(port, 'POST', `/api/nomina/prestamos/${prId}/abonar`, { monto: 400, caja_id: 'caja-principal', comentario: 'quincena' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.saldo_actual, 600);
    assert.strictEqual(r.body.estado, 'ACTIVO');
    const ab1 = db.prepare('SELECT * FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0').get(prId);
    const movAbono = db.prepare('SELECT * FROM movs WHERE id = ?').get(ab1.mov_id);
    assert.strictEqual(movAbono.tipo, 'INGRESO');
    assert.strictEqual(movAbono.categoria, 'ABONO PRESTAMO EMPLEADO');
    assert.strictEqual(movAbono.src, 'abono-prestamo');
    assert.strictEqual(movAbono.concepto, 'Abono de Luis Ruiz');
    assert.ok(movAbono.id.startsWith('m-ab-'));

    // Exceso -> 400 con el mensaje original
    r = await call(port, 'POST', `/api/nomina/prestamos/${prId}/abonar`, { monto: 700, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'monto excede saldo (600)');

    // Saldar
    r = await call(port, 'POST', `/api/nomina/prestamos/${prId}/abonar`, { monto: 600, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.saldo_actual, 0);
    assert.strictEqual(r.body.estado, 'SALDADO');

    r = await call(port, 'POST', `/api/nomina/prestamos/${prId}/abonar`, { monto: 10, caja_id: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'préstamo no está activo');

    // Detalle con abonos
    r = await call(port, 'GET', `/api/nomina/prestamos/${prId}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.abonos.length, 2);
    const ab600 = r.body.abonos.find(a => a.monto === 600);

    // Editar abono (PIN) 600 -> 500: saldo vuelve a 100 y reactiva
    r = await call(port, 'PUT', `/api/nomina/prestamos/${prId}/abonos/${ab600.id}`, { monto: 500 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.saldo_actual, 100);
    assert.strictEqual(r.body.estado, 'ACTIVO');
    assert.strictEqual(db.prepare('SELECT monto FROM movs WHERE id = ?').get(ab600.mov_id).monto, 500);

    // Borrar abono (PIN): revierte su mov y devuelve el saldo
    r = await call(port, 'DELETE', `/api/nomina/prestamos/${prId}/abonos/${ab600.id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.saldo_actual, 600);
    assert.strictEqual(r.body.estado, 'ACTIVO');
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(ab600.mov_id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM prestamos_abonos WHERE id = ?').get(ab600.id).deleted, 1);

    // Cancelar prestamo: revierte entrega + abonos vivos
    r = await call(port, 'DELETE', `/api/nomina/prestamos/${prId}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { ok: true });
    assert.strictEqual(db.prepare('SELECT estado FROM prestamos WHERE id = ?').get(prId).estado, 'CANCELADO');
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(movEntrega.id).deleted, 1);
    assert.strictEqual(db.prepare('SELECT deleted FROM movs WHERE id = ?').get(ab1.mov_id).deleted, 1);
    r = await call(port, 'GET', '/api/nomina/prestamos');
    assert.deepStrictEqual(r.body, []);
  } finally { server.close(); }
});

test('nomina: validaciones y 404 conservan los mensajes originales', async () => {
  const { db, server, port } = setup();
  try {
    let r = await call(port, 'POST', '/api/nomina/departamentos', {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'nombre requerido');

    r = await call(port, 'POST', '/api/nomina/empleados', { nombre: '   ' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'nombre requerido');

    r = await call(port, 'POST', '/api/nomina/bonos', { tipo: 'OTRO' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'tipo inválido');

    r = await call(port, 'PUT', '/api/nomina/departamentos/no-existe', { nombre: 'X' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'dept no existe');

    r = await call(port, 'PUT', '/api/nomina/empleados/no-existe', { nombre: 'X' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'empleado no existe');

    r = await call(port, 'GET', '/api/nomina/periodos/no-existe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'periodo no existe');

    r = await call(port, 'PUT', '/api/nomina/pagos/no-existe', { neto: 1 });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'pago no existe');

    r = await call(port, 'GET', '/api/nomina/prestamos/no-existe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'no existe');

    // Periodos
    r = await call(port, 'POST', '/api/nomina/periodos', {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_id requerida');

    r = await call(port, 'POST', '/api/nomina/periodos', { caja_id: 'caja-fantasma' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja no existe');

    // Sin empleados activos: el periodo se crea pero no se puede cerrar
    r = await call(port, 'POST', '/api/nomina/periodos', { caja_id: 'caja-principal', fecha_pago: '2026-09-04' });
    assert.strictEqual(r.status, 200);
    const periodoId = r.body.id;
    r = await call(port, 'POST', `/api/nomina/periodos/${periodoId}/cerrar`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'no hay pagos en este periodo');

    // Segundo periodo ABIERTO sin force -> 400
    r = await call(port, 'POST', '/api/nomina/periodos', { caja_id: 'caja-principal', fecha_pago: '2026-09-11' });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /^Ya existe un periodo ABIERTO \(inició /);

    // Prestamos
    r = await call(port, 'POST', '/api/nomina/prestamos', {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'empleado_id requerido');

    r = await call(port, 'POST', '/api/nomina/prestamos', { empleado_id: 'nadie', monto_original: 100, caja_origen: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'empleado no existe');

    r = await call(port, 'POST', '/api/nomina/empleados', { nombre: 'Rosa Diaz' });
    const empId = r.body.id;
    r = await call(port, 'POST', '/api/nomina/prestamos', { empleado_id: empId, monto_original: 0, caja_origen: 'caja-principal' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'monto inválido');
    r = await call(port, 'POST', '/api/nomina/prestamos', { empleado_id: empId, monto_original: 500 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'caja_origen requerida');

    // hard-delete bloqueado si el empleado tiene prestamos vinculados
    r = await call(port, 'POST', '/api/nomina/prestamos', { empleado_id: empId, monto_original: 500, caja_origen: 'caja-principal' });
    assert.strictEqual(r.status, 200);
    r = await call(port, 'DELETE', `/api/nomina/empleados/${empId}?hard=1`);
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /registros vinculados/);
    // soft-delete si procede
    r = await call(port, 'DELETE', `/api/nomina/empleados/${empId}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { ok: true, hard: false });
    assert.strictEqual(db.prepare('SELECT deleted FROM empleados WHERE id = ?').get(empId).deleted, 1);
  } finally { server.close(); }
});
