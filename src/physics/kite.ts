import type { KiteParams } from '../config';

/**
 * Pipa como corpo rígido. O jogo é visto de frente, como quem está na laje
 * olhando a pipa: x = lateral (tela), y = altura (tela), z = profundidade a
 * favor do vento (escondida). A pipa vive sobre a "janela de vento" (esfera
 * de raio = linha ao redor da mão).
 *
 * `angle` é a direção do bico projetada na tela; `omega` sua velocidade angular.
 */
export interface KiteBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  omega: number;
}

export function createKiteBody(): KiteBody {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, angle: Math.PI / 2, omega: 0 };
}

export interface AeroResult {
  fx: number;
  fy: number;
  fz: number;
  /** torque de estabilização (rabiola + amortecimento), no plano da tela */
  torque: number;
  /** ângulo de ataque (rad) entre o vento relativo e a face da pipa */
  alpha: number;
  airspeed: number;
  /** pressão dinâmica × área (N) */
  qA: number;
  /** direção do bico em 3D (unitária) */
  tx: number;
  ty: number;
  tz: number;
}

export function createAero(): AeroResult {
  return { fx: 0, fy: 0, fz: 0, torque: 0, alpha: 0, airspeed: 0, qA: 0, tx: 0, ty: 1, tz: 0 };
}

/**
 * Forças aerodinâmicas de placa plana.
 * - A face da pipa fica presa ao cabresto: sua normal é a direção da linha
 *   inclinada `pitch` para o bico (é isso que faz a pipa "andar para o bico").
 * - α = ângulo entre o vento relativo e a face. Cl = cl·sin(2α), Cd = cd0 + cd90·sin²α.
 * - Sustentação ⟂ ao vento relativo (no plano do vento e da normal), arrasto ao longo dele.
 * - Rabiola: puxa o bico para cima (peso), alinha com o movimento e amortece o giro.
 *
 * (hx, hy, hz) é a mão. Pura: escreve em `out`, sem alocar.
 */
export function computeAero(
  out: AeroResult,
  b: KiteBody,
  p: KiteParams,
  hx: number,
  hy: number,
  hz: number,
  windX: number,
  windY: number,
  windZ: number,
  rho: number,
): AeroResult {
  // direção radial (mão → pipa)
  let rx = b.x - hx;
  let ry = b.y - hy;
  let rz = b.z - hz;
  let rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rl < 1e-4) {
    rx = 0;
    ry = 0.6;
    rz = 0.8;
    rl = 1;
  }
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // bico: direção da tela projetada no plano tangente à janela
  const sx = Math.cos(b.angle);
  const sy = Math.sin(b.angle);
  const sd = sx * rx + sy * ry;
  let tx = sx - sd * rx;
  let ty = sy - sd * ry;
  let tz = -sd * rz;
  let tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tl < 0.05) {
    // pipa na borda com o bico apontando para fora: usa a perpendicular lateral
    tx = -sy;
    ty = sx;
    tz = 0;
    tl = 1;
  }
  tx /= tl;
  ty /= tl;
  tz /= tl;
  // normal da face: linha inclinada para o bico
  const cp = Math.cos(p.pitch);
  const sp = Math.sin(p.pitch);
  let nx = rx * cp + tx * sp;
  let ny = ry * cp + ty * sp;
  let nz = rz * cp + tz * sp;

  const ax = windX - b.vx;
  const ay = windY - b.vy;
  const az = windZ - b.vz;
  const s = Math.sqrt(ax * ax + ay * ay + az * az);
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let alpha = 0;
  let qA = 0;
  if (s > 1e-4) {
    const ux = ax / s;
    const uy = ay / s;
    const uz = az / s;
    let dn = ux * nx + uy * ny + uz * nz;
    if (dn < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      dn = -dn;
    }
    alpha = Math.asin(dn > 1 ? 1 : dn);
    const sa = dn;
    const cl = p.cl * Math.sin(2 * alpha);
    const cd = p.cd0 + p.cd90 * sa * sa;
    qA = 0.5 * rho * s * s * p.area;
    // direção da sustentação: parte da normal perpendicular ao vento relativo
    let lx = nx - dn * ux;
    let ly = ny - dn * uy;
    let lz = nz - dn * uz;
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (ll > 1e-5) {
      lx /= ll;
      ly /= ll;
      lz /= ll;
    } else {
      lx = ly = lz = 0;
    }
    fx = qA * (cl * lx + cd * ux);
    fy = qA * (cl * ly + cd * uy);
    fz = qA * (cl * lz + cd * uz);
    // arrasto da rabiola (sempre na direção do vento relativo)
    const tq = 0.5 * rho * s * s * p.tailCdA;
    fx += tq * ux;
    fy += tq * uy;
    fz += tq * uz;
  }

  // ---- rabiola e estabilidade de rumo (no plano da tela) ----
  const vs2 = b.vx * b.vx + b.vy * b.vy;
  let torque = 0;
  // peso e arrasto da rabiola endireitam o bico para cima (estável em angle = 90°);
  // cresce com o vento, mas satura para não impedir as manobras
  const upright = p.tailWeightTorque + p.tailUpright * Math.tanh(qA / 25);
  torque += upright * Math.cos(b.angle);
  if (vs2 > 0.04) {
    // arrasto da rabiola alinha o bico com o movimento (cata-vento)
    const va = Math.atan2(b.vy, b.vx);
    torque += p.tailAlign * vs2 * Math.sin(va - b.angle) * 0.5 * rho;
  }
  torque -= (p.angDamp + p.tailDamp * Math.sqrt(vs2 + s * s * 0.25)) * b.omega;

  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  out.torque = torque;
  out.alpha = alpha;
  out.airspeed = s;
  out.qA = qA;
  out.tx = tx;
  out.ty = ty;
  out.tz = tz;
  return out;
}

/** Torque de curva do cabresto deslocado: braço lateral × tração (+ mínimo pelo vento). */
export function steerTorque(p: KiteParams, steer: number, tension: number, qA: number): number {
  // a tração satura: com a linha muito esticada a pipa não gira mais rápido que um limite
  const drive = 8 * Math.tanh((tension + p.steerAssist * qA) / 8);
  return -steer * p.bridleRange * drive;
}

/** Integração semi-implícita de Euler. */
export function integrateKite(
  b: KiteBody,
  p: KiteParams,
  fx: number,
  fy: number,
  fz: number,
  torque: number,
  dt: number,
): void {
  b.vx += (fx / p.mass) * dt;
  b.vy += (fy / p.mass) * dt;
  b.vz += (fz / p.mass) * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.omega += (torque / p.inertia) * dt;
  if (b.omega > 30) b.omega = 30;
  else if (b.omega < -30) b.omega = -30;
  b.angle += b.omega * dt;
  if (b.angle > Math.PI * 3) b.angle -= Math.PI * 2;
  else if (b.angle < -Math.PI) b.angle += Math.PI * 2;
}
