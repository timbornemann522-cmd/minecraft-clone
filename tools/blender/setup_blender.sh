#!/usr/bin/env bash
# BLOCKCRAFT headless Blender bootstrap.
#
# Blender is used as a Python module (the official `bpy` wheel). On servers
# without X11/GL shared libraries we build stub .so files (see make_stubs.py)
# - the background modeling/UV/GLB-export path never calls X or GL.
#
# If your machine has a real Blender install you can use that instead:
#   blender --background --python tools/blender/build_models.py
#
# Usage:  bash tools/blender/setup_blender.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
VENV="$ROOT/tools/blender/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet pillow numpy bpy
echo "bpy wheel installed into $VENV"

# 1) build the headless system-lib stubs BEFORE first bpy import
BPY_DIR="$VENV/lib/python3.11/site-packages/bpy"
if [ ! -f tools/blender/.stubs/libGL.so.1 ]; then
  BPY_DIR="$BPY_DIR" STUB_DIR="$ROOT/tools/blender/.stubs" \
    python3 tools/blender/make_stubs.py
fi

# 2) verify Blender actually loads
LD_LIBRARY_PATH="$ROOT/tools/blender/.stubs" "$VENV/bin/python" - <<'EOF'
import bpy
print("Blender as Python module OK:", bpy.app.version_string)
EOF

echo "ready. build all mob models with:"
echo "  LD_LIBRARY_PATH=tools/blender/.stubs $VENV/bin/python tools/blender/build_models.py"
