import type { LevelData } from './level';

export const NETWORK_PROTOCOL_VERSION = 1;
export const TICK_RATE = 60;
export const MAX_PLAYERS = 4;

export type EnemyKind = 'fox' | 'hawk' | 'snake';
export type EnemyIntent = 'idle' | 'windup' | 'recover';

export const BASE_PLAYER_DAMAGE = 25;
export const PROJECTILE_SPEED = 420;
export const PROJECTILE_LIFETIME = 1.2; // seconds
export const PROJECTILE_RADIUS = 18;
export const PROJECTILE_COOLDOWN = 0.35; // seconds

export interface PlayerSummary {
  id: string;
  displayName: string;
}

export const ENEMY_XP_VALUES: Record<EnemyKind, number> = {
  fox: 15,
  hawk: 18,
  snake: 12
};

export const ENEMY_ATTACK_DAMAGE: Record<EnemyKind, number> = {
  fox: 18,
  hawk: 14,
  snake: 22
};

export const ENEMY_ATTACK_RANGE: Record<EnemyKind, number> = {
  fox: 42,
  hawk: 52,
  snake: 36
};

export const ENEMY_ATTACK_WINDUP: Record<EnemyKind, number> = {
  fox: 0.6,
  hawk: 0.75,
  snake: 0.55
};

export const ENEMY_ATTACK_RECOVERY: Record<EnemyKind, number> = {
  fox: 0.7,
  hawk: 0.65,
  snake: 0.85
};

export const ENEMY_ATTACK_COOLDOWN: Record<EnemyKind, number> = {
  fox: 1.35,
  hawk: 1.45,
  snake: 1.6
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

export type ClientMessage = HelloMessage | InputMessage | PingMessage;

export interface WelcomeMessage {
  type: 'welcome';
  playerId: string;
  tickRate: number;
  level: LevelData;
  players: PlayerSummary[];
}

export interface SnapshotMessage {
  type: 'snapshot';
  snapshot: WorldSnapshot;
}

export interface ServerPingMessage {
  type: 'pong';
  time: number;
}

export type ServerMessage = WelcomeMessage | SnapshotMessage | ServerPingMessage;

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
  position: Vector2D;
  velocity: Vector2D;
  ttl: number; // seconds remaining
}

export interface XpDropState {
  id: string;
  amount: number;
  position: Vector2D;
  age: number; // seconds alive
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  xpDrops: XpDropState[];
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
    aimDirection: 0
  };
}

export * from './level';
