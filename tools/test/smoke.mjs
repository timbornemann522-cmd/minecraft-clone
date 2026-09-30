// Headless logic smoke test (no DOM): worldgen, meshing, recipes, models spec.
// Run: node tools/test/smoke.mjs

import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const entry = `
import { World, findSpawn, SEA_LEVEL } from "@core/world";
import { buildChunkMesh } from "@core/mesher";
import { BLOCKS, ITEMS, B } from "@core/blocks";
import atlasJson from "@assets/textures/atlas.json";
import guiJson from "@assets/textures/gui.json";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name); }
}

// ---- world generation
const w = new World(12345);
const sp = findSpawn(w);
ok(sp.y > 2 && sp.y < 128, "spawn height sane: " + sp.y.toFixed(1));
const top = w.heightAt(0, 0);
ok(top >= 4 && top <= 127, "heightAt range " + top);
const biomes = new Set();
for (let x = -400; x <= 400; x += 40) {
  for (let z = -400; z <= 400; z += 40) biomes.add(w.biomeAt(x, z));
}
ok(biomes.size >= 3, "biome variety: " + [...biomes].join(","));

// surface consistency
const id = w.getBlock(0, top, 0);
ok(id !== 0, "surface block solid at top (" + id + ")");
ok(w.getBlock(0, 0, 0) === B.BEDROCK, "bedrock floor");

// caves/ores exist somewhere in a volume
let ores = 0, caves = 0;
for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) for (let y = 4; y < 40; y++) {
  const b = w.getBlock(x, y, z);
  if (b === B.COAL_ORE || b === B.IRON_ORE || b === B.DIAMOND_ORE || b === B.GOLD_ORE) ores++;
  if (b === 0 && y < w.heightAt(x, z) - 3) caves++;
}
ok(ores > 0, "ores generated: " + ores);
ok(caves > 0, "caves carved: " + caves);

// setBlock + edit recall
w.setBlock(3, top + 3, 3, B.COBBLE, true);
ok(w.getBlock(3, top + 3, 3) === B.COBBLE, "setBlock persists");

// ---- meshing
const cyTop = Math.floor(w.heightAt(2, 2) / 16);
const c = w.getChunk(0, cyTop, 0, true);
const bufs = buildChunkMesh(w, c, atlasJson);
ok(bufs.solid !== null, "surface chunk mesh built (cy " + cyTop + ")");
ok(bufs.solid && bufs.solid.attributes.position.count > 100, "solid verts: " + (bufs.solid ? bufs.solid.attributes.position.count : 0));
ok(bufs.solid && bufs.solid.attributes.uv.count === bufs.solid.attributes.position.count, "uv/pos match");
ok(bufs.solid && bufs.solid.attributes.color.count === bufs.solid.attributes.position.count, "color/pos match");

// ---- blocks/items registry
ok(BLOCKS.length === 25, "block count " + BLOCKS.length);
ok(ITEMS["item:wood_pickaxe"].tool === "pickaxe", "tool def");
ok(ITEMS["block:2"].block === 2, "block item maps");
const missing = [];
for (const b of BLOCKS) {
  for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom]) {
    if (!atlasJson[t]) missing.push(t);
  }
}
for (const it of Object.values(ITEMS)) {
  if (!atlasJson[it.icon]) missing.push(it.icon);
}
ok(missing.length === 0, "all tiles present in atlas" + (missing.length ? ": missing " + missing.join(",") : ""));

// ---- gui meta
for (const k of ["crosshair", "heart_full", "heart_half", "heart_empty", "hunger_full", "hotbar", "selector", "slot"]) {
  if (!guiJson[k]) { ok(false, "gui rect " + k); }
}
ok(true, "gui rects checked");

console.log(pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
`;

const outfile = path.join(root, "tools", "test", ".smoke.bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  alias: {
    "@core": path.join(root, "src", "core"),
    "@assets": path.join(root, "assets"),
  },
  loader: { ".png": "dataurl", ".glb": "dataurl" },
  logLevel: "silent",
});
await import(outfile);
fs.unlinkSync(outfile);
