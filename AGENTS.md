# Repository Guidelines

## Project Structure & Module Organization
- Monorepo rooted here with workspace-managed packages.
- `packages/server/`: Node.js authoritative simulation, websocket transport, procedural generation utilities.
- `packages/client/`: Vite-driven Three.js client, HUD, input, and networking bridge.
- `packages/shared/`: Cross-runtime TypeScript definitions (protocol, constants, level tooling).
- `packages/**/src/` hosts source; keep new assets adjacent to their consumers. Stash design docs or one-off tools under `docs/` or `tools/` if created.

## Build, Test, and Development Commands
- `npm run dev --workspace=@farsight/server`: starts the tick loop and websocket server (respects `LEVEL_SEED`).
- `npm run dev --workspace=@farsight/client`: launches the browser client with hot reload.
- `npm run typecheck --workspaces`: runs TypeScript in no-emit mode across all packages; use before commits.
- Prefer `rg` for repo searches (`rg "EnemyAvatar" packages`).

## Coding Style & Naming Conventions
- TypeScript everywhere; keep `strict` semantics. Modules use ES syntax with named exports where feasible.
- Indent with two spaces, terminate statements, and stay ASCII unless assets demand otherwise.
- Name files and symbols descriptively: `camelCase` for functions/vars, `PascalCase` for types/classes, `kebab-case` for files.
- Three.js materials and simulation constants live in `shared`; avoid duplicating magic numbers on client/server.

## Testing Guidelines
- Current safety net is TypeScript typechecking; integration playtests rely on running both dev servers simultaneously.
- If adding automated tests, collocate under `packages/<name>/tests/` and wire them into an npm script so `npm run test --workspaces` can evolve.
- Use deterministic seeds (`LEVEL_SEED=123`) when reproducing bugs.

## Commit & Pull Request Guidelines
- Commit messages: short, present/imperfect imperative (e.g., `Add enemy attack telegraphs`).
- Bundle related changes; keep diff focused on one concern (simulation, rendering, HUD, etc.).
- Pull requests should include: concise summary, verification steps (`npm run typecheck`, dev server smoke test), and screenshots or clips for visible changes.
- Link Tailscale or deployment notes if networking adjustments are involved.

## Security & Configuration Tips
- Treat server port (default `7777`) as configurable via `.env` or process vars; never hard-code secrets.
- Test remote clients through Tailscale tunnels before claiming multiplayer readiness.
