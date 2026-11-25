import { CENTRO_SP } from './centroSP';
import { FAVELA } from './favela';
import { RIO } from './rio';
import type { SceneDef, SceneId } from './types';
import { VARZEA } from './varzea';

/** Cenários jogáveis, na ordem do menu. */
export const SCENES: SceneDef[] = [FAVELA, VARZEA, CENTRO_SP, RIO];

export function getScene(id: SceneId): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
