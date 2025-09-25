```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: starbuds
topic: "Step 4 – Dynamic audio layering and previews"
tags: [research, codebase, audio, gameplay]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 4 – Dynamic audio layering and previews

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: starbuds

## Research Question
How can we stage the fourth step so upgraded music and SFX are audible immediately in both the armory hub and sorties, while respecting web audio constraints?

## Summary
Expand the existing `AudioController` to load layered stems (ambient, combat, extraction) with state-driven mixing and cosmetic preview stingers. After this step, players hear richer music transitions and responsive UI sounds, improving the overall presentation instantly.

## Detailed Findings

### Audio Controller Capabilities
- `packages/client/src/game/audio.ts:16` currently synthesizes tones procedurally; extend it to stream buffered stems and expose new methods for preview playback.

### Phase Awareness
- Phase transitions in `packages/client/src/game/network.ts:260` already notify the client about summary vs combat states; tie these events into the layered mix to swap stems seamlessly.

### Armory Preview Hooks
- `packages/client/src/game/hud.ts:450` handles hover interactions for loadout entries; play cosmetic stingers here for instant feedback when users browse items.

### Performance Safeguards
- Continue to gate playback on user gesture (`createAudioController` prime flow) and ensure low-latency decoding by preloading short SFX into AudioBuffers.

## Code References
- `packages/client/src/game/audio.ts:16` – Audio controller scaffolding.
- `packages/client/src/game/network.ts:260` – Phase/state messages.
- `packages/client/src/game/hud.ts:450` – Loadout hover/click handling.

## Architecture Insights
Adopt a stem registry (armory, combat, extraction, mutator) keyed by GamePhase and ready state. Keep dynamic intensity tied to gameplay metrics (enemy count, damage taken) to stay consistent with future performance tweaks.

## Historical Context (from thoughts/)
- No audio layering notes recorded yet; capture learnings post-implementation.

## Related Research
- Builds upon visual refresh steps to keep audiovisual cohesion (`specs/research/01-03`).

## Open Questions
- Do we compress stems with OGG or Opus for best compatibility?
- Should we expose volume sliders now or alongside the performance settings panel?
```
