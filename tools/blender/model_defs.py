#!/usr/bin/env python3
"""BLOCKCRAFT mob geometry - single source of truth for MODEL_SPEC.md.

All sizes/positions in Minecraft model pixels (1 px = 1/16 block).
Coordinate space: y up, origin at ground between feet, +Z forward (mob faces +Z).
UV offsets match Minecraft box UV (see face_rects in gen_textures.py).
Body boxes of quadrupeds use the vanilla trick: the UNROTATED box is
unwrapped, then the mesh carries a 90 degree X rotation.
"""
import math
from dataclasses import dataclass, field

RX90 = (math.pi / 2, 0.0, 0.0)


@dataclass
class Part:
    name: str          # node name used by the game animator (mobview.ts)
    size: tuple        # (x, y, z) visual box in model pixels
    center: tuple      # box center in model px (ground origin, +Z forward)
    pivot: tuple       # rotation pivot in model px
    tex: tuple         # (u, v) offset on the skin map
    mirror_uv: bool = False   # left limbs on classic skins reuse right UVs
    rot: tuple = (0.0, 0.0, 0.0)   # default rotation (radians) on the pivot
    parent: str = "body"
    mesh_rot: tuple = (0.0, 0.0, 0.0)  # baked mesh rotation (quadruped bodies)
    uv_size: tuple = ()   # UV box size when geometry is inflated (wool)


@dataclass
class Quad:
    name: str          # flat item quad (e.g. skeleton bow)
    size: tuple        # (w, h) in px
    center: tuple      # quad center in model px
    parent: str
    tex: tuple         # (u, v) top-left of the w x h rect on the skin
    rot: tuple = (0.0, 0.0, 0.0)


@dataclass
class Model:
    name: str
    skin: str            # texture file in assets/textures/skins/
    tex_size: tuple      # (w, h)
    scale: float = 1.0
    parts: list = field(default_factory=list)
    quads: list = field(default_factory=list)
    fur: list = field(default_factory=list)   # extra wool parts (sheep)
    fur_skin: str = ""


def humanoid(name, skin, tex_size, arm_w=4, leg_w=4):
    """Player/zombie-style biped. Legs 12px, body 12px, head 8px."""
    mirror = tex_size[1] == 32   # classic skins mirror left limbs
    left_arm_tex = (40, 16) if mirror else (32, 48)
    left_leg_tex = (0, 16) if mirror else (16, 48)
    parts = [
        Part("body", (8, 12, 4), (0, 18, 0), (0, 12, 0), (16, 16)),
        Part("head", (8, 8, 8), (0, 28, 0), (0, 24, 0), (0, 0)),
        Part("arm_r", (arm_w, 12, arm_w), (-4 - arm_w / 2, 18, 0),
             (-4 - arm_w / 2, 23.5, 0), (40, 16)),
        Part("arm_l", (arm_w, 12, arm_w), (4 + arm_w / 2, 18, 0),
             (4 + arm_w / 2, 23.5, 0), left_arm_tex, mirror_uv=mirror),
        Part("leg_r", (leg_w, 12, leg_w), (-leg_w / 2, 6, 0),
             (-leg_w / 2, 12, 0), (0, 16)),
        Part("leg_l", (leg_w, 12, leg_w), (leg_w / 2, 6, 0),
             (leg_w / 2, 12, 0), left_leg_tex, mirror_uv=mirror),
    ]
    return Model(name, skin, tex_size, parts=parts)


MODELS = {}

MODELS["zombie"] = humanoid("zombie", "zombie.png", (64, 64))

MODELS["skeleton"] = humanoid("skeleton", "skeleton.png", (64, 32),
                              arm_w=2, leg_w=2)
MODELS["skeleton"].quads.append(
    Quad("bow", (8, 16), (-7.5, 17, 2), "arm_r", (48, 0),
         rot=(0.0, 1.2, 0.3)))

# ---------------------------------------------------------------- creeper
_creeper_legs = []
for _nm, _cx, _cz in (("leg_fl", -2.5, 4.5), ("leg_fr", 2.5, 4.5),
                      ("leg_bl", -2.5, -4.5), ("leg_br", 2.5, -4.5)):
    _creeper_legs.append(Part(_nm, (4, 6, 4), (_cx, 3, _cz), (_cx, 6, _cz),
                              (0, 16), mirror_uv=_nm.endswith("l")))

MODELS["creeper"] = Model("creeper", "creeper.png", (64, 32), parts=[
    Part("body", (8, 12, 4), (0, 12, 0), (0, 11, 0), (16, 16)),
    Part("head", (8, 8, 8), (0, 22, 0), (0, 18, 0), (0, 0)),
] + _creeper_legs)

# ---------------------------------------------------------------- spider
_spider_legs = []
for _side, _sx in (("l", 1), ("r", -1)):
    for _i, _z in enumerate((2.5, 0.5, -1.5, -3.5)):
        _yaw = math.radians((48 - _i * 32) * _sx)
        _spider_legs.append(Part(
            f"leg_{_side}{_i}", (16, 2, 2),
            (_sx * 12.0, 7.5, _z),
            (_sx * 4.5, 9, _z), (0, 36),
            rot=(0.0, _yaw, math.radians(-10 * _sx)),
            parent="body"))

MODELS["spider"] = Model("spider", "spider.png", (64, 64), parts=[
    Part("body", (10, 8, 12), (0, 9, -3), (0, 9, -3), (0, 0)),
    Part("head", (8, 8, 8), (0, 9, 7), (0, 9, 3), (0, 20)),
] + _spider_legs)

# ---------------------------------------------------------------- pig
MODELS["pig"] = Model("pig", "pig.png", (64, 32), parts=[
    Part("body", (10, 8, 16), (0, 10, 0), (0, 10, 0), (28, 8),
         mesh_rot=RX90, uv_size=(10, 16, 8)),
    Part("head", (8, 8, 8), (0, 11, 10), (0, 12, 6), (0, 0)),
    Part("snout", (4, 3, 1), (0, 10, 14.5), (0, 11, 14), (18, 16),
         parent="head"),
    Part("leg_fl", (4, 6, 4), (-3, 3, 6), (-3, 6, 6), (0, 16)),
    Part("leg_fr", (4, 6, 4), (3, 3, 6), (3, 6, 6), (0, 16),
         mirror_uv=True),
    Part("leg_bl", (4, 6, 4), (-3, 3, -6), (-3, 6, -6), (0, 16)),
    Part("leg_br", (4, 6, 4), (3, 3, -6), (3, 6, -6), (0, 16),
         mirror_uv=True),
])

# ---------------------------------------------------------------- cow
MODELS["cow"] = Model("cow", "cow.png", (64, 32), parts=[
    Part("body", (12, 10, 18), (0, 17, 0), (0, 17, 0), (18, 4),
         mesh_rot=RX90, uv_size=(12, 18, 10)),
    Part("head", (8, 8, 8), (0, 18, 11), (0, 19, 7), (0, 0)),
    Part("horn_r", (1, 2, 2), (-3.5, 22.5, 8), (-3, 21, 8), (34, 0),
         rot=(0.0, 0.0, 0.55), parent="head"),
    Part("horn_l", (1, 2, 2), (3.5, 22.5, 8), (3, 21, 8), (34, 0),
         mirror_uv=True, rot=(0.0, 0.0, -0.55), parent="head"),
    Part("leg_fl", (4, 12, 4), (-4, 6, 7), (-4, 12, 7), (0, 16)),
    Part("leg_fr", (4, 12, 4), (4, 6, 7), (4, 12, 7), (0, 16),
         mirror_uv=True),
    Part("leg_bl", (4, 12, 4), (-4, 6, -7), (-4, 12, -7), (0, 16)),
    Part("leg_br", (4, 12, 4), (4, 6, -7), (4, 12, -7), (0, 16),
         mirror_uv=True),
])

# ---------------------------------------------------------------- sheep
MODELS["sheep"] = Model("sheep", "sheep.png", (64, 32), parts=[
    Part("body", (10, 8, 16), (0, 16, 0), (0, 16, 0), (28, 8),
         mesh_rot=RX90, uv_size=(10, 16, 8)),
    Part("head", (6, 6, 6), (0, 17, 9), (0, 17, 6), (0, 0)),
    Part("leg_fl", (4, 12, 4), (-3, 6, 5.5), (-3, 12, 5.5), (0, 16)),
    Part("leg_fr", (4, 12, 4), (3, 6, 5.5), (3, 12, 5.5), (0, 16),
         mirror_uv=True),
    Part("leg_bl", (4, 12, 4), (-3, 6, -5.5), (-3, 12, -5.5), (0, 16)),
    Part("leg_br", (4, 12, 4), (3, 6, -5.5), (3, 12, -5.5), (0, 16),
         mirror_uv=True),
])
MODELS["sheep"].fur_skin = "sheep_fur.png"
MODELS["sheep"].fur = [
    Part("fur_body", (12, 10, 18), (0, 16, 0), (0, 16, 0), (28, 8),
         mesh_rot=RX90, uv_size=(10, 16, 8)),
    Part("fur_head", (8, 8, 8), (0, 17, 9), (0, 17, 6), (0, 0),
         uv_size=(6, 6, 6)),
    Part("fur_leg_fl", (6, 10, 6), (-3, 7, 5.5), (-3, 12, 5.5), (0, 16),
         uv_size=(4, 12, 4)),
    Part("fur_leg_fr", (6, 10, 6), (3, 7, 5.5), (3, 12, 5.5), (0, 16),
         uv_size=(4, 12, 4), mirror_uv=True),
    Part("fur_leg_bl", (6, 10, 6), (-3, 7, -5.5), (-3, 12, -5.5), (0, 16),
         uv_size=(4, 12, 4)),
    Part("fur_leg_br", (6, 10, 6), (3, 7, -5.5), (3, 12, -5.5), (0, 16),
         uv_size=(4, 12, 4), mirror_uv=True),
]

# ---------------------------------------------------------------- chicken
MODELS["chicken"] = Model("chicken", "chicken.png", (64, 32), scale=0.75,
                          parts=[
    Part("body", (6, 8, 6), (0, 7, -0.5), (0, 8, 0), (0, 9)),
    Part("head", (4, 6, 3), (0, 13, 2.5), (0, 11, 2), (0, 0)),
    Part("beak", (2, 2, 1), (0, 13.2, 4.5), (0, 13, 4), (14, 0),
         parent="head"),
    Part("wing_r", (1, 4, 6), (-3.5, 8, -0.5), (-3, 9.5, 0), (24, 0)),
    Part("wing_l", (1, 4, 6), (3.5, 8, -0.5), (3, 9.5, 0), (24, 0),
         mirror_uv=True),
    Part("leg_r", (1, 5, 1), (-1.5, 1.5, 0), (-1.5, 3, 0), (40, 0)),
    Part("leg_l", (1, 5, 1), (1.5, 1.5, 0), (1.5, 3, 0), (40, 0),
         mirror_uv=True),
])
