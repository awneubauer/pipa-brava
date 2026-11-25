import { GAME_TITLE, type ModeId } from './config';
import { Game } from './game/game';
import type { SceneId } from './scenes/types';
import { Menu } from './ui/menu';
import './style.css';

document.title = GAME_TITLE;

const canvas = document.getElementById('game') as HTMLCanvasElement;
let last: { mode: ModeId; scene: SceneId } = { mode: 'arcade', scene: 'varzea' };

const game = new Game(canvas, {
  onPause: () => {
    if (!game.world || game.paused) return;
    game.pause();
    menu.pause();
  },
  onExit: (r) => {
    game.pause();
    menu.summary(r);
  },
});

const menu = new Menu(() => game.save, {
  play: (mode, scene) => {
    last = { mode, scene };
    menu.hide();
    game.start(mode, scene);
  },
  resume: () => {
    menu.hide();
    game.resume();
  },
  restart: () => {
    menu.hide();
    game.start(last.mode, last.scene);
  },
  quit: () => {
    const r = game.finish();
    menu.summary(r);
  },
  toMenu: () => {
    game.startAttract(game.save.settings.scene);
    menu.home();
  },
});

// botão de pausa desenhado no HUD
canvas.addEventListener('pointerdown', (e) => {
  const b = game.hud.pauseBtn;
  if (e.clientX >= b.x - 6 && e.clientX <= b.x + b.w + 6 && e.clientY >= b.y - 6 && e.clientY <= b.y + b.h + 6) {
    if (game.world && !game.paused) {
      game.pause();
      menu.pause();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.world && !game.paused) {
    game.pause();
    menu.pause();
  }
});

// cenário de fundo animado atrás do menu
game.startAttract(game.save.settings.scene);
menu.home();
