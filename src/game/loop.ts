import { PHYSICS } from '../config';

/**
 * Loop com passo fixo (PHYSICS.dt) e render interpolado.
 * `timeScale` permite câmera lenta (afeta só a simulação).
 */
export class FixedLoop {
  timeScale = 1;
  running = false;
  /** fps medido (para o debug) */
  fps = 60;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private step: () => void,
    private frame: (alpha: number, realDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let realDt = (now - this.last) / 1000;
    this.last = now;
    if (realDt > 0.25) realDt = 0.25; // aba em segundo plano
    if (realDt < 0) realDt = 0;
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.acc += realDt * this.timeScale;
    let steps = 0;
    while (this.acc >= PHYSICS.dt && steps < 5) {
      this.step();
      this.acc -= PHYSICS.dt;
      steps++;
    }
    if (steps >= 5) this.acc = 0;
    this.frame(this.acc / PHYSICS.dt, realDt);
    this.raf = requestAnimationFrame(this.tick);
  };
}
