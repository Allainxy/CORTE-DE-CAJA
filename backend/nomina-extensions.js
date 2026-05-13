// ============================================================================
// K-BOTANAS · nomina-extensions.js
// ============================================================================
// Módulo agregable a server.js que monta todos los endpoints nuevos:
//   T2: POST   /api/nomina/periodos/:id/sync-empleados
//   T3: PATCH  /api/ventas/mayoreo/:id/comisionista
//   T3: GET    /api/nomina/periodos/:id/comisionistas-mayoreo  (sugerencia 5%)
//   T4: GET    /api/comisiones-mensuales/periodos
//   T4: POST   /api/comisiones-mensuales/periodos
//   T4: GET    /api/comisiones-mensuales/periodos/:id
//   T4: PATCH  /api/comisiones-mensuales/pagos/:id
//   T4: POST   /api/comisiones-mensuales/periodos/:id/cerrar
//   T5: GET    /api/nomina/periodos/:id/export.xlsx
//   T5: GET    /api/nomina/periodos/:id/export.pdf
// ============================================================================
//
// USO en server.js — agregar 2 líneas antes de app.listen():
//
//   const mountNominaExtensions = require('./nomina-extensions');
//   mountNominaExtensions(app, db, { requireAuth, log });
//
// 'requireAuth' y 'log' son referencias al middleware de auth y logger existentes.
// Si tu middleware se llama diferente, ajusta la llamada.
// ============================================================================

const path = require('path');
const buildExcel = require('./nomina-exports-excel');
const buildPdf   = require('./nomina-exports-pdf');

function mountNominaExtensions(app, db, opts = {}) {
  const requireAuth = opts.requireAuth || ((req, res, next) => next());
  const log = opts.log || console.log;

  // Helpers: detect db API style (better-sqlite3 sync vs sqlite3 async-callback)
  // better-sqlite3: db.prepare(sql).get/all/run(...args) — SYNCHRONOUS
  // sqlite3:        db.get/all/run(sql, params, callback) — async callback
  const isBetterSqlite  = typeof db.prepare === 'function' && typeof db.all !== 'function';
  const isCallbackSqlite = typeof db.all === 'function';

  const get = (sql, params = []) => {
    if (isBetterSqlite) {
      const args = Array.isArray(params) ? params : [params];
      return Promise.resolve(db.prepare(sql).get(...args));
    }
    return new Promise((res, rej) =>
      db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
  };

  const all = (sql, params = []) => {
    if (isBetterSqlite) {
      const args = Array.isArray(params) ? params : [params];
      return Promise.resolve(db.prepare(sql).all(...args));
    }
    return new Promise((res, rej) =>
      db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
  };

  const run = (sql, params = []) => {
    if (isBetterSqlite) {
      const args = Array.isArray(params) ? params : [params];
      const result = db.prepare(sql).run(...args);
      return Promise.resolve({
        lastID:  result.lastInsertRowid,
        changes: result.changes,
      });
    }
    return new Promise((res, rej) =>
      db.run(sql, params, function (e) {
        e ? rej(e) : res({ lastID: this.lastID, changes: this.changes });
      }));
  };

  log(`[nomina-extensions] db API detectada: ${isBetterSqlite ? 'better-sqlite3 (sync)' : 'sqlite3 (callback)'}`);

  // ==========================================================================
  // T2 — SINCRONIZAR EMPLEADOS EN PERIODO ABIERTO
  // ==========================================================================
  app.post('/api/nomina/periodos/:id/sync-empleados', requireAuth, async (req, res) => {
    try {
      const periodoId = req.params.id;  // TEXT id: 'np-<ts>-<rand>'
      if (!periodoId) return res.status(400).json({ error: 'periodo_id inválido' });

      const periodo = await get('SELECT id, estado FROM nominas_periodos WHERE id = ?', [periodoId]);
      if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });
      if (String(periodo.estado || '').toLowerCase() !== 'abierto') {
        return res.status(400).json({ error: `Periodo en estado '${periodo.estado}', solo abiertos pueden sincronizarse` });
      }

      // Empleados activos NO incluidos en este periodo
      const faltantes = await all(`
        SELECT e.id, e.nombre, e.sueldo_base, e.tipo, e.departamento_id,
               d.nombre AS departamento_nombre
        FROM empleados e
        LEFT JOIN departamentos d ON d.id = e.departamento_id
        WHERE e.activo = 1 AND COALESCE(e.deleted, 0) = 0
          AND e.id NOT IN (
            SELECT empleado_id FROM nominas_pagos
            WHERE periodo_id = ? AND empleado_id IS NOT NULL
          )
        ORDER BY e.nombre
      `, [periodoId]);

      if (faltantes.length === 0) {
        return res.json({ added: 0, message: 'Ya están todos los empleados activos' });
      }

      // Tomamos la caja_id de un pago existente del periodo (todos comparten caja)
      const cajaExistente = await get(
        'SELECT caja_id FROM nominas_pagos WHERE periodo_id = ? LIMIT 1',
        [periodoId]
      );
      const cajaId = cajaExistente?.caja_id || 'caja-1778395283044-76'; // fallback: CAJA PRINCIPAL

      let added = 0;
      for (const emp of faltantes) {
        const pagoId = `npg-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}-${added}`;
        const categoria = `NOMINA ${(emp.departamento_nombre || 'GENERAL').toUpperCase()}`;
        // JSON con desglose vacío del mismo shape que usa el sistema
        const detalle = JSON.stringify({
          tipo: emp.tipo || 'PLANTA',
          vendedor_id: null,
          ventas_s1: 0, escalon: null, comision_base: 0,
          bono_meta: 0, ranking_pos: 0, ranking_bono: 0,
          bono_mensual: 0, total: 0,
        });
        const sueldoSemanal = (emp.sueldo_base || 0); // se asume "neto" = sueldo de la semana

        await run(`
          INSERT INTO nominas_pagos
            (id, periodo_id, empleado_id, empleado_nombre,
             departamento_id, departamento_nombre, categoria_nomina, caja_id,
             neto, comisiones, comisiones_detalle, prestamos_abonados, total,
             updated_at, deleted)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 0)
        `, [
          pagoId, periodoId, emp.id, emp.nombre,
          emp.departamento_id, emp.departamento_nombre, categoria, cajaId,
          sueldoSemanal, detalle, sueldoSemanal, Date.now()
        ]);
        added++;
      }

      log(`[nomina-sync] periodo ${periodoId}: +${added} empleados`);
      res.json({
        added,
        empleados: faltantes.map(e => ({ id: e.id, nombre: e.nombre })),
        message: `Se agregaron ${added} empleado(s) activos faltantes`
      });
    } catch (err) {
      log('[nomina-sync] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // T3 — COMISIONISTA EN VENTA MAYOREO
  // ==========================================================================
  // PATCH directo a la fila de venta (mayoreo) para asignar/cambiar comisionista
  app.patch('/api/ventas/mayoreo/:id/comisionista', requireAuth, async (req, res) => {
    try {
      const ventaId = req.params.id;  // TEXT id en tu sistema
      const { comisionista_empleado_id } = req.body;

      if (comisionista_empleado_id !== null && comisionista_empleado_id !== undefined && comisionista_empleado_id !== '') {
        const emp = await get('SELECT id, activo, deleted FROM empleados WHERE id = ?', [comisionista_empleado_id]);
        if (!emp || emp.deleted || !emp.activo) {
          return res.status(400).json({ error: 'Empleado inválido, inactivo o eliminado' });
        }
      }

      // Tabla detectada por install: 'ventas' (no 'ventas_mayoreo')
      const result = await run(
        'UPDATE ventas SET comisionista_empleado_id = ? WHERE id = ?',
        [comisionista_empleado_id || null, ventaId]
      );

      if (result.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
      res.json({ ok: true, id: ventaId, comisionista_empleado_id });
    } catch (err) {
      log('[mayoreo-comisionista] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET sugerencia de comisionistas mayoreo para un periodo de nómina (5% del total cobrado)
  app.get('/api/nomina/periodos/:id/comisionistas-mayoreo', requireAuth, async (req, res) => {
    try {
      const periodoId = req.params.id;  // TEXT id
      const periodo = await get(`
        SELECT id, fecha_inicio, fecha_fin, comisiones_desde, comisiones_hasta
        FROM nominas_periodos WHERE id = ?`, [periodoId]);
      if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

      // Semana de comisiones (S-1) — nombres reales de columnas
      const desde = periodo.comisiones_desde || periodo.fecha_inicio;
      const hasta = periodo.comisiones_hasta || periodo.fecha_fin;

      // Tabla real: 'ventas' con filtro canal='MAYOREO'
      // (Si tu schema usa otro nombre de canal, ajusta el WHERE)
      const rows = await all(`
        SELECT vm.comisionista_empleado_id AS empleado_id,
               e.nombre                     AS nombre,
               COUNT(*)                     AS ventas_count,
               SUM(COALESCE(vm.efectivo,0) + COALESCE(vm.transferencia,0)) AS total_cobrado,
               ROUND(SUM(COALESCE(vm.efectivo,0) + COALESCE(vm.transferencia,0)) * 0.05, 2) AS comision_5pct
        FROM ventas vm
        JOIN empleados e ON e.id = vm.comisionista_empleado_id
        WHERE vm.fecha >= ? AND vm.fecha <= ?
          AND vm.comisionista_empleado_id IS NOT NULL
          AND (vm.canal = 'MAYOREO' OR vm.canal = 'mayoreo')
          AND COALESCE(vm.deleted, 0) = 0
        GROUP BY vm.comisionista_empleado_id, e.nombre
        ORDER BY total_cobrado DESC
      `, [desde, hasta]);

      res.json({ periodo_id: periodoId, desde, hasta, comisionistas: rows });
    } catch (err) {
      log('[comisionistas-mayoreo] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // T4 — MÓDULO COMISIONES MENSUALES
  // ==========================================================================

  // Lista de periodos mensuales
  app.get('/api/comisiones-mensuales/periodos', requireAuth, async (req, res) => {
    try {
      const rows = await all(`
        SELECT p.*,
               (SELECT COUNT(*) FROM comisiones_mensuales_pagos WHERE periodo_id = p.id) AS pagos_count
        FROM comisiones_mensuales_periodos p
        ORDER BY p.year_month DESC
      `);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Crear nuevo periodo mensual (auto-precarga vendedores ruta)
  app.post('/api/comisiones-mensuales/periodos', requireAuth, async (req, res) => {
    try {
      const { year_month } = req.body;
      if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
        return res.status(400).json({ error: 'year_month debe ser formato YYYY-MM' });
      }

      // Verificar no exista
      const existe = await get('SELECT id FROM comisiones_mensuales_periodos WHERE year_month = ?', [year_month]);
      if (existe) return res.status(409).json({ error: `Ya existe el periodo ${year_month}` });

      // Crear periodo
      const r = await run(`
        INSERT INTO comisiones_mensuales_periodos (year_month, estado)
        VALUES (?, 'abierto')
      `, [year_month]);
      const periodoId = r.lastID;

      // Auto-precargar: empleados de depto VENTAS tipo VENDEDOR activos
      const vendedores = await all(`
        SELECT e.id, e.nombre, e.sueldo_base
        FROM empleados e
        LEFT JOIN departamentos d ON d.id = e.departamento_id
        WHERE e.activo = 1
          AND d.nombre = 'VENTAS'
          AND e.tipo = 'VENDEDOR'
        ORDER BY e.nombre
      `);

      // Calcular ventas del mes para cada uno (cross-channel efectivo + transferencia)
      const [y, m] = year_month.split('-').map(Number);
      const fechaInicio = `${year_month}-01`;
      const fechaFin    = new Date(y, m, 0).toISOString().slice(0, 10); // último día del mes

      for (const v of vendedores) {
        // Suma ventas del mes desde ventas_detalle_cortes (asumiendo modelo actual)
        const ventasRow = await get(`
          SELECT COALESCE(SUM(COALESCE(efectivo,0) + COALESCE(transferencia,0)), 0) AS total
          FROM ventas_detalle_cortes
          WHERE vendedor_id = (SELECT vendedor_id FROM empleados WHERE id = ?)
            AND fecha >= ? AND fecha <= ?
        `, [v.id, fechaInicio, fechaFin]).catch(() => ({ total: 0 }));

        await run(`
          INSERT INTO comisiones_mensuales_pagos
            (periodo_id, empleado_id, ventas_mes, comisiones_manuales, total)
          VALUES (?, ?, ?, 0, 0)
        `, [periodoId, v.id, ventasRow?.total || 0]);
      }

      log(`[com-mensuales] periodo ${year_month} creado con ${vendedores.length} vendedores`);
      res.status(201).json({ id: periodoId, year_month, empleados_precargados: vendedores.length });
    } catch (err) {
      log('[com-mensuales-create] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Detalle de un periodo (con pagos)
  app.get('/api/comisiones-mensuales/periodos/:id', requireAuth, async (req, res) => {
    try {
      const periodoId = parseInt(req.params.id, 10);
      const periodo = await get('SELECT * FROM comisiones_mensuales_periodos WHERE id = ?', [periodoId]);
      if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

      const pagos = await all(`
        SELECT p.*, e.nombre AS empleado_nombre, d.nombre AS departamento
        FROM comisiones_mensuales_pagos p
        JOIN empleados e   ON e.id = p.empleado_id
        LEFT JOIN departamentos d ON d.id = e.departamento_id
        WHERE p.periodo_id = ?
        ORDER BY e.nombre
      `, [periodoId]);

      res.json({ ...periodo, pagos });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Actualizar un pago (captura manual)
  app.patch('/api/comisiones-mensuales/pagos/:id', requireAuth, async (req, res) => {
    try {
      const pagoId = parseInt(req.params.id, 10);
      const { porcentaje, bono_base, comisiones_manuales, observaciones } = req.body;

      const pago = await get('SELECT p.*, pe.estado FROM comisiones_mensuales_pagos p ' +
                              'JOIN comisiones_mensuales_periodos pe ON pe.id = p.periodo_id ' +
                              'WHERE p.id = ?', [pagoId]);
      if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
      if (pago.estado === 'cerrado') return res.status(400).json({ error: 'Periodo cerrado, no editable' });

      const newBono   = bono_base !== undefined ? Number(bono_base) : pago.bono_base;
      const newManual = comisiones_manuales !== undefined ? Number(comisiones_manuales) : pago.comisiones_manuales;
      const newPct    = porcentaje !== undefined ? porcentaje : pago.porcentaje;
      const newObs    = observaciones !== undefined ? observaciones : pago.observaciones;
      const total     = (newBono || 0) + (newManual || 0);

      await run(`
        UPDATE comisiones_mensuales_pagos
        SET porcentaje = ?, bono_base = ?, comisiones_manuales = ?,
            total = ?, observaciones = ?, updated_at = ?
        WHERE id = ?
      `, [newPct, newBono, newManual, total, newObs, Date.now(), pagoId]);

      // Recalcular total del periodo
      const tot = await get(
        'SELECT SUM(total) AS s FROM comisiones_mensuales_pagos WHERE periodo_id = ?',
        [pago.periodo_id]);
      await run('UPDATE comisiones_mensuales_periodos SET total = ?, updated_at = ? WHERE id = ?',
        [tot.s || 0, Date.now(), pago.periodo_id]);

      res.json({ ok: true, total, periodo_total: tot.s || 0 });
    } catch (err) {
      log('[com-mensuales-patch] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Cerrar mes y pagar (genera GASTO con el schema real de movs)
  app.post('/api/comisiones-mensuales/periodos/:id/cerrar', requireAuth, async (req, res) => {
    try {
      const periodoId = parseInt(req.params.id, 10);
      const { caja_id, categoria_id, observaciones, cerrado_by } = req.body;

      if (!caja_id || !categoria_id) {
        return res.status(400).json({ error: 'caja_id y categoria_id son requeridos' });
      }

      const periodo = await get('SELECT * FROM comisiones_mensuales_periodos WHERE id = ?', [periodoId]);
      if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });
      if (periodo.estado === 'cerrado') return res.status(400).json({ error: 'Periodo ya está cerrado' });
      if (!periodo.total || periodo.total <= 0) {
        return res.status(400).json({ error: 'Total del periodo es 0, nada que pagar' });
      }

      // Lookup nombre de la categoría (movs.categoria guarda el NOMBRE, no el id)
      const cat = await get('SELECT id, nombre FROM cats WHERE id = ? AND deleted = 0', [categoria_id]);
      if (!cat) return res.status(400).json({ error: 'Categoría no encontrada o eliminada' });

      // Lookup nombre de la caja (sólo para validar que existe)
      const caja = await get('SELECT id, nombre FROM cajas WHERE id = ? AND deleted = 0', [caja_id]);
      if (!caja) return res.status(400).json({ error: 'Caja no encontrada o eliminada' });

      // Generar movimiento GASTO con schema real
      const movId = `m-cm-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
      const nowMs = Date.now();
      const userName = cerrado_by || 'Administrador';
      const userId   = cerrado_by ? `u-${cerrado_by.toLowerCase().replace(/\s+/g, '-')}` : 'u-admin';
      const concepto = `Comisiones Mensuales ${periodo.year_month}` +
                       (observaciones ? ` — ${observaciones}` : '');

      await run(`
        INSERT INTO movs
          (id, fecha, tipo, categoria, concepto, monto, metodo, caja,
           usuario, notas, src, user_id, updated_at, deleted)
        VALUES
          (?, date('now','localtime'), 'GASTO', ?, ?, ?, 'EFECTIVO', ?,
           ?, ?, 'manual', ?, ?, 0)
      `, [movId, cat.nombre, concepto, periodo.total, caja_id,
          userName, observaciones || null, userId, nowMs]);

      // Marcar periodo cerrado (snapshot nombre cat + caja)
      await run(`
        UPDATE comisiones_mensuales_periodos
        SET estado = 'cerrado',
            mov_id = ?, caja_id = ?, categoria_id = ?, categoria_nombre = ?,
            cerrado_at = datetime('now','localtime'),
            cerrado_by = ?,
            observaciones = COALESCE(?, observaciones),
            updated_at = ?
        WHERE id = ?
      `, [movId, caja_id, categoria_id, cat.nombre, userName, observaciones, nowMs, periodoId]);

      log(`[com-mensuales-cerrar] periodo ${periodo.year_month} cerrado, mov ${movId}, $${periodo.total}`);
      res.json({ ok: true, mov_id: movId, total: periodo.total, year_month: periodo.year_month });
    } catch (err) {
      log('[com-mensuales-cerrar] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // T5 — EXPORTS NÓMINA: Excel + PDF
  // ==========================================================================
  app.get('/api/nomina/periodos/:id/export.xlsx', requireAuth, async (req, res) => {
    try {
      const periodoId = req.params.id;  // TEXT
      const data = await loadNominaPeriodoFull(periodoId, { get, all });
      if (!data) return res.status(404).json({ error: 'Periodo no encontrado' });

      const buffer = await buildExcel(data);
      const safeId = String(data.periodo.id || periodoId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `nomina_${safeId}_${data.periodo.fecha_fin || 'periodo'}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      log('[export-xlsx] ERROR:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/nomina/periodos/:id/export.pdf', requireAuth, async (req, res) => {
    try {
      const periodoId = req.params.id;  // TEXT
      const data = await loadNominaPeriodoFull(periodoId, { get, all });
      if (!data) return res.status(404).json({ error: 'Periodo no encontrado' });

      const buffer = await buildPdf(data);
      const safeId = String(data.periodo.id || periodoId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `nomina_${safeId}_${data.periodo.fecha_fin || 'periodo'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      log('[export-pdf] ERROR:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  log('[nomina-extensions] 10 endpoints montados (T2 + T3 + T4 + T5)');
}

// ============================================================================
// HELPER: Carga periodo nómina completo para exports
// ============================================================================
async function loadNominaPeriodoFull(periodoId, { get, all }) {
  const periodo = await get(
    'SELECT * FROM nominas_periodos WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [periodoId]
  );
  if (!periodo) return null;

  // Normalizar nombres legacy para que los generadores Excel/PDF los encuentren
  periodo.semana_comisiones_inicio = periodo.semana_comisiones_inicio || periodo.comisiones_desde;
  periodo.semana_comisiones_fin    = periodo.semana_comisiones_fin    || periodo.comisiones_hasta;

  // Pagos planos (sin JOIN — usamos los snapshots empleado_nombre / departamento_nombre)
  const pagosRaw = await all(`
    SELECT * FROM nominas_pagos
    WHERE periodo_id = ? AND COALESCE(deleted, 0) = 0
    ORDER BY orden, empleado_nombre
  `, [periodoId]);

  // Vendedores info (best-effort) para resolver ruta_codigo / ruta_nombre
  let vendedoresMap = new Map();
  try {
    const vendInfo = await all("PRAGMA table_info(vendedores)").catch(() => []);
    const vCols = new Set(vendInfo.map(c => c.name));
    if (vCols.has('id')) {
      const cols = ['id'];
      ['nombre', 'ruta', 'codigo', 'numero', 'zona'].forEach(c => { if (vCols.has(c)) cols.push(c); });
      const vRows = await all(`SELECT ${cols.join(', ')} FROM vendedores`).catch(() => []);
      vendedoresMap = new Map(vRows.map(v => [v.id, v]));
    }
  } catch (e) { /* ignore */ }

  // Procesar cada pago: parsear comisiones_detalle JSON y mapear al formato del recibo
  const pagos = pagosRaw.map((p) => {
    let detalle = {};
    try { detalle = JSON.parse(p.comisiones_detalle || '{}'); } catch (_) {}

    const tipo          = detalle.tipo || 'PLANTA';
    const ventas_s1     = Number(detalle.ventas_s1)     || 0;
    const comision_base = Number(detalle.comision_base) || 0;
    const bono_meta     = Number(detalle.bono_meta)     || 0;
    const ranking_pos   = Number(detalle.ranking_pos)   || 0;
    const ranking_bono  = Number(detalle.ranking_bono)  || 0;
    const bono_mensual  = Number(detalle.bono_mensual)  || 0;

    // Resolver ruta desde vendedores si aplica
    let ruta_codigo = '-';
    let ruta_nombre = p.departamento_nombre || '';
    if (detalle.vendedor_id && vendedoresMap.has(detalle.vendedor_id)) {
      const v = vendedoresMap.get(detalle.vendedor_id);
      ruta_codigo = v.codigo || (v.numero ? `R-${String(v.numero).padStart(2, '0')}` : '-');
      ruta_nombre = v.ruta || v.zona || v.nombre || ruta_nombre;
    } else if (tipo === 'VENDEDOR') {
      // Vendedor sin ruta vinculada
      ruta_codigo = 'S/R';
      ruta_nombre = 'SIN RUTA';
    } else {
      // Personal de planta
      ruta_codigo = p.departamento_nombre || 'PLANTA';
    }

    return {
      // Snapshot + JSON detalle, en alias que esperan los generadores
      id:                  p.id,
      empleado_id:         p.empleado_id,
      empleado_nombre:     p.empleado_nombre,
      empleado_tipo:       tipo,
      vendedor_id:         detalle.vendedor_id || null,
      departamento:        p.departamento_nombre || '',
      ruta_codigo,
      ruta_nombre,
      ranking:             ranking_pos || null,
      faltas:              0,                             // no existe en schema, mostrar 0
      // Financieros (los generadores buscan estos exactos):
      ventas_semana:       ventas_s1,
      comisiones:          comision_base + bono_mensual, // comisión total = escalón + mensual
      sueldo_base:         Number(p.neto) || 0,
      bono_meta,
      bono_ranking:        ranking_bono,
      descuento_prestamos: Number(p.prestamos_abonados) || 0,
      descuento_faltas:    0,
      total:               Number(p.total) || 0,
      garantia:            Number(p.total) || 0,         // sin garantía explícita usa total
      // Originales por si los necesitas:
      neto_raw:            p.neto,
      comisiones_raw:      p.comisiones,
      detalle_raw:         detalle,
    };
  });

  // Orden: VENDEDORes primero (por ruta_codigo), luego PLANTA (por departamento)
  pagos.sort((a, b) => {
    const aIsV = a.empleado_tipo === 'VENDEDOR' ? 0 : 1;
    const bIsV = b.empleado_tipo === 'VENDEDOR' ? 0 : 1;
    if (aIsV !== bIsV) return aIsV - bIsV;
    const ra = a.ruta_codigo || 'Z';
    const rb = b.ruta_codigo || 'Z';
    const rc = ra.localeCompare(rb);
    if (rc !== 0) return rc;
    return (a.empleado_nombre || '').localeCompare(b.empleado_nombre || '');
  });

  // Préstamos activos (resiliente: si no existe la tabla, retorna [])
  const prestamos = await all(`
    SELECT pr.*, e.nombre AS empleado_nombre,
           (pr.monto_original - COALESCE(
             (SELECT SUM(monto) FROM prestamos_abonos WHERE prestamo_id = pr.id), 0)) AS saldo
    FROM prestamos pr
    LEFT JOIN empleados e ON e.id = pr.empleado_id
    WHERE COALESCE(pr.estado, '') != 'pagado' AND COALESCE(pr.deleted, 0) = 0
    ORDER BY e.nombre
  `).catch(() => []);

  return { periodo, pagos, prestamos };
}

module.exports = mountNominaExtensions;
module.exports.loadNominaPeriodoFull = loadNominaPeriodoFull;
