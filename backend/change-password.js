// change-password.js — Cambia la contraseña de un usuario
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const [, , username, newpass] = process.argv;
if (!username || !newpass) {
  console.log('Uso: node change-password.js <usuario> <nuevaContraseña>');
  process.exit(1);
}

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'kbotanas.db');
const db = new Database(DB_FILE);

const u = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!u) { console.log('❌ Usuario no encontrado:', username); process.exit(1); }

const hash = bcrypt.hashSync(newpass, 10);
db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, u.id);
console.log('✅ Contraseña actualizada para', username);
