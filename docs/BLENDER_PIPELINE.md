# BLENDER_PIPELINE

How BLOCKCRAFT connects Blender to the build, and how to reconnect it
somewhere else.

## What Blender does here

`tools/blender/build_models.py` runs Blender headless (no window, no GPU) to:

1. build every mob from box primitives at exact Minecraft pixel sizes,
2. UV-unwrap each box with the Minecraft box-UV layout,
3. apply the generated skin PNGs (`assets/textures/skins/`) as nearest-filter
   textures,
4. parent every part under named pivot empties (`head_piv`, `arm_l_piv`, ...),
5. export one GLB per mob into `assets/models/`.

The game then animates the pivots procedurally. Models are data: edit
`tools/blender/model_defs.py` and rebuild.

## Connecting Blender (any Linux/macOS box)

```bash
bash tools/blender/setup_blender.sh
```

That script:

1. creates `tools/blender/.venv` and installs the official **bpy** wheel
   (Blender as a Python module, currently 5.0.1) plus Pillow and numpy,
2. builds `tools/blender/.stubs` (see below) if needed,
3. verifies `import bpy` prints the Blender version,
4. prints the one-line model build command.

Then:

```bash
LD_LIBRARY_PATH=tools/blender/.stubs \
  tools/blender/.venv/bin/python tools/blender/build_models.py
```

or simply `npm run assets:models`.

### Why the stub libraries?

The `bpy` wheel links against X11/GL shared libraries (libXrender, libXfixes,
libXi, libxkbcommon, libSM, libICE, libGL) even when running fully headless.
On servers without those packages, `tools/blender/make_stubs.py` compiles
tiny stub `.so` files (gcc) that satisfy the dynamic loader. The mesh/UV/export
path never calls into X or GL, so the stubs are safe.

On a desktop with X11/GL present the stubs are unnecessary - skip that step.

### Alternative: real Blender install

If you have Blender 3.6+ installed, skip the venv entirely:

```bash
blender --background --python tools/blender/build_models.py
```

## Alternative: connect Blender from Windows

- Install Blender 4.x/5.x from blender.org,
- run `blender --background --python tools\blender\build_models.py` from the
  repo root (Command Prompt or PowerShell),
- copy the generated `assets\models\*.glb` if you build elsewhere.

## If connecting Blender is not possible

The failure protocol from PROMPT.md applies: report the blocker, and offer the
fallback (rebuild the same `model_defs.py` boxes directly in Three.js with no
GLB step). The geometry spec would not change - only the exporter. If you hit
that wall, the question to ask is: **do you want to continue** with the
fallback?

## Regenerating textures

Separate pipeline, no Blender needed:

```bash
python3 tools/textures/gen_textures.py     # or npm run assets:textures
```

Outputs `assets/textures/atlas.png` (+ atlas.json), `gui.png` (+ gui.json),
`skins/*.png`, `banner.png`. Skin UV islands in this generator MUST stay in
sync with the tex offsets in `tools/blender/model_defs.py` - both files carry
the same numbers with comments.
