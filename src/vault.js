import { CONFIG } from './config.js';
const namespace = `networking:v1:${CONFIG.owner}/${CONFIG.repo}:`;
const bytesTo64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const from64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
const keyName = id => namespace + id;
const activeKey = namespace + 'active';
function keyRequest(mode, action) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Il browser non consente di ricordare l’accesso.')); return; }
    let blocked = false;
    const opening = indexedDB.open('tramite-device-access', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('keys');
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => { blocked = true; reject(new Error('Chiudi le altre schede di Tramite e riprova.')); };
    opening.onsuccess = () => {
      const db = opening.result;
      if (blocked) { db.close(); return; }
      try {
        const tx = db.transaction('keys', mode), request = action(tx.objectStore('keys'));
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Accesso non salvato sul dispositivo.')); };
      } catch (error) { db.close(); reject(error); }
    };
  });
}
export const deviceKeys = {
  get: id => keyRequest('readonly', store => store.get(keyName(id))),
  put: (id, key) => keyRequest('readwrite', store => store.put(key, keyName(id))),
  delete: id => keyRequest('readwrite', store => store.delete(keyName(id))),
};
export async function makeDeviceVault(id, keys = deviceKeys) {
  // IndexedDB stores a non-exportable CryptoKey, never its raw secret bytes.
  const key = await keys.get(id) || await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await keys.put(id, key);
  return { mode: 'device', id, key };
}
const cipher = (vault, iv) => ({ name: 'AES-GCM', iv, ...(vault.mode === 'device' ? { additionalData: new TextEncoder().encode(keyName(vault.id)) } : {}) });
export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function makeVault(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesTo64(salt), key: await deriveKey(password, salt) };
}
export async function seal(value, vault) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(cipher(vault, iv), vault.key, new TextEncoder().encode(JSON.stringify(value)));
  return { version: vault.mode === 'device' ? 2 : 1, ...(vault.salt ? { salt: vault.salt } : {}), iv: bytesTo64(iv), data: bytesTo64(new Uint8Array(encrypted)) };
}
export async function unseal(envelope, password) {
  if (envelope.version !== 1) throw new Error('Cache non compatibile.');
  const key = await deriveKey(password, from64(envelope.salt));
  let data;
  try { data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(envelope.iv) }, key, from64(envelope.data)); }
  catch { throw new Error('Password errata o cache danneggiata.'); }
  return { value: JSON.parse(new TextDecoder().decode(data)), vault: { salt: envelope.salt, key } };
}
export function listVaults() {
  try { return JSON.parse(localStorage.getItem(namespace + 'index') || '[]'); } catch { return []; }
}
export function activeAccount() {
  try { return localStorage.getItem(activeKey); } catch { return null; }
}
export function clearActiveAccount() { localStorage.removeItem(activeKey); }
export async function saveVault(user, value, vault) {
  if (vault.mode === 'device' && vault.id !== user.id) throw new Error('Identità del dispositivo non corrispondente.');
  // The caller serializes writes, including across asynchronous encryption operations.
  const envelope = await seal(value, vault);
  const list = listVaults().filter(x => x.id !== user.id);
  list.push({ id: user.id, login: user.login, ...(vault.mode === 'device' ? { mode: 'device' } : {}) });
  const entries = [[keyName(user.id), JSON.stringify(envelope)], [namespace + 'index', JSON.stringify(list)], ...(vault.mode === 'device' ? [[activeKey, user.id]] : [])];
  const previous = entries.map(([key]) => [key, localStorage.getItem(key)]);
  try { for (const [key, text] of entries) localStorage.setItem(key, text); }
  catch (error) {
    // A failed upgrade must leave the previous password-protected copy usable.
    for (const [key, text] of previous) { try { if (text === null) localStorage.removeItem(key); else localStorage.setItem(key, text); } catch {} }
    throw error;
  }
}
export async function openVault(id, password) {
  const raw = localStorage.getItem(keyName(id));
  if (!raw) throw new Error('Nessun accesso salvato su questo dispositivo.');
  return unseal(JSON.parse(raw), password);
}
export async function openDeviceVault(id, keys = deviceKeys) {
  const raw = localStorage.getItem(keyName(id));
  if (!raw) throw new Error('Nessun accesso salvato su questo dispositivo.');
  const envelope = JSON.parse(raw);
  if (envelope.version !== 2) throw new Error('Sblocca una volta la vecchia copia con la password locale.');
  const key = await keys.get(id);
  if (!key) throw new Error('Accesso locale non disponibile. Rimuovi l’accesso salvato e accedi di nuovo.');
  const vault = { mode: 'device', id, key };
  let decrypted;
  try { decrypted = await crypto.subtle.decrypt(cipher(vault, from64(envelope.iv)), key, from64(envelope.data)); }
  catch { throw new Error('Copia locale danneggiata. Rimuovi l’accesso salvato e accedi di nuovo.'); }
  return { value: JSON.parse(new TextDecoder().decode(decrypted)), vault };
}
export async function forgetVault(id, keys = deviceKeys) {
  const device = listVaults().find(x => x.id === id)?.mode === 'device';
  let failure;
  try {
    if (activeAccount() === id) clearActiveAccount();
    localStorage.removeItem(keyName(id));
    localStorage.setItem(namespace + 'index', JSON.stringify(listVaults().filter(x => x.id !== id)));
  } catch (error) { failure = error; }
  // Even if browser storage becomes unavailable, remove the key when possible.
  try { await keys.delete(id); } catch (error) { if (device) failure ||= error; }
  if (failure) throw failure;
}
