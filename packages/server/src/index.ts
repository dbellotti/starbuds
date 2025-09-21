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
  WorldSnapshot,
  EnemyState,
  EnemyKind,
  Vector2D,
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
};

type EnemySimState = EnemyState & {
  wanderDirection: Vector2D;
  switchTimer: number;
};

class GameWorld {
  tick = 0;
  players = new Map<string, PlayerSimState>();
  enemies = new Map<string, EnemySimState>();
  readonly level: LevelData;
  private spawnCursor = 0;
  private enemySpawnAccumulator = 0;
  private readonly walkableTiles: Array<{ x: number; y: number }>;

  constructor() {
    this.level = generateLevel(LEVEL_CONFIG);
    this.walkableTiles = collectWalkableTiles(this.level);
    this.spawnInitialEnemies();
  }

  addPlayer(id: string): PlayerSimState {
    const spawn = this.pickSpawnPoint();
    const player: PlayerSimState = {
      id,
      position: spawn,
      velocity: { x: 0, y: 0 },
      facing: 0,
      psychicLevel: 1,
      input: createInitialInputState()
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
    }

    this.updateEnemies(deltaSeconds);
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        position: player.position,
        velocity: player.velocity,
        facing: player.facing,
        psychicLevel: player.psychicLevel
      })),
      enemies: Array.from(this.enemies.values()).map(({ wanderDirection: _wd, switchTimer: _st, ...enemy }) => ({
        ...enemy
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
    if (this.enemySpawnAccumulator >= 10 && this.enemies.size < 20) {
      this.enemySpawnAccumulator = 0;
      const roll: EnemyKind = Math.random() < 0.4 ? 'fox' : Math.random() < 0.7 ? 'snake' : 'hawk';
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

      const player = world.addPlayer(context.id);
      context.hasJoined = true;
      context.displayName = cleanDisplayName(message.displayName);
      console.log(`player joined: ${context.displayName} (${context.id})`);
      send(context.socket, {
        type: 'welcome',
        playerId: player.id,
        tickRate: TICK_RATE,
        level: world.level
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

function cleanDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  const sanitized = trimmed.replace(/[^A-Za-z0-9\s_-]/g, '');
  if (sanitized.length === 0) {
    return 'Chicken';
  }
  return sanitized;
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
