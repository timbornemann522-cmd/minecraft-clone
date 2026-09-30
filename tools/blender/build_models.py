#!/usr/bin/env python3
"""BLOCKCRAFT Blender model factory.

Builds every mob from box primitives with Minecraft box-UV unwrapping,
assigns the generated skins, parents parts under named pivot empties
(the game animates those nodes), and exports one GLB per mob.

Run headless:  LD_LIBRARY_PATH=tools/blender/.stubs python tools/blender/build_models.py
(or tools/blender/setup_blender.sh once to provision Blender as a Python module).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_defs import MODELS, Part  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SKINS = os.path.join(ROOT, "assets", "textures", "skins")
OUT = os.path.join(ROOT, "assets", "models")
os.makedirs(OUT, exist_ok=True)

PX = 1.0 / 16.0


def face_rects(u, v, w, h, d):
    """MUST stay in sync with tools/textures/gen_textures.py."""
    return {
        "up":    (u + d,         v,     w, d),
        "down":  (u + d + w,     v,     w, d),
        "right": (u,             v + d, d, h),
        "front": (u + d,         v + d, w, h),
        "left":  (u + d + w,     v + d, d, h),
        "back":  (u + d + w + d, v + d, w, h),
    }


def uv_coords(rect, tex_size, face, mirror):
    """Convert a top-left image rect into glTF UVs (origin bottom-left).
    Each face gets 4 UVs in loop order from make_box_faces()."""
    x, y, w, h = rect
    W, H = tex_size
    u0, u1 = x / W, (x + w) / W
    v0, v1 = 1.0 - (y + h) / H, 1.0 - y / H
    if mirror:
        u0, u1 = u1, u0
    # corner order matches face loops below: (a, b, c, d)
    if face in ("front", "up", "down"):
        return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    return [(u1, v0), (u1, v1), (u0, v1), (u0, v0)]


def make_box_mesh(name, size_px, tex_size, tex, mirror, uv_size=None):
    """Box centered on its own origin. Quads ordered:
    front(+Z), back(-Z), right(-X), left(-X), up(+Y), down(-Y).
    Each face loop: ccw seen from outside. uv_size: unwrap box when the
    geometry is inflated (vanilla inflate trick).
    """
    sx, sy, sz = [c * PX / 2 for c in size_px]
    hx, hy, hz = sx, sy, sz
    verts = [
        Vector((-hx, -hy,  hz)), Vector((hx, -hy,  hz)),
        Vector((hx,  hy,  hz)), Vector((-hx,  hy,  hz)),
        Vector((-hx, -hy, -hz)), Vector((hx, -hy, -hz)),
        Vector((hx,  hy, -hz)), Vector((-hx,  hy, -hz)),
    ]
    faces = [
        ("front", [0, 1, 2, 3]),
        ("back",  [5, 4, 7, 6]),
        ("right", [4, 0, 3, 7]),
        ("left",  [1, 5, 6, 2]),
        ("up",    [3, 2, 6, 7]),
        ("down",  [4, 5, 1, 0]),
    ]
    w, h, d = uv_size if uv_size else size_px
    rects = face_rects(tex[0], tex[1], w, h, d)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [idx for _, idx in faces])
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    flat = {"front": "front", "back": "back", "right": "right",
            "left": "left", "up": "up", "down": "down"}
    for poly in me.polygons:
        key = faces[poly.index][0]
        rect = rects[flat[key]]
        coords = uv_coords(rect, tex_size, key, mirror)
        for i, loop_index in enumerate(poly.loop_indices):
            uvl.data[loop_index].uv = coords[i]
    return me


def make_quad_mesh(name, size_px, tex_size, tex, mirror=False):
    """Single flat quad in the XY plane facing +Z."""
    w, h = size_px
    hw, hh = w * PX / 2, h * PX / 2
    verts = [Vector((-hw, -hh, 0)), Vector((hw, -hh, 0)),
             Vector((hw, hh, 0)), Vector((-hw, hh, 0))]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [[0, 1, 2, 3]])
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    u0, v0 = tex[0] / tex_size[0], 1.0 - (tex[1] + h) / tex_size[1]
    u1, v1 = (tex[0] + w) / tex_size[0], 1.0 - tex[1] / tex_size[1]
    coords = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for poly in me.polygons:
        for i, li in enumerate(poly.loop_indices):
            uvl.data[li].uv = coords[i]
    return me


def get_material(skin_name):
    img_path = os.path.join(SKINS, skin_name)
    img = bpy.data.images.load(os.path.abspath(img_path), check_existing=True)
    img.colorspace_settings.name = "Non-Color" if False else "sRGB"
    mat = bpy.data.materials.new("mat_" + skin_name.replace(".", "_"))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    tex.location = (-300, 200)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.0
    mat.blend_method = "OPAQUE"
    return mat


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_model(spec):
    clear_scene()
    mat = get_material(spec.skin)
    fur_mat = get_material(spec.fur_skin) if spec.fur_skin else None

    root = bpy.data.objects.new("root", None)
    root.empty_display_size = 0.1
    bpy.context.collection.objects.link(root)

    pivots = {"root": root, "body": root}
    body_piv = bpy.data.objects.new("body", None)
    body_piv.empty_display_size = 0.05
    bpy.context.collection.objects.link(body_piv)
    body_piv.parent = root
    body_piv.location = Vector((0, 0, 0))
    pivots["body"] = body_piv

    def add_part(part, material, skin_size):
        piv = bpy.data.objects.new(part.name + "_piv", None)
        piv.empty_display_size = 0.02
        bpy.context.collection.objects.link(piv)
        parent = pivots.get(part.parent, root)
        piv.parent = parent
        piv.location = Vector([c * PX for c in part.pivot])
        piv.rotation_euler = part.rot
        pivots[part.name] = piv

        me = make_box_mesh(part.name, part.size, skin_size, part.tex,
                           part.mirror_uv, uv_size=part.uv_size or None)
        ob = bpy.data.objects.new(part.name, me)
        ob.data.materials.append(material)
        bpy.context.collection.objects.link(ob)
        ob.parent = piv
        off = [part.center[i] - part.pivot[i] for i in range(3)]
        ob.location = Vector([c * PX for c in off])
        if part.mesh_rot != (0.0, 0.0, 0.0):
            ob.rotation_euler = part.mesh_rot
        return ob

    for part in spec.parts:
        add_part(part, mat, spec.tex_size)
    for part in spec.fur:
        add_part(part, fur_mat, spec.tex_size)

    for quad in spec.quads:
        piv = bpy.data.objects.new(quad.name + "_piv", None)
        bpy.context.collection.objects.link(piv)
        piv.parent = pivots.get(quad.parent, root)
        piv.location = Vector([c * PX for c in quad.center])
        piv.rotation_euler = quad.rot
        me = make_quad_mesh(quad.name, quad.size, spec.tex_size, quad.tex)
        ob = bpy.data.objects.new(quad.name, me)
        ob.data.materials.append(mat)
        bpy.context.collection.objects.link(ob)
        ob.parent = piv

    if spec.scale != 1.0:
        root.scale = (spec.scale, spec.scale, spec.scale)

    out = os.path.join(OUT, f"{spec.name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_texcoords=True,
    )
    print(f"exported {spec.name} -> {os.path.getsize(out)} bytes")


if __name__ == "__main__":
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for name, spec in MODELS.items():
        if only and name not in only:
            continue
        build_model(spec)
    print("models done")
