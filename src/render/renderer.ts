import { TENSION, type KiteModel } from '../config';
import type { Camera } from '../game/camera';
import type { Flyer } from '../physics/flyer';
import type { Hazard } from '../physics/hazards';
import type { SceneArt, SceneLayer } from '../scenes/types';
import { PALETTE_FX, PKind, type Particles, type Popups } from './effects';
import { drawKiteShape, shade } from './kiteArt';

interface Chunk {
  canvas: HTMLCanvasElement;
  x0: number;
  x1: number;
}

interface LayerCache {
  layer: SceneLayer;
  chunks: Chunk[];
}

/** Estado anterior para interpolação (preenchido pelo jogo antes de cada passo fixo). */
export interface FlyerSnapshot {
  kx: number;
  ky: number;
  ka: number;
  hx: number;
  hy: number;
  lx: Float32Array;
  ly: Float32Array;
}

export function createSnapshot(n: number): FlyerSnapshot {
  return { kx: 0, ky: 0, ka: 0, hx: 0, hy: 0, lx: new Float32Array(n), ly: new Float32Array(n) };
}

export function takeSnapshot(s: FlyerSnapshot, f: Flyer): void {
  s.kx = f.kite.x;
  s.ky = f.kite.y;
  s.ka = f.kite.angle;
  s.hx = f.handX;
  s.hy = f.handY;
  s.lx.set(f.line.px);
  s.ly.set(f.line.py);
}

const TAIL_N = 16;

interface TailSim {
  x: Float32Array;
  y: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  ready: boolean;
}

function createTail(): TailSim {
  return {
    x: new Float32Array(TAIL_N),
    y: new Float32Array(TAIL_N),
    ox: new Float32Array(TAIL_N),
    oy: new Float32Array(TAIL_N),
    ready: false,
  };
}

const CHUNK_PX = 2048;
const DASH = [4, 4];
const NO_DASH: number[] = [];

const POP_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const fontCache = new Map<number, string>();
/** fonte em cache por peso/tamanho (evita criar strings a cada quadro) */
function font(weight: number, size: number): string {
  const key = weight * 1000 + Math.round(size);
  let f = fontCache.get(key);
  if (!f) {
    f = weight + ' ' + Math.round(size) + 'px ' + POP_FONT;
    fontCache.set(key, f);
  }
  return f;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0;
  h = 0;
  debug = false;
  private layers: LayerCache[] = [];
  private art: SceneArt | null = null;
  private sky: HTMLCanvasElement | null = null;
  private skyKey = '';
  private cloud: HTMLCanvasElement | null = null;
  private sunGlow: HTMLCanvasElement | null = null;
  private tails: TailSim[] = [];
  /** posições interpoladas desta renderização (px de mundo) por pipa */
  readonly ix = new Float32Array(8);
  readonly iy = new Float32Array(8);
  readonly ia = new Float32Array(8);
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    for (let i = 0; i < 8; i++) this.tails.push(createTail());
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.skyKey = '';
  }

  /** Pré-renderiza as camadas do cenário em pedaços (feito uma vez por cenário). */
  setScene(art: SceneArt): void {
    this.art = art;
    this.layers = [];
    this.skyKey = '';
    for (const layer of [...art.layers].sort((a, b) => a.factor - b.factor)) {
      const chunks: Chunk[] = [];
      const totalPx = (layer.x1 - layer.x0) * layer.density;
      const n = Math.max(1, Math.ceil(totalPx / CHUNK_PX));
      const cw = (layer.x1 - layer.x0) / n;
      const hpx = Math.max(1, Math.ceil((layer.y1 - layer.y0) * layer.density));
      for (let i = 0; i < n; i++) {
        const x0 = layer.x0 + i * cw;
        const x1 = x0 + cw;
        const c = document.createElement('canvas');
        c.width = Math.ceil(cw * layer.density);
        c.height = hpx;
        const g = c.getContext('2d');
        if (!g) continue;
        g.setTransform(layer.density, 0, 0, -layer.density, -x0 * layer.density, layer.y1 * layer.density);
        layer.draw(g);
        chunks.push({ canvas: c, x0, x1 });
      }
      this.layers.push({ layer, chunks });
    }
    // nuvem
    const cc = document.createElement('canvas');
    cc.width = 256;
    cc.height = 110;
    const g = cc.getContext('2d');
    if (g) {
      const blobs = [
        [70, 70, 42],
        [120, 52, 50],
        [175, 68, 40],
        [210, 80, 28],
        [40, 85, 26],
      ];
      for (const b of blobs) {
        const grd = g.createRadialGradient(b[0], b[1], 2, b[0], b[1], b[2]);
        grd.addColorStop(0, 'rgba(255,240,225,0.95)');
        grd.addColorStop(0.7, 'rgba(255,220,200,0.6)');
        grd.addColorStop(1, 'rgba(255,210,190,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(b[0], b[1], b[2], 0, Math.PI * 2);
        g.fill();
      }
    }
    this.cloud = cc;
    const sgc = document.createElement('canvas');
    sgc.width = sgc.height = 256;
    const sgx = sgc.getContext('2d');
    if (sgx) {
      const sg = sgx.createRadialGradient(128, 128, 8, 128, 128, 128);
      sg.addColorStop(0, 'rgba(255,240,180,0.95)');
      sg.addColorStop(0.25, 'rgba(255,200,120,0.45)');
      sg.addColorStop(1, 'rgba(255,170,90,0)');
      sgx.fillStyle = sg;
      sgx.fillRect(0, 0, 256, 256);
    }
    this.sunGlow = sgc;
    for (const t of this.tails) t.ready = false;
  }

  resetTails(): void {
    for (const t of this.tails) t.ready = false;
  }

  private ensureSky(): void {
    const art = this.art;
    if (!art) return;
    const key = this.w + 'x' + this.h;
    if (key === this.skyKey && this.sky) return;
    const c = this.sky ?? document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w * this.dpr * 0.5));
    c.height = Math.max(1, Math.round(this.h * this.dpr * 0.5));
    const g = c.getContext('2d');
    if (!g) return;
    const grd = g.createLinearGradient(0, 0, 0, c.height);
    const n = art.sky.length;
    for (let i = 0; i < n; i++) grd.addColorStop(i / (n - 1), art.sky[i]);
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    this.sky = c;
    this.skyKey = key;
  }

  /** Linha do "chão" de uma camada de paralaxe na tela. */
  private layerBase(cam: Camera, f: number): number {
    const gS = cam.toScreenY(0);
    const h0 = this.h * 0.8;
    return h0 + (gS - h0) * f;
  }

  render(
    cam: Camera,
    flyers: Flyer[],
    snaps: FlyerSnapshot[],
    alpha: number,
    fx: Particles,
    popups: Popups,
    hazards: Hazard[],
    realDt: number,
    hudFlash: number,
  ): void {
    const ctx = this.ctx;
    const art = this.art;
    if (!art) return;
    this.time += realDt;
    const dpr = this.dpr;
    const W = this.w;
    const H = this.h;
    this.ensureSky();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.sky) ctx.drawImage(this.sky, 0, 0, W * dpr, H * dpr);

    // sol
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const baseFar = this.layerBase(cam, 0.05);
    const sunX = W * art.sun.x - cam.x * 0.02 * cam.layerScale(0.05);
    const sunY = baseFar - H * art.sun.y;
    const sr = art.sun.r * Math.min(W, H);
    if (this.sunGlow) ctx.drawImage(this.sunGlow, sunX - sr * 3.2, sunY - sr * 3.2, sr * 6.4, sr * 6.4);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sr, 0, Math.PI * 2);
    ctx.fillStyle = art.sun.color;
    ctx.fill();

    // nuvens
    if (this.cloud) {
      for (let i = 0; i < 6; i++) {
        const sp = 0.6 + (i % 3) * 0.35;
        const cw = (160 + (i % 3) * 70) * (W / 420);
        let x = ((i * 0.37 + this.time * 0.004 * sp) % 1.3) * (W + cw * 2) - cw - cam.x * 0.4;
        x = ((x % (W + cw * 2)) + (W + cw * 2)) % (W + cw * 2) - cw;
        const y = baseFar - H * (0.32 + (i % 4) * 0.12) + (i % 2) * 20;
        ctx.globalAlpha = 0.55 + (i % 3) * 0.12;
        ctx.drawImage(this.cloud, x, y, cw, cw * 0.43);
      }
      ctx.globalAlpha = 1;
    }

    // camadas
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      const f = L.layer.factor;
      const S = cam.layerScale(f) * (L.layer.scale ?? 1);
      const base = this.layerBase(cam, f);
      const camX = cam.x * f;
      const top = base - L.layer.y1 * S;
      const hpx = (L.layer.y1 - L.layer.y0) * S;
      const sxOff = f >= 0.99 ? cam.sx : cam.sx * f;
      for (let ci = 0; ci < L.chunks.length; ci++) {
        const c = L.chunks[ci];
        const left = W / 2 + (c.x0 - camX) * S + sxOff;
        const wpx = (c.x1 - c.x0) * S;
        if (left > W || left + wpx < 0) continue;
        ctx.drawImage(c.canvas, left, top + (f >= 0.99 ? cam.sy : 0), wpx + 0.5, hpx);
      }
      // pipas de fundo entre a camada distante e a do meio
      if (li === 0 && art.bgKites) this.drawBgKites(art.bgKites, base, S, camX);
    }

    // mundo
    const S = cam.scale;
    const ox = (W / 2 - cam.x * S + cam.sx) * dpr;
    const oy = (H / 2 + cam.y * S + cam.sy) * dpr;
    ctx.setTransform(S * dpr, 0, 0, -S * dpr, ox, oy);
    const vx0 = cam.toWorldX(-40);
    const vx1 = cam.toWorldX(W + 40);
    art.drawNear(ctx, vx0, vx1, this.time, S);

    // quem solta (silhuetas genéricas)
    for (let i = 0; i < flyers.length; i++) this.drawPerson(flyers[i], snaps[i], alpha);
    // linhas
    const px = 1 / S;
    for (let i = 0; i < flyers.length; i++) this.drawLine(flyers[i], snaps[i], alpha, px);
    // pipas
    for (let i = 0; i < flyers.length; i++) this.drawKite(i, flyers[i], snaps[i], alpha, S, realDt);

    // partículas
    this.drawParticles(fx, px);

    if (this.debug) this.drawDebug(flyers, hazards, px);

    // textos no mundo
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawPopups(popups, cam, false);
    if (hudFlash > 0) {
      ctx.globalAlpha = Math.min(0.6, hudFlash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  private drawBgKites(n: number, base: number, S: number, camX: number): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const lx = -120 + i * 47 + Math.sin(this.time * 0.3 + i) * 3;
      const ly = 28 + (i % 3) * 9 + Math.sin(this.time * 0.7 + i * 2) * 1.5;
      const sx = this.w / 2 + (lx - camX) * S;
      const sy = base - ly * S;
      if (sx < -30 || sx > this.w + 30) continue;
      const a = Math.sin(this.time * 1.3 + i) * 0.35;
      const s = Math.max(3, S * 0.55);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, -s * 0.2);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.7, -s * 0.2);
      ctx.closePath();
      ctx.fillStyle = PALETTE_FX[i % PALETTE_FX.length];
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - S * 6 - i * 3, sy + S * 30);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawPerson(f: Flyer, snap: FlyerSnapshot, a: number): void {
    const ctx = this.ctx;
    const hx = snap.hx * (1 - a) + f.handX * a;
    const hy = snap.hy * (1 - a) + f.handY * a;
    const x = f.baseX - 0.12;
    const y = f.baseY - 1.35;
    const col = f.isPlayer ? '#22163a' : '#3a2a4a';
    // pernas
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.13;
    ctx.beginPath();
    ctx.moveTo(x - 0.1, y);
    ctx.lineTo(x - 0.05, y + 0.62);
    ctx.moveTo(x + 0.12, y);
    ctx.lineTo(x + 0.05, y + 0.62);
    ctx.stroke();
    // tronco e cabeça
    ctx.fillStyle = f.isPlayer ? f.look.color : col;
    ctx.fillRect(x - 0.15, y + 0.6, 0.3, 0.5);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y + 1.26, 0.13, 0, Math.PI * 2);
    ctx.fill();
    // boné
    ctx.fillStyle = f.isPlayer ? f.look.tail : '#555';
    ctx.fillRect(x - 0.14, y + 1.32, 0.28, 0.07);
    ctx.fillRect(x, y + 1.32, 0.22, 0.04);
    // braços até a mão (que segura a linha) e o carretel na outra
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(x + 0.1, y + 1.02);
    ctx.lineTo(hx, hy);
    ctx.moveTo(x - 0.1, y + 1.02);
    ctx.lineTo(x - 0.3, y + 0.82);
    ctx.stroke();
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.arc(x - 0.32, y + 0.8, 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLine(f: Flyer, snap: FlyerSnapshot, a: number, px: number): void {
    const ctx = this.ctx;
    const l = f.line;
    const n = l.n;
    const cut = l.cutIndex;
    const b = 1 - a;
    // brilho de dano
    let anyGlow = false;
    for (let i = 0; i < n; i++)
      if (l.glow[i] > 0.02) {
        anyGlow = true;
        break;
      }
    if (anyGlow) {
      ctx.lineCap = 'round';
      for (let i = 0; i < n - 1; i++) {
        const gl = Math.max(l.glow[i], l.glow[i + 1]);
        if (gl < 0.02 || i === cut) continue;
        const x0 = snap.lx[i] * b + l.px[i] * a;
        const y0 = snap.ly[i] * b + l.py[i] * a;
        const x1 = snap.lx[i + 1] * b + l.px[i + 1] * a;
        const y1 = snap.ly[i + 1] * b + l.py[i + 1] * a;
        ctx.strokeStyle = gl > 0.6 ? 'rgba(255,60,40,0.55)' : 'rgba(255,190,60,0.45)';
        ctx.lineWidth = px * (2 + gl * 7 + Math.sin(this.time * 30) * gl * 1.5);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = f.isPlayer ? f.lineType.color : 'rgba(255,250,240,0.85)';
    ctx.lineWidth = px * (f.isPlayer ? 1.6 : 1.25);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const x = snap.lx[i] * b + l.px[i] * a;
      const y = snap.ly[i] * b + l.py[i] * a;
      if (!pen) {
        ctx.moveTo(x, y);
        pen = true;
      } else ctx.lineTo(x, y);
      if (i === cut) pen = false;
    }
    ctx.stroke();
  }

  private drawKite(i: number, f: Flyer, snap: FlyerSnapshot, a: number, S: number, dt: number): void {
    const ctx = this.ctx;
    const k = f.kite;
    const b = 1 - a;
    const x = snap.kx * b + k.x * a;
    const y = snap.ky * b + k.y * a;
    let da = k.angle - snap.ka;
    if (da > Math.PI) da -= Math.PI * 2;
    else if (da < -Math.PI) da += Math.PI * 2;
    const ang = snap.ka + da * a;
    this.ix[i] = x;
    this.iy[i] = y;
    this.ia[i] = ang;
    // tamanho visual: tamanho real, mas nunca menor que ~14 px
    const halfPx = Math.min(48, Math.max(17, 0.42 * S));
    const half = halfPx / S;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    // rabiola
    const tail = this.tails[i];
    const ax = x - nx * half * 0.95;
    const ay = y - ny * half * 0.95;
    const seg = half * 0.55;
    if (!tail.ready) {
      for (let j = 0; j < TAIL_N; j++) {
        tail.x[j] = tail.ox[j] = ax;
        tail.y[j] = tail.oy[j] = ay - j * seg;
      }
      tail.ready = true;
    }
    const sdt = Math.min(dt, 1 / 30);
    const gx = f.windX * 0.12 * half;
    const gy = -9.8 * 0.18 * half;
    for (let j = 1; j < TAIL_N; j++) {
      const vx = (tail.x[j] - tail.ox[j]) * 0.92;
      const vy = (tail.y[j] - tail.oy[j]) * 0.92;
      tail.ox[j] = tail.x[j];
      tail.oy[j] = tail.y[j];
      tail.x[j] += vx + gx * sdt * sdt * 60;
      tail.y[j] += vy + gy * sdt * sdt * 60;
    }
    tail.x[0] = tail.ox[0] = ax;
    tail.y[0] = tail.oy[0] = ay;
    for (let it = 0; it < 2; it++)
      for (let j = 1; j < TAIL_N; j++) {
        const dx = tail.x[j] - tail.x[j - 1];
        const dy = tail.y[j] - tail.y[j - 1];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const k2 = seg / d;
        tail.x[j] = tail.x[j - 1] + dx * k2;
        tail.y[j] = tail.y[j - 1] + dy * k2;
      }
    const tailColor = f.look.tail;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1 / S;
    ctx.beginPath();
    ctx.moveTo(tail.x[0], tail.y[0]);
    for (let j = 1; j < TAIL_N; j++) ctx.lineTo(tail.x[j], tail.y[j]);
    ctx.stroke();
    const bw = half * 0.32;
    for (let j = 2; j < TAIL_N; j += 2) {
      const dx = tail.x[j] - tail.x[j - 1];
      const dy = tail.y[j] - tail.y[j - 1];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const px2 = (-dy / d) * bw;
      const py2 = (dx / d) * bw;
      const cx = tail.x[j];
      const cy = tail.y[j];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + px2 + dx * 0.25, cy + py2 + dy * 0.25);
      ctx.lineTo(cx + px2 - dx * 0.25, cy + py2 - dy * 0.25);
      ctx.closePath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - px2 + dx * 0.25, cy - py2 + dy * 0.25);
      ctx.lineTo(cx - px2 - dx * 0.25, cy - py2 - dy * 0.25);
      ctx.closePath();
      ctx.fillStyle = (j & 2) === 0 ? tailColor : shade(tailColor, 0.45);
      ctx.fill();
    }

    // corpo
    ctx.save();
    ctx.translate(x, y);
    // mundo y-up → desenho com y para baixo, bico para cima
    ctx.rotate(ang - Math.PI / 2);
    ctx.scale(1 / S, -1 / S);
    const burnt = f.status === 'burned' ? Math.min(1, f.statusTimer * 2) : 0;
    if (f.status === 'torn') ctx.globalAlpha = 0.85;
    drawKiteShape(ctx, f.look.model as KiteModel, halfPx, f.look.color, f.look.tail === f.look.color ? '#ffffff' : f.look.tail, burnt);
    ctx.globalAlpha = 1;
    if (f.status === 'snagged') {
      ctx.strokeStyle = '#ffd400';
      ctx.lineWidth = 2;
      ctx.setLineDash(DASH);
      ctx.beginPath();
      ctx.arc(0, 0, halfPx * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f.freeProgress / 3));
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
    ctx.restore();
    // indicador de tensão vermelha (pisca)
    if (f.isPlayer && f.tension01 > TENSION.red && Math.sin(this.time * 40) > 0) {
      ctx.strokeStyle = 'rgba(255,40,40,0.9)';
      ctx.lineWidth = 2 / S;
      ctx.beginPath();
      ctx.arc(x, y, half * 1.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawParticles(fx: Particles, px: number): void {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    for (let i = 0; i < fx.life.length; i++) {
      const life = fx.life[i];
      if (life <= 0) continue;
      const t = life / fx.max[i];
      const k = fx.kind[i];
      const x = fx.x[i];
      const y = fx.y[i];
      if (k === PKind.Spark || k === PKind.Zap) {
        ctx.strokeStyle = k === PKind.Zap ? '#9ff3ff' : PALETTE_FX[fx.color[i] % 3];
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.lineWidth = px * (k === PKind.Zap ? 2.2 : 1.8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - fx.vx[i] * 0.035, y - fx.vy[i] * 0.035);
        ctx.stroke();
      } else if (k === PKind.Smoke) {
        ctx.globalAlpha = t * 0.45;
        ctx.fillStyle = '#3b3530';
        ctx.beginPath();
        ctx.arc(x, y, px * (4 + (1 - t) * 14), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = PALETTE_FX[fx.color[i] % PALETTE_FX.length];
        const s = px * (k === PKind.Shred ? 5 : 4);
        ctx.fillRect(x - s / 2, y - s / 2, s, s * (0.5 + 0.5 * Math.sin(life * 12 + i)));
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPopups(popups: Popups, cam: Camera, screenOnly: boolean): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let pi = 0; pi < popups.items.length; pi++) {
      const p = popups.items[pi];
      if (p.life <= 0 || p.screen !== screenOnly) continue;
      const t = 1 - p.life / p.max;
      let x = p.x;
      let y = p.y;
      if (!p.screen) {
        x = cam.toScreenX(p.x);
        y = cam.toScreenY(p.y) - 30 - t * 30;
      }
      const pop = t < 0.15 ? 0.4 + (t / 0.15) * 0.8 : t < 0.25 ? 1.2 - ((t - 0.15) / 0.1) * 0.2 : 1;
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.globalAlpha = fade;
      const size = p.size * pop;
      ctx.font = font(900, size);
      if (p.kind === 'balloon') {
        const w = ctx.measureText(p.text).width + 22;
        const h = size + 14;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, 12);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 6, y + h / 2 - 1);
        ctx.lineTo(x + 2, y + h / 2 + 10);
        ctx.lineTo(x + 8, y + h / 2 - 1);
        ctx.fill();
        ctx.fillStyle = '#1b1b2a';
        ctx.fillText(p.text, x, y + 1);
      } else {
        const wob = p.kind === 'pop' ? Math.sin(t * 18) * 0.06 * (1 - t) : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(wob);
        ctx.lineWidth = Math.max(4, size * 0.16);
        ctx.strokeStyle = 'rgba(30,10,40,0.85)';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        if (p.sub) {
          ctx.font = font(800, size * 0.45);
          ctx.lineWidth = 4;
          ctx.strokeText(p.sub, 0, size * 0.75);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(p.sub, 0, size * 0.75);
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawDebug(flyers: Flyer[], hazards: Hazard[], px: number): void {
    const ctx = this.ctx;
    ctx.lineWidth = px * 1.5;
    for (const h of hazards) {
      ctx.strokeStyle = h.kind === 'wire' ? '#00ffff' : '#ff00ff';
      ctx.beginPath();
      if (h.shape === 'rect') ctx.rect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0);
      else if (h.shape === 'circle') ctx.arc(h.pts[0], h.pts[1], h.r, 0, Math.PI * 2);
      else {
        ctx.moveTo(h.pts[0], h.pts[1]);
        for (let i = 2; i < h.pts.length; i += 2) ctx.lineTo(h.pts[i], h.pts[i + 1]);
      }
      ctx.stroke();
    }
    for (const f of flyers) {
      ctx.strokeStyle = '#00ff66';
      ctx.beginPath();
      ctx.arc(f.kite.x, f.kite.y, f.params.radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < f.line.n; i += 3) {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(f.line.px[i] - px * 1.5, f.line.py[i] - px * 1.5, px * 3, px * 3);
      }
    }
  }
}
