import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, findPeople, keyFor, removeFromNetwork, validateNetwork, viewPerson } from '../src/model.js';
import { NetworkSync } from '../src/sync.js';
import { fixture } from './fixture.mjs';

test('the default network includes contacts known only by another teammate', () => {
  const data = fixture();
  data.relationships['contact:1'] = null;
  const people = findPeople(data, '1');
  assert.ok(people.some(p => p.id === 'contact'));
  assert.ok(people.some(p => p.id === 'github-2'));
  assert.equal(people.filter(p => p.id === 'contact').length, 1);
});

test('knower filtering uses stable member IDs and combines with the other search filters', () => {
  const data = fixture();
  data.members['1'].name = data.members['2'].name = 'Stesso nome';
  data.relationships['contact:1'] = null;
  assert.equal(findPeople(data, '1', { filters: { knower: '1' } }).length, 0);
  assert.equal(findPeople(data, '1', { search: 'ricerca', filters: { knower: '2', skills: 'UX', collaboration: 'Aperto' } })[0].id, 'contact');
  assert.equal(findPeople(data, '1', { filters: { knower: '2', skills: 'Vendite' } }).length, 0);
});

test('a shared person keeps both paths to their skills when one knower is selected', () => {
  const data = fixture();
  const result = findPeople(data, '1', { filters: { knower: '2' } });
  assert.equal(result.length, 1);
  assert.equal(result[0].relationships.length, 2);
});

test('removing a shared contact clears only my relationship and contribution', () => {
  const data = fixture(), original = clone(data);
  removeFromNetwork(data, 'contact', '1');
  validateNetwork(data);
  assert.equal(data.relationships['contact:1'], null);
  assert.equal(data.contributions['contact:1'], null);
  assert.deepEqual(data.relationships['contact:2'], original.relationships['contact:2']);
  assert.deepEqual(data.contributions['contact:2'], original.contributions['contact:2']);
  assert.deepEqual(data.people.contact, original.people.contact);
  assert.equal(findPeople(data, '1', { filters: { knower: '1' } }).length, 0);
  assert.equal(findPeople(data, '2', { filters: { knower: '2' } }).length, 1);
});

test('removing an exclusively owned contact deletes its complete record', () => {
  const data = fixture();
  data.relationships['contact:2'] = null; data.contributions['contact:2'] = null;
  removeFromNetwork(data, 'contact', '1');
  validateNetwork(data);
  assert.equal(data.people.contact, null);
  assert.equal(data.relationships['contact:1'], null);
  assert.equal(data.contributions['contact:1'], null);
});

test('a participant cannot remove someone else’s knowledge through the normal removal action', () => {
  const data = fixture();
  data.relationships['contact:1'] = null; data.contributions['contact:1'] = null;
  const original = clone(data);
  removeFromNetwork(data, 'contact', '1');
  assert.deepEqual(data, original);
});

test('removing a relationship with a participant preserves their identity and self description', () => {
  const data = fixture(), id = 'github-2', key = keyFor(id, '1'), self = keyFor(id, '2');
  data.relationships[key] = { ...data.relationships['contact:1'], id: key, personId: id };
  data.contributions[self] = { ...data.contributions['contact:2'], id: self, personId: id };
  removeFromNetwork(data, id, '1');
  validateNetwork(data);
  assert.equal(data.relationships[key], null);
  assert.ok(data.people[id]); assert.ok(data.members['2']); assert.ok(data.contributions[self]);
  assert.throws(() => removeFromNetwork(data, 'github-1', '1'), /tuo profilo/);
});

test('my removal and a concurrent update by another knower synchronize without erasing their work', async () => {
  const base = fixture(), remote = clone(base);
  remote.relationships['contact:2'].note = 'Appunto aggiornato dall’altra persona';
  let saved;
  const sync = new NetworkSync({
    async read() { return { data: remote, sha: 'remote-sha' }; },
    async write(data, sha) { assert.equal(sha, 'remote-sha'); saved = data; return 'saved-sha'; },
  }, { base, local: base, sha: 'old-sha' });
  sync.edit(data => removeFromNetwork(data, 'contact', '1'));
  await sync.sync();
  assert.equal(sync.status, 'saved');
  assert.equal(saved.relationships['contact:1'], null);
  assert.equal(saved.contributions['contact:1'], null);
  assert.equal(saved.relationships['contact:2'].note, remote.relationships['contact:2'].note);
});

test('a member’s declared offering takes priority over other people’s previous suggestions', () => {
  const data = fixture(), personId = 'github-2';
  for (const authorId of ['1', '2']) {
    const id = keyFor(personId, authorId);
    data.contributions[id] = { ...data.contributions['contact:1'], id, personId, authorId,
      help: authorId === '2' ? 'Progettazione di servizi' : 'Traduzioni specialistiche',
      skills: authorId === '2' ? ['Design servizi'] : ['Traduzioni'], interests: [], markets: [],
    };
  }
  const person = viewPerson(data, data.people[personId]);
  assert.deepEqual(person.skills, ['Design servizi']);
  assert.equal(person.contributions.length, 2, 'observations remain available to the team');
  assert.equal(findPeople(data, '1', { search: 'Traduzioni' }).some(p => p.id === personId), false);
  assert.equal(findPeople(data, '1', { filters: { skills: 'Traduzioni' } }).some(p => p.id === personId), false);
  assert.equal(findPeople(data, '1', { search: 'Progettazione' }).some(p => p.id === personId), true);
  data.contributions[keyFor(personId, '2')].skills = [];
  assert.deepEqual(viewPerson(data, data.people[personId]).skills, [], 'cleared skills are not reintroduced from old suggestions');
});
