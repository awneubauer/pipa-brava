import { describe, expect, it } from 'vitest';
import { ManeuverTracker } from '../src/game/maneuvers';
import { PHYSICS } from '../src/config';
import { flatEnv, makeFlyer, steadyWind, SUB_DT } from './helpers';
import { stepFlyer } from '../src/physics/flyer';

function play(seconds: number, ctrl: (t: number, f: ReturnType<typeof makeFlyer>) => void) {
  const env = flatEnv(steadyWind(6.3));
  const f = makeFlyer(30);
  const tr = new ManeuverTracker();
  tr.reset(f);
  const hits: string[] = [];
  const steps = Math.round(seconds / PHYSICS.dt);
  for (let s = 0; s < steps; s++) {
    ctrl(env.time, f);
    for (let k = 0; k < PHYSICS.substeps; k++) {
      stepFlyer(f, env, SUB_DT);
      env.time += SUB_DT;
    }
    const h = tr.update(f, 0, PHYSICS.dt);
    if (h) hits.push(h.id);
  }
  return { hits, tr };
}

describe('manobras do arcade', () => {
  it('segurar a curva gera loops com combo', () => {
    const { hits, tr } = play(14, (t, f) => {
      f.ctrl.steer = t > 6 ? 1 : 0;
    });
    expect(hits.filter((h) => h === 'loop').length).toBeGreaterThanOrEqual(3);
    expect(tr.bestCombo).toBeGreaterThanOrEqual(2);
  });

  it('soltar linha até subir bastante gera recorde de altura', () => {
    const { hits } = play(40, (_t, f) => {
      f.ctrl.reel = 1;
    });
    expect(hits).toContain('recorde');
  });

  it('alternar a curva rápido gera zigue-zague', () => {
    const { hits } = play(20, (t, f) => {
      f.ctrl.steer = t > 5 ? (Math.floor(t / 0.9) % 2 ? 0.75 : -0.75) : 0;
    });
    expect(hits).toContain('zigue');
  });
});
