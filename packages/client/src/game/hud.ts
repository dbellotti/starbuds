import type { WorldSnapshot } from '@farsight/shared';
import { PLAYER_HURT_FLASH_TIME } from '@farsight/shared';

export interface Hud {
  update(snapshot: WorldSnapshot, playerId: string | null): void;
  dispose(): void;
}

export function createHud(parent: HTMLElement): Hud {
  const root = document.createElement('div');
  root.className = 'hud-root';
  parent.appendChild(root);

  const damageFlash = document.createElement('div');
  damageFlash.className = 'hud-damage-flash';
  root.appendChild(damageFlash);

  const warningLabel = document.createElement('div');
  warningLabel.className = 'hud-danger';
  warningLabel.textContent = 'LOCKED ON';
  root.appendChild(warningLabel);

  const panel = document.createElement('div');
  panel.className = 'hud-panel';
  root.appendChild(panel);

  const nameLabel = document.createElement('div');
  nameLabel.className = 'hud-name';
  panel.appendChild(nameLabel);

  const levelLabel = document.createElement('div');
  levelLabel.className = 'hud-level';
  panel.appendChild(levelLabel);

  const healthBar = createBar('Health', 'hud-health');
  panel.appendChild(healthBar.container);

  const xpBar = createBar('XP', 'hud-xp');
  panel.appendChild(xpBar.container);

  const tipLabel = document.createElement('div');
  tipLabel.className = 'hud-tip';
  tipLabel.textContent = 'LMB: Psychic Bolt · WASD: Move';
  panel.appendChild(tipLabel);

  const audio = createDamageAudio();
  let lastHurtTimer = 0;

  function update(snapshot: WorldSnapshot, playerId: string | null): void {
    if (!playerId) {
      root.style.opacity = '0';
      damageFlash.style.opacity = '0';
      warningLabel.classList.remove('is-visible');
      panel.classList.remove('is-hurt', 'is-invulnerable');
      lastHurtTimer = 0;
      return;
    }

    const player = snapshot.players.find((p) => p.id === playerId);
    if (!player) {
      root.style.opacity = '0';
      damageFlash.style.opacity = '0';
      warningLabel.classList.remove('is-visible');
      panel.classList.remove('is-hurt', 'is-invulnerable');
      lastHurtTimer = 0;
      return;
    }

    root.style.opacity = '1';
    nameLabel.textContent = player.displayName;
    levelLabel.textContent = `Level ${player.psychicLevel}`;

    updateBar(healthBar, player.health, player.maxHealth, `${Math.round(player.health)}/${player.maxHealth}`);
    updateBar(
      xpBar,
      player.experience,
      Math.max(1, player.experienceToNext),
      `${Math.round(player.experience)} / ${Math.round(player.experienceToNext)}`
    );

    const hurtTimer = Math.max(0, player.hurtTimer ?? 0);
    const hurtRatio = PLAYER_HURT_FLASH_TIME > 0 ? Math.min(1, hurtTimer / PLAYER_HURT_FLASH_TIME) : 0;
    damageFlash.style.opacity = (hurtRatio * 0.75).toFixed(3);
    panel.classList.toggle('is-hurt', hurtRatio > 0.25);
    panel.classList.toggle('is-invulnerable', (player.invulnerableTimer ?? 0) > 0.15);

    if (hurtTimer > lastHurtTimer + 0.05) {
      audio.trigger(Math.min(1, hurtRatio + 0.2));
    }
    lastHurtTimer = hurtTimer;

    const targeted = snapshot.enemies.some((enemy) => enemy.intent === 'windup' && enemy.targetPlayerId === playerId);
    warningLabel.classList.toggle('is-visible', targeted);
  }

  function dispose(): void {
    audio.dispose();
    root.remove();
  }

  return { update, dispose };
}

interface DamageAudio {
  trigger(intensity: number): void;
  dispose(): void;
}

function createDamageAudio(): DamageAudio {
  const AudioCtor: typeof AudioContext | undefined = (window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext);
  if (!AudioCtor) {
    return { trigger() {}, dispose() {} };
  }

  let context: AudioContext | null = null;
  let lastPlay = 0;

  const ensureContext = async (): Promise<AudioContext | null> => {
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

  return {
    trigger(intensity: number) {
      void ensureContext().then((ctx) => {
        if (!ctx) {
          return;
        }
        const now = ctx.currentTime;
        if (now - lastPlay < 0.12) {
          return;
        }
        lastPlay = now;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const clamped = Math.max(0.25, Math.min(1, intensity));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320 - clamped * 140, now);
        gain.gain.setValueAtTime(0.11 + clamped * 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      });
    },
    dispose() {
      if (context) {
        context.close().catch(() => {});
        context = null;
      }
    }
  };
}

interface HudBar {
  container: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
  value: HTMLElement;
}

function createBar(labelText: string, modifierClass: string): HudBar {
  const container = document.createElement('div');
  container.className = `hud-bar ${modifierClass}`;

  const label = document.createElement('span');
  label.textContent = labelText;
  label.className = 'hud-bar-label';
  container.appendChild(label);

  const track = document.createElement('div');
  track.className = 'hud-bar-track';
  container.appendChild(track);

  const fill = document.createElement('div');
  fill.className = 'hud-bar-fill';
  track.appendChild(fill);

  const value = document.createElement('span');
  value.className = 'hud-bar-value';
  track.appendChild(value);

  return { container, fill, label, value };
}

function updateBar(bar: HudBar, value: number, max: number, text: string): void {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  bar.fill.style.width = `${ratio * 100}%`;
  bar.value.textContent = text;
}
