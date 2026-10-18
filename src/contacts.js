import { normalizeLinkedIn } from './profile.js';

export function normalizePhone(value) {
  const text = String(value || '').trim(); if (!text) return '';
  let number = text.replace(/^tel:/i, '').replace(/[\s().-]/g, '');
  if (number.startsWith('00')) number = '+' + number.slice(2);
  if (!number.startsWith('+') && /^3\d{8,9}$/.test(number)) number = '+39' + number;
  if (!/^\+[1-9]\d{5,14}$/.test(number)) throw new Error('Aggiungi il prefisso internazionale, per esempio +39.');
  return number;
}
export function whatsappURL(phone, text = '') {
  const number = normalizePhone(phone); if (!number) return '';
  return `https://wa.me/${number.slice(1)}${text ? `?text=${encodeURIComponent(String(text).slice(0, 3000))}` : ''}`;
}
const unescape = text => text.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
export function parseVCards(text) {
  if (new TextEncoder().encode(String(text)).length > 900000) throw new Error('File troppo grande (massimo 900 KB).');
  const raw = String(text).replace(/\r\n[ \t]|\n[ \t]/g, '');
  const cards = [...raw.matchAll(/BEGIN:VCARD\s*\r?\n([\s\S]*?)\r?\nEND:VCARD/gi)];
  const result = cards.map(([, body]) => {
    let name = '', fallback = '', phones = [];
    for (const line of body.split(/\r?\n/)) {
      const at = line.indexOf(':'); if (at < 0) continue;
      const property = line.slice(0, at).replace(/^item\d+\./i, '').split(';')[0].toUpperCase();
      const value = unescape(line.slice(at + 1)).trim();
      if (property === 'FN') name = value;
      if (property === 'N') { const [last = '', first = ''] = value.split(';'); fallback = `${first} ${last}`.trim(); }
      if (property === 'TEL') { try { const phone = normalizePhone(value); if (phone && !phones.includes(phone)) phones.push(phone); } catch {} }
    }
    return { name: (name || fallback).slice(0, 160), phones };
  }).filter(c => c.name || c.phones.length);
  if (!result.length) throw new Error('Nessun contatto leggibile. Usa un file .vcf esportato dalla rubrica.');
  if (result.length > 1000) throw new Error('Importa al massimo 1.000 contatti alla volta.');
  return result;
}

// Public profile links can be opened directly. Private numbers keep the existing
// path through the person who knows the contact.
export function personContactActions(person, viewerId) {
  const mine = person.relationships?.some(r => r.authorId === viewerId);
  const direct = mine || !!person.memberId || person.createdBy === viewerId;
  const actions = [];
  if (!direct) {
    const referent = person.relationships?.find(r => r.authorId !== viewerId);
    if (referent) actions.push({ type: 'introduction', authorId: referent.authorId });
  }
  if (direct && person.phone) actions.push({ type: 'whatsapp', href: whatsappURL(person.phone, `Ciao ${person.name}, mi piacerebbe confrontarmi con te per una possibile collaborazione.`) });
  if (person.linkedin) actions.push({ type: 'linkedin', href: normalizeLinkedIn(person.linkedin) });
  if (!actions.length) actions.push({ type: !person.memberId || person.memberId === viewerId ? 'add-contact' : 'add-relationship' });
  return actions;
}
