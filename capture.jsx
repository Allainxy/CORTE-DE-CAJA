// capture.jsx — Modal de captura rápida + detallada
const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));
const CaptureModal = ({ open, onClose, cats, groups = [], cajas = [], saldoCaja, user, misCajas = [], onSave, initialTipo = 'INGRESO', initialCajaId = null, editing = null, addCategory }) => {
  const [mode, setMode] = useState('rapido'); // rapido | detallado
  const [tipo, setTipo] = useState(initialTipo);
  const [grupoId, setGrupoId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [cajaId, setCajaId] = useState('');
  const [usuario, setUsuario] = useState('');
  const [notas, setNotas] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('💰');

  // Filtrar cajas según rol y permisos por caja
  const userCanUseCaja = (cajaId) => {
    if (!user) return true;
    if (user.rol === 'admin' || user.rol === 'gerente') return true;
    if (!misCajas || misCajas.length === 0) return true; // sin restricciones
    return misCajas.includes(cajaId);
  };
  const cajasActivas = cajas
    .filter(c => !c.deleted && !c.archivada && userCanUseCaja(c.id))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cajaSeleccionada = cajas.find(c => c.id === cajaId);

  // Auto-seleccionar método según tipo de caja al cambiar caja
  useEffect(() => {
    if (!cajaSeleccionada) return;
    if (cajaSeleccionada.tipo === 'EFECTIVO' && metodo !== 'EFECTIVO') setMetodo('EFECTIVO');
    if (cajaSeleccionada.tipo === 'BANCO' && metodo === 'EFECTIVO') setMetodo('TRANSFERENCIA');
    if (cajaSeleccionada.tipo === 'CREDITO') setMetodo('TARJETA');
    // eslint-disable-next-line
  }, [cajaId]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setTipo(editing.tipo);
        setCategoria(editing.categoria);
        const cat = cats.find(c => c.nombre === editing.categoria && c.tipo === editing.tipo);
        setGrupoId(cat?.group_id || '');
        setConcepto(editing.concepto || '');
        setMonto(String(editing.monto));
        setFecha(editing.fecha);
        setMetodo(editing.metodo || 'EFECTIVO');
        setCajaId(editing.caja || (cajasActivas[0]?.id || ''));
        setUsuario(editing.usuario || '');
        setNotas(editing.notas || '');
        setMode('detallado');
      } else {
        setTipo(initialTipo);
        setGrupoId('');
        setCategoria('');
        setConcepto('');
        setMonto('');
        setFecha(todayISO());
        setMetodo('EFECTIVO');
        // Si nos pasaron una caja preseleccionada, usarla; si no, primera activa o caja-principal
        if (initialCajaId) {
          setCajaId(initialCajaId);
        } else {
          const principal = cajasActivas.find(c => c.id === 'caja-principal');
          setCajaId(principal?.id || cajasActivas[0]?.id || '');
        }
        setUsuario(user?.nombre || '');
        setNotas('');
        setMode('rapido');
      }
    }
  }, [open, initialTipo, initialCajaId, editing]);

  const groupsByTipo = groups
    .filter(g => g.tipo === tipo && !g.deleted)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
  const filtered = cats.filter(c => c.tipo === tipo && (!grupoId || c.group_id === grupoId));

  const handleSave = () => {
    if (!cajaId) return alert('Selecciona una caja/cuenta');
    if (!categoria) return alert('Elige una categoría');
    if (!monto || parseFloat(monto) <= 0) return alert('Ingresa un monto válido');

    const m = parseFloat(monto);
    // Validación de saldo si es GASTO y la caja no permite negativo
    if (tipo === 'GASTO' && cajaSeleccionada && !cajaSeleccionada.permite_negativo && saldoCaja) {
      const saldoActual = saldoCaja(cajaId);
      // Si está editando, sumar el monto viejo (porque ya estaba descontado)
      const ajuste = (editing && editing.tipo === 'GASTO' && editing.caja === cajaId) ? editing.monto : 0;
      const saldoEfectivo = saldoActual + ajuste;
      if (saldoEfectivo - m < 0) {
        if (!confirm(`⚠️ Saldo insuficiente en ${cajaSeleccionada.nombre}\n\nDisponible: $${saldoEfectivo.toFixed(2)}\nQuieres gastar: $${m.toFixed(2)}\n\nLa caja no permite saldo negativo.\n\n¿Continuar de todas formas?`)) {
          return;
        }
      }
    }

    const mov = {
      id: editing?.id || ('m' + Date.now() + Math.floor(Math.random() * 999)),
      fecha, tipo, categoria,
      concepto: concepto || categoria,
      monto: m,
      metodo, caja: cajaId, usuario, notas,
      src: editing?.src || 'manual'
    };
    onSave(mov);
    onClose();
  };

  const handleNewCat = () => {
    if (!newCatName.trim()) return;
    if (!grupoId) { alert('Primero selecciona un GRUPO arriba'); return; }
    const c = {
      id: newId('c-'),
      tipo,
      nombre: newCatName.trim().toUpperCase(),
      color: tipo === 'INGRESO' ? '#2EC27E' : '#FF6B35',
      icon: newCatIcon || (tipo === 'INGRESO' ? '💵' : '📌'),
      group_id: grupoId
    };
    addCategory(c);
    setCategoria(c.nombre);
    setNewCatName('');
    setShowNewCat(false);
  };

  if (!open) return null;
  if (user && user.rol === 'consulta') {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <header className="capture-head">
            <h3 style={{ margin: 0 }}>SOLO LECTURA</h3>
            <button className="modal-close" onClick={onClose}>×</button>
          </header>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👁️</div>
            <p>Tu rol <strong>CONSULTA</strong> no permite capturar movimientos. Solo puedes ver información.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal capture-modal" onClick={e => e.stopPropagation()}>
        <header className="capture-head">
          <div className="capture-tabs">
            <button className={mode === 'rapido' ? 'active' : ''} onClick={() => setMode('rapido')}>RÁPIDO</button>
            <button className={mode === 'detallado' ? 'active' : ''} onClick={() => setMode('detallado')}>DETALLADO</button>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        {/* Selector de Caja/Cuenta */}
        <div className="field" style={{ marginTop: 8 }}>
          <div className="field-label">
            <span>CAJA / CUENTA</span>
            {cajaSeleccionada && saldoCaja && (
              <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                Saldo: {fmtMXN(saldoCaja(cajaId))}
              </span>
            )}
          </div>
          {cajasActivas.length === 0 ? (
            <div style={{ padding: '10px 12px', background: 'var(--bg-2, #fff8f0)', border: '1px dashed var(--ink-soft, #ccc)', borderRadius: 8, fontSize: 13, opacity: 0.85 }}>
              No hay cajas. Pídele al admin que cree al menos una en el menú "Cajas".
            </div>
          ) : (
            <select className="text-input" value={cajaId} onChange={e => setCajaId(e.target.value)}>
              <option value="">— Selecciona caja —</option>
              {cajasActivas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.icon || (c.tipo === 'EFECTIVO' ? '💵' : c.tipo === 'BANCO' ? '🏦' : '💳')} {c.nombre}
                  {c.banco && ` · ${c.banco}`}{c.numero && ` ····${c.numero}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tipo toggle */}
        <div className="tipo-toggle">
          <button
            className={'tt-btn tt-ing ' + (tipo === 'INGRESO' ? 'active' : '')}
            onClick={() => { setTipo('INGRESO'); setGrupoId(''); setCategoria(''); }}
          >
            <span className="tt-sign">+</span> INGRESO
          </button>
          <button
            className={'tt-btn tt-gas ' + (tipo === 'GASTO' ? 'active' : '')}
            onClick={() => { setTipo('GASTO'); setGrupoId(''); setCategoria(''); }}
          >
            <span className="tt-sign">−</span> GASTO
          </button>
        </div>

        {/* Monto big input */}
        <div className="amount-input-wrap">
          <span className="currency-tag">MXN $</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            placeholder="0.00"
            value={monto}
            onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            className="amount-input mono"
            autoFocus={mode !== 'rapido'}
            autoComplete="off"
            enterKeyHint="done"
          />
        </div>

        {/* Numpad sólo en modo rápido en móvil */}
        {mode === 'rapido' && (
          <div className="numpad">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map(k => (
              <button
                key={k}
                className={'np-key ' + (k === '⌫' ? 'np-del' : '')}
                onClick={() => {
                  setMonto(prev => {
                    if (k === '⌫') return prev.slice(0, -1);
                    if (k === '.' && prev.includes('.')) return prev;
                    return (prev + k);
                  });
                }}
              >{k}</button>
            ))}
          </div>
        )}

        {/* Grupo (jerarquía contable) */}
        <div className="field">
          <div className="field-label"><span>GRUPO</span></div>
          {groupsByTipo.length === 0 ? (
            <div style={{ padding: '10px 12px', background: 'var(--bg-2, #fff8f0)', border: '1px dashed var(--ink-soft, #ccc)', borderRadius: 8, fontSize: 13, opacity: 0.8 }}>
              No hay grupos {tipo.toLowerCase()}s. Pídele al admin que los cree desde Categorías.
            </div>
          ) : (
            <div className="cat-chips">
              {groupsByTipo.map(g => (
                <button
                  key={g.id}
                  className={'cat-chip ' + (grupoId === g.id ? 'active' : '')}
                  onClick={() => { setGrupoId(g.id); setCategoria(''); }}
                  style={grupoId === g.id ? { background: tipo === 'INGRESO' ? '#2EC27E' : '#FF6B35', borderColor: tipo === 'INGRESO' ? '#2EC27E' : '#FF6B35', color: '#fff' } : {}}
                >
                  <span>{tipo === 'INGRESO' ? '📂' : '📁'}</span>
                  <span>{g.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Categoría chips (filtradas por grupo) */}
        <div className="field">
          <div className="field-label">
            <span>CATEGORÍA</span>
            {grupoId && <button className="link-btn" onClick={() => setShowNewCat(true)}>+ Nueva</button>}
          </div>
          {!grupoId ? (
            <div style={{ padding: '10px 12px', fontSize: 13, opacity: 0.6 }}>
              Selecciona un grupo arriba para ver/crear categorías.
            </div>
          ) : (
            <div className="cat-chips">
              {filtered.map(c => (
                <button
                  key={c.id}
                  className={'cat-chip ' + (categoria === c.nombre ? 'active' : '')}
                  onClick={() => setCategoria(c.nombre)}
                  style={categoria === c.nombre ? { background: c.color, borderColor: c.color, color: '#fff' } : {}}
                >
                  <span>{c.icon}</span>
                  <span>{c.nombre}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: '8px 0', fontSize: 13, opacity: 0.6 }}>
                  No hay categorías en este grupo. Crea una con "+ Nueva".
                </div>
              )}
            </div>
          )}
          {showNewCat && (
            <div className="new-cat-row">
              <input
                placeholder="Icono"
                value={newCatIcon}
                onChange={e => setNewCatIcon(e.target.value.slice(0, 2))}
                className="new-cat-icon"
              />
              <input
                placeholder="NOMBRE NUEVA CATEGORÍA"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="new-cat-input"
              />
              <button className="btn-primary tiny" onClick={handleNewCat}>AGREGAR</button>
              <button className="btn-ghost tiny" onClick={() => setShowNewCat(false)}>X</button>
            </div>
          )}
        </div>

        {/* Concepto */}
        <div className="field">
          <div className="field-label"><span>CONCEPTO</span></div>
          <input
            type="text"
            placeholder={tipo === 'INGRESO' ? 'Ej: Ruta Centro lunes' : 'Ej: Gasolina camioneta'}
            value={concepto}
            onChange={e => setConcepto(e.target.value)}
            className="text-input"
          />
        </div>

        {mode === 'detallado' && (
          <>
            <div className="field-row">
              <div className="field">
                <div className="field-label"><span>FECHA</span></div>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-input" />
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
            <div className="field-row">
              <div className="field">
                <div className="field-label"><span>USUARIO (quien captura)</span></div>
                <input
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder={user?.nombre || 'Quien captura'}
                  className="text-input"
                  title="Auto-rellenado con tu nombre de usuario. Puedes cambiarlo si capturas a nombre de otra persona."
                />
              </div>
            </div>
            <div className="field">
              <div className="field-label"><span>NOTAS</span></div>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} className="text-input" rows="2" />
            </div>
          </>
        )}

        <footer className="capture-foot">
          <button className="btn-ghost" onClick={onClose}>CANCELAR</button>
          <button
            className={'btn-primary big ' + (tipo === 'INGRESO' ? 'is-ing' : 'is-gas')}
            onClick={handleSave}
          >
            {editing ? 'GUARDAR CAMBIOS' : (tipo === 'INGRESO' ? 'REGISTRAR INGRESO' : 'REGISTRAR GASTO')}
            {monto && <span className="mono"> · {fmtMXN(parseFloat(monto) || 0)}</span>}
          </button>
        </footer>
      </div>
    </div>
  );
};

window.CaptureModal = CaptureModal;
