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
export type Maneuver = 'none' | 'puxada' | 'embicada' | 'linha' | 'recolhe';

export interface EasyState {
  /** tempo restante do recolhimento rápido depois de um puxão */
  boost: number;
  /** manobra de carretel em andamento e quanto falta */
  move: Maneuver;
  moveT: number;
  /** alvo da embicada / direção da fuga */
  mx: number;
  my: number;
}

export function createEasyState(): EasyState {
  return { boost: 0, move: 'none', moveT: 0, mx: 0, my: 0 };
}

/**
 * Comandos de carretel (botão PUXA!):
 * - puxada (1 toque): recolhe com força, a pipa dispara para onde o bico aponta;
 * - embicada (2 toques): mergulho rápido no ponto (mx, my) — o ataque;
 * - linha (segurar): dá linha, a pipa recua na direção (mx, my) — a fuga.
 */
export function startManeuver(st: EasyState, m: Maneuver, mx: number, my: number): void {
  st.move = m;
  st.moveT = m === 'puxada' ? 0.3 : m === 'embicada' ? 0.5 : 0.12;
  st.mx = mx;
  st.my = my;
}

export function easyControl(
  f: Flyer,
  active: boolean,
  tx: number,
  ty: number,
  // (os parâmetros podem ser sobrescritos por uma manobra em andamento)
  jerk: boolean,
  st: EasyState,
  dt: number,
): void {
  const c = f.ctrl;
  const k = f.kite;
  let steer = 0;
  let reel = 0;
  const L = f.reel.out;
  c.assistBoost = 1;
  let forceReel: number | null = null;
  let recolhendo = false;
  if (st.moveT > 0) {
    st.moveT -= dt;
    active = true;
    if (st.move === 'puxada') {
      // dispara para onde o bico aponta (e um pouco para cima)
      // puxadinha curta: bem menos que a embicada
      tx = k.x + Math.cos(k.angle) * 5;
      ty = k.y + Math.sin(k.angle) * 5 + 1.5;
      c.assistBoost = 1;
      forceReel = -0.35;
    } else if (st.move === 'embicada') {
      tx = st.mx;
      ty = st.my;
      c.assistBoost = 1.35;
      // solta linha à vontade para alcançar o bote
      const need = Math.hypot(tx - f.handX, ty - f.handY) * 1.15 + 3;
      if (need > L) forceReel = 1;
    } else if (st.move === 'linha') {
      tx = k.x + st.mx * 12;
      ty = k.y + st.my * 12;
      c.assistBoost = 0.9;
      forceReel = 0.8;
    } else if (st.move === 'recolhe') {
      // recolhe a linha rápido: a pipa vem na direção da mão
      const dx = f.handX - k.x;
      const dy = f.handY + 12 - k.y;
      const d = Math.hypot(dx, dy) || 1;
      tx = k.x + (dx / d) * 10;
      ty = k.y + (dy / d) * 10;
      // o carretel puxa e a linha traz a pipa (esticada, sem barriga embolando);
      // a mão só ajuda de leve na direção certa
      // vento quase não pesa (boost > 1), mas a pipa vem no máximo ~19 m/s:
      // o carretel acompanha e a linha não sobra
      c.assistBoost = 1.05;
      forceReel = L > 14 ? -1 : 0;
      recolhendo = true;
    }
    if (st.moveT <= 0) st.move = 'none';
  }
  if (active) {
    // nunca mira dentro do chão
    const floor = f.baseY + 9;
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
  if (forceReel !== null) reel = forceReel;
  c.assist = active ? (recolhendo ? 0.4 : 1) : 0;
  c.assistX = tx;
  c.assistY = ty < f.baseY + 9 ? f.baseY + 9 : ty;
  c.steer = active ? steer * 0.3 : 0;
  c.handX = 0;
  c.handY = 0;
  c.reel = reel;
}
