```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 9 – Audio streaming, pooling, and low-spec modes"
tags: [research, codebase, performance, audio]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 9 – Audio streaming, pooling, and low-spec modes

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
How does the fourth performance step ensure the richer audio mix from Step 4 runs smoothly on lower-end devices without increasing CPU usage or memory footprint?

## Summary
Pool Web Audio nodes, stream long-form stems via `AudioBufferSourceNode` + MediaElement fallback, and add bitrate/downmix options tied to quality presets. After this step, low-spec players can reduce audio load while maintaining responsive cues, leading to reduced hitching during playtests.

## Detailed Findings

### Audio Controller Hotspots
- `packages/client/src/game/audio.ts:40` creates oscillators per event; add pooling and switch to buffered playback for the new stems to prevent GC churn.

### Gesture Gating
- Maintain the unlock flow (`packages/client/src/game/audio.ts:110`) but extend it to preload selected stems based on current quality tier.

### Quality Settings Integration
- Sync with Step 7 presets so “Performance” mode lowers mix complexity (fewer simultaneous channels) and applies compressed assets.

## Code References
- `packages/client/src/game/audio.ts:40` – Oscillator creation hotspot.
- `packages/client/src/game/audio.ts:110` – Prime/unlock flow.
- `specs/research/07-graphics-quality-tiers-and-lod.md` – Quality preset integration point.

## Architecture Insights
Abstract audio asset loading into a `audio/stems.ts` module. Use lazy imports so we only fetch high-fidelity stems when the preset allows it, keeping bandwidth low for performance-focused players.

## Historical Context (from thoughts/)
- None identified; document after shipping streaming logic.

## Related Research
- Builds on Step 4’s richer audio layering plan.

## Open Questions
- Do we need a mute toggle for voice-over specifically, separate from SFX/music sliders?
- Should audio quality default to “Balanced” or inherit from detected hardware performance?
```
