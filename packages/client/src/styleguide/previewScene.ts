import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';

import type { EnemyKind } from '@farsight/shared';

import { applyChickenTint, buildBaseChickenRig, createCosmeticAttachment, type ChickenRig } from '../game/armoryAssets';
import { ArmoryEffects } from '../game/armoryEffects';
import { createEnemyModel, disposeEnemyModel, type EnemyRig } from '../game/enemyAssets';

const HERO_DEFAULT_TINT = 0xfacc15;
const GROUND_COLOR = 0x0e172a;
const GROUND_EMISSIVE = 0x1f2a44;

export type HeroPose = 'idle' | 'run' | 'attack';

class HeroPreview {
  readonly group: Group;

  private readonly rigInstance: { group: Group; rig: ChickenRig; dispose: () => void };
  private readonly effects: ArmoryEffects;

  private currentTint = HERO_DEFAULT_TINT;
  private currentPose: HeroPose = 'run';
  private targetMovement = 1;
  private movementBlend = 1;
  private attackTimer = 0;
  private time = 0;
  private orbitTime = 0;
  private cosmetic: { id: string; group: Group } | null = null;
  private upgradeId: string | null = null;

  constructor() {
    this.group = new Group();
    this.group.position.set(0, 0, 0);

    this.rigInstance = buildBaseChickenRig({ primaryColor: this.currentTint, scale: 0.78 });
    this.rigInstance.group.position.set(0, 0, 0);
    this.rigInstance.group.rotation.y = Math.PI / 8;
    this.group.add(this.rigInstance.group);

    this.effects = new ArmoryEffects();
    this.effects.group.position.set(0, 0, 0);
    this.group.add(this.effects.group);
  }

  getFocusHeight(): number {
    return 8;
  }

  setTint(color: number): void {
    if (this.currentTint === color) {
      return;
    }
    this.currentTint = color;
    applyChickenTint(this.rigInstance.group, color);
    if (this.cosmetic) {
      const currentId = this.cosmetic.id;
      this.removeCosmetic();
      this.setCosmetic(currentId);
    }
  }

  setCosmetic(id: string | null): void {
    if (this.cosmetic?.id === id) {
      return;
    }
    this.removeCosmetic();
    if (!id) {
      return;
    }
    const attachment = createCosmeticAttachment(id, { tint: this.currentTint });
    if (!attachment) {
      return;
    }
    this.positionAttachment(attachment);
    this.rigInstance.group.add(attachment);
    this.cosmetic = { id, group: attachment };
  }

  setUpgrade(id: string | null): void {
    if (this.upgradeId === id) {
      return;
    }
    if (!id) {
      this.effects.stopLoop();
      this.upgradeId = null;
      return;
    }
    this.effects.playLoop(id, this.rigInstance.rig);
    this.upgradeId = id;
  }

  setPose(pose: HeroPose): void {
    if (this.currentPose === pose) {
      return;
    }
    this.currentPose = pose;
    if (pose === 'idle') {
      this.targetMovement = 0.08;
    } else if (pose === 'run') {
      this.targetMovement = 1;
      this.attackTimer = 0;
    } else {
      this.targetMovement = 1.1;
      this.attackTimer = 0.32;
    }
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.orbitTime += deltaSeconds;
    const rig = this.rigInstance.rig;

    this.movementBlend = MathUtils.lerp(this.movementBlend, this.targetMovement, Math.min(1, deltaSeconds * 3.2));

    if (this.currentPose === 'attack') {
      this.attackTimer -= deltaSeconds;
      if (this.attackTimer <= 0) {
        this.attackTimer = 0.32;
      }
    } else {
      this.attackTimer = Math.max(0, this.attackTimer - deltaSeconds * 1.5);
    }

    const attackBoost = 1 + (this.attackTimer > 0 ? this.attackTimer * 2.4 : 0);
    const flapSpeed = 5.2 + this.movementBlend * 6.4;
    const flapAmplitude = 0.28 + this.movementBlend * 0.42;
    const phase = this.time * flapSpeed;
    const flap = Math.sin(phase) * flapAmplitude * attackBoost;

    rig.leftWing.rotation.z = rig.base.leftWingZ + flap;
    rig.rightWing.rotation.z = rig.base.rightWingZ - flap;

    const headBob = Math.sin(this.time * 3.4) * 0.12 * (0.5 + this.movementBlend);
    rig.head.rotation.x = rig.base.headX + headBob - Math.max(0, this.attackTimer * 0.6);

    const tailSwing = Math.sin(this.time * 4.2) * 0.18 * (0.4 + this.movementBlend);
    rig.tail.rotation.x = rig.base.tailX + tailSwing + this.movementBlend * 0.18;
    rig.tail.rotation.y = Math.cos(this.time * 3.1) * 0.22 * (0.3 + this.movementBlend);

    this.rigInstance.group.rotation.y = Math.PI / 8 + Math.sin(this.orbitTime * 0.4) * 0.08;

    this.effects.update(deltaSeconds);
  }

  dispose(): void {
    this.effects.dispose();
    this.removeCosmetic();
    this.rigInstance.dispose();
  }

  private removeCosmetic(): void {
    if (!this.cosmetic) {
      return;
    }
    this.rigInstance.group.remove(this.cosmetic.group);
    this.disposeCosmetic(this.cosmetic.group);
    this.cosmetic = null;
  }

  private positionAttachment(group: Group): void {
    const anchors = (group.userData as { anchors?: Record<string, Vector3> }).anchors ?? null;
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    if (!anchors) {
      return;
    }
    if (anchors.crest) {
      group.position.copy(anchors.crest);
    } else if (anchors.tail) {
      group.position.copy(anchors.tail);
    } else if (anchors.back) {
      group.position.copy(anchors.back);
    }
  }

  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  private disposeCosmetic(node: Group): void {
    node.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material && typeof material.dispose === 'function') {
          (material as MeshStandardMaterial).dispose();
        }
      }
      child.geometry.dispose();
    });
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}

class EnemyPreview {
  readonly group: Group;

  private kind: EnemyKind | null = null;
  private model: Group | null = null;
  private rig: EnemyRig | null = null;
  private baseHeight = 9;
  private time = 0;

  constructor() {
    this.group = new Group();
    this.group.visible = false;
  }

  getFocusHeight(): number {
    return this.baseHeight;
  }

  setKind(kind: EnemyKind): void {
    if (this.kind === kind) {
      return;
    }
    if (this.model) {
      this.group.remove(this.model);
      disposeEnemyModel(this.model);
      this.model = null;
      this.rig = null;
    }
    this.model = createEnemyModel(kind);
    this.rig = (this.model.userData.rig as EnemyRig | undefined) ?? null;
    this.baseHeight = kind === 'coyote' ? 14 : 9;
    this.model.position.set(0, this.baseHeight, 0);
    this.model.rotation.y = Math.PI / 6;
    this.group.add(this.model);
    this.group.visible = true;
    this.kind = kind;
    this.time = 0;
  }

  update(deltaSeconds: number): void {
    if (!this.model || !this.kind) {
      return;
    }
    this.time += deltaSeconds;
    const hover = Math.sin(this.time * 2.6) * 0.4;
    this.model.position.y = this.baseHeight + hover;
    this.model.rotation.y = Math.sin(this.time * 0.6) * 0.2 + Math.PI / 6;

    if (this.kind === 'owl' && this.rig?.leftWing && this.rig?.rightWing && this.rig.base) {
      const flap = Math.sin(this.time * 5.4) * 0.35;
      if (this.rig.base.leftWingZ !== undefined) {
        this.rig.leftWing.rotation.z = this.rig.base.leftWingZ + flap;
      }
      if (this.rig.base.rightWingZ !== undefined) {
        this.rig.rightWing.rotation.z = this.rig.base.rightWingZ - flap;
      }
    }

    if (this.kind === 'weasel' && this.rig?.tail) {
      const wag = Math.sin(this.time * 6.2) * 0.35;
      if (this.rig.base?.tailZ !== undefined) {
        this.rig.tail.rotation.z = this.rig.base.tailZ + wag;
      } else {
        this.rig.tail.rotation.z = wag;
      }
      this.rig.tail.rotation.y = Math.cos(this.time * 3.8) * 0.18;
    }
  }

  dispose(): void {
    if (this.model) {
      this.group.remove(this.model);
      disposeEnemyModel(this.model);
      this.model = null;
    }
    this.rig = null;
    this.kind = null;
  }
}

export class StyleguidePreview {
  private readonly container: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly root: Group;
  private readonly hero: HeroPreview;
  private readonly enemy: EnemyPreview;
  private readonly resizeObserver: ResizeObserver;
  private readonly wheelListenerOptions: AddEventListenerOptions = { passive: false };

  private mode: 'hero' | 'enemy' = 'hero';
  private autoRotate = true;
  private autoRotateListener: ((enabled: boolean) => void) | null = null;
  private readonly cameraTarget = new Vector3(0, 8, 0);
  private cameraRadius = 32;
  private cameraAzimuth = Math.PI / 6;
  private cameraPolar = MathUtils.degToRad(32);
  private readonly minPolar = MathUtils.degToRad(10);
  private readonly maxPolar = MathUtils.degToRad(80);
  private readonly minRadius = 10;
  private readonly maxRadius = 70;
  private isDragging = false;
  private activePointerId: number | null = null;
  private dragStart = new Vector2();
  private startAzimuth = 0;
  private startPolar = 0;
  private lastFrame = 0;
  private rafId: number | null = null;
  private cameraDirty = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(new Color(0x070c16), 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(32, 1, 0.1, 200);
    this.camera.position.set(0, 14, 32);
    this.camera.lookAt(this.cameraTarget);

    const offset = this.camera.position.clone().sub(this.cameraTarget);
    this.cameraRadius = offset.length();
    this.cameraAzimuth = Math.atan2(offset.x, offset.z);
    const normalizedY = MathUtils.clamp(offset.y / this.cameraRadius, -1, 1);
    this.cameraPolar = Math.acos(normalizedY);

    const ambient = new AmbientLight(0xdbeafe, 0.6);
    this.scene.add(ambient);
    const keyLight = new DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(18, 24, 18);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight(0x60a5fa, 0.35);
    rimLight.position.set(-20, 18, -12);
    this.scene.add(rimLight);

    this.root = new Group();
    this.scene.add(this.root);

    const ground = new Mesh(
      new PlaneGeometry(46, 46),
      new MeshStandardMaterial({ color: GROUND_COLOR, emissive: new Color(GROUND_EMISSIVE), roughness: 0.85, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = false;
    this.root.add(ground);

    this.hero = new HeroPreview();
    this.root.add(this.hero.group);

    this.enemy = new EnemyPreview();
    this.root.add(this.enemy.group);

    this.setMode('hero');
    this.updateCamera();

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUpOrCancel);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerUpOrCancel);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUpOrCancel);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, this.wheelListenerOptions);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleWindowResize);
    this.resize();
    this.tick(performance.now());
  }

  setMode(mode: 'hero' | 'enemy'): void {
    this.mode = mode;
    this.hero.group.visible = mode === 'hero';
    this.enemy.group.visible = mode === 'enemy';
    this.updateFocusHeight();
  }

  setHeroTint(color: number): void {
    this.hero.setTint(color);
  }

  setHeroCosmetic(id: string | null): void {
    this.hero.setCosmetic(id);
  }

  setHeroUpgrade(id: string | null): void {
    this.hero.setUpgrade(id);
  }

  setHeroPose(pose: HeroPose): void {
    this.hero.setPose(pose);
  }

  setEnemyKind(kind: EnemyKind): void {
    this.enemy.setKind(kind);
    this.setMode('enemy');
  }

  setAutoRotate(enabled: boolean): void {
    if (this.autoRotate === enabled) {
      return;
    }
    this.autoRotate = enabled;
    this.autoRotateListener?.(enabled);
  }

  setAutoRotateChangeListener(listener: (enabled: boolean) => void): void {
    this.autoRotateListener = listener;
    listener(this.autoRotate);
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.handleWindowResize);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUpOrCancel);
    canvas.removeEventListener('pointerleave', this.handlePointerUpOrCancel);
    canvas.removeEventListener('pointercancel', this.handlePointerUpOrCancel);
    canvas.removeEventListener('wheel', this.handleWheel, this.wheelListenerOptions);
    this.hero.dispose();
    this.enemy.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }

  private tick = (time: number): void => {
    const delta = this.lastFrame === 0 ? 0 : Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;

    if (this.mode === 'hero') {
      this.hero.update(delta);
    } else {
      this.enemy.update(delta);
    }

    if (this.autoRotate && !this.isDragging) {
      this.cameraAzimuth += delta * 0.35;
      this.cameraDirty = true;
    }

    if (this.cameraDirty) {
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private handleWindowResize = (): void => {
    this.resize();
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.isDragging = true;
    this.activePointerId = event.pointerId;
    this.dragStart.set(event.clientX, event.clientY);
    this.startAzimuth = this.cameraAzimuth;
    this.startPolar = this.cameraPolar;
    this.renderer.domElement.classList.add('is-dragging');
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.setAutoRotate(false);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.isDragging || this.activePointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - this.dragStart.x;
    const deltaY = event.clientY - this.dragStart.y;
    this.cameraAzimuth = this.startAzimuth - deltaX * 0.005;
    this.cameraPolar = MathUtils.clamp(this.startPolar - deltaY * 0.004, this.minPolar, this.maxPolar);
    this.cameraDirty = true;
  };

  private handlePointerUpOrCancel = (event: PointerEvent): void => {
    if (!this.isDragging || this.activePointerId !== event.pointerId) {
      return;
    }
    this.isDragging = false;
    this.activePointerId = null;
    this.renderer.domElement.classList.remove('is-dragging');
    this.renderer.domElement.releasePointerCapture(event.pointerId);
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const zoomDelta = event.deltaY * 0.04;
    this.cameraRadius = MathUtils.clamp(this.cameraRadius + zoomDelta, this.minRadius, this.maxRadius);
    this.cameraDirty = true;
  };

  private updateCamera(): void {
    const sinPolar = Math.sin(this.cameraPolar);
    const x = this.cameraTarget.x + this.cameraRadius * sinPolar * Math.sin(this.cameraAzimuth);
    const y = this.cameraTarget.y + this.cameraRadius * Math.cos(this.cameraPolar);
    const z = this.cameraTarget.z + this.cameraRadius * sinPolar * Math.cos(this.cameraAzimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.cameraTarget);
    this.cameraDirty = false;
  }

  private updateFocusHeight(): void {
    const focusHeight = this.mode === 'hero' ? this.hero.getFocusHeight() : this.enemy.getFocusHeight();
    this.cameraTarget.y = focusHeight;
    this.cameraDirty = true;
  }
}
