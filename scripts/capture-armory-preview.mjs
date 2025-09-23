import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { setTimeout as delay } from 'node:timers/promises';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientDir = path.join(rootDir, 'packages/client');
const viteBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const outputDir = path.join(clientDir, 'tests', '__snapshots__');
const outputPath = path.join(outputDir, 'armory-preview.png');

async function runClientBuild(serverPort) {
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

function launchServer(serverPort) {
  return spawn(process.execPath, ['--import', 'tsx/esm', 'packages/server/src/index.ts'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOST: '127.0.0.1'
    }
  });
}

function launchPreview(previewPort) {
  return spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', String(previewPort)], {
    cwd: clientDir,
    stdio: ['ignore', 'pipe', 'inherit']
  });
}

async function waitForOutput(child, phrase, timeoutMs = 8000) {
  const timeout = delay(timeoutMs).then(() => {
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

async function captureArmoryScreenshot({ serverPort, previewPort, screenshotPath }) {
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

  const server = launchServer(serverPort);
  try {
    await waitForOutput(server, 'listening');

    const preview = launchPreview(previewPort);
    try {
      await waitForOutput(preview, 'Local');

      const browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      await page.evaluateOnNewDocument((flags) => {
        window.localStorage.setItem('farsight/tutorials/v1', JSON.stringify(flags));
      }, {
        armoryIntro: true,
        readyHint: true,
        launchPrompt: true,
        inputHelp: true,
        countdownCallout: true,
        extractionFail: true,
        sortieInfo: true
      });

      await page.goto(`http://127.0.0.1:${previewPort}/`, { waitUntil: 'domcontentloaded' });

      await page.waitForSelector('.hud-armory-preview-stage canvas', { timeout: 15000 });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.hud-armory-preview-stage canvas');
        return !!canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0;
      }, { timeout: 15000 });

      await page.waitForFunction(() => {
        const summary = document.querySelector('.hud-armory-preview-description');
        return Boolean(summary && summary.textContent && summary.textContent.includes('Feathers available'));
      }, { timeout: 15000 });

      await delay(750);

      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Saved armory preview screenshot to ${screenshotPath}`);

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

async function main() {
  const serverPort = 7790;
  const previewPort = 4173;

  await runClientBuild(serverPort);
  await captureArmoryScreenshot({
    serverPort,
    previewPort,
    screenshotPath: outputPath
  });
}

main().catch((error) => {
  console.error('[capture-armory-preview] failed:', error);
  process.exitCode = 1;
});
