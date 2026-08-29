// ============================================================================
// routes/catalogo.js — Grupos contables y Categorías.
// Extraído de server.js (#6). Patrón mount*(app, db, opts) igual que
// ventas-cierres-dia.js / nomina-extensions.js.
//   opts: { requireAuth, requireAdmin }
// Rutas: /api/groups (+ reorder, :id) y /api/cats (+ :id).
// ============================================================================
module.exports = function mountCatalogo(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requireAdmin = opts.requireAdmin;

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
};
