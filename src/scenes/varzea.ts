import { makeCircle, makeSeg, makeWire, type Hazard } from '../physics/hazards';
import { Rng } from '../util/noise';
import {
  circle,
  graffiti,
  groundFill,
  house,
  kid,
  line,
  mangoTree,
  poly,
  rect,
  utilityPole,
  waterTank,
  windows,
  wirePath,
  type Ctx,
} from './common';
import type { SceneArt, SceneDef, SceneWorld } from './types';

/** Campo de várzea: aberto, vento constante, poucos perigos. */

function hazards(): Hazard[] {
  const h: Hazard[] = [];
  for (const gx of [-28, 21]) {
    h.push(makeSeg('post', gx, 0, gx, 2.44, 0.08));
    h.push(makeSeg('post', gx + 7.3, 0, gx + 7.3, 2.44, 0.08));
    h.push(makeSeg('post', gx, 2.44, gx + 7.3, 2.44, 0.08));
  }
  h.push(makeCircle('tree', 47, 8.4, 4.7));
  h.push(makeSeg('tree', 47, 0, 47, 5.5, 0.4));
  for (const [a, b] of [
    [-64, -38],
    [72, 98],
  ]) {
    h.push(makeSeg('post', a, 0, a, 9.2, 0.15));
    h.push(makeSeg('post', b, 0, b, 9.2, 0.15));
    h.push(makeWire(a, 8.8, b, 8.8, 0.9));
    h.push(makeWire(a, 8.1, b, 8.1, 0.8));
  }
  return h;
}

function world(): SceneWorld {
  return {
    id: 'varzea',
    wind: {
      baseX: 0.5,
      baseZ: 6.3,
      refHeight: 25,
      groundFactor: 0.55,
      gustLow: 0.14,
      gustHigh: 0.07,
      gustPeriod: 7,
      turbulence: 0.07,
      dirJitter: 0.1,
      seed: 101,
    },
    zones: [{ x0: 42, x1: 52, y0: 0, y1: 13, strength: 0.18 }],
    ground: () => 0,
    launch: { x: 0, y: 1.35 },
    opponents: [
      { x: -30, y: 1.35 },
      { x: 34, y: 1.35 },
      { x: 62, y: 1.35 },
    ],
    hazards: hazards(),
    minX: -260,
    maxX: 260,
  };
}

const KID_COLOR = '#2a1d33';

function art(): SceneArt {
  const hz = hazards();
  const wires = hz.filter((h) => h.kind === 'wire');
  return {
    sky: ['#3b4fa0', '#7a5aa8', '#e2768a', '#f9a65a', '#ffd58a'],
    sun: { x: 0.72, y: 0.16, r: 0.07, color: '#fff1c4' },
    bgKites: 7,
    layers: [
      {
        factor: 0.12,
        x0: -330,
        x1: 330,
        y0: -12,
        y1: 42,
        density: 5,
        draw: (ctx: Ctx) => {
          const rng = new Rng(7);
          groundFill(ctx, -330, 330, 0, '#c58a6a', 12);
          // casas baixas ao fundo
          for (let x = -330; x < 330; ) {
            const w = 5 + rng.next() * 7;
            const h = 3 + rng.next() * 4 + (rng.next() < 0.12 ? 5 : 0);
            const tones = ['#d99a82', '#cf8f8a', '#e0a87f', '#c98c9a', '#d6a093'];
            house(ctx, x, 0, w, h, tones[Math.floor(rng.next() * tones.length)], rng, { win: '#b77a78' });
            if (rng.next() < 0.3) waterTank(ctx, x + w * 0.6, h, 0.8, rng.next() < 0.5 ? '#8aa7d6' : '#7b6c7c');
            x += w + rng.next() * 1.5;
          }
          // torre de igreja e árvores
          rect(ctx, 60, 0, 6, 16, '#d49a86');
          poly(ctx, [59, 16, 67, 16, 63, 22], '#c4887a');
          rect(ctx, 62.6, 22, 0.8, 3, '#c4887a');
          rect(ctx, 61.2, 23.4, 3.6, 0.6, '#c4887a');
          for (let i = 0; i < 18; i++) {
            const tx = -320 + rng.next() * 640;
            circle(ctx, tx, 6 + rng.next() * 3, 3 + rng.next() * 2, '#b3806e');
          }
        },
      },
      {
        factor: 0.45,
        x0: -220,
        x1: 220,
        y0: -12,
        y1: 24,
        density: 7,
        draw: (ctx: Ctx) => {
          const rng = new Rng(17);
          groundFill(ctx, -220, 220, 0, '#7c8a3c', 12);
          // casas atrás do muro
          for (let x = -220; x < 220; ) {
            const w = 6 + rng.next() * 6;
            const h = 4 + rng.next() * 4;
            const tones = ['#e9a58a', '#f0c27b', '#d98c7c', '#a8c0d8', '#e4b4a0'];
            house(ctx, x, 0, w, h, tones[Math.floor(rng.next() * tones.length)], rng, { brick: rng.next() < 0.4, slab: '#bdb3a8' });
            x += w + 0.5 + rng.next() * 2;
          }
          // muro com grafite abstrato
          rect(ctx, -220, 0, 440, 2.8, '#d8d0c4');
          graffiti(ctx, -218, 218, 0.2, 2.6, rng);
          rect(ctx, -220, 2.7, 440, 0.18, '#a99f92');
          // arquibancada de concreto
          const ax = 18;
          for (let s = 0; s < 6; s++) {
            rect(ctx, ax + s * 0.6, s * 0.75, 34 - s * 1.2, 0.75, s % 2 ? '#b9b5ae' : '#a7a39c');
          }
          for (let i = 0; i < 8; i++) rect(ctx, ax + 2 + i * 3.8, 4.3, 0.18, 2.6, '#8f8a83');
          rect(ctx, ax + 1.6, 6.8, 31, 0.35, '#3e8fd1');
          // árvores
          for (let i = 0; i < 9; i++) {
            const tx = -200 + i * 47 + rng.next() * 10;
            mangoTree(ctx, tx, 0, 7 + rng.next() * 3, rng, '#3f6b3a', '#558a45', '#76a95a');
          }
          // traves de várzea simples (outro campo ao fundo)
          line(ctx, -80, 0, -80, 2.4, 0.15, '#f4f4f4');
          line(ctx, -73, 0, -73, 2.4, 0.15, '#f4f4f4');
          line(ctx, -80, 2.4, -73, 2.4, 0.15, '#f4f4f4');
        },
      },
      {
        factor: 1,
        x0: -170,
        x1: 170,
        y0: -30,
        y1: 16,
        density: 14,
        draw: (ctx: Ctx) => {
          const rng = new Rng(29);
          // gramado falhado
          groundFill(ctx, -170, 170, 0.05, '#6f9a3a', 30);
          for (let i = 0; i < 9; i++) rect(ctx, -170, -i * 3.2, 340, 1.6, i % 2 ? '#79a542' : '#669036');
          for (let i = 0; i < 70; i++) {
            const x = -165 + rng.next() * 330;
            const y = -rng.next() * 24;
            ctx.beginPath();
            ctx.ellipse(x, y, 1.5 + rng.next() * 4, 0.35 + rng.next() * 0.8, 0, 0, Math.PI * 2);
            ctx.fillStyle = rng.next() < 0.6 ? '#b08a55' : '#9c7a48';
            ctx.fill();
          }
          // linhas gastas do campo
          ctx.globalAlpha = 0.6;
          rect(ctx, -60, -0.05, 120, 0.12, '#f2f0e6');
          ctx.beginPath();
          ctx.ellipse(0, -3.5, 9, 2.4, 0, 0, Math.PI * 2);
          ctx.lineWidth = 0.14;
          ctx.strokeStyle = '#f2f0e6';
          ctx.stroke();
          rect(ctx, -0.07, -12, 0.14, 12, '#f2f0e6');
          ctx.globalAlpha = 1;
          // traves
          for (const gx of [-28, 21]) {
            line(ctx, gx, 0, gx, 2.44, 0.16, '#fafafa');
            line(ctx, gx + 7.3, 0, gx + 7.3, 2.44, 0.16, '#fafafa');
            line(ctx, gx, 2.44, gx + 7.3, 2.44, 0.16, '#fafafa');
            ctx.globalAlpha = 0.25;
            for (let k = 1; k < 8; k++) line(ctx, gx + k * 0.9, 0, gx + k * 0.9, 2.4, 0.03, '#ffffff');
            ctx.globalAlpha = 1;
          }
          // mangueira (perigo)
          mangoTree(ctx, 47, 0, 9.5, rng, '#2f5a2c', '#467a3a', '#68a04e');
          // postes
          for (const px of [-64, -38, 72, 98]) utilityPole(ctx, px, 0, 9.4);
          // bola e chinelos
          circle(ctx, 9, 0.11, 0.11, '#ffffff');
          rect(ctx, -3.2, -0.6, 0.3, 0.12, '#2f7de1');
          rect(ctx, -2.8, -0.5, 0.3, 0.12, '#2f7de1');
          // casinha da sede
          house(ctx, -150, 0, 10, 3.6, '#e7d8a8', rng, { door: true, slab: '#cfc2a0' });
          windows(ctx, -148, 1.2, 4, 1.4, 2, 1, rng, '#5a4630', '#ffcf6a', 0.4);
        },
      },
    ],
    drawNear: (ctx: Ctx, x0: number, x1: number, t: number) => {
      // fios
      for (let i = 0; i < wires.length; i++) {
        const w = wires[i];
        if (w.x1 < x0 || w.x0 > x1) continue;
        wirePath(ctx, w.pts, 0.05, '#2b2630');
      }
      // crianças jogando bola (silhuetas)
      if (x1 > -20 && x0 < 20) {
        const ph = t * 6;
        kid(ctx, -14 + Math.sin(t * 0.7) * 2, 0, 1.25, KID_COLOR, ph);
        kid(ctx, -9 + Math.sin(t * 0.7 + 2) * 1.5, 0, 1.15, KID_COLOR, ph + 1.3);
        kid(ctx, 12 + Math.sin(t * 0.5 + 1) * 2, 0, 1.3, KID_COLOR, ph + 2.1);
        const bx = -11 + Math.sin(t * 0.9) * 10;
        const by = 0.12 + Math.abs(Math.sin(t * 2.7)) * 1.4;
        circle(ctx, bx, by, 0.12, '#ffffff');
      }
    },
  };
}

export const VARZEA: SceneDef = {
  id: 'varzea',
  name: 'Campo de Várzea',
  tagline: 'Céu aberto e vento constante',
  windLabel: 'Aberto e constante',
  world,
  art,
};
