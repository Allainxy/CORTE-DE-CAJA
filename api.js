// api.js — Cliente HTTP para hablar con el backend
window.KBotAPI = (function () {
  const meta = document.querySelector('meta[name="api-url"]');
  const BASE = (meta?.content || '').replace(/\/$/, '');
  const TOKEN_KEY = 'kbot_token';
  const USER_KEY = 'kbot_user';
  const SINCE_KEY = 'kbot_since';

  const enabled = () => !!BASE;
  const token = () => localStorage.getItem(TOKEN_KEY);
  const user = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };

  async function req(path, opts = {}) {
    if (!enabled()) throw new Error('API no configurada');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(BASE + path, { ...opts, headers });
    if (r.status === 401) { logout(); throw new Error('Sesión expirada'); }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const e = new Error(err.error || 'Error ' + r.status);
      e.status = r.status; // adjunta el status HTTP para clasificar errores permanentes vs transitorios en flushQueue
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

  // Cola offline de cambios
  function queueAdd(op) {
    const q = JSON.parse(localStorage.getItem('kbot_queue') || '[]');
    q.push({ ...op, ts: Date.now() });
    localStorage.setItem('kbot_queue', JSON.stringify(q));
  }
  function queueGet() { return JSON.parse(localStorage.getItem('kbot_queue') || '[]'); }
  function queueClear() { localStorage.removeItem('kbot_queue'); }

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

  async function flushQueue() {
    if (!enabled() || !token() || !navigator.onLine) return 0;
    const q = queueGet();
    if (!q.length) return 0;
    let ok = 0;
    const pendientes = []; // ítems transitorios no procesados que vuelven a la cola
    for (let i = 0; i < q.length; i++) {
      const op = q[i];
      try {
        await req(op.path, { method: op.method, body: op.body ? JSON.stringify(op.body) : undefined });
        ok++;
      } catch (e) {
        if (isPermanentError(e)) {
          // Error permanente: descartar de la cola para no atascarla. Se guarda
          // en una dead-letter para conservar el rastro, y se continúa.
          console.error('Sync: descartando op permanentemente fallida', op, e);
          try {
            const dead = JSON.parse(localStorage.getItem('kbot_queue_failed') || '[]');
            dead.push({ op, error: e.message, status: e.status, ts: Date.now() });
            localStorage.setItem('kbot_queue_failed', JSON.stringify(dead));
          } catch (_) { /* localStorage lleno/corrupto: aún así descartamos la op */ }
          continue;
        }
        // Error transitorio: este ítem y todos los siguientes quedan pendientes
        // para el próximo ciclo. Preservamos el orden FIFO.
        console.warn('Sync falló (transitorio, se reintentará)', op, e);
        for (let j = i; j < q.length; j++) pendientes.push(q[j]);
        break;
      }
    }
    if (pendientes.length) localStorage.setItem('kbot_queue', JSON.stringify(pendientes));
    else queueClear();
    return ok;
  }

  async function pull() {
    if (!enabled() || !token()) return null;
    const since = parseInt(localStorage.getItem(SINCE_KEY) || '0');
    const r = await req('/api/sync?since=' + since);
    localStorage.setItem(SINCE_KEY, String(r.serverTime));
    return r;
  }

  // pullFull: sincronización completa desde cero (since=0). Usado cuando la BD
  // local está vacía o hay que reconstruir todo el espejo offline.
  async function pullFull() {
    if (!enabled() || !token()) return null;
    const r = await req('/api/sync?since=0');
    if (r && r.serverTime != null) localStorage.setItem(SINCE_KEY, String(r.serverTime));
    return r;
  }

  async function syncMov(mov) {
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
    pull, pullFull, syncMov, deleteMov, deleteMovWithPin, deleteTransfer, transferir,
    syncCaja, updateCaja, archivarCaja, deleteCaja,
    syncCat, deleteCat, updateCat, syncGroup, deleteGroup, updateGroup,
    reorderGroups, syncBudget, bulkMovs,
    listUsers, createUser, updateUser, deleteUser, resetPassword, generatePin, setUserCajas,
    getSetting, setSetting,
    flushQueue, queueGet
  };
})();
