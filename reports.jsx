// reports.jsx — Reportes diario/semanal/mensual/anual + heatmap + barras + línea
const ReportsView = ({ movs, cats }) => {
  const [period, setPeriod] = useState('mensual'); // diario|semanal|mensual|anual
  const [year, setYear] = useState(new Date().getFullYear());
  const [tipo, setTipo] = useState('TODOS');

  // Build series por periodo
  const series = useMemo(() => {
    const filt = movs.filter(m => yearKey(m.fecha) === String(year) && (tipo === 'TODOS' || m.tipo === tipo));
    const buckets = {};
    filt.forEach(m => {
      let k;
      if (period === 'diario') k = m.fecha;
      else if (period === 'semanal') k = weekKey(m.fecha);
      else if (period === 'mensual') k = monthKey(m.fecha);
      else k = yearKey(m.fecha);
      if (!buckets[k]) buckets[k] = { k, ing: 0, gas: 0 };
      if (m.tipo === 'INGRESO') buckets[k].ing += m.monto;
      else buckets[k].gas += m.monto;
    });
    return Object.values(buckets).sort((a, b) => a.k.localeCompare(b.k));
  }, [movs, period, year, tipo]);

  // Heatmap calendario del año
  const heatmap = useMemo(() => {
    const map = {};
    movs.filter(m => yearKey(m.fecha) === String(year)).forEach(m => {
      if (!map[m.fecha]) map[m.fecha] = { ing: 0, gas: 0, count: 0 };
      if (m.tipo === 'INGRESO') map[m.fecha].ing += m.monto;
      else map[m.fecha].gas += m.monto;
      map[m.fecha].count++;
    });
    return map;
  }, [movs, year]);

  const totals = useMemo(() => {
    const f = movs.filter(m => yearKey(m.fecha) === String(year));
    const ing = f.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
    const gas = f.filter(m => m.tipo === 'GASTO').reduce((s, m) => s + m.monto, 0);
    return { ing, gas, neto: ing - gas, count: f.length };
  }, [movs, year]);

  const years = useMemo(() => {
    const ys = new Set(movs.map(m => yearKey(m.fecha)));
    ys.add(String(new Date().getFullYear()));
    return Array.from(ys).sort();
  }, [movs]);

  const exportCSV = () => {
    const rows = [['fecha', 'tipo', 'categoria', 'concepto', 'monto', 'metodo', 'caja', 'usuario', 'notas']];
    const filt = movs.filter(m => yearKey(m.fecha) === String(year));
    filt.forEach(m => rows.push([m.fecha, m.tipo, m.categoria, m.concepto, m.monto, m.metodo, m.caja, m.usuario, (m.notas || '').replace(/[\n;]/g, ' ')]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kbotanas-${year}.csv`;
    a.click();
  };

  const printPDF = () => window.print();

  return (
    <div className="view reports-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">ANÁLISIS · {year}</div>
          <h1 className="view-title">REPORTES</h1>
        </div>
        <div className="head-actions">
          <button className="btn-ghost" onClick={exportCSV}>↓ EXCEL/CSV</button>
          <button className="btn-ghost" onClick={printPDF}>↓ PDF</button>
        </div>
      </header>

      <div className="reports-toolbar">
        <div className="seg">
          {['diario', 'semanal', 'mensual', 'anual'].map(p => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
        <div className="seg">
          {['TODOS', 'INGRESO', 'GASTO'].map(t => (
            <button key={t} className={tipo === t ? 'active' : ''} onClick={() => setTipo(t)}>{t}</button>
          ))}
        </div>
        <select className="text-input compact" value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="rep-kpis">
        <BotanaCard className="kpi" accent="var(--green)"><div className="kpi-label">INGRESOS {year}</div><div className="kpi-value mono">{fmtMXN(totals.ing)}</div></BotanaCard>
        <BotanaCard className="kpi" accent="var(--red)"><div className="kpi-label">GASTOS {year}</div><div className="kpi-value mono">{fmtMXN(totals.gas)}</div></BotanaCard>
        <BotanaCard className={'kpi ' + (totals.neto >= 0 ? 'pos' : 'neg')} accent="var(--ink)"><div className="kpi-label">NETO {year}</div><div className="kpi-value mono">{fmtMXN(totals.neto)}</div></BotanaCard>
        <BotanaCard className="kpi" accent="var(--yellow)"><div className="kpi-label">MOVIMIENTOS</div><div className="kpi-value mono">{totals.count}</div></BotanaCard>
      </div>

      <div className="dash-grid">
        <BotanaCard className="rep-line">
          <div className="card-head">
            <h3>TENDENCIA · {period.toUpperCase()}</h3>
            <span className="card-tag">{series.length} periodos</span>
          </div>
          <LineChart data={series} />
        </BotanaCard>

        <BotanaCard className="rep-bars">
          <div className="card-head">
            <h3>COMPARATIVO INGRESOS vs GASTOS</h3>
          </div>
          <BarChart data={series} />
        </BotanaCard>

        <BotanaCard className="rep-heat">
          <div className="card-head">
            <h3>CALENDARIO {year}</h3>
            <span className="card-tag">DÍAS CON MÁS MOVIMIENTO</span>
          </div>
          <Heatmap year={year} data={heatmap} tipo={tipo} />
        </BotanaCard>
      </div>
    </div>
  );
};

function LineChart({ data }) {
  const W = 720, H = 220, P = 28;
  if (data.length === 0) return <div className="empty pad">Sin datos</div>;
  const max = Math.max(1, ...data.map(d => Math.max(d.ing, d.gas)));
  const x = (i) => P + (i / Math.max(1, data.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const path = (key) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="var(--line)" strokeDasharray="2 4" />
      ))}
      <path d={path('ing')} fill="none" stroke="var(--green)" strokeWidth="2.5" />
      <path d={path('gas')} fill="none" stroke="var(--red)" strokeWidth="2.5" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.ing)} r="3" fill="var(--green)" />
          <circle cx={x(i)} cy={y(d.gas)} r="3" fill="var(--red)" />
        </g>
      ))}
      {data.map((d, i) => (
        i % Math.max(1, Math.ceil(data.length / 8)) === 0 ?
          <text key={'l' + i} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--ink-soft)">{d.k.slice(-5)}</text> : null
      ))}
    </svg>
  );
}

function BarChart({ data }) {
  const W = 720, H = 220, P = 28;
  if (data.length === 0) return <div className="empty pad">Sin datos</div>;
  const max = Math.max(1, ...data.map(d => Math.max(d.ing, d.gas)));
  const bw = (W - 2 * P) / data.length / 2.6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="var(--line)" strokeDasharray="2 4" />
      ))}
      {data.map((d, i) => {
        const cx = P + (i + 0.5) / data.length * (W - 2 * P);
        const hi = (d.ing / max) * (H - 2 * P);
        const hg = (d.gas / max) * (H - 2 * P);
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={H - P - hi} width={bw} height={hi} fill="var(--green)" />
            <rect x={cx + 1} y={H - P - hg} width={bw} height={hg} fill="var(--red)" />
            {i % Math.max(1, Math.ceil(data.length / 8)) === 0 &&
              <text x={cx} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--ink-soft)">{d.k.slice(-5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Heatmap({ year, data, tipo }) {
  // 53 weeks x 7 days
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const cells = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    cells.push(new Date(d));
  }
  // Reorder by week starting Sunday
  const firstDow = start.getDay();
  const grid = [];
  for (let i = 0; i < firstDow; i++) grid.push(null);
  cells.forEach(c => grid.push(c));

  const valFor = (date) => {
    const iso = date.toISOString().slice(0, 10);
    const d = data[iso];
    if (!d) return 0;
    if (tipo === 'INGRESO') return d.ing;
    if (tipo === 'GASTO') return d.gas;
    return d.ing + d.gas;
  };
  const max = Math.max(1, ...Object.values(data).map(d => (tipo === 'INGRESO' ? d.ing : tipo === 'GASTO' ? d.gas : d.ing + d.gas)));

  const colorFor = (v) => {
    if (!v) return 'var(--heat-0)';
    const t = Math.min(1, v / max);
    if (tipo === 'GASTO') {
      if (t < 0.2) return '#FFD9C4';
      if (t < 0.45) return '#FF9A6B';
      if (t < 0.75) return '#FF6B35';
      return '#D62828';
    }
    if (tipo === 'INGRESO') {
      if (t < 0.2) return '#C9F0DA';
      if (t < 0.45) return '#7BD9A1';
      if (t < 0.75) return '#3FB984';
      return '#1A8754';
    }
    if (t < 0.2) return '#FFEAB8';
    if (t < 0.45) return '#FFB800';
    if (t < 0.75) return '#FF6B35';
    return '#E63946';
  };

  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  return (
    <div className="heat-wrap">
      <div className="heat-months">
        {months.map(m => <span key={m}>{m}</span>)}
      </div>
      <div className="heat-grid">
        {grid.map((d, i) => {
          if (!d) return <span key={i} className="heat-cell empty-cell" />;
          const v = valFor(d);
          const iso = d.toISOString().slice(0, 10);
          return (
            <span
              key={i}
              className="heat-cell"
              style={{ background: colorFor(v) }}
              title={`${fmtDate(iso)} · ${fmtMXN(v)}`}
            />
          );
        })}
      </div>
      <div className="heat-legend">
        <span>menos</span>
        <i style={{ background: 'var(--heat-0)' }} />
        <i style={{ background: '#FFEAB8' }} />
        <i style={{ background: '#FFB800' }} />
        <i style={{ background: '#FF6B35' }} />
        <i style={{ background: '#E63946' }} />
        <span>más</span>
      </div>
    </div>
  );
}

window.ReportsView = ReportsView;
