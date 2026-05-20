// =============================================================
// K-BOTANAS · backup-view.jsx v1.0
// 2026-05-12 · Backup & Restauración del sistema (admin only)
// =============================================================

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const BACKUP_VERSION = '1.0.0';

(function injectBackupStyles() {
  const oldIds = ['kb-backup-styles', 'kb-backup-styles-v1'];
  oldIds.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  const css = `
    .bk-wrap { padding: var(--pad); max-width: 1400px; margin: 0 auto; }
    .bk-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: var(--pad);
      padding-bottom: 14px; border-bottom: 2px solid var(--line);
    }
    .bk-title-block { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .bk-title-block h1 {
      font-family: var(--f-display); font-size: 28px; line-height: 1;
      color: var(--ink); margin: 0; letter-spacing: -.02em;
    }
    .bk-title-block .ver {
      font-family: var(--f-mono); font-size: 11px; font-weight: 600;
      color: var(--ink-soft); background: var(--bg-soft);
      padding: 4px 10px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
    }
    .bk-title-block .sub { font-size: 13px; color: var(--ink-soft); font-style: italic; }

    .bk-warning {
      background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
      border: 2px solid #F59E0B; border-radius: var(--radius-md);
      padding: 14px 18px; margin-bottom: var(--gap);
      display: flex; gap: 12px; align-items: flex-start;
    }
    .bk-warning .icon { font-size: 24px; flex-shrink: 0; }
    .bk-warning .text { color: #78350F; font-size: 13px; line-height: 1.5; }
    .bk-warning strong { color: #451A03; }

    .bk-card {
      background: var(--surface); border: 2px solid var(--line-strong);
      border-radius: var(--radius-md); padding: var(--pad);
      margin-bottom: var(--gap); box-shadow: var(--shadow-sm);
    }
    .bk-card-title {
      font-family: var(--f-display); font-size: 16px; color: var(--ink); margin: 0 0 14px;
      text-transform: uppercase; letter-spacing: .6px;
      padding-bottom: 10px; border-bottom: 1.5px solid var(--line);
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }

    .bk-btn {
      padding: 10px 18px; border-radius: var(--radius-sm); font-weight: 700;
      font-size: 13px; border: 2px solid var(--line-strong); cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
      text-transform: uppercase; letter-spacing: .4px;
      font-family: var(--f-body); box-shadow: var(--shadow-sm);
      transition: transform .08s, box-shadow .08s;
    }
    .bk-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: var(--shadow-md); }
    .bk-btn:active:not(:disabled) { transform: translate(1px,1px); box-shadow: none; }
    .bk-btn:disabled { opacity: .5; cursor: not-allowed; }
    .bk-btn-primary { background: var(--primary); color: white; }
    .bk-btn-success { background: #10B981; color: white; border-color: #047857; }
    .bk-btn-danger { background: #EF4444; color: white; border-color: #991B1B; }
    .bk-btn-ghost { background: var(--surface); color: var(--ink); }
    .bk-btn-warn { background: #F59E0B; color: white; border-color: #B45309; }
    .bk-btn-sm { padding: 5px 10px; font-size: 11px; box-shadow: none; border-width: 1.5px; }
    .bk-btn-lg { padding: 14px 24px; font-size: 15px; }

    .bk-input, .bk-select {
      width: 100%; padding: 10px 14px; border: 2px solid var(--line);
      border-radius: var(--radius-sm); font-size: 14px; color: var(--ink);
      background: var(--surface); outline: none; font-family: var(--f-body);
    }
    .bk-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
    .bk-label { display: block; font-size: 11px; font-weight: 700; color: var(--ink-soft);
      margin: 0 0 5px; text-transform: uppercase; letter-spacing: .5px; }

    .bk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 800px) { .bk-grid-2 { grid-template-columns: 1fr; } }

    /* Hero blocks para acciones principales */
    .bk-hero {
      padding: 24px; background: var(--bg-soft); border: 2px solid var(--line);
      border-radius: var(--radius-md); text-align: center;
      transition: border-color .15s, transform .12s;
    }
    .bk-hero:hover { border-color: var(--primary); transform: translateY(-2px); }
    .bk-hero .ico { font-size: 40px; margin-bottom: 8px; }
    .bk-hero h3 {
      font-family: var(--f-display); font-size: 16px; margin: 0 0 6px;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .bk-hero p { font-size: 12px; color: var(--ink-soft); margin: 0 0 14px; line-height: 1.5; }
    .bk-hero.danger { border-color: #FCA5A5; background: #FEE2E2; }
    .bk-hero.danger:hover { border-color: #EF4444; }
    .bk-hero.danger h3 { color: #991B1B; }
    .bk-hero.danger p { color: #B91C1C; }

    /* Tabla genérica */
    .bk-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .bk-table th {
      text-align: left; padding: 9px 12px; background: var(--bg-soft);
      font-weight: 700; color: var(--ink); font-size: 10px;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid var(--line-strong); white-space: nowrap;
    }
    .bk-table td {
      padding: 9px 12px; border-bottom: 1px solid var(--line); color: var(--ink);
      vertical-align: middle;
    }
    .bk-table tr:hover td { background: var(--surface-2); }
    .bk-table .num { text-align: right; font-family: var(--f-mono);
      font-variant-numeric: tabular-nums; font-weight: 600; }
    .bk-table-wrap { overflow-x: auto; max-height: 500px; overflow-y: auto; border-radius: var(--radius-sm); }

    .bk-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .5px; border: 1.5px solid;
    }
    .bk-badge-info { background: #DBEAFE; color: #1E40AF; border-color: #93C5FD; }
    .bk-badge-success { background: #DCFCE7; color: #166534; border-color: #86EFAC; }
    .bk-badge-warn { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .bk-badge-empty { background: var(--bg-soft); color: var(--ink-soft); border-color: var(--line); }

    /* Modal restauración con triple confirmación */
    .bk-modal-bg {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.65); z-index: 1500;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; overflow-y: auto;
    }
    .bk-modal {
      background: var(--surface); border: 3px solid #EF4444;
      border-radius: 12px; max-width: 560px; width: 100%;
      max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 50px rgba(239,68,68,.4);
    }
    .bk-modal-head {
      padding: 18px 22px; background: linear-gradient(135deg, #EF4444 0%, #991B1B 100%);
      color: white; border-radius: 9px 9px 0 0;
    }
    .bk-modal-head h2 {
      font-family: var(--f-display); margin: 0; font-size: 18px;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .bk-modal-head .step { font-size: 11px; opacity: .9; margin-top: 4px; font-weight: 600; letter-spacing: .5px; }
    .bk-modal-body { padding: 20px 22px; }
    .bk-modal-foot {
      padding: 14px 22px; background: var(--bg-soft); border-top: 1.5px solid var(--line);
      border-radius: 0 0 9px 9px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    }
    .bk-danger-box {
      background: #FEE2E2; border: 2px solid #FCA5A5; border-radius: var(--radius-sm);
      padding: 12px 16px; color: #991B1B; font-size: 13px; line-height: 1.5; margin-bottom: 14px;
    }
    .bk-danger-box strong { color: #7F1D1D; }

    .bk-step-progress {
      display: flex; gap: 4px; margin-bottom: 16px;
    }
    .bk-step-dot {
      flex: 1; height: 4px; background: var(--line); border-radius: 2px;
    }
    .bk-step-dot.active { background: #EF4444; }

    .bk-error {
      background: #FEE2E2; color: #991B1B; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #FCA5A5;
      margin-bottom: 12px; font-size: 13px; font-weight: 600;
    }
    .bk-success {
      background: #DCFCE7; color: #166534; padding: 10px 14px;
      border-radius: var(--radius-sm); border: 2px solid #86EFAC;
      margin-bottom: 12px; font-size: 13px; font-weight: 700;
    }
    .bk-empty {
      text-align: center; padding: 30px 20px; color: var(--ink-soft);
      font-style: italic; font-size: 13px;
    }
    .bk-loading { padding: 20px; text-align: center; color: var(--ink-soft); }

    .bk-tabs {
      display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: var(--gap);
      border-bottom: 2px solid var(--line); padding: 0 2px;
    }
    .bk-tab {
      padding: 10px 18px; background: transparent; border: none;
      color: var(--ink-soft); font-weight: 700; font-size: 13px;
      cursor: pointer; border-bottom: 3px solid transparent;
      margin-bottom: -2px; text-transform: uppercase; letter-spacing: .5px;
      font-family: var(--f-body); display: inline-flex; align-items: center; gap: 6px;
    }
    .bk-tab:hover { color: var(--ink); }
    .bk-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
  `;
  const s = document.createElement('style');
  s.id = 'kb-backup-styles-v1';
  s.textContent = css;
  document.head.appendChild(s);
})();

// ----------- Utils -----------
const fmtBytes = (n) => {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};
const fmtDateTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};

const apiFetchBk = async (path, opts = {}) => {
  const tok = window.KBotAPI && window.KBotAPI.token && window.KBotAPI.token();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const r = await fetch(path, { ...opts, headers });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || 'Error ' + r.status);
  }
  return r.json();
};

// Helper para descargar archivos con auth (GET con token Bearer)
const downloadWithAuth = async (path, suggestedName) => {
  const tok = window.KBotAPI && window.KBotAPI.token && window.KBotAPI.token();
  const r = await fetch(path, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || 'Error ' + r.status);
  }
  const blob = await r.blob();
  // Detectar nombre del header si existe
  let name = suggestedName;
  const cd = r.headers.get('Content-Disposition');
  if (cd) {
    const m = /filename="?([^"]+)"?/.exec(cd);
    if (m) name = m[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
};

// ----------- Componente raíz -----------
function BackupView(props) {
  const [tab, setTab] = useState('completo');
  return (
    <div className="bk-wrap">
      <div className="bk-header">
        <div className="bk-title-block">
          <h1>🛡️ BACKUP & RESTAURACIÓN</h1>
          <span className="ver">v{BACKUP_VERSION}</span>
          <span className="sub">solo administradores · datos críticos del sistema</span>
        </div>
      </div>

      <div className="bk-warning">
        <span className="icon">⚠️</span>
        <div className="text">
          <strong>Información importante:</strong> Esta sección contiene operaciones críticas que pueden modificar o reemplazar TODOS los datos del sistema.
          La restauración completa borra los datos actuales y los reemplaza por los del backup. Antes de cualquier restauración, descarga primero un backup actual.
        </div>
      </div>

      <div className="bk-tabs">
        <button className={'bk-tab' + (tab === 'completo' ? ' active' : '')} onClick={() => setTab('completo')}>
          💾 Backup completo
        </button>
        <button className={'bk-tab' + (tab === 'automaticos' ? ' active' : '')} onClick={() => setTab('automaticos')}>
          🕓 Automáticos
        </button>
        <button className={'bk-tab' + (tab === 'tablas' ? ' active' : '')} onClick={() => setTab('tablas')}>
          🗂️ Por tabla
        </button>
        <button className={'bk-tab' + (tab === 'restaurar' ? ' active' : '')} onClick={() => setTab('restaurar')}>
          ♻️ Restaurar BD
        </button>
      </div>

      {tab === 'completo' && <BackupCompletoSection />}
      {tab === 'automaticos' && <BackupAutomaticosSection />}
      {tab === 'tablas' && <BackupTablasSection />}
      {tab === 'restaurar' && <RestaurarSection />}
    </div>
  );
}

// === SECCIÓN 1: Backup completo manual ===
function BackupCompletoSection() {
  const [info, setInfo] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetchBk('/api/backup/list-tables').then(setInfo).catch(e => setError(e.message));
  }, []);

  const descargar = async (formato) => {
    setDownloading(formato);
    setError('');
    try {
      const path = formato === 'db' ? '/api/backup/full-db' : '/api/backup/full-sql';
      const fname = formato === 'db'
        ? `kbotanas-backup-${new Date().toISOString().slice(0,10)}.db`
        : `kbotanas-dump-${new Date().toISOString().slice(0,10)}.sql`;
      await downloadWithAuth(path, fname);
    } catch (e) { setError(e.message); }
    setDownloading(null);
  };

  return (
    <div>
      {error && <div className="bk-error">⚠ {error}</div>}
      <div className="bk-card">
        <div className="bk-card-title">
          <span>💾 Descargar backup completo del sistema</span>
          {info && <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)', fontWeight: 500, textTransform: 'none' }}>
            BD: {fmtBytes(info.db_size)} · {info.tables.length} tablas
          </span>}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 18, lineHeight: 1.6 }}>
          Descarga toda la base de datos del sistema en un solo archivo. Útil para guardar en tu computadora, enviar por email a tu contador, o para restaurar el sistema completo en caso de pérdida de datos.
        </p>

        <div className="bk-grid-2">
          <div className="bk-hero">
            <div className="ico">🗄️</div>
            <h3>Archivo .db (recomendado)</h3>
            <p>Copia exacta de la base de datos SQLite. Restauración rápida y confiable. Solo se puede abrir con software SQLite.</p>
            <button className="bk-btn bk-btn-success bk-btn-lg" onClick={() => descargar('db')} disabled={downloading !== null}>
              {downloading === 'db' ? '⏳ Generando…' : '📥 Descargar .db'}
            </button>
          </div>
          <div className="bk-hero">
            <div className="ico">📝</div>
            <h3>Archivo .sql (texto)</h3>
            <p>Dump de todas las tablas en formato SQL plano. Editable con cualquier editor de texto, pero más pesado y lento de restaurar.</p>
            <button className="bk-btn bk-btn-primary bk-btn-lg" onClick={() => descargar('sql')} disabled={downloading !== null}>
              {downloading === 'sql' ? '⏳ Generando…' : '📥 Descargar .sql'}
            </button>
          </div>
        </div>

        {info && (
          <div style={{ marginTop: 18, padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--ink-soft)' }}>
            💡 <strong>Tip:</strong> El backup .db incluye {info.tables.reduce((s, t) => s + t.count, 0).toLocaleString('es-MX')} registros en total entre {info.tables.length} tablas. Recomendamos descargar uno antes de cualquier cambio importante.
          </div>
        )}
      </div>
    </div>
  );
}

// === SECCIÓN 2: Backups automáticos ===
function BackupAutomaticosSection() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await apiFetchBk('/api/backup/auto-list');
      setFiles(r.files || []);
      setError('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const ejecutar = async () => {
    if (!confirm('¿Crear un nuevo backup automático ahora?')) return;
    setRunning(true); setMsg('');
    try {
      const r = await apiFetchBk('/api/backup/auto-run', { method: 'POST' });
      setMsg(`✓ Backup creado: ${r.file} (${fmtBytes(r.size)})`);
      cargar();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) { setError(e.message); }
    setRunning(false);
  };

  const descargar = async (name) => {
    try { await downloadWithAuth('/api/backup/auto-download/' + encodeURIComponent(name), name); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <div className="bk-error">⚠ {error}</div>}
      {msg && <div className="bk-success">{msg}</div>}

      <div className="bk-card">
        <div className="bk-card-title">
          <span>🕓 Backups automáticos del servidor</span>
          <button className="bk-btn bk-btn-warn bk-btn-sm" onClick={ejecutar} disabled={running}>
            {running ? '⏳ Creando…' : '+ Crear backup ahora'}
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.6 }}>
          El servidor crea automáticamente un backup diario de la BD. Aquí ves los últimos disponibles. Los backups con más de 30 días se eliminan automáticamente para no llenar el disco.
        </p>

        {loading ? <div className="bk-loading">Cargando…</div> :
         files.length === 0 ?
          <div className="bk-empty">
            <p>No hay backups automáticos aún.</p>
            <p style={{ marginTop: 8, fontSize: 11 }}>
              Asegúrate que el cron diario esté configurado. Si necesitas uno ahora, click "Crear backup ahora".
            </p>
          </div> :
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr><th>Archivo</th><th>Fecha</th><th className="num">Tamaño</th><th style={{ width: 100 }}>Acciones</th></tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.name}>
                    <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>
                      <strong>{f.name}</strong>
                      {f.name.includes('MANUAL') && <span className="bk-badge bk-badge-warn" style={{ marginLeft: 6 }}>MANUAL</span>}
                      {f.name.includes('AUTO') && <span className="bk-badge bk-badge-info" style={{ marginLeft: 6 }}>AUTO</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDateTime(f.mtime)}</td>
                    <td className="num">{fmtBytes(f.size)}</td>
                    <td>
                      <button className="bk-btn bk-btn-primary bk-btn-sm" onClick={() => descargar(f.name)}>
                        📥 Descargar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>

      <div className="bk-card">
        <div className="bk-card-title">⚙️ Configuración del backup automático</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
          • <strong>Frecuencia:</strong> Diaria (recomendado a las 2 AM)<br />
          • <strong>Retención:</strong> 30 días — backups más viejos se borran automáticamente<br />
          • <strong>Ubicación:</strong> <code style={{ background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 3 }}>/opt/corte-kbomx/backups/auto/</code><br />
          • <strong>Script:</strong> <code style={{ background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 3 }}>/opt/corte-kbomx/system/auto-backup.sh</code><br />
        </div>
        <div style={{ marginTop: 12, padding: 10, background: '#FEF3C7', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#78350F', border: '1.5px solid #FCD34D' }}>
          📌 <strong>Para activar el cron:</strong> conéctate por SSH al VPS y ejecuta <code>crontab -e</code>, luego agrega la línea:<br />
          <code style={{ display: 'block', marginTop: 6, padding: 6, background: 'white', borderRadius: 3 }}>0 2 * * * /opt/corte-kbomx/system/auto-backup.sh &gt;&gt; /var/log/kbotanas-backup.log 2&gt;&amp;1</code>
        </div>
      </div>
    </div>
  );
}

// === SECCIÓN 3: Backup por tabla ===
function BackupTablasSection() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    apiFetchBk('/api/backup/list-tables').then(r => {
      setTables(r.tables || []);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const descargar = async (name, format) => {
    setDownloading(name + '-' + format);
    try { await downloadWithAuth(`/api/backup/table/${name}?format=${format}`, `${name}.${format}`); }
    catch (e) { setError(e.message); }
    setDownloading(null);
  };

  return (
    <div>
      {error && <div className="bk-error">⚠ {error}</div>}
      <div className="bk-card">
        <div className="bk-card-title">
          <span>🗂️ Backup individual por tabla</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)', fontWeight: 500, textTransform: 'none' }}>
            {tables.length} tablas
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.6 }}>
          Descarga el contenido de una tabla específica en formato JSON o CSV (Excel). Útil para análisis, auditoría o restauración granular.
        </p>
        {loading ? <div className="bk-loading">Cargando tablas…</div> :
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Tabla</th>
                  <th className="num">Total</th>
                  <th className="num">Activos</th>
                  <th>Estado</th>
                  <th style={{ width: 200 }}>Descargar</th>
                </tr>
              </thead>
              <tbody>
                {tables.map(t => (
                  <tr key={t.name}>
                    <td><strong style={{ fontFamily: 'var(--f-mono)' }}>{t.name}</strong></td>
                    <td className="num">{t.count.toLocaleString('es-MX')}</td>
                    <td className="num">{t.has_deleted ? t.active.toLocaleString('es-MX') : '—'}</td>
                    <td>
                      {t.count === 0 ? <span className="bk-badge bk-badge-empty">VACÍA</span> :
                       t.count < 10 ? <span className="bk-badge bk-badge-info">PEQUEÑA</span> :
                       t.count < 1000 ? <span className="bk-badge bk-badge-success">NORMAL</span> :
                       <span className="bk-badge bk-badge-warn">GRANDE</span>}
                    </td>
                    <td>
                      <button className="bk-btn bk-btn-ghost bk-btn-sm"
                        disabled={t.count === 0 || downloading === t.name + '-csv'}
                        onClick={() => descargar(t.name, 'csv')}>
                        {downloading === t.name + '-csv' ? '⏳' : '📊 CSV'}
                      </button>
                      <button className="bk-btn bk-btn-ghost bk-btn-sm"
                        style={{ marginLeft: 4 }}
                        disabled={t.count === 0 || downloading === t.name + '-json'}
                        onClick={() => descargar(t.name, 'json')}>
                        {downloading === t.name + '-json' ? '⏳' : '{ } JSON'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  );
}

// === SECCIÓN 4: Restaurar con triple confirmación ===
function RestaurarSection() {
  const [archivo, setArchivo] = useState(null);
  const [archivoBase64, setArchivoBase64] = useState(null);
  const [archivoInfo, setArchivoInfo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    if (!f.name.endsWith('.db')) {
      setError('Solo se aceptan archivos .db');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('Archivo demasiado grande (máximo 100 MB)');
      return;
    }
    if (f.size < 1000) {
      setError('Archivo demasiado pequeño, ¿es un .db válido?');
      return;
    }
    setArchivo(f);
    setArchivoInfo({ name: f.name, size: f.size, lastModified: f.lastModified });
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      setArchivoBase64(base64);
    };
    reader.onerror = () => setError('Error al leer archivo');
    reader.readAsDataURL(f);
  };

  return (
    <div>
      {error && <div className="bk-error">⚠ {error}</div>}

      <div className="bk-card">
        <div className="bk-card-title">♻️ Restaurar base de datos completa</div>

        <div className="bk-danger-box">
          <strong>⚠️ ACCIÓN PELIGROSA E IRREVERSIBLE</strong><br />
          Restaurar la BD reemplazará TODOS los datos actuales (movimientos, viáticos, vendedores, cortes, configuraciones, todo) por los del archivo que subas.
          El servidor se reiniciará automáticamente. Cualquier movimiento capturado después del backup que estás restaurando se perderá.
          <br /><br />
          <strong>Antes de continuar:</strong>
          <br />1. Descarga primero un backup del estado actual (pestaña "Backup completo")
          <br />2. Avisa a todos los usuarios que el sistema se reiniciará
          <br />3. Confirma que el archivo .db que vas a subir es el correcto
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="bk-label">Selecciona archivo .db del backup</label>
          <input ref={fileInputRef} type="file" accept=".db" onChange={handleFile}
            style={{ display: 'block', padding: 8, border: '2px dashed var(--line)', borderRadius: 'var(--radius-sm)', width: '100%', cursor: 'pointer' }} />
        </div>

        {archivoInfo && (
          <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13 }}>
            📁 <strong>{archivoInfo.name}</strong> · {fmtBytes(archivoInfo.size)} · {fmtDateTime(archivoInfo.lastModified)}
          </div>
        )}

        <button
          className="bk-btn bk-btn-danger bk-btn-lg"
          disabled={!archivo || !archivoBase64}
          onClick={() => setShowModal(true)}
        >
          🔥 Iniciar proceso de restauración
        </button>
      </div>

      {showModal && (
        <RestaurarModal
          archivoInfo={archivoInfo}
          archivoBase64={archivoBase64}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// === MODAL DE TRIPLE CONFIRMACIÓN ===
function RestaurarModal({ archivoInfo, archivoBase64, onClose }) {
  const [step, setStep] = useState(1);
  const [tokenInput, setTokenInput] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);

  const next = () => { setError(''); setStep(s => s + 1); };

  const ejecutar = async () => {
    setError(''); setRestoring(true);
    try {
      const r = await apiFetchBk('/api/backup/restore-full', {
        method: 'POST',
        body: JSON.stringify({
          confirmation_token: 'RESTAURAR',
          password,
          db_base64: archivoBase64
        })
      });
      setDone(true);
      // Después de 4 segundos, recargar la página (server se reinició)
      setTimeout(() => { window.location.reload(); }, 4000);
    } catch (e) { setError(e.message); setRestoring(false); }
  };

  return (
    <div className="bk-modal-bg" onClick={(e) => { if (!restoring && !done) onClose(); }}>
      <div className="bk-modal" onClick={e => e.stopPropagation()}>
        <div className="bk-modal-head">
          <h2>🔥 Restauración de BD</h2>
          <div className="step">Paso {step} de 3 · Confirmación obligatoria</div>
        </div>
        <div className="bk-modal-body">
          <div className="bk-step-progress">
            <div className={'bk-step-dot' + (step >= 1 ? ' active' : '')}></div>
            <div className={'bk-step-dot' + (step >= 2 ? ' active' : '')}></div>
            <div className={'bk-step-dot' + (step >= 3 ? ' active' : '')}></div>
          </div>

          {error && <div className="bk-error">⚠ {error}</div>}
          {done && <div className="bk-success">✅ Restauración aplicada. Reiniciando servidor… La página se recargará en breve.</div>}

          {step === 1 && !done && (
            <React.Fragment>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--f-display)', fontSize: 16, color: '#991B1B' }}>
                ¿Estás absolutamente seguro?
              </h3>
              <div className="bk-danger-box">
                Estás a punto de restaurar la base de datos con el archivo:<br /><br />
                📁 <strong style={{ fontFamily: 'var(--f-mono)' }}>{archivoInfo?.name}</strong><br />
                📏 <strong>{fmtBytes(archivoInfo?.size)}</strong><br /><br />
                Esto BORRARÁ todos los datos actuales y los reemplazará por los del archivo.<br />
                <strong>Esta acción no se puede deshacer.</strong>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                Se hará automáticamente un backup de seguridad del estado actual antes de restaurar, por si necesitas revertir.
              </p>
            </React.Fragment>
          )}

          {step === 2 && !done && (
            <React.Fragment>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--f-display)', fontSize: 16, color: '#991B1B' }}>
                Confirmación por escrito
              </h3>
              <p style={{ fontSize: 13 }}>
                Para continuar, escribe la palabra <code style={{ background: '#FEE2E2', padding: '3px 8px', borderRadius: 3, color: '#991B1B', fontWeight: 800, fontSize: 14 }}>RESTAURAR</code> en el campo de abajo (exactamente, en mayúsculas):
              </p>
              <input className="bk-input" autoFocus value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Escribe RESTAURAR"
                style={{ fontFamily: 'var(--f-mono)', textAlign: 'center', fontSize: 18, letterSpacing: 2, marginTop: 6 }} />
              {tokenInput && tokenInput !== 'RESTAURAR' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#EF4444' }}>
                  La palabra no coincide. Debe ser exactamente "RESTAURAR" en mayúsculas.
                </div>
              )}
            </React.Fragment>
          )}

          {step === 3 && !done && (
            <React.Fragment>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--f-display)', fontSize: 16, color: '#991B1B' }}>
                Confirmación final
              </h3>
              <p style={{ fontSize: 13 }}>
                Ingresa tu contraseña de administrador para confirmar la restauración. Esta es la <strong>última oportunidad</strong> de cancelar.
              </p>
              <label className="bk-label">Contraseña administrador</label>
              <input className="bk-input" type="password" autoFocus value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => { if (e.key === 'Enter' && password) ejecutar(); }} />
              <div style={{ marginTop: 14, padding: 10, background: '#FEE2E2', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#991B1B', border: '1.5px solid #FCA5A5' }}>
                ⚠️ Al hacer click en <strong>"EJECUTAR RESTAURACIÓN"</strong>, el servidor reemplazará la BD y se reiniciará automáticamente. Toma 5-10 segundos.
              </div>
            </React.Fragment>
          )}
        </div>
        <div className="bk-modal-foot">
          <button className="bk-btn bk-btn-ghost" onClick={onClose} disabled={restoring || done}>
            Cancelar
          </button>
          {!done && (
            <React.Fragment>
              {step === 1 && (
                <button className="bk-btn bk-btn-warn" onClick={next}>Entiendo, continuar →</button>
              )}
              {step === 2 && (
                <button className="bk-btn bk-btn-warn"
                  onClick={next}
                  disabled={tokenInput !== 'RESTAURAR'}>
                  Confirmar y continuar →
                </button>
              )}
              {step === 3 && (
                <button className="bk-btn bk-btn-danger"
                  onClick={ejecutar}
                  disabled={!password || restoring}>
                  {restoring ? '⏳ Restaurando…' : '🔥 EJECUTAR RESTAURACIÓN'}
                </button>
              )}
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

window.BackupView = BackupView;
