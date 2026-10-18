import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { canCloseNeed } from '../src/needs.js';

test('closing a need belongs to its subject, not to the author of a contact note', () => {
  const d = fixture(), owner = d.people[d.members['1'].personId], teammate = d.people[d.members['2'].personId];
  assert.equal(canCloseNeed(owner, { authorId: '1' }, '1'), true);
  assert.equal(canCloseNeed(d.people.contact, d.contributions['contact:1'], '1'), false, 'creating the contact or annotation does not make its needs mine');
  assert.equal(canCloseNeed(teammate, { authorId: '1' }, '1'), false, 'knowing a teammate does not grant closure');
  assert.equal(canCloseNeed(owner, { authorId: '2' }, '1'), false, 'another person’s observation is not a self declaration');
  assert.equal(canCloseNeed(owner, { authorId: '1', reported: true }, '1'), false, 'a received statement is not rewritten by a note author');
  assert.equal(canCloseNeed({}, {}, undefined), false);
});
