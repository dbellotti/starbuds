```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 5 – Cinematic cues and usability QA"
tags: [research, codebase, vfx, audio, qa]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 5 – Cinematic cues and usability QA

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
How do we conclude the audiovisual upgrade plan with cinematic cues that reinforce the new assets and ensure the entire loop (armory → sortie → extraction) feels cohesive during playtests?

## Summary
Layer camera moves, slow-motion beats, and synchronized audio hits on major events (level-ups, boss spawns, extraction) while running a dedicated QA pass to confirm clarity. After this step, every critical milestone in a run showcases the refreshed presentation, providing a polished end-to-end experience.

## Detailed Findings

### Camera Cues
- `packages/client/src/game/bootstrap.ts:820` currently triggers extraction VFX; extend this system with cinematic zooms and easing for other event types.

### HUD Integration
- `packages/client/src/game/hud.ts:600` shows toasts/banners; add timed transitions and audio hooks so the new visuals and sounds land together.

### Audio Sync
- Use the expanded controller from Step 4 to schedule impact sweeps (e.g., `playBossSpawn`) alongside screen effects for maximum cohesion.

### QA Checklist
- Update `docs/` with a cinematic QA script ensuring each feature is verified in armory preview, during combat, and in the extraction summary so improvements stay locked.

## Code References
- `packages/client/src/game/bootstrap.ts:820` – Extraction VFX and camera-ready entry point.
- `packages/client/src/game/hud.ts:600` – Toast/boss banner presentation.
- `packages/client/src/game/audio.ts:150` – Boss spawn sweep triggers.

## Architecture Insights
Centralize cinematic event handlers to avoid scattering camera/audio logic. Reuse the event bus already delivering HUD signals to keep sequencing deterministic.

## Historical Context (from thoughts/)
- None yet; document QA learnings after the cinematic pass ships.

## Related Research
- Relies on steps 1–4 to provide upgraded assets, VFX, and audio foundations.

## Open Questions
- Do we need accessibility toggles to disable intense camera motion?
- Should we add multiplayer synchronization for cinematic pacing (e.g., shared slow-mo)?
```
