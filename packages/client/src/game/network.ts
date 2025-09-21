import {
  ClientMessage,
  HelloMessage,
  InputMessage,
  NETWORK_PROTOCOL_VERSION,
  PingMessage,
  ServerMessage,
  WorldSnapshot,
  LevelData,
  PlayerSummary
} from '@farsight/shared';

export type SnapshotListener = (snapshot: WorldSnapshot) => void;
export type DisconnectListener = (event: CloseEvent | Event) => void;

interface WelcomeState {
  playerId: string;
  tickRate: number;
  level: LevelData;
  players: PlayerSummary[];
}

export class GameNetwork {
  private socket: WebSocket | null = null;
  private welcome: WelcomeState | null = null;
  private level: LevelData | null = null;
  private playerSummaries: PlayerSummary[] = [];
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private inputSequence = 0;
  private pingTimer: number | null = null;

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
            players: data.players
          };
          this.level = data.level;
          this.playerSummaries = data.players;
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

  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
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

  dispose(): void {
    this.disposeSocket();
    this.snapshotListeners.clear();
    this.disconnectListeners.clear();
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
        for (const listener of this.snapshotListeners) {
          listener(message.snapshot);
        }
        break;
      }
      case 'pong': {
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
}

function parseServerMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data) as ServerMessage;
  } catch (error) {
    console.warn('Failed to parse server payload', error);
    return null;
  }
}
