import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import {
  ClientMessage,
  MAX_PLAYERS,
  NETWORK_PROTOCOL_VERSION,
  ServerMessage,
  TICK_RATE,
  createInitialInputState,
  PlayerInputState,
  PlayerState,
  PlayerSummary,
  WorldSnapshot,
  EnemyState,
  EnemyKind,
  Vector2D,
  ProjectileState,
  XpDropState,
  BASE_PLAYER_DAMAGE,
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  PROJECTILE_RADIUS,
  PROJECTILE_COOLDOWN,
  ENEMY_XP_VALUES,
  generateLevel,
  LevelData,
  TILE_SIZE
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


type PlayerSimState = PlayerState & {
  input: PlayerInputState;
  primaryCooldown: number;
  experience: number;
  experienceToNext: number;
  health: number;
  maxHealth: number;
};

type EnemySimState = EnemyState & {
  wanderDirection: Vector2D;
  switchTimer: number;
};

type ProjectileSimState = ProjectileState & {
  ttl: number;
};

type XpDropSimState = XpDropState;

class GameWorld {
  tick = 0;
  players = new Map<string, PlayerSimState>();
  enemies = new Map<string, EnemySimState>();
  projectiles = new Map<string, ProjectileSimState>();
  xpDrops = new Map<string, XpDropSimState>();
  readonly level: LevelData;
  private spawnCursor = 0;
  private enemySpawnAccumulator = 0;
  private readonly walkableTiles: Array<{ x: number; y: number }>;

  constructor() {
    this.level = generateLevel(LEVEL_CONFIG);
    this.walkableTiles = collectWalkableTiles(this.level);
    this.spawnInitialEnemies();
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
      maxHealth: 120
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  update(): void {
    this.tick += 1;
    const deltaSeconds = TICK_INTERVAL_MS / 1000;
    for (const player of this.players.values()) {
      const velocity = computeVelocity(player.input);
      player.velocity = velocity;
      player.position.x += velocity.x * deltaSeconds;
      player.position.y += velocity.y * deltaSeconds;
      if (velocity.x !== 0 || velocity.y !== 0) {
        player.facing = Math.atan2(velocity.y, velocity.x);
      }
      player.primaryCooldown = Math.max(0, player.primaryCooldown - deltaSeconds);
      if (player.input.primaryAbility && player.primaryCooldown <= 0) {
        this.firePrimary(player);
      }
    }

    this.updateEnemies(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateXpDrops(deltaSeconds);
  }

  snapshot(): WorldSnapshot {
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
        experienceToNext: player.experienceToNext
      })),
      enemies: Array.from(this.enemies.values()).map(({ wanderDirection: _wd, switchTimer: _st, ...enemy }) => ({
        ...enemy
      })),
      projectiles: Array.from(this.projectiles.values()).map((projectile) => ({
        id: projectile.id,
        ownerId: projectile.ownerId,
        position: projectile.position,
        velocity: projectile.velocity,
        ttl: projectile.ttl
      })),
      xpDrops: Array.from(this.xpDrops.values()).map((drop) => ({
        id: drop.id,
        amount: drop.amount,
        position: drop.position,
        age: drop.age
      }))
    };
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
    const kinds: EnemyKind[] = ['fox', 'snake', 'hawk'];
    const initialCount = 12;
    for (let i = 0; i < initialCount; i += 1) {
      const kind = kinds[i % kinds.length];
      this.spawnEnemy(kind);
    }
  }

  private updateEnemies(deltaSeconds: number): void {
    this.enemySpawnAccumulator += deltaSeconds;
    const playerCount = Math.max(1, this.players.size);
    const targetEnemies = Math.min(40, playerCount * 6);
    if (this.enemySpawnAccumulator >= 6 && this.enemies.size < targetEnemies) {
      this.enemySpawnAccumulator = 0;
      const rollSeed = Math.random();
      let roll: EnemyKind;
      if (rollSeed < 0.45) {
        roll = 'fox';
      } else if (rollSeed < 0.75) {
        roll = 'snake';
      } else {
        roll = 'hawk';
      }
      this.spawnEnemy(roll);
    }

    const players = Array.from(this.players.values());

    for (const enemy of this.enemies.values()) {
      enemy.switchTimer -= deltaSeconds;
      if (enemy.switchTimer <= 0) {
        enemy.switchTimer = 1.5 + Math.random() * 2;
        enemy.wanderDirection = this.selectEnemyDirection(enemy, players);
      }

      const speed = getEnemySpeed(enemy.kind);
      enemy.velocity = {
        x: enemy.wanderDirection.x * speed,
        y: enemy.wanderDirection.y * speed
      };

      enemy.position.x += enemy.velocity.x * deltaSeconds;
      enemy.position.y += enemy.velocity.y * deltaSeconds;

      clampToLevel(enemy.position, this.level);
    }
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

  private spawnEnemy(kind: EnemyKind): void {
    const tile = randomWalkableTile(this.walkableTiles);
    const position = tileToWorld(tile.x + 0.5, tile.y + 0.5, this.level);
    const id = randomUUID();
    const enemy: EnemySimState = {
      id,
      kind,
      position,
      velocity: { x: 0, y: 0 },
      health: getEnemyMaxHealth(kind),
      maxHealth: getEnemyMaxHealth(kind),
      wanderDirection: { x: 0, y: 0 },
      switchTimer: 0
    };
    this.enemies.set(id, enemy);
  }

  private firePrimary(player: PlayerSimState): void {
    const angle = player.input.aimDirection;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const originX = player.position.x + dirX * PROJECTILE_RADIUS;
    const originY = player.position.y + dirY * PROJECTILE_RADIUS;
    const id = randomUUID();
    const projectile: ProjectileSimState = {
      id,
      ownerId: player.id,
      position: { x: originX, y: originY },
      velocity: { x: dirX * PROJECTILE_SPEED, y: dirY * PROJECTILE_SPEED },
      ttl: PROJECTILE_LIFETIME
    };
    this.projectiles.set(id, projectile);
    player.primaryCooldown = PROJECTILE_COOLDOWN;
  }

  private updateProjectiles(deltaSeconds: number): void {
    const expired: string[] = [];
    const enemyIdsToRemove: string[] = [];
    const projectileRadiusSq = PROJECTILE_RADIUS * PROJECTILE_RADIUS;

    for (const projectile of this.projectiles.values()) {
      projectile.ttl -= deltaSeconds;
      projectile.position.x += projectile.velocity.x * deltaSeconds;
      projectile.position.y += projectile.velocity.y * deltaSeconds;

      if (projectile.ttl <= 0 || !isWithinLevel(projectile.position, this.level)) {
        expired.push(projectile.id);
        continue;
      }

      for (const enemy of this.enemies.values()) {
        const dx = enemy.position.x - projectile.position.x;
        const dy = enemy.position.y - projectile.position.y;
        if (dx * dx + dy * dy <= projectileRadiusSq) {
          enemy.health -= BASE_PLAYER_DAMAGE;
          expired.push(projectile.id);
          if (enemy.health <= 0) {
            enemyIdsToRemove.push(enemy.id);
          }
          break;
        }
      }
    }

    for (const id of expired) {
      this.projectiles.delete(id);
    }

    for (const enemyId of enemyIdsToRemove) {
      const enemy = this.enemies.get(enemyId);
      if (!enemy) {
        continue;
      }
      this.handleEnemyDeath(enemy);
    }
  }

  private updateXpDrops(deltaSeconds: number): void {
    const collected: string[] = [];
    for (const drop of this.xpDrops.values()) {
      drop.age += deltaSeconds;
      for (const player of this.players.values()) {
        const dx = player.position.x - drop.position.x;
        const dy = player.position.y - drop.position.y;
        if (dx * dx + dy * dy <= (TILE_SIZE * 0.6) ** 2) {
          grantExperience(player, drop.amount);
          collected.push(drop.id);
          break;
        }
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

  private handleEnemyDeath(enemy: EnemySimState): void {
    this.enemies.delete(enemy.id);
    const xpAmount = ENEMY_XP_VALUES[enemy.kind] ?? 10;
    this.spawnXpDrop(enemy.position, xpAmount);
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
}

const world = new GameWorld();

interface ClientContext {
  id: string;
  socket: WebSocket;
  hasJoined: boolean;
  displayName: string | null;
}

const clients = new Map<WebSocket, ClientContext>();

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
  world.update();
  const snapshotMessage: ServerMessage = {
    type: 'snapshot',
    snapshot: world.snapshot()
  };
  broadcast(snapshotMessage);
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
      const player = world.addPlayer(context.id, displayName);
      context.hasJoined = true;
      console.log(`player joined: ${displayName} (${context.id})`);
      send(context.socket, {
        type: 'welcome',
        playerId: player.id,
        tickRate: TICK_RATE,
        level: world.level,
        players: getPlayerSummaries()
      });
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
      player.input = message.state;
      break;
    }

    case 'ping': {
      send(context.socket, { type: 'pong', time: message.time });
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
    console.log(`player left: ${context.displayName ?? context.id}`);
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
      return 130;
    case 'snake':
      return 55;
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
    default:
      return 30;
  }
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

function grantExperience(player: PlayerSimState, amount: number): void {
  player.experience += amount;
  while (player.experience >= player.experienceToNext) {
    player.experience -= player.experienceToNext;
    player.psychicLevel += 1;
    player.experienceToNext = Math.round(player.experienceToNext * 1.25 + 40);
    player.maxHealth += 15;
    player.health = Math.min(player.maxHealth, player.health + Math.round(player.maxHealth * 0.25));
  }
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

function parseClientMessage(raw: RawData): ClientMessage | null {
  try {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
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

function assertNever(value: never): never {
  throw new Error(`Unhandled message ${(value as { type?: string }).type ?? 'unknown'}`);
}
