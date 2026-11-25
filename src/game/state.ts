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
}

export interface SaveData {
  settings: Settings;
  /** melhor pontuação por modo:cenário */
  best: Record<string, number>;
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
    },
    best: {},
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
    return { settings, best: { ...(parsed.best ?? {}) } };
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
