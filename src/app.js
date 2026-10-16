import { CONFIG } from './config.js';
import { clone, norm, tags, live, keyFor, ensureMember, viewPerson, findPeople, validateNetwork, exportCSV } from './model.js';
import { GitHub } from './github.js';
import { NetworkSync } from './sync.js';
import { listVaults, makeVault, saveVault, openVault, forgetVault } from './vault.js';
import { icon, hydrateIcons } from './icons.js';
import { demoNetwork } from './demo.js';

const root = document.getElementById('rete-tag');
const q = s => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = v => v.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
let user, api, sync, vault, demo = false, selected = null, mode = null, formBase;
let search = '', scope = 'all', filters = { skills: '', markets: '', interests: '', collaboration: '' };
let allowSameName = false, pendingImport, confirmAction, vaultQueue = Promise.resolve(), vaultError = '', releaseLock;
let autoTimer, verified = false;
const data = () => sync.local;
const person = () => data().people[selected] ? viewPerson(data(), data().people[selected]) : null;
const nameOf = id => data().members[id]?.name || 'Partecipante';
const ownPersonId = () => data().members[user.id].personId;
const ownContribution = p => p.contributions.find(c => c.authorId === user.id);
const ownRelationship = p => p.relationships.find(r => r.authorId === user.id);
const offer = p => p.self || ownContribution(p) || p.contributions[0];
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
const showDialog = id => { const d = q(id); if (!d.open) d.showModal(); };
function notice(text) { q('#rs-notice').textContent = text; q('#rs-status').textContent = text; }
function confirm(title, copy, action) {
  q('#confirm-title').textContent = title; q('#confirm-copy').textContent = copy; confirmAction = action; showDialog('#confirm-dialog');
}
function download(value, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const exportJSON = () => download(JSON.stringify(data(), null, 2), `networking-${new Date().toISOString().slice(0, 10)}.json`);
function persist() {
  if (!vault || demo) return;
  const value = clone({ user, token: api.token, ...sync.snapshot() });
  const currentUser = user, currentVault = vault;
  vaultQueue = vaultQueue.then(() => saveVault(currentUser, value, currentVault)).then(() => {
    if (user?.id === currentUser.id) vaultError = '';
  }).catch(() => {
    vaultError = 'Copia locale non salvata: spazio o accesso al browser esaurito. Esporta un backup prima di chiudere.';
    if (user?.id === currentUser.id) notice(vaultError);
  });
}
async function acquireLock(id) {
  if (!navigator.locks) throw new Error('Questo browser non supporta il salvataggio protetto. Accedi senza “Ricorda”.');
  const acquired = await new Promise((resolve, reject) => {
    navigator.locks.request(`networking:${CONFIG.owner}/${CONFIG.repo}:${id}`, { ifAvailable: true }, lock => {
      if (!lock) { resolve(false); return; }
      resolve(true); return new Promise(done => { releaseLock = done; });
    }).catch(reject);
  });
  if (!acquired) throw new Error('La rete è già aperta con questo account in un’altra scheda. Chiudila prima di continuare.');
}
function changed() {
  persist(); render();
  if (sync.pending) showConflicts();
  const labels = { syncing: 'Sincronizzo…', saved: 'Sincronizzato', error: 'Da sincronizzare', conflict: 'Risolvi modifiche', idle: sync.dirty ? 'Da sincronizzare' : 'Sincronizzato' };
  q('#rs-sync-label').textContent = demo ? 'Demo · modifiche temporanee' : labels[sync.status];
  if (sync.error) notice(sync.error.message);
  else if (sync.pending) notice('Ci sono modifiche da confrontare.');
  else if (vaultError) notice(vaultError);
  else if (!demo) notice(!vault ? 'Sessione temporanea. Le modifiche non sincronizzate si perdono chiudendo la pagina.' : '');
}
async function synchronize() {
  if (!sync || demo) return;
  if (sync.pending) { showConflicts(); return; }
  if (!navigator.onLine) { notice('Sei offline. Le modifiche restano qui fino alla prossima sincronizzazione.'); return; }
  if (!verified) {
    try { await api.authorize(user.id); verified = true; }
    catch (e) { notice(e.message); return; }
  }
  await sync.sync();
}
function scheduleSync() { clearTimeout(autoTimer); if (!demo) autoTimer = setTimeout(synchronize, 600); }
function enter(state, identity, client, localVault, isDemo = false) {
  user = identity; api = client; vault = localVault; demo = isDemo;
  sync = new NetworkSync(api, state, changed);
  q('#rs-auth').hidden = true; q('#rs-header').hidden = false; q('#rs-app').hidden = false;
  q('.rs-profile .rs-avatar').textContent = initials(data().members[user.id]?.name || user.name);
  q('#rs-account').textContent = isDemo ? 'Esempi inventati' : `@${user.login}`;
  q('#settings-identity').textContent = isDemo ? 'Demo · nessun dato reale' : `@${user.login} · ${CONFIG.owner}/${CONFIG.repo}`;
  q('#invite-link').hidden = isDemo || user.login.toLowerCase() !== CONFIG.owner.toLowerCase();
  q('[data-action="change-token"]').hidden = isDemo;
  q('[data-action="forget"]').hidden = !localVault;
  if (!sync.pending) sync.edit(d => ensureMember(d, user));
  changed(); scheduleSync();
}
function loginScreen() {
  const accounts = listVaults();
  q('#unlock-form').hidden = !accounts.length; q('#login-form').hidden = !!accounts.length;
  q('#unlock-form').elements.account.innerHTML = accounts.map(a => `<option value="${esc(a.id)}">@${esc(a.login)}</option>`).join('');
  q('#auth-error').textContent = ''; hydrateIcons(root);
}
function resetUI() {
  selected = null; mode = null; formBase = null; search = ''; scope = 'all';
  filters = { skills: '', markets: '', interests: '', collaboration: '' };
  q('#rs-search').value = ''; q('#rs-people').replaceChildren(); q('#rs-detail').replaceChildren();
  q('#rs-count').textContent = '0'; q('#rs-form').reset(); q('#rs-form').hidden = true;
  q('#rs-header').hidden = true; q('#rs-app').hidden = true; q('#rs-auth').hidden = false;
  q('#rs-add').hidden = false; q('#rs-notice').textContent = ''; q('#rs-status').textContent = '';
  q('#rs-filters').hidden = true; root.dataset.view = 'network'; root.dataset.open = 'false';
  for (const d of root.querySelectorAll('dialog[open]')) d.close();
}
async function leave(forget = false) {
  clearTimeout(autoTimer);
  if (sync?.running) await sync.running;
  await vaultQueue;
  if (forget && user) forgetVault(user.id);
  releaseLock?.(); releaseLock = null;
  user = null; api = null; sync = null; vault = null; verified = false; demo = false; vaultError = '';
  resetUI(); loginScreen();
}
function requestLeave(forget = false) {
  const action = () => leave(forget);
  if ((sync?.dirty || sync?.pending) && !demo) confirm(forget ? 'Dimenticare il dispositivo?' : 'Uscire dalla rete?', 'Ci sono modifiche non sincronizzate. Esporta un backup o sincronizza prima di uscire. Confermando, restano recuperabili solo se hai una copia locale protetta e non la elimini.', action);
  else if (forget) confirm('Dimenticare il dispositivo?', 'Rimuove token e copia locale da questo browser. I dati sincronizzati restano nel repository.', action);
  else action();
}
function row(p) {
  const r = ownRelationship(p) || p.relationships[0], o = offer(p);
  const knowers = p.relationships.map(r => r.authorId === user.id ? 'Tu' : nameOf(r.authorId)).join(' e ');
  const summary = p.relationships.length > 1 ? `${p.relationships.length} relazioni` : r ? [r.context, r.since ? `Dal ${r.since}` : ''].filter(Boolean).join(' · ') : 'Relazione da aggiungere';
  return `<button type="button" class="rs-person" data-person="${esc(p.id)}" aria-pressed="${p.id === selected}" aria-controls="rs-detail"><span class="rs-identity"><span class="rs-avatar">${esc(initials(p.name))}</span><span><span class="rs-person-name">${esc(p.name)}${p.memberId ? '<span class="rs-member">Membro</span>' : ''}</span><span class="rs-role">${esc(p.role)}</span></span></span><span class="rs-help">${esc(o?.help || 'Contributo da indicare')}<span class="rs-row-tags">${p.skills.slice(0, 3).map(t => `<span class="rs-tag">${esc(t)}</span>`).join('')}</span></span><span class="rs-relation-cell"><span class="rs-relation-main">${esc(knowers || '—')}</span><span class="rs-relation-sub">${esc(summary)}</span></span>${icon('chevron-right')}</button>`;
}
function detail(p) {
  if (!p) return '';
  const own = p.memberId === user.id, o = offer(p), mine = ownRelationship(p);
  let html = `<div class="rs-detail"><div class="rs-detail-top"><span class="rs-avatar">${esc(initials(p.name))}</span><div class="rs-detail-buttons"><button type="button" class="rs-icon-btn" data-action="edit" aria-label="${own ? 'Modifica il tuo profilo' : p.memberId ? 'Modifica il tuo contributo' : 'Modifica contatto'}">${icon('pencil')}</button><button type="button" class="rs-icon-btn" data-action="close" aria-label="Chiudi scheda">${icon('x')}</button></div></div><h2>${esc(p.name)}</h2><p class="rs-role">${esc(p.role)}</p>${own ? '<span class="rs-self">Il tuo profilo</span>' : p.memberId ? '<span class="rs-self">Membro del gruppo</span>' : ''}<section class="rs-offer"><h3>${p.memberId ? 'Come posso aiutarti?' : 'Come può aiutare?'}</h3><p>${esc(o?.help || 'Da indicare')}</p>${o ? `<span class="rs-source">${icon(o.authorId === p.memberId ? 'user-round' : 'pencil-line')}${o.authorId === p.memberId ? 'Scritto' : 'Aggiunto'} da ${esc(nameOf(o.authorId))}</span>` : ''}`;
  const others = p.contributions.filter(c => c !== o && c.help);
  if (others.length) html += `<details class="rs-observation"><summary>Altri contributi · ${others.length}</summary>${others.map(c => `<p>${esc(c.help)}</p><span class="rs-source">Aggiunto da ${esc(nameOf(c.authorId))}</span>`).join('')}</details>`;
  html += '</section><section class="rs-tags-section" aria-label="Tag della persona">';
  for (const [key, label] of [['skills', 'Competenze'], ['markets', 'Ambiti'], ['interests', 'Interessi']]) if (p[key].length) html += `<div class="rs-tag-group"><span class="rs-tag-label">${label}</span><div class="rs-tag-list">${p[key].map(t => `<span class="rs-tag" title="${esc(p.contributions.filter(c => c[key].some(x => norm(x) === norm(t))).map(c => nameOf(c.authorId)).join(', '))}">${esc(t)}</span>`).join('')}</div></div>`;
  const statuses = p.self ? [p.self] : p.contributions;
  html += `<div class="rs-collaboration"><div><span class="rs-tag-label">Collaborazioni</span>${statuses.length ? statuses.map(c => `<strong>${esc(c.collaboration)}</strong><span class="rs-source">${c.authorId === p.memberId ? 'Dichiarato' : 'Segnalato'} da ${esc(nameOf(c.authorId))}</span>`).join('') : '<strong>Da chiedere</strong>'}</div></div></section>`;
  if (!own) {
    html += `<section class="rs-relations"><h3 class="rs-section-heading">Relazioni · ${p.relationships.length}</h3>`;
    for (const r of p.relationships) html += `<section class="rs-relation" aria-label="Relazione con ${esc(nameOf(r.authorId))}"><div class="rs-rel-head"><strong>${icon('link')}${esc(r.authorId === user.id ? 'Tu' : nameOf(r.authorId))}</strong><span class="rs-closeness">${esc(r.level || 'Rapporto da indicare')}</span></div><p class="rs-context">${esc(r.context || 'Contesto da indicare')}</p><div class="rs-rel-dates"><span>${r.since ? `Dal ${esc(r.since)}` : 'Da quando: da indicare'}</span><span aria-hidden="true">·</span><span>Ultimo contatto ${esc(date(r.last) || 'da indicare')}</span></div>${r.note ? `<details class="rs-note"><summary>Nota</summary><p>${esc(r.note)}</p></details>` : ''}${r.authorId === user.id ? '<button class="rs-text-btn" data-action="relation">Modifica relazione</button>' : ''}</section>`;
    if (!mine) html += `<button type="button" class="rs-text-btn" data-action="relation">${icon('plus')}Lo conosco anch’io</button>`;
    else html += '<div><button type="button" class="rs-text-btn rs-danger" data-action="unlink">Rimuovi dai miei</button></div>';
    html += '</section>';
  }
  return html + '</div>';
}
function render() {
  if (!sync || !user) return;
  const found = findPeople(data(), user.id, { search, scope, filters });
  if (selected && !data().people[selected]) selected = null;
  root.dataset.open = String(!!selected);
  q('#rs-people').innerHTML = found.length ? found.map(row).join('') : `<div class="rs-empty">${search || Object.values(filters).some(Boolean) ? 'Nessun risultato' : scope === 'mine' ? 'La tua rete parte da una persona.' : 'La vostra rete parte da una persona.'}<button type="button" class="rs-text-btn" data-action="${search || Object.values(filters).some(Boolean) ? 'clear' : 'new'}">${search || Object.values(filters).some(Boolean) ? 'Azzera filtri' : 'Aggiungi un contatto'}</button></div>`;
  q('#rs-count').textContent = String(found.length); q('#rs-clear-search').hidden = !search;
  q('#rs-detail').innerHTML = detail(person());
  const active = Object.entries(filters).filter(([, v]) => v);
  q('#rs-filter-count').hidden = !active.length; q('#rs-filter-count').textContent = String(active.length);
  q('#rs-active-filters').hidden = !active.length;
  q('#rs-active-filters').innerHTML = active.map(([key, value]) => `<button type="button" class="rs-active-tag" data-remove-filter="${key}" aria-label="Rimuovi filtro ${esc(value)}">${esc(value)}${icon('x')}</button>`).join('');
  for (const b of root.querySelectorAll('[data-scope]')) b.setAttribute('aria-pressed', String(b.dataset.scope === scope));
  for (const key of ['skills', 'markets', 'interests']) {
    const values = [...new Set(live(data().people).flatMap(p => viewPerson(data(), p)[key]).concat(filters[key] || []))].sort((a, b) => a.localeCompare(b, 'it'));
    q('#rs-filter-' + key).innerHTML = '<option value="">Qualsiasi</option>' + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    q('#rs-filter-' + key).value = filters[key];
  }
  q('#rs-filter-collaboration').value = filters.collaboration;
  q('.rs-profile .rs-avatar').textContent = initials(data().members[user.id].name);
}
function clearFilters() { search = ''; scope = 'all'; q('#rs-search').value = ''; for (const k of Object.keys(filters)) filters[k] = ''; }
function closeForm() { mode = null; formBase = null; q('#rs-form').hidden = true; q('#rs-add').hidden = false; root.dataset.view = 'network'; }
function closeDetail() {
  const old = selected; selected = null; render();
  Array.from(q('#rs-people').querySelectorAll('[data-person]')).find(b => b.dataset.person === old)?.focus();
}
function openForm(kind) {
  if (sync.pending) { showConflicts(); return; }
  const form = q('#rs-form'), f = form.elements, p = kind === 'new' ? null : person();
  mode = kind; formBase = clone(data()); form.reset(); allowSameName = false;
  const own = kind === 'profile', relationOnly = kind === 'relation';
  q('#rs-extra').open = false; q('#rs-tags-editor').open = false; q('#rs-matches').hidden = true; q('#rs-name-conflict').hidden = true;
  q('#rs-basics').hidden = relationOnly; q('#rs-tags-editor').hidden = relationOnly;
  q('#rs-form-relation').hidden = own || (kind === 'edit' && !ownRelationship(p));
  q('#rs-help-label').textContent = own ? 'Come posso aiutarti?' : 'Come può aiutare?';
  q('#rs-form-title').textContent = own ? 'Il tuo profilo' : relationOnly ? 'La tua relazione' : kind === 'new' ? 'Nuovo contatto' : 'Il tuo contributo';
  q('#rs-form-person').hidden = !relationOnly; q('#rs-form-person').textContent = p?.name || '';
  f.personName.required = !relationOnly; f.personName.disabled = !own && !!p?.memberId;
  f.personRole.disabled = !own && !!p?.memberId;
  q('#rs-form-source').textContent = own ? 'La tua presentazione, visibile al gruppo.' : 'Il tuo contributo e le tue note sono visibili al gruppo.';
  if (kind !== 'new') {
    const c = ownContribution(p), r = ownRelationship(p);
    f.personName.value = p.name; f.personRole.value = p.role; f.personHelp.value = c?.help || '';
    for (const key of ['Skills', 'Markets', 'Interests']) f['person' + key].value = c?.[key.toLowerCase()]?.join(', ') || '';
    f.personCollaboration.value = c?.collaboration || 'Da chiedere';
    for (const [field, key] of [['Context', 'context'], ['Since', 'since'], ['Level', 'level'], ['Last', 'last'], ['Note', 'note']]) f['person' + field].value = r?.[key] || '';
  }
  root.dataset.view = 'form'; form.hidden = false; q('#rs-add').hidden = true;
  (relationOnly ? f.personContext : f.personName.disabled ? f.personHelp : f.personName).focus();
}
function showMatches(force = false) {
  if (mode !== 'new') return;
  const term = norm(q('#rs-name').value.trim());
  const found = term.length >= 2 ? live(data().people).filter(p => norm(p.name).includes(term)).slice(0, 5) : [];
  q('#rs-matches').innerHTML = found.map(p => `<button type="button" class="rs-match" data-existing="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.role)} · ${p.id === ownPersonId() ? 'Il tuo profilo' : data().relationships[keyFor(p.id, user.id)] ? 'Già nei miei' : 'Già nella rete'}</small></button>`).join('');
  q('#rs-matches').hidden = !found.length; q('#rs-name-conflict').hidden = !force;
}
function saveForm(e) {
  e.preventDefault();
  try {
    const f = e.currentTarget.elements, fresh = mode === 'new', own = mode === 'profile', relationOnly = mode === 'relation';
    const name = f.personName.value.trim();
    if (fresh && !allowSameName && live(data().people).some(p => norm(p.name) === norm(name))) { showMatches(true); f.personName.focus(); return; }
    const id = fresh ? crypto.randomUUID() : selected;
    const showRelationship = !q('#rs-form-relation').hidden;
    sync.edit(d => {
      if (fresh) d.people[id] = { id, name, role: '', memberId: null, createdBy: user.id };
      const p = d.people[id], key = keyFor(id, user.id);
      if (!p) throw new Error('Questa scheda non esiste più.');
      if (!relationOnly) {
        if (!p.memberId || own) { p.name = name; p.role = f.personRole.value.trim(); }
        if (own) d.members[user.id].name = name;
        d.contributions[key] = { id: key, personId: id, authorId: user.id, help: f.personHelp.value.trim(), skills: tags(f.personSkills.value), markets: tags(f.personMarkets.value), interests: tags(f.personInterests.value), collaboration: f.personCollaboration.value };
      }
      if (showRelationship) d.relationships[key] = { id: key, personId: id, authorId: user.id, context: f.personContext.value.trim(), since: f.personSince.value.trim(), level: f.personLevel.value, last: f.personLast.value, note: f.personNote.value.trim() };
    }, formBase);
    selected = id; clearFilters(); closeForm(); render(); scheduleSync();
  } catch (e) { notice(e.message); }
}
const fieldNames = { name: 'Nome', role: 'Ruolo', help: 'Come può aiutare', skills: 'Competenze', markets: 'Ambiti', interests: 'Interessi', collaboration: 'Collaborazioni', context: 'Contesto', since: 'Dal', level: 'Rapporto', last: 'Ultimo contatto', note: 'Nota', login: 'Account' };
function conflictValue(v) { return v === null || v === undefined ? 'Rimosso' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v) || 'Vuoto'; }
function showConflicts() {
  const p = sync.pending; if (!p) return;
  const labels = p.source === 'import' ? ['Nella rete', 'Nel file'] : p.source === 'edit' ? ['Nel modulo', 'Nella rete'] : ['Su questo dispositivo', 'Nel repository'];
  q('#conflict-items').innerHTML = p.conflicts.map((c, i) => {
    const record = p.data[c.path[0]]?.[c.path[1]], personId = record?.personId || (c.path[0] === 'people' ? c.path[1] : null);
    const personName = p.data.people[personId]?.name || record?.name || 'Scheda';
    return `<div class="rs-conflict"><fieldset><legend>${esc(personName)} · ${esc(fieldNames[c.path.at(-1)] || 'Scheda')}</legend>${['local', 'remote'].map((side, j) => `<label><input type="radio" name="conflict-${i}" value="${side}" required><span><small>${labels[j]}</small>${esc(conflictValue(c[side]))}</span></label>`).join('')}</fieldset></div>`;
  }).join('');
  for (const d of root.querySelectorAll('dialog[open]')) if (d.id !== 'conflict-dialog') d.close();
  showDialog('#conflict-dialog');
}
q('#login-form').elements.remember.addEventListener('change', e => {
  q('#remember-password').hidden = !e.target.checked; q('#login-form').elements.password.required = e.target.checked;
});
q('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, f = form.elements; const button = form.querySelector('[type="submit"]');
  button.disabled = true; q('#auth-error').textContent = '';
  try {
    const client = new GitHub(f.token.value.trim()), identity = await client.authorize();
    if (listVaults().some(a => a.id === identity.id)) throw new Error('Hai già una copia locale per questo account. Sbloccala per conservare le modifiche. Puoi aggiornare il token dalle impostazioni.');
    const remote = await client.read(); await acquireLock(identity.id);
    const localVault = f.remember.checked ? await makeVault(f.password.value) : null;
    verified = true; enter({ base: remote.data, local: remote.data, sha: remote.sha }, identity, client, localVault);
    form.reset(); q('#remember-password').hidden = true; f.password.required = false;
  } catch (error) { releaseLock?.(); releaseLock = null; q('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});
q('#unlock-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, f = form.elements, button = form.querySelector('[type="submit"]');
  button.disabled = true; q('#auth-error').textContent = '';
  try {
    const { value, vault: localVault } = await openVault(f.account.value, f.password.value);
    validateNetwork(value.base); validateNetwork(value.local);
    if (value.user.id !== f.account.value) throw new Error('Identità della cache non corrispondente.');
    await acquireLock(value.user.id);
    const client = new GitHub(value.token); verified = false;
    let warning = '';
    try { await client.authorize(value.user.id); verified = true; } catch (error) { warning = error.message; }
    enter(value, value.user, client, localVault); form.reset(); if (warning) notice(warning);
  } catch (error) { releaseLock?.(); releaseLock = null; q('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});
q('#token-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, b = form.querySelector('[type="submit"]'); b.disabled = true;
  try {
    const client = new GitHub(form.elements.token.value.trim()); await client.authorize(user.id);
    api = client; sync.api = client; verified = true; persist(); form.reset(); q('#token-error').textContent = ''; q('#token-dialog').close(); await synchronize();
  } catch (e) { q('#token-error').textContent = e.message; } finally { b.disabled = false; }
});
q('#conflict-form').addEventListener('submit', e => {
  e.preventDefault();
  try { const choices = sync.pending.conflicts.map((_, i) => new FormData(e.currentTarget).get(`conflict-${i}`)); sync.resolve(choices); q('#conflict-dialog').close(); scheduleSync(); }
  catch (e) { notice('Queste scelte non formano un archivio coerente. Esporta le versioni e scegli schede e riferimenti compatibili.'); }
});
q('#conflict-dialog').addEventListener('cancel', e => { e.preventDefault(); });
q('#rs-form').addEventListener('submit', saveForm);
q('#rs-search').addEventListener('input', e => { search = e.target.value; render(); });
q('#rs-name').addEventListener('input', () => { allowSameName = false; showMatches(); });
for (const key of Object.keys(filters)) q('#rs-filter-' + key).addEventListener('change', e => { filters[key] = e.target.value; render(); });
q('#import-file').addEventListener('change', async e => {
  try {
    const file = e.target.files[0]; if (!file) return; if (file.size > 900000) throw new Error('File troppo grande (massimo 900 KB).');
    pendingImport = validateNetwork(JSON.parse(await file.text()));
    const incoming = live(pendingImport.people), newPeople = incoming.filter(p => !data().people[p.id]);
    q('#import-summary').textContent = `${incoming.length} persone nel file · ${newPeople.length} nuove · ${incoming.length - newPeople.length} già presenti.`;
    showDialog('#import-dialog');
  } catch (e) { notice(e.message); } finally { e.target.value = ''; }
});
root.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  try {
    if (b.dataset.removeFilter) { filters[b.dataset.removeFilter] = ''; render(); return; }
    if (b.dataset.scope) { scope = b.dataset.scope; render(); return; }
    if (b.dataset.person) { selected = b.dataset.person; render(); q('#rs-detail button')?.focus(); return; }
    if (b.dataset.existing) {
      selected = b.dataset.existing; clearFilters(); closeForm(); render();
      if (selected !== ownPersonId() && !ownRelationship(person())) openForm('relation'); else q('#rs-detail button')?.focus(); return;
    }
    const a = b.dataset.action;
    if (a === 'new') openForm('new');
    if (a === 'profile') { selected = ownPersonId(); closeForm(); render(); q('#rs-detail button')?.focus(); }
    if (a === 'edit') openForm(selected === ownPersonId() ? 'profile' : 'edit');
    if (a === 'relation') openForm('relation');
    if (a === 'cancel') { closeForm(); render(); selected ? q('#rs-detail button')?.focus() : q('#rs-add').focus(); }
    if (a === 'close') closeDetail();
    if (a === 'clear') { clearFilters(); render(); }
    if (a === 'clear-search') { search = ''; q('#rs-search').value = ''; render(); q('#rs-search').focus(); }
    if (a === 'filters') { const hidden = !q('#rs-filters').hidden; q('#rs-filters').hidden = hidden; b.setAttribute('aria-expanded', String(!hidden)); }
    if (a === 'close-filters') { q('#rs-filters').hidden = true; q('#rs-filter-button').setAttribute('aria-expanded', 'false'); q('#rs-filter-button').focus(); }
    if (a === 'reset-tags') { for (const k of Object.keys(filters)) filters[k] = ''; render(); }
    if (a === 'different-person') { allowSameName = true; q('#rs-matches').hidden = true; q('#rs-name-conflict').hidden = true; q('#rs-form [type="submit"]').focus(); }
    if (a === 'sync') await synchronize();
    if (a === 'settings') showDialog('#settings-dialog');
    if (a === 'close-dialog') b.closest('dialog').close();
    if (a === 'other-account') { q('#unlock-form').hidden = true; q('#login-form').hidden = false; }
    if (a === 'demo') { const d = demoNetwork(); enter({ base: d.data, local: d.data, sha: 'demo' }, d.user, null, null, true); }
    if (a === 'export-json') exportJSON();
    if (a === 'export-csv') download(exportCSV(data()), 'networking.csv', 'text/csv;charset=utf-8');
    if (a === 'import') { if (sync.pending) return showConflicts(); q('#settings-dialog').close(); q('#import-file').click(); }
    if (a === 'cancel-import') { pendingImport = null; q('#import-dialog').close(); }
    if (a === 'confirm-import') { const incoming = clone(pendingImport); pendingImport = null; q('#import-dialog').close(); sync.import(incoming); scheduleSync(); }
    if (a === 'export-conflict') download(JSON.stringify({ format: 'networking-conflict-backup', source: sync.pending.source, ...sync.snapshot(), incoming: sync.pending.remote, conflicts: sync.pending.conflicts }, null, 2), 'networking-conflitto.json');
    if (a === 'change-token') { q('#settings-dialog').close(); showDialog('#token-dialog'); }
    if (a === 'logout') requestLeave();
    if (a === 'forget') requestLeave(true);
    if (a === 'confirm-no') { confirmAction = null; q('#confirm-dialog').close(); }
    if (a === 'confirm-yes') { const action = confirmAction; confirmAction = null; q('#confirm-dialog').close(); await action?.(); }
    if (a === 'unlink') {
      const id = selected;
      confirm('Rimuovere dai tuoi contatti?', 'Rimuove solo la tua relazione. La persona e i contributi restano nella rete condivisa.', () => { sync.edit(d => { d.relationships[keyFor(id, user.id)] = null; }); render(); scheduleSync(); });
    }
  } catch (e) { notice(e.message); }
});
root.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.querySelector('dialog[open]')) { if (mode) { closeForm(); render(); } else if (selected) closeDetail(); } });
window.addEventListener('online', synchronize);
window.addEventListener('offline', () => { if (sync && !demo) notice('Sei offline. Le modifiche si sincronizzeranno al ritorno della connessione.'); });
window.addEventListener('beforeunload', e => { if ((sync?.dirty || sync?.pending) && !demo) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sync && !mode) synchronize(); });
setInterval(() => { if (sync && !mode && document.visibilityState === 'visible') synchronize(); }, 45000);
loginScreen();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
