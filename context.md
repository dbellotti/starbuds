**Starbuds Dev Log**

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
- Meta progression: Armory hub runs between sorties; feathers persist, upgrades/cosmetics apply server-side, and readiness is phase-aware (`context: 'armory' | 'extraction'`). Daily/weekly mutators rotate deterministically (glass cannon, overgrowth, aerial superiority, psionic storm, etc.).
- Gameplay: Loadout upgrades influence damage/cooldowns/splits/magnet radius from the armory, while mutators tweak spawn cadence and hawk speed. Extraction unlocks at wave ≥3 and requires a ready check before countdown.
- Feedback: HUD now surfaces mutators, armory rosters, inventory cards, and a unified ready button. Cinematic camera zooms highlight level-ups and boss drops; soundtrack layers mix phase ambience with combat intensity.
- Rendering & perf: Client reconstructs world snapshots from deltas and culls off-screen enemies/projectiles. Snapshot compression cuts network usage, and the shared chicken rig now feeds both gameplay avatars and the armory preview stage.
- Tooling: `npm run matchmaking:test` exercises reconnect + ready flow, `npm run replay:inputs` replays recorded input traces, and bundle budgets fail the build if Vite chunks exceed limits.
- UX polish (Milestone 5 in progress): Centered armory overlay, tutorial helpers, loadout chips, extraction beacon VFX/audio, mutator toasts, and the post-run debrief overlay are live; remaining follow-ups are tracked in `docs/milestone-5-ux-audit.md`.
- Armory preview refresh: HUD mounts `ArmoryPreviewRenderer` with a tintable chicken rig, cosmetic attachments, and upgrade VFX loops; hover/equip events now trigger `playArmoryHover` and `playArmoryEquip` stingers.

**Baseline Polish (completed)**
- Visual: Procedural chicken/enemy textures, additive projectile trails, pooled impact bursts, and harm flicker tuning.
- Feedback: Enemy telegraph-driven targeting markers, HUD damage flash, ping/tick drift debug overlay, smoother camera height for wider arena view.
- Tooling: Added `.env.example` defaults and `npm run dev:all` runner for synchronized dev servers; network layer now exposes live latency metrics.

**Run / Verify**
- `npm run dev --workspace=@starbuds/server`
- `npm run dev --workspace=@starbuds/client`
- `npm run dev:all` (combined watcher for client + server)
- Optional: `LEVEL_SEED=<int> npm run dev --workspace=@starbuds/server`
- Sanity: `npm run typecheck --workspaces` (clean)
- Analysis: `npm run replay:snapshots -- logs/snapshots.json`
- Smoke: `npm run smoke` spins up the server and verifies a headless bot handshake.
- Perf: `npm run perf:fps` builds the client, runs `vite preview`, and records short FPS samples with Puppeteer.
- Copy `.env.example` → `.env` to override ports or server origin locally. By default the client targets `ws(s)://<current host>:7777`; change `VITE_SERVER_PORT` or `VITE_SERVER_ORIGIN` when routing through other proxies.

**Open Threads / Next Steps**
1. HUD sandbox + spawn gizmo: storybook-style UI route and in-editor placement tooling remain to be scheduled.
2. Telemetry dashboards: stream aggregated outputs into Grafana/observable for playtest nights once `telemetry:summary` is battle-tested.
3. Performance: downstream work to surface cosmetics client-side and profile mutator-heavy runs; verify bundle budgets can expand with future assets.
4. Networking/QA: fold `matchmaking:test` + `replay:inputs` into CI once snapshots are stabilized; expose cosmetic selections in snapshots for UI validation.
5. Meta planning: Finalize Milestone 5 follow-ups—expand the rig/VFX playbook for upcoming heroes, polish hangar shaders/VO, wire telemetry taps for the refreshed debrief, and automate tutorial/extraction QA (see `docs/milestone-5-ux-audit.md`).

**Key Files (post-commit)**
- Shared schema: `packages/shared/src/index.ts`
- Server sim: `packages/server/src/index.ts`
- Client render loop & debug overlay: `packages/client/src/game/bootstrap.ts`, `packages/client/src/game/debugOverlay.ts`
- Client HUD: `packages/client/src/game/hud.ts`
- Networking client: `packages/client/src/game/network.ts`
- Styles: `packages/client/src/style.css`
- Dev helper runner: `scripts/dev-all.js`
- Art direction: `docs/art-style.md`
