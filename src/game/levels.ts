import type { SceneId } from '../scenes/types';

/**
 * Fases curtas (30–90 s), cada uma com UM objetivo claro e 1–3 estrelas.
 * A dificuldade sobe devagar: a fase 1 é quase impossível de perder.
 */
export type GoalType = 'cut' | 'survive' | 'combo' | 'boss';

export interface LevelDef {
  n: number;
  scene: SceneId;
  goal: GoalType;
  /** quantidade alvo (cortes, segundos, tamanho do combo) */
  target: number;
  /** tempo limite (s); para 'survive' é o próprio objetivo */
  time: number;
  /** força dos inimigos (equivale à onda do modo Infinito) */
  wave: number;
  /** quantas pipas inimigas voam juntas */
  concurrent: number;
  /** tempo "par" para a estrela de rapidez (s) */
  par: number;
}

const SCENE_ORDER: SceneId[] = ['varzea', 'favela', 'centroSP', 'rio'];
const SCENE_SIZE = [8, 8, 8, 6];

function make(n: number): LevelDef {
  let si = 0;
  let k = n - 1;
  while (si < SCENE_SIZE.length - 1 && k >= SCENE_SIZE[si]) {
    k -= SCENE_SIZE[si];
    si++;
  }
  const scene = SCENE_ORDER[si];
  // força cresce com a fase; cada cenário começa um pouco mais leve que o fim do anterior
  const wave = 1 + (n - 1) * 0.32 - (k === 0 && n > 1 ? 0.6 : 0);
  const conc = n < 3 ? 1 : n < 10 ? 2 : 3;
  const last = k === SCENE_SIZE[si] - 1;
  if (last) return { n, scene, goal: 'boss', target: 1, time: 90, wave: wave + 0.5, concurrent: Math.min(3, conc), par: 50 };
  switch (k % 7) {
    case 0:
      return { n, scene, goal: 'cut', target: n === 1 ? 1 : 2, time: 0, wave: Math.max(1, wave - 0.5), concurrent: 1, par: n === 1 ? 25 : 40 };
    case 1:
      return { n, scene, goal: 'cut', target: 3, time: 90, wave, concurrent: Math.min(conc, 2), par: 55 };
    case 2:
      return { n, scene, goal: 'survive', target: 35 + Math.min(25, n * 2), time: 35 + Math.min(25, n * 2), wave, concurrent: conc, par: 0 };
    case 3:
      return { n, scene, goal: 'combo', target: n < 12 ? 2 : 3, time: 90, wave, concurrent: Math.max(2, conc), par: 55 };
    case 4:
      return { n, scene, goal: 'cut', target: 4, time: 75, wave, concurrent: conc, par: 50 };
    case 5:
      return { n, scene, goal: 'survive', target: 60, time: 60, wave: wave + 0.4, concurrent: 3, par: 0 };
    default:
      return { n, scene, goal: 'cut', target: 5, time: 80, wave: wave + 0.3, concurrent: conc, par: 55 };
  }
}

export const LEVELS: LevelDef[] = Array.from({ length: 30 }, (_, i) => make(i + 1));

export function goalText(l: LevelDef): string {
  switch (l.goal) {
    case 'cut':
      return l.time > 0 ? `Corte ${l.target} pipas em ${l.time} s` : `Corte ${l.target === 1 ? '1 pipa' : l.target + ' pipas'}`;
    case 'survive':
      return `Sobreviva ${l.target} s sem ser cortado`;
    case 'combo':
      return `Faça um combo x${l.target} (cortes seguidos)`;
    case 'boss':
      return 'Derrube o Rei do Céu!';
  }
}

export function goalShort(l: LevelDef): string {
  switch (l.goal) {
    case 'cut':
      return 'Cortes';
    case 'survive':
      return 'Sobreviva';
    case 'combo':
      return 'Combo';
    case 'boss':
      return 'Chefão';
  }
}

/**
 * Estrelas: 1 por cumprir; +1 por rapidez (ou, em "sobreviva", por cortar pelo menos 2);
 * +1 por terminar com a linha quase inteira (dano máximo < 35%).
 */
export function starsFor(l: LevelDef, timeUsed: number, maxDamage: number, cuts: number): number {
  let s = 1;
  if (l.goal === 'survive') {
    if (cuts >= 2) s++;
  } else if (timeUsed <= l.par) s++;
  if (maxDamage < 0.35) s++;
  return s;
}

/** Fase liberada se a anterior tem pelo menos 1 estrela. */
export function isUnlocked(stars: number[], n: number): boolean {
  return n === 1 || (stars[n - 2] ?? 0) > 0;
}
