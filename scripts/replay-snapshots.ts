#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorldSnapshot } from '@starbuds/shared';

function usage(): void {
  console.log('Usage: tsx scripts/replay-snapshots.ts <snapshots.json>');
}

function parseSnapshots(raw: string): WorldSnapshot[] {
  try {
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) {
      return data as WorldSnapshot[];
    }
  } catch {
    // fall through to NDJSON parsing
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parsed: WorldSnapshot[] = [];
  for (const line of lines) {
    try {
      const snapshot = JSON.parse(line) as WorldSnapshot;
      parsed.push(snapshot);
    } catch (error) {
      throw new Error(`Failed to parse snapshot line: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return parsed;
}

function isValidSnapshot(snapshot: WorldSnapshot): boolean {
  return typeof snapshot?.tick === 'number' && Array.isArray(snapshot.players) && Array.isArray(snapshot.enemies);
}

function main(): void {
  const fileArg = process.argv[2];
  if (!fileArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const filePath = resolve(process.cwd(), fileArg);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Unable to read ${filePath}:`, error);
    process.exitCode = 1;
    return;
  }

  let snapshots: WorldSnapshot[];
  try {
    snapshots = parseSnapshots(raw);
  } catch (error) {
    console.error('Failed to parse snapshots:', error);
    process.exitCode = 1;
    return;
  }

  snapshots = snapshots.filter(isValidSnapshot);
  if (snapshots.length === 0) {
    console.warn('No snapshots found in file');
    return;
  }

  const firstTick = snapshots[0].tick;
  const lastTick = snapshots[snapshots.length - 1].tick;
  let tickSum = 0;
  let tickCount = 0;
  let minDelta = Number.POSITIVE_INFINITY;
  let maxDelta = Number.NEGATIVE_INFINITY;
  let totalPlayers = 0;
  let totalEnemies = 0;
  let totalProjectiles = 0;
  const bossTicks: number[] = [];

  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i];
    totalPlayers += snapshot.players.length;
    totalEnemies += snapshot.enemies.length;
    totalProjectiles += snapshot.projectiles.length;

    if (snapshot.enemies.some((enemy) => enemy.kind === 'coyote')) {
      bossTicks.push(snapshot.tick);
    }

    if (i === 0) {
      continue;
    }
    const prev = snapshots[i - 1];
    const delta = snapshot.tick - prev.tick;
    tickSum += delta;
    tickCount += 1;
    if (delta < minDelta) minDelta = delta;
    if (delta > maxDelta) maxDelta = delta;
  }

  const averageTick = tickCount > 0 ? tickSum / tickCount : 0;
  const averagePlayers = totalPlayers / snapshots.length;
  const averageEnemies = totalEnemies / snapshots.length;
  const averageProjectiles = totalProjectiles / snapshots.length;

  console.log(`Replay: ${filePath}`);
  console.log(`Snapshots: ${snapshots.length}`);
  console.log(`Tick range: ${firstTick} → ${lastTick} (Δ ${lastTick - firstTick})`);
  console.log(
    `Tick delta avg: ${averageTick.toFixed(2)} · min ${isFinite(minDelta) ? minDelta.toFixed(0) : 'n/a'} · max ${
      isFinite(maxDelta) ? maxDelta.toFixed(0) : 'n/a'
    }`
  );
  console.log(`Average players: ${averagePlayers.toFixed(2)} · enemies: ${averageEnemies.toFixed(2)} · projectiles: ${averageProjectiles.toFixed(2)}`);
  if (bossTicks.length > 0) {
    console.log(`Boss presence ticks: ${bossTicks.join(', ')}`);
  }
}

main();
