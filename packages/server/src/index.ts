import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import {
  ARTIFACT_TTL,
  AUGMENT_POOL,
  BASE_PLAYER_DAMAGE,
  ENEMY_ATTACK_COOLDOWN,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_ATTACK_RANGE,
  ENEMY_ATTACK_RECOVERY,
  ENEMY_ATTACK_WINDUP,
  ENEMY_XP_VALUES,
  LOOT_MAGNET_BASE_RADIUS,
  LOOT_MAGNET_MAX_RADIUS,
  LOOT_MAGNET_PULL_SPEED,
  LOOT_MAGNET_RADIUS_STEP,
  MAX_PLAYERS,
  NETWORK_PROTOCOL_VERSION,
  PLAYER_HURT_FLASH_TIME,
  PLAYER_INVULNERABILITY_TIME,
  PROJECTILE_COOLDOWN,
  PROJECTILE_LIFETIME,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  STACKABLE_AUGMENTS,
  TILE_SIZE,
  TICK_RATE,
  createInitialInputState,
  generateLevel,
  getAugmentOption
} from '@farsight/shared';
import type {
  ActiveMutators,
  ArmoryItem,
  ArmoryState,
  ArtifactKind,
  AugmentId,
  ClientMessage,
  EntityDelta,
  EnemyKind,
  EnemyState,
  GamePhase,
  LevelData,
  MutatorCadence,
  ObjectiveState,
  PlayerArmoryState,
  PlayerInputState,
  PlayerState,
  PlayerSummary,
  ProjectileFaction,
  ProjectileState,
  QuickPingBroadcastMessage,
  QuickPingKind,
  RosterEntry,
  RunSummary,
  RunSummaryPlayer,
  ServerMessage,
  Vector2D,
  WorldSnapshot,
  WorldSnapshotDelta,
  XpDropState
} from '@farsight/shared';

const TICK_INTERVAL_MS = 1000 / TICK_RATE;
const PORT = Number(process.env.PORT ?? 7777);
const LEVEL_CONFIG = {
  width: 96,
  height: 96,
  fillRatio: 0.5,
  spawnRadius: 12,
  seed: Number(process.env.LEVEL_SEED ?? Math.floor(Math.random() * 2 ** 32))
};


interface AugmentOffer {
  id: string;
  level: number;
  options: AugmentId[];
}

type PlayerSimState = PlayerState & {
  input: PlayerInputState;
  primaryCooldown: number;
  experience: number;
  experienceToNext: number;
  health: number;
  maxHealth: number;
  hurtTimer: number;
  invulnerableTimer: number;
  damageMultiplier: number;
  cooldownMultiplier: number;
  projectileSpeedMultiplier: number;
  splitShots: number;
  healthGrowthMultiplier: number;
  pendingAugments: AugmentOffer[];
  augments: AugmentId[];
  lastAugmentId: AugmentId | null;
  ready: boolean;
  lastPingTimestamp: number;
  aimHeading: number;
  lootMagnetRadius: number;
  artifacts: ArtifactKind[];
  artifactShieldTimer: number;
  artifactShieldValue: number;
  damageTaken: number;
  xpCollected: number;
};

type EnemySimState = EnemyState & {
  wanderDirection: Vector2D;
  switchTimer: number;
  attackCooldown: number;
  isBoss: boolean;
  burrowTimer: number;
  burrowed: boolean;
  supportTimer: number;
  channelTimer: number;
};

type ProjectileSimState = ProjectileState & {
  ttl: number;
  damage: number;
  maxSplits: number;
  splitDepth: number;
  radius: number;
};

type XpDropSimState = XpDropState;
type ArtifactDropSimState = {
  id: string;
  kind: ArtifactKind;
  position: Vector2D;
  age: number;
};

type WorldEvent =
  | { type: 'broadcast'; message: ServerMessage }
  | { type: 'target'; targetId: string; message: ServerMessage };

interface ArmoryPlayerMeta {
  id: string;
  displayName: string;
  feathers: number;
  ready: boolean;
  ownedUpgrades: Set<string>;
  equippedUpgrades: string[];
  ownedCosmetics: Set<string>;
  equippedCosmeticId: string | null;
  loadoutLabel: string;
}

interface MutatorTemplate {
  id: string;
  name: string;
  description: string;
  impactSummary: string;
  tags: string[];
}

const MAX_EQUIPPED_UPGRADES = 3;

const ARMORY_UPGRADES: ArmoryItem[] = [
  {
    id: 'focus-matrix',
    name: 'Focus Matrix',
    description: 'Channelled psionic lattice that amplifies baseline bolt damage.',
    cost: 180,
    kind: 'upgrade',
    slot: 'ability',
    statSummary: '+12% bolt damage'
  },
  {
    id: 'celerity-core',
    name: 'Celerity Core',
    description: 'Temporal dampers shave milliseconds off each channel.',
    cost: 220,
    kind: 'upgrade',
    slot: 'ability',
    statSummary: '-15% ability cooldowns'
  },
  {
    id: 'bulwark-weave',
    name: 'Bulwark Weave',
    description: 'Layered ward-feather plating that bolsters vitality.',
    cost: 200,
    kind: 'upgrade',
    slot: 'passive',
    statSummary: '+40 max health'
  },
  {
    id: 'rift-channeler',
    name: 'Rift Channeler',
    description: 'Splitting prism etched for clean bolt echoes.',
    cost: 260,
    kind: 'upgrade',
    slot: 'ability',
    statSummary: '+1 bolt split & +8% projectile speed'
  },
  {
    id: 'magnet-surge',
    name: 'Magnet Surge',
    description: 'Feathered coils widen the ambient pull of loose XP.',
    cost: 180,
    kind: 'upgrade',
    slot: 'passive',
    statSummary: '+20% magnet radius & +50 pull speed'
  }
];

const ARMORY_COSMETICS: ArmoryItem[] = [
  {
    id: 'cosmic-plumage',
    name: 'Cosmic Plumage',
    description: 'Aurora-tinted feathers with soft nebula bloom.',
    cost: 140,
    kind: 'cosmetic',
    slot: 'cosmetic',
    statSummary: 'Visual: aurora glow'
  },
  {
    id: 'ember-sheen',
    name: 'Ember Sheen',
    description: 'Smouldering plumage leaving faint ember trails.',
    cost: 160,
    kind: 'cosmetic',
    slot: 'cosmetic',
    statSummary: 'Visual: ember trail'
  },
  {
    id: 'midnight-veil',
    name: 'Midnight Veil',
    description: 'Deep-indigo coat with starlit speckles.',
    cost: 130,
    kind: 'cosmetic',
    slot: 'cosmetic',
    statSummary: 'Visual: starlit shimmer'
  },
  {
    id: 'suncrest',
    name: 'Suncrest',
    description: 'Bold gold/ochre plumage celebrating daytime sorties.',
    cost: 150,
    kind: 'cosmetic',
    slot: 'cosmetic',
    statSummary: 'Visual: sunburst crest'
  }
];

const MUTATOR_LIBRARY: MutatorTemplate[] = [
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    description: 'Squad bolts strike harder but vitality thins.',
    impactSummary: '+25% bolt damage / -20% max health',
    tags: ['challenge', 'damage']
  },
  {
    id: 'overgrowth',
    name: 'Overgrowth',
    description: 'The arena floods with restless wildlife.',
    impactSummary: '+18% enemy spawns',
    tags: ['horde', 'environment']
  },
  {
    id: 'aerial-superiority',
    name: 'Aerial Superiority',
    description: 'Hawks take to the skies with renewed ferocity.',
    impactSummary: 'Hawk dive speed +20%',
    tags: ['enemy', 'movement']
  },
  {
    id: 'psionic-storm',
    name: 'Psionic Storm',
    description: 'Ambient static supercharges artifacts and abilities.',
    impactSummary: '+15% cooldown haste & artifact shield refresh',
    tags: ['bonus', 'abilities']
  },
  {
    id: 'orbital-drill',
    name: 'Orbital Drill',
    description: 'Periodic tremors stagger beasts but distort aim.',
    impactSummary: 'Random screen shake pulses & +5% projectile sway',
    tags: ['hazard', 'control']
  }
];

function hashToIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo === 0 ? 0 : hash % modulo;
}

function computeMutatorExpiry(cadence: MutatorCadence, reference: Date): string {
  const expiry = new Date(reference);
  if (cadence === 'daily') {
    expiry.setUTCHours(0, 0, 0, 0);
    expiry.setUTCDate(expiry.getUTCDate() + 1);
  } else {
    const day = expiry.getUTCDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    expiry.setUTCHours(0, 0, 0, 0);
    expiry.setUTCDate(expiry.getUTCDate() + daysUntilMonday);
  }
  return expiry.toISOString();
}

function pickMutator(seed: string): MutatorTemplate {
  if (MUTATOR_LIBRARY.length === 0) {
    return {
      id: 'placeholder',
      name: 'Placeholder',
      description: 'No mutators configured',
      impactSummary: '—',
      tags: []
    };
  }
  const index = hashToIndex(seed, MUTATOR_LIBRARY.length);
  return MUTATOR_LIBRARY[index];
}

function generateActiveMutators(now = new Date()): ActiveMutators {
  const dailySeed = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const weekNumber = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  const weeklySeed = `${now.getUTCFullYear()}-w${weekNumber}`;
  const dailyTemplate = pickMutator(`daily:${dailySeed}`);
  const weeklyTemplate = pickMutator(`weekly:${weeklySeed}`);
  const daily: ActiveMutators['daily'] = {
    ...dailyTemplate,
    cadence: 'daily',
    expiresAt: computeMutatorExpiry('daily', now)
  };
  const weekly: ActiveMutators['weekly'] = {
    ...weeklyTemplate,
    cadence: 'weekly',
    expiresAt: computeMutatorExpiry('weekly', now)
  };
  return { daily, weekly };
}

class ArmoryManager {
  private readonly players = new Map<string, ArmoryPlayerMeta>();
  private mutators: ActiveMutators = generateActiveMutators();
  private lastMutatorCheck = Date.now();
  private summary: RunSummary | null = null;
  private summaryEndsAt: number | null = null;

  ensurePlayer(id: string, displayName: string): ArmoryPlayerMeta {
    let player = this.players.get(id);
    if (!player) {
      player = {
        id,
        displayName,
        feathers: 180,
        ready: false,
        ownedUpgrades: new Set(),
        equippedUpgrades: [],
        ownedCosmetics: new Set(),
        equippedCosmeticId: null,
        loadoutLabel: 'Standard Issue'
      };
      this.players.set(id, player);
    }
    player.displayName = displayName;
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  refreshMutators(now = Date.now()): boolean {
    if (now - this.lastMutatorCheck < 60_000) {
      return false;
    }
    this.lastMutatorCheck = now;
    const expiryDaily = Date.parse(this.mutators.daily.expiresAt ?? '');
    const expiryWeekly = Date.parse(this.mutators.weekly.expiresAt ?? '');
    if (Number.isNaN(expiryDaily) || now >= expiryDaily || Number.isNaN(expiryWeekly) || now >= expiryWeekly) {
      this.mutators = generateActiveMutators(new Date(now));
      return true;
    }
    return false;
  }

  getMutators(): ActiveMutators {
    return this.mutators;
  }

  getPlayer(id: string): ArmoryPlayerMeta | null {
    return this.players.get(id) ?? null;
  }

  setReady(id: string, ready: boolean): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }
    player.ready = ready;
  }

  resetReady(): void {
    for (const player of this.players.values()) {
      player.ready = false;
    }
  }

  allReady(): boolean {
    let hasPlayers = false;
    for (const player of this.players.values()) {
      hasPlayers = true;
      if (!player.ready) {
        return false;
      }
    }
    return hasPlayers;
  }

  grantFeathers(id: string, amount: number): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }
    player.feathers = Math.max(0, Math.round(player.feathers + amount));
  }

  grantRunRewards(summary: RunSummary): void {
    const baseReward = 16 + summary.wave * 4;
    for (const stats of summary.playerStats) {
      const player = this.players.get(stats.id);
      if (!player) {
        continue;
      }
      const xpBonus = Math.round(stats.xpCollected / 60);
      const artifactBonus = stats.artifacts.length * 8;
      this.grantFeathers(player.id, baseReward + xpBonus + artifactBonus);
      player.ready = false;
    }
  }

  setSummary(summary: RunSummary | null, endsAt: number | null): void {
    this.summary = summary;
    this.summaryEndsAt = endsAt;
  }

  purchase(id: string, itemId: string): { success: boolean; error?: string } {
    const player = this.players.get(id);
    if (!player) {
      return { success: false, error: 'unknown-player' };
    }
    const allItems = [...ARMORY_UPGRADES, ...ARMORY_COSMETICS];
    const item = allItems.find((entry) => entry.id === itemId);
    if (!item) {
      return { success: false, error: 'unknown-item' };
    }
    if (item.kind === 'upgrade' && player.ownedUpgrades.has(item.id)) {
      return { success: false, error: 'already-owned' };
    }
    if (item.kind === 'cosmetic' && player.ownedCosmetics.has(item.id)) {
      return { success: false, error: 'already-owned' };
    }
    if (player.feathers < item.cost) {
      return { success: false, error: 'insufficient-funds' };
    }
    player.feathers -= item.cost;
    if (item.kind === 'upgrade') {
      player.ownedUpgrades.add(item.id);
      if (player.equippedUpgrades.length < MAX_EQUIPPED_UPGRADES) {
        player.equippedUpgrades.push(item.id);
      }
    } else {
      player.ownedCosmetics.add(item.id);
      if (!player.equippedCosmeticId) {
        player.equippedCosmeticId = item.id;
      }
    }
    player.ready = false;
    return { success: true };
  }

  equip(id: string, itemId: string, slot?: ArmoryItem['slot']): { success: boolean; error?: string } {
    const player = this.players.get(id);
    if (!player) {
      return { success: false, error: 'unknown-player' };
    }
    if (slot === 'cosmetic') {
      if (!player.ownedCosmetics.has(itemId)) {
        return { success: false, error: 'not-owned' };
      }
      player.equippedCosmeticId = itemId;
      player.ready = false;
      return { success: true };
    }
    if (!player.ownedUpgrades.has(itemId)) {
      return { success: false, error: 'not-owned' };
    }
    const existingIndex = player.equippedUpgrades.indexOf(itemId);
    if (existingIndex !== -1) {
      player.equippedUpgrades.splice(existingIndex, 1);
      player.ready = false;
      return { success: true };
    }
    if (player.equippedUpgrades.length >= MAX_EQUIPPED_UPGRADES) {
      player.equippedUpgrades.shift();
    }
    player.equippedUpgrades.push(itemId);
    player.ready = false;
    return { success: true };
  }

  applyLoadout(player: PlayerSimState, world: GameWorld): void {
    const meta = this.players.get(player.id);
    if (!meta) {
      return;
    }
    player.damageMultiplier = 1;
    player.cooldownMultiplier = 1;
    player.projectileSpeedMultiplier = 1;
    player.splitShots = 0;
    player.healthGrowthMultiplier = 1;
    player.maxHealth = 120;
    player.health = player.maxHealth;
    player.lootMagnetRadius = LOOT_MAGNET_BASE_RADIUS * 0.6;
    player.lootMagnetLevel = 0;

    for (const upgrade of meta.equippedUpgrades) {
      switch (upgrade) {
        case 'focus-matrix':
          player.damageMultiplier *= 1.12;
          break;
        case 'celerity-core':
          player.cooldownMultiplier *= 0.85;
          break;
        case 'bulwark-weave':
          player.maxHealth += 40;
          player.health = player.maxHealth;
          break;
        case 'rift-channeler':
          player.splitShots = Math.min(player.splitShots + 1, 3);
          player.projectileSpeedMultiplier *= 1.08;
          break;
        case 'magnet-surge':
          player.lootMagnetLevel += 2;
          break;
      }
    }

    if (this.mutators.daily.id === 'glass-cannon') {
      player.damageMultiplier *= 1.25;
      player.maxHealth = Math.round(player.maxHealth * 0.8);
      player.health = player.maxHealth;
    }
    if (this.mutators.daily.id === 'psionic-storm' || this.mutators.weekly.id === 'psionic-storm') {
      player.cooldownMultiplier *= 0.85;
    }
    world.recalcLootMagnet(player);
  }

  buildState(phase: GamePhase, runNumber: number): ArmoryState {
    const players: PlayerArmoryState[] = [];
    for (const player of this.players.values()) {
      players.push({
        playerId: player.id,
        displayName: player.displayName,
        feathers: player.feathers,
        ready: player.ready,
        equippedUpgrades: [...player.equippedUpgrades],
        ownedUpgrades: Array.from(player.ownedUpgrades),
        ownedCosmetics: Array.from(player.ownedCosmetics),
        equippedCosmeticId: player.equippedCosmeticId,
        loadoutLabel: player.loadoutLabel
      });
    }
    return {
      phase,
      mutators: this.mutators,
      upgrades: ARMORY_UPGRADES,
      cosmetics: ARMORY_COSMETICS,
      players,
      runNumber,
      updatedAt: Date.now(),
      summary: this.summary,
      summaryEndsAt: this.summaryEndsAt
    };
  }
}

class GameWorld {
  tick = 0;
  players = new Map<string, PlayerSimState>();
  enemies = new Map<string, EnemySimState>();
  projectiles = new Map<string, ProjectileSimState>();
  xpDrops = new Map<string, XpDropSimState>();
  artifactDrops = new Map<string, ArtifactDropSimState>();
  readonly level: LevelData;
  private spawnCursor = 0;
  private enemySpawnAccumulator = 0;
  private readonly walkableTiles: Array<{ x: number; y: number }>;
  private readonly events: WorldEvent[] = [];
  private readonly projectilePool: ProjectileSimState[] = [];
  private readonly enemyPool: EnemySimState[] = [];
  private minibossSpawnTimer = 0;
  private nextMinibossInterval = 55;
  private waveNumber = 1;
  private killsThisWave = 0;
  private killsPerWave = 24;
  private totalKills = 0;
  private extractionReady = false;
  private extractionCountdown: number | null = null;
  private extractionPosition: Vector2D | null = null;
  private telemetryLogTimer = 0;
  private readonly telemetry = {
    damageTaken: new Map<string, number>(),
    xpCollected: new Map<string, number>(),
    augmentPicks: new Map<AugmentId, number>(),
    artifactsPicked: new Map<ArtifactKind, number>()
  };
  private pendingRunSummary: RunSummary | null = null;
  private mutatorEnemySpawnMultiplier = 1;
  private mutatorHawkSpeedMultiplier = 1;

  constructor() {
    this.level = generateLevel(LEVEL_CONFIG);
    this.walkableTiles = collectWalkableTiles(this.level);
    this.spawnInitialEnemies();
    this.nextMinibossInterval = 55 + Math.random() * 35;
    console.log(`level seed: ${this.level.seed}`);
  }

  addPlayer(id: string, displayName: string): PlayerSimState {
    const spawn = this.pickSpawnPoint();
    const player: PlayerSimState = {
      id,
      displayName,
      position: spawn,
      velocity: { x: 0, y: 0 },
      facing: 0,
      psychicLevel: 1,
      input: createInitialInputState(),
      primaryCooldown: 0,
      experience: 0,
      experienceToNext: 100,
      health: 120,
      maxHealth: 120,
      hurtTimer: 0,
      invulnerableTimer: 0,
      damageMultiplier: 1,
      cooldownMultiplier: 1,
      projectileSpeedMultiplier: 1,
      splitShots: 0,
      healthGrowthMultiplier: 1,
      pendingAugments: [],
      augments: [],
      lastAugmentId: null,
      ready: false,
      lastPingTimestamp: 0,
      aimHeading: 0,
      lootMagnetLevel: 0,
      lootMagnetRadius: LOOT_MAGNET_BASE_RADIUS * 0.6,
      artifacts: [],
      artifactShieldTimer: 0,
      artifactShieldValue: 0,
      damageTaken: 0,
      xpCollected: 0
    };
    this.recalcLootMagnet(player);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (!this.areAllPlayersReady()) {
      this.extractionCountdown = null;
    }
  }

  update(): void {
    this.tick += 1;
    const deltaSeconds = TICK_INTERVAL_MS / 1000;
    for (const player of this.players.values()) {
      const velocity = computeVelocity(player.input);
      player.velocity = velocity;
      player.position.x += velocity.x * deltaSeconds;
      player.position.y += velocity.y * deltaSeconds;
      const aimHeading = Number.isFinite(player.input.aimHeading)
        ? player.input.aimHeading
        : player.input.aimDirection;
      if (Number.isFinite(aimHeading)) {
        player.aimHeading = aimHeading;
        player.facing = aimHeading;
      } else if (velocity.x !== 0 || velocity.y !== 0) {
        player.aimHeading = Math.atan2(velocity.y, velocity.x);
        player.facing = player.aimHeading;
      }
      player.primaryCooldown = Math.max(0, player.primaryCooldown - deltaSeconds);
      player.hurtTimer = Math.max(0, player.hurtTimer - deltaSeconds);
      player.invulnerableTimer = Math.max(0, player.invulnerableTimer - deltaSeconds);
      if (player.artifactShieldTimer > 0) {
        player.artifactShieldTimer = Math.max(0, player.artifactShieldTimer - deltaSeconds);
        if (player.artifactShieldTimer === 0) {
          player.artifactShieldValue = 0;
        }
      }
      if (player.input.primaryAbility && player.primaryCooldown <= 0) {
        this.firePrimary(player);
      }
    }

    this.updateEnemies(deltaSeconds);
    this.trySpawnMiniboss(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateXpDrops(deltaSeconds);
    this.updateArtifacts(deltaSeconds);
    this.updateObjectives(deltaSeconds);
    this.telemetryLogTimer += deltaSeconds;
    if (this.telemetryLogTimer >= 45) {
      this.telemetryLogTimer = 0;
      this.emitTelemetry();
    }
  }

  setMutators(mutators: ActiveMutators): void {
    const overgrowth = mutators.daily.id === 'overgrowth' || mutators.weekly.id === 'overgrowth';
    const aerial = mutators.daily.id === 'aerial-superiority' || mutators.weekly.id === 'aerial-superiority';
    this.mutatorEnemySpawnMultiplier = overgrowth ? 1.18 : 1;
    this.mutatorHawkSpeedMultiplier = aerial ? 1.2 : 1;
  }

  snapshot(mutators: ActiveMutators): WorldSnapshot {
    return {
      tick: this.tick,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        displayName: player.displayName,
        position: player.position,
        velocity: player.velocity,
        facing: player.facing,
        psychicLevel: player.psychicLevel,
        maxHealth: player.maxHealth,
        health: player.health,
        experience: player.experience,
        experienceToNext: player.experienceToNext,
        hurtTimer: player.hurtTimer,
        invulnerableTimer: player.invulnerableTimer,
        lastAugmentId: player.lastAugmentId,
        augments: player.augments.slice(),
        artifacts: player.artifacts.slice(),
        lootMagnetLevel: player.lootMagnetLevel,
        ready: player.ready
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => {
        const copy = { ...enemy };
        delete (copy as Partial<typeof copy>).wanderDirection;
        delete (copy as Partial<typeof copy>).switchTimer;
        delete (copy as Partial<typeof copy>).attackCooldown;
        return copy;
      }),
      projectiles: Array.from(this.projectiles.values()).map((projectile) => ({
        id: projectile.id,
        ownerId: projectile.ownerId,
        faction: projectile.faction,
        position: projectile.position,
        velocity: projectile.velocity,
        ttl: projectile.ttl,
        power: projectile.power
      })),
      xpDrops: Array.from(this.xpDrops.values()).map((drop) => ({
        id: drop.id,
        amount: drop.amount,
        position: drop.position,
        age: drop.age
      })),
      artifacts: Array.from(this.artifactDrops.values()).map((drop) => ({
        id: drop.id,
        kind: drop.kind,
        position: drop.position,
        age: drop.age
      })),
      objectives: this.buildObjectiveState(),
      mutators
    };
  }

  getObjectiveState(): ObjectiveState {
    return this.buildObjectiveState();
  }

  setPlayerReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    if (player.ready === ready) {
      return;
    }
    player.ready = ready;
    if (!this.extractionReady) {
      return;
    }
    const wasCountingDown = this.extractionCountdown !== null;
    if (this.areAllPlayersReady()) {
      if (this.extractionCountdown === null) {
        this.extractionCountdown = 35;
        this.emitExtractionEvent('countdown-start');
      }
    } else if (wasCountingDown) {
      this.extractionCountdown = null;
      this.emitExtractionEvent('countdown-abort');
    } else {
      this.extractionCountdown = null;
    }
  }

  quickPing(playerId: string, kind: QuickPingKind, rawPosition: Vector2D): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    const now = Date.now();
    if (now - player.lastPingTimestamp < 1200) {
      return;
    }
    player.lastPingTimestamp = now;
    const position = { x: rawPosition.x, y: rawPosition.y };
    clampToLevel(position, this.level);
    const message: QuickPingBroadcastMessage = {
      type: 'ping-event',
      playerId,
      kind,
      position,
      playerName: player.displayName
    };
    this.events.push({ type: 'broadcast', message });
  }

  private buildObjectiveState(): ObjectiveState {
    const bossCountdown = this.players.size === 0 || this.hasActiveMiniboss()
      ? null
      : Math.max(0, this.nextMinibossInterval - this.minibossSpawnTimer);
    const progress = this.killsPerWave > 0 ? Math.min(1, this.killsThisWave / this.killsPerWave) : 0;
    return {
      wave: this.waveNumber,
      waveProgress: progress,
      totalKills: this.totalKills,
      nextBossSeconds: bossCountdown,
      extractionReady: this.extractionReady,
      extractionCountdown: this.extractionReady ? this.extractionCountdown : null,
      extractionPosition: this.extractionReady && this.extractionPosition
        ? { x: this.extractionPosition.x, y: this.extractionPosition.y }
        : null
    };
  }

  private emitExtractionEvent(event: 'available' | 'countdown-start' | 'countdown-abort' | 'success'): void {
    this.events.push({
      type: 'broadcast',
      message: {
        type: 'extraction-event',
        event,
        position: this.extractionPosition
          ? { x: this.extractionPosition.x, y: this.extractionPosition.y }
          : null,
        countdown: this.extractionCountdown
      }
    });
  }

  private updateObjectives(deltaSeconds: number): void {
    if (this.players.size === 0) {
      this.extractionCountdown = null;
      return;
    }
    if (this.extractionReady && this.extractionPosition === null) {
      this.extractionPosition = this.pickExtractionPoint();
    }
    if (this.extractionCountdown !== null) {
      if (!this.areAllPlayersReady()) {
        this.extractionCountdown = null;
        this.emitExtractionEvent('countdown-abort');
      } else {
        const previous = this.extractionCountdown;
        this.extractionCountdown = Math.max(0, this.extractionCountdown - deltaSeconds);
        if (previous > 0 && this.extractionCountdown === 0) {
          this.emitExtractionEvent('success');
          this.extractionCountdown = null;
          this.extractionReady = false;
          this.queueRunSummary();
        }
      }
    }
  }

  private areAllPlayersReady(): boolean {
    if (this.players.size === 0) {
      return false;
    }
    for (const player of this.players.values()) {
      if (!player.ready) {
        return false;
      }
    }
    return true;
  }

  private pickExtractionPoint(): Vector2D {
    if (this.level.spawnPoints.length > 0) {
      const index = Math.floor(Math.random() * this.level.spawnPoints.length);
      const spawn = this.level.spawnPoints[index];
      return tileToWorld(spawn.x, spawn.y, this.level);
    }
    const tile = randomWalkableTile(this.walkableTiles);
    return tileToWorld(tile.x + 0.5, tile.y + 0.5, this.level);
  }

  private queueRunSummary(): void {
    if (this.pendingRunSummary) {
      return;
    }
    this.pendingRunSummary = this.buildRunSummary();
  }

  private buildRunSummary(): RunSummary {
    const playerStats: RunSummaryPlayer[] = [];
    for (const player of this.players.values()) {
      playerStats.push({
        id: player.id,
        displayName: player.displayName,
        psychicLevel: player.psychicLevel,
        augments: player.augments.slice(),
        artifacts: player.artifacts.slice(),
        damageTaken: player.damageTaken,
        xpCollected: player.xpCollected
      });
    }
    return {
      durationTicks: this.tick,
      wave: this.waveNumber,
      totalKills: this.totalKills,
      playerStats
    };
  }

  consumeRunSummary(): RunSummary | null {
    const summary = this.pendingRunSummary;
    if (!summary) {
      return null;
    }
    this.pendingRunSummary = null;
    return summary;
  }

  resetForArmory(applyLoadout: (player: PlayerSimState) => void): void {
    this.tick = 0;
    this.spawnCursor = 0;
    this.enemySpawnAccumulator = 0;
    this.minibossSpawnTimer = 0;
    this.nextMinibossInterval = 55 + Math.random() * 35;
    this.waveNumber = 1;
    this.killsThisWave = 0;
    this.killsPerWave = 24;
    this.totalKills = 0;
    this.extractionReady = false;
    this.extractionCountdown = null;
    this.extractionPosition = null;
    this.pendingRunSummary = null;
    this.projectiles.clear();
    this.enemies.clear();
    this.xpDrops.clear();
    this.artifactDrops.clear();
    this.events.length = 0;
    for (const player of this.players.values()) {
      const spawn = this.pickSpawnPoint();
      player.position = { x: spawn.x, y: spawn.y };
      player.velocity = { x: 0, y: 0 };
      player.input = createInitialInputState();
      player.facing = 0;
      player.aimHeading = 0;
      player.psychicLevel = 1;
      player.experience = 0;
      player.experienceToNext = 100;
      player.health = 120;
      player.maxHealth = 120;
      player.hurtTimer = 0;
      player.invulnerableTimer = 0;
      player.damageMultiplier = 1;
      player.cooldownMultiplier = 1;
      player.projectileSpeedMultiplier = 1;
      player.splitShots = 0;
      player.healthGrowthMultiplier = 1;
      player.pendingAugments = [];
      player.augments = [];
      player.lastAugmentId = null;
      player.ready = false;
      player.artifacts = [];
      player.artifactShieldTimer = 0;
      player.artifactShieldValue = 0;
      player.damageTaken = 0;
      player.xpCollected = 0;
      applyLoadout(player);
    }
    this.spawnInitialEnemies();
  }

  drainEvents(): WorldEvent[] {
    if (this.events.length === 0) {
      return [];
    }
    const copy = this.events.slice();
    this.events.length = 0;
    return copy;
  }

  private pickSpawnPoint(): { x: number; y: number } {
    const points = this.level.spawnPoints;
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    const point = points[this.spawnCursor % points.length];
    this.spawnCursor += 1;
    return tileToWorld(point.x, point.y, this.level);
  }

  private spawnInitialEnemies(): void {
    const kinds: EnemyKind[] = ['fox', 'snake', 'hawk', 'raccoon', 'weasel', 'owl'];
    const initialCount = 14;
    for (let i = 0; i < initialCount; i += 1) {
      const kind = kinds[i % kinds.length];
      this.spawnEnemy(kind);
    }
  }

  private updateEnemies(deltaSeconds: number): void {
    this.enemySpawnAccumulator += deltaSeconds;
    const playerCount = Math.max(1, this.players.size);
    const targetEnemies = Math.min(40, Math.round(playerCount * 6 * this.mutatorEnemySpawnMultiplier));
    if (this.enemySpawnAccumulator >= 6 && this.enemies.size < targetEnemies) {
      this.enemySpawnAccumulator = 0;
      const rollSeed = Math.random();
      let roll: EnemyKind;
      if (rollSeed < 0.28) {
        roll = 'fox';
      } else if (rollSeed < 0.48) {
        roll = 'snake';
      } else if (rollSeed < 0.68) {
        roll = 'hawk';
      } else if (rollSeed < 0.82) {
        roll = 'weasel';
      } else if (rollSeed < 0.92) {
        roll = 'raccoon';
      } else {
        roll = 'owl';
      }
      this.spawnEnemy(roll);
    }

    const players = Array.from(this.players.values());

    for (const enemy of this.enemies.values()) {
      enemy.switchTimer -= deltaSeconds;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaSeconds);

      if (enemy.intent !== 'idle') {
        enemy.intentTimer = Math.max(0, enemy.intentTimer - deltaSeconds);
      }

      const target = this.pickEnemyTarget(enemy, players);
      const isSupport = enemy.kind === 'owl';
      const isRanged = enemy.kind === 'raccoon' || isSupport;
      const isBurrower = enemy.kind === 'weasel';
      const isDiver = enemy.kind === 'hawk';
      const isBoss = enemy.isBoss;

      if (isBurrower && enemy.burrowed) {
        enemy.intent = 'burrow';
        enemy.velocity.x = 0;
        enemy.velocity.y = 0;
        enemy.burrowTimer -= deltaSeconds;
        if (enemy.burrowTimer <= 0) {
          enemy.burrowed = false;
          enemy.intent = 'idle';
          if (target) {
            const dx = target.position.x - enemy.position.x;
            const dy = target.position.y - enemy.position.y;
            const angle = Math.atan2(dy, dx);
            const emergeDistance = Math.min(enemy.attackRange * 0.85, 68);
            enemy.position.x = target.position.x - Math.cos(angle) * emergeDistance;
            enemy.position.y = target.position.y - Math.sin(angle) * emergeDistance;
          }
          enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.2);
          enemy.switchTimer = 0.25;
        } else {
          clampToLevel(enemy.position, this.level);
          continue;
        }
      }

      if (isSupport && enemy.intent === 'idle') {
        enemy.supportTimer -= deltaSeconds;
        if (enemy.supportTimer <= 0) {
          enemy.intent = 'channel';
          enemy.intentDuration = 1.6;
          enemy.intentTimer = enemy.intentDuration;
          enemy.channelTimer = enemy.intentDuration;
          enemy.wanderDirection = { x: 0, y: 0 };
        }
      }

      if (enemy.intent === 'windup') {
        enemy.velocity.x = 0;
        enemy.velocity.y = 0;
        if (enemy.intentTimer <= 0) {
          this.resolveEnemyAttack(enemy, players, target ?? null);
          enemy.intent = 'recover';
          enemy.intentDuration = getEnemyAttackRecovery(enemy.kind);
          enemy.intentTimer = enemy.intentDuration;
        }
      } else if (enemy.intent === 'recover') {
        if (enemy.intentTimer <= 0) {
          enemy.intent = 'idle';
          enemy.intentTimer = 0;
          enemy.intentDuration = 0;
          enemy.targetPlayerId = null;
        }
      } else if (enemy.intent === 'channel') {
        enemy.velocity.x = 0;
        enemy.velocity.y = 0;
        if (enemy.intentTimer <= 0) {
          this.applyOwlSupport(enemy, players);
          enemy.intent = 'recover';
          enemy.intentDuration = 1.05;
          enemy.intentTimer = enemy.intentDuration;
          enemy.supportTimer = 6 + Math.random() * 3.5;
        }
      } else {
        if (enemy.switchTimer <= 0) {
          if (isRanged && target) {
            const dx = target.position.x - enemy.position.x;
            const dy = target.position.y - enemy.position.y;
            const length = Math.hypot(dx, dy) || 1;
            const strafe = { x: -dy / length, y: dx / length };
            const dir = Math.random() < 0.5 ? strafe : { x: -strafe.x, y: -strafe.y };
            enemy.wanderDirection = dir;
            enemy.switchTimer = 0.75 + Math.random() * 0.45;
          } else if (isDiver && target) {
            const dx = target.position.x - enemy.position.x;
            const dy = target.position.y - enemy.position.y;
            const length = Math.hypot(dx, dy) || 1;
            enemy.wanderDirection = { x: dx / length, y: dy / length };
            enemy.switchTimer = 0.55 + Math.random() * 0.4;
          } else {
            const base = (isBoss ? 1.1 : 1.5) + Math.random() * (isBoss ? 1.2 : 2);
            enemy.switchTimer = base;
            enemy.wanderDirection = this.selectEnemyDirection(enemy, players);
          }
        }

        if (target) {
          const dx = target.position.x - enemy.position.x;
          const dy = target.position.y - enemy.position.y;
          const distance = Math.hypot(dx, dy);
          if (enemy.kind !== 'owl' && enemy.attackCooldown <= 0 && distance <= enemy.attackRange) {
            this.beginEnemyWindup(enemy, target);
          } else if (isRanged) {
            const length = distance || 1;
            const desiredMin = enemy.attackRange * 0.55;
            const desiredMax = enemy.attackRange * 0.95;
            if (distance < desiredMin) {
              enemy.wanderDirection = { x: -dx / length, y: -dy / length };
            } else if (distance > desiredMax) {
              enemy.wanderDirection = { x: dx / length, y: dy / length };
            }
          } else if (distance < enemy.attackRange * 1.4) {
            const length = distance || 1;
            enemy.wanderDirection = { x: dx / length, y: dy / length };
          }
        }
      }

      let speed = getEnemySpeed(enemy.kind);
      if (enemy.kind === 'hawk') {
        speed *= this.mutatorHawkSpeedMultiplier;
      }
      let speedScale = 1;
      if (enemy.intent === 'windup' || enemy.intent === 'channel') {
        speedScale = 0;
      } else if (enemy.intent === 'recover') {
        speedScale = isBoss ? 0.55 : 0.4;
      } else if (isRanged && target) {
        speedScale = 0.85;
      }

      enemy.velocity = {
        x: enemy.wanderDirection.x * speed * speedScale,
        y: enemy.wanderDirection.y * speed * speedScale
      };

      enemy.position.x += enemy.velocity.x * deltaSeconds;
      enemy.position.y += enemy.velocity.y * deltaSeconds;

      clampToLevel(enemy.position, this.level);
    }
  }

  private trySpawnMiniboss(deltaSeconds: number): void {
    if (this.players.size === 0) {
      this.minibossSpawnTimer = 0;
      return;
    }

    if (this.hasActiveMiniboss()) {
      this.minibossSpawnTimer = 0;
      return;
    }

    this.minibossSpawnTimer += deltaSeconds;
    if (this.minibossSpawnTimer < this.nextMinibossInterval) {
      return;
    }

    this.minibossSpawnTimer = 0;
    this.nextMinibossInterval = 55 + Math.random() * 35;
    const boss = this.spawnEnemy('coyote');
    if (boss) {
      this.events.push({
        type: 'broadcast',
        message: {
          type: 'boss-spawned',
          bossId: boss.id,
          kind: boss.kind
        }
      });
      console.log('miniboss spawned', boss.id);
    }
  }

  private hasActiveMiniboss(): boolean {
    for (const enemy of this.enemies.values()) {
      if (enemy.isBoss) {
        return true;
      }
    }
    return false;
  }

  private selectEnemyDirection(enemy: EnemySimState, players: Iterable<PlayerSimState>): Vector2D {
    let target: PlayerSimState | null = null;
    let shortest = Number.POSITIVE_INFINITY;
    for (const player of players) {
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < shortest) {
        shortest = distSq;
        target = player;
      }
    }

    if (target && Math.random() < 0.6) {
      const dx = target.position.x - enemy.position.x;
      const dy = target.position.y - enemy.position.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    }

    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  private pickEnemyTarget(enemy: EnemySimState, players: PlayerSimState[]): PlayerSimState | null {
    let target: PlayerSimState | null = null;
    let closest = Number.POSITIVE_INFINITY;
    for (const player of players) {
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < closest) {
        closest = distanceSq;
        target = player;
      }
    }
    return target;
  }

  private beginEnemyWindup(enemy: EnemySimState, target: PlayerSimState): void {
    const windup = getEnemyAttackWindup(enemy.kind);
    enemy.intent = 'windup';
    enemy.intentDuration = windup;
    enemy.intentTimer = windup;
    enemy.targetPlayerId = target.id;
    const dx = target.position.x - enemy.position.x;
    const dy = target.position.y - enemy.position.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.wanderDirection = { x: dx / length, y: dy / length };
    enemy.attackCooldown = getEnemyAttackCooldown(enemy.kind);
    enemy.switchTimer = 0.5;
  }

  private resolveEnemyAttack(enemy: EnemySimState, players: PlayerSimState[], target: PlayerSimState | null): void {
    if (enemy.kind === 'raccoon') {
      const focus = target ?? (enemy.targetPlayerId ? this.players.get(enemy.targetPlayerId) ?? null : null);
      if (focus) {
        this.spawnEnemyProjectile(enemy, focus.position, 'enemy');
      }
      return;
    }
    if (enemy.kind === 'owl') {
      this.applyOwlSupport(enemy, players);
      return;
    }

    if (enemy.kind === 'hawk') {
      const focus = target ?? (enemy.targetPlayerId ? this.players.get(enemy.targetPlayerId) ?? null : null);
      if (focus) {
        const dx = focus.position.x - enemy.position.x;
        const dy = focus.position.y - enemy.position.y;
        const distance = Math.hypot(dx, dy) || 1;
        const diveDistance = Math.min(distance, enemy.attackRange * 1.05);
        enemy.position.x += (dx / distance) * diveDistance;
        enemy.position.y += (dy / distance) * diveDistance;
        this.damagePlayer(focus, Math.round(getEnemyAttackDamage('hawk') * 1.25), enemy.position, 96);
      }
      return;
    }

    const range = enemy.attackRange;
    const damage = getEnemyAttackDamage(enemy.kind);
    for (const player of players) {
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      if (dx * dx + dy * dy <= range * range) {
        const knockback = enemy.isBoss ? 110 : 42;
        const amount = enemy.isBoss ? Math.round(damage * 1.1) : damage;
        this.damagePlayer(player, amount, enemy.position, knockback);
      }
    }

    if (enemy.kind === 'weasel') {
      enemy.burrowed = true;
      enemy.burrowTimer = 2 + Math.random() * 1.8;
      enemy.intent = 'burrow';
    }

    if (enemy.isBoss) {
      this.spawnBossShockwave(enemy);
    }
  }

  private applyOwlSupport(enemy: EnemySimState, players: PlayerSimState[]): void {
    const radiusSq = enemy.attackRange * enemy.attackRange;
    let boosted = 0;
    for (const ally of this.enemies.values()) {
      if (ally.id === enemy.id || ally.burrowed) {
        continue;
      }
      const dx = ally.position.x - enemy.position.x;
      const dy = ally.position.y - enemy.position.y;
      if (dx * dx + dy * dy <= radiusSq) {
        ally.attackCooldown = Math.max(0, ally.attackCooldown - 0.9);
        if (ally.health < ally.maxHealth) {
          ally.health = Math.min(ally.maxHealth, ally.health + 10);
        }
        boosted += 1;
      }
    }

    if (boosted > 0) {
      const focus = this.pickEnemyTarget(enemy, players);
      if (focus) {
        this.damagePlayer(focus, 6 + boosted * 2, enemy.position, 18);
      }
    }
  }

  private damagePlayer(player: PlayerSimState, amount: number, origin: Vector2D, knockbackOverride?: number): void {
    if (player.invulnerableTimer > 0) {
      return;
    }
    let remaining = amount;
    if (player.artifactShieldTimer > 0 && player.artifactShieldValue > 0) {
      const absorbed = Math.min(player.artifactShieldValue, remaining);
      player.artifactShieldValue -= absorbed;
      remaining -= absorbed;
    }
    if (remaining <= 0) {
      player.hurtTimer = Math.max(player.hurtTimer, PLAYER_HURT_FLASH_TIME * 0.4);
      return;
    }
    player.health = Math.max(0, player.health - remaining);
    player.hurtTimer = Math.max(player.hurtTimer, PLAYER_HURT_FLASH_TIME);
    player.invulnerableTimer = Math.max(player.invulnerableTimer, PLAYER_INVULNERABILITY_TIME);
    player.damageTaken += remaining;
    this.bumpTelemetry(player.id, 'damageTaken', remaining);

    const dx = player.position.x - origin.x;
    const dy = player.position.y - origin.y;
    const distance = Math.hypot(dx, dy) || 1;
    const knockback = knockbackOverride ?? 42;
    player.position.x += (dx / distance) * knockback;
    player.position.y += (dy / distance) * knockback;
    clampToLevel(player.position, this.level);

    if (player.health <= 0) {
      this.respawnPlayer(player);
    }
  }

  private respawnPlayer(player: PlayerSimState): void {
    const spawn = this.pickSpawnPoint();
    player.position.x = spawn.x;
    player.position.y = spawn.y;
    player.velocity = { x: 0, y: 0 };
    player.health = player.maxHealth;
    player.hurtTimer = 0;
    player.invulnerableTimer = Math.max(player.invulnerableTimer, PLAYER_INVULNERABILITY_TIME * 2.5);
  }

  private spawnEnemy(kind: EnemyKind): EnemySimState | null {
    const tile = randomWalkableTile(this.walkableTiles);
    const worldPosition = tileToWorld(tile.x + 0.5, tile.y + 0.5, this.level);
    const enemy = this.acquireEnemy();
    enemy.id = randomUUID();
    enemy.kind = kind;
    enemy.isBoss = kind === 'coyote';
    enemy.position.x = worldPosition.x;
    enemy.position.y = worldPosition.y;
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
    enemy.health = getEnemyMaxHealth(kind);
    enemy.maxHealth = enemy.health;
    enemy.wanderDirection.x = 0;
    enemy.wanderDirection.y = 0;
    enemy.switchTimer = 0;
    enemy.attackCooldown = Math.random() * (enemy.isBoss ? 1.5 : 0.5);
    enemy.intent = 'idle';
    enemy.intentTimer = 0;
    enemy.intentDuration = 0;
    enemy.attackRange = getEnemyAttackRange(kind);
    enemy.targetPlayerId = null;
    enemy.burrowed = false;
    enemy.burrowTimer = 0;
    enemy.supportTimer = 2 + Math.random() * 3;
    enemy.channelTimer = 0;
    if (kind === 'weasel') {
      enemy.burrowed = true;
      enemy.burrowTimer = 1.8 + Math.random() * 1.6;
      enemy.intent = 'burrow';
    }
    if (kind === 'owl') {
      enemy.supportTimer = 3 + Math.random() * 3;
    }
    this.enemies.set(enemy.id, enemy);
    return enemy;
  }

  private acquireEnemy(): EnemySimState {
    const pooled = this.enemyPool.pop();
    if (pooled) {
      return pooled;
    }
    return {
      id: '',
      kind: 'fox',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      health: 0,
      maxHealth: 0,
      intent: 'idle',
      intentTimer: 0,
      intentDuration: 0,
      attackRange: 0,
      targetPlayerId: null,
      wanderDirection: { x: 0, y: 0 },
      switchTimer: 0,
      attackCooldown: 0,
      isBoss: false,
      burrowTimer: 0,
      burrowed: false,
      supportTimer: 0,
      channelTimer: 0
    };
  }

  private recycleEnemy(enemy: EnemySimState): void {
    enemy.id = '';
    enemy.targetPlayerId = null;
    enemy.isBoss = false;
    this.enemyPool.push(enemy);
  }

  private firePrimary(player: PlayerSimState): void {
    const angle = Number.isFinite(player.aimHeading) ? player.aimHeading : player.input.aimDirection;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const originX = player.position.x + dirX * (PROJECTILE_RADIUS * 0.7);
    const originY = player.position.y + dirY * (PROJECTILE_RADIUS * 0.7);
    const projectile = this.acquireProjectile();
    projectile.id = randomUUID();
    projectile.ownerId = player.id;
    projectile.faction = 'player';
    const speed = PROJECTILE_SPEED * player.projectileSpeedMultiplier;
    projectile.velocity.x = dirX * speed;
    projectile.velocity.y = dirY * speed;
    projectile.position.x = originX;
    projectile.position.y = originY;
    projectile.ttl = PROJECTILE_LIFETIME;
    projectile.damage = Math.round(BASE_PLAYER_DAMAGE * player.damageMultiplier);
    projectile.power = projectile.damage;
    projectile.maxSplits = player.splitShots;
    projectile.splitDepth = 0;
    projectile.radius = PROJECTILE_RADIUS;
    this.projectiles.set(projectile.id, projectile);
    player.primaryCooldown = PROJECTILE_COOLDOWN * player.cooldownMultiplier;
  }

  private acquireProjectile(): ProjectileSimState {
    const pooled = this.projectilePool.pop();
    if (pooled) {
      return pooled;
    }
    return {
      id: '',
      ownerId: '',
      faction: 'player',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      ttl: 0,
      power: 0,
      damage: 0,
      maxSplits: 0,
      splitDepth: 0,
      radius: PROJECTILE_RADIUS
    };
  }

  private recycleProjectile(projectile: ProjectileSimState): void {
    projectile.id = '';
    projectile.ownerId = '';
    projectile.faction = 'player';
    this.projectilePool.push(projectile);
  }

  private updateProjectiles(deltaSeconds: number): void {
    const expired: string[] = [];
    const enemyIdsToRemove: string[] = [];

    for (const projectile of this.projectiles.values()) {
      projectile.ttl -= deltaSeconds;
      projectile.position.x += projectile.velocity.x * deltaSeconds;
      projectile.position.y += projectile.velocity.y * deltaSeconds;

      if (projectile.ttl <= 0 || !isWithinLevel(projectile.position, this.level)) {
        expired.push(projectile.id);
        continue;
      }

      const radiusSq = projectile.radius * projectile.radius;

      if (projectile.faction === 'player') {
        for (const enemy of this.enemies.values()) {
          if (enemy.burrowed) {
            continue;
          }
          const dx = enemy.position.x - projectile.position.x;
          const dy = enemy.position.y - projectile.position.y;
          if (dx * dx + dy * dy <= radiusSq) {
            enemy.health -= projectile.damage;
            if (projectile.maxSplits > projectile.splitDepth) {
              this.spawnSplitProjectiles(projectile, enemy.position);
            }
            expired.push(projectile.id);
            if (enemy.health <= 0) {
              enemyIdsToRemove.push(enemy.id);
            }
            break;
          }
        }
      } else {
        for (const player of this.players.values()) {
          if (player.invulnerableTimer > 0) {
            continue;
          }
          const dx = player.position.x - projectile.position.x;
          const dy = player.position.y - projectile.position.y;
          if (dx * dx + dy * dy <= radiusSq) {
            const knockback = projectile.faction === 'boss' ? 96 : 48;
            this.damagePlayer(player, projectile.damage, projectile.position, knockback);
            expired.push(projectile.id);
            break;
          }
        }
      }
    }

    for (const id of expired) {
      const projectile = this.projectiles.get(id);
      if (!projectile) {
        continue;
      }
      this.projectiles.delete(id);
      this.recycleProjectile(projectile);
    }

    for (const enemyId of enemyIdsToRemove) {
      const enemy = this.enemies.get(enemyId);
      if (!enemy) {
        continue;
      }
      this.handleEnemyDeath(enemy);
    }
  }

  private spawnSplitProjectiles(source: ProjectileSimState, impactPosition: Vector2D): void {
    const speed = Math.hypot(source.velocity.x, source.velocity.y) || PROJECTILE_SPEED;
    const baseAngle = Math.atan2(source.velocity.y, source.velocity.x);
    const offsets = [-0.4, 0.4];
    for (const offset of offsets) {
      const projectile = this.acquireProjectile();
      const angle = baseAngle + offset;
      projectile.id = randomUUID();
      projectile.ownerId = source.ownerId;
      projectile.faction = source.faction;
      projectile.velocity.x = Math.cos(angle) * speed * 0.9;
      projectile.velocity.y = Math.sin(angle) * speed * 0.9;
      projectile.position.x = impactPosition.x + Math.cos(angle) * PROJECTILE_RADIUS * 0.6;
      projectile.position.y = impactPosition.y + Math.sin(angle) * PROJECTILE_RADIUS * 0.6;
      projectile.ttl = Math.min(PROJECTILE_LIFETIME * 0.7, source.ttl + 0.2);
      projectile.damage = Math.max(8, Math.round(source.damage * 0.7));
      projectile.power = projectile.damage;
      projectile.maxSplits = source.maxSplits;
      projectile.splitDepth = source.splitDepth + 1;
      projectile.radius = Math.max(12, source.radius * 0.85);
      this.projectiles.set(projectile.id, projectile);
    }
  }

  private spawnEnemyProjectile(enemy: EnemySimState, target: Vector2D, faction: ProjectileFaction = enemy.isBoss ? 'boss' : 'enemy'): void {
    const projectile = this.acquireProjectile();
    projectile.id = randomUUID();
    projectile.ownerId = enemy.id;
    projectile.faction = faction;
    const dx = target.x - enemy.position.x;
    const dy = target.y - enemy.position.y;
    const angle = Math.atan2(dy, dx);
    const speed = faction === 'boss' ? 240 : 320;
    projectile.velocity.x = Math.cos(angle) * speed;
    projectile.velocity.y = Math.sin(angle) * speed;
    projectile.position.x = enemy.position.x + Math.cos(angle) * 18;
    projectile.position.y = enemy.position.y + Math.sin(angle) * 18;
    projectile.ttl = faction === 'boss' ? 1.1 : 1.6;
    const baseDamage = getEnemyAttackDamage(enemy.kind);
    projectile.damage = faction === 'boss' ? Math.round(baseDamage * 0.65) : baseDamage;
    projectile.power = projectile.damage;
    projectile.maxSplits = 0;
    projectile.splitDepth = 0;
    projectile.radius = faction === 'boss' ? PROJECTILE_RADIUS * 1.15 : PROJECTILE_RADIUS * 0.75;
    this.projectiles.set(projectile.id, projectile);
  }

  private spawnBossShockwave(enemy: EnemySimState): void {
    const bolts = 6;
    for (let i = 0; i < bolts; i += 1) {
      const angle = (Math.PI * 2 * i) / bolts;
      const target = {
        x: enemy.position.x + Math.cos(angle) * 32,
        y: enemy.position.y + Math.sin(angle) * 32
      };
      this.spawnEnemyProjectile(enemy, target, 'boss');
    }
  }

  private updateXpDrops(deltaSeconds: number): void {
    const collected: string[] = [];
    for (const drop of this.xpDrops.values()) {
      drop.age += deltaSeconds;
      let collectedBy: PlayerSimState | null = null;
      let magnetTarget: PlayerSimState | null = null;
      let magnetDistanceSq = Number.POSITIVE_INFINITY;

      for (const player of this.players.values()) {
        const dx = player.position.x - drop.position.x;
        const dy = player.position.y - drop.position.y;
        const distanceSq = dx * dx + dy * dy;
        const collectRadius = TILE_SIZE * (player.lootMagnetLevel > 0 ? 0.75 : 0.6);
        if (distanceSq <= collectRadius * collectRadius) {
          collectedBy = player;
          break;
        }
        if (player.lootMagnetRadius > 0) {
          const magnetRadiusSq = player.lootMagnetRadius * player.lootMagnetRadius;
          if (distanceSq <= magnetRadiusSq && distanceSq < magnetDistanceSq) {
            magnetDistanceSq = distanceSq;
            magnetTarget = player;
          }
        }
      }

      if (collectedBy) {
        this.grantExperience(collectedBy, drop.amount);
        collected.push(drop.id);
        continue;
      }

      if (magnetTarget && magnetDistanceSq < Number.POSITIVE_INFINITY) {
        const distance = Math.sqrt(magnetDistanceSq) || 1;
        const pull = LOOT_MAGNET_PULL_SPEED * (0.85 + magnetTarget.lootMagnetLevel * 0.2);
        const step = Math.min(distance, pull * deltaSeconds);
        const dirX = (magnetTarget.position.x - drop.position.x) / distance;
        const dirY = (magnetTarget.position.y - drop.position.y) / distance;
        drop.position.x += dirX * step;
        drop.position.y += dirY * step;
      }
    }

    for (const id of collected) {
      this.xpDrops.delete(id);
    }

    for (const [id, drop] of this.xpDrops.entries()) {
      if (drop.age > 20) {
        this.xpDrops.delete(id);
      }
    }
  }

  private updateArtifacts(deltaSeconds: number): void {
    const collected: string[] = [];
    for (const drop of this.artifactDrops.values()) {
      drop.age += deltaSeconds;
      for (const player of this.players.values()) {
        const dx = player.position.x - drop.position.x;
        const dy = player.position.y - drop.position.y;
        if (dx * dx + dy * dy <= (TILE_SIZE * 0.8) ** 2) {
          this.grantArtifact(player, drop.kind);
          collected.push(drop.id);
          break;
        }
      }
    }

    for (const id of collected) {
      this.artifactDrops.delete(id);
    }

    for (const [id, drop] of this.artifactDrops.entries()) {
      if (drop.age > ARTIFACT_TTL) {
        this.artifactDrops.delete(id);
      }
    }
  }

  private spawnArtifactDrop(center: Vector2D, angle: number, distance: number, kind: ArtifactKind): void {
    const id = randomUUID();
    const position = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance
    };
    this.artifactDrops.set(id, {
      id,
      kind,
      position,
      age: 0
    });
  }

  private grantArtifact(player: PlayerSimState, kind: ArtifactKind): void {
    const existing = player.artifacts.filter((entry) => entry === kind).length;
    player.artifacts.push(kind);
    switch (kind) {
      case 'damage-core': {
        player.damageMultiplier *= 1.12;
        break;
      }
      case 'haste-spur': {
        player.cooldownMultiplier *= 0.9;
        player.projectileSpeedMultiplier *= 1.1;
        player.primaryCooldown = Math.min(
          player.primaryCooldown,
          PROJECTILE_COOLDOWN * player.cooldownMultiplier
        );
        break;
      }
      case 'ward-feather': {
        player.maxHealth = Math.round(player.maxHealth * 1.08);
        player.health = Math.min(player.maxHealth, player.health + Math.round(player.maxHealth * 0.25));
        player.artifactShieldValue += 40 + existing * 20;
        player.artifactShieldTimer = Math.max(player.artifactShieldTimer, 12);
        break;
      }
      default:
        assertNever(kind);
    }
    this.noteArtifactPickup(kind);
  }

  recalcLootMagnet(player: PlayerSimState): void {
    const passiveRadius = LOOT_MAGNET_BASE_RADIUS * 0.6;
    if (player.lootMagnetLevel <= 0) {
      player.lootMagnetRadius = passiveRadius;
      return;
    }
    const base = LOOT_MAGNET_BASE_RADIUS;
    const bonus = LOOT_MAGNET_RADIUS_STEP * Math.max(0, player.lootMagnetLevel - 1);
    player.lootMagnetRadius = Math.min(LOOT_MAGNET_MAX_RADIUS, base + bonus);
  }

  private bumpTelemetry(playerId: string, field: 'damageTaken' | 'xpCollected', amount: number): void {
    const bucket = this.telemetry[field];
    bucket.set(playerId, (bucket.get(playerId) ?? 0) + amount);
  }

  private noteAugmentPick(id: AugmentId): void {
    this.telemetry.augmentPicks.set(id, (this.telemetry.augmentPicks.get(id) ?? 0) + 1);
  }

  private noteArtifactPickup(kind: ArtifactKind): void {
    this.telemetry.artifactsPicked.set(kind, (this.telemetry.artifactsPicked.get(kind) ?? 0) + 1);
  }

  private emitTelemetry(): void {
    if (
      this.telemetry.damageTaken.size === 0 &&
      this.telemetry.xpCollected.size === 0 &&
      this.telemetry.augmentPicks.size === 0 &&
      this.telemetry.artifactsPicked.size === 0
    ) {
      return;
    }
    const snapshot = {
      wave: this.waveNumber,
      damageTaken: Array.from(this.telemetry.damageTaken.entries()),
      xpCollected: Array.from(this.telemetry.xpCollected.entries()),
      augmentPicks: Array.from(this.telemetry.augmentPicks.entries()),
      artifactPicks: Array.from(this.telemetry.artifactsPicked.entries())
    };
    console.log('[telemetry]', JSON.stringify(snapshot));
    this.telemetry.damageTaken.clear();
    this.telemetry.xpCollected.clear();
    this.telemetry.augmentPicks.clear();
    this.telemetry.artifactsPicked.clear();
  }

  private recordEnemyKill(enemy: EnemySimState): void {
    this.totalKills += 1;
    if (enemy.isBoss) {
      this.killsThisWave += Math.ceil(this.killsPerWave * 0.4);
    } else {
      this.killsThisWave += 1;
    }
    this.killsThisWave = Math.min(this.killsThisWave, this.killsPerWave);
    if (this.killsThisWave >= this.killsPerWave) {
      this.waveNumber += 1;
      this.killsThisWave = 0;
      this.killsPerWave = Math.round(this.killsPerWave * 1.18 + 6);
      if (!this.extractionReady && this.waveNumber >= 3) {
        this.extractionReady = true;
        if (this.extractionPosition === null) {
          this.extractionPosition = this.pickExtractionPoint();
        }
        this.emitExtractionEvent('available');
      }
    }
  }

  private handleEnemyDeath(enemy: EnemySimState): void {
    this.recordEnemyKill(enemy);
    this.enemies.delete(enemy.id);
    const baseAmount = ENEMY_XP_VALUES[enemy.kind] ?? 10;
    if (enemy.isBoss) {
      const slices = 6;
      for (let i = 0; i < slices; i += 1) {
        const angle = (Math.PI * 2 * i) / slices;
        const offset = 28;
        const dropPosition = {
          x: enemy.position.x + Math.cos(angle) * offset,
          y: enemy.position.y + Math.sin(angle) * offset
        };
        this.spawnXpDrop(dropPosition, Math.round(baseAmount / slices));
      }
      const artifactKinds: ArtifactKind[] = ['damage-core', 'haste-spur', 'ward-feather'];
      for (let i = 0; i < artifactKinds.length; i += 1) {
        const angle = (Math.PI * 2 * i) / artifactKinds.length + Math.random() * 0.4;
        const distance = 38 + Math.random() * 18;
        this.spawnArtifactDrop(enemy.position, angle, distance, artifactKinds[i]);
      }
    } else {
      this.spawnXpDrop(enemy.position, baseAmount);
    }
    this.recycleEnemy(enemy);
  }

  private spawnXpDrop(position: Vector2D, amount: number): void {
    const id = randomUUID();
    const drop: XpDropSimState = {
      id,
      amount,
      position: { x: position.x, y: position.y },
      age: 0
    };
    this.xpDrops.set(id, drop);
  }

  chooseAugment(playerId: string, offerId: string, augmentId: AugmentId): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }
    const offerIndex = player.pendingAugments.findIndex((offer) => offer.id === offerId);
    if (offerIndex === -1) {
      return false;
    }
    const offer = player.pendingAugments[offerIndex];
    if (!offer.options.includes(augmentId)) {
      return false;
    }
    player.pendingAugments.splice(offerIndex, 1);
    this.applyAugment(player, augmentId);
    return true;
  }

  private grantExperience(player: PlayerSimState, amount: number): void {
    player.experience += amount;
    player.xpCollected += amount;
    this.bumpTelemetry(player.id, 'xpCollected', amount);
    while (player.experience >= player.experienceToNext) {
      player.experience -= player.experienceToNext;
      player.psychicLevel += 1;
      const healthGain = Math.round(15 * player.healthGrowthMultiplier);
      player.maxHealth += healthGain;
      player.health = Math.min(player.maxHealth, player.health + Math.round(player.maxHealth * 0.35));
      player.experienceToNext = Math.round(player.experienceToNext * 1.25 + 40);
      this.queueAugmentOffer(player);
    }
  }

  private queueAugmentOffer(player: PlayerSimState): void {
    const options = this.pickAugmentOptions(player);
    const offer: AugmentOffer = {
      id: randomUUID(),
      level: player.psychicLevel,
      options
    };
    player.pendingAugments.push(offer);
    this.events.push({
      type: 'target',
      targetId: player.id,
      message: {
        type: 'level-up-offer',
        playerId: player.id,
        offerId: offer.id,
        level: offer.level,
        options: options.map(getAugmentOption)
      }
    });
  }

  private pickAugmentOptions(player: PlayerSimState): AugmentId[] {
    const pool = [...AUGMENT_POOL];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }
    const taken = new Set<AugmentId>();
    for (const id of player.augments) {
      if (!STACKABLE_AUGMENTS.has(id)) {
        taken.add(id);
      }
    }
    const nonStackableCount = AUGMENT_POOL.filter((id) => !STACKABLE_AUGMENTS.has(id)).length;
    const allowDuplicates = taken.size >= Math.max(0, nonStackableCount - 1);
    const desired = player.psychicLevel <= 2 ? Math.min(2, AUGMENT_POOL.length) : Math.min(3, AUGMENT_POOL.length);
    const options: AugmentId[] = [];
    for (const id of pool) {
      if (STACKABLE_AUGMENTS.has(id) || !taken.has(id) || allowDuplicates) {
        options.push(id);
      }
      if (options.length >= desired) {
        break;
      }
    }
    while (options.length < desired) {
      options.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return options;
  }

  private applyAugment(player: PlayerSimState, augmentId: AugmentId): void {
    player.augments.push(augmentId);
    player.lastAugmentId = augmentId;
    switch (augmentId) {
      case 'mind-surge': {
        player.damageMultiplier *= 1.2;
        break;
      }
      case 'rapid-channel': {
        player.cooldownMultiplier *= 0.8;
        player.primaryCooldown = Math.min(player.primaryCooldown, PROJECTILE_COOLDOWN * player.cooldownMultiplier);
        break;
      }
      case 'psy-shield': {
        player.healthGrowthMultiplier += 0.25;
        player.maxHealth = Math.round(player.maxHealth * 1.25);
        player.health = player.maxHealth;
        break;
      }
      case 'bolt-split': {
        player.splitShots = Math.min(player.splitShots + 1, 2);
        break;
      }
      case 'foraging-aura': {
        player.lootMagnetLevel += 1;
        this.recalcLootMagnet(player);
        break;
      }
      default:
        assertNever(augmentId);
    }

    this.noteAugmentPick(augmentId);

    this.events.push({
      type: 'broadcast',
      message: {
        type: 'augment-applied',
        playerId: player.id,
        augmentId,
        level: player.psychicLevel
      }
    });
  }
}

const world = new GameWorld();
const armory = new ArmoryManager();
let sessionPhase: GamePhase = 'combat';
let runNumber = 0;
let pausedForArmory = false;
let latestSnapshot: WorldSnapshot | null = null;
let lastFullSnapshotTick = 0;
const FULL_SNAPSHOT_INTERVAL = 12;
const summaryAcknowledgements = new Set<string>();

interface ClientContext {
  id: string;
  socket: WebSocket;
  hasJoined: boolean;
  displayName: string | null;
}

const clients = new Map<WebSocket, ClientContext>();

enterArmoryStage();

const httpServer = createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Farsight game server running');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  const context: ClientContext = { id: randomUUID(), socket, hasJoined: false, displayName: null };
  clients.set(socket, context);

  socket.on('message', (raw) => handleClientMessage(context, raw));
  socket.on('close', () => handleDisconnect(context));
  socket.on('error', (error) => {
    console.error('socket error', error);
    handleDisconnect(context);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Farsight server listening on :${PORT}`);
});

setInterval(() => {
  if (!pausedForArmory) {
    world.update();
  }

  const summary = world.consumeRunSummary();
  if (summary) {
    handleRunSummary(summary);
  }

  const events = world.drainEvents();
  for (const event of events) {
    if (event.type === 'broadcast') {
      broadcast(event.message);
    } else {
      sendToPlayerId(event.targetId, event.message);
    }
  }

  const currentMutators = armory.getMutators();
  world.setMutators(currentMutators);
  const snapshot = world.snapshot(currentMutators);
  const previousSnapshot = latestSnapshot;
  const shouldSendFull =
    !previousSnapshot ||
    snapshot.tick - lastFullSnapshotTick >= FULL_SNAPSHOT_INTERVAL ||
    sessionPhase !== 'combat';

  if (shouldSendFull) {
    latestSnapshot = snapshot;
    lastFullSnapshotTick = snapshot.tick;
    broadcast({ type: 'snapshot', snapshot });
  } else {
    const delta = computeSnapshotDelta(previousSnapshot, snapshot);
    latestSnapshot = snapshot;
    if (delta) {
      const deltaMessage: ServerMessage = {
        type: 'snapshot-delta',
        baseTick: previousSnapshot.tick,
        delta
      };
      broadcast(deltaMessage);
    }
  }

  if (armory.refreshMutators()) {
    broadcastArmoryState();
    broadcast({
      type: 'mutator-activated',
      mutators: armory.getMutators()
    });
  }
}, TICK_INTERVAL_MS);

function handleClientMessage(context: ClientContext, raw: RawData): void {
  const message = parseClientMessage(raw);
  if (!message) {
    return;
  }

  switch (message.type) {
    case 'hello': {
      if (message.protocol !== NETWORK_PROTOCOL_VERSION) {
        context.socket.close(4000, 'protocol mismatch');
        return;
      }

      if (context.hasJoined) {
        return;
      }

      if (world.players.size >= MAX_PLAYERS) {
        context.socket.close(4001, 'server full');
        return;
      }

      const displayName = cleanDisplayName(message.displayName);
      context.displayName = displayName;
      const meta = armory.ensurePlayer(context.id, displayName);
      meta.ready = sessionPhase === 'combat' ? meta.ready : false;
      const player = world.addPlayer(context.id, displayName);
      armory.applyLoadout(player, world);
      player.ready = sessionPhase === 'combat' ? player.ready : false;
      context.hasJoined = true;
      console.log(`player joined: ${displayName} (${context.id})`);
      const armoryState = armory.buildState(sessionPhase, runNumber);
      send(context.socket, {
        type: 'welcome',
        playerId: player.id,
        tickRate: TICK_RATE,
        level: world.level,
        players: getPlayerSummaries(),
        roster: getRosterEntries(),
        objectives: world.getObjectiveState(),
        armory: armoryState
      });
      broadcastArmoryState(armoryState);
      break;
    }

    case 'input': {
      if (!context.hasJoined) {
        return;
      }
      const player = world.players.get(context.id);
      if (!player) {
        return;
      }
      if (!Number.isFinite(message.state.aimHeading)) {
        message.state.aimHeading = message.state.aimDirection;
      }
      player.input = message.state;
      break;
    }

    case 'ping': {
      send(context.socket, { type: 'pong', time: message.time });
      break;
    }

    case 'choose-augment': {
      if (!context.hasJoined) {
        return;
      }
      world.chooseAugment(context.id, message.offerId, message.augmentId);
      break;
    }

    case 'set-ready': {
      if (!context.hasJoined) {
        return;
      }
      if (message.context === 'armory') {
        armory.setReady(context.id, message.ready);
        broadcastArmoryState(armory.buildState(sessionPhase, runNumber));
      } else {
        world.setPlayerReady(context.id, message.ready);
      }
      break;
    }

    case 'quick-ping': {
      if (!context.hasJoined) {
        return;
      }
      world.quickPing(context.id, message.kind, message.position);
      break;
    }

    case 'armory-purchase': {
      if (!context.hasJoined) {
        return;
      }
      const result = armory.purchase(context.id, message.itemId);
      if (!result.success) {
        console.warn(`armory purchase failed for ${context.id}: ${result.error}`);
      }
      broadcastArmoryState(armory.buildState(sessionPhase, runNumber));
      break;
    }

    case 'armory-equip': {
      if (!context.hasJoined) {
        return;
      }
      const result = armory.equip(context.id, message.itemId, message.slot);
      if (!result.success) {
        console.warn(`armory equip failed for ${context.id}: ${result.error}`);
      }
      broadcastArmoryState(armory.buildState(sessionPhase, runNumber));
      break;
    }

    case 'launch-run': {
      if (!context.hasJoined) {
        return;
      }
      if (sessionPhase === 'armory' && armory.allReady()) {
        startNextRun();
      }
      break;
    }

    case 'summary-ack': {
      if (!context.hasJoined || sessionPhase !== 'summary') {
        return;
      }
      summaryAcknowledgements.add(context.id);
      maybeAdvanceFromSummary();
      break;
    }

    default: {
      assertNever(message);
    }
  }
}

function handleDisconnect(context: ClientContext): void {
  if (clients.delete(context.socket) && context.hasJoined) {
    world.removePlayer(context.id);
    armory.removePlayer(context.id);
    summaryAcknowledgements.delete(context.id);
    maybeAdvanceFromSummary();
    console.log(`player left: ${context.displayName ?? context.id}`);
    broadcastArmoryState(armory.buildState(sessionPhase, runNumber));
  }
}

function collectWalkableTiles(level: LevelData): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const tile = level.tiles[y * level.width + x];
      if (tile === 'floor' || tile === 'spawn') {
        tiles.push({ x, y });
      }
    }
  }
  if (tiles.length === 0) {
    tiles.push({ x: Math.floor(level.width / 2), y: Math.floor(level.height / 2) });
  }
  return tiles;
}

function randomWalkableTile(tiles: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (tiles.length === 0) {
    return { x: 0, y: 0 };
  }
  const index = Math.floor(Math.random() * tiles.length);
  return tiles[index];
}

function getEnemySpeed(kind: EnemyKind): number {
  switch (kind) {
    case 'fox':
      return 85;
    case 'hawk':
      return 150;
    case 'snake':
      return 55;
    case 'raccoon':
      return 70;
    case 'coyote':
      return 65;
    case 'weasel':
      return 120;
    case 'owl':
      return 60;
    default:
      return 70;
  }
}

function getEnemyMaxHealth(kind: EnemyKind): number {
  switch (kind) {
    case 'fox':
      return 40;
    case 'hawk':
      return 35;
    case 'snake':
      return 50;
    case 'raccoon':
      return 60;
    case 'coyote':
      return 420;
    case 'weasel':
      return 58;
    case 'owl':
      return 110;
    default:
      return 30;
  }
}

function getEnemyAttackRange(kind: EnemyKind): number {
  return ENEMY_ATTACK_RANGE[kind] ?? 48;
}

function getEnemyAttackDamage(kind: EnemyKind): number {
  return ENEMY_ATTACK_DAMAGE[kind] ?? 18;
}

function getEnemyAttackWindup(kind: EnemyKind): number {
  return ENEMY_ATTACK_WINDUP[kind] ?? 0.6;
}

function getEnemyAttackRecovery(kind: EnemyKind): number {
  return ENEMY_ATTACK_RECOVERY[kind] ?? 0.7;
}

function getEnemyAttackCooldown(kind: EnemyKind): number {
  return ENEMY_ATTACK_COOLDOWN[kind] ?? 1.4;
}

function tileToWorld(x: number, y: number, level: LevelData): Vector2D {
  return {
    x: (x - (level.width / 2 - 0.5)) * TILE_SIZE,
    y: (y - (level.height / 2 - 0.5)) * TILE_SIZE
  };
}

function clampToLevel(position: Vector2D, level: LevelData): void {
  const halfWidth = (level.width * TILE_SIZE) / 2 - TILE_SIZE * 0.5;
  const halfHeight = (level.height * TILE_SIZE) / 2 - TILE_SIZE * 0.5;
  position.x = Math.max(-halfWidth, Math.min(halfWidth, position.x));
  position.y = Math.max(-halfHeight, Math.min(halfHeight, position.y));
}

function isWithinLevel(position: Vector2D, level: LevelData): boolean {
  const halfWidth = (level.width * TILE_SIZE) / 2;
  const halfHeight = (level.height * TILE_SIZE) / 2;
  return position.x >= -halfWidth && position.x <= halfWidth && position.y >= -halfHeight && position.y <= halfHeight;
}

function cleanDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  const sanitized = trimmed.replace(/[^A-Za-z0-9\s_-]/g, '');
  if (sanitized.length === 0) {
    return 'Chicken';
  }
  return sanitized;
}

function getPlayerSummaries(): PlayerSummary[] {
  const summaries: PlayerSummary[] = [];
  for (const context of clients.values()) {
    if (!context.hasJoined) {
      continue;
    }
    summaries.push({
      id: context.id,
      displayName: context.displayName ?? context.id.slice(0, 8)
    });
  }
  return summaries;
}

function getRosterEntries(): RosterEntry[] {
  const roster: RosterEntry[] = [];
  for (const player of world.players.values()) {
    roster.push({
      id: player.id,
      displayName: player.displayName,
      level: player.psychicLevel,
      ready: player.ready,
      lastAugmentId: player.lastAugmentId,
      augmentCount: player.augments.length
    });
  }
  return roster;
}

function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendToPlayerId(playerId: string, message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const context of clients.values()) {
    if (context.id === playerId && context.socket.readyState === WebSocket.OPEN) {
      context.socket.send(payload);
      break;
    }
  }
}

function parseClientMessage(raw: RawData): ClientMessage | null {
  try {
    let data: string;
    if (typeof raw === 'string') {
      data = raw;
    } else if (raw instanceof Buffer) {
      data = raw.toString('utf-8');
    } else if (Array.isArray(raw)) {
      data = Buffer.concat(raw).toString('utf-8');
    } else if (raw instanceof ArrayBuffer) {
      data = Buffer.from(new Uint8Array(raw)).toString('utf-8');
    } else {
      data = Buffer.from(raw).toString('utf-8');
    }
    return JSON.parse(data) as ClientMessage;
  } catch (error) {
    console.warn('Failed to parse client message', error);
    return null;
  }
}

function computeVelocity(input: PlayerInputState): { x: number; y: number } {
  const speed = 140;
  let x = 0;
  let y = 0;
  if (input.moveUp) y -= 1;
  if (input.moveDown) y += 1;
  if (input.moveLeft) x -= 1;
  if (input.moveRight) x += 1;

  if (x === 0 && y === 0) {
    return { x: 0, y: 0 };
  }

  const length = Math.hypot(x, y);
  return {
    x: (x / length) * speed,
    y: (y / length) * speed
  };
}

function handleRunSummary(summary: RunSummary): void {
  armory.grantRunRewards(summary);
  armory.setSummary(summary, null);
  sessionPhase = 'summary';
  pausedForArmory = true;
  summaryAcknowledgements.clear();
  latestSnapshot = null;
  const state = armory.buildState(sessionPhase, runNumber);
  broadcastArmoryState(state);
  maybeAdvanceFromSummary();
}

function maybeAdvanceFromSummary(): void {
  if (sessionPhase !== 'summary') {
    return;
  }
  for (const player of world.players.values()) {
    if (!summaryAcknowledgements.has(player.id)) {
      return;
    }
  }
  if (world.players.size > 0) {
    enterArmoryStage();
  }
}

function enterArmoryStage(): void {
  sessionPhase = 'armory';
  pausedForArmory = true;
  runNumber += 1;
  armory.resetReady();
  armory.setSummary(null, null);
  summaryAcknowledgements.clear();
  world.resetForArmory((player) => armory.applyLoadout(player, world));
  latestSnapshot = null;
  broadcastArmoryState();
}

function startNextRun(): void {
  sessionPhase = 'combat';
  pausedForArmory = false;
  armory.resetReady();
  for (const player of world.players.values()) {
    player.ready = false;
    armory.applyLoadout(player, world);
  }
  latestSnapshot = null;
  broadcastArmoryState(armory.buildState(sessionPhase, runNumber));
  broadcast({
    type: 'mutator-activated',
    mutators: armory.getMutators()
  });
}

function broadcastArmoryState(state: ArmoryState = armory.buildState(sessionPhase, runNumber)): void {
  broadcast({ type: 'armory-state', state });
}

function computeSnapshotDelta(previous: WorldSnapshot, next: WorldSnapshot): WorldSnapshotDelta | null {
  const players = computeEntityDelta(previous.players, next.players);
  const enemies = computeEntityDelta(previous.enemies, next.enemies);
  const projectiles = computeEntityDelta(previous.projectiles, next.projectiles);
  const xpDrops = computeEntityDelta(previous.xpDrops, next.xpDrops);
  const artifacts = computeEntityDelta(previous.artifacts, next.artifacts);
  const objectivesChanged = !entitiesEqual(previous.objectives, next.objectives);
  const mutatorsChanged = !entitiesEqual(previous.mutators, next.mutators);

  if (
    !players &&
    !enemies &&
    !projectiles &&
    !xpDrops &&
    !artifacts &&
    !objectivesChanged &&
    !mutatorsChanged
  ) {
    return null;
  }

  const delta: WorldSnapshotDelta = {
    tick: next.tick
  };
  if (players) delta.players = players;
  if (enemies) delta.enemies = enemies;
  if (projectiles) delta.projectiles = projectiles;
  if (xpDrops) delta.xpDrops = xpDrops;
  if (artifacts) delta.artifacts = artifacts;
  if (objectivesChanged) delta.objectives = next.objectives;
  if (mutatorsChanged) delta.mutators = next.mutators;
  return delta;
}

function computeEntityDelta<T extends { id: string }>(previous: T[], next: T[]): EntityDelta<T> | undefined {
  const upsert: T[] = [];
  const remove: string[] = [];
  const previousById = new Map<string, T>();
  for (const entity of previous) {
    previousById.set(entity.id, entity);
  }
  const nextIds = new Set<string>();
  for (const entity of next) {
    nextIds.add(entity.id);
    const prev = previousById.get(entity.id);
    if (!prev || !entitiesEqual(prev, entity)) {
      upsert.push(entity);
    }
  }
  for (const entity of previous) {
    if (!nextIds.has(entity.id)) {
      remove.push(entity.id);
    }
  }
  if (upsert.length === 0 && remove.length === 0) {
    return undefined;
  }
  return { upsert, remove };
}

function entitiesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled message ${(value as { type?: string }).type ?? 'unknown'}`);
}
