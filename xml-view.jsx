// xml-view.jsx — Importar y exportar XML
const XMLView = ({ movs, onImport, cats }) => {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();

  const handleFile = async (file) => {
    setError(''); setParsed(null);
    if (!file) return;
    try {
      const text = await file.text();
      const items = window.KBotXML.parseXML(text);
      if (items.length === 0) throw new Error('No se encontraron movimientos en el XML.');
      setParsed({ items, filename: file.name });
    } catch (e) {
      setError(e.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const confirmImport = () => {
    onImport(parsed.items);
    alert(`Se importaron ${parsed.items.length} movimientos correctamente.`);
    setParsed(null);
  };

  const exportAll = () => {
    const xml = window.KBotXML.exportXML(movs);
    window.KBotXML.download(xml, `kbotanas-${todayISO()}.xml`);
  };

  const exportYear = () => {
    const y = String(new Date().getFullYear());
    const f = movs.filter(m => yearKey(m.fecha) === y);
    const xml = window.KBotXML.exportXML(f);
    window.KBotXML.download(xml, `kbotanas-${y}.xml`);
  };

  const exportMonth = () => {
    const y = todayISO().slice(0, 7);
    const f = movs.filter(m => monthKey(m.fecha) === y);
    const xml = window.KBotXML.exportXML(f);
    window.KBotXML.download(xml, `kbotanas-${y}.xml`);
  };

  return (
    <div className="view xml-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">SINCRONIZACIÓN</div>
          <h1 className="view-title">IMPORTAR / EXPORTAR XML</h1>
        </div>
      </header>

      <div className="xml-grid">
        <BotanaCard className="xml-import">
          <div className="card-head">
            <h3>IMPORTAR XML</h3>
            <span className="card-tag">DRAG &amp; DROP</span>
          </div>
          <div
            className={'drop-zone ' + (drag ? 'over' : '')}
            onDragEnter={e => { e.preventDefault(); setDrag(true); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="dz-icon">⤓</div>
            <div className="dz-title">Arrastra tu archivo XML aquí</div>
            <div className="dz-sub">o haz click para seleccionar</div>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              hidden
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>
          {error && <div className="error-box">⚠ {error}</div>}
          {parsed && (
            <div className="xml-preview">
              <div className="xp-head">
                <div>
                  <strong>{parsed.filename}</strong>
                  <div className="xp-sub">{parsed.items.length} movimientos detectados</div>
                </div>
                <div className="xp-actions">
                  <button className="btn-ghost" onClick={() => setParsed(null)}>CANCELAR</button>
                  <button className="btn-primary" onClick={confirmImport}>IMPORTAR TODOS</button>
                </div>
              </div>
              <div className="xp-list">
                {parsed.items.slice(0, 20).map((m, i) => (
                  <div key={i} className="xp-row">
                    <span className="mono">{m.fecha}</span>
                    <span className={'tipo-tag ' + (m.tipo === 'INGRESO' ? 'ing' : 'gas')}>{m.tipo === 'INGRESO' ? '+' : '−'}</span>
                    <span>{m.categoria}</span>
                    <span className="xp-concept">{m.concepto}</span>
                    <span className="mono ar">{fmtMXN(m.monto)}</span>
                  </div>
                ))}
                {parsed.items.length > 20 && <div className="empty pad">+{parsed.items.length - 20} más…</div>}
              </div>
            </div>
          )}
          <div className="xml-format">
            <h4>FORMATO ESPERADO</h4>
            <pre className="xml-snippet">{`<?xml version="1.0" encoding="UTF-8"?>
<KBotanas>
  <Movimientos>
    <Movimiento id="m001">
      <Fecha>2026-05-05</Fecha>
      <Tipo>INGRESO</Tipo>
      <Categoria>VENTAS RUTAS</Categoria>
      <Concepto>Ruta Centro</Concepto>
      <Monto>3450.00</Monto>
      <Metodo>EFECTIVO</Metodo>
      <Caja>PRINCIPAL</Caja>
      <Usuario>Ana</Usuario>
    </Movimiento>
  </Movimientos>
</KBotanas>`}</pre>
          </div>
        </BotanaCard>

        <BotanaCard className="xml-export">
          <div className="card-head">
            <h3>EXPORTAR XML</h3>
            <span className="card-tag">RESPALDO</span>
          </div>
          <p className="xml-help">Descarga tu información en formato XML para respaldarla o transferirla a otro sistema.</p>
          <div className="export-buttons">
            <button className="export-btn" onClick={exportMonth}>
              <span className="eb-icon">📅</span>
              <div>
                <div className="eb-title">MES ACTUAL</div>
                <div className="eb-sub">{todayISO().slice(0, 7)}</div>
              </div>
            </button>
            <button className="export-btn" onClick={exportYear}>
              <span className="eb-icon">📊</span>
              <div>
                <div className="eb-title">AÑO ACTUAL</div>
                <div className="eb-sub">{new Date().getFullYear()}</div>
              </div>
            </button>
            <button className="export-btn" onClick={exportAll}>
              <span className="eb-icon">💾</span>
              <div>
                <div className="eb-title">TODO EL HISTORIAL</div>
                <div className="eb-sub">{movs.length} movimientos</div>
              </div>
            </button>
          </div>
        </BotanaCard>
      </div>
    </div>
  );
};

// ----- Categorías view -----
const CategoriasView = ({ cats, movs, addCategory, deleteCategory, budgets, setBudget }) => {
  const [showNew, setShowNew] = useState(false);
  const [tipo, setTipo] = useState('GASTO');
  const [nombre, setNombre] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#FF6B35');

  const mk = monthKey(todayISO());
  const stats = useMemo(() => {
    const map = {};
    cats.forEach(c => { map[c.id] = { gastado: 0, count: 0 }; });
    movs.filter(m => monthKey(m.fecha) === mk).forEach(m => {
      const c = cats.find(x => x.nombre === m.categoria && x.tipo === m.tipo);
      if (c) {
        map[c.id].gastado += m.monto;
        map[c.id].count++;
      }
    });
    return map;
  }, [cats, movs]);

  const handleNew = () => {
    if (!nombre.trim()) return;
    addCategory({
      id: 'c-' + Date.now(),
      tipo,
      nombre: nombre.trim().toUpperCase(),
      color, icon: icon || '•'
    });
    setNombre(''); setShowNew(false);
  };

  return (
    <div className="view cats-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1 className="view-title">CATEGORÍAS Y PRESUPUESTOS</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ NUEVA CATEGORÍA</button>
      </header>

      {showNew && (
        <BotanaCard className="new-cat-card">
          <h3>NUEVA CATEGORÍA</h3>
          <div className="new-cat-form">
            <div className="seg">
              {['INGRESO', 'GASTO'].map(t => (
                <button key={t} className={tipo === t ? 'active' : ''} onClick={() => setTipo(t)}>{t}</button>
              ))}
            </div>
            <input className="text-input compact" placeholder="ICONO" value={icon} onChange={e => setIcon(e.target.value.slice(0, 2))} style={{ width: 80 }} />
            <input className="text-input" placeholder="NOMBRE" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="color-input" />
            <button className="btn-primary" onClick={handleNew}>AGREGAR</button>
            <button className="btn-ghost" onClick={() => setShowNew(false)}>CANCELAR</button>
          </div>
        </BotanaCard>
      )}

      <div className="cats-grid">
        {['INGRESO', 'GASTO'].map(t => (
          <div key={t} className="cats-col">
            <h3 className="cats-section">{t === 'INGRESO' ? 'INGRESOS' : 'GASTOS'}</h3>
            {cats.filter(c => c.tipo === t).map(c => {
              const s = stats[c.id] || { gastado: 0, count: 0 };
              const budget = budgets[c.id] || 0;
              const pct = budget ? Math.min(100, (s.gastado / budget) * 100) : 0;
              return (
                <BotanaCard key={c.id} className="cat-card">
                  <div className="cat-card-head">
                    <span className="cat-icon-big" style={{ background: c.color }}>{c.icon}</span>
                    <div className="cat-card-title">
                      <div className="cat-card-name">{c.nombre}</div>
                      <div className="cat-card-meta">{s.count} mov · {fmtMXN(s.gastado)} este mes</div>
                    </div>
                    <button className="ic-btn danger" onClick={() => { if (confirm(`¿Eliminar "${c.nombre}"?`)) deleteCategory(c.id); }}>🗑</button>
                  </div>
                  {t === 'GASTO' && (
                    <div className="budget-row">
                      <label>PRESUPUESTO/MES</label>
                      <input
                        type="number"
                        value={budget || ''}
                        placeholder="0.00"
                        onChange={e => setBudget(c.id, parseFloat(e.target.value) || 0)}
                        className="text-input compact mono"
                      />
                      {budget > 0 && (
                        <div className="budget-bar">
                          <i style={{ width: pct + '%', background: pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : c.color }} />
                          <span className="mono">{pct.toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </BotanaCard>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

window.XMLView = XMLView;
window.CategoriasView = CategoriasView;
