// init-db.js — Crea la BD inicial con tablas y 4 usuarios
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'kbotanas.db');

if (fs.existsSync(DB_FILE)) {
  console.log('⚠️  La base de datos ya existe en', DB_FILE);
  console.log('   Si quieres recrearla, bórrala primero:  rm', DB_FILE);
  process.exit(0);
}

const db = new Database(DB_FILE);

db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario',
  created_at INTEGER NOT NULL
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
  deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_movs_fecha ON movs(fecha);
CREATE INDEX idx_movs_updated ON movs(updated_at);
CREATE INDEX idx_movs_caja ON movs(caja);
CREATE INDEX idx_movs_transfer ON movs(transfer_id);

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

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  monto REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

const now = Date.now();
const hash = bcrypt.hashSync('kbot2026', 10);

const insertUser = db.prepare(
  'INSERT INTO users (id, username, password, nombre, rol, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const users = [
  { id: 'u-admin', username: 'admin', nombre: 'Administrador', rol: 'admin' },
  { id: 'u-caja1', username: 'caja1', nombre: 'Caja Principal', rol: 'usuario' },
  { id: 'u-caja2', username: 'caja2', nombre: 'Caja Bodega', rol: 'usuario' },
  { id: 'u-ruta1', username: 'ruta1', nombre: 'Ruta Foránea', rol: 'usuario' },
];
users.forEach(u => insertUser.run(u.id, u.username, hash, u.nombre, u.rol, now));

// Categorías por defecto
const insertCat = db.prepare(
  'INSERT INTO cats (id, tipo, nombre, color, icon, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const cats = [
  ['i-rutas', 'INGRESO', 'VENTAS RUTAS', '#2EC27E', '🛻'],
  ['i-dist',  'INGRESO', 'VENTA DISTRIBUIDOR', '#1AAB7A', '📦'],
  ['i-may',   'INGRESO', 'VENTA MAYOREO', '#3FB984', '🏪'],
  ['i-otros', 'INGRESO', 'OTROS INGRESOS', '#7BC97F', '💵'],
  ['g-gas',   'GASTO',   'GASOLINA', '#FF6B35', '⛽'],
  ['g-nom',   'GASTO',   'NOMINAS', '#E63946', '👥'],
  ['g-mer',   'GASTO',   'MERCANCIA', '#D62828', '📥'],
  ['g-pub',   'GASTO',   'PUBLICIDAD', '#FFB800', '📣'],
  ['g-pap',   'GASTO',   'PAPELERIA', '#F4A261', '📄'],
  ['g-ren',   'GASTO',   'RENTA', '#B5179E', '🏠'],
  ['g-ser',   'GASTO',   'SERVICIOS', '#7209B7', '💡'],
  ['g-otros', 'GASTO',   'OTROS GASTOS', '#8D6A4F', '📌'],
];
cats.forEach(c => insertCat.run(c[0], c[1], c[2], c[3], c[4], now));

console.log('✅ Base de datos creada en', DB_FILE);
console.log('   Usuarios:');
users.forEach(u => console.log('   ·', u.username, '/ kbot2026'));
console.log('\n   IMPORTANTE: cambia las contraseñas con:');
console.log('   node change-password.js usuario nuevaContraseña');
