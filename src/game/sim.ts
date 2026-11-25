import { KiteAI } from '../ai/ai';
import { COLORS, DIFFICULTIES, KITE_MODELS, LINE_TYPES, type DifficultyId } from '../config';
import { CutSystem } from '../physics/cut';
import { createFlyer, isAlive, launchFlyer, type Flyer } from '../physics/flyer';
import type { World } from '../physics/world';

/** Regras do modo Simulação: adversários, cortes, vitória e derrota. */

const NAMES = ['Tico', 'Juca', 'Dudu'];
const OPP_LOOK = [
  { model: 'papagaio', color: '#1ec8ff', tail: '#ffffff' },
  { model: 'piao', color: '#b04dff', tail: '#ffd400' },
  { model: 'quadrada', color: '#2ed573', tail: '#ff3b5c' },
];

export type SimOutcome = 'playing' | 'win' | 'lose';

export interface SimResult {
  outcome: SimOutcome;
  reason: string;
  time: number;
  cuts: number;
  lineLeft: number;
  score: number;
}

export class SimRules {
  readonly cuts = new CutSystem();
  readonly ais: KiteAI[] = [];
  outcome: SimOutcome = 'playing';
  reason = '';
  endTimer = 0;
  time = 0;
  private stuckTimer = 0;
  readonly difficulty: DifficultyId;

  constructor(
    private w: World,
    count: number,
    difficulty: DifficultyId,
  ) {
    this.difficulty = difficulty;
    const diff = DIFFICULTIES[difficulty];
    const spots = w.scene.opponents;
    const player = w.flyers[0];
    const pairs: number[] = [];
    for (let i = 0; i < Math.min(3, count); i++) {
      const s = spots[i % spots.length];
      const look = { ...OPP_LOOK[i] };
      if (look.color === player.look.color) look.color = COLORS[(COLORS.indexOf(look.color as (typeof COLORS)[number]) + 3) % COLORS.length];
      if (!KITE_MODELS.includes(look.model as (typeof KITE_MODELS)[number])) look.model = 'raia';
      const f = createFlyer(w.flyers.length, false, NAMES[i], s.x, s.y, diff.stock, LINE_TYPES[diff.line], look, 34 + i * 8);
      launchFlyer(f, 62 - i * 6, (i % 2 === 0 ? 0.12 : -0.12) * (s.x < player.baseX ? -1 : 1));
      w.flyers.push(f);
      pairs.push(0, f.index);
      this.ais.push(new KiteAI(f, diff, 1000 + i * 77 + Math.floor(Math.random() * 1000), w.scene.hazards));
    }
    this.cuts.reset();
    this.cuts.setPairs(pairs);
    const emit = w.events;
    w.post.push((world, dt) => this.cuts.step(world.flyers, dt, (t, fl, x, y, v, o) => emit.push(t, fl, x, y, v, o)));
  }

  get player(): Flyer {
    return this.w.flyers[0];
  }

  aliveOpponents(): number {
    let n = 0;
    for (let i = 1; i < this.w.flyers.length; i++) if (isAlive(this.w.flyers[i])) n++;
    return n;
  }

  /** IA (antes do passo de física). */
  think(dt: number): void {
    for (let i = 0; i < this.ais.length; i++) this.ais[i].update(this.player, this.cuts, dt, this.w.time);
  }

  /** Regras (depois do passo de física). Retorna true quando a partida acaba de terminar. */
  judge(dt: number): boolean {
    if (this.outcome !== 'playing') {
      this.endTimer += dt;
      return false;
    }
    this.time += dt;
    const p = this.player;
    if (!isAlive(p)) {
      this.outcome = 'lose';
      this.reason =
        p.status === 'cut'
          ? 'Sua linha foi cortada.'
          : p.status === 'burned'
            ? 'A pipa queimou no fio de luz.'
            : p.status === 'torn'
              ? 'A pipa rasgou na batida.'
              : 'A linha arrebentou de tanta tensão.';
      return true;
    }
    // sem linha no carretel e presa (enroscada ou cruzada)
    const left = p.reel.stock - p.reel.out;
    if (left < 0.5 && (p.status === 'snagged' || this.cuts.inContact(p))) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 2) {
      this.outcome = 'lose';
      this.reason = 'Acabou a linha com a pipa presa.';
      return true;
    }
    if (this.aliveOpponents() === 0) {
      this.outcome = 'win';
      this.reason = 'Você cortou todas as pipas!';
      return true;
    }
    return false;
  }

  result(): SimResult {
    const p = this.player;
    const cuts = this.cuts.cutsBy[0] ?? 0;
    const lineLeft = Math.max(0, p.reel.stock - p.reel.out);
    let score = cuts * 1000;
    if (this.outcome === 'win') score += Math.round(lineLeft) + Math.max(0, Math.round((300 - this.time) * 4));
    return { outcome: this.outcome, reason: this.reason, time: this.time, cuts, lineLeft, score };
  }
}
