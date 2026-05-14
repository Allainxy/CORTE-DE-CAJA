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
        (m.proveedor || '').toLowerCase().includes(s) ||
        (m.proveedor_nombre || '').toLowerCase().includes(s) ||
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

  // Helper: obtener nombre de proveedor (campo directo o parseado del concepto)
  const getProveedor = (m) => {
    if (m.proveedor) return m.proveedor;
    if (m.proveedor_nombre) return m.proveedor_nombre;
    // Fallback: extraer de "Pago a: NOMBRE" o "Pago: NOMBRE"
    const match = (m.concepto || '').match(/^Pago(?:\s+a)?:\s*(.+?)$/i);
    return match ? match[1].trim() : '';
  };

  // Export a Excel (.xlsx) usando SheetJS — respeta los filtros activos
  const exportXLSX = () => {
    if (typeof XLSX === 'undefined') {
      alert('Librería de Excel no cargada. Recarga la página (Ctrl+Shift+R) e intenta de nuevo.');
      return;
    }
    if (filtered.length === 0) {
      alert('No hay movimientos para exportar con los filtros actuales.');
      return;
    }

    // Construir filas con todas las columnas relevantes
    const data = filtered.map(m => ({
      'FECHA': m.fecha,
      'TIPO': m.tipo,
      'CATEGORÍA': m.categoria || '',
      'CONCEPTO': m.concepto || '',
      'PROVEEDOR': getProveedor(m),
      'CAJA': m.caja || '',
      'USUARIO': m.usuario || '',
      'MÉTODO': m.metodo || '',
      'MONTO': m.tipo === 'INGRESO' ? Number(m.monto) : -Number(m.monto),
      'NOTAS': m.notas || '',
      'ORIGEN': m.src || 'manual'
    }));

    // Fila de totales al final
    data.push({});
    data.push({
      'FECHA': 'TOTALES',
      'TIPO': `${totals.count} reg.`,
      'CATEGORÍA': '',
      'CONCEPTO': '',
      'PROVEEDOR': '',
      'CAJA': '',
      'USUARIO': '',
      'MÉTODO': 'INGRESOS',
      'MONTO': totals.ing,
      'NOTAS': '',
      'ORIGEN': ''
    });
    data.push({
      'FECHA': '',
      'TIPO': '',
      'CATEGORÍA': '',
      'CONCEPTO': '',
      'PROVEEDOR': '',
      'CAJA': '',
      'USUARIO': '',
      'MÉTODO': 'GASTOS',
      'MONTO': -totals.gas,
      'NOTAS': '',
      'ORIGEN': ''
    });
    data.push({
      'FECHA': '',
      'TIPO': '',
      'CATEGORÍA': '',
      'CONCEPTO': '',
      'PROVEEDOR': '',
      'CAJA': '',
      'USUARIO': '',
      'MÉTODO': 'NETO',
      'MONTO': totals.neto,
      'NOTAS': '',
      'ORIGEN': ''
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Anchos de columna
    ws['!cols'] = [
      { wch: 12 },  // FECHA
      { wch: 9 },   // TIPO
      { wch: 22 },  // CATEGORÍA
      { wch: 35 },  // CONCEPTO
      { wch: 25 },  // PROVEEDOR
      { wch: 18 },  // CAJA
      { wch: 16 },  // USUARIO
      { wch: 14 },  // MÉTODO
      { wch: 13 },  // MONTO
      { wch: 30 },  // NOTAS
      { wch: 10 }   // ORIGEN
    ];

    // Formato moneda en columna MONTO (I) para todas las celdas con número
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      const cellRef = XLSX.utils.encode_cell({ c: 8, r: R });
      if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
        ws[cellRef].z = '"$"#,##0.00;[Red]"-$"#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

    // Nombre con timestamp y filtros activos
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const fname = `movimientos_${ts}.xlsx`;
    XLSX.writeFile(wb, fname);
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
          <button
            className="btn-ghost btn-export"
            onClick={exportXLSX}
            title="Exportar a Excel los movimientos filtrados"
            style={{ marginLeft: 8 }}
          >
            📊 EXPORTAR EXCEL
          </button>
        </div>
      </header>

      <BotanaCard className="filter-bar">
        <div className="filter-row">
          <div className="search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              placeholder="Buscar concepto, categoría, proveedor, monto, notas…"
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
            const prov = getProveedor(m);
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
                  {prov && (
                    <div className="prov-line" style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      🏢 {prov}
                    </div>
                  )}
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
