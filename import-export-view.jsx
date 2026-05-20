// import-export-view.jsx — Pantalla de Importar/Exportar (solo admin)
// Tabs: IMPORTAR (subir archivo + preview + confirmar) | EXPORTAR (descarga) | HISTORIAL

const ImportExportView = ({ user, onImported }) => {
  const [tab, setTab] = useState('importar');

  if (user?.rol !== 'admin') {
    return (
      <div className="view">
        <header className="view-head">
          <div>
            <div className="eyebrow">DATOS</div>
            <h1 className="view-title">IMPORTAR / EXPORTAR</h1>
          </div>
        </header>
        <BotanaCard>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
            <p>Solo el administrador puede importar/exportar datos.</p>
          </div>
        </BotanaCard>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <div className="eyebrow">DATOS</div>
          <h1 className="view-title">IMPORTAR / EXPORTAR</h1>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--ink-soft, #ddd)' }}>
        {[
          { id: 'importar', label: '⬆ IMPORTAR', desc: 'Subir Excel/CSV' },
          { id: 'exportar', label: '⬇ EXPORTAR', desc: 'Descargar movimientos' },
          { id: 'historial', label: '📋 HISTORIAL', desc: 'Imports anteriores' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: tab === t.id ? 'var(--bg-2, #fff8f0)' : 'transparent',
              borderBottom: tab === t.id ? '3px solid var(--primary, #E63946)' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              marginBottom: -1
            }}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'importar' && <ImportTab onImported={onImported} />}
      {tab === 'exportar' && <ExportTab />}
      {tab === 'historial' && <HistorialTab onImported={onImported} />}
    </div>
  );
};

// ----- TAB IMPORTAR -----
function ImportTab({ onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (f) => {
    if (!f) return;
    setError(''); setPreview(null); setResult(null);
    const ext = f.name.toLowerCase().match(/\.([^.]+)$/)?.[1];
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Formato no soportado. Usa .xlsx, .xls o .csv');
      return;
    }
    setFile(f);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const resp = await fetch(apiUrl + '/api/import/preview', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok },
        body: fd
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || 'Error ' + resp.status);
      }
      const data = await resp.json();
      setPreview(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    if (!confirm(`¿Confirmar importación de ${preview.stats.movimientos} movimientos?\n\nSe crearán:\n  • ${preview.stats.cats_nuevas} categorías nuevas\n  • ${preview.stats.cajas_nuevas} cajas nuevas\n  • ${preview.stats.groups_nuevos} grupos nuevos\n\nEsta acción se puede revertir desde el HISTORIAL.`)) return;
    setCommitting(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const resp = await fetch(apiUrl + '/api/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + tok
        },
        body: JSON.stringify({
          data: preview.data,
          filename: file?.name || 'import',
          formato: file?.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error');
      setResult(data);
      setPreview(null);
      setFile(null);
      if (onImported) onImported();
    } catch (e) {
      alert('Error al importar: ' + e.message);
    }
    setCommitting(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div>
      {result && (
        <BotanaCard accent="var(--green, #2EC27E)" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ fontSize: 36 }}>✅</div>
          <h3 style={{ margin: '8px 0' }}>Importación exitosa</h3>
          <div className="mono" style={{ fontSize: 13 }}>
            • {result.movsInsertados} movimientos<br />
            • {result.catsInsertadas} categorías nuevas<br />
            • {result.cajasInsertadas} cajas nuevas<br />
            • {result.groupsInsertados} grupos nuevos
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>
            Si te equivocaste, ve al tab HISTORIAL y presiona "Revertir".
          </div>
          <button className="btn-ghost" onClick={() => setResult(null)} style={{ marginTop: 12 }}>CERRAR</button>
        </BotanaCard>
      )}

      {!preview && !result && (
        <BotanaCard>
          <div
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            style={{
              padding: 40,
              textAlign: 'center',
              border: '2px dashed ' + (dragActive ? 'var(--primary, #E63946)' : 'var(--ink-soft, #ccc)'),
              borderRadius: 12,
              background: dragActive ? 'rgba(230, 57, 70, 0.05)' : 'transparent',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
            <h3 style={{ margin: '0 0 8px' }}>Arrastra tu archivo aquí</h3>
            <p style={{ opacity: 0.7, fontSize: 13 }}>o</p>
            <input
              type="file"
              id="file-input"
              accept=".xlsx,.xls,.csv"
              onChange={e => handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-input" className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }}>
              SELECCIONAR ARCHIVO
            </label>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>
              Formatos soportados: .xlsx, .xls, .csv (máx 25 MB)
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-2, #fff8f0)', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
            <strong>📌 ¿No tienes la plantilla?</strong>
            <p style={{ margin: '6px 0' }}>
              Descarga la plantilla Excel con la estructura correcta. Tiene 6 hojas: instrucciones, movimientos, categorías, cajas, grupos y un ejemplo con datos reales.
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.open('/recursos/plantilla-import-kbotanas.xlsx', '_blank'); }}
              style={{ color: 'var(--primary, #E63946)', fontWeight: 700, textDecoration: 'none' }}
            >
              📥 Descargar plantilla
            </a>
          </div>
        </BotanaCard>
      )}

      {loading && (
        <BotanaCard>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <h3>Procesando archivo...</h3>
          </div>
        </BotanaCard>
      )}

      {error && (
        <BotanaCard accent="var(--red, #E63946)" style={{ marginTop: 16 }}>
          <div style={{ padding: 16 }}>
            <strong style={{ color: 'var(--red)' }}>⚠️ Error</strong>
            <p>{error}</p>
            <button className="btn-ghost" onClick={() => setError('')}>CERRAR</button>
          </div>
        </BotanaCard>
      )}

      {preview && (
        <PreviewCard preview={preview} file={file} onConfirm={handleConfirm} onCancel={() => { setPreview(null); setFile(null); }} committing={committing} />
      )}
    </div>
  );
}

function PreviewCard({ preview, file, onConfirm, onCancel, committing }) {
  const s = preview.stats;
  return (
    <div>
      <BotanaCard accent="var(--primary, #E63946)" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>VISTA PREVIA · {file?.name}</div>
            <h3 style={{ margin: '4px 0' }}>{s.movimientos} movimientos detectados</h3>
            {s.fecha_min && s.fecha_max && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Rango: {s.fecha_min} → {s.fecha_max}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
          <StatBox label="INGRESOS" valor={fmtMXN(s.total_ingresos)} sub={`${s.ingresos_count} movs`} color="var(--green, #2EC27E)" />
          <StatBox label="GASTOS" valor={fmtMXN(s.total_gastos)} sub={`${s.gastos_count} movs`} color="var(--red, #E63946)" />
          <StatBox label="NETO" valor={fmtMXN(s.neto)} sub="ingresos − gastos" color={s.neto >= 0 ? 'var(--green)' : 'var(--red)'} />
          <StatBox label="A CREAR" valor={`${s.cats_nuevas} cats · ${s.cajas_nuevas} cajas`} sub={`${s.groups_nuevos} grupos`} color="var(--ink, #333)" />
        </div>

        {(preview.newCats.length > 0 || preview.newCajas.length > 0 || preview.newGroups.length > 0) && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 184, 0, 0.1)', borderRadius: 6, fontSize: 12 }}>
            <strong>🆕 Se crearán automáticamente:</strong>
            {preview.newCats.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Categorías ({preview.newCats.length}):</strong> {preview.newCats.map(c => c.nombre).join(', ')}
              </div>
            )}
            {preview.newCajas.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Cajas ({preview.newCajas.length}):</strong> {preview.newCajas.map(c => c.nombre).join(', ')}
              </div>
            )}
            {preview.newGroups.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Grupos ({preview.newGroups.length}):</strong> {preview.newGroups.map(g => g.nombre).join(', ')}
              </div>
            )}
          </div>
        )}

        {preview.warnings && preview.warnings.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(230, 57, 70, 0.08)', borderRadius: 6, fontSize: 11 }}>
            <strong>⚠️ Advertencias ({preview.warnings.length}):</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0, maxHeight: 120, overflow: 'auto' }}>
              {preview.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
              {preview.warnings.length > 20 && <li>... y {preview.warnings.length - 20} más</li>}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" onClick={onCancel} disabled={committing} style={{ flex: 1 }}>
            CANCELAR
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={committing || s.movimientos === 0} style={{ flex: 2 }}>
            {committing ? 'IMPORTANDO…' : `✅ CONFIRMAR IMPORT (${s.movimientos} movs)`}
          </button>
        </div>
      </BotanaCard>
    </div>
  );
}

function StatBox({ label, valor, sub, color }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-2, #fff8f0)', borderRadius: 8, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 800, color }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, opacity: 0.6 }}>{sub}</div>}
    </div>
  );
}

// ----- TAB EXPORTAR -----
function ExportTab() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [formato, setFormato] = useState('xlsx');

  const exportar = async () => {
    const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
    const tok = KBotAPI.token();
    const params = new URLSearchParams({ formato });
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    try {
      const resp = await fetch(apiUrl + '/api/export?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (!resp.ok) throw new Error('Error ' + resp.status);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = formato === 'xlsx' ? 'xlsx' : formato === 'csv' ? 'csv' : 'json';
      a.download = `kbotanas-export-${new Date().toISOString().slice(0,10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar: ' + e.message);
    }
  };

  return (
    <BotanaCard style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px' }}>Exportar movimientos</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="field">
          <div className="field-label"><span>DESDE (opcional)</span></div>
          <input type="date" className="text-input" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <div className="field-label"><span>HASTA (opcional)</span></div>
          <input type="date" className="text-input" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <div className="field-label"><span>FORMATO</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'xlsx', label: '📊 EXCEL (.xlsx)', desc: 'Para abrir en Excel' },
            { id: 'csv',  label: '📄 CSV',          desc: 'Universal, importable a cualquier app' },
            { id: 'json', label: '🔧 JSON',         desc: 'Para programadores' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFormato(f.id)}
              className={'btn-ghost' + (formato === f.id ? ' active' : '')}
              style={{
                flex: 1, padding: 12, textAlign: 'left',
                background: formato === f.id ? 'var(--ink, #333)' : 'transparent',
                color: formato === f.id ? '#fff' : 'inherit',
                borderRadius: 8
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <button className="btn-primary" onClick={exportar} style={{ width: '100%', padding: 14 }}>
        ⬇ DESCARGAR ARCHIVO
      </button>

      <div style={{ marginTop: 16, fontSize: 11, opacity: 0.7 }}>
        Si no especificas fechas, se exporta todo. La descarga inicia automáticamente.
      </div>
    </BotanaCard>
  );
}

// ----- TAB HISTORIAL -----
function HistorialTab({ onImported }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/import/log', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      setEntries(data.entries || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const revertir = async (entry) => {
    if (!confirm(`¿Revertir el import "${entry.filename}"?\n\nSe marcarán como eliminados:\n  • ${entry.total_movs} movimientos\n  • ${entry.total_cats} categorías\n  • ${entry.total_cajas} cajas\n  • ${entry.total_groups} grupos\n\nEsta acción es reversible solo restaurando un backup.`)) return;
    try {
      const apiUrl = (document.querySelector('meta[name=api-url]')?.content || '').replace(/\/$/, '');
      const tok = KBotAPI.token();
      const r = await fetch(apiUrl + '/api/import/revert/' + entry.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      alert('✅ Import revertido. Los datos se marcaron como eliminados.');
      cargar();
      if (onImported) onImported();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) return <BotanaCard><div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div></BotanaCard>;

  return (
    <BotanaCard style={{ padding: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--bg-2, #fff8f0)' }}>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>FECHA</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>USUARIO</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>ARCHIVO</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>MOVS</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>CATS</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>CAJAS</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>ESTADO</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>ACCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan="8" style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Sin imports realizados</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id} style={{ borderTop: '1px solid var(--line, #eee)', opacity: e.reverted ? 0.4 : 1 }}>
                <td className="mono" style={{ padding: '10px 12px', fontSize: 11 }}>{new Date(e.ts).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 12px' }}>{e.user_nombre}</td>
                <td style={{ padding: '10px 12px' }}>{e.filename}</td>
                <td className="mono" style={{ padding: '10px 12px', textAlign: 'right' }}>{e.total_movs}</td>
                <td className="mono" style={{ padding: '10px 12px', textAlign: 'right' }}>{e.total_cats}</td>
                <td className="mono" style={{ padding: '10px 12px', textAlign: 'right' }}>{e.total_cajas}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {e.reverted ? (
                    <span style={{ fontSize: 11, color: '#888' }}>↩ REVERTIDO</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--green, #2EC27E)', fontWeight: 700 }}>● ACTIVO</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  {!e.reverted && (
                    <button className="ic-btn danger" onClick={() => revertir(e)} title="Revertir import">↩ REVERTIR</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BotanaCard>
  );
}

window.ImportExportView = ImportExportView;
