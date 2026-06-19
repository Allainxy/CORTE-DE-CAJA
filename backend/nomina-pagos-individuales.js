// ============================================================================
// K-BOTANAS · Feature F1 · nomina-pagos-individuales.js
// ============================================================================
// Endpoints para pago individual de nómina (algunos empleados se pagan
// viernes, otros sábados). Permite marcar pagos uno por uno sin necesidad
// de cerrar el periodo completo.
//
// Endpoints:
//   POST /api/nomina/pagos/:id/pagar               — marca como pagado + crea mov GASTO
//   POST /api/nomina/pagos/:id/desmarcar-pagado    — reversa: soft-delete mov, desmarcar
//
// Cuando se llame al endpoint global "cerrar y pagar" (no provisto aquí),
// éste debe respetar la columna `pagado` (saltarse los ya pagados).
// El patch para ese endpoint está en patch-cerrar-periodo.js.
// ============================================================================

module.exports = function mountNominaPagosIndividuales(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  if (typeof auth !== 'function') throw new Error('requireAuth requerido');
  const log = opts.log || (() => {});

  // Helper: nuevo id de mov para nomina (consistente con server.js)
  const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));
  function newMovId() {
    return newId('m-nom-');
  }
  function newAbonoId() {
    return newId('ab-');
  }
  function hoyISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // ==========================================================================
  // POST /api/nomina/pagos/:id/pagar
  // Body opcional: { caja_id, observaciones }
  // ==========================================================================
  app.post('/api/nomina/pagos/:id/pagar', auth, (req, res) => {
    const tx = db.transaction((pagoId) => {
      const pago = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(pagoId);
      if (!pago) { const e = new Error('Pago no existe'); e.status = 404; throw e; }
      if (pago.pagado === 1) throw new Error('Este pago ya está marcado como pagado');
      if (Number(pago.total) <= 0) throw new Error('El total del pago debe ser mayor a $0');

      const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(pago.periodo_id);
      if (!periodo) throw new Error('Periodo no existe');
      if (periodo.estado === 'CERRADO') throw new Error('Periodo ya cerrado — no se pueden pagar más');

      // Caja: usar la del body si viene, sino la del pago
      const cajaId = (req.body && req.body.caja_id) ? String(req.body.caja_id) : pago.caja_id;
      const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaId);
      if (!caja) throw new Error('Caja no existe o está eliminada');

      const obs = (req.body && req.body.observaciones) ? String(req.body.observaciones).trim() : '';
      const now = Date.now();
      const usuario = (req.user && req.user.nombre) || 'sistema';
      const userId  = (req.user && req.user.id) || null;
      // HOTFIX_BUG1_FECHA_HOY — el mov refleja cuándo el dinero sale realmente de la caja (hoy),
      // no la fecha_pago oficial del periodo. fechaPago se conserva para auditoría/reportes.
      const fechaPago = periodo.fecha_pago || hoyISO();
      const fechaMov  = hoyISO(); // HOTFIX_BUG1_FECHA_HOY

      // Crear mov GASTO por el TOTAL
      const movId = newMovId();
      const concepto = `Nómina ${periodo.fecha_inicio} · ${pago.empleado_nombre}` + (obs ? ` · ${obs}` : '');
      const notas = `Pago individual · Neto ${pago.neto} + Comis ${pago.comisiones} - Abono ${pago.prestamos_abonados}`;

      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'nomina', ?, ?, 0)`).run(
        movId, fechaMov, pago.categoria_nomina, concepto, Number(pago.total),
        cajaId, usuario, notas, userId, now
      ); // HOTFIX_BUG1_FECHA_HOY

      // Aplicar abonos a préstamos activos (mismo flujo que el cerrar)
      let abonosAplicados = 0;
      if ((Number(pago.prestamos_abonados) || 0) > 0 && pago.empleado_id) {
        let remanente = Number(pago.prestamos_abonados);
        const prestamosActivos = db.prepare(`SELECT * FROM prestamos
          WHERE empleado_id = ? AND estado = 'ACTIVO' AND deleted = 0
          ORDER BY fecha ASC`).all(pago.empleado_id);
        for (const pr of prestamosActivos) {
          if (remanente <= 0) break;
          const aAbonar = Math.min(remanente, Number(pr.saldo_actual) || 0);
          if (aAbonar <= 0) continue;
          db.prepare(`INSERT INTO prestamos_abonos
            (id, prestamo_id, periodo_id, fecha, monto, metodo, caja_id, comentario, usuario, user_id, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, 'DESCUENTO_NOMINA', NULL, ?, ?, ?, ?, 0)
          `).run(newAbonoId(), pr.id, pago.periodo_id, fechaMov, aAbonar,
            `Descuento en pago individual · ${periodo.fecha_inicio}`, usuario, userId, now); // HOTFIX_BUG1_FECHA_HOY
          const nuevoSaldo = Number(pr.saldo_actual) - aAbonar;
          const nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
          db.prepare(`UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?`)
            .run(nuevoSaldo, nuevoEstado, nuevoEstado === 'SALDADO' ? fechaMov : null, now, pr.id); // HOTFIX_BUG1_FECHA_HOY
          remanente -= aAbonar;
          abonosAplicados++;
        }
      }

      // Actualizar pago
      db.prepare(`UPDATE nominas_pagos SET
        pagado = 1, pagado_at = ?, pagado_por = ?, mov_id = ?, caja_id = ?, updated_at = ?
        WHERE id = ?`).run(now, usuario, movId, cajaId, now, pagoId);

      // Audit
      if (typeof opts.audit === 'function') {
        opts.audit(req, 'PAGAR_INDIVIDUAL', 'nominas_pagos', pagoId,
          `${pago.empleado_nombre} · $${pago.total} · Caja ${caja.nombre}${abonosAplicados ? ` · ${abonosAplicados} abono(s) a préstamo` : ''}`);
      }

      return {
        ok: true,
        pago: db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(pagoId),
        mov_id: movId,
        abonos_aplicados: abonosAplicados,
      };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) {
      log('[f1-pagar]', e.message);
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  // ==========================================================================
  // POST /api/nomina/pagos/:id/desmarcar-pagado
  // Body opcional: { motivo }
  // ==========================================================================
  app.post('/api/nomina/pagos/:id/desmarcar-pagado', auth, (req, res) => {
    const tx = db.transaction((pagoId) => {
      const pago = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(pagoId);
      if (!pago) { const e = new Error('Pago no existe'); e.status = 404; throw e; }
      if (pago.pagado !== 1) throw new Error('Este pago no está marcado como pagado');

      const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(pago.periodo_id);
      if (!periodo) throw new Error('Periodo no existe');
      if (periodo.estado === 'CERRADO') throw new Error('Periodo cerrado — no se puede desmarcar');

      const now = Date.now();
      const motivo = (req.body && req.body.motivo) ? String(req.body.motivo).slice(0, 200) : '';

      // Soft-delete del mov GASTO
      let movDeleted = false;
      if (pago.mov_id) {
        const r = db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pago.mov_id);
        movDeleted = r.changes > 0;
      }

      // Resetear estado del pago
      db.prepare(`UPDATE nominas_pagos SET
        pagado = 0, pagado_at = NULL, pagado_por = NULL, mov_id = NULL, updated_at = ?
        WHERE id = ?`).run(now, pagoId);

      // NOTA: NO se reversan automáticamente los abonos a préstamos.
      // Si había abonos, el usuario debe revertirlos manualmente desde el módulo Préstamos.
      // (Reversa automática sería frágil — el usuario podría haber hecho otros movimientos
      // entre el pago y el desmarcado).
      let huboAbonosPotenciales = (Number(pago.prestamos_abonados) || 0) > 0;

      if (typeof opts.audit === 'function') {
        opts.audit(req, 'DESMARCAR_PAGADO', 'nominas_pagos', pagoId,
          `${pago.empleado_nombre} · revertir $${pago.total}${motivo ? ` · motivo: ${motivo}` : ''}${huboAbonosPotenciales ? ' · ⚠️ tenía abonos a préstamos' : ''}`);
      }

      return {
        ok: true,
        pago: db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(pagoId),
        mov_soft_deleted: movDeleted,
        advertencia_abonos: huboAbonosPotenciales
          ? 'Este pago tenía abonos a préstamos por $' + pago.prestamos_abonados + '. Revisa el módulo Préstamos para revertirlos manualmente.'
          : null,
      };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) {
      log('[f1-desmarcar]', e.message);
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  log('[nomina-pagos-individuales] endpoints montados: POST /api/nomina/pagos/:id/pagar · POST .../desmarcar-pagado');
};
