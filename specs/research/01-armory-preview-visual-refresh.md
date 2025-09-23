---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 1 – Armory preview and asset style lock"
tags: [research, codebase, vfx, audio, armory]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 1 – Armory preview and asset style lock

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
How do we deliver the first audio/visual upgrade step so players immediately see improved low-poly presentation in the armory hub, aligned with the provided concept art and `docs/styleguide.md` guidance?

## Summary
Rebuild the armory preview scene with the finalized low-poly lighting rig, idle animation loops, and cosmetic overlays. Ship a mood-locked asset bundle (chicken hero, signature enemies, cosmetic variants) that matches the concept art silhouettes and emissive cues. The user benefit after this step: the armory becomes a visual showcase that previews live cosmetic changes, giving instant feedback before any sortie.

## Detailed Findings

### Armory HUD Composition
- `packages/client/src/game/hud.ts:310` builds the armory dialog and sidebar, but previews currently render static cards without orbit controls or lighting overrides.
- Hooking the preview canvas into this panel permits immediate visibility of upgraded assets.

### Style & Palette Constraints
- `docs/styleguide.md:1` documents triangle budgets, palette, and emissive rules that must guide refreshed meshes/materials.
- Concept references (provided PNGs) emphasize glowing psionic accents, chunky silhouettes, and consistent rim lighting that should inform the preview rig.

### Animation Hooks
- `packages/client/src/game/bootstrap.ts:700` wires extraction/phase VFX; similar hooks can drive idle/run animation loops for preview rigs, ensuring parity with in-game behavior.

### Audio Stinger Opportunities
- `packages/client/src/game/audio.ts:84` exposes `playLevelUp`/`playMutatorChime`; reuse this controller to trigger short hover/click SFX when cosmetics are previewed for a richer armory loop.

## Code References
- `packages/client/src/game/hud.ts:310` – Armory dialog DOM construction.
- `packages/client/src/game/bootstrap.ts:700` – Phase VFX wiring to mimic for preview scene.
- `packages/client/src/game/audio.ts:84` – Audio controller hooks for UI feedback.
- `docs/styleguide.md:1` – Geometry, palette, and VFX rules for low-poly assets.

## Architecture Insights
Armory UI is DOM-driven but can host a Three.js canvas; reuse existing bootstrap utilities to mount a lightweight renderer. Keep assets in shared atlases to respect the instancing strategy described in the style guide.

## Historical Context (from thoughts/)
- No relevant entries located yet; create follow-up notes once preview renderer lands.

## Related Research
- None yet; this will serve as the first entry for the upgrade initiative.

## Open Questions
- Should cosmetic previews display ability VFX loops or remain idle-focused?
- Do we stream high-res meshes on demand or bundle with initial load?
