import {
  COLORS,
  DIFFICULTIES,
  GAME_TITLE,
  KITE_MODEL_NAMES,
  KITE_MODELS,
  LINE_TYPES,
  SAFETY_TEXT,
  type DifficultyId,
  type KiteModel,
  type LineTypeId,
  type ModeId,
} from '../config';
import { drawKiteShape, shade } from '../render/kiteArt';
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
  /** cenário escolhido no menu mudou (atualiza o fundo animado) */
  sceneChanged?: (scene: SceneId) => void;
  /** liga/desliga o som */
  sound: (on: boolean) => void;
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
        <button class="mode ${this.mode === 'sim' ? 'sel' : ''}" data-mode="sim"><b>Simulação</b><small>Corte a linha dos adversários.</small></button>
      </div>
      ${this.mode === 'sim' ? this.simOptions() : ''}
      <h2>Cenário</h2>
      <div class="scenes">${cards}</div>
      <button class="big play" data-action="play">Soltar pipa!</button>
      <div class="row">
        <button class="small" data-action="custom">Personalizar pipa</button>
        <button class="small" data-action="help">Como jogar</button>
        ${this.soundBtn()}
      </div>
    </div>`);
  }

  private soundBtn(): string {
    const on = this.save().settings.sound;
    return `<button class="small ${on ? 'on' : ''}" data-action="sound">${on ? '🔊 Som ligado' : '🔇 Som desligado'}</button>`;
  }

  private simOptions(): string {
    const s = this.save().settings;
    const opp = [1, 2, 3].map((n) => `<button class="chip ${s.opponents === n ? 'sel' : ''}" data-opp="${n}">${n}</button>`).join('');
    const diff = (Object.keys(DIFFICULTIES) as DifficultyId[])
      .map((d) => `<button class="chip ${s.difficulty === d ? 'sel' : ''}" data-diff="${d}">${DIFFICULTIES[d].name}</button>`)
      .join('');
    const lines = (Object.keys(LINE_TYPES) as LineTypeId[])
      .map((l) => {
        const locked = !s.unlocked.includes(l);
        return `<button class="chip ${s.playerLine === l ? 'sel' : ''}" data-line="${l}" ${locked ? 'disabled' : ''}>${locked ? '🔒 ' : ''}${LINE_TYPES[l].name}</button>`;
      })
      .join('');
    const d = DIFFICULTIES[s.difficulty];
    return `<div class="simopts">
      <h3>Adversários</h3><div class="chips">${opp}</div>
      <h3>Dificuldade</h3><div class="chips">${diff}</div>
      <p class="muted small-note">Linha deles: ${LINE_TYPES[d.line].name}</p>
      <h3>Sua linha</h3><div class="chips">${lines}</div>
      <p class="muted small-note">Vença na Média para liberar a Afiada; na Brava, a Super afiada.</p>
    </div>`;
  }

  custom(): void {
    const st = this.save().settings;
    const models = KITE_MODELS.map(
      (m) => `<button class="model ${st.model === m ? 'sel' : ''}" data-model="${m}"><canvas width="64" height="64" data-preview="${m}"></canvas>${KITE_MODEL_NAMES[m]}</button>`,
    ).join('');
    const sw = (attr: string, cur: string) =>
      COLORS.map((c) => `<button class="sw ${cur === c ? 'sel' : ''}" style="background:${c}" data-${attr}="${c}" aria-label="cor ${c}"></button>`).join('');
    this.show(`<div class="panel custom">
      <h2>Sua pipa</h2>
      <canvas class="kite-preview" width="180" height="200" data-preview="big"></canvas>
      <h3>Modelo</h3>
      <div class="models">${models}</div>
      <h3>Cor da pipa</h3>
      <div class="swatches">${sw('color', st.color)}</div>
      <h3>Cor da rabiola</h3>
      <div class="swatches">${sw('tail', st.tail)}</div>
      <button class="big" data-action="home">Pronto</button>
    </div>`);
    this.drawPreviews();
  }

  private drawPreviews(): void {
    const st = this.save().settings;
    const accent = st.tail === st.color ? '#ffffff' : st.tail;
    this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]').forEach((c) => {
      const g = c.getContext('2d');
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.width;
      const h = c.height;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      g.scale(dpr, dpr);
      const big = c.dataset.preview === 'big';
      const model = (big ? st.model : c.dataset.preview) as KiteModel;
      const size = big ? 52 : 22;
      const cx = w / 2;
      const cy = big ? 74 : h / 2 - 2;
      if (big) {
        // rabiola de laços
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx, cy + size);
        for (let i = 1; i <= 8; i++) g.lineTo(cx + Math.sin(i * 0.8) * 10, cy + size + i * 14);
        g.stroke();
        for (let i = 1; i <= 8; i++) {
          const x = cx + Math.sin(i * 0.8) * 10;
          const y = cy + size + i * 14;
          g.fillStyle = i % 2 ? st.tail : shade(st.tail, 0.45);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 9, y - 4);
          g.lineTo(x - 9, y + 4);
          g.closePath();
          g.moveTo(x, y);
          g.lineTo(x + 9, y - 4);
          g.lineTo(x + 9, y + 4);
          g.closePath();
          g.fill();
        }
      }
      g.save();
      g.translate(cx, cy);
      drawKiteShape(g, model, size, st.color, accent);
      g.restore();
    });
  }

  help(): void {
    this.show(`<div class="panel help">
      <h2>Como jogar</h2>
      <ul>
        <li><b>Céu:</b> arraste para os lados para girar a pipa (o cabresto se desloca). Ela anda para onde o bico aponta; tirando o dedo, a rabiola endireita.</li>
        <li><b>Lata (faixa da direita):</b> deslize para baixo para soltar linha na velocidade do dedo; largue no embalo e a lata continua girando enquanto a pipa puxa. Deslize para cima para recolher: recolher é puxar, a pipa ganha força e sobe. Dedo parado segura a linha.</li>
        <li><b>Como subir:</b> solte um pouco, segure e deixe a pipa subir de novo. Soltar demais deixa a linha frouxa e a pipa afunda.</li>
        <li><b>Puxão:</b> deslizada rápida para cima na lata (ou arrasto rápido para baixo no céu).</li>
        <li><b>Computador:</b> mouse arrasta no céu, A/D giram, S solta, W recolhe, roda do mouse gira a lata, espaço dá o puxão.</li>
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
      <div class="row">${this.soundBtn()}</div>
      <p class="safety">${esc(SAFETY_TEXT)}</p>
    </div>`);
  }

  summary(r: GameResult): void {
    if (r.sim) {
      this.simSummary(r);
      return;
    }
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

  private simSummary(r: GameResult): void {
    const sim = r.sim!;
    const best = this.save().best[bestKey(r.mode, r.scene)] ?? 0;
    const min = Math.floor(sim.time / 60);
    const sec = Math.floor(sim.time % 60);
    const win = sim.outcome === 'win';
    const title = win ? 'Vitória!' : sim.outcome === 'lose' ? 'Derrota' : 'Fim de jogo';
    const unlocked = r.unlocked ? `<p class="record">Linha ${LINE_TYPES[r.unlocked].name} liberada!</p>` : '';
    this.show(`<div class="panel summary">
      <p class="result-title ${win ? 'win' : 'lose'}">${title}</p>
      <p class="muted">${esc(sim.reason || 'Você saiu da partida.')}</p>
      ${unlocked}
      <ul class="stats">
        <li><span>Tempo</span><b>${min}:${String(sec).padStart(2, '0')}</b></li>
        <li><span>Cortes</span><b>${sim.cuts}</b></li>
        <li><span>Linha restante</span><b>${Math.round(sim.lineLeft).toLocaleString('pt-BR')} m</b></li>
        <li><span>Dificuldade</span><b>${DIFFICULTIES[r.difficulty].name}</b></li>
        <li><span>Pontos</span><b>${sim.score.toLocaleString('pt-BR')}${r.best ? ' (recorde!)' : ''}</b></li>
        <li><span>Recorde do cenário</span><b>${best.toLocaleString('pt-BR')}</b></li>
      </ul>
      <button class="big play" data-action="restart">${win ? 'Jogar de novo' : 'Revanche'}</button>
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
      this.hooks.sceneChanged?.(sc as SceneId);
      this.home();
      return;
    }
    const model = t.getAttribute('data-model');
    if (model) {
      data.settings.model = model as KiteModel;
      writeSave(data);
      this.custom();
      return;
    }
    const color = t.getAttribute('data-color');
    if (color) {
      data.settings.color = color;
      writeSave(data);
      this.custom();
      return;
    }
    const tail = t.getAttribute('data-tail');
    if (tail) {
      data.settings.tail = tail;
      writeSave(data);
      this.custom();
      return;
    }
    const opp = t.getAttribute('data-opp');
    if (opp) {
      data.settings.opponents = Number(opp);
      writeSave(data);
      this.home();
      return;
    }
    const diff = t.getAttribute('data-diff');
    if (diff) {
      data.settings.difficulty = diff as DifficultyId;
      writeSave(data);
      this.home();
      return;
    }
    const ln = t.getAttribute('data-line');
    if (ln) {
      if (data.settings.unlocked.includes(ln as LineTypeId)) data.settings.playerLine = ln as LineTypeId;
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
      case 'custom':
        this.custom();
        break;
      case 'sound': {
        this.hooks.sound(!data.settings.sound);
        t.outerHTML = this.soundBtn();
        break;
      }
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
