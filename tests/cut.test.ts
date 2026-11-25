import { describe, expect, it } from 'vitest';
import { LINE_TYPES, PHYSICS } from '../src/config';
import { CutSystem, concentration, damageRate, segmentIntersect } from '../src/physics/cut';
import { createFlyer, type Flyer } from '../src/physics/flyer';
import { createWorld, stepWorld } from '../src/physics/world';
import { SimRules } from '../src/game/sim';
import { getScene } from '../src/scenes/index';

const DT = PHYSICS.dt / PHYSICS.substeps;

function straight(f: Flyer, x0: number, y0: number, x1: number, y1: number, vx: number, vy: number, dt: number) {
  const l = f.line;
  for (let i = 0; i < l.n; i++) {
    const t = i / (l.n - 1);
    l.px[i] = x0 + (x1 - x0) * t;
    l.py[i] = y0 + (y1 - y0) * t;
    l.pz[i] = 0;
    l.ox[i] = l.px[i] - vx * dt;
    l.oy[i] = l.py[i] - vy * dt;
    l.oz[i] = 0;
  }
}

/**
 * Duelo sintético entre duas linhas iguais (Comum × Comum) cruzadas:
 * uma linha desliza sobre a outra com velocidade e tensão constantes.
 * Retorna o tempo de deslizamento ativo até o primeiro rompimento.
 */
function duel(opts: { slide: number; tension: number; mode: 'lateral' | 'puxando' | 'soltando' }): number {
  const look = { model: 'raia', color: '#f00', tail: '#ff0' };
  const A = createFlyer(0, true, 'A', 0, 0, 800, LINE_TYPES.comum, look, 60);
  const B = createFlyer(1, false, 'B', 40, 0, 800, LINE_TYPES.comum, look, 60);
  const cs = new CutSystem();
  cs.setPairs([0, 1]);
  let cutAt = -1;
  let t = 0;
  let pos = 0;
  for (let s = 0; s < 20 / DT && cutAt < 0; s++) {
    A.tension01 = B.tension01 = opts.tension;
    A.reel.rate = B.reel.rate = 0;
    if (opts.mode === 'lateral') {
      // A se move de lado (perpendicular a ela mesma), B parada
      pos += opts.slide * DT;
      straight(A, -20 + pos * 0.0, 0, 20, 60, 0, 0, DT);
      straight(A, -20 + pos, 0, 20 + pos, 60, opts.slide, 0, DT);
      straight(B, 40, 0, -40, 60, 0, 0, DT);
    } else {
      // A fixa no espaço, mas sua linha corre pelo cruzamento (puxada ou solta do carretel)
      straight(A, -20, 0, 20, 60, 0, 0, DT);
      A.reel.rate = opts.mode === 'soltando' ? opts.slide * 2 : -opts.slide * 2;
      straight(B, 40, 0, -40, 60, 0, 0, DT);
    }
    cs.step([A, B], DT, (type, fl) => {
      if (type === 'cut' && cutAt < 0) cutAt = t + DT;
      void fl;
    });
    const c = cs.crossings.find((k) => k.active);
    if (c && c.rateA + c.rateB > 0.05) t += DT;
  }
  return cutAt;
}

describe('(c) corte entre linhas iguais', () => {
  for (const mode of ['lateral', 'puxando', 'soltando'] as const)
    for (const slide of [2, 3, 4])
      for (const tension of [0.4, 0.5, 0.6])
        it(`${mode}, deslizando ${slide} m/s, tensão ${tension}: resolve entre 1,5 e 4 s`, () => {
          const t = duel({ slide, tension, mode });
          expect(t).toBeGreaterThanOrEqual(1.5);
          expect(t).toBeLessThanOrEqual(4);
        });

  it('linha frouxa não corta e linha parada quase não corta', () => {
    expect(damageRate(1, 3, 0, 0.5, 1, 1)).toBe(0);
    expect(damageRate(1, 0, 0.5, 0.5, 1, 1)).toBe(0);
  });

  it('quem faz a própria linha correr concentra o desgaste no outro', () => {
    expect(concentration(3, 0)).toBeLessThan(1);
    expect(concentration(0, 3)).toBeGreaterThan(1);
    expect(concentration(1, 1)).toBeCloseTo(1, 5);
  });

  it('linha mais afiada corta mais rápido', () => {
    const comum = damageRate(LINE_TYPES.comum.sharpness, 3, 0.5, 0.5, 1, 1);
    const sup = damageRate(LINE_TYPES.super.sharpness, 3, 0.5, 0.5, 1, 1);
    expect(sup).toBeGreaterThan(comum * 1.5);
  });

  it('interseção de segmentos', () => {
    const h = { t: 0, u: 0, x: 0, y: 0 };
    expect(segmentIntersect(0, 0, 10, 10, 0, 10, 10, 0, h)).toBe(true);
    expect(h.x).toBeCloseTo(5);
    expect(segmentIntersect(0, 0, 1, 1, 5, 5, 6, 7, h)).toBe(false);
  });
});

describe('simulação com IA', () => {
  it('a IA engaja, os cortes acontecem e a partida termina sem NaN', () => {
    const origRandom = Math.random;
    let sd = 42;
    Math.random = () => {
      sd = (sd * 16807) % 2147483647;
      return sd / 2147483647;
    };
    try {
      const w = createWorld(getScene('varzea').world(), 'sim', { model: 'raia', color: '#ff3b5c', tail: '#ffd400' });
      const sim = new SimRules(w, 1, 'media');
      let contact = 0;
      let cutEvents = 0;
      for (let s = 0; s < 120 / PHYSICS.dt; s++) {
        sim.think(PHYSICS.dt);
        stepWorld(w);
        for (let i = 0; i < w.events.count; i++) if (w.events.items[i].type === 'cut') cutEvents++;
        w.events.clear();
        if (sim.cuts.inContact(w.flyers[0])) contact += PHYSICS.dt;
        for (const f of w.flyers) expect(Number.isFinite(f.kite.x + f.kite.y + f.kite.z)).toBe(true);
        if (sim.judge(PHYSICS.dt)) break;
      }
      expect(contact).toBeGreaterThan(1);
      expect(cutEvents).toBeGreaterThanOrEqual(1);
      expect(sim.outcome).not.toBe('playing');
    } finally {
      Math.random = origRandom;
    }
  });
});
