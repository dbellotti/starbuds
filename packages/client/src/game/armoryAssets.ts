import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from 'three';

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
  tail: Group;
  crest: Group;
  base: {
    leftWingZ: number;
    rightWingZ: number;
    headX: number;
    tailX: number;
    tailY: number;
    tailZ: number;
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

const DEFAULT_PRIMARY = 0xf1b546;
const DEFAULT_CREST = 0xdc3626;
const DEFAULT_BEAK = 0xf47a1d;
const DEFAULT_HEADBAND = 0x6f3b1e;
const DEFAULT_WATTLE = 0xd23a2b;
const DEFAULT_EYE_WHITE = 0xfffae3;
const DEFAULT_EYE_ACCENT = 0x3b1f10;
const DEFAULT_PUPIL = 0x1a0e07;
const DEFAULT_LEG = 0xf4731b;
const DEFAULT_GEM = 0x38cffa;

function createMaterial(
  tracked: Set<Disposable>,
  color: number,
  options: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}
): MeshStandardMaterial {
  const material = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.72,
      metalness: options.metalness ?? 0.05,
      emissive: options.emissive !== undefined ? new Color(options.emissive) : undefined,
      emissiveIntensity: options.emissiveIntensity,
      flatShading: true
    })
  );
  return material;
}

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

  const bodyMaterial = createMaterial(tracked, primaryColor, { roughness: 0.68, metalness: 0.04 });
  const bodyGeometry = trackDisposable(tracked, new SphereGeometry(5, 6, 4));
  bodyGeometry.scale(1.28, 0.92, 1.15);
  const body = new Mesh(bodyGeometry, bodyMaterial);
  body.position.set(0, 5.6, 1.1);
  body.userData.tint = true;
  group.add(body);

  const bellyGeometry = bodyGeometry.clone();
  bellyGeometry.scale(0.92, 0.86, 0.9);
  const bellyMaterial = createMaterial(tracked, new Color(primaryColor).offsetHSL(-0.02, -0.05, 0.12).getHex(), {
    roughness: 0.7,
    metalness: 0.03
  });
  const belly = new Mesh(bellyGeometry, bellyMaterial);
  belly.position.set(0, 4.9, 2.2);
  group.add(belly);

  const tailMaterial = createMaterial(tracked, primaryColor, { roughness: 0.7, metalness: 0.04 });
  const tail = new Group();
  tail.position.set(0, 6.1, -3.8);
  group.add(tail);
  const tailFeatherGeometry = trackDisposable(tracked, new ConeGeometry(2.4, 3.2, 3));
  const tailCenter = new Mesh(tailFeatherGeometry, tailMaterial);
  tailCenter.rotation.x = -Math.PI / 2.1;
  tailCenter.position.set(0, 0.2, -1.2);
  tailCenter.userData.tint = true;
  tail.add(tailCenter);
  const tailLeft = tailCenter.clone();
  tailLeft.rotation.y = Math.PI / 5.2;
  tailLeft.position.set(1.4, 0.15, -1);
  tailLeft.userData.tint = true;
  tail.add(tailLeft);
  const tailRight = tailCenter.clone();
  tailRight.rotation.y = -Math.PI / 5.2;
  tailRight.position.set(-1.4, 0.15, -1);
  tailRight.userData.tint = true;
  tail.add(tailRight);

  const wingMaterial = createMaterial(tracked, primaryColor, { roughness: 0.7, metalness: 0.04 });
  const wingGeometry = trackDisposable(tracked, new ConeGeometry(3.1, 3.8, 3));
  const leftWing = new Mesh(wingGeometry, wingMaterial);
  leftWing.rotation.set(Math.PI / 2.1, 0.15, Math.PI / 2.8);
  leftWing.position.set(4.4, 6.2, 0.4);
  leftWing.userData.tint = true;
  group.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.position.x = -leftWing.position.x;
  rightWing.rotation.y = -leftWing.rotation.y;
  rightWing.rotation.z = -leftWing.rotation.z;
  group.add(rightWing);

  const headMaterial = createMaterial(tracked, 0xfff0d4, { roughness: 0.5, metalness: 0.04 });
  const headGeometry = trackDisposable(tracked, new SphereGeometry(3.4, 6, 4));
  headGeometry.scale(1.06, 0.84, 1.08);
  const head = new Mesh(headGeometry, headMaterial);
  head.position.set(0, 10.1, 3.4);
  group.add(head);

  const headbandMaterial = createMaterial(tracked, DEFAULT_HEADBAND, { roughness: 0.68, metalness: 0.06 });
  const headband = new Mesh(trackDisposable(tracked, new CylinderGeometry(3.2, 3.2, 0.6, 6, 1, true)), headbandMaterial);
  headband.rotation.x = Math.PI / 2;
  headband.position.set(0, 10.3, 3.2);
  headband.scale.set(1.02, 1, 0.86);
  group.add(headband);

  const beakMaterial = createMaterial(tracked, beakColor, { roughness: 0.55, metalness: 0.05 });
  const beakGeometry = trackDisposable(tracked, new ConeGeometry(1.6, 3.2, 3));
  const beak = new Mesh(beakGeometry, beakMaterial);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 8.9, 7);
  group.add(beak);

  const wattleMaterial = createMaterial(tracked, DEFAULT_WATTLE, { roughness: 0.6, metalness: 0.05 });
  const wattle = new Mesh(trackDisposable(tracked, new ConeGeometry(1.05, 2.3, 4)), wattleMaterial);
  wattle.rotation.x = Math.PI / 2;
  wattle.position.set(0, 7.9, 6.5);
  group.add(wattle);

  const crestMaterial = createMaterial(tracked, crestColor, { roughness: 0.55, metalness: 0.05 });
  const crest = new Group();
  crest.position.set(0, 11.9, 3.1);
  group.add(crest);
  const crestMain = new Mesh(trackDisposable(tracked, new ConeGeometry(1.4, 3.4, 4)), crestMaterial);
  crestMain.rotation.x = Math.PI;
  crestMain.position.set(0, 1.3, 0);
  crestMain.userData.tint = true;
  crest.add(crestMain);
  const crestFront = crestMain.clone();
  crestFront.scale.set(0.8, 0.85, 0.8);
  crestFront.position.set(0.85, 0.15, 0.2);
  crestFront.rotation.z = -0.42;
  crest.add(crestFront);
  const crestRear = crestMain.clone();
  crestRear.scale.set(0.78, 0.82, 0.8);
  crestRear.position.set(-0.85, 0.15, 0.2);
  crestRear.rotation.z = 0.42;
  crest.add(crestRear);

  const eyeWhiteMaterial = createMaterial(tracked, DEFAULT_EYE_WHITE, { roughness: 0.4, metalness: 0.02 });
  const eyeGeometry = trackDisposable(tracked, new ConeGeometry(1.4, 1.8, 4));
  const leftEye = new Mesh(eyeGeometry, eyeWhiteMaterial);
  leftEye.rotation.set(Math.PI / 2, 0, Math.PI / 7);
  leftEye.position.set(1.8, 9.3, 6.4);
  group.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = -leftEye.position.x;
  rightEye.rotation.z = -leftEye.rotation.z;
  group.add(rightEye);

  const browMaterial = createMaterial(tracked, DEFAULT_EYE_ACCENT, { roughness: 0.6, metalness: 0.05 });
  const browGeometry = trackDisposable(tracked, new BoxGeometry(2.4, 0.5, 0.7));
  const leftBrow = new Mesh(browGeometry, browMaterial);
  leftBrow.position.set(1.7, 9.9, 6.1);
  leftBrow.rotation.z = -0.55;
  group.add(leftBrow);
  const rightBrow = leftBrow.clone();
  rightBrow.position.x = -leftBrow.position.x;
  rightBrow.rotation.z = -leftBrow.rotation.z;
  group.add(rightBrow);

  const pupilMaterial = createMaterial(tracked, DEFAULT_PUPIL, { roughness: 0.45, metalness: 0.05 });
  const pupilGeometry = trackDisposable(tracked, new ConeGeometry(0.55, 0.8, 4));
  const leftPupil = new Mesh(pupilGeometry, pupilMaterial);
  leftPupil.rotation.x = Math.PI / 2;
  leftPupil.position.set(1.8, 8.9, 6.9);
  group.add(leftPupil);
  const rightPupil = leftPupil.clone();
  rightPupil.position.x = -leftPupil.position.x;
  group.add(rightPupil);

  const legMaterial = createMaterial(tracked, DEFAULT_LEG, { roughness: 0.55, metalness: 0.05 });
  const legGeometry = trackDisposable(tracked, new CylinderGeometry(0.55, 0.9, 4.2, 4));
  const leftLeg = new Mesh(legGeometry, legMaterial);
  leftLeg.position.set(2.1, 2.2, 2.6);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = -leftLeg.position.x;
  group.add(rightLeg);

  const toeGeometry = trackDisposable(tracked, new ConeGeometry(1.6, 1.6, 3));
  const leftToe = new Mesh(toeGeometry, legMaterial);
  leftToe.rotation.x = Math.PI / 2.1;
  leftToe.position.set(2.1, 0.6, 3.4);
  group.add(leftToe);
  const rightToe = leftToe.clone();
  rightToe.position.x = -leftToe.position.x;
  group.add(rightToe);

  const gemMaterial = createMaterial(tracked, DEFAULT_GEM, {
    roughness: 0.3,
    metalness: 0.05,
    emissive: 0x1fb7e5,
    emissiveIntensity: 0.8
  });
  const gem = new Mesh(trackDisposable(tracked, new OctahedronGeometry(1.8)), gemMaterial);
  gem.position.set(0, 13, 3.2);
  group.add(gem);

  const haloMaterial = trackDisposable(
    tracked,
    new MeshStandardMaterial({
      color: DEFAULT_GEM,
      emissive: new Color(0x24a9d8),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.35,
      roughness: 0.4,
      metalness: 0.02,
      flatShading: true,
      depthWrite: false
    })
  );
  const halo = new Mesh(new TorusGeometry(2.6, 0.22, 12, 36), haloMaterial);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 11.7, 3.2);
  group.add(halo);

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
      tailX: tail.rotation.x,
      tailY: tail.rotation.y,
      tailZ: tail.rotation.z
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
