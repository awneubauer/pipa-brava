import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config';
import { SimRules } from '../src/game/sim';
import { stepFlyer } from '../src/physics/flyer';
import { makeWire } from '../src/physics/hazards';
import { createWorld, stepWorld } from '../src/physics/world';
import { SCENES } from '../src/scenes/index';
import { flatEnv, makeFlyer, steadyWind, SUB_DT } from './helpers';

describe('cenários', () => {
  it('são 4 e cada um tem vento, perigos e lugares para adversários', () => {
    expect(SCENES.map((s) => s.id).sort()).toEqual(['centroSP', 'favela', 'rio', 'varzea']);
    for (const s of SCENES) {
      const w = s.world();
      expect(w.hazards.length).toBeGreaterThan(3);
      expect(w.opponents.length).toBe(3);
      expect(w.launch.y).toBeGreaterThan(w.ground(w.launch.x));
    }
  });

  for (const s of SCENES)
    it(`${s.name}: 60 s de simulação com 3 adversários sem NaN`, () => {
      const w = createWorld(s.world(), 'sim', { model: 'raia', color: '#ff3b5c', tail: '#ffd400' });
      const sim = new SimRules(w, 3, 'brava');
      for (let i = 0; i < 60 / PHYSICS.dt; i++) {
        sim.think(PHYSICS.dt);
        stepWorld(w);
        w.events.clear();
        sim.judge(PHYSICS.dt);
      }
      for (const f of w.flyers) {
        expect(Number.isFinite(f.kite.x + f.kite.y + f.kite.z + f.tension)).toBe(true);
        expect(f.kite.y).toBeGreaterThan(w.scene.ground(f.kite.x) - 1);
      }
    });
});

describe('perigos', () => {
  function wireAhead(lethal: boolean) {
    const env = flatEnv(steadyWind(6), lethal);
    env.lethal = lethal;
    env.hazards = [makeWire(-30, 16, 30, 16, 0.5)];
    const events: string[] = [];
    env.emit = (t) => events.push(t);
    const f = makeFlyer(30);
    // força um mergulho atravessando o fio
    f.ctrl.steer = 1;
    for (let i = 0; i < 8 / SUB_DT && !events.some((e) => e === 'burn' || e === 'bounce'); i++) {
      stepFlyer(f, env, SUB_DT);
      env.time += SUB_DT;
    }
    return { f, events };
  }

  it('na simulação, encostar no fio queima a pipa', () => {
    const { f, events } = wireAhead(true);
    expect(events).toContain('burn');
    expect(f.status).toBe('burned');
  });

  it('no arcade, só quica com um "Eita!"', () => {
    const { f, events } = wireAhead(false);
    expect(events).toContain('bounce');
    expect(f.status).toBe('flying');
  });
});
