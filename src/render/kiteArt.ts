import type { KiteModel } from '../config';

/** Clareia/escurece uma cor #rrggbb (cache para não alocar strings no loop). */
const shadeCache = new Map<string, string>();
export function shade(hex: string, amt: number): string {
  const key = hex + amt;
  const c = shadeCache.get(key);
  if (c) return c;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  const out = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  shadeCache.set(key, out);
  return out;
}

const HEX = [0, -1, 0.62, -0.5, 0.62, 0.35, 0, 0.85, -0.62, 0.35, -0.62, -0.5];

function outlineFill(ctx: CanvasRenderingContext2D, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Desenha a pipa centrada em (0,0), bico para cima (−y), meia-altura `s` px.
 * Retorna a distância do centro até o ponto onde a rabiola prende (px).
 */
export function drawKiteShape(
  ctx: CanvasRenderingContext2D,
  model: KiteModel,
  s: number,
  color: string,
  accent: string,
  burnt = 0,
): number {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.35);
  const lw = Math.max(1, s * 0.06);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let tail = s;
  switch (model) {
    case 'raia': {
      // losango com duas cores e varetas em cruz
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.72, -s * 0.22);
      ctx.lineTo(0, s);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(-s * 0.72, -s * 0.22);
      ctx.lineTo(0, s);
      ctx.closePath();
      outlineFill(ctx, accent);
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, -s * 0.22);
      ctx.lineTo(s * 0.72, -s * 0.22);
      ctx.lineTo(0, s);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.72, -s * 0.22);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.72, -s * 0.22);
      ctx.closePath();
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.72, -s * 0.22);
      ctx.quadraticCurveTo(0, -s * 0.42, s * 0.72, -s * 0.22);
      ctx.strokeStyle = 'rgba(70,40,10,0.7)';
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
      // bigodes
      ctx.fillStyle = light;
      for (let sx = -1; sx <= 1; sx += 2) {
        ctx.beginPath();
        ctx.moveTo(sx * s * 0.72, -s * 0.22);
        ctx.lineTo(sx * s * 1.02, -s * 0.05);
        ctx.lineTo(sx * s * 0.8, -s * 0.02);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'piao': {
      // topo arredondado e ponta embaixo
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, -s * 0.15);
      ctx.bezierCurveTo(-s * 0.75, -s * 1.05, s * 0.75, -s * 1.05, s * 0.75, -s * 0.15);
      ctx.lineTo(0, s);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, -s * 0.15);
      ctx.lineTo(s * 0.75, -s * 0.15);
      ctx.lineTo(0, s);
      ctx.closePath();
      outlineFill(ctx, accent);
      ctx.beginPath();
      ctx.arc(0, -s * 0.42, s * 0.2, 0, Math.PI * 2);
      outlineFill(ctx, light);
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, -s * 0.15);
      ctx.bezierCurveTo(-s * 0.75, -s * 1.05, s * 0.75, -s * 1.05, s * 0.75, -s * 0.15);
      ctx.lineTo(0, s);
      ctx.closePath();
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'papagaio': {
      // hexágono clássico com faixas
      const pts = HEX;
      ctx.beginPath();
      ctx.moveTo(pts[0] * s, pts[1] * s);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = accent;
      ctx.fillRect(-s, -s * 0.25, s * 2, s * 0.32);
      ctx.fillStyle = light;
      ctx.fillRect(-s * 0.12, -s, s * 0.24, s * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(pts[0] * s, pts[1] * s);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
      ctx.closePath();
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      tail = s * 0.85;
      break;
    }
    case 'estrela': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? s : s * 0.45;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
      outlineFill(ctx, accent);
      tail = s * 0.6;
      break;
    }
    case 'coracao': {
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.bezierCurveTo(-s * 1.1, s * 0.1, -s * 0.9, -s * 1.0, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.9, -s * 1.0, s * 1.1, s * 0.1, 0, s);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-s * 0.38, -s * 0.38, s * 0.16, s * 0.1, -0.6, 0, Math.PI * 2);
      outlineFill(ctx, accent);
      break;
    }
    case 'quadrada': {
      const h = s * 0.82;
      ctx.beginPath();
      ctx.rect(-h, -h, h * 2, h * 2);
      outlineFill(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-h, -h);
      ctx.lineTo(h, -h);
      ctx.lineTo(0, 0);
      ctx.closePath();
      outlineFill(ctx, accent);
      ctx.beginPath();
      ctx.moveTo(-h, h);
      ctx.lineTo(h, h);
      ctx.lineTo(0, 0);
      ctx.closePath();
      outlineFill(ctx, accent);
      ctx.beginPath();
      ctx.rect(-h, -h, h * 2, h * 2);
      ctx.moveTo(-h, -h);
      ctx.lineTo(h, h);
      ctx.moveTo(h, -h);
      ctx.lineTo(-h, h);
      ctx.strokeStyle = dark;
      ctx.lineWidth = lw;
      ctx.stroke();
      tail = h;
      break;
    }
  }
  if (burnt > 0) {
    ctx.globalAlpha = Math.min(1, burnt) * 0.75;
    ctx.fillStyle = '#1b1208';
    ctx.beginPath();
    ctx.arc(s * 0.15, s * 0.1, s * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  return tail;
}
