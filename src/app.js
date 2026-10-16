import { CONFIG } from './config.js';
import { clone, norm, live, keyFor, ensureMember, viewPerson, findPeople, validateNetwork, exportCSV, removeFromNetwork } from './model.js';
import { GitHub } from './github.js';
import { NetworkSync } from './sync.js';
import { listVaults, makeVault, saveVault, openVault, forgetVault } from './vault.js';
import { icon, hydrateIcons } from './icons.js';
import { demoNetwork } from './demo.js';
import { normalizeLinkedIn, draftFromText, suggestedTags } from './profile.js';
import { TagEditor } from './tag-editor.js';

const root = document.getElementById('rete-tag');
const q = s => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = v => v.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
let user, api, sync, vault, demo = false, selected = null, mode = null, formBase, editingId = null;
let search = '', scope = 'mine', filters = { skills: '', markets: '', interests: '', collaboration: '' };
let allowSameName = false, pendingImport, confirmAction, vaultQueue = Promise.resolve(), vaultError = '', releaseLock;
let autoTimer, verified = false, draftUndo = null, importedSuggestions = {}, joinGuideShown = false;
const tagEditors = Object.fromEntries([['skills', 'Competenze'], ['markets', 'Settori'], ['interests', 'Interessi']].map(([key, label]) => [key, new TagEditor(q('#rs-' + key + '-editor'), key, label)]));
const data = () => sync.local;
const person = () => data().people[selected] ? viewPerson(data(), data().people[selected]) : null;
const nameOf = id => data().members[id]?.name || 'Partecipante';
const ownPersonId = () => data().members[user.id].personId;
const ownContribution = p => p.contributions.find(c => c.authorId === user.id);
const ownRelationship = p => p.relationships.find(r => r.authorId === user.id);
const offer = p => p.self || ownContribution(p) || p.contributions[0];
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
const owner = () => !demo && user?.login.toLowerCase() === CONFIG.owner.toLowerCase();
const showDialog = id => { const d = q(id); if (!d.open) d.showModal(); };
function notice(text) { q('#rs-notice').textContent = text; q('#rs-status').textContent = text; }
function confirm(title, copy, action, label = 'Conferma') {
  q('#confirm-title').textContent = title; q('#confirm-copy').textContent = copy; confirmAction = action; showDialog('#confirm-dialog');
  const button = q('[data-action="confirm-yes"]'); button.textContent = label; button.classList.toggle('rs-destructive', ['Elimina', 'Rimuovi'].includes(label));
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
  const labels = { syncing: 'Salvo…', saved: 'Salvato su GitHub', error: 'Da sincronizzare', conflict: 'Risolvi modifiche', idle: sync.dirty ? 'Da salvare' : 'Salvato su GitHub' };
  q('#rs-sync-label').textContent = demo ? 'Demo · modifiche temporanee' : labels[sync.status];
  if (sync.error) notice(sync.error.message);
  else if (sync.pending) notice('Ci sono modifiche da confrontare.');
  else if (vaultError) notice(vaultError);
  else notice('');
  q('#rs-remember').hidden = demo || !!vault;
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
  const firstVisit = !state.local.members[identity.id];
  user = identity; api = client; vault = localVault; demo = isDemo;
  sync = new NetworkSync(api, state, changed);
  q('#rs-auth').hidden = true; q('#rs-header').hidden = false; q('#rs-app').hidden = false;
  q('.rs-profile .rs-avatar').textContent = initials(data().members[user.id]?.name || user.name);
  q('#rs-account').textContent = isDemo ? 'Esempi inventati' : `@${user.login}`;
  q('#settings-identity').textContent = isDemo ? 'Demo · nessun dato reale' : `@${user.login} · Rete condivisa`;
  q('#invite-link').hidden = !owner();
  q('[data-action="change-token"]').hidden = isDemo;
  q('[data-action="forget"]').hidden = !localVault;
  if (!sync.pending) sync.edit(d => ensureMember(d, user));
  changed(); scheduleSync();
  if (firstVisit && !sync.pending) { selected = ownPersonId(); render(); openForm('profile'); }
}
function loginScreen() {
  const accounts = listVaults();
  q('#unlock-form').hidden = !accounts.length; q('#login-form').hidden = !!accounts.length;
  q('#unlock-form').elements.account.innerHTML = accounts.map(a => `<option value="${esc(a.id)}">@${esc(a.login)}</option>`).join('');
  q('#auth-error').textContent = ''; hydrateIcons(root);
  if (!accounts.length && !joinGuideShown && window.location?.hash === '#join') { joinGuideShown = true; openAccessGuide('guest'); }
}
function openAccessGuide(role = 'guest') {
  for (const b of root.querySelectorAll('[data-access-role]')) b.setAttribute('aria-pressed', String(b.dataset.accessRole === role));
  q('#access-guest').hidden = role !== 'guest'; q('#access-owner').hidden = role !== 'owner';
  showDialog('#access-dialog');
}
function openTeam() {
  q('#settings-dialog').close();
  q('#team-members').innerHTML = live(data().members).map(m => `<li><span class="rs-avatar">${esc(initials(m.name))}</span><span><strong>${esc(m.name)}${m.id === user.id ? ' · Tu' : ''}</strong><small>@${esc(m.login)}</small></span></li>`).join('');
  q('#team-invite').hidden = !owner(); q('#team-demo').hidden = !demo;
  q('#team-copy-status').textContent = '';
  q('#team-invite-url').value = new URL('#join', window.location.href).href;
  showDialog('#team-dialog');
}
async function copyTeamLink() {
  const input = q('#team-invite-url');
  try { await navigator.clipboard.writeText(input.value); q('#team-copy-status').textContent = 'Link copiato. Mandalo dopo l’invito su GitHub.'; }
  catch { input.focus(); input.select(); q('#team-copy-status').textContent = 'Copia il link selezionato.'; }
}
function resetUI() {
  selected = null; mode = null; formBase = null; editingId = null; search = ''; scope = 'mine';
  pendingImport = null; draftUndo = null; importedSuggestions = {}; confirmAction = null;
  filters = { skills: '', markets: '', interests: '', collaboration: '' };
  q('#rs-search').value = '';
  for (const selector of ['#rs-people', '#rs-detail', '#team-members', '#rs-matches', '#conflict-items', '#rs-active-filters']) q(selector).replaceChildren();
  for (const selector of ['#settings-identity', '#rs-account', '#import-summary', '#confirm-title', '#confirm-copy', '#rs-form-person', '#rs-form-eyebrow', '#rs-relation-caption']) q(selector).textContent = '';
  for (const key of ['skills', 'markets', 'interests']) q('#rs-filter-' + key).innerHTML = '<option value="">Qualsiasi</option>';
  for (const editor of Object.values(tagEditors)) editor.set();
  for (const selector of ['#rs-form', '#draft-form', '#token-form', '#remember-form']) q(selector).reset();
  q('#rs-count').textContent = '0'; q('#rs-form').hidden = true;
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
  const summary = r ? [r.context, r.since ? `Dal ${r.since}` : '', r.level].filter(Boolean).join(' · ') : p.memberId ? 'Nel team' : '';
  return `<button type="button" class="rs-person" data-person="${esc(p.id)}" aria-pressed="${p.id === selected}" aria-controls="rs-detail"><span class="rs-identity"><span class="rs-avatar">${esc(initials(p.name))}</span><span><span class="rs-person-name">${esc(p.name)}${p.memberId ? '<span class="rs-member">Membro</span>' : ''}</span><span class="rs-role">${esc(p.role)}</span></span></span><span class="rs-help">${esc(o?.help || 'Contributo da indicare')}<span class="rs-row-tags">${p.skills.slice(0, 3).map(t => `<span class="rs-tag">${esc(t)}</span>`).join('')}</span></span><span class="rs-relation-cell"><span class="rs-relation-main">${esc(knowers || '—')}</span><span class="rs-relation-sub">${esc(summary)}</span></span>${icon('chevron-right')}</button>`;
}
function detail(p) {
  if (!p) return '';
  const own = p.memberId === user.id, o = offer(p), mine = ownRelationship(p);
  let html = `<div class="rs-detail"><div class="rs-detail-top"><span class="rs-avatar">${esc(initials(p.name))}</span><div class="rs-detail-buttons"><button type="button" class="rs-icon-btn" data-action="edit" aria-label="${own ? 'Modifica il tuo profilo' : p.memberId ? 'Modifica il tuo contributo' : 'Modifica contatto'}">${icon('pencil')}</button><button type="button" class="rs-icon-btn" data-action="close" aria-label="Chiudi scheda">${icon('x')}</button></div></div><h2>${esc(p.name)}</h2><p class="rs-role">${esc(p.role)}</p>${own ? '<span class="rs-self">Il tuo profilo</span>' : p.memberId ? '<span class="rs-self">Membro del gruppo</span>' : ''}<section class="rs-offer"><h3>${p.memberId ? 'Puoi contattarmi per' : 'Da coinvolgere per'}</h3><p>${esc(o?.help || 'Da indicare')}</p>${o ? `<span class="rs-source">${icon(o.authorId === p.memberId ? 'user-round' : 'pencil-line')}${o.authorId === p.memberId ? 'Scritto' : 'Aggiunto'} da ${esc(nameOf(o.authorId))}</span>` : ''}`;
  const others = p.contributions.filter(c => c !== o && c.help);
  if (others.length) html += `<details class="rs-observation"><summary>Altri contributi · ${others.length}</summary>${others.map(c => `<p>${esc(c.help)}</p><span class="rs-source">Aggiunto da ${esc(nameOf(c.authorId))}</span>`).join('')}</details>`;
  html += '</section><section class="rs-tags-section" aria-label="Tag della persona">';
  for (const [key, label] of [['skills', 'Competenze'], ['markets', 'Settori'], ['interests', 'Interessi']]) if (p[key].length) html += `<div class="rs-tag-group"><span class="rs-tag-label">${label}</span><div class="rs-tag-list">${p[key].map(t => `<span class="rs-tag" title="${esc(p.contributions.filter(c => c[key].some(x => norm(x) === norm(t))).map(c => nameOf(c.authorId)).join(', '))}">${esc(t)}</span>`).join('')}</div></div>`;
  const statuses = p.self ? [p.self] : p.contributions;
  html += `<div class="rs-collaboration"><div><span class="rs-tag-label">Collaborazioni</span>${statuses.length ? statuses.map(c => `<strong>${esc(c.collaboration === 'Aperto' ? 'Disponibile' : c.collaboration === 'Non disponibile' ? 'Non ora' : c.authorId === p.memberId ? 'Non indicata' : 'Da verificare')}</strong><span class="rs-source">${c.authorId === p.memberId ? 'Dichiarato' : 'Segnalato'} da ${esc(nameOf(c.authorId))}</span>`).join('') : '<strong>Da chiedere</strong>'}</div></div></section>`;
  if (!own) {
    html += `<section class="rs-relations"><h3 class="rs-section-heading">Relazioni · ${p.relationships.length}</h3>`;
    for (const r of p.relationships) html += `<section class="rs-relation" aria-label="Relazione con ${esc(nameOf(r.authorId))}"><div class="rs-rel-head"><strong>${icon('link')}${esc(r.authorId === user.id ? 'Tu' : nameOf(r.authorId))}</strong><span class="rs-closeness">${esc(r.level || 'Rapporto da indicare')}</span></div><p class="rs-context">${esc(r.context || 'Contesto da indicare')}</p><div class="rs-rel-dates"><span>${r.since ? `Dal ${esc(r.since)}` : 'Da quando: da indicare'}</span><span aria-hidden="true">·</span><span>Ultimo contatto ${esc(date(r.last) || 'da indicare')}</span></div>${r.note ? `<details class="rs-note"><summary>Nota</summary><p>${esc(r.note)}</p></details>` : ''}${r.authorId === user.id ? '<button class="rs-text-btn" data-action="relation">Modifica relazione</button>' : ''}</section>`;
    if (!mine) html += `<button type="button" class="rs-text-btn" data-action="relation">${icon('plus')}Lo conosco anch’io</button>`;
    html += '</section>';
  }
  if (p.linkedin) html += `<a class="rs-profile-link" href="${esc(normalizeLinkedIn(p.linkedin))}" target="_blank" rel="noopener noreferrer">${icon('link')}Profilo LinkedIn ↗</a>`;
  if (!own && (mine || ownContribution(p) || (!p.memberId && p.createdBy === user.id && !p.relationships.length && !p.contributions.length))) html += '<div class="rs-person-actions"><button type="button" class="rs-text-btn rs-danger" data-action="remove-person">Rimuovi dalla mia rete</button></div>';
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
    const values = [...new Map(live(data().people).flatMap(p => viewPerson(data(), p)[key]).concat(filters[key] || []).map(value => [norm(value), value])).values()].sort((a, b) => a.localeCompare(b, 'it'));
    q('#rs-filter-' + key).innerHTML = '<option value="">Qualsiasi</option>' + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    q('#rs-filter-' + key).value = filters[key];
  }
  q('#rs-filter-collaboration').value = filters.collaboration;
  q('.rs-profile .rs-avatar').textContent = initials(data().members[user.id].name);
}
function clearFilters() { search = ''; q('#rs-search').value = ''; for (const k of Object.keys(filters)) filters[k] = ''; }
function closeForm() { mode = null; formBase = null; editingId = null; q('#rs-form').hidden = true; q('#rs-add').hidden = false; root.dataset.view = 'network'; }
function closeDetail() {
  const old = selected; selected = null; render();
  Array.from(q('#rs-people').querySelectorAll('[data-person]')).find(b => b.dataset.person === old)?.focus();
}
function tagPool(key) { return [...new Set(live(data().contributions).flatMap(c => c[key]))]; }
function refreshSuggestions() {
  if (!mode) return;
  const f = q('#rs-form').elements;
  const suggested = suggestedTags([f.personHelp.value, f.personRole.value].join(' '), Object.fromEntries(Object.keys(tagEditors).map(k => [k, tagPool(k)])));
  for (const [key, editor] of Object.entries(tagEditors)) editor.suggest([...suggested[key], ...(importedSuggestions[key] || [])]);
}
function updateChoices() {
  const f = q('#rs-form').elements;
  for (const b of q('#rs-level-choices').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.level === f.personLevel.value));
  for (const b of q('#rs-collaboration-choices').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.collaboration === f.personCollaboration.value));
}
function openForm(kind) {
  if (sync.pending) { showConflicts(); return; }
  const form = q('#rs-form'), f = form.elements, p = kind === 'new' ? null : person();
  if (kind !== 'new' && !p) return;
  mode = kind; formBase = clone(data()); editingId = p?.id || null; form.reset(); allowSameName = false; draftUndo = null; importedSuggestions = {};
  const own = kind === 'profile', relationOnly = kind === 'relation';
  q('#rs-extra').open = false; q('#rs-tags-editor').open = false; q('#rs-matches').hidden = true; q('#rs-name-conflict').hidden = true; q('#rs-draft-applied').hidden = true;
  q('#rs-basics').hidden = relationOnly; q('#rs-more').hidden = relationOnly; q('#rs-quick-start').hidden = relationOnly;
  q('#rs-form-relation').hidden = own || (kind === 'edit' && !ownRelationship(p));
  q('#rs-help-label').textContent = own ? 'Posso aiutare con…' : 'Può aiutare con…';
  q('#rs-help-hint').textContent = own ? 'Problemi che sai risolvere, esperienza da condividere, contatti che puoi aprire.' : 'Esperienza, idee, contatti: cosa potrebbe portare?';
  f.personHelp.placeholder = own ? 'Es. Trasformare un’idea in un servizio, valutare una soluzione, aprire una conversazione…' : 'Es. Dare forma a un brand, trovare partner, confrontarsi su un settore…';
  q('#rs-form-title').textContent = own ? 'Cosa porti nella rete?' : relationOnly ? 'Come vi conoscete?' : kind === 'new' ? 'Aggiungi una persona' : p.memberId ? 'Il tuo punto di vista' : 'La sua scheda';
  q('#rs-form-eyebrow').textContent = own ? 'Il tuo profilo' : relationOnly ? p.name : 'La vostra rete';
  q('#rs-form-person').hidden = false;
  q('#rs-form-person').textContent = own ? 'Aiuta gli altri a capire quando coinvolgerti.' : relationOnly ? 'Una persona, più collegamenti. Aggiungi il tuo.' : 'Basta ciò che sai. Il resto può arrivare dopo.';
  q('#rs-relation-caption').textContent = p ? `Come puoi mettere il gruppo in contatto con ${p.name}.` : 'Il collegamento che il gruppo può attivare.';
  q('#rs-availability-label').textContent = own ? 'Vuoi essere coinvolto in nuove collaborazioni?' : 'Disponibilità a collaborare';
  q('#rs-availability-unknown').textContent = own ? 'Non indicata' : 'Da verificare';
  q('#rs-save').innerHTML = (own ? 'Salva profilo' : relationOnly ? (ownRelationship(p) ? 'Salva relazione' : 'Aggiungi relazione') : 'Salva persona') + icon('check');
  f.personName.required = !relationOnly; f.personName.disabled = !own && !!p?.memberId;
  f.personRole.disabled = !own && !!p?.memberId; f.personLinkedin.disabled = !own && !!p?.memberId; f.personLinkedin.setCustomValidity('');
  q('#rs-form-source').textContent = own ? 'Il tuo profilo, visibile al gruppo.' : 'Visibile al gruppo · il tuo contributo.';
  const c = p ? ownContribution(p) : null, r = p ? ownRelationship(p) : null;
  if (p) { f.personName.value = p.name; f.personRole.value = p.role; f.personHelp.value = c?.help || ''; f.personLinkedin.value = p.linkedin || ''; }
  f.personCollaboration.value = c?.collaboration || 'Da chiedere';
  for (const [field, key] of [['Context', 'context'], ['Since', 'since'], ['Level', 'level'], ['Last', 'last'], ['Note', 'note']]) f['person' + field].value = r?.[key] || '';
  for (const [key, editor] of Object.entries(tagEditors)) editor.set(c?.[key] || [], tagPool(key));
  updateChoices(); refreshSuggestions();
  root.dataset.view = 'form'; form.hidden = false; q('#rs-add').hidden = true;
  (relationOnly ? f.personContext : own ? f.personHelp : f.personName.disabled ? f.personHelp : f.personName).focus({ preventScroll: true });
  window.scrollTo?.({ top: 0, behavior: 'instant' });
}
function matchingPeople() {
  const f = q('#rs-form').elements, term = norm(f.personName.value.trim());
  let linkedin = ''; try { linkedin = normalizeLinkedIn(f.personLinkedin.value); } catch {}
  return live(data().people).filter(p => (term.length >= 2 && norm(p.name).includes(term)) || (linkedin && p.linkedin && normalizeLinkedIn(p.linkedin) === linkedin)).slice(0, 5);
}
function showMatches(force = false) {
  if (mode !== 'new') return;
  const found = matchingPeople();
  q('#rs-matches').innerHTML = found.map(p => `<button type="button" class="rs-match" data-existing="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.role)} · ${p.id === ownPersonId() ? 'Il tuo profilo' : data().relationships[keyFor(p.id, user.id)] ? 'Già nei miei' : 'Già nella rete'}</small></button>`).join('');
  q('#rs-matches').hidden = !found.length; q('#rs-name-conflict').hidden = !force;
}
function formSnapshot() {
  const f = q('#rs-form').elements;
  return { fields: Object.fromEntries(['personName', 'personRole', 'personHelp', 'personLinkedin'].map(k => [k, f[k].value])), tags: Object.fromEntries(Object.entries(tagEditors).map(([k, e]) => [k, [...e.values]])) };
}
function saveForm(e) {
  e.preventDefault();
  try {
    const f = e.currentTarget.elements, fresh = mode === 'new', own = mode === 'profile', relationOnly = mode === 'relation';
    const name = f.personName.value.trim();
    let linkedin = '';
    try { linkedin = normalizeLinkedIn(f.personLinkedin.value); f.personLinkedin.value = linkedin; }
    catch (error) { q('#rs-tags-editor').open = true; f.personLinkedin.setCustomValidity(error.message); f.personLinkedin.reportValidity(); return; }
    const sameProfile = fresh && linkedin && live(data().people).some(p => p.linkedin && normalizeLinkedIn(p.linkedin) === linkedin);
    if (fresh && (sameProfile || (!allowSameName && live(data().people).some(p => norm(p.name) === norm(name))))) { showMatches(true); q('[data-action="different-person"]').hidden = !!sameProfile; f.personName.focus(); return; }
    const id = fresh ? crypto.randomUUID() : editingId;
    const showRelationship = !q('#rs-form-relation').hidden;
    for (const editor of Object.values(tagEditors)) editor.commit();
    sync.edit(d => {
      if (fresh) d.people[id] = { id, name, role: '', memberId: null, createdBy: user.id };
      const p = d.people[id], key = keyFor(id, user.id);
      if (!p) throw new Error('Questa scheda non esiste più.');
      if (!relationOnly) {
        if (!p.memberId || own) { p.name = name; p.role = f.personRole.value.trim(); if (linkedin || Object.hasOwn(p, 'linkedin')) p.linkedin = linkedin; }
        if (own) d.members[user.id].name = name;
        d.contributions[key] = { id: key, personId: id, authorId: user.id, help: f.personHelp.value.trim(), skills: [...tagEditors.skills.values], markets: [...tagEditors.markets.values], interests: [...tagEditors.interests.values], collaboration: f.personCollaboration.value };
      }
      if (showRelationship) d.relationships[key] = { id: key, personId: id, authorId: user.id, context: f.personContext.value.trim(), since: f.personSince.value.trim(), level: f.personLevel.value, last: f.personLast.value, note: f.personNote.value.trim() };
    }, formBase);
    selected = id; clearFilters(); closeForm(); render(); q('#rs-detail button')?.focus({ preventScroll: true }); scheduleSync();
  } catch (e) { notice(e.message); }
}
const fieldNames = { name: 'Nome', role: 'Ruolo', help: 'Come può aiutare', skills: 'Competenze', markets: 'Ambiti', interests: 'Interessi', collaboration: 'Collaborazioni', context: 'Contesto', since: 'Dal', level: 'Rapporto', last: 'Ultimo contatto', note: 'Nota', login: 'Account' };
function conflictValue(v) { return v === null || v === undefined ? 'Rimosso' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v) || 'Vuoto'; }
function showConflicts() {
  const p = sync.pending; if (!p) return;
  const labels = p.source === 'import' ? ['Nella rete', 'Nel file'] : p.source === 'edit' ? ['Nel modulo', 'Nella rete'] : ['Su questo dispositivo', 'Nel repository'];
  q('#conflict-items').innerHTML = p.conflicts.map((c, i) => {
    const record = p.data[c.path[0]]?.[c.path[1]], personId = record?.personId || (c.path[0] === 'people' ? c.path[1] : null);
    const personName = c.label || p.data.people[personId]?.name || record?.name || 'Scheda';
    const value = side => c.kind === 'person-deletion' ? (c[side] ? `Mantieni ${c[side].person.name}, con contributi e relazioni` : 'Elimina persona, contributi e relazioni') : conflictValue(c[side]);
    return `<div class="rs-conflict"><fieldset><legend>${esc(personName)} · ${c.kind === 'person-deletion' ? 'Eliminazione e modifica' : esc(fieldNames[c.path.at(-1)] || 'Scheda')}</legend>${['local', 'remote'].map((side, j) => `<label><input type="radio" name="conflict-${i}" value="${side}" required><span><small>${labels[j]}</small>${esc(value(side))}</span></label>`).join('')}</fieldset></div>`;
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
q('#draft-form').addEventListener('submit', e => {
  e.preventDefault();
  try {
    const source = e.currentTarget.elements, f = q('#rs-form').elements;
    if (!source.text.value.trim() && !source.linkedin.value.trim()) throw new Error('Incolla un testo o un link per iniziare.');
    const draft = draftFromText(source.text.value, source.linkedin.value);
    for (const editor of Object.values(tagEditors)) editor.commit();
    draftUndo = formSnapshot();
    for (const [field, value] of Object.entries({ personName: draft.name, personRole: draft.role, personHelp: draft.help, personLinkedin: draft.linkedin })) if (value && !f[field].disabled) f[field].value = value;
    for (const [key, editor] of Object.entries(tagEditors)) editor.set([...editor.values, ...draft[key]], tagPool(key));
    importedSuggestions = draft.suggestions; refreshSuggestions();
    q('#rs-draft-applied').hidden = false;
    q('#rs-draft-applied span').textContent = draft.shortened ? 'Testo ridotto a 1.500 caratteri. Rivedi la bozza prima di salvare.' : source.text.value.trim() ? 'Bozza pronta. Rivedi testo e tag prima di salvare.' : 'Profilo collegato. Aggiungi il nome o incolla una presentazione.';
    if (draft.linkedin || draft.role || draft.markets.length || draft.interests.length) q('#rs-tags-editor').open = true;
    q('#draft-dialog').close(); showMatches();
    (f.personName.value ? f.personHelp : f.personName).focus();
  } catch (error) { q('#draft-error').textContent = error.message; }
});
q('#remember-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, button = form.querySelector('[type="submit"]'), id = user.id; button.disabled = true;
  try {
    const protectedVault = await makeVault(form.elements.password.value);
    if (!user || user.id !== id) return;
    vault = protectedVault; persist(); await vaultQueue;
    if (vaultError) { vault = null; throw new Error(vaultError); }
    form.reset(); q('#remember-dialog').close(); q('[data-action="forget"]').hidden = false; changed();
  } catch (error) { q('#remember-error').textContent = error.message; }
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
q('#rs-name').addEventListener('input', () => { allowSameName = false; q('[data-action="different-person"]').hidden = false; showMatches(); });
for (const field of ['personHelp', 'personRole']) q('#rs-form').elements[field].addEventListener('input', refreshSuggestions);
q('#rs-form').elements.personLinkedin.addEventListener('input', e => { e.target.setCustomValidity(''); showMatches(); });
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
    if (b.dataset.accessRole) { openAccessGuide(b.dataset.accessRole); return; }
    if (b.dataset.existing) {
      selected = b.dataset.existing; clearFilters(); closeForm(); render();
      if (selected !== ownPersonId() && !ownRelationship(person())) openForm('relation'); else q('#rs-detail button')?.focus(); return;
    }
    if (b.dataset.level !== undefined) { const f = q('#rs-form').elements; f.personLevel.value = f.personLevel.value === b.dataset.level ? '' : b.dataset.level; updateChoices(); return; }
    if (b.dataset.collaboration) { q('#rs-form').elements.personCollaboration.value = b.dataset.collaboration; updateChoices(); return; }
    if (b.dataset.context) { const f = q('#rs-form').elements; f.personContext.value = b.dataset.context + ' · '; f.personContext.focus(); return; }
    const a = b.dataset.action;
    if (a === 'new') openForm('new');
    if (a === 'profile') { selected = ownPersonId(); closeForm(); render(); openForm('profile'); }
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
    if (a === 'draft-open') { q('#draft-form').reset(); q('#draft-form').elements.linkedin.value = q('#rs-form').elements.personLinkedin.value; q('#draft-error').textContent = ''; showDialog('#draft-dialog'); }
    if (a === 'draft-undo' && draftUndo) {
      const f = q('#rs-form').elements; for (const [key, value] of Object.entries(draftUndo.fields)) f[key].value = value;
      for (const [key, editor] of Object.entries(tagEditors)) editor.set(draftUndo.tags[key], tagPool(key));
      draftUndo = null; importedSuggestions = {}; q('#rs-draft-applied').hidden = true; refreshSuggestions();
    }
    if (a === 'remember' && !demo && !vault) { q('#remember-form').reset(); q('#remember-error').textContent = ''; q('#settings-dialog').close(); showDialog('#remember-dialog'); }
    if (a === 'settings') showDialog('#settings-dialog');
    if (a === 'team') openTeam();
    if (a === 'copy-team-link') await copyTeamLink();
    if (a === 'access-guide') openAccessGuide();
    if (a === 'access-ready') { q('#access-dialog').close(); q('#unlock-form').hidden = true; q('#login-form').hidden = false; q('#login-form').elements.token.focus(); }
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
    if (a === 'remove-person') {
      const p = person(); if (!p || p.memberId === user.id) return;
      const original = clone(data()), id = p.id;
      const shared = !!p.memberId || [...p.relationships, ...p.contributions].some(r => r.authorId !== user.id) || p.createdBy !== user.id;
      confirm(`Rimuovere ${p.name}?`, shared ? 'Rimuove la tua relazione, le tue note e il tuo contributo. La scheda del team e le informazioni degli altri restano.' : 'Rimuove la persona, la tua relazione e il tuo contributo. È un contatto inserito solo da te.', () => {
        sync.edit(d => removeFromNetwork(d, id, user.id), original);
        if (!sync.pending) { selected = null; closeForm(); render(); q('#rs-add').focus(); }
        scheduleSync();
      }, 'Rimuovi');
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {});
