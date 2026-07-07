# Repository Guidelines

## Project Structure & Module Organization
- Monorepo rooted here with workspace-managed packages.
- `packages/server/`: Node.js authoritative simulation, websocket transport, procedural generation utilities.
- `packages/client/`: Vite-driven Three.js client, HUD, input, and networking bridge.
- `packages/shared/`: Cross-runtime TypeScript definitions (protocol, constants, level tooling).
- `scripts/`: Local developer helpers (e.g., combined dev runner). Extend here when adding workflow automation.
- `packages/**/src/` hosts source; keep new assets adjacent to their consumers. Stash design docs or one-off tools under `docs/` or `tools/` if created.
- `docs/art-style.md` collects texture + low-poly direction; skim before shipping new biome work.
- Client camera/debug hotkeys live in `packages/client/src/game/bootstrap.ts`; remember Key `V` toggles view and the HUD tip mirrors expectations.
- Level-up UI and toast feedback are owned by `packages/client/src/game/hud.ts`; prefer calling its helpers (`presentLevelUp`, `showAugmentToast`, `showBossSpawn`) instead of manipulating DOM directly. Build and artifact indicators also live here—update the HUD helpers when adding new VFX/UI signals.
- Armory HUD logic lives in `packages/client/src/game/hud.ts` with styling in `packages/client/src/style.css`; the milestone 5 pass centers the overlay, adds preview stages via hover/focus events, and is documented in `docs/milestone-5-ux-audit.md`.

## Build, Test, and Development Commands
- `npm run dev --workspace=@starbuds/server`: starts the tick loop and websocket server (respects `LEVEL_SEED`).
- `npm run dev --workspace=@starbuds/client`: launches the browser client with hot reload.
- `npm run dev:all`: spawns both client and server watchers (uses `scripts/dev-all.js`). Ctrl+C stops both processes.
- `npm run typecheck --workspaces`: runs TypeScript in no-emit mode across all packages; use before commits.
- `npm run replay:snapshots -- <file.json>`: summarises recorded `WorldSnapshot` logs to inspect tick cadence, counts, and boss waves.
- `npm run telemetry:summary -- <logfile>`: parses server `[telemetry]` console output into aggregate damage/xp/augment/artifact totals for quick balance reads.
- `npm run matchmaking:test`: spins up a handful of simulated clients, toggles ready state in the armory, and exercises reconnect flows.
- `npm run replay:inputs -- <file.json>`: plays back recorded input streams frame-by-frame against a live server, useful for regression hunting.
- `npm run smoke`: spins up the authoritative server and verifies a headless websocket client can join + receive snapshots.
- `npm run perf:fps`: builds the client, runs `vite preview`, and captures a short FPS sample via Puppeteer (Chrome headless).
- `npm run lint` / `npm run lint:fix`: ESLint + Prettier across all workspaces.
- Prefer `rg` for repo searches (`rg "EnemyAvatar" packages`).
- Copy `.env.example` to `.env` when you need to override local ports or client server origin. `VITE_SERVER_ORIGIN` wins, otherwise the client targets the current hostname with `VITE_SERVER_PORT` (default `7777`).

## Coding Style & Naming Conventions
- TypeScript everywhere; keep `strict` semantics. Modules use ES syntax with named exports where feasible.
- Indent with two spaces, terminate statements, and stay ASCII unless assets demand otherwise.
- Name files and symbols descriptively: `camelCase` for functions/vars, `PascalCase` for types/classes, `kebab-case` for files.
- Three.js materials and simulation constants live in `shared`; avoid duplicating magic numbers on client/server.
- Procedural textures are authored in code; cache reusable `CanvasTexture` instances rather than re-creating per frame. Biome tiles pack into a runtime atlas via `createBiomeMaterials`; reuse the helper when adding new atlas tiles.
- Characters/enemies/attacks/FX render through the sprite skin pipeline (`packages/client/src/game/sprites/`, documented in `docs/skinning.md`). Add or reskin content by editing the skin manifest (or `defaultSkin.ts` painters) — do not add per-entity meshes/materials to the render loop; submit to the shared `SpriteBatch` layers instead.
- Audio must be gated behind a user gesture (see `createAudioController`) to satisfy browser autoplay policies. Combat intensity now ramps through `audio.setIntensity`, and phase changes call `audio.setPhase`.
- ESLint (`.eslintrc.cjs`) + Prettier (`.prettierrc.json`) guard formatting. Run `npm run lint:fix` before long diff reviews.

## Testing Guidelines
- Current safety net is TypeScript typechecking; integration playtests rely on running both dev servers simultaneously.
- If adding automated tests, collocate under `packages/<name>/tests/` and wire them into an npm script so `npm run test --workspaces` can evolve. For deterministic repros, capture input traces and replay via `npm run replay:inputs`.
- Use deterministic seeds (`LEVEL_SEED=123`) when reproducing bugs.
- Leverage the in-game debug overlay (FPS, ping, tick drift) to verify performance budgets during playtests.
- For quick confidence, `npm run smoke` hits the authoritative server with a headless bot, and `npm run perf:fps` reports short FPS samples after a cold start.
- When verifying the armory UX, check that hovering/focusing upgrade or cosmetic cards updates the central preview and readiness hint, matching the checklist in `docs/milestone-5-ux-audit.md`.
- New armory/tutorial/extraction beats ship with the Milestone 5 pass—use `docs/milestone-5-ux-audit.md` as the regression checklist (tutorial overlays, extraction beacon VFX/audio, mutator toasts, post-run debrief).

## Commit & Pull Request Guidelines
- Commit messages: through and explanatory but concise.
- Bundle related changes; keep diff focused on one concern (simulation, rendering, HUD, etc.).
- Pull requests should include: concise summary, verification steps (`npm run typecheck`, dev server smoke test), and screenshots or clips for visible changes.
- Link Tailscale or deployment notes if networking adjustments are involved.

## Security & Configuration Tips
- Treat server port (default `7777`) as configurable via `.env` (`VITE_SERVER_PORT`) or process vars; never hard-code secrets. Armory/ready signaling is phase-aware (`context: 'armory' | 'extraction'`); daily/weekly mutators rotate server-side without redeploys.
- The client auto-derives the websocket host from the current page. Override `VITE_SERVER_ORIGIN` only when tunnelling through a proxy domain.
- Test remote clients through Tailscale tunnels before claiming multiplayer readiness.
