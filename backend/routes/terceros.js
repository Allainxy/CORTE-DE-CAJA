// ============================================================================
// routes/terceros.js — Terceros (proveedores + clientes) y catálogo de
// productos por proveedor.
// Extraído VERBATIM de server.js (#6), bloque
//   "// ============= TERCEROS (PROVEEDORES + CLIENTES) ==========="
// Patrón mount*(app, db, opts) igual que routes/catalogo.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, log }
//   (este bloque usa auth, requirePin, audit y newId; requireAdmin/log se
//    reciben por contrato común pero no se usan aquí)
// Rutas:
//   GET    /api/terceros                 lista (filtros ?tipo= ?q=) + productos_count
//   POST   /api/terceros                 crear proveedor/cliente
//   PUT    /api/terceros/:id             editar
//   DELETE /api/terceros/:id             soft-delete (requirePin; admin/gerente)
//   GET    /api/terceros/:id/productos   catálogo de productos del proveedor
//   PUT    /api/terceros/:id/productos   reemplazo bulk del catálogo
// ============================================================================
module.exports = function mountTerceros(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const log = opts.log || (() => {});

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
    const id = newId('ter-');
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
          const nuevoId = newId('pp-');
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

};
