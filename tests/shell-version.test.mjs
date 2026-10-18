import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureShellVersion } from '../src/shell-version.js';

test('matching HTML mounts without navigation; a release retry cleans only its own query', async () => {
  const document = { querySelector: () => ({ content: '1.14.1' }) };
  let cleaned;
  const window = { location: { href: 'https://example.test/networking/?mode=test&_release=1.14.1#response=keep-me', replace: () => assert.fail('unexpected navigation') }, history: { replaceState: (_, __, value) => { cleaned = value; } } };
  await ensureShellVersion({ version: '1.14.1', document, window });
  assert.equal(cleaned, '/networking/?mode=test#response=keep-me');
});

test('a cached old page reloads before mounting, preserving invitation, query and response', () => {
  for (const fragment of ['#i=invitation', '#response=reply', '#card=profile']) {
    const document = { querySelector: () => ({ content: '1.13.1' }) };
    let target;
    const window = { location: { href: 'https://example.test/networking/?mode=test' + fragment, replace: value => { target = new URL(value); } } };
    void ensureShellVersion({ version: '1.14.1', document, window });
    assert.equal(target.hash, fragment); assert.equal(target.searchParams.get('mode'), 'test'); assert.equal(target.searchParams.get('_release'), '1.14.1');
  }
});

test('a still-propagating release offers retry instead of an automatic reload loop', () => {
  let replacement;
  const element = () => ({ addEventListener() {}, append(...children) { this.children = children; } });
  const document = { querySelector: () => ({ content: '1.13.1' }), createElement: element, body: { replaceChildren: main => { replacement = main; } } };
  const window = { location: { href: 'https://example.test/networking/?_release=1.14.1#response=keep-me', replace: () => assert.fail('reload loop') } };
  void ensureShellVersion({ version: '1.14.1', document, window });
  assert.equal(replacement.children[0].textContent, 'Aggiornamento in corso'); assert.equal(replacement.children[2].textContent, 'Ricarica');
});
