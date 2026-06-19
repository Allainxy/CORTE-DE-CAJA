// ============================================================================
// K-BOTANAS · Feature F4 · ventas-cierres-dia.js
// ============================================================================
// Cierre de día para captura por vendedor (cortes detalle).
//
// Endpoints:
//   GET    /api/ventas/cierres-dia?fecha=YYYY-MM-DD
//           → estado del día (cerrado / abierto / nunca-cerrado)
//   POST   /api/ventas/cierres-dia/cerrar     body { fecha, comentario?, pin }
//           → cierra el día (requiere admin/gerente + PIN)
//   POST   /api/ventas/cierres-dia/reabrir    body { fecha, motivo, pin }
//           → reabre el día (mismo middleware)
//
// Helper exportado:
//   isDiaCerrado(db, fecha) → boolean
//
// El bloqueo lo enforza la UI deshabilitando inputs cuando el día está cerrado.
// Como defensa en profundidad, los endpoints POST/DELETE de cortes detalle se
// patchean en server.js (ver patch-cortes-guards.js) para rechazar escrituras
// si el día está cerrado.
// ============================================================================

const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));

function newCierreId() {
  return newId('vc-');
}

// Helper: devuelve el cierre activo del día (deleted=0 y desbloqueado_at IS NULL)
function getCierreActivo(db, fecha) {
  return db.prepare(`
    SELECT * FROM ventas_cierres_dia
    WHERE fecha = ? AND canal = 'TODOS' AND deleted = 0 AND desbloqueado_at IS NULL
    ORDER BY bloqueado_at DESC
    LIMIT 1
  `).get(fecha);
}

// Helper PÚBLICO usado por server.js para guards
function isDiaCerrado(db, fecha) {
  return !!getCierreActivo(db, fecha);
}

module.exports = function mountVentasCierresDia(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const audit = opts.audit;
  const log = opts.log || (() => {});

  if (typeof auth !== 'function')       throw new Error('requireAuth requerido');
  if (typeof requirePin !== 'function') throw new Error('requirePin requerido');
  if (typeof audit !== 'function')      throw new Error('audit requerido');

  // ==========================================================================
  // GET /api/ventas/cierres-dia?fecha=YYYY-MM-DD
  // ==========================================================================
  app.get('/api/ventas/cierres-dia', auth, (req, res) => {
    try {
      const fecha = String(req.query.fecha || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' });
      }
      const activo = getCierreActivo(db, fecha);
      // Historial: últimos 5 ciclos cierre/reapertura de esa fecha
      const historial = db.prepare(`
        SELECT id, bloqueado_at, bloqueado_por_nombre, comentario,
               desbloqueado_at, desbloqueado_por_nombre, desbloqueado_motivo
        FROM ventas_cierres_dia
        WHERE fecha = ? AND canal = 'TODOS' AND deleted = 0
        ORDER BY bloqueado_at DESC
        LIMIT 5
      `).all(fecha);

      res.json({
        fecha,
        cerrado: !!activo,
        cierre: activo || null,
        historial,
      });
    } catch (e) {
      log('[cierres-dia get]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================================================
  // POST /api/ventas/cierres-dia/cerrar
  // Body: { fecha, comentario?, pin }
  // Requires: admin/gerente + PIN válido
  // ==========================================================================
  app.post('/api/ventas/cierres-dia/cerrar', auth, requirePin, (req, res) => {
    try {
      const fecha = String((req.body && req.body.fecha) || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' });
      }
      const comentario = req.body.comentario ? String(req.body.comentario).slice(0, 500) : null;

      // Validar que no esté ya cerrado
      if (getCierreActivo(db, fecha)) {
        return res.status(409).json({ error: 'El día ya está cerrado' });
      }

      const now = Date.now();
      const id = newCierreId();
      const usuario = req.user.nombre || 'sistema';
      const userId = req.user.id;

      db.prepare(`INSERT INTO ventas_cierres_dia
        (id, fecha, canal, bloqueado_at, bloqueado_por_id, bloqueado_por_nombre,
         comentario, updated_at, deleted)
        VALUES (?, ?, 'TODOS', ?, ?, ?, ?, ?, 0)
      `).run(id, fecha, now, userId, usuario, comentario, now);

      audit(req, 'CERRAR_DIA_VENTAS', 'ventas_cierres_dia', id,
        `Día ${fecha} cerrado${comentario ? ' · ' + comentario : ''}`);

      res.json({
        ok: true,
        cierre: db.prepare('SELECT * FROM ventas_cierres_dia WHERE id = ?').get(id),
      });
    } catch (e) {
      log('[cierres-dia cerrar]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================================================
  // POST /api/ventas/cierres-dia/reabrir
  // Body: { fecha, motivo, pin }
  // Requires: admin/gerente + PIN válido
  // ==========================================================================
  app.post('/api/ventas/cierres-dia/reabrir', auth, requirePin, (req, res) => {
    try {
      const fecha = String((req.body && req.body.fecha) || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' });
      }
      const motivo = String((req.body && req.body.motivo) || '').trim();
      if (!motivo) return res.status(400).json({ error: 'motivo requerido' });
      if (motivo.length > 500) return res.status(400).json({ error: 'motivo máximo 500 caracteres' });

      const activo = getCierreActivo(db, fecha);
      if (!activo) {
        return res.status(409).json({ error: 'El día no está cerrado' });
      }

      const now = Date.now();
      const usuario = req.user.nombre || 'sistema';
      const userId = req.user.id;

      db.prepare(`UPDATE ventas_cierres_dia SET
        desbloqueado_at = ?, desbloqueado_por_id = ?, desbloqueado_por_nombre = ?,
        desbloqueado_motivo = ?, updated_at = ?
        WHERE id = ?
      `).run(now, userId, usuario, motivo, now, activo.id);

      audit(req, 'REABRIR_DIA_VENTAS', 'ventas_cierres_dia', activo.id,
        `Día ${fecha} reabierto · motivo: ${motivo}`);

      res.json({
        ok: true,
        cierre: db.prepare('SELECT * FROM ventas_cierres_dia WHERE id = ?').get(activo.id),
      });
    } catch (e) {
      log('[cierres-dia reabrir]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  log('[ventas-cierres-dia] endpoints montados: GET /, POST /cerrar, POST /reabrir');
};

// Exportar helper para que server.js lo use en los guards
module.exports.isDiaCerrado = isDiaCerrado;
