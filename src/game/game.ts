import { PHYSICS, SLOWMO, TENSION, type ModeId } from '../config';
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
import { loadSave, recordBest, type SaveData } from './state';

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
}

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
  readonly loop: FixedLoop;
  save: SaveData;
  world: World | null = null;
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
      () => this.fixedStep(),
      (a, dt) => this.frame(a, dt),
    );
    this.input.onPause = () => this.hooks.onPause();
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.renderer.resize(w, h, dpr);
    this.camera.resize(w, h);
    this.input.resize(w);
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0', 10) || 0;
    this.hud.safeTop = safeTop;
    this.hud.layout(w, this.input.reelWidth);
    const pb = this.hud.pauseBtn;
    this.input.blockers = [{ x: pb.x - 6, y: pb.y - 6, w: pb.w + 12, h: pb.h + 12 }];
  }

  /** Começa uma partida. */
  start(mode: ModeId, sceneId: SceneId): void {
    const scene = getScene(sceneId);
    this.scene = scene;
    this.mode = mode;
    const st = this.save.settings;
    const w = createWorld(scene.world(), mode, { model: st.model, color: st.color, tail: st.tail }, st.playerLine);
    this.world = w;
    this.snaps = w.flyers.map(() => createSnapshot(PHYSICS.lineNodes));
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
    const score = this.tracker.score;
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
    };
    if (w && scene) r.best = recordBest(this.save, this.mode, scene.id, score);
    return r;
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
    p.ctrl.steer = c.steer;
    p.ctrl.handX = c.handX;
    p.ctrl.handY = c.handY;
    p.ctrl.reel = c.reel;
    if (this.input.takeJerk()) p.ctrl.jerk = true;

    for (let i = 0; i < w.flyers.length; i++) takeSnapshot(this.snaps[i], w.flyers[i]);
    stepWorld(w);
    this.playTime += PHYSICS.dt;
    this.handleEvents(w);

    if (this.mode === 'arcade') {
      const hit = this.tracker.update(p, w.scene.ground(p.kite.x), PHYSICS.dt);
      if (hit) {
        const m = MANEUVERS[hit.id];
        const sub = hit.combo > 1 ? '+' + hit.points + '  COMBO x' + hit.combo : '+' + hit.points + (hit.sub ? '  ' + hit.sub : '');
        this.popups.show(m.name, sub, this.w * 0.42, this.h * 0.34, true, 1.6, m.color, 38, 'pop');
        this.fx.burst(PKind.Confetti, p.kite.x, p.kite.y, 26, 7, 1.4, Math.floor(Math.random() * 8));
        this.vibrate(18);
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
      if (o.status === 'landed') continue;
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
    info.debug = null;
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
      'fps ' + this.loop.fps.toFixed(0) + '  t ' + w.time.toFixed(1),
      'tensão ' + p.tension.toFixed(1) + ' N (' + p.tension01.toFixed(2) + ')',
      'vento ' + p.windX.toFixed(1) + ', ' + p.windY.toFixed(1) + ', ' + p.windZ.toFixed(1) + '  raj ' + p.windGust.toFixed(2),
      'pipa ' + k.x.toFixed(1) + ', ' + k.y.toFixed(1) + ', z ' + k.z.toFixed(1),
      'vel ' + Math.hypot(k.vx, k.vy, k.vz).toFixed(1) + '  α ' + ((p.alpha * 180) / Math.PI).toFixed(0) + '°',
      'linha ' + p.reel.out.toFixed(1) + ' m  carretel ' + p.reel.rate.toFixed(1) + ' m/s',
      'status ' + p.status,
    ];
    return lines.join('\n');
  }
}
