import { QrCode } from './qr-engine.js';

// The original Tramite vector stays self-contained in downloads.
const BRAND = `<defs>
    <linearGradient id="qr-violet" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#8271ff"/>
      <stop offset="1" stop-color="#5141df"/>
    </linearGradient>
  </defs>
  <path fill="url(#qr-violet)" d="M0 0h512v512H0z"/>
  <path d="M256 248v26c0 22-112 17-112 52m112-52c0 22 112 17 112 52" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#e7e2ff">
    <circle cx="144" cy="268" r="25"/>
    <circle cx="368" cy="268" r="25"/>
    <path d="M96 358v-12c0-24 21-40 48-40s48 16 48 40v12c0 7-5 12-12 12h-72c-7 0-12-5-12-12zm224 0v-12c0-24 21-40 48-40s48 16 48 40v12c0 7-5 12-12 12h-72c-7 0-12-5-12-12z"/>
  </g>
  <g fill="#fff">
    <circle cx="256" cy="156" r="29"/>
    <path d="M200 250v-9c0-27 25-45 56-45s56 18 56 45v9c0 8-6 14-14 14h-84c-8 0-14-6-14-14z"/>
  </g>`;
export function qrSVG(text, { logo = true } = {}) {
  if (typeof text !== 'string' || !text || new TextEncoder().encode(text).length > 1200) throw new Error('Questa bozza è troppo lunga per un QR leggibile. Usa il link o un invito nuovo.');
  const qr = QrCode.encodeText(text, QrCode.Ecc.HIGH);
  const border = 4, side = qr.size + border * 2;
  let path = '';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) path += `M${x+border},${y+border}h1v1h-1z`;
  const badge = Math.max(9, Math.floor(qr.size * .14) | 1), start = (side - badge) / 2;
  const mark = logo ? `<rect x="${start-1}" y="${start-1}" width="${badge+2}" height="${badge+2}" rx="2" fill="white"/><svg x="${start}" y="${start}" width="${badge}" height="${badge}" viewBox="0 0 512 512">${BRAND}</svg>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="1024" height="1024" role="img" aria-label="QR per compilare la scheda Tramite"><title>Invito Tramite</title><rect width="${side}" height="${side}" fill="white"/><path d="${path}" fill="#242033" shape-rendering="crispEdges"/>${mark}</svg>`;
}
export async function qrPNG(svg) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Impossibile creare il PNG.')), 'image/png'));
}
