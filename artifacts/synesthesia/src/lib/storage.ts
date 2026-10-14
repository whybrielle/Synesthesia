import type { Creation } from './music';

const DB = 'synesthesia-local-library';
const STORE = 'creations';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Local library storage is unavailable in this browser.'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open your local library.'));
  });
}
export async function allCreations(): Promise<Creation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as Creation[]).sort((a, b) => b.date - a.date));
    req.onerror = () => reject(req.error);
  });
}
export async function getCreation(id: string): Promise<Creation | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Creation | undefined);
    req.onerror = () => reject(req.error);
  });
}
export async function saveCreation(value: Creation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error?.name === 'QuotaExceededError'
      ? new Error('Your browser storage is full. Delete a few memories and try again.')
      : req.error || new Error('Could not save this memory locally.'));
  });
}
export async function deleteCreation(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
  });
}
