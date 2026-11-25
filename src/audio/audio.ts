/**
 * Áudio 100% sintetizado com Web Audio, iniciado após o primeiro toque.
 * Sons contínuos (vento, zumbido da linha, carretel, alarme) usam nós persistentes
 * cujos parâmetros são só ajustados a cada quadro (sem criar objetos no loop).
 * Sons pontuais (estalo de corte, choque, jingles) criam nós curtos sob demanda.
 */

type Ctx = AudioContext;

export interface AudioFrame {
  /** velocidade do vento na pipa (m/s) */
  wind: number;
  /** velocidade da pipa no ar (m/s) */
  airspeed: number;
  /** tensão normalizada 0..1+ */
  tension: number;
  /** velocidade do carretel (m/s, + soltando) */
  reel: number;
  /** tensão no vermelho */
  red: boolean;
  /** jogo rodando (false = pausado/menu) */
  active: boolean;
}

export class GameAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humOsc2: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private reelGain: GainNode | null = null;
  private reelLfo: OscillatorNode | null = null;
  private reelFilter: BiquadFilterNode | null = null;
  private alarmGain: GainNode | null = null;
  private alarmLfoGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;

  /** Cria o contexto (chamar dentro de um gesto do usuário). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: Ctx;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    // ruído branco reaproveitado por tudo
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // vento: ruído filtrado
    const wn = ctx.createBufferSource();
    wn.buffer = buf;
    wn.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 400;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wn.connect(wf).connect(wg).connect(master);
    wn.start();
    this.windGain = wg;
    this.windFilter = wf;

    // zumbido da linha: dois osciladores levemente desafinados
    const h1 = ctx.createOscillator();
    h1.type = 'sawtooth';
    h1.frequency.value = 140;
    const h2 = ctx.createOscillator();
    h2.type = 'triangle';
    h2.frequency.value = 141.5;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 900;
    hf.Q.value = 3;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    h1.connect(hf);
    h2.connect(hf);
    hf.connect(hg).connect(master);
    h1.start();
    h2.start();
    this.humOsc = h1;
    this.humOsc2 = h2;
    this.humGain = hg;
    this.humFilter = hf;

    // carretel: ruído agudo modulado por um LFO quadrado (catraca)
    const rn = ctx.createBufferSource();
    rn.buffer = buf;
    rn.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 2500;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 10;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    const tick = ctx.createGain();
    tick.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(tick.gain);
    rn.connect(rf).connect(tick).connect(rg).connect(master);
    rn.start();
    lfo.start();
    this.reelGain = rg;
    this.reelLfo = lfo;
    this.reelFilter = rf;

    // alarme de tensão: bipe agudo
    const ao = ctx.createOscillator();
    ao.type = 'square';
    ao.frequency.value = 2100;
    const al = ctx.createOscillator();
    al.type = 'square';
    al.frequency.value = 9;
    const alg = ctx.createGain();
    alg.gain.value = 0.5;
    const beep = ctx.createGain();
    beep.gain.value = 0.5;
    al.connect(alg).connect(beep.gain);
    const ag = ctx.createGain();
    ag.gain.value = 0;
    ao.connect(beep).connect(ag).connect(master);
    ao.start();
    al.start();
    this.alarmGain = ag;
    this.alarmLfoGain = alg;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** Atualiza os sons contínuos (a cada quadro). */
  update(f: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const t = ctx.currentTime;
    const k = 0.08;
    const on = f.active ? 1 : 0;
    const wind = Math.min(1, (f.wind + f.airspeed * 0.4) / 16);
    this.windGain.gain.setTargetAtTime(on * (0.05 + wind * 0.22), t, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + wind * 1100, t, 0.2);
    const ten = Math.max(0, Math.min(1.3, f.tension));
    if (this.humOsc && this.humOsc2 && this.humGain && this.humFilter) {
      const fr = 110 + ten * 420 + f.airspeed * 4;
      this.humOsc.frequency.setTargetAtTime(fr, t, k);
      this.humOsc2.frequency.setTargetAtTime(fr * 1.012, t, k);
      this.humFilter.frequency.setTargetAtTime(500 + ten * 2200, t, k);
      this.humGain.gain.setTargetAtTime(on * Math.min(0.09, ten * 0.08 + Math.min(1, f.airspeed / 20) * 0.02), t, k);
    }
    if (this.reelGain && this.reelLfo && this.reelFilter) {
      const r = Math.min(1, Math.abs(f.reel) / 20);
      this.reelLfo.frequency.setTargetAtTime(6 + Math.abs(f.reel) * 2.5, t, 0.05);
      this.reelFilter.frequency.setTargetAtTime(f.reel > 0 ? 3000 : 1800, t, 0.05);
      this.reelGain.gain.setTargetAtTime(on * (r > 0.02 ? 0.05 + r * 0.12 : 0), t, 0.04);
    }
    if (this.alarmGain && this.alarmLfoGain) this.alarmGain.gain.setTargetAtTime(on && f.red ? 0.05 : 0, t, 0.02);
  }

  private burst(dur: number, freq: number, type: BiquadFilterType, gain: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = freq;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Estalo seco de linha cortada. */
  snapCut(): void {
    this.burst(0.09, 3200, 'highpass', 0.9);
    this.burst(0.25, 900, 'bandpass', 0.5, 2);
    this.tone(180, 0.18, 'sine', 0.5, 0, 60);
  }

  /** Linha arrebentando por tensão (mais grave). */
  snapBreak(): void {
    this.burst(0.12, 1800, 'bandpass', 0.8, 1.5);
    this.tone(320, 0.3, 'sawtooth', 0.2, 0, 70);
  }

  /** Choque elétrico no fio. */
  shock(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (let i = 0; i < 6; i++) this.burst(0.07, 2000 + Math.random() * 3000, 'bandpass', 0.6, 3, i * 0.06);
    this.tone(60, 0.6, 'sawtooth', 0.35, 0, 45);
    this.tone(120, 0.5, 'square', 0.12, 0.02, 90);
  }

  /** Faísca leve de linhas raspando. */
  scrape(intensity: number): void {
    this.burst(0.05, 4500, 'highpass', 0.08 + intensity * 0.18);
  }

  /** Batida/quique leve. */
  bump(): void {
    this.tone(220, 0.12, 'triangle', 0.25, 0, 140);
  }

  /** Rasgo de papel. */
  tear(): void {
    for (let i = 0; i < 4; i++) this.burst(0.06, 1200 + i * 700, 'bandpass', 0.5, 1, i * 0.05);
  }

  /** Jingle curto de manobra (sobe com o combo). */
  maneuver(combo: number): void {
    const base = 523.25 * Math.pow(2, Math.min(combo - 1, 6) / 12);
    this.tone(base, 0.12, 'triangle', 0.25, 0);
    this.tone(base * 1.25, 0.12, 'triangle', 0.25, 0.08);
    this.tone(base * 1.5, 0.22, 'triangle', 0.28, 0.16);
  }

  victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, i === notes.length - 1 ? 0.6 : 0.16, 'triangle', 0.3, i * 0.13));
    notes.forEach((n, i) => this.tone(n / 2, 0.16, 'square', 0.06, i * 0.13));
  }

  defeat(): void {
    [392, 349.23, 311.13, 261.63].forEach((n, i) => this.tone(n, i === 3 ? 0.7 : 0.22, 'triangle', 0.28, i * 0.2));
  }

  /** Clique de interface. */
  click(): void {
    this.tone(880, 0.05, 'square', 0.08);
  }
}
