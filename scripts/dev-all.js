#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const tasks = [
  { name: 'server', command: ['npm', 'run', 'dev', '--workspace=@farsight/server'] },
  { name: 'client', command: ['npm', 'run', 'dev', '--workspace=@farsight/client'] }
];

const children = new Map();
let shuttingDown = false;

loadRootEnv();

function log(name, message) {
  process.stdout.write(`[${name}] ${message}\n`);
}

function loadRootEnv() {
  const envPath = resolve(process.cwd(), '.env');
  let contents;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    if (!key || key.startsWith('#') || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function spawnTask(task) {
  const child = spawn(task.command[0], task.command.slice(1), {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });

  children.set(task.name, child);

  child.on('exit', (code, signal) => {
    children.delete(task.name);
    if (shuttingDown) {
      if (children.size === 0) {
        process.exit(code ?? 0);
      }
      return;
    }
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    log(task.name, `stopped (${reason})`);
    shuttingDown = true;
    stopAll();
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    log(task.name, `failed to start: ${error.message}`);
    shuttingDown = true;
    stopAll();
    process.exit(1);
  });
}

function stopAll() {
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }
}

process.on('SIGINT', () => {
  shuttingDown = true;
  stopAll();
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  stopAll();
});

for (const task of tasks) {
  spawnTask(task);
}
