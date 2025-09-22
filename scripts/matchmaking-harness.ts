import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import {
  NETWORK_PROTOCOL_VERSION,
  type ServerMessage,
  type WelcomeMessage
} from '@farsight/shared';

interface HarnessOptions {
  url: string;
  players: number;
  reconnectDelay: number;
}

class SimulatedClient {
  private socket: WebSocket | null = null;
  private playerId: string | null = null;

  constructor(private readonly name: string, private readonly url: string) {}

  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      let resolved = false;
      const timeout = setTimeout(() => {
        reject(new Error(`handshake timeout for ${this.name}`));
      }, 5000);

      const cleanup = () => {
        socket.removeAllListeners();
        clearTimeout(timeout);
      };

      socket.once('open', () => {
        const hello = {
          type: 'hello',
          protocol: NETWORK_PROTOCOL_VERSION,
          displayName: this.name
        };
        socket.send(JSON.stringify(hello));
      });

      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as ServerMessage;
          if (message.type === 'welcome') {
            this.handleWelcome(message);
            cleanup();
            resolved = true;
            this.socket = socket;
            resolve();
          }
        } catch (error) {
          cleanup();
          reject(error);
        }
      });

      socket.once('error', (error) => {
        if (!resolved) {
          cleanup();
          reject(error);
        }
      });

      socket.once('close', () => {
        if (!resolved) {
          cleanup();
          reject(new Error(`connection closed before welcome for ${this.name}`));
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.socket!.once('close', () => resolve());
      this.socket!.close();
    });
    this.socket = null;
  }

  sendReady(ready: boolean): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify({
        type: 'set-ready',
        ready,
        context: 'armory'
      })
    );
  }

  private handleWelcome(message: WelcomeMessage): void {
    this.playerId = message.playerId;
  }

  get id(): string | null {
    return this.playerId;
  }
}

function parseOptions(): HarnessOptions {
  const args = process.argv.slice(2);
  let url = process.env.MATCHMAKING_URL ?? 'ws://localhost:7777';
  let players = 3;
  let reconnectDelay = 1500;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--url' || arg === '-u') && args[i + 1]) {
      url = args[i + 1];
      i += 1;
    } else if ((arg === '--players' || arg === '-p') && args[i + 1]) {
      players = Math.max(1, Number.parseInt(args[i + 1], 10));
      i += 1;
    } else if (arg === '--reconnect-delay' && args[i + 1]) {
      reconnectDelay = Math.max(250, Number.parseInt(args[i + 1], 10));
      i += 1;
    }
  }

  return { url, players, reconnectDelay };
}

async function run(): Promise<void> {
  const options = parseOptions();
  console.log(`[harness] connecting to ${options.url} with ${options.players} clients`);

  const clients = Array.from({ length: options.players }, (_, index) => {
    const name = `Harness-${index + 1}-${randomUUID().slice(0, 4)}`;
    return new SimulatedClient(name, options.url);
  });

  await Promise.all(clients.map((client) => client.connect()));
  console.log('[harness] initial connections established');

  // Pulse readiness to exercise the hub.
  clients.forEach((client, index) => {
    const ready = index % 2 === 0;
    client.sendReady(ready);
  });

  if (clients.length > 0) {
    console.log('[harness] simulating reconnect sequence');
    const primary = clients[0];
    await delay(500);
    await primary.disconnect();
    await delay(options.reconnectDelay);
    await primary.connect();
    primary.sendReady(true);
  }

  await delay(1000);
  console.log('[harness] disconnecting clients');
  await Promise.all(clients.map((client) => client.disconnect().catch(() => {})));
  console.log('[harness] completed successfully');
}

run().catch((error) => {
  console.error('[harness] failed', error);
  process.exitCode = 1;
});
