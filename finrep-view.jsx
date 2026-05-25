// finrep-view.jsx — REPORTE FINANCIERO (Estado de flujo de efectivo)
// Secciones (arrastrables): INGRESOS − COSTO DE VENTA = UTILIDAD BRUTA
//   − GASTOS = FLUJO OPERATIVO ; TRANSFERENCIAS / OTROS (informativo).
// DENTRO de cada sección, las categorías se agrupan por su GRUPO del sistema
//   (group_id), con subtotal por grupo y grupos colapsables.
// Columnas por SEMANA dentro del periodo (Semana / Mes / Año).
// La clasificación categoría→sección se guarda GLOBAL en el servidor
//   (app_settings, clave 'finrep_classification').
// v2026-05-24e
const { useState, useEffect, useMemo, useRef } = React;

const FINREP_SETTING_KEY = 'finrep_classification';
const FINREP_SECTIONS = [
  { id: 'ingreso',   label: 'INGRESOS',                tone: 'pos',  sign: 1,  desc: 'Ventas y entradas de dinero' },
  { id: 'costo',     label: 'COSTO DE VENTA',          tone: 'neg',  sign: -1, desc: 'Mercancía, bobina, bolsa, etiqueta…' },
  { id: 'gasto',     label: 'GASTOS',                  tone: 'neg',  sign: -1, desc: 'Operación: nómina, renta, servicios…' },
  { id: 'transfer',  label: 'TRANSFERENCIAS / OTROS',  tone: 'info', sign: 1,  desc: 'Movimientos entre cajas, créditos (no afectan el flujo)' }
];
const SIN_GRUPO = '__sin_grupo__';

(function injectFinrepStyles() {
  const old = document.getElementById('finrep-styles'); if (old) old.remove();
  const s = document.createElement('style');
  s.id = 'finrep-styles';
  s.textContent = `
    .finrep-view .fr-controls { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: flex-end; }
    .finrep-view .fr-controls label { display: flex; flex-direction: column; gap: 4px; font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.08em; color: var(--ink-soft, #666); }
    .finrep-view .fr-seg { display: inline-flex; border: 2px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
    .finrep-view .fr-seg button { border: none; background: var(--surface); padding: 8px 14px; font-family: var(--f-mono); font-size: 12px; font-weight: 700; cursor: pointer; }
    .finrep-view .fr-seg button.active { background: var(--primary); color: #fff; }

    .finrep-view .fr-table-wrap { overflow-x: auto; border-radius: 12px; border: 2px solid var(--line-strong); }
    .finrep-view table.fr-table { border-collapse: collapse; width: 100%; min-width: 640px; font-size: 13px; }
    .finrep-view .fr-table th, .finrep-view .fr-table td { padding: 7px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--line); }
    .finrep-view .fr-table th:first-child, .finrep-view .fr-table td:first-child { text-align: left; position: sticky; left: 0; background: var(--surface); z-index: 2; min-width: 240px; }
    .finrep-view .fr-table thead th { background: var(--ink); color: var(--bg); font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.06em; position: sticky; top: 0; z-index: 3; }
    .finrep-view .fr-table thead th:first-child { z-index: 4; }
    .finrep-view .fr-num { font-family: var(--f-mono); font-weight: 700; }
    .finrep-view .fr-pos { color: var(--green); }
    .finrep-view .fr-neg { color: var(--red); }
    .finrep-view .fr-zero { opacity: 0.25; font-weight: 400; }
    .finrep-view .fr-total-col { background: var(--surface-2); font-weight: 800; }

    .finrep-view .fr-sec-head td { background: var(--surface-2); font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.1em; font-weight: 800; text-transform: uppercase; border-top: 2px solid var(--line-strong); }
    .finrep-view .fr-sec-head.pos td { color: var(--green); }
    .finrep-view .fr-sec-head.neg td { color: var(--red); }
    .finrep-view .fr-sec-head.info td { color: var(--ink-soft, #555); }

    .finrep-view .fr-grp td:first-child { padding-left: 22px; cursor: pointer; font-weight: 700; }
    .finrep-view .fr-grp td { background: rgba(0,0,0,0.025); }
    .finrep-view .fr-grp .fr-caret { display: inline-block; width: 14px; font-family: var(--f-mono); opacity: 0.6; }
    .finrep-view .fr-grp .fr-grp-dot { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; color: #fff; font-size: 10px; margin-right: 7px; vertical-align: middle; border: 1.5px solid var(--line-strong); }

    .finrep-view .fr-cat td:first-child { padding-left: 50px; }
    .finrep-view .fr-cat .fr-dot { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; color: #fff; font-size: 9px; margin-right: 7px; vertical-align: middle; border: 1px solid var(--line-strong); }

    .finrep-view .fr-subtotal td { font-weight: 800; border-top: 1.5px solid var(--line); background: var(--surface); }
    .finrep-view .fr-derived td { background: var(--yellow, #FFD166); color: var(--ink); font-weight: 800; border-top: 2px solid var(--line-strong); border-bottom: 2px solid var(--line-strong); }
    .finrep-view .fr-derived td:first-child { background: var(--yellow, #FFD166); }
    .finrep-view .fr-final td { background: var(--ink); color: var(--bg); font-weight: 800; font-size: 14px; }
    .finrep-view .fr-final td:first-child { background: var(--ink); color: var(--bg); }

    .finrep-view .fr-cfg-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
    .finrep-view .fr-cfg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-top: 8px; }
    .finrep-view .fr-cfg-col { border: 2px dashed var(--line); border-radius: 12px; padding: 10px; min-height: 120px; background: var(--surface); transition: background 0.12s, border-color 0.12s; }
    .finrep-view .fr-cfg-col.drag-over { background: var(--primary-soft); border-color: var(--primary); }
    .finrep-view .fr-cfg-col h4 { margin: 0 0 4px; font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.08em; }
    .finrep-view .fr-cfg-col .fr-cfg-desc { font-size: 10px; opacity: 0.6; margin-bottom: 8px; }
    .finrep-view .fr-cfg-grp { font-family: var(--f-mono); font-size: 9px; letter-spacing: 0.06em; opacity: 0.55; margin: 8px 0 3px; }
    .finrep-view .fr-chip { display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin-bottom: 5px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); cursor: grab; font-size: 12px; }
    .finrep-view .fr-chip:active { cursor: grabbing; }
    .finrep-view .fr-chip .fr-chip-dot { width: 14px; height: 14px; border-radius: 3px; color: #fff; display: inline-grid; place-items: center; font-size: 9px; flex: none; }
    .finrep-view .fr-chip .fr-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .finrep-view .btn-export[disabled] { opacity: 0.6; cursor: default; }
    .finrep-view .fr-hint { font-size: 11px; opacity: 0.65; }
  `;
  document.head.appendChild(s);
})();

function frEnsureXLSX() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    let s = document.getElementById('kbot-xlsx-cdn');
    if (s) { s.addEventListener('load', () => resolve()); s.addEventListener('error', () => reject(new Error('xlsx'))); return; }
    s = document.createElement('script');
    s.id = 'kbot-xlsx-cdn';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('xlsx'));
    document.head.appendChild(s);
  });
}

const frWeekOfMonth = (iso) => { const d = parseInt((iso || '').split('-')[2] || '0', 10); return d ? Math.ceil(d / 7) : 0; };

// Convierte 'YYYY-MM-DD' a Date local (mediodía para evitar saltos por zona horaria)
const frToDate = (iso) => new Date(iso + 'T12:00:00');
const frIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Lunes de la semana de una fecha
const frMonday = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; };

// Genera columnas semanales (lun→dom) que cubren [desde, hasta]. Si no hay
// fechas, deriva el rango de los movimientos. Si hay demasiadas semanas (>14),
// colapsa a una sola columna TOTAL para mantener la tabla legible.
function frRangeWeekCols(desde, hasta, rows) {
  let dMin = desde, dMax = hasta;
  if ((!dMin || !dMax) && rows.length) {
    const fechas = rows.map(m => m.fecha).filter(Boolean).sort();
    if (!dMin) dMin = fechas[0];
    if (!dMax) dMax = fechas[fechas.length - 1];
  }
  if (!dMin || !dMax) return [{ key: 'wk', label: 'TOTAL PERIODO', test: () => true }];
  if (dMin > dMax) { const t = dMin; dMin = dMax; dMax = t; }

  const start = frMonday(frToDate(dMin));
  const endD = frToDate(dMax);
  const cols = [];
  let cur = new Date(start);
  let guard = 0;
  while (cur <= endD && guard < 60) {
    const wkStart = new Date(cur);
    const wkEnd = new Date(cur); wkEnd.setDate(wkEnd.getDate() + 6);
    const sIso = frIso(wkStart), eIso = frIso(wkEnd);
    const label = `${wkStart.getDate()}/${wkStart.getMonth() + 1}–${wkEnd.getDate()}/${wkEnd.getMonth() + 1}`;
    cols.push({ key: 'r' + sIso, label, test: (m) => m.fecha >= sIso && m.fecha <= eIso });
    cur.setDate(cur.getDate() + 7);
    guard++;
  }
  if (cols.length === 0 || cols.length > 14) {
    return [{ key: 'wk', label: 'TOTAL PERIODO', test: () => true }];
  }
  return cols;
}
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const FinrepView = ({ movs = [], cats = [], groups = [], cajas = [], user }) => {
  const now = new Date();
  const [periodo, setPeriodo] = useState('mes'); // 'semana' | 'mes' | 'anio' | 'rango'
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth());
  const [semana, setSemana] = useState(Math.ceil(now.getDate() / 7) || 1);
  const [classif, setClassif] = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [showCfg, setShowCfg] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // grupoKey -> true (colapsado)

  const canEditCfg = user && (user.rol === 'admin' || user.rol === 'gerente');

  const catMap = useMemo(() => { const m = {}; cats.forEach(c => { m[c.nombre] = c; }); return m; }, [cats]);
  const groupMap = useMemo(() => { const m = {}; groups.forEach(g => { m[g.id] = g; }); return m; }, [groups]);

  // grupo (objeto) de una categoría por nombre
  const groupOfCat = (catNombre) => {
    const c = catMap[catNombre];
    if (c && c.group_id && groupMap[c.group_id]) return groupMap[c.group_id];
    return null;
  };

  const defaultClassFor = (catNombre) => {
    const c = catMap[catNombre];
    const n = (catNombre || '').toUpperCase();
    const g = groupOfCat(catNombre);
    const gn = (g?.nombre || '').toUpperCase();
    if (/MERCANC|BOBINA|BOLSA|ETIQUET|EMPAQUE|INSUMO/.test(n) || /MERCANC|EMPAQUE|INSUMO|COSTO/.test(gn)) return 'costo';
    if (c && c.tipo === 'INGRESO') return 'ingreso';
    if (/TRASPAS|TRANSFER|PAGO CREDIT|PRESTAMO|DEPOSITO|KONFIO/.test(n) || /TRASPAS|TRANSFER|CREDIT|PRESTAMO/.test(gn)) return 'transfer';
    return 'gasto';
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingCfg(true);
      try {
        const r = await KBotAPI.getSetting(FINREP_SETTING_KEY);
        if (alive) setClassif(r && r.value && typeof r.value === 'object' ? r.value : {});
      } catch (e) { if (alive) setClassif({}); }
      finally { if (alive) setLoadingCfg(false); }
    })();
    return () => { alive = false; };
  }, []);

  const sectionOf = (catNombre) => (classif && classif[catNombre]) || defaultClassFor(catNombre);

  // ---- Modelo: secciones → grupos → categorías, con columnas (semanas/meses) ----
  const model = useMemo(() => {
    if (!classif) return null;
    const inRange = (m) => {
      const f = m.fecha || '';
      if (periodo === 'rango') {
        if (!desde && !hasta) return true;
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      }
      const y = parseInt(f.slice(0, 4), 10);
      const mo = parseInt(f.slice(5, 7), 10) - 1;
      if (y !== anio) return false;
      if (periodo === 'anio') return true;
      if (mo !== mes) return false;
      if (periodo === 'mes') return true;
      return frWeekOfMonth(f) === semana;
    };
    const rows = movs.filter(m => !m.deleted && inRange(m));

    let cols = [];
    if (periodo === 'anio') cols = MESES.map((mm, i) => ({ key: 'm' + i, label: mm, test: (m) => parseInt(m.fecha.slice(5, 7), 10) - 1 === i }));
    else if (periodo === 'mes') cols = [1, 2, 3, 4, 5].map(w => ({ key: 'w' + w, label: 'SEM ' + w, test: (m) => frWeekOfMonth(m.fecha) === w }));
    else if (periodo === 'semana') cols = [{ key: 'wk', label: 'SEM ' + semana, test: () => true }];
    else {
      // RANGO: columnas semanales (lunes→domingo) que cubren [desde, hasta].
      // Si el rango es muy largo (>14 semanas) se colapsa a una sola columna TOTAL.
      cols = frRangeWeekCols(desde, hasta, rows);
    }

    // sec -> grupoKey -> { group, cats: {catNombre -> {byCol,total,count}}, total, byCol }
    const acc = {};
    const colTotals = {}; cols.forEach(c => { colTotals[c.key] = { ingreso: 0, costo: 0, gasto: 0, transfer: 0 }; });

    rows.forEach(m => {
      const cat = m.categoria || 'SIN CATEGORÍA';
      const noAfecta = (m.afecta_saldo === 0 || m.afecta_saldo === false);
      let sec = noAfecta ? 'noafecta' : sectionOf(cat);
      if (!noAfecta && m.transfer_id) sec = 'transfer';
      const g = groupOfCat(cat);
      const gKey = g ? g.id : SIN_GRUPO;
      const monto = Number(m.monto) || 0;
      const col = cols.find(c => c.test(m));

      acc[sec] = acc[sec] || {};
      acc[sec][gKey] = acc[sec][gKey] || { group: g, key: gKey, cats: {}, total: 0, byCol: {} };
      const grp = acc[sec][gKey];
      grp.cats[cat] = grp.cats[cat] || { cat, byCol: {}, total: 0, count: 0 };
      if (col) {
        grp.cats[cat].byCol[col.key] = (grp.cats[cat].byCol[col.key] || 0) + monto;
        grp.byCol[col.key] = (grp.byCol[col.key] || 0) + monto;
        // 'noafecta' NO se suma a colTotals: es informativo y no toca el flujo.
        if (sec !== 'noafecta') colTotals[col.key][sec] += monto;
      }
      grp.cats[cat].total += monto; grp.cats[cat].count++;
      grp.total += monto;
    });

    const sectionGroups = (sec) => Object.values(acc[sec] || {})
      .map(g => ({ ...g, catList: Object.values(g.cats).sort((a, b) => b.total - a.total) }))
      .sort((a, b) => {
        const oa = a.group?.orden ?? 999, ob = b.group?.orden ?? 999;
        if (oa !== ob) return oa - ob;
        return b.total - a.total;
      });
    const sectionTotalByCol = (sec) => {
      const o = {};
      if (colTotals[cols[0]?.key] && (sec in colTotals[cols[0].key])) {
        cols.forEach(c => { o[c.key] = colTotals[c.key][sec]; });
      } else {
        // sección fuera del flujo (noafecta): sumar desde acc
        cols.forEach(c => { o[c.key] = 0; });
        Object.values(acc[sec] || {}).forEach(g => { cols.forEach(c => { o[c.key] += (g.byCol[c.key] || 0); }); });
      }
      return o;
    };
    const sectionGrand = (sec) => {
      if (colTotals[cols[0]?.key] && (sec in colTotals[cols[0].key])) {
        return Object.values(colTotals).reduce((s, v) => s + v[sec], 0);
      }
      return Object.values(acc[sec] || {}).reduce((s, g) => s + g.total, 0);
    };

    return { cols, sectionGroups, sectionTotalByCol, sectionGrand };
  }, [movs, classif, periodo, anio, mes, semana, desde, hasta, catMap, groupMap]);

  // ---- Panel config: categorías agrupadas por grupo dentro de cada sección ----
  const allCatNames = useMemo(() => {
    const set = new Set();
    cats.forEach(c => { if (!c.deleted) set.add(c.nombre); });
    movs.forEach(m => { if (m.categoria) set.add(m.categoria); });
    return [...set].sort();
  }, [cats, movs]);

  const cfgBuckets = useMemo(() => {
    const b = { ingreso: {}, costo: {}, gasto: {}, transfer: {} };
    allCatNames.forEach(n => {
      const sec = sectionOf(n);
      const g = groupOfCat(n);
      const gName = g?.nombre || 'Sin grupo';
      (b[sec] || b.gasto)[gName] = (b[sec] || b.gasto)[gName] || [];
      (b[sec] || b.gasto)[gName].push(n);
    });
    return b;
  }, [allCatNames, classif, groupMap]);

  const moveCat = (catNombre, toSec) => setClassif(prev => ({ ...(prev || {}), [catNombre]: toSec }));
  const toggleGroup = (sec, key) => setCollapsed(prev => ({ ...prev, [sec + ':' + key]: !prev[sec + ':' + key] }));

  const saveCfg = async () => {
    if (!canEditCfg) return;
    setSavingCfg(true);
    try { await KBotAPI.setSetting(FINREP_SETTING_KEY, classif || {}); setShowCfg(false); }
    catch (e) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSavingCfg(false); }
  };

  const fmt = (n) => fmtMXN(Math.abs(n || 0));
  const periodoLabel = periodo === 'anio' ? `Año ${anio}`
    : periodo === 'mes' ? `${MESES_LARGO[mes]} ${anio}`
    : periodo === 'semana' ? `Semana ${semana} · ${MESES_LARGO[mes]} ${anio}`
    : (desde || hasta) ? `${desde || '…'} a ${hasta || '…'}` : 'Rango (todo el histórico)';

  // ---- Export ----
  const exportXLSX = async () => {
    if (!model || model.cols.length === 0) { alert('No hay datos para exportar.'); return; }
    setExporting(true);
    try { await frEnsureXLSX(); } catch (e) { setExporting(false); alert('No se pudo cargar Excel.'); return; }
    if (typeof XLSX === 'undefined') { setExporting(false); return; }
    const cols = model.cols;
    const aoa = [['REPORTE FINANCIERO · ' + periodoLabel], [], ['CONCEPTO', ...cols.map(c => c.label), 'TOTAL']];
    const pushSection = (secId, label, sign) => {
      aoa.push([label]);
      model.sectionGroups(secId).forEach(g => {
        const gname = g.group?.nombre || 'Sin grupo';
        aoa.push(['  ' + gname, ...cols.map(c => (g.byCol[c.key] || 0) * sign), g.total * sign]);
        g.catList.forEach(r => aoa.push(['     ' + r.cat, ...cols.map(c => (r.byCol[c.key] || 0) * sign), r.total * sign]));
      });
      const st = model.sectionTotalByCol(secId);
      aoa.push(['SUBTOTAL ' + label, ...cols.map(c => (st[c.key] || 0) * sign), model.sectionGrand(secId) * sign]);
    };
    pushSection('ingreso', 'INGRESOS', 1);
    pushSection('costo', 'COSTO DE VENTA', -1);
    const ub = model.sectionGrand('ingreso') - model.sectionGrand('costo');
    aoa.push(['UTILIDAD BRUTA', ...cols.map(c => model.sectionTotalByCol('ingreso')[c.key] - model.sectionTotalByCol('costo')[c.key]), ub]);
    pushSection('gasto', 'GASTOS', -1);
    const fo = ub - model.sectionGrand('gasto');
    aoa.push(['FLUJO OPERATIVO', ...cols.map(c => model.sectionTotalByCol('ingreso')[c.key] - model.sectionTotalByCol('costo')[c.key] - model.sectionTotalByCol('gasto')[c.key]), fo]);
    aoa.push([]);
    pushSection('transfer', 'TRANSFERENCIAS / OTROS (informativo)', 1);
    pushSection('noafecta', 'NO AFECTA SALDO (informativo · ya descontado del efectivo)', -1);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 40 }, ...cols.map(() => ({ wch: 14 })), { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Flujo de efectivo');
    XLSX.writeFile(wb, `reporte_financiero_${periodo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(false);
  };

  if (loadingCfg || !model) {
    return <div className="view finrep-view"><BotanaCard><div style={{ padding: 30, textAlign: 'center', opacity: 0.6 }}>Cargando configuración…</div></BotanaCard></div>;
  }

  const cols = model.cols;
  const numCell = (v, sign, key, extraCls = '') => {
    const val = (v || 0) * sign;
    const cls = val > 0 ? 'fr-pos' : val < 0 ? 'fr-neg' : 'fr-zero';
    return <td key={key} className={'fr-num ' + cls + ' ' + extraCls}>{val === 0 ? '—' : (val > 0 ? '' : '−') + fmt(val)}</td>;
  };

  const SectionBlock = ({ secId, label, tone, sign }) => {
    const grps = model.sectionGroups(secId);
    const st = model.sectionTotalByCol(secId);
    return (
      <>
        <tr className={'fr-sec-head ' + tone}><td>{label}</td>{cols.map(c => <td key={c.key}></td>)}<td></td></tr>
        {grps.length === 0 && <tr className="fr-cat"><td style={{ opacity: 0.5, paddingLeft: 22 }}>— sin movimientos —</td>{cols.map(c => <td key={c.key}></td>)}<td></td></tr>}
        {grps.map(g => {
          const gKey = g.key;
          const isCollapsed = collapsed[secId + ':' + gKey];
          const gName = g.group?.nombre || 'Sin grupo';
          const gColor = g.group?.color || '#888';
          const gIcon = g.group?.icon || '📁';
          return (
            <React.Fragment key={gKey}>
              <tr className="fr-grp" onClick={() => toggleGroup(secId, gKey)}>
                <td><span className="fr-caret">{isCollapsed ? '▸' : '▾'}</span><span className="fr-grp-dot" style={{ background: gColor }}>{gIcon}</span>{gName} <span style={{ opacity: 0.4, fontFamily: 'var(--f-mono)', fontSize: 10 }}>({g.catList.length})</span></td>
                {cols.map(col => numCell(g.byCol[col.key], sign, col.key))}
                <td className={'fr-num fr-total-col ' + ((g.total * sign) >= 0 ? 'fr-pos' : 'fr-neg')}>{(g.total * sign) >= 0 ? '' : '−'}{fmt(g.total)}</td>
              </tr>
              {!isCollapsed && g.catList.map(r => {
                const c = catMap[r.cat];
                return (
                  <tr key={r.cat} className="fr-cat">
                    <td><span className="fr-dot" style={{ background: c?.color || '#888' }}>{c?.icon || '•'}</span>{r.cat} <span style={{ opacity: 0.4, fontFamily: 'var(--f-mono)', fontSize: 10 }}>×{r.count}</span></td>
                    {cols.map(col => numCell(r.byCol[col.key], sign, col.key))}
                    <td className={'fr-num fr-total-col ' + ((r.total * sign) >= 0 ? 'fr-pos' : 'fr-neg')}>{(r.total * sign) >= 0 ? '' : '−'}{fmt(r.total)}</td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
        <tr className="fr-subtotal">
          <td>SUBTOTAL {label}</td>
          {cols.map(col => numCell(st[col.key], sign, col.key))}
          <td className={'fr-num fr-total-col ' + ((model.sectionGrand(secId) * sign) >= 0 ? 'fr-pos' : 'fr-neg')}>{(model.sectionGrand(secId) * sign) >= 0 ? '' : '−'}{fmt(model.sectionGrand(secId))}</td>
        </tr>
      </>
    );
  };

  const ubByCol = (key) => model.sectionTotalByCol('ingreso')[key] - model.sectionTotalByCol('costo')[key];
  const foByCol = (key) => ubByCol(key) - model.sectionTotalByCol('gasto')[key];
  const ubGrand = model.sectionGrand('ingreso') - model.sectionGrand('costo');
  const foGrand = ubGrand - model.sectionGrand('gasto');

  return (
    <div className="view finrep-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">FLUJO DE EFECTIVO</div>
          <h1 className="view-title">REPORTE FINANCIERO</h1>
        </div>
        <div className="head-actions mono">
          <span className={'pill pill-net ' + (foGrand >= 0 ? 'pos' : 'neg')}>FLUJO {foGrand >= 0 ? '' : '−'}{fmt(foGrand)}</span>
          <button className="btn-ghost" onClick={() => setShowCfg(s => !s)} style={{ marginLeft: 8 }}>⚙️ {showCfg ? 'CERRAR CONFIG' : 'CONFIGURAR'}</button>
          <button className="btn-ghost btn-export" onClick={exportXLSX} disabled={exporting} style={{ marginLeft: 8 }}>{exporting ? '⏳ GENERANDO…' : '📊 EXPORTAR EXCEL'}</button>
        </div>
      </header>

      <BotanaCard className="filter-bar">
        <div className="fr-controls">
          <div className="fr-seg">
            {[['semana', 'SEMANA'], ['mes', 'MES'], ['anio', 'AÑO'], ['rango', 'RANGO']].map(([id, lb]) => (
              <button key={id} className={periodo === id ? 'active' : ''} onClick={() => setPeriodo(id)}>{lb}</button>
            ))}
          </div>
          {periodo !== 'rango' && (
            <label>AÑO
              <select value={anio} onChange={e => setAnio(+e.target.value)} className="text-input compact">
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          )}
          {(periodo === 'mes' || periodo === 'semana') && (
            <label>MES
              <select value={mes} onChange={e => setMes(+e.target.value)} className="text-input compact">
                {MESES_LARGO.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </label>
          )}
          {periodo === 'semana' && (
            <label>SEMANA
              <select value={semana} onChange={e => setSemana(+e.target.value)} className="text-input compact">
                {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>Semana {w}</option>)}
              </select>
            </label>
          )}
          {periodo === 'rango' && (
            <>
              <label>DESDE
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="text-input compact" />
              </label>
              <label>HASTA
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="text-input compact" />
              </label>
              {(desde || hasta) && <button className="btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>LIMPIAR</button>}
            </>
          )}
          <span className="fr-hint">Mostrando: <b>{periodoLabel}</b> · la caja se filtra con el selector de arriba.</span>
        </div>
      </BotanaCard>

      {showCfg && (
        <BotanaCard style={{ marginBottom: 14 }}>
          <div className="fr-cfg-bar">
            <div>
              <strong>Clasificación de categorías</strong>
              <div className="fr-hint">{canEditCfg ? 'Arrastra cada categoría a su sección del flujo. Dentro del reporte se agrupan por tu grupo del sistema. Se guarda para todos.' : 'Solo lectura — pide a un administrador o gerente que ajuste la clasificación.'}</div>
            </div>
            {canEditCfg && <button className="btn-primary" onClick={saveCfg} disabled={savingCfg}>{savingCfg ? 'GUARDANDO…' : '💾 GUARDAR'}</button>}
          </div>
          <div className="fr-cfg-grid">
            {FINREP_SECTIONS.map(sec => {
              const byGroup = cfgBuckets[sec.id] || {};
              const count = Object.values(byGroup).reduce((s, arr) => s + arr.length, 0);
              return (
                <div key={sec.id}
                  className={'fr-cfg-col' + (dragOver === sec.id ? ' drag-over' : '')}
                  onDragOver={e => { if (canEditCfg) { e.preventDefault(); setDragOver(sec.id); } }}
                  onDragLeave={() => setDragOver(d => d === sec.id ? null : d)}
                  onDrop={e => { if (!canEditCfg) return; e.preventDefault(); const cat = e.dataTransfer.getData('text/plain'); if (cat) moveCat(cat, sec.id); setDragOver(null); }}>
                  <h4 className={sec.tone === 'pos' ? 'fr-pos' : sec.tone === 'neg' ? 'fr-neg' : ''}>{sec.label} <span style={{ opacity: 0.5 }}>({count})</span></h4>
                  <div className="fr-cfg-desc">{sec.desc}</div>
                  {Object.keys(byGroup).sort().map(gName => (
                    <div key={gName}>
                      <div className="fr-cfg-grp">▸ {gName}</div>
                      {byGroup[gName].map(cat => {
                        const c = catMap[cat];
                        return (
                          <div key={cat} className="fr-chip" draggable={canEditCfg} onDragStart={e => e.dataTransfer.setData('text/plain', cat)}>
                            <span className="fr-chip-dot" style={{ background: c?.color || '#888' }}>{c?.icon || '•'}</span>
                            <span className="fr-chip-name">{cat}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {count === 0 && <div className="fr-hint" style={{ opacity: 0.4 }}>vacío</div>}
                </div>
              );
            })}
          </div>
        </BotanaCard>
      )}

      <div className="fr-table-wrap">
        <table className="fr-table">
          <thead>
            <tr><th>CONCEPTO</th>{cols.map(c => <th key={c.key}>{c.label}</th>)}<th>TOTAL</th></tr>
          </thead>
          <tbody>
            <SectionBlock secId="ingreso" label="INGRESOS" tone="pos" sign={1} />
            <SectionBlock secId="costo" label="COSTO DE VENTA" tone="neg" sign={-1} />
            <tr className="fr-derived">
              <td>UTILIDAD BRUTA</td>
              {cols.map(c => { const v = ubByCol(c.key); return <td key={c.key} className="fr-num">{v < 0 ? '−' : ''}{fmt(v)}</td>; })}
              <td className="fr-num">{ubGrand < 0 ? '−' : ''}{fmt(ubGrand)}</td>
            </tr>
            <SectionBlock secId="gasto" label="GASTOS" tone="neg" sign={-1} />
            <tr className="fr-final">
              <td>FLUJO OPERATIVO</td>
              {cols.map(c => { const v = foByCol(c.key); return <td key={c.key} className="fr-num">{v < 0 ? '−' : ''}{fmt(v)}</td>; })}
              <td className="fr-num">{foGrand < 0 ? '−' : ''}{fmt(foGrand)}</td>
            </tr>
            <tr><td colSpan={cols.length + 2} style={{ height: 10, border: 'none', background: 'transparent' }}></td></tr>
            <SectionBlock secId="transfer" label="TRANSFERENCIAS / OTROS (informativo · no afecta el flujo)" tone="info" sign={1} />
            <SectionBlock secId="noafecta" label="NO AFECTA SALDO (informativo · ya descontado del efectivo entregado)" tone="info" sign={-1} />
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.FinrepView = FinrepView;
