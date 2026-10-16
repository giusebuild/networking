import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, deletePerson, validateNetwork, mergeNetworks, resolveConflicts, findPeople, exportCSV, ensureMember } from '../src/model.js';
import { NetworkSync } from '../src/sync.js';

function assertDeleted(data) {
  validateNetwork(data);
  assert.equal(data.people.contact, null);
  for (const table of ['relationships', 'contributions']) {
    assert.ok(Object.entries(data[table]).filter(([key]) => key.startsWith('contact:')).every(([, value]) => value === null));
  }
  assert.equal(findPeople(data, '1', { search: 'Persona esempio' }).length, 0);
  assert.equal(exportCSV(data).includes('Persona esempio'), false);
}
test('deleting a contact removes every author’s contribution, relationship and note', () => {
  const d = fixture(); deletePerson(d, 'contact'); assertDeleted(d);
  assert.equal(d.members['1'].name, 'Uno'); assert.equal(d.people['github-2'].name, 'Due');
});
test('participant profiles cannot be deleted and missing contact is a no-op', () => {
  const d = fixture(), original = clone(d);
  assert.throws(() => deletePerson(d, 'github-1'), /partecipanti/);
  deletePerson(d, 'missing'); assert.deepEqual(d, original);
});
for (const deletingSide of ['local', 'remote']) {
  test(`${deletingSide} deletion propagates to a stale unchanged device`, () => {
    const base = fixture(), local = clone(base), remote = clone(base);
    deletePerson(deletingSide === 'local' ? local : remote, 'contact');
    const result = mergeNetworks(base, local, remote);
    assert.equal(result.conflicts.length, 0); assertDeleted(result.data);
  });
  for (const change of ['name', 'contribution', 'relationship', 'new-knower']) {
    test(`${deletingSide} deletion versus concurrent ${change} is one complete-person conflict`, () => {
      const base = fixture(), local = clone(base), remote = clone(base);
      const removed = deletingSide === 'local' ? local : remote;
      const changed = deletingSide === 'local' ? remote : local;
      deletePerson(removed, 'contact');
      if (change === 'name') changed.people.contact.name = 'Nome aggiornato';
      if (change === 'contribution') changed.contributions['contact:2'].help = 'Contributo aggiornato';
      if (change === 'relationship') changed.relationships['contact:2'].note = 'Nota aggiornata';
      if (change === 'new-knower') {
        ensureMember(changed, { id: '3', login: 'user-three', name: 'Tre' });
        changed.relationships['contact:3'] = { ...changed.relationships['contact:2'], id: 'contact:3', authorId: '3', note: 'Nuova relazione' };
      }
      const result = mergeNetworks(base, local, remote);
      assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].kind, 'person-deletion');
      const deleted = resolveConflicts(result.data, result.conflicts, [deletingSide]); assertDeleted(deleted);
      const kept = resolveConflicts(result.data, result.conflicts, [deletingSide === 'local' ? 'remote' : 'local']);
      validateNetwork(kept); assert.ok(kept.people.contact && kept.relationships['contact:1'] && kept.relationships['contact:2']);
      if (change === 'name') assert.equal(kept.people.contact.name, 'Nome aggiornato');
      if (change === 'contribution') assert.equal(kept.contributions['contact:2'].help, 'Contributo aggiornato');
      if (change === 'relationship') assert.equal(kept.relationships['contact:2'].note, 'Nota aggiornata');
      if (change === 'new-knower') assert.equal(kept.relationships['contact:3'].note, 'Nuova relazione');
    });
  }
}
test('simultaneous deletions are idempotent and unrelated edits survive', () => {
  const base = fixture(), local = clone(base), remote = clone(base);
  deletePerson(local, 'contact'); deletePerson(remote, 'contact'); remote.people['github-2'].role = 'Aggiornato';
  const result = mergeNetworks(base, local, remote); assert.equal(result.conflicts.length, 0); assertDeleted(result.data);
  assert.equal(result.data.people['github-2'].role, 'Aggiornato');
});
test('tombstone does not delete an explicitly restored contact on the next sync', () => {
  const original = fixture(), base = clone(original); deletePerson(base, 'contact');
  const result = mergeNetworks(base, original, base); assert.equal(result.conflicts.length, 0);
  validateNetwork(result.data); assert.ok(result.data.people.contact); assert.ok(result.data.relationships['contact:2']);
});
test('a stale backup cannot resurrect a deleted contact without an explicit choice', () => {
  const saved = fixture(), current = clone(saved); deletePerson(current, 'contact');
  const sync = new NetworkSync({}, { base: current, local: current, sha: '1' });
  sync.import(saved); assert.equal(sync.pending.conflicts.length, 1); assert.equal(sync.pending.source, 'import');
  sync.resolve(['local']); assertDeleted(sync.local);
  sync.import(saved); sync.resolve(['remote']); validateNetwork(sync.local); assert.ok(sync.local.people.contact);
});
test('a deletion during confirmation compares against the original dialog snapshot', () => {
  const original = fixture(), current = clone(original); current.relationships['contact:2'].note = 'Modificato mentre la conferma era aperta';
  const sync = new NetworkSync({}, { base: current, local: current, sha: '2' });
  sync.edit(d => deletePerson(d, 'contact'), original);
  assert.equal(sync.pending.source, 'edit'); assert.equal(sync.pending.conflicts.length, 1);
  sync.resolve(['remote']); assert.equal(sync.local.relationships['contact:2'].note, current.relationships['contact:2'].note);
});
test('stale form edit after a remote deletion can explicitly keep the edited complete person', () => {
  const original = fixture(), current = clone(original); deletePerson(current, 'contact');
  const sync = new NetworkSync({}, { base: current, local: current, sha: '2' });
  sync.edit(d => { d.people.contact.role = 'Dal modulo ancora aperto'; }, original);
  assert.equal(sync.pending.conflicts.length, 1); sync.resolve(['local']);
  validateNetwork(sync.local); assert.equal(sync.local.people.contact.role, 'Dal modulo ancora aperto'); assert.ok(sync.local.relationships['contact:2']);
});
test('deletion survives a SHA race when another author adds a relationship', async () => {
  const base = fixture(); let remote = clone(base), sha = '1', raced = false, writes = 0;
  const api = {
    async read() { return { data: clone(remote), sha }; },
    async write(data, expected) {
      writes++;
      if (!raced) {
        raced = true; sha = '2'; remote.relationships['contact:2'].note = 'Durante il salvataggio';
      }
      if (expected !== sha) throw Object.assign(new Error('SHA changed'), { status: 409 });
      remote = clone(data); sha = '3'; return sha;
    },
  };
  const sync = new NetworkSync(api, { base, local: base, sha }); sync.edit(d => deletePerson(d, 'contact'));
  await sync.sync(); assert.equal(sync.status, 'conflict'); assert.equal(writes, 1);
  sync.resolve(['local']); await sync.sync(); assertDeleted(remote); assert.equal(sync.status, 'saved');
});
test('removing only my relationship keeps the shared person and the other knower', () => {
  const data = fixture(); data.relationships['contact:1'] = null; validateNetwork(data);
  assert.ok(data.people.contact); assert.ok(data.relationships['contact:2']); assert.ok(data.contributions['contact:1']);
  assert.equal(findPeople(data, '1', { scope: 'mine' }).length, 0); assert.equal(findPeople(data, '2', { scope: 'mine' }).length, 1);
});
