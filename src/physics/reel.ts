import { PHYSICS, REEL } from '../config';

/** Carretel: estoque limitado, linha fora (`out`) sempre em [minLineOut, stock]. */
export interface ReelState {
  stock: number;
  out: number;
  /** velocidade atual da linha (m/s, + = soltando) */
  rate: number;
  /** distância total de linha que passou (para o som do carretel) */
  spin: number;
  /** velocidade interna do carretel (com inércia) */
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

/** Fração da velocidade de soltura liberada pela tração (0 frouxa → 1 puxando forte). */
export function releaseGrip(t01: number): number {
  const x = (t01 - 0.03) / 0.45;
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

export function remaining(r: ReelState): number {
  return r.stock - r.out;
}

/**
 * Avança o carretel. `cmd` em [-1, 1]: + solta, - recolhe.
 * `tension01` acelera a soltura (a pipa puxando) e dificulta o recolhimento.
 * `extraRelease` (m/s) permite alívio automático (arcade).
 * `releaseCap` limita quanto a linha pode sair além da distância real até a pipa.
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
  const t = tension01 > 1 ? 1 : tension01 < 0 ? 0 : tension01;
  if (!(r.pull === r.pull)) r.pull = 0;
  // o carretel sente a tração média (os trancos rápidos não soltam linha sozinhos)
  r.pull += (t - r.pull) * Math.min(1, dt * 3);
  let rate = 0;
  // a linha só sai puxada pela pipa: sem tração o carretel quase não gira
  if (cmd > 0) rate = cmd * REEL.maxRelease * releaseGrip(r.pull) * (1 + REEL.pullBoost * r.pull);
  else if (cmd < 0) rate = cmd * REEL.maxRetrieve * (1 - 0.35 * t);
  rate += extraRelease;
  // inércia do carretel: a velocidade da linha acompanha o comando com atraso (~0,2 s)
  r.speed += (rate - r.speed) * Math.min(1, dt * 5);
  rate = r.speed;
  const before = r.out;
  let next = r.out + rate * dt;
  // linha só sai até um pouco de folga: sem a pipa puxando, o carretel "trava"
  if (rate > 0 && next > releaseCap) {
    next = Math.max(r.out, releaseCap);
    r.speed = 0;
  }
  r.out = clampOut(next, r.stock);
  r.rate = (r.out - before) / dt;
  r.spin += Math.abs(r.out - before);
}
