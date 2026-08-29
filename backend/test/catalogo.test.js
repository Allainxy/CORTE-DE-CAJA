// Test de integración del router extraído (routes/catalogo.js): monta sobre un
// express real + BD en memoria y pega a los endpoints por HTTP. Plantilla para
// futuras extracciones de #6.
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const Database = require('better-sqlite3');
const mountCatalogo = require('../routes/catalogo');

function setup() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE groups (id TEXT PRIMARY KEY, tipo TEXT, nombre TEXT, orden INTEGER DEFAULT 0, updated_at INTEGER, deleted INTEGER DEFAULT 0);
           CREATE TABLE cats (id TEXT PRIMARY KEY, tipo TEXT, nombre TEXT, color TEXT, icon TEXT, group_id TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0);
           CREATE TABLE movs (id TEXT PRIMARY KEY, categoria TEXT, tipo TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)`);
  const app = express();
  app.use(express.json());
  const pass = (req, _res, next) => { req.user = { id: 'u', nombre: 'Test', rol: 'admin' }; next(); };
  mountCatalogo(app, db, { requireAuth: pass, requireAdmin: pass });
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

test('catalogo: GET /api/cats vacío → POST crea → GET lo devuelve', async () => {
  const { server, port } = setup();
  try {
    let r = await call(port, 'GET', '/api/cats');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.cats, []);
    r = await call(port, 'POST', '/api/cats', { id: 'c1', tipo: 'GASTO', nombre: 'LUZ' });
    assert.strictEqual(r.status, 200);
    r = await call(port, 'GET', '/api/cats');
    assert.strictEqual(r.body.cats.length, 1);
    assert.strictEqual(r.body.cats[0].nombre, 'LUZ');
  } finally { server.close(); }
});

test('catalogo: POST /api/cats sin datos → 400', async () => {
  const { server, port } = setup();
  try {
    const r = await call(port, 'POST', '/api/cats', { tipo: 'GASTO' });
    assert.strictEqual(r.status, 400);
  } finally { server.close(); }
});

test('catalogo: PUT rename con cascadeRename actualiza movs', async () => {
  const { db, server, port } = setup();
  try {
    await call(port, 'POST', '/api/cats', { id: 'c1', tipo: 'GASTO', nombre: 'LUZ' });
    db.prepare("INSERT INTO movs (id,categoria,tipo,updated_at,deleted) VALUES ('m1','LUZ','GASTO',0,0)").run();
    const r = await call(port, 'PUT', '/api/cats/c1', { nombre: 'LUZ CFE', cascadeRename: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.movsUpdated, 1);
    assert.strictEqual(db.prepare("SELECT categoria FROM movs WHERE id='m1'").get().categoria, 'LUZ CFE');
  } finally { server.close(); }
});

test('catalogo: no se puede borrar grupo con categorías activas → 409', async () => {
  const { server, port } = setup();
  try {
    await call(port, 'POST', '/api/groups', { id: 'g1', tipo: 'GASTO', nombre: 'PRODUCCION' });
    await call(port, 'POST', '/api/cats', { id: 'c1', tipo: 'GASTO', nombre: 'LUZ', group_id: 'g1' });
    const r = await call(port, 'DELETE', '/api/groups/g1');
    assert.strictEqual(r.status, 409);
  } finally { server.close(); }
});
