import { makeCircle, makeRect, makeSeg, makeWire, type Hazard } from '../physics/hazards';
import { Rng } from '../util/noise';
import { circle, groundFill, line, palm, poly, rect, wirePath, type Ctx } from './common';
import type { SceneArt, SceneDef, SceneWorld } from './types';

/**
 * Rio de Janeiro: orla de Copacabana com o calçadão de ondas pretas e brancas,
 * mar, Pão de Açúcar com o bondinho e o Cristo Redentor no Corcovado.
 * Brisa marítima forte e estável.
 */

const PALMS = [-34, -19, 17, 33, 52, 71];
const LAMPS = [-48, -8, 26, 62];

function hazards(): Hazard[] {
  const h: Hazard[] = [];
  for (const x of PALMS) {
    const top = 9 + ((x * 7) % 3);
    h.push(makeSeg('tree', x, 0, x + 0.8, top, 0.3));
    h.push(makeCircle('tree', x + 0.8, top + 0.4, 2.4));
  }
  for (const x of LAMPS) h.push(makeSeg('post', x, 0, x, 10, 0.16));
  // fiação só entre dois postes no começo da orla
  h.push(makeWire(-48, 9.6, -8, 9.6, 1.6));
  h.push(makeWire(26, 9.6, 62, 9.6, 1.4));
  // quiosque
  h.push(makeRect('building', 4, 0, 10, 3.2));
  return h;
}

function world(): SceneWorld {
  return {
    id: 'rio',
    wind: {
      baseX: -0.6,
      baseZ: 7.6,
      refHeight: 20,
      groundFactor: 0.7,
      gustLow: 0.09,
      gustHigh: 0.05,
      gustPeriod: 9,
      turbulence: 0.04,
      dirJitter: 0.06,
      seed: 505,
    },
    zones: [],
    ground: () => 0,
    launch: { x: 0, y: 1.35 },
    opponents: [
      { x: -40, y: 1.35 },
      { x: 42, y: 1.35 },
      { x: 84, y: 1.35 },
    ],
    hazards: hazards(),
    minX: -240,
    maxX: 240,
  };
}

/** Pão de Açúcar + Morro da Urca + bondinho (unidades da camada). */
function paoDeAcucar(ctx: Ctx, cx: number, base: number): void {
  // Urca (mais baixo, arredondado)
  ctx.beginPath();
  ctx.moveTo(cx - 70, base);
  ctx.bezierCurveTo(cx - 62, base + 40, cx - 30, base + 46, cx - 14, base + 30);
  ctx.lineTo(cx - 8, base);
  ctx.closePath();
  ctx.fillStyle = '#5e5f86';
  ctx.fill();
  // Pão de Açúcar (pão alto, paredes íngremes)
  ctx.beginPath();
  ctx.moveTo(cx - 16, base);
  ctx.bezierCurveTo(cx - 18, base + 70, cx - 8, base + 108, cx + 6, base + 110);
  ctx.bezierCurveTo(cx + 20, base + 108, cx + 28, base + 70, cx + 32, base);
  ctx.closePath();
  ctx.fillStyle = '#4e4f78';
  ctx.fill();
  // luz do pôr do sol na face
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - 14, base);
  ctx.bezierCurveTo(cx - 16, base + 68, cx - 7, base + 104, cx + 4, base + 108);
  ctx.bezierCurveTo(cx - 2, base + 80, cx - 4, base + 40, cx + 2, base);
  ctx.closePath();
  ctx.fillStyle = '#ffb27a';
  ctx.fill();
  ctx.globalAlpha = 1;
  // vegetação
  for (let i = 0; i < 18; i++) circle(ctx, cx - 62 + i * 3.4, base + 3 + Math.sin(i) * 2, 3, '#3f5a62');
  // cabos do bondinho
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = 'rgba(30,30,50,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx - 100, base + 6);
  ctx.quadraticCurveTo(cx - 70, base + 22, cx - 38, base + 44);
  ctx.moveTo(cx - 36, base + 44);
  ctx.quadraticCurveTo(cx - 14, base + 72, cx + 4, base + 111);
  ctx.stroke();
  // estações e bondinhos
  rect(ctx, cx - 40, base + 42, 5, 3, '#d8d0c0');
  rect(ctx, cx + 1, base + 109, 6, 3, '#d8d0c0');
  rect(ctx, cx - 72, base + 18.5, 3, 2.2, '#e94b4b');
  line(ctx, cx - 70.5, base + 20.7, cx - 70.5, base + 22.4, 0.3, '#333');
  rect(ctx, cx - 16, base + 70, 3, 2.2, '#e94b4b');
  line(ctx, cx - 14.5, base + 72.2, cx - 14.5, base + 73.8, 0.3, '#333');
}

/** Corcovado com o Cristo (unidades da camada). */
function corcovado(ctx: Ctx, cx: number, base: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - 130, base);
  ctx.bezierCurveTo(cx - 70, base + 50, cx - 34, base + 96, cx - 8, base + 150);
  ctx.lineTo(cx + 5, base + 151);
  ctx.bezierCurveTo(cx + 14, base + 128, cx + 13, base + 102, cx + 24, base + 84);
  ctx.bezierCurveTo(cx + 50, base + 50, cx + 90, base + 22, cx + 120, base);
  ctx.closePath();
  ctx.fillStyle = '#6d6a96';
  ctx.fill();
  // pedestal e estátua (braços abertos)
  rect(ctx, cx - 2.2, base + 150, 4.4, 4, '#e8e2f0');
  rect(ctx, cx - 1.2, base + 154, 2.4, 13, '#f4efff');
  rect(ctx, cx - 9, base + 163.5, 18, 1.6, '#f4efff');
  circle(ctx, cx, base + 168.3, 1.2, '#f4efff');
  // halo de luz
  ctx.globalAlpha = 0.25;
  circle(ctx, cx, base + 162, 12, '#fff3d0');
  ctx.globalAlpha = 1;
}

function art(): SceneArt {
  const hz = hazards();
  const wires = hz.filter((h) => h.kind === 'wire');
  return {
    sky: ['#2c3f92', '#5b56a4', '#d26b8f', '#ff9e5e', '#ffd889'],
    sun: { x: 0.78, y: 0.12, r: 0.075, color: '#fff3c8' },
    bgKites: 6,
    layers: [
      {
        factor: 0.05,
        scale: 0.27,
        x0: -420,
        x1: 420,
        y0: -20,
        y1: 180,
        density: 3,
        draw: (ctx: Ctx) => {
          // mar até o horizonte, com reflexos do sol
          groundFill(ctx, -420, 420, 0, '#2b6fa0', 20);
          const rng = new Rng(61);
          for (let i = 0; i < 160; i++) {
            const x = -420 + rng.next() * 840;
            const y = -rng.next() * 19;
            rect(ctx, x, y, 3 + rng.next() * 8, 0.5, rng.next() < 0.5 ? 'rgba(255,220,160,0.6)' : 'rgba(255,255,255,0.35)');
          }
          for (let i = 0; i < 5; i++) {
            const x = -380 + i * 170 + rng.next() * 40;
            poly(ctx, [x, -6, x + 8, -6, x + 6.5, -7.5, x + 1.5, -7.5], '#f2efe6');
            poly(ctx, [x + 4, -6, x + 4, 1, x + 7, -5.4], '#ffffff');
          }
          // morros e monumentos
          // morros do fundo
          ctx.beginPath();
          ctx.moveTo(-260, 0);
          ctx.bezierCurveTo(-220, 50, -160, 60, -120, 20);
          ctx.lineTo(-110, 0);
          ctx.fillStyle = '#7a73a0';
          ctx.fill();
          corcovado(ctx, -62, 0);
          paoDeAcucar(ctx, 52, 0);
          // ilhas
          ctx.beginPath();
          ctx.ellipse(280, 0, 30, 9, 0, Math.PI, 0, true);
          ctx.fillStyle = '#6b6995';
          ctx.fill();
        },
      },
      {
        factor: 0.3,
        x0: -300,
        x1: 300,
        y0: -16,
        y1: 4,
        density: 5,
        draw: (ctx: Ctx) => {
          const rng = new Rng(61);
          // areia entre o calçadão e o mar, com a espuma das ondas na beira
          groundFill(ctx, -300, 300, 0, '#f2d9a2', 16);
          rect(ctx, -300, -0.5, 600, 0.5, '#ffffff');
          rect(ctx, -300, -1.2, 600, 0.6, '#e2c690');
          // guarda-sóis
          for (let i = 0; i < 16; i++) {
            const x = -290 + i * 37 + rng.next() * 12;
            const y = -2 - rng.next() * 8;
            line(ctx, x, y, x, y + 2.2, 0.12, '#888');
            ctx.beginPath();
            ctx.arc(x, y + 2.2, 1.6, Math.PI, 0, true);
            ctx.fillStyle = ['#ff5a6e', '#ffd23f', '#2fb6ff', '#7bd36b'][i % 4];
            ctx.fill();
          }
        },
      },
      {
        factor: 1,
        x0: -170,
        x1: 170,
        y0: -30,
        y1: 16,
        density: 10,
        draw: (ctx: Ctx) => {
          // calçadão de Copacabana: ondas pretas e brancas paralelas à praia
          const top = 0;
          const bottom = -9;
          groundFill(ctx, -170, 170, top, '#f4f1ea', 9);
          ctx.fillStyle = '#1d1d22';
          for (let band = 0; band < 3; band++) {
            const y0 = bottom + 0.9 + band * 2.8;
            ctx.beginPath();
            ctx.moveTo(-170, y0);
            for (let x = -170; x <= 170; x += 0.5) ctx.lineTo(x, y0 + Math.sin(x * 0.42) * 0.6);
            for (let x = 170; x >= -170; x -= 0.5) ctx.lineTo(x, y0 + 1.15 + Math.sin(x * 0.42) * 0.6);
            ctx.closePath();
            ctx.fill();
          }
          rect(ctx, -170, -0.15, 340, 0.15, '#d9d2c4');
          // meio-fio e pista
          rect(ctx, -170, bottom - 0.5, 340, 0.5, '#c9c2b6');
          groundFill(ctx, -170, 170, bottom - 0.5, '#3d3a42', 21);
          for (let x = -168; x < 170; x += 7) rect(ctx, x, bottom - 5, 3.4, 0.25, '#f2f0e6');
          // quiosque
          rect(ctx, 4, 0, 6, 2.6, '#f2f0e6');
          rect(ctx, 4.6, 0.8, 4.8, 1.2, '#2f8f6a');
          poly(ctx, [3.4, 2.6, 10.6, 2.6, 9.6, 3.4, 4.4, 3.4], '#e94b4b');
          for (let i = 0; i < 4; i++) circle(ctx, 2 + i * 3.3, 0.3, 0.3, '#ffcf3f');
          // coqueiros e postes da orla
          for (const x of PALMS) {
            const topY = 9 + ((x * 7) % 3);
            palm(ctx, x, 0, topY, 0.8, '#8a6a42', '#2f7a3e');
          }
          for (const x of LAMPS) {
            rect(ctx, x - 0.12, 0, 0.24, 10, '#5d6a70');
            line(ctx, x, 9.8, x + 1.4, 10.3, 0.12, '#5d6a70');
            circle(ctx, x + 1.5, 10.1, 0.28, '#ffe9a8');
          }
        },
      },
    ],
    drawNear: (ctx: Ctx, x0: number, x1: number, t: number) => {
      for (let i = 0; i < wires.length; i++) {
        const w = wires[i];
        if (w.x1 < x0 || w.x0 > x1) continue;
        wirePath(ctx, w.pts, 0.05, '#1f1c24');
      }
      // reflexo piscando nas luminárias da orla
      if (Math.sin(t * 2) > 0.6) for (let i = 0; i < LAMPS.length; i++) circle(ctx, LAMPS[i] + 1.5, 10.1, 0.45, 'rgba(255,240,180,0.5)');
    },
  };
}

export const RIO: SceneDef = {
  id: 'rio',
  name: 'Rio de Janeiro',
  tagline: 'Orla de Copacabana',
  windLabel: 'Brisa do mar forte e estável',
  world,
  art,
};
