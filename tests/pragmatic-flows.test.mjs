import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, validateNetwork, findPeople, mergeNetworks, exportCSV, viewPerson } from '../src/model.js';
import { normalizeEmail, mailtoURL, personContactActions } from '../src/contacts.js';
import { draftFromText, needTags } from '../src/profile.js';
import { encodeFormLink, decodeFormLink, applyProfileResponse, responseTarget } from '../src/profile-requests.js';

const requestId = '9241667f-72b1-44ec-b644-1e854d49936d';
const invitation = () => ({ v: 1, kind: 'invite', personId: 'contact', authorId: '1', requestId, facilitator: 'Uno', replyPhone: '', replyEmail: 'uno@example.test' });
const response = () => ({ v: 1, kind: 'response', personId: 'contact', authorId: '1', requestId, name: 'Persona Èsempio', role: '', help: 'Realizzo siti web per studi medici.', need: 'Cerco un videomaker.', phone: '', email: 'persona@example.test', linkedin: '' });
const requested = () => { const d = fixture(); d.contributions['contact:1'].profileRequestId = requestId; return d; };

test('a copied biography is kept separately and generates a short reviewable offering', () => {
  const raw = 'Persona Esempio\nDesigner\nInformazioni\nHo esperienza in grafica e comunicazione in sanità.\nAppassionato di vela.';
  const d = draftFromText(raw);
  assert.equal(d.presentation, raw); assert.equal(d.help, 'Comunicazione · Grafica · Design · Sanità'); assert.equal(d.need, '');
  assert.doesNotMatch(d.help, /appassionato|esperienza/i);
});
test('generic history and hobbies never become an invented offering or need', () => {
  for (const text of ['Sono una persona dinamica e piena di energia.', 'Ho lavorato in molte aziende. Ora mi dedico alla mia famiglia.', 'Appassionato di vela e fotografia.']) {
    const d = draftFromText(text); assert.equal(d.help, ''); assert.equal(d.need, ''); assert.equal(d.presentation, text);
  }
});
test('explicit requests are separated from actions and get their own tags', () => {
  const d = draftFromText('Aiuto studi medici con siti web e prenotazioni.\nSono alla ricerca di un videomaker.');
  assert.match(d.help, /^Aiuto studi medici/); assert.doesNotMatch(d.help, /videomaker/); assert.match(d.need, /ricerca di un videomaker/);
  assert.ok(d.needTags.skills.includes('Video')); assert.equal(d.skills.includes('Video'), false);
  assert.ok(needTags('È alla ricerca di un designer').skills.includes('Design'));
  assert.ok(needTags('I am looking for a software developer').skills.includes('Sviluppo software'));
});
test('an email-only contact has a direct action without a phone or social profile', () => {
  const p = { ...fixture().people.contact, email: 'nome@EXAMPLE.TEST', relationships: [] };
  assert.equal(normalizeEmail(p.email), 'nome@example.test');
  const [a] = personContactActions(p, '1'); assert.equal(a.type, 'email'); assert.match(a.href, /^mailto:nome@example.test\?/);
  const uri = mailtoURL(p.email, 'Riga\nnuova', 'Testo con è & caratteri');
  assert.equal(new URL(uri).searchParams.get('subject'), 'Riga nuova'); assert.equal(new URL(uri).searchParams.get('body'), 'Testo con è & caratteri');
  for (const bad of ['a@b.test?subject=hi', 'a@b.test\nbcc:x@y.test', 'not-an-email', '']) { if (bad) assert.throws(() => normalizeEmail(bad)); }
});
test('new optional fields round-trip without migrating old archives or exposing the source in search', () => {
  const old = fixture(), copy = clone(old); validateNetwork(old); assert.deepEqual(old, copy);
  const next = requested(); next.people.contact.email = 'persona@example.test'; next.contributions['contact:1'].presentation = 'Originale riservato con parolaunica';
  validateNetwork(JSON.parse(JSON.stringify(next))); assert.equal(findPeople(next, '1', { search: 'parolaunica' }).length, 0);
  assert.ok(exportCSV(next).includes('Originale riservato')); assert.ok(exportCSV(next).includes('persona@example.test'));
});
test('an invitation contains routing and the sender, never the contact profile or archive', () => {
  const url = encodeFormLink(invitation(), 'https://example.test/networking/');
  assert.equal(new URL(url).pathname, '/networking/scheda.html'); assert.equal(new URL(url).search, '');
  assert.deepEqual(decodeFormLink(url, 'invite'), invitation());
  assert.equal(Object.hasOwn(decodeFormLink(url, 'invite'), 'name'), false);
  assert.throws(() => encodeFormLink({ ...invitation(), token: 'secret' }, 'https://example.test/'));
});
test('a filled Unicode response round-trips through a link, with no server query', () => {
  const r = response(); r.help = 'Supporto 🚀 in sanità. '.repeat(60);
  const url = encodeFormLink(r, 'https://example.test/networking/scheda.html#invite=old');
  assert.equal(new URL(url).pathname, '/networking/'); assert.equal(new URL(url).search, ''); assert.deepEqual(decodeFormLink(url, 'response'), r);
  assert.throws(() => decodeFormLink(url, 'invite'));
});
test('malformed, oversized, unknown or dangerous response fields are refused', () => {
  for (const r of [{ ...response(), requestId: '-'.repeat(36) }, { ...response(), authorId: 1 }, { ...response(), linkedin: 'javascript:alert(1)' }, { ...response(), help: 'x'.repeat(1501) }, { ...response(), members: {} }]) assert.throws(() => encodeFormLink(r, 'https://example.test/'));
  for (const raw of ['#response=notjson', '#response=' + 'a'.repeat(28000), '#response=eyJfX3Byb3RvX18iOnt9fQ']) assert.throws(() => decodeFormLink(raw, 'response'));
});
test('only the matching author can confirm once, preserving their observations and other knowledge', () => {
  const d = requested(), other = clone(d.contributions['contact:2']), relation = clone(d.relationships);
  d.people.contact.phone = '+447700900111'; d.contributions['contact:1'].presentation = 'Fonte precedente';
  assert.throws(() => responseTarget(d, response(), '2')); assert.throws(() => responseTarget(d, { ...response(), requestId: '1341667f-72b1-44ec-b644-1e854d49936d' }, '1'));
  const before = clone(d.contributions['contact:1']);
  applyProfileResponse(d, response(), '1'); validateNetwork(d);
  assert.equal(d.people.contact.phone, '+447700900111'); assert.equal(d.people.contact.role, 'Designer'); assert.equal(d.people.contact.email, 'persona@example.test');
  for (const k of Object.keys(before).filter(k => k !== 'profileRequestId')) assert.deepEqual(d.contributions['contact:1'][k], before[k]);
  const p = viewPerson(d, d.people.contact); assert.ok(p.skills.includes('Siti web')); assert.ok(p.needSkills.includes('Video')); assert.ok(p.declarations[0].reported);
  assert.deepEqual(d.contributions['contact:2'], other); assert.deepEqual(d.relationships, relation);
  assert.throws(() => applyProfileResponse(d, response(), '1'));
});
test('a removed contact, participant profile or replaced request cannot be updated by a response', () => {
  const d = requested(); d.people.contact = null; assert.throws(() => responseTarget(d, response(), '1'));
  const m = requested(); m.people.contact.memberId = '2'; assert.throws(() => responseTarget(m, response(), '1'));
  const b = requested(); b.contributions['contact:1'].profileRequestId = ''; assert.throws(() => responseTarget(b, response(), '1'));
});
test('a response and a concurrent observation merge without replacing either', () => {
  const base = requested(), local = clone(base), remote = clone(base);
  applyProfileResponse(local, response(), '1'); remote.contributions['contact:1'].help = 'Correzione concorrente'; remote.relationships['contact:2'].note = 'Nuova nota';
  const merged = mergeNetworks(base, local, remote);
  assert.equal(merged.conflicts.length, 0); assert.equal(merged.data.contributions['contact:1'].help, 'Correzione concorrente'); assert.equal(merged.data.contributions['contact:1'].reply.help, response().help);
  assert.equal(merged.data.relationships['contact:2'].note, 'Nuova nota');
});
