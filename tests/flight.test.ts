import { describe, expect, it } from 'vitest';
import { flatEnv, makeFlyer, run, steadyWind } from './helpers';

describe('(a) voo estável', () => {
  for (const speed of [3, 4, 5, 6, 7, 8, 9]) {
    it(`sustenta voo estável com vento de ${speed} m/s`, () => {
      const env = flatEnv(steadyWind(speed));
      const f = makeFlyer(40);
      run(f, env, 20); // assentar
      let minY = Infinity;
      let maxSpeed = 0;
      let maxTilt = 0;
      run(f, env, 40, () => {
        const k = f.kite;
        minY = Math.min(minY, k.y);
        maxSpeed = Math.max(maxSpeed, Math.hypot(k.vx, k.vy, k.vz));
        maxTilt = Math.max(maxTilt, Math.abs(k.angle - Math.PI / 2));
      });
      // fica no alto (mais de 40% da linha acima da mão), parada e de bico para cima
      expect(minY).toBeGreaterThan(1.4 + 40 * 0.4);
      expect(maxSpeed).toBeLessThan(1.5);
      expect(maxTilt).toBeLessThan(0.35);
      expect(f.status).toBe('flying');
      expect(f.tension).toBeGreaterThan(0.2);
    });
  }

  it('com rajadas a 6 m/s continua no ar por 60 s', () => {
    const env = flatEnv(steadyWind(6, true));
    const f = makeFlyer(50);
    let minY = Infinity;
    run(f, env, 60, () => {
      minY = Math.min(minY, f.kite.y);
    });
    expect(minY).toBeGreaterThan(10);
  });

  it('cabresto deslocado faz a pipa girar (loop) e o puxão gera pico de tensão', () => {
    const env = flatEnv(steadyWind(6));
    const f = makeFlyer(40);
    run(f, env, 10);
    const spin0 = f.spin;
    f.ctrl.steer = 1;
    run(f, env, 3);
    expect(Math.abs(f.spin - spin0)).toBeGreaterThan(Math.PI * 2);
    f.ctrl.steer = 0;
    run(f, env, 12);
    const t0 = f.tension;
    let peak = 0;
    f.ctrl.jerk = true;
    run(f, env, 0.3, () => {
      peak = Math.max(peak, f.tension);
    });
    expect(peak).toBeGreaterThan(t0 * 1.5);
  });
});
