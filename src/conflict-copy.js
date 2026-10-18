const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const has = (value, key) => Object.hasOwn(value, key);
const text = value => typeof value === 'string' ? value.trim() : '';
const shown = value => text(value) || 'Non indicato';
const list = values => Array.isArray(values) ? values.join(', ') : '';
const profileFields = ['name', 'role', 'help', 'need', 'needs', 'phone', 'email', 'linkedin'];
const replyFields = [...profileFields, 'cardId', 'responseId', 'updatedAt', 'cardUpdatedAt'];
const needFields = ['id', 'text', 'skills', 'markets', 'updatedAt', 'status'];
const contributionFields = ['id', 'personId', 'authorId', 'help', 'skills', 'markets', 'interests', 'collaboration', 'need', 'needs', 'presentation', 'profileRequestId', 'reply'];
const relationshipFields = ['id', 'personId', 'authorId', 'context', 'since', 'level', 'last', 'note'];
const personFields = ['id', 'name', 'role', 'memberId', 'createdBy', 'phone', 'email', 'linkedin'];
const memberFields = ['id', 'login', 'name', 'personId', 'profileInviteId', 'profileCardId'];
const stringFields = (value, keys) => keys.every(key => !has(value, key) || typeof value[key] === 'string');
const tagFields = value => ['skills', 'markets', 'interests'].every(key => !has(value, key) || (Array.isArray(value[key]) && value[key].every(item => typeof item === 'string')));
const knownNeed = value => hasOnly(value, needFields) && typeof value.text === 'string' &&
  stringFields(value, ['id', 'updatedAt', 'status']) && tagFields(value);
const needList = value => Array.isArray(value)
  ? value.every(knownNeed)
  : plain(value) && Object.values(value).every(item => item === null || knownNeed(item));
const knownProfile = value => hasOnly(value, replyFields) && typeof value.name === 'string' &&
  stringFields(value, replyFields.filter(key => key !== 'needs')) && (!has(value, 'needs') || needList(value.needs));

function date(value) {
  if (!text(value)) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
function tags(value) {
  return [['skills', 'Competenze'], ['markets', 'Ambiti'], ['interests', 'Interessi']]
    .filter(([key]) => list(value[key]))
    .map(([key, label]) => `${label}: ${list(value[key])}`);
}
function need(value) {
  return [shown(value.text), ...tags(value), ...(value.status === 'resolved' ? ['Non più cercata'] : [])].join(' · ');
}
function requests(value) {
  if (has(value, 'needs')) {
    const entries = (Array.isArray(value.needs) ? value.needs : Object.values(value.needs)).filter(Boolean);
    return entries.length ? `Cerca:\n${entries.map(item => `- ${need(item)}`).join('\n')}` : 'Cerca: Non indicato';
  }
  if (knownNeed(value.need)) return `Cerca: ${need(value.need)}`;
  return `Cerca: ${shown(value.need)}`;
}
function contacts(value) {
  const entries = [['phone', 'Telefono'], ['email', 'Email'], ['linkedin', 'LinkedIn']]
    .filter(([key]) => text(value[key])).map(([key, label]) => `${label}: ${text(value[key])}`);
  return entries.length ? entries : ['Recapiti: Non indicati'];
}
function profile(value) {
  return [`Nome: ${shown(value.name)}`, ...(text(value.role) ? [`Ruolo: ${text(value.role)}`] : []),
    `Offre: ${shown(value.help)}`, requests(value), ...contacts(value),
    ...(value.updatedAt ? [`Aggiornata: ${date(value.cardUpdatedAt || value.updatedAt)}`] : [])].join('\n');
}

// Returns plain text. The caller must escape it when rendering HTML.
// Unknown structures retain their complete JSON rather than hiding new fields.
export function formatConflictValue(value) {
  if (value === null || value === undefined) return 'Rimosso';
  if (typeof value !== 'object') return String(value) || 'Vuoto';
  if (Array.isArray(value)) {
    if (!value.length) return 'Vuoto';
    if (value.every(item => typeof item !== 'object')) return value.map(String).join(', ');
    if (value.every(knownNeed)) return value.map(item => `- ${need(item)}`).join('\n');
    return JSON.stringify(value, null, 2);
  }
  if (knownProfile(value)) return profile(value);
  if (hasOnly(value, ['v', 'kind', 'id', 'revision', 'updatedAt', 'profile']) && value.kind === 'card' && knownProfile(value.profile)) {
    return profile({ ...value.profile, updatedAt: value.updatedAt });
  }
  if (knownNeed(value)) return need(value);
  if (hasOnly(value, contributionFields) && has(value, 'help') && has(value, 'authorId') &&
      stringFields(value, ['id', 'personId', 'authorId', 'help', 'collaboration', 'presentation', 'profileRequestId']) && tagFields(value) &&
      (!has(value, 'need') || value.need === null || knownNeed(value.need)) &&
      (!has(value, 'needs') || needList(value.needs)) && (!has(value, 'reply') || knownProfile(value.reply))) {
    return [`Offre: ${shown(value.help)}`, ...tags(value), requests(value),
      ...(text(value.collaboration) ? [`Collaborazioni: ${text(value.collaboration)}`] : []),
      ...(text(value.presentation) ? [`Testo originale: ${text(value.presentation)}`] : []),
      ...(value.reply ? [`Scheda ricevuta:\n${profile(value.reply)}`] : [])].join('\n');
  }
  if (hasOnly(value, relationshipFields) && has(value, 'context') && has(value, 'authorId') && stringFields(value, relationshipFields)) {
    return [['context', 'Come vi conoscete'], ['since', 'Da quando'], ['level', 'Rapporto'], ['last', 'Ultimo contatto'], ['note', 'Nota']]
      .map(([key, label]) => `${label}: ${key === 'last' ? date(value[key]) || 'Non indicato' : shown(value[key])}`).join('\n');
  }
  if (hasOnly(value, personFields) && has(value, 'memberId') && (value.memberId === null || typeof value.memberId === 'string') &&
      typeof value.name === 'string' && stringFields(value, personFields.filter(key => key !== 'memberId'))) {
    return [`Nome: ${shown(value.name)}`, ...(text(value.role) ? [`Ruolo: ${text(value.role)}`] : []), ...contacts(value)].join('\n');
  }
  if (hasOnly(value, memberFields) && typeof value.login === 'string' && typeof value.name === 'string' && stringFields(value, memberFields)) {
    return `Nome: ${shown(value.name)}\nAccount: @${value.login}`;
  }
  if (Object.keys(value).length && needList(value)) {
    const entries = Object.values(value).filter(Boolean);
    return entries.length ? entries.map(item => `- ${need(item)}`).join('\n') : 'Nessuna richiesta';
  }
  return JSON.stringify(value, null, 2);
}
