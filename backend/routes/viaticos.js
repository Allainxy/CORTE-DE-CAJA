// ============================================================================
// routes/viaticos.js — Viáticos: anticipos a empleados y su comprobación.
// Extraído VERBATIM de server.js (#6), bloque "// === RUTAS DE VIATICOS ==="
// … "// === FIN RUTAS DE VIATICOS ===" (server.js líneas 4130-4423). Patrón
// mount*(app, db, opts) igual que routes/catalogo.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, log }
//   (este bloque usa: requireAuth, audit, newId)
// Rutas que monta:
//   GET    /api/viaticos                   — lista con filtros (estado, desde, hasta, empleado)
//   GET    /api/viaticos/:id               — detalle con conceptos
//   GET    /api/viaticos/stats/abiertos    — KPIs de viáticos ABIERTOS
//   POST   /api/viaticos                   — crear anticipo (genera mov GASTO "ANTICIPOS VIATICOS")
//   POST   /api/viaticos/:id/comprobar     — comprobar con conceptos (genera movs GASTO reales)
//   DELETE /api/viaticos/:id               — cancelar (soft-delete, revierte todos los movs)
//   GET    /api/viaticos/categorias/gasto  — categorías GASTO disponibles (excluye la reservada)
// Helpers locales del bloque: newViaticoId, newViaticoConceptoId, CAT_ANTICIPO.
// ============================================================================
module.exports = function mountViaticos(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const log = opts.log || (() => {});

  // newMovId NO forma parte del bloque de viáticos: vive en server.js:3086
  // (sección ventas) y el bloque lo usa para los ids de movs ('m-vt-ant-…',
  // 'm-vt-gst-…'). Se copia sin cambios para no depender del closure de
  // server.js; deriva de opts.newId, así que el formato de id es idéntico.
  function newMovId(prefix) {
    return newId('m-' + prefix + '-');
  }

  // === RUTAS DE VIATICOS ===

  // Helpers locales
  function newViaticoId() {
    return newId('vt-');
  }
  function newViaticoConceptoId() {
    return newId('vc-');
  }

  // Categoría especial autoexcluida del P&L
  const CAT_ANTICIPO = 'ANTICIPOS VIATICOS';

  // GET /api/viaticos — listar con filtros
  app.get('/api/viaticos', auth, (req, res) => {
    try {
      const { estado, desde, hasta, empleado } = req.query;
      const conds = ['v.deleted = 0'];
      const args = [];
      if (estado && estado !== 'TODOS') { conds.push('v.estado = ?'); args.push(estado); }
      if (desde) { conds.push('v.fecha >= ?'); args.push(desde); }
      if (hasta) { conds.push('v.fecha <= ?'); args.push(hasta); }
      if (empleado) { conds.push("LOWER(v.empleado_nombre) LIKE LOWER(?)"); args.push('%' + empleado + '%'); }
      const rows = db.prepare(`
        SELECT v.*,
          co.nombre AS caja_origen_nombre,
          ca.nombre AS caja_ajuste_nombre,
          (SELECT COUNT(*) FROM viaticos_conceptos vc WHERE vc.viatico_id = v.id AND vc.deleted = 0) AS conceptos_count
        FROM viaticos v
        LEFT JOIN cajas co ON co.id = v.caja_origen
        LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
        WHERE ${conds.join(' AND ')}
        ORDER BY
          CASE v.estado WHEN 'ABIERTO' THEN 0 WHEN 'COMPROBADO' THEN 1 ELSE 2 END,
          v.fecha DESC, v.created_at DESC
      `).all(...args);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/viaticos/:id — detalle con conceptos
  app.get('/api/viaticos/:id', auth, (req, res) => {
    try {
      const v = db.prepare(`
        SELECT v.*, co.nombre AS caja_origen_nombre, ca.nombre AS caja_ajuste_nombre
        FROM viaticos v
        LEFT JOIN cajas co ON co.id = v.caja_origen
        LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
        WHERE v.id = ? AND v.deleted = 0
      `).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'viatico no existe' });
      const conceptos = db.prepare(`
        SELECT * FROM viaticos_conceptos
        WHERE viatico_id = ? AND deleted = 0
        ORDER BY orden ASC, id ASC
      `).all(req.params.id);
      res.json({ ...v, conceptos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/viaticos/stats/abiertos — KPIs rápidos para sidebar/inteligencia
  app.get('/api/viaticos/stats/abiertos', auth, (req, res) => {
    try {
      const r = db.prepare(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(monto_anticipo), 0) AS total_anticipos,
          COALESCE(SUM(monto_anticipo) - SUM(monto_comprobado), 0) AS saldo_pendiente
        FROM viaticos WHERE deleted = 0 AND estado = 'ABIERTO'
      `).get();
      const masAntiguo = db.prepare(`
        SELECT fecha, empleado_nombre, monto_anticipo
        FROM viaticos WHERE deleted = 0 AND estado = 'ABIERTO'
        ORDER BY fecha ASC LIMIT 1
      `).get();
      res.json({ ...r, mas_antiguo: masAntiguo });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/viaticos — crear anticipo (genera mov GASTO de ANTICIPOS VIATICOS)
  app.post('/api/viaticos', auth, (req, res) => {
    const tx = db.transaction((body) => {
      const fecha = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const empleado = (body.empleado_nombre || '').trim().toUpperCase();
      if (!empleado) throw new Error('empleado_nombre requerido');
      const monto = Number(body.monto_anticipo) || 0;
      if (!(monto > 0)) throw new Error('monto_anticipo debe ser positivo');
      const cajaOrigen = body.caja_origen;
      if (!cajaOrigen) throw new Error('caja_origen requerida');
      const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaOrigen);
      if (!caja) throw new Error('caja_origen no existe');

      const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
      const validos = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'];
      if (!validos.includes(metodo)) throw new Error('metodo inválido (EFECTIVO/TRANSFERENCIA/TARJETA)');

      const id = body.id || newViaticoId();
      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';
      const userId = req.user?.id || null;
      const concepto = (body.concepto || '').trim() || `Viáticos · ${empleado}`;
      const comentario = body.comentario || null;

      // Crear el mov GASTO de ANTICIPOS VIATICOS
      const movId = newMovId('vt-ant');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'viatico', ?, ?, 0)`).run(
        movId, fecha, CAT_ANTICIPO, concepto, monto, metodo, cajaOrigen,
        usuario, comentario || '', userId, now
      );

      // Crear el viático
      db.prepare(`INSERT INTO viaticos (
        id, fecha, empleado_nombre, empleado_id, concepto,
        monto_anticipo, metodo, caja_origen, estado,
        monto_comprobado, diferencia, mov_anticipo_id,
        comentario, usuario, user_id, created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTO', 0, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        id, fecha, empleado, body.empleado_id || null, concepto,
        monto, metodo, cajaOrigen,
        monto, // diferencia = anticipo - comprobado(0) = anticipo
        movId, comentario, usuario, userId, now, now
      );

      audit(req, 'CREATE', 'viaticos', id, `Anticipo $${monto.toFixed(2)} a ${empleado} desde ${caja.nombre}`);

      return db.prepare(`
        SELECT v.*, co.nombre AS caja_origen_nombre
        FROM viaticos v LEFT JOIN cajas co ON co.id = v.caja_origen
        WHERE v.id = ?
      `).get(id);
    });
    try { res.json(tx(req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // POST /api/viaticos/:id/comprobar — comprobar viático con conceptos
  // Body: { fecha_comprobacion, caja_ajuste, conceptos: [{categoria, concepto, monto}], comentario }
  app.post('/api/viaticos/:id/comprobar', auth, (req, res) => {
    const tx = db.transaction((id, body) => {
      const viatico = db.prepare("SELECT * FROM viaticos WHERE id = ? AND deleted = 0").get(id);
      if (!viatico) throw new Error('viatico no existe');
      if (viatico.estado === 'COMPROBADO') throw new Error('viatico ya está comprobado');

      const conceptos = Array.isArray(body.conceptos) ? body.conceptos : [];
      if (conceptos.length === 0) throw new Error('debe agregar al menos un concepto');

      const fechaComp = (body.fecha_comprobacion || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const cajaAjusteId = body.caja_ajuste || viatico.caja_origen; // default: misma caja
      const cajaAj = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaAjusteId);
      if (!cajaAj) throw new Error('caja_ajuste no existe');

      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';
      const userId = req.user?.id || null;
      const comentarioGeneral = (body.comentario || '').trim() || null;

      // 1) Eliminar mov anterior del anticipo (soft delete)
      if (viatico.mov_anticipo_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_anticipo_id);
      }
      // 2) Eliminar movs anteriores de devolución y faltante si existían (re-comprobar)
      if (viatico.mov_devolucion_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_devolucion_id);
      }
      if (viatico.mov_faltante_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, viatico.mov_faltante_id);
      }
      // 3) Eliminar conceptos anteriores y sus movs (si fuera re-comprobación)
      const prevConceptos = db.prepare('SELECT * FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0').all(id);
      for (const pc of prevConceptos) {
        if (pc.mov_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pc.mov_id);
        db.prepare('UPDATE viaticos_conceptos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pc.id);
      }

      // 4) Validar categorías y crear movs reales por cada concepto
      let totalComprobado = 0;
      const conceptosGuardados = [];
      let orden = 0;
      for (const c of conceptos) {
        const categoria = (c.categoria || '').trim().toUpperCase();
        const monto = Number(c.monto) || 0;
        if (!categoria) throw new Error('concepto sin categoría');
        if (!(monto > 0)) throw new Error(`monto inválido en concepto "${categoria}"`);
        // Verificar que la categoría exista en GASTO
        const cat = db.prepare("SELECT * FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0").get(categoria);
        if (!cat) throw new Error(`categoría GASTO "${categoria}" no existe`);
        if (categoria === CAT_ANTICIPO) throw new Error(`no se puede comprobar con la categoría reservada "${CAT_ANTICIPO}"`);

        const conceptoTxt = (c.concepto || '').trim() || categoria;
        const movId = newMovId('vt-gst');
        const notas = `Viático ${id.slice(-6)} · ${viatico.empleado_nombre}` + (comentarioGeneral ? ' · ' + comentarioGeneral : '');

        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja,
          usuario, notas, src, user_id, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'viatico-comprobacion', ?, ?, 0)`).run(
          movId, fechaComp, categoria, conceptoTxt, monto, viatico.metodo, viatico.caja_origen,
          usuario, notas, userId, now
        );

        const conceptoId = newViaticoConceptoId();
        db.prepare(`INSERT INTO viaticos_conceptos (
          id, viatico_id, categoria, concepto, monto, mov_id, orden, updated_at, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          conceptoId, id, categoria, conceptoTxt, monto, movId, orden++, now
        );
        conceptosGuardados.push({ id: conceptoId, categoria, concepto: conceptoTxt, monto, mov_id: movId });
        totalComprobado += monto;
      }

      // 5) Calcular diferencia (informativa, se guarda en el viático)
      // OPCIÓN B: el anticipo se borró por completo en el paso 1 (devolviendo su
      // monto a la caja), y los gastos comprobados ya descuentan el costo real.
      // Por eso NO se crean movimientos de devolución/faltante: hacerlo duplicaría
      // el ajuste y sumaría/restaría de más al saldo (bug histórico de doble suma).
      // Neto correcto: +anticipo (al borrarlo) − gastos comprobados = −costo real.
      const diferencia = viatico.monto_anticipo - totalComprobado;
      let movDevolucionId = null, movFaltanteId = null;

      // 6) Actualizar viático a COMPROBADO
      db.prepare(`UPDATE viaticos SET
        estado = 'COMPROBADO',
        fecha_comprobacion = ?,
        monto_comprobado = ?,
        diferencia = ?,
        caja_ajuste = ?,
        mov_devolucion_id = ?,
        mov_faltante_id = ?,
        comentario = COALESCE(?, comentario),
        updated_at = ?
        WHERE id = ?`).run(
        fechaComp, totalComprobado, diferencia, cajaAjusteId,
        movDevolucionId, movFaltanteId, comentarioGeneral, now, id
      );

      audit(req, 'COMPROBAR', 'viaticos', id,
        `${viatico.empleado_nombre}: anticipo $${viatico.monto_anticipo} comprobado $${totalComprobado.toFixed(2)} diff $${diferencia.toFixed(2)}`);

      return db.prepare(`
        SELECT v.*, co.nombre AS caja_origen_nombre, ca.nombre AS caja_ajuste_nombre
        FROM viaticos v
        LEFT JOIN cajas co ON co.id = v.caja_origen
        LEFT JOIN cajas ca ON ca.id = v.caja_ajuste
        WHERE v.id = ?
      `).get(id);
    });
    try { res.json(tx(req.params.id, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // DELETE /api/viaticos/:id — cancelar viático (revierte todos los movs)
  app.delete('/api/viaticos/:id', auth, (req, res) => {
    const tx = db.transaction((id) => {
      const v = db.prepare("SELECT * FROM viaticos WHERE id = ? AND deleted = 0").get(id);
      if (!v) throw new Error('viatico no existe');
      const now = Date.now();
      // Marcar deleted todos los movs vinculados
      const movIds = [v.mov_anticipo_id, v.mov_devolucion_id, v.mov_faltante_id].filter(Boolean);
      const conceptos = db.prepare('SELECT mov_id FROM viaticos_conceptos WHERE viatico_id = ? AND deleted = 0').all(id);
      conceptos.forEach(c => { if (c.mov_id) movIds.push(c.mov_id); });
      for (const mid of movIds) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
      }
      db.prepare('UPDATE viaticos_conceptos SET deleted = 1, updated_at = ? WHERE viatico_id = ?').run(now, id);
      db.prepare('UPDATE viaticos SET deleted = 1, estado = \'CANCELADO\', updated_at = ? WHERE id = ?').run(now, id);
      audit(req, 'DELETE', 'viaticos', id, `Cancelado: ${v.empleado_nombre} $${v.monto_anticipo}`);
      return { ok: true, movs_revertidos: movIds.length };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // GET /api/viaticos/categorias/gasto — lista de categorías GASTO disponibles
  // (excluye ANTICIPOS VIATICOS porque no se puede usar para comprobar)
  app.get('/api/viaticos/categorias/gasto', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.id, c.nombre, c.icon, c.color, g.nombre AS grupo
        FROM cats c
        LEFT JOIN groups g ON g.id = c.group_id
        WHERE c.tipo = 'GASTO' AND c.deleted = 0
          AND c.nombre != ?
        ORDER BY
          CASE WHEN g.nombre = 'VIATICOS' THEN 0 ELSE 1 END,
          g.orden, c.nombre
      `).all(CAT_ANTICIPO);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // === FIN RUTAS DE VIATICOS ===
};
