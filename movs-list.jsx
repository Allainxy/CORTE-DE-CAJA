// movs-list.jsx — Lista de movimientos con filtros y búsqueda avanzada
// v2026-05-24b: grid de 8 columnas en escritorio (CAJA/USUARIO sin empalmarse,
//               acciones en su propia columna) + badge de caja contenido.
// v2026-05-24a:
//   • Orden por TIMESTAMP real de ejecución (fecha + hora), no solo por fecha.
//   • Hora visible en la columna FECHA + separadores por día + marca "ÚLTIMO".
//   • Encabezado pegajoso (sticky) al hacer scroll.
//   • Excel (XLSX) se carga BAJO DEMANDA al exportar (no en el arranque).

// ── Helpers de tiempo (mejor esfuerzo, robustos a datos viejos) ──────────────
// epoch ms a partir del id manual "m<Date.now()><rand>" (Date.now() = 13 dígitos)
const epochFromMovId = (id) => {
  const mm = /^m(\d{13})/.exec(String(id || ''));
  return mm ? parseInt(mm[1], 10) : 0;
};
// Timestamp de ejecución: created_at → id → updated_at → fecha (12:00)
const movTs = (m) => {
  const c = Number(m.created_at);
  if (c > 0) return c;
  const e = epochFromMovId(m.id);
  if (e > 0) return e;
  const u = Number(m.updated_at);
  if (u > 0) return u;
  const f = Date.parse((m.fecha || '') + 'T12:00:00');
  return Number.isFinite(f) ? f : 0;
};
const fmtTime = (ts) => {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

// Inyecta una sola vez los estilos extra de esta vista (evita tocar styles.css,
// así el deploy sigue siendo copiar solo movs-list.jsx + index.html).
function injectMovsViewStyles() {
  if (document.getElementById('movs-view-enhancements')) return;
  const s = document.createElement('style');
  s.id = 'movs-view-enhancements';
  s.textContent = `
    .movs-view .mt-head { position: sticky; top: 0; z-index: 6; }
    .movs-view .mt-row { padding-top: 10px; padding-bottom: 10px; }
    .movs-view .mt-fecha { line-height: 1.2; }
    .movs-view .mt-fecha-d { font-weight: 700; }
    .movs-view .mt-fecha-t { font-size: 10px; opacity: 0.6; margin-top: 1px; letter-spacing: 0.02em; }
    .movs-view .mt-latest-tag {
      display: inline-block; margin-top: 3px;
      font-family: var(--f-mono); font-size: 8px; letter-spacing: 0.1em; font-weight: 700;
      background: var(--primary); color: #fff; padding: 1px 5px; border-radius: 4px;
    }
    .movs-view .mt-daygroup {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 7px 16px;
      background: var(--surface-2);
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .movs-view .mt-daygroup-label {
      font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.1em; font-weight: 700;
      color: var(--primary); text-transform: uppercase;
    }
    .movs-view .mt-daygroup-count { font-family: var(--f-mono); font-size: 10px; opacity: 0.5; }
    .movs-view .mt-row--latest { background: var(--primary-soft); box-shadow: inset 3px 0 0 var(--primary); }
    .movs-view .mt-row--latest:hover { background: var(--primary-soft); }
    .movs-view .btn-export[disabled] { opacity: 0.6; cursor: default; }
    /* Grid de 8 columnas en escritorio: CAJA y USUARIO ya no se empalman y
       las acciones (✎ 🗑) tienen su propia columna en lugar de envolverse abajo.
       Acotado a min-width:881px para NO pisar el layout móvil (max-width:880px). */
    @media (min-width: 881px) {
      .movs-view .mt-head,
      .movs-view .mt-row {
        grid-template-columns: 112px 48px minmax(140px, 1.1fr) minmax(180px, 1.5fr) 156px 120px 104px 56px;
      }
    }
    /* Contener el badge de caja dentro de su columna (sin desbordar a USUARIO) */
    .movs-view .caja-cell { min-width: 0; overflow: hidden; }
    .movs-view .caja-cell .caja-dot { max-width: 100%; min-width: 0; }
    .movs-view .caja-cell .caja-dot > span:last-child {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    .movs-view .actions-cell { min-width: 0; }
  `;
  document.head.appendChild(s);
}

// Carga XLSX bajo demanda (la primera vez que se exporta). Devuelve una promesa.
function ensureXLSX() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    let s = document.getElementById('kbot-xlsx-cdn');
    if (s) {
      if (typeof XLSX !== 'undefined') return resolve();
      s.addEventListener('load', () => resolve());
      s.addEventListener('error', () => reject(new Error('xlsx')));
      return;
    }
    s = document.createElement('script');
    s.id = 'kbot-xlsx-cdn';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('xlsx'));
    document.head.appendChild(s);
  });
}

const MovsListView = ({ movs, cats, cajas = [], onEdit, onDelete, user }) => {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('TODOS');
  const [cat, setCat] = useState('TODAS');
  const [cajaFilter, setCajaFilter] = useState('TODAS');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState('fecha');
  const [sortDir, setSortDir] = useState('desc');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { injectMovsViewStyles(); }, []);

  const yesterdayISO = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Mapa de caja id -> caja para mostrar nombre + ícono + color
  const cajaMap = useMemo(() => {
    const map = {};
    (cajas || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [cajas]);

  const getCajaInfo = (cajaId) => {
    if (!cajaId) return { nombre: '—', icon: '•', color: '#999' };
    const c = cajaMap[cajaId];
    if (c) return { nombre: c.nombre, icon: c.icon || '💵', color: c.color || '#888' };
    // Fallback para movs viejos que tienen el nombre en lugar del ID
    return { nombre: cajaId, icon: '💵', color: '#888' };
  };

  // Helper: obtener nombre de proveedor (campo directo o parseado del concepto)
  const getProveedor = (m) => {
    if (m.proveedor) return m.proveedor;
    if (m.proveedor_nombre) return m.proveedor_nombre;
    if (m.proveedor_id && m.proveedor_id_nombre) return m.proveedor_id_nombre;
    // Fallback: extraer de "Pago a: NOMBRE" o "Pago: NOMBRE"
    const match = (m.concepto || '').match(/^Pago(?:\s+a)?:\s*(.+?)$/i);
    return match ? match[1].trim() : '';
  };

  const filtered = useMemo(() => {
    let r = movs;
    if (tipo !== 'TODOS') r = r.filter(m => m.tipo === tipo);
    if (cat !== 'TODAS') r = r.filter(m => m.categoria === cat);
    if (cajaFilter !== 'TODAS') r = r.filter(m => m.caja === cajaFilter);
    if (from) r = r.filter(m => m.fecha >= from);
    if (to) r = r.filter(m => m.fecha <= to);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(m => {
        const cajaNom = (getCajaInfo(m.caja).nombre || '').toLowerCase();
        const prov = (getProveedor(m) || '').toLowerCase();
        return (m.concepto || '').toLowerCase().includes(s) ||
          (m.categoria || '').toLowerCase().includes(s) ||
          (m.usuario || '').toLowerCase().includes(s) ||
          (m.notas || '').toLowerCase().includes(s) ||
          cajaNom.includes(s) ||
          prov.includes(s) ||
          String(m.monto).includes(s);
      });
    }
    r = [...r].sort((a, b) => {
      if (sortKey === 'monto') {
        const va = Number(a.monto), vb = Number(b.monto);
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      // 'fecha' → ordenar por timestamp real de ejecución (fecha + hora)
      const va = movTs(a), vb = movTs(b);
      if (va !== vb) return sortDir === 'asc' ? va - vb : vb - va;
      // desempate estable
      return String(b.id).localeCompare(String(a.id));
    });
    return r;
  }, [movs, tipo, cat, cajaFilter, from, to, q, sortKey, sortDir, cajaMap]);

  const totals = useMemo(() => {
    const ing = filtered.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gas = filtered.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);
    return { ing, gas, neto: ing - gas, count: filtered.length };
  }, [filtered]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const dayHeading = (iso) => {
    if (iso === todayISO()) return 'HOY · ' + fmtDateLong(iso);
    if (iso === yesterdayISO) return 'AYER · ' + fmtDateLong(iso);
    return fmtDateLong(iso);
  };

  // Export a Excel (.xlsx) usando SheetJS (carga bajo demanda) — respeta filtros
  const exportXLSX = async () => {
    if (filtered.length === 0) {
      alert('No hay movimientos para exportar con los filtros actuales.');
      return;
    }
    setExporting(true);
    try {
      await ensureXLSX();
    } catch (e) {
      setExporting(false);
      alert('No se pudo cargar la librería de Excel. Verifica tu conexión e intenta de nuevo.');
      return;
    }
    if (typeof XLSX === 'undefined') {
      setExporting(false);
      alert('Librería de Excel no disponible. Recarga la página (Ctrl+Shift+R) e intenta de nuevo.');
      return;
    }

    // Construir filas con todas las columnas relevantes
    const data = filtered.map(m => ({
      'FECHA': m.fecha,
      'HORA': fmtTime(movTs(m)),
      'TIPO': m.tipo,
      'CATEGORÍA': m.categoria || '',
      'CONCEPTO': m.concepto || '',
      'PROVEEDOR': getProveedor(m),
      'CAJA': getCajaInfo(m.caja).nombre,
      'USUARIO': m.usuario || '',
      'MÉTODO': m.metodo || '',
      'MONTO': m.tipo === 'INGRESO' ? Number(m.monto) : -Number(m.monto),
      'NOTAS': m.notas || '',
      'ORIGEN': m.cxp_id ? 'CxP' : (m.src || 'manual'),
      'AFECTA SALDO': (m.afecta_saldo === 0 || m.afecta_saldo === false) ? 'NO' : 'SÍ'
    }));

    // Fila de totales al final
    data.push({});
    data.push({
      'FECHA': 'TOTALES',
      'TIPO': totals.count + ' reg.',
      'MÉTODO': 'INGRESOS',
      'MONTO': totals.ing
    });
    data.push({
      'MÉTODO': 'GASTOS',
      'MONTO': -totals.gas
    });
    data.push({
      'MÉTODO': 'NETO',
      'MONTO': totals.neto
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Anchos de columna
    ws['!cols'] = [
      { wch: 12 },  // FECHA
      { wch: 7 },   // HORA
      { wch: 9 },   // TIPO
      { wch: 22 },  // CATEGORÍA
      { wch: 35 },  // CONCEPTO
      { wch: 25 },  // PROVEEDOR
      { wch: 18 },  // CAJA
      { wch: 16 },  // USUARIO
      { wch: 14 },  // MÉTODO
      { wch: 13 },  // MONTO
      { wch: 30 },  // NOTAS
      { wch: 10 },  // ORIGEN
      { wch: 12 }   // AFECTA SALDO
    ];

    // Formato moneda en columna MONTO (J = índice 9)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      const cellRef = XLSX.utils.encode_cell({ c: 9, r: R });
      if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
        ws[cellRef].z = '"$"#,##0.00;[Red]"-$"#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const fname = `movimientos_${ts}.xlsx`;
    XLSX.writeFile(wb, fname);
    setExporting(false);
  };

  // Conteo por día para los separadores (solo cuando se ordena por fecha)
  const grouped = sortKey === 'fecha';
  const showLatest = grouped && sortDir === 'desc';
  const visible = filtered.slice(0, 200);
  const dayCounts = useMemo(() => {
    const m = {};
    visible.forEach(x => { m[x.fecha] = (m[x.fecha] || 0) + 1; });
    return m;
  }, [filtered, sortKey, sortDir]);

  const renderRow = (m, isLatest) => {
    const c = cats.find(x => x.nombre === m.categoria);
    const cajaInfo = getCajaInfo(m.caja);
    const prov = getProveedor(m);
    const hora = fmtTime(movTs(m));
    return (
      <div key={m.id} className={'mt-row' + (isLatest ? ' mt-row--latest' : '')}>
        <div className="mono mt-fecha">
          <div className="mt-fecha-d">{fmtDate(m.fecha)}</div>
          {hora && <div className="mt-fecha-t">{hora}</div>}
          {isLatest && <span className="mt-latest-tag">ÚLTIMO</span>}
        </div>
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
          {m.cxp_id && <span className="src-badge" style={{ background: '#FFD166', color: '#1F2937' }}>CxP</span>}
          {(m.afecta_saldo === 0 || m.afecta_saldo === false) && (
            <span className="src-badge" style={{ background: '#E0E7FF', color: '#3730A3', marginLeft: 4 }}
              title="Este gasto fue descontado del efectivo entregado por el vendedor — queda registrado pero NO mueve el saldo de la caja">
              no afecta saldo
            </span>
          )}
        </div>
        <div className="caja-cell">
          <span className="caja-dot" style={{ background: cajaInfo.color + '22', color: cajaInfo.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>{cajaInfo.icon}</span>
            <span>{cajaInfo.nombre}</span>
          </span>
        </div>
        <div>{m.usuario || '—'}</div>
        <div className={'ar mono amount-cell ' + (m.tipo === 'INGRESO' ? 'pos' : 'neg')}>
          {m.tipo === 'INGRESO' ? '+' : '−'}{fmtMXN(m.monto)}
        </div>
        <div className="actions-cell">
          {(() => {
            if (!user) return null;
            const rol = user.rol;
            if (rol === 'consulta') return null;
            // editar: usuario edita propios; admin/gerente edita todo
            const canEdit = (rol === 'admin' || rol === 'gerente') ||
              (rol === 'usuario' && (m.user_id === user.id || m.usuario === user.nombre));
            // borrar: solo admin y gerente, con PIN (lo maneja el handler)
            const canDelete = rol === 'admin' || rol === 'gerente';
            return (
              <>
                {canEdit && <button className="ic-btn" onClick={() => onEdit(m)} title="Editar">✎</button>}
                {canDelete && <button className="ic-btn danger" onClick={() => onDelete(m.id)} title="Eliminar (requiere PIN)">🗑</button>}
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  // Construye filas + separadores de día (solo agrupa cuando se ordena por fecha)
  const buildRows = () => {
    const els = [];
    let lastDay = null;
    visible.forEach((m, idx) => {
      if (grouped && m.fecha !== lastDay) {
        lastDay = m.fecha;
        els.push(
          <div key={'g-' + m.fecha + '-' + idx} className="mt-daygroup">
            <span className="mt-daygroup-label">{dayHeading(m.fecha)}</span>
            <span className="mt-daygroup-count">{dayCounts[m.fecha]} mov.</span>
          </div>
        );
      }
      els.push(renderRow(m, showLatest && idx === 0));
    });
    return els;
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
            disabled={exporting}
            title="Exportar a Excel los movimientos filtrados"
            style={{ marginLeft: 8 }}
          >
            {exporting ? '⏳ GENERANDO…' : '📊 EXPORTAR EXCEL'}
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
          <select value={cajaFilter} onChange={e => setCajaFilter(e.target.value)} className="text-input compact" title="Filtrar por caja">
            <option value="TODAS">🏠 TODAS LAS CAJAS</option>
            {(cajas || []).filter(c => !c.deleted && !c.archivada).map(c => (
              <option key={c.id} value={c.id}>{c.icon || '💵'} {c.nombre}</option>
            ))}
          </select>
          <div className="date-range">
            <label>DESDE <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>HASTA <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <button className="btn-ghost" onClick={() => { setQ(''); setTipo('TODOS'); setCat('TODAS'); setCajaFilter('TODAS'); setFrom(''); setTo(''); }}>
            LIMPIAR
          </button>
        </div>
      </BotanaCard>

      <BotanaCard className="movs-table-card">
        <div className="movs-table">
          <div className="mt-head">
            <button onClick={() => toggleSort('fecha')}>FECHA/HORA {sortKey === 'fecha' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <div>TIPO</div>
            <div>CATEGORÍA</div>
            <div>CONCEPTO</div>
            <div>CAJA</div>
            <div>USUARIO</div>
            <button onClick={() => toggleSort('monto')} className="ar">MONTO {sortKey === 'monto' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <div></div>
          </div>
          {buildRows()}
          {filtered.length === 0 && <div className="empty pad">No hay movimientos con esos filtros.</div>}
          {filtered.length > 200 && <div className="empty pad">Mostrando 200 de {filtered.length}. Refina la búsqueda.</div>}
        </div>
      </BotanaCard>
    </div>
  );
};

window.MovsListView = MovsListView;
