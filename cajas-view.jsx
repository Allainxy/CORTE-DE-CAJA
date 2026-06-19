// cajas-view.jsx — Vista de cajas/cuentas + modales de creación/edición y transferencia
// Compatible con app.jsx que pasa: cajas, movs, user, saldoCaja, addCaja, updateCaja, archivarCaja, deleteCaja, onTransferClick, setFilterCaja, setActive

const TIPOS_CAJA = [
  { value: 'EFECTIVO', label: 'EFECTIVO',  icon: '💵', color: '#2EC27E' },
  { value: 'BANCO',    label: 'BANCO',     icon: '🏦', color: '#3B82F6' },
  { value: 'CREDITO',  label: 'CRÉDITO',   icon: '💳', color: '#FF6B35' },
];

function tipoMeta(t) {
  return TIPOS_CAJA.find(x => x.value === t) || TIPOS_CAJA[0];
}

const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));

const CajasView = ({ cajas, movs, user, saldoCaja, addCaja, updateCaja, archivarCaja, deleteCaja, onTransferClick, setFilterCaja, setActive }) => {
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showArchivadas, setShowArchivadas] = useState(false);

  const isAdmin = user?.rol === 'admin';
  const canTransfer = user?.rol === 'admin' || user?.rol === 'gerente';

  const cajasActivas = (cajas || [])
    .filter(c => !c.deleted && !c.archivada)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
  const cajasArchivadas = (cajas || []).filter(c => !c.deleted && c.archivada);

  const totalGeneral = cajasActivas.reduce((sum, c) => sum + (saldoCaja ? saldoCaja(c.id) : 0), 0);

  const movsCountByCaja = (id) => (movs || []).filter(m => m.caja === id && !m.deleted).length;

  const handleClickCaja = (id) => {
    if (setFilterCaja && setActive) {
      setFilterCaja(id);
      setActive('movs');
    }
  };

  return (
    <div className="view cats-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">FINANZAS</div>
          <h1 className="view-title">CAJAS Y CUENTAS</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canTransfer && (
            <button
              className="btn-ghost"
              onClick={onTransferClick}
              disabled={cajasActivas.length < 2}
              title={cajasActivas.length < 2 ? 'Necesitas al menos 2 cajas' : 'Transferir entre cajas'}
            >
              ↔ TRANSFERIR
            </button>
          )}
          {isAdmin && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>+ NUEVA CAJA</button>
          )}
        </div>
      </header>

      {/* Total general */}
      <BotanaCard accent="var(--primary)" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.5 }}>SALDO TOTAL EN TODAS LAS CAJAS</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: totalGeneral >= 0 ? 'var(--green, #2EC27E)' : 'var(--red, #E63946)' }}>
              {fmtMXN(totalGeneral)}
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'right' }}>
            {cajasActivas.length} caja{cajasActivas.length !== 1 ? 's' : ''} activa{cajasActivas.length !== 1 ? 's' : ''}
            {cajasArchivadas.length > 0 && <div>{cajasArchivadas.length} archivada{cajasArchivadas.length !== 1 ? 's' : ''}</div>}
          </div>
        </div>
      </BotanaCard>

      {cajasActivas.length === 0 && (
        <BotanaCard>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>💵</div>
            <h3 style={{ margin: 0, marginBottom: 8 }}>Sin cajas configuradas</h3>
            <p style={{ opacity: 0.7, margin: 0 }}>
              {isAdmin
                ? 'Crea tu primera caja con "+ NUEVA CAJA". Por ejemplo: una Caja Principal en efectivo, o una cuenta bancaria.'
                : 'Pídele al admin que cree las cajas para empezar.'}
            </p>
          </div>
        </BotanaCard>
      )}

      <div className="cajas-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {cajasActivas.map(c => {
          const meta = tipoMeta(c.tipo);
          const saldo = saldoCaja ? saldoCaja(c.id) : 0;
          const count = movsCountByCaja(c.id);
          const negativo = saldo < 0;
          return (
            <BotanaCard key={c.id} className="caja-card" accent={c.color || meta.color} style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div onClick={() => handleClickCaja(c.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 28 }}>{c.icon || meta.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.nombre}
                      </div>
                      <div className="mono" style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.5 }}>
                        {meta.label}{c.banco && ` · ${c.banco}`}{c.numero && ` ····${c.numero}`}
                      </div>
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button className="ic-btn" onClick={() => setEditing(c)} title="Editar" style={{ fontSize: 14 }}>✏️</button>
                    <button className="ic-btn" onClick={() => archivarCaja(c.id, true)} title="Archivar" style={{ fontSize: 14 }}>📦</button>
                  </div>
                )}
              </div>
              <div onClick={() => handleClickCaja(c.id)} style={{ cursor: 'pointer' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: negativo ? 'var(--red, #E63946)' : (c.color || meta.color) }}>
                  {fmtMXN(saldo)}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                  {count} movimiento{count !== 1 ? 's' : ''}
                  {c.fecha_inicial && ` · desde ${fmtDate ? fmtDate(c.fecha_inicial) : c.fecha_inicial}`}
                </div>
              </div>
            </BotanaCard>
          );
        })}
      </div>

      {/* Sección de archivadas */}
      {cajasArchivadas.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            className="btn-ghost"
            onClick={() => setShowArchivadas(!showArchivadas)}
            style={{ fontSize: 12 }}
          >
            {showArchivadas ? '▼' : '▶'} Archivadas ({cajasArchivadas.length})
          </button>
          {showArchivadas && (
            <div className="cajas-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 8, opacity: 0.6 }}>
              {cajasArchivadas.map(c => {
                const meta = tipoMeta(c.tipo);
                const saldo = saldoCaja ? saldoCaja(c.id) : 0;
                return (
                  <BotanaCard key={c.id} className="caja-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {c.icon || meta.icon} {c.nombre}{' '}
                          <span style={{ fontSize: 10, background: 'var(--ink, #333)', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>
                            ARCHIVADA
                          </span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="ic-btn" onClick={() => archivarCaja(c.id, false)} title="Restaurar" style={{ fontSize: 14 }}>↩️</button>
                          <button className="ic-btn danger" onClick={() => { if (confirm(`¿Eliminar definitivamente "${c.nombre}"?\n(Solo si no tiene movimientos)`)) deleteCaja(c.id); }} title="Eliminar" style={{ fontSize: 14 }}>🗑</button>
                        </div>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 18 }}>{fmtMXN(saldo)}</div>
                  </BotanaCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal crear/editar caja */}
      {(showNew || editing) && isAdmin && (
        <CajaModal
          caja={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) {
              updateCaja({ id: editing.id, ...data });
            } else {
              addCaja({
                id: newId('caja-'),
                orden: (cajas || []).length,
                archivada: 0,
                deleted: 0,
                ...data
              });
            }
            setShowNew(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

// ----- Modal crear/editar caja -----
function CajaModal({ caja, onClose, onSave }) {
  const isEdit = !!caja;
  const [tipo, setTipo] = useState(caja?.tipo || 'EFECTIVO');
  const [nombre, setNombre] = useState(caja?.nombre || '');
  const [banco, setBanco] = useState(caja?.banco || '');
  const [numero, setNumero] = useState(caja?.numero || '');
  const [saldoInicial, setSaldoInicial] = useState(caja?.saldo_inicial != null ? String(caja.saldo_inicial) : '0');
  const [fechaInicial, setFechaInicial] = useState(caja?.fecha_inicial || todayISO());
  const [permiteNegativo, setPermiteNegativo] = useState(!!caja?.permite_negativo);
  const [icon, setIcon] = useState(caja?.icon || tipoMeta(caja?.tipo || 'EFECTIVO').icon);
  const [color, setColor] = useState(caja?.color || tipoMeta(caja?.tipo || 'EFECTIVO').color);

  // Si cambia el tipo y NO está editando, sugerir defaults
  useEffect(() => {
    if (!caja) {
      const meta = tipoMeta(tipo);
      setIcon(meta.icon);
      setColor(meta.color);
      // CRÉDITO siempre permite negativo (es deuda)
      if (tipo === 'CREDITO') setPermiteNegativo(true);
    }
    // eslint-disable-next-line
  }, [tipo]);

  const handleSave = () => {
    if (!nombre.trim()) { alert('Nombre requerido'); return; }
    onSave({
      tipo,
      nombre: nombre.trim(),
      banco: banco.trim() || null,
      numero: numero.trim() || null,
      saldo_inicial: parseFloat(saldoInicial) || 0,
      fecha_inicial: fechaInicial || todayISO(),
      moneda: 'MXN',
      permite_negativo: permiteNegativo ? 1 : 0,
      icon: icon || tipoMeta(tipo).icon,
      color: color || tipoMeta(tipo).color
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="capture-head">
          <h3 style={{ margin: 0 }}>{isEdit ? 'EDITAR CAJA' : 'NUEVA CAJA / CUENTA'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <div className="field-label"><span>TIPO</span></div>
            <div className="seg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {TIPOS_CAJA.map(t => (
                <button
                  key={t.value}
                  className={tipo === t.value ? 'active' : ''}
                  onClick={() => setTipo(t.value)}
                  disabled={isEdit}
                  title={isEdit ? 'No se puede cambiar el tipo de una caja existente' : ''}
                  style={{ padding: '8px 4px' }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {isEdit && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                El tipo no se puede cambiar después de crear la caja.
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label"><span>NOMBRE</span></div>
            <input
              type="text"
              className="text-input"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={tipo === 'EFECTIVO' ? 'Ej: Caja Principal, Caja Bodega' : tipo === 'BANCO' ? 'Ej: BBVA Cheques' : 'Ej: Tarjeta BBVA Oro'}
              autoFocus={!isEdit}
            />
          </div>

          {(tipo === 'BANCO' || tipo === 'CREDITO') && (
            <div className="field-row">
              <div className="field">
                <div className="field-label"><span>BANCO</span></div>
                <input
                  type="text"
                  className="text-input"
                  value={banco}
                  onChange={e => setBanco(e.target.value)}
                  placeholder="BBVA, Banamex, Santander..."
                />
              </div>
              <div className="field">
                <div className="field-label"><span>{tipo === 'CREDITO' ? 'ÚLTIMOS 4 DÍGITOS' : 'NÚM. CUENTA / 4 DÍGITOS'}</span></div>
                <input
                  type="text"
                  className="text-input mono"
                  value={numero}
                  onChange={e => setNumero(e.target.value)}
                  placeholder="1234"
                  maxLength={20}
                />
              </div>
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <div className="field-label"><span>SALDO INICIAL</span></div>
              <input
                type="number"
                className="text-input mono"
                value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)}
                placeholder="0.00"
                step="0.01"
              />
            </div>
            <div className="field">
              <div className="field-label"><span>FECHA INICIAL</span></div>
              <input
                type="date"
                className="text-input"
                value={fechaInicial}
                onChange={e => setFechaInicial(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '0 0 100px' }}>
              <div className="field-label"><span>ICONO</span></div>
              <input
                type="text"
                className="text-input compact"
                value={icon}
                onChange={e => setIcon(e.target.value.slice(0, 2))}
                maxLength={2}
              />
            </div>
            <div className="field" style={{ flex: '0 0 80px' }}>
              <div className="field-label"><span>COLOR</span></div>
              <input
                type="color"
                className="color-input"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: '100%', height: 38, border: '1px solid #ccc', borderRadius: 6 }}
              />
            </div>
            <div style={{ flex: 1, padding: '8px 12px', background: color, color: '#fff', borderRadius: 8, textAlign: 'center', fontWeight: 700, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icon} {nombre.toUpperCase() || 'PREVIEW'}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={permiteNegativo}
              onChange={e => setPermiteNegativo(e.target.checked)}
              disabled={tipo === 'CREDITO'}
            />
            <span>
              Permitir saldo negativo
              {tipo === 'CREDITO' && <em style={{ opacity: 0.7 }}> (siempre activo en crédito)</em>}
            </span>
          </label>
        </div>

        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>CANCELAR</button>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>
            {isEdit ? 'GUARDAR CAMBIOS' : 'CREAR CAJA'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ----- Modal de Transferencia entre cajas -----
function TransferModal({ cajas, saldoCaja, onClose, onTransfer }) {
  const cajasActivas = (cajas || []).filter(c => !c.deleted && !c.archivada);
  const [origen, setOrigen] = useState(cajasActivas[0]?.id || '');
  const [destino, setDestino] = useState(cajasActivas[1]?.id || '');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [concepto, setConcepto] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cajaOrigen = cajasActivas.find(c => c.id === origen);
  const cajaDestino = cajasActivas.find(c => c.id === destino);
  const saldoOrigen = origen && saldoCaja ? saldoCaja(origen) : 0;
  const m = parseFloat(monto) || 0;
  const saldoDespues = saldoOrigen - m;
  const insuficiente = cajaOrigen && !cajaOrigen.permite_negativo && saldoDespues < 0;

  const handleSubmit = async () => {
    if (!origen || !destino) { alert('Selecciona origen y destino'); return; }
    if (origen === destino) { alert('Origen y destino deben ser diferentes'); return; }
    if (!m || m <= 0) { alert('Monto inválido'); return; }
    setEnviando(true);
    try {
      await onTransfer({
        cajaOrigen: origen,
        cajaDestino: destino,
        monto: m,
        fecha,
        concepto: concepto.trim() || undefined,
        notas: notas.trim() || undefined
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="capture-head">
          <h3 style={{ margin: 0 }}>↔ TRANSFERENCIA ENTRE CAJAS</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>DESDE</span>
              {cajaOrigen && (
                <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                  Saldo: {fmtMXN(saldoOrigen)}
                </span>
              )}
            </div>
            <select className="text-input" value={origen} onChange={e => setOrigen(e.target.value)}>
              <option value="">— Selecciona caja origen —</option>
              {cajasActivas.map(c => (
                <option key={c.id} value={c.id}>{c.icon || tipoMeta(c.tipo).icon} {c.nombre}</option>
              ))}
            </select>
          </div>

          <div style={{ textAlign: 'center', fontSize: 24, opacity: 0.5 }}>↓</div>

          <div className="field">
            <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>HACIA</span>
              {cajaDestino && saldoCaja && (
                <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                  Saldo: {fmtMXN(saldoCaja(destino))}
                </span>
              )}
            </div>
            <select className="text-input" value={destino} onChange={e => setDestino(e.target.value)}>
              <option value="">— Selecciona caja destino —</option>
              {cajasActivas.filter(c => c.id !== origen).map(c => (
                <option key={c.id} value={c.id}>{c.icon || tipoMeta(c.tipo).icon} {c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <div className="field-label"><span>MONTO</span></div>
            <input
              type="number"
              className="text-input mono"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              step="0.01"
              autoFocus
            />
            {insuficiente && (
              <div style={{ marginTop: 4, padding: 6, background: 'rgba(230, 57, 70, 0.1)', color: 'var(--red, #E63946)', borderRadius: 6, fontSize: 12 }}>
                ⚠️ Saldo insuficiente. La caja origen quedará en {fmtMXN(saldoDespues)} y no permite negativo.
              </div>
            )}
            {m > 0 && cajaOrigen && cajaDestino && !insuficiente && (
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>
                Después: {cajaOrigen.nombre} = {fmtMXN(saldoDespues)} · {cajaDestino.nombre} = {fmtMXN((saldoCaja(destino) || 0) + m)}
              </div>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <div className="field-label"><span>FECHA</span></div>
              <input type="date" className="text-input" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <div className="field-label"><span>CONCEPTO</span></div>
              <input type="text" className="text-input" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Retiro semanal" />
            </div>
          </div>

          <div className="field">
            <div className="field-label"><span>NOTAS (opcional)</span></div>
            <textarea className="text-input" rows="2" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>

        <footer className="capture-foot" style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--ink-soft, #eee)' }}>
          <button className="btn-ghost" onClick={onClose} disabled={enviando} style={{ flex: 1 }}>CANCELAR</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={enviando || !origen || !destino || origen === destino || !m || insuficiente}
            style={{ flex: 1 }}
          >
            {enviando ? 'TRANSFIRIENDO...' : `↔ TRANSFERIR ${m > 0 ? fmtMXN(m) : ''}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

window.CajasView = CajasView;
window.CajaModal = CajaModal;
window.TransferModal = TransferModal;
