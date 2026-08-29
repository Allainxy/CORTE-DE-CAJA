// Test de contrato del cálculo de saldo de caja (mismo SQL que calcularSaldoCaja en server.js).
// Valida: saldo_inicial + ingresos - gastos, afecta_saldo=0 ignorado, fecha_inicial filtra, redondeo.
const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { round2 } = require('../lib/money');

// Réplica exacta de calcularSaldoCaja (server.js). Cuando se extraiga a un módulo (#6),
// este test debería importarlo en vez de replicarlo.
function calcularSaldoCaja(db, cajaId) {
  const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
  if (!caja) return null;
  const ingresos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS s FROM movs
    WHERE caja = ? AND tipo = 'INGRESO' AND deleted = 0 AND COALESCE(afecta_saldo, 1) = 1
      AND (fecha >= ? OR ? IS NULL OR ? = '')`).get(cajaId, caja.fecha_inicial || '', caja.fecha_inicial, caja.fecha_inicial);
  const gastos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS s FROM movs
    WHERE caja = ? AND tipo = 'GASTO' AND deleted = 0 AND COALESCE(afecta_saldo, 1) = 1
      AND (fecha >= ? OR ? IS NULL OR ? = '')`).get(cajaId, caja.fecha_inicial || '', caja.fecha_inicial, caja.fecha_inicial);
  return round2((caja.saldo_inicial || 0) + (ingresos.s || 0) - (gastos.s || 0));
}

function db1() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE cajas (id TEXT PRIMARY KEY, saldo_inicial REAL DEFAULT 0, fecha_inicial TEXT, deleted INTEGER DEFAULT 0);
           CREATE TABLE movs (id TEXT PRIMARY KEY, caja TEXT, tipo TEXT, monto REAL, fecha TEXT, afecta_saldo INTEGER DEFAULT 1, deleted INTEGER DEFAULT 0)`);
  return db;
}
let seq = 0;
const addMov = (db, caja, tipo, monto, fecha, afecta = 1, deleted = 0) =>
  db.prepare('INSERT INTO movs (id,caja,tipo,monto,fecha,afecta_saldo,deleted) VALUES (?,?,?,?,?,?,?)')
    .run('m' + (++seq), caja, tipo, monto, fecha, afecta, deleted);

test('saldo = saldo_inicial + ingresos - gastos', () => {
  const db = db1();
  db.prepare("INSERT INTO cajas (id,saldo_inicial,fecha_inicial) VALUES ('c1',100,'2026-01-01')").run();
  addMov(db, 'c1', 'INGRESO', 50, '2026-02-01');
  addMov(db, 'c1', 'GASTO', 30, '2026-02-01');
  assert.strictEqual(calcularSaldoCaja(db, 'c1'), 120);
});

test('ignora movimientos con afecta_saldo=0', () => {
  const db = db1();
  db.prepare("INSERT INTO cajas (id,saldo_inicial,fecha_inicial) VALUES ('c1',0,'2026-01-01')").run();
  addMov(db, 'c1', 'GASTO', 999, '2026-02-01', 0); // no debe contar
  addMov(db, 'c1', 'INGRESO', 40, '2026-02-01', 1);
  assert.strictEqual(calcularSaldoCaja(db, 'c1'), 40);
});

test('ignora movimientos anteriores a fecha_inicial', () => {
  const db = db1();
  db.prepare("INSERT INTO cajas (id,saldo_inicial,fecha_inicial) VALUES ('c1',10,'2026-01-15')").run();
  addMov(db, 'c1', 'INGRESO', 500, '2026-01-10'); // antes del corte -> ignorar
  addMov(db, 'c1', 'INGRESO', 25, '2026-01-20');
  assert.strictEqual(calcularSaldoCaja(db, 'c1'), 35);
});

test('ignora borrados y movimientos de otra caja; redondea a centavos', () => {
  const db = db1();
  db.prepare("INSERT INTO cajas (id,saldo_inicial,fecha_inicial) VALUES ('c1',0,'2026-01-01')").run();
  addMov(db, 'c1', 'INGRESO', 10.1, '2026-02-01');
  addMov(db, 'c1', 'INGRESO', 20.2, '2026-02-01');
  addMov(db, 'c1', 'GASTO', 0.1, '2026-02-01');
  addMov(db, 'c1', 'INGRESO', 9999, '2026-02-01', 1, 1); // borrado
  addMov(db, 'c2', 'INGRESO', 9999, '2026-02-01');       // otra caja
  assert.strictEqual(calcularSaldoCaja(db, 'c1'), 30.2);
});
