// Test de contrato del UPSERT condicional (last-write-wins) de /api/movs.
// Replica el WHERE excluded.updated_at > movs.updated_at para bloquear regresiones.
const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');

const UPSERT = `INSERT INTO movs (id, monto, updated_at, deleted) VALUES (@id, @monto, @updated_at, 0)
  ON CONFLICT(id) DO UPDATE SET monto=@monto, updated_at=@updated_at, deleted=0
  WHERE excluded.updated_at > movs.updated_at`;

function freshDb() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE movs (id TEXT PRIMARY KEY, monto REAL, updated_at INTEGER, deleted INTEGER DEFAULT 0)');
  return db;
}
const montoDe = (db, id) => db.prepare('SELECT monto FROM movs WHERE id = ?').get(id).monto;

test('LWW: inserta un movimiento nuevo', () => {
  const db = freshDb();
  assert.strictEqual(db.prepare(UPSERT).run({ id: 'x', monto: 100, updated_at: 1000 }).changes, 1);
});

test('LWW: rechaza una edición MÁS VIEJA (no cambia el dato)', () => {
  const db = freshDb(); const up = db.prepare(UPSERT);
  up.run({ id: 'x', monto: 100, updated_at: 1000 });
  assert.strictEqual(up.run({ id: 'x', monto: 50, updated_at: 500 }).changes, 0);
  assert.strictEqual(montoDe(db, 'x'), 100);
});

test('LWW: aplica una edición MÁS NUEVA', () => {
  const db = freshDb(); const up = db.prepare(UPSERT);
  up.run({ id: 'x', monto: 100, updated_at: 1000 });
  assert.strictEqual(up.run({ id: 'x', monto: 200, updated_at: 2000 }).changes, 1);
  assert.strictEqual(montoDe(db, 'x'), 200);
});

test('LWW: idempotente ante mismo sello (reintento de cola)', () => {
  const db = freshDb(); const up = db.prepare(UPSERT);
  up.run({ id: 'x', monto: 100, updated_at: 1000 });
  assert.strictEqual(up.run({ id: 'x', monto: 999, updated_at: 1000 }).changes, 0);
  assert.strictEqual(montoDe(db, 'x'), 100);
});
