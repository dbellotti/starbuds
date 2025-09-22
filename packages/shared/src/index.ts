import type { LevelData } from './level';

export const NETWORK_PROTOCOL_VERSION = 3;
export const TICK_RATE = 60;
export const MAX_PLAYERS = 4;

export type EnemyKind =
  | 'fox'
  | 'hawk'
  | 'snake'
  | 'raccoon'
  | 'coyote'
  | 'weasel'
  | 'owl';
export type EnemyIntent = 'idle' | 'windup' | 'recover' | 'burrow' | 'channel';

export type ProjectileFaction = 'player' | 'enemy' | 'boss';
export type AugmentId =
  | 'mind-surge'
  | 'rapid-channel'
  | 'psy-shield'
  | 'bolt-split'
  | 'foraging-aura';
export type QuickPingKind = 'assist' | 'danger' | 'loot' | 'objective';

export type ArtifactKind = 'damage-core' | 'haste-spur' | 'ward-feather';

export interface AugmentDefinition {
  id: AugmentId;
  name: string;
  description: string;
}

export const AUGMENT_DEFINITIONS: Record<AugmentId, AugmentDefinition> = {
  'mind-surge': {
    id: 'mind-surge',
    name: 'Mind Surge',
    description: '+20% bolt damage'
  },
  'rapid-channel': {
    id: 'rapid-channel',
    name: 'Rapid Channel',
    description: '-20% bolt cooldown'
  },
  'psy-shield': {
    id: 'psy-shield',
    name: 'Psi Shield',
    description: '+25% max health now & on future levels'
  },
  'bolt-split': {
    id: 'bolt-split',
    name: 'Echo Bolt',
    description: 'Projectiles split once on hit'
  },
  'foraging-aura': {
    id: 'foraging-aura',
    name: 'Foraging Aura',
    description: 'XP orbs drift toward you; effect stacks each level'
  }
};

export const AUGMENT_POOL: AugmentId[] = Object.keys(AUGMENT_DEFINITIONS) as AugmentId[];

export const STACKABLE_AUGMENTS = new Set<AugmentId>(['foraging-aura']);

export interface AugmentOption {
  id: AugmentId;
  name: string;
  description: string;
}

export function getAugmentOption(id: AugmentId): AugmentOption {
  const augment = AUGMENT_DEFINITIONS[id];
  if (!augment) {
    throw new Error(`Unknown augment ${id}`);
  }
  return { id: augment.id, name: augment.name, description: augment.description };
}

export interface ArtifactDefinition {
  id: ArtifactKind;
  name: string;
  description: string;
}

export const ARTIFACT_DEFINITIONS: Record<ArtifactKind, ArtifactDefinition> = {
  'damage-core': {
    id: 'damage-core',
    name: 'Psionic Core',
    description: '+15% bolt damage & aura brightness'
  },
  'haste-spur': {
    id: 'haste-spur',
    name: 'Temporal Spur',
    description: '-12% ability cooldowns & faster projectiles'
  },
  'ward-feather': {
    id: 'ward-feather',
    name: 'Ward Feather',
    description: '+12% max health and a burst shield'
  }
};

export function getArtifactDefinition(id: ArtifactKind): ArtifactDefinition {
  const artifact = ARTIFACT_DEFINITIONS[id];
  if (!artifact) {
    throw new Error(`Unknown artifact ${id}`);
  }
  return artifact;
}

export const BASE_PLAYER_DAMAGE = 25;
export const PROJECTILE_SPEED = 420;
export const PROJECTILE_LIFETIME = 1.2; // seconds
export const PROJECTILE_RADIUS = 18;
export const PROJECTILE_COOLDOWN = 0.35; // seconds

export const LOOT_MAGNET_BASE_RADIUS = 140;
export const LOOT_MAGNET_RADIUS_STEP = 55;
export const LOOT_MAGNET_MAX_RADIUS = 320;
export const LOOT_MAGNET_PULL_SPEED = 260;

export const ARTIFACT_TTL = 28; // seconds before despawn

export interface PlayerSummary {
  id: string;
  displayName: string;
}

export interface RosterEntry extends PlayerSummary {
  level: number;
  ready: boolean;
  lastAugmentId: AugmentId | null;
  augmentCount: number;
}

export interface ObjectiveState {
  wave: number;
  waveProgress: number; // 0..1 progress toward next wave
  totalKills: number;
  nextBossSeconds: number | null;
  extractionReady: boolean;
  extractionCountdown: number | null;
  extractionPosition: Vector2D | null;
}

export const ENEMY_XP_VALUES: Record<EnemyKind, number> = {
  fox: 15,
  hawk: 18,
  snake: 12,
  raccoon: 22,
  coyote: 240,
  weasel: 28,
  owl: 30
};

export const ENEMY_ATTACK_DAMAGE: Record<EnemyKind, number> = {
  fox: 18,
  hawk: 14,
  snake: 22,
  raccoon: 16,
  coyote: 28,
  weasel: 20,
  owl: 12
};

export const ENEMY_ATTACK_RANGE: Record<EnemyKind, number> = {
  fox: 42,
  hawk: 52,
  snake: 36,
  raccoon: 160,
  coyote: 82,
  weasel: 56,
  owl: 180
};

export const ENEMY_ATTACK_WINDUP: Record<EnemyKind, number> = {
  fox: 0.6,
  hawk: 0.75,
  snake: 0.55,
  raccoon: 1.1,
  coyote: 1.6,
  weasel: 0.45,
  owl: 1.2
};

export const ENEMY_ATTACK_RECOVERY: Record<EnemyKind, number> = {
  fox: 0.7,
  hawk: 0.65,
  snake: 0.85,
  raccoon: 0.9,
  coyote: 1.1,
  weasel: 0.8,
  owl: 1.4
};

export const ENEMY_ATTACK_COOLDOWN: Record<EnemyKind, number> = {
  fox: 1.35,
  hawk: 1.45,
  snake: 1.6,
  raccoon: 2.1,
  coyote: 4.5,
  weasel: 1.9,
  owl: 3.4
};

export const PLAYER_INVULNERABILITY_TIME = 0.75;
export const PLAYER_HURT_FLASH_TIME = 0.5;

export type PlayerInputButton =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'primaryAbility'
  | 'secondaryAbility'
  | 'dash';

export type PlayerInputState = Record<PlayerInputButton, boolean> & {
  aimDirection: number;
  aimHeading: number;
};

export interface HelloMessage {
  type: 'hello';
  protocol: number;
  displayName: string;
}

export interface InputMessage {
  type: 'input';
  sequence: number;
  state: PlayerInputState;
}

export interface PingMessage {
  type: 'ping';
  time: number;
}

export interface SetReadyMessage {
  type: 'set-ready';
  ready: boolean;
}

export interface QuickPingMessage {
  type: 'quick-ping';
  kind: QuickPingKind;
  position: Vector2D;
}

export interface ChooseAugmentMessage {
  type: 'choose-augment';
  offerId: string;
  augmentId: AugmentId;
}

export type ClientMessage =
  | HelloMessage
  | InputMessage
  | PingMessage
  | ChooseAugmentMessage
  | SetReadyMessage
  | QuickPingMessage;

export interface WelcomeMessage {
  type: 'welcome';
  playerId: string;
  tickRate: number;
  level: LevelData;
  players: PlayerSummary[];
  roster: RosterEntry[];
  objectives: ObjectiveState;
}

export interface SnapshotMessage {
  type: 'snapshot';
  snapshot: WorldSnapshot;
}

export interface ServerPingMessage {
  type: 'pong';
  time: number;
}

export interface QuickPingBroadcastMessage {
  type: 'ping-event';
  playerId: string;
  kind: QuickPingKind;
  position: Vector2D;
  playerName: string;
}

export interface LevelUpOfferMessage {
  type: 'level-up-offer';
  playerId: string;
  offerId: string;
  level: number;
  options: AugmentOption[];
}

export interface AugmentAppliedMessage {
  type: 'augment-applied';
  playerId: string;
  augmentId: AugmentId;
  level: number;
}

export interface BossSpawnedMessage {
  type: 'boss-spawned';
  bossId: string;
  kind: EnemyKind;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | ServerPingMessage
  | LevelUpOfferMessage
  | AugmentAppliedMessage
  | BossSpawnedMessage
  | QuickPingBroadcastMessage;

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  position: Vector2D;
  velocity: Vector2D;
  health: number;
  maxHealth: number;
  intent: EnemyIntent;
  intentTimer: number;
  intentDuration: number;
  attackRange: number;
  targetPlayerId: string | null;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  faction: ProjectileFaction;
  position: Vector2D;
  velocity: Vector2D;
  ttl: number; // seconds remaining
  power: number;
}

export interface XpDropState {
  id: string;
  amount: number;
  position: Vector2D;
  age: number; // seconds alive
}

export interface ArtifactDropState {
  id: string;
  kind: ArtifactKind;
  position: Vector2D;
  age: number;
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  xpDrops: XpDropState[];
  artifacts: ArtifactDropState[];
  objectives: ObjectiveState;
}

export interface PlayerState {
  id: string;
  displayName: string;
  position: Vector2D;
  velocity: Vector2D;
  facing: number; // radians
  psychicLevel: number;
  maxHealth: number;
  health: number;
  experience: number;
  experienceToNext: number;
  hurtTimer: number;
  invulnerableTimer: number;
  lastAugmentId: AugmentId | null;
  augments: AugmentId[];
  artifacts: ArtifactKind[];
  lootMagnetLevel: number;
  ready: boolean;
}

export interface Vector2D {
  x: number;
  y: number;
}

export function createInitialInputState(): PlayerInputState {
  return {
    moveUp: false,
    moveDown: false,
    moveLeft: false,
    moveRight: false,
    primaryAbility: false,
    secondaryAbility: false,
    dash: false,
    aimDirection: 0,
    aimHeading: 0
  };
}

export * from './level';
