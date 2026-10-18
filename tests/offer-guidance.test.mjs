import test from 'node:test';
import assert from 'node:assert/strict';
import { offerGuidance } from '../src/offer-guidance.js';

test('writing prompts invite a concrete activity without rejecting short or unknown offers', () => {
  assert.match(offerGuidance(''), /attività concreta/);
  assert.match(offerGuidance('Marketing digitale'), /potrebbe realizzare/);
  assert.match(offerGuidance('Marketing digitale', true), /potresti realizzare/);
  assert.match(offerGuidance('Realizzo siti web'), /Per chi/);
  assert.equal(offerGuidance('Realizzo siti con prenotazioni per studi medici'), '');
  assert.equal(offerGuidance('Metto in contatto con aziende del territorio.'), '');
  assert.equal(offerGuidance('Consulenza specialistica su strumenti e procedure di un settore particolare'), '');
  assert.equal(offerGuidance('C++.'), '');
});
