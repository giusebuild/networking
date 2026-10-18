import { needTags } from './profile.js';

export const MAX_NEEDS = 20;
export const canCloseNeed = (person, contribution, viewerId) => typeof viewerId === 'string' && !!viewerId && !!person && person.memberId === viewerId && contribution?.authorId === viewerId && !contribution?.reported;
const key = /^[a-zA-Z0-9_-]{1,80}$/;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const safeKey = v => key.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
export function needsMap(contribution) {
  if (contribution?.needs) return structuredClone(contribution.needs);
  return contribution?.need?.text ? { legacy: { ...structuredClone(contribution.need), status: 'active' } } : {};
}
export const needEntries = (c, activeOnly = true) => Object.entries(needsMap(c)).filter(([, n]) => n && (!activeOnly || n.status === 'active')).map(([id, n]) => ({ id, ...n }));
export function validateNeeds(map) {
  if (!plain(map) || Object.keys(map).length > 300) throw new Error('Elenco esigenze non valido.');
  let count = 0;
  for (const [id, n] of Object.entries(map)) {
    if (!safeKey(id)) throw new Error('Identificativo esigenza non valido.');
    if (n === null) continue;
    count++;
    if (!plain(n) || Object.keys(n).length !== 5 || !['text', 'skills', 'markets', 'updatedAt', 'status'].every(k => Object.hasOwn(n, k)) || typeof n.text !== 'string' || !n.text.trim() || n.text.length > 1500 || !['active', 'resolved'].includes(n.status) || typeof n.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(n.updatedAt) || !Number.isFinite(Date.parse(n.updatedAt)) || !['skills', 'markets'].every(k => Array.isArray(n[k]) && n[k].length <= 40 && n[k].every(t => typeof t === 'string' && t.trim() && t.length <= 80))) throw new Error('Esigenza non valida.');
  }
  if (count > MAX_NEEDS) throw new Error(`Massimo ${MAX_NEEDS} esigenze. Rimuovi quelle che non servono più.`);
  return map;
}
export function profileNeeds(profile) {
  return Object.hasOwn(profile || {}, 'needs') ? structuredClone(profile.needs) : profile?.need?.trim() ? [{ id: 'legacy', text: profile.need.trim() }] : [];
}
export function validateProfileNeeds(list) {
  if (!Array.isArray(list) || list.length > MAX_NEEDS || new Set(list.map(n => n?.id)).size !== list.length || list.some(n => !plain(n) || Object.keys(n).length !== 2 || !safeKey(n.id) || typeof n.text !== 'string' || !n.text.trim() || n.text.length > 1500)) throw new Error('Controlla le esigenze della scheda.');
  return list;
}
export function declaredNeeds(profile, updatedAt) {
  return Object.fromEntries(profileNeeds(profile).map(({ id, text }) => { const tags = needTags(text); return [id, { text, skills: tags.skills, markets: tags.markets, updatedAt, status: 'active' }]; }));
}
export function shareNeeds(contribution) { return needEntries(contribution).map(({ id, text }) => ({ id, text })); }
// A legacy link cannot erase a newer list it cannot represent.
export function preserveLegacyNeeds(previous, fields) {
  if (!previous?.needs || Object.hasOwn(fields, 'needs')) return fields;
  const list = structuredClone(previous.needs);
  if (fields.need?.trim() && !list.some(n => n.text === fields.need.trim())) list.push({ id: crypto.randomUUID(), text: fields.need.trim() });
  validateProfileNeeds(list);
  return { ...fields, needs: list };
}
