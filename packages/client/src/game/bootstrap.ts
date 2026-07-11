import {
  AdditiveBlending,
  BackSide,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  DoubleSide,
  TorusGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Quaternion,
  SphereGeometry,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';

import type {
  ArtifactKind,
  EnemyKind,
  EnemyState,
  LevelData,
  PlayerState,
  ProjectileFaction,
  WorldSnapshot,
  LevelUpOfferMessage,
  QuickPingKind,
  GamePhase,
  Vector2D
} from '@starbuds/shared';
import { createInitialInputState } from '@starbuds/shared';
import { ARTIFACT_TTL, PLAYER_HURT_FLASH_TIME, PROJECTILE_LIFETIME, TILE_SIZE, TICK_RATE } from '@starbuds/shared';

import { createAudioController } from './audio';
import { createDebugOverlay } from './debugOverlay';
import { createHud } from './hud';
import { InputController } from './input';
import { GameNetwork } from './network';
import { SpriteAnimator, SpriteBatch, loadSkin, type ResolvedVisual, type SpriteAtlas } from './sprites';
import { getServerUrl } from '../config';

const DESIGN_WORLD_UNITS = 480;
const PLAYER_HEIGHT = 2;
const PLAYER_COLORS = [0xfef08a, 0x38bdf8, 0xf97316, 0xf9a8d4];
const INPUT_RATE_MS = 50;
const PROJECTILE_TRAIL_LENGTH = 12;
const PROJECTILE_STYLE: Record<ProjectileFaction, { body: number; trail: number; impact: number }> = {
  player: { body: 0x38bdf8, trail: 0x60a5fa, impact: 0x8ecaff },
  enemy: { body: 0xf87171, trail: 0xfca5a5, impact: 0xfca5a5 },
  boss: { body: 0xc084fc, trail: 0xa855f7, impact: 0xe879f9 }
};
const ARTIFACT_COLORS: Record<ArtifactKind, { core: number; glow: number }> = {
  'damage-core': { core: 0xf97316, glow: 0xffedd5 },
  'haste-spur': { core: 0x38bdf8, glow: 0xdbebff },
  'ward-feather': { core: 0xfacc15, glow: 0xfef3c7 }
};
const PING_COLORS: Record<QuickPingKind, number> = {
  assist: 0x38bdf8,
  danger: 0xf87171,
  loot: 0x22c55e,
  objective: 0xfacc15
};
const XP_ORB_TIME = new Uniform(0);

export async function bootstrapGame(): Promise<void> {
  const mountNode = ensureMountNode();
  const renderer = new WebGLRenderer({ antialias: false, alpha: true });
  renderer.setClearColor(new Color(0x0a1019));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mountNode.appendChild(renderer.domElement);
  XP_ORB_TIME.value = performance.now() * 0.001;

  const scene = new Scene();
  const camera = createCamera(new Vector2(window.innerWidth, window.innerHeight));
  const atlas = await loadSkin();
  const worldRenderer = new WorldRenderer(scene, atlas);
  const network = new GameNetwork();
  const audio = createAudioController();
  const hud = createHud(mountNode, {
    onReadyChange: (ready, context) => {
      network.setReady(ready, context);
    },
    onArmoryPurchase: (itemId) => {
      network.purchaseArmoryItem(itemId);
    },
    onArmoryEquip: (itemId, slot) => {
      network.equipArmoryItem(itemId, slot);
    },
    onLaunchRun: () => {
      network.launchRun();
    },
    onSummaryAcknowledge: () => {
      network.acknowledgeSummary();
    },
    audio
  });
  const debug = createDebugOverlay(mountNode);
  debug.updateCameraMode('Top');

  const ambientLight = new AmbientLight(0x1b2536, 0.58);
  const keyLight = new DirectionalLight(0xfef9c3, 0.78);
  keyLight.position.set(160, 340, 180);
  scene.add(ambientLight);
  scene.add(keyLight);

  const unlockAudio = () => {
    audio.prime();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  handleResize(renderer, camera);

  const pointerWorld = new Vector2();
  let currentPhase: GamePhase = 'combat';
  let pointerClientX = window.innerWidth / 2;
  let pointerClientY = window.innerHeight / 2;
  let inputInterval: number | null = null;
  let serverTickRate = TICK_RATE;
  let lastSnapshotTick = 0;
  let lastSnapshotTime = 0;
  let snapshotRateSmooth = TICK_RATE;
  let fpsSmooth = 60;
  let cameraMode: 'top' | 'tilt' = 'top';
  let cameraZoom = 1;
  let zoomSequence: { remaining: number; duration: number; magnitude: number } | null = null;
  const levelUpQueue: LevelUpOfferMessage[] = [];
  let activeLevelUp: LevelUpOfferMessage | null = null;
  let awaitingAugment = false;
  let detachLevelUp: (() => void) | null = null;
  let detachAugment: (() => void) | null = null;
  let detachBoss: (() => void) | null = null;
  let pingHeld = false;

  const inputController = new InputController(() => {
    const local = worldRenderer.getLocalPlayerPosition();
    if (!local) {
      return 0;
    }
    return Math.atan2(pointerWorld.y - local.y, pointerWorld.x - local.x);
  });

  window.addEventListener('pointermove', (event) => {
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    updatePointerWorld(event, renderer, camera, pointerWorld);
    if (pingHeld) {
      hud.updatePingCursor(pointerClientX, pointerClientY);
    }
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyQ' && !event.repeat) {
      pingHeld = true;
      hud.beginPingSelection();
      hud.updatePingCursor(pointerClientX, pointerClientY);
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyV' && !event.repeat) {
      cameraMode = cameraMode === 'top' ? 'tilt' : 'top';
      debug.updateCameraMode(cameraMode === 'top' ? 'Top' : 'Tilt');
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyQ' && pingHeld) {
      pingHeld = false;
      const selection = hud.commitPingSelection();
      if (selection) {
        network.sendQuickPing(selection, { x: pointerWorld.x, y: pointerWorld.y });
      } else {
        hud.cancelPingSelection();
      }
      event.preventDefault();
    }
    if (event.code === 'Escape' && pingHeld) {
      pingHeld = false;
      hud.cancelPingSelection();
      event.preventDefault();
    }
  });

  window.addEventListener('blur', () => {
    if (pingHeld) {
      pingHeld = false;
      hud.cancelPingSelection();
    }
  });
  const triggerZoom = (magnitude: number, duration = 0.75) => {
    zoomSequence = { remaining: duration, duration, magnitude };
  };
  const presentNextOffer = (): boolean => {
    if (awaitingAugment || activeLevelUp || levelUpQueue.length === 0) {
      return false;
    }
    const offer = levelUpQueue.shift();
    if (!offer) {
      return false;
    }
    activeLevelUp = offer;
    hud.presentLevelUp(
      { offerId: offer.offerId, level: offer.level, options: offer.options },
      (augmentId) => {
        if (!activeLevelUp || awaitingAugment) {
          return;
        }
        awaitingAugment = true;
        hud.lockLevelUp();
        network.chooseAugment(offer.offerId, augmentId);
      }
    );
    triggerZoom(0.18, 0.65);
    return true;
  };
  const detachPing = network.onPing((latency) => {
    debug.updateNetworkStats({ pingMs: latency });
  });
  const detachQuickPing = network.onPingEvent((message) => {
    const isLocal = message.playerId === network.getPlayerId();
    hud.showPingAlert(message, isLocal);
    worldRenderer.spawnPing(message.position.x, message.position.y, message.kind, isLocal);
  });
  const detachArmory = network.onArmoryState((state) => {
    currentPhase = state.phase;
    hud.updateArmory(state, network.getPlayerId());
    worldRenderer.setPlayerCosmetics(state.players);
    inputController.setEnabled(currentPhase === 'combat');
    audio.setPhase(currentPhase);
    if (currentPhase !== 'combat') {
      zoomSequence = null;
      cameraZoom = 1;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    }
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
    const playerCount = Math.max(1, snapshot.players.length);
    const intensity = Math.min(1, snapshot.enemies.length / (playerCount * 8));
    audio.setIntensity(intensity);
  });
  const detachExtraction = network.onExtractionEvent((event) => {
    hud.handleExtractionEvent(event);
    switch (event.event) {
      case 'available': {
        if (event.position) {
          worldRenderer.setExtractionBeacon(event.position, 'available');
        } else {
          worldRenderer.setExtractionBeacon(null, 'available');
        }
        audio.playExtractionReady();
        break;
      }
      case 'countdown-start': {
        worldRenderer.setExtractionBeacon(event.position ?? null, 'countdown');
        audio.playExtractionReady();
        break;
      }
      case 'countdown-abort': {
        worldRenderer.setExtractionBeacon(null, 'available');
        audio.playExtractionAbort();
        break;
      }
      case 'success': {
        worldRenderer.triggerExtractionSuccess();
        audio.playExtractionComplete();
        break;
      }
    }
  });
  const detachMutator = network.onMutatorActivated((message) => {
    hud.handleMutatorActivated(message);
    audio.playMutatorChime();
  });
  detachLevelUp = network.onLevelUpOffer((offer) => {
    if (offer.playerId !== network.getPlayerId()) {
      return;
    }
    levelUpQueue.push(offer);
    if (presentNextOffer()) {
      audio.playLevelUp();
    }
  });
  detachAugment = network.onAugmentApplied((message) => {
    const isLocal = message.playerId === network.getPlayerId();
    hud.showAugmentToast(message.augmentId, message.level, isLocal);
    const position = worldRenderer.getPlayerWorldPosition(message.playerId);
    if (position) {
      const pulseColor = message.augmentId === 'foraging-aura'
        ? 0xfacc15
        : isLocal
          ? 0x60a5fa
          : 0x818cf8;
      worldRenderer.spawnPsychicPulse(position.x, position.y, pulseColor);
    }
    if (isLocal) {
      awaitingAugment = false;
      activeLevelUp = null;
      hud.clearLevelUp();
      presentNextOffer();
      audio.playLevelUp();
    }
  });
  detachBoss = network.onBossSpawn((message) => {
    hud.showBossSpawn(message.kind);
    audio.playBossSpawn();
    triggerZoom(0.24, 0.85);
  });
  network.onDisconnect(() => {
    if (inputInterval !== null) {
      window.clearInterval(inputInterval);
      inputInterval = null;
    }
    hud.update(emptySnapshot, null);
    debug.updateNetworkStats({ pingMs: Number.NaN, tickDriftMs: Number.NaN, snapshotsPerSecond: Number.NaN });
    console.warn('Disconnected from server');
    levelUpQueue.length = 0;
    activeLevelUp = null;
    awaitingAugment = false;
    hud.clearLevelUp();
    hud.cancelPingSelection();
    detachArmory();
    detachLevelUp?.();
    detachAugment?.();
    detachBoss?.();
    detachQuickPing();
    detachExtraction();
    detachMutator();
    currentPhase = 'combat';
    inputController.setEnabled(true);
    audio.setPhase('combat');
    zoomSequence = null;
    cameraZoom = 1;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    detachLevelUp = null;
    detachAugment = null;
    detachBoss = null;
    worldRenderer.clearExtractionBeacon();
  });

  const serverUrl = getServerUrl();
  const displayName = createDisplayName();

  try {
    const welcome = await network.connect(serverUrl, displayName);
    worldRenderer.applyLevel(welcome.level);
    worldRenderer.setLocalPlayerId(welcome.playerId);
    serverTickRate = welcome.tickRate;
    snapshotRateSmooth = welcome.tickRate;
    currentPhase = welcome.armory.phase;
    hud.updateArmory(welcome.armory, welcome.playerId);
    worldRenderer.setPlayerCosmetics(welcome.armory.players);
    inputController.setEnabled(currentPhase === 'combat');
    audio.setPhase(currentPhase);
    console.info(`Connected to server as ${welcome.playerId}`);
    console.info(`Level seed ${welcome.level.seed}`);
  } catch (error) {
    console.error('Failed to connect to game server', error);
    detachPing();
    detachLevelUp?.();
    detachAugment?.();
    detachBoss?.();
    detachQuickPing();
    inputController.dispose();
    network.dispose();
    hud.dispose();
    debug.dispose();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    audio.dispose();
    return;
  }

  inputInterval = window.setInterval(() => {
    if (currentPhase !== 'combat') {
      network.sendInput(createInitialInputState());
    } else {
      network.sendInput(inputController.getSnapshot());
    }
  }, INPUT_RATE_MS);

  let lastTime = performance.now();
  const renderLoop = (time: number) => {
    const deltaSeconds = Math.min((time - lastTime) / 1000, 0.25);
    lastTime = time;

    worldRenderer.update(deltaSeconds);
    followCamera(camera, worldRenderer, deltaSeconds, cameraMode);

    if (zoomSequence) {
      zoomSequence.remaining = Math.max(0, zoomSequence.remaining - deltaSeconds);
      const progress = 1 - zoomSequence.remaining / zoomSequence.duration;
      const envelope = Math.sin(progress * Math.PI);
      const targetZoom = 1 + zoomSequence.magnitude * envelope;
      cameraZoom = MathUtils.lerp(cameraZoom, targetZoom, 0.18);
      if (zoomSequence.remaining <= 0) {
        zoomSequence = null;
      }
    } else {
      cameraZoom = MathUtils.lerp(cameraZoom, 1, 0.08);
    }
    if (Math.abs(camera.zoom - cameraZoom) > 0.001) {
      camera.zoom = cameraZoom;
      camera.updateProjectionMatrix();
    }

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
    detachArmory();
    detachLevelUp?.();
    detachAugment?.();
    detachBoss?.();
    debug.dispose();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    audio.dispose();
  });
}

const emptySnapshot: WorldSnapshot = {
  tick: 0,
  players: [],
  enemies: [],
  projectiles: [],
  xpDrops: [],
  artifacts: [],
  objectives: {
    wave: 0,
    waveProgress: 0,
    totalKills: 0,
    nextBossSeconds: null,
    extractionReady: false,
    extractionCountdown: null,
    extractionPosition: null
  },
  mutators: {
    daily: {
      id: 'none',
      name: 'Calm Skies',
      description: 'No active daily mutator',
      impactSummary: 'Baseline conditions',
      cadence: 'daily',
      expiresAt: new Date().toISOString(),
      tags: []
    },
    weekly: {
      id: 'none',
      name: 'Standard Protocol',
      description: 'No active weekly mutator',
      impactSummary: 'Baseline conditions',
      cadence: 'weekly',
      expiresAt: new Date().toISOString(),
      tags: []
    }
  }
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

const pointerNear = new Vector3();
const pointerFar = new Vector3();
const pointerDir = new Vector3();

function updatePointerWorld(
  event: PointerEvent,
  renderer: WebGLRenderer,
  camera: OrthographicCamera,
  out: Vector2
): void {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

  pointerNear.set(ndcX, ndcY, -1).unproject(camera);
  pointerFar.set(ndcX, ndcY, 1).unproject(camera);
  pointerDir.copy(pointerFar).sub(pointerNear);

  const EPSILON = 1e-5;
  if (Math.abs(pointerDir.y) < EPSILON) {
    out.set(pointerNear.x, pointerNear.z);
    return;
  }

  const t = (0 - pointerNear.y) / pointerDir.y;
  const hitX = pointerNear.x + pointerDir.x * t;
  const hitZ = pointerNear.z + pointerDir.z * t;
  out.set(hitX, hitZ);
}

function followCamera(
  camera: OrthographicCamera,
  world: WorldRenderer,
  deltaSeconds: number,
  mode: 'top' | 'tilt'
): void {
  const target = world.getLocalPlayerPosition();
  if (!target) {
    return;
  }
  const smooth = Math.min(1, deltaSeconds * 3);
  const desiredY = mode === 'tilt' ? 320 : 520;
  const desiredZ = mode === 'tilt' ? target.y + 460 : target.y + 280;
  const desiredX = mode === 'tilt' ? target.x : target.x;
  camera.position.x = MathUtils.lerp(camera.position.x, desiredX, smooth);
  camera.position.y = MathUtils.lerp(camera.position.y, desiredY, smooth);
  camera.position.z = MathUtils.lerp(camera.position.z, desiredZ, smooth);

  const hurt = world.getLocalHurtIntensity();
  if (hurt > 0.01) {
    const magnitude = 6 * hurt;
    const time = performance.now() * 0.001;
    camera.position.x += Math.sin(time * 42) * magnitude;
    camera.position.z += Math.cos(time * 36) * magnitude;
  }

  camera.lookAt(target.x, 0, target.y);
}

function createDisplayName(): string {
  const adjectives = ['Brave', 'Mystic', 'Swift', 'Cosmic'];
  const noun = 'Chicken';
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const number = Math.floor(Math.random() * 900 + 100);
  return `${adjective}${noun}${number}`;
}

class ExtractionBeacon {
  readonly group = new Group();
  private readonly pad: Mesh;
  private readonly glow: Mesh;
  private readonly beam: Mesh;
  private readonly beamMaterial: MeshBasicMaterial;
  private readonly glowMaterial: MeshBasicMaterial;
  private readonly padMaterial: MeshBasicMaterial;
  private state: 'available' | 'countdown' = 'available';
  private time = 0;
  private successTimer = 0;
  private readonly position = new Vector2();

  constructor(parent: Group) {
    this.padMaterial = new MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.88 });
    this.pad = new Mesh(new CylinderGeometry(26, 26, 2, 32), this.padMaterial);
    this.pad.position.y = 1;
    this.pad.renderOrder = 1;
    this.group.add(this.pad);

    const glowTexture = createRadialTexture(
      'rgba(148, 241, 255, 0.55)',
      'rgba(56, 189, 248, 0.22)',
      'rgba(8, 13, 23, 0)'
    );
    glowTexture.needsUpdate = true;
    this.glowMaterial = new MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.85
    });
    const glowGeometry = new PlaneGeometry(92, 92);
    glowGeometry.rotateX(-Math.PI / 2);
    this.glow = new Mesh(glowGeometry, this.glowMaterial);
    this.glow.position.y = 0.1;
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    const beamGeometry = new CylinderGeometry(9, 16, 220, 24, 1, true);
    this.beamMaterial = new MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.32,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending
    });
    this.beam = new Mesh(beamGeometry, this.beamMaterial);
    this.beam.position.y = 110;
    this.beam.renderOrder = 1;
    this.group.add(this.beam);

    this.group.visible = false;
    parent.add(this.group);
  }

  setState(position: Vector2D | null, state: 'available' | 'countdown'): void {
    if (!position && !this.group.visible) {
      return;
    }
    if (position) {
      this.position.set(position.x, position.y);
      this.group.position.set(position.x, 0, position.y);
    }
    this.state = state;
    this.group.visible = true;
    this.time = 0;
    this.successTimer = 0;
    this.beamMaterial.opacity = state === 'countdown' ? 0.42 : 0.28;
    this.glowMaterial.opacity = state === 'countdown' ? 1 : 0.85;
  }

  clear(): void {
    this.group.visible = false;
    this.successTimer = 0;
  }

  triggerSuccess(): void {
    if (!this.group.visible) {
      return;
    }
    this.successTimer = 1.2;
  }

  getPosition(): Vector2 | null {
    return this.group.visible ? this.position.clone() : null;
  }

  update(deltaSeconds: number): void {
    if (!this.group.visible) {
      return;
    }
    this.time += deltaSeconds;
    const pulse = 1 + Math.sin(this.time * 3) * 0.12;
    this.glow.scale.setScalar(pulse);
    this.padMaterial.opacity = this.state === 'countdown' ? 0.95 : 0.8;
    const beamPulse = this.state === 'countdown' ? 0.22 + Math.sin(this.time * 6) * 0.12 : 0.16;
    this.beamMaterial.opacity = this.state === 'countdown' ? 0.45 + beamPulse : 0.28 + beamPulse * 0.5;

    if (this.successTimer > 0) {
      this.successTimer = Math.max(0, this.successTimer - deltaSeconds);
      const ratio = 1 - this.successTimer / 1.2;
      this.glow.scale.setScalar(1.4 + ratio * 1.6);
      this.beamMaterial.opacity = Math.max(0, 0.4 - ratio * 0.35);
      if (this.successTimer === 0) {
        this.clear();
      }
    }
  }
}

type SpriteBatchSet = {
  ground: SpriteBatch;
  actors: SpriteBatch;
  fx: SpriteBatch;
};

class WorldRenderer {
  private readonly sceneGroup = new Group();
  private readonly players = new Map<string, PlayerAvatar>();
  private readonly enemies = new Map<string, EnemyAvatar>();
  private readonly projectiles = new Map<string, ProjectileAvatar>();
  private readonly xpDrops = new Map<string, XpOrb>();
  private readonly artifacts = new Map<string, ArtifactShard>();
  private readonly levelRenderer = new LevelRenderer();
  private readonly projectileGroup = new Group();
  private readonly xpGroup = new Group();
  private readonly artifactGroup = new Group();
  private readonly atlas: SpriteAtlas;
  private readonly batches: SpriteBatchSet;
  private readonly impactSystem: ImpactSystem;
  private readonly pulseSystem = new PsychicPulseSystem();
  private readonly decor = new DecorRenderer();
  private readonly enemyPool: EnemyAvatar[] = [];
  private readonly projectilePool: ProjectileAvatar[] = [];
  private readonly playerCosmetics = new Map<string, string | null>();
  private localPlayerId: string | null = null;
  private readonly extractionBeacon = new ExtractionBeacon(this.sceneGroup);

  constructor(scene: Scene, atlas: SpriteAtlas) {
    this.atlas = atlas;
    // Three shared-atlas batches render every sprite in the world:
    // ground FX under actors, actor bodies, then additive top FX.
    this.batches = {
      ground: new SpriteBatch(atlas.texture, { additive: true, renderOrder: 2 }),
      actors: new SpriteBatch(atlas.texture, { renderOrder: 4 }),
      fx: new SpriteBatch(atlas.texture, { additive: true, renderOrder: 5, capacity: 512 })
    };
    this.impactSystem = new ImpactSystem(atlas);
    scene.add(this.decor.group);
    scene.add(this.sceneGroup);
    this.sceneGroup.add(this.levelRenderer.group);
    this.sceneGroup.add(this.projectileGroup);
    this.sceneGroup.add(this.xpGroup);
    this.sceneGroup.add(this.artifactGroup);
    this.sceneGroup.add(this.batches.ground.mesh);
    this.sceneGroup.add(this.batches.actors.mesh);
    this.sceneGroup.add(this.batches.fx.mesh);
    this.sceneGroup.add(this.pulseSystem.group);
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

  /** Mirror armory loadouts so equipped cosmetics render on in-game avatars. */
  setPlayerCosmetics(players: Array<{ playerId: string; equippedCosmeticId: string | null }>): void {
    this.playerCosmetics.clear();
    for (const player of players) {
      this.playerCosmetics.set(player.playerId, player.equippedCosmeticId);
    }
    for (const [id, avatar] of this.players.entries()) {
      avatar.setCosmetic(this.playerCosmetics.get(id) ?? null);
    }
  }

  applySnapshot(snapshot: WorldSnapshot): void {
    const seenPlayers = new Set<string>();
    const seenEnemies = new Set<string>();
    const seenProjectiles = new Set<string>();
    const seenXp = new Set<string>();
    const seenArtifacts = new Set<string>();
    const targetedCounts = new Map<string, number>();
    const focus = this.getLocalPlayerPosition();
    const enemyCullRadiusSq = focus ? 900 * 900 : Number.POSITIVE_INFINITY;
    const projectileCullRadiusSq = focus ? 1100 * 1100 : Number.POSITIVE_INFINITY;

    for (const player of snapshot.players) {
      let avatar = this.players.get(player.id);
      if (!avatar) {
        avatar = new PlayerAvatar(player.id, player.id === this.localPlayerId, this.atlas);
        avatar.setCosmetic(this.playerCosmetics.get(player.id) ?? null);
        this.players.set(player.id, avatar);
      }
      avatar.setState(player);
      seenPlayers.add(player.id);
    }

    for (const enemy of snapshot.enemies) {
      let avatar = this.enemies.get(enemy.id);
      if (!avatar) {
        avatar = this.enemyPool.pop() ?? new EnemyAvatar(this.atlas);
        avatar.reset(enemy.id, enemy.kind);
        this.enemies.set(enemy.id, avatar);
      } else if (avatar.getKind() !== enemy.kind) {
        avatar.reset(enemy.id, enemy.kind);
      }
      avatar.setState(enemy);
      if (focus) {
        const dx = enemy.position.x - focus.x;
        const dy = enemy.position.y - focus.y;
        avatar.setVisibility(dx * dx + dy * dy <= enemyCullRadiusSq);
      } else {
        avatar.setVisibility(true);
      }
      seenEnemies.add(enemy.id);
      if (enemy.targetPlayerId && enemy.intent === 'windup') {
        targetedCounts.set(enemy.targetPlayerId, (targetedCounts.get(enemy.targetPlayerId) ?? 0) + 1);
      }
    }

    for (const projectile of snapshot.projectiles) {
      let avatar = this.projectiles.get(projectile.id);
      const created = !avatar;
      if (!avatar) {
        avatar = this.projectilePool.pop() ?? new ProjectileAvatar(this.projectileGroup, this.atlas);
        avatar.reset(projectile.id, projectile.faction);
        this.projectiles.set(projectile.id, avatar);
      } else if (avatar.getFaction() !== projectile.faction) {
        avatar.reset(projectile.id, projectile.faction);
      }
      avatar.setState(
        projectile.position.x,
        projectile.position.y,
        projectile.velocity.x,
        projectile.velocity.y,
        projectile.ttl,
        projectile.power
      );
      if (focus) {
        const dx = projectile.position.x - focus.x;
        const dy = projectile.position.y - focus.y;
        avatar.setVisibility(dx * dx + dy * dy <= projectileCullRadiusSq);
      } else {
        avatar.setVisibility(true);
      }
      seenProjectiles.add(projectile.id);
      if (created && projectile.faction === 'player') {
        const owner = this.players.get(projectile.ownerId);
        owner?.notifyAttack();
      }
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

    for (const drop of snapshot.artifacts) {
      let shard = this.artifacts.get(drop.id);
      if (!shard) {
        shard = new ArtifactShard(drop.id, this.artifactGroup);
        this.artifacts.set(drop.id, shard);
      }
      shard.setState(drop.position.x, drop.position.y, drop.kind, drop.age);
      seenArtifacts.add(drop.id);
    }

    for (const [id, avatar] of this.players.entries()) {
      avatar.setTargeted((targetedCounts.get(id) ?? 0) > 0);
    }

    for (const id of this.players.keys()) {
      if (!seenPlayers.has(id)) {
        this.players.delete(id);
      }
    }

    for (const [id, avatar] of this.enemies.entries()) {
      if (!seenEnemies.has(id)) {
        avatar.release();
        this.enemyPool.push(avatar);
        this.enemies.delete(id);
      }
    }

    for (const [id, avatar] of this.projectiles.entries()) {
      if (!seenProjectiles.has(id)) {
        if (avatar.shouldSpawnImpact()) {
          const impactPosition = avatar.getPosition();
          this.impactSystem.spawn(impactPosition.x, impactPosition.y, avatar.getImpactColor());
        }
        avatar.release();
        this.projectilePool.push(avatar);
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

    for (const [id, shard] of this.artifacts.entries()) {
      if (!seenArtifacts.has(id)) {
        if (shard.getAge() < ARTIFACT_TTL - 0.2) {
          const pos = shard.getPosition();
          const color = ARTIFACT_COLORS[shard.getKind()].core;
          this.spawnPsychicPulse(pos.x, pos.y, color);
        }
        shard.dispose();
        this.artifacts.delete(id);
      }
    }
  }

  update(deltaSeconds: number): void {
    XP_ORB_TIME.value = performance.now() * 0.001;
    const focus = this.getLocalPlayerPosition();
    this.decor.update(deltaSeconds, focus);
    this.batches.ground.begin();
    this.batches.actors.begin();
    this.batches.fx.begin();
    for (const avatar of this.players.values()) {
      avatar.update(deltaSeconds, this.batches);
    }
    for (const avatar of this.enemies.values()) {
      avatar.update(deltaSeconds, this.batches);
    }
    for (const avatar of this.projectiles.values()) {
      avatar.update(deltaSeconds, this.batches);
    }
    for (const orb of this.xpDrops.values()) {
      orb.update(deltaSeconds);
    }
    for (const shard of this.artifacts.values()) {
      shard.update(deltaSeconds);
    }
    this.impactSystem.update(deltaSeconds, this.batches.fx);
    this.pulseSystem.update(deltaSeconds);
    this.extractionBeacon.update(deltaSeconds);
    this.batches.ground.end();
    this.batches.actors.end();
    this.batches.fx.end();
  }

  spawnPing(x: number, y: number, kind: QuickPingKind, isLocal: boolean): void {
    const color = PING_COLORS[kind] ?? 0xffffff;
    let tint = color;
    if (!isLocal) {
      const adjusted = new Color(color);
      adjusted.lerp(new Color(0xffffff), 0.35);
      tint = adjusted.getHex();
    }
    this.impactSystem.spawn(x, y, tint);
  }

  spawnPsychicPulse(x: number, y: number, color: number): void {
    this.pulseSystem.spawn(x, y, color);
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

  getPlayerWorldPosition(playerId: string): Vector2 | null {
    const avatar = this.players.get(playerId);
    if (!avatar) {
      return null;
    }
    return avatar.getPosition();
  }

  getLocalHurtIntensity(): number {
    if (!this.localPlayerId) {
      return 0;
    }
    const avatar = this.players.get(this.localPlayerId);
    if (!avatar) {
      return 0;
    }
    return avatar.getHurtIntensity();
  }

  private clearTransients(): void {
    for (const avatar of this.projectiles.values()) {
      avatar.release();
      this.projectilePool.push(avatar);
    }
    this.projectiles.clear();

    for (const avatar of this.enemies.values()) {
      avatar.release();
      this.enemyPool.push(avatar);
    }
    this.enemies.clear();

    for (const orb of this.xpDrops.values()) {
      this.xpGroup.remove(orb.mesh);
      orb.dispose();
    }
    this.xpDrops.clear();
    for (const shard of this.artifacts.values()) {
      shard.dispose();
    }
    this.artifacts.clear();
    this.impactSystem.clear();
    this.pulseSystem.clear();
    this.extractionBeacon.clear();
  }

  setExtractionBeacon(position: Vector2D | null, mode: 'available' | 'countdown'): void {
    this.extractionBeacon.setState(position, mode);
  }

  clearExtractionBeacon(): void {
    this.extractionBeacon.clear();
  }

  triggerExtractionSuccess(): void {
    const position = this.extractionBeacon.getPosition();
    if (position) {
      this.pulseSystem.spawn(position.x, position.y, 0x38bdf8);
    }
    this.extractionBeacon.triggerSuccess();
  }
}

class DecorRenderer {
  readonly group = new Group();
  private backdrop: Mesh | null = null;
  private spawnGlow: Mesh | null = null;
  private particles: Points | null = null;
  private props: InstancedMesh[] = [];
  private accentGroups: Group[] = [];
  private windmillHubs: Group[] = [];
  private swayTufts: Mesh[] = [];
  private skyDome: Mesh | null = null;
  private horizon: Mesh | null = null;
  private worldSize = { width: 0, height: 0 };
  private time = 0;

  applyLevel(level: LevelData): void {
    this.clear();

    const worldWidth = level.width * TILE_SIZE;
    const worldHeight = level.height * TILE_SIZE;
    this.worldSize = { width: worldWidth, height: worldHeight };

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

    this.createParallaxSky(worldWidth, worldHeight, level.biome);

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
    this.particles.frustumCulled = true;
    this.particles.geometry.computeBoundingSphere();
    this.group.add(this.particles);

    this.createBiomeProps(level);
    this.createAccentProps(level);

    this.time = 0;
  }

  update(deltaSeconds: number, focus: Vector2 | null = null): void {
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

    for (const hub of this.windmillHubs) {
      hub.rotation.z += deltaSeconds * 2.1;
    }

    for (const tuft of this.swayTufts) {
      const data = tuft.userData as { base: number; phase: number; sway: number };
      tuft.rotation.z = data.base + Math.sin(this.time * 1.8 + data.phase) * data.sway;
    }

    if (focus) {
      const px = (focus.x / Math.max(1, this.worldSize.width)) * 48;
      const pz = (focus.y / Math.max(1, this.worldSize.height)) * 36;
      if (this.horizon) {
        this.horizon.position.x = px;
        this.horizon.position.z = pz;
      }
      if (this.skyDome) {
        this.skyDome.position.x = px * 0.5;
        this.skyDome.position.z = pz * 0.5;
      }
    }

    if (this.skyDome) {
      this.skyDome.rotation.y += deltaSeconds * 0.02;
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
    if (this.skyDome) {
      this.group.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      disposeMaterial(this.skyDome.material as MeshBasicMaterial);
      this.skyDome = null;
    }
    if (this.horizon) {
      this.group.remove(this.horizon);
      this.horizon.geometry.dispose();
      disposeMaterial(this.horizon.material as MeshBasicMaterial);
      this.horizon = null;
    }
    for (const mesh of this.props) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((entry) => disposeMaterial(entry));
      } else {
        disposeMaterial(mat);
      }
      mesh.dispose();
    }
    this.props = [];
    for (const accent of this.accentGroups) {
      this.group.remove(accent);
      disposeModel(accent);
    }
    this.accentGroups = [];
    this.windmillHubs = [];
    this.swayTufts = [];
  }

  private createParallaxSky(width: number, height: number, biome: LevelData['biome']): void {
    const radius = Math.max(width, height) * 0.9 + 320;
    const domeGeometry = new SphereGeometry(radius, 26, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeometry.scale(1, 0.7, 1);
    const domeMaterial = new MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.55,
      side: BackSide,
      depthWrite: false
    });
    const dome = new Mesh(domeGeometry, domeMaterial);
    dome.position.y = radius * 0.32;
    this.skyDome = dome;
    this.group.add(dome);

    const horizonGeometry = new PlaneGeometry(radius * 1.4, radius * 0.75);
    const horizonMaterial = new MeshBasicMaterial({
      map: createHorizonTexture(biome),
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const horizon = new Mesh(horizonGeometry, horizonMaterial);
    horizon.position.set(0, 110, -height * 0.45);
    horizon.renderOrder = -2;
    this.horizon = horizon;
    this.group.add(horizon);
  }

  private createAccentProps(level: LevelData): void {
    if (level.biome === 'barnyard') {
      this.createBarnyardWindmill(level);
    }
    if (level.biome !== 'lab') {
      this.createGrassField(level);
    }
  }

  private createBarnyardWindmill(level: LevelData): void {
    const windmill = new Group();
    const towerMaterial = new MeshStandardMaterial({ color: 0xf97316, roughness: 0.65, metalness: 0.08 });
    const tower = new Mesh(new CylinderGeometry(6, 8, 42, 10, 1, false), towerMaterial);
    tower.position.y = 21;
    windmill.add(tower);

    const roofMaterial = new MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.12 });
    const roof = new Mesh(new ConeGeometry(9, 9, 8, 1), roofMaterial);
    roof.position.y = 42 + 4.5;
    windmill.add(roof);

    const hub = new Group();
    hub.position.set(0, 34, 6);

    const hubMaterial = new MeshStandardMaterial({ color: 0xfde68a, roughness: 0.4, metalness: 0.1 });
    const hubCore = new Mesh(new CylinderGeometry(2.4, 2.4, 4, 12, 1, false), hubMaterial);
    hubCore.rotation.x = Math.PI / 2;
    hub.add(hubCore);

    const bladeGeometry = new BoxGeometry(2.2, 26, 1.2);
    for (let i = 0; i < 4; i += 1) {
      const arm = new Group();
      const blade = new Mesh(bladeGeometry, hubMaterial);
      blade.position.y = 13;
      arm.add(blade);
      arm.rotation.z = (Math.PI / 2) * i;
      hub.add(arm);
    }

    windmill.add(hub);

    const offsetX = tileToWorldX(Math.max(2, Math.floor(level.width * 0.2)), level);
    const offsetZ = tileToWorldZ(Math.max(2, Math.floor(level.height * 0.18)), level);
    windmill.position.set(offsetX, 0, offsetZ);

    this.group.add(windmill);
    this.accentGroups.push(windmill);
    this.windmillHubs.push(hub);
  }

  private createGrassField(level: LevelData): void {
    const worldPositions: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y * level.width + x];
        if (tile === 'floor') {
          worldPositions.push({ x, y });
        }
      }
    }
    if (worldPositions.length === 0) {
      return;
    }

    const rng = mulberry32(level.seed ^ 0x51a53c2f);
    const count = Math.min(80, Math.max(18, Math.floor(worldPositions.length * 0.06)));
    const group = new Group();
    const geometry = new ConeGeometry(1.6, 6.2, 6, 1);
    geometry.translate(0, 3.1, 0);
    const palette = level.biome === 'forest' ? 0x22c55e : 0xfcd34d;
    const material = new MeshStandardMaterial({ color: palette, roughness: 0.6, metalness: 0.12, emissive: 0x09241a, emissiveIntensity: level.biome === 'forest' ? 0.18 : 0.08 });

    for (let i = 0; i < count; i += 1) {
      const sample = worldPositions[Math.floor(rng() * worldPositions.length)];
      const mesh = new Mesh(geometry.clone(), material);
      const worldX = tileToWorldX(sample.x, level) + (rng() - 0.5) * TILE_SIZE * 0.8;
      const worldZ = tileToWorldZ(sample.y, level) + (rng() - 0.5) * TILE_SIZE * 0.8;
      mesh.position.set(worldX, 0, worldZ);
      const baseRotation = (rng() - 0.5) * 0.4;
      mesh.rotation.z = baseRotation;
      mesh.userData = {
        base: baseRotation,
        phase: rng() * Math.PI * 2,
        sway: 0.22 + rng() * 0.18
      };
      group.add(mesh);
      this.swayTufts.push(mesh);
    }

    this.group.add(group);
    this.accentGroups.push(group);
  }

  private createBiomeProps(level: LevelData): void {
    const positions: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y * level.width + x];
        if (tile === 'floor') {
          positions.push({ x, y });
        }
      }
    }
    if (positions.length === 0) {
      return;
    }

    const rng = mulberry32(level.seed ^ 0x4c957f2d);
    const count = Math.min(140, Math.max(20, Math.floor(positions.length * 0.12)));

    const { geometry, material } = createBiomePropAssets(level.biome);
    const mesh = new InstancedMesh(geometry, material, count);
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scaleVec = new Vector3();
    const axis = new Vector3(0, 1, 0);

    for (let i = 0; i < count; i += 1) {
      const sample = positions[Math.floor(rng() * positions.length)];
      const worldX = tileToWorldX(sample.x, level) + (rng() - 0.5) * TILE_SIZE * 0.6;
      const worldZ = tileToWorldZ(sample.y, level) + (rng() - 0.5) * TILE_SIZE * 0.6;
      const rotation = rng() * Math.PI * 2;
      const scale = 0.7 + rng() * 0.6;
      position.set(worldX, 0, worldZ);
      quaternion.setFromAxisAngle(axis, rotation);
      scaleVec.set(scale, scale, scale);
      matrix.compose(position, quaternion, scaleVec);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.props.push(mesh);
    this.group.add(mesh);
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

    const materials = createBiomeMaterials(level.biome, level.seed);
    const floorMaterial = materials.floor;
    const spawnMaterial = materials.spawn;
    const wallMaterial = materials.wall;

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
        mesh.material.forEach((material) => disposeMaterial(material));
      } else {
        disposeMaterial(mesh.material);
      }
      mesh.dispose();
    }
    this.meshes = [];
  }
}

function disposeMaterial(material: { dispose: () => void; map?: { dispose: () => void } | null }): void {
  if ('map' in material && material.map) {
    material.map.dispose();
  }
  material.dispose();
}

class PlayerAvatar {
  readonly id: string;
  private readonly atlas: SpriteAtlas;
  private readonly visual: ResolvedVisual | null;
  private readonly fxVisual: ResolvedVisual | null;
  private readonly animator = new SpriteAnimator();
  private readonly cosmeticAnimator = new SpriteAnimator();
  private cosmeticVisual: ResolvedVisual | null = null;
  private cosmeticId: string | null = null;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private readonly baseColor = new Color();
  private readonly hurtColor = new Color(0xff4d6d);
  private readonly tempColor = new Color();
  private readonly reticleBaseScale = TILE_SIZE * 0.85;
  private reticleOpacity = 0;
  private currentFacing = 0;
  private targetFacing = 0;
  private hurtTimer = 0;
  private invulnerableTimer = 0;
  private time = 0;
  private targeted = false;
  private isLocal = false;
  private displayName = '';
  private initialized = false;
  private attackTimer = 0;
  private movementSpeed = 0;

  constructor(id: string, isLocal: boolean, atlas: SpriteAtlas) {
    this.id = id;
    this.atlas = atlas;
    this.isLocal = isLocal;
    this.visual = atlas.getVisual('player');
    this.fxVisual = atlas.getVisual('fx:reticle');
    this.animator.setVisual(this.visual);
    this.baseColor.setHex(pickColor(id, isLocal));
  }

  setCosmetic(id: string | null): void {
    if (this.cosmeticId === id) {
      return;
    }
    this.cosmeticId = id;
    this.cosmeticVisual = id ? this.atlas.getVisual(`cosmetic:${id}`) : null;
    this.cosmeticAnimator.setVisual(this.cosmeticVisual);
  }

  setState(state: PlayerState): void {
    this.displayName = state.displayName;
    this.targetPosition.set(state.position.x, state.position.y);
    this.targetFacing = state.facing;
    this.movementSpeed = Math.hypot(state.velocity.x, state.velocity.y);
    this.hurtTimer = Math.max(this.hurtTimer, state.hurtTimer);
    this.invulnerableTimer = Math.max(this.invulnerableTimer, state.invulnerableTimer);
    if (!this.initialized) {
      this.currentPosition.set(state.position.x, state.position.y);
      this.currentFacing = state.facing;
      this.initialized = true;
    }
  }

  setIsLocal(isLocal: boolean): void {
    this.isLocal = isLocal;
    this.baseColor.setHex(pickColor(this.id, isLocal));
  }

  setTargeted(value: boolean): void {
    this.targeted = value;
  }

  update(deltaSeconds: number, batches: SpriteBatchSet): void {
    this.time += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * 10);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);
    this.hurtTimer = Math.max(0, this.hurtTimer - deltaSeconds);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaSeconds);
    this.attackTimer = Math.max(0, this.attackTimer - deltaSeconds);

    if (this.attackTimer > 0) {
      this.animator.play('attack');
    } else if (this.movementSpeed > 12) {
      this.animator.play('move');
    } else {
      this.animator.play('idle');
    }
    this.animator.update(deltaSeconds);

    const hurtRatio = PLAYER_HURT_FLASH_TIME > 0 ? Math.min(1, this.hurtTimer / PLAYER_HURT_FLASH_TIME) : 0;
    this.tempColor.copy(this.baseColor);
    if (hurtRatio > 0) {
      const intensity = 0.5 + 0.25 * Math.sin(this.time * 24);
      this.tempColor.lerp(this.hurtColor, Math.min(1, hurtRatio * intensity));
    }

    let opacity = 1;
    if (this.invulnerableTimer > 0) {
      const flicker = Math.floor(this.time * 16) % 2 === 0 ? 0.4 : -0.2;
      opacity = Math.min(1, 0.75 + flicker * 0.5);
    }

    const rotation = -this.currentFacing + Math.PI / 2;
    const frame = this.animator.getFrame();
    if (this.visual && frame) {
      batches.actors.submit(
        this.currentPosition.x,
        PLAYER_HEIGHT,
        this.currentPosition.y,
        rotation,
        this.visual.worldSize.width,
        this.visual.worldSize.height,
        frame,
        this.tempColor.getHex(),
        opacity
      );
    }

    if (this.cosmeticVisual) {
      this.cosmeticAnimator.update(deltaSeconds);
      const cosmeticFrame = this.cosmeticAnimator.getFrame();
      if (cosmeticFrame) {
        batches.actors.submit(
          this.currentPosition.x,
          PLAYER_HEIGHT + 0.3,
          this.currentPosition.y,
          rotation,
          this.cosmeticVisual.worldSize.width,
          this.cosmeticVisual.worldSize.height,
          cosmeticFrame,
          0xffffff,
          opacity
        );
      }
    }

    if (this.targeted) {
      this.reticleOpacity = Math.min(1, 0.25 + (this.isLocal ? 0.35 : 0.2));
    } else {
      this.reticleOpacity = Math.max(0, this.reticleOpacity - deltaSeconds * 3);
    }
    const reticleFrame = this.fxVisual?.clips.idle.frames[0];
    if (reticleFrame && this.reticleOpacity > 0.02) {
      const pulse = this.targeted ? 1 + Math.sin(this.time * 8) * 0.12 : 1;
      const scale = this.reticleBaseScale * pulse;
      batches.ground.submit(
        this.currentPosition.x,
        0.2,
        this.currentPosition.y,
        this.time * 1.4,
        scale,
        scale,
        reticleFrame,
        0xfacc15,
        this.reticleOpacity
      );
    }
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }

  getHurtIntensity(): number {
    return PLAYER_HURT_FLASH_TIME > 0 ? Math.min(1, this.hurtTimer / PLAYER_HURT_FLASH_TIME) : 0;
  }

  notifyAttack(): void {
    this.attackTimer = 0.32;
    this.animator.play('attack', true);
  }
}

class EnemyAvatar {
  private readonly atlas: SpriteAtlas;
  private readonly telegraphVisual: ResolvedVisual | null;
  private readonly animator = new SpriteAnimator();
  private visual: ResolvedVisual | null = null;
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
  private visible = true;
  private movementSpeed = 0;
  private telegraphOpacity = 0;
  private telegraphTint = 0xffffff;
  private id = '';
  private kind: EnemyKind = 'fox';
  private baseOpacity = 0.95;

  constructor(atlas: SpriteAtlas) {
    this.atlas = atlas;
    this.telegraphVisual = atlas.getVisual('fx:telegraph');
  }

  reset(id: string, kind: EnemyKind): void {
    this.id = id;
    this.kind = kind;
    this.time = Math.random() * 10;
    this.initialized = false;
    this.intent = 'idle';
    this.displayIntentTimer = 0;
    this.displayIntentDuration = 0;
    this.visible = true;
    this.telegraphOpacity = 0;
    this.movementSpeed = 0;
    this.baseOpacity = kind === 'coyote' ? 1 : 0.95;
    this.visual = this.atlas.getVisual(`enemy:${kind}`);
    this.animator.setVisual(this.visual);
  }

  getKind(): EnemyKind {
    return this.kind;
  }

  setVisibility(visible: boolean): void {
    this.visible = visible;
  }

  release(): void {
    this.visible = false;
    this.initialized = false;
    this.intent = 'idle';
    this.telegraphOpacity = 0;
  }

  setState(state: EnemyState): void {
    this.targetPosition.set(state.position.x, state.position.y);
    if (Math.abs(state.velocity.x) > 0.01 || Math.abs(state.velocity.y) > 0.01) {
      this.targetFacing = Math.atan2(state.velocity.y, state.velocity.x);
    }
    this.movementSpeed = Math.hypot(state.velocity.x, state.velocity.y);
    this.intent = state.intent;
    this.displayIntentDuration = state.intentDuration;
    this.displayIntentTimer = state.intentTimer;
    this.attackRange = state.attackRange;
    if (!this.initialized) {
      this.currentPosition.set(state.position.x, state.position.y);
      this.currentFacing = this.targetFacing;
      this.initialized = true;
    }
  }

  update(deltaSeconds: number, batches: SpriteBatchSet): void {
    if (!this.visible || !this.initialized) {
      return;
    }
    this.time += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * 6);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);

    if (this.intent === 'windup' || this.intent === 'channel') {
      this.animator.play('windup');
    } else if (this.movementSpeed > 6) {
      this.animator.play('move');
    } else {
      this.animator.play('idle');
    }
    this.animator.update(deltaSeconds);

    let scale = 1 + Math.sin((this.time + this.currentPosition.length() * 0.003) * 3.2) * 0.04;
    let opacity = this.baseOpacity;
    if (this.intent === 'burrow') {
      const ratio = this.displayIntentDuration > 0
        ? Math.max(0, Math.min(1, this.displayIntentTimer / this.displayIntentDuration))
        : 0.5;
      scale = Math.max(0.35, 1 - ratio * 0.75);
      opacity = Math.max(0.25, this.baseOpacity * scale);
    } else if (this.intent === 'channel') {
      scale += 0.12;
    }

    const frame = this.animator.getFrame();
    if (this.visual && frame) {
      batches.actors.submit(
        this.currentPosition.x,
        PLAYER_HEIGHT * 0.8,
        this.currentPosition.y,
        -this.currentFacing + Math.PI / 2,
        this.visual.worldSize.width * scale,
        this.visual.worldSize.height * scale,
        frame,
        0xffffff,
        opacity
      );
    }

    this.updateTelegraph(deltaSeconds, batches);
  }

  private updateTelegraph(deltaSeconds: number, batches: SpriteBatchSet): void {
    const diameter = Math.max(24, this.attackRange * 2);
    let telegraphScale = diameter;
    if (this.intent === 'burrow') {
      this.telegraphOpacity = 0;
      return;
    }

    if (this.intent === 'windup') {
      this.displayIntentTimer = Math.max(0, this.displayIntentTimer - deltaSeconds);
      const progress = this.displayIntentDuration > 0 ? 1 - this.displayIntentTimer / this.displayIntentDuration : 1;
      const pulse = 1 + Math.sin((progress + this.time) * Math.PI * 2) * 0.08;
      telegraphScale = diameter * pulse;
      this.telegraphOpacity = Math.min(0.9, 0.25 + progress * 0.55);
      this.telegraphTint = this.kind === 'owl' ? 0xfde68a : this.kind === 'coyote' ? 0xf59e0b : 0xf87171;
    } else if (this.intent === 'recover') {
      this.telegraphOpacity = Math.max(0, this.telegraphOpacity - deltaSeconds * 1.6);
    } else if (this.intent === 'channel') {
      const pulse = 1 + Math.sin((this.time + this.floatOffset()) * 6) * 0.12;
      telegraphScale = diameter * pulse;
      this.telegraphTint = this.kind === 'owl' ? 0xd8b4fe : 0xf87171;
      this.telegraphOpacity = 0.32 + Math.sin((this.time + this.floatOffset()) * 4) * 0.12;
    } else {
      this.telegraphOpacity = Math.max(0, this.telegraphOpacity - deltaSeconds * 2.2);
    }

    const frame = this.telegraphVisual?.clips.idle.frames[0];
    if (frame && this.telegraphOpacity > 0.02) {
      batches.ground.submit(
        this.currentPosition.x,
        0.15,
        this.currentPosition.y,
        0,
        telegraphScale,
        telegraphScale,
        frame,
        this.telegraphTint,
        this.telegraphOpacity
      );
    }
  }

  private floatOffset(): number {
    return (this.currentPosition.x + this.currentPosition.y) * 0.005;
  }
}

class ProjectileAvatar {
  private readonly atlas: SpriteAtlas;
  private readonly parent: Group;
  private readonly trail: Line;
  private readonly trailGeometry: BufferGeometry;
  private readonly trailMaterial: LineBasicMaterial;
  private readonly animator = new SpriteAnimator();
  private visual: ResolvedVisual | null = null;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private readonly history: Vector2[] = [];
  private currentFacing = 0;
  private targetFacing = 0;
  private displayTtl = PROJECTILE_LIFETIME;
  private serverTtl = PROJECTILE_LIFETIME;
  private initialized = false;
  private visible = true;
  private id = '';
  private faction: ProjectileFaction = 'player';
  private tint = PROJECTILE_STYLE.player.body;
  private impactColor = PROJECTILE_STYLE.player.impact;
  private power = 0;

  constructor(parent: Group, atlas: SpriteAtlas) {
    this.atlas = atlas;
    this.parent = parent;

    this.trailGeometry = new BufferGeometry();
    const positions = new Float32Array(PROJECTILE_TRAIL_LENGTH * 3);
    this.trailGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.trailGeometry.setDrawRange(0, 0);
    this.trailMaterial = new LineBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.trail = new Line(this.trailGeometry, this.trailMaterial);
    this.trail.renderOrder = 2;
  }

  reset(id: string, faction: ProjectileFaction): void {
    this.id = id;
    this.faction = faction;
    this.visual = this.atlas.getVisual(`projectile:${faction}`);
    this.animator.setVisual(this.visual);
    this.tint = this.visual?.tint ?? PROJECTILE_STYLE[faction].body;
    this.impactColor = PROJECTILE_STYLE[faction].impact;
    this.trailMaterial.color.setHex(PROJECTILE_STYLE[faction].trail);
    this.initialized = false;
    this.visible = true;
    this.displayTtl = PROJECTILE_LIFETIME;
    this.serverTtl = PROJECTILE_LIFETIME;
    this.history.length = 0;
    if (this.trail.parent !== this.parent) {
      this.parent.add(this.trail);
    }
    this.trail.visible = true;
  }

  getFaction(): ProjectileFaction {
    return this.faction;
  }

  getImpactColor(): number {
    return this.impactColor;
  }

  setVisibility(visible: boolean): void {
    this.visible = visible;
    this.trail.visible = visible;
  }

  setState(x: number, y: number, vx: number, vy: number, ttl: number, power: number): void {
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
    this.power = power;
  }

  update(deltaSeconds: number, batches: SpriteBatchSet): void {
    if (!this.visible || !this.initialized) {
      return;
    }
    const lerpFactor = Math.min(1, deltaSeconds * 18);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.currentFacing = MathUtils.lerp(this.currentFacing, this.targetFacing, lerpFactor);
    this.displayTtl = Math.max(0, this.displayTtl - deltaSeconds);
    this.animator.update(deltaSeconds);

    const lifeRatio = Math.max(0, Math.min(1, this.displayTtl / PROJECTILE_LIFETIME));
    const powerScale = Math.min(1, this.power / 50);
    const opacity = 0.35 + (1 - lifeRatio) * 0.6 + powerScale * 0.1;
    const scale = 0.85 + (1 - lifeRatio) * 0.3 + powerScale * 0.2;

    const frame = this.animator.getFrame();
    if (this.visual && frame) {
      batches.fx.submit(
        this.currentPosition.x,
        PLAYER_HEIGHT * 0.9,
        this.currentPosition.y,
        -this.currentFacing + Math.PI / 2,
        this.visual.worldSize.width * scale,
        this.visual.worldSize.height * scale,
        frame,
        this.tint,
        opacity
      );
    }

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
    this.trailMaterial.opacity = 0.2 + Math.min(0.5, drawCount / PROJECTILE_TRAIL_LENGTH) + powerScale * 0.15;
  }

  release(): void {
    if (this.trail.parent) {
      this.trail.parent.remove(this.trail);
    }
    this.history.length = 0;
    this.initialized = false;
    this.visible = false;
    this.trail.visible = false;
    this.trailGeometry.setDrawRange(0, 0);
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }

  shouldSpawnImpact(): boolean {
    return this.serverTtl > 0.08;
  }
}

type ImpactState = {
  x: number;
  y: number;
  tint: number;
  remaining: number;
  initial: number;
};

class ImpactSystem {
  private readonly visual: ResolvedVisual | null;
  private readonly active: ImpactState[] = [];
  private readonly pool: ImpactState[] = [];

  constructor(atlas: SpriteAtlas) {
    this.visual = atlas.getVisual('fx:impact');
  }

  spawn(x: number, y: number, color: number): void {
    const impact = this.pool.pop() ?? { x: 0, y: 0, tint: 0xffffff, remaining: 0, initial: 0 };
    impact.x = x;
    impact.y = y;
    impact.tint = color;
    impact.remaining = 0.28;
    impact.initial = 0.28;
    this.active.push(impact);
  }

  update(deltaSeconds: number, batch: SpriteBatch): void {
    const frame = this.visual?.clips.idle.frames[0];
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const impact = this.active[i];
      impact.remaining -= deltaSeconds;
      if (impact.remaining <= 0) {
        this.recycle(i);
        continue;
      }
      if (!frame || !this.visual) {
        continue;
      }
      const ratio = Math.max(0, Math.min(1, impact.remaining / impact.initial));
      const scale = 0.5 + (1 - ratio) * 1.8;
      batch.submit(
        impact.x,
        1.4,
        impact.y,
        0,
        this.visual.worldSize.width * scale,
        this.visual.worldSize.height * scale,
        frame,
        impact.tint,
        0.15 + ratio * 0.65
      );
    }
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      this.recycle(i);
    }
  }

  private recycle(index: number): void {
    this.pool.push(this.active[index]);
    this.active.splice(index, 1);
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

class PsychicPulseSystem {
  readonly group = new Group();
  private readonly pool: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private readonly active: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private readonly geometry: PlaneGeometry;

  constructor() {
    this.geometry = new PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
  }

  spawn(x: number, y: number, color: number): void {
    const mesh = this.pool.pop() ?? this.createMesh();
    const material = mesh.material;
    material.uniforms.uColor.value.setHex(color);
    material.uniforms.uProgress.value = 0;
    mesh.position.set(x, 2, y);
    mesh.scale.setScalar(52);
    mesh.userData.remaining = 0.9;
    mesh.userData.duration = 0.9;
    mesh.userData.baseScale = 52;
    this.group.add(mesh);
    this.active.push(mesh);
  }

  update(deltaSeconds: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const mesh = this.active[i];
      mesh.userData.remaining -= deltaSeconds;
      const remaining: number = mesh.userData.remaining;
      const duration: number = mesh.userData.duration;
      if (remaining <= 0) {
        this.recycle(i);
        continue;
      }
      const progress = 1 - remaining / duration;
      const material = mesh.material;
      material.uniforms.uProgress.value = progress;
      material.needsUpdate = true;
      const growth = 1 + progress * 1.8;
      mesh.scale.setScalar(mesh.userData.baseScale * growth);
      mesh.position.y = 2 + progress * 6;
    }
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      this.recycle(i);
    }
  }

  private createMesh(): Mesh<PlaneGeometry, ShaderMaterial> {
    const material = new ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new Color(0x60a5fa) }
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          vec2 centered = vUv - 0.5;
          float dist = length(centered);
          float falloff = smoothstep(0.48, 0.1, dist);
          float ring = smoothstep(0.32, 0.18, dist) - smoothstep(0.12, 0.08, dist);
          float pulse = sin((0.5 - dist) * 12.0 + uProgress * 8.0) * 0.35 + 0.75;
          float alpha = clamp((1.0 - uProgress) * falloff * (0.6 + ring * pulse), 0.0, 1.0);
          if (alpha <= 0.01) {
            discard;
          }
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.renderOrder = 5;
    mesh.userData.remaining = 0;
    mesh.userData.duration = 0;
    mesh.userData.baseScale = 52;
    return mesh;
  }

  private recycle(index: number): void {
    const mesh = this.active[index];
    this.group.remove(mesh);
    this.pool.push(mesh);
    this.active.splice(index, 1);
  }
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

class ArtifactShard {
  readonly id: string;
  private readonly parent: Group;
  readonly group: Group;
  private readonly core: Mesh;
  private readonly ring: Mesh;
  private readonly aura: Mesh;
  private readonly coreMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly auraMaterial: MeshBasicMaterial;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private initialized = false;
  private time = 0;
  private kind: ArtifactKind = 'damage-core';
  private readonly floatPhase = Math.random() * Math.PI * 2;

  constructor(id: string, parent: Group) {
    this.id = id;
    this.parent = parent;
    this.group = new Group();
    this.group.renderOrder = 3;

    this.coreMaterial = new MeshStandardMaterial({
      color: ARTIFACT_COLORS['damage-core'].core,
      emissive: 0x0f172a,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.65
    });
    this.core = new Mesh(new IcosahedronGeometry(9, 0), this.coreMaterial);
    this.core.castShadow = false;
    this.core.receiveShadow = false;
    this.group.add(this.core);

    this.ringMaterial = new MeshBasicMaterial({
      color: ARTIFACT_COLORS['damage-core'].core,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.ring = new Mesh(new TorusGeometry(12, 1.6, 12, 28), this.ringMaterial);
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);

    const auraTexture = createRadialTexture('rgba(255,255,255,0.25)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)');
    this.auraMaterial = new MeshBasicMaterial({
      map: auraTexture,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false
    });
    const auraGeometry = new PlaneGeometry(1, 1);
    auraGeometry.rotateX(-Math.PI / 2);
    this.aura = new Mesh(auraGeometry, this.auraMaterial);
    this.aura.renderOrder = 1;
    this.group.add(this.aura);

    parent.add(this.group);
  }

  setState(x: number, y: number, kind: ArtifactKind, age: number): void {
    this.targetPosition.set(x, y);
    if (!this.initialized) {
      this.currentPosition.set(x, y);
      this.group.position.set(x, 0, y);
      this.initialized = true;
    }
    if (this.kind !== kind) {
      this.kind = kind;
      const swatch = ARTIFACT_COLORS[kind];
      this.coreMaterial.color.setHex(swatch.core);
      this.ringMaterial.color.setHex(swatch.core);
      this.auraMaterial.color.setHex(swatch.glow);
    }
    this.time = age;
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const lerp = Math.min(1, deltaSeconds * 7);
    this.currentPosition.lerp(this.targetPosition, lerp);
    this.group.position.set(this.currentPosition.x, 0, this.currentPosition.y);

    const float = Math.sin((this.time + this.floatPhase) * 2.4) * 3.5 + 11;
    this.core.position.y = float;
    this.ring.position.y = float - 2.5;
    this.aura.position.y = 1.2;

    this.core.rotation.x += deltaSeconds * 0.8;
    this.core.rotation.y += deltaSeconds * 1.1;
    this.ring.rotation.z += deltaSeconds * 0.7;

    const auraScale = 36 + Math.sin((this.time + this.floatPhase) * 3) * 4;
    this.aura.scale.setScalar(auraScale);
    this.auraMaterial.opacity = 0.24 + Math.sin((this.time + this.floatPhase) * 2.6) * 0.08;
  }

  getPosition(): Vector2 {
    return this.currentPosition.clone();
  }

  getAge(): number {
    return this.time;
  }

  getKind(): ArtifactKind {
    return this.kind;
  }

  dispose(): void {
    if (this.group.parent === this.parent) {
      this.parent.remove(this.group);
    }
    this.core.geometry.dispose();
    this.coreMaterial.dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    (this.aura.geometry as PlaneGeometry).dispose();
    this.auraMaterial.map?.dispose();
    this.auraMaterial.dispose();
  }
}

class XpOrb {
  readonly mesh: Mesh;
  readonly id: string;
  private readonly currentPosition = new Vector2();
  private readonly targetPosition = new Vector2();
  private readonly material: ShaderMaterial;
  private baseAmount = 0;
  private spawnTime = 0;
  private initialized = false;

  constructor(id: string, parent: Group) {
    this.id = id;
    const geometry = new PlaneGeometry(18, 18);
    this.material = createXpOrbMaterial();
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  setState(x: number, y: number, amount: number, age: number): void {
    this.targetPosition.set(x, y);
    if (!this.initialized) {
      this.currentPosition.set(x, y);
      this.initialized = true;
    }
    this.baseAmount = amount;
    this.spawnTime = XP_ORB_TIME.value - age;
    this.material.uniforms.uSpawnTime.value = this.spawnTime;
    this.material.uniforms.uAmount.value = amount;
  }

  update(deltaSeconds: number): void {
    const lerpFactor = Math.min(1, deltaSeconds * 6);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.mesh.position.set(this.currentPosition.x, 0, this.currentPosition.y);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    disposeMaterial(this.material);
  }
}

function createBiomeMaterials(biome: LevelData['biome'], seed: number): {
  floor: MeshStandardMaterial;
  spawn: MeshStandardMaterial;
  wall: MeshStandardMaterial;
} {
  const rng = mulberry32(seed ^ 0x9e3779b9);

  const atlas = packCanvasTextures([
    { id: 'floor', texture: createFloorTexture(biome, rng) },
    { id: 'spawn', texture: createSpawnTexture(biome, rng) },
    { id: 'wall', texture: createWallTexture(biome, rng) }
  ]);

  const floorMaterial = new MeshStandardMaterial({
    map: atlas.texture,
    color: 0xffffff,
    metalness: 0.08,
    roughness: 0.78,
    transparent: true
  });
  applyTextureRegion(floorMaterial, atlas.regions.floor);

  const spawnMaterial = new MeshStandardMaterial({
    map: atlas.texture,
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.7,
    transparent: true
  });
  applyTextureRegion(spawnMaterial, atlas.regions.spawn);

  const wallMaterial = new MeshStandardMaterial({
    map: atlas.texture,
    color: 0xffffff,
    metalness: 0.2,
    roughness: 0.55,
    transparent: true
  });
  applyTextureRegion(wallMaterial, atlas.regions.wall);

  return { floor: floorMaterial, spawn: spawnMaterial, wall: wallMaterial };
}

type TextureRegion = {
  offset: { x: number; y: number };
  size: { x: number; y: number };
};

function applyTextureRegion(material: MeshStandardMaterial, region: TextureRegion): void {
  const map = material.map;
  if (!map) {
    return;
  }
  map.offset.set(region.offset.x, region.offset.y);
  map.repeat.set(region.size.x, region.size.y);
  map.needsUpdate = true;
}

function packCanvasTextures(
  entries: Array<{ id: string; texture: CanvasTexture }>
): { texture: CanvasTexture; regions: Record<string, TextureRegion> } {
  let totalWidth = 0;
  let maxHeight = 0;
  for (const entry of entries) {
    const image = entry.texture.image as HTMLCanvasElement;
    totalWidth += image.width;
    maxHeight = Math.max(maxHeight, image.height);
  }
  const atlasWidth = nextPowerOfTwo(totalWidth);
  const atlasHeight = nextPowerOfTwo(maxHeight);
  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create atlas context');
  }

  const regions: Record<string, TextureRegion> = {};
  let cursorX = 0;
  for (const entry of entries) {
    const image = entry.texture.image as HTMLCanvasElement;
    const drawY = atlasHeight - image.height;
    ctx.drawImage(image, cursorX, drawY);
    regions[entry.id] = {
      offset: { x: cursorX / atlasWidth, y: drawY / atlasHeight },
      size: { x: image.width / atlasWidth, y: image.height / atlasHeight }
    };
    cursorX += image.width;
    entry.texture.dispose();
  }

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.flipY = false;

  return { texture, regions };
}

function getSkyPalette(biome: LevelData['biome']): { zenith: string; horizon: string; glow: string } {
  switch (biome) {
    case 'barnyard':
      return { zenith: '#0b1221', horizon: '#1f2a44', glow: 'rgba(244, 187, 120, 0.35)' };
    case 'forest':
      return { zenith: '#041822', horizon: '#123245', glow: 'rgba(74, 222, 128, 0.32)' };
    case 'lab':
    default:
      return { zenith: '#0a1328', horizon: '#1d3f66', glow: 'rgba(96, 165, 250, 0.4)' };
  }
}

function createHorizonTexture(biome: LevelData['biome']): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create horizon texture');
  }
  const palette = getSkyPalette(biome);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette.zenith);
  gradient.addColorStop(0.65, palette.horizon);
  gradient.addColorStop(1, 'rgba(4,7,15,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height * 0.78, canvas.width * 0.42, canvas.height * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createFloorTexture(biome: LevelData['biome'], rng: () => number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create floor texture context');
  }
  ctx.imageSmoothingEnabled = false;

  const palette = getBiomePalette(biome);
  ctx.fillStyle = palette.floorBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const strokes = 220;
  for (let i = 0; i < strokes; i += 1) {
    const x = Math.floor(rng() * canvas.width);
    const y = Math.floor(rng() * canvas.height);
    const length = rng() * 12 + 4;
    const angle = rng() * Math.PI * 2;
    ctx.strokeStyle = rng() > 0.5 ? palette.floorAccent : palette.floorSecondary;
    ctx.globalAlpha = 0.18 + rng() * 0.12;
    ctx.lineWidth = 2 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createBiomePropAssets(biome: LevelData['biome']): {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
} {
  switch (biome) {
    case 'barnyard': {
      const geometry = new CylinderGeometry(6, 8, 18, 8, 1, false);
      const material = new MeshStandardMaterial({
        color: 0xf9a825,
        emissive: 0x331c04,
        roughness: 0.7,
        metalness: 0.05
      });
      return { geometry, material };
    }
    case 'forest': {
      const geometry = new ConeGeometry(8, 24, 8, 1);
      const material = new MeshStandardMaterial({
        color: 0x16a34a,
        emissive: 0x0f5130,
        roughness: 0.6,
        metalness: 0.1
      });
      return { geometry, material };
    }
    case 'lab':
    default: {
      const geometry = new CylinderGeometry(3.5, 3.5, 26, 10, 1, false);
      const material = new MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x0f172a,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.45
      });
      return { geometry, material };
    }
  }
}

function createXpOrbMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: XP_ORB_TIME,
      uSpawnTime: { value: 0 },
      uAmount: { value: 0 }
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      uniform float uSpawnTime;
      uniform float uAmount;
      varying float vAmount;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        float age = max(0.0, uTime - uSpawnTime);
        float bob = sin(age * 3.4) * 4.0 + 5.0;
        float scaleBase = 0.7 + min(uAmount / 30.0, 1.0) * 0.5;
        float scalePulse = scaleBase + sin(age * 6.0) * 0.1;

        vec3 worldPosition = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
        vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
        vec3 offset = (right * (position.x) + up * (position.y)) * scalePulse;
        vec3 billboardPos = worldPosition + offset + vec3(0.0, bob, 0.0);

        vAmount = uAmount;
        gl_Position = projectionMatrix * viewMatrix * vec4(billboardPos, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAmount;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered);
        float strength = clamp(vAmount / 18.0, 0.0, 1.0);
        vec3 innerColor = mix(vec3(0.99, 0.92, 0.64), vec3(1.0, 0.84, 0.35), strength);
        float alpha = smoothstep(0.55, 0.08, dist);
        if (alpha <= 0.01) {
          discard;
        }
        gl_FragColor = vec4(innerColor, alpha * (0.75 + strength * 0.2));
      }
    `
  });
}

function createSpawnTexture(biome: LevelData['biome'], rng: () => number): CanvasTexture {
  const texture = createFloorTexture(biome, rng);
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return texture;
  }
  const palette = getBiomePalette(biome);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width * 0.32;
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
  gradient.addColorStop(0, palette.spawnGlow);
  gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  texture.needsUpdate = true;
  return texture;
}

function createWallTexture(biome: LevelData['biome'], rng: () => number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create wall texture context');
  }
  ctx.imageSmoothingEnabled = false;
  const palette = getBiomePalette(biome);
  ctx.fillStyle = palette.wallBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bands = 6;
  for (let i = 0; i < bands; i += 1) {
    const y = (canvas.height / bands) * i;
    ctx.fillStyle = palette.wallAccent;
    ctx.globalAlpha = 0.25 + rng() * 0.15;
    ctx.fillRect(0, y, canvas.width, 6);
  }
  ctx.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function getBiomePalette(biome: LevelData['biome']): {
  floorBase: string;
  floorAccent: string;
  floorSecondary: string;
  spawnGlow: string;
  wallBase: string;
  wallAccent: string;
} {
  switch (biome) {
    case 'barnyard':
      return {
        floorBase: '#33261a',
        floorAccent: '#d9a066',
        floorSecondary: 'rgba(244, 187, 120, 0.8)',
        spawnGlow: 'rgba(255, 196, 125, 0.55)',
        wallBase: '#3a2d1c',
        wallAccent: 'rgba(234, 179, 85, 0.6)'
      };
    case 'forest':
      return {
        floorBase: '#1f3520',
        floorAccent: '#6ee7b7',
        floorSecondary: 'rgba(167, 243, 208, 0.8)',
        spawnGlow: 'rgba(74, 222, 128, 0.55)',
        wallBase: '#1d2b21',
        wallAccent: 'rgba(94, 234, 212, 0.6)'
      };
    case 'lab':
    default:
      return {
        floorBase: '#1a2433',
        floorAccent: '#60a5fa',
        floorSecondary: 'rgba(96, 165, 250, 0.8)',
        spawnGlow: 'rgba(96, 165, 250, 0.55)',
        wallBase: '#161f2c',
        wallAccent: 'rgba(165, 180, 252, 0.55)'
      };
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function disposeModel(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      const mesh = child as Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => disposeMaterial(material));
      } else {
        disposeMaterial(mesh.material);
      }
      mesh.geometry.dispose();
    }
  });
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
