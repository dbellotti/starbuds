```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 10 – Network payload and simulation efficiency"
tags: [research, codebase, performance, networking]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 10 – Network payload and simulation efficiency

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
How do we close out the performance plan by reducing network and simulation overhead so large firefights stay smooth across clients?

## Summary
Audit snapshot payloads, tighten delta compression, and offload cosmetic-only updates to client prediction. Parallelize server-side noncritical work and expose client toggles for rate limiting. After this step, squads experience lower bandwidth spikes and steadier tick pacing during extraction-scale encounters.

## Detailed Findings

### Snapshot Handling
- `packages/server/src/index.ts:2000` assembles world snapshots; profile payload size and move cosmetic previews to client-side derivation when feasible.

### Delta Compression
- Client merge logic in `packages/client/src/game/network.ts:150` applies deltas; extend schema to skip unchanged cosmetic arrays, leveraging the richer visuals without bloating packets.

### Telemetry Feedback
- Feed bandwidth/tick metrics into the perf overlay from Step 6 so users can see the impact immediately after a playtest.

## Code References
- `packages/server/src/index.ts:2000` – Snapshot assembly.
- `packages/client/src/game/network.ts:150` – Delta merge logic.
- `specs/research/06-performance-baseline-telemetry.md` – Telemetry overlay hook.

## Architecture Insights
Adopt a binary snapshot format for hot paths while keeping JSON fallbacks for debugging. Consider Web Worker offloading on the client for cosmetic interpolation to free the main thread.

## Historical Context (from thoughts/)
- No prior payload reduction strategies documented; add notes after implementation.

## Related Research
- Complements Steps 6–9 by ensuring network and simulation keep pace with visual/audio improvements.

## Open Questions
- Do we need a compatibility mode for unstable connections (lower snapshot rate)?
- How do we validate payload reductions without breaking replay tooling?
```
