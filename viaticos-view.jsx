// =============================================================
// K-BOTANAS · viaticos-view.jsx v1.0
// 2026-05-12 · Módulo de Viáticos / Anticipos a empleados
// =============================================================

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const VIATICOS_VERSION = '1.0.0';

// ----------- Estilos -----------
(function injectViaticosStyles() {
  const oldIds = ['kb-viaticos-styles', 'kb-viaticos-styles-v1'];
  oldIds.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  const css = `
    .vi-wrap { padding: var(--pad); max-width: 1500px; margin: 0 auto; }
    .vi-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: var(--pad);
      padding-bottom: 14px; border-bottom: 2px solid var(--line);
    }
    .vi-title-block { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .vi-title-block h1 {
      font-family: var(--f-display); font-size: 28px; line-height: 1;
      color: var(--ink); margin: 0; letter-spacing: -.02em;
    }
    .vi-title-block .ver {
      font-family: var(--f-mono); font-size: 11px; font-weight: 600;
      color: var(--ink-soft); background: var(--bg-soft);
      padding: 4px 10px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
    }
    .vi-title-block .sub { font-size: 13px; color: var(--ink-soft); font-style: italic; }

    /* KPIs */
    .vi-kpis {
      display: grid; gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-bottom: var(--gap);
    }
    .vi-kpi {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: 14px 16px;
      box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
    }
    .vi-kpi::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0;
      width: 5px; background: var(--kc, var(--primary));
    }
    .vi-kpi .lbl {
      font-size: 10px; font-weight: 800; color: var(--ink-soft);
      text-transform: uppercase; letter-spacing: .7px;
      padding-left: 6px; margin-bottom: 5px;
    }
    .vi-kpi .val {
      font-family: var(--f-mono); font-size: 22px; font-weight: 800;
      color: var(--ink); padding-left: 6px;
      font-variant-numeric: tabular-nums; line-height: 1.1;
    }
    .vi-kpi .sub { font-size: 11px; color: var(--ink-soft); margin-top: 6px; padding-left: 6px; }
    .vi-kpi.abiertos { --kc: #F59E0B; }
    .vi-kpi.entregado { --kc: #EF4444; }
    .vi-kpi.comprobado { --kc: #10B981; }
    .vi-kpi.devuelto { --kc: #3B82F6; }

    /* Tabs */
    .vi-tabs {
      display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: var(--gap);
      border-bottom: 2px solid var(--line); padding: 0 2px;
    }
    .vi-tab {
      padding: 10px 18px; background: transparent; border: none;
      color: var(--ink-soft); font-weight: 700; font-size: 13px;
      cursor: pointer; border-bottom: 3px solid transparent;
      margin-bottom: -2px; text-transform: uppercase; letter-spacing: .5px;
      font-family: var(--f-body); display: inline-flex; align-items: center; gap: 6px;
    }
    .vi-tab:hover { color: var(--ink); }
    .vi-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
    .vi-tab .count {
      font-family: var(--f-mono); background: var(--bg-soft); color: var(--ink);
      padding: 1px 7px; border-radius: 10px; font-size: 10px;
      border: 1px solid var(--line);
    }
    .vi-tab.active .count { background: var(--primary); color: white; border-color: var(--primary); }

    /* Card */
    .vi-card {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: var(--pad);
      margin-bottom: var(--gap); box-shadow: var(--shadow-sm);
    }
    .vi-card-title {
      font-family: var(--f-display); font-size: 14px; color: var(--ink); margin: 0 0 14px;
      text-transform: uppercase; letter-spacing: .6px;
      padding-bottom: 10px; border-bottom: 1.5px solid var(--line);
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .vi-toolbar {
      display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin-bottom: var(--gap);
    }

    /* Buttons */
    .vi-btn {
      padding: 9px 16px; border-radius: var(--radius-sm); font-weight: 700;
      font-size: 13px; border: 2px solid var(--line-strong);
      cursor: pointer; transition: transform .08s, box-shadow .08s;
      display: inline-flex; align-items: center; gap: 6px; text-transform: uppercase;
      letter-spacing: .4px; font-family: var(--f-body); box-shadow: var(--shadow-sm);
    }
    .vi-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: var(--shadow-md); }
    .vi-btn:active:not(:disabled) { transform: translate(1px,1px); box-shadow: none; }
    .vi-btn:disabled { opacity: .5; cursor: not-allowed; }
    .vi-btn-primary { background: var(--primary); color: white; }
    .vi-btn-success { background: #10B981; color: white; border-color: #047857; }
    .vi-btn-ghost { background: var(--surface); color: var(--ink); }
    .vi-btn-danger { background: var(--surface); color: #EF4444; border-color: #EF4444; }
    .vi-btn-sm { padding: 5px 10px; font-size: 11px; box-shadow: none; border-width: 1.5px; }
    .vi-btn-sm:hover:not(:disabled) { transform: none; box-shadow: var(--shadow-sm); }

    /* Inputs */
    .vi-label {
      display: block; font-size: 11px; font-weight: 700; color: var(--ink-soft);
      margin: 0 0 5px; text-transform: uppercase; letter-spacing: .5px;
    }
    .vi-input, .vi-select, .vi-textarea {
      width: 100%; padding: 9px 12px; border: 2px solid var(--line);
      border-radius: var(--radius-sm); font-size: 14px;
      color: var(--ink); background: var(--surface); outline: none;
      font-family: var(--f-body); transition: border-color .15s, box-shadow .15s;
    }
    .vi-input:focus, .vi-select:focus, .vi-textarea:focus {
      border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
    }
    .vi-input.mono { font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-weight: 600; }
    .vi-textarea { min-height: 60px; resize: vertical; }

    /* Table */
    .vi-table-wrap { overflow-x: auto; border-radius: var(--radius-sm); }
    .vi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .vi-table th {
      text-align: left; padding: 9px 12px; background: var(--bg-soft);
      font-weight: 700; color: var(--ink); font-size: 10px;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--line-strong); white-space: nowrap;
    }
    .vi-table td {
      padding: 10px 12px; border-bottom: 1px solid var(--line); color: var(--ink);
      vertical-align: middle;
    }
    .vi-table tr:hover td { background: var(--surface-2); }
    .vi-table .num { text-align: right; font-family: var(--f-mono);
      font-variant-numeric: tabular-nums; font-weight: 600; }

    /* Badges */
    .vi-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; border: 1.5px solid;
    }
    .vi-badge-abierto   { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .vi-badge-comprobado { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .vi-badge-cancelado { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }
    .vi-badge-efectivo  { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .vi-badge-transferencia { background: #DBEAFE; color: #1E40AF; border-color: #93C5FD; }
    .vi-badge-tarjeta   { background: #E0E7FF; color: #3730A3; border-color: #A5B4FC; }

    /* Modal */
    .vi-modal-bg {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.5); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; overflow-y: auto;
    }
    .vi-modal {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); max-width: 800px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,.3);
    }
    .vi-modal-head {
      padding: 16px var(--pad); border-bottom: 2px solid var(--line);
      display: flex; justify-content: space-between; align-items: center;
      background: var(--bg-soft); position: sticky; top: 0; z-index: 2;
    }
    .vi-modal-head h2 {
      font-family: var(--f-display); font-size: 18px; margin: 0; color: var(--ink);
      text-transform: uppercase; letter-spacing: .5px;
    }
    .vi-modal-body { padding: var(--pad); }
    .vi-modal-foot {
      padding: 14px var(--pad); border-top: 2px solid var(--line);
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      background: var(--bg-soft); position: sticky; bottom: 0; flex-wrap: wrap;
    }

    .vi-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .vi-grid-2 { grid-template-columns: 1fr; } }

    /* Conceptos table en modal comprobar */
    .vi-conceptos {
      border: 2px solid var(--line-strong); border-radius: var(--radius-sm);
      overflow: hidden; margin-bottom: 14px;
    }
    .vi-conceptos table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .vi-conceptos th {
      background: var(--ink); color: var(--bg); padding: 7px 10px;
      font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
      font-weight: 800; text-align: left; border-right: 1px solid #444;
    }
    .vi-conceptos td {
      padding: 0; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line);
      background: var(--surface);
    }
    .vi-conceptos td input, .vi-conceptos td select {
      width: 100%; padding: 7px 8px; border: none; outline: none;
      background: transparent; font-size: 13px; color: var(--ink);
      font-family: var(--f-body);
    }
    .vi-conceptos td.num-cell input { text-align: right; font-family: var(--f-mono); font-weight: 600; }
    .vi-conceptos td input:focus, .vi-conceptos td select:focus {
      background: var(--primary-soft); box-shadow: inset 0 0 0 2px var(--primary);
    }
    .vi-conceptos .del-btn {
      padding: 5px 9px; border: none; background: transparent;
      color: #EF4444; cursor: pointer; font-size: 14px;
    }
    .vi-conceptos .del-btn:hover { background: #FEE2E2; }
    .vi-conceptos-foot {
      padding: 8px 12px; background: var(--bg-soft); display: flex;
      justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;
      border-top: 2px solid var(--line-strong); font-size: 12px;
    }

    .vi-summary {
      background: var(--bg-soft); border: 2px solid var(--line);
      border-radius: var(--radius-sm); padding: 12px 16px;
      margin-bottom: 14px; display: grid; gap: 8px;
      grid-template-columns: 1fr 1fr; font-size: 13px;
    }
    .vi-summary .row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; border-bottom: 1px dashed var(--line);
    }
    .vi-summary .row:last-child { border-bottom: none; }
    .vi-summary .row .lbl { color: var(--ink-soft); font-weight: 600; font-size: 11px; }
    .vi-summary .row .val { font-family: var(--f-mono); font-weight: 700; }
    .vi-summary .row.total .val { font-size: 16px; }
    .vi-summary .diff-pos { color: #10B981; }
    .vi-summary .diff-neg { color: #EF4444; }
    .vi-summary .diff-zero { color: var(--ink-soft); }

    .vi-error {
      background: #FEE2E2; color: #991B1B; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #FCA5A5;
      margin-bottom: 12px; font-size: 13px; font-weight: 600;
    }
    .vi-success {
      background: #DCFCE7; color: #166534; padding: 8px 14px;
      border-radius: var(--radius-sm); border: 2px solid #86EFAC;
      font-size: 13px; font-weight: 700;
    }
    .vi-empty {
      text-align: center; padding: 40px 20px; color: var(--ink-soft);
      font-style: italic; font-size: 14px;
    }
    .vi-loading { text-align: center; padding: 30px; color: var(--ink-soft); font-style: italic; }
  `;
  const style = document.createElement('style');
  style.id = 'kb-viaticos-styles-v1';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ----------- Utils -----------
const fmtMXN = (n) => '$' + Number(n || 0).toLocaleString('es-MX',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoyISO = () => {
  const d = new Date(); const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};
const fmtFecha = (iso) => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
const diasDesde = (iso) => {
  if (!iso) return 0;
  const d = new Date(iso + 'T12:00:00');
  return Math.floor((Date.now() - d) / 86400000);
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

const viatApi = {
  list: (params = {}) => apiFetch('/api/viaticos' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  get: (id) => apiFetch('/api/viaticos/' + id),
  stats: () => apiFetch('/api/viaticos/stats/abiertos'),
  create: (body) => apiFetch('/api/viaticos', { method: 'POST', body: JSON.stringify(body) }),
  comprobar: (id, body) => apiFetch('/api/viaticos/' + id + '/comprobar', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id) => apiFetch('/api/viaticos/' + id, { method: 'DELETE' }),
  categorias: () => apiFetch('/api/viaticos/categorias/gasto')
};

// ----------- Componente raíz -----------
function ViaticosView(props) {
  const cajas = ((props && props.cajas) || []).filter(c => !c.deleted && !c.archivada);
  const [tab, setTab] = useState('ABIERTOS');
  const [stats, setStats] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [showCrear, setShowCrear] = useState(false);
  const [showComprobar, setShowComprobar] = useState(null);
  const [showDetalle, setShowDetalle] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { estado: tab === 'ABIERTOS' ? 'ABIERTO' : tab === 'HISTORICO' ? 'TODOS' : tab };
      if (filtroDesde) params.desde = filtroDesde;
      if (filtroHasta) params.hasta = filtroHasta;
      if (filtroEmpleado) params.empleado = filtroEmpleado;
      const [l, s] = await Promise.all([viatApi.list(params), viatApi.stats()]);
      setList(Array.isArray(l) ? l : []);
      setStats(s);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [tab, filtroDesde, filtroHasta, filtroEmpleado]);
  useEffect(() => { cargar(); }, [cargar]);

  const onCreado = () => { setShowCrear(false); cargar(); window.kbotFullResync?.(); };
  const onComprobado = () => { setShowComprobar(null); cargar(); window.kbotFullResync?.(); };
  const onCancelado = async (id) => {
    if (!confirm('¿Cancelar este viático? Se revertirán todos los movimientos asociados.')) return;
    try {
      await viatApi.remove(id);
      cargar();
      window.kbotFullResync?.();
    } catch (e) { alert('Error: ' + e.message); }
  };

  return (
    <div className="vi-wrap">
      <div className="vi-header">
        <div className="vi-title-block">
          <h1>💼 VIÁTICOS</h1>
          <span className="ver">v{VIATICOS_VERSION}</span>
          <span className="sub">anticipos · comprobación · ajuste automático de caja</span>
        </div>
        <button className="vi-btn vi-btn-primary" onClick={() => setShowCrear(true)}>
          + Nuevo anticipo
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="vi-kpis">
          <div className="vi-kpi abiertos">
            <div className="lbl">💼 Anticipos abiertos</div>
            <div className="val">{stats.count}</div>
            <div className="sub">{stats.count === 0 ? 'todo comprobado' : 'pendientes de comprobar'}</div>
          </div>
          <div className="vi-kpi entregado">
            <div className="lbl">💸 Total entregado</div>
            <div className="val">{fmtMXN(stats.total_anticipos)}</div>
            <div className="sub">en viáticos abiertos</div>
          </div>
          <div className="vi-kpi devuelto">
            <div className="lbl">📋 Saldo pendiente</div>
            <div className="val">{fmtMXN(stats.saldo_pendiente)}</div>
            <div className="sub">monto sin comprobar</div>
          </div>
          {stats.mas_antiguo && (
            <div className="vi-kpi" style={{ '--kc': '#DC2626' }}>
              <div className="lbl">⏰ Más antiguo abierto</div>
              <div className="val" style={{ fontSize: 15, fontFamily: 'var(--f-body)', fontWeight: 700 }}>
                {fmtFecha(stats.mas_antiguo.fecha)}
              </div>
              <div className="sub">
                {stats.mas_antiguo.empleado_nombre} · {fmtMXN(stats.mas_antiguo.monto_anticipo)}
                {' · '}{diasDesde(stats.mas_antiguo.fecha)} días
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="vi-tabs">
        <button className={'vi-tab' + (tab === 'ABIERTOS' ? ' active' : '')} onClick={() => setTab('ABIERTOS')}>
          📋 Abiertos {stats && <span className="count">{stats.count}</span>}
        </button>
        <button className={'vi-tab' + (tab === 'COMPROBADO' ? ' active' : '')} onClick={() => setTab('COMPROBADO')}>
          ✅ Comprobados
        </button>
        <button className={'vi-tab' + (tab === 'HISTORICO' ? ' active' : '')} onClick={() => setTab('HISTORICO')}>
          📚 Histórico completo
        </button>
      </div>

      {/* Filtros (visibles en COMPROBADO y HISTORICO) */}
      {tab !== 'ABIERTOS' && (
        <div className="vi-toolbar">
          <div>
            <label className="vi-label">Desde</label>
            <input type="date" className="vi-input" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <label className="vi-label">Hasta</label>
            <input type="date" className="vi-input" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <label className="vi-label">Empleado</label>
            <input className="vi-input" placeholder="Buscar nombre..." value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} style={{ width: 200 }} />
          </div>
          {(filtroDesde || filtroHasta || filtroEmpleado) && (
            <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setFiltroEmpleado(''); }}>
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {error && <div className="vi-error">⚠ {error}</div>}

      {/* Lista */}
      <div className="vi-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="vi-loading">Cargando viáticos…</div> :
         list.length === 0 ? <div className="vi-empty">
           {tab === 'ABIERTOS' ? '✓ No hay anticipos abiertos. Todos los viáticos están comprobados.' : 'Sin viáticos en este rango.'}
         </div> :
         <div className="vi-table-wrap">
          <table className="vi-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Empleado</th>
                <th>Concepto</th>
                <th>Caja origen</th>
                <th>Método</th>
                <th className="num">Anticipo</th>
                <th className="num">Comprobado</th>
                <th className="num">Diferencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map(v => {
                const dias = diasDesde(v.fecha);
                const isAbierto = v.estado === 'ABIERTO';
                const diff = Number(v.diferencia) || 0;
                const diffColor = !isAbierto ? (diff > 0.01 ? '#10B981' : diff < -0.01 ? '#EF4444' : 'var(--ink-soft)') : 'var(--ink-soft)';
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{fmtFecha(v.fecha)}</strong>
                      {isAbierto && dias > 0 && (
                        <div style={{ fontSize: 10, color: dias > 5 ? '#EF4444' : 'var(--ink-soft)', marginTop: 2 }}>
                          hace {dias} día{dias === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td><strong>{v.empleado_nombre}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.concepto}>
                      {v.concepto || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{v.caja_origen_nombre || '—'}</td>
                    <td><span className={'vi-badge vi-badge-' + (v.metodo || 'efectivo').toLowerCase()}>{v.metodo}</span></td>
                    <td className="num"><strong>{fmtMXN(v.monto_anticipo)}</strong></td>
                    <td className="num">{isAbierto ? '—' : fmtMXN(v.monto_comprobado)}</td>
                    <td className="num" style={{ color: diffColor, fontWeight: 700 }}>
                      {isAbierto ? '—' : (diff > 0.01 ? '+' + fmtMXN(diff) : fmtMXN(diff))}
                      {!isAbierto && Math.abs(diff) < 0.01 && '✓'}
                    </td>
                    <td><span className={'vi-badge vi-badge-' + v.estado.toLowerCase()}>{v.estado}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isAbierto ? (
                        <React.Fragment>
                          <button className="vi-btn vi-btn-success vi-btn-sm" onClick={() => setShowComprobar(v)} title="Comprobar viático">
                            📋 Comprobar
                          </button>
                          <button className="vi-btn vi-btn-danger vi-btn-sm" onClick={() => onCancelado(v.id)} style={{ marginLeft: 4 }} title="Cancelar">
                            ✕
                          </button>
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={() => setShowDetalle(v.id)} title="Ver detalle">
                            👁 Ver
                          </button>
                          <button className="vi-btn vi-btn-danger vi-btn-sm" onClick={() => onCancelado(v.id)} style={{ marginLeft: 4 }} title="Revertir y eliminar">
                            🗑
                          </button>
                        </React.Fragment>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
         </div>}
      </div>

      {showCrear && <ModalCrear cajas={cajas} onClose={() => setShowCrear(false)} onSaved={onCreado} />}
      {showComprobar && <ModalComprobar viatico={showComprobar} cajas={cajas} onClose={() => setShowComprobar(null)} onSaved={onComprobado} />}
      {showDetalle && <ModalDetalle viaticoId={showDetalle} onClose={() => setShowDetalle(null)} />}
    </div>
  );
}

// === MODAL CREAR ===
function ModalCrear({ cajas, onClose, onSaved }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [empleado, setEmpleado] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [cajaId, setCajaId] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sugerir caja efectivo por default
  useEffect(() => {
    if (cajas.length && !cajaId) {
      const e = cajas.find(c => c.tipo === 'EFECTIVO') || cajas[0];
      setCajaId(e.id);
    }
  }, [cajas, cajaId]);

  // Cuando cambia caja, sugerir método según tipo
  const onCajaChange = (id) => {
    setCajaId(id);
    const c = cajas.find(x => x.id === id);
    if (c) {
      if (c.tipo === 'EFECTIVO') setMetodo('EFECTIVO');
      else if (c.tipo === 'BANCO') setMetodo('TRANSFERENCIA');
      else if (c.tipo === 'TARJETA') setMetodo('TARJETA');
    }
  };

  const guardar = async () => {
    setError('');
    const m = parseFloat(monto);
    if (!empleado.trim()) { setError('Empleado requerido'); return; }
    if (!(m > 0)) { setError('Monto inválido'); return; }
    if (!cajaId) { setError('Selecciona la caja'); return; }
    setSaving(true);
    try {
      await viatApi.create({
        fecha, empleado_nombre: empleado.trim().toUpperCase(),
        concepto: concepto.trim() || null,
        monto_anticipo: m, metodo, caja_origen: cajaId,
        comentario: comentario.trim() || null
      });
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="vi-modal-bg" onClick={onClose}>
      <div className="vi-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="vi-modal-head">
          <h2>💼 Nuevo anticipo de viático</h2>
          <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="vi-modal-body">
          {error && <div className="vi-error">⚠ {error}</div>}
          <div className="vi-grid-2">
            <div>
              <label className="vi-label">Fecha</label>
              <input type="date" className="vi-input" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="vi-label">Método</label>
              <select className="vi-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="TARJETA">TARJETA</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="vi-label">Empleado / Receptor *</label>
            <input className="vi-input" autoFocus placeholder="Ej. JUAN PEREZ"
              value={empleado} onChange={e => setEmpleado(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') document.getElementById('vi-monto-input')?.focus(); }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="vi-label">Concepto / Destino</label>
            <input className="vi-input" placeholder="Ej. VIATICOS RUTA 3 - PACHUCA"
              value={concepto} onChange={e => setConcepto(e.target.value)} />
          </div>
          <div className="vi-grid-2" style={{ marginTop: 10 }}>
            <div>
              <label className="vi-label">Monto anticipo *</label>
              <input id="vi-monto-input" type="number" step="0.01" min="0" className="vi-input mono"
                placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)}
                style={{ fontSize: 18 }} />
            </div>
            <div>
              <label className="vi-label">Caja origen *</label>
              <select className="vi-select" value={cajaId} onChange={e => onCajaChange(e.target.value)}>
                <option value="">— Selecciona —</option>
                {cajas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon || (c.tipo === 'EFECTIVO' ? '💵' : c.tipo === 'BANCO' ? '🏦' : '💳')} {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="vi-label">Comentario (opcional)</label>
            <textarea className="vi-textarea" placeholder="Notas adicionales..."
              value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>
          <div style={{ marginTop: 12, padding: 10, background: '#FEF3C7', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#92400E', border: '1.5px solid #FCD34D' }}>
            ℹ️ Al guardar, se generará un movimiento de salida de la caja seleccionada por <strong>{monto ? fmtMXN(monto) : '$0.00'}</strong> con categoría <strong>ANTICIPOS VIATICOS</strong>. Cuando el empleado comprobé los gastos, este movimiento se ajustará automáticamente.
          </div>
        </div>
        <div className="vi-modal-foot">
          <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>* Campos requeridos</span>
          <div>
            <button className="vi-btn vi-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="vi-btn vi-btn-primary" onClick={guardar} disabled={saving} style={{ marginLeft: 8 }}>
              {saving ? 'Guardando…' : '+ Entregar anticipo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// === MODAL COMPROBAR ===
function ModalComprobar({ viatico, cajas, onClose, onSaved }) {
  const [fechaComp, setFechaComp] = useState(hoyISO());
  const [cajaAjuste, setCajaAjuste] = useState(viatico.caja_origen);
  const [comentario, setComentario] = useState('');
  const [conceptos, setConceptos] = useState([
    { categoria: '', concepto: '', monto: '' }
  ]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    viatApi.categorias().then(c => {
      setCategorias(Array.isArray(c) ? c : []);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const onChangeConcepto = (idx, field, value) => {
    setConceptos(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };
  const addConcepto = () => setConceptos(prev => [...prev, { categoria: '', concepto: '', monto: '' }]);
  const delConcepto = (idx) => setConceptos(prev => prev.filter((_, i) => i !== idx));

  const totalComprobado = useMemo(
    () => conceptos.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0),
    [conceptos]
  );
  const diferencia = viatico.monto_anticipo - totalComprobado;
  const diffClass = diferencia > 0.01 ? 'diff-pos' : diferencia < -0.01 ? 'diff-neg' : 'diff-zero';

  const guardar = async () => {
    setError('');
    const filtrados = conceptos.filter(c => c.categoria && parseFloat(c.monto) > 0);
    if (filtrados.length === 0) { setError('Agrega al menos un concepto válido (categoría + monto)'); return; }
    setSaving(true);
    try {
      await viatApi.comprobar(viatico.id, {
        fecha_comprobacion: fechaComp,
        caja_ajuste: cajaAjuste,
        conceptos: filtrados.map(c => ({
          categoria: c.categoria,
          concepto: c.concepto || c.categoria,
          monto: parseFloat(c.monto)
        })),
        comentario: comentario.trim() || null
      });
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="vi-modal-bg" onClick={onClose}>
      <div className="vi-modal" onClick={e => e.stopPropagation()}>
        <div className="vi-modal-head">
          <h2>📋 Comprobar viático · {viatico.empleado_nombre}</h2>
          <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="vi-modal-body">
          {error && <div className="vi-error">⚠ {error}</div>}

          <div className="vi-summary">
            <div className="row">
              <span className="lbl">Fecha entrega</span>
              <span className="val">{fmtFecha(viatico.fecha)}</span>
            </div>
            <div className="row">
              <span className="lbl">Concepto</span>
              <span className="val" style={{ fontFamily: 'var(--f-body)', fontWeight: 600, fontSize: 12 }}>
                {viatico.concepto || '—'}
              </span>
            </div>
            <div className="row">
              <span className="lbl">Caja origen</span>
              <span className="val" style={{ fontFamily: 'var(--f-body)', fontWeight: 600, fontSize: 12 }}>
                {viatico.caja_origen_nombre}
              </span>
            </div>
            <div className="row total">
              <span className="lbl">Anticipo entregado</span>
              <span className="val" style={{ color: '#EF4444' }}>{fmtMXN(viatico.monto_anticipo)}</span>
            </div>
          </div>

          <div className="vi-grid-2">
            <div>
              <label className="vi-label">Fecha comprobación</label>
              <input type="date" className="vi-input" value={fechaComp} onChange={e => setFechaComp(e.target.value)} />
            </div>
            <div>
              <label className="vi-label">Caja de ajuste (devolución / faltante)</label>
              <select className="vi-select" value={cajaAjuste} onChange={e => setCajaAjuste(e.target.value)}>
                {cajas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon || (c.tipo === 'EFECTIVO' ? '💵' : '🏦')} {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label className="vi-label">Conceptos comprobados</label>
            <div className="vi-conceptos">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Categoría *</th>
                    <th>Detalle</th>
                    <th style={{ width: 120 }}>Monto *</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {conceptos.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <select value={c.categoria} onChange={e => onChangeConcepto(i, 'categoria', e.target.value)}>
                          <option value="">— Selecciona —</option>
                          {categorias.map(cat => (
                            <option key={cat.id} value={cat.nombre}>
                              {cat.icon} {cat.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td><input value={c.concepto} placeholder="Detalle (opcional)..."
                        onChange={e => onChangeConcepto(i, 'concepto', e.target.value)} /></td>
                      <td className="num-cell">
                        <input type="number" step="0.01" min="0" value={c.monto} placeholder="0.00"
                          onChange={e => onChangeConcepto(i, 'monto', e.target.value)} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="del-btn" onClick={() => delConcepto(i)} disabled={conceptos.length === 1} title="Eliminar fila">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="vi-conceptos-foot">
                <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={addConcepto}>+ Agregar concepto</button>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontFamily: 'var(--f-mono)' }}>
                  <span>Total comprobado: <strong>{fmtMXN(totalComprobado)}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Resumen + diferencia */}
          <div style={{
            padding: 14, borderRadius: 'var(--radius-sm)',
            background: diferencia > 0.01 ? '#DCFCE7' : diferencia < -0.01 ? '#FEE2E2' : '#F3F4F6',
            border: '2px solid ' + (diferencia > 0.01 ? '#86EFAC' : diferencia < -0.01 ? '#FCA5A5' : '#D1D5DB'),
            marginBottom: 12,
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center'
          }}>
            <div style={{ fontSize: 24 }}>
              {diferencia > 0.01 ? '↩️' : diferencia < -0.01 ? '⚠️' : '✓'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4,
                color: diferencia > 0.01 ? '#166534' : diferencia < -0.01 ? '#991B1B' : 'var(--ink)' }}>
                {diferencia > 0.01 ? `SOBRA ${fmtMXN(diferencia)}` :
                 diferencia < -0.01 ? `FALTA ${fmtMXN(Math.abs(diferencia))}` :
                 'CUADRADO PERFECTO'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                {diferencia > 0.01 ? 'Se generará un ingreso de devolución en la caja de ajuste.' :
                 diferencia < -0.01 ? 'Se generará un gasto adicional desde la caja de ajuste para cubrir el faltante.' :
                 'No se genera movimiento adicional. Conceptos = Anticipo exacto.'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Diferencia</div>
              <div className="mono" style={{ fontFamily: 'var(--f-mono)', fontSize: 20, fontWeight: 800,
                color: diferencia > 0.01 ? '#166534' : diferencia < -0.01 ? '#991B1B' : 'var(--ink)' }}>
                {diferencia > 0.01 ? '+' : ''}{fmtMXN(diferencia)}
              </div>
            </div>
          </div>

          <div>
            <label className="vi-label">Comentario de la comprobación (opcional)</label>
            <textarea className="vi-textarea" placeholder="Notas sobre la comprobación..."
              value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>
        </div>
        <div className="vi-modal-foot">
          <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>* Categoría y monto requeridos</span>
          <div>
            <button className="vi-btn vi-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="vi-btn vi-btn-success" onClick={guardar} disabled={saving} style={{ marginLeft: 8 }}>
              {saving ? 'Comprobando…' : '✓ Cerrar y comprobar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// === MODAL DETALLE (solo lectura) ===
function ModalDetalle({ viaticoId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    viatApi.get(viaticoId).then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [viaticoId]);

  return (
    <div className="vi-modal-bg" onClick={onClose}>
      <div className="vi-modal" onClick={e => e.stopPropagation()}>
        <div className="vi-modal-head">
          <h2>👁 Detalle de viático {data ? '· ' + data.empleado_nombre : ''}</h2>
          <button className="vi-btn vi-btn-ghost vi-btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="vi-modal-body">
          {loading ? <div className="vi-loading">Cargando…</div> :
           error ? <div className="vi-error">⚠ {error}</div> :
           data && (
            <React.Fragment>
              <div className="vi-summary">
                <div className="row"><span className="lbl">Fecha entrega</span><span className="val">{fmtFecha(data.fecha)}</span></div>
                <div className="row"><span className="lbl">Fecha comprobación</span><span className="val">{data.fecha_comprobacion ? fmtFecha(data.fecha_comprobacion) : '—'}</span></div>
                <div className="row"><span className="lbl">Estado</span><span className="val"><span className={'vi-badge vi-badge-' + data.estado.toLowerCase()}>{data.estado}</span></span></div>
                <div className="row"><span className="lbl">Método</span><span className="val"><span className={'vi-badge vi-badge-' + data.metodo.toLowerCase()}>{data.metodo}</span></span></div>
                <div className="row"><span className="lbl">Caja origen</span><span className="val" style={{ fontFamily: 'var(--f-body)', fontSize: 12 }}>{data.caja_origen_nombre}</span></div>
                <div className="row"><span className="lbl">Caja ajuste</span><span className="val" style={{ fontFamily: 'var(--f-body)', fontSize: 12 }}>{data.caja_ajuste_nombre || '—'}</span></div>
                <div className="row total"><span className="lbl">Anticipo</span><span className="val" style={{ color: '#EF4444' }}>{fmtMXN(data.monto_anticipo)}</span></div>
                <div className="row total"><span className="lbl">Comprobado</span><span className="val" style={{ color: '#10B981' }}>{fmtMXN(data.monto_comprobado)}</span></div>
              </div>

              {data.diferencia !== 0 && Math.abs(data.diferencia) > 0.01 && (
                <div style={{
                  padding: 10, borderRadius: 'var(--radius-sm)',
                  background: data.diferencia > 0 ? '#DCFCE7' : '#FEE2E2',
                  border: '2px solid ' + (data.diferencia > 0 ? '#86EFAC' : '#FCA5A5'),
                  marginBottom: 12, textAlign: 'center',
                  color: data.diferencia > 0 ? '#166534' : '#991B1B'
                }}>
                  <strong>{data.diferencia > 0 ? `↩️ DEVOLUCIÓN: ${fmtMXN(data.diferencia)}` : `⚠️ FALTANTE PAGADO: ${fmtMXN(Math.abs(data.diferencia))}`}</strong>
                </div>
              )}

              {data.concepto && (
                <div style={{ padding: 10, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Concepto / destino</div>
                  {data.concepto}
                </div>
              )}

              <div className="vi-conceptos">
                <table>
                  <thead>
                    <tr><th>Categoría</th><th>Detalle</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
                  </thead>
                  <tbody>
                    {(data.conceptos || []).length === 0 ?
                      <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: 'var(--ink-soft)', fontStyle: 'italic' }}>Sin conceptos aún.</td></tr> :
                      data.conceptos.map(c => (
                        <tr key={c.id}>
                          <td style={{ padding: '7px 10px' }}><strong>{c.categoria}</strong></td>
                          <td style={{ padding: '7px 10px' }}>{c.concepto || '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--f-mono)', fontWeight: 700 }}>{fmtMXN(c.monto)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {data.comentario && (
                <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--ink-soft)' }}>
                  <strong>Comentario:</strong> {data.comentario}
                </div>
              )}
            </React.Fragment>
           )}
        </div>
        <div className="vi-modal-foot">
          <div></div>
          <button className="vi-btn vi-btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

window.ViaticosView = ViaticosView;
