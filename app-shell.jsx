// app-shell.jsx — Layout, sidebar, bottom nav, helpers UI

// ===== Información de versión global =====
const APP_VERSION = '1.15.1';  // VERSION_MODAL_V1151
const APP_BUILD = '2026-05-12T';
const APP_BUILD_DATE = '12 de mayo de 2026';
const APP_CHANGELOG = [
  { v: '1.15.1', d: '2026-05-12', items: [
    '✨ Ventas adicionales por canal en Corte del día: + DETALLE / + MAYOREO / + DULCERÍA / + MAQUILA + GRAN TOTAL',
    '🐛 Fix F5.1: orden de rutas Express — endpoint /api/ventas/totales-dia se registraba después del catch-all /:id'
  ]},
  { v: '1.15.0', d: '2026-05-12', items: [
    '✨ F1: Pagos individuales de nómina — botón 💰/✅ por empleado, fila verde al pagar, "Cerrar y pagar" respeta los ya pagados',
    '✨ F2: Columna TOTAL por fila en Nueva Orden de Compra (entre CATEGORÍA y ✕)',
    '✨ F3.2: Print/PDF de órdenes — cada orden en su propia página, sin traslapes ni cortes a la mitad',
    '✨ F4: Cierre de día en Captura por Vendedor con PIN admin/gerente — bloquea inputs + banner rojo + audit',
    '✨ T1: Cross-feed Mayoreo → Detalle (filas virtuales no editables con comisión 5%)',
    '✨ T2: Botón Sync empleados a periodo de nómina abierto',
    '✨ T3: Comisionistas mayoreo 5% (columna comisionista_empleado_id + dropdown UI)',
    '✨ T4: Módulo Comisiones Mensuales (sub-tab nómina, captura por vendedor ruta, cierre genera GASTO)',
    '✨ T5: Exports Excel + PDF de nómina con formato K-BOTANAS (14 columnas, zebra, GARANTÍA azul, header rojo)',
    '🐛 B1: comisionista_empleado_id era INTEGER, migrado a TEXT (empleados.id es TEXT)',
    '🐛 B2: cascade mov → ventas/cortes al eliminar movimientos (las 6 columnas mov_*_id de ventas_detalle_cortes)',
    '🐛 B3: PDF nómina abreviaciones de rutas largas (ADMINISTRACION→ADMIN, ENVASADO→ENVS, etc.)'
  ]},
  { v: '1.14.2', d: '2026-05-12', items: [
    'Hotfix: error "destroy is not a function" en tab Departamentos',
    'Bug en useEffect(cargar, []) cuando cargar es async (devolvía Promise)',
    'Fix: envolver llamada async en arrow function void'
  ]},
  { v: '1.14.1', d: '2026-05-12', items: [
    'Hotfix Nómina: TypeError "cajas.map is not a function"',
    'Wrapper defensivo toArr() para todas las respuestas de API',
    'Tolerancia a respuestas envueltas en objetos {cajas:[], data:[], rows:[]}'
  ]},
  { v: '1.14.0', d: '2026-05-12', items: [
    'Nuevo módulo Nómina semanal con tabla estilo Excel',
    'Comisiones escalonadas automáticas (floor strict) basadas en ventas reales',
    'Bonos por ranking semanal (top 3) y bono mensual configurable',
    'Sistema de préstamos a empleados con abonos manuales o automáticos',
    'Cierre semanal genera movimientos GASTO en cajas correspondientes',
    'Catálogo de empleados con vinculación a vendedores'
  ]},
  { v: '1.13.0', d: '2026-05-12', items: [
    'Nuevo módulo Backup & Restauración (solo admin)',
    'Descarga BD completa en formato .db o .sql',
    'Backup por tabla individual (CSV / JSON)',
    'Restauración con triple confirmación + password admin',
    'Backups automáticos diarios (configurar cron)',
    'Auto-eliminación de backups > 30 días'
  ]},
  { v: '1.12.2', d: '2026-05-12', items: [
    'Bottom-nav móvil ajustado: 4 botones principales + ☰ Más',
    'Por Pagar/Cobrar movido al drawer "Más" para liberar espacio',
    'Tag flotante de versión oculto en móvil (visible solo en desktop)'
  ]},
  { v: '1.12.1', d: '2026-05-12', items: [
    'Modal de información de versión con changelog completo',
    'Tag flotante de versión visible en todas las pantallas',
    'Menú "Más" en bottom-nav móvil con acceso a todos los módulos',
    'Click en logo K-BOTANAS abre detalle de versión'
  ]},
  { v: '1.12.0', d: '2026-05-12', items: [
    'Nuevo módulo de Viáticos: anticipos a empleados con comprobación por categorías',
    'Ajuste automático de caja al sobrar/faltar dinero del viático',
    'Categoría especial ANTICIPOS VIATICOS autoexcluida del P&L de reportes',
    'Menú móvil con botón "Más" para acceder a todos los módulos',
    'Modal de información de versión accesible desde el logo'
  ]},
  { v: '1.11.2', d: '2026-05-12', items: [
    'Nuevo módulo INTELIGENCIA: dashboard ejecutivo con 12 KPIs',
    'Gráficos SVG: tendencia diaria, donut por canal, P&L doble',
    'Top vendedores, clientes, rutas con problemas',
    'Antigüedad CxP, saldos de cajas, auditoría',
    'Exportación a Excel (11 hojas) y PDF con logo'
  ]},
  { v: '1.11.1', d: '2026-05-11', items: [
    'Tabla DETALLE auto-precargada con todos los vendedores activos',
    'Vendedores con tipo AUTOVENTA / DISTRIBUIDOR',
    '5 columnas de pago: efectivo, cheque/vale, tarjetas, crédito, transferencia',
    'Form rápido sticky siempre visible',
    'Eliminación permanente de vendedores con confirmación'
  ]},
  { v: '1.11.0', d: '2026-05-11', items: [
    'Módulo Ventas con cortes de detalle por vendedor',
    'Catálogo de vendedores con código, ruta default, zona',
    'POST /orders y /payments con vinculación a caja'
  ]}
];

// ===== Inyección de estilos del módulo Version + Mobile Menu =====
(function injectVersionAndMenuStyles() {
  if (document.getElementById('kb-version-styles')) return;
  const css = `
    /* === Tag flotante de versión === */
    .kb-version-tag {
      position: fixed; bottom: 6px; right: 10px; z-index: 950;
      font-family: var(--f-mono, monospace); font-size: 9px;
      color: var(--ink-soft, #666); background: rgba(255,255,255,.7);
      padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(0,0,0,.08);
      cursor: pointer; backdrop-filter: blur(6px);
      opacity: .55; transition: opacity .2s, transform .15s;
      letter-spacing: 0.3px; user-select: none;
    }
    .kb-version-tag:hover { opacity: 1; transform: translateY(-2px); }
    @media (max-width: 720px) {
      .kb-version-tag { display: none !important; }
    }
    .sidebar-brand { cursor: pointer; }
    .sidebar-brand:hover { opacity: .85; }

    /* === Modal de versión === */
    .kb-vmodal-bg {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.55); z-index: 1500;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; overflow-y: auto;
      animation: kbVModalFadeIn .18s ease-out;
    }
    @keyframes kbVModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .kb-vmodal {
      background: var(--surface, white); border: 2px solid var(--line-strong, #1a1a1a);
      border-radius: 12px; max-width: 560px; width: 100%;
      max-height: 88vh; overflow-y: auto;
      box-shadow: 0 20px 50px rgba(0,0,0,.3);
      animation: kbVModalSlideUp .22s ease-out;
    }
    @keyframes kbVModalSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .kb-vmodal-head {
      padding: 20px 22px 16px; border-bottom: 2px solid var(--line, #eee);
      display: flex; align-items: center; gap: 14px;
      background: linear-gradient(135deg, var(--primary, #E63946) 0%, #C81E2F 100%);
      color: white; position: relative;
    }
    .kb-vmodal-head img, .kb-vmodal-head .logoph {
      width: 60px; height: 60px; border-radius: 12px; background: white;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Archivo Black', sans-serif; font-size: 24px; color: var(--primary, #E63946);
      flex-shrink: 0;
    }
    .kb-vmodal-head .titlebox { flex: 1; }
    .kb-vmodal-head h2 {
      font-family: var(--f-display, 'Archivo Black'); margin: 0;
      font-size: 22px; line-height: 1.1; letter-spacing: -.02em;
    }
    .kb-vmodal-head .sub { font-size: 11px; opacity: .92; margin-top: 4px; font-weight: 600; letter-spacing: .3px; }
    .kb-vmodal-head .close-btn {
      position: absolute; top: 12px; right: 12px;
      background: rgba(255,255,255,.18); border: 1.5px solid rgba(255,255,255,.3);
      color: white; width: 30px; height: 30px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; line-height: 1;
    }
    .kb-vmodal-head .close-btn:hover { background: rgba(255,255,255,.3); }
    .kb-vmodal-body { padding: 18px 22px; }
    .kb-vmodal-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      margin-bottom: 16px;
    }
    .kb-vmodal-cell {
      padding: 10px 12px; background: var(--bg-soft, #f7f3ed);
      border-radius: 8px; border: 1.5px solid var(--line, #eee);
    }
    .kb-vmodal-cell .lbl {
      font-size: 9px; color: var(--ink-soft, #666); text-transform: uppercase;
      letter-spacing: .6px; font-weight: 700; margin-bottom: 3px;
    }
    .kb-vmodal-cell .val {
      font-family: var(--f-mono, monospace); font-size: 13px; font-weight: 700; color: var(--ink, #1a1a1a);
    }
    .kb-vmodal-changelog { margin-top: 6px; }
    .kb-vmodal-changelog .cl-title {
      font-family: var(--f-display, 'Archivo Black'); font-size: 12px;
      color: var(--ink, #1a1a1a); text-transform: uppercase; letter-spacing: .6px;
      margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1.5px solid var(--line, #eee);
    }
    .kb-vmodal-release {
      padding: 10px 0; border-bottom: 1px dashed var(--line, #eee);
    }
    .kb-vmodal-release:last-child { border-bottom: none; }
    .kb-vmodal-release-head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 6px; gap: 8px;
    }
    .kb-vmodal-release-head .ver {
      font-family: var(--f-mono, monospace); font-size: 13px; font-weight: 800;
      color: var(--primary, #E63946); padding: 2px 8px; background: rgba(230,57,70,.1);
      border-radius: 999px; border: 1px solid rgba(230,57,70,.3);
    }
    .kb-vmodal-release-head .date {
      font-family: var(--f-mono, monospace); font-size: 10px; color: var(--ink-soft, #666);
    }
    .kb-vmodal-release ul { margin: 4px 0 0; padding-left: 20px; }
    .kb-vmodal-release li { font-size: 12px; color: var(--ink, #1a1a1a); line-height: 1.5; margin-bottom: 2px; }
    .kb-vmodal-foot {
      padding: 12px 22px; background: var(--bg-soft, #f7f3ed);
      border-top: 1.5px solid var(--line, #eee); border-radius: 0 0 12px 12px;
      text-align: center; font-size: 10px; color: var(--ink-soft, #666);
      letter-spacing: .3px;
    }

    /* === Botón MÁS en bottom-nav === */
    .bn-more {
      background: transparent; border: none; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 8px 10px; color: var(--ink-soft, #666); font-size: 10px;
      font-weight: 700; font-family: var(--f-body, inherit);
      flex: 1; gap: 3px; transition: color .15s;
      text-transform: uppercase; letter-spacing: .3px;
    }
    .bn-more:hover, .bn-more.active { color: var(--primary, #E63946); }
    .bn-more span { font-size: 10px; }

    /* === Drawer MÁS para móvil === */
    .kb-more-bg {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.55); z-index: 1200;
      display: flex; align-items: flex-end;
      animation: kbVModalFadeIn .18s ease-out;
    }
    .kb-more-drawer {
      background: var(--surface, white); width: 100%; max-height: 85vh;
      border-radius: 18px 18px 0 0; overflow-y: auto;
      box-shadow: 0 -10px 30px rgba(0,0,0,.2);
      animation: kbDrawerUp .25s ease-out;
    }
    @keyframes kbDrawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .kb-more-grip {
      width: 44px; height: 4px; background: var(--line-strong, #ccc);
      border-radius: 4px; margin: 8px auto 4px;
    }
    .kb-more-head {
      padding: 4px 20px 14px; border-bottom: 2px solid var(--line, #eee);
      display: flex; justify-content: space-between; align-items: center;
    }
    .kb-more-head h3 {
      font-family: var(--f-display, 'Archivo Black'); margin: 0;
      font-size: 16px; color: var(--ink, #1a1a1a); letter-spacing: -.01em;
    }
    .kb-more-head .close-x {
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid var(--line, #eee); background: var(--surface, white);
      color: var(--ink, #1a1a1a); cursor: pointer; font-size: 16px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .kb-more-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
      padding: 16px 16px 24px;
    }
    .kb-more-item {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 14px 8px; background: var(--bg-soft, #f7f3ed);
      border: 2px solid var(--line, #eee); border-radius: 12px;
      cursor: pointer; color: var(--ink, #1a1a1a); font-size: 11px;
      font-weight: 700; text-align: center; gap: 6px;
      font-family: var(--f-body, inherit); transition: transform .1s, box-shadow .1s;
      text-transform: uppercase; letter-spacing: .3px; min-height: 78px;
    }
    .kb-more-item:hover, .kb-more-item.active {
      background: var(--primary-soft, #fce4e7);
      border-color: var(--primary, #E63946); color: var(--primary, #E63946);
      transform: translateY(-2px);
    }
    .kb-more-item svg { flex-shrink: 0; }
    .kb-more-item.special-logout {
      background: #FEE2E2; border-color: #FCA5A5; color: #991B1B; grid-column: span 3;
    }
    .kb-more-foot {
      padding: 10px 20px 14px; background: var(--bg-soft, #f7f3ed);
      border-top: 1.5px solid var(--line, #eee);
      font-size: 10px; color: var(--ink-soft, #666);
      display: flex; justify-content: space-between; align-items: center;
      font-family: var(--f-mono, monospace); letter-spacing: .3px;
    }
    .kb-more-foot .userinfo {
      display: flex; align-items: center; gap: 6px;
    }
    .kb-more-foot .dot {
      width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
    }
  `;
  const style = document.createElement('style');
  style.id = 'kb-version-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- Format helpers ----------
const fmtMXN = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMXNshort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
  return '$' + v.toFixed(0);
};
// Helper: convierte un Date a "YYYY-MM-DD" usando la HORA LOCAL del navegador.
// Crítico: NO usar toISOString() porque devuelve UTC y de 6pm-medianoche en México
// daría la fecha del día siguiente.
const toLocalISO = (d = new Date()) => {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};
const toLocalMonth = (d = new Date()) => {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 7);
};
const todayISO = () => toLocalISO(new Date());
const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const fmtDateLong = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
};
const weekKey = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const days = Math.floor((d - start) / (24 * 3600 * 1000));
  const w = Math.ceil((days + start.getDay() + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
};
const monthKey = (iso) => iso.slice(0, 7);

// ---------- Tipos de caja ----------
const CAJA_TIPOS = {
  EFECTIVO: { label: 'Caja Efectivo', icon: '💵', color: '#2EC27E' },
  BANCO:    { label: 'Cuenta Bancaria', icon: '🏦', color: '#3F88C5' },
  CREDITO:  { label: 'Tarjeta de Crédito', icon: '💳', color: '#FF6B35' }
};

// Cálculo de saldo de una caja a partir de sus movimientos
function computeSaldoCaja(caja, movs) {
  if (!caja) return 0;
  const fechaInicial = caja.fecha_inicial || '';
  let saldo = Number(caja.saldo_inicial) || 0;
  (movs || []).forEach(m => {
    if (m.deleted || m.caja !== caja.id) return;
    if (fechaInicial && m.fecha < fechaInicial) return;
    if (m.tipo === 'INGRESO') saldo += Number(m.monto) || 0;
    else if (m.tipo === 'GASTO') saldo -= Number(m.monto) || 0;
  });
  return saldo;
}
const yearKey = (iso) => iso.slice(0, 4);

// ---------- Logo lockup ----------
function LogoMark({ size = 36 }) {
  return (
    <div className="logo-mark" style={{ width: size, height: size }}>
      <img src="logo.png" alt="K-BOTANAS" />
    </div>
  );
}

// ---------- Bordered card ----------
function BotanaCard({ children, accent, className = '', style = {}, onClick }) {
  return (
    <div
      className={'botana-card ' + className}
      onClick={onClick}
      style={{ '--accent': accent || 'var(--ink)', ...style }}
    >
      {children}
    </div>
  );
}

// ---------- Sidebar / Nav ----------
const NAV = [
  { id: 'dashboard', label: 'Caja del día', icon: 'home' },
  { id: 'capturar', label: 'Capturar', icon: 'plus' },
  { id: 'movs', label: 'Movimientos', icon: 'list' },
  { id: 'diario', label: 'Resumen por día', icon: 'calendar' },
  { id: 'cajas', label: 'Cajas', icon: 'wallet' },
  { id: 'cxp', label: 'Por Pagar/Cobrar', icon: 'credit' },
  { id: 'compras', label: 'Compras', icon: 'truck' },
  { id: 'ventas', label: 'Ventas', icon: 'sales' },
  { id: 'viaticos', label: 'Viáticos', icon: 'briefcase' },
  { id: 'nomina', label: 'Nómina', icon: 'people-pay' },
  { id: 'arqueo', label: 'Arqueo', icon: 'scale' },
  { id: 'reportes', label: 'Reportes', icon: 'chart' },
  { id: 'categorias', label: 'Categorías', icon: 'tag' },
  { id: 'usuarios', label: 'Usuarios', icon: 'users', adminOnly: true },
  { id: 'importar', label: 'Importar/Exportar', icon: 'database', adminOnly: true },
  { id: 'backup', label: 'Backup', icon: 'shield', adminOnly: true },
];

function NavIcon({ name }) {
  const common = { width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home': return <svg {...common} viewBox="0 0 24 24"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'plus': return <svg {...common} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    case 'list': return <svg {...common} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case 'wallet': return <svg {...common} viewBox="0 0 24 24"><path d="M3 7h18v12H3z" /><path d="M16 12h3" /><path d="M3 7l3-3h12l3 3" /></svg>;
    case 'chart': return <svg {...common} viewBox="0 0 24 24"><path d="M4 20V8M10 20V4M16 20v-8M22 20H2" /></svg>;
    case 'tag': return <svg {...common} viewBox="0 0 24 24"><path d="M3 12V3h9l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></svg>;
    case 'users': return <svg {...common} viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" /><circle cx="17" cy="8.5" r="2.8" /><path d="M16 14c3 0 5.5 2 5.5 5" /></svg>;
    case 'scale': return <svg {...common} viewBox="0 0 24 24"><path d="M12 3v18" /><path d="M5 21h14" /><path d="M5 8l-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3l-3-6z" /><path d="M19 8l-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3l-3-6z" /><path d="M3 6h18" /></svg>;
    case 'calendar': return <svg {...common} viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4M7 13h4M7 17h7" /></svg>;
    case 'credit': return <svg {...common} viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /><path d="M6 16h4" /></svg>;
    case 'truck': return <svg {...common} viewBox="0 0 24 24"><rect x="1" y="6" width="13" height="11" /><path d="M14 9h5l3 4v4h-8" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></svg>;
    case 'database': return <svg {...common} viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
    case 'sales': return <svg {...common} viewBox="0 0 24 24"><path d="M5 7h14l-1.5 12.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5L5 7z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /><path d="M12 11v6" /><path d="M9.5 12.5h3.5a1.5 1.5 0 0 1 0 3H10a1.5 1.5 0 0 0 0 3h4" /></svg>;
    case 'briefcase': return <svg {...common} viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></svg>;
    case 'people-pay': return <svg {...common} viewBox="0 0 24 24"><circle cx="9" cy="7" r="3" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><circle cx="17" cy="9" r="2.5" /><path d="M17 13v6" /><path d="M14.5 16h5" /></svg>;
    case 'shield': return <svg {...common} viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'xml': return <svg {...common} viewBox="0 0 24 24"><path d="M9 4l-5 8 5 8M15 4l5 8-5 8" /></svg>;
    default: return null;
  }
}

function Sidebar({ active, setActive, onAddClick, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand" onClick={() => window.dispatchEvent(new CustomEvent('kb-open-version'))} title="Información de versión">
        <LogoMark size={56} />
        <div>
          <div className="brand-title">K-BOTANAS</div>
          <div className="brand-sub">CONTROL DE CAJA</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.filter(n => !n.adminOnly || user?.rol === 'admin').map(n => (
          <button
            key={n.id}
            className={'nav-item ' + (active === n.id ? 'active' : '')}
            onClick={() => {
              if (n.id === 'capturar') { onAddClick(); }
              else { setActive(n.id); }
            }}
          >
            <NavIcon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button className="quick-add" onClick={onAddClick}>
          <NavIcon name="plus" />
          <span>NUEVO MOVIMIENTO</span>
        </button>
        {user && (
          <div className="sidebar-user mono" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.nombre}{user.rol ? ` · ${user.rol.toUpperCase()}` : ''}
            </span>
          </div>
        )}
        {onLogout && (
          <button
            className="nav-item"
            onClick={() => { if (confirm('¿Cerrar sesión?')) onLogout(); }}
            style={{ marginTop: 4, color: 'var(--primary)' }}
            title="Cerrar sesión"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>CERRAR SESIÓN</span>
          </button>
        )}
        <div className="offline-tag">
          <span className="dot" />
          OFFLINE-READY · PWA
        </div>
        <div onClick={() => window.dispatchEvent(new CustomEvent('kb-open-version'))} style={{ marginTop: 6, padding: '4px 12px', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-soft)', opacity: 0.7, textAlign: 'center', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 4 }} title="Click para ver detalle">
          BUILD {APP_BUILD} · v{APP_VERSION}
        </div>
      </div>
    </aside>
  );
}

function BottomNav({ active, setActive, onAddClick, user, onLogout }) {
  const items = NAV.filter(n => n.id !== 'capturar' && (!n.adminOnly || user?.rol === 'admin'));
  const canCapture = user?.rol !== 'consulta';
  const [showMore, setShowMore] = React.useState(false);
  // Bottom-nav: Caja del día · Movimientos · ➕ · Cajas · Más
  // (Por Pagar/Cobrar pasa al drawer "Más" para no saturar el bottom-nav)
  const principales = items.slice(0, 3);
  const masItems = items.slice(3);
  const moreActive = items.findIndex(x => x.id === active) >= 3;
  return (
    <React.Fragment>
      <nav className="bottom-nav">
        {principales.slice(0, 2).map(n => (
          <button key={n.id} className={'bn-item ' + (active === n.id ? 'active' : '')} onClick={() => setActive(n.id)}>
            <NavIcon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
        {canCapture ? (
          <button className="bn-fab" onClick={onAddClick} aria-label="Capturar movimiento">
            <NavIcon name="plus" />
          </button>
        ) : (
          <div className="bn-fab-placeholder"></div>
        )}
        {principales.slice(2, 3).map(n => (
          <button key={n.id} className={'bn-item ' + (active === n.id ? 'active' : '')} onClick={() => setActive(n.id)}>
            <NavIcon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
        <button className={'bn-more ' + (moreActive ? 'active' : '')} onClick={() => setShowMore(true)} aria-label="Más opciones">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span>Más</span>
        </button>
      </nav>
      {showMore && (
        <MoreMenuDrawer
          items={masItems}
          active={active}
          setActive={(id) => { setShowMore(false); setActive(id); }}
          onClose={() => setShowMore(false)}
          onLogout={onLogout}
          user={user}
        />
      )}
    </React.Fragment>
  );
}

// === Drawer "Más" para móvil con resto de módulos ===
function MoreMenuDrawer({ items, active, setActive, onClose, onLogout, user }) {
  return (
    <div className="kb-more-bg" onClick={onClose}>
      <div className="kb-more-drawer" onClick={e => e.stopPropagation()}>
        <div className="kb-more-grip"></div>
        <div className="kb-more-head">
          <h3>☰ Más opciones</h3>
          <button className="close-x" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="kb-more-grid">
          {items.map(n => (
            <button
              key={n.id}
              className={'kb-more-item ' + (active === n.id ? 'active' : '')}
              onClick={() => setActive(n.id)}
            >
              <NavIcon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
          {onLogout && (
            <button
              className="kb-more-item special-logout"
              onClick={() => { onClose(); if (confirm('¿Cerrar sesión?')) onLogout(); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>CERRAR SESIÓN</span>
            </button>
          )}
        </div>
        <div className="kb-more-foot">
          <div className="userinfo">
            <span className="dot"></span>
            <span>{user?.nombre || 'Usuario'}{user?.rol ? ' · ' + user.rol.toUpperCase() : ''}</span>
          </div>
          <span onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('kb-open-version')); }} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            v{APP_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
}

// === Modal de información de versión ===
function VersionModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="kb-vmodal-bg" onClick={onClose}>
      <div className="kb-vmodal" onClick={e => e.stopPropagation()}>
        <div className="kb-vmodal-head">
          <img src="logo.png" alt="K-BOTANAS" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="titlebox">
            <h2>K-BOTANAS · Control de Caja</h2>
            <div className="sub">PWA · Offline-ready · Multi-usuario</div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="kb-vmodal-body">
          <div className="kb-vmodal-grid">
            <div className="kb-vmodal-cell">
              <div className="lbl">Versión</div>
              <div className="val" style={{ color: 'var(--primary, #E63946)', fontSize: 18 }}>v{APP_VERSION}</div>
            </div>
            <div className="kb-vmodal-cell">
              <div className="lbl">Build</div>
              <div className="val">{APP_BUILD}</div>
            </div>
            <div className="kb-vmodal-cell">
              <div className="lbl">Fecha release</div>
              <div className="val" style={{ fontFamily: 'inherit', fontSize: 12 }}>{APP_BUILD_DATE}</div>
            </div>
            <div className="kb-vmodal-cell">
              <div className="lbl">Estado</div>
              <div className="val" style={{ fontFamily: 'inherit', fontSize: 12, color: '#10B981' }}>● En producción</div>
            </div>
          </div>
          <div className="kb-vmodal-changelog">
            <div className="cl-title">📋 Historial de versiones</div>
            {APP_CHANGELOG.map(rel => (
              <div className="kb-vmodal-release" key={rel.v}>
                <div className="kb-vmodal-release-head">
                  <span className="ver">v{rel.v}</span>
                  <span className="date">{rel.d}</span>
                </div>
                <ul>
                  {rel.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="kb-vmodal-foot">
          K-Botanas SA de CV · Pachuca, Hidalgo, México · Sistema interno de gestión financiera
        </div>
      </div>
    </div>
  );
}

// === Tag flotante de versión (visible siempre, abre modal al click) ===
function FloatingVersionTag() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('kb-open-version', handler);
    return () => window.removeEventListener('kb-open-version', handler);
  }, []);
  return (
    <React.Fragment>
      <div className="kb-version-tag" onClick={() => setOpen(true)} title="Click para ver detalle">
        v{APP_VERSION} · {APP_BUILD}
      </div>
      <VersionModal open={open} onClose={() => setOpen(false)} />
    </React.Fragment>
  );
}

// Expose helpers to other scripts
Object.assign(window, {
  fmtMXN, fmtMXNshort, todayISO, fmtDate, fmtDateLong,
  weekKey, monthKey, yearKey,
  computeSaldoCaja, CAJA_TIPOS,
  LogoMark, BotanaCard, Sidebar, BottomNav, MoreMenuDrawer, VersionModal, FloatingVersionTag, NavIcon, NAV, APP_VERSION, APP_BUILD,
});

// FloatingCaptureButton removido por petición del usuario (afectaba movilidad en pantalla móvil).
// El bottom nav ya incluye el botón "+" central que cumple la misma función.
function FloatingCaptureButton() { return null; }
window.FloatingCaptureButton = FloatingCaptureButton;
