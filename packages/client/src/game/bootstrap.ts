import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
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
import type { EnemyKind, LevelData, WorldSnapshot } from '@farsight/shared';
import { PROJECTILE_LIFETIME, TILE_SIZE } from '@farsight/shared';
import { InputController } from './input';
import { GameNetwork } from './network';
import { createHud } from './hud';
import { getServerUrl } from '../config';

const DESIGN_WORLD_UNITS = 320;
const PLAYER_HEIGHT = 2;
const PLAYER_COLORS = [0xfef08a, 0x38bdf8, 0xf97316, 0xf9a8d4];
const INPUT_RATE_MS = 50;
const ENEMY_COLORS: Record<EnemyKind, number> = {
  fox: 0xf97316,
  hawk: 0x93c5fd,
  snake: 0x4ade80
};

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

  handleResize(renderer, camera);

  const pointerWorld = new Vector2();
  let inputInterval: number | null = null;
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
  network.onSnapshot((snapshot) => {
    worldRenderer.applySnapshot(snapshot);
    hud.update(snapshot, network.getPlayerId());
  });
  network.onDisconnect(() => {
    if (inputInterval !== null) {
      window.clearInterval(inputInterval);
      inputInterval = null;
    }
    hud.update(emptySnapshot, null);
    console.warn('Disconnected from server');
  });

  const serverUrl = getServerUrl();
  const displayName = createDisplayName();

  try {
    const welcome = await network.connect(serverUrl, displayName);
    worldRenderer.applyLevel(welcome.level);
    worldRenderer.setLocalPlayerId(welcome.playerId);
    console.info(`Connected to server as ${welcome.playerId}`);
  } catch (error) {
    console.error('Failed to connect to game server', error);
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
  camera.position.set(0, 360, 0);
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
  private readonly decor = new DecorRenderer();
  private localPlayerId: string | null = null;

  constructor(scene: Scene) {
    scene.add(this.decor.group);
    scene.add(this.sceneGroup);
    this.sceneGroup.add(this.levelRenderer.group);
    this.sceneGroup.add(this.projectileGroup);
    this.sceneGroup.add(this.xpGroup);
  }

  applyLevel(level: LevelData): void {
    this.decor.applyLevel(level);
    this.levelRenderer.applyLevel(level);
    this.clearTransients();
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

    for (const player of snapshot.players) {
      let avatar = this.players.get(player.id);
      if (!avatar) {
        avatar = new PlayerAvatar(player.id, player.id === this.localPlayerId);
        this.players.set(player.id, avatar);
        this.sceneGroup.add(avatar.mesh);
      }
      avatar.setDisplayName(player.displayName);
      avatar.setTarget(player.position.x, player.position.y, player.facing);
      seenPlayers.add(player.id);
    }

    for (const enemy of snapshot.enemies) {
      let avatar = this.enemies.get(enemy.id);
      if (!avatar) {
        avatar = new EnemyAvatar(enemy.id, enemy.kind);
        this.enemies.set(enemy.id, avatar);
        this.sceneGroup.add(avatar.mesh);
      }
      avatar.setTarget(enemy.position.x, enemy.position.y, enemy.velocity.x, enemy.velocity.y);
      seenEnemies.add(enemy.id);
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
        this.projectileGroup.remove(avatar.mesh);
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
      this.projectileGroup.remove(avatar.mesh);
      avatar.dispose();
    }
    this.projectiles.clear();

    for (const orb of this.xpDrops.values()) {
      this.xpGroup.remove(orb.mesh);
      orb.dispose();
    }
    this.xpDrops.clear();
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
  readonly mesh: Mesh;
  readonly id: string;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private currentFacing = 0;
  private targetFacing = 0;
  private readonly material: MeshBasicMaterial;
  private displayName = '';

  constructor(id: string, isLocal: boolean) {
    this.id = id;
    const geometry = new PlaneGeometry(18, 24);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ color: pickColor(id, isLocal), transparent: true });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.position.y = PLAYER_HEIGHT;
    this.mesh.renderOrder = 4;
    this.material.depthWrite = false;
  }

  setTarget(x: number, y: number, facing: number): void {
    this.targetPosition.set(x, y);
    this.targetFacing = facing;
  }

  setIsLocal(isLocal: boolean): void {
    this.material.color.setHex(pickColor(this.id, isLocal));
  }

  setDisplayName(name: string): void {
    this.displayName = name;
  }

  update(deltaSeconds: number): void {
    const lerpFactor = Math.min(1, deltaSeconds * 10);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);

    this.mesh.position.set(this.currentPosition.x, PLAYER_HEIGHT, this.currentPosition.y);
    this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }
}

class EnemyAvatar {
  readonly mesh: Mesh;
  readonly id: string;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private currentFacing = 0;
  private targetFacing = 0;
  private readonly material: MeshBasicMaterial;

  constructor(id: string, kind: EnemyKind) {
    this.id = id;
    const geometry = new PlaneGeometry(20, 20);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ color: ENEMY_COLORS[kind], transparent: true, opacity: 0.95 });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.position.y = PLAYER_HEIGHT * 0.8;
    this.mesh.renderOrder = 2;
    this.material.depthWrite = false;
  }

  setTarget(x: number, y: number, vx: number, vy: number): void {
    this.targetPosition.set(x, y);
    if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
      this.targetFacing = Math.atan2(vy, vx);
    }
  }

  update(deltaSeconds: number): void {
    const lerpFactor = Math.min(1, deltaSeconds * 6);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);

    this.mesh.position.set(this.currentPosition.x, PLAYER_HEIGHT * 0.8, this.currentPosition.y);
    this.mesh.rotation.y = -this.currentFacing + Math.PI / 2;
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

  constructor(id: string, parent: Group) {
    this.id = id;
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
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
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
