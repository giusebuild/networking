import { sharedLinkFragments, transportVariants } from './share-links.js';

// A conservative product limit, not a claimed WhatsApp platform limit.
export const CHAT_LINK_LIMIT = 1800;
const MAX_BYTES = 19500, MAX_FILE = 50000;
const short = { response: 'r', card: 'c', invite: 'v', i: 'i' };
const long = Object.fromEntries(Object.entries(short).map(([a, b]) => [b, a]));
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > 26000) throw new Error('Scheda non valida o troppo lunga.');
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
}
async function readLimited(stream) {
  const reader = stream.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Scheda troppo grande.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}
export async function compactShareLink(link) {
  const url = new URL(link), [fragment] = sharedLinkFragments(url.hash, Object.keys(short));
  const bytes = decode(fragment.encoded); let payload = bytes, codec = 'u';
  if (bytes.length > MAX_BYTES) throw new Error('Scheda troppo grande.');
  if (typeof CompressionStream === 'function') {
    try {
      const compressed = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')));
      if (compressed.length < bytes.length) { payload = compressed; codec = 'z'; }
    } catch { /* Short path segments remain usable without compression support. */ }
  }
  // Standard URL path separators avoid one enormous word in messaging clients.
  const parts = encode(payload).match(/.{1,48}/g);
  url.hash = `/${short[fragment.marker]}/${codec}/${parts.join('/')}`;
  url.search = '';
  return url.href;
}

// Decode the transport, then delegate identity, invite and profile validation
// to the existing readers. Neither URLs nor files trigger a network request.
export async function expandShareText(input) {
  if (typeof input !== 'string' || input.length > 120000) throw new Error('Incolla il messaggio o il link della scheda.');
  const output = new Set(), attempted = new Set(); let compact = false;
  for (const text of transportVariants(input)) {
    const pattern = /#\/?([rcvi])\/(z|u)\/([A-Za-z0-9_/-]+)/g;
    for (const match of text.matchAll(pattern)) {
      compact = true;
      let token = match[3], tail = text.slice(match.index + match[0].length);
      for (let i = 0; i < 400; i++) {
        const key = match[1] + match[2] + token;
        if (attempted.size > 512) throw new Error('Incolla una sola scheda alla volta.');
        if (!attempted.has(key)) {
          attempted.add(key);
          try {
            const raw = decode(token.replaceAll('/', ''));
            const bytes = match[2] === 'z' ? await readLimited(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))) : raw;
            if (bytes.length > MAX_BYTES) throw new Error('Scheda troppo grande.');
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            output.add('#' + long[match[1]] + '=' + encode(bytes));
          } catch { /* Also try an actual line-wrap continuation. */ }
        }
        const next = tail.match(/^[ \t]*\r?\n[ \t]*([A-Za-z0-9_/-]+)/); if (!next) break;
        token += next[1]; tail = tail.slice(next[0].length);
        if (token.length > 27000) break;
      }
    }
  }
  if (!compact) return input;
  if (!output.size) throw new Error('Link incompleto o non leggibile. Incolla il messaggio completo oppure apri il file della scheda.');
  try { for (const f of sharedLinkFragments(input, Object.keys(short))) output.add('#' + f.marker + '=' + f.encoded); } catch {}
  return [...output].join('\n\n');
}

export function makeShareFile(link, name = 'Scheda') {
  const safe = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 70) || 'Scheda';
  return new File([JSON.stringify({ tramite: 1, link })], safe + '.tramite.json', { type: 'application/json' });
}
export function canShareFile(file, navigator = globalThis.navigator) {
  try { return !!navigator?.share && !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}
export async function readShareFile(file) {
  if (!file || file.size > MAX_FILE) throw new Error('File della scheda troppo grande.');
  let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('Questo file non contiene una scheda Tramite leggibile.'); }
  if (!data || Object.keys(data).length !== 2 || data.tramite !== 1 || typeof data.link !== 'string' || data.link.length > 28000) throw new Error('Scegli un file della scheda con estensione .tramite.json.');
  return data.link;
}
export function downloadShareFile(file, document = globalThis.document) {
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
