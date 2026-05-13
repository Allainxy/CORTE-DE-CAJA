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
  const [groups, setGroups] = useState([]);
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
      let g = await KBotDB.getAll('groups');
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
      setMovs(m); setCats(c); setGroups(g); setBudgets(bm);

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
              const dead = r.cats.filter(x => x.deleted).map(x => x.id);
              await KBotDB.bulkPut('cats', live);
              for (const id of dead) await KBotDB.del('cats', id);
            }
            if (r.groups?.length) {
              const live = r.groups.filter(x => !x.deleted);
              const dead = r.groups.filter(x => x.deleted).map(x => x.id);
              await KBotDB.bulkPut('groups', live);
              for (const id of dead) await KBotDB.del('groups', id);
            }
            if (r.budgets?.length) {
              await KBotDB.bulkPut('budgets', r.budgets);
            }
            setMovs(await KBotDB.getAll('movs'));
            setCats(await KBotDB.getAll('cats'));
            setGroups(await KBotDB.getAll('groups'));
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
    if (user?.rol !== 'admin') { alert('Solo el admin puede borrar categorías'); return; }
    await KBotDB.del('cats', id);
    setCats(prev => prev.filter(c => c.id !== id));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.deleteCat(id);
  };

  const addGroup = async (g) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede crear grupos'); return; }
    await KBotDB.put('groups', g);
    setGroups(prev => {
      const map = new Map(prev.map(x => [x.id, x]));
      map.set(g.id, g);
      return Array.from(map.values());
    });
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.syncGroup(g);
  };

  const deleteGroup = async (id) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede borrar grupos'); return; }
    const inUse = cats.filter(c => c.group_id === id).length;
    if (inUse > 0) { alert(`No se puede eliminar: ${inUse} categoría(s) lo usan. Reasígnalas primero.`); return; }
    await KBotDB.del('groups', id);
    setGroups(prev => prev.filter(g => g.id !== id));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.deleteGroup(id);
  };

  const updateGroup = async (g) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede editar grupos'); return; }
    const updated = { ...g, updated_at: Date.now() };
    await KBotDB.put('groups', updated);
    setGroups(prev => prev.map(x => x.id === g.id ? updated : x));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.updateGroup(updated);
  };

  // Reordenar: dir = -1 (subir) o +1 (bajar). Mueve dentro del mismo tipo.
  const reorderGroup = async (id, dir) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede reordenar grupos'); return; }
    const grp = groups.find(g => g.id === id);
    if (!grp) return;
    const sameType = groups
      .filter(g => g.tipo === grp.tipo && !g.deleted)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
    const idx = sameType.findIndex(g => g.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sameType.length) return; // ya está en el extremo
    // Swap
    [sameType[idx], sameType[newIdx]] = [sameType[newIdx], sameType[idx]];
    // Reasignar orden 0..N
    const items = sameType.map((g, i) => ({ id: g.id, orden: i }));
    const map = new Map(items.map(it => [it.id, it.orden]));
    const now = Date.now();
    const updatedAll = groups.map(g => map.has(g.id) ? { ...g, orden: map.get(g.id), updated_at: now } : g);
    await KBotDB.bulkPut('groups', updatedAll.filter(g => map.has(g.id)));
    setGroups(updatedAll);
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.reorderGroups(items);
  };

  const updateCategory = async (c, opts = {}) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede editar categorías'); return; }
    const existing = cats.find(x => x.id === c.id);
    if (!existing) return;
    const updated = { ...existing, ...c, updated_at: Date.now() };
    await KBotDB.put('cats', updated);
    setCats(prev => prev.map(x => x.id === c.id ? updated : x));

    // Cascada local: si renombró y aceptó actualizar movimientos
    if (opts.cascadeRename && existing.nombre !== updated.nombre) {
      const affectedMovs = movs.filter(m => m.tipo === existing.tipo && m.categoria === existing.nombre);
      if (affectedMovs.length > 0) {
        const renamed = affectedMovs.map(m => ({ ...m, categoria: updated.nombre, updated_at: Date.now() }));
        await KBotDB.bulkPut('movs', renamed);
        setMovs(prev => prev.map(m => {
          if (m.tipo === existing.tipo && m.categoria === existing.nombre) {
            return { ...m, categoria: updated.nombre, updated_at: Date.now() };
          }
          return m;
        }));
      }
    }

    if (KBotAPI.enabled() && KBotAPI.token()) {
      KBotAPI.updateCat({ ...updated, cascadeRename: !!opts.cascadeRename });
    }
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
      <Sidebar active={active} setActive={setActive} onAddClick={() => openCapture('INGRESO')} user={user} onLogout={handleLogout} />
      <main className="main-area">
        <TopBar installEvt={installEvt} onInstall={promptInstall} movsCount={movs.length} user={user} onLogout={handleLogout} syncing={syncing} />
        {active === 'dashboard' && <DashboardView movs={movs} cats={cats} setActive={setActive} openCapture={openCapture} />}
        {active === 'movs' && <MovsListView movs={movs} cats={cats} onEdit={editMov} onDelete={deleteMov} />}
        {active === 'reportes' && <ReportsView movs={movs} cats={cats} />}
        {active === 'categorias' && <CategoriasView cats={cats} movs={movs} groups={groups} user={user} addCategory={addCategory} deleteCategory={deleteCategory} updateCategory={updateCategory} addGroup={addGroup} deleteGroup={deleteGroup} updateGroup={updateGroup} reorderGroup={reorderGroup} budgets={budgets} setBudget={setBudget} />}
        {active === 'xml' && <XMLView movs={movs} cats={cats} onImport={importMovs} />}
      </main>
      <BottomNav active={active} setActive={setActive} onAddClick={() => openCapture('INGRESO')} />
      <CaptureModal
        open={captureOpen}
        onClose={() => { setCaptureOpen(false); setEditing(null); }}
        cats={cats}
        groups={groups}
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
