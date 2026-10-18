import { decodeFormLink, encodeFormLink } from './profile-requests.js';
import { normalizePhone, normalizeEmail, mailtoURL, whatsappURL } from './contacts.js';
import { normalizeLinkedIn } from './profile.js';
import { hydrateIcons } from './icons.js';
import { PROFILE_FIELDS } from './profile-card.js';

const root = document.getElementById('rete-tag');
const q = s => root.querySelector(s);
let invitation, responseId;
try {
  invitation = decodeFormLink(window.location.hash, 'invite'); responseId = crypto.randomUUID();
  q('#response-for').textContent = `Su invito di ${invitation.facilitator}`;
  q('#response-sharing').textContent = `La risposta sarà condivisa con ${invitation.facilitator} e il suo team. Compila solo ciò che vuoi condividere.`;
  if (invitation.prefill && Object.values(invitation.prefill).some(Boolean)) {
    for (const key of Object.keys(PROFILE_FIELDS)) q('#response-form').elements[key].value = invitation.prefill[key];
    q('#response-prefill-hint').hidden = false;
    q('#response-prefill-hint').textContent = `${invitation.facilitator} ha preparato una bozza. Conferma ciò che va bene, correggi o aggiungi.`;
  }
  const channel = invitation.replyPhone ? 'WhatsApp' : invitation.replyEmail ? 'email' : '';
  q('#response-submit-label').textContent = channel ? `Rispondi via ${channel}` : navigator.share ? 'Condividi la tua scheda' : 'Copia la tua risposta';
  q('#response-delivery-hint').textContent = channel ? `Si apre ${channel} con la risposta pronta per ${invitation.facilitator}. Devi solo inviarla.` : 'Invia la risposta a chi ti ha invitato: aprirà la scheda e confermerà l’aggiunta.';
  q('#response-editor').hidden = false;
} catch (error) {
  q('#response-error').hidden = false;
  if (window.location.hash) q('#response-error-copy').textContent = error.message;
}
q('#response-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (!invitation) return;
    const f = event.currentTarget.elements;
    const response = { v: invitation.v, kind: 'response', personId: invitation.personId, authorId: invitation.authorId, requestId: invitation.requestId,
      ...(invitation.v === 2 ? { responseId } : {}), name: f.name.value.trim(), role: f.role.value.trim(), help: f.help.value.trim(), need: f.need.value.trim(),
      phone: normalizePhone(f.phone.value), email: normalizeEmail(f.email.value), linkedin: normalizeLinkedIn(f.linkedin.value) };
    const link = encodeFormLink(response, window.location.href);
    q('#response-link').value = link;
    q('#response-return-copy').textContent = `${invitation.facilitator} aprirà la risposta e confermerà la tua scheda. Nessun appunto precedente verrà cancellato.`;
    const message = `Ecco la mia scheda per Tramite:\n${link}`;
    q('#response-whatsapp').hidden = !invitation.replyPhone;
    const whatsapp = invitation.replyPhone ? whatsappURL(invitation.replyPhone, message) : '';
    if (whatsapp) q('#response-whatsapp').href = whatsapp;
    q('#response-email').hidden = !invitation.replyEmail;
    const email = invitation.replyEmail ? mailtoURL(invitation.replyEmail, 'La mia scheda · Tramite', message) : '';
    if (email) q('#response-email').href = email;
    q('#response-editor').hidden = true; q('#response-ready').hidden = false; q('#response-copy-status').textContent = '';
    q('#response-ready h1').setAttribute('tabindex', '-1'); q('#response-ready h1').focus(); window.scrollTo?.({ top: 0 });
    // This explicit click opens a prepared reply, never sends it automatically.
    if (whatsapp) window.open(whatsapp, '_blank', 'noopener,noreferrer');
    else if (email) window.location.assign(email);
    else if (navigator.share) {
      try { await navigator.share({ title: 'La mia scheda · Tramite', text: `La mia scheda per ${invitation.facilitator}.`, url: link }); }
      catch (error) { if (error.name === 'AbortError') q('#response-copy-status').textContent = 'Condivisione annullata. La risposta è qui, puoi riprovare.'; }
    } else await copyResponse();
  } catch (error) { q('#response-validation').textContent = error.message; }
});
q('#response-edit').addEventListener('click', () => { q('#response-ready').hidden = true; q('#response-editor').hidden = false; q('#response-validation').textContent = ''; });
async function copyResponse() {
  try { await navigator.clipboard.writeText(q('#response-link').value); q('#response-copy-status').textContent = 'Risposta copiata. Incollala nella conversazione con chi ti ha invitato.'; }
  catch { q('#response-link').focus(); q('#response-link').select(); q('#response-copy-status').textContent = 'Copia il link selezionato e invialo nella vostra conversazione.'; }
}
q('#response-copy').addEventListener('click', copyResponse);
hydrateIcons(document);
