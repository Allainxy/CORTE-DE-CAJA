// arqueo-view.jsx — Arqueo físico de cajas EFECTIVO con historial
// Permite contar billetes/monedas, calcular diferencia con saldo del sistema,
// y guardar el resultado para auditoría posterior.

const DENOMINACIONES = [
  { valor: 1000, tipo: 'billete', icon: '🟪' },
  { valor: 500,  tipo: 'billete', icon: '🟦' },
  { valor: 200,  tipo: 'billete', icon: '🟩' },
  { valor: 100,  tipo: 'billete', icon: '🟫' },
  { valor: 50,   tipo: 'billete', icon: '🟪' },
  { valor: 20,   tipo: 'billete', icon: '🟦' },
  { valor: 10,   tipo: 'moneda',  icon: '🟡' },
  { valor: 5,    tipo: 'moneda',  icon: '⚪' },
  { valor: 2,    tipo: 'moneda',  icon: '⚪' },
  { valor: 1,    tipo: 'moneda',  icon: '⚪' },
  { valor: 0.50, tipo: 'moneda',  icon: '🟡' }
];

const ArqueoView = ({ cajas, user, saldoCaja }) => {
  const [tab, setTab] = useState('hoy');
  const [ultimos, setUltimos] = useState([]);
  const [arqueando, setArqueando] = useState(null); // caja en proceso de arqueo
  const [verDetalle, setVerDetalle] = useState(null);
  const [loading, setLoading] = useState(true);

  const cajasEfectivo = (cajas || []).filter(c => c.tipo === 'EFECTIVO' && !c.deleted && !c.archivada);

  const cargarUltimos = async () => {
    setLoading(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/arqueos/stats/ultimos', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setUltimos(data.cajas || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { cargarUltimos(); }, []);

  if (user?.rol === 'consulta') {
    return (
      <div className="view">
        <header className="view-head">
          <div>
            <div className="eyebrow">CONTROL</div>
            <h1 className="view-title">ARQUEO DE CAJA</h1>
          </div>
        </header>
        <BotanaCard>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👁️</div>
            <p>Tu rol CONSULTA puede ver historial pero no crear arqueos.</p>
            <button className="btn-primary" onClick={() => setTab('historial')} style={{ marginTop: 12 }}>
              VER HISTORIAL →
            </button>
          </div>
        </BotanaCard>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CONTROL</div>
          <h1 className="view-title">ARQUEO DE CAJA</h1>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--ink-soft, #ddd)' }}>
        {[
          { id: 'hoy', label: '🏛️ ARQUEO ACTUAL' },
          { id: 'historial', label: '📋 HISTORIAL' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: tab === t.id ? 'var(--bg-2, #fff8f0)' : 'transparent',
              borderBottom: tab === t.id ? '3px solid var(--primary, #E63946)' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              marginBottom: -1
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hoy' && (
        <div>
          {loading ? (
            <BotanaCard><div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div></BotanaCard>
          ) : cajasEfectivo.length === 0 ? (
            <BotanaCard>
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💵</div>
                <p>No tienes cajas de tipo EFECTIVO configuradas.</p>
                <p style={{ fontSize: 12, opacity: 0.7 }}>Solo se pueden arquear cajas tipo EFECTIVO. Crea una desde el menú "Cajas".</p>
              </div>
            </BotanaCard>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {cajasEfectivo.map(caja => {
                const saldoSys = saldoCaja ? saldoCaja(caja.id) : 0;
                const ult = ultimos.find(u => u.caja_id === caja.id)?.ultimo;
                return (
                  <BotanaCard key={caja.id} style={{ padding: 16, borderLeft: `4px solid ${caja.color || '#2EC27E'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{caja.icon || '💵'} EFECTIVO</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{caja.nombre}</div>
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>SALDO SISTEMA</div>
                      <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--green, #2EC27E)' }}>
                        {fmtMXN(saldoSys)}
                      </div>
                    </div>
                    {ult ? (
                      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 10, padding: 8, background: 'var(--bg-2, #fff8f0)', borderRadius: 6 }}>
                        Último arqueo: <strong>{ult.fecha}</strong>
                        <br />
                        Estado: <strong style={{ color: ult.estado === 'CUADRADO' ? 'var(--green, #2EC27E)' : ult.estado === 'FALTANTE' ? 'var(--red, #E63946)' : 'var(--amber, #F59E0B)' }}>
                          {ult.estado === 'CUADRADO' ? '✅ CUADRADO' : ult.estado === 'FALTANTE' ? `🔴 FALTANTE (${fmtMXN(ult.diferencia)})` : `🟡 SOBRANTE (+${fmtMXN(ult.diferencia)})`}
                        </strong>
                        <br />
                        Por: {ult.user_nombre}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10, padding: 8, background: 'var(--bg-2, #fff8f0)', borderRadius: 6, fontStyle: 'italic' }}>
                        Sin arqueos previos
                      </div>
                    )}
                    <button
                      className="btn-primary"
                      onClick={() => setArqueando({ caja, saldoSys })}
                      style={{ width: '100%' }}
                    >
                      🏛️ ARQUEAR AHORA
                    </button>
                  </BotanaCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <HistorialArqueos cajas={cajas} user={user} onVerDetalle={setVerDetalle} />
      )}

      {arqueando && (
        <ArqueoModal
          caja={arqueando.caja}
          saldoSistema={arqueando.saldoSys}
          onClose={() => setArqueando(null)}
          onSaved={() => { setArqueando(null); cargarUltimos(); }}
        />
      )}

      {verDetalle && (
        <DetalleArqueoModal arqueo={verDetalle} onClose={() => setVerDetalle(null)} />
      )}
    </div>
  );
};

// ===== Modal de arqueo con denominaciones =====
function ArqueoModal({ caja, saldoSistema, onClose, onSaved }) {
  const [denoms, setDenoms] = useState(() => {
    const obj = {};
    DENOMINACIONES.forEach(d => { obj[d.valor] = 0; });
    return obj;
  });
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Calcular total contado
  const totalContado = useMemo(() => {
    return DENOMINACIONES.reduce((sum, d) => sum + (denoms[d.valor] || 0) * d.valor, 0);
  }, [denoms]);

  const diferencia = Math.round((totalContado - saldoSistema) * 100) / 100;
  const estado = Math.abs(diferencia) < 0.01 ? 'CUADRADO' : diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
  const colorEstado = estado === 'CUADRADO' ? 'var(--green, #2EC27E)' :
                      estado === 'FALTANTE' ? 'var(--red, #E63946)' :
                      'var(--amber, #F59E0B)';

  const handleChangeDenom = (valor, cantidad) => {
    const n = parseInt(cantidad) || 0;
    if (n < 0) return;
    setDenoms(prev => ({ ...prev, [valor]: n }));
  };

  const handleGuardar = async () => {
    setError('');
    if (totalContado === 0 && !confirm('No has ingresado ninguna cantidad. ¿Guardar arqueo con $0 contado?')) return;
    if (estado !== 'CUADRADO' && !confirm(`El arqueo está como ${estado} con diferencia de ${fmtMXN(diferencia)}.\n\n¿Confirmar y guardar?`)) return;

    setGuardando(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const resp = await fetch(apiUrl + '/api/arqueos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({
          caja_id: caja.id,
          saldo_sistema: saldoSistema,
          saldo_fisico: Math.round(totalContado * 100) / 100,
          denominaciones: denoms,
          observaciones,
          fecha: new Date().toISOString().slice(0, 10)
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error ' + resp.status);
      alert(`✅ Arqueo guardado.\n\nEstado: ${data.estado}\nDiferencia: ${fmtMXN(data.diferencia)}`);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <header className="capture-head" style={{ background: 'var(--ink, #1F2937)', color: '#fff' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>ARQUEO FÍSICO</div>
            <h3 style={{ margin: '4px 0' }}>{caja.icon || '💵'} {caja.nombre}</h3>
          </div>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </header>

        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Resumen pegajoso arriba */}
          <div style={{
            position: 'sticky', top: -16, marginTop: -16, marginLeft: -16, marginRight: -16, marginBottom: 12,
            padding: '12px 16px', background: 'var(--bg-2, #fff8f0)',
            borderBottom: `3px solid ${colorEstado}`, zIndex: 5
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>SALDO SISTEMA</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{fmtMXN(saldoSistema)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>TOTAL CONTADO</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary, #E63946)' }}>{fmtMXN(totalContado)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>DIFERENCIA</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: colorEstado }}>
                  {diferencia >= 0 ? '+' : ''}{fmtMXN(diferencia)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: colorEstado, marginTop: 2 }}>
                  {estado === 'CUADRADO' ? '✅ CUADRADO' : estado === 'FALTANTE' ? '🔴 FALTANTE' : '🟡 SOBRANTE'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7, fontWeight: 700 }}>
            🟪 BILLETES
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            <div style={{ fontSize: 11, opacity: 0.6 }}>DENOM.</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>CANTIDAD</div>
            <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'right' }}>SUBTOTAL</div>
            {DENOMINACIONES.filter(d => d.tipo === 'billete').map(d => (
              <React.Fragment key={d.valor}>
                <div className="mono" style={{ fontWeight: 800, fontSize: 14 }}>${d.valor}</div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={denoms[d.valor] || ''}
                  onChange={e => handleChangeDenom(d.valor, e.target.value.replace(/\D/g, ''))}
                  className="text-input mono"
                  placeholder="0"
                  style={{ fontSize: 16, padding: '8px 10px', textAlign: 'center' }}
                />
                <div className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: denoms[d.valor] > 0 ? 'var(--ink, #1F2937)' : '#999' }}>
                  {fmtMXN((denoms[d.valor] || 0) * d.valor)}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7, fontWeight: 700 }}>
            🟡 MONEDAS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            {DENOMINACIONES.filter(d => d.tipo === 'moneda').map(d => (
              <React.Fragment key={d.valor}>
                <div className="mono" style={{ fontWeight: 800, fontSize: 14 }}>${d.valor}</div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={denoms[d.valor] || ''}
                  onChange={e => handleChangeDenom(d.valor, e.target.value.replace(/\D/g, ''))}
                  className="text-input mono"
                  placeholder="0"
                  style={{ fontSize: 16, padding: '8px 10px', textAlign: 'center' }}
                />
                <div className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: denoms[d.valor] > 0 ? 'var(--ink, #1F2937)' : '#999' }}>
                  {fmtMXN((denoms[d.valor] || 0) * d.valor)}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="field">
            <div className="field-label"><span>OBSERVACIONES (opcional)</span></div>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value.slice(0, 500))}
              placeholder="Ej: Falta dinero porque... / Sobra porque..."
              className="text-input"
              rows={2}
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: 10, opacity: 0.5, textAlign: 'right', marginTop: 2 }}>
              {observaciones.length}/500
            </div>
          </div>

          {error && (
            <div style={{ padding: 10, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12, marginTop: 8 }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} disabled={guardando} style={{ flex: 1 }}>
            CANCELAR
          </button>
          <button className="btn-primary" onClick={handleGuardar} disabled={guardando} style={{ flex: 2 }}>
            {guardando ? 'GUARDANDO…' : `GUARDAR ARQUEO`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===== Historial con filtros =====
function HistorialArqueos({ cajas, user, onVerDetalle }) {
  const [arqueos, setArqueos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCaja, setFilterCaja] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const params = new URLSearchParams();
      if (filterCaja !== 'all') params.set('caja_id', filterCaja);
      if (filterEstado !== 'all') params.set('estado', filterEstado);
      if (filterDesde) params.set('desde', filterDesde);
      if (filterHasta) params.set('hasta', filterHasta);
      const r = await fetch(apiUrl + '/api/arqueos?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setArqueos(data.arqueos || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [filterCaja, filterEstado, filterDesde, filterHasta]);

  const cajasEfectivo = (cajas || []).filter(c => c.tipo === 'EFECTIVO' && !c.deleted);

  // Estadísticas del rango filtrado
  const stats = useMemo(() => {
    const total = arqueos.length;
    const cuadrados = arqueos.filter(a => a.estado === 'CUADRADO').length;
    const faltantes = arqueos.filter(a => a.estado === 'FALTANTE');
    const sobrantes = arqueos.filter(a => a.estado === 'SOBRANTE');
    const totalFaltante = faltantes.reduce((s, a) => s + Math.abs(a.diferencia), 0);
    const totalSobrante = sobrantes.reduce((s, a) => s + Math.abs(a.diferencia), 0);
    return { total, cuadrados, faltantes: faltantes.length, sobrantes: sobrantes.length, totalFaltante, totalSobrante };
  }, [arqueos]);

  return (
    <div>
      {/* Filtros */}
      <BotanaCard style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>CAJA</div>
            <select className="text-input" value={filterCaja} onChange={e => setFilterCaja(e.target.value)} style={{ fontSize: 12 }}>
              <option value="all">Todas</option>
              {cajasEfectivo.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>ESTADO</div>
            <select className="text-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ fontSize: 12 }}>
              <option value="all">Todos</option>
              <option value="CUADRADO">✅ Cuadrados</option>
              <option value="FALTANTE">🔴 Faltantes</option>
              <option value="SOBRANTE">🟡 Sobrantes</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>DESDE</div>
            <input type="date" className="text-input" value={filterDesde} onChange={e => setFilterDesde(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, fontWeight: 700 }}>HASTA</div>
            <input type="date" className="text-input" value={filterHasta} onChange={e => setFilterHasta(e.target.value)} style={{ fontSize: 12 }} />
          </div>
        </div>
      </BotanaCard>

      {/* Estadísticas */}
      {arqueos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
          <BotanaCard style={{ padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, opacity: 0.6 }}>TOTAL</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.total}</div>
          </BotanaCard>
          <BotanaCard style={{ padding: 10, textAlign: 'center', borderLeft: '3px solid var(--green, #2EC27E)' }}>
            <div style={{ fontSize: 10, opacity: 0.6 }}>✅ CUADRADOS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green, #2EC27E)' }}>{stats.cuadrados}</div>
          </BotanaCard>
          <BotanaCard style={{ padding: 10, textAlign: 'center', borderLeft: '3px solid var(--red, #E63946)' }}>
            <div style={{ fontSize: 10, opacity: 0.6 }}>🔴 FALTANTES</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red, #E63946)' }}>{stats.faltantes}</div>
            <div className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{fmtMXN(stats.totalFaltante)}</div>
          </BotanaCard>
          <BotanaCard style={{ padding: 10, textAlign: 'center', borderLeft: '3px solid var(--amber, #F59E0B)' }}>
            <div style={{ fontSize: 10, opacity: 0.6 }}>🟡 SOBRANTES</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber, #F59E0B)' }}>{stats.sobrantes}</div>
            <div className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{fmtMXN(stats.totalSobrante)}</div>
          </BotanaCard>
        </div>
      )}

      {/* Lista */}
      <BotanaCard style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div>
        ) : arqueos.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>
            Sin arqueos registrados para estos filtros
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: 'var(--bg-2, #fff8f0)' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>FECHA</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>CAJA</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>SISTEMA</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>FÍSICO</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>DIFF</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>ESTADO</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>POR</th>
                  <th style={{ padding: '8px 10px' }}></th>
                </tr>
              </thead>
              <tbody>
                {arqueos.map(a => {
                  const color = a.estado === 'CUADRADO' ? 'var(--green, #2EC27E)' :
                                a.estado === 'FALTANTE' ? 'var(--red, #E63946)' : 'var(--amber, #F59E0B)';
                  const icono = a.estado === 'CUADRADO' ? '✅' : a.estado === 'FALTANTE' ? '🔴' : '🟡';
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--line, #eee)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div className="mono">{a.fecha}</div>
                        <div style={{ fontSize: 10, opacity: 0.6 }}>{new Date(a.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{a.caja_nombre}</td>
                      <td className="mono" style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtMXN(a.saldo_sistema)}</td>
                      <td className="mono" style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtMXN(a.saldo_fisico)}</td>
                      <td className="mono" style={{ padding: '8px 10px', textAlign: 'right', color, fontWeight: 700 }}>
                        {a.diferencia > 0 ? '+' : ''}{fmtMXN(a.diferencia)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color, fontWeight: 700, fontSize: 11 }}>
                        {icono} {a.estado}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, opacity: 0.85 }}>{a.user_nombre}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button className="btn-ghost" onClick={() => onVerDetalle(a)} style={{ fontSize: 10, padding: '4px 8px' }}>VER</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </BotanaCard>
    </div>
  );
}

// ===== Modal de detalle =====
function DetalleArqueoModal({ arqueo, onClose }) {
  const denoms = arqueo.denominaciones || {};
  const color = arqueo.estado === 'CUADRADO' ? 'var(--green, #2EC27E)' :
                arqueo.estado === 'FALTANTE' ? 'var(--red, #E63946)' : 'var(--amber, #F59E0B)';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="capture-head">
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>DETALLE DE ARQUEO · {arqueo.fecha}</div>
            <h3 style={{ margin: '4px 0' }}>{arqueo.caja_nombre}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{
            padding: 12, marginBottom: 14, background: 'var(--bg-2, #fff8f0)',
            borderRadius: 8, borderLeft: `4px solid ${color}`,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8
          }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>SISTEMA</div>
              <div className="mono" style={{ fontWeight: 700 }}>{fmtMXN(arqueo.saldo_sistema)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>FÍSICO</div>
              <div className="mono" style={{ fontWeight: 700 }}>{fmtMXN(arqueo.saldo_fisico)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>DIFERENCIA</div>
              <div className="mono" style={{ fontWeight: 800, color }}>
                {arqueo.diferencia > 0 ? '+' : ''}{fmtMXN(arqueo.diferencia)}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color }}>{arqueo.estado}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, fontWeight: 700 }}>
            HECHO POR: <strong style={{ color: 'var(--ink, #1F2937)' }}>{arqueo.user_nombre}</strong> el {new Date(arqueo.ts).toLocaleString('es-MX')}
          </div>

          {denoms && Object.keys(denoms).length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>DENOMINACIONES:</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2, #fff8f0)' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>DENOM.</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>CANTIDAD</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {DENOMINACIONES.map(d => (
                    <tr key={d.valor} style={{ borderTop: '1px solid var(--line, #eee)' }}>
                      <td className="mono" style={{ padding: 6 }}>${d.valor}</td>
                      <td className="mono" style={{ padding: 6, textAlign: 'right' }}>{denoms[d.valor] || 0}</td>
                      <td className="mono" style={{ padding: 6, textAlign: 'right' }}>
                        {fmtMXN((denoms[d.valor] || 0) * d.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {arqueo.observaciones && (
            <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 6, fontSize: 12 }}>
              <strong>📝 Observaciones:</strong>
              <div style={{ marginTop: 4 }}>{arqueo.observaciones}</div>
            </div>
          )}
        </div>
        <footer style={{ padding: 12, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>CERRAR</button>
        </footer>
      </div>
    </div>
  );
}

window.ArqueoView = ArqueoView;
