```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: starbuds
topic: "Step 3 – Biome lighting and post-processing pass"
tags: [research, codebase, lighting, vfx]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 3 – Biome lighting and post-processing pass

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: starbuds

## Research Question
How should we stage the third audio/visual step so that lighting and post-processing upgrades deliver a noticeable improvement in both armory previews and live gameplay?

## Summary
Implement biome-specific lighting rigs with rim lights and color grading that align with the style guide, and expose toggles in the preview and gameplay renderers. Players will see deeper contrast, consistent emissive glow, and optional bloom in both the armory and sorties after this step.

## Detailed Findings

### Renderer Setup
- `packages/client/src/game/bootstrap.ts:120` initializes the Three.js scene; extend this to load biome lighting presets and post-processing pipelines.

### Style Guide Alignment
- `docs/styleguide.md:12` defines directional light angles and roughness/metalness values that should drive the new lighting rig.

### Armory Preview Sharing
- Use the same presets in the armory renderer introduced in Step 1 so cosmetics and live scenes match; reference `packages/client/src/game/hud.ts:310` where the preview canvas mounts.

### Performance Considerations
- Bloom/tone mapping should be optional; tie into future settings panel but default to medium quality that maintains 60 fps targets.

## Code References
- `packages/client/src/game/bootstrap.ts:120` – Scene initialization point.
- `packages/client/src/game/hud.ts:310` – Armory preview mount.
- `docs/styleguide.md:12` – Lighting assumptions to replicate.

## Architecture Insights
Create a shared lighting preset module under `packages/shared` or a new client utility so both armory and gameplay import identical configs. Keep post-processing modular to support quality tiers in the performance plan.

## Historical Context (from thoughts/)
- No prior lighting roadmap recorded; document once presets are codified.

## Related Research
- Builds on `specs/research/01-armory-preview-visual-refresh.md` and `specs/research/02-core-combat-vfx-upgrade.md`.

## Open Questions
- Should we bundle ACES tone mapping or rely on Three.js Reinhard for simplicity?
- How do we handle multiplayer scenes with mixed biome lighting (e.g., transitional arenas)?
```
