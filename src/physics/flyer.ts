import { HAZARD, KITE, PHYSICS, TENSION, type KiteParams, type LineType } from '../config';
import { clamp, wrapAngle } from '../util/noise';
import { collide, createContact, type Hazard } from './hazards';
import { computeAero, createAero, createKiteBody, integrateKite, steerTorque, type KiteBody } from './kite';
import { createLine, elasticTension, layLine, stepLine, type LineEnv, type LineState } from './line';
import { createReel, stepReel, type ReelState } from './reel';
import { createWindSample, sampleWind, type WindField } from './wind';

export type FlyerStatus = 'flying' | 'snagged' | 'cut' | 'burned' | 'torn' | 'snapped' | 'landed';

/** Comandos (do jogador ou da IA). */
export interface FlyerControl {
  /** deslocamento do cabresto [-1, 1] (+ = gira horário) */
  steer: number;
  /** deslocamento desejado da mão [-1, 1] em cada eixo (y + = para cima) */
  handX: number;
  handY: number;
  /** carretel [-1, 1] (+ = solta) */
  reel: number;
  /** pedido de puxão (consumido no passo) */
  jerk: boolean;
}

export type WorldEventType =
  | 'cut'
  | 'snap'
  | 'burn'
  | 'tear'
  | 'snag'
  | 'freed'
  | 'bounce'
  | 'land'
  | 'redline'
  | 'spark';

export interface FlyerEnv extends LineEnv {
  wind: WindField;
  hazards: Hazard[];
  lethal: boolean;
  lineBreaks: boolean;
  emit: (type: WorldEventType, flyer: number, x: number, y: number, value: number) => void;
}

export interface Flyer {
  index: number;
  isPlayer: boolean;
  name: string;
  params: KiteParams;
  kite: KiteBody;
  line: LineState;
  reel: ReelState;
  lineType: LineType;
  baseX: number;
  baseY: number;
  handX: number;
  handY: number;
  handZ: number;
  handVX: number;
  handVY: number;
  handVZ: number;
  ctrl: FlyerControl;
  steer: number;
  jerkTimer: number;
  tension: number;
  tension01: number;
  /** tensão filtrada (~60 ms): trancos instantâneos não arrebentam sozinhos */
  strain: number;
  redTimer: number;
  status: FlyerStatus;
  statusTimer: number;
  snagX: number;
  snagY: number;
  snagNX: number;
  snagNY: number;
  freeProgress: number;
  /** dano máximo atual entre os cruzamentos (0..1) */
  damage: number;
  bounceCooldown: number;
  grounded: boolean;
  /** rotação acumulada (rad) para manobras */
  spin: number;
  windX: number;
  windY: number;
  windZ: number;
  windGust: number;
  airspeed: number;
  alpha: number;
  swayPhase: number;
  /** cor/modelo (visual) */
  look: { model: string; color: string; tail: string };
}

const aero = createAero();
const ws = createWindSample();
const contact = createContact();

export function createFlyer(
  index: number,
  isPlayer: boolean,
  name: string,
  baseX: number,
  baseY: number,
  stock: number,
  lineType: LineType,
  look: Flyer['look'],
  startOut = 16,
  params: KiteParams = KITE,
): Flyer {
  const f: Flyer = {
    index,
    isPlayer,
    name,
    params,
    kite: createKiteBody(),
    line: createLine(),
    reel: createReel(stock, startOut),
    lineType,
    baseX,
    baseY,
    handX: baseX,
    handY: baseY,
    handZ: 0,
    handVX: 0,
    handVY: 0,
    handVZ: 0,
    ctrl: { steer: 0, handX: 0, handY: 0, reel: 0, jerk: false },
    steer: 0,
    jerkTimer: 0,
    tension: 0,
    tension01: 0,
    strain: 0,
    redTimer: 0,
    status: 'flying',
    statusTimer: 0,
    snagX: 0,
    snagY: 0,
    snagNX: 0,
    snagNY: 1,
    freeProgress: 0,
    damage: 0,
    bounceCooldown: 0,
    grounded: false,
    spin: 0,
    windX: 0,
    windY: 0,
    windZ: 0,
    windGust: 0,
    airspeed: 0,
    alpha: 0,
    swayPhase: index * 1.7,
    look,
  };
  launchFlyer(f);
  return f;
}

/** Posiciona a pipa já no ar, no meio da janela, com a linha esticada. */
export function launchFlyer(f: Flyer, elevationDeg = 55, lateral = 0): void {
  const L = f.reel.out - 0.2;
  const e = (elevationDeg * Math.PI) / 180;
  const k = f.kite;
  k.x = f.baseX + lateral * L;
  const rest = Math.sqrt(Math.max(0, 1 - lateral * lateral)) * L;
  k.y = f.baseY + Math.sin(e) * rest;
  k.z = Math.cos(e) * rest;
  k.vx = k.vy = k.vz = 0;
  k.angle = Math.PI / 2;
  k.omega = 0;
  f.handX = f.baseX;
  f.handY = f.baseY;
  f.handZ = 0;
  f.status = 'flying';
  f.statusTimer = 0;
  layLine(f.line, f.handX, f.handY, k.x, k.y, k.z, f.reel.out);
}

export function isAlive(f: Flyer): boolean {
  return f.status === 'flying' || f.status === 'snagged';
}

/** Corta/arrebenta a linha no segmento `seg` (entre nós seg e seg+1). */
export function severLine(f: Flyer, seg: number, status: FlyerStatus): void {
  if (!isAlive(f)) return;
  f.line.cutIndex = clamp(seg | 0, 0, f.line.n - 2);
  f.status = status;
  f.statusTimer = 0;
  f.tension = 0;
  f.tension01 = 0;
}

/** Um subpasso de física para uma pipa. */
export function stepFlyer(f: Flyer, env: FlyerEnv, dt: number): void {
  const k = f.kite;
  const p = f.params;
  f.statusTimer += dt;
  if (f.bounceCooldown > 0) f.bounceCooldown -= dt;
  const alive = isAlive(f);

  // direção mão → pipa
  let rx = k.x - f.handX;
  let ry = k.y - f.handY;
  let rz = k.z - f.handZ;
  let rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;

  // ---------- mão: puxar (para baixo) afasta a mão da pipa; empurrar dá linha ----------
  const pull = clamp(f.ctrl.handY, -1, 1) * PHYSICS.armReach;
  const side = clamp(f.ctrl.handX, -1, 1) * PHYSICS.armReach * 0.6;
  let tx = f.baseX + rx * pull + side;
  let ty = f.baseY + ry * pull;
  let tz = rz * pull;
  if (f.ctrl.jerk && alive) f.jerkTimer = PHYSICS.jerkDuration;
  f.ctrl.jerk = false;
  let armSpeed = PHYSICS.armSpeed;
  if (f.jerkTimer > 0) {
    f.jerkTimer -= dt;
    const ph = 1 - f.jerkTimer / PHYSICS.jerkDuration;
    const e01 = Math.sin(Math.PI * clamp(ph, 0, 1));
    tx -= rx * PHYSICS.jerkDistance * e01;
    ty -= ry * PHYSICS.jerkDistance * e01;
    tz -= rz * PHYSICS.jerkDistance * e01;
    armSpeed *= 1.8;
  }
  {
    const dx = tx - f.handX;
    const dy = ty - f.handY;
    const dz = tz - f.handZ;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxStep = armSpeed * dt;
    const sc = d > maxStep ? maxStep / d : 1;
    f.handVX = (dx * sc) / dt;
    f.handVY = (dy * sc) / dt;
    f.handVZ = (dz * sc) / dt;
    f.handX += dx * sc;
    f.handY += dy * sc;
    f.handZ += dz * sc;
  }
  f.steer += (clamp(f.ctrl.steer, -1, 1) - f.steer) * Math.min(1, dt * 14);

  sampleWind(ws, env.wind, k.x, k.y, env.time);
  f.windX = ws.x;
  f.windY = ws.y;
  f.windZ = ws.z;
  f.windGust = ws.gust;

  const attached = f.line.cutIndex < 0 && !f.line.handFree;

  if (alive) {
    computeAero(aero, k, p, f.handX, f.handY, f.handZ, ws.x, ws.y, ws.z, PHYSICS.airDensity);
    f.airspeed = aero.airspeed;
    f.alpha = aero.alpha;
    // o arrasto aerodinâmico é "rígido" em alta velocidade para uma pipa leve:
    // a aceleração total é aplicada de forma semi-implícita (o equilíbrio não muda)
    const kd = (PHYSICS.airDensity * (p.area * (p.cl + p.cd90) + p.tailCdA) * aero.airspeed) / p.mass;
    const imp = 1 / (1 + kd * dt * 0.5);
    let fx = aero.fx;
    let fy = aero.fy - p.mass * PHYSICS.gravity;
    let fz = aero.fz;
    let torque = aero.torque;

    // ---------- tração da linha (elástica no trecho da mão) ----------
    let T = 0;
    if (attached) {
      rx = k.x - f.handX;
      ry = k.y - f.handY;
      rz = k.z - f.handZ;
      rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1e-6;
      const ux = rx / rl;
      const uy = ry / rl;
      const uz = rz / rl;
      const extRate = (k.vx - f.handVX) * ux + (k.vy - f.handVY) * uy + (k.vz - f.handVZ) * uz;
      T = elasticTension(rl, f.reel.out, extRate);
      const tMax = f.lineType.breakForce * 3;
      if (T > tMax) T = tMax;
      fx -= T * ux;
      fy -= T * uy;
      fz -= T * uz;
      // peso e arrasto da linha: metade vai para a pipa
      const L = f.reel.out;
      fy -= 0.5 * PHYSICS.lineMassPerMeter * L * PHYSICS.gravity;
      const ldrag = 0.25 * PHYSICS.airDensity * PHYSICS.lineDiameter * L * ws.speed;
      fx += ldrag * ws.x * 0.5;
      fy += ldrag * ws.y * 0.5;
      fz += ldrag * ws.z * 0.5;
      // segurança numérica: nunca deixa a pipa escapar muito além da linha
      const lim = f.reel.out + 1.2;
      if (rl > lim) {
        k.x -= ux * (rl - lim);
        k.y -= uy * (rl - lim);
        k.z -= uz * (rl - lim);
        const vr = k.vx * ux + k.vy * uy + k.vz * uz;
        if (vr > 0) {
          k.vx -= vr * ux;
          k.vy -= vr * uy;
          k.vz -= vr * uz;
        }
      }
    }
    torque += steerTorque(p, f.steer, T, aero.qA);
    f.tension = T;
    f.tension01 = T / f.lineType.breakForce;

    if (f.status === 'snagged') {
      // presa: fica no ponto, balança pendurada, e só sai puxando
      k.x = f.snagX;
      k.y = f.snagY;
      k.vx = k.vy = k.vz = 0;
      const hang = -Math.PI / 2 + 0.45 * Math.sin(f.statusTimer * 2.1);
      k.omega += (wrapAngle(hang - k.angle) * 30 - k.omega * 4) * dt;
      k.angle += k.omega * dt;
      if (f.tension01 > HAZARD.freeTension) f.freeProgress += dt;
      else f.freeProgress = Math.max(0, f.freeProgress - dt * 0.5);
      if (f.freeProgress >= HAZARD.freeTime) {
        f.status = 'flying';
        f.freeProgress = 0;
        k.x += f.snagNX * (p.radius + 0.7);
        k.y += f.snagNY * (p.radius + 0.7);
        k.vx = f.snagNX * 3;
        k.vy = f.snagNY * 3 + 1;
        k.angle = Math.PI / 2;
        k.omega = 0;
        env.emit('freed', f.index, k.x, k.y, 0);
      }
    } else {
      const prevOmega = k.omega;
      integrateKite(k, p, fx * imp, fy * imp, fz * imp, torque, dt);
      // limites de segurança (nunca devem ser atingidos em jogo normal)
      const sp2 = k.vx * k.vx + k.vy * k.vy + k.vz * k.vz;
      if (sp2 > 3600) {
        const sc = 60 / Math.sqrt(sp2);
        k.vx *= sc;
        k.vy *= sc;
        k.vz *= sc;
      }
      if (!(k.x === k.x && k.y === k.y && k.z === k.z && k.angle === k.angle)) {
        launchFlyer(f);
        return;
      }
      if (k.z < 0) {
        k.z = 0;
        if (k.vz < 0) k.vz = 0;
      }
      f.spin += (prevOmega + k.omega) * 0.5 * dt;
      collideHazards(f, env);
      collideGround(f, env, dt);
    }

    // ---------- carretel ----------
    let relief = 0;
    if (!env.lineBreaks && f.tension01 > TENSION.arcadeRelief) {
      relief = (f.tension01 - TENSION.arcadeRelief) * 70;
    }
    const dist = Math.sqrt((k.x - f.handX) ** 2 + (k.y - f.handY) ** 2 + (k.z - f.handZ) ** 2);
    stepReel(f.reel, attached ? f.ctrl.reel : 0, f.tension01, dt, attached ? relief : 0, dist * 1.03 + 2.5);

    if (f.tension01 > TENSION.red) {
      if (f.redTimer === 0) env.emit('redline', f.index, k.x, k.y, f.tension01);
      f.redTimer += dt;
    } else {
      f.redTimer = Math.max(0, f.redTimer - dt * 2);
    }
    f.strain += (f.tension01 - f.strain) * Math.min(1, dt / 0.06);
    if (env.lineBreaks && attached && (f.strain >= 1.6 || f.redTimer > TENSION.redBreakTime)) {
      severLine(f, f.line.n - 3, 'snapped');
      env.emit('snap', f.index, k.x, k.y, 0);
    }
  } else if (f.status !== 'landed') {
    stepFalling(f, env, dt);
  }

  stepLine(f.line, f.handX, f.handY, k.x, k.y, k.z, true, env, dt);
}

/** Pipa sem linha: vira com o vento, balança e desce devagar. */
function stepFalling(f: Flyer, env: FlyerEnv, dt: number): void {
  const k = f.kite;
  f.swayPhase += dt;
  const burned = f.status === 'burned';
  const torn = f.status === 'torn';
  const fallSpeed = burned ? 3.6 : torn ? 2.6 : 1.25;
  const targetVX = f.windX * (burned ? 0.35 : 0.7) + Math.sin(f.swayPhase * 1.1) * 1.2;
  const targetVY = -fallSpeed + Math.sin(f.swayPhase * 2.3) * 0.7;
  const r = Math.min(1, dt * 1.6);
  k.vx += (targetVX - k.vx) * r;
  k.vy += (targetVY - k.vy) * r;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  k.vz *= 1 - Math.min(1, dt * 2);
  k.z = Math.max(0, k.z + k.vz * dt);
  const targetA = Math.PI / 2 + 0.25 + Math.sin(f.swayPhase * 1.7) * 0.9 + (torn ? f.swayPhase * 2 : 0);
  k.omega += ((targetA - k.angle) * 6 - k.omega * 2.5) * dt;
  k.angle += k.omega * dt;
  f.tension = 0;
  f.tension01 = 0;
  const gy = env.ground(k.x) + 0.25;
  if (k.y <= gy) {
    k.y = gy;
    k.vx = 0;
    k.vy = 0;
    k.omega = 0;
    f.status = 'landed';
    f.statusTimer = 0;
    env.emit('land', f.index, k.x, k.y, 0);
  }
}

function collideGround(f: Flyer, env: FlyerEnv, dt: number): void {
  const k = f.kite;
  const gy = env.ground(k.x) + f.params.radius * 0.6;
  f.grounded = false;
  if (k.y < gy) {
    k.y = gy;
    if (k.vy < 0) k.vy *= -0.15;
    k.vx *= 0.9;
    k.vz *= 0.9;
    k.omega *= 0.8;
    // no chão o vento e a rabiola "levantam" o bico: pronta para subir de novo
    k.angle += wrapAngle(Math.PI / 2 - k.angle) * Math.min(1, dt * 3);
    f.grounded = true;
  }
}

function collideHazards(f: Flyer, env: FlyerEnv): void {
  const k = f.kite;
  const hs = env.hazards;
  const r = f.params.radius;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (!collide(contact, h, k.x, k.y, r)) continue;
    const speed = Math.hypot(k.vx, k.vy);
    if (!env.lethal) {
      // arcade: quica de leve
      k.x += contact.nx * contact.depth;
      k.y += contact.ny * contact.depth;
      const vn = k.vx * contact.nx + k.vy * contact.ny;
      if (vn < 0) {
        k.vx -= 1.45 * vn * contact.nx;
        k.vy -= 1.45 * vn * contact.ny;
      }
      k.omega *= 0.6;
      if (f.bounceCooldown <= 0) {
        f.bounceCooldown = 1.1;
        env.emit('bounce', f.index, contact.px, contact.py, i);
      }
      continue;
    }
    if (h.kind === 'wire') {
      severLine(f, Math.floor(f.line.n * 0.6), 'burned');
      env.emit('burn', f.index, contact.px, contact.py, i);
      return;
    }
    if (speed > HAZARD.tearSpeed) {
      severLine(f, f.line.n - 2, 'torn');
      env.emit('tear', f.index, contact.px, contact.py, i);
      return;
    }
    f.status = 'snagged';
    f.statusTimer = 0;
    f.freeProgress = 0;
    f.snagX = k.x + contact.nx * contact.depth * 0.5;
    f.snagY = k.y + contact.ny * contact.depth * 0.5;
    f.snagNX = contact.nx;
    f.snagNY = contact.ny;
    env.emit('snag', f.index, contact.px, contact.py, i);
    return;
  }
}
