import { SpriteAtlas } from './atlas';
import { createDefaultSkin } from './defaultSkin';
import type { SkinManifest, SpriteFrameRect } from './types';

/**
 * Skin loading.
 *
 * The active skin is chosen once per page load:
 *   1. `?skin=<url>` query parameter (highest priority, great for playtests)
 *   2. `VITE_SKIN_URL` build-time env var
 *   3. the built-in procedural default
 *
 * Custom skins are PARTIAL overrides: their atlas image is composited below
 * the default atlas and their entities/frames are merged over the defaults,
 * so a skin pack can replace just the player (or add a brand-new enemy) while
 * inheriting everything else. See docs/skinning.md for the manifest format.
 */

let sharedSkin: Promise<SpriteAtlas> | null = null;

/** Memoized so the game renderer, armory preview, and styleguide share one atlas. */
export function loadSkin(): Promise<SpriteAtlas> {
  if (!sharedSkin) {
    sharedSkin = loadSkinUncached().catch((error: unknown) => {
      console.error('[sprites] failed to load custom skin, using default', error);
      const fallback = createDefaultSkin();
      return new SpriteAtlas(fallback.canvas, fallback.manifest);
    });
  }
  return sharedSkin;
}

async function loadSkinUncached(): Promise<SpriteAtlas> {
  const base = createDefaultSkin();
  const customUrl = getCustomSkinUrl();
  if (!customUrl) {
    return new SpriteAtlas(base.canvas, base.manifest);
  }

  const response = await fetch(customUrl);
  if (!response.ok) {
    throw new Error(`skin manifest ${customUrl}: HTTP ${response.status}`);
  }
  const custom = (await response.json()) as SkinManifest;
  validateManifest(custom, customUrl);

  if (!custom.image) {
    // Manifest-only skin: remixes default frames (retimed clips, resized entities).
    return new SpriteAtlas(base.canvas, mergeManifests(base.manifest, custom, {}));
  }

  const imageUrl = new URL(custom.image, new URL(customUrl, window.location.href)).toString();
  const image = await loadImage(imageUrl);

  // Composite: default atlas on top, custom image appended below, custom
  // frame rects shifted by the offset so both sheets share one texture.
  const width = Math.max(base.canvas.width, image.naturalWidth);
  const offsetY = base.canvas.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = offsetY + image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create skin composite context');
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base.canvas, 0, 0);
  ctx.drawImage(image, 0, offsetY);

  const shiftedFrames: Record<string, SpriteFrameRect> = {};
  for (const [id, rect] of Object.entries(custom.frames)) {
    shiftedFrames[id] = { ...rect, y: rect.y + offsetY };
  }

  return new SpriteAtlas(canvas, mergeManifests(base.manifest, custom, shiftedFrames));
}

function mergeManifests(
  base: SkinManifest,
  custom: SkinManifest,
  customFrames: Record<string, SpriteFrameRect>
): SkinManifest {
  return {
    name: custom.name || base.name,
    frames: { ...base.frames, ...customFrames },
    entities: { ...base.entities, ...custom.entities }
  };
}

function validateManifest(manifest: SkinManifest, url: string): void {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`skin manifest ${url} is not an object`);
  }
  manifest.frames = manifest.frames ?? {};
  manifest.entities = manifest.entities ?? {};
}

function getCustomSkinUrl(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('skin');
  if (fromQuery) {
    return fromQuery;
  }
  const fromEnv = import.meta.env.VITE_SKIN_URL as string | undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load skin image ${url}`));
    image.src = url;
  });
}
