import test from 'node:test';
import assert from 'node:assert/strict';
import { compactShareLink, expandShareText, CHAT_LINK_LIMIT, makeShareFile, readShareFile, canShareFile } from '../src/share-transport.js';
import { makePersonalCard, personalCardLink, readPersonalCardLink } from '../src/personal-card.js';
import { encodeFormLink, decodeFormLink, prepareProfileInvitation, profileInvitation } from '../src/profile-requests.js';
import { isShareRoute } from '../src/share-links.js';
import { responseMessage } from '../src/response-message.js';
import { fixture } from './fixture.mjs';

const base = 'https://example.test/networking/?not-shared=1';
const fields = () => ({ name: 'Sofía Èsempio', role: 'Design e ricerca', help: 'Aiuto gli studi medici con siti accessibili 🚀.\nTesto al 50% /a%2Fb.', need: '', needs: [{ id: 'video', text: 'Un videomaker' }, { id: 'studio', text: 'Uno studio a Cagliari' }], email: 'sofia@example.test', phone: '', linkedin: '' });
const cardLink = () => personalCardLink(makePersonalCard(fields()), base);
function reply() {
  const d = fixture(); prepareProfileInvitation(d, '1');
  const invitation = profileInvitation(d, '1');
  return { v: 3, kind: 'response', personId: 'new', authorId: '1', requestId: invitation.requestId, responseId: crypto.randomUUID(), ...fields() };
}
test('compact reply is shorter, starts the readable message and round-trips every field', async () => {
  const r = reply(), original = encodeFormLink(r, base), compact = await compactShareLink(original);
  assert.ok(compact.length < original.length); assert.ok(compact.length < CHAT_LINK_LIMIT);
  assert.match(compact, /#\/r\/z\/[A-Za-z0-9_-]+\//);
  const url = new URL(compact); assert.equal(url.search, ''); assert.equal(url.pathname, '/networking/');
  assert.ok(url.hash.split('/').slice(3).every(s => s.length <= 48));
  assert.equal(isShareRoute(url.hash, ['card', 'response']), true);
  const message = responseMessage(r, compact); assert.ok(message.startsWith(compact + '\n'));
  assert.deepEqual(decodeFormLink(await expandShareText(message), 'response'), r);
});
test('compact personal cards and both invitation formats retain their identities and data', async () => {
  const original = cardLink(), compact = await compactShareLink(original);
  assert.deepEqual(readPersonalCardLink(await expandShareText(compact)), readPersonalCardLink(original));
  const d = fixture(); prepareProfileInvitation(d, '1'); prepareProfileInvitation(d, '1', 'contact');
  for (const person of ['new', 'contact']) {
    const i = profileInvitation(d, '1', person), link = await compactShareLink(encodeFormLink(i, base));
    assert.equal(isShareRoute(new URL(link).hash, ['invite', 'i']), true);
    assert.deepEqual(decodeFormLink(await expandShareText(link), 'invite'), i);
  }
});
test('copy wrappers, line wraps and transport escaping retain compact Unicode cards', async () => {
  const original = cardLink(), compact = await compactShareLink(original), expected = readPersonalCardLink(original);
  const wrapped = compact.replace(/\/(.{48})(?=\/)/g, '/$1\r\n');
  for (const text of [`[Scheda](${compact}).`, encodeURIComponent(compact), encodeURIComponent(encodeURIComponent(compact)), wrapped, compact.replace(/\//g, '/\u00AD')]) {
    assert.deepEqual(readPersonalCardLink(await expandShareText(text)), expected);
  }
});
test('legacy responses from copied, hyphenated chat messages remain readable', async () => {
  const r = reply(), original = encodeFormLink(r, base);
  const wrapped = original.replace(/(#response=)(.+)/, (_, marker, token) => marker + token.match(/.{1,43}/g).join('-\n'));
  assert.deepEqual(decodeFormLink(await expandShareText(wrapped), 'response'), r);
  assert.equal(await expandShareText(original), original);
});
test('distinct compact/legacy cards are rejected instead of silently picking one', async () => {
  const a = reply(), b = { ...a, name: 'Altra persona', responseId: crypto.randomUUID() };
  const one = await compactShareLink(encodeFormLink(a, base)), two = encodeFormLink(b, base);
  assert.throws(() => decodeFormLink('', 'response'));
  const text = await expandShareText(one + '\n\n' + two);
  assert.throws(() => decodeFormLink(text, 'response'), /più schede/);
  assert.deepEqual(decodeFormLink(await expandShareText(one + '\n\n' + one), 'response'), a);
});
test('damaged compressed payloads and oversized decompressed content cannot become profiles', async () => {
  const compact = await compactShareLink(cardLink());
  for (const bad of [compact.slice(0, -15), '#/c/z/not-a-deflate-stream', '#/c/u/aaaa']) await assert.rejects(expandShareText(bad), /incompleto|leggibile/);
  const huge = new TextEncoder().encode(JSON.stringify({ text: 'a'.repeat(50000) }));
  const compressed = new Uint8Array(await new Response(new Blob([huge]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  await assert.rejects(expandShareText('#/c/z/' + Buffer.from(compressed).toString('base64url')), /incompleto|leggibile/);
});
test('without compression, segmented links still work and long links use the file policy', async () => {
  const saved = globalThis.CompressionStream; globalThis.CompressionStream = undefined;
  try {
    const original = cardLink(), link = await compactShareLink(original);
    assert.match(link, /#\/c\/u\//);
    assert.deepEqual(readPersonalCardLink(await expandShareText(link)), readPersonalCardLink(original));
    const long = makePersonalCard({ ...fields(), help: 'Parole diverse per descrivere attività e servizi. '.repeat(25) });
    const longLink = await compactShareLink(personalCardLink(long, base));
    assert.ok(longLink.length > CHAT_LINK_LIMIT);
    const file = makeShareFile(personalCardLink(long, base), long.profile.name);
    assert.deepEqual(readPersonalCardLink(await readShareFile(file)), long);
  } finally { globalThis.CompressionStream = saved; }
});
test('file transport keeps a full legacy card and accepts only the dedicated wrapper', async () => {
  const link = cardLink(), file = makeShareFile(link, '../Sofía Èsempio /');
  assert.equal(file.name, 'Sofía-Èsempio.tramite.json'); assert.equal(file.type, 'application/json');
  assert.equal(await readShareFile(file), link);
  assert.equal(canShareFile(file, { share() {}, canShare: () => true }), true);
  assert.equal(canShareFile(file, { share() {}, canShare: () => { throw Error(); } }), false);
  for (const text of ['not-json', '{}', JSON.stringify({ tramite: 1, link, token: 'no' }), JSON.stringify({ tramite: 2, link })]) await assert.rejects(readShareFile(new File([text], 'bad.json')));
  await assert.rejects(readShareFile({ size: 50001 }), /troppo grande/);
  const invalid = await readShareFile(makeShareFile('https://example.test/not-a-profile', 'Name'));
  assert.throws(() => readPersonalCardLink(invalid));
});
