// capture.jsx — Modal de captura rápida + detallada
const CaptureModal = ({ open, onClose, cats, onSave, initialTipo = 'INGRESO', editing = null, addCategory }) => {
  const [mode, setMode] = useState('rapido'); // rapido | detallado
  const [tipo, setTipo] = useState(initialTipo);
  const [categoria, setCategoria] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [caja, setCaja] = useState('PRINCIPAL');
  const [usuario, setUsuario] = useState('');
  const [notas, setNotas] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('💰');

  useEffect(() => {
    if (open) {
      if (editing) {
        setTipo(editing.tipo);
        setCategoria(editing.categoria);
        setConcepto(editing.concepto || '');
        setMonto(String(editing.monto));
        setFecha(editing.fecha);
        setMetodo(editing.metodo || 'EFECTIVO');
        setCaja(editing.caja || 'PRINCIPAL');
        setUsuario(editing.usuario || '');
        setNotas(editing.notas || '');
        setMode('detallado');
      } else {
        setTipo(initialTipo);
        setCategoria('');
        setConcepto('');
        setMonto('');
        setFecha(todayISO());
        setMetodo('EFECTIVO');
        setCaja('PRINCIPAL');
        setUsuario('');
        setNotas('');
        setMode('rapido');
      }
    }
  }, [open, initialTipo, editing]);

  const filtered = cats.filter(c => c.tipo === tipo);

  const handleSave = () => {
    if (!categoria) return alert('Elige una categoría');
    if (!monto || parseFloat(monto) <= 0) return alert('Ingresa un monto válido');
    const mov = {
      id: editing?.id || ('m' + Date.now() + Math.floor(Math.random() * 999)),
      fecha, tipo, categoria,
      concepto: concepto || categoria,
      monto: parseFloat(monto),
      metodo, caja, usuario, notas,
      src: editing?.src || 'manual'
    };
    onSave(mov);
    onClose();
  };

  const handleNewCat = () => {
    if (!newCatName.trim()) return;
    const c = {
      id: 'c-' + Date.now(),
      tipo,
      nombre: newCatName.trim().toUpperCase(),
      color: tipo === 'INGRESO' ? '#2EC27E' : '#FF6B35',
      icon: newCatIcon || (tipo === 'INGRESO' ? '💵' : '📌')
    };
    addCategory(c);
    setCategoria(c.nombre);
    setNewCatName('');
    setShowNewCat(false);
  };

  if (!open) return null;

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

        {/* Tipo toggle */}
        <div className="tipo-toggle">
          <button
            className={'tt-btn tt-ing ' + (tipo === 'INGRESO' ? 'active' : '')}
            onClick={() => { setTipo('INGRESO'); setCategoria(''); }}
          >
            <span className="tt-sign">+</span> INGRESO
          </button>
          <button
            className={'tt-btn tt-gas ' + (tipo === 'GASTO' ? 'active' : '')}
            onClick={() => { setTipo('GASTO'); setCategoria(''); }}
          >
            <span className="tt-sign">−</span> GASTO
          </button>
        </div>

        {/* Monto big input */}
        <div className="amount-input-wrap">
          <span className="currency-tag">MXN $</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            className="amount-input mono"
            autoFocus
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

        {/* Categoría chips */}
        <div className="field">
          <div className="field-label">
            <span>CATEGORÍA</span>
            <button className="link-btn" onClick={() => setShowNewCat(true)}>+ Nueva</button>
          </div>
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
          </div>
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
                <div className="field-label"><span>CAJA</span></div>
                <input value={caja} onChange={e => setCaja(e.target.value.toUpperCase())} className="text-input" />
              </div>
              <div className="field">
                <div className="field-label"><span>USUARIO</span></div>
                <input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Quien captura" className="text-input" />
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
