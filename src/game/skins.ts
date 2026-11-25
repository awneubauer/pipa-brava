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
