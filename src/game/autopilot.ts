import { TENSION } from '../config';
import type { Flyer } from '../physics/flyer';
import { clamp, wrapAngle } from '../util/noise';

/**
 * Controle fácil (um dedo): a pipa vai até onde o dedo está.
 * - o cabresto gira o bico na direção do dedo e a pipa voa para lá (com inércia e balanço);
 * - o carretel solta ou recolhe sozinho para a pipa alcançar o ponto
 *   (dedo no alto = mais linha = mais alto; dedo embaixo = recolhe);
 * - sem dedo, cabresto neutro: a rabiola endireita a pipa e ela sobe para o topo;
 * - toque rápido = puxão: tranco + recolhida rápida, a pipa dispara.
 * A física é a mesma do modo Pro; só a mão do jogador é ajudada.
 */
export interface EasyState {
  /** tempo restante do recolhimento rápido depois de um puxão */
  boost: number;
}

export function createEasyState(): EasyState {
  return { boost: 0 };
}

export function easyControl(
  f: Flyer,
  active: boolean,
  tx: number,
  ty: number,
  jerk: boolean,
  st: EasyState,
  dt: number,
): void {
  const c = f.ctrl;
  const k = f.kite;
  let steer = 0;
  let reel = 0;
  const L = f.reel.out;
  if (active) {
    // nunca mira dentro do chão
    const floor = f.baseY + 4;
    if (ty < floor) ty = floor;
    const dx = tx - k.x;
    const dy = ty - k.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const err = wrapAngle(want - k.angle);
    // perto do alvo a curva fica mansa (a pipa "dança" ali em vez de girar em falso)
    const near = clamp(dist / 6, 0.25, 1);
    const wDesired = clamp(err * 4.5, -5, 5) * near;
    steer = clamp(-wDesired / 5, -1, 1);
    // linha necessária para alcançar o ponto dentro da janela de vento
    const rho = Math.hypot(tx - f.handX, ty - f.handY);
    const wantL = Math.max(12, rho * 1.18 + 3);
    reel = clamp((wantL - L) / 6, -0.8, 0.9);
  }
  if (jerk) {
    c.jerk = true;
    st.boost = 0.3;
  }
  if (st.boost > 0) {
    st.boost -= dt;
    reel = Math.min(reel, -0.55);
  }
  // carretel automático: recolhe a folga e alivia antes do vermelho
  const d = Math.hypot(k.x - f.handX, k.y - f.handY, k.z - f.handZ);
  if (d < L - 2 && st.boost <= 0) reel = Math.min(reel, -clamp((L - d) / 10, 0.15, 0.6));
  if (f.tension01 > TENSION.yellow + 0.06) reel = Math.max(reel, 0.3);
  c.assist = active ? 1 : 0;
  c.assistX = tx;
  c.assistY = ty < f.baseY + 4 ? f.baseY + 4 : ty;
  c.steer = active ? steer * 0.3 : 0;
  c.handX = 0;
  c.handY = 0;
  c.reel = reel;
}
