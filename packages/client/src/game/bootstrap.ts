import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import type { EnemyKind, EnemyState, LevelData, PlayerState, WorldSnapshot } from '@farsight/shared';
import { PLAYER_HURT_FLASH_TIME, PROJECTILE_LIFETIME, TILE_SIZE, TICK_RATE } from '@farsight/shared';
import { InputController } from './input';
import { GameNetwork } from './network';
import { createHud } from './hud';
import { createDebugOverlay } from './debugOverlay';
import { getServerUrl } from '../config';

const DESIGN_WORLD_UNITS = 480;
const PLAYER_HEIGHT = 2;
const PLAYER_COLORS = [0xfef08a, 0x38bdf8, 0xf97316, 0xf9a8d4];
const INPUT_RATE_MS = 50;
const ENEMY_COLORS: Record<EnemyKind, number> = {
  fox: 0xf97316,
  hawk: 0x93c5fd,
  snake: 0x4ade80
};
const PLAYER_TEXTURE = createChickenTexture();
const ENEMY_TEXTURES = createEnemyTextures();
const PROJECTILE_TRAIL_LENGTH = 12;
const IMPACT_COLOR = 0x8ecaff;

export async function bootstrapGame(): Promise<void> {
  const mountNode = ensureMountNode();
  const renderer = new WebGLRenderer({ antialias: false, alpha: true });
  renderer.setClearColor(new Color(0x0a1019));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mountNode.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = createCamera(new Vector2(window.innerWidth, window.innerHeight));
  const worldRenderer = new WorldRenderer(scene);
  const hud = createHud(mountNode);
  const debug = createDebugOverlay(mountNode);

  handleResize(renderer, camera);

  const pointerWorld = new Vector2();
  let inputInterval: number | null = null;
  let serverTickRate = TICK_RATE;
  let lastSnapshotTick = 0;
  let lastSnapshotTime = 0;
  let snapshotRateSmooth = TICK_RATE;
  let fpsSmooth = 60;
  const inputController = new InputController(() => {
    const local = worldRenderer.getLocalPlayerPosition();
    if (!local) {
      return 0;
    }
    return Math.atan2(pointerWorld.y - local.y, pointerWorld.x - local.x);
  });

  window.addEventListener('pointermove', (event) => {
    updatePointerWorld(event, renderer, camera, pointerWorld);
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  const network = new GameNetwork();
  const detachPing = network.onPing((latency) => {
    debug.updateNetworkStats({ pingMs: latency });
  });
  network.onSnapshot((snapshot) => {
    const now = performance.now();
    if (lastSnapshotTime > 0 && serverTickRate > 0) {
      const tickDelta = snapshot.tick - lastSnapshotTick;
      const elapsedMs = now - lastSnapshotTime;
      const expectedMs = (tickDelta / serverTickRate) * 1000;
      const driftMs = elapsedMs - expectedMs;
      const arrivalHz = elapsedMs > 0 ? (tickDelta / elapsedMs) * 1000 : serverTickRate;
      snapshotRateSmooth = MathUtils.lerp(snapshotRateSmooth, arrivalHz, 0.2);
      debug.updateNetworkStats({ tickDriftMs: driftMs, snapshotsPerSecond: snapshotRateSmooth });
    }
    lastSnapshotTime = now;
    lastSnapshotTick = snapshot.tick;

    worldRenderer.applySnapshot(snapshot);
    hud.update(snapshot, network.getPlayerId());
  });
  network.onDisconnect(() => {
    if (inputInterval !== null) {
      window.clearInterval(inputInterval);
      inputInterval = null;
    }
    hud.update(emptySnapshot, null);
    debug.updateNetworkStats({ pingMs: Number.NaN, tickDriftMs: Number.NaN, snapshotsPerSecond: Number.NaN });
    console.warn('Disconnected from server');
  });

  const serverUrl = getServerUrl();
  const displayName = createDisplayName();

  try {
    const welcome = await network.connect(serverUrl, displayName);
    worldRenderer.applyLevel(welcome.level);
    worldRenderer.setLocalPlayerId(welcome.playerId);
    serverTickRate = welcome.tickRate;
    snapshotRateSmooth = welcome.tickRate;
    console.info(`Connected to server as ${welcome.playerId}`);
  } catch (error) {
    console.error('Failed to connect to game server', error);
    detachPing();
    inputController.dispose();
    network.dispose();
    hud.dispose();
    debug.dispose();
    return;
  }

  inputInterval = window.setInterval(() => {
    network.sendInput(inputController.getSnapshot());
  }, INPUT_RATE_MS);

  let lastTime = performance.now();
  const renderLoop = (time: number) => {
    const deltaSeconds = Math.min((time - lastTime) / 1000, 0.25);
    lastTime = time;

    worldRenderer.update(deltaSeconds);
    followCamera(camera, worldRenderer, deltaSeconds);

    if (deltaSeconds > 0) {
      const fpsInstant = 1 / deltaSeconds;
      fpsSmooth = MathUtils.lerp(fpsSmooth, fpsInstant, 0.1);
      debug.updateRenderStats(fpsSmooth);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(renderLoop);
  };
  requestAnimationFrame(renderLoop);

  window.addEventListener('beforeunload', () => {
    if (inputInterval !== null) {
      window.clearInterval(inputInterval);
      inputInterval = null;
    }
    inputController.dispose();
    network.dispose();
    hud.dispose();
    detachPing();
    debug.dispose();
  });
}

const emptySnapshot: WorldSnapshot = {
  tick: 0,
  players: [],
  enemies: [],
  projectiles: [],
  xpDrops: []
};

function ensureMountNode(): HTMLElement {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Mount node with id="app" not found');
  }
  return container;
}

function createCamera(viewport: Vector2): OrthographicCamera {
  const aspect = viewport.x / viewport.y;
  const halfHeight = DESIGN_WORLD_UNITS / 2;
  const halfWidth = halfHeight * aspect;
  const camera = new OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 2000);
  camera.position.set(0, 520, 0);
  camera.lookAt(0, 0, 0);
  return camera;
}

function handleResize(renderer: WebGLRenderer, camera: OrthographicCamera): void {
  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);

    const aspect = width / height;
    const halfHeight = DESIGN_WORLD_UNITS / 2;
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };

  window.addEventListener('resize', resize);
  resize();
}

function updatePointerWorld(
  event: PointerEvent,
  renderer: WebGLRenderer,
  camera: OrthographicCamera,
  out: Vector2
): void {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

  const ndc = new Vector3(ndcX, ndcY, 0);
  ndc.unproject(camera);
  out.set(ndc.x, ndc.z);
}

function followCamera(camera: OrthographicCamera, world: WorldRenderer, deltaSeconds: number): void {
  const target = world.getLocalPlayerPosition();
  if (!target) {
    return;
  }
  const smooth = Math.min(1, deltaSeconds * 3);
  camera.position.x = MathUtils.lerp(camera.position.x, target.x, smooth);
  camera.position.z = MathUtils.lerp(camera.position.z, target.y, smooth);
  camera.lookAt(camera.position.x, 0, camera.position.z);
}

function createDisplayName(): string {
  const adjectives = ['Brave', 'Mystic', 'Swift', 'Cosmic'];
  const noun = 'Chicken';
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const number = Math.floor(Math.random() * 900 + 100);
  return `${adjective}${noun}${number}`;
}

class WorldRenderer {
  private readonly sceneGroup = new Group();
  private readonly players = new Map<string, PlayerAvatar>();
  private readonly enemies = new Map<string, EnemyAvatar>();
  private readonly projectiles = new Map<string, ProjectileAvatar>();
  private readonly xpDrops = new Map<string, XpOrb>();
  private readonly levelRenderer = new LevelRenderer();
  private readonly projectileGroup = new Group();
  private readonly xpGroup = new Group();
  private readonly impactSystem = new ImpactSystem();
  private readonly decor = new DecorRenderer();
  private localPlayerId: string | null = null;

  constructor(scene: Scene) {
    scene.add(this.decor.group);
    scene.add(this.sceneGroup);
    this.sceneGroup.add(this.levelRenderer.group);
    this.sceneGroup.add(this.projectileGroup);
    this.sceneGroup.add(this.xpGroup);
    this.sceneGroup.add(this.impactSystem.group);
  }

  applyLevel(level: LevelData): void {
    this.decor.applyLevel(level);
    this.levelRenderer.applyLevel(level);
    this.clearTransients();
    this.impactSystem.clear();
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
    for (const avatar of this.players.values()) {
      avatar.setIsLocal(avatar.id === id);
    }
  }

  applySnapshot(snapshot: WorldSnapshot): void {
    const seenPlayers = new Set<string>();
    const seenEnemies = new Set<string>();
    const seenProjectiles = new Set<string>();
    const seenXp = new Set<string>();
    const targetedCounts = new Map<string, number>();

    for (const player of snapshot.players) {
      let avatar = this.players.get(player.id);
      if (!avatar) {
        avatar = new PlayerAvatar(player.id, player.id === this.localPlayerId);
        this.players.set(player.id, avatar);
        this.sceneGroup.add(avatar.mesh);
      }
      avatar.setState(player);
      seenPlayers.add(player.id);
    }

    for (const enemy of snapshot.enemies) {
      let avatar = this.enemies.get(enemy.id);
      if (!avatar) {
        avatar = new EnemyAvatar(enemy.id, enemy.kind);
        this.enemies.set(enemy.id, avatar);
        this.sceneGroup.add(avatar.mesh);
      }
      avatar.setState(enemy);
      seenEnemies.add(enemy.id);
      if (enemy.targetPlayerId && enemy.intent === 'windup') {
        targetedCounts.set(enemy.targetPlayerId, (targetedCounts.get(enemy.targetPlayerId) ?? 0) + 1);
      }
    }

    for (const projectile of snapshot.projectiles) {
      let avatar = this.projectiles.get(projectile.id);
      if (!avatar) {
        avatar = new ProjectileAvatar(projectile.id, this.projectileGroup);
        this.projectiles.set(projectile.id, avatar);
      }
      avatar.setState(
        projectile.position.x,
        projectile.position.y,
        projectile.velocity.x,
        projectile.velocity.y,
        projectile.ttl
      );
      seenProjectiles.add(projectile.id);
    }

    for (const drop of snapshot.xpDrops) {
      let orb = this.xpDrops.get(drop.id);
      if (!orb) {
        orb = new XpOrb(drop.id, this.xpGroup);
        this.xpDrops.set(drop.id, orb);
      }
      orb.setState(drop.position.x, drop.position.y, drop.amount, drop.age);
      seenXp.add(drop.id);
    }

    for (const [id, avatar] of this.players.entries()) {
      avatar.setTargeted((targetedCounts.get(id) ?? 0) > 0);
    }

    for (const [id, avatar] of this.players.entries()) {
      if (!seenPlayers.has(id)) {
        this.sceneGroup.remove(avatar.mesh);
        this.players.delete(id);
      }
    }

    for (const [id, avatar] of this.enemies.entries()) {
      if (!seenEnemies.has(id)) {
        this.sceneGroup.remove(avatar.mesh);
        this.enemies.delete(id);
      }
    }

    for (const [id, avatar] of this.projectiles.entries()) {
      if (!seenProjectiles.has(id)) {
        if (avatar.shouldSpawnImpact()) {
          const impactPosition = avatar.getPosition();
          this.impactSystem.spawn(impactPosition.x, impactPosition.y, IMPACT_COLOR);
        }
        avatar.dispose();
        this.projectiles.delete(id);
      }
    }

    for (const [id, orb] of this.xpDrops.entries()) {
      if (!seenXp.has(id)) {
        this.xpGroup.remove(orb.mesh);
        orb.dispose();
        this.xpDrops.delete(id);
      }
    }
  }

  update(deltaSeconds: number): void {
    this.decor.update(deltaSeconds);
    for (const avatar of this.players.values()) {
      avatar.update(deltaSeconds);
    }
    for (const avatar of this.enemies.values()) {
      avatar.update(deltaSeconds);
    }
    for (const avatar of this.projectiles.values()) {
      avatar.update(deltaSeconds);
    }
    for (const orb of this.xpDrops.values()) {
      orb.update(deltaSeconds);
    }
    this.impactSystem.update(deltaSeconds);
  }

  getLocalPlayerPosition(): Vector2 | null {
    if (!this.localPlayerId) {
      return null;
    }
    const avatar = this.players.get(this.localPlayerId);
    if (!avatar) {
      return null;
    }
    return avatar.getPosition();
  }

  private clearTransients(): void {
    for (const avatar of this.projectiles.values()) {
      avatar.dispose();
    }
    this.projectiles.clear();

    for (const orb of this.xpDrops.values()) {
      this.xpGroup.remove(orb.mesh);
      orb.dispose();
    }
    this.xpDrops.clear();
    this.impactSystem.clear();
  }
}

class DecorRenderer {
  readonly group = new Group();
  private backdrop: Mesh | null = null;
  private spawnGlow: Mesh | null = null;
  private particles: Points | null = null;
  private time = 0;

  applyLevel(level: LevelData): void {
    this.clear();

    const worldWidth = level.width * TILE_SIZE;
    const worldHeight = level.height * TILE_SIZE;

    const backdropGeometry = new PlaneGeometry(worldWidth + 360, worldHeight + 360);
    backdropGeometry.rotateX(-Math.PI / 2);
    const backdropTexture = createRadialTexture('#0a111f', '#111a2d', '#04070d');
    const backdropMaterial = new MeshBasicMaterial({ map: backdropTexture, transparent: true, opacity: 0.96 });
    this.backdrop = new Mesh(backdropGeometry, backdropMaterial);
    this.backdrop.position.y = -4;
    this.group.add(this.backdrop);

    const glowDiameter = Math.max(worldWidth, worldHeight) * 0.72;
    const glowGeometry = new PlaneGeometry(glowDiameter, glowDiameter);
    glowGeometry.rotateX(-Math.PI / 2);
    const glowTexture = createRadialTexture('rgba(255,255,255,0.35)', 'rgba(56,189,248,0.18)', 'rgba(15,23,42,0)');
    const glowMaterial = new MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.4
    });
    this.spawnGlow = new Mesh(glowGeometry, glowMaterial);
    this.spawnGlow.position.y = 0.5;
    this.group.add(this.spawnGlow);

    const particleCount = 180;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * (worldWidth + 320);
      positions[i * 3 + 1] = Math.random() * 18 + 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * (worldHeight + 320);
    }
    const particleGeometry = new BufferGeometry();
    particleGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const particleMaterial = new PointsMaterial({
      color: 0x93c5fd,
      size: 6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      sizeAttenuation: false,
      blending: AdditiveBlending
    });
    this.particles = new Points(particleGeometry, particleMaterial);
    this.group.add(this.particles);

    this.time = 0;
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    if (this.spawnGlow) {
      const material = this.spawnGlow.material as MeshBasicMaterial;
      const scale = 1 + Math.sin(this.time * 2.4) * 0.05;
      this.spawnGlow.scale.set(scale, scale, scale);
      material.opacity = 0.35 + Math.sin(this.time * 3.1) * 0.07;
      material.needsUpdate = true;
    }
    if (this.particles) {
      this.particles.rotation.y += deltaSeconds * 0.08;
      const material = this.particles.material as PointsMaterial;
      material.size = 5 + Math.sin(this.time * 1.7) * 1.5;
      material.needsUpdate = true;
    }
  }

  private clear(): void {
    if (this.backdrop) {
      this.group.remove(this.backdrop);
      this.backdrop.geometry.dispose();
      const material = this.backdrop.material as MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.backdrop = null;
    }
    if (this.spawnGlow) {
      this.group.remove(this.spawnGlow);
      this.spawnGlow.geometry.dispose();
      const material = this.spawnGlow.material as MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.spawnGlow = null;
    }
    if (this.particles) {
      this.group.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as PointsMaterial).dispose();
      this.particles = null;
    }
  }
}

class LevelRenderer {
  readonly group = new Group();
  private meshes: InstancedMesh[] = [];

  applyLevel(level: LevelData): void {
    this.clear();

    if (level.tiles.length === 0) {
      return;
    }

    const counts = countTiles(level);

    const floorGeometry = createTileGeometry();
    const wallGeometry = createTileGeometry();

    const floorMaterial = new MeshBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.92 });
    const spawnMaterial = new MeshBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.95 });
    const wallMaterial = new MeshBasicMaterial({ color: 0x0b1120, transparent: true, opacity: 0.88 });

    const floorMesh = new InstancedMesh(floorGeometry, floorMaterial, Math.max(1, counts.floor + counts.spawn));
    let spawnMesh: InstancedMesh | null = null;
    if (counts.spawn > 0) {
      spawnMesh = new InstancedMesh(createTileGeometry(), spawnMaterial, counts.spawn);
    }
    let wallMesh: InstancedMesh | null = null;
    if (counts.wall > 0) {
      wallMesh = new InstancedMesh(wallGeometry, wallMaterial, counts.wall);
    }

    const matrix = new Matrix4();
    let floorIndex = 0;
    let spawnIndex = 0;
    let wallIndex = 0;

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y * level.width + x];
        const worldX = tileToWorldX(x, level);
        const worldZ = tileToWorldZ(y, level);
        matrix.makeTranslation(worldX, 0, worldZ);

        if (tile === 'wall') {
          if (wallMesh) {
            wallMesh.setMatrixAt(wallIndex, matrix);
            wallIndex += 1;
          }
          continue;
        }

        floorMesh.setMatrixAt(floorIndex, matrix);
        floorIndex += 1;

        if (tile === 'spawn' && spawnMesh) {
          spawnMesh.setMatrixAt(spawnIndex, matrix);
          spawnIndex += 1;
        }
      }
    }

    floorMesh.count = Math.max(1, floorIndex);
    floorMesh.instanceMatrix.needsUpdate = true;

    if (spawnMesh) {
      spawnMesh.count = Math.max(1, spawnIndex);
      spawnMesh.instanceMatrix.needsUpdate = true;
    }

    if (wallMesh) {
      wallMesh.count = Math.max(1, wallIndex);
      wallMesh.instanceMatrix.needsUpdate = true;
    }

    this.group.add(floorMesh);
    this.meshes.push(floorMesh);
    if (spawnMesh) {
      this.group.add(spawnMesh);
      this.meshes.push(spawnMesh);
    }
    if (wallMesh) {
      this.group.add(wallMesh);
      this.meshes.push(wallMesh);
    }
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
      mesh.dispose();
    }
    this.meshes = [];
  }
}

class PlayerAvatar {
  readonly mesh: Group;
  readonly id: string;
  private readonly body: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private readonly baseColor = new Color();
  private readonly hurtColor = new Color(0xff4d6d);
  private readonly tempColor = new Color();
  private readonly reticle: Mesh;
  private readonly reticleMaterial: MeshBasicMaterial;
  private readonly reticleBaseScale: number;
  private currentFacing = 0;
  private targetFacing = 0;
  private hurtTimer = 0;
  private invulnerableTimer = 0;
  private time = 0;
  private targeted = false;
  private isLocal = false;
  private displayName = '';
  private initialized = false;

  constructor(id: string, isLocal: boolean) {
    this.id = id;
    this.mesh = new Group();
    this.mesh.renderOrder = 4;

    const geometry = new PlaneGeometry(18, 24);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: pickColor(id, isLocal),
      map: PLAYER_TEXTURE,
      transparent: true,
      toneMapped: false
    });
    this.material.depthWrite = false;

    this.body = new Mesh(geometry, this.material);
    this.body.position.y = PLAYER_HEIGHT;
    this.body.renderOrder = 4;
    this.mesh.add(this.body);

    const reticleGeometry = new PlaneGeometry(1, 1);
    reticleGeometry.rotateX(-Math.PI / 2);
    this.reticleMaterial = new MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.reticle = new Mesh(reticleGeometry, this.reticleMaterial);
    this.reticle.position.y = 0.2;
    this.reticle.visible = false;
    this.reticleBaseScale = TILE_SIZE * 0.85;
    this.reticle.scale.setScalar(this.reticleBaseScale);
    this.mesh.add(this.reticle);

    this.baseColor.setHex(pickColor(id, isLocal));
    this.isLocal = isLocal;
  }

  setState(state: PlayerState): void {
    this.displayName = state.displayName;
    this.targetPosition.set(state.position.x, state.position.y);
    this.targetFacing = state.facing;
    this.hurtTimer = Math.max(this.hurtTimer, state.hurtTimer);
    this.invulnerableTimer = Math.max(this.invulnerableTimer, state.invulnerableTimer);
    if (!this.initialized) {
      this.currentPosition.set(state.position.x, state.position.y);
      this.currentFacing = state.facing;
      this.mesh.position.set(state.position.x, 0, state.position.y);
      this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;
      this.initialized = true;
    }
  }

  setIsLocal(isLocal: boolean): void {
    this.isLocal = isLocal;
    this.baseColor.setHex(pickColor(this.id, isLocal));
    this.material.color.copy(this.baseColor);
  }

  setTargeted(value: boolean): void {
    this.targeted = value;
    if (value) {
      this.reticle.visible = true;
    }
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * 10);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);
    this.hurtTimer = Math.max(0, this.hurtTimer - deltaSeconds);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaSeconds);

    this.mesh.position.set(this.currentPosition.x, 0, this.currentPosition.y);
    this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;

    const hurtRatio = PLAYER_HURT_FLASH_TIME > 0 ? Math.min(1, this.hurtTimer / PLAYER_HURT_FLASH_TIME) : 0;
    this.tempColor.copy(this.baseColor);
    if (hurtRatio > 0) {
      const intensity = 0.5 + 0.25 * Math.sin(this.time * 24);
      this.tempColor.lerp(this.hurtColor, Math.min(1, hurtRatio * intensity));
    }
    this.material.color.copy(this.tempColor);

    if (this.invulnerableTimer > 0) {
      const flicker = Math.floor(this.time * 16) % 2 === 0 ? 0.4 : -0.2;
      this.material.opacity = Math.min(1, 0.75 + flicker * 0.5);
    } else {
      this.material.opacity = 1;
    }

    if (this.targeted) {
      const pulse = 1 + Math.sin(this.time * 8) * 0.12;
      this.reticle.scale.setScalar(this.reticleBaseScale * pulse);
      this.reticleMaterial.opacity = Math.min(1, 0.25 + (this.isLocal ? 0.35 : 0.2));
    } else if (this.reticle.visible) {
      this.reticleMaterial.opacity = Math.max(0, this.reticleMaterial.opacity - deltaSeconds * 3);
      this.reticle.scale.setScalar(this.reticleBaseScale);
      if (this.reticleMaterial.opacity <= 0.02) {
        this.reticle.visible = false;
      }
    }
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }
}

class EnemyAvatar {
  readonly mesh: Group;
  readonly id: string;
  private readonly body: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly telegraph: Mesh;
  private readonly telegraphMaterial: MeshBasicMaterial;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private currentFacing = 0;
  private targetFacing = 0;
  private intent: EnemyState['intent'] = 'idle';
  private displayIntentTimer = 0;
  private displayIntentDuration = 0;
  private attackRange = TILE_SIZE;
  private time = 0;
  private initialized = false;

  constructor(id: string, kind: EnemyKind) {
    this.id = id;
    this.mesh = new Group();
    this.mesh.renderOrder = 2;

    const bodyGeometry = new PlaneGeometry(20, 20);
    bodyGeometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: ENEMY_COLORS[kind],
      map: ENEMY_TEXTURES[kind],
      transparent: true,
      opacity: 0.95,
      toneMapped: false
    });
    this.material.depthWrite = false;
    this.body = new Mesh(bodyGeometry, this.material);
    this.body.position.y = PLAYER_HEIGHT * 0.8;
    this.body.renderOrder = 2;
    this.mesh.add(this.body);

    const telegraphGeometry = new PlaneGeometry(1, 1);
    telegraphGeometry.rotateX(-Math.PI / 2);
    const telegraphTexture = createRadialTexture('rgba(255,255,255,0.2)', 'rgba(248,113,113,0.42)', 'rgba(248,113,113,0)');
    this.telegraphMaterial = new MeshBasicMaterial({
      map: telegraphTexture,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.telegraph = new Mesh(telegraphGeometry, this.telegraphMaterial);
    this.telegraph.position.y = 0.15;
    this.telegraph.visible = false;
    this.mesh.add(this.telegraph);
  }

  setState(state: EnemyState): void {
    this.targetPosition.set(state.position.x, state.position.y);
    if (Math.abs(state.velocity.x) > 0.01 || Math.abs(state.velocity.y) > 0.01) {
      this.targetFacing = Math.atan2(state.velocity.y, state.velocity.x);
    }
    this.intent = state.intent;
    this.displayIntentDuration = state.intentDuration;
    this.displayIntentTimer = state.intentTimer;
    this.attackRange = state.attackRange;
    if (!this.initialized) {
      this.currentPosition.set(state.position.x, state.position.y);
      this.mesh.position.set(state.position.x, 0, state.position.y);
      this.currentFacing = this.targetFacing;
      this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;
      this.initialized = true;
    }
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * 6);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);

    this.mesh.position.set(this.currentPosition.x, 0, this.currentPosition.y);
    this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;

    this.updateTelegraph(deltaSeconds);
  }

  private updateTelegraph(deltaSeconds: number): void {
    const diameter = Math.max(24, this.attackRange * 2);
    if (this.intent === 'windup') {
      this.displayIntentTimer = Math.max(0, this.displayIntentTimer - deltaSeconds);
      const progress = this.displayIntentDuration > 0 ? 1 - this.displayIntentTimer / this.displayIntentDuration : 1;
      const pulse = 1 + Math.sin((progress + this.time) * Math.PI * 2) * 0.08;
      this.telegraph.visible = true;
      this.telegraph.scale.setScalar(diameter * pulse);
      this.telegraphMaterial.opacity = Math.min(0.9, 0.25 + progress * 0.55);
    } else if (this.intent === 'recover') {
      this.telegraph.visible = true;
      this.telegraph.scale.setScalar(diameter);
      this.telegraphMaterial.opacity = Math.max(0, this.telegraphMaterial.opacity - deltaSeconds * 1.6);
      if (this.telegraphMaterial.opacity <= 0.02) {
        this.telegraph.visible = false;
      }
    } else if (this.telegraph.visible) {
      this.telegraphMaterial.opacity = Math.max(0, this.telegraphMaterial.opacity - deltaSeconds * 2.2);
      this.telegraph.scale.setScalar(diameter);
      if (this.telegraphMaterial.opacity <= 0.02) {
        this.telegraph.visible = false;
      }
    }
  }
}

class ProjectileAvatar {
  readonly mesh: Mesh;
  readonly id: string;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private currentFacing = 0;
  private targetFacing = 0;
  private readonly material: MeshBasicMaterial;
  private displayTtl = PROJECTILE_LIFETIME;
  private initialized = false;
  private readonly parent: Group;
  private readonly trailGeometry: BufferGeometry;
  private readonly trailMaterial: LineBasicMaterial;
  private readonly trail: Line;
  private readonly history: Vector2[] = [];
  private serverTtl = PROJECTILE_LIFETIME;

  constructor(id: string, parent: Group) {
    this.id = id;
    this.parent = parent;
    const geometry = new PlaneGeometry(12, 12);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.position.y = PLAYER_HEIGHT * 0.9;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);

    this.trailGeometry = new BufferGeometry();
    const positions = new Float32Array(PROJECTILE_TRAIL_LENGTH * 3);
    this.trailGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.trailGeometry.setDrawRange(0, 0);
    this.trailMaterial = new LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.trail = new Line(this.trailGeometry, this.trailMaterial);
    this.trail.renderOrder = 2;
    parent.add(this.trail);
  }

  setState(x: number, y: number, vx: number, vy: number, ttl: number): void {
    this.targetPosition.set(x, y);
    if (!this.initialized) {
      this.currentPosition.set(x, y);
      this.initialized = true;
    }
    if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
      this.targetFacing = Math.atan2(vy, vx);
    }
    this.displayTtl = ttl;
    this.serverTtl = ttl;
  }

  update(deltaSeconds: number): void {
    const lerpFactor = Math.min(1, deltaSeconds * 18);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);
    this.displayTtl = Math.max(0, this.displayTtl - deltaSeconds);

    const lifeRatio = Math.max(0, Math.min(1, this.displayTtl / PROJECTILE_LIFETIME));
    this.material.opacity = 0.35 + (1 - lifeRatio) * 0.6;
    const scale = 0.85 + (1 - lifeRatio) * 0.3;
    this.mesh.scale.set(scale, scale, scale);

    this.mesh.position.set(this.currentPosition.x, PLAYER_HEIGHT * 0.9, this.currentPosition.y);
    this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;

    // Trail history (store most recent positions)
    const latest = this.history[this.history.length - 1];
    if (!latest || latest.distanceToSquared(this.currentPosition) > 4) {
      this.history.push(this.currentPosition.clone());
    } else {
      latest.copy(this.currentPosition);
    }
    while (this.history.length > PROJECTILE_TRAIL_LENGTH) {
      this.history.shift();
    }

    const drawCount = Math.min(this.history.length, PROJECTILE_TRAIL_LENGTH);
    const positions = this.trailGeometry.getAttribute('position') as Float32BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i < PROJECTILE_TRAIL_LENGTH; i += 1) {
      const point = this.history[this.history.length - 1 - i];
      const idx = i * 3;
      if (point) {
        array[idx] = point.x;
        array[idx + 1] = PLAYER_HEIGHT * 0.6;
        array[idx + 2] = point.y;
      } else {
        array[idx] = this.currentPosition.x;
        array[idx + 1] = PLAYER_HEIGHT * 0.6;
        array[idx + 2] = this.currentPosition.y;
      }
    }
    positions.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, Math.max(2, drawCount));
    this.trail.visible = drawCount > 1;
    this.trailMaterial.opacity = 0.2 + Math.min(0.5, drawCount / PROJECTILE_TRAIL_LENGTH);
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.parent.remove(this.trail);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.trailGeometry.dispose();
    this.trailMaterial.dispose();
    this.history.length = 0;
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }

  shouldSpawnImpact(): boolean {
    return this.serverTtl > 0.08;
  }
}

class ImpactSystem {
  readonly group = new Group();
  private readonly pool: Mesh[] = [];
  private readonly active: Mesh[] = [];
  private readonly geometry: PlaneGeometry;
  private readonly baseTexture: CanvasTexture;

  constructor() {
    this.geometry = new PlaneGeometry(18, 18);
    this.geometry.rotateX(-Math.PI / 2);
    this.baseTexture = createRadialTexture('rgba(255,255,255,0.9)', 'rgba(144,205,244,0.35)', 'rgba(13,23,42,0)');
  }

  spawn(x: number, y: number, color: number): void {
    const mesh = this.pool.pop() ?? this.createImpactMesh();
    const material = mesh.material as MeshBasicMaterial;
    material.color.setHex(color);
    material.opacity = 0.8;
    mesh.position.set(x, 1.4, y);
    mesh.scale.setScalar(0.4);
    mesh.userData.remaining = 0.28;
    mesh.userData.initial = 0.28;
    this.group.add(mesh);
    this.active.push(mesh);
  }

  update(deltaSeconds: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const mesh = this.active[i];
      mesh.userData.remaining -= deltaSeconds;
      const remaining: number = mesh.userData.remaining;
      const initial: number = mesh.userData.initial;
      if (remaining <= 0) {
        this.recycle(i);
        continue;
      }
      const ratio = Math.max(0, Math.min(1, remaining / initial));
      const scale = 0.5 + (1 - ratio) * 1.8;
      mesh.scale.setScalar(scale);
      (mesh.material as MeshBasicMaterial).opacity = 0.15 + ratio * 0.65;
    }
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      this.recycle(i);
    }
  }

  private createImpactMesh(): Mesh {
    const material = new MeshBasicMaterial({
      map: this.baseTexture,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.renderOrder = 5;
    mesh.userData.remaining = 0;
    mesh.userData.initial = 0;
    return mesh;
  }

  private recycle(index: number): void {
    const mesh = this.active[index];
    this.group.remove(mesh);
    (mesh.material as MeshBasicMaterial).opacity = 0;
    this.pool.push(mesh);
    this.active.splice(index, 1);
  }
}

class XpOrb {
  readonly mesh: Mesh;
  readonly id: string;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private readonly material: MeshBasicMaterial;
  private displayAge = 0;
  private baseAmount = 0;
  private initialized = false;

  constructor(id: string, parent: Group) {
    this.id = id;
    const geometry = new PlaneGeometry(16, 16);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  setState(x: number, y: number, amount: number, age: number): void {
    this.targetPosition.set(x, y);
    if (!this.initialized) {
      this.currentPosition.set(x, y);
      this.initialized = true;
    }
    this.baseAmount = amount;
    this.displayAge = age;
  }

  update(deltaSeconds: number): void {
    const lerpFactor = Math.min(1, deltaSeconds * 6);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.displayAge += deltaSeconds;

    const bob = Math.sin(this.displayAge * 3.4) * 4 + 5;
    const scaleBase = 0.7 + Math.min(this.baseAmount / 30, 1) * 0.5;
    const scalePulse = scaleBase + Math.sin(this.displayAge * 6) * 0.1;
    this.mesh.position.set(this.currentPosition.x, bob, this.currentPosition.y);
    this.mesh.scale.set(scalePulse, scalePulse, scalePulse);

    this.material.opacity = 0.45 + Math.sin(this.displayAge * 5.5) * 0.12;
    this.material.color.setHex(this.baseAmount >= 18 ? 0xfacc15 : 0xfde68a);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

function createChickenTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create chicken texture context');
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);

  const centerX = size / 2;
  const centerY = size / 2 + 6;

  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, size * 0.22, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(centerX - 6, centerY + 2, size * 0.14, size * 0.18, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f87171';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - size * 0.32);
  ctx.lineTo(centerX + size * 0.08, centerY - size * 0.18);
  ctx.lineTo(centerX - size * 0.08, centerY - size * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(centerX + size * 0.05, centerY - size * 0.1, size * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, size * 0.24, size * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createEnemyTextures(): Record<EnemyKind, CanvasTexture> {
  return {
    fox: createEnemyTexture('#fb923c', '#fde68a'),
    hawk: createEnemyTexture('#bfdbfe', '#f8fafc'),
    snake: createEnemyTexture('#4ade80', '#bbf7d0')
  };
}

function createEnemyTexture(baseColor: string, highlightColor: string): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create enemy texture context');
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2 + 4;

  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.25, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy - 4, size * 0.12, size * 0.16, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.27, size * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createRadialTexture(inner: string, mid: string, outer: string): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get 2D context');
  }
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.5, mid);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function pickColor(id: string, isLocal: boolean): number {
  if (isLocal) {
    return 0xfacc15;
  }
  const index = Math.abs(hashString(id)) % PLAYER_COLORS.length;
  return PLAYER_COLORS[index];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function tileToWorldX(tileX: number, level: LevelData): number {
  return (tileX + 1 - level.width / 2) * TILE_SIZE;
}

function tileToWorldZ(tileY: number, level: LevelData): number {
  return (tileY + 1 - level.height / 2) * TILE_SIZE;
}

function createTileGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(TILE_SIZE, TILE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function countTiles(level: LevelData): { floor: number; spawn: number; wall: number } {
  let floor = 0;
  let spawn = 0;
  let wall = 0;
  for (const tile of level.tiles) {
    if (tile === 'wall') {
      wall += 1;
    } else if (tile === 'spawn') {
      spawn += 1;
      floor += 1;
    } else {
      floor += 1;
    }
  }
  return { floor, spawn, wall };
}
