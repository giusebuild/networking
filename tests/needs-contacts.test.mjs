import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { clone, makeNeed, validateNetwork, findPeople, mergeNetworks, resolveConflicts, exportCSV } from '../src/model.js';
import { quickPersonFromText, suggestedTags, needTags } from '../src/profile.js';
import { normalizePhone, whatsappURL, parseVCards } from '../src/contacts.js';
import { NetworkSync } from '../src/sync.js';

const tags = { skills: ['Video'], markets: ['Sanità'] };
const firstDate = '2026-10-18T00:00:00.000Z', secondDate = '2026-10-19T00:00:00.000Z';
test('old archives validate unchanged and new optional needs and phone round-trip', () => {
  const d = fixture(), before = clone(d); validateNetwork(d); assert.deepEqual(d, before);
  d.contributions['contact:1'].need = makeNeed(undefined, 'Cerco un videomaker', tags, firstDate);
  d.people.contact.phone = '+390701234567';
  assert.deepEqual(validateNetwork(JSON.parse(JSON.stringify(d))), d);
  assert.match(exportCSV(d), /Cerco un videomaker/); assert.match(exportCSV(d), /\+390701234567/);
});
test('need date changes for the request, never for an unrelated profile save', () => {
  const previous = makeNeed(undefined, 'Cerco un videomaker', tags, firstDate);
  assert.deepEqual(makeNeed(previous, ' Cerco un videomaker ', tags, secondDate), previous);
  assert.equal(makeNeed(previous, 'Cerco un grafico', tags, secondDate).updatedAt, secondDate);
  assert.equal(makeNeed(previous, '', tags), null);
  assert.equal(makeNeed(undefined, '', tags), undefined);
});
test('search distinguishes a requested skill from an offered skill', () => {
  const d = fixture(); d.contributions['contact:1'].need = makeNeed(undefined, 'Un videomaker per le cliniche', tags, firstDate);
  assert.equal(findPeople(d, '1', { search: 'Video' }).length, 1);
  assert.equal(findPeople(d, '1', { search: 'Video', filters: { intent: 'need' } }).length, 1);
  assert.equal(findPeople(d, '1', { search: 'Video', filters: { intent: 'offer' } }).length, 0);
  assert.equal(findPeople(d, '1', { filters: { skills: 'Video', intent: 'need' } }).length, 1);
  assert.equal(findPeople(d, '1', { filters: { skills: 'Video', intent: 'offer' } }).length, 0);
});
test('a need-only contact is discoverable without inventing an offering', () => {
  const d = fixture(); for (const c of Object.values(d.contributions)) { c.help = ''; c.skills = []; c.markets = []; }
  d.contributions['contact:1'].need = makeNeed(undefined, 'Cerco un videomaker', tags, firstDate);
  assert.equal(findPeople(d, '1', { filters: { intent: 'need' } }).length, 1);
  assert.equal(findPeople(d, '1', { filters: { intent: 'offer' } }).length, 0);
});
test('offer edit and concurrent request edit merge without losing either', () => {
  const base = fixture(), local = clone(base), remote = clone(base);
  local.contributions['contact:1'].help = 'Realizzo siti web';
  remote.contributions['contact:1'].need = makeNeed(undefined, 'Cerco video', tags, firstDate);
  const result = mergeNetworks(base, local, remote); assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.contributions['contact:1'].help, 'Realizzo siti web'); assert.ok(result.data.contributions['contact:1'].need);
});
test('two different requests produce one coherent human choice including tags and date', () => {
  const base = fixture(); base.contributions['contact:1'].need = makeNeed(undefined, 'Cerco video', tags, firstDate);
  const local = clone(base), remote = clone(base);
  local.contributions['contact:1'].need = makeNeed(base.contributions['contact:1'].need, 'Cerco design', { skills: ['Design'], markets: [] }, secondDate);
  remote.contributions['contact:1'].need = null;
  const merged = mergeNetworks(base, local, remote); assert.equal(merged.conflicts.length, 1); assert.equal(merged.conflicts[0].path.at(-1), 'need');
  assert.equal(resolveConflicts(merged.data, merged.conflicts, ['remote']).contributions['contact:1'].need, null);
  assert.equal(resolveConflicts(merged.data, merged.conflicts, ['local']).contributions['contact:1'].need.skills[0], 'Design');
});
test('new request survives a SHA race and uses the existing sync mechanism', async () => {
  const initial = fixture(); let remote = clone(initial), attempts = 0;
  const api = { read: async () => ({ data: clone(remote), sha: String(attempts) }), write: async d => { if (++attempts === 1) { remote.people.contact.role = 'Nuovo ruolo'; throw Object.assign(new Error('race'), { status: 409 }); } remote = clone(d); return 'saved'; } };
  const sync = new NetworkSync(api, { base: initial, local: initial, sha: '0' });
  sync.edit(d => { d.contributions['contact:1'].need = makeNeed(undefined, 'Cerco video', tags, firstDate); });
  await sync.sync(); assert.equal(sync.status, 'saved'); assert.equal(remote.people.contact.role, 'Nuovo ruolo'); assert.equal(remote.contributions['contact:1'].need.text, 'Cerco video');
});
test('invalid dates, hidden fields and unsafe phone values are rejected', () => {
  for (const change of [d => { d.contributions['contact:1'].need = { text: 'Need', ...tags, updatedAt: 'ieri' }; }, d => { d.people.contact.phone = 'javascript:alert(1)'; }, d => { d.contributions['contact:1'].need = { text: 'Need', ...tags, updatedAt: firstDate, token: 'hidden' }; }]) {
    const d = fixture(); change(d); assert.throws(() => validateNetwork(d));
  }
});
test('quick notes split explicit needs and never turn them into offered abilities', () => {
  const d = quickPersonFromText('Sofia Verdi — realizza siti per studi medici. Cerca un videomaker. Appassionata di vela.');
  assert.equal(d.name, 'Sofia Verdi'); assert.match(d.help, /realizza siti/); assert.doesNotMatch(d.help, /videomaker/);
  assert.match(d.need, /videomaker/); assert.ok(d.needTags.skills.includes('Video')); assert.ok(d.markets.includes('Sanità')); assert.ok(d.interests.includes('Vela')); assert.ok(!d.skills.includes('Video'));
  assert.equal(suggestedTags('Cerco un videomaker').skills.includes('Video'), false);
  assert.ok(needTags('Vorrei imparare Python').skills.includes('Python'));
});
test('explicit offer and need headings prefill independent texts', () => {
  const d = quickPersonFromText('Nome: Sofia Verdi\nPuò aiutare con: Grafica per studi medici\nCerca: Un videomaker');
  assert.equal(d.help, 'Grafica per studi medici'); assert.equal(d.need, 'Un videomaker'); assert.ok(d.needTags.skills.includes('Video')); assert.ok(!d.skills.includes('Video'));
});
test('a name followed by only a request stays a need-only draft', () => {
  const d = quickPersonFromText('Sofia Verdi\nCerco un videomaker');
  assert.equal(d.role, ''); assert.equal(d.help, ''); assert.match(d.need, /videomaker/); assert.ok(d.needTags.skills.includes('Video')); assert.deepEqual(d.skills, []);
});
test('a name or LinkedIn URL cannot manufacture a skill from its words', () => {
  assert.deepEqual(quickPersonFromText('Python Rossi').skills, []);
  const d = quickPersonFromText('https://www.linkedin.com/in/python-marketing/');
  assert.deepEqual(d.skills, []); assert.equal(d.help, ''); assert.equal(d.name, '');
});
test('phone normalization preserves Italian fixed line zero and rejects injected URLs', () => {
  assert.equal(normalizePhone('0039 070 1234567'), '+390701234567');
  assert.equal(normalizePhone('+44 (7700) 900111'), '+447700900111');
  for (const x of ['javascript:alert(1)', '+39/not-a-number', '123', '+1234567890123456']) assert.throws(() => normalizePhone(x));
  const url = new URL(whatsappURL('+447700900111', 'Ciao & grazie?')); assert.equal(url.hostname, 'wa.me'); assert.equal(url.searchParams.get('text'), 'Ciao & grazie?'); assert.equal(url.pathname, '/447700900111');
});
test('vCard imports only explicit names and numbers, including folded Unicode names', () => {
  const cards = parseVCards('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Sofìa\r\n  Verdi\r\nTEL;TYPE=CELL:+44 7700 900111\r\nNOTE:secret ignored\r\nEMAIL:ignored@example.test\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nN:Riva;Luca;;;\r\nTEL;VALUE=uri:tel:+447700900222\r\nEND:VCARD');
  assert.equal(cards[0].name, 'Sofìa Verdi'); assert.deepEqual(cards[0].phones, ['+447700900111']); assert.deepEqual(Object.keys(cards[0]).sort(), ['name', 'phones']); assert.equal(cards[1].name, 'Luca Riva');
  assert.throws(() => parseVCards('not a vcard')); assert.throws(() => parseVCards('x'.repeat(900001)));
});
