// db.js — IndexedDB wrapper para K-BOTANAS
window.KBotDB = (function () {
  const DB_NAME = 'kbotanas';
  const DB_VER = 3;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('movs')) {
          const s = db.createObjectStore('movs', { keyPath: 'id' });
          s.createIndex('fecha', 'fecha');
          s.createIndex('tipo', 'tipo');
          s.createIndex('categoria', 'categoria');
        }
        if (!db.objectStoreNames.contains('cats')) {
          db.createObjectStore('cats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }

  async function tx(store, mode = 'readonly') {
    const db = await open();
    return db.transaction(store, mode).objectStore(store);
  }

  async function getAll(store) {
    const s = await tx(store);
    return new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function put(store, val) {
    const s = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = s.put(val);
      r.onsuccess = () => res(val);
      r.onerror = () => rej(r.error);
    });
  }

  async function del(store, id) {
    const s = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = s.delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }

  async function bulkPut(store, items) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    items.forEach(i => s.put(i));
    return new Promise((res, rej) => {
      t.oncomplete = () => res(items.length);
      t.onerror = () => rej(t.error);
    });
  }

  return { open, getAll, put, del, bulkPut };
})();
