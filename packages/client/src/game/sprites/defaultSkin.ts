import type { EnemyKind } from '@starbuds/shared';

import type { SkinManifest, SpriteAnimationDef, SpriteFrameRect, SpriteVisualDef } from './types';

/**
 * Built-in skin pack. Every frame is painted at runtime onto a single atlas
 * canvas, honoring the art direction in docs/art-style.md (pixel-but-HD,
 * palette-locked, 8–12 fps clips, atlas ≤ 1024px wide).
 *
 * This module is also the template for external skins: the manifest it emits
 * has exactly the shape documented in docs/skinning.md, so a hand-authored
 * PNG + JSON can override any subset of it.
 */

const CELL = 64;
const ATLAS_WIDTH = 1024;
const COLUMNS = ATLAS_WIDTH / CELL;

export const ENEMY_BASE_COLORS: Record<EnemyKind, number> = {
  fox: 0xf97316,
  hawk: 0x93c5fd,
  snake: 0x4ade80,
  raccoon: 0xd1d5db,
  coyote: 0xfbbf24,
  weasel: 0xf87171,
  owl: 0xd8b4fe
};

type Pose = 'idle' | 'move' | 'windup' | 'attack';

/** Paints one frame into a CELL×CELL box. `phase` is sin(t·2π) in [-1, 1]. */
type FramePainter = (ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number) => void;

export interface DefaultSkin {
  canvas: HTMLCanvasElement;
  manifest: SkinManifest;
}

export function createDefaultSkin(): DefaultSkin {
  const builder = new AtlasBuilder();

  const entities: Record<string, SpriteVisualDef> = {};

  entities.player = builder.addEntity('player', paintChicken, {
    clips: [
      { name: 'idle', pose: 'idle', frames: 2, fps: 5 },
      { name: 'move', pose: 'move', frames: 4, fps: 12 },
      { name: 'attack', pose: 'attack', frames: 2, fps: 14 }
    ],
    worldSize: { width: 18, height: 24 },
    tintable: true
  });

  const enemyPainters: Record<EnemyKind, FramePainter> = {
    fox: paintFox,
    hawk: paintHawk,
    snake: paintSnake,
    raccoon: paintRaccoon,
    coyote: paintCoyote,
    weasel: paintWeasel,
    owl: paintOwl
  };
  for (const [kind, painter] of Object.entries(enemyPainters) as Array<[EnemyKind, FramePainter]>) {
    entities[`enemy:${kind}`] = builder.addEntity(`enemy_${kind}`, painter, {
      clips: [
        { name: 'idle', pose: 'idle', frames: 2, fps: 4 },
        { name: 'move', pose: 'move', frames: 2, fps: 9 },
        { name: 'windup', pose: 'windup', frames: 2, fps: 12 }
      ],
      worldSize: kind === 'coyote' ? { width: 27, height: 27 } : { width: 20, height: 20 },
      tintable: false
    });
  }

  entities['projectile:player'] = builder.addEntity('proj_player', paintBoltProjectile, {
    clips: [{ name: 'idle', pose: 'idle', frames: 2, fps: 12 }],
    worldSize: { width: 12, height: 12 },
    tintable: true,
    tint: '#38bdf8'
  });
  entities['projectile:enemy'] = builder.addEntity('proj_enemy', paintShardProjectile, {
    clips: [{ name: 'idle', pose: 'idle', frames: 2, fps: 12 }],
    worldSize: { width: 12, height: 12 },
    tintable: true,
    tint: '#f87171'
  });
  entities['projectile:boss'] = builder.addEntity('proj_boss', paintOrbProjectile, {
    clips: [{ name: 'idle', pose: 'idle', frames: 2, fps: 10 }],
    worldSize: { width: 16, height: 16 },
    tintable: true,
    tint: '#c084fc'
  });

  entities['fx:impact'] = builder.addEntity('fx_impact', paintImpact, {
    clips: [{ name: 'idle', pose: 'idle', frames: 1, fps: 1 }],
    worldSize: { width: 18, height: 18 },
    tintable: true
  });
  entities['fx:telegraph'] = builder.addEntity('fx_telegraph', paintTelegraph, {
    clips: [{ name: 'idle', pose: 'idle', frames: 1, fps: 1 }],
    worldSize: { width: 1, height: 1 },
    tintable: true
  });
  entities['fx:reticle'] = builder.addEntity('fx_reticle', paintReticle, {
    clips: [{ name: 'idle', pose: 'idle', frames: 1, fps: 1 }],
    worldSize: { width: 1, height: 1 },
    tintable: true
  });

  const cosmeticPainters: Record<string, FramePainter> = {
    'cosmic-plumage': paintCosmicPlumage,
    'ember-sheen': paintEmberSheen,
    'midnight-veil': paintMidnightVeil,
    suncrest: paintSuncrest
  };
  for (const [id, painter] of Object.entries(cosmeticPainters)) {
    entities[`cosmetic:${id}`] = builder.addEntity(`cosmetic_${id}`, painter, {
      clips: [{ name: 'idle', pose: 'idle', frames: 2, fps: 6 }],
      worldSize: { width: 20, height: 26 },
      tintable: false
    });
  }

  return {
    canvas: builder.finish(),
    manifest: {
      name: 'starbuds-default',
      frames: builder.frames,
      entities
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Atlas layout                                                               */
/* -------------------------------------------------------------------------- */

interface ClipSpec {
  name: string;
  pose: Pose;
  frames: number;
  fps: number;
}

interface EntitySpec {
  clips: ClipSpec[];
  worldSize: { width: number; height: number };
  tintable: boolean;
  tint?: string;
}

class AtlasBuilder {
  readonly frames: Record<string, SpriteFrameRect> = {};
  private readonly jobs: Array<{ rect: SpriteFrameRect; painter: FramePainter; pose: Pose; phase: number }> = [];
  private cursor = 0;

  addEntity(framePrefix: string, painter: FramePainter, spec: EntitySpec): SpriteVisualDef {
    const animations: Record<string, SpriteAnimationDef> = {};
    for (const clip of spec.clips) {
      const frameIds: string[] = [];
      for (let i = 0; i < clip.frames; i += 1) {
        const id = `${framePrefix}_${clip.name}_${i}`;
        const rect = this.allocate();
        this.frames[id] = rect;
        // Phase walks the sine wave once across the clip for seamless loops.
        const t = clip.frames > 1 ? i / clip.frames : 0;
        this.jobs.push({ rect, painter, pose: clip.pose, phase: Math.sin(t * Math.PI * 2) });
        frameIds.push(id);
      }
      animations[clip.name] = { frames: frameIds, fps: clip.fps };
    }
    return {
      animations,
      worldSize: spec.worldSize,
      tintable: spec.tintable,
      tint: spec.tint
    };
  }

  finish(): HTMLCanvasElement {
    const rows = Math.ceil(this.cursor / COLUMNS);
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_WIDTH;
    canvas.height = Math.max(CELL, rows * CELL);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create sprite atlas context');
    }
    ctx.imageSmoothingEnabled = false;
    for (const job of this.jobs) {
      ctx.save();
      ctx.translate(job.rect.x, job.rect.y);
      ctx.beginPath();
      ctx.rect(0, 0, job.rect.w, job.rect.h);
      ctx.clip();
      job.painter(ctx, CELL, job.pose, job.phase);
      if (job.pose === 'windup') {
        // Windup frames flash: brighten whatever the painter drew.
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(255, 244, 214, ${0.22 + Math.abs(job.phase) * 0.2})`;
        ctx.fillRect(0, 0, job.rect.w, job.rect.h);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
    return canvas;
  }

  private allocate(): SpriteFrameRect {
    const index = this.cursor;
    this.cursor += 1;
    return {
      x: (index % COLUMNS) * CELL,
      y: Math.floor(index / COLUMNS) * CELL,
      w: CELL,
      h: CELL
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Painting helpers                                                           */
/* -------------------------------------------------------------------------- */

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rotation = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

function triangle(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.closePath();
  ctx.fill();
}

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

const SHADOW = 'rgba(31, 34, 48, 0.45)'; // forest-navy shadow, never pure black

/* -------------------------------------------------------------------------- */
/* Hero — top-down chicken, authored in creams so runtime tint multiplies.    */
/* Sprites face "up" (top of the frame is the facing direction).              */
/* -------------------------------------------------------------------------- */

function paintChicken(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2 + 3;
  const flap = pose === 'attack' ? 0.9 + phase * 0.35 : pose === 'move' ? phase : phase * 0.25;
  const bob = pose === 'move' ? Math.abs(phase) * 1.5 : 0;

  ellipse(ctx, cx, cy + 4, s * 0.2, s * 0.24, SHADOW);

  // Tail feathers (three cones at the bottom).
  const tailSway = pose === 'move' ? phase * 2.5 : phase * 1.2;
  triangle(ctx, [[cx - 6 + tailSway, cy + s * 0.2], [cx + tailSway, cy + s * 0.34], [cx + 6 + tailSway, cy + s * 0.2]], '#e7cf9f');
  triangle(ctx, [[cx - 9 + tailSway, cy + s * 0.16], [cx - 3 + tailSway, cy + s * 0.31], [cx + 1 + tailSway, cy + s * 0.16]], '#f3e2b8');
  triangle(ctx, [[cx - 1 + tailSway, cy + s * 0.16], [cx + 3 + tailSway, cy + s * 0.31], [cx + 9 + tailSway, cy + s * 0.16]], '#f3e2b8');

  // Wings: swing outward with flap.
  const wingOut = 4 + flap * 5;
  const wingLift = flap * 2;
  ellipse(ctx, cx - s * 0.17 - wingOut * 0.4, cy + 1 - wingLift, s * 0.1 + flap, s * 0.17, '#f0dcae', -0.35 - flap * 0.25);
  ellipse(ctx, cx + s * 0.17 + wingOut * 0.4, cy + 1 - wingLift, s * 0.1 + flap, s * 0.17, '#f0dcae', 0.35 + flap * 0.25);

  // Body and belly highlight.
  ellipse(ctx, cx, cy - bob, s * 0.18, s * 0.24, '#fdf1cf');
  ellipse(ctx, cx - 3, cy + 3 - bob, s * 0.11, s * 0.15, '#f6e3af', 0.3);

  // Head, comb, beak (facing up).
  const headY = cy - s * 0.24 - bob;
  ellipse(ctx, cx, headY, s * 0.11, s * 0.11, '#fef8e4');
  triangle(ctx, [[cx - 4, headY - 6], [cx, headY - 12], [cx + 1, headY - 5]], '#dc3626');
  triangle(ctx, [[cx - 1, headY - 5], [cx + 4, headY - 11], [cx + 5, headY - 4]], '#dc3626');
  triangle(ctx, [[cx - 3, headY - 2], [cx, headY - 9], [cx + 3, headY - 2]], '#f47a1d');

  // Eyes on each side of the head.
  ctx.fillStyle = '#3b2513';
  ctx.fillRect(cx - 6, Math.round(headY - 1), 2, 3);
  ctx.fillRect(cx + 4, Math.round(headY - 1), 2, 3);

  if (pose === 'attack') {
    // Muzzle flash arcs past the beak.
    ctx.strokeStyle = 'rgba(255, 244, 200, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY - 8, 8 + phase * 2, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }

  outline(ctx, cx, cy - bob, s * 0.2, s * 0.26, 'rgba(120, 84, 40, 0.5)', 1.5);
}

/* -------------------------------------------------------------------------- */
/* Enemies — palette-locked, silhouette-first top-down sprites.               */
/* -------------------------------------------------------------------------- */

function paintFox(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2 + 2;
  const stride = pose === 'move' ? phase * 3 : phase * 1.2;

  ellipse(ctx, cx, cy + 4, s * 0.18, s * 0.22, SHADOW);
  // Bushy tail behind, cream tip.
  ellipse(ctx, cx - stride, cy + s * 0.22, s * 0.09, s * 0.15, '#ea6a12', stride * 0.06);
  ellipse(ctx, cx - stride, cy + s * 0.31, s * 0.06, s * 0.07, '#fde8c8');
  // Body + haunches.
  ellipse(ctx, cx, cy + 3, s * 0.15, s * 0.19, '#f97316');
  ellipse(ctx, cx - 5, cy + 6, s * 0.07, s * 0.09, '#ea6a12');
  ellipse(ctx, cx + 5, cy + 6, s * 0.07, s * 0.09, '#ea6a12');
  // Head with pointed ears facing up.
  const headY = cy - s * 0.18;
  triangle(ctx, [[cx - 8, headY - 2], [cx - 6, headY - 11], [cx - 1, headY - 4]], '#ea6a12');
  triangle(ctx, [[cx + 1, headY - 4], [cx + 6, headY - 11], [cx + 8, headY - 2]], '#ea6a12');
  ellipse(ctx, cx, headY, s * 0.11, s * 0.1, '#fb923c');
  triangle(ctx, [[cx - 3, headY - 3], [cx, headY - 8], [cx + 3, headY - 3]], '#fde8c8');
  ctx.fillStyle = '#2d1a0e';
  ctx.fillRect(cx - 4, Math.round(headY), 2, 2);
  ctx.fillRect(cx + 2, Math.round(headY), 2, 2);
}

function paintHawk(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2;
  const flap = pose === 'move' ? phase : phase * 0.4;

  ellipse(ctx, cx, cy + 6, s * 0.2, s * 0.12, SHADOW);
  // Spread wings — the hawk reads as a flying silhouette.
  const wingTilt = flap * 0.35;
  const wingLift = flap * 3;
  ellipse(ctx, cx - s * 0.24, cy + wingLift, s * 0.19, s * 0.08, '#7fb1f5', -0.25 - wingTilt);
  ellipse(ctx, cx + s * 0.24, cy + wingLift, s * 0.19, s * 0.08, '#7fb1f5', 0.25 + wingTilt);
  ellipse(ctx, cx - s * 0.3, cy + wingLift * 1.4, s * 0.1, s * 0.05, '#dbeafe', -0.3 - wingTilt);
  ellipse(ctx, cx + s * 0.3, cy + wingLift * 1.4, s * 0.1, s * 0.05, '#dbeafe', 0.3 + wingTilt);
  // Tail feathers.
  triangle(ctx, [[cx - 5, cy + s * 0.12], [cx, cy + s * 0.3], [cx + 5, cy + s * 0.12]], '#93c5fd');
  // Body + head.
  ellipse(ctx, cx, cy, s * 0.1, s * 0.16, '#bfdbfe');
  ellipse(ctx, cx, cy - s * 0.16, s * 0.07, s * 0.07, '#dbeafe');
  triangle(ctx, [[cx - 2, cy - s * 0.2], [cx, cy - s * 0.27], [cx + 2, cy - s * 0.2]], '#f59e0b');
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 3, Math.round(cy - s * 0.18), 2, 2);
  ctx.fillRect(cx + 1, Math.round(cy - s * 0.18), 2, 2);
}

function paintSnake(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const sway = pose === 'move' ? phase : phase * 0.5;

  ellipse(ctx, cx, s / 2 + 6, s * 0.17, s * 0.2, SHADOW);
  // Coiled body: circles along an S-curve that flexes with movement.
  const segments = 6;
  for (let i = segments - 1; i >= 0; i -= 1) {
    const t = i / (segments - 1);
    const y = s * 0.72 - t * s * 0.42;
    const x = cx + Math.sin(t * Math.PI * 2 + sway * 1.2) * s * 0.14 * (1 - t * 0.3);
    const radius = s * (0.1 - t * 0.03);
    ellipse(ctx, x, y, radius, radius, i % 2 === 0 ? '#4ade80' : '#36c06a');
    if (i % 2 === 0) {
      ellipse(ctx, x, y - 1, radius * 0.5, radius * 0.4, '#bbf7d0');
    }
  }
  // Head at the top of the S.
  const headX = cx + Math.sin(Math.PI * 2 + sway * 1.2) * s * 0.1;
  const headY = s * 0.24;
  ellipse(ctx, headX, headY, s * 0.09, s * 0.11, '#4ade80');
  ctx.fillStyle = '#facc15';
  ctx.fillRect(headX - 4, headY - 2, 2, 3);
  ctx.fillRect(headX + 2, headY - 2, 2, 3);
  // Forked tongue flick on windup.
  if (pose === 'windup') {
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX, headY - 6);
    ctx.lineTo(headX - 2, headY - 11);
    ctx.moveTo(headX, headY - 6);
    ctx.lineTo(headX + 2, headY - 11);
    ctx.stroke();
  }
}

function paintRaccoon(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2 + 2;
  const stride = pose === 'move' ? phase * 2.5 : phase;

  ellipse(ctx, cx, cy + 4, s * 0.18, s * 0.2, SHADOW);
  // Ringed tail.
  const tailX = cx - stride;
  ellipse(ctx, tailX, cy + s * 0.26, s * 0.07, s * 0.13, '#9ca3af', stride * 0.05);
  ctx.fillStyle = '#374151';
  ctx.fillRect(tailX - 4, Math.round(cy + s * 0.2), 8, 2);
  ctx.fillRect(tailX - 4, Math.round(cy + s * 0.28), 8, 2);
  // Body.
  ellipse(ctx, cx, cy + 2, s * 0.16, s * 0.18, '#d1d5db');
  ellipse(ctx, cx, cy + 5, s * 0.1, s * 0.11, '#9ca3af');
  // Head with rounded ears and the signature mask.
  const headY = cy - s * 0.16;
  ellipse(ctx, cx - 6, headY - 6, s * 0.05, s * 0.05, '#6b7280');
  ellipse(ctx, cx + 6, headY - 6, s * 0.05, s * 0.05, '#6b7280');
  ellipse(ctx, cx, headY, s * 0.12, s * 0.1, '#e5e7eb');
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(cx - 7, Math.round(headY - 2), 14, 4);
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(cx - 5, Math.round(headY - 1), 2, 2);
  ctx.fillRect(cx + 3, Math.round(headY - 1), 2, 2);
  triangle(ctx, [[cx - 2, headY + 3], [cx, headY + 6], [cx + 2, headY + 3]], '#374151');
}

function paintCoyote(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2 + 1;
  const stride = pose === 'move' ? phase * 3 : phase * 1.4;

  ellipse(ctx, cx, cy + 5, s * 0.24, s * 0.26, SHADOW);
  // Tail.
  ellipse(ctx, cx - 4 - stride, cy + s * 0.28, s * 0.08, s * 0.13, '#d97706', -0.3 + stride * 0.04);
  // Broad body with shoulder bulk toward the head.
  ellipse(ctx, cx, cy + 4, s * 0.2, s * 0.22, '#fbbf24');
  ellipse(ctx, cx, cy - 2, s * 0.17, s * 0.14, '#f59e0b');
  ellipse(ctx, cx - 8, cy + 8, s * 0.08, s * 0.1, '#d97706');
  ellipse(ctx, cx + 8, cy + 8, s * 0.08, s * 0.1, '#d97706');
  // Head with tall ears and long snout.
  const headY = cy - s * 0.2;
  triangle(ctx, [[cx - 9, headY - 1], [cx - 7, headY - 12], [cx - 2, headY - 3]], '#d97706');
  triangle(ctx, [[cx + 2, headY - 3], [cx + 7, headY - 12], [cx + 9, headY - 1]], '#d97706');
  ellipse(ctx, cx, headY, s * 0.13, s * 0.11, '#fbbf24');
  triangle(ctx, [[cx - 4, headY - 4], [cx, headY - 12], [cx + 4, headY - 4]], '#fde68a');
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 5, Math.round(headY - 1), 3, 3);
  ctx.fillRect(cx + 2, Math.round(headY - 1), 3, 3);
}

function paintWeasel(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const wiggle = pose === 'move' ? phase : phase * 0.5;

  ellipse(ctx, cx, s / 2 + 8, s * 0.14, s * 0.22, SHADOW);
  // Long, sinuous body: stacked segments that flex sideways.
  const segments = 5;
  for (let i = segments - 1; i >= 0; i -= 1) {
    const t = i / (segments - 1);
    const y = s * 0.74 - t * s * 0.4;
    const x = cx + Math.sin(t * Math.PI * 1.5 + wiggle) * s * 0.08;
    ellipse(ctx, x, y, s * (0.11 - t * 0.02), s * 0.1, i % 2 === 0 ? '#f87171' : '#ef5350');
  }
  // Cream belly stripe.
  ellipse(ctx, cx + Math.sin(wiggle) * 2, s * 0.55, s * 0.05, s * 0.16, '#ffe4e6');
  // Small head, round ears, snout.
  const headX = cx + Math.sin(Math.PI * 1.5 + wiggle) * s * 0.08;
  const headY = s * 0.26;
  ellipse(ctx, headX - 4, headY - 5, s * 0.04, s * 0.04, '#ef5350');
  ellipse(ctx, headX + 4, headY - 5, s * 0.04, s * 0.04, '#ef5350');
  ellipse(ctx, headX, headY, s * 0.08, s * 0.08, '#f87171');
  triangle(ctx, [[headX - 2, headY - 3], [headX, headY - 8], [headX + 2, headY - 3]], '#fda4af');
  ctx.fillStyle = '#27141b';
  ctx.fillRect(headX - 3, Math.round(headY - 1), 2, 2);
  ctx.fillRect(headX + 1, Math.round(headY - 1), 2, 2);
}

function paintOwl(ctx: CanvasRenderingContext2D, s: number, pose: Pose, phase: number): void {
  const cx = s / 2;
  const cy = s / 2 + 2;
  const flap = pose === 'move' ? phase : phase * 0.35;

  ellipse(ctx, cx, cy + 5, s * 0.2, s * 0.22, SHADOW);
  // Scalloped wings.
  ellipse(ctx, cx - s * 0.2, cy + 2 - flap * 3, s * 0.1 + flap * 1.5, s * 0.16, '#b79df8', -0.4 - flap * 0.2);
  ellipse(ctx, cx + s * 0.2, cy + 2 - flap * 3, s * 0.1 + flap * 1.5, s * 0.16, '#b79df8', 0.4 + flap * 0.2);
  // Round body with speckles.
  ellipse(ctx, cx, cy + 2, s * 0.17, s * 0.2, '#d8b4fe');
  ctx.fillStyle = '#ede9fe';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(cx - 6 + (i % 3) * 5, Math.round(cy + 4 + Math.floor(i / 3) * 5), 2, 2);
  }
  // Face disc with huge eyes — visible from above.
  const headY = cy - s * 0.14;
  ellipse(ctx, cx, headY, s * 0.14, s * 0.11, '#ede9fe');
  triangle(ctx, [[cx - 9, headY - 5], [cx - 6, headY - 10], [cx - 3, headY - 4]], '#c4b5fd');
  triangle(ctx, [[cx + 3, headY - 4], [cx + 6, headY - 10], [cx + 9, headY - 5]], '#c4b5fd');
  ellipse(ctx, cx - 4, headY, s * 0.05, s * 0.05, '#facc15');
  ellipse(ctx, cx + 4, headY, s * 0.05, s * 0.05, '#facc15');
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(cx - 5, Math.round(headY - 1), 2, 2);
  ctx.fillRect(cx + 3, Math.round(headY - 1), 2, 2);
  triangle(ctx, [[cx - 2, headY + 3], [cx, headY + 6], [cx + 2, headY + 3]], '#f59e0b');
}

/* -------------------------------------------------------------------------- */
/* Projectiles — authored white-hot, tinted per faction via the manifest.     */
/* -------------------------------------------------------------------------- */

function radialGlow(ctx: CanvasRenderingContext2D, s: number, innerRadius: number, outerRadius: number, coreAlpha: number): void {
  const gradient = ctx.createRadialGradient(s / 2, s / 2, innerRadius, s / 2, s / 2, outerRadius);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, s, s);
}

function paintBoltProjectile(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  radialGlow(ctx, s, 2, s * 0.36 + phase * 2, 0.95);
  // Elongated core pointing up (direction of travel).
  ellipse(ctx, s / 2, s / 2, s * 0.08, s * 0.2 + phase * 1.5, 'rgba(255,255,255,0.95)');
}

function paintShardProjectile(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  radialGlow(ctx, s, 1, s * 0.3 + phase * 2, 0.8);
  triangle(ctx, [[s / 2 - 6, s / 2 + 8], [s / 2, s / 2 - 12 - phase * 2], [s / 2 + 6, s / 2 + 8]], 'rgba(255,255,255,0.9)');
}

function paintOrbProjectile(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  radialGlow(ctx, s, 3, s * 0.42 + phase * 2.5, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.26 + phase * 2, 0, Math.PI * 2);
  ctx.stroke();
}

/* -------------------------------------------------------------------------- */
/* Shared FX quads (tinted at runtime).                                       */
/* -------------------------------------------------------------------------- */

function paintImpact(ctx: CanvasRenderingContext2D, s: number): void {
  radialGlow(ctx, s, 2, s * 0.48, 0.9);
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s / 2 + Math.cos(angle) * s * 0.18, s / 2 + Math.sin(angle) * s * 0.18);
    ctx.lineTo(s / 2 + Math.cos(angle) * s * 0.42, s / 2 + Math.sin(angle) * s * 0.42);
    ctx.stroke();
  }
}

function paintTelegraph(ctx: CanvasRenderingContext2D, s: number): void {
  const gradient = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.5);
  gradient.addColorStop(0, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(0.88, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, s, s);
}

function paintReticle(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI / 2) * i + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(s / 2 + Math.cos(angle) * s * 0.28, s / 2 + Math.sin(angle) * s * 0.28);
    ctx.lineTo(s / 2 + Math.cos(angle) * s * 0.46, s / 2 + Math.sin(angle) * s * 0.46);
    ctx.stroke();
  }
}

/* -------------------------------------------------------------------------- */
/* Cosmetic overlays — drawn above the hero in the armory preview.            */
/* -------------------------------------------------------------------------- */

function paintCosmicPlumage(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  ctx.strokeStyle = `rgba(147, 197, 253, ${0.75 + phase * 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2 + 4, s * 0.3 + phase, 0, Math.PI * 2);
  ctx.stroke();
  triangle(ctx, [[s / 2 - 4, s * 0.24], [s / 2, s * 0.08 - phase * 2], [s / 2 + 4, s * 0.24]], '#a78bfa');
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(s / 2 - 12, Math.round(s * 0.3 + phase * 2), 2, 2);
  ctx.fillRect(s / 2 + 10, Math.round(s * 0.36 - phase * 2), 2, 2);
}

function paintEmberSheen(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  for (let i = 0; i < 5; i += 1) {
    const x = s / 2 + (i - 2) * 6;
    const y = s * 0.68 + Math.sin(i * 2.1 + phase * 2) * 3;
    triangle(ctx, [[x - 2, y + 5], [x, y - 4 - phase * 2], [x + 2, y + 5]], i % 2 === 0 ? '#f97316' : '#fb923c');
  }
}

function paintMidnightVeil(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  ctx.fillStyle = 'rgba(30, 58, 138, 0.7)';
  ctx.beginPath();
  ctx.moveTo(s / 2 - 10, s * 0.34);
  ctx.quadraticCurveTo(s / 2 - 14, s * 0.72, s / 2 - 6 + phase * 2, s * 0.82);
  ctx.lineTo(s / 2 + 6 + phase * 2, s * 0.82);
  ctx.quadraticCurveTo(s / 2 + 14, s * 0.72, s / 2 + 10, s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(s / 2 - 6, Math.round(s * 0.5 + phase * 2), 2, 2);
  ctx.fillRect(s / 2 + 4, Math.round(s * 0.62 - phase * 2), 2, 2);
  ctx.fillRect(s / 2 - 1, Math.round(s * 0.72 + phase), 2, 2);
}

function paintSuncrest(ctx: CanvasRenderingContext2D, s: number, _pose: Pose, phase: number): void {
  for (let i = 0; i < 5; i += 1) {
    const x = s / 2 + (i - 2) * 5;
    const height = 8 + (i === 2 ? 4 : 0) + phase * 1.5;
    triangle(ctx, [[x - 2, s * 0.22], [x, s * 0.22 - height], [x + 2, s * 0.22]], i % 2 === 0 ? '#facc15' : '#fcd34d');
  }
}
