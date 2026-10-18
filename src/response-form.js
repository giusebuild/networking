import { mountTextareaSizes, refreshTextareaSizes } from './textarea-size.js';
import { ensureShellVersion } from './shell-version.js';
import { NeedsEditor } from './needs-editor.js';
import { profileNeeds } from './needs.js';
import { mountOfferGuidance, refreshOfferGuidance } from './offer-guidance.js';
import { decodeFormLink, encodeFormLink } from './profile-requests.js';
import { responseMessage } from './response-message.js';
import { compactShareLink, expandShareText, CHAT_LINK_LIMIT, makeShareFile, canShareFile, downloadShareFile } from './share-transport.js';
import { normalizePhone, normalizeEmail, mailtoURL, whatsappURL } from './contacts.js';
import { normalizeLinkedIn } from './profile.js';
import { hydrateIcons, icon } from './icons.js';
import { makePersonalCard, personalCardLink, loadPersonalCard, rememberPersonalCard, sameProfile } from './personal-card.js';
import { PROFILE_FIELDS } from './profile-card.js';

await ensureShellVersion();
const root = document.getElementById('rete-tag');
const q = s => root.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const needsEditor = new NeedsEditor(q('#response-needs-editor'), { self: true });
let invitation, responseId, personal = null, identityCard = null, outgoing = null, preparing = false;
try { personal = loadPersonalCard(); } catch {}
function usePersonal() {
  if (!personal) return; identityCard = personal;
  for (const k of Object.keys(PROFILE_FIELDS).filter(k => k !== 'need')) q('#response-form').elements[k].value = personal.profile[k];
  needsEditor.setProfile(personal.profile);
  q('#response-prefill-hint').hidden = false; q('#response-prefill-hint').textContent = 'La tua scheda è già pronta. Rivedi e invia.'; q('#response-use-personal').hidden = true;
  q('#response-remember').checked = true; refreshOfferGuidance(root);
}
try {
  invitation = decodeFormLink(await expandShareText(window.location.hash), 'invite'); responseId = crypto.randomUUID();
  q('#response-for').textContent = `Su invito di ${invitation.facilitator}`;
  q('#response-sharing').textContent = `La scheda sarà condivisa con ${invitation.facilitator} e il suo team. Compila solo ciò che vuoi condividere.`;
  if (invitation.prefill && Object.values(invitation.prefill).some(Boolean)) {
    for (const key of Object.keys(PROFILE_FIELDS).filter(k => k !== 'need')) q('#response-form').elements[key].value = invitation.prefill[key];
    needsEditor.setProfile(invitation.prefill);
    q('#response-prefill-hint').hidden = false;
    q('#response-prefill-hint').textContent = `${invitation.facilitator} ha preparato una bozza. Conferma ciò che va bene, correggi o aggiungi.`;
  }
  if (personal) {
    const matches = invitation.personId === 'new' || sameProfile(personal.profile, invitation.prefill || {});
    if (matches) usePersonal(); else { q('#response-use-personal').hidden = false; q('#response-remember').checked = false; }
  }
  q('#response-submit-label').textContent = 'Rivedi e invia';
  q('#response-delivery-hint').textContent = `Nel prossimo passaggio rivedi la scheda e la invii a ${invitation.facilitator}.`;
  q('#response-editor').hidden = false;
} catch (error) {
  q('#response-error').hidden = false;
  if (window.location.hash) q('#response-error-copy').textContent = error.message;
}
q('#response-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (preparing || !invitation) return;
  preparing = true; q('#response-form button[type="submit"]').disabled = true;
  try {
    const f = event.currentTarget.elements;
    const fields = { ...Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k => [k, k === 'need' ? '' : f[k].value])), needs: needsEditor.profile() };
    const reusable = makePersonalCard(fields, identityCard); identityCard = reusable;
    const response = { v: 3, kind: 'response', personId: invitation.personId, authorId: invitation.authorId, requestId: invitation.requestId,
      responseId, cardId: reusable.id, name: f.name.value.trim(), role: f.role.value.trim(), help: f.help.value.trim(), need: '', needs: fields.needs,
      phone: normalizePhone(f.phone.value), email: normalizeEmail(f.email.value), linkedin: normalizeLinkedIn(f.linkedin.value) };
    const originalLink = encodeFormLink(response, window.location.href), link = await compactShareLink(originalLink);
    const large = link.length > CHAT_LINK_LIMIT, file = makeShareFile(originalLink, response.name);
    const message = responseMessage(response, large ? '' : link) + (large ? '\n\nScheda allegata: aprila in Tramite.' : '');
    let memoryNote = '';
    if (q('#response-remember').checked) { try { rememberPersonalCard(reusable); personal = reusable; } catch { memoryNote = ' Conserva il link della tua scheda: questo browser non la ricorda.'; } }
    q('#response-personal').href = await compactShareLink(personalCardLink(reusable, window.location.href)); q('#response-personal').hidden = false;
    const channel = large ? 'file' : invitation.replyPhone ? 'whatsapp' : invitation.replyEmail ? 'email' : navigator.share ? 'share' : 'copy';
    outgoing = { response, link, message, channel, file, large };
    q('#response-link').value = link; q('#response-message').value = message; q('#response-manual').hidden = true;
    q('#response-ready-title').textContent = `Invia a ${invitation.facilitator}`;
    const instructions = { whatsapp: 'Si apre WhatsApp con la scheda pronta. Premi Invia nella conversazione.', email: 'Si apre la tua app email con la scheda pronta. Controlla e premi Invia.', share: 'Scegli la conversazione con chi ti ha invitato e invia la scheda.', copy: `Copia il messaggio, incollalo nella conversazione con ${invitation.facilitator} e invialo.`, file: `Questa scheda è lunga. Invia il file a ${invitation.facilitator}: in Tramite potrà usare Apri una scheda ricevuta → Apri file.` };
    q('#response-return-copy').textContent = instructions[channel] + memoryNote;
    const labels = { whatsapp: 'Invia su WhatsApp', email: 'Invia via email', share: 'Condividi scheda', copy: 'Copia messaggio', file: canShareFile(file) ? 'Condividi file' : 'Scarica scheda' };
    q('#response-send').innerHTML = icon(channel === 'copy' ? 'clipboard' : 'send') + labels[channel];
    q('#response-preview').innerHTML = `<h2>${esc(response.name)}</h2>${response.role ? `<p class="rs-role">${esc(response.role)}</p>` : ''}${response.help ? `<section class="rs-person-offer"><h3 class="rs-intent-label">${icon('briefcase')}Posso aiutare con</h3><p>${esc(response.help)}</p></section>` : ''}${response.needs.length ? `<section class="rs-person-need"><h3 class="rs-intent-label">${icon('search')}Cerco</h3><div class="rs-shared-needs">${profileNeeds(response).map(n => `<p>${esc(n.text)}</p>`).join('')}</div></section>` : ''}${[response.email, response.phone, response.linkedin].some(Boolean) ? `<p class="rs-response-contacts">${[response.email, response.phone, response.linkedin].filter(Boolean).map(esc).join('<br>')}</p>` : ''}`;
    q('#response-whatsapp').hidden = large || !invitation.replyPhone || channel === 'whatsapp';
    if (invitation.replyPhone) q('#response-whatsapp').href = whatsappURL(invitation.replyPhone, message);
    q('#response-email').hidden = large || !invitation.replyEmail || channel === 'email';
    if (invitation.replyEmail) q('#response-email').href = mailtoURL(invitation.replyEmail, 'La mia scheda · Tramite', message);
    q('#response-share').hidden = large || !navigator.share || channel === 'share'; q('#response-copy').hidden = channel === 'copy';
    q('#response-file').hidden = large; q('#response-file').textContent = canShareFile(file) ? 'Invia come file' : 'Scarica file';
    q('#response-other').hidden = false; q('#response-other').open = false; q('#response-link-details').open = false;
    q('#response-editor').hidden = true; q('#response-ready').hidden = false; q('#response-copy-status').textContent = '';
    q('#response-ready-title').setAttribute('tabindex', '-1'); q('#response-ready-title').focus(); window.scrollTo?.({ top: 0 });
  } catch (error) { q('#response-validation').textContent = error.message; }
  finally { preparing = false; q('#response-form button[type="submit"]').disabled = false; }
});
async function shareResponse() {
  try { await navigator.share({ title: 'La mia scheda · Tramite', text: responseMessage(outgoing.response), url: outgoing.link }); q('#response-copy-status').textContent = 'Completa l’invio nella conversazione scelta.'; }
  catch (error) { q('#response-copy-status').textContent = error.name === 'AbortError' ? 'Condivisione annullata. La scheda è qui: puoi riprovare.' : 'Condivisione non disponibile. Usa Copia messaggio.'; q('#response-other').open = true; }
}
async function copyResponse() {
  if (!outgoing) return;
  try { await navigator.clipboard.writeText(outgoing.message); q('#response-copy-status').textContent = outgoing.large ? `Messaggio copiato. Invialo insieme al file a ${invitation.facilitator}.` : `Messaggio copiato. Incollalo nella conversazione con ${invitation.facilitator} e invialo.`; }
  catch { q('#response-manual').hidden = false; q('#response-message').focus(); q('#response-message').select(); q('#response-copy-status').textContent = `Copia il messaggio selezionato e invialo a ${invitation.facilitator}${outgoing.large ? ' insieme al file della scheda' : ''}.`; }
}
async function sendResponseFile() {
  if (!outgoing) return;
  try {
    if (canShareFile(outgoing.file)) { await navigator.share({ files: [outgoing.file], title: 'La mia scheda · Tramite', text: `La scheda di ${outgoing.response.name}. In Tramite: Apri una scheda ricevuta → Apri file.` }); q('#response-copy-status').textContent = 'Completa l’invio del file nella conversazione.'; }
    else { downloadShareFile(outgoing.file); q('#response-copy-status').textContent = `File scaricato. Allegalo nella conversazione con ${invitation.facilitator}.`; }
  } catch (error) { q('#response-copy-status').textContent = error.name === 'AbortError' ? 'Condivisione annullata. Puoi riprovare.' : 'Condivisione non disponibile. Scarica il file e allegalo alla conversazione.'; q('#response-file').hidden = false; q('#response-file').textContent = 'Scarica file'; q('#response-other').open = true; }
}
q('#response-send').addEventListener('click', async () => {
  if (!outgoing) return;
  try {
    if (outgoing.channel === 'whatsapp') { window.open(q('#response-whatsapp').href, '_blank', 'noopener,noreferrer'); q('#response-copy-status').textContent = 'Completa l’invio in WhatsApp. Se non si apre, usa Un altro modo.'; q('#response-whatsapp').hidden = false; }
    else if (outgoing.channel === 'email') { window.location.assign(q('#response-email').href); q('#response-copy-status').textContent = 'Completa l’invio nella tua app email. Se non si apre, usa Un altro modo.'; q('#response-email').hidden = false; }
    else if (outgoing.channel === 'file') await sendResponseFile();
    else if (outgoing.channel === 'share') await shareResponse(); else await copyResponse();
  } catch { q('#response-copy-status').textContent = 'Usa Copia messaggio per inviare la scheda.'; q('#response-other').open = true; }
});
q('#response-use-personal').addEventListener('click', usePersonal);
q('#response-edit').addEventListener('click', () => { q('#response-ready').hidden = true; q('#response-editor').hidden = false; q('#response-validation').textContent = ''; refreshTextareaSizes(root); });
q('#response-copy').addEventListener('click', copyResponse);
q('#response-share').addEventListener('click', shareResponse);
q('#response-file').addEventListener('click', () => { if (!outgoing) return; if (q('#response-file').textContent === 'Scarica file') downloadShareFile(outgoing.file); else sendResponseFile(); });
hydrateIcons(document);
mountOfferGuidance(root);
mountTextareaSizes(root);
// A second invitation can be a same-document hash navigation. Reinitialize
// from that link so a reply never keeps the previous inviter/request.
window.addEventListener('hashchange', () => window.location.reload());
