```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 7 – Graphics quality tiers, LOD, and settings UI"
tags: [research, codebase, performance, rendering]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 7 – Graphics quality tiers, LOD, and settings UI

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
How do we stage the second performance step so players on lower-end hardware can dial visuals up or down and immediately benefit from better FPS?

## Summary
Introduce a graphics settings panel accessible from the armory and pause menu with presets (Low/Medium/High). Wire each preset to concrete renderer adjustments: pixel ratio clamp, post-processing toggles, shadow resolution, instanced LOD swaps, and particle density. After this step, players can lower settings and see smoother frame rates during the same play session.

## Detailed Findings

### Renderer Controls
- `packages/client/src/game/bootstrap.ts:70` configures the WebGLRenderer pixel ratio and clear color; expose setters to respond to quality changes.

### Instanced Assets
- Geometry/material creation around `packages/client/src/game/bootstrap.ts:150` already pools meshes; integrate simplified meshes for low quality and high-res for high quality.

### UI Hook Points
- `packages/client/src/game/hud.ts:310` constructs the armory sidebar where we can mount a settings button/modal; reuse HUD event wiring for persistence.

### Persistence
- Store the chosen preset in localStorage alongside existing HUD preferences (`packages/client/src/game/hud.ts:40`) so returning players retain optimized settings.

## Code References
- `packages/client/src/game/bootstrap.ts:70` – Renderer setup.
- `packages/client/src/game/bootstrap.ts:150` – Mesh pooling and instancing.
- `packages/client/src/game/hud.ts:40` – HUD preference storage.
- `packages/client/src/game/hud.ts:310` – Armory dialog DOM.

## Architecture Insights
Centralize quality tiers in a new `renderQuality.ts` module so both the renderer and future VFX systems read the same config. Ensure presets also toggle features introduced in the audiovisual plan (bloom, rim lights, heavy particles).

## Historical Context (from thoughts/)
- None available; capture results once the settings panel ships.

## Related Research
- Depends on telemetry from `specs/research/06-performance-baseline-telemetry.md` to verify impact.

## Open Questions
- Do we allow granular sliders (shadow distance, bloom) or keep to coarse presets for simplicity?
- How do we surface preset recommendations based on detected hardware?
```
