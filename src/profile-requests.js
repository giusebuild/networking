import { keyFor, norm, live, viewPerson } from './model.js';
import { normalizePhone, normalizeEmail } from './contacts.js';
import { normalizeLinkedIn } from './profile.js';
import { PROFILE_FIELDS, UUID, validateProfileFields, cleanProfile } from './profile-card.js';

const fail = () => { throw new Error('Link della scheda non valido. Chiedi un nuovo link.'); };
function shape(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || !fields.every(k => Object.hasOwn(value, k))) fail();
}
function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail();
}
function context(value) {
  for (const k of ['personId', 'authorId', 'requestId']) text(value[k], 80, true);
  if (![1, 2].includes(value.v) || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.personId) || !/^\d{1,20}$/.test(value.authorId) || !UUID.test(value.requestId) || (value.personId === 'new' && value.v !== 2)) fail();
}
export function validateInvitation(value) {
  shape(value, ['v', 'kind', 'personId', 'authorId', 'requestId', 'facilitator', 'replyPhone', 'replyEmail', ...(value?.v === 2 ? ['prefill'] : [])]); context(value);
  if (value.kind !== 'invite') fail();
  text(value.facilitator, 160, true); text(value.replyPhone, 40); text(value.replyEmail, 254);
  normalizePhone(value.replyPhone); normalizeEmail(value.replyEmail);
  if (value.v === 2) { shape(value.prefill, Object.keys(PROFILE_FIELDS)); validateProfileFields(value.prefill, false); }
  return value;
}
export function validateResponse(value) {
  shape(value, ['v', 'kind', 'personId', 'authorId', 'requestId', ...Object.keys(PROFILE_FIELDS), ...(value?.v === 2 ? ['responseId'] : [])]); context(value);
  if (value.kind !== 'response' || (value.v === 2 && (typeof value.responseId !== 'string' || !UUID.test(value.responseId)))) fail();
  validateProfileFields(value);
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
export function prepareProfileInvitation(data, userId, personId = 'new') {
  const member = data.members[userId];
  if (!member) throw new Error('Entra nella rete prima di preparare una scheda.');
  if (personId === 'new') member.profileInviteId ||= crypto.randomUUID();
  else {
    if (!data.people[personId] || data.people[personId].memberId) throw new Error('Questa scheda non può ricevere un invito.');
    const key = keyFor(personId, userId);
    data.contributions[key] ||= { id: key, personId, authorId: userId, help: '', skills: [], markets: [], interests: [], collaboration: 'Da chiedere' };
    data.contributions[key].profileRequestId ||= crypto.randomUUID();
  }
}
export function profileInvitation(data, userId, personId = 'new') {
  const member = data.members[userId], me = viewPerson(data, data.people[member.personId]);
  let requestId = member.profileInviteId, prefill = Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k => [k, '']));
  if (personId !== 'new') {
    const p = data.people[personId], c = data.contributions[keyFor(personId, userId)]; requestId = c?.profileRequestId;
    // Only this author's summary and received fields; no notes or other knowers.
    for (const [k, n] of Object.entries(PROFILE_FIELDS)) prefill[k] = String((c?.reply ? c.reply[k] : (k === 'help' ? c?.help : k === 'need' ? c?.need?.text : p?.[k])) || '').slice(0, n);
    if (!prefill.help && !c?.reply) prefill.help = [...(c?.skills || []), ...(c?.markets || [])].join(' · ').slice(0, 1500);
  }
  return validateInvitation({ v: 2, kind: 'invite', personId, authorId: userId, requestId, facilitator: member.name, replyPhone: me.phone || '', replyEmail: me.email || '', prefill });
}
export function responseCandidates(data, response) {
  const p = cleanProfile(response), normalizers = { phone: normalizePhone, email: normalizeEmail, linkedin: normalizeLinkedIn };
  return live(data.people).filter(person => !person.memberId).map(person => {
    const v = viewPerson(data, person);
    const exact = Object.entries(normalizers).some(([k, normalize]) => p[k] && [person[k], v[k]].filter(Boolean).some(value => normalize(value).toLowerCase() === p[k].toLowerCase()));
    return { ...person, exact };
  }).filter(person => person.exact || norm(person.name.trim()) === norm(p.name));
}
export function responseTarget(data, response, userId, targetId = '') {
  validateResponse(response);
  if (response.authorId !== userId) throw new Error('Questa risposta è destinata a un altro membro del team.');
  const responseId = response.responseId || response.requestId;
  if (live(data.contributions).some(c => c.reply?.responseId === responseId)) throw new Error('Questa risposta è già stata aggiunta.');
  if (response.personId === 'new') {
    if (data.members[userId]?.profileInviteId !== response.requestId || Object.hasOwn(data.people, responseId)) throw new Error('Invito non più valido o risposta già utilizzata.');
    const candidates = responseCandidates(data, response);
    if (targetId) {
      const chosen = candidates.find(p => p.id === targetId);
      if (!chosen) throw new Error('Scegli una scheda tra quelle corrispondenti alla risposta.');
      return data.people[chosen.id];
    }
    return null;
  }
  const person = data.people[response.personId], contribution = data.contributions[keyFor(response.personId, userId)];
  if (!person || person.memberId || !contribution || contribution.profileRequestId !== response.requestId) throw new Error('Link già utilizzato, sostituito o scheda non più disponibile.');
  return person;
}
export function applyProfileResponse(data, response, userId, now = new Date().toISOString(), targetId = '') {
  let person = responseTarget(data, response, userId, targetId);
  const fields = cleanProfile(response);
  if (!person) {
    if (fields.linkedin && live(data.people).some(p => [p.linkedin, viewPerson(data, p).linkedin].filter(Boolean).some(value => normalizeLinkedIn(value) === fields.linkedin))) throw new Error('Questo profilo LinkedIn è già nella rete. Collega la risposta alla scheda esistente.');
    const id = response.responseId; person = data.people[id] = { id, name: fields.name, role: '', memberId: null, createdBy: userId };
    const key = keyFor(id, userId);
    data.relationships[key] = { id: key, personId: id, authorId: userId, context: '', since: '', level: '', last: '', note: '' };
  }
  const key = keyFor(person.id, userId);
  if (response.personId === 'new' && !data.relationships[key]) data.relationships[key] = { id: key, personId: person.id, authorId: userId, context: '', since: '', level: '', last: '', note: '' };
  const c = data.contributions[key] ||= { id: key, personId: person.id, authorId: userId, help: '', skills: [], markets: [], interests: [], collaboration: 'Da chiedere' };
  // The response never replaces observations, custom tags, needs or known details.
  c.reply = { ...fields, responseId: response.responseId || response.requestId, updatedAt: now };
  if (response.personId !== 'new') c.profileRequestId = '';
  for (const k of ['role', 'phone', 'email', 'linkedin']) if (!person[k] && fields[k]) person[k] = fields[k];
  return person.id;
}
