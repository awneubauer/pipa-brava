import { PHYSICS } from '../config';
import type { WindField, WindSample } from './wind';
import { createWindSample, sampleWind } from './wind';

/**
 * Linha como corrente de Verlet: nó 0 = mão, nó n-1 = cabresto da pipa.
 * Quando cortada em `cutIndex`, o segmento cutIndex→cutIndex+1 deixa de existir:
 * o trecho da mão fica com ponta solta e o trecho da pipa vai junto com ela.
 */
export interface LineState {
  n: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  oz: Float32Array;
  /** comprimento total fora do carretel (m) */
  length: number;
  /** -1 = inteira */
  cutIndex: number;
  /** trecho da mão solto (linha cortada/perdida) */
  handFree: boolean;
  /** dano visual por nó (0..1), para o brilho */
  glow: Float32Array;
}

export function createLine(n = PHYSICS.lineNodes): LineState {
  return {
    n,
    px: new Float32Array(n),
    py: new Float32Array(n),
    pz: new Float32Array(n),
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    oz: new Float32Array(n),
    length: 10,
    cutIndex: -1,
    handFree: false,
    glow: new Float32Array(n),
  };
}

/** Estende a linha em reta da mão até a pipa. */
export function layLine(
  l: LineState,
  hx: number,
  hy: number,
  kx: number,
  ky: number,
  kz: number,
  length: number,
): void {
  l.length = length;
  l.cutIndex = -1;
  l.handFree = false;
  for (let i = 0; i < l.n; i++) {
    const t = i / (l.n - 1);
    l.px[i] = l.ox[i] = hx + (kx - hx) * t;
    l.py[i] = l.oy[i] = hy + (ky - hy) * t;
    l.pz[i] = l.oz[i] = kz * t;
    l.glow[i] = 0;
  }
}

const ws: WindSample = createWindSample();

export interface LineEnv {
  wind: WindField;
  time: number;
  ground: (x: number) => number;
}

/**
 * Um subpasso da linha. Extremidades fixadas na mão (se não estiver solta) e
 * na pipa (se `kiteAttached`). Peso leve, arrasto do vento, 6 iterações.
 */
export function stepLine(
  l: LineState,
  hx: number,
  hy: number,
  kx: number,
  ky: number,
  kz: number,
  kiteAttached: boolean,
  env: LineEnv,
  dt: number,
): void {
  const n = l.n;
  const last = n - 1;
  const g = PHYSICS.gravity * dt * dt;
  // arrasto: a linha leve tende à velocidade do vento (taxa 1/s)
  const dragRate = 1.6 * dt;
  const damp = 0.996;
  const cut = l.cutIndex;
  for (let i = 0; i < n; i++) {
    const pinnedHand = i === 0 && !l.handFree;
    const pinnedKite = i === last && kiteAttached;
    if (pinnedHand || pinnedKite) continue;
    const x = l.px[i];
    const y = l.py[i];
    const z = l.pz[i];
    let vx = (x - l.ox[i]) * damp;
    let vy = (y - l.oy[i]) * damp;
    let vz = (z - l.oz[i]) * damp;
    // amostra o vento a cada 4 nós (e reaproveita) para economizar
    if ((i & 3) === 0 || i === 1) sampleWind(ws, env.wind, x, y, env.time);
    vx += (ws.x * dt - vx) * dragRate;
    vy += (ws.y * dt - vy) * dragRate * 0.6;
    vz += (ws.z * dt - vz) * dragRate;
    l.ox[i] = x;
    l.oy[i] = y;
    l.oz[i] = z;
    l.px[i] = x + vx;
    // uma ponta solta (cortada) cai mais devagar por causa do arrasto
    l.py[i] = y + vy - g * (cut >= 0 ? 0.6 : 1);
    l.pz[i] = z + vz;
  }
  if (!l.handFree) {
    l.px[0] = hx;
    l.py[0] = hy;
    l.pz[0] = 0;
  }
  if (kiteAttached) {
    l.px[last] = kx;
    l.py[last] = ky;
    l.pz[last] = kz;
  }
  const rest = l.length / (n - 1);
  const iters = PHYSICS.lineIterations;
  for (let it = 0; it < iters; it++) {
    // alterna o sentido de varredura para convergir dos dois lados
    const fwd = (it & 1) === 0;
    for (let k = 0; k < n - 1; k++) {
      const i = fwd ? k : n - 2 - k;
      if (i === cut) continue;
      const j = i + 1;
      const wi = i === 0 && !l.handFree ? 0 : 1;
      const wj = j === last && kiteAttached ? 0 : 1;
      const wsum = wi + wj;
      if (wsum === 0) continue;
      const dx = l.px[j] - l.px[i];
      const dy = l.py[j] - l.py[i];
      const dz = l.pz[j] - l.pz[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // só restringe esticamento (corda não empurra)
      if (d < 1e-6 || d <= rest) continue;
      const diff = (d - rest) / d;
      const ci = (wi / wsum) * diff;
      const cj = (wj / wsum) * diff;
      l.px[i] += dx * ci;
      l.py[i] += dy * ci;
      l.pz[i] += dz * ci;
      l.px[j] -= dx * cj;
      l.py[j] -= dy * cj;
      l.pz[j] -= dz * cj;
    }
  }
  // chão
  for (let i = 0; i < n; i++) {
    const gy = env.ground(l.px[i]) + 0.04;
    if (l.py[i] < gy) {
      l.py[i] = gy;
      // atrito no chão
      l.ox[i] = l.px[i] - (l.px[i] - l.ox[i]) * 0.5;
      l.oy[i] = gy;
      l.oz[i] = l.pz[i] - (l.pz[i] - l.oz[i]) * 0.5;
    }
  }
}

/** Velocidade (m/s) de um nó, a partir do Verlet. */
export function nodeVelX(l: LineState, i: number, dt: number): number {
  return (l.px[i] - l.ox[i]) / dt;
}
export function nodeVelY(l: LineState, i: number, dt: number): number {
  return (l.py[i] - l.oy[i]) / dt;
}

/** Comprimento da corrente medido (para depuração/testes). */
export function measuredLength(l: LineState): number {
  let s = 0;
  for (let i = 0; i < l.n - 1; i++) {
    if (i === l.cutIndex) continue;
    s += Math.hypot(l.px[i + 1] - l.px[i], l.py[i + 1] - l.py[i], l.pz[i + 1] - l.pz[i]);
  }
  return s;
}

/**
 * Força de tração da linha na pipa (modelo elástico do trecho da mão).
 * Retorna a força em N (>= 0); "esticamento" = força / rigidez.
 */
export function elasticTension(dist: number, length: number, extRate: number): number {
  const ext = dist - length;
  if (ext <= 0) return 0;
  const t = PHYSICS.lineStiffness * ext + PHYSICS.lineDamping * extRate;
  return t > 0 ? t : 0;
}
