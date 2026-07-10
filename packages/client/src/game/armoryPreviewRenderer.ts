import type { AudioController } from './audio';
import { SpriteAnimator, loadSkin, type ResolvedVisual, type SpriteAtlas } from './sprites';

type PreviewState = {
  cosmeticId?: string | null;
  tint?: number | null;
};

interface ArmoryPreviewOptions {
  maxDpr?: number;
  audio?: AudioController;
}

const DEFAULT_TINT = 0xfacc15;
const FRAME_INTERVAL_MS = 1000 / 30;

/** Accent colors for upgrade preview pulses, keyed by armory item id. */
const UPGRADE_COLORS: Record<string, string> = {
  'focus-matrix': '#38bdf8',
  'celerity-core': '#22d3ee',
  'bulwark-weave': '#34d399',
  'rift-channeler': '#818cf8',
  'magnet-surge': '#facc15'
};

/**
 * Armory hero preview. Draws the player's sprite (plus cosmetic overlays and
 * upgrade pulses) from the shared skin atlas onto a plain 2D canvas — no
 * second WebGL context, capped at 30 fps, paused while hidden.
 */
export class ArmoryPreviewRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly stage: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maxDpr: number;
  private readonly resizeObserver: ResizeObserver;
  private readonly handleVisibilityChange: () => void;
  private readonly audio: AudioController | undefined;
  private readonly animator = new SpriteAnimator();
  private readonly cosmeticAnimator = new SpriteAnimator();
  private readonly tintCanvas = document.createElement('canvas');

  private atlas: SpriteAtlas | null = null;
  private heroVisual: ResolvedVisual | null = null;
  private cosmeticVisual: ResolvedVisual | null = null;
  private running = false;
  private visible = true;
  private disposed = false;
  private requestId: number | null = null;
  private lastFrame = 0;
  private time = 0;
  private effectTimeout = 0;
  private activeUpgradeColor = '#38bdf8';
  private currentCosmeticId: string | null = null;
  private currentTint = DEFAULT_TINT;

  constructor(stage: HTMLElement, options: ArmoryPreviewOptions = {}) {
    this.stage = stage;
    this.maxDpr = options.maxDpr ?? 1.5;
    this.audio = options.audio;
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('hud-armory-preview-canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create armory preview context');
    }
    this.ctx = ctx;

    void loadSkin().then((atlas) => {
      if (this.disposed) {
        return;
      }
      this.atlas = atlas;
      this.heroVisual = atlas.getVisual('player');
      this.animator.setVisual(this.heroVisual);
      this.applyCosmetic(this.currentCosmeticId);
    });

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
        this.requestId = window.requestAnimationFrame((timestamp) => this.tick(timestamp));
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
    }
    if ('cosmeticId' in state) {
      this.applyCosmetic(state.cosmeticId ?? null);
    }
  }

  previewUpgrade(upgradeId: string): void {
    if (!this.visible) {
      return;
    }
    this.activeUpgradeColor = UPGRADE_COLORS[upgradeId] ?? '#38bdf8';
    this.effectTimeout = 1.4;
    this.audio?.playArmoryHover();
  }

  clearUpgrade(): void {
    this.effectTimeout = 0;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.stage;
    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio ?? 1, this.maxDpr);
    this.canvas.width = Math.round(clientWidth * dpr);
    this.canvas.height = Math.round(clientHeight * dpr);
    this.canvas.style.width = `${clientWidth}px`;
    this.canvas.style.height = `${clientHeight}px`;
  }

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.canvas.isConnected) {
      this.canvas.remove();
    }
  }

  private tick(timestamp: number): void {
    if (!this.running) {
      return;
    }
    if (this.lastFrame === 0) {
      this.lastFrame = timestamp;
    }
    const elapsed = timestamp - this.lastFrame;
    if (elapsed >= FRAME_INTERVAL_MS) {
      const deltaSeconds = Math.min(0.1, elapsed / 1000);
      this.lastFrame = timestamp;
      this.update(deltaSeconds);
      this.draw();
    }
    this.requestId = window.requestAnimationFrame((time) => this.tick(time));
  }

  private update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.animator.update(deltaSeconds);
    this.cosmeticAnimator.update(deltaSeconds);
    if (this.effectTimeout > 0) {
      this.effectTimeout = Math.max(0, this.effectTimeout - deltaSeconds);
    }
  }

  private draw(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    if (!this.atlas || !this.heroVisual) {
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const spriteSize = Math.min(width, height) * 0.72;
    const sway = Math.sin(this.time * 0.6) * 0.1;

    // Grounding glow under the hero.
    const glow = ctx.createRadialGradient(cx, cy + spriteSize * 0.32, spriteSize * 0.05, cx, cy + spriteSize * 0.32, spriteSize * 0.42);
    glow.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
    glow.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Upgrade pulse rings behind the hero.
    if (this.effectTimeout > 0) {
      const progress = 1 - this.effectTimeout / 1.4;
      for (let i = 0; i < 2; i += 1) {
        const ringProgress = (progress + i * 0.5) % 1;
        ctx.strokeStyle = this.activeUpgradeColor;
        ctx.globalAlpha = (1 - ringProgress) * 0.65;
        ctx.lineWidth = Math.max(2, spriteSize * 0.02);
        ctx.beginPath();
        ctx.ellipse(cx, cy + spriteSize * 0.3, spriteSize * (0.16 + ringProgress * 0.34), spriteSize * (0.05 + ringProgress * 0.1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const heroFrame = this.animator.getFrame();
    if (heroFrame) {
      this.drawFrame(heroFrame.rect, cx, cy, spriteSize, sway, this.heroVisual.tintable ? this.currentTint : null);
    }

    if (this.cosmeticVisual) {
      const cosmeticFrame = this.cosmeticAnimator.getFrame();
      if (cosmeticFrame) {
        this.drawFrame(cosmeticFrame.rect, cx, cy, spriteSize, sway, null);
      }
    }
  }

  private drawFrame(
    rect: { x: number; y: number; w: number; h: number },
    cx: number,
    cy: number,
    size: number,
    rotation: number,
    tint: number | null
  ): void {
    if (!this.atlas) {
      return;
    }
    const ctx = this.ctx;
    let source: CanvasImageSource = this.atlas.source;
    let sx = rect.x;
    let sy = rect.y;
    if (tint !== null) {
      this.applyTint(rect, tint);
      source = this.tintCanvas;
      sx = 0;
      sy = 0;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.drawImage(source, sx, sy, rect.w, rect.h, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private applyTint(rect: { x: number; y: number; w: number; h: number }, tint: number): void {
    const tintCtx = this.tintCanvas.getContext('2d');
    if (!tintCtx) {
      return;
    }
    if (this.tintCanvas.width !== rect.w || this.tintCanvas.height !== rect.h) {
      this.tintCanvas.width = rect.w;
      this.tintCanvas.height = rect.h;
    }
    tintCtx.clearRect(0, 0, rect.w, rect.h);
    tintCtx.imageSmoothingEnabled = false;
    tintCtx.drawImage(this.atlas!.source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'multiply';
    tintCtx.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
    tintCtx.fillRect(0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'destination-in';
    tintCtx.drawImage(this.atlas!.source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'source-over';
  }

  private applyCosmetic(id: string | null): void {
    this.currentCosmeticId = id;
    if (!this.atlas) {
      return;
    }
    this.cosmeticVisual = id ? this.atlas.getVisual(`cosmetic:${id}`) : null;
    this.cosmeticAnimator.setVisual(this.cosmeticVisual);
  }
}
