// =============================================================
// K-BOTANAS · nomina-view.jsx v1.0
// Módulo de Nómina: Periodo actual, Empleados, Departamentos, Tabla comisiones, Préstamos, Histórico
// =============================================================

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ============================================================================
// MEJORAS NÓMINA v1 — helpers MNV1_HELPERS_V3
// ============================================================================
// Usa window.KBotAPI.token() (patrón canónico del sistema).
// Para JSON normal: __mnvApi (parsea respuesta).
// Para binarios (xlsx/pdf): __mnvDownload (raw fetch + blob).
// ============================================================================
function __mnvToken() {
  return (window.KBotAPI && window.KBotAPI.token && window.KBotAPI.token()) || '';
}

async function __mnvApi(url, options) {
  options = options || {};
  const tok = __mnvToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}, tok ? { Authorization: 'Bearer ' + tok } : {});
  const r = await fetch(url, Object.assign({}, options, { headers }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
  return data;
}

async function __mnvSyncEmpleados(periodoId) {
  if (!periodoId) { alert('Selecciona un periodo primero'); return; }
  if (!confirm('Agregar empleados activos faltantes a este periodo?')) return;
  try {
    const d = await __mnvApi('/api/nomina/periodos/' + encodeURIComponent(periodoId) + '/sync-empleados', { method: 'POST' });
    alert('✅ ' + (d.message || 'Sincronizado'));
    setTimeout(() => window.location.reload(), 400);
  } catch (e) { alert('Error: ' + e.message); }
}

async function __mnvDownload(url, filename) {
  try {
    const tok = __mnvToken();
    const r = await fetch(url, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert('Error: ' + (j.error || ('HTTP ' + r.status)));
      return;
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  } catch (e) { alert('Error: ' + e.message); }
}

function __mnvDownloadXlsx(periodoId) {
  if (!periodoId) { alert('Selecciona un periodo primero'); return; }
  return __mnvDownload('/api/nomina/periodos/' + encodeURIComponent(periodoId) + '/export.xlsx',
                       'nomina_' + periodoId + '.xlsx');
}

function __mnvDownloadPdf(periodoId) {
  if (!periodoId) { alert('Selecciona un periodo primero'); return; }
  return __mnvDownload('/api/nomina/periodos/' + encodeURIComponent(periodoId) + '/export.pdf',
                       'nomina_' + periodoId + '.pdf');
}
// ============================================================================


const NOMINA_VERSION = '1.0.0';

(function injectNominaStyles() {
  const old = document.getElementById('kb-nomina-styles-v1');
  if (old) old.remove();
  const css = `
    /* F1_FRONTEND_PATCH CSS */
    .nom-row-pagado { background: #D4EFDF !important; }
    .nom-row-pagado td { color: #196F3D; }
    .nom-row-pagado input.cell { background: #EAFAF1; }
    .nom-btn-success { background: #27AE60; color: #fff; border-color: #1E8449; }
    .nom-btn-success:hover { background: #1E8449; }
    .nom-btn-warning { background: #F39C12; color: #fff; border-color: #B9770E; }
    .nom-btn-warning:hover { background: #B9770E; }
    .nom-btn-warning:disabled { background: #F8C471; cursor: not-allowed; opacity: 0.6; }
    .nom-wrap { padding: var(--pad); max-width: 1700px; margin: 0 auto; }
    .nom-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: var(--pad);
      padding-bottom: 14px; border-bottom: 2px solid var(--line);
    }
    .nom-title-block { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .nom-title-block h1 {
      font-family: var(--f-display); font-size: 28px; line-height: 1;
      color: var(--ink); margin: 0; letter-spacing: -.02em;
    }
    .nom-title-block .ver {
      font-family: var(--f-mono); font-size: 11px; font-weight: 600;
      color: var(--ink-soft); background: var(--bg-soft);
      padding: 4px 10px; border-radius: var(--radius-sm); border: 1.5px solid var(--line);
    }
    .nom-title-block .sub { font-size: 13px; color: var(--ink-soft); font-style: italic; }

    .nom-tabs {
      display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: var(--gap);
      border-bottom: 2px solid var(--line); padding: 0 2px;
    }
    .nom-tab {
      padding: 10px 18px; background: transparent; border: none;
      color: var(--ink-soft); font-weight: 700; font-size: 13px;
      cursor: pointer; border-bottom: 3px solid transparent;
      margin-bottom: -2px; text-transform: uppercase; letter-spacing: .5px;
      font-family: var(--f-body); display: inline-flex; align-items: center; gap: 6px;
    }
    .nom-tab:hover { color: var(--ink); }
    .nom-tab.active { color: var(--primary); border-bottom-color: var(--primary); }

    .nom-card {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: var(--pad);
      margin-bottom: var(--gap); box-shadow: var(--shadow-sm);
    }
    .nom-card-title {
      font-family: var(--f-display); font-size: 16px; color: var(--ink); margin: 0 0 14px;
      text-transform: uppercase; letter-spacing: .6px;
      padding-bottom: 10px; border-bottom: 1.5px solid var(--line);
      display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    }

    .nom-btn {
      padding: 8px 14px; border-radius: var(--radius-sm); font-weight: 700;
      font-size: 12px; border: 2px solid var(--line-strong); cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
      text-transform: uppercase; letter-spacing: .4px;
      font-family: var(--f-body); box-shadow: var(--shadow-sm);
      transition: transform .08s, box-shadow .08s;
    }
    .nom-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: var(--shadow-md); }
    .nom-btn:active:not(:disabled) { transform: translate(1px,1px); box-shadow: none; }
    .nom-btn:disabled { opacity: .5; cursor: not-allowed; }
    .nom-btn-primary { background: var(--primary); color: white; }
    .nom-btn-success { background: #10B981; color: white; border-color: #047857; }
    .nom-btn-danger { background: #EF4444; color: white; border-color: #991B1B; }
    .nom-btn-warn { background: #F59E0B; color: white; border-color: #B45309; }
    .nom-btn-ghost { background: var(--surface); color: var(--ink); }
    .nom-btn-sm { padding: 4px 8px; font-size: 11px; box-shadow: none; border-width: 1.5px; }
    .nom-btn-lg { padding: 12px 22px; font-size: 14px; }

    .nom-input, .nom-select {
      width: 100%; padding: 8px 10px; border: 1.5px solid var(--line);
      border-radius: var(--radius-sm); font-size: 13px; color: var(--ink);
      background: var(--surface); outline: none; font-family: var(--f-body);
    }
    .nom-input:focus, .nom-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
    .nom-label { display: block; font-size: 11px; font-weight: 700; color: var(--ink-soft);
      margin: 0 0 4px; text-transform: uppercase; letter-spacing: .5px; }

    /* KPIs */
    .nom-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: var(--gap); }
    .nom-kpi {
      padding: 12px 14px; background: var(--surface); border: 2px solid var(--line);
      border-radius: var(--radius-md); border-left-width: 5px;
    }
    .nom-kpi .lbl { font-size: 10px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .5px; font-weight: 700; margin-bottom: 4px; }
    .nom-kpi .val { font-family: var(--f-mono); font-size: 22px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
    .nom-kpi.kpi-blue { border-left-color: #3B82F6; }
    .nom-kpi.kpi-green { border-left-color: #10B981; }
    .nom-kpi.kpi-amber { border-left-color: #F59E0B; }
    .nom-kpi.kpi-red { border-left-color: #EF4444; }
    .nom-kpi.kpi-purple { border-left-color: #A855F7; }

    /* Banner sugerencias */
    .nom-banner {
      padding: 14px 18px; background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
      border: 2px solid #F59E0B; border-radius: var(--radius-md);
      margin-bottom: var(--gap); display: flex; gap: 14px; align-items: flex-start;
    }
    .nom-banner.info { background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%); border-color: #3B82F6; color: #1E3A8A; }
    .nom-banner.success { background: linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%); border-color: #10B981; color: #14532D; }
    .nom-banner .ico { font-size: 26px; flex-shrink: 0; }
    .nom-banner .ctnt { flex: 1; font-size: 13px; line-height: 1.5; }
    .nom-banner strong { display: block; font-family: var(--f-display); font-size: 14px; margin-bottom: 4px; }

    /* Tabla estilo Excel */
    .nom-tablewrap { overflow-x: auto; border: 2px solid var(--line-strong); border-radius: var(--radius-md); background: white; }
    .nom-table { width: 100%; border-collapse: collapse; font-size: 13px; background: white; min-width: 1100px; }
    .nom-table th {
      text-align: left; padding: 10px 8px; background: var(--bg-soft);
      font-weight: 700; color: var(--ink); font-size: 10px;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--line-strong); white-space: nowrap;
      position: sticky; top: 0; z-index: 2;
    }
    .nom-table td {
      padding: 6px 8px; border-bottom: 1px solid var(--line); color: var(--ink);
      vertical-align: middle;
    }
    .nom-table tr:hover td { background: var(--surface-2); }
    .nom-table tr.dirty td { background: #FEF3C7; }
    .nom-table tr.dirty:hover td { background: #FDE68A; }
    .nom-table td.num { text-align: right; font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-weight: 600; }
    .nom-table tfoot td { background: var(--bg-soft); font-weight: 700; border-top: 2px solid var(--line-strong); }
    .nom-table input.cell, .nom-table select.cell {
      width: 100%; padding: 5px 7px; border: 1.5px solid transparent;
      background: transparent; font-size: 13px; font-family: var(--f-mono);
      font-variant-numeric: tabular-nums; font-weight: 600;
      text-align: right; border-radius: 4px; min-width: 80px;
    }
    .nom-table select.cell { font-family: var(--f-body); text-align: left; font-weight: 600; }
    .nom-table input.cell:hover, .nom-table select.cell:hover { border-color: var(--line); background: white; }
    .nom-table input.cell:focus, .nom-table select.cell:focus { border-color: var(--primary); background: white; box-shadow: 0 0 0 2px var(--primary-soft); outline: none; }
    .nom-table input.cell.left { text-align: left; font-family: var(--f-body); }
    .nom-row-actions { display: flex; gap: 4px; }

    .nom-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; border: 1.5px solid; white-space: nowrap;
    }
    .nom-b-vend { background: #DBEAFE; color: #1E40AF; border-color: #93C5FD; }
    .nom-b-planta { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .nom-b-comis { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .nom-b-temp { background: #F3E8FF; color: #6B21A8; border-color: #D8B4FE; }
    .nom-b-abierto { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .nom-b-cerrado { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .nom-b-cancel { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }

    .nom-error { background: #FEE2E2; color: #991B1B; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #FCA5A5; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
    .nom-success { background: #DCFCE7; color: #166534; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #86EFAC; margin-bottom: 12px; font-size: 13px; font-weight: 700; }
    .nom-empty { text-align: center; padding: 40px 20px; color: var(--ink-soft); font-style: italic; font-size: 13px; }
    .nom-loading { padding: 30px; text-align: center; color: var(--ink-soft); }

    /* Modal */
    .nom-modal-bg {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.55); z-index: 1400;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; overflow-y: auto;
    }
    .nom-modal {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); max-width: 580px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,.3);
    }
    .nom-modal.wide { max-width: 800px; }
    .nom-modal-head {
      padding: 16px 22px; background: var(--bg-soft); border-bottom: 2px solid var(--line);
      display: flex; justify-content: space-between; align-items: center;
    }
    .nom-modal-head h2 { font-family: var(--f-display); margin: 0; font-size: 17px; text-transform: uppercase; letter-spacing: .5px; }
    .nom-modal-body { padding: 18px 22px; }
    .nom-modal-foot { padding: 12px 22px; background: var(--bg-soft); border-top: 1.5px solid var(--line);
      display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .close-x { width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid var(--line); background: var(--surface); color: var(--ink);
      cursor: pointer; font-size: 16px; font-weight: 700; line-height: 1;
      display: flex; align-items: center; justify-content: center; }

    .nom-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .nom-form-row.col1 { grid-template-columns: 1fr; }
    .nom-form-row.col3 { grid-template-columns: 1fr 1fr 1fr; }
    @media (max-width: 600px) { .nom-form-row { grid-template-columns: 1fr; } }

    .nom-tooltip {
      cursor: help; position: relative; display: inline-block;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--line); color: var(--ink-soft); font-size: 11px;
      font-weight: 800; text-align: center; line-height: 18px; margin-left: 4px;
    }
    .nom-tooltip:hover::after {
      content: attr(data-tip); position: absolute; bottom: 24px; left: 50%;
      transform: translateX(-50%); white-space: pre-line; background: #1F2937;
      color: white; padding: 8px 12px; border-radius: 6px; font-size: 11px;
      width: 240px; z-index: 10; font-family: var(--f-body); font-weight: 500;
      line-height: 1.5; text-align: left;
    }
  `;
  const s = document.createElement('style');
  s.id = 'kb-nomina-styles-v1';
  s.textContent = css;
  document.head.appendChild(s);
})();

// ----------- Utils -----------
const fmtNomMXN = (n) => '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNomMXNshort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
  return fmtNomMXN(v);
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateLong = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
};

const apiNom = async (path, opts = {}) => {
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

// Helper: convertir cualquier respuesta a array (algunos endpoints devuelven objetos envoltorios)
const toArr = (r) => Array.isArray(r) ? r : (r?.cajas || r?.data || r?.items || r?.rows || []);

// ----------- Componente raíz -----------
function NominaView(props) {
  const [tab, setTab] = useState('periodo');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiNom('/api/nomina/stats').then(setStats).catch(() => {});
  }, [tab]);

  return (
    <div className="nom-wrap">
      <div className="nom-header">
        <div className="nom-title-block">
          <h1>👥 NÓMINA</h1>
          <span className="ver">v{NOMINA_VERSION}</span>
          <span className="sub">pagos semanales a empleados · comisiones · préstamos</span>
        </div>
      </div>

      {stats && (
        <div className="nom-kpis">
          <div className="nom-kpi kpi-blue">
            <div className="lbl">Empleados activos</div>
            <div className="val">{stats.empleados_activos}</div>
          </div>
          <div className="nom-kpi kpi-amber">
            <div className="lbl">Periodo abierto</div>
            <div className="val" style={{ fontSize: 14 }}>{stats.periodo_abierto ? fmtDate(stats.periodo_abierto.fecha_inicio) + ' → ' + fmtDate(stats.periodo_abierto.fecha_fin) : '— sin periodo —'}</div>
          </div>
          {stats.periodo_abierto && (
            <div className="nom-kpi kpi-green">
              <div className="lbl">Total periodo abierto</div>
              <div className="val">{fmtNomMXNshort(stats.periodo_abierto.total)}</div>
            </div>
          )}
          <div className="nom-kpi kpi-red">
            <div className="lbl">Préstamos activos</div>
            <div className="val">{stats.prestamos_activos.n} · {fmtNomMXNshort(stats.prestamos_activos.saldo)}</div>
          </div>
        </div>
      )}

      <div className="nom-tabs">
        <button className={'nom-tab' + (tab === 'periodo' ? ' active' : '')} onClick={() => setTab('periodo')}>
          📋 Periodo actual
        </button>
        <button className={'nom-tab' + (tab === 'empleados' ? ' active' : '')} onClick={() => setTab('empleados')}>
          👤 Empleados
        </button>
        <button className={'nom-tab' + (tab === 'departamentos' ? ' active' : '')} onClick={() => setTab('departamentos')}>
          🏢 Departamentos
        </button>
        <button className={'nom-tab' + (tab === 'comisiones' ? ' active' : '')} onClick={() => setTab('comisiones')}>
          💰 Tabla comisiones
        </button>
        <button className={'nom-tab' + (tab === 'prestamos' ? ' active' : '')} onClick={() => setTab('prestamos')}>
          🤝 Préstamos
        </button>
        <button className={'nom-tab' + (tab === 'historico' ? ' active' : '')} onClick={() => setTab('historico')}>
          📅 Histórico
        </button>
        <button className={'nom-tab' + (tab === 'comisiones_mensuales' ? ' active' : '')} onClick={() => setTab('comisiones_mensuales')}>📅 Comisiones Mensuales</button>
        {/* MNV1_TAB_BUTTON_INJECTED */}
      </div>

      {/* MNV1_TAB_RENDER_INJECTED */}
      {tab === 'comisiones_mensuales' && (
        typeof window.ComisionesMensualesTab === 'function'
          ? React.createElement(window.ComisionesMensualesTab)
          : <div style={{padding: 24, color: '#888'}}>
              <strong>⚠️ Módulo Comisiones Mensuales no cargado.</strong><br/>
              Verifica que <code>comisiones-mensuales-tab.jsx</code> esté incluido en <code>index.html</code> antes de <code>nomina-view.jsx</code>, y haz hard refresh (Ctrl+Shift+R).
            </div>
      )}


      {tab === 'periodo' && <PeriodoActualSection refreshAll={props.refreshAll} />}
      {tab === 'empleados' && <EmpleadosSection />}
      {tab === 'departamentos' && <DepartamentosSection />}
      {tab === 'comisiones' && <ComisionesTablaSection />}
      {tab === 'prestamos' && <PrestamosSection />}
      {tab === 'historico' && <HistoricoSection />}
    </div>
  );
}

// =====================================================
// SECCIÓN 1: PERIODO ACTUAL (tabla estilo Excel)
// =====================================================
function PeriodoActualSection({ refreshAll }) {
  const [periodo, setPeriodo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [cajas, setCajas] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);

  const cargar = async () => {
    setLoading(true);
    try {
      const lista = await apiNom('/api/nomina/periodos?estado=ABIERTO');
      if (lista.length === 0) { setPeriodo(null); setLoading(false); return; }
      const det = await apiNom('/api/nomina/periodos/' + lista[0].id);
      setPeriodo(det);
      setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    apiNom('/api/cajas').then(r => setCajas(toArr(r))).catch(() => {});
    apiNom('/api/nomina/departamentos').then(r => setDepartamentos(toArr(r))).catch(() => {});
  }, []);

  if (loading) return <div className="nom-loading">Cargando periodo…</div>;

  if (!periodo) {
    return (
      <div>
        {error && <div className="nom-error">⚠ {error}</div>}
        <div className="nom-card" style={{ textAlign: 'center', padding: 40 }}>
          <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--f-display)' }}>No hay periodo abierto</h2>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>
            Crea un nuevo periodo de nómina. El sistema precargará automáticamente todos los empleados activos y calculará comisiones sugeridas de la semana anterior.
          </p>
          <button className="nom-btn nom-btn-primary nom-btn-lg" onClick={() => setShowCreate(true)}>
            ➕ Abrir nuevo periodo
          </button>
        </div>
        {showCreate && <ModalCrearPeriodo cajas={cajas} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); cargar(); }} />}
      </div>
    );
  }

  return (
    <PeriodoEditor periodo={periodo} cajas={cajas} departamentos={departamentos}
      onRefresh={cargar} setMsg={setMsg} setError={setError} msg={msg} error={error}
      refreshAll={refreshAll} />
  );
}

function PeriodoEditor({ periodo, cajas, departamentos, onRefresh, setMsg, setError, msg, error, refreshAll }) {
  const [pagos, setPagos] = useState(periodo.pagos || []);
  const [dirty, setDirty] = useState({}); // { pago_id: true }
  const [saving, setSaving] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => { setPagos(periodo.pagos || []); setDirty({}); }, [periodo.id]);

  const update = (id, patch) => {
    setPagos(prev => prev.map(p => p.id === id ? { ...p, ...patch, total: (Number(patch.neto != null ? patch.neto : p.neto) || 0) + (Number(patch.comisiones != null ? patch.comisiones : p.comisiones) || 0) - (Number(patch.prestamos_abonados != null ? patch.prestamos_abonados : p.prestamos_abonados) || 0) } : p));
    setDirty(d => ({ ...d, [id]: true }));
  };

  const guardar = async (id) => {
    const p = pagos.find(x => x.id === id);
    if (!p) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await apiNom('/api/nomina/pagos/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          neto: Number(p.neto) || 0,
          comisiones: Number(p.comisiones) || 0,
          prestamos_abonados: Number(p.prestamos_abonados) || 0,
          caja_id: p.caja_id,
          departamento_id: p.departamento_id,
          comentario: p.comentario || null
        })
      });
      setDirty(d => { const nd = { ...d }; delete nd[id]; return nd; });
      setMsg('✓ Guardado');
      setTimeout(() => setMsg(''), 1500);
    } catch (e) { setError(e.message); }
    setSaving(s => ({ ...s, [id]: false }));
  };

  const eliminar = async (id, nombre) => {
    if (!confirm(`¿Eliminar a ${nombre} de la nómina?`)) return;
    try {
      await apiNom('/api/nomina/pagos/' + id, { method: 'DELETE' });
      setPagos(prev => prev.filter(p => p.id !== id));
    } catch (e) { setError(e.message); }
  };

  // F1_FRONTEND_PATCH — handlers de pago individual
  const pagarIndividual = async (p) => {
    if (dirty[p.id]) {
      if (!confirm('Hay cambios sin guardar en esta fila. ¿Guardar antes de pagar?')) return;
      await guardar(p.id);
    }
    if (Number(p.total) <= 0) { alert('El total de este pago debe ser mayor a $0'); return; }
    const cajaNombre = (cajas || []).find(c => c.id === p.caja_id)?.nombre || p.caja_id;
    const lineas = [];
    lineas.push('¿Marcar como PAGADO a ' + p.empleado_nombre + ' por ' + fmtNomMXN(p.total) + '?');
    lineas.push('');
    lineas.push('Se generará un GASTO en la caja: ' + cajaNombre);
    if (Number(p.prestamos_abonados) > 0) {
      lineas.push('Se aplicarán $' + p.prestamos_abonados + ' en abonos a préstamo(s).');
    }
    lineas.push('');
    lineas.push('(Si necesitas pagarlo desde OTRA caja, primero cambia la caja en la columna CAJA, guarda con 💾, y luego dale Pagar)');
    if (!confirm(lineas.join('\n'))) return;
    try {
      await apiNom('/api/nomina/pagos/' + p.id + '/pagar', {
        method: 'POST',
        body: JSON.stringify({ caja_id: p.caja_id })
      });
      setMsg('✅ ' + p.empleado_nombre + ' pagado');
      setTimeout(() => setMsg(''), 2000);
      onRefresh();
    } catch (e) { setError(e.message); }
  };

  const desmarcarPagado = async (p) => {
    const lineas = [];
    lineas.push('¿Desmarcar pago de ' + p.empleado_nombre + '?');
    lineas.push('');
    lineas.push('Esto eliminará (soft-delete) el movimiento GASTO de la caja.');
    if (Number(p.prestamos_abonados) > 0) {
      lineas.push('');
      lineas.push('⚠️ Este pago tenía $' + p.prestamos_abonados + ' en abonos a préstamo.');
      lineas.push('   Esos abonos NO se revierten automáticamente.');
      lineas.push('   Revísalos manualmente en el módulo Préstamos.');
    }
    if (!confirm(lineas.join('\n'))) return;
    try {
      await apiNom('/api/nomina/pagos/' + p.id + '/desmarcar-pagado', { method: 'POST' });
      setMsg('↩ ' + p.empleado_nombre + ' desmarcado');
      setTimeout(() => setMsg(''), 2000);
      onRefresh();
    } catch (e) { setError(e.message); }
  };

  const recalcular = async () => {
    if (!confirm('Esto recalculará las comisiones sugeridas para todos los vendedores según ventas de la semana anterior. Sobrescribe valores que hayas editado. ¿Continuar?')) return;
    try {
      const r = await apiNom('/api/nomina/periodos/' + periodo.id + '/recalcular', { method: 'POST' });
      setMsg(`✓ ${r.recalculados} comisiones recalculadas`);
      setTimeout(() => setMsg(''), 2500);
      onRefresh();
    } catch (e) { setError(e.message); }
  };

  const cerrarPeriodo = async () => {
    const pendientes = pagos.filter(p => p.pagado !== 1);
    const pagados    = pagos.filter(p => p.pagado === 1);
    const totalPendientes = pendientes.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const totalPagados    = pagados.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const lineas = ['¿Cerrar este periodo?', ''];
    if (pendientes.length > 0) {
      lineas.push('Se generarán ' + pendientes.length + ' movimientos GASTO para los pendientes (' + fmtNomMXN(totalPendientes) + ').');
    } else {
      lineas.push('No hay pagos pendientes — todos están marcados como pagados individualmente.');
    }
    if (pagados.length > 0) {
      lineas.push('Los ' + pagados.length + ' pagos ya marcados (' + fmtNomMXN(totalPagados) + ') se respetan tal como están.');
    }
    lineas.push('');
    lineas.push('Los abonos a préstamos se aplicarán automáticamente para los pendientes. NO se podrá deshacer.');
    if (!confirm(lineas.join('\n'))) return;
    setClosing(true);
    try {
      await apiNom('/api/nomina/periodos/' + periodo.id + '/cerrar', { method: 'POST' });
      setMsg('✅ Periodo cerrado correctamente');
      if (refreshAll) refreshAll();
      setTimeout(() => onRefresh(), 1000);
    } catch (e) { setError(e.message); }
    setClosing(false);
  };

  const eliminarPeriodo = async () => {
    if (!confirm('⚠️ ESTO CANCELARÁ EL PERIODO COMPLETO y eliminará todos los pagos. NO se generarán movimientos. ¿Continuar?')) return;
    try {
      await apiNom('/api/nomina/periodos/' + periodo.id, { method: 'DELETE' });
      setMsg('Periodo cancelado');
      onRefresh();
    } catch (e) { setError(e.message); }
  };

  const totales = useMemo(() => {
    return pagos.reduce((acc, p) => ({
      neto: acc.neto + (Number(p.neto) || 0),
      comisiones: acc.comisiones + (Number(p.comisiones) || 0),
      abonos: acc.abonos + (Number(p.prestamos_abonados) || 0),
      total: acc.total + (Number(p.total) || 0),
      empleados: acc.empleados + 1
    }), { neto: 0, comisiones: 0, abonos: 0, total: 0, empleados: 0 });
  }, [pagos]);

  return (
    <div>
      {error && <div className="nom-error">⚠ {error} <button className="nom-btn nom-btn-sm" onClick={() => setError('')} style={{ marginLeft: 10 }}>✕</button></div>}
      {msg && <div className="nom-success">{msg}</div>}

      <div className="nom-banner info">
        <span className="ico">📅</span>
        <div className="ctnt">
          <strong>Periodo {fmtDateLong(periodo.fecha_inicio)} → {fmtDateLong(periodo.fecha_fin)}</strong>
          Fecha de pago: <strong>{fmtDateLong(periodo.fecha_pago)}</strong> · Caja default: <strong>{periodo.caja_nombre}</strong><br />
          <span style={{ fontSize: 12 }}>
            🎯 Comisiones de la semana <strong>{fmtDate(periodo.comisiones_desde)} → {fmtDate(periodo.comisiones_hasta)}</strong>
            {periodo.bono_mensual_mes && <> · Bono mensual del mes <strong>{periodo.bono_mensual_mes}</strong></>}
          </span>
        </div>
      </div>

      <div className="nom-card">
        <div className="nom-card-title">
          <span>📋 Pagos del periodo · {totales.empleados} empleados · {fmtNomMXN(totales.total)}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="nom-btn nom-btn-ghost nom-btn-sm" onClick={recalcular} title="Recalcular comisiones sugeridas">🔄 Recalcular</button>
            <button className="nom-btn nom-btn-warn nom-btn-sm" onClick={() => setShowAdd(true)}>+ Agregar empleado</button>
            <button className="nom-btn nom-btn-ghost nom-btn-sm" onClick={() => __mnvSyncEmpleados(periodo && periodo.id)} title="Sincronizar empleados activos en periodo abierto">🔄 Sync empleados</button>
        <button className="nom-btn nom-btn-ghost nom-btn-sm" onClick={() => __mnvDownloadXlsx(periodo && periodo.id)} title="Descargar Excel del periodo">📊 Excel</button>
        <button className="nom-btn nom-btn-ghost nom-btn-sm" onClick={() => __mnvDownloadPdf(periodo && periodo.id)} title="Descargar PDF del periodo">📄 PDF</button>
        {/* MNV1_BUTTONS_INJECTED */}
        <button className="nom-btn nom-btn-danger nom-btn-sm" onClick={eliminarPeriodo}>🗑 Cancelar periodo</button>
            <button className="nom-btn nom-btn-success" onClick={cerrarPeriodo} disabled={closing || pagos.length === 0}>
              {closing ? '⏳ Cerrando…' : '🔒 CERRAR Y PAGAR'}
            </button>
          </div>
        </div>

        {pagos.length === 0 ? <div className="nom-empty">No hay pagos en este periodo. Agrega empleados manualmente.</div> :
          <div className="nom-tablewrap">
            <table className="nom-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th style={{ minWidth: 200 }}>Empleado</th>
                  <th style={{ width: 110 }}>Neto</th>
                  <th style={{ width: 110 }}>Comisiones</th>
                  <th style={{ width: 100 }}>Abono préstamo</th>
                  <th style={{ width: 120 }}>Total</th>
                  <th style={{ minWidth: 140 }}>Departamento</th>
                  <th style={{ minWidth: 130 }}>Caja</th>
                  <th style={{ minWidth: 130 }}>Detalle comisiones</th>
                  <th style={{ width: 140 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p, idx) => {
                  let det = null;
                  try { det = p.comisiones_detalle ? JSON.parse(p.comisiones_detalle) : null; } catch (e) {}
                  return (
                    <tr key={p.id} className={[dirty[p.id] && 'dirty', p.pagado === 1 && 'nom-row-pagado'].filter(Boolean).join(' ')}>
                      <td style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{idx + 1}</td>
                      <td>
                        <strong style={{ fontSize: 12 }}>{p.empleado_nombre}</strong>
                        {p.empleado_tipo && <div style={{ display: 'inline-block', marginLeft: 4 }}>
                          <span className={'nom-badge ' + (p.empleado_tipo === 'VENDEDOR' ? 'nom-b-vend' : p.empleado_tipo === 'PLANTA' ? 'nom-b-planta' : p.empleado_tipo === 'COMISIONISTA' ? 'nom-b-comis' : 'nom-b-temp')}>{p.empleado_tipo}</span>
                        </div>}
                      </td>
                      <td className="num">
                        <input className="cell" type="number" step="0.01" value={p.neto || 0}
                          onChange={e => update(p.id, { neto: e.target.value })} />
                      </td>
                      <td className="num">
                        <input className="cell" type="number" step="0.01" value={p.comisiones || 0}
                          onChange={e => update(p.id, { comisiones: e.target.value })} />
                      </td>
                      <td className="num">
                        <input className="cell" type="number" step="0.01" value={p.prestamos_abonados || 0}
                          onChange={e => update(p.id, { prestamos_abonados: e.target.value })} />
                      </td>
                      <td className="num" style={{ fontWeight: 800, color: 'var(--primary)' }}>{fmtNomMXN(p.total)}</td>
                      <td>
                        <select className="cell" value={p.departamento_id || ''}
                          onChange={e => update(p.id, { departamento_id: e.target.value || null })}>
                          <option value="">— sin depto —</option>
                          {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="cell" value={p.caja_id || ''}
                          onChange={e => update(p.id, { caja_id: e.target.value })}>
                          {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                        {det && p.empleado_tipo === 'VENDEDOR' && (
                          <div>
                            {det.ventas_s1 > 0 && <div>📊 S-1: <strong>{fmtNomMXNshort(det.ventas_s1)}</strong></div>}
                            {det.escalon && <div>🎯 Esc: {fmtNomMXNshort(det.escalon.venta_minima)} ({(det.escalon.pct * 100).toFixed(2)}%)</div>}
                            {det.ranking_pos > 0 && <div>🏆 Top {det.ranking_pos}: +{fmtNomMXNshort(det.ranking_bono)}</div>}
                            {det.bono_mensual > 0 && <div>📅 Bono mes: +{fmtNomMXNshort(det.bono_mensual)}</div>}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="nom-row-actions">
                          <button className={'nom-btn nom-btn-sm ' + (dirty[p.id] ? 'nom-btn-success' : 'nom-btn-ghost')}
                            onClick={() => guardar(p.id)}
                            disabled={!dirty[p.id] || saving[p.id]}
                            title="Guardar fila">
                            {saving[p.id] ? '⏳' : '💾'}
                          </button>
                          {p.pagado === 1 ? (
                            <button className="nom-btn nom-btn-sm nom-btn-success"
                              onClick={() => desmarcarPagado(p)}
                              title={'Pagado el ' + (p.pagado_at ? new Date(p.pagado_at).toLocaleString('es-MX') : '') + ' por ' + (p.pagado_por || '?') + ' · click para desmarcar'}>
                              ✅
                            </button>
                          ) : (
                            <button className="nom-btn nom-btn-sm nom-btn-warning"
                              onClick={() => pagarIndividual(p)}
                              disabled={dirty[p.id] || !p.total || Number(p.total) <= 0}
                              title={dirty[p.id] ? 'Guarda los cambios primero' : 'Marcar como pagado · genera GASTO en caja'}>
                              💰
                            </button>
                          )}
                          <button className="nom-btn nom-btn-sm nom-btn-danger"
                            onClick={() => eliminar(p.id, p.empleado_nombre)}
                            disabled={p.pagado === 1}
                            title={p.pagado === 1 ? 'No se puede eliminar un pago ya marcado · desmarca primero' : 'Eliminar fila'}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2" style={{ textAlign: 'right' }}>TOTALES:</td>
                  <td className="num">{fmtNomMXN(totales.neto)}</td>
                  <td className="num">{fmtNomMXN(totales.comisiones)}</td>
                  <td className="num">{fmtNomMXN(totales.abonos)}</td>
                  <td className="num" style={{ color: 'var(--primary)', fontSize: 14 }}>{fmtNomMXN(totales.total)}</td>
                  <td colSpan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        }
      </div>

      {showAdd && <ModalAgregarPago periodoId={periodo.id} cajas={cajas} departamentos={departamentos}
        cajaDefault={periodo.caja_id} onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); onRefresh(); }} />}
    </div>
  );
}

// Modal crear periodo
function ModalCrearPeriodo({ cajas, onClose, onCreated }) {
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [cajaId, setCajaId] = useState(cajas[0]?.id || '');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    try {
      await apiNom('/api/nomina/periodos', {
        method: 'POST',
        body: JSON.stringify({ fecha_pago: fechaPago, caja_id: cajaId, comentario })
      });
      onCreated();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>➕ Nuevo periodo de nómina</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-banner info">
            <span className="ico">ℹ️</span>
            <div className="ctnt">
              <strong>¿Cómo funciona?</strong>
              El sistema detecta la semana de pago (lunes a domingo) y calcula automáticamente:<br />
              • Sueldo base de la semana actual<br />
              • Comisiones de la semana anterior (S-1) según ventas reales<br />
              • Bonos de ranking semanal (top 3) y bono mensual (mes anterior completo)<br />
              • Todos los empleados activos se pre-cargan en la tabla
            </div>
          </div>

          <div className="nom-form-row">
            <div>
              <label className="nom-label">Fecha de pago</label>
              <input type="date" className="nom-input" value={fechaPago}
                onChange={e => setFechaPago(e.target.value)} />
            </div>
            <div>
              <label className="nom-label">Caja default</label>
              <select className="nom-select" value={cajaId} onChange={e => setCajaId(e.target.value)}>
                {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Comentario (opcional)</label>
              <input className="nom-input" value={comentario} onChange={e => setComentario(e.target.value)}
                placeholder="Notas internas sobre este periodo" />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit} disabled={saving || !cajaId}>
            {saving ? '⏳ Creando…' : 'Crear periodo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal agregar empleado al periodo
function ModalAgregarPago({ periodoId, cajas, departamentos, cajaDefault, onClose, onAdded }) {
  const [empleados, setEmpleados] = useState([]);
  const [empId, setEmpId] = useState('');
  const [empNombre, setEmpNombre] = useState('');
  const [deptId, setDeptId] = useState('');
  const [cajaId, setCajaId] = useState(cajaDefault || cajas[0]?.id || '');
  const [neto, setNeto] = useState('');
  const [comisiones, setComisiones] = useState('');
  const [abono, setAbono] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiNom('/api/nomina/empleados?todos=1').then(r => setEmpleados(toArr(r))).catch(() => {});
  }, []);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      await apiNom('/api/nomina/periodos/' + periodoId + '/agregar-pago', {
        method: 'POST',
        body: JSON.stringify({
          empleado_id: empId || null,
          empleado_nombre: empNombre || undefined,
          departamento_id: deptId || null,
          caja_id: cajaId,
          neto: Number(neto) || 0,
          comisiones: Number(comisiones) || 0,
          prestamos_abonados: Number(abono) || 0
        })
      });
      onAdded();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>+ Agregar empleado a la nómina</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Empleado del catálogo</label>
              <select className="nom-select" value={empId} onChange={e => {
                setEmpId(e.target.value);
                const emp = empleados.find(x => x.id === e.target.value);
                if (emp) { setEmpNombre(emp.nombre); setDeptId(emp.departamento_id || ''); setNeto(emp.sueldo_base || ''); }
              }}>
                <option value="">— Seleccionar empleado o escribir manual abajo —</option>
                {empleados.map(e => <option key={e.id} value={e.id}>
                  {e.nombre} {e.activo ? '' : '(inactivo)'} {e.tipo ? `· ${e.tipo}` : ''} {e.departamento_nombre ? `· ${e.departamento_nombre}` : ''}
                </option>)}
              </select>
            </div>
          </div>
          {!empId && (
            <div className="nom-form-row col1">
              <div>
                <label className="nom-label">O escribe nombre temporal</label>
                <input className="nom-input" value={empNombre} onChange={e => setEmpNombre(e.target.value)}
                  placeholder="Apellido Apellido, Nombre" />
              </div>
            </div>
          )}
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Departamento</label>
              <select className="nom-select" value={deptId} onChange={e => setDeptId(e.target.value)}>
                <option value="">— sin depto —</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="nom-label">Caja</label>
              <select className="nom-select" value={cajaId} onChange={e => setCajaId(e.target.value)}>
                {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="nom-form-row col3">
            <div>
              <label className="nom-label">Neto</label>
              <input type="number" step="0.01" className="nom-input" value={neto} onChange={e => setNeto(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="nom-label">Comisiones</label>
              <input type="number" step="0.01" className="nom-input" value={comisiones} onChange={e => setComisiones(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="nom-label">Abono préstamo</label>
              <input type="number" step="0.01" className="nom-input" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit}
            disabled={saving || (!empId && !empNombre.trim())}>
            {saving ? '⏳ Guardando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN 2: EMPLEADOS (catálogo)
// =====================================================
function EmpleadosSection() {
  const [empleados, setEmpleados] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const url = showAll ? '/api/nomina/empleados?todos=1' : '/api/nomina/empleados';
      const list = await apiNom(url);
      setEmpleados(toArr(list)); setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    apiNom('/api/nomina/departamentos').then(r => setDepartamentos(toArr(r))).catch(() => {});
    apiNom('/api/ventas/vendedores?todos=1').then(r => setVendedores(toArr(r))).catch(() => {});
  }, [showAll]);

  const visibles = useMemo(() => {
    let r = empleados;
    if (filterTipo) r = r.filter(e => e.tipo === filterTipo);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(e => (e.nombre || '').toLowerCase().includes(s) || (e.numero || '').toString().includes(s));
    }
    return r;
  }, [empleados, filterTipo, search]);

  return (
    <div>
      {error && <div className="nom-error">⚠ {error}</div>}
      <div className="nom-card">
        <div className="nom-card-title">
          <span>👤 Catálogo de empleados · {visibles.length}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="nom-input" style={{ width: 180 }} placeholder="Buscar..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="nom-select" style={{ width: 140 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              <option value="VENDEDOR">Vendedor</option>
              <option value="PLANTA">Planta</option>
              <option value="COMISIONISTA">Comisionista</option>
              <option value="TEMPORAL">Temporal</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              Ver inactivos
            </label>
            <button className="nom-btn nom-btn-primary nom-btn-sm" onClick={() => setShowCreate(true)}>+ Nuevo empleado</button>
          </div>
        </div>
        {loading ? <div className="nom-loading">Cargando…</div> :
          visibles.length === 0 ? <div className="nom-empty">No hay empleados</div> :
          <div className="nom-tablewrap">
            <table className="nom-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Departamento</th>
                  <th className="num">Sueldo base</th>
                  <th>Vendedor vinculado</th>
                  <th>Préstamos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--f-mono)' }}>{e.numero || '—'}</td>
                    <td><strong>{e.nombre}</strong></td>
                    <td><span className={'nom-badge ' + (e.tipo === 'VENDEDOR' ? 'nom-b-vend' : e.tipo === 'PLANTA' ? 'nom-b-planta' : e.tipo === 'COMISIONISTA' ? 'nom-b-comis' : 'nom-b-temp')}>{e.tipo}</span></td>
                    <td>{e.departamento_nombre || '—'}</td>
                    <td className="num">{fmtNomMXN(e.sueldo_base)}</td>
                    <td style={{ fontSize: 11 }}>{e.vendedor_id ? (vendedores.find(v => v.id === e.vendedor_id)?.nombre || e.vendedor_id) : '—'}</td>
                    <td style={{ fontSize: 11 }}>
                      {e.prestamos_activos > 0 ? <>{e.prestamos_activos} act · <strong>{fmtNomMXNshort(e.prestamos_saldo)}</strong></> : '—'}
                    </td>
                    <td>{e.activo ? <span style={{ color: '#10B981', fontWeight: 700 }}>● Activo</span> : <span style={{ color: '#EF4444' }}>○ Inactivo</span>}</td>
                    <td>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setEditing(e)}>✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>

      {(showCreate || editing) && <ModalEmpleado
        empleado={editing}
        departamentos={departamentos}
        vendedores={vendedores}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSaved={() => { setShowCreate(false); setEditing(null); cargar(); }}
      />}
    </div>
  );
}

function ModalEmpleado({ empleado, departamentos, vendedores, onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre: empleado?.nombre || '',
    numero: empleado?.numero || '',
    tipo: empleado?.tipo || 'PLANTA',
    departamento_id: empleado?.departamento_id || '',
    sueldo_base: empleado?.sueldo_base || '',
    vendedor_id: empleado?.vendedor_id || '',
    fecha_ingreso: empleado?.fecha_ingreso || '',
    telefono: empleado?.telefono || '',
    banco: empleado?.banco || '',
    cuenta: empleado?.cuenta || '',
    notas: empleado?.notas || '',
    activo: empleado?.activo != null ? !!empleado.activo : true
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.nombre.trim()) { setError('Nombre requerido'); return; }
    setSaving(true); setError('');
    try {
      if (empleado) {
        await apiNom('/api/nomina/empleados/' + empleado.id, {
          method: 'PUT', body: JSON.stringify(form)
        });
      } else {
        await apiNom('/api/nomina/empleados', {
          method: 'POST', body: JSON.stringify(form)
        });
      }
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const eliminar = async () => {
    if (!empleado) return;
    if (!confirm(`¿Marcar a "${empleado.nombre}" como inactivo? (Mantiene historial)`)) return;
    try {
      await apiNom('/api/nomina/empleados/' + empleado.id, { method: 'DELETE' });
      onSaved();
    } catch (e) { setError(e.message); }
  };

  const eliminarPermanente = async () => {
    if (!empleado) return;
    if (!confirm(`¿ELIMINAR PERMANENTEMENTE a "${empleado.nombre}"? Solo se puede si NO tiene registros vinculados.`)) return;
    try {
      await apiNom('/api/nomina/empleados/' + empleado.id + '?hard=1', { method: 'DELETE' });
      onSaved();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal wide" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>{empleado ? '✏️ Editar empleado' : '+ Nuevo empleado'}</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Nombre completo *</label>
              <input className="nom-input" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Apellido Apellido, Nombre" autoFocus />
            </div>
            <div>
              <label className="nom-label">Número</label>
              <input type="number" className="nom-input" value={form.numero} onChange={e => set('numero', e.target.value)}
                placeholder="ej. 332" />
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Tipo</label>
              <select className="nom-select" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="PLANTA">PLANTA (sueldo fijo)</option>
                <option value="VENDEDOR">VENDEDOR (sueldo + comisiones)</option>
                <option value="COMISIONISTA">COMISIONISTA (solo comisión)</option>
                <option value="TEMPORAL">TEMPORAL (eventual)</option>
              </select>
            </div>
            <div>
              <label className="nom-label">Departamento</label>
              <select className="nom-select" value={form.departamento_id} onChange={e => set('departamento_id', e.target.value)}>
                <option value="">— sin depto —</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Sueldo base semanal</label>
              <input type="number" step="0.01" className="nom-input" value={form.sueldo_base}
                onChange={e => set('sueldo_base', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="nom-label">Vendedor vinculado (para comisiones)
                <span className="nom-tooltip" data-tip="Si es VENDEDOR, vincula al vendedor del módulo de Ventas para calcular comisiones automáticamente de sus ventas reales.">?</span>
              </label>
              <select className="nom-select" value={form.vendedor_id} onChange={e => set('vendedor_id', e.target.value)}>
                <option value="">— sin vendedor —</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.codigo || '—'})</option>)}
              </select>
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Fecha ingreso</label>
              <input type="date" className="nom-input" value={form.fecha_ingreso} onChange={e => set('fecha_ingreso', e.target.value)} />
            </div>
            <div>
              <label className="nom-label">Teléfono</label>
              <input className="nom-input" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Banco</label>
              <input className="nom-input" value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="ej. BBVA" />
            </div>
            <div>
              <label className="nom-label">Cuenta / CLABE</label>
              <input className="nom-input" value={form.cuenta} onChange={e => set('cuenta', e.target.value)} />
            </div>
          </div>
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Notas</label>
              <input className="nom-input" value={form.notas} onChange={e => set('notas', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" id="emp-activo" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
            <label htmlFor="emp-activo" style={{ fontSize: 13, cursor: 'pointer' }}>Empleado activo (se incluye en nóminas nuevas)</label>
          </div>
        </div>
        <div className="nom-modal-foot">
          {empleado && (
            <>
              <button className="nom-btn nom-btn-danger nom-btn-sm" onClick={eliminarPermanente} style={{ marginRight: 'auto' }}>
                🗑 Eliminar permanente
              </button>
              <button className="nom-btn nom-btn-warn nom-btn-sm" onClick={eliminar}>Inactivar</button>
            </>
          )}
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '⏳' : (empleado ? 'Guardar' : 'Crear')}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN 3: DEPARTAMENTOS
// =====================================================
function DepartamentosSection() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);

  const cargar = () => apiNom('/api/nomina/departamentos?todos=1').then(r => setList(toArr(r))).catch(e => setError(e.message));
  useEffect(() => { cargar(); }, []);

  return (
    <div>
      {error && <div className="nom-error">⚠ {error}</div>}
      <div className="nom-card">
        <div className="nom-card-title">
          <span>🏢 Departamentos · {list.length}</span>
          <button className="nom-btn nom-btn-primary nom-btn-sm" onClick={() => setShowCreate(true)}>+ Nuevo</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
          Cada departamento genera automáticamente una categoría GASTO "NOMINA [DEPARTAMENTO]" que se usa al cerrar el periodo.
        </p>
        {list.length === 0 ? <div className="nom-empty">No hay departamentos</div> :
          <div className="nom-tablewrap">
            <table className="nom-table" style={{ minWidth: 'auto' }}>
              <thead>
                <tr><th>Orden</th><th>Departamento</th><th>Categoría auto-generada</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id}>
                    <td>{d.orden}</td>
                    <td><strong>{d.nombre}</strong></td>
                    <td><code style={{ fontSize: 11, background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 3 }}>{d.categoria_nomina}</code></td>
                    <td>{d.activo ? <span style={{ color: '#10B981' }}>● Activo</span> : <span style={{ color: '#EF4444' }}>○ Inactivo</span>}</td>
                    <td>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setEditing(d)}>✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>
      {(showCreate || editing) && <ModalDept dept={editing} onClose={() => { setShowCreate(false); setEditing(null); }}
        onSaved={() => { setShowCreate(false); setEditing(null); cargar(); }} />}
    </div>
  );
}

function ModalDept({ dept, onClose, onSaved }) {
  const [nombre, setNombre] = useState(dept?.nombre || '');
  const [orden, setOrden] = useState(dept?.orden || 0);
  const [activo, setActivo] = useState(dept?.activo != null ? !!dept.activo : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!nombre.trim()) { setError('Nombre requerido'); return; }
    setSaving(true); setError('');
    try {
      const body = { nombre, orden: Number(orden) || 0, activo };
      if (dept) await apiNom('/api/nomina/departamentos/' + dept.id, { method: 'PUT', body: JSON.stringify(body) });
      else await apiNom('/api/nomina/departamentos', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const eliminar = async () => {
    if (!dept) return;
    if (!confirm(`¿Eliminar el departamento "${dept.nombre}"?`)) return;
    try { await apiNom('/api/nomina/departamentos/' + dept.id, { method: 'DELETE' }); onSaved(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>{dept ? '✏️ Editar departamento' : '+ Nuevo departamento'}</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Nombre</label>
              <input className="nom-input" value={nombre} onChange={e => setNombre(e.target.value.toUpperCase())} autoFocus placeholder="VENTAS" />
              <small style={{ color: 'var(--ink-soft)', fontSize: 11 }}>Categoría generada: NOMINA {nombre}</small>
            </div>
            <div>
              <label className="nom-label">Orden</label>
              <input type="number" className="nom-input" value={orden} onChange={e => setOrden(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" id="d-activo" checked={activo} onChange={e => setActivo(e.target.checked)} />
            <label htmlFor="d-activo" style={{ fontSize: 13, cursor: 'pointer' }}>Activo</label>
          </div>
        </div>
        <div className="nom-modal-foot">
          {dept && <button className="nom-btn nom-btn-danger nom-btn-sm" onClick={eliminar} style={{ marginRight: 'auto' }}>🗑 Eliminar</button>}
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '⏳' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN 4: TABLA DE COMISIONES
// =====================================================
function ComisionesTablaSection() {
  const [tabla, setTabla] = useState([]);
  const [bonos, setBonos] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState({});

  const cargar = async () => {
    try {
      const t = await apiNom('/api/nomina/comisiones-tabla');
      const b = await apiNom('/api/nomina/bonos');
      setTabla(toArr(t)); setBonos(toArr(b)); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { cargar(); }, []);

  const updateEscalon = (id, k, v) => {
    setTabla(prev => prev.map(t => t.id === id ? { ...t, [k]: v } : t));
    setDirty(d => ({ ...d, [id]: true }));
  };

  const guardarEscalon = async (esc) => {
    try {
      await apiNom('/api/nomina/comisiones-tabla', {
        method: 'POST',
        body: JSON.stringify({
          id: esc.id,
          venta_minima: Number(esc.venta_minima) || 0,
          pct_comision: Number(esc.pct_comision) || 0,
          bono_meta: Number(esc.bono_meta) || 0,
          orden: Number(esc.orden) || 0
        })
      });
      setDirty(d => { const nd = { ...d }; delete nd[esc.id]; return nd; });
      setMsg('✓ Guardado'); setTimeout(() => setMsg(''), 1500);
    } catch (e) { setError(e.message); }
  };

  const eliminarEscalon = async (id) => {
    if (!confirm('¿Eliminar este escalón?')) return;
    try { await apiNom('/api/nomina/comisiones-tabla/' + id, { method: 'DELETE' }); cargar(); }
    catch (e) { setError(e.message); }
  };

  const agregarEscalon = async () => {
    const venta = prompt('Venta mínima del nuevo escalón ($):');
    if (!venta) return;
    const pct = prompt('Porcentaje (ej. 0.05 para 5%):');
    if (!pct) return;
    const bono = prompt('Bono meta (en $, 0 si no aplica):') || '0';
    try {
      await apiNom('/api/nomina/comisiones-tabla', {
        method: 'POST',
        body: JSON.stringify({
          venta_minima: Number(venta), pct_comision: Number(pct), bono_meta: Number(bono),
          orden: tabla.length + 1
        })
      });
      cargar();
    } catch (e) { setError(e.message); }
  };

  const guardarBono = async (b, patch) => {
    try {
      await apiNom('/api/nomina/bonos', {
        method: 'POST',
        body: JSON.stringify({ ...b, ...patch })
      });
      cargar();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="nom-error">⚠ {error}</div>}
      {msg && <div className="nom-success">{msg}</div>}

      <div className="nom-card">
        <div className="nom-card-title">
          <span>💰 Tabla de comisiones escalonadas</span>
          <button className="nom-btn nom-btn-primary nom-btn-sm" onClick={agregarEscalon}>+ Agregar escalón</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
          🎯 Al calcular comisiones: si un vendedor vende <strong>$26,999</strong>, cae en el escalón de $26,000 (floor strict). Si vende $27,000 exactos, cae en $27,000. Aplica solo a empleados tipo VENDEDOR.
        </p>
        <div className="nom-tablewrap">
          <table className="nom-table" style={{ minWidth: 'auto' }}>
            <thead>
              <tr>
                <th className="num">Venta mínima</th>
                <th className="num">% Comisión</th>
                <th className="num">Comisión (ej.)</th>
                <th className="num">Bono meta</th>
                <th className="num">Beneficio total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map(t => {
                const ejComis = (Number(t.venta_minima) || 0) * (Number(t.pct_comision) || 0);
                const total = ejComis + (Number(t.bono_meta) || 0);
                return (
                  <tr key={t.id} className={dirty[t.id] ? 'dirty' : ''}>
                    <td className="num">
                      <input className="cell" type="number" step="100" value={t.venta_minima}
                        onChange={e => updateEscalon(t.id, 'venta_minima', e.target.value)} />
                    </td>
                    <td className="num">
                      <input className="cell" type="number" step="0.0025" value={t.pct_comision}
                        onChange={e => updateEscalon(t.id, 'pct_comision', e.target.value)} />
                      <small style={{ color: 'var(--ink-soft)', fontSize: 10 }}>= {((Number(t.pct_comision) || 0) * 100).toFixed(2)}%</small>
                    </td>
                    <td className="num" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{fmtNomMXN(ejComis)}</td>
                    <td className="num">
                      <input className="cell" type="number" step="50" value={t.bono_meta}
                        onChange={e => updateEscalon(t.id, 'bono_meta', e.target.value)} />
                    </td>
                    <td className="num" style={{ color: 'var(--primary)', fontWeight: 800 }}>{fmtNomMXN(total)}</td>
                    <td>
                      <button className={'nom-btn nom-btn-sm ' + (dirty[t.id] ? 'nom-btn-success' : 'nom-btn-ghost')}
                        onClick={() => guardarEscalon(t)} disabled={!dirty[t.id]}>
                        💾
                      </button>
                      <button className="nom-btn nom-btn-sm nom-btn-danger" onClick={() => eliminarEscalon(t.id)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="nom-card">
        <div className="nom-card-title">🏆 Bonos por ranking semanal (top 3 vendedores)</div>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
          Bono adicional para los 3 vendedores con mayor venta de la semana anterior (efectivo + transferencias).
        </p>
        <div className="nom-tablewrap">
          <table className="nom-table" style={{ minWidth: 'auto' }}>
            <thead><tr><th>Posición</th><th className="num">Bono</th><th>Activo</th></tr></thead>
            <tbody>
              {bonos.filter(b => b.tipo === 'RANKING').map(b => (
                <tr key={b.id}>
                  <td>{b.posicion === 1 ? '🥇 1er lugar' : b.posicion === 2 ? '🥈 2do lugar' : '🥉 3er lugar'}</td>
                  <td className="num">
                    <input className="cell" type="number" defaultValue={b.monto}
                      onBlur={e => guardarBono(b, { monto: Number(e.target.value) })} />
                  </td>
                  <td>{b.activo ? <span style={{ color: '#10B981' }}>● Activo</span> : <span style={{ color: '#EF4444' }}>○ Inactivo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="nom-card">
        <div className="nom-card-title">📅 Bonos por meta mensual</div>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
          Bono al cumplir meta mensual de ventas (efectivo + transferencias, del mes anterior completo).
        </p>
        <div className="nom-tablewrap">
          <table className="nom-table" style={{ minWidth: 'auto' }}>
            <thead><tr><th className="num">Meta de venta mensual</th><th className="num">Bono</th><th>Activo</th></tr></thead>
            <tbody>
              {bonos.filter(b => b.tipo === 'MENSUAL').map(b => (
                <tr key={b.id}>
                  <td className="num">{fmtNomMXN(b.posicion)}</td>
                  <td className="num">
                    <input className="cell" type="number" defaultValue={b.monto}
                      onBlur={e => guardarBono(b, { monto: Number(e.target.value) })} />
                  </td>
                  <td>{b.activo ? <span style={{ color: '#10B981' }}>● Activo</span> : <span style={{ color: '#EF4444' }}>○ Inactivo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN 5: PRÉSTAMOS
// =====================================================
// Modal reutilizable para pedir PIN (4 dígitos) antes de una acción sensible.
// onConfirm(pin) recibe el pin; el componente que lo invoca hace la llamada.
function ModalPinNom({ titulo, mensaje, onConfirm, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) { setError('El PIN debe ser de 4 dígitos'); return; }
    setSaving(true); setError('');
    try {
      await onConfirm(pin);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="nom-modal-bg" onClick={onClose} style={{ zIndex: 60 }}>
      <div className="nom-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="nom-modal-head">
          <h2>🔒 {titulo || 'Confirmar con PIN'}</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          {mensaje && <div className="nom-banner info" style={{ marginBottom: 12 }}>
            <span className="ico">⚠️</span>
            <div className="ctnt" style={{ fontSize: 12 }}>{mensaje}</div>
          </div>}
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">PIN de autorización *</label>
              <input type="password" inputMode="numeric" maxLength={4} className="nom-input"
                value={pin} autoFocus
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                placeholder="••••" style={{ letterSpacing: '8px', textAlign: 'center', fontSize: 22 }} />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '⏳ Verificando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrestamosSection() {
  const [prestamos, setPrestamos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [filterEstado, setFilterEstado] = useState('ACTIVO');
  const [showCreate, setShowCreate] = useState(false);
  const [editar, setEditar] = useState(null);
  const [abonar, setAbonar] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const list = await apiNom('/api/nomina/prestamos?estado=' + filterEstado);
      setPrestamos(toArr(list)); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { cargar(); }, [filterEstado]);
  useEffect(() => {
    apiNom('/api/nomina/empleados').then(r => setEmpleados(toArr(r))).catch(() => {});
    apiNom('/api/cajas').then(r => setCajas(toArr(r))).catch(() => {});
  }, []);

  return (
    <div>
      {error && <div className="nom-error">⚠ {error}</div>}
      <div className="nom-card">
        <div className="nom-card-title">
          <span>🤝 Préstamos a empleados</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="nom-select" style={{ width: 140 }} value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
              <option value="ACTIVO">Activos</option>
              <option value="SALDADO">Saldados</option>
              <option value="CANCELADO">Cancelados</option>
              <option value="TODOS">Todos</option>
            </select>
            <button className="nom-btn nom-btn-primary nom-btn-sm" onClick={() => setShowCreate(true)}>+ Nuevo préstamo</button>
          </div>
        </div>
        {prestamos.length === 0 ? <div className="nom-empty">No hay préstamos {filterEstado.toLowerCase()}</div> :
          <div className="nom-tablewrap">
            <table className="nom-table" style={{ minWidth: 'auto' }}>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th className="num">Original</th>
                  <th className="num">Abonado</th>
                  <th className="num">Saldo</th>
                  <th className="num">Sug. semanal</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {prestamos.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.empleado_nombre}</strong></td>
                    <td style={{ fontSize: 11 }}>{fmtDate(p.fecha)}</td>
                    <td style={{ fontSize: 11 }}>{p.motivo || '—'}</td>
                    <td className="num">{fmtNomMXN(p.monto_original)}</td>
                    <td className="num">{fmtNomMXN(p.abonado_total)}</td>
                    <td className="num" style={{ color: p.estado === 'SALDADO' ? '#10B981' : 'var(--primary)', fontWeight: 800 }}>
                      {fmtNomMXN(p.saldo_actual)}
                    </td>
                    <td className="num" style={{ fontSize: 11 }}>{fmtNomMXN(p.abono_sugerido_semanal)}</td>
                    <td>
                      {p.estado === 'ACTIVO' && <span className="nom-badge nom-b-abierto">ACTIVO</span>}
                      {p.estado === 'SALDADO' && <span className="nom-badge nom-b-cerrado">SALDADO</span>}
                      {p.estado === 'CANCELADO' && <span className="nom-badge nom-b-cancel">CANCEL</span>}
                    </td>
                    <td>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setDetalle(p.id)} title="Ver detalle">👁</button>
                      {p.estado !== 'CANCELADO' && <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setEditar(p)} title="Editar préstamo">✎</button>}
                      {p.estado === 'ACTIVO' && <button className="nom-btn nom-btn-sm nom-btn-success" onClick={() => setAbonar(p)} title="Abonar">💵</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>

      {showCreate && <ModalPrestamo empleados={empleados} cajas={cajas}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); cargar(); }} />}
      {editar && <ModalPrestamo empleados={empleados} cajas={cajas} prestamo={editar}
        onClose={() => setEditar(null)}
        onSaved={() => { setEditar(null); cargar(); }} />}
      {abonar && <ModalAbonarPrestamo prestamo={abonar} cajas={cajas}
        onClose={() => setAbonar(null)}
        onSaved={() => { setAbonar(null); cargar(); }} />}
      {detalle && <ModalDetallePrestamo prestamoId={detalle} onClose={() => setDetalle(null)} onChanged={cargar} />}
    </div>
  );
}

function ModalPrestamo({ empleados, cajas, prestamo, onClose, onSaved }) {
  const esEdicion = !!prestamo;
  const [form, setForm] = useState({
    empleado_id: prestamo?.empleado_id || empleados[0]?.id || '',
    fecha: prestamo?.fecha || new Date().toISOString().slice(0, 10),
    monto_original: prestamo?.monto_original ?? '',
    abono_sugerido_semanal: prestamo?.abono_sugerido_semanal ?? '',
    motivo: prestamo?.motivo || '',
    caja_origen: prestamo?.caja_origen || cajas[0]?.id || '',
    metodo: prestamo?.metodo || 'EFECTIVO',
    comentario: prestamo?.comentario || ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pedirPin, setPedirPin] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Crear: POST directo. Editar: validar y luego pedir PIN.
  const submit = async () => {
    if (!esEdicion && !form.empleado_id) { setError('Selecciona empleado'); return; }
    if (!(Number(form.monto_original) > 0)) { setError('Monto inválido'); return; }
    if (!esEdicion && !form.caja_origen) { setError('Selecciona caja'); return; }
    if (esEdicion) { setError(''); setPedirPin(true); return; }
    setSaving(true); setError('');
    try {
      await apiNom('/api/nomina/prestamos', { method: 'POST', body: JSON.stringify(form) });
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const guardarEdicion = async (pin) => {
    await apiNom('/api/nomina/prestamos/' + prestamo.id, {
      method: 'PUT',
      body: JSON.stringify({
        monto_original: Number(form.monto_original),
        motivo: form.motivo,
        abono_sugerido_semanal: Number(form.abono_sugerido_semanal) || 0,
        comentario: form.comentario,
        pin
      })
    });
    setPedirPin(false);
    onSaved();
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>{esEdicion ? '✎ Editar préstamo' : '🤝 Nuevo préstamo'}</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          {esEdicion ? (
            <div className="nom-banner info">
              <span className="ico">✎</span>
              <div className="ctnt" style={{ fontSize: 12 }}>
                Editando préstamo de <strong>{prestamo.empleado_nombre}</strong>. Si cambias el monto, el saldo se recalcula
                automáticamente y se ajusta el movimiento de entrega en caja. Requiere PIN.
              </div>
            </div>
          ) : (
            <div className="nom-banner info">
              <span className="ico">💡</span>
              <div className="ctnt" style={{ fontSize: 12 }}>
                Esto generará un movimiento GASTO en categoría <strong>PRESTAMOS EMPLEADOS</strong> (autoexcluida del P&L).
                Cuando el empleado abone, se registra como INGRESO en la categoría <strong>ABONO PRESTAMO EMPLEADO</strong>.
              </div>
            </div>
          )}
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Empleado *</label>
              <select className="nom-select" value={form.empleado_id} disabled={esEdicion}
                onChange={e => set('empleado_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.departamento_nombre ? ` · ${e.departamento_nombre}` : ''}</option>)}
              </select>
              {esEdicion && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>El empleado no se puede cambiar al editar.</div>}
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Monto *</label>
              <input type="number" step="0.01" className="nom-input" value={form.monto_original}
                onChange={e => set('monto_original', e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div>
              <label className="nom-label">Abono sugerido semanal</label>
              <input type="number" step="0.01" className="nom-input" value={form.abono_sugerido_semanal}
                onChange={e => set('abono_sugerido_semanal', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Fecha</label>
              <input type="date" className="nom-input" value={form.fecha} disabled={esEdicion}
                onChange={e => set('fecha', e.target.value)} />
            </div>
            <div>
              <label className="nom-label">Método</label>
              <select className="nom-select" value={form.metodo} disabled={esEdicion}
                onChange={e => set('metodo', e.target.value)}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>
          {!esEdicion && (
            <div className="nom-form-row col1">
              <div>
                <label className="nom-label">Caja de salida *</label>
                <select className="nom-select" value={form.caja_origen} onChange={e => set('caja_origen', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Motivo</label>
              <input className="nom-input" value={form.motivo} onChange={e => set('motivo', e.target.value)}
                placeholder="ej. Emergencia médica, escuela hijos..." />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '⏳ Guardando…' : (esEdicion ? 'Guardar cambios' : 'Entregar préstamo')}
          </button>
        </div>
      </div>
      {pedirPin && <ModalPinNom
        titulo="Confirmar edición"
        mensaje={`Vas a editar el préstamo de ${prestamo.empleado_nombre}. Esta acción ajusta saldos y caja.`}
        onConfirm={guardarEdicion}
        onClose={() => setPedirPin(false)} />}
    </div>
  );
}

function ModalAbonarPrestamo({ prestamo, cajas, onClose, onSaved }) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cajaId, setCajaId] = useState(cajas[0]?.id || '');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!(Number(monto) > 0)) { setError('Monto inválido'); return; }
    if (Number(monto) > Number(prestamo.saldo_actual) + 0.01) { setError(`Monto excede saldo (${fmtNomMXN(prestamo.saldo_actual)})`); return; }
    setSaving(true); setError('');
    try {
      await apiNom('/api/nomina/prestamos/' + prestamo.id + '/abonar', {
        method: 'POST',
        body: JSON.stringify({ monto: Number(monto), fecha, caja_id: cajaId, metodo, comentario })
      });
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>💵 Abonar a préstamo</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-banner success">
            <span className="ico">💼</span>
            <div className="ctnt">
              <strong>{prestamo.empleado_nombre}</strong>
              Saldo actual: <strong>{fmtNomMXN(prestamo.saldo_actual)}</strong> · Original: {fmtNomMXN(prestamo.monto_original)}
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Monto del abono *</label>
              <input type="number" step="0.01" className="nom-input" value={monto}
                onChange={e => setMonto(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div>
              <label className="nom-label">Fecha</label>
              <input type="date" className="nom-input" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Caja que recibe</label>
              <select className="nom-select" value={cajaId} onChange={e => setCajaId(e.target.value)}>
                {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="nom-label">Método</label>
              <select className="nom-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>
          </div>
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Comentario</label>
              <input className="nom-input" value={comentario} onChange={e => setComentario(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-success" onClick={submit} disabled={saving}>
            {saving ? '⏳' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalDetallePrestamo({ prestamoId, onClose, onChanged }) {
  const [pr, setPr] = useState(null);
  const [error, setError] = useState('');
  const [editAbono, setEditAbono] = useState(null);   // abono en edición
  const [delAbono, setDelAbono] = useState(null);      // abono a borrar (pide PIN)

  const cargar = () => {
    apiNom('/api/nomina/prestamos/' + prestamoId).then(setPr).catch(e => setError(e.message));
  };
  useEffect(() => { cargar(); }, [prestamoId]);

  const refrescar = () => { cargar(); if (onChanged) onChanged(); };

  const borrarAbono = async (pin) => {
    await apiNom('/api/nomina/prestamos/' + prestamoId + '/abonos/' + delAbono.id, {
      method: 'DELETE',
      body: JSON.stringify({ pin })
    });
    setDelAbono(null);
    refrescar();
  };

  if (error) return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-body"><div className="nom-error">{error}</div></div>
        <div className="nom-modal-foot"><button className="nom-btn nom-btn-ghost" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
  if (!pr) return null;

  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal wide" onClick={e => e.stopPropagation()}>
        <div className="nom-modal-head">
          <h2>📋 Detalle del préstamo</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><strong>Empleado:</strong> {pr.empleado_nombre}</div>
            <div><strong>Fecha:</strong> {fmtDate(pr.fecha)}</div>
            <div><strong>Original:</strong> {fmtNomMXN(pr.monto_original)}</div>
            <div><strong>Saldo:</strong> <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{fmtNomMXN(pr.saldo_actual)}</span></div>
            <div><strong>Caja origen:</strong> {pr.caja_origen_nombre}</div>
            <div><strong>Estado:</strong> {pr.estado}</div>
            <div style={{ gridColumn: 'span 2' }}><strong>Motivo:</strong> {pr.motivo || '—'}</div>
          </div>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1.5px solid var(--line)', paddingBottom: 6 }}>
            Historial de abonos ({pr.abonos.length})
          </h3>
          {pr.abonos.length === 0 ? <div className="nom-empty">Sin abonos aún</div> :
            <table className="nom-table" style={{ minWidth: 'auto', marginTop: 10 }}>
              <thead><tr><th>Fecha</th><th className="num">Monto</th><th>Método</th><th>Caja</th><th>Comentario</th><th>Acciones</th></tr></thead>
              <tbody>
                {pr.abonos.map(a => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.fecha)}</td>
                    <td className="num">{fmtNomMXN(a.monto)}</td>
                    <td>{a.metodo}</td>
                    <td>{a.caja_nombre || '—'}</td>
                    <td style={{ fontSize: 11 }}>{a.comentario || '—'}</td>
                    <td>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setEditAbono(a)} title="Editar abono">✎</button>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setDelAbono(a)} title="Borrar abono" style={{ color: 'var(--primary)' }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {editAbono && <ModalEditarAbono prestamoId={prestamoId} abono={editAbono}
        montoOriginal={pr.monto_original}
        onClose={() => setEditAbono(null)}
        onSaved={() => { setEditAbono(null); refrescar(); }} />}

      {delAbono && <ModalPinNom
        titulo="Borrar abono"
        mensaje={`Vas a eliminar el abono de ${fmtNomMXN(delAbono.monto)} del ${fmtDate(delAbono.fecha)}. Se revertirá el ingreso en caja y el saldo del préstamo aumentará.`}
        onConfirm={borrarAbono}
        onClose={() => setDelAbono(null)} />}
    </div>
  );
}

// Modal para editar el monto/comentario de un abono existente (pide PIN).
function ModalEditarAbono({ prestamoId, abono, montoOriginal, onClose, onSaved }) {
  const [monto, setMonto] = useState(abono.monto);
  const [comentario, setComentario] = useState(abono.comentario || '');
  const [error, setError] = useState('');
  const [pedirPin, setPedirPin] = useState(false);

  const continuar = () => {
    if (!(Number(monto) > 0)) { setError('Monto inválido'); return; }
    setError(''); setPedirPin(true);
  };

  const guardar = async (pin) => {
    await apiNom('/api/nomina/prestamos/' + prestamoId + '/abonos/' + abono.id, {
      method: 'PUT',
      body: JSON.stringify({ monto: Number(monto), comentario, pin })
    });
    setPedirPin(false);
    onSaved();
  };

  return (
    <div className="nom-modal-bg" onClick={onClose} style={{ zIndex: 55 }}>
      <div className="nom-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="nom-modal-head">
          <h2>✎ Editar abono</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          {error && <div className="nom-error">⚠ {error}</div>}
          <div className="nom-banner info" style={{ marginBottom: 12 }}>
            <span className="ico">ℹ️</span>
            <div className="ctnt" style={{ fontSize: 12 }}>
              Abono del {fmtDate(abono.fecha)} · método {abono.metodo}.
              {abono.mov_id ? ' Se ajustará el ingreso en caja.' : ' Sin movimiento de caja (fue descuento de nómina).'}
            </div>
          </div>
          <div className="nom-form-row">
            <div>
              <label className="nom-label">Monto del abono *</label>
              <input type="number" step="0.01" className="nom-input" value={monto} autoFocus
                onChange={e => setMonto(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="nom-form-row col1">
            <div>
              <label className="nom-label">Comentario</label>
              <input className="nom-input" value={comentario} onChange={e => setComentario(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="nom-btn nom-btn-primary" onClick={continuar}>Guardar cambios</button>
        </div>
      </div>
      {pedirPin && <ModalPinNom
        titulo="Confirmar edición de abono"
        mensaje={`Cambiar el abono a ${fmtNomMXN(Number(monto))} recalcula el saldo del préstamo.`}
        onConfirm={guardar}
        onClose={() => setPedirPin(false)} />}
    </div>
  );
}

// =====================================================
// SECCIÓN 6: HISTÓRICO
// =====================================================
function HistoricoSection() {
  const [periodos, setPeriodos] = useState([]);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    apiNom('/api/nomina/periodos?estado=CERRADO').then(r => setPeriodos(toArr(r))).catch(e => setError(e.message));
  }, []);

  return (
    <div>
      {error && <div className="nom-error">⚠ {error}</div>}
      <div className="nom-card">
        <div className="nom-card-title">📅 Periodos cerrados ({periodos.length})</div>
        {periodos.length === 0 ? <div className="nom-empty">No hay periodos cerrados aún</div> :
          <div className="nom-tablewrap">
            <table className="nom-table" style={{ minWidth: 'auto' }}>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Pago</th>
                  <th>Caja</th>
                  <th className="num">Empleados</th>
                  <th className="num">Total</th>
                  <th>Cerrado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map(p => (
                  <tr key={p.id}>
                    <td><strong>{fmtDate(p.fecha_inicio)} → {fmtDate(p.fecha_fin)}</strong></td>
                    <td>{fmtDate(p.fecha_pago)}</td>
                    <td>{p.caja_nombre}</td>
                    <td className="num">{p.empleados_pagados}</td>
                    <td className="num" style={{ color: 'var(--primary)', fontWeight: 800 }}>{fmtNomMXN(p.total_nomina)}</td>
                    <td style={{ fontSize: 11 }}>{p.cerrado_por || '—'}</td>
                    <td>
                      <button className="nom-btn nom-btn-sm nom-btn-ghost" onClick={() => setDetalle(p.id)}>👁 Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>
      {detalle && <ModalDetallePeriodo periodoId={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function ModalDetallePeriodo({ periodoId, onClose }) {
  const [p, setP] = useState(null);
  useEffect(() => { apiNom('/api/nomina/periodos/' + periodoId).then(setP); }, [periodoId]);
  if (!p) return null;
  return (
    <div className="nom-modal-bg" onClick={onClose}>
      <div className="nom-modal wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 1200 }}>
        <div className="nom-modal-head">
          <h2>📋 Detalle del periodo {fmtDate(p.fecha_inicio)} → {fmtDate(p.fecha_fin)}</h2>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="nom-modal-body">
          <div className="nom-tablewrap">
            <table className="nom-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Depto</th>
                  <th className="num">Neto</th>
                  <th className="num">Comisiones</th>
                  <th className="num">Abono préstamo</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.pagos.map(pg => (
                  <tr key={pg.id}>
                    <td><strong>{pg.empleado_nombre}</strong></td>
                    <td style={{ fontSize: 11 }}>{pg.departamento_nombre || '—'}</td>
                    <td className="num">{fmtNomMXN(pg.neto)}</td>
                    <td className="num">{fmtNomMXN(pg.comisiones)}</td>
                    <td className="num">{fmtNomMXN(pg.prestamos_abonados)}</td>
                    <td className="num" style={{ fontWeight: 800, color: 'var(--primary)' }}>{fmtNomMXN(pg.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="nom-modal-foot">
          <button className="nom-btn nom-btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

window.NominaView = NominaView;
