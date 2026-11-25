import { describe, expect, it } from 'vitest';
import { MODES, PHYSICS } from '../src/config';
import { createReel, remaining, stepReel } from '../src/physics/reel';
import { flatEnv, makeFlyer, run, steadyWind } from './helpers';

describe('(d) estoque do carretel', () => {
  it('nunca fica negativo nem passa do limite com comandos aleatórios', () => {
    for (const stock of [MODES.arcade.stock, MODES.sim.stock, 50]) {
      const r = createReel(stock, 10);
      let seed = 7;
      for (let i = 0; i < 40000; i++) {
        seed = (seed * 16807) % 2147483647;
        const u = seed / 2147483647;
        const cmd = u * 2.6 - 1.3;
        const tension = ((seed >> 3) % 1000) / 600;
        const extra = i % 97 === 0 ? 500 : 0;
        stepReel(r, cmd, tension, 1 / 120, extra);
        expect(r.out).toBeGreaterThanOrEqual(Math.min(PHYSICS.minLineOut, stock));
        expect(r.out).toBeLessThanOrEqual(stock);
        expect(remaining(r)).toBeGreaterThanOrEqual(0);
        expect(remaining(r)).toBeLessThanOrEqual(stock);
      }
    }
  });

  it('entradas inválidas (NaN/infinito) não quebram o estoque', () => {
    const r = createReel(800, 10);
    stepReel(r, NaN, NaN, 1 / 120);
    stepReel(r, Infinity, 0.5, 1 / 120);
    stepReel(r, -Infinity, 0.5, 1 / 120);
    expect(Number.isFinite(r.out)).toBe(true);
    expect(r.out).toBeGreaterThanOrEqual(PHYSICS.minLineOut);
    expect(r.out).toBeLessThanOrEqual(800);
  });

  it('no voo, soltar até o fim do estoque para no limite e não solta mais', () => {
    const env = flatEnv(steadyWind(8));
    const f = makeFlyer(40, 120);
    f.ctrl.reel = 1;
    run(f, env, 120);
    expect(f.reel.out).toBeLessThanOrEqual(120);
    expect(remaining(f.reel)).toBeGreaterThanOrEqual(0);
    expect(f.reel.out).toBeGreaterThan(100);
    f.ctrl.reel = -1;
    run(f, env, 30);
    expect(f.reel.out).toBeGreaterThanOrEqual(PHYSICS.minLineOut);
  });
});
