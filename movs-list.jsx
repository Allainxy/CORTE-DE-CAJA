// movs-list.jsx — Lista de movimientos con filtros y búsqueda avanzada
const MovsListView = ({ movs, cats, onEdit, onDelete }) => {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('TODOS');
  const [cat, setCat] = useState('TODAS');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState('fecha');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    let r = movs;
    if (tipo !== 'TODOS') r = r.filter(m => m.tipo === tipo);
    if (cat !== 'TODAS') r = r.filter(m => m.categoria === cat);
    if (from) r = r.filter(m => m.fecha >= from);
    if (to) r = r.filter(m => m.fecha <= to);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(m =>
        (m.concepto || '').toLowerCase().includes(s) ||
        (m.categoria || '').toLowerCase().includes(s) ||
        (m.usuario || '').toLowerCase().includes(s) ||
        (m.notas || '').toLowerCase().includes(s) ||
        String(m.monto).includes(s)
      );
    }
    r = [...r].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'monto') { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [movs, tipo, cat, from, to, q, sortKey, sortDir]);

  const totals = useMemo(() => {
    const ing = filtered.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gas = filtered.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);
    return { ing, gas, neto: ing - gas, count: filtered.length };
  }, [filtered]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  return (
    <div className="view movs-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">REGISTRO COMPLETO</div>
          <h1 className="view-title">MOVIMIENTOS</h1>
        </div>
        <div className="head-actions mono">
          <span className="pill">{totals.count} reg.</span>
          <span className="pill pill-ing">+{fmtMXN(totals.ing)}</span>
          <span className="pill pill-gas">−{fmtMXN(totals.gas)}</span>
          <span className={'pill pill-net ' + (totals.neto >= 0 ? 'pos' : 'neg')}>= {fmtMXN(totals.neto)}</span>
        </div>
      </header>

      <BotanaCard className="filter-bar">
        <div className="filter-row">
          <div className="search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              placeholder="Buscar concepto, categoría, monto, notas…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && <button className="clear-q" onClick={() => setQ('')}>×</button>}
          </div>
          <div className="seg">
            {['TODOS', 'INGRESO', 'GASTO'].map(t => (
              <button key={t} className={tipo === t ? 'active' : ''} onClick={() => setTipo(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <select value={cat} onChange={e => setCat(e.target.value)} className="text-input compact">
            <option>TODAS</option>
            {cats.map(c => <option key={c.id} value={c.nombre}>{c.icon} {c.nombre}</option>)}
          </select>
          <div className="date-range">
            <label>DESDE <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>HASTA <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <button className="btn-ghost" onClick={() => { setQ(''); setTipo('TODOS'); setCat('TODAS'); setFrom(''); setTo(''); }}>
            LIMPIAR
          </button>
        </div>
      </BotanaCard>

      <BotanaCard className="movs-table-card">
        <div className="movs-table">
          <div className="mt-head">
            <button onClick={() => toggleSort('fecha')}>FECHA {sortKey === 'fecha' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <div>TIPO</div>
            <div>CATEGORÍA</div>
            <div>CONCEPTO</div>
            <div>USUARIO</div>
            <button onClick={() => toggleSort('monto')} className="ar">MONTO {sortKey === 'monto' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <div></div>
          </div>
          {filtered.slice(0, 200).map(m => {
            const c = cats.find(x => x.nombre === m.categoria);
            return (
              <div key={m.id} className="mt-row">
                <div className="mono">{fmtDate(m.fecha)}</div>
                <div><span className={'tipo-tag ' + (m.tipo === 'INGRESO' ? 'ing' : 'gas')}>{m.tipo === 'INGRESO' ? '+' : '−'}</span></div>
                <div className="cat-cell">
                  <span className="cat-dot" style={{ background: c?.color || '#888' }}>{c?.icon || '•'}</span>
                  <span>{m.categoria}</span>
                </div>
                <div className="concept-cell">
                  <div>{m.concepto || '—'}</div>
                  {m.src === 'xml' && <span className="src-badge">XML</span>}
                </div>
                <div>{m.usuario || '—'}</div>
                <div className={'ar mono amount-cell ' + (m.tipo === 'INGRESO' ? 'pos' : 'neg')}>
                  {m.tipo === 'INGRESO' ? '+' : '−'}{fmtMXN(m.monto)}
                </div>
                <div className="actions-cell">
                  <button className="ic-btn" onClick={() => onEdit(m)} title="Editar">✎</button>
                  <button className="ic-btn danger" onClick={() => { if (confirm('¿Eliminar este movimiento?')) onDelete(m.id); }} title="Eliminar">🗑</button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="empty pad">No hay movimientos con esos filtros.</div>}
          {filtered.length > 200 && <div className="empty pad">Mostrando 200 de {filtered.length}. Refina la búsqueda.</div>}
        </div>
      </BotanaCard>
    </div>
  );
};

window.MovsListView = MovsListView;
