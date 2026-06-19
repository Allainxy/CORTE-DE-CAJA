// compras-view.jsx — Módulo de Compras K-BOTANAS v1.8.2
// Pestañas: ÓRDENES | PROVEEDORES
// - Órdenes con multi-select + exportar PDF
// - Proveedores con catálogo de productos
// - Al crear orden: precarga productos del proveedor con últimos precios

const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));

const ComprasView = ({ cajas = [], cats = [], user, refreshAll }) => {
  const [tab, setTab] = useState('ordenes');

  return (
    <div className="view compras-view">
      <style>{`
        /* Estilos globales para modales del módulo compras — asegurar contraste */
        .compras-view .modal-backdrop,
        .compras-modal-backdrop {
          background: rgba(0, 0, 0, 0.65) !important;
          backdrop-filter: blur(2px) !important;
          position: fixed !important;
          inset: 0 !important;
          z-index: 1000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 20px !important;
        }
        .compras-modal {
          background: #FFFFFF !important;
          color: #1F2937 !important;
          border-radius: 10px !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
          max-height: 95vh !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        .compras-modal header {
          background: #F9FAFB !important;
          color: #111827 !important;
          border-bottom: 1px solid #E5E7EB !important;
        }
        .compras-modal header h3 { color: #111827 !important; }
        .compras-modal header .view-eyebrow,
        .compras-modal header > div:first-child > div:first-child {
          color: #6B7280 !important;
        }
        .compras-modal > div {
          background: #FFFFFF !important;
          color: #1F2937 !important;
        }
        .compras-modal footer {
          background: #F9FAFB !important;
          border-top: 1px solid #E5E7EB !important;
        }
        .compras-modal .field-label,
        .compras-modal .field-label span,
        .compras-modal label {
          color: #374151 !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          letter-spacing: 0.08em !important;
        }
        .compras-modal .text-input,
        .compras-modal input[type=text],
        .compras-modal input[type=number],
        .compras-modal input[type=tel],
        .compras-modal input[type=date],
        .compras-modal select,
        .compras-modal textarea {
          background: #FFFFFF !important;
          color: #111827 !important;
          border: 1px solid #D1D5DB !important;
          border-radius: 6px !important;
          padding: 8px 10px !important;
          font-size: 13px !important;
        }
        .compras-modal .text-input:focus,
        .compras-modal input:focus,
        .compras-modal select:focus,
        .compras-modal textarea:focus {
          outline: none !important;
          border-color: #E63946 !important;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.15) !important;
        }
        .compras-modal .text-input::placeholder,
        .compras-modal input::placeholder,
        .compras-modal textarea::placeholder {
          color: #9CA3AF !important;
        }
        .compras-modal .text-input:disabled,
        .compras-modal input:disabled {
          background: #F3F4F6 !important;
          color: #6B7280 !important;
        }
        .compras-modal .btn-ghost {
          background: #FFFFFF !important;
          color: #374151 !important;
          border: 1px solid #D1D5DB !important;
          border-radius: 6px !important;
          padding: 8px 14px !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
        }
        .compras-modal .btn-ghost:hover { background: #F3F4F6 !important; }
        .compras-modal .btn-primary {
          background: #E63946 !important;
          color: #FFFFFF !important;
          border: none !important;
          border-radius: 6px !important;
          padding: 8px 14px !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          cursor: pointer !important;
        }
        .compras-modal .btn-primary:disabled {
          background: #9CA3AF !important;
          cursor: not-allowed !important;
        }
        .compras-modal .seg {
          background: #F3F4F6 !important;
          border-radius: 6px !important;
          padding: 3px !important;
          display: inline-flex !important;
          gap: 2px !important;
        }
        .compras-modal .seg button {
          background: transparent !important;
          color: #6B7280 !important;
          border: none !important;
          padding: 6px 12px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          border-radius: 4px !important;
          cursor: pointer !important;
        }
        .compras-modal .seg button.active {
          background: #FFFFFF !important;
          color: #111827 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
        }
        .compras-modal table { color: #1F2937 !important; }
        .compras-modal table th { color: #374151 !important; background: #F3F4F6 !important; }
        .compras-modal table td { color: #1F2937 !important; }
      `}</style>

      <header className="view-head">
        <div>
          <div className="view-eyebrow">CONTROL DE COMPRAS</div>
          <h2 className="view-title">COMPRAS</h2>
        </div>
      </header>

      <div className="seg" style={{ marginBottom: 20 }}>
        <button className={tab === 'ordenes' ? 'active' : ''} onClick={() => setTab('ordenes')}>
          📦 ÓRDENES
        </button>
        <button className={tab === 'proveedores' ? 'active' : ''} onClick={() => setTab('proveedores')}>
          🏭 PROVEEDORES
        </button>
      </div>

      {tab === 'ordenes' && <OrdenesPanel cajas={cajas} cats={cats} user={user} refreshAll={refreshAll} />}
      {tab === 'proveedores' && <ProveedoresPanel cajas={cajas} cats={cats} user={user} refreshAll={refreshAll} />}
    </div>
  );
};

// ===========================================================
// PANEL ÓRDENES (lista, filtros, KPIs, multi-select, PDF)
// ===========================================================
function OrdenesPanel({ cajas, cats, user, refreshAll }) {
  const [ordenes, setOrdenes] = useState([]);
  const [stats, setStats] = useState({
    hoy: { total: 0, entregado: 0, real: 0 },
    mes: { total: 0, real: 0 },
    pendientes_pago: { count: 0, total: 0 },
    borradores: 0
  });
  const [filtroEstado, setFiltroEstado] = useState('TODAS');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [verOrden, setVerOrden] = useState(null);
  const [crearOrden, setCrearOrden] = useState(false);
  const [editarOrden, setEditarOrden] = useState(null);
  const [cerrarOrden, setCerrarOrden] = useState(null);
  const [pagoBorradorOrden, setPagoBorradorOrden] = useState(null);
  const [pagarOrden, setPagarOrden] = useState(null);
  const [terceros, setTerceros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());
  const [verPDF, setVerPDF] = useState(null);

  const apiUrl = () => (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');

  const cargar = async () => {
    if (!KBotAPI.enabled() || !KBotAPI.token()) return;
    setLoading(true);
    try {
      const tok = KBotAPI.token();
      const params = new URLSearchParams();
      if (filtroEstado !== 'TODAS') params.set('estado', filtroEstado);
      if (filtroDesde) params.set('fecha_desde', filtroDesde);
      if (filtroHasta) params.set('fecha_hasta', filtroHasta);
      const r = await fetch(apiUrl() + '/api/ordenes?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (r.ok) {
        const d = await r.json();
        setOrdenes(d.ordenes || []);
      }
      const rs = await fetch(apiUrl() + '/api/ordenes/stats/resumen', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (rs.ok) {
        const ds = await rs.json();
        setStats(ds);
      }
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  const cargarTerceros = async () => {
    if (!KBotAPI.enabled() || !KBotAPI.token()) return;
    try {
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl() + '/api/terceros?tipo=PROVEEDOR', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (r.ok) {
        const d = await r.json();
        setTerceros(d.terceros || []);
      }
    } catch (e) { console.warn(e); }
  };

  useEffect(() => { cargar(); }, [filtroEstado, filtroDesde, filtroHasta]);
  useEffect(() => { cargarTerceros(); }, []);

  const onCambio = async () => {
    await new Promise(r => setTimeout(r, 300));
    if (window.kbotFullResync) await window.kbotFullResync();
    cargar();
    cargarTerceros();
    setSeleccion(new Set());
    if (refreshAll) refreshAll();
  };

  const eliminarOrden = async (orden) => {
    const msg = `¿Eliminar la orden de ${orden.proveedor_nombre}?\n\n` +
      `Estado: ${orden.estado}\n` +
      `Monto: ${fmtMXN(orden.monto_real || orden.monto_estimado)}\n\n` +
      (orden.cxp_id ? '⚠️ También se eliminará la CxP vinculada.\n' : '') +
      '⚠️ Se revertirán los movimientos en caja.\n\nEsta acción es permanente.';
    if (!confirm(msg)) return;
    const pin = prompt('Ingresa tu PIN de 4 dígitos para eliminar:');
    if (!pin) return;
    try {
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl() + '/api/ordenes/' + orden.id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + tok, 'X-PIN': pin }
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      alert(`✅ Orden eliminada${d.movs_revertidos > 0 ? `\n${d.movs_revertidos} movs revertidos.` : ''}${d.cxp_borrada ? '\nCxP vinculada eliminada.' : ''}`);
      onCambio();
    } catch (e) { alert('⚠️ ' + e.message); }
  };

  const toggleSeleccion = (id) => {
    const nuevo = new Set(seleccion);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    setSeleccion(nuevo);
  };
  const seleccionarTodas = () => {
    if (seleccion.size === ordenes.length) setSeleccion(new Set());
    else setSeleccion(new Set(ordenes.map(o => o.id)));
  };
  const exportarPDF = () => {
    if (seleccion.size === 0) { alert('Selecciona al menos una orden'); return; }
    const ordenesSeleccionadas = ordenes.filter(o => seleccion.has(o.id));
    setVerPDF(ordenesSeleccionadas);
  };

  const exportarExcel = (ordenesParam) => {
    const ordenesExp = ordenesParam || ordenes.filter(o => seleccion.has(o.id));
    if (!ordenesExp || ordenesExp.length === 0) { alert('Selecciona al menos una orden'); return; }
    if (typeof XLSX === 'undefined') {
      alert('⚠️ La librería Excel aún no carga. Recarga la página (Ctrl+Shift+R) e inténtalo de nuevo.');
      return;
    }
    generarExcelOrdenes(ordenesExp);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 600, letterSpacing: '0.1em' }}>ÓRDENES DE COMPRA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seleccion.size > 0 && (
            <>
              <button className="btn-ghost" onClick={exportarPDF} style={{ background: '#FEF3C7', color: '#92400E' }}>
                📄 PDF ({seleccion.size})
              </button>
              <button className="btn-ghost" onClick={() => exportarExcel()} style={{ background: '#D1FAE5', color: '#065F46' }}>
                📊 EXCEL ({seleccion.size})
              </button>
            </>
          )}
          <button className="btn-primary" onClick={() => setCrearOrden(true)}>
            + NUEVA ORDEN
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <BotanaCard className="kpi-card">
          <div className="kpi-label">📝 BORRADORES</div>
          <div className="kpi-val" style={{ color: '#6B7280' }}>{stats.borradores}</div>
          <div className="kpi-sub">Sin cerrar todavía</div>
        </BotanaCard>
        <BotanaCard className="kpi-card">
          <div className="kpi-label">💰 PENDIENTE PAGO</div>
          <div className="kpi-val" style={{ color: '#F59E0B' }}>{stats.pendientes_pago.count}</div>
          <div className="kpi-sub">{fmtMXN(stats.pendientes_pago.total)} por pagar</div>
        </BotanaCard>
        <BotanaCard className="kpi-card">
          <div className="kpi-label">📅 HOY</div>
          <div className="kpi-val">{stats.hoy.total}</div>
          <div className="kpi-sub">{fmtMXN(stats.hoy.real || stats.hoy.entregado)} hoy</div>
        </BotanaCard>
        <BotanaCard className="kpi-card">
          <div className="kpi-label">📊 MES EN CURSO</div>
          <div className="kpi-val">{stats.mes.total}</div>
          <div className="kpi-sub">{fmtMXN(stats.mes.real)} en compras</div>
        </BotanaCard>
      </div>

      <BotanaCard className="filter-bar">
        <div className="filter-row">
          <div className="seg">
            {['TODAS', 'BORRADOR', 'PENDIENTE_PAGO', 'PAGADA', 'CANCELADA'].map(e => (
              <button key={e} className={filtroEstado === e ? 'active' : ''} onClick={() => setFiltroEstado(e)}>
                {e === 'PENDIENTE_PAGO' ? 'POR PAGAR' : e}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label>DESDE <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} /></label>
            <label>HASTA <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} /></label>
          </div>
          <button className="btn-ghost" onClick={() => { setFiltroEstado('TODAS'); setFiltroDesde(''); setFiltroHasta(''); }}>LIMPIAR</button>
        </div>
      </BotanaCard>

      <BotanaCard>
        {ordenes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 10, background: 'var(--surface-2, #f5f5f5)', borderRadius: 6, fontSize: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={seleccion.size === ordenes.length && ordenes.length > 0}
                onChange={seleccionarTodas}
              />
              <span style={{ fontWeight: 600 }}>
                {seleccion.size === 0 ? 'Seleccionar todas' :
                 seleccion.size === ordenes.length ? `Todas seleccionadas (${seleccion.size})` :
                 `${seleccion.size} seleccionadas`}
              </span>
            </label>
            {seleccion.size > 0 && (
              <button onClick={() => setSeleccion(new Set())} className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>
                Limpiar selección
              </button>
            )}
          </div>
        )}
        {loading && <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Cargando órdenes...</div>}
        {!loading && ordenes.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>NO HAY ÓRDENES</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Crea tu primera orden con "+ NUEVA ORDEN"</div>
          </div>
        )}
        {ordenes.map(o => {
          const estados = {
            'BORRADOR': { color: '#6B7280', icon: '📝', label: 'BORRADOR' },
            'PENDIENTE_PAGO': { color: '#F59E0B', icon: '💰', label: 'POR PAGAR' },
            'PAGADA': { color: '#10B981', icon: '✅', label: 'PAGADA' },
            'CANCELADA': { color: '#9CA3AF', icon: '✖', label: 'CANCELADA' }
          };
          const est = estados[o.estado] || estados['BORRADOR'];
          const montoMostrar = o.estado === 'BORRADOR' ? o.monto_estimado : o.monto_real;
          const saldoPendiente = (o.monto_real || 0) - (o.monto_entregado || 0);
          const sel = seleccion.has(o.id);
          return (
            <div key={o.id} style={{
              borderLeft: `4px solid ${est.color}`, padding: 14, marginBottom: 10,
              background: sel ? '#FEF3C7' : 'var(--surface)', borderRadius: 6,
              transition: 'background 0.15s'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleSeleccion(o.id)}
                  style={{ marginTop: 4, width: 16, height: 16, cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 250px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ background: est.color + '22', color: est.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                          {est.icon} {est.label}
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>{fmtDate(o.fecha)}</span>
                        {o.metodo_pago === 'TRANSFERENCIA' && (
                          <span style={{ background: '#9CA3AF22', color: '#6B7280', padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                            🏦 TRANSF
                          </span>
                        )}
                        {o.monto_entregado > 0 && (
                          <span style={{ background: '#3B82F622', color: '#1D4ED8', padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                            ANTICIPO {fmtMXN(o.monto_entregado)}
                          </span>
                        )}
                        {o.cxp_id && (
                          <span style={{ background: '#FFD16622', color: '#92400E', padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                            CxP
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{o.proveedor_nombre}</div>
                      {o.comprador_nombre && <div style={{ fontSize: 12, opacity: 0.7 }}>👤 {o.comprador_nombre}</div>}
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                        {(o.items || []).length} producto{(o.items || []).length !== 1 ? 's' : ''} · {o.caja_nombre}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {o.estado === 'BORRADOR' ? 'ESTIMADO' : o.estado === 'PENDIENTE_PAGO' ? 'TOTAL REAL' : o.estado === 'PAGADA' ? 'PAGADO' : 'CANCELADA'}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--f-mono)' }}>
                        {fmtMXN(montoMostrar)}
                      </div>
                      {o.estado === 'PENDIENTE_PAGO' && saldoPendiente > 0.01 && (
                        <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>
                          Falta: {fmtMXN(saldoPendiente)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="btn-ghost" onClick={() => setVerOrden(o)} style={{ fontSize: 11, padding: '6px 12px' }}>
                      VER DETALLE
                    </button>
                    <button className="btn-ghost" onClick={() => setVerPDF([o])} style={{ fontSize: 11, padding: '6px 12px' }}>
                      📄 PDF
                    </button>
                    <button className="btn-ghost" onClick={() => exportarExcel([o])} style={{ fontSize: 11, padding: '6px 12px', background: '#D1FAE5', color: '#065F46' }}>
                      📊 EXCEL
                    </button>
                    {o.estado === 'BORRADOR' && (
                      <>
                        <button className="btn-ghost" onClick={() => setEditarOrden(o)} style={{ fontSize: 11, padding: '6px 12px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                          ✏️ EDITAR
                        </button>
                        <button className="btn-ghost" onClick={() => setPagoBorradorOrden(o)} style={{ fontSize: 11, padding: '6px 12px', background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' }}>
                          💰 PAGO
                        </button>
                        <button className="btn-primary" onClick={() => setCerrarOrden(o)} style={{ fontSize: 11, padding: '6px 12px' }}>
                          CERRAR CON PRECIOS REALES
                        </button>
                      </>
                    )}
                    {o.estado === 'PENDIENTE_PAGO' && (
                      <button className="btn-primary" onClick={() => setPagarOrden(o)} style={{ fontSize: 11, padding: '6px 12px' }}>
                        💰 REGISTRAR PAGO
                      </button>
                    )}
                    {(user?.rol === 'admin' || user?.rol === 'gerente') && (
                      <button className="btn-ghost" onClick={() => eliminarOrden(o)} style={{ fontSize: 11, padding: '6px 12px', color: 'var(--red, #E63946)' }}>
                        🗑 ELIMINAR
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </BotanaCard>

      {crearOrden && (
        <CrearOrdenModal
          cajas={cajas} cats={cats} terceros={terceros}
          onClose={() => setCrearOrden(false)}
          onCreated={() => { setCrearOrden(false); onCambio(); }}
        />
      )}
      {editarOrden && (
        <CrearOrdenModal
          orden={editarOrden}
          cajas={cajas} cats={cats} terceros={terceros}
          onClose={() => setEditarOrden(null)}
          onCreated={() => { setEditarOrden(null); onCambio(); }}
        />
      )}
      {pagoBorradorOrden && (
        <GestionarPagoModal
          orden={pagoBorradorOrden}
          cajas={cajas}
          terceros={terceros}
          onClose={() => setPagoBorradorOrden(null)}
          onSaved={() => { setPagoBorradorOrden(null); onCambio(); }}
          onCerrarCxP={(o) => { setPagoBorradorOrden(null); setCerrarOrden(o); }}
        />
      )}
      {verOrden && <VerOrdenModal orden={verOrden} onClose={() => setVerOrden(null)} />}
      {cerrarOrden && (
        <CerrarOrdenModal orden={cerrarOrden} cats={cats} cajas={cajas}
          onClose={() => setCerrarOrden(null)}
          onSaved={() => { setCerrarOrden(null); onCambio(); }}
        />
      )}
      {pagarOrden && (
        <PagarOrdenModal orden={pagarOrden} cajas={cajas}
          onClose={() => setPagarOrden(null)}
          onSaved={() => { setPagarOrden(null); onCambio(); }}
        />
      )}
      {verPDF && <PDFOrdenesModal ordenes={verPDF} onClose={() => setVerPDF(null)} />}
    </div>
  );
}

// ===========================================================
// PANEL PROVEEDORES (lista, catálogo de productos)
// ===========================================================
function ProveedoresPanel({ cajas, cats, user, refreshAll }) {
  const [terceros, setTerceros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editProveedor, setEditProveedor] = useState(null);
  const [crearProveedor, setCrearProveedor] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const apiUrl = () => (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');

  const cargar = async () => {
    if (!KBotAPI.enabled() || !KBotAPI.token()) return;
    setLoading(true);
    try {
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl() + '/api/terceros?tipo=PROVEEDOR', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (r.ok) {
        const d = await r.json();
        setTerceros(d.terceros || []);
      }
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const eliminarProveedor = async (p) => {
    if (!confirm(`¿Eliminar al proveedor ${p.nombre}?\n\nSi tiene órdenes o cuentas asociadas no se podrá eliminar.`)) return;
    const pin = prompt('PIN de 4 dígitos:');
    if (!pin) return;
    try {
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl() + '/api/terceros/' + p.id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + tok, 'X-PIN': pin }
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      alert('✅ Proveedor eliminado.');
      cargar();
    } catch (e) { alert('⚠️ ' + e.message); }
  };

  const filtrados = terceros.filter(t => {
    if (!filtroBusqueda) return true;
    return t.nombre.toLowerCase().includes(filtroBusqueda.toLowerCase());
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 600, letterSpacing: '0.1em' }}>CATÁLOGO DE PROVEEDORES</div>
        <button className="btn-primary" onClick={() => setCrearProveedor(true)}>
          + NUEVO PROVEEDOR
        </button>
      </div>

      <BotanaCard className="filter-bar" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            value={filtroBusqueda}
            onChange={e => setFiltroBusqueda(e.target.value)}
            placeholder="Buscar proveedor..."
            className="text-input"
            style={{ flex: 1 }}
          />
          {filtroBusqueda && (
            <button className="btn-ghost" onClick={() => setFiltroBusqueda('')}>LIMPIAR</button>
          )}
        </div>
      </BotanaCard>

      <BotanaCard>
        {loading && <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Cargando proveedores...</div>}
        {!loading && filtrados.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏭</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>NO HAY PROVEEDORES</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Agrega tu primer proveedor con "+ NUEVO PROVEEDOR"</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtrados.map(p => (
            <div key={p.id} style={{
              padding: 14, background: 'var(--surface)', borderRadius: 8,
              border: '1px solid var(--ink-soft, #eee)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {p.tipo_proveedor === 'SERVICIO' ? '🛠' : '🏭'} {p.nombre}
                  </div>
                  {p.telefono && <div style={{ fontSize: 11, opacity: 0.7 }}>📞 {p.telefono}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{
                    background: p.tipo_proveedor === 'SERVICIO' ? '#8B5CF622' : '#3B82F622',
                    color: p.tipo_proveedor === 'SERVICIO' ? '#5B21B6' : '#1E40AF',
                    padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700
                  }}>
                    {p.tipo_proveedor === 'SERVICIO' ? '🛠 SERVICIO' : '📦 PRODUCTOS'}
                  </span>
                  <span style={{
                    background: p.activo ? '#10B98122' : '#9CA3AF22',
                    color: p.activo ? '#065F46' : '#374151',
                    padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700
                  }}>
                    {p.activo ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
                {p.tipo_proveedor === 'SERVICIO'
                  ? (p.categoria_sugerida ? `📊 ${p.categoria_sugerida}` : '🛠 Proveedor de servicio')
                  : `📦 ${p.productos_count || 0} producto${(p.productos_count || 0) !== 1 ? 's' : ''} en catálogo`}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" onClick={() => setEditProveedor(p)} style={{ flex: 1, fontSize: 11, padding: '6px 10px' }}>
                  {p.tipo_proveedor === 'SERVICIO' ? 'EDITAR' : 'EDITAR + PRODUCTOS'}
                </button>
                {(user?.rol === 'admin' || user?.rol === 'gerente') && (
                  <button className="btn-ghost" onClick={() => eliminarProveedor(p)} style={{ fontSize: 11, padding: '6px 10px', color: 'var(--red)' }}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </BotanaCard>

      {(editProveedor || crearProveedor) && (
        <EditProveedorModal
          proveedor={editProveedor}
          cats={cats}
          onClose={() => { setEditProveedor(null); setCrearProveedor(false); }}
          onSaved={() => { setEditProveedor(null); setCrearProveedor(false); cargar(); }}
        />
      )}
    </div>
  );
}

// ===========================================================
// Modal: Editar/Crear Proveedor (con tabla de productos)
// ===========================================================
function EditProveedorModal({ proveedor, cats, onClose, onSaved }) {
  const esNuevo = !proveedor;
  const [nombre, setNombre] = useState(proveedor?.nombre || '');
  const [telefono, setTelefono] = useState(proveedor?.telefono || '');
  const [notas, setNotas] = useState(proveedor?.notas || '');
  const [activo, setActivo] = useState(proveedor?.activo ?? 1);
  const [tipoProveedor, setTipoProveedor] = useState(proveedor?.tipo_proveedor || 'PRODUCTO'); // PRODUCTO | SERVICIO
  const [categoriaServicio, setCategoriaServicio] = useState(proveedor?.categoria_sugerida || '');
  const [productos, setProductos] = useState([]);
  const [loadingProd, setLoadingProd] = useState(false);
  const [saving, setSaving] = useState(false);

  const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');

  const catsGasto = (cats || []).filter(c => c.tipo === 'GASTO' && !c.deleted);

  // Cargar productos del proveedor
  useEffect(() => {
    if (esNuevo) return;
    setLoadingProd(true);
    (async () => {
      try {
        const tok = KBotAPI.token();
        const r = await fetch(apiUrl + '/api/terceros/' + proveedor.id + '/productos', {
          headers: { 'Authorization': 'Bearer ' + tok }
        });
        if (r.ok) {
          const d = await r.json();
          setProductos((d.productos || []).map(p => ({ ...p, _persisted: true })));
        }
      } catch (e) { console.warn(e); }
      setLoadingProd(false);
    })();
  }, []);

  const agregarProducto = () => {
    // Sugerir la categoría del último producto agregado (autocompletar inteligente)
    const ultCat = productos.length > 0
      ? productos[productos.length - 1].categoria_contable
      : 'MERCANCIA';
    setProductos([...productos, {
      _new: true,
      _tmpId: newId(''),
      producto: '', unidad: 'KG',
      cantidad_default: 0, precio_actual: 0,
      categoria_contable: ultCat
    }]);
  };
  const eliminarProducto = (idx) => {
    setProductos(productos.filter((_, i) => i !== idx));
  };
  const actualizarProducto = (idx, campo, valor) => {
    const newProductos = [...productos];
    newProductos[idx] = { ...newProductos[idx], [campo]: valor };
    setProductos(newProductos);
  };

  const guardar = async () => {
    if (!nombre.trim()) { alert('⚠️ Falta nombre'); return; }
    setSaving(true);
    try {
      const tok = KBotAPI.token();
      let provId = proveedor?.id;

      // Crear o actualizar proveedor con tipo PRODUCTO o SERVICIO
      const payload = {
        nombre: nombre.trim(),
        tipo: 'PROVEEDOR',
        tipo_proveedor: tipoProveedor,
        grupo_sugerido: null,
        categoria_sugerida: tipoProveedor === 'SERVICIO' ? (categoriaServicio || null) : null,
        telefono: telefono || null,
        notas: notas || null,
        activo: activo ? 1 : 0
      };

      if (esNuevo) {
        const r = await fetch(apiUrl + '/api/terceros', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error');
        provId = d.id;
      } else {
        const r = await fetch(apiUrl + '/api/terceros/' + provId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error');
      }

      // Guardar productos del proveedor
      const productosValidos = productos
        .filter(p => p.producto && p.producto.trim())
        .map(p => ({
          id: p._new ? null : p.id,
          producto: p.producto.trim(),
          unidad: p.unidad || 'KG',
          cantidad_default: Number(p.cantidad_default || 0),
          precio_actual: Number(p.precio_actual || 0),
          categoria_contable: p.categoria_contable || 'MERCANCIA'
        }));

      const rp = await fetch(apiUrl + '/api/terceros/' + provId + '/productos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ productos: productosValidos })
      });
      if (!rp.ok) {
        const ep = await rp.json();
        throw new Error(ep.error || 'Error guardando productos');
      }

      alert(`✅ ${esNuevo ? 'Proveedor creado' : 'Proveedor actualizado'}.\n${productosValidos.length} producto${productosValidos.length !== 1 ? 's' : ''} en catálogo.`);
      onSaved();
    } catch (e) {
      alert('⚠️ ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(2px)',
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div className="modal-card capture-modal compras-modal" style={{
        maxWidth: 900, width: '95%',
        background: '#FFFFFF', color: '#1F2937',
        borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        maxHeight: '95vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        <header style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E5E7EB',
          background: '#F9FAFB',
          color: '#1F2937'
        }}>
          <div style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.12em', fontWeight: 700 }}>{esNuevo ? 'NUEVO PROVEEDOR' : 'EDITAR PROVEEDOR'}</div>
          <h3 style={{ margin: '4px 0 0 0', fontSize: 20, color: '#111827' }}>{nombre || 'Proveedor sin nombre'}</h3>
        </header>
        <div style={{ padding: 18, overflow: 'auto', flex: 1, color: '#1F2937', background: '#FFFFFF' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="field">
              <div className="field-label"><span>NOMBRE *</span></div>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: PORVENIR"
                className="text-input"
              />
            </div>
            <div className="field">
              <div className="field-label"><span>TELÉFONO</span></div>
              <input
                type="tel"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="55 1234 5678"
                className="text-input"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="field">
              <div className="field-label"><span>NOTAS</span></div>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows="2"
                className="text-input"
                placeholder="Direcciones, horarios, condiciones..."
              />
            </div>
          </div>

          {/* Selector tipo de proveedor */}
          <div style={{ marginTop: 14, padding: 14, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.08em', marginBottom: 8 }}>
              ¿QUÉ PROVEE ESTE PROVEEDOR? *
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => setTipoProveedor('PRODUCTO')}
                style={{
                  background: tipoProveedor === 'PRODUCTO' ? '#3B82F6' : '#FFFFFF',
                  color: tipoProveedor === 'PRODUCTO' ? '#FFFFFF' : '#374151',
                  border: '2px solid ' + (tipoProveedor === 'PRODUCTO' ? '#3B82F6' : '#D1D5DB'),
                  padding: 12, borderRadius: 6, cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>📦 PRODUCTOS</div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  Vende mercancía con catálogo (HABA, AZÚCAR, etc.)
                </div>
              </button>
              <button
                onClick={() => setTipoProveedor('SERVICIO')}
                style={{
                  background: tipoProveedor === 'SERVICIO' ? '#8B5CF6' : '#FFFFFF',
                  color: tipoProveedor === 'SERVICIO' ? '#FFFFFF' : '#374151',
                  border: '2px solid ' + (tipoProveedor === 'SERVICIO' ? '#8B5CF6' : '#D1D5DB'),
                  padding: 12, borderRadius: 6, cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>🛠 SERVICIO</div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  Luz, renta, internet, asesoría, etc.
                </div>
              </button>
            </div>
          </div>

          {/* Categoría sugerida solo si es SERVICIO */}
          {tipoProveedor === 'SERVICIO' && (
            <div style={{ marginTop: 14, padding: 12, background: '#F5F3FF', borderRadius: 8, border: '1px solid #DDD6FE' }}>
              <div className="field">
                <div className="field-label"><span>CATEGORÍA DE GASTO SUGERIDA</span></div>
                <select
                  value={categoriaServicio}
                  onChange={e => setCategoriaServicio(e.target.value)}
                  className="text-input"
                >
                  <option value="">— elegir categoría (opcional) —</option>
                  {catsGasto.map(c => (
                    <option key={c.id || c.nombre} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: '#5B21B6', marginTop: 4 }}>
                  💡 Al capturar una CxP de este proveedor, se pre-seleccionará esta categoría
                </div>
              </div>
            </div>
          )}

          {!esNuevo && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!activo} onChange={e => setActivo(e.target.checked ? 1 : 0)} />
              <span style={{ fontSize: 13 }}>Proveedor activo</span>
            </label>
          )}

          {/* Productos catalogados — SOLO si es proveedor de PRODUCTOS */}
          {tipoProveedor === 'PRODUCTO' && (
          <div style={{ marginTop: 24, borderTop: '2px dashed #D1D5DB', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#111827' }}>📦 PRODUCTOS DEL PROVEEDOR</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  Productos que normalmente compras a este proveedor.
                  Al crear una orden con este proveedor, se cargarán automáticamente con sus últimos precios.
                </div>
              </div>
              <button onClick={agregarProducto} style={{
                background: '#FFFFFF', color: '#1F2937', border: '1px solid #D1D5DB',
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}>
                + AGREGAR
              </button>
            </div>

            {loadingProd && <div style={{ padding: 16, textAlign: 'center', color: '#6B7280' }}>Cargando productos...</div>}
            {!loadingProd && productos.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12, background: '#F9FAFB', borderRadius: 6 }}>
                Sin productos catalogados. Haz clic en "+ AGREGAR" para empezar.
              </div>
            )}

            {productos.length > 0 && (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 60px 80px 90px 1.5fr 30px',
                  gap: 6, fontSize: 10, fontWeight: 700, color: '#6B7280',
                  marginBottom: 6, padding: '6px 4px',
                  background: '#F3F4F6', borderRadius: 4
                }}>
                  <div>PRODUCTO</div>
                  <div>UN</div>
                  <div style={{ textAlign: 'right' }}>CANT DEF</div>
                  <div style={{ textAlign: 'right' }}>PRECIO</div>
                  <div>CATEGORÍA</div>
                  <div></div>
                </div>
                {productos.map((p, idx) => (
                  <div key={p.id || p._tmpId || idx} style={{
                    display: 'grid', gridTemplateColumns: '2fr 60px 80px 90px 1.5fr 30px',
                    gap: 6, marginBottom: 6, alignItems: 'center',
                    padding: '2px 0'
                  }}>
                    <input
                      type="text"
                      value={p.producto}
                      onChange={e => actualizarProducto(idx, 'producto', e.target.value)}
                      placeholder="Ej: HABA 50KG"
                      className="text-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                    />
                    <select
                      value={p.unidad}
                      onChange={e => actualizarProducto(idx, 'unidad', e.target.value)}
                      className="text-input"
                      style={{ fontSize: 12, padding: '6px 4px' }}
                    >
                      <option>KG</option><option>CJ</option><option>BD</option><option>BT</option><option>CT</option><option>PZA</option>
                    </select>
                    <input
                      type="number"
                      value={p.cantidad_default}
                      onChange={e => actualizarProducto(idx, 'cantidad_default', e.target.value)}
                      placeholder="0"
                      className="text-input"
                      style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right' }}
                      step="0.01"
                    />
                    <input
                      type="number"
                      value={p.precio_actual}
                      onChange={e => actualizarProducto(idx, 'precio_actual', e.target.value)}
                      placeholder="0.00"
                      className="text-input"
                      style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right' }}
                      step="0.01"
                    />
                    <select
                      value={p.categoria_contable || ''}
                      onChange={e => actualizarProducto(idx, 'categoria_contable', e.target.value)}
                      className="text-input"
                      style={{ fontSize: 11, padding: '6px 4px' }}
                    >
                      <option value="">— elegir categoría —</option>
                      {catsGasto.map(c => <option key={c.id || c.nombre} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                    <button
                      onClick={() => eliminarProducto(idx)}
                      style={{
                        background: 'transparent', color: '#DC2626',
                        border: '1px solid #FCA5A5', borderRadius: 4,
                        fontSize: 14, padding: '4px 6px', cursor: 'pointer'
                      }}
                      title="Eliminar producto"
                    >✕</button>
                  </div>
                ))}
              </>
            )}
          </div>
          )}
        </div>

        <footer style={{
          padding: 14,
          borderTop: '1px solid #E5E7EB',
          background: '#F9FAFB',
          display: 'flex', gap: 10
        }}>
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: '10px 14px',
            background: '#FFFFFF', color: '#374151',
            border: '1px solid #D1D5DB', borderRadius: 6,
            fontWeight: 700, fontSize: 12, letterSpacing: '0.05em',
            cursor: 'pointer'
          }}>CANCELAR</button>
          <button onClick={guardar} disabled={saving} style={{
            flex: 2, padding: '10px 14px',
            background: saving ? '#9CA3AF' : '#E63946',
            color: '#FFFFFF', border: 'none', borderRadius: 6,
            fontWeight: 800, fontSize: 12, letterSpacing: '0.05em',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            {saving ? 'GUARDANDO...' : (esNuevo ? 'CREAR PROVEEDOR' : 'GUARDAR CAMBIOS')}
          </button>
        </footer>
        <style>{`
          .modal-card .field-label { color: #374151 !important; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 4px; display: block; }
          .modal-card .field-label span { color: #374151 !important; }
          .modal-card .text-input {
            background: #FFFFFF !important;
            color: #111827 !important;
            border: 1px solid #D1D5DB !important;
            border-radius: 6px !important;
            padding: 8px 10px !important;
            width: 100% !important;
            font-size: 13px !important;
          }
          .modal-card .text-input:focus { outline: none; border-color: #E63946 !important; box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.15) !important; }
          .modal-card .text-input::placeholder { color: #9CA3AF !important; }
          .modal-card .text-input:disabled { background: #F3F4F6 !important; color: #6B7280 !important; }
          .modal-card .field { margin-bottom: 0; }
          .modal-card .btn-ghost {
            background: #FFFFFF !important;
            color: #374151 !important;
            border: 1px solid #D1D5DB !important;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
          }
          .modal-card .btn-ghost:hover { background: #F3F4F6 !important; }
          .modal-card .btn-primary {
            background: #E63946 !important;
            color: #FFFFFF !important;
            border: none !important;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
          }
          .modal-card select.text-input { appearance: auto; cursor: pointer; }
        `}</style>
      </div>
    </div>
  );
}

// ===========================================================
// Modal: Crear Orden (con auto-carga de productos del proveedor)
// ===========================================================
function CrearOrdenModal({ orden, cajas, cats, terceros, onClose, onCreated }) {
  const esEdicion = !!orden;

  // Pre-rellenar valores en modo edición
  const [proveedorId, setProveedorId] = useState(orden?.proveedor_id || '');
  const [proveedorNombre, setProveedorNombre] = useState(orden?.proveedor_nombre || '');
  const [comprador, setComprador] = useState(orden?.comprador_nombre || '');
  const [fecha, setFecha] = useState(orden?.fecha || todayISO());
  const [observaciones, setObservaciones] = useState(orden?.observaciones || '');
  const [items, setItems] = useState(
    esEdicion && orden.items && orden.items.length > 0
      ? orden.items.map(it => ({
          producto: it.producto || '',
          unidad: it.unidad || 'KG',
          cantidad_estimada: it.cantidad_estimada != null ? String(it.cantidad_estimada) : '',
          precio_estimado: it.precio_estimado != null ? String(it.precio_estimado) : '',
          categoria_contable: it.categoria_contable || 'MERCANCIA'
        }))
      : [{ producto: '', unidad: 'KG', cantidad_estimada: '', precio_estimado: '', categoria_contable: 'MERCANCIA' }]
  );
  // En edición: si tiene anticipo > 0, modo ANTICIPO; si no, SIN_PAGO
  const [modoCierre, setModoCierre] = useState(
    esEdicion
      ? (orden.monto_entregado > 0 ? 'ANTICIPO' : 'SIN_PAGO')
      : 'SIN_PAGO'
  ); // SIN_PAGO | ANTICIPO | PAGO_COMPLETO
  const [cajaPago, setCajaPago] = useState(orden?.caja_id || '');
  const [metodoPago, setMetodoPago] = useState(orden?.metodo_pago || 'EFECTIVO');
  const [montoEntrega, setMontoEntrega] = useState(orden?.monto_entregado > 0 ? String(orden.monto_entregado) : '');
  const [saving, setSaving] = useState(false);
  const [cargandoCat, setCargandoCat] = useState(false);

  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);
  const catsGasto = (cats || []).filter(c => c.tipo === 'GASTO' && !c.deleted);
  const catsMercancia = catsGasto.filter(c => c.nombre.startsWith('MERCANCIA'));

  const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');

  useEffect(() => {
    if (cajasActivas.length > 0 && !cajaPago) {
      const principal = cajasActivas.find(c => c.id === 'caja-principal') || cajasActivas[0];
      setCajaPago(principal.id);
    }
  }, [cajas]);

  // En MODO EDICIÓN: cargar catálogo del proveedor y agregar productos NO incluidos con cantidad 0
  useEffect(() => {
    if (!esEdicion || !orden.proveedor_id) return;
    (async () => {
      try {
        const tok = KBotAPI.token();
        const r = await fetch(apiUrl + '/api/terceros/' + orden.proveedor_id + '/productos', {
          headers: { 'Authorization': 'Bearer ' + tok }
        });
        if (!r.ok) return;
        const d = await r.json();
        const productosCatalogo = d.productos || [];
        // Productos ya en la orden (por nombre normalizado)
        const nombresEnOrden = new Set(items.map(it => (it.producto || '').toLowerCase().trim()));
        // Items del catálogo que NO están en la orden
        const itemsExtra = productosCatalogo
          .filter(p => !nombresEnOrden.has((p.producto || '').toLowerCase().trim()))
          .map(p => ({
            producto: p.producto,
            unidad: p.unidad || 'KG',
            cantidad_estimada: '', // 0 = no se guardará
            precio_estimado: p.precio_actual > 0 ? String(p.precio_actual) : '',
            categoria_contable: p.categoria_contable || 'MERCANCIA',
            _delCatalogo: true
          }));
        if (itemsExtra.length > 0) {
          setItems(prev => [...prev, ...itemsExtra]);
        }
      } catch (e) { console.warn('Error cargando catálogo:', e); }
    })();
    // eslint-disable-next-line
  }, []);

  const onSelectProveedor = async (id) => {
    setProveedorId(id);
    const t = terceros.find(x => x.id === id);
    if (!t) return;
    setProveedorNombre(t.nombre);
    // En modo edición no auto-rellenamos productos (respetamos los actuales de la orden)
    if (esEdicion) return;
    // Cargar productos del proveedor
    setCargandoCat(true);
    try {
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/terceros/' + id + '/productos', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (r.ok) {
        const d = await r.json();
        const productos = d.productos || [];
        if (productos.length > 0) {
          // Pre-rellenar items con productos del catálogo
          const itemsNuevos = productos.map(p => ({
            producto: p.producto,
            unidad: p.unidad,
            cantidad_estimada: p.cantidad_default > 0 ? String(p.cantidad_default) : '',
            precio_estimado: p.precio_actual > 0 ? String(p.precio_actual) : '',
            categoria_contable: p.categoria_contable || 'MERCANCIA'
          }));
          setItems(itemsNuevos);
        } else {
          // Sin catálogo: una fila vacía
          setItems([{
            producto: '', unidad: 'KG',
            cantidad_estimada: '', precio_estimado: '',
            categoria_contable: 'MERCANCIA'
          }]);
        }
      }
    } catch (e) { console.warn(e); }
    setCargandoCat(false);
  };

  const agregarItem = () => {
    // Sugerir categoría del último item agregado (autocompletar inteligente)
    const ultCat = items.length > 0
      ? items[items.length - 1].categoria_contable
      : 'MERCANCIA';
    setItems([...items, {
      _tmpId: newId(''),
      producto: '', unidad: 'KG', cantidad_estimada: '', precio_estimado: '',
      categoria_contable: ultCat
    }]);
  };
  const eliminarItem = (idx) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };
  const actualizarItem = (idx, campo, valor) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [campo]: valor };
    setItems(newItems);
  };

  const totalEstimado = useMemo(() => {
    return items.reduce((s, it) => {
      const c = parseFloat(it.cantidad_estimada || 0);
      const p = parseFloat(it.precio_estimado || 0);
      return s + (isNaN(c) || isNaN(p) ? 0 : c * p);
    }, 0);
  }, [items]);

  const guardar = async () => {
    if (!proveedorNombre.trim()) { alert('⚠️ Falta proveedor'); return; }
    // Solo items con nombre Y cantidad > 0 son válidos
    const itemsValidos = items.filter(it =>
      it.producto && it.producto.trim() &&
      parseFloat(it.cantidad_estimada || 0) > 0
    );
    if (itemsValidos.length === 0) {
      alert('⚠️ Captura cantidad en al menos un producto para guardar la orden.\n\nLos productos con cantidad 0 no se guardarán.');
      return;
    }

    let monto = 0;
    if (modoCierre === 'ANTICIPO') {
      monto = parseFloat(montoEntrega);
      if (isNaN(monto) || monto <= 0) { alert('⚠️ Monto de anticipo inválido'); return; }
      if (monto > totalEstimado) {
        if (!confirm(`⚠️ Anticipo (${fmtMXN(monto)}) mayor que estimado (${fmtMXN(totalEstimado)}). ¿Continuar?`)) return;
      }
    } else if (modoCierre === 'PAGO_COMPLETO') {
      monto = totalEstimado;
    }

    setSaving(true);
    try {
      const tok = KBotAPI.token();
      const payload = {
        fecha,
        proveedor_id: proveedorId || null,
        proveedor_nombre: proveedorNombre.trim(),
        comprador_nombre: comprador.trim() || null,
        metodo_pago: modoCierre !== 'SIN_PAGO' ? metodoPago : 'EFECTIVO',
        caja_id: modoCierre !== 'SIN_PAGO' ? cajaPago : (cajasActivas[0]?.id || ''),
        monto_entregado: monto,
        observaciones: observaciones.trim() || null,
        items: itemsValidos.map(it => ({
          producto: it.producto.trim(),
          unidad: it.unidad || 'KG',
          cantidad_estimada: parseFloat(it.cantidad_estimada || 0),
          precio_estimado: parseFloat(it.precio_estimado || 0),
          categoria_contable: it.categoria_contable || 'MERCANCIA'
        }))
      };
      const url = esEdicion ? `${apiUrl}/api/ordenes/${orden.id}` : `${apiUrl}/api/ordenes`;
      const method = esEdicion ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');

      const msgModo = modoCierre === 'SIN_PAGO' ? 'sin movimiento de caja' :
                     modoCierre === 'ANTICIPO' ? `con anticipo de ${fmtMXN(monto)} por ${metodoPago}` :
                     `con pago completo de ${fmtMXN(monto)} por ${metodoPago}`;
      alert(`✅ Orden ${esEdicion ? 'actualizada' : 'creada'} ${msgModo}.`);
      onCreated();
    } catch (e) {
      alert('⚠️ ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card capture-modal compras-modal" style={{ maxWidth: 950, width: '95%' }} onClick={e => e.stopPropagation()}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--ink-soft, #eee)' }}>
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.12em' }}>COMPRAS</div>
          <h3 style={{ margin: '4px 0 0 0', fontSize: 20 }}>{esEdicion ? `EDITAR ORDEN · ${orden.proveedor_nombre}` : 'NUEVA ORDEN DE COMPRA'}</h3>
        </header>
        <div style={{ padding: 18, overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <div className="field-label"><span>PROVEEDOR *</span></div>
              {terceros.length > 0 ? (
                <>
                  <select
                    value={proveedorId}
                    onChange={e => onSelectProveedor(e.target.value)}
                    className="text-input"
                  >
                    <option value="">— elegir del catálogo —</option>
                    {terceros.filter(t => t.tipo === 'PROVEEDOR' && !t.deleted).map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}{t.productos_count ? ` (${t.productos_count} prod)` : ''}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={proveedorNombre}
                    onChange={e => { setProveedorNombre(e.target.value); setProveedorId(''); }}
                    placeholder="O escribe nombre nuevo"
                    className="text-input"
                    style={{ marginTop: 6 }}
                  />
                </>
              ) : (
                <input
                  type="text"
                  value={proveedorNombre}
                  onChange={e => setProveedorNombre(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="text-input"
                />
              )}
              {cargandoCat && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>🔄 Cargando catálogo...</div>}
            </div>
            <div className="field">
              <div className="field-label"><span>FECHA</span></div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-input" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className="field">
              <div className="field-label"><span>COMPRADOR / CHOFER</span></div>
              <input type="text" value={comprador} onChange={e => setComprador(e.target.value)} placeholder="Ej: Chofer Pedro" className="text-input" />
            </div>
            <div className="field">
              <div className="field-label"><span>OBSERVACIONES</span></div>
              <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Notas..." className="text-input" />
            </div>
          </div>

          {/* Productos */}
          <div style={{ marginTop: 18, borderTop: '2px dashed var(--line, #eee)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.8 }}>PRODUCTOS A COMPRAR</div>
                {proveedorId && items.length > 1 && (
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    📦 Productos del catálogo del proveedor con últimos precios
                  </div>
                )}
              </div>
              <button className="btn-ghost" onClick={agregarItem} style={{ fontSize: 11, padding: '4px 10px' }}>+ AGREGAR</button>
            </div>
            {/* F2_COMPRAS_TOTAL — header con columna TOTAL */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 90px 1.5fr 90px 30px', gap: 6, fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 6, padding: '0 4px' }}>
              <div>PRODUCTO</div>
              <div>UN</div>
              <div className="ar">CANT</div>
              <div className="ar">$/UN</div>
              <div>CATEGORÍA</div>
              <div className="ar">TOTAL</div>
              <div></div>
            </div>
            {items.map((it, idx) => {
              const sinCantidad = !it.cantidad_estimada || parseFloat(it.cantidad_estimada) === 0;
              return (
                <div key={it.id || it._tmpId || idx} style={{
                  display: 'grid', gridTemplateColumns: '2fr 60px 80px 90px 1.5fr 90px 30px',
                  gap: 6, marginBottom: 6, alignItems: 'center',
                  opacity: sinCantidad ? 0.55 : 1,
                  transition: 'opacity 0.15s'
                }}>
                  <input type="text" value={it.producto} onChange={e => actualizarItem(idx, 'producto', e.target.value)} placeholder="HABA" className="text-input" style={{ fontSize: 12, padding: '6px 8px' }} />
                  <select value={it.unidad} onChange={e => actualizarItem(idx, 'unidad', e.target.value)} className="text-input" style={{ fontSize: 12, padding: '6px 4px' }}>
                    <option>KG</option><option>CJ</option><option>BD</option><option>BT</option><option>CT</option><option>PZA</option>
                  </select>
                  <input
                    type="number"
                    value={it.cantidad_estimada}
                    onChange={e => actualizarItem(idx, 'cantidad_estimada', e.target.value)}
                    placeholder="0"
                    className="text-input"
                    style={{
                      fontSize: 12, padding: '6px 8px', textAlign: 'right',
                      borderColor: sinCantidad ? '#D1D5DB' : '#10B981',
                      borderWidth: sinCantidad ? 1 : 2,
                      fontWeight: sinCantidad ? 400 : 700
                    }}
                    step="0.01"
                  />
                  <input type="number" value={it.precio_estimado} onChange={e => actualizarItem(idx, 'precio_estimado', e.target.value)} placeholder="0.00" className="text-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right' }} step="0.01" />
                  <select value={it.categoria_contable} onChange={e => actualizarItem(idx, 'categoria_contable', e.target.value)} className="text-input" style={{ fontSize: 11, padding: '6px 4px' }}>
                    {catsGasto.length === 0 && <option value="MERCANCIA">MERCANCIA</option>}
                    {catsGasto.map(c => <option key={c.id || c.nombre} value={c.nombre}>{c.nombre}</option>)}
                  </select>
                  {/* F2_COMPRAS_TOTAL — celda TOTAL por fila (cant × precio) */}
                  <div className="ar" style={{ fontSize: 12, fontFamily: 'var(--f-mono)', fontWeight: 700, padding: '6px 4px', color: sinCantidad ? '#9CA3AF' : 'var(--ink, #111)' }}>
                    {sinCantidad ? '' : fmtMXN((parseFloat(it.cantidad_estimada) || 0) * (parseFloat(it.precio_estimado) || 0))}
                  </div>
                  <button onClick={() => eliminarItem(idx)} className="btn-ghost" style={{ fontSize: 14, padding: '4px 6px', color: 'var(--red)' }} disabled={items.length <= 1}>✕</button>
                </div>
              );
            })}
            <div style={{ marginTop: 6, fontSize: 10, color: '#6B7280', fontStyle: 'italic' }}>
              💡 Solo se guardarán los productos con CANTIDAD &gt; 0. Los demás se ignoran automáticamente.
            </div>
            <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2, #f5f5f5)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                TOTAL ESTIMADO ({items.filter(it => parseFloat(it.cantidad_estimada || 0) > 0).length} producto{items.filter(it => parseFloat(it.cantidad_estimada || 0) > 0).length !== 1 ? 's' : ''}):
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--f-mono)' }}>{fmtMXN(totalEstimado)}</span>
            </div>
          </div>

          {/* Modo de cierre */}
          <div style={{ marginTop: 18, borderTop: '2px dashed var(--line, #eee)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              💳 {esEdicion ? '¿CÓMO QUEDARÁ EL ANTICIPO?' : '¿CÓMO QUIERES CERRAR ESTA ORDEN?'}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: esEdicion ? '1fr 1fr' : '1fr 1fr 1fr',
              gap: 8, marginBottom: 12
            }}>
              <button
                className={modoCierre === 'SIN_PAGO' ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setModoCierre('SIN_PAGO')}
                style={{ fontSize: 11, padding: '10px', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 700 }}>📝 {esEdicion ? 'SIN ANTICIPO' : 'SOLO BORRADOR'}</div>
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                  {esEdicion ? 'Quitar el anticipo (devolver a caja).' : 'Sin mover caja. Decidir pago después.'}
                </div>
              </button>
              <button
                className={modoCierre === 'ANTICIPO' ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setModoCierre('ANTICIPO')}
                style={{ fontSize: 11, padding: '10px', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 700 }}>💰 CON ANTICIPO</div>
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                  {esEdicion ? 'Cambiar el monto del anticipo.' : 'Dar dinero al chofer ahora.'}
                </div>
              </button>
              {!esEdicion && (
                <button
                  className={modoCierre === 'PAGO_COMPLETO' ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setModoCierre('PAGO_COMPLETO')}
                  style={{ fontSize: 11, padding: '10px', textAlign: 'left' }}
                >
                  <div style={{ fontWeight: 700 }}>💸 PAGO COMPLETO</div>
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>Pagar el total ahora (transferencia, etc).</div>
                </button>
              )}
            </div>

            {modoCierre === 'SIN_PAGO' && (
              <div style={{ fontSize: 11, padding: 10, background: '#E0F2FE', color: '#075985', borderRadius: 6 }}>
                {esEdicion
                  ? (orden.monto_entregado > 0
                      ? `✅ Se eliminará el anticipo actual de ${fmtMXN(orden.monto_entregado)} (se devolverá a la caja).`
                      : '✅ La orden seguirá sin anticipo. La caja no se moverá.')
                  : '✅ La orden quedará en BORRADOR. La caja NO se moverá. Cuando recibas los productos podrás cerrarla con precios reales y elegir crear CxP (crédito) o pagar.'}
              </div>
            )}

            {modoCierre === 'ANTICIPO' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 12, background: '#FEF3C7', borderRadius: 6 }}>
                <div className="field">
                  <div className="field-label"><span>CAJA</span></div>
                  <select value={cajaPago} onChange={e => setCajaPago(e.target.value)} className="text-input">
                    {cajasActivas.map(c => <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="field-label"><span>MÉTODO</span></div>
                  <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className="text-input">
                    <option>EFECTIVO</option>
                    <option>TRANSFERENCIA</option>
                    <option>TARJETA</option>
                    <option>CHEQUE</option>
                  </select>
                </div>
                <div className="field">
                  <div className="field-label"><span>MONTO ANTICIPO</span></div>
                  <input type="number" value={montoEntrega} onChange={e => setMontoEntrega(e.target.value)} placeholder="0.00" className="text-input" step="0.01" />
                </div>
              </div>
            )}

            {modoCierre === 'PAGO_COMPLETO' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 12, background: '#FEE2E2', borderRadius: 6 }}>
                <div className="field">
                  <div className="field-label"><span>CAJA</span></div>
                  <select value={cajaPago} onChange={e => setCajaPago(e.target.value)} className="text-input">
                    {cajasActivas.map(c => <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="field-label"><span>MÉTODO</span></div>
                  <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className="text-input">
                    <option>EFECTIVO</option>
                    <option>TRANSFERENCIA</option>
                    <option>TARJETA</option>
                    <option>CHEQUE</option>
                  </select>
                </div>
                <div className="field">
                  <div className="field-label"><span>MONTO (= total)</span></div>
                  <input type="text" value={fmtMXN(totalEstimado)} disabled className="text-input" style={{ background: '#f5f5f5' }} />
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#991B1B' }}>
                  ⚠️ Se descontarán {fmtMXN(totalEstimado)} de la caja AHORA. Después podrás ajustar precios reales al cerrar.
                </div>
              </div>
            )}
          </div>
        </div>

        <footer style={{ padding: 14, borderTop: '1px solid var(--ink-soft, #eee)', display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={guardar} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'GUARDANDO...' : (esEdicion ? 'GUARDAR CAMBIOS' : 'CREAR ORDEN')}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================
// Modal: Cerrar Orden con precios reales
// ===========================================================
function CerrarOrdenModal({ orden, cats, cajas, onClose, onSaved }) {
  const [items, setItems] = useState(
    (orden.items || [])
      .filter(it => Number(it.cantidad_estimada || 0) > 0)
      .map(it => ({
        id: it.id,
        producto: it.producto,
        unidad: it.unidad,
        cantidad_estimada: it.cantidad_estimada,
        precio_estimado: it.precio_estimado,
        cantidad_real: it.cantidad_estimada || 0,
        precio_real: it.precio_estimado || 0,
        categoria_contable: it.categoria_contable || 'MERCANCIA'
      }))
  );
  const [observaciones, setObservaciones] = useState('');
  const [modoPago, setModoPago] = useState('CXP');
  const [fechaVencimiento, setFechaVencimiento] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [cajaPago, setCajaPago] = useState(orden.caja_id);
  const [metodoPagoInmediato, setMetodoPagoInmediato] = useState(orden.metodo_pago || 'EFECTIVO');
  const [saving, setSaving] = useState(false);

  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);
  const catsGasto = (cats || []).filter(c => c.tipo === 'GASTO' && !c.deleted);

  const actualizarItem = (idx, campo, valor) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [campo]: valor };
    setItems(newItems);
  };

  const totalReal = useMemo(() => {
    return items.reduce((s, it) => {
      const c = parseFloat(it.cantidad_real || 0);
      const p = parseFloat(it.precio_real || 0);
      return s + (isNaN(c) || isNaN(p) ? 0 : c * p);
    }, 0);
  }, [items]);

  const anticipo = orden.monto_entregado || 0;
  const saldoPendiente = Math.max(0, totalReal - anticipo);
  const sobrante = anticipo > totalReal ? anticipo - totalReal : 0;
  const haySaldo = saldoPendiente > 0.01;

  const guardar = async () => {
    if (items.length === 0) { alert('No hay productos'); return; }
    if (totalReal <= 0) { alert('El total real debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const payload = {
        items: items.map(it => ({
          id: it.id,
          cantidad_real: parseFloat(it.cantidad_real || 0),
          precio_real: parseFloat(it.precio_real || 0),
          categoria_contable: it.categoria_contable
        })),
        observaciones: observaciones.trim() || null,
        pago_inmediato: haySaldo && modoPago === 'INMEDIATO',
        caja_pago_id: haySaldo && modoPago === 'INMEDIATO' ? cajaPago : null,
        metodo_pago_pago: haySaldo && modoPago === 'INMEDIATO' ? metodoPagoInmediato : null,
        fecha_vencimiento: haySaldo && modoPago === 'CXP' ? fechaVencimiento : null
      };
      const r = await fetch(apiUrl + '/api/ordenes/' + orden.id + '/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      let msg = '✅ Orden cerrada.\n';
      if (!haySaldo) msg += sobrante > 0 ? `\nSobró ${fmtMXN(sobrante)} (devolución a caja).` : '\nAnticipo cubrió el total.';
      else if (modoPago === 'INMEDIATO') msg += `\nSe descontaron ${fmtMXN(saldoPendiente)} de la caja.`;
      else msg += `\nSe creó CxP de ${fmtMXN(saldoPendiente)} (pagar después).`;
      alert(msg);
      onSaved();
    } catch (e) {
      alert('⚠️ ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card capture-modal compras-modal" style={{ maxWidth: 950, width: '95%' }} onClick={e => e.stopPropagation()}>
        <header style={{ padding: 14, borderBottom: '1px solid var(--ink-soft, #eee)' }}>
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.12em' }}>CIERRE DE ORDEN</div>
          <h3 style={{ margin: '4px 0 0 0', fontSize: 20 }}>CERRAR · {orden.proveedor_nombre}</h3>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            {anticipo > 0 ? `Anticipo: ${fmtMXN(anticipo)} ${orden.metodo_pago} desde ${orden.caja_nombre}` : 'Sin anticipo'}
            {orden.comprador_nombre && ` · 👤 ${orden.comprador_nombre}`}
          </div>
        </header>
        <div style={{ padding: 18, overflow: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
          <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.7 }}>
            Actualiza las cantidades y precios REALES de cada producto:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 50px 70px 70px 80px 80px 90px 1.5fr', gap: 6, fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 6, padding: '0 4px' }}>
            <div>PRODUCTO</div>
            <div>UN</div>
            <div className="ar">CANT EST</div>
            <div className="ar">CANT REAL</div>
            <div className="ar">$/UN EST</div>
            <div className="ar">$/UN REAL</div>
            <div className="ar">TOTAL</div>
            <div>CATEGORÍA</div>
          </div>
          {items.map((it, idx) => {
            const total = (parseFloat(it.cantidad_real || 0) || 0) * (parseFloat(it.precio_real || 0) || 0);
            return (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '2fr 50px 70px 70px 80px 80px 90px 1.5fr', gap: 6, marginBottom: 6, alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{it.producto}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{it.unidad}</div>
                <div style={{ textAlign: 'right', opacity: 0.6, fontSize: 11 }}>{it.cantidad_estimada}</div>
                <input type="number" value={it.cantidad_real} onChange={e => actualizarItem(idx, 'cantidad_real', e.target.value)} className="text-input" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} step="0.01" />
                <div style={{ textAlign: 'right', opacity: 0.6, fontSize: 11 }}>{fmtMXN(it.precio_estimado)}</div>
                <input type="number" value={it.precio_real} onChange={e => actualizarItem(idx, 'precio_real', e.target.value)} className="text-input" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} step="0.01" />
                <div style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--f-mono)', fontSize: 12 }}>{fmtMXN(total)}</div>
                <select value={it.categoria_contable} onChange={e => actualizarItem(idx, 'categoria_contable', e.target.value)} className="text-input" style={{ fontSize: 10, padding: '4px 2px' }}>
                  {catsGasto.length === 0 && <option value="MERCANCIA">MERCANCIA</option>}
                  {catsGasto.map(c => <option key={c.id || c.nombre} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
            );
          })}

          <div style={{ marginTop: 18, padding: 14, background: 'var(--surface-2, #f5f5f5)', borderRadius: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>TOTAL REAL</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--f-mono)', color: '#10B981' }}>{fmtMXN(totalReal)}</div>
              </div>
              {anticipo > 0 && (
                <div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>ANTICIPO</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--f-mono)' }}>{fmtMXN(anticipo)}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{sobrante > 0 ? 'SOBRÓ' : 'PENDIENTE'}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--f-mono)', color: sobrante > 0 ? '#10B981' : (haySaldo ? '#F59E0B' : '#6B7280') }}>
                  {fmtMXN(sobrante > 0 ? sobrante : saldoPendiente)}
                </div>
              </div>
            </div>
            {!haySaldo && (
              <div style={{ fontSize: 11, padding: 8, background: '#D1FAE5', borderRadius: 6, color: '#065F46' }}>
                {sobrante > 0
                  ? `🟢 El anticipo (${fmtMXN(anticipo)}) cubrió el total y sobraron ${fmtMXN(sobrante)}. Se creará un INGRESO de devolución.`
                  : '✅ El anticipo cubrió exactamente el total. La orden quedará PAGADA.'}
              </div>
            )}
          </div>

          {haySaldo && (
            <div style={{ marginTop: 18, padding: 14, background: '#FEF3C7', borderRadius: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                💰 ¿Cómo manejar el saldo pendiente de {fmtMXN(saldoPendiente)}?
              </div>
              <div className="seg" style={{ marginBottom: 12 }}>
                <button className={modoPago === 'CXP' ? 'active' : ''} onClick={() => setModoPago('CXP')} style={{ fontSize: 12, padding: '8px 14px' }}>
                  📋 CRÉDITO (CxP, pagar después)
                </button>
                <button className={modoPago === 'INMEDIATO' ? 'active' : ''} onClick={() => setModoPago('INMEDIATO')} style={{ fontSize: 12, padding: '8px 14px' }}>
                  💸 PAGAR AHORA
                </button>
              </div>

              {modoPago === 'CXP' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8 }}>
                    Se creará una cuenta por pagar vinculada. La caja NO se moverá hasta registrar el pago.
                  </div>
                  <div className="field" style={{ maxWidth: 200 }}>
                    <div className="field-label"><span>VENCIMIENTO</span></div>
                    <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className="text-input" />
                  </div>
                </div>
              )}

              {modoPago === 'INMEDIATO' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                  <div className="field">
                    <div className="field-label"><span>CAJA</span></div>
                    <select value={cajaPago} onChange={e => setCajaPago(e.target.value)} className="text-input">
                      {cajasActivas.map(c => <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="field-label"><span>MÉTODO</span></div>
                    <select value={metodoPagoInmediato} onChange={e => setMetodoPagoInmediato(e.target.value)} className="text-input">
                      <option>EFECTIVO</option>
                      <option>TRANSFERENCIA</option>
                      <option>TARJETA</option>
                      <option>CHEQUE</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', fontSize: 11, padding: 8, background: '#FEE2E2', borderRadius: 6, color: '#991B1B' }}>
                    ⚠️ Se descontarán {fmtMXN(saldoPendiente)} de la caja AHORA.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="field" style={{ marginTop: 14 }}>
            <div className="field-label"><span>OBSERVACIONES</span></div>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} className="text-input" rows="2" placeholder="Notas (opcional)" />
          </div>
        </div>
        <footer style={{ padding: 14, borderTop: '1px solid var(--ink-soft, #eee)', display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={guardar} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'CERRANDO...' : (
              !haySaldo ? 'CERRAR ORDEN' :
              modoPago === 'INMEDIATO' ? `CERRAR Y PAGAR ${fmtMXN(saldoPendiente)}` :
              `CERRAR Y CREAR CRÉDITO ${fmtMXN(saldoPendiente)}`
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================
// Modal: Pagar Orden
// ===========================================================
function PagarOrdenModal({ orden, cajas, onClose, onSaved }) {
  const saldoTotal = (orden.monto_real || 0) - (orden.monto_entregado || 0);
  const [monto, setMonto] = useState(saldoTotal.toFixed(2));
  const [cajaId, setCajaId] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [fecha, setFecha] = useState(todayISO());
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);

  useEffect(() => {
    if (cajasActivas.length > 0 && !cajaId) {
      const principal = cajasActivas.find(c => c.id === 'caja-principal') || cajasActivas[0];
      setCajaId(principal.id);
    }
  }, [cajas]);

  const guardar = async () => {
    const m = parseFloat(monto);
    if (isNaN(m) || m <= 0) { alert('Monto inválido'); return; }
    if (m > saldoTotal + 0.01) { alert(`El monto excede el saldo (${fmtMXN(saldoTotal)})`); return; }
    if (!cajaId) { alert('Selecciona una caja'); return; }
    setSaving(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/ordenes/' + orden.id + '/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ monto: m, caja_id: cajaId, metodo, fecha, observaciones: observaciones.trim() || null })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      const esTotal = Math.abs(m - saldoTotal) < 0.01;
      alert(`✅ Pago de ${fmtMXN(m)} registrado.${esTotal ? '\nOrden PAGADA completamente.' : `\nSaldo: ${fmtMXN(data.saldoNuevo)}.`}`);
      onSaved();
    } catch (e) {
      alert('⚠️ ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card compras-modal" style={{ maxWidth: 500, width: '95%' }} onClick={e => e.stopPropagation()}>
        <header style={{ padding: 14, borderBottom: '1px solid var(--ink-soft, #eee)' }}>
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.12em' }}>REGISTRAR PAGO</div>
          <h3 style={{ margin: '4px 0 0 0' }}>{orden.proveedor_nombre}</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Saldo: <strong>{fmtMXN(saldoTotal)}</strong></div>
        </header>
        <div style={{ padding: 14 }}>
          <div className="field">
            <div className="field-label"><span>MONTO A PAGAR *</span></div>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="text-input" step="0.01" />
            <div style={{ marginTop: 4 }}>
              <button onClick={() => setMonto(saldoTotal.toFixed(2))} className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }}>
                Pagar todo ({fmtMXN(saldoTotal)})
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className="field">
              <div className="field-label"><span>CAJA *</span></div>
              <select value={cajaId} onChange={e => setCajaId(e.target.value)} className="text-input">
                {cajasActivas.map(c => <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label"><span>MÉTODO</span></div>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} className="text-input">
                <option>EFECTIVO</option>
                <option>TRANSFERENCIA</option>
                <option>TARJETA</option>
                <option>CHEQUE</option>
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <div className="field-label"><span>FECHA</span></div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-input" />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <div className="field-label"><span>OBSERVACIONES</span></div>
            <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)} className="text-input" />
          </div>
        </div>
        <footer style={{ padding: 14, borderTop: '1px solid var(--ink-soft, #eee)', display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={guardar} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'GUARDANDO...' : `PAGAR ${fmtMXN(parseFloat(monto) || 0)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================
// Modal: Ver Detalle de Orden
// ===========================================================
function VerOrdenModal({ orden, onClose }) {
  const saldoPendiente = Math.max(0, (orden.monto_real || 0) - (orden.monto_entregado || 0));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card compras-modal" style={{ maxWidth: 800, width: '95%' }} onClick={e => e.stopPropagation()}>
        <header style={{ padding: 14, borderBottom: '1px solid var(--ink-soft, #eee)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>ORDEN DE COMPRA</div>
              <h3 style={{ margin: '4px 0 0 0' }}>{orden.proveedor_nombre}</h3>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {fmtDate(orden.fecha)} · {orden.estado} · {orden.metodo_pago}
                {orden.comprador_nombre && ` · 👤 ${orden.comprador_nombre}`}
              </div>
            </div>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 18, padding: '4px 10px' }}>✕</button>
          </div>
        </header>
        <div style={{ padding: 14, overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
          <div style={{ background: 'var(--surface-2, #f5f5f5)', padding: 12, borderRadius: 6, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>ESTIMADO</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--f-mono)' }}>{fmtMXN(orden.monto_estimado)}</div>
              </div>
              {orden.monto_entregado > 0 && (
                <div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>ANTICIPO</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--f-mono)' }}>{fmtMXN(orden.monto_entregado)}</div>
                </div>
              )}
              {orden.estado !== 'BORRADOR' && orden.monto_real > 0 && (
                <div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>TOTAL REAL</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--f-mono)', color: '#10B981' }}>{fmtMXN(orden.monto_real)}</div>
                </div>
              )}
              {orden.estado === 'PENDIENTE_PAGO' && saldoPendiente > 0 && (
                <div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>POR PAGAR</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--f-mono)', color: '#F59E0B' }}>{fmtMXN(saldoPendiente)}</div>
                </div>
              )}
            </div>
            {orden.cxp_id && (
              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                📋 Vinculada a CxP. Ver módulo "Por Pagar/Cobrar".
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7, marginBottom: 8 }}>PRODUCTOS</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #f5f5f5)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>PRODUCTO</th>
                <th style={{ padding: 6 }}>UN</th>
                <th style={{ padding: 6, textAlign: 'right' }}>CANT EST</th>
                <th style={{ padding: 6, textAlign: 'right' }}>$/UN EST</th>
                {orden.estado !== 'BORRADOR' && <>
                  <th style={{ padding: 6, textAlign: 'right' }}>CANT REAL</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>$/UN REAL</th>
                </>}
                <th style={{ padding: 6, textAlign: 'right' }}>TOTAL</th>
                <th style={{ padding: 6 }}>CATEGORÍA</th>
              </tr>
            </thead>
            <tbody>
              {(orden.items || []).filter(it => {
                const cant = it.cantidad_real != null ? it.cantidad_real : it.cantidad_estimada;
                return Number(cant || 0) > 0;
              }).map(it => (
                <tr key={it.id} style={{ borderBottom: '1px dashed var(--line, #eee)' }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{it.producto}</td>
                  <td style={{ padding: 6 }}>{it.unidad}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{it.cantidad_estimada}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{fmtMXN(it.precio_estimado)}</td>
                  {orden.estado !== 'BORRADOR' && <>
                    <td style={{ padding: 6, textAlign: 'right' }}>{it.cantidad_real ?? '—'}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{it.precio_real != null ? fmtMXN(it.precio_real) : '—'}</td>
                  </>}
                  <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--f-mono)' }}>
                    {fmtMXN(it.total_real || it.total_estimado)}
                  </td>
                  <td style={{ padding: 6, fontSize: 10, opacity: 0.7 }}>{it.categoria_contable}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {orden.observaciones && (
            <div style={{ marginTop: 14, padding: 10, background: '#FEF3C7', borderRadius: 6, fontSize: 12 }}>
              <strong>Observaciones:</strong> {orden.observaciones}
            </div>
          )}
        </div>
        <footer style={{ padding: 12, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} style={{ width: '100%' }}>CERRAR</button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================
// Modal: GESTIONAR PAGO / ANTICIPO desde BORRADOR
// Permite modificar solo el anticipo sin tocar items, o ir a cerrar con CxP
// ===========================================================
function GestionarPagoModal({ orden, cajas, terceros, onClose, onSaved, onCerrarCxP }) {
  const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);

  const anticipoActual = Number(orden.monto_entregado || 0);
  const totalEstimado = Number(orden.monto_estimado || 0);

  const [modo, setModo] = useState(anticipoActual > 0 ? 'AJUSTAR' : 'ANTICIPO_PARCIAL');
  // AJUSTAR | ANTICIPO_PARCIAL | PAGO_COMPLETO | QUITAR_ANTICIPO | CERRAR_CXP
  const [monto, setMonto] = useState(anticipoActual > 0 ? String(anticipoActual) : '');
  const [cajaPago, setCajaPago] = useState(orden.caja_id || (cajasActivas[0]?.id || ''));
  const [metodo, setMetodo] = useState(orden.metodo_pago || 'EFECTIVO');
  const [saving, setSaving] = useState(false);

  const aplicar = async () => {
    if (modo === 'CERRAR_CXP') {
      onCerrarCxP(orden);
      return;
    }

    let nuevoMonto = 0;
    if (modo === 'PAGO_COMPLETO') {
      nuevoMonto = totalEstimado;
    } else if (modo === 'QUITAR_ANTICIPO') {
      nuevoMonto = 0;
    } else {
      nuevoMonto = parseFloat(monto || 0);
      if (isNaN(nuevoMonto) || nuevoMonto < 0) {
        alert('⚠️ Monto inválido');
        return;
      }
      if (nuevoMonto > totalEstimado) {
        if (!confirm(`⚠️ El monto (${fmtMXN(nuevoMonto)}) es MAYOR que el total estimado (${fmtMXN(totalEstimado)}).\n\n¿Continuar?`)) return;
      }
    }

    // Validar caja si vamos a entregar dinero
    if (nuevoMonto > 0 && !cajaPago) {
      alert('⚠️ Selecciona una caja');
      return;
    }

    setSaving(true);
    try {
      const tok = KBotAPI.token();
      // Llamar PUT con items actuales + nuevo anticipo
      const payload = {
        fecha: orden.fecha,
        proveedor_id: orden.proveedor_id || null,
        proveedor_nombre: orden.proveedor_nombre,
        comprador_nombre: orden.comprador_nombre,
        metodo_pago: nuevoMonto > 0 ? metodo : 'EFECTIVO',
        caja_id: nuevoMonto > 0 ? cajaPago : orden.caja_id,
        monto_entregado: nuevoMonto,
        observaciones: orden.observaciones,
        items: (orden.items || []).map(it => ({
          producto: it.producto,
          unidad: it.unidad,
          cantidad_estimada: it.cantidad_estimada,
          precio_estimado: it.precio_estimado,
          categoria_contable: it.categoria_contable
        }))
      };
      const r = await fetch(apiUrl + '/api/ordenes/' + orden.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');

      let msg = '✅ ';
      if (nuevoMonto === 0 && anticipoActual > 0) {
        msg += `Anticipo quitado. Se devolvieron ${fmtMXN(anticipoActual)} a la caja.`;
      } else if (nuevoMonto > 0 && anticipoActual === 0) {
        msg += `Anticipo de ${fmtMXN(nuevoMonto)} aplicado.`;
      } else if (nuevoMonto > anticipoActual) {
        msg += `Anticipo aumentado a ${fmtMXN(nuevoMonto)}. Se descontaron ${fmtMXN(nuevoMonto - anticipoActual)} adicionales de la caja.`;
      } else if (nuevoMonto < anticipoActual) {
        msg += `Anticipo reducido a ${fmtMXN(nuevoMonto)}. Se devolvieron ${fmtMXN(anticipoActual - nuevoMonto)} a la caja.`;
      } else {
        msg += `Anticipo actualizado.`;
      }
      alert(msg);
      onSaved();
    } catch (e) {
      alert('⚠️ ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop compras-modal-backdrop" onClick={onClose}>
      <div className="modal-card compras-modal" style={{ maxWidth: 560, width: '95%' }} onClick={e => e.stopPropagation()}>
        <header style={{ padding: 14, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.12em' }}>GESTIONAR PAGO</div>
          <h3 style={{ margin: '4px 0 0 0' }}>💰 {orden.proveedor_nombre}</h3>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>TOTAL ESTIMADO</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--f-mono)' }}>{fmtMXN(totalEstimado)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>ANTICIPO ACTUAL</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--f-mono)', color: anticipoActual > 0 ? '#10B981' : '#9CA3AF' }}>
                {anticipoActual > 0 ? fmtMXN(anticipoActual) : 'Sin anticipo'}
              </div>
            </div>
          </div>
        </header>

        <div style={{ padding: 16, overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, letterSpacing: '0.05em' }}>
            ¿QUÉ DESEAS HACER?
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* OPCIÓN 1: Ajustar anticipo (si tiene) o aplicar parcial */}
            <button
              onClick={() => setModo(anticipoActual > 0 ? 'AJUSTAR' : 'ANTICIPO_PARCIAL')}
              style={{
                background: (modo === 'AJUSTAR' || modo === 'ANTICIPO_PARCIAL') ? '#DBEAFE' : '#FFFFFF',
                color: '#1F2937',
                border: '2px solid ' + ((modo === 'AJUSTAR' || modo === 'ANTICIPO_PARCIAL') ? '#3B82F6' : '#E5E7EB'),
                padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                💵 {anticipoActual > 0 ? 'AJUSTAR ANTICIPO' : 'APLICAR ANTICIPO PARCIAL'}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                {anticipoActual > 0 ? `Cambiar el monto (actual: ${fmtMXN(anticipoActual)})` : 'Entregar dinero al chofer (parcial)'}
              </div>
            </button>

            {/* OPCIÓN 2: Pagar completo */}
            <button
              onClick={() => setModo('PAGO_COMPLETO')}
              style={{
                background: modo === 'PAGO_COMPLETO' ? '#FEE2E2' : '#FFFFFF',
                color: '#1F2937',
                border: '2px solid ' + (modo === 'PAGO_COMPLETO' ? '#DC2626' : '#E5E7EB'),
                padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                💸 PAGAR COMPLETO ({fmtMXN(totalEstimado)})
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                Anticipo = total estimado. Útil para transferencias completas.
              </div>
            </button>

            {/* OPCIÓN 3: Quitar anticipo (solo si tiene) */}
            {anticipoActual > 0 && (
              <button
                onClick={() => setModo('QUITAR_ANTICIPO')}
                style={{
                  background: modo === 'QUITAR_ANTICIPO' ? '#FEE2E2' : '#FFFFFF',
                  color: '#1F2937',
                  border: '2px solid ' + (modo === 'QUITAR_ANTICIPO' ? '#DC2626' : '#E5E7EB'),
                  padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  ❌ QUITAR ANTICIPO
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  Devolver {fmtMXN(anticipoActual)} a la caja. La orden queda en BORRADOR sin pago.
                </div>
              </button>
            )}

            {/* OPCIÓN 4: Cerrar con CxP (crédito) */}
            <button
              onClick={() => setModo('CERRAR_CXP')}
              style={{
                background: modo === 'CERRAR_CXP' ? '#FEF3C7' : '#FFFFFF',
                color: '#1F2937',
                border: '2px solid ' + (modo === 'CERRAR_CXP' ? '#F59E0B' : '#E5E7EB'),
                padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                📋 CERRAR CON CRÉDITO (CxP)
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                Te lleva a capturar precios reales y crear una cuenta por pagar.
              </div>
            </button>
          </div>

          {/* Campos adicionales según el modo */}
          {(modo === 'AJUSTAR' || modo === 'ANTICIPO_PARCIAL' || modo === 'PAGO_COMPLETO') && (
            <div style={{ marginTop: 16, padding: 12, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'grid', gridTemplateColumns: modo === 'PAGO_COMPLETO' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
                {modo !== 'PAGO_COMPLETO' && (
                  <div className="field">
                    <div className="field-label"><span>MONTO</span></div>
                    <input
                      type="number"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      placeholder="0.00"
                      className="text-input"
                      step="0.01"
                    />
                  </div>
                )}
                <div className="field">
                  <div className="field-label"><span>CAJA</span></div>
                  <select value={cajaPago} onChange={e => setCajaPago(e.target.value)} className="text-input">
                    {cajasActivas.map(c => <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="field-label"><span>MÉTODO</span></div>
                  <select value={metodo} onChange={e => setMetodo(e.target.value)} className="text-input">
                    <option>EFECTIVO</option>
                    <option>TRANSFERENCIA</option>
                    <option>TARJETA</option>
                    <option>CHEQUE</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {modo === 'CERRAR_CXP' && (
            <div style={{ marginTop: 16, padding: 10, background: '#FEF3C7', color: '#92400E', borderRadius: 6, fontSize: 11 }}>
              ℹ️ Al continuar, te llevamos al modal de "Cerrar con precios reales" donde podrás capturar los precios finales y crear la CxP automáticamente.
            </div>
          )}
        </div>

        <footer style={{ padding: 14, borderTop: '1px solid #E5E7EB', display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: '10px 14px', background: '#FFFFFF', color: '#374151',
            border: '1px solid #D1D5DB', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer'
          }}>CANCELAR</button>
          <button onClick={aplicar} disabled={saving} style={{
            flex: 2, padding: '10px 14px',
            background: saving ? '#9CA3AF' : (modo === 'CERRAR_CXP' ? '#F59E0B' : '#E63946'),
            color: '#FFFFFF', border: 'none', borderRadius: 6,
            fontWeight: 800, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            {saving ? 'GUARDANDO...' :
             modo === 'CERRAR_CXP' ? 'IR A CERRAR CON CRÉDITO →' :
             modo === 'QUITAR_ANTICIPO' ? `DEVOLVER ${fmtMXN(anticipoActual)}` :
             modo === 'PAGO_COMPLETO' ? `PAGAR ${fmtMXN(totalEstimado)}` :
             'APLICAR'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================
// Modal PDF de órdenes seleccionadas
// ===========================================================
function PDFOrdenesModal({ ordenes, onClose }) {
  // F3_PRINT_PDF_V3 — mover #pdf-content al body directamente antes de imprimir
  const imprimir = () => {
    const pdfContent = document.getElementById('pdf-content');
    if (!pdfContent) { window.print(); return; }
    const originalParent = pdfContent.parentNode;
    const originalNextSibling = pdfContent.nextSibling;
    // Mover al body como primer hijo
    document.body.insertBefore(pdfContent, document.body.firstChild);
    document.body.classList.add('kbomx-print-active');

    const cleanup = () => {
      document.body.classList.remove('kbomx-print-active');
      // Restaurar #pdf-content a su lugar original
      if (originalParent) {
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(pdfContent, originalNextSibling);
        } else {
          originalParent.appendChild(pdfContent);
        }
      }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
  };

  const estadoBadge = (estado, montoEntregado, montoReal) => {
    if (estado === 'PAGADA') return { color: '#10B981', label: '✅ PAGADA' };
    if (estado === 'PENDIENTE_PAGO') {
      return montoEntregado > 0
        ? { color: '#F59E0B', label: `💰 ANTICIPO ${fmtMXN(montoEntregado)} · DEBE ${fmtMXN(montoReal - montoEntregado)}` }
        : { color: '#F59E0B', label: `💰 POR PAGAR ${fmtMXN(montoReal)}` };
    }
    if (estado === 'BORRADOR') return { color: '#6B7280', label: '📝 BORRADOR' };
    return { color: '#9CA3AF', label: estado };
  };

  return (
    <div className="modal-backdrop pdf-modal-backdrop" onClick={onClose}>
      <div className="modal-card pdf-modal-card compras-modal" onClick={e => e.stopPropagation()} style={{
        maxWidth: 900, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
      }}>
        <header className="pdf-modal-header" style={{ padding: 14, borderBottom: '1px solid var(--ink-soft, #eee)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.12em' }}>EXPORTAR PDF</div>
            <h3 style={{ margin: '4px 0 0 0' }}>📄 {ordenes.length} ORDEN{ordenes.length !== 1 ? 'ES' : ''} DE COMPRA</h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={imprimir}>
              🖨 IMPRIMIR / GUARDAR PDF
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 18, padding: '4px 10px' }}>✕</button>
          </div>
        </header>
        <div style={{ padding: 24, overflow: 'auto', background: '#f5f5f5' }}>
          <div id="pdf-content" style={{ background: 'white', padding: 30, maxWidth: 800, margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            {ordenes.map((o, idx) => {
              const badge = estadoBadge(o.estado, o.monto_entregado || 0, o.monto_real || o.monto_estimado);
              const saldo = (o.monto_real || 0) - (o.monto_entregado || 0);
              return (
                <div key={o.id} style={{ marginBottom: idx < ordenes.length - 1 ? 40 : 0, pageBreakAfter: idx < ordenes.length - 1 ? 'always' : 'auto' }} className="pdf-page">
                  {/* Encabezado */}
                  <div style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.1em' }}>K-BOTANAS</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>ORDEN DE COMPRA</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                          #{o.id.split('-').slice(-1)[0]} · {fmtDate(o.fecha)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: badge.color + '22', color: badge.color, padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 700, border: `2px solid ${badge.color}` }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14, fontSize: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: '0.1em' }}>PROVEEDOR</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{o.proveedor_nombre}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: '0.1em' }}>COMPRADOR / CHOFER</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{o.comprador_nombre || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: '0.1em' }}>MÉTODO DE PAGO</div>
                      <div style={{ fontSize: 13 }}>{o.metodo_pago} · {o.caja_nombre || ''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: '0.1em' }}>ESTADO</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.estado}</div>
                    </div>
                  </div>

                  {/* Productos */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 14 }}>
                    <thead>
                      <tr style={{ background: '#000', color: 'white' }}>
                        <th style={{ padding: 8, textAlign: 'left' }}>#</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>PRODUCTO</th>
                        <th style={{ padding: 8, textAlign: 'center' }}>UN</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>CANT</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>PRECIO/UN</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(o.items || []).filter(it => {
                        const cant = it.cantidad_real != null ? it.cantidad_real : it.cantidad_estimada;
                        return Number(cant || 0) > 0;
                      }).map((it, i) => {
                        const cant = it.cantidad_real != null ? it.cantidad_real : it.cantidad_estimada;
                        const precio = it.precio_real != null ? it.precio_real : it.precio_estimado;
                        const total = cant * precio;
                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: 8 }}>{i + 1}</td>
                            <td style={{ padding: 8, fontWeight: 600 }}>{it.producto}</td>
                            <td style={{ padding: 8, textAlign: 'center' }}>{it.unidad}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{cant}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{fmtMXN(precio)}</td>
                            <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--f-mono, monospace)' }}>{fmtMXN(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Totales */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '50%', fontSize: 12 }}>
                      {o.monto_estimado > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px' }}>
                          <span>Estimado:</span>
                          <span style={{ fontFamily: 'monospace' }}>{fmtMXN(o.monto_estimado)}</span>
                        </div>
                      )}
                      {o.monto_real > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#f0fdf4' }}>
                          <span style={{ fontWeight: 700 }}>TOTAL REAL:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtMXN(o.monto_real)}</span>
                        </div>
                      )}
                      {o.monto_entregado > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#fef3c7' }}>
                          <span>Anticipo entregado:</span>
                          <span style={{ fontFamily: 'monospace' }}>{fmtMXN(o.monto_entregado)}</span>
                        </div>
                      )}
                      {o.estado === 'PENDIENTE_PAGO' && saldo > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#000', color: 'white', marginTop: 4 }}>
                          <span style={{ fontWeight: 800 }}>POR PAGAR:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{fmtMXN(saldo)}</span>
                        </div>
                      )}
                      {o.estado === 'PAGADA' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#10b981', color: 'white', marginTop: 4 }}>
                          <span style={{ fontWeight: 800 }}>PAGADO COMPLETO ✓</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {o.observaciones && (
                    <div style={{ marginTop: 14, padding: 10, background: '#FEF3C7', borderRadius: 6, fontSize: 11 }}>
                      <strong>Observaciones:</strong> {o.observaciones}
                    </div>
                  )}

                  {/* Firmas */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 50 }}>
                    <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: 6, fontSize: 11 }}>
                      <div style={{ fontWeight: 700 }}>ENTREGADO POR</div>
                      <div style={{ opacity: 0.6, marginTop: 2 }}>Comprador / Chofer</div>
                    </div>
                    <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: 6, fontSize: 11 }}>
                      <div style={{ fontWeight: 700 }}>RECIBIDO POR</div>
                      <div style={{ opacity: 0.6, marginTop: 2 }}>Proveedor</div>
                    </div>
                  </div>

                  {/* Pie */}
                  <div style={{ marginTop: 30, fontSize: 9, opacity: 0.5, textAlign: 'center', borderTop: '1px dashed #ccc', paddingTop: 8 }}>
                    K-BOTANAS · Orden #{o.id.split('-').slice(-1)[0]} · Generado {new Date().toLocaleString('es-MX')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* F3_PRINT_PDF_V3 — print CSS v3: simple, mueve #pdf-content al body directamente */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
        }
        @media print {
          /* Cuando estamos imprimiendo, #pdf-content fue movido a ser hijo directo del body.
             Ocultamos a todos sus hermanos para que solo se imprima el contenido del PDF. */
          body.kbomx-print-active > *:not(#pdf-content) {
            display: none !important;
          }
          body.kbomx-print-active {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body.kbomx-print-active #pdf-content {
            display: block !important;
            position: static !important;
            background: white !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            overflow: visible !important;
          }
          body.kbomx-print-active #pdf-content * {
            visibility: visible !important;
          }
          /* Cada orden de compra en página separada, sin partir a la mitad */
          body.kbomx-print-active .pdf-page {
            page-break-after: always;
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 0 !important;
          }
          body.kbomx-print-active .pdf-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}

// ===========================================================
// Generador de Excel para órdenes (usa SheetJS / XLSX)
// ===========================================================
function generarExcelOrdenes(ordenes) {
  const wb = XLSX.utils.book_new();

  // ───────────────────────────────────
  // HOJA 1: RESUMEN (sólo si hay 2 o más)
  // ───────────────────────────────────
  if (ordenes.length > 1) {
    const filas = [
      ['K-BOTANAS · RESUMEN DE ÓRDENES DE COMPRA'],
      [`Generado: ${new Date().toLocaleString('es-MX')}`],
      [`Total órdenes: ${ordenes.length}`],
      [],
      ['#', 'FECHA', 'PROVEEDOR', 'COMPRADOR', 'ESTADO', 'MÉTODO', 'CAJA', 'ESTIMADO', 'ANTICIPO', 'TOTAL REAL', 'POR PAGAR']
    ];

    let totEst = 0, totAnt = 0, totReal = 0, totSaldo = 0;
    ordenes.forEach(o => {
      const est = o.monto_estimado || 0;
      const ant = o.monto_entregado || 0;
      const real = o.monto_real || 0;
      const saldo = o.estado === 'PENDIENTE_PAGO' ? Math.max(0, real - ant) : 0;
      totEst += est; totAnt += ant; totReal += real; totSaldo += saldo;
      filas.push([
        o.id.split('-').slice(-1)[0],
        o.fecha || '',
        o.proveedor_nombre || '',
        o.comprador_nombre || '',
        o.estado || '',
        o.metodo_pago || '',
        o.caja_nombre || '',
        est, ant, real, saldo
      ]);
    });
    filas.push([]);
    filas.push(['', '', '', '', '', '', 'TOTALES:', totEst, totAnt, totReal, totSaldo]);

    const ws = XLSX.utils.aoa_to_sheet(filas);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 16 },
      { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    // Merge título
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } }
    ];

    // Formato moneda para columnas 7-10 (índice 0-based)
    const totalRows = filas.length;
    for (let R = 5; R < totalRows; R++) {
      for (let C = 7; C <= 10; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === 'number') {
          ws[addr].z = '"$"#,##0.00';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'RESUMEN');
  }

  // ───────────────────────────────────
  // 1 HOJA POR ORDEN
  // ───────────────────────────────────
  const nombresUsados = new Set();
  ordenes.forEach((o, idx) => {
    const ordenNum = o.id.split('-').slice(-1)[0];
    const provLimpio = (o.proveedor_nombre || 'ORDEN').replace(/[\\\/\?\*\[\]:]/g, '_');
    let sheetName = `${provLimpio.slice(0, 22)} ${ordenNum}`.slice(0, 31);
    // Evitar duplicados
    let suffix = 1;
    while (nombresUsados.has(sheetName)) {
      sheetName = `${provLimpio.slice(0, 18)} ${ordenNum} (${suffix})`.slice(0, 31);
      suffix++;
    }
    nombresUsados.add(sheetName);

    const saldo = Math.max(0, (o.monto_real || 0) - (o.monto_entregado || 0));

    const filas = [
      ['K-BOTANAS · ORDEN DE COMPRA'],
      [],
      ['# Orden:', ordenNum],
      ['Fecha:', o.fecha || ''],
      ['Estado:', o.estado || ''],
      [],
      ['Proveedor:', o.proveedor_nombre || ''],
      ['Comprador / Chofer:', o.comprador_nombre || '—'],
      ['Método de pago:', o.metodo_pago || ''],
      ['Caja:', o.caja_nombre || ''],
      [],
      ['PRODUCTOS:'],
      ['#', 'PRODUCTO', 'UN', 'CANT EST', 'PRECIO EST', 'CANT REAL', 'PRECIO REAL', 'TOTAL', 'CATEGORÍA']
    ];

    let totalCalculado = 0;
    (o.items || []).filter(it => {
      const cant = it.cantidad_real != null ? it.cantidad_real : it.cantidad_estimada;
      return Number(cant || 0) > 0;
    }).forEach((it, i) => {
      const cantE = it.cantidad_estimada || 0;
      const precioE = it.precio_estimado || 0;
      const cantR = it.cantidad_real != null ? it.cantidad_real : '';
      const precioR = it.precio_real != null ? it.precio_real : '';
      const total = it.total_real != null
        ? it.total_real
        : (it.cantidad_real != null && it.precio_real != null
            ? it.cantidad_real * it.precio_real
            : cantE * precioE);
      totalCalculado += total;
      filas.push([
        i + 1,
        it.producto || '',
        it.unidad || '',
        cantE, precioE,
        cantR, precioR,
        total,
        it.categoria_contable || ''
      ]);
    });

    filas.push([]);
    filas.push(['', '', '', '', '', '', 'ESTIMADO:', o.monto_estimado || 0]);
    if (o.monto_real > 0) filas.push(['', '', '', '', '', '', 'TOTAL REAL:', o.monto_real]);
    if (o.monto_entregado > 0) filas.push(['', '', '', '', '', '', 'ANTICIPO ENTREGADO:', o.monto_entregado]);
    if (o.estado === 'PENDIENTE_PAGO' && saldo > 0) {
      filas.push(['', '', '', '', '', '', 'POR PAGAR:', saldo]);
    }
    if (o.estado === 'PAGADA') {
      filas.push(['', '', '', '', '', '', 'PAGADO COMPLETO ✓', '']);
    }

    if (o.observaciones) {
      filas.push([]);
      filas.push(['Observaciones:', o.observaciones]);
    }

    filas.push([]);
    filas.push([`Generado: ${new Date().toLocaleString('es-MX')}`]);

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 6 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 22 }
    ];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

    // Formato moneda para columnas de precio y total
    const totalRows = filas.length;
    for (let R = 13; R < totalRows; R++) {
      for (let C of [4, 6, 7]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === 'number') {
          ws[addr].z = '"$"#,##0.00';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ───────────────────────────────────
  // Descargar archivo
  // ───────────────────────────────────
  const hoy = new Date().toISOString().slice(0, 10);
  const filename = ordenes.length === 1
    ? `Orden_${(ordenes[0].proveedor_nombre || 'Compra').replace(/\s+/g, '_').replace(/[\\\/\?\*\[\]:]/g, '')}_${ordenes[0].id.split('-').slice(-1)[0]}.xlsx`
    : `Ordenes_Compra_${hoy}.xlsx`;

  XLSX.writeFile(wb, filename);
}
