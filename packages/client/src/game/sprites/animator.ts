import type { ResolvedClip, ResolvedFrame, ResolvedVisual } from './types';

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
    if (!this.visual) {
      return;
    }
    const clip = this.visual.clips[name] ?? this.visual.clips.idle;
    if (this.clip === clip && !restart) {
      return;
    }
    this.clip = clip;
    this.clipName = name;
    this.time = 0;
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
