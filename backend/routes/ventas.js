// ============================================================================
// routes/ventas.js — Ventas (canales DETALLE / MAYOREO / DULCERIA / MAQUILA),
// catálogos de rutas y vendedores, cortes de detalle y reportes de totales.
// Extraído de server.js (#6), bloque "RUTAS DE VENTAS v1.11.0" (líneas 2471-3142,
// helpers + consts + rutas VERBATIM). Patrón mount*(app, db, opts) igual que
// cxp.js / catalogo.js / ventas-cierres-dia.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log }
// Rutas que monta (17, en este orden exacto):
//   GET    /api/ventas/rutas                    catálogo de rutas (?todas=1 incluye inactivas)
//   POST   /api/ventas/rutas                    crear/reactivar ruta por nombre
//   PUT    /api/ventas/rutas/:id                editar ruta (nombre / activa)
//   DELETE /api/ventas/rutas/:id                soft-delete (activa = 0)
//   GET    /api/ventas/vendedores               catálogo de vendedores (?todos=1 incluye inactivos)
//   POST   /api/ventas/vendedores               crear/upsert vendedor (AUTOVENTA | DISTRIBUIDOR)
//   PUT    /api/ventas/vendedores/:id           editar vendedor
//   DELETE /api/ventas/vendedores/:id           soft-delete, o ?hard=1 si no tiene ventas/cortes
//   GET    /api/ventas                          lista (filtros: desde, hasta, canal, origen, ruta, cliente, vendedor_id)
//   GET    /api/ventas/totales-dia              totales del día por canal (efectivo / transferencia)
//   ---- HOTFIX_ROUTE_ORDER_CIERRES_DIA: mount de ventas-cierres-dia va AQUÍ ----
//   GET    /api/ventas/:id                      detalle de una venta
//   POST   /api/ventas                          crear venta (+ mov INGRESO en caja)
//   DELETE /api/ventas/:id                      soft-delete venta + su mov
//   GET    /api/ventas/cortes/detalle           lista cortes de detalle (filtros: desde, hasta, ruta, vendedor_id)
//   POST   /api/ventas/cortes/detalle           crear/actualizar corte (idempotente por id, guard de día cerrado)
//   DELETE /api/ventas/cortes/detalle/:id       soft-delete corte + sus movs (guard de día cerrado)
//   GET    /api/ventas/reportes/totales         totales hoy / semana / mes / año
// Consts y helpers que trajo del bloque:
//   CANALES_VENTA, newVentaId, newMovId, newVendedorId, newCorteId, ensureCategoriaVenta.
// ORDEN DE REGISTRO CRÍTICO: el mount de ventas-cierres-dia (HOTFIX_ROUTE_ORDER_CIERRES_DIA)
// queda en su misma posición relativa original, justo ANTES de app.get('/api/ventas/:id'),
// porque si /api/ventas/:id se registra primero Express captura /api/ventas/cierres-dia
// como :id y rompe el cierre de día. NO reordenar.
// Único cambio respecto a server.js: el path del require de ventas-cierres-dia pasa de
// "./ventas-cierres-dia" a "../ventas-cierres-dia" (este router vive en routes/).
// ============================================================================
module.exports = function mountVentas(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const userCanUseCaja = opts.userCanUseCaja;
  const log = opts.log || (() => {});

  // =============================================================

  // === RUTAS DE VENTAS v1.11.0 ===

  const CANALES_VENTA = new Set(['DETALLE', 'MAYOREO', 'DULCERIA', 'MAQUILA']);

  // Helper: generar id TEXT estilo del sistema
  function newVentaId() {
    return newId('v-');
  }
  function newMovId(prefix) {
    return newId('m-' + prefix + '-');
  }
  function newVendedorId() {
    return newId('vd-');
  }
  function newCorteId() {
    return newId('cd-');
  }

  // Helper: buscar o crear categoría INGRESO por canal
  // Devuelve el NOMBRE de la categoría (que es lo que se guarda en movs.categoria)
  function ensureCategoriaVenta(canal) {
    const nombreCat = `VENTAS - ${canal}`;
    const existe = db.prepare(
      "SELECT id FROM cats WHERE nombre = ? AND tipo = 'INGRESO' AND deleted = 0"
    ).get(nombreCat);
    if (existe) return nombreCat;

    // Buscar (o crear) un grupo INGRESOS
    let grupo = db.prepare(
      "SELECT id FROM groups WHERE tipo = 'INGRESO' AND deleted = 0 ORDER BY orden ASC LIMIT 1"
    ).get();
    const now = Date.now();
    if (!grupo) {
      const grupoId = 'g-ingresos-' + now;
      db.prepare(`INSERT INTO groups (id, tipo, nombre, orden, updated_at, deleted)
        VALUES (?, 'INGRESO', 'INGRESOS', 0, ?, 0)`).run(grupoId, now);
      grupo = { id: grupoId };
    }
    // Crear la categoría en cats
    const catId = 'c-venta-' + canal.toLowerCase() + '-' + now;
    db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted)
      VALUES (?, 'INGRESO', ?, '#10B981', '💰', ?, ?, 0)`).run(catId, nombreCat, grupo.id, now);
    return nombreCat;
  }

  // -------- Catálogo de rutas (sin cambios respecto a v1.10) ----------
  app.get('/api/ventas/rutas', auth, (req, res) => {
    try {
      const incluirInactivas = req.query.todas === '1';
      const sql = incluirInactivas
        ? 'SELECT * FROM ventas_rutas ORDER BY activa DESC, nombre ASC'
        : 'SELECT * FROM ventas_rutas WHERE activa = 1 ORDER BY nombre ASC';
      res.json(db.prepare(sql).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ventas/rutas', auth, (req, res) => {
    try {
      const nombre = (req.body?.nombre || '').trim().toUpperCase();
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const existe = db.prepare('SELECT * FROM ventas_rutas WHERE nombre = ?').get(nombre);
      if (existe) {
        if (!existe.activa) {
          db.prepare('UPDATE ventas_rutas SET activa = 1 WHERE id = ?').run(existe.id);
        }
        return res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(existe.id));
      }
      const r = db.prepare('INSERT INTO ventas_rutas (nombre, activa) VALUES (?, 1)').run(nombre);
      audit(req, 'CREATE', 'ventas_rutas', String(r.lastInsertRowid), `Ruta: ${nombre}`);
      res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/ventas/rutas/:id', auth, (req, res) => {
    try {
      const id = +req.params.id;
      const cur = db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(id);
      if (!cur) return res.status(404).json({ error: 'ruta no existe' });
      const nombre = req.body?.nombre != null
        ? String(req.body.nombre).trim().toUpperCase()
        : cur.nombre;
      const activa = req.body?.activa != null ? (req.body.activa ? 1 : 0) : cur.activa;
      db.prepare('UPDATE ventas_rutas SET nombre = ?, activa = ? WHERE id = ?').run(nombre, activa, id);
      audit(req, 'UPDATE', 'ventas_rutas', String(id), `Ruta: ${nombre} (activa=${activa})`);
      res.json(db.prepare('SELECT * FROM ventas_rutas WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/ventas/rutas/:id', auth, (req, res) => {
    try {
      const id = +req.params.id;
      db.prepare('UPDATE ventas_rutas SET activa = 0 WHERE id = ?').run(id);
      audit(req, 'DELETE', 'ventas_rutas', String(id), 'Soft-delete (marcada inactiva)');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- Catálogo de vendedores (v1.11.1) --------
  app.get('/api/ventas/vendedores', auth, (req, res) => {
    try {
      const incluirInactivos = req.query.todos === '1';
      const sql = incluirInactivos
        ? `SELECT * FROM vendedores WHERE deleted = 0
           ORDER BY activo DESC,
                    CASE tipo WHEN 'AUTOVENTA' THEN 0 ELSE 1 END,
                    CASE WHEN ruta_default LIKE 'RUTA %'
                         THEN CAST(SUBSTR(ruta_default,6) AS INTEGER)
                         ELSE 9999 END,
                    nombre ASC`
        : `SELECT * FROM vendedores WHERE deleted = 0 AND activo = 1
           ORDER BY CASE tipo WHEN 'AUTOVENTA' THEN 0 ELSE 1 END,
                    CASE WHEN ruta_default LIKE 'RUTA %'
                         THEN CAST(SUBSTR(ruta_default,6) AS INTEGER)
                         ELSE 9999 END,
                    nombre ASC`;
      res.json(db.prepare(sql).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ventas/vendedores', auth, (req, res) => {
    try {
      const nombre = (req.body?.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const id = req.body?.id || newVendedorId();
      const tipo = (req.body?.tipo === 'DISTRIBUIDOR') ? 'DISTRIBUIDOR' : 'AUTOVENTA';
      const now = Date.now();
      db.prepare(`INSERT INTO vendedores (id, sys_code, nombre, ruta_default, telefono, notas, tipo, activo, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0)
        ON CONFLICT(id) DO UPDATE SET
          sys_code = excluded.sys_code, nombre = excluded.nombre,
          ruta_default = excluded.ruta_default, telefono = excluded.telefono,
          notas = excluded.notas, tipo = excluded.tipo,
          activo = 1, updated_at = excluded.updated_at, deleted = 0
      `).run(id, req.body?.sys_code || null, nombre, req.body?.ruta_default || null,
        req.body?.telefono || null, req.body?.notas || null, tipo, now);
      audit(req, 'CREATE', 'vendedores', id, `${tipo}: ${nombre}`);
      res.json(db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/ventas/vendedores/:id', auth, (req, res) => {
    try {
      const id = req.params.id;
      const cur = db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id);
      if (!cur) return res.status(404).json({ error: 'vendedor no existe' });
      const now = Date.now();
      const fields = ['sys_code', 'nombre', 'ruta_default', 'telefono', 'notas', 'activo', 'tipo'];
      const next = {};
      for (const f of fields) next[f] = req.body?.[f] != null ? req.body[f] : cur[f];
      next.activo = next.activo ? 1 : 0;
      if (next.tipo !== 'DISTRIBUIDOR' && next.tipo !== 'AUTOVENTA') next.tipo = 'AUTOVENTA';
      db.prepare(`UPDATE vendedores SET sys_code=?, nombre=?, ruta_default=?, telefono=?, notas=?,
        tipo=?, activo=?, updated_at=? WHERE id=?`).run(
        next.sys_code, next.nombre, next.ruta_default, next.telefono, next.notas,
        next.tipo, next.activo, now, id
      );
      audit(req, 'UPDATE', 'vendedores', id, `${next.tipo}: ${next.nombre}`);
      res.json(db.prepare('SELECT * FROM vendedores WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/ventas/vendedores/:id', auth, (req, res) => {
    try {
      const id = req.params.id;
      const hard = req.query.hard === '1';
      const cur = db.prepare('SELECT nombre, tipo FROM vendedores WHERE id = ?').get(id);
      if (!cur) return res.status(404).json({ error: 'vendedor no existe' });
      if (hard) {
        // Verificar que no haya cortes ni ventas vinculados
        const usado = db.prepare(`
          SELECT (SELECT COUNT(*) FROM ventas WHERE vendedor_id = ? AND deleted = 0) +
                 (SELECT COUNT(*) FROM ventas_detalle_cortes WHERE vendedor_id = ? AND deleted = 0)
          AS n`).get(id, id);
        if (usado.n > 0) {
          return res.status(400).json({
            error: `No se puede eliminar: tiene ${usado.n} venta(s)/corte(s) vinculados. Use INACTIVAR en su lugar.`
          });
        }
        db.prepare('DELETE FROM vendedores WHERE id = ?').run(id);
        audit(req, 'HARD_DELETE', 'vendedores', id, `Eliminación permanente: ${cur.nombre}`);
      } else {
        const now = Date.now();
        db.prepare('UPDATE vendedores SET activo = 0, deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
        audit(req, 'DELETE', 'vendedores', id, `Soft-delete: ${cur.nombre}`);
      }
      res.json({ ok: true, hard });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- VENTAS simples (MAYOREO/DULCERIA/MAQUILA + DETALLE simple) --------
  app.get('/api/ventas', auth, (req, res) => {
    try {
      const { desde, hasta, canal, origen, ruta, cliente, vendedor_id } = req.query;
      const where = ['v.deleted = 0'];
      const params = [];
      if (desde)       { where.push('v.fecha >= ?');     params.push(desde); }
      if (hasta)       { where.push('v.fecha <= ?');     params.push(hasta); }
      if (canal)       { where.push('v.canal = ?');      params.push(String(canal).toUpperCase()); }
      if (origen)      { where.push('v.origen = ?');     params.push(origen); }
      if (ruta)        { where.push('v.ruta = ?');       params.push(String(ruta).toUpperCase()); }
      if (cliente)     { where.push('v.cliente LIKE ?'); params.push('%' + cliente + '%'); }
      if (vendedor_id) { where.push('v.vendedor_id = ?');params.push(vendedor_id); }
      const sql = `
        SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
        FROM ventas v
        LEFT JOIN cajas c     ON c.id = v.caja_id
        LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE ${where.join(' AND ')}
        ORDER BY v.fecha DESC, v.created_at DESC
        LIMIT 1000
      `;
      res.json(db.prepare(sql).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // F5_TOTALES_DIA · F5_ROUTE_ORDER_FIXED — totales del día agrupados por canal, con desglose efectivo/transferencia
  app.get('/api/ventas/totales-dia', auth, (req, res) => {
    try {
      const fecha = String(req.query.fecha || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' });
      }
      // Agrupar ventas vivas del día por canal con desglose por movs.metodo
      // Importante: solo cuenta ventas con su mov vivo (deleted=0 en ambas)
      // Para ventas sin mov_id (raro pero posible), se asume EFECTIVO
      const rows = db.prepare(`
        SELECT
          v.canal AS canal,
          COUNT(*) AS count,
          COALESCE(SUM(v.importe), 0) AS venta_sistema,
          COALESCE(SUM(CASE
            WHEN COALESCE(m.metodo, 'EFECTIVO') = 'TRANSFERENCIA' THEN 0
            ELSE v.importe
          END), 0) AS efectivo,
          COALESCE(SUM(CASE
            WHEN COALESCE(m.metodo, 'EFECTIVO') = 'TRANSFERENCIA' THEN v.importe
            ELSE 0
          END), 0) AS transferencia
        FROM ventas v
        LEFT JOIN movs m ON m.id = v.mov_id AND m.deleted = 0
        WHERE v.fecha = ? AND v.deleted = 0
        GROUP BY v.canal
      `).all(fecha);

      // Asegurar que los 4 canales estén siempre presentes (aunque sea con ceros)
      const canales = ['DETALLE', 'MAYOREO', 'DULCERIA', 'MAQUILA'];
      const porCanal = {};
      for (const c of canales) {
        porCanal[c] = { canal: c, count: 0, venta_sistema: 0, efectivo: 0, transferencia: 0 };
      }
      for (const r of rows) {
        if (porCanal[r.canal]) porCanal[r.canal] = r;
      }

      // Gran total: suma de los 4 canales
      const granTotal = {
        count: canales.reduce((s, c) => s + porCanal[c].count, 0),
        venta_sistema: canales.reduce((s, c) => s + porCanal[c].venta_sistema, 0),
        efectivo: canales.reduce((s, c) => s + porCanal[c].efectivo, 0),
        transferencia: canales.reduce((s, c) => s + porCanal[c].transferencia, 0),
      };

      res.json({
        fecha,
        por_canal: canales.map(c => porCanal[c]),
        gran_total: granTotal,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // HOTFIX_ROUTE_ORDER_CIERRES_DIA — Mount de ventas-cierres-dia ANTES de /api/ventas/:id para evitar
  // que Express matchee /api/ventas/cierres-dia como si "cierres-dia" fuera un :id.
  const mountVentasCierresDia = require("../ventas-cierres-dia");
  mountVentasCierresDia(app, db, { requireAuth: auth, requirePin: requirePin, log: console.log, audit: audit });
  const _f4_isDiaCerrado = require("../ventas-cierres-dia").isDiaCerrado;

  app.get('/api/ventas/:id', auth, (req, res) => {
    try {
      const row = db.prepare(`
        SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
        FROM ventas v
        LEFT JOIN cajas c     ON c.id = v.caja_id
        LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE v.id = ? AND v.deleted = 0`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'no existe' });
      res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ventas', auth, (req, res) => {
    const tx = db.transaction((body) => {
      const canal = String(body.canal || '').toUpperCase();
      if (!CANALES_VENTA.has(canal)) throw new Error('canal inválido');
      const importe = Number(body.importe);
      if (!(importe > 0)) throw new Error('importe debe ser > 0');

      // caja_id ahora es TEXT (UUID estilo 'caja-principal')
      const caja_id = body.caja_id ? String(body.caja_id).trim() : '';
      if (!caja_id) throw new Error('caja_id requerida');
      const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(caja_id);
      if (!caja) throw new Error('caja no existe o está eliminada');
      if (caja.archivada) throw new Error('caja archivada, no se puede usar');

      const fecha   = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const origen  = body.origen === 'captura-rapida' ? 'captura-rapida' : 'modulo-ventas';
      const usuario = body.usuario || req.user?.nombre || 'sistema';
      const userId  = req.user?.id || null;

      // Auto-registrar ruta si DETALLE y no existe
      let ruta = null;
      if (canal === 'DETALLE') {
        ruta = String(body.ruta || '').trim().toUpperCase();
        if (!ruta) throw new Error('ruta requerida para DETALLE');
        const existe = db.prepare('SELECT id, activa FROM ventas_rutas WHERE nombre = ?').get(ruta);
        if (!existe) {
          db.prepare('INSERT INTO ventas_rutas (nombre, activa) VALUES (?, 1)').run(ruta);
        } else if (!existe.activa) {
          db.prepare('UPDATE ventas_rutas SET activa = 1 WHERE id = ?').run(existe.id);
        }
      }

      const cliente       = body.cliente ? String(body.cliente).trim() : null;
      const numero_pedido = canal === 'DULCERIA' ? (body.numero_pedido || null) : null;
      const comentario    = body.comentario ? String(body.comentario).trim() : null;
      const vendedor_id   = body.vendedor_id || null;

      // Concepto legible para el mov en caja
      const partes = [`VENTA ${canal}`];
      if (ruta)          partes.push(`· ${ruta}`);
      if (cliente)       partes.push(`· ${cliente}`);
      if (numero_pedido) partes.push(`· Pedido ${numero_pedido}`);
      if (origen === 'captura-rapida') partes.push('[CAPTURA RÁPIDA]');
      const concepto = partes.join(' ');

      // Categoría INGRESO correcta (en cats, no categorias)
      const categoriaName = ensureCategoriaVenta(canal);

      const now = Date.now();
      const mov_id = newMovId('venta');
      const venta_id = newVentaId();

      // INSERT correcto en movs (todas las columnas requeridas, IDs TEXT, updated_at para sync)
      const src = origen === 'captura-rapida' ? 'venta-rapida' : 'venta';
      const metodo = (caja.tipo === 'BANCO' || caja.tipo === 'TARJETA') ? 'TRANSFERENCIA' : 'EFECTIVO';
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        mov_id, fecha, categoriaName, concepto, importe, metodo, caja_id,
        usuario, comentario || '', src, userId, now
      );

      // INSERT en ventas con foreign keys TEXT
      db.prepare(`INSERT INTO ventas (
        id, fecha, canal, ruta, vendedor_id, cliente, numero_pedido, comentario,
        importe, caja_id, mov_id, origen, usuario, user_id, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        venta_id, fecha, canal, ruta, vendedor_id, cliente, numero_pedido, comentario,
        importe, caja_id, mov_id, origen, usuario, userId, now
      );

      audit(req, 'CREATE', 'ventas', venta_id, `${canal} · ${concepto} · ${importe}`);

      return db.prepare(`
        SELECT v.*, c.nombre AS caja_nombre, vd.nombre AS vendedor_nombre
        FROM ventas v
        LEFT JOIN cajas c     ON c.id = v.caja_id
        LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
        WHERE v.id = ?
      `).get(venta_id);
    });

    try {
      res.json(tx(req.body || {}));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/ventas/:id', auth, (req, res) => {
    const tx = db.transaction((id) => {
      const v = db.prepare('SELECT * FROM ventas WHERE id = ? AND deleted = 0').get(id);
      if (!v) throw new Error('venta no existe');
      const now = Date.now();
      // Soft-delete venta y mov vinculado (igual que el resto del sistema)
      db.prepare('UPDATE ventas SET deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
      if (v.mov_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, v.mov_id);
      }
      audit(req, 'DELETE', 'ventas', id, `${v.canal} · ${v.importe}`);
      return { ok: true, id };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // -------- CORTES DE DETALLE (tabla estilo Excel) --------
  // Lista cortes con filtros
  app.get('/api/ventas/cortes/detalle', auth, (req, res) => {
    try {
      const { desde, hasta, ruta, vendedor_id } = req.query;
      const where = ['cd.deleted = 0'];
      const params = [];
      if (desde)       { where.push('cd.fecha >= ?');      params.push(desde); }
      if (hasta)       { where.push('cd.fecha <= ?');      params.push(hasta); }
      if (ruta)        { where.push('cd.ruta = ?');        params.push(String(ruta).toUpperCase()); }
      if (vendedor_id) { where.push('cd.vendedor_id = ?'); params.push(vendedor_id); }
      res.json(db.prepare(`
        SELECT cd.*, vd.nombre AS vendedor_nombre_actual
        FROM ventas_detalle_cortes cd
        LEFT JOIN vendedores vd ON vd.id = cd.vendedor_id
        WHERE ${where.join(' AND ')}
        ORDER BY cd.fecha DESC, cd.ruta ASC
        LIMIT 500
      `).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Crear/Actualizar corte (idempotente por id)
  // El frontend manda los 7 importes; backend crea hasta 5 movs (efectivo, transf, crédito, gastos, gasolina)
  // -------- Cortes de detalle v1.15.2 --------
  // Cambios:
  //   - acepta nuevos campos: cheque_vale, tarjetas
  //   - TRANSFERENCIA, TARJETAS, CHEQUE/VALE NO crean mov en caja (solo registro)
  //   - EFECTIVO crea INGRESO con afecta_saldo=1 (mueve la caja)
  //   - GASTOS, GASOLINA crean GASTO con afecta_saldo=0 (registro y reportes, NO mueven caja —
  //     porque el vendedor ya los descontó del efectivo entregado, nunca pasaron por caja física)
  //   - El campo `diferencia` ahora considera todos los métodos: 
  //     (efectivo+transf+cheque_vale+tarjetas+credito+gastos) - venta_sistema
  app.post('/api/ventas/cortes/detalle', auth, (req, res) => {
    const tx = db.transaction((body) => {
      const fecha = (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const ruta  = String(body.ruta || '').trim().toUpperCase();
      if (!ruta) throw new Error('ruta requerida');
      // F4_CIERRE_DIA — guard: rechaza si el día está cerrado
      if (_f4_isDiaCerrado(db, fecha)) {
        const e = new Error('El día ' + fecha + ' está cerrado. Reábrelo desde Captura por Vendedor (requiere PIN de admin/gerente).');
        e.status = 423;
        throw e;
      }

      const venta_sistema = Math.abs(Number(body.venta_sistema) || 0);
      const efectivo      = Number(body.efectivo) || 0;
      const transferencia = Number(body.transferencia) || 0;
      const cheque_vale   = Number(body.cheque_vale) || 0;
      const tarjetas      = Number(body.tarjetas) || 0;
      const credito       = Number(body.credito) || 0;
      const gastos        = Number(body.gastos) || 0;
      const devoluciones  = Number(body.devoluciones) || 0;
      const gasolina      = Number(body.gasolina) || 0;
      const diferencia    = (efectivo + transferencia + cheque_vale + tarjetas + credito + gastos) - venta_sistema;

      const caja_efectivo_id = body.caja_efectivo_id || null;

      if (efectivo > 0 && !caja_efectivo_id) throw new Error('caja_efectivo_id requerida si hay efectivo');
      if ((gastos > 0 || gasolina > 0) && !caja_efectivo_id) throw new Error('caja_efectivo_id requerida si hay gastos o gasolina');

      if (caja_efectivo_id) {
        const c = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(caja_efectivo_id);
        if (!c) throw new Error('caja efectivo no existe');
      }

      const vendedor_id = body.vendedor_id || null;
      let vendedor_nombre = body.vendedor_nombre || null;
      if (vendedor_id && !vendedor_nombre) {
        const vd = db.prepare('SELECT nombre FROM vendedores WHERE id = ?').get(vendedor_id);
        vendedor_nombre = vd?.nombre || null;
      }

      const id = body.id || newCorteId();
      const isUpdate = !!body.id;
      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';
      const userId = req.user?.id || null;
      const comentario = body.comentario || null;

      if (isUpdate) {
        const prev = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ? AND deleted = 0').get(id);
        if (prev) {
          const movIds = [prev.mov_efectivo_id, prev.mov_transferencia_id, prev.mov_credito_id,
                          prev.mov_gastos_id, prev.mov_devoluciones_id, prev.mov_gasolina_id].filter(Boolean);
          for (const mid of movIds) {
            db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
          }
        }
      }

      const catVenta = ensureCategoriaVenta('DETALLE');
      const catGastosNombre = 'GASTOS DE RUTA';
      const catGasolinaNombre = 'GASOLINA';
      const conceptoBase = `Corte ${ruta}${vendedor_nombre ? ' · ' + vendedor_nombre : ''}`;

      const movs = {};

      // SOLO efectivo crea ingreso en caja
      if (efectivo > 0 && caja_efectivo_id) {
        movs.efectivo = newMovId('vd-efec');
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja,
          usuario, notas, src, user_id, updated_at, deleted
        ) VALUES (?, ?, 'INGRESO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0)`).run(
          movs.efectivo, fecha, catVenta, conceptoBase + ' (efectivo)', efectivo, caja_efectivo_id,
          usuario, comentario || '', userId, now
        );
      }
      // v1.15.2 FIX: Gastos y gasolina se registran como movs (para trazabilidad y reportes)
      // pero con afecta_saldo = 0 porque NO salen de la caja física: el vendedor ya los
      // descontó del efectivo entregado, no salieron de Caja Principal.
      if (gastos > 0 && caja_efectivo_id) {
        movs.gastos = newMovId('vd-gas');
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja,
          usuario, notas, src, user_id, updated_at, deleted, afecta_saldo
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0, 0)`).run(
          movs.gastos, fecha, catGastosNombre, conceptoBase + ' (gastos)', gastos,
          caja_efectivo_id, usuario, comentario || '', userId, now
        );
      }
      if (gasolina > 0 && caja_efectivo_id) {
        movs.gasolina = newMovId('vd-gas2');
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja,
          usuario, notas, src, user_id, updated_at, deleted, afecta_saldo
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'venta-detalle', ?, ?, 0, 0)`).run(
          movs.gasolina, fecha, catGasolinaNombre, conceptoBase + ' (gasolina)', gasolina,
          caja_efectivo_id, usuario, comentario || '', userId, now
        );
      }
      // TRANSFERENCIA, TARJETAS, CHEQUE/VALE, CRÉDITO, DEVOLUCIONES: solo registro, NO crean mov

      // INSERT/UPDATE corte
      db.prepare(`INSERT INTO ventas_detalle_cortes (
        id, fecha, ruta, vendedor_id, vendedor_nombre,
        venta_sistema, efectivo, transferencia, credito, gastos, devoluciones, gasolina, diferencia,
        caja_efectivo_id, caja_banco_id,
        mov_efectivo_id, mov_transferencia_id, mov_credito_id,
        mov_gastos_id, mov_devoluciones_id, mov_gasolina_id,
        comentario, usuario, user_id, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        fecha=excluded.fecha, ruta=excluded.ruta,
        vendedor_id=excluded.vendedor_id, vendedor_nombre=excluded.vendedor_nombre,
        venta_sistema=excluded.venta_sistema, efectivo=excluded.efectivo,
        transferencia=excluded.transferencia, credito=excluded.credito,
        gastos=excluded.gastos, devoluciones=excluded.devoluciones, gasolina=excluded.gasolina,
        diferencia=excluded.diferencia,
        caja_efectivo_id=excluded.caja_efectivo_id, caja_banco_id=excluded.caja_banco_id,
        mov_efectivo_id=excluded.mov_efectivo_id, mov_transferencia_id=excluded.mov_transferencia_id,
        mov_credito_id=excluded.mov_credito_id, mov_gastos_id=excluded.mov_gastos_id,
        mov_devoluciones_id=excluded.mov_devoluciones_id, mov_gasolina_id=excluded.mov_gasolina_id,
        comentario=excluded.comentario, usuario=excluded.usuario, user_id=excluded.user_id,
        updated_at=excluded.updated_at, deleted=0
      `).run(
        id, fecha, ruta, vendedor_id, vendedor_nombre,
        venta_sistema, efectivo, transferencia, credito, gastos, devoluciones, gasolina, diferencia,
        caja_efectivo_id, null, // caja_banco_id ya no se usa
        movs.efectivo || null, null, null,  // transferencia ya no genera mov
        movs.gastos || null, null, movs.gasolina || null,
        comentario, usuario, userId, now
      );

      // Persistir cheque_vale y tarjetas en `comentario` o columnas nuevas?
      // Por compatibilidad con schema actual, guardo cheque_vale + tarjetas EN EL COMENTARIO con prefijo
      // (próxima versión podríamos agregar columnas reales si quieres reportes desglosados)
      if (cheque_vale > 0 || tarjetas > 0) {
        const extra = [];
        if (cheque_vale > 0) extra.push(`cheque/vale=${cheque_vale.toFixed(2)}`);
        if (tarjetas > 0)    extra.push(`tarjetas=${tarjetas.toFixed(2)}`);
        const tag = '[' + extra.join('; ') + ']';
        const newComentario = comentario ? (comentario + ' ' + tag) : tag;
        db.prepare('UPDATE ventas_detalle_cortes SET comentario = ? WHERE id = ?').run(newComentario, id);
      }

      audit(req, isUpdate ? 'UPDATE' : 'CREATE', 'ventas_detalle_cortes', id,
        `${fecha} · ${ruta} · sistema=${venta_sistema} efec=${efectivo} dif=${diferencia.toFixed(2)}`);

      return db.prepare(`
        SELECT cd.*, vd.nombre AS vendedor_nombre_actual, vd.tipo AS vendedor_tipo
        FROM ventas_detalle_cortes cd
        LEFT JOIN vendedores vd ON vd.id = cd.vendedor_id
        WHERE cd.id = ?
      `).get(id);
    });

    try { res.json(tx(req.body || {})); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  app.delete('/api/ventas/cortes/detalle/:id', auth, (req, res) => {
    const tx = db.transaction((id) => {
      const cd = db.prepare('SELECT * FROM ventas_detalle_cortes WHERE id = ? AND deleted = 0').get(id);
      if (!cd) throw new Error('corte no existe');
      // F4_CIERRE_DIA — guard: rechaza si el día del corte está cerrado
      if (_f4_isDiaCerrado(db, cd.fecha)) {
        const e = new Error('El día ' + cd.fecha + ' está cerrado. Reábrelo desde Captura por Vendedor (requiere PIN de admin/gerente).');
        e.status = 423;
        throw e;
      }
      const now = Date.now();
      const movIds = [cd.mov_efectivo_id, cd.mov_transferencia_id, cd.mov_credito_id,
                      cd.mov_gastos_id, cd.mov_devoluciones_id, cd.mov_gasolina_id].filter(Boolean);
      for (const mid of movIds) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, mid);
      }
      db.prepare('UPDATE ventas_detalle_cortes SET deleted = 1, updated_at = ? WHERE id = ?').run(now, id);
      audit(req, 'DELETE', 'ventas_detalle_cortes', id, `${cd.fecha} · ${cd.ruta}`);
      return { ok: true, id, movsBorrados: movIds.length };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  // -------- TOTALES (mejorado: incluye ventas simples + cortes de detalle) --------
  app.get('/api/ventas/reportes/totales', auth, (req, res) => {
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const d = new Date();
      const dow = (d.getDay() + 6) % 7;
      const lunes = new Date(d); lunes.setDate(d.getDate() - dow);
      const inicioSemana = lunes.toISOString().slice(0, 10);
      const inicioMes  = hoy.slice(0, 7) + '-01';
      const inicioAnio = hoy.slice(0, 4) + '-01-01';

      const sumVentas = (desde, hasta) => {
        const por_canal = db.prepare(`
          SELECT canal,
            COALESCE(SUM(importe), 0) AS total,
            COUNT(*) AS n
          FROM ventas
          WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
          GROUP BY canal
        `).all(desde, hasta);
        const cortes = db.prepare(`
          SELECT
            COALESCE(SUM(efectivo + transferencia + credito), 0) AS total,
            COUNT(*) AS n
          FROM ventas_detalle_cortes
          WHERE deleted = 0 AND fecha >= ? AND fecha <= ?
        `).get(desde, hasta);
        let total = 0, n = 0;
        por_canal.forEach(c => { total += c.total; n += c.n; });
        // sumar cortes a la totales global (pero también marcarlos en por_canal como DETALLE-CORTE)
        if (cortes.total > 0) {
          const existing = por_canal.find(c => c.canal === 'DETALLE');
          if (existing) {
            existing.total += cortes.total;
            existing.n += cortes.n;
          } else {
            por_canal.push({ canal: 'DETALLE', total: cortes.total, n: cortes.n });
          }
          total += cortes.total;
          n += cortes.n;
        }
        return { total, n, por_canal };
      };

      res.json({
        rangos: { hoy, inicioSemana, inicioMes, inicioAnio },
        hoy:    sumVentas(hoy, hoy),
        semana: sumVentas(inicioSemana, hoy),
        mes:    sumVentas(inicioMes, hoy),
        anio:   sumVentas(inicioAnio, hoy)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // === FIN RUTAS DE VENTAS v1.11.0 ===
  // =============================================================
};
