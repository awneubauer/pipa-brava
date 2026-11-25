import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config';
import { createWorld, stepWorld } from '../src/physics/world';
import { getScene } from '../src/scenes/index';

function finiteFlyerState(w: ReturnType<typeof createWorld>): boolean {
  for (const f of w.flyers) {
    const k = f.kite;
    for (const v of [k.x, k.y, k.z, k.vx, k.vy, k.vz, k.angle, k.omega, f.tension, f.reel.out]) if (!Number.isFinite(v)) return false;
    for (let i = 0; i < f.line.n; i++) if (!Number.isFinite(f.line.px[i]) || !Number.isFinite(f.line.py[i]) || !Number.isFinite(f.line.pz[i])) return false;
  }
  return true;
}

describe('(b) simulação headless longa', () => {
  it('10 minutos com comandos aleatórios sem NaN nem explosão da linha', () => {
    const w = createWorld(getScene('varzea').world(), 'arcade', { model: 'raia', color: '#f00', tail: '#ff0' });
    const p = w.flyers[0];
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const steps = Math.round(600 / PHYSICS.dt);
    let maxStretch = 0;
    for (let s = 0; s < steps; s++) {
      if (s % 30 === 0) {
        p.ctrl.steer = rnd() * 2 - 1;
        p.ctrl.handY = rnd() * 2 - 1;
        p.ctrl.handX = rnd() * 2 - 1;
        p.ctrl.reel = rnd() < 0.5 ? rnd() * 2 - 1 : 0;
        if (rnd() < 0.1) p.ctrl.jerk = true;
      }
      stepWorld(w);
      w.events.clear();
      if (s % 60 === 0) {
        expect(finiteFlyerState(w)).toBe(true);
        // a corrente nunca estica muito além do comprimento de linha solta
        const l = p.line;
        let len = 0;
        for (let i = 0; i < l.n - 1; i++) len += Math.hypot(l.px[i + 1] - l.px[i], l.py[i + 1] - l.py[i], l.pz[i + 1] - l.pz[i]);
        maxStretch = Math.max(maxStretch, len / p.reel.out);
        const d = Math.hypot(p.kite.x - p.handX, p.kite.y - p.handY, p.kite.z - p.handZ);
        expect(d).toBeLessThan(p.reel.out + 2);
      }
    }
    expect(finiteFlyerState(w)).toBe(true);
    expect(maxStretch).toBeLessThan(1.25);
  });
});
