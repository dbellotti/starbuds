```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 2 – Core combat VFX refresh"
tags: [research, codebase, vfx, gameplay]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 2 – Core combat VFX refresh

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
What is the most impactful second step for the audio/visual plan that upgrades in-game combat VFX so players feel the new presentation immediately during sorties?

## Summary
Introduce GPU-friendly sprite atlases for projectiles, hits, and ability cues aligned with the new palette. Update combat emitters to use additive shaders and color variants, and wire dynamic intensity to gameplay states. This yields a dramatic change during the very next playtest sortie without waiting for later phases.

## Detailed Findings

### Projectile & Impact Systems
- `packages/client/src/game/bootstrap.ts:420` manages projectile creation; hook atlas-driven materials here to swap the old single-frame sprites for 8-frame loops.
- `packages/shared/src/index.ts:210` defines projectile metadata; add color/emissive references so the HUD and VFX stay in sync.

### Particle Budget & Pooling
- Existing pooling for projectiles in `packages/client/src/game/bootstrap.ts:180` can be extended to VFX quads, ensuring the new visuals don't spike allocations.

### Aura & Toast Hooks
- `packages/client/src/game/hud.ts:520` triggers augment toasts; pair with new aura bursts to keep HUD and world feedback consistent with the upgrade.

### Audio Tie-ins
- `packages/client/src/game/audio.ts:120` exposes tonal sweeps; trigger them alongside new VFX events (e.g., psionic crits) for cohesive feedback.

## Code References
- `packages/client/src/game/bootstrap.ts:180` – Existing pooling infrastructure.
- `packages/client/src/game/bootstrap.ts:420` – Projectile rendering entry point.
- `packages/shared/src/index.ts:210` – Projectile/shared constants.
- `packages/client/src/game/hud.ts:520` – Augment toast triggers.
- `packages/client/src/game/audio.ts:120` – Helper for frequency sweeps.

## Architecture Insights
Reuse the shared atlas infrastructure from biome tiles to keep draw calls low. Emitters should pick sprite sheets by ID so both client and armory preview can reuse the same assets.

## Historical Context (from thoughts/)
- None discovered; document pooling changes in a future notes entry.

## Related Research
- `specs/research/01-armory-preview-visual-refresh.md` – establishes asset style lock that these VFX inherit from.

## Open Questions
- Do we add biome-specific color variants now or after the base atlas ships?
- Should crit/special projectiles use shader distortion beyond additive sprites?
```
