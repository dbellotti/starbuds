# 🎮 Low-Poly Style Guide for Roguelite Characters & Assets
*(Three.js Implementation)*

---

## 1. Geometry & Mesh Guidelines
- **Triangle Budget**:
  - Characters: **300–600 tris**
  - Weapons: **150–300 tris**
  - Effects props (gems, shields, aura anchors): **<150 tris**
- **Modeling Rules**:
  - Favor primitive stacking (spheres, cones, cylinders) over dense sculpting.
  - Exaggerate key features (large heads, small torsos, wide weapons) for readability at isometric camera angles.
  - Avoid thin geometry — minimum edge thickness ≈ 0.05 world units to prevent z-fighting.

---

## 2. Materials & Shading
- Use **MeshStandardMaterial** in Three.js.
- **Settings**:
  - `roughness: 0.4–0.7`
  - `metalness: 0.0–0.15` (armor/props only)
- **Lighting Assumptions**:
  - One main directional light `(160, 340, 180)`, 35° northeast downlight.
  - Fill with soft ambient, but avoid baked AO in textures — shadows handled in-engine.
- **Tinting**:
  - Tag tintable submeshes: `mesh.userData.tint = true` → gameplay can recolor allies/enemies dynamically.

---

## 3. Color Palette
### Biomes
- **Barnyard / Neutral**: Warm earths (`#33261a`, `#d9a066`, `#f4bb78`)
- **Forest**: Deep greens (`#1f3520`, `#16a34a`, `#6ee7b7`)
- **Lab / Arcane**: Cool steel + emissives (`#1a2433`, `#60a5fa`, `#a5b4fc`)

### Shadows
- Avoid pure black. Use deep burgundy (`#3c1f2b`) or forest navy (`#1f2230`).

### Glow Accents
- Psionic / Magic: Turquoise (`#60a5fa` at 30–40% opacity, additive).
- Venom / Poison: Toxic green (`#22c55e`).
- Fire / Chaos: Orange-red (`#f87171`, `#f97316`).

---

## 4. Animation Principles
- **Idle**: Exaggerated micro-movements (head bobs, wing twitches, tail sways).
- **Run**: Overemphasized limb swing, squash & stretch to keep silhouette clear.
- **Attack**: Wind-ups last 4–6 frames; impact frame sharp and readable.
- **Hit/Death**: Additive particle bursts (feathers, shadow smoke, venom spray).

Loop animations at **8–12 fps** for crunchy, retro feel.

---

## 5. VFX & Auras
- **Implementation**:
  - Sprite sheets (8-frame loops) stored as atlases (<1k²).
  - Shader-based UV flip for animation, not per-frame upload.
- **Blend Mode**: `AdditiveBlending` for most effects.
- **Design Rules**:
  - Offensive → sharper, outward motion (slashes, ripples, bursts).
  - Defensive → circular, enclosing motion (bubbles, shields, cloaks).

---

## 6. UI & HUD
- **Font**: *Press Start 2P*
- **Sizes**: 9–14px, 1px letter spacing.
- **Colors**:
  - Foreground: `#dbeafe`
  - Warnings: `#f87171`
  - Backdrops: `rgba(15,23,42,0.75)`
- **Style**: Neon edge (1–2px glow) for emphasis.

---

## 7. Performance Considerations
- **Instancing**: Author repeatable props to share a single material/geometry.
- **Atlases**: Keep under 1024×1024; group biomes/themes together.
- **Draw Calls**: Limit new unique materials — reuse base materials wherever possible.
- **Shadows**: Avoid baked AO; rely on Three.js real-time soft shadows.

---

✅ With this guide, every new **character, weapon, or aura** will look like it belongs in the same world as your psionic chicken, teleport frog, shadow bat, and venom snake.

