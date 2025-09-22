**Farsight Dev Log**

**Project Snapshot**
- Top-down multiplayer action roguelite; Three.js client + Node.js `ws` server; procedural levels, Helldivers-inspired pacing.
- Tailscale-friendly: one host server, browser-only clients, pixel-but-HD presentation.
- Shared TypeScript workspace (`packages/{client,server,shared}`) with strict typing and monorepo tooling plus helper scripts under `scripts/`.
- Baseline instrumentation in place: in-game debug overlay surfaces FPS, ping, and tick drift for fast playtest feedback.

**Implemented Foundations**
- Authoritative Node server: deterministic tick loop (`60 Hz`), procedural level generator (random-walk caverns, spawn ring), player/enemy state sync via JSON websockets.
- Client renderer: elevated orthographic camera, instanced tile meshes, smooth avatar interpolation, pointer-driven aiming, shader-lite polish.
- Networking: hello/welcome handshake with protocol guard, input → server → snapshot flow, ping keep-alive, client-side reconciliation hooks and latency callbacks.
- Dynamic HUD frameworks: roster/ready panel, objective tracker, ping wheel, and augment toasts all driven from shared snapshot data.

**Recent Feature Pass (committed)**
- Gameplay: Hawk dive, burrowing weasel, and support owl enemies landed; bosses now burst psychic artifacts that grant permanent stat boosts. Foraging Aura augments expand a stackable loot magnet and the server logs damage/xp/augment/artifact telemetry for tuning.
- Progression: Level-up picker supports stackable augments with HUD build summaries surfacing augments, artifacts, and magnet radius per player.
- Feedback: Audio controller still drives loops/SFX; psychic pulses, artifact toasts, and boss banners reinforce major events. Aim-heading is decoupled from movement to keep projectiles aligned with the reticle.
- Rendering: Player/enemy meshes animate via lightweight rigs, parallax skyboxes and biome props (windmill, grass sway) dress the arena, and disk-based psychic VFX punctuate artifact pickups.
- Tooling: `npm run telemetry:summary` digests the server’s `[telemetry]` log output; runtime texture atlases cut draw calls; particles frustum-cull to relieve overdraw.
- Co-op quality of life: Ready check, roster augment surfacing, ping wheel, and objective tracker remain core; HUD now indicates active builds and artifact gains.

**Baseline Polish (completed)**
- Visual: Procedural chicken/enemy textures, additive projectile trails, pooled impact bursts, and harm flicker tuning.
- Feedback: Enemy telegraph-driven targeting markers, HUD damage flash, ping/tick drift debug overlay, smoother camera height for wider arena view.
- Tooling: Added `.env.example` defaults and `npm run dev:all` runner for synchronized dev servers; network layer now exposes live latency metrics.

**Run / Verify**
- `npm run dev --workspace=@farsight/server`
- `npm run dev --workspace=@farsight/client`
- `npm run dev:all` (combined watcher for client + server)
- Optional: `LEVEL_SEED=<int> npm run dev --workspace=@farsight/server`
- Sanity: `npm run typecheck --workspaces` (clean)
- Analysis: `npm run replay:snapshots -- logs/snapshots.json`
- Smoke: `npm run smoke` spins up the server and verifies a headless bot handshake.
- Perf: `npm run perf:fps` builds the client, runs `vite preview`, and records short FPS samples with Puppeteer.
- Copy `.env.example` → `.env` to override ports or server origin locally. By default the client targets `ws(s)://<current host>:7777`; change `VITE_SERVER_PORT` or `VITE_SERVER_ORIGIN` when routing through other proxies.

**Open Threads / Next Steps**
1. HUD sandbox + spawn gizmo: storybook-style UI route and in-editor placement tooling remain to be scheduled.
2. Telemetry dashboards: stream aggregated outputs into Grafana/observable for playtest nights once `telemetry:summary` is battle-tested.
3. Performance: establish `perf:fps` baselines on Chrome (M1 Air + mid-tier Windows) and explore snapshot compression.
4. Networking/QA: reconnect path, snapshot replay integration into CI, broaden hardware/browser coverage.
5. Meta planning: prepare Milestone 4 art/tooling specs (armory hub, mutators, bundle budgets).

**Key Files (post-commit)**
- Shared schema: `packages/shared/src/index.ts`
- Server sim: `packages/server/src/index.ts`
- Client render loop & debug overlay: `packages/client/src/game/bootstrap.ts`, `packages/client/src/game/debugOverlay.ts`
- Client HUD: `packages/client/src/game/hud.ts`
- Networking client: `packages/client/src/game/network.ts`
- Styles: `packages/client/src/style.css`
- Dev helper runner: `scripts/dev-all.js`
- Art direction: `docs/art-style.md`
