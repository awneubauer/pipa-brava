import { KiteAI } from '../ai/ai';
import { COLORS, KITE_MODELS, type Difficulty, type LineType } from '../config';
import { CutSystem, type CutEmit, type Crossing } from '../physics/cut';
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
  /** força do cerol do jogador */
  cerol?: number;
}

/** Defesa do jogador (fração do dano inimigo recebido). */
export const PLAYER_GUARD = 0.5;

/** Força de serra de um inimigo (cresce com a onda; o chefão é mais forte). */
export function enemySaw(wave: number, boss: boolean): number {
  return Math.min(1.25, 0.26 + 0.065 * (wave - 1) + (boss ? 0.25 : 0));
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
  /** duelo em andamento (linhas enganchadas) */
  duel = false;
  duelTime = 0;
  duelEnemy = -1;
  /** barra de timing do duelo (0..1): marcador, zona verde (centro, meia largura) */
  marker = 0;
  zoneC = 0.5;
  zoneHW = 0.08;
  /** quem atravessou a linha (ganha vantagem no duelo) */
  initiative: 'voce' | 'ele' = 'voce';
  /** bônus do duelo: pegou por cima / de surpresa */
  above = false;
  surprise = false;
  /** último resultado de toque (para o HUD) */
  feedback: 'perfeito' | 'corte' | 'erro' = 'corte';
  feedbackT = 0;
  private markerDir = 1;
  private markerSpeed = 1;
  private tapCooldown = 0;
  private duelCross: Crossing | null = null;
  /** onde as pipas ficam presas durante o duelo */
  holdX = 0;
  holdY = 0;
  private sparkT = 0;
  private enemyHoldX = new Float32Array(3);
  private enemyHoldY = new Float32Array(3);
  private wasInDuel = new Uint8Array(3);

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
      this.respawn.push(i === 0 ? 0.3 : 99);
    }
    // o corte na Batalha é decidido no duelo de serra (o sistema de corte só detecta os cruzamentos)
    this.cuts.minLoad = 0;
    this.cuts.kMul = 0;
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
    f.lineType = boss ? { ...waveLine(this.stats.wave), resistance: 1.6, name: 'Linha do Rei' } : waveLine(this.stats.wave);
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
    const agile = Math.min(1, 0.7 + 0.03 * this.stats.wave + (boss ? 0.15 : 0));
    const ai = new KiteAI(f, waveDifficulty(this.stats.wave + (boss ? 1 : 0)), 500 + this.spawnCount * 31, w.scene.hazards, agile);
    // tempo rondando antes de atacar: encurta nas fases avançadas
    ai.patrolTime = Math.max(1.2, 4.2 - 0.25 * (this.stats.wave - 1)) + this.rng() * 1.5;
    this.ais[slot] = ai;
    this.wasInDuel[slot] = 0;
    this.cb.onSpawn(f.name);
  }

  /** IA (antes do passo de física). */
  think(dt: number): void {
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      if (ai && !this.w.flyers[i + 1].hidden) ai.update(this.player, this.cuts, dt, this.w.time);
    }
  }

  /** Um atacante por vez: quem ronda há mais tempo ganha a vez; os outros esperam. */
  private assignAttacker(): void {
    let busy = this.duel;
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      if (ai && (ai.state === 'aproximar' || ai.state === 'engajar')) busy = true;
    }
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      if (!ai) continue;
      ai.mayAttack = !busy;
      if (!busy && ai.state === 'patrulhar') busy = true; // só o primeiro da fila
    }
  }

  /** Puxão do jogador: a linha "serra" mais forte por um instante. */
  jerk(): void {
    this.boost = 0.6;
  }

  /**
   * Duelo de timing: com as linhas enganchadas, um marcador vai e volta numa barra.
   * Apertar PUXA! com ele na zona verde corta a linha do inimigo (no centro: PERFEITO).
   * Errar faz você levar o corte; demorar também desgasta a sua linha aos poucos.
   */
  private stepDuel(dt: number): void {
    const cs = this.cuts.crossings;
    const p = this.player;
    let found: Crossing | null = null;
    if (this.duel) {
      // duelo travado: só a pipa enganchada conta, até alguém ser cortado
      // (ou as linhas ficarem soltas por mais de 0,7 s)
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.active && c.a === 0 && c.b === this.duelEnemy && c.idle < 0.7) found = c;
      }
      const e = this.w.flyers[this.duelEnemy];
      if (!e || e.hidden || !isAlive(e)) found = null;
    } else {
      // começa com quem está atacando (se houver), senão com qualquer cruzamento novo
      let bestScore = -1;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (!c.active || c.a !== 0 || c.idle > 0.05) continue;
        const e = this.w.flyers[c.b];
        if (!e || e.hidden || !isAlive(e)) continue;
        const ai = this.ais[c.b - 1];
        const score = ai && ai.state === 'engajar' ? 2 : 1;
        if (score > bestScore) {
          bestScore = score;
          found = c;
        }
      }
    }
    if (this.tapCooldown > 0) this.tapCooldown -= dt;
    if (this.feedbackT > 0) this.feedbackT -= dt;
    if (!found) {
      if (this.duel) this.endDuel();
      return;
    }
    const c = found;
    const e = this.w.flyers[c.b];
    const slot = c.b - 1;
    const boss = e.visualScale > 1;
    if (!this.duel) {
      // começa o duelo. Quem atravessou a linha (veio mais rápido) leva vantagem;
      // por cima e de surpresa a zona fica maior
      const ai = this.ais[slot];
      this.surprise = !!ai && ai.state === 'patrulhar';
      this.above = p.kite.y > e.kite.y + 1;
      const pv = Math.hypot(p.kite.vx, p.kite.vy);
      const ev = Math.hypot(e.kite.vx, e.kite.vy);
      this.initiative = this.surprise || pv > ev * 1.1 ? 'voce' : 'ele';
      if (this.initiative === 'voce') c.dmgB += 0.15 / e.lineType.resistance;
      else c.dmgA += 0.08 + 0.02 * this.stats.wave * PLAYER_GUARD;
      this.duel = true;
      this.duelEnemy = c.b;
      this.duelTime = 0;
      this.holdX = p.kite.x;
      this.holdY = p.kite.y;
      this.enemyHoldX[slot] = e.kite.x;
      this.enemyHoldY[slot] = e.kite.y;
      this.wasInDuel[slot] = 1;
      this.marker = 0;
      this.markerDir = 1;
      this.markerSpeed = Math.min(2, 0.6 + 0.08 * (this.stats.wave - 1) + (boss ? 0.25 : 0));
      const cerol = this.opts.cerol ?? 1;
      this.zoneHW = Math.min(
        0.22,
        0.095 * (1 + 0.15 * (cerol - 1)) * (this.above ? 1.3 : 1) * (this.surprise ? 1.15 : 1) * (this.initiative === 'voce' ? 1.2 : 0.85),
      );
      this.newZone();
    }
    this.duelTime += dt;
    // marcador vai e volta
    this.marker += this.markerDir * this.markerSpeed * 2 * dt;
    if (this.marker > 1) {
      this.marker = 2 - this.marker;
      this.markerDir = -1;
    } else if (this.marker < 0) {
      this.marker = -this.marker;
      this.markerDir = 1;
    }
    // pressão: quem enrola perde linha aos poucos
    const E = enemySaw(this.stats.wave, boss);
    c.dmgA += (0.04 + 0.1 * E * e.lineType.sharpness) * PLAYER_GUARD * 2 * dt;
    // engancha as duas pipas
    const ai = this.ais[slot];
    if (ai) ai.hold = true;
    e.ctrl.assist = 1;
    e.ctrl.assistX = this.enemyHoldX[slot];
    e.ctrl.assistY = this.enemyHoldY[slot];
    this.sparkT -= dt * 6;
    if (this.sparkT <= 0) {
      this.sparkT = 1;
      this.w.events.push('spark', 0, c.x, c.y, 0.4, c.b);
    }
    this.duelCross = c;
  }

  /** Zona verde: no centro nas primeiras fases; depois passa a mudar de lugar, cada vez mais longe. */
  private newZone(): void {
    const hw = this.zoneHW;
    const range = Math.max(0, Math.min(0.5 - hw - 0.04, (this.stats.wave - 2.2) * 0.08));
    this.zoneC = 0.5 + (this.rng() * 2 - 1) * range;
  }

  private endDuel(): void {
    for (let s = 0; s < this.ais.length; s++) {
      if (!this.wasInDuel[s]) continue;
      this.wasInDuel[s] = 0;
      const ai = this.ais[s];
      if (ai) ai.hold = false;
    }
    this.duel = false;
    this.duelEnemy = -1;
    this.duelCross = null;
  }

  /** Botão PUXA! no duelo. Retorna 'perfeito', 'corte', 'erro' ou null (fora do duelo / recarga). */
  duelTap(): 'perfeito' | 'corte' | 'erro' | null {
    const c = this.duelCross;
    if (!this.duel || !c || this.tapCooldown > 0) return null;
    this.tapCooldown = 0.25;
    const e = this.w.flyers[c.b];
    const d = Math.abs(this.marker - this.zoneC);
    const cerol = this.opts.cerol ?? 1;
    let r: 'perfeito' | 'corte' | 'erro';
    if (d <= this.zoneHW) {
      const perfect = d <= this.zoneHW * 0.4;
      const dmg = ((0.3 + 0.07 * (cerol - 1)) * (perfect ? 1.7 : 1)) / e.lineType.resistance;
      c.dmgB += dmg;
      r = perfect ? 'perfeito' : 'corte';
      this.newZone();
    } else {
      const E = enemySaw(this.stats.wave, e.visualScale > 1);
      c.dmgA += 0.14 * E * e.lineType.sharpness * PLAYER_GUARD * 2;
      r = 'erro';
    }
    this.feedback = r;
    this.feedbackT = 0.6;
    return r;
  }

  /** Regras (depois da física). Retorna true quando o jogo acaba de terminar. */
  step(dt: number): boolean {
    this.stepDuel(dt);
    this.assignAttacker();
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
      // pipa cortada cai e some logo: a vaga fica livre rápido (ritmo de arcade)
      if (!f.hidden && !isAlive(f) && f.statusTimer > 2.2) f.hidden = true;
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
    this.respawn[slot] = 1.2;
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
