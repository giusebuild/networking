import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLinkedIn, suggestedTags, draftFromText } from '../src/profile.js';
import { validateNetwork, clone, mergeNetworks, exportCSV, findPeople } from '../src/model.js';
import { fixture } from './fixture.mjs';

test('LinkedIn reference is normalized and tracking parameters are removed', () => {
  assert.equal(normalizeLinkedIn('linkedin.com/in/persona-demo?utm_source=example'), 'https://www.linkedin.com/in/persona-demo/');
  assert.equal(normalizeLinkedIn('http://it.linkedin.com/in/persona-demo/'), 'https://www.linkedin.com/in/persona-demo/');
  assert.equal(normalizeLinkedIn(''), '');
});
test('unsafe hosts, URLs, credentials and non-person pages are rejected', () => {
  for (const value of ['javascript:alert(1)', 'https://linkedin.com.evil.test/in/name', 'https://evil.linkedin.com/in/name', 'https://one:secret@linkedin.com/in/name', 'https://linkedin.com/company/example', 'https://linkedin.com/in/name%2fextra', 'https://linkedin.com/in/%zz']) assert.throws(() => normalizeLinkedIn(value));
});
test('a URL alone never produces a made-up name, headline or skill', () => {
  const draft = draftFromText('', 'linkedin.com/in/this-is-not-a-verified-name');
  assert.equal(draft.name, ''); assert.equal(draft.role, ''); assert.equal(draft.help, ''); assert.deepEqual(draft.skills, []);
});
test('professional activities and personal interests stay separate in a draft', () => {
  const text = 'Persona Demo - si occupa di comunicazione, grafica e 3D - appassionato di vela - interesse verso finanza agevolata';
  const draft = draftFromText(text);
  assert.equal(draft.name, 'Persona Demo'); assert.ok(draft.skills.includes('3D'));
  assert.ok(draft.interests.includes('Vela')); assert.ok(draft.interests.includes('Finanza agevolata'));
  assert.equal(draft.skills.includes('Finanza agevolata'), false);
  assert.equal(draft.markets.includes('Nautica'), false);
});
test('explicit sections provide editable fields and selected tags', () => {
  const d = draftFromText('Nome: Persona Demo\nRuolo: Designer\nDescrizione: Aiuto a progettare servizi.\nCompetenze: UX/UI, Ricerca utenti\nSettori: Digitale\nInteressi: Musica');
  assert.equal(d.name, 'Persona Demo'); assert.equal(d.role, 'Designer'); assert.equal(d.help, 'Aiuto a progettare servizi.');
  assert.deepEqual(d.skills, ['UX/UI', 'Ricerca utenti']); assert.deepEqual(d.markets, ['Digitale']); assert.deepEqual(d.interests, ['Musica']);
});
test('a copied profile name and headline become a draft without inventing a summary', () => {
  const d = draftFromText('Persona Demo\nProduct designer\nProgetto esperienze digitali semplici.');
  assert.equal(d.name, 'Persona Demo'); assert.equal(d.role, 'Product designer'); assert.equal(d.help, 'Progetto esperienze digitali semplici.');
  const short = draftFromText('Persona Demo\nProduct designer'); assert.equal(short.help, '');
});
test('ordinary descriptive sentences are not mistaken for a person name', () => {
  const d = draftFromText('Esperienza nella ricerca utenti\nCollaborazioni in diversi settori');
  assert.equal(d.name, ''); assert.equal(d.help, 'Ricerca utenti'); assert.match(d.presentation, /Esperienza nella ricerca utenti/);
});
test('a copied profile can have a name and headline before an About heading', () => {
  const d = draftFromText('Persona Demo\nProduct designer\nInformazioni\nProgetto servizi digitali.\nCompetenze\nUX/UI\nRicerca utenti');
  assert.equal(d.name, 'Persona Demo'); assert.equal(d.role, 'Product designer'); assert.equal(d.help, 'Progetto servizi digitali.');
  assert.deepEqual(d.skills, ['UX/UI', 'Ricerca utenti']);
});
test('a profile link pasted within text becomes a normalized reference', () => {
  const d = draftFromText('Nome: Persona Demo\nhttps://linkedin.com/in/persona-demo?track=example\nDescrizione: Progetto servizi.');
  assert.equal(d.linkedin, 'https://www.linkedin.com/in/persona-demo/'); assert.equal(d.help, 'Progetto servizi.');
});
test('learning goals, negative statements and passions are not professional skill assertions', () => {
  const tags = suggestedTags('Vorrei imparare Python - non ho competenze SQL - appassionato di AI');
  assert.deepEqual(tags.skills, []); assert.ok(tags.interests.includes('AI'));
});
test('a draft never assigns relationship strength, acquaintance dates or availability', () => {
  const d = draftFromText('Persona Demo - Project management. Conosciuto a un evento, persona energica.');
  for (const key of ['level', 'since', 'last', 'collaboration']) assert.equal(Object.hasOwn(d, key), false);
});
test('large pasted texts are bounded and the shortened draft is indicated', () => {
  const d = draftFromText('Una descrizione libera. '.repeat(1000)); assert.equal(d.help, ''); assert.equal(d.presentation.length, 5000); assert.ok(d.shortened);
});
test('legacy data remains valid without adding or migrating a LinkedIn field', () => {
  const d = fixture(), before = clone(d); validateNetwork(d); assert.deepEqual(d, before);
});
test('optional LinkedIn reference participates in sync, search and CSV export', () => {
  const base = fixture(), local = clone(base), remote = clone(base);
  local.people.contact.linkedin = normalizeLinkedIn('linkedin.com/in/persona-demo'); remote.people.contact.role = 'Aggiornato';
  const result = mergeNetworks(base, local, remote); assert.equal(result.conflicts.length, 0); validateNetwork(result.data);
  assert.equal(result.data.people.contact.role, 'Aggiornato'); assert.ok(exportCSV(result.data).includes('/in/persona-demo/'));
  assert.equal(findPeople(result.data, '1', { search: 'persona-demo' }).length, 1);
});
test('invalid imported LinkedIn links fail validation', () => {
  const d = fixture(); d.people.contact.linkedin = 'https://example.com/in/person'; assert.throws(() => validateNetwork(d));
});
