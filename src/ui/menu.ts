import { GAME_TITLE, SAFETY_TEXT, type ModeId } from '../config';
import type { GameResult } from '../game/game';
import type { SaveData } from '../game/state';
import { bestKey, writeSave } from '../game/state';
import { SCENES } from '../scenes/index';
import type { SceneId } from '../scenes/types';

export interface MenuHooks {
  play: (mode: ModeId, scene: SceneId) => void;
  resume: () => void;
  restart: () => void;
  quit: () => void;
  toMenu: () => void;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function stars(n: number): string {
  let s = '';
  for (let i = 0; i < 3; i++) s += `<span class="star ${i < n ? 'on' : ''}">★</span>`;
  return s;
}

/** Menus em DOM por cima do canvas. */
export class Menu {
  private root: HTMLElement;
  private mode: ModeId = 'arcade';

  constructor(
    private save: () => SaveData,
    private hooks: MenuHooks,
  ) {
    const el = document.getElementById('ui');
    if (!el) throw new Error('#ui ausente');
    this.root = el;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  hide(): void {
    this.root.innerHTML = '';
    this.root.classList.remove('show');
  }

  private show(html: string): void {
    this.root.innerHTML = html;
    this.root.classList.add('show');
  }

  home(): void {
    const s = this.save().settings;
    const cards = SCENES.map((sc) => {
      const best = this.save().best[bestKey(this.mode, sc.id)];
      return `<button class="scene ${sc.id === s.scene ? 'sel' : ''}" data-scene="${sc.id}">
        <span class="scene-thumb thumb-${sc.id}"></span>
        <b>${esc(sc.name)}</b><small>${esc(sc.tagline)}</small>
        <em>${best ? 'Recorde ' + best.toLocaleString('pt-BR') : 'Vento: ' + esc(sc.windLabel)}</em>
      </button>`;
    }).join('');
    this.show(`<div class="panel home">
      <h1 class="logo">${esc(GAME_TITLE)}</h1>
      <p class="sub">Solte o carretel, sinta o vento.</p>
      <div class="modes">
        <button class="mode ${this.mode === 'arcade' ? 'sel' : ''}" data-mode="arcade"><b>Arcade</b><small>Manobras, combos e estrelas. Sem perigo.</small></button>
      </div>
      <h2>Cenário</h2>
      <div class="scenes">${cards}</div>
      <button class="big play" data-action="play">Soltar pipa!</button>
      <div class="row">
        <button class="small" data-action="help">Como jogar</button>
      </div>
    </div>`);
  }

  help(): void {
    this.show(`<div class="panel help">
      <h2>Como jogar</h2>
      <ul>
        <li><b>Céu:</b> arraste para o lado para girar a pipa (o cabresto se desloca). Arraste para baixo para puxar a linha e dar velocidade; para cima, dá linha.</li>
        <li><b>Puxão:</b> um arrasto rápido para baixo dá um tranco na linha.</li>
        <li><b>Carretel (faixa da direita):</b> arraste para baixo para soltar linha, para cima para recolher.</li>
        <li><b>Computador:</b> mouse arrasta no céu, W/S ou a roda do mouse mexem no carretel, A/D giram, espaço dá o puxão, Shift puxa.</li>
        <li>Fique de olho na <b>tensão</b>: verde é o ideal; no vermelho a linha sofre.</li>
      </ul>
      <p class="safety">${esc(SAFETY_TEXT)}</p>
      <button class="big" data-action="home">Voltar</button>
    </div>`);
  }

  pause(): void {
    this.show(`<div class="panel pause">
      <h2>Pausa</h2>
      <button class="big" data-action="resume">Continuar</button>
      <button class="big alt" data-action="restart">Recomeçar</button>
      <button class="big alt" data-action="quit">Sair</button>
      <p class="safety">${esc(SAFETY_TEXT)}</p>
    </div>`);
  }

  summary(r: GameResult): void {
    const best = this.save().best[bestKey(r.mode, r.scene)] ?? 0;
    const min = Math.floor(r.time / 60);
    const sec = Math.floor(r.time % 60);
    this.show(`<div class="panel summary">
      <h2>Resumo</h2>
      <div class="stars">${stars(r.stars)}</div>
      <p class="score">${r.score.toLocaleString('pt-BR')} pontos</p>
      ${r.best ? '<p class="record">Novo recorde!</p>' : `<p class="muted">Recorde: ${best.toLocaleString('pt-BR')}</p>`}
      <ul class="stats">
        <li><span>Tempo no céu</span><b>${min}:${String(sec).padStart(2, '0')}</b></li>
        <li><span>Altura máxima</span><b>${Math.round(r.maxHeight)} m</b></li>
        <li><span>Loops</span><b>${r.loops}</b></li>
        <li><span>Maior combo</span><b>x${Math.max(1, r.bestCombo)}</b></li>
      </ul>
      <button class="big play" data-action="restart">Jogar de novo</button>
      <button class="big alt" data-action="home">Menu</button>
    </div>`);
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    const data = this.save();
    const sc = t.getAttribute('data-scene');
    if (sc) {
      data.settings.scene = sc as SceneId;
      writeSave(data);
      this.home();
      return;
    }
    const md = t.getAttribute('data-mode');
    if (md) {
      this.mode = md as ModeId;
      this.home();
      return;
    }
    switch (t.getAttribute('data-action')) {
      case 'play':
        this.hooks.play(this.mode, data.settings.scene);
        break;
      case 'help':
        this.help();
        break;
      case 'home':
        this.hooks.toMenu();
        break;
      case 'resume':
        this.hooks.resume();
        break;
      case 'restart':
        this.hooks.restart();
        break;
      case 'quit':
        this.hooks.quit();
        break;
    }
  }
}
