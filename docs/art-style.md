# Starbuds Art Style Guide

This project blends crisp pixel-inspired textures with readable low-poly silhouettes. Use these notes when creating new assets so the world stays cohesive and lightweight enough for the browser.

## Biomes & Palettes
- **Barnyard**: warm earth tones (`#33261a`, `#d9a066`, `#f4bb78`). Accent with straw streaks and copper glints. Avoid pure black; anchor shadows with deep burgundy.
- **Forest**: rich greens (`#1f3520`, `#16a34a`, `#6ee7b7`) with turquoise specular hints. Reserve bright neon for interactive props.
- **Lab**: cool steel blues (`#1a2433`, `#60a5fa`, `#a5b4fc`) with emissive pulses (`#60a5fa` at 30–40% opacity).

Work in 128×128 or 64×128 canvas tiles. Paint base gradients first, then scatter 1–2px noise strands using 18–30% opacity. Preview textures at 512% zoom to ensure clean clusters.

## Low-Poly Meshes
- Target **300–600 tris** per creature.
- Use `MeshStandardMaterial` with `roughness` between 0.4–0.7; keep `metalness` under 0.15 except for lab props.
- Mark tintable submeshes with `mesh.userData.tint = true` so gameplay code can recolor allies vs. enemies without duplicating geometry.
- Favor exaggerated proportions (large heads, small torsos) to stay readable from the tilted camera. Stack primitives (spheres, cones, short cylinders) instead of dense sculpting.

## Armory Preview Attachments
- Base chicken rig lands at ~420 tris; wings, crest, and tail stay tintable for squad color swaps.
- `cosmic-plumage`: 110 tris using aurora palette (`#93c5fd`, `#6b21a8`) with emissive intensity capped at 0.6.
- `ember-sheen`: 90 tris of staggered ember cones in `#f97316`/`#fb923c`; keep emissive under 0.8 to avoid bloom spill.
- `midnight-veil`: 140 tris; draped indigo shell (`#1e3a8a`) with 12 star specks at `#facc15` glow.
- `suncrest`: 70 tris of feather spikes; blend `#facc15` through `#fcd34d` for daytime crest highlights.

## Lighting & VFX
- Directional key light sits at `(160, 340, 180)`; paint highlights assuming a 35° downlight from the northeast.
- Avoid baked AO in textures; lightweight shader-driven shadows handle depth cues.
- VFX sprites (projectiles, impacts, pings) should be additive with soft radial falloff. Keep alpha gradients clamped—no hard mip jumps.

## UI & HUD
- UI font is “Press Start 2P”. Use 9–14px sizes with 1px letter spacing. Foreground text `#dbeafe`; warnings `#f87171`. Backdrops should be `rgba(15,23,42,0.75)` with 1–2px neon edge.

## Performance Considerations
- Prefer instancing for repeated props; author meshes so they can share a single material. Texture atlases should stay under 1k².
- When adding animated textures, aim for 8-frame loops stored as sprite sheets; flip via shader time rather than per-frame uploads.

Stick to these constraints and new art will drop cleanly into the existing lighting, camera, and performance budgets.
