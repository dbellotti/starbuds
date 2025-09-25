import type { EnemyKind } from '@farsight/shared';

import './styleguide.css';

import { StyleguidePreview, type HeroPose } from './previewScene';
import { ENEMY_COLORS } from '../game/enemyAssets';

const HERO_DEFAULT_COLOR = '#facc15';

const COSMETIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'cosmic-plumage', label: 'Cosmic Plumage' },
  { value: 'ember-sheen', label: 'Ember Sheen' },
  { value: 'midnight-veil', label: 'Midnight Veil' },
  { value: 'suncrest', label: 'Suncrest' }
];

const UPGRADE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'focus-matrix', label: 'Focus Matrix' },
  { value: 'celerity-core', label: 'Celerity Core' },
  { value: 'bulwark-weave', label: 'Bulwark Weave' },
  { value: 'rift-channeler', label: 'Rift Channeler' },
  { value: 'magnet-surge', label: 'Magnet Surge' }
];

const ENEMY_OPTIONS: Array<{ value: EnemyKind; label: string }> = [
  { value: 'fox', label: 'Fox Striker' },
  { value: 'hawk', label: 'Hawk Sentinel' },
  { value: 'snake', label: 'Snake Viper' },
  { value: 'raccoon', label: 'Raccoon Sapper' },
  { value: 'coyote', label: 'Coyote Bruiser' },
  { value: 'weasel', label: 'Weasel Skirmisher' },
  { value: 'owl', label: 'Owl Channeler' }
];

const HERO_POSES: Array<{ value: HeroPose; label: string }> = [
  { value: 'idle', label: 'Idle' },
  { value: 'run', label: 'Run' },
  { value: 'attack', label: 'Attack Loop' }
];

function createSelect(options: Array<{ value: string; label: string }>, initial: string): HTMLSelectElement {
  const select = document.createElement('select');
  for (const option of options) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === initial) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
  return select;
}

function toHexString(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('styleguide-root');
  if (!root) {
    throw new Error('Missing styleguide root element');
  }

  const controls = document.createElement('aside');
  controls.className = 'styleguide-controls';

  const previewStage = document.createElement('div');
  previewStage.className = 'styleguide-preview';

  root.appendChild(controls);
  root.appendChild(previewStage);

  const preview = new StyleguidePreview(previewStage);

  const heading = document.createElement('h1');
  heading.textContent = 'Rig & VFX Styleguide';
  controls.appendChild(heading);

  const characterSection = document.createElement('section');
  characterSection.className = 'styleguide-section';
  const characterTitle = document.createElement('h2');
  characterTitle.textContent = 'Character';
  characterSection.appendChild(characterTitle);

  const characterField = document.createElement('div');
  characterField.className = 'styleguide-field';
  const characterLabel = document.createElement('label');
  characterLabel.textContent = 'Preview target';
  characterField.appendChild(characterLabel);

  const characterSelect = document.createElement('select');
  const heroOption = document.createElement('option');
  heroOption.value = 'hero';
  heroOption.textContent = 'Hero – Galliform Operative';
  characterSelect.appendChild(heroOption);
  for (const enemy of ENEMY_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = enemy.value;
    opt.textContent = enemy.label;
    characterSelect.appendChild(opt);
  }
  characterField.appendChild(characterSelect);
  characterSection.appendChild(characterField);

  const rotateField = document.createElement('div');
  rotateField.className = 'styleguide-field';
  const rotateLabel = document.createElement('label');
  rotateLabel.textContent = 'Auto rotate';
  rotateField.appendChild(rotateLabel);
  const rotateToggle = document.createElement('input');
  rotateToggle.type = 'checkbox';
  rotateToggle.checked = true;
  rotateField.appendChild(rotateToggle);
  characterSection.appendChild(rotateField);
  controls.appendChild(characterSection);

  preview.setAutoRotateChangeListener((enabled) => {
    rotateToggle.checked = enabled;
  });

  const heroSection = document.createElement('section');
  heroSection.className = 'styleguide-section';
  const heroTitle = document.createElement('h2');
  heroTitle.textContent = 'Hero Controls';
  heroSection.appendChild(heroTitle);

  const tintField = document.createElement('div');
  tintField.className = 'styleguide-field';
  const tintLabel = document.createElement('label');
  tintLabel.textContent = 'Primary tint';
  tintField.appendChild(tintLabel);
  const tintInput = document.createElement('input');
  tintInput.type = 'color';
  tintInput.value = HERO_DEFAULT_COLOR;
  tintField.appendChild(tintInput);
  heroSection.appendChild(tintField);

  const poseField = document.createElement('div');
  poseField.className = 'styleguide-field';
  const poseLabel = document.createElement('label');
  poseLabel.textContent = 'Animation pose';
  poseField.appendChild(poseLabel);
  const poseSelect = createSelect(HERO_POSES.map((entry) => ({ value: entry.value, label: entry.label })), 'run');
  poseField.appendChild(poseSelect);
  heroSection.appendChild(poseField);

  const cosmeticField = document.createElement('div');
  cosmeticField.className = 'styleguide-field';
  const cosmeticLabel = document.createElement('label');
  cosmeticLabel.textContent = 'Cosmetic attachment';
  cosmeticField.appendChild(cosmeticLabel);
  const cosmeticSelect = createSelect(COSMETIC_OPTIONS, '');
  cosmeticField.appendChild(cosmeticSelect);
  heroSection.appendChild(cosmeticField);

  const upgradeField = document.createElement('div');
  upgradeField.className = 'styleguide-field';
  const upgradeLabel = document.createElement('label');
  upgradeLabel.textContent = 'Upgrade effect';
  upgradeField.appendChild(upgradeLabel);
  const upgradeSelect = createSelect(UPGRADE_OPTIONS, '');
  upgradeField.appendChild(upgradeSelect);
  heroSection.appendChild(upgradeField);

  controls.appendChild(heroSection);

  const enemySection = document.createElement('section');
  enemySection.className = 'styleguide-section';
  enemySection.style.display = 'none';
  const enemyTitle = document.createElement('h2');
  enemyTitle.textContent = 'Enemy Details';
  enemySection.appendChild(enemyTitle);
  const enemyInfo = document.createElement('div');
  enemyInfo.className = 'styleguide-note';
  enemySection.appendChild(enemyInfo);
  controls.appendChild(enemySection);

  const note = document.createElement('p');
  note.className = 'styleguide-note';
  note.textContent = 'Use this page to capture screenshots, evaluate cosmetics, and spot rendering regressions without booting the full game.';
  controls.appendChild(note);

  const syncHeroState = (): void => {
    const tint = parseInt(tintInput.value.replace('#', ''), 16);
    preview.setMode('hero');
    preview.setHeroTint(tint);
    preview.setHeroPose(poseSelect.value as HeroPose);
    preview.setHeroCosmetic(cosmeticSelect.value || null);
    preview.setHeroUpgrade(upgradeSelect.value || null);
    heroSection.style.display = '';
    enemySection.style.display = 'none';
    characterSelect.value = 'hero';
  };

  const updateEnemyInfo = (kind: EnemyKind): void => {
    const color = toHexString(ENEMY_COLORS[kind]);
    enemyInfo.textContent = `${kind.toUpperCase()} • Base tint ${color}`;
    enemyInfo.style.color = color;
  };

  characterSelect.addEventListener('change', () => {
    const value = characterSelect.value;
    if (value === 'hero') {
      syncHeroState();
      return;
    }
    const enemyKind = value as EnemyKind;
    preview.setEnemyKind(enemyKind);
    heroSection.style.display = 'none';
    enemySection.style.display = '';
    updateEnemyInfo(enemyKind);
  });

  rotateToggle.addEventListener('change', () => {
    preview.setAutoRotate(rotateToggle.checked);
  });

  tintInput.addEventListener('input', () => {
    const tint = parseInt(tintInput.value.replace('#', ''), 16);
    preview.setHeroTint(tint);
    if (cosmeticSelect.value) {
      // Re-apply so tint propagates to attachments.
      preview.setHeroCosmetic(cosmeticSelect.value || null);
    }
  });

  poseSelect.addEventListener('change', () => {
    preview.setHeroPose(poseSelect.value as HeroPose);
  });

  cosmeticSelect.addEventListener('change', () => {
    preview.setHeroCosmetic(cosmeticSelect.value || null);
  });

  upgradeSelect.addEventListener('change', () => {
    preview.setHeroUpgrade(upgradeSelect.value || null);
  });

  syncHeroState();

  window.addEventListener('beforeunload', () => {
    preview.dispose();
  });
});
