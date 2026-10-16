import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, validateNetwork } from '../src/model.js';
import { NetworkSync } from '../src/sync.js';
function setup() {
  let remote = fixture(), sha = 1;
  const api = {
    reads: 0, writes: 0,
    async read() { this.reads++; return { data: clone(remote), sha: String(sha) }; },
    async write(data, expected) { this.writes++; if (expected !== String(sha)) throw Object.assign(new Error('Changed'), { status: 409 }); remote = clone(data); return String(++sha); },
  };
  const sync = new NetworkSync(api, { base: remote, local: remote, sha: '1' });
  return { api, sync, get remote() { return remote; }, change(fn) { fn(remote); sha++; } };
}
test('no write when unchanged; local edit is saved with SHA', async () => {
  const x = setup(); await x.sync.sync(); assert.equal(x.api.writes, 0);
  x.sync.edit(d => { d.people.contact.role = 'Changed'; }); await x.sync.sync();
  assert.equal(x.remote.people.contact.role, 'Changed'); assert.equal(x.sync.dirty, false);
});
test('remote changes are pulled and independent local edits preserved', async () => {
  const x = setup(); x.sync.edit(d => { d.people.contact.role = 'Local'; }); x.change(d => { d.people.contact.name = 'Remote'; });
  await x.sync.sync(); assert.equal(x.remote.people.contact.name, 'Remote'); assert.equal(x.remote.people.contact.role, 'Local');
});
test('conflict prevents write until resolved', async () => {
  const x = setup(); x.sync.edit(d => { d.people.contact.role = 'Local'; }); x.change(d => { d.people.contact.role = 'Remote'; });
  await x.sync.sync(); assert.equal(x.api.writes, 0); assert.equal(x.sync.status, 'conflict');
  assert.throws(() => x.sync.edit(() => {})); x.sync.resolve(['local']); await x.sync.sync();
  assert.equal(x.remote.people.contact.role, 'Local'); assert.equal(x.sync.pending, null);
});
test('race after read retries using latest SHA without losing remote change', async () => {
  const x = setup(), write = x.api.write.bind(x.api); let raced = false;
  x.api.write = async (d, sha) => { if (!raced) { raced = true; x.change(d => { d.people.contact.name = 'Raced'; }); } return write(d, sha); };
  x.sync.edit(d => { d.people.contact.role = 'Local'; }); await x.sync.sync();
  assert.equal(x.remote.people.contact.name, 'Raced'); assert.equal(x.remote.people.contact.role, 'Local'); assert.equal(x.api.writes, 2);
});
test('in-flight local edits are not marked saved or discarded', async () => {
  const x = setup(), write = x.api.write.bind(x.api); let edited = false;
  x.api.write = async (d, sha) => { if (!edited) { edited = true; x.sync.edit(d => { d.relationships['contact:1'].note = 'During save'; }); } return write(d, sha); };
  x.sync.edit(d => { d.people.contact.role = 'Initial'; }); await x.sync.sync();
  assert.equal(x.remote.relationships['contact:1'].note, 'During save'); assert.equal(x.sync.dirty, false);
});
test('network failures preserve the complete pending local snapshot', async () => {
  const x = setup(); x.sync.edit(d => { d.people.contact.role = 'Offline'; }); x.api.read = async () => { throw new Error('offline'); };
  await x.sync.sync(); assert.equal(x.sync.status, 'error'); assert.equal(x.sync.local.people.contact.role, 'Offline'); assert.ok(x.sync.dirty);
});
test('parallel triggers share one sync operation', async () => {
  const x = setup(); const a = x.sync.sync(), b = x.sync.sync(); assert.equal(a, b); await a; assert.equal(x.api.reads, 1);
});
test('stale open form produces conflict, rather than overwrite a fresh pull', async () => {
  const x = setup(), formBase = clone(x.sync.local); x.change(d => { d.people.contact.role = 'Other device'; }); await x.sync.sync();
  x.sync.edit(d => { d.people.contact.role = 'From stale form'; }, formBase);
  assert.equal(x.sync.pending.source, 'edit'); x.sync.resolve(['remote']); assert.equal(x.sync.local.people.contact.role, 'Other device');
});
test('import is additive and same-field differences ask instead of replacing', () => {
  const x = setup(), incoming = clone(x.remote); incoming.people.newone = { ...incoming.people.contact, id: 'newone' }; incoming.people.contact.role = 'Imported';
  x.sync.import(incoming); assert.equal(x.sync.pending.source, 'import'); x.sync.resolve(['remote']);
  assert.ok(x.sync.local.people.newone); assert.equal(x.sync.local.people.contact.role, 'Imported'); validateNetwork(x.sync.local);
});
test('failed writes keep dirty data and do not advance base', async () => {
  const x = setup(); x.api.write = async () => { throw Object.assign(new Error('Denied'), { status: 403 }); };
  x.sync.edit(d => { d.people.contact.role = 'Unsaved'; }); await x.sync.sync();
  assert.ok(x.sync.dirty); assert.equal(x.sync.base.people.contact.role, 'Designer'); assert.equal(x.sync.sha, '1');
});
test('repeated SHA conflicts stop after bounded retries', async () => {
  const x = setup(); x.api.write = async () => { x.api.writes++; throw Object.assign(new Error('Busy'), { status: 409 }); };
  x.sync.edit(d => { d.people.contact.role = 'Unsaved'; }); await x.sync.sync(); assert.equal(x.api.writes, 4); assert.ok(x.sync.dirty);
});

test('pending import collisions survive an encrypted-cache snapshot round trip', () => {
  const x = setup(), incoming = clone(x.remote); incoming.people.contact.role = 'Pending import';
  x.sync.import(incoming); const state = JSON.parse(JSON.stringify(x.sync.snapshot()));
  const restored = new NetworkSync(x.api, state); assert.equal(restored.pending.source, 'import');
  restored.resolve(['remote']); assert.equal(restored.local.people.contact.role, 'Pending import');
});
