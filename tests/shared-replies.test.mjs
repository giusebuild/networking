import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { prepareProfileInvitation, profileInvitation, encodeFormLink, decodeFormLink } from '../src/profile-requests.js';
import { makePersonalCard, personalCardLink, readPersonalCardLink } from '../src/personal-card.js';
import { responseMessage } from '../src/response-message.js';
import { isShareRoute } from '../src/share-links.js';

const base = 'https://example.test/networking/';
const fields = () => ({ name: 'Sofía Èsempio', role: 'Design e ricerca', help: 'Aiuto le attività in sanità.\nCreo siti accessibili 🚀; uso URL come /a%2Fb e tariffe al 50%.', need: '', needs: [{ id: 'video', text: 'Un videomaker per studi medici' }, { id: 'studio', text: 'Uno studio a Cagliari due pomeriggi a settimana' }], email: 'sofia@example.test', phone: '', linkedin: '' });
function reply() {
  const d = fixture(); prepareProfileInvitation(d, '1', 'contact');
  const i = profileInvitation(d, '1', 'contact');
  return { v: 3, kind: 'response', personId: i.personId, authorId: i.authorId, requestId: i.requestId, responseId: crypto.randomUUID(), ...fields() };
}

test('a reply is readable in chat and the whole copied message opens the exact profile', () => {
  const value = reply(), link = encodeFormLink(value, base), message = responseMessage(value, link);
  assert.ok(message.includes(value.name)); assert.ok(message.includes(value.help));
  for (const n of value.needs) assert.ok(message.includes('• ' + n.text));
  assert.ok(message.includes(value.email)); assert.ok(message.startsWith(link + '\n'));
  assert.deepEqual(decodeFormLink(message, 'response'), value);
  assert.doesNotMatch(message.slice(link.length), /authorId|requestId|responseId/);
});

test('copying punctuation, Markdown or a message header does not break the received link', () => {
  const value = reply(), link = encodeFormLink(value, base);
  for (const copied of [`[15:12] Sofia: Ecco la scheda:\n${link}\nGrazie!`, `[Apri la scheda](${link}).`, `<${link}>`, `«${link}»`, `Ecco qui: ${link}.`]) assert.deepEqual(decodeFormLink(copied, 'response'), value);
});

test('mail/transport encoding is removed without decoding percent signs inside the person’s text', () => {
  const value = reply(), link = encodeFormLink(value, base);
  for (const copied of [encodeURIComponent(link), encodeURIComponent(encodeURIComponent(link)), `https://mail.example.test/open?url=${encodeURIComponent(link)}`]) assert.deepEqual(decodeFormLink(copied, 'response'), value);
  assert.equal(decodeFormLink(link, 'response').help, fields().help);
});

test('hard-wrapped long links and invisible copy characters retain all UTF-8 fields', () => {
  const value = reply(); value.help = 'Offerta accessibile, sanità e ricerca 🚀. '.repeat(26);
  const link = encodeFormLink(value, base), [prefix, payload] = link.split('#response=');
  const copied = `${prefix}#response=\n${payload.match(/.{1,50}/g).join('\r\n  ')}\n\nGrazie!`;
  assert.ok(payload.length / 50 > 32);
  assert.deepEqual(decodeFormLink(copied, 'response'), value);
  assert.deepEqual(decodeFormLink(link.replace('#response=', '#response=\u200b'), 'response'), value);
});

test('old invitations still decode when copied together with their invitation message', () => {
  const d = fixture(); prepareProfileInvitation(d, '1'); prepareProfileInvitation(d, '1', 'contact');
  for (const person of ['new', 'contact']) {
    const invitation = profileInvitation(d, '1', person), link = encodeFormLink(invitation, base);
    assert.deepEqual(decodeFormLink(`Quando possiamo coinvolgerti?\n${link}`, 'invite'), invitation);
  }
});

test('a reusable personal card opens from a full message and a transport-escaped URL', () => {
  const card = makePersonalCard(fields()), link = personalCardLink(card, base);
  for (const copied of [responseMessage(card.profile, link), `[La mia scheda](${link})`, encodeURIComponent(link)]) assert.deepEqual(readPersonalCardLink(copied), card);
});

test('incoming fragments remain routes when messaging clients escape the fragment separator', () => {
  for (const hash of ['#response=abc', '#card=abc', '#response%3Dabc', '#%23card%3Dabc', '#%2523response%253Dabc']) assert.equal(isShareRoute(hash, ['response', 'card']), true);
  for (const hash of ['', '#join', '#invite=abc', '#i=abc', '#settings']) assert.equal(isShareRoute(hash, ['response', 'card']), false);
});

test('multiple distinct replies are rejected instead of silently choosing a person', () => {
  const a = reply(), b = { ...a, name: 'Un’altra persona', responseId: crypto.randomUUID() };
  const one = encodeFormLink(a, base), two = encodeFormLink(b, base);
  assert.throws(() => decodeFormLink(one + '\n\n' + two, 'response'), /più schede/);
  assert.deepEqual(decodeFormLink(one + '\n\n' + one, 'response'), a);
});

test('truncated or malformed responses cannot import a partial profile', () => {
  const value = reply(), link = encodeFormLink(value, base);
  for (const copied of [link.slice(0, -12), '#response=not-json', 'Un messaggio senza scheda', '#response=' + 'a'.repeat(26001)]) assert.throws(() => decodeFormLink(copied, 'response'));
  const unsafe = { ...value, token: 'unexpected' };
  const encoded = Buffer.from(JSON.stringify(unsafe)).toString('base64url');
  assert.throws(() => decodeFormLink('#response=' + encoded, 'response'));
});
