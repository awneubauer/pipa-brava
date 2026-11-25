import type { Hazard } from '../physics/hazards';
import type { TurbulenceZone, WindProfile } from '../physics/wind';

export type SceneId = 'favela' | 'varzea' | 'centroSP' | 'rio';

/** Parte física de um cenário (usável sem navegador, nos testes). */
export interface SceneWorld {
  id: SceneId;
  wind: WindProfile;
  zones: TurbulenceZone[];
  /** Altura do chão/telhados em x (m). */
  ground: (x: number) => number;
  /** Mão do jogador (m). */
  launch: { x: number; y: number };
  /** Mãos dos adversários. */
  opponents: { x: number; y: number }[];
  /** Perigos (só letais na simulação). */
  hazards: Hazard[];
  /** Limites horizontais do mundo jogável. */
  minX: number;
  maxX: number;
}

/** Uma camada de fundo pré-renderizada (paralaxe). */
export interface SceneLayer {
  /** 0 = infinitamente longe, 1 = plano do jogo */
  factor: number;
  /** região coberta, em metros da própria camada */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** densidade de pixels do cache (px por metro) */
  density: number;
  /** encolhe a camada (coisas distantes parecem menores); padrão 1 */
  scale?: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface SceneArt {
  /** cores do céu do topo ao horizonte */
  sky: string[];
  sun: { x: number; y: number; r: number; color: string };
  layers: SceneLayer[];
  /**
   * Partes animadas em espaço de mundo (fios, faíscas, crianças, mar), chamadas a cada
   * quadro já com a transformação do mundo aplicada. NÃO podem alocar objetos.
   */
  drawNear: (ctx: CanvasRenderingContext2D, x0: number, x1: number, t: number, scale: number) => void;
  /** pipas decorativas ao fundo */
  bgKites?: number;
}

export interface SceneDef {
  id: SceneId;
  name: string;
  tagline: string;
  windLabel: string;
  world: () => SceneWorld;
  art: () => SceneArt;
}
