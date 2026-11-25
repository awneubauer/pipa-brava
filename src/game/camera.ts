import { CAMERA } from '../config';
import { clamp, fbm1 } from '../util/noise';

/** Câmera ortográfica 2D (y para cima) com suavização, zoom automático e tremor. */
export class Camera {
  x = 0;
  y = 20;
  scale = 14;
  /** viewport em px CSS */
  w = 400;
  h = 800;
  private shakeAmp = 0;
  private shakeT = 0;
  /** deslocamento de tremor atual (px) */
  sx = 0;
  sy = 0;
  // alvo
  private tx = 0;
  private ty = 20;
  private ts = 14;
  private minX = Infinity;
  private maxX = -Infinity;
  private minY = Infinity;
  private maxY = -Infinity;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  beginFrame(): void {
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
  }

  /** inclui um ponto (m) que deve ficar visível, com peso de prioridade */
  include(x: number, y: number, pad = 0): void {
    if (x - pad < this.minX) this.minX = x - pad;
    if (x + pad > this.maxX) this.maxX = x + pad;
    if (y - pad < this.minY) this.minY = y - pad;
    if (y + pad > this.maxY) this.maxY = y + pad;
  }

  /** calcula o alvo a partir dos pontos incluídos; `floor` = chão que deve aparecer embaixo */
  solve(floor: number): void {
    if (this.minX === Infinity) return;
    const minY = Math.min(this.minY, floor);
    const bw = Math.max(8, this.maxX - this.minX);
    const bh = Math.max(10, this.maxY - minY);
    const usableW = this.w * (1 - CAMERA.margin * 2);
    // espaço do HUD em cima e o chão embaixo
    const usableH = this.h * (1 - CAMERA.margin * 2 - 0.08);
    const s = clamp(Math.min(usableW / bw, usableH / bh), CAMERA.minScale, CAMERA.maxScale);
    this.ts = s;
    this.tx = (this.minX + this.maxX) / 2;
    // o chão fica perto da base da tela
    const viewH = this.h / s;
    const centerFromBounds = (minY + this.maxY) / 2 + viewH * 0.04;
    const groundBottom = floor - viewH * 0.06 + viewH / 2;
    this.ty = Math.max(centerFromBounds, groundBottom);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    const kz = 1 - Math.exp(-CAMERA.zoomFollow * dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    // zoom em escala logarítmica para ficar suave
    this.scale = Math.exp(Math.log(this.scale) + (Math.log(this.ts) - Math.log(this.scale)) * kz);
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-dt * 5);
    if (this.shakeAmp < 0.05) this.shakeAmp = 0;
    this.sx = fbm1(this.shakeT * 22, 11, 2) * this.shakeAmp;
    this.sy = fbm1(this.shakeT * 25, 23, 2) * this.shakeAmp;
  }

  snap(): void {
    this.x = this.tx;
    this.y = this.ty;
    this.scale = this.ts;
  }

  shake(px: number): void {
    if (px > this.shakeAmp) this.shakeAmp = px;
  }

  toScreenX(x: number): number {
    return this.w / 2 + (x - this.x) * this.scale + this.sx;
  }
  toScreenY(y: number): number {
    return this.h / 2 - (y - this.y) * this.scale + this.sy;
  }
  toWorldX(sx: number): number {
    return (sx - this.w / 2) / this.scale + this.x;
  }
  toWorldY(sy: number): number {
    return (this.h / 2 - sy) / this.scale + this.y;
  }
  /** escala efetiva de uma camada de paralaxe com fator f */
  layerScale(f: number, ref = 7): number {
    return Math.pow(this.scale, f) * Math.pow(ref, 1 - f);
  }
}
