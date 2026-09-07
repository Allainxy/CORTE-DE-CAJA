// ============================================================================
// routes/nomina.js — Nómina: departamentos, empleados, comisiones, bonos,
// periodos de nómina y préstamos a empleados.
// Extraído VERBATIM de server.js (#6), bloque que va del banner
// "// ====…" previo a "// === RUTAS DE NOMINA ===" hasta
// "// === FIN RUTAS DE NOMINA ===" (server.js líneas 3808-4829, ambas
// inclusive). Patrón mount*(app, db, opts) igual que routes/cxp.js /
// routes/viaticos.js / nomina-extensions.js.
//   opts: { requireAuth, requirePin, requireAdmin, audit, newId, userCanUseCaja, log }
//   (este bloque usa: requireAuth, requirePin, audit, newId)
// NO incluye el bloque "// === Mejoras Nómina v1 …" que sigue en server.js:
// los mounts de nomina-extensions.js y nomina-pagos-individuales.js se quedan
// en server.js.
//
// Rutas que monta (32, en el mismo orden de registro que server.js):
//   GET    /api/nomina/departamentos                    lista (?todos=1 incluye inactivos)
//   POST   /api/nomina/departamentos                    crear/upsert (+ categoría GASTO "NOMINA <X>")
//   PUT    /api/nomina/departamentos/:id                editar
//   DELETE /api/nomina/departamentos/:id                soft-delete
//   GET    /api/nomina/empleados                        lista (?todos=1, ?tipo=) + préstamos activos
//   POST   /api/nomina/empleados                        crear/upsert
//   PUT    /api/nomina/empleados/:id                    editar
//   DELETE /api/nomina/empleados/:id                    soft-delete (?hard=1 borra si no tiene vínculos)
//   GET    /api/nomina/comisiones-tabla                 escalones de comisión
//   POST   /api/nomina/comisiones-tabla                 crear/upsert escalón
//   DELETE /api/nomina/comisiones-tabla/:id             soft-delete escalón
//   GET    /api/nomina/bonos                            bonos_config (RANKING / MENSUAL)
//   POST   /api/nomina/bonos                            crear/upsert bono
//   DELETE /api/nomina/bonos/:id                        soft-delete bono
//   GET    /api/nomina/periodos                         lista (?estado=)
//   GET    /api/nomina/periodos/:id                     detalle + pagos
//   POST   /api/nomina/periodos                         crear periodo + precarga y sugerencias
//   PUT    /api/nomina/pagos/:id                        editar un pago del periodo
//   POST   /api/nomina/periodos/:id/agregar-pago        agregar pago manual al periodo
//   DELETE /api/nomina/pagos/:id                        quitar pago (periodo abierto)
//   POST   /api/nomina/periodos/:id/cerrar              cerrar: movs GASTO + abonos a préstamos
//   POST   /api/nomina/periodos/:id/recalcular          recalcular comisiones sugeridas
//   DELETE /api/nomina/periodos/:id                     cancelar periodo ABIERTO
//   GET    /api/nomina/stats                            KPIs (periodo abierto, empleados, préstamos)
//   GET    /api/nomina/prestamos                        lista (?estado=)
//   GET    /api/nomina/prestamos/:id                    detalle + abonos
//   POST   /api/nomina/prestamos                        crear préstamo (mov GASTO "PRESTAMOS EMPLEADOS")
//   POST   /api/nomina/prestamos/:id/abonar             abono manual (mov INGRESO)
//   DELETE /api/nomina/prestamos/:id                    cancelar préstamo (PIN) revirtiendo movs
//   PUT    /api/nomina/prestamos/:id                    editar préstamo (PIN)
//   PUT    /api/nomina/prestamos/:id/abonos/:abonoId    editar abono (PIN)
//   DELETE /api/nomina/prestamos/:id/abonos/:abonoId    borrar abono (PIN)
//
// Helpers/consts locales que vinieron con el bloque:
//   newDeptId, newEmpId, newPeriodoId, newPagoId, newPrestamoId, newAbonoId,
//   newComisionTableId, newBonoId, CAT_PRESTAMO, CAT_ABONO,
//   calcComisionVendedor, buscarEscalonComision, rankingSemanal,
//   bonoMensualVendedor, addDaysISO, inicioMesPrevio, recalcPrestamo.
// ============================================================================
module.exports = function mountNomina(app, db, opts) {
  opts = opts || {};
  const auth = opts.requireAuth;
  const requirePin = opts.requirePin;
  const requireAdmin = opts.requireAdmin;
  const audit = opts.audit;
  const newId = opts.newId;
  const userCanUseCaja = opts.userCanUseCaja;
  const log = opts.log || (() => {});

  // newMovId NO forma parte del bloque de nómina: vive en server.js:2481
  // (sección ventas) y el bloque lo usa para los ids de movs ('m-nom-…',
  // 'm-pr-…', 'm-ab-…'). Se copia sin cambios para no depender del closure de
  // server.js; deriva de opts.newId, así que el formato de id es idéntico.
  function newMovId(prefix) {
    return newId('m-' + prefix + '-');
  }

  // =============================================================
  // K-BOTANAS · Backend Nómina v1.0
  // CRUD departamentos, empleados, comisiones_tabla, bonos_config
  // Periodos: crear, listar, sugerencias, cerrar (genera movs GASTO)
  // Préstamos: crear, abonar, saldar
  // =============================================================

  // === RUTAS DE NOMINA ===

  function newDeptId() { return newId('dept-'); }
  function newEmpId() { return newId('emp-'); }
  function newPeriodoId() { return newId('np-'); }
  function newPagoId() { return newId('npg-'); }
  function newPrestamoId() { return newId('pr-'); }
  function newAbonoId() { return newId('pa-'); }
  function newComisionTableId() { return newId('com-'); }
  function newBonoId() { return newId('bono-'); }

  const CAT_PRESTAMO = 'PRESTAMOS EMPLEADOS';
  const CAT_ABONO = 'ABONO PRESTAMO EMPLEADO';

  // -------- Departamentos --------
  app.get('/api/nomina/departamentos', auth, (req, res) => {
    try {
      const all = req.query.todos === '1';
      const sql = all
        ? 'SELECT * FROM departamentos WHERE deleted = 0 ORDER BY orden, nombre'
        : 'SELECT * FROM departamentos WHERE deleted = 0 AND activo = 1 ORDER BY orden, nombre';
      res.json(db.prepare(sql).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/nomina/departamentos', auth, (req, res) => {
    try {
      const nombre = (req.body?.nombre || '').trim().toUpperCase();
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const catNomina = 'NOMINA ' + nombre;
      const id = req.body?.id || newDeptId();
      const now = Date.now();
      db.prepare(`INSERT INTO departamentos (id, nombre, categoria_nomina, orden, activo, updated_at, deleted)
        VALUES (?, ?, ?, ?, 1, ?, 0)
        ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, categoria_nomina=excluded.categoria_nomina,
        orden=excluded.orden, activo=1, updated_at=excluded.updated_at, deleted=0`)
        .run(id, nombre, catNomina, Number(req.body?.orden) || 0, now);
      // Crear categoría GASTO si no existe
      const existeCat = db.prepare("SELECT id FROM cats WHERE nombre = ? AND tipo = 'GASTO' AND deleted = 0").get(catNomina);
      if (!existeCat) {
        const grupo = db.prepare("SELECT id FROM groups WHERE nombre = 'NOMINA' AND tipo = 'GASTO' AND deleted = 0 LIMIT 1").get();
        if (grupo) {
          db.prepare(`INSERT INTO cats (id, tipo, nombre, color, icon, group_id, updated_at, deleted)
            VALUES (?, 'GASTO', ?, '#3B82F6', '👥', ?, ?, 0)`).run('cat-nom-' + id, catNomina, grupo.id, now);
        }
      }
      audit(req, 'CREATE', 'departamentos', id, 'Departamento: ' + nombre);
      res.json(db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/nomina/departamentos/:id', auth, (req, res) => {
    try {
      const id = req.params.id;
      const cur = db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
      if (!cur) return res.status(404).json({ error: 'dept no existe' });
      const nombre = req.body?.nombre != null ? String(req.body.nombre).trim().toUpperCase() : cur.nombre;
      const activo = req.body?.activo != null ? (req.body.activo ? 1 : 0) : cur.activo;
      const orden = req.body?.orden != null ? Number(req.body.orden) : cur.orden;
      const catNomina = 'NOMINA ' + nombre;
      db.prepare(`UPDATE departamentos SET nombre=?, categoria_nomina=?, orden=?, activo=?, updated_at=? WHERE id=?`)
        .run(nombre, catNomina, orden, activo, Date.now(), id);
      audit(req, 'UPDATE', 'departamentos', id, `${nombre} activo=${activo}`);
      res.json(db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/nomina/departamentos/:id', auth, (req, res) => {
    try {
      db.prepare('UPDATE departamentos SET deleted = 1, activo = 0, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
      audit(req, 'DELETE', 'departamentos', req.params.id, 'Eliminado');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- Empleados --------
  app.get('/api/nomina/empleados', auth, (req, res) => {
    try {
      const all = req.query.todos === '1';
      const tipo = req.query.tipo;
      let sql = `SELECT e.*, d.nombre AS departamento_nombre, d.categoria_nomina,
        (SELECT COUNT(*) FROM prestamos pr WHERE pr.empleado_id = e.id AND pr.estado = 'ACTIVO' AND pr.deleted = 0) AS prestamos_activos,
        (SELECT COALESCE(SUM(saldo_actual), 0) FROM prestamos pr WHERE pr.empleado_id = e.id AND pr.estado = 'ACTIVO' AND pr.deleted = 0) AS prestamos_saldo
        FROM empleados e
        LEFT JOIN departamentos d ON d.id = e.departamento_id
        WHERE e.deleted = 0`;
      const args = [];
      if (!all) { sql += ' AND e.activo = 1'; }
      if (tipo) { sql += ' AND e.tipo = ?'; args.push(tipo); }
      sql += ` ORDER BY e.activo DESC, COALESCE(e.numero, 999999), e.nombre`;
      res.json(db.prepare(sql).all(...args));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/nomina/empleados', auth, (req, res) => {
    try {
      const nombre = (req.body?.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const id = req.body?.id || newEmpId();
      const now = Date.now();
      const tipoVal = (req.body?.tipo || 'PLANTA').toUpperCase();
      db.prepare(`INSERT INTO empleados
        (id, numero, nombre, departamento_id, tipo, sueldo_base, vendedor_id, fecha_ingreso, telefono, banco, cuenta, notas, activo, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)
        ON CONFLICT(id) DO UPDATE SET numero=excluded.numero, nombre=excluded.nombre, departamento_id=excluded.departamento_id,
          tipo=excluded.tipo, sueldo_base=excluded.sueldo_base, vendedor_id=excluded.vendedor_id,
          fecha_ingreso=excluded.fecha_ingreso, telefono=excluded.telefono, banco=excluded.banco,
          cuenta=excluded.cuenta, notas=excluded.notas, activo=1, updated_at=excluded.updated_at, deleted=0
      `).run(
        id, req.body?.numero || null, nombre, req.body?.departamento_id || null,
        tipoVal, Number(req.body?.sueldo_base) || 0, req.body?.vendedor_id || null,
        req.body?.fecha_ingreso || null, req.body?.telefono || null,
        req.body?.banco || null, req.body?.cuenta || null, req.body?.notas || null, now
      );
      audit(req, 'CREATE', 'empleados', id, `${tipoVal}: ${nombre}`);
      res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/nomina/empleados/:id', auth, (req, res) => {
    try {
      const id = req.params.id;
      const cur = db.prepare('SELECT * FROM empleados WHERE id = ?').get(id);
      if (!cur) return res.status(404).json({ error: 'empleado no existe' });
      const fields = ['numero', 'nombre', 'departamento_id', 'tipo', 'sueldo_base', 'vendedor_id',
        'fecha_ingreso', 'telefono', 'banco', 'cuenta', 'notas', 'activo'];
      const next = {};
      for (const f of fields) next[f] = req.body?.[f] != null ? req.body[f] : cur[f];
      next.activo = next.activo ? 1 : 0;
      if (next.tipo) next.tipo = String(next.tipo).toUpperCase();
      db.prepare(`UPDATE empleados SET numero=?, nombre=?, departamento_id=?, tipo=?, sueldo_base=?, vendedor_id=?,
        fecha_ingreso=?, telefono=?, banco=?, cuenta=?, notas=?, activo=?, updated_at=? WHERE id=?`).run(
        next.numero, next.nombre, next.departamento_id, next.tipo, Number(next.sueldo_base) || 0,
        next.vendedor_id, next.fecha_ingreso, next.telefono, next.banco, next.cuenta, next.notas,
        next.activo, Date.now(), id
      );
      audit(req, 'UPDATE', 'empleados', id, next.nombre);
      res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/nomina/empleados/:id', auth, (req, res) => {
    try {
      const hard = req.query.hard === '1';
      if (hard) {
        const usado = db.prepare(`SELECT
          (SELECT COUNT(*) FROM nominas_pagos WHERE empleado_id = ? AND deleted = 0) +
          (SELECT COUNT(*) FROM prestamos WHERE empleado_id = ? AND deleted = 0) AS n
        `).get(req.params.id, req.params.id);
        if (usado.n > 0) {
          return res.status(400).json({
            error: `Empleado tiene ${usado.n} registros vinculados. Usa INACTIVAR en su lugar.`
          });
        }
        db.prepare('DELETE FROM empleados WHERE id = ?').run(req.params.id);
        audit(req, 'HARD_DELETE', 'empleados', req.params.id, 'Eliminación permanente');
      } else {
        db.prepare('UPDATE empleados SET deleted = 1, activo = 0, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
        audit(req, 'DELETE', 'empleados', req.params.id, 'Soft-delete');
      }
      res.json({ ok: true, hard });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // -------- Tabla de comisiones --------
  app.get('/api/nomina/comisiones-tabla', auth, (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM comisiones_tabla WHERE deleted = 0 ORDER BY venta_minima ASC').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/nomina/comisiones-tabla', auth, (req, res) => {
    try {
      const id = req.body?.id || newComisionTableId();
      const now = Date.now();
      db.prepare(`INSERT INTO comisiones_tabla (id, venta_minima, pct_comision, bono_meta, orden, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET venta_minima=excluded.venta_minima, pct_comision=excluded.pct_comision,
        bono_meta=excluded.bono_meta, orden=excluded.orden, updated_at=excluded.updated_at, deleted=0
      `).run(id, Number(req.body?.venta_minima) || 0, Number(req.body?.pct_comision) || 0,
        Number(req.body?.bono_meta) || 0, Number(req.body?.orden) || 0, now);
      audit(req, 'CREATE_OR_UPDATE', 'comisiones_tabla', id, '');
      res.json(db.prepare('SELECT * FROM comisiones_tabla WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/nomina/comisiones-tabla/:id', auth, (req, res) => {
    try {
      db.prepare('UPDATE comisiones_tabla SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
      audit(req, 'DELETE', 'comisiones_tabla', req.params.id, '');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- Bonos config --------
  app.get('/api/nomina/bonos', auth, (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM bonos_config WHERE deleted = 0 ORDER BY tipo, posicion').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/nomina/bonos', auth, (req, res) => {
    try {
      const id = req.body?.id || newBonoId();
      const tipo = (req.body?.tipo || 'RANKING').toUpperCase();
      if (!['RANKING', 'MENSUAL'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
      db.prepare(`INSERT INTO bonos_config (id, tipo, posicion, monto, activo, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, posicion=excluded.posicion, monto=excluded.monto,
          activo=excluded.activo, updated_at=excluded.updated_at, deleted=0
      `).run(id, tipo, Number(req.body?.posicion) || 0, Number(req.body?.monto) || 0,
        req.body?.activo === false ? 0 : 1, Date.now());
      res.json(db.prepare('SELECT * FROM bonos_config WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/nomina/bonos/:id', auth, (req, res) => {
    try {
      db.prepare('UPDATE bonos_config SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- Cálculo de comisiones (helper) --------
  function calcComisionVendedor(vendedorId, desdeISO, hastaISO) {
    // Suma efectivo + transferencia de ventas_detalle_cortes para ese vendedor en ese rango
    const r = db.prepare(`
      SELECT COALESCE(SUM(efectivo + transferencia), 0) AS venta_total
      FROM ventas_detalle_cortes
      WHERE deleted = 0 AND vendedor_id = ? AND fecha >= ? AND fecha <= ?
    `).get(vendedorId, desdeISO, hastaISO);
    return r.venta_total || 0;
  }

  function buscarEscalonComision(ventaTotal) {
    // Floor: el escalón más alto cuyo venta_minima <= ventaTotal
    return db.prepare(`
      SELECT * FROM comisiones_tabla
      WHERE deleted = 0 AND venta_minima <= ?
      ORDER BY venta_minima DESC LIMIT 1
    `).get(ventaTotal);
  }

  function rankingSemanal(desdeISO, hastaISO) {
    // Top vendedores por suma efectivo+transferencia
    return db.prepare(`
      SELECT v.id AS vendedor_id, v.nombre,
        COALESCE(SUM(cd.efectivo + cd.transferencia), 0) AS venta_total
      FROM vendedores v
      JOIN ventas_detalle_cortes cd ON cd.vendedor_id = v.id AND cd.deleted = 0
        AND cd.fecha >= ? AND cd.fecha <= ?
      WHERE v.deleted = 0 AND v.activo = 1
      GROUP BY v.id
      HAVING venta_total > 0
      ORDER BY venta_total DESC
      LIMIT 10
    `).all(desdeISO, hastaISO);
  }

  function bonoMensualVendedor(vendedorId, anioMes) {
    // anioMes = "YYYY-MM"
    const desde = anioMes + '-01';
    // Fin de mes
    const [y, m] = anioMes.split('-').map(Number);
    const endDate = new Date(y, m, 0); // último día del mes
    const hasta = endDate.toISOString().slice(0, 10);
    const r = db.prepare(`
      SELECT COALESCE(SUM(efectivo + transferencia), 0) AS venta_mes
      FROM ventas_detalle_cortes
      WHERE deleted = 0 AND vendedor_id = ? AND fecha >= ? AND fecha <= ?
    `).get(vendedorId, desde, hasta);
    const ventaMes = r.venta_mes || 0;
    // Buscar bono mensual aplicable (mayor meta cumplida)
    const bono = db.prepare(`
      SELECT * FROM bonos_config
      WHERE tipo = 'MENSUAL' AND activo = 1 AND deleted = 0 AND posicion <= ?
      ORDER BY posicion DESC LIMIT 1
    `).get(ventaMes);
    return { venta_mes: ventaMes, bono: bono ? bono.monto : 0, meta_alcanzada: bono ? bono.posicion : 0 };
  }

  // -------- Periodos de nómina --------

  // Helpers para fechas
  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function inicioMesPrevio(fechaISO) {
    const d = new Date(fechaISO + 'T12:00:00');
    d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7); // YYYY-MM
  }

  app.get('/api/nomina/periodos', auth, (req, res) => {
    try {
      const estado = req.query.estado;
      let sql = `SELECT np.*, c.nombre AS caja_nombre,
        (SELECT COUNT(*) FROM nominas_pagos WHERE periodo_id = np.id AND deleted = 0) AS pagos_count
        FROM nominas_periodos np
        LEFT JOIN cajas c ON c.id = np.caja_id
        WHERE np.deleted = 0`;
      const args = [];
      if (estado && estado !== 'TODOS') { sql += ' AND np.estado = ?'; args.push(estado); }
      sql += ' ORDER BY np.fecha_inicio DESC, np.created_at DESC';
      res.json(db.prepare(sql).all(...args));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/nomina/periodos/:id', auth, (req, res) => {
    try {
      const p = db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
        LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ? AND np.deleted = 0`).get(req.params.id);
      if (!p) return res.status(404).json({ error: 'periodo no existe' });
      const pagos = db.prepare(`SELECT np.*, e.numero AS empleado_numero, e.tipo AS empleado_tipo,
          e.vendedor_id, d.nombre AS departamento_nombre_actual
        FROM nominas_pagos np
        LEFT JOIN empleados e ON e.id = np.empleado_id
        LEFT JOIN departamentos d ON d.id = np.departamento_id
        WHERE np.periodo_id = ? AND np.deleted = 0
        ORDER BY np.orden, np.empleado_nombre`).all(req.params.id);
      res.json({ ...p, pagos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Crear periodo nuevo + auto-precarga de empleados activos + sugerencias automáticas
  app.post('/api/nomina/periodos', auth, (req, res) => {
    const tx = db.transaction((body) => {
      const fechaPago = (body.fecha_pago || new Date().toISOString().slice(0,10)).slice(0,10);
      // Semana actual: lunes a domingo donde cae fecha_pago
      const dPago = new Date(fechaPago + 'T12:00:00');
      const dow = dPago.getDay(); // 0=domingo, 1=lunes...
      const lunesActual = new Date(dPago);
      const diffToMonday = (dow === 0 ? -6 : 1 - dow);
      lunesActual.setDate(lunesActual.getDate() + diffToMonday);
      const fechaInicio = lunesActual.toISOString().slice(0,10);
      const fechaFin = addDaysISO(fechaInicio, 6); // domingo
      // Comisiones = semana anterior (lunes a domingo)
      const comisionesDesde = addDaysISO(fechaInicio, -7);
      const comisionesHasta = addDaysISO(fechaInicio, -1);
      // Bono mensual: mes anterior completo a fecha_pago
      const bonoMensualMes = inicioMesPrevio(fechaPago);

      const cajaId = body.caja_id;
      if (!cajaId) throw new Error('caja_id requerida');
      const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(cajaId);
      if (!caja) throw new Error('caja no existe');

      // Verificar no haya otro periodo ABIERTO ya
      const abierto = db.prepare(`SELECT id, fecha_inicio FROM nominas_periodos WHERE estado = 'ABIERTO' AND deleted = 0 LIMIT 1`).get();
      if (abierto && !body.force) {
        throw new Error(`Ya existe un periodo ABIERTO (inició ${abierto.fecha_inicio}). Ciérralo primero o usa force=true.`);
      }

      const id = body.id || newPeriodoId();
      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';

      db.prepare(`INSERT INTO nominas_periodos
        (id, fecha_inicio, fecha_fin, fecha_pago, comisiones_desde, comisiones_hasta, bono_mensual_mes,
         estado, total_nomina, empleados_pagados, caja_id, comentario, usuario, user_id, created_at, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ABIERTO', 0, 0, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, fechaInicio, fechaFin, fechaPago, comisionesDesde, comisionesHasta, bonoMensualMes,
        cajaId, body.comentario || null, usuario, req.user?.id || null, now, now);

      // Calcular ranking semana anterior para asignar bonos automáticos
      const ranking = rankingSemanal(comisionesDesde, comisionesHasta);
      const rankingMap = {}; // vendedor_id -> { pos, bono }
      const bonosRanking = db.prepare(`SELECT * FROM bonos_config WHERE tipo = 'RANKING' AND activo = 1 AND deleted = 0 ORDER BY posicion`).all();
      ranking.slice(0, bonosRanking.length).forEach((r, i) => {
        rankingMap[r.vendedor_id] = { pos: i + 1, bono: bonosRanking[i].monto };
      });

      // Auto-precarga de empleados activos
      const empleados = db.prepare(`SELECT e.*, d.nombre AS dept_nombre, d.categoria_nomina, d.id AS dept_id
        FROM empleados e
        LEFT JOIN departamentos d ON d.id = e.departamento_id
        WHERE e.deleted = 0 AND e.activo = 1
        ORDER BY COALESCE(e.numero, 999999), e.nombre`).all();

      let orden = 0;
      for (const emp of empleados) {
        const empCajaId = cajaId; // default a caja del periodo
        // Calcular comisión sugerida si es VENDEDOR y tiene vendedor_id vinculado
        let comisionesSugeridas = 0;
        let detalle = { tipo: emp.tipo, vendedor_id: emp.vendedor_id, ventas_s1: 0, escalon: null,
          comision_base: 0, bono_meta: 0, ranking_pos: 0, ranking_bono: 0, bono_mensual: 0, total: 0 };
        if (emp.tipo === 'VENDEDOR' && emp.vendedor_id) {
          const venta = calcComisionVendedor(emp.vendedor_id, comisionesDesde, comisionesHasta);
          detalle.ventas_s1 = venta;
          const escalon = buscarEscalonComision(venta);
          if (escalon) {
            const comBase = venta * escalon.pct_comision;
            detalle.escalon = { venta_minima: escalon.venta_minima, pct: escalon.pct_comision };
            detalle.comision_base = comBase;
            detalle.bono_meta = escalon.bono_meta;
            comisionesSugeridas += comBase + escalon.bono_meta;
          }
          // Bono ranking
          if (rankingMap[emp.vendedor_id]) {
            detalle.ranking_pos = rankingMap[emp.vendedor_id].pos;
            detalle.ranking_bono = rankingMap[emp.vendedor_id].bono;
            comisionesSugeridas += rankingMap[emp.vendedor_id].bono;
          }
          // Bono mensual
          const bm = bonoMensualVendedor(emp.vendedor_id, bonoMensualMes);
          if (bm.bono > 0) {
            detalle.bono_mensual = bm.bono;
            detalle.bono_mensual_venta = bm.venta_mes;
            comisionesSugeridas += bm.bono;
          }
          detalle.total = comisionesSugeridas;
        }

        // Sugerir abono a préstamos activos (si tiene)
        let abonoSugerido = 0;
        const prestamosActivos = db.prepare(`SELECT abono_sugerido_semanal, saldo_actual FROM prestamos
          WHERE empleado_id = ? AND estado = 'ACTIVO' AND deleted = 0`).all(emp.id);
        prestamosActivos.forEach(pr => {
          const sug = Math.min(Number(pr.abono_sugerido_semanal) || 0, Number(pr.saldo_actual) || 0);
          abonoSugerido += sug;
        });

        const neto = Number(emp.sueldo_base) || 0;
        const total = neto + comisionesSugeridas - abonoSugerido;

        db.prepare(`INSERT INTO nominas_pagos
          (id, periodo_id, empleado_id, empleado_nombre, departamento_id, departamento_nombre, categoria_nomina,
           caja_id, neto, comisiones, comisiones_detalle, prestamos_abonados, total, orden, updated_at, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          newPagoId(), id, emp.id, emp.nombre, emp.dept_id, emp.dept_nombre,
          emp.categoria_nomina || 'NOMINA SIN DEPTO', empCajaId,
          neto, comisionesSugeridas, JSON.stringify(detalle), abonoSugerido, total, orden++, now
        );
      }

      audit(req, 'CREATE', 'nominas_periodos', id,
        `Periodo ${fechaInicio} a ${fechaFin} · ${empleados.length} empleados · caja: ${caja.nombre}`);

      return db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
        LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ?`).get(id);
    });
    try { res.json(tx(req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Editar un pago individual (neto, comisiones, abono, caja, departamento)
  app.put('/api/nomina/pagos/:id', auth, (req, res) => {
    try {
      const id = req.params.id;
      const cur = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(id);
      if (!cur) return res.status(404).json({ error: 'pago no existe' });
      const periodo = db.prepare('SELECT estado FROM nominas_periodos WHERE id = ?').get(cur.periodo_id);
      if (periodo?.estado === 'CERRADO') return res.status(400).json({ error: 'periodo ya está cerrado, no se puede editar' });

      const neto = req.body?.neto != null ? Number(req.body.neto) : cur.neto;
      const comisiones = req.body?.comisiones != null ? Number(req.body.comisiones) : cur.comisiones;
      const abono = req.body?.prestamos_abonados != null ? Number(req.body.prestamos_abonados) : cur.prestamos_abonados;
      const cajaId = req.body?.caja_id || cur.caja_id;
      const deptId = req.body?.departamento_id !== undefined ? req.body.departamento_id : cur.departamento_id;
      let deptNombre = cur.departamento_nombre, catNomina = cur.categoria_nomina;
      if (deptId && deptId !== cur.departamento_id) {
        const d = db.prepare('SELECT nombre, categoria_nomina FROM departamentos WHERE id = ?').get(deptId);
        if (d) { deptNombre = d.nombre; catNomina = d.categoria_nomina; }
      }
      const comentario = req.body?.comentario != null ? req.body.comentario : cur.comentario;
      const total = neto + comisiones - abono;
      db.prepare(`UPDATE nominas_pagos SET neto=?, comisiones=?, prestamos_abonados=?, total=?, caja_id=?,
        departamento_id=?, departamento_nombre=?, categoria_nomina=?, comentario=?, updated_at=? WHERE id=?`)
        .run(neto, comisiones, abono, total, cajaId, deptId, deptNombre, catNomina, comentario, Date.now(), id);
      res.json(db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Agregar empleado manual al periodo (ej. uno temporal no precargado)
  app.post('/api/nomina/periodos/:id/agregar-pago', auth, (req, res) => {
    try {
      const periodoId = req.params.id;
      const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(periodoId);
      if (!periodo) return res.status(404).json({ error: 'periodo no existe' });
      if (periodo.estado === 'CERRADO') return res.status(400).json({ error: 'periodo ya cerrado' });

      const empId = req.body?.empleado_id || null;
      let empleado = null;
      if (empId) empleado = db.prepare('SELECT * FROM empleados WHERE id = ?').get(empId);
      const empNombre = req.body?.empleado_nombre || empleado?.nombre || 'EMPLEADO TEMPORAL';
      const deptId = req.body?.departamento_id || empleado?.departamento_id || null;
      let dept = null;
      if (deptId) dept = db.prepare('SELECT nombre, categoria_nomina FROM departamentos WHERE id = ?').get(deptId);

      const neto = Number(req.body?.neto) || 0;
      const comisiones = Number(req.body?.comisiones) || 0;
      const abono = Number(req.body?.prestamos_abonados) || 0;
      const total = neto + comisiones - abono;

      const ordenMax = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM nominas_pagos WHERE periodo_id = ?').get(periodoId).m;
      const id = newPagoId();
      db.prepare(`INSERT INTO nominas_pagos
        (id, periodo_id, empleado_id, empleado_nombre, departamento_id, departamento_nombre, categoria_nomina,
         caja_id, neto, comisiones, prestamos_abonados, total, orden, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, periodoId, empId, empNombre.toUpperCase(), deptId, dept?.nombre || null,
        dept?.categoria_nomina || 'NOMINA SIN DEPTO',
        req.body?.caja_id || periodo.caja_id, neto, comisiones, abono, total, ordenMax + 1, Date.now());
      audit(req, 'CREATE', 'nominas_pagos', id, `Agregado a periodo: ${empNombre}`);
      res.json(db.prepare('SELECT * FROM nominas_pagos WHERE id = ?').get(id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Eliminar un pago (antes del cierre)
  app.delete('/api/nomina/pagos/:id', auth, (req, res) => {
    try {
      const pago = db.prepare('SELECT * FROM nominas_pagos WHERE id = ? AND deleted = 0').get(req.params.id);
      if (!pago) return res.status(404).json({ error: 'pago no existe' });
      const periodo = db.prepare('SELECT estado FROM nominas_periodos WHERE id = ?').get(pago.periodo_id);
      if (periodo?.estado === 'CERRADO') return res.status(400).json({ error: 'periodo cerrado' });
      db.prepare('UPDATE nominas_pagos SET deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
      audit(req, 'DELETE', 'nominas_pagos', req.params.id, `Quitado: ${pago.empleado_nombre}`);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // CERRAR PERIODO: genera movs GASTO y abonos a préstamos
  app.post('/api/nomina/periodos/:id/cerrar', auth, (req, res) => {
    const tx = db.transaction((periodoId) => {
      const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(periodoId);
      if (!periodo) throw new Error('periodo no existe');
      if (periodo.estado === 'CERRADO') throw new Error('periodo ya está cerrado');

      // F1_CERRAR_PATCH — solo procesa pagos pendientes; los ya pagados se respetan
      const pagosPendientes = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ? AND deleted = 0 AND pagado = 0').all(periodoId);
      const pagosYaPagados  = db.prepare('SELECT * FROM nominas_pagos WHERE periodo_id = ? AND deleted = 0 AND pagado = 1').all(periodoId);
      const pagos = pagosPendientes; // mantenemos nombre 'pagos' para no romper el resto del código
      if (pagos.length === 0) throw new Error('no hay pagos en este periodo');

      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';
      const userId = req.user?.id || null;
      // HOTFIX_BUG1_CERRAR_FECHA_HOY — el mov refleja cuándo se ejecuta el cierre, no la fecha_pago oficial
      const fechaMov = new Date().toISOString().slice(0, 10);
      let totalNomina = 0, empleadosPagados = 0;

      for (const p of pagos) {
        if (p.total <= 0 && p.neto <= 0 && p.comisiones <= 0) continue;

        // Verificar caja
        const caja = db.prepare("SELECT * FROM cajas WHERE id = ? AND deleted = 0").get(p.caja_id);
        if (!caja) throw new Error(`Caja del pago de ${p.empleado_nombre} no existe`);

        // Crear mov GASTO por el TOTAL (neto + comisiones - abono)
        // El abono se registra como INGRESO separado a la misma caja
        const concepto = `Nómina ${periodo.fecha_inicio} · ${p.empleado_nombre}`;
        const movGastoId = newMovId('nom');
        const montoGasto = Number(p.total) || 0;
        if (montoGasto > 0) {
          db.prepare(`INSERT INTO movs (
            id, fecha, tipo, categoria, concepto, monto, metodo, caja,
            usuario, notas, src, user_id, updated_at, deleted
          ) VALUES (?, ?, 'GASTO', ?, ?, ?, 'EFECTIVO', ?, ?, ?, 'nomina', ?, ?, 0)`).run(
            movGastoId, fechaMov /* HOTFIX_BUG1_CERRAR_FECHA_HOY */, p.categoria_nomina, concepto, montoGasto,
            p.caja_id, usuario,
            `Periodo ${periodo.id.slice(-6)} · Neto ${p.neto} + Comis ${p.comisiones} - Abono ${p.prestamos_abonados}`,
            userId, now
          );
        }

        // Si hay abono a préstamo, aplicar a el(los) préstamo(s) activo(s)
        if ((Number(p.prestamos_abonados) || 0) > 0 && p.empleado_id) {
          let remanente = Number(p.prestamos_abonados);
          const prestamosActivos = db.prepare(`SELECT * FROM prestamos
            WHERE empleado_id = ? AND estado = 'ACTIVO' AND deleted = 0
            ORDER BY fecha ASC`).all(p.empleado_id);
          for (const pr of prestamosActivos) {
            if (remanente <= 0) break;
            const aAbonar = Math.min(remanente, Number(pr.saldo_actual) || 0);
            if (aAbonar <= 0) continue;
            // Registrar abono
            db.prepare(`INSERT INTO prestamos_abonos
              (id, prestamo_id, periodo_id, fecha, monto, metodo, caja_id, comentario, usuario, user_id, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, 'DESCUENTO_NOMINA', NULL, ?, ?, ?, ?, 0)
            `).run(newAbonoId(), pr.id, periodoId, fechaMov /* HOTFIX_BUG1_CERRAR_FECHA_HOY */, aAbonar,
              `Descuento en nómina ${periodo.fecha_inicio}`, usuario, userId, now);
            // Actualizar saldo
            const nuevoSaldo = Number(pr.saldo_actual) - aAbonar;
            const nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
            db.prepare(`UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?`)
              .run(nuevoSaldo, nuevoEstado, nuevoEstado === 'SALDADO' ? fechaMov : null, now, pr.id); /* HOTFIX_BUG1_CERRAR_FECHA_HOY */
            remanente -= aAbonar;
          }
        }

        // Actualizar mov_id en el pago
        db.prepare('UPDATE nominas_pagos SET mov_id = ?, updated_at = ? WHERE id = ?')
          .run(movGastoId, now, p.id);

        totalNomina += montoGasto;
        empleadosPagados++;
      }

      // F1_CERRAR_PATCH — sumar pagos ya pagados individualmente al total del periodo
      for (const yp of pagosYaPagados) {
        totalNomina += Number(yp.total) || 0;
        empleadosPagados++;
      }
      // Marcar TODOS los pendientes procesados como pagado=1 (los ya pagados quedan igual)
      for (const p of pagos) {
        db.prepare('UPDATE nominas_pagos SET pagado = 1, pagado_at = COALESCE(pagado_at, ?), pagado_por = COALESCE(pagado_por, ?), updated_at = ? WHERE id = ?')
          .run(now, usuario, now, p.id);
      }

      // Cerrar periodo
      db.prepare(`UPDATE nominas_periodos SET estado = 'CERRADO', total_nomina = ?, empleados_pagados = ?,
        cerrado_at = ?, cerrado_por = ?, updated_at = ? WHERE id = ?`)
        .run(totalNomina, empleadosPagados, now, usuario, now, periodoId);

      audit(req, 'CERRAR_NOMINA', 'nominas_periodos', periodoId,
        `Cerrada: ${empleadosPagados} empleados · $${totalNomina.toFixed(2)} total`);

      return db.prepare(`SELECT np.*, c.nombre AS caja_nombre FROM nominas_periodos np
        LEFT JOIN cajas c ON c.id = np.caja_id WHERE np.id = ?`).get(periodoId);
    });
    try { res.json(tx(req.params.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Recalcular sugerencias (cuando agregan empleado nuevo o cambian fecha)
  app.post('/api/nomina/periodos/:id/recalcular', auth, (req, res) => {
    try {
      const periodo = db.prepare('SELECT * FROM nominas_periodos WHERE id = ? AND deleted = 0').get(req.params.id);
      if (!periodo) return res.status(404).json({ error: 'periodo no existe' });
      if (periodo.estado === 'CERRADO') return res.status(400).json({ error: 'periodo cerrado' });

      const pagos = db.prepare(`SELECT np.*, e.tipo, e.vendedor_id FROM nominas_pagos np
        LEFT JOIN empleados e ON e.id = np.empleado_id
        WHERE np.periodo_id = ? AND np.deleted = 0`).all(req.params.id);

      const ranking = rankingSemanal(periodo.comisiones_desde, periodo.comisiones_hasta);
      const rankingMap = {};
      const bonosRank = db.prepare(`SELECT * FROM bonos_config WHERE tipo = 'RANKING' AND activo = 1 AND deleted = 0 ORDER BY posicion`).all();
      ranking.slice(0, bonosRank.length).forEach((r, i) => {
        rankingMap[r.vendedor_id] = { pos: i + 1, bono: bonosRank[i].monto };
      });

      let recalculados = 0;
      for (const p of pagos) {
        if (p.tipo !== 'VENDEDOR' || !p.vendedor_id) continue;
        const venta = calcComisionVendedor(p.vendedor_id, periodo.comisiones_desde, periodo.comisiones_hasta);
        const escalon = buscarEscalonComision(venta);
        let comTotal = 0;
        const detalle = { tipo: 'VENDEDOR', vendedor_id: p.vendedor_id, ventas_s1: venta, escalon: null,
          comision_base: 0, bono_meta: 0, ranking_pos: 0, ranking_bono: 0, bono_mensual: 0, total: 0 };
        if (escalon) {
          detalle.escalon = { venta_minima: escalon.venta_minima, pct: escalon.pct_comision };
          detalle.comision_base = venta * escalon.pct_comision;
          detalle.bono_meta = escalon.bono_meta;
          comTotal += detalle.comision_base + escalon.bono_meta;
        }
        if (rankingMap[p.vendedor_id]) {
          detalle.ranking_pos = rankingMap[p.vendedor_id].pos;
          detalle.ranking_bono = rankingMap[p.vendedor_id].bono;
          comTotal += rankingMap[p.vendedor_id].bono;
        }
        const bm = bonoMensualVendedor(p.vendedor_id, periodo.bono_mensual_mes);
        if (bm.bono > 0) {
          detalle.bono_mensual = bm.bono;
          detalle.bono_mensual_venta = bm.venta_mes;
          comTotal += bm.bono;
        }
        detalle.total = comTotal;
        const total = (Number(p.neto) || 0) + comTotal - (Number(p.prestamos_abonados) || 0);
        db.prepare('UPDATE nominas_pagos SET comisiones = ?, comisiones_detalle = ?, total = ?, updated_at = ? WHERE id = ?')
          .run(comTotal, JSON.stringify(detalle), total, Date.now(), p.id);
        recalculados++;
      }
      res.json({ ok: true, recalculados });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Eliminar/cancelar periodo (solo si está ABIERTO)
  app.delete('/api/nomina/periodos/:id', auth, (req, res) => {
    try {
      const p = db.prepare('SELECT * FROM nominas_periodos WHERE id = ?').get(req.params.id);
      if (!p) return res.status(404).json({ error: 'no existe' });
      if (p.estado === 'CERRADO') return res.status(400).json({ error: 'no se puede eliminar un periodo CERRADO' });
      const now = Date.now();
      db.prepare(`UPDATE nominas_pagos SET deleted = 1, updated_at = ? WHERE periodo_id = ?`).run(now, req.params.id);
      db.prepare(`UPDATE nominas_periodos SET deleted = 1, estado = 'CANCELADO', updated_at = ? WHERE id = ?`).run(now, req.params.id);
      audit(req, 'DELETE', 'nominas_periodos', req.params.id, 'Cancelado');
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Stats rápidas
  app.get('/api/nomina/stats', auth, (req, res) => {
    try {
      const abierto = db.prepare(`SELECT id, fecha_inicio, fecha_fin,
        (SELECT COUNT(*) FROM nominas_pagos WHERE periodo_id = nominas_periodos.id AND deleted = 0) AS pagos,
        (SELECT COALESCE(SUM(total),0) FROM nominas_pagos WHERE periodo_id = nominas_periodos.id AND deleted = 0) AS total
        FROM nominas_periodos WHERE estado = 'ABIERTO' AND deleted = 0 LIMIT 1`).get();
      const empleadosActivos = db.prepare(`SELECT COUNT(*) AS n FROM empleados WHERE deleted = 0 AND activo = 1`).get().n;
      const prestamosActivos = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(saldo_actual),0) AS saldo
        FROM prestamos WHERE deleted = 0 AND estado = 'ACTIVO'`).get();
      res.json({ periodo_abierto: abierto, empleados_activos: empleadosActivos, prestamos_activos: prestamosActivos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------- Préstamos --------
  app.get('/api/nomina/prestamos', auth, (req, res) => {
    try {
      const estado = req.query.estado;
      let sql = `SELECT pr.*, e.numero AS empleado_numero, c.nombre AS caja_origen_nombre,
        (SELECT COUNT(*) FROM prestamos_abonos WHERE prestamo_id = pr.id AND deleted = 0) AS abonos_count,
        (SELECT COALESCE(SUM(monto),0) FROM prestamos_abonos WHERE prestamo_id = pr.id AND deleted = 0) AS abonado_total
        FROM prestamos pr
        LEFT JOIN empleados e ON e.id = pr.empleado_id
        LEFT JOIN cajas c ON c.id = pr.caja_origen
        WHERE pr.deleted = 0`;
      const args = [];
      if (estado && estado !== 'TODOS') { sql += ' AND pr.estado = ?'; args.push(estado); }
      sql += ` ORDER BY CASE pr.estado WHEN 'ACTIVO' THEN 0 WHEN 'SALDADO' THEN 1 ELSE 2 END, pr.fecha DESC`;
      res.json(db.prepare(sql).all(...args));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/nomina/prestamos/:id', auth, (req, res) => {
    try {
      const pr = db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ? AND pr.deleted = 0`).get(req.params.id);
      if (!pr) return res.status(404).json({ error: 'no existe' });
      const abonos = db.prepare(`SELECT pa.*, c.nombre AS caja_nombre FROM prestamos_abonos pa
        LEFT JOIN cajas c ON c.id = pa.caja_id
        WHERE pa.prestamo_id = ? AND pa.deleted = 0
        ORDER BY pa.fecha DESC`).all(req.params.id);
      res.json({ ...pr, abonos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Crear préstamo (genera mov GASTO en categoría especial PRESTAMOS EMPLEADOS, autoexcluida del P&L)
  app.post('/api/nomina/prestamos', auth, (req, res) => {
    const tx = db.transaction((body) => {
      const empId = body.empleado_id;
      if (!empId) throw new Error('empleado_id requerido');
      const emp = db.prepare('SELECT * FROM empleados WHERE id = ? AND deleted = 0').get(empId);
      if (!emp) throw new Error('empleado no existe');
      const monto = Number(body.monto_original) || 0;
      if (!(monto > 0)) throw new Error('monto inválido');
      const cajaId = body.caja_origen;
      if (!cajaId) throw new Error('caja_origen requerida');
      const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
      if (!caja) throw new Error('caja no existe');
      const fecha = (body.fecha || new Date().toISOString().slice(0,10)).slice(0,10);
      const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
      const id = body.id || newPrestamoId();
      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';

      // Mov GASTO de entrega
      const movId = newMovId('pr');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?, 'prestamo', ?, ?, 0)`).run(
        movId, fecha, CAT_PRESTAMO, `Préstamo a ${emp.nombre}`, monto, metodo, cajaId,
        usuario, body.motivo || '', req.user?.id || null, now
      );

      db.prepare(`INSERT INTO prestamos
        (id, empleado_id, empleado_nombre, fecha, monto_original, saldo_actual, abono_sugerido_semanal,
         motivo, caja_origen, metodo, estado, mov_entrega_id, comentario, usuario, user_id, created_at, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?, ?, ?, ?, 0)
      `).run(id, empId, emp.nombre, fecha, monto, monto,
        Number(body.abono_sugerido_semanal) || 0, body.motivo || null,
        cajaId, metodo, movId, body.comentario || null,
        usuario, req.user?.id || null, now, now);

      audit(req, 'CREATE', 'prestamos', id, `${emp.nombre} · $${monto.toFixed(2)}`);

      return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(id);
    });
    try { res.json(tx(req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Abonar a un préstamo (manual, no descuento de nómina)
  app.post('/api/nomina/prestamos/:id/abonar', auth, (req, res) => {
    const tx = db.transaction((prestamoId, body) => {
      const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
      if (!pr) throw new Error('préstamo no existe');
      if (pr.estado !== 'ACTIVO') throw new Error('préstamo no está activo');
      const monto = Number(body.monto) || 0;
      if (!(monto > 0)) throw new Error('monto inválido');
      if (monto > pr.saldo_actual + 0.01) throw new Error(`monto excede saldo (${pr.saldo_actual})`);
      const cajaId = body.caja_id;
      if (!cajaId) throw new Error('caja_id requerida (a dónde entra el dinero)');
      const caja = db.prepare('SELECT * FROM cajas WHERE id = ? AND deleted = 0').get(cajaId);
      if (!caja) throw new Error('caja no existe');
      const fecha = (body.fecha || new Date().toISOString().slice(0,10)).slice(0,10);
      const metodo = (body.metodo || 'EFECTIVO').toUpperCase();
      const id = newAbonoId();
      const now = Date.now();
      const usuario = req.user?.nombre || 'sistema';

      // Mov INGRESO
      const movId = newMovId('ab');
      db.prepare(`INSERT INTO movs (
        id, fecha, tipo, categoria, concepto, monto, metodo, caja,
        usuario, notas, src, user_id, updated_at, deleted
      ) VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, 'abono-prestamo', ?, ?, 0)`).run(
        movId, fecha, CAT_ABONO, `Abono de ${pr.empleado_nombre}`, monto, metodo, cajaId,
        usuario, body.comentario || '', req.user?.id || null, now
      );

      db.prepare(`INSERT INTO prestamos_abonos
        (id, prestamo_id, periodo_id, fecha, monto, metodo, caja_id, mov_id, comentario, usuario, user_id, updated_at, deleted)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, prestamoId, fecha, monto, metodo, cajaId, movId,
        body.comentario || null, usuario, req.user?.id || null, now);

      const nuevoSaldo = Math.round((Number(pr.saldo_actual) - monto) * 100) / 100;
      const nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
      db.prepare(`UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?`)
        .run(nuevoSaldo, nuevoEstado, nuevoEstado === 'SALDADO' ? fecha : null, now, prestamoId);
      audit(req, 'ABONO', 'prestamos', prestamoId, `$${monto.toFixed(2)} de ${pr.empleado_nombre} · saldo: $${nuevoSaldo.toFixed(2)}`);

      return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
    });
    try { res.json(tx(req.params.id, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Cancelar préstamo (revierte movs)
  app.delete('/api/nomina/prestamos/:id', auth, requirePin, (req, res) => {
    const tx = db.transaction((id) => {
      const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(id);
      if (!pr) throw new Error('no existe');
      const now = Date.now();
      if (pr.mov_entrega_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, pr.mov_entrega_id);
      const abonos = db.prepare('SELECT mov_id FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0').all(id);
      for (const a of abonos) {
        if (a.mov_id) db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, a.mov_id);
      }
      db.prepare('UPDATE prestamos_abonos SET deleted = 1, updated_at = ? WHERE prestamo_id = ?').run(now, id);
      db.prepare(`UPDATE prestamos SET deleted = 1, estado = 'CANCELADO', updated_at = ? WHERE id = ?`).run(now, id);
      audit(req, 'DELETE', 'prestamos', id, `Cancelado: ${pr.empleado_nombre}`);
      return { ok: true };
    });
    try { res.json(tx(req.params.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ============================================================================
  // EDICIÓN Y BORRADO DE PRÉSTAMOS Y ABONOS  (admin/gerente, con PIN)
  // Insertar en server.js junto a los demás endpoints de /api/nomina/prestamos
  // ============================================================================

  // Helper local: recalcula saldo_actual y estado de un préstamo desde sus abonos vivos.
  // Fuente de verdad: saldo_actual = monto_original - SUM(abonos no borrados).
  function recalcPrestamo(db, prestamoId, now) {
    const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
    if (!pr) throw new Error('préstamo no existe');
    const row = db.prepare(
      'SELECT COALESCE(SUM(monto), 0) AS abonado FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0'
    ).get(prestamoId);
    const abonado = Number(row.abonado) || 0;
    const nuevoSaldo = Math.max(0, Number(pr.monto_original) - abonado);
    // Si estaba CANCELADO, no lo reactivamos automáticamente.
    let nuevoEstado = pr.estado;
    if (pr.estado !== 'CANCELADO') {
      nuevoEstado = nuevoSaldo <= 0.01 ? 'SALDADO' : 'ACTIVO';
    }
    const fechaSaldado = nuevoEstado === 'SALDADO' ? (pr.fecha_saldado || new Date().toISOString().slice(0, 10)) : null;
    db.prepare('UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_saldado = ?, updated_at = ? WHERE id = ?')
      .run(nuevoSaldo, nuevoEstado, fechaSaldado, now, prestamoId);
    return { saldo_actual: nuevoSaldo, estado: nuevoEstado };
  }

  // ---------------------------------------------------------------------------
  // 1) EDITAR PRÉSTAMO  ·  PUT /api/nomina/prestamos/:id   (requirePin)
  //    Edita: monto_original, motivo, abono_sugerido_semanal, comentario.
  //    Si cambia monto_original, recalcula saldo y estado desde los abonos.
  //    NO toca abonos ni el movimiento de entrega.
  // ---------------------------------------------------------------------------
  app.put('/api/nomina/prestamos/:id', auth, requirePin, (req, res) => {
    const tx = db.transaction((prestamoId, body) => {
      const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
      if (!pr) throw new Error('préstamo no existe');

      const now = Date.now();
      const montoOriginal = (body.monto_original != null) ? Number(body.monto_original) : Number(pr.monto_original);
      if (!(montoOriginal > 0)) throw new Error('monto_original inválido');

      const abonadoRow = db.prepare(
        'SELECT COALESCE(SUM(monto),0) AS abonado FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0'
      ).get(prestamoId);
      const abonado = Number(abonadoRow.abonado) || 0;
      if (montoOriginal + 0.01 < abonado) {
        throw new Error(`el monto (${montoOriginal.toFixed(2)}) no puede ser menor a lo ya abonado (${abonado.toFixed(2)})`);
      }

      const motivo = (body.motivo != null) ? String(body.motivo) : pr.motivo;
      const sugerido = (body.abono_sugerido_semanal != null) ? Number(body.abono_sugerido_semanal) : Number(pr.abono_sugerido_semanal || 0);
      const comentario = (body.comentario != null) ? String(body.comentario) : pr.comentario;

      db.prepare(`UPDATE prestamos
        SET monto_original = ?, motivo = ?, abono_sugerido_semanal = ?, comentario = ?, updated_at = ?
        WHERE id = ?`).run(montoOriginal, motivo, sugerido, comentario, now, prestamoId);

      // Si el préstamo se entregó vía movimiento GASTO y cambió el monto original,
      // ajustamos ese movimiento de entrega para que la caja refleje lo correcto.
      if (Number(montoOriginal) !== Number(pr.monto_original) && pr.mov_entrega_id) {
        const movEntrega = db.prepare('SELECT * FROM movs WHERE id = ? AND deleted = 0').get(pr.mov_entrega_id);
        if (movEntrega) {
          db.prepare('UPDATE movs SET monto = ?, updated_at = ? WHERE id = ?')
            .run(montoOriginal, now, pr.mov_entrega_id);
        }
      }

      const r = recalcPrestamo(db, prestamoId, now);
      audit(req, 'EDITAR', 'prestamos', prestamoId,
        `Préstamo de ${pr.empleado_nombre} editado · monto $${montoOriginal.toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

      return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
    });
    try { res.json(tx(req.params.id, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---------------------------------------------------------------------------
  // 2) EDITAR ABONO  ·  PUT /api/nomina/prestamos/:id/abonos/:abonoId  (requirePin)
  //    Cambia monto y/o comentario de un abono. Ajusta el mov INGRESO asociado
  //    (si lo hay) y recalcula saldo/estado del préstamo.
  // ---------------------------------------------------------------------------
  app.put('/api/nomina/prestamos/:id/abonos/:abonoId', auth, requirePin, (req, res) => {
    const tx = db.transaction((prestamoId, abonoId, body) => {
      const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
      if (!pr) throw new Error('préstamo no existe');
      const ab = db.prepare('SELECT * FROM prestamos_abonos WHERE id = ? AND prestamo_id = ? AND deleted = 0').get(abonoId, prestamoId);
      if (!ab) throw new Error('abono no existe');

      const now = Date.now();
      const nuevoMonto = (body.monto != null) ? Number(body.monto) : Number(ab.monto);
      if (!(nuevoMonto > 0)) throw new Error('monto inválido');

      // Validar que el total de abonos no supere el monto original del préstamo.
      const otrosRow = db.prepare(
        'SELECT COALESCE(SUM(monto),0) AS total FROM prestamos_abonos WHERE prestamo_id = ? AND deleted = 0 AND id != ?'
      ).get(prestamoId, abonoId);
      const otros = Number(otrosRow.total) || 0;
      if (otros + nuevoMonto > Number(pr.monto_original) + 0.01) {
        throw new Error(`el total de abonos ($${(otros + nuevoMonto).toFixed(2)}) excede el monto del préstamo ($${Number(pr.monto_original).toFixed(2)})`);
      }

      const comentario = (body.comentario != null) ? String(body.comentario) : ab.comentario;

      // Ajustar el movimiento de caja asociado, si existe (abonos por descuento de
      // nómina no tienen mov_id).
      if (ab.mov_id) {
        const mov = db.prepare('SELECT * FROM movs WHERE id = ? AND deleted = 0').get(ab.mov_id);
        if (mov) {
          db.prepare('UPDATE movs SET monto = ?, updated_at = ? WHERE id = ?').run(nuevoMonto, now, ab.mov_id);
        }
      }

      db.prepare('UPDATE prestamos_abonos SET monto = ?, comentario = ?, updated_at = ? WHERE id = ?')
        .run(nuevoMonto, comentario, now, abonoId);

      const r = recalcPrestamo(db, prestamoId, now);
      audit(req, 'EDITAR', 'prestamos_abonos', abonoId,
        `Abono de ${pr.empleado_nombre}: $${Number(ab.monto).toFixed(2)} → $${nuevoMonto.toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

      return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
    });
    try { res.json(tx(req.params.id, req.params.abonoId, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---------------------------------------------------------------------------
  // 3) BORRAR ABONO  ·  DELETE /api/nomina/prestamos/:id/abonos/:abonoId  (requirePin)
  //    Marca el abono como borrado, revierte su mov INGRESO (si lo hay) y
  //    devuelve el monto al saldo del préstamo (reactiva a ACTIVO si procede).
  // ---------------------------------------------------------------------------
  app.delete('/api/nomina/prestamos/:id/abonos/:abonoId', auth, requirePin, (req, res) => {
    const tx = db.transaction((prestamoId, abonoId) => {
      const pr = db.prepare('SELECT * FROM prestamos WHERE id = ? AND deleted = 0').get(prestamoId);
      if (!pr) throw new Error('préstamo no existe');
      const ab = db.prepare('SELECT * FROM prestamos_abonos WHERE id = ? AND prestamo_id = ? AND deleted = 0').get(abonoId, prestamoId);
      if (!ab) throw new Error('abono no existe');

      const now = Date.now();

      // Revertir el ingreso en caja, si el abono generó movimiento.
      if (ab.mov_id) {
        db.prepare('UPDATE movs SET deleted = 1, updated_at = ? WHERE id = ?').run(now, ab.mov_id);
      }
      db.prepare('UPDATE prestamos_abonos SET deleted = 1, updated_at = ? WHERE id = ?').run(now, abonoId);

      const r = recalcPrestamo(db, prestamoId, now);
      audit(req, 'BORRAR', 'prestamos_abonos', abonoId,
        `Abono de ${pr.empleado_nombre} eliminado: $${Number(ab.monto).toFixed(2)} · saldo $${r.saldo_actual.toFixed(2)}`);

      return db.prepare(`SELECT pr.*, c.nombre AS caja_origen_nombre FROM prestamos pr
        LEFT JOIN cajas c ON c.id = pr.caja_origen WHERE pr.id = ?`).get(prestamoId);
    });
    try { res.json(tx(req.params.id, req.params.abonoId)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });


  // === FIN RUTAS DE NOMINA ===
};
