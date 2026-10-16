import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, emptyNetwork, ensureMember, validateNetwork, mergeNetworks, resolveConflicts, findPeople, keyFor, tags, exportCSV, equal } from '../src/model.js';
import { fixture } from './fixture.mjs';
test('validated identity uses numeric stable ID, independent of login', () => {
  const d = fixture(); ensureMember(d, { id: '1', login: 'new-login', name: 'Changed' });
  assert.equal(d.members['1'].personId, 'github-1'); assert.equal(d.members['1'].login, 'new-login');
  assert.equal(d.people['github-1'].name, 'Uno'); validateNetwork(d);
});
test('two knowers produce one person and two relationships', () => {
  const d = fixture(), found = findPeople(d, '1', { filters: { knower: '1' } });
  assert.equal(found.length, 1); assert.equal(found[0].relationships.length, 2);
});
test('knower filter uses the relationship author, not the original contact creator', () => {
  const d = fixture(); assert.equal(findPeople(d, '2', { filters: { knower: '2' } })[0].createdBy, '1');
  d.relationships['contact:2'] = null; assert.equal(findPeople(d, '2', { filters: { knower: '2' } }).length, 0);
});
test('search combines accent insensitive terms, notes and context', () => {
  const d = fixture(); d.relationships['contact:1'].note = 'Esperienza nella sanità';
  assert.equal(findPeople(d, '1', { search: 'sanita colleghi' }).length, 1);
  assert.equal(findPeople(d, '1', { search: 'sanita sconosciuto' }).length, 0);
});
test('tags combine categories without treating interests as skills', () => {
  const d = fixture(); assert.equal(findPeople(d, '1', { filters: { skills: 'UX', interests: 'Musica', markets: 'Digitale' } }).length, 1);
  assert.equal(findPeople(d, '1', { filters: { skills: 'Musica' } }).length, 0);
});
test('self-reported availability takes priority for a member', () => {
  const d = fixture();
  for (const [authorId, collaboration] of [['1', 'Aperto'], ['2', 'Non disponibile']]) {
    const id = `github-2:${authorId}`;
    d.contributions[id] = { ...d.contributions['contact:1'], id, personId: 'github-2', authorId, collaboration };
  }
  assert.equal(findPeople(d, '1', { filters: { collaboration: 'Aperto' } }).some(x => x.id === 'github-2'), false);
});
test('same name does not merge distinct IDs', () => {
  const d = fixture(); d.people.other = { ...d.people.contact, id: 'other' };
  assert.equal(findPeople(d, '1', { search: 'Persona esempio' }).length, 2);
});
test('separate changes to the same record merge by field', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.people.contact.role = 'Ricerca'; r.people.contact.name = 'Nuovo nome';
  const m = mergeNetworks(b, l, r); assert.equal(m.conflicts.length, 0); assert.equal(m.data.people.contact.role, 'Ricerca'); assert.equal(m.data.people.contact.name, 'Nuovo nome'); validateNetwork(m.data);
});
test('separate authors never overwrite each other', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.contributions['contact:1'].help = 'Mio'; r.contributions['contact:2'].help = 'Altro';
  const m = mergeNetworks(b, l, r); assert.equal(m.conflicts.length, 0); assert.equal(m.data.contributions['contact:2'].help, 'Altro');
});
test('same-field collisions preserve both and need a choice', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.people.contact.role = 'Uno'; r.people.contact.role = 'Due';
  const m = mergeNetworks(b, l, r); assert.equal(m.conflicts.length, 1); assert.equal(m.conflicts[0].local, 'Uno'); assert.equal(m.conflicts[0].remote, 'Due');
  assert.equal(resolveConflicts(m.data, m.conflicts, ['remote']).people.contact.role, 'Due');
});
test('same concurrent value does not conflict', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.people.contact.role = r.people.contact.role = 'Same';
  assert.equal(mergeNetworks(b, l, r).conflicts.length, 0);
});
test('remote tombstone remains deleted without stale resurrection', () => {
  const b = fixture(), l = clone(b), r = clone(b); r.relationships['contact:1'] = null;
  assert.equal(mergeNetworks(b, l, r).data.relationships['contact:1'], null);
});
test('delete versus edit is an explicit conflict', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.relationships['contact:1'] = null; r.relationships['contact:1'].note = 'Recent';
  const m = mergeNetworks(b, l, r); assert.equal(m.conflicts.length, 1); assert.equal(m.conflicts[0].local, null);
  validateNetwork(resolveConflicts(m.data, m.conflicts, ['remote']));
});
test('independent additions merge without a conflict', () => {
  const b = fixture(), l = clone(b), r = clone(b); l.people.local = { ...b.people.contact, id: 'local' }; r.people.remote = { ...b.people.contact, id: 'remote' };
  const m = mergeNetworks(b, l, r); assert.ok(m.data.people.local && m.data.people.remote); assert.equal(m.conflicts.length, 0);
});
test('unknown schema and dangling relationships rejected', () => {
  assert.throws(() => validateNetwork({ schemaVersion: 2 }));
  const d = fixture(); d.relationships['contact:1'].authorId = '3'; assert.throws(() => validateNetwork(d));
});
test('prototype pollution keys and unexpected credentials rejected', () => {
  const d = fixture(); d.people = JSON.parse('{"__proto__":{"polluted":true}}'); assert.throws(() => validateNetwork(d));
  const b = fixture(); b.token = 'not-allowed'; assert.throws(() => validateNetwork(b)); assert.equal({}.polluted, undefined);
});
test('shape rejects a token hidden in a record and invalid tags', () => {
  const d = fixture(); d.people.contact.token = 'no'; assert.throws(() => validateNetwork(d));
  delete d.people.contact.token; d.contributions['contact:1'].skills = 'not-array'; assert.throws(() => validateNetwork(d));
});
test('CSV preserves Unicode, quotes, line breaks and mitigates formula injection', () => {
  const d = fixture(); d.people.contact.name = '=1+1'; d.relationships['contact:1'].note = 'Riga "uno"\nSanità';
  const csv = exportCSV(d); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('Riga ""uno""\nSanità'));
});
test('tags trim and deduplicate without losing casing', () => { assert.deepEqual(tags('UX, UX, ux, Ricerca, '), ['ux', 'Ricerca']); });
test('equality ignores object key order', () => { assert.ok(equal({ a: 1, b: 2 }, { b: 2, a: 1 })); });
