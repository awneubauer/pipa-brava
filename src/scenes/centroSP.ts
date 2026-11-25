import { makeRect, makeSeg, makeWire, type Hazard } from '../physics/hazards';
import { Rng } from '../util/noise';
import { circle, groundFill, line, poly, rect, utilityPole, windows, wirePath, type Ctx } from './common';
import type { SceneArt, SceneDef, SceneWorld } from './types';

/**
 * Centro de São Paulo: Copan (fachada ondulada), Edifício Itália, Ponte Estaiada,
 * MASP com a estrutura vermelha e a Avenida Paulista com postes e fiação.
 * Vento canalizado entre prédios, com turbulência.
 */

const BUILD_L = { x0: -72, x1: -48, h: 44 };
const BUILD_R = { x0: 30, x1: 52, h: 58 };

function hazards(): Hazard[] {
  const h: Hazard[] = [];
  h.push(makeRect('building', BUILD_L.x0, 0, BUILD_L.x1, BUILD_L.h));
  h.push(makeRect('building', BUILD_R.x0, 0, BUILD_R.x1, BUILD_R.h));
  h.push(makeSeg('antenna', 46, BUILD_R.h, 46, BUILD_R.h + 9, 0.15));
  h.push(makeSeg('antenna', -60, BUILD_L.h, -60, BUILD_L.h + 6, 0.15));
  // postes da avenida com fiação
  const poles = [-44, -22, 0 - 6, 14, 27];
  for (const px of poles) h.push(makeSeg('post', px, 0, px, 9.5, 0.14));
  for (let i = 0; i < poles.length - 1; i++) {
    h.push(makeWire(poles[i], 9.0, poles[i + 1], 9.0, 0.9));
    h.push(makeWire(poles[i], 8.3, poles[i + 1], 8.3, 0.8));
  }
  // fiação até os prédios
  h.push(makeWire(-44, 8.6, BUILD_L.x1, 14, 1.2));
  h.push(makeWire(27, 8.6, BUILD_R.x0, 16, 1.0));
  return h;
}

function world(): SceneWorld {
  return {
    id: 'centroSP',
    wind: {
      baseX: 1.4,
      baseZ: 5.6,
      refHeight: 60,
      groundFactor: 0.4,
      gustLow: 0.26,
      gustHigh: 0.12,
      gustPeriod: 5.5,
      turbulence: 0.12,
      dirJitter: 0.28,
      seed: 303,
    },
    zones: [
      { x0: BUILD_L.x0, x1: BUILD_L.x1, y0: 0, y1: BUILD_L.h, strength: 0.32 },
      { x0: BUILD_R.x0, x1: BUILD_R.x1, y0: 0, y1: BUILD_R.h, strength: 0.36 },
    ],
    ground: () => 0,
    launch: { x: 0, y: 1.35 },
    opponents: [
      { x: -30, y: 1.35 },
      { x: 20, y: 1.35 },
      { x: 41, y: BUILD_R.h + 1.35 },
    ],
    hazards: hazards(),
    minX: -240,
    maxX: 240,
  };
}

function copan(ctx: Ctx, cx: number, base: number, w: number, h: number): void {
  // corpo
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, base);
  ctx.lineTo(cx - w / 2 - 2, base + h);
  ctx.lineTo(cx + w / 2 + 2, base + h);
  ctx.lineTo(cx + w / 2, base);
  ctx.closePath();
  ctx.fillStyle = '#d8cfc4';
  ctx.fill();
  // brises horizontais ondulados (a marca do Copan)
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = '#8d8496';
  for (let y = base + 3; y < base + h - 1; y += 1.6) {
    ctx.beginPath();
    for (let x = -w / 2 - 1; x <= w / 2 + 1; x += 1) {
      const yy = y + Math.sin((x / w) * Math.PI * 2.2) * 1.4;
      if (x === -w / 2 - 1) ctx.moveTo(cx + x, yy);
      else ctx.lineTo(cx + x, yy);
    }
    ctx.stroke();
  }
  // sombra da curva
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.2, base + h / 2, w * 0.18, h / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a4a6a';
  ctx.fill();
  ctx.globalAlpha = 1;
  rect(ctx, cx - w / 2 - 2, base + h, w + 4, 1.2, '#b8afa6');
}

function edificioItalia(ctx: Ctx, cx: number, base: number, w: number, h: number, rng: Rng): void {
  rect(ctx, cx - w / 2, base, w, h, '#8e8aa0');
  windows(ctx, cx - w / 2 + 0.5, base + 2, w - 1, h - 8, 7, 34, rng, '#6c6882', '#ffd27a', 0.12);
  // coroa do terraço
  rect(ctx, cx - w / 2 - 0.6, base + h - 5, w + 1.2, 2.2, '#5b566e');
  rect(ctx, cx - w / 2 + 1, base + h, w - 2, 3, '#6e6984');
  line(ctx, cx, base + h + 3, cx, base + h + 9, 0.4, '#5b566e');
}

function ponteEstaiada(ctx: Ctx, cx: number, base: number, s: number): void {
  // tabuleiro em curva
  ctx.lineWidth = 1.2 * s;
  ctx.strokeStyle = '#9a8a9a';
  ctx.beginPath();
  ctx.moveTo(cx - 70 * s, base + 10 * s);
  ctx.quadraticCurveTo(cx, base + 16 * s, cx + 70 * s, base + 10 * s);
  ctx.stroke();
  // mastro em X
  const top = base + 105 * s;
  ctx.lineWidth = 2.2 * s;
  ctx.strokeStyle = '#e9e1d8';
  ctx.beginPath();
  ctx.moveTo(cx - 10 * s, base);
  ctx.lineTo(cx + 3 * s, top);
  ctx.moveTo(cx + 10 * s, base);
  ctx.lineTo(cx - 3 * s, top);
  ctx.stroke();
  // estais em leque
  ctx.lineWidth = 0.25 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 12; i++) {
    const ty = top - 4 * s - i * 3.2 * s;
    const dx = 18 * s + i * 4.5 * s;
    const dyL = base + 10 * s + (1 - Math.pow((dx / (70 * s)) * 1, 2)) * 5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, ty);
    ctx.lineTo(cx - dx, dyL);
    ctx.moveTo(cx, ty);
    ctx.lineTo(cx + dx, dyL);
    ctx.stroke();
  }
}

function masp(ctx: Ctx, cx: number, base: number, s: number): void {
  const w = 74 * s;
  const boxB = base + 8.5 * s;
  const boxT = base + 17 * s;
  // caixa de vidro suspensa
  rect(ctx, cx - w / 2, boxB, w, boxT - boxB, '#3e4458');
  for (let x = cx - w / 2 + 1.5 * s; x < cx + w / 2; x += 2.4 * s) rect(ctx, x, boxB, 0.15 * s, boxT - boxB, '#5c6480');
  rect(ctx, cx - w / 2, boxB + (boxT - boxB) * 0.5, w, 0.2 * s, '#5c6480');
  // pórticos vermelhos
  const red = '#d6262b';
  const pw = 2.4 * s;
  rect(ctx, cx - w / 2 + 1 * s, base, pw, boxT - base + 1.4 * s, red);
  rect(ctx, cx + w / 2 - 1 * s - pw, base, pw, boxT - base + 1.4 * s, red);
  rect(ctx, cx - w / 2 + 1 * s, boxT, w - 2 * s, 1.4 * s, red);
  rect(ctx, cx - w / 2 + 1 * s, boxB - 1.2 * s, w - 2 * s, 1.2 * s, red);
  // vão livre (praça) com gente genérica
  rect(ctx, cx - w / 2, base, w, 0.6 * s, '#b9b2a8');
}

function art(): SceneArt {
  const hz = hazards();
  const wires = hz.filter((h) => h.kind === 'wire');
  return {
    sky: ['#2f3f8c', '#6a4f99', '#c8668a', '#f2945a', '#ffcc78'],
    sun: { x: 0.62, y: 0.2, r: 0.06, color: '#fff2c8' },
    bgKites: 5,
    layers: [
      {
        factor: 0.08,
        scale: 0.32,
        x0: -340,
        x1: 340,
        y0: -12,
        y1: 130,
        density: 3.2,
        draw: (ctx: Ctx) => {
          const rng = new Rng(5);
          groundFill(ctx, -340, 340, 0, '#9a7a92', 12);
          // mar de prédios distantes
          for (let x = -340; x < 340; ) {
            const w = 6 + rng.next() * 10;
            const h = 18 + rng.next() * 45;
            rect(ctx, x, 0, w, h, rng.next() < 0.5 ? '#a68aa6' : '#b496aa');
            x += w + rng.next() * 2;
          }
          ponteEstaiada(ctx, -200, 0, 1);
        },
      },
      {
        factor: 0.32,
        scale: 0.4,
        x0: -260,
        x1: 260,
        y0: -12,
        y1: 180,
        density: 4,
        draw: (ctx: Ctx) => {
          const rng = new Rng(19);
          groundFill(ctx, -260, 260, 0, '#7b6880', 12);
          for (let x = -260; x < 260; ) {
            const w = 10 + rng.next() * 12;
            const h = 30 + rng.next() * 50;
            rect(ctx, x, 0, w, h, ['#8d7d96', '#9b88a0', '#7f7390', '#a594a6'][Math.floor(rng.next() * 4)]);
            windows(ctx, x + 1, 2, w - 2, h - 4, Math.max(2, Math.floor(w / 3)), Math.floor(h / 4), rng, '#6f6584', '#ffd88a', 0.15);
            x += w + 1 + rng.next() * 3;
          }
          copan(ctx, -64, 0, 64, 118);
          edificioItalia(ctx, 34, 0, 20, 165, rng);
        },
      },
      {
        factor: 0.58,
        scale: 0.75,
        x0: -200,
        x1: 200,
        y0: -12,
        y1: 60,
        density: 6,
        draw: (ctx: Ctx) => {
          const rng = new Rng(31);
          groundFill(ctx, -200, 200, 0, '#5d5468', 12);
          for (let x = -200; x < 200; ) {
            const w = 9 + rng.next() * 10;
            const h = 18 + rng.next() * 30;
            rect(ctx, x, 0, w, h, ['#6c6276', '#76697e', '#625a70'][Math.floor(rng.next() * 3)]);
            windows(ctx, x + 1, 2, w - 2, h - 4, Math.max(2, Math.floor(w / 2.6)), Math.floor(h / 3.4), rng, '#4f4860', '#ffd27a', 0.2);
            x += w + 2 + rng.next() * 4;
          }
          masp(ctx, -34, 0, 0.6);
          // árvores do Trianon
          for (let i = 0; i < 8; i++) circle(ctx, 40 + i * 6 + rng.next() * 3, 6 + rng.next() * 2, 3 + rng.next() * 1.5, '#3f5e4a');
        },
      },
      {
        factor: 1,
        x0: -160,
        x1: 160,
        y0: -24,
        y1: 70,
        density: 9,
        draw: (ctx: Ctx) => {
          const rng = new Rng(43);
          // avenida e calçada
          groundFill(ctx, -160, 160, 0, '#4a4452', 24);
          rect(ctx, -160, -0.6, 320, 0.6, '#b7aea2');
          for (let x = -160; x < 160; x += 1.2) rect(ctx, x, -0.6, 0.6, 0.6, (Math.floor(x / 1.2) & 1) === 0 ? '#c9c0b4' : '#a79e92');
          for (let x = -158; x < 160; x += 7) rect(ctx, x, -4.5, 3.4, 0.25, '#f2f0e6');
          // carros (formas genéricas)
          const cars = ['#e94b4b', '#f2c14b', '#4b8be9', '#e6e6e6', '#2b2b2b'];
          for (let x = -150; x < 150; x += 9 + rng.next() * 10) {
            const c = cars[Math.floor(rng.next() * cars.length)];
            const y = -3.2 - rng.next() * 4;
            rect(ctx, x, y, 4.2, 1.1, c);
            rect(ctx, x + 0.8, y + 1.1, 2.4, 0.7, c);
            circle(ctx, x + 0.9, y, 0.38, '#151515');
            circle(ctx, x + 3.3, y, 0.38, '#151515');
          }
          // prédios próximos (perigos)
          for (const b of [BUILD_L, BUILD_R]) {
            const w = b.x1 - b.x0;
            rect(ctx, b.x0, 0, w, b.h, '#7d7a8c');
            windows(ctx, b.x0 + 0.6, 2, w - 1.2, b.h - 3, Math.floor(w / 2.2), Math.floor(b.h / 3), rng, '#5a5770', '#ffd27a', 0.25);
            rect(ctx, b.x0 - 0.4, b.h - 0.6, w + 0.8, 0.8, '#5f5c70');
          }
          line(ctx, 46, BUILD_R.h, 46, BUILD_R.h + 9, 0.3, '#3b3946');
          circle(ctx, 46, BUILD_R.h + 9, 0.35, '#ff3b3b');
          line(ctx, -60, BUILD_L.h, -60, BUILD_L.h + 6, 0.3, '#3b3946');
          // postes
          for (const px of [-44, -22, -6, 14, 27]) {
            utilityPole(ctx, px, 0, 9.7, '#77737c');
            // luminária
            line(ctx, px, 9.2, px + 1.6, 9.8, 0.14, '#5c5960');
            circle(ctx, px + 1.7, 9.6, 0.25, '#ffe9a8');
          }
          // banca de jornal e ponto de ônibus (genéricos)
          rect(ctx, -14, 0, 3, 2.4, '#3d7b4e');
          rect(ctx, -14.2, 2.4, 3.4, 0.3, '#2f5e3c');
          rect(ctx, 6, 0, 0.12, 2.5, '#555');
          rect(ctx, 9.5, 0, 0.12, 2.5, '#555');
          rect(ctx, 5.8, 2.5, 4, 0.25, '#4a6a9a');
          poly(ctx, [-150, 0, -150, 3, -147, 3, -147, 0], '#6a5d50');
        },
      },
    ],
    drawNear: (ctx: Ctx, x0: number, x1: number, t: number) => {
      for (let i = 0; i < wires.length; i++) {
        const w = wires[i];
        if (w.x1 < x0 || w.x0 > x1) continue;
        wirePath(ctx, w.pts, 0.05, '#1f1c24');
      }
      // luz piscando na antena
      if (Math.sin(t * 3) > 0) circle(ctx, 46, BUILD_R.h + 9, 0.5, 'rgba(255,60,60,0.8)');
    },
  };
}

export const CENTRO_SP: SceneDef = {
  id: 'centroSP',
  name: 'Centro de São Paulo',
  tagline: 'Copan, MASP e a Paulista',
  windLabel: 'Canalizado entre prédios',
  world,
  art,
};
