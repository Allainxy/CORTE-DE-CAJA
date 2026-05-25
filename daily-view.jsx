// daily-view.jsx — RESUMEN POR DÍA
// Vista de corte diario al estilo del Excel antiguo: agrupa los movimientos
// por DÍA y, dentro de cada día, por CATEGORÍA (ventas en total, cada nómina
// por su concepto, etc.), con columnas INGRESOS / EGRESOS, subtotal por día y
// totales generales. No modifica la lista de Movimientos. Exporta a Excel.
// v2026-05-24c

(function injectDailyStyles() {
  if (document.getElementById('daily-view-styles')) return;
  const s = document.createElement('style');
  s.id = 'daily-view-styles';
  s.textContent = `
    .daily-view .dv-band {
      background: var(--yellow, #FFD166); color: var(--ink);
      border: 2px solid var(--line-strong); border-radius: 12px;
      padding: 14px 18px; margin-bottom: 16px;
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px;
    }
    .daily-view .dv-band .dv-band-main { font-family: var(--f-display); font-size: 20px; }
    .daily-view .dv-band .dv-band-kv { font-family: var(--f-mono); font-size: 12px; }
    .daily-view .dv-band .dv-band-kv b { font-size: 15px; }
    .daily-view .dv-pos { color: var(--green); }
    .daily-view .dv-neg { color: var(--red); }
    .daily-view .dv-day { padding: 0; overflow: hidden; margin-bottom: 14px; }
    .daily-view .dv-day-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex-wrap: wrap; padding: 12px 16px;
      background: var(--ink); color: var(--bg);
    }
    .daily-view .dv-day-title { font-family: var(--f-mono); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; }
    .daily-view .dv-day-totals { display: flex; gap: 14px; font-family: var(--f-mono); font-size: 12px; }
    .daily-view .dv-row, .daily-view .dv-rowhead, .daily-view .dv-subtotal {
      display: grid; grid-template-columns: 1fr 150px 150px; gap: 10px;
      padding: 9px 16px; align-items: center; font-size: 13px;
    }
    .daily-view .dv-rowhead {
      background: var(--surface-2); font-family: var(--f-mono); font-size: 10px;
      letter-spacing: 0.1em; color: var(--ink-soft, #666); border-bottom: 1px solid var(--line);
    }
    .daily-view .dv-row { border-bottom: 1px dashed var(--line); }
    .daily-view .dv-row:hover { background: var(--surface-2); }
    .daily-view .dv-cat { display: flex; align-items: center; gap: 9px; min-width: 0; font-weight: 600; }
    .daily-view .dv-cat .dv-dot {
      width: 22px; height: 22px; display: grid; place-items: center; border-radius: 5px;
      color: #fff; font-size: 11px; border: 1.5px solid var(--line-strong); flex: none;
    }
    .daily-view .dv-cat .dv-cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .daily-view .dv-cat .dv-count { font-family: var(--f-mono); font-size: 10px; opacity: 0.5; flex: none; }
    .daily-view .dv-num { text-align: right; font-family: var(--f-mono); font-weight: 700; }
    .daily-view .dv-num.zero { opacity: 0.25; font-weight: 400; }
    .daily-view .dv-subtotal {
      background: var(--surface-2); font-weight: 700; border-top: 2px solid var(--line-strong);
    }
    .daily-view .dv-subtotal .dv-sub-label { font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.06em; }
    .daily-view .dv-empty { padding: 30px; text-align: center; opacity: 0.6; }
    .daily-view .dv-info { border-top: 1px dashed var(--line); background: #F4F6FF; }
    .daily-view .dv-info-head { padding: 7px 16px; font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.06em; font-weight: 700; color: #3730A3; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
    .daily-view .dv-info-note { font-weight: 400; opacity: 0.65; letter-spacing: 0; font-size: 10px; }
    .daily-view .dv-info-row { opacity: 0.9; }
    .daily-view .dv-info-amt { color: #6366F1; font-style: italic; }
    .daily-view .btn-export[disabled] { opacity: 0.6; cursor: default; }
    @media (max-width: 700px) {
      .daily-view .dv-row, .daily-view .dv-rowhead, .daily-view .dv-subtotal {
        grid-template-columns: 1fr 100px 100px; font-size: 12px;
      }
    }
  `;
  document.head.appendChild(s);
})();

// Carga XLSX bajo demanda (nombre propio para no chocar con movs-list)
function dvEnsureXLSX() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    let s = document.getElementById('kbot-xlsx-cdn');
    if (s) { s.addEventListener('load', () => resolve()); s.addEventListener('error', () => reject(new Error('xlsx'))); return; }
    s = document.createElement('script');
    s.id = 'kbot-xlsx-cdn';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('xlsx'));
    document.head.appendChild(s);
  });
}

const DailyView = ({ movs = [], cats = [], cajas = [] }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const yesterdayISO = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const catMap = useMemo(() => {
    const m = {};
    (cats || []).forEach(c => { m[c.nombre] = c; });
    return m;
  }, [cats]);

  const filtered = useMemo(() => {
    let r = (movs || []).filter(m => !m.deleted);
    if (from) r = r.filter(m => m.fecha >= from);
    if (to) r = r.filter(m => m.fecha <= to);
    return r;
  }, [movs, from, to]);

  // Un movimiento "no afecta saldo" cuando afecta_saldo es 0/false (igual que en
  // Movimientos): es un gasto que el vendedor ya descontó del efectivo entregado,
  // por lo que NO debe sumarse al resumen (se doble-contaría). Se muestra aparte.
  const noAfecta = (m) => (m.afecta_saldo === 0 || m.afecta_saldo === false);

  // Agrupar por día → por categoría (solo lo que afecta saldo cuenta en los totales)
  const dias = useMemo(() => {
    const byDay = {};
    filtered.forEach(m => {
      const f = m.fecha || 'sin-fecha';
      if (!byDay[f]) byDay[f] = { fecha: f, cats: {}, ingresos: 0, egresos: 0, info: {}, infoTotal: 0, infoCount: 0 };
      const d = byDay[f];
      const cat = m.categoria || 'SIN CATEGORÍA';
      const monto = Number(m.monto) || 0;

      if (noAfecta(m)) {
        // Bloque informativo: NO suma a ingresos/egresos del día.
        if (!d.info[cat]) d.info[cat] = { categoria: cat, monto: 0, count: 0 };
        d.info[cat].monto += monto;
        d.info[cat].count++;
        d.infoTotal += monto;
        d.infoCount++;
        return;
      }

      if (!d.cats[cat]) d.cats[cat] = { categoria: cat, ingresos: 0, egresos: 0, count: 0 };
      if (m.tipo === 'INGRESO') { d.cats[cat].ingresos += monto; d.ingresos += monto; }
      else { d.cats[cat].egresos += monto; d.egresos += monto; }
      d.cats[cat].count++;
    });
    return Object.values(byDay)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      .map(d => ({
        ...d,
        neto: d.ingresos - d.egresos,
        lineas: Object.values(d.cats).sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos)),
        infoLineas: Object.values(d.info).sort((a, b) => b.monto - a.monto)
      }));
  }, [filtered]);

  const grand = useMemo(() => {
    let ing = 0, gas = 0, info = 0, infoCount = 0;
    filtered.forEach(m => {
      const v = Number(m.monto) || 0;
      if (noAfecta(m)) { info += v; infoCount++; return; }
      if (m.tipo === 'INGRESO') ing += v; else gas += v;
    });
    return { ing, gas, neto: ing - gas, info, infoCount, dias: dias.length, count: filtered.length };
  }, [filtered, dias]);

  const dayHeading = (iso) => {
    if (iso === todayISO()) return 'HOY · ' + fmtDateLong(iso);
    if (iso === yesterdayISO) return 'AYER · ' + fmtDateLong(iso);
    return fmtDateLong(iso);
  };

  const semanaDelMes = (iso) => {
    const dia = parseInt((iso || '').split('-')[2] || '0', 10);
    return dia ? ('SEMANA ' + Math.ceil(dia / 7)) : '';
  };
  const mesNombre = (iso) => {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long' }).toUpperCase(); }
    catch { return ''; }
  };

  const exportXLSX = async () => {
    if (dias.length === 0) { alert('No hay movimientos para exportar con los filtros actuales.'); return; }
    setExporting(true);
    try { await dvEnsureXLSX(); } catch (e) { setExporting(false); alert('No se pudo cargar la librería de Excel. Verifica tu conexión.'); return; }
    if (typeof XLSX === 'undefined') { setExporting(false); alert('Librería de Excel no disponible.'); return; }

    const aoa = [];
    aoa.push(['SALDO MOVIMIENTOS', '', '', '', grand.neto]);
    aoa.push(['TOTAL EGRESOS', '', '', '', -grand.gas]);
    aoa.push(['TOTAL INGRESOS', '', '', '', grand.ing]);
    aoa.push([]);
    aoa.push(['MES', 'SEMANA', 'FECHA', 'CONCEPTO', 'INGRESOS', 'EGRESOS']);
    dias.forEach(d => {
      d.lineas.forEach(l => {
        aoa.push([
          mesNombre(d.fecha),
          semanaDelMes(d.fecha),
          d.fecha,
          l.categoria,
          l.ingresos || '',
          l.egresos || ''
        ]);
      });
      aoa.push(['', '', '', 'SUBTOTAL ' + d.fecha, d.ingresos, d.egresos]);
      aoa.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen por día');
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    XLSX.writeFile(wb, `resumen_diario_${ts}.xlsx`);
    setExporting(false);
  };

  return (
    <div className="view daily-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">CORTE DIARIO</div>
          <h1 className="view-title">RESUMEN POR DÍA</h1>
        </div>
        <div className="head-actions mono">
          <span className="pill">{grand.dias} días</span>
          <span className="pill pill-ing">+{fmtMXN(grand.ing)}</span>
          <span className="pill pill-gas">−{fmtMXN(grand.gas)}</span>
          <span className={'pill pill-net ' + (grand.neto >= 0 ? 'pos' : 'neg')}>= {fmtMXN(grand.neto)}</span>
          <button className="btn-ghost btn-export" onClick={exportXLSX} disabled={exporting} style={{ marginLeft: 8 }}
            title="Exportar el resumen a Excel">
            {exporting ? '⏳ GENERANDO…' : '📊 EXPORTAR EXCEL'}
          </button>
        </div>
      </header>

      <div className="dv-band">
        <span className="dv-band-main">SALDO MOVIMIENTOS</span>
        <span className={'dv-band-main ' + (grand.neto >= 0 ? 'dv-pos' : 'dv-neg')}>{fmtMXN(grand.neto)}</span>
        <span className="dv-band-kv">TOTAL INGRESOS <b className="dv-pos">{fmtMXN(grand.ing)}</b></span>
        <span className="dv-band-kv">TOTAL EGRESOS <b className="dv-neg">{fmtMXN(grand.gas)}</b></span>
        <span className="dv-band-kv">{grand.count} movimientos</span>
        {grand.infoCount > 0 && <span className="dv-band-kv" style={{ opacity: 0.7 }}>+{grand.infoCount} no afecta saldo ({fmtMXN(grand.info)})</span>}
      </div>

      <BotanaCard className="filter-bar">
        <div className="filter-row">
          <div className="date-range">
            <label>DESDE <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>HASTA <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <button className="btn-ghost" onClick={() => { setFrom(''); setTo(''); }}>LIMPIAR</button>
          <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
            La caja se filtra con el selector de arriba.
          </span>
        </div>
      </BotanaCard>

      {dias.length === 0 && (
        <BotanaCard><div className="dv-empty">No hay movimientos en el rango seleccionado.</div></BotanaCard>
      )}

      {dias.map(d => (
        <BotanaCard key={d.fecha} className="dv-day">
          <div className="dv-day-head">
            <span className="dv-day-title">{dayHeading(d.fecha)}</span>
            <span className="dv-day-totals">
              <span className="dv-pos">+{fmtMXN(d.ingresos)}</span>
              <span className="dv-neg">−{fmtMXN(d.egresos)}</span>
              <span>= {fmtMXN(d.neto)}</span>
            </span>
          </div>
          <div className="dv-rowhead">
            <div>CONCEPTO / CATEGORÍA</div>
            <div className="dv-num">INGRESOS</div>
            <div className="dv-num">EGRESOS</div>
          </div>
          {d.lineas.map(l => {
            const c = catMap[l.categoria];
            return (
              <div key={l.categoria} className="dv-row">
                <div className="dv-cat">
                  <span className="dv-dot" style={{ background: c?.color || '#888' }}>{c?.icon || '•'}</span>
                  <span className="dv-cat-name">{l.categoria}</span>
                  <span className="dv-count">×{l.count}</span>
                </div>
                <div className={'dv-num dv-pos ' + (l.ingresos ? '' : 'zero')}>{l.ingresos ? '+' + fmtMXN(l.ingresos) : '—'}</div>
                <div className={'dv-num dv-neg ' + (l.egresos ? '' : 'zero')}>{l.egresos ? '−' + fmtMXN(l.egresos) : '—'}</div>
              </div>
            );
          })}
          <div className="dv-subtotal">
            <div className="dv-sub-label">SUBTOTAL DEL DÍA</div>
            <div className="dv-num dv-pos">+{fmtMXN(d.ingresos)}</div>
            <div className="dv-num dv-neg">−{fmtMXN(d.egresos)}</div>
          </div>
          {d.infoLineas && d.infoLineas.length > 0 && (
            <div className="dv-info">
              <div className="dv-info-head">
                ⓘ NO AFECTA SALDO · informativo
                <span className="dv-info-note">estos gastos ya fueron descontados del efectivo entregado — no se suman al resumen</span>
              </div>
              {d.infoLineas.map(l => {
                const c = catMap[l.categoria];
                return (
                  <div key={l.categoria} className="dv-row dv-info-row">
                    <div className="dv-cat">
                      <span className="dv-dot" style={{ background: c?.color || '#888' }}>{c?.icon || '•'}</span>
                      <span className="dv-cat-name">{l.categoria}</span>
                      <span className="dv-count">×{l.count}</span>
                    </div>
                    <div className="dv-num zero">—</div>
                    <div className="dv-num dv-info-amt">({fmtMXN(l.monto)})</div>
                  </div>
                );
              })}
            </div>
          )}
        </BotanaCard>
      ))}
    </div>
  );
};

window.DailyView = DailyView;
