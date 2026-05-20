// =============================================================
// K-BOTANAS · reports.jsx — Módulo INTELIGENCIA Ejecutiva v1.0
// 2026-05-11 · Reemplaza el módulo de reportes anterior
// Dashboards ejecutivos, gráficos SVG, export Excel + PDF
// =============================================================

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const REPORTES_VERSION = '2.0.0';

// ----------- Estilos del módulo -----------
(function injectReportsStyles() {
  const oldIds = ['kb-reports-styles', 'kb-reports-styles-v1', 'kb-reports-styles-v2'];
  oldIds.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  const css = `
    .rp-wrap { padding: var(--pad); max-width: 1600px; margin: 0 auto; }
    .rp-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: var(--pad);
      padding-bottom: 14px; border-bottom: 2px solid var(--line);
    }
    .rp-title-block { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .rp-title-block h1 {
      font-family: var(--f-display); font-size: 28px; line-height: 1;
      color: var(--ink); margin: 0; letter-spacing: -.02em;
    }
    .rp-title-block .ver {
      font-family: var(--f-mono); font-size: 11px; font-weight: 600;
      color: var(--ink-soft); background: var(--bg-soft);
      padding: 4px 10px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
    }
    .rp-title-block .sub { font-size: 13px; color: var(--ink-soft); font-style: italic; }

    /* ===== TOOLBAR ===== */
    .rp-toolbar {
      display: flex; gap: 8px; align-items: end; flex-wrap: wrap;
      padding: 14px 16px; background: var(--surface);
      border: 2px solid var(--line-strong); border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm); margin-bottom: var(--gap);
    }
    .rp-toolbar label {
      display: block; font-size: 10px; font-weight: 700;
      color: var(--ink-soft); margin: 0 0 4px;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .rp-toolbar .rp-input {
      padding: 7px 10px; border: 2px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); font-family: var(--f-body); font-size: 13px;
    }
    .rp-toolbar .rp-btn { padding: 7px 14px; border-radius: var(--radius-sm);
      font-weight: 700; font-size: 12px; border: 2px solid var(--line-strong);
      cursor: pointer; box-shadow: var(--shadow-sm); transition: transform .08s;
      display: inline-flex; align-items: center; gap: 5px; text-transform: uppercase;
      letter-spacing: .4px; background: var(--surface); color: var(--ink); }
    .rp-toolbar .rp-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: var(--shadow-md); }
    .rp-toolbar .rp-btn-primary { background: var(--primary); color: white; }
    .rp-toolbar .rp-btn-excel { background: #10B981; color: white; border-color: #047857; }
    .rp-toolbar .rp-btn-pdf { background: #EF4444; color: white; border-color: #991B1B; }
    .rp-toolbar .rp-quick {
      padding: 4px 10px; font-size: 11px; border-radius: 999px;
      background: var(--bg-soft); border: 1.5px solid var(--line);
      cursor: pointer; font-weight: 700; color: var(--ink);
      text-transform: uppercase; letter-spacing: .4px;
    }
    .rp-toolbar .rp-quick.active { background: var(--primary); color: white; border-color: var(--primary); }

    /* ===== KPI GRID ===== */
    .rp-kpi-grid {
      display: grid; gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      margin-bottom: var(--gap);
    }
    .rp-kpi {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: 14px 16px;
      box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
    }
    .rp-kpi::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0;
      width: 5px; background: var(--kc, var(--primary));
    }
    .rp-kpi .lbl {
      font-size: 10px; font-weight: 800; color: var(--ink-soft);
      text-transform: uppercase; letter-spacing: .7px;
      padding-left: 6px; margin-bottom: 5px;
    }
    .rp-kpi .val {
      font-family: var(--f-mono); font-size: 22px; font-weight: 800;
      color: var(--ink); font-variant-numeric: tabular-nums;
      line-height: 1.1; padding-left: 6px;
    }
    .rp-kpi .sub {
      font-size: 11px; color: var(--ink-soft); margin-top: 6px; padding-left: 6px;
      display: flex; align-items: center; gap: 5px;
    }
    .rp-kpi .var-up   { color: #10B981; font-weight: 700; }
    .rp-kpi .var-down { color: #EF4444; font-weight: 700; }
    .rp-kpi .var-neutral { color: var(--ink-soft); }

    /* Variantes color */
    .rp-kpi.ingresos { --kc: #10B981; }
    .rp-kpi.gastos   { --kc: #EF4444; }
    .rp-kpi.neto     { --kc: #3B82F6; }
    .rp-kpi.margen   { --kc: #8B5CF6; }
    .rp-kpi.ventas   { --kc: var(--primary); }
    .rp-kpi.ticket   { --kc: #F59E0B; }
    .rp-kpi.cortes   { --kc: #06B6D4; }
    .rp-kpi.devol    { --kc: #DC2626; }
    .rp-kpi.diferencias { --kc: #F97316; }
    .rp-kpi.movs     { --kc: var(--ink-soft); }

    /* ===== SECTION CARD ===== */
    .rp-card {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: var(--pad);
      margin-bottom: var(--gap); box-shadow: var(--shadow-sm);
    }
    .rp-card-title {
      font-family: var(--f-display); font-size: 14px;
      color: var(--ink); margin: 0 0 14px;
      text-transform: uppercase; letter-spacing: .6px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding-bottom: 10px; border-bottom: 1.5px solid var(--line);
    }
    .rp-card-title .lbl { display: flex; align-items: center; gap: 8px; }
    .rp-card-title .sub-lbl { font-family: var(--f-body); font-size: 11px;
      color: var(--ink-soft); font-weight: 500; text-transform: none; letter-spacing: 0; }

    /* ===== GRID 2 columnas ===== */
    .rp-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap); margin-bottom: var(--gap); }
    .rp-row-2 > .rp-card { margin-bottom: 0; }
    @media (max-width: 900px) { .rp-row-2 { grid-template-columns: 1fr; } }

    /* ===== TABLAS ===== */
    .rp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .rp-table th {
      text-align: left; padding: 8px 10px; background: var(--bg-soft);
      font-weight: 700; color: var(--ink); font-size: 10px;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--line-strong); white-space: nowrap;
    }
    .rp-table td {
      padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--ink);
      vertical-align: middle;
    }
    .rp-table tr:hover td { background: var(--surface-2); }
    .rp-table .num { text-align: right; font-family: var(--f-mono);
      font-variant-numeric: tabular-nums; font-weight: 600; }
    .rp-table .rank {
      display: inline-block; width: 22px; height: 22px; line-height: 22px;
      text-align: center; background: var(--ink); color: var(--bg);
      border-radius: 50%; font-family: var(--f-mono); font-weight: 800;
      font-size: 11px;
    }
    .rp-table .rank-1 { background: #FFD700; color: #92400E; }
    .rp-table .rank-2 { background: #C0C0C0; color: #1F2937; }
    .rp-table .rank-3 { background: #CD7F32; color: white; }
    .rp-table .bar {
      display: inline-block; height: 8px; background: var(--primary-soft);
      border-radius: 4px; vertical-align: middle; margin-right: 6px;
      position: relative; overflow: hidden;
    }
    .rp-table .bar-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: var(--primary); border-radius: 4px;
    }

    /* ===== BADGES ===== */
    .rp-badge {
      display: inline-block; padding: 2px 7px; border-radius: 999px;
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; border: 1.5px solid;
    }
    .rp-badge-detalle  { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .rp-badge-mayoreo  { background: #DBEAFE; color: #1E40AF; border-color: #93C5FD; }
    .rp-badge-dulceria { background: #FCE7F3; color: #9D174D; border-color: #F9A8D4; }
    .rp-badge-maquila  { background: #E0E7FF; color: #3730A3; border-color: #A5B4FC; }
    .rp-badge-auto  { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }
    .rp-badge-dist  { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .rp-badge-warn  { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .rp-badge-bad   { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }
    .rp-badge-ok    { background: #DCFCE7; color: #166534; border-color: #86EFAC; }

    /* ===== EMPTY ===== */
    .rp-empty {
      text-align: center; padding: 30px 20px; color: var(--ink-soft);
      font-size: 13px; font-style: italic;
    }
    .rp-loading {
      display: flex; align-items: center; justify-content: center;
      padding: 40px; color: var(--ink-soft); font-style: italic;
    }
    .rp-error {
      background: #FEE2E2; color: #991B1B; padding: 12px 16px;
      border-radius: var(--radius-sm); border: 2px solid #FCA5A5;
      font-weight: 600;
    }

    /* ===== GRÁFICOS ===== */
    .rp-chart { width: 100%; }
    .rp-chart-tooltip {
      position: absolute; background: var(--ink); color: var(--bg);
      padding: 6px 10px; border-radius: 6px; font-family: var(--f-mono);
      font-size: 11px; pointer-events: none; opacity: 0;
      transition: opacity .15s; z-index: 100;
      white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.2);
    }

    /* ===== PRINT (PDF) ===== */
    @media print {
      body { background: white !important; overflow: visible !important; }
      .sidebar, .topbar, .bottom-nav, .rp-toolbar, .floating-capture-btn,
      .kbot-update-banner, [class*="install"], .modal-backdrop { display: none !important; }
      .main-area { padding: 0 !important; height: auto !important; }
      .app-shell { display: block !important; height: auto !important; }
      .rp-wrap { padding: 0; max-width: 100%; }
      .rp-card, .rp-kpi {
        page-break-inside: avoid; break-inside: avoid;
        box-shadow: none !important; border-color: #888 !important;
      }
      .rp-row-2 { grid-template-columns: 1fr 1fr !important; }
      .rp-kpi-grid { grid-template-columns: repeat(4, 1fr) !important; }
      .rp-print-only { display: block !important; }
      .rp-no-print { display: none !important; }
      @page { size: letter portrait; margin: 1.5cm 1.2cm; }
      .rp-print-header { display: flex !important; align-items: center;
        margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #000; }
      .rp-print-header img { width: 60px; height: 60px; margin-right: 12px; }
      .rp-print-header h1 { font-size: 22px; margin: 0; }
      .rp-print-header .meta { margin-left: auto; text-align: right; font-size: 11px; }
    }
    .rp-print-only { display: none; }
    .rp-print-header { display: none; }

    @media (max-width: 720px) {
      .rp-title-block h1 { font-size: 22px; }
      .rp-kpi .val { font-size: 18px; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'kb-reports-styles-v2';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ----------- Utils -----------
const fmtMXN = (n) => '$' + Number(n || 0).toLocaleString('es-MX',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMXNshort = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v < 0 ? '-' : '') + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v < 0 ? '-' : '') + '$' + (abs / 1e3).toFixed(1) + 'k';
  return (v < 0 ? '-' : '') + '$' + abs.toFixed(0);
};
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const fmtFecha = (iso) => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
const fmtFechaCorta = (iso) => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}` : '';
const hoyISO = () => {
  const d = new Date(); const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

const apiFetch = async (path, opts = {}) => {
  const tok = window.KBotAPI && window.KBotAPI.token && window.KBotAPI.token();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const r = await fetch(path, { ...opts, headers });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || 'Error ' + r.status);
  }
  return r.json();
};

const inteligenciaApi = {
  dashboard: (desde, hasta) =>
    apiFetch('/api/inteligencia/dashboard?desde=' + desde + '&hasta=' + hasta)
};

// ----------- Componente raíz -----------
function ReportsView() {
  const [desde, setDesde] = useState(() => addDaysISO(hoyISO(), -29));
  const [hasta, setHasta] = useState(hoyISO());
  const [preset, setPreset] = useState('mes');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const aplicarPreset = (p) => {
    setPreset(p);
    const h = hoyISO();
    setHasta(h);
    if (p === 'hoy') setDesde(h);
    else if (p === 'semana') setDesde(addDaysISO(h, -6));
    else if (p === 'mes') setDesde(addDaysISO(h, -29));
    else if (p === 'trimestre') setDesde(addDaysISO(h, -89));
    else if (p === 'anio') setDesde(addDaysISO(h, -364));
    else if (p === 'mes_actual') {
      setDesde(h.slice(0, 7) + '-01');
    } else if (p === 'anio_actual') {
      setDesde(h.slice(0, 4) + '-01-01');
    }
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await inteligenciaApi.dashboard(desde, hasta);
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const exportarExcel = () => {
    if (!data || !window.XLSX) { alert('Datos o XLSX no disponibles'); return; }
    const wb = window.XLSX.utils.book_new();

    // Hoja 1: KPIs
    const kpiRows = [
      ['REPORTE EJECUTIVO K-BOTANAS'],
      ['Periodo:', fmtFecha(data.rango.desde) + ' al ' + fmtFecha(data.rango.hasta)],
      ['Generado:', new Date().toLocaleString('es-MX')],
      [],
      ['INDICADOR', 'VALOR', 'PERIODO ANTERIOR', 'VARIACIÓN %'],
      ['Ingresos', data.kpis.ingresos, data.kpis.ingresos_prev, data.kpis.var_ingresos_pct.toFixed(1) + '%'],
      ['Gastos', data.kpis.gastos, data.kpis.gastos_prev, data.kpis.var_gastos_pct.toFixed(1) + '%'],
      ['Neto', data.kpis.neto, data.kpis.neto_prev, data.kpis.var_neto_pct.toFixed(1) + '%'],
      ['Margen %', data.kpis.margen_pct.toFixed(1) + '%', '', ''],
      ['Ventas (módulo)', data.kpis.ventas_total, data.kpis.ventas_total_prev, data.kpis.var_ventas_pct.toFixed(1) + '%'],
      ['# Operaciones venta', data.kpis.ventas_count, data.kpis.ventas_count_prev, ''],
      ['Ticket promedio', data.kpis.ticket_promedio, '', ''],
      ['# Movimientos', data.kpis.movs_count, '', ''],
      ['Cortes ruta', data.kpis.cortes_count, '', ''],
      ['Devoluciones', data.kpis.devoluciones_total, '', ''],
      ['Diferencias absolutas', data.kpis.diferencias_abs_total, '', '']
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(kpiRows), 'KPIs');

    // Hoja 2: Serie diaria
    const serieRows = [['Fecha', 'Ingresos', 'Gastos', 'Neto', 'Ventas', '# Ventas']];
    data.serie_diaria.forEach(s => serieRows.push([s.fecha, s.ingresos, s.gastos, s.neto, s.ventas, s.ventas_n]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(serieRows), 'Serie diaria');

    // Hoja 3: Por canal
    const canalRows = [['Canal', 'Total', '# Ops', '% del total']];
    data.por_canal.forEach(c => canalRows.push([c.canal, c.total, c.n, c.pct.toFixed(2) + '%']));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(canalRows), 'Por canal');

    // Hoja 4: P&L Ingresos y Gastos por grupo
    const plRows = [
      ['===== INGRESOS POR GRUPO ====='],
      ['Grupo', 'Total', '# Movs', '% Ingresos']
    ];
    data.por_grupo_ingreso.forEach(g => plRows.push([g.grupo, g.total, g.n, g.pct.toFixed(2) + '%']));
    plRows.push([], ['===== GASTOS POR GRUPO ====='], ['Grupo', 'Total', '# Movs', '% Gastos']);
    data.por_grupo_gasto.forEach(g => plRows.push([g.grupo, g.total, g.n, g.pct.toFixed(2) + '%']));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(plRows), 'P&L por grupo');

    // Hoja 5: Top vendedores
    const vendRows = [['#', 'Tipo', 'Código', 'Vendedor', 'Ruta', 'Ventas', '# Cortes', 'Diferencia prom', 'Devoluciones']];
    data.top_vendedores.forEach((v, i) => vendRows.push([
      i + 1, v.tipo, v.code || '', v.vendedor, v.ruta || '', v.ventas, v.cortes_count,
      v.diferencia_promedio, v.devoluciones
    ]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(vendRows), 'Top vendedores');

    // Hoja 6: Top clientes
    const cliRows = [['#', 'Cliente', 'Canal', 'Total', '# Ops', 'Ticket promedio']];
    data.top_clientes.forEach((c, i) => cliRows.push([i + 1, c.cliente, c.canal, c.total, c.count, c.ticket_promedio]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(cliRows), 'Top clientes');

    // Hoja 7: Rutas problema
    const rutRows = [['Ruta', '# Cortes', 'Dif promedio', 'Dif acumulada', 'Dif absoluta acum']];
    data.rutas_problema.forEach(r => rutRows.push([r.ruta, r.cortes_count, r.diferencia_promedio, r.diferencia_acum, r.diferencia_abs_acum]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rutRows), 'Rutas problema');

    // Hoja 8: Proveedores
    const provRows = [['#', 'Proveedor', 'Compras total', '# Órdenes']];
    data.top_proveedores.forEach((p, i) => provRows.push([i + 1, p.proveedor || 'SIN NOMBRE', p.compras_total, p.ordenes_count]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(provRows), 'Top proveedores');

    // Hoja 9: Saldos cajas
    const cajRows = [['Caja', 'Tipo', 'Saldo actual']];
    data.saldos_cajas.forEach(c => cajRows.push([c.nombre, c.tipo, c.saldo]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(cajRows), 'Saldos cajas');

    // Hoja 10: CxP antigüedad
    const cxpRows = [
      ['CUENTAS POR PAGAR'],
      ['Total adeudado', data.cxp_antiguedad.total],
      ['# Facturas pendientes', data.cxp_antiguedad.count],
      [],
      ['Antigüedad', 'Monto'],
      ['Vigente (0-30 días)', data.cxp_antiguedad.vigente],
      ['31-60 días', data.cxp_antiguedad.mes_1],
      ['Más de 60 días', data.cxp_antiguedad.mes_2_mas]
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(cxpRows), 'CxP');

    // Hoja 11: Auditoría
    const audRows = [['Fecha/Hora', 'Usuario', 'Rol', 'Acción', 'Entidad', 'Detalle', 'PIN']];
    data.ultimas_acciones.forEach(a => audRows.push([
      new Date(a.ts).toLocaleString('es-MX'),
      a.user_nombre || '', a.rol || '', a.accion || '', a.entidad || '', a.detalle || '',
      a.pin_validado ? 'SÍ' : ''
    ]));
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(audRows), 'Auditoría');

    const fname = `KBOTANAS-Reporte-${desde}-a-${hasta}.xlsx`;
    window.XLSX.writeFile(wb, fname);
  };

  const exportarPDF = () => {
    window.print();
  };

  if (loading && !data) {
    return (
      <div className="rp-wrap">
        <div className="rp-header">
          <div className="rp-title-block">
            <h1>📊 INTELIGENCIA</h1>
            <span className="ver">v{REPORTES_VERSION}</span>
          </div>
        </div>
        <div className="rp-loading">Cargando reportes ejecutivos…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-wrap">
        <div className="rp-error">⚠ Error: {error}</div>
        <button onClick={cargar} className="rp-btn">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rp-wrap">
      {/* Header normal */}
      <div className="rp-header rp-no-print">
        <div className="rp-title-block">
          <h1>📊 INTELIGENCIA</h1>
          <span className="ver">v{REPORTES_VERSION}</span>
          <span className="sub">dashboards ejecutivos · KPIs · análisis · proyecciones</span>
        </div>
      </div>

      {/* Header para PDF (solo visible al imprimir) */}
      <div className="rp-print-header rp-print-only">
        <img src="logo.png" alt="K-BOTANAS" />
        <div>
          <h1>K-BOTANAS · Reporte Ejecutivo</h1>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            Periodo: {fmtFecha(data.rango.desde)} al {fmtFecha(data.rango.hasta)} ({data.rango.dias} días)
          </div>
        </div>
        <div className="meta">
          <div>Generado: {new Date().toLocaleDateString('es-MX')}</div>
          <div>{new Date().toLocaleTimeString('es-MX')}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rp-toolbar rp-no-print">
        <div>
          <label>Desde</label>
          <input type="date" className="rp-input" value={desde}
            onChange={e => { setDesde(e.target.value); setPreset(''); }} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" className="rp-input" value={hasta}
            onChange={e => { setHasta(e.target.value); setPreset(''); }} />
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {['hoy','semana','mes','trimestre','anio','mes_actual','anio_actual'].map(p => (
            <button key={p} className={'rp-quick' + (preset === p ? ' active' : '')}
              onClick={() => aplicarPreset(p)}>
              {p === 'hoy' ? 'HOY' : p === 'semana' ? '7D' :
               p === 'mes' ? '30D' : p === 'trimestre' ? '90D' :
               p === 'anio' ? '1A' : p === 'mes_actual' ? 'MES ACT' : 'AÑO ACT'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="rp-btn" onClick={cargar} disabled={loading} title="Refrescar datos">
            {loading ? '↻ ...' : '↻ Refrescar'}
          </button>
          <button className="rp-btn rp-btn-excel" onClick={exportarExcel}>📊 Excel</button>
          <button className="rp-btn rp-btn-pdf" onClick={exportarPDF}>📄 PDF</button>
        </div>
      </div>

      <KpiSection data={data} />
      <SerieDiariaSection data={data} />
      <CanalSection data={data} />
      <PLSection data={data} />
      <VendedoresSection data={data} />
      <ClientesRutasRow data={data} />
      <ProveedoresCxpRow data={data} />
      <CajasAuditoriaRow data={data} />

      {/* Footer PDF */}
      <div className="rp-print-only" style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #888', fontSize: 9, color: '#888', textAlign: 'center' }}>
        K-Botanas · Reporte Ejecutivo · Generado automáticamente por Control de Caja v{REPORTES_VERSION}
      </div>
    </div>
  );
}

window.ReportsView = ReportsView;

// ============================================================
// SECCIÓN 1 — KPI Grid (12 indicadores ejecutivos)
// ============================================================
function KpiSection({ data }) {
  const k = data.kpis;
  const varClass = (v) => {
    if (v > 0.5) return 'var-up';
    if (v < -0.5) return 'var-down';
    return 'var-neutral';
  };
  const arrow = (v) => v > 0.5 ? '▲' : v < -0.5 ? '▼' : '•';

  return (
    <div className="rp-kpi-grid">
      <div className="rp-kpi ingresos">
        <div className="lbl">💵 Ingresos</div>
        <div className="val">{fmtMXN(k.ingresos)}</div>
        <div className="sub">
          <span className={varClass(k.var_ingresos_pct)}>{arrow(k.var_ingresos_pct)} {fmtPct(k.var_ingresos_pct)}</span>
          <span style={{ color: 'var(--ink-soft)' }}>vs anterior</span>
        </div>
      </div>
      <div className="rp-kpi gastos">
        <div className="lbl">💸 Gastos</div>
        <div className="val">{fmtMXN(k.gastos)}</div>
        <div className="sub">
          <span className={varClass(-k.var_gastos_pct)}>{arrow(-k.var_gastos_pct)} {fmtPct(k.var_gastos_pct)}</span>
          <span style={{ color: 'var(--ink-soft)' }}>vs anterior</span>
        </div>
      </div>
      <div className="rp-kpi neto">
        <div className="lbl">📊 Neto</div>
        <div className="val" style={{ color: k.neto >= 0 ? '#10B981' : '#EF4444' }}>{fmtMXN(k.neto)}</div>
        <div className="sub">
          <span className={varClass(k.var_neto_pct)}>{arrow(k.var_neto_pct)} {fmtPct(k.var_neto_pct)}</span>
          <span style={{ color: 'var(--ink-soft)' }}>vs anterior</span>
        </div>
      </div>
      <div className="rp-kpi margen">
        <div className="lbl">📈 Margen</div>
        <div className="val">{k.margen_pct.toFixed(1)}%</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>
          {k.margen_pct >= 30 ? 'Saludable' : k.margen_pct >= 10 ? 'Aceptable' : k.margen_pct >= 0 ? 'Bajo' : 'Negativo'}
        </div>
      </div>
      <div className="rp-kpi ventas">
        <div className="lbl">🛒 Ventas módulo</div>
        <div className="val">{fmtMXN(k.ventas_total)}</div>
        <div className="sub">
          <span className={varClass(k.var_ventas_pct)}>{arrow(k.var_ventas_pct)} {fmtPct(k.var_ventas_pct)}</span>
          <span style={{ color: 'var(--ink-soft)' }}>· {k.ventas_count} ops</span>
        </div>
      </div>
      <div className="rp-kpi ticket">
        <div className="lbl">🎫 Ticket promedio</div>
        <div className="val">{fmtMXN(k.ticket_promedio)}</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>{k.ventas_count} operaciones</div>
      </div>
      <div className="rp-kpi cortes">
        <div className="lbl">🚚 Cortes ruta</div>
        <div className="val">{k.cortes_count}</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>{fmtMXN(k.cortes_total_cobrado)} cobrado</div>
      </div>
      <div className="rp-kpi devol">
        <div className="lbl">↩️ Devoluciones</div>
        <div className="val">{fmtMXN(k.devoluciones_total)}</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>en cortes</div>
      </div>
      <div className="rp-kpi diferencias">
        <div className="lbl">⚖️ Dif. acumuladas</div>
        <div className="val">{fmtMXN(k.diferencias_abs_total)}</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>absoluto en cortes</div>
      </div>
      <div className="rp-kpi movs">
        <div className="lbl">📋 Movimientos</div>
        <div className="val">{k.movs_count}</div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>en el periodo</div>
      </div>
      <div className="rp-kpi" style={{ '--kc': '#10B981' }}>
        <div className="lbl">🏆 Mejor día (ventas)</div>
        <div className="val" style={{ fontSize: 14, fontFamily: 'var(--f-body)', fontWeight: 700 }}>
          {k.mejor_dia ? fmtFecha(k.mejor_dia.fecha) : '—'}
        </div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>
          {k.mejor_dia ? fmtMXN(k.mejor_dia.ventas) : 'sin datos'}
        </div>
      </div>
      <div className="rp-kpi" style={{ '--kc': '#EF4444' }}>
        <div className="lbl">📉 Día más bajo</div>
        <div className="val" style={{ fontSize: 14, fontFamily: 'var(--f-body)', fontWeight: 700 }}>
          {k.peor_dia ? fmtFecha(k.peor_dia.fecha) : '—'}
        </div>
        <div className="sub" style={{ color: 'var(--ink-soft)' }}>
          {k.peor_dia ? fmtMXN(k.peor_dia.ventas) : 'sin datos'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 2 — Serie diaria (gráfico de líneas SVG)
// ============================================================
function SerieDiariaSection({ data }) {
  const serie = data.serie_diaria || [];
  if (!serie.length) return null;

  const maxIng = Math.max(...serie.map(s => s.ingresos), 0);
  const maxGas = Math.max(...serie.map(s => s.gastos), 0);
  const maxVen = Math.max(...serie.map(s => s.ventas), 0);
  const max = Math.max(maxIng, maxGas, maxVen, 1);

  const W = 1100;
  const H = 280;
  const padL = 60, padR = 20, padT = 20, padB = 50;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xOf = (i) => padL + (i / Math.max(serie.length - 1, 1)) * innerW;
  const yOf = (v) => padT + innerH - (v / max) * innerH;

  const linePath = (key, color) => {
    let path = '';
    serie.forEach((s, i) => {
      const x = xOf(i);
      const y = yOf(s[key]);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    return path;
  };

  // Eje Y - 5 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    y: padT + innerH - p * innerH,
    val: max * p
  }));

  // Eje X - mostrar fechas espaciadas
  const xLabelEvery = Math.max(1, Math.floor(serie.length / 10));
  const xLabels = serie.map((s, i) => ({
    x: xOf(i), label: fmtFechaCorta(s.fecha), show: i % xLabelEvery === 0 || i === serie.length - 1
  }));

  return (
    <div className="rp-card">
      <div className="rp-card-title">
        <span className="lbl">📈 Tendencia diaria · {data.rango.dias} días</span>
        <span style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-soft)' }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 3, background: '#10B981', verticalAlign: 'middle', marginRight: 4 }} />Ingresos</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 3, background: '#EF4444', verticalAlign: 'middle', marginRight: 4 }} />Gastos</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--primary)', verticalAlign: 'middle', marginRight: 4 }} />Ventas</span>
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', minWidth: 700, height: H, display: 'block' }} className="rp-chart">
          {/* Grid lines */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={t.y} x2={W - padR} y2={t.y}
                stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3,3'} />
              <text x={padL - 8} y={t.y + 4} textAnchor="end"
                fontSize="10" fill="var(--ink-soft)" fontFamily="var(--f-mono)">
                {fmtMXNshort(t.val)}
              </text>
            </g>
          ))}
          {/* Líneas */}
          <path d={linePath('ingresos', '#10B981')} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath('gastos', '#EF4444')} fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath('ventas', 'var(--primary)')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6,3" />
          {/* Puntos */}
          {serie.map((s, i) => (
            <React.Fragment key={i}>
              {s.ingresos > 0 && <circle cx={xOf(i)} cy={yOf(s.ingresos)} r="3" fill="#10B981" />}
              {s.gastos > 0 && <circle cx={xOf(i)} cy={yOf(s.gastos)} r="3" fill="#EF4444" />}
              {s.ventas > 0 && <circle cx={xOf(i)} cy={yOf(s.ventas)} r="3" fill="var(--primary)" />}
            </React.Fragment>
          ))}
          {/* Eje X */}
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--ink)" strokeWidth="1.5" />
          {xLabels.filter(x => x.show).map((x, i) => (
            <text key={i} x={x.x} y={padT + innerH + 16} textAnchor="middle"
              fontSize="10" fill="var(--ink-soft)" fontFamily="var(--f-mono)">
              {x.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 3 — Distribución por canal (donut + tabla)
// ============================================================
function CanalSection({ data }) {
  const canales = data.por_canal || [];
  if (!canales.length) return (
    <div className="rp-card">
      <div className="rp-card-title"><span className="lbl">🛒 Ventas por canal</span></div>
      <div className="rp-empty">Sin ventas registradas en el periodo.</div>
    </div>
  );

  // Donut SVG
  const total = canales.reduce((s, c) => s + c.total, 0);
  const R = 80, RIN = 50, CX = 120, CY = 120;
  const COLORS = {
    DETALLE: '#FCD34D', MAYOREO: '#3B82F6', DULCERIA: '#EC4899',
    MAQUILA: '#8B5CF6', OTROS: '#9CA3AF'
  };

  let cumAngle = -Math.PI / 2;
  const arcs = canales.map(c => {
    const angle = (c.total / total) * Math.PI * 2;
    const x1 = CX + R * Math.cos(cumAngle);
    const y1 = CY + R * Math.sin(cumAngle);
    const x2 = CX + R * Math.cos(cumAngle + angle);
    const y2 = CY + R * Math.sin(cumAngle + angle);
    const xi1 = CX + RIN * Math.cos(cumAngle);
    const yi1 = CY + RIN * Math.sin(cumAngle);
    const xi2 = CX + RIN * Math.cos(cumAngle + angle);
    const yi2 = CY + RIN * Math.sin(cumAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${RIN} ${RIN} 0 ${large} 0 ${xi1} ${yi1} Z`;
    cumAngle += angle;
    return { canal: c.canal, color: COLORS[c.canal] || COLORS.OTROS, path, pct: c.pct, total: c.total, n: c.n };
  });

  return (
    <div className="rp-card">
      <div className="rp-card-title">
        <span className="lbl">🛒 Ventas por canal</span>
        <span className="sub-lbl">Total: {fmtMXN(total)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'center' }}>
        <svg viewBox="0 0 240 240" style={{ width: 240, height: 240 }}>
          {arcs.map((a, i) => (
            <path key={i} d={a.path} fill={a.color} stroke="white" strokeWidth="2" />
          ))}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="10" fill="var(--ink-soft)"
            fontFamily="var(--f-body)" fontWeight="700" letterSpacing="0.8">
            TOTAL
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize="16" fill="var(--ink)"
            fontFamily="var(--f-mono)" fontWeight="800">
            {fmtMXNshort(total)}
          </text>
        </svg>
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table">
            <thead><tr><th>Canal</th><th className="num">Total</th><th className="num">#</th><th className="num">%</th></tr></thead>
            <tbody>
              {canales.map((c, i) => (
                <tr key={i}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, background: COLORS[c.canal] || COLORS.OTROS, borderRadius: 3, marginRight: 8, verticalAlign: 'middle' }} />
                    <span className={'rp-badge rp-badge-' + c.canal.toLowerCase()}>{c.canal}</span>
                  </td>
                  <td className="num">{fmtMXN(c.total)}</td>
                  <td className="num">{c.n}</td>
                  <td className="num">{c.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 4 — Estado de Resultados (P&L) por grupo
// ============================================================
function PLSection({ data }) {
  const ingresos = data.por_grupo_ingreso || [];
  const gastos = data.por_grupo_gasto || [];
  const totalIng = data.kpis.ingresos;
  const totalGas = data.kpis.gastos;
  const neto = totalIng - totalGas;

  const barFor = (pct) => (
    <div className="bar" style={{ width: 60, background: '#E5E7EB' }}>
      <div className="bar-fill" style={{ width: Math.min(pct, 100) + '%', background: 'var(--primary)' }} />
    </div>
  );

  return (
    <div className="rp-row-2">
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">📥 Ingresos por grupo</span>
          <span className="sub-lbl" style={{ color: '#10B981', fontWeight: 700 }}>{fmtMXN(totalIng)}</span>
        </div>
        {ingresos.length === 0 ? <div className="rp-empty">Sin ingresos en el periodo</div> :
        <table className="rp-table">
          <thead><tr><th>Grupo</th><th className="num">#</th><th className="num">Total</th><th>%</th></tr></thead>
          <tbody>
            {ingresos.map((g, i) => (
              <tr key={i}>
                <td><strong>{g.grupo}</strong></td>
                <td className="num">{g.n}</td>
                <td className="num">{fmtMXN(g.total)}</td>
                <td className="num">
                  {barFor(g.pct)}
                  <span style={{ marginLeft: 4 }}>{g.pct.toFixed(1)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">📤 Gastos por grupo</span>
          <span className="sub-lbl" style={{ color: '#EF4444', fontWeight: 700 }}>{fmtMXN(totalGas)}</span>
        </div>
        {gastos.length === 0 ? <div className="rp-empty">Sin gastos en el periodo</div> :
        <table className="rp-table">
          <thead><tr><th>Grupo</th><th className="num">#</th><th className="num">Total</th><th>%</th></tr></thead>
          <tbody>
            {gastos.map((g, i) => (
              <tr key={i}>
                <td><strong>{g.grupo}</strong></td>
                <td className="num">{g.n}</td>
                <td className="num">{fmtMXN(g.total)}</td>
                <td className="num">
                  <div className="bar" style={{ width: 60, background: '#E5E7EB' }}>
                    <div className="bar-fill" style={{ width: Math.min(g.pct, 100) + '%', background: '#EF4444' }} />
                  </div>
                  <span style={{ marginLeft: 4 }}>{g.pct.toFixed(1)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
        <div style={{ marginTop: 12, padding: '10px 14px', background: neto >= 0 ? '#DCFCE7' : '#FEE2E2',
          borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between',
          fontWeight: 700, color: neto >= 0 ? '#166534' : '#991B1B', border: '2px solid ' + (neto >= 0 ? '#86EFAC' : '#FCA5A5') }}>
          <span>NETO DEL PERIODO</span>
          <span className="mono" style={{ fontFamily: 'var(--f-mono)' }}>{fmtMXN(neto)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 5 — Top vendedores
// ============================================================
function VendedoresSection({ data }) {
  const v = data.top_vendedores || [];
  return (
    <div className="rp-card">
      <div className="rp-card-title">
        <span className="lbl">🏆 Ranking de vendedores · {data.rango.dias} días</span>
        <span className="sub-lbl">{v.length} con actividad</span>
      </div>
      {v.length === 0 ? <div className="rp-empty">Sin actividad de vendedores en el periodo</div> :
      <div style={{ overflowX: 'auto' }}>
        <table className="rp-table">
          <thead>
            <tr>
              <th>#</th><th>Tipo</th><th>Código</th><th>Vendedor</th><th>Ruta</th>
              <th className="num">Ventas</th>
              <th className="num"># Cortes</th>
              <th className="num">Dif. promedio</th>
              <th className="num">Devoluciones</th>
            </tr>
          </thead>
          <tbody>
            {v.map((row, i) => {
              const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
              const difAbs = Math.abs(row.diferencia_promedio || 0);
              const difCls = difAbs < 50 ? 'rp-badge-ok' : difAbs < 500 ? 'rp-badge-warn' : 'rp-badge-bad';
              return (
                <tr key={row.vendedor_id}>
                  <td><span className={'rank ' + rankCls}>{i + 1}</span></td>
                  <td><span className={'rp-badge ' + (row.tipo === 'DISTRIBUIDOR' ? 'rp-badge-dist' : 'rp-badge-auto')}>
                    {row.tipo === 'DISTRIBUIDOR' ? 'DIST' : 'AUTO'}
                  </span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{row.code || '—'}</td>
                  <td><strong>{row.vendedor}</strong></td>
                  <td className="mono" style={{ fontSize: 12 }}>{row.ruta || '—'}</td>
                  <td className="num"><strong>{fmtMXN(row.ventas)}</strong></td>
                  <td className="num">{row.cortes_count}</td>
                  <td className="num"><span className={'rp-badge ' + difCls}>{fmtMXN(row.diferencia_promedio)}</span></td>
                  <td className="num">{fmtMXN(row.devoluciones)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

// ============================================================
// SECCIÓN 6 — Top clientes y Rutas problema (lado a lado)
// ============================================================
function ClientesRutasRow({ data }) {
  const clientes = data.top_clientes || [];
  const rutas = data.rutas_problema || [];
  return (
    <div className="rp-row-2">
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">👥 Top 10 clientes</span>
          <span className="sub-lbl">{clientes.length} con compras</span>
        </div>
        {clientes.length === 0 ? <div className="rp-empty">Sin clientes con ventas en el periodo</div> :
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table">
            <thead><tr><th>#</th><th>Cliente</th><th>Canal</th><th className="num">Total</th><th className="num">Ticket</th></tr></thead>
            <tbody>
              {clientes.slice(0, 10).map((c, i) => {
                const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                return (
                  <tr key={i}>
                    <td><span className={'rank ' + rankCls}>{i + 1}</span></td>
                    <td><strong>{c.cliente}</strong> <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>· {c.count} ops</span></td>
                    <td><span className={'rp-badge rp-badge-' + c.canal.toLowerCase()}>{c.canal}</span></td>
                    <td className="num">{fmtMXN(c.total)}</td>
                    <td className="num" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fmtMXN(c.ticket_promedio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">⚠️ Rutas con problemas</span>
          <span className="sub-lbl">Diferencias acumuladas</span>
        </div>
        {rutas.length === 0 ? <div className="rp-empty">Sin cortes con diferencias en el periodo</div> :
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table">
            <thead><tr><th>Ruta</th><th className="num">Cortes</th><th className="num">Dif. prom</th><th className="num">Dif. abs acum</th></tr></thead>
            <tbody>
              {rutas.map((r, i) => {
                const difAbs = Math.abs(r.diferencia_promedio || 0);
                const difCls = difAbs < 50 ? 'rp-badge-ok' : difAbs < 500 ? 'rp-badge-warn' : 'rp-badge-bad';
                return (
                  <tr key={i}>
                    <td><strong>{r.ruta}</strong></td>
                    <td className="num">{r.cortes_count}</td>
                    <td className="num"><span className={'rp-badge ' + difCls}>{fmtMXN(r.diferencia_promedio)}</span></td>
                    <td className="num">{fmtMXN(r.diferencia_abs_acum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 7 — Proveedores + CxP antigüedad
// ============================================================
function ProveedoresCxpRow({ data }) {
  const provs = data.top_proveedores || [];
  const cxp = data.cxp_antiguedad || { vigente: 0, mes_1: 0, mes_2_mas: 0, total: 0, count: 0 };

  const cxpMax = Math.max(cxp.vigente, cxp.mes_1, cxp.mes_2_mas, 1);

  return (
    <div className="rp-row-2">
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">🚛 Top proveedores · compras</span>
          <span className="sub-lbl">{provs.length} activos</span>
        </div>
        {provs.length === 0 ? <div className="rp-empty">Sin compras en el periodo</div> :
        <div style={{ overflowX: 'auto' }}>
          <table className="rp-table">
            <thead><tr><th>#</th><th>Proveedor</th><th className="num">Compras</th><th className="num"># Órdenes</th></tr></thead>
            <tbody>
              {provs.map((p, i) => {
                const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                return (
                  <tr key={i}>
                    <td><span className={'rank ' + rankCls}>{i + 1}</span></td>
                    <td><strong>{p.proveedor || 'SIN NOMBRE'}</strong></td>
                    <td className="num">{fmtMXN(p.compras_total)}</td>
                    <td className="num">{p.ordenes_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">💳 Cuentas por pagar · antigüedad</span>
          <span className="sub-lbl" style={{ color: '#EF4444', fontWeight: 700 }}>{fmtMXN(cxp.total)}</span>
        </div>
        {cxp.total === 0 ? <div className="rp-empty">Sin facturas pendientes</div> :
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', gap: 10, alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontWeight: 700, color: '#10B981' }}>Vigente</span>
            <div className="bar" style={{ width: '100%', height: 18, background: '#E5E7EB', borderRadius: 4 }}>
              <div className="bar-fill" style={{ width: ((cxp.vigente / cxpMax) * 100) + '%', background: '#10B981', height: '100%' }} />
            </div>
            <span className="num mono" style={{ fontWeight: 700 }}>{fmtMXN(cxp.vigente)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', gap: 10, alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontWeight: 700, color: '#F59E0B' }}>31-60 días</span>
            <div className="bar" style={{ width: '100%', height: 18, background: '#E5E7EB', borderRadius: 4 }}>
              <div className="bar-fill" style={{ width: ((cxp.mes_1 / cxpMax) * 100) + '%', background: '#F59E0B', height: '100%' }} />
            </div>
            <span className="num mono" style={{ fontWeight: 700 }}>{fmtMXN(cxp.mes_1)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', gap: 10, alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontWeight: 700, color: '#EF4444' }}>+ 60 días</span>
            <div className="bar" style={{ width: '100%', height: 18, background: '#E5E7EB', borderRadius: 4 }}>
              <div className="bar-fill" style={{ width: ((cxp.mes_2_mas / cxpMax) * 100) + '%', background: '#EF4444', height: '100%' }} />
            </div>
            <span className="num mono" style={{ fontWeight: 700 }}>{fmtMXN(cxp.mes_2_mas)}</span>
          </div>
          <div style={{ marginTop: 14, padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>
            <strong>{cxp.count}</strong> factura{cxp.count === 1 ? '' : 's'} pendiente{cxp.count === 1 ? '' : 's'} de pago
          </div>
        </div>}
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN 8 — Saldos de cajas + Últimas acciones (auditoría)
// ============================================================
function CajasAuditoriaRow({ data }) {
  const cajas = data.saldos_cajas || [];
  const acciones = data.ultimas_acciones || [];
  const totalCajas = cajas.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="rp-row-2">
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">💼 Saldos de cajas</span>
          <span className="sub-lbl" style={{ color: 'var(--primary)', fontWeight: 700 }}>
            Total: {fmtMXN(totalCajas)}
          </span>
        </div>
        {cajas.length === 0 ? <div className="rp-empty">Sin cajas activas</div> :
        <table className="rp-table">
          <thead><tr><th>Caja</th><th>Tipo</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {cajas.map(c => (
              <tr key={c.id}>
                <td>
                  <span style={{ marginRight: 6 }}>
                    {c.tipo === 'EFECTIVO' ? '💵' : c.tipo === 'BANCO' ? '🏦' : '💳'}
                  </span>
                  <strong>{c.nombre}</strong>
                </td>
                <td><span className="rp-badge rp-badge-mayoreo">{c.tipo}</span></td>
                <td className="num" style={{ color: c.saldo < 0 ? '#EF4444' : 'var(--ink)', fontWeight: 700 }}>
                  {fmtMXN(c.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
      <div className="rp-card">
        <div className="rp-card-title">
          <span className="lbl">🔍 Auditoría · últimas acciones</span>
          <span className="sub-lbl">{acciones.length} eventos</span>
        </div>
        {acciones.length === 0 ? <div className="rp-empty">Sin auditoría registrada</div> :
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="rp-table" style={{ fontSize: 11 }}>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {acciones.map((a, i) => {
                const accColors = {
                  CREATE: '#10B981', UPDATE: '#3B82F6', DELETE: '#EF4444',
                  HARD_DELETE: '#991B1B', LOGIN: '#8B5CF6', PIN_VALIDADO: '#F59E0B'
                };
                const color = accColors[a.accion] || 'var(--ink-soft)';
                const fecha = new Date(a.ts);
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                      {fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })} {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <strong>{a.user_nombre || '?'}</strong>
                      {a.rol && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--ink-soft)' }}>· {a.rol}</span>}
                    </td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                        background: color, color: 'white', fontSize: 9, fontWeight: 800, letterSpacing: .4 }}>
                        {a.accion}
                      </span>
                      <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--ink-soft)' }}>{a.entidad}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.detalle}>
                      {a.detalle || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
