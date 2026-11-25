import { KiteAI } from '../ai/ai';
import { COLORS, KITE_MODELS, type Difficulty, type LineType } from '../config';
import { CutSystem, type CutEmit } from '../physics/cut';
import { createFlyer, isAlive, launchFlyer, type Flyer } from '../physics/flyer';
import { layLine } from '../physics/line';
import type { World } from '../physics/world';

/**
 * Batalha no Céu (modo principal): ondas de pipas inimigas que tentam cortar a sua.
 * Corte para pontuar (com combo), sobreviva às ondas, ganhe moedas. Uma vida só.
 */

const ENEMY_SLOTS = 3;
const NAMES = ['Tico', 'Juca', 'Dudu', 'Biel', 'Lelo', 'Caco', 'Nando', 'Zeca', 'Vavá', 'Bila'];
const COMBO_WINDOW = 8;

export interface BattleStats {
  score: number;
  cuts: number;
  wave: number;
  bestCombo: number;
  coins: number;
  time: number;
  jerkCuts: number;
  over: boolean;
}

export interface BattleCallbacks {
  /** corte feito pelo jogador: pontos ganhos, combo, moedas */
  onCut: (points: number, combo: number, coins: number, x: number, y: number) => void;
  onWave: (wave: number, bonus: number) => void;
  onSpawn: (name: string) => void;
}

/** Dificuldade contínua por onda. */
export function waveDifficulty(wave: number): Difficulty {
  const w = Math.max(0, wave - 1);
  return {
    id: 'media',
    name: 'Onda ' + wave,
    reaction: Math.max(0.14, 0.62 - 0.05 * w),
    aggression: Math.min(0.95, 0.32 + 0.07 * w),
    error: Math.max(0.05, 0.34 - 0.03 * w),
    line: 'comum',
    stock: 900,
  };
}

export function waveLine(wave: number): LineType {
  const w = Math.max(0, wave - 1);
  const sharp = Math.min(1.8, 0.85 + 0.09 * w);
  return {
    id: 'comum',
    name: sharp < 1.2 ? 'Comum' : sharp < 1.5 ? 'Afiada' : 'Super afiada',
    sharpness: sharp,
    resistance: 1,
    breakForce: 26,
    color: sharp < 1.2 ? '#f4efe2' : sharp < 1.5 ? '#ffe08a' : '#ff9f6b',
  };
}

export function waveQuota(wave: number): number {
  return 2 + wave;
}

export function waveConcurrent(wave: number): number {
  return Math.min(ENEMY_SLOTS, 1 + Math.floor(wave / 2));
}

export interface BattleOptions {
  /** força fixa dos inimigos (fases); sem isto, as ondas avançam (Infinito) */
  fixedWave?: number;
  /** quantos inimigos voam juntos */
  concurrent?: number;
  /** a vaga 0 traz o chefão */
  boss?: boolean;
}

export class BattleRules {
  readonly cuts = new CutSystem();
  readonly ais: (KiteAI | null)[] = [];
  readonly stats: BattleStats = { score: 0, cuts: 0, wave: 1, bestCombo: 0, coins: 0, time: 0, jerkCuts: 0, over: false };
  combo = 0;
  comboTimer = 0;
  /** puxão ativo do jogador (s) */
  boost = 0;
  private waveCuts = 0;
  private respawn: number[] = [];
  private spawnCount = 0;
  private survivalAcc = 0;
  private waveBanner = 0;
  /** o chefão já apareceu / caiu */
  bossSpawned = false;
  bossDown = false;
  /** maior dano que a linha do jogador já levou (para as estrelas) */
  maxDamage = 0;

  constructor(
    private w: World,
    private mult: number,
    private cb: BattleCallbacks,
    private opts: BattleOptions = {},
    private rng: () => number = Math.random,
  ) {
    if (opts.fixedWave) this.stats.wave = opts.fixedWave;
    const player = w.flyers[0];
    const spots = w.scene.opponents;
    const pairs: number[] = [];
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const s = spots[i % spots.length];
      const f = createFlyer(w.flyers.length, false, NAMES[i], s.x, s.y, 900, waveLine(1), { model: 'raia', color: COLORS[i], tail: '#ffffff' }, 40);
      f.hidden = true;
      f.status = 'landed';
      w.flyers.push(f);
      pairs.push(0, f.index);
      this.ais.push(null);
      this.respawn.push(i === 0 ? 1.2 : 99);
    }
    this.cuts.minLoad = 0.3;
    this.cuts.kMul = 1.8;
    // o herói aguenta mais: as linhas inimigas tiram menos da sua
    w.flyers[0].damageTaken = 0.55;
    this.cuts.setPairs(pairs);
    const q = w.events;
    const emit: CutEmit = (t, fl, x, y, v, o) => q.push(t, fl, x, y, v, o);
    w.post.push((world, dt) => this.cuts.step(world.flyers, dt, emit));
    void player;
  }

  get player(): Flyer {
    return this.w.flyers[0];
  }

  enemies(): number {
    let n = 0;
    for (let i = 1; i < this.w.flyers.length; i++) if (isAlive(this.w.flyers[i]) && !this.w.flyers[i].hidden) n++;
    return n;
  }

  private spawn(slot: number): void {
    const w = this.w;
    const f = w.flyers[slot + 1];
    const p = this.player;
    const spots = w.scene.opponents;
    const s = spots[(slot + this.spawnCount) % spots.length];
    this.spawnCount++;
    f.baseX = s.x;
    f.baseY = s.y;
    f.hidden = false;
    f.name = NAMES[(this.spawnCount + slot * 3) % NAMES.length];
    const boss = !!this.opts.boss && slot === 0 && !this.bossSpawned;
    f.lineType = boss ? { ...waveLine(this.stats.wave), resistance: 2, name: 'Linha do Rei' } : waveLine(this.stats.wave);
    f.visualScale = boss ? 1.7 : 1;
    f.look = {
      model: KITE_MODELS[Math.floor(this.rng() * KITE_MODELS.length)],
      color: COLORS[Math.floor(this.rng() * (COLORS.length - 1))],
      tail: COLORS[Math.floor(this.rng() * COLORS.length)],
    };
    if (f.look.color === p.look.color) f.look.color = COLORS[(COLORS.indexOf(f.look.color as (typeof COLORS)[number]) + 3) % (COLORS.length - 1)];
    if (boss) {
      this.bossSpawned = true;
      f.name = 'Rei do Céu';
      f.look = { model: 'estrela', color: '#1b1b2a', tail: '#ffd400', fx: 'fire' };
    }
    // nasce já perto da briga: linha suficiente para alcançar a sua pipa
    const reach = Math.hypot(p.kite.x - s.x, p.kite.y - s.y);
    f.reel.out = Math.min(f.reel.stock - 10, Math.max(30, reach * 0.9));
    f.reel.speed = 0;
    f.damage = 0;
    f.redTimer = 0;
    f.strain = 0;
    f.jerkTimer = 0;
    f.ctrl.steer = f.ctrl.reel = f.ctrl.handY = 0;
    launchFlyer(f, 58, s.x < p.baseX ? 0.25 : -0.25);
    layLine(f.line, f.handX, f.handY, f.kite.x, f.kite.y, f.kite.z, f.reel.out);
    this.cuts.clearFlyer(f.index);
    this.ais[slot] = new KiteAI(f, waveDifficulty(this.stats.wave + (boss ? 1 : 0)), 500 + this.spawnCount * 31, w.scene.hazards);
    this.cb.onSpawn(f.name);
  }

  /** IA (antes do passo de física). */
  think(dt: number): void {
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      if (ai && !this.w.flyers[i + 1].hidden) ai.update(this.player, this.cuts, dt, this.w.time);
    }
  }

  /** Puxão do jogador: a linha "serra" mais forte por um instante. */
  jerk(): void {
    this.boost = 0.6;
  }

  /** Regras (depois da física). Retorna true quando o jogo acaba de terminar. */
  step(dt: number): boolean {
    const st = this.stats;
    if (st.over) return false;
    const p = this.player;
    st.time += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.waveBanner > 0) this.waveBanner -= dt;
    if (this.boost > 0) this.boost -= dt;
    p.sharpMul = this.boost > 0 ? 2.2 : 1;
    // sobreviver também pontua
    this.survivalAcc += dt;
    if (this.survivalAcc >= 1) {
      this.survivalAcc -= 1;
      st.score += 5 * this.mult;
    }
    if (p.damage > this.maxDamage) this.maxDamage = p.damage;
    if (!isAlive(p)) {
      st.over = true;
      return true;
    }
    // vagas: renasce quem caiu, respeitando quantos podem voar juntos nesta onda
    const conc = this.opts.concurrent ?? waveConcurrent(st.wave);
    let flying = 0;
    for (let i = 0; i < this.ais.length; i++) {
      const f = this.w.flyers[i + 1];
      if (!f.hidden && isAlive(f)) flying++;
    }
    for (let i = 0; i < this.ais.length; i++) {
      const f = this.w.flyers[i + 1];
      if (!f.hidden && isAlive(f)) continue;
      if (!f.hidden && f.status === 'landed' && f.statusTimer > 1.5) f.hidden = true;
      if (!f.hidden) continue;
      if (i >= conc) continue;
      if (this.respawn[i] > 50) this.respawn[i] = 1.5 + i * 1.2;
      this.respawn[i] -= dt;
      // na fase do chefão, a vaga 0 só tem o chefão (não renasce depois que ele cai)
      if (this.opts.boss && i === 0 && this.bossSpawned) continue;
      if (this.respawn[i] <= 0 && flying < conc) {
        this.respawn[i] = 99;
        this.spawn(i);
        flying++;
      }
    }
    return false;
  }

  /** Chamado quando uma pipa inimiga é cortada (evento 'cut' do mundo). */
  enemyDown(f: Flyer, byPlayer: boolean): void {
    const st = this.stats;
    const slot = f.index - 1;
    this.ais[slot] = null;
    if (f.visualScale > 1) this.bossDown = byPlayer || this.bossDown;
    this.respawn[slot] = 2.5;
    if (!byPlayer) return;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    if (this.combo > st.bestCombo) st.bestCombo = this.combo;
    const pts = 100 * this.combo * this.mult;
    const coins = 2 + Math.floor(st.wave / 2) + (this.combo > 1 ? this.combo - 1 : 0);
    st.score += pts;
    st.coins += coins;
    st.cuts++;
    if (this.boost > 0) st.jerkCuts++;
    this.cb.onCut(pts, this.combo, coins, f.kite.x, f.kite.y);
    this.waveCuts++;
    if (this.opts.fixedWave === undefined && this.waveCuts >= waveQuota(st.wave)) {
      this.waveCuts = 0;
      const bonus = 250 * st.wave * this.mult;
      st.score += bonus;
      st.coins += 5;
      st.wave++;
      this.waveBanner = 2.5;
      this.cb.onWave(st.wave, bonus);
    }
  }

  /** Quantas pipas faltam para a próxima onda. */
  remainingInWave(): number {
    return waveQuota(this.stats.wave) - this.waveCuts;
  }
}
