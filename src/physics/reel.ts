import { PHYSICS, REEL } from '../config';

/** Carretel: estoque limitado, linha fora (`out`) sempre em [minLineOut, stock]. */
export interface ReelState {
  stock: number;
  out: number;
  /** velocidade atual da linha (m/s, + = soltando) */
  rate: number;
  /** distância total de linha que passou (para o som do carretel) */
  spin: number;
  /** velocidade interna da lata (m/s, com inércia curta) */
  speed: number;
  /** tração média sentida no carretel (filtrada) */
  pull: number;
}

export function createReel(stock: number, out: number): ReelState {
  const r: ReelState = { stock, out: 0, rate: 0, spin: 0, speed: 0, pull: 0 };
  r.out = clampOut(out, stock);
  return r;
}

function clampOut(v: number, stock: number): number {
  const lo = Math.min(PHYSICS.minLineOut, stock);
  if (!(v >= lo)) return lo; // também captura NaN
  if (v > stock) return stock;
  return v;
}

/** Quanto da velocidade de recolher sobra contra a tração (só trava perto de arrebentar). */
export function retrieveGrip(t01: number): number {
  const x = (t01 - 0.55) / 0.35;
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return 1 - c * c * (3 - 2 * c) * 0.95;
}

export function remaining(r: ReelState): number {
  return r.stock - r.out;
}

/**
 * Avança o carretel (lata). `cmd` em [-1, 1] é a velocidade pedida pelo dedo:
 * + solta, − recolhe, 0 = linha presa na mão.
 * - Soltando, a pipa puxando arrasta mais linha (`tension01`).
 * - Recolher é puxar: só fica mais difícil perto de arrebentar.
 * - `extraRelease` (m/s): alívio automático (arcade).
 * - `releaseCap`: a linha não sai muito além da distância até a pipa (folga máxima).
 */
export function stepReel(
  r: ReelState,
  cmd: number,
  tension01: number,
  dt: number,
  extraRelease = 0,
  releaseCap = Infinity,
): void {
  if (cmd !== cmd) cmd = 0;
  if (!(r.speed === r.speed) || !Number.isFinite(r.speed)) r.speed = 0;
  if (cmd > 1) cmd = 1;
  else if (cmd < -1) cmd = -1;
  const t = tension01 > 1.5 ? 1.5 : tension01 < 0 ? 0 : tension01;
  if (!(r.pull === r.pull)) r.pull = 0;
  r.pull += (Math.min(1, t) - r.pull) * Math.min(1, dt * 3);
  let target = 0;
  if (cmd > 0) target = cmd * REEL.maxRelease * (1 + r.pull * REEL.pullBoost);
  else if (cmd < 0) target = cmd * REEL.maxRetrieve * retrieveGrip(t);
  if (target > REEL.maxRelease * 1.3) target = REEL.maxRelease * 1.3;
  // a lata tem pouca inércia: responde em ~60 ms
  r.speed += (target - r.speed) * Math.min(1, dt * 16);
  if (cmd === 0 && Math.abs(r.speed) < 0.05) r.speed = 0;
  const rate = r.speed + extraRelease;
  const before = r.out;
  let next = r.out + rate * dt;
  // folga máxima: com a linha já muito frouxa a lata para de girar
  if (rate > 0 && next > releaseCap) {
    next = Math.max(r.out, releaseCap);
    if (r.speed > 0) r.speed = 0;
  }
  r.out = clampOut(next, r.stock);
  r.rate = (r.out - before) / dt;
  r.spin += Math.abs(r.out - before);
}
