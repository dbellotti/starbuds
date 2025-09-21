export interface AudioController {
  prime(): void;
  playLevelUp(): void;
  playBossSpawn(): void;
  dispose(): void;
}

export function createAudioController(): AudioController {
  const AudioCtor: typeof AudioContext | undefined = (window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext);
  let context: AudioContext | null = null;
  let musicTimer: number | null = null;
  let unlocked = false;

  const ensureContext = async (): Promise<AudioContext | null> => {
    if (!AudioCtor) {
      return null;
    }
    if (!context) {
      try {
        context = new AudioCtor();
      } catch {
        context = null;
        return null;
      }
    }
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return null;
      }
    }
    return context;
  };

  const scheduleMusicBar = (ctx: AudioContext) => {
    const tempo = 92;
    const beat = 60 / tempo;
    const startTime = ctx.currentTime + 0.1;
    const chord: number[][] = [
      [196, 294],
      [220, 330],
      [247, 370],
      [175, 262]
    ];
    for (let step = 0; step < chord.length; step += 1) {
      const stepStart = startTime + step * beat;
      for (const note of chord[step]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note, stepStart);
        gain.gain.setValueAtTime(0.035, stepStart);
        gain.gain.linearRampToValueAtTime(0.01, stepStart + beat * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, stepStart + beat * 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(stepStart);
        osc.stop(stepStart + beat);
      }
    }
  };

  const startMusic = (ctx: AudioContext) => {
    if (musicTimer !== null) {
      return;
    }
    scheduleMusicBar(ctx);
    musicTimer = window.setInterval(() => {
      if (!context) {
        return;
      }
      scheduleMusicBar(context);
    }, 4000);
  };

  const playTone = (frequency: number, duration: number, type: OscillatorType, volume = 0.14): void => {
    void ensureContext().then((ctx) => {
      if (!ctx) {
        return;
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  };

  const playSweep = (start: number, end: number, duration: number, volume = 0.12): void => {
    void ensureContext().then((ctx) => {
      if (!ctx) {
        return;
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.linearRampToValueAtTime(end, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
  };

  return {
    prime(): void {
      if (unlocked) {
        return;
      }
      unlocked = true;
      void ensureContext().then((ctx) => {
        if (!ctx) {
          return;
        }
        startMusic(ctx);
      });
    },
    playLevelUp(): void {
      playSweep(440, 660, 0.35, 0.16);
      playTone(880, 0.2, 'sine', 0.08);
    },
    playBossSpawn(): void {
      playTone(140, 0.5, 'sawtooth', 0.2);
      window.setTimeout(() => playSweep(220, 110, 0.45, 0.12), 80);
    },
    dispose(): void {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
      if (context) {
        context.close().catch(() => {});
        context = null;
      }
    }
  };
}
