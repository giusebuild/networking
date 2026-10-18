import { PROFILE_FIELDS, UUID, cleanProfile, validateProfileFields } from './profile-card.js';
import { live, keyFor, norm } from './model.js';
import { responseCandidates } from './profile-requests.js';

const KEY = 'tramite:personal-card:v1';
const invalid = () => { throw new Error('Scheda condivisa non valida. Chiedi di inviare di nuovo il link.'); };
export function validatePersonalCard(card) {
  const keys = ['v', 'kind', 'id', 'revision', 'updatedAt', 'profile'];
  if (!card || typeof card !== 'object' || Object.keys(card).length !== keys.length || !keys.every(k => Object.hasOwn(card, k)) || card.v !== 1 || card.kind !== 'card' || !UUID.test(card.id) || !UUID.test(card.revision) || typeof card.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(card.updatedAt) || !Number.isFinite(Date.parse(card.updatedAt))) invalid();
  if (!card.profile || Object.keys(card.profile).length !== Object.keys(PROFILE_FIELDS).length || !Object.keys(PROFILE_FIELDS).every(k => Object.hasOwn(card.profile, k))) invalid();
  validateProfileFields(card.profile); return card;
}
export function makePersonalCard(fields, previous = null, { id = previous?.id || crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const profile = cleanProfile(fields);
  if (previous) validatePersonalCard(previous);
  if (previous?.id === id && JSON.stringify(profile) === JSON.stringify(cleanProfile(previous.profile))) return structuredClone(previous);
  return validatePersonalCard({ v: 1, kind: 'card', id, revision: crypto.randomUUID(), updatedAt: now, profile });
}
export function personalCardLink(card, baseURL) {
  validatePersonalCard(card);
  const packed = [1, card.id, card.revision, card.updatedAt, ...Object.keys(PROFILE_FIELDS).map(k => card.profile[k])];
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(packed)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL('./profilo.html', baseURL); url.search = ''; url.hash = 'card=' + encoded; return url.href;
}
export function readPersonalCardLink(link) {
  if (typeof link !== 'string' || link.length > 28000) invalid();
  let hash; try { hash = link.startsWith('#') ? link : new URL(link).hash; } catch { invalid(); }
  const match = hash.match(/^#card=([A-Za-z0-9_-]{1,26000})$/); if (!match) invalid();
  let p;
  try { p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)))); } catch { invalid(); }
  if (!Array.isArray(p) || p.length !== 11 || p[0] !== 1) invalid();
  return validatePersonalCard({ v: 1, kind: 'card', id: p[1], revision: p[2], updatedAt: p[3], profile: Object.fromEntries(Object.keys(PROFILE_FIELDS).map((k, i) => [k, p[i + 4]])) });
}
export function loadPersonalCard(storage = globalThis.localStorage) {
  const raw = storage?.getItem(KEY); return raw ? validatePersonalCard(JSON.parse(raw)) : null;
}
export function rememberPersonalCard(card, storage = globalThis.localStorage) { validatePersonalCard(card); storage.setItem(KEY, JSON.stringify(card)); }
export function forgetPersonalCard(storage = globalThis.localStorage) { storage.removeItem(KEY); }
export function sameProfile(a, b) {
  const contacts = ['email', 'phone', 'linkedin'];
  if (contacts.some(k => a[k] && b[k] && a[k].toLowerCase() === b[k].toLowerCase())) return true;
  if (contacts.some(k => a[k] && b[k] && a[k].toLowerCase() !== b[k].toLowerCase())) return false;
  return !!a.name && norm(a.name.trim()) === norm(b.name.trim());
}
export function personalCardCandidates(data, card) {
  validatePersonalCard(card);
  const matches = new Map(responseCandidates(data, card.profile).map(p => [p.id, p]));
  for (const c of live(data.contributions)) if (c.reply?.cardId === card.id && data.people[c.personId] && !data.people[c.personId].memberId) matches.set(c.personId, { ...data.people[c.personId], exact: true });
  return [...matches.values()];
}
export function personalCardTarget(data, card, userId, targetId = '') {
  validatePersonalCard(card);
  if (!data.members[userId]) throw new Error('Accedi alla tua rete per aggiungere una scheda.');
  if (live(data.members).some(m => m.profileCardId === card.id)) throw new Error('Questa persona ha già un profilo nel team.');
  const candidates = personalCardCandidates(data, card);
  if (targetId && !candidates.some(p => p.id === targetId)) throw new Error('Scegli una delle schede corrispondenti.');
  const existing = targetId ? data.people[targetId] : null;
  if (!existing && Object.hasOwn(data.people, card.id)) throw new Error('Scheda già presente o rimossa: scegli la persona esistente per collegarla.');
  if (existing && data.contributions[keyFor(existing.id, userId)]?.reply?.responseId === card.revision) throw new Error('Hai già aggiunto questa versione della scheda.');
  return existing;
}
export function applyPersonalCard(data, card, userId, targetId = '', now = new Date().toISOString()) {
  let p = personalCardTarget(data, card, userId, targetId);
  const fields = cleanProfile(card.profile);
  if (!p) {
    if (personalCardCandidates(data, card).some(candidate => candidate.exact)) throw new Error('La scheda corrisponde a una persona già nella rete. Selezionala per collegarla.');
    p = data.people[card.id] = { id: card.id, name: fields.name, role: '', memberId: null, createdBy: userId };
  }
  const key = keyFor(p.id, userId);
  data.relationships[key] ||= { id: key, personId: p.id, authorId: userId, context: '', since: '', level: '', last: '', note: '' };
  const c = data.contributions[key] ||= { id: key, personId: p.id, authorId: userId, help: '', skills: [], markets: [], interests: [], collaboration: 'Da chiedere' };
  c.reply = { ...fields, cardId: card.id, responseId: card.revision, updatedAt: now };
  for (const k of ['role', 'phone', 'email', 'linkedin']) if (!p[k] && fields[k]) p[k] = fields[k];
  return p.id;
}
