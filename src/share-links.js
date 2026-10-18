// Accept a link on its own or the message containing it. No URL is fetched.
// Decoding transport escapes happens before reading the Base64 payload; the
// person's actual text is never URL-decoded or rewritten.
const MAX_MESSAGE = 120000;
const MAX_PAYLOAD = 26000;
const missing = () => new Error('Non trovo una scheda Tramite. Incolla il link o il messaggio ricevuto completo.');
function transportVariants(input) {
  let text = input.trim().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  const variants = new Set([text]);
  for (let i = 0; i < 2; i++) {
    text = text.replace(/(?:%[a-f\d]{2})+/gi, encoded => { try { return decodeURIComponent(encoded); } catch { return encoded; } });
    variants.add(text);
  }
  return variants;
}
export function isShareRoute(hash, markers) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return false;
  return [...transportVariants(hash.slice(0, MAX_MESSAGE))].some(text => new RegExp(`^#+(?:${markers.join('|')})\\s*=`).test(text));
}

export function sharedLinkFragments(input, markers) {
  if (typeof input !== 'string' || !input.trim()) throw missing();
  if (input.length > MAX_MESSAGE) throw new Error('Messaggio troppo lungo. Incolla soltanto il link della scheda.');
  const variants = transportVariants(input);
  const result = new Map();
  const pattern = new RegExp(`#(${markers.join('|')})\\s*=\\s*([A-Za-z0-9_-]+)`, 'g');
  for (const variant of variants) {
    for (const match of variant.matchAll(pattern)) {
      const add = encoded => {
        if (encoded.length > MAX_PAYLOAD) throw new Error('Link della scheda troppo lungo o incompleto. Chiedi di inviarlo di nuovo.');
        result.set(match[1] + '=' + encoded, { marker: match[1], encoded });
        if (result.size > 512) throw new Error('Ci sono troppi link. Incolla una sola scheda alla volta.');
      };
      add(match[2]);
      // Some mail clients insert hard line breaks inside long links. Test both
      // the original token and joined continuations; only valid data is used.
      let encoded = match[2], tail = variant.slice(match.index + match[0].length);
      for (let i = 0; i < 400; i++) {
        const next = tail.match(/^[ \t]*\r?\n[ \t]*([A-Za-z0-9_-]+)/);
        if (!next) break;
        encoded += next[1]; add(encoded); tail = tail.slice(next[0].length);
      }
    }
  }
  if (!result.size) throw missing();
  return [...result.values()];
}

export function readSharedLink(input, markers, validate) {
  const values = new Map();
  for (const { marker, encoded } of sharedLinkFragments(input, markers)) {
    try {
      const raw = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, x => x.charCodeAt(0))));
      const value = validate(data, marker);
      values.set(JSON.stringify(value), value);
    } catch { /* A copied wrap may also produce an incomplete candidate. */ }
  }
  if (!values.size) throw new Error('La scheda è incompleta o non valida. Copia il messaggio completo oppure chiedi di inviarla di nuovo.');
  if (values.size !== 1) throw new Error('Ci sono più schede nel messaggio. Incollane una alla volta.');
  return values.values().next().value;
}
