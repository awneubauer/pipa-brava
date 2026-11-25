/** Perigos do cenário e colisão círculo × forma, sem alocação. */

export type HazardKind = 'wire' | 'post' | 'antenna' | 'tank' | 'tree' | 'building';

export interface Hazard {
  kind: HazardKind;
  /** 'poly': polilinha (fios), 'seg': segmento com raio, 'rect': caixa, 'circle' */
  shape: 'poly' | 'seg' | 'rect' | 'circle';
  /** pontos (x0,y0,x1,y1,...) para poly/seg; para circle: cx,cy */
  pts: Float32Array;
  /** raio para seg/circle/poly */
  r: number;
  /** caixa envolvente (também é a própria caixa para 'rect') */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function makeRect(kind: HazardKind, x0: number, y0: number, x1: number, y1: number): Hazard {
  return { kind, shape: 'rect', pts: new Float32Array(0), r: 0, x0, y0, x1, y1 };
}

export function makeCircle(kind: HazardKind, cx: number, cy: number, r: number): Hazard {
  return { kind, shape: 'circle', pts: new Float32Array([cx, cy]), r, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
}

export function makeSeg(kind: HazardKind, ax: number, ay: number, bx: number, by: number, r: number): Hazard {
  return {
    kind,
    shape: 'seg',
    pts: new Float32Array([ax, ay, bx, by]),
    r,
    x0: Math.min(ax, bx) - r,
    y0: Math.min(ay, by) - r,
    x1: Math.max(ax, bx) + r,
    y1: Math.max(ay, by) + r,
  };
}

/** Catenária (aproximada por parábola) entre dois pontos, com flecha `sag`. */
export function makeWire(ax: number, ay: number, bx: number, by: number, sag: number, samples = 14): Hazard {
  const pts = new Float32Array((samples + 1) * 2);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
    pts[i * 2] = x;
    pts[i * 2 + 1] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const r = 0.08;
  return { kind: 'wire', shape: 'poly', pts, r, x0: Math.min(ax, bx) - r, y0: minY - r, x1: Math.max(ax, bx) + r, y1: maxY + r };
}

export interface Contact {
  nx: number;
  ny: number;
  depth: number;
  px: number;
  py: number;
}

export function createContact(): Contact {
  return { nx: 0, ny: 1, depth: 0, px: 0, py: 0 };
}

function segContact(out: Contact, ax: number, ay: number, bx: number, by: number, x: number, y: number, rr: number): boolean {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + ex * t;
  const cy = ay + ey * t;
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  const depth = rr - d;
  if (depth > out.depth) {
    out.depth = depth;
    if (d > 1e-6) {
      out.nx = dx / d;
      out.ny = dy / d;
    } else {
      out.nx = 0;
      out.ny = 1;
    }
    out.px = cx;
    out.py = cy;
  }
  return true;
}

/** Testa um círculo (x, y, r) contra o perigo. Preenche `out` com a normal de saída. */
export function collide(out: Contact, h: Hazard, x: number, y: number, r: number): boolean {
  if (x + r < h.x0 || x - r > h.x1 || y + r < h.y0 || y - r > h.y1) return false;
  out.depth = 0;
  switch (h.shape) {
    case 'rect': {
      const cx = x < h.x0 ? h.x0 : x > h.x1 ? h.x1 : x;
      const cy = y < h.y0 ? h.y0 : y > h.y1 ? h.y1 : y;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1e-9) {
        if (d2 >= r * r) return false;
        const d = Math.sqrt(d2);
        out.nx = dx / d;
        out.ny = dy / d;
        out.depth = r - d;
      } else {
        // centro dentro da caixa: sai pelo lado mais próximo
        const l = x - h.x0;
        const rgt = h.x1 - x;
        const b = y - h.y0;
        const t = h.y1 - y;
        const m = Math.min(l, rgt, b, t);
        if (m === t) {
          out.nx = 0;
          out.ny = 1;
        } else if (m === l) {
          out.nx = -1;
          out.ny = 0;
        } else if (m === rgt) {
          out.nx = 1;
          out.ny = 0;
        } else {
          out.nx = 0;
          out.ny = -1;
        }
        out.depth = m + r;
      }
      out.px = cx;
      out.py = cy;
      return true;
    }
    case 'circle': {
      const dx = x - h.pts[0];
      const dy = y - h.pts[1];
      const rr = r + h.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2) || 1e-6;
      out.nx = dx / d;
      out.ny = dy / d;
      out.depth = rr - d;
      out.px = h.pts[0] + out.nx * h.r;
      out.py = h.pts[1] + out.ny * h.r;
      return true;
    }
    case 'seg':
      return segContact(out, h.pts[0], h.pts[1], h.pts[2], h.pts[3], x, y, r + h.r);
    case 'poly': {
      let hit = false;
      const p = h.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        if (segContact(out, p[i], p[i + 1], p[i + 2], p[i + 3], x, y, r + h.r)) hit = true;
      }
      return hit;
    }
  }
  return false;
}

export const HAZARD_LABEL: Record<HazardKind, string> = {
  wire: 'fio de luz',
  post: 'poste',
  antenna: 'antena',
  tank: "caixa d'água",
  tree: 'árvore',
  building: 'prédio',
};
