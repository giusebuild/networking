import { needEntries, needsMap, validateNeeds, profileNeeds } from './needs.js';
import { PROFILE_FIELDS, UUID, validateProfileFields, reportedContribution } from './profile-card.js';
export const TABLES = ['members', 'people', 'contributions', 'relationships'];
export const COLLABORATION = ['Da chiedere', 'Aperto', 'Non disponibile'];
export const LEVELS = ['', 'Appena conosciuto', 'Conoscenza occasionale', 'Buona conoscenza', 'Rapporto stretto'];
export const clone = value => structuredClone(value);
export const norm = value => String(value ?? '').toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const tags = text => [...new Map(String(text).split(',').map(x => x.trim()).filter(Boolean).map(x => [norm(x), x])).values()];
export const live = table => Object.values(table).filter(Boolean);
export const keyFor = (personId, userId) => `${personId}:${userId}`;
export const emptyNetwork = () => ({ schemaVersion: 1, members: {}, people: {}, contributions: {}, relationships: {} });
const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
const validKey = x => /^[a-zA-Z0-9:_-]{1,120}$/.test(x) && !dangerous.has(x);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function check(ok, message) { if (!ok) throw new Error(`Archivio non valido: ${message}`); }
const string = (x, n = 5000) => typeof x === 'string' && x.length <= n;
const shapes = {
  members: ['id', 'login', 'name', 'personId'],
  people: ['id', 'name', 'role', 'memberId', 'createdBy'],
  contributions: ['id', 'personId', 'authorId', 'help', 'skills', 'markets', 'interests', 'collaboration'],
  relationships: ['id', 'personId', 'authorId', 'context', 'since', 'level', 'last', 'note'],
};
export function validateNetwork(data) {
  check(plain(data) && [1, 2].includes(data.schemaVersion), 'versione sconosciuta');
  check(Object.keys(data).length === 5 && Object.keys(data).every(k => k === 'schemaVersion' || TABLES.includes(k)), 'struttura sconosciuta');
  for (const table of TABLES) {
    check(plain(data[table]) && Object.keys(data[table]).length <= 15000, `tabella ${table}`);
    for (const [key, record] of Object.entries(data[table])) {
      check(validKey(key), 'identificatore');
      if (record === null) continue; // Tombstones preserve deletions across devices.
      check(plain(record) && record.id === key, `record ${table}`);
      const allowed = [...shapes[table], ...(table === 'people' ? ['linkedin', 'phone', 'email'] : table === 'contributions' ? ['need', 'needs', 'presentation', 'profileRequestId', 'reply'] : table === 'members' ? ['profileInviteId', 'profileCardId'] : [])];
      check(Object.keys(record).every(k => allowed.includes(k)) && shapes[table].every(k => Object.hasOwn(record, k)), `campi ${table}`);
      for (const [field, value] of Object.entries(record)) {
        check(!dangerous.has(field), 'campo riservato');
        if (field === 'needs') { check(data.schemaVersion === 2, 'aggiorna l’app per le esigenze multiple'); validateNeeds(value); }
        else if (field === 'need') {
          check(value === null || (plain(value) && Object.keys(value).length === 4 && ['text', 'skills', 'markets', 'updatedAt'].every(k => Object.hasOwn(value, k)) && string(value.text, 1500) && value.text.trim() && /^\d{4}-\d{2}-\d{2}T/.test(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt)) && ['skills', 'markets'].every(k => Array.isArray(value[k]) && value[k].length <= 40 && value[k].every(v => string(v, 80) && v.trim()))), 'richiesta');
        }
        else if (field === 'reply') {
          check(plain(value) && Object.keys(value).length === (Object.hasOwn(value, 'cardId') ? 10 : 9) + (Object.hasOwn(value, 'needs') ? 1 : 0) && (!Object.hasOwn(value, 'cardId') || (typeof value.cardId === 'string' && UUID.test(value.cardId))) && [...Object.keys(PROFILE_FIELDS), 'responseId', 'updatedAt'].every(k => Object.hasOwn(value, k)) && typeof value.responseId === 'string' && UUID.test(value.responseId) && /^\d{4}-\d{2}-\d{2}T/.test(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt)), 'risposta alla scheda');
          check(!Object.hasOwn(value, 'needs') || data.schemaVersion === 2, 'versione esigenze');
          try { validateProfileFields(value); } catch { check(false, 'campi risposta'); }
        }
        else if (['profileRequestId', 'profileInviteId', 'profileCardId'].includes(field)) check(value === '' || (typeof value === 'string' && UUID.test(value)), 'richiesta di compilazione');
        else if (['skills', 'markets', 'interests'].includes(field)) check(Array.isArray(value) && value.length <= 40 && value.every(v => string(v, 80) && v.trim()), 'tag');
        else if (field === 'memberId') check(value === null || /^\d+$/.test(value), 'membro');
        else check(string(value), `campo ${field}`);
      }
      if (table === 'members') check(/^\d+$/.test(key) && /^[a-zA-Z0-9-]{1,39}$/.test(record.login) && record.name.trim(), 'identità');
      if (table === 'people') {
        check(record.name.trim() && record.name.length <= 160, 'nome');
        if (record.linkedin) { try { normalizeLinkedIn(record.linkedin); } catch { check(false, 'profilo LinkedIn'); } }
        if (record.email) { try { normalizeEmail(record.email); } catch { check(false, 'email'); } }
        if (record.phone) check(/^\+[1-9]\d{5,14}$/.test(record.phone), 'telefono con prefisso internazionale');
      }
      if (table === 'contributions') check(COLLABORATION.includes(record.collaboration), 'collaborazioni');
      if (table === 'relationships') check(LEVELS.includes(record.level) && (!record.last || /^\d{4}-\d{2}-\d{2}$/.test(record.last)), 'relazione');
    }
  }
  for (const p of live(data.people)) {
    check(!!data.members[p.createdBy], 'autore persona mancante');
    if (p.memberId) check(data.members[p.memberId]?.personId === p.id, 'profilo non collegato');
  }
  for (const m of live(data.members)) check(data.people[m.personId]?.memberId === m.id, 'identità non collegata');
  for (const t of ['contributions', 'relationships']) for (const r of live(data[t])) {
    check(!!data.people[r.personId] && !!data.members[r.authorId] && r.id === keyFor(r.personId, r.authorId), 'riferimento mancante');
    if (t === 'relationships') check(data.people[r.personId].memberId !== r.authorId, 'relazione con sé stesso');
  }
  return data;
}
export function ensureMember(data, user) {
  const id = String(user.id);
  if (data.members[id]) { data.members[id].login = user.login; return data.members[id]; }
  const personId = `github-${id}`;
  data.members[id] = { id, login: user.login, name: user.name || user.login, personId };
  data.people[personId] = { id: personId, name: user.name || user.login, role: '', memberId: id, createdBy: id };
  return data.members[id];
}
const canonical = v => v === undefined ? 'undefined' : JSON.stringify(v, (_, x) => plain(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export const equal = (a, b) => canonical(a) === canonical(b);
const dependentTables = ['contributions', 'relationships'];
const belongsToPerson = (key, personId) => key.slice(0, key.lastIndexOf(':')) === personId;
function personBundle(data, id) {
  if (!data.people[id]) return null;
  return { person: clone(data.people[id]), ...Object.fromEntries(dependentTables.map(table =>
    [table, Object.fromEntries(Object.entries(data[table]).filter(([key]) => belongsToPerson(key, id)).map(([key, value]) => [key, clone(value)]))]
  )) };
}
function applyPersonBundle(data, id, bundle) {
  data.people[id] = bundle ? clone(bundle.person) : null;
  for (const table of dependentTables) {
    for (const key of Object.keys(data[table])) if (belongsToPerson(key, id)) data[table][key] = null;
    if (bundle) for (const [key, value] of Object.entries(bundle[table])) data[table][key] = clone(value);
  }
}
export function deletePerson(data, id) {
  if (data.people[id]?.memberId) throw new Error('I profili dei partecipanti non si eliminano come contatti.');
  if (!data.people[id]) return;
  applyPersonBundle(data, id, null);
}
export function removeFromNetwork(data, personId, userId) {
  const person = data.people[personId];
  if (!person) return;
  if (person.memberId === userId) throw new Error('Il tuo profilo resta nel team.');
  const key = keyFor(personId, userId);
  // Remove this author's knowledge only. Shared contacts and member profiles survive.
  for (const table of dependentTables) if (data[table][key]) data[table][key] = null;
  const hasOtherKnowledge = dependentTables.some(table => live(data[table]).some(r => r.personId === personId));
  if (!person.memberId && !hasOtherKnowledge && person.createdBy === userId) deletePerson(data, personId);
}
// Three-way merge: unrelated fields merge; true collisions require a human choice.
export function mergeNetworks(base, local, remote) {
  // Reconcile the old single field with the new list before comparing edits.
  // In particular, a legacy edit racing the first list save must be a conflict,
  // rather than a hidden change to a now-unused field.
  const keys = new Set([...Object.keys(base.contributions), ...Object.keys(local.contributions), ...Object.keys(remote.contributions)]);
  const upgraded = [...keys].filter(k => [base, local, remote].some(d => d.contributions[k]?.needs));
  if (upgraded.length) {
    [base, local, remote] = [base, local, remote].map(d => {
      const copy = clone(d); copy.schemaVersion = 2;
      for (const key of upgraded) if (copy.contributions[key]) {
        copy.contributions[key].needs = needsMap(copy.contributions[key]);
        delete copy.contributions[key].need;
      }
      return copy;
    });
  }
  let conflicts = [];
  function merge(b, l, r, path) {
    if (equal(l, r) || equal(r, b)) return l === undefined ? undefined : clone(l);
    if (equal(l, b)) return r === undefined ? undefined : clone(r);
    if (path[0] === 'contributions' && (['need', 'reply'].includes(path.at(-1)) || (path.length === 4 && path[2] === 'needs'))) {
      conflicts.push({ path, base: b, local: l, remote: r });
      return l === undefined ? undefined : clone(l);
    }
    if (plain(l) && plain(r) && (plain(b) || b === undefined)) {
      const result = {};
      for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        if (dangerous.has(k)) throw new Error('Campo riservato');
        const v = merge(b?.[k], l[k], r[k], [...path, k]);
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    conflicts.push({ path, base: b, local: l, remote: r });
    return l === undefined ? undefined : clone(l);
  }
  const data = merge(base, local, remote, []);
  // Deletion is one decision for the person and every dependent record. A concurrent
  // new relationship must not survive with a missing person, or silently disappear.
  for (const id of new Set([...Object.keys(local.people), ...Object.keys(remote.people)])) {
    if (base.people[id] === null) continue; // An explicit restore after a known deletion is a new edit.
    const localDeleted = local.people[id] === null, remoteDeleted = remote.people[id] === null;
    if (!localDeleted && !remoteDeleted) continue;
    const other = localDeleted ? personBundle(remote, id) : personBundle(local, id);
    const hasConflict = !!other && !equal(personBundle(base, id), other);
    conflicts = conflicts.filter(c => !(c.path[0] === 'people' && c.path[1] === id) &&
      !(dependentTables.includes(c.path[0]) && belongsToPerson(c.path[1] || '', id)));
    if (hasConflict) {
      const localValue = personBundle(local, id), remoteValue = personBundle(remote, id);
      conflicts.push({ kind: 'person-deletion', path: ['people', id], label: other.person.name,
        base: personBundle(base, id), local: localValue, remote: remoteValue });
      applyPersonBundle(data, id, localValue);
    } else applyPersonBundle(data, id, null);
  }
  return { data, conflicts };
}
export function resolveConflicts(merged, conflicts, choices) {
  const data = clone(merged);
  conflicts.forEach((c, i) => {
    const value = choices[i] === 'remote' ? c.remote : c.local;
    if (c.kind === 'person-deletion') { applyPersonBundle(data, c.path[1], value); return; }
    let target = data;
    for (const k of c.path.slice(0, -1)) target = target[k];
    if (value === undefined) delete target[c.path.at(-1)];
    else target[c.path.at(-1)] = clone(value);
  });
  return validateNetwork(data);
}
export function viewPerson(data, person) {
  const contributions = live(data.contributions).filter(c => c.personId === person.id);
  const relationships = live(data.relationships).filter(r => r.personId === person.id);
  const self = contributions.find(c => c.authorId === person.memberId);
  const declarations = contributions.filter(c => c.reply).sort((a, b) => b.reply.updatedAt.localeCompare(a.reply.updatedAt)).map(reportedContribution);
  const offering = self ? [self] : [...declarations, ...contributions];
  const latest = self ? null : contributions.filter(c => c.reply).sort((a, b) => b.reply.updatedAt.localeCompare(a.reply.updatedAt))[0]?.reply;
  return { ...person, ...Object.fromEntries(['role', 'phone', 'email', 'linkedin'].filter(k => latest?.[k]).map(k => [k, latest[k]])), contributions, declarations, relationships, self,
    offering, seeking: offering.flatMap(c => needEntries(c).map(n => ({ ...c, needId: n.id, need: n }))),
    needSkills: [...new Set(offering.flatMap(c => needEntries(c).flatMap(n => n.skills)))],
    needMarkets: [...new Set(offering.flatMap(c => needEntries(c).flatMap(n => n.markets)))],
    ...Object.fromEntries(['skills', 'markets', 'interests'].map(k => [k, [...new Map(offering.flatMap(c => c[k]).map(value => [norm(value), value])).values()]])),
  };
}
export function matchingNeeds(p, { search = '', filters = {} } = {}) {
  const words = norm(search).trim().split(/\s+/).filter(Boolean);
  return p.seeking.filter(c => ['skills', 'markets'].every(k => !filters[k] || c.need[k].some(t => norm(t) === norm(filters[k]))) && words.every(w => norm([p.name, p.role, c.need.text, ...c.need.skills, ...c.need.markets].join(' ')).includes(w)));
}
export function findPeople(data, userId, { search = '', filters = {} } = {}) {
  const words = norm(search).trim().split(/\s+/).filter(Boolean);
  const own = data.members[userId]?.personId;
  return live(data.people).filter(p => p.id !== own).map(p => viewPerson(data, p)).filter(p =>
    Object.entries(filters).every(([k, v]) => {
      if (!v) return true;
      if (k === 'knower') return p.relationships.some(r => r.authorId === v);
      if (k === 'intent') return v === 'need' ? matchingNeeds(p, { search, filters }).length > 0 : p.offering.some(c => c.help || c.skills.length);
      if (k === 'collaboration') return p.offering.some(c => c.collaboration === v);
      if (k === 'skills' || k === 'markets') {
        const offered = filters.intent === 'need' ? [] : p[k];
        const needed = filters.intent === 'offer' ? [] : p[k === 'skills' ? 'needSkills' : 'needMarkets'];
        return [...offered, ...needed].some(value => norm(value) === norm(v));
      }
      return p[k]?.some(value => norm(value) === norm(v));
    }) &&
    words.every(w => norm([p.name, p.linkedin || '',
      ...(filters.intent === 'need' ? [] : [p.role, ...p.skills, ...p.markets, ...p.interests, ...p.offering.map(c => c.help)]),
      ...(filters.intent === 'offer' ? [] : [...p.needSkills, ...p.needMarkets, ...p.seeking.map(c => c.need.text)]),
      ...p.relationships.flatMap(r => [data.members[r.authorId]?.name, r.context, r.since, r.level, r.note])].join(' ')).includes(w))
  ).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
// Imports merge by stable IDs, not by names. Different values go through the same conflict UI.
export function mergeImport(current, incoming) {
  validateNetwork(incoming);
  const blank = emptyNetwork();
  return mergeNetworks(blank, current, incoming);
}
const csvCell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
export function exportCSV(data) {
  const rows = [['ID persona', 'Nome', 'Presentazione breve', 'Conosciuto da', 'Da coinvolgere per', 'Competenze', 'Settori', 'Interessi', 'Collaborazioni', 'Contesto', 'Dal', 'Rapporto', 'Ultimo contatto', 'Note', 'LinkedIn', 'Cerca', 'Competenze cercate', 'Settori cercati', 'Richiesta aggiornata', 'Telefono', 'Email', 'Testo originale', 'Fonte']];
  for (const person of live(data.people)) {
    const p = viewPerson(data, person);
    const authors = new Set([...p.relationships.map(r => r.authorId), ...p.contributions.map(c => c.authorId)]);
    for (const authorId of authors) {
      const c = p.contributions.find(c => c.authorId === authorId), r = p.relationships.find(r => r.authorId === authorId);
      rows.push([p.id, person.name, person.role, data.members[authorId]?.name, c?.help, c?.skills.join(', '), c?.markets.join(', '), c?.interests.join(', '), c?.collaboration, r?.context, r?.since, r?.level, r?.last, r?.note, person.linkedin, needEntries(c, false).map(n => (n.status === 'resolved' ? '[Risolta] ' : '') + n.text).join('\n'), needEntries(c, false).flatMap(n => n.skills).join(', '), needEntries(c, false).flatMap(n => n.markets).join(', '), needEntries(c, false).map(n => n.updatedAt).join('\n'), person.phone, person.email, c?.presentation, 'Appunti']);
      if (c?.reply) {
        const reported = reportedContribution(c), reply = c.reply;
        rows.push([p.id, reply.name, reply.role, data.members[authorId]?.name, reply.help, reported.skills.join(', '), reported.markets.join(', '), '', '', '', '', '', '', '', reply.linkedin, profileNeeds(reply).map(n => n.text).join('\n'), needEntries(reported).flatMap(n => n.skills).join(', '), needEntries(reported).flatMap(n => n.markets).join(', '), reply.updatedAt, reply.phone, reply.email, '', 'Scheda compilata']);
      }
    }
    if (!authors.size) rows.push([p.id, p.name, p.role, '', '', '', '', '', '', '', '', '', '', '', p.linkedin, '', '', '', '', p.phone, p.email, '', '']);
  }
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
import { normalizeLinkedIn } from './profile.js';

export function makeNeed(previous, text, tags, now = new Date().toISOString()) {
  const value = String(text || '').trim().slice(0, 1500);
  if (!value) return previous === undefined ? undefined : null;
  const next = { text: value, skills: [...tags.skills], markets: [...tags.markets] };
  if (previous && equal(next, { text: previous.text, skills: previous.skills, markets: previous.markets })) return clone(previous);
  return { ...next, updatedAt: now };
}

import { normalizeEmail } from './contacts.js';
