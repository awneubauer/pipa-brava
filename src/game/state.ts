import { COLORS, KITE_MODELS, STORAGE_KEY, type DifficultyId, type KiteModel, type LineTypeId, type ModeId } from '../config';
import type { SceneId } from '../scenes/types';

/** Configurações e recordes salvos no localStorage (sem backend). */
export interface Settings {
  sound: boolean;
  vibration: boolean;
  model: KiteModel;
  color: string;
  tail: string;
  tutorialDone: boolean;
  scene: SceneId;
  difficulty: DifficultyId;
  opponents: number;
  playerLine: LineTypeId;
  unlocked: LineTypeId[];
  /** controle: 'easy' (um dedo) ou 'pro' (cabresto + lata) */
  control: 'easy' | 'pro';
  /** skin equipada (id da loja) */
  skin: string;
}

/** Progresso de jogo: moedas, estrelas por fase e skins compradas. */
export interface Profile {
  coins: number;
  /** estrelas por fase (índice = número da fase - 1) */
  stars: number[];
  owned: string[];
  /** melhor pontuação no modo Infinito */
  bestEndless: number;
}

export interface SaveData {
  settings: Settings;
  /** melhor pontuação por modo:cenário */
  best: Record<string, number>;
  profile: Profile;
}

export function defaultSave(): SaveData {
  return {
    settings: {
      sound: true,
      vibration: true,
      model: 'raia',
      color: COLORS[0],
      tail: COLORS[2],
      tutorialDone: false,
      scene: 'varzea',
      difficulty: 'facil',
      opponents: 1,
      playerLine: 'comum',
      unlocked: ['comum'],
      control: 'easy',
      skin: 'raia-vermelha',
    },
    best: {},
    profile: { coins: 0, stars: [], owned: ['raia-vermelha'], bestEndless: 0 },
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSave(): SaveData {
  const d = defaultSave();
  const s = storage();
  if (!s) return d;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const settings = { ...d.settings, ...(parsed.settings ?? {}) };
    if (!KITE_MODELS.includes(settings.model)) settings.model = 'raia';
    if (!Array.isArray(settings.unlocked) || !settings.unlocked.includes('comum')) settings.unlocked = ['comum'];
    if (!settings.unlocked.includes(settings.playerLine)) settings.playerLine = 'comum';
    settings.opponents = Math.min(3, Math.max(1, settings.opponents | 0));
    const pp = (parsed.profile ?? {}) as Partial<Profile>;
    const profile: Profile = {
      coins: Number.isFinite(pp.coins) ? Math.max(0, Math.floor(pp.coins as number)) : 0,
      stars: Array.isArray(pp.stars) ? pp.stars.map((n) => Math.max(0, Math.min(3, n | 0))) : [],
      owned: Array.isArray(pp.owned) ? pp.owned.filter((x) => typeof x === 'string') : [],
      bestEndless: Number.isFinite(pp.bestEndless) ? (pp.bestEndless as number) : 0,
    };
    if (!profile.owned.includes('raia-vermelha')) profile.owned.push('raia-vermelha');
    if (!profile.owned.includes(settings.skin)) settings.skin = 'raia-vermelha';
    if (settings.control !== 'pro') settings.control = 'easy';
    return { settings, best: { ...(parsed.best ?? {}) }, profile };
  } catch {
    return d;
  }
}

export function writeSave(data: SaveData): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem salvar */
  }
}

export function bestKey(mode: ModeId, scene: SceneId): string {
  return mode + ':' + scene;
}

/** Registra uma pontuação; retorna true se for recorde. */
export function recordBest(data: SaveData, mode: ModeId, scene: SceneId, score: number): boolean {
  const k = bestKey(mode, scene);
  if (score > (data.best[k] ?? 0)) {
    data.best[k] = Math.round(score);
    writeSave(data);
    return true;
  }
  return false;
}
