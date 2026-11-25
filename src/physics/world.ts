import { LINE_TYPES, MODES, PHYSICS, type LineTypeId, type ModeId } from '../config';
import type { SceneWorld } from '../scenes/types';
import { createFlyer, stepFlyer, type Flyer, type FlyerEnv, type WorldEventType } from './flyer';
import type { WindField } from './wind';

export interface WorldEvent {
  type: WorldEventType;
  flyer: number;
  /** segundo envolvido (ex.: quem cortou) */
  other: number;
  x: number;
  y: number;
  value: number;
}

/** Fila de eventos pré-alocada (sem alocação no loop). */
export class EventQueue {
  readonly items: WorldEvent[];
  count = 0;
  constructor(cap = 96) {
    this.items = [];
    for (let i = 0; i < cap; i++) this.items.push({ type: 'spark', flyer: 0, other: -1, x: 0, y: 0, value: 0 });
  }
  push(type: WorldEventType, flyer: number, x: number, y: number, value: number, other = -1): void {
    if (this.count >= this.items.length) return;
    const e = this.items[this.count++];
    e.type = type;
    e.flyer = flyer;
    e.other = other;
    e.x = x;
    e.y = y;
    e.value = value;
  }
  clear(): void {
    this.count = 0;
  }
}

export interface World {
  mode: ModeId;
  scene: SceneWorld;
  wind: WindField;
  time: number;
  flyers: Flyer[];
  env: FlyerEnv;
  events: EventQueue;
  /** pós-processamento por subpasso (ex.: cortes), registrado pelo modo */
  post: ((w: World, dt: number) => void)[];
}

export interface PlayerLook {
  model: string;
  color: string;
  tail: string;
}

export function createWorld(scene: SceneWorld, mode: ModeId, look: PlayerLook, playerLine: LineTypeId = 'comum'): World {
  const wind: WindField = { profile: scene.wind, zones: scene.zones, groundRef: scene.ground(scene.launch.x) };
  const events = new EventQueue();
  const w: World = {
    mode,
    scene,
    wind,
    time: 0,
    flyers: [],
    events,
    post: [],
    env: {
      wind,
      time: 0,
      ground: scene.ground,
      hazards: scene.hazards,
      lethal: MODES[mode].hazardsLethal,
      lineBreaks: MODES[mode].lineBreaks,
      emit: (type, flyer, x, y, value) => events.push(type, flyer, x, y, value),
    },
  };
  const player = createFlyer(0, true, 'Você', scene.launch.x, scene.launch.y, MODES[mode].stock, LINE_TYPES[playerLine], look, 22);
  w.flyers.push(player);
  return w;
}

/** Um passo fixo (PHYSICS.dt) com subpassos. */
export function stepWorld(w: World): void {
  const n = PHYSICS.substeps;
  const dt = PHYSICS.dt / n;
  for (let s = 0; s < n; s++) {
    w.env.time = w.time;
    for (let i = 0; i < w.flyers.length; i++) stepFlyer(w.flyers[i], w.env, dt);
    for (let i = 0; i < w.post.length; i++) w.post[i](w, dt);
    w.time += dt;
  }
}
