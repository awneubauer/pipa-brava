import { GAME_TITLE, type ModeId } from './config';
import { Game } from './game/game';
import { writeSave } from './game/state';
import type { SceneId } from './scenes/types';
import { Menu } from './ui/menu';
import { Tutorial } from './ui/tutorial';
import './style.css';

document.title = GAME_TITLE;

const canvas = document.getElementById('game') as HTMLCanvasElement;
let last: { mode: ModeId; scene: SceneId } = { mode: 'arcade', scene: 'varzea' };

function pauseGame(): void {
  if (!game.world || game.paused) return;
  game.pause();
  tutorial.setVisible(false);
  menu.pause();
}

const game = new Game(canvas, {
  onPause: pauseGame,
  onExit: (r) => {
    game.pause();
    tutorial.stop();
    menu.summary(r);
  },
});

const tutorial = new Tutorial(game.input, () => {
  game.save.settings.tutorialDone = true;
  writeSave(game.save);
});

function play(mode: ModeId, scene: SceneId): void {
  last = { mode, scene };
  menu.hide();
  game.start(mode, scene);
  if (!game.save.settings.tutorialDone) tutorial.start();
}

const menu = new Menu(() => game.save, {
  play,
  resume: () => {
    menu.hide();
    game.resume();
    tutorial.setVisible(true);
  },
  restart: () => {
    tutorial.stop();
    play(last.mode, last.scene);
  },
  quit: () => {
    tutorial.stop();
    const r = game.finish();
    menu.summary(r);
  },
  sceneChanged: (scene) => game.startAttract(scene),
  sound: (on) => game.setSound(on),
  toMenu: () => {
    tutorial.stop();
    game.startAttract(game.save.settings.scene);
    menu.home();
  },
});

// o áudio só pode começar depois de um gesto do usuário
const unlock = (): void => game.unlockAudio();
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('keydown', unlock, { capture: true });

// botões de pausa e silenciar desenhados no HUD
const inside = (b: { x: number; y: number; w: number; h: number }, e: PointerEvent): boolean =>
  e.clientX >= b.x - 6 && e.clientX <= b.x + b.w + 6 && e.clientY >= b.y - 6 && e.clientY <= b.y + b.h + 6;
canvas.addEventListener('pointerdown', (e) => {
  if (!game.world || game.paused) return;
  if (inside(game.hud.pauseBtn, e)) pauseGame();
  else if (inside(game.hud.muteBtn, e)) game.setSound(!game.save.settings.sound);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// cenário de fundo animado atrás do menu
game.startAttract(game.save.settings.scene);
menu.home();

// PWA: registra o service worker só no build de produção
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem SW o jogo funciona normalmente */
    });
  });
}
