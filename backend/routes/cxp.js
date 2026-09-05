// ============================================================================
// routes/cxp.js — Cuentas por Pagar / Cobrar (CxP / CxC), facturas y abonos.
// Extraído de server.js (#6), bloque "CUENTAS POR PAGAR / COBRAR" (helpers +
// rutas VERBATIM). Patrón mount*(app, db, opts) igual que catalogo.js /
// ventas-cierres-dia.js / nomina-extensions.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, log }
// Rutas que monta:
//   GET    /api/cxp                  lista (filtros: direccion, estado, tercero_id, desde, hasta, limit)
//   GET    /api/cxp/:id              detalle + facturas + abonos
//   POST   /api/cxp                  crear cuenta (+ facturas y abono_inicial opcionales)
//   PUT    /api/cxp/:id              editar cuenta
//   DELETE /api/cxp/:id              borrar cuenta (PIN, admin/gerente) revirtiendo abonos y movs
//   POST   /api/cxp/:id/facturas     agregar factura a una cuenta
//   DELETE /api/cxp/facturas/:id     borrar factura
//   POST   /api/cxp/:id/abonos       registrar abono (crea mov en caja, src='cxp')
//   DELETE /api/cxp/abonos/:id       borrar abono (PIN) revirtiendo su mov
//   GET    /api/cxp/stats/resumen    resumen para Dashboard (PAGAR / COBRAR)
// Helpers internos: calcularEstado, enrichCxp, crearAbonoInterno.
// ============================================================================
module.exports = function mountCxp(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const log = opts.log || (() => {});

  // ===========================================================
  // ============= CUENTAS POR PAGAR / COBRAR ==================
  // ===========================================================
  function calcularEstado(cxpId) {
    const cxp = db.prepare('SELECT monto_total, estado FROM cxp WHERE id = ?').get(cxpId);
    if (!cxp) return 'PENDIENTE';
    if (cxp.estado === 'CANCELADA') return 'CANCELADA';
    const sumaAbonos = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxpId).total;
    const saldo = Math.round((cxp.monto_total - sumaAbonos) * 100) / 100;
    if (saldo <= 0.01) return 'PAGADA';
    if (sumaAbonos > 0) return 'PARCIAL';
    return 'PENDIENTE';
  }

  function enrichCxp(cxp) {
    const sumaAbonos = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxp.id).total;
    cxp.pagado = Math.round(sumaAbonos * 100) / 100;
    cxp.saldo = Math.round((cxp.monto_total - sumaAbonos) * 100) / 100;
    // Días al vencimiento
    if (cxp.fecha_vencimiento) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const v = new Date(cxp.fecha_vencimiento + 'T12:00:00');
      cxp.dias_para_vencer = Math.floor((v - hoy) / (1000 * 60 * 60 * 24));
    }
    return cxp;
  }

  app.get('/api/cxp', auth, (req, res) => {
    const { direccion, estado, tercero_id, desde, hasta, limit } = req.query;
    let sql = 'SELECT * FROM cxp WHERE deleted = 0';
    const params = [];
    if (direccion) { sql += ' AND direccion = ?'; params.push(direccion); }
    if (estado && estado !== 'all') { sql += ' AND estado = ?'; params.push(estado); }
    if (tercero_id && tercero_id !== 'all') { sql += ' AND tercero_id = ?'; params.push(tercero_id); }
    if (desde) { sql += ' AND fecha_creacion >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND fecha_creacion <= ?'; params.push(hasta); }
    sql += ' ORDER BY fecha_creacion DESC, updated_at DESC LIMIT ?';
    params.push(parseInt(limit) || 500);
    const cuentas = db.prepare(sql).all(...params);
    cuentas.forEach(enrichCxp);
    res.json({ cxp: cuentas });
  });

  app.get('/api/cxp/:id', auth, (req, res) => {
    const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!cxp) return res.status(404).json({ error: 'No encontrada' });
    enrichCxp(cxp);
    cxp.facturas = db.prepare('SELECT * FROM cxp_facturas WHERE cxp_id = ? AND deleted = 0 ORDER BY fecha DESC').all(req.params.id);
    cxp.abonos = db.prepare('SELECT * FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0 ORDER BY fecha DESC, updated_at DESC').all(req.params.id);
    res.json({ cxp });
  });

  app.post('/api/cxp', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const {
      direccion, tercero_id, tercero_nombre, concepto, categoria_id,
      monto_total, fecha_creacion, fecha_vencimiento, observaciones,
      facturas, abono_inicial
    } = req.body || {};

    if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'Concepto requerido' });
    const dir = (direccion === 'COBRAR') ? 'COBRAR' : 'PAGAR';
    const monto = parseFloat(monto_total);
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const id = newId('cxp-');
    const now = Date.now();
    const fc = fecha_creacion || new Date().toISOString().slice(0, 10);

    // Resolver tercero
    let tId = tercero_id || null;
    let tNombre = tercero_nombre || '';
    if (tId) {
      const t = db.prepare('SELECT id, nombre FROM terceros WHERE id = ? AND deleted = 0').get(tId);
      if (t) tNombre = t.nombre;
      else tId = null;
    }

    db.prepare(`INSERT INTO cxp (
      id, direccion, tercero_id, tercero_nombre, concepto, categoria_id,
      monto_total, fecha_creacion, fecha_vencimiento, estado, observaciones,
      user_id, user_nombre, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, 0)`).run(
      id, dir, tId, tNombre || null,
      concepto.trim(), categoria_id || null,
      monto, fc,
      fecha_vencimiento || null,
      (observaciones || '').slice(0, 1000),
      req.user.id, req.user.nombre,
      now
    );

    // Facturas iniciales (opcional)
    if (Array.isArray(facturas)) {
      facturas.forEach(f => {
        if (!f || !f.monto) return;
        const fid = newId('fac-');
        db.prepare(`INSERT INTO cxp_facturas (id, cxp_id, numero, uuid, fecha, monto, notas, updated_at, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          fid, id,
          (f.numero || '').slice(0, 50) || null,
          (f.uuid || '').slice(0, 100) || null,
          f.fecha || fc,
          parseFloat(f.monto) || 0,
          (f.notas || '').slice(0, 300),
          now
        );
      });
    }

    // Abono inicial (opcional, crea mov en caja)
    if (abono_inicial && abono_inicial.monto > 0 && abono_inicial.caja_id) {
      try {
        crearAbonoInterno(req, id, abono_inicial, dir);
      } catch (e) {
        console.warn('Abono inicial falló:', e.message);
      }
    }

    // Recalcular estado
    const nuevoEstado = calcularEstado(id);
    db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, now, id);

    audit(req, 'create', 'cxp', id, JSON.stringify({ direccion: dir, concepto, monto }));
    res.json({ ok: true, id });
  });

  app.put('/api/cxp/:id', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!cxp) return res.status(404).json({ error: 'No encontrada' });

    const { concepto, categoria_id, monto_total, fecha_vencimiento, observaciones, estado } = req.body || {};

    // Validar que el nuevo monto no sea menor que lo ya abonado
    if (monto_total !== undefined) {
      const abonado = db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(req.params.id).t;
      if (parseFloat(monto_total) < abonado - 0.01) {
        return res.status(400).json({ error: `El monto no puede ser menor a lo ya abonado (${abonado})` });
      }
    }

    db.prepare(`UPDATE cxp SET
      concepto = COALESCE(?, concepto),
      categoria_id = COALESCE(?, categoria_id),
      monto_total = COALESCE(?, monto_total),
      fecha_vencimiento = COALESCE(?, fecha_vencimiento),
      observaciones = COALESCE(?, observaciones),
      estado = COALESCE(?, estado),
      updated_at = ?
      WHERE id = ?`).run(
      concepto ? concepto.trim() : null,
      categoria_id !== undefined ? (categoria_id || null) : null,
      monto_total !== undefined ? parseFloat(monto_total) : null,
      fecha_vencimiento !== undefined ? (fecha_vencimiento || null) : null,
      observaciones !== undefined ? (observaciones || '').slice(0, 1000) : null,
      estado || null,
      Date.now(),
      req.params.id
    );

    // Recalcular estado si no se forzó
    if (!estado) {
      const nuevoEstado = calcularEstado(req.params.id);
      db.prepare('UPDATE cxp SET estado = ? WHERE id = ?').run(nuevoEstado, req.params.id);
    }

    audit(req, 'update', 'cxp', req.params.id, JSON.stringify(req.body));
    res.json({ ok: true });
  });

  app.delete('/api/cxp/:id', auth, requirePin, (req, res) => {
    if (req.user.rol !== 'admin' && req.user.rol !== 'gerente') return res.status(403).json({ error: 'Sin permiso' });
    const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!cxp) return res.status(404).json({ error: 'No encontrada' });

    const abonos = db.prepare('SELECT id, mov_id FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').all(req.params.id);
    // Borrar todos los abonos y sus movs asociados
    abonos.forEach(ab => {
      if (ab.mov_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.mov_id);
      }
      db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.id);
    });
    // Borrar facturas
    db.prepare('UPDATE cxp_facturas SET deleted = 1, updated_at = ? WHERE cxp_id = ?').run(Date.now(), req.params.id);
    // Borrar cuenta
    db.prepare('UPDATE cxp SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);

    audit(req, 'delete', 'cxp', req.params.id, JSON.stringify({ concepto: cxp.concepto, abonos_borrados: abonos.length }));
    res.json({ ok: true, abonos_revertidos: abonos.length });
  });

  // ===========================================================
  // ============= FACTURAS DE UNA CUENTA ======================
  // ===========================================================
  app.post('/api/cxp/:id/facturas', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const cxp = db.prepare('SELECT id FROM cxp WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!cxp) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const { numero, uuid, fecha, monto, notas } = req.body || {};
    const m = parseFloat(monto);
    if (!m || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
    const id = newId('fac-');
    const now = Date.now();
    db.prepare(`INSERT INTO cxp_facturas (id, cxp_id, numero, uuid, fecha, monto, notas, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id, req.params.id,
      (numero || '').slice(0, 50) || null,
      (uuid || '').slice(0, 100) || null,
      fecha || new Date().toISOString().slice(0, 10),
      m,
      (notas || '').slice(0, 300),
      now
    );
    audit(req, 'create', 'cxp_factura', id, JSON.stringify({ cxp_id: req.params.id, monto: m }));
    res.json({ ok: true, id });
  });

  app.delete('/api/cxp/facturas/:id', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const f = db.prepare('SELECT id FROM cxp_facturas WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!f) return res.status(404).json({ error: 'No encontrada' });
    db.prepare('UPDATE cxp_facturas SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    audit(req, 'delete', 'cxp_factura', req.params.id, '');
    res.json({ ok: true });
  });

  // ===========================================================
  // ============= ABONOS (PAGOS/COBROS PARCIALES) =============
  // ===========================================================
  // Función interna reusable
  function crearAbonoInterno(req, cxpId, body, direccion) {
    const cxp = db.prepare('SELECT * FROM cxp WHERE id = ? AND deleted = 0').get(cxpId);
    if (!cxp) throw new Error('Cuenta no encontrada');

    const { fecha, monto, caja_id, factura_id, metodo, referencia, notas } = body;
    const m = parseFloat(monto);
    if (!m || m <= 0) throw new Error('Monto inválido');
    if (!caja_id) throw new Error('Caja requerida');

    const caja = db.prepare('SELECT id, nombre FROM cajas WHERE id = ? AND deleted = 0').get(caja_id);
    if (!caja) throw new Error('Caja no encontrada');

    // Validar saldo restante
    const yaAbonado = db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM cxp_abonos WHERE cxp_id = ? AND deleted = 0').get(cxpId).t;
    const saldoRest = cxp.monto_total - yaAbonado;
    if (m > saldoRest + 0.01) throw new Error(`Abono excede saldo restante (${saldoRest})`);

    const dir = direccion || cxp.direccion || 'PAGAR';
    const tipoMov = (dir === 'COBRAR') ? 'INGRESO' : 'GASTO';
    const conceptoMov = (dir === 'COBRAR' ? 'Cobro de: ' : 'Pago a: ') + (cxp.tercero_nombre || cxp.concepto);

    const abonoId = newId('abo-');
    const movId = newId('m-cxp-');
    const now = Date.now();
    const fechaUse = fecha || new Date().toISOString().slice(0, 10);

    // Crear mov vinculado (columnas: usar 'usuario', no 'user_nombre')
    db.prepare(`INSERT INTO movs (
      id, fecha, tipo, monto, categoria, concepto, caja, metodo, usuario, notas, src,
      user_id, cxp_id, abono_id, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cxp', ?, ?, ?, ?, 0)`).run(
      movId, fechaUse, tipoMov, m,
      cxp.categoria_id || '',
      conceptoMov + (referencia ? ` (${referencia})` : ''),
      caja_id,
      (metodo || 'EFECTIVO').slice(0, 20),
      req.user.nombre,
      (notas || '').slice(0, 300),
      req.user.id,
      cxpId, abonoId,
      now
    );

    // Crear abono
    db.prepare(`INSERT INTO cxp_abonos (
      id, cxp_id, factura_id, fecha, monto, caja_id, caja_nombre, mov_id,
      metodo, referencia, notas, user_id, user_nombre, updated_at, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      abonoId, cxpId,
      factura_id || null,
      fechaUse, m, caja_id, caja.nombre, movId,
      (metodo || 'EFECTIVO').slice(0, 20),
      (referencia || '').slice(0, 100),
      (notas || '').slice(0, 300),
      req.user.id, req.user.nombre, now
    );

    return { id: abonoId, mov_id: movId };
  }

  app.post('/api/cxp/:id/abonos', auth, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    try {
      const result = crearAbonoInterno(req, req.params.id, req.body || {}, null);
      // Recalcular estado
      const nuevoEstado = calcularEstado(req.params.id);
      db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, Date.now(), req.params.id);
      audit(req, 'create', 'abono', result.id, JSON.stringify({ cxp_id: req.params.id, monto: req.body.monto }));
      res.json({ ok: true, ...result, estado: nuevoEstado });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/cxp/abonos/:id', auth, requirePin, (req, res) => {
    if (req.user.rol === 'consulta') return res.status(403).json({ error: 'Sin permiso' });
    const ab = db.prepare('SELECT * FROM cxp_abonos WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!ab) return res.status(404).json({ error: 'Abono no encontrado' });

    // Borrar el mov asociado
    if (ab.mov_id) {
      db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), ab.mov_id);
    }
    // Borrar el abono
    db.prepare('UPDATE cxp_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    // Recalcular estado de la CxP padre
    const nuevoEstado = calcularEstado(ab.cxp_id);
    db.prepare('UPDATE cxp SET estado = ?, updated_at = ? WHERE id = ?').run(nuevoEstado, Date.now(), ab.cxp_id);

    audit(req, 'delete', 'abono', req.params.id, JSON.stringify({ cxp_id: ab.cxp_id, monto: ab.monto, mov_revertido: ab.mov_id }));
    res.json({ ok: true });
  });

  // Resumen para Dashboard
  app.get('/api/cxp/stats/resumen', auth, (req, res) => {
    const stats = {};
    ['PAGAR', 'COBRAR'].forEach(dir => {
      const cuentas = db.prepare(`SELECT * FROM cxp WHERE direccion = ? AND deleted = 0 AND estado != 'CANCELADA'`).all(dir);
      cuentas.forEach(enrichCxp);
      const pendientes = cuentas.filter(c => c.saldo > 0.01);
      const totalSaldo = pendientes.reduce((s, c) => s + c.saldo, 0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const vencidas = pendientes.filter(c => c.fecha_vencimiento && new Date(c.fecha_vencimiento + 'T12:00:00') < hoy);
      const proximas = pendientes.filter(c => c.fecha_vencimiento && c.dias_para_vencer >= 0 && c.dias_para_vencer <= 7);
      stats[dir] = {
        total_cuentas: pendientes.length,
        total_saldo: Math.round(totalSaldo * 100) / 100,
        vencidas: vencidas.length,
        proximas_7d: proximas.length,
      };
    });
    res.json({ stats });
  });
};
