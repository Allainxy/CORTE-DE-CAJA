// cxp-view.jsx — Cuentas por Pagar y Cobrar
// Maneja ambas direcciones (PAGAR y COBRAR) con un solo componente.

const CxpView = ({ cajas, cats, groups, user, saldoCaja, refreshAll }) => {
  const [direccion, setDireccion] = useState('PAGAR'); // PAGAR | COBRAR
  const [estado, setEstado] = useState('all');
  const [terceroFilter, setTerceroFilter] = useState('all');
  const [cuentas, setCuentas] = useState([]);
  const [terceros, setTerceros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [verDetalle, setVerDetalle] = useState(null);
  const [abonandoA, setAbonandoA] = useState(null);
  const [verTerceros, setVerTerceros] = useState(false);

  const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
  const tok = KBotAPI.token();

  const cargar = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ direccion });
      if (estado !== 'all') params.set('estado', estado);
      if (terceroFilter !== 'all') params.set('tercero_id', terceroFilter);
      const r = await fetch(apiUrl + '/api/cxp?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setCuentas(data.cxp || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const cargarTerceros = async () => {
    try {
      const tipoT = (direccion === 'PAGAR') ? 'PROVEEDOR' : 'CLIENTE';
      const r = await fetch(apiUrl + '/api/terceros?tipo=' + tipoT, {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setTerceros(data.terceros || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargar(); cargarTerceros(); }, [direccion, estado, terceroFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const activas = cuentas.filter(c => c.estado !== 'CANCELADA' && c.estado !== 'PAGADA');
    const totalSaldo = activas.reduce((s, c) => s + (c.saldo || 0), 0);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vencidas = activas.filter(c => c.fecha_vencimiento && new Date(c.fecha_vencimiento + 'T12:00:00') < hoy);
    const proximas = activas.filter(c => c.dias_para_vencer >= 0 && c.dias_para_vencer <= 7);
    const pagadas = cuentas.filter(c => c.estado === 'PAGADA').length;
    return { totalSaldo, count: activas.length, vencidas: vencidas.length, proximas: proximas.length, pagadas };
  }, [cuentas]);

  const dirLabel = direccion === 'PAGAR' ? 'POR PAGAR' : 'POR COBRAR';
  const dirVerbo = direccion === 'PAGAR' ? 'PAGO' : 'COBRO';
  const colorPrimario = direccion === 'PAGAR' ? 'var(--red, #E63946)' : 'var(--green, #2EC27E)';

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CONTROL FINANCIERO</div>
          <h1 className="view-title">CUENTAS {dirLabel}</h1>
        </div>
        <div className="head-actions">
          <button className="btn-ghost" onClick={() => setVerTerceros(true)} style={{ fontSize: 12 }}>
            👥 {direccion === 'PAGAR' ? 'PROVEEDORES' : 'CLIENTES'}
          </button>
          {user?.rol !== 'consulta' && (
            <button className="btn-primary" onClick={() => setCreando(true)}>
              + NUEVA CUENTA
            </button>
          )}
        </div>
      </header>

      {/* Switch dirección */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, background: 'var(--bg-2, #fff8f0)', borderRadius: 10, width: 'fit-content' }}>
        {[
          { id: 'PAGAR', label: '⬇️ POR PAGAR (Yo debo)', color: 'var(--red, #E63946)' },
          { id: 'COBRAR', label: '⬆️ POR COBRAR (Me deben)', color: 'var(--green, #2EC27E)' }
        ].map(d => (
          <button
            key={d.id}
            onClick={() => setDireccion(d.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 8,
              background: direccion === d.id ? d.color : 'transparent',
              color: direccion === d.id ? '#fff' : 'var(--ink, #1F2937)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        <BotanaCard style={{ padding: 12, borderLeft: `4px solid ${colorPrimario}` }}>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 700 }}>SALDO TOTAL {dirLabel}</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: colorPrimario }}>{fmtMXN(kpis.totalSaldo)}</div>
        </BotanaCard>
        <BotanaCard style={{ padding: 12 }}>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 700 }}>CUENTAS ACTIVAS</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.count}</div>
        </BotanaCard>
        <BotanaCard style={{ padding: 12, borderLeft: '4px solid var(--red, #E63946)' }}>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 700 }}>🔴 VENCIDAS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red, #E63946)' }}>{kpis.vencidas}</div>
        </BotanaCard>
        <BotanaCard style={{ padding: 12, borderLeft: '4px solid var(--amber, #F59E0B)' }}>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 700 }}>🟡 PRÓX. 7 DÍAS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber, #F59E0B)' }}>{kpis.proximas}</div>
        </BotanaCard>
        <BotanaCard style={{ padding: 12, borderLeft: '4px solid var(--green, #2EC27E)' }}>
          <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 700 }}>✅ {direccion === 'PAGAR' ? 'PAGADAS' : 'COBRADAS'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green, #2EC27E)' }}>{kpis.pagadas}</div>
        </BotanaCard>
      </div>

      {/* Filtros */}
      <BotanaCard style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>ESTADO</div>
            <select className="text-input" value={estado} onChange={e => setEstado(e.target.value)} style={{ fontSize: 12 }}>
              <option value="all">Todos</option>
              <option value="PENDIENTE">📭 Pendientes</option>
              <option value="PARCIAL">🟡 Parciales</option>
              <option value="PAGADA">✅ {direccion === 'PAGAR' ? 'Pagadas' : 'Cobradas'}</option>
              <option value="CANCELADA">❌ Canceladas</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>
              {direccion === 'PAGAR' ? 'PROVEEDOR' : 'CLIENTE'}
            </div>
            <select className="text-input" value={terceroFilter} onChange={e => setTerceroFilter(e.target.value)} style={{ fontSize: 12 }}>
              <option value="all">Todos</option>
              {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
      </BotanaCard>

      {/* Lista */}
      {loading ? (
        <BotanaCard><div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div></BotanaCard>
      ) : cuentas.length === 0 ? (
        <BotanaCard>
          <div style={{ padding: 32, textAlign: 'center', opacity: 0.7 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{direccion === 'PAGAR' ? '💳' : '📈'}</div>
            <p style={{ marginBottom: 12 }}>No hay cuentas {dirLabel.toLowerCase()} con estos filtros</p>
            {user?.rol !== 'consulta' && (
              <button className="btn-primary" onClick={() => setCreando(true)}>+ CREAR PRIMERA CUENTA</button>
            )}
          </div>
        </BotanaCard>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {cuentas.map(cxp => <CuentaCard key={cxp.id} cxp={cxp} cats={cats} onAbonar={() => setAbonandoA(cxp)} onVer={() => setVerDetalle(cxp)} onEditar={() => setEditando(cxp)} user={user} />)}
        </div>
      )}

      {/* Modales */}
      {creando && (
        <CrearCxpModal
          direccion={direccion}
          terceros={terceros}
          cats={cats}
          cajas={cajas}
          onClose={() => setCreando(false)}
          onCreated={async () => {
            setCreando(false);
            await new Promise(r => setTimeout(r, 300));
            if (window.kbotFullResync) await window.kbotFullResync();
            cargar();
            cargarTerceros();
            if (refreshAll) refreshAll();
          }}
          onTerceroNuevo={cargarTerceros}
        />
      )}
      {editando && (
        <EditarCxpModal
          cxp={editando}
          cats={cats}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar(); }}
        />
      )}
      {abonandoA && (
        <AbonarModal
          cxp={abonandoA}
          cajas={cajas}
          saldoCaja={saldoCaja}
          onClose={() => setAbonandoA(null)}
          onSaved={async () => {
            setAbonandoA(null);
            await new Promise(r => setTimeout(r, 300));
            if (window.kbotFullResync) await window.kbotFullResync();
            cargar();
            if (refreshAll) refreshAll();
          }}
        />
      )}
      {verDetalle && (
        <DetalleCxpModal
          cxpId={verDetalle.id}
          cats={cats}
          cajas={cajas}
          onClose={() => setVerDetalle(null)}
          onChanged={() => cargar()}
          onAbonar={() => { setAbonandoA(verDetalle); setVerDetalle(null); }}
          user={user}
        />
      )}
      {verTerceros && (
        <TercerosModal
          tipo={direccion === 'PAGAR' ? 'PROVEEDOR' : 'CLIENTE'}
          cats={cats}
          onClose={() => { setVerTerceros(false); cargarTerceros(); }}
        />
      )}
    </div>
  );
};

// ===== Card de cuenta =====
function CuentaCard({ cxp, cats, onAbonar, onVer, onEditar, user }) {
  const cat = cats?.find(c => c.id === cxp.categoria_id);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = cxp.fecha_vencimiento ? new Date(cxp.fecha_vencimiento + 'T12:00:00') : null;
  const isVencida = vence && vence < hoy && cxp.saldo > 0.01;
  const dias = cxp.dias_para_vencer;

  let estadoLabel, estadoColor;
  if (cxp.estado === 'PAGADA') { estadoLabel = '✅ ' + (cxp.direccion === 'PAGAR' ? 'PAGADA' : 'COBRADA'); estadoColor = 'var(--green, #2EC27E)'; }
  else if (cxp.estado === 'CANCELADA') { estadoLabel = '❌ CANCELADA'; estadoColor = '#999'; }
  else if (isVencida) { estadoLabel = '🔴 VENCIDA hace ' + Math.abs(dias) + 'd'; estadoColor = 'var(--red, #E63946)'; }
  else if (dias !== undefined && dias <= 7 && dias >= 0) { estadoLabel = '🟡 Vence en ' + dias + 'd'; estadoColor = 'var(--amber, #F59E0B)'; }
  else if (cxp.estado === 'PARCIAL') { estadoLabel = '🟠 PARCIAL'; estadoColor = 'var(--amber, #F59E0B)'; }
  else { estadoLabel = '📭 PENDIENTE'; estadoColor = 'var(--ink, #1F2937)'; }

  const pct = cxp.monto_total > 0 ? Math.min(100, Math.round((cxp.pagado / cxp.monto_total) * 100)) : 0;

  return (
    <BotanaCard style={{ padding: 14, borderLeft: `4px solid ${estadoColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: estadoColor, marginBottom: 4 }}>{estadoLabel}</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
            {cxp.tercero_nombre || '(Sin tercero)'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            {cxp.concepto}
            {cat && (
              <span style={{ marginLeft: 8, padding: '1px 6px', background: cat.color + '22', color: cat.color, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                {cat.icon} {cat.nombre}
              </span>
            )}
          </div>
          {cxp.fecha_vencimiento && (
            <div style={{ fontSize: 11, opacity: 0.65 }}>📅 Vence: {cxp.fecha_vencimiento}</div>
          )}
        </div>

        <div style={{ flex: '0 0 200px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, opacity: 0.6 }}>SALDO</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: estadoColor, lineHeight: 1 }}>
            {fmtMXN(cxp.saldo || 0)}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
            de {fmtMXN(cxp.monto_total)}
          </div>
          {/* Barra de progreso */}
          <div style={{ height: 6, background: 'var(--bg-2, #fff8f0)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: estadoColor, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>{pct}% {cxp.direccion === 'PAGAR' ? 'pagado' : 'cobrado'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={onVer} style={{ fontSize: 11 }}>VER DETALLE</button>
        {user?.rol !== 'consulta' && cxp.saldo > 0.01 && cxp.estado !== 'CANCELADA' && (
          <button className="btn-primary" onClick={onAbonar} style={{ fontSize: 11, padding: '6px 14px' }}>
            + {cxp.direccion === 'PAGAR' ? 'ABONAR PAGO' : 'REGISTRAR COBRO'}
          </button>
        )}
      </div>
    </BotanaCard>
  );
}

// ===== Modal Crear =====
function CrearCxpModal({ direccion, terceros, cats, cajas, onClose, onCreated, onTerceroNuevo }) {
  const [tercero_id, setTerceroId] = useState('');
  const [tercero_nombre, setTerceroNombre] = useState('');
  const [creandoTercero, setCreandoTercero] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [categoria_id, setCategoria] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha_creacion, setFechaCreacion] = useState(new Date().toISOString().slice(0, 10));
  const [fecha_vencimiento, setFechaVenc] = useState('');
  const [observaciones, setObs] = useState('');
  const [conAbonoInicial, setConAbonoInicial] = useState(false);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoCaja, setAbonoCaja] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const tipoCat = direccion === 'PAGAR' ? 'GASTO' : 'INGRESO';
  const catsFiltered = (cats || []).filter(c => c.tipo === tipoCat && !c.deleted);

  // Si selecciono un tercero con categoría sugerida, autollenar
  useEffect(() => {
    if (!tercero_id) return;
    const t = terceros.find(x => x.id === tercero_id);
    if (t) {
      setTerceroNombre(t.nombre);
      if (t.categoria_id_sugerida && !categoria_id) {
        setCategoria(t.categoria_id_sugerida);
      }
    }
  }, [tercero_id]);

  const handleGuardar = async () => {
    setError('');
    if (!concepto.trim()) return setError('Concepto requerido');
    const m = parseFloat(monto);
    if (!m || m <= 0) return setError('Monto inválido');

    setGuardando(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const body = {
        direccion,
        tercero_id: tercero_id || null,
        tercero_nombre: tercero_id ? null : tercero_nombre.trim(),
        concepto: concepto.trim(),
        categoria_id: categoria_id || null,
        monto_total: m,
        fecha_creacion,
        fecha_vencimiento: fecha_vencimiento || null,
        observaciones
      };
      if (conAbonoInicial) {
        const ab = parseFloat(abonoMonto);
        if (!ab || ab <= 0) throw new Error('Monto del abono inválido');
        if (!abonoCaja) throw new Error('Selecciona caja para el abono');
        body.abono_inicial = { monto: ab, caja_id: abonoCaja, fecha: fecha_creacion };
      }
      const r = await fetch(apiUrl + '/api/cxp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
      onCreated();
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <header className="capture-head">
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>NUEVA CUENTA</div>
            <h3 style={{ margin: '4px 0' }}>{direccion === 'PAGAR' ? '⬇️ POR PAGAR' : '⬆️ POR COBRAR'}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Tercero */}
          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>{direccion === 'PAGAR' ? 'PROVEEDOR' : 'CLIENTE'}</span></div>
            {!creandoTercero ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="text-input" value={tercero_id} onChange={e => setTerceroId(e.target.value)} style={{ flex: 1 }}>
                  <option value="">— Sin {direccion === 'PAGAR' ? 'proveedor' : 'cliente'} (texto libre) —</option>
                  {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <button className="btn-ghost" onClick={() => setCreandoTercero(true)} style={{ fontSize: 11, padding: '6px 10px' }}>+ NUEVO</button>
              </div>
            ) : (
              <NuevoTerceroInline
                tipo={direccion === 'PAGAR' ? 'PROVEEDOR' : 'CLIENTE'}
                cats={catsFiltered}
                onCreated={(t) => { setCreandoTercero(false); setTerceroId(t.id); setTerceroNombre(t.nombre); onTerceroNuevo(); }}
                onCancel={() => setCreandoTercero(false)}
              />
            )}
            {!tercero_id && !creandoTercero && (
              <input
                className="text-input"
                placeholder="Nombre libre (opcional)"
                value={tercero_nombre}
                onChange={e => setTerceroNombre(e.target.value)}
                style={{ marginTop: 6, fontSize: 13 }}
              />
            )}
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>CONCEPTO *</span></div>
            <input
              className="text-input"
              placeholder={direccion === 'PAGAR' ? 'Ej: Mercancía mayo' : 'Ej: Venta cliente Juan'}
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field-row" style={{ gap: 8, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>CATEGORÍA</span></div>
              <select className="text-input" value={categoria_id} onChange={e => setCategoria(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {catsFiltered.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nombre}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>MONTO TOTAL *</span></div>
              <input
                className="text-input mono"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder="0.00"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              />
            </div>
          </div>

          <div className="field-row" style={{ gap: 8, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>FECHA EMISIÓN</span></div>
              <input className="text-input" type="date" value={fecha_creacion} onChange={e => setFechaCreacion(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>FECHA VENCIMIENTO</span></div>
              <input className="text-input" type="date" value={fecha_vencimiento} onChange={e => setFechaVenc(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>OBSERVACIONES (opcional)</span></div>
            <textarea
              className="text-input"
              value={observaciones}
              onChange={e => setObs(e.target.value.slice(0, 1000))}
              rows={2}
              style={{ resize: 'vertical' }}
              placeholder="Factura, condiciones, notas..."
            />
          </div>

          {/* Abono inicial opcional */}
          <div style={{ padding: 10, background: 'var(--bg-2, #fff8f0)', borderRadius: 8, marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={conAbonoInicial} onChange={e => setConAbonoInicial(e.target.checked)} />
              💰 Registrar {direccion === 'PAGAR' ? 'primer pago' : 'primer cobro'} ahora
            </label>
            {conAbonoInicial && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  className="text-input mono"
                  type="text"
                  inputMode="decimal"
                  placeholder="Monto"
                  value={abonoMonto}
                  onChange={e => setAbonoMonto(e.target.value.replace(/[^\d.]/g, ''))}
                />
                <select className="text-input" value={abonoCaja} onChange={e => setAbonoCaja(e.target.value)}>
                  <option value="">— Caja —</option>
                  {(cajas || []).filter(c => !c.deleted && !c.archivada).map(c => (
                    <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: 10, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12, marginTop: 10 }}>
              ⚠️ {error}
            </div>
          )}
        </div>
        <footer style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} disabled={guardando} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={handleGuardar} disabled={guardando} style={{ flex: 2 }}>
            {guardando ? 'GUARDANDO…' : 'CREAR CUENTA'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Inline para crear tercero rápido dentro del modal Crear
function NuevoTerceroInline({ tipo, cats, onCreated, onCancel }) {
  const [nombre, setNombre] = useState('');
  const [catSug, setCatSug] = useState('');
  const [tel, setTel] = useState('');
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      // Buscar el nombre de la categoría sugerida (para guardarla como texto también)
      const catObj = cats.find(c => c.id === catSug);
      const r = await fetch(apiUrl + '/api/terceros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({
          nombre: nombre.trim(),
          tipo,
          // Crear como SERVICIO desde CxP (atajo para casos simples)
          tipo_proveedor: tipo === 'PROVEEDOR' ? 'SERVICIO' : undefined,
          categoria_id_sugerida: catSug || null,
          categoria_sugerida: catObj?.nombre || null,
          telefono: tel
        })
      });
      const data = await r.json();
      if (r.ok) onCreated({ id: data.id, nombre: nombre.trim() });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div style={{ padding: 10, background: 'rgba(139, 92, 246, 0.08)', borderRadius: 8, display: 'grid', gap: 6, border: '1px solid #DDD6FE' }}>
      {tipo === 'PROVEEDOR' && (
        <div style={{ fontSize: 10, color: '#5B21B6', padding: '6px 8px', background: '#F5F3FF', borderRadius: 6, lineHeight: 1.4 }}>
          🛠 <b>Esto crea un proveedor de SERVICIO simple</b> (luz, renta, internet, etc.).<br />
          Para proveedores de mercancía con catálogo de productos, ve a <b>Compras → Proveedores</b>.
        </div>
      )}
      <input className="text-input" placeholder={'Nombre del ' + (tipo === 'PROVEEDOR' ? 'proveedor de servicio' : 'cliente')} value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <select className="text-input" value={catSug} onChange={e => setCatSug(e.target.value)} style={{ fontSize: 11 }}>
          <option value="">Categoría sugerida (opcional)</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nombre}</option>)}
        </select>
        <input className="text-input" placeholder="Tel. (opcional)" value={tel} onChange={e => setTel(e.target.value)} style={{ fontSize: 11 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={onCancel} style={{ fontSize: 11, padding: '4px 10px' }}>CANCELAR</button>
        <button className="btn-primary" onClick={guardar} disabled={saving || !nombre.trim()} style={{ fontSize: 11, padding: '4px 12px' }}>
          {saving ? '…' : 'CREAR Y USAR'}
        </button>
      </div>
    </div>
  );
}

// ===== Modal Editar =====
function EditarCxpModal({ cxp, cats, onClose, onSaved }) {
  const [concepto, setConcepto] = useState(cxp.concepto || '');
  const [categoria_id, setCategoria] = useState(cxp.categoria_id || '');
  const [monto, setMonto] = useState(String(cxp.monto_total));
  const [fecha_vencimiento, setFV] = useState(cxp.fecha_vencimiento || '');
  const [observaciones, setObs] = useState(cxp.observaciones || '');
  const [estado, setEstado] = useState(cxp.estado);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tipoCat = cxp.direccion === 'PAGAR' ? 'GASTO' : 'INGRESO';
  const catsF = (cats || []).filter(c => c.tipo === tipoCat && !c.deleted);

  const guardar = async () => {
    setError('');
    setSaving(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/cxp/' + cxp.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({
          concepto: concepto.trim(),
          categoria_id: categoria_id || null,
          monto_total: parseFloat(monto),
          fecha_vencimiento: fecha_vencimiento || null,
          observaciones,
          estado
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="capture-head">
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>EDITAR CUENTA</div>
            <h3 style={{ margin: '4px 0' }}>{cxp.tercero_nombre || cxp.concepto}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>CONCEPTO</span></div>
            <input className="text-input" value={concepto} onChange={e => setConcepto(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>CATEGORÍA</span></div>
            <select className="text-input" value={categoria_id} onChange={e => setCategoria(e.target.value)}>
              <option value="">— Sin asignar —</option>
              {catsF.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nombre}</option>)}
            </select>
          </div>
          <div className="field-row" style={{ gap: 8, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>MONTO TOTAL</span></div>
              <input className="text-input mono" type="text" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>VENCIMIENTO</span></div>
              <input className="text-input" type="date" value={fecha_vencimiento} onChange={e => setFV(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>ESTADO</span></div>
            <select className="text-input" value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="PENDIENTE">📭 PENDIENTE</option>
              <option value="PARCIAL">🟠 PARCIAL</option>
              <option value="PAGADA">✅ {cxp.direccion === 'PAGAR' ? 'PAGADA' : 'COBRADA'}</option>
              <option value="CANCELADA">❌ CANCELADA</option>
            </select>
          </div>
          <div className="field">
            <div className="field-label"><span>OBSERVACIONES</span></div>
            <textarea className="text-input" value={observaciones} onChange={e => setObs(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: 10, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        </div>
        <footer style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={guardar} disabled={saving} style={{ flex: 2 }}>{saving ? 'GUARDANDO…' : 'GUARDAR'}</button>
        </footer>
      </div>
    </div>
  );
}

// ===== Modal Abonar =====
function AbonarModal({ cxp, cajas, saldoCaja, onClose, onSaved }) {
  const saldoCxp = cxp.saldo || 0;
  const [monto, setMonto] = useState('');
  const [caja_id, setCajaId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);
  const dirVerbo = cxp.direccion === 'PAGAR' ? 'PAGO' : 'COBRO';
  const colorBase = cxp.direccion === 'PAGAR' ? 'var(--red, #E63946)' : 'var(--green, #2EC27E)';

  const pagarTodo = () => setMonto(String(saldoCxp));

  const guardar = async () => {
    setError('');
    const m = parseFloat(monto);
    if (!m || m <= 0) return setError('Monto inválido');
    if (m > saldoCxp + 0.01) return setError(`Excede saldo (${fmtMXN(saldoCxp)})`);
    if (!caja_id) return setError('Selecciona la caja');

    setSaving(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/cxp/' + cxp.id + '/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ monto: m, caja_id, fecha, metodo, referencia, notas })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      alert(`✅ ${dirVerbo} registrado.\n\nMonto: ${fmtMXN(m)}\nEstado de la cuenta: ${data.estado}`);
      onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <header className="capture-head" style={{ background: colorBase, color: '#fff' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>NUEVO {dirVerbo}</div>
            <h3 style={{ margin: '4px 0' }}>{cxp.tercero_nombre || cxp.concepto}</h3>
          </div>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </header>
        <div style={{ padding: 16 }}>
          <div style={{ padding: 10, background: 'var(--bg-2, #fff8f0)', borderRadius: 8, marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>SALDO PENDIENTE</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: colorBase }}>{fmtMXN(saldoCxp)}</div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label">
              <span>MONTO DEL {dirVerbo} *</span>
              <button type="button" onClick={pagarTodo} className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>
                {cxp.direccion === 'PAGAR' ? 'PAGAR TODO' : 'COBRAR TODO'}
              </button>
            </div>
            <input
              className="text-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={monto}
              onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              placeholder="0.00"
              autoFocus
              style={{ fontSize: 20, textAlign: 'center', padding: 12 }}
            />
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>{cxp.direccion === 'PAGAR' ? 'DE QUÉ CAJA SALE' : 'A QUÉ CAJA ENTRA'} *</span></div>
            <select className="text-input" value={caja_id} onChange={e => setCajaId(e.target.value)}>
              <option value="">— Selecciona caja —</option>
              {cajasActivas.map(c => {
                const sld = saldoCaja ? saldoCaja(c.id) : 0;
                return <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre} (saldo: {fmtMXN(sld)})</option>;
              })}
            </select>
          </div>

          <div className="field-row" style={{ gap: 8, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>FECHA</span></div>
              <input className="text-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label"><span>MÉTODO</span></div>
              <select className="text-input" value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="EFECTIVO">💵 Efectivo</option>
                <option value="TRANSFERENCIA">🏦 Transfer</option>
                <option value="CHEQUE">📄 Cheque</option>
                <option value="TARJETA">💳 Tarjeta</option>
                <option value="OTRO">⚙️ Otro</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label"><span>REFERENCIA (opcional)</span></div>
            <input className="text-input" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Folio, SPEI, cheque..." />
          </div>

          <div className="field">
            <div className="field-label"><span>NOTAS (opcional)</span></div>
            <textarea className="text-input" value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
          </div>

          {monto && caja_id && parseFloat(monto) > 0 && (
            <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 6, fontSize: 11, marginTop: 10 }}>
              ⚠️ Esto creará automáticamente un {cxp.direccion === 'PAGAR' ? 'GASTO' : 'INGRESO'} de {fmtMXN(parseFloat(monto))} en la caja seleccionada.
            </div>
          )}

          {error && <div style={{ padding: 10, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        </div>
        <footer style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={guardar} disabled={saving} style={{ flex: 2 }}>
            {saving ? 'REGISTRANDO…' : `REGISTRAR ${dirVerbo}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===== Modal Detalle =====
function DetalleCxpModal({ cxpId, cats, cajas, onClose, onChanged, onAbonar, user }) {
  const [cxp, setCxp] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/cxp/' + cxpId, { headers: { 'Authorization': 'Bearer ' + tok } });
      const data = await r.json();
      setCxp(data.cxp);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [cxpId]);

  const borrarAbono = async (abonoId) => {
    const pin = prompt('Para borrar este abono ingresa tu PIN de 4 dígitos:');
    if (!pin) return;
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/cxp/abonos/' + abonoId, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'X-PIN': pin }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      alert('✅ Abono y movimiento revertidos');
      cargar();
      // Sync completo para que el mov revertido desaparezca de la UI
      await new Promise(r => setTimeout(r, 300));
      if (window.kbotFullResync) await window.kbotFullResync();
      if (onChanged) onChanged();
    } catch (e) { alert('⚠️ ' + e.message); }
  };

  const borrarCuenta = async () => {
    if (!cxp) return;
    const tieneAbonos = (cxp.abonos || []).length > 0;
    const msg = tieneAbonos
      ? `⚠️ ESTA CUENTA TIENE ${cxp.abonos.length} ${cxp.abonos.length === 1 ? 'PAGO' : 'PAGOS'} REGISTRADO${cxp.abonos.length === 1 ? '' : 'S'}.\n\nAl eliminar la cuenta:\n• Se borrarán los ${cxp.abonos.length} ${cxp.abonos.length === 1 ? 'pago' : 'pagos'} (${fmtMXN(cxp.pagado || 0)})\n• Se revertirán los movimientos en caja\n• La cuenta desaparecerá permanentemente\n\n¿Estás SEGURO de continuar?`
      : `¿Eliminar la cuenta "${cxp.tercero_nombre || cxp.concepto}" por ${fmtMXN(cxp.monto_total)}?\n\nEsta acción es permanente.`;
    if (!confirm(msg)) return;
    const pin = prompt('Para eliminar la cuenta ingresa tu PIN de 4 dígitos:');
    if (!pin) return;
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/cxp/' + cxp.id, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'X-PIN': pin }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      alert(`✅ Cuenta eliminada${data.abonos_revertidos > 0 ? `.\n${data.abonos_revertidos} ${data.abonos_revertidos === 1 ? 'movimiento revertido' : 'movimientos revertidos'} en caja.` : ''}`);
      // Sync completo para que los movs revertidos desaparezcan de Movimientos
      await new Promise(r => setTimeout(r, 300));
      if (window.kbotFullResync) await window.kbotFullResync();
      if (onChanged) onChanged();
      onClose();
    } catch (e) { alert('⚠️ ' + e.message); }
  };

  if (loading || !cxp) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
          <div style={{ padding: 30, textAlign: 'center' }}>Cargando…</div>
        </div>
      </div>
    );
  }

  const cat = cats?.find(c => c.id === cxp.categoria_id);
  const color = cxp.direccion === 'PAGAR' ? 'var(--red, #E63946)' : 'var(--green, #2EC27E)';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <header className="capture-head">
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>DETALLE · {cxp.direccion === 'PAGAR' ? 'POR PAGAR' : 'POR COBRAR'}</div>
            <h3 style={{ margin: '4px 0' }}>{cxp.tercero_nombre || cxp.concepto}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Resumen */}
          <div style={{ padding: 12, background: 'var(--bg-2, #fff8f0)', borderRadius: 8, marginBottom: 14, borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.65 }}>TOTAL</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{fmtMXN(cxp.monto_total)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.65 }}>{cxp.direccion === 'PAGAR' ? 'PAGADO' : 'COBRADO'}</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--green, #2EC27E)' }}>{fmtMXN(cxp.pagado || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.65 }}>SALDO</div>
                <div className="mono" style={{ fontWeight: 800, fontSize: 18, color }}>{fmtMXN(cxp.saldo || 0)}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
              <strong>Concepto:</strong> {cxp.concepto}<br />
              {cat && <><strong>Categoría:</strong> {cat.icon} {cat.nombre}<br /></>}
              <strong>Creada:</strong> {cxp.fecha_creacion} por {cxp.user_nombre}<br />
              {cxp.fecha_vencimiento && <><strong>Vence:</strong> {cxp.fecha_vencimiento}<br /></>}
              <strong>Estado:</strong> {cxp.estado}
            </div>
            {cxp.observaciones && (
              <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 4, fontSize: 11 }}>
                📝 {cxp.observaciones}
              </div>
            )}
          </div>

          {/* Botón abonar */}
          {user?.rol !== 'consulta' && cxp.saldo > 0.01 && cxp.estado !== 'CANCELADA' && (
            <button className="btn-primary" onClick={onAbonar} style={{ width: '100%', marginBottom: 12 }}>
              + REGISTRAR {cxp.direccion === 'PAGAR' ? 'PAGO' : 'COBRO'}
            </button>
          )}

          {/* Abonos */}
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            📑 HISTORIAL DE {cxp.direccion === 'PAGAR' ? 'PAGOS' : 'COBROS'} ({(cxp.abonos || []).length})
          </div>
          {(cxp.abonos || []).length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 12, opacity: 0.6, background: 'var(--bg-2, #fff8f0)', borderRadius: 6 }}>
              Sin {cxp.direccion === 'PAGAR' ? 'pagos' : 'cobros'} aún
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-2, #fff8f0)' }}>
                  <th style={{ padding: 6, textAlign: 'left' }}>FECHA</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>CAJA</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>MÉTODO</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>MONTO</th>
                  <th style={{ padding: 6 }}></th>
                </tr>
              </thead>
              <tbody>
                {cxp.abonos.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--line, #eee)' }}>
                    <td style={{ padding: 6 }}>
                      <div className="mono">{a.fecha}</div>
                      {a.referencia && <div style={{ fontSize: 9, opacity: 0.6 }}>{a.referencia}</div>}
                    </td>
                    <td style={{ padding: 6 }}>{a.caja_nombre}</td>
                    <td style={{ padding: 6 }}>{a.metodo}</td>
                    <td className="mono" style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: 'var(--green, #2EC27E)' }}>
                      {fmtMXN(a.monto)}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {user?.rol !== 'consulta' && (
                        <button onClick={() => borrarAbono(a.id)} className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--red, #E63946)' }}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer style={{ padding: 12, borderTop: '1px solid var(--ink-soft, #eee)', display: 'flex', gap: 8 }}>
          {(user?.rol === 'admin' || user?.rol === 'gerente') && (
            <button
              className="btn-ghost"
              onClick={borrarCuenta}
              style={{
                flex: 1,
                color: 'var(--red, #E63946)',
                borderColor: 'var(--red, #E63946)',
                fontWeight: 700
              }}
              title="Solo admin y gerente pueden eliminar cuentas (requiere PIN)"
            >
              🗑️ ELIMINAR CUENTA
            </button>
          )}
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>CERRAR</button>
        </footer>
      </div>
    </div>
  );
}

// ===== Modal Terceros (catálogo) =====
function TercerosModal({ tipo, cats, onClose }) {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/terceros?tipo=' + tipo, {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setLista(data.terceros || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <header className="capture-head">
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>CATÁLOGO</div>
            <h3 style={{ margin: '4px 0' }}>{tipo === 'PROVEEDOR' ? '🏭 PROVEEDORES' : '👥 CLIENTES'}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <button className="btn-primary" onClick={() => setNuevo(!nuevo)} style={{ fontSize: 12 }}>
              {nuevo ? '✕ Cancelar' : '+ NUEVO ' + tipo}
            </button>
          </div>
          {nuevo && (
            <NuevoTerceroInline
              tipo={tipo}
              cats={(cats || []).filter(c => c.tipo === (tipo === 'PROVEEDOR' ? 'GASTO' : 'INGRESO'))}
              onCreated={() => { setNuevo(false); cargar(); }}
              onCancel={() => setNuevo(false)}
            />
          )}
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center' }}>Cargando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', opacity: 0.6, fontSize: 12 }}>Sin {tipo.toLowerCase()}s aún</div>
          ) : (
            <div style={{ display: 'grid', gap: 6, marginTop: nuevo ? 12 : 0 }}>
              {lista.map(t => {
                const cat = cats?.find(c => c.id === t.categoria_id_sugerida);
                return (
                  <div key={t.id} style={{ padding: 10, background: 'var(--bg-2, #fff8f0)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t.nombre}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {cat && <span>{cat.icon} {cat.nombre}</span>}
                        {t.telefono && <span style={{ marginLeft: 8 }}>📞 {t.telefono}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
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

window.CxpView = CxpView;
