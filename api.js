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
      throw new Error(err.error || 'Error ' + r.status);
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

  async function flushQueue() {
    if (!enabled() || !token() || !navigator.onLine) return 0;
    const q = queueGet();
    if (!q.length) return 0;
    let ok = 0;
    for (const op of q) {
      try {
        await req(op.path, { method: op.method, body: op.body ? JSON.stringify(op.body) : undefined });
        ok++;
      } catch (e) { console.warn('Sync falló', op, e); break; }
    }
    if (ok === q.length) queueClear();
    else localStorage.setItem('kbot_queue', JSON.stringify(q.slice(ok)));
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
    return req('/api/movs/' + id, { method: 'DELETE', body: JSON.stringify({ pin }) });
  }
  // deleteTransfer: borra ambos lados de una transferencia con PIN (online).
  async function deleteTransfer(tid, pin) {
    return req('/api/transferencia/' + tid, { method: 'DELETE', body: JSON.stringify({ pin }) });
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

  window.addEventListener('online', () => flushQueue());

  return {
    enabled, token, user, login, logout,
    pull, pullFull, syncMov, deleteMov, deleteMovWithPin, deleteTransfer,
    syncCat, deleteCat, updateCat, syncGroup, deleteGroup, updateGroup,
    reorderGroups, syncBudget, bulkMovs,
    listUsers, createUser, updateUser, deleteUser, resetPassword, generatePin, setUserCajas,
    flushQueue, queueGet
  };
})();
