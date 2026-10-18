import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { networkPeople, viewPerson, findPeople, matchingOffers, filterTags, validateNetwork } from '../src/model.js';
import { personContactActions } from '../src/contacts.js';
import { responseCandidates } from '../src/profile-requests.js';
import { makePersonalCard, applyPersonalCard, personalCardCandidates } from '../src/personal-card.js';

function sharedContact() {
  const d = fixture(); d.schemaVersion = 2; d.people.contact.phone = '+447700900111';
  Object.assign(d.contributions['contact:1'], { help: 'Marketing per cliniche', skills: ['Marketing'], markets: ['Sanità'], needs: { video: { text: 'Un videomaker', skills: ['Video'], markets: ['Sanità'], status: 'active', updatedAt: '2026-10-18T12:00:00.000Z' } } });
  Object.assign(d.contributions['contact:2'], { help: 'Prepara bandi di finanza agevolata per startup', skills: ['Finanza agevolata'], markets: ['Startup'] });
  return validateNetwork(d);
}
test('a teammate’s matching offer supplies the visible result and the contact message', () => {
  const d = sharedContact(), options = { search: 'finanza', filters: { intent: 'offer' } };
  const [p] = findPeople(d, '1', options), [offer] = matchingOffers(p, options);
  assert.equal(p.id, 'contact'); assert.equal(offer.authorId, '2');
  const action = personContactActions(p, '1', { intent: 'offer', help: offer.help }).find(a => a.type === 'whatsapp');
  const message = new URL(action.href).searchParams.get('text');
  assert.ok(message.includes(offer.help)); assert.doesNotMatch(message, /Marketing per cliniche/);
  assert.equal(matchingOffers(p, { filters: { skills: 'Finanza agevolata' } })[0].id, offer.id);
});
test('filter options follow offer or request scope, without suggesting impossible choices', () => {
  const people = networkPeople(sharedContact());
  assert.ok(filterTags(people, 'skills', 'offer').includes('Finanza agevolata'));
  assert.ok(!filterTags(people, 'skills', 'offer').includes('Video'));
  assert.deepEqual(filterTags(people, 'skills', 'need'), ['Video']);
  assert.ok(!filterTags(people, 'markets', 'need').includes('Startup'));
  assert.ok(filterTags(people, 'skills').includes('Video'));
});
test('indexed projections preserve discovery results and are rebuilt after edits', () => {
  const d = sharedContact(), before = structuredClone(d), people = networkPeople(d);
  for (const p of people) assert.deepEqual(p, viewPerson(d, d.people[p.id]));
  for (const options of [{}, { search: 'finanza' }, { filters: { knower: '2', intent: 'need' } }]) {
    assert.deepEqual(findPeople(d, '1', options), findPeople(d, '1', { ...options, people }));
  }
  assert.deepEqual(d, before);
  d.contributions['contact:2'].help = 'Consulenza fiscale'; d.contributions['contact:2'].skills = ['Fisco'];
  assert.equal(findPeople(d, '1', { search: 'finanza' }).length, 0);
  assert.equal(findPeople(d, '1', { search: 'fisco' }).length, 1);
});
test('a shared business address with a different name is a suggestion, not a preselected identity', () => {
  const d = fixture(); d.people.contact.name = 'Laura Verdi'; d.people.contact.email = 'studio@example.test';
  const fields = { name: 'Paolo Bianchi', role: '', help: '', need: '', email: 'studio@example.test', phone: '', linkedin: '' };
  const [candidate] = responseCandidates(d, fields);
  assert.equal(candidate.id, 'contact'); assert.equal(candidate.exact, false); assert.equal(candidate.sharedContact, true);
  const card = makePersonalCard(fields);
  assert.equal(personalCardCandidates(d, card)[0].exact, false);
  applyPersonalCard(d, card, '1', 'contact');
  assert.equal(personalCardCandidates(d, card)[0].exact, true, 'a deliberately confirmed card identity remains stable after a name change');
});
