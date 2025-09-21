import type { LevelData } from './level';

export const NETWORK_PROTOCOL_VERSION = 1;
export const TICK_RATE = 60;
export const MAX_PLAYERS = 4;

export type EnemyKind = 'fox' | 'hawk' | 'snake';

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
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerState[];
  enemies: EnemyState[];
}

export interface PlayerState {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  facing: number; // radians
  psychicLevel: number;
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
