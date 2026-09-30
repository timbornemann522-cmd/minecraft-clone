#!/usr/bin/env python3
"""BLOCKCRAFT pixel texture generator.

Deterministic, hand-authored pixel art. Every texture is declared here as
pixel data (character-row maps and small deterministic noise recipes).
Outputs to assets/textures/:
  atlas.png + atlas.json    block/item/particle/crack tiles (16x16 tiles)
  gui.png   + gui.json      HUD widgets
  skins/*.png               entity skins in Minecraft UV layout
  banner.png                README banner
No emojis. All pixel. Re-run any time: python3 tools/textures/gen_textures.py
"""
import json
import os
import random
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "assets", "textures")
SKINS = os.path.join(OUT, "skins")
os.makedirs(SKINS, exist_ok=True)

# ---------------------------------------------------------------- helpers

def C(hexstr, a=255):
    hexstr = hexstr.lstrip("#")
    return (int(hexstr[0:2], 16), int(hexstr[2:4], 16), int(hexstr[4:6], 16), a)


def rows_image(rows, palette, w=16, h=16):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in palette:
                px[x, y] = palette[ch]
    return im


def noise_image(w, h, palette, seed):
    """palette: list of (rgba, weight). Deterministic weighted noise."""
    rnd = random.Random(seed)
    total = sum(wt for _, wt in palette)
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            r = rnd.random() * total
            acc = 0.0
            for color, wt in palette:
                acc += wt
                if r <= acc:
                    px[x, y] = color
                    break
    return im


def blit(dst, src, ox, oy):
    dst.alpha_composite(src, (ox, oy))


def face_rects(u, v, w, h, d):
    """Minecraft box UV layout (top-left image coords).
    front = +Z, back = -Z, right = -X, left = +X, up = +Y, down = -Y.
    MUST stay in sync with tools/blender/build_models.py.
    """
    return {
        "up":    (u + d,         v,     w, d),
        "down":  (u + d + w,     v,     w, d),
        "right": (u,             v + d, d, h),
        "front": (u + d,         v + d, w, h),
        "left":  (u + d + w,     v + d, d, h),
        "back":  (u + d + w + d, v + d, w, h),
    }


def paint_rect(im, rect, recipe, palette):
    x, y, w, h = rect
    px = im.load()
    kind = recipe[0]
    if kind == "flat":
        col = palette[recipe[1]]
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < im.width and 0 <= yy < im.height:
                    px[xx, yy] = col
    elif kind == "noise":
        rnd = random.Random(recipe[2] if len(recipe) > 2 else 1)
        weights = recipe[1]  # list of (char, weight)
        total = sum(wt for _, wt in weights)
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                r = rnd.random() * total
                acc = 0.0
                for ch, wt in weights:
                    acc += wt
                    if r <= acc:
                        px[xx, yy] = palette[ch]
                        break
    elif kind == "rows":
        art, ox, oy = recipe[1], recipe[2], recipe[3]
        for dy, row in enumerate(art):
            for dx, ch in enumerate(row):
                xx, yy = x + ox + dx, y + oy + dy
                if ch != "." and 0 <= xx < im.width and 0 <= yy < im.height:
                    px[xx, yy] = palette[ch]
    elif kind == "shade":
        # base noise then darken bottom-right by one step via palette suffix 'S'
        rnd = random.Random(recipe[2] if len(recipe) > 2 else 1)
        base = recipe[1]
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                px[xx, yy] = base[rnd.randrange(len(base))]
        for yy in range(y + h - 1, y + h):
            for xx in range(x, x + w):
                pass


def paint_part(im, u, v, w, h, d, fills, palette):
    rects = face_rects(u, v, w, h, d)
    for face, recipe in fills.items():
        paint_rect(im, rects[face], recipe, palette)


# ---------------------------------------------------------------- font 5x7
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
    ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
    "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
    ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
    "x": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
}


def draw_text(im, text, x, y, color, scale=1, shadow=None):
    cx = x
    for ch in text.upper():
        glyph = FONT.get(ch, FONT["?"])
        for gy, row in enumerate(glyph):
            for gx, cell in enumerate(row):
                if cell == "#":
                    for sy in range(scale):
                        for sx in range(scale):
                            px, py = cx + gx * scale + sx, y + gy * scale + sy
                            if 0 <= px < im.width and 0 <= py < im.height:
                                if shadow is not None:
                                    im.putpixel((px + scale, py + scale), shadow)
                    for sy in range(scale):
                        for sx in range(scale):
                            px, py = cx + gx * scale + sx, y + gy * scale + sy
                            if 0 <= px < im.width and 0 <= py < im.height:
                                im.putpixel((px, py), color)
        cx += 6 * scale
    return cx


def text_width(text, scale=1):
    return len(text) * 6 * scale - scale


# ---------------------------------------------------------------- blocks
def t_grass_top():
    return noise_image(16, 16, [
        (C("#79C05A"), 34), (C("#6DAF4F"), 30), (C("#8CCC66"), 20),
        (C("#5E9C43"), 12), (C("#4C8A38"), 4)], 11)


def t_dirt():
    return noise_image(16, 16, [
        (C("#866043"), 34), (C("#79553A"), 30), (C("#956B4B"), 22),
        (C("#6B4A31"), 12), (C("#5A3D28"), 2)], 22)


def t_grass_side():
    im = t_dirt()
    px = im.load()
    lip = [
        "#.##..#.###..##.",
        "##.###.##.####.#",
        "#.##.#.#.###..#.",
        ".#.#..#..#..##..",
        "..#..#....#..#..",
        "................",
    ]
    greens = [C("#79C05A"), C("#6DAF4F"), C("#8CCC66"), C("#5E9C43")]
    rnd = random.Random(33)
    for y, row in enumerate(lip):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = greens[rnd.randrange(4)]
    return im


def t_stone():
    im = noise_image(16, 16, [
        (C("#7E7E7E"), 36), (C("#888888"), 28), (C("#747474"), 24),
        (C("#6A6A6A"), 12)], 44)
    px = im.load()
    for x, y in [(2, 3), (9, 5), (13, 2), (5, 11), (11, 13), (7, 8), (1, 14), (14, 9)]:
        px[x, y] = C("#5F5F5F")
    return im


def t_cobblestone():
    cobble_rows = [
        "dddddddddddddddd",
        "dcccccdddccccddd",
        "dcccccdddccccddd",
        "dcccccdddccccddd",
        "dddddddddddddded",
        "deccccdddcccccdd",
        "deccccdddcccccdd",
        "dddddddedddddddd",
        "dddccccdddcccccd",
        "dddccccdddcccccd",
        "dddccccdddccccce",
        "dddddddddddddddd",
        "dcccccdddccccddd",
        "dcccccdddcccccdd",
        "dddddddddddddddd",
        "dddddddddddddddd",
    ]
    im = rows_image(cobble_rows, {
        "c": C("#8B8B8B"), "d": C("#5A5A5A"), "e": C("#737373")})
    px = im.load()
    rnd = random.Random(55)
    for y in range(16):
        for x in range(16):
            r = rnd.random()
            if r < 0.10 and px[x, y] == C("#8B8B8B"):
                px[x, y] = C("#979797")
            elif r < 0.16 and px[x, y] == C("#8B8B8B"):
                px[x, y] = C("#7A7A7A")
    return im


def t_sand():
    return noise_image(16, 16, [
        (C("#DBD3A0"), 36), (C("#D3C998"), 30), (C("#E3DBAA"), 24),
        (C("#C7BC8A"), 10)], 66)


def t_sandstone_top():
    return noise_image(16, 16, [
        (C("#E0D8A8"), 40), (C("#D8CF9E"), 32), (C("#E8E0B4"), 28)], 67)


def t_sandstone_side():
    im = noise_image(16, 16, [
        (C("#DBD3A0"), 40), (C("#D3C998"), 32), (C("#E3DBAA"), 28)], 68)
    px = im.load()
    for x in range(16):
        for y in (4, 11):
            px[x, y] = C("#C7BC8A")
        px[x, 5] = C("#CFC493")
    return im


def t_gravel():
    im = noise_image(16, 16, [
        (C("#7F7B7B"), 30), (C("#8E8783"), 26), (C("#6E6767"), 22),
        (C("#9A928C"), 14), (C("#5C5656"), 8)], 77)
    px = im.load()
    for x, y in [(3, 2), (12, 4), (6, 9), (10, 12), (2, 12), (14, 8), (8, 5)]:
        px[x, y] = C("#4F4A4A")
    return im


def t_log_side():
    im = noise_image(16, 16, [
        (C("#6B5333"), 36), (C("#5C4626"), 30), (C("#7C6242"), 22),
        (C("#4E3B1F"), 12)], 88)
    px = im.load()
    for x in (2, 6, 10, 14):
        for y in range(16):
            if (x + y) % 7 != 0:
                px[x, y] = C("#43331A")
    for x, y in [(4, 1), (12, 7), (8, 12), (1, 9), (13, 3)]:
        px[x, y] = C("#3A2C15")
    return im


def t_log_top():
    rows = [
        "bbbbbbbbbbbbbbbb",
        "baaaaaaaaaaaaaab",
        "baCCCCCCCCCCaaaab"[:16],
        "baCaaaaaaaaCaaaab"[:16],
        "baCaBBBBBBaCaaaab"[:16],
        "baCaBaaaaBaCaaaab"[:16],
        "baCaBaBBaBaCaaaab"[:16],
        "baCaBaBBaBaCaaaab"[:16],
        "baCaBaaaaBaCaaaab"[:16],
        "baCaBBBBBBaCaaaab"[:16],
        "baCaaaaaaaaCaaaab"[:16],
        "baCCCCCCCCCCaaaab"[:16],
        "baaaaaaaaaaaaaab ",
        "baaaaaaaaaaaaaaa",
        "baaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbb",
    ]
    return rows_image(rows, {
        "a": C("#A0814F"), "b": C("#6B5333"), "B": C("#8A6C3E"),
        "C": C("#967748")})


def t_leaves():
    im = noise_image(16, 16, [
        (C("#3E7A28"), 34), (C("#4B8C31"), 30), (C("#35691F"), 22),
        (C("#5C9E3F"), 14)], 99)
    px = im.load()
    rnd = random.Random(100)
    for y in range(16):
        for x in range(16):
            if rnd.random() < 0.12:
                px[x, y] = (0, 0, 0, 0)
    return im


def t_planks():
    im = noise_image(16, 16, [(C("#9C7F4E"), 40), (C("#8A6C3E"), 30),
                              (C("#AA8B58"), 30)], 111)
    px = im.load()
    for seam in (3, 7, 11, 15):
        for x in range(16):
            px[x, seam] = C("#6B5333")
    rnd = random.Random(112)
    for y in range(16):
        if y % 4 != 3:
            x = rnd.randrange(12)
            ln = 2 + rnd.randrange(3)
            for xx in range(x, min(16, x + ln)):
                px[xx, y] = C("#7C6242")
    return im


def t_glass():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    frame = C("#D9F0F5", 220)
    tint = C("#B9D8DE", 40)
    for i in range(16):
        px[i, 0] = frame
        px[i, 15] = frame
        px[0, i] = frame
        px[15, i] = frame
    for y in range(1, 15):
        for x in range(1, 15):
            px[x, y] = tint
    px[3, 2] = C("#FFFFFF", 230)
    px[2, 3] = C("#FFFFFF", 230)
    px[4, 3] = C("#FFFFFF", 200)
    px[3, 4] = C("#FFFFFF", 180)
    px[12, 11] = C("#FFFFFF", 160)
    px[11, 12] = C("#FFFFFF", 140)
    return im


def t_water():
    rows = [
        "................",
        "aaaaaabbbbaaaaaa",
        "aaaaaabbbbaaaaaa",
        "aaaabbbbaaaabbbb",
        "aaaabbbbaaaabbbb",
        "aabbbbaaaabbbbaa",
        "aabbbbaaaabbbbaa",
        "aaaabbbbaaaabbbb",
        "aaaabbbbaaaabbbb",
        "aaaaaabbbbaaaaaa",
        "aaaaaabbbbaaaaaa",
        "aaabbbbaaaabbbba",
        "aaabbbbaaaabbbba",
        "aabbbbaaaabbbbaa",
        "aabbbbaaaabbbbaa",
        "................",
    ]
    return rows_image(rows, {
        "a": C("#3F76E4", 185), "b": C("#355FDB", 185)})


def t_bedrock():
    im = noise_image(16, 16, [
        (C("#565656"), 30), (C("#333333"), 28), (C("#787878"), 22),
        (C("#2A2A2A"), 20)], 122)
    px = im.load()
    for x, y in [(4, 4), (5, 4), (4, 5), (10, 8), (11, 9), (11, 8), (2, 11), (3, 12), (13, 3), (12, 2)]:
        px[x, y] = C("#1E1E1E")
    for x, y in [(8, 2), (9, 2), (2, 7), (14, 12), (6, 13)]:
        px[x, y] = C("#8A8A8A")
    return im


def ore_over(im, clusters, colors):
    px = im.load()
    for i, (cx, cy) in enumerate(clusters):
        light, mid, dark = colors
        shape = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (1, 2)]
        for j, (dx, dy) in enumerate(shape):
            x, y = cx + dx, cy + dy
            if 0 <= x < 16 and 0 <= y < 16:
                px[x, y] = mid if j % 3 else dark
        px[cx, cy] = light
        px[cx + 1, cy + 1] = light
    return im


def t_coal_ore():
    return ore_over(t_stone(), [(3, 3), (9, 8), (6, 12)],
                    (C("#4A4A4A"), C("#2A2A2A"), C("#161616")))


def t_iron_ore():
    return ore_over(t_stone(), [(4, 4), (10, 3), (7, 10)],
                    (C("#D8A883"), C("#B98A6B"), C("#9A6B50")))


def t_gold_ore():
    return ore_over(t_stone(), [(3, 5), (10, 9), (7, 2)],
                    (C("#F5E27A"), C("#E0C24E"), C("#BC9A2F")))


def t_diamond_ore():
    return ore_over(t_stone(), [(5, 3), (9, 9), (3, 11)],
                    (C("#8FF7F2"), C("#4AEDD9"), C("#2EBFB0")))


def t_snow():
    return noise_image(16, 16, [
        (C("#F2F6F9"), 40), (C("#E8EEF3"), 32), (C("#FFFFFF"), 28)], 133)


def t_crafting_top():
    im = t_planks()
    px = im.load()
    for i in range(16):
        px[i, 5] = C("#5A4426")
        px[i, 10] = C("#5A4426")
        px[5, i] = C("#5A4426")
        px[10, i] = C("#5A4426")
    for x, y in [(2, 2), (3, 3), (13, 2), (12, 3), (2, 13), (13, 13)]:
        px[x, y] = C("#C7C7C7")
    return im


def t_crafting_front():
    im = t_planks()
    art = [
        "................",
        "..........11....",
        ".........1..1...",
        "........1....1..",
        ".......111111...",
        "............1...",
        "...222........1.",
        "..2...2........1",
        "..2...2.......1.",
        "..2...2......1..",
        "...222......1...",
        "....2......1....",
        "...222....1.....",
        "..2...2..1......",
        "................",
        "................",
    ]
    px = im.load()
    for y, row in enumerate(art):
        for x, ch in enumerate(row):
            if ch == "1":
                px[x, y] = C("#C7C7C7")
            elif ch == "2":
                px[x, y] = C("#6B5333")
    return im


def t_crafting_side():
    im = t_planks()
    px = im.load()
    for y in range(16):
        px[0, y] = C("#5A4426")
        px[15, y] = C("#5A4426")
    return im


def t_tnt_side():
    im = noise_image(16, 16, [(C("#B33A2B"), 50), (C("#A32F22"), 30),
                              (C("#C34A38"), 20)], 144)
    px = im.load()
    for y in (5, 6, 7, 8, 9, 10):
        for x in range(16):
            px[x, y] = C("#E8E0D0") if 5 <= y <= 10 and y not in (5, 10) else C("#D8D0C0")
    draw_text(im, "TNT", 2, 6, C("#2A2A2A"), scale=1)
    for x in range(16):
        px[x, 0] = C("#8A2518")
        px[x, 15] = C("#8A2518")
    return im


def t_tnt_top():
    im = noise_image(16, 16, [(C("#B33A2B"), 55), (C("#A32F22"), 45)], 145)
    px = im.load()
    for x in range(16):
        px[x, 0] = C("#8A2518")
        px[x, 15] = C("#8A2518")
        px[0, x] = C("#8A2518")
        px[15, x] = C("#8A2518")
    px[7, 7] = C("#5A5A5A")
    px[8, 7] = C("#5A5A5A")
    px[7, 8] = C("#5A5A5A")
    px[8, 8] = C("#5A5A5A")
    px[8, 5] = C("#8A7A5A")
    return im


def t_tnt_bottom():
    return noise_image(16, 16, [(C("#8A2518"), 55), (C("#7A1F12"), 45)], 146)


def t_cactus_side():
    im = noise_image(16, 16, [(C("#0E7F1E"), 40), (C("#0C6E19"), 32),
                              (C("#14912A"), 28)], 155)
    px = im.load()
    for y in range(16):
        px[0, y] = C("#0A5A13")
        px[15, y] = C("#0A5A13")
    for y in (2, 6, 10, 14):
        px[4, y] = C("#DDE8C0")
        px[11, y + 1 if y + 1 < 16 else y] = C("#DDE8C0")
    return im


def t_cactus_top():
    im = noise_image(16, 16, [(C("#14912A"), 50), (C("#0E7F1E"), 50)], 156)
    px = im.load()
    for i in range(16):
        px[i, 0] = C("#0A5A13")
        px[i, 15] = C("#0A5A13")
        px[0, i] = C("#0A5A13")
        px[15, i] = C("#0A5A13")
    px[7, 7] = C("#DDE8C0")
    px[8, 8] = C("#DDE8C0")
    return im


def t_dandelion():
    rows = [
        "................",
        "................",
        "................",
        ".....yyyy.......",
        "....yyyyyy......",
        "....yyyyyy......",
        ".....yyyy.......",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "................",
        "................",
    ]
    return rows_image(rows, {"y": C("#F5E27A"), "g": C("#4B8C31")})


def t_poppy():
    rows = [
        "................",
        "................",
        "................",
        ".....rrrr.......",
        "....rrrrrr......",
        "....rrWrrr......",
        ".....rrrr.......",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "......g.........",
        "................",
        "................",
    ]
    return rows_image(rows, {"r": C("#D33A2B"), "W": C("#2A2A2A"),
                             "g": C("#4B8C31")})


def t_tall_grass():
    rows = [
        "................",
        "................",
        "...#..#...#.....",
        "...#.#.#..#.....",
        "....#.#..##.....",
        "....#.#.#.#.....",
        "....##..#.#.....",
        "...#.#..#.#.....",
        "...#.#.#..#.....",
        "....#..#...#....",
        "....#..#...#....",
        "....#..#........",
        "................",
        "................",
        "................",
        "................",
    ]
    return rows_image(rows, {"#": C("#5E9C43")})


# ---------------------------------------------------------------- items
ITEM_SHAPES = {
    "pickaxe": [
        "................",
        "..111111111.....",
        ".11222222221....",
        ".12.........2...",
        "...3............",
        "...33...........",
        "....3...........",
        "....3...........",
        "...3............",
        "...3............",
        "..3.............",
        "..3.............",
        "................",
        "................",
        "................",
        "................",
    ],
    "axe": [
        "....111.........",
        "...12221........",
        "...122221.......",
        "...12223........",
        "...1223.........",
        "....113.........",
        "....33..........",
        "....3...........",
        "...3............",
        "...3............",
        "..3.............",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "shovel": [
        ".....111........",
        ".....121........",
        ".....121........",
        ".....111........",
        "......3.........",
        "......3.........",
        ".....3..........",
        ".....3..........",
        "....3...........",
        "....3...........",
        "...3............",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "sword": [
        "........11......",
        ".......1221.....",
        "......1221......",
        ".....1221.......",
        "....1221........",
        "...1221.........",
        "..3.221.........",
        ".33321..........",
        "..333...........",
        "..3.33..........",
        ".33.3...........",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "stick": [
        "................",
        "................",
        "..........33....",
        ".........33.....",
        "........33......",
        ".......33.......",
        "......33........",
        ".....33.........",
        "....33..........",
        "...33...........",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "ingot": [
        "................",
        "................",
        "................",
        "................",
        "....111111......",
        "...12222221.....",
        "...12222221.....",
        "...11111111.....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "gem": [
        "................",
        "................",
        "......11........",
        ".....1221.......",
        "....122221......",
        "...12222221.....",
        "...12222221.....",
        "....122221......",
        ".....1221.......",
        "......11........",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "apple": [
        "................",
        "........g.......",
        ".......gg.......",
        "....rrrrrr......",
        "...rrrrrrrr.....",
        "..rrrWrrrrrr....",
        "..rrrrrrrrrr....",
        "..rrrrrrrrrr....",
        "...rrrrrrrr.....",
        "....rrrrrr......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "bow": [
        "................",
        "......3333......",
        "....33....3.....",
        "...3.......3....",
        "..3.......1.....",
        "..3......1......",
        "..3.....1.......",
        "..3....1........",
        "..3....1........",
        "...3..1.........",
        "....3313........",
        "......3333......",
        "................",
        "................",
        "................",
        "................",
    ],
    "arrow": [
        "................",
        "..........11....",
        "..........121...",
        ".........121....",
        "........121.....",
        ".......121......",
        "......121.......",
        ".....121........",
        "....121.........",
        "...1.3..........",
        "..333.3.........",
        "..33.33.........",
        "................",
        "................",
        "................",
        "................",
    ],
    "egg": [
        "................",
        "................",
        "......111.......",
        ".....11111......",
        "....1122111.....",
        "....1122211.....",
        "....1122211.....",
        "....1112111.....",
        ".....11111......",
        "......111.......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "porkchop": [
        "................",
        "................",
        "....11111.......",
        "...11222111.....",
        "..1122222111....",
        "..1222222211....",
        "..1222222221....",
        "..1122222211....",
        "...11222211.....",
        "....111111......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "beef": [
        "................",
        "................",
        "...111111.......",
        "..112222211.....",
        ".11222222211....",
        ".12222222221....",
        ".12222222221....",
        ".11222222211....",
        "..112222211.....",
        "...1111111......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "wool": [
        "................",
        "....111111......",
        "...11222211.....",
        "..1122222211....",
        "..1222222221....",
        "..1222222221....",
        "..1222222221....",
        "..1222222221....",
        "..1122222211....",
        "...11222211.....",
        "....111111......",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
}

MATS = {
    "wood":    {"1": C("#C0A16B"), "2": C("#A0814F"), "3": C("#6B5333"), "4": C("#43331A")},
    "stone":   {"1": C("#A8A8A8"), "2": C("#8B8B8B"), "3": C("#6B5333"), "4": C("#43331A")},
    "iron":    {"1": C("#F2F2F2"), "2": C("#D8D8D8"), "3": C("#6B5333"), "4": C("#43331A")},
    "diamond": {"1": C("#8FF7F2"), "2": C("#4AEDD9"), "3": C("#6B5333"), "4": C("#43331A")},
    "plain":   {"1": C("#D8D8D8"), "2": C("#B0B0B0"), "3": C("#6B5333"), "4": C("#43331A")},
    "gold":    {"1": C("#F5E27A"), "2": C("#E0C24E"), "3": C("#6B5333"), "4": C("#43331A")},
}


def item_image(shape_name, mat_name):
    pal = dict(MATS[mat_name])
    pal["W"] = C("#FFFFFF")
    pal["g"] = C("#4B8C31")
    pal["r"] = C("#D33A2B")
    return rows_image(ITEM_SHAPES[shape_name], pal)


# ---------------------------------------------------------------- crack
def t_destroy(stage):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    rnd = random.Random(500 + stage)
    tips = [(8, 8)]
    count = 2 + stage * 2
    for i in range(count):
        x, y = tips[i % len(tips)]
        for _ in range(1 + stage // 2):
            if 0 <= x < 16 and 0 <= y < 16:
                px[x, y] = (10, 10, 10, 170)
            x += rnd.choice([-1, 0, 1])
            y += rnd.choice([-1, 0, 1])
            x, y = max(0, min(15, x)), max(0, min(15, y))
        if stage >= 4:
            tips.append((x, y))
    return im


def t_particle(r, g, b):
    rows = [
        "................",
        "................",
        "................",
        "................",
        "......xxxx......",
        ".....xxxxxx.....",
        ".....xxxxxx.....",
        ".....xxxxxx.....",
        ".....xxxxxx.....",
        ".....xxxxxx.....",
        "......xxxx......",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]
    return rows_image(rows, {"x": (r, g, b, 255)})


# ---------------------------------------------------------------- skins
SKIN64 = (64, 64)
SKIN32 = (64, 32)


def new_skin(size):
    return Image.new("RGBA", size, (0, 0, 0, 0))


def human_skin(name, skin_c, shirt, pants, shoe, hair, extra):
    """extra: dict with face art rows (8x8) under key 'face' etc."""
    im = new_skin(SKIN64)
    p = {
        "s": C(skin_c), "S": C(skin_c[1:] and "#" + "".join(
            f"{max(0, int(skin_c[i:i+2], 16) - 18):02X}" for i in (1, 3, 5))),
        "h": C(hair), "H": C("#" + "".join(
            f"{max(0, int(hair[i:i+2], 16) - 22):02X}" for i in (1, 3, 5))),
        "t": C(shirt), "T": C("#" + "".join(
            f"{max(0, int(shirt[i:i+2], 16) - 22):02X}" for i in (1, 3, 5))),
        "p": C(pants), "P": C("#" + "".join(
            f"{max(0, int(pants[i:i+2], 16) - 20):02X}" for i in (1, 3, 5))),
        "e": C(shoe), "E": C("#2A2A2A"),
        "w": C("#FFFFFF"), "b": C("#3A5AC8"), "m": C("#2A2A2A"),
        "n": C("#B98A6B"), "k": C("#1E1E1E"), "g": extra.get("eye", "#FFFFFF"),
        "r": C("#B34A3A"), "d": C("#5A4A3A"),
    }
    p["g"] = C(extra.get("eye", "#FFFFFF"))
    # head (0,0) 8x8x8
    paint_part(im, 0, 0, 8, 8, 8, {
        "up":    ("rows", extra.get("head_top", ["hhhhhhhh"] * 8), 0, 0),
        "down":  ("flat", "S"),
        "right": ("rows", extra.get("head_side", ["hhhhhhhh"] * 2 + ["ssssssss"] * 6), 0, 0),
        "front": ("rows", extra["face"], 0, 0),
        "left":  ("rows", extra.get("head_side", ["hhhhhhhh"] * 2 + ["ssssssss"] * 6), 0, 0),
        "back":  ("rows", extra.get("head_back", ["hhhhhhhh"] * 2 + ["ssssssss"] * 6), 0, 0),
    }, p)
    # body (16,16) 8x12x4
    paint_part(im, 16, 16, 8, 12, 4, {
        "up":    ("flat", "t"), "down": ("flat", "T"),
        "right": ("rows", ["tttt", "tttt", "tttt"] + ["ssss"] * 9, 0, 0),
        "front": ("rows", extra.get("body_front", ["tttttttt"] * 10 + ["TTTTTTTT"] * 2), 0, 0),
        "left":  ("rows", ["tttt", "tttt", "tttt"] + ["ssss"] * 9, 0, 0),
        "back":  ("rows", ["tttttttt"] * 12, 0, 0),
    }, p)
    # right arm (40,16) 4x12x4
    paint_part(im, 40, 16, 4, 12, 4, {
        "up": ("flat", "s"), "down": ("flat", "S"),
        "right": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
        "front": ("rows", extra.get("arm_front", ["tttt"] * 3 + ["ssss"] * 9), 0, 0),
        "left": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
        "back": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
    }, p)
    # right leg (0,16) 4x12x4
    paint_part(im, 0, 16, 4, 12, 4, {
        "up": ("flat", "p"), "down": ("flat", "e"),
        "right": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "front": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "left": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "back": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
    }, p)
    # left leg (16,48) 4x12x4
    paint_part(im, 16, 48, 4, 12, 4, {
        "up": ("flat", "p"), "down": ("flat", "e"),
        "right": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "front": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "left": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
        "back": ("rows", ["pppp"] * 8 + ["eeee"] * 4, 0, 0),
    }, p)
    # left arm (32,48) 4x12x4
    paint_part(im, 32, 48, 4, 12, 4, {
        "up": ("flat", "s"), "down": ("flat", "S"),
        "right": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
        "front": ("rows", extra.get("arm_front", ["tttt"] * 3 + ["ssss"] * 9), 0, 0),
        "left": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
        "back": ("rows", ["tttt"] * 3 + ["ssss"] * 9, 0, 0),
    }, p)
    return im


STEVE_FACE = [
    "hhhhhhhh",
    "hhhhhhhh",
    "nnnnnnnn",
    "nwnbwnnn"[:8],
    "nwnbwnnn"[:8],
    "nnnnnnnn",
    "nmmmmmmn",
    "nnnnnnnn",
]

ZOMBIE_FACE = [
    "ssssssss",
    "ssskksss",
    "sskkkkss",
    "sskkkkss",
    "ssssssss",
    "skkkkkks",
    "skkkkkks",
    "ssssssss",
]


def skin_steve():
    return human_skin("steve", "#B98A6B", "#00A8A8", "#3B3B8F", "#6B6B6B",
                      "#4A3421", {"face": STEVE_FACE,
                                  "body_front": ["tttttttt"] * 10 + ["TTTTTTTT"] * 2,
                                  "head_top": ["hhhhhhhh"] * 8,
                                  "head_back": ["hhhhhhhh"] * 3 + ["ssssssss"] * 5,
                                  "eye": "#3A5AC8"})


def skin_zombie():
    return human_skin("zombie", "#4E8A3A", "#2E8B8B", "#3A3A6B", "#2A2A2A",
                      "#3A6B28", {"face": ZOMBIE_FACE,
                                  "body_front": ["tttttttt"] * 8 + ["ttkktttt"] * 2 + ["TTTTTTTT"] * 2,
                                  "head_top": ["ssssssss"] * 8,
                                  "head_back": ["ssssssss"] * 8,
                                  "arm_front": ["tttt"] * 3 + ["ssss"] * 8 + ["ssks"],
                                  "eye": "#1E4A1E"})


def skin_skeleton():
    im = new_skin(SKIN32)
    p = {"b": C("#C7C7C7"), "B": C("#B0B0B0"), "D": C("#8A8A8A"),
         "k": C("#1E1E1E"), "m": C("#3A3A3A")}
    face = [
        "bbbbbbbb",
        "bbbbbbbb",
        "bbkkkkbb",
        "bbkkkkbb",
        "bbbkkbbb",
        "bbbbbbbb",
        "bmmbmmbm"[:8],
        "bbbbbbbb",
    ]
    paint_part(im, 0, 0, 8, 8, 8, {
        "up": ("noise", [("b", 3), ("B", 2)], 301),
        "down": ("flat", "B"),
        "right": ("noise", [("b", 3), ("B", 2)], 302),
        "front": ("rows", face, 0, 0),
        "left": ("noise", [("b", 3), ("B", 2)], 302),
        "back": ("noise", [("b", 3), ("B", 2)], 303),
    }, p)
    paint_part(im, 16, 16, 8, 12, 4, {
        "up": ("flat", "b"), "down": ("flat", "B"),
        "right": ("rows", ["b..b", "b..b", "b..b", "b..b", "b..b", "b..b",
                           "b..b", "b..b", "b..b", "b..b", "b..b", "bbbb"], 0, 0),
        "front": ("rows", ["b....b", "..bb..", "b....b", "..bb..", "b....b",
                           "..bb..", "b....b", "..bb..", "b....b", "..bb..",
                           "bbbbbb", "bbbbbb"][:12], 1, 0),
        "left": ("rows", ["b..b", "b..b", "b..b", "b..b", "b..b", "b..b",
                          "b..b", "b..b", "b..b", "b..b", "b..b", "bbbb"], 0, 0),
        "back": ("rows", ["b....b", "..bb..", "b....b", "..bb..", "b....b",
                          "..bb..", "b....b", "..bb..", "b....b", "..bb..",
                          "bbbbbb", "bbbbbb"], 1, 0),
    }, p)
    # thin limbs 2x12x2 share (0,16) and (40,16)
    limb_fill = {
        "up": ("flat", "b"), "down": ("flat", "B"),
        "right": ("noise", [("b", 3), ("B", 2)], 311),
        "front": ("noise", [("b", 3), ("B", 2)], 312),
        "left": ("noise", [("b", 3), ("B", 2)], 311),
        "back": ("noise", [("b", 3), ("B", 2)], 313),
    }
    paint_part(im, 0, 16, 2, 12, 2, limb_fill, p)
    paint_part(im, 40, 16, 2, 12, 2, limb_fill, p)
    # bow painted at (48,0) as single quad 8x16 region
    bow = [
        "......bb",
        ".....b..",
        "....b...",
        "...b....",
        "..b....m",
        "..b...m.",
        "..b..m..",
        "..b.m...",
        "..b.m...",
        "..b..m..",
        "..b...m.",
        "..b....m",
        "...b....",
        "....b...",
        ".....b..",
        "......bb",
    ]
    paint_rect(im, (48, 0, 8, 16), ("rows", bow, 0, 0),
               {"b": C("#6B5333"), "m": C("#D8D8D8")})
    return im


def skin_creeper():
    im = new_skin(SKIN32)
    p = {"a": C("#59A63B"), "b": C("#4B8C31"), "c": C("#3E7A28"),
         "d": C("#6BB84A"), "k": C("#1E1E1E")}
    face = [
        "aaaaaaaa",
        "aakkkkaa",
        "aakkkkaa",
        "aakkkkaa",
        "aakkkkaa",
        "aakaaaak"[:8],
        "aakaaaka"[:8],
        "aaaaaaaa",
    ]
    face = [
        "aaaaaaaa",
        "akkaakka",
        "akkaakka",
        "aaaaaaaa",
        "aakkkkaa",
        "akkkkkka",
        "akkakkka",
        "aaaaaaaa",
    ]
    paint_part(im, 0, 0, 8, 8, 8, {
        "up": ("noise", [("a", 3), ("d", 2), ("b", 2)], 401),
        "down": ("noise", [("b", 3), ("c", 2)], 402),
        "right": ("noise", [("a", 3), ("b", 2), ("c", 2)], 403),
        "front": ("rows", face, 0, 0),
        "left": ("noise", [("a", 3), ("b", 2), ("c", 2)], 403),
        "back": ("noise", [("a", 3), ("b", 2), ("c", 2)], 404),
    }, p)
    body_fill = {
        "up": ("noise", [("a", 3), ("d", 2), ("b", 2)], 411),
        "down": ("noise", [("c", 3), ("b", 2)], 412),
        "right": ("noise", [("a", 3), ("b", 2), ("c", 2), ("d", 1)], 413),
        "front": ("noise", [("a", 3), ("b", 2), ("c", 2), ("d", 1)], 414),
        "left": ("noise", [("a", 3), ("b", 2), ("c", 2), ("d", 1)], 413),
        "back": ("noise", [("a", 3), ("b", 2), ("c", 2), ("d", 1)], 415),
    }
    paint_part(im, 16, 16, 8, 12, 4, body_fill, p)
    leg_fill = dict(body_fill)
    paint_part(im, 0, 16, 4, 6, 4, {
        "up": ("noise", [("b", 3), ("c", 2)], 421),
        "down": ("noise", [("c", 3), ("k", 1)], 422),
        "right": ("noise", [("b", 3), ("c", 2)], 423),
        "front": ("noise", [("b", 3), ("c", 2)], 424),
        "left": ("noise", [("b", 3), ("c", 2)], 423),
        "back": ("noise", [("b", 3), ("c", 2)], 425),
    }, p)
    return im


def skin_spider():
    im = new_skin(SKIN64)
    p = {"d": C("#26221F"), "m": C("#332D28"), "l": C("#443B33"),
         "r": C("#C33A2B"), "w": C("#E8D0A0"), "k": C("#1E1E1E")}
    face = [
        "dddddddd",
        "drrddrrd",
        "drrddrrd",
        "dddddddd",
        "dddddddd",
        "ddkkkkdd",
        "ddkddkdd",
        "dddddddd",
    ]
    # body (0,0) 10x8x12
    paint_part(im, 0, 0, 10, 8, 12, {
        "up": ("noise", [("d", 3), ("m", 2), ("l", 1)], 511),
        "down": ("noise", [("d", 4), ("m", 1)], 512),
        "right": ("noise", [("d", 3), ("m", 2), ("l", 1)], 513),
        "front": ("noise", [("d", 3), ("m", 2), ("l", 1)], 514),
        "left": ("noise", [("d", 3), ("m", 2), ("l", 1)], 515),
        "back": ("rows", ["dddddddddd", "dddddddddd", "ddmmmmmmdd", "ddmmwwmmdd",
                          "ddmmwwmmdd", "ddmmmmmmdd", "dddddddddd", "dddddddddd"], 0, 0),
    }, p)
    # head (0,20) 8x8x8
    paint_part(im, 0, 20, 8, 8, 8, {
        "up": ("noise", [("d", 3), ("m", 2)], 501),
        "down": ("noise", [("d", 3), ("m", 2)], 502),
        "right": ("noise", [("d", 3), ("m", 2), ("l", 1)], 503),
        "front": ("rows", face, 0, 0),
        "left": ("noise", [("d", 3), ("m", 2), ("l", 1)], 503),
        "back": ("noise", [("d", 3), ("m", 2)], 504),
    }, p)
    # legs (0,36) 16x2x2
    paint_part(im, 0, 36, 16, 2, 2, {
        "up": ("noise", [("d", 3), ("m", 2)], 521),
        "down": ("noise", [("d", 3), ("m", 2)], 522),
        "right": ("noise", [("d", 3), ("m", 2)], 523),
        "front": ("rows", ["ddddmmdddddmmddd", "dddmmdddddmdddddd"[:16]], 0, 0),
        "left": ("noise", [("d", 3), ("m", 2)], 525),
        "back": ("noise", [("d", 3), ("m", 2), ("l", 1)], 526),
    }, p)
    return im


def quadruped_skin(name, base, dark, light, face_rows, body_rows, size=SKIN32,
                   leg_rows=None, head_size=(8, 8, 8), head_tex=(0, 0),
                   body_size=(10, 16, 8), body_tex=(28, 8),
                   leg_size=(4, 12, 4), leg_tex=(0, 16)):
    """Body sizes are the UNROTATED vanilla box (rotated 90 deg at mesh
    level in Blender) so the box UV fits a 64x32 skin."""
    im = new_skin(size)
    p = {"a": C(base), "d": C(dark), "l": C(light), "m": C("#2A2A2A"),
         "w": C("#FFFFFF"), "k": C("#1E1E1E"), "s": C("#E8A0A0"),
         "n": C("#C88A8A")}
    paint_part(im, head_tex[0], head_tex[1], *head_size, {
        "up": ("noise", [("a", 3), ("d", 2), ("l", 1)], 601),
        "down": ("noise", [("a", 3), ("d", 2)], 602),
        "right": ("noise", [("a", 3), ("d", 2), ("l", 1)], 603),
        "front": ("rows", face_rows, 0, 0),
        "left": ("noise", [("a", 3), ("d", 2), ("l", 1)], 603),
        "back": ("noise", [("a", 3), ("d", 2)], 604),
    }, p)
    paint_part(im, body_tex[0], body_tex[1], *body_size, {
        "up": ("noise", [("a", 3), ("d", 2), ("l", 1)], 611),
        "down": ("noise", [("d", 3), ("a", 2)], 612),
        "right": ("noise", [("a", 4), ("d", 2), ("l", 1)], 613),
        "front": ("noise", [("a", 3), ("d", 2)], 614),
        "left": ("noise", [("a", 4), ("d", 2), ("l", 1)], 615),
        "back": ("noise", [("a", 3), ("d", 2)], 616),
    }, p)
    lf = leg_rows or (["dddd"] * min(leg_size[1], 12))
    paint_part(im, leg_tex[0], leg_tex[1], *leg_size, {
        "up": ("flat", "a"), "down": ("flat", "d"),
        "right": ("rows", lf, 0, 0),
        "front": ("rows", lf, 0, 0),
        "left": ("rows", lf, 0, 0),
        "back": ("rows", lf, 0, 0),
    }, p)
    return im, p


PIG_FACE = [
    "aaaaaaaa",
    "aaaaaaaa",
    "akkaakka",
    "aaaaaaaa",
    "aaalllaa",
    "aalsslaa",
    "aalsslaa",
    "aaaaaaaa",
]


def skin_pig():
    im, p = quadruped_skin("pig", "#E9A5A5", "#D18A8A", "#F2B8B8", PIG_FACE,
                           None, body_size=(10, 16, 8), body_tex=(28, 8),
                           leg_size=(4, 6, 4), leg_tex=(0, 16))
    # snout box (4x3x1) island at (18,16)
    paint_part(im, 18, 16, 4, 3, 1, {
        "up": ("flat", "l"), "down": ("flat", "d"),
        "right": ("flat", "l"),
        "front": ("rows", ["ssss", "slls", "slls"], 0, 0),
        "left": ("flat", "l"),
        "back": ("flat", "d"),
    }, p)
    return im


COW_FACE = [
    "aaaaaaaa",
    "aaaawwaa",
    "aakkaaaa",
    "aaawwaaa",
    "awwwwwwa",
    "aawwwwwa",
    "aawwwwwa",
    "aaaaaaaa",
]


def skin_cow():
    im, p = quadruped_skin("cow", "#4C3A28", "#3A2A1A", "#6B4A31", COW_FACE,
                           None, body_size=(12, 18, 10), body_tex=(18, 4),
                           leg_size=(4, 12, 4), leg_tex=(0, 16))
    # horns (1x2x2) island at (34,0)
    paint_part(im, 34, 0, 1, 2, 2, {
        "up": ("flat", "l"), "down": ("flat", "d"),
        "right": ("flat", "l"), "front": ("flat", "l"),
        "left": ("flat", "l"), "back": ("flat", "d"),
    }, p)
    return im


SHEEP_FACE = [
    "aaaaaaaa",
    "aaakkkaa",
    "aakkkkaa",
    "aaakkkaa",
    "aaalllaa",
    "aalsslaa",
    "aaaaaaaa",
    "aaaaaaaa",
]


def skin_sheep():
    im = new_skin(SKIN32)
    p = {"a": C("#E8D8C8"), "d": C("#CDB8A8"), "l": C("#E8C0C0"),
         "s": C("#C88A8A"), "k": C("#1E1E1E")}
    paint_part(im, 0, 0, 6, 6, 6, {
        "up": ("noise", [("a", 3), ("d", 2)], 701),
        "down": ("noise", [("a", 3), ("d", 2)], 702),
        "right": ("noise", [("a", 3), ("d", 2)], 703),
        "front": ("rows", SHEEP_FACE, 1, 1),
        "left": ("noise", [("a", 3), ("d", 2)], 703),
        "back": ("noise", [("a", 3), ("d", 2)], 704),
    }, p)
    paint_part(im, 28, 8, 10, 16, 8, {
        "up": ("noise", [("a", 3), ("d", 2)], 711),
        "down": ("noise", [("d", 3), ("a", 2)], 712),
        "right": ("noise", [("a", 4), ("d", 1)], 713),
        "front": ("noise", [("a", 3), ("d", 2)], 714),
        "left": ("noise", [("a", 4), ("d", 1)], 713),
        "back": ("noise", [("a", 3), ("d", 2)], 716),
    }, p)
    paint_part(im, 0, 16, 4, 12, 4, {
        "up": ("flat", "a"), "down": ("flat", "d"),
        "right": ("rows", ["aaaa"] * 8 + ["dddd"] * 4, 0, 0),
        "front": ("rows", ["aaaa"] * 8 + ["dddd"] * 4, 0, 0),
        "left": ("rows", ["aaaa"] * 8 + ["dddd"] * 4, 0, 0),
        "back": ("rows", ["aaaa"] * 8 + ["dddd"] * 4, 0, 0),
    }, p)
    return im


def skin_sheep_fur():
    im = new_skin(SKIN32)
    p = {"w": C("#EFEFE4"), "W": C("#D8D8C8"), "v": C("#F7F7EE")}
    wool = {
        "up": ("noise", [("v", 3), ("w", 3), ("W", 2)], 801),
        "down": ("noise", [("w", 3), ("W", 3)], 802),
        "right": ("noise", [("v", 2), ("w", 4), ("W", 2)], 803),
        "front": ("noise", [("v", 2), ("w", 4), ("W", 2)], 804),
        "left": ("noise", [("v", 2), ("w", 4), ("W", 2)], 803),
        "back": ("noise", [("v", 2), ("w", 4), ("W", 2)], 805),
    }
    paint_part(im, 0, 0, 6, 6, 6, wool, p)        # head wool
    paint_part(im, 28, 8, 10, 16, 8, wool, p)     # body wool
    paint_part(im, 0, 16, 4, 12, 4, wool, p)      # leg wool
    return im


CHICKEN_FACE = [
    "wwww",
    "wkkw",
    "wooo",
    "wrrw",
]


def skin_chicken():
    im = new_skin(SKIN32)
    p = {"w": C("#F2F2F2"), "d": C("#D8D8D8"), "k": C("#1E1E1E"),
         "o": C("#E8A33A"), "r": C("#C33A2B"), "m": C("#B0B0B0")}
    # head (0,0) 4x6x3
    paint_part(im, 0, 0, 4, 6, 3, {
        "up": ("noise", [("w", 3), ("d", 2)], 901),
        "down": ("flat", "d"),
        "right": ("noise", [("w", 3), ("d", 2)], 903),
        "front": ("rows", CHICKEN_FACE, 0, 1),
        "left": ("noise", [("w", 3), ("d", 2)], 903),
        "back": ("noise", [("w", 3), ("d", 2)], 904),
    }, p)
    # beak (14,0) 2x2x1
    paint_part(im, 14, 0, 2, 2, 1, {
        "up": ("flat", "o"), "down": ("flat", "o"),
        "right": ("flat", "o"), "front": ("rows", ["oo", "rr"], 0, 0),
        "left": ("flat", "o"), "back": ("flat", "o"),
    }, p)
    # body (0,9) 6x8x6
    paint_part(im, 0, 9, 6, 8, 6, {
        "up": ("noise", [("w", 3), ("d", 2)], 911),
        "down": ("noise", [("d", 3), ("m", 1)], 912),
        "right": ("noise", [("w", 4), ("d", 2)], 913),
        "front": ("noise", [("w", 4), ("d", 2)], 914),
        "left": ("noise", [("w", 4), ("d", 2)], 913),
        "back": ("noise", [("w", 3), ("d", 2), ("m", 1)], 916),
    }, p)
    # wings (24,0) 1x4x6
    paint_part(im, 24, 0, 1, 4, 6, {
        "up": ("flat", "w"), "down": ("flat", "d"),
        "right": ("noise", [("w", 4), ("d", 1)], 921),
        "front": ("flat", "w"), "left": ("flat", "d"),
        "back": ("flat", "w"),
    }, p)
    # legs (40,0) 1x5x1
    paint_part(im, 40, 0, 1, 5, 1, {
        "up": ("flat", "o"), "down": ("flat", "o"),
        "right": ("flat", "o"), "front": ("flat", "o"),
        "left": ("flat", "o"), "back": ("flat", "o"),
    }, p)
    return im


def skin_arm():
    """First-person hand: forearm front face art 8x24 doubled to 16x48."""
    base = human_skin("arm", "#B98A6B", "#00A8A8", "#3B3B8F", "#6B6B6B",
                      "#4A3421", {"face": STEVE_FACE, "eye": "#3A5AC8"})
    # crop right-arm front rect (44, 20, 4, 12) and scale
    arm = base.crop((44, 20, 48, 32)).resize((16, 48), Image.NEAREST)
    return arm


# ---------------------------------------------------------------- gui
def build_gui():
    gui = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    meta = {}

    def put(name, x, y, w, h):
        meta[name] = [x, y, w, h]

    # crosshair 15x15
    cross = Image.new("RGBA", (15, 15), (0, 0, 0, 0))
    px = cross.load()
    for i in range(15):
        px[i, 7] = (255, 255, 255, 200)
        px[7, i] = (255, 255, 255, 200)
    px[7, 7] = (0, 0, 0, 220)
    gui.alpha_composite(cross, (0, 0))
    put("crosshair", 0, 0, 15, 15)

    heart_rows_full = [
        ".##...##.",
        "#rr#.#rr#",
        "#rr#####r"[:9],
        "#rrrrrrrr"[:9],
        "#rrrrrrrr"[:9],
        ".#rrrrrr#"[:9],
        "..#rrrr#.",
        "...#rr#..",
        "....#.#..",
    ]
    heart_rows_empty = [row.replace("r", ".") for row in heart_rows_full]
    heart_rows_half = [
        ".##...##.",
        "#rr#.#..#",
        "#rr#...#."[:9],
        "#rrr#...."[:9],
        "#rrr....."[:9],
        ".#rr#...."[:9],
        "..#rr#...",
        "...#r#...",
        "....#....",
    ]
    hunger_rows = [
        "....###..",
        "...#mm#..",
        "..#mmmm#.",
        ".#mmmmmm#",
        "#mmmmmmmm"[:9],
        "#mmmmmmmm"[:9],
        ".#mmmmmm#"[:9],
        "..#mmmm#.",
        "...#mm#..",
    ]
    hunger_empty = [row.replace("m", ".") for row in hunger_rows]
    hunger_half = [
        "....###..",
        "...#mm#..",
        "..#mm....",
        ".#mm.....",
        "#mm......"[:9],
        "#mm......"[:9],
        ".#m......"[:9],
        "..#......",
        "....#....",
    ]
    pal_h = {"#": C("#2A2A2A"), "r": C("#D33A2B"), "w": C("#FFFFFF"),
             "m": C("#B06A3A"), "1": C("#6B5333")}

    def heart(name, rows, x):
        im = rows_image(rows, pal_h, 9, 9)
        gui.alpha_composite(im, (x, 0))
        put(name, x, 0, 9, 9)

    heart("heart_full", heart_rows_full, 16)
    heart("heart_half", heart_rows_half, 26)
    heart("heart_empty", heart_rows_empty, 36)
    heart("hunger_full", hunger_rows, 46)
    heart("hunger_half", hunger_half, 56)
    heart("hunger_empty", hunger_empty, 66)

    # hotbar bg 182x22
    bar = Image.new("RGBA", (182, 22), (0, 0, 0, 0))
    bpx = bar.load()
    for y in range(22):
        for x in range(182):
            if y in (0, 21) or x in (0, 181):
                bpx[x, y] = C("#1E1E1E")
            elif y in (1, 20) or x in (1, 180):
                bpx[x, y] = C("#373737")
            else:
                bpx[x, y] = C("#8B8B8B", 235)
    for i in range(9):
        for y in range(2, 20):
            for x in range(2 + i * 20, 22 + i * 20):
                if y in (2, 19) or x in (2 + i * 20, 21 + i * 20):
                    bpx[x, y] = C("#373737")
                else:
                    bpx[x, y] = C("#6E6E6E", 235)
    gui.alpha_composite(bar, (0, 16))
    put("hotbar", 0, 16, 182, 22)

    # selector 24x24
    sel = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    spx = sel.load()
    for y in range(24):
        for x in range(24):
            edge = x in (0, 1, 22, 23) or y in (0, 1, 22, 23)
            spx[x, y] = C("#F2F2F2") if edge else (0, 0, 0, 0)
    gui.alpha_composite(sel, (0, 40))
    put("selector", 0, 40, 24, 24)

    # slot 20x20 (inventory)
    slot = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    qpx = slot.load()
    for y in range(20):
        for x in range(20):
            if x in (0, 19) or y in (0, 19):
                qpx[x, y] = C("#373737")
            elif x in (1, 18) or y in (1, 18):
                qpx[x, y] = C("#8B8B8B")
            else:
                qpx[x, y] = C("#6E6E6E")
    gui.alpha_composite(slot, (26, 40))
    put("slot", 26, 40, 20, 20)

    gui.save(os.path.join(OUT, "gui.png"))
    with open(os.path.join(OUT, "gui.json"), "w") as f:
        json.dump(meta, f, indent=1)


# ---------------------------------------------------------------- atlas
def build_atlas():
    tiles = [
        ("grass_top", t_grass_top), ("grass_side", t_grass_side),
        ("dirt", t_dirt), ("stone", t_stone), ("cobblestone", t_cobblestone),
        ("sand", t_sand), ("sandstone_top", t_sandstone_top),
        ("sandstone_side", t_sandstone_side), ("gravel", t_gravel),
        ("log_side", t_log_side), ("log_top", t_log_top), ("leaves", t_leaves),
        ("planks", t_planks), ("glass", t_glass), ("water", t_water),
        ("bedrock", t_bedrock), ("coal_ore", t_coal_ore),
        ("iron_ore", t_iron_ore), ("gold_ore", t_gold_ore),
        ("diamond_ore", t_diamond_ore), ("snow", t_snow),
        ("crafting_top", t_crafting_top), ("crafting_front", t_crafting_front),
        ("crafting_side", t_crafting_side), ("tnt_side", t_tnt_side),
        ("tnt_top", t_tnt_top), ("tnt_bottom", t_tnt_bottom),
        ("cactus_side", t_cactus_side), ("cactus_top", t_cactus_top),
        ("dandelion", t_dandelion), ("poppy", t_poppy),
        ("tall_grass", t_tall_grass),
    ]
    item_tiles = [
        ("icon_stick", "stick", "wood"), ("icon_coal", "gem", "plain"),
        ("icon_iron_ingot", "ingot", "iron"), ("icon_gold_ingot", "ingot", "gold"),
        ("icon_diamond", "gem", "diamond"), ("icon_apple", "apple", "plain"),
        ("icon_bow", "bow", "wood"), ("icon_arrow", "arrow", "iron"),
        ("icon_egg", "egg", "plain"), ("icon_wool", "wool", "plain"),
        ("icon_porkchop", "porkchop", "plain"), ("icon_beef", "beef", "plain"),
    ]
    for mat in ("wood", "stone", "iron", "diamond"):
        for tool in ("pickaxe", "axe", "shovel", "sword"):
            item_tiles.append((f"icon_{mat}_{tool}", tool, mat))
    for i in range(10):
        tiles.append((f"destroy_{i}", lambda i=i: t_destroy(i)))
    tiles.append(("particle_smoke", lambda: t_particle(120, 120, 120)))
    tiles.append(("particle_flame", lambda: t_particle(230, 120, 30)))
    tiles.append(("particle_generic", lambda: t_particle(180, 180, 180)))
    for name, shape, mat in item_tiles:
        tiles.append((name, lambda shape=shape, mat=mat: item_image(shape, mat)))

    atlas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    meta = {}
    for idx, (name, fn) in enumerate(tiles):
        col, row = idx % 16, idx // 16
        atlas.alpha_composite(fn(), (col * 16, row * 16))
        meta[name] = [col * 16, row * 16, 16, 16]
    atlas.save(os.path.join(OUT, "atlas.png"))
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"atlas: {len(tiles)} tiles")


def build_skins():
    jobs = {
        "steve.png": skin_steve(),
        "zombie.png": skin_zombie(),
        "skeleton.png": skin_skeleton(),
        "creeper.png": skin_creeper(),
        "spider.png": skin_spider(),
        "pig.png": skin_pig(),
        "cow.png": skin_cow(),
        "sheep.png": skin_sheep(),
        "sheep_fur.png": skin_sheep_fur(),
        "chicken.png": skin_chicken(),
        "arm.png": skin_arm(),
    }
    for name, im in jobs.items():
        im.save(os.path.join(SKINS, name))
    print(f"skins: {len(jobs)} files")


def build_banner():
    banner = Image.new("RGBA", (768, 128), (0, 0, 0, 0))
    dirt = t_dirt()
    for y in range(0, 128, 16):
        for x in range(0, 768, 16):
            banner.alpha_composite(dirt, (x, y))
    dark = Image.new("RGBA", (768, 128), (0, 0, 0, 110))
    banner.alpha_composite(dark, (0, 0))
    title = "BLOCKCRAFT"
    scale = 8
    tw = text_width(title, scale)
    x0 = (768 - tw) // 2
    draw_text(banner, title, x0, 24, C("#F2F2F2"), scale, shadow=C("#1E1E1E"))
    sub = "A PIXEL VOXEL SANDBOX"
    sw = text_width(sub, 2)
    draw_text(banner, sub, (768 - sw) // 2, 96, C("#C7C7C7"), 2,
              shadow=C("#1E1E1E"))
    banner.save(os.path.join(OUT, "banner.png"))
    print("banner written")


if __name__ == "__main__":
    build_atlas()
    build_gui()
    build_skins()
    build_banner()
    print("done ->", OUT)
