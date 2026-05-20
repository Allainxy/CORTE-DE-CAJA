// =============================================================
// K-BOTANAS · ventas-view.jsx v1.11.1
// 2026-05-11y · Tabla DETALLE auto-precargada estilo AlphaPyme
// =============================================================

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const VENTAS_VERSION = '1.11.2';

// ----------- Estilos -----------
(function injectVentasStyles() {
  const oldStyleIds = ['kb-ventas-styles', 'kb-ventas-styles-v111', 'kb-ventas-styles-v111-1'];
  oldStyleIds.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  const css = `
    .vt-wrap { padding: var(--pad); max-width: 1600px; margin: 0 auto; }

    .vt-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: var(--pad);
      padding-bottom: 14px; border-bottom: 2px solid var(--line);
    }
    .vt-title-block { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .vt-title-block h1 {
      font-family: var(--f-display); font-size: 28px; line-height: 1;
      color: var(--ink); margin: 0; letter-spacing: -.02em;
    }
    .vt-title-block .ver {
      font-family: var(--f-mono); font-size: 11px; font-weight: 600;
      color: var(--ink-soft); background: var(--bg-soft);
      padding: 4px 10px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
    }
    .vt-title-block .sub { font-size: 13px; color: var(--ink-soft); font-style: italic; }

    /* ===== STICKY QUICK FORM (siempre visible arriba) ===== */
    .vt-sticky-quick {
      position: sticky; top: 0; z-index: 5;
      background: linear-gradient(180deg, var(--primary-soft) 0%, var(--bg-soft) 100%);
      border: 2px solid var(--primary);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      margin-bottom: var(--gap);
      box-shadow: var(--shadow-sm);
    }
    .vt-sticky-quick-title {
      font-family: var(--f-display); font-size: 12px;
      color: var(--primary); text-transform: uppercase; letter-spacing: .8px;
      margin: 0 0 6px;
    }
    .vt-sticky-quick-row {
      display: grid; gap: 8px;
      grid-template-columns: 110px 1.5fr 100px 100px 1fr 1fr auto;
      align-items: end;
    }
    .vt-sticky-quick-row label { font-size: 9px; }
    .vt-sticky-quick-row .vt-input,
    .vt-sticky-quick-row .vt-select { padding: 6px 8px; font-size: 12px; }
    .vt-sticky-quick-row .vt-btn { padding: 6px 12px; font-size: 11px; }
    @media (max-width: 900px) {
      .vt-sticky-quick-row { grid-template-columns: 1fr 1fr; }
    }

    /* ===== TABS ===== */
    .vt-tabs {
      display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: var(--gap);
      border-bottom: 2px solid var(--line); padding: 0 2px;
    }
    .vt-tab {
      padding: 10px 18px; background: transparent; border: none;
      color: var(--ink-soft); font-weight: 700; font-size: 13px;
      cursor: pointer; border-bottom: 3px solid transparent;
      margin-bottom: -2px; transition: all .15s;
      display: inline-flex; align-items: center; gap: 6px;
      text-transform: uppercase; letter-spacing: .5px;
      font-family: var(--f-body);
    }
    .vt-tab:hover { color: var(--ink); }
    .vt-tab.active { color: var(--primary); border-bottom-color: var(--primary); }

    /* ===== CARD ===== */
    .vt-card {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: var(--pad);
      margin-bottom: var(--gap); box-shadow: var(--shadow-sm);
    }
    .vt-card-title {
      font-family: var(--f-display); font-size: 15px;
      color: var(--ink); margin: 0 0 14px;
      text-transform: uppercase; letter-spacing: .5px;
      display: flex; align-items: center; gap: 8px;
      padding-bottom: 10px; border-bottom: 1.5px solid var(--line);
    }

    /* ===== BUTTONS ===== */
    .vt-btn {
      padding: 9px 16px; border-radius: var(--radius-sm); font-weight: 700;
      font-size: 13px; border: 2px solid var(--line-strong);
      cursor: pointer; transition: transform .08s, box-shadow .08s;
      display: inline-flex; align-items: center; gap: 6px;
      text-transform: uppercase; letter-spacing: .4px;
      font-family: var(--f-body); box-shadow: var(--shadow-sm);
    }
    .vt-btn:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: var(--shadow-md); }
    .vt-btn:active:not(:disabled) { transform: translate(1px, 1px); box-shadow: none; }
    .vt-btn:disabled { opacity: .5; cursor: not-allowed; }
    .vt-btn-primary { background: var(--primary); color: white; }
    .vt-btn-ghost { background: var(--surface); color: var(--ink); }
    .vt-btn-success { background: var(--green); color: white; }
    .vt-btn-danger { background: var(--surface); color: var(--red); border-color: var(--red); }
    .vt-btn-sm { padding: 5px 10px; font-size: 11px; box-shadow: none; border-width: 1.5px; }
    .vt-btn-sm:hover:not(:disabled) { transform: none; box-shadow: var(--shadow-sm); }

    /* ===== INPUTS ===== */
    .vt-label {
      display: block; font-size: 11px; font-weight: 700;
      color: var(--ink-soft); margin: 0 0 5px;
      text-transform: uppercase; letter-spacing: .5px;
      font-family: var(--f-body);
    }
    .vt-input, .vt-select, .vt-textarea {
      width: 100%; padding: 9px 12px;
      border: 2px solid var(--line); border-radius: var(--radius-sm);
      font-size: 14px; color: var(--ink); background: var(--surface);
      outline: none; transition: border-color .15s, box-shadow .15s;
      font-family: var(--f-body);
    }
    .vt-input:focus, .vt-select:focus, .vt-textarea:focus {
      border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
    }
    .vt-input.mono { font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-weight: 600; }
    .vt-textarea { min-height: 70px; resize: vertical; }

    /* ===== QUICK FORM (in card) ===== */
    .vt-quick {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px; align-items: end;
    }
    .vt-quick .full { grid-column: 1 / -1; }

    /* ===== TABLE genérica ===== */
    .vt-table-wrap { overflow-x: auto; border-radius: var(--radius-sm); }
    .vt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .vt-table th {
      text-align: left; padding: 10px 12px; background: var(--bg-soft);
      font-weight: 700; color: var(--ink); font-size: 11px;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--line-strong); white-space: nowrap;
    }
    .vt-table td {
      padding: 9px 12px; border-bottom: 1px solid var(--line); color: var(--ink);
      vertical-align: middle;
    }
    .vt-table tr:hover td { background: var(--surface-2); }
    .vt-table .num { text-align: right; font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-weight: 600; }

    /* ===== BADGES ===== */
    .vt-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; font-family: var(--f-body);
      border: 1.5px solid;
    }
    .vt-badge-detalle  { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .vt-badge-mayoreo  { background: #DBEAFE; color: #1E40AF; border-color: #93C5FD; }
    .vt-badge-dulceria { background: #FCE7F3; color: #9D174D; border-color: #F9A8D4; }
    .vt-badge-maquila  { background: #E0E7FF; color: #3730A3; border-color: #A5B4FC; }
    .vt-badge-rapida   { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
    .vt-badge-autoventa    { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }
    .vt-badge-distribuidor { background: #DCFCE7; color: #166534; border-color: #86EFAC; }

    /* ===== KPI CARDS ===== */
    .vt-kpis {
      display: grid; gap: var(--gap);
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      margin-bottom: var(--gap);
    }
    .vt-kpi {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: 16px 18px;
      box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
      transition: transform .12s, box-shadow .12s;
    }
    .vt-kpi::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0;
      width: 6px; background: var(--kpi-color, var(--primary));
    }
    .vt-kpi:hover { transform: translate(-1px, -1px); box-shadow: var(--shadow-md); }
    .vt-kpi .lbl {
      font-size: 11px; font-weight: 800; color: var(--ink-soft);
      text-transform: uppercase; letter-spacing: .7px;
      margin-bottom: 6px; padding-left: 8px;
    }
    .vt-kpi .val {
      font-family: var(--f-mono); font-size: 24px; font-weight: 800;
      color: var(--ink); font-variant-numeric: tabular-nums;
      line-height: 1.1; padding-left: 8px;
    }
    .vt-kpi .sub { font-size: 12px; color: var(--ink-soft); margin-top: 4px; padding-left: 8px; }
    .vt-kpi .canales { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; padding-left: 8px; }
    .vt-kpi.hoy    { --kpi-color: var(--red); }
    .vt-kpi.semana { --kpi-color: var(--yellow); }
    .vt-kpi.mes    { --kpi-color: #3B82F6; }
    .vt-kpi.anio   { --kpi-color: var(--green); }

    .vt-band {
      background: var(--primary-soft); border: 2px solid var(--primary);
      border-radius: var(--radius-sm); padding: 10px 16px;
      margin-bottom: 14px; display: flex;
      justify-content: space-between; align-items: center; gap: 8px;
      flex-wrap: wrap;
    }
    .vt-band-label {
      font-weight: 700; color: var(--primary); font-size: 13px;
      text-transform: uppercase; letter-spacing: .4px;
    }
    .vt-band-value {
      font-family: var(--f-mono); font-weight: 800; color: var(--primary);
      font-size: 22px; font-variant-numeric: tabular-nums;
    }

    .vt-empty {
      text-align: center; padding: 50px 20px; color: var(--ink-soft);
      font-size: 14px; font-style: italic;
    }
    .vt-toolbar {
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      margin-bottom: 14px; padding-bottom: 12px;
      border-bottom: 1.5px solid var(--line);
    }
    .vt-error {
      background: #FEE2E2; color: #991B1B; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #FCA5A5;
      margin-bottom: 12px; font-size: 13px; font-weight: 600;
    }
    .vt-success {
      background: #DCFCE7; color: #166534; padding: 8px 14px;
      border-radius: var(--radius-sm); border: 2px solid #86EFAC;
      font-size: 13px; font-weight: 700;
      animation: vtPulse .4s ease-out;
    }
    @keyframes vtPulse {
      0% { transform: scale(.95); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    /* ===== TABLA EXCEL DE CORTES ===== */
    .vt-excel { overflow-x: auto; }
    .vt-excel table {
      width: 100%; border-collapse: collapse;
      font-family: var(--f-mono); font-size: 12px;
      min-width: 1400px;
    }
    .vt-excel th {
      position: sticky; top: 0; z-index: 2;
      background: var(--ink); color: var(--bg);
      padding: 8px 10px; text-align: center;
      font-family: var(--f-body); font-weight: 800; font-size: 10px;
      letter-spacing: .5px; border-right: 1px solid #444;
      white-space: nowrap;
    }
    .vt-excel th:first-child { text-align: left; }
    .vt-excel td {
      padding: 0; border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line); background: var(--surface);
    }
    .vt-excel td input, .vt-excel td select {
      width: 100%; padding: 7px 8px; border: none; outline: none;
      background: transparent; font-family: var(--f-mono); font-size: 12px;
      color: var(--ink); text-align: right; font-variant-numeric: tabular-nums;
    }
    .vt-excel td.text input, .vt-excel td.text select { text-align: left; }
    .vt-excel td input:focus, .vt-excel td select:focus {
      background: var(--primary-soft); box-shadow: inset 0 0 0 2px var(--primary);
    }
    .vt-excel td.calc {
      background: var(--bg-soft); padding: 7px 10px; text-align: right;
      font-weight: 700; color: var(--ink);
    }
    .vt-excel td.tipo-cell {
      padding: 7px 8px; text-align: center; background: var(--bg-soft);
    }
    .vt-excel td.dif-ok    { background: #DCFCE7; color: #166534; }
    .vt-excel td.dif-warn  { background: #FEF3C7; color: #92400E; }
    .vt-excel td.dif-bad   { background: #FEE2E2; color: #991B1B; font-weight: 800; }
    .vt-excel tr.row-dirty td { background: #FFFBEB; }
    .vt-excel tr.row-dirty td input { background: #FFFBEB; }
    .vt-excel tr.row-dirty td.calc { background: #FEF3C7; }
    .vt-excel tr.row-saving td { opacity: .5; }
    .vt-excel tr.row-dist td:first-child {
      border-left: 4px solid #166534;
    }
    .vt-excel tr.row-auto td:first-child {
      border-left: 4px solid #991B1B;
    }
    .vt-excel tfoot td {
      background: var(--ink); color: var(--bg); font-weight: 800;
      padding: 9px 10px; font-family: var(--f-body); text-align: right;
      font-size: 13px; position: sticky; bottom: 0;
    }
    .vt-excel tfoot td.first { text-align: left; }
    .vt-excel .actions-cell {
      padding: 4px 6px !important; background: var(--bg-soft) !important;
      text-align: center;
    }
    .vt-excel .actions-cell button {
      padding: 3px 7px; font-size: 10px; border-radius: 4px;
      background: white; border: 1px solid var(--line); cursor: pointer;
      font-weight: 700; color: var(--ink); margin: 0 1px;
    }
    .vt-excel .actions-cell button:hover { background: var(--primary-soft); }
    .vt-excel .actions-cell button.del { color: var(--red); border-color: var(--red); }
    .vt-excel .actions-cell button.del:hover { background: #FEE2E2; }
    .vt-excel .actions-cell button.save { color: var(--green); border-color: var(--green); }
    .vt-excel .actions-cell button.save:hover { background: #DCFCE7; }
    .vt-excel .row-vendedor {
      padding: 7px 10px; background: var(--surface);
      font-family: var(--f-body); font-weight: 600;
      font-size: 11px; color: var(--ink);
    }
    .vt-excel .row-vendedor small {
      color: var(--ink-soft); font-weight: 500; font-size: 10px;
    }

    .vt-legend {
      display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;
      font-size: 11px; color: var(--ink-soft);
    }
    .vt-legend-item { display: flex; align-items: center; gap: 5px; }
    .vt-legend-dot {
      width: 12px; height: 12px; border-radius: 3px; display: inline-block;
      border: 1px solid var(--line);
    }

    @media (max-width: 720px) {
      .vt-title-block h1 { font-size: 22px; }
      .vt-tab { padding: 8px 12px; font-size: 11px; }
      .vt-kpi .val { font-size: 20px; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'kb-ventas-styles-v111-1';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ----------- Utilidades -----------
const fmtMXN = (n) => '$' + Number(n || 0).toLocaleString('es-MX',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMXNshort = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
  return '$' + v.toFixed(0);
};
const hoyISO = () => {
  const d = new Date(); const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};
const fmtFecha = (iso) => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';

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

const api = {
  list:    (params = {}) => apiFetch('/api/ventas' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  create:  (body) => apiFetch('/api/ventas', { method: 'POST', body: JSON.stringify(body) }),
  remove:  (id) => apiFetch('/api/ventas/' + id, { method: 'DELETE' }),
  totales: () => apiFetch('/api/ventas/reportes/totales'),
  rutas: {
    list:    () => apiFetch('/api/ventas/rutas'),
    listAll: () => apiFetch('/api/ventas/rutas?todas=1'),
    create:  (nombre) => apiFetch('/api/ventas/rutas', { method: 'POST', body: JSON.stringify({ nombre }) }),
    update:  (id, body) => apiFetch('/api/ventas/rutas/' + id, { method: 'PUT', body: JSON.stringify(body) }),
    remove:  (id) => apiFetch('/api/ventas/rutas/' + id, { method: 'DELETE' })
  },
  vendedores: {
    list:    () => apiFetch('/api/ventas/vendedores'),
    listAll: () => apiFetch('/api/ventas/vendedores?todos=1'),
    create:  (body) => apiFetch('/api/ventas/vendedores', { method: 'POST', body: JSON.stringify(body) }),
    update:  (id, body) => apiFetch('/api/ventas/vendedores/' + id, { method: 'PUT', body: JSON.stringify(body) }),
    remove:  (id, hard = false) => apiFetch('/api/ventas/vendedores/' + id + (hard ? '?hard=1' : ''), { method: 'DELETE' })
  },
  cortes: {
    list:    (params = {}) => apiFetch('/api/ventas/cortes/detalle' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
    save:    (body) => apiFetch('/api/ventas/cortes/detalle', { method: 'POST', body: JSON.stringify(body) }),
    remove:  (id) => apiFetch('/api/ventas/cortes/detalle/' + id, { method: 'DELETE' })
  },
  cierresDia: {
    get:     (fecha) => apiFetch('/api/ventas/cierres-dia?fecha=' + encodeURIComponent(fecha)),
    cerrar:  (body)  => apiFetch('/api/ventas/cierres-dia/cerrar',  { method: 'POST', body: JSON.stringify(body) }),
    reabrir: (body)  => apiFetch('/api/ventas/cierres-dia/reabrir', { method: 'POST', body: JSON.stringify(body) })
  },
  // F5_FRONTEND — totales por canal del día (incluye DETALLE/MAYOREO/DULCERIA/MAQUILA)
  totalesDia: {
    get: (fecha) => apiFetch('/api/ventas/totales-dia?fecha=' + encodeURIComponent(fecha))
  },
};

// Parse cheque_vale y tarjetas desde comentario [cheque/vale=X.XX; tarjetas=Y.YY]
function parseExtraPagos(comentario) {
  if (!comentario) return { cheque_vale: 0, tarjetas: 0, comentario_limpio: '' };
  const re = /\[(cheque\/vale=[\d.]+(?:;\s*tarjetas=[\d.]+)?|tarjetas=[\d.]+)\]/;
  const m = comentario.match(re);
  if (!m) return { cheque_vale: 0, tarjetas: 0, comentario_limpio: comentario };
  const tag = m[0];
  const cv = /cheque\/vale=([\d.]+)/.exec(tag);
  const ta = /tarjetas=([\d.]+)/.exec(tag);
  return {
    cheque_vale: cv ? parseFloat(cv[1]) : 0,
    tarjetas: ta ? parseFloat(ta[1]) : 0,
    comentario_limpio: comentario.replace(tag, '').trim()
  };
}

// ----------- Componente raíz -----------
function VentasView(props) {
  const cajasFromApp = (props && props.cajas) || [];
  const [tab, setTab] = useState('DETALLE');
  const cajasActivas = useMemo(
    () => cajasFromApp.filter(c => !c.deleted && !c.archivada),
    [cajasFromApp]
  );

  const tabs = [
    { id: 'DETALLE',  label: '🚚 Detalle' },
    { id: 'MAYOREO',  label: '📦 Mayoreo' },
    { id: 'DULCERIA', label: '🍬 Dulcería' },
    { id: 'MAQUILA',  label: '🔧 Maquila' },
    { id: 'TOTALES',  label: '📊 Totales' },
    { id: 'GESTION',  label: '⚙️ Rutas / Vendedores' }
  ];

  return (
    <div className="vt-wrap">
      <div className="vt-header">
        <div className="vt-title-block">
          <h1>💰 VENTAS</h1>
          <span className="ver">v{VENTAS_VERSION}</span>
          <span className="sub">captura diaria · totales en vivo · vinculado a caja</span>
        </div>
      </div>

      {/* Form rápido sticky, siempre visible mientras navegues entre tabs */}
      <StickyQuickForm cajas={cajasActivas} />

      <div className="vt-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={'vt-tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'DETALLE'  && <DetalleExcelPanel cajas={cajasActivas} key="DETALLE" />}
      {tab === 'MAYOREO'  && <CanalSimplePanel canal="MAYOREO"  cajas={cajasActivas} key="MAYOREO" />}
      {tab === 'DULCERIA' && <CanalSimplePanel canal="DULCERIA" cajas={cajasActivas} key="DULCERIA" />}
      {tab === 'MAQUILA'  && <CanalSimplePanel canal="MAQUILA"  cajas={cajasActivas} key="MAQUILA" />}
      {tab === 'TOTALES'  && <TotalesPanel />}
      {tab === 'GESTION'  && <GestionPanel />}
    </div>
  );
}

// =====================================================
// STICKY QUICK FORM — siempre visible arriba del módulo
// =====================================================
function StickyQuickForm({ cajas }) {
  const [canal, setCanal] = useState('MAYOREO');
  const [cliente, setCliente] = useState('');
  const [importe, setImporte] = useState('');
  const [cajaId, setCajaId] = useState('');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }

  useEffect(() => {
    if (cajas.length && !cajaId) {
      const efectivo = cajas.find(c => c.tipo === 'EFECTIVO') || cajas[0];
      setCajaId(efectivo.id);
    }
  }, [cajas, cajaId]);

  const guardar = async () => {
    setMsg(null);
    const imp = parseFloat(importe);
    if (!(imp > 0)) { setMsg({ type: 'err', text: 'Importe inválido' }); return; }
    if (!cliente.trim()) { setMsg({ type: 'err', text: 'Cliente requerido' }); return; }
    if (!cajaId) { setMsg({ type: 'err', text: 'Selecciona caja' }); return; }
    setSaving(true);
    try {
      await api.create({
        canal, fecha: hoyISO(), importe: imp, caja_id: cajaId,
        cliente: cliente.trim(), comentario: comentario.trim() || null,
        origen: 'captura-rapida'
      });
      setMsg({ type: 'ok', text: '✓ Venta registrada' });
      setImporte(''); setCliente(''); setComentario('');
      window.kbotFullResync?.();
      setTimeout(() => setMsg(null), 2500);
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    setSaving(false);
  };

  return (
    <div className="vt-sticky-quick">
      <div className="vt-sticky-quick-title">⚡ Registro rápido</div>
      <div className="vt-sticky-quick-row">
        <div>
          <label className="vt-label">Canal</label>
          <select className="vt-select" value={canal} onChange={e => setCanal(e.target.value)}>
            <option value="MAYOREO">MAYOREO</option>
            <option value="DULCERIA">DULCERÍA</option>
            <option value="MAQUILA">MAQUILA</option>
          </select>
        </div>
        <div>
          <label className="vt-label">Cliente</label>
          <input className="vt-input" value={cliente}
            placeholder="ej. ABARROTES LA FE"
            onChange={e => setCliente(e.target.value)} />
        </div>
        <div>
          <label className="vt-label">Importe</label>
          <input className="vt-input mono" type="number" step="0.01" min="0"
            value={importe} placeholder="0.00"
            onChange={e => setImporte(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); }} />
        </div>
        <div>
          <label className="vt-label">Caja</label>
          <select className="vt-select" value={cajaId} onChange={e => setCajaId(e.target.value)}>
            <option value="">— sel —</option>
            {cajas.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon || (c.tipo === 'EFECTIVO' ? '💵' : '🏦')} {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vt-label">Comentario</label>
          <input className="vt-input" value={comentario} placeholder="opcional"
            onChange={e => setComentario(e.target.value)} />
        </div>
        <div>
          <button className="vt-btn vt-btn-primary" disabled={saving} onClick={guardar}>
            {saving ? '...' : '+ Registrar'}
          </button>
        </div>
      </div>
      {msg && (
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700,
          color: msg.type === 'ok' ? '#166534' : '#991B1B' }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// Export al scope global (las demás piezas se agregan después)
window.VentasView = VentasView;

// =====================================================
// PANEL DETALLE — AUTO-PRECARGADO (estilo AlphaPyme)
// =====================================================
function DetalleExcelPanel({ cajas }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [vendedores, setVendedores] = useState([]);
  const [cortes, setCortes] = useState([]); // cortes existentes del día
  const [extraRows, setExtraRows] = useState([]); // filas manuales agregadas (no asociadas a vendedor catálogo)
  const [edits, setEdits] = useState({}); // key: rowKey → { campos modificados }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [cajaEfecId, setCajaEfecId] = useState('');
  // F4_FRONTEND — estado de cierre de día
  const [cierreInfo, setCierreInfo] = useState({ cerrado: false, cierre: null });
  const [showCerrarModal, setShowCerrarModal] = useState(false);
  const [showReabrirModal, setShowReabrirModal] = useState(false);
  // F5_FRONTEND — totales del día por canal
  const [totalesDia, setTotalesDia] = useState(null);

  // Caja efectivo automática
  useEffect(() => {
    if (cajas.length && !cajaEfecId) {
      const e = cajas.find(c => c.tipo === 'EFECTIVO');
      if (e) setCajaEfecId(e.id);
    }
  }, [cajas, cajaEfecId]);

  // Cargar vendedores activos + cortes del día
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [vs, cs] = await Promise.all([
        api.vendedores.list(),
        api.cortes.list({ desde: fecha, hasta: fecha })
      ]);
      setVendedores(Array.isArray(vs) ? vs : []);
      setCortes(Array.isArray(cs) ? cs : []);
      setEdits({});
      setExtraRows([]);
      setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
    // F5_FRONTEND — refrescar totales al recargar cortes
    try { const t = await api.totalesDia.get(fecha); setTotalesDia(t); } catch (e) {}
  }, [fecha]);

  // BUGFIX_LOST_EDITS: recarga cortes y totales SIN pisar edits ni extraRows.
  // Se usa después de guardar/eliminar UNA fila para que las capturas en
  // progreso de las DEMÁS filas no se borren.
  const recargarCortes = useCallback(async () => {
    try {
      const cs = await api.cortes.list({ desde: fecha, hasta: fecha });
      setCortes(Array.isArray(cs) ? cs : []);
    } catch (e) { /* mantener cortes actuales */ }
    try { const t = await api.totalesDia.get(fecha); setTotalesDia(t); } catch (e) {}
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // F4_HOTFIX — handlers cierre/reapertura (usan respuesta directa del POST)
  const cargarCierre = useCallback(async () => {
    try {
      const info = await api.cierresDia.get(fecha);
      setCierreInfo(info || { cerrado: false, cierre: null });
    } catch (e) {
      console.error('[F4] error cargarCierre:', e);
      setCierreInfo({ cerrado: false, cierre: null });
    }
  }, [fecha]);

  // F5_FRONTEND — cargar totales del día por canal
  const cargarTotalesDia = useCallback(async () => {
    try {
      const t = await api.totalesDia.get(fecha);
      setTotalesDia(t);
    } catch (e) {
      console.error('[F5] error totalesDia:', e);
      setTotalesDia(null);
    }
  }, [fecha]);

  useEffect(() => { cargarTotalesDia(); }, [cargarTotalesDia]);

  useEffect(() => { cargarCierre(); }, [cargarCierre]);

  const ejecutarCerrar = async (comentario, pin) => {
    try {
      const resp = await api.cierresDia.cerrar({ fecha, comentario: comentario || null, pin });
      // Actualizar estado INMEDIATAMENTE con la respuesta del POST
      if (resp && resp.cierre) {
        setCierreInfo({ cerrado: true, cierre: resp.cierre, historial: [resp.cierre] });
      }
      setShowCerrarModal(false);
      // Refrescar en background (no esperamos — si falla, el state ya está correcto)
      cargarCierre().catch(e => console.error('[F4] refresh post-cerrar:', e));
      cargar();
    } catch (e) {
      console.error('[F4] error cerrar:', e);
      alert('No se pudo cerrar: ' + e.message);
    }
  };

  const ejecutarReabrir = async (motivo, pin) => {
    try {
      await api.cierresDia.reabrir({ fecha, motivo, pin });
      // Actualizar estado INMEDIATAMENTE — el cierre ya no está activo
      setCierreInfo({ cerrado: false, cierre: null });
      setShowReabrirModal(false);
      cargarCierre().catch(e => console.error('[F4] refresh post-reabrir:', e));
      cargar();
    } catch (e) {
      console.error('[F4] error reabrir:', e);
      alert('No se pudo reabrir: ' + e.message);
    }
  };

  const cerrado = !!(cierreInfo && cierreInfo.cerrado);

  // HOTFIX_BUG2_AUTORECOVER_423 — helper de recuperación automática cuando el backend devuelve 423 (día cerrado)
  const handleApiError = (e, defaultLabel) => {
    const msg = (e && e.message) || 'Error desconocido';
    if (/d[ií]a.+cerrado|cerrado.+d[ií]a|423/i.test(msg)) {
      // Refrescar estado de cierre para que el botón cambie a "Reabrir día"
      cargarCierre();
      const ofrecer = confirm(msg + '\n\n¿Quieres reabrir el día ahora? (requiere PIN admin/gerente)');
      if (ofrecer) setShowReabrirModal(true);
    } else {
      alert(defaultLabel + ': ' + msg);
    }
  };

  // Combinar vendedores y cortes existentes en una lista unificada
  // Cada fila tiene un rowKey único:
  //   - "v:<vendedor_id>" para filas auto-precargadas por vendedor del catálogo
  //   - "c:<corte_id>" para cortes ya guardados sin vendedor en catálogo
  //   - "x:<idx>" para filas manuales agregadas
  // La fila muestra datos del corte si existe, o vacío si solo es vendedor sin corte
  const filas = useMemo(() => {
    const list = [];
    const cortesByVendedor = {};
    const cortesSinVendedor = [];
    cortes.forEach(c => {
      if (c.vendedor_id) cortesByVendedor[c.vendedor_id] = c;
      else cortesSinVendedor.push(c);
    });
    vendedores.forEach(v => {
      const corte = cortesByVendedor[v.id];
      const extras = corte ? parseExtraPagos(corte.comentario) : { cheque_vale: 0, tarjetas: 0, comentario_limpio: '' };
      list.push({
        rowKey: 'v:' + v.id,
        corte_id: corte?.id || null,
        vendedor_id: v.id,
        vendedor_nombre: v.nombre,
        vendedor_codigo: v.sys_code,
        vendedor_zona: v.notas,
        vendedor_tipo: v.tipo || 'AUTOVENTA',
        ruta: corte?.ruta || v.ruta_default || '',
        venta_sistema: corte?.venta_sistema || 0,
        efectivo: corte?.efectivo || 0,
        cheque_vale: extras.cheque_vale,
        tarjetas: extras.tarjetas,
        credito: corte?.credito || 0,
        transferencia: corte?.transferencia || 0,
        gastos: corte?.gastos || 0,
        devoluciones: corte?.devoluciones || 0,
        gasolina: corte?.gasolina || 0,
        comentario: extras.comentario_limpio || ''
      });
    });
    cortesSinVendedor.forEach((c, idx) => {
      const extras = parseExtraPagos(c.comentario);
      list.push({
        rowKey: 'c:' + c.id,
        corte_id: c.id,
        vendedor_id: null,
        vendedor_nombre: '(sin vendedor)',
        vendedor_codigo: '',
        vendedor_zona: '',
        vendedor_tipo: 'AUTOVENTA',
        ruta: c.ruta,
        venta_sistema: c.venta_sistema || 0,
        efectivo: c.efectivo || 0,
        cheque_vale: extras.cheque_vale,
        tarjetas: extras.tarjetas,
        credito: c.credito || 0,
        transferencia: c.transferencia || 0,
        gastos: c.gastos || 0,
        devoluciones: c.devoluciones || 0,
        gasolina: c.gasolina || 0,
        comentario: extras.comentario_limpio || ''
      });
    });
    extraRows.forEach((r, idx) => {
      list.push({ ...r, rowKey: 'x:' + idx });
    });
    return list;
  }, [vendedores, cortes, extraRows]);

  // Obtener los valores actuales (base + edits)
  const getRowValues = (fila) => {
    const e = edits[fila.rowKey] || {};
    return { ...fila, ...e };
  };

  const isDirty = (rowKey) => !!edits[rowKey];

  const onChangeField = (rowKey, field, value) => {
    setEdits(prev => ({
      ...prev,
      [rowKey]: { ...(prev[rowKey] || {}), [field]: value }
    }));
  };

  const calcDif = (r) => {
    const v = Math.abs(Number(r.venta_sistema) || 0);
    return (Number(r.efectivo) || 0)
         + (Number(r.transferencia) || 0)
         + (Number(r.cheque_vale) || 0)
         + (Number(r.tarjetas) || 0)
         + (Number(r.credito) || 0)
         + (Number(r.gastos) || 0)
         - v;
  };
  const difClass = (diff) => {
    const abs = Math.abs(diff || 0);
    if (abs < 50)   return 'dif-ok';
    if (abs < 500)  return 'dif-warn';
    return 'dif-bad';
  };

  const guardarFila = async (fila) => {
    const r = getRowValues(fila);
    if (!r.ruta || !String(r.ruta).trim()) { alert('Ruta requerida'); return; }
    setSavingKey(fila.rowKey);
    try {
      const body = {
        fecha,
        ruta: String(r.ruta).toUpperCase(),
        vendedor_id: r.vendedor_id || null,
        vendedor_nombre: r.vendedor_nombre || null,
        venta_sistema: Math.abs(Number(r.venta_sistema) || 0),
        efectivo: Number(r.efectivo) || 0,
        transferencia: Number(r.transferencia) || 0,
        cheque_vale: Number(r.cheque_vale) || 0,
        tarjetas: Number(r.tarjetas) || 0,
        credito: Number(r.credito) || 0,
        gastos: Number(r.gastos) || 0,
        devoluciones: Number(r.devoluciones) || 0,
        gasolina: Number(r.gasolina) || 0,
        caja_efectivo_id: cajaEfecId,
        comentario: r.comentario || null
      };
      if (fila.corte_id) body.id = fila.corte_id;
      await api.cortes.save(body);
      // BUGFIX_LOST_EDITS: limpiar SOLO el edit de esta fila, preservar los demás.
      setEdits(prev => { const n = { ...prev }; delete n[fila.rowKey]; return n; });
      // Si era una fila manual sin guardar, quitarla de extraRows (ya tiene corte_id).
      if (fila.rowKey.startsWith('x:')) {
        const idx = parseInt(fila.rowKey.slice(2));
        setExtraRows(prev => prev.filter((_, i) => i !== idx));
      }
      // Recargar cortes y totales SIN tocar edits ni extraRows (capturas en progreso).
      await recargarCortes();
      window.kbotFullResync?.();
    } catch (e) {
      handleApiError(e, 'Error al guardar'); // HOTFIX_BUG2_AUTORECOVER_423
    }
    setSavingKey(null);
  };

  const eliminarFila = async (fila) => {
    if (fila.rowKey.startsWith('x:')) {
      // Fila manual no guardada
      const idx = parseInt(fila.rowKey.slice(2));
      setExtraRows(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!fila.corte_id) {
      // Fila de vendedor sin corte: solo limpiar edits si los hay
      setEdits(prev => { const n = { ...prev }; delete n[fila.rowKey]; return n; });
      return;
    }
    if (!confirm(`¿Eliminar corte de ${fila.ruta} (${fila.vendedor_nombre})?\nEsto borra los movimientos de efectivo/gastos vinculados.`)) return;
    try {
      await api.cortes.remove(fila.corte_id);
      // BUGFIX_LOST_EDITS: recargar SIN pisar edits/extraRows de otras filas.
      await recargarCortes();
      window.kbotFullResync?.();
    } catch (e) { handleApiError(e, 'Error al eliminar'); /* HOTFIX_BUG2_AUTORECOVER_423 */ }
  };

  const agregarFilaManual = () => {
    setExtraRows(prev => [...prev, {
      corte_id: null,
      vendedor_id: null,
      vendedor_nombre: '',
      vendedor_codigo: '',
      vendedor_zona: '',
      vendedor_tipo: 'AUTOVENTA',
      ruta: '', venta_sistema: 0, efectivo: 0,
      cheque_vale: 0, tarjetas: 0, credito: 0,
      transferencia: 0, gastos: 0, devoluciones: 0, gasolina: 0,
      comentario: ''
    }]);
    setEdits(prev => ({ ...prev, ['x:' + extraRows.length]: { ruta: '', vendedor_nombre: 'MANUAL' } }));
  };

  // Totales
  const totales = useMemo(() => {
    const t = { venta_sistema: 0, efectivo: 0, cheque_vale: 0, tarjetas: 0, credito: 0,
                transferencia: 0, gastos: 0, devoluciones: 0, gasolina: 0, diferencia: 0,
                total_pagos: 0 };
    filas.forEach(fila => {
      const r = getRowValues(fila);
      t.venta_sistema += Math.abs(Number(r.venta_sistema) || 0);
      t.efectivo      += Number(r.efectivo) || 0;
      t.cheque_vale   += Number(r.cheque_vale) || 0;
      t.tarjetas      += Number(r.tarjetas) || 0;
      t.credito       += Number(r.credito) || 0;
      t.transferencia += Number(r.transferencia) || 0;
      t.gastos        += Number(r.gastos) || 0;
      t.devoluciones  += Number(r.devoluciones) || 0;
      t.gasolina      += Number(r.gasolina) || 0;
    });
    t.total_pagos = t.efectivo + t.cheque_vale + t.tarjetas + t.credito + t.transferencia;
    t.diferencia = t.total_pagos + t.gastos - t.venta_sistema;
    return t;
  }, [filas, edits]);

  return (
    <div>
      {/* Configuración del día */}
      <div className="vt-card">
        <div className="vt-card-title">📅 Corte del día — captura por vendedor</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'end' }}>
          <div>
            <label className="vt-label">Fecha</label>
            <input type="date" className="vt-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="vt-label">Caja efectivo (entradas + gastos + gasolina)</label>
            <select className="vt-select" value={cajaEfecId} onChange={e => setCajaEfecId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {cajas.filter(c => c.tipo === 'EFECTIVO').map(c =>
                <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>
              )}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setFecha(hoyISO())}>HOY</button>
            <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={cargar} title="Refrescar">↻ Refrescar</button>
            <button className="vt-btn vt-btn-primary" onClick={agregarFilaManual} disabled={cerrado}>+ Fila manual</button>
            {/* HOTFIX_REABRIR_SIEMPRE_VISIBLE — ambos botones siempre visibles, Reabrir a la izquierda (naranja), Cerrar a la derecha (rojo) */}
            <button className="vt-btn vt-btn-sm" onClick={() => setShowReabrirModal(true)}
              style={{ background: '#F59E0B', color: '#fff', border: 'none', opacity: cerrado ? 1 : 0.85 }}
              title={cerrado ? "Reabrir el día (requiere PIN admin/gerente)" : "El día está abierto — Reabrir solo aplica si fue cerrado"}>
              🔓 Reabrir día
            </button>
            <button className="vt-btn vt-btn-sm" onClick={() => setShowCerrarModal(true)}
              style={{ background: '#DC2626', color: '#fff', border: 'none', opacity: cerrado ? 0.85 : 1 }}
              title={cerrado ? "El día ya está cerrado" : "Cerrar el día (requiere PIN admin/gerente)"}>
              🔒 Cerrar día
            </button>
          </div>
        </div>
        {error && <div className="vt-error" style={{ marginTop: 12 }}>⚠ {error}</div>}
        {/* F4_FRONTEND — banner cerrado */}
        {cerrado && cierreInfo.cierre && (
          <div style={{
            marginTop: 12, padding: '12px 16px',
            background: 'linear-gradient(to right, #FEE2E2, #FECACA)',
            borderLeft: '4px solid #DC2626',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            fontSize: 13
          }}>
            <div>
              <strong style={{ color: '#991B1B', fontSize: 14 }}>🔒 DÍA CERRADO</strong>
              <div style={{ color: '#7F1D1D', marginTop: 2 }}>
                Cerrado por <strong>{cierreInfo.cierre.bloqueado_por_nombre || '?'}</strong> el {new Date(cierreInfo.cierre.bloqueado_at).toLocaleString('es-MX')}
                {cierreInfo.cierre.comentario ? ' · ' + cierreInfo.cierre.comentario : ''}
              </div>
              <div style={{ color: '#7F1D1D', marginTop: 2, fontSize: 11, fontStyle: 'italic' }}>
                No se pueden hacer cambios. Solo admin/gerente con PIN pueden reabrir.
              </div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--ink-soft)' }}>
          💡 <strong>Aparecen las {vendedores.length} filas de vendedores activos</strong> ({vendedores.filter(v => v.tipo === 'AUTOVENTA').length} autoventa + {vendedores.filter(v => v.tipo === 'DISTRIBUIDOR').length} distribuidores). Captura los importes y guarda cada fila. Solo <strong>EFECTIVO</strong>, <strong>GASTOS</strong> y <strong>GASOLINA</strong> mueven la caja; los demás métodos quedan registrados pero no afectan saldos.
        </div>
      </div>

      {/* TABLA EXCEL */}
      <div className="vt-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className={'vt-excel' + (cerrado ? ' f4-locked' : '')}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 90 }}>TIPO</th>
                <th style={{ minWidth: 70 }}>RUTA</th>
                <th style={{ minWidth: 180 }}>VENDEDOR / REPARTIDOR</th>
                <th style={{ minWidth: 105 }}>VENTA SISTEMA</th>
                <th style={{ minWidth: 95 }}>EFECTIVO</th>
                <th style={{ minWidth: 100 }}>CHEQUE/VALE</th>
                <th style={{ minWidth: 90 }}>TARJETAS</th>
                <th style={{ minWidth: 90 }}>CRÉDITO</th>
                <th style={{ minWidth: 100 }}>TRANSFER.</th>
                <th style={{ minWidth: 90 }}>GASTOS</th>
                <th style={{ minWidth: 100 }}>DIFERENCIA</th>
                <th style={{ minWidth: 80 }}>DEVOL.</th>
                <th style={{ minWidth: 90 }}>GASOLINA</th>
                <th style={{ minWidth: 110 }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 30 }}>Cargando…</td></tr>
              )}
              {!loading && filas.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 30, fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                  No hay vendedores activos. Ve a la pestaña <strong>Gestión</strong> para crearlos.
                </td></tr>
              )}
              {filas.map(fila => {
                const r = getRowValues(fila);
                const dif = calcDif(r);
                const cls = difClass(dif);
                const dirty = isDirty(fila.rowKey);
                const saving = savingKey === fila.rowKey;
                const isDist = (r.vendedor_tipo === 'DISTRIBUIDOR');
                return (
                  <tr key={fila.rowKey}
                      className={(dirty ? 'row-dirty' : '') + (saving ? ' row-saving' : '') + (isDist ? ' row-dist' : ' row-auto')}>
                    <td className="tipo-cell">
                      <span className={'vt-badge ' + (isDist ? 'vt-badge-distribuidor' : 'vt-badge-autoventa')}>
                        {isDist ? 'DIST' : 'AUTO'}
                      </span>
                    </td>
                    <td className="text">
                      <input value={r.ruta || ''}
                        onChange={e => onChangeField(fila.rowKey, 'ruta', e.target.value.toUpperCase())}
                        placeholder="—" />
                    </td>
                    <td>
                      {fila.rowKey.startsWith('x:') ? (
                        <input className="text" value={r.vendedor_nombre || ''} style={{ textAlign: 'left' }}
                          onChange={e => onChangeField(fila.rowKey, 'vendedor_nombre', e.target.value.toUpperCase())}
                          placeholder="Nombre manual" />
                      ) : (
                        <div className="row-vendedor">
                          {r.vendedor_codigo ? <small>{r.vendedor_codigo} </small> : null}
                          {r.vendedor_nombre}
                          {r.vendedor_zona ? <small> · {r.vendedor_zona}</small> : null}
                        </div>
                      )}
                    </td>
                    <td><input type="number" step="0.01" value={r.venta_sistema || ''}
                      onChange={e => onChangeField(fila.rowKey, 'venta_sistema', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.efectivo || ''}
                      onChange={e => onChangeField(fila.rowKey, 'efectivo', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.cheque_vale || ''}
                      onChange={e => onChangeField(fila.rowKey, 'cheque_vale', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.tarjetas || ''}
                      onChange={e => onChangeField(fila.rowKey, 'tarjetas', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.credito || ''}
                      onChange={e => onChangeField(fila.rowKey, 'credito', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.transferencia || ''}
                      onChange={e => onChangeField(fila.rowKey, 'transferencia', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.gastos || ''}
                      onChange={e => onChangeField(fila.rowKey, 'gastos', e.target.value)} placeholder="0.00" /></td>
                    <td className={'calc ' + cls}>{dif.toFixed(2)}</td>
                    <td><input type="number" step="0.01" value={r.devoluciones || ''}
                      onChange={e => onChangeField(fila.rowKey, 'devoluciones', e.target.value)} placeholder="0.00" /></td>
                    <td><input type="number" step="0.01" value={r.gasolina || ''}
                      onChange={e => onChangeField(fila.rowKey, 'gasolina', e.target.value)} placeholder="0.00" /></td>
                    <td className="actions-cell">
                      {dirty && (
                        <button className="save" onClick={() => guardarFila(fila)} disabled={saving}>
                          {saving ? '…' : '💾'}
                        </button>
                      )}
                      <button className="del" onClick={() => eliminarFila(fila)} title="Eliminar / Limpiar">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="first">TOTALES · {filas.length} filas · {fmtFecha(fecha)}</td>
                  <td>{fmtMXN(totales.venta_sistema)}</td>
                  <td>{fmtMXN(totales.efectivo)}</td>
                  <td>{fmtMXN(totales.cheque_vale)}</td>
                  <td>{fmtMXN(totales.tarjetas)}</td>
                  <td>{fmtMXN(totales.credito)}</td>
                  <td>{fmtMXN(totales.transferencia)}</td>
                  <td>{fmtMXN(totales.gastos)}</td>
                  <td className={difClass(totales.diferencia)} style={{ color: 'inherit' }}>{fmtMXN(totales.diferencia)}</td>
                  <td>{fmtMXN(totales.devoluciones)}</td>
                  <td>{fmtMXN(totales.gasolina)}</td>
                  <td></td>
                </tr>
                {/* F5_FRONTEND — Ventas adicionales del día por canal */}
                {totalesDia && totalesDia.por_canal && (
                  <>
                    <tr className="f5-row-separator">
                      <td colSpan={14} style={{ textAlign: 'left', padding: '8px 12px', background: '#FFFBEB', color: '#92400E', fontStyle: 'italic', fontSize: 11, borderTop: '2px solid #F59E0B' }}>
                        💵 VENTAS ADICIONALES DEL DÍA (DETALLE / MAYOREO / DULCERÍA / MAQUILA) — informativo, no editable
                      </td>
                    </tr>
                    {totalesDia.por_canal.map(c => (
                      <tr key={'f5-' + c.canal} className="f5-row-canal" style={{ background: '#FFFBEB', fontStyle: 'italic', color: '#92400E' }}>
                        <td colSpan={3} className="first" style={{ paddingLeft: 24 }}>
                          + {c.canal} · {c.count} {c.count === 1 ? 'venta' : 'ventas'}
                        </td>
                        <td>{c.venta_sistema > 0 ? fmtMXNshort(c.venta_sistema) : ''}</td>
                        <td>{c.efectivo > 0 ? fmtMXNshort(c.efectivo) : ''}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>{c.transferencia > 0 ? fmtMXNshort(c.transferencia) : ''}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                    {totalesDia.gran_total && (
                      <tr className="f5-row-grantotal" style={{ background: '#065F46', color: '#FFF' }}>
                        <td colSpan={3} className="first" style={{ background: '#065F46', color: '#FFF' }}>
                          🟢 GRAN TOTAL DEL DÍA (rutas + ventas adicionales)
                        </td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN((totales.venta_sistema || 0) + (totalesDia.gran_total.venta_sistema || 0))}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN((totales.efectivo || 0) + (totalesDia.gran_total.efectivo || 0))}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.cheque_vale)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.tarjetas)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.credito)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN((totales.transferencia || 0) + (totalesDia.gran_total.transferencia || 0))}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.gastos)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}></td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.devoluciones)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}>{fmtMXN(totales.gasolina)}</td>
                        <td style={{ background: '#065F46', color: '#FFF' }}></td>
                      </tr>
                    )}
                  </>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <div className="vt-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div className="vt-legend">
            <strong style={{ color: 'var(--ink)' }}>Diferencia:</strong>
            <span className="vt-legend-item"><span className="vt-legend-dot" style={{ background: '#DCFCE7' }} /> ≤ $50 OK</span>
            <span className="vt-legend-item"><span className="vt-legend-dot" style={{ background: '#FEF3C7' }} /> $50–$500 Revisar</span>
            <span className="vt-legend-item"><span className="vt-legend-dot" style={{ background: '#FEE2E2' }} /> &gt;$500 Urgente</span>
            <span className="vt-legend-item"><span className="vt-badge vt-badge-autoventa">AUTO</span> Autoventa</span>
            <span className="vt-legend-item"><span className="vt-badge vt-badge-distribuidor">DIST</span> Distribuidor</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
            <strong>Solo mueven caja:</strong> Efectivo (entrada), Gastos y Gasolina (salida).
          </div>
        </div>
      </div>
      {/* F4_FRONTEND — modales cerrar / reabrir día */}
      {showCerrarModal && (
        <F4ModalCerrarDia
          fecha={fecha}
          onClose={() => setShowCerrarModal(false)}
          onConfirm={ejecutarCerrar}
        />
      )}
      {showReabrirModal && (
        <F4ModalReabrirDia
          fecha={fecha}
          onClose={() => setShowReabrirModal(false)}
          onConfirm={ejecutarReabrir}
        />
      )}
    </div>
  );
}

// =====================================================
// PANEL SIMPLE para MAYOREO / DULCERIA / MAQUILA
// =====================================================
function CanalSimplePanel({ canal, cajas }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroFecha, setFiltroFecha] = useState(hoyISO());
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.list({ canal, desde: filtroFecha, hasta: filtroFecha });
      setVentas(Array.isArray(list) ? list : []);
      setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [canal, filtroFecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const totalDia = useMemo(() => ventas.reduce((s, v) => s + Number(v.importe || 0), 0), [ventas]);

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar venta? También borra el ingreso en caja.')) return;
    try { await api.remove(id); cargar(); window.kbotFullResync?.(); }
    catch (e) { alert('Error: ' + e.message); }
  };

  const labels = {
    MAYOREO:  { title: 'Venta Mayoreo',  emoji: '📦' },
    DULCERIA: { title: 'Venta Dulcería', emoji: '🍬' },
    MAQUILA:  { title: 'Venta Maquila',  emoji: '🔧' }
  };
  const L = labels[canal];

  return (
    <div>
      <QuickFormSimple canal={canal} cajas={cajas} onSaved={() => { cargar(); window.kbotFullResync?.(); }} />

      <div className="vt-card">
        <div className="vt-toolbar">
          <div className="vt-card-title" style={{ margin: 0, padding: 0, border: 'none', flex: 1 }}>
            {L.emoji} {L.title} · Registradas
          </div>
          <span className="vt-label" style={{ margin: 0 }}>Fecha</span>
          <input type="date" className="vt-input" style={{ width: 160 }}
            value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
          <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setFiltroFecha(hoyISO())}>HOY</button>
        </div>

        <div className="vt-band">
          <span className="vt-band-label">
            TOTAL {fmtFecha(filtroFecha)} · {ventas.length} {ventas.length === 1 ? 'venta' : 'ventas'}
          </span>
          <span className="vt-band-value">{fmtMXN(totalDia)}</span>
        </div>

        {error && <div className="vt-error">⚠ {error}</div>}

        {loading ? (
          <div className="vt-empty">Cargando…</div>
        ) : ventas.length === 0 ? (
          <div className="vt-empty">Sin ventas registradas para esta fecha</div>
        ) : (
          <div className="vt-table-wrap">
            <table className="vt-table">
              <thead>
                <tr>
                  <th>Hora</th><th>Cliente</th>
                  {canal === 'DULCERIA' && <th>Pedido</th>}
                  <th>Comentario</th><th>Caja</th><th>Origen</th>
                  <th className="num">Importe</th><th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id}>
                    <td className="mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                      {(v.created_at || '').slice(11, 16)}
                    </td>
                    <td><strong>{v.cliente || '—'}</strong></td>
                    {canal === 'DULCERIA' && <td className="mono">{v.numero_pedido || '—'}</td>}
                    <td style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{v.comentario || '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.caja_nombre || v.caja_id}</td>
                    <td>{v.origen === 'captura-rapida' ?
                      <span className="vt-badge vt-badge-rapida">⚡ Rápida</span> :
                      <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>módulo</span>}</td>
                    <td className="num">{fmtMXN(v.importe)}</td>
                    <td><button className="vt-btn vt-btn-danger vt-btn-sm" onClick={() => eliminar(v.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickFormSimple({ canal, cajas, onSaved }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [cliente, setCliente] = useState('');
  const [pedido, setPedido] = useState('');
  const [importe, setImporte] = useState('');
  const [comentario, setComentario] = useState('');
  const [cajaId, setCajaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const importeRef = useRef(null);

  useEffect(() => {
    if (!cajas.length || cajaId) return;
    const efectivo = cajas.find(c => c.tipo === 'EFECTIVO') || cajas[0];
    setCajaId(efectivo.id);
  }, [cajas, cajaId]);

  const guardar = async () => {
    setError(''); setOk('');
    const imp = parseFloat(importe);
    if (!(imp > 0)) { setError('Importe inválido'); return; }
    if (!cliente.trim()) { setError('Cliente requerido'); return; }
    if (!cajaId) { setError('Selecciona caja'); return; }
    setSaving(true);
    try {
      await api.create({
        canal, fecha, importe: imp, caja_id: cajaId,
        cliente: cliente.trim(),
        numero_pedido: canal === 'DULCERIA' ? (pedido || null) : null,
        comentario: comentario.trim() || null,
        origen: 'modulo-ventas'
      });
      setOk('✓ Venta registrada');
      setImporte(''); setCliente(''); setPedido(''); setComentario('');
      importeRef.current?.focus();
      onSaved?.();
      setTimeout(() => setOk(''), 2500);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const titulos = {
    MAYOREO:  { t: 'Nueva venta de mayoreo',  ph: 'Ej. ABARROTES LA FE' },
    DULCERIA: { t: 'Nueva venta de dulcería', ph: 'Ej. TIENDA EL TÍO' },
    MAQUILA:  { t: 'Nueva venta de maquila',  ph: 'Ej. EMPRESA XYZ SA' }
  };
  const L = titulos[canal];

  return (
    <div className="vt-card">
      <div className="vt-card-title">⚡ {L.t}</div>
      <div className="vt-quick">
        <div>
          <label className="vt-label">Fecha</label>
          <input type="date" className="vt-input" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div style={{ gridColumn: canal === 'DULCERIA' ? 'auto' : 'span 2' }}>
          <label className="vt-label">{canal === 'MAQUILA' ? 'Cliente (maquila)' : 'Cliente'}</label>
          <input className="vt-input" placeholder={L.ph} value={cliente} onChange={e => setCliente(e.target.value)} />
        </div>
        {canal === 'DULCERIA' && (
          <div>
            <label className="vt-label">Nº pedido</label>
            <input className="vt-input mono" placeholder="P-1234" value={pedido} onChange={e => setPedido(e.target.value)} />
          </div>
        )}
        <div>
          <label className="vt-label">Importe</label>
          <input ref={importeRef} type="number" step="0.01" min="0" className="vt-input mono"
            placeholder="0.00" value={importe} onChange={e => setImporte(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardar(); }}
            style={{ fontSize: 16 }} />
        </div>
        <div>
          <label className="vt-label">Caja destino</label>
          <select className="vt-select" value={cajaId} onChange={e => setCajaId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {cajas.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon || (c.tipo === 'EFECTIVO' ? '💵' : c.tipo === 'BANCO' ? '🏦' : '💳')} {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="full">
          <label className="vt-label">Comentario (opcional)</label>
          <input className="vt-input" placeholder="Ej. abono parcial, pedido grande"
            value={comentario} onChange={e => setComentario(e.target.value)} />
        </div>
        <div className="full" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {error && <span className="vt-error" style={{ margin: 0, padding: '6px 10px' }}>⚠ {error}</span>}
          {ok && <span className="vt-success" style={{ margin: 0 }}>{ok}</span>}
          <button className="vt-btn vt-btn-primary" disabled={saving} onClick={guardar} style={{ minWidth: 180 }}>
            {saving ? 'Guardando…' : '+ Registrar venta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PANEL TOTALES
// =====================================================
function TotalesPanel() {
  const [data, setData] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const [t, v, c] = await Promise.all([
        api.totales(),
        api.list({ desde: hoyISO() }),
        api.cortes.list({ desde: hoyISO(), hasta: hoyISO() })
      ]);
      setData(t);
      setVentas(Array.isArray(v) ? v : []);
      setCortes(Array.isArray(c) ? c : []);
      setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 60000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) return <div className="vt-empty">Cargando totales…</div>;
  if (error) return <div className="vt-card vt-error">{error}</div>;
  if (!data) return null;

  const renderCanales = (arr) => {
    if (!arr || !arr.length) return <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>sin movimientos</span>;
    return arr.map(c => (
      <span key={c.canal} className={'vt-badge vt-badge-' + c.canal.toLowerCase()}
        title={`${c.n} ${c.n === 1 ? 'venta' : 'ventas'}`}>
        {c.canal}: {fmtMXNshort(c.total)}
      </span>
    ));
  };

  return (
    <div>
      <div className="vt-kpis">
        <div className="vt-kpi hoy">
          <div className="lbl">HOY · {fmtFecha(data.rangos.hoy)}</div>
          <div className="val">{fmtMXN(data.hoy.total)}</div>
          <div className="sub">{data.hoy.n} {data.hoy.n === 1 ? 'venta' : 'ventas'}</div>
          <div className="canales">{renderCanales(data.hoy.por_canal)}</div>
        </div>
        <div className="vt-kpi semana">
          <div className="lbl">SEMANA · desde {fmtFecha(data.rangos.inicioSemana)}</div>
          <div className="val">{fmtMXN(data.semana.total)}</div>
          <div className="sub">{data.semana.n} {data.semana.n === 1 ? 'venta' : 'ventas'}</div>
          <div className="canales">{renderCanales(data.semana.por_canal)}</div>
        </div>
        <div className="vt-kpi mes">
          <div className="lbl">MES · desde {fmtFecha(data.rangos.inicioMes)}</div>
          <div className="val">{fmtMXN(data.mes.total)}</div>
          <div className="sub">{data.mes.n} {data.mes.n === 1 ? 'venta' : 'ventas'}</div>
          <div className="canales">{renderCanales(data.mes.por_canal)}</div>
        </div>
        <div className="vt-kpi anio">
          <div className="lbl">AÑO · desde {fmtFecha(data.rangos.inicioAnio)}</div>
          <div className="val">{fmtMXN(data.anio.total)}</div>
          <div className="sub">{data.anio.n} {data.anio.n === 1 ? 'venta' : 'ventas'}</div>
          <div className="canales">{renderCanales(data.anio.por_canal)}</div>
        </div>
      </div>

      <div className="vt-card">
        <div className="vt-card-title">📋 Ventas simples de hoy ({ventas.length})</div>
        {ventas.length === 0 ? (
          <div className="vt-empty">Aún no hay ventas simples registradas hoy</div>
        ) : (
          <div className="vt-table-wrap">
            <table className="vt-table">
              <thead>
                <tr>
                  <th>Hora</th><th>Canal</th><th>Cliente</th><th>Comentario</th>
                  <th>Caja</th><th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(v.created_at || '').slice(11, 16)}</td>
                    <td><span className={'vt-badge vt-badge-' + v.canal.toLowerCase()}>{v.canal}</span></td>
                    <td><strong>{v.ruta || v.cliente || '—'}</strong></td>
                    <td style={{ fontSize: 12 }}>{v.comentario || '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.caja_nombre || '—'}</td>
                    <td className="num">{fmtMXN(v.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="vt-card">
        <div className="vt-card-title">🚚 Cortes de detalle de hoy ({cortes.length})</div>
        {cortes.length === 0 ? (
          <div className="vt-empty">Aún no hay cortes de ruta registrados hoy</div>
        ) : (
          <div className="vt-table-wrap">
            <table className="vt-table">
              <thead>
                <tr>
                  <th>Ruta</th><th>Vendedor</th>
                  <th className="num">Sistema</th><th className="num">Efectivo</th>
                  <th className="num">Transfer</th><th className="num">Crédito</th>
                  <th className="num">Gastos</th><th className="num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map(c => {
                  const abs = Math.abs(c.diferencia || 0);
                  const cls = abs < 50 ? 'dif-ok' : abs < 500 ? 'dif-warn' : 'dif-bad';
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.ruta}</strong></td>
                      <td>{c.vendedor_nombre || c.vendedor_nombre_actual || <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                      <td className="num">{fmtMXN(c.venta_sistema)}</td>
                      <td className="num">{fmtMXN(c.efectivo)}</td>
                      <td className="num">{fmtMXN(c.transferencia)}</td>
                      <td className="num">{fmtMXN(c.credito)}</td>
                      <td className="num">{fmtMXN(c.gastos)}</td>
                      <td className={'num ' + cls} style={{ padding: '4px 8px', borderRadius: 4 }}>{fmtMXN(c.diferencia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// PANEL GESTIÓN (Rutas + Vendedores con TIPO)
// =====================================================
function GestionPanel() {
  return (
    <div>
      <RutasManager />
      <VendedoresManager />
    </div>
  );
}

function RutasManager() {
  const [rutas, setRutas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState('');
  const [editing, setEditing] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await api.rutas.listAll();
      setRutas(Array.isArray(r) ? r : []);
    } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const agregar = async () => {
    if (!nueva.trim()) return;
    try { await api.rutas.create(nueva.trim()); setNueva(''); cargar(); }
    catch (e) { alert(e.message); }
  };
  const toggle = async (r) => {
    await api.rutas.update(r.id, { activa: r.activa ? 0 : 1 });
    cargar();
  };
  const guardarEdit = async () => {
    if (!editing?.nombre.trim()) return;
    try { await api.rutas.update(editing.id, { nombre: editing.nombre.trim() }); setEditing(null); cargar(); }
    catch (e) { alert(e.message); }
  };

  // Ordenar rutas: activas primero, luego por número
  const rutasOrdenadas = [...rutas].sort((a, b) => {
    if (a.activa !== b.activa) return b.activa - a.activa;
    const na = (a.nombre.match(/RUTA\s+(\d+)/) || [])[1];
    const nb = (b.nombre.match(/RUTA\s+(\d+)/) || [])[1];
    if (na && nb) return parseInt(na) - parseInt(nb);
    return a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="vt-card">
      <div className="vt-card-title">🛣 Catálogo de rutas</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--line)' }}>
        <input className="vt-input" placeholder="Ej. RUTA 20" value={nueva}
          onChange={e => setNueva(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') agregar(); }} />
        <button className="vt-btn vt-btn-primary" onClick={agregar}>+ Agregar</button>
      </div>
      {loading ? <div className="vt-empty">Cargando…</div> :
       rutasOrdenadas.length === 0 ? <div className="vt-empty">Sin rutas aún</div> :
       <div className="vt-table-wrap">
        <table className="vt-table">
          <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {rutasOrdenadas.map(r => (
              <tr key={r.id} style={{ opacity: r.activa ? 1 : 0.55 }}>
                <td>
                  {editing?.id === r.id ?
                    <input className="vt-input" autoFocus value={editing.nombre}
                      onChange={e => setEditing({ ...editing, nombre: e.target.value.toUpperCase() })}
                      onKeyDown={e => { if (e.key === 'Enter') guardarEdit(); if (e.key === 'Escape') setEditing(null); }}
                      style={{ padding: '5px 8px' }} /> :
                    <strong>{r.nombre}</strong>}
                </td>
                <td>
                  <span className={'vt-badge ' + (r.activa ? 'vt-badge-mayoreo' : '')}
                    style={r.activa ? {} : { background: 'var(--bg-soft)', color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>
                    {r.activa ? 'ACTIVA' : 'INACTIVA'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editing?.id === r.id ? (
                    <React.Fragment>
                      <button className="vt-btn vt-btn-primary vt-btn-sm" onClick={guardarEdit}>OK</button>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setEditing(null)} style={{ marginLeft: 4 }}>✕</button>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setEditing({ id: r.id, nombre: r.nombre })} title="Editar">✎</button>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => toggle(r)} style={{ marginLeft: 4 }} title={r.activa ? 'Inactivar' : 'Activar'}>
                        {r.activa ? '⏸' : '▶'}
                      </button>
                    </React.Fragment>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
       </div>}
    </div>
  );
}


// ============================================================================
// F4_FRONTEND — Modales de cierre/reapertura de día
// ============================================================================
function F4ModalCerrarDia({ fecha, onClose, onConfirm }) {
  const [comentario, setComentario] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) { alert('Ingresa tu PIN de 4 dígitos'); return; }
    setSubmitting(true);
    await onConfirm(comentario.trim(), pin);
    setSubmitting(false);
  };

  return (
    <div style={f4Overlay} onClick={onClose}>
      <div style={f4Modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#DC2626' }}>🔒 Cerrar día — {fecha}</h3>
        <p style={{ color: '#555', fontSize: 13 }}>
          Una vez cerrado, NO se podrán hacer cambios a ningún corte del día. Solo admin/gerente con PIN podrán reabrir.
        </p>
        <label style={f4Lbl}>Comentario (opcional):</label>
        <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength="500"
          placeholder="Notas del cierre…" style={{ ...f4Input, minHeight: 60, resize: 'vertical' }} />
        <label style={f4Lbl}>Tu PIN (4 dígitos):</label>
        <input type="password" inputMode="numeric" pattern="\d{4}" maxLength="4"
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••" autoFocus
          style={{ ...f4Input, fontFamily: 'monospace', fontSize: 20, textAlign: 'center', letterSpacing: 8 }} />
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting}
            style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={submitting || !/^\d{4}$/.test(pin)}
            style={{ padding: '10px 16px', border: 'none', borderRadius: 6,
              background: submitting ? '#9CA3AF' : '#DC2626', color: '#fff',
              cursor: submitting ? 'wait' : 'pointer', fontWeight: 600 }}>
            {submitting ? 'Cerrando…' : '🔒 Cerrar día'}
          </button>
        </div>
      </div>
    </div>
  );
}

function F4ModalReabrirDia({ fecha, onClose, onConfirm }) {
  const [motivo, setMotivo] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (!motivo.trim()) { alert('Ingresa un motivo para reabrir'); return; }
    if (!/^\d{4}$/.test(pin)) { alert('Ingresa tu PIN de 4 dígitos'); return; }
    setSubmitting(true);
    await onConfirm(motivo.trim(), pin);
    setSubmitting(false);
  };

  return (
    <div style={f4Overlay} onClick={onClose}>
      <div style={f4Modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#F59E0B' }}>🔓 Reabrir día — {fecha}</h3>
        <p style={{ color: '#555', fontSize: 13 }}>
          Reabrir permite editar nuevamente los cortes del día. Esta acción queda registrada con tu nombre, PIN y motivo. Cierra el día otra vez cuando termines.
        </p>
        <label style={f4Lbl}>Motivo (obligatorio):</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength="500"
          placeholder="Ej: Corrección de venta sistema de Ruta 3…" autoFocus
          style={{ ...f4Input, minHeight: 60, resize: 'vertical' }} />
        <label style={f4Lbl}>Tu PIN (4 dígitos):</label>
        <input type="password" inputMode="numeric" pattern="\d{4}" maxLength="4"
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          style={{ ...f4Input, fontFamily: 'monospace', fontSize: 20, textAlign: 'center', letterSpacing: 8 }} />
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting}
            style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={submitting || !motivo.trim() || !/^\d{4}$/.test(pin)}
            style={{ padding: '10px 16px', border: 'none', borderRadius: 6,
              background: submitting ? '#9CA3AF' : '#F59E0B', color: '#fff',
              cursor: submitting ? 'wait' : 'pointer', fontWeight: 600 }}>
            {submitting ? 'Reabriendo…' : '🔓 Reabrir día'}
          </button>
        </div>
      </div>
    </div>
  );
}

const f4Overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 };
const f4Modal = { background: '#fff', borderRadius: 10, padding: 24, width: '90%', maxWidth: 480,
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };
const f4Lbl = { display: 'block', marginTop: 12, marginBottom: 4, fontWeight: 600, fontSize: 13, color: '#374151' };
const f4Input = { width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' };

// Inyectar CSS para deshabilitar la tabla cuando está cerrada
(function injectF4CierreStyles() {
  if (document.getElementById('f4-cierre-styles')) return;
  const css = `
    /* F4_FRONTEND — bloqueo visual de la tabla cuando el día está cerrado */
    .vt-excel.f4-locked tbody { pointer-events: none; opacity: 0.6; user-select: none; }
    .vt-excel.f4-locked tbody input { background: #F3F4F6 !important; color: #6B7280 !important; cursor: not-allowed !important; }
    .vt-excel.f4-locked tbody .actions-cell { visibility: hidden; }
  `;
  const style = document.createElement('style');
  style.id = 'f4-cierre-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

function VendedoresManager() {
  const [vendedores, setVendedores] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ nombre: '', sys_code: '', ruta_default: '', telefono: '', tipo: 'AUTOVENTA', notas: '' });
  const [editing, setEditing] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [vs, rs] = await Promise.all([api.vendedores.listAll(), api.rutas.list()]);
      setVendedores(vs);
      setRutas(rs);
    } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const agregar = async () => {
    if (!nuevo.nombre.trim()) return;
    try {
      await api.vendedores.create({
        nombre: nuevo.nombre.trim(),
        sys_code: nuevo.sys_code.trim() || null,
        ruta_default: (nuevo.ruta_default || '').trim().toUpperCase() || null,
        telefono: nuevo.telefono.trim() || null,
        tipo: nuevo.tipo,
        notas: nuevo.notas.trim() || null
      });
      setNuevo({ nombre: '', sys_code: '', ruta_default: '', telefono: '', tipo: 'AUTOVENTA', notas: '' });
      cargar();
    } catch (e) { alert(e.message); }
  };

  const toggle = async (v) => {
    await api.vendedores.update(v.id, { activo: v.activo ? 0 : 1 });
    cargar();
  };
  const guardarEdit = async () => {
    if (!editing) return;
    try {
      await api.vendedores.update(editing.id, {
        nombre: editing.nombre,
        sys_code: editing.sys_code,
        ruta_default: editing.ruta_default,
        telefono: editing.telefono,
        tipo: editing.tipo,
        notas: editing.notas
      });
      setEditing(null);
      cargar();
    } catch (e) { alert(e.message); }
  };

  const eliminarPermanente = async (v) => {
    if (!confirm(`¿ELIMINAR PERMANENTEMENTE a "${v.nombre}"?\n\nEsto NO se puede deshacer. Si tiene cortes o ventas, mejor INACTIVALO (⏸).`)) return;
    if (!confirm(`Última confirmación: borrar definitivamente "${v.nombre}". ¿Continuar?`)) return;
    try {
      await api.vendedores.remove(v.id, true);
      cargar();
    } catch (e) { alert('No se pudo eliminar: ' + e.message); }
  };

  return (
    <div className="vt-card">
      <div className="vt-card-title">👥 Catálogo de vendedores / distribuidores</div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 14, padding: 12, background: 'var(--bg-soft)',
                    borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--line)',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr)) auto' }}>
        <div>
          <label className="vt-label">Tipo</label>
          <select className="vt-select" value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}>
            <option value="AUTOVENTA">AUTOVENTA</option>
            <option value="DISTRIBUIDOR">DISTRIBUIDOR</option>
          </select>
        </div>
        <div>
          <label className="vt-label">Código</label>
          <input className="vt-input mono" placeholder="H001" value={nuevo.sys_code}
            onChange={e => setNuevo({ ...nuevo, sys_code: e.target.value.toUpperCase() })} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="vt-label">Nombre completo</label>
          <input className="vt-input" placeholder="Nombre del vendedor" value={nuevo.nombre}
            onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
        </div>
        <div>
          <label className="vt-label">Ruta default</label>
          <select className="vt-select" value={nuevo.ruta_default}
            onChange={e => setNuevo({ ...nuevo, ruta_default: e.target.value })}>
            <option value="">—</option>
            {rutas.map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="vt-label">Zona</label>
          <input className="vt-input" placeholder="PACHUCA" value={nuevo.notas}
            onChange={e => setNuevo({ ...nuevo, notas: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <label className="vt-label">Teléfono</label>
          <input className="vt-input" placeholder="55..." value={nuevo.telefono}
            onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="vt-btn vt-btn-primary" onClick={agregar} disabled={!nuevo.nombre.trim()}>+ Agregar</button>
        </div>
      </div>

      {loading ? <div className="vt-empty">Cargando…</div> :
       vendedores.length === 0 ? <div className="vt-empty">Sin vendedores aún</div> :
       <div className="vt-table-wrap">
        <table className="vt-table">
          <thead><tr><th>Tipo</th><th>Código</th><th>Nombre</th><th>Ruta default</th><th>Zona</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.id} style={{ opacity: v.activo ? 1 : 0.55 }}>
                {editing?.id === v.id ? (
                  <React.Fragment>
                    <td>
                      <select className="vt-select" style={{ padding: '4px 6px', fontSize: 11 }}
                        value={editing.tipo || 'AUTOVENTA'}
                        onChange={e => setEditing({ ...editing, tipo: e.target.value })}>
                        <option value="AUTOVENTA">AUTO</option>
                        <option value="DISTRIBUIDOR">DIST</option>
                      </select>
                    </td>
                    <td><input className="vt-input mono" style={{ padding: '4px 8px' }} value={editing.sys_code || ''}
                      onChange={e => setEditing({ ...editing, sys_code: e.target.value.toUpperCase() })} /></td>
                    <td><input className="vt-input" style={{ padding: '4px 8px' }} value={editing.nombre}
                      onChange={e => setEditing({ ...editing, nombre: e.target.value })} /></td>
                    <td>
                      <select className="vt-select" style={{ padding: '4px 6px', fontSize: 12 }}
                        value={editing.ruta_default || ''}
                        onChange={e => setEditing({ ...editing, ruta_default: e.target.value })}>
                        <option value="">—</option>
                        {rutas.map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td><input className="vt-input" style={{ padding: '4px 8px' }} value={editing.notas || ''}
                      onChange={e => setEditing({ ...editing, notas: e.target.value.toUpperCase() })} /></td>
                    <td><input className="vt-input" style={{ padding: '4px 8px' }} value={editing.telefono || ''}
                      onChange={e => setEditing({ ...editing, telefono: e.target.value })} /></td>
                    <td></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="vt-btn vt-btn-primary vt-btn-sm" onClick={guardarEdit}>OK</button>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setEditing(null)} style={{ marginLeft: 4 }}>✕</button>
                    </td>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <td>
                      <span className={'vt-badge ' + (v.tipo === 'DISTRIBUIDOR' ? 'vt-badge-distribuidor' : 'vt-badge-autoventa')}>
                        {v.tipo === 'DISTRIBUIDOR' ? 'DIST' : 'AUTO'}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{v.sys_code || '—'}</td>
                    <td><strong>{v.nombre}</strong></td>
                    <td className="mono" style={{ fontSize: 12 }}>{v.ruta_default || '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.notas || '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.telefono || '—'}</td>
                    <td>
                      <span className={'vt-badge ' + (v.activo ? 'vt-badge-mayoreo' : '')}
                        style={v.activo ? {} : { background: 'var(--bg-soft)', color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>
                        {v.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => setEditing({
                        id: v.id, nombre: v.nombre, sys_code: v.sys_code, ruta_default: v.ruta_default,
                        telefono: v.telefono, tipo: v.tipo, notas: v.notas
                      })} title="Editar">✎</button>
                      <button className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => toggle(v)} style={{ marginLeft: 4 }} title={v.activo ? 'Inactivar' : 'Reactivar'}>
                        {v.activo ? '⏸' : '▶'}
                      </button>
                      <button className="vt-btn vt-btn-danger vt-btn-sm" onClick={() => eliminarPermanente(v)} style={{ marginLeft: 4 }} title="ELIMINAR PERMANENTE">🗑</button>
                    </td>
                  </React.Fragment>
                )}
              </tr>
            ))}
          </tbody>
        </table>
       </div>}
    </div>
  );
}
