import type { EnemyKind } from '@starbuds/shared';

import { SpriteAnimator, loadSkin, type ResolvedVisual, type SpriteAtlas } from '../game/sprites';

export type HeroPose = 'idle' | 'run' | 'attack';

const POSE_TO_CLIP: Record<HeroPose, string> = {
  idle: 'idle',
  run: 'move',
  attack: 'attack'
};

const UPGRADE_COLORS: Record<string, string> = {
  'focus-matrix': '#38bdf8',
  'celerity-core': '#22d3ee',
  'bulwark-weave': '#34d399',
  'rift-channeler': '#818cf8',
  'magnet-surge': '#facc15'
};

/**
 * Sprite styleguide stage. Renders any skinnable entity (hero, enemies,
 * cosmetics, upgrade pulses) from the shared atlas at high zoom, with a
 * filmstrip of every animation clip below the live view — the reference
 * surface for authoring new skins (see docs/skinning.md).
 */
export class StyleguidePreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly animator = new SpriteAnimator();
  private readonly cosmeticAnimator = new SpriteAnimator();
  private readonly tintCanvas = document.createElement('canvas');
  private readonly resizeObserver: ResizeObserver;

  private atlas: SpriteAtlas | null = null;
  private visual: ResolvedVisual | null = null;
  private cosmeticVisual: ResolvedVisual | null = null;
  private entityKey = 'player';
  private heroPose: HeroPose = 'run';
  private heroTint = 0xfacc15;
  private heroCosmetic: string | null = null;
  private heroUpgrade: string | null = null;
  private autoRotate = true;
  private rotation = 0;
  private autoRotateListener: ((enabled: boolean) => void) | null = null;
  private requestId: number | null = null;
  private lastFrame = 0;
  private time = 0;
  private disposed = false;
  private dragging = false;
  private dragStartX = 0;
  private dragStartRotation = 0;

  constructor(stage: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'grab';
    stage.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create styleguide preview context');
    }
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.resize(stage));
    this.resizeObserver.observe(stage);
    this.resize(stage);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    void loadSkin().then((atlas) => {
      if (this.disposed) {
        return;
      }
      this.atlas = atlas;
      this.refreshVisual();
    });

    this.requestId = window.requestAnimationFrame((time) => this.tick(time));
  }

  setAutoRotateChangeListener(listener: (enabled: boolean) => void): void {
    this.autoRotateListener = listener;
  }

  setMode(mode: 'hero'): void {
    void mode;
    this.entityKey = 'player';
    this.refreshVisual();
  }

  setEnemyKind(kind: EnemyKind): void {
    this.entityKey = `enemy:${kind}`;
    this.refreshVisual();
  }

  setHeroTint(tint: number): void {
    this.heroTint = tint;
  }

  setHeroPose(pose: HeroPose): void {
    this.heroPose = pose;
    if (this.entityKey === 'player') {
      this.animator.play(POSE_TO_CLIP[pose]);
    }
  }

  setHeroCosmetic(id: string | null): void {
    this.heroCosmetic = id;
    this.refreshCosmetic();
  }

  setHeroUpgrade(id: string | null): void {
    this.heroUpgrade = id;
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }

  dispose(): void {
    this.disposed = true;
    if (this.requestId !== null) {
      window.cancelAnimationFrame(this.requestId);
      this.requestId = null;
    }
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.remove();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartRotation = this.rotation;
    this.canvas.style.cursor = 'grabbing';
    if (this.autoRotate) {
      this.autoRotate = false;
      this.autoRotateListener?.(false);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.rotation = this.dragStartRotation + (event.clientX - this.dragStartX) * 0.01;
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
    this.canvas.style.cursor = 'grab';
  };

  private refreshVisual(): void {
    if (!this.atlas) {
      return;
    }
    this.visual = this.atlas.getVisual(this.entityKey);
    this.animator.setVisual(this.visual);
    if (this.entityKey === 'player') {
      this.animator.play(POSE_TO_CLIP[this.heroPose]);
    } else {
      this.animator.play('move');
    }
    this.refreshCosmetic();
  }

  private refreshCosmetic(): void {
    if (!this.atlas) {
      return;
    }
    const wantCosmetic = this.entityKey === 'player' && this.heroCosmetic;
    this.cosmeticVisual = wantCosmetic ? this.atlas.getVisual(`cosmetic:${this.heroCosmetic}`) : null;
    this.cosmeticAnimator.setVisual(this.cosmeticVisual);
  }

  private resize(stage: HTMLElement): void {
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    this.canvas.width = Math.max(1, Math.round(stage.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(stage.clientHeight * dpr));
  }

  private tick(timestamp: number): void {
    if (this.disposed) {
      return;
    }
    if (this.lastFrame === 0) {
      this.lastFrame = timestamp;
    }
    const deltaSeconds = Math.min(0.1, (timestamp - this.lastFrame) / 1000);
    this.lastFrame = timestamp;
    this.time += deltaSeconds;
    if (this.autoRotate && !this.dragging) {
      this.rotation += deltaSeconds * 0.6;
    }
    this.animator.update(deltaSeconds);
    this.cosmeticAnimator.update(deltaSeconds);
    this.draw();
    this.requestId = window.requestAnimationFrame((time) => this.tick(time));
  }

  private draw(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    if (!this.atlas || !this.visual) {
      return;
    }

    const cx = width / 2;
    const cy = height * 0.38;
    const size = Math.min(width, height) * 0.5;

    // Stage glow.
    const glow = ctx.createRadialGradient(cx, cy + size * 0.3, size * 0.04, cx, cy + size * 0.3, size * 0.5);
    glow.addColorStop(0, 'rgba(96, 165, 250, 0.28)');
    glow.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Upgrade pulse rings.
    if (this.entityKey === 'player' && this.heroUpgrade) {
      const color = UPGRADE_COLORS[this.heroUpgrade] ?? '#38bdf8';
      for (let i = 0; i < 2; i += 1) {
        const progress = (this.time * 0.7 + i * 0.5) % 1;
        ctx.strokeStyle = color;
        ctx.globalAlpha = (1 - progress) * 0.6;
        ctx.lineWidth = Math.max(2, size * 0.02);
        ctx.beginPath();
        ctx.ellipse(cx, cy + size * 0.28, size * (0.2 + progress * 0.35), size * (0.06 + progress * 0.1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const tint = this.entityKey === 'player' && this.visual.tintable ? this.heroTint : null;
    const frame = this.animator.getFrame();
    if (frame) {
      this.drawFrame(frame.rect, cx, cy, size, this.rotation, tint);
    }
    if (this.cosmeticVisual) {
      const cosmeticFrame = this.cosmeticAnimator.getFrame();
      if (cosmeticFrame) {
        this.drawFrame(cosmeticFrame.rect, cx, cy, size, this.rotation, null);
      }
    }

    this.drawFilmstrips();
  }

  /** Every clip of the selected entity as a labelled row of frames. */
  private drawFilmstrips(): void {
    if (!this.atlas || !this.visual) {
      return;
    }
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const clipNames = Object.keys(this.visual.clips);
    const cell = Math.min(64, Math.floor(width / 12));
    let y = height * 0.68;

    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(9, Math.floor(cell * 0.2))}px "Press Start 2P", monospace`;
    for (const clipName of clipNames) {
      if (y + cell > height) {
        break;
      }
      const clip = this.visual.clips[clipName];
      ctx.fillStyle = '#dbeafe';
      ctx.fillText(`${clipName} @ ${clip.fps}fps`, cell * 0.4, y + cell / 2);
      const stripX = cell * 4;
      const activeFrame = this.animator.getClipName() === clipName ? this.animator.getFrame() : null;
      clip.frames.forEach((frame, index) => {
        const x = stripX + index * (cell + 4);
        if (x + cell > width) {
          return;
        }
        ctx.strokeStyle = frame === activeFrame ? '#facc15' : 'rgba(219, 234, 254, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, cell, cell);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.atlas!.source, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h, x, y, cell, cell);
      });
      y += cell + 10;
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
    if (!tintCtx || !this.atlas) {
      return;
    }
    if (this.tintCanvas.width !== rect.w || this.tintCanvas.height !== rect.h) {
      this.tintCanvas.width = rect.w;
      this.tintCanvas.height = rect.h;
    }
    tintCtx.clearRect(0, 0, rect.w, rect.h);
    tintCtx.imageSmoothingEnabled = false;
    tintCtx.drawImage(this.atlas.source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'multiply';
    tintCtx.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
    tintCtx.fillRect(0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'destination-in';
    tintCtx.drawImage(this.atlas.source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    tintCtx.globalCompositeOperation = 'source-over';
  }
}
