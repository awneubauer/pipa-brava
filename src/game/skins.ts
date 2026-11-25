import type { KiteModel } from '../config';

/** Loja de skins: modelo + cores + efeito na rabiola. Compradas com moedas. */
export interface Skin {
  id: string;
  name: string;
  model: KiteModel;
  color: string;
  tail: string;
  /** efeito especial: rabiola arco-íris, brilho ou fogo */
  fx?: 'rainbow' | 'glow' | 'fire';
  price: number;
}

export const SKINS: Skin[] = [
  { id: 'raia-vermelha', name: 'Raia Clássica', model: 'raia', color: '#ff3b5c', tail: '#ffd400', price: 0 },
  { id: 'raia-azul', name: 'Raia Céu', model: 'raia', color: '#1ec8ff', tail: '#ffffff', price: 40 },
  { id: 'piao-roxo', name: 'Pião Uva', model: 'piao', color: '#b04dff', tail: '#ffd400', price: 80 },
  { id: 'quadrada-verde', name: 'Quadrada Gramado', model: 'quadrada', color: '#2ed573', tail: '#ff3b5c', price: 120 },
  { id: 'papagaio-laranja', name: 'Papagaio Laranja', model: 'papagaio', color: '#ff8a00', tail: '#5f6bff', price: 160 },
  { id: 'coracao-rosa', name: 'Coração', model: 'coracao', color: '#ff3b5c', tail: '#ffffff', price: 220 },
  { id: 'estrela-ouro', name: 'Estrela de Ouro', model: 'estrela', color: '#ffd400', tail: '#ff8a00', fx: 'glow', price: 350 },
  { id: 'raia-arco', name: 'Raia Arco-íris', model: 'raia', color: '#5f6bff', tail: '#ff3b5c', fx: 'rainbow', price: 500 },
  { id: 'papagaio-fogo', name: 'Papagaio de Fogo', model: 'papagaio', color: '#ff3b5c', tail: '#ff8a00', fx: 'fire', price: 750 },
  { id: 'estrela-noite', name: 'Estrela da Noite', model: 'estrela', color: '#5f6bff', tail: '#ffffff', fx: 'glow', price: 1000 },
];

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** Cerol / linha: quanto maior a força, menos vai e vem é preciso no duelo. */
export interface Cerol {
  id: string;
  name: string;
  power: number;
  price: number;
  color: string;
  desc: string;
}

export const CEROLS: Cerol[] = [
  { id: 'comum', name: 'Linha Comum', power: 1, price: 0, color: '#f4efe2', desc: 'O começo de todo pipeiro.' },
  { id: 'caseiro', name: 'Cerol Caseiro', power: 1.4, price: 150, color: '#ffe08a', desc: 'Corta 40% mais rápido.' },
  { id: 'vidro', name: 'Cerol de Vidro', power: 1.9, price: 450, color: '#9ff3ff', desc: 'Quase o dobro de corte.' },
  { id: 'chilena', name: 'Linha Chilena', power: 2.5, price: 1000, color: '#ff9f6b', desc: 'Para quem manda no céu.' },
  { id: 'dourada', name: 'Linha Dourada', power: 3.2, price: 2200, color: '#ffd400', desc: 'Lendária. Poucos vai e vens.' },
];

export function getCerol(id: string): Cerol {
  return CEROLS.find((c) => c.id === id) ?? CEROLS[0];
}
