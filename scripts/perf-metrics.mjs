import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const viteBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

async function runBuild(serverPort) {
  const build = spawn('npm', ['run', 'build', '--workspace=@farsight/client'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SERVER_ORIGIN: `ws://127.0.0.1:${serverPort}`,
      VITE_SERVER_PATH: '/'
    }
  });
  const [code] = await once(build, 'exit');
  if (code !== 0) {
    throw new Error('Client build failed');
  }
}

async function ensureServerBuild() {}

async function main() {
  const serverPort = 7790;
  const previewPort = 4173;

  await ensureServerBuild(rootDir);
  await runBuild(serverPort);

  const server = spawn(process.execPath, ['--import', 'tsx/esm', 'packages/server/src/index.ts'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(serverPort)
    }
  });

  try {
    await waitForOutput(server, 'listening');

    const preview = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', String(previewPort)], {
      cwd: path.join(rootDir, 'packages/client'),
      stdio: ['ignore', 'pipe', 'inherit']
    });

    try {
      await waitForOutput(preview, 'Local');

      const browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${previewPort}/`, { waitUntil: 'networkidle0' });
      await delay(1500);

      const fpsSamples = await page.evaluate(async () => {
        const samples = [];
        let frames = 0;
        let last = performance.now();

        return new Promise((resolve) => {
          function step(now) {
            frames += 1;
            if (now - last >= 1000) {
              samples.push((frames * 1000) / (now - last));
              frames = 0;
              last = now;
            }
            if (samples.length < 5) {
              requestAnimationFrame(step);
            } else {
              resolve(samples);
            }
          }
          requestAnimationFrame(step);
        });
      });

      const averageFps = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
      console.log('Perf metrics:');
      console.log('  FPS samples:', fpsSamples.map((v) => v.toFixed(1)).join(', '));
      console.log('  Average FPS:', averageFps.toFixed(1));

      await browser.close();
    } finally {
      preview.kill();
      try {
        await once(preview, 'exit');
      } catch {}
    }
  } finally {
    server.kill();
    try {
      await once(server, 'exit');
    } catch {}
  }
}

async function waitForOutput(child, phrase) {
  const timeout = delay(8000).then(() => {
    throw new Error(`Timed out waiting for output: ${phrase}`);
  });
  const match = new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.includes(phrase)) {
        resolve();
      }
    });
    child.once('exit', (code) => {
      reject(new Error(`Process exited early with code ${code ?? 'unknown'}`));
    });
  });
  await Promise.race([timeout, match]);
}

main().catch((error) => {
  console.error('[perf-metrics] failed:', error);
  process.exitCode = 1;
});
