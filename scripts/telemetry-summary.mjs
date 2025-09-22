#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.argv.length < 3) {
  console.error('Usage: node scripts/telemetry-summary.mjs <path-to-log>');
  process.exit(1);
}

const filePath = resolve(process.argv[2]);
let content = '';
try {
  content = readFileSync(filePath, 'utf-8');
} catch (error) {
  console.error(`Failed to read file ${filePath}:`, error.message);
  process.exit(1);
}

const lines = content.split(/\r?\n/);
const snapshots = [];

for (const line of lines) {
  const markerIndex = line.indexOf('[telemetry]');
  if (markerIndex === -1) {
    continue;
  }
  const jsonStart = line.indexOf('{', markerIndex);
  if (jsonStart === -1) {
    continue;
  }
  try {
    const payload = JSON.parse(line.slice(jsonStart));
    snapshots.push(payload);
  } catch (error) {
    console.warn('Skipping malformed telemetry line:', line);
  }
}

if (snapshots.length === 0) {
  console.log('No telemetry snapshots found.');
  process.exit(0);
}

const damageTaken = new Map();
const xpCollected = new Map();
const augmentPicks = new Map();
const artifactPicks = new Map();

for (const snapshot of snapshots) {
  for (const [playerId, amount] of snapshot.damageTaken ?? []) {
    damageTaken.set(playerId, (damageTaken.get(playerId) ?? 0) + amount);
  }
  for (const [playerId, amount] of snapshot.xpCollected ?? []) {
    xpCollected.set(playerId, (xpCollected.get(playerId) ?? 0) + amount);
  }
  for (const [augmentId, count] of snapshot.augmentPicks ?? []) {
    augmentPicks.set(augmentId, (augmentPicks.get(augmentId) ?? 0) + count);
  }
  for (const [artifactId, count] of snapshot.artifactPicks ?? []) {
    artifactPicks.set(artifactId, (artifactPicks.get(artifactId) ?? 0) + count);
  }
}

const formatEntries = (entries) =>
  Array.from(entries.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `  • ${key}: ${value}`)
    .join('\n');

console.log(`Telemetry snapshots parsed: ${snapshots.length}`);
console.log('\nDamage Taken by Player:\n' + (damageTaken.size ? formatEntries(damageTaken) : '  • none recorded'));
console.log('\nXP Collected by Player:\n' + (xpCollected.size ? formatEntries(xpCollected) : '  • none recorded'));
console.log('\nAugment Picks:\n' + (augmentPicks.size ? formatEntries(augmentPicks) : '  • none recorded'));
console.log('\nArtifact Picks:\n' + (artifactPicks.size ? formatEntries(artifactPicks) : '  • none recorded'));
