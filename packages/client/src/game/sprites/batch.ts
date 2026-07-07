import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Texture
} from 'three';

/**
 * Instanced quad batch for ground-plane sprites.
 *
 * All sprites sharing an atlas render as ONE draw call regardless of count.
 * The batch is immediate-mode: call `begin()` once per frame, `submit()` for
 * every visible sprite, then `end()` to upload. Quads lie flat on the ground
 * (XZ plane) and rotate around Y, matching the game's top-down camera.
 */
export class SpriteBatch {
  readonly mesh: Mesh;

  private geometry: InstancedBufferGeometry;
  private readonly material: ShaderMaterial;
  private capacity: number;
  private count = 0;

  private offset!: Float32Array; // x, y(height), z per instance
  private rotScale!: Float32Array; // rotationY, sizeX, sizeZ
  private uvRect!: Float32Array; // u, v, uw, vh
  private tint!: Float32Array; // r, g, b, opacity

  private readonly tempColor = new Color();

  constructor(texture: Texture, options: { additive?: boolean; renderOrder?: number; capacity?: number } = {}) {
    this.capacity = Math.max(16, options.capacity ?? 256);
    this.material = new ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      transparent: true,
      depthWrite: false,
      blending: options.additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec3 aRotScale;
        attribute vec4 aUvRect;
        attribute vec4 aTint;
        varying vec2 vUv;
        varying vec4 vTint;

        void main() {
          float c = cos(aRotScale.x);
          float s = sin(aRotScale.x);
          // Plane XY -> ground XZ (texture "up" faces -Z before rotation).
          vec2 local = vec2(position.x * aRotScale.y, -position.y * aRotScale.z);
          vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
          vec3 world = vec3(aOffset.x + rotated.x, aOffset.y, aOffset.z + rotated.y);
          vUv = aUvRect.xy + uv * aUvRect.zw;
          vTint = aTint;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vTint;

        void main() {
          vec4 texel = texture2D(uMap, vUv);
          float alpha = texel.a * vTint.a;
          if (alpha < 0.01) {
            discard;
          }
          gl_FragColor = vec4(texel.rgb * vTint.rgb, alpha);
        }
      `
    });

    this.geometry = this.createGeometry(this.capacity);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = options.renderOrder ?? 0;
  }

  begin(): void {
    this.count = 0;
  }

  submit(
    x: number,
    height: number,
    z: number,
    rotationY: number,
    sizeX: number,
    sizeZ: number,
    frame: { u: number; v: number; uw: number; vh: number },
    tintHex: number,
    opacity: number
  ): void {
    if (this.count >= this.capacity) {
      this.grow();
    }
    const i = this.count;
    this.offset[i * 3] = x;
    this.offset[i * 3 + 1] = height;
    this.offset[i * 3 + 2] = z;
    this.rotScale[i * 3] = rotationY;
    this.rotScale[i * 3 + 1] = sizeX;
    this.rotScale[i * 3 + 2] = sizeZ;
    this.uvRect[i * 4] = frame.u;
    this.uvRect[i * 4 + 1] = frame.v;
    this.uvRect[i * 4 + 2] = frame.uw;
    this.uvRect[i * 4 + 3] = frame.vh;
    this.tempColor.setHex(tintHex);
    this.tint[i * 4] = this.tempColor.r;
    this.tint[i * 4 + 1] = this.tempColor.g;
    this.tint[i * 4 + 2] = this.tempColor.b;
    this.tint[i * 4 + 3] = opacity;
    this.count += 1;
  }

  end(): void {
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) {
      return;
    }
    for (const name of ['aOffset', 'aRotScale', 'aUvRect', 'aTint']) {
      const attribute = this.geometry.getAttribute(name) as InstancedBufferAttribute;
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private createGeometry(capacity: number): InstancedBufferGeometry {
    const base = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));

    this.offset = new Float32Array(capacity * 3);
    this.rotScale = new Float32Array(capacity * 3);
    this.uvRect = new Float32Array(capacity * 4);
    this.tint = new Float32Array(capacity * 4);

    geometry.setAttribute('aOffset', new InstancedBufferAttribute(this.offset, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aRotScale', new InstancedBufferAttribute(this.rotScale, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aUvRect', new InstancedBufferAttribute(this.uvRect, 4).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aTint', new InstancedBufferAttribute(this.tint, 4).setUsage(DynamicDrawUsage));
    geometry.instanceCount = 0;
    return geometry;
  }

  private grow(): void {
    const nextCapacity = this.capacity * 2;
    const prev = { offset: this.offset, rotScale: this.rotScale, uvRect: this.uvRect, tint: this.tint };
    const oldGeometry = this.geometry;
    this.geometry = this.createGeometry(nextCapacity);
    this.offset.set(prev.offset);
    this.rotScale.set(prev.rotScale);
    this.uvRect.set(prev.uvRect);
    this.tint.set(prev.tint);
    this.capacity = nextCapacity;
    this.mesh.geometry = this.geometry;
    oldGeometry.dispose();
  }
}
