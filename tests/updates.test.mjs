import test from 'node:test';
import assert from 'node:assert/strict';
import { newerVersion, watchUpdates } from '../src/updates.js';

test('version comparison ignores old, equal and malformed releases', () => {
  for (const [a, b] of [['1.9.0', '1.8.0'], ['1.10.0', '1.9.0'], ['2.0.0', '1.99.99']]) assert.ok(newerVersion(a, b));
  for (const a of ['1.8.0', '1.7.9', '0.99.99', 'bad', null, '1.8.1<script>']) assert.equal(newerVersion(a, '1.8.0'), false);
});
test('an update is announced without reloading; explicit apply activates the waiting worker', async () => {
  const doc = new EventTarget(), win = new EventTarget(), sw = new EventTarget(), registration = new EventTarget();
  doc.baseURI = 'https://example.test/networking/'; doc.visibilityState = 'visible';
  let reloads = 0, announced = 0, fetches = 0, posted;
  win.location = { reload: () => reloads++ };
  registration.waiting = { postMessage: value => { posted = value; sw.dispatchEvent(new Event('controllerchange')); } };
  registration.update = async () => {};
  sw.register = async (path, options) => { assert.equal(options.updateViaCache, 'none'); return registration; };
  const watcher = watchUpdates({ version: '1.8.0', onUpdate: () => announced++, document: doc, window: win, navigator: { serviceWorker: sw }, fetch: async (url, options) => { fetches++; assert.equal(url, 'https://example.test/networking/version.json'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); return Response.json({ version: '1.9.0' }); } });
  try {
    await watcher.check(); assert.equal(fetches, 1); assert.ok(announced); assert.equal(reloads, 0);
    await watcher.apply(); assert.deepEqual(posted, { type: 'SKIP_WAITING' }); assert.equal(reloads, 1);
  } finally { watcher.stop(); }
});
test('offline checking fails quietly without triggering an update or reload', async () => {
  const doc = new EventTarget(), win = new EventTarget(); doc.baseURI = 'https://example.test/';
  const watcher = watchUpdates({ version: 'dev', onUpdate: () => assert.fail(), document: doc, window: win, navigator: {}, fetch: async () => { throw new TypeError('offline'); } });
  try { assert.equal(await watcher.check(), null); } finally { watcher.stop(); }
});
