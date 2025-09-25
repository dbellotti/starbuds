import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3
} from 'three';

import type { EnemyKind } from '@farsight/shared';

export type EnemyRig = {
  leftWing?: Mesh;
  rightWing?: Mesh;
  tail?: Mesh;
  base?: {
    leftWingZ?: number;
    rightWingZ?: number;
    tailZ?: number;
  };
};

export const ENEMY_COLORS: Record<EnemyKind, number> = {
  fox: 0xf97316,
  hawk: 0x93c5fd,
  snake: 0x4ade80,
  raccoon: 0xd1d5db,
  coyote: 0xfbbf24,
  weasel: 0xf87171,
  owl: 0xd8b4fe
};

export function createEnemyModel(kind: EnemyKind): Group {
  const group = new Group();
  const base = ENEMY_COLORS[kind];
  const accentPalette: Record<EnemyKind, number> = {
    fox: 0xfbbf24,
    hawk: 0x93c5fd,
    snake: 0x4ade80,
    raccoon: 0xe2e8f0,
    coyote: 0xfacc15,
    weasel: 0xfda4af,
    owl: 0xf5d0fe
  };

  if (kind === 'weasel') {
    const bodyMaterial = new MeshStandardMaterial({ color: base, roughness: 0.45, metalness: 0.18 });
    const body = new Mesh(new CylinderGeometry(3.2, 2.4, 18, 8, 1, false), bodyMaterial);
    body.position.y = 8;
    group.add(body);

    const head = new Mesh(new SphereGeometry(3.4, 10, 10), bodyMaterial.clone());
    head.position.set(0, 14, 3.6);
    group.add(head);

    const snoutMaterial = new MeshStandardMaterial({ color: accentPalette.weasel, roughness: 0.35, metalness: 0.15 });
    const snout = new Mesh(new ConeGeometry(1.6, 3.8, 6, 1), snoutMaterial);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 13, 6.5);
    group.add(snout);

    const tail = new Mesh(new ConeGeometry(1.4, 6, 6, 1), snoutMaterial.clone());
    tail.rotation.z = Math.PI / 2.6;
    tail.position.set(-4.6, 7, -6.5);
    group.add(tail);

    const clawMaterial = new MeshStandardMaterial({ color: 0xfee2e2, roughness: 0.25, metalness: 0.1 });
    const claw = new Mesh(new ConeGeometry(0.9, 2.6, 6, 1), clawMaterial);
    claw.rotation.x = Math.PI / 2;
    claw.position.set(2.8, 3.2, 5);
    group.add(claw);
    const clawMirror = claw.clone();
    clawMirror.position.x = -claw.position.x;
    group.add(clawMirror);

    const eyeMaterial = new MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
    const eyeGeometry = new SphereGeometry(0.7, 6, 6);
    const leftEye = new Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(1.6, 13.3, 5.4);
    group.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = -leftEye.position.x;
    group.add(rightEye);

    group.scale.setScalar(0.85);
    group.userData.rig = {
      tail,
      base: { tailZ: tail.rotation.z }
    } satisfies EnemyRig;
    return group;
  }

  if (kind === 'owl') {
    const bodyMaterial = new MeshStandardMaterial({ color: base, roughness: 0.4, metalness: 0.2 });
    const body = new Mesh(new SphereGeometry(8.2, 16, 16), bodyMaterial);
    body.position.y = 9;
    group.add(body);

    const wingMaterial = new MeshStandardMaterial({ color: accentPalette.owl, roughness: 0.5, metalness: 0.12 });
    const wingGeometry = new ConeGeometry(4.5, 16, 12, 1, true);
    const leftWing = new Mesh(wingGeometry, wingMaterial);
    leftWing.rotation.z = Math.PI / 2.3;
    leftWing.position.set(9, 9, 0);
    group.add(leftWing);
    const rightWing = leftWing.clone();
    rightWing.rotation.z = -Math.PI / 2.3;
    rightWing.position.x = -leftWing.position.x;
    group.add(rightWing);

    const headMaterial = new MeshStandardMaterial({ color: 0xfdf4ff, roughness: 0.35, metalness: 0.08 });
    const head = new Mesh(new SphereGeometry(5, 14, 14), headMaterial);
    head.position.set(0, 13, 4);
    group.add(head);

    const beakMaterial = new MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.1 });
    const beak = new Mesh(new ConeGeometry(2, 4, 6, 1), beakMaterial);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 11.5, 8.5);
    group.add(beak);

    const eyeMaterial = new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.2 });
    const irisMaterial = new MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.4, metalness: 0.1 });
    const eyeGeo = new SphereGeometry(1.4, 10, 10);
    const leftEye = new Mesh(eyeGeo, eyeMaterial);
    leftEye.position.set(2.6, 12.6, 7.2);
    group.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = -leftEye.position.x;
    group.add(rightEye);
    const leftIris = new Mesh(new SphereGeometry(0.7, 10, 10), irisMaterial);
    leftIris.position.copy(leftEye.position).add(new Vector3(0, 0, 0.8));
    group.add(leftIris);
    const rightIris = leftIris.clone();
    rightIris.position.x = -leftIris.position.x;
    group.add(rightIris);

    const talonMaterial = new MeshStandardMaterial({ color: 0xfde68a, roughness: 0.4, metalness: 0.15 });
    const talon = new Mesh(new ConeGeometry(1.1, 4.2, 6, 1), talonMaterial);
    talon.rotation.x = Math.PI / 2;
    talon.position.set(2.5, 4.2, 3.6);
    group.add(talon);
    const talonMirror = talon.clone();
    talonMirror.position.x = -talon.position.x;
    group.add(talonMirror);

    group.scale.setScalar(1.05);
    group.userData.rig = {
      leftWing,
      rightWing,
      base: { leftWingZ: leftWing.rotation.z, rightWingZ: rightWing.rotation.z }
    } satisfies EnemyRig;
    return group;
  }

  const baseColor = base;
  const highlight = accentPalette[kind];
  const bodyMaterial = new MeshStandardMaterial({
    color: baseColor,
    roughness: 0.6,
    metalness: 0.08
  });
  const body = new Mesh(new SphereGeometry(kind === 'coyote' ? 9 : 7, 12, 12), bodyMaterial);
  body.position.y = kind === 'coyote' ? 8 : 6;
  group.add(body);

  const accentMaterial = new MeshStandardMaterial({
    color: highlight,
    roughness: 0.5,
    metalness: 0.12
  });
  const crest = new Mesh(new ConeGeometry(kind === 'coyote' ? 4 : 3, kind === 'coyote' ? 8 : 6, 6, 1), accentMaterial);
  crest.rotation.x = Math.PI;
  crest.position.set(0, body.position.y + (kind === 'coyote' ? 6 : 4), 0);
  group.add(crest);

  const snout = new Mesh(new ConeGeometry(kind === 'coyote' ? 3 : 2.4, kind === 'coyote' ? 6 : 4.5, 6, 1), accentMaterial.clone());
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, body.position.y - 0.5, 6 + (kind === 'coyote' ? 2 : 1));
  group.add(snout);

  const eyeMaterial = new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
  const eyeGeometry = new SphereGeometry(0.9, 6, 6);
  const leftEye = new Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(2.2, body.position.y + 1.4, 5.4);
  group.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = -2.2;
  group.add(rightEye);

  group.scale.setScalar(kind === 'coyote' ? 1.2 : 0.9);
  return group;
}

export function disposeEnemyModel(group: Group): void {
  group.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      disposeMaterial(material);
    }
    mesh.geometry.dispose();
  });
}

function disposeMaterial(material: { dispose: () => void; map?: { dispose: () => void } | null }): void {
  if ('map' in material && material.map) {
    material.map.dispose();
  }
  material.dispose();
}
