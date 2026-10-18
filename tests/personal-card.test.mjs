import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, validateNetwork, viewPerson, deletePerson } from '../src/model.js';
import { makePersonalCard, personalCardLink, readPersonalCardLink, loadPersonalCard, rememberPersonalCard, forgetPersonalCard, sameProfile, personalCardCandidates, applyPersonalCard } from '../src/personal-card.js';
import { prepareProfileInvitation, profileInvitation, encodeFormLink, decodeFormLink, applyProfileResponse } from '../src/profile-requests.js';
import { personContactActions } from '../src/contacts.js';
const profile = () => ({ name: 'Sofia Verdi', role: 'Designer', help: 'Siti web per studi medici', need: 'Cerco un videomaker', phone: '', email: 'sofia@example.test', linkedin: '' });
const makeStore = () => { const values = new Map(); return { values, getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };

test('one personal identity is reused; an unchanged card keeps the same share link', () => {
  const first = makePersonalCard(profile()), again = makePersonalCard(profile(), first);
  assert.deepEqual(again, first);
  const updated = makePersonalCard({ ...profile(), help: 'Ricerca utenti in sanità' }, first);
  assert.equal(updated.id, first.id); assert.notEqual(updated.revision, first.revision); assert.equal(first.profile.help, profile().help);
});
test('a portable Unicode card round-trips without an invitation, recipient, credentials or server query', () => {
  const card = makePersonalCard({ ...profile(), name: 'Sofía Èsempio', help: 'Sanità e strumenti 🚀' });
  const link = personalCardLink(card, 'https://example.test/networking/scheda.html#invite=old');
  assert.equal(new URL(link).pathname, '/networking/profilo.html'); assert.equal(new URL(link).search, ''); assert.deepEqual(readPersonalCardLink(link), card);
  assert.equal(Object.hasOwn(card, 'authorId'), false); assert.equal(Object.hasOwn(card, 'requestId'), false);
  assert.throws(() => readPersonalCardLink('#card=broken')); assert.throws(() => readPersonalCardLink('#card=' + 'a'.repeat(28000)));
});
test('the remembered public card does not touch authentication storage and can be forgotten alone', () => {
  const store = makeStore(), card = makePersonalCard(profile()); store.setItem('encrypted-network', 'untouched');
  assert.equal(loadPersonalCard(store), null); rememberPersonalCard(card, store); assert.deepEqual(loadPersonalCard(store), card);
  forgetPersonalCard(store); assert.equal(loadPersonalCard(store), null); assert.equal(store.getItem('encrypted-network'), 'untouched');
  assert.throws(() => rememberPersonalCard(card, { setItem: () => { throw new Error('blocked'); } }));
});
test('unknown or malformed shared profile data is rejected and private mapping fields are excluded', () => {
  const card = makePersonalCard({ ...profile(), relationship: 'PRIVATE', token: 'PRIVATE', presentation: 'PRIVATE' });
  assert.doesNotMatch(JSON.stringify(card), /PRIVATE|token|relationship|presentation/);
  for (const change of [{ id: 'bad' }, { kind: 'response' }, { revision: 'bad' }, { updatedAt: 'not-a-date' }, { profile: { ...profile(), token: 'secret' } }]) assert.throws(() => personalCardLink({ ...card, ...change }, 'https://example.test/'));
});
test('a saved card is reused only for a compatible identity, avoiding silent cross-person autofill', () => {
  assert.ok(sameProfile(profile(), { name: 'Sofía Verdi' }));
  assert.ok(sameProfile(profile(), { name: 'Nome aggiornato', email: 'SOFIA@example.test' }));
  assert.equal(sameProfile(profile(), { name: 'Sofia Verdi', email: 'altra@example.test' }), false);
  assert.equal(sameProfile(profile(), { name: 'Un’altra persona' }), false);
});
test('the same public card can be confirmed in two independent networks without being refilled', () => {
  const a = fixture(), b = fixture(), card = makePersonalCard(profile());
  applyPersonalCard(a, card, '1'); applyPersonalCard(b, card, '2'); validateNetwork(a); validateNetwork(b);
  assert.equal(a.people[card.id].createdBy, '1'); assert.equal(b.people[card.id].createdBy, '2');
  assert.deepEqual(a.contributions[card.id + ':1'].reply.help, b.contributions[card.id + ':2'].reply.help);
});
test('teammates link one shared identity while preserving their independent observations', () => {
  const d = fixture(), card = makePersonalCard(profile()); applyPersonalCard(d, card, '1');
  const candidate = personalCardCandidates(d, card).find(p => p.id === card.id); assert.ok(candidate?.exact);
  applyPersonalCard(d, card, '2', card.id); validateNetwork(d);
  assert.equal(Object.keys(d.people).length, 4); assert.ok(d.relationships[card.id + ':1']); assert.ok(d.relationships[card.id + ':2']);
  assert.throws(() => applyPersonalCard(d, card, '1', card.id), /già aggiunto/);
});
test('a new version is reviewed explicitly and keeps custom tags, needs, originals and relationships', () => {
  const d = fixture(), card = makePersonalCard(profile()); d.people.contact.email = profile().email; applyPersonalCard(d, card, '1', 'contact');
  d.contributions['contact:1'].skills.push('Tag artigianale'); d.contributions['contact:1'].presentation = 'Originale';
  const before = clone(d), updated = makePersonalCard({ ...profile(), name: 'Sofia · aggiornato', help: 'Video e contenuti', need: '' }, card);
  assert.equal(d.contributions['contact:1'].reply.help, profile().help, 'making a new share link has no network side effect');
  applyPersonalCard(d, updated, '1', 'contact'); validateNetwork(d);
  for (const k of ['help', 'skills', 'markets', 'need', 'presentation']) assert.deepEqual(d.contributions['contact:1'][k], before.contributions['contact:1'][k]);
  assert.deepEqual(d.relationships, before.relationships); assert.deepEqual(d.contributions['contact:2'], before.contributions['contact:2']);
  assert.equal(viewPerson(d, d.people.contact).declarations[0].help, 'Video e contenuti');
});
test('a removed personal identity cannot reappear from the same public link', () => {
  const d = fixture(), card = makePersonalCard(profile()); applyPersonalCard(d, card, '1'); deletePerson(d, card.id);
  assert.throws(() => applyPersonalCard(d, card, '1'));
});
test('one personal card can accompany different invitations and retains its identity', () => {
  const card = makePersonalCard(profile());
  for (const author of ['1', '2']) {
    const d = fixture(); prepareProfileInvitation(d, author);
    const invite = profileInvitation(d, author), link = encodeFormLink(invite, 'https://example.test/');
    assert.ok(link.includes('#i=')); assert.ok(link.length < 250); assert.deepEqual(decodeFormLink(link, 'invite'), invite);
    const reply = { v: 2, kind: 'response', personId: 'new', authorId: author, requestId: invite.requestId, responseId: crypto.randomUUID(), cardId: card.id, ...card.profile };
    const id = applyProfileResponse(d, reply, author); validateNetwork(d); assert.equal(d.contributions[id + ':' + author].reply.cardId, card.id);
  }
});
test('contact messages follow the selected intent while keeping the existing channels', () => {
  const p = { ...profile(), id: 'p', createdBy: '1', relationships: [], phone: '+447700900111' };
  const offer = personContactActions(p, '1', { intent: 'offer', help: p.help }), need = personContactActions(p, '1', { intent: 'need', need: p.need });
  assert.deepEqual(offer.map(a => a.type), need.map(a => a.type));
  assert.match(new URL(offer[0].href).searchParams.get('text'), /vorrei coinvolgerti.*Siti web/);
  assert.match(new URL(need[0].href).searchParams.get('text'), /tua richiesta.*videomaker/);
  assert.doesNotMatch(new URL(need[0].href).searchParams.get('text'), /vorrei coinvolgerti/);
});
