export const TILE_SIZE = 32;

export type LevelTile = 'wall' | 'floor' | 'spawn';

export type Biome = 'barnyard' | 'forest' | 'lab';

export interface LevelConfig {
  width: number;
  height: number;
  fillRatio?: number;
  spawnRadius?: number;
  seed: number;
}

export interface LevelData {
  width: number;
  height: number;
  tiles: LevelTile[];
  spawnPoints: Array<{ x: number; y: number }>;
  seed: number;
  biome: Biome;
}

type RNG = () => number;

export function generateLevel(config: LevelConfig): LevelData {
  const width = Math.max(8, Math.floor(config.width));
  const height = Math.max(8, Math.floor(config.height));
  const fillRatio = clamp(config.fillRatio ?? 0.45, 0.1, 0.9);
  const spawnRadius = clamp(config.spawnRadius ?? Math.min(width, height) * 0.15, 1, Math.min(width, height) / 2);
  const rng = mulberry32(config.seed);
  const biome = pickBiome(config.seed);

  const tiles: LevelTile[] = new Array(width * height).fill('wall');

  // Random walker carving algorithm
  const totalCells = width * height;
  let carved = 0;
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);
  const targetCarve = Math.floor(totalCells * fillRatio);

  while (carved < targetCarve) {
    const index = toIndex(x, y, width);
    if (tiles[index] === 'wall') {
      tiles[index] = 'floor';
      carved += 1;
    }

    const dir = Math.floor(rng() * 4);
    switch (dir) {
      case 0:
        y = Math.max(1, y - 1);
        break;
      case 1:
        x = Math.min(width - 2, x + 1);
        break;
      case 2:
        y = Math.min(height - 2, y + 1);
        break;
      case 3:
        x = Math.max(1, x - 1);
        break;
    }
  }

  const spawnPoints: Array<{ x: number; y: number }> = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusSq = spawnRadius * spawnRadius;

  for (let iy = 1; iy < height - 1; iy += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iy, width);
      if (tiles[idx] !== 'floor') {
        continue;
      }
      const dx = ix + 0.5 - centerX;
      const dy = iy + 0.5 - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        tiles[idx] = 'spawn';
        spawnPoints.push({ x: ix + 0.5, y: iy + 0.5 });
      }
    }
  }

  if (spawnPoints.length === 0) {
    // Guarantee at least one spawn at center
    const idx = toIndex(Math.floor(centerX), Math.floor(centerY), width);
    tiles[idx] = 'spawn';
    spawnPoints.push({ x: Math.floor(centerX) + 0.5, y: Math.floor(centerY) + 0.5 });
  }

  return {
    width,
    height,
    tiles,
    spawnPoints,
    seed: config.seed,
    biome
  };
}

export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBiome(seed: number): Biome {
  const value = Math.abs(seed % 1000) / 1000;
  if (value < 0.33) {
    return 'barnyard';
  }
  if (value < 0.66) {
    return 'forest';
  }
  return 'lab';
}
