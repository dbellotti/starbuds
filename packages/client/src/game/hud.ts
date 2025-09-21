import type { AugmentId, AugmentOption, EnemyKind, WorldSnapshot } from '@farsight/shared';
import { PLAYER_HURT_FLASH_TIME, getAugmentOption } from '@farsight/shared';

interface LevelUpUiOffer {
  offerId: string;
  level: number;
  options: AugmentOption[];
}

export interface Hud {
  update(snapshot: WorldSnapshot, playerId: string | null): void;
  presentLevelUp(offer: LevelUpUiOffer, onSelect: (augmentId: AugmentId) => void): void;
  lockLevelUp(): void;
  clearLevelUp(): void;
  showAugmentToast(augmentId: AugmentId, level: number, isLocal: boolean): void;
  showBossSpawn(kind: EnemyKind): void;
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

  const augmentLabel = document.createElement('div');
  augmentLabel.className = 'hud-augment';
  augmentLabel.textContent = 'Augment: —';
  panel.appendChild(augmentLabel);

  const tipLabel = document.createElement('div');
  tipLabel.className = 'hud-tip';
  tipLabel.textContent = 'LMB: Psychic Bolt · WASD: Move · V: Toggle View';
  panel.appendChild(tipLabel);

  const audio = createDamageAudio();
  const levelUpOverlay = document.createElement('div');
  levelUpOverlay.className = 'hud-levelup';
  const levelUpTitle = document.createElement('div');
  levelUpTitle.className = 'hud-levelup-title';
  levelUpOverlay.appendChild(levelUpTitle);
  const levelUpHint = document.createElement('div');
  levelUpHint.className = 'hud-levelup-hint';
  levelUpHint.textContent = 'Press 1-3 or click';
  levelUpOverlay.appendChild(levelUpHint);
  const levelUpOptions = document.createElement('div');
  levelUpOptions.className = 'hud-levelup-options';
  levelUpOverlay.appendChild(levelUpOptions);
  root.appendChild(levelUpOverlay);

  const toast = document.createElement('div');
  toast.className = 'hud-toast';
  root.appendChild(toast);

  let lastHurtTimer = 0;
  let currentOffer: LevelUpUiOffer | null = null;
  let offerHandler: ((augmentId: AugmentId) => void) | null = null;
  let offerLocked = false;
  let toastTimer: number | null = null;

  function update(snapshot: WorldSnapshot, playerId: string | null): void {
    if (!playerId) {
      root.style.opacity = '0';
      damageFlash.style.opacity = '0';
      warningLabel.classList.remove('is-visible');
      panel.classList.remove('is-hurt', 'is-invulnerable');
      lastHurtTimer = 0;
      augmentLabel.textContent = 'Augment: —';
      clearLevelUp();
      return;
    }

    const player = snapshot.players.find((p) => p.id === playerId);
    if (!player) {
      root.style.opacity = '0';
      damageFlash.style.opacity = '0';
      warningLabel.classList.remove('is-visible');
      panel.classList.remove('is-hurt', 'is-invulnerable');
      lastHurtTimer = 0;
      augmentLabel.textContent = 'Augment: —';
      clearLevelUp();
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

    if (player.lastAugmentId) {
      const augment = getAugmentOption(player.lastAugmentId);
      augmentLabel.textContent = `Augment: ${augment.name}`;
    } else {
      augmentLabel.textContent = 'Augment: —';
    }

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

  function presentLevelUp(offer: LevelUpUiOffer, onSelect: (augmentId: AugmentId) => void): void {
    currentOffer = offer;
    offerHandler = onSelect;
    offerLocked = false;
    levelUpTitle.textContent = `Level ${offer.level} — Choose a surge`;
    levelUpOptions.replaceChildren();
    offer.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-levelup-option';
      button.dataset.index = String(index);
      button.innerHTML = `
        <span class="hud-levelup-option-index">${index + 1}</span>
        <div class="hud-levelup-option-body">
          <div class="hud-levelup-option-name">${option.name}</div>
          <div class="hud-levelup-option-desc">${option.description}</div>
        </div>`;
      button.addEventListener('click', () => chooseAugment(option.id));
      levelUpOptions.appendChild(button);
    });
    levelUpOverlay.classList.add('is-visible');
    levelUpOverlay.classList.remove('is-processing');
    root.style.pointerEvents = 'auto';
  }

  function lockLevelUp(): void {
    if (!currentOffer) {
      return;
    }
    offerLocked = true;
    levelUpOverlay.classList.add('is-processing');
    const buttons = levelUpOptions.querySelectorAll('button');
    buttons.forEach((button) => {
      (button as HTMLButtonElement).disabled = true;
    });
  }

  function clearLevelUp(): void {
    currentOffer = null;
    offerHandler = null;
    offerLocked = false;
    levelUpOverlay.classList.remove('is-visible', 'is-processing');
    levelUpOptions.replaceChildren();
    root.style.pointerEvents = 'none';
  }

  function chooseAugment(augmentId: AugmentId): void {
    if (!currentOffer || !offerHandler || offerLocked) {
      return;
    }
    lockLevelUp();
    offerHandler(augmentId);
  }

  function showAugmentToast(augmentId: AugmentId, level: number, isLocal: boolean): void {
    const augment = getAugmentOption(augmentId);
    const headline = isLocal ? `Unlocked ${augment.name}` : `Ally unlocked ${augment.name}`;
    showToast(headline, `Level ${level}`, isLocal ? 'is-local' : 'is-ally');
  }

  function showBossSpawn(kind: EnemyKind): void {
    const pretty = kind.charAt(0).toUpperCase() + kind.slice(1);
    showToast('Miniboss inbound!', pretty, 'is-boss');
  }

  function showToast(headline: string, subline: string, tone: string): void {
    toast.className = `hud-toast ${tone}`;
    toast.innerHTML = `
      <div class="hud-toast-headline">${headline}</div>
      <div class="hud-toast-sub">${subline}</div>`;
    toast.classList.add('is-visible');
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      toastTimer = null;
    }, 2600);
  }

  function handleLevelUpKey(event: KeyboardEvent): void {
    if (!currentOffer || offerLocked || !levelUpOverlay.classList.contains('is-visible')) {
      return;
    }
    const map: Record<string, number> = {
      Digit1: 0,
      Numpad1: 0,
      Digit2: 1,
      Numpad2: 1,
      Digit3: 2,
      Numpad3: 2
    };
    const index = map[event.code];
    if (index === undefined) {
      return;
    }
    const option = currentOffer.options[index];
    if (option) {
      chooseAugment(option.id);
    }
  }

  window.addEventListener('keydown', handleLevelUpKey);

  function dispose(): void {
    audio.dispose();
    root.remove();
    window.removeEventListener('keydown', handleLevelUpKey);
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
  }

  return {
    update,
    presentLevelUp,
    lockLevelUp,
    clearLevelUp,
    showAugmentToast,
    showBossSpawn,
    dispose
  };
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
