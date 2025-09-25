```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: starbuds
topic: "Step 8 – VFX budget enforcement and GPU particle migration"
tags: [research, codebase, performance, vfx]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 8 – VFX budget enforcement and GPU particle migration

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: starbuds

## Research Question
How do we make the third performance step deliver immediate frame-time gains by optimizing the upgraded VFX introduced earlier?

## Summary
Cap particle counts per quality tier, migrate recurring effects (XP orbs, aura trails) to GPU instanced buffers, and add distance-based culling. After this step, players experience steadier FPS during large waves while retaining the richer visuals shipped in Steps 2–5.

## Detailed Findings

### Existing Particle Systems
- `packages/client/src/game/bootstrap.ts:200` updates instanced meshes for XP orbs and projectiles; extend this logic to store particle data in GPU buffers.

### Quality Tier Integration
- Read the preset from Step 7 to scale particle density. Low tier can halve spawn counts, while High tier keeps full fidelity.

### Network Considerations
- Ensure server snapshot payloads (`packages/shared/src/index.ts:300`) do not bloat; only send particle-critical state while derived visuals remain client-side.

## Code References
- `packages/client/src/game/bootstrap.ts:200` – Particle/instancing update loop.
- `packages/shared/src/index.ts:300` – Snapshot schema to respect when culling data.
- `specs/research/07-graphics-quality-tiers-and-lod.md` – Quality preset context.

## Architecture Insights
Introduce a `VfxManager` that manages pooled buffers, budget counters, and culling heuristics. This central authority ensures both gameplay and armory previews share the same constraints, preventing divergence.

## Historical Context (from thoughts/)
- None found; document newly enforced budgets post-implementation.

## Related Research
- Follows the audiovisual upgrades to maintain fidelity while improving performance.

## Open Questions
- Should we support optional compute/transform feedback for even cheaper particle updates on capable GPUs?
- How do we quantify particle impact in perf telemetry (samples per effect)?
```
