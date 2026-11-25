import { REEL } from '../config';
import { clamp } from '../util/noise';

/** Estado de controle produzido pelo toque/mouse/teclado. */
export interface ControlState {
  steer: number;
  handX: number;
  handY: number;
  reel: number;
  jerk: boolean;
  /** modo fácil: vetor do "joystick" (px, y para cima) e se está ativo */
  joyX: number;
  joyY: number;
  joy: boolean;
}

interface TouchTrack {
  id: number;
  zone: 'sky' | 'reel' | 'action';
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
  prevX: number;
  /** início do toque (ms), para detectar o toque rápido */
  t0: number;
  moved: number;
}

const SKY_STEER_PX = 78;
const SKY_PULL_PX = 105;
const JERK_SPEED = 1300; // px/s para baixo
const MAX_TRACKS = 6;
/** curso do joystick (px) */
export const JOY_MAX = 64;

/**
 * Entrada unificada. Céu: arrastar desloca o cabresto (lado) e puxa/dá linha (vertical);
 * arrasto rápido para baixo = puxão. Faixa direita = carretel (baixo solta, cima recolhe).
 * Desktop: mouse no céu, W/S ou roda = carretel, espaço = puxão, A/D = curva.
 */
export class Input {
  readonly state: ControlState = { steer: 0, handX: 0, handY: 0, reel: 0, jerk: false, joyX: 0, joyY: 0, joy: false };
  /** 'easy': um dedo guia a pipa (joystick no céu, toque = puxão); 'pro': cabresto + lata */
  mode: 'easy' | 'pro' = 'easy';
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
  /** modo fácil: botão de ação (px CSS) e se está pressionado */
  readonly actionBtn = { x: 0, y: 0, r: 46, down: false };

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
      this.tracks.push({ id: -1, zone: 'sky', sx: 0, sy: 0, x: 0, y: 0, lastY: 0, lastT: 0, vy: 0, prevY: 0, spd: 0, t0: 0, moved: 0, prevX: 0 });
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

  /** posiciona o botão PUXA! (chamar no resize) */
  layoutAction(w: number, h: number, bottomInset: number): void {
    this.actionBtn.r = Math.max(40, Math.min(54, w * 0.12));
    this.actionBtn.x = w - this.actionBtn.r - 22;
    this.actionBtn.y = h - this.actionBtn.r - 34 - bottomInset;
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
    t.zone = this.mode === 'pro' && x > this.w - this.reelWidth ? 'reel' : 'sky';
    // modo fácil: botão PUXA! no canto inferior direito
    if (this.mode === 'easy' && Math.hypot(x - this.actionBtn.x, y - this.actionBtn.y) < this.actionBtn.r + 16) {
      t.zone = 'action';
      this.state.jerk = true;
      this.usedPull += 1;
    }
    t.t0 = performance.now();
    t.moved = 0;
    // só uma mão em cada zona
    for (const o of this.tracks) if (o !== t && o.id !== -1 && o.zone === t.zone) o.id = -1;
    t.sx = t.x = x;
    t.sy = t.y = y;
    t.lastY = y;
    t.lastT = performance.now();
    t.vy = 0;
    t.prevY = y;
    t.prevX = x;
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
    const m = Math.hypot(t.x - t.sx, t.y - t.sy);
    if (m > t.moved) t.moved = m;
  };

  private up = (e: PointerEvent): void => {
    const t = this.findTrack(e.pointerId);
    if (!t) return;
    // largou a lata girando para soltar: ela continua girando (a pipa puxa a linha)
    if (t.zone === 'reel' && this.reelCmd > 0.08) this.spool = this.reelCmd;
    // modo fácil: toque rápido = puxão
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
    let joy = false;
    this.sky.active = false;
    this.actionBtn.down = false;
    this.reelTouch.active = false;
    if (this.enabled) {
      for (let ti = 0; ti < this.tracks.length; ti++) {
        const t = this.tracks[ti];
        if (t.id === -1) continue;
        if (t.zone === 'action') {
          this.actionBtn.down = true;
          continue;
        }
        if (t.zone === 'sky' && this.mode === 'easy') {
          // joystick flutuante: nasce onde o polegar encosta
          let jx = t.x - t.sx;
          let jy = -(t.y - t.sy);
          const m = Math.hypot(jx, jy);
          if (m > JOY_MAX) {
            jx = (jx / m) * JOY_MAX;
            jy = (jy / m) * JOY_MAX;
          }
          s.joyX = jx;
          s.joyY = jy;
          joy = m > 8;
          this.sky.active = true;
          this.sky.sx = t.sx;
          this.sky.sy = t.sy;
          this.sky.x = t.sx + jx;
          this.sky.y = t.sy - jy;
          if (joy) this.usedSteer += dt;
        } else if (t.zone === 'sky') {
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
    s.joy = joy;
    if (!joy) {
      s.joyX = 0;
      s.joyY = 0;
    }
    // teclado no modo fácil vira joystick
    if (this.mode === 'easy' && !joy && steer !== 0) {
      s.joy = true;
      s.joyX = steer * JOY_MAX;
    }
    if (this.mode === 'easy' && !joy && reel !== 0 && this.keys.size > 0) {
      s.joy = true;
      s.joyY = reel > 0 ? -JOY_MAX : JOY_MAX;
      if (steer !== 0) s.joyX = steer * JOY_MAX;
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
