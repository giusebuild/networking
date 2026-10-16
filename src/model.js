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
  check(plain(data) && data.schemaVersion === 1, 'versione sconosciuta');
  check(Object.keys(data).length === 5 && Object.keys(data).every(k => k === 'schemaVersion' || TABLES.includes(k)), 'struttura sconosciuta');
  for (const table of TABLES) {
    check(plain(data[table]) && Object.keys(data[table]).length <= 15000, `tabella ${table}`);
    for (const [key, record] of Object.entries(data[table])) {
      check(validKey(key), 'identificatore');
      if (record === null) continue; // Tombstones preserve deletions across devices.
      check(plain(record) && record.id === key, `record ${table}`);
      const allowed = [...shapes[table], ...(table === 'people' ? ['linkedin'] : [])];
      check(Object.keys(record).every(k => allowed.includes(k)) && shapes[table].every(k => Object.hasOwn(record, k)), `campi ${table}`);
      for (const [field, value] of Object.entries(record)) {
        check(!dangerous.has(field), 'campo riservato');
        if (['skills', 'markets', 'interests'].includes(field)) check(Array.isArray(value) && value.length <= 40 && value.every(v => string(v, 80) && v.trim()), 'tag');
        else if (field === 'memberId') check(value === null || /^\d+$/.test(value), 'membro');
        else check(string(value), `campo ${field}`);
      }
      if (table === 'members') check(/^\d+$/.test(key) && /^[a-zA-Z0-9-]{1,39}$/.test(record.login) && record.name.trim(), 'identità');
      if (table === 'people') {
        check(record.name.trim() && record.name.length <= 160, 'nome');
        if (record.linkedin) { try { normalizeLinkedIn(record.linkedin); } catch { check(false, 'profilo LinkedIn'); } }
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
  let conflicts = [];
  function merge(b, l, r, path) {
    if (equal(l, r) || equal(r, b)) return l === undefined ? undefined : clone(l);
    if (equal(l, b)) return r === undefined ? undefined : clone(r);
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
  const offering = self ? [self] : contributions;
  return { ...person, contributions, relationships, self,
    offering,
    ...Object.fromEntries(['skills', 'markets', 'interests'].map(k => [k, [...new Map(offering.flatMap(c => c[k]).map(value => [norm(value), value])).values()]])),
  };
}
export function findPeople(data, userId, { search = '', filters = {} } = {}) {
  const words = norm(search).trim().split(/\s+/).filter(Boolean);
  const own = data.members[userId]?.personId;
  return live(data.people).filter(p => p.id !== own).map(p => viewPerson(data, p)).filter(p =>
    Object.entries(filters).every(([k, v]) => {
      if (!v) return true;
      if (k === 'knower') return p.relationships.some(r => r.authorId === v);
      if (k === 'collaboration') return p.offering.some(c => c.collaboration === v);
      return p[k]?.some(value => norm(value) === norm(v));
    }) &&
    words.every(w => norm([p.name, p.role, p.linkedin || '', ...p.skills, ...p.markets, ...p.interests,
      ...p.offering.map(c => c.help), ...p.relationships.flatMap(r => [data.members[r.authorId]?.name, r.context, r.since, r.level, r.note])].join(' ')).includes(w))
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
  const rows = [['ID persona', 'Nome', 'Presentazione breve', 'Conosciuto da', 'Da coinvolgere per', 'Competenze', 'Settori', 'Interessi', 'Collaborazioni', 'Contesto', 'Dal', 'Rapporto', 'Ultimo contatto', 'Note', 'LinkedIn']];
  for (const person of live(data.people)) {
    const p = viewPerson(data, person);
    const authors = new Set([...p.relationships.map(r => r.authorId), ...p.contributions.map(c => c.authorId)]);
    for (const authorId of authors) {
      const c = p.contributions.find(c => c.authorId === authorId), r = p.relationships.find(r => r.authorId === authorId);
      rows.push([p.id, p.name, p.role, data.members[authorId]?.name, c?.help, c?.skills.join(', '), c?.markets.join(', '), c?.interests.join(', '), c?.collaboration, r?.context, r?.since, r?.level, r?.last, r?.note, p.linkedin]);
    }
    if (!authors.size) rows.push([p.id, p.name, p.role, '', '', '', '', '', '', '', '', '', '', '', p.linkedin]);
  }
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
import { normalizeLinkedIn } from './profile.js';
