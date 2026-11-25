/**
 * Gera os ícones do PWA por código, sem dependências: um rasterizador simples
 * (polígonos com antisserrilhamento por supersampling) e um codificador PNG
 * (zlib do Node + CRC32). Usado pelo plugin em vite.config.ts.
 */
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function inPoly(x: number, y: number, p: number[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i];
    const yi = p[i + 1];
    const xj = p[j];
    const yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Shape {
  color: RGB;
  test: (x: number, y: number) => boolean;
}

/** Desenha o ícone em coordenadas normalizadas (0..1). */
function shapes(): Shape[] {
  const s: Shape[] = [];
  // sol
  s.push({ color: hex('#fff1c4'), test: (x, y) => (x - 0.72) ** 2 + (y - 0.7) ** 2 < 0.13 ** 2 });
  // morrinho com casinhas
  s.push({ color: hex('#7a3b5a'), test: (x, y) => y > 0.86 - 0.12 * Math.sin(x * 3.1) });
  // rabiola (laços)
  for (let i = 0; i < 5; i++) {
    const cx = 0.5 + Math.sin(i * 0.9) * 0.05;
    const cy = 0.66 + i * 0.065;
    const col = hex(i % 2 ? '#ffd400' : '#fff3a0');
    s.push({ color: col, test: (x, y) => inPoly(x, y, [cx, cy, cx - 0.045, cy - 0.02, cx - 0.045, cy + 0.02]) });
    s.push({ color: col, test: (x, y) => inPoly(x, y, [cx, cy, cx + 0.045, cy - 0.02, cx + 0.045, cy + 0.02]) });
  }
  // pipa (raia de duas cores)
  s.push({ color: hex('#ff3b5c'), test: (x, y) => inPoly(x, y, [0.5, 0.1, 0.77, 0.36, 0.5, 0.66]) });
  s.push({ color: hex('#ffd400'), test: (x, y) => inPoly(x, y, [0.5, 0.1, 0.23, 0.36, 0.5, 0.66]) });
  // varetas
  s.push({ color: hex('#5a2a10'), test: (x, y) => Math.abs(x - 0.5) < 0.008 && y > 0.1 && y < 0.66 });
  s.push({ color: hex('#5a2a10'), test: (x, y) => Math.abs(y - (0.36 - 0.06 * (1 - ((x - 0.5) / 0.27) ** 2))) < 0.008 && x > 0.23 && x < 0.77 });
  return s;
}

function background(y: number): RGB {
  const stops: [number, RGB][] = [
    [0, hex('#3b4fa0')],
    [0.45, hex('#c9628c')],
    [0.75, hex('#f9a65a')],
    [1, hex('#ffd58a')],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (y >= a && y <= b) {
      const t = (y - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** PNG RGB de `size`×`size` com o ícone do jogo. `pad` encolhe o desenho (ícone "maskable"). */
export function renderIconPng(size: number, pad = 0): Uint8Array {
  const sh = shapes();
  const raw = new Uint8Array(size * (size * 3 + 1));
  const SS = 3;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          const x = (u - pad) / (1 - 2 * pad);
          const y = (v - pad) / (1 - 2 * pad);
          let c = background(v);
          for (let i = 0; i < sh.length; i++) if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && sh[i].test(x, y)) c = sh[i].color;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(r / (SS * SS));
      raw[o + 1] = Math.round(g / (SS * SS));
      raw[o + 2] = Math.round(b / (SS * SS));
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))), chunk('IEND', new Uint8Array(0))];
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Ícone vetorial (SVG) equivalente, para navegadores que aceitam. */
export function iconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4fa0"/><stop offset=".45" stop-color="#c9628c"/><stop offset=".75" stop-color="#f9a65a"/><stop offset="1" stop-color="#ffd58a"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/><circle cx="72" cy="70" r="13" fill="#fff1c4"/>
<path d="M0 86 Q50 62 100 86 V100 H0Z" fill="#7a3b5a"/>
<path d="M50 66 q6 8 -2 14 q-6 7 3 13" stroke="#fff3a0" stroke-width="2" fill="none"/>
<path d="M50 10 L77 36 L50 66Z" fill="#ff3b5c"/><path d="M50 10 L23 36 L50 66Z" fill="#ffd400"/>
<path d="M50 10 V66 M23 36 Q50 28 77 36" stroke="#5a2a10" stroke-width="1.6" fill="none"/></svg>`;
}
