import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { makeVault, makeDeviceVault, saveVault, openVault, openDeviceVault, listVaults, activeAccount, forgetVault } from '../src/vault.js';

const prefix = `networking:v1:${CONFIG.owner}/${CONFIG.repo}:`;
const user = id => ({ id, login: `user-${id}` });
function setup() {
  const storage = new Map(), keys = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  // IndexedDB uses structured clone, including for non-exportable CryptoKeys.
  const keyStore = { get: async id => keys.has(id) ? structuredClone(keys.get(id)) : undefined, put: async (id, value) => keys.set(id, structuredClone(value)), delete: async id => keys.delete(id) };
  return { storage, keys, keyStore };
}
test('a device session reopens without a password and keeps token and data encrypted', async () => {
  const { storage, keyStore } = setup();
  const vault = await makeDeviceVault('1', keyStore);
  await assert.rejects(() => crypto.subtle.exportKey('raw', vault.key));
  const state = { user: user('1'), token: 'synthetic-device-secret', local: { note: 'Una nota privata' } };
  await saveVault(user('1'), state, vault);
  assert.equal(activeAccount(), '1');
  assert.equal([...storage.values()].join('').includes(state.token), false);
  assert.equal([...storage.values()].join('').includes(state.local.note), false);
  assert.deepEqual((await openDeviceVault('1', keyStore)).value, state);
  assert.equal((await openDeviceVault('1', keyStore)).vault.key.extractable, false);
});
test('device keys and encrypted copies stay separate for each stable identity', async () => {
  const { storage, keyStore } = setup();
  for (const id of ['1', '2']) await saveVault(user(id), { user: user(id), token: `synthetic-${id}` }, await makeDeviceVault(id, keyStore));
  assert.equal((await openDeviceVault('1', keyStore)).value.user.id, '1');
  assert.equal((await openDeviceVault('2', keyStore)).value.user.id, '2');
  const original = storage.get(prefix + '2');
  storage.set(prefix + '2', storage.get(prefix + '1'));
  await assert.rejects(() => openDeviceVault('2', keyStore), /danneggiata/);
  storage.set(prefix + '2', original);
  await assert.rejects(async () => saveVault(user('2'), {}, await makeDeviceVault('1', keyStore)), /Identità/);
});
test('an old password copy upgrades with all unsynced data and conflicts intact', async () => {
  const { keyStore } = setup(), state = { user: user('1'), token: 'synthetic-old-secret', sha: 'old-sha', local: { changed: true }, base: { changed: false }, pending: { conflicts: ['keep both'] } };
  await saveVault(user('1'), state, await makeVault('existing-local-password'));
  assert.equal(activeAccount(), null);
  const old = await openVault('1', 'existing-local-password');
  await saveVault(user('1'), old.value, await makeDeviceVault('1', keyStore));
  assert.deepEqual((await openDeviceVault('1', keyStore)).value, state);
  assert.equal(listVaults()[0].mode, 'device');
});
test('a failed upgrade preserves the old copy and never enables automatic access', async () => {
  const { storage, keyStore } = setup(), state = { token: 'synthetic-old', local: { unsynced: true } };
  await saveVault(user('1'), state, await makeVault('existing-local-password'));
  const before = new Map(storage), originalSet = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === prefix + 'active') throw new Error('Storage full'); originalSet(key, value); };
  await assert.rejects(async () => saveVault(user('1'), state, await makeDeviceVault('1', keyStore)), /Storage full/);
  assert.deepEqual(storage, before);
  assert.deepEqual((await openVault('1', 'existing-local-password')).value, state);
});
test('logout removes the saved session and key while preserving another account', async () => {
  const { keyStore, keys } = setup();
  for (const id of ['2', '1']) await saveVault(user(id), { token: `synthetic-${id}` }, await makeDeviceVault(id, keyStore));
  await forgetVault('1', keyStore);
  assert.equal(activeAccount(), null);
  assert.equal(keys.has('1'), false);
  assert.deepEqual(listVaults().map(a => a.id), ['2']);
  await assert.rejects(() => openDeviceVault('1', keyStore), /Nessun accesso/);
  assert.equal((await openDeviceVault('2', keyStore)).value.token, 'synthetic-2');
});
test('a missing device key never causes a silent overwrite of pending data', async () => {
  const { storage, keys, keyStore } = setup();
  await saveVault(user('1'), { local: { unsynced: true } }, await makeDeviceVault('1', keyStore));
  const before = new Map(storage); keys.clear();
  await assert.rejects(() => openDeviceVault('1', keyStore), /Accesso locale non disponibile/);
  assert.deepEqual(storage, before);
});
test('logout still removes the key if localStorage stops accepting removals', async () => {
  const { keys, keyStore } = setup();
  await saveVault(user('1'), { token: 'synthetic-secret' }, await makeDeviceVault('1', keyStore));
  localStorage.removeItem = () => { throw new Error('Browser storage blocked'); };
  await assert.rejects(() => forgetVault('1', keyStore), /Browser storage blocked/);
  assert.equal(keys.has('1'), false);
  await assert.rejects(() => openDeviceVault('1', keyStore), /Accesso locale non disponibile/);
});
