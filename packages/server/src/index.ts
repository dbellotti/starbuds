import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import {
  AUGMENT_POOL,
  ClientMessage,
  createInitialInputState,
  MAX_PLAYERS,
  NETWORK_PROTOCOL_VERSION,
  PlayerInputState,
  PlayerState,
  PlayerSummary,
  PROJECTILE_COOLDOWN,
  PROJECTILE_LIFETIME,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  PLAYER_HURT_FLASH_TIME,
  PLAYER_INVULNERABILITY_TIME,
  ServerMessage,
  TICK_RATE,
  WorldSnapshot,
  EnemyKind,
  EnemyState,
  ProjectileState,
  Vector2D,
  XpDropState,
  BASE_PLAYER_DAMAGE,
  ENEMY_ATTACK_COOLDOWN,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_ATTACK_RANGE,
  ENEMY_ATTACK_RECOVERY,
  ENEMY_ATTACK_WINDUP,
  ENEMY_XP_VALUES,
  generateLevel,
  LevelData,
  TILE_SIZE,
  AugmentId,
  getAugmentOption,
  ProjectileFaction
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
};

type EnemySimState = EnemyState & {
  wanderDirection: Vector2D;
  switchTimer: number;
  attackCooldown: number;
  isBoss: boolean;
};

type ProjectileSimState = ProjectileState & {
  ttl: number;
  damage: number;
  maxSplits: number;
  splitDepth: number;
  radius: number;
};

type XpDropSimState = XpDropState;

type WorldEvent =
  | { type: 'broadcast'; message: ServerMessage }
  | { type: 'target'; targetId: string; message: ServerMessage };

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
  private readonly events: WorldEvent[] = [];
  private readonly projectilePool: ProjectileSimState[] = [];
  private readonly enemyPool: EnemySimState[] = [];
  private minibossSpawnTimer = 0;
  private nextMinibossInterval = 55;

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
      lastAugmentId: null
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
      player.hurtTimer = Math.max(0, player.hurtTimer - deltaSeconds);
      player.invulnerableTimer = Math.max(0, player.invulnerableTimer - deltaSeconds);
      if (player.input.primaryAbility && player.primaryCooldown <= 0) {
        this.firePrimary(player);
      }
    }

    this.updateEnemies(deltaSeconds);
    this.trySpawnMiniboss(deltaSeconds);
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
        experienceToNext: player.experienceToNext,
        hurtTimer: player.hurtTimer,
        invulnerableTimer: player.invulnerableTimer,
        lastAugmentId: player.lastAugmentId
      })),
      enemies: Array.from(this.enemies.values()).map(({ wanderDirection: _wd, switchTimer: _st, attackCooldown: _ac, ...enemy }) => ({
        ...enemy
      })),
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
      }))
    };
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
    const kinds: EnemyKind[] = ['fox', 'snake', 'hawk', 'raccoon'];
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
      if (rollSeed < 0.35) {
        roll = 'fox';
      } else if (rollSeed < 0.6) {
        roll = 'snake';
      } else if (rollSeed < 0.85) {
        roll = 'hawk';
      } else {
        roll = 'raccoon';
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
      const isRanged = enemy.kind === 'raccoon';
      const isBoss = enemy.isBoss;

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
          if (enemy.attackCooldown <= 0 && distance <= enemy.attackRange) {
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

      const speed = getEnemySpeed(enemy.kind);
      let speedScale = 1;
      if (enemy.intent === 'windup') {
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

    if (enemy.isBoss) {
      this.spawnBossShockwave(enemy);
    }
  }

  private damagePlayer(player: PlayerSimState, amount: number, origin: Vector2D, knockbackOverride?: number): void {
    if (player.invulnerableTimer > 0) {
      return;
    }
    player.health = Math.max(0, player.health - amount);
    player.hurtTimer = Math.max(player.hurtTimer, PLAYER_HURT_FLASH_TIME);
    player.invulnerableTimer = Math.max(player.invulnerableTimer, PLAYER_INVULNERABILITY_TIME);

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
      isBoss: false
    };
  }

  private recycleEnemy(enemy: EnemySimState): void {
    enemy.id = '';
    enemy.targetPlayerId = null;
    enemy.isBoss = false;
    this.enemyPool.push(enemy);
  }

  private firePrimary(player: PlayerSimState): void {
    const angle = player.input.aimDirection;
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
      for (const player of this.players.values()) {
        const dx = player.position.x - drop.position.x;
        const dy = player.position.y - drop.position.y;
        if (dx * dx + dy * dy <= (TILE_SIZE * 0.6) ** 2) {
          this.grantExperience(player, drop.amount);
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
    const taken = new Set(player.augments);
    const allowDuplicates = taken.size >= AUGMENT_POOL.length - 1;
    const desired = player.psychicLevel <= 2 ? Math.min(2, AUGMENT_POOL.length) : Math.min(3, AUGMENT_POOL.length);
    const options: AugmentId[] = [];
    for (const id of pool) {
      if (!taken.has(id) || allowDuplicates) {
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
      default:
        assertNever(augmentId as never);
    }

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
  const events = world.drainEvents();
  for (const event of events) {
    if (event.type === 'broadcast') {
      broadcast(event.message);
    } else {
      sendToPlayerId(event.targetId, event.message);
    }
  }
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

    case 'choose-augment': {
      if (!context.hasJoined) {
        return;
      }
      world.chooseAugment(context.id, message.offerId, message.augmentId);
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
    case 'raccoon':
      return 70;
    case 'coyote':
      return 65;
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
