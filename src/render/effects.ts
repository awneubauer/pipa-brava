/** Partículas e textos flutuantes em pools pré-alocados (sem alocação no loop). */

const MAX_P = 420;

export const enum PKind {
  Spark = 0,
  Smoke = 1,
  Confetti = 2,
  Shred = 3,
  Zap = 4,
}

export class Particles {
  x = new Float32Array(MAX_P);
  y = new Float32Array(MAX_P);
  vx = new Float32Array(MAX_P);
  vy = new Float32Array(MAX_P);
  life = new Float32Array(MAX_P);
  max = new Float32Array(MAX_P);
  kind = new Uint8Array(MAX_P);
  color = new Uint8Array(MAX_P);
  private next = 0;

  spawn(kind: PKind, x: number, y: number, vx: number, vy: number, life: number, color = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_P;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.kind[i] = kind;
    this.color[i] = color;
  }

  burst(kind: PKind, x: number, y: number, n: number, speed: number, life: number, color = 0): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), color);
    }
  }

  update(dt: number, windX: number): void {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      if (k === PKind.Smoke) {
        this.vx[i] += (windX * 0.5 - this.vx[i]) * dt;
        this.vy[i] += (1.2 - this.vy[i]) * dt;
      } else if (k === PKind.Confetti || k === PKind.Shred) {
        this.vy[i] -= 4 * dt;
        this.vx[i] *= 1 - dt * 1.5;
        this.vy[i] *= 1 - dt * 1.5;
      } else {
        this.vy[i] -= 9.8 * dt;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  clear(): void {
    this.life.fill(0);
  }
}

export const PALETTE_FX = ['#ffe680', '#ff8a3d', '#ffffff', '#7ee8ff', '#ff4d6d', '#8cff7a', '#c38bff', '#ffd400'];

/** Texto flutuante (manobras, "Eita!", "CORTOU!"). */
export interface Popup {
  text: string;
  sub: string;
  x: number;
  y: number;
  /** true = posição em px de tela; false = mundo */
  screen: boolean;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'pop' | 'balloon' | 'banner';
}

export class Popups {
  readonly items: Popup[] = [];
  constructor(n = 16) {
    for (let i = 0; i < n; i++)
      this.items.push({ text: '', sub: '', x: 0, y: 0, screen: true, life: 0, max: 1, color: '#fff', size: 30, kind: 'pop' });
  }
  show(text: string, sub: string, x: number, y: number, screen: boolean, life: number, color: string, size: number, kind: Popup['kind']): void {
    let best = this.items[0];
    for (const p of this.items) {
      if (p.life <= 0) {
        best = p;
        break;
      }
      if (p.life < best.life) best = p;
    }
    best.text = text;
    best.sub = sub;
    best.x = x;
    best.y = y;
    best.screen = screen;
    best.life = life;
    best.max = life;
    best.color = color;
    best.size = size;
    best.kind = kind;
  }
  update(dt: number): void {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].life > 0) this.items[i].life -= dt;
  }
  clear(): void {
    for (const p of this.items) p.life = 0;
  }
}
