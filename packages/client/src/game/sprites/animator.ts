import type { ResolvedClip, ResolvedFrame, ResolvedVisual } from './types';

const DIRECTIONS = ['e', 's', 'w', 'n'] as const;

export type SpriteDirection = (typeof DIRECTIONS)[number];

/**
 * Bucket a world facing angle (atan2(y, x); 0 = +x = screen east, π/2 = +y =
 * screen south under the top-down camera) into a 4-way compass direction.
 */
export function facingToDirection(facing: number): SpriteDirection {
  const bucket = ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4;
  return DIRECTIONS[bucket];
}

/**
 * Minimal clip player. Holds a current clip + elapsed time and returns the
 * frame to draw. Allocation-free after construction so avatars can keep one
 * per entity and reuse it through pooling.
 */
export class SpriteAnimator {
  private visual: ResolvedVisual | null = null;
  private clip: ResolvedClip | null = null;
  private clipName = '';
  private time = 0;

  setVisual(visual: ResolvedVisual | null): void {
    this.visual = visual;
    this.clip = null;
    this.clipName = '';
    this.time = 0;
    if (visual) {
      this.play('idle');
    }
  }

  /** Switch clips (no-op when already playing). Unknown clips fall back to idle. */
  play(name: string, restart = false): void {
    this.setClip(name, restart, false);
  }

  /**
   * Directional playback: given the entity's world facing angle, prefer a
   * per-direction clip variant (`move:n`, `move:e`, `move:s`, `move:w`) and
   * fall back to the plain clip when the skin doesn't provide one.
   *
   * Returns true when a directional variant was selected — the caller should
   * then render the sprite unrotated, since the art already faces that way.
   * Switching direction mid-clip keeps the elapsed time so walk cycles don't
   * restart on every turn.
   */
  playFacing(name: string, facing: number): boolean {
    if (!this.visual) {
      return false;
    }
    const directionalName = `${name}:${facingToDirection(facing)}`;
    const sameBase = this.clipName === name || this.clipName.startsWith(`${name}:`);
    if (this.visual.clips[directionalName]) {
      this.setClip(directionalName, false, sameBase);
      return true;
    }
    this.setClip(name, false, false);
    return false;
  }

  private setClip(name: string, restart: boolean, keepTime: boolean): void {
    if (!this.visual) {
      return;
    }
    const clip = this.visual.clips[name] ?? this.visual.clips.idle;
    if (this.clip === clip && !restart) {
      return;
    }
    this.clip = clip;
    this.clipName = name;
    if (!keepTime || restart) {
      this.time = 0;
    }
  }

  getClipName(): string {
    return this.clipName;
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
  }

  getFrame(): ResolvedFrame | null {
    if (!this.clip || this.clip.frames.length === 0) {
      return null;
    }
    const totalFrames = this.clip.frames.length;
    const rawIndex = Math.floor(this.time * this.clip.fps);
    const index = this.clip.loop ? rawIndex % totalFrames : Math.min(rawIndex, totalFrames - 1);
    return this.clip.frames[index];
  }
}
