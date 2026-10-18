import { mountTextareaSizes } from './textarea-size.js';
import { NeedsEditor } from './needs-editor.js';
import { profileNeeds } from './needs.js';
import { mountOfferGuidance, refreshOfferGuidance } from './offer-guidance.js';
import { PROFILE_FIELDS } from './profile-card.js';
import { makePersonalCard, personalCardLink, readPersonalCardLink, loadPersonalCard, rememberPersonalCard, forgetPersonalCard } from './personal-card.js';
import { personContactActions } from './contacts.js';
import { hydrateIcons, icon } from './icons.js';
const root = document.getElementById('rete-tag'), q = s => root.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const needsEditor = new NeedsEditor(q('#personal-needs-editor'), { self: true });
let saved = null, current = null;
try { saved = loadPersonalCard(); } catch { q('#personal-status').textContent = 'Copia locale non disponibile. Puoi ricreare la tua scheda o aprire il link che hai conservato.'; }
function edit(card = null) {
  current = card; q('#personal-cancel').hidden = !card;
  for (const k of Object.keys(PROFILE_FIELDS).filter(k => k !== 'need')) q('#personal-form').elements[k].value = card?.profile[k] || '';
  needsEditor.setProfile(card?.profile || {});
  refreshOfferGuidance(root);
  q('#personal-view').hidden = true; q('#personal-editor').hidden = false; q('#personal-form').elements.name.focus();
}
function view(card) {
  current = card; const p = card.profile, link = personalCardLink(card, window.location.href);
  q('#personal-editor').hidden = true; q('#personal-view').hidden = false;
  q('#personal-name').textContent = p.name; q('#personal-role').textContent = p.role; q('#personal-role').hidden = !p.role;
  q('#personal-help').textContent = p.help; q('#personal-offer').hidden = !p.help;
  const requested = profileNeeds(p); q('#personal-need-copy').replaceChildren(); q('#personal-need-copy').className = 'rs-shared-needs';
  for (const n of requested) { const item = document.createElement('p'); item.textContent = n.text; q('#personal-need-copy').append(item); }
  q('#personal-need').hidden = !requested.length;
  q('#personal-share').hidden = !navigator.share; q('#personal-copy').classList.toggle('rs-primary', !navigator.share);
  q('#personal-link').value = link; q('#personal-link').hidden = true;
  const add = new URL('./', window.location.href); add.hash = new URL(link).hash; q('#personal-add').href = add.href;
  const mine = saved?.id === card.id; q('#personal-add').hidden = mine;
  q('#personal-edit').textContent = mine ? 'Modifica la tua scheda' : 'È la mia scheda · Modifica';
  q('#personal-new').hidden = mine; q('#personal-forget').hidden = !mine;
  q('#personal-contacts').innerHTML = personContactActions({ ...p, relationships: [{ authorId: 'self' }] }, 'self').filter(a => a.href).map(a => `<a class="rs-btn rs-${a.type}" href="${esc(a.href)}" ${a.type === 'email' ? '' : 'target="_blank" rel="noopener noreferrer"'}>${a.type === 'whatsapp' ? icon('message-circle') + 'WhatsApp' : a.type === 'email' ? 'Email' : 'LinkedIn ↗'}</a>`).join('');
}
try {
  if (window.location.hash.startsWith('#card=')) view(readPersonalCardLink(window.location.hash));
  else if (saved) view(saved); else edit();
} catch (error) { q('#personal-status').textContent = error.message; edit(); }
q('#personal-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = event.currentTarget.elements;
    const fields = { ...Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k => [k, k === 'need' ? '' : f[k].value])), needs: needsEditor.profile() };
    const card = makePersonalCard(fields, current);
    let note = 'Scheda pronta. Il link può essere riutilizzato con più persone.';
    if (q('#personal-remember').checked) {
      try { rememberPersonalCard(card); saved = card; }
      catch { note = 'Scheda pronta. Questo browser non la ricorda: conserva il link per riutilizzarla.'; }
    }
    view(card); q('#personal-status').textContent = note;
    const url = new URL(personalCardLink(card, window.location.href)); window.history.replaceState(null, '', url.pathname + url.hash);
    window.scrollTo?.({ top: 0 });
  } catch (error) { q('#personal-status').textContent = error.message; }
});
q('#personal-cancel').addEventListener('click', () => { if (current) view(current); });
q('#personal-edit').addEventListener('click', () => edit(current));
q('#personal-new').addEventListener('click', () => { q('#personal-status').textContent = ''; edit(saved); });
q('#personal-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(q('#personal-link').value); q('#personal-status').textContent = 'Link copiato. Puoi inviare questa scheda a più persone.'; }
  catch { q('#personal-link').hidden = false; q('#personal-link').focus(); q('#personal-link').select(); q('#personal-status').textContent = 'Copia il link selezionato.'; }
});
q('#personal-share').addEventListener('click', async () => {
  try { await navigator.share({ title: current.profile.name + ' · Tramite', text: 'Quando coinvolgermi e cosa cerco.', url: q('#personal-link').value }); }
  catch (error) { if (error.name !== 'AbortError') { q('#personal-share').hidden = true; q('#personal-status').textContent = 'Usa Copia link per inviare la scheda.'; } }
});
q('#personal-forget').addEventListener('click', () => {
  try { forgetPersonalCard(); saved = null; window.history.replaceState(null, '', window.location.pathname); edit(); q('#personal-status').textContent = 'Copia rimossa da questo dispositivo. Le schede già condivise restano disponibili a chi le ha ricevute.'; }
  catch { q('#personal-status').textContent = 'Il browser non consente di rimuovere la copia. Usa le impostazioni del sito.'; }
});
hydrateIcons(root);
mountOfferGuidance(root);

mountTextareaSizes(root);
