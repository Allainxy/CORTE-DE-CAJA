// ============================================================================
// routes/ordenes.js — Órdenes de compra (ciclo: borrador → cierre → pago).
// Extraído de server.js (#6), bloque "ÓRDENES DE COMPRA" (helper + rutas
// VERBATIM). Patrón mount*(app, db, opts) igual que cxp.js / catalogo.js /
// ventas-cierres-dia.js / nomina-extensions.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log }
// Rutas que monta:
//   GET    /api/ordenes                 lista (filtros: estado, proveedor_id, fecha_desde, fecha_hasta)
//   GET    /api/ordenes/:id             detalle con items
//   POST   /api/ordenes                 crear orden (BORRADOR, mov de anticipo si monto_entregado > 0)
//   PUT    /api/ordenes/:id             editar orden en BORRADOR (rehace items y anticipo)
//   POST   /api/ordenes/:id/cerrar      cerrar con valores reales (PAGADA o PENDIENTE_PAGO + CxP)
//   POST   /api/ordenes/:id/pagar       abonar a la CxP vinculada (crea movs en caja)
//   POST   /api/ordenes/:id/cancelar    cancelar (PIN) revirtiendo movs e items
//   DELETE /api/ordenes/:id             borrar (PIN) revirtiendo movs, CxP y abonos
//   GET    /api/ordenes/stats/resumen   KPIs para Dashboard (hoy / mes / pendientes / borradores)
// Helpers internos: getOrdenCompleta.
// ============================================================================
module.exports = function mountOrdenes(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const userCanUseCaja = opts.userCanUseCaja;
  const log = opts.log || (() => {});

  // ===========================================================
  // ============= ÓRDENES DE COMPRA ===========================
  // ===========================================================

  // Helper: obtener orden con items
  function getOrdenCompleta(id) {
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(id);
    if (!orden) return null;
    orden.items = db.prepare(`SELECT * FROM ordenes_compra_items 
                              WHERE orden_id = ? AND deleted = 0 
                              ORDER BY created_at ASC`).all(id);
    return orden;
  }

  // Listar órdenes
  app.get('/api/ordenes', auth, (req, res) => {
    const { estado, proveedor_id, fecha_desde, fecha_hasta } = req.query;
    let sql = 'SELECT * FROM ordenes_compra WHERE deleted = 0';
    const params = [];
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    if (proveedor_id) { sql += ' AND proveedor_id = ?'; params.push(proveedor_id); }
    if (fecha_desde) { sql += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND fecha <= ?'; params.push(fecha_hasta); }
    sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 500';
    const ordenes = db.prepare(sql).all(...params);
    // Adjuntar items
    ordenes.forEach(o => {
      o.items = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(o.id);
    });
    res.json({ ordenes });
  });

  // Detalle de una orden
  app.get('/api/ordenes/:id', auth, (req, res) => {
    const orden = getOrdenCompleta(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(orden);
  });

  // Crear orden (estado EJECUTANDO, crea GASTO de salida si hay monto_entregado > 0)
  app.post('/api/ordenes', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const o = req.body || {};
    if (!o.proveedor_nombre) return res.status(400).json({ error: 'Falta proveedor' });
    if (!o.caja_id) return res.status(400).json({ error: 'Falta caja' });
    if (!o.metodo_pago || !['EFECTIVO', 'TRANSFERENCIA'].includes(o.metodo_pago))
      return res.status(400).json({ error: 'Método de pago inválido' });
    if (!Array.isArray(o.items) || o.items.length === 0)
      return res.status(400).json({ error: 'Debe agregar al menos un producto' });

    // FILTRAR: solo items con cantidad > 0 se guardan
    o.items = o.items.filter(it => Number(it.cantidad_estimada || 0) > 0);
    if (o.items.length === 0)
      return res.status(400).json({ error: 'Captura cantidad en al menos un producto para guardar la orden' });

    const id = o.id || ('ord-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000));
    const now = Date.now();
    const fecha = o.fecha || new Date().toISOString().slice(0, 10);
    const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(o.caja_id);
    const cajaNombre = cajaInfo?.nombre || o.caja_id;

    // Calcular monto estimado de items
    const montoEstimado = o.items.reduce((s, it) => {
      const c = Number(it.cantidad_estimada || 0);
      const p = Number(it.precio_estimado || 0);
      return s + c * p;
    }, 0);

    const montoEntregado = Number(o.monto_entregado || 0);
    if (montoEntregado < 0) return res.status(400).json({ error: 'Monto entregado no puede ser negativo' });

    // Validar saldo de caja si efectivo y monto > 0
    if (o.metodo_pago === 'EFECTIVO' && montoEntregado > 0) {
      const saldo = db.prepare(`SELECT 
        COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END), 0) as s
        FROM movs WHERE caja = ? AND deleted = 0`).get(o.caja_id).s;
      if (saldo < montoEntregado) {
        console.warn(`⚠️ Orden ${id}: caja ${o.caja_id} con saldo ${saldo} < entregado ${montoEntregado}. Permitiendo.`);
        // No bloquear, solo advertir en logs
      }
    }

    const tx = db.transaction(() => {
      // Crear mov de salida si monto_entregado > 0
      let movSalidaId = null;
      if (montoEntregado > 0) {
        movSalidaId = newId('m-ord-');
        const conceptoMov = `Compra a ${o.proveedor_nombre}${o.comprador_nombre ? ' · ' + o.comprador_nombre : ''}`;
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', 'MERCANCIA', ?, ?, ?, ?, ?, ?, ?, 'compra', ?, ?, ?, 0)`).run(
          movSalidaId, fecha, conceptoMov, montoEntregado,
          o.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
          o.caja_id, req.user.nombre, `Anticipo de orden ${id}`,
          req.user.id, id, now, now
        );
      }

      // Crear la orden
      db.prepare(`INSERT INTO ordenes_compra (
        id, fecha, numero_orden, proveedor_id, proveedor_nombre,
        comprador_nombre, metodo_pago, caja_id, caja_nombre,
        monto_estimado, monto_entregado, monto_real, ajuste,
        estado, mov_salida_id, observaciones,
        user_id, user_nombre, created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'BORRADOR', ?, ?, ?, ?, ?, ?, 0)`).run(
        id, fecha, o.numero_orden || null, o.proveedor_id || null, o.proveedor_nombre,
        o.comprador_nombre || null, o.metodo_pago, o.caja_id, cajaNombre,
        montoEstimado, montoEntregado, movSalidaId,
        o.observaciones || null, req.user.id, req.user.nombre, now, now
      );

      // Insertar items
      for (const it of o.items) {
        const itemId = it.id || newId('oi-');
        const cant = Number(it.cantidad_estimada || 0);
        const precio = Number(it.precio_estimado || 0);
        db.prepare(`INSERT INTO ordenes_compra_items (
          id, orden_id, producto, unidad,
          cantidad_estimada, precio_estimado, total_estimado,
          categoria_contable, notas,
          created_at, updated_at, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          itemId, id, it.producto || '', it.unidad || 'KG',
          cant, precio, cant * precio,
          it.categoria_contable || 'MERCANCIA', it.notas || null,
          now, now
        );
      }

      // Upsert: agregar productos NUEVOS al catálogo del proveedor si no existen
      if (o.proveedor_id) {
        for (const it of o.items) {
          if (!it.producto) continue;
          const existe = db.prepare(
            'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
          ).get(o.proveedor_id, it.producto);
          if (!existe) {
            const ppId = newId('pp-');
            const cant = Number(it.cantidad_estimada || 0);
            const precio = Number(it.precio_estimado || 0);
            db.prepare(`INSERT INTO proveedor_productos (
              id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
              categoria_contable, activo, orden_visual, created_at, updated_at, deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
              ppId, o.proveedor_id, it.producto, it.unidad || 'KG',
              cant, precio, it.categoria_contable || 'MERCANCIA',
              now, now
            );
          }
        }
      }
    });

    try {
      tx();
      audit(req, 'create', 'orden_compra', id, JSON.stringify({
        proveedor: o.proveedor_nombre,
        monto_estimado: montoEstimado,
        monto_entregado: montoEntregado,
        items: o.items.length
      }));
      const ordenCompleta = getOrdenCompleta(id);
      res.json({ ok: true, orden: ordenCompleta });
    } catch (e) {
      console.error('Error creando orden:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // PUT: Editar orden en BORRADOR (cambiar items, ajustar anticipo, comprador, etc.)
  // body: campos similares a POST: proveedor, items, monto_entregado, caja_id, metodo_pago...
  app.put('/api/ordenes/:id', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'BORRADOR') {
      return res.status(400).json({ error: 'Solo se pueden editar órdenes en BORRADOR' });
    }

    const o = req.body || {};
    if (!o.proveedor_nombre) return res.status(400).json({ error: 'Falta proveedor' });
    if (!o.caja_id) return res.status(400).json({ error: 'Falta caja' });
    if (!Array.isArray(o.items) || o.items.length === 0)
      return res.status(400).json({ error: 'Debe tener al menos un producto' });

    // FILTRAR: solo items con cantidad > 0 se guardan
    o.items = o.items.filter(it => Number(it.cantidad_estimada || 0) > 0);
    if (o.items.length === 0)
      return res.status(400).json({ error: 'Captura cantidad en al menos un producto para guardar la orden' });

    const now = Date.now();
    const fecha = o.fecha || orden.fecha;
    const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(o.caja_id);
    const cajaNombre = cajaInfo?.nombre || o.caja_id;

    const montoEstimado = o.items.reduce((s, it) =>
      s + Number(it.cantidad_estimada || 0) * Number(it.precio_estimado || 0), 0);

    const montoEntregado = Number(o.monto_entregado || 0);
    if (montoEntregado < 0) return res.status(400).json({ error: 'Monto entregado no puede ser negativo' });

    const tx = db.transaction(() => {
      // 1) Borrar mov de salida anterior si existía
      if (orden.mov_salida_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
      }

      // 2) Crear nuevo mov de salida si monto > 0
      let movSalidaId = null;
      if (montoEntregado > 0) {
        movSalidaId = newId('m-ord-');
        const conceptoMov = `Compra a ${o.proveedor_nombre}${o.comprador_nombre ? ' · ' + o.comprador_nombre : ''}`;
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', 'MERCANCIA', ?, ?, ?, ?, ?, ?, ?, 'compra', ?, ?, ?, 0)`).run(
          movSalidaId, fecha, conceptoMov, montoEntregado,
          o.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
          o.caja_id, req.user.nombre, `Anticipo de orden ${orden.id} (editado)`,
          req.user.id, orden.id, now, now
        );
      }

      // 3) Soft-delete items viejos
      db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);

      // 4) Crear items nuevos
      for (const it of o.items) {
        const itemId = newId('oi-');
        const cant = Number(it.cantidad_estimada || 0);
        const precio = Number(it.precio_estimado || 0);
        db.prepare(`INSERT INTO ordenes_compra_items (
          id, orden_id, producto, unidad,
          cantidad_estimada, precio_estimado, total_estimado,
          categoria_contable, notas,
          created_at, updated_at, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          itemId, orden.id, it.producto || '', it.unidad || 'KG',
          cant, precio, cant * precio,
          it.categoria_contable || 'MERCANCIA', it.notas || null,
          now, now
        );
      }

      // 5) Upsert productos nuevos al catálogo del proveedor
      if (o.proveedor_id) {
        for (const it of o.items) {
          if (!it.producto) continue;
          const existe = db.prepare(
            'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
          ).get(o.proveedor_id, it.producto);
          if (!existe) {
            const ppId = newId('pp-');
            const cant = Number(it.cantidad_estimada || 0);
            const precio = Number(it.precio_estimado || 0);
            db.prepare(`INSERT INTO proveedor_productos (
              id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
              categoria_contable, activo, orden_visual, created_at, updated_at, deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
              ppId, o.proveedor_id, it.producto, it.unidad || 'KG',
              cant, precio, it.categoria_contable || 'MERCANCIA',
              now, now
            );
          }
        }
      }

      // 6) Actualizar cabecera
      db.prepare(`UPDATE ordenes_compra SET
        fecha = ?, proveedor_id = ?, proveedor_nombre = ?,
        comprador_nombre = ?, metodo_pago = ?, caja_id = ?, caja_nombre = ?,
        monto_estimado = ?, monto_entregado = ?,
        mov_salida_id = ?, observaciones = ?,
        updated_at = ?
        WHERE id = ?`).run(
        fecha, o.proveedor_id || null, o.proveedor_nombre,
        o.comprador_nombre || null, o.metodo_pago || 'EFECTIVO',
        o.caja_id, cajaNombre,
        montoEstimado, montoEntregado, movSalidaId,
        o.observaciones || null,
        now, orden.id
      );
    });

    try {
      tx();
      audit(req, 'update', 'orden_compra', orden.id, JSON.stringify({
        proveedor: o.proveedor_nombre,
        monto_estimado: montoEstimado,
        monto_entregado: montoEntregado,
        items_count: o.items.length
      }));
      const ordenCompleta = getOrdenCompleta(orden.id);
      res.json({ ok: true, orden: ordenCompleta });
    } catch (e) {
      console.error('Error editando orden:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Cerrar orden: actualiza items con valores reales y decide modo de pago
  // body: { items: [...], pago_inmediato: bool, fecha_pago, caja_pago_id, metodo_pago,
  //         monto_pagar (si pago_inmediato), fecha_vencimiento (si crea CxP) }
  app.post('/api/ordenes/:id/cerrar', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'BORRADOR' && orden.estado !== 'EJECUTANDO') {
      return res.status(400).json({ error: 'Solo se pueden cerrar órdenes en BORRADOR' });
    }

    const body = req.body || {};
    const items = body.items || [];
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Debe enviar items con valores reales' });

    const now = Date.now();
    const fechaCierre = body.fecha_cierre || new Date().toISOString().slice(0, 10);

    // Calcular monto real
    let montoReal = 0;
    for (const it of items) {
      montoReal += Number(it.cantidad_real || 0) * Number(it.precio_real || 0);
    }
    montoReal = Math.round(montoReal * 100) / 100;

    // El anticipo ya está cubierto por mov_salida_id (descontado al crear)
    const anticipo = orden.monto_entregado || 0;
    const saldoPendiente = Math.max(0, montoReal - anticipo);
    const sobrante = anticipo > montoReal ? (anticipo - montoReal) : 0;

    const pagoInmediato = !!body.pago_inmediato;

    const tx = db.transaction(() => {
      let cxpIdCreada = null;
      let movPagoInmediatoId = null;
      let movDevolucionId = null;

      // ───── ACTUALIZAR ITEMS ─────
      for (const it of items) {
        const cantReal = Number(it.cantidad_real || 0);
        const precioReal = Number(it.precio_real || 0);
        const totalReal = cantReal * precioReal;
        const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
        if (!itemDb) continue;

        db.prepare(`UPDATE ordenes_compra_items SET
          cantidad_real = ?, precio_real = ?, total_real = ?,
          categoria_contable = ?, updated_at = ?
          WHERE id = ?`).run(
          cantReal, precioReal, totalReal,
          it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA',
          now, it.id
        );

        // Actualizar precio_actual del catálogo del proveedor si tiene precio real > 0
        if (orden.proveedor_id && precioReal > 0) {
          const productoCat = db.prepare(
            'SELECT id FROM proveedor_productos WHERE proveedor_id = ? AND LOWER(producto) = LOWER(?) AND deleted = 0'
          ).get(orden.proveedor_id, itemDb.producto);
          if (productoCat) {
            db.prepare(`UPDATE proveedor_productos SET
              precio_actual = ?, ultimo_precio_orden_id = ?, ultimo_precio_fecha = ?,
              cantidad_default = CASE WHEN cantidad_default = 0 THEN ? ELSE cantidad_default END,
              updated_at = ?
              WHERE id = ?`).run(
              precioReal, orden.id, fechaCierre, cantReal, now, productoCat.id
            );
          } else {
            // Crear si no existía (puede pasar si la orden se creó sin proveedor_id y se asignó después)
            const ppId = newId('pp-');
            db.prepare(`INSERT INTO proveedor_productos (
              id, proveedor_id, producto, unidad, cantidad_default, precio_actual,
              ultimo_precio_orden_id, ultimo_precio_fecha,
              categoria_contable, activo, orden_visual, created_at, updated_at, deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 99, ?, ?, 0)`).run(
              ppId, orden.proveedor_id, itemDb.producto, itemDb.unidad || 'KG',
              cantReal, precioReal, orden.id, fechaCierre,
              it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA',
              now, now
            );
          }
        }
      }

      // ───── SOBRANTE: si anticipo > total real, devolver dinero a la caja ─────
      if (sobrante > 0.01) {
        movDevolucionId = newId('m-ord-dev-');
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'INGRESO', 'OTROS INGRESOS', ?, ?, 'EFECTIVO', ?, ?, ?, ?, 'compra-dev', ?, ?, ?, 0)`).run(
          movDevolucionId, fechaCierre,
          `Devolución compra ${orden.proveedor_nombre}`,
          sobrante, orden.caja_id, req.user.nombre,
          `Sobró dinero del anticipo de orden ${orden.id}`,
          req.user.id, orden.id, now, now
        );
      }

      // ───── DECIDIR ESTADO FINAL Y CÓMO MANEJAR EL SALDO ─────
      let estadoFinal = 'PENDIENTE_PAGO';
      let movItemsCreados = [];

      if (saldoPendiente < 0.01) {
        // No hay saldo pendiente (anticipo cubrió todo)
        // Crear movs por item para el desglose contable, descontando del mov_salida_id (lo borramos y creamos los específicos)
        if (orden.mov_salida_id) {
          db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
        }
        // Crear movs por item al monto real
        for (const it of items) {
          const cantReal = Number(it.cantidad_real || 0);
          const precioReal = Number(it.precio_real || 0);
          const totalReal = cantReal * precioReal;
          if (totalReal <= 0) continue;
          const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
          if (!itemDb) continue;

          const movId = newId('m-ord-item-');
          const cat = it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA';
          db.prepare(`INSERT INTO movs (
            id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
            user_id, src, orden_id, created_at, updated_at, deleted
          ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, 0)`).run(
            movId, fechaCierre, cat,
            `${itemDb.producto} (${cantReal} ${itemDb.unidad}) · ${orden.proveedor_nombre}`,
            totalReal,
            orden.metodo_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO',
            orden.caja_id, req.user.nombre, `Orden ${orden.id}`,
            req.user.id, orden.id, now, now
          );
          db.prepare('UPDATE ordenes_compra_items SET mov_id = ? WHERE id = ?').run(movId, it.id);
          movItemsCreados.push(movId);
        }
        estadoFinal = 'PAGADA';
      } else if (pagoInmediato) {
        // PAGO INMEDIATO: pagar el saldo pendiente ahora mismo
        const cajaPago = body.caja_pago_id || orden.caja_id;
        const metodoPago = body.metodo_pago_pago || orden.metodo_pago || 'EFECTIVO';
        const fechaPago = body.fecha_pago || fechaCierre;
        const cajaPagoNombre = db.prepare('SELECT nombre FROM cajas WHERE id = ?').get(cajaPago)?.nombre || cajaPago;

        // Reversar mov de anticipo si había y reemplazar con movs por item
        if (orden.mov_salida_id) {
          db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.mov_salida_id);
        }

        // Crear movs por item al monto real (asignados a la caja del anticipo si había, o de pago si no)
        // Para mayor simplicidad: crear movs por item desde la caja del anticipo si había, o de la del pago
        // Si hubo anticipo en una caja y ahora pago en otra, los items van a la caja del anticipo (la mayoría del pago)
        const cajaDestino = anticipo > 0 ? orden.caja_id : cajaPago;
        const metodoDestino = anticipo > 0 ? orden.metodo_pago : metodoPago;

        for (const it of items) {
          const cantReal = Number(it.cantidad_real || 0);
          const precioReal = Number(it.precio_real || 0);
          const totalReal = cantReal * precioReal;
          if (totalReal <= 0) continue;
          const itemDb = db.prepare('SELECT * FROM ordenes_compra_items WHERE id = ? AND deleted = 0').get(it.id);
          if (!itemDb) continue;

          const movId = newId('m-ord-item-');
          const cat = it.categoria_contable || itemDb.categoria_contable || 'MERCANCIA';
          db.prepare(`INSERT INTO movs (
            id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
            user_id, src, orden_id, created_at, updated_at, deleted
          ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, 0)`).run(
            movId, fechaPago, cat,
            `${itemDb.producto} (${cantReal} ${itemDb.unidad}) · ${orden.proveedor_nombre}`,
            totalReal, metodoDestino,
            cajaDestino, req.user.nombre, `Orden ${orden.id}`,
            req.user.id, orden.id, now, now
          );
          db.prepare('UPDATE ordenes_compra_items SET mov_id = ? WHERE id = ?').run(movId, it.id);
          movItemsCreados.push(movId);
        }

        // Si la caja del pago es distinta a la del anticipo, necesitamos compensar:
        // El anticipo descontó X de cajaAnticipo, ahora los items descontaron monto_real de cajaDestino
        // Si pago_inmediato y se eligió otra caja, hay que ajustar
        if (anticipo > 0 && cajaPago !== orden.caja_id && saldoPendiente > 0) {
          // Crear "transferencia interna": INGRESO en caja_anticipo + GASTO en caja_pago por el saldo
          const tId = newId('m-ord-trans-');
          // No es necesario: cada mov por item ya descontó de cajaDestino el monto correspondiente
          // El neto en cajaAnticipo (que perdió el anticipo) es -anticipo
          // El neto en cajaDestino (que perdió los items) es -monto_real
          // Esto suma -anticipo - monto_real lo cual es DOBLE GASTO
          // Necesitamos reversar el anticipo de cajaAnticipo y crear un mov en cajaDestino por monto_real solamente
          // (Pero ya borramos mov_salida_id arriba)... aceptemos esta limitación: cuando hay anticipo en otra caja,
          // forzar que pago_inmediato sea desde la misma caja del anticipo.
        }

        estadoFinal = 'PAGADA';
      } else {
        // CREAR CxP: el saldo pendiente queda como cuenta por pagar vinculada
        // Si había anticipo: los movs por anticipo se mantienen y registramos la CxP solo por el saldo
        // Si NO había anticipo: no se mueve caja, solo se crea la CxP por el total real
        
        const cxpId = newId('cxp-');
        cxpIdCreada = cxpId;
        
        // Determinar categoría de la CxP (la mayoría usada en items)
        const catCount = {};
        for (const it of items) {
          const c = it.categoria_contable || 'MERCANCIA';
          catCount[c] = (catCount[c] || 0) + Number(it.cantidad_real || 0) * Number(it.precio_real || 0);
        }
        const catPrincipal = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || 'MERCANCIA';

        const conceptoCxp = `Compra ${orden.proveedor_nombre} · Orden ${orden.id.split('-').pop()}`;
        const fechaVenc = body.fecha_vencimiento || null;

        // Buscar o crear tercero (proveedor)
        let terceroId = orden.proveedor_id;
        if (!terceroId && orden.proveedor_nombre) {
          const existente = db.prepare("SELECT id FROM terceros WHERE LOWER(nombre) = LOWER(?) AND tipo = 'PROVEEDOR' AND deleted = 0").get(orden.proveedor_nombre);
          if (existente) {
            terceroId = existente.id;
          } else {
            terceroId = newId('t-');
            db.prepare(`INSERT INTO terceros (id, tipo, nombre, categoria_sugerida, activo, updated_at, deleted)
                        VALUES (?, 'PROVEEDOR', ?, ?, 1, ?, 0)`).run(
              terceroId, orden.proveedor_nombre, catPrincipal, now
            );
          }
        }

        // Crear la CxP por el SALDO PENDIENTE (no por el total, porque el anticipo ya está cubierto)
        // cxp.categoria_id guarda el ID de la categoría (así la lee la vista de CxP);
        // catPrincipal es el nombre → se resuelve contra cats (null si no existe).
        const catPrincipalId = db.prepare("SELECT id FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0")
          .get(catPrincipal)?.id || null;
        db.prepare(`INSERT INTO cxp (
          id, direccion, tercero_id, tercero_nombre, concepto, categoria_id,
          monto_total, fecha_creacion, fecha_vencimiento, estado, observaciones,
          user_id, user_nombre, updated_at, deleted
        ) VALUES (?, 'PAGAR', ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, 0)`).run(
          cxpId, terceroId, orden.proveedor_nombre, conceptoCxp, catPrincipalId,
          Math.round(saldoPendiente * 100) / 100, fechaCierre, fechaVenc,
          `Vinculada a orden ${orden.id}` + (body.observaciones ? ' · ' + body.observaciones : ''),
          req.user.id, req.user.nombre, now
        );

        // Estado final: si hubo anticipo, la orden tiene "parte pagada" pero la CxP también... cuidado con dobles cargos
        // Solución: cuando hay anticipo + CxP, los movs por item NO se crean al cerrar (se crearán cuando se pague la CxP)
        // El anticipo se mantiene como mov_salida_id (un GASTO genérico "Anticipo a PORVENIR")
        // Cuando se complete el pago de la CxP, ahí se crearán los movs por item con desglose

        estadoFinal = 'PENDIENTE_PAGO';
      }

      // ───── ACTUALIZAR ORDEN ─────
      db.prepare(`UPDATE ordenes_compra SET
        monto_real = ?, ajuste = ?, estado = ?,
        mov_ajuste_id = ?, cxp_id = ?, observaciones = COALESCE(?, observaciones),
        fecha_cierre = ?, updated_at = ?
        WHERE id = ?`).run(
        montoReal, montoReal - anticipo, estadoFinal,
        movDevolucionId, cxpIdCreada,
        body.observaciones || null, fechaCierre, now, orden.id
      );

      return { estadoFinal, cxpIdCreada, movDevolucionId, movItemsCreados };
    });

    try {
      const result = tx();
      audit(req, 'cerrar', 'orden_compra', orden.id, JSON.stringify({
        proveedor: orden.proveedor_nombre,
        monto_real: montoReal,
        estado: result.estadoFinal,
        pago_inmediato: pagoInmediato,
        cxp_creada: result.cxpIdCreada
      }));
      const ordenCompleta = getOrdenCompleta(orden.id);
      res.json({ ok: true, orden: ordenCompleta, ...result });
    } catch (e) {
      console.error('Error cerrando orden:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Pagar una orden PENDIENTE_PAGO (registra abono y mueve caja)
  // body: { caja_id, monto, fecha, metodo }
  app.post('/api/ordenes/:id/pagar', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'PENDIENTE_PAGO') {
      return res.status(400).json({ error: 'Solo se pueden pagar órdenes en estado PENDIENTE_PAGO' });
    }
    if (!orden.cxp_id) {
      return res.status(400).json({ error: 'Orden sin CxP vinculada' });
    }

    const body = req.body || {};
    const monto = Number(body.monto || 0);
    if (monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!body.caja_id) return res.status(400).json({ error: 'Falta caja' });

    // Verificar saldo de la CxP
    const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(orden.cxp_id);
    if (!cxp) return res.status(404).json({ error: 'CxP vinculada no encontrada' });
    const yaAbonado = db.prepare("SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0").get(orden.cxp_id).t;
    const saldo = cxp.monto_total - yaAbonado;
    if (monto > saldo + 0.01) {
      return res.status(400).json({ error: `Monto excede el saldo pendiente (${saldo.toFixed(2)})` });
    }

    const now = Date.now();
    const fecha = body.fecha || new Date().toISOString().slice(0, 10);
    const cajaInfo = db.prepare('SELECT nombre FROM cajas WHERE id = ? AND deleted = 0').get(body.caja_id);
    if (!cajaInfo) return res.status(400).json({ error: 'Caja no encontrada' });

    const tx = db.transaction(() => {
      // Crear abono en cxp_abonos
      const abonoId = newId('ab-');
      
      // Items de la orden para desglosar el gasto contablemente
      const items = db.prepare('SELECT * FROM ordenes_compra_items WHERE orden_id = ? AND deleted = 0').all(orden.id);
      const totalItems = items.reduce((s, it) => s + (it.total_real || 0), 0);
      
      // Crear mov(s) por item proporcionalmente al pago
      // Estrategia: si paga 100% del saldo y NO hay anticipo: crear movs por item completos
      // Si paga parcial: crear UN mov genérico a la categoría más usada (más simple)
      
      const esPagoTotal = Math.abs(monto - saldo) < 0.01;
      const pagosAnteriores = yaAbonado > 0;
      
      let movGenericoId = null;
      
      if (esPagoTotal && !pagosAnteriores && (orden.monto_entregado || 0) === 0) {
        // Pago único total sin anticipo: crear movs por item específicos
        for (const it of items) {
          if (!it.total_real || it.total_real <= 0) continue;
          const movId = newId('m-ord-pago-');
          db.prepare(`INSERT INTO movs (
            id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
            user_id, src, orden_id, abono_id, created_at, updated_at, deleted
          ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, 'compra-item', ?, ?, ?, ?, 0)`).run(
            movId, fecha, it.categoria_contable || 'MERCANCIA',
            `${it.producto} (${it.cantidad_real} ${it.unidad}) · ${orden.proveedor_nombre}`,
            it.total_real,
            body.metodo || 'EFECTIVO', body.caja_id, req.user.nombre,
            `Pago orden ${orden.id}`,
            req.user.id, orden.id, abonoId, now, now
          );
        }
        // Mov genérico solo de referencia para el abono (mismo del primer item)
        movGenericoId = db.prepare('SELECT id FROM movs WHERE orden_id = ? AND src = ? AND deleted = 0 ORDER BY created_at ASC LIMIT 1')
          .get(orden.id, 'compra-item')?.id || null;
      } else {
        // Pago parcial o con anticipo previo: crear UN mov genérico
        // Determinar categoría más usada
        const catCount = {};
        items.forEach(it => {
          const c = it.categoria_contable || 'MERCANCIA';
          catCount[c] = (catCount[c] || 0) + (it.total_real || 0);
        });
        const catPrincipal = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || 'MERCANCIA';
        
        movGenericoId = newId('m-ord-pago-');
        db.prepare(`INSERT INTO movs (
          id, fecha, tipo, categoria, concepto, monto, metodo, caja, usuario, notas,
          user_id, src, orden_id, abono_id, created_at, updated_at, deleted
        ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          movGenericoId, fecha, catPrincipal,
          `Pago a ${orden.proveedor_nombre} · Orden ${orden.id.split('-').pop()}${esPagoTotal ? ' (TOTAL)' : ' (parcial)'}`,
          monto, body.metodo || 'EFECTIVO', body.caja_id, req.user.nombre,
          `Abono a orden ${orden.id}`,
          req.user.id, 'compra-pago', orden.id, abonoId, now, now
        );
      }

      // Crear abono en cxp_abonos
      db.prepare(`INSERT INTO cxp_abonos (
        id, cxp_id, monto, fecha, metodo, caja_id, caja_nombre, mov_id, notas,
        user_id, user_nombre, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        abonoId, orden.cxp_id, monto, fecha,
        body.metodo || 'EFECTIVO', body.caja_id, cajaInfo.nombre, movGenericoId,
        body.observaciones || null, req.user.id, req.user.nombre, now
      );

      // Recalcular estado de CxP
      const nuevoAbonado = yaAbonado + monto;
      const saldoNuevo = cxp.monto_total - nuevoAbonado;
      const nuevoEstadoCxP = saldoNuevo < 0.01 ? 'PAGADA' : (nuevoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE');
      db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstadoCxP, now, orden.cxp_id);

      // Si CxP queda PAGADA → orden también PAGADA
      let estadoOrdenFinal = 'PENDIENTE_PAGO';
      if (nuevoEstadoCxP === 'PAGADA') {
        estadoOrdenFinal = 'PAGADA';
        db.prepare("UPDATE ordenes_compra SET estado = 'PAGADA', updated_at = ? WHERE id = ?").run(now, orden.id);
      }

      return { abonoId, movGenericoId, estadoOrdenFinal, saldoNuevo };
    });

    try {
      const result = tx();
      audit(req, 'pagar', 'orden_compra', orden.id, JSON.stringify({
        proveedor: orden.proveedor_nombre,
        monto,
        saldo_restante: result.saldoNuevo,
        estado: result.estadoOrdenFinal
      }));
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('Error pagando orden:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Cancelar orden (reversa total)
  app.post('/api/ordenes/:id/cancelar', auth, requirePin, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado === 'CANCELADA') return res.status(400).json({ error: 'Ya está cancelada' });

    const now = Date.now();
    const tx = db.transaction(() => {
      // Marcar todos los movs asociados como deleted
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE orden_id = ? AND deleted = 0').run(now, orden.id);
      // Si tenía CxP (PENDIENTE_PAGO): revertir sus abonos —también los hechos desde
      // la vista de CxP, cuyo mov no lleva orden_id— y dejar la cuenta CANCELADA.
      if (orden.cxp_id) {
        const abonos = db.prepare('SELECT id, mov_id FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').all(orden.cxp_id);
        for (const ab of abonos) {
          db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE (id = ? OR abono_id = ?) AND deleted = 0').run(now, ab.mov_id, ab.id);
          db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.id);
        }
        db.prepare("UPDATE cxp SET estado = 'CANCELADA', updated_at = ? WHERE id = ?").run(now, orden.cxp_id);
      }
      // Marcar items como deleted
      db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);
      // Marcar orden como cancelada
      db.prepare("UPDATE ordenes_compra SET estado = 'CANCELADA', updated_at = ? WHERE id = ?").run(now, orden.id);
    });

    try {
      tx();
      audit(req, 'cancelar', 'orden_compra', orden.id, JSON.stringify({ proveedor: orden.proveedor_nombre }));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Eliminar orden (DELETE total, requiere PIN)
  app.delete('/api/ordenes/:id', auth, requirePin, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const orden = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    const now = Date.now();
    const tx = db.transaction(() => {
      // Revertir todos los movs asociados a la orden
      const movs = db.prepare('SELECT id FROM movs WHERE orden_id = ? AND deleted = 0').all(orden.id);
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE orden_id = ? AND deleted = 0').run(now, orden.id);

      // Si la orden tiene CxP vinculada, borrarla también (con sus abonos)
      let cxpBorrada = null;
      if (orden.cxp_id) {
        const abonos = db.prepare('SELECT id, mov_id FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').all(orden.cxp_id);
        for (const ab of abonos) {
          if (ab.mov_id) {
            db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.mov_id);
          }
          db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.id);
        }
        db.prepare('UPDATE cxp SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.cxp_id);
        cxpBorrada = orden.cxp_id;
      }

      db.prepare('UPDATE ordenes_compra_items SET deleted = 1, updated_at = ? WHERE orden_id = ?').run(now, orden.id);
      db.prepare('UPDATE ordenes_compra SET deleted = 1, updated_at = ? WHERE id = ?').run(now, orden.id);
      return { movs_revertidos: movs.length, cxp_borrada: cxpBorrada };
    });

    try {
      const result = tx();
      audit(req, 'delete', 'orden_compra', orden.id, JSON.stringify({
        proveedor: orden.proveedor_nombre, ...result
      }));
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Resumen / KPIs
  app.get('/api/ordenes/stats/resumen', auth, (req, res) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const inicioMes = hoy.slice(0, 8) + '01';

    const hoyStats = db.prepare(`SELECT 
      COUNT(*) as total, 
      COALESCE(SUM(monto_entregado), 0) as entregado,
      COALESCE(SUM(monto_real), 0) as real
      FROM ordenes_compra WHERE fecha = ? AND deleted = 0`).get(hoy);

    const mesStats = db.prepare(`SELECT 
      COUNT(*) as total, 
      COALESCE(SUM(monto_real), 0) as real
      FROM ordenes_compra WHERE fecha >= ? AND deleted = 0`).get(inicioMes);

    // Pendientes de pago (PENDIENTE_PAGO state)
    const pendientesPago = db.prepare(`SELECT 
      COUNT(*) as n,
      COALESCE(SUM(monto_real - monto_entregado), 0) as total
      FROM ordenes_compra WHERE estado = 'PENDIENTE_PAGO' AND deleted = 0`).get();

    // Borradores (sin cerrar)
    const borradores = db.prepare(`SELECT COUNT(*) as n 
      FROM ordenes_compra WHERE estado = 'BORRADOR' AND deleted = 0`).get().n;

    res.json({
      hoy: { total: hoyStats.total, entregado: hoyStats.entregado, real: hoyStats.real },
      mes: { total: mesStats.total, real: mesStats.real },
      pendientes_pago: { count: pendientesPago.n, total: pendientesPago.total },
      borradores
    });
  });
};
