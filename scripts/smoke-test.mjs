import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';

async function main() {
  const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

  const port = 7780;
  const server = spawn(process.execPath, ['--import', 'tsx/esm', 'packages/server/src/index.ts'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(port),
      LEVEL_SEED: '1234'
    }
  });

  try {
    await waitForOutput(server, 'listening');

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await once(ws, 'open');

    ws.send(
      JSON.stringify({
        type: 'hello',
        protocol: 3,
        displayName: 'SmokeBot'
      })
    );

    const welcome = await waitForMessage(ws, 'welcome');
    if (!welcome || welcome.type !== 'welcome') {
      throw new Error('Smoke test did not receive welcome payload');
    }

    const snapshot = await waitForMessage(ws, 'snapshot');
    if (!snapshot || snapshot.type !== 'snapshot') {
      throw new Error('Smoke test did not receive snapshot payload');
    }

    console.log('Smoke test connected, received snapshot tick:', snapshot.snapshot.tick);

    ws.close();
    await once(ws, 'close');
  } finally {
    server.kill();
    try {
      await once(server, 'exit');
    } catch {}
  }
}

async function waitForOutput(child, phrase) {
  const timeout = delay(5000).then(() => {
    throw new Error(`Timed out waiting for server output: ${phrase}`);
  });
  const match = new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.includes(phrase)) {
        resolve();
      }
    });
    child.once('exit', (code) => {
      reject(new Error(`Server exited early with code ${code ?? 'unknown'}`));
    });
  });
  await Promise.race([timeout, match]);
}

async function waitForMessage(ws, expectedType) {
  const timeout = delay(5000).then(() => {
    throw new Error(`Timed out waiting for message type ${expectedType}`);
  });
  const message = new Promise((resolve) => {
    ws.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (error) {
        resolve(null);
      }
    });
  });
  return Promise.race([timeout, message]);
}

main().catch((error) => {
  console.error('[smoke-test] failed:', error);
  process.exitCode = 1;
});
