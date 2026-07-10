# Armory Preview Reference

## Overview
The armory HUD mounts a lightweight sprite stage (`ArmoryPreviewRenderer`) that draws the hero's sprite from the shared skin atlas onto a plain 2D canvas — no second WebGL context. Hovering an upgrade plays a tinted pulse loop while cosmetics display immediately as overlay frames on the idle hero. Audio cues fire through `audio.playArmoryHover()` and `audio.playArmoryEquip()` so the preview stays in sync with button interactions.

## Asset Authoring
All preview art comes from the skin pipeline — see `docs/skinning.md`.

- Hero: the `player` entity (its `idle` clip loops in the preview). Tint is applied at draw time via the squad color.
- Cosmetics: `cosmetic:<id>` entities are drawn as overlay frames above the hero. Add a new cosmetic by adding a `cosmetic:<id>` entry to the skin (2-frame shimmer at ~6 fps is the house style).
- Upgrade pulses: accent colors live in the `UPGRADE_COLORS` map inside `armoryPreviewRenderer.ts` (and mirrored in the styleguide). Add the id → hex entry when introducing a new upgrade.

## Preview Renderer Integration
- HUD wiring lives in `packages/client/src/game/hud.ts`. `setPreview()` coordinates:
  - Calling `previewRenderer.previewUpgrade(id)` for upgrade hovers.
  - Switching cosmetics via `previewRenderer.setState({ cosmeticId })` for hover/equip.
  - Firing `options.audio?.playArmoryHover()` / `playArmoryEquip()` based on interaction.
- `ArmoryPreviewRenderer` throttles rendering to 30 fps and pauses when the armory overlay hides or the tab is backgrounded. Do not exceed this cadence.

## Performance Checklist
- The stage is a single 2D canvas; per frame it draws ≤3 images (hero, cosmetic overlay, pulse strokes). Keep it that way — no extra canvases or WebGL contexts per preview.
- Pause RAF work when `setActive(false)` is invoked (already enforced by the renderer); ensure new code respects that toggle.
- Run `npm run perf:fps` after adding heavy assets—capture a sample armory hover session to confirm the stage holds 30 fps.

## Extending Further
- For new hero looks, ship a skin pack that overrides the `player` entity (`docs/skinning.md`); the preview, styleguide, and in-game renderer all read the same atlas, so one override updates all three.
- When adding bespoke audio, keep everything behind the existing user-gesture gate by routing through the shared `AudioController`.
