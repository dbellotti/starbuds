import type {
  ActiveMutators,
  ArmoryItem,
  ArmoryState,
  ArtifactKind,
  AugmentId,
  AugmentOption,
  ExtractionEventMessage,
  EnemyKind,
  GamePhase,
  MutatorActivatedMessage,
  QuickPingBroadcastMessage,
  QuickPingKind,
  ReadyContext,
  RunSummary,
  WorldSnapshot,
  PlayerArmoryState
} from '@starbuds/shared';
import {
  ARTIFACT_DEFINITIONS,
  LOOT_MAGNET_BASE_RADIUS,
  LOOT_MAGNET_MAX_RADIUS,
  LOOT_MAGNET_RADIUS_STEP,
  PLAYER_HURT_FLASH_TIME,
  TICK_RATE,
  getAugmentOption
} from '@starbuds/shared';

import { ArmoryPreviewRenderer } from './armoryPreviewRenderer';
import type { AudioController } from './audio';

type TutorialFlag =
  | 'armoryIntro'
  | 'readyHint'
  | 'launchPrompt'
  | 'inputHelp'
  | 'countdownCallout'
  | 'extractionFail'
  | 'sortieInfo';

type TutorialProgress = Record<TutorialFlag, boolean>;

const TUTORIAL_STORAGE_KEY = 'starbuds/tutorials/v1';

function loadTutorialProgress(): TutorialProgress {
  try {
    const stored = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TutorialProgress>;
      return {
        armoryIntro: Boolean(parsed.armoryIntro),
        readyHint: Boolean(parsed.readyHint),
        launchPrompt: Boolean(parsed.launchPrompt),
        inputHelp: Boolean(parsed.inputHelp),
        countdownCallout: Boolean(parsed.countdownCallout),
        extractionFail: Boolean(parsed.extractionFail),
        sortieInfo: Boolean(parsed.sortieInfo)
      };
    }
  } catch (error) {
    console.warn('Failed to parse tutorial storage', error);
  }
  return {
    armoryIntro: false,
    readyHint: false,
    launchPrompt: false,
    inputHelp: false,
    countdownCallout: false,
    extractionFail: false,
    sortieInfo: false
  };
}

function saveTutorialProgress(state: TutorialProgress): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist tutorial storage', error);
  }
}

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
  handleExtractionEvent(event: ExtractionEventMessage): void;
  handleMutatorActivated(event: MutatorActivatedMessage): void;
  dispose(): void;
}

export interface HudOptions {
  onReadyChange?: (ready: boolean, context: ReadyContext) => void;
  onArmoryPurchase?: (itemId: string) => void;
  onArmoryEquip?: (itemId: string, slot?: ArmoryItem['slot']) => void;
  onLaunchRun?: () => void;
  onSummaryAcknowledge?: () => void;
  audio?: AudioController;
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

  const tutorialOverlay = document.createElement('div');
  tutorialOverlay.className = 'hud-tutorial-overlay';
  tutorialOverlay.setAttribute('aria-hidden', 'true');
  root.appendChild(tutorialOverlay);

  const tutorialCard = document.createElement('div');
  tutorialCard.className = 'hud-tutorial-card';
  tutorialOverlay.appendChild(tutorialCard);

  const tutorialTitle = document.createElement('h3');
  tutorialTitle.className = 'hud-tutorial-title';
  tutorialCard.appendChild(tutorialTitle);

  const tutorialBody = document.createElement('div');
  tutorialBody.className = 'hud-tutorial-body';
  tutorialCard.appendChild(tutorialBody);

  const tutorialActions = document.createElement('div');
  tutorialActions.className = 'hud-tutorial-actions';
  tutorialCard.appendChild(tutorialActions);

  const tutorialDismiss = document.createElement('button');
  tutorialDismiss.type = 'button';
  tutorialDismiss.className = 'hud-tutorial-dismiss';
  tutorialDismiss.textContent = 'Understood';
  tutorialActions.appendChild(tutorialDismiss);

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
  const loadoutChips = document.createElement('div');
  loadoutChips.className = 'hud-build-chips';
  buildPanel.appendChild(loadoutChips);
  panel.appendChild(buildPanel);

  const tipLabel = document.createElement('div');
  tipLabel.className = 'hud-tip';
  tipLabel.textContent = 'LMB: Psychic Bolt · WASD: Move · V: Toggle View · Q: Ping Wheel · G: Quality';
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

  const summaryOverlay = document.createElement('div');
  summaryOverlay.className = 'hud-summary-overlay';
  summaryOverlay.setAttribute('aria-hidden', 'true');
  root.appendChild(summaryOverlay);

  const summaryCard = document.createElement('div');
  summaryCard.className = 'hud-summary-card';
  summaryOverlay.appendChild(summaryCard);

  const summaryTitle = document.createElement('h3');
  summaryTitle.className = 'hud-summary-title';
  summaryCard.appendChild(summaryTitle);

  const summaryStats = document.createElement('div');
  summaryStats.className = 'hud-summary-stats';
  summaryCard.appendChild(summaryStats);

  const summaryList = document.createElement('ul');
  summaryList.className = 'hud-summary-list';
  summaryCard.appendChild(summaryList);

  const summaryCountdown = document.createElement('div');
  summaryCountdown.className = 'hud-summary-countdown';
  summaryCard.appendChild(summaryCountdown);

  const summaryActionButton = document.createElement('button');
  summaryActionButton.type = 'button';
  summaryActionButton.className = 'hud-summary-continue';
  summaryActionButton.textContent = 'Return to Armory';
  summaryCard.appendChild(summaryActionButton);

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
  const objectiveDailyMutatorLabel = document.createElement('div');
  objectiveDailyMutatorLabel.className = 'hud-mutator hud-mutator-daily';
  mutatorPanel.appendChild(objectiveDailyMutatorLabel);
  const objectiveWeeklyMutatorLabel = document.createElement('div');
  objectiveWeeklyMutatorLabel.className = 'hud-mutator hud-mutator-weekly';
  mutatorPanel.appendChild(objectiveWeeklyMutatorLabel);

  const armoryPanel = document.createElement('div');
  armoryPanel.className = 'hud-armory';
  root.appendChild(armoryPanel);
  const armoryDialog = document.createElement('div');
  armoryDialog.className = 'hud-armory-dialog';
  armoryPanel.appendChild(armoryDialog);

  const armorySidebar = document.createElement('aside');
  armorySidebar.className = 'hud-armory-sidebar';
  armoryDialog.appendChild(armorySidebar);

  const armoryHeader = document.createElement('div');
  armoryHeader.className = 'hud-armory-header';
  armoryHeader.textContent = 'Armory Hub';
  armorySidebar.appendChild(armoryHeader);

  const armoryCurrency = document.createElement('div');
  armoryCurrency.className = 'hud-armory-currency';
  armorySidebar.appendChild(armoryCurrency);

  const armoryMutators = document.createElement('div');
  armoryMutators.className = 'hud-armory-mutators';
  armorySidebar.appendChild(armoryMutators);
  const armoryDailyMutatorLabel = document.createElement('div');
  armoryDailyMutatorLabel.className = 'hud-armory-mutator hud-armory-mutator-daily';
  armoryMutators.appendChild(armoryDailyMutatorLabel);
  const armoryWeeklyMutatorLabel = document.createElement('div');
  armoryWeeklyMutatorLabel.className = 'hud-armory-mutator hud-armory-mutator-weekly';
  armoryMutators.appendChild(armoryWeeklyMutatorLabel);

  const armoryReadyList = document.createElement('ul');
  armoryReadyList.className = 'hud-armory-roster';
  armorySidebar.appendChild(armoryReadyList);

  const armoryActions = document.createElement('div');
  armoryActions.className = 'hud-armory-actions';
  armorySidebar.appendChild(armoryActions);

  const armoryReadyToggle = document.createElement('button');
  armoryReadyToggle.type = 'button';
  armoryReadyToggle.className = 'hud-armory-ready';
  armoryReadyToggle.textContent = 'Prep Loadout';
  armoryActions.appendChild(armoryReadyToggle);

  const handleArmoryReadyClick = () => {
    if (armoryReadyToggle.disabled) {
      return;
    }
    toggleReady('armory');
  };

  armoryReadyToggle.addEventListener('click', handleArmoryReadyClick);

  const armoryLaunchHint = document.createElement('p');
  armoryLaunchHint.className = 'hud-armory-launch-hint';
  armoryLaunchHint.textContent = 'When everyone is ready, launch the sortie.';
  armoryActions.appendChild(armoryLaunchHint);

  const launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'hud-armory-launch';
  launchButton.textContent = 'Launch Sortie';
  armoryActions.appendChild(launchButton);

  const armoryPreview = document.createElement('div');
  armoryPreview.className = 'hud-armory-preview';
  armoryDialog.appendChild(armoryPreview);

  const previewStage = document.createElement('div');
  previewStage.className = 'hud-armory-preview-stage';
  previewStage.setAttribute('aria-hidden', 'true');
  armoryPreview.appendChild(previewStage);

  const previewRenderer = new ArmoryPreviewRenderer(previewStage, {
    audio: options.audio
  });
  previewRenderer.mount();
  previewRenderer.setActive(false);

  const previewContent = document.createElement('div');
  previewContent.className = 'hud-armory-preview-content';
  armoryPreview.appendChild(previewContent);

  const previewTitle = document.createElement('h3');
  previewTitle.className = 'hud-armory-preview-title';
  previewContent.appendChild(previewTitle);

  const previewSummary = document.createElement('p');
  previewSummary.className = 'hud-armory-preview-summary';
  previewContent.appendChild(previewSummary);

  const previewDescription = document.createElement('p');
  previewDescription.className = 'hud-armory-preview-description';
  previewContent.appendChild(previewDescription);

  const previewStatus = document.createElement('div');
  previewStatus.className = 'hud-armory-preview-status';
  previewContent.appendChild(previewStatus);

  const previewHint = document.createElement('p');
  previewHint.className = 'hud-armory-preview-hint';
  previewHint.textContent = 'Hover or focus an upgrade to see how it affects your build.';
  previewContent.appendChild(previewHint);

  const sortieInfoButton = document.createElement('button');
  sortieInfoButton.type = 'button';
  sortieInfoButton.className = 'hud-sortie-info';
  sortieInfoButton.textContent = 'What is a Sortie?';
  previewContent.appendChild(sortieInfoButton);

  const handleSortieInfoClick = () => {
    showTutorialOverlay(
      'Sortie Primer',
      '<p>A sortie is a cooperative drop into the arena. Spend feathers in the armory, ready up with your squad, then hit Launch to deploy.</p><p>Extraction unlocks once you survive enough waves—watch the objectives panel for the beacon.</p>',
      {
        highlight: 'launch',
        dismissLabel: 'Close',
        onDismiss: () => markTutorial('sortieInfo')
      }
    );
  };

  sortieInfoButton.addEventListener('click', handleSortieInfoClick);

  const armorySections = document.createElement('div');
  armorySections.className = 'hud-armory-sections';
  armoryDialog.appendChild(armorySections);

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
  launchButton.addEventListener('click', () => {
    if (launchButton.disabled) {
      return;
    }
    options.onLaunchRun?.();
  });

  const tutorialProgress = loadTutorialProgress();
  type TutorialHighlight = 'armory' | 'ready' | 'launch' | 'beacon' | null;
  let tutorialDismissHandler: (() => void) | null = null;

  function isTutorialComplete(flag: TutorialFlag): boolean {
    return tutorialProgress[flag];
  }

  function markTutorial(flag: TutorialFlag): void {
    if (!tutorialProgress[flag]) {
      tutorialProgress[flag] = true;
      saveTutorialProgress(tutorialProgress);
    }
  }

  function applyTutorialHighlight(target: TutorialHighlight): void {
    armoryDialog.classList.toggle('is-highlighted', target === 'armory');
    readyButton.classList.toggle('is-highlighted', target === 'ready');
    launchButton.classList.toggle('is-highlighted', target === 'launch');
    extractionLabel.classList.toggle('is-highlighted', target === 'beacon');
  }

  function hideTutorialOverlay(suppressCallback = false): void {
    if (!tutorialOverlay.classList.contains('is-visible')) {
      return;
    }
    tutorialOverlay.classList.remove('is-visible');
    tutorialOverlay.setAttribute('aria-hidden', 'true');
    applyTutorialHighlight(null);
    const handler = tutorialDismissHandler;
    tutorialDismissHandler = null;
    if (handler && !suppressCallback) {
      handler();
    }
  }

  function showTutorialOverlay(
    title: string,
    bodyHtml: string,
    options: { dismissLabel?: string; highlight?: TutorialHighlight; onDismiss?: () => void } = {}
  ): void {
    if (tutorialOverlay.classList.contains('is-visible')) {
      hideTutorialOverlay(true);
    }
    tutorialTitle.textContent = title;
    tutorialBody.innerHTML = bodyHtml;
    tutorialDismiss.textContent = options.dismissLabel ?? 'Understood';
    tutorialDismissHandler = options.onDismiss ?? null;
    applyTutorialHighlight(options.highlight ?? null);
    tutorialOverlay.classList.add('is-visible');
    tutorialOverlay.setAttribute('aria-hidden', 'false');
  }

  const handleTutorialOverlayClick = (event: MouseEvent) => {
    if (event.target === tutorialOverlay) {
      hideTutorialOverlay();
    }
  };

  const handleTutorialKey = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      hideTutorialOverlay();
    }
  };

  const handleTutorialDismiss = () => hideTutorialOverlay();

  tutorialDismiss.addEventListener('click', handleTutorialDismiss);
  tutorialOverlay.addEventListener('click', handleTutorialOverlayClick);
  window.addEventListener('keydown', handleTutorialKey, { passive: true });

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
  let pendingCosmeticId: string | null = null;
  let pendingCosmeticReset: number | null = null;
  let pingActive = false;
  let pingSelection: QuickPingKind | null = null;
  const rosterDom = new Map<string, RosterRow>();
  const pingTimeouts: number[] = [];
  const delayedTasks: number[] = [];
  const playerArtifactCounts = new Map<string, Map<ArtifactKind, number>>();
  let bossBannerTimer: number | null = null;
  let summaryAcknowledged = false;
  let hasShownCombatHelp = isTutorialComplete('inputHelp');

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

  function computeReadyLabel(context: ReadyContext, pressed: boolean, isSummary: boolean): string {
    if (isSummary) {
      return 'Summary';
    }
    if (context === 'armory') {
      return pressed ? 'Ready for Drop' : 'Prep Loadout';
    }
    return pressed ? 'Ready' : 'Ready Up';
  }

  const updateReadyButton = () => {
    const context = currentPhase === 'armory' ? 'armory' : 'extraction';
    readyButton.dataset.context = context;
    const isSummary = currentPhase === 'summary';
    const pressed = context === 'armory' ? armoryReady : extractionReady;
    const disabled = isSummary || !options.onReadyChange;
    const label = computeReadyLabel(context, pressed, isSummary);
    readyButton.disabled = disabled;
    readyButton.classList.toggle('is-ready', pressed && !disabled);
    readyButton.textContent = label;
    readyButton.setAttribute('aria-pressed', pressed && !disabled ? 'true' : 'false');
    updateArmoryReadyToggle();
  };

  function updateArmoryReadyToggle(): void {
    if (!armoryReadyToggle) {
      return;
    }
    const disabled = currentPhase !== 'armory' || !options.onReadyChange;
    const label = computeReadyLabel('armory', armoryReady, currentPhase === 'summary');
    armoryReadyToggle.disabled = disabled;
    armoryReadyToggle.textContent = label;
    armoryReadyToggle.classList.toggle('is-ready', armoryReady && !disabled);
  }

  function toggleReady(context: ReadyContext): void {
    if (!options.onReadyChange) {
      return;
    }
    if (context === 'armory') {
      armoryReady = !armoryReady;
      options.onReadyChange(armoryReady, 'armory');
    } else {
      extractionReady = !extractionReady;
      options.onReadyChange(extractionReady, 'extraction');
    }
    updateReadyButton();
  }

  const handleReadyClick = () => {
    if (readyButton.disabled) {
      return;
    }
    const context = (readyButton.dataset.context as ReadyContext) ?? 'extraction';
    toggleReady(context);
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
      objectiveDailyMutatorLabel.textContent = 'Daily Mutator: —';
      objectiveWeeklyMutatorLabel.textContent = 'Weekly Mutator: —';
      armoryDailyMutatorLabel.textContent = 'Daily Mutator: —';
      armoryWeeklyMutatorLabel.textContent = 'Weekly Mutator: —';
      return;
    }
    objectiveDailyMutatorLabel.textContent = `Daily: ${mutators.daily.name} — ${mutators.daily.impactSummary}`;
    objectiveWeeklyMutatorLabel.textContent = `Weekly: ${mutators.weekly.name} — ${mutators.weekly.impactSummary}`;
    armoryDailyMutatorLabel.textContent = `Daily: ${mutators.daily.name} — ${mutators.daily.impactSummary}`;
    armoryWeeklyMutatorLabel.textContent = `Weekly: ${mutators.weekly.name} — ${mutators.weekly.impactSummary}`;
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

  function renderLoadoutSummary(local: PlayerArmoryState | null, state: ArmoryState | null): void {
    if (!loadoutChips) {
      return;
    }
    loadoutChips.replaceChildren();
    if (!local || !state) {
      const empty = document.createElement('span');
      empty.className = 'hud-chip hud-chip-empty';
      empty.textContent = 'Armory upgrades will appear here';
      loadoutChips.appendChild(empty);
      return;
    }

    const chips: HTMLElement[] = [];
    for (const upgradeId of local.equippedUpgrades) {
      const upgrade = state.upgrades.find((entry) => entry.id === upgradeId);
      const chip = document.createElement('span');
      chip.className = 'hud-chip hud-chip-upgrade';
      chip.textContent = upgrade?.name ?? upgradeId;
      chips.push(chip);
    }
    if (local.equippedCosmeticId) {
      const cosmetic = state.cosmetics.find((entry) => entry.id === local.equippedCosmeticId);
      const chip = document.createElement('span');
      chip.className = 'hud-chip hud-chip-cosmetic';
      chip.textContent = cosmetic?.name ?? 'Cosmetic';
      chips.push(chip);
    }

    if (chips.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hud-chip hud-chip-empty';
      empty.textContent = 'Equip upgrades in the armory';
      chips.push(empty);
    }

    loadoutChips.replaceChildren(...chips);
  }

  function hideRunSummaryOverlay(): void {
    summaryAcknowledged = false;
    summaryActionButton.disabled = false;
    summaryActionButton.textContent = 'Return to Armory';
    summaryCountdown.textContent = '';
    summaryOverlay.classList.remove('is-visible');
    summaryOverlay.setAttribute('aria-hidden', 'true');
    summaryTitle.textContent = '';
    summaryStats.textContent = '';
    summaryList.replaceChildren();
  }

  function showRunSummaryOverlay(summary: RunSummary): void {
    summaryAcknowledged = false;
    const durationSeconds = Math.max(0, summary.durationTicks / TICK_RATE);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.round(durationSeconds - minutes * 60);
    summaryTitle.textContent = `Sortie Debrief — Wave ${summary.wave}`;
    summaryStats.textContent = `${summary.totalKills} kills • ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    summaryList.replaceChildren(
      ...summary.playerStats.map((stats) => {
        const item = document.createElement('li');
        item.className = 'hud-summary-row';
        item.innerHTML = `
          <span class="hud-summary-name">${stats.displayName}</span>
          <span class="hud-summary-detail">Level ${stats.psychicLevel}</span>
          <span class="hud-summary-detail">Augments ${stats.augments.length}</span>
          <span class="hud-summary-detail">Artifacts ${stats.artifacts.length}</span>
          <span class="hud-summary-detail">XP ${stats.xpCollected}</span>
        `;
        return item;
      })
    );
    summaryOverlay.classList.add('is-visible');
    summaryOverlay.setAttribute('aria-hidden', 'false');
    summaryActionButton.disabled = false;
    summaryActionButton.textContent = 'Return to Armory';
    summaryCountdown.textContent = 'Review the sortie report, then continue when ready.';
  }

  summaryActionButton.addEventListener('click', () => {
    if (summaryAcknowledged) {
      return;
    }
    summaryAcknowledged = true;
    summaryActionButton.disabled = true;
    summaryActionButton.textContent = 'Waiting for squad…';
    summaryCountdown.textContent = 'Waiting for squad…';
    options.onSummaryAcknowledge?.();
  });

  function resolveItemStatus(item: ArmoryItem, local: PlayerArmoryState | null): string {
    if (!local) {
      return 'Connect to inspect and purchase upgrades.';
    }
    const feathers = local.feathers;
    if (item.kind === 'upgrade') {
      const owned = local.ownedUpgrades.includes(item.id);
      const equipped = local.equippedUpgrades.includes(item.id);
      if (equipped) {
        return 'Equipped for next sortie.';
      }
      if (owned) {
        return 'Owned • Equip to activate benefits.';
      }
      return feathers >= item.cost
        ? `Cost: ${item.cost} feathers` 
        : `Need ${item.cost - feathers} more feathers.`;
    }
    const owned = local.ownedCosmetics.includes(item.id);
    const equipped = local.equippedCosmeticId === item.id;
    if (equipped) {
      return 'Equipped cosmetic skin.';
    }
    if (owned) {
      return 'Owned cosmetic • Equip to show in sortie.';
    }
    return feathers >= item.cost
      ? `Cost: ${item.cost} feathers`
      : `Need ${item.cost - feathers} more feathers.`;
  }

  function resolveCosmeticName(id: string | null): string {
    if (!id || !currentArmory) {
      return 'Default Rig';
    }
    const cosmetic = currentArmory.cosmetics.find((item) => item.id === id);
    return cosmetic ? cosmetic.name : 'Custom Rig';
  }

  function resolveEquippedUpgradeNames(local: PlayerArmoryState | null): string {
    if (!local || !currentArmory) {
      return 'No upgrades equipped yet.';
    }
    const equipped = currentArmory.upgrades
      .filter((upgrade) => local.equippedUpgrades.includes(upgrade.id))
      .map((upgrade) => upgrade.name);
    if (equipped.length === 0) {
      return 'No upgrades equipped yet.';
    }
    return `Upgrades: ${equipped.join(', ')}`;
  }

  function setPreview(item: ArmoryItem | null): void {
    const local = localArmory;
    const idleCosmeticId = pendingCosmeticId ?? local?.equippedCosmeticId ?? null;
    const updateText = (target: HTMLElement, text: string): void => {
      target.textContent = text;
    };
    if (item) {
      previewStage.dataset.kind = item.kind;
      previewStage.dataset.slot = item.slot;
      updateText(previewTitle, item.name);
      updateText(previewSummary, item.statSummary);
      updateText(previewDescription, item.description);
      updateText(previewStatus, resolveItemStatus(item, local));
      updateText(
        previewHint,
        item.kind === 'cosmetic'
          ? 'Purchase or equip from the list on the right to update your look.'
          : 'Purchase or equip from the list on the right to adjust your build.'
      );
      if (item.kind === 'upgrade') {
        previewRenderer.setState({ cosmeticId: idleCosmeticId });
        previewRenderer.previewUpgrade(item.id);
      } else {
        previewRenderer.clearUpgrade();
        previewRenderer.setState({ cosmeticId: item.id });
        options.audio?.playArmoryHover();
      }
      return;
    }

    previewStage.dataset.kind = local ? 'summary' : 'empty';
    previewStage.dataset.slot = idleCosmeticId ? 'cosmetic' : 'summary';
    updateText(previewTitle, local?.loadoutLabel ?? 'Armory Preview');
    updateText(previewSummary, resolveEquippedUpgradeNames(local));
    const cosmeticName = resolveCosmeticName(idleCosmeticId);
    if (local) {
      updateText(previewDescription, `Feathers available: ${local.feathers}`);
      updateText(previewStatus, `Cosmetic: ${cosmeticName} • Ready: ${local.ready ? 'Yes' : 'No'}`);
      updateText(previewHint, 'Hover or focus any card to preview its impact before purchasing.');
    } else {
      updateText(previewDescription, 'Connect to the armory to browse upgrades and cosmetics.');
      updateText(previewStatus, '');
      updateText(previewHint, 'Waiting for armory sync…');
    }
    previewRenderer.clearUpgrade();
    previewRenderer.setState({ cosmeticId: idleCosmeticId });
  }

  setPreview(null);

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
      card.dataset.kind = item.kind;
      card.dataset.slot = item.slot;
      card.tabIndex = 0;
      card.setAttribute('role', 'group');

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

      const header = document.createElement('div');
      header.className = 'hud-armory-item-header';
      card.appendChild(header);

      const previewChip = document.createElement('div');
      previewChip.className = 'hud-armory-item-preview';
      previewChip.dataset.kind = item.kind;
      previewChip.dataset.slot = item.slot;
      header.appendChild(previewChip);

      const previewKind = document.createElement('span');
      previewKind.className = 'hud-armory-item-preview-kind';
      previewKind.textContent = item.kind === 'upgrade' ? 'Upgrade' : 'Cosmetic';
      previewChip.appendChild(previewKind);

      const previewSlot = document.createElement('span');
      previewSlot.className = 'hud-armory-item-preview-slot';
      previewSlot.textContent = item.kind === 'cosmetic' ? 'Style' : item.slot === 'ability' ? 'Ability' : 'Passive';
      previewChip.appendChild(previewSlot);

      const headerCopy = document.createElement('div');
      headerCopy.className = 'hud-armory-item-headline';
      header.appendChild(headerCopy);

      const title = document.createElement('h4');
      title.textContent = item.name;
      headerCopy.appendChild(title);

      const summary = document.createElement('p');
      summary.className = 'hud-armory-summary';
      summary.textContent = item.statSummary;
      headerCopy.appendChild(summary);

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

      let isLocked = false;

      const triggerEquip = (slot?: ArmoryItem['slot']) => {
        if (!options.onArmoryEquip) {
          return;
        }
        options.onArmoryEquip(item.id, slot);
        options.audio?.playArmoryEquip();
        if (item.kind === 'cosmetic') {
          pendingCosmeticId = item.id;
          if (pendingCosmeticReset !== null) {
            window.clearTimeout(pendingCosmeticReset);
          }
          pendingCosmeticReset = window.setTimeout(() => {
            if (pendingCosmeticId === item.id) {
              pendingCosmeticId = null;
              setPreview(null);
            }
            pendingCosmeticReset = null;
          }, 1800);
          previewRenderer.clearUpgrade();
          previewRenderer.setState({ cosmeticId: item.id });
          setPreview(null);
        } else {
          previewRenderer.previewUpgrade(item.id);
        }
      };

      if (!local) {
        isLocked = true;
        actionButton.disabled = true;
        actionButton.textContent = 'Unavailable';
      } else if (item.kind === 'upgrade') {
        const owned = ownedUpgrades.has(item.id);
        const equipped = equippedUpgrades.has(item.id);
        if (!owned) {
          actionButton.textContent = 'Purchase';
          actionButton.disabled = feathers < item.cost || !options.onArmoryPurchase;
          isLocked = feathers < item.cost;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => options.onArmoryPurchase?.(item.id));
          }
        } else if (equipped) {
          actionButton.textContent = 'Unequip';
          actionButton.disabled = !options.onArmoryEquip;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => triggerEquip(item.slot));
          }
        } else {
          actionButton.textContent = 'Equip';
          actionButton.disabled = !options.onArmoryEquip;
          if (!actionButton.disabled) {
            actionButton.addEventListener('click', () => triggerEquip(item.slot));
          }
        }
      } else {
        const owned = ownedCosmetics.has(item.id);
        const equipped = equippedCosmeticId === item.id;
        if (!owned) {
          actionButton.textContent = 'Purchase';
          actionButton.disabled = feathers < item.cost || !options.onArmoryPurchase;
          isLocked = feathers < item.cost;
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
            actionButton.addEventListener('click', () => triggerEquip('cosmetic'));
          }
        }
      }

      if (isLocked) {
        card.classList.add('is-locked');
      }

      card.addEventListener('mouseenter', () => {
        card.classList.add('is-previewing');
        setPreview(item);
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-previewing');
        setPreview(null);
      });
      card.addEventListener('focusin', () => {
        card.classList.add('is-previewing');
        setPreview(item);
      });
      card.addEventListener('focusout', (event) => {
        const next = event.relatedTarget as Node | null;
        if (next && card.contains(next)) {
          return;
        }
        card.classList.remove('is-previewing');
        setPreview(null);
      });

      container.appendChild(card);
    }
  }

  function updateArmory(state: ArmoryState, playerId: string | null): void {
    currentArmory = state;
    currentPhase = state.phase;
    armoryPanel.dataset.phase = state.phase;
    armoryPanel.classList.toggle('is-visible', state.phase !== 'combat');
    previewRenderer.setActive(state.phase !== 'combat');

    if (state.phase === 'summary' && state.summary) {
      showRunSummaryOverlay(state.summary);
    } else {
      hideRunSummaryOverlay();
    }

    const local = state.players.find((player) => player.playerId === playerId) ?? null;
    localArmory = local;
    armoryReady = local?.ready ?? false;
    if (!local) {
      pendingCosmeticId = null;
      if (pendingCosmeticReset !== null) {
        window.clearTimeout(pendingCosmeticReset);
        pendingCosmeticReset = null;
      }
    } else if (pendingCosmeticId && local.equippedCosmeticId === pendingCosmeticId) {
      pendingCosmeticId = null;
      if (pendingCosmeticReset !== null) {
        window.clearTimeout(pendingCosmeticReset);
        pendingCosmeticReset = null;
      }
    }
    if (local) {
      armoryCurrency.innerHTML = `<span>Feathers: ${local.feathers}</span><span>${local.loadoutLabel}</span>`;
    } else {
      armoryCurrency.textContent = 'Feathers: —';
    }

    renderArmoryRoster(state.players, playerId);
    renderArmoryItems(upgradesList, state.upgrades, local);
    renderArmoryItems(cosmeticsList, state.cosmetics, local);
    setPreview(null);
    renderLoadoutSummary(local, state);

    const readyCount = state.players.filter((player) => player.ready).length;
    const total = state.players.length;
    launchButton.disabled = state.phase !== 'armory' || !options.onLaunchRun;
    if (total > 0) {
      launchButton.textContent = `Launch Sortie (${readyCount}/${total})`;
      const allReady = readyCount === total;
      armoryLaunchHint.textContent = allReady
        ? 'All players ready. Launch when the squad is set.'
        : `Ready players: ${readyCount}/${total}. Toggle Ready on the roster to arm the drop.`;
    } else {
      launchButton.textContent = 'Launch Sortie';
      armoryLaunchHint.textContent = 'Waiting for squadmates to connect.';
    }
    launchButton.classList.toggle('is-armed', state.phase === 'armory' && readyCount === total && total > 0);

    updateReadyButton();

    const ownedCount = local?.ownedUpgrades.length ?? 0;

    if (state.phase === 'armory' && !isTutorialComplete('armoryIntro') && !tutorialOverlay.classList.contains('is-visible')) {
      showTutorialOverlay(
        'Armory Hub',
        '<p>Spend feathers on upgrades to shape your build or pick a cosmetic to change your look.</p><p>Hover any card to preview its impact before purchasing.</p>',
        {
          highlight: 'armory',
          onDismiss: () => markTutorial('armoryIntro')
        }
      );
    }

    if (state.phase === 'armory' && local && !local.ready && ownedCount > 0 && !isTutorialComplete('readyHint') && !tutorialOverlay.classList.contains('is-visible')) {
      showTutorialOverlay(
        'Ready When Set',
        '<p>Toggle <strong>Ready</strong> once your loadout is dialed in. Everyone must ready up before the squad can launch.</p>',
        {
          highlight: 'ready',
          onDismiss: () => markTutorial('readyHint')
        }
      );
    }

    if (local?.ready && !isTutorialComplete('readyHint')) {
      markTutorial('readyHint');
    }

    if (state.phase === 'armory' && readyCount === total && total > 0 && !isTutorialComplete('launchPrompt') && !tutorialOverlay.classList.contains('is-visible')) {
      showTutorialOverlay(
        'Launch the Sortie',
        '<p>The whole squad is ready. Press <strong>Launch Sortie</strong> to drop into the mission.</p>',
        {
          highlight: 'launch',
          onDismiss: () => markTutorial('launchPrompt')
        }
      );
    }

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
      hideTutorialOverlay(true);
      hideRunSummaryOverlay();
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
      hideTutorialOverlay(true);
      hideRunSummaryOverlay();
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

    const previousPhase = currentPhase;
    currentPhase = currentArmory?.phase ?? 'combat';
    if (!hasShownCombatHelp && previousPhase !== 'combat' && currentPhase === 'combat') {
      showToast('Combat Controls', 'Space/Shift: Dash · Q: Ping Wheel', 'is-info');
      markTutorial('inputHelp');
      hasShownCombatHelp = true;
    }

    const seenPlayers = new Set<string>();
    for (const entry of snapshot.players) {
      const previous = playerArtifactCounts.get(entry.id);
      const counts = tallyList(entry.artifacts);
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
    renderLoadoutSummary(localArmory, currentArmory);

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
      extractionLabel.classList.remove('is-highlighted');
    } else if (objectives.extractionCountdown === null) {
      extractionLabel.textContent = 'Extraction: Awaiting Ready';
      extractionLabel.classList.remove('is-highlighted');
    } else if (objectives.extractionCountdown > 0) {
      extractionLabel.textContent = `Extraction: ${formatSeconds(objectives.extractionCountdown)}`;
      extractionLabel.classList.add('is-highlighted');
    } else {
      extractionLabel.textContent = 'Extraction: Ready!';
      extractionLabel.classList.remove('is-highlighted');
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
    const buttons = levelUpOptions.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((button) => {
      button.disabled = true;
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

  function handleExtractionEvent(event: ExtractionEventMessage): void {
    switch (event.event) {
      case 'available': {
        showToast('Extraction Beacon Online', 'Ready up and move to the marker.', 'is-info');
        break;
      }
      case 'countdown-start': {
        if (!isTutorialComplete('countdownCallout')) {
          showTutorialOverlay(
            'Hold the Beacon',
            '<p>The dropship is inbound. Stay near the extraction beacon and keep everyone ready to finish the sortie.</p>',
            {
              highlight: 'beacon',
              onDismiss: () => markTutorial('countdownCallout')
            }
          );
        } else {
          showToast('Extraction Countdown', 'Hold the zone until the dropship arrives.', 'is-info');
        }
        break;
      }
      case 'countdown-abort': {
        if (!isTutorialComplete('extractionFail')) {
          showTutorialOverlay(
            'Extraction Aborted',
            '<p>The countdown stopped because readiness dropped. Make sure the whole squad toggles Ready and regroup at the beacon.</p>',
            {
              highlight: 'ready',
              onDismiss: () => markTutorial('extractionFail')
            }
          );
        } else {
          showToast('Extraction Aborted', 'Readiness dropped—regroup and ready up.', 'is-warning');
        }
        break;
      }
      case 'success': {
        hideTutorialOverlay();
        showToast('Extraction Successful', 'Debrief incoming…', 'is-success');
        break;
      }
    }
  }

  function handleMutatorActivated(event: MutatorActivatedMessage): void {
    const { daily, weekly } = event.mutators;
    showToast(`Daily Mutator: ${daily.name}`, daily.impactSummary, 'is-mutator');
    const timeout = window.setTimeout(() => {
      showToast(`Weekly Mutator: ${weekly.name}`, weekly.impactSummary, 'is-mutator');
    }, 2800);
    delayedTasks.push(timeout);
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
    previewRenderer.dispose();
    readyButton.removeEventListener('click', handleReadyClick);
    armoryReadyToggle.removeEventListener('click', handleArmoryReadyClick);
    tutorialDismiss.removeEventListener('click', handleTutorialDismiss);
    tutorialOverlay.removeEventListener('click', handleTutorialOverlayClick);
    window.removeEventListener('keydown', handleTutorialKey);
    sortieInfoButton.removeEventListener('click', handleSortieInfoClick);
    hideTutorialOverlay(true);
    hideRunSummaryOverlay();
    root.remove();
    window.removeEventListener('keydown', handleLevelUpKey);
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    for (const timeout of pingTimeouts) {
      window.clearTimeout(timeout);
    }
    for (const timeout of delayedTasks) {
      window.clearTimeout(timeout);
    }
    if (pendingCosmeticReset !== null) {
      window.clearTimeout(pendingCosmeticReset);
      pendingCosmeticReset = null;
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
    handleExtractionEvent,
    handleMutatorActivated,
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
