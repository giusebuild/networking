import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { validateNetwork, viewPerson, findPeople, matchingNeeds, mergeNetworks, resolveConflicts, exportCSV, clone } from '../src/model.js';
import { needsMap, needEntries, shareNeeds, validateNeeds } from '../src/needs.js';
import { makePersonalCard, personalCardLink, readPersonalCardLink, applyPersonalCard } from '../src/personal-card.js';
import { profileInvitation, prepareProfileInvitation, encodeFormLink, decodeFormLink, applyProfileResponse } from '../src/profile-requests.js';
import { NetworkSync } from '../src/sync.js';
const stamp = '2026-10-18T10:00:00.000Z';
const need = (text, skills = [], markets = []) => ({ text, skills, markets, updatedAt: stamp, status: 'active' });
const multiple = () => { const d = fixture(); d.schemaVersion = 2; d.contributions['contact:1'].needs = { clients: need('Presentazioni a studi medici', [], ['Sanità']), office: need('Uno studio a Cagliari due pomeriggi'), professional: need('Un videomaker', ['Video']) }; return d; };
const fields = () => ({ name: 'Persona esempio', role: '', help: 'Realizzo siti', need: '', phone: '', email: '', linkedin: '' });

test('three different needs survive JSON, keep author and do not become offered skills', () => {
  const d = multiple(); validateNetwork(JSON.parse(JSON.stringify(d)));
  const p = viewPerson(d, d.people.contact); assert.equal(p.seeking.length, 3); assert.ok(p.seeking.every(c => c.authorId === '1')); assert.ok(!p.skills.includes('Video')); assert.ok(p.needSkills.includes('Video'));
  for (const text of ['medici', 'Cagliari', 'videomaker']) assert.equal(findPeople(d, '1', { search: text, filters: { intent: 'need' } }).length, 1);
  const csv = exportCSV(d); for (const n of needEntries(d.contributions['contact:1'])) assert.ok(csv.includes(n.text));
});
test('resolving one need leaves others active; reopening restores only that one', () => {
  const d = multiple(); d.contributions['contact:1'].needs.office.status = 'resolved';
  assert.equal(findPeople(d, '1', { search: 'Cagliari', filters: { intent: 'need' } }).length, 0);
  assert.equal(viewPerson(d, d.people.contact).seeking.length, 2); assert.match(exportCSV(d), /\[Risolta\] Uno studio/);
  d.contributions['contact:1'].needs.office.status = 'active'; assert.equal(viewPerson(d, d.people.contact).seeking.length, 3);
});
test('search and category select a specific need instead of combining unrelated requests', () => {
  const d = multiple(), p = viewPerson(d, d.people.contact);
  assert.deepEqual(matchingNeeds(p, { search: 'Cagliari' }).map(c => c.needId), ['office']);
  assert.equal(findPeople(d, '1', { search: 'Cagliari', filters: { intent: 'need', skills: 'Video' } }).length, 0);
  assert.equal(findPeople(d, '1', { search: 'Cagliari videomaker', filters: { intent: 'need' } }).length, 0);
});
test('different requests merge independently and same-request changes conflict as one statement', () => {
  const base = multiple(), a = clone(base), b = clone(base);
  a.contributions['contact:1'].needs.office.text = 'Studio nel weekend'; b.contributions['contact:1'].needs.clients.text = 'Studi dentistici';
  let merged = mergeNetworks(base, a, b); assert.equal(merged.conflicts.length, 0); validateNetwork(merged.data);
  assert.equal(merged.data.contributions['contact:1'].needs.office.text, 'Studio nel weekend'); assert.equal(merged.data.contributions['contact:1'].needs.clients.text, 'Studi dentistici');
  b.contributions['contact:1'].needs.office.status = 'resolved'; merged = mergeNetworks(base, a, b);
  assert.equal(merged.conflicts.length, 1); assert.deepEqual(merged.conflicts[0].path, ['contributions', 'contact:1', 'needs', 'office']);
  const chosen = resolveConflicts(merged.data, merged.conflicts, ['remote']); assert.equal(chosen.contributions['contact:1'].needs.office.status, 'resolved');
});
test('removed requests stay deleted across stale devices and edits require a choice', () => {
  const base = multiple(), a = clone(base), b = clone(base); a.contributions['contact:1'].needs.office = null;
  assert.equal(mergeNetworks(base, a, b).data.contributions['contact:1'].needs.office, null);
  b.contributions['contact:1'].needs.office.text = 'Altro studio'; assert.equal(mergeNetworks(base, a, b).conflicts.length, 1);
});
test('legacy text is one intact need, and a racing legacy edit is never hidden', () => {
  const base = fixture(); base.contributions['contact:1'].need = { text: 'Studio, clienti\ne un confronto', skills: [], markets: [], updatedAt: stamp };
  const a = clone(base), b = clone(base); a.schemaVersion = 2; a.contributions['contact:1'].needs = needsMap(a.contributions['contact:1']); a.contributions['contact:1'].needs.legacy.text = 'Testo cambiato';
  b.contributions['contact:1'].need.text = 'Aggiornamento vecchio telefono';
  assert.equal(needEntries(base.contributions['contact:1']).length, 1);
  const merged = mergeNetworks(base, a, b); assert.equal(merged.conflicts.length, 1); assert.equal(merged.conflicts[0].path.at(-1), 'legacy');
  assert.equal(resolveConflicts(merged.data, merged.conflicts, ['remote']).contributions['contact:1'].needs.legacy.text, 'Aggiornamento vecchio telefono');
});
test('single legacy update racing a list addition is merged into the first need', () => {
  const base = fixture(); base.contributions['contact:1'].need = { text: 'Originale', skills: [], markets: [], updatedAt: stamp };
  const a = clone(base), b = clone(base); a.schemaVersion = 2; a.contributions['contact:1'].needs = { ...needsMap(a.contributions['contact:1']), office: need('Studio') }; b.contributions['contact:1'].need.text = 'Nuovo originale';
  const merged = mergeNetworks(base,a,b); assert.equal(merged.conflicts.length, 0); assert.equal(merged.data.contributions['contact:1'].needs.legacy.text, 'Nuovo originale'); assert.ok(merged.data.contributions['contact:1'].needs.office);
});
test('needs must use the protected archive format and reject unsafe or invalid structures', () => {
  const d = multiple(); d.schemaVersion = 1; assert.throws(() => validateNetwork(d));
  for (const map of [{ bad: { ...need('Test'), status: 'unknown' } }, { bad: { ...need('Test'), token: 'secret' } }, JSON.parse('{"__proto__":null}'), { bad: { ...need('Test'), updatedAt: 'ieri' } }]) assert.throws(() => validateNeeds(map));
});
test('portable profiles preserve all active need IDs, exclude resolved entries, read old links', () => {
  const d = multiple(); d.contributions['contact:1'].needs.office.status = 'resolved';
  const card = makePersonalCard({ ...fields(), needs: shareNeeds(d.contributions['contact:1']) }); assert.equal(card.v, 2);
  const reread = readPersonalCardLink(personalCardLink(card, 'https://example.test/networking/')); assert.deepEqual(reread, card); assert.deepEqual(card.profile.needs.map(n => n.id), ['clients', 'professional']);
  const legacy = makePersonalCard({ ...fields(), need: 'Testo precedente' }); assert.equal(readPersonalCardLink(personalCardLink(legacy, 'https://example.test/')).v, 1);
});
test('old portable profiles and responses cannot wipe a newer declared list or manual observations', () => {
  const d = multiple(), manual = clone(d.contributions['contact:1'].needs), card = makePersonalCard({ ...fields(), needs: [{ id: 'studio', text: 'Uno studio' }, { id: 'video', text: 'Un videomaker' }] });
  applyPersonalCard(d,card,'1','contact'); const next = makePersonalCard({ ...fields(), need: '' }, card, { id: card.id }); applyPersonalCard(d,next,'1','contact');
  assert.equal(d.contributions['contact:1'].reply.needs.length, 2); assert.deepEqual(d.contributions['contact:1'].needs, manual); validateNetwork(d);
  prepareProfileInvitation(d,'1','contact'); const i = profileInvitation(d,'1','contact'); assert.equal(i.v,3); assert.equal(i.prefill.needs.length,2); assert.deepEqual(decodeFormLink(encodeFormLink(i,'https://example.test/'),'invite'),i);
  const response = { ...fields(), v:2,kind:'response',personId:'contact',authorId:'1',requestId:i.requestId,responseId:crypto.randomUUID() }; applyProfileResponse(d,response,'1'); assert.equal(d.contributions['contact:1'].reply.needs.length,2); validateNetwork(d);
});
test('new invitation responses round-trip and preserve each request through confirmation', () => {
  const d = multiple(); prepareProfileInvitation(d,'1','contact'); const i = profileInvitation(d,'1','contact'); assert.equal(i.prefill.needs.length,3);
  const response = { ...fields(), needs:i.prefill.needs, v:3,kind:'response',personId:'contact',authorId:'1',requestId:i.requestId,responseId:crypto.randomUUID() };
  const parsed = decodeFormLink(encodeFormLink(response,'https://example.test/'),'response'); applyProfileResponse(d,parsed,'1'); validateNetwork(d); assert.equal(d.contributions['contact:1'].reply.needs.length,3);
});
test('sync persists independent requests and pulls changes without replacing the other need', async () => {
  const base = multiple(); let remote = clone(base); const sync = new NetworkSync({ read: async()=>({data:remote,sha:'s1'}),write:async d=>{remote=clone(d);return 's2';} },{base,local:base,sha:'s1'});
  sync.edit(d=>{d.contributions['contact:1'].needs.office.status='resolved';});remote.contributions['contact:1'].needs.clients.text='Nuovi contatti';await sync.sync();assert.equal(sync.status,'saved');assert.equal(remote.contributions['contact:1'].needs.office.status,'resolved');assert.equal(remote.contributions['contact:1'].needs.clients.text,'Nuovi contatti');
});
