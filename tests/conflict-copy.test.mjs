import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConflictValue } from '../src/conflict-copy.js';

const uuid = '9241667f-72b1-44ec-b644-1e854d49936d';
const fields = { name: 'Élia 👋', role: 'Designer', help: 'Video per attività sanitarie', need: '', phone: '+447700900111', email: 'demo@example.test', linkedin: 'https://www.linkedin.com/in/demo/' };
const reply = { ...fields, cardId: uuid, responseId: uuid, updatedAt: '2026-10-18T09:00:00Z' };
const need = { text: 'Uno studio a Cagliari', skills: [], markets: ['Sanità'], updatedAt: '2026-10-18T09:00:00Z', status: 'active' };

test('a received card reads as a profile with Unicode, contact labels and no internal IDs', () => {
  const result = formatConflictValue(reply);
  for (const value of ['Nome: Élia 👋', 'Ruolo: Designer', 'Offre: Video per attività sanitarie', 'Cerca: Non indicato', 'Telefono: +447700900111', 'Email: demo@example.test', 'LinkedIn: https://www.linkedin.com/in/demo/', 'Aggiornata: 18/10/2026']) assert.ok(result.includes(value));
  assert.doesNotMatch(result, /responseId|cardId|updatedAt|9241667f/);
});
test('empty fields are explicit and a complete needs list takes precedence over its legacy text', () => {
  const result = formatConflictValue({ ...fields, name: '', help: '', need: 'Vecchio testo', needs: [], phone: '', email: '', linkedin: '' });
  assert.match(result, /Nome: Non indicato/); assert.match(result, /Offre: Non indicato/); assert.match(result, /Cerca: Non indicato/); assert.match(result, /Recapiti: Non indicati/); assert.doesNotMatch(result, /Vecchio testo/);
});
test('multiple requests, their state and their tags remain distinguishable', () => {
  const result = formatConflictValue({ ...reply, needs: [{ id: uuid, text: 'Un videomaker 🎥' }, { id: 'studio', text: 'Studio in città' }] });
  assert.match(result, /Cerca:\n- Un videomaker 🎥\n- Studio in città/); assert.doesNotMatch(result, /9241667f/);
  assert.equal(formatConflictValue({ a: need, b: { ...need, text: 'Richiesta chiusa', status: 'resolved' }, removed: null }), '- Uno studio a Cagliari · Ambiti: Sanità\n- Richiesta chiusa · Ambiti: Sanità · Non più cercata');
});
test('markup is returned as text for the calling renderer to escape once', () => {
  const result = formatConflictValue({ ...reply, help: '<img src=x onerror="alert(1)"> & attività' });
  assert.ok(result.includes('Offre: <img src=x onerror="alert(1)"> & attività'));
  assert.doesNotMatch(result, /&lt;|&amp;/);
});
test('other known conflict records have readable labels without technical IDs', () => {
  const relationship = { id: uuid, personId: uuid, authorId: '1', context: 'Sardegna Networking', since: '2022', level: 'Buona conoscenza', last: '2026-10-18', note: 'Confronto sui servizi' };
  const result = formatConflictValue(relationship);
  assert.match(result, /Come vi conoscete: Sardegna Networking/); assert.match(result, /Da quando: 2022/); assert.match(result, /Ultimo contatto: 18\/10\/2026/); assert.doesNotMatch(result, /9241667f|authorId/);
  const contribution = { id: uuid, personId: uuid, authorId: '1', help: 'Siti per studi', skills: ['Web'], markets: [], interests: ['Vela'], collaboration: 'Aperto', needs: { studio: need }, reply };
  const summary = formatConflictValue(contribution);
  assert.match(summary, /Competenze: Web/); assert.match(summary, /Interessi: Vela/); assert.match(summary, /Scheda ricevuta:\nNome: Élia/); assert.doesNotMatch(summary, /9241667f|authorId|responseId/);
  assert.equal(formatConflictValue({ id: '1', login: 'demo-user', name: 'Giuseppe', personId: uuid, profileCardId: uuid }), 'Nome: Giuseppe\nAccount: @demo-user');
  assert.match(formatConflictValue({ id: uuid, name: 'Persona', role: 'Designer', memberId: null, createdBy: '1' }), /^Nome: Persona\nRuolo: Designer/);
});
test('a portable card envelope hides its revision and formats the original update date', () => {
  const card = { v: 2, kind: 'card', id: uuid, revision: uuid, updatedAt: '2026-09-20T10:00:00Z', profile: { ...fields, needs: [] } };
  assert.match(formatConflictValue(card), /Aggiornata: 20\/09\/2026/); assert.doesNotMatch(formatConflictValue(card), /9241667f|revision/);
});
test('unknown fields and unknown objects retain their complete JSON without discarding information', () => {
  for (const value of [{ ...reply, futureProperty: { id: uuid, important: '<keep>' } }, { ...reply, help: { unexpected: 'preserva' } }, { text: 'Richiesta', skills: [{ extra: 'preserva' }] }, { text: 'Richiesta', future: ['A', { more: true }] }, { arbitrary: { id: uuid, details: ['α', 'β'] } }, [{ name: 'Oggetto nuovo', extra: true }], {}]) {
    assert.deepEqual(JSON.parse(formatConflictValue(value)), value);
  }
});
test('removed values, scalar values, tag arrays and single requests preserve their meaning', () => {
  assert.equal(formatConflictValue(null), 'Rimosso'); assert.equal(formatConflictValue(undefined), 'Rimosso');
  assert.equal(formatConflictValue(''), 'Vuoto'); assert.equal(formatConflictValue([]), 'Vuoto'); assert.equal(formatConflictValue(['UX', 'Sanità']), 'UX, Sanità');
  assert.equal(formatConflictValue(false), 'false'); assert.equal(formatConflictValue(0), '0');
  assert.equal(formatConflictValue(need), 'Uno studio a Cagliari · Ambiti: Sanità');
});
