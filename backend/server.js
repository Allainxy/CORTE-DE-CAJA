// server.js — API REST para K-BOTANAS
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { round2, clampUpdatedAt } = require('./lib/money');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET no está definida. Configúrala en el entorno (ecosystem.config.js).'); process.exit(1); }
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'kbotanas.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Helper local para generar IDs anti-colisión (preserva prefijo, usa crypto.randomUUID si está disponible)
const newId = (p = '') => p + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
// round2 y clampUpdatedAt viven en ./lib/money (con tests en test/money.test.js).
// Tolerancia de reloj para el updated_at lógico del cliente (last-write-wins)
const SYNC_SKEW_MS = 5 * 60 * 1000;

try {
// ---------- Migraciones automáticas (idempotentes) ----------
// 0) Tabla app_settings (configuración global clave-valor; p.ej. clasificación
//    de categorías del Reporte Financiero). Compartida por todos los usuarios.
db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
)`);

// 1) Tabla groups (jerarquía contable)
db.exec(`CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);

// 2) Columna group_id en cats (idempotente: revisar si ya existe)
const catCols = db.prepare("PRAGMA table_info(cats)").all().map(c => c.name);
if (!catCols.includes('group_id')) {
  db.exec(`ALTER TABLE cats ADD COLUMN group_id TEXT`);
  console.log('🔧 Migración: columna group_id agregada a cats');
}

// 3) Tabla cajas (cuentas/cajas/tarjetas)
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

// 4) Columnas de transferencia en movs
const movCols = db.prepare("PRAGMA table_info(movs)").all().map(c => c.name);
if (!movCols.includes('transfer_id')) {
  db.exec(`ALTER TABLE movs ADD COLUMN transfer_id TEXT`);
  console.log('🔧 Migración: columna transfer_id agregada a movs');
}
if (!movCols.includes('caja_destino')) {
  db.exec(`ALTER TABLE movs ADD COLUMN caja_destino TEXT`);
  console.log('🔧 Migración: columna caja_destino agregada a movs');
}

// 5) Migración: crear "Caja Principal" si no existe y vincular movs viejos con caja='PRINCIPAL'
const cajaPrincipalExiste = db.prepare("SELECT id FROM cajas WHERE id = 'caja-principal'").get();
if (!cajaPrincipalExiste) {
  const movsConPrincipal = db.prepare("SELECT COUNT(*) AS n FROM movs WHERE caja = 'PRINCIPAL' AND deleted = 0").get();
  if (movsConPrincipal.n > 0) {
    db.prepare(`INSERT INTO cajas (id, tipo, nombre, saldo_inicial, fecha_inicial, permite_negativo, orden, icon, color, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
      .run('caja-principal', 'EFECTIVO', 'Caja Principal', 0, new Date().toISOString().slice(0, 10), 1, 0, '💵', '#2EC27E', Date.now());
    db.prepare(`UPDATE movs SET caja = 'caja-principal', updated_at = ? WHERE caja = 'PRINCIPAL' AND deleted = 0`)
      .run(Date.now());
    console.log(`🔧 Migración: Caja Principal creada y ${movsConPrincipal.n} movimientos vinculados`);
  }
}

// 6) Columnas nuevas en users (idempotente)
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('activo')) {
  db.exec(`ALTER TABLE users ADD COLUMN activo INTEGER DEFAULT 1`);
  console.log('🔧 Migración: columna activo agregada a users');
}
if (!userCols.includes('pin_hash')) {
  db.exec(`ALTER TABLE users ADD COLUMN pin_hash TEXT`);
  console.log('🔧 Migración: columna pin_hash agregada a users');
}
if (!userCols.includes('pin_attempts')) {
  db.exec(`ALTER TABLE users ADD COLUMN pin_attempts INTEGER DEFAULT 0`);
  console.log('🔧 Migración: columna pin_attempts agregada a users');
}
if (!userCols.includes('pin_locked_until')) {
  db.exec(`ALTER TABLE users ADD COLUMN pin_locked_until INTEGER DEFAULT 0`);
  console.log('🔧 Migración: columna pin_locked_until agregada a users');
}
if (!userCols.includes('last_login')) {
  db.exec(`ALTER TABLE users ADD COLUMN last_login INTEGER`);
  console.log('🔧 Migración: columna last_login agregada a users');
}
if (!userCols.includes('updated_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT 0`);
  console.log('🔧 Migración: columna updated_at agregada a users');
}

// 7) Tabla user_cajas (permisos por caja). 0 filas para un user = todas las cajas.
db.exec(`CREATE TABLE IF NOT EXISTS user_cajas (
  user_id TEXT NOT NULL,
  caja_id TEXT NOT NULL,
  PRIMARY KEY (user_id, caja_id)
)`);

// 8) Tabla audit_log (registro de borrados y acciones críticas)
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  user_id TEXT,
  user_nombre TEXT,
  rol TEXT,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id TEXT,
  detalle TEXT,
  pin_validado INTEGER DEFAULT 0
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts)`);

// 11) Tabla arqueos (conciliación física de cajas EFECTIVO)
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_arqueos_fecha ON arqueos(fecha)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_arqueos_caja ON arqueos(caja_id)`);

// 12) Tabla terceros (proveedores y clientes — catálogo simple)
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_terceros_tipo ON terceros(tipo)`);

// Migración terceros: agregar grupo_sugerido y categoria_sugerida (textual)
const tercerosCols = db.prepare("PRAGMA table_info(terceros)").all().map(c => c.name);
if (!tercerosCols.includes('grupo_sugerido')) {
  db.exec(`ALTER TABLE terceros ADD COLUMN grupo_sugerido TEXT`);
  console.log('🔧 Migración: columna grupo_sugerido agregada a terceros');
}
if (!tercerosCols.includes('categoria_sugerida')) {
  db.exec(`ALTER TABLE terceros ADD COLUMN categoria_sugerida TEXT`);
  console.log('🔧 Migración: columna categoria_sugerida agregada a terceros');
}
if (!tercerosCols.includes('tipo_proveedor')) {
  db.exec(`ALTER TABLE terceros ADD COLUMN tipo_proveedor TEXT DEFAULT 'PRODUCTO'`);
  console.log('🔧 Migración: columna tipo_proveedor agregada a terceros (PRODUCTO|SERVICIO)');
}

// Tabla proveedor_productos: catálogo de productos por proveedor
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_provprod_prov ON proveedor_productos(proveedor_id)`);

// 13) Tabla cxp (cuentas por pagar Y cobrar — direccion las diferencia)
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_cxp_estado ON cxp(estado)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cxp_direccion ON cxp(direccion)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cxp_venc ON cxp(fecha_vencimiento)`);

// 14) Tabla cxp_facturas (cada cuenta puede tener múltiples facturas)
db.exec(`CREATE TABLE IF NOT EXISTS cxp_facturas (
  id TEXT PRIMARY KEY,
  cxp_id TEXT NOT NULL,
  numero TEXT,
  uuid TEXT,
  fecha TEXT,
  monto REAL NOT NULL,
  notas TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cxp_fact_cxp ON cxp_facturas(cxp_id)`);

// 15) Tabla cxp_abonos (pagos parciales, cada uno crea un mov en caja)
db.exec(`CREATE TABLE IF NOT EXISTS cxp_abonos (
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
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_abonos_cxp ON cxp_abonos(cxp_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_abonos_caja ON cxp_abonos(caja_id)`);

// Columna cxp_id en movs (para vincular movimientos a CxP)
const movsColsCxP = db.prepare("PRAGMA table_info(movs)").all().map(c => c.name);
if (!movsColsCxP.includes('cxp_id')) {
  db.exec(`ALTER TABLE movs ADD COLUMN cxp_id TEXT`);
  console.log('🔧 Migración: columna cxp_id agregada a movs');

// ─── Migración: created_at en movs (fix bug pago orden compra) ───
const movsColsCreated = db.prepare("PRAGMA table_info(movs)").all().map(c => c.name);
if (!movsColsCreated.includes('created_at')) {
  db.exec(`ALTER TABLE movs ADD COLUMN created_at INTEGER`);
  db.exec(`UPDATE movs SET created_at = updated_at WHERE created_at IS NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_movs_created ON movs(created_at)`);
  console.log('🔧 Migración: columna created_at agregada a movs');
}

}
if (!movsColsCxP.includes('abono_id')) {
  db.exec(`ALTER TABLE movs ADD COLUMN abono_id TEXT`);
  console.log('🔧 Migración: columna abono_id agregada a movs');
}
if (!movsColsCxP.includes('orden_id')) {
  db.exec(`ALTER TABLE movs ADD COLUMN orden_id TEXT`);
  console.log('🔧 Migración: columna orden_id agregada a movs');
}

// ─── Migración v1.15.2: columna afecta_saldo en movs ───
// Bug previo: GASTOS/GASOLINA de cortes de ruta descontaban del saldo de Caja Principal,
// pero ese dinero NUNCA entró a caja — el vendedor ya lo había gastado en ruta antes de
// entregar el efectivo neto. El doble descuento causaba diferencias acumuladas en saldos.
// Solución: flag afecta_saldo (default 1 = comportamiento normal). Los gastos descontados
// de cortes se insertan con afecta_saldo = 0 → quedan registrados en movimientos y reportes
// pero calcularSaldoCaja los ignora.
const movsColsAfectaSaldo = db.prepare("PRAGMA table_info(movs)").all().map(c => c.name);
if (!movsColsAfectaSaldo.includes('afecta_saldo')) {
  db.exec(`ALTER TABLE movs ADD COLUMN afecta_saldo INTEGER DEFAULT 1`);
  // Backfill retroactivo: marcar como afecta_saldo=0 todos los GASTOS de cortes de ruta
  // ya registrados. src='venta-detalle' los identifica unívocamente (ver POST /api/ventas/cortes/detalle).
  const r = db.prepare(`
    UPDATE movs SET afecta_saldo = 0
    WHERE src = 'venta-detalle' AND tipo = 'GASTO' AND deleted = 0
  `).run();
  console.log(`🔧 Migración v1.15.2: columna afecta_saldo agregada a movs (${r.changes} movimientos históricos corregidos retroactivamente)`);
}

// Auto-corrección idempotente (cada arranque): cualquier GASTO de corte de ruta
// (src='venta-detalle') que se haya quedado con afecta_saldo != 0 — porque se
// capturó con una versión vieja del backend o se recapturó — se corrige a 0 para
// que NO mueva el saldo de la caja (el vendedor ya lo descontó del efectivo).
try {
  const fix = db.prepare(`
    UPDATE movs SET afecta_saldo = 0, updated_at = ?
    WHERE src = 'venta-detalle' AND tipo = 'GASTO' AND deleted = 0
      AND COALESCE(afecta_saldo, 1) <> 0
  `).run(Date.now());
  if (fix.changes > 0) {
    console.log(`🔧 Auto-corrección: ${fix.changes} gasto(s) de ruta marcados afecta_saldo=0 (no mueven caja)`);
  }
} catch (e) {
  console.error('⚠️  Auto-corrección afecta_saldo falló (no crítico):', e.message);
}

// ===================================================
// 8b) Tabla ordenes_compra (cabecera)
// ===================================================
db.exec(`CREATE TABLE IF NOT EXISTS ordenes_compra (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  numero_orden TEXT,
  proveedor_id TEXT,
  proveedor_nombre TEXT NOT NULL,
  comprador_nombre TEXT,
  metodo_pago TEXT NOT NULL,            -- EFECTIVO | TRANSFERENCIA
  caja_id TEXT NOT NULL,
  caja_nombre TEXT,
  monto_estimado REAL DEFAULT 0,
  monto_entregado REAL DEFAULT 0,
  monto_real REAL DEFAULT 0,
  ajuste REAL DEFAULT 0,                 -- positivo: faltó, negativo: sobró
  estado TEXT NOT NULL DEFAULT 'BORRADOR',  -- BORRADOR | PENDIENTE_PAGO | PAGADA | CANCELADA
  mov_salida_id TEXT,
  mov_ajuste_id TEXT,
  cxp_id TEXT,                              -- CxP vinculada (si pago después)
  observaciones TEXT,
  fecha_cierre TEXT,
  user_id TEXT,
  user_nombre TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes_compra(fecha)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes_compra(estado)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ordenes_proveedor ON ordenes_compra(proveedor_id)`);

// Migración: agregar cxp_id si no existe (para DBs ya creadas con v1.8 inicial)
const ordenesColumns = db.prepare("PRAGMA table_info(ordenes_compra)").all().map(c => c.name);
if (!ordenesColumns.includes('cxp_id')) {
  db.exec(`ALTER TABLE ordenes_compra ADD COLUMN cxp_id TEXT`);
  console.log('🔧 Migración: columna cxp_id agregada a ordenes_compra');
}

// 8c) Tabla ordenes_compra_items (productos de cada orden)
db.exec(`CREATE TABLE IF NOT EXISTS ordenes_compra_items (
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
  categoria_contable TEXT,               -- nombre de la categoría (ej: "MERCANCIA - CHOCOLATE")
  notas TEXT,
  mov_id TEXT,                            -- mov generado al cerrar
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orden_items_orden ON ordenes_compra_items(orden_id)`);

console.log('✅ Tablas ordenes_compra y ordenes_compra_items listas');


// 9) Asegurar que admin esté siempre activo (protección)
db.prepare(`UPDATE users SET activo = 1 WHERE rol = 'admin' AND (activo IS NULL OR activo = 0)`).run();

// 10) Tabla import_log + columnas import_id en movs/cats/cajas/groups
db.exec(`CREATE TABLE IF NOT EXISTS import_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  user_id TEXT,
  user_nombre TEXT,
  filename TEXT,
  formato TEXT,
  total_movs INTEGER DEFAULT 0,
  total_cats INTEGER DEFAULT 0,
  total_cajas INTEGER DEFAULT 0,
  total_groups INTEGER DEFAULT 0,
  reverted INTEGER DEFAULT 0,
  reverted_at INTEGER
)`);

const movsCols = db.prepare("PRAGMA table_info(movs)").all().map(c => c.name);
if (!movsCols.includes('import_id')) {
  db.exec(`ALTER TABLE movs ADD COLUMN import_id TEXT`);
  console.log('🔧 Migración: columna import_id agregada a movs');
}
const catsCols2 = db.prepare("PRAGMA table_info(cats)").all().map(c => c.name);
if (!catsCols2.includes('import_id')) {
  db.exec(`ALTER TABLE cats ADD COLUMN import_id TEXT`);
}
const cajasColsM = db.prepare("PRAGMA table_info(cajas)").all().map(c => c.name);
if (!cajasColsM.includes('import_id')) {
  db.exec(`ALTER TABLE cajas ADD COLUMN import_id TEXT`);
}
const groupsCols = db.prepare("PRAGMA table_info(groups)").all().map(c => c.name);
if (!groupsCols.includes('import_id')) {
  db.exec(`ALTER TABLE groups ADD COLUMN import_id TEXT`);
}

// ─── Migración: backfill de categorías "fantasma" ───────────────────────────
// Algunos módulos (Nómina, Ventas, Viáticos) registran movimientos con un
// nombre de categoría pero solo crean el registro en `cats` cuando encuentran
// el grupo destino; si el grupo no existía, la categoría quedaba SIN registro
// en `cats` (visible en movimientos/reportes pero no en Categorías). Este
// backfill crea esos registros faltantes con group_id = NULL para que aparezcan
// en el bloque "SIN GRUPO ASIGNADO" y se les pueda asignar grupo. Idempotente.
try {
  const faltantes = db.prepare(`
    SELECT DISTINCT m.tipo AS tipo, m.categoria AS nombre
    FROM movs m
    WHERE m.deleted = 0
      AND m.categoria IS NOT NULL AND TRIM(m.categoria) <> ''
      AND m.tipo IN ('INGRESO','GASTO')
      AND NOT EXISTS (
        SELECT 1 FROM cats c
        WHERE c.deleted = 0 AND c.tipo = m.tipo AND c.nombre = m.categoria
      )
  `).all();
  if (faltantes.length > 0) {
    const nowBf = Date.now();
    const insBf = db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, NULL, ?, 0)`);
    let n = 0;
    for (const f of faltantes) {
      const color = f.tipo === 'INGRESO' ? '#10B981' : '#6B7280';
      const icon = f.tipo === 'INGRESO' ? '💰' : '📌';
      const id = 'cat-bf-' + nowBf + '-' + (n++);
      insBf.run(id, f.tipo, f.nombre, color, icon, nowBf);
    }
    console.log(`🔧 Migración: ${faltantes.length} categoría(s) fantasma creadas en cats (sin grupo) para asignación manual`);
  }
} catch (e) {
  console.error('⚠️  Backfill de categorías fantasma falló (no crítico):', e.message);
}
} catch (e) {
  console.error('FATAL: fallo de migración de schema:', e);
  process.exit(1);
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://corte.kbomx.com' }));
app.use(express.json({ limit: '50mb' }));
app.use((req, _res, next) => { console.log(new Date().toISOString(), req.method, req.url); next(); });

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // Verificar que sigue activo en cada request crítico
    const u = db.prepare('SELECT activo FROM users WHERE id = ?').get(req.user.id);
    if (!u || u.activo === 0) return res.status(401).json({ error: 'Usuario desactivado' });
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

// requireRole(['admin','gerente']) — flexible
function requireRole(roles) {
  return function(req, res, next) {
    if (!roles.includes(req.user?.rol)) return res.status(403).json({ error: 'Rol insuficiente' });
    next();
  };
}

// PIN obligatorio para borrados (todos los roles excepto consulta y usuario que no pueden borrar)
function requirePin(req, res, next) {
  const rol = req.user?.rol;
  // CONSULTA y USUARIO no pueden borrar nunca
  if (rol === 'consulta' || rol === 'usuario') {
    return res.status(403).json({ error: 'No tienes permiso para eliminar' });
  }
  if (rol !== 'admin' && rol !== 'gerente') {
    return res.status(403).json({ error: 'Rol insuficiente' });
  }

  const pin = (req.body?.pin || req.headers['x-pin'] || '').toString().trim();
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Se requiere PIN de 4 dígitos' });

  const u = db.prepare('SELECT id, pin_hash, pin_attempts, pin_locked_until FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(401).json({ error: 'Usuario no encontrado' });
  if (!u.pin_hash) return res.status(403).json({ error: 'No tienes PIN configurado. Pídele al admin que te lo genere.' });

  // Bloqueo por intentos fallidos
  const now = Date.now();
  if (u.pin_locked_until && u.pin_locked_until > now) {
    const restantes = Math.ceil((u.pin_locked_until - now) / 60000);
    return res.status(429).json({ error: `Bloqueado por intentos fallidos. Espera ${restantes} min.` });
  }

  const ok = bcrypt.compareSync(pin, u.pin_hash);
  if (!ok) {
    const attempts = (u.pin_attempts || 0) + 1;
    if (attempts >= 3) {
      db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?').run(now + 5 * 60000, u.id);
      return res.status(429).json({ error: 'PIN incorrecto. Bloqueado 5 minutos.' });
    }
    db.prepare('UPDATE users SET pin_attempts = ? WHERE id = ?').run(attempts, u.id);
    return res.status(401).json({ error: `PIN incorrecto. ${3 - attempts} intento(s) restantes.` });
  }

  // PIN correcto: resetear intentos
  db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = 0 WHERE id = ?').run(u.id);
  req.pinValidated = true;
  next();
}

// Helper: registrar acción en audit_log
function audit(req, accion, entidad, entidad_id, detalle = null) {
  db.prepare(`INSERT INTO audit_log (ts, user_id, user_nombre, rol, accion, entidad, entidad_id, detalle, pin_validado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Date.now(), req.user?.id || null, req.user?.nombre || null, req.user?.rol || null,
      accion, entidad, entidad_id || null, detalle || null, req.pinValidated ? 1 : 0
    );
}

// Helper: ¿este usuario puede usar esta caja?
function userCanUseCaja(userId, cajaId, rol) {
  if (rol === 'admin' || rol === 'gerente') return true; // admin y gerente: todas
  const asignadas = db.prepare('SELECT COUNT(*) AS n FROM user_cajas WHERE user_id = ?').get(userId);
  if (asignadas.n === 0) return true; // sin asignaciones = todas (default cómodo)
  const tiene = db.prepare('SELECT 1 FROM user_cajas WHERE user_id = ? AND caja_id = ?').get(userId, cajaId);
  return !!tiene;
}

// ---------- Login ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !bcrypt.compareSync(password, u.password))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  if (u.activo === 0) return res.status(401).json({ error: 'Usuario desactivado. Contacta al administrador.' });
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), u.id);
  const token = jwt.sign({ id: u.id, username: u.username, rol: u.rol, nombre: u.nombre }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol } });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

// ---------- Movimientos ----------
app.get('/api/movs', auth, (req, res) => {
  // Paginación: ?limit (default 2000, máx 10000) y ?offset (default 0).
  // El espejo offline del frontend usa /api/sync, no este endpoint, así que
  // limitamos por defecto para evitar respuestas sin tope.
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit <= 0) limit = 2000;
  if (limit > 10000) limit = 10000;
  let offset = parseInt(req.query.offset, 10);
  if (isNaN(offset) || offset < 0) offset = 0;
  const rows = db.prepare('SELECT * FROM movs WHERE deleted = 0 ORDER BY fecha DESC LIMIT ? OFFSET ?').all(limit, offset);
  res.json({ movs: rows });
});

app.post('/api/movs', auth, (req, res) => {
  const m = req.body;
  if (!m?.id || !m.fecha || !m.tipo) return res.status(400).json({ error: 'Datos incompletos' });
  const now = Date.now();
  // updated_at lógico del cliente (sello del momento de edición) para last-write-wins.
  // Se acota contra relojes adelantados; si no viene (cliente viejo) se usa el reloj del server.
  const ua = clampUpdatedAt(m.updated_at, now, SYNC_SKEW_MS);
  // El UPDATE del upsert solo aplica si el sello entrante es MÁS RECIENTE que el guardado.
  const info = db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, caja_destino, transfer_id, usuario, notas, src, user_id, updated_at, deleted)
    VALUES (@id, @fecha, @tipo, @categoria, @concepto, @monto, @metodo, @caja, @caja_destino, @transfer_id, @usuario, @notas, @src, @user_id, @updated_at, 0)
    ON CONFLICT(id) DO UPDATE SET
      fecha=@fecha, tipo=@tipo, categoria=@categoria, concepto=@concepto, monto=@monto,
      metodo=@metodo, caja=@caja, caja_destino=@caja_destino, transfer_id=@transfer_id,
      usuario=@usuario, notas=@notas, src=@src, updated_at=@updated_at, deleted=0
      WHERE excluded.updated_at > movs.updated_at`).run({
    id: m.id, fecha: m.fecha, tipo: m.tipo, categoria: m.categoria || '',
    concepto: m.concepto || '', monto: Number(m.monto) || 0,
    metodo: m.metodo || 'EFECTIVO', caja: m.caja || 'caja-principal',
    caja_destino: m.caja_destino || null, transfer_id: m.transfer_id || null,
    usuario: m.usuario || req.user.nombre, notas: m.notas || '',
    src: m.src || 'manual', user_id: req.user.id, updated_at: ua
  });
  // applied=false ⇒ llegó una versión más vieja y se ignoró (no es error; el cliente la quita de la cola).
  res.json({ ok: true, id: m.id, applied: info.changes > 0 });
});

app.post('/api/movs/bulk', auth, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items requerido' });
  const now = Date.now();
  const stmt = db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas, src, user_id, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET fecha=excluded.fecha, tipo=excluded.tipo, categoria=excluded.categoria,
      concepto=excluded.concepto, monto=excluded.monto, metodo=excluded.metodo, caja=excluded.caja,
      usuario=excluded.usuario, notas=excluded.notas, src=excluded.src, updated_at=excluded.updated_at, deleted=0
      WHERE excluded.updated_at > movs.updated_at`);
  const tx = db.transaction((arr) => {
    for (const m of arr) {
      const ua = clampUpdatedAt(m.updated_at, now, SYNC_SKEW_MS);
      stmt.run(m.id, m.fecha, m.tipo, m.categoria || '', m.concepto || '', Number(m.monto) || 0,
        m.metodo || 'EFECTIVO', m.caja || 'PRINCIPAL', m.usuario || req.user.nombre,
        m.notas || '', m.src || 'xml', req.user.id, ua);
    }
  });
  tx(items);
  res.json({ ok: true, count: items.length });
});

// CASCADE_MOV_V2 — cascadea soft-delete a ventas (1 col) + cortes (6 cols mov_*_id)
app.delete('/api/movs/:id', auth, requirePin, (req, res) => {
  const tx = db.transaction((movId) => {
    const mov = db.prepare('SELECT id, tipo, categoria, monto, fecha FROM movs WHERE id = ?').get(movId);
    if (!mov) { const e = new Error('Movimiento no encontrado'); e.status = 404; throw e; }
    const now = Date.now();
    db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, movId);

    // Cascade a ventas vinculadas (columna mov_id sí existe en esta tabla)
    const ventas = db.prepare('SELECT id, canal, importe FROM ventas WHERE mov_id = ? AND deleted = 0').all(movId);
    for (const v of ventas) {
      db.prepare('UPDATE ventas SET deleted = 1, updated_at = ? WHERE id = ?').run(now, v.id);
      audit(req, 'cascade-delete', 'ventas', v.id, `cascadeo desde mov ${movId} (${v.canal} · ${v.importe})`);
    }

    // Cascade a cortes — 6 columnas mov_*_id, limpiar individualmente
    const cortes = db.prepare(`SELECT id, ruta,
        mov_efectivo_id, mov_transferencia_id, mov_credito_id,
        mov_gastos_id, mov_devoluciones_id, mov_gasolina_id
      FROM ventas_detalle_cortes
      WHERE deleted = 0
        AND (mov_efectivo_id = ? OR mov_transferencia_id = ? OR mov_credito_id = ?
          OR mov_gastos_id = ? OR mov_devoluciones_id = ? OR mov_gasolina_id = ?)
    `).all(movId, movId, movId, movId, movId, movId);
    let cortesAfectados = 0;
    for (const c of cortes) {
      const updates = [];
      if (c.mov_efectivo_id      === movId) updates.push('mov_efectivo_id = NULL');
      if (c.mov_transferencia_id === movId) updates.push('mov_transferencia_id = NULL');
      if (c.mov_credito_id       === movId) updates.push('mov_credito_id = NULL');
      if (c.mov_gastos_id        === movId) updates.push('mov_gastos_id = NULL');
      if (c.mov_devoluciones_id  === movId) updates.push('mov_devoluciones_id = NULL');
      if (c.mov_gasolina_id      === movId) updates.push('mov_gasolina_id = NULL');
      if (updates.length) {
        db.prepare('UPDATE ventas_detalle_cortes SET ' + updates.join(', ') + ', updated_at = ? WHERE id = ?').run(now, c.id);
        cortesAfectados++;
      }
      // ¿Quedó este corte sin ningún mov vivo? → soft-delete
      const refresh = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ?').get(c.id);
      const movIdsActivos = [refresh.mov_efectivo_id, refresh.mov_transferencia_id, refresh.mov_credito_id,
                             refresh.mov_gastos_id, refresh.mov_devoluciones_id, refresh.mov_gasolina_id].filter(Boolean);
      if (movIdsActivos.length === 0) {
        db.prepare('UPDATE ventas_detalle_cortes SET deleted = 1, updated_at = ? WHERE id = ?').run(now, c.id);
        audit(req, 'cascade-delete', 'ventas_detalle_cortes', c.id, `cascadeo desde mov ${movId} (ruta ${c.ruta} · sin movs restantes)`);
      } else {
        audit(req, 'cascade-clear-ref', 'ventas_detalle_cortes', c.id, `limpiada referencia a mov ${movId} (ruta ${c.ruta} · ${movIdsActivos.length} movs vivos restantes)`);
      }
    }

    audit(req, 'delete', 'movs', movId, JSON.stringify({
      tipo: mov.tipo, categoria: mov.categoria, monto: mov.monto, fecha: mov.fecha,
      cascadeo_ventas: ventas.length, cascadeo_cortes: cortesAfectados
    }));
    return { ok: true, cascade: { ventas: ventas.length, cortes: cortesAfectados } };
  });
  try { res.json(tx(req.params.id)); }
  catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ---------- Grupos contables y Categorías (extraído a routes/catalogo.js, #6) ----------
require('./routes/catalogo')(app, db, { requireAuth: auth, requireAdmin });

// ---------- Cajas / Cuentas ----------
// Helper: calcula saldo de una caja sumando movimientos (incluye transferencias)
// v1.15.2: respeta el flag afecta_saldo — movs con afecta_saldo=0 NO mueven el saldo
// (típicamente gastos/gasolina de cortes de ruta que se descontaron de la venta del vendedor
// y nunca entraron a la caja física).
function calcularSaldoCaja(cajaId) {
  const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
  if (!caja) return null;
  // Ingresos a esa caja (incluye transferencias entrantes que tienen tipo INGRESO)
  const ingresos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS s FROM movs
    WHERE caja = ? AND tipo = 'INGRESO' AND deleted = 0 AND COALESCE(afecta_saldo, 1) = 1
      AND (fecha >= ? OR ? IS NULL OR ? = '')`).get(cajaId, caja.fecha_inicial || '', caja.fecha_inicial, caja.fecha_inicial);
  const gastos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS s FROM movs
    WHERE caja = ? AND tipo = 'GASTO' AND deleted = 0 AND COALESCE(afecta_saldo, 1) = 1
      AND (fecha >= ? OR ? IS NULL OR ? = '')`).get(cajaId, caja.fecha_inicial || '', caja.fecha_inicial, caja.fecha_inicial);
  return round2((caja.saldo_inicial || 0) + (ingresos.s || 0) - (gastos.s || 0));
}

app.get('/api/cajas', auth, (req, res) => {
  const incluirArchivadas = req.query.incluirArchivadas === '1';
  const sql = incluirArchivadas
    ? 'SELECT * FROM cajas WHERE deleted = 0 ORDER BY archivada, orden, nombre'
    : 'SELECT * FROM cajas WHERE deleted = 0 AND archivada = 0 ORDER BY orden, nombre';
  const cajas = db.prepare(sql).all();
  // Adjuntar saldo calculado
  cajas.forEach(c => { c.saldo_actual = calcularSaldoCaja(c.id); });
  res.json({ cajas });
});

app.get('/api/cajas/:id/saldo', auth, (req, res) => {
  const saldo = calcularSaldoCaja(req.params.id);
  if (saldo === null) return res.status(404).json({ error: 'Caja no encontrada' });
  res.json({ saldo });
});

app.post('/api/cajas', auth, requireAdmin, (req, res) => {
  const c = req.body;
  if (!c?.id || !c.nombre || !c.tipo) return res.status(400).json({ error: 'Datos incompletos' });
  if (!['EFECTIVO', 'BANCO', 'CREDITO'].includes(c.tipo))
    return res.status(400).json({ error: 'tipo debe ser EFECTIVO, BANCO o CREDITO' });
  db.prepare(`INSERT INTO cajas (id, tipo, nombre, banco, numero, saldo_inicial, fecha_inicial, moneda, permite_negativo, archivada, orden, color, icon, updated_at, deleted)
    VALUES (@id, @tipo, @nombre, @banco, @numero, @saldo_inicial, @fecha_inicial, @moneda, @permite_negativo, @archivada, @orden, @color, @icon, @updated_at, 0)
    ON CONFLICT(id) DO UPDATE SET
      tipo=@tipo, nombre=@nombre, banco=@banco, numero=@numero, saldo_inicial=@saldo_inicial, fecha_inicial=@fecha_inicial,
      moneda=@moneda, permite_negativo=@permite_negativo, archivada=@archivada, orden=@orden, color=@color, icon=@icon,
      updated_at=@updated_at, deleted=0`).run({
    id: c.id, tipo: c.tipo, nombre: c.nombre,
    banco: c.banco || null, numero: c.numero || null,
    saldo_inicial: Number(c.saldo_inicial) || 0,
    fecha_inicial: c.fecha_inicial || new Date().toISOString().slice(0, 10),
    moneda: c.moneda || 'MXN',
    permite_negativo: c.permite_negativo ? 1 : 0,
    archivada: c.archivada ? 1 : 0,
    orden: Number(c.orden) || 0,
    color: c.color || null, icon: c.icon || null,
    updated_at: Date.now()
  });
  res.json({ ok: true });
});

app.put('/api/cajas/:id', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const c = req.body;
  const existing = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(id);
  if (!existing) return res.status(404).json({ error: 'Caja no encontrada' });
  // No permitimos cambiar tipo si ya tiene movimientos (consistencia)
  const movs = db.prepare("SELECT COUNT(*) AS n FROM movs WHERE caja = ? AND deleted = 0").get(id);
  if (c.tipo && c.tipo !== existing.tipo && movs.n > 0) {
    return res.status(409).json({ error: `No se puede cambiar el tipo: la caja tiene ${movs.n} movimiento(s)` });
  }
  const merged = {
    tipo: c.tipo || existing.tipo,
    nombre: c.nombre?.trim() || existing.nombre,
    banco: c.banco !== undefined ? c.banco : existing.banco,
    numero: c.numero !== undefined ? c.numero : existing.numero,
    saldo_inicial: c.saldo_inicial !== undefined ? Number(c.saldo_inicial) : existing.saldo_inicial,
    fecha_inicial: c.fecha_inicial || existing.fecha_inicial,
    moneda: c.moneda || existing.moneda,
    permite_negativo: c.permite_negativo !== undefined ? (c.permite_negativo ? 1 : 0) : existing.permite_negativo,
    archivada: c.archivada !== undefined ? (c.archivada ? 1 : 0) : existing.archivada,
    orden: c.orden !== undefined ? Number(c.orden) : existing.orden,
    color: c.color !== undefined ? c.color : existing.color,
    icon: c.icon !== undefined ? c.icon : existing.icon
  };
  db.prepare(`UPDATE cajas SET tipo=?, nombre=?, banco=?, numero=?, saldo_inicial=?, fecha_inicial=?, moneda=?, permite_negativo=?, archivada=?, orden=?, color=?, icon=?, updated_at=? WHERE id=?`)
    .run(merged.tipo, merged.nombre, merged.banco, merged.numero, merged.saldo_inicial, merged.fecha_inicial,
      merged.moneda, merged.permite_negativo, merged.archivada, merged.orden, merged.color, merged.icon, Date.now(), id);
  res.json({ ok: true });
});

app.post('/api/cajas/:id/archivar', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const r = db.prepare('UPDATE cajas SET archivada = 1, updated_at = ? WHERE id = ? AND deleted = 0').run(Date.now(), id);
  if (r.changes === 0) return res.status(404).json({ error: 'Caja no encontrada' });
  res.json({ ok: true });
});

app.post('/api/cajas/:id/desarchivar', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const r = db.prepare('UPDATE cajas SET archivada = 0, updated_at = ? WHERE id = ? AND deleted = 0').run(Date.now(), id);
  if (r.changes === 0) return res.status(404).json({ error: 'Caja no encontrada' });
  res.json({ ok: true });
});

app.delete('/api/cajas/:id', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const movs = db.prepare("SELECT COUNT(*) AS n FROM movs WHERE caja = ? AND deleted = 0").get(id);
  if (movs.n > 0) {
    return res.status(409).json({ error: `No se puede eliminar: la caja tiene ${movs.n} movimiento(s). Archívala en su lugar.` });
  }
  db.prepare('UPDATE cajas SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  res.json({ ok: true });
});

// ---------- Transferencias entre cajas ----------
// Crea 2 movimientos vinculados con el mismo transfer_id:
//   - Un GASTO en la caja origen
//   - Un INGRESO en la caja destino
// Ambos con tipo='TRANSFERENCIA' lógicamente excluidos de los reportes de ingresos/gastos
// pero suman para el saldo de cada caja.
app.post('/api/transferencia', auth, (req, res) => {
  const { cajaOrigen, cajaDestino, monto, fecha, concepto, notas, transfer_id } = req.body || {};
  if (!cajaOrigen || !cajaDestino) return res.status(400).json({ error: 'Selecciona caja origen y destino' });
  if (cajaOrigen === cajaDestino) return res.status(400).json({ error: 'La caja origen no puede ser igual a la destino' });
  const m = Number(monto);
  if (!m || m <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const origen = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaOrigen);
  const destino = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaDestino);
  if (!origen || !destino) return res.status(400).json({ error: 'Caja origen o destino no existe' });

  // Validar saldo de origen
  if (!origen.permite_negativo) {
    const saldoOrigen = calcularSaldoCaja(cajaOrigen);
    if (Math.round((saldoOrigen - m) * 100) / 100 < 0) {
      return res.status(409).json({ error: `Saldo insuficiente en ${origen.nombre} ($${saldoOrigen.toFixed(2)} disponible)` });
    }
  }

  const tid = transfer_id || newId('t-');
  const f = fecha || new Date().toISOString().slice(0, 10);
  const concept = concepto || `Transferencia ${origen.nombre} → ${destino.nombre}`;
  const now = Date.now();
  const idGasto = newId('m-tg-');
  const idIngreso = newId('m-ti-');

  const stmt = db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, caja_destino, transfer_id, usuario, notas, src, user_id, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
  const tx = db.transaction(() => {
    stmt.run(idGasto, f, 'GASTO', '__TRANSFERENCIA__', concept, m, 'TRANSFERENCIA', cajaOrigen, cajaDestino, tid, req.user.nombre, notas || '', 'transfer', req.user.id, now);
    stmt.run(idIngreso, f, 'INGRESO', '__TRANSFERENCIA__', concept, m, 'TRANSFERENCIA', cajaDestino, cajaOrigen, tid, req.user.nombre, notas || '', 'transfer', req.user.id, now);
  });
  tx();

  res.json({ ok: true, transfer_id: tid, idGasto, idIngreso });
});

// Borrar transferencia: elimina ambos movimientos del par (requiere PIN)
app.delete('/api/transferencia/:tid', auth, requirePin, (req, res) => {
  const r = db.prepare("UPDATE movs SET deleted = 1, updated_at = ? WHERE transfer_id = ?").run(Date.now(), req.params.tid);
  audit(req, 'delete', 'transferencia', req.params.tid, JSON.stringify({ count: r.changes }));
  res.json({ ok: true, count: r.changes });
});

// ---------- Presupuestos ----------
app.get('/api/budgets', auth, (_req, res) => {
  res.json({ budgets: db.prepare('SELECT * FROM budgets').all() });
});

app.post('/api/budgets', auth, (req, res) => {
  const b = req.body;
  if (!b?.id) return res.status(400).json({ error: 'id requerido' });
  db.prepare(`INSERT INTO budgets (id, monto, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET monto=excluded.monto, updated_at=excluded.updated_at`)
    .run(b.id, Number(b.monto) || 0, Date.now());
  res.json({ ok: true });
});

// ---------- Sync incremental ----------
// ---------- USUARIOS (gestión solo por admin) ----------
// Listar usuarios. Sin password ni pin_hash (nunca enviarlos al cliente).
app.get('/api/users', auth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, nombre, rol, activo, last_login, updated_at,
           CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END AS tiene_pin
    FROM users
    ORDER BY rol, nombre
  `).all();
  // Adjuntar cajas asignadas
  for (const u of users) {
    const cajas = db.prepare('SELECT caja_id FROM user_cajas WHERE user_id = ?').all(u.id);
    u.cajas = cajas.map(c => c.caja_id);
  }
  res.json({ users });
});

// Crear usuario
app.post('/api/users', auth, requireAdmin, (req, res) => {
  const { username, nombre, rol, password, activo, cajas } = req.body || {};
  if (!username || !nombre || !rol || !password)
    return res.status(400).json({ error: 'username, nombre, rol y password son requeridos' });
  if (!['admin', 'gerente', 'usuario', 'consulta'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Ese username ya existe' });

  const id = newId('u-');
  const pwHash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, username, password, nombre, rol, activo, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, username.trim(), pwHash, nombre.trim(), rol, activo === false ? 0 : 1, Date.now());

  // Asignar cajas (si se proporcionan)
  if (Array.isArray(cajas) && cajas.length > 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO user_cajas (user_id, caja_id) VALUES (?, ?)');
    cajas.forEach(c => stmt.run(id, c));
  }

  audit(req, 'create', 'users', id, JSON.stringify({ username, rol }));
  res.json({ ok: true, id });
});

// Editar usuario (nombre, rol, activo). NO contraseña ni PIN — endpoints aparte.
app.put('/api/users/:id', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { nombre, rol, activo, username } = req.body || {};

  // Protección: no permitir desactivar/quitar rol al último admin
  if ((activo === false || activo === 0 || (rol && rol !== 'admin' && u.rol === 'admin'))) {
    const otrosAdmins = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE rol = 'admin' AND activo = 1 AND id != ?`).get(id);
    if (otrosAdmins.n === 0) {
      return res.status(409).json({ error: 'No puedes dejar al sistema sin admin activo' });
    }
  }

  const merged = {
    nombre: nombre?.trim() || u.nombre,
    rol: rol && ['admin', 'gerente', 'usuario', 'consulta'].includes(rol) ? rol : u.rol,
    activo: activo === undefined ? u.activo : (activo ? 1 : 0),
    username: username?.trim() || u.username
  };

  // username debe ser único
  if (merged.username !== u.username) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(merged.username, id);
    if (exists) return res.status(409).json({ error: 'Ese username ya existe' });
  }

  db.prepare(`UPDATE users SET nombre = ?, rol = ?, activo = ?, username = ?, updated_at = ? WHERE id = ?`)
    .run(merged.nombre, merged.rol, merged.activo, merged.username, Date.now(), id);

  audit(req, 'update', 'users', id, JSON.stringify(merged));
  res.json({ ok: true });
});

// Resetear contraseña (admin la pone)
app.post('/api/users/:id/password', auth, requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(hash, Date.now(), req.params.id);
  audit(req, 'reset_password', 'users', req.params.id, null);
  res.json({ ok: true });
});

// Cambio de mi propia contraseña (cualquier rol)
app.post('/api/me/password', auth, (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (!passwordActual || !passwordNueva)
    return res.status(400).json({ error: 'Faltan datos' });
  if (passwordNueva.length < 6)
    return res.status(400).json({ error: 'Contraseña nueva mínimo 6 caracteres' });
  const u = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.user.id);
  if (!u || !bcrypt.compareSync(passwordActual, u.password))
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?')
    .run(bcrypt.hashSync(passwordNueva, 10), Date.now(), u.id);
  audit(req, 'self_password', 'users', u.id, null);
  res.json({ ok: true });
});

// Generar/regenerar PIN del usuario (admin lo ve UNA vez en respuesta)
// Body: { pin?: '1234' } — si no se manda, se genera aleatorio
app.post('/api/users/:id/pin', auth, requireAdmin, (req, res) => {
  const u = db.prepare('SELECT id, rol FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.rol !== 'admin' && u.rol !== 'gerente')
    return res.status(400).json({ error: 'PIN solo aplica a admin y gerente' });

  let pin = (req.body?.pin || '').toString().trim();
  if (pin) {
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' });
  } else {
    // Generar aleatorio
    pin = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  }
  const hash = bcrypt.hashSync(pin, 10);
  db.prepare('UPDATE users SET pin_hash = ?, pin_attempts = 0, pin_locked_until = 0, updated_at = ? WHERE id = ?')
    .run(hash, Date.now(), req.params.id);
  audit(req, 'generate_pin', 'users', req.params.id, null);
  // Devolver el PIN en claro UNA SOLA VEZ
  res.json({ ok: true, pin });
});

// Eliminar usuario (definitivo)
app.delete('/api/users/:id', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  const u = db.prepare('SELECT rol FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (u.rol === 'admin') {
    const otros = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE rol = 'admin' AND id != ?`).get(id);
    if (otros.n === 0) return res.status(409).json({ error: 'No puedes eliminar al último admin' });
  }

  db.prepare('DELETE FROM user_cajas WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  audit(req, 'delete', 'users', id, null);
  res.json({ ok: true });
});

// Asignar cajas a un usuario (reemplaza las anteriores)
app.put('/api/users/:id/cajas', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const { cajas } = req.body || {};
  if (!Array.isArray(cajas)) return res.status(400).json({ error: 'cajas debe ser un array' });
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_cajas WHERE user_id = ?').run(id);
    const stmt = db.prepare('INSERT OR IGNORE INTO user_cajas (user_id, caja_id) VALUES (?, ?)');
    cajas.forEach(c => stmt.run(id, c));
  });
  tx();

  audit(req, 'update_cajas', 'users', id, JSON.stringify({ cajas }));
  res.json({ ok: true });
});

// Listar cajas asignadas a un usuario
app.get('/api/users/:id/cajas', auth, requireAdmin, (req, res) => {
  const cajas = db.prepare('SELECT caja_id FROM user_cajas WHERE user_id = ?').all(req.params.id);
  res.json({ cajas: cajas.map(c => c.caja_id) });
});

// ---------- IMPORT / EXPORT ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan .xlsx, .xls o .csv'));
  }
});

// Helper: parsear fecha en varios formatos a YYYY-MM-DD
function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // Excel serial (número) — los lee XLSX como Date si cellDates:true
  if (!isNaN(s)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = excelEpoch.getTime() + parseFloat(s) * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }
  }
  return null;
}

// Helper: normalizar texto (uppercase, trim)
function norm(s) { return (s == null ? '' : String(s)).trim(); }

// Parsear archivo Excel/CSV a estructura canónica
function parseImportFile(buffer, filename) {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1] || 'xlsx';
  let workbook;
  if (ext === 'csv') {
    const txt = buffer.toString('utf8');
    workbook = XLSX.read(txt, { type: 'string', cellDates: true });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }

  const result = { movs: [], cats: [], cajas: [], groups: [], warnings: [] };

  // Buscar hoja MOVIMIENTOS (case-insensitive)
  const findSheet = (names) => {
    for (const sn of workbook.SheetNames) {
      if (names.includes(sn.toUpperCase())) return workbook.Sheets[sn];
    }
    return null;
  };

  // MOVIMIENTOS (la única realmente obligatoria)
  const sMovs = findSheet(['MOVIMIENTOS', 'MOVS', 'MOVIMIENTO']);
  if (!sMovs) {
    // Si solo hay 1 hoja y no se llama así, asumimos que es la principal
    if (workbook.SheetNames.length === 1) {
      const onlySheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(onlySheet, { defval: '', raw: false });
      rows.forEach((r, idx) => {
        const m = parseRowMov(r, idx + 2, result.warnings);
        if (m) result.movs.push(m);
      });
    } else {
      result.warnings.push('No se encontró hoja MOVIMIENTOS y hay varias hojas. Nombra la principal como "MOVIMIENTOS".');
    }
  } else {
    const rows = XLSX.utils.sheet_to_json(sMovs, { defval: '', raw: false });
    rows.forEach((r, idx) => {
      const m = parseRowMov(r, idx + 2, result.warnings);
      if (m) result.movs.push(m);
    });
  }

  const sCats = findSheet(['CATEGORIAS', 'CATEGORIAS', 'CATS']);
  if (sCats) {
    const rows = XLSX.utils.sheet_to_json(sCats, { defval: '', raw: false });
    rows.forEach(r => {
      const nombre = norm(r.nombre || r.NOMBRE);
      const tipo = norm(r.tipo || r.TIPO).toUpperCase();
      if (!nombre || !['INGRESO','GASTO'].includes(tipo)) return;
      result.cats.push({
        nombre, tipo,
        grupo: norm(r.grupo || r.GRUPO) || null,
        icon: norm(r.icono || r.ICONO || r.icon) || '📌',
        color: norm(r.color || r.COLOR) || '#6B7280'
      });
    });
  }

  const sCajas = findSheet(['CAJAS', 'CAJA']);
  if (sCajas) {
    const rows = XLSX.utils.sheet_to_json(sCajas, { defval: '', raw: false });
    rows.forEach(r => {
      const nombre = norm(r.nombre || r.NOMBRE);
      const tipo = norm(r.tipo || r.TIPO).toUpperCase();
      if (!nombre || !['EFECTIVO','BANCO','CREDITO'].includes(tipo)) return;
      const negTxt = norm(r.permite_negativo || r.PERMITE_NEGATIVO).toUpperCase();
      result.cajas.push({
        nombre, tipo,
        banco: norm(r.banco || r.BANCO) || null,
        numero: norm(r.numero || r.NUMERO) || null,
        saldo_inicial: parseFloat(r.saldo_inicial || r.SALDO_INICIAL || 0) || 0,
        fecha_inicial: parseFecha(r.fecha_inicial || r.FECHA_INICIAL) || new Date().toISOString().slice(0,10),
        permite_negativo: tipo === 'CREDITO' ? 1 : (negTxt === 'SI' ? 1 : 0)
      });
    });
  }

  const sGroups = findSheet(['GRUPOS', 'GRUPO', 'GROUPS']);
  if (sGroups) {
    const rows = XLSX.utils.sheet_to_json(sGroups, { defval: '', raw: false });
    rows.forEach(r => {
      const nombre = norm(r.nombre || r.NOMBRE);
      const tipo = norm(r.tipo || r.TIPO).toUpperCase();
      if (!nombre || !['INGRESO','GASTO'].includes(tipo)) return;
      result.groups.push({
        nombre, tipo,
        orden: parseInt(r.orden || r.ORDEN || 0) || 0
      });
    });
  }

  if (result.movs.length > 50000) {
    const err = new Error(`El archivo contiene ${result.movs.length} movimientos válidos; el máximo permitido por importación es 50000. Divide el archivo en partes más pequeñas.`);
    err.statusCode = 400;
    throw err;
  }

  return result;
}

function parseRowMov(r, rowIdx, warnings) {
  const fecha = parseFecha(r.fecha || r.FECHA);
  const tipo = norm(r.tipo || r.TIPO).toUpperCase();
  const categoria = norm(r.categoria || r.CATEGORIA);
  const monto = parseFloat(String(r.monto || r.MONTO).replace(/,/g, ''));

  if (!fecha) { warnings.push(`Fila ${rowIdx}: fecha inválida → omitida`); return null; }
  if (!['INGRESO','GASTO'].includes(tipo)) { warnings.push(`Fila ${rowIdx}: tipo inválido (${r.tipo}) → omitida`); return null; }
  if (!categoria) { warnings.push(`Fila ${rowIdx}: categoría vacía → omitida`); return null; }
  if (isNaN(monto) || monto <= 0) { warnings.push(`Fila ${rowIdx}: monto inválido → omitida`); return null; }

  return {
    fecha, tipo, categoria, monto,
    concepto: norm(r.concepto || r.CONCEPTO) || categoria,
    metodo: (norm(r.metodo || r.METODO).toUpperCase()) || 'EFECTIVO',
    caja: norm(r.caja || r.CAJA) || 'Caja Principal',
    usuario: norm(r.usuario || r.USUARIO) || '',
    notas: norm(r.notas || r.NOTAS) || '',
    grupo: norm(r.grupo || r.GRUPO) || null
  };
}

// Preview: parsea el archivo y devuelve estadísticas + lo que se va a crear
app.post('/api/import/preview', auth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  try {
    const parsed = parseImportFile(req.file.buffer, req.file.originalname);

    // Categorías existentes (case-insensitive)
    const catsDB = db.prepare('SELECT nombre, tipo FROM cats WHERE deleted = 0').all();
    const catsSet = new Set(catsDB.map(c => `${c.tipo}|${c.nombre.toUpperCase()}`));

    // Cajas existentes (por nombre)
    const cajasDB = db.prepare('SELECT id, nombre FROM cajas WHERE deleted = 0').all();
    const cajasMap = new Map(cajasDB.map(c => [c.nombre.toUpperCase(), c.id]));

    // Grupos existentes
    const groupsDB = db.prepare('SELECT nombre, tipo FROM groups WHERE deleted = 0').all();
    const groupsSet = new Set(groupsDB.map(g => `${g.tipo}|${g.nombre.toUpperCase()}`));

    // Detectar nuevas categorías a crear (de movs + de hoja CATS)
    const newCats = [];
    const seenCats = new Set();
    parsed.movs.forEach(m => {
      const key = `${m.tipo}|${m.categoria.toUpperCase()}`;
      if (!catsSet.has(key) && !seenCats.has(key)) {
        seenCats.add(key);
        // Buscar definición en hoja CATS
        const def = parsed.cats.find(c => c.tipo === m.tipo && c.nombre.toUpperCase() === m.categoria.toUpperCase());
        newCats.push(def || { nombre: m.categoria, tipo: m.tipo, icon: '📌', color: '#6B7280', grupo: m.grupo });
      }
    });
    parsed.cats.forEach(c => {
      const key = `${c.tipo}|${c.nombre.toUpperCase()}`;
      if (!catsSet.has(key) && !seenCats.has(key)) {
        seenCats.add(key);
        newCats.push(c);
      }
    });

    // Detectar nuevas cajas a crear
    const newCajas = [];
    const seenCajas = new Set();
    parsed.movs.forEach(m => {
      const key = m.caja.toUpperCase();
      if (!cajasMap.has(key) && !seenCajas.has(key)) {
        seenCajas.add(key);
        const def = parsed.cajas.find(c => c.nombre.toUpperCase() === key);
        newCajas.push(def || { nombre: m.caja, tipo: 'EFECTIVO', saldo_inicial: 0, permite_negativo: 1 });
      }
    });
    parsed.cajas.forEach(c => {
      const key = c.nombre.toUpperCase();
      if (!cajasMap.has(key) && !seenCajas.has(key)) {
        seenCajas.add(key);
        newCajas.push(c);
      }
    });

    // Nuevos grupos
    const newGroups = [];
    const seenGroups = new Set();
    parsed.movs.forEach(m => {
      if (!m.grupo) return;
      const key = `${m.tipo}|${m.grupo.toUpperCase()}`;
      if (!groupsSet.has(key) && !seenGroups.has(key)) {
        seenGroups.add(key);
        newGroups.push({ nombre: m.grupo, tipo: m.tipo, orden: 0 });
      }
    });
    parsed.groups.forEach(g => {
      const key = `${g.tipo}|${g.nombre.toUpperCase()}`;
      if (!groupsSet.has(key) && !seenGroups.has(key)) {
        seenGroups.add(key);
        newGroups.push(g);
      }
    });

    // Estadísticas
    const totalIngresos = parsed.movs.filter(m => m.tipo === 'INGRESO').reduce((s,m)=>s+m.monto,0);
    const totalGastos = parsed.movs.filter(m => m.tipo === 'GASTO').reduce((s,m)=>s+m.monto,0);
    const fechas = parsed.movs.map(m => m.fecha).sort();

    res.json({
      ok: true,
      stats: {
        movimientos: parsed.movs.length,
        ingresos_count: parsed.movs.filter(m => m.tipo === 'INGRESO').length,
        gastos_count: parsed.movs.filter(m => m.tipo === 'GASTO').length,
        total_ingresos: totalIngresos,
        total_gastos: totalGastos,
        neto: totalIngresos - totalGastos,
        fecha_min: fechas[0] || null,
        fecha_max: fechas[fechas.length - 1] || null,
        cats_nuevas: newCats.length,
        cajas_nuevas: newCajas.length,
        groups_nuevos: newGroups.length
      },
      newCats, newCajas, newGroups,
      warnings: parsed.warnings,
      // Devolvemos la data canónica para mandarla en commit (evita re-parsear)
      data: parsed
    });
  } catch (e) {
    console.error('Error en preview:', e);
    if (e.statusCode === 400) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: 'Error parseando archivo: ' + e.message });
  }
});

// Commit: ejecuta la importación con la data del preview
app.post('/api/import/commit', auth, requireAdmin, (req, res) => {
  const { data, filename, formato } = req.body || {};
  if (!data || !data.movs) return res.status(400).json({ error: 'data inválida' });

  const importId = newId('imp-');
  const now = Date.now();

  try {
    const tx = db.transaction(() => {
      // 1) Crear grupos nuevos
      const groupsInsertados = [];
      const groupsDB = db.prepare('SELECT id, nombre, tipo FROM groups WHERE deleted = 0').all();
      const groupsMap = new Map(groupsDB.map(g => [`${g.tipo}|${g.nombre.toUpperCase()}`, g.id]));
      const seenG = new Set();
      const allGroups = [...(data.groups || [])];
      // También grupos referenciados desde movs
      (data.movs || []).forEach(m => {
        if (m.grupo) allGroups.push({ nombre: m.grupo, tipo: m.tipo, orden: 0 });
      });
      allGroups.forEach(g => {
        const key = `${g.tipo}|${g.nombre.toUpperCase()}`;
        if (groupsMap.has(key) || seenG.has(key)) return;
        seenG.add(key);
        const gid = newId('g-');
        db.prepare(`INSERT INTO groups (id, tipo, nombre, orden, updated_at, deleted, import_id)
          VALUES (?, ?, ?, ?, ?, 0, ?)`).run(gid, g.tipo, g.nombre, g.orden || 0, now, importId);
        groupsMap.set(key, gid);
        groupsInsertados.push(gid);
      });

      // 2) Crear cajas nuevas
      const cajasInsertadas = [];
      const cajasDB = db.prepare('SELECT id, nombre FROM cajas WHERE deleted = 0').all();
      const cajasMap = new Map(cajasDB.map(c => [c.nombre.toUpperCase(), c.id]));
      const seenC = new Set();
      const allCajas = [...(data.cajas || [])];
      (data.movs || []).forEach(m => {
        if (m.caja) allCajas.push({ nombre: m.caja, tipo: 'EFECTIVO', saldo_inicial: 0, permite_negativo: 1 });
      });
      allCajas.forEach(c => {
        const key = c.nombre.toUpperCase();
        if (cajasMap.has(key) || seenC.has(key)) return;
        seenC.add(key);
        const cid = newId('caja-');
        const meta = c.tipo === 'EFECTIVO' ? { icon: '💵', color: '#2EC27E' }
                  : c.tipo === 'BANCO'    ? { icon: '🏦', color: '#3B82F6' }
                  : { icon: '💳', color: '#FF6B35' };
        db.prepare(`INSERT INTO cajas (id, tipo, nombre, banco, numero, saldo_inicial, fecha_inicial, moneda, permite_negativo, archivada, orden, color, icon, updated_at, deleted, import_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'MXN', ?, 0, 0, ?, ?, ?, 0, ?)`).run(
            cid, c.tipo || 'EFECTIVO', c.nombre, c.banco || null, c.numero || null,
            c.saldo_inicial || 0, c.fecha_inicial || new Date().toISOString().slice(0,10),
            c.permite_negativo ? 1 : 0, meta.color, meta.icon, now, importId
          );
        cajasMap.set(key, cid);
        cajasInsertadas.push(cid);
      });

      // 3) Crear categorías nuevas
      const catsInsertadas = [];
      const catsDB = db.prepare('SELECT id, nombre, tipo FROM cats WHERE deleted = 0').all();
      const catsMap = new Map(catsDB.map(c => [`${c.tipo}|${c.nombre.toUpperCase()}`, c.id]));
      const seenCa = new Set();
      const allCats = [...(data.cats || [])];
      (data.movs || []).forEach(m => {
        const k = `${m.tipo}|${m.categoria.toUpperCase()}`;
        if (!catsMap.has(k) && !seenCa.has(k)) {
          allCats.push({ nombre: m.categoria, tipo: m.tipo, icon: '📌', color: '#6B7280', grupo: m.grupo });
        }
      });
      allCats.forEach(c => {
        const key = `${c.tipo}|${c.nombre.toUpperCase()}`;
        if (catsMap.has(key) || seenCa.has(key)) return;
        seenCa.add(key);
        const cid = newId('cat-');
        const groupId = c.grupo ? groupsMap.get(`${c.tipo}|${c.grupo.toUpperCase()}`) : null;
        db.prepare(`INSERT INTO cats (id, nombre, tipo, icon, color, group_id, updated_at, deleted, import_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
            cid, c.nombre, c.tipo, c.icon || '📌', c.color || '#6B7280',
            groupId || null, now, importId
          );
        catsMap.set(key, cid);
        catsInsertadas.push(cid);
      });

      // 4) Insertar movimientos
      let movsInsertados = 0;
      const stmtMov = db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas, src, user_id, updated_at, deleted, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?, 0, ?)`);
      (data.movs || []).forEach((m, idx) => {
        const cajaId = cajasMap.get(m.caja.toUpperCase()) || 'caja-principal';
        const id = 'm-imp-' + now + '-' + idx;
        stmtMov.run(id, m.fecha, m.tipo, m.categoria, m.concepto || m.categoria,
          m.monto, m.metodo || 'EFECTIVO', cajaId, m.usuario || req.user.nombre,
          m.notas || '', req.user.id, now, importId);
        movsInsertados++;
      });

      // 5) Registrar import
      db.prepare(`INSERT INTO import_log (id, ts, user_id, user_nombre, filename, formato, total_movs, total_cats, total_cajas, total_groups, reverted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          importId, now, req.user.id, req.user.nombre,
          filename || 'import.xlsx', formato || 'xlsx',
          movsInsertados, catsInsertadas.length, cajasInsertadas.length, groupsInsertados.length
        );

      audit(req, 'import', 'movs', importId, JSON.stringify({
        movs: movsInsertados, cats: catsInsertadas.length, cajas: cajasInsertadas.length, groups: groupsInsertados.length, filename
      }));

      return { movsInsertados, catsInsertadas: catsInsertadas.length, cajasInsertadas: cajasInsertadas.length, groupsInsertados: groupsInsertados.length };
    });

    const result = tx();
    res.json({ ok: true, importId, ...result });
  } catch (e) {
    console.error('Error en commit:', e);
    res.status(500).json({ error: 'Error al importar: ' + e.message });
  }
});

// Revertir un import (marca todo lo creado como deleted)
app.post('/api/import/revert/:id', auth, requireAdmin, (req, res) => {
  const importId = req.params.id;
  const log = db.prepare('SELECT * FROM import_log WHERE id = ?').get(importId);
  if (!log) return res.status(404).json({ error: 'Import no encontrado' });
  if (log.reverted) return res.status(400).json({ error: 'Este import ya fue revertido' });

  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE import_id = ?').run(now, importId);
    db.prepare('UPDATE cats SET deleted = 1, updated_at = ? WHERE import_id = ?').run(now, importId);
    db.prepare('UPDATE cajas SET deleted = 1, updated_at = ? WHERE import_id = ?').run(now, importId);
    db.prepare('UPDATE groups SET deleted = 1, updated_at = ? WHERE import_id = ?').run(now, importId);
    db.prepare('UPDATE import_log SET reverted = 1, reverted_at = ? WHERE id = ?').run(now, importId);
  });
  tx();
  audit(req, 'revert_import', 'import', importId, null);
  res.json({ ok: true });
});

// Listar historial de imports
app.get('/api/import/log', auth, requireAdmin, (req, res) => {
  const entries = db.prepare('SELECT * FROM import_log ORDER BY ts DESC LIMIT 100').all();
  res.json({ entries });
});

// Exportar movimientos a XLSX/CSV/JSON
app.get('/api/export', auth, (req, res) => {
  const formato = (req.query.formato || 'xlsx').toLowerCase();
  const desde = req.query.desde || '';
  const hasta = req.query.hasta || '';
  const cajaFilter = req.query.caja || '';

  let sql = `SELECT m.fecha, m.tipo, m.categoria, m.concepto, m.monto, m.metodo,
             c.nombre AS caja, m.usuario, m.notas, COALESCE(m.afecta_saldo, 1) AS afecta_saldo
             FROM movs m LEFT JOIN cajas c ON m.caja = c.id
             WHERE m.deleted = 0`;
  const params = [];
  if (desde) { sql += ' AND m.fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND m.fecha <= ?'; params.push(hasta); }
  if (cajaFilter && cajaFilter !== 'all') { sql += ' AND m.caja = ?'; params.push(cajaFilter); }
  sql += ' ORDER BY m.fecha, m.id';
  const movs = db.prepare(sql).all(...params);

  if (formato === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kbotanas-export-${new Date().toISOString().slice(0,10)}.json"`);
    return res.send(JSON.stringify({ generated: new Date().toISOString(), movs }, null, 2));
  }

  if (formato === 'csv') {
    const headers = ['fecha','tipo','categoria','concepto','monto','metodo','caja','usuario','notas','afecta_saldo'];
    const lines = [headers.join(',')];
    movs.forEach(m => {
      const row = headers.map(h => {
        const v = m[h] == null ? '' : String(m[h]);
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
          return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      });
      lines.push(row.join(','));
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kbotanas-export-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send('\uFEFF' + lines.join('\n')); // BOM para Excel
  }

  // XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(movs.map(m => ({
    fecha: m.fecha, tipo: m.tipo, categoria: m.categoria, concepto: m.concepto || '',
    monto: m.monto, metodo: m.metodo || 'EFECTIVO', caja: m.caja || '',
    usuario: m.usuario || '', notas: m.notas || '', afecta_saldo: m.afecta_saldo
  })));
  // Anchos de columna razonables
  ws['!cols'] = [{wch:11},{wch:9},{wch:28},{wch:28},{wch:13},{wch:14},{wch:18},{wch:12},{wch:24},{wch:13}];
  XLSX.utils.book_append_sheet(wb, ws, 'MOVIMIENTOS');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="kbotanas-export-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.send(buf);
});


app.get('/api/audit', auth, requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const accion = req.query.accion || null;
  const entidad = req.query.entidad || null;
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (accion) { sql += ' AND accion = ?'; params.push(accion); }
  if (entidad) { sql += ' AND entidad = ?'; params.push(entidad); }
  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(limit);
  res.json({ entries: db.prepare(sql).all(...params) });
});

// ---------- Sync incremental ----------
app.get('/api/sync', auth, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const movsRaw = db.prepare('SELECT * FROM movs WHERE updated_at > ?').all(since);
  const cajasRaw = db.prepare('SELECT * FROM cajas WHERE updated_at > ?').all(since);
  // adjuntar saldo a cada caja viva
  cajasRaw.forEach(c => { if (!c.deleted) c.saldo_actual = calcularSaldoCaja(c.id); });
  // Cajas que el usuario tiene asignadas (vacío = todas, según convención)
  const misCajasRows = db.prepare('SELECT caja_id FROM user_cajas WHERE user_id = ?').all(req.user.id);
  res.json({
    movs: movsRaw,
    cats: db.prepare('SELECT * FROM cats WHERE updated_at > ?').all(since),
    groups: db.prepare('SELECT * FROM groups WHERE updated_at > ?').all(since),
    cajas: cajasRaw,
    budgets: db.prepare('SELECT * FROM budgets WHERE updated_at > ?').all(since),
    misCajas: misCajasRows.map(r => r.caja_id),
    miRol: req.user.rol,
    serverTime: Date.now()
  });
});

// ---------- arqueos (extraído a routes/arqueos.js, #6) ----------
require('./routes/arqueos')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });

// ---------- terceros (extraído a routes/terceros.js, #6) ----------
require('./routes/terceros')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });

// ---------- cxp (extraído a routes/cxp.js, #6) ----------
require('./routes/cxp')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });

// ---------- ordenes (extraído a routes/ordenes.js, #6) ----------
require('./routes/ordenes')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });

app.get('/', (_req, res) => res.json({ ok: true, name: 'K-BOTANAS API', version: '1.9.0' }));

// =============================================================
// K-BOTANAS · Backend v1.10.0 — Patches Módulo Ventas
//
// Pegar este bloque ENTERO en /opt/corte-kbomx/backend/server.js
// ANTES de la última línea (app.listen) o dentro del bloque de
// rutas según convención del archivo. Buscar comentario:
//   // === RUTAS DE COMPRAS ===
// y pegar este bloque INMEDIATAMENTE DESPUÉS del bloque de compras.
//
// Cambiar también la línea: const VERSION = 'v1.9.0';
// a:                        const VERSION = 'v1.10.0';
// =============================================================

// =============================================================
// K-BOTANAS · Backend v1.11.0 — Módulo Ventas REESCRITO
//
// CORRIGE bugs de v1.10.0:
//  - caja_id ahora es TEXT (no INTEGER)
//  - INSERT en movs usa columnas correctas (caja, monto, categoria, metodo, updated_at, etc.)
//  - Genera mov.id TEXT como 'm-venta-<ts>-<rand>' (no autoincrement)
//  - Todos los endpoints usan middleware `auth`
//  - Registra acciones en audit_log
//  - El mov queda en updated_at del momento, así el sync lo propaga al frontend
//  - Crea categoría en `cats` (no `categorias`) y grupo en `groups` (no `grupos`)
//
// APLICACIÓN:
//  1. Eliminar bloque anterior: borrar desde "// === RUTAS DE VENTAS ===" hasta
//     "// === FIN RUTAS DE VENTAS ===" (líneas 2973-3206 en server.js actual)
//  2. Pegar este bloque ENTERO antes de "app.listen(...)"
//  3. Reiniciar pm2: pm2 restart corte-kbomx
// ---------- ventas (extraído a routes/ventas.js, #6) ----------
require('./routes/ventas')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });

// K-BOTANAS · Backend Inteligencia Reportes v1.0
// Endpoint único /api/inteligencia/dashboard que devuelve TODOS los datos
// para el módulo de reportes ejecutivos del CEO.
//
// Aplicación:
//   Pegar este bloque ENTERO antes de "app.listen(...)" en server.js
// =============================================================

// === RUTAS DE INTELIGENCIA / REPORTES EJECUTIVOS ===

// Helper: rango con default últimos 30 días
function parseRango(req) {
  const hasta = (req.query.hasta || new Date().toISOString().slice(0, 10)).slice(0, 10);
  let desde = req.query.desde;
  if (!desde) {
    const d = new Date(hasta + 'T12:00:00');
    d.setDate(d.getDate() - 29);
    desde = d.toISOString().slice(0, 10);
  } else {
    desde = desde.slice(0, 10);
  }
  // Periodo anterior del mismo tamaño
  const desdeD = new Date(desde + 'T12:00:00');
  const hastaD = new Date(hasta + 'T12:00:00');
  const dias = Math.round((hastaD - desdeD) / 86400000) + 1;
  const prevHasta = new Date(desdeD); prevHasta.setDate(prevHasta.getDate() - 1);
  const prevDesde = new Date(prevHasta); prevDesde.setDate(prevDesde.getDate() - (dias - 1));
  return {
    desde, hasta, dias,
    prevDesde: prevDesde.toISOString().slice(0, 10),
    prevHasta: prevHasta.toISOString().slice(0, 10)
  };
}

app.get('/api/inteligencia/dashboard', auth, (req, res) => {
  try {
    const { desde, hasta, dias, prevDesde, prevHasta } = parseRango(req);

    // ============ MOVS por tipo ============
    const sumMovs = (d1, d2, tipo) => {
      const r = db.prepare(`
        SELECT
          COALESCE(SUM(monto), 0) AS total,
          COUNT(*) AS n
        FROM movs
        WHERE deleted = 0 AND tipo = ? AND fecha >= ? AND fecha <= ?
      `).get(tipo, d1, d2);
      return { total: r.total || 0, n: r.n || 0 };
    };

    const ingresos = sumMovs(desde, hasta, 'INGRESO');
    const gastos   = sumMovs(desde, hasta, 'GASTO');
    const ingresosPrev = sumMovs(prevDesde, prevHasta, 'INGRESO');
    const gastosPrev   = sumMovs(prevDesde, prevHasta, 'GASTO');

    const neto = ingresos.total - gastos.total;
    const netoPrev = ingresosPrev.total - gastosPrev.total;
    const margen = ingresos.total > 0 ? (neto / ingresos.total) * 100 : 0;

    const pctVar = (cur, prev) => {
      if (!prev) return cur > 0 ? 100 : 0;
      return ((cur - prev) / Math.abs(prev)) * 100;
    };

    // ============ Ventas (módulo ventas) ============
    const ventasInfo = db.prepare(`
      SELECT
        COALESCE(SUM(importe), 0) AS total,
        COUNT(*) AS n,
        COALESCE(AVG(importe), 0) AS ticket_promedio
      FROM ventas
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
    `).get(desde, hasta);

    const ventasPrevInfo = db.prepare(`
      SELECT COALESCE(SUM(importe), 0) AS total, COUNT(*) AS n
      FROM ventas WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
    `).get(prevDesde, prevHasta);

    // ============ Cortes (vendedores) ============
    const cortesInfo = db.prepare(`
      SELECT
        COALESCE(SUM(efectivo + transferencia + credito + cheque_vale_estimado + tarjetas_estimado), 0) AS total_cobrado,
        COALESCE(SUM(devoluciones), 0) AS devoluciones_total,
        COALESCE(SUM(ABS(diferencia)), 0) AS diferencias_abs_total,
        COUNT(*) AS n
      FROM (
        SELECT efectivo, transferencia, credito, gastos, devoluciones, diferencia,
          0 AS cheque_vale_estimado, 0 AS tarjetas_estimado
        FROM ventas_detalle_cortes
        WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      )
    `).get(desde, hasta);

    // ============ Serie diaria ============
    const serieDiariaRaw = db.prepare(`
      SELECT fecha, tipo, SUM(monto) AS total
      FROM movs
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      GROUP BY fecha, tipo
      ORDER BY fecha ASC
    `).all(desde, hasta);
    const ventasDiarias = db.prepare(`
      SELECT fecha, SUM(importe) AS total, COUNT(*) AS n
      FROM ventas
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      GROUP BY fecha
      ORDER BY fecha ASC
    `).all(desde, hasta);

    // Reconstruir serie día por día
    const serieMap = {};
    const addDays = (iso, n) => {
      const d = new Date(iso + 'T12:00:00');
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    for (let i = 0; i < dias; i++) {
      const f = addDays(desde, i);
      serieMap[f] = { fecha: f, ingresos: 0, gastos: 0, neto: 0, ventas: 0, ventas_n: 0 };
    }
    for (const r of serieDiariaRaw) {
      if (!serieMap[r.fecha]) continue;
      if (r.tipo === 'INGRESO') serieMap[r.fecha].ingresos = r.total;
      if (r.tipo === 'GASTO')   serieMap[r.fecha].gastos = r.total;
      serieMap[r.fecha].neto = serieMap[r.fecha].ingresos - serieMap[r.fecha].gastos;
    }
    for (const r of ventasDiarias) {
      if (!serieMap[r.fecha]) continue;
      serieMap[r.fecha].ventas = r.total;
      serieMap[r.fecha].ventas_n = r.n;
    }
    const serieDiaria = Object.values(serieMap);

    // Mejor y peor día por ventas
    let mejorDia = null, peorDia = null;
    serieDiaria.forEach(d => {
      if (d.ventas > 0) {
        if (!mejorDia || d.ventas > mejorDia.ventas) mejorDia = d;
        if (!peorDia || d.ventas < peorDia.ventas) peorDia = d;
      }
    });

    // ============ Por canal de venta ============
    const porCanal = db.prepare(`
      SELECT canal,
        COALESCE(SUM(importe), 0) AS total,
        COUNT(*) AS n
      FROM ventas
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      GROUP BY canal
      ORDER BY total DESC
    `).all(desde, hasta);
    // Agregar canal DETALLE-CORTE desde ventas_detalle_cortes
    const detalleCortes = db.prepare(`
      SELECT COALESCE(SUM(efectivo + transferencia + credito), 0) AS total, COUNT(*) AS n
      FROM ventas_detalle_cortes
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
    `).get(desde, hasta);
    if (detalleCortes.total > 0) {
      const ex = porCanal.find(c => c.canal === 'DETALLE');
      if (ex) { ex.total += detalleCortes.total; ex.n += detalleCortes.n; }
      else { porCanal.push({ canal: 'DETALLE', total: detalleCortes.total, n: detalleCortes.n }); }
    }
    porCanal.sort((a, b) => b.total - a.total);
    const ventasTotalUnif = porCanal.reduce((s, c) => s + c.total, 0);
    porCanal.forEach(c => c.pct = ventasTotalUnif > 0 ? (c.total / ventasTotalUnif) * 100 : 0);

    // ============ Desglose por grupo (P&L) ============
    const porGrupoIngreso = db.prepare(`
      SELECT
        COALESCE(g.nombre, 'SIN GRUPO') AS grupo,
        COALESCE(SUM(m.monto), 0) AS total,
        COUNT(m.id) AS n
      FROM movs m
      LEFT JOIN cats c ON c.nombre = m.categoria AND c.tipo = 'INGRESO' AND c.deleted = 0
      LEFT JOIN groups g ON g.id = c.group_id AND g.deleted = 0
      WHERE m.deleted = 0 AND m.tipo = 'INGRESO'
        AND m.fecha >= ? AND m.fecha <= ?
      GROUP BY grupo
      ORDER BY total DESC
    `).all(desde, hasta);
    porGrupoIngreso.forEach(g => g.pct = ingresos.total > 0 ? (g.total / ingresos.total) * 100 : 0);

    const porGrupoGasto = db.prepare(`
      SELECT
        COALESCE(g.nombre, 'SIN GRUPO') AS grupo,
        COALESCE(SUM(m.monto), 0) AS total,
        COUNT(m.id) AS n
      FROM movs m
      LEFT JOIN cats c ON c.nombre = m.categoria AND c.tipo = 'GASTO' AND c.deleted = 0
      LEFT JOIN groups g ON g.id = c.group_id AND g.deleted = 0
      WHERE m.deleted = 0 AND m.tipo = 'GASTO'
        AND m.fecha >= ? AND m.fecha <= ?
      GROUP BY grupo
      ORDER BY total DESC
    `).all(desde, hasta);
    porGrupoGasto.forEach(g => g.pct = gastos.total > 0 ? (g.total / gastos.total) * 100 : 0);

    // ============ Top vendedores ============
    const topVendedores = db.prepare(`
      SELECT
        v.id AS vendedor_id,
        v.nombre AS vendedor,
        v.sys_code AS code,
        v.tipo,
        v.ruta_default AS ruta,
        COALESCE(SUM(cd.efectivo + cd.transferencia + cd.credito), 0) AS ventas,
        COUNT(cd.id) AS cortes_count,
        COALESCE(AVG(ABS(cd.diferencia)), 0) AS diferencia_promedio,
        COALESCE(SUM(cd.devoluciones), 0) AS devoluciones,
        COALESCE(SUM(cd.diferencia), 0) AS diferencia_acumulada
      FROM vendedores v
      LEFT JOIN ventas_detalle_cortes cd
        ON cd.vendedor_id = v.id AND cd.deleted = 0
        AND cd.fecha >= ? AND cd.fecha <= ?
      WHERE v.deleted = 0
      GROUP BY v.id
      HAVING cortes_count > 0
      ORDER BY ventas DESC
      LIMIT 15
    `).all(desde, hasta);

    // ============ Top clientes (de ventas simples) ============
    const topClientes = db.prepare(`
      SELECT
        COALESCE(cliente, 'SIN CLIENTE') AS cliente,
        canal,
        COALESCE(SUM(importe), 0) AS total,
        COUNT(*) AS count,
        COALESCE(AVG(importe), 0) AS ticket_promedio
      FROM ventas
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
        AND cliente IS NOT NULL AND cliente != ''
      GROUP BY cliente, canal
      ORDER BY total DESC
      LIMIT 15
    `).all(desde, hasta);

    // ============ Rutas con problemas (mayor diferencia acumulada absoluta) ============
    const rutasProblema = db.prepare(`
      SELECT
        ruta,
        COALESCE(SUM(ABS(diferencia)), 0) AS diferencia_abs_acum,
        COALESCE(SUM(diferencia), 0) AS diferencia_acum,
        COALESCE(AVG(diferencia), 0) AS diferencia_promedio,
        COUNT(*) AS cortes_count
      FROM ventas_detalle_cortes
      WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      GROUP BY ruta
      ORDER BY diferencia_abs_acum DESC
      LIMIT 10
    `).all(desde, hasta);

    // ============ Top proveedores (compras) ============
    let topProveedores = [];
    try {
      topProveedores = db.prepare(`
        SELECT
          COALESCE(t.nombre, o.proveedor_nombre) AS proveedor,
          COALESCE(SUM(o.monto_real), 0) AS compras_total,
          COUNT(o.id) AS ordenes_count
        FROM ordenes_compra o
        LEFT JOIN terceros t ON t.id = o.proveedor_id
        WHERE o.deleted = 0 AND o.fecha_cierre >= ? AND o.fecha_cierre <= ?
          AND o.estado IN ('PAGADA', 'PENDIENTE_PAGO')
        GROUP BY COALESCE(o.proveedor_id, UPPER(o.proveedor_nombre))
        ORDER BY compras_total DESC
        LIMIT 10
      `).all(desde, hasta);
    } catch (e) { console.error('[inteligencia] top proveedores:', e.message); topProveedores = []; }

    // ============ CxP antigüedad ============
    let cxpAntiguedad = { vigente: 0, mes_1: 0, mes_2_mas: 0, total: 0, count: 0 };
    try {
      const cxpRows = db.prepare(`
        SELECT c.id, c.fecha_creacion AS fecha, c.monto_total AS total,
          COALESCE((SELECT SUM(a.monto) FROM cxp_abonos a WHERE a.cxp_id = c.id AND a.deleted = 0), 0) AS pagado
        FROM cxp c
        WHERE c.deleted = 0 AND c.direccion = 'PAGAR' AND c.estado NOT IN ('PAGADA', 'CANCELADA')
      `).all();
      const hoy = new Date();
      for (const row of cxpRows) {
        const saldo = (row.total || 0) - (row.pagado || 0);
        if (saldo <= 0.01) continue;
        const f = new Date(row.fecha + 'T12:00:00');
        const dias = Math.round((hoy - f) / 86400000);
        if (dias <= 30) cxpAntiguedad.vigente += saldo;
        else if (dias <= 60) cxpAntiguedad.mes_1 += saldo;
        else cxpAntiguedad.mes_2_mas += saldo;
        cxpAntiguedad.total += saldo;
        cxpAntiguedad.count++;
      }
    } catch (e) { console.error('[inteligencia] antigüedad CxP:', e.message); }

    // ============ Saldos de cajas (todas activas) ============
    const cajasInfo = db.prepare(`
      SELECT id, nombre, tipo, saldo_inicial, fecha_inicial
      FROM cajas
      WHERE deleted = 0 AND archivada = 0
      ORDER BY tipo, nombre
    `).all();
    const saldosCajas = cajasInfo.map(c => {
      const fi = c.fecha_inicial || '';
      // v1.15.2: respeta afecta_saldo (gastos descontados de cortes no mueven caja)
      const movsCaja = db.prepare(`
        SELECT tipo, COALESCE(SUM(monto), 0) AS total
        FROM movs
        WHERE caja = ? AND deleted = 0 AND COALESCE(afecta_saldo, 1) = 1
        ${fi ? 'AND fecha >= ?' : ''}
        GROUP BY tipo
      `).all(...(fi ? [c.id, fi] : [c.id]));
      let saldo = c.saldo_inicial || 0;
      movsCaja.forEach(m => {
        if (m.tipo === 'INGRESO') saldo += m.total;
        else if (m.tipo === 'GASTO') saldo -= m.total;
      });
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, saldo };
    });

    // ============ Últimas acciones (audit log) ============
    const ultimasAcciones = db.prepare(`
      SELECT ts, user_nombre, rol, accion, entidad, detalle, pin_validado
      FROM audit_log
      ORDER BY ts DESC
      LIMIT 25
    `).all();

    res.json({
      rango: { desde, hasta, dias, prevDesde, prevHasta },
      kpis: {
        ingresos: ingresos.total,
        gastos: gastos.total,
        neto,
        margen_pct: margen,
        ingresos_prev: ingresosPrev.total,
        gastos_prev: gastosPrev.total,
        neto_prev: netoPrev,
        var_ingresos_pct: pctVar(ingresos.total, ingresosPrev.total),
        var_gastos_pct: pctVar(gastos.total, gastosPrev.total),
        var_neto_pct: pctVar(neto, netoPrev),
        movs_count: ingresos.n + gastos.n,
        ventas_total: ventasInfo.total,
        ventas_count: ventasInfo.n,
        ventas_total_prev: ventasPrevInfo.total,
        ventas_count_prev: ventasPrevInfo.n,
        var_ventas_pct: pctVar(ventasInfo.total, ventasPrevInfo.total),
        ticket_promedio: ventasInfo.ticket_promedio,
        cortes_count: cortesInfo.n,
        cortes_total_cobrado: cortesInfo.total_cobrado,
        devoluciones_total: cortesInfo.devoluciones_total,
        diferencias_abs_total: cortesInfo.diferencias_abs_total,
        mejor_dia: mejorDia,
        peor_dia: peorDia
      },
      serie_diaria: serieDiaria,
      por_canal: porCanal,
      por_grupo_ingreso: porGrupoIngreso,
      por_grupo_gasto: porGrupoGasto,
      top_vendedores: topVendedores,
      top_clientes: topClientes,
      rutas_problema: rutasProblema,
      top_proveedores: topProveedores,
      cxp_antiguedad: cxpAntiguedad,
      saldos_cajas: saldosCajas,
      ultimas_acciones: ultimasAcciones
    });
  } catch (e) {
    console.error('dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// === FIN RUTAS DE INTELIGENCIA ===

// =============================================================
// K-BOTANAS · Backend Viáticos v1.0
// Endpoints CRUD + Comprobación con generación automática de movs
//
// Aplicación: pegar este bloque ANTES de "app.listen(...)" en server.js
// Convención: "// === RUTAS DE VIATICOS ===" como marcador
// =============================================================

// ---------- viaticos (extraído a routes/viaticos.js, #6) ----------
require('./routes/viaticos')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });


// =============================================================
// K-BOTANAS · Backend Backup & Restore v1.0
// Endpoints para backup completo, por tabla, y restauración con triple confirmación
// Requiere: rol admin para todas las operaciones
// Aplicación: pegar antes de "app.listen(...)" en server.js
// Dependencias: child_process, fs, path (todos built-in de Node)
// =============================================================

// === RUTAS DE BACKUP & RESTORE ===
const __backupFs = require('fs');
const __backupPath = require('path');
const __backupCp = require('child_process');
const __dbPath = '/opt/corte-kbomx/data/kbotanas.db';
const __backupDir = '/opt/corte-kbomx/backups';
const __backupAutoDir = '/opt/corte-kbomx/backups/auto';

// Asegurar directorios
try { __backupFs.mkdirSync(__backupAutoDir, { recursive: true }); } catch (e) {}

// Helper: middleware requiere admin
function __requireAdminBackup(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden acceder a backups' });
  }
  next();
}

// Helper: listar todas las tablas usuario (excluyendo internas de sqlite)
function __listAllTables() {
  return db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(r => r.name);
}

// GET /api/backup/list-tables — lista de tablas con # registros
app.get('/api/backup/list-tables', auth, __requireAdminBackup, (req, res) => {
  try {
    const tables = __listAllTables();
    const result = tables.map(t => {
      let count = 0, hasDeleted = false, activeCount = 0;
      try {
        count = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
        const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
        hasDeleted = cols.includes('deleted');
        if (hasDeleted) {
          activeCount = db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE deleted = 0`).get().n;
        } else {
          activeCount = count;
        }
      } catch (e) {}
      return { name: t, count, active: activeCount, has_deleted: hasDeleted };
    });
    res.json({
      tables: result,
      db_size: __backupFs.statSync(__dbPath).size,
      db_path: __dbPath
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backup/full-db — descarga la BD entera como archivo binario
app.get('/api/backup/full-db', auth, __requireAdminBackup, async (req, res) => {
  // Snapshot con la API de backup de SQLite: incluye lo que aún vive en el WAL.
  // Descargar el .db crudo entregaba la BD sin las transacciones no volcadas.
  // Sin punto inicial: res.download ignora los dotfiles (404 al callback).
  const tmp = __backupPath.join(__backupDir, `tmp-download-${Date.now()}-${process.pid}.db`);
  try {
    const fname = `kbotanas-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.db`;
    await db.backup(tmp);
    audit(req, 'BACKUP_DOWNLOAD_DB', 'backup', '', `Descarga backup completo`);
    res.download(tmp, fname, (err) => {
      __backupFs.unlink(tmp, () => {});
      // Con callback, Express NO responde el error por su cuenta: sin esto la petición queda colgada
      if (err && !res.headersSent) res.status(500).json({ error: err.message });
    });
  } catch (e) {
    __backupFs.unlink(tmp, () => {});
    res.status(500).json({ error: e.message });
  }
});

// GET /api/backup/full-sql — descarga dump SQL como texto
app.get('/api/backup/full-sql', auth, __requireAdminBackup, (req, res) => {
  try {
    const tmpFile = '/tmp/kbotanas-dump-' + Date.now() + '.sql';
    // Usar sqlite3 CLI para hacer el dump
    __backupCp.execSync(`sqlite3 "${__dbPath}" .dump > "${tmpFile}"`, { stdio: 'pipe' });
    const fname = `kbotanas-dump-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.sql`;
    audit(req, 'BACKUP_DOWNLOAD_SQL', 'backup', '', `Descarga SQL dump`);
    res.download(tmpFile, fname, (err) => {
      // Limpiar archivo temporal después de enviar
      try { __backupFs.unlinkSync(tmpFile); } catch (e) {}
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backup/table/:name?format=json|csv — descarga 1 tabla
app.get('/api/backup/table/:name', auth, __requireAdminBackup, (req, res) => {
  try {
    const name = req.params.name;
    const format = (req.query.format || 'json').toLowerCase();
    const allTables = __listAllTables();
    if (!allTables.includes(name)) return res.status(404).json({ error: 'tabla no existe' });
    const rows = db.prepare(`SELECT * FROM "${name}"`).all();
    audit(req, 'BACKUP_TABLE', 'backup', name, `${rows.length} registros descargados (${format})`);
    if (format === 'csv') {
      if (rows.length === 0) return res.send('');
      const headers = Object.keys(rows[0]);
      const escape = (v) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send('\uFEFF' + csv); // BOM para Excel
    }
    // default: json
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0,10)}.json"`);
    res.send(JSON.stringify({ table: name, exported_at: Date.now(), rows }, null, 2));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backup/auto-list — listado de backups automáticos en /backups/auto/
app.get('/api/backup/auto-list', auth, __requireAdminBackup, (req, res) => {
  try {
    if (!__backupFs.existsSync(__backupAutoDir)) {
      return res.json({ files: [], dir: __backupAutoDir });
    }
    const files = __backupFs.readdirSync(__backupAutoDir)
      .filter(f => f.endsWith('.db') || f.endsWith('.sql') || f.endsWith('.tar.gz'))
      .map(f => {
        const fp = __backupPath.join(__backupAutoDir, f);
        const st = __backupFs.statSync(fp);
        return { name: f, size: st.size, mtime: st.mtime.getTime() };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ files, dir: __backupAutoDir });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backup/auto-download/:filename — descargar un backup auto específico
app.get('/api/backup/auto-download/:filename', auth, __requireAdminBackup, (req, res) => {
  try {
    const fname = __backupPath.basename(req.params.filename); // sanitize
    const fp = __backupPath.join(__backupAutoDir, fname);
    if (!__backupFs.existsSync(fp)) return res.status(404).json({ error: 'no existe' });
    audit(req, 'BACKUP_AUTO_DOWNLOAD', 'backup', fname, 'Descarga backup automático');
    res.download(fp, fname);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/backup/auto-run — crear backup automático manualmente
app.post('/api/backup/auto-run', auth, __requireAdminBackup, async (req, res) => {
  try {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const dest = __backupPath.join(__backupAutoDir, `kbotanas-MANUAL-${ts}.db`);
    await db.backup(dest); // consistente (incluye el WAL), igual que el cron con sqlite3 .backup
    const st = __backupFs.statSync(dest);
    audit(req, 'BACKUP_RUN', 'backup', dest, `Backup manual creado: ${(st.size/1024).toFixed(1)} KB`);
    res.json({ ok: true, file: __backupPath.basename(dest), size: st.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/backup/restore-full — restaurar BD completa desde archivo subido
// Requiere: confirmation_token === "RESTAURAR" + password admin verificada
// Body: { confirmation_token, password, db_base64 }
app.post('/api/backup/restore-full', auth, __requireAdminBackup, (req, res) => {
  // DESHABILITADA: el flujo de abajo sobrescribe el .db con la BD abierta en modo WAL.
  // El -wal viejo queda junto al archivo nuevo y SQLite lo reaplica encima → corrupción;
  // además el respaldo de seguridad (copyFileSync) puede omitir lo que vive en el WAL.
  // Antes de reactivarla: db.backup() para el respaldo, integrity_check del archivo
  // subido, db.close(), borrar -wal/-shm, copiar y reiniciar. Ver docs/AUDITORIA-2026-06.md.
  return res.status(503).json({ error: 'La restauración completa está deshabilitada por seguridad. Solicítala al administrador del servidor.' });
  // eslint-disable-next-line no-unreachable
  try {
    const { confirmation_token, password, db_base64 } = req.body || {};
    if (confirmation_token !== 'RESTAURAR') {
      return res.status(400).json({ error: 'Token de confirmación inválido. Debes escribir RESTAURAR exactamente.' });
    }
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
    if (!db_base64) return res.status(400).json({ error: 'Archivo de backup requerido' });

    // Verificar password del admin
    const userRow = db.prepare('SELECT * FROM users WHERE id = ? AND activo = 1').get(req.user.id);
    if (!userRow) return res.status(403).json({ error: 'Usuario no existe' });
    const bcrypt = require('bcryptjs');
    const ok = bcrypt.compareSync(password, userRow.password || '');
    if (!ok) {
      audit(req, 'RESTORE_PASSWORD_FAIL', 'backup', '', 'Intento de restauración con password incorrecta');
      return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    // Decodificar archivo
    const buffer = Buffer.from(db_base64, 'base64');
    if (buffer.length < 1000) return res.status(400).json({ error: 'Archivo demasiado pequeño, ¿es un .db válido?' });
    if (buffer.length > 100 * 1024 * 1024) return res.status(400).json({ error: 'Archivo > 100 MB, demasiado grande' });

    // Verificar magic bytes SQLite ("SQLite format 3\0")
    const magic = buffer.slice(0, 16).toString();
    if (!magic.startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'No es un archivo SQLite válido (magic bytes incorrectos)' });
    }

    // Guardar a archivo temporal y validar abriéndolo
    const tmpFile = '/tmp/kbotanas-restore-' + Date.now() + '.db';
    __backupFs.writeFileSync(tmpFile, buffer);

    // Hacer backup del actual ANTES de restaurar
    const tsBackup = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const safetyBackup = __backupPath.join(__backupDir, `kbotanas-PRE-RESTORE-${tsBackup}.db`);
    __backupFs.copyFileSync(__dbPath, safetyBackup);

    audit(req, 'RESTORE_FULL_INIT', 'backup',
      'safety: ' + __backupPath.basename(safetyBackup),
      `Tamaño nuevo: ${(buffer.length/1024).toFixed(1)} KB · admin: ${req.user.nombre}`);

    // Reemplazar BD (debe hacerse antes de que el proceso muera)
    // Como el server tiene la BD abierta, lo más limpio es: copiar el nuevo encima, luego salir
    __backupFs.copyFileSync(tmpFile, __dbPath);
    try { __backupFs.unlinkSync(tmpFile); } catch (e) {}

    // Responder ANTES de matarse
    res.json({
      ok: true,
      safety_backup: __backupPath.basename(safetyBackup),
      message: 'Restauración aplicada. El servidor se reiniciará automáticamente en 2 segundos.'
    });

    // Salir limpiamente para que pm2 lo reinicie con la nueva BD
    setTimeout(() => {
      console.log('[BACKUP] Restauración completa. Reiniciando para releer BD...');
      process.exit(0);
    }, 2000);
  } catch (e) {
    console.error('[BACKUP] Error en restore-full:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/restore-table/:name — restaurar 1 tabla desde JSON
// Body: { confirmation_token: "RESTAURAR-TABLA", mode: "replace"|"merge", rows: [...] }
app.post('/api/backup/restore-table/:name', auth, __requireAdminBackup, (req, res) => {
  const tx = db.transaction((tableName, body) => {
    if (body.confirmation_token !== 'RESTAURAR-TABLA') {
      throw new Error('Token de confirmación inválido (esperado: RESTAURAR-TABLA)');
    }
    const allTables = __listAllTables();
    if (!allTables.includes(tableName)) throw new Error('tabla no existe');
    if (tableName === 'users') throw new Error('Por seguridad, la tabla users no se puede restaurar por este método. Usa restauración completa.');
    if (tableName === 'audit_log') throw new Error('audit_log es inmutable, no se puede sobrescribir.');

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all().map(c => c.name);
    if (cols.length === 0) throw new Error('tabla sin columnas');

    // Validar que las filas tengan al menos las columnas críticas
    let inserted = 0, replaced = 0, skipped = 0;

    if (mode === 'replace') {
      // Soft replace: marcar deleted=1 todos los actuales (si tiene columna deleted), o DELETE
      if (cols.includes('deleted')) {
        db.prepare(`UPDATE "${tableName}" SET deleted = 1`).run();
      } else {
        db.prepare(`DELETE FROM "${tableName}"`).run();
      }
    }

    // Filtrar columnas válidas en cada fila y construir INSERT OR REPLACE
    const placeholders = cols.map(() => '?').join(',');
    const stmt = db.prepare(`INSERT OR REPLACE INTO "${tableName}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`);

    for (const row of rows) {
      const values = cols.map(c => row[c] !== undefined ? row[c] : null);
      try {
        stmt.run(...values);
        inserted++;
      } catch (e) { skipped++; }
    }

    audit(req, 'RESTORE_TABLE', 'backup', tableName,
      `Modo: ${mode} · Insertados/reemplazados: ${inserted} · Saltados: ${skipped}`);

    return { ok: true, inserted, skipped, mode };
  });

  try { res.json(tx(req.params.name, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// === FIN RUTAS DE BACKUP ===

// ---------- nomina (extraído a routes/nomina.js, #6) ----------
require('./routes/nomina')(app, db, { requireAuth: auth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log: console.log });



// === Mejoras Nómina v1 (T2 + T3 + T4 + T5) ===
const mountNominaExtensions = require("./nomina-extensions");
mountNominaExtensions(app, db, { requireAuth: auth, log: console.log });
// F1_PAGOS_INDIVIDUALES_MOUNT — feature F1 pagos individuales
const mountNominaPagosIndividuales = require("./nomina-pagos-individuales");
mountNominaPagosIndividuales(app, db, { requireAuth: auth, log: console.log, audit: audit });
// F4_CIERRE_DIA — feature F4 cierre de día de ventas
// HOTFIX_ROUTE_ORDER_CIERRES_DIA — mount movido arriba (antes de /api/ventas/:id) para evitar colisión con Express.
// const mountVentasCierresDia = require("./ventas-cierres-dia");  ← movido
// mountVentasCierresDia(app, db, { ... });                         ← movido
// const _f4_isDiaCerrado = require("./ventas-cierres-dia").isDiaCerrado;  ← movido

// ============================================================================
// AJUSTES GLOBALES (app_settings) — configuración compartida clave-valor
// Usado por el Reporte Financiero para clasificar categorías en secciones
// (Ingresos / Costo de venta / Gastos / Transferencias).
// ============================================================================
// GET: cualquier usuario autenticado puede leer (necesario para ver el reporte)
app.get('/api/settings/:key', auth, (req, res) => {
  const row = db.prepare('SELECT key, value, updated_at, updated_by FROM app_settings WHERE key = ?').get(req.params.key);
  if (!row) return res.json({ key: req.params.key, value: null, updated_at: null });
  let parsed = row.value;
  try { parsed = JSON.parse(row.value); } catch (e) { /* dejar como texto */ }
  res.json({ key: row.key, value: parsed, updated_at: row.updated_at, updated_by: row.updated_by });
});

// PUT: solo admin/gerente puede cambiar la configuración global
app.put('/api/settings/:key', auth, requireRole(['admin', 'gerente']), (req, res) => {
  const key = req.params.key;
  if (!key) return res.status(400).json({ error: 'key requerida' });
  let value = req.body && Object.prototype.hasOwnProperty.call(req.body, 'value') ? req.body.value : req.body;
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  const now = Date.now();
  db.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(key, valueStr, now, req.user?.nombre || req.user?.id || null);
  res.json({ ok: true, key, updated_at: now });
});

// ---------- Error handler global (red de seguridad para errores síncronos no capturados) ----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', req.method, req.url, err);
  if (res.headersSent) return next(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`🌶️  K-BOTANAS API corriendo en http://localhost:${PORT}`);
  console.log(`   Base de datos: ${DB_FILE}`);
});
