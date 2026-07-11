export interface DebugOverlay {
  updateRenderStats(fps: number, drawCalls?: number): void;
  updateNetworkStats(stats: { pingMs?: number; tickDriftMs?: number; snapshotsPerSecond?: number }): void;
  updateCameraMode(mode: string): void;
  updateQuality(label: string): void;
  dispose(): void;
}

export function createDebugOverlay(parent: HTMLElement): DebugOverlay {
  const root = document.createElement('div');
  root.className = 'debug-overlay';

  const renderRow = document.createElement('div');
  renderRow.className = 'debug-overlay-row';
  const renderLabel = document.createElement('span');
  renderLabel.textContent = 'FPS';
  const renderValue = document.createElement('span');
  renderValue.textContent = '--';
  renderRow.append(renderLabel, renderValue);

  const drawRow = document.createElement('div');
  drawRow.className = 'debug-overlay-row';
  const drawLabel = document.createElement('span');
  drawLabel.textContent = 'Draws';
  const drawValue = document.createElement('span');
  drawValue.textContent = '--';
  drawRow.append(drawLabel, drawValue);

  const networkRow = document.createElement('div');
  networkRow.className = 'debug-overlay-row';
  const pingLabel = document.createElement('span');
  pingLabel.textContent = 'Ping';
  const pingValue = document.createElement('span');
  pingValue.textContent = '--';
  networkRow.append(pingLabel, pingValue);

  const tickRow = document.createElement('div');
  tickRow.className = 'debug-overlay-row';
  const tickLabel = document.createElement('span');
  tickLabel.textContent = 'Drift';
  const tickValue = document.createElement('span');
  tickValue.textContent = '--';
  tickRow.append(tickLabel, tickValue);

  const cameraRow = document.createElement('div');
  cameraRow.className = 'debug-overlay-row';
  const cameraLabel = document.createElement('span');
  cameraLabel.textContent = 'Cam';
  const cameraValue = document.createElement('span');
  cameraValue.textContent = 'Top';
  cameraRow.append(cameraLabel, cameraValue);

  const qualityRow = document.createElement('div');
  qualityRow.className = 'debug-overlay-row';
  const qualityLabel = document.createElement('span');
  qualityLabel.textContent = 'Gfx';
  const qualityValue = document.createElement('span');
  qualityValue.textContent = '--';
  qualityRow.append(qualityLabel, qualityValue);

  root.append(renderRow, drawRow, networkRow, tickRow, cameraRow, qualityRow);
  parent.appendChild(root);

  function formatNumber(value: number, digits = 0): string {
    return Number.isFinite(value) ? value.toFixed(digits) : '--';
  }

  return {
    updateRenderStats(fps: number, drawCalls?: number) {
      renderValue.textContent = formatNumber(fps, 0);
      if (typeof drawCalls === 'number') {
        drawValue.textContent = formatNumber(drawCalls, 0);
      }
    },
    updateNetworkStats({ pingMs, tickDriftMs, snapshotsPerSecond }) {
      if (typeof pingMs === 'number') {
        pingValue.textContent = `${formatNumber(pingMs, 0)} ms`;
      }
      if (typeof tickDriftMs === 'number' || typeof snapshotsPerSecond === 'number') {
        const drift = tickDriftMs ?? 0;
        const snapshots = snapshotsPerSecond ?? 0;
        tickValue.textContent = `${formatNumber(drift, 1)} ms · ${formatNumber(snapshots, 1)} Hz`;
      }
    },
    updateCameraMode(mode: string) {
      cameraValue.textContent = mode;
    },
    updateQuality(label: string) {
      qualityValue.textContent = label;
    },
    dispose() {
      root.remove();
    }
  };
}
