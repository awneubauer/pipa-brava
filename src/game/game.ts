import { PHYSICS, SLOWMO, TENSION, type DifficultyId, type LineTypeId, type ModeId } from '../config';
import { GameAudio } from '../audio/audio';
import { isAlive, type Flyer } from '../physics/flyer';
import { createWorld, stepWorld, type World } from '../physics/world';
import { PKind, Particles, Popups } from '../render/effects';
import { createSnapshot, Renderer, takeSnapshot, type FlyerSnapshot } from '../render/renderer';
import { getScene } from '../scenes/index';
import type { SceneDef, SceneId } from '../scenes/types';
import { Hud, type HudInfo } from '../ui/hud';
import { Camera } from './camera';
import { Input } from './input';
import { FixedLoop } from './loop';
import { MANEUVERS, ManeuverTracker } from './maneuvers';
import { createEasyState, easyControl } from './autopilot';
import { BattleRules } from './battle';
import { LEVELS, goalText, starsFor, type LevelDef } from './levels';
import { SimRules, type SimResult } from './sim';
import { getCerol, getSkin } from './skins';
import { loadSave, recordBest, writeSave, type SaveData } from './state';

export interface GameResult {
  mode: ModeId;
  scene: SceneId;
  score: number;
  stars: number;
  best: boolean;
  maxHeight: number;
  loops: number;
  bestCombo: number;
  time: number;
  sim: SimResult | null;
  difficulty: DifficultyId;
  /** linha liberada nesta partida (se houver) */
  unlocked: LineTypeId | null;
  battle: BattleResult | null;
}

/** Resultado de uma fase (ou do modo Infinito, level = 0). */
export interface BattleResult {
  level: number;
  success: boolean;
  stars: number;
  /** estrelas que esta fase tinha antes */
  prevStars: number;
  score: number;
  cuts: number;
  wave: number;
  bestCombo: number;
  coins: number;
  reason: string;
  /** "quase!" — quanto faltou */
  nearMiss: string;
  newBest: boolean;
}

const DPR_LEVELS = [2, 1.6, 1.3, 1];

export interface GameHooks {
  onPause: () => void;
  onExit: (r: GameResult) => void;
}

/** Orquestra mundo, entrada, câmera, render e regras do modo. */
export class Game {
  readonly renderer: Renderer;
  readonly camera = new Camera();
  readonly input: Input;
  readonly hud = new Hud();
  readonly fx = new Particles();
  readonly popups = new Popups();
  readonly tracker = new ManeuverTracker();
  readonly audio = new GameAudio();
  private scrapeCooldown = 0;
  private readonly audioFrame = { wind: 0, airspeed: 0, tension: 0, reel: 0, red: false, active: false };
  readonly loop: FixedLoop;
  save: SaveData;
  world: World | null = null;
  sim: SimRules | null = null;
  battle: BattleRules | null = null;
  level: LevelDef | null = null;
  private easy = createEasyState();
  private duelBuzz = 0;
  private battleOutcome: 'playing' | 'win' | 'lose' = 'playing';
  private battleReason = '';
  levelNum = 0;
  private ended = false;
  private oppList: Flyer[] = [];
  private endDelay = 0;
  scene: SceneDef | null = null;
  mode: ModeId = 'arcade';
  snaps: FlyerSnapshot[] = [];
  paused = true;
  /** menu: a pipa voa sozinha ao fundo */
  attract = false;
  debug = false;
  private slowmo = 0;
  private flash = 0;
  private redBuzz = 0;
  private playTime = 0;
  private w = 0;
  private h = 0;
  private hudInfo: HudInfo;
  private debugText = '';
  /** qualidade adaptativa: baixa a resolução se o aparelho não segurar ~60 fps */
  private quality = 0;
  private stepMs = 0;
  private renderMs = 0;
  private perfAcc = 0;
  private perfFrames = 0;
  private debugTimer = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: GameHooks,
  ) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.save = loadSave();
    this.debug = /[?&]debug=1/.test(location.search);
    this.renderer.debug = this.debug;
    this.loop = new FixedLoop(
      () => {
        const t0 = performance.now();
        this.fixedStep();
        this.stepMs += (performance.now() - t0 - this.stepMs) * 0.05;
      },
      (a, dt) => {
        const t0 = performance.now();
        this.frame(a, dt);
        this.renderMs += (performance.now() - t0 - this.renderMs) * 0.05;
      },
    );
    this.input.onPause = () => this.hooks.onPause();
    this.input.onFirstGesture = () => this.unlockAudio();
    this.audio.setEnabled(this.save.settings.sound);
    this.hudInfo = {
      mode: 'arcade',
      player: null as unknown as Flyer,
      score: 0,
      combo: 0,
      comboTimer: 0,
      opponents: [],
      aliveOpponents: 0,
      windSpeed: 0,
      windAngle: 0,
      time: 0,
      debug: null,
      battle: null,
      level: null,
      cam: this.camera,
      flyers: [],
      easy: true,
    };
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    this.w = w;
    this.h = h;
    const dpr = Math.min(DPR_LEVELS[this.quality], window.devicePixelRatio || 1);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.renderer.resize(w, h, dpr);
    this.camera.resize(w, h);
    this.input.resize(w);
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0', 10) || 0;
    this.hud.safeTop = safeTop;
    this.hud.layout(w, this.input.reelWidth);
    const pb = this.hud.pauseBtn;
    const mb = this.hud.muteBtn;
    this.input.blockers = [
      { x: pb.x - 6, y: pb.y - 6, w: pb.w + 12, h: pb.h + 12 },
      { x: mb.x - 6, y: mb.y - 6, w: mb.w + 12, h: mb.h + 12 },
    ];
  }

  /** Começa uma fase (1..30) ou o modo Infinito (0) da Batalha no Céu. */
  startLevel(n: number): void {
    const lv = n > 0 ? LEVELS[n - 1] : null;
    this.start('battle', lv ? lv.scene : this.save.settings.scene, n);
  }

  /** Começa uma partida. */
  start(mode: ModeId, sceneId: SceneId, level = 0): void {
    const scene = getScene(sceneId);
    this.scene = scene;
    this.mode = mode;
    const st = this.save.settings;
    const skin = getSkin(st.skin);
    const look = mode === 'sim' || mode === 'arcade' ? { model: st.model, color: st.color, tail: st.tail } : { model: skin.model, color: skin.color, tail: skin.tail, fx: skin.fx };
    if (mode !== 'battle' && skin.fx) (look as { fx?: string }).fx = skin.fx;
    const w = createWorld(scene.world(), mode, look, mode === 'sim' ? st.playerLine : 'comum');
    this.world = w;
    if (mode === 'battle') {
      const ce = getCerol(st.cerol);
      w.flyers[0].lineType = { ...w.flyers[0].lineType, name: ce.name, color: ce.color };
    }
    this.sim = mode === 'sim' ? new SimRules(w, st.opponents, st.difficulty) : null;
    this.levelNum = mode === 'battle' ? level : 0;
    this.level = mode === 'battle' && level > 0 ? LEVELS[level - 1] : null;
    this.battle = null;
    this.battleOutcome = 'playing';
    this.battleReason = '';
    this.easy = createEasyState();
    this.input.mode = st.control;
    if (mode === 'battle') {
      const lv = this.level;
      const mult = 1 + Math.floor(this.totalStars() / 10);
      this.battle = new BattleRules(
        w,
        mult,
        {
          onCut: (pts, combo, coins, x, y) => {
            this.popups.show(combo > 1 ? 'COMBO x' + combo + '!' : 'CORTOU!', '+' + pts + '   +' + coins + ' 🪙', this.w * 0.42, this.h * 0.3, true, 1.8, combo > 1 ? '#ff6bd6' : '#ffd400', combo > 1 ? 44 : 46, 'banner');
            this.fx.burst(PKind.Confetti, x, y, 30, 8, 1.5, Math.floor(Math.random() * 8));
            this.audio.maneuver(combo);
          },
          onWave: (wave, bonus) => {
            this.popups.show('ONDA ' + wave + '!', '+' + bonus + ' de bônus', this.w * 0.42, this.h * 0.4, true, 2.4, '#7dff5a', 44, 'banner');
            this.audio.victory();
          },
          onSpawn: () => {},
        },
        lv
          ? { fixedWave: lv.wave, concurrent: lv.concurrent, boss: lv.goal === 'boss', cerol: getCerol(st.cerol).power }
          : { cerol: getCerol(st.cerol).power },
      );
    }
    this.ended = false;
    this.endDelay = 0;
    this.snaps = w.flyers.map(() => createSnapshot(PHYSICS.lineNodes));
    this.oppList = w.flyers.slice(1);
    for (let i = 0; i < w.flyers.length; i++) takeSnapshot(this.snaps[i], w.flyers[i]);
    this.renderer.setScene(scene.art());
    this.fx.clear();
    this.popups.clear();
    this.tracker.reset(w.flyers[0]);
    this.playTime = 0;
    this.slowmo = 0;
    this.flash = 0;
    this.input.reset();
    this.frameCamera(true);
    this.paused = false;
    this.attract = false;
    this.input.enabled = true;
    this.loop.timeScale = 1;
    this.loop.start();
  }

  /** Fundo animado do menu. */
  startAttract(sceneId: SceneId): void {
    this.start('arcade', sceneId);
    this.paused = true;
    this.attract = true;
    this.input.enabled = false;
  }

  pause(): void {
    this.paused = true;
    this.input.enabled = false;
    this.input.reset();
  }

  resume(): void {
    this.paused = false;
    this.input.enabled = true;
  }

  /** Sai da partida e devolve o resumo. */
  finish(): GameResult {
    const w = this.world;
    const scene = this.scene;
    this.paused = true;
    this.input.enabled = false;
    const simRes = this.sim ? this.sim.result() : null;
    const score = simRes ? simRes.score : this.tracker.score;
    const st = this.save.settings;
    const r: GameResult = {
      mode: this.mode,
      scene: scene ? scene.id : 'varzea',
      score,
      stars: this.tracker.stars(),
      best: false,
      maxHeight: this.tracker.maxHeight,
      loops: this.tracker.counts.loop,
      bestCombo: this.tracker.bestCombo,
      time: this.playTime,
      sim: simRes,
      difficulty: st.difficulty,
      unlocked: null,
      battle: this.battle ? this.battleResult() : null,
    };
    if (this.battle) return r;
    if (w && scene && score > 0) r.best = recordBest(this.save, this.mode, scene.id, score);
    // vitórias liberam linhas melhores
    if (simRes && simRes.outcome === 'win') {
      const unlock: LineTypeId | null = st.difficulty === 'media' ? 'afiada' : st.difficulty === 'brava' ? 'super' : null;
      if (unlock && !st.unlocked.includes(unlock)) {
        st.unlocked.push(unlock);
        r.unlocked = unlock;
        writeSave(this.save);
      }
    }
    return r;
  }

  totalStars(): number {
    let s = 0;
    for (const n of this.save.profile.stars) s += n || 0;
    return s;
  }

  /** Fecha a fase: estrelas, moedas e recorde vão para o perfil. */
  private battleResult(): BattleResult {
    const b = this.battle as BattleRules;
    const lv = this.level;
    const prof = this.save.profile;
    const st = b.stats;
    const success = this.battleOutcome === 'win';
    const prevStars = lv ? prof.stars[lv.n - 1] ?? 0 : 0;
    let stars = 0;
    let nearMiss = '';
    if (lv) {
      if (success) stars = starsFor(lv, st.time, b.maxDamage, st.cuts);
      else if (lv.goal === 'cut') {
        const left = lv.target - st.cuts;
        if (left > 0) nearMiss = left === 1 ? 'Faltou só 1 pipa!' : 'Faltaram ' + left + ' pipas';
      } else if (lv.goal === 'survive') {
        const left = Math.ceil(lv.target - st.time);
        if (left > 0) nearMiss = 'Faltaram só ' + left + ' s!';
      } else if (lv.goal === 'combo') nearMiss = 'Seu melhor combo: x' + Math.max(1, st.bestCombo);
      else if (lv.goal === 'boss') nearMiss = 'O Rei do Céu ainda manda...';
    }
    // moedas da partida + bônus por estrela nova
    let coins = st.coins;
    if (lv && stars > prevStars) coins += (stars - prevStars) * 10;
    if (lv && success && prevStars === 0) coins += 10 + lv.n * 2;
    prof.coins += coins;
    if (lv && stars > prevStars) prof.stars[lv.n - 1] = stars;
    let newBest = false;
    if (!lv && st.score > prof.bestEndless) {
      prof.bestEndless = st.score;
      newBest = true;
    }
    writeSave(this.save);
    return {
      level: lv ? lv.n : 0,
      success,
      stars,
      prevStars,
      score: st.score,
      cuts: st.cuts,
      wave: st.wave,
      bestCombo: st.bestCombo,
      coins,
      reason: this.battleReason,
      nearMiss,
      newBest,
    };
  }

  /** Confere o objetivo da fase. */
  private judgeLevel(): void {
    const b = this.battle;
    const lv = this.level;
    if (!b || this.battleOutcome !== 'playing') return;
    const st = b.stats;
    const p = this.world?.flyers[0];
    let end: 'win' | 'lose' | null = null;
    if (p && !isAlive(p)) {
      end = 'lose';
      this.battleReason = p.status === 'cut' ? 'Sua linha foi cortada.' : 'Você perdeu a pipa.';
    } else if (lv) {
      if (lv.goal === 'cut' && st.cuts >= lv.target) end = 'win';
      else if (lv.goal === 'combo' && st.bestCombo >= lv.target) end = 'win';
      else if (lv.goal === 'boss' && b.bossDown) end = 'win';
      else if (lv.goal === 'survive' && st.time >= lv.target) end = 'win';
      else if (lv.time > 0 && lv.goal !== 'survive' && st.time >= lv.time) {
        end = 'lose';
        this.battleReason = 'O tempo acabou.';
      }
      if (end === 'win') this.battleReason = goalText(lv) + ' ✔';
    }
    if (!end) return;
    this.battleOutcome = end;
    st.over = true;
    this.ended = true;
    this.endDelay = end === 'win' ? 1.6 : 2.6;
    if (end === 'win') {
      this.audio.victory();
      this.popups.show('FASE COMPLETA!', '', this.w * 0.42, this.h * 0.32, true, 2.2, '#7dff5a', 40, 'banner');
      this.fx.burst(PKind.Confetti, p ? p.kite.x : 0, p ? p.kite.y : 0, 60, 12, 2, 3);
    } else {
      this.audio.defeat();
      if (this.battleReason === 'O tempo acabou.') this.popups.show('TEMPO!', '', this.w * 0.42, this.h * 0.32, true, 2.2, '#ff6b6b', 44, 'banner');
    }
  }

  unlockAudio(): void {
    this.audio.unlock();
    this.audio.setEnabled(this.save.settings.sound);
  }

  setSound(on: boolean): void {
    this.save.settings.sound = on;
    writeSave(this.save);
    this.audio.setEnabled(on);
  }

  vibrate(ms: number | number[]): void {
    if (!this.save.settings.vibration) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* sem suporte */
    }
  }

  private fixedStep(): void {
    const w = this.world;
    if (!w || (this.paused && !this.attract)) return;
    const p = w.flyers[0];
    if (this.attract) {
      // voo de demonstração no menu: curvas suaves e altura constante
      const t = w.time;
      p.ctrl.steer = Math.sin(t * 0.45) * 0.45 + Math.sin(t * 1.3) * 0.15;
      p.ctrl.handX = 0;
      p.ctrl.handY = 0;
      p.ctrl.reel = p.reel.out < 45 ? 0.25 : 0;
      for (let i = 0; i < w.flyers.length; i++) takeSnapshot(this.snaps[i], w.flyers[i]);
      stepWorld(w);
      w.events.clear();
      return;
    }
    this.input.update(PHYSICS.dt);
    const c = this.input.state;
    const jerk = this.input.takeJerk();
    if (this.input.mode === 'easy') {
      // um dedo: a pipa vai até onde o dedo está (o carretel se ajusta sozinho)
      const sk = this.input.sky;
      let tx = p.kite.x;
      let ty = p.kite.y;
      let on = sk.active;
      if (on) {
        tx = this.camera.toWorldX(sk.x);
        ty = this.camera.toWorldY(sk.y);
      } else if (c.joy) {
        // teclado: empurra o alvo na direção das setas
        tx = p.kite.x + c.joyX * 0.15;
        ty = p.kite.y + c.joyY * 0.15;
        on = true;
      }
      if (this.battle && this.battle.duel) {
        // linhas enganchadas: a pipa fica presa no duelo, o dedo vira serra
        easyControl(p, true, this.battle.holdX, this.battle.holdY, false, this.easy, PHYSICS.dt);
      } else easyControl(p, on, tx, ty, jerk, this.easy, PHYSICS.dt);
    } else {
      p.ctrl.steer = c.steer;
      p.ctrl.handX = c.handX;
      p.ctrl.handY = c.handY;
      p.ctrl.reel = c.reel;
      p.ctrl.assist = 0;
      if (jerk) p.ctrl.jerk = true;
    }
    if (jerk && this.battle) {
      this.battle.jerk();
      this.fx.burst(PKind.Spark, p.kite.x, p.kite.y, 10, 6, 0.4, 0);
    }

    if (this.sim) this.sim.think(PHYSICS.dt);
    if (this.battle) this.battle.think(PHYSICS.dt);
    for (let i = 0; i < w.flyers.length; i++) takeSnapshot(this.snaps[i], w.flyers[i]);
    stepWorld(w);
    this.playTime += PHYSICS.dt;
    this.handleEvents(w);
    if (this.battle) {
      const wasDuel = this.battle.duel;
      this.battle.step(PHYSICS.dt, this.input.mode === 'easy' ? this.input.rub : Math.abs(p.reel.rate) * 60);
      if (this.battle.duel && !wasDuel) {
        this.popups.show('SERRA!', 'Esfregue o dedo ↕ rápido!', this.w * 0.42, this.h * 0.24, true, 1.4, '#ffd400', 46, 'banner');
        this.vibrate([30, 30, 30]);
        this.camera.shake(5);
      }
      if (this.battle.duel) {
        this.duelBuzz -= PHYSICS.dt;
        if (this.duelBuzz <= 0) {
          this.duelBuzz = 0.12;
          this.vibrate(12);
          this.camera.shake(1.5 + this.battle.playerSaw * 2);
        }
      }
      this.judgeLevel();
      if (this.ended) {
        this.endDelay -= PHYSICS.dt;
        if (this.endDelay <= 0) {
          this.ended = false;
          this.hooks.onExit(this.finish());
          return;
        }
      }
    }
    if (this.sim) {
      if (this.sim.judge(PHYSICS.dt)) {
        this.ended = true;
        this.endDelay = this.sim.outcome === 'win' ? 2.2 : 3;
        const win = this.sim.outcome === 'win';
        if (win) this.audio.victory();
        else this.audio.defeat();
        this.popups.show(win ? 'VITÓRIA!' : 'FIM DE JOGO', this.sim.reason, this.w * 0.42, this.h * 0.3, true, 3, win ? '#7dff5a' : '#ff6b6b', 40, 'banner');
      }
      if (this.ended) {
        this.endDelay -= PHYSICS.dt;
        if (this.endDelay <= 0) {
          this.ended = false;
          this.hooks.onExit(this.finish());
          return;
        }
      }
    }

    if (this.mode === 'arcade') {
      const hit = this.tracker.update(p, w.scene.ground(p.kite.x), PHYSICS.dt);
      if (hit) {
        const m = MANEUVERS[hit.id];
        const sub = hit.combo > 1 ? '+' + hit.points + '  COMBO x' + hit.combo : '+' + hit.points + (hit.sub ? '  ' + hit.sub : '');
        this.popups.show(m.name, sub, this.w * 0.42, this.h * 0.34, true, 1.6, m.color, 38, 'pop');
        this.fx.burst(PKind.Confetti, p.kite.x, p.kite.y, 26, 7, 1.4, Math.floor(Math.random() * 8));
        this.vibrate(18);
        this.audio.maneuver(hit.combo);
      }
    }

    // tensão no vermelho: vibra (com intervalo)
    if (this.redBuzz > 0) this.redBuzz -= PHYSICS.dt;
    if (isAlive(p) && p.tension01 > TENSION.red && this.redBuzz <= 0) {
      this.vibrate(35);
      this.redBuzz = 0.35;
    }
    // rajada forte treme a câmera
    if (p.windGust > 0.85) this.camera.shake(1.2 + p.windGust);

    this.fx.update(PHYSICS.dt, p.windX);
  }

  private handleEvents(w: World): void {
    const ev = w.events;
    const W = this.w;
    const H = this.h;
    for (let i = 0; i < ev.count; i++) {
      const e = ev.items[i];
      const f = w.flyers[e.flyer];
      switch (e.type) {
        case 'bounce':
          if (f.isPlayer) {
            this.popups.show('Eita!', '', e.x, e.y + 1.5, false, 1.1, '#fff', 20, 'balloon');
            this.camera.shake(3);
            this.vibrate(25);
          }
          this.fx.burst(PKind.Confetti, e.x, e.y, 6, 2, 0.6, 2);
          if (f.isPlayer) this.audio.bump();
          break;
        case 'spark':
          this.fx.burst(PKind.Spark, e.x, e.y, 2 + Math.round(e.value * 5), 6 + e.value * 6, 0.35, Math.floor(Math.random() * 3));
          if (this.scrapeCooldown <= 0) {
            this.audio.scrape(e.value);
            this.scrapeCooldown = 0.07;
          }
          break;
        case 'cut': {
          const mine = f.isPlayer;
          const byMe = e.other === 0;
          this.fx.burst(PKind.Spark, e.x, e.y, 40, 14, 0.7, 0);
          this.fx.burst(PKind.Spark, e.x, e.y, 20, 8, 0.9, 1);
          this.audio.snapCut();
          this.slowmo = SLOWMO.duration;
          this.loop.timeScale = SLOWMO.scale;
          this.camera.shake(9);
          this.flash = 0.5;
          this.vibrate(mine ? [90, 40, 140] : [60, 30, 60]);
          if (this.battle && !mine) {
            this.battle.enemyDown(f, byMe);
            break;
          }
          if (mine) this.popups.show('FOI CORTADO!', 'Sua pipa foi embora...', W * 0.42, H * 0.3, true, 2.4, '#ff6b6b', 40, 'banner');
          else if (byMe) {
            const left = this.sim ? this.sim.aliveOpponents() : 0;
            this.popups.show('CORTOU!', left > 0 ? 'Faltam ' + left : 'Céu limpo!', W * 0.42, H * 0.3, true, 2.2, '#ffd400', 46, 'banner');
          }
          break;
        }
        case 'snap':
          this.audio.snapBreak();
          this.fx.burst(PKind.Spark, e.x, e.y, 10, 5, 0.4, 2);
          this.camera.shake(6);
          if (f.isPlayer) {
            this.vibrate([80, 40, 80]);
            this.popups.show('ARREBENTOU!', 'Tensão demais na linha', W * 0.42, H * 0.3, true, 2.2, '#ff6b6b', 38, 'banner');
          } else this.popups.show('Arrebentou!', '', e.x, e.y, false, 1.4, '#ffd400', 22, 'pop');
          break;
        case 'burn':
          this.audio.shock();
          this.fx.burst(PKind.Zap, e.x, e.y, 30, 12, 0.5, 0);
          for (let k = 0; k < 12; k++) this.fx.spawn(PKind.Smoke, e.x, e.y, (Math.random() - 0.5) * 2, Math.random() * 2, 1.6 + Math.random());
          this.camera.shake(8);
          this.flash = 0.35;
          if (f.isPlayer) {
            this.vibrate([40, 30, 40, 30, 120]);
            this.popups.show('QUEIMOU NO FIO!', 'Fio de luz não perdoa', W * 0.42, H * 0.3, true, 2.4, '#9ff3ff', 36, 'banner');
          } else this.popups.show('Queimou!', '', e.x, e.y, false, 1.4, '#9ff3ff', 22, 'pop');
          break;
        case 'tear':
          this.audio.tear();
          this.fx.burst(PKind.Shred, e.x, e.y, 24, 5, 1.4, 4);
          this.camera.shake(6);
          if (f.isPlayer) {
            this.vibrate([70, 30, 70]);
            this.popups.show('RASGOU!', 'Bateu forte demais', W * 0.42, H * 0.3, true, 2.2, '#ff8a00', 38, 'banner');
          }
          break;
        case 'snag':
          if (f.isPlayer) {
            this.audio.bump();
            this.vibrate(40);
            this.popups.show('ENROSCOU!', 'Puxe a linha por 3 s', W * 0.42, H * 0.34, true, 2.2, '#ffd400', 30, 'banner');
          }
          break;
        case 'freed':
          if (f.isPlayer) this.popups.show('Soltou!', '', e.x, e.y + 1, false, 1.2, '#fff', 18, 'balloon');
          break;
        default:
          break;
      }
    }
    ev.clear();
  }

  private frameCamera(snap: boolean): void {
    const w = this.world;
    if (!w) return;
    const cam = this.camera;
    const p = w.flyers[0];
    cam.beginFrame();
    cam.include(p.baseX, p.baseY, 6);
    cam.include(p.kite.x, p.kite.y, 7);
    for (let i = 1; i < w.flyers.length; i++) {
      const o = w.flyers[i];
      if (o.status === 'landed' || o.hidden) continue;
      // adversários visíveis, mas sem afastar demais
      if (Math.abs(o.kite.x - p.kite.x) < 160) cam.include(o.kite.x, o.kite.y, 5);
    }
    cam.solve(w.scene.ground(p.baseX));
    if (snap) cam.snap();
  }

  private frame(alpha: number, realDt: number): void {
    const w = this.world;
    if (!w) return;
    if (this.slowmo > 0) {
      this.slowmo -= realDt;
      this.loop.timeScale = this.slowmo > 0 ? SLOWMO.scale : 1;
    }
    if (this.flash > 0) this.flash -= realDt * 2.5;
    if (this.scrapeCooldown > 0) this.scrapeCooldown -= realDt;
    if (!this.paused && !this.attract) {
      this.perfAcc += realDt;
      this.perfFrames++;
      if (this.perfAcc > 3) {
        const fps = this.perfFrames / this.perfAcc;
        this.perfAcc = 0;
        this.perfFrames = 0;
        if (fps < 48 && this.quality < DPR_LEVELS.length - 1 && DPR_LEVELS[this.quality] > 1 && (window.devicePixelRatio || 1) > 1) {
          this.quality++;
          this.resize();
        }
      }
    }
    {
      const p0 = w.flyers[0];
      const af = this.audioFrame;
      const live = !this.paused && !this.attract && isAlive(p0);
      af.active = !this.paused && !this.attract;
      af.wind = Math.hypot(p0.windX, p0.windZ);
      af.airspeed = live ? p0.airspeed : 0;
      af.tension = live ? p0.tension01 : 0;
      af.reel = live ? p0.reel.rate : 0;
      af.red = live && p0.tension01 > TENSION.red;
      this.audio.update(af);
    }
    this.frameCamera(false);
    this.camera.update(realDt);
    if (!this.paused) this.popups.update(realDt);
    const ctx = this.renderer.ctx;
    const live = !this.paused || this.attract;
    this.renderer.render(this.camera, w.flyers, this.snaps, live ? alpha : 1, this.fx, this.popups, w.scene.hazards, live ? realDt : 0, this.flash);
    if (this.attract) return;

    // HUD
    const p = w.flyers[0];
    const info = this.hudInfo;
    info.mode = this.mode;
    info.player = p;
    info.score = this.tracker.score;
    info.combo = this.tracker.combo;
    info.comboTimer = this.tracker.comboTimer;
    info.windSpeed = Math.hypot(p.windX, p.windZ);
    info.windAngle = Math.atan2(p.windX, p.windZ);
    info.time = this.playTime;
    if (this.sim) {
      info.opponents = this.oppList;
      info.aliveOpponents = this.sim.aliveOpponents();
    }
    info.battle = this.battle;
    info.level = this.level;
    info.cam = this.camera;
    info.flyers = w.flyers;
    info.easy = this.input.mode === 'easy';
    info.debug = null;
    this.hud.muted = !this.save.settings.sound;
    if (this.debug) {
      this.debugTimer -= realDt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 0.2;
        this.debugText = this.makeDebugText(w);
      }
      info.debug = this.debugText;
    }
    ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
    this.hud.draw(ctx, this.w, this.h, this.input, info);
    this.renderer.drawPopups(this.popups, this.camera, true);
  }

  private makeDebugText(w: World): string {
    const p = w.flyers[0];
    const k = p.kite;
    const lines = [
      'fps ' + this.loop.fps.toFixed(0) + '  dpr ' + this.renderer.dpr.toFixed(2) + '  física ' + this.stepMs.toFixed(2) + ' ms  render ' + this.renderMs.toFixed(2) + ' ms',
      'tensão ' + p.tension.toFixed(1) + ' N (' + p.tension01.toFixed(2) + ')',
      'vento ' + p.windX.toFixed(1) + ', ' + p.windY.toFixed(1) + ', ' + p.windZ.toFixed(1) + '  raj ' + p.windGust.toFixed(2),
      'pipa ' + k.x.toFixed(1) + ', ' + k.y.toFixed(1) + ', z ' + k.z.toFixed(1),
      'vel ' + Math.hypot(k.vx, k.vy, k.vz).toFixed(1) + '  α ' + ((p.alpha * 180) / Math.PI).toFixed(0) + '°',
      'linha ' + p.reel.out.toFixed(1) + ' m  carretel ' + p.reel.rate.toFixed(1) + ' m/s',
      'status ' + p.status + '  estoque ' + (p.reel.stock - p.reel.out).toFixed(0) + ' m',
    ];
    const cutSys = this.sim ? this.sim.cuts : this.battle ? this.battle.cuts : null;
    if (cutSys) {
      const cs = cutSys.crossings;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (!c.active) continue;
        lines.push(
          'cruz ' + c.a + '×' + c.b + ' desl ' + c.slide.toFixed(1) + ' m/s  dano ' + c.dmgA.toFixed(2) + '/' + c.dmgB.toFixed(2) + '  taxa ' + c.rateA.toFixed(2) + '/' + c.rateB.toFixed(2),
        );
      }
    }
    if (this.sim) {
      for (let i = 0; i < this.sim.ais.length; i++) lines.push('IA ' + w.flyers[i + 1].name + ': ' + this.sim.ais[i].state + '  T ' + w.flyers[i + 1].tension01.toFixed(2));
    }
    return lines.join('\n');
  }
}
