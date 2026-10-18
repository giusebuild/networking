import test from 'node:test';
import assert from 'node:assert/strict';
import { personContactActions } from '../src/contacts.js';

const contact = () => ({ id: 'example', name: 'Persona demo', memberId: null, createdBy: '1', relationships: [{ authorId: '1' }], phone: '+447700900111', linkedin: 'linkedin.com/in/persona-esempio?tracking=remove' });

test('a known contact has direct WhatsApp and LinkedIn actions', () => {
  const actions = personContactActions(contact(), '1');
  assert.deepEqual(actions.map(a => a.type), ['whatsapp', 'linkedin']);
  assert.equal(actions[1].href, 'https://www.linkedin.com/in/persona-esempio/');
  const whatsapp = new URL(actions[0].href);
  assert.equal(whatsapp.pathname, '/447700900111');
  assert.match(whatsapp.searchParams.get('text'), /Persona demo/);
});

test('a teammate contact keeps the introduction route instead of a direct phone CTA', () => {
  const actions = personContactActions(contact(), '2');
  assert.deepEqual(actions.map(a => a.type), ['introduction', 'linkedin']);
  assert.equal(actions[0].authorId, '1');
  assert.equal(actions.some(a => a.href?.includes('wa.me')), false);
});

test('a name-only contact can add contact details without requiring them at creation', () => {
  const person = contact(); delete person.phone; delete person.linkedin;
  assert.deepEqual(personContactActions(person, '1'), [{ type: 'add-contact' }]);
  person.memberId = '3';
  assert.deepEqual(personContactActions(person, '2'), [{ type: 'add-relationship' }]);
  assert.deepEqual(personContactActions(person, '3'), [{ type: 'add-contact' }]);
});

test('a LinkedIn-only contact needs no phone and a phone-only contact needs no LinkedIn', () => {
  const person = contact(); delete person.phone;
  assert.deepEqual(personContactActions(person, '1').map(a => a.type), ['linkedin']);
  delete person.linkedin; person.phone = '+447700900111';
  assert.deepEqual(personContactActions(person, '1').map(a => a.type), ['whatsapp']);
});

test('an unsafe imported profile URL cannot become a contact action', () => {
  const person = contact(); person.linkedin = 'https://linkedin.com.evil.test/in/profile';
  assert.throws(() => personContactActions(person, '1'));
});
