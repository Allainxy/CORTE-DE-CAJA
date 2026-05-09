// dashboard.jsx — Vista principal con resumen del día
const DashboardView = ({ movs, cats, setActive, openCapture }) => {
  const today = todayISO();

  const summary = useMemo(() => {
    const todayMovs = movs.filter(m => m.fecha === today);
    const ingHoy = todayMovs.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gasHoy = todayMovs.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);

    // Mes en curso
    const mk = monthKey(today);
    const mesMovs = movs.filter(m => monthKey(m.fecha) === mk);
    const ingMes = mesMovs.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gasMes = mesMovs.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);

    // Mes anterior comparativo
    const prev = new Date(today + 'T12:00:00');
    prev.setMonth(prev.getMonth() - 1);
    const pmk = prev.toISOString().slice(0, 7);
    const prevMovs = movs.filter(m => monthKey(m.fecha) === pmk);
    const ingPrev = prevMovs.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gasPrev = prevMovs.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);

    return {
      todayMovs,
      ingHoy, gasHoy, netoHoy: ingHoy - gasHoy,
      ingMes, gasMes, netoMes: ingMes - gasMes,
      ingPrev, gasPrev,
      ingDelta: ingPrev ? ((ingMes - ingPrev) / ingPrev * 100) : 0,
      gasDelta: gasPrev ? ((gasMes - gasPrev) / gasPrev * 100) : 0,
    };
  }, [movs, today]);

  // Mini sparkline últimos 14 días
  const spark = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const ing = movs.filter(m => m.fecha === iso && m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
      const gas = movs.filter(m => m.fecha === iso && m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);
      days.push({ iso, ing, gas, neto: ing - gas });
    }
    return days;
  }, [movs]);

  // Top categorías del mes
  const topCats = useMemo(() => {
    const mk = monthKey(today);
    const mesMovs = movs.filter(m => monthKey(m.fecha) === mk);
    const byCat = {};
    mesMovs.forEach(m => {
      const k = m.tipo + '|' + m.categoria;
      byCat[k] = (byCat[k] || 0) + m.monto;
    });
    return Object.entries(byCat)
      .map(([k, v]) => {
        const [tipo, nombre] = k.split('|');
        const cat = cats.find(c => c.nombre === nombre && c.tipo === tipo);
        return { tipo, nombre, total: v, color: cat?.color || '#888', icon: cat?.icon || '•' };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [movs, cats, today]);

  const recientes = useMemo(() => {
    return [...movs].sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id)).slice(0, 8);
  }, [movs]);

  return (
    <div className="view dashboard-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CAJA DEL DÍA</div>
          <h1 className="view-title">{fmtDateLong(today).toUpperCase()}</h1>
        </div>
        <div className="head-actions">
          <button className="btn-ghost" onClick={() => setActive('reportes')}>
            VER REPORTES →
          </button>
          <button className="btn-primary" onClick={openCapture}>
            + REGISTRAR
          </button>
        </div>
      </header>

      {/* KPI ROW */}
      <div className="kpi-grid">
        <BotanaCard className="kpi kpi-ing" accent="var(--green)">
          <div className="kpi-label">INGRESOS HOY</div>
          <div className="kpi-value mono">{fmtMXN(summary.ingHoy)}</div>
          <div className="kpi-sub">{summary.todayMovs.filter(m => m.tipo === 'INGRESO').length} movimientos</div>
        </BotanaCard>
        <BotanaCard className="kpi kpi-gas" accent="var(--red)">
          <div className="kpi-label">GASTOS HOY</div>
          <div className="kpi-value mono">{fmtMXN(summary.gasHoy)}</div>
          <div className="kpi-sub">{summary.todayMovs.filter(m => m.tipo === 'GASTO').length} movimientos</div>
        </BotanaCard>
        <BotanaCard className={'kpi kpi-net ' + (summary.netoHoy >= 0 ? 'pos' : 'neg')} accent="var(--ink)">
          <div className="kpi-label">NETO HOY</div>
          <div className="kpi-value mono">{summary.netoHoy >= 0 ? '+' : ''}{fmtMXN(summary.netoHoy)}</div>
          <div className="kpi-sub">{summary.netoHoy >= 0 ? 'GANANCIA' : 'PÉRDIDA'} EN CAJA</div>
        </BotanaCard>
        <BotanaCard className="kpi kpi-mes" accent="var(--yellow)">
          <div className="kpi-label">NETO DEL MES</div>
          <div className="kpi-value mono">{fmtMXN(summary.netoMes)}</div>
          <div className="kpi-sub">
            <span className={summary.ingDelta >= 0 ? 'delta-up' : 'delta-down'}>
              {summary.ingDelta >= 0 ? '▲' : '▼'} {Math.abs(summary.ingDelta).toFixed(1)}% ingresos vs mes anterior
            </span>
          </div>
        </BotanaCard>
      </div>

      {/* GRID 2-col */}
      <div className="dash-grid">
        {/* Sparkline 14 días */}
        <BotanaCard className="dash-spark">
          <div className="card-head">
            <h3>ÚLTIMOS 14 DÍAS</h3>
            <span className="card-tag">INGRESOS vs GASTOS</span>
          </div>
          <SparkChart data={spark} />
          <div className="spark-legend">
            <span><i style={{ background: 'var(--green)' }} /> Ingresos</span>
            <span><i style={{ background: 'var(--red)' }} /> Gastos</span>
            <span><i style={{ background: 'var(--ink)' }} /> Neto</span>
          </div>
        </BotanaCard>

        {/* Top cats */}
        <BotanaCard className="dash-cats">
          <div className="card-head">
            <h3>TOP CATEGORÍAS DEL MES</h3>
            <span className="card-tag">MES EN CURSO</span>
          </div>
          <div className="cat-list">
            {topCats.map((c, i) => {
              const max = topCats[0]?.total || 1;
              return (
                <div key={i} className="cat-row">
                  <div className="cat-row-left">
                    <span className="cat-icon" style={{ background: c.color }}>{c.icon}</span>
                    <div>
                      <div className="cat-name">{c.nombre}</div>
                      <div className="cat-tipo">{c.tipo}</div>
                    </div>
                  </div>
                  <div className="cat-row-right">
                    <div className="cat-amt mono">{fmtMXN(c.total)}</div>
                    <div className="cat-bar"><i style={{ width: (c.total / max * 100) + '%', background: c.color }} /></div>
                  </div>
                </div>
              );
            })}
            {topCats.length === 0 && <div className="empty">Sin movimientos este mes</div>}
          </div>
        </BotanaCard>

        {/* Recientes */}
        <BotanaCard className="dash-recent">
          <div className="card-head">
            <h3>MOVIMIENTOS RECIENTES</h3>
            <button className="link-btn" onClick={() => setActive('movs')}>Ver todos →</button>
          </div>
          <div className="mov-mini-list">
            {recientes.map(m => {
              const cat = cats.find(c => c.nombre === m.categoria);
              return (
                <div key={m.id} className="mov-mini">
                  <span className="mov-mini-icon" style={{ background: cat?.color || '#888' }}>{cat?.icon || '•'}</span>
                  <div className="mov-mini-mid">
                    <div className="mov-mini-concept">{m.concepto || m.categoria}</div>
                    <div className="mov-mini-meta">{m.categoria} · {fmtDate(m.fecha)}</div>
                  </div>
                  <div className={'mov-mini-amt mono ' + (m.tipo === 'INGRESO' ? 'pos' : 'neg')}>
                    {m.tipo === 'INGRESO' ? '+' : '−'}{fmtMXN(m.monto)}
                  </div>
                </div>
              );
            })}
            {recientes.length === 0 && <div className="empty">Aún sin movimientos. ¡Captura el primero!</div>}
          </div>
        </BotanaCard>

        {/* Acceso rápido */}
        <BotanaCard className="dash-quick">
          <div className="card-head">
            <h3>ACCESOS RÁPIDOS</h3>
          </div>
          <div className="quick-grid">
            <button className="quick-tile q-ing" onClick={() => openCapture('INGRESO')}>
              <span className="qt-icon">+</span>
              <span className="qt-label">INGRESO</span>
            </button>
            <button className="quick-tile q-gas" onClick={() => openCapture('GASTO')}>
              <span className="qt-icon">−</span>
              <span className="qt-label">GASTO</span>
            </button>
            <button className="quick-tile q-xml" onClick={() => setActive('xml')}>
              <span className="qt-icon">⤓</span>
              <span className="qt-label">IMPORTAR XML</span>
            </button>
            <button className="quick-tile q-rep" onClick={() => setActive('reportes')}>
              <span className="qt-icon">≡</span>
              <span className="qt-label">REPORTES</span>
            </button>
          </div>
        </BotanaCard>
      </div>
    </div>
  );
};

// ---------- SVG sparkline-ish dual chart ----------
function SparkChart({ data }) {
  const W = 720, H = 180, P = 18;
  const max = Math.max(1, ...data.map(d => Math.max(d.ing, d.gas)));
  const x = (i) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const path = (key) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = (key) => path(key) + ` L${x(data.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  const today = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--green)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gGas" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--red)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="var(--line)" strokeDasharray="3 4" />
      ))}
      <path d={area('ing')} fill="url(#gIng)" />
      <path d={area('gas')} fill="url(#gGas)" />
      <path d={path('ing')} fill="none" stroke="var(--green)" strokeWidth="2.5" />
      <path d={path('gas')} fill="none" stroke="var(--red)" strokeWidth="2.5" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.ing)} r={i === data.length - 1 ? 4 : 2.2} fill="var(--green)" />
          <circle cx={x(i)} cy={y(d.gas)} r={i === data.length - 1 ? 4 : 2.2} fill="var(--red)" />
        </g>
      ))}
      <g className="spark-today">
        <line x1={x(data.length - 1)} x2={x(data.length - 1)} y1={P} y2={H - P} stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

window.DashboardView = DashboardView;
