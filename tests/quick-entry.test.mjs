import test from 'node:test';
import assert from 'node:assert/strict';
import { quickPersonFromText } from '../src/profile.js';

test('one note proposes a name, useful skills and explicit acquaintance context', () => {
  const draft = quickPersonFromText('Sofia Verdi — grafica e comunicazione.\nConosciuta a un evento di settore dal 2024.');
  assert.equal(draft.name, 'Sofia Verdi');
  assert.ok(draft.skills.includes('Grafica'));
  assert.ok(draft.skills.includes('Comunicazione'));
  assert.match(draft.context, /evento di settore/);
  assert.equal(draft.since, '2024');
  assert.doesNotMatch(draft.help, /Conosciuta/);
});
test('extracting a meeting sentence leaves clean presentation text', () => {
  const draft = quickPersonFromText('Elena Riva — comunicazione e grafica.\nConosciuta a un evento dal 2024.\nAppassionata di vela.');
  assert.doesNotMatch(draft.help, /^\s*[.!?]\s*$/m);
  assert.match(draft.help, /comunicazione e grafica/);
  assert.ok(draft.interests.includes('Vela'));
});
test('a first name is enough to start; a profile URL never invents the person name', () => {
  assert.equal(quickPersonFromText('Sofia').name, 'Sofia');
  assert.equal(quickPersonFromText('Sofia').help, '');
  assert.equal(quickPersonFromText('https://www.linkedin.com/in/example-person/').name, '');
});
test('skills mentioned only in the meeting context are not assigned to a person', () => {
  const draft = quickPersonFromText('Sofia Verdi — consulente.\nIncontrata a un evento di grafica e comunicazione.');
  assert.deepEqual(draft.skills, []);
  assert.match(draft.context, /grafica e comunicazione/);
});
test('interests and learning goals stay separate from professional abilities', () => {
  const draft = quickPersonFromText('Sofia — comunicazione. Appassionata di vela. Interesse verso finanza agevolata.');
  assert.ok(draft.skills.includes('Comunicazione'));
  assert.ok(draft.interests.includes('Vela'));
  assert.ok(draft.interests.includes('Finanza agevolata'));
  assert.equal(draft.skills.includes('Finanza agevolata'), false);
  assert.equal(draft.level, undefined); assert.equal(draft.collaboration, undefined);
});
test('a meeting day without a year stays literal and does not become a guessed date', () => {
  const draft = quickPersonFromText('Sofia — grafica.\nConosciuta a un incontro il 15/10.');
  assert.match(draft.context, /15\/10/);
  assert.equal(draft.since, '');
});
