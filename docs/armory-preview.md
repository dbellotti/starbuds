# Armory Preview Reference

## Overview
The armory HUD now mounts a dedicated Three.js stage (`ArmoryPreviewRenderer`) that reuses the shared chicken rig, cosmetic attachments, and scripted upgrade VFX loops. Hovering an upgrade plays a short ability clip while cosmetics display immediately on the idle hero silhouette. Audio cues fire through `audio.playArmoryHover()` and `audio.playArmoryEquip()` so the preview stays in sync with button interactions.

## Asset Authoring
- Base rig: call `buildBaseChickenRig()` from `packages/client/src/game/armoryAssets.ts`. Tintable sub-meshes are flagged via `userData.tint` and the returned `ChickenRig` exposes wing/head/tail transforms for animation.
- Cosmetic attachments: extend `createCosmeticAttachment()` in `armoryAssets.ts`. Each attachment should:
  - Stay under ~140 tris and share the armory material conventions (roughness 0.35–0.65, emissive ≤0.8).
  - Populate `group.userData.anchors` with `Vector3` offsets (`crest`, `back`, `tail`) so the preview can position the piece relative to the chicken rig.
  - Accept a `tint` option for palette matching when the squad color changes.
- Document new attachments in `docs/art-style.md` with triangle counts and palette notes.

## Upgrade Effect Loops
- Timeline logic lives in `packages/client/src/game/armoryEffects.ts`. To add a new upgrade:
  1. Add a builder entry to `createUpgradeEffect()` in `armoryAssets.ts` that returns the static geometry for the effect.
  2. Create an effect loop in `armoryEffects.ts` (see `createFocusMatrixLoop()` for reference). The loop should:
     - Animate only what’s necessary (scale, spin, light opacity). Keep updates deterministic and clamp to ≤1.5 s.
     - Reset the rig transforms in `stop()` so idle poses remain stable when the loop finishes.
  3. Register the new loop in the `EFFECT_BUILDERS` map.

```ts
EFFECT_BUILDERS['new-upgrade-id'] = () => createNewUpgradeLoop();
```

## Preview Renderer Integration
- HUD wiring lives in `packages/client/src/game/hud.ts`. `setPreview()` coordinates:
  - Calling `previewRenderer.previewUpgrade(id)` for upgrade hovers.
  - Switching cosmetics via `previewRenderer.setState({ cosmeticId })` for hover/equip.
  - Firing `options.audio?.playArmoryHover()` / `playArmoryEquip()` based on interaction.
- `ArmoryPreviewRenderer` throttles rendering to 30 fps and pauses when the armory overlay hides or the tab is backgrounded. Do not exceed this cadence—keep effect loops lightweight and avoid spawning extra renderers per preview.

## Performance Checklist
- Chicken rig + cosmetic attachment ≤550 tris combined.
- Effect loops should create at most 2–4 meshes and reuse shared materials where possible.
- Pause RAF work when `setActive(false)` is invoked (already enforced by the renderer); ensure new code respects that toggle.
- Run `npm run perf:fps` after adding heavy assets—capture a sample armory hover session to confirm the stage holds 30 fps.

## Extending Further
- For new hero rigs, implement a sibling helper (e.g., `buildFalconRig`) inside `armoryAssets.ts`, then branch in `ArmoryPreviewRenderer.setState()` based on the selected character.
- When adding bespoke audio, keep everything behind the existing user-gesture gate by routing through the shared `AudioController`.
