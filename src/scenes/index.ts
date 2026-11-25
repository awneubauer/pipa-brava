import type { SceneDef, SceneId } from './types';
import { VARZEA } from './varzea';

/** Cenários jogáveis, na ordem do menu. */
export const SCENES: SceneDef[] = [VARZEA];

export function getScene(id: SceneId): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
