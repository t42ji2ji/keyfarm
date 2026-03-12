import type { CropDef, Rarity } from '../types/game';

export const CROPS: CropDef[] = [
  // ── Common (30) ── weight 2.0 each = 60 total ──────────────────
  // Fruits
  { id: 'apple',        emoji: '🍎', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'orange',       emoji: '🍊', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'lemon',        emoji: '🍋', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'grape',        emoji: '🍇', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'peach',        emoji: '🍑', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'cherry',       emoji: '🍒', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'green_apple',  emoji: '🍏', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'pear',         emoji: '🍐', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'banana',       emoji: '🍌', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'tomato',       emoji: '🍅', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'corn',         emoji: '🌽', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'carrot',       emoji: '🥕', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'potato',       emoji: '🥔', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'broccoli',     emoji: '🥦', category: 'fruit',  rarity: 'common', weight: 2.0},
  { id: 'cucumber',     emoji: '🥒', category: 'fruit',  rarity: 'common', weight: 2.0},
  // Animals
  { id: 'chicken',      emoji: '🐔', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'pig',          emoji: '🐷', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'cow',          emoji: '🐮', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'sheep',        emoji: '🐑', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'duck',         emoji: '🦆', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'frog',         emoji: '🐸', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'hamster',      emoji: '🐹', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'chick',        emoji: '🐣', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'snail',        emoji: '🐌', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'ladybug',      emoji: '🐞', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'mouse',        emoji: '🐭', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'ant',          emoji: '🐜', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'fish',         emoji: '🐟', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'hatching',     emoji: '🐥', category: 'animal', rarity: 'common', weight: 2.0},
  { id: 'eggplant',     emoji: '🍆', category: 'fruit',  rarity: 'common', weight: 2.0},

  // ── Uncommon (35) ── weight 0.8 each = 28 total ────────────────
  // Fruits
  { id: 'strawberry',   emoji: '🍓', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'watermelon',   emoji: '🍉', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'kiwi',         emoji: '🥝', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'melon',        emoji: '🍈', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'coconut',      emoji: '🥥', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'avocado',      emoji: '🥑', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'chili',        emoji: '🌶️', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'mushroom',     emoji: '🍄', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'chestnut',     emoji: '🌰', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'peanut',       emoji: '🥜', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'sweet_potato', emoji: '🍠', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  { id: 'garlic',       emoji: '🧅', category: 'fruit',  rarity: 'uncommon', weight: 0.8},
  // Animals
  { id: 'cat',          emoji: '🐱', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'dog',          emoji: '🐶', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'rabbit',       emoji: '🐰', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'butterfly',    emoji: '🦋', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'bee',          emoji: '🐝', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'turtle',       emoji: '🐢', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'penguin',      emoji: '🐧', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'owl',          emoji: '🦉', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'bear',         emoji: '🐻', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'koala',        emoji: '🐨', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'tiger',        emoji: '🐯', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'lion',         emoji: '🦁', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'wolf',         emoji: '🐺', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'hedgehog',     emoji: '🦔', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'dolphin',      emoji: '🐬', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'tropical_fish',emoji: '🐠', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'monkey',       emoji: '🐵', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'horse',        emoji: '🐴', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'deer',         emoji: '🦌', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'gorilla',      emoji: '🦍', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'boar',         emoji: '🐗', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'whale',        emoji: '🐳', category: 'animal', rarity: 'uncommon', weight: 0.8},
  { id: 'crab',         emoji: '🦀', category: 'animal', rarity: 'uncommon', weight: 0.8},

  // ── Rare (25) ── weight 0.2 each = 5 total ─────────────────────
  // Fruits
  { id: 'mango',        emoji: '🥭', category: 'fruit',  rarity: 'rare', weight: 0.2},
  { id: 'pineapple',    emoji: '🍍', category: 'fruit',  rarity: 'rare', weight: 0.2},
  { id: 'blueberry',    emoji: '🫐', category: 'fruit',  rarity: 'rare', weight: 0.2},
  // Animals
  { id: 'parrot',       emoji: '🦜', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'octopus',      emoji: '🐙', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'shark',        emoji: '🦈', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'eagle',        emoji: '🦅', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'crocodile',    emoji: '🐊', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'elephant',     emoji: '🐘', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'giraffe',      emoji: '🦒', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'kangaroo',     emoji: '🦘', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'otter',        emoji: '🦦', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'sloth',        emoji: '🦥', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'camel',        emoji: '🐪', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'bat',          emoji: '🦇', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'snake',        emoji: '🐍', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'lizard',       emoji: '🦎', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'scorpion',     emoji: '🦂', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'swan',         emoji: '🦢', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'lobster',      emoji: '🦞', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'squid',        emoji: '🦑', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'beaver',       emoji: '🦫', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'zebra',        emoji: '🦓', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'leopard',      emoji: '🐆', category: 'animal', rarity: 'rare', weight: 0.2},
  { id: 'bison',        emoji: '🦬', category: 'animal', rarity: 'rare', weight: 0.2},

  // ── Legendary (10) ── weight 0.1 each = 1 total ────────────────
  { id: 'fox',          emoji: '🦊', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'unicorn',      emoji: '🦄', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'dragon',       emoji: '🐉', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'panda',        emoji: '🐼', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'flamingo',     emoji: '🦩', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'peacock',      emoji: '🦚', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'dodo',         emoji: '🦤', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'orangutan',    emoji: '🦧', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'hippo',        emoji: '🦛', category: 'animal', rarity: 'legendary', weight: 0.1},
  { id: 'rhino',        emoji: '🦏', category: 'animal', rarity: 'legendary', weight: 0.1},
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
  // Common fruits
  apple: '#FF3B30', orange: '#FF9500', lemon: '#FFCC00', grape: '#AF52DE',
  peach: '#FFAA85', cherry: '#FF2D55', green_apple: '#7EC850', pear: '#A8D86E',
  banana: '#FFE066', tomato: '#FF4444', corn: '#FFD700', carrot: '#FF8C42',
  potato: '#C4A265', broccoli: '#3B8C3B', cucumber: '#6BBF59', eggplant: '#7B3FA0',
  // Common animals
  chicken: '#FFD700', pig: '#FFB6C1', cow: '#D2B48C', sheep: '#F5F5DC',
  duck: '#5BBF5B', frog: '#4CAF50', hamster: '#E8B86C', chick: '#FFE066',
  snail: '#C49A6C', ladybug: '#FF3B30', mouse: '#B0B0B0', ant: '#654321',
  fish: '#60A5FA', hatching: '#FFE066',
  // Uncommon fruits
  strawberry: '#FF6B81', watermelon: '#2ECC71', kiwi: '#7AB648', melon: '#A8D86E',
  coconut: '#F5F5DC', avocado: '#568203', chili: '#FF2D00', mushroom: '#CD853F',
  chestnut: '#8B4513', peanut: '#D4A574', sweet_potato: '#E07C3E', garlic: '#F5F5DC',
  // Uncommon animals
  cat: '#FFA07A', dog: '#DEB887', rabbit: '#FFC0CB', butterfly: '#E879F9',
  bee: '#FFD700', turtle: '#2ECC71', penguin: '#2C3E50', owl: '#A0522D',
  bear: '#8B4513', koala: '#A0A0A0', tiger: '#FF8C00', lion: '#DAA520',
  wolf: '#708090', hedgehog: '#C49A6C', dolphin: '#4A90D9', tropical_fish: '#FF6B6B',
  monkey: '#C49A6C', horse: '#8B4513', deer: '#CD853F', gorilla: '#555555',
  boar: '#8B6914', whale: '#4A90D9', crab: '#FF4500',
  // Rare fruits
  mango: '#FFB347', pineapple: '#FFD700', blueberry: '#6366F1',
  // Rare animals
  parrot: '#2ECC71', octopus: '#E879F9', shark: '#708090', eagle: '#8B6914',
  crocodile: '#4A7C4B', elephant: '#A0A0A0', giraffe: '#DAA520', kangaroo: '#C49A6C',
  otter: '#8B6914', sloth: '#A0522D', camel: '#DAA520', bat: '#2C3E50',
  snake: '#4CAF50', lizard: '#7AB648', scorpion: '#2C2C2C', swan: '#F5F5F5',
  lobster: '#FF3B30', squid: '#E879F9', beaver: '#8B4513', zebra: '#333333',
  leopard: '#DAA520', bison: '#654321',
  // Legendary
  fox: '#FF8C00', unicorn: '#E879F9', dragon: '#EF4444', panda: '#E5E7EB',
  flamingo: '#FF69B4', peacock: '#00CED1', dodo: '#A0522D', orangutan: '#FF6347',
  hippo: '#A0A0B0', rhino: '#808080',
};
