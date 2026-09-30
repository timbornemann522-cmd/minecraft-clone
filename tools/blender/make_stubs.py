#!/usr/bin/env python3
"""Build tiny stub shared libraries so headless Blender (the `bpy` wheel)
loads on servers without X11/GL packages installed.

Background mesh/UV/GLB-export work never calls X or GL, but the dynamic
loader still requires these SONAMEs and their symbols to exist. This script
derives the exact symbol list from Blender's own binaries and compiles
stub .so files with gcc.
"""
import glob
import os
import re
import subprocess
import sys

BPY_DIR = os.environ.get(
    "BPY_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".venv",
                 "lib", "python3.11", "site-packages", "bpy"))
STUB_DIR = os.environ.get(
    "STUB_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".stubs"))

SONAMES = ["libXrender.so.1", "libXfixes.so.3", "libXi.so.6",
           "libxkbcommon.so.0", "libSM.so.6", "libICE.so.6", "libGL.so.1"]
SKIP = {"_init", "_fini", "_edata", "__bss_start", "_end",
        "_dl_find_object", "__gmon_start__"}


def dynsyms(path, defined):
    flag = "--defined-only" if defined else "--undefined-only"
    out = subprocess.run(["nm", "-D", "--format=posix", flag, path],
                         capture_output=True, text=True).stdout
    syms = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name = parts[0].split("@@")[0].split("@")[0]
        if defined and parts[1] in ("T", "D", "B", "R", "W", "V", "u", "i",
                                    "A", "G", "S", "C"):
            syms.add(name)
        elif not defined and parts[1] == "U":
            syms.add(name)
    return syms


def main():
    os.makedirs(STUB_DIR, exist_ok=True)
    sos = glob.glob(os.path.join(BPY_DIR, "**", "*.so*"), recursive=True)
    if not sos:
        sys.exit(f"no Blender libs under {BPY_DIR}; run setup_blender.sh first")

    defined = set()
    for so in sos:
        defined |= dynsyms(so, True)
    resolved = set()
    for so in sos:
        out = subprocess.run(["ldd", so], capture_output=True,
                             text=True).stdout
        for line in out.splitlines():
            m = re.search(r"=>\s+(/\S+)", line)
            if m:
                resolved.add(m.group(1))
    for lib in resolved:
        try:
            defined |= dynsyms(lib, True)
        except OSError:
            pass

    needed = set()
    for so in sos:
        needed |= dynsyms(so, False)
    missing = sorted(s for s in needed if s not in defined and s not in SKIP)
    print(f"stub symbols: {len(missing)}")

    all_c = os.path.join(STUB_DIR, "stub_all.c")
    with open(all_c, "w") as f:
        f.write("void __stub_anchor(void) {}\n")
        for s in missing:
            if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", s):
                f.write(f"void {s}(void) {{}}\n")

    empty_c = os.path.join(STUB_DIR, "stub_empty.c")
    with open(empty_c, "w") as f:
        f.write("void __stub_anchor(void) {}\n")

    for i, soname in enumerate(SONAMES):
        src = all_c if i == 0 else empty_c
        r = subprocess.run(
            ["gcc", "-shared", "-fPIC", f"-Wl,-soname,{soname}",
             "-o", os.path.join(STUB_DIR, soname), src],
            capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"gcc failed for {soname}: {r.stderr}")
    print("stubs ->", STUB_DIR)
    print("export LD_LIBRARY_PATH=" + STUB_DIR + " before running bpy")


if __name__ == "__main__":
    main()
