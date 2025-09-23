# Milestone 5 UX Audit — Armory → Sortie → Extraction

## Objectives
- Align the client presentation with the depth of the meta systems introduced during milestones 3 and 4.
- Identify friction points that block new players from understanding loadouts, ready states, and extraction triggers.
- Produce a prioritized fix list that informs the remaining Milestone 5 polish passes (tutorial, shaders/audio, tooling).

## Snapshot Summary
- **Centered armory overlay** now pairs roster, mutators, preview stage, and launch flow in one frame with live readiness hints.
- **Hover/focus previews, loadout chips, and cosmetic tags** give immediate feedback on purchases in both the armory and in-match HUD.
- **First-session tutorials and tooltips** walk players through gearing, readying, launching, and understanding sorties without blocking repeat players.
- **Extraction beacons, toasts, and VFX/audio cues** broadcast availability, countdowns, and failures, with a new post-run debrief overlay summarising rewards.
- **Mutator drops now announce themselves** via HUD toasts and audio, keeping squad awareness aligned with the rotating rule set.

## Flow Findings & Actions

### Armory Hub
- Centered full-screen dialog keeps roster, mutators, preview stage, and launch controls glanceable. *(Shipped.)*
- Card affordances (slot chips, badges, hover/focus preview, live status copy) clarify what buying/equipping does. *(Shipped.)*
- HUD loadout chips mirror equipped upgrades/cosmetic in both the armory and sortie, closing the feedback loop between spend and build. *(Shipped.)*
- Cosmetic rigs remain authored server-side; art follow-up will swap the 3D hangar mesh once assets land. *(Follow-up tracked with art team.)*

### Sortie Prep & Combat
- Phase-aware tutorials now highlight Ready, Launch, and beacon behaviour on first encounter so the squad understands phase changes. *(Shipped.)*
- In-match HUD shows upgrade/cosmetic chips alongside augment summaries, so players recognise their armory build live. *(Shipped.)*
- Mutator activations trigger paired HUD toasts + audio so squads know what modifiers are active when a run spins up or rotates. *(Shipped.)*

### Extraction & Post-Run
- Extraction events now broadcast through beacon VFX, ambient beam pulses, HUD toasts, and dedicated audio cues for ready, abort, and success states. *(Shipped.)*
- Post-run debrief overlay lists wave, kills, duration, and per-player stats while the armory summary counts down. *(Shipped.)*
- Aborted extractions trigger guidance overlays reminding squads to re-ready before the countdown resumes. *(Shipped.)*

### Tutorial & Onboarding Hooks
- First-session overlays cover armory purchasing, Ready toggle expectations, and sortie launching; they persist only until acknowledged. *(Shipped.)*
- Combat reminder fires once per player, covering dash + ping wheel bindings after the first drop. *(Shipped.)*
- “What is a Sortie?” primer lives beside the armory preview for refreshers without blocking flow. *(Shipped.)*

### Visual & Audio Cohesion
- Extraction and mutator cues now have bespoke sweeps/chimes while existing phase-based ambience continues to reset between armory, combat, and summary. *(Shipped.)*
- Shader polish / VO remain scoped for the dedicated art + audio milestone; tracked separately from launch-ready UX. *(Follow-up.)*

## Verification & Playtest Notes
- Run `npm run dev --workspace=@farsight/client` and `npm run dev --workspace=@farsight/server` (or `npm run dev:all`).
- Enter the armory phase; overlay should auto-center with roster/mutators/preview visible.
- Hover or keyboard-focus any upgrade/cosmetic card; preview stage updates with slot badge, description, and status. Leave the card and preview reverts to loadout summary.
- Toggle ready in the HUD or via controller; launch hint reflects squad readiness and launch button arms when everyone is ready.

## Next Steps Feeding Milestone 5 Tracker
1. Fold the new armory/extraction tutorials into automated smoke checks so regressions surface early.
2. Partner with art to land cosmetic rig swaps inside the armory hangar now that the UX framing is in place.
3. Schedule VO + shader polish during the Audio/Visual milestone once asset budgets finalize.
4. Capture telemetry deltas for the new summary screen (feathers/augments) to verify post-run reward accuracy.
5. Playtest the beacon flow with a fresh squad to validate the new countdown guidance before locking Milestone 5 demos.

These findings are reflected in `roadmap.md` Milestone 5 and `context.md` so the whole team tracks dependencies while we land the remainder of the launch-ready polish.
