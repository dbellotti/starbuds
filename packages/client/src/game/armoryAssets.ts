import { Color, ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three';

type Disposable = { dispose: () => void };

function trackDisposable<T extends Disposable>(set: Set<Disposable>, value: T): T {
  set.add(value);
  return value;
}

function disposeTracked(set: Set<Disposable>): void {
  for (const entry of set) {
    entry.dispose();
  }
  set.clear();
}

export type ChickenRig = {
  leftWing: Mesh;
  rightWing: Mesh;
  head: Mesh;
  tail: Mesh;
  crest: Mesh;
  base: {
    leftWingZ: number;
    rightWingZ: number;
    headX: number;
    tailX: number;
  };
};

export interface ChickenRigOptions {
  primaryColor?: number;
  crestColor?: number;
  beakColor?: number;
  idleTilt?: number;
  scale?: number;
}

export interface ChickenRigInstance {
  group: Group;
  rig: ChickenRig;
  dispose: () => void;
}

const DEFAULT_PRIMARY = 0xfacc15;
const DEFAULT_CREST = 0xf87171;
const DEFAULT_BEAK = 0xf97316;

export function buildBaseChickenRig(options: ChickenRigOptions = {}): ChickenRigInstance {
  const {
    primaryColor = DEFAULT_PRIMARY,
    crestColor = DEFAULT_CREST,
    beakColor = DEFAULT_BEAK,
    idleTilt = 0,
    scale = 0.85
  } = options;

  const tracked = new Set<Disposable>();
  const group = new Group();
  group.scale.setScalar(scale);
  group.rotation.z = idleTilt;

  const bodyMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.55,
      metalness: 0.12
    })
  );
  const body = new Mesh(trackDisposable(tracked, new SphereGeometry(7.2, 12, 12)), bodyMaterial);
  body.position.y = 6;
  body.userData.tint = true;
  group.add(body);

  const tailMaterial = bodyMaterial.clone();
  trackDisposable(tracked, tailMaterial);
  const tail = new Mesh(trackDisposable(tracked, new ConeGeometry(3.2, 6, 6, 1)), tailMaterial);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 4.5, -6.5);
  tail.userData.tint = true;
  group.add(tail);

  const wingMaterial = bodyMaterial.clone();
  trackDisposable(tracked, wingMaterial);
  const wingGeometry = trackDisposable(tracked, new ConeGeometry(2.8, 5.4, 5, 1));
  const leftWing = new Mesh(wingGeometry, wingMaterial);
  leftWing.rotation.z = Math.PI / 2.2;
  leftWing.position.set(5, 5.5, 0);
  leftWing.userData.tint = true;
  group.add(leftWing);

  const rightWing = leftWing.clone();
  group.add(rightWing);

  const headMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color: 0xfff4d2,
      roughness: 0.45,
      metalness: 0.05
    })
  );
  const head = new Mesh(trackDisposable(tracked, new SphereGeometry(4.2, 10, 10)), headMaterial);
  head.position.set(0, 9.5, 4.5);
  group.add(head);

  const beakMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color: beakColor,
      roughness: 0.4,
      metalness: 0.1
    })
  );
  const beak = new Mesh(trackDisposable(tracked, new ConeGeometry(1.8, 3.8, 6, 1)), beakMaterial);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 8.8, 8.2);
  group.add(beak);

  const crestMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color: crestColor,
      roughness: 0.5,
      metalness: 0.05
    })
  );
  const crest = new Mesh(trackDisposable(tracked, new SphereGeometry(1.6, 6, 6)), crestMaterial);
  crest.position.set(0, 11.2, 4.2);
  crest.userData.tint = true;
  group.add(crest);

  const eyeMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.3 })
  );
  const eyeGeometry = trackDisposable(tracked, new SphereGeometry(0.8, 6, 6));
  const leftEye = new Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(1.4, 9.4, 6.8);
  group.add(leftEye);
  const rightEye = leftEye.clone();
  group.add(rightEye);

  const rig: ChickenRig = {
    leftWing,
    rightWing,
    head,
    tail,
    crest,
    base: {
      leftWingZ: leftWing.rotation.z,
      rightWingZ: rightWing.rotation.z,
      headX: head.rotation.x,
      tailX: tail.rotation.x
    }
  };

  group.userData.rig = rig;

  return {
    group,
    rig,
    dispose: () => disposeTracked(tracked)
  };
}

export function createChickenModel(primaryColor: number): Group {
  const instance = buildBaseChickenRig({ primaryColor });
  return instance.group;
}

export function applyChickenTint(model: Group, color: number): void {
  const tint = new Color(color);
  model.traverse((child) => {
    if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      if ((child.userData as { tint?: boolean }).tint) {
        child.material.color.copy(tint);
      }
    }
  });
}

export interface CosmeticAttachmentOptions {
  tint?: number;
}

export function createCosmeticAttachment(id: string, options: CosmeticAttachmentOptions = {}): Group | null {
  const color = options.tint ?? DEFAULT_PRIMARY;
  if (id === 'cosmic-plumage') {
    const group = new Group();
    const ringMaterial = new MeshStandardMaterial({ color, emissive: new Color(0x6b21a8), emissiveIntensity: 0.6, roughness: 0.32 });
    const ring = new Mesh(new TorusGeometry(6.8, 0.8, 8, 32), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 5.2, -2.4);
    group.add(ring);

    const plumeMaterial = new MeshStandardMaterial({ color: 0x93c5fd, emissive: new Color(0x60a5fa), emissiveIntensity: 0.5, roughness: 0.4 });
    const plume = new Mesh(new ConeGeometry(2.2, 5.4, 6, 1), plumeMaterial);
    plume.position.set(0, 11.6, 0.6);
    group.add(plume);

    group.userData = { id, type: 'cosmetic', anchors: { crest: new Vector3(0, 11.6, 1), tail: new Vector3(0, 4, -6) } };
    return group;
  }

  if (id === 'ember-sheen') {
    const group = new Group();
    const emberMaterial = new MeshStandardMaterial({ color: 0xf97316, emissive: new Color(0xfb923c), emissiveIntensity: 0.8, roughness: 0.3 });
    for (let i = 0; i < 5; i += 1) {
      const ember = new Mesh(new ConeGeometry(1.1, 3.8, 6, 1), emberMaterial);
      ember.position.set((i - 2) * 1.2, 6.2 + i * 0.2, -6.2 - i * 0.6);
      ember.rotation.x = -Math.PI / 2.4;
      group.add(ember);
    }
    group.userData = { id, type: 'cosmetic', anchors: { tail: new Vector3(0, 5.6, -7.5) } };
    return group;
  }

  if (id === 'midnight-veil') {
    const group = new Group();
    const cloakMaterial = new MeshStandardMaterial({ color: 0x1e3a8a, emissive: new Color(0x1d4ed8), emissiveIntensity: 0.2, roughness: 0.6 });
    const cloak = new Mesh(new ConeGeometry(6.8, 12, 12, 1, true), cloakMaterial);
    cloak.position.set(0, 7, 1);
    cloak.rotation.x = -Math.PI / 1.3;
    group.add(cloak);

    const speckMaterial = new MeshStandardMaterial({ color: 0xfde68a, emissive: new Color(0xfacc15), emissiveIntensity: 0.4, roughness: 0.3 });
    for (let i = 0; i < 12; i += 1) {
      const speck = new Mesh(new SphereGeometry(0.4, 4, 4), speckMaterial);
      speck.position.set((Math.random() - 0.5) * 6, 7 + Math.random() * 3, (Math.random() - 0.5) * 4);
      group.add(speck);
    }

    group.userData = { id, type: 'cosmetic', anchors: { back: new Vector3(0, 7, -4) } };
    return group;
  }

  if (id === 'suncrest') {
    const group = new Group();
    const crestMaterial = new MeshStandardMaterial({ color, emissive: new Color(0xfcd34d), emissiveIntensity: 0.6, roughness: 0.35 });
    for (let i = 0; i < 5; i += 1) {
      const crest = new Mesh(new ConeGeometry(1.2, 3.6, 6, 1), crestMaterial);
      crest.position.set((i - 2) * 1.2, 12.5, 2.2 + i * 0.25);
      crest.rotation.x = Math.PI / 2.2;
      group.add(crest);
    }
    group.userData = { id, type: 'cosmetic', anchors: { crest: new Vector3(0, 12.5, 2.5) } };
    return group;
  }

  return null;
}

export function createUpgradeEffect(id: string): Group | null {
  if (id === 'focus-matrix') {
    const group = new Group();
    const haloMaterial = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new Color(0x38bdf8),
      emissiveIntensity: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9
    });
    const halo = new Mesh(new TorusGeometry(8, 0.6, 8, 40), haloMaterial);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 4.2;
    group.add(halo);
    group.userData = { id, type: 'effect', clip: 'pulse' };
    return group;
  }

  if (id === 'celerity-core') {
    const group = new Group();
    const ringMaterial = new MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: new Color(0x22d3ee),
      emissiveIntensity: 0.8,
      roughness: 0.28,
      transparent: true,
      opacity: 0.85
    });
    for (let i = 0; i < 3; i += 1) {
      const ring = new Mesh(new TorusGeometry(4 + i * 1.5, 0.4, 8, 28), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 3.6 + i * 1.2;
      group.add(ring);
    }
    group.userData = { id, type: 'effect', clip: 'spin' };
    return group;
  }

  if (id === 'bulwark-weave') {
    const group = new Group();
    const weaveMaterial = new MeshStandardMaterial({
      color: 0x34d399,
      emissive: new Color(0x10b981),
      emissiveIntensity: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 0.75
    });
    const weave = new Mesh(new SphereGeometry(8.5, 16, 12), weaveMaterial);
    group.add(weave);
    group.userData = { id, type: 'effect', clip: 'shield' };
    return group;
  }

  if (id === 'rift-channeler') {
    const group = new Group();
    const prismMaterial = new MeshStandardMaterial({
      color: 0x818cf8,
      emissive: new Color(0x6366f1),
      emissiveIntensity: 0.8,
      roughness: 0.25,
      transparent: true,
      opacity: 0.88
    });
    for (let i = 0; i < 4; i += 1) {
      const prism = new Mesh(new ConeGeometry(1.4, 4.8, 4, 1), prismMaterial);
      prism.position.set(Math.sin((Math.PI * 2 * i) / 4) * 6, 5.2, Math.cos((Math.PI * 2 * i) / 4) * 6);
      prism.rotation.x = Math.PI;
      group.add(prism);
    }
    group.userData = { id, type: 'effect', clip: 'orbit' };
    return group;
  }

  if (id === 'magnet-surge') {
    const group = new Group();
    const arcMaterial = new MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new Color(0xfacc15),
      emissiveIntensity: 0.9,
      roughness: 0.35,
      transparent: true,
      opacity: 0.85
    });
    const inner = new TorusGeometry(5.5, 0.5, 6, 32, Math.PI * 1.5);
    const arcA = new Mesh(inner, arcMaterial);
    arcA.rotation.x = Math.PI / 2.2;
    const arcB = arcA.clone();
    arcB.rotation.y = Math.PI;
    group.add(arcA);
    group.add(arcB);
    group.userData = { id, type: 'effect', clip: 'magnet' };
    return group;
  }

  return null;
}
