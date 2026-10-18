import test from 'node:test';
import assert from 'node:assert/strict';
import { tagKey, uniqueTags, tagEntries } from '../src/tags.js';
import { suggestedTags, needTags } from '../src/profile.js';

test('one visible tag per label, including old cross-category duplicates', () => {
  const saved = { skills: ['Design', 'Comunicazione'], markets: ['Sanità', 'Design', 'Comunicazione'], interests: [] };
  const before = structuredClone(saved);
  assert.deepEqual(tagEntries(saved), [
    { value: 'Design', categories: ['skills', 'markets'] },
    { value: 'Comunicazione', categories: ['skills', 'markets'] },
    { value: 'Sanità', categories: ['markets'] },
  ]);
  assert.deepEqual(saved, before, 'displaying a single chip preserves the saved classifications');
});

test('case, accents and whitespace cannot create another chip', () => {
  assert.deepEqual(uniqueTags([' Sanità ', 'sanita', 'SANITÀ', 'Design servizi', 'design  servizi', '']), ['Sanità', 'Design servizi']);
  assert.equal(tagKey('  Finanza   agevolata  '), tagKey('finanza agevolata'));
  assert.deepEqual(tagEntries({ skills: ['Sanità', 'SANITA'], markets: [' sanita '] }), [{ value: 'Sanità', categories: ['skills', 'markets'] }]);
});

test('the same tag can independently describe an offer and a request', () => {
  assert.deepEqual(tagEntries({ skills: ['Design'], markets: [] }), [{ value: 'Design', categories: ['skills'] }]);
  assert.deepEqual(needTags('Cerco design per studi medici'), { skills: ['Design'], markets: ['Sanità'], interests: [] });
});

test('a collaboration request gets a relevant tag without claiming an offered skill', () => {
  assert.deepEqual(needTags('Collaborazioni per progetti innovativi'), { skills: ['Collaborazioni'], markets: [], interests: [] });
  assert.ok(needTags('Cerco una collaborazione con un videomaker').skills.includes('Video'));
  assert.ok(needTags('Cerco una collaborazione con un videomaker').skills.includes('Collaborazioni'));
  assert.deepEqual(needTags('Non cerco collaborazioni').skills, []);
  assert.deepEqual(suggestedTags('Cerco una collaborazione con un videomaker').skills, []);
  assert.deepEqual(needTags('Un aiuto da definire'), { skills: [], markets: [], interests: [] });
});

test('a custom tag is recognized even after many unrelated saved tags', () => {
  const pool = { skills: [...Array.from({ length: 80 }, (_, i) => `Competenza esempio ${i}`), 'Restauro tessile'] };
  assert.ok(needTags('Cerco restauro tessile', pool).skills.includes('Restauro tessile'));
  assert.ok(suggestedTags('Restauro tessile', pool).skills.includes('Restauro tessile'));
  assert.equal(needTags(pool.skills.join('; '), pool).skills.length, 40, 'the result still respects the archive limit');
});
