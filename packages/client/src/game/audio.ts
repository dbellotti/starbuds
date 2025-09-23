import type { GamePhase } from '@farsight/shared';

export interface AudioController {
  prime(): void;
  playLevelUp(): void;
  playBossSpawn(): void;
  playExtractionReady(): void;
  playExtractionAbort(): void;
  playExtractionComplete(): void;
  playMutatorChime(): void;
  playArmoryHover(): void;
  playArmoryEquip(): void;
  setIntensity(level: number): void;
  setPhase(phase: GamePhase): void;
  dispose(): void;
}

export function createAudioController(): AudioController {
  const AudioCtor: typeof AudioContext | undefined = (window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext);
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let baseGain: GainNode | null = null;
  let intensityGain: GainNode | null = null;
  let musicTimer: number | null = null;
  let unlocked = false;
  let targetIntensity = 0;
  let currentPhase: GamePhase = 'combat';

  const phaseLevels: Record<GamePhase, number> = {
    combat: 0.55,
    armory: 0.28,
    summary: 0.4
  };

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
    if (!masterGain) {
      masterGain = context.createGain();
      masterGain.gain.value = 0.75;
      masterGain.connect(context.destination);

      baseGain = context.createGain();
      baseGain.gain.value = phaseLevels[currentPhase];
      baseGain.connect(masterGain);

      intensityGain = context.createGain();
      intensityGain.gain.value = targetIntensity * 0.45;
      intensityGain.connect(masterGain);
    }
    return context;
  };

  const scheduleMusicBar = (ctx: AudioContext) => {
    if (!baseGain || !intensityGain) {
      return;
    }
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
        osc.connect(gain).connect(baseGain);
        osc.start(stepStart);
        osc.stop(stepStart + beat);
      }

      const pulseOsc = ctx.createOscillator();
      const pulseGain = ctx.createGain();
      pulseOsc.type = 'triangle';
      pulseOsc.frequency.setValueAtTime(chord[step][0] / 2, stepStart + beat * 0.25);
      pulseGain.gain.setValueAtTime(0.02, stepStart + beat * 0.25);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, stepStart + beat);
      pulseOsc.connect(pulseGain).connect(intensityGain);
      pulseOsc.start(stepStart + beat * 0.25);
      pulseOsc.stop(stepStart + beat * 0.85);
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

  const refreshBaseGain = (ctx: AudioContext) => {
    if (!baseGain) {
      return;
    }
    const target = phaseLevels[currentPhase];
    baseGain.gain.cancelScheduledValues(ctx.currentTime);
    baseGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.6);
  };

  const refreshIntensityGain = (ctx: AudioContext) => {
    if (!intensityGain) {
      return;
    }
    const level = currentPhase === 'combat' ? targetIntensity : 0;
    intensityGain.gain.cancelScheduledValues(ctx.currentTime);
    intensityGain.gain.linearRampToValueAtTime(level * 0.45, ctx.currentTime + 0.4);
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
      osc.connect(gain).connect(masterGain ?? ctx.destination);
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
      osc.connect(gain).connect(masterGain ?? ctx.destination);
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
        refreshBaseGain(ctx);
        refreshIntensityGain(ctx);
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
    playExtractionReady(): void {
      playSweep(320, 520, 0.4, 0.14);
      window.setTimeout(() => playTone(640, 0.18, 'triangle', 0.08), 110);
    },
    playExtractionAbort(): void {
      playSweep(420, 260, 0.32, 0.12);
      window.setTimeout(() => playTone(180, 0.25, 'square', 0.06), 90);
    },
    playExtractionComplete(): void {
      playTone(520, 0.22, 'square', 0.12);
      window.setTimeout(() => playSweep(520, 780, 0.4, 0.1), 120);
    },
    playMutatorChime(): void {
      playTone(720, 0.2, 'triangle', 0.1);
      window.setTimeout(() => playTone(540, 0.18, 'sawtooth', 0.08), 140);
    },
    playArmoryHover(): void {
      playTone(560, 0.16, 'triangle', 0.08);
    },
    playArmoryEquip(): void {
      playSweep(260, 520, 0.26, 0.12);
      window.setTimeout(() => playTone(820, 0.14, 'sine', 0.08), 80);
    },
    setIntensity(level: number): void {
      targetIntensity = Math.max(0, Math.min(level, 1));
      void ensureContext().then((ctx) => {
        if (!ctx) {
          return;
        }
        refreshIntensityGain(ctx);
      });
    },
    setPhase(phase: GamePhase): void {
      currentPhase = phase;
      void ensureContext().then((ctx) => {
        if (!ctx) {
          return;
        }
        refreshBaseGain(ctx);
        refreshIntensityGain(ctx);
      });
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
      masterGain = null;
      baseGain = null;
      intensityGain = null;
      unlocked = false;
      targetIntensity = 0;
      currentPhase = 'combat';
    }
  };
}
