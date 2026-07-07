import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';

import type { ResolvedClip, ResolvedFrame, ResolvedVisual, SkinManifest, SpriteFrameRect } from './types';

const DEFAULT_FPS = 10;

/**
 * A skin manifest bound to its atlas image: owns the shared GPU texture and
 * resolves entity keys to UV-space animation clips. One atlas is shared by
 * every sprite in the scene so batches can render with a single material.
 */
export class SpriteAtlas {
  readonly texture: CanvasTexture;
  readonly manifest: SkinManifest;
  /** Source image, exposed for 2D-canvas previews (armory, styleguide). */
  readonly source: HTMLCanvasElement;

  private readonly visuals = new Map<string, ResolvedVisual>();
  private readonly missingWarned = new Set<string>();

  constructor(source: HTMLCanvasElement, manifest: SkinManifest) {
    this.source = source;
    this.manifest = manifest;
    this.texture = new CanvasTexture(source);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  /**
   * Resolve an entity key to UV clips. Unknown keys resolve to `null` after a
   * one-time console warning, so a skin missing an entity fails visibly in
   * the log instead of crashing the renderer.
   */
  getVisual(key: string): ResolvedVisual | null {
    const cached = this.visuals.get(key);
    if (cached) {
      return cached;
    }
    const def = this.manifest.entities[key];
    if (!def) {
      if (!this.missingWarned.has(key)) {
        this.missingWarned.add(key);
        console.warn(`[sprites] skin "${this.manifest.name}" has no entity "${key}"`);
      }
      return null;
    }

    const clips: Record<string, ResolvedClip> = {};
    for (const [clipName, clip] of Object.entries(def.animations)) {
      const frames: ResolvedFrame[] = [];
      for (const frameId of clip.frames) {
        const rect = this.manifest.frames[frameId];
        if (!rect) {
          if (!this.missingWarned.has(frameId)) {
            this.missingWarned.add(frameId);
            console.warn(`[sprites] skin "${this.manifest.name}" is missing frame "${frameId}" (entity "${key}")`);
          }
          continue;
        }
        frames.push(this.resolveFrame(rect));
      }
      if (frames.length > 0) {
        clips[clipName] = {
          frames,
          fps: clip.fps ?? DEFAULT_FPS,
          loop: clip.loop ?? true
        };
      }
    }

    if (!clips.idle) {
      const first = Object.values(clips)[0];
      if (!first) {
        if (!this.missingWarned.has(key)) {
          this.missingWarned.add(key);
          console.warn(`[sprites] entity "${key}" has no usable animation clips`);
        }
        return null;
      }
      clips.idle = first;
    }

    const visual: ResolvedVisual = {
      clips,
      worldSize: def.worldSize,
      tintable: def.tintable ?? false,
      tint: typeof def.tint === 'string' ? parseHexColor(def.tint) : null
    };
    this.visuals.set(key, visual);
    return visual;
  }

  dispose(): void {
    this.texture.dispose();
    this.visuals.clear();
  }

  private resolveFrame(rect: SpriteFrameRect): ResolvedFrame {
    const width = this.source.width;
    const height = this.source.height;
    return {
      u: rect.x / width,
      // CanvasTexture flips Y: pixel row 0 is v=1.
      v: 1 - (rect.y + rect.h) / height,
      uw: rect.w / width,
      vh: rect.h / height,
      rect
    };
  }
}

export function parseHexColor(value: string): number | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return parseInt(match[1], 16);
}
