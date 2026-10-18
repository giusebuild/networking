import { decodeFormLink, encodeFormLink } from './profile-requests.js';
import { normalizePhone, normalizeEmail, mailtoURL } from './contacts.js';
import { normalizeLinkedIn } from './profile.js';
import { hydrateIcons } from './icons.js';

const q = s => document.querySelector(s);
let invitation;
try {
  invitation = decodeFormLink(window.location.hash, 'invite');
  q('#response-for').textContent = `Su invito di ${invitation.facilitator}`;
  q('#response-sharing').textContent = `La risposta sarà condivisa con ${invitation.facilitator} e il suo team. Compila solo ciò che vuoi condividere.`;
  q('#response-editor').hidden = false;
} catch (error) {
  q('#response-error').hidden = false;
  if (window.location.hash) q('#response-error-copy').textContent = error.message;
}
q('#response-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!invitation) return;
    const f = event.currentTarget.elements;
    const response = { v: 1, kind: 'response', personId: invitation.personId, authorId: invitation.authorId, requestId: invitation.requestId,
      name: f.name.value.trim(), role: f.role.value.trim(), help: f.help.value.trim(), need: f.need.value.trim(),
      phone: normalizePhone(f.phone.value), email: normalizeEmail(f.email.value), linkedin: normalizeLinkedIn(f.linkedin.value) };
    const link = encodeFormLink(response, window.location.href);
    q('#response-link').value = link;
    q('#response-return-copy').textContent = `Inviala a ${invitation.facilitator}: potrà rivederla e aggiornare la tua scheda senza ricopiarla.`;
    const message = `Ecco la mia scheda per Tramite:\n${link}`;
    // Keep the complete response link, including Unicode, in every transport.
    q('#response-whatsapp').hidden = !invitation.replyPhone;
    if (invitation.replyPhone) q('#response-whatsapp').href = `https://wa.me/${normalizePhone(invitation.replyPhone).slice(1)}?text=${encodeURIComponent(message)}`;
    q('#response-email').hidden = !invitation.replyEmail;
    if (invitation.replyEmail) q('#response-email').href = mailtoURL(invitation.replyEmail, 'La mia scheda · Tramite', message);
    q('#response-editor').hidden = true; q('#response-ready').hidden = false; q('#response-copy-status').textContent = '';
    q('#response-ready h1').setAttribute('tabindex', '-1'); q('#response-ready h1').focus(); window.scrollTo?.({ top: 0 });
  } catch (error) { q('#response-validation').textContent = error.message; }
});
q('#response-edit').addEventListener('click', () => { q('#response-ready').hidden = true; q('#response-editor').hidden = false; q('#response-validation').textContent = ''; });
q('#response-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(q('#response-link').value); q('#response-copy-status').textContent = 'Copiata. Incollala nella conversazione con chi ti ha invitato.'; }
  catch { q('#response-link').focus(); q('#response-link').select(); q('#response-copy-status').textContent = 'Copia il link selezionato e invialo nella vostra conversazione.'; }
});
hydrateIcons(document);
