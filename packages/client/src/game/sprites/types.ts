/**
 * Data-driven sprite skin schema.
 *
 * A skin is a single texture atlas plus a JSON manifest describing named
 * frames (pixel rects inside the atlas) and entity visuals (animation clips
 * built from those frames). Everything the game renders as a character,
 * enemy, attack, or effect resolves through this schema, so new content can
 * be introduced by editing JSON + a PNG — no engine code changes.
 *
 * Entity keys use a `<category>:<id>` convention:
 *   - `player`                     the hero
 *   - `enemy:<kind>`               e.g. `enemy:fox`, `enemy:owl`
 *   - `projectile:<faction>`       `projectile:player | enemy | boss`
 *   - `fx:<id>`                    shared effect quads (impact, telegraph, reticle)
 *   - `cosmetic:<id>`              armory cosmetic overlays
 */

/** Pixel rectangle inside the atlas image. */
export interface SpriteFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A named animation clip referencing frames by id. */
export interface SpriteAnimationDef {
  frames: string[];
  /** Frames per second; art direction targets 8–12 fps. Defaults to 10. */
  fps?: number;
  /** Loop the clip (default true). Non-looping clips hold their last frame. */
  loop?: boolean;
}

/** Visual definition for one entity key. */
export interface SpriteVisualDef {
  /** Clip map. `idle` is required; renderers fall back to it. */
  animations: Record<string, SpriteAnimationDef>;
  /** Quad size in world units (the game world is ~480 units across a screen). */
  worldSize: { width: number; height: number };
  /**
   * When true the sprite is authored in light/neutral tones and multiplied by
   * a runtime tint (player colors, faction colors). When false the sprite's
   * own colors are shown as-is.
   */
  tintable?: boolean;
  /** Optional base tint applied even without a runtime tint (hex string, e.g. "#38bdf8"). */
  tint?: string;
}

/** Root manifest for a skin pack. */
export interface SkinManifest {
  name: string;
  /**
   * Atlas image URL, resolved relative to the manifest file. Omitted for the
   * built-in procedural skin (its atlas is painted at runtime).
   */
  image?: string;
  /** Named frame rects inside the atlas image. */
  frames: Record<string, SpriteFrameRect>;
  /** Entity visuals keyed by entity id (see file header for the convention). */
  entities: Record<string, SpriteVisualDef>;
}

/** Frame resolved to normalized UV space (v measured from the top of the atlas). */
export interface ResolvedFrame {
  /** UV rect for the shader: offset + size, y-flipped for WebGL. */
  u: number;
  v: number;
  uw: number;
  vh: number;
  /** Original pixel rect, kept for 2D-canvas previews. */
  rect: SpriteFrameRect;
}

export interface ResolvedClip {
  frames: ResolvedFrame[];
  fps: number;
  loop: boolean;
}

export interface ResolvedVisual {
  clips: Record<string, ResolvedClip>;
  worldSize: { width: number; height: number };
  tintable: boolean;
  /** Parsed base tint as 0xRRGGBB, or null. */
  tint: number | null;
}
