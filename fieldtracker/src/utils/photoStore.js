// ─── IndexedDB photo store ────────────────────────────────────────────────────
// Photos are large (base64). Keeping them in localStorage blows the ~5MB quota
// after a handful of images. Instead we store each photo blob in IndexedDB and
// keep only a short photo ID inside the job/message objects in localStorage.
//
// Public API (all async, all safe to call even if IDB is unavailable):
//   putPhoto(id, { data, mime })   -> stores, returns id
//   getPhoto(id)                   -> { data, mime } | null
//   getPhotoURL(id)                -> object URL string | null   (for <img src>)
//   deletePhoto(id)               -> void
//   deletePhotos([ids])           -> void
//   estimateUsage()               -> { usageMB, quotaMB, pct } | null

const DB_NAME = 'field_tracker_media';
const STORE   = 'photos';
const VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(mode) {
  return openDB().then(db => {
    const t = db.transaction(STORE, mode);
    return { store: t.objectStore(STORE), done: new Promise((res, rej) => {
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }) };
  });
}

// Simple unique id for a photo record.
let _seq = 0;
export function newPhotoId() {
  _seq = (_seq + 1) % 100000;
  return `ph_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export async function putPhoto(id, record) {
  try {
    const { store, done } = await tx('readwrite');
    store.put({ data: record.data, mime: record.mime, category: record.category || 'other', caption: record.caption || '' }, id);
    await done;
    return id;
  } catch { return null; }
}

// Update just the category/caption of an existing photo without rewriting the blob.
export async function setPhotoMeta(id, meta) {
  try {
    const rec = await getPhoto(id);
    if (!rec) return false;
    const { store, done } = await tx('readwrite');
    store.put({ ...rec, ...meta }, id);
    await done;
    return true;
  } catch { return false; }
}

export async function getPhoto(id) {
  try {
    const { store } = await tx('readonly');
    return await new Promise((res) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror   = () => res(null);
    });
  } catch { return null; }
}

// Cache object URLs so we don't rebuild them on every render.
const _urlCache = new Map();

export async function getPhotoURL(id) {
  if (!id) return null;
  if (_urlCache.has(id)) return _urlCache.get(id);
  const rec = await getPhoto(id);
  if (!rec) return null;
  try {
    const byteStr = atob(rec.data);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: rec.mime || 'image/jpeg' }));
    _urlCache.set(id, url);
    return url;
  } catch { return null; }
}

export async function deletePhoto(id) {
  if (_urlCache.has(id)) { try { URL.revokeObjectURL(_urlCache.get(id)); } catch {} _urlCache.delete(id); }
  try {
    const { store, done } = await tx('readwrite');
    store.delete(id);
    await done;
  } catch {}
}

export async function deletePhotos(ids = []) {
  for (const id of ids) await deletePhoto(id);
}

// Storage estimate via the Storage Manager API (covers IDB + caches + LS).
export async function estimateUsage() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usageMB = usage / 1048576;
    const quotaMB = quota / 1048576;
    return {
      usageMB: usageMB.toFixed(1),
      quotaMB: quotaMB.toFixed(0),
      pct: quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0,
    };
  } catch { return null; }
}

// Collect every photo id referenced by a set of jobs (for orphan cleanup).
export function collectPhotoIds(jobs) {
  const ids = new Set();
  for (const j of jobs || []) {
    for (const m of j.messages || []) {
      for (const pid of m._photoIds || []) ids.add(pid);
    }
  }
  return ids;
}

// Remove IDB photos not referenced by any job (e.g. after deletes).
export async function pruneOrphans(jobs) {
  try {
    const keep = collectPhotoIds(jobs);
    const { store } = await tx('readonly');
    const allKeys = await new Promise((res) => {
      const r = store.getAllKeys();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => res([]);
    });
    const orphans = allKeys.filter(k => !keep.has(k));
    if (orphans.length) await deletePhotos(orphans);
    return orphans.length;
  } catch { return 0; }
}
