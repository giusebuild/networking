import { profileNeeds } from './needs.js';

// The recipient can read the complete reply in chat as well as open it in the app.
export function responseMessage(profile, link = '') {
  const sections = [`La mia scheda · Tramite\n${profile.name}`];
  if (profile.role) sections[0] += '\n' + profile.role;
  if (profile.help) sections.push('Posso aiutare con\n' + profile.help);
  const needs = profileNeeds(profile);
  if (needs.length) sections.push('Cerco\n' + needs.map(n => '• ' + n.text).join('\n'));
  const contacts = [profile.email, profile.phone, profile.linkedin].filter(Boolean);
  if (contacts.length) sections.push('Come contattarmi\n' + contacts.join('\n'));
  if (link) sections.unshift(link + '\nApri la scheda in Tramite');
  return sections.join('\n\n');
}
