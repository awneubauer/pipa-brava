import { clamp, fbm1, noise1 } from '../util/noise';

/**
 * Perfil de vento de um cenário. Velocidades em m/s.
 * Vista de frente: o vento sopra das costas do jogador para dentro da tela (z),
 * com componente lateral (x) e pequenas componentes verticais (rajadas).
 */
export interface WindProfile {
  /** Vetor base no plano horizontal (x lateral, z para dentro da tela). */
  baseX: number;
  baseZ: number;
  /** Altura (m acima do chão de referência) em que o vento atinge o valor base. */
  refHeight: number;
  /** Fração do vento base junto ao chão. */
  groundFactor: number;
  /** Amplitude das rajadas (fração) perto do chão e no alto. */
  gustLow: number;
  gustHigh: number;
  /** Período típico das rajadas (s). */
  gustPeriod: number;
  /** Turbulência de base (fração da velocidade). */
  turbulence: number;
  /** Variação de direção (rad). */
  dirJitter: number;
  seed: number;
}

/** Região que gera turbulência (prédio, morro) no plano da tela. */
export interface TurbulenceZone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  strength: number;
}

export interface WindField {
  profile: WindProfile;
  zones: TurbulenceZone[];
  /** Altura do chão usada como referência (m). */
  groundRef: number;
}

export interface WindSample {
  x: number;
  y: number;
  z: number;
  speed: number;
  /** 0..1: quão forte está a rajada agora neste ponto. */
  gust: number;
  /** Intensidade de turbulência local (fração). */
  turb: number;
}

export function createWindSample(): WindSample {
  return { x: 0, y: 0, z: 0, speed: 0, gust: 0, turb: 0 };
}

/** Turbulência adicional de zonas: forte junto e logo acima de prédios/morros. */
export function zoneTurbulence(zones: TurbulenceZone[], x: number, y: number): number {
  let t = 0;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const h = z.y1 - z.y0;
    let dx = 0;
    if (x < z.x0) dx = (z.x0 - x) / (h * 0.5 + 2);
    else if (x > z.x1) dx = (x - z.x1) / (h * 0.5 + 2);
    let dy = 0;
    if (y > z.y1) dy = (y - z.y1) / (h * 0.9 + 3);
    const d = dx * dx + dy * dy;
    if (d < 4) t += z.strength * (1 - d / 4);
  }
  return t;
}

/**
 * Amostra o vento em (x, y) no tempo t. Pura (sem estado), não aloca: escreve em `out`.
 * - Mais forte e mais constante com a altura.
 * - Rajadas suaves (ruído em camadas).
 * - Mais turbulento perto de prédios/morros.
 */
export function sampleWind(out: WindSample, field: WindField, x: number, y: number, t: number): WindSample {
  const p = field.profile;
  const base = Math.hypot(p.baseX, p.baseZ);
  const h = Math.max(0, y - field.groundRef);
  const hn = clamp(h / p.refHeight, 0, 1);
  let hf = p.groundFactor + (1 - p.groundFactor) * Math.pow(hn, 0.45);
  hf *= 1 + 0.2 * clamp((h - p.refHeight) / 220, 0, 1);

  const highness = clamp(h / 130, 0, 1);
  const gustAmp = p.gustLow + (p.gustHigh - p.gustLow) * highness;
  const g = fbm1(t / p.gustPeriod - x * 0.003, p.seed, 3);
  const gustFactor = 1 + gustAmp * g;

  const turb = p.turbulence * (1 - 0.75 * highness) + zoneTurbulence(field.zones, x, y);
  const tx = fbm1(t * 1.7 + x * 0.05 + y * 0.02, p.seed + 7, 3) * turb;
  const ty = fbm1(t * 2.1 - x * 0.04 + y * 0.05, p.seed + 19, 3) * turb;
  const tz = fbm1(t * 1.3 + x * 0.03 - y * 0.03, p.seed + 31, 2) * turb;

  const ang = Math.atan2(p.baseX, p.baseZ) + p.dirJitter * noise1(t / (p.gustPeriod * 1.7) + 3.3, p.seed + 3);
  const sp = base * hf * gustFactor;
  const vx = sp * Math.sin(ang) + tx * base;
  const vy = ty * base * 0.8;
  let vz = sp * Math.cos(ang) + tz * base;
  if (vz < 0.6) vz = 0.6;
  out.x = vx;
  out.y = vy;
  out.z = vz;
  out.speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  out.gust = clamp(g * 1.7, 0, 1) * clamp(gustAmp / 0.22, 0, 1);
  out.turb = turb;
  return out;
}
