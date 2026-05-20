// ============================================================================
// K-BOTANAS · comisiones-mensuales-tab.jsx · v2 limpio
// ============================================================================
// Sub-tab "📅 Comisiones Mensuales" para NominaView.
// Solo vendedores ruta (depto VENTAS, tipo VENDEDOR). Captura manual.
//
// Usa window.KBotAPI.token() (patrón canónico) — sin discovery custom.
// ============================================================================

// ----- Helpers de auth (mismo patrón que apiNom en nomina-view.jsx) ----------
const _cmtToken = () => (window.KBotAPI && window.KBotAPI.token && window.KBotAPI.token()) || '';

const _cmtApi = async (path, opts = {}) => {
  const tok = _cmtToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
  return data;
};

// Toast no recursivo: si la app expone un toast global lo usa (siempre que no sea esta misma función)
function _cmtNotify(msg, tipo) {
  if (typeof window.toast === 'function' && window.toast !== _cmtNotify) return window.toast(msg, tipo);
  if (typeof window.notify === 'function' && window.notify !== _cmtNotify) return window.notify(msg, tipo);
  alert(msg);
}

function ComisionesMensualesTab() {
  const [periodos, setPeriodos] = React.useState([]);
  const [periodoActivo, setPeriodoActivo] = React.useState(null);
  const [detalle, setDetalle] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [showNewModal, setShowNewModal] = React.useState(false);
  const [showCloseModal, setShowCloseModal] = React.useState(false);
  const [cajas, setCajas] = React.useState([]);
  const [cats, setCats] = React.useState([]);

  React.useEffect(() => { cargarPeriodos(); cargarCajasYCats(); }, []);
  React.useEffect(() => { if (periodoActivo) cargarDetalle(periodoActivo); }, [periodoActivo]);

  async function cargarPeriodos() {
    try {
      const data = await _cmtApi('/api/comisiones-mensuales/periodos');
      const arr = Array.isArray(data) ? data : [];
      setPeriodos(arr);
      if (arr.length && !periodoActivo) setPeriodoActivo(arr[0].id);
    } catch (e) {
      _cmtNotify('Error cargando periodos: ' + e.message, 'error');
      setPeriodos([]);
    }
  }

  async function cargarDetalle(id) {
    setLoading(true);
    try {
      const data = await _cmtApi(`/api/comisiones-mensuales/periodos/${id}`);
      if (data && !Array.isArray(data.pagos)) data.pagos = [];
      setDetalle(data);
    } catch (e) {
      _cmtNotify('Error: ' + e.message, 'error');
      setDetalle(null);
    }
    setLoading(false);
  }

  async function cargarCajasYCats() {
    try {
      // La app expone cajas/cats; los endpoints retornan arrays.
      const [cajasData, catsData] = await Promise.all([
        _cmtApi('/api/cajas').catch(() => []),
        _cmtApi('/api/cats').catch(() => []),
      ]);
      setCajas(Array.isArray(cajasData)
        ? cajasData.filter(c => !c.archivada && !c.deleted)
        : []);
      setCats(Array.isArray(catsData)
        ? catsData.filter(c => c.tipo === 'GASTO' && !c.deleted &&
                               (c.nombre || '').includes('COMISIONES'))
        : []);
    } catch (e) { console.warn('cajas/cats no disponibles', e); }
  }

  async function crearPeriodo(year_month) {
    try {
      const data = await _cmtApi('/api/comisiones-mensuales/periodos', {
        method: 'POST',
        body: JSON.stringify({ year_month }),
      });
      _cmtNotify(`✅ Periodo ${year_month} creado con ${data.empleados_precargados} vendedores`, 'success');
      setShowNewModal(false);
      await cargarPeriodos();
      setPeriodoActivo(data.id);
    } catch (e) { _cmtNotify('Error: ' + e.message, 'error'); }
  }

  async function actualizarPago(pagoId, campo, valor) {
    try {
      await _cmtApi(`/api/comisiones-mensuales/pagos/${pagoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      });
      await cargarDetalle(periodoActivo);
    } catch (e) { _cmtNotify('Error: ' + e.message, 'error'); }
  }

  async function cerrarPeriodo(caja_id, categoria_id, observaciones) {
    try {
      const data = await _cmtApi(`/api/comisiones-mensuales/periodos/${periodoActivo}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({ caja_id, categoria_id, observaciones }),
      });
      _cmtNotify(`✅ Mes ${data.year_month} cerrado · GASTO ${data.mov_id} por $${data.total}`, 'success');
      setShowCloseModal(false);
      await cargarPeriodos();
      await cargarDetalle(periodoActivo);
    } catch (e) { _cmtNotify('Error: ' + e.message, 'error'); }
  }

  const fmt = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cerrado = detalle?.estado === 'cerrado';

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: '#C2185B' }}>📅 Comisiones Mensuales</h2>
          <p style={{ margin: '4px 0 0', color: '#777', fontSize: 13 }}>
            Solo vendedores ruta · captura manual mensual · genera GASTO al cerrar
          </p>
        </div>
        <button onClick={() => setShowNewModal(true)} style={btnPrimary}>
          + Nuevo periodo mensual
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8, fontWeight: 600 }}>Periodo:</label>
        <select
          value={periodoActivo || ''}
          onChange={e => setPeriodoActivo(parseInt(e.target.value, 10))}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}>
          {periodos.length === 0 && <option value="">— Sin periodos —</option>}
          {periodos.map(p => (
            <option key={p.id} value={p.id}>
              {p.year_month} · {p.estado === 'cerrado' ? '🔒 cerrado' : '✏️ abierto'} · {fmt(p.total)}
            </option>
          ))}
        </select>
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div>}
      {!loading && detalle && (
        <div>
          <div style={{ overflowX: 'auto', border: '1px solid #e0e0e0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#C2185B', color: '#fff' }}>
                  <th style={th}>VENDEDOR</th>
                  <th style={th}>VENTAS DEL MES</th>
                  <th style={th}>% APLICADO</th>
                  <th style={th}>BONO BASE</th>
                  <th style={th}>COMISIONES MANUALES</th>
                  <th style={th}>OBSERVACIONES</th>
                  <th style={{ ...th, background: '#2874A6' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {detalle.pagos.length === 0 && (
                  <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                    No hay vendedores en este periodo.
                  </td></tr>
                )}
                {detalle.pagos.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? '#FFF2CC' : '#fff' }}>
                    <td style={td}>{p.empleado_nombre}</td>
                    <td style={tdR}>{fmt(p.ventas_mes)}</td>
                    <td style={tdR}>
                      <input type="number" step="0.01" disabled={cerrado}
                        defaultValue={p.porcentaje || ''}
                        onBlur={e => {
                          const v = e.target.value === '' ? null : parseFloat(e.target.value);
                          actualizarPago(p.id, 'porcentaje', v);
                        }}
                        style={inputCell} />
                    </td>
                    <td style={tdR}>
                      <input type="number" step="0.01" disabled={cerrado}
                        defaultValue={p.bono_base || 0}
                        onBlur={e => actualizarPago(p.id, 'bono_base', parseFloat(e.target.value) || 0)}
                        style={inputCell} />
                    </td>
                    <td style={tdR}>
                      <input type="number" step="0.01" disabled={cerrado}
                        defaultValue={p.comisiones_manuales || 0}
                        onBlur={e => actualizarPago(p.id, 'comisiones_manuales', parseFloat(e.target.value) || 0)}
                        style={inputCell} />
                    </td>
                    <td style={td}>
                      <input type="text" disabled={cerrado}
                        defaultValue={p.observaciones || ''}
                        onBlur={e => actualizarPago(p.id, 'observaciones', e.target.value)}
                        style={{ ...inputCell, textAlign: 'left' }} />
                    </td>
                    <td style={{ ...tdR, background: '#5DADE2', color: '#fff', fontWeight: 700 }}>
                      {fmt(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#000', color: '#fff', fontWeight: 700 }}>
                  <td style={td} colSpan="6">TOTAL DEL MES</td>
                  <td style={{ ...tdR, background: '#2874A6' }}>{fmt(detalle.total || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            {!cerrado && (
              <button
                disabled={!detalle.total || detalle.total <= 0}
                onClick={() => setShowCloseModal(true)}
                style={btnDanger}>
                🔒 Cerrar mes y pagar
              </button>
            )}
            {cerrado && (
              <div style={{ color: '#27AE60', fontWeight: 600 }}>
                ✅ Cerrado el {detalle.cerrado_at} · GASTO mov {detalle.mov_id}
              </div>
            )}
          </div>
        </div>
      )}

      {showNewModal && <ModalNuevoPeriodo onClose={() => setShowNewModal(false)} onCreate={crearPeriodo} />}
      {showCloseModal && detalle && (
        <ModalCerrarPeriodo
          cajas={cajas} cats={cats}
          total={detalle.total} yearMonth={detalle.year_month}
          onClose={() => setShowCloseModal(false)}
          onConfirm={cerrarPeriodo} />
      )}
    </div>
  );
}

function ModalNuevoPeriodo({ onClose, onCreate }) {
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [ym, setYm] = React.useState(defaultYM);

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#C2185B' }}>📅 Nuevo periodo mensual</h3>
        <p style={{ color: '#666', fontSize: 13 }}>
          Se crearán filas para los vendedores ruta activos con las ventas del mes pre-calculadas.
        </p>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Mes (YYYY-MM):</label>
        <input type="month" value={ym} onChange={e => setYm(e.target.value)}
          style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 15 }} />
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={() => onCreate(ym)} style={btnPrimary}>Crear</button>
        </div>
      </div>
    </div>
  );
}

function ModalCerrarPeriodo({ cajas, cats, total, yearMonth, onClose, onConfirm }) {
  const [cajaId, setCajaId] = React.useState(cajas[0]?.id || '');
  const [catId, setCatId]   = React.useState(cats[0]?.id || '');
  const [obs, setObs]       = React.useState('');

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#C2185B' }}>🔒 Cerrar mes {yearMonth}</h3>
        <p style={{ color: '#666', fontSize: 13 }}>
          Se generará un movimiento <strong>GASTO de ${(Number(total) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> en
          la caja y categoría seleccionadas. Esta acción es <strong>irreversible</strong>.
        </p>

        <label style={lbl}>Caja:</label>
        <select value={cajaId} onChange={e => setCajaId(e.target.value)} style={selectStyle}>
          {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <label style={lbl}>Categoría GASTO:</label>
        <select value={catId} onChange={e => setCatId(e.target.value)} style={selectStyle}>
          {cats.length === 0 && <option value="">— Sin categorías de comisiones —</option>}
          {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <label style={lbl}>Observaciones (opcional):</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)}
          style={{ ...selectStyle, minHeight: 60, resize: 'vertical' }} />

        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={() => onConfirm(cajaId, catId, obs)} disabled={!cajaId || !catId} style={btnDanger}>
            🔒 Cerrar y pagar
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Estilos inline ------------------------------------------------------
const btnPrimary   = { background: '#C2185B', color: '#fff', border: 'none', padding: '10px 18px',
                       borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSecondary = { background: '#ddd', color: '#333', border: 'none', padding: '10px 18px',
                       borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnDanger    = { background: '#E74C3C', color: '#fff', border: 'none', padding: '10px 18px',
                       borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const th  = { padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 };
const td  = { padding: '8px', borderBottom: '1px solid #f0f0f0' };
const tdR = { ...td, textAlign: 'right' };
const inputCell = { width: '100%', border: '1px solid #ddd', borderRadius: 4, padding: 6, fontSize: 13, textAlign: 'right' };
const selectStyle = { width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, marginBottom: 8 };
const lbl = { display: 'block', marginTop: 12, marginBottom: 4, fontWeight: 600, fontSize: 13 };
const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)',
                       display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox     = { background: '#fff', borderRadius: 10, padding: 24, width: '90%', maxWidth: 500,
                       boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };

// Registro global
if (typeof window !== 'undefined') {
  window.ComisionesMensualesTab = ComisionesMensualesTab;
}
