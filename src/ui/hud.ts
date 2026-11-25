import { TENSION } from '../config';
import type { Input } from '../game/input';
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
  mode: 'arcade' | 'sim';
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

export class Hud {
  private tAlt = new NumText('', ' m');
  private tLine = new NumText('', ' m', true);
  private tScore = new NumText('', '', true);
  private tWind = new NumText('', ' km/h');
  private tCombo = new NumText('x', '');
  private tOpp = new NumText('', '');
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
    ctx.fillText('RECOLHER', cx, top + 142);
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
