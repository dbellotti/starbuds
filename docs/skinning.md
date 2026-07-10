# Skinning & Sprite Pipeline

Every character, enemy, attack, and effect in Starbuds renders from a single
**sprite atlas** described by a JSON **skin manifest**. Introducing a new look —
or an entirely new character/enemy/attack visual — means editing data, not
engine code.

The runtime lives in `packages/client/src/game/sprites/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | Manifest schema (this document's source of truth) |
| `defaultSkin.ts` | Built-in procedural skin; the reference implementation |
| `atlas.ts` | Binds a manifest + image into UV-resolved clips and one shared GPU texture |
| `batch.ts` | Instanced renderer — all sprites sharing the atlas draw in one call per layer |
| `animator.ts` | Clip playback |
| `loader.ts` | Skin selection, fetching, and partial-override merging |

## Activating a skin

1. **Playtest**: append `?skin=/skins/my-pack.json` to the game URL. Files in
   `packages/client/public/` are served at the site root.
2. **Build-time default**: set `VITE_SKIN_URL=/skins/my-pack.json` in `.env`.
3. Neither set → the built-in procedural skin is used.

Skins are **partial overrides**. Your manifest is merged over the default:
entities you define replace the default ones, everything else is inherited.
Your atlas image is composited into the shared atlas automatically, so you can
reskin only the player (or add one new enemy) with a tiny PNG.

## Manifest format

```jsonc
{
  "name": "my-pack",
  "image": "my-pack.png",          // optional; resolved relative to this file
  "frames": {
    // Named pixel rects inside my-pack.png
    "hero_idle_0": { "x": 0,  "y": 0, "w": 64, "h": 64 },
    "hero_idle_1": { "x": 64, "y": 0, "w": 64, "h": 64 }
  },
  "entities": {
    "player": {
      "animations": {
        "idle":   { "frames": ["hero_idle_0", "hero_idle_1"], "fps": 5 },
        "move":   { "frames": ["hero_idle_0", "hero_idle_1"], "fps": 12 },
        "attack": { "frames": ["hero_idle_1"], "fps": 14 }
      },
      "worldSize": { "width": 18, "height": 24 },
      "tintable": true
    }
  }
}
```

- `frames` may also reference the default skin's frames by name (they follow
  the pattern `<entity>_<clip>_<index>`, e.g. `enemy_fox_move_1`,
  `proj_boss_idle_0`, `cosmetic_suncrest_idle_0`). A manifest with no `image`
  at all is a valid "remix" skin that only retimes/resizes/reuses built-ins.
- `worldSize` is in world units (a screen is ~480 units tall). The default
  hero is 18×24; standard enemies are 20×20.
- `tintable: true` means the art is authored in light/neutral tones and the
  runtime multiplies a color over it (player colors, faction colors). Enemies
  in the default skin are fully colored and *not* tintable.
- `tint` (hex string) sets a base tint — the projectile entities use this so a
  skin can recolor an attack without new art.

## Entity keys

| Key | Used for | Required clips |
| --- | --- | --- |
| `player` | The hero, in-game + armory preview + styleguide | `idle`, `move`, `attack` |
| `enemy:<kind>` | `fox`, `hawk`, `snake`, `raccoon`, `coyote`, `weasel`, `owl` | `idle`, `move`, `windup` |
| `projectile:<faction>` | `player`, `enemy`, `boss` attack visuals | `idle` |
| `fx:impact`, `fx:telegraph`, `fx:reticle` | Shared effect quads (tinted at runtime) | `idle` |
| `cosmetic:<id>` | Armory cosmetic overlays (`cosmic-plumage`, `ember-sheen`, `midnight-veil`, `suncrest`) | `idle` |

Missing clips fall back to `idle`; missing entities fall back to the default
skin (with a one-time console warning), so a skin never hard-crashes the game.

Adding a **new enemy kind or cosmetic** end-to-end: add the gameplay id in
`packages/shared` / server as before, then give it a visual by adding an
`enemy:<kind>` (or `cosmetic:<id>`) entry — either in `defaultSkin.ts` or in a
skin manifest. No renderer changes are needed.

## Authoring rules (from `docs/art-style.md`)

- Sprites are **top-down**, authored facing *up* (the top of the frame is the
  direction of travel); the renderer rotates them to the entity's facing.
- 64×64 px frames are the norm; keep custom atlas images ≤ 1024 px wide.
- Clips loop at **8–12 fps** for the crunchy retro feel; windups get 2 frames
  with a readable flash.
- Palette-locked per biome; avoid pure black shadows (use `#1f2230`).
- Nearest-neighbor filtering is enforced — no need to pad for mip bleed, but
  keep 1px of transparent margin inside each frame rect.

## Previewing

- `packages/client/styleguide.html` (`npm run dev` → `/styleguide.html`) shows
  any entity at high zoom with a per-clip filmstrip, tint/cosmetic/upgrade
  controls, and drag-to-rotate. Add `?skin=...` there too.
- The armory preview in-game renders the same `player` entity, so equipping
  cosmetics exercises the identical data path.

An example remix pack ships at `packages/client/public/skins/example-remix.json`
(`?skin=/skins/example-remix.json`).
