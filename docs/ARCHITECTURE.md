# ARCHITECTURE

## Big picture

```
input -> fixed-step simulation (60 Hz) -> three.js render (per frame)
                |
   +------------+------------+--------------+
   |            |            |              |
 world       player       mobs/AI      projectiles/drops
   |            |            |
 chunk mesh  physics/     FSM + steering
 streaming   mining       + procedural GLB animation
```

TypeScript + Vite + Three.js. No game framework, no ECS - small classes with
a single `Game` orchestrator (`src/main.ts`).

## Voxel world (src/core/)

- **Chunk**: 16x16x16 `Uint8Array` of block ids. World height 128
  (8 chunk layers). `World.chunks` is a sparse map keyed `cx,cy,cz`.
- **Generation** (`world.ts`): deterministic per seed.
  - height: 4-octave Perlin fbm + ridged mountain mask gated by a second noise,
  - biome: temperature/humidity Perlin -> plains, forest, desert, snowy,
    mountains (height-gated),
  - caves: cheese rooms (`fbm3 > 0.26`) plus spaghetti tunnels
    (`|fbm3| < 0.045`), never flooded - water only fills columns whose
    surface is below sea level,
  - ores: per-block hash scatter by depth band (diamond <= 12, gold <= 20,
    iron <= 42, coal <= 68, gravel patches),
  - decoration: deterministic per surface column (oak trees sized 4-6 with
    leaf blob, cacti, flowers, tall grass). Decorations may cross chunk
    borders; `setGen` generates the neighbor chunk so tree canopies merge.
  - player edits are stored as a global `x,y,z -> id` diff map and replayed on
  top of generated chunks (this is also the save format).
- **Lighting**: no flood-fill light engine. Sky light is computed per column
  (falloff below the column top, so caves and under-canopy go dark) and baked
  into vertex colors together with classic 3-neighbor vertex AO and the
  vanilla-ish face brightness (top 1.0, north/south 0.8, east/west 0.6,
  bottom 0.5). Night multiplies the whole material color instead.
- **Mesher** (`mesher.ts`): per-chunk BufferGeometry, hidden-face culling
  against neighbor blocks (cross-chunk safe via `getBlockNoGen`), separate
  transparent water geometry, X-quads for plants. Dirty-flag rebuild with a
  per-frame budget; far chunks are disposed.
- **Physics** (`physics.ts`): axis-separated AABB vs voxels with 0.55 auto
  step-up and a ground probe. Shared by player, mobs, drops, arrows, TNT.

## Rendering (src/render/)

- Two materials over one atlas (256x256, 16x16 tiles): opaque alphaTest 0.4
  (covers cutout leaves/glass/plants too) and translucent water. Nearest
  filtering, no mipmaps, all shading pre-baked - this is what keeps the
  Minecraft look with zero shaders.
- **Sky** (`sky.ts`): 10-minute day. Pixel sun/moon quads counter-rotated to
  the camera at 180 units, scrolling cloud slab at y=96, background/fog color
  derived from sun elevation.
- **Particles**: 300-mesh billboard pool for break debris, explosion flame
  and smoke.
- **MobView** (`mobview.ts`): GLTFLoader per species (preloaded at boot),
  `Object3D.clone(true)` per individual with per-instance material clones.
  Animation is pure transform work on the `_piv` nodes - no AnimationClips.

## Entities (src/entities/)

- **Player**: vanilla-faithful constants (see CONTROLS.md). Survival stats:
  health, hunger, air, fall tracking, regen/starve. Mining uses per-block
  hardness x tool speed with tier gating (`canHarvest`); crack overlay is an
  inflated box re-UVed to `destroy_0..9`.
- **Mob** (`mob.ts`): one class, per-species AI methods sharing steering
  (`steerTo`: seek + jump-up-1 + optional ledge avoidance), perception
  (`canSee`: voxel raycast within aggro range), memory timers and herd alert
  hooks. Behavior summary:
  - zombie: chase 40-block LOS memory, 1 s melee, alerts other zombies in 16
    blocks, burns in full sun with flames,
  - skeleton: 8-12 block kiting band, strafes orbitally, 1.2 s draw with
    ballistic lead-prediction shots, flees under 5 blocks, burns in sun,
  - creeper: silent approach under 16 blocks, 2.5-block fuse trigger, 1.5 s
    hiss with 8 Hz white flash and scale pulse, 50 percent abort chance if
    the target breaks away, explosion crater radius 3 (stone rims turn to
    cobble, ores and bedrock immune) with falloff damage and knockback,
  - spider: neutral by day, aggressive at night or when hurt, wall climbing
    when blocked under an elevated target, 3-5 block pounce leap,
  - pig/cow/sheep: wander with herd-safe steering, 8 s panic flee on damage,
    sheep wear a random wool coat,
  - chicken: wander with random flap-jumps and slow fall.
- Spawning every 2 s: hostiles in darkness (night surface or y < 42), groups
  of the classic mix (zombie/skeleton/creeper/spider); passives on grass in
  daylight. Spawn ring 26-50 blocks from the player, entity cap 40, despawn
  beyond 80 blocks.
- **drops.ts**: item drops (bobbing sprites, 0.5 s pickup delay, 240 s life),
  arrows (gravity 20, sticks in blocks, 60 s life), primed TNT (4 s flash
  fuse, chain-ignites).

## UI (src/ui/)

Everything is either DOM or canvas-painted with the embedded 5x7 bitmap font
(`font.ts`). HUD canvas stack: hotbar + selector, hearts + hunger + air
bubbles, first-person arm + held item, item-name popup, red damage flash.
Screens (title/pause/death/options) are DOM with pixel-styled buttons.

## Audio (src/audio/sfx.ts)

All sounds are WebAudio graphs created on demand: filtered noise bursts for
steps/dig/break/explosion/hiss, square/triangle envelopes for animal calls
and hurt grunts. Master volume in Options. Audio starts on first user gesture
(browser policy).

## Persistence (src/core/save.ts)

`localStorage["blockcraft_save_v1"]` = seed + play time + edit diff map +
player snapshot. Autosave every 30 s and on pause/quit/death.

## Testing

`node tools/test/smoke.mjs` bundles the pure core with esbuild and asserts:
terrain ranges, five biomes, bedrock, ores, dry caves, block edits, chunk
mesh attribute integrity, registry completeness against the atlas, and GUI
rects. `npm run build` is the typecheck + production bundle.
