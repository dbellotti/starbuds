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
- Gameplay: Added `raccoon` ranged enemy and `coyote` miniboss with explosive shockwave telegraphs plus generous XP drops.
- Progression: Level-up augment picker with four augments, server-side stat modifiers, and HUD overlay for option selection + last augment summary.
- Feedback: New audio controller (lo-fi background loop, level-up & boss SFX), Key `V` camera tilt toggle mirrored in debug overlay and HUD tip.
- Rendering: Projectile/enemy avatar pooling with faction-tinted VFX, per-faction impact colors, and boss-scaled textures.
- Tooling: `npm run replay:snapshots` for offline snapshot analysis, level seed logging on server boot, HUD toasts for augment/boss events.
- Co-op quality of life: ready-check button syncs to server, teammate augment choices surface in roster, ping wheel (`Key Q`) echoes to the world and HUD, and objective tracker exposes wave progress, boss countdown, and extraction state.
- Visual foundations: biome-driven tile atlases, directional+ambient lighting, screen shake on player damage, shader-driven XP orbs, instanced biome props, and first-pass low-poly chicken/enemy meshes.

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
1. Milestone 2 party play: roster/ready panels, lightweight ping wheel, shared objective tracker UI.
2. Visual foundations: biome tile variants, dynamic lighting pass, art style guide for low-poly creatures.
3. Co-op UX: in-game chat/pings and surfacing augment choices to teammates.
4. Performance: GPU instancing for props, smoke-test automation, snapshot compression exploration.
5. Networking/QA: reconnect path, snapshot replay tooling integration into CI, expand test matrix across hardware/browser combos.

**Key Files (post-commit)**
- Shared schema: `packages/shared/src/index.ts`
- Server sim: `packages/server/src/index.ts`
- Client render loop & debug overlay: `packages/client/src/game/bootstrap.ts`, `packages/client/src/game/debugOverlay.ts`
- Client HUD: `packages/client/src/game/hud.ts`
- Networking client: `packages/client/src/game/network.ts`
- Styles: `packages/client/src/style.css`
- Dev helper runner: `scripts/dev-all.js`
- Art direction: `docs/art-style.md`
