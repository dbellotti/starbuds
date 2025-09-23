import { Group, Mesh, MeshStandardMaterial, type Material } from 'three';

import type { ChickenRig } from './armoryAssets';
import { createUpgradeEffect } from './armoryAssets';

type EffectLoop = {
  id: string;
  group: Group;
  play: (rig: ChickenRig) => void;
  stop: (rig: ChickenRig) => void;
  update: (deltaSeconds: number, rig: ChickenRig) => void;
  dispose: () => void;
};

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
function disposeGroup(group: Group): void {
  group.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material && typeof material.dispose === 'function') {
        (material as Material).dispose();
      }
    }
    child.geometry.dispose();
  });
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

function resetRig(rig: ChickenRig): void {
  rig.leftWing.rotation.z = rig.base.leftWingZ;
  rig.rightWing.rotation.z = rig.base.rightWingZ;
  rig.head.rotation.x = rig.base.headX;
  rig.tail.rotation.x = rig.base.tailX;
}

function createFocusMatrixLoop(): EffectLoop | null {
  const group = createUpgradeEffect('focus-matrix');
  if (!group) {
    return null;
  }
  let time = 0;
  const pulseTarget = group.children.find((child): child is Mesh => child instanceof Mesh) ?? null;
  const pulseMaterial = pulseTarget?.material;
  const baseOpacity = pulseMaterial instanceof MeshStandardMaterial ? pulseMaterial.opacity : null;
  return {
    id: 'focus-matrix',
    group,
    play: (rig) => {
      time = 0;
      group.visible = true;
      resetRig(rig);
    },
    stop: (rig) => {
      resetRig(rig);
      if (pulseMaterial instanceof MeshStandardMaterial && baseOpacity !== null) {
        pulseMaterial.opacity = baseOpacity;
      }
      group.visible = false;
    },
    update: (delta, rig) => {
      time += delta;
      const swing = 0.25 + Math.sin(time * 5) * 0.18;
      rig.leftWing.rotation.z = rig.base.leftWingZ + swing;
      rig.rightWing.rotation.z = rig.base.rightWingZ - swing;
      rig.head.rotation.x = rig.base.headX + Math.sin(time * 3) * 0.08;
      group.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
      if (pulseMaterial instanceof MeshStandardMaterial) {
        pulseMaterial.opacity = 0.55 + Math.sin(time * 6) * 0.25;
      }
    },
    dispose: () => disposeGroup(group)
  };
}

function createCelerityCoreLoop(): EffectLoop | null {
  const group = createUpgradeEffect('celerity-core');
  if (!group) {
    return null;
  }
  let time = 0;
  const rings = group.children.filter((child): child is Mesh => child instanceof Mesh);
  return {
    id: 'celerity-core',
    group,
    play: (rig) => {
      time = 0;
      resetRig(rig);
      group.visible = true;
    },
    stop: (rig) => {
      resetRig(rig);
      group.visible = false;
    },
    update: (delta, rig) => {
      time += delta;
      rig.head.rotation.x = rig.base.headX + Math.sin(time * 8) * 0.12;
      rig.tail.rotation.x = rig.base.tailX + Math.sin(time * 5) * 0.22;
      rings.forEach((ring, index) => {
        ring.rotation.z += delta * (index + 1) * 1.2;
      });
    },
    dispose: () => disposeGroup(group)
  };
}

function createBulwarkWeaveLoop(): EffectLoop | null {
  const group = createUpgradeEffect('bulwark-weave');
  if (!group) {
    return null;
  }
  let time = 0;
  const shield = group.children.find((child): child is Mesh => child instanceof Mesh) ?? null;
  const shieldMaterial = shield?.material;
  return {
    id: 'bulwark-weave',
    group,
    play: (rig) => {
      time = 0;
      resetRig(rig);
      group.visible = true;
    },
    stop: (rig) => {
      resetRig(rig);
      group.visible = false;
      if (shieldMaterial instanceof MeshStandardMaterial) {
        shieldMaterial.opacity = 0.75;
      }
    },
    update: (delta, rig) => {
      time += delta;
      const swell = 1 + Math.sin(time * 3) * 0.08;
      group.scale.setScalar(swell);
      rig.leftWing.rotation.z = rig.base.leftWingZ - 0.12;
      rig.rightWing.rotation.z = rig.base.rightWingZ + 0.12;
      if (shieldMaterial instanceof MeshStandardMaterial) {
        shieldMaterial.opacity = 0.6 + Math.sin(time * 4) * 0.15;
      }
    },
    dispose: () => disposeGroup(group)
  };
}

function createRiftChannelerLoop(): EffectLoop | null {
  const group = createUpgradeEffect('rift-channeler');
  if (!group) {
    return null;
  }
  let time = 0;
  const prisms = group.children.filter((child): child is Mesh => child instanceof Mesh);
  return {
    id: 'rift-channeler',
    group,
    play: (rig) => {
      time = 0;
      resetRig(rig);
      group.visible = true;
    },
    stop: (rig) => {
      resetRig(rig);
      group.visible = false;
    },
    update: (delta, rig) => {
      time += delta;
      prisms.forEach((prism, index) => {
        prism.rotation.y += delta * 1.6;
        prism.position.y = 5.2 + Math.sin(time * 3 + index) * 0.6;
      });
      rig.head.rotation.x = rig.base.headX - 0.1;
      const tilt = Math.sin(time * 6) * 0.2;
      rig.leftWing.rotation.z = rig.base.leftWingZ + 0.18 + tilt;
      rig.rightWing.rotation.z = rig.base.rightWingZ - (0.18 + tilt);
    },
    dispose: () => disposeGroup(group)
  };
}

function createMagnetSurgeLoop(): EffectLoop | null {
  const group = createUpgradeEffect('magnet-surge');
  if (!group) {
    return null;
  }
  let time = 0;
  const arcs = group.children.filter((child): child is Mesh => child instanceof Mesh);
  return {
    id: 'magnet-surge',
    group,
    play: (rig) => {
      time = 0;
      resetRig(rig);
      group.visible = true;
    },
    stop: (rig) => {
      resetRig(rig);
      group.visible = false;
    },
    update: (delta, rig) => {
      time += delta;
      arcs.forEach((arc, index) => {
        arc.rotation.y += delta * (index === 0 ? 1 : -1) * 1.4;
      });
      const hover = Math.sin(time * 4) * 0.3;
      rig.tail.rotation.x = rig.base.tailX + hover * 0.5;
      rig.head.rotation.x = rig.base.headX + hover * 0.2;
    },
    dispose: () => disposeGroup(group)
  };
}

const EFFECT_BUILDERS: Record<string, () => EffectLoop | null> = {
  'focus-matrix': createFocusMatrixLoop,
  'celerity-core': createCelerityCoreLoop,
  'bulwark-weave': createBulwarkWeaveLoop,
  'rift-channeler': createRiftChannelerLoop,
  'magnet-surge': createMagnetSurgeLoop
};

export class ArmoryEffects {
  private readonly container: Group;
  private active: { loop: EffectLoop; rig: ChickenRig } | null = null;

  constructor() {
    this.container = new Group();
    this.container.name = 'ArmoryEffects';
    this.container.visible = false;
  }

  get group(): Group {
    return this.container;
  }

  playLoop(id: string, rig: ChickenRig): void {
    if (this.active?.loop.id === id) {
      this.stopLoop();
    }
    const builder = EFFECT_BUILDERS[id];
    if (!builder) {
      return;
    }
    const loop = builder();
    if (!loop) {
      return;
    }
    this.stopLoop();
    this.container.clear();
    this.container.add(loop.group);
    this.container.visible = true;
    loop.play(rig);
    this.active = { loop, rig };
  }

  stopLoop(): void {
    if (!this.active) {
      return;
    }
    this.active.loop.stop(this.active.rig);
    this.container.visible = false;
    this.container.clear();
    this.active.loop.dispose();
    this.active = null;
  }

  update(deltaSeconds: number): void {
    if (!this.active) {
      return;
    }
    this.active.loop.update(deltaSeconds, this.active.rig);
  }

  dispose(): void {
    if (this.active) {
      this.active.loop.dispose();
      this.active = null;
    }
    this.container.clear();
  }
}
