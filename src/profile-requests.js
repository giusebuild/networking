import { keyFor, makeNeed } from './model.js';
import { normalizePhone, normalizeEmail } from './contacts.js';
import { normalizeLinkedIn, suggestedTags, needTags } from './profile.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = () => { throw new Error('Link della scheda non valido. Chiedi un nuovo link.'); };
function shape(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || !fields.every(k => Object.hasOwn(value, k))) fail();
}
function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail();
}
function context(value) {
  for (const k of ['personId', 'authorId', 'requestId']) text(value[k], 80, true);
  if (value.v !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.personId) || !/^\d{1,20}$/.test(value.authorId) || !uuid.test(value.requestId)) fail();
}
export function validateInvitation(value) {
  shape(value, ['v', 'kind', 'personId', 'authorId', 'requestId', 'facilitator', 'replyPhone', 'replyEmail']); context(value);
  if (value.kind !== 'invite') fail();
  text(value.facilitator, 160, true); text(value.replyPhone, 40); text(value.replyEmail, 254);
  normalizePhone(value.replyPhone); normalizeEmail(value.replyEmail);
  return value;
}
export function validateResponse(value) {
  shape(value, ['v', 'kind', 'personId', 'authorId', 'requestId', 'name', 'role', 'help', 'need', 'phone', 'email', 'linkedin']); context(value);
  if (value.kind !== 'response') fail();
  for (const k of ['name', 'role']) text(value[k], 160, k === 'name');
  for (const k of ['help', 'need']) text(value[k], 1500);
  text(value.phone, 40); text(value.email, 254); text(value.linkedin, 300);
  normalizePhone(value.phone); normalizeEmail(value.email); normalizeLinkedIn(value.linkedin);
  return value;
}
export function encodeFormLink(value, baseURL) {
  const invite = value.kind === 'invite'; (invite ? validateInvitation : validateResponse)(value);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL(invite ? './scheda.html' : './', baseURL);
  url.search = ''; url.hash = `${invite ? 'invite' : 'response'}=${encoded}`;
  return url.href;
}
export function decodeFormLink(link, kind) {
  if (!['invite', 'response'].includes(kind) || typeof link !== 'string' || link.length > 28000) fail();
  let hash;
  try { hash = link.startsWith('#') ? link : new URL(link).hash; } catch { fail(); }
  const match = hash.match(new RegExp(`^#${kind}=([A-Za-z0-9_-]{1,26000})$`));
  if (!match) fail();
  let value;
  try {
    const raw = atob(match[1].replaceAll('-', '+').replaceAll('_', '/'));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, x => x.charCodeAt(0))));
  } catch { fail(); }
  return kind === 'invite' ? validateInvitation(value) : validateResponse(value);
}
export function responseTarget(data, response, userId) {
  validateResponse(response);
  if (response.authorId !== userId) throw new Error('Questa risposta è destinata a un altro membro del team.');
  const person = data.people[response.personId], contribution = data.contributions[keyFor(response.personId, userId)];
  if (!person || person.memberId || !contribution || contribution.profileRequestId !== response.requestId) throw new Error('Link già utilizzato, sostituito o scheda non più disponibile.');
  return person;
}
export function applyProfileResponse(data, response, userId, now = new Date().toISOString()) {
  const person = responseTarget(data, response, userId), c = data.contributions[keyFor(person.id, userId)];
  person.name = response.name.trim();
  // Empty optional contact fields keep previously known details. The reviewer can
  // edit them later; a response never deletes somebody else's observations.
  if (response.role.trim()) person.role = response.role.trim();
  for (const [field, normalize] of [['phone', normalizePhone], ['email', normalizeEmail], ['linkedin', normalizeLinkedIn]]) if (response[field].trim()) person[field] = normalize(response[field]);
  c.help = response.help.trim();
  const tags = suggestedTags(c.help); c.skills = tags.skills; c.markets = tags.markets;
  const need = makeNeed(c.need, response.need, needTags(response.need), now);
  if (need !== undefined) c.need = need;
  c.profileRequestId = ''; // A response is applied at most once in this archive.
  return person.id;
}
