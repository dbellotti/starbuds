```markdown
---
date: 2025-09-23T04:42:08Z
researcher: Codex
git_commit: 2cea9071fddfc16455ac274893af9a4e87bea5f9
branch: main
repository: farsight
topic: "Step 6 – Performance baseline and telemetry capture"
tags: [research, codebase, performance, tooling]
status: complete
last_updated: 2025-09-23
last_updated_by: Codex
---

# Research: Step 6 – Performance baseline and telemetry capture

**Date**: 2025-09-23T04:42:08Z
**Researcher**: Codex
**Git Commit**: 2cea9071fddfc16455ac274893af9a4e87bea5f9
**Branch**: main
**Repository**: farsight

## Research Question
What should the first step of the performance plan deliver so every subsequent optimization has measurable impact and players immediately see smoother telemetry during playtests?

## Summary
Augment the existing perf harness (`npm run perf:fps`) with per-frame CPU/GPU/memory logging and an in-client debug overlay toggle. After this step, testers can run a sortie and instantly view concrete performance numbers plus an exported report for regression tracking.

## Detailed Findings

### Current Perf Script
- `scripts/perf-metrics.mjs:1` builds the client, runs Puppeteer, and captures FPS averages; extend it to log memory usage (`performance.memory`) and write JSON summaries for CI.

### Debug Overlay
- `packages/client/src/game/hud.ts:120` already includes the debug overlay; expose new metrics (fps, frame time, draw calls) so playtesters see improvements live.

### Telemetry Storage
- Add a report output under `perf-reports/` per run, allowing historical tracking and giving QA quick proof of improvement after each step.

## Code References
- `scripts/perf-metrics.mjs:1` – Existing automated FPS capture.
- `packages/client/src/game/hud.ts:120` – Debug overlay infrastructure.
- `context.md:36` – Documentation of current perf script expectations.

## Architecture Insights
Keep metrics collection modular; the overlay should read from a shared perf manager that also feeds the Puppeteer script to avoid divergent data sources.

## Historical Context (from thoughts/)
- No prior telemetry enhancements logged; document once the new overlay ships.

## Related Research
- None yet beyond roadmap notes; this kicks off the performance refactor series.

## Open Questions
- Which low-spec hardware configs should anchor our baseline (e.g., Intel UHD, M1 Air)?
- Do we need to anonymize telemetry before committing JSON reports?
```
