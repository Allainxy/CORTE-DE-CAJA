// app.jsx — Root component, state, persistence, tweaks
const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "rojo",
  "density": "comoda"
}/*EDITMODE-END*/;

const ACCENTS = {
  rojo:    { primary: '#E63946', primarySoft: '#FFD9D9', label: 'ROJO BOTANERO' },
  naranja: { primary: '#FF6B35', primarySoft: '#FFE0CF', label: 'NARANJA CHILE' },
  amarillo:{ primary: '#FFB800', primarySoft: '#FFF1C2', label: 'AMARILLO MAÍZ' },
  magenta: { primary: '#D63384', primarySoft: '#FBD3E5', label: 'MAGENTA TIANGUIS' },
  verde:   { primary: '#2EC27E', primarySoft: '#CFF0DD', label: 'VERDE LIMÓN' },
};

function App() {
  const [movs, setMovs] = useState([]);
  const [cats, setCats] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [active, setActive] = useState('dashboard');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTipo, setCaptureTipo] = useState('INGRESO');
  const [editing, setEditing] = useState(null);
  const [tweaks, setTweaks] = useTweaks(TWEAKS_DEFAULTS);
  const [installEvt, setInstallEvt] = useState(null);
  const [user, setUser] = useState(() => KBotAPI.user());
  const [needsLogin, setNeedsLogin] = useState(() => KBotAPI.enabled() && !KBotAPI.token());
  const [syncing, setSyncing] = useState(false);

  // Load on boot
  useEffect(() => {
    if (needsLogin) return;
    (async () => {
      let m = await KBotDB.getAll('movs');
      let c = await KBotDB.getAll('cats');
      let b = await KBotDB.getAll('budgets');
      if (c.length === 0) {
        c = window.KBotSeed.CATS.slice();
        await KBotDB.bulkPut('cats', c);
      }
      if (m.length === 0 && !KBotAPI.enabled()) {
        m = window.KBotSeed.genSampleMovs();
        await KBotDB.bulkPut('movs', m);
      }
      const bm = {};
      b.forEach(x => bm[x.id] = x.monto);
      setMovs(m); setCats(c); setBudgets(bm);

      // Pull desde el servidor si hay backend
      if (KBotAPI.enabled() && KBotAPI.token()) {
        try {
          setSyncing(true);
          await KBotAPI.flushQueue();
          const r = await KBotAPI.pull();
          if (r) {
            if (r.movs?.length) {
              const live = r.movs.filter(x => !x.deleted);
              const dead = r.movs.filter(x => x.deleted).map(x => x.id);
              await KBotDB.bulkPut('movs', live);
              for (const id of dead) await KBotDB.del('movs', id);
            }
            if (r.cats?.length) {
              const live = r.cats.filter(x => !x.deleted);
              await KBotDB.bulkPut('cats', live);
            }
            if (r.budgets?.length) {
              await KBotDB.bulkPut('budgets', r.budgets);
            }
            setMovs(await KBotDB.getAll('movs'));
            setCats(await KBotDB.getAll('cats'));
            const bs = await KBotDB.getAll('budgets');
            const bm2 = {}; bs.forEach(x => bm2[x.id] = x.monto);
            setBudgets(bm2);
          }
        } catch (e) { console.warn('Sync inicial falló', e); }
        setSyncing(false);
      }
    })();
  }, [needsLogin]);

  const handleLogin = (u) => {
    if (u) setUser(u);
    setNeedsLogin(false);
  };
  const handleLogout = () => {
    KBotAPI.logout();
    setUser(null);
    setNeedsLogin(true);
  };

  // Theme
  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    const a = ACCENTS[tweaks.accent] || ACCENTS.rojo;
    document.documentElement.style.setProperty('--primary', a.primary);
    document.documentElement.style.setProperty('--primary-soft', a.primarySoft);
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks]);

  // PWA install
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const saveMov = async (mov) => {
    if (user && !mov.usuario) mov.usuario = user.nombre;
    await KBotDB.put('movs', mov);
    setMovs(prev => {
      const idx = prev.findIndex(x => x.id === mov.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = mov; return n; }
      return [mov, ...prev];
    });
    setEditing(null);
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.syncMov(mov);
  };

  const deleteMov = async (id) => {
    await KBotDB.del('movs', id);
    setMovs(prev => prev.filter(m => m.id !== id));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.deleteMov(id);
  };

  const importMovs = async (items) => {
    await KBotDB.bulkPut('movs', items);
    setMovs(prev => {
      const map = new Map(prev.map(m => [m.id, m]));
      items.forEach(i => map.set(i.id, i));
      return Array.from(map.values());
    });
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.bulkMovs(items);
  };

  const addCategory = async (c) => {
    await KBotDB.put('cats', c);
    setCats(prev => [...prev, c]);
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.syncCat(c);
  };

  const deleteCategory = async (id) => {
    await KBotDB.del('cats', id);
    setCats(prev => prev.filter(c => c.id !== id));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.deleteCat(id);
  };

  const setBudget = async (id, monto) => {
    await KBotDB.put('budgets', { id, monto });
    setBudgets(prev => ({ ...prev, [id]: monto }));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.syncBudget(id, monto);
  };

  const openCapture = (tipo) => {
    setCaptureTipo(typeof tipo === 'string' ? tipo : 'INGRESO');
    setEditing(null);
    setCaptureOpen(true);
  };

  const editMov = (m) => {
    setEditing(m);
    setCaptureOpen(true);
  };

  const promptInstall = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    setInstallEvt(null);
  };

  if (needsLogin) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} onAddClick={() => openCapture('INGRESO')} />
      <main className="main-area">
        <TopBar installEvt={installEvt} onInstall={promptInstall} movsCount={movs.length} user={user} onLogout={handleLogout} syncing={syncing} />
        {active === 'dashboard' && <DashboardView movs={movs} cats={cats} setActive={setActive} openCapture={openCapture} />}
        {active === 'movs' && <MovsListView movs={movs} cats={cats} onEdit={editMov} onDelete={deleteMov} />}
        {active === 'reportes' && <ReportsView movs={movs} cats={cats} />}
        {active === 'categorias' && <CategoriasView cats={cats} movs={movs} addCategory={addCategory} deleteCategory={deleteCategory} budgets={budgets} setBudget={setBudget} />}
        {active === 'xml' && <XMLView movs={movs} cats={cats} onImport={importMovs} />}
      </main>
      <BottomNav active={active} setActive={setActive} onAddClick={() => openCapture('INGRESO')} />
      <CaptureModal
        open={captureOpen}
        onClose={() => { setCaptureOpen(false); setEditing(null); }}
        cats={cats}
        onSave={saveMov}
        initialTipo={captureTipo}
        editing={editing}
        addCategory={addCategory}
      />
      <KBotTweaks tweaks={tweaks} setTweak={setTweaks} />
    </div>
  );
}

function TopBar({ installEvt, onInstall, movsCount, user, onLogout, syncing }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    window.addEventListener('online', u); window.addEventListener('offline', u);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); };
  }, []);
  return (
    <div className="topbar">
      <div className="tb-left mono">
        <span className={'status-dot ' + (online ? 'on' : 'off')} />
        {online ? 'EN LÍNEA' : 'OFFLINE'} · {movsCount} mov.
        {syncing && <span style={{ marginLeft: 8, color: 'var(--primary)' }}>↻ SYNC…</span>}
      </div>
      <div className="tb-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {installEvt && (
          <button className="install-btn" onClick={onInstall}>⤓ INSTALAR APP</button>
        )}
        {user && (
          <div className="user-chip mono">
            <span className="user-dot" />
            <span>{user.nombre}</span>
            <button className="link-btn" onClick={onLogout} title="Cerrar sesión">↩</button>
          </div>
        )}
      </div>
    </div>
  );
}

function KBotTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Apariencia">
        <TweakRadio label="Tema" value={tweaks.theme} onChange={v => setTweak('theme', v)}
          options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
        <TweakSelect label="Color de acento" value={tweaks.accent} onChange={v => setTweak('accent', v)}
          options={Object.entries(ACCENTS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <TweakRadio label="Densidad" value={tweaks.density} onChange={v => setTweak('density', v)}
          options={[{ value: 'compacta', label: 'Compacta' }, { value: 'comoda', label: 'Cómoda' }]} />
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
