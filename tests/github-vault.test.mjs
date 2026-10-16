import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHub, toBase64, fromBase64 } from '../src/github.js';
import { makeVault, seal, unseal } from '../src/vault.js';
import { fixture } from './fixture.mjs';
test('native browser fetch keeps its Window receiver through login, read and write', async t => {
  // Firefox rejects Window.fetch when called as an instance method on another object.
  // The injected-transport tests did not exercise the native default transport.
  const network = fixture(), calls = [];
  t.mock.method(globalThis, 'fetch', function (url, options) {
    assert.equal(this, globalThis, 'Window.fetch must run with the browser global receiver');
    calls.push([url, options.method || 'GET']);
    if (url.endsWith('/user')) return Promise.resolve(Response.json({ id: 1, login: 'user-one' }));
    if (url.endsWith('/networking-data')) return Promise.resolve(Response.json({ private: true, permissions: { push: true } }));
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      assert.equal(body.sha, 'base-sha');
      assert.deepEqual(JSON.parse(fromBase64(body.content)), network);
      return Promise.resolve(Response.json({ content: { sha: 'saved-sha' } }));
    }
    return Promise.resolve(Response.json({ type: 'file', encoding: 'base64', content: toBase64(JSON.stringify(network)), size: 2000, sha: 'base-sha' }));
  });
  const api = new GitHub('synthetic-native-fetch-token');
  assert.equal((await api.authorize()).id, '1');
  const remote = await api.read();
  assert.equal(await api.write(remote.data, remote.sha), 'saved-sha');
  assert.equal(calls.length, 4);
});
test('Unicode GitHub payload round-trips', () => {
  const text = 'Sanità, capacità e idee 🚀\n"rete"'; assert.equal(fromBase64(toBase64(text)), text);
});
test('timeout is distinguished from an unreachable network', async () => {
  const api = new GitHub('fake', undefined, async () => { throw new DOMException('timed out', 'TimeoutError'); });
  await assert.rejects(() => api.identity(), error => error.status === 0 && /20 secondi/.test(error.message));
});
test('network error does not claim unsaved data was retained during first login', async () => {
  const api = new GitHub('fake', undefined, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(() => api.identity(), error => error.status === 0 && /contattare GitHub/.test(error.message) && !/modifiche restano/.test(error.message));
});
test('HTTP credential errors remain separate from transport failures', async () => {
  const api = new GitHub('fake', undefined, async () => new Response('{}', { status: 401 }));
  await assert.rejects(() => api.identity(), error => error.status === 401);
});
test('verified identity rejects a different token owner', async () => {
  const api = new GitHub('fake', undefined, async () => Response.json({ id: 2, login: 'other' }));
  await assert.rejects(() => api.authorize('1'), /altro account/);
});
test('refuses a public data repository', async () => {
  let step = 0; const api = new GitHub('fake', undefined, async () => Response.json(step++ ? { private: false, permissions: { push: true } } : { id: 1, login: 'one' }));
  await assert.rejects(() => api.authorize(), /privato/);
});
test('no read-only access masquerades as successful login', async () => {
  let step = 0; const api = new GitHub('fake', undefined, async () => Response.json(step++ ? { private: true, permissions: { push: false } } : { id: 1, login: 'one' }));
  await assert.rejects(() => api.authorize(), /scrittura/);
});
test('credentials go only to fixed API origin, never to URL or caches', async () => {
  let call; const api = new GitHub('fake-secret', undefined, async (...args) => { call = args; return Response.json({ id: 1, login: 'one' }); });
  await api.identity(); assert.equal(call[0], 'https://api.github.com/user'); assert.equal(call[1].cache, 'no-store'); assert.equal(call[1].credentials, 'omit'); assert.equal(call[1].redirect, 'error'); assert.equal(call[1].headers.Authorization, 'Bearer fake-secret');
});
test('remembered token and data are encrypted, correct password unlocks', async () => {
  const v = await makeVault('a-long-local-password'); const sealed = await seal({ token: 'fake-secret', local: { note: 'private' } }, v);
  assert.equal(JSON.stringify(sealed).includes('fake-secret'), false); assert.equal(JSON.stringify(sealed).includes('private'), false);
  const opened = await unseal(sealed, 'a-long-local-password'); assert.equal(opened.value.token, 'fake-secret');
  await assert.rejects(() => unseal(sealed, 'wrong-password'), /Password errata/);
});
test('tampered encrypted cache cannot be decrypted', async () => {
  const v = await makeVault('a-long-local-password'); const sealed = await seal({ secret: 'abc' }, v); sealed.data = (sealed.data[0] === 'A' ? 'B' : 'A') + sealed.data.slice(1);
  await assert.rejects(() => unseal(sealed, 'a-long-local-password'));
});
test('large encrypted cache avoids call-stack limits', async () => {
  const v = await makeVault('a-long-local-password'), text = 'à'.repeat(250000); const sealed = await seal({ text }, v);
  assert.equal((await unseal(sealed, 'a-long-local-password')).value.text, text);
});
