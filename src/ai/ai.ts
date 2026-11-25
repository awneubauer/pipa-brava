import type { Difficulty } from '../config';
import { isAlive, type Flyer } from '../physics/flyer';
import type { CutSystem } from '../physics/cut';
import { clamp, noise1, Rng, wrapAngle } from '../util/noise';

/**
 * IA de pipa com máquina de estados:
 *  patrulhar → aproximar (buscar posição acima/contra o vento) → engajar (alternar
 *  soltar e puxar) → fugir (dano próprio > 0,6) → recompor → ...
 * A dificuldade muda tempo de reação, agressividade e erro.
 */
export type AiState = 'patrulhar' | 'aproximar' | 'engajar' | 'fugir' | 'recompor';

export const AI_STATE_LABEL: Record<AiState, string> = {
  patrulhar: 'patrulhando',
  aproximar: 'aproximando',
  engajar: 'engajando',
  fugir: 'fugindo',
  recompor: 'recompondo',
};

function d2(r: Rng): number {
  return r.next() * r.next();
}

export class KiteAI {
  state: AiState = 'patrulhar';
  private stateTime = 0;
  private decide = 0;
  private tx = 0;
  private ty = 0;
  private wantLen = 60;
  private phase = 0;
  private phaseTime = 0;
  private noContact = 0;
  private rng: Rng;
  private seed: number;
  private side = 1;
  private patience: number;
  private hadContact = false;
  private easing = false;
  /** linhas enganchadas num duelo: a Batalha segura a pipa no lugar */
  hold = false;
  /** Batalha: só ataca com a "vez" (um atacante por vez) e depois de rondar `patrolTime` s */
  mayAttack = true;
  patrolTime = 3;
  /** lado em que ronda a pipa do jogador (Batalha) */
  private orbit = 1;
  private safeFloor = 10;

  constructor(
    private self: Flyer,
    private diff: Difficulty,
    seed: number,
    hazards: { x0: number; x1: number; y1: number }[] = [],
    /** modo Batalha: ajuda de pilotagem (0..1) e ataque imediato */
    private assist = 0,
  ) {
    this.rng = new Rng(seed);
    this.seed = seed;
    this.patience = 3 + (1 - diff.aggression) * 8 + this.rng.next() * 4;
    this.wantLen = self.reel.out;
    this.tx = self.kite.x;
    this.ty = self.kite.y;
    this.computeFloor(hazards);
    if (assist > 0) {
      // Batalha: chega, ronda um pouco e só ataca quando a vez for dela
      this.state = 'patrulhar';
      this.patience = 0;
    }
    self.ctrl.assist = 0;
  }

  private go(s: AiState): void {
    this.state = s;
    this.stateTime = 0;
    this.phase = 0;
    this.phaseTime = 0;
  }

  /** Chamar a cada passo fixo. Escreve os comandos em `self.ctrl`. */
  update(player: Flyer, cuts: CutSystem, dt: number, time: number): void {
    const f = this.self;
    const c = f.ctrl;
    if (!isAlive(f)) {
      c.steer = 0;
      c.reel = -0.6;
      c.handY = 0;
      return;
    }
    this.stateTime += dt;
    this.phaseTime += dt;
    const k = f.kite;
    const d = this.diff;
    const myDmg = f.damage;
    const contact = cuts.inContact(f);
    if (contact) this.noContact = 0;
    else this.noContact += dt;

    // ---------- decisões (com tempo de reação) ----------
    this.decide -= dt;
    if (this.decide <= 0) {
      this.decide = d.reaction * (0.7 + this.rng.next() * 0.6);
      const playerUp = isAlive(player);
      switch (this.state) {
        case 'patrulhar':
          if (this.assist > 0) {
            if (playerUp && this.mayAttack && this.stateTime > this.patrolTime) this.go('aproximar');
          } else if (playerUp && this.stateTime > this.patience * (1.2 - d.aggression)) this.go('aproximar');
          break;
        case 'aproximar':
          if (contact || Math.hypot(this.tx - k.x, this.ty - k.y) < 8 + d.aggression * 6) {
            this.go('engajar');
            this.hadContact = contact;
          } else if (!playerUp || this.stateTime > (this.assist > 0 ? 8 : 16)) this.go(this.assist > 0 ? 'patrulhar' : 'recompor');
          break;
        case 'engajar':
          if (contact) this.hadContact = true;
          if (this.assist > 0) {
            // Batalha: errou o bote? volta a rondar e tenta de novo depois
            if (!contact && (this.hadContact ? this.noContact > 1.2 : this.stateTime > 3.5)) {
              this.go('patrulhar');
              this.orbit = -this.orbit;
            }
            break;
          }
          if (myDmg > 0.6) this.go('fugir');
          else if (!playerUp) this.go('recompor');
          else if (this.hadContact ? this.noContact > 2.2 : this.stateTime > 6) this.go('aproximar');
          break;
        case 'fugir':
          if (!contact && this.noContact > 1.4) this.go('recompor');
          break;
        case 'recompor':
          if (this.stateTime > 3 + (1 - d.aggression) * 5 && myDmg < 0.35) this.go(playerUp ? 'aproximar' : 'patrulhar');
          break;
      }
      this.pickTarget(player, time);
    }

    // ---------- reações finas (todo passo) ----------
    let reel = 0;
    let handY = 0;
    switch (this.state) {
      case 'engajar': {
        // alterna soltar (deixa a linha correr pelo cruzamento) e puxar (serra com tração)
        const soltar = 0.6 + d.aggression * 0.9;
        const puxar = 0.5 + (1 - d.aggression) * 0.5;
        if (this.phase === 0) {
          // solta com a linha esticada (sem tração a linha não corta)
          reel = f.tension01 > 0.12 ? 0.3 + d.aggression * 0.4 : 0;
          handY = 0;
          if (this.phaseTime > soltar) {
            this.phase = 1;
            this.phaseTime = 0;
            if (this.rng.next() < d.aggression && f.tension01 < 0.32) c.jerk = true;
          }
        } else {
          // puxa forte só com a linha folgada; esticada, puxa de leve
          handY = f.tension01 < 0.35 ? -1 : f.tension01 < 0.55 ? -0.45 : 0;
          reel = f.tension01 < 0.45 ? -0.3 : 0;
          if (this.phaseTime > puxar) {
            this.phase = 0;
            this.phaseTime = 0;
          }
        }
        break;
      }
      case 'fugir':
        reel = -1;
        handY = -0.5;
        break;
      default: {
        // mantém o comprimento de linha desejado
        const err = this.wantLen - f.reel.out;
        reel = clamp(err / 15, -1, 1);
        break;
      }
    }
    // controle de tensão (com histerese): nunca deixa a própria linha ficar no vermelho
    if (f.tension01 > 0.64 + d.aggression * 0.12) this.easing = true;
    else if (f.tension01 < 0.45) this.easing = false;
    if (this.easing) {
      reel = Math.max(reel, 0.6);
      handY = Math.max(handY, 0.35);
    }
    if (f.status === 'snagged') {
      handY = -1;
      reel = -0.4;
    }

    // ---------- pilotagem até o alvo ----------
    let tx = this.tx;
    let ty = this.ty;
    // não adianta mirar além do alcance da linha: fica alto enquanto solta
    if (this.assist <= 0) {
      const reach = Math.max(8, f.reel.out * 0.62);
      if (tx > f.baseX + reach) tx = f.baseX + reach;
      else if (tx < f.baseX - reach) tx = f.baseX - reach;
    }
    // nunca mirar baixo demais (fios, prédios); na Batalha o chão do alvo é mais baixo
    const floor = this.assist > 0 ? f.baseY + 8 : this.safeFloor + 10;
    if (ty < floor) ty = floor;
    const want = Math.atan2(ty - k.y, tx - k.x);
    // se estiver baixo demais, sobe a qualquer custo
    const heading = k.y < this.safeFloor ? Math.PI / 2 : want;
    const err = wrapAngle(heading - k.angle);
    const noise = noise1(time * 1.3, this.seed) * d.error;
    const dist = Math.hypot(tx - k.x, ty - k.y);
    // perto do alvo: fica estável de bico para cima
    const gain = dist < 4 ? 0.4 : 1;
    const wDesired = clamp(err * 2.4 * gain, -3.2, 3.2);
    c.steer = clamp(-(wDesired - k.omega) * 0.55 + noise, -1, 1);
    c.handX = 0;
    // Batalha: a IA também é guiada (voa tão ágil quanto o jogador) e o carretel acompanha o alvo
    if (this.assist > 0 && !this.hold) {
      // rondando e chegando: mais lenta (dá para fugir); no bote, rápida
      const pace = this.state === 'engajar' ? 1 : this.state === 'aproximar' ? 0.55 : 0.45;
      const rho = Math.hypot(tx - f.handX, ty - f.handY);
      const wantL = Math.max(15, rho * 1.18 + 3);
      reel = clamp((wantL - f.reel.out) / 6, -0.8, 0.9);
      c.assist = this.assist * pace;
      c.assistX = tx;
      c.assistY = ty;
    } else if (!this.hold) c.assist = 0;
    // a mão da IA se move suave (sem trancos acidentais)
    c.handY += (handY - c.handY) * Math.min(1, dt * 3);
    c.reel += (reel - c.reel) * Math.min(1, dt * 6);
  }

  /** Altura mínima segura: acima dos perigos da região onde a pipa voa. */
  private computeFloor(hazards: { x0: number; x1: number; y1: number }[]): void {
    const f = this.self;
    let top = f.baseY + 8;
    const x0 = f.baseX - 120;
    const x1 = f.baseX + 120;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h.x1 < x0 || h.x0 > x1) continue;
      if (h.y1 + 6 > top) top = h.y1 + 6;
    }
    this.safeFloor = Math.min(top, f.baseY + 60);
  }

  private pickTarget(player: Flyer, time: number): void {
    const f = this.self;
    const pk = player.kite;
    const L = f.reel.out;
    const err = this.diff.error * 6;
    switch (this.state) {
      case 'patrulhar':
      case 'recompor': {
        if (this.assist > 0) {
          // Batalha: ronda a pipa do jogador, à vista, sem atacar
          const sway = Math.sin(time * 0.6 + this.seed) * 6;
          this.tx = pk.x + this.orbit * (20 + (this.seed % 7)) + sway;
          this.ty = pk.y + 4 + Math.cos(time * 0.5 + this.seed) * 6;
          break;
        }
        const wob = Math.sin(time * 0.25 + this.seed) * 0.35;
        this.tx = f.baseX + wob * L;
        this.ty = f.baseY + L * 0.78;
        this.wantLen = clamp(Math.max(55, Math.hypot(pk.x - f.baseX, pk.y - f.baseY, pk.z) * 0.9), 40, f.reel.stock * 0.6);
        if (this.state === 'recompor') this.tx = f.baseX + (f.baseX < player.baseX ? -0.3 : 0.3) * L;
        break;
      }
      case 'aproximar': {
        // posição acima da pipa do jogador, do lado da própria mão (contra o "vento" da briga)
        this.side = f.baseX < player.baseX ? -1 : 1;
        this.tx = pk.x + this.side * 7 + (this.rng.next() - 0.5) * err;
        this.ty = pk.y + 9 + (this.rng.next() - 0.5) * err;
        this.wantLen = clamp(Math.hypot(this.tx - f.baseX, this.ty - f.baseY, pk.z) + 4, 30, f.reel.stock * 0.8);
        break;
      }
      case 'engajar': {
        // atravessa a linha do jogador: mira um ponto do outro lado dela, a ~65% do caminho
        const s = 0.6 + this.rng.next() * 0.15;
        const lx = player.handX + (pk.x - player.handX) * s;
        const ly = player.handY + (pk.y - player.handY) * s;
        this.side = f.baseX < player.baseX ? 1 : -1;
        // do outro lado da linha do jogador, serrando para cima e para baixo
        this.tx = lx + this.side * (8 + d2(this.rng) * 6) + (this.rng.next() - 0.5) * err;
        this.ty = ly + Math.sin(time * 1.4 + this.seed) * 7 + (this.rng.next() - 0.5) * err;
        this.wantLen = f.reel.out;
        break;
      }
      case 'fugir': {
        this.tx = f.baseX + (f.baseX < player.baseX ? -0.4 : 0.4) * L;
        this.ty = f.baseY + L * 0.85;
        break;
      }
    }
  }
}
