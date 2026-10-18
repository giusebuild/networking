import { normalizePhone, normalizeEmail } from './contacts.js';
import { normalizeLinkedIn, suggestedTags, needTags } from './profile.js';

export const PROFILE_FIELDS = { name: 160, role: 160, help: 1500, need: 1500, phone: 40, email: 254, linkedin: 300 };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateProfileFields(value, requiredName = true) {
  if (!value || Object.entries(PROFILE_FIELDS).some(([k, n]) => typeof value[k] !== 'string' || value[k].length > n) || (requiredName && !value.name.trim())) throw new Error('Controlla i campi della scheda.');
  normalizePhone(value.phone); normalizeEmail(value.email); normalizeLinkedIn(value.linkedin);
  return value;
}
export function cleanProfile(value) {
  validateProfileFields(value);
  const p = Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k => [k, value[k].trim()]));
  p.phone = normalizePhone(p.phone); p.email = normalizeEmail(p.email); p.linkedin = normalizeLinkedIn(p.linkedin);
  return p;
}
export function reportedContribution(c) {
  if (!c.reply) return null;
  const r = c.reply, tags = suggestedTags(r.help), requested = needTags(r.need);
  return { id: `${c.id}:reply`, personId: c.personId, authorId: c.authorId, reported: true, help: r.help, ...tags,
    collaboration: 'Da chiedere', ...(r.need ? { need: { text: r.need, skills: requested.skills, markets: requested.markets, updatedAt: r.updatedAt } } : {}) };
}
