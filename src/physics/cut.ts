import { CUT } from '../config';
import { isAlive, severLine, type Flyer, type WorldEventType } from './flyer';

/**
 * Corte de linha. A cada subpasso testa a interseção (no plano da tela) entre
 * os segmentos das linhas. Em cada cruzamento:
 *
 *   dano = afiação do outro × S(deslizamento) × carga × concentração × dt / resistência × k
 *
 * - deslizamento: velocidade relativa entre os "materiais" das duas linhas no
 *   cruzamento, incluindo a linha que sai do carretel (soltar enquanto cruza corta mais).
 * - carga: √(menor tensão das duas) — linha frouxa não corta.
 * - concentração: quem faz a própria linha correr pelo cruzamento espalha o
 *   desgaste (0,7) e concentra no outro (1,3). Com as duas paradas = 1.
 * O dano é acumulado por cruzamento; passou de 1, a linha rompe naquele nó.
 */

export interface Crossing {
  active: boolean;
  a: number;
  b: number;
  x: number;
  y: number;
  segA: number;
  segB: number;
  tA: number;
  tB: number;
  dmgA: number;
  dmgB: number;
  /** tempo sem contato (s) */
  idle: number;
  /** encontrado neste passo */
  seen: boolean;
  /** velocidade de deslizamento atual (m/s) e taxas de dano (1/s) — para debug/efeitos */
  slide: number;
  rateA: number;
  rateB: number;
  sparkTimer: number;
  /** tempo total de deslizamento ativo */
  activeTime: number;
}

function newCrossing(): Crossing {
  return {
    active: false,
    a: 0,
    b: 0,
    x: 0,
    y: 0,
    segA: 0,
    segB: 0,
    tA: 0,
    tB: 0,
    dmgA: 0,
    dmgB: 0,
    idle: 0,
    seen: false,
    slide: 0,
    rateA: 0,
    rateB: 0,
    sparkTimer: 0,
    activeTime: 0,
  };
}

/** S(v): deslizamento efetivo (satura em velocidades altas). */
export function slideFactor(v: number): number {
  return CUT.sMax * Math.tanh(v / CUT.sScale);
}

/** Concentração do desgaste numa linha a partir das velocidades de passagem pelo cruzamento. */
export function concentration(feedSelf: number, feedOther: number): number {
  const share = (feedSelf + 0.15) / (feedSelf + feedOther + 0.3);
  // share 0 → concMax; 0.5 → 1; 1 → concMin (aprox.)
  const mid = (CUT.concMin + CUT.concMax) / 2;
  const c = mid + (CUT.concMax - mid) * (1 - 2 * share);
  return c < CUT.concMin ? CUT.concMin : c > CUT.concMax ? CUT.concMax : c;
}

/** Taxa de dano (por segundo) numa linha. Pura. */
export function damageRate(
  sharpnessOther: number,
  slideSpeed: number,
  tensionSelf01: number,
  tensionOther01: number,
  resistanceSelf: number,
  conc: number,
): number {
  const minT = Math.min(tensionSelf01, tensionOther01);
  const load = minT > 0 ? Math.sqrt(minT > 1 ? 1 : minT) : 0;
  return (CUT.k * sharpnessOther * slideFactor(slideSpeed) * load * conc) / resistanceSelf;
}

export interface SegHit {
  t: number;
  u: number;
  x: number;
  y: number;
}

/** Interseção de segmentos 2D (p0→p1) × (q0→q1). Escreve em `out` e retorna true se cruzam. */
export function segmentIntersect(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  q0x: number,
  q0y: number,
  q1x: number,
  q1y: number,
  out: SegHit,
): boolean {
  const rx = p1x - p0x;
  const ry = p1y - p0y;
  const sx = q1x - q0x;
  const sy = q1y - q0y;
  const den = rx * sy - ry * sx;
  if (den > -1e-9 && den < 1e-9) return false;
  const qpx = q0x - p0x;
  const qpy = q0y - p0y;
  const t = (qpx * sy - qpy * sx) / den;
  if (t < 0 || t > 1) return false;
  const u = (qpx * ry - qpy * rx) / den;
  if (u < 0 || u > 1) return false;
  out.t = t;
  out.u = u;
  out.x = p0x + rx * t;
  out.y = p0y + ry * t;
  return true;
}

const hit: SegHit = { t: 0, u: 0, x: 0, y: 0 };

export type CutEmit = (type: WorldEventType, flyer: number, x: number, y: number, value: number, other: number) => void;

export class CutSystem {
  readonly crossings: Crossing[] = [];
  /** carga mínima (modo Batalha: linha meio frouxa ainda corta, para ser fácil de jogar) */
  minLoad = 0;
  /** multiplica todo o dano (modo Batalha: cortes mais rápidos, partidas curtas) */
  kMul = 1;
  /** pares (índices) que podem se cortar */
  pairs: number[] = [];
  /** cortes realizados por flyer (quem cortou) */
  cutsBy: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private bbox = new Float32Array(32);

  constructor(max = 32) {
    for (let i = 0; i < max; i++) this.crossings.push(newCrossing());
  }

  reset(): void {
    for (const c of this.crossings) c.active = false;
    for (let i = 0; i < this.cutsBy.length; i++) this.cutsBy[i] = 0;
  }

  /** Define os pares que podem se cortar (ex.: jogador × cada adversário). */
  setPairs(pairs: number[]): void {
    this.pairs = pairs;
  }

  private computeBox(f: Flyer, slot: number): void {
    const l = f.line;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < l.n; i++) {
      const x = l.px[i];
      const y = l.py[i];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const b = this.bbox;
    b[slot * 4] = x0;
    b[slot * 4 + 1] = y0;
    b[slot * 4 + 2] = x1;
    b[slot * 4 + 3] = y1;
  }

  step(flyers: Flyer[], dt: number, emit: CutEmit): void {
    const cs = this.crossings;
    for (let i = 0; i < cs.length; i++) cs[i].seen = false;
    for (let i = 0; i < flyers.length && i < 8; i++) this.computeBox(flyers[i], i);

    for (let p = 0; p + 1 < this.pairs.length; p += 2) {
      const ia = this.pairs[p];
      const ib = this.pairs[p + 1];
      const A = flyers[ia];
      const B = flyers[ib];
      if (!A || !B || !isAlive(A) || !isAlive(B) || A.line.cutIndex >= 0 || B.line.cutIndex >= 0) continue;
      const bb = this.bbox;
      if (bb[ia * 4 + 2] < bb[ib * 4] || bb[ib * 4 + 2] < bb[ia * 4] || bb[ia * 4 + 3] < bb[ib * 4 + 1] || bb[ib * 4 + 3] < bb[ia * 4 + 1])
        continue;
      const la = A.line;
      const lb = B.line;
      for (let i = 0; i < la.n - 1; i++) {
        const ax0 = la.px[i];
        const ay0 = la.py[i];
        const ax1 = la.px[i + 1];
        const ay1 = la.py[i + 1];
        const sx0 = ax0 < ax1 ? ax0 : ax1;
        const sx1 = ax0 < ax1 ? ax1 : ax0;
        const sy0 = ay0 < ay1 ? ay0 : ay1;
        const sy1 = ay0 < ay1 ? ay1 : ay0;
        if (sx1 < bb[ib * 4] || sx0 > bb[ib * 4 + 2] || sy1 < bb[ib * 4 + 1] || sy0 > bb[ib * 4 + 3]) continue;
        for (let j = 0; j < lb.n - 1; j++) {
          const bx0 = lb.px[j];
          const by0 = lb.py[j];
          const bx1 = lb.px[j + 1];
          const by1 = lb.py[j + 1];
          if ((bx0 < sx0 && bx1 < sx0) || (bx0 > sx1 && bx1 > sx1) || (by0 < sy0 && by1 < sy0) || (by0 > sy1 && by1 > sy1)) continue;
          if (!segmentIntersect(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, hit)) continue;
          this.contact(A, B, ia, ib, i, j, hit, dt, emit);
        }
      }
    }

    // cruzamentos sem contato: esfriam e somem
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.active || c.seen) continue;
      c.idle += dt;
      c.slide = 0;
      c.rateA = c.rateB = 0;
      if (c.idle > CUT.forgetDelay) {
        c.dmgA = Math.max(0, c.dmgA - CUT.decayRate * dt);
        c.dmgB = Math.max(0, c.dmgB - CUT.decayRate * dt);
        if (c.dmgA <= 0 && c.dmgB <= 0) c.active = false;
      }
      const fa = flyers[c.a];
      const fb = flyers[c.b];
      if ((fa && !isAlive(fa)) || (fb && !isAlive(fb))) c.active = false;
    }

    // dano exibido por pipa + brilho
    for (let i = 0; i < flyers.length; i++) {
      const f = flyers[i];
      f.damage = 0;
      const g = f.line.glow;
      const decay = Math.exp(-dt * 1.2);
      for (let k = 0; k < g.length; k++) g[k] *= decay;
    }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.active) continue;
      const fa = flyers[c.a];
      const fb = flyers[c.b];
      if (c.dmgA > fa.damage) fa.damage = c.dmgA;
      if (c.dmgB > fb.damage) fb.damage = c.dmgB;
      glowAround(fa, c.segA, c.dmgA);
      glowAround(fb, c.segB, c.dmgB);
    }
  }

  private contact(A: Flyer, B: Flyer, ia: number, ib: number, i: number, j: number, h: SegHit, dt: number, emit: CutEmit): void {
    // casa com um cruzamento existente do mesmo par
    let c: Crossing | null = null;
    let best = CUT.matchDistance * CUT.matchDistance;
    let count = 0;
    let free: Crossing | null = null;
    for (let ci = 0; ci < this.crossings.length; ci++) {
      const k = this.crossings[ci];
      if (!k.active) {
        if (!free) free = k;
        continue;
      }
      if (k.a !== ia || k.b !== ib) continue;
      count++;
      if (k.seen) continue;
      const d = (k.x - h.x) * (k.x - h.x) + (k.y - h.y) * (k.y - h.y);
      if (d < best) {
        best = d;
        c = k;
      }
    }
    let px = h.x;
    let py = h.y;
    if (!c) {
      if (!free || count >= CUT.maxCrossingsPerPair) return;
      c = free;
      c.active = true;
      c.a = ia;
      c.b = ib;
      c.dmgA = 0;
      c.dmgB = 0;
      c.activeTime = 0;
      c.sparkTimer = 0;
    } else {
      px = c.x;
      py = c.y;
    }
    c.seen = true;
    c.idle = 0;
    c.x = h.x;
    c.y = h.y;
    c.segA = i;
    c.segB = j;
    c.tA = h.t;
    c.tB = h.u;

    const la = A.line;
    const lb = B.line;
    const inv = 1 / dt;
    // velocidade do nó (Verlet) interpolada no ponto do cruzamento
    const vax = ((la.px[i] - la.ox[i]) * (1 - h.t) + (la.px[i + 1] - la.ox[i + 1]) * h.t) * inv;
    const vay = ((la.py[i] - la.oy[i]) * (1 - h.t) + (la.py[i + 1] - la.oy[i + 1]) * h.t) * inv;
    const vbx = ((lb.px[j] - lb.ox[j]) * (1 - h.u) + (lb.px[j + 1] - lb.ox[j + 1]) * h.u) * inv;
    const vby = ((lb.py[j] - lb.oy[j]) * (1 - h.u) + (lb.py[j + 1] - lb.oy[j + 1]) * h.u) * inv;
    // direções das linhas (mão → pipa)
    let dax = la.px[i + 1] - la.px[i];
    let day = la.py[i + 1] - la.py[i];
    let dl = Math.sqrt(dax * dax + day * day) || 1;
    dax /= dl;
    day /= dl;
    let dbx = lb.px[j + 1] - lb.px[j];
    let dby = lb.py[j + 1] - lb.py[j];
    dl = Math.sqrt(dbx * dbx + dby * dby) || 1;
    dbx /= dl;
    dby /= dl;
    // material que sai do carretel corre ao longo da linha
    const sA = (i + h.t) / (la.n - 1);
    const sB = (j + h.u) / (lb.n - 1);
    const reelA = A.reel.rate * (1 - sA);
    const reelB = B.reel.rate * (1 - sB);
    const mAx = vax + dax * reelA;
    const mAy = vay + day * reelA;
    const mBx = vbx + dbx * reelB;
    const mBy = vby + dby * reelB;
    const rx = mAx - mBx;
    const ry = mAy - mBy;
    let slide = Math.sqrt(rx * rx + ry * ry);
    if (slide > 40) slide = 40;
    // passagem de material de cada linha pelo ponto de contato
    const vcx = (h.x - px) * inv;
    const vcy = (h.y - py) * inv;
    const feedA = Math.abs((mAx - vcx) * dax + (mAy - vcy) * day);
    const feedB = Math.abs((mBx - vcx) * dbx + (mBy - vcy) * dby);
    const concA = concentration(feedA, feedB);
    const concB = concentration(feedB, feedA);
    const ml = this.minLoad;
    const tA = A.tension01 > ml ? A.tension01 : ml;
    const tB = B.tension01 > ml ? B.tension01 : ml;
    const rateA = damageRate(B.lineType.sharpness * B.sharpMul, slide, tA, tB, A.lineType.resistance, concA) * A.damageTaken * this.kMul;
    const rateB = damageRate(A.lineType.sharpness * A.sharpMul, slide, tB, tA, B.lineType.resistance, concB) * B.damageTaken * this.kMul;
    c.slide = slide;
    c.rateA = rateA;
    c.rateB = rateB;
    c.dmgA += rateA * dt;
    c.dmgB += rateB * dt;
    if (rateA + rateB > 0.05) c.activeTime += dt;

    // faíscas
    c.sparkTimer -= dt * (rateA + rateB) * 18;
    if (c.sparkTimer <= 0) {
      c.sparkTimer = 1;
      emit('spark', ia, h.x, h.y, Math.min(1, (rateA + rateB) * 0.8), ib);
    }

    if (c.dmgA >= 1 || c.dmgB >= 1) {
      const loserIsA = c.dmgA - 1 >= c.dmgB - 1;
      const L = loserIsA ? A : B;
      const W = loserIsA ? B : A;
      const seg = loserIsA ? i : j;
      severLine(L, seg, 'cut');
      this.cutsBy[W.index] = (this.cutsBy[W.index] ?? 0) + 1;
      emit('cut', L.index, h.x, h.y, 1, W.index);
      c.active = false;
    }
  }

  /** Esquece os cruzamentos de um flyer (quando uma vaga de inimigo renasce). */
  clearFlyer(index: number): void {
    for (let i = 0; i < this.crossings.length; i++) {
      const c = this.crossings[i];
      if (c.active && (c.a === index || c.b === index)) c.active = false;
    }
  }

  /** Maior taxa de dano atual envolvendo o flyer (para o debug). */
  rateOn(f: Flyer): number {
    let r = 0;
    for (let i = 0; i < this.crossings.length; i++) {
      const c = this.crossings[i];
      if (!c.active) continue;
      if (c.a === f.index && c.rateA > r) r = c.rateA;
      if (c.b === f.index && c.rateB > r) r = c.rateB;
    }
    return r;
  }

  /** Há cruzamento ativo envolvendo o flyer? */
  inContact(f: Flyer): boolean {
    for (let i = 0; i < this.crossings.length; i++) {
      const c = this.crossings[i];
      if (c.active && c.idle === 0 && (c.a === f.index || c.b === f.index)) return true;
    }
    return false;
  }

  /** Dano atual do flyer no cruzamento com `other` (0 se não houver). */
  damageBetween(f: Flyer, other: Flyer): number {
    let d = 0;
    for (let i = 0; i < this.crossings.length; i++) {
      const c = this.crossings[i];
      if (!c.active) continue;
      if (c.a === f.index && c.b === other.index) d = Math.max(d, c.dmgA);
      else if (c.b === f.index && c.a === other.index) d = Math.max(d, c.dmgB);
    }
    return d;
  }
}

function glowAround(f: Flyer, seg: number, dmg: number): void {
  const g = f.line.glow;
  const n = g.length;
  for (let k = -2; k <= 3; k++) {
    const idx = seg + k;
    if (idx < 0 || idx >= n) continue;
    const v = dmg * (1 - Math.abs(k - 0.5) * 0.25);
    if (v > g[idx]) g[idx] = v;
  }
}
