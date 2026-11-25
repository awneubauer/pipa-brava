import { REEL } from '../config';
import { clamp } from '../util/noise';

/** Estado de controle produzido pelo toque/mouse/teclado. */
export interface ControlState {
  steer: number;
  handX: number;
  handY: number;
  reel: number;
  jerk: boolean;
}

interface TouchTrack {
  id: number;
  zone: 'sky' | 'reel';
  sx: number;
  sy: number;
  x: number;
  y: number;
  lastY: number;
  lastT: number;
  vy: number;
  /** posição no último update (para a velocidade do dedo no carretel) */
  prevY: number;
  /** velocidade suavizada do dedo (px/s) */
  spd: number;
}

const SKY_STEER_PX = 78;
const SKY_PULL_PX = 105;
const JERK_SPEED = 1300; // px/s para baixo
const MAX_TRACKS = 6;

/**
 * Entrada unificada. Céu: arrastar desloca o cabresto (lado) e puxa/dá linha (vertical);
 * arrasto rápido para baixo = puxão. Faixa direita = carretel (baixo solta, cima recolhe).
 * Desktop: mouse no céu, W/S ou roda = carretel, espaço = puxão, A/D = curva.
 */
export class Input {
  readonly state: ControlState = { steer: 0, handX: 0, handY: 0, reel: 0, jerk: false };
  /** largura da faixa do carretel (px CSS) */
  reelWidth = 80;
  enabled = true;
  /** retângulos que não contam como céu (botões do HUD) */
  blockers: { x: number; y: number; w: number; h: number }[] = [];
  /** chamado no primeiro gesto do usuário (para destravar o áudio) */
  onFirstGesture: (() => void) | null = null;
  onPause: (() => void) | null = null;
  /** para desenhar o "joystick" na tela */
  readonly sky = { active: false, sx: 0, sy: 0, x: 0, y: 0 };
  readonly reelTouch = { active: false, sy: 0, y: 0 };
  /** estatísticas para o tutorial */
  usedPull = 0;
  usedReel = 0;
  usedSteer = 0;

  private tracks: TouchTrack[] = [];
  private keys = new Set<string>();
  /** giro livre da lata depois de soltar o dedo [0..1] */
  private spool = 0;
  private reelCmd = 0;
  private wheel = 0;
  private jerkCooldown = 0;
  private w = 400;

  constructor(private el: HTMLElement) {
    for (let i = 0; i < MAX_TRACKS; i++)
      this.tracks.push({ id: -1, zone: 'sky', sx: 0, sy: 0, x: 0, y: 0, lastY: 0, lastT: 0, vy: 0, prevY: 0, spd: 0 });
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', () => this.reset());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize(w: number): void {
    this.w = w;
    this.reelWidth = clamp(Math.round(w * 0.19), 64, 104);
  }

  reset(): void {
    for (const t of this.tracks) t.id = -1;
    this.keys.clear();
    this.sky.active = false;
    this.reelTouch.active = false;
    this.wheel = 0;
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private findTrack(id: number): TouchTrack | null {
    for (const t of this.tracks) if (t.id === id) return t;
    return null;
  }

  private down = (e: PointerEvent): void => {
    this.gesture();
    if (!this.enabled) return;
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    for (const b of this.blockers) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return;
    const t = this.findTrack(-1);
    if (!t) return;
    t.id = e.pointerId;
    t.zone = x > this.w - this.reelWidth ? 'reel' : 'sky';
    // só uma mão em cada zona
    for (const o of this.tracks) if (o !== t && o.id !== -1 && o.zone === t.zone) o.id = -1;
    t.sx = t.x = x;
    t.sy = t.y = y;
    t.lastY = y;
    t.lastT = performance.now();
    t.vy = 0;
    t.prevY = y;
    t.spd = 0;
    // encostar na lata trava a linha
    if (t.zone === 'reel') this.spool = 0;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* alguns navegadores não suportam */
    }
  };

  private move = (e: PointerEvent): void => {
    const t = this.findTrack(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const now = performance.now();
    const dtm = Math.max(1, now - t.lastT);
    const inst = ((e.clientY - t.lastY) / dtm) * 1000;
    t.vy = t.vy * 0.5 + inst * 0.5;
    t.lastY = e.clientY;
    t.lastT = now;
    t.x = e.clientX;
    t.y = e.clientY;
  };

  private up = (e: PointerEvent): void => {
    const t = this.findTrack(e.pointerId);
    if (!t) return;
    // largou a lata girando para soltar: ela continua girando (a pipa puxa a linha)
    if (t.zone === 'reel' && this.reelCmd > 0.08) this.spool = this.reelCmd;
    t.id = -1;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.gesture();
    // roda para baixo = soltar (gira a lata), para cima = recolher
    this.wheel = clamp(this.wheel + e.deltaY * 0.004, -1, 1);
  };

  private keyDown = (e: KeyboardEvent): void => {
    this.gesture();
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      this.onPause?.();
      return;
    }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === ' ' && !this.keys.has(' ')) this.requestJerk();
    this.keys.add(k);
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private requestJerk(): void {
    if (this.jerkCooldown > 0) return;
    this.state.jerk = true;
    this.jerkCooldown = 0.35;
    this.usedPull += 1;
  }

  /** Atualiza `state` (chamar a cada quadro). */
  update(dt: number): void {
    const s = this.state;
    if (this.jerkCooldown > 0) this.jerkCooldown -= dt;
    let steer = 0;
    let handX = 0;
    let handY = 0;
    let reel = 0;
    this.sky.active = false;
    this.reelTouch.active = false;
    if (this.enabled) {
      for (let ti = 0; ti < this.tracks.length; ti++) {
        const t = this.tracks[ti];
        if (t.id === -1) continue;
        if (t.zone === 'sky') {
          const dx = t.x - t.sx;
          const dy = t.y - t.sy;
          steer = clamp(dx / SKY_STEER_PX, -1, 1);
          handX = steer * 0.6;
          // arrastar para cima/baixo não puxa mais; só o arrasto rápido para baixo dá o puxão
          void SKY_PULL_PX;
          if (t.vy > JERK_SPEED && dy > 18) {
            this.requestJerk();
            t.vy = 0;
          }
          this.sky.active = true;
          this.sky.sx = t.sx;
          this.sky.sy = t.sy;
          this.sky.x = t.x;
          this.sky.y = t.y;
          if (Math.abs(steer) > 0.3) this.usedSteer += dt;
          if (Math.abs(steer) > 0.3) this.usedPull += dt * 0.5;
        } else {
          // lata: a linha corre na velocidade do dedo (baixo solta, cima recolhe)
          const fy = dt > 0 ? (t.y - t.prevY) / dt : 0;
          t.prevY = t.y;
          t.spd += (fy - t.spd) * 0.55;
          const ms = t.spd * REEL.metersPerPx;
          reel = ms > 0 ? ms / REEL.maxRelease : ms / REEL.maxRetrieve;
          if (Math.abs(t.spd) < REEL.deadZonePx) reel = 0;
          reel = clamp(reel, -1, 1);
          this.reelTouch.active = true;
          this.reelTouch.sy = t.sy;
          this.reelTouch.y = t.y;
          if (reel > 0.05) this.usedReel += dt;
          // deslizada rápida para cima = puxão
          if (t.spd < -REEL.jerkPx) this.requestJerk();
        }
      }
      if (!this.reelTouch.active && this.spool > 0) {
        reel = this.spool;
        this.spool *= Math.exp(-dt / REEL.spoolDecay);
        if (this.spool < 0.03) this.spool = 0;
      }
      this.reelCmd = reel;
      // teclado
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) steer = -1;
      if (k.has('d') || k.has('arrowright')) steer = 1;
      if (k.has('a') || k.has('d') || k.has('arrowleft') || k.has('arrowright')) {
        handX = steer * 0.6;
        this.usedSteer += dt;
      }
      if (k.has('s') || k.has('arrowdown')) {
        reel = 0.5;
        this.usedReel += dt;
      }
      if (k.has('w') || k.has('arrowup')) reel = -0.6;
      if (Math.abs(this.wheel) > 0.02) {
        reel = clamp(reel + this.wheel, -1, 1);
        if (this.wheel > 0.1) this.usedReel += dt;
        this.wheel *= Math.exp(-dt * 3);
      } else this.wheel = 0;
    }
    s.steer = steer;
    s.handX = handX;
    s.handY = handY;
    s.reel = reel;
  }

  /** consome o pedido de puxão */
  takeJerk(): boolean {
    const j = this.state.jerk;
    this.state.jerk = false;
    return j;
  }
}
