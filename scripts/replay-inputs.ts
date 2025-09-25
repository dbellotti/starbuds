import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import {
  NETWORK_PROTOCOL_VERSION,
  type PlayerInputState,
  type ServerMessage
} from '@starbuds/shared';

interface RecordedInput {
  delay: number;
  state: PlayerInputState;
}

function parseArgs(): { url: string; path: string } {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error('Usage: npm run replay:inputs -- <file.json> [--url ws://localhost:7777]');
  }
  let path = '';
  let url = process.env.REPLAY_SERVER_URL ?? 'ws://localhost:7777';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!path && !arg.startsWith('--')) {
      path = arg;
    } else if ((arg === '--url' || arg === '-u') && args[i + 1]) {
      url = args[i + 1];
      i += 1;
    }
  }
  if (!path) {
    throw new Error('Input file path required');
  }
  return { url, path };
}

async function loadInputs(path: string): Promise<RecordedInput[]> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Input file must be a JSON array');
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Entry ${index} is not an object`);
    }
    const { delay: entryDelay, state } = entry as { delay: unknown; state: unknown };
    if (typeof entryDelay !== 'number' || entryDelay < 0) {
      throw new Error(`Entry ${index} has invalid delay`);
    }
    if (typeof state !== 'object' || state === null) {
      throw new Error(`Entry ${index} missing state`);
    }
    return {
      delay: entryDelay,
      state: state as PlayerInputState
    };
  });
}

async function connect(url: string, displayName: string): Promise<WebSocket> {
  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      reject(new Error('Unable to complete handshake'));
    }, 5000);

    const cleanup = () => {
      socket.removeAllListeners();
      clearTimeout(timeout);
    };

    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocol: NETWORK_PROTOCOL_VERSION,
          displayName
        })
      );
    });

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ServerMessage;
        if (message.type === 'welcome') {
          cleanup();
          resolve(socket);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    socket.once('error', (error) => {
      cleanup();
      reject(error);
    });

    socket.once('close', () => {
      cleanup();
      reject(new Error('Connection closed during handshake'));
    });
  });
}

async function replay(): Promise<void> {
  const { url, path } = parseArgs();
  const entries = await loadInputs(path);
  if (entries.length === 0) {
    console.warn('[replay] No entries to replay. Exiting.');
    return;
  }

  console.log(`[replay] Loaded ${entries.length} input frames from ${path}`);
  const socket = await connect(url, `Replay-${Date.now().toString(36)}`);
  console.log('[replay] Connected, beginning playback');

  let sequence = 0;
  for (const entry of entries) {
    await delay(entry.delay);
    socket.send(
      JSON.stringify({
        type: 'input',
        sequence: sequence += 1,
        state: entry.state
      })
    );
  }

  console.log('[replay] Playback complete, lingering briefly with final state');
  await delay(500);
  socket.close();
}

replay().catch((error) => {
  console.error('[replay] failed', error);
  process.exitCode = 1;
});
