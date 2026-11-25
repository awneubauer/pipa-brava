import { TENSION } from '../config';
import type { ModeId } from '../config';
import type { BattleRules } from '../game/battle';
import type { Camera } from '../game/camera';
import type { Input } from '../game/input';
import { goalText, type LevelDef } from '../game/levels';
import type { Flyer } from '../physics/flyer';

/** Cache de texto: só recria a string quando o número muda (evita alocação por quadro). */
class NumText {
  private v = NaN;
  private s = '';
  constructor(
    private prefix: string,
    private suffix: string,
    private thousands = false,
  ) {}
  get(v: number): string {
    const r = Math.round(v);
    if (r !== this.v) {
      this.v = r;
      const n = this.thousands ? r.toLocaleString('pt-BR') : String(r);
      this.s = this.prefix + n + this.suffix;
    }
    return this.s;
  }
}

export interface HudInfo {
  mode: ModeId;
  battle: BattleRules | null;
  level: LevelDef | null;
  cam: Camera;
  flyers: Flyer[];
  /** controle de um dedo (esconde o carretel) */
  easy: boolean;
  player: Flyer;
  score: number;
  combo: number;
  comboTimer: number;
  opponents: Flyer[];
  aliveOpponents: number;
  windSpeed: number;
  windAngle: number;
  time: number;
  debug: string | null;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const F700_10 = '700 10px ' + FONT;
const F700_9 = '700 9px ' + FONT;
const F800_11 = '800 11px ' + FONT;
const F900_14 = '900 14px ' + FONT;
const F900_17 = '900 17px ' + FONT;
const F900_18 = '900 18px ' + FONT;
const F900_30 = '900 30px ' + FONT;
const F900_22 = '900 22px ' + FONT;
const F900_15 = '900 15px ' + FONT;
const F800_12 = '800 12px ' + FONT;
const F800_10 = '800 10px ' + FONT;

const GUIDE_DASH = [6, 8];
const NO_DASH: number[] = [];

export class Hud {
  private tAlt = new NumText('', ' m');
  private tLine = new NumText('', ' m', true);
  private tScore = new NumText('', '', true);
  private tWind = new NumText('', ' km/h');
  private tCombo = new NumText('x', '');
  private tOpp = new NumText('', '');
  private tProg = new NumText('', '');
  private tTime = new NumText('', ' s');
  private tCoins = new NumText('🪙 ', '');
  private tWave = new NumText('ONDA ', '');
  private goalLevel: LevelDef | null = null;
  private goalStr = '';
  private duelT = 0;
  private reelAngle = 0;
  private lastSpin = 0;
  /** área do botão de pausa (px CSS) */
  readonly pauseBtn = { x: 0, y: 0, w: 44, h: 44 };
  /** botão de silenciar */
  readonly muteBtn = { x: 0, y: 0, w: 44, h: 44 };
  muted = false;
  safeTop = 0;

  layout(w: number, reelW: number): void {
    this.pauseBtn.x = w - reelW / 2 - 22;
    this.pauseBtn.y = 10 + this.safeTop;
    this.muteBtn.x = w - reelW / 2 - 22;
    this.muteBtn.y = this.pauseBtn.y + 52;
    void reelW;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, input: Input, info: HudInfo): void {
    const p = info.player;
    const reelW = input.reelWidth;
    const top = 10 + this.safeTop;
    ctx.textBaseline = 'middle';

    if (!info.easy) {
      // ---------- faixa do carretel ----------
      const rx = w - reelW;
      ctx.fillStyle = 'rgba(20,12,40,0.28)';
      ctx.beginPath();
      ctx.roundRect(rx + 6, top + 106, reelW - 12, h - top - 122, 18);
      ctx.fill();
      const cx = rx + reelW / 2;
      const cy = top + 106 + (h - top - 122) / 2;
      this.reelAngle += (p.reel.spin - this.lastSpin) * 0.9 * Math.sign(p.reel.rate || 1);
      this.lastSpin = p.reel.spin;
      const rr = Math.min(reelW * 0.36, 34);
      // carretel (lata com linha enrolada)
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      const fill = 1 - p.reel.out / p.reel.stock;
      ctx.fillStyle = p.lineType.color;
      ctx.beginPath();
      ctx.arc(cx, cy, rr * (0.45 + 0.5 * fill), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a4a10';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = this.reelAngle + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#7a4a10';
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = F800_11;
      ctx.fillStyle = p.reel.rate < -0.5 ? '#ffe680' : 'rgba(255,255,255,0.85)';
      ctx.fillText('▲', cx, top + 126);
      ctx.fillText('PUXAR', cx, top + 142);
      ctx.fillStyle = p.reel.rate > 0.5 ? '#ffe680' : 'rgba(255,255,255,0.85)';
      ctx.fillText('SOLTAR', cx, h - 40);
      ctx.fillText('▼', cx, h - 24);
      if (input.reelTouch.active) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(cx, input.reelTouch.sy, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,230,120,0.9)';
        ctx.beginPath();
        ctx.arc(cx, input.reelTouch.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (info.easy) this.drawFinger(ctx, input, info);
    else {
      // ---------- toque no céu ----------
      if (input.sky.active) {
        const s = input.sky;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (info.battle) this.drawBattle(ctx, w, top, reelW, info);
    else {
      // ---------- painel superior ----------
      const panelW = w - reelW - 16;
      ctx.fillStyle = 'rgba(20,12,40,0.38)';
      ctx.beginPath();
      ctx.roundRect(8, top, panelW, 62, 14);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = F700_10;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('ALTURA', 18, top + 13);
      ctx.fillText('LINHA', 82, top + 13);
      ctx.font = F900_17;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.tAlt.get(Math.max(0, p.kite.y - p.baseY + 1.3)), 18, top + 30);
      const rem = p.reel.stock - p.reel.out;
      ctx.fillStyle = rem < p.reel.stock * 0.08 ? '#ff6b6b' : '#ffffff';
      ctx.fillText(this.tLine.get(rem), 82, top + 30);

      // vento (vista de cima: para cima = soprando para dentro da tela)
      const wx = 8 + panelW - 30;
      const wy = top + 26;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(wx, wy, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(info.windAngle);
      const len = 8 + Math.min(1, info.windSpeed / 10) * 7;
      ctx.fillStyle = '#9ff3ff';
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(7, -len + 9);
      ctx.lineTo(2.5, -len + 9);
      ctx.lineTo(2.5, len);
      ctx.lineTo(-2.5, len);
      ctx.lineTo(-2.5, -len + 9);
      ctx.lineTo(-7, -len + 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = F700_9;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(this.tWind.get(info.windSpeed * 3.6), wx, top + 54);
      ctx.textAlign = 'left';
      ctx.font = F700_10;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('VENTO', wx - 66, top + 13);

      // tensão
      const bx = 18;
      const by = top + 44;
      const bw = panelW - 92;
      const bh = 10;
      const g0 = TENSION.greenMin;
      const y0 = TENSION.yellow;
      const r0 = TENSION.red;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx, by, bw * g0, bh);
      ctx.fillStyle = '#2ed573';
      ctx.fillRect(bx + bw * g0, by, bw * (y0 - g0), bh);
      ctx.fillStyle = '#ffd400';
      ctx.fillRect(bx + bw * y0, by, bw * (r0 - y0), bh);
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(bx + bw * r0, by, bw * (1 - r0), bh);
      const tv = Math.min(1, p.tension01);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + bw * tv - 2, by - 4, 4, bh + 8);
      ctx.font = F700_10;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('TENSÃO', 150, top + 13);

      // ---------- modo ----------
      ctx.textAlign = 'center';
      if (info.mode === 'arcade') {
        ctx.font = F900_30;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(30,10,40,0.7)';
        const sx = (w - reelW) / 2;
        ctx.strokeText(this.tScore.get(info.score), sx, top + 88);
        ctx.fillStyle = '#ffe680';
        ctx.fillText(this.tScore.get(info.score), sx, top + 88);
        if (info.combo > 1 && info.comboTimer > 0) {
          ctx.font = F900_18;
          ctx.fillStyle = '#ff6bd6';
          ctx.strokeText(this.tCombo.get(info.combo), sx, top + 114);
          ctx.fillText(this.tCombo.get(info.combo), sx, top + 114);
        }
      } else {
        // vida das linhas
        const sx = 18;
        let yy = top + 78;
        ctx.textAlign = 'left';
        ctx.font = F800_11;
        this.lifeBar(ctx, sx, yy, 'Você', 1 - p.damage, p.status === 'flying' || p.status === 'snagged');
        for (let i = 0; i < info.opponents.length; i++) {
          yy += 18;
          const o = info.opponents[i];
          this.lifeBar(ctx, sx, yy, o.name, 1 - o.damage, o.status === 'flying' || o.status === 'snagged');
        }
        ctx.textAlign = 'right';
        ctx.font = F900_14;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.tOpp.get(info.aliveOpponents), w - reelW - 34, top + 82);
        ctx.font = F700_10;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('ADVERSÁRIOS', w - reelW - 50, top + 82);
      }
    }

    // pausa
    const pb = this.pauseBtn;
    ctx.fillStyle = 'rgba(20,12,40,0.45)';
    ctx.beginPath();
    ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pb.x + 15, pb.y + 13, 5, 18);
    ctx.fillRect(pb.x + 25, pb.y + 13, 5, 18);

    // silenciar
    const mb = this.muteBtn;
    ctx.fillStyle = 'rgba(20,12,40,0.45)';
    ctx.beginPath();
    ctx.roundRect(mb.x, mb.y, mb.w, mb.h, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(mb.x + 12, mb.y + 18);
    ctx.lineTo(mb.x + 17, mb.y + 18);
    ctx.lineTo(mb.x + 24, mb.y + 12);
    ctx.lineTo(mb.x + 24, mb.y + 32);
    ctx.lineTo(mb.x + 17, mb.y + 26);
    ctx.lineTo(mb.x + 12, mb.y + 26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.muted) {
      ctx.moveTo(mb.x + 28, mb.y + 17);
      ctx.lineTo(mb.x + 36, mb.y + 27);
      ctx.moveTo(mb.x + 36, mb.y + 17);
      ctx.lineTo(mb.x + 28, mb.y + 27);
    } else {
      ctx.arc(mb.x + 25, mb.y + 22, 6, -0.9, 0.9);
      ctx.moveTo(mb.x + 31.5, mb.y + 13);
      ctx.arc(mb.x + 25, mb.y + 22, 11, -0.9, 0.9);
    }
    ctx.stroke();

    if (info.debug) {
      ctx.textAlign = 'left';
      ctx.font = '600 11px ui-monospace, monospace';
      const lines = info.debug.split('\n');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, h - 16 - lines.length * 14, 250, lines.length * 14 + 8);
      ctx.fillStyle = '#7CFF8A';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 14, h - 8 - (lines.length - i) * 14);
    }
  }

  /** Modo fácil: joystick flutuante no canto e botão PUXA!. */
  private drawFinger(ctx: CanvasRenderingContext2D, input: Input, info: HudInfo): void {
    const s = input.sky;
    if (s.active) {
      ctx.fillStyle = 'rgba(20,12,40,0.35)';
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,120,0.95)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 24, 0, Math.PI * 2);
      ctx.fill();
    } else if (info.battle && info.battle.stats.time < 8) {
      // mostra onde fica o joystick no começo
      const x = 90;
      const y = info.cam.h - 120;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash(GUIDE_DASH);
      ctx.beginPath();
      ctx.arc(x, y, 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.font = F800_10;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('ARRASTE AQUI', x, y);
      ctx.globalAlpha = 1;
    }
    // botão de ação
    if (!info.battle) return;
    // mira da embicada: para onde o joystick empurra (ou para onde o bico aponta)
    if (!info.battle.duel && info.player.status === 'flying') {
      const k = info.player.kite;
      let dx = Math.cos(k.angle);
      let dy = Math.sin(k.angle);
      if (input.state.joy) {
        const m = Math.hypot(input.state.joyX, input.state.joyY) || 1;
        dx = input.state.joyX / m;
        dy = input.state.joyY / m;
      }
      const kx = info.cam.toScreenX(k.x);
      const ky = info.cam.toScreenY(k.y);
      const ax = kx + dx * 34;
      const ay = ky - dy * 34;
      const bx = kx + dx * 70;
      const by = ky - dy * 70;
      ctx.strokeStyle = 'rgba(255,138,107,0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash(GUIDE_DASH);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.fillStyle = 'rgba(255,138,107,0.95)';
      ctx.beginPath();
      ctx.moveTo(bx + dx * 10, by - dy * 10);
      ctx.lineTo(bx - dy * 7, by - dx * 7);
      ctx.lineTo(bx + dy * 7, by + dx * 7);
      ctx.closePath();
      ctx.fill();
    }
    const a = input.actionBtn;
    const duel = info.battle.duel;
    const pulse = duel ? 1 + 0.06 * Math.sin(this.duelT * 14) : 1;
    ctx.fillStyle = a.down ? 'rgba(255,180,40,0.95)' : duel ? 'rgba(255,212,0,0.92)' : 'rgba(255,79,139,0.82)';
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = duel ? '#3a1a10' : '#ffffff';
    ctx.font = F900_15;
    ctx.textAlign = 'center';
    ctx.fillText(duel ? 'CORTA!' : input.state.hold ? 'LINHA!' : 'PUXA!', a.x, a.y + 1);
    // botão RECOLHE (segurar) e metros de linha fora
    if (!duel) {
      const rb = input.reelBtn;
      ctx.fillStyle = rb.down ? 'rgba(120,220,255,0.95)' : 'rgba(46,160,213,0.82)';
      ctx.beginPath();
      ctx.arc(rb.x, rb.y, rb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = F800_10;
      ctx.textAlign = 'center';
      ctx.fillText('RECOLHE', rb.x, rb.y + 7);
      ctx.font = F900_15;
      ctx.fillText('⤓', rb.x, rb.y - 7);
      ctx.font = F800_10;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(this.tLine.get(info.player.reel.out), rb.x, rb.y - rb.r - 9);
    }
    if (!duel && info.battle.stats.time < 20) {
      // cola dos comandos acima do botão
      ctx.font = F800_10;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'right';
      const rb2 = input.reelBtn;
      const cx = rb2.x - rb2.r - 10;
      ctx.fillText('segure RECOLHE  traz a pipa', cx, rb2.y + 4);
      ctx.fillText('PUXA! 1x  puxada (sobe)', a.x - a.r - 10, a.y - 22);
      ctx.fillText('2x  EMBICADA (na mira)', a.x - a.r - 10, a.y - 8);
      ctx.fillText('segure  dar linha (foge)', a.x - a.r - 10, a.y + 6);
    }
  }

  /** HUD da Batalha: objetivo, tempo, vida da linha, combo e barras dos inimigos. */
  private drawBattle(ctx: CanvasRenderingContext2D, w: number, top: number, reelW: number, info: HudInfo): void {
    const b = info.battle as BattleRules;
    const st = b.stats;
    const lv = info.level;
    const p = info.player;
    const panelW = w - reelW - 16;
    // barras dos inimigos sobre as pipas
    const fl = info.flyers;
    ctx.textAlign = 'center';
    for (let i = 1; i < fl.length; i++) {
      const f = fl[i];
      if (f.hidden || !(f.status === 'flying' || f.status === 'snagged')) continue;
      const x = info.cam.toScreenX(f.kite.x);
      const y = info.cam.toScreenY(f.kite.y) - 30 * f.visualScale - 6;
      const bw = f.visualScale > 1 ? 70 : 44;
      ctx.fillStyle = 'rgba(20,12,40,0.6)';
      ctx.fillRect(x - bw / 2 - 2, y - 2, bw + 4, 8);
      const life = Math.max(0, 1 - f.damage);
      ctx.fillStyle = life > 0.6 ? '#ff4d6d' : life > 0.3 ? '#ff8a00' : '#ffd400';
      ctx.fillRect(x - bw / 2, y, bw * life, 4);
      ctx.font = F800_10;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.name, x, y - 7);
    }
    // painel
    ctx.fillStyle = 'rgba(20,12,40,0.5)';
    ctx.beginPath();
    ctx.roundRect(8, top, panelW, 76, 14);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (lv) {
      if (this.goalLevel !== lv) {
        this.goalLevel = lv;
        this.goalStr = 'FASE ' + lv.n + ' · ' + goalText(lv);
      }
      ctx.font = F800_12;
      ctx.fillStyle = '#ffe680';
      ctx.fillText(this.goalStr, 18, top + 14);
      // progresso
      let prog = 0;
      if (lv.goal === 'cut') prog = st.cuts / lv.target;
      else if (lv.goal === 'combo') prog = Math.max(b.combo, st.bestCombo) / lv.target;
      else if (lv.goal === 'survive') prog = st.time / lv.target;
      else prog = b.bossDown ? 1 : 0;
      ctx.font = F900_22;
      ctx.fillStyle = '#ffffff';
      const txt =
        lv.goal === 'cut'
          ? this.tProg.get(st.cuts) + '/' + lv.target
          : lv.goal === 'combo'
            ? 'x' + Math.max(b.combo, 1)
            : lv.goal === 'survive'
              ? this.tTime.get(Math.max(0, lv.target - st.time))
              : '';
      ctx.fillText(txt, 18, top + 38);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(100, top + 33, panelW - 110, 10);
      ctx.fillStyle = '#7dff5a';
      ctx.fillRect(100, top + 33, (panelW - 110) * Math.min(1, prog), 10);
      if (lv.time > 0 && lv.goal !== 'survive') {
        const left = Math.max(0, lv.time - st.time);
        ctx.font = F800_10;
        ctx.fillStyle = left < 10 ? '#ff6b6b' : 'rgba(255,255,255,0.8)';
        ctx.textAlign = 'right';
        ctx.fillText(this.tTime.get(left), panelW, top + 14);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.font = F800_12;
      ctx.fillStyle = '#ffe680';
      ctx.fillText(this.tWave.get(st.wave), 18, top + 14);
      ctx.font = F900_22;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.tScore.get(st.score), 18, top + 38);
      ctx.textAlign = 'right';
      ctx.font = F900_15;
      ctx.fillStyle = '#ffd400';
      ctx.fillText(this.tCoins.get(st.coins), panelW, top + 38);
      ctx.textAlign = 'left';
    }
    // vida da linha
    ctx.font = F800_10;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('SUA LINHA', 18, top + 62);
    const life = Math.max(0, 1 - p.damage);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(80, top + 57, panelW - 90, 10);
    ctx.fillStyle = life > 0.6 ? '#2ed573' : life > 0.3 ? '#ffd400' : '#ff3b3b';
    ctx.fillRect(80, top + 57, (panelW - 90) * life, 10);
    // combo e puxão
    ctx.textAlign = 'center';
    if (b.combo > 1 && b.comboTimer > 0 && !b.duel) {
      ctx.font = F900_30;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30,10,40,0.7)';
      const cx = (w - reelW) / 2;
      const s = this.tCombo.get(b.combo);
      ctx.strokeText(s, cx, top + 104);
      ctx.fillStyle = '#ff6bd6';
      ctx.fillText(s, cx, top + 104);
      ctx.fillStyle = 'rgba(255,107,214,0.8)';
      ctx.fillRect(cx - 30, top + 122, 60 * Math.min(1, b.comboTimer / 6), 4);
    }
    // duelo de serra
    if (b.duel) this.drawDuel(ctx, w, info, b, top, panelW);
    // aviso de ataque sobre quem está vindo
    for (let i = 0; i < b.ais.length; i++) {
      const ai = b.ais[i];
      const f = fl[i + 1];
      if (!ai || f.hidden || (ai.state !== 'aproximar' && ai.state !== 'engajar') || b.duel) continue;
      const x = info.cam.toScreenX(f.kite.x);
      const y = info.cam.toScreenY(f.kite.y) - 30 * f.visualScale - 30;
      const bl = Math.sin(this.duelT * 16) > -0.3;
      if (!bl) continue;
      ctx.font = F900_22;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd400';
      ctx.fillText('⚠', x, y);
    }
    this.duelT += 0.004;
    // dica nos primeiros segundos
    if (st.time < 6 && info.easy && !b.duel) {
      ctx.globalAlpha = Math.min(1, (6 - st.time) / 1.5);
      ctx.fillStyle = 'rgba(20,12,40,0.6)';
      const hw = Math.min(w - 24, 330);
      ctx.beginPath();
      ctx.roundRect((w - hw) / 2, info.cam.h - 96 - 230, hw, 50, 14);
      ctx.fill();
      ctx.font = F800_12;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Polegar esquerdo pilota a pipa', w / 2, info.cam.h - 310);
      ctx.fillStyle = '#ffe680';
      ctx.fillText('Mire e dê 2 toques no PUXA! = embicada', w / 2, info.cam.h - 291);
      ctx.globalAlpha = 1;
    }
  }

  /** Painel do duelo: barra de timing, vida das duas linhas e bônus. */
  private drawDuel(ctx: CanvasRenderingContext2D, w: number, info: HudInfo, b: BattleRules, top: number, panelW: number): void {
    const p = info.player;
    const e = b.duelEnemy >= 0 ? info.flyers[b.duelEnemy] : null;
    const x0 = 8;
    const y0 = top + 84;
    const pw = panelW;
    this.duelT += 0.016;
    ctx.fillStyle = 'rgba(20,12,40,0.78)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, pw, 96, 16);
    ctx.fill();
    // vida das linhas
    const myLife = Math.max(0, 1 - p.damage);
    const theirLife = e ? Math.max(0, 1 - e.damage) : 1;
    const bw = pw / 2 - 20;
    ctx.font = F800_10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('VOCÊ', x0 + 12, y0 + 12);
    ctx.textAlign = 'right';
    ctx.fillText(e ? e.name.toUpperCase() : '', x0 + pw - 12, y0 + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x0 + 12, y0 + 20, bw, 9);
    ctx.fillRect(x0 + pw - 12 - bw, y0 + 20, bw, 9);
    ctx.fillStyle = myLife > 0.4 ? '#2ed573' : '#ff3b3b';
    ctx.fillRect(x0 + 12, y0 + 20, bw * myLife, 9);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x0 + pw - 12 - bw * theirLife, y0 + 20, bw * theirLife, 9);
    // barra de timing
    const tx = x0 + 14;
    const tw = pw - 28;
    const ty = y0 + 40;
    const th = 26;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    const zx = tx + (b.zoneC - b.zoneHW) * tw;
    ctx.fillStyle = '#2ed573';
    ctx.fillRect(zx, ty, b.zoneHW * 2 * tw, th);
    ctx.fillStyle = '#9dff8a';
    ctx.fillRect(tx + (b.zoneC - b.zoneHW * 0.4) * tw, ty, b.zoneHW * 0.8 * tw, th);
    const mx = tx + b.marker * tw;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - 3, ty - 5, 6, th + 10);
    ctx.beginPath();
    ctx.moveTo(mx - 8, ty - 8);
    ctx.lineTo(mx + 8, ty - 8);
    ctx.lineTo(mx, ty);
    ctx.closePath();
    ctx.fill();
    // retorno do último toque / instrução
    ctx.textAlign = 'center';
    ctx.font = F800_12;
    if (b.feedbackT > 0) {
      ctx.fillStyle = b.feedback === 'erro' ? '#ff6b6b' : b.feedback === 'perfeito' ? '#7dff5a' : '#ffd400';
      ctx.fillText(b.feedback === 'erro' ? 'ERROU! Espere a zona verde' : b.feedback === 'perfeito' ? 'PERFEITO!' : 'CORTE!', x0 + pw / 2, y0 + 84);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        b.initiative === 'voce' ? (b.above ? 'VANTAGEM + POR CIMA · CORTA! no verde' : 'VANTAGEM SUA · CORTA! no verde') : 'ELE ATACOU · CORTA! no verde',
        x0 + pw / 2,
        y0 + 84,
      );
    }
    void w;
  }

  private lifeBar(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, life: number, alive: boolean): void {
    ctx.fillStyle = 'rgba(20,12,40,0.45)';
    ctx.fillRect(x - 6, y - 8, 150, 16);
    ctx.fillStyle = alive ? '#ffffff' : 'rgba(255,255,255,0.45)';
    ctx.fillText(name, x, y);
    const bw = 70;
    const bx = x + 70;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(bx, y - 4, bw, 8);
    const l = alive ? Math.max(0, Math.min(1, life)) : 0;
    ctx.fillStyle = l > 0.6 ? '#2ed573' : l > 0.3 ? '#ffd400' : '#ff3b3b';
    ctx.fillRect(bx, y - 4, bw * l, 8);
  }
}
