import { makeCircle, makeRect, makeSeg, makeWire, type Hazard } from '../physics/hazards';
import { Rng } from '../util/noise';
import {
  clothesline,
  dish,
  groundFill,
  house,
  line,
  poly,
  rect,
  tvAntenna,
  utilityPole,
  waterTank,
  wirePath,
  type Ctx,
} from './common';
import type { SceneArt, SceneDef, SceneWorld } from './types';

/**
 * Favela no morro: casas empilhadas na encosta que sobe para a direita,
 * emaranhado de fios, caixas d'água, antenas. Vento turbulento e com rajadas.
 */

/** Encosta (base das casas). */
function hill(x: number): number {
  return 11 + 11 * Math.tanh((x - 40) / 60);
}

/** Linha dos telhados/lajes (o "chão" da física). */
function ground(x: number): number {
  return hill(x) + 5 + 0.8 * Math.sin(x * 0.35) * Math.sin(x * 0.11);
}

const LAJE_X = 0;
const LAJE_Y = 10.5;

function groundAt(x: number): number {
  // a laje do jogador é plana
  if (Math.abs(x - LAJE_X) < 4) return LAJE_Y;
  return ground(x);
}

function hazards(): Hazard[] {
  const h: Hazard[] = [];
  // emaranhado de fios entre postes que sobem o morro
  const poles = [-70, -46, -22, 14, 38, 62, 88, 116];
  for (const px of poles) h.push(makeSeg('post', px, groundAt(px) - 4, px, groundAt(px) + 5, 0.15));
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    const ya = groundAt(a) + 4.6;
    const yb = groundAt(b) + 4.6;
    h.push(makeWire(a, ya, b, yb, 1.1));
    h.push(makeWire(a, ya - 0.6, b, yb - 0.5, 0.9));
    if (i % 2 === 0) h.push(makeWire(a, ya - 0.3, b + 6, groundAt(b + 6) + 3, 1.6));
  }
  // fios cruzando por cima das vielas (gatos)
  h.push(makeWire(-30, groundAt(-30) + 6, 22, groundAt(22) + 7.5, 2.2));
  h.push(makeWire(8, groundAt(8) + 8, 52, groundAt(52) + 6.5, 1.8));
  // antenas, parabólicas e caixas d'água nos telhados
  const rng = new Rng(404);
  for (let x = -100; x < 180; x += 9 + rng.next() * 8) {
    if (Math.abs(x - LAJE_X) < 6) continue;
    const g = groundAt(x);
    const k = rng.next();
    if (k < 0.35) h.push(makeSeg('antenna', x, g, x, g + 3.2, 0.12));
    else if (k < 0.7) h.push(makeRect('tank', x - 0.9, g, x + 0.9, g + 1.6));
    else h.push(makeCircle('antenna', x, g + 1.2, 0.7));
  }
  return h;
}

function world(): SceneWorld {
  return {
    id: 'favela',
    wind: {
      baseX: 0.9,
      baseZ: 5.4,
      refHeight: 40,
      groundFactor: 0.45,
      gustLow: 0.34,
      gustHigh: 0.16,
      gustPeriod: 4.5,
      turbulence: 0.16,
      dirJitter: 0.22,
      seed: 202,
    },
    zones: [
      { x0: 20, x1: 220, y0: 0, y1: 34, strength: 0.18 },
      { x0: -60, x1: 20, y0: 0, y1: 16, strength: 0.12 },
    ],
    ground: groundAt,
    launch: { x: LAJE_X, y: LAJE_Y + 1.35 },
    opponents: [
      { x: -40, y: groundAt(-40) + 1.35 },
      { x: 44, y: groundAt(44) + 1.35 },
      { x: 96, y: groundAt(96) + 1.35 },
    ],
    hazards: hazards(),
    minX: -220,
    maxX: 260,
  };
}

const WALLS = ['#e0703f', '#f2b84b', '#4fa3e0', '#c94f6d', '#7bc96f', '#f08bb0', '#e8d6b0', '#b5683e', '#8f5ad6', '#ffffff'];

function drawHillHouses(ctx: Ctx, x0: number, x1: number, rng: Rng, base: (x: number) => number, top: (x: number) => number, detail: boolean): void {
  for (let x = x0; x < x1; ) {
    const w = 4 + rng.next() * 4;
    const roof = top(x + w / 2) + (rng.next() - 0.5) * 1.4;
    const bottom = base(x + w / 2) - 14;
    const brick = rng.next() < 0.45;
    const wall = brick ? '#b8643a' : WALLS[Math.floor(rng.next() * WALLS.length)];
    house(ctx, x, bottom, w, roof - bottom, wall, rng, { brick, slab: '#9e9a92', win: '#3b2a3a' });
    // andares
    for (let y = roof - 3; y > bottom + 2; y -= 3) rect(ctx, x, y, w, 0.12, 'rgba(0,0,0,0.15)');
    if (detail) {
      // escadaria lateral
      if (rng.next() < 0.18) {
        for (let s = 0; s < 6; s++) rect(ctx, x + w - 1.2 + (s % 2) * 0.2, roof - 1 - s * 0.45, 1.2, 0.15, '#8c8780');
      }
      // grade na laje
      if (rng.next() < 0.4) for (let gx = x + 0.2; gx < x + w; gx += 0.5) rect(ctx, gx, roof, 0.05, 0.8, '#3a3a40');
      if (rng.next() < 0.3) clothesline(ctx, x + 0.3, x + w - 0.3, roof + 1.6, rng);
    }
    x += w + rng.next() * 0.4;
  }
}

function art(): SceneArt {
  const hz = hazards();
  const wires = hz.filter((h) => h.kind === 'wire');
  return {
    sky: ['#34418f', '#6c4f9a', '#d46a86', '#f69a55', '#ffcf7a'],
    sun: { x: 0.2, y: 0.22, r: 0.065, color: '#fff0c0' },
    bgKites: 12,
    layers: [
      {
        factor: 0.1,
        scale: 0.6,
        x0: -330,
        x1: 330,
        y0: -12,
        y1: 70,
        density: 4,
        draw: (ctx: Ctx) => {
          const rng = new Rng(11);
          groundFill(ctx, -330, 330, 0, '#a86a6a', 12);
          // morros distantes cobertos de casinhas
          const peaks = [
            [-250, 40, 90],
            [-90, 55, 110],
            [120, 48, 100],
            [270, 60, 120],
          ];
          for (const [cx, h, w] of peaks) {
            ctx.beginPath();
            ctx.moveTo(cx - w * 1.3, 0);
            ctx.quadraticCurveTo(cx, h * 2, cx + w * 1.3, 0);
            ctx.fillStyle = '#a77a8a';
            ctx.fill();
            for (let i = 0; i < 260; i++) {
              const x = cx - w + rng.next() * w * 2;
              const t = 1 - Math.abs(x - cx) / (w * 1.3);
              const top = h * t * (2 - t) * 0.95;
              const y = rng.next() * top;
              ctx.fillStyle = ['#d99a8a', '#e7b48a', '#c98a9a', '#e9c9a6', '#b98fae'][Math.floor(rng.next() * 5)];
              ctx.fillRect(x, y, 1.6 + rng.next() * 1.6, 1.2 + rng.next());
            }
          }
          // antenas de TV no topo de um morro
          line(ctx, -90, 108, -90, 124, 0.6, '#8d6a80');
          line(ctx, -94, 112, -86, 112, 0.4, '#8d6a80');
        },
      },
      {
        factor: 0.42,
        x0: -240,
        x1: 240,
        y0: -12,
        y1: 46,
        density: 6,
        draw: (ctx: Ctx) => {
          const rng = new Rng(23);
          groundFill(ctx, -240, 240, 0, '#8d5a48', 12);
          const base = (x: number) => 10 + 10 * Math.tanh((-x - 40) / 70);
          drawHillHouses(ctx, -240, 240, rng, base, (x) => base(x) + 4, false);
          for (let i = 0; i < 26; i++) {
            const x = -230 + rng.next() * 460;
            const y = base(x) + 4;
            if (rng.next() < 0.5) waterTank(ctx, x, y, 0.9, rng.next() < 0.6 ? '#2f7fd0' : '#232323');
            else dish(ctx, x, y, 0.8);
          }
        },
      },
      {
        factor: 1,
        x0: -170,
        x1: 230,
        y0: -16,
        y1: 54,
        density: 10,
        draw: (ctx: Ctx) => {
          const rng = new Rng(37);
          groundFill(ctx, -170, 230, -10, '#6b4a3a', 20);
          drawHillHouses(ctx, -170, -4, rng, hill, ground, true);
          drawHillHouses(ctx, 4, 230, rng, hill, ground, true);
          // laje do jogador
          house(ctx, LAJE_X - 4, LAJE_Y - 12, 8, 12, '#b8643a', rng, { brick: true, slab: '#a8a39a' });
          rect(ctx, LAJE_X - 4.2, LAJE_Y - 0.3, 8.4, 0.3, '#a8a39a');
          for (let gx = LAJE_X - 4; gx <= LAJE_X + 4; gx += 0.45) rect(ctx, gx, LAJE_Y, 0.05, 0.9, '#2c2c34');
          rect(ctx, LAJE_X - 4, LAJE_Y + 0.88, 8, 0.08, '#2c2c34');
          waterTank(ctx, LAJE_X + 2.6, LAJE_Y, 0.8, '#2f7fd0');
          clothesline(ctx, LAJE_X - 3.6, LAJE_X - 0.6, LAJE_Y + 1.9, rng);
          // escadaria principal subindo o morro
          for (let s = 0; s < 40; s++) {
            const x = 18 + s * 1.2;
            rect(ctx, x, hill(x) - 2 + s * 0.05, 1.3, 0.35, '#9b958c');
          }
          // perigos: caixas d'água, antenas e parabólicas nos telhados
          for (const h of hazards()) {
            if (h.kind === 'tank') waterTank(ctx, (h.x0 + h.x1) / 2, h.y0, 0.9, rng.next() < 0.6 ? '#2f7fd0' : '#1e1e22');
            else if (h.kind === 'antenna' && h.shape === 'seg') tvAntenna(ctx, h.pts[0], h.pts[1], h.pts[3] - h.pts[1]);
            else if (h.kind === 'antenna') dish(ctx, h.pts[0], h.pts[1] - 1.1, 0.75);
            else if (h.kind === 'post') utilityPole(ctx, h.pts[0], h.pts[1], h.pts[3] - h.pts[1] + 0.4, '#8a847c');
          }
          // pipas presas nos fios (decoração)
          poly(ctx, [-34, 18.5, -33.2, 19.3, -34, 20.1, -34.8, 19.3], '#ff3b5c');
          poly(ctx, [27, 25, 27.7, 25.7, 27, 26.4, 26.3, 25.7], '#ffd400');
        },
      },
    ],
    drawNear: (ctx: Ctx, x0: number, x1: number, t: number) => {
      for (let i = 0; i < wires.length; i++) {
        const w = wires[i];
        if (w.x1 < x0 || w.x0 > x1) continue;
        wirePath(ctx, w.pts, 0.05, '#1d1a22');
      }
      // faísca ocasional num poste
      const k = Math.floor(t * 0.7) % 8;
      if (Math.sin(t * 37) > 0.85) {
        const px = [-70, -46, -22, 14, 38, 62, 88, 116][k];
        const py = groundAt(px) + 4.8;
        if (px > x0 && px < x1) {
          line(ctx, px - 0.4, py, px + 0.3, py + 0.5, 0.06, '#bff6ff');
          line(ctx, px + 0.3, py + 0.5, px - 0.1, py + 0.9, 0.05, '#ffffff');
        }
      }
    },
  };
}

export const FAVELA: SceneDef = {
  id: 'favela',
  name: 'Favela no Morro',
  tagline: 'Da laje, no meio dos fios',
  windLabel: 'Turbulento, com rajadas',
  world,
  art,
};
