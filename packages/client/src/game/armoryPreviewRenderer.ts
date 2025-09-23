import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material
} from 'three';

import { applyChickenTint, buildBaseChickenRig, createCosmeticAttachment } from './armoryAssets';
import type { ChickenRig } from './armoryAssets';
import { ArmoryEffects } from './armoryEffects';
import type { AudioController } from './audio';

type PreviewState = {
  cosmeticId?: string | null;
  tint?: number | null;
};

interface ArmoryPreviewOptions {
  maxDpr?: number;
  audio?: AudioController;
}

const DEFAULT_TINT = 0xfacc15;

export class ArmoryPreviewRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly stage: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly scene: Scene;
  private readonly root: Group;
  private readonly rigInstance: { group: Group; rig: ChickenRig; dispose: () => void };
  private readonly effects: ArmoryEffects;
  private readonly maxDpr: number;
  private readonly resizeObserver: ResizeObserver;
  private readonly handleVisibilityChange: () => void;
  private readonly audio: AudioController | undefined;
  private readonly rigBounds = new Box3();
  private readonly boundCenter = new Vector3();
  private readonly boundSize = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly tempRootPosition = new Vector3();
  private readonly targetCenterY = 4.5;

  private running = false;
  private visible = true;
  private requestId: number | null = null;
  private lastFrame = 0;
  private effectTimeout = 0;
  private currentCosmetic: { id: string; group: Group } | null = null;
  private currentTint = DEFAULT_TINT;
  private orbitTime = 0;

  constructor(stage: HTMLElement, options: ArmoryPreviewOptions = {}) {
    this.stage = stage;
    this.maxDpr = options.maxDpr ?? 1.5;
    this.audio = options.audio;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(new Color(0x000000), 0);
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('hud-armory-preview-canvas');

    this.camera = new PerspectiveCamera(30, 1, 0.1, 100);

    this.scene = new Scene();
    const ambient = new AmbientLight(0xffffff, 0.78);
    this.scene.add(ambient);
    const keyLight = new DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(16, 24, 14);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight(0xbde0fe, 0.4);
    rimLight.position.set(-12, 18, -12);
    this.scene.add(rimLight);

    this.root = new Group();
    this.scene.add(this.root);

    this.rigInstance = buildBaseChickenRig({ primaryColor: DEFAULT_TINT, scale: 0.66 });
    this.rigInstance.group.rotation.y = Math.PI / 6;
    this.root.add(this.rigInstance.group);

    this.effects = new ArmoryEffects();
    this.effects.group.position.set(0, 0, 0);
    this.root.add(this.effects.group);

    this.calibrateView();

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.handleVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      this.setActive(!isHidden && this.visible);
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  mount(): void {
    if (!this.canvas.isConnected) {
      this.stage.appendChild(this.canvas);
    }
    this.resizeObserver.observe(this.stage);
    this.visible = true;
    this.setActive(true);
    this.resize();
  }

  setActive(active: boolean): void {
    if (this.visible === active && this.running === active) {
      return;
    }
    this.visible = active;
    const shouldRun = active && document.visibilityState !== 'hidden';
    if (shouldRun) {
      if (!this.running) {
        this.running = true;
        this.lastFrame = 0;
        this.requestId = window.requestAnimationFrame((time) => this.tick(time));
      }
    } else {
      if (this.running) {
        this.running = false;
        if (this.requestId !== null) {
          window.cancelAnimationFrame(this.requestId);
          this.requestId = null;
        }
      }
      this.clearUpgrade();
    }
  }

  setState(state: PreviewState): void {
    if (typeof state.tint === 'number') {
      this.currentTint = state.tint;
      applyChickenTint(this.rigInstance.group, state.tint);
    }
    if ('cosmeticId' in state) {
      this.applyCosmetic(state.cosmeticId ?? null);
    }
  }

  previewUpgrade(upgradeId: string): void {
    if (!this.visible) {
      return;
    }
    this.effects.playLoop(upgradeId, this.rigInstance.rig);
    this.effectTimeout = 1.4;
    this.audio?.playArmoryHover();
  }

  clearUpgrade(): void {
    this.effects.stopLoop();
    this.effectTimeout = 0;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.stage;
    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio ?? 1, this.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.setActive(false);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.canvas.isConnected) {
      this.canvas.remove();
    }
    this.effects.dispose();
    this.rigInstance.dispose();
    this.renderer.dispose();
    if (this.currentCosmetic) {
      this.disposeCosmetic(this.currentCosmetic.group);
      this.currentCosmetic = null;
    }
  }

  private tick(timestamp: number): void {
    if (!this.running) {
      return;
    }
    if (this.lastFrame === 0) {
      this.lastFrame = timestamp;
    }
    const frameInterval = 1000 / 30;
    const elapsed = timestamp - this.lastFrame;
    if (elapsed >= frameInterval) {
      const deltaSeconds = Math.min(0.1, elapsed / 1000);
      this.lastFrame = timestamp;
      this.update(deltaSeconds);
      this.renderer.render(this.scene, this.camera);
    }
    this.requestId = window.requestAnimationFrame((time) => this.tick(time));
  }

  private update(deltaSeconds: number): void {
    this.effects.update(deltaSeconds);
    this.orbitTime += deltaSeconds;
    this.rigInstance.group.rotation.y = Math.PI / 6 + Math.sin(this.orbitTime * 0.3) * 0.08;
    if (this.effectTimeout > 0) {
      this.effectTimeout -= deltaSeconds;
      if (this.effectTimeout <= 0) {
        this.clearUpgrade();
      }
    }
  }

  private applyCosmetic(id: string | null): void {
    if (this.currentCosmetic?.id === id) {
      return;
    }
    if (this.currentCosmetic) {
      this.rigInstance.group.remove(this.currentCosmetic.group);
      this.disposeCosmetic(this.currentCosmetic.group);
      this.currentCosmetic = null;
    }
    if (!id) {
      this.calibrateView();
      return;
    }
    const attachment = createCosmeticAttachment(id, { tint: this.currentTint });
    if (!attachment) {
      this.calibrateView();
      return;
    }
    this.positionAttachment(attachment);
    this.rigInstance.group.add(attachment);
    this.currentCosmetic = { id, group: attachment };
    this.calibrateView();
  }

  private calibrateView(): void {
    this.tempRootPosition.copy(this.root.position);
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.rigInstance.group.updateWorldMatrix(true, true);
    this.rigBounds.setFromObject(this.rigInstance.group);
    if (!Number.isFinite(this.rigBounds.min.y) || !Number.isFinite(this.rigBounds.max.y)) {
      this.root.position.copy(this.tempRootPosition);
      this.root.updateMatrixWorld(true);
      return;
    }
    this.rigBounds.getCenter(this.boundCenter);
    this.rigBounds.getSize(this.boundSize);

    this.root.position.set(-this.boundCenter.x, this.targetCenterY - this.boundCenter.y, -this.boundCenter.z);
    this.root.updateMatrixWorld(true);

    const paddedHeight = Math.max(this.boundSize.y, 6);
    const distance = Math.max(26, paddedHeight * 3.1);
    const cameraHeight = this.targetCenterY + paddedHeight * 0.62;

    this.camera.position.set(0, cameraHeight, distance);
    this.lookTarget.set(0, this.targetCenterY, 0);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateProjectionMatrix();
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
          (material as Material).dispose();
        }
      }
      child.geometry.dispose();
    });
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}
