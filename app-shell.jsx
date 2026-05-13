// app-shell.jsx — Layout, sidebar, bottom nav, helpers UI
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- Format helpers ----------
const fmtMXN = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMXNshort = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
  return '$' + v.toFixed(0);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
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
  { id: 'reportes', label: 'Reportes', icon: 'chart' },
  { id: 'categorias', label: 'Categorías', icon: 'tag' },
  { id: 'xml', label: 'XML', icon: 'xml' },
];

function NavIcon({ name }) {
  const common = { width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home': return <svg {...common} viewBox="0 0 24 24"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'plus': return <svg {...common} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    case 'list': return <svg {...common} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case 'chart': return <svg {...common} viewBox="0 0 24 24"><path d="M4 20V8M10 20V4M16 20v-8M22 20H2" /></svg>;
    case 'tag': return <svg {...common} viewBox="0 0 24 24"><path d="M3 12V3h9l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></svg>;
    case 'xml': return <svg {...common} viewBox="0 0 24 24"><path d="M9 4l-5 8 5 8M15 4l5 8-5 8" /></svg>;
    default: return null;
  }
}

function Sidebar({ active, setActive, onAddClick, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LogoMark size={56} />
        <div>
          <div className="brand-title">K-BOTANAS</div>
          <div className="brand-sub">CONTROL DE CAJA</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(n => (
          <button
            key={n.id}
            className={'nav-item ' + (active === n.id ? 'active' : '')}
            onClick={() => setActive(n.id)}
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
              {user.nombre}{user.rol === 'admin' ? ' · ADMIN' : ''}
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
      </div>
    </aside>
  );
}

function BottomNav({ active, setActive, onAddClick }) {
  const items = NAV.filter(n => n.id !== 'capturar');
  return (
    <nav className="bottom-nav">
      {items.slice(0, 2).map(n => (
        <button key={n.id} className={'bn-item ' + (active === n.id ? 'active' : '')} onClick={() => setActive(n.id)}>
          <NavIcon name={n.icon} />
          <span>{n.label}</span>
        </button>
      ))}
      <button className="bn-fab" onClick={onAddClick}>
        <NavIcon name="plus" />
      </button>
      {items.slice(2, 4).map(n => (
        <button key={n.id} className={'bn-item ' + (active === n.id ? 'active' : '')} onClick={() => setActive(n.id)}>
          <NavIcon name={n.icon} />
          <span>{n.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Expose helpers to other scripts
Object.assign(window, {
  fmtMXN, fmtMXNshort, todayISO, fmtDate, fmtDateLong,
  weekKey, monthKey, yearKey,
  LogoMark, BotanaCard, Sidebar, BottomNav, NavIcon, NAV,
});
