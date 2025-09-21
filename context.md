**Farsight Dev Log**

**Project Snapshot**
- Top-down multiplayer action roguelite; Three.js client + Node.js `ws` server; procedural levels, Helldivers-inspired pacing.
- Tailscale-friendly: one host server, browser-only clients, pixel-but-HD presentation.
- Shared TypeScript workspace (`packages/{client,server,shared}`) with strict typing and monorepo tooling.

**Implemented Foundations**
- Authoritative Node server: deterministic tick loop (`60 Hz`), procedural level generator (random-walk caverns, spawn ring), player/enemy state sync via JSON websockets.
- Client renderer: orthographic camera, instanced tile meshes, smooth avatar interpolation, pointer-driven aiming, pixel aesthetic with custom shader-lite polish.
- Networking: hello/welcome handshake with protocol guard, input → server → snapshot flow, ping keep-alive, client-side reconciliation hooks.

**Recent Feature Pass (committed)**
- Combat loop: psychic bolts (cooldowns, speed, TTL), enemy damage/death, XP orbs with age decay, wave tuning by player count.
- Progression data: `PlayerState` now includes name, level, health, XP, thresholds; server levels players and regenerates health on level-up.
- HUD overlay: health/XP bars, level/name display, basic control tips; ambient decor (backdrop radial gradient, spawn glow, particles); projectile/XP visuals with additive blending.

**Run / Verify**
- `npm run dev --workspace=@farsight/server`
- `npm run dev --workspace=@farsight/client`
- Optional: `LEVEL_SEED=<int> npm run dev --workspace=@farsight/server`
- Sanity: `npm run typecheck --workspaces` (clean)

**Open Threads / Next Steps**
1. Enemy attacks & player damage intake; knockback/iframes to exercise health bar.
2. Level-up feedback (VFX, ability unlocks, upgrade UI); track XP orbs in client to trigger SFX.
3. Roster UI (all players with levels), chat/ping scaffolding, and enemy telegraphing.
4. Procedural refinement: room themes, decor props, spawn logic for bosses.
5. Networking polish: delta compression, rollback experimentation, resilient reconnect.

**Key Files (post-commit)**
- Shared schema: `packages/shared/src/index.ts`
- Server sim: `packages/server/src/index.ts`
- Client render loop: `packages/client/src/game/bootstrap.ts`
- Client HUD: `packages/client/src/game/hud.ts`
- Networking client: `packages/client/src/game/network.ts`
- Styles: `packages/client/src/style.css`
