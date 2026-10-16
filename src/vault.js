import { CONFIG } from './config.js';
const namespace = `networking:v1:${CONFIG.owner}/${CONFIG.repo}:`;
const bytesTo64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const from64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
const keyName = id => namespace + id;
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
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.key, new TextEncoder().encode(JSON.stringify(value)));
  return { version: 1, salt: vault.salt, iv: bytesTo64(iv), data: bytesTo64(new Uint8Array(encrypted)) };
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
export async function saveVault(user, value, vault) {
  // The caller serializes writes, including across asynchronous encryption operations.
  const envelope = await seal(value, vault);
  localStorage.setItem(keyName(user.id), JSON.stringify(envelope));
  const list = listVaults().filter(x => x.id !== user.id);
  list.push({ id: user.id, login: user.login });
  localStorage.setItem(namespace + 'index', JSON.stringify(list));
}
export async function openVault(id, password) {
  const raw = localStorage.getItem(keyName(id));
  if (!raw) throw new Error('Nessun accesso salvato su questo dispositivo.');
  return unseal(JSON.parse(raw), password);
}
export function forgetVault(id) {
  localStorage.removeItem(keyName(id));
  localStorage.setItem(namespace + 'index', JSON.stringify(listVaults().filter(x => x.id !== id)));
}
