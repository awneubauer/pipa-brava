/**
 * Configuração central do jogo. Todos os números de ajuste ficam aqui.
 * Unidades internas da física: metros, segundos, quilos, newtons.
 * "u" (unidade de jogo citada no design) = 0,1 m  → 420 u/s = 42 m/s.
 */

/** Título provisório: troque aqui e ele muda em todo lugar (menu, HUD, manifest em runtime). */
export const GAME_TITLE = 'Pipa Brava';

export const UNITS_PER_METER = 10;
export const u = (units: number): number => units / UNITS_PER_METER;

export const PHYSICS = {
  /** Passo fixo do jogo (s). */
  dt: 1 / 60,
  /** Subpassos por passo fixo. */
  substeps: 2,
  gravity: 9.81,
  airDensity: 1.2,
  /** Nós da linha (corrente de Verlet). */
  lineNodes: 40,
  lineIterations: 6,
  /** Massa linear da linha (kg/m) — linha 10 de algodão encerado. */
  lineMassPerMeter: 0.00025,
  /** Diâmetro efetivo da linha para arrasto (m). */
  lineDiameter: 0.0006,
  /** Rigidez/amortecimento da elasticidade da linha (N/m e N·s/m) no trecho da mão. */
  lineStiffness: 70,
  lineDamping: 1.4,
  /** Comprimento mínimo de linha fora do carretel (m). */
  minLineOut: 2.5,
  /** Velocidade máxima do braço do jogador (m/s) e alcance (m). */
  armSpeed: 3.2,
  armReach: 0.9,
  /** Puxão: deslocamento extra da mão (m) e duração (s). */
  jerkDistance: 0.85,
  jerkDuration: 0.25,
};

export interface KiteParams {
  mass: number;
  inertia: number;
  area: number;
  /** Cl = cl · sin(2α) */
  cl: number;
  /** Cd = cd0 + cd90 · sin²α */
  cd0: number;
  cd90: number;
  /** Inclinação da face em relação à linha, definida pelo cabresto (rad). */
  pitch: number;
  /** Quanto o jogador desloca o cabresto lateralmente (m). */
  bridleRange: number;
  /** Rabiola: torque do peso (N·m), alinhamento com o movimento e amortecimento. */
  tailWeightTorque: number;
  /** arrasto da rabiola (m²·Cd) — freia a pipa e estabiliza */
  tailCdA: number;
  /** endireitamento extra pelo vento na rabiola (N·m, satura) */
  tailUpright: number;
  tailAlign: number;
  tailDamp: number;
  /** Amortecimento angular próprio (N·m·s). */
  angDamp: number;
  /** Torque mínimo de controle com linha frouxa (fração da pressão dinâmica). */
  steerAssist: number;
  /** Velocidade de giro máxima pedida pelo dedo (rad/s) e ganho do cabresto (N·m·s). */
  turnRate: number;
  turnGain: number;
  /** Raio de colisão (m). */
  radius: number;
}

export const KITE: KiteParams = {
  mass: 0.08,
  inertia: 0.005,
  area: 0.5,
  cl: 1.05,
  cd0: 0.12,
  cd90: 1.2,
  pitch: 0.3,
  bridleRange: 0.14,
  tailWeightTorque: 0.06,
  tailCdA: 0.05,
  tailUpright: 0.45,
  tailAlign: 0.002,
  tailDamp: 0.01,
  angDamp: 0.15,
  steerAssist: 0.35,
  turnRate: 5,
  turnGain: 0.32,
  radius: 0.45,
};

export type ModeId = 'arcade' | 'sim';

export const MODES = {
  arcade: { stock: 1200, lineBreaks: false, hazardsLethal: false },
  sim: { stock: 800, lineBreaks: true, hazardsLethal: true },
} as const;

export const REEL = {
  /** Soltar: até 420 u/s. */
  maxRelease: u(420),
  /** Recolher: até 300 u/s. */
  maxRetrieve: u(300),
  /** A pipa puxando solta mais rápido: multiplicador extra por tensão. */
  pullBoost: 0.6,
  /** Lata: metros de linha por pixel arrastado, zona morta (px/s), puxão (px/s para cima) e giro livre (s). */
  metersPerPx: 0.09,
  deadZonePx: 25,
  jerkPx: 1400,
  spoolDecay: 0.8,
};

export const TENSION = {
  /** Faixas da barra (normalizada 0..1). */
  greenMin: 0.08,
  yellow: 0.68,
  red: 0.86,
  /** Segundos acumulados na vermelha até arrebentar (simulação). */
  redBreakTime: 1.5,
  /** Arcade: acima disto o carretel alivia sozinho. */
  arcadeRelief: 0.84,
};

export type LineTypeId = 'comum' | 'afiada' | 'super';

export interface LineType {
  id: LineTypeId;
  name: string;
  /** Afiação (multiplica o dano que esta linha causa). */
  sharpness: number;
  /** Resistência ao corte (divide o dano recebido). */
  resistance: number;
  /** Força de ruptura por tração (N) — base da normalização da tensão. */
  breakForce: number;
  color: string;
}

export const LINE_TYPES: Record<LineTypeId, LineType> = {
  comum: { id: 'comum', name: 'Comum', sharpness: 1.0, resistance: 1.0, breakForce: 26, color: '#f4efe2' },
  afiada: { id: 'afiada', name: 'Afiada', sharpness: 1.35, resistance: 1.05, breakForce: 27, color: '#ffe08a' },
  super: { id: 'super', name: 'Super afiada', sharpness: 1.75, resistance: 1.1, breakForce: 28, color: '#ff9f6b' },
};

export const CUT = {
  /** Constante global de dano (ajustada para duelo igual em 1,5–4 s). */
  k: 0.26,
  /** Saturação da velocidade de deslizamento: S(v) = sMax·tanh(v / sScale). */
  sMax: 2.5,
  sScale: 1.5,
  /** Concentração do desgaste: quem desliza mais espalha o desgaste (0,7–1,3). */
  concMin: 0.7,
  concMax: 1.3,
  /** Tempo sem contato até um cruzamento começar a "esfriar" e taxa de esfriamento. */
  forgetDelay: 1.0,
  decayRate: 0.15,
  /** Distância (m) para casar um cruzamento com o do passo anterior. */
  matchDistance: 3.5,
  maxCrossingsPerPair: 4,
};

export type DifficultyId = 'facil' | 'media' | 'brava';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  reaction: number;
  aggression: number;
  error: number;
  line: LineTypeId;
  stock: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  facil: { id: 'facil', name: 'Fácil', reaction: 0.55, aggression: 0.35, error: 0.35, line: 'comum', stock: 650 },
  media: { id: 'media', name: 'Média', reaction: 0.32, aggression: 0.6, error: 0.18, line: 'afiada', stock: 750 },
  brava: { id: 'brava', name: 'Brava', reaction: 0.16, aggression: 0.85, error: 0.07, line: 'super', stock: 850 },
};

export const HAZARD = {
  /** Velocidade de impacto que rasga a pipa (m/s). */
  tearSpeed: 10.5,
  /** Tempo puxando para desenroscar (s). */
  freeTime: 3,
  /** Tensão mínima que conta como "puxando" para desenroscar. */
  freeTension: 0.3,
};

export const CAMERA = {
  maxScale: 26, // px por metro (mais perto)
  minScale: 1.6, // px por metro (mais longe)
  margin: 0.18,
  follow: 3.2,
  zoomFollow: 1.6,
};

export const KITE_MODELS = ['raia', 'piao', 'papagaio', 'estrela', 'coracao', 'quadrada'] as const;
export type KiteModel = (typeof KITE_MODELS)[number];
export const KITE_MODEL_NAMES: Record<KiteModel, string> = {
  raia: 'Raia',
  piao: 'Pião',
  papagaio: 'Papagaio',
  estrela: 'Estrela',
  coracao: 'Coração',
  quadrada: 'Quadrada',
};

export const COLORS = ['#ff3b5c', '#ff8a00', '#ffd400', '#2ed573', '#1ec8ff', '#5f6bff', '#b04dff', '#ffffff'] as const;

export const SLOWMO = { duration: 0.6, scale: 0.3 };

export const STORAGE_KEY = 'pipabrava.v1';

export const SAFETY_TEXT =
  'Na vida real, nunca solte pipa perto de fios elétricos e não use linha cortante. Aqui é só um jogo.';
