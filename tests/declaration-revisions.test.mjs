import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, validateNetwork, viewPerson, findPeople, mergeNetworks } from '../src/model.js';
import { currentDeclarations } from '../src/declarations.js';
import { makePersonalCard, applyPersonalCard } from '../src/personal-card.js';

const august = '2026-08-01T00:00:00Z', october = '2026-10-01T00:00:00Z';
const received = '2026-10-18T10:00:00Z', laterReceived = '2026-10-18T11:00:00Z';
const fields = (changes = {}) => ({ name: 'Paolo Bianchi · test', role: '', help: 'Siti web per studi medici', need: '', needs: [], phone: '', email: 'paolo@example.test', linkedin: '', ...changes });
function cards() {
  const older = makePersonalCard(fields({ help: 'Offerta di agosto', needs: [{ id: 'office', text: 'Cerco studio fino a settembre' }] }), null, { now: august });
  return { older, newer: makePersonalCard(fields({ help: 'Offerta di ottobre' }), older, { now: october }) };
}
function network() { const d = fixture(); d.people.contact.email = 'paolo@example.test'; return d; }

test('a portable card stores the owner date separately from the reception date', () => {
  const d = network(), { newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', received);
  assert.equal(d.contributions['contact:1'].reply.cardUpdatedAt, october);
  assert.equal(d.contributions['contact:1'].reply.updatedAt, received);
  validateNetwork(d);
});
test('an older portable revision cannot overwrite a newer card and changes nothing', () => {
  const d = network(), { older, newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', received);
  const before = clone(d);
  assert.throws(() => applyPersonalCard(d, older, '1', 'contact', laterReceived), /più recente/);
  assert.deepEqual(d, before);
});
test('the stale-card guard checks the other facilitator before creating a new reply', () => {
  const d = network(), { older, newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', received);
  const before = clone(d);
  assert.throws(() => applyPersonalCard(d, older, '2', 'contact', laterReceived), /più recente/);
  assert.deepEqual(d, before); assert.equal(d.contributions['contact:2'].reply, undefined);
});
test('one current owner declaration replaces only older snapshots, preserving both facilitators’ observations', () => {
  const d = network(), { older, newer } = cards();
  d.contributions['contact:1'].needs = { manual: { text: 'Richiesta annotata dal team', skills: [], markets: [], updatedAt: august, status: 'active' } }; d.schemaVersion = 2;
  const original = clone(d); applyPersonalCard(d, older, '1', 'contact', received); applyPersonalCard(d, newer, '2', 'contact', laterReceived);
  const selected = currentDeclarations(Object.values(d.contributions));
  assert.equal(selected.length, 1); assert.equal(selected[0].authorId, '2');
  for (const key of ['contact:1', 'contact:2']) {
    const { reply, ...manual } = d.contributions[key]; assert.deepEqual(manual, original.contributions[key]);
  }
  assert.deepEqual(d.relationships, original.relationships);
  assert.equal(d.contributions['contact:1'].reply.help, older.profile.help, 'historical snapshots remain stored');
  validateNetwork(d);
});
test('network search drops an old declared request while keeping manual team requests', () => {
  const d = network(), { older, newer } = cards();
  d.schemaVersion = 2; d.contributions['contact:1'].needs = { manual: { text: 'Partner per progetto locale', skills: [], markets: [], updatedAt: august, status: 'active' } };
  applyPersonalCard(d, older, '1', 'contact', received); applyPersonalCard(d, newer, '2', 'contact', laterReceived);
  const p = viewPerson(d, d.people.contact);
  assert.equal(p.declarations.length, 1); assert.deepEqual(p.seeking.map(c => c.need.text), ['Partner per progetto locale']);
  assert.equal(findPeople(d, '1', { search: 'settembre', filters: { intent: 'need' } }).length, 0);
  assert.equal(findPeople(d, '1', { search: 'locale', filters: { intent: 'need' } })[0].id, 'contact');
});
test('offline facilitators merge different owner revisions without reviving an obsolete declared need', () => {
  const base = network(), a = clone(base), b = clone(base), { older, newer } = cards();
  applyPersonalCard(a, older, '1', 'contact', laterReceived);
  applyPersonalCard(b, newer, '2', 'contact', received);
  const merged = mergeNetworks(base, a, b);
  assert.equal(merged.conflicts.length, 0); validateNetwork(merged.data);
  const p = viewPerson(merged.data, merged.data.people.contact);
  assert.equal(p.declarations.length, 1); assert.equal(p.declarations[0].help, newer.profile.help);
  assert.equal(p.seeking.length, 0);
  assert.equal(merged.data.contributions['contact:1'].reply.help, older.profile.help);
  assert.deepEqual(merged.data.relationships, base.relationships);
});
test('two facilitators may receive the same revision, displayed as one declaration', () => {
  const d = network(), { newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', received); applyPersonalCard(d, newer, '2', 'contact', laterReceived);
  assert.equal(currentDeclarations(Object.values(d.contributions)).length, 1);
  assert.ok(d.relationships['contact:1']); assert.ok(d.relationships['contact:2']);
  assert.throws(() => applyPersonalCard(d, newer, '1', 'contact', laterReceived), /già aggiunto/);
});
test('different revisions at the same source time remain distinguishable and are not rejected as older', () => {
  const d = network(), { newer } = cards();
  const simultaneous = makePersonalCard(fields({ help: 'Altra modifica contemporanea' }), newer, { now: october });
  applyPersonalCard(d, newer, '1', 'contact', received); applyPersonalCard(d, simultaneous, '2', 'contact', laterReceived);
  assert.equal(currentDeclarations(Object.values(d.contributions)).length, 2);
  validateNetwork(d);
});
test('legacy reception dates never establish the owner revision order', () => {
  const d = network(), { older, newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', laterReceived);
  delete d.contributions['contact:1'].reply.cardUpdatedAt;
  applyPersonalCard(d, older, '2', 'contact', received);
  assert.equal(currentDeclarations(Object.values(d.contributions)).length, 2);
  assert.equal(d.contributions['contact:1'].reply.help, newer.profile.help);
  assert.equal(d.contributions['contact:2'].reply.help, older.profile.help);
  validateNetwork(d);
});
test('legacy snapshots with no source date retain the explicit replacement policy', () => {
  const d = network(), { older, newer } = cards(); applyPersonalCard(d, newer, '1', 'contact', laterReceived);
  delete d.contributions['contact:1'].reply.cardUpdatedAt;
  applyPersonalCard(d, older, '1', 'contact', received);
  assert.equal(d.contributions['contact:1'].reply.help, older.profile.help);
  assert.equal(d.contributions['contact:1'].reply.cardUpdatedAt, august);
});
test('the selector is pure, compares actual dates and never combines different card identities', () => {
  const base = { id: 'one', reply: { cardId: 'card-one', responseId: 'rev-one', cardUpdatedAt: '2026-10-01T01:00:00+02:00' } };
  const later = { id: 'two', reply: { cardId: 'card-one', responseId: 'rev-two', cardUpdatedAt: '2026-09-30T23:30:00Z' } };
  const unrelated = { id: 'three', reply: { ...base.reply, cardId: 'card-two' } };
  const legacy = { id: 'four', reply: { ...base.reply, cardUpdatedAt: undefined } };
  const input = [base, later, unrelated, legacy, { id: 'manual' }], before = clone(input);
  assert.deepEqual(currentDeclarations(input).map(c => c.id), ['two', 'three', 'four']);
  assert.deepEqual(input, before);
});


test('new form replies carry source dates and reject stale snapshots across facilitators', async () => {
  const { prepareProfileInvitation, profileInvitation, encodeFormLink, decodeFormLink, applyProfileResponse } = await import('../src/profile-requests.js');
  const d = network(), { older, newer } = cards();
  const response = (card, author) => {
    prepareProfileInvitation(d, author, 'contact'); const invite = profileInvitation(d, author, 'contact');
    return { v: 3, kind: 'response', personId: 'contact', authorId: author, requestId: invite.requestId, responseId: crypto.randomUUID(), cardId: card.id, cardUpdatedAt: card.updatedAt, ...card.profile };
  };
  const current = response(newer, '1');
  assert.deepEqual(decodeFormLink(encodeFormLink(current, 'https://example.test/'), 'response'), current);
  applyProfileResponse(d, current, '1', received);
  assert.equal(d.contributions['contact:1'].reply.cardUpdatedAt, october);
  const stale = response(older, '2'), before = clone(d);
  assert.throws(() => applyProfileResponse(d, stale, '2', laterReceived), /più recente/); assert.deepEqual(d, before);
  const invalid = { ...current, cardUpdatedAt: 'not-a-date' };
  assert.throws(() => encodeFormLink(invalid, 'https://example.test/'));
  const noCard = { ...current }; delete noCard.cardId;
  assert.throws(() => encodeFormLink(noCard, 'https://example.test/'));
});
