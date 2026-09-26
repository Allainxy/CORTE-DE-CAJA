// api.js — Cliente HTTP para hablar con el backend
window.KBotAPI = (function () {
  const meta = document.querySelector('meta[name="api-url"]');
  const BASE = (meta?.content || '').replace(/\/$/, '');
  const TOKEN_KEY = 'kbot_token';
  const USER_KEY = 'kbot_user';
  const SINCE_KEY = 'kbot_since';
  // Epoch de datos del servidor (cambia con cada restauración de la BD completa)
  const EPOCH_KEY = 'kbot_db_epoch';
  const RESET_KEY = 'kbot_reset_pending';   // epoch nuevo pendiente de reconstruir la copia local
  const REVIEW_KEY = 'kbot_queue_review';   // cambios offline de antes de una restauración (no se reenvían solos)
  const NOTICE_KEY = 'kbot_restore_notice';

  // Todas las llamadas a la API (req y los fetch directos de las vistas) llevan el epoch de
  // la copia local. El servidor rechaza con 409 DB_EPOCH_STALE las escrituras hechas con una
  // copia de antes de una restauración; aquí se detecta y la app reconstruye sus datos.
  // Epoch de los datos que ESTA pestaña tiene en memoria. localStorage lo comparten todas las
  // pestañas: si otra reconstruye y guarda el epoch nuevo, esta sigue con datos viejos y no debe
  // escribir como si fueran nuevos (el servidor la rechazará y se reconstruirá también).
  let tabEpoch = localStorage.getItem(EPOCH_KEY);
  const nativeFetch = window.fetch.bind(window);
  const isApiUrl = (u) => typeof u === 'string' && (u.startsWith('/api/') || (!!BASE && u.startsWith(BASE + '/api/')));
  window.fetch = function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (_) { /* ignore */ }
    if (!isApiUrl(url)) return nativeFetch(input, init);
    let opts = init;
    if (tabEpoch) {
      const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || undefined);
      headers.set('X-DB-Epoch', tabEpoch);
      opts = { ...(init || {}), headers };
    }
    return nativeFetch(input, opts).then((resp) => {
      if (resp.status === 409 || resp.status === 503) {
        resp.clone().json().then((b) => { if (b && b.code === 'DB_EPOCH_STALE') markStale(b.epoch); }).catch(() => {});
      }
      return resp;
    });
  };
  // Otra pestaña reconstruyó con el epoch nuevo: esta recarga para no seguir con datos viejos
  window.addEventListener('storage', (e) => {
    if (e.key === EPOCH_KEY && e.newValue && e.newValue !== tabEpoch) notifyRestored();
  });

  const enabled = () => !!BASE;
  const token = () => localStorage.getItem(TOKEN_KEY);
  const user = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
  // Offset de reloj vs servidor (se recalibra en cada sync). logicalNow() da un
  // timestamp normalizado al reloj del server para sellar movs (last-write-wins).
  let clockOffset = parseInt(localStorage.getItem('kbot_clock_offset') || '0', 10) || 0;
  function logicalNow() { return Date.now() + clockOffset; }

  async function req(path, opts = {}) {
    if (!enabled()) throw new Error('API no configurada');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(BASE + path, { ...opts, headers });
    if (r.status === 401) { logout(); if (typeof window !== 'undefined') window.dispatchEvent(new Event('kbot-session-expired')); throw new Error('Sesión expirada'); }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const e = new Error(err.error || 'Error ' + r.status);
      e.status = r.status; // adjunta el status HTTP para clasificar errores permanentes vs transitorios en flushQueue
      e.code = err.code;   // p.ej. DB_EPOCH_STALE
      e.epoch = err.epoch;
      throw e;
    }
    return r.json();
  }

  async function login(username, password) {
    const r = await req('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    return r.user;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SINCE_KEY);
  }

  // Cola offline de cambios. Cada op lleva un id (qid) para quitar de la cola solo lo que
  // se procesó, y el epoch de la copia local con la que se hizo.
  const newQid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function queueSet(q) {
    if (q.length) localStorage.setItem('kbot_queue', JSON.stringify(q));
    else localStorage.removeItem('kbot_queue');
  }
  function queueAdd(op) {
    const q = queueGet();
    q.push({ ...op, ts: Date.now(), qid: newQid(), epoch: tabEpoch || null });
    queueSet(q);
  }
  function queueGet() {
    const q = JSON.parse(localStorage.getItem('kbot_queue') || '[]');
    if (q.some(op => !op.qid)) { q.forEach(op => { if (!op.qid) op.qid = newQid(); }); queueSet(q); } // ops de versiones anteriores
    return q;
  }

  // ── Restauración de la BD del servidor (epoch) ──────────────────────────────
  const resetPending = () => !!localStorage.getItem(RESET_KEY);
  function notifyRestored() { window.dispatchEvent(new Event('kbot-db-restored')); }
  function markStale(serverEpoch) {
    // Pestaña que aún no conoce el epoch (navegador nuevo): consultarlo; se adopta sin reconstruir
    // si no hay copia local
    if (!tabEpoch) { ensureEpoch().then((r) => { if (r.changed) notifyRestored(); }).catch(() => {}); return; }
    if (serverEpoch) localStorage.setItem(RESET_KEY, serverEpoch);
    notifyRestored();
  }
  // Compara el epoch del servidor con el de la copia local. Una sola consulta en vuelo por
  // pestaña. Lanza si no se puede consultar (quien llama no debe enviar la cola: falla cerrado).
  let epochInflight = null;
  async function hayCopiaLocal() {
    if (queueGet().length) return true;
    if (!window.KBotDB) return false;
    for (const s of ['movs', 'cajas', 'cats']) { if ((await window.KBotDB.getAll(s)).length) return true; }
    return false;
  }
  function adoptEpoch(epoch) {
    localStorage.setItem(EPOCH_KEY, epoch);
    tabEpoch = epoch;
    return { changed: false, epoch };
  }
  function ensureEpoch() {
    if (epochInflight) return epochInflight;
    epochInflight = (async () => {
      let r;
      try { r = await req('/api/epoch'); }
      catch (e) {
        // Servidor sin la ruta (código anterior, p.ej. tras revertir un deploy): no puede
        // rechazar por epoch, así que la cola se envía como antes. Red/5xx: falla cerrado.
        if (e.status === 404) return { changed: false, epoch: tabEpoch, at: null, legacy: true };
        throw e;
      }
      if (!r || typeof r.epoch !== 'string' || !r.epoch) throw new Error('Epoch del servidor inválido');
      const at = r.epoch_at || null;
      if (tabEpoch && tabEpoch === r.epoch) return { changed: false, epoch: r.epoch, at };
      // Sin epoch local: si nunca hubo restauración, o si este dispositivo no tiene copia local
      // (navegador nuevo), se adopta sin reconstruir ni avisar
      if (!tabEpoch && (!at || !(await hayCopiaLocal()))) return { ...adoptEpoch(r.epoch), at };
      // Epoch distinto, o copia local sin epoch cuando el servidor ya fue restaurado
      localStorage.setItem(RESET_KEY, r.epoch);
      return { changed: true, epoch: r.epoch, at };
    })().finally(() => { epochInflight = null; });
    return epochInflight;
  }
  // Reconstrucción local tras una restauración (idempotente: si se interrumpe, RESET_KEY
  // sigue y se repite en el siguiente arranque). No reenvía nada: los cambios offline
  // hechos con la copia vieja pasan a revisión.
  async function performReset() {
    const nuevo = localStorage.getItem(RESET_KEY);
    if (!nuevo) return false;
    const q = queueGet();
    const fuera = q.filter(op => op.epoch !== nuevo);
    if (fuera.length) moveToReview(fuera, 'db-restaurada');
    queueSet(q.filter(op => op.epoch === nuevo));
    if (window.KBotDB && window.KBotDB.clearAll) await window.KBotDB.clearAll();
    localStorage.setItem(SINCE_KEY, '0');
    adoptEpoch(nuevo);
    localStorage.setItem(NOTICE_KEY, JSON.stringify({ at: Date.now(), revision: fuera.length }));
    localStorage.removeItem(RESET_KEY);
    window.dispatchEvent(new Event('kbot-review-changed')); // el aviso ya montado se actualiza
    return true;
  }
  function reviewGet() { try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch (_) { return []; } }
  function reviewSet(list) {
    if (list.length) localStorage.setItem(REVIEW_KEY, JSON.stringify(list));
    else localStorage.removeItem(REVIEW_KEY);
    window.dispatchEvent(new Event('kbot-review-changed'));
  }
  function moveToReview(ops, reason) {
    const list = reviewGet();
    const ya = new Set(list.map(o => o.qid));
    ops.forEach(op => { if (!ya.has(op.qid)) list.push({ ...op, review_reason: reason, review_at: Date.now() }); });
    reviewSet(list);
  }
  // Reenviar: vuelve a la cola sellado con el epoch vigente (y un updated_at nuevo para que
  // el alta/edición gane el last-write-wins frente a lo restaurado).
  function reviewResend(qids) {
    const ids = new Set(qids);
    const list = reviewGet();
    const ep = tabEpoch || null;
    const q = queueGet();
    list.filter(o => ids.has(o.qid)).forEach(o => {
      const { review_reason, review_at, ...op } = o;
      const body = op.body && op.path === '/api/movs' ? { ...op.body, updated_at: logicalNow() } : op.body;
      q.push({ ...op, body, epoch: ep, ts: Date.now() });
    });
    queueSet(q);
    reviewSet(list.filter(o => !ids.has(o.qid)));
  }
  function reviewDiscard(qids) {
    const ids = new Set(qids);
    reviewSet(reviewGet().filter(o => !ids.has(o.qid)));
  }

  // Clasifica un error como PERMANENTE (no tiene sentido reintentar: 4xx de
  // cliente) vs TRANSITORIO (red caída sin status, 5xx, o 408/429). El 401 no
  // llega aquí porque req() ya hace logout y lo trata aparte.
  function isPermanentError(e) {
    const s = e && e.status;
    if (typeof s !== 'number') return false;        // fallo de red (fetch lanzó) → transitorio
    if (s < 400 || s >= 500) return false;          // 5xx → transitorio
    if (s === 401 || s === 408 || s === 429) return false; // 401 lo maneja req(); 408/429 son transitorios
    return true;                                    // resto de 4xx (p.ej. 400, 409) → permanente
  }

  // Un solo envío de la cola a la vez por pestaña (arranque, auto-sync, evento 'online',
  // syncMov…): así nadie reescribe la cola a medio envío.
  // Si alguien pide enviar mientras hay un envío en vuelo (p.ej. otra captura), se repite al
  // terminar para no dejarla esperando al siguiente disparador.
  let flushInflight = null;
  let flushAgain = false;
  function flushQueue() {
    if (flushInflight) { flushAgain = true; return flushInflight; }
    flushInflight = (async () => {
      let n = 0;
      do { flushAgain = false; n += await doFlushQueue(); } while (flushAgain && !resetPending());
      return n;
    })().finally(() => { flushInflight = null; });
    return flushInflight;
  }

  async function doFlushQueue() {
    if (!enabled() || !token() || !navigator.onLine) return 0;
    if (resetPending()) { notifyRestored(); return 0; } // primero reconstruir la copia local
    // El epoch se verifica en CADA sincronización (arranque, auto-sync de 30 s, ↻), haya cola
    // o no: así un dispositivo que solo consulta también detecta una restauración. Sin epoch
    // confirmado no se envía nada (la cola de una copia vieja no debe revivir datos).
    let ep;
    try { ep = await ensureEpoch(); } catch (e) { return 0; }
    if (ep.changed) { notifyRestored(); return 0; }
    const q = queueGet();
    if (!q.length) return 0;
    const hechos = new Set(); // qids enviados o descartados (se quitan de la cola al final)
    let ok = 0;
    for (let i = 0; i < q.length; i++) {
      const op = q[i];
      // Hecha con otra copia de los datos, o sin epoch (versión anterior de la app) cuando el
      // servidor ya fue restaurado alguna vez: no se envía sola, pasa a revisión
      const otraCopia = op.epoch ? (!ep.legacy && op.epoch !== ep.epoch) : !!ep.at;
      if (otraCopia) { moveToReview([op], op.epoch ? 'epoch-distinto' : 'sin-epoch'); hechos.add(op.qid); continue; }
      try {
        await req(op.path, { method: op.method, body: op.body ? JSON.stringify(op.body) : undefined });
        ok++;
        hechos.add(op.qid);
      } catch (e) {
        if (e.code === 'DB_EPOCH_STALE') { markStale(e.epoch); break; } // la BD se restauró durante el envío
        if (isPermanentError(e)) {
          // Error permanente: descartar de la cola para no atascarla. Se guarda
          // en una dead-letter para conservar el rastro, y se continúa.
          console.error('Sync: descartando op permanentemente fallida', op, e);
          try {
            const dead = JSON.parse(localStorage.getItem('kbot_queue_failed') || '[]');
            dead.push({ op, error: e.message, status: e.status, ts: Date.now() });
            localStorage.setItem('kbot_queue_failed', JSON.stringify(dead));
          } catch (_) { /* localStorage lleno/corrupto: aún así descartamos la op */ }
          hechos.add(op.qid);
          continue;
        }
        // Error transitorio: este ítem y todos los siguientes quedan pendientes
        // para el próximo ciclo. Preservamos el orden FIFO.
        console.warn('Sync falló (transitorio, se reintentará)', op, e);
        break;
      }
    }
    // Quitar solo lo procesado: lo que se encoló durante el envío se conserva
    if (hechos.size) queueSet(queueGet().filter(op => !hechos.has(op.qid)));
    return ok;
  }

  async function pull() {
    if (!enabled() || !token()) return null;
    const since = parseInt(localStorage.getItem(SINCE_KEY) || '0');
    const r = await req('/api/sync?since=' + since);
    if (r && r.serverTime != null) { clockOffset = r.serverTime - Date.now(); localStorage.setItem('kbot_clock_offset', String(clockOffset)); }
    localStorage.setItem(SINCE_KEY, String(r.serverTime));
    return r;
  }

  // pullFull: sincronización completa desde cero (since=0). Usado cuando la BD
  // local está vacía o hay que reconstruir todo el espejo offline.
  async function pullFull() {
    if (!enabled() || !token()) return null;
    const r = await req('/api/sync?since=0');
    if (r && r.serverTime != null) { clockOffset = r.serverTime - Date.now(); localStorage.setItem('kbot_clock_offset', String(clockOffset)); localStorage.setItem(SINCE_KEY, String(r.serverTime)); }
    return r;
  }

  async function syncMov(mov) {
    if (mov.updated_at == null) mov.updated_at = logicalNow();
    queueAdd({ method: 'POST', path: '/api/movs', body: mov });
    flushQueue();
  }
  async function deleteMov(id) {
    queueAdd({ method: 'DELETE', path: '/api/movs/' + id });
    flushQueue();
  }
  // deleteMovWithPin: borrado online inmediato con PIN (no usa cola). Devuelve
  // la respuesta del servidor; el frontend tolera 404 ("ya borrado").
  async function deleteMovWithPin(id, pin) {
    try {
      return await req('/api/movs/' + id, { method: 'DELETE', body: JSON.stringify({ pin }) });
    } catch (e) {
      if (e.status === 404) return { alreadyGone: true };
      throw e;
    }
  }
  // deleteTransfer: borra ambos lados de una transferencia con PIN (online).
  async function deleteTransfer(tid, pin) {
    return req('/api/transferencia/' + tid, { method: 'DELETE', body: JSON.stringify({ pin }) });
  }
  // transferir: crea una transferencia entre cajas (2 movimientos vinculados). Online directo.
  async function transferir(body) {
    return req('/api/transferencia', { method: 'POST', body: JSON.stringify(body) }); // → { ok, transfer_id, idGasto, idIngreso }
  }
  // ── Gestión de cajas (admin, online directo) — endpoints /api/cajas ─────────
  async function syncCaja(caja) {
    return req('/api/cajas', { method: 'POST', body: JSON.stringify(caja) });      // crear
  }
  async function updateCaja(caja) {
    return req('/api/cajas/' + caja.id, { method: 'PUT', body: JSON.stringify(caja) }); // editar
  }
  async function archivarCaja(id, archivada) {
    const accion = archivada ? 'archivar' : 'desarchivar';
    return req('/api/cajas/' + id + '/' + accion, { method: 'POST' });
  }
  async function deleteCaja(id) {
    return req('/api/cajas/' + id, { method: 'DELETE' });
  }
  async function syncCat(cat) {
    queueAdd({ method: 'POST', path: '/api/cats', body: cat });
    flushQueue();
  }
  async function deleteCat(id) {
    queueAdd({ method: 'DELETE', path: '/api/cats/' + id });
    flushQueue();
  }
  async function syncGroup(grp) {
    queueAdd({ method: 'POST', path: '/api/groups', body: grp });
    flushQueue();
  }
  async function deleteGroup(id) {
    queueAdd({ method: 'DELETE', path: '/api/groups/' + id });
    flushQueue();
  }
  async function updateGroup(grp) {
    queueAdd({ method: 'PUT', path: '/api/groups/' + grp.id, body: grp });
    flushQueue();
  }
  async function reorderGroups(items) {
    queueAdd({ method: 'POST', path: '/api/groups/reorder', body: { items } });
    flushQueue();
  }
  async function updateCat(cat) {
    queueAdd({ method: 'PUT', path: '/api/cats/' + cat.id, body: cat });
    flushQueue();
  }
  async function syncBudget(id, monto) {
    queueAdd({ method: 'POST', path: '/api/budgets', body: { id, monto } });
    flushQueue();
  }
  async function bulkMovs(items) {
    queueAdd({ method: 'POST', path: '/api/movs/bulk', body: { items } });
    flushQueue();
  }

  // ── Gestión de usuarios (admin) — endpoints /api/users del backend ──────────
  // Operaciones online directas (no usan la cola offline). users-view.jsx las usa.
  function listUsers() {
    return req('/api/users');                                   // → { users: [...] }
  }
  function createUser(u) {
    return req('/api/users', { method: 'POST', body: JSON.stringify(u) }); // → { ok, id }
  }
  function updateUser(id, patch) {
    return req('/api/users/' + id, { method: 'PUT', body: JSON.stringify(patch) }); // → { ok }
  }
  function deleteUser(id) {
    return req('/api/users/' + id, { method: 'DELETE' });       // → { ok }
  }
  function resetPassword(id, password) {
    return req('/api/users/' + id + '/password', { method: 'POST', body: JSON.stringify({ password }) }); // → { ok }
  }
  function generatePin(id, pin) {
    return req('/api/users/' + id + '/pin', { method: 'POST', body: JSON.stringify(pin ? { pin } : {}) }); // → { ok, pin }
  }
  function setUserCajas(id, cajas) {
    return req('/api/users/' + id + '/cajas', { method: 'PUT', body: JSON.stringify({ cajas }) }); // → { ok }
  }

  // ── Ajustes globales (app_settings) — usado por el Reporte Financiero ───────
  function getSetting(key) {
    return req('/api/settings/' + encodeURIComponent(key));   // → { key, value, updated_at }
  }
  function setSetting(key, value) {                            // → { ok, key, updated_at }
    return req('/api/settings/' + encodeURIComponent(key), { method: 'PUT', body: JSON.stringify({ value }) });
  }

  window.addEventListener('online', () => flushQueue());

  return {
    enabled, token, user, login, logout,
    pull, pullFull, logicalNow, syncMov, deleteMov, deleteMovWithPin, deleteTransfer, transferir,
    syncCaja, updateCaja, archivarCaja, deleteCaja,
    syncCat, deleteCat, updateCat, syncGroup, deleteGroup, updateGroup,
    reorderGroups, syncBudget, bulkMovs,
    listUsers, createUser, updateUser, deleteUser, resetPassword, generatePin, setUserCajas,
    getSetting, setSetting,
    flushQueue, queueGet,
    ensureEpoch, resetPending, performReset, reviewGet, reviewResend, reviewDiscard
  };
})();
