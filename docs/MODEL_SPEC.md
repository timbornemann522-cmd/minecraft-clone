# MODEL_SPEC

Mob geometry follows Minecraft Java Edition box models exactly. One model
pixel = 1/16 block. Model space: y up, origin at ground between the feet,
+Z forward (the mob faces +Z; the game yaws the whole rig to the move
direction).

The machine-readable source of truth is `tools/blender/model_defs.py`. The
Blender factory (`tools/blender/build_models.py`) builds each part as a box
with Minecraft box-UV unwrapping (identical to Blockbench "Box UV"): for a box
of w x h x d at skin offset (u, v):

```
up    (u + d,     v,       w, d)
down  (u + d + w, v,       w, d)
right (u,         v + d,   d, h)
front (u + d,     v + d,   w, h)   <- the face, +Z
left  (u + d + w, v + d,   d, h)
back  (u + d + w + d, v + d, w, h)
```

Left limbs on classic 64x32 skins reuse the right-limb UVs mirrored. Limbs
rotate around pivot empties named `PART_piv`; the game animates those nodes
procedurally (`src/render/mobview.ts`).

## Player / Zombie (64x64 skin)

| Part | Size px | Center y | Pivot | Skin tex |
| --- | --- | --- | --- | --- |
| head | 8x8x8 | 28 | (0, 24, 0) | (0, 0) |
| body | 8x12x4 | 18 | (0, 12, 0) | (16, 16) |
| arm_r | 4x12x4 | 18 | shoulder | (40, 16) |
| arm_l | 4x12x4 | 18 | shoulder | (32, 48) |
| leg_r | 4x12x4 | 6 | hip | (0, 16) |
| leg_l | 4x12x4 | 6 | hip | (16, 48) |

Hitbox 0.6 x 1.95 (zombie), eye 1.74. First-person hand is a separate
`arm.png` sprite.

## Skeleton (64x32 skin)

Same layout as the humanoid with thin limbs: arms 2x12x2, legs 2x12x2,
mirrored left limbs. Bow quad (8x16 px) parented to `arm_r`, skin rect
(48, 0). Hitbox 0.6 x 1.99.

## Creeper (64x32 skin)

| Part | Size px | Center y | Pivot | Skin tex |
| --- | --- | --- | --- | --- |
| head | 8x8x8 | 22 | (0, 18, 0) | (0, 0) |
| body | 8x12x4 | 12 | (0, 11, 0) | (16, 16) |
| leg_fl / fr / bl / br | 4x6x4 | 3 | top of leg | (0, 16) shared |

Leg centers x = -2.5 / +2.5, z = +4.5 / -4.5. Hitbox 0.6 x 1.7. Signature
face painted on the front rect (8, 8, 8, 8).

## Spider (64x64 skin)

| Part | Size px | Center | Skin tex |
| --- | --- | --- | --- |
| body | 10x8x12 | (0, 9, -3) | (0, 0) |
| head | 8x8x8 | (0, 9, 7) | (0, 20) |
| legs x8 | 16x2x2 | hubs at (+-5, 9, z) z in 2.5/0.5/-1.5/-3.5 | (0, 36) shared |

Legs default fan yaw 48/16/-16/-48 degrees outward, tilt 10 degrees down.
Hitbox 1.4 x 0.9.

## Pig (64x32 skin)

| Part | Size px | Center | Skin tex |
| --- | --- | --- | --- |
| body | 10x16x8 unrotated, mesh rot X 90 | (0, 10, 0) | (28, 8) |
| head | 8x8x8 | (0, 11, 10) | (0, 0) |
| snout | 4x3x1 | (0, 10, 14.5) | (18, 16) |
| legs x4 | 4x6x4 | (+-3, 3, +-6) | (0, 16) shared |

Hitbox 0.9 x 0.9.

## Cow (64x32 skin)

| Part | Size px | Center | Skin tex |
| --- | --- | --- | --- |
| body | 12x18x10 unrotated, mesh rot X 90 | (0, 17, 0) | (18, 4) |
| head | 8x8x8 | (0, 18, 11) | (0, 0) |
| horn_r / horn_l | 1x2x2 angled | head top | (34, 0) |
| legs x4 | 4x12x4 | (+-4, 6, +-7) | (0, 16) shared |

Hitbox 0.9 x 1.4.

## Sheep (64x32 skin + 64x32 fur skin)

Skin boxes: body 10x16x8 unrotated (mesh rot X 90) at (28, 8), head 6x6x6 at
(0, 0), legs 4x12x4 shared at (0, 16). Wool layer (`sheep_fur.png`, separate
material): fur_body 12x10x18 visual (uv 10x16x8) at (28, 8), fur_head 8x8x8
(uv 6x6x6) at (0, 0), fur legs 6x10x6 (uv 4x12x4) at (0, 16). Fur nodes are
toggled per individual (random coat at spawn). Hitbox 0.9 x 1.3.

## Chicken (64x32 skin)

| Part | Size px | Center | Skin tex |
| --- | --- | --- | --- |
| body | 6x8x6 | (0, 7, -0.5) | (0, 9) |
| head | 4x6x3 | (0, 13, 2.5) | (0, 0) |
| beak | 2x2x1 | head front | (14, 0) |
| wing_r / wing_l | 1x4x6 | (+-3.5, 8, -0.5) | (24, 0) |
| legs | 1x5x1 | (+-1.5, 1.5, 0) | (40, 0) |

Whole model root scale 0.75. Hitbox 0.4 x 0.7.

## Animation contract

Node names in every GLB (the game depends on them):

- Humanoids: `head_piv`, `body_piv`, `arm_r_piv`, `arm_l_piv`, `leg_r_piv`, `leg_l_piv`
- Creeper: `head_piv`, `body_piv`, `leg_fl_piv`, `leg_fr_piv`, `leg_bl_piv`, `leg_br_piv`
- Quadrupeds: `head_piv`, `body_piv`, `leg_fl_piv`, `leg_fr_piv`, `leg_bl_piv`, `leg_br_piv`
  (pig adds `snout_piv`, cow adds `horn_r_piv`, `horn_l_piv`; sheep adds `fur_*_piv`)
- Spider: `head_piv`, `body_piv`, `leg_l0_piv` ... `leg_r3_piv`
- Chicken: `head_piv`, `body_piv`, `beak_piv`, `wing_r_piv`, `wing_l_piv`, `leg_r_piv`, `leg_l_piv`
- Skeleton adds a static `bow` quad under `arm_r_piv`

Walk amplitude 0.7 rad scaled by speed, head yaw clamped to 63 degrees,
pitch clamped to about 35 degrees, attack pose lifts `arm_r` to -2.2 rad,
creeper fuse pulses scale and whitens all materials.
