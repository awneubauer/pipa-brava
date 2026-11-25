import { LINE_TYPES, PHYSICS } from '../src/config';
import { createFlyer, stepFlyer, type Flyer, type FlyerEnv } from '../src/physics/flyer';
import type { WindField } from '../src/physics/wind';

export function steadyWind(speed: number, gusts = false): WindField {
  return {
    groundRef: 0,
    zones: [],
    profile: {
      baseX: 0,
      baseZ: speed,
      refHeight: 1,
      groundFactor: 1,
      gustLow: gusts ? 0.2 : 0,
      gustHigh: gusts ? 0.1 : 0,
      gustPeriod: 6,
      turbulence: gusts ? 0.08 : 0,
      dirJitter: gusts ? 0.1 : 0,
      seed: 3,
    },
  };
}

export function flatEnv(wind: WindField, lineBreaks = false): FlyerEnv {
  return { wind, time: 0, ground: () => 0, hazards: [], lethal: false, lineBreaks, emit: () => {} };
}

export function makeFlyer(lineOut = 40, stock = 1200): Flyer {
  return createFlyer(0, true, 'teste', 0, 1.4, stock, LINE_TYPES.comum, { model: 'raia', color: '#ff0000', tail: '#ffff00' }, lineOut);
}

export const SUB_DT = PHYSICS.dt / PHYSICS.substeps;

export function run(f: Flyer, env: FlyerEnv, seconds: number, each?: (t: number) => void): void {
  const steps = Math.round(seconds / SUB_DT);
  for (let i = 0; i < steps; i++) {
    each?.(env.time);
    stepFlyer(f, env, SUB_DT);
    env.time += SUB_DT;
  }
}
