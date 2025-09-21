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

**Recent Feature Pass (committed)**
- Combat loop: psychic bolts (cooldowns, speed, TTL), enemy damage/death, XP orbs with age decay, wave tuning by player count.
- Progression data: `PlayerState` now includes name, level, health, XP, thresholds; server levels players and regenerates health on level-up.
- HUD overlay: health/XP bars, level/name display, basic control tips; ambient decor (backdrop radial gradient, spawn glow, particles); projectile/XP visuals with additive blending.

**Baseline Polish (completed)**
- Visual: Procedurally generated chicken/enemy textures applied to billboards, additive projectile trails, pooled impact bursts, and harm flicker tuning.
- Feedback: Enemy telegraph-driven targeting markers, HUD damage flash, ping/tick drift debug overlay, smoother camera height for wider arena view.
- Tooling: Added `.env.example` defaults and `npm run dev:all` runner for synchronized dev servers; network layer now exposes live latency metrics.

**Run / Verify**
- `npm run dev --workspace=@farsight/server`
- `npm run dev --workspace=@farsight/client`
- `npm run dev:all` (combined watcher for client + server)
- Optional: `LEVEL_SEED=<int> npm run dev --workspace=@farsight/server`
- Sanity: `npm run typecheck --workspaces` (clean)
- Copy `.env.example` → `.env` to override ports or server origin locally.

**Open Threads / Next Steps**
1. Milestone 1 gameplay: introduce ranged enemy variant, miniboss encounter, and level-up augment picker.
2. UX polish: expand HUD with level-up summary, layer in level-up/boss SFX, iterate on projectile and impact VFX cadence.
3. Co-op utilities: design roster/ready panels, lightweight ping wheel, and shared objective tracker.
4. Visual foundations: begin biome tile set exploration, dynamic lighting prototype, author art bible for upcoming 3D transition.
5. Performance & networking: instrument WebGL allocations, plan enemy pooling/server replay tooling, evaluate snapshot delta compression.

**Key Files (post-commit)**
- Shared schema: `packages/shared/src/index.ts`
- Server sim: `packages/server/src/index.ts`
- Client render loop & debug overlay: `packages/client/src/game/bootstrap.ts`, `packages/client/src/game/debugOverlay.ts`
- Client HUD: `packages/client/src/game/hud.ts`
- Networking client: `packages/client/src/game/network.ts`
- Styles: `packages/client/src/style.css`
- Dev helper runner: `scripts/dev-all.js`
