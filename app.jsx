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
  const [cajas, setCajas] = useState([]);
  const [misCajas, setMisCajas] = useState([]); // ids de cajas que el user puede usar (vacío = todas)
  const [budgets, setBudgets] = useState({});
  const [filterCaja, setFilterCaja] = useState('all'); // 'all' o un id de caja
  const [active, setActive] = useState('dashboard');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTipo, setCaptureTipo] = useState('INGRESO');
  const [captureOpts, setCaptureOpts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // {tipo, id} para confirmar con PIN
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
      let cj = await KBotDB.getAll('cajas');
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
      setMovs(m); setCats(c); setGroups(g); setCajas(cj); setBudgets(bm);

      // Función reusable que procesa el resultado del sync y actualiza estado React + IndexedDB
      const processSyncResult = async (r) => {
        if (!r) return;
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
        if (r.cajas?.length) {
          const live = r.cajas.filter(x => !x.deleted);
          const dead = r.cajas.filter(x => x.deleted).map(x => x.id);
          await KBotDB.bulkPut('cajas', live);
          for (const id of dead) await KBotDB.del('cajas', id);
        }
        if (r.budgets?.length) {
          await KBotDB.bulkPut('budgets', r.budgets);
        }
        if (Array.isArray(r.misCajas)) setMisCajas(r.misCajas);
        setMovs(await KBotDB.getAll('movs'));
        setCats(await KBotDB.getAll('cats'));
        setGroups(await KBotDB.getAll('groups'));
        setCajas(await KBotDB.getAll('cajas'));
        const bs = await KBotDB.getAll('budgets');
        const bm2 = {}; bs.forEach(x => bm2[x.id] = x.monto);
        setBudgets(bm2);
      };

      // Exponer función global de resync que cualquier vista puede llamar
      window.kbotFullResync = async () => {
        try {
          const r = await KBotAPI.pullFull();
          await processSyncResult(r);
          return true;
        } catch (e) {
          console.warn('Resync falló:', e);
          return false;
        }
      };

      // Sync ligero e incremental (para el auto-sync periódico cada 30 s).
      window.kbotLightSync = async () => {
        try {
          await KBotAPI.flushQueue();
          const r = await KBotAPI.pull();
          await processSyncResult(r);
          return true;
        } catch (e) {
          return false;
        }
      };

      // Pull desde el servidor si hay backend
      if (KBotAPI.enabled() && KBotAPI.token()) {
        try {
          setSyncing(true);
          await KBotAPI.flushQueue();
          const bdVacia = (c.length === 0 || cj.length === 0);
          const r = bdVacia ? await KBotAPI.pullFull() : await KBotAPI.pull();
          if (bdVacia) console.info('🔄 BD local vacía, sync completo desde servidor');
          await processSyncResult(r);
        } catch (e) { console.warn('Sync inicial falló', e); }
        setSyncing(false);
      }
    })();
  }, [needsLogin]);

  const handleLogin = (u) => {
    if (u) setUser(u);
    setNeedsLogin(false);
  };

  // Auto-sync periódico: cada 30 s trae cambios del servidor (lo que capturaron
  // otros usuarios) sin que nadie tenga que recargar. Usa pull() incremental
  // (ligero) y solo corre si hay sesión, conexión y la pestaña está visible.
  // IMPORTANTE: se PAUSA mientras hay un formulario/modal abierto (Capturar,
  // Transferencia, Editar) para no re-renderizar la pantalla mientras capturas.
  useEffect(() => {
    window.__kbotModalOpen = captureOpen || transferOpen || !!editing;
  }, [captureOpen, transferOpen, editing]);

  useEffect(() => {
    if (needsLogin) return;
    if (!(KBotAPI.enabled() && KBotAPI.token())) return;
    const tick = async () => {
      if (document.hidden || !navigator.onLine) return;
      if (window.__kbotModalOpen) return; // no sincronizar mientras se captura
      try { if (window.kbotLightSync) await window.kbotLightSync(); } catch (e) { /* silencioso */ }
    };
    const iv = setInterval(tick, 30000);
    const onVis = () => { if (!document.hidden && !window.__kbotModalOpen) tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [needsLogin]);
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
    // Sello lógico del momento de edición (normalizado al reloj del server) para last-write-wins.
    mov.updated_at = (KBotAPI.logicalNow ? KBotAPI.logicalNow() : Date.now());
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
    // Todos los roles que pueden borrar (admin, gerente) requieren PIN.
    // USUARIO y CONSULTA no llegan aquí porque el botón está oculto.
    setPendingDelete({ tipo: 'mov', id });
  };

  // Ejecuta el borrado real una vez validado el PIN.
  // Si el server responde 404 (mov ya no existe), igual se borra localmente.
  const executeDelete = async (pin) => {
    const pd = pendingDelete;
    if (!pd) return;
    try {
      if (pd.tipo === 'mov') {
        const r = await KBotAPI.deleteMovWithPin(pd.id, pin);
        // Borrado local SIEMPRE, exitoso o "alreadyGone" (404)
        await KBotDB.del('movs', pd.id);
        setMovs(prev => prev.filter(m => m.id !== pd.id));
        if (r?.alreadyGone) {
          console.info('Mov ya no existía en server, eliminado del local');
        }
      } else if (pd.tipo === 'transfer') {
        if (!KBotAPI.enabled() || !KBotAPI.token() || !navigator.onLine) {
          throw new Error('Eliminar requiere conexión a internet');
        }
        const r = await KBotAPI.deleteTransfer(pd.id, pin);
        const pares = movs.filter(m => m.transfer_id === pd.id);
        for (const p of pares) await KBotDB.del('movs', p.id);
        setMovs(prev => prev.filter(m => m.transfer_id !== pd.id));
        if (r?.alreadyGone) {
          console.info('Transferencia ya no existía en server, eliminada del local');
        }
      }
      setPendingDelete(null);
    } catch (e) {
      // Re-lanza para que ConfirmPinModal muestre el mensaje sin cerrar
      throw e;
    }
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

  // ---------- Cajas ----------
  const addCaja = async (c) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede crear cajas'); return; }
    const caja = { ...c, updated_at: Date.now() };
    await KBotDB.put('cajas', caja);
    setCajas(prev => [...prev.filter(x => x.id !== caja.id), caja]);
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.syncCaja(caja);
  };

  const updateCaja = async (c) => {
    if (user?.rol !== 'admin') { alert('Solo el admin puede editar cajas'); return; }
    const existing = cajas.find(x => x.id === c.id);
    if (!existing) return;
    const merged = { ...existing, ...c, updated_at: Date.now() };
    await KBotDB.put('cajas', merged);
    setCajas(prev => prev.map(x => x.id === c.id ? merged : x));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.updateCaja(merged);
  };

  const archivarCaja = async (id, archivada) => {
    if (user?.rol !== 'admin') { alert('Solo el admin'); return; }
    const c = cajas.find(x => x.id === id);
    if (!c) return;
    const merged = { ...c, archivada: archivada ? 1 : 0, updated_at: Date.now() };
    await KBotDB.put('cajas', merged);
    setCajas(prev => prev.map(x => x.id === id ? merged : x));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.archivarCaja(id, archivada);
  };

  const deleteCaja = async (id) => {
    if (user?.rol !== 'admin') { alert('Solo el admin'); return; }
    const usadas = movs.filter(m => m.caja === id && !m.deleted).length;
    if (usadas > 0) {
      alert(`No se puede eliminar: la caja tiene ${usadas} movimiento(s). Archívala en su lugar.`);
      return;
    }
    await KBotDB.del('cajas', id);
    setCajas(prev => prev.filter(c => c.id !== id));
    if (KBotAPI.enabled() && KBotAPI.token()) KBotAPI.deleteCaja(id);
  };

  // Calcular saldo local de una caja (mismo cálculo que el backend)
  const saldoCaja = (cajaId) => {
    const c = cajas.find(x => x.id === cajaId);
    if (!c) return 0;
    const fechaInicial = c.fecha_inicial || '';
    let saldo = c.saldo_inicial || 0;
    movs.forEach(m => {
      if (m.deleted || m.caja !== cajaId) return;
      if (fechaInicial && m.fecha < fechaInicial) return;
      // Respetar afecta_saldo: gastos/gasolina de cortes de ruta (afecta_saldo=0)
      // no mueven la caja (el vendedor ya los descontó del efectivo entregado).
      if (m.afecta_saldo === 0 || m.afecta_saldo === false) return;
      if (m.tipo === 'INGRESO') saldo += m.monto;
      else if (m.tipo === 'GASTO') saldo -= m.monto;
    });
    return Math.round((saldo + Number.EPSILON) * 100) / 100;
  };

  const transferir = async ({ cajaOrigen, cajaDestino, monto, fecha, concepto, notas }) => {
    if (!cajaOrigen || !cajaDestino) { alert('Selecciona caja origen y destino'); return; }
    if (cajaOrigen === cajaDestino) { alert('La caja origen no puede ser igual a la destino'); return; }
    const m = Number(monto);
    if (!m || m <= 0) { alert('Monto inválido'); return; }
    const cOrigen = cajas.find(x => x.id === cajaOrigen);
    if (cOrigen && !cOrigen.permite_negativo) {
      const s = saldoCaja(cajaOrigen);
      if (s - m < 0) {
        alert(`Saldo insuficiente en ${cOrigen.nombre}: $${s.toFixed(2)} disponible`);
        return;
      }
    }
    if (!KBotAPI.enabled() || !KBotAPI.token() || !navigator.onLine) {
      alert('Las transferencias requieren conexión a internet');
      return;
    }
    try {
      await KBotAPI.transferir({ cajaOrigen, cajaDestino, monto: m, fecha, concepto, notas });
      // Recargar movs después de transferir
      const r = await KBotAPI.pull();
      if (r?.movs?.length) {
        const live = r.movs.filter(x => !x.deleted);
        const dead = r.movs.filter(x => x.deleted).map(x => x.id);
        await KBotDB.bulkPut('movs', live);
        for (const id of dead) await KBotDB.del('movs', id);
        setMovs(await KBotDB.getAll('movs'));
      }
      return true;
    } catch (e) {
      alert('Error al transferir: ' + e.message);
      return false;
    }
  };

  const deleteTransfer = async (transferId) => {
    setPendingDelete({ tipo: 'transfer', id: transferId });
  };

  const openCapture = (tipoOrOpts) => {
    if (typeof tipoOrOpts === 'string') {
      setCaptureTipo(tipoOrOpts);
      setCaptureOpts(null);
    } else if (tipoOrOpts && typeof tipoOrOpts === 'object') {
      setCaptureTipo(tipoOrOpts.tipo || 'INGRESO');
      setCaptureOpts(tipoOrOpts);
    } else {
      setCaptureTipo('INGRESO');
      setCaptureOpts(null);
    }
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

  // Interceptor para que "Capturar" del sidebar abra el modal en vez de cambiar a una pantalla vacía
  const handleSetActive = (id) => {
    if (id === 'capturar') { openCapture('INGRESO'); return; }
    setActive(id);
  };

  // Filtro por caja para vistas que lo soporten
  const filteredMovs = filterCaja === 'all' ? movs : movs.filter(m => m.caja === filterCaja);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={handleSetActive} onAddClick={() => openCapture('INGRESO')} user={user} onLogout={handleLogout} />
      <main className="main-area">
        <TopBar installEvt={installEvt} onInstall={promptInstall} movsCount={filteredMovs.length} user={user} onLogout={handleLogout} syncing={syncing}
          cajas={cajas} filterCaja={filterCaja} setFilterCaja={setFilterCaja} />
        {active === 'dashboard' && <DashboardView movs={filteredMovs} cats={cats} cajas={cajas} saldoCaja={saldoCaja} setFilterCaja={setFilterCaja} setActive={setActive} openCapture={openCapture} />}
        {active === 'movs' && <MovsListView movs={filteredMovs} cats={cats} cajas={cajas} onEdit={editMov} onDelete={deleteMov} user={user} />}
        {active === 'diario' && <DailyView movs={filteredMovs} cats={cats} cajas={cajas} />}
        {active === 'cajas' && <CajasView cajas={cajas} movs={movs} user={user} saldoCaja={saldoCaja}
          addCaja={addCaja} updateCaja={updateCaja} archivarCaja={archivarCaja} deleteCaja={deleteCaja}
          onTransferClick={() => setTransferOpen(true)} setFilterCaja={setFilterCaja} setActive={setActive} openCapture={openCapture} />}
        {active === 'reportes' && <ReportsView movs={filteredMovs} cats={cats} groups={groups} />}
        {active === 'finrep' && <FinrepView movs={filteredMovs} cats={cats} groups={groups} cajas={cajas} user={user} />}
        {active === 'categorias' && <CategoriasView cats={cats} movs={movs} groups={groups} user={user} addCategory={addCategory} deleteCategory={deleteCategory} updateCategory={updateCategory} addGroup={addGroup} deleteGroup={deleteGroup} updateGroup={updateGroup} reorderGroup={reorderGroup} budgets={budgets} setBudget={setBudget} />}
        {active === 'usuarios' && user?.rol === 'admin' && <UsersView cajas={cajas} user={user} />}
        {active === 'arqueo' && <ArqueoView cajas={cajas} user={user} saldoCaja={saldoCaja} />}
        {active === 'cxp' && <CxpView cajas={cajas} cats={cats} groups={groups} user={user} saldoCaja={saldoCaja} refreshAll={() => KBotAPI.pullFull()} />}
        {active === 'compras' && <ComprasView cajas={cajas} cats={cats} user={user} refreshAll={() => KBotAPI.pullFull()} />}
          {active === 'ventas' && <VentasView cajas={cajas} user={user} refreshAll={() => KBotAPI.pullFull()} />}
        {active === 'viaticos' && <ViaticosView cajas={cajas} user={user} refreshAll={() => KBotAPI.pullFull()} />}
        {active === 'nomina' && <NominaView refreshAll={() => KBotAPI.pullFull()} user={user} />}
        {active === 'backup' && user?.rol === 'admin' && <BackupView user={user} />}
        {active === 'importar' && user?.rol === 'admin' && <ImportExportView user={user} onImported={async () => {
          // Re-pull para actualizar movs, cajas, cats, groups
          if (KBotAPI.enabled() && KBotAPI.token()) {
            try {
              setSyncing(true);
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
                if (r.cajas?.length) {
                  const live = r.cajas.filter(x => !x.deleted);
                  const dead = r.cajas.filter(x => x.deleted).map(x => x.id);
                  await KBotDB.bulkPut('cajas', live);
                  for (const id of dead) await KBotDB.del('cajas', id);
                }
                setMovs(await KBotDB.getAll('movs'));
                setCats(await KBotDB.getAll('cats'));
                setGroups(await KBotDB.getAll('groups'));
                setCajas(await KBotDB.getAll('cajas'));
              }
            } catch (e) { console.warn(e); }
            setSyncing(false);
          }
        }} />}
      </main>
      <BottomNav active={active} setActive={handleSetActive} onAddClick={() => openCapture('INGRESO')} user={user} onLogout={handleLogout} />
      <FloatingCaptureButton onClick={() => openCapture('INGRESO')} user={user} />
      <FloatingVersionTag />
      <CaptureModal
        open={captureOpen}
        onClose={() => { setCaptureOpen(false); setEditing(null); setCaptureOpts(null); }}
        cats={cats}
        groups={groups}
        cajas={cajas}
        saldoCaja={saldoCaja}
        user={user}
        misCajas={misCajas}
        onSave={saveMov}
        initialTipo={captureTipo}
        initialCajaId={captureOpts?.cajaId || null}
        editing={editing}
        addCategory={addCategory}
      />
      {transferOpen && (
        <TransferModal
          cajas={cajas}
          saldoCaja={saldoCaja}
          onClose={() => setTransferOpen(false)}
          onTransfer={async (payload) => {
            const ok = await transferir(payload);
            if (ok) setTransferOpen(false);
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmPinModal
          titulo={pendingDelete.tipo === 'transfer' ? 'ELIMINAR TRANSFERENCIA' : 'ELIMINAR MOVIMIENTO'}
          mensaje={
            pendingDelete.tipo === 'transfer'
              ? 'Esta acción borrará ambos lados de la transferencia y afectará los saldos de las cajas. Es irreversible.'
              : 'Esta acción es irreversible. Quedará registrada en la auditoría.'
          }
          onCancel={() => setPendingDelete(null)}
          onConfirm={executeDelete}
        />
      )}
      <KBotTweaks tweaks={tweaks} setTweak={setTweaks} />
    </div>
  );
}

function TopBar({ installEvt, onInstall, movsCount, user, onLogout, syncing, cajas = [], filterCaja, setFilterCaja }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    window.addEventListener('online', u); window.addEventListener('offline', u);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); };
  }, []);
  const cajasActivas = cajas.filter(c => !c.deleted && !c.archivada);
  return (
    <div className="topbar">
      <div className="tb-left mono" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>
          <span className={'status-dot ' + (online ? 'on' : 'off')} />
          {online ? 'EN LÍNEA' : 'OFFLINE'} · {movsCount} mov.
          {syncing && <span style={{ marginLeft: 8, color: 'var(--primary)' }}>↻ SYNC…</span>}
        </span>
        {cajasActivas.length > 0 && setFilterCaja && (
          <select
            value={filterCaja || 'all'}
            onChange={e => setFilterCaja(e.target.value)}
            className="text-input compact mono"
            style={{ fontSize: 12, padding: '4px 8px', minWidth: 160 }}
            title="Filtrar movimientos por caja"
          >
            <option value="all">📊 Todas las cajas</option>
            {cajasActivas.map(c => (
              <option key={c.id} value={c.id}>{c.icon || (c.tipo === 'EFECTIVO' ? '💵' : c.tipo === 'BANCO' ? '🏦' : '💳')} {c.nombre}</option>
            ))}
          </select>
        )}
      </div>
      <div className="tb-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="install-btn"
          onClick={async () => {
            if (refreshing) return;
            setRefreshing(true);
            setJustSynced(false);
            let ok = false;
            try {
              if (window.kbotFullResync) ok = await window.kbotFullResync();
            } finally {
              setRefreshing(false);
              if (ok) {
                setJustSynced(true);
                setTimeout(() => setJustSynced(false), 2500);
              }
            }
          }}
          disabled={refreshing || !online}
          title="Traer los últimos cambios del servidor (lo que capturaron otros usuarios)"
          style={{ opacity: (refreshing || !online) ? 0.6 : 1, color: justSynced ? 'var(--green)' : undefined, borderColor: justSynced ? 'var(--green)' : undefined }}
        >
          {refreshing ? '↻ ACTUALIZANDO…' : justSynced ? '✓ ACTUALIZADO' : '↻ ACTUALIZAR'}
        </button>
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
