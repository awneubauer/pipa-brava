import type { Input } from '../game/input';

/** Tutorial da primeira partida: 3 passos curtos (puxar, soltar carretel, cortar). Pulável. */

interface Step {
  title: string;
  text: string;
  hand: 'sky' | 'reel' | null;
  done: (i: Input) => boolean;
}

const STEPS: Step[] = [
  {
    title: '1. Manobre',
    text: 'Arraste no <b>céu</b> para os lados: a pipa <b>gira</b> e anda para onde o bico aponta. Tire o dedo e a rabiola deixa ela de bico para cima.',
    hand: 'sky',
    done: (i) => i.usedSteer > 0.8,
  },
  {
    title: '2. Gire a lata',
    text: 'Deslize a <b>lata</b> (faixa da direita) para <b>baixo</b> para soltar linha, como girar o carretel; largando no embalo ela continua girando. Para <b>cima</b> recolhe e <b>puxa</b>: a pipa ganha força e sobe. Dedo parado segura a linha.',
    hand: 'reel',
    done: (i) => i.usedReel > 1.2,
  },
  {
    title: '3. Corte!',
    text: 'Na <b>Simulação</b>, cruze sua linha com a do adversário e <b>solte</b> ou <b>puxe</b>: quem faz a linha correr mais corta. Fique de olho na <b>tensão</b>: no vermelho, arrebenta!',
    hand: null,
    done: () => false,
  },
];

export class Tutorial {
  active = false;
  private step = 0;
  private el: HTMLDivElement | null = null;
  private hand: HTMLDivElement | null = null;
  private raf = 0;
  private t = 0;
  private last = 0;
  private hold = 0;

  constructor(
    private input: Input,
    private onDone: () => void,
  ) {}

  start(): void {
    this.stop();
    this.active = true;
    this.step = 0;
    this.input.usedPull = 0;
    this.input.usedReel = 0;
    this.input.usedSteer = 0;
    this.el = document.createElement('div');
    this.el.className = 'tut';
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand';
    this.hand.textContent = '👆';
    document.body.appendChild(this.hand);
    document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.tut === 'skip' || b.dataset.tut === 'ok') this.finish();
    });
    this.render();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Esconde temporariamente (pausa/menus). */
  setVisible(v: boolean): void {
    if (this.el) this.el.style.display = v ? '' : 'none';
    if (this.hand) this.hand.style.display = v && STEPS[this.step]?.hand ? '' : 'none';
  }

  private render(): void {
    if (!this.el) return;
    const s = STEPS[this.step];
    const dots = STEPS.map((_, i) => `<span class="${i <= this.step ? 'on' : ''}"></span>`).join('');
    const last = this.step === STEPS.length - 1;
    this.el.innerHTML = `<div><b>${s.title}</b></div><div>${s.text}</div>
      <div class="tut-row"><div class="dots">${dots}</div>
      ${last ? '<button class="small on" data-tut="ok">Bora!</button>' : '<button class="small" data-tut="skip">Pular tutorial</button>'}</div>`;
    if (this.hand) this.hand.style.display = s.hand ? '' : 'none';
  }

  private tick = (now: number): void => {
    if (!this.active) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const s = STEPS[this.step];
    if (s.done(this.input)) {
      this.hold += dt;
      if (this.hold > 0.4) {
        this.hold = 0;
        this.step++;
        this.render();
      }
    }
    // mãozinha animada mostrando o gesto
    if (this.hand && s.hand) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const k = (Math.sin(this.t * 2.2) + 1) / 2;
      let x: number;
      let y: number;
      if (s.hand === 'sky') {
        const ph = Math.floor(this.t / 2.8) % 2;
        x = w * 0.36 + (ph === 0 ? (k - 0.5) * 120 : 0);
        y = h * 0.45 + (ph === 1 ? k * 90 : 0);
      } else {
        x = w - Math.min(104, Math.max(64, w * 0.19)) / 2 - 18;
        y = h * 0.45 + k * 110;
      }
      this.hand.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private finish(): void {
    this.stop();
    this.onDone();
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.el?.remove();
    this.hand?.remove();
    this.el = null;
    this.hand = null;
  }
}
