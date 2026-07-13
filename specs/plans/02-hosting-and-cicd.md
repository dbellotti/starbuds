# Plan 02 — Demo Hosting & CI/CD

Goal: every merge to `main` automatically deploys a playable demo at a stable URL
(e.g. `https://starbuds.fly.dev`) that friends can open in a browser and play together —
no Tailscale, no local server, no manual steps.

## Constraints that shape the design

- **The server is stateful and single-instance.** One authoritative world, 60 Hz tick
  loop, all state in memory (`packages/server/src/index.ts`). No horizontal scaling,
  no serverless — we need one long-lived Node process.
- **WebSockets are the transport.** That rules out purely static hosts (GitHub Pages,
  Cloudflare Pages, Netlify, Vercel) as a complete solution — they could serve the
  client but not the game server, forcing a split deployment with CORS/origin config.
- **Friends-scale, hobby budget.** A handful of concurrent players, played in bursts.
  Idle most of the time, so scale-to-zero (or near-zero cost) matters more than uptime.
- **Latency matters** (action game). Pick one region close to the friend group.

## Architecture: one container, one URL

Ship the built Vite client and the game server in a single container. The server
already fronts its WebSocket with a Node HTTP server (`index.ts:2060`), so it just
needs a small static-file handler to serve the client bundle. Then:

- One URL to share; HTTPS/WSS terminated by the host's proxy.
- Same-origin WebSocket — no CORS, no baked-in server hostname, no `VITE_SERVER_ORIGIN`.
- Client and server versions always deploy atomically (protocol version can never skew).

Two small code changes enable this:

1. **Server: serve static files.** Extend the existing `createServer` handler to serve
   files from a directory given by `CLIENT_DIST` (defaulting to unset → current
   plain-text response, so local dev is unchanged). ~40 lines or a tiny dep like `sirv`.
   Include a `/healthz` route for the host's health checks.
2. **Client: true same-origin fallback.** `packages/client/src/config.ts` falls back to
   `window.location.hostname` but hard-codes port `7777`. Treat an explicitly-empty
   `VITE_SERVER_PORT` as "use the page's own port", and build the production bundle
   with `VITE_SERVER_PORT=""`. Local dev keeps the `7777` default.

Deploys restart the server, which drops any in-flight run — acceptable for a demo
("the demo restarts when we merge"). A graceful-drain broadcast can come later.

## Hosting provider: Fly.io (recommended)

| Provider | WebSockets | Idle cost | Notes |
|---|---|---|---|
| **Fly.io** ✅ | First-class | ~$0 (auto-suspend) | Single `fly.toml`, official GitHub Action, region pinning, machine suspends when no connections and cold-starts in ~1 s on the next visit. Pay-as-you-go, ~$2–3/mo worst case for a `shared-cpu-1x` 256 MB machine running 24/7. |
| Railway | Yes | $5/mo minimum | Simplest dashboard UX; hobby plan is a flat fee. |
| Render | Yes | Free tier | Free instances sleep after 15 min with ~1 min cold starts and monthly hour caps; $7/mo to keep warm. |
| VPS (Hetzner etc.) + Docker | Yes | ~€4/mo | Cheapest raw compute, most ops burden (TLS, updates, deploy plumbing). |

Fly wins for this use case: real long-lived process, WebSocket-native, effectively free
while idle, and deploys are one CLI call that CI can run. Render's free tier is the
zero-dollar fallback if the ~$2/mo isn't wanted — the only downside is the cold start.

Region: pick the Fly region nearest the group (e.g. `sea`/`lax`/`ord` for US,
`ams`/`fra` for EU) in `fly.toml`.

## Deliverables (implementation checklist)

### Repo changes

- [x] `packages/server`: static-file serving behind `CLIENT_DIST`
  (`src/staticFiles.ts`), plus `/healthz`.
- [x] `packages/client/src/config.ts`: empty `VITE_SERVER_PORT` → same-origin port.
- [x] `Dockerfile` (multi-stage, `node:22-slim` to match devbox's Node 22):
  1. `npm ci` with the full workspace.
  2. `npm run build --workspace=@starbuds/client` with `VITE_SERVER_PORT=""`;
     bundle budgets already gate this.
  3. Runtime stage: production deps only (`npm ci --omit=dev`), server + shared
     sources, client `dist/` at `CLIENT_DIST`, `CMD tsx packages/server/src/index.ts`.
     The server runs from source via `tsx` (now a production dependency) because
     `@starbuds/shared` only ships `.ts` sources — the `tsc` output was never
     runnable under plain Node — and `tsx` is already how dev and the smoke test
     run the server.
- [x] `fly.toml`: `internal_port = 7777`, HTTPS handlers, health check on `/healthz`,
  `auto_stop_machines = "suspend"`, `auto_start_machines = true`,
  `min_machines_running = 0`, chosen primary region.
- [x] `.dockerignore` (node_modules, logs, specs, docs).
- [x] Fix `npm run smoke`: it hard-coded `protocol: 3` and broke when
  `NETWORK_PROTOCOL_VERSION` became 4 — it now runs under `tsx` and imports the
  constant from `@starbuds/shared`, and waits for the expected message type
  instead of assuming it arrives first.

### GitHub Actions

- [x] `.github/workflows/ci.yml`, `checks` job — on every PR and push to `main`:
  Node 22 + npm cache → `npm ci` (with `PUPPETEER_SKIP_DOWNLOAD`) → `npm run lint`
  → `npm run typecheck` → `npm run build` → `npm run smoke`.
- [x] `.github/workflows/ci.yml`, `deploy` job — push to `main` only, `needs: checks`:
  `superfly/flyctl-actions/setup-flyctl` → `flyctl deploy --remote-only`
  (builds the Docker image on Fly's builders, so CI stays fast).
  `concurrency: deploy-production` with `cancel-in-progress: false` so rapid
  merges queue instead of racing; `FLY_API_TOKEN` from repo secrets.

### One-time manual setup (account owner)

1. Create a Fly.io account, install `flyctl`.
2. `fly apps create starbuds` (or another free name — it becomes `<name>.fly.dev`).
3. `fly tokens create deploy -x 999999h` → save as the `FLY_API_TOKEN` repo secret
   (GitHub → Settings → Secrets and variables → Actions).
4. First deploy can be run locally (`fly deploy`) or by merging the workflow.

## Later niceties (out of scope for the first pass)

- **Build stamp in the HUD/debug overlay**: inject the git SHA at build time
  (`VITE_BUILD_SHA`) so playtesters can report "which build".
- **PR preview apps**: Fly supports per-PR ephemeral apps via a review-apps workflow
  if we ever want to try branches before merge.
- **Fold `matchmaking:test` and `replay:inputs` into CI** once snapshots stabilize
  (already tracked as an open thread in `context.md`).
- **Graceful deploys**: broadcast a "server restarting" toast and delay shutdown
  briefly on SIGTERM instead of dropping runs mid-wave.
- **Telemetry off-box**: ship `telemetry:summary` output somewhere persistent, since
  the machine's disk is ephemeral across deploys.
