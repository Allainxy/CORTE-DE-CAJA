// xml-view.jsx — Importar y exportar XML
const newId = (p='') => p + (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10)));
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

// ----- Categorías view (con grupos jerárquicos) -----
const CategoriasView = ({ cats, movs, groups = [], user, addCategory, deleteCategory, updateCategory, addGroup, deleteGroup, updateGroup, reorderGroup, budgets, setBudget }) => {
  const [showNew, setShowNew] = useState(false);
  const [tipo, setTipo] = useState('GASTO');
  const [nombre, setNombre] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#FF6B35');
  const [grupoId, setGrupoId] = useState('');

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupTipo, setNewGroupTipo] = useState('GASTO');
  const [newGroupNombre, setNewGroupNombre] = useState('');

  // Edición de categoría (modal)
  const [editingCat, setEditingCat] = useState(null);
  const [editCatNombre, setEditCatNombre] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');
  const [editCatColor, setEditCatColor] = useState('');
  const [editCatGroup, setEditCatGroup] = useState('');

  // Edición de grupo (modal)
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupNombre, setEditGroupNombre] = useState('');

  const isAdmin = user?.rol === 'admin';

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

  const groupsByTipo = (t) => groups
    .filter(g => g.tipo === t && !g.deleted)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));

  const handleNewCat = () => {
    if (!nombre.trim()) return;
    if (!grupoId) { alert('Selecciona un GRUPO'); return; }
    addCategory({
      id: newId('c-'),
      tipo,
      nombre: nombre.trim().toUpperCase(),
      color, icon: icon || '•',
      group_id: grupoId
    });
    setNombre(''); setShowNew(false); setGrupoId('');
  };

  const handleNewGroup = () => {
    if (!newGroupNombre.trim()) return;
    addGroup({
      id: newId('g-'),
      tipo: newGroupTipo,
      nombre: newGroupNombre.trim(),
      orden: groups.filter(g => g.tipo === newGroupTipo).length
    });
    setNewGroupNombre('');
    setShowNewGroup(false);
  };

  // ---- Editar categoría ----
  const openEditCat = (c) => {
    setEditingCat(c);
    setEditCatNombre(c.nombre);
    setEditCatIcon(c.icon || '');
    setEditCatColor(c.color || '#FF6B35');
    setEditCatGroup(c.group_id || '');
  };
  const saveEditCat = () => {
    if (!editingCat) return;
    if (!editCatNombre.trim()) { alert('El nombre no puede estar vacío'); return; }
    if (!editCatGroup) { alert('Selecciona un grupo'); return; }

    const newName = editCatNombre.trim().toUpperCase();
    let cascadeRename = false;

    if (newName !== editingCat.nombre) {
      const affected = movs.filter(m => m.tipo === editingCat.tipo && m.categoria === editingCat.nombre).length;
      if (affected > 0) {
        cascadeRename = confirm(
          `Hay ${affected} movimiento(s) con la categoría "${editingCat.nombre}".\n\n` +
          `¿Quieres actualizar también esos movimientos al nuevo nombre "${newName}"?\n\n` +
          `OK = Sí, renombrar todo (recomendado)\n` +
          `Cancelar = Solo cambiar la categoría (los movimientos viejos quedarán huérfanos)`
        );
      }
    }

    updateCategory({
      id: editingCat.id,
      nombre: newName,
      icon: editCatIcon || '•',
      color: editCatColor,
      group_id: editCatGroup
    }, { cascadeRename });

    setEditingCat(null);
  };

  // ---- Editar grupo ----
  const openEditGroup = (g) => {
    setEditingGroup(g);
    setEditGroupNombre(g.nombre);
  };
  const saveEditGroup = () => {
    if (!editingGroup) return;
    if (!editGroupNombre.trim()) { alert('El nombre no puede estar vacío'); return; }
    updateGroup({ ...editingGroup, nombre: editGroupNombre.trim() });
    setEditingGroup(null);
  };

  return (
    <div className="view cats-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1 className="view-title">CATEGORÍAS Y PRESUPUESTOS</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="btn-ghost" onClick={() => setShowNewGroup(true)}>+ NUEVO GRUPO</button>}
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ NUEVA CATEGORÍA</button>
        </div>
      </header>

      {showNewGroup && isAdmin && (
        <BotanaCard className="new-cat-card">
          <h3>NUEVO GRUPO CONTABLE</h3>
          <div className="new-cat-form">
            <div className="seg">
              {['INGRESO', 'GASTO'].map(t => (
                <button key={t} className={newGroupTipo === t ? 'active' : ''} onClick={() => setNewGroupTipo(t)}>{t}</button>
              ))}
            </div>
            <input className="text-input" placeholder="Ej: Gasto de Producción, Venta de Ruta..." value={newGroupNombre} onChange={e => setNewGroupNombre(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={handleNewGroup}>AGREGAR GRUPO</button>
            <button className="btn-ghost" onClick={() => setShowNewGroup(false)}>CANCELAR</button>
          </div>
        </BotanaCard>
      )}

      {showNew && (
        <BotanaCard className="new-cat-card">
          <h3>NUEVA CATEGORÍA</h3>
          <div className="new-cat-form">
            <div className="seg">
              {['INGRESO', 'GASTO'].map(t => (
                <button key={t} className={tipo === t ? 'active' : ''} onClick={() => { setTipo(t); setGrupoId(''); }}>{t}</button>
              ))}
            </div>
            <select className="text-input" value={grupoId} onChange={e => setGrupoId(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">— Selecciona grupo —</option>
              {groupsByTipo(tipo).map(g => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
            <input className="text-input compact" placeholder="ICONO" value={icon} onChange={e => setIcon(e.target.value.slice(0, 2))} style={{ width: 80 }} />
            <input className="text-input" placeholder="NOMBRE" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="color-input" />
            <button className="btn-primary" onClick={handleNewCat}>AGREGAR</button>
            <button className="btn-ghost" onClick={() => { setShowNew(false); setGrupoId(''); }}>CANCELAR</button>
          </div>
          {groupsByTipo(tipo).length === 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-2, #fff8f0)', borderRadius: 6, fontSize: 13, opacity: 0.85 }}>
              ⚠️ No hay grupos de tipo {tipo}. {isAdmin ? 'Crea uno arriba con "+ NUEVO GRUPO".' : 'Pídele al admin que cree grupos primero.'}
            </div>
          )}
        </BotanaCard>
      )}

      <div className="cats-grid">
        {['INGRESO', 'GASTO'].map(t => {
          const tipoGroups = groupsByTipo(t);
          const validGroupIds = new Set(tipoGroups.map(g => g.id));
          // Agrupar categorías por group_id; las sin grupo —o cuyo grupo ya no
          // existe / fue borrado / es de otro tipo (categorías creadas por los
          // módulos de Ventas/Nómina/Viáticos)— van a "_none" para que sean
          // visibles y se les pueda asignar un grupo.
          const catsByGroup = {};
          cats.filter(c => c.tipo === t).forEach(c => {
            const k = (c.group_id && validGroupIds.has(c.group_id)) ? c.group_id : '_none';
            (catsByGroup[k] = catsByGroup[k] || []).push(c);
          });

          return (
            <div key={t} className="cats-col">
              <h3 className="cats-section">{t === 'INGRESO' ? 'INGRESOS' : 'GASTOS'}</h3>

              {tipoGroups.length === 0 && !catsByGroup._none && (
                <BotanaCard>
                  <div style={{ padding: 12, textAlign: 'center', opacity: 0.7 }}>
                    Sin grupos {t.toLowerCase()}s. {isAdmin && 'Crea el primero con "+ NUEVO GRUPO".'}
                  </div>
                </BotanaCard>
              )}

              {/* Grupos definidos */}
              {tipoGroups.map((g, idx) => {
                const list = catsByGroup[g.id] || [];
                const isFirst = idx === 0;
                const isLast = idx === tipoGroups.length - 1;
                return (
                  <div key={g.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingLeft: 4, gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.75, letterSpacing: 0.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📂 {g.nombre.toUpperCase()} <span style={{ opacity: 0.5, fontWeight: 400 }}>· {list.length} cat.</span>
                      </div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button
                            className="ic-btn"
                            onClick={() => reorderGroup(g.id, -1)}
                            disabled={isFirst}
                            title="Subir"
                            style={{ fontSize: 12, opacity: isFirst ? 0.3 : 0.7, cursor: isFirst ? 'not-allowed' : 'pointer' }}
                          >▲</button>
                          <button
                            className="ic-btn"
                            onClick={() => reorderGroup(g.id, +1)}
                            disabled={isLast}
                            title="Bajar"
                            style={{ fontSize: 12, opacity: isLast ? 0.3 : 0.7, cursor: isLast ? 'not-allowed' : 'pointer' }}
                          >▼</button>
                          <button
                            className="ic-btn"
                            onClick={() => openEditGroup(g)}
                            title="Editar nombre"
                            style={{ fontSize: 12 }}
                          >✏️</button>
                          <button
                            className="ic-btn danger"
                            onClick={() => { if (confirm(`¿Eliminar grupo "${g.nombre}"?\n(Solo si no tiene categorías)`)) deleteGroup(g.id); }}
                            title="Eliminar grupo"
                            style={{ fontSize: 12 }}
                          >🗑</button>
                        </div>
                      )}
                    </div>
                    {list.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 13, opacity: 0.5, fontStyle: 'italic' }}>
                        Sin categorías. Crea una con "+ NUEVA CATEGORÍA".
                      </div>
                    ) : list.map(c => renderCatCard(c, t, stats, budgets, setBudget, deleteCategory, isAdmin, openEditCat))}
                  </div>
                );
              })}

              {/* Categorías sin grupo válido — incluye las creadas por los
                  módulos (Ventas/Nómina/Viáticos) cuyo grupo no existe. */}
              {catsByGroup._none && catsByGroup._none.length > 0 && (
                <div style={{ marginBottom: 16, padding: 10, borderRadius: 12, background: '#FFF4E0', border: '2px dashed #F4A261' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', letterSpacing: 0.5, marginBottom: 6, paddingLeft: 4 }}>
                    ⚠️ SIN GRUPO ASIGNADO <span style={{ opacity: 0.7, fontWeight: 400 }}>· {catsByGroup._none.length} cat. — edítalas (✏️) y asígnales un grupo para que aparezcan agrupadas en el Reporte Financiero</span>
                  </div>
                  {catsByGroup._none.map(c => renderCatCard(c, t, stats, budgets, setBudget, deleteCategory, isAdmin, openEditCat))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal: Editar Categoría (solo admin) */}
      {editingCat && isAdmin && (
        <div className="modal-backdrop" onClick={() => setEditingCat(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <header className="capture-head">
              <h3 style={{ margin: 0 }}>EDITAR CATEGORÍA <span style={{ opacity: 0.5, fontSize: 12 }}>{editingCat.tipo}</span></h3>
              <button className="modal-close" onClick={() => setEditingCat(null)}>×</button>
            </header>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <div className="field-label"><span>GRUPO</span></div>
                <select className="text-input" value={editCatGroup} onChange={e => setEditCatGroup(e.target.value)}>
                  <option value="">— Selecciona grupo —</option>
                  {groupsByTipo(editingCat.tipo).map(g => (
                    <option key={g.id} value={g.id}>{g.nombre}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                  Solo grupos del mismo tipo ({editingCat.tipo})
                </div>
              </div>
              <div className="field">
                <div className="field-label"><span>NOMBRE</span></div>
                <input
                  type="text"
                  className="text-input"
                  value={editCatNombre}
                  onChange={e => setEditCatNombre(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '0 0 100px' }}>
                  <div className="field-label"><span>ÍCONO</span></div>
                  <input
                    type="text"
                    className="text-input compact"
                    value={editCatIcon}
                    onChange={e => setEditCatIcon(e.target.value.slice(0, 2))}
                  />
                </div>
                <div className="field" style={{ flex: '0 0 80px' }}>
                  <div className="field-label"><span>COLOR</span></div>
                  <input
                    type="color"
                    className="color-input"
                    value={editCatColor}
                    onChange={e => setEditCatColor(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, padding: '8px 12px', background: editCatColor, color: '#fff', borderRadius: 8, textAlign: 'center', fontWeight: 700 }}>
                  {editCatIcon} {editCatNombre.toUpperCase()}
                </div>
              </div>
            </div>
            <footer className="capture-foot">
              <button className="btn-ghost" onClick={() => setEditingCat(null)}>CANCELAR</button>
              <button className="btn-primary" onClick={saveEditCat}>GUARDAR CAMBIOS</button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal: Editar Grupo (solo admin) */}
      {editingGroup && isAdmin && (
        <div className="modal-backdrop" onClick={() => setEditingGroup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <header className="capture-head">
              <h3 style={{ margin: 0 }}>EDITAR GRUPO <span style={{ opacity: 0.5, fontSize: 12 }}>{editingGroup.tipo}</span></h3>
              <button className="modal-close" onClick={() => setEditingGroup(null)}>×</button>
            </header>
            <div style={{ padding: 16 }}>
              <div className="field">
                <div className="field-label"><span>NOMBRE DEL GRUPO</span></div>
                <input
                  type="text"
                  className="text-input"
                  value={editGroupNombre}
                  onChange={e => setEditGroupNombre(e.target.value)}
                  autoFocus
                />
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                  El tipo ({editingGroup.tipo}) no se puede cambiar para evitar inconsistencias con movimientos.
                </div>
              </div>
            </div>
            <footer className="capture-foot">
              <button className="btn-ghost" onClick={() => setEditingGroup(null)}>CANCELAR</button>
              <button className="btn-primary" onClick={saveEditGroup}>GUARDAR</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper para renderizar una tarjeta de categoría
function renderCatCard(c, t, stats, budgets, setBudget, deleteCategory, isAdmin, openEditCat) {
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
        {isAdmin && (
          <>
            <button className="ic-btn" onClick={() => openEditCat(c)} title="Editar" style={{ fontSize: 14 }}>✏️</button>
            <button className="ic-btn danger" onClick={() => { if (confirm(`¿Eliminar "${c.nombre}"?`)) deleteCategory(c.id); }} title="Eliminar">🗑</button>
          </>
        )}
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
}

window.XMLView = XMLView;
window.CategoriasView = CategoriasView;
