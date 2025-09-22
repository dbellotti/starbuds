# North Star Roadmap

This plan keeps the game fun at every stage while steering toward a rich, performant browser experience. Each milestone is aimed to be demoable at completion.

## Milestone 0 – Baseline Polish (Week 0–1) ✅
- **Gameplay & Balance**: Melee threats tuned with knockback + i-frames; respawn invulnerability live. Continue gathering notes from 2–4 player playtests.
- **Visual & Audio**: Procedural chicken/enemy textures in place, psychic bolt trails and pooled impact sparks added, HUD damage flash reinforces hits.
- **Performance**: FPS smoothing and projectile pooling landed; budgets set (60 fps @ 1080p, <4 ms server tick) and surfaced via debug overlay.
- **Tooling**: Added `.env.example`, `npm run dev:all` orchestrator, and in-game overlay (ping, tick drift, FPS) to accelerate diagnostics.

## Milestone 1 – Core Loop & Immediate Feedback (Week 2–4) ✅
- **Gameplay & Balance**: Added `raccoon` ranged foe with telegraphed bolts and `coyote` miniboss shockwaves; level-up picker surfaces 3 augment choices per tier with stat boosts and bolt splitting.
- **Visual & Audio**: HUD gained level-up overlay, augment toasts, and low-fi background loop with level-up/boss SFX; projectile VFX tint per faction.
- **Camera Prototype**: Key `V` toggles shallow tilt camera while preserving aiming + debug overlay readout.
- **Performance**: Client/server now pool enemies/projectiles to cut allocations; per-projectile power influences trails.
- **Tooling**: Logged level seeds on boot, wired camera hotkey prompt, and shipped `npm run replay:snapshots` for offline snapshot analysis.

## Milestone 2 – Co-op Utilities & Visual Foundations (Week 5–7) ✅
- **Gameplay & Balance**: Add roster panel, ready check, quick-chat ping wheel, and shared objective tracker (wave count, boss timer, extraction beacon) plus share teammate augment picks. ✅
- **Visual & Audio**: Replace floor tiles with biome-tinted atlases (barnyard, forest, lab). Add dynamic lighting pass (directional + ambient) and post-hit screen shake. ✅
- **3D Transition Prep**: Build modest low-poly chicken/enemy meshes (300–600 tris) and hook into billboard slots for testing; author texture guidelines in `docs/art-style.md`. ✅
- **Performance**: Introduce GPU instancing for tiles/props and move XP orb animations to shader uniforms. Add regression check using headless puppeteer script capturing FPS metrics. ✅ (`npm run perf:fps`)
- **Tooling**: Create automated smoke test that spins server/client, connects bot user, and validates basic snapshot loop. Integrate eslint/prettier with TypeScript config. ✅ (`npm run smoke`, root lint setup)
- **Networking DX**: Web client now auto-targets the hosting machine for websockets (configurable with `VITE_SERVER_PORT`/`VITE_SERVER_ORIGIN`) so Tailscale guests join without custom builds. ✅

## Milestone 3 – Content Expansion & 3D Adoption (Week 8–11) ✅
- **Gameplay & Balance**: Enemy roster now includes the diving hawk, burrowing weasel, and support owl, with bosses dropping psychic artifacts that apply permanent stat auras. Foraging Aura augment stacks into an expanding loot magnet; server telemetry (damage/xp/augment/artifact) logs support XP/health tuning.
- **Control & Feel**: Input snapshots carry `aimHeading` so projectiles follow the reticle regardless of movement, with player rigs animating toward aim and attack events across both camera modes.
- **Visual & Audio**: Primary characters render as rigged 3D meshes with wing/head/tail motion; the tilt camera received height/offset tuning. Biomes now feature parallax sky domes, barnyard windmills, and grass sway props.
- **VFX & UI**: Psychic pulse system reinforces artifact pickups and augment unlocks. HUD adds build summaries (augments/artifacts/magnet radius), artifact toasts, and a persistent boss banner on spawns.
- **Performance**: Runtime atlas packing merges biome tile textures, ambient particles cull out-of-view, and `npm run perf:fps` is the baseline for mid-hardware validation on Chrome (M1 Air + mid-tier Windows).
- **Tooling**: Added `npm run telemetry:summary` to condense `[telemetry]` console output, keeping damage/XP/augment/ artifact trends visible without diving into raw logs. Storybook sandbox and editor gizmo remain future stretch.

## Milestone 4 – Meta Progression & Replayability (Week 12–15) ✅
- **Gameplay & Balance**: Armory hub now gates sorties between runs; feathers buy loadout upgrades & cosmetics, and daily/weekly mutators rotate automatically (glass cannon, overgrowth, etc.). Ready toggles are phase-aware so squads must confirm both extraction and sortie launch.
- **Visual & Audio**: HUD surfaces mutators, armory roster, inventory cards, and a unified ready button. Cinematic camera zooms punctuate level-ups and boss spawns, and the layered soundtrack blends phase ambience with combat intensity.
- **Performance**: Snapshot delta compression keeps websocket payloads light, enemies/projectiles cull client-side when out of view, and hawk overgrowth mutators scale server spawn logic.
- **Tooling**: Added `npm run matchmaking:test` harness for reconnect smoke, `npm run replay:inputs` for deterministic input playback, and Vite bundle budgets to flag oversized chunks.

## Milestone 5 – Launch-Ready Polish (Week 16–20)
- **Gameplay & Balance**: Finalize difficulty curve with analytics-driven tweaks, add tutorial onboarding, and implement fail-states (extraction success/failure summary).
- **Visual & Audio**: Refine shaders (SSR-like floor reflections, ability-specific color grading) and finalize UX motion guidelines. Record VO callouts for enemies and abilities.
- **Performance**: Complete lag compensation for projectiles, add server autoscaling plan, and run soak tests (4-player, 1-hour sessions) logging CPU/memory/network stats.
- **Tooling & Ops**: Dockerize server with Tailscale-friendly entrypoint, create deployment checklist, documentation for operators, and automated bug-report template capturing seed/logs/screenshot.

## Continuous Initiatives
- **Player Feedback Loop**: Schedule bi-weekly playtest nights, capturing observations alongside telemetry dashboards.
- **QA & Regression**: Maintain test matrix (browsers, hardware tiers), run `npm run typecheck --workspaces` + smoke suite before every demo, and keep changelog current.
- **Security & Reliability**: Treat config as code; use `.env` injection, never hardcode secrets, and monitor websocket health for disconnect storms.

Questions or adjustments needed? Let me know if you’d like different milestone pacing or deeper breakdowns for art/tooling ownership.
