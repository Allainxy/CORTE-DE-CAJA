// server.js — API REST para K-BOTANAS
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'kbot-cambia-este-secreto-' + Math.random();
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'kbotanas.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

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

// 8d) Auto-crear categorías MERCANCIA y 6 áreas si no existen
const AREAS_COMPRAS = ['MAQUILA', 'DULCERIA', 'CACAHUATE', 'GOMITAS', 'CHOCOLATE', 'RUTAS'];
function asegurarCategoriasMercancia() {
  // Grupo MERCANCIA debe existir
  let grupoMer = db.prepare("SELECT id FROM groups WHERE nombre = 'MERCANCIA' AND tipo = 'GASTO' AND deleted = 0").get();
  if (!grupoMer) {
    const id = 'g-mer';
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO groups (id, nombre, tipo, color, icon, created_at, updated_at, deleted)
                VALUES (?, 'MERCANCIA', 'GASTO', '#D62828', '📥', ?, ?, 0)`).run(id, now, now);
    grupoMer = { id };
    console.log('🔧 Grupo MERCANCIA creado');
  }
  // Categoría base "MERCANCIA" (sin área)
  const tieneBase = db.prepare("SELECT id FROM cats WHERE nombre = 'MERCANCIA' AND tipo = 'GASTO' AND deleted = 0").get();
  if (!tieneBase) {
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO cats (id, nombre, tipo, group_id, color, icon, created_at, updated_at, deleted)
                VALUES ('c-mer-base', 'MERCANCIA', 'GASTO', ?, '#D62828', '📦', ?, ?, 0)`).run(grupoMer.id, now, now);
    console.log('🔧 Categoría MERCANCIA (base) creada');
  }
  // Categorías por área
  for (const area of AREAS_COMPRAS) {
    const nombre = 'MERCANCIA - ' + area;
    const existe = db.prepare("SELECT id FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0").get(nombre);
    if (!existe) {
      const id = 'c-mer-' + area.toLowerCase();
      const now = Date.now();
      db.prepare(`INSERT OR IGNORE INTO cats (id, nombre, tipo, group_id, color, icon, created_at, updated_at, deleted)
                  VALUES (?, ?, 'GASTO', ?, '#D62828', '📦', ?, ?, 0)`).run(id, nombre, grupoMer.id, now, now);
      console.log('🔧 Categoría ' + nombre + ' creada');
    }
  }
}
try { asegurarCategoriasMercancia(); } catch (e) { console.error('Error categorías mercancía:', e.message); }

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

const app = express();
app.use(cors());
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
app.get('/api/movs', auth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM movs WHERE deleted = 0 ORDER BY fecha DESC').all();
  res.json({ movs: rows });
});

app.post('/api/movs', auth, (req, res) => {
  const m = req.body;
  if (!m?.id || !m.fecha || !m.tipo) return res.status(400).json({ error: 'Datos incompletos' });
  const now = Date.now();
  db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, caja_destino, transfer_id, usuario, notas, src, user_id, updated_at, deleted)
    VALUES (@id, @fecha, @tipo, @categoria, @concepto, @monto, @metodo, @caja, @caja_destino, @transfer_id, @usuario, @notas, @src, @user_id, @updated_at, 0)
    ON CONFLICT(id) DO UPDATE SET
      fecha=@fecha, tipo=@tipo, categoria=@categoria, concepto=@concepto, monto=@monto,
      metodo=@metodo, caja=@caja, caja_destino=@caja_destino, transfer_id=@transfer_id,
      usuario=@usuario, notas=@notas, src=@src, updated_at=@updated_at, deleted=0`).run({
    id: m.id, fecha: m.fecha, tipo: m.tipo, categoria: m.categoria || '',
    concepto: m.concepto || '', monto: Number(m.monto) || 0,
    metodo: m.metodo || 'EFECTIVO', caja: m.caja || 'caja-principal',
    caja_destino: m.caja_destino || null, transfer_id: m.transfer_id || null,
    usuario: m.usuario || req.user.nombre, notas: m.notas || '',
    src: m.src || 'manual', user_id: req.user.id, updated_at: now
  });
  res.json({ ok: true, id: m.id });
});

app.post('/api/movs/bulk', auth, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items requerido' });
  const now = Date.now();
  const stmt = db.prepare(`INSERT INTO movs (id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas, src, user_id, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET fecha=excluded.fecha, tipo=excluded.tipo, categoria=excluded.categoria,
      concepto=excluded.concepto, monto=excluded.monto, metodo=excluded.metodo, caja=excluded.caja,
      usuario=excluded.usuario, notas=excluded.notas, src=excluded.src, updated_at=excluded.updated_at, deleted=0`);
  const tx = db.transaction((arr) => {
    for (const m of arr) {
      stmt.run(m.id, m.fecha, m.tipo, m.categoria || '', m.concepto || '', Number(m.monto) || 0,
        m.metodo || 'EFECTIVO', m.caja || 'PRINCIPAL', m.usuario || req.user.nombre,
        m.notas || '', m.src || 'xml', req.user.id, now);
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

// ---------- Grupos contables (solo admin para crear/editar/borrar) ----------
app.get('/api/groups', auth, (_req, res) => {
  res.json({ groups: db.prepare('SELECT * FROM groups WHERE deleted = 0 ORDER BY tipo, orden, nombre').all() });
});

app.post('/api/groups', auth, requireAdmin, (req, res) => {
  const g = req.body;
  if (!g?.id || !g.nombre || !g.tipo) return res.status(400).json({ error: 'Datos incompletos' });
  if (g.tipo !== 'INGRESO' && g.tipo !== 'GASTO') return res.status(400).json({ error: 'tipo debe ser INGRESO o GASTO' });
  db.prepare(`INSERT INTO groups (id, tipo, nombre, orden, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, nombre=excluded.nombre, orden=excluded.orden, updated_at=excluded.updated_at, deleted=0`)
    .run(g.id, g.tipo, g.nombre, Number(g.orden) || 0, Date.now());
  res.json({ ok: true });
});

app.delete('/api/groups/:id', auth, requireAdmin, (req, res) => {
  // Solo eliminar si no tiene categorías activas asociadas
  const inUse = db.prepare('SELECT COUNT(*) AS n FROM cats WHERE group_id = ? AND deleted = 0').get(req.params.id);
  if (inUse.n > 0) return res.status(409).json({ error: `No se puede eliminar: ${inUse.n} categoría(s) lo usan` });
  db.prepare('UPDATE groups SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.json({ ok: true });
});

// PUT: editar grupo (solo admin). Solo permitimos cambiar nombre y orden.
// El tipo NO se puede cambiar para evitar inconsistencias con movimientos.
app.put('/api/groups/:id', auth, requireAdmin, (req, res) => {
  const g = req.body;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM groups WHERE id = ? AND deleted = 0').get(id);
  if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });
  const nombre = g.nombre?.trim() || existing.nombre;
  const orden = Number.isFinite(g.orden) ? Number(g.orden) : existing.orden;
  db.prepare('UPDATE groups SET nombre = ?, orden = ?, updated_at = ? WHERE id = ?')
    .run(nombre, orden, Date.now(), id);
  res.json({ ok: true });
});

// POST /api/groups/reorder: actualiza el orden de varios grupos a la vez (solo admin)
app.post('/api/groups/reorder', auth, requireAdmin, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items requerido' });
  const stmt = db.prepare('UPDATE groups SET orden = ?, updated_at = ? WHERE id = ?');
  const tx = db.transaction((arr) => {
    const now = Date.now();
    for (const it of arr) stmt.run(Number(it.orden) || 0, now, it.id);
  });
  tx(items);
  res.json({ ok: true, count: items.length });
});

// ---------- Categorías ----------
app.get('/api/cats', auth, (_req, res) => {
  res.json({ cats: db.prepare('SELECT * FROM cats WHERE deleted = 0').all() });
});

app.post('/api/cats', auth, (req, res) => {
  const c = req.body;
  if (!c?.id || !c.nombre) return res.status(400).json({ error: 'Datos incompletos' });
  db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, nombre=excluded.nombre, color=excluded.color, icon=excluded.icon, group_id=excluded.group_id, updated_at=excluded.updated_at, deleted=0`)
    .run(c.id, c.tipo, c.nombre, c.color || '', c.icon || '', c.group_id || null, Date.now());
  res.json({ ok: true });
});

app.delete('/api/cats/:id', auth, requireAdmin, (req, res) => {
  db.prepare('UPDATE cats SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.json({ ok: true });
});

// PUT /api/cats/:id — editar categoría (solo admin)
// Permite cambiar nombre, ícono, color y group_id. NO permite cambiar tipo (INGRESO/GASTO)
// para evitar inconsistencias con los movimientos ya capturados.
app.put('/api/cats/:id', auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const c = req.body;
  const existing = db.prepare('SELECT * FROM cats WHERE id = ? AND deleted = 0').get(id);
  if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

  // Si se reasigna a otro grupo, validar que el grupo nuevo sea del mismo tipo
  let newGroupId = c.group_id !== undefined ? c.group_id : existing.group_id;
  if (newGroupId) {
    const g = db.prepare('SELECT tipo FROM groups WHERE id = ? AND deleted = 0').get(newGroupId);
    if (!g) return res.status(400).json({ error: 'Grupo destino no existe' });
    if (g.tipo !== existing.tipo) {
      return res.status(400).json({ error: `No se puede mover a un grupo ${g.tipo}: la categoría es ${existing.tipo}` });
    }
  }

  const nombre = c.nombre?.trim() || existing.nombre;
  const color = c.color !== undefined ? c.color : existing.color;
  const icon = c.icon !== undefined ? c.icon : existing.icon;

  db.prepare('UPDATE cats SET nombre = ?, color = ?, icon = ?, group_id = ?, updated_at = ? WHERE id = ?')
    .run(nombre, color, icon, newGroupId || null, Date.now(), id);

  // Si renombró Y el cliente lo solicitó, actualizar movimientos en cascada
  let movsUpdated = 0;
  if (c.cascadeRename && nombre !== existing.nombre) {
    const r = db.prepare('UPDATE movs SET categoria = ?, updated_at = ? WHERE categoria = ? AND tipo = ? AND deleted = 0')
      .run(nombre, Date.now(), existing.nombre, existing.tipo);
    movsUpdated = r.changes;
  }

  res.json({ ok: true, movsUpdated });
});

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
  return (caja.saldo_inicial || 0) + (ingresos.s || 0) - (gastos.s || 0);
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
    if (saldoOrigen - m < 0) {
      return res.status(409).json({ error: `Saldo insuficiente en ${origen.nombre} ($${saldoOrigen.toFixed(2)} disponible)` });
    }
  }

  const tid = transfer_id || ('t-' + Date.now() + '-' + Math.floor(Math.random() * 9999));
  const f = fecha || new Date().toISOString().slice(0, 10);
  const concept = concepto || `Transferencia ${origen.nombre} → ${destino.nombre}`;
  const now = Date.now();
  const idGasto = 'm-tg-' + Date.now() + '-' + Math.floor(Math.random() * 999);
  const idIngreso = 'm-ti-' + Date.now() + '-' + Math.floor(Math.random() * 999);

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

  const id = 'u-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
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
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
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
    res.status(500).json({ error: 'Error parseando archivo: ' + e.message });
  }
});

// Commit: ejecuta la importación con la data del preview
app.post('/api/import/commit', auth, requireAdmin, (req, res) => {
  const { data, filename, formato } = req.body || {};
  if (!data || !data.movs) return res.status(400).json({ error: 'data inválida' });

  const importId = 'imp-' + Date.now() + '-' + Math.floor(Math.random()*9999);
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
        const gid = 'g-' + Date.now() + '-' + Math.floor(Math.random()*99999);
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
        const cid = 'caja-' + Date.now() + '-' + Math.floor(Math.random()*99999);
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
        const cid = 'cat-' + Date.now() + '-' + Math.floor(Math.random()*99999);
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

// ---------- ARQUEOS DE CAJA ----------
// Listar arqueos con filtros opcionales
app.get('/api/arqueos', auth, (req, res) => {
  const { desde, hasta, caja_id, estado, limit } = req.query;
  let sql = 'SELECT * FROM arqueos WHERE deleted = 0';
  const params = [];
  if (desde) { sql += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND fecha <= ?'; params.push(hasta); }
  if (caja_id && caja_id !== 'all') { sql += ' AND caja_id = ?'; params.push(caja_id); }
  if (estado && estado !== 'all') { sql += ' AND estado = ?'; params.push(estado); }
  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(parseInt(limit) || 200);
  const arqueos = db.prepare(sql).all(...params);
  // Parsear denominaciones JSON
  arqueos.forEach(a => {
    try { a.denominaciones = a.denominaciones ? JSON.parse(a.denominaciones) : null; }
    catch { a.denominaciones = null; }
  });
  res.json({ arqueos });
});

// Obtener detalle de un arqueo
app.get('/api/arqueos/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM arqueos WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arqueo no encontrado' });
  try { a.denominaciones = a.denominaciones ? JSON.parse(a.denominaciones) : null; }
  catch { a.denominaciones = null; }
  res.json({ arqueo: a });
});

// Crear un arqueo nuevo
app.post('/api/arqueos', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'No puedes crear arqueos' });

  const { caja_id, saldo_sistema, saldo_fisico, denominaciones, observaciones, fecha } = req.body || {};
  if (!caja_id) return res.status(400).json({ error: 'caja_id requerido' });
  if (typeof saldo_sistema !== 'number') return res.status(400).json({ error: 'saldo_sistema inválido' });
  if (typeof saldo_fisico !== 'number') return res.status(400).json({ error: 'saldo_fisico inválido' });

  const caja = db.prepare('SELECT id, nombre, tipo FROM cajas WHERE id = ? AND deleted = 0').get(caja_id);
  if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
  if (caja.tipo !== 'EFECTIVO') return res.status(400).json({ error: 'Solo se pueden arquear cajas tipo EFECTIVO' });

  // Permisos por caja (usuarios pueden estar restringidos)
  if (!userCanUseCaja(req.user.id, caja_id, req.user.rol)) {
    return res.status(403).json({ error: 'No tienes permiso sobre esta caja' });
  }

  const diferencia = Math.round((saldo_fisico - saldo_sistema) * 100) / 100;
  let estado = 'CUADRADO';
  if (Math.abs(diferencia) > 0.01) {
    estado = diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
  }

  const id = 'arq-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const now = Date.now();
  const fechaUse = fecha || new Date(now).toISOString().slice(0, 10);

  db.prepare(`INSERT INTO arqueos (
    id, fecha, ts, caja_id, caja_nombre, user_id, user_nombre,
    saldo_sistema, saldo_fisico, diferencia, estado, observaciones, denominaciones,
    updated_at, deleted
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    id, fechaUse, now, caja_id, caja.nombre,
    req.user.id, req.user.nombre,
    saldo_sistema, saldo_fisico, diferencia, estado,
    (observaciones || '').slice(0, 500),
    denominaciones ? JSON.stringify(denominaciones) : null,
    now
  );

  audit(req, 'create', 'arqueo', id, JSON.stringify({
    caja: caja.nombre, diferencia, estado
  }));
  res.json({ ok: true, id, estado, diferencia });
});

// Borrar un arqueo (solo admin, requiere PIN)
app.delete('/api/arqueos/:id', auth, requirePin, (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin puede borrar arqueos' });
  const a = db.prepare('SELECT id, caja_nombre, diferencia FROM arqueos WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arqueo no encontrado' });
  db.prepare('UPDATE arqueos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  audit(req, 'delete', 'arqueo', req.params.id, JSON.stringify({ caja: a.caja_nombre, diferencia: a.diferencia }));
  res.json({ ok: true });
});

// Estadísticas: último arqueo por caja
app.get('/api/arqueos/stats/ultimos', auth, (req, res) => {
  const cajas = db.prepare("SELECT id, nombre, tipo FROM cajas WHERE deleted = 0 AND archivada = 0 AND tipo = 'EFECTIVO'").all();
  const result = cajas.map(c => {
    const ultimo = db.prepare(`
      SELECT id, fecha, ts, estado, diferencia, user_nombre
      FROM arqueos WHERE caja_id = ? AND deleted = 0
      ORDER BY ts DESC LIMIT 1
    `).get(c.id);
    return { caja_id: c.id, caja_nombre: c.nombre, ultimo: ultimo || null };
  });
  res.json({ cajas: result });
});

// ===========================================================
// ============= TERCEROS (PROVEEDORES + CLIENTES) ===========
// ===========================================================
app.get('/api/terceros', auth, (req, res) => {
  const { tipo, q } = req.query;
  let sql = 'SELECT * FROM terceros WHERE deleted = 0';
  const params = [];
  if (tipo && tipo !== 'all') { sql += ' AND tipo = ?'; params.push(tipo); }
  if (q) { sql += ' AND LOWER(nombre) LIKE ?'; params.push('%' + q.toLowerCase() + '%'); }
  sql += ' ORDER BY nombre COLLATE NOCASE';
  const terceros = db.prepare(sql).all(...params);
  // Enriquecer cada proveedor con conteo de productos
  for (const t of terceros) {
    if (t.tipo === 'PROVEEDOR') {
      const cnt = db.prepare('SELECT COUNT(*) as n FROM proveedor_productos WHERE proveedor_id = ? AND deleted = 0 AND activo = 1').get(t.id).n;
      t.productos_count = cnt;
    }
  }
  res.json({ terceros });
});

app.post('/api/terceros', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const { nombre, tipo, tipo_proveedor, categoria_id_sugerida, grupo_sugerido, categoria_sugerida, telefono, notas } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const t = (tipo === 'CLIENTE') ? 'CLIENTE' : 'PROVEEDOR';
  const tp = (tipo_proveedor === 'SERVICIO') ? 'SERVICIO' : 'PRODUCTO';
  const id = 'ter-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const now = Date.now();
  db.prepare(`INSERT INTO terceros (id, nombre, tipo, tipo_proveedor, categoria_id_sugerida, grupo_sugerido, categoria_sugerida, telefono, notas, activo, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)`).run(
    id, nombre.trim(), t, tp,
    categoria_id_sugerida || null,
    grupo_sugerido || null,
    categoria_sugerida || null,
    (telefono || '').slice(0, 30),
    (notas || '').slice(0, 500),
    now
  );
  audit(req, 'create', 'tercero', id, JSON.stringify({ nombre, tipo: t, tipo_proveedor: tp }));
  res.json({ ok: true, id });
});

app.put('/api/terceros/:id', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const t = db.prepare('SELECT * FROM terceros WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, tipo_proveedor, categoria_id_sugerida, grupo_sugerido, categoria_sugerida, telefono, notas, activo } = req.body || {};
  db.prepare(`UPDATE terceros SET
    nombre = COALESCE(?, nombre),
    tipo_proveedor = COALESCE(?, tipo_proveedor),
    categoria_id_sugerida = COALESCE(?, categoria_id_sugerida),
    grupo_sugerido = COALESCE(?, grupo_sugerido),
    categoria_sugerida = COALESCE(?, categoria_sugerida),
    telefono = COALESCE(?, telefono),
    notas = COALESCE(?, notas),
    activo = COALESCE(?, activo),
    updated_at = ?
    WHERE id = ?`).run(
    nombre ? nombre.trim() : null,
    tipo_proveedor !== undefined ? (tipo_proveedor === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO') : null,
    categoria_id_sugerida !== undefined ? (categoria_id_sugerida || null) : null,
    grupo_sugerido !== undefined ? (grupo_sugerido || null) : null,
    categoria_sugerida !== undefined ? (categoria_sugerida || null) : null,
    telefono !== undefined ? (telefono || '').slice(0, 30) : null,
    notas !== undefined ? (notas || '').slice(0, 500) : null,
    activo !== undefined ? (activo ? 1 : 0) : null,
    Date.now(),
    req.params.id
  );
  audit(req, 'update', 'tercero', req.params.id, JSON.stringify(req.body));
  res.json({ ok: true });
});

app.delete('/api/terceros/:id', auth, requirePin, (req, res) => {
  if (req.user.rol !== 'admin' && req.user.rol !== 'gerente') return res.status(403).json({ error: 'Sin permiso' });
  const t = db.prepare('SELECT id, nombre FROM terceros WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrado' });
  const enUso = db.prepare('SELECT COUNT(*) as n FROM cxp WHERE tercero_id = ? AND deleted = 0').get(req.params.id).n;
  if (enUso > 0) return res.status(400).json({ error: `Tiene ${enUso} cuentas asociadas` });
  const ordEnUso = db.prepare('SELECT COUNT(*) as n FROM ordenes_compra WHERE proveedor_id = ? AND deleted = 0').get(req.params.id).n;
  if (ordEnUso > 0) return res.status(400).json({ error: `Tiene ${ordEnUso} órdenes de compra asociadas` });
  // Soft delete del proveedor y sus productos
  db.prepare('UPDATE terceros SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  db.prepare('UPDATE proveedor_productos SET deleted = 1, updated_at = ? WHERE proveedor_id = ?').run(Date.now(), req.params.id);
  audit(req, 'delete', 'tercero', req.params.id, JSON.stringify({ nombre: t.nombre }));
  res.json({ ok: true });
});

// ===========================================================
// PRODUCTOS DE PROVEEDOR (catálogo)
// ===========================================================
// Listar productos de un proveedor
app.get('/api/terceros/:id/productos', auth, (req, res) => {
  const productos = db.prepare(
    'SELECT * FROM proveedor_productos WHERE proveedor_id = ? AND deleted = 0 ORDER BY orden_visual, producto COLLATE NOCASE'
  ).all(req.params.id);
  res.json({ productos });
});

// Reemplazar TODO el catálogo de productos de un proveedor (bulk)
// body: { productos: [{producto, unidad, cantidad_default, precio_actual, categoria_contable}, ...] }
app.put('/api/terceros/:id/productos', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const tercero = db.prepare('SELECT * FROM terceros WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!tercero) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const { productos = [] } = req.body || {};
  const now = Date.now();

  const tx = db.transaction(() => {
    // Obtener productos existentes
    const existentes = db.prepare(
      'SELECT id, producto FROM proveedor_productos WHERE proveedor_id = ? AND deleted = 0'
    ).all(req.params.id);
    const idsRecibidos = new Set();

    let orden = 0;
    for (const p of productos) {
      orden++;
      if (!p.producto || !p.producto.trim()) continue;
      const producto = p.producto.trim();
      const unidad = (p.unidad || 'KG').trim();
      const cantDefault = Number(p.cantidad_default || 0);
      const precio = Number(p.precio_actual || 0);
      const cat = p.categoria_contable || tercero.categoria_sugerida || 'MERCANCIA';

      if (p.id) {
        // Update existente
        db.prepare(`UPDATE proveedor_productos SET
          producto = ?, unidad = ?, cantidad_default = ?, precio_actual = ?,
          categoria_contable = ?, orden_visual = ?, activo = 1, updated_at = ?
          WHERE id = ? AND proveedor_id = ?`).run(
          producto, unidad, cantDefault, precio, cat, orden, now, p.id, req.params.id
        );
        idsRecibidos.add(p.id);
      } else {
        // Crear nuevo
        const nuevoId = 'pp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        db.prepare(`INSERT INTO proveedor_productos (
          id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
          categoria_contable, activo, orden_visual, created_at, updated_at, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0)`).run(
          nuevoId, req.params.id, producto, unidad, cantDefault, precio,
          cat, orden, now, now
        );
        idsRecibidos.add(nuevoId);
      }
    }

    // Soft-delete los productos que ya no vinieron
    for (const ex of existentes) {
      if (!idsRecibidos.has(ex.id)) {
        db.prepare('UPDATE proveedor_productos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ex.id);
      }
    }
  });

  try {
    tx();
    audit(req, 'update', 'proveedor_productos', req.params.id, JSON.stringify({ count: productos.length }));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ===========================================================
// ============= CUENTAS POR PAGAR / COBRAR ==================
// ===========================================================
function calcularEstado(cxpId) {
  const cxp = db.prepare('SELECT monto_total, estado FROM cxp WHERE id = ?').get(cxpId);
  if (!cxp) return 'PENDIENTE';
  if (cxp.estado === 'CANCELADA') return 'CANCELADA';
  const sumaAbonos = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxpId).total;
  const saldo = Math.round((cxp.monto_total - sumaAbonos) * 100) / 100;
  if (saldo <= 0.01) return 'PAGADA';
  if (sumaAbonos > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

function enrichCxp(cxp) {
  const sumaAbonos = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxp.id).total;
  cxp.pagado = Math.round(sumaAbonos * 100) / 100;
  cxp.saldo = Math.round((cxp.monto_total - sumaAbonos) * 100) / 100;
  // Días al vencimiento
  if (cxp.fecha_vencimiento) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const v = new Date(cxp.fecha_vencimiento + 'T12:00:00');
    cxp.dias_para_vencer = Math.floor((v - hoy) / (1000 * 60 * 60 * 24));
  }
  return cxp;
}

app.get('/api/cxp', auth, (req, res) => {
  const { direccion, estado, tercero_id, desde, hasta, limit } = req.query;
  let sql = 'SELECT * FROM cxp WHERE deleted = 0';
  const params = [];
  if (direccion) { sql += ' AND direccion = ?'; params.push(direccion); }
  if (estado && estado !== 'all') { sql += ' AND estado = ?'; params.push(estado); }
  if (tercero_id && tercero_id !== 'all') { sql += ' AND tercero_id = ?'; params.push(tercero_id); }
  if (desde) { sql += ' AND fecha_creacion >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND fecha_creacion <= ?'; params.push(hasta); }
  sql += ' ORDER BY fecha_creacion DESC, updated_at DESC LIMIT ?';
  params.push(parseInt(limit) || 500);
  const cuentas = db.prepare(sql).all(...params);
  cuentas.forEach(enrichCxp);
  res.json({ cxp: cuentas });
});

app.get('/api/cxp/:id', auth, (req, res) => {
  const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!cxp) return res.status(404).json({ error: 'No encontrada' });
  enrichCxp(cxp);
  cxp.facturas = db.prepare('SELECT * FROM cxp_facturas WHERE cxp_id = ? AND deleted = 0 ORDER BY fecha DESC').all(req.params.id);
  cxp.abonos = db.prepare('SELECT * FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0 ORDER BY fecha DESC, updated_at DESC').all(req.params.id);
  res.json({ cxp });
});

app.post('/api/cxp', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const {
    direccion, tercero_id, tercero_nombre, concepto, categoria_id,
    monto_total, fecha_creacion, fecha_vencimiento, observaciones,
    facturas, abono_inicial
  } = req.body || {};

  if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'Concepto requerido' });
  const dir = (direccion === 'COBRAR') ? 'COBRAR' : 'PAGAR';
  const monto = parseFloat(monto_total);
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const id = 'cxp-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const now = Date.now();
  const fc = fecha_creacion || new Date().toISOString().slice(0, 10);

  // Resolver tercero
  let tId = tercero_id || null;
  let tNombre = tercero_nombre || '';
  if (tId) {
    const t = db.prepare('SELECT id, nombre FROM terceros WHERE id = ? AND deleted = 0').get(tId);
    if (t) tNombre = t.nombre;
    else tId = null;
  }

  db.prepare(`INSERT INTO cxp (
    id, direccion, tercero_id, tercero_nombre, concepto, categoria_id,
    monto_total, fecha_creacion, fecha_vencimiento, estado, observaciones,
    user_id, user_nombre, updated_at, deleted
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, 0)`).run(
    id, dir, tId, tNombre || null,
    concepto.trim(), categoria_id || null,
    monto, fc,
    fecha_vencimiento || null,
    (observaciones || '').slice(0, 1000),
    req.user.id, req.user.nombre,
    now
  );

  // Facturas iniciales (opcional)
  if (Array.isArray(facturas)) {
    facturas.forEach(f => {
      if (!f || !f.monto) return;
      const fid = 'fac-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
      db.prepare(`INSERT INTO cxp_facturas (id, cxp_id, numero, uuid, fecha, monto, notas, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        fid, id,
        (f.numero || '').slice(0, 50) || null,
        (f.uuid || '').slice(0, 100) || null,
        f.fecha || fc,
        parseFloat(f.monto) || 0,
        (f.notas || '').slice(0, 300),
        now
      );
    });
  }

  // Abono inicial (opcional, crea mov en caja)
  if (abono_inicial && abono_inicial.monto > 0 && abono_inicial.caja_id) {
    try {
      crearAbonoInterno(req, id, abono_inicial, dir);
    } catch (e) {
      console.warn('Abono inicial falló:', e.message);
    }
  }

  // Recalcular estado
  const nuevoEstado = calcularEstado(id);
  db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, now, id);

  audit(req, 'create', 'cxp', id, JSON.stringify({ direccion: dir, concepto, monto }));
  res.json({ ok: true, id });
});

app.put('/api/cxp/:id', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!cxp) return res.status(404).json({ error: 'No encontrada' });

  const { concepto, categoria_id, monto_total, fecha_vencimiento, observaciones, estado } = req.body || {};

  // Validar que el nuevo monto no sea menor que lo ya abonado
  if (monto_total !== undefined) {
    const abonado = db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(req.params.id).t;
    if (parseFloat(monto_total) < abonado - 0.01) {
      return res.status(400).json({ error: `El monto no puede ser menor a lo ya abonado (${abonado})` });
    }
  }

  db.prepare(`UPDATE cxp SET
    concepto = COALESCE(?, concepto),
    categoria_id = COALESCE(?, categoria_id),
    monto_total = COALESCE(?, monto_total),
    fecha_vencimiento = COALESCE(?, fecha_vencimiento),
    observaciones = COALESCE(?, observaciones),
    estado = COALESCE(?, estado),
    updated_at = ?
    WHERE id = ?`).run(
    concepto ? concepto.trim() : null,
    categoria_id !== undefined ? (categoria_id || null) : null,
    monto_total !== undefined ? parseFloat(monto_total) : null,
    fecha_vencimiento !== undefined ? (fecha_vencimiento || null) : null,
    observaciones !== undefined ? (observaciones || '').slice(0, 1000) : null,
    estado || null,
    Date.now(),
    req.params.id
  );

  // Recalcular estado si no se forzó
  if (!estado) {
    const nuevoEstado = calcularEstado(req.params.id);
    db.prepare('UPDATE cxp SET estado = ? WHERE id = ?').run(nuevoEstado, req.params.id);
  }

  audit(req, 'update', 'cxp', req.params.id, JSON.stringify(req.body));
  res.json({ ok: true });
});

app.delete('/api/cxp/:id', auth, requirePin, (req, res) => {
  if (req.user.rol !== 'admin' && req.user.rol !== 'gerente') return res.status(403).json({ error: 'Sin permiso' });
  const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!cxp) return res.status(404).json({ error: 'No encontrada' });

  const abonos = db.prepare('SELECT id, mov_id FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').all(req.params.id);
  // Borrar todos los abonos y sus movs asociados
  abonos.forEach(ab => {
    if (ab.mov_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.mov_id);
    }
    db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.id);
  });
  // Borrar facturas
  db.prepare('UPDATE cxp_facturas SET deleted = 1, updated_at = ? WHERE cxp_id = ?').run(Date.now(), req.params.id);
  // Borrar cuenta
  db.prepare('UPDATE cxp SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);

  audit(req, 'delete', 'cxp', req.params.id, JSON.stringify({ concepto: cxp.concepto, abonos_borrados: abonos.length }));
  res.json({ ok: true, abonos_revertidos: abonos.length });
});

// ===========================================================
// ============= FACTURAS DE UNA CUENTA ======================
// ===========================================================
app.post('/api/cxp/:id/facturas', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const cxp = db.prepare('SELECT id FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!cxp) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const { numero, uuid, fecha, monto, notas } = req.body || {};
  const m = parseFloat(monto);
  if (!m || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
  const id = 'fac-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const now = Date.now();
  db.prepare(`INSERT INTO cxp_facturas (id, cxp_id, numero, uuid, fecha, monto, notas, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    id, req.params.id,
    (numero || '').slice(0, 50) || null,
    (uuid || '').slice(0, 100) || null,
    fecha || new Date().toISOString().slice(0, 10),
    m,
    (notas || '').slice(0, 300),
    now
  );
  audit(req, 'create', 'cxp_factura', id, JSON.stringify({ cxp_id: req.params.id, monto: m }));
  res.json({ ok: true, id });
});

app.delete('/api/cxp/facturas/:id', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const f = db.prepare('SELECT id FROM cxp_facturas WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'No encontrada' });
  db.prepare('UPDATE cxp_facturas SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  audit(req, 'delete', 'cxp_factura', req.params.id, '');
  res.json({ ok: true });
});

// ===========================================================
// ============= ABONOS (PAGOS/COBROS PARCIALES) =============
// ===========================================================
// Función interna reusable
function crearAbonoInterno(req, cxpId, body, direccion) {
  const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(cxpId);
  if (!cxp) throw new Error('Cuenta no encontrada');

  const { fecha, monto, caja_id, factura_id, metodo, referencia, notas } = body;
  const m = parseFloat(monto);
  if (!m || m <= 0) throw new Error('Monto inválido');
  if (!caja_id) throw new Error('Caja requerida');

  const caja = db.prepare('SELECT id, nombre FROM cajas WHERE id = ? AND deleted = 0').get(caja_id);
  if (!caja) throw new Error('Caja no encontrada');

  // Validar saldo restante
  const yaAbonado = db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxpId).t;
  const saldoRest = cxp.monto_total - yaAbonado;
  if (m > saldoRest + 0.01) throw new Error(`Abono excede saldo restante (${saldoRest})`);

  const dir = direccion || cxp.direccion || 'PAGAR';
  const tipoMov = (dir === 'COBRAR') ? 'INGRESO' : 'GASTO';
  const conceptoMov = (dir === 'COBRAR' ? 'Cobro de: ' : 'Pago a: ') + (cxp.tercero_nombre || cxp.concepto);

  const abonoId = 'abo-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const movId = 'm-cxp-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
  const now = Date.now();
  const fechaUse = fecha || new Date().toISOString().slice(0, 10);

  // Crear mov vinculado (columnas: usar 'usuario', no 'user_nombre')
  db.prepare(`INSERT INTO movs (
    id, fecha, tipo, monto, categoria, concepto, caja, metodo, usuario, notas, src,
    user_id, cxp_id, abono_id, updated_at, deleted
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cxp', ?, ?, ?, ?, 0)`).run(
    movId, fechaUse, tipoMov, m,
    cxp.categoria_id || '',
    conceptoMov + (referencia ? ` (${referencia})` : ''),
    caja_id,
    (metodo || 'EFECTIVO').slice(0, 20),
    req.user.nombre,
    (notas || '').slice(0, 300),
    req.user.id,
    cxpId, abonoId,
    now
  );

  // Crear abono
  db.prepare(`INSERT INTO cxp_abonos (
    id, cxp_id, factura_id, fecha, monto, caja_id, caja_nombre, mov_id,
    metodo, referencia, notas, user_id, user_nombre, updated_at, deleted
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    abonoId, cxpId,
    factura_id || null,
    fechaUse, m, caja_id, caja.nombre, movId,
    (metodo || 'EFECTIVO').slice(0, 20),
    (referencia || '').slice(0, 100),
    (notas || '').slice(0, 300),
    req.user.id, req.user.nombre, now
  );

  return { id: abonoId, mov_id: movId };
}

app.post('/api/cxp/:id/abonos', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  try {
    const result = crearAbonoInterno(req, req.params.id, req.body || {}, null);
    // Recalcular estado
    const nuevoEstado = calcularEstado(req.params.id);
    db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, Date.now(), req.params.id);
    audit(req, 'create', 'abono', result.id, JSON.stringify({ cxp_id: req.params.id, monto: req.body.monto }));
    res.json({ ok: true, ...result, estado: nuevoEstado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/cxp/abonos/:id', auth, requirePin, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const ab = db.prepare('SELECT * FROM cxp_abonos WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!ab) return res.status(404).json({ error: 'Abono no encontrado' });

  // Borrar el mov asociado
  if (ab.mov_id) {
    db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.mov_id);
  }
  // Borrar el abono
  db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  // Recalcular estado de la CxP padre
  const nuevoEstado = calcularEstado(ab.cxp_id);
  db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, Date.now(), ab.cxp_id);

  audit(req, 'delete', 'abono', req.params.id, JSON.stringify({ cxp_id: ab.cxp_id, monto: ab.monto, mov_revertido: ab.mov_id }));
  res.json({ ok: true });
});

// Resumen para Dashboard
app.get('/api/cxp/stats/resumen', auth, (req, res) => {
  const stats = {};
  ['PAGAR', 'COBRAR'].forEach(dir => {
    const cuentas = db.prepare(`SELECT * FROM cxp WHERE direccion = ? AND deleted = 0 AND estado != 'CANCELADA'`).all(dir);
    cuentas.forEach(enrichCxp);
    const pendientes = cuentas.filter(c => c.saldo > 0.01);
    const totalSaldo = pendientes.reduce((s, c) => s + c.saldo, 0);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const vencidas = pendientes.filter(c => c.fecha_vencimiento && new Date(c.fecha_vencimiento + 'T12:00:00') < hoy);
    const proximas = pendientes.filter(c => c.fecha_vencimiento && c.dias_para_vencer >= 0 && c.dias_para_vencer <= 7);
    stats[dir] = {
      total_cuentas: pendientes.length,
      total_saldo: Math.round(totalSaldo * 100) / 100,
      vencidas: vencidas.length,
      proximas_7d: proximas.length,
    };
  });
  res.json({ stats });
});

// ===========================================================
// ============= ÓRDENES DE COMPRA ===========================
// ===========================================================

// Helper: obtener orden con items
function getOrdenCompleta(id) {
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(id);
  if (!orden) return null;
  orden.items = db.prepare(`SELECT * FROM ordenes_compra_items 
                            WHERE orden_id = ? AND deleted = 0 
                            ORDER BY created_at ASC`).all(id);
  return orden;
}

// Listar órdenes
app.get('/api/ordenes', auth, (req, res) => {
  const { estado, proveedor_id, fecha_desde, fecha_hasta } = req.query;
  let sql = 'SELECT * FROM ordenes_compra WHERE deleted = 0';
  const params = [];
  if (estado) { sql += ' AND estado = ?'; params.push(estado); }
  if (proveedor_id) { sql += ' AND proveedor_id = ?'; params.push(proveedor_id); }
  if (fecha_desde) { sql += ' AND fecha >= ?'; params.push(fecha_desde); }
  if (fecha_hasta) { sql += ' AND fecha <= ?'; params.push(fecha_hasta); }
  sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 500';
  const ordenes = db.prepare(sql).all(...params);
  // Adjuntar items
  ordenes.forEach(o => {
    o.items = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(o.id);
  });
  res.json({ ordenes });
});

// Detalle de una orden
app.get('/api/ordenes/:id', auth, (req, res) => {
  const orden = getOrdenCompleta(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(orden);
});

// Crear orden (estado EJECUTANDO, crea GASTO de salida si hay monto_entregado > 0)
app.post('/api/ordenes', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const o = req.body || {};
  if (!o.proveedor_nombre) return res.status(400).json({ error: 'Falta proveedor' });
  if (!o.caja_id) return res.status(400).json({ error: 'Falta caja' });
  if (!o.metodo_pago || !['EFECTIVO', 'TRANSFERENCIA'].includes(o.metodo_pago))
    return res.status(400).json({ error: 'Método de pago inválido' });
  if (!Array.isArray(o.items) || o.items.length === 0)
    return res.status(400).json({ error: 'Debe agregar al menos un producto' });

  // FILTRAR: solo items con cantidad > 0 se guardan
  o.items = o.items.filter(it => Number(it.cantidad_estimada || 0) > 0);
  if (o.items.length === 0)
    return res.status(400).json({ error: 'Captura cantidad en al menos un producto para guardar la orden' });

  const id = o.id || ('ord-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000));
  const now = Date.now();
  const fecha = o.fecha || new Date().toISOString().slice(0, 10);
  const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(o.caja_id);
  const cajaNombre = cajaInfo?.nombre || o.caja_id;

  // Calcular monto estimado de items
  const montoEstimado = o.items.reduce((s, it) => {
    const c = Number(it.cantidad_estimada || 0);
    const p = Number(it.precio_estimado || 0);
    return s + c * p;
  }, 0);

  const montoEntregado = Number(o.monto_entregado || 0);
  if (montoEntregado < 0) return res.status(400).json({ error: 'Monto entregado no puede ser negativo' });

  // Validar saldo de caja si efectivo y monto > 0
  if (o.metodo_pago === 'EFECTIVO' && montoEntregado > 0) {
    const saldo = db.prepare(`SELECT 
      COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END), 0) as s
      FROM movs WHERE caja = ? AND deleted = 0`).get(o.caja_id).s;
    if (saldo < montoEntregado) {
      console.warn(`⚠️ Orden ${id}: caja ${o.caja_id} con saldo ${saldo} < entregado ${montoEntregado}. Permitiendo.`);
      // No bloquear, solo advertir en logs
    }
  }

  const tx = db.transaction(() => {
    // Crear mov de salida si monto_entregado > 0
    let movSalidaId = null;
    if (montoEntregado > 0) {
      movSalidaId = 'm-ord-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      const conceptoMov = `Compra a ${o.proveedor_nombre}${o.comprador_nombre ? ' · ' + o.comprador_nombre : ''}`;
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
        user_id, src, orden_id, created_at, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', 'MERCANCIA', ?, ?, ?, ?, ?, ?, ?, 'compra', ?, ?, ?, 0)`).run(
        movSalidaId, fecha, conceptoMov, montoEntregado,
        o.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
        o.caja_id, req.user.nombre, `Anticipo de orden ${id}`,
        req.user.id, id, now, now
      );
    }

    // Crear la orden
    db.prepare(`INSERT INTO ordenes_compra (
      id, fecha, numero_orden, proveedor_id, proveedor_nombre,
      comprador_nombre, metodo_pago, caja_id, caja_nombre,
      monto_estimado, monto_entregado, monto_real, ajuste,
      estado, mov_salida_id, observaciones,
      user_id, user_nombre, created_at, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'BORRADOR', ?, ?, ?, ?, ?, ?, 0)`).run(
      id, fecha, o.numero_orden || null, o.proveedor_id || null, o.proveedor_nombre,
      o.comprador_nombre || null, o.metodo_pago, o.caja_id, cajaNombre,
      montoEstimado, montoEntregado, movSalidaId,
      o.observaciones || null, req.user.id, req.user.nombre, now, now
    );

    // Insertar items
    for (const it of o.items) {
      const itemId = it.id || ('oi-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000));
      const cant = Number(it.cantidad_estimada || 0);
      const precio = Number(it.precio_estimado || 0);
      db.prepare(`INSERT INTO ordenes_compra_items (
        id, orden_id, producto, unidad,
        cantidad_estimada, precio_estimado, total_estimado,
        categoria_contable, notas,
        created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        itemId, id, it.producto || '', it.unidad || 'KG',
        cant, precio, cant * precio,
        it.categoria_contable || 'MERCANCIA', it.notas || null,
        now, now
      );
    }

    // Upsert: agregar productos NUEVOS al catálogo del proveedor si no existen
    if (o.proveedor_id) {
      for (const it of o.items) {
        if (!it.producto) continue;
        const existe = db.prepare(
          'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
        ).get(o.proveedor_id, it.producto);
        if (!existe) {
          const ppId = 'pp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
          const cant = Number(it.cantidad_estimada || 0);
          const precio = Number(it.precio_estimado || 0);
          db.prepare(`INSERT INTO proveedor_productos (
            id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
            categoria_contable, activo, orden_visual, created_at, updated_at, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
            ppId, o.proveedor_id, it.producto, it.unidad || 'KG',
            cant, precio, it.categoria_contable || 'MERCANCIA',
            now, now
          );
        }
      }
    }
  });

  try {
    tx();
    audit(req, 'create', 'orden_compra', id, JSON.stringify({
      proveedor: o.proveedor_nombre,
      monto_estimado: montoEstimado,
      monto_entregado: montoEntregado,
      items: o.items.length
    }));
    const ordenCompleta = getOrdenCompleta(id);
    res.json({ ok: true, orden: ordenCompleta });
  } catch (e) {
    console.error('Error creando orden:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT: Editar orden en BORRADOR (cambiar items, ajustar anticipo, comprador, etc.)
// body: campos similares a POST: proveedor, items, monto_entregado, caja_id, metodo_pago...
app.put('/api/ordenes/:id', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado !== 'BORRADOR') {
    return res.status(400).json({ error: 'Solo se pueden editar órdenes en BORRADOR' });
  }

  const o = req.body || {};
  if (!o.proveedor_nombre) return res.status(400).json({ error: 'Falta proveedor' });
  if (!o.caja_id) return res.status(400).json({ error: 'Falta caja' });
  if (!Array.isArray(o.items) || o.items.length === 0)
    return res.status(400).json({ error: 'Debe tener al menos un producto' });

  // FILTRAR: solo items con cantidad > 0 se guardan
  o.items = o.items.filter(it => Number(it.cantidad_estimada || 0) > 0);
  if (o.items.length === 0)
    return res.status(400).json({ error: 'Captura cantidad en al menos un producto para guardar la orden' });

  const now = Date.now();
  const fecha = o.fecha || orden.fecha;
  const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(o.caja_id);
  const cajaNombre = cajaInfo?.nombre || o.caja_id;

  const montoEstimado = o.items.reduce((s, it) =>
    s + Number(it.cantidad_estimada || 0) * Number(it.precio_estimado || 0), 0);

  const montoEntregado = Number(o.monto_entregado || 0);
  if (montoEntregado < 0) return res.status(400).json({ error: 'Monto entregado no puede ser negativo' });

  const tx = db.transaction(() => {
    // 1) Borrar mov de salida anterior si existía
    if (orden.mov_salida_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
    }

    // 2) Crear nuevo mov de salida si monto > 0
    let movSalidaId = null;
    if (montoEntregado > 0) {
      movSalidaId = 'm-ord-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      const conceptoMov = `Compra a ${o.proveedor_nombre}${o.comprador_nombre ? ' · ' + o.comprador_nombre : ''}`;
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
        user_id, src, orden_id, created_at, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', 'MERCANCIA', ?, ?, ?, ?, ?, ?, ?, 'compra', ?, ?, ?, 0)`).run(
        movSalidaId, fecha, conceptoMov, montoEntregado,
        o.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
        o.caja_id, req.user.nombre, `Anticipo de orden ${orden.id} (editado)`,
        req.user.id, orden.id, now, now
      );
    }

    // 3) Soft-delete items viejos
    db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);

    // 4) Crear items nuevos
    for (const it of o.items) {
      const itemId = 'oi-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      const cant = Number(it.cantidad_estimada || 0);
      const precio = Number(it.precio_estimado || 0);
      db.prepare(`INSERT INTO ordenes_compra_items (
        id, orden_id, producto, unidad,
        cantidad_estimada, precio_estimado, total_estimado,
        categoria_contable, notas,
        created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        itemId, orden.id, it.producto || '', it.unidad || 'KG',
        cant, precio, cant * precio,
        it.categoria_contable || 'MERCANCIA', it.notas || null,
        now, now
      );
    }

    // 5) Upsert productos nuevos al catálogo del proveedor
    if (o.proveedor_id) {
      for (const it of o.items) {
        if (!it.producto) continue;
        const existe = db.prepare(
          'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
        ).get(o.proveedor_id, it.producto);
        if (!existe) {
          const ppId = 'pp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
          const cant = Number(it.cantidad_estimada || 0);
          const precio = Number(it.precio_estimado || 0);
          db.prepare(`INSERT INTO proveedor_productos (
            id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
            categoria_contable, activo, orden_visual, created_at, updated_at, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
            ppId, o.proveedor_id, it.producto, it.unidad || 'KG',
            cant, precio, it.categoria_contable || 'MERCANCIA',
            now, now
          );
        }
      }
    }

    // 6) Actualizar cabecera
    db.prepare(`UPDATE ordenes_compra SET
      fecha = ?, proveedor_id = ?, proveedor_nombre = ?,
      comprador_nombre = ?, metodo_pago = ?, caja_id = ?, caja_nombre = ?,
      monto_estimado = ?, monto_entregado = ?,
      mov_salida_id = ?, observaciones = ?,
      updated_at = ?
      WHERE id = ?`).run(
      fecha, o.proveedor_id || null, o.proveedor_nombre,
      o.comprador_nombre || null, o.metodo_pago || 'EFECTIVO',
      o.caja_id, cajaNombre,
      montoEstimado, montoEntregado, movSalidaId,
      o.observaciones || null,
      now, orden.id
    );
  });

  try {
    tx();
    audit(req, 'update', 'orden_compra', orden.id, JSON.stringify({
      proveedor: o.proveedor_nombre,
      monto_estimado: montoEstimado,
      monto_entregado: montoEntregado,
      items_count: o.items.length
    }));
    const ordenCompleta = getOrdenCompleta(orden.id);
    res.json({ ok: true, orden: ordenCompleta });
  } catch (e) {
    console.error('Error editando orden:', e);
    res.status(500).json({ error: e.message });
  }
});

// Cerrar orden: actualiza items con valores reales y decide modo de pago
// body: { items: [...], pago_inmediato: bool, fecha_pago, caja_pago_id, metodo_pago,
//         monto_pagar (si pago_inmediato), fecha_vencimiento (si crea CxP) }
app.post('/api/ordenes/:id/cerrar', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado !== 'BORRADOR' && orden.estado !== 'EJECUTANDO') {
    return res.status(400).json({ error: 'Solo se pueden cerrar órdenes en BORRADOR' });
  }

  const body = req.body || {};
  const items = body.items || [];
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Debe enviar items con valores reales' });

  const now = Date.now();
  const fechaCierre = body.fecha_cierre || new Date().toISOString().slice(0, 10);

  // Calcular monto real
  let montoReal = 0;
  for (const it of items) {
    montoReal += Number(it.cantidad_real || 0) * Number(it.precio_real || 0);
  }
  montoReal = Math.round(montoReal * 100) / 100;

  // El anticipo ya está cubierto por mov_salida_id (descontado al crear)
  const anticipo = orden.monto_entregado || 0;
  const saldoPendiente = Math.max(0, montoReal - anticipo);
  const sobrante = anticipo > montoReal ? (anticipo - montoReal) : 0;

  const pagoInmediato = !!body.pago_inmediato;

  const tx = db.transaction(() => {
    let cxpIdCreada = null;
    let movPagoInmediatoId = null;
    let movDevolucionId = null;

    // ───── ACTUALIZAR ITEMS ─────
    for (const it of items) {
      const cantReal = Number(it.cantidad_real || 0);
      const precioReal = Number(it.precio_real || 0);
      const totalReal = cantReal * precioReal;
      const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
      if (!itemDb) continue;

      db.prepare(`UPDATE ordenes_compra_items SET
        cantidad_real = ?, precio_real = ?, total_real = ?,
        categoria_contable = ?, updated_at = ?
        WHERE id = ?`).run(
        cantReal, precioReal, totalReal,
        it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA',
        now, it.id
      );

      // Actualizar precio_actual del catálogo del proveedor si tiene precio real > 0
      if (orden.proveedor_id && precioReal > 0) {
        const productoCat = db.prepare(
          'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
        ).get(orden.proveedor_id, itemDb.producto);
        if (productoCat) {
          db.prepare(`UPDATE proveedor_productos SET
            precio_actual = ?, ultimo_precio_orden_id = ?, ultimo_precio_fecha = ?,
            cantidad_default = CASE WHEN cantidad_default = 0 THEN ? ELSE cantidad_default END,
            updated_at = ?
            WHERE id = ?`).run(
            precioReal, orden.id, fechaCierre, cantReal, now, productoCat.id
          );
        } else {
          // Crear si no existía (puede pasar si la orden se creó sin proveedor_id y se asignó después)
          const ppId = 'pp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
          db.prepare(`INSERT INTO proveedor_productos (
            id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
            ultimo_precio_orden_id, ultimo_precio_fecha,
            categoria_contable, activo, orden_visual, created_at, updated_at, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
            ppId, orden.proveedor_id, itemDb.producto, itemDb.unidad || 'KG',
            cantReal, precioReal, orden.id, fechaCierre,
            it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA',
            now, now
          );
        }
      }
    }

    // ───── SOBRANTE: si anticipo > total real, devolver dinero a la caja ─────
    if (sobrante > 0.01) {
      movDevolucionId = 'm-ord-dev-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
        user_id, src, orden_id, created_at, updated_at, deleted
      ) VALUES (?, ?, 'INGRESO', 'OTROS INGRESOS', ?, ?, 'EFECTIVO', ?, ?, ?, ?, 'compra-dev', ?, ?, ?, 0)`).run(
        movDevolucionId, fechaCierre,
        `Devolución compra ${orden.proveedor_nombre}`,
        sobrante, orden.caja_id, req.user.nombre,
        `Sobró dinero del anticipo de orden ${orden.id}`,
        req.user.id, orden.id, now, now
      );
    }

    // ───── DECIDIR ESTADO FINAL Y CÓMO MANEJAR EL SALDO ─────
    let estadoFinal = 'PENDIENTE_PAGO';
    let movItemsCreados = [];

    if (saldoPendiente < 0.01) {
      // No hay saldo pendiente (anticipo cubrió todo)
      // Crear movs por item para el desglose contable, descontando del mov_salida_id (lo borramos y creamos los específicos)
      if (orden.mov_salida_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
      }
      // Crear movs por item al monto real
      for (const it of items) {
        const cantReal = Number(it.cantidad_real || 0);
        const precioReal = Number(it.precio_real || 0);
        const totalReal = cantReal * precioReal;
        if (totalReal <= 0) continue;
        const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
        if (!itemDb) continue;

        const movId = 'm-ord-item-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        const cat = it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA';
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, 0)`).run(
          movId, fechaCierre, cat,
          `${itemDb.producto} (${cantReal} ${itemDb.unidad}) · ${orden.proveedor_nombre}`,
          totalReal,
          orden.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
          orden.caja_id, req.user.nombre, `Orden ${orden.id}`,
          req.user.id, orden.id, now, now
        );
        db.prepare('UPDATE ordenes_compra_items SET mov_id = ? WHERE id = ?').run(movId, it.id);
        movItemsCreados.push(movId);
      }
      estadoFinal = 'PAGADA';
    } else if (pagoInmediato) {
      // PAGO INMEDIATO: pagar el saldo pendiente ahora mismo
      const cajaPago = body.caja_pago_id || orden.caja_id;
      const metodoPago = body.metodo_pago_pago || orden.metodo_pago || 'EFECTIVO';
      const fechaPago = body.fecha_pago || fechaCierre;
      const cajaPagoNombre = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(cajaPago)?.nombre || cajaPago;

      // Reversar mov de anticipo si había y reemplazar con movs por item
      if (orden.mov_salida_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
      }

      // Crear movs por item al monto real (asignados a la caja del anticipo si había, o de pago si no)
      // Para mayor simplicidad: crear movs por item desde la caja del anticipo si había, o de la del pago
      // Si hubo anticipo en una caja y ahora pago en otra, los items van a la caja del anticipo (la mayoría del pago)
      const cajaDestino = anticipo > 0 ? orden.caja_id : cajaPago;
      const metodoDestino = anticipo > 0 ? orden.metodo_pago : metodoPago;

      for (const it of items) {
        const cantReal = Number(it.cantidad_real || 0);
        const precioReal = Number(it.precio_real || 0);
        const totalReal = cantReal * precioReal;
        if (totalReal <= 0) continue;
        const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
        if (!itemDb) continue;

        const movId = 'm-ord-item-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        const cat = it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA';
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, 0)`).run(
          movId, fechaPago, cat,
          `${itemDb.producto} (${cantReal} ${itemDb.unidad}) · ${orden.proveedor_nombre}`,
          totalReal, metodoDestino,
          cajaDestino, req.user.nombre, `Orden ${orden.id}`,
          req.user.id, orden.id, now, now
        );
        db.prepare('UPDATE ordenes_compra_items SET mov_id = ? WHERE id = ?').run(movId, it.id);
        movItemsCreados.push(movId);
      }

      // Si la caja del pago es distinta a la del anticipo, necesitamos compensar:
      // El anticipo descontó X de cajaAnticipo, ahora los items descontaron monto_real de cajaDestino
      // Si pago_inmediato y se eligió otra caja, hay que ajustar
      if (anticipo > 0 && cajaPago !== orden.caja_id && saldoPendiente > 0) {
        // Crear "transferencia interna": INGRESO en caja_anticipo + GASTO en caja_pago por el saldo
        const tId = 'm-ord-trans-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        // No es necesario: cada mov por item ya descontó de cajaDestino el monto correspondiente
        // El neto en cajaAnticipo (que perdió el anticipo) es -anticipo
        // El neto en cajaDestino (que perdió los items) es -monto_real
        // Esto suma -anticipo - monto_real lo cual es DOBLE GASTO
        // Necesitamos reversar el anticipo de cajaAnticipo y crear un mov en cajaDestino por monto_real solamente
        // (Pero ya borramos mov_salida_id arriba)... aceptemos esta limitación: cuando hay anticipo en otra caja,
        // forzar que pago_inmediato sea desde la misma caja del anticipo.
      }

      estadoFinal = 'PAGADA';
    } else {
      // CREAR CxP: el saldo pendiente queda como cuenta por pagar vinculada
      // Si había anticipo: los movs por anticipo se mantienen y registramos la CxP solo por el saldo
      // Si NO había anticipo: no se mueve caja, solo se crea la CxP por el total real
      
      const cxpId = 'cxp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      cxpIdCreada = cxpId;
      
      // Determinar categoría de la CxP (la mayoría usada en items)
      const catCount = {};
      for (const it of items) {
        const c = it.categoria_contable || 'MERCANCIA';
        catCount[c] = (catCount[c] || 0) + Number(it.cantidad_real || 0) * Number(it.precio_real || 0);
      }
      const catPrincipal = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || 'MERCANCIA';

      const conceptoCxp = `Compra ${orden.proveedor_nombre} · Orden ${orden.id.split('-').pop()}`;
      const fechaVenc = body.fecha_vencimiento || null;

      // Buscar o crear tercero (proveedor)
      let terceroId = orden.proveedor_id;
      if (!terceroId && orden.proveedor_nombre) {
        const existente = db.prepare("SELECT id FROM terceros WHERE LOWER(nombre) = LOWER(?) AND tipo = 'PROVEEDOR' AND deleted = 0").get(orden.proveedor_nombre);
        if (existente) {
          terceroId = existente.id;
        } else {
          terceroId = 't-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
          db.prepare(`INSERT INTO terceros (id, tipo, nombre, categoria_sugerida, activo, created_at, updated_at, deleted, user_id, user_nombre)
                      VALUES (?, 'PROVEEDOR', ?, ?, 1, ?, ?, 0, ?, ?)`).run(
            terceroId, orden.proveedor_nombre, catPrincipal, now, now, req.user.id, req.user.nombre
          );
        }
      }

      // Crear la CxP por el SALDO PENDIENTE (no por el total, porque el anticipo ya está cubierto)
      db.prepare(`INSERT INTO cxp (
        id, direccion, tercero_id, tercero_nombre, concepto, categoria,
        monto_total, fecha_emision, fecha_vencimiento, estado, observaciones, prioridad,
        user_id, user_nombre, created_at, updated_at, deleted
      ) VALUES (?, 'PAGAR', ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, 0, ?, ?, ?, ?, 0)`).run(
        cxpId, terceroId, orden.proveedor_nombre, conceptoCxp, catPrincipal,
        saldoPendiente, fechaCierre, fechaVenc,
        `Vinculada a orden ${orden.id}` + (body.observaciones ? ' · ' + body.observaciones : ''),
        req.user.id, req.user.nombre, now, now
      );

      // Estado final: si hubo anticipo, la orden tiene "parte pagada" pero la CxP también... cuidado con dobles cargos
      // Solución: cuando hay anticipo + CxP, los movs por item NO se crean al cerrar (se crearán cuando se pague la CxP)
      // El anticipo se mantiene como mov_salida_id (un GASTO genérico "Anticipo a PORVENIR")
      // Cuando se complete el pago de la CxP, ahí se crearán los movs por item con desglose

      estadoFinal = 'PENDIENTE_PAGO';
    }

    // ───── ACTUALIZAR ORDEN ─────
    db.prepare(`UPDATE ordenes_compra SET
      monto_real = ?, ajuste = ?, estado = ?,
      mov_ajuste_id = ?, cxp_id = ?, observaciones = COALESCE(?, observaciones),
      fecha_cierre = ?, updated_at = ?
      WHERE id = ?`).run(
      montoReal, montoReal - anticipo, estadoFinal,
      movDevolucionId, cxpIdCreada,
      body.observaciones || null, fechaCierre, now, orden.id
    );

    return { estadoFinal, cxpIdCreada, movDevolucionId, movItemsCreados };
  });

  try {
    const result = tx();
    audit(req, 'cerrar', 'orden_compra', orden.id, JSON.stringify({
      proveedor: orden.proveedor_nombre,
      monto_real: montoReal,
      estado: result.estadoFinal,
      pago_inmediato: pagoInmediato,
      cxp_creada: result.cxpIdCreada
    }));
    const ordenCompleta = getOrdenCompleta(orden.id);
    res.json({ ok: true, orden: ordenCompleta, ...result });
  } catch (e) {
    console.error('Error cerrando orden:', e);
    res.status(500).json({ error: e.message });
  }
});

// Pagar una orden PENDIENTE_PAGO (registra abono y mueve caja)
// body: { caja_id, monto, fecha, metodo }
app.post('/api/ordenes/:id/pagar', auth, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado !== 'PENDIENTE_PAGO') {
    return res.status(400).json({ error: 'Solo se pueden pagar órdenes en estado PENDIENTE_PAGO' });
  }
  if (!orden.cxp_id) {
    return res.status(400).json({ error: 'Orden sin CxP vinculada' });
  }

  const body = req.body || {};
  const monto = Number(body.monto || 0);
  if (monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
  if (!body.caja_id) return res.status(400).json({ error: 'Falta caja' });

  // Verificar saldo de la CxP
  const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(orden.cxp_id);
  if (!cxp) return res.status(404).json({ error: 'CxP vinculada no encontrada' });
  const yaAbonado = db.prepare("SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0").get(orden.cxp_id).t;
  const saldo = cxp.monto_total - yaAbonado;
  if (monto > saldo + 0.01) {
    return res.status(400).json({ error: `Monto excede el saldo pendiente (${saldo.toFixed(2)})` });
  }

  const now = Date.now();
  const fecha = body.fecha || new Date().toISOString().slice(0, 10);
  const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(body.caja_id);

  const tx = db.transaction(() => {
    // Crear abono en cxp_abonos
    const abonoId = 'ab-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
    
    // Items de la orden para desglosar el gasto contablemente
    const items = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(orden.id);
    const totalItems = items.reduce((s, it) => s + (it.total_real || 0), 0);
    
    // Crear mov(s) por item proporcionalmente al pago
    // Estrategia: si paga 100% del saldo y NO hay anticipo: crear movs por item completos
    // Si paga parcial: crear UN mov genérico a la categoría más usada (más simple)
    
    const esPagoTotal = Math.abs(monto - saldo) < 0.01;
    const pagosAnteriores = yaAbonado > 0;
    
    let movGenericoId = null;
    
    if (esPagoTotal && !pagosAnteriores && (orden.monto_entregado || 0) === 0) {
      // Pago único total sin anticipo: crear movs por item específicos
      for (const it of items) {
        if (!it.total_real || it.total_real <= 0) continue;
        const movId = 'm-ord-pago-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, abono_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, ?, 0)`).run(
          movId, fecha, it.categoria_contable || 'MERCANCIA',
          `${it.producto} (${it.cantidad_real} ${it.unidad}) · ${orden.proveedor_nombre}`,
          it.total_real,
          body.metodo || 'EFECTIVO', body.caja_id, req.user.nombre,
          `Pago orden ${orden.id}`,
          req.user.id, orden.id, abonoId, now, now
        );
      }
      // Mov genérico solo de referencia para el abono (mismo del primer item)
      movGenericoId = db.prepare('SELECT id FROM movs WHERE orden_id = ? AND src = ? AND deleted = 0 ORDER BY created_at ASC LIMIT 1')
        .get(orden.id, 'compra-item')?.id || null;
    } else {
      // Pago parcial o con anticipo previo: crear UN mov genérico
      // Determinar categoría más usada
      const catCount = {};
      items.forEach(it => {
        const c = it.categoria_contable || 'MERCANCIA';
        catCount[c] = (catCount[c] || 0) + (it.total_real || 0);
      });
      const catPrincipal = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || 'MERCANCIA';
      
      movGenericoId = 'm-ord-pago-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
        user_id, src, orden_id, abono_id, created_at, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        movGenericoId, fecha, catPrincipal,
        `Pago a ${orden.proveedor_nombre} · Orden ${orden.id.split('-').pop()}${esPagoTotal ? ' (TOTAL)' : ' (parcial)'}`,
        monto, body.metodo || 'EFECTIVO', body.caja_id, req.user.nombre,
        `Abono a orden ${orden.id}`,
        req.user.id, 'compra-pago', orden.id, abonoId, now, now
      );
    }

    // Crear abono en cxp_abonos
    db.prepare(`INSERT INTO cxp_abonos (
      id, cxp_id, monto, fecha, metodo, caja_id, mov_id, observaciones,
      user_id, user_nombre, created_at, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      abonoId, orden.cxp_id, monto, fecha,
      body.metodo || 'EFECTIVO', body.caja_id, movGenericoId,
      body.observaciones || null, req.user.id, req.user.nombre, now, now
    );

    // Recalcular estado de CxP
    const nuevoAbonado = yaAbonado + monto;
    const saldoNuevo = cxp.monto_total - nuevoAbonado;
    const nuevoEstadoCxP = saldoNuevo < 0.01 ? 'PAGADA' : (nuevoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE');
    db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstadoCxP, now, orden.cxp_id);

    // Si CxP queda PAGADA → orden también PAGADA
    let estadoOrdenFinal = 'PENDIENTE_PAGO';
    if (nuevoEstadoCxP === 'PAGADA') {
      estadoOrdenFinal = 'PAGADA';
      db.prepare("UPDATE ordenes_compra SET estado = 'PAGADA', updated_at = ? WHERE id = ?").run(now, orden.id);
    }

    return { abonoId, movGenericoId, estadoOrdenFinal, saldoNuevo };
  });

  try {
    const result = tx();
    audit(req, 'pagar', 'orden_compra', orden.id, JSON.stringify({
      proveedor: orden.proveedor_nombre,
      monto,
      saldo_restante: result.saldoNuevo,
      estado: result.estadoOrdenFinal
    }));
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Error pagando orden:', e);
    res.status(500).json({ error: e.message });
  }
});

// Cancelar orden (reversa total)
app.post('/api/ordenes/:id/cancelar', auth, requirePin, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado === 'CANCELADA') return res.status(400).json({ error: 'Ya está cancelada' });

  const now = Date.now();
  const tx = db.transaction(() => {
    // Marcar todos los movs asociados como deleted
    db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE orden_id = ? AND deleted = 0').run(now, orden.id);
    // Marcar items como deleted
    db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);
    // Marcar orden como cancelada
    db.prepare("UPDATE ordenes_compra SET estado = 'CANCELADA', updated_at = ? WHERE id = ?").run(now, orden.id);
  });

  try {
    tx();
    audit(req, 'cancelar', 'orden_compra', orden.id, JSON.stringify({ proveedor: orden.proveedor_nombre }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eliminar orden (DELETE total, requiere PIN)
app.delete('/api/ordenes/:id', auth, requirePin, (req, res) => {
  if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
  const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

  const now = Date.now();
  const tx = db.transaction(() => {
    // Revertir todos los movs asociados a la orden
    const movs = db.prepare('SELECT id FROM movs WHERE orden_id = ? AND deleted = 0').all(orden.id);
    db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE orden_id = ? AND deleted = 0').run(now, orden.id);

    // Si la orden tiene CxP vinculada, borrarla también (con sus abonos)
    let cxpBorrada = null;
    if (orden.cxp_id) {
      const abonos = db.prepare('SELECT id, mov_id FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').all(orden.cxp_id);
      for (const ab of abonos) {
        if (ab.mov_id) {
          db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.mov_id);
        }
        db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.id);
      }
      db.prepare('UPDATE cxp SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.cxp_id);
      cxpBorrada = orden.cxp_id;
    }

    db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);
    db.prepare('UPDATE ordenes_compra SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.id);
    return { movs_revertidos: movs.length, cxp_borrada: cxpBorrada };
  });

  try {
    const result = tx();
    audit(req, 'delete', 'orden_compra', orden.id, JSON.stringify({
      proveedor: orden.proveedor_nombre, ...result
    }));
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resumen / KPIs
app.get('/api/ordenes/stats/resumen', auth, (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + '01';

  const hoyStats = db.prepare(`SELECT 
    COUNT(*) as total, 
    COALESCE(SUM(monto_entregado), 0) as entregado,
    COALESCE(SUM(monto_real), 0) as real
    FROM ordenes_compra WHERE fecha = ? AND deleted = 0`).get(hoy);

  const mesStats = db.prepare(`SELECT 
    COUNT(*) as total, 
    COALESCE(SUM(monto_real), 0) as real
    FROM ordenes_compra WHERE fecha >= ? AND deleted = 0`).get(inicioMes);

  // Pendientes de pago (PENDIENTE_PAGO state)
  const pendientesPago = db.prepare(`SELECT 
    COUNT(*) as n,
    COALESCE(SUM(monto_real - monto_entregado), 0) as total
    FROM ordenes_compra WHERE estado = 'PENDIENTE_PAGO' AND deleted = 0`).get();

  // Borradores (sin cerrar)
  const borradores = db.prepare(`SELECT COUNT(*) as n 
    FROM ordenes_compra WHERE estado = 'BORRADOR' AND deleted = 0`).get().n;

  res.json({
    hoy: { total: hoyStats.total, entregado: hoyStats.entregado, real: hoyStats.real },
    mes: { total: mesStats.total, real: mesStats.real },
    pendientes_pago: { count: pendientesPago.n, total: pendientesPago.total },
    borradores
  });
});

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
// =============================================================

// === RUTAS DE VENTAS v1.11.0 ===

const CANALES_VENTA = new Set(['DETALLE', 'MAYOREO', 'DULCERIA', 'MAQUILA']);

// Helper: generar id TEXT estilo del sistema
function newVentaId() {
  return 'v-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function newMovId(prefix) {
  return 'm-' + prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function newVendedorId() {
  return 'vd-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function newCorteId() {
  return 'cd-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}

// Helper: buscar o crear categoría INGRESO por canal
// Devuelve el NOMBRE de la categoría (que es lo que se guarda en movs.categoria)
function ensureCategoriaVenta(canal) {
  const nombreCat = `VENTAS - ${canal}`;
  const existe = db.prepare(
    "SELECT id FROM cats WHERE nombre = ? AND tipo = 'INGRESO' AND deleted = 0"
  ).get(nombreCat);
  if (existe) return nombreCat;

  // Buscar (o crear) un grupo INGRESOS
  let grupo = db.prepare(
    "SELECT id FROM groups WHERE tipo = 'INGRESO' AND deleted = 0 ORDER BY orden ASC LIMIT 1"
  ).get();
  const now = Date.now();
  if (!grupo) {
    const grupoId = 'g-ingresos-' + now;
    db.prepare(`INSERT INTO groups (id, tipo, nombre, orden, updated_at, deleted)
      VALUES (?, 'INGRESO', 'INGRESOS', 0, ?, 0)`).run(grupoId, now);
    grupo = { id: grupoId };
  }
  // Crear la categoría en cats
  const catId = 'c-venta-' + canal.toLowerCase() + '-' + now;
  db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted)
    VALUES (?, 'INGRESO', ?, '#10B981', '💰', ?, ?, 0)`).run(catId, nombreCat, grupo.id, now);
  return nombreCat;
}

// -------- Catálogo de rutas (sin cambios respecto a v1.10) ----------
app.get('/api/ventas/rutas', auth, (req, res) => {
  try {
    const incluirInactivas = req.query.todas === '1';
    const sql = incluirInactivas
      ? 'SELECT * FROM ventas_rutas ORDER BY activa DESC, nombre ASC'
      : 'SELECT * FROM ventas_rutas WHERE activa = 1 ORDER BY nombre ASC';
    res.json(db.prepare(sql).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas/rutas', auth, (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim().toUpperCase();
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const existe = db.prepare('SELECT * FROM ventas_rutas WHERE nombre = ?').get(nombre);
    if (existe) {
      if (!existe.activa) {
        db.prepare('UPDATE ventas_rutas SET activa = 1 WHERE id = ?').run(existe.id);
      }
      return res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(existe.id));
    }
    const r = db.prepare('INSERT INTO ventas_rutas (nombre, activa) VALUES (?, 1)').run(nombre);
    audit(req, 'CREATE', 'ventas_rutas', String(r.lastInsertRowid), `Ruta: ${nombre}`);
    res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ventas/rutas/:id', auth, (req, res) => {
  try {
    const id = +req.params.id;
    const cur = db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'ruta no existe' });
    const nombre = req.body?.nombre != null
      ? String(req.body.nombre).trim().toUpperCase()
      : cur.nombre;
    const activa = req.body?.activa != null ? (req.body.activa ? 1 : 0) : cur.activa;
    db.prepare('UPDATE ventas_rutas SET nombre = ?, activa = ? WHERE id = ?').run(nombre, activa, id);
    audit(req, 'UPDATE', 'ventas_rutas', String(id), `Ruta: ${nombre} (activa=${activa})`);
    res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ventas/rutas/:id', auth, (req, res) => {
  try {
    const id = +req.params.id;
    db.prepare('UPDATE ventas_rutas SET activa = 0 WHERE id = ?').run(id);
    audit(req, 'DELETE', 'ventas_rutas', String(id), 'Soft-delete (marcada inactiva)');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- Catálogo de vendedores (v1.11.1) --------
app.get('/api/ventas/vendedores', auth, (req, res) => {
  try {
    const incluirInactivos = req.query.todos === '1';
    const sql = incluirInactivos
      ? `SELECT * FROM vendedores WHERE deleted = 0
         ORDER BY activo DESC,
                  CASE tipo WHEN 'AUTOVENTA' THEN 0 ELSE 1 END,
                  CASE WHEN ruta_default LIKE 'RUTA %'
                       THEN CAST(SUBSTR(ruta_default,6) AS INTEGER)
                       ELSE 9999 END,
                  nombre ASC`
      : `SELECT * FROM vendedores WHERE deleted = 0 AND activo = 1
         ORDER BY CASE tipo WHEN 'AUTOVENTA' THEN 0 ELSE 1 END,
                  CASE WHEN ruta_default LIKE 'RUTA %'
                       THEN CAST(SUBSTR(ruta_default,6) AS INTEGER)
                       ELSE 9999 END,
                  nombre ASC`;
    res.json(db.prepare(sql).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas/vendedores', auth, (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const id = req.body?.id || newVendedorId();
    const tipo = (req.body?.tipo === 'DISTRIBUIDOR') ? 'DISTRIBUIDOR' : 'AUTOVENTA';
    const now = Date.now();
    db.prepare(`INSERT INTO vendedores (id, sys_code, nombre, ruta_default, telefono, notas, tipo, activo, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        sys_code = excluded.sys_code, nombre = excluded.nombre,
        ruta_default = excluded.ruta_default, telefono = excluded.telefono,
        notas = excluded.notas, tipo = excluded.tipo,
        activo = 1, updated_at = excluded.updated_at, deleted = 0
    `).run(id, req.body?.sys_code || null, nombre, req.body?.ruta_default || null,
      req.body?.telefono || null, req.body?.notas || null, tipo, now);
    audit(req, 'CREATE', 'vendedores', id, `${tipo}: ${nombre}`);
    res.json(db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ventas/vendedores/:id', auth, (req, res) => {
  try {
    const id = req.params.id;
    const cur = db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'vendedor no existe' });
    const now = Date.now();
    const fields = ['sys_code', 'nombre', 'ruta_default', 'telefono', 'notas', 'activo', 'tipo'];
    const next = {};
    for (const f of fields) next[f] = req.body?.[f] != null ? req.body[f] : cur[f];
    next.activo = next.activo ? 1 : 0;
    if (next.tipo !== 'DISTRIBUIDOR' && next.tipo !== 'AUTOVENTA') next.tipo = 'AUTOVENTA';
    db.prepare(`UPDATE vendedores SET sys_code=?, nombre=?, ruta_default=?, telefono=?, notas=?,
      tipo=?, activo=?, updated_at=? WHERE id=?`).run(
      next.sys_code, next.nombre, next.ruta_default, next.telefono, next.notas,
      next.tipo, next.activo, now, id
    );
    audit(req, 'UPDATE', 'vendedores', id, `${next.tipo}: ${next.nombre}`);
    res.json(db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ventas/vendedores/:id', auth, (req, res) => {
  try {
    const id = req.params.id;
    const hard = req.query.hard === '1';
    const cur = db.prepare('SELECT nombre, tipo FROM vendedores WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'vendedor no existe' });
    if (hard) {
      // Verificar que no haya cortes ni ventas vinculados
      const usado = db.prepare(`
        SELECT (SELECT COUNT(*) FROM ventas WHERE vendedor_id = ? AND deleted = 0) +
               (SELECT COUNT(*) FROM ventas_detalle_cortes WHERE vendedor_id = ? AND deleted = 0)
        AS n`).get(id, id);
      if (usado.n > 0) {
        return res.status(400).json({
          error: `No se puede eliminar: tiene ${usado.n} venta(s)/corte(s) vinculados. Use INACTIVAR en su lugar.`
        });
      }
      db.prepare('DELETE FROM vendedores WHERE id = ?').run(id);
      audit(req, 'HARD_DELETE', 'vendedores', id, `Eliminación permanente: ${cur.nombre}`);
    } else {
      const now = Date.now();
      db.prepare('UPDATE vendedores SET activo = 0, deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
      audit(req, 'DELETE', 'vendedores', id, `Soft-delete: ${cur.nombre}`);
    }
    res.json({ ok: true, hard });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- VENTAS simples (MAYOREO/DULCERIA/MAQUILA + DETALLE simple) --------
app.get('/api/ventas', auth, (req, res) => {
  try {
    const { desde, hasta, canal, origen, ruta, cliente, vendedor_id } = req.query;
    const where = ['v.deleted = 0'];
    const params = [];
    if (desde)       { where.push('v.fecha >= ?');     params.push(desde); }
    if (hasta)       { where.push('v.fecha <= ?');     params.push(hasta); }
    if (canal)       { where.push('v.canal = ?');      params.push(String(canal).toUpperCase()); }
    if (origen)      { where.push('v.origen = ?');     params.push(origen); }
    if (ruta)        { where.push('v.ruta = ?');       params.push(String(ruta).toUpperCase()); }
    if (cliente)     { where.push('v.cliente LIKE ?'); params.push('%' + cliente + '%'); }
    if (vendedor_id) { where.push('v.vendedor_id = ?');params.push(vendedor_id); }
    const sql = `
      SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
      FROM ventas v
      LEFT JOIN cajas c     ON c.id = v.caja_id
      LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
      WHERE ${where.join(' AND ')}
      ORDER BY v.fecha DESC, v.created_at DESC
      LIMIT 1000
    `;
    res.json(db.prepare(sql).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// F5_TOTALES_DIA · F5_ROUTE_ORDER_FIXED — totales del día agrupados por canal, con desglose efectivo/transferencia
app.get('/api/ventas/totales-dia', auth, (req, res) => {
  try {
    const fecha = String(req.query.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' });
    }
    // Agrupar ventas vivas del día por canal con desglose por movs.metodo
    // Importante: solo cuenta ventas con su mov vivo (deleted=0 en ambas)
    // Para ventas sin mov_id (raro pero posible), se asume EFECTIVO
    const rows = db.prepare(`
      SELECT
        v.canal AS canal,
        COUNT(*) AS count,
        COALESCE(SUM(v.importe), 0) AS venta_sistema,
        COALESCE(SUM(CASE
          WHEN COALESCE(m.metodo, 'EFECTIVO') = 'TRANSFERENCIA' THEN 0
          ELSE v.importe
        END), 0) AS efectivo,
        COALESCE(SUM(CASE
          WHEN COALESCE(m.metodo, 'EFECTIVO') = 'TRANSFERENCIA' THEN v.importe
          ELSE 0
        END), 0) AS transferencia
      FROM ventas v
      LEFT JOIN movs m ON m.id = v.mov_id AND m.deleted = 0
      WHERE v.fecha = ? AND v.deleted = 0
      GROUP BY v.canal
    `).all(fecha);

    // Asegurar que los 4 canales estén siempre presentes (aunque sea con ceros)
    const canales = ['DETALLE', 'MAYOREO', 'DULCERIA', 'MAQUILA'];
    const porCanal = {};
    for (const c of canales) {
      porCanal[c] = { canal: c, count: 0, venta_sistema: 0, efectivo: 0, transferencia: 0 };
    }
    for (const r of rows) {
      if (porCanal[r.canal]) porCanal[r.canal] = r;
    }

    // Gran total: suma de los 4 canales
    const granTotal = {
      count: canales.reduce((s, c) => s + porCanal[c].count, 0),
      venta_sistema: canales.reduce((s, c) => s + porCanal[c].venta_sistema, 0),
      efectivo: canales.reduce((s, c) => s + porCanal[c].efectivo, 0),
      transferencia: canales.reduce((s, c) => s + porCanal[c].transferencia, 0),
    };

    res.json({
      fecha,
      por_canal: canales.map(c => porCanal[c]),
      gran_total: granTotal,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// HOTFIX_ROUTE_ORDER_CIERRES_DIA — Mount de ventas-cierres-dia ANTES de /api/ventas/:id para evitar
// que Express matchee /api/ventas/cierres-dia como si "cierres-dia" fuera un :id.
const mountVentasCierresDia = require("./ventas-cierres-dia");
mountVentasCierresDia(app, db, { requireAuth: auth, requirePin: requirePin, log: console.log, audit: audit });
const _f4_isDiaCerrado = require("./ventas-cierres-dia").isDiaCerrado;

app.get('/api/ventas/:id', auth, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
      FROM ventas v
      LEFT JOIN cajas c     ON c.id = v.caja_id
      LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
      WHERE v.id = ? AND v.deleted = 0`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'no existe' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas', auth, (req, res) => {
  const tx = db.transaction((body) => {
    const canal = String(body.canal || '').toUpperCase();
    if (!CANALES_VENTA.has(canal)) throw new Error('canal inválido');
    const importe = Number(body.importe);
    if (!(importe > 0)) throw new Error('importe debe ser > 0');

    // caja_id ahora es TEXT (UUID estilo 'caja-principal')
    const caja_id = body.caja_id ? String(body.caja_id).trim() : '';
    if (!caja_id) throw new Error('caja_id requerida');
    const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(caja_id);
    if (!caja) throw new Error('caja no existe o está eliminada');
    if (caja.archivada) throw new Error('caja archivada, no se puede usar');

    const fecha   = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const origen  = body.origen === 'captura-rapida' ? 'captura-rapida' : 'modulo-ventas';
    const usuario = body.usuario || req.user?.nombre || 'sistema';
    const userId  = req.user?.id || null;

    // Auto-registrar ruta si DETALLE y no existe
    let ruta = null;
    if (canal === 'DETALLE') {
      ruta = String(body.ruta || '').trim().toUpperCase();
      if (!ruta) throw new Error('ruta requerida para DETALLE');
      const existe = db.prepare('SELECT id, activa FROM ventas_rutas WHERE nombre = ?').get(ruta);
      if (!existe) {
        db.prepare('INSERT INTO ventas_rutas (nombre, activa) VALUES (?, 1)').run(ruta);
      } else if (!existe.activa) {
        db.prepare('UPDATE ventas_rutas SET activa = 1 WHERE id = ?').run(existe.id);
      }
    }

    const cliente       = body.cliente ? String(body.cliente).trim() : null;
    const numero_pedido = canal === 'DULCERIA' ? (body.numero_pedido || null) : null;
    const comentario    = body.comentario ? String(body.comentario).trim() : null;
    const vendedor_id   = body.vendedor_id || null;

    // Concepto legible para el mov en caja
    const partes = [`VENTA ${canal}`];
    if (ruta)          partes.push(`· ${ruta}`);
    if (cliente)       partes.push(`· ${cliente}`);
    if (numero_pedido) partes.push(`· Pedido ${numero_pedido}`);
    if (origen === 'captura-rapida') partes.push('[CAPTURA RÁPIDA]');
    const concepto = partes.join(' ');

    // Categoría INGRESO correcta (en cats, no categorias)
    const categoriaName = ensureCategoriaVenta(canal);

    const now = Date.now();
    const mov_id = newMovId('venta');
    const venta_id = newVentaId();

    // INSERT correcto en movs (todas las columnas requeridas, IDs TEXT, updated_at para sync)
    const src = origen === 'captura-rapida' ? 'venta-rapida' : 'venta';
    const metodo = (caja.tipo === 'BANCO' || caja.tipo === 'TARJETA') ? 'TRANSFERENCIA' : 'EFECTIVO';
    db.prepare(`INSERT INTO movs (
      id, fecha, tipo, categoria, concepto, monto, metodo, caja,
      usuario, notas, src, user_id, updated_at, deleted
    ) VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      mov_id, fecha, categoriaName, concepto, importe, metodo, caja_id,
      usuario, comentario || '', src, userId, now
    );

    // INSERT en ventas con foreign keys TEXT
    db.prepare(`INSERT INTO ventas (
      id, fecha, canal, ruta, vendedor_id, cliente, numero_pedido, comentario,
      importe, caja_id, mov_id, origen, usuario, user_id, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      venta_id, fecha, canal, ruta, vendedor_id, cliente, numero_pedido, comentario,
      importe, caja_id, mov_id, origen, usuario, userId, now
    );

    audit(req, 'CREATE', 'ventas', venta_id, `${canal} · ${concepto} · ${importe}`);

    return db.prepare(`
      SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
      FROM ventas v
      LEFT JOIN cajas c     ON c.id = v.caja_id
      LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
      WHERE v.id = ?
    `).get(venta_id);
  });

  try {
    res.json(tx(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/ventas/:id', auth, (req, res) => {
  const tx = db.transaction((id) => {
    const v = db.prepare('SELECT * FROM ventas WHERE id = ? AND deleted = 0').get(id);
    if (!v) throw new Error('venta no existe');
    const now = Date.now();
    // Soft-delete venta y mov vinculado (igual que el resto del sistema)
    db.prepare('UPDATE ventas SET deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
    if (v.mov_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, v.mov_id);
    }
    audit(req, 'DELETE', 'ventas', id, `${v.canal} · ${v.importe}`);
    return { ok: true, id };
  });
  try { res.json(tx(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// -------- CORTES DE DETALLE (tabla estilo Excel) --------
// Lista cortes con filtros
app.get('/api/ventas/cortes/detalle', auth, (req, res) => {
  try {
    const { desde, hasta, ruta, vendedor_id } = req.query;
    const where = ['cd.deleted = 0'];
    const params = [];
    if (desde)       { where.push('cd.fecha >= ?');      params.push(desde); }
    if (hasta)       { where.push('cd.fecha <= ?');      params.push(hasta); }
    if (ruta)        { where.push('cd.ruta = ?');        params.push(String(ruta).toUpperCase()); }
    if (vendedor_id) { where.push('cd.vendedor_id = ?'); params.push(vendedor_id); }
    res.json(db.prepare(`
      SELECT cd.*, vd.nombre AS vendedor_nombre_actual
      FROM ventas_detalle_cortes cd
      LEFT JOIN vendedores vd ON vd.id = cd.vendedor_id
      WHERE ${where.join(' AND ')}
      ORDER BY cd.fecha DESC, cd.ruta ASC
      LIMIT 500
    `).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear/Actualizar corte (idempotente por id)
// El frontend manda los 7 importes; backend crea hasta 5 movs (efectivo, transf, crédito, gastos, gasolina)
// -------- Cortes de detalle v1.15.2 --------
// Cambios:
//   - acepta nuevos campos: cheque_vale, tarjetas
//   - TRANSFERENCIA, TARJETAS, CHEQUE/VALE NO crean mov en caja (solo registro)
//   - EFECTIVO crea INGRESO con afecta_saldo=1 (mueve la caja)
//   - GASTOS, GASOLINA crean GASTO con afecta_saldo=0 (registro y reportes, NO mueven caja —
//     porque el vendedor ya los descontó del efectivo entregado, nunca pasaron por caja física)
//   - El campo `diferencia` ahora considera todos los métodos: 
//     (efectivo+transf+cheque_vale+tarjetas+credito+gastos) - venta_sistema
app.post('/api/ventas/cortes/detalle', auth, (req, res) => {
  const tx = db.transaction((body) => {
    const fecha = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const ruta  = String(body.ruta || '').trim().toUpperCase();
    if (!ruta) throw new Error('ruta requerida');
    // F4_CIERRE_DIA — guard: rechaza si el día está cerrado
    if (_f4_isDiaCerrado(db, fecha)) {
      const e = new Error('El día ' + fecha + ' está cerrado. Reábrelo desde Captura por Vendedor (requiere PIN de admin/gerente).');
      e.status = 423;
      throw e;
    }

    const venta_sistema = Math.abs(Number(body.venta_sistema) || 0);
    const efectivo      = Number(body.efectivo) || 0;
    const transferencia = Number(body.transferencia) || 0;
    const cheque_vale   = Number(body.cheque_vale) || 0;
    const tarjetas      = Number(body.tarjetas) || 0;
    const credito       = Number(body.credito) || 0;
    const gastos        = Number(body.gastos) || 0;
    const devoluciones  = Number(body.devoluciones) || 0;
    const gasolina      = Number(body.gasolina) || 0;
    const diferencia    = (efectivo + transferencia + cheque_vale + tarjetas + credito + gastos) - venta_sistema;

    const caja_efectivo_id = body.caja_efectivo_id || null;

    if (efectivo > 0 && !caja_efectivo_id) throw new Error('caja_efectivo_id requerida si hay efectivo');
    if ((gastos > 0 || gasolina > 0) && !caja_efectivo_id) throw new Error('caja_efectivo_id requerida si hay gastos o gasolina');

    if (caja_efectivo_id) {
      const c = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(caja_efectivo_id);
      if (!c) throw new Error('caja efectivo no existe');
    }

    const vendedor_id = body.vendedor_id || null;
    let vendedor_nombre = body.vendedor_nombre || null;
    if (vendedor_id && !vendedor_nombre) {
      const vd = db.prepare('SELECT nombre FROM vendedores WHERE id = ?').get(vendedor_id);
      vendedor_nombre = vd?.nombre || null;
    }

    const id = body.id || newCorteId();
    const isUpdate = !!body.id;
    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';
    const userId = req.user?.id || null;
    const comentario = body.comentario || null;

    if (isUpdate) {
      const prev = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ? AND deleted = 0').get(id);
      if (prev) {
        const movIds = [prev.mov_efectivo_id, prev.mov_transferencia_id, prev.mov_credito_id,
                        prev.mov_gastos_id, prev.mov_devoluciones_id, prev.mov_gasolina_id].filter(Boolean);
        for (const mid of movIds) {
          db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
        }
      }
    }

    const catVenta = ensureCategoriaVenta('DETALLE');
    const catGastosNombre = 'GASTOS DE RUTA';
    const catGasolinaNombre = 'GASOLINA';
    const conceptoBase = `Corte ${ruta}${vendedor_nombre ? ' · ' + vendedor_nombre : ''}`;

    const movs = {};

    // SOLO efectivo crea ingreso en caja
    if (efectivo > 0 && caja_efectivo_id) {
      movs.efectivo = newMovId('vd-efec');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'INGRESO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0)`).run(
        movs.efectivo, fecha, catVenta, conceptoBase + ' (efectivo)', efectivo, caja_efectivo_id,
        usuario, comentario || '', userId, now
      );
    }
    // v1.15.2 FIX: Gastos y gasolina se registran como movs (para trazabilidad y reportes)
    // pero con afecta_saldo = 0 porque NO salen de la caja física: el vendedor ya los
    // descontó del efectivo entregado, no salieron de Caja Principal.
    if (gastos > 0 && caja_efectivo_id) {
      movs.gastos = newMovId('vd-gas');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted, afecta_saldo
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0, 0)`).run(
        movs.gastos, fecha, catGastosNombre, conceptoBase + ' (gastos)', gastos,
        caja_efectivo_id, usuario, comentario || '', userId, now
      );
    }
    if (gasolina > 0 && caja_efectivo_id) {
      movs.gasolina = newMovId('vd-gas2');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted, afecta_saldo
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0, 0)`).run(
        movs.gasolina, fecha, catGasolinaNombre, conceptoBase + ' (gasolina)', gasolina,
        caja_efectivo_id, usuario, comentario || '', userId, now
      );
    }
    // TRANSFERENCIA, TARJETAS, CHEQUE/VALE, CRÉDITO, DEVOLUCIONES: solo registro, NO crean mov

    // INSERT/UPDATE corte
    db.prepare(`INSERT INTO ventas_detalle_cortes (
      id, fecha, ruta, vendedor_id, vendedor_nombre,
      venta_sistema, efectivo, transferencia, credito, gastos, devoluciones, gasolina, diferencia,
      caja_efectivo_id, caja_banco_id,
      mov_efectivo_id, mov_transferencia_id, mov_credito_id,
      mov_gastos_id, mov_devoluciones_id, mov_gasolina_id,
      comentario, usuario, user_id, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      fecha=excluded.fecha, ruta=excluded.ruta,
      vendedor_id=excluded.vendedor_id, vendedor_nombre=excluded.vendedor_nombre,
      venta_sistema=excluded.venta_sistema, efectivo=excluded.efectivo,
      transferencia=excluded.transferencia, credito=excluded.credito,
      gastos=excluded.gastos, devoluciones=excluded.devoluciones, gasolina=excluded.gasolina,
      diferencia=excluded.diferencia,
      caja_efectivo_id=excluded.caja_efectivo_id, caja_banco_id=excluded.caja_banco_id,
      mov_efectivo_id=excluded.mov_efectivo_id, mov_transferencia_id=excluded.mov_transferencia_id,
      mov_credito_id=excluded.mov_credito_id, mov_gastos_id=excluded.mov_gastos_id,
      mov_devoluciones_id=excluded.mov_devoluciones_id, mov_gasolina_id=excluded.mov_gasolina_id,
      comentario=excluded.comentario, usuario=excluded.usuario, user_id=excluded.user_id,
      updated_at=excluded.updated_at, deleted=0
    `).run(
      id, fecha, ruta, vendedor_id, vendedor_nombre,
      venta_sistema, efectivo, transferencia, credito, gastos, devoluciones, gasolina, diferencia,
      caja_efectivo_id, null, // caja_banco_id ya no se usa
      movs.efectivo || null, null, null,  // transferencia ya no genera mov
      movs.gastos || null, null, movs.gasolina || null,
      comentario, usuario, userId, now
    );

    // Persistir cheque_vale y tarjetas en `comentario` o columnas nuevas?
    // Por compatibilidad con schema actual, guardo cheque_vale + tarjetas EN EL COMENTARIO con prefijo
    // (próxima versión podríamos agregar columnas reales si quieres reportes desglosados)
    if (cheque_vale > 0 || tarjetas > 0) {
      const extra = [];
      if (cheque_vale > 0) extra.push(`cheque/vale=${cheque_vale.toFixed(2)}`);
      if (tarjetas > 0)    extra.push(`tarjetas=${tarjetas.toFixed(2)}`);
      const tag = '[' + extra.join('; ') + ']';
      const newComentario = comentario ? (comentario + ' ' + tag) : tag;
      db.prepare('UPDATE ventas_detalle_cortes SET comentario = ? WHERE id = ?').run(newComentario, id);
    }

    audit(req, isUpdate ? 'UPDATE' : 'CREATE', 'ventas_detalle_cortes', id,
      `${fecha} · ${ruta} · sistema=${venta_sistema} efec=${efectivo} dif=${diferencia.toFixed(2)}`);

    return db.prepare(`
      SELECT cd.*, vd.nombre AS vendedor_nombre_actual, vd.tipo AS vendedor_tipo
      FROM ventas_detalle_cortes cd
      LEFT JOIN vendedores vd ON vd.id = cd.vendedor_id
      WHERE cd.id = ?
    `).get(id);
  });

  try { res.json(tx(req.body || {})); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

app.delete('/api/ventas/cortes/detalle/:id', auth, (req, res) => {
  const tx = db.transaction((id) => {
    const cd = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ? AND deleted = 0').get(id);
    if (!cd) throw new Error('corte no existe');
    // F4_CIERRE_DIA — guard: rechaza si el día del corte está cerrado
    if (_f4_isDiaCerrado(db, cd.fecha)) {
      const e = new Error('El día ' + cd.fecha + ' está cerrado. Reábrelo desde Captura por Vendedor (requiere PIN de admin/gerente).');
      e.status = 423;
      throw e;
    }
    const now = Date.now();
    const movIds = [cd.mov_efectivo_id, cd.mov_transferencia_id, cd.mov_credito_id,
                    cd.mov_gastos_id, cd.mov_devoluciones_id, cd.mov_gasolina_id].filter(Boolean);
    for (const mid of movIds) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
    }
    db.prepare('UPDATE ventas_detalle_cortes SET deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
    audit(req, 'DELETE', 'ventas_detalle_cortes', id, `${cd.fecha} · ${cd.ruta}`);
    return { ok: true, id, movsBorrados: movIds.length };
  });
  try { res.json(tx(req.params.id)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

// -------- TOTALES (mejorado: incluye ventas simples + cortes de detalle) --------
app.get('/api/ventas/reportes/totales', auth, (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const d = new Date();
    const dow = (d.getDay() + 6) % 7;
    const lunes = new Date(d); lunes.setDate(d.getDate() - dow);
    const inicioSemana = lunes.toISOString().slice(0, 10);
    const inicioMes  = hoy.slice(0, 7) + '-01';
    const inicioAnio = hoy.slice(0, 4) + '-01-01';

    const sumVentas = (desde, hasta) => {
      const por_canal = db.prepare(`
        SELECT canal,
          COALESCE(SUM(importe), 0) AS total,
          COUNT(*) AS n
        FROM ventas
        WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
        GROUP BY canal
      `).all(desde, hasta);
      const cortes = db.prepare(`
        SELECT
          COALESCE(SUM(efectivo + transferencia + credito), 0) AS total,
          COUNT(*) AS n
        FROM ventas_detalle_cortes
        WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
      `).get(desde, hasta);
      let total = 0, n = 0;
      por_canal.forEach(c => { total += c.total; n += c.n; });
      // sumar cortes a la totales global (pero también marcarlos en por_canal como DETALLE-CORTE)
      if (cortes.total > 0) {
        const existing = por_canal.find(c => c.canal === 'DETALLE');
        if (existing) {
          existing.total += cortes.total;
          existing.n += cortes.n;
        } else {
          por_canal.push({ canal: 'DETALLE', total: cortes.total, n: cortes.n });
        }
        total += cortes.total;
        n += cortes.n;
      }
      return { total, n, por_canal };
    };

    res.json({
      rangos: { hoy, inicioSemana, inicioMes, inicioAnio },
      hoy:    sumVentas(hoy, hoy),
      semana: sumVentas(inicioSemana, hoy),
      mes:    sumVentas(inicioMes, hoy),
      anio:   sumVentas(inicioAnio, hoy)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === FIN RUTAS DE VENTAS v1.11.0 ===
// =============================================================
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
          t.nombre AS proveedor,
          COALESCE(SUM(o.total_real), 0) AS compras_total,
          COUNT(o.id) AS ordenes_count
        FROM ordenes_compra o
        LEFT JOIN terceros t ON t.id = o.proveedor_id
        WHERE o.deleted = 0 AND o.fecha_cierre >= ? AND o.fecha_cierre <= ?
          AND o.estado IN ('PAGADA', 'PENDIENTE_PAGO')
        GROUP BY o.proveedor_id
        ORDER BY compras_total DESC
        LIMIT 10
      `).all(desde, hasta);
    } catch (e) { topProveedores = []; }

    // ============ CxP antigüedad ============
    let cxpAntiguedad = { vigente: 0, mes_1: 0, mes_2_mas: 0, total: 0, count: 0 };
    try {
      const cxpRows = db.prepare(`
        SELECT id, fecha, total, COALESCE(monto_pagado, 0) AS pagado
        FROM cxp
        WHERE deleted = 0 AND estado != 'PAGADA'
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
    } catch (e) {}

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

// === RUTAS DE VIATICOS ===

// Helpers locales
function newViaticoId() {
  return 'vt-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}
function newViaticoConceptoId() {
  return 'vc-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}

// Categoría especial autoexcluida del P&L
const CAT_ANTICIPO = 'ANTICIPOS VIATICOS';

// GET /api/viaticos — listar con filtros
app.get('/api/viaticos', auth, (req, res) => {
  try {
    const { estado, desde, hasta, empleado } = req.query;
    const conds = ['v.deleted = 0'];
    const args = [];
    if (estado && estado !== 'TODOS') { conds.push('v.estado = ?'); args.push(estado); }
    if (desde) { conds.push('v.fecha >= ?'); args.push(desde); }
    if (hasta) { conds.push('v.fecha <= ?'); args.push(hasta); }
    if (empleado) { conds.push("LOWER(v.empleado_nombre) LIKE LOWER(?)"); args.push('%' + empleado + '%'); }
    const rows = db.prepare(`
      SELECT v.*,
        co.nombre AS caja_origen_nombre,
        ca.nombre AS caja_ajuste_nombre,
        (SELECT COUNT(*) FROM viaticos_conceptos vc WHERE vc.viatico_id = v.id AND vc.deleted = 0) AS conceptos_count
      FROM viaticos v
      LEFT JOIN cajas co ON co.id = v.caja_origen
      LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
      WHERE ${conds.join(' AND ')}
      ORDER BY
        CASE v.estado WHEN 'ABIERTO' THEN 0 WHEN 'COMPROBADO' THEN 1 ELSE 2 END,
        v.fecha DESC, v.created_at DESC
    `).all(...args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/viaticos/:id — detalle con conceptos
app.get('/api/viaticos/:id', auth, (req, res) => {
  try {
    const v = db.prepare(`
      SELECT v.*, co.nombre AS caja_origen_nombre, ca.nombre AS caja_ajuste_nombre
      FROM viaticos v
      LEFT JOIN cajas co ON co.id = v.caja_origen
      LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
      WHERE v.id = ? AND v.deleted = 0
    `).get(req.params.id);
    if (!v) return res.status(404).json({ error: 'viatico no existe' });
    const conceptos = db.prepare(`
      SELECT * FROM viaticos_conceptos
      WHERE viatico_id = ? AND deleted = 0
      ORDER BY orden ASC, id ASC
    `).all(req.params.id);
    res.json({ ...v, conceptos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/viaticos/stats/abiertos — KPIs rápidos para sidebar/inteligencia
app.get('/api/viaticos/stats/abiertos', auth, (req, res) => {
  try {
    const r = db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(monto_anticipo), 0) AS total_anticipos,
        COALESCE(SUM(monto_anticipo) - SUM(monto_comprobado), 0) AS saldo_pendiente
      FROM viaticos WHERE deleted = 0 AND estado = 'ABIERTO'
    `).get();
    const masAntiguo = db.prepare(`
      SELECT fecha, empleado_nombre, monto_anticipo
      FROM viaticos WHERE deleted = 0 AND estado = 'ABIERTO'
      ORDER BY fecha ASC LIMIT 1
    `).get();
    res.json({ ...r, mas_antiguo: masAntiguo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/viaticos — crear anticipo (genera mov GASTO de ANTICIPOS VIATICOS)
app.post('/api/viaticos', auth, (req, res) => {
  const tx = db.transaction((body) => {
    const fecha = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const empleado = (body.empleado_nombre || '').trim().toUpperCase();
    if (!empleado) throw new Error('empleado_nombre requerido');
    const monto = Number(body.monto_anticipo) || 0;
    if (!(monto > 0)) throw new Error('monto_anticipo debe ser positivo');
    const cajaOrigen = body.caja_origen;
    if (!cajaOrigen) throw new Error('caja_origen requerida');
    const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaOrigen);
    if (!caja) throw new Error('caja_origen no existe');

    const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
    const validos = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'];
    if (!validos.includes(metodo)) throw new Error('metodo inválido (EFECTIVO/TRANSFERENCIA/TARJETA)');

    const id = body.id || newViaticoId();
    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';
    const userId = req.user?.id || null;
    const concepto = (body.concepto || '').trim() || `Viáticos · ${empleado}`;
    const comentario = body.comentario || null;

    // Crear el mov GASTO de ANTICIPOS VIATICOS
    const movId = newMovId('vt-ant');
    db.prepare(`INSERT INTO movs (
      id, fecha, tipo, categoria, concepto, monto, metodo, caja,
      usuario, notas, src, user_id, updated_at, deleted
    ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'viatico', ?, ?, 0)`).run(
      movId, fecha, CAT_ANTICIPO, concepto, monto, metodo, cajaOrigen,
      usuario, comentario || '', userId, now
    );

    // Crear el viático
    db.prepare(`INSERT INTO viaticos (
      id, fecha, empleado_nombre, empleado_id, concepto,
      monto_anticipo, metodo, caja_origen, estado,
      monto_comprobado, diferencia, mov_anticipo_id,
      comentario, usuario, user_id, created_at, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTO', 0, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id, fecha, empleado, body.empleado_id || null, concepto,
      monto, metodo, cajaOrigen,
      monto, // diferencia = anticipo - comprobado(0) = anticipo
      movId, comentario, usuario, userId, now, now
    );

    audit(req, 'CREATE', 'viaticos', id, `Anticipo $${monto.toFixed(2)} a ${empleado} desde ${caja.nombre}`);

    return db.prepare(`
      SELECT v.*, co.nombre AS caja_origen_nombre
      FROM viaticos v LEFT JOIN cajas co ON co.id = v.caja_origen
      WHERE v.id = ?
    `).get(id);
  });
  try { res.json(tx(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/viaticos/:id/comprobar — comprobar viático con conceptos
// Body: { fecha_comprobacion, caja_ajuste, conceptos: [{categoria, concepto, monto}], comentario }
app.post('/api/viaticos/:id/comprobar', auth, (req, res) => {
  const tx = db.transaction((id, body) => {
    const viatico = db.prepare("SELECT * FROM viaticos WHERE id = ? AND deleted = 0").get(id);
    if (!viatico) throw new Error('viatico no existe');
    if (viatico.estado === 'COMPROBADO') throw new Error('viatico ya está comprobado');

    const conceptos = Array.isArray(body.conceptos) ? body.conceptos : [];
    if (conceptos.length === 0) throw new Error('debe agregar al menos un concepto');

    const fechaComp = (body.fecha_comprobacion || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const cajaAjusteId = body.caja_ajuste || viatico.caja_origen; // default: misma caja
    const cajaAj = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaAjusteId);
    if (!cajaAj) throw new Error('caja_ajuste no existe');

    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';
    const userId = req.user?.id || null;
    const comentarioGeneral = (body.comentario || '').trim() || null;

    // 1) Eliminar mov anterior del anticipo (soft delete)
    if (viatico.mov_anticipo_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_anticipo_id);
    }
    // 2) Eliminar movs anteriores de devolución y faltante si existían (re-comprobar)
    if (viatico.mov_devolucion_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_devolucion_id);
    }
    if (viatico.mov_faltante_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_faltante_id);
    }
    // 3) Eliminar conceptos anteriores y sus movs (si fuera re-comprobación)
    const prevConceptos = db.prepare('SELECT * FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0').all(id);
    for (const pc of prevConceptos) {
      if (pc.mov_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pc.mov_id);
      db.prepare('UPDATE viaticos_conceptos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pc.id);
    }

    // 4) Validar categorías y crear movs reales por cada concepto
    let totalComprobado = 0;
    const conceptosGuardados = [];
    let orden = 0;
    for (const c of conceptos) {
      const categoria = (c.categoria || '').trim().toUpperCase();
      const monto = Number(c.monto) || 0;
      if (!categoria) throw new Error('concepto sin categoría');
      if (!(monto > 0)) throw new Error(`monto inválido en concepto "${categoria}"`);
      // Verificar que la categoría exista en GASTO
      const cat = db.prepare("SELECT * FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0").get(categoria);
      if (!cat) throw new Error(`categoría GASTO "${categoria}" no existe`);
      if (categoria === CAT_ANTICIPO) throw new Error(`no se puede comprobar con la categoría reservada "${CAT_ANTICIPO}"`);

      const conceptoTxt = (c.concepto || '').trim() || categoria;
      const movId = newMovId('vt-gst');
      const notas = `Viático ${id.slice(-6)} · ${viatico.empleado_nombre}` + (comentarioGeneral ? ' · ' + comentarioGeneral : '');

      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'viatico-comprobacion', ?, ?, 0)`).run(
        movId, fechaComp, categoria, conceptoTxt, monto, viatico.metodo, viatico.caja_origen,
        usuario, notas, userId, now
      );

      const conceptoId = newViaticoConceptoId();
      db.prepare(`INSERT INTO viaticos_conceptos (
        id, viatico_id, categoria, concepto, monto, mov_id, orden, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        conceptoId, id, categoria, conceptoTxt, monto, movId, orden++, now
      );
      conceptosGuardados.push({ id: conceptoId, categoria, concepto: conceptoTxt, monto, mov_id: movId });
      totalComprobado += monto;
    }

    // 5) Calcular diferencia (informativa, se guarda en el viático)
    // OPCIÓN B: el anticipo se borró por completo en el paso 1 (devolviendo su
    // monto a la caja), y los gastos comprobados ya descuentan el costo real.
    // Por eso NO se crean movimientos de devolución/faltante: hacerlo duplicaría
    // el ajuste y sumaría/restaría de más al saldo (bug histórico de doble suma).
    // Neto correcto: +anticipo (al borrarlo) − gastos comprobados = −costo real.
    const diferencia = viatico.monto_anticipo - totalComprobado;
    let movDevolucionId = null, movFaltanteId = null;

    // 6) Actualizar viático a COMPROBADO
    db.prepare(`UPDATE viaticos SET
      estado = 'COMPROBADO',
      fecha_comprobacion = ?,
      monto_comprobado = ?,
      diferencia = ?,
      caja_ajuste = ?,
      mov_devolucion_id = ?,
      mov_faltante_id = ?,
      comentario = COALESCE(?, comentario),
      updated_at = ?
      WHERE id = ?`).run(
      fechaComp, totalComprobado, diferencia, cajaAjusteId,
      movDevolucionId, movFaltanteId, comentarioGeneral, now, id
    );

    audit(req, 'COMPROBAR', 'viaticos', id,
      `${viatico.empleado_nombre}: anticipo $${viatico.monto_anticipo} comprobado $${totalComprobado.toFixed(2)} diff $${diferencia.toFixed(2)}`);

    return db.prepare(`
      SELECT v.*, co.nombre AS caja_origen_nombre, ca.nombre AS caja_ajuste_nombre
      FROM viaticos v
      LEFT JOIN cajas co ON co.id = v.caja_origen
      LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
      WHERE v.id = ?
    `).get(id);
  });
  try { res.json(tx(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/viaticos/:id — cancelar viático (revierte todos los movs)
app.delete('/api/viaticos/:id', auth, (req, res) => {
  const tx = db.transaction((id) => {
    const v = db.prepare("SELECT * FROM viaticos WHERE id = ? AND deleted = 0").get(id);
    if (!v) throw new Error('viatico no existe');
    const now = Date.now();
    // Marcar deleted todos los movs vinculados
    const movIds = [v.mov_anticipo_id, v.mov_devolucion_id, v.mov_faltante_id].filter(Boolean);
    const conceptos = db.prepare('SELECT mov_id FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0').all(id);
    conceptos.forEach(c => { if (c.mov_id) movIds.push(c.mov_id); });
    for (const mid of movIds) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
    }
    db.prepare('UPDATE viaticos_conceptos SET deleted = 1, updated_at = ? WHERE viatico_id = ?').run(now, id);
    db.prepare('UPDATE viaticos SET deleted = 1, estado = \'CANCELADO\', updated_at = ? WHERE id = ?').run(now, id);
    audit(req, 'DELETE', 'viaticos', id, `Cancelado: ${v.empleado_nombre} $${v.monto_anticipo}`);
    return { ok: true, movs_revertidos: movIds.length };
  });
  try { res.json(tx(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/viaticos/categorias/gasto — lista de categorías GASTO disponibles
// (excluye ANTICIPOS VIATICOS porque no se puede usar para comprobar)
app.get('/api/viaticos/categorias/gasto', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.id, c.nombre, c.icon, c.color, g.nombre AS grupo
      FROM cats c
      LEFT JOIN groups g ON g.id = c.group_id
      WHERE c.tipo = 'GASTO' AND c.deleted = 0
        AND c.nombre != ?
      ORDER BY
        CASE WHEN g.nombre = 'VIATICOS' THEN 0 ELSE 1 END,
        g.orden, c.nombre
    `).all(CAT_ANTICIPO);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === FIN RUTAS DE VIATICOS ===

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
app.get('/api/backup/full-db', auth, __requireAdminBackup, (req, res) => {
  try {
    if (!__backupFs.existsSync(__dbPath)) return res.status(404).json({ error: 'BD no encontrada' });
    const fname = `kbotanas-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.db`;
    audit(req, 'BACKUP_DOWNLOAD_DB', 'backup', '', `Descarga backup completo`);
    res.download(__dbPath, fname);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
app.post('/api/backup/auto-run', auth, __requireAdminBackup, (req, res) => {
  try {
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const dest = __backupPath.join(__backupAutoDir, `kbotanas-MANUAL-${ts}.db`);
    __backupFs.copyFileSync(__dbPath, dest);
    const st = __backupFs.statSync(dest);
    audit(req, 'BACKUP_RUN', 'backup', dest, `Backup manual creado: ${(st.size/1024).toFixed(1)} KB`);
    res.json({ ok: true, file: __backupPath.basename(dest), size: st.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/backup/restore-full — restaurar BD completa desde archivo subido
// Requiere: confirmation_token === "RESTAURAR" + password admin verificada
// Body: { confirmation_token, password, db_base64 }
app.post('/api/backup/restore-full', auth, __requireAdminBackup, (req, res) => {
  try {
    const { confirmation_token, password, db_base64 } = req.body || {};
    if (confirmation_token !== 'RESTAURAR') {
      return res.status(400).json({ error: 'Token de confirmación inválido. Debes escribir RESTAURAR exactamente.' });
    }
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
    if (!db_base64) return res.status(400).json({ error: 'Archivo de backup requerido' });

    // Verificar password del admin
    const userRow = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(req.user.id);
    if (!userRow) return res.status(403).json({ error: 'Usuario no existe' });
    const bcrypt = require('bcryptjs');
    const ok = bcrypt.compareSync(password, userRow.password_hash || '');
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

// =============================================================
// K-BOTANAS · Backend Nómina v1.0
// CRUD departamentos, empleados, comisiones_tabla, bonos_config
// Periodos: crear, listar, sugerencias, cerrar (genera movs GASTO)
// Préstamos: crear, abonar, saldar
// =============================================================

// === RUTAS DE NOMINA ===

function newDeptId() { return 'dept-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newEmpId() { return 'emp-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newPeriodoId() { return 'np-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newPagoId() { return 'npg-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newPrestamoId() { return 'pr-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newAbonoId() { return 'pa-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newComisionTableId() { return 'com-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function newBonoId() { return 'bono-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000); }

const CAT_PRESTAMO = 'PRESTAMOS EMPLEADOS';
const CAT_ABONO = 'ABONO PRESTAMO EMPLEADO';

// -------- Departamentos --------
app.get('/api/nomina/departamentos', auth, (req, res) => {
  try {
    const all = req.query.todos === '1';
    const sql = all
      ? 'SELECT * FROM departamentos WHERE deleted = 0 ORDER BY orden, nombre'
      : 'SELECT * FROM departamentos WHERE deleted = 0 AND activo = 1 ORDER BY orden, nombre';
    res.json(db.prepare(sql).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/nomina/departamentos', auth, (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim().toUpperCase();
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const catNomina = 'NOMINA ' + nombre;
    const id = req.body?.id || newDeptId();
    const now = Date.now();
    db.prepare(`INSERT INTO departamentos (id, nombre, categoria_nomina, orden, activo, updated_at, deleted)
      VALUES (?, ?, ?, ?, 1, ?, 0)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, categoria_nomina=excluded.categoria_nomina,
      orden=excluded.orden, activo=1, updated_at=excluded.updated_at, deleted=0`)
      .run(id, nombre, catNomina, Number(req.body?.orden) || 0, now);
    // Crear categoría GASTO si no existe
    const existeCat = db.prepare("SELECT id FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0").get(catNomina);
    if (!existeCat) {
      const grupo = db.prepare("SELECT id FROM groups WHERE nombre = 'NOMINA' AND tipo = 'GASTO' AND deleted = 0 LIMIT 1").get();
      if (grupo) {
        db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted)
          VALUES (?, 'GASTO', ?, '#3B82F6', '👥', ?, ?, 0)`).run('cat-nom-' + id, catNomina, grupo.id, now);
      }
    }
    audit(req, 'CREATE', 'departamentos', id, 'Departamento: ' + nombre);
    res.json(db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/nomina/departamentos/:id', auth, (req, res) => {
  try {
    const id = req.params.id;
    const cur = db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'dept no existe' });
    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim().toUpperCase() : cur.nombre;
    const activo = req.body?.activo != null ? (req.body.activo ? 1 : 0) : cur.activo;
    const orden = req.body?.orden != null ? Number(req.body.orden) : cur.orden;
    const catNomina = 'NOMINA ' + nombre;
    db.prepare(`UPDATE departamentos SET nombre=?, categoria_nomina=?, orden=?, activo=?, updated_at=? WHERE id=?`)
      .run(nombre, catNomina, orden, activo, Date.now(), id);
    audit(req, 'UPDATE', 'departamentos', id, `${nombre} activo=${activo}`);
    res.json(db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/nomina/departamentos/:id', auth, (req, res) => {
  try {
    db.prepare('UPDATE departamentos SET deleted = 1, activo = 0, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    audit(req, 'DELETE', 'departamentos', req.params.id, 'Eliminado');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- Empleados --------
app.get('/api/nomina/empleados', auth, (req, res) => {
  try {
    const all = req.query.todos === '1';
    const tipo = req.query.tipo;
    let sql = `SELECT e.*, d.nombre AS departamento_nombre, d.categoria_nomina,
      (SELECT COUNT(*) FROM prestamos pr WHERE pr.empleado_id = e.id AND pr.estado = 'ACTIVO' AND pr.deleted = 0) AS prestamos_activos,
      (SELECT COALESCE(SUM(saldo_actual), 0) FROM prestamos pr WHERE pr.empleado_id = e.id AND pr.estado = 'ACTIVO' AND pr.deleted = 0) AS prestamos_saldo
      FROM empleados e
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      WHERE e.deleted = 0`;
    const args = [];
    if (!all) { sql += ' AND e.activo = 1'; }
    if (tipo) { sql += ' AND e.tipo = ?'; args.push(tipo); }
    sql += ` ORDER BY e.activo DESC, COALESCE(e.numero, 999999), e.nombre`;
    res.json(db.prepare(sql).all(...args));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/nomina/empleados', auth, (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const id = req.body?.id || newEmpId();
    const now = Date.now();
    const tipoVal = (req.body?.tipo || 'PLANTA').toUpperCase();
    db.prepare(`INSERT INTO empleados
      (id, numero, nombre, departamento_id, tipo, sueldo_base, vendedor_id, fecha_ingreso, telefono, banco, cuenta, notas, activo, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)
      ON CONFLICT(id) DO UPDATE SET numero=excluded.numero, nombre=excluded.nombre, departamento_id=excluded.departamento_id,
        tipo=excluded.tipo, sueldo_base=excluded.sueldo_base, vendedor_id=excluded.vendedor_id,
        fecha_ingreso=excluded.fecha_ingreso, telefono=excluded.telefono, banco=excluded.banco,
        cuenta=excluded.cuenta, notas=excluded.notas, activo=1, updated_at=excluded.updated_at, deleted=0
    `).run(
      id, req.body?.numero || null, nombre, req.body?.departamento_id || null,
      tipoVal, Number(req.body?.sueldo_base) || 0, req.body?.vendedor_id || null,
      req.body?.fecha_ingreso || null, req.body?.telefono || null,
      req.body?.banco || null, req.body?.cuenta || null, req.body?.notas || null, now
    );
    audit(req, 'CREATE', 'empleados', id, `${tipoVal}: ${nombre}`);
    res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/nomina/empleados/:id', auth, (req, res) => {
  try {
    const id = req.params.id;
    const cur = db.prepare('SELECT * FROM empleados WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'empleado no existe' });
    const fields = ['numero', 'nombre', 'departamento_id', 'tipo', 'sueldo_base', 'vendedor_id',
      'fecha_ingreso', 'telefono', 'banco', 'cuenta', 'notas', 'activo'];
    const next = {};
    for (const f of fields) next[f] = req.body?.[f] != null ? req.body[f] : cur[f];
    next.activo = next.activo ? 1 : 0;
    if (next.tipo) next.tipo = String(next.tipo).toUpperCase();
    db.prepare(`UPDATE empleados SET numero=?, nombre=?, departamento_id=?, tipo=?, sueldo_base=?, vendedor_id=?,
      fecha_ingreso=?, telefono=?, banco=?, cuenta=?, notas=?, activo=?, updated_at=? WHERE id=?`).run(
      next.numero, next.nombre, next.departamento_id, next.tipo, Number(next.sueldo_base) || 0,
      next.vendedor_id, next.fecha_ingreso, next.telefono, next.banco, next.cuenta, next.notas,
      next.activo, Date.now(), id
    );
    audit(req, 'UPDATE', 'empleados', id, next.nombre);
    res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/nomina/empleados/:id', auth, (req, res) => {
  try {
    const hard = req.query.hard === '1';
    if (hard) {
      const usado = db.prepare(`SELECT
        (SELECT COUNT(*) FROM nominas_pagos WHERE empleado_id = ? AND deleted = 0) +
        (SELECT COUNT(*) FROM prestamos WHERE empleado_id = ? AND deleted = 0) AS n
      `).get(req.params.id, req.params.id);
      if (usado.n > 0) {
        return res.status(400).json({
          error: `Empleado tiene ${usado.n} registros vinculados. Usa INACTIVAR en su lugar.`
        });
      }
      db.prepare('DELETE FROM empleados WHERE id = ?').run(req.params.id);
      audit(req, 'HARD_DELETE', 'empleados', req.params.id, 'Eliminación permanente');
    } else {
      db.prepare('UPDATE empleados SET deleted = 1, activo = 0, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
      audit(req, 'DELETE', 'empleados', req.params.id, 'Soft-delete');
    }
    res.json({ ok: true, hard });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// -------- Tabla de comisiones --------
app.get('/api/nomina/comisiones-tabla', auth, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM comisiones_tabla WHERE deleted = 0 ORDER BY venta_minima ASC').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/nomina/comisiones-tabla', auth, (req, res) => {
  try {
    const id = req.body?.id || newComisionTableId();
    const now = Date.now();
    db.prepare(`INSERT INTO comisiones_tabla (id, venta_minima, pct_comision, bono_meta, orden, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET venta_minima=excluded.venta_minima, pct_comision=excluded.pct_comision,
      bono_meta=excluded.bono_meta, orden=excluded.orden, updated_at=excluded.updated_at, deleted=0
    `).run(id, Number(req.body?.venta_minima) || 0, Number(req.body?.pct_comision) || 0,
      Number(req.body?.bono_meta) || 0, Number(req.body?.orden) || 0, now);
    audit(req, 'CREATE_OR_UPDATE', 'comisiones_tabla', id, '');
    res.json(db.prepare('SELECT * FROM comisiones_tabla WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/nomina/comisiones-tabla/:id', auth, (req, res) => {
  try {
    db.prepare('UPDATE comisiones_tabla SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    audit(req, 'DELETE', 'comisiones_tabla', req.params.id, '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- Bonos config --------
app.get('/api/nomina/bonos', auth, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM bonos_config WHERE deleted = 0 ORDER BY tipo, posicion').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/nomina/bonos', auth, (req, res) => {
  try {
    const id = req.body?.id || newBonoId();
    const tipo = (req.body?.tipo || 'RANKING').toUpperCase();
    if (!['RANKING', 'MENSUAL'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    db.prepare(`INSERT INTO bonos_config (id, tipo, posicion, monto, activo, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, posicion=excluded.posicion, monto=excluded.monto,
        activo=excluded.activo, updated_at=excluded.updated_at, deleted=0
    `).run(id, tipo, Number(req.body?.posicion) || 0, Number(req.body?.monto) || 0,
      req.body?.activo === false ? 0 : 1, Date.now());
    res.json(db.prepare('SELECT * FROM bonos_config WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/nomina/bonos/:id', auth, (req, res) => {
  try {
    db.prepare('UPDATE bonos_config SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- Cálculo de comisiones (helper) --------
function calcComisionVendedor(vendedorId, desdeISO, hastaISO) {
  // Suma efectivo + transferencia de ventas_detalle_cortes para ese vendedor en ese rango
  const r = db.prepare(`
    SELECT COALESCE(SUM(efectivo + transferencia), 0) AS venta_total
    FROM ventas_detalle_cortes
    WHERE deleted = 0 AND vendedor_id = ? AND fecha >= ? AND fecha <= ?
  `).get(vendedorId, desdeISO, hastaISO);
  return r.venta_total || 0;
}

function buscarEscalonComision(ventaTotal) {
  // Floor: el escalón más alto cuyo venta_minima <= ventaTotal
  return db.prepare(`
    SELECT * FROM comisiones_tabla
    WHERE deleted = 0 AND venta_minima <= ?
    ORDER BY venta_minima DESC LIMIT 1
  `).get(ventaTotal);
}

function rankingSemanal(desdeISO, hastaISO) {
  // Top vendedores por suma efectivo+transferencia
  return db.prepare(`
    SELECT v.id AS vendedor_id, v.nombre,
      COALESCE(SUM(cd.efectivo + cd.transferencia), 0) AS venta_total
    FROM vendedores v
    JOIN ventas_detalle_cortes cd ON cd.vendedor_id = v.id AND cd.deleted = 0
      AND cd.fecha >= ? AND cd.fecha <= ?
    WHERE v.deleted = 0 AND v.activo = 1
    GROUP BY v.id
    HAVING venta_total > 0
    ORDER BY venta_total DESC
    LIMIT 10
  `).all(desdeISO, hastaISO);
}

function bonoMensualVendedor(vendedorId, anioMes) {
  // anioMes = "YYYY-MM"
  const desde = anioMes + '-01';
  // Fin de mes
  const [y, m] = anioMes.split('-').map(Number);
  const endDate = new Date(y, m, 0); // último día del mes
  const hasta = endDate.toISOString().slice(0, 10);
  const r = db.prepare(`
    SELECT COALESCE(SUM(efectivo + transferencia), 0) AS venta_mes
    FROM ventas_detalle_cortes
    WHERE deleted = 0 AND vendedor_id = ? AND fecha >= ? AND fecha <= ?
  `).get(vendedorId, desde, hasta);
  const ventaMes = r.venta_mes || 0;
  // Buscar bono mensual aplicable (mayor meta cumplida)
  const bono = db.prepare(`
    SELECT * FROM bonos_config
    WHERE tipo = 'MENSUAL' AND activo = 1 AND deleted = 0 AND posicion <= ?
    ORDER BY posicion DESC LIMIT 1
  `).get(ventaMes);
  return { venta_mes: ventaMes, bono: bono ? bono.monto : 0, meta_alcanzada: bono ? bono.posicion : 0 };
}

// -------- Periodos de nómina --------

// Helpers para fechas
function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function inicioMesPrevio(fechaISO) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

app.get('/api/nomina/periodos', auth, (req, res) => {
  try {
    const estado = req.query.estado;
    let sql = `SELECT np.*, c.nombre AS caja_nombre,
      (SELECT COUNT(*) FROM nominas_pagos WHERE periodo_id = np.id AND deleted = 0) AS pagos_count
      FROM nominas_periodos np
      LEFT JOIN cajas c ON c.id = np.caja_id
      WHERE np.deleted = 0`;
    const args = [];
    if (estado && estado !== 'TODOS') { sql += ' AND np.estado = ?'; args.push(estado); }
    sql += ' ORDER BY np.fecha_inicio DESC, np.created_at DESC';
    res.json(db.prepare(sql).all(...args));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/nomina/periodos/:id', auth, (req, res) => {
  try {
    const p = db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
      LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ? AND np.deleted = 0`).get(req.params.id);
    if (!p) return res.status(404).json({ error: 'periodo no existe' });
    const pagos = db.prepare(`SELECT np.*, e.numero AS empleado_numero, e.tipo AS empleado_tipo,
        e.vendedor_id, d.nombre AS departamento_nombre_actual
      FROM nominas_pagos np
      LEFT JOIN empleados e ON e.id = np.empleado_id
      LEFT JOIN departamentos d ON d.id = np.departamento_id
      WHERE np.periodo_id = ? AND np.deleted = 0
      ORDER BY np.orden, np.empleado_nombre`).all(req.params.id);
    res.json({ ...p, pagos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear periodo nuevo + auto-precarga de empleados activos + sugerencias automáticas
app.post('/api/nomina/periodos', auth, (req, res) => {
  const tx = db.transaction((body) => {
    const fechaPago = (body.fecha_pago || new Date().toISOString().slice(0,10)).slice(0,10);
    // Semana actual: lunes a domingo donde cae fecha_pago
    const dPago = new Date(fechaPago + 'T12:00:00');
    const dow = dPago.getDay(); // 0=domingo, 1=lunes...
    const lunesActual = new Date(dPago);
    const diffToMonday = (dow === 0 ? -6 : 1 - dow);
    lunesActual.setDate(lunesActual.getDate() + diffToMonday);
    const fechaInicio = lunesActual.toISOString().slice(0,10);
    const fechaFin = addDaysISO(fechaInicio, 6); // domingo
    // Comisiones = semana anterior (lunes a domingo)
    const comisionesDesde = addDaysISO(fechaInicio, -7);
    const comisionesHasta = addDaysISO(fechaInicio, -1);
    // Bono mensual: mes anterior completo a fecha_pago
    const bonoMensualMes = inicioMesPrevio(fechaPago);

    const cajaId = body.caja_id;
    if (!cajaId) throw new Error('caja_id requerida');
    const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaId);
    if (!caja) throw new Error('caja no existe');

    // Verificar no haya otro periodo ABIERTO ya
    const abierto = db.prepare(`SELECT id, fecha_inicio FROM nominas_periodos WHERE estado = 'ABIERTO' AND deleted = 0 LIMIT 1`).get();
    if (abierto && !body.force) {
      throw new Error(`Ya existe un periodo ABIERTO (inició ${abierto.fecha_inicio}). Ciérralo primero o usa force=true.`);
    }

    const id = body.id || newPeriodoId();
    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';

    db.prepare(`INSERT INTO nominas_periodos
      (id, fecha_inicio, fecha_fin, fecha_pago, comisiones_desde, comisiones_hasta, bono_mensual_mes,
       estado, total_nomina, empleados_pagados, caja_id, comentario, usuario, user_id, created_at, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ABIERTO', 0, 0, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, fechaInicio, fechaFin, fechaPago, comisionesDesde, comisionesHasta, bonoMensualMes,
      cajaId, body.comentario || null, usuario, req.user?.id || null, now, now);

    // Calcular ranking semana anterior para asignar bonos automáticos
    const ranking = rankingSemanal(comisionesDesde, comisionesHasta);
    const rankingMap = {}; // vendedor_id -> { pos, bono }
    const bonosRanking = db.prepare(`SELECT * FROM bonos_config WHERE tipo = 'RANKING' AND activo = 1 AND deleted = 0 ORDER BY posicion`).all();
    ranking.slice(0, bonosRanking.length).forEach((r, i) => {
      rankingMap[r.vendedor_id] = { pos: i + 1, bono: bonosRanking[i].monto };
    });

    // Auto-precarga de empleados activos
    const empleados = db.prepare(`SELECT e.*, d.nombre AS dept_nombre, d.categoria_nomina, d.id AS dept_id
      FROM empleados e
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      WHERE e.deleted = 0 AND e.activo = 1
      ORDER BY COALESCE(e.numero, 999999), e.nombre`).all();

    let orden = 0;
    for (const emp of empleados) {
      const empCajaId = cajaId; // default a caja del periodo
      // Calcular comisión sugerida si es VENDEDOR y tiene vendedor_id vinculado
      let comisionesSugeridas = 0;
      let detalle = { tipo: emp.tipo, vendedor_id: emp.vendedor_id, ventas_s1: 0, escalon: null,
        comision_base: 0, bono_meta: 0, ranking_pos: 0, ranking_bono: 0, bono_mensual: 0, total: 0 };
      if (emp.tipo === 'VENDEDOR' && emp.vendedor_id) {
        const venta = calcComisionVendedor(emp.vendedor_id, comisionesDesde, comisionesHasta);
        detalle.ventas_s1 = venta;
        const escalon = buscarEscalonComision(venta);
        if (escalon) {
          const comBase = venta * escalon.pct_comision;
          detalle.escalon = { venta_minima: escalon.venta_minima, pct: escalon.pct_comision };
          detalle.comision_base = comBase;
          detalle.bono_meta = escalon.bono_meta;
          comisionesSugeridas += comBase + escalon.bono_meta;
        }
        // Bono ranking
        if (rankingMap[emp.vendedor_id]) {
          detalle.ranking_pos = rankingMap[emp.vendedor_id].pos;
          detalle.ranking_bono = rankingMap[emp.vendedor_id].bono;
          comisionesSugeridas += rankingMap[emp.vendedor_id].bono;
        }
        // Bono mensual
        const bm = bonoMensualVendedor(emp.vendedor_id, bonoMensualMes);
        if (bm.bono > 0) {
          detalle.bono_mensual = bm.bono;
          detalle.bono_mensual_venta = bm.venta_mes;
          comisionesSugeridas += bm.bono;
        }
        detalle.total = comisionesSugeridas;
      }

      // Sugerir abono a préstamos activos (si tiene)
      let abonoSugerido = 0;
      const prestamosActivos = db.prepare(`SELECT abono_sugerido_semanal, saldo_actual FROM prestamos
        WHERE empleado_id = ? AND estado = 'ACTIVO' AND deleted = 0`).all(emp.id);
      prestamosActivos.forEach(pr => {
        const sug = Math.min(Number(pr.abono_sugerido_semanal) || 0, Number(pr.saldo_actual) || 0);
        abonoSugerido += sug;
      });

      const neto = Number(emp.sueldo_base) || 0;
      const total = neto + comisionesSugeridas - abonoSugerido;

      db.prepare(`INSERT INTO nominas_pagos
        (id, periodo_id, empleado_id, empleado_nombre, departamento_id, departamento_nombre, categoria_nomina,
         caja_id, neto, comisiones, comisiones_detalle, prestamos_abonados, total, orden, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        newPagoId(), id, emp.id, emp.nombre, emp.dept_id, emp.dept_nombre,
        emp.categoria_nomina || 'NOMINA SIN DEPTO', empCajaId,
        neto, comisionesSugeridas, JSON.stringify(detalle), abonoSugerido, total, orden++, now
      );
    }

    audit(req, 'CREATE', 'nominas_periodos', id,
      `Periodo ${fechaInicio} a ${fechaFin} · ${empleados.length} empleados · caja: ${caja.nombre}`);

    return db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
      LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ?`).get(id);
  });
  try { res.json(tx(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Editar un pago individual (neto, comisiones, abono, caja, departamento)
app.put('/api/nomina/pagos/:id', auth, (req, res) => {
  try {
    const id = req.params.id;
    const cur = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(id);
    if (!cur) return res.status(404).json({ error: 'pago no existe' });
    const periodo = db.prepare('SELECT estado FROM nominas_periodos WHERE id = ?').get(cur.periodo_id);
    if (periodo?.estado === 'CERRADO') return res.status(400).json({ error: 'periodo ya está cerrado, no se puede editar' });

    const neto = req.body?.neto != null ? Number(req.body.neto) : cur.neto;
    const comisiones = req.body?.comisiones != null ? Number(req.body.comisiones) : cur.comisiones;
    const abono = req.body?.prestamos_abonados != null ? Number(req.body.prestamos_abonados) : cur.prestamos_abonados;
    const cajaId = req.body?.caja_id || cur.caja_id;
    const deptId = req.body?.departamento_id !== undefined ? req.body.departamento_id : cur.departamento_id;
    let deptNombre = cur.departamento_nombre, catNomina = cur.categoria_nomina;
    if (deptId && deptId !== cur.departamento_id) {
      const d = db.prepare('SELECT nombre, categoria_nomina FROM departamentos WHERE id = ?').get(deptId);
      if (d) { deptNombre = d.nombre; catNomina = d.categoria_nomina; }
    }
    const comentario = req.body?.comentario != null ? req.body.comentario : cur.comentario;
    const total = neto + comisiones - abono;
    db.prepare(`UPDATE nominas_pagos SET neto=?, comisiones=?, prestamos_abonados=?, total=?, caja_id=?,
      departamento_id=?, departamento_nombre=?, categoria_nomina=?, comentario=?, updated_at=? WHERE id=?`)
      .run(neto, comisiones, abono, total, cajaId, deptId, deptNombre, catNomina, comentario, Date.now(), id);
    res.json(db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Agregar empleado manual al periodo (ej. uno temporal no precargado)
app.post('/api/nomina/periodos/:id/agregar-pago', auth, (req, res) => {
  try {
    const periodoId = req.params.id;
    const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(periodoId);
    if (!periodo) return res.status(404).json({ error: 'periodo no existe' });
    if (periodo.estado === 'CERRADO') return res.status(400).json({ error: 'periodo ya cerrado' });

    const empId = req.body?.empleado_id || null;
    let empleado = null;
    if (empId) empleado = db.prepare('SELECT * FROM empleados WHERE id = ?').get(empId);
    const empNombre = req.body?.empleado_nombre || empleado?.nombre || 'EMPLEADO TEMPORAL';
    const deptId = req.body?.departamento_id || empleado?.departamento_id || null;
    let dept = null;
    if (deptId) dept = db.prepare('SELECT nombre, categoria_nomina FROM departamentos WHERE id = ?').get(deptId);

    const neto = Number(req.body?.neto) || 0;
    const comisiones = Number(req.body?.comisiones) || 0;
    const abono = Number(req.body?.prestamos_abonados) || 0;
    const total = neto + comisiones - abono;

    const ordenMax = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM nominas_pagos WHERE periodo_id = ?').get(periodoId).m;
    const id = newPagoId();
    db.prepare(`INSERT INTO nominas_pagos
      (id, periodo_id, empleado_id, empleado_nombre, departamento_id, departamento_nombre, categoria_nomina,
       caja_id, neto, comisiones, prestamos_abonados, total, orden, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, periodoId, empId, empNombre.toUpperCase(), deptId, dept?.nombre || null,
      dept?.categoria_nomina || 'NOMINA SIN DEPTO',
      req.body?.caja_id || periodo.caja_id, neto, comisiones, abono, total, ordenMax + 1, Date.now());
    audit(req, 'CREATE', 'nominas_pagos', id, `Agregado a periodo: ${empNombre}`);
    res.json(db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Eliminar un pago (antes del cierre)
app.delete('/api/nomina/pagos/:id', auth, (req, res) => {
  try {
    const pago = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!pago) return res.status(404).json({ error: 'pago no existe' });
    const periodo = db.prepare('SELECT estado FROM nominas_periodos WHERE id = ?').get(pago.periodo_id);
    if (periodo?.estado === 'CERRADO') return res.status(400).json({ error: 'periodo cerrado' });
    db.prepare('UPDATE nominas_pagos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    audit(req, 'DELETE', 'nominas_pagos', req.params.id, `Quitado: ${pago.empleado_nombre}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// CERRAR PERIODO: genera movs GASTO y abonos a préstamos
app.post('/api/nomina/periodos/:id/cerrar', auth, (req, res) => {
  const tx = db.transaction((periodoId) => {
    const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(periodoId);
    if (!periodo) throw new Error('periodo no existe');
    if (periodo.estado === 'CERRADO') throw new Error('periodo ya está cerrado');

    // F1_CERRAR_PATCH — solo procesa pagos pendientes; los ya pagados se respetan
    const pagosPendientes = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ? AND deleted = 0 AND pagado = 0').all(periodoId);
    const pagosYaPagados  = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ? AND deleted = 0 AND pagado = 1').all(periodoId);
    const pagos = pagosPendientes; // mantenemos nombre 'pagos' para no romper el resto del código
    if (pagos.length === 0) throw new Error('no hay pagos en este periodo');

    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';
    const userId = req.user?.id || null;
    // HOTFIX_BUG1_CERRAR_FECHA_HOY — el mov refleja cuándo se ejecuta el cierre, no la fecha_pago oficial
    const fechaMov = new Date().toISOString().slice(0, 10);
    let totalNomina = 0, empleadosPagados = 0;

    for (const p of pagos) {
      if (p.total <= 0 && p.neto <= 0 && p.comisiones <= 0) continue;

      // Verificar caja
      const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(p.caja_id);
      if (!caja) throw new Error(`Caja del pago de ${p.empleado_nombre} no existe`);

      // Crear mov GASTO por el TOTAL (neto + comisiones - abono)
      // El abono se registra como INGRESO separado a la misma caja
      const concepto = `Nómina ${periodo.fecha_inicio} · ${p.empleado_nombre}`;
      const movGastoId = newMovId('nom');
      const montoGasto = Number(p.total) || 0;
      if (montoGasto > 0) {
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja,
          usuario, notas, src, user_id, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'nomina', ?, ?, 0)`).run(
          movGastoId, fechaMov /* HOTFIX_BUG1_CERRAR_FECHA_HOY */, p.categoria_nomina, concepto, montoGasto,
          p.caja_id, usuario,
          `Periodo ${periodo.id.slice(-6)} · Neto ${p.neto} + Comis ${p.comisiones} - Abono ${p.prestamos_abonados}`,
          userId, now
        );
      }

      // Si hay abono a préstamo, aplicar a el(los) préstamo(s) activo(s)
      if ((Number(p.prestamos_abonados) || 0) > 0 && p.empleado_id) {
        let remanente = Number(p.prestamos_abonados);
        const prestamosActivos = db.prepare(`SELECT * FROM prestamos
          WHERE empleado_id = ? AND estado = 'ACTIVO' AND deleted = 0
          ORDER BY fecha ASC`).all(p.empleado_id);
        for (const pr of prestamosActivos) {
          if (remanente <= 0) break;
          const aAbonar = Math.min(remanente, Number(pr.saldo_actual) || 0);
          if (aAbonar <= 0) continue;
          // Registrar abono
          db.prepare(`INSERT INTO prestamos_abonos
            (id, prestamo_id, periodo_id, fecha, monto, metodo, caja_id, comentario, usuario, user_id, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, 'DESCUENTO_NOMINA', NULL, ?, ?, ?, ?, 0)
          `).run(newAbonoId(), pr.id, periodoId, fechaMov /* HOTFIX_BUG1_CERRAR_FECHA_HOY */, aAbonar,
            `Descuento en nómina ${periodo.fecha_inicio}`, usuario, userId, now);
          // Actualizar saldo
          const nuevoSaldo = Number(pr.saldo_actual) - aAbonar;
          const nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
          db.prepare(`UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?`)
            .run(nuevoSaldo, nuevoEstado, nuevoEstado === 'SALDADO' ? fechaMov : null, now, pr.id); /* HOTFIX_BUG1_CERRAR_FECHA_HOY */
          remanente -= aAbonar;
        }
      }

      // Actualizar mov_id en el pago
      db.prepare('UPDATE nominas_pagos SET mov_id = ?, updated_at = ? WHERE id = ?')
        .run(movGastoId, now, p.id);

      totalNomina += montoGasto;
      empleadosPagados++;
    }

    // F1_CERRAR_PATCH — sumar pagos ya pagados individualmente al total del periodo
    for (const yp of pagosYaPagados) {
      totalNomina += Number(yp.total) || 0;
      empleadosPagados++;
    }
    // Marcar TODOS los pendientes procesados como pagado=1 (los ya pagados quedan igual)
    for (const p of pagos) {
      db.prepare('UPDATE nominas_pagos SET pagado = 1, pagado_at = COALESCE(pagado_at, ?), pagado_por = COALESCE(pagado_por, ?), updated_at = ? WHERE id = ?')
        .run(now, usuario, now, p.id);
    }

    // Cerrar periodo
    db.prepare(`UPDATE nominas_periodos SET estado = 'CERRADO', total_nomina = ?, empleados_pagados = ?,
      cerrado_at = ?, cerrado_por = ?, updated_at = ? WHERE id = ?`)
      .run(totalNomina, empleadosPagados, now, usuario, now, periodoId);

    audit(req, 'CERRAR_NOMINA', 'nominas_periodos', periodoId,
      `Cerrada: ${empleadosPagados} empleados · $${totalNomina.toFixed(2)} total`);

    return db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
      LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ?`).get(periodoId);
  });
  try { res.json(tx(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Recalcular sugerencias (cuando agregan empleado nuevo o cambian fecha)
app.post('/api/nomina/periodos/:id/recalcular', auth, (req, res) => {
  try {
    const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!periodo) return res.status(404).json({ error: 'periodo no existe' });
    if (periodo.estado === 'CERRADO') return res.status(400).json({ error: 'periodo cerrado' });

    const pagos = db.prepare(`SELECT np.*, e.tipo, e.vendedor_id FROM nominas_pagos np
      LEFT JOIN empleados e ON e.id = np.empleado_id
      WHERE np.periodo_id = ? AND np.deleted = 0`).all(req.params.id);

    const ranking = rankingSemanal(periodo.comisiones_desde, periodo.comisiones_hasta);
    const rankingMap = {};
    const bonosRank = db.prepare(`SELECT * FROM bonos_config WHERE tipo = 'RANKING' AND activo = 1 AND deleted = 0 ORDER BY posicion`).all();
    ranking.slice(0, bonosRank.length).forEach((r, i) => {
      rankingMap[r.vendedor_id] = { pos: i + 1, bono: bonosRank[i].monto };
    });

    let recalculados = 0;
    for (const p of pagos) {
      if (p.tipo !== 'VENDEDOR' || !p.vendedor_id) continue;
      const venta = calcComisionVendedor(p.vendedor_id, periodo.comisiones_desde, periodo.comisiones_hasta);
      const escalon = buscarEscalonComision(venta);
      let comTotal = 0;
      const detalle = { tipo: 'VENDEDOR', vendedor_id: p.vendedor_id, ventas_s1: venta, escalon: null,
        comision_base: 0, bono_meta: 0, ranking_pos: 0, ranking_bono: 0, bono_mensual: 0, total: 0 };
      if (escalon) {
        detalle.escalon = { venta_minima: escalon.venta_minima, pct: escalon.pct_comision };
        detalle.comision_base = venta * escalon.pct_comision;
        detalle.bono_meta = escalon.bono_meta;
        comTotal += detalle.comision_base + escalon.bono_meta;
      }
      if (rankingMap[p.vendedor_id]) {
        detalle.ranking_pos = rankingMap[p.vendedor_id].pos;
        detalle.ranking_bono = rankingMap[p.vendedor_id].bono;
        comTotal += rankingMap[p.vendedor_id].bono;
      }
      const bm = bonoMensualVendedor(p.vendedor_id, periodo.bono_mensual_mes);
      if (bm.bono > 0) {
        detalle.bono_mensual = bm.bono;
        detalle.bono_mensual_venta = bm.venta_mes;
        comTotal += bm.bono;
      }
      detalle.total = comTotal;
      const total = (Number(p.neto) || 0) + comTotal - (Number(p.prestamos_abonados) || 0);
      db.prepare('UPDATE nominas_pagos SET comisiones = ?, comisiones_detalle = ?, total = ?, updated_at = ? WHERE id = ?')
        .run(comTotal, JSON.stringify(detalle), total, Date.now(), p.id);
      recalculados++;
    }
    res.json({ ok: true, recalculados });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Eliminar/cancelar periodo (solo si está ABIERTO)
app.delete('/api/nomina/periodos/:id', auth, (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM nominas_periodos WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'no existe' });
    if (p.estado === 'CERRADO') return res.status(400).json({ error: 'no se puede eliminar un periodo CERRADO' });
    const now = Date.now();
    db.prepare(`UPDATE nominas_pagos SET deleted = 1, updated_at = ? WHERE periodo_id = ?`).run(now, req.params.id);
    db.prepare(`UPDATE nominas_periodos SET deleted = 1, estado = 'CANCELADO', updated_at = ? WHERE id = ?`).run(now, req.params.id);
    audit(req, 'DELETE', 'nominas_periodos', req.params.id, 'Cancelado');
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Stats rápidas
app.get('/api/nomina/stats', auth, (req, res) => {
  try {
    const abierto = db.prepare(`SELECT id, fecha_inicio, fecha_fin,
      (SELECT COUNT(*) FROM nominas_pagos WHERE periodo_id = nominas_periodos.id AND deleted = 0) AS pagos,
      (SELECT COALESCE(SUM(total),0) FROM nominas_pagos WHERE periodo_id = nominas_periodos.id AND deleted = 0) AS total
      FROM nominas_periodos WHERE estado = 'ABIERTO' AND deleted = 0 LIMIT 1`).get();
    const empleadosActivos = db.prepare(`SELECT COUNT(*) AS n FROM empleados WHERE deleted = 0 AND activo = 1`).get().n;
    const prestamosActivos = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(saldo_actual),0) AS saldo
      FROM prestamos WHERE deleted = 0 AND estado = 'ACTIVO'`).get();
    res.json({ periodo_abierto: abierto, empleados_activos: empleadosActivos, prestamos_activos: prestamosActivos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------- Préstamos --------
app.get('/api/nomina/prestamos', auth, (req, res) => {
  try {
    const estado = req.query.estado;
    let sql = `SELECT pr.*, e.numero AS empleado_numero, c.nombre AS caja_origen_nombre,
      (SELECT COUNT(*) FROM prestamos_abonos WHERE prestamo_id = pr.id AND deleted = 0) AS abonos_count,
      (SELECT COALESCE(SUM(monto),0) FROM prestamos_abonos WHERE prestamo_id = pr.id AND deleted = 0) AS abonado_total
      FROM prestamos pr
      LEFT JOIN empleados e ON e.id = pr.empleado_id
      LEFT JOIN cajas c ON c.id = pr.caja_origen
      WHERE pr.deleted = 0`;
    const args = [];
    if (estado && estado !== 'TODOS') { sql += ' AND pr.estado = ?'; args.push(estado); }
    sql += ` ORDER BY CASE pr.estado WHEN 'ACTIVO' THEN 0 WHEN 'SALDADO' THEN 1 ELSE 2 END, pr.fecha DESC`;
    res.json(db.prepare(sql).all(...args));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/nomina/prestamos/:id', auth, (req, res) => {
  try {
    const pr = db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ? AND pr.deleted = 0`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'no existe' });
    const abonos = db.prepare(`SELECT pa.*, c.nombre AS caja_nombre FROM prestamos_abonos pa
      LEFT JOIN cajas c ON c.id = pa.caja_id
      WHERE pa.prestamo_id = ? AND pa.deleted = 0
      ORDER BY pa.fecha DESC`).all(req.params.id);
    res.json({ ...pr, abonos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear préstamo (genera mov GASTO en categoría especial PRESTAMOS EMPLEADOS, autoexcluida del P&L)
app.post('/api/nomina/prestamos', auth, (req, res) => {
  const tx = db.transaction((body) => {
    const empId = body.empleado_id;
    if (!empId) throw new Error('empleado_id requerido');
    const emp = db.prepare('SELECT * FROM empleados WHERE id = ? AND deleted = 0').get(empId);
    if (!emp) throw new Error('empleado no existe');
    const monto = Number(body.monto_original) || 0;
    if (!(monto > 0)) throw new Error('monto inválido');
    const cajaId = body.caja_origen;
    if (!cajaId) throw new Error('caja_origen requerida');
    const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
    if (!caja) throw new Error('caja no existe');
    const fecha = (body.fecha || new Date().toISOString().slice(0,10)).slice(0,10);
    const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
    const id = body.id || newPrestamoId();
    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';

    // Mov GASTO de entrega
    const movId = newMovId('pr');
    db.prepare(`INSERT INTO movs (
      id, fecha, tipo, categoria, concepto, monto, metodo, caja,
      usuario, notas, src, user_id, updated_at, deleted
    ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'prestamo', ?, ?, 0)`).run(
      movId, fecha, CAT_PRESTAMO, `Préstamo a ${emp.nombre}`, monto, metodo, cajaId,
      usuario, body.motivo || '', req.user?.id || null, now
    );

    db.prepare(`INSERT INTO prestamos
      (id, empleado_id, empleado_nombre, fecha, monto_original, saldo_actual, abono_sugerido_semanal,
       motivo, caja_origen, metodo, estado, mov_entrega_id, comentario, usuario, user_id, created_at, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?, ?, ?, ?, 0)
    `).run(id, empId, emp.nombre, fecha, monto, monto,
      Number(body.abono_sugerido_semanal) || 0, body.motivo || null,
      cajaId, metodo, movId, body.comentario || null,
      usuario, req.user?.id || null, now, now);

    audit(req, 'CREATE', 'prestamos', id, `${emp.nombre} · $${monto.toFixed(2)}`);

    return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(id);
  });
  try { res.json(tx(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Abonar a un préstamo (manual, no descuento de nómina)
app.post('/api/nomina/prestamos/:id/abonar', auth, (req, res) => {
  const tx = db.transaction((prestamoId, body) => {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
    if (!pr) throw new Error('préstamo no existe');
    if (pr.estado !== 'ACTIVO') throw new Error('préstamo no está activo');
    const monto = Number(body.monto) || 0;
    if (!(monto > 0)) throw new Error('monto inválido');
    if (monto > pr.saldo_actual + 0.01) throw new Error(`monto excede saldo (${pr.saldo_actual})`);
    const cajaId = body.caja_id;
    if (!cajaId) throw new Error('caja_id requerida (a dónde entra el dinero)');
    const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
    if (!caja) throw new Error('caja no existe');
    const fecha = (body.fecha || new Date().toISOString().slice(0,10)).slice(0,10);
    const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
    const id = newAbonoId();
    const now = Date.now();
    const usuario = req.user?.nombre || 'sistema';

    // Mov INGRESO
    const movId = newMovId('ab');
    db.prepare(`INSERT INTO movs (
      id, fecha, tipo, categoria, concepto, monto, metodo, caja,
      usuario, notas, src, user_id, updated_at, deleted
    ) VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, 'abono-prestamo', ?, ?, 0)`).run(
      movId, fecha, CAT_ABONO, `Abono de ${pr.empleado_nombre}`, monto, metodo, cajaId,
      usuario, body.comentario || '', req.user?.id || null, now
    );

    db.prepare(`INSERT INTO prestamos_abonos
      (id, prestamo_id, periodo_id, fecha, monto, metodo, caja_id, mov_id, comentario, usuario, user_id, updated_at, deleted)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, prestamoId, fecha, monto, metodo, cajaId, movId,
      body.comentario || null, usuario, req.user?.id || null, now);

    const nuevoSaldo = Number(pr.saldo_actual) - monto;
    const nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
    db.prepare(`UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?`)
      .run(nuevoSaldo, nuevoEstado, nuevoEstado === 'SALDADO' ? fecha : null, now, prestamoId);
    audit(req, 'ABONO', 'prestamos', prestamoId, `$${monto.toFixed(2)} de ${pr.empleado_nombre} · saldo: $${nuevoSaldo.toFixed(2)}`);

    return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
  });
  try { res.json(tx(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Cancelar préstamo (revierte movs)
app.delete('/api/nomina/prestamos/:id', auth, (req, res) => {
  const tx = db.transaction((id) => {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(id);
    if (!pr) throw new Error('no existe');
    const now = Date.now();
    if (pr.mov_entrega_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pr.mov_entrega_id);
    const abonos = db.prepare('SELECT mov_id FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0').all(id);
    for (const a of abonos) {
      if (a.mov_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, a.mov_id);
    }
    db.prepare('UPDATE prestamos_abonos SET deleted = 1, updated_at = ? WHERE prestamo_id = ?').run(now, id);
    db.prepare(`UPDATE prestamos SET deleted = 1, estado = 'CANCELADO', updated_at = ? WHERE id = ?`).run(now, id);
    audit(req, 'DELETE', 'prestamos', id, `Cancelado: ${pr.empleado_nombre}`);
    return { ok: true };
  });
  try { res.json(tx(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ============================================================================
// EDICIÓN Y BORRADO DE PRÉSTAMOS Y ABONOS  (admin/gerente, con PIN)
// Insertar en server.js junto a los demás endpoints de /api/nomina/prestamos
// ============================================================================

// Helper local: recalcula saldo_actual y estado de un préstamo desde sus abonos vivos.
// Fuente de verdad: saldo_actual = monto_original - SUM(abonos no borrados).
function recalcPrestamo(db, prestamoId, now) {
  const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
  if (!pr) throw new Error('préstamo no existe');
  const row = db.prepare(
    'SELECT COALESCE(SUM(monto), 0) AS abonado FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0'
  ).get(prestamoId);
  const abonado = Number(row.abonado) || 0;
  const nuevoSaldo = Math.max(0, Number(pr.monto_original) - abonado);
  // Si estaba CANCELADO, no lo reactivamos automáticamente.
  let nuevoEstado = pr.estado;
  if (pr.estado !== 'CANCELADO') {
    nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
  }
  const fechaSaldado = nuevoEstado === 'SALDADO' ? (pr.fecha_saldado || new Date().toISOString().slice(0, 10)) : null;
  db.prepare('UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?')
    .run(nuevoSaldo, nuevoEstado, fechaSaldado, now, prestamoId);
  return { saldo_actual: nuevoSaldo, estado: nuevoEstado };
}

// ---------------------------------------------------------------------------
// 1) EDITAR PRÉSTAMO  ·  PUT /api/nomina/prestamos/:id   (requirePin)
//    Edita: monto_original, motivo, abono_sugerido_semanal, comentario.
//    Si cambia monto_original, recalcula saldo y estado desde los abonos.
//    NO toca abonos ni el movimiento de entrega.
// ---------------------------------------------------------------------------
app.put('/api/nomina/prestamos/:id', auth, requirePin, (req, res) => {
  const tx = db.transaction((prestamoId, body) => {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
    if (!pr) throw new Error('préstamo no existe');

    const now = Date.now();
    const montoOriginal = (body.monto_original != null) ? Number(body.monto_original) : Number(pr.monto_original);
    if (!(montoOriginal > 0)) throw new Error('monto_original inválido');

    const abonadoRow = db.prepare(
      'SELECT COALESCE(SUM(monto),0) AS abonado FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0'
    ).get(prestamoId);
    const abonado = Number(abonadoRow.abonado) || 0;
    if (montoOriginal + 0.01 < abonado) {
      throw new Error(`el monto (${montoOriginal.toFixed(2)}) no puede ser menor a lo ya abonado (${abonado.toFixed(2)})`);
    }

    const motivo = (body.motivo != null) ? String(body.motivo) : pr.motivo;
    const sugerido = (body.abono_sugerido_semanal != null) ? Number(body.abono_sugerido_semanal) : Number(pr.abono_sugerido_semanal || 0);
    const comentario = (body.comentario != null) ? String(body.comentario) : pr.comentario;

    db.prepare(`UPDATE prestamos
      SET monto_original = ?, motivo = ?, abono_sugerido_semanal = ?, comentario = ?, updated_at = ?
      WHERE id = ?`).run(montoOriginal, motivo, sugerido, comentario, now, prestamoId);

    // Si el préstamo se entregó vía movimiento GASTO y cambió el monto original,
    // ajustamos ese movimiento de entrega para que la caja refleje lo correcto.
    if (Number(montoOriginal) !== Number(pr.monto_original) && pr.mov_entrega_id) {
      const movEntrega = db.prepare('SELECT * FROM movs WHERE id = ? AND deleted = 0').get(pr.mov_entrega_id);
      if (movEntrega) {
        db.prepare('UPDATE movs SET monto = ?, updated_at = ? WHERE id = ?')
          .run(montoOriginal, now, pr.mov_entrega_id);
      }
    }

    const r = recalcPrestamo(db, prestamoId, now);
    audit(req, 'EDITAR', 'prestamos', prestamoId,
      `Préstamo de ${pr.empleado_nombre} editado · monto $${montoOriginal.toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

    return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
  });
  try { res.json(tx(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// 2) EDITAR ABONO  ·  PUT /api/nomina/prestamos/:id/abonos/:abonoId  (requirePin)
//    Cambia monto y/o comentario de un abono. Ajusta el mov INGRESO asociado
//    (si lo hay) y recalcula saldo/estado del préstamo.
// ---------------------------------------------------------------------------
app.put('/api/nomina/prestamos/:id/abonos/:abonoId', auth, requirePin, (req, res) => {
  const tx = db.transaction((prestamoId, abonoId, body) => {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
    if (!pr) throw new Error('préstamo no existe');
    const ab = db.prepare('SELECT * FROM prestamos_abonos WHERE id = ? AND prestamo_id = ? AND deleted = 0').get(abonoId, prestamoId);
    if (!ab) throw new Error('abono no existe');

    const now = Date.now();
    const nuevoMonto = (body.monto != null) ? Number(body.monto) : Number(ab.monto);
    if (!(nuevoMonto > 0)) throw new Error('monto inválido');

    // Validar que el total de abonos no supere el monto original del préstamo.
    const otrosRow = db.prepare(
      'SELECT COALESCE(SUM(monto),0) AS total FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0 AND id != ?'
    ).get(prestamoId, abonoId);
    const otros = Number(otrosRow.total) || 0;
    if (otros + nuevoMonto > Number(pr.monto_original) + 0.01) {
      throw new Error(`el total de abonos ($${(otros + nuevoMonto).toFixed(2)}) excede el monto del préstamo ($${Number(pr.monto_original).toFixed(2)})`);
    }

    const comentario = (body.comentario != null) ? String(body.comentario) : ab.comentario;

    // Ajustar el movimiento de caja asociado, si existe (abonos por descuento de
    // nómina no tienen mov_id).
    if (ab.mov_id) {
      const mov = db.prepare('SELECT * FROM movs WHERE id = ? AND deleted = 0').get(ab.mov_id);
      if (mov) {
        db.prepare('UPDATE movs SET monto = ?, updated_at = ? WHERE id = ?').run(nuevoMonto, now, ab.mov_id);
      }
    }

    db.prepare('UPDATE prestamos_abonos SET monto = ?, comentario = ?, updated_at = ? WHERE id = ?')
      .run(nuevoMonto, comentario, now, abonoId);

    const r = recalcPrestamo(db, prestamoId, now);
    audit(req, 'EDITAR', 'prestamos_abonos', abonoId,
      `Abono de ${pr.empleado_nombre}: $${Number(ab.monto).toFixed(2)} → $${nuevoMonto.toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

    return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
  });
  try { res.json(tx(req.params.id, req.params.abonoId, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// 3) BORRAR ABONO  ·  DELETE /api/nomina/prestamos/:id/abonos/:abonoId  (requirePin)
//    Marca el abono como borrado, revierte su mov INGRESO (si lo hay) y
//    devuelve el monto al saldo del préstamo (reactiva a ACTIVO si procede).
// ---------------------------------------------------------------------------
app.delete('/api/nomina/prestamos/:id/abonos/:abonoId', auth, requirePin, (req, res) => {
  const tx = db.transaction((prestamoId, abonoId) => {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
    if (!pr) throw new Error('préstamo no existe');
    const ab = db.prepare('SELECT * FROM prestamos_abonos WHERE id = ? AND prestamo_id = ? AND deleted = 0').get(abonoId, prestamoId);
    if (!ab) throw new Error('abono no existe');

    const now = Date.now();

    // Revertir el ingreso en caja, si el abono generó movimiento.
    if (ab.mov_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.mov_id);
    }
    db.prepare('UPDATE prestamos_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, abonoId);

    const r = recalcPrestamo(db, prestamoId, now);
    audit(req, 'BORRAR', 'prestamos_abonos', abonoId,
      `Abono de ${pr.empleado_nombre} eliminado: $${Number(ab.monto).toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

    return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
      LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
  });
  try { res.json(tx(req.params.id, req.params.abonoId)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});


// === FIN RUTAS DE NOMINA ===


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

app.listen(PORT, () => {
  console.log(`🌶️  K-BOTANAS API corriendo en http://localhost:${PORT}`);
  console.log(`   Base de datos: ${DB_FILE}`);
});
