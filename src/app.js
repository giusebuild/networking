import { CONFIG } from './config.js';
import { clone, norm, live, keyFor, ensureMember, viewPerson, findPeople, validateNetwork, exportCSV, removeFromNetwork, makeNeed } from './model.js';
import { GitHub } from './github.js';
import { NetworkSync } from './sync.js';
import { listVaults, makeVault, saveVault, openVault, forgetVault } from './vault.js';
import { icon, hydrateIcons } from './icons.js';
import { demoNetwork } from './demo.js';
import { normalizeLinkedIn, draftFromText, suggestedTags, quickPersonFromText } from './profile.js';
import { SmartTags } from './smart-tags.js';
import { uniqueTags } from './tags.js';
import { normalizePhone, whatsappURL, parseVCards, personContactActions } from './contacts.js';

const root = document.getElementById('rete-tag');
const q = s => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = v => v.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
let user, api, sync, vault, demo = false, selected = null, mode = null, formBase, editingId = null;
const emptyFilters = () => ({ skills: '', markets: '', interests: '', collaboration: '', knower: '', intent: '' });
let search = '', filters = emptyFilters();
let allowSameName = false, pendingImport, confirmAction, vaultQueue = Promise.resolve(), vaultError = '', releaseLock;
let autoTimer, verified = false, draftUndo = null, importedSuggestions = {}, joinGuideShown = false;
let quickDraft = null, quickNameEdited = false, quickHomonym = false, quickRoleEdited = false, quickLinkedinEdited = false;
const offerTags = new SmartTags(q('#rs-offer-tags'));
const requestTags = new SmartTags(q('#rs-need-tags'), 'need');
const quickOfferTags = new SmartTags(q('#quick-tags'));
const quickRequestTags = new SmartTags(q('#quick-need-tags'), 'need');
let quickHelpEdited = false, quickNeedEdited = false, contactChoices = [], introPhone = '';

const data = () => sync.local;
const person = () => data().people[selected] ? viewPerson(data(), data().people[selected]) : null;
const nameOf = id => data().members[id]?.name || 'Partecipante';
const ownPersonId = () => data().members[user.id].personId;
const ownContribution = p => p.contributions.find(c => c.authorId === user.id);
const ownRelationship = p => p.relationships.find(r => r.authorId === user.id);
const offer = p => p.self || [ownContribution(p), ...p.contributions].find(c => c?.help) || ownContribution(p) || p.contributions[0];
const sharedPerson = p => !!p.memberId || [...p.relationships, ...p.contributions].some(r => r.authorId !== user.id) || p.createdBy !== user.id;
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
function openIntroduction(authorId) {
  const p = person();
  if (!p || ownRelationship(p) || p.memberId || authorId === user.id || !p.relationships.some(r => r.authorId === authorId)) return;
  const referent = nameOf(authorId), topic = filters.skills || filters.markets;
  q('#intro-title').textContent = `Chiedi a ${referent}`;
  introPhone = data().people[data().members[authorId]?.personId]?.phone || '';
  q('#intro-message').value = `Ciao ${referent}, mi piacerebbe confrontarmi con ${p.name} per una possibile collaborazione${topic ? ` su ${topic}` : ''}. Puoi chiedere se c’è interesse e, con il suo ok, metterci in contatto?`;
  q('#intro-status').textContent = ''; updateIntroductionLink();
  showDialog('#intro-dialog');
}
async function copyIntroduction() {
  const input = q('#intro-message');
  if (!input.value.trim()) { input.focus(); return; }
  try { await navigator.clipboard.writeText(input.value); q('#intro-status').textContent = 'Messaggio copiato. Invialo nel canale che usate.'; }
  catch { input.focus(); input.select(); q('#intro-status').textContent = 'Copia il messaggio selezionato.'; }
}
function updateIntroductionLink() {
  const link = q('#intro-whatsapp'); link.hidden = !introPhone;
  if (introPhone) link.href = whatsappURL(introPhone, q('#intro-message').value); else link.removeAttribute('href');
}
async function pickContact() {
  if (navigator.contacts?.select) {
    try {
      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (contacts.length) { contactChoices = contacts.map(c => ({ name: c.name?.[0] || '', phones: (c.tel || []).flatMap(v => { try { return [normalizePhone(v)]; } catch { return []; } }) })); chooseContact(0); }
      return;
    } catch (error) { if (error.name === 'AbortError') return; }
  }
  q('#contact-file').click();
}
function renderContacts() {
  const term = norm(q('#contacts-search').value);
  q('#contacts-list').innerHTML = contactChoices.map((c, i) => ({ c, i })).filter(({ c }) => norm(c.name + ' ' + c.phones.join(' ')).includes(term)).slice(0, 100).map(({ c, i }) => `<button type="button" class="rs-match" data-contact-index="${i}"><span><strong>${esc(c.name || 'Senza nome')}</strong><small>${esc(c.phones[0] || 'Telefono non disponibile')}</small></span>${icon('chevron-right')}</button>`).join('') || '<p class="rs-field-hint">Nessun contatto trovato.</p>';
}
function chooseContact(index) {
  const contact = contactChoices[index]; if (!contact) return;
  q('#quick-name').value = contact.name; quickNameEdited = true;
  q('#quick-phone').value = contact.phones[0] || ''; q('#quick-links').open = true;
  if (!quickDraft) quickDraft = quickPersonFromText('');
  q('#contacts-dialog').close(); contactChoices = []; q('#contacts-list').replaceChildren(); renderQuickPreview(); q('#quick-name').focus();
}
q('#contacts-search').addEventListener('input', renderContacts);
q('#contact-file').addEventListener('change', async e => {
  const fileInput = e.currentTarget;
  try {
    const file = fileInput.files[0]; if (!file) return;
    if (file.size > 900000) throw new Error('File troppo grande (massimo 900 KB).');
    contactChoices = parseVCards(await file.text());
    if (contactChoices.length === 1) chooseContact(0);
    else { q('#contacts-search').value = ''; renderContacts(); showDialog('#contacts-dialog'); }
  } catch (error) { q('#quick-error').textContent = error.message; }
  finally { fileInput.value = ''; }
});
function openQuickAdd() {
  if (sync.pending) { showConflicts(); return; }
  q('#quick-form').reset(); quickDraft = quickPersonFromText(''); quickNameEdited = quickHelpEdited = quickNeedEdited = quickHomonym = quickRoleEdited = quickLinkedinEdited = false;
  quickOfferTags.set({}, allTagPools()); quickRequestTags.set({}, allTagPools()); q('#quick-preview').hidden = false; q('#quick-notes').open = false; q('#quick-links').open = false;
  q('#quick-linkedin').setCustomValidity(''); q('#quick-phone').setCustomValidity(''); updateProfileLinks();
  q('#quick-homonym').hidden = true; q('#quick-error').textContent = ''; q('#quick-matches').replaceChildren(); q('#quick-context').hidden = true;
  showDialog('#quick-dialog'); q('#quick-name').focus();
}
function quickMatches() {
  const name = norm(q('#quick-name').value.trim()); let phone = '', linkedin = ''; try { phone = normalizePhone(q('#quick-phone').value); } catch {} try { linkedin = normalizeLinkedIn(q('#quick-linkedin').value); } catch {}
  if (!quickDraft) return [];
  return live(data().people).filter(p => (phone && p.phone === phone) || (name.length >= 2 && norm(p.name).includes(name)) || (linkedin && p.linkedin && normalizeLinkedIn(p.linkedin) === linkedin)).slice(0, 4);
}
function renderQuickPreview() {
  if (!quickDraft) return;
  q('#quick-preview').hidden = false;
  q('#quick-context').textContent = quickDraft.context;
  q('#quick-context').hidden = !quickDraft.context;
  quickOfferTags.update([q('#quick-help').value, q('#quick-role').value].join('\n')); quickRequestTags.update(q('#quick-need').value); updateProfileLinks();
  q('#quick-matches').innerHTML = quickHomonym ? '' : quickMatches().map(p => `<button type="button" class="rs-match" data-quick-existing="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>Già nella rete · aggiungi il tuo collegamento</small></span>${icon('chevron-right')}</button>`).join('');
}
function updateProfileLinks() {
  for (const [input, preview] of [
    [q('#quick-linkedin'), q('#quick-linkedin-preview')],
    [q('#rs-form').elements.personLinkedin, q('#rs-linkedin-preview')],
    [q('#draft-form').elements.linkedin, q('#draft-linkedin-preview')],
  ]) {
    let href = ''; try { href = normalizeLinkedIn(input.value); } catch {}
    preview.hidden = !href;
    if (href) preview.href = href; else preview.removeAttribute('href');
  }
}
function updateQuickDraft() {
  try {
    quickDraft = quickPersonFromText(q('#quick-text').value);
    if (!quickNameEdited) q('#quick-name').value = quickDraft.name;
    if (!quickHelpEdited) q('#quick-help').value = quickDraft.help || quickDraft.role;
    if (!quickNeedEdited) q('#quick-need').value = quickDraft.need;
    if (!quickRoleEdited) q('#quick-role').value = quickDraft.role;
    if (!quickLinkedinEdited) q('#quick-linkedin').value = quickDraft.linkedin;
    if (q('#quick-linkedin').value || q('#quick-role').value) q('#quick-links').open = true;
    quickHomonym = false; q('#quick-homonym').hidden = true; q('#quick-error').textContent = '';
    renderQuickPreview();
  } catch (error) { q('#quick-error').textContent = error.message; }
}
function applyQuickDraft() {
  const f = q('#rs-form').elements;
  for (const [key, value] of Object.entries({ personName: q('#quick-name').value.trim(), personHelp: q('#quick-help').value, personNeed: q('#quick-need').value, personPhone: q('#quick-phone').value, personRole: q('#quick-role').value, personLinkedin: q('#quick-linkedin').value, personContext: quickDraft.context, personSince: quickDraft.since })) f[key].value = value;
  offerTags.set(quickOfferTags.values, allTagPools()); requestTags.set(quickRequestTags.values, allTagPools()); offerTags.blocked = new Set(quickOfferTags.blocked); requestTags.blocked = new Set(quickRequestTags.blocked);
  refreshSuggestions(); showMatches(); updateProfileLinks();
}
function saveQuickPerson(e) {
  e.preventDefault();
  try {
    if (!quickDraft) quickDraft = quickPersonFromText('');
    const name = q('#quick-name').value.trim();
    if (!name) { q('#quick-name').focus(); q('#quick-error').textContent = 'Aggiungi il nome.'; return; }
    let linkedin = '', phone = '';
    try { linkedin = normalizeLinkedIn(q('#quick-linkedin').value); q('#quick-linkedin').setCustomValidity(''); }
    catch (error) { q('#quick-links').open = true; q('#quick-linkedin').setCustomValidity(error.message); q('#quick-linkedin').reportValidity(); throw error; }
    try { phone = normalizePhone(q('#quick-phone').value); q('#quick-phone').setCustomValidity(''); }
    catch (error) { q('#quick-links').open = true; q('#quick-phone').setCustomValidity(error.message); q('#quick-phone').reportValidity(); throw error; }
    const sameProfile = linkedin && live(data().people).some(p => p.linkedin && normalizeLinkedIn(p.linkedin) === linkedin);
    if (sameProfile || (!quickHomonym && live(data().people).some(p => norm(p.name) === norm(name)))) {
      q('#quick-error').textContent = 'È la persona già nella rete? Apri la scheda qui sotto.';
      q('#quick-homonym').hidden = !!sameProfile; renderQuickPreview(); return;
    }
    quickOfferTags.commit(); quickRequestTags.commit();
    const help = q('#quick-help').value.trim(), need = makeNeed(undefined, q('#quick-need').value, quickRequestTags.values);
    const id = crypto.randomUUID(), key = keyFor(id, user.id);
    sync.edit(d => {
      d.people[id] = { id, name, role: q('#quick-role').value.trim(), memberId: null, createdBy: user.id, ...(linkedin ? { linkedin } : {}), ...(phone ? { phone } : {}) };
      d.contributions[key] = { id: key, personId: id, authorId: user.id, help, ...quickOfferTags.values, collaboration: 'Da chiedere', ...(need !== undefined ? { need } : {}) };
      d.relationships[key] = { id: key, personId: id, authorId: user.id, context: quickDraft.context, since: quickDraft.since, level: '', last: '', note: '' };
    });
    q('#quick-dialog').close(); selected = id; clearFilters(); closeForm(); render(); scheduleSync();
    focusDetail();
  } catch (error) { q('#quick-error').textContent = error.message; }
}
function resetUI() {
  selected = null; mode = null; formBase = null; editingId = null; search = '';
  pendingImport = null; draftUndo = null; importedSuggestions = {}; confirmAction = null;
  quickDraft = null; quickNameEdited = false; quickHomonym = false;
  filters = emptyFilters();
  q('#rs-search').value = '';
  for (const selector of ['#rs-people', '#rs-detail', '#team-members', '#rs-matches', '#conflict-items', '#rs-active-filters', '#quick-matches', '#rs-quick-filters']) q(selector).replaceChildren();
  for (const selector of ['#settings-identity', '#rs-account', '#import-summary', '#confirm-title', '#confirm-copy', '#rs-form-person', '#rs-form-eyebrow', '#rs-relation-caption', '#intro-title', '#intro-status', '#quick-summary', '#quick-context', '#quick-error']) q(selector).textContent = '';
  q('#intro-message').value = '';
  for (const id of ['rs-linkedin-preview', 'quick-linkedin-preview', 'draft-linkedin-preview']) { q('#' + id).removeAttribute('href'); q('#' + id).hidden = true; }
  for (const key of ['skills', 'markets', 'interests', 'knower']) q('#rs-filter-' + key).innerHTML = '<option value="">Tutti</option>';
  for (const editor of [offerTags, requestTags, quickOfferTags, quickRequestTags]) editor.set();
  contactChoices = []; introPhone = ''; q('#contacts-list').replaceChildren(); q('#intro-whatsapp').removeAttribute('href'); q('#intro-whatsapp').hidden = true;
  for (const selector of ['#rs-form', '#draft-form', '#token-form', '#remember-form', '#quick-form']) q(selector).reset();
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
const request = p => p.seeking.find(c => c.authorId === user.id) || p.seeking[0];
const tagLine = values => uniqueTags(values).map(t => `<span class="rs-tag">${esc(t)}</span>`).join('');
function cardTags(values) {
  const tags = uniqueTags(values);
  return tags.length ? `<span class="rs-row-tags">${tagLine(tags.slice(0, 3))}${tags.length > 3 ? `<span class="rs-tag rs-tag-count">+${tags.length - 3}</span>` : ''}</span>` : '';
}
function contactActionsHTML(p) {
  return `<div class="rs-contact-actions" aria-label="Contatta ${esc(p.name)}">${personContactActions(p, user.id).map(action => {
    if (action.type === 'whatsapp') return `<a class="rs-btn rs-whatsapp" href="${esc(action.href)}" target="_blank" rel="noopener noreferrer" aria-label="Scrivi a ${esc(p.name)} su WhatsApp">${icon('message-circle')}WhatsApp</a>`;
    if (action.type === 'linkedin') return `<a class="rs-btn rs-linkedin" href="${esc(action.href)}" target="_blank" rel="noopener noreferrer" aria-label="Apri il profilo LinkedIn di ${esc(p.name)}"><span class="rs-linkedin-mark" aria-hidden="true">in</span>LinkedIn${icon('arrow-up-right')}</a>`;
    if (action.type === 'introduction') return `<button type="button" class="rs-btn rs-intro-link" data-introduction="${esc(action.authorId)}" data-contact-person="${esc(p.id)}">${icon('user-plus')}Chiedi un’intro</button>`;
    if (action.type === 'add-contact') return `<button type="button" class="rs-text-btn rs-contact-missing" data-edit-contact="${esc(p.id)}">${icon('plus')}Aggiungi recapiti</button>`;
    return `<button type="button" class="rs-text-btn" data-contact-relation="${esc(p.id)}">${icon('link')}Lo conosco anch’io</button>`;
  }).join('')}</div>`;
}
function row(p) {
  const o = offer(p), n = request(p), mine = ownRelationship(p);
  const knowers = [...p.relationships].sort((a, b) => Number(b.authorId === user.id) - Number(a.authorId === user.id)).map(r => r.authorId === user.id ? 'Tu' : nameOf(r.authorId)).join(' · ');
  const offeredTags = cardTags([...p.skills, ...p.markets]), neededTags = n ? cardTags([...n.need.skills, ...n.need.markets]) : '';
  return `<article class="rs-person" data-selected="${p.id === selected}"><button type="button" class="rs-person-open" data-person="${esc(p.id)}" aria-pressed="${p.id === selected}" aria-controls="rs-detail"><span class="rs-person-top"><span class="rs-avatar" data-tone="${p.name.length % 4}">${esc(initials(p.name))}</span><span class="rs-person-heading"><span class="rs-person-name">${esc(p.name)}</span>${p.role ? `<span class="rs-role">${esc(p.role)}</span>` : ''}</span>${icon('chevron-right')}</span>${o?.help || offeredTags ? `<span class="rs-card-offer"><span class="rs-intent-label">${icon('briefcase')}Offre</span>${o?.help ? `<span class="rs-help-copy">${esc(o.help)}</span>` : ''}${offeredTags}</span>` : ''}${n ? `<span class="rs-card-need"><span class="rs-intent-label">${icon('search')}Cerca</span><span class="rs-help-copy">${esc(n.need.text)}</span>${neededTags}</span>` : ''}${!o?.help && !offeredTags && !n ? '<span class="rs-help-copy rs-placeholder">Una conoscenza da scoprire.</span>' : ''}<span class="rs-person-route">${icon(mine ? 'link' : 'user-round')}${esc(knowers || (p.memberId ? 'Nel team' : 'Collegamento da aggiungere'))}</span></button>${contactActionsHTML(p)}</article>`;
}
function detail(p) {
  if (!p) return '';
  const own = p.memberId === user.id, editable = !p.memberId || own, o = offer(p), mine = ownRelationship(p);
  const removable = !own && (mine || ownContribution(p) || (!p.memberId && p.createdBy === user.id && !p.relationships.length && !p.contributions.length));
  const statuses = p.offering.filter(c => c.collaboration !== 'Da chiedere');
  const statusValues = [...new Set(statuses.map(c => c.collaboration))];
  const availability = statusValues.length > 1 ? 'Da verificare' : statusValues[0] === 'Aperto' ? 'Disponibile' : statusValues.length ? 'Non ora' : '';
  const attribution = statuses.map(c => `${c.authorId === p.memberId ? 'Dichiarato' : 'Segnalato'} da ${nameOf(c.authorId)}`).join(' · ');
  let html = `<article class="rs-detail"><nav class="rs-detail-nav" aria-label="Azioni della scheda"><button type="button" class="rs-back" data-action="close">${icon('arrow-left')}Rete</button><div class="rs-detail-tools"><button type="button" class="rs-btn rs-edit-button" data-action="edit">${icon('pencil')}${editable ? 'Modifica' : 'Il tuo appunto'}</button>${removable ? `<details class="rs-person-menu"><summary aria-label="Altre azioni per ${esc(p.name)}">${icon('ellipsis')}</summary><div><button type="button" class="rs-text-btn rs-danger" data-action="remove-person">${sharedPerson(p) ? 'Rimuovi il tuo collegamento' : 'Elimina contatto'}</button></div></details>` : ''}</div></nav>`;
  html += `<div class="rs-person-hero"><span class="rs-avatar" data-tone="${p.name.length % 4}">${esc(initials(p.name))}</span><div>${editable ? `<button type="button" class="rs-name-edit" data-edit-field="personName" aria-label="Modifica il nome di ${esc(p.name)}">${esc(p.name)}</button>` : `<h2>${esc(p.name)}</h2>`}${p.role ? `<p class="rs-role">${esc(p.role)}</p>` : ''}<div class="rs-person-badges">${own ? '<span class="rs-mini-label">Il tuo profilo</span>' : p.memberId ? '<span class="rs-mini-label">Team</span>' : ''}${availability ? `<span class="rs-availability" title="${esc(attribution)}" aria-label="${esc(availability + '. ' + attribution)}"><span class="rs-status-dot"></span>${availability}</span>` : ''}</div></div></div>`;
  html += contactActionsHTML(p);
  const source = c => c.authorId === p.memberId ? `Dichiarato da ${nameOf(c.authorId)}` : `Aggiunto da ${c.authorId === user.id ? 'te' : nameOf(c.authorId)}`;
  html += `<section class="rs-person-offer"><h3 class="rs-intent-label">${icon('briefcase')}Offre</h3>${editable ? `<button type="button" class="rs-editable rs-offer-edit" data-edit-field="personHelp"><span>${esc(o?.help || 'Aggiungi un contributo concreto…')}</span>${icon('pencil')}</button>` : o?.help ? `<p>${esc(o.help)}</p>` : ''}${o?.help ? `<span class="rs-source">${esc(source(o))}</span>` : ''}<div class="rs-tag-list">${tagLine([...new Set([...p.skills, ...p.markets])])}${editable ? `<button type="button" class="rs-add-tag" data-edit-field="skills" aria-label="Modifica tag del contributo">${icon('plus')}</button>` : ''}</div></section>`;
  const n = request(p);
  if (n || editable) html += `<section class="rs-person-need"><h3 class="rs-intent-label">${icon('search')}Cerca</h3>${editable ? `<button type="button" class="rs-editable rs-offer-edit" data-edit-field="personNeed"><span>${esc(n?.need.text || 'Un aiuto, una collaborazione, un confronto…')}</span>${icon('pencil')}</button>` : n ? `<p>${esc(n.need.text)}</p>` : ''}${n ? `<span class="rs-source">${esc(source(n))} · ${new Date(n.need.updatedAt).toLocaleDateString('it-IT')}</span><div class="rs-tag-list">${tagLine([...new Set([...n.need.skills, ...n.need.markets])])}</div>` : ''}</section>`;
  if (!own) {
    html += '<section class="rs-connections"><h3>Chi lo conosce</h3>';
    for (const r of [...p.relationships].sort((a, b) => Number(b.authorId === user.id) - Number(a.authorId === user.id))) {
      const isMine = r.authorId === user.id;
      const context = [r.context, r.since && !norm(r.context).includes(norm(r.since)) ? `Dal ${r.since}` : ''].filter(Boolean).join(' · ');
      const content = `<span class="rs-connection-top"><span class="rs-connection-name">${icon('link')}${esc(isMine ? 'Tu' : nameOf(r.authorId))}</span>${r.level ? `<span class="rs-closeness">${esc(r.level)}</span>` : ''}${isMine ? icon('pencil') : ''}</span>${context ? `<span class="rs-context">${esc(context)}</span>` : isMine ? '<span class="rs-context rs-placeholder">Come vi conoscete?</span>' : ''}`;
      html += `<section class="rs-relation">${isMine ? `<button type="button" class="rs-connection-edit" data-edit-field="personContext" aria-label="Modifica relazione">${content}</button>` : `<div class="rs-connection-view">${content}</div>`}${r.last || r.note ? `<details class="rs-note"><summary>Nota${r.last ? ` · ${esc(date(r.last))}` : ''}</summary>${r.note ? `<p>${esc(r.note)}</p>` : ''}</details>` : ''}${!isMine && !mine && !p.memberId ? `<button type="button" class="rs-btn rs-primary rs-intro-action" data-introduction="${esc(r.authorId)}">Chiedi una presentazione${icon('chevron-right')}</button>` : ''}</section>`;
    }
    if (!mine) html += `<button type="button" class="rs-text-btn" data-action="relation">${icon('plus')}Lo conosco anch’io</button>`;
    html += '</section>';
  }
  const others = p.contributions.filter(c => c !== o && (c.help || c.need?.text));
  if (p.interests.length || others.length || p.phone || availability) {
    html += '<details class="rs-person-more"><summary>Altri dettagli' + icon('chevron-right') + '</summary><div class="rs-more-content">';
    if (availability) html += `<div class="rs-tag-group"><span class="rs-tag-label">Collaborazioni · ${esc(availability)}</span><span class="rs-source">${esc(attribution)}</span></div>`;
    for (const [key, label] of [['interests', 'Interessi']]) if (p[key].length) html += `<div class="rs-tag-group"><span class="rs-tag-label">${label}</span><div class="rs-tag-list">${p[key].map(t => `<span class="rs-tag">${esc(t)}</span>`).join('')}</div></div>`;
    if (others.length) html += `<div class="rs-observation">${others.map(c => `<p>${esc(c.help)}</p>${c.need?.text ? `<p><strong>Cerca:</strong> ${esc(c.need.text)}</p>` : ''}<span class="rs-source">${esc(nameOf(c.authorId))}</span>`).join('')}</div>`;
    if (p.phone) html += `<div class="rs-tag-group"><span class="rs-tag-label">Telefono</span><a href="tel:${esc(p.phone)}">${esc(p.phone)}</a></div>`;
    html += '</div></details>';
  }
  return html + '</article>';
}
function editAt(field) {
  const relation = ['personContext', 'personSince', 'personLevel', 'personNote', 'personLast'].includes(field);
  openForm(selected === ownPersonId() ? 'profile' : relation ? 'relation' : 'edit');
  if (!mode) return;
  if (['personRole', 'personLinkedin', 'personCollaboration', 'personPhone'].includes(field)) q('#rs-tags-editor').open = true;
  if (field === 'personNote' || field === 'personLast') q('#rs-extra').open = true;
  if (['skills', 'markets', 'interests'].includes(field)) { offerTags.root.querySelector('.rs-smart-add').hidden = false; offerTags.root.querySelector('.rs-smart-toggle').setAttribute('aria-expanded', 'true'); }
  const target = ['skills', 'markets', 'interests'].includes(field) ? offerTags.input : q('#rs-form').elements[field];
  target?.focus({ preventScroll: true }); target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
function render() {
  if (!sync || !user) return;
  const found = findPeople(data(), user.id, { search, filters });
  if (selected && !data().people[selected]) selected = null;
  root.dataset.open = String(!!selected);
  const filtered = search || Object.values(filters).some(Boolean);
  q('#rs-people').innerHTML = found.length ? found.map(row).join('') : `<div class="rs-empty">${filtered ? 'Nessun risultato' : 'La rete parte da chi conoscete.'}<button type="button" class="rs-text-btn" data-action="${filtered ? 'clear' : 'new'}">${filtered ? 'Azzera filtri' : 'Aggiungi una persona'}</button></div>`;
  q('#rs-count').textContent = String(found.length); q('#rs-clear-search').hidden = !search;
  q('#rs-detail').innerHTML = detail(person());
  for (const b of q('#rs-intents').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.intent === filters.intent));
  const active = Object.entries(filters).filter(([k, v]) => v && k !== 'intent');
  q('#rs-filter-count').hidden = !active.length; q('#rs-filter-count').textContent = String(active.length);
  q('#rs-active-filters').hidden = !active.some(([key]) => key !== 'skills');
  q('#rs-active-filters').innerHTML = active.filter(([key]) => key !== 'skills').map(([key, value]) => {
    const label = key === 'knower' ? `Conosciuto da ${value === user.id ? 'te' : nameOf(value)}` : value;
    return `<button type="button" class="rs-active-tag" data-remove-filter="${key}" aria-label="Rimuovi filtro ${esc(label)}">${esc(label)}${icon('x')}</button>`;
  }).join('');
  for (const key of ['skills', 'markets', 'interests']) {
    const values = [...new Map(live(data().people).flatMap(p => [...viewPerson(data(), p)[key], ...(key === 'interests' ? [] : viewPerson(data(), p)[key === 'skills' ? 'needSkills' : 'needMarkets'])]).concat(filters[key] || []).map(value => [norm(value), value])).values()].sort((a, b) => a.localeCompare(b, 'it'));
    q('#rs-filter-' + key).innerHTML = '<option value="">Qualsiasi</option>' + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    q('#rs-filter-' + key).value = filters[key];
  }
  const members = live(data().members).sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id) || a.name.localeCompare(b.name, 'it'));
  q('#rs-filter-knower').innerHTML = '<option value="">Tutti</option>' + members.map(m => `<option value="${esc(m.id)}">${esc(m.id === user.id ? 'Io' : m.name)}</option>`).join('');
  q('#rs-filter-knower').value = filters.knower;
  const counts = new Map();
  for (const p of findPeople(data(), user.id, { filters: { intent: filters.intent } })) for (const tag of (filters.intent === 'need' ? p.needSkills : p.skills)) { const key = norm(tag); const item = counts.get(key); counts.set(key, { label: item?.label || tag, count: (item?.count || 0) + 1 }); }
  const frequent = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it')).map(x => x.label);
  const quickSkills = [...new Set([...(filters.skills ? [filters.skills] : []), ...frequent])].slice(0, 4);
  q('#rs-quick-filters').hidden = !quickSkills.length;
  q('#rs-quick-filters').innerHTML = quickSkills.map(tag => `<button type="button" class="rs-quick-filter" data-skill-filter="${esc(tag)}" aria-pressed="${norm(tag) === norm(filters.skills)}">${esc(tag)}${norm(tag) === norm(filters.skills) ? icon('x') : ''}</button>`).join('');
  q('#rs-filter-collaboration').value = filters.collaboration;
  q('.rs-profile .rs-avatar').textContent = initials(data().members[user.id].name);
}
function clearFilters() { search = ''; q('#rs-search').value = ''; for (const k of Object.keys(filters)) filters[k] = ''; }
function closeForm() { mode = null; formBase = null; editingId = null; q('#rs-form').hidden = true; q('#rs-add').hidden = false; root.dataset.view = 'network'; }
function focusDetail() {
  q('#rs-detail button')?.focus({ preventScroll: true });
  q('#rs-detail').scrollIntoView?.({ block: 'start', behavior: 'instant' });
}
function closeDetail() {
  const old = selected; selected = null; render();
  Array.from(q('#rs-people').querySelectorAll('[data-person]')).find(b => b.dataset.person === old)?.focus();
}
function tagPool(key) { return [...new Set(live(data().contributions).flatMap(c => c[key]))]; }
function refreshSuggestions() {
  if (!mode) return;
  const f = q('#rs-form').elements;
  offerTags.update([f.personHelp.value, f.personRole.value].join(' ')); requestTags.update(f.personNeed.value);
}
function allTagPools() { return Object.fromEntries(['skills', 'markets', 'interests'].map(k => [k, [...tagPool(k), ...live(data().contributions).flatMap(c => c.need?.[k] || [])]])); }
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
  q('#rs-extra').open = false; q('#rs-relation-details').open = relationOnly; q('#rs-tags-editor').open = false; q('#rs-matches').hidden = true; q('#rs-name-conflict').hidden = true; q('#rs-draft-applied').hidden = true;
  q('#rs-basics').hidden = relationOnly; q('#rs-more').hidden = relationOnly; q('#rs-quick-start').hidden = relationOnly;
  q('#rs-form-relation').hidden = own || kind === 'edit';
  q('#rs-help-label').textContent = own ? 'Cosa puoi fare?' : 'Cosa sa fare?';
  q('#rs-help-hint').textContent = 'Servizi, esperienza o contatti utili.';
  f.personHelp.placeholder = 'Es. Siti e prenotazioni online per studi medici';
  q('#rs-need-label').textContent = own ? 'Di cosa hai bisogno?' : 'Di cosa ha bisogno?';
  q('#rs-form-title').textContent = own ? 'Il tuo profilo' : relationOnly ? 'Come vi conoscete?' : kind === 'new' ? 'Aggiungi una persona' : p.memberId ? 'Il tuo punto di vista' : 'Modifica persona';
  q('#rs-form-eyebrow').hidden = !relationOnly;
  q('#rs-form-eyebrow').textContent = own ? 'Il tuo profilo' : relationOnly ? p.name : 'La vostra rete';
  q('#rs-form-person').hidden = false;
  q('#rs-form-person').textContent = own ? 'Aiuta gli altri a capire quando coinvolgerti.' : relationOnly ? 'Una persona, più collegamenti. Aggiungi il tuo.' : 'Basta ciò che sai. Il resto può arrivare dopo.';
  q('#rs-relation-caption').textContent = p ? `Come puoi mettere il gruppo in contatto con ${p.name}.` : 'Il collegamento che il gruppo può attivare.';
  q('#rs-availability-label').textContent = own ? 'Vuoi essere coinvolto in nuove collaborazioni?' : 'Disponibilità a collaborare';
  q('#rs-availability-unknown').textContent = own ? 'Non indicata' : 'Da verificare';
  q('#rs-save').innerHTML = (own ? 'Salva profilo' : relationOnly ? (ownRelationship(p) ? 'Salva relazione' : 'Aggiungi relazione') : 'Salva persona') + icon('check');
  f.personName.required = !relationOnly; f.personName.disabled = !own && !!p?.memberId;
  f.personRole.disabled = !own && !!p?.memberId; f.personLinkedin.disabled = !own && !!p?.memberId; f.personPhone.disabled = !own && !!p?.memberId; f.personLinkedin.setCustomValidity(''); f.personPhone.setCustomValidity('');
  q('#rs-form-source').textContent = own ? 'Il tuo profilo, visibile al gruppo.' : 'Visibile al gruppo · il tuo contributo.';
  const c = p ? ownContribution(p) : null, r = p ? ownRelationship(p) : null;
  if (p) { f.personName.value = p.name; f.personRole.value = p.role; f.personHelp.value = c?.help || ''; f.personLinkedin.value = p.linkedin || ''; f.personPhone.value = p.phone || ''; f.personNeed.value = c?.need?.text || ''; }
  f.personCollaboration.value = c?.collaboration || 'Da chiedere';
  for (const [field, key] of [['Context', 'context'], ['Since', 'since'], ['Level', 'level'], ['Last', 'last'], ['Note', 'note']]) f['person' + field].value = r?.[key] || '';
  offerTags.set(c || {}, allTagPools()); requestTags.set(c?.need || {}, allTagPools());
  updateChoices(); refreshSuggestions(); updateProfileLinks();
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
  return { fields: Object.fromEntries(['personName', 'personRole', 'personHelp', 'personNeed', 'personPhone', 'personLinkedin'].map(k => [k, f[k].value])), tags: offerTags.values, needTags: requestTags.values, blocked: [...offerTags.blocked], needBlocked: [...requestTags.blocked] };
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
    let phone = '';
    try { phone = normalizePhone(f.personPhone.value); f.personPhone.setCustomValidity(''); }
    catch (error) { q('#rs-tags-editor').open = true; f.personPhone.setCustomValidity(error.message); f.personPhone.reportValidity(); return; }
    const id = fresh ? crypto.randomUUID() : editingId;
    const showRelationship = !q('#rs-form-relation').hidden;
    offerTags.commit(); requestTags.commit();
    sync.edit(d => {
      if (fresh) d.people[id] = { id, name, role: '', memberId: null, createdBy: user.id };
      const p = d.people[id], key = keyFor(id, user.id);
      if (!p) throw new Error('Questa scheda non esiste più.');
      if (!relationOnly) {
        if (!p.memberId || own) { p.name = name; p.role = f.personRole.value.trim(); if (linkedin || Object.hasOwn(p, 'linkedin')) p.linkedin = linkedin; if (phone || Object.hasOwn(p, 'phone')) p.phone = phone; }
        if (own) d.members[user.id].name = name;
        d.contributions[key] = { id: key, personId: id, authorId: user.id, help: f.personHelp.value.trim(), ...offerTags.values, collaboration: f.personCollaboration.value, ...(() => { const need = makeNeed(formBase.contributions[key]?.need, f.personNeed.value, requestTags.values); return need === undefined ? {} : { need }; })() };
      }
      if (showRelationship) d.relationships[key] = { id: key, personId: id, authorId: user.id, context: f.personContext.value.trim(), since: f.personSince.value.trim(), level: f.personLevel.value, last: f.personLast.value, note: f.personNote.value.trim() };
    }, formBase);
    selected = id; clearFilters(); closeForm(); render(); focusDetail(); scheduleSync();
  } catch (e) { notice(e.message); }
}
const fieldNames = { name: 'Nome', role: 'Ruolo', help: 'Come può aiutare', skills: 'Competenze', markets: 'Ambiti', interests: 'Interessi', collaboration: 'Collaborazioni', context: 'Contesto', since: 'Dal', level: 'Rapporto', last: 'Ultimo contatto', note: 'Nota', login: 'Account', need: 'Cerca', phone: 'Telefono' };
function conflictValue(v) { return v === null || v === undefined ? 'Rimosso' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? (v.text ? `${v.text} · ${[...(v.skills || []), ...(v.markets || [])].join(', ')}` : JSON.stringify(v, null, 2)) : String(v) || 'Vuoto'; }
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
    if (!source.text.value.trim() && !source.linkedin.value.trim() && !source.headline.value.trim()) throw new Error('Incolla un testo o un link per iniziare.');
    const draft = draftFromText(source.text.value, source.linkedin.value);
    if (source.headline.value.trim()) draft.role = source.headline.value.trim();
    offerTags.commit(); requestTags.commit();
    draftUndo = formSnapshot();
    for (const [field, value] of Object.entries({ personName: draft.name, personRole: draft.role, personHelp: draft.help, personNeed: draft.need, personLinkedin: draft.linkedin })) if (value && !f[field].disabled) f[field].value = value;
    offerTags.set(Object.fromEntries(['skills', 'markets', 'interests'].map(k => [k, [...offerTags.values[k], ...draft[k]]])), allTagPools()); if (draft.need) requestTags.set(draft.needTags || {}, allTagPools());
    importedSuggestions = draft.suggestions; refreshSuggestions();
    q('#rs-draft-applied').hidden = false;
    q('#rs-draft-applied span').textContent = draft.shortened ? 'Testo ridotto a 1.500 caratteri. Rivedi la bozza prima di salvare.' : source.text.value.trim() || source.headline.value.trim() ? 'Bozza pronta. Rivedi testo e tag prima di salvare.' : 'Profilo collegato. Aggiungi il nome o incolla una presentazione.';
    if (draft.linkedin || draft.role || draft.markets.length || draft.interests.length) q('#rs-tags-editor').open = true;
    q('#draft-dialog').close(); showMatches(); updateProfileLinks();
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
q('#quick-form').addEventListener('submit', saveQuickPerson);
q('#quick-text').addEventListener('input', updateQuickDraft);
for (const [id, key] of [['quick-help', 'help'], ['quick-need', 'need']]) q('#' + id).addEventListener('input', () => { if (key === 'help') quickHelpEdited = true; else quickNeedEdited = true; renderQuickPreview(); });
q('#quick-name').addEventListener('input', () => { quickNameEdited = true; quickHomonym = false; q('#quick-homonym').hidden = true; renderQuickPreview(); });
q('#quick-role').addEventListener('input', () => { quickRoleEdited = true; renderQuickPreview(); });
q('#quick-linkedin').addEventListener('input', e => { quickLinkedinEdited = true; e.target.setCustomValidity(''); renderQuickPreview(); });
q('#quick-phone').addEventListener('input', e => { e.target.setCustomValidity(''); renderQuickPreview(); });
q('#draft-form').elements.linkedin.addEventListener('input', updateProfileLinks);
q('#rs-search').addEventListener('input', e => { search = e.target.value; render(); });
q('#intro-message').addEventListener('input', () => { q('#intro-status').textContent = ''; updateIntroductionLink(); });
q('#rs-name').addEventListener('input', () => { allowSameName = false; q('[data-action="different-person"]').hidden = false; showMatches(); });
for (const field of ['personHelp', 'personRole', 'personNeed']) q('#rs-form').elements[field].addEventListener('input', refreshSuggestions);
q('#rs-form').elements.personLinkedin.addEventListener('input', e => { e.target.setCustomValidity(''); showMatches(); updateProfileLinks(); });
q('#rs-form').elements.personPhone.addEventListener('input', e => e.target.setCustomValidity(''));
for (const key of Object.keys(filters)) q('#rs-filter-' + key)?.addEventListener('change', e => { filters[key] = e.target.value; render(); });
q('#import-file').addEventListener('change', async e => {
  const fileInput = e.currentTarget;
  try {
    const file = fileInput.files[0]; if (!file) return; if (file.size > 900000) throw new Error('File troppo grande (massimo 900 KB).');
    pendingImport = validateNetwork(JSON.parse(await file.text()));
    const incoming = live(pendingImport.people), newPeople = incoming.filter(p => !data().people[p.id]);
    q('#import-summary').textContent = `${incoming.length} persone nel file · ${newPeople.length} nuove · ${incoming.length - newPeople.length} già presenti.`;
    showDialog('#import-dialog');
  } catch (e) { notice(e.message); } finally { fileInput.value = ''; }
});
root.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  try {
    if (b.dataset.intent !== undefined) { filters.intent = b.dataset.intent; selected = null; render(); return; }
    if (b.dataset.contactIndex !== undefined) { chooseContact(Number(b.dataset.contactIndex)); return; }
    if (b.dataset.removeFilter) { filters[b.dataset.removeFilter] = ''; render(); return; }
    if (b.dataset.editField) { editAt(b.dataset.editField); return; }
    if (b.dataset.quickTag) { quickDraft[b.dataset.quickTag].splice(Number(b.dataset.quickIndex), 1); renderQuickPreview(); return; }
    if (b.dataset.quickExisting) {
      q('#quick-dialog').close(); selected = b.dataset.quickExisting; clearFilters(); render();
      if (selected !== ownPersonId() && !ownRelationship(person())) { openForm('relation'); q('#rs-form').elements.personContext.value = quickDraft?.context || ''; q('#rs-form').elements.personSince.value = quickDraft?.since || ''; }
      return;
    }
    if (b.dataset.skillFilter) { filters.skills = norm(filters.skills) === norm(b.dataset.skillFilter) ? '' : b.dataset.skillFilter; selected = null; render(); return; }
    if (b.dataset.person) { selected = b.dataset.person; render(); focusDetail(); return; }
    if (b.dataset.introduction) { if (b.dataset.contactPerson) { selected = b.dataset.contactPerson; render(); } openIntroduction(b.dataset.introduction); return; }
    if (b.dataset.editContact) { selected = b.dataset.editContact; render(); editAt('personLinkedin'); return; }
    if (b.dataset.contactRelation) { selected = b.dataset.contactRelation; render(); openForm('relation'); return; }
    if (b.dataset.accessRole) { openAccessGuide(b.dataset.accessRole); return; }
    if (b.dataset.existing) {
      selected = b.dataset.existing; clearFilters(); closeForm(); render();
      if (selected !== ownPersonId() && !ownRelationship(person())) openForm('relation'); else focusDetail(); return;
    }
    if (b.dataset.level !== undefined) { const f = q('#rs-form').elements; f.personLevel.value = f.personLevel.value === b.dataset.level ? '' : b.dataset.level; updateChoices(); return; }
    if (b.dataset.collaboration) { q('#rs-form').elements.personCollaboration.value = b.dataset.collaboration; updateChoices(); return; }
    if (b.dataset.context) { const f = q('#rs-form').elements; f.personContext.value = b.dataset.context + ' · '; f.personContext.focus(); return; }
    const a = b.dataset.action;
    if (a === 'new') openQuickAdd();
    if (a === 'pick-contact') await pickContact();
    if (a === 'quick-paste-profile') { q('#quick-notes').open = true; q('#quick-text').focus(); q('#quick-text').scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
    if (a === 'quick-details') { if (!quickDraft) quickDraft = quickPersonFromText(''); q('#quick-dialog').close(); openForm('new'); applyQuickDraft(); }
    if (a === 'quick-homonym') { quickHomonym = true; q('#quick-homonym').hidden = true; q('#quick-error').textContent = ''; renderQuickPreview(); }
    if (a === 'profile') { selected = ownPersonId(); closeForm(); render(); openForm('profile'); }
    if (a === 'edit') openForm(selected === ownPersonId() ? 'profile' : 'edit');
    if (a === 'relation') openForm('relation');
    if (a === 'cancel') { closeForm(); render(); selected ? focusDetail() : q('#rs-add').focus(); }
    if (a === 'close') closeDetail();
    if (a === 'clear') { clearFilters(); render(); }
    if (a === 'clear-search') { search = ''; q('#rs-search').value = ''; render(); q('#rs-search').focus(); }
    if (a === 'filters') { const hidden = !q('#rs-filters').hidden; q('#rs-filters').hidden = hidden; b.setAttribute('aria-expanded', String(!hidden)); }
    if (a === 'close-filters') { q('#rs-filters').hidden = true; q('#rs-filter-button').setAttribute('aria-expanded', 'false'); q('#rs-filter-button').focus(); }
    if (a === 'reset-tags') { for (const k of Object.keys(filters)) filters[k] = ''; render(); }
    if (a === 'different-person') { allowSameName = true; q('#rs-matches').hidden = true; q('#rs-name-conflict').hidden = true; q('#rs-form [type="submit"]').focus(); }
    if (a === 'sync') await synchronize();
    if (a === 'draft-open') { q('#draft-form').reset(); q('#draft-form').elements.linkedin.value = q('#rs-form').elements.personLinkedin.value; q('#draft-error').textContent = ''; updateProfileLinks(); showDialog('#draft-dialog'); }
    if (a === 'draft-undo' && draftUndo) {
      const f = q('#rs-form').elements; for (const [key, value] of Object.entries(draftUndo.fields)) f[key].value = value;
      offerTags.set(draftUndo.tags, allTagPools()); requestTags.set(draftUndo.needTags, allTagPools()); offerTags.blocked = new Set(draftUndo.blocked); requestTags.blocked = new Set(draftUndo.needBlocked);
      draftUndo = null; importedSuggestions = {}; q('#rs-draft-applied').hidden = true; refreshSuggestions(); updateProfileLinks();
    }
    if (a === 'remember' && !demo && !vault) { q('#remember-form').reset(); q('#remember-error').textContent = ''; q('#settings-dialog').close(); showDialog('#remember-dialog'); }
    if (a === 'settings') showDialog('#settings-dialog');
    if (a === 'team') openTeam();
    if (a === 'copy-team-link') await copyTeamLink();
    if (a === 'copy-introduction') await copyIntroduction();
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
      const shared = sharedPerson(p);
      confirm(shared ? 'Rimuovere il tuo collegamento?' : `Eliminare ${p.name}?`, shared ? 'Rimuove la tua relazione, le tue note e il tuo contributo. La scheda del team e le informazioni degli altri restano.' : 'Rimuove la persona, la tua relazione e il tuo contributo. È un contatto inserito solo da te.', () => {
        sync.edit(d => removeFromNetwork(d, id, user.id), original);
        if (!sync.pending) { selected = null; closeForm(); render(); q('#rs-add').focus(); }
        scheduleSync();
      }, shared ? 'Rimuovi' : 'Elimina');
    }
  } catch (e) { notice(e.message); }
});
root.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.querySelector('dialog[open]')) { if (mode) { closeForm(); render(); if (selected) focusDetail(); } else if (selected) closeDetail(); } });
window.addEventListener('online', synchronize);
window.addEventListener('offline', () => { if (sync && !demo) notice('Sei offline. Le modifiche si sincronizzeranno al ritorno della connessione.'); });
window.addEventListener('beforeunload', e => { if ((sync?.dirty || sync?.pending) && !demo) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sync && !mode) synchronize(); });
setInterval(() => { if (sync && !mode && document.visibilityState === 'visible') synchronize(); }, 45000);
loginScreen();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {});
