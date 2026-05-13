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

  async function syncMov(mov) {
    queueAdd({ method: 'POST', path: '/api/movs', body: mov });
    flushQueue();
  }
  async function deleteMov(id) {
    queueAdd({ method: 'DELETE', path: '/api/movs/' + id });
    flushQueue();
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

  window.addEventListener('online', () => flushQueue());

  return {
    enabled, token, user, login, logout,
    pull, syncMov, deleteMov, syncCat, deleteCat, updateCat, syncGroup, deleteGroup, updateGroup, reorderGroups, syncBudget, bulkMovs,
    flushQueue, queueGet
  };
})();
