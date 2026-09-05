// ============================================================================
// routes/arqueos.js — Arqueos de caja (conteo físico vs. saldo del sistema).
// Extraído de server.js (#6): bloque `// ---------- ARQUEOS DE CAJA ----------`
// (líneas 1615-1714 del server.js original, justo antes de TERCEROS).
// Patrón mount*(app, db, opts) igual que routes/catalogo.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log }
// Rutas que monta:
//   GET    /api/arqueos                → lista con filtros (desde, hasta, caja_id, estado, limit)
//   GET    /api/arqueos/:id            → detalle de un arqueo
//   POST   /api/arqueos                → crear arqueo (no rol consulta; solo cajas EFECTIVO)
//   DELETE /api/arqueos/:id            → borrado lógico (solo admin, requiere PIN)
//   GET    /api/arqueos/stats/ultimos  → último arqueo por caja EFECTIVO activa
//
// userCanUseCaja(userId, cajaId, rol) — helper de permisos por caja definido en
// server.js (closure sobre db + user_cajas). Se INYECTA vía opts.userCanUseCaja
// (server.js lo pasa en el mount). Solo lo usa POST /api/arqueos.
// ============================================================================
module.exports = function mountArqueos(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const userCanUseCaja = opts.userCanUseCaja; // helper de server.js (permisos por caja), inyectado
  const log = opts.log || (() => {});

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

    const id = newId('arq-');
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
};
