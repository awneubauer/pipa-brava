/**
 * Ajudantes de desenho vetorial para os cenários. Todas as funções desenham em
 * coordenadas de metros com y para cima (o chamador aplica a transformação).
 */
import { Rng } from '../util/noise';

export type Ctx = CanvasRenderingContext2D;

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function poly(ctx: Ctx, pts: number[], color: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function circle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Janelas em grade (algumas acesas, tom de fim de tarde). */
export function windows(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  rng: Rng,
  dark: string,
  lit: string,
  litChance = 0.25,
): void {
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = rng.next() < litChance ? lit : dark;
      ctx.fillRect(x + c * cw + cw * 0.22, y + r * rh + rh * 0.25, cw * 0.56, rh * 0.5);
    }
}

/** Casa de tijolo / laje simples. */
export function house(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  wall: string,
  rng: Rng,
  opts: { brick?: boolean; slab?: string; door?: boolean; win?: string } = {},
): void {
  rect(ctx, x, y, w, h, wall);
  if (opts.brick) {
    ctx.fillStyle = 'rgba(90,30,10,0.22)';
    for (let yy = y + 0.25; yy < y + h; yy += 0.5) {
      const off = ((yy - y) / 0.5) % 2 < 1 ? 0 : 0.35;
      for (let xx = x + off; xx < x + w - 0.1; xx += 0.7) ctx.fillRect(xx, yy, 0.6, 0.06);
    }
  }
  if (opts.slab) rect(ctx, x - 0.15, y + h - 0.25, w + 0.3, 0.3, opts.slab);
  const win = opts.win ?? '#3a2a40';
  const nWin = Math.max(1, Math.floor(w / 2.2));
  for (let i = 0; i < nWin; i++) {
    const wx = x + (i + 0.5) * (w / nWin) - 0.45;
    const wy = y + h * 0.55;
    rect(ctx, wx, wy, 0.9, Math.min(0.9, h * 0.25), rng.next() < 0.3 ? '#ffcf6a' : win);
  }
  if (opts.door) rect(ctx, x + w * 0.15, y, 0.8, Math.min(1.9, h * 0.45), '#5b3a2a');
}

/** Caixa d'água (azul de fibra ou preta). */
export function waterTank(ctx: Ctx, cx: number, y: number, r: number, color: string): void {
  rect(ctx, cx - r, y, r * 2, r * 1.3, color);
  ctx.beginPath();
  ctx.ellipse(cx, y + r * 1.3, r * 1.05, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  rect(ctx, cx - r, y + r * 0.45, r * 2, r * 0.12, 'rgba(0,0,0,0.18)');
}

/** Antena parabólica. */
export function dish(ctx: Ctx, x: number, y: number, r: number, color = '#d8d8d8'): void {
  line(ctx, x, y, x, y + r * 0.9, r * 0.12, '#777');
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y + r * 1.1, r, r * 0.55, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Antena de TV (espinha de peixe). */
export function tvAntenna(ctx: Ctx, x: number, y: number, h: number, color = '#4a4a55'): void {
  line(ctx, x, y, x, y + h, 0.08, color);
  for (let i = 0; i < 4; i++) {
    const yy = y + h * (0.55 + i * 0.13);
    const w = h * (0.32 - i * 0.05);
    line(ctx, x - w, yy, x + w, yy, 0.06, color);
  }
}

/** Árvore copada (mangueira). */
export function mangoTree(ctx: Ctx, x: number, y: number, s: number, rng: Rng, dark: string, mid: string, light: string): void {
  ctx.fillStyle = '#5a3a24';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.12, y);
  ctx.lineTo(x - s * 0.08, y + s * 0.5);
  ctx.lineTo(x - s * 0.3, y + s * 0.75);
  ctx.lineTo(x - s * 0.22, y + s * 0.78);
  ctx.lineTo(x, y + s * 0.6);
  ctx.lineTo(x + s * 0.28, y + s * 0.8);
  ctx.lineTo(x + s * 0.3, y + s * 0.74);
  ctx.lineTo(x + s * 0.1, y + s * 0.5);
  ctx.lineTo(x + s * 0.13, y);
  ctx.closePath();
  ctx.fill();
  const blobs: [number, number, number, string][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    blobs.push([x + Math.cos(a) * s * 0.42, y + s * 1.0 + Math.sin(a) * s * 0.26, s * (0.3 + rng.next() * 0.12), dark]);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    blobs.push([x + Math.cos(a) * s * 0.3, y + s * 1.08 + Math.sin(a) * s * 0.18, s * (0.26 + rng.next() * 0.1), mid]);
  }
  for (let i = 0; i < 4; i++)
    blobs.push([x - s * 0.15 + i * s * 0.12, y + s * 1.25 + rng.next() * s * 0.1, s * 0.16, light]);
  for (const b of blobs) circle(ctx, b[0], b[1], b[2], b[3]);
}

/** Coqueiro. */
export function palm(ctx: Ctx, x: number, y: number, h: number, lean: number, trunk: string, leaf: string): void {
  ctx.beginPath();
  ctx.moveTo(x - 0.18, y);
  ctx.quadraticCurveTo(x + lean * 0.5, y + h * 0.5, x + lean - 0.1, y + h);
  ctx.lineTo(x + lean + 0.1, y + h);
  ctx.quadraticCurveTo(x + lean * 0.5 + 0.3, y + h * 0.5, x + 0.18, y);
  ctx.closePath();
  ctx.fillStyle = trunk;
  ctx.fill();
  const tx = x + lean;
  const ty = y + h;
  ctx.strokeStyle = leaf;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (i / 6) * 0.9);
    const len = h * 0.42;
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.35 - len * 0.25 * Math.abs(Math.cos(a));
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo((tx + ex) / 2, ty + len * 0.32, ex, ey);
    ctx.lineWidth = h * 0.06;
    ctx.stroke();
  }
  circle(ctx, tx, ty - 0.1, h * 0.04, '#6b4a1a');
}

/** Poste de luz de concreto com cruzeta. */
export function utilityPole(ctx: Ctx, x: number, y: number, h: number, color = '#8d8a86'): void {
  rect(ctx, x - 0.13, y, 0.26, h, color);
  rect(ctx, x - 0.9, y + h - 0.6, 1.8, 0.16, '#6f6a66');
  for (let i = -1; i <= 1; i++) circle(ctx, x + i * 0.7, y + h - 0.42, 0.07, '#ddd');
  rect(ctx, x - 0.35, y + h - 2.2, 0.7, 0.5, '#5d5a58');
}

/** Fio (catenária) a partir dos pontos de um perigo. */
export function wirePath(ctx: Ctx, pts: Float32Array, w: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Roupa no varal. */
export function clothesline(ctx: Ctx, x0: number, x1: number, y: number, rng: Rng): void {
  line(ctx, x0, y, x1, y - 0.1, 0.03, '#ddd');
  const colors = ['#ff5a6e', '#2fb6ff', '#ffd23f', '#ffffff', '#7bd36b', '#c86bff'];
  for (let x = x0 + 0.4; x < x1 - 0.5; x += 0.7 + rng.next() * 0.5) {
    const c = colors[Math.floor(rng.next() * colors.length)];
    const w = 0.35 + rng.next() * 0.3;
    const h = 0.45 + rng.next() * 0.4;
    rect(ctx, x, y - h, w, h, c);
  }
}

/** Silhueta genérica de criança (sem rosto). */
export function kid(ctx: Ctx, x: number, y: number, h: number, color: string, legPhase: number): void {
  const s = h / 1.3;
  circle(ctx, x, y + s * 1.15, s * 0.14, color);
  rect(ctx, x - s * 0.14, y + s * 0.55, s * 0.28, s * 0.48, color);
  const lp = Math.sin(legPhase) * s * 0.18;
  line(ctx, x - s * 0.06, y + s * 0.56, x - s * 0.08 - lp, y, s * 0.11, color);
  line(ctx, x + s * 0.06, y + s * 0.56, x + s * 0.08 + lp, y, s * 0.11, color);
  line(ctx, x - s * 0.12, y + s * 0.98, x - s * 0.32, y + s * 0.65 + lp * 0.5, s * 0.08, color);
  line(ctx, x + s * 0.12, y + s * 0.98, x + s * 0.32, y + s * 0.65 - lp * 0.5, s * 0.08, color);
}

/** Céu decorativo: uma "pipa de fundo" simples. */
export function tinyKite(ctx: Ctx, x: number, y: number, s: number, a: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  poly(ctx, [0, s, s * 0.7, s * 0.2, 0, -s, -s * 0.7, s * 0.2], color);
  line(ctx, 0, -s, -s * 0.3, -s * 2.6, s * 0.1, 'rgba(255,255,255,0.5)');
  ctx.restore();
}

/** Grafite abstrato num muro: manchas e traços coloridos. */
export function graffiti(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, rng: Rng): void {
  const cols = ['#ff3d7f', '#00d1ff', '#ffe600', '#7dff5a', '#ff7a00', '#b45cff'];
  for (let x = x0; x < x1; x += 2 + rng.next() * 3) {
    const c = cols[Math.floor(rng.next() * cols.length)];
    const w = 1.5 + rng.next() * 3;
    const h = (y1 - y0) * (0.4 + rng.next() * 0.5);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y0 + (y1 - y0) / 2, w / 2, h / 2, rng.range(-0.4, 0.4), 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = '#1b1b2a';
    ctx.stroke();
    const c2 = cols[Math.floor(rng.next() * cols.length)];
    ctx.beginPath();
    ctx.moveTo(x, y0 + h * 0.4);
    ctx.bezierCurveTo(x + w * 0.3, y1, x + w * 0.6, y0, x + w, y0 + h * 0.8);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = c2;
    ctx.stroke();
  }
}

/** Faixa de chão até bem abaixo (para nunca aparecer buraco com a paralaxe). */
export function groundFill(ctx: Ctx, x0: number, x1: number, top: number, color: string, depth = 400): void {
  rect(ctx, x0, top - depth, x1 - x0, depth, color);
}
