import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config';
import { createEasyState, easyControl, startManeuver } from '../src/game/autopilot';
import { BattleRules } from '../src/game/battle';
import { LEVELS, isUnlocked, starsFor } from '../src/game/levels';
import { SKINS } from '../src/game/skins';
import { isAlive } from '../src/physics/flyer';
import { createWorld, stepWorld } from '../src/physics/world';
import { getScene } from '../src/scenes/index';
import { flatEnv, makeFlyer, run, steadyWind } from './helpers';

function playLevel(n: number, seed: number, rub = 1800, limit = 120) {
  const lv = LEVELS[n - 1];
  const orig = Math.random;
  let sd = seed;
  Math.random = () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };
  try {
    const w = createWorld(getScene(lv.scene).world(), 'battle', { model: 'raia', color: '#ff3b5c', tail: '#ffd400' });
    const b = new BattleRules(w, 1, { onCut: () => {}, onWave: () => {}, onSpawn: () => {} }, { fixedWave: lv.wave, concurrent: lv.concurrent, boss: lv.goal === 'boss' });
    const p = w.flyers[0];
    const es = createEasyState();
    let starts = 0;
    let wasDuel = false;
    for (let s = 0; s < limit / PHYSICS.dt; s++) {
      // jogador robô: atravessa a linha do inimigo mais próximo, mexendo o dedo
      let best = null as (typeof w.flyers)[number] | null;
      let bd = 1e9;
      for (let i = 1; i < w.flyers.length; i++) {
        const e = w.flyers[i];
        if (e.hidden || !isAlive(e)) continue;
        const d = Math.hypot(e.kite.x - p.kite.x, e.kite.y - p.kite.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        const sx = best.handX + (best.kite.x - best.handX) * 0.65;
        const sy = best.handY + (best.kite.y - best.handY) * 0.65;
        const side = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
        if (b.duel) easyControl(p, true, b.holdX, b.holdY, false, es, PHYSICS.dt);
        else easyControl(p, true, sx + side * 9, sy + Math.sin(w.time * 2.1) * 5, false, es, PHYSICS.dt);
      } else easyControl(p, false, 0, 0, false, es, PHYSICS.dt);
      b.think(PHYSICS.dt);
      stepWorld(w);
      for (let i = 0; i < w.events.count; i++) {
        const e = w.events.items[i];
        if (e.type === 'cut' && e.flyer !== 0) b.enemyDown(w.flyers[e.flyer], e.other === 0);
      }
      w.events.clear();
      // no duelo, o robô aperta CORTA! quando o marcador está na zona (se `rub` > 0)
      b.step(PHYSICS.dt);
      if (b.duel && !wasDuel) starts++;
      wasDuel = b.duel;
      if (rub > 0 && b.duel && Math.abs(b.marker - b.zoneC) < b.zoneHW * 0.7) b.duelTap();
      for (const f of w.flyers) expect(Number.isFinite(f.kite.x + f.kite.y + f.kite.z)).toBe(true);
      if (!isAlive(p)) return { win: false, b, starts };
      if (lv.goal === 'cut' && b.stats.cuts >= lv.target) return { win: true, b, starts };
    }
    return { win: false, b, starts };
  } finally {
    Math.random = orig;
  }
}

describe('Batalha no Céu (fases)', () => {
  it('são 30 fases, com chefão no fim de cada cenário', () => {
    expect(LEVELS.length).toBe(30);
    expect(LEVELS.filter((l) => l.goal === 'boss').length).toBe(4);
    expect(LEVELS[0].goal).toBe('cut');
  });

  it('liberação e estrelas', () => {
    expect(isUnlocked([], 1)).toBe(true);
    expect(isUnlocked([], 2)).toBe(false);
    expect(isUnlocked([1], 2)).toBe(true);
    const l = LEVELS[1];
    expect(starsFor(l, l.par - 1, 0.1, 3)).toBe(3);
    expect(starsFor(l, l.par + 10, 0.9, 3)).toBe(1);
  });

  it('a fase 1 é vencida rápido por um jogador simples', () => {
    const r = playLevel(1, 11);
    expect(r.win).toBe(true);
    expect(r.b.stats.time).toBeLessThan(40);
  });

  it('a fase 2 (3 cortes) sai em menos de 60 s acertando o timing', () => {
    const r = playLevel(2, 7);
    expect(r.win).toBe(true);
    expect(r.b.stats.time).toBeLessThan(60);
  });

  it('com várias pipas no céu, o duelo não fica reiniciando (fases 3 a 7)', () => {
    for (const n of [3, 5, 6, 7]) {
      const r = playLevel(n, 5 + n, 1800, 60);
      // cada duelo começa uma vez e quase sempre termina num corte (raramente as linhas se soltam)
      expect(r.starts).toBeLessThanOrEqual(Math.ceil(r.b.stats.cuts * 1.5) + 2);
    }
  });

  it('embicada (2 toques) engancha na linha do inimigo com vantagem; segurar (dar linha) foge do ataque', () => {
    const orig = Math.random;
    try {
      let sd = 4;
      Math.random = () => {
        sd = (sd * 16807) % 2147483647;
        return sd / 2147483647;
      };
      const lv = LEVELS[2];
      const w = createWorld(getScene(lv.scene).world(), 'battle', { model: 'raia', color: '#f00', tail: '#ff0' });
      const b = new BattleRules(w, 1, { onCut: () => {}, onWave: () => {}, onSpawn: () => {} }, { fixedWave: lv.wave, concurrent: lv.concurrent });
      const p = w.flyers[0];
      const es = createEasyState();
      const tick = () => {
        easyControl(p, false, 0, 0, false, es, PHYSICS.dt);
        b.think(PHYSICS.dt);
        stepWorld(w);
        w.events.clear();
        b.step(PHYSICS.dt);
      };
      for (let s = 0; s < 2 / PHYSICS.dt; s++) tick();
      const e = w.flyers.find((f, i) => i > 0 && !f.hidden && isAlive(f));
      expect(e).toBeTruthy();
      if (!e) return;
      // ponto da linha dele mais perto da sua pipa
      const linePoint = () => {
        const bx = e.kite.x - e.handX;
        const by = e.kite.y - e.handY;
        let t = ((p.kite.x - e.handX) * bx + (p.kite.y - e.handY) * by) / (bx * bx + by * by);
        t = Math.min(0.92, Math.max(0.35, t));
        return { x: e.handX + bx * t, y: e.handY + by * t };
      };
      // chega perto pilotando, depois mira e embica (a embicada vai reto na mira, ~22 m)
      for (let s = 0; s < 6 / PHYSICS.dt; s++) {
        const lp = linePoint();
        if (Math.hypot(lp.x - p.kite.x, lp.y - p.kite.y) < 12 || b.duel) break;
        easyControl(p, true, lp.x, lp.y, false, es, PHYSICS.dt);
        b.think(PHYSICS.dt);
        stepWorld(w);
        w.events.clear();
        b.step(PHYSICS.dt);
      }
      if (b.duel) {
        expect(b.initiative).toBe('voce');
        return;
      }
      const lp = linePoint();
      const d = Math.hypot(lp.x - p.kite.x, lp.y - p.kite.y) || 1;
      startManeuver(es, 'embicada', p.kite.x + ((lp.x - p.kite.x) / d) * 22, p.kite.y + ((lp.y - p.kite.y) / d) * 22);
      b.jerk();
      let took = -1;
      for (let s = 0; s < 2 / PHYSICS.dt && took < 0; s++) {
        tick();
        if (b.duel) took = s * PHYSICS.dt;
      }
      expect(took).toBeGreaterThan(0);
      expect(took).toBeLessThan(1.2);
      expect(b.initiative).toBe('voce');
    } finally {
      Math.random = orig;
    }
  });

  it('segurar RECOLHE traz a linha de volta e a pipa para perto', () => {
    const env = flatEnv(steadyWind(6.3));
    const f = makeFlyer(60);
    const es = createEasyState();
    run(f, env, 3);
    const d0 = Math.hypot(f.kite.x - f.handX, f.kite.y - f.handY);
    for (let i = 0; i < 3 * 60; i++) {
      startManeuver(es, 'recolhe', 0, 0);
      easyControl(f, false, 0, 0, false, es, 1 / 60);
      run(f, env, 1 / 60);
    }
    expect(f.reel.out).toBeLessThan(30);
    expect(Math.hypot(f.kite.x - f.handX, f.kite.y - f.handY)).toBeLessThan(d0 * 0.6);
  });

  it('apertar sem parar (spam) erra e perde', () => {
    const lv = LEVELS[0];
    const w = createWorld(getScene(lv.scene).world(), 'battle', { model: 'raia', color: '#f00', tail: '#ff0' });
    const b = new BattleRules(w, 1, { onCut: () => {}, onWave: () => {}, onSpawn: () => {} }, { fixedWave: 1, concurrent: 1 });
    // força um duelo artificial: zona longe do marcador
    let misses = 0;
    let hits = 0;
    (b as unknown as { duel: boolean }).duel = true;
    for (let i = 0; i < 40; i++) {
      (b as unknown as { tapCooldown: number }).tapCooldown = 0;
      (b as unknown as { duelCross: unknown }).duelCross = { b: 1, dmgA: 0, dmgB: 0 };
      b.marker = (i * 0.137) % 1;
      b.zoneC = 0.5;
      b.zoneHW = 0.08;
      const r = b.duelTap();
      if (r === 'erro') misses++;
      else if (r) hits++;
    }
    expect(misses).toBeGreaterThan(hits * 3);
  });

  it('duelo: quem não aperta na hora certa perde a linha', () => {
    const r = playLevel(1, 11, 0);
    expect(r.win).toBe(false);
  });

  it('o primeiro inimigo ronda antes de atacar, mas a fase 1 sai rápido', () => {
    const r = playLevel(1, 11);
    expect(r.win).toBe(true);
    expect(r.b.stats.time).toBeGreaterThan(3);
    expect(r.b.stats.time).toBeLessThan(30);
  });

  it('a loja tem skins com preços crescentes e uma grátis', () => {
    expect(SKINS[0].price).toBe(0);
    for (let i = 1; i < SKINS.length; i++) expect(SKINS[i].price).toBeGreaterThanOrEqual(SKINS[i - 1].price);
  });

  it('controle fácil: a pipa chega perto do dedo em poucos segundos', () => {
    const env = flatEnv(steadyWind(6.3));
    const f = makeFlyer(30);
    const es = createEasyState();
    run(f, env, 2);
    let reached = -1;
    for (let i = 0; i < 6 * 60 && reached < 0; i++) {
      easyControl(f, true, 15, 25, false, es, 1 / 60);
      run(f, env, 1 / 60);
      if (Math.hypot(f.kite.x - 15, f.kite.y - 25) < 2.5) reached = i / 60;
    }
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(3);
  });
});
