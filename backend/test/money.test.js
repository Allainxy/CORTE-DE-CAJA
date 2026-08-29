// Tests de las utilidades de dinero (código real importado desde ../lib/money).
const { test } = require('node:test');
const assert = require('node:assert');
const { round2, clampUpdatedAt } = require('../lib/money');

test('round2: 0.1 + 0.2 === 0.30 (sin drift)', () => {
  assert.strictEqual(round2(0.1 + 0.2), 0.3);
});

test('round2: limpia ruido de punto flotante acumulado', () => {
  assert.strictEqual(round2(79.62999999999), 79.63);
  assert.strictEqual(round2(47154), 47154);
  assert.strictEqual(round2(-71070.27), -71070.27);
  assert.strictEqual(round2(800.004), 800);
  assert.strictEqual(round2(800.006), 800.01);
});

test('round2: valores no numéricos -> 0', () => {
  assert.strictEqual(round2(null), 0);
  assert.strictEqual(round2(undefined), 0);
  assert.strictEqual(round2('abc'), 0);
  assert.strictEqual(round2(''), 0);
});

test('clampUpdatedAt: usa el sello del cliente si es válido', () => {
  assert.strictEqual(clampUpdatedAt(500000, 1000000, 300000), 500000);
});

test('clampUpdatedAt: acota contra relojes adelantados (skew)', () => {
  const now = 1000000, skew = 300000;
  assert.strictEqual(clampUpdatedAt(now + 999999, now, skew), now + skew);
});

test('clampUpdatedAt: sin sello / inválido / <=0 -> reloj del server (now)', () => {
  const now = 1000000;
  assert.strictEqual(clampUpdatedAt(undefined, now, 300000), now);
  assert.strictEqual(clampUpdatedAt(0, now, 300000), now);
  assert.strictEqual(clampUpdatedAt(-5, now, 300000), now);
  assert.strictEqual(clampUpdatedAt('abc', now, 300000), now);
});
