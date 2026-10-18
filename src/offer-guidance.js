import { refreshTextareaSizes } from './textarea-size.js';
// Optional writing prompts. They never rewrite the offer or claim a skill.
export function offerGuidance(value, self = false) {
  const text = String(value || '').trim();
  if (!text) return 'Un’attività concreta, e per chi.';
  const action = /\b(creo|crea|creare|realizz\w*|progetto|progetta|progettare|sviluppo|sviluppa|sviluppare|aiuto|aiuta|aiutare|organizz\w*|risolv\w*|scriv\w*|tradu\w*|analizz\w*|formo|forma|formare|affianc\w*|coordino|coordina|coordinare|metto|mette|mettere|presento|presenta|presentare)\b/iu.test(text);
  if (!action && text.split(/\s+/u).length <= 5 && !/[.!?]/u.test(text)) return self ? 'Prova a indicare qualcosa che potresti realizzare.' : 'Prova a indicare qualcosa che potrebbe realizzare.';
  if (action && !/\b(per|con|a|ai|agli|alle|alla|al|nel|nella|nelle|negli|sul|sulla|sulle)\b/iu.test(text)) return 'Per chi? Aggiungi il contesto, se è utile.';
  return '';
}
export function refreshOfferGuidance(root) {
  for (const input of root.querySelectorAll('[data-offer-hint]')) {
    const hint = root.querySelector('#' + input.dataset.offerHint);
    if (!hint) continue;
    hint.textContent = offerGuidance(input.value, input.dataset.offerSelf === 'true');
    hint.hidden = !hint.textContent;
  }
  refreshTextareaSizes(root);
}
export function mountOfferGuidance(root) {
  root.addEventListener('input', event => { if (event.target.matches('[data-offer-hint]')) refreshOfferGuidance(root); });
  refreshOfferGuidance(root);
}
