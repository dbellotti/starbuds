import type {
  ActiveMutators,
  ArmoryItem,
  ArmoryState,
  ArtifactKind,
  AugmentId,
  AugmentOption,
  EnemyKind,
  GamePhase,
  QuickPingBroadcastMessage,
  QuickPingKind,
  ReadyContext,
  WorldSnapshot,
  PlayerArmoryState
} from '@farsight/shared';
import {
  ARTIFACT_DEFINITIONS,
  LOOT_MAGNET_BASE_RADIUS,
  LOOT_MAGNET_MAX_RADIUS,
  LOOT_MAGNET_RADIUS_STEP,
  PLAYER_HURT_FLASH_TIME,
  getAugmentOption
} from '@farsight/shared';

interface LevelUpUiOffer {
  offerId: string;
  level: number;
  options: AugmentOption[];
}

export interface Hud {
  update(snapshot: WorldSnapshot, playerId: string | null): void;
  updateArmory(state: ArmoryState, playerId: string | null): void;
  presentLevelUp(offer: LevelUpUiOffer, onSelect: (augmentId: AugmentId) => void): void;
  lockLevelUp(): void;
  clearLevelUp(): void;
  showAugmentToast(augmentId: AugmentId, level: number, isLocal: boolean): void;
  showBossSpawn(kind: EnemyKind): void;
  showPingAlert(message: QuickPingBroadcastMessage, isLocal: boolean): void;
  beginPingSelection(): void;
  updatePingCursor(clientX: number, clientY: number): void;
  commitPingSelection(): QuickPingKind | null;
  cancelPingSelection(): void;
  dispose(): void;
}

export interface HudOptions {
  onReadyChange?: (ready: boolean, context: ReadyContext) => void;
  onArmoryPurchase?: (itemId: string) => void;
  onArmoryEquip?: (itemId: string, slot?: ArmoryItem['slot']) => void;
  onLaunchRun?: () => void;
}

export function createHud(parent: HTMLElement, options: HudOptions = {}): Hud {
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

  const buildPanel = document.createElement('div');
  buildPanel.className = 'hud-build';
  const augmentSummary = document.createElement('div');
  augmentSummary.className = 'hud-build-augments';
  buildPanel.appendChild(augmentSummary);
  const artifactSummary = document.createElement('div');
  artifactSummary.className = 'hud-build-artifacts';
  buildPanel.appendChild(artifactSummary);
  const magnetSummary = document.createElement('div');
  magnetSummary.className = 'hud-build-magnet';
  buildPanel.appendChild(magnetSummary);
  panel.appendChild(buildPanel);

  const tipLabel = document.createElement('div');
  tipLabel.className = 'hud-tip';
  tipLabel.textContent = 'LMB: Psychic Bolt · WASD: Move · V: Toggle View · Q: Ping Wheel';
  panel.appendChild(tipLabel);

  const audio = createDamageAudio();

  const levelUpOverlay = document.createElement('div');
  levelUpOverlay.className = 'hud-levelup';
  levelUpOverlay.style.pointerEvents = 'none';
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

  const bossBanner = document.createElement('div');
  bossBanner.className = 'hud-boss-banner';
  bossBanner.textContent = '';
  root.appendChild(bossBanner);

  const teamPanel = document.createElement('div');
  teamPanel.className = 'hud-team';
  root.appendChild(teamPanel);

  const readyButton = document.createElement('button');
  readyButton.type = 'button';
  readyButton.className = 'hud-ready-toggle';
  readyButton.textContent = 'Ready Up';
  readyButton.disabled = true;
  readyButton.setAttribute('aria-pressed', 'false');
  teamPanel.appendChild(readyButton);

  const rosterList = document.createElement('ul');
  rosterList.className = 'hud-roster';
  teamPanel.appendChild(rosterList);

  const objectivesPanel = document.createElement('div');
  objectivesPanel.className = 'hud-objectives';
  teamPanel.appendChild(objectivesPanel);

  const waveLabel = document.createElement('div');
  waveLabel.className = 'hud-objective-wave';
  objectivesPanel.appendChild(waveLabel);

  const waveProgress = createBar('Wave Progress', 'hud-wave');
  objectivesPanel.appendChild(waveProgress.container);

  const bossLabel = document.createElement('div');
  bossLabel.className = 'hud-objective-boss';
  objectivesPanel.appendChild(bossLabel);

  const extractionLabel = document.createElement('div');
  extractionLabel.className = 'hud-objective-extraction';
  objectivesPanel.appendChild(extractionLabel);

  const killLabel = document.createElement('div');
  killLabel.className = 'hud-objective-kills';
  objectivesPanel.appendChild(killLabel);

  const pingFeed = document.createElement('div');
  pingFeed.className = 'hud-ping-feed';
  root.appendChild(pingFeed);

  const pingWheel = document.createElement('div');
  pingWheel.className = 'hud-ping-wheel';
  root.appendChild(pingWheel);

  const mutatorPanel = document.createElement('div');
  mutatorPanel.className = 'hud-mutators';
  objectivesPanel.appendChild(mutatorPanel);
  const dailyMutatorLabel = document.createElement('div');
  dailyMutatorLabel.className = 'hud-mutator hud-mutator-daily';
  mutatorPanel.appendChild(dailyMutatorLabel);
  const weeklyMutatorLabel = document.createElement('div');
  weeklyMutatorLabel.className = 'hud-mutator hud-mutator-weekly';
  mutatorPanel.appendChild(weeklyMutatorLabel);

  const armoryPanel = document.createElement('div');
  armoryPanel.className = 'hud-armory';
  root.appendChild(armoryPanel);
  const armoryHeader = document.createElement('div');
  armoryHeader.className = 'hud-armory-header';
  armoryHeader.textContent = 'Armory Hub';
  armoryPanel.appendChild(armoryHeader);
  const armoryCurrency = document.createElement('div');
  armoryCurrency.className = 'hud-armory-currency';
  armoryPanel.appendChild(armoryCurrency);
  const armoryReadyList = document.createElement('ul');
  armoryReadyList.className = 'hud-armory-roster';
  armoryPanel.appendChild(armoryReadyList);
  const armorySections = document.createElement('div');
  armorySections.className = 'hud-armory-sections';
  armoryPanel.appendChild(armorySections);
  const upgradesSection = document.createElement('div');
  upgradesSection.className = 'hud-armory-section hud-armory-upgrades';
  upgradesSection.innerHTML = '<h3>Upgrades</h3>';
  armorySections.appendChild(upgradesSection);
  const upgradesList = document.createElement('div');
  upgradesList.className = 'hud-armory-list';
  upgradesSection.appendChild(upgradesList);
  const cosmeticsSection = document.createElement('div');
  cosmeticsSection.className = 'hud-armory-section hud-armory-cosmetics';
  cosmeticsSection.innerHTML = '<h3>Cosmetics</h3>';
  armorySections.appendChild(cosmeticsSection);
  const cosmeticsList = document.createElement('div');
  cosmeticsList.className = 'hud-armory-list';
  cosmeticsSection.appendChild(cosmeticsList);
  const launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'hud-armory-launch';
  launchButton.textContent = 'Launch Sortie';
  armoryPanel.appendChild(launchButton);
  launchButton.addEventListener('click', () => {
    if (launchButton.disabled) {
      return;
    }
    options.onLaunchRun?.();
  });

  const PING_DESCRIPTORS: Array<{ kind: QuickPingKind; label: string; hint: string }> = [
    { kind: 'assist', label: 'Assist', hint: '↑' },
    { kind: 'objective', label: 'Objective', hint: '→' },
    { kind: 'loot', label: 'Loot', hint: '↓' },
    { kind: 'danger', label: 'Danger', hint: '←' }
  ];

  const PING_LABELS: Record<QuickPingKind, string> = {
    assist: 'Assist',
    danger: 'Danger',
    loot: 'Loot',
    objective: 'Objective'
  };

  type RosterRow = { element: HTMLLIElement; name: HTMLElement; meta: HTMLElement };

  const pingOptions = {
    assist: document.createElement('div'),
    objective: document.createElement('div'),
    loot: document.createElement('div'),
    danger: document.createElement('div')
  } as Record<QuickPingKind, HTMLDivElement>;

  for (const descriptor of PING_DESCRIPTORS) {
    const option = pingOptions[descriptor.kind];
    option.className = `hud-ping-option hud-ping-${descriptor.kind}`;
    option.innerHTML = `
      <span class="hud-ping-label">${descriptor.label}</span>
      <span class="hud-ping-hint">${descriptor.hint}</span>`;
    pingWheel.appendChild(option);
  }

  let lastHurtTimer = 0;
  let currentOffer: LevelUpUiOffer | null = null;
  let offerHandler: ((augmentId: AugmentId) => void) | null = null;
  let offerLocked = false;
  let toastTimer: number | null = null;
  let extractionReady = false;
  let armoryReady = false;
  let currentPhase: GamePhase = 'combat';
  let currentArmory: ArmoryState | null = null;
  let localArmory: PlayerArmoryState | null = null;
  let pingActive = false;
  let pingSelection: QuickPingKind | null = null;
  const rosterDom = new Map<string, RosterRow>();
  const pingTimeouts: number[] = [];
  const playerArtifactCounts = new Map<string, Map<ArtifactKind, number>>();
  let bossBannerTimer: number | null = null;

  const hideBossBanner = () => {
    if (bossBannerTimer !== null) {
      window.clearTimeout(bossBannerTimer);
      bossBannerTimer = null;
    }
    bossBanner.classList.remove('is-visible');
    bossBanner.textContent = '';
  };

  const presentBossBanner = (headline: string, detail: string) => {
    hideBossBanner();
    bossBanner.innerHTML = `<span class="hud-boss-headline">${headline}</span><span class="hud-boss-detail">${detail}</span>`;
    bossBanner.classList.add('is-visible');
    bossBannerTimer = window.setTimeout(() => {
      hideBossBanner();
    }, 3800);
  };

  const updateReadyButton = () => {
    const context = currentPhase === 'armory' ? 'armory' : 'extraction';
    readyButton.dataset.context = context;
    const isSummary = currentPhase === 'summary';
    const pressed = context === 'armory' ? armoryReady : extractionReady;
    const label = isSummary
      ? 'Summary'
      : context === 'armory'
        ? pressed
          ? 'Ready for Drop'
          : 'Prep Loadout'
        : pressed
          ? 'Ready'
          : 'Ready Up';
    const disabled = isSummary || !options.onReadyChange;
    readyButton.disabled = disabled;
    readyButton.classList.toggle('is-ready', pressed && !disabled);
    readyButton.textContent = label;
    readyButton.setAttribute('aria-pressed', pressed && !disabled ? 'true' : 'false');
  };

  const handleReadyClick = () => {
    if (readyButton.disabled) {
      return;
    }
    const context = (readyButton.dataset.context as ReadyContext) ?? 'extraction';
    if (context === 'armory') {
      armoryReady = !armoryReady;
      options.onReadyChange?.(armoryReady, 'armory');
    } else {
      extractionReady = !extractionReady;
      options.onReadyChange?.(extractionReady, 'extraction');
    }
    updateReadyButton();
  };

  readyButton.addEventListener('click', handleReadyClick);
  updateReadyButton();

  function tallyList<T extends string>(values: T[]): Map<T, number> {
    const counts = new Map<T, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  }

  function formatAugmentSummary(augments: AugmentId[]): string {
    if (augments.length === 0) {
      return 'Augments: —';
    }
    const counts = tallyList(augments);
    const parts = Array.from(counts.entries()).map(([id, count]) => {
      const name = getAugmentOption(id).name;
      return count > 1 ? `${name} ×${count}` : name;
    });
    return `Augments: ${parts.join(', ')}`;
  }

  function formatArtifactSummary(artifacts: ArtifactKind[]): string {
    if (artifacts.length === 0) {
      return 'Artifacts: —';
    }
    const counts = tallyList(artifacts);
    const parts = Array.from(counts.entries()).map(([kind, count]) => {
      const name = ARTIFACT_DEFINITIONS[kind]?.name ?? kind;
      return count > 1 ? `${name} ×${count}` : name;
    });
    return `Artifacts: ${parts.join(', ')}`;
  }

  function calculateMagnetRadius(level: number): number {
    if (level <= 0) {
      return Math.round(LOOT_MAGNET_BASE_RADIUS * 0.6);
    }
    const base = LOOT_MAGNET_BASE_RADIUS;
    const bonus = LOOT_MAGNET_RADIUS_STEP * Math.max(0, level - 1);
    return Math.round(Math.min(LOOT_MAGNET_MAX_RADIUS, base + bonus));
  }

  function formatMagnetSummary(level: number): string {
    if (level <= 0) {
      return `Loot Magnet: Passive (${calculateMagnetRadius(level)}u)`;
    }
    return `Loot Magnet: Lv ${level} (${calculateMagnetRadius(level)}u)`;
  }

  function renderMutators(mutators: ActiveMutators): void {
    if (!mutators) {
      dailyMutatorLabel.textContent = 'Daily Mutator: —';
      weeklyMutatorLabel.textContent = 'Weekly Mutator: —';
      return;
    }
    dailyMutatorLabel.textContent = `Daily: ${mutators.daily.name} — ${mutators.daily.impactSummary}`;
    weeklyMutatorLabel.textContent = `Weekly: ${mutators.weekly.name} — ${mutators.weekly.impactSummary}`;
  }

  function renderArmoryRoster(players: PlayerArmoryState[], localId: string | null): void {
    armoryReadyList.replaceChildren(
      ...players.map((player) => {
        const li = document.createElement('li');
        li.className = 'hud-armory-player';
        if (player.ready) {
          li.classList.add('is-ready');
        }
        if (player.playerId === localId) {
          li.classList.add('is-local');
        }
        li.innerHTML = `
          <span class="hud-armory-player-name">${player.displayName}</span>
          <span class="hud-armory-player-status">${player.ready ? 'Ready' : 'Planning'}</span>`;
        return li;
      })
    );
  }

  function renderArmoryItems(
    container: HTMLElement,
    items: ArmoryItem[],
    local: PlayerArmoryState | null
  ): void {
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'hud-armory-empty';
      empty.textContent = 'No options available yet';
      container.appendChild(empty);
      return;
    }

    const feathers = local?.feathers ?? 0;
    const ownedUpgrades = new Set(local?.ownedUpgrades ?? []);
    const equippedUpgrades = new Set(local?.equippedUpgrades ?? []);
    const ownedCosmetics = new Set(local?.ownedCosmetics ?? []);
    const equippedCosmeticId = local?.equippedCosmeticId ?? null;

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'hud-armory-item';
      card.dataset.itemId = item.id;
      if (item.kind === 'upgrade' && ownedUpgrades.has(item.id)) {
        card.classList.add('is-owned');
      }
      if (item.kind === 'upgrade' && equippedUpgrades.has(item.id)) {
        card.classList.add('is-equipped');
      }
      if (item.kind === 'cosmetic' && ownedCosmetics.has(item.id)) {
        card.classList.add('is-owned');
      }
      if (item.kind === 'cosmetic' && equippedCosmeticId === item.id) {
        card.classList.add('is-equipped');
      }

      const title = document.createElement('h4');
      title.textContent = item.name;
      card.appendChild(title);

      const summary = document.createElement('p');
      summary.className = 'hud-armory-summary';
      summary.textContent = item.statSummary;
      card.appendChild(summary);

      const description = document.createElement('p');
      description.className = 'hud-armory-description';
      description.textContent = item.description;
      card.appendChild(description);

      const footer = document.createElement('div');
      footer.className = 'hud-armory-footer';
      card.appendChild(footer);

      const costLabel = document.createElement('span');
      costLabel.className = 'hud-armory-cost';
      costLabel.textContent = `${item.cost} feathers`;
      footer.appendChild(costLabel);

      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'hud-armory-action';
      footer.appendChild(actionButton);

      const canPurchase = !!local && (item.kind === 'upgrade' ? !ownedUpgrades.has(item.id) : !ownedCosmetics.has(item.id));
      if (!canPurchase) {
        card.classList.toggle('is-locked', !local || (!ownedUpgrades.has(item.id) && item.kind === 'upgrade' && feathers < item.cost) || (!ownedCosmetics.has(item.id) && item.kind === 'cosmetic' && feathers < item.cost));
      }

      if (!local) {
        actionButton.disabled = true;
        actionButton.textContent = 'Unavailable';
      } else if (item.kind === 'upgrade') {
        const owned = ownedUpgrades.has(item.id);
        const equipped = equippedUpgrades.has(item.id);
        if (!owned) {
          actionButton.textContent = 'Purchase';
          actionButton.disabled = feathers < item.cost || !options.onArmoryPurchase;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryPurchase?.(item.id));
          }
        } else if (equipped) {
          actionButton.textContent = 'Unequip';
          actionButton.disabled = !options.onArmoryEquip;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryEquip?.(item.id, item.slot));
          }
        } else {
          actionButton.textContent = 'Equip';
          actionButton.disabled = !options.onArmoryEquip;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryEquip?.(item.id, item.slot));
          }
        }
      } else {
        const owned = ownedCosmetics.has(item.id);
        const equipped = equippedCosmeticId === item.id;
        if (!owned) {
          actionButton.textContent = 'Purchase';
          actionButton.disabled = feathers < item.cost || !options.onArmoryPurchase;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryPurchase?.(item.id));
          }
        } else if (equipped) {
          actionButton.textContent = 'Equipped';
          actionButton.disabled = true;
        } else {
          actionButton.textContent = 'Equip';
          actionButton.disabled = !options.onArmoryEquip;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryEquip?.(item.id, 'cosmetic'));
          }
        }
      }

      container.appendChild(card);
    }
  }

  function updateArmory(state: ArmoryState, playerId: string | null): void {
    currentArmory = state;
    currentPhase = state.phase;
    armoryPanel.dataset.phase = state.phase;
    armoryPanel.classList.toggle('is-visible', state.phase !== 'combat');

    const local = state.players.find((player) => player.playerId === playerId) ?? null;
    localArmory = local;
    armoryReady = local?.ready ?? false;
    if (local) {
      armoryCurrency.innerHTML = `<span>Feathers: ${local.feathers}</span><span>${local.loadoutLabel}</span>`;
    } else {
      armoryCurrency.textContent = 'Feathers: —';
    }

    renderArmoryRoster(state.players, playerId);
    renderArmoryItems(upgradesList, state.upgrades, local);
    renderArmoryItems(cosmeticsList, state.cosmetics, local);

    const readyCount = state.players.filter((player) => player.ready).length;
    const total = state.players.length;
    launchButton.disabled = state.phase !== 'armory' || !options.onLaunchRun;
    if (total > 0) {
      launchButton.textContent = `Launch Sortie (${readyCount}/${total})`;
    } else {
      launchButton.textContent = 'Launch Sortie';
    }
    launchButton.classList.toggle('is-armed', state.phase === 'armory' && readyCount === total && total > 0);

    updateReadyButton();
  }

  function clearRoster(): void {
    for (const row of rosterDom.values()) {
      row.element.remove();
    }
    rosterDom.clear();
  }

  function update(snapshot: WorldSnapshot, playerId: string | null): void {
    if (!playerId) {
      root.style.opacity = '0';
      damageFlash.style.opacity = '0';
      warningLabel.classList.remove('is-visible');
      panel.classList.remove('is-hurt', 'is-invulnerable');
      lastHurtTimer = 0;
      augmentLabel.textContent = 'Augment: —';
      augmentSummary.textContent = 'Augments: —';
      artifactSummary.textContent = 'Artifacts: —';
      magnetSummary.textContent = 'Loot Magnet: —';
      hideBossBanner();
      currentPhase = currentArmory?.phase ?? 'combat';
      extractionReady = false;
      armoryReady = false;
      updateReadyButton();
      readyButton.disabled = true;
      clearLevelUp();
      clearRoster();
      playerArtifactCounts.clear();
      waveLabel.textContent = 'Wave —';
      updateBar(waveProgress, 0, 1, '0%');
      bossLabel.textContent = 'Boss: —';
      extractionLabel.textContent = 'Extraction: —';
      killLabel.textContent = '';
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
      augmentSummary.textContent = 'Augments: —';
      artifactSummary.textContent = 'Artifacts: —';
      magnetSummary.textContent = 'Loot Magnet: —';
      hideBossBanner();
      currentPhase = currentArmory?.phase ?? 'combat';
      extractionReady = false;
      updateReadyButton();
      readyButton.disabled = true;
      clearLevelUp();
      clearRoster();
      waveLabel.textContent = 'Wave —';
      updateBar(waveProgress, 0, 1, '0%');
      bossLabel.textContent = 'Boss: —';
      extractionLabel.textContent = 'Extraction: —';
      killLabel.textContent = '';
      return;
    }

    const seenPlayers = new Set<string>();
    for (const entry of snapshot.players) {
      const previous = playerArtifactCounts.get(entry.id);
      const counts = tallyList(entry.artifacts);
      const isInitial = !previous;
      if (previous) {
        for (const [kind, count] of counts) {
          const before = previous.get(kind) ?? 0;
          if (count > before) {
            showArtifactToast(kind, entry.id === playerId);
          }
        }
      }
      playerArtifactCounts.set(entry.id, counts);
      seenPlayers.add(entry.id);
    }
    for (const id of Array.from(playerArtifactCounts.keys())) {
      if (!seenPlayers.has(id)) {
        playerArtifactCounts.delete(id);
      }
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

    const augmentId = player.lastAugmentId ?? (player.augments.length > 0 ? player.augments[player.augments.length - 1] : null);
    if (augmentId) {
      augmentLabel.textContent = `Augment: ${getAugmentOption(augmentId).name}`;
    } else {
      augmentLabel.textContent = 'Augment: —';
    }

    augmentSummary.textContent = formatAugmentSummary(player.augments);
    artifactSummary.textContent = formatArtifactSummary(player.artifacts);
    magnetSummary.textContent = formatMagnetSummary(player.lootMagnetLevel);

    const hurtTimer = Math.max(0, player.hurtTimer ?? 0);
    const hurtRatio = PLAYER_HURT_FLASH_TIME > 0 ? Math.min(1, hurtTimer / PLAYER_HURT_FLASH_TIME) : 0;
    damageFlash.style.opacity = (hurtRatio * 0.75).toFixed(3);
    panel.classList.toggle('is-hurt', hurtRatio > 0.25);
    panel.classList.toggle('is-invulnerable', (player.invulnerableTimer ?? 0) > 0.15);

    if (hurtTimer > lastHurtTimer + 0.05) {
      audio.trigger(Math.min(1, hurtRatio + 0.2));
    }
    lastHurtTimer = hurtTimer;

    extractionReady = player.ready;
    currentPhase = currentArmory?.phase ?? 'combat';
    updateReadyButton();

    updateRoster(snapshot.players, playerId);
    renderObjectives(snapshot.objectives);
    renderMutators(snapshot.mutators);

    const targeted = snapshot.enemies.some((enemy) => enemy.intent === 'windup' && enemy.targetPlayerId === playerId);
    warningLabel.classList.toggle('is-visible', targeted);
  }

  function updateRoster(players: WorldSnapshot['players'], localId: string): void {
    const seen = new Set<string>();
    const ordered = [...players].sort((a, b) => {
      if (a.id === localId) {
        return -1;
      }
      if (b.id === localId) {
        return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    for (const entry of ordered) {
      let row = rosterDom.get(entry.id);
      if (!row) {
        const element = document.createElement('li');
        element.className = 'hud-roster-item';
        const name = document.createElement('span');
        name.className = 'hud-roster-name';
        element.appendChild(name);
        const meta = document.createElement('span');
        meta.className = 'hud-roster-meta';
        element.appendChild(meta);
        rosterList.appendChild(element);
        row = { element, name, meta };
        rosterDom.set(entry.id, row);
      }
      row.name.textContent = entry.displayName;
      const latestAugment = entry.lastAugmentId ?? (entry.augments.length > 0 ? entry.augments[entry.augments.length - 1] : null);
      if (latestAugment) {
        const augment = getAugmentOption(latestAugment);
        const extra = entry.augments.length > 1 ? ` (+${entry.augments.length - 1})` : '';
        row.meta.textContent = `Lv ${entry.psychicLevel} · ${augment.name}${extra}`;
      } else {
        row.meta.textContent = `Lv ${entry.psychicLevel}`;
      }
      row.element.classList.toggle('is-local', entry.id === localId);
      row.element.classList.toggle('is-ready', entry.ready);
      seen.add(entry.id);
    }

    for (const [id, row] of rosterDom.entries()) {
      if (!seen.has(id)) {
        row.element.remove();
        rosterDom.delete(id);
      }
    }
  }

  function renderObjectives(objectives: WorldSnapshot['objectives']): void {
    waveLabel.textContent = `Wave ${objectives.wave}`;
    updateBar(waveProgress, objectives.waveProgress, 1, `${Math.round(objectives.waveProgress * 100)}%`);
    killLabel.textContent = objectives.totalKills > 0 ? `Total Kills ${objectives.totalKills}` : '';

    if (objectives.nextBossSeconds === null) {
      bossLabel.textContent = 'Boss: Active';
    } else {
      bossLabel.textContent = `Boss in ${formatSeconds(objectives.nextBossSeconds)}`;
    }

    if (!objectives.extractionReady) {
      extractionLabel.textContent = 'Extraction: Locked';
    } else if (objectives.extractionCountdown === null) {
      extractionLabel.textContent = 'Extraction: Awaiting Ready';
    } else if (objectives.extractionCountdown > 0) {
      extractionLabel.textContent = `Extraction: ${formatSeconds(objectives.extractionCountdown)}`;
    } else {
      extractionLabel.textContent = 'Extraction: Ready!';
    }
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
    levelUpOverlay.style.pointerEvents = 'auto';
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
    levelUpOverlay.style.pointerEvents = 'none';
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

  function showArtifactToast(kind: ArtifactKind, isLocal: boolean): void {
    const artifact = ARTIFACT_DEFINITIONS[kind];
    const headline = isLocal ? 'Artifact secured' : 'Ally secured artifact';
    const tone = isLocal ? 'is-artifact-local' : 'is-artifact-ally';
    showToast(headline, artifact?.name ?? kind, tone);
  }

  function showBossSpawn(kind: EnemyKind): void {
    const pretty = kind.charAt(0).toUpperCase() + kind.slice(1);
    presentBossBanner('Miniboss inbound', pretty);
  }

  function showPingAlert(message: QuickPingBroadcastMessage, isLocal: boolean): void {
    const item = document.createElement('div');
    item.className = `hud-ping-alert hud-ping-${message.kind}${isLocal ? ' is-local' : ''}`;
    item.innerHTML = `
      <span class="hud-ping-player">${isLocal ? 'You' : message.playerName}</span>
      <span class="hud-ping-callout">${PING_LABELS[message.kind]}</span>`;
    pingFeed.appendChild(item);

    while (pingFeed.children.length > 3) {
      const first = pingFeed.firstElementChild as HTMLElement | null;
      if (!first) {
        break;
      }
      if (first.dataset.timeoutId) {
        window.clearTimeout(Number(first.dataset.timeoutId));
      }
      first.remove();
    }

    const timeout = window.setTimeout(() => {
      item.remove();
    }, 2400);
    item.dataset.timeoutId = String(timeout);
    pingTimeouts.push(timeout);
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

  function beginPingSelection(): void {
    if (pingActive) {
      return;
    }
    pingActive = true;
    pingWheel.classList.add('is-active');
    setPingSelection(null);
  }

  function updatePingCursor(clientX: number, clientY: number): void {
    if (!pingActive) {
      return;
    }
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      setPingSelection(null);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      setPingSelection(dx > 0 ? 'objective' : 'danger');
    } else {
      setPingSelection(dy > 0 ? 'loot' : 'assist');
    }
  }

  function commitPingSelection(): QuickPingKind | null {
    if (!pingActive) {
      return null;
    }
    pingActive = false;
    pingWheel.classList.remove('is-active');
    const selection = pingSelection;
    setPingSelection(null);
    return selection;
  }

  function cancelPingSelection(): void {
    if (!pingActive) {
      return;
    }
    pingActive = false;
    pingWheel.classList.remove('is-active');
    setPingSelection(null);
  }

  function setPingSelection(kind: QuickPingKind | null): void {
    pingSelection = kind;
    (Object.entries(pingOptions) as Array<[QuickPingKind, HTMLDivElement]>).forEach(([key, element]) => {
      element.classList.toggle('is-selected', key === kind);
    });
  }

  function formatSeconds(value: number): string {
    const clamped = Math.max(0, Math.round(value));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
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
    readyButton.removeEventListener('click', handleReadyClick);
    root.remove();
    window.removeEventListener('keydown', handleLevelUpKey);
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    for (const timeout of pingTimeouts) {
      window.clearTimeout(timeout);
    }
    hideBossBanner();
  }

  return {
    update,
    updateArmory,
    presentLevelUp,
    lockLevelUp,
    clearLevelUp,
    showAugmentToast,
    showBossSpawn,
    showPingAlert,
    beginPingSelection,
    updatePingCursor,
    commitPingSelection,
    cancelPingSelection,
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
