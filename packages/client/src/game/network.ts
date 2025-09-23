import { NETWORK_PROTOCOL_VERSION } from '@farsight/shared';
import type {
  ArmoryItem,
  ArmoryState,
  AugmentAppliedMessage,
  AugmentId,
  BossSpawnedMessage,
  ChooseAugmentMessage,
  ClientMessage,
  EntityDelta,
  ExtractionEventMessage,
  HelloMessage,
  InputMessage,
  LevelData,
  LevelUpOfferMessage,
  MutatorActivatedMessage,
  ObjectiveState,
  PingMessage,
  PlayerSummary,
  QuickPingBroadcastMessage,
  QuickPingKind,
  QuickPingMessage,
  ReadyContext,
  RosterEntry,
  ServerMessage,
  SummaryAcknowledgeMessage,
  Vector2D,
  WorldSnapshot,
  WorldSnapshotDelta
} from '@farsight/shared';

export type SnapshotListener = (snapshot: WorldSnapshot) => void;
export type DisconnectListener = (event: CloseEvent | Event) => void;
export type PingListener = (latencyMs: number) => void;
export type LevelUpOfferListener = (offer: LevelUpOfferMessage) => void;
export type AugmentAppliedListener = (message: AugmentAppliedMessage) => void;
export type BossSpawnListener = (message: BossSpawnedMessage) => void;
export type PingEventListener = (message: QuickPingBroadcastMessage) => void;
export type ArmoryStateListener = (state: ArmoryState) => void;
export type ExtractionEventListener = (event: ExtractionEventMessage) => void;
export type MutatorActivatedListener = (event: MutatorActivatedMessage) => void;

interface WelcomeState {
  playerId: string;
  tickRate: number;
  level: LevelData;
  players: PlayerSummary[];
  roster: RosterEntry[];
  objectives: ObjectiveState;
  armory: ArmoryState;
}

export class GameNetwork {
  private socket: WebSocket | null = null;
  private welcome: WelcomeState | null = null;
  private level: LevelData | null = null;
  private playerSummaries: PlayerSummary[] = [];
  private roster: RosterEntry[] = [];
  private latestObjectives: ObjectiveState | null = null;
  private armory: ArmoryState | null = null;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private readonly pingListeners = new Set<PingListener>();
  private readonly levelUpListeners = new Set<LevelUpOfferListener>();
  private readonly augmentListeners = new Set<AugmentAppliedListener>();
  private readonly bossListeners = new Set<BossSpawnListener>();
  private readonly quickPingListeners = new Set<PingEventListener>();
  private readonly armoryListeners = new Set<ArmoryStateListener>();
  private readonly extractionListeners = new Set<ExtractionEventListener>();
  private readonly mutatorListeners = new Set<MutatorActivatedListener>();
  private inputSequence = 0;
  private pingTimer: number | null = null;
  private latestPingMs = 0;
  private latestSnapshot: WorldSnapshot | null = null;

  async connect(url: string, displayName: string): Promise<WelcomeState> {
    if (this.socket) {
      throw new Error('Connection already established');
    }

    const socket = new WebSocket(url);
    socket.addEventListener('message', this.handleMessage);
    socket.addEventListener('close', this.handleClose);
    socket.addEventListener('error', this.handleError);
    this.socket = socket;

    const welcomeState = await new Promise<WelcomeState>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out waiting for welcome message'));
      }, 5000);

      socket.addEventListener(
        'open',
        () => {
          const hello: HelloMessage = {
            type: 'hello',
            protocol: NETWORK_PROTOCOL_VERSION,
            displayName
          };
          socket.send(JSON.stringify(hello satisfies ClientMessage));
        },
        { once: true }
      );

      const handleWelcome = (event: MessageEvent<string>) => {
        const data = parseServerMessage(event.data);
        if (data?.type === 'welcome') {
          socket.removeEventListener('message', handleWelcome as EventListener);
          window.clearTimeout(timeout);
          this.welcome = {
            playerId: data.playerId,
            tickRate: data.tickRate,
            level: data.level,
            players: data.players,
            roster: data.roster,
            objectives: data.objectives,
            armory: data.armory
          };
          this.level = data.level;
          this.playerSummaries = data.players;
          this.roster = data.roster;
          this.latestObjectives = data.objectives;
          this.armory = data.armory;
          this.emitArmoryState(data.armory);
          this.startPingLoop();
          resolve(this.welcome);
        }
      };

      socket.addEventListener('message', handleWelcome);

      socket.addEventListener(
        'close',
        () => {
          window.clearTimeout(timeout);
          reject(new Error('Connection closed before welcome message received'));
        },
        { once: true }
      );
    });

    return welcomeState;
  }

  getPlayerId(): string | null {
    return this.welcome?.playerId ?? null;
  }

  getLevel(): LevelData | null {
    return this.level;
  }

  getPlayerSummaries(): PlayerSummary[] {
    return this.playerSummaries;
  }

  getRoster(): RosterEntry[] {
    return this.roster;
  }

  getObjectives(): ObjectiveState | null {
    return this.latestObjectives;
  }

  getArmoryState(): ArmoryState | null {
    return this.armory;
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  onPing(listener: PingListener): () => void {
    this.pingListeners.add(listener);
    if (this.latestPingMs > 0) {
      listener(this.latestPingMs);
    }
    return () => this.pingListeners.delete(listener);
  }

  onLevelUpOffer(listener: LevelUpOfferListener): () => void {
    this.levelUpListeners.add(listener);
    return () => this.levelUpListeners.delete(listener);
  }

  onAugmentApplied(listener: AugmentAppliedListener): () => void {
    this.augmentListeners.add(listener);
    return () => this.augmentListeners.delete(listener);
  }

  onBossSpawn(listener: BossSpawnListener): () => void {
    this.bossListeners.add(listener);
    return () => this.bossListeners.delete(listener);
  }

  onPingEvent(listener: PingEventListener): () => void {
    this.quickPingListeners.add(listener);
    return () => this.quickPingListeners.delete(listener);
  }

  onArmoryState(listener: ArmoryStateListener): () => void {
    this.armoryListeners.add(listener);
    if (this.armory) {
      listener(this.armory);
    }
    return () => this.armoryListeners.delete(listener);
  }

  onExtractionEvent(listener: ExtractionEventListener): () => void {
    this.extractionListeners.add(listener);
    return () => this.extractionListeners.delete(listener);
  }

  onMutatorActivated(listener: MutatorActivatedListener): () => void {
    this.mutatorListeners.add(listener);
    return () => this.mutatorListeners.delete(listener);
  }

  sendInput(state: InputMessage['state']): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: InputMessage = {
      type: 'input',
      sequence: this.inputSequence++,
      state
    };
    this.socket.send(JSON.stringify(message satisfies ClientMessage));
  }

  chooseAugment(offerId: string, augmentId: AugmentId): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: ChooseAugmentMessage = {
      type: 'choose-augment',
      offerId,
      augmentId
    };
    this.socket.send(JSON.stringify(message satisfies ClientMessage));
  }

  setReady(ready: boolean, context: ReadyContext = 'extraction'): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify(
        {
          type: 'set-ready',
          ready,
          context
        } satisfies ClientMessage
      )
    );
  }

  sendQuickPing(kind: QuickPingKind, position: Vector2D): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: QuickPingMessage = {
      type: 'quick-ping',
      kind,
      position
    };
    this.socket.send(JSON.stringify(message satisfies ClientMessage));
  }

  purchaseArmoryItem(itemId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify(
        {
          type: 'armory-purchase',
          itemId
        } satisfies ClientMessage
      )
    );
  }

  equipArmoryItem(itemId: string, slot?: ArmoryItem['slot']): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify(
        {
          type: 'armory-equip',
          itemId,
          slot
        } satisfies ClientMessage
      )
    );
  }

  launchRun(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify(
        {
          type: 'launch-run'
        } satisfies ClientMessage
      )
    );
  }

  acknowledgeSummary(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: SummaryAcknowledgeMessage = { type: 'summary-ack' };
    this.socket.send(JSON.stringify(message satisfies ClientMessage));
  }

  dispose(): void {
    this.disposeSocket();
    this.snapshotListeners.clear();
    this.disconnectListeners.clear();
    this.pingListeners.clear();
    this.levelUpListeners.clear();
    this.augmentListeners.clear();
    this.bossListeners.clear();
    this.quickPingListeners.clear();
    this.armoryListeners.clear();
  }

  private disposeSocket(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (!this.socket) {
      return;
    }

    this.socket.removeEventListener('message', this.handleMessage);
    this.socket.removeEventListener('close', this.handleClose);
    this.socket.removeEventListener('error', this.handleError);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
    this.welcome = null;
    this.level = null;
    this.playerSummaries = [];
    this.roster = [];
    this.latestObjectives = null;
    this.latestPingMs = 0;
    this.armory = null;
    this.latestSnapshot = null;
  }

  private handleMessage = (event: MessageEvent<string>) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }

    switch (message.type) {
      case 'snapshot': {
        this.playerSummaries = message.snapshot.players.map((player) => ({
          id: player.id,
          displayName: player.displayName
        }));
        this.roster = message.snapshot.players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
          level: player.psychicLevel,
          ready: player.ready,
          lastAugmentId: player.lastAugmentId,
          augmentCount: player.augments.length
        }));
        this.latestObjectives = message.snapshot.objectives;
        this.latestSnapshot = message.snapshot;
        for (const listener of this.snapshotListeners) {
          listener(message.snapshot);
        }
        break;
      }
      case 'snapshot-delta': {
        if (!this.latestSnapshot) {
          break;
        }
        if (this.latestSnapshot.tick !== message.baseTick) {
          console.warn('Snapshot delta base mismatch', message.baseTick, this.latestSnapshot.tick);
          break;
        }
        const merged = applySnapshotDelta(this.latestSnapshot, message.delta);
        this.latestSnapshot = merged;
        this.playerSummaries = merged.players.map((player) => ({
          id: player.id,
          displayName: player.displayName
        }));
        this.roster = merged.players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
          level: player.psychicLevel,
          ready: player.ready,
          lastAugmentId: player.lastAugmentId,
          augmentCount: player.augments.length
        }));
        this.latestObjectives = merged.objectives;
        for (const listener of this.snapshotListeners) {
          listener(merged);
        }
        break;
      }
      case 'pong': {
        const latency = performance.now() - message.time;
        this.latestPingMs = latency;
        for (const listener of this.pingListeners) {
          listener(latency);
        }
        break;
      }
      case 'level-up-offer': {
        for (const listener of this.levelUpListeners) {
          listener(message);
        }
        break;
      }
      case 'augment-applied': {
        for (const listener of this.augmentListeners) {
          listener(message);
        }
        break;
      }
      case 'boss-spawned': {
        for (const listener of this.bossListeners) {
          listener(message);
        }
        break;
      }
      case 'ping-event': {
        for (const listener of this.quickPingListeners) {
          listener(message);
        }
        break;
      }
      case 'armory-state': {
        this.armory = message.state;
        this.emitArmoryState(message.state);
        break;
      }
      case 'extraction-event': {
        this.applyExtractionEvent(message);
        for (const listener of this.extractionListeners) {
          listener(message);
        }
        break;
      }
      case 'mutator-activated': {
        for (const listener of this.mutatorListeners) {
          listener(message);
        }
        break;
      }
      case 'welcome': {
        // Already handled in connect promise
        break;
      }
    }
  };

  private handleClose = (event: CloseEvent) => {
    this.disposeSocket();
    for (const listener of this.disconnectListeners) {
      listener(event);
    }
  };

  private handleError = (event: Event) => {
    console.error('WebSocket error', event);
    for (const listener of this.disconnectListeners) {
      listener(event);
    }
  };

  private startPingLoop(): void {
    if (!this.socket) {
      return;
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
    }
    this.pingTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const ping: PingMessage = {
        type: 'ping',
        time: performance.now()
      };
      this.socket.send(JSON.stringify(ping satisfies ClientMessage));
    }, 2000);
  }

  private emitArmoryState(state: ArmoryState): void {
    for (const listener of this.armoryListeners) {
      listener(state);
    }
  }

  private applyExtractionEvent(event: ExtractionEventMessage): void {
    if (!this.latestObjectives) {
      return;
    }
    const next: ObjectiveState = { ...this.latestObjectives };
    switch (event.event) {
      case 'available': {
        next.extractionReady = true;
        next.extractionCountdown = null;
        next.extractionPosition = event.position;
        break;
      }
      case 'countdown-start': {
        next.extractionReady = true;
        next.extractionCountdown = event.countdown;
        if (event.position) {
          next.extractionPosition = event.position;
        }
        break;
      }
      case 'countdown-abort': {
        next.extractionCountdown = null;
        break;
      }
      case 'success': {
        next.extractionReady = false;
        next.extractionCountdown = null;
        break;
      }
    }
    this.latestObjectives = next;
    if (this.latestSnapshot) {
      this.latestSnapshot = { ...this.latestSnapshot, objectives: next };
    }
  }
}

function parseServerMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data) as ServerMessage;
  } catch (error) {
    console.warn('Failed to parse server payload', error);
    return null;
  }
}

function applySnapshotDelta(previous: WorldSnapshot, delta: WorldSnapshotDelta): WorldSnapshot {
  return {
    tick: delta.tick,
    players: applyEntityDelta(previous.players, delta.players),
    enemies: applyEntityDelta(previous.enemies, delta.enemies),
    projectiles: applyEntityDelta(previous.projectiles, delta.projectiles),
    xpDrops: applyEntityDelta(previous.xpDrops, delta.xpDrops),
    artifacts: applyEntityDelta(previous.artifacts, delta.artifacts),
    objectives: delta.objectives ?? previous.objectives,
    mutators: delta.mutators ?? previous.mutators
  };
}

function applyEntityDelta<T extends { id: string }>(previous: T[], change?: EntityDelta<T>): T[] {
  if (!change) {
    return previous;
  }
  const next = previous.filter((entity) => !change.remove.includes(entity.id));
  for (const entity of change.upsert) {
    const index = next.findIndex((existing) => existing.id === entity.id);
    if (index === -1) {
      next.push(entity);
    } else {
      next[index] = entity;
    }
  }
  return next;
}
