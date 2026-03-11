import type { CropDef, Rarity } from '../types/game';

export const CROPS: CropDef[] = [
  // Common fruits (weight 8 each = 48 total)
  { id: 'apple',   emoji: '🍎', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'orange',  emoji: '🍊', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'lemon',   emoji: '🍋', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'grape',   emoji: '🍇', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'peach',   emoji: '🍑', category: 'fruit',  rarity: 'common',   weight: 8 },
  { id: 'cherry',  emoji: '🍒', category: 'fruit',  rarity: 'common',   weight: 8 },
  // Uncommon fruits (weight 5 each = 25 total)
  { id: 'strawberry', emoji: '🍓', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'watermelon', emoji: '🍉', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'banana',     emoji: '🍌', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'pear',       emoji: '🍐', category: 'fruit', rarity: 'uncommon', weight: 5 },
  { id: 'kiwi',       emoji: '🥝', category: 'fruit', rarity: 'uncommon', weight: 5 },
  // Rare fruits (weight 3 each = 9 total)
  { id: 'mango',      emoji: '🥭', category: 'fruit', rarity: 'rare',     weight: 3 },
  { id: 'pineapple',  emoji: '🍍', category: 'fruit', rarity: 'rare',     weight: 3 },
  { id: 'blueberry',  emoji: '🫐', category: 'fruit', rarity: 'rare',     weight: 3 },
  // Uncommon animals (weight 2.5 each = 10 total)
  { id: 'chicken', emoji: '🐔', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'pig',     emoji: '🐷', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'cow',     emoji: '🐮', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  { id: 'sheep',   emoji: '🐑', category: 'animal', rarity: 'uncommon', weight: 2.5 },
  // Rare animals (weight 1.5 each = 4.5 total)
  { id: 'cat',    emoji: '🐱', category: 'animal', rarity: 'rare',      weight: 1.5 },
  { id: 'dog',    emoji: '🐶', category: 'animal', rarity: 'rare',      weight: 1.5 },
  { id: 'rabbit', emoji: '🐰', category: 'animal', rarity: 'rare',      weight: 1.5 },
  // Legendary animals (weight 0.875 each = 3.5 total)
  { id: 'fox',     emoji: '🦊', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'unicorn', emoji: '🦄', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'dragon',  emoji: '🐉', category: 'animal', rarity: 'legendary', weight: 0.875 },
  { id: 'panda',   emoji: '🐼', category: 'animal', rarity: 'legendary', weight: 0.875 },
];

export const CROP_MAP: Record<string, CropDef> = Object.fromEntries(
  CROPS.map(c => [c.id, c])
);

const TOTAL_WEIGHT = CROPS.reduce((sum, c) => sum + c.weight, 0);

export function getRandomCrop(): CropDef {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const crop of CROPS) {
    roll -= crop.weight;
    if (roll <= 0) return crop;
  }
  return CROPS[0];
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#B0B0B0',
  uncommon: '#4ADE80',
  rare: '#60A5FA',
  legendary: '#F59E0B',
};

export const CROP_PARTICLE_COLORS: Record<string, string> = {
  apple: '#FF3B30', orange: '#FF9500', cherry: '#FF2D55', grape: '#AF52DE',
  peach: '#FFAA85', lemon: '#FFCC00', strawberry: '#FF6B81', watermelon: '#2ECC71',
  banana: '#FFE066', pear: '#A8D86E', kiwi: '#7AB648', mango: '#FFB347',
  pineapple: '#FFD700', blueberry: '#6366F1',
  chicken: '#FFD700', pig: '#FFB6C1', cow: '#D2B48C', sheep: '#F5F5DC',
  cat: '#FFA07A', dog: '#DEB887', rabbit: '#FFC0CB',
  fox: '#FF8C00', unicorn: '#E879F9', dragon: '#EF4444', panda: '#E5E7EB',
};
