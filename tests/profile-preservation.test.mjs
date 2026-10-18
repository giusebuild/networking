import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, validateNetwork, viewPerson, findPeople, mergeNetworks, exportCSV, deletePerson } from '../src/model.js';
import { prepareProfileInvitation, profileInvitation, responseCandidates, responseTarget, applyProfileResponse, encodeFormLink, decodeFormLink } from '../src/profile-requests.js';
import { whatsappURL, mailtoURL } from '../src/contacts.js';

const id = '9241667f-72b1-44ec-b644-1e854d49936d';
const another = '1341667f-72b1-44ec-b644-1e854d49936d';
const filled = (invite, fields = {}) => ({ v: 2, kind: 'response', personId: invite.personId, authorId: invite.authorId, requestId: invite.requestId, responseId: id, name: 'Persona esempio', role: '', help: '', need: '', phone: '', email: '', linkedin: '', ...fields });
function existing() { const d = fixture(); prepareProfileInvitation(d, '1', 'contact'); return [d, profileInvitation(d, '1', 'contact')]; }

test('an empty returned form preserves every original field, tag, need, detail and relationship', () => {
  const [d, invite] = existing();
  d.people.contact.email = 'old@example.test'; d.people.contact.phone = '+447700900111';
  const c = d.contributions['contact:1']; c.skills.push('Competenza artigianale'); c.presentation = 'Originale privato';
  c.need = { text: 'Partner per studio', skills: ['Tag su misura'], markets: ['Sanità'], updatedAt: '2026-01-01T00:00:00Z' };
  d.relationships['contact:1'].note = 'Nota personale';
  const before = clone(d); applyProfileResponse(d, filled(invite), '1'); validateNetwork(d);
  const after = clone(d); delete after.contributions['contact:1'].reply; after.contributions['contact:1'].profileRequestId = before.contributions['contact:1'].profileRequestId;
  assert.deepEqual(after, before);
  const p = viewPerson(d, d.people.contact); assert.ok(p.skills.includes('Competenza artigianale')); assert.equal(p.seeking[0].need.text, 'Partner per studio');
});
test('a different offering and different contacts stay separate from the manually mapped knowledge', () => {
  const [d, invite] = existing(); d.people.contact.email = 'old@example.test';
  const before = clone(d.contributions['contact:1']);
  applyProfileResponse(d, filled(invite, { help: 'Realizzo video per studi medici', need: 'Cerco un designer', email: 'new@example.test', name: 'Nome confermato' }), '1');
  for (const k of ['help', 'skills', 'markets', 'interests', 'need', 'presentation']) assert.deepEqual(d.contributions['contact:1'][k], before[k]);
  assert.equal(d.people.contact.email, 'old@example.test'); assert.equal(d.people.contact.name, 'Persona esempio');
  const p = viewPerson(d, d.people.contact); assert.equal(p.email, 'new@example.test'); assert.match(p.declarations[0].help, /video/);
  assert.equal(findPeople(d, '1', { search: 'video', filters: { intent: 'offer' } }).length, 1);
  assert.equal(findPeople(d, '1', { search: 'UX', filters: { intent: 'offer' } }).length, 1);
  const csv = exportCSV(d); assert.match(csv, /Scheda compilata/); assert.match(csv, /Ricerca e servizi/); assert.match(csv, /old@example.test/); assert.match(csv, /new@example.test/);
});
test('the invitation prepopulates only the sender summary and contact fields, excluding private context and other authors', () => {
  const [d] = existing(); d.contributions['contact:1'].presentation = 'TESTO_PRIVATO'; d.relationships['contact:1'].note = 'NOTA_PRIVATA';
  d.relationships['contact:1'].context = 'RELAZIONE_PRIVATA'; d.contributions['contact:2'].help = 'ALTRA_PERSONA';
  d.contributions['contact:1'].need = { text: 'Cerco un videomaker', skills: ['Video'], markets: [], updatedAt: '2026-01-01T00:00:00Z' };
  const invite = profileInvitation(d, '1', 'contact'), url = encodeFormLink(invite, 'https://example.test/networking/');
  assert.equal(invite.prefill.name, d.people.contact.name); assert.equal(invite.prefill.help, d.contributions['contact:1'].help); assert.equal(invite.prefill.need, 'Cerco un videomaker');
  assert.deepEqual(decodeFormLink(url, 'invite'), invite);
  assert.doesNotMatch(JSON.stringify(invite), /TESTO_PRIVATO|NOTA_PRIVATA|RELAZIONE_PRIVATA|ALTRA_PERSONA/);
});
test('a subsequent invitation starts with the last filled form without reviving an omitted need', () => {
  const [d, invite] = existing();
  d.contributions['contact:1'].need = { text: 'Annotazione precedente', skills: [], markets: [], updatedAt: '2026-01-01T00:00:00Z' };
  applyProfileResponse(d, filled(invite, { help: 'Contributo confermato' }), '1'); prepareProfileInvitation(d, '1', 'contact');
  const next = profileInvitation(d, '1', 'contact'); assert.equal(next.prefill.help, 'Contributo confermato'); assert.equal(next.prefill.need, '');
  assert.equal(d.contributions['contact:1'].need.text, 'Annotazione precedente');
});
test('a reusable blank invite does not create a placeholder and adds a person only after confirmation', () => {
  const d = fixture(), count = Object.keys(d.people).length;
  prepareProfileInvitation(d, '1'); const invite = profileInvitation(d, '1'); validateNetwork(d);
  assert.equal(Object.keys(d.people).length, count); assert.ok(Object.values(invite.prefill).every(v => v === '')); assert.equal(invite.personId, 'new');
  const r = filled(invite, { name: 'Nuova persona', help: 'Siti web' }); assert.equal(responseTarget(d, r, '1'), null);
  const personId = applyProfileResponse(d, r, '1'); validateNetwork(d); assert.equal(personId, id); assert.equal(Object.keys(d.people).length, count + 1);
  assert.equal(d.contributions[id + ':1'].reply.help, 'Siti web'); assert.equal(d.relationships[id + ':1'].context, ''); assert.throws(() => applyProfileResponse(d, r, '1'));
  const second = filled(invite, { responseId: another, name: 'Un’altra persona' }); applyProfileResponse(d, second, '1'); validateNetwork(d); assert.equal(Object.keys(d.people).length, count + 2);
});
test('reopening a new-person response after deleting the person cannot restore it silently', () => {
  const d = fixture(); prepareProfileInvitation(d, '1'); const r = filled(profileInvitation(d, '1'), { name: 'Nuova persona' });
  applyProfileResponse(d, r, '1'); deletePerson(d, id); assert.throws(() => responseTarget(d, r, '1'));
});
test('matching contact details suggest an existing person; matching names never silently merge', () => {
  const d = fixture(); d.people.contact.email = 'same@example.test'; prepareProfileInvitation(d, '1'); const invite = profileInvitation(d, '1');
  const r = filled(invite, { email: 'same@example.test' }); assert.equal(responseCandidates(d, r)[0].id, 'contact'); assert.ok(responseCandidates(d, r)[0].exact);
  const old = clone(d.contributions['contact:1']); const linked = applyProfileResponse(d, r, '1', undefined, 'contact'); assert.equal(linked, 'contact'); assert.equal(Object.keys(d.people).length, 3); assert.equal(d.contributions['contact:1'].help, old.help);
  const names = filled(invite, { responseId: another }); assert.equal(responseCandidates(d, names)[0].exact, false); assert.equal(responseTarget(d, names, '1'), null);
  assert.throws(() => responseTarget(d, names, '1', 'github-2'));
});
test('two different returned forms conflict as complete statements while manual observations merge independently', () => {
  const [base, invite] = existing(), a = clone(base), b = clone(base);
  applyProfileResponse(a, filled(invite, { help: 'Video', need: 'Design' }), '1'); applyProfileResponse(b, filled(invite, { responseId: another, help: 'Siti web', need: 'Video' }), '1');
  b.contributions['contact:1'].help = 'Appunto aggiornato';
  const merged = mergeNetworks(base, a, b); assert.equal(merged.conflicts.length, 1); assert.deepEqual(merged.conflicts[0].path, ['contributions', 'contact:1', 'reply']);
  assert.equal(merged.data.contributions['contact:1'].help, 'Appunto aggiornato');
});
test('long prefilled invitations and replies remain intact in WhatsApp and email', () => {
  const [d] = existing(); d.contributions['contact:1'].help = '🚀'.repeat(750); const invite = profileInvitation(d, '1', 'contact');
  const link = encodeFormLink(invite, 'https://example.test/networking/'); assert.ok(link.length > 3000);
  const message = 'Conferma la tua scheda: ' + link;
  assert.equal(new URL(whatsappURL('+447700900111', message)).searchParams.get('text'), message);
  assert.equal(new URL(mailtoURL('example@example.test', 'Scheda', message)).searchParams.get('body'), message);
});
test('new optional fields validate strictly without migrating old data', () => {
  const old = fixture(), before = clone(old); validateNetwork(old); assert.deepEqual(old, before);
  const [d, invite] = existing(); applyProfileResponse(d, filled(invite), '1'); const broken = clone(d); broken.contributions['contact:1'].reply.token = 'secret'; assert.throws(() => validateNetwork(broken));
  const brokenId = clone(d); brokenId.members['1'].profileInviteId = 'broken'; assert.throws(() => validateNetwork(brokenId));
});
