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

## Milestone 2 – Co-op Utilities & Visual Foundations (Week 5–7)
- **Gameplay & Balance**: Add roster panel, ready check, quick-chat ping wheel, and shared objective tracker (wave count, boss timer, extraction beacon) plus share teammate augment picks.
- **Visual & Audio**: Replace floor tiles with biome-tinted atlases (barnyard, forest, lab). Add dynamic lighting pass (directional + ambient) and post-hit screen shake.
- **3D Transition Prep**: Build modest low-poly chicken/enemy meshes (300–600 tris) and hook into billboard slots for testing; author texture guidelines in `docs/art-style.md`.
- **Performance**: Introduce GPU instancing for tiles/props and move XP orb animations to shader uniforms. Add regression check using headless puppeteer script capturing FPS metrics.
- **Tooling**: Create automated smoke test that spins server/client, connects bot user, and validates basic snapshot loop. Integrate eslint/prettier with TypeScript config.

## Milestone 3 – Content Expansion & 3D Adoption (Week 8–11)
- **Gameplay & Balance**: Enrich enemy roster (diving hawk, burrowing weasel, support owl) and boss loot bursts with psychic artifacts influencing builds. Tune XP/health curves with telemetry from playtests.
- **Visual & Audio**: Swap primary characters to rigged 3D meshes with idle/attack animations; finalize 35° tilted camera if readability remains strong. Add environment props (windmill, grass sway) and parallax skybox.
- **VFX & UI**: Craft VFX library (shader-based psychic distortions, XP orbital pulses) and update HUD with build summary + boss telegraph banner.
- **Performance**: Implement texture atlas packing pipeline, add frustum culling for particles, and run mid-hardware benchmark (Chrome on M1 Air + mid-tier Windows laptop).
- **Tooling**: Introduce in-editor gizmo script for spawn placement, add storybook-style UI sandbox for HUD components, and begin telemetry logging (damage taken, ability pick rates).

## Milestone 4 – Meta Progression & Replayability (Week 12–15)
- **Gameplay & Balance**: Launch armory hub between runs with currency (feathers) for loadout upgrades and cosmetic unlocks; introduce daily/weekly mutators to keep demos fresh.
- **Visual & Audio**: Expand 3D asset library with cosmetic variants and add cinematic zooms for level-up and boss introductions. Compose layered soundtrack with intensity scaling.
- **Performance**: Add snapshot delta compression and lightweight client-side culling for off-screen enemies. Validate network bandwidth targets over Tailscale.
- **Tooling**: Build matchmaking test harness supporting reconnect, add automated regression script that replays recorded input streams, and set up bundle size budgets with alerts.

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
