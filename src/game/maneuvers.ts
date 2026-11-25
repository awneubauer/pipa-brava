import type { Flyer } from '../physics/flyer';

/** Manobras do modo Arcade: detecção pura a partir do estado da pipa. */

export type ManeuverId = 'loop' | 'rasante' | 'zigue' | 'recorde' | 'pairando';

export const MANEUVERS: Record<ManeuverId, { name: string; points: number; color: string }> = {
  loop: { name: 'LOOP!', points: 100, color: '#ffd400' },
  rasante: { name: 'RASANTE!', points: 250, color: '#2ed5ff' },
  zigue: { name: 'ZIGUE-ZAGUE!', points: 160, color: '#7dff5a' },
  recorde: { name: 'RECORDE!', points: 60, color: '#ff8a00' },
  pairando: { name: 'PAIROU NA RAJADA!', points: 220, color: '#ff6bd6' },
};

export interface ManeuverHit {
  id: ManeuverId;
  points: number;
  combo: number;
  sub: string;
}

const COMBO_WINDOW = 4;

export class ManeuverTracker {
  score = 0;
  combo = 0;
  comboTimer = 0;
  bestCombo = 0;
  counts: Record<ManeuverId, number> = { loop: 0, rasante: 0, zigue: 0, recorde: 0, pairando: 0 };
  maxHeight = 0;
  private spinAnchor = 0;
  private spinExtreme = 0;
  private loopTimer = 0;
  private dive = 0;
  private diveTimer = 0;
  private zigSign = 0;
  private zigTimes = new Float32Array(8);
  private zigCount = 0;
  private zigCooldown = 0;
  private recordStep = 30;
  private hoverTimer = 0;
  private hoverCooldown = 0;
  private time = 0;
  /** saída reutilizada (sem alocação) */
  private readonly hit: ManeuverHit = { id: 'loop', points: 0, combo: 1, sub: '' };

  reset(f: Flyer): void {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    for (const k in this.counts) this.counts[k as ManeuverId] = 0;
    this.maxHeight = 0;
    this.spinAnchor = this.spinExtreme = f.spin;
    this.loopTimer = 0;
    this.dive = 0;
    this.zigCount = 0;
    this.zigSign = 0;
    this.recordStep = 30;
    this.hoverTimer = 0;
    this.time = 0;
  }

  private award(id: ManeuverId, sub: string): ManeuverHit {
    if (this.comboTimer > 0) this.combo = Math.min(9, this.combo + 1);
    else this.combo = 1;
    this.comboTimer = COMBO_WINDOW;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const pts = MANEUVERS[id].points * this.combo;
    this.score += pts;
    this.counts[id]++;
    const h = this.hit;
    h.id = id;
    h.points = pts;
    h.combo = this.combo;
    h.sub = sub;
    return h;
  }

  /** Chamar a cada passo fixo. Retorna uma manobra concluída (ou null). */
  update(f: Flyer, groundY: number, dt: number): ManeuverHit | null {
    this.time += dt;
    if (this.comboTimer > 0) this.comboTimer -= dt;
    if (this.zigCooldown > 0) this.zigCooldown -= dt;
    if (this.hoverCooldown > 0) this.hoverCooldown -= dt;
    if (f.status !== 'flying') return null;
    const k = f.kite;
    const h = k.y - groundY;
    const speed = Math.hypot(k.vx, k.vy);
    let out: ManeuverHit | null = null;

    // ---- loop: 360° no mesmo sentido em até 6 s ----
    this.loopTimer += dt;
    const ds = f.spin - this.spinAnchor;
    const dir = Math.sign(ds);
    if (dir !== 0) {
      // voltou mais de 90° contra o sentido: recomeça
      if (Math.abs(f.spin - this.spinAnchor) < Math.abs(this.spinExtreme - this.spinAnchor) - Math.PI / 2) {
        this.spinAnchor = f.spin;
        this.spinExtreme = f.spin;
        this.loopTimer = 0;
      } else if (Math.abs(ds) > Math.abs(this.spinExtreme - this.spinAnchor)) this.spinExtreme = f.spin;
    }
    if (this.loopTimer > 6) {
      this.spinAnchor = this.spinExtreme = f.spin;
      this.loopTimer = 0;
    }
    if (Math.abs(f.spin - this.spinAnchor) >= Math.PI * 2) {
      this.spinAnchor += Math.sign(f.spin - this.spinAnchor) * Math.PI * 2;
      this.spinExtreme = f.spin;
      this.loopTimer = 0;
      if (f.tension01 > 0.03 || speed > 3) out = this.award('loop', '');
    }

    // ---- rasante: do alto até perto do chão e de volta, sem encostar ----
    if (this.dive === 0 && h > 22) this.dive = 1;
    if (this.dive === 1 && h < 5 && speed > 5) {
      this.dive = 2;
      this.diveTimer = 0;
    }
    if (this.dive === 2) {
      this.diveTimer += dt;
      if (f.grounded) this.dive = 0;
      else if (h > 14) {
        this.dive = 0;
        if (!out) out = this.award('rasante', '');
      } else if (this.diveTimer > 6) this.dive = 0;
    }
    if (f.grounded && this.dive === 1 && h < 1) this.dive = 0;

    // ---- zigue-zague: 4 trocas de lado rápidas em 5 s ----
    if (Math.abs(k.vx) > 3.5) {
      const s = Math.sign(k.vx);
      if (s !== this.zigSign) {
        if (this.zigSign !== 0) {
          this.zigTimes[this.zigCount % 8] = this.time;
          this.zigCount++;
        }
        this.zigSign = s;
      }
    }
    if (this.zigCount >= 4 && this.zigCooldown <= 0) {
      const t4 = this.zigTimes[(this.zigCount - 4) % 8];
      if (this.time - t4 < 5) {
        this.zigCount = 0;
        this.zigCooldown = 2;
        if (!out) out = this.award('zigue', '');
      }
    }

    // ---- altura recorde ----
    if (h > this.maxHeight) this.maxHeight = h;
    if (h >= this.recordStep + 10) {
      this.recordStep = Math.floor(h / 10) * 10;
      if (!out) out = this.award('recorde', this.recordStep + ' m');
    }

    // ---- parada no ar durante rajada ----
    if (f.windGust > 0.45 && speed < 1.6 && f.tension01 > 0.06 && h > 6) this.hoverTimer += dt;
    else this.hoverTimer = Math.max(0, this.hoverTimer - dt * 2);
    if (this.hoverTimer > 2 && this.hoverCooldown <= 0) {
      this.hoverTimer = 0;
      this.hoverCooldown = 6;
      if (!out) out = this.award('pairando', '');
    }
    return out;
  }

  stars(): number {
    return starsFor(this.score);
  }
}

export function starsFor(score: number): number {
  return score >= 6000 ? 3 : score >= 2500 ? 2 : score >= 700 ? 1 : 0;
}
