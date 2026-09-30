// Voxel world: terrain generation (biomes, caves, ores, trees, water),
// block access, edits, and column sky-light.

import { B, BLOCKS, isOpaqu } from "./blocks";
import { Chunk, CH, WORLD_H, chunkKey } from "./chunk";
import { fbm2, fbm3, perlin2 } from "./noise";
import { hash2, mulberry32 } from "./rng";

export type Biome = "plains" | "forest" | "desert" | "snowy" | "mountains";

export const SEA_LEVEL = 46;

export class World {
  chunks = new Map<string, Chunk>();
  edits = new Map<string, number>();       // "x,y,z" -> id (player edits)
  colTop = new Map<string, number>();      // "x,z" -> top solid y (lighting)
  seed: number;
  spawnX = 8;
  spawnY = 80;
  spawnZ = 8;

  constructor(seed: number) {
    this.seed = seed;
  }

  // ----------------------------------------------------------- access
  getChunk(cx: number, cy: number, cz: number, gen = true): Chunk | null {
    if (cy < 0 || cy >= WORLD_H / CH) return null;
    const k = chunkKey(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c) {
      if (!gen) return null;
      c = new Chunk(cx, cy, cz);
      this.chunks.set(k, c);
    }
    if (gen && !c.generated) this.generateChunk(c);
    return c;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_H) return 0;
    const cx = x >> 4, cy = y >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cy, cz, true);
    return c ? c.get(x & 15, y & 15, z & 15) : 0;
  }

  getBlockNoGen(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_H) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, y >> 4, z >> 4));
    return c && c.generated ? c.get(x & 15, y & 15, z & 15) : 0;
  }

  setBlock(x: number, y: number, z: number, id: number, record = true): void {
    if (y < 0 || y >= WORLD_H) return;
    const c = this.getChunk(x >> 4, y >> 4, z >> 4, true);
    if (!c) return;
    c.set(x & 15, y & 15, z & 15, id);
    if (record) this.edits.set(`${x},${y},${z}`, id);
    this.invalidateColumn(x, z);
    // mark neighbor chunks dirty when on borders
    const lx = x & 15, lz = z & 15, ly = y & 15;
    const mark = (cx: number, cy: number, cz: number) => {
      const n = this.chunks.get(chunkKey(cx, cy, cz));
      if (n) n.dirty = true;
    };
    if (lx === 0) mark((x >> 4) - 1, y >> 4, z >> 4);
    if (lx === 15) mark((x >> 4) + 1, y >> 4, z >> 4);
    if (lz === 0) mark(x >> 4, y >> 4, (z >> 4) - 1);
    if (lz === 15) mark(x >> 4, y >> 4, (z >> 4) + 1);
    if (ly === 0) mark(x >> 4, (y >> 4) - 1, z >> 4);
    if (ly === 15) mark(x >> 4, (y >> 4) + 1, z >> 4);
  }

  // set during generation without edit bookkeeping (may generate neighbor)
  setGen(x: number, y: number, z: number, id: number): void {
    const c = this.getChunk(x >> 4, y >> 4, z >> 4, true);
    if (c && c.generated) {
      c.set(x & 15, y & 15, z & 15, id);
    }
  }

  invalidateColumn(x: number, z: number): void {
    this.colTop.delete(`${x},${z}`);
  }

  // top solid Y for sky light (recomputed lazily)
  columnTop(x: number, z: number): number {
    const k = `${x},${z}`;
    let t = this.colTop.get(k);
    if (t !== undefined) return t;
    t = 0;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== 0 && BLOCKS[id].opaque) { t = y; break; }
    }
    this.colTop.set(k, t);
    return t;
  }

  // sky light 0..1 at position (canopy shading + cave falloff)
  skyLight(x: number, y: number, z: number): number {
    const top = this.columnTop(x, z);
    if (y >= top + 1) return 1;
    const depth = top + 1 - y;
    return Math.max(0.12, 1 - depth * 0.22);
  }

  // --------------------------------------------------------- generation
  heightAt(x: number, z: number): number {
    const s = this.seed * 0.001;
    const hills = fbm2(x * 0.012 + s, z * 0.012 - s, 4);
    const ridge = Math.abs(perlin2(x * 0.004 + 31 + s, z * 0.004 + 17 - s));
    const mountMask = Math.max(0, fbm2(x * 0.003 - s, z * 0.003 + s, 2)) * 1.4;
    let h = 48 + hills * 10;
    if (mountMask > 0.32) {
      h += (mountMask - 0.32) * 90 * (0.4 + ridge);
    }
    return Math.max(4, Math.min(WORLD_H - 20, Math.floor(h)));
  }

  biomeAt(x: number, z: number): Biome {
    const s = this.seed * 0.001;
    const temp = perlin2(x * 0.0045 + 100 + s, z * 0.0045 - 55 - s);
    const hum = perlin2(x * 0.0045 - 77 - s, z * 0.0045 + 23 + s);
    const h = this.heightAt(x, z);
    if (h > 78) return "mountains";
    if (temp > 0.28 && hum < 0.05) return "desert";
    if (temp < -0.28) return "snowy";
    if (hum > 0.12) return "forest";
    return "plains";
  }

  private generateChunk(c: Chunk): void {
    c.generated = true;
    const bx = c.cx << 4, by = c.cy << 4, bz = c.cz << 4;
    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        const x = bx + lx, z = bz + lz;
        const top = this.heightAt(x, z);
        const biome = this.biomeAt(x, z);
        for (let ly = 0; ly < CH; ly++) {
          const y = by + ly;
          let id = 0;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (y <= 2 && hash2(x * 3 + y, z * 3 - y, this.seed) < 0.6) {
            id = B.BEDROCK;
          } else if (y <= top) {
            // caves: cheese rooms + spaghetti tunnels
            const cheese = fbm3(x * 0.055 + 9, y * 0.085, z * 0.055 - 4, 2);
            const spaghetti = Math.abs(fbm3(x * 0.045 - 21, y * 0.07, z * 0.045 + 13, 2));
            const isCave = y > 3 && y < top - 1 &&
              (cheese > 0.26 || spaghetti < 0.045);
            if (isCave) {
              id = 0;
            } else if (y === top) {
              id = this.surfaceBlock(biome, top);
            } else if (y >= top - 3) {
              id = biome === "desert"
                ? (y >= top - 1 ? B.SAND : B.SANDSTONE)
                : B.DIRT;
            } else {
              id = B.STONE;
              // ores
              const o = hash2(x * 7 + y * 13, z * 11 - y * 3, this.seed + 5);
              if (y <= 12 && o < 0.004) id = B.DIAMOND_ORE;
              else if (y <= 20 && o < 0.010) id = B.GOLD_ORE;
              else if (y <= 42 && o < 0.028) id = B.IRON_ORE;
              else if (y <= 68 && o < 0.055) id = B.COAL_ORE;
              else if (o > 0.96 && y < top - 4) id = B.GRAVEL;
            }
          } else if (y <= SEA_LEVEL && top < SEA_LEVEL) {
            id = B.WATER;
          }
          if (id) c.blocks[Chunk.idx(lx, ly, lz)] = id;
        }
        // beach sand
        if (top >= SEA_LEVEL - 2 && top <= SEA_LEVEL + 1 && biome !== "snowy" && biome !== "desert") {
          for (let y = top; y >= top - 2; y--) {
            if (y >= 0 && y < WORLD_H && this.getBlockNoGen(x, y, z) === B.DIRT) {
              this.setGen(x, y, z, B.SAND);
            }
          }
        }
      }
    }
    // player edits applied on top
    for (const [k, id] of this.edits) {
      const [x, y, z] = k.split(",").map(Number);
      if ((x >> 4) === c.cx && (y >> 4) === c.cy && (z >> 4) === c.cz) {
        c.set(x & 15, y & 15, z & 15, id);
      }
    }
    // decorations (deterministic per surface column; may touch neighbors)
    for (let lz = -3; lz < CH + 3; lz++) {
      for (let lx = -3; lx < CH + 3; lx++) {
        const x = bx + lx, z = bz + lz;
        this.decorateColumn(x, z);
      }
    }
  }

  private surfaceBlock(biome: Biome, top: number): number {
    switch (biome) {
      case "desert": return B.SAND;
      case "snowy": return top < SEA_LEVEL ? B.DIRT : B.SNOW;
      case "mountains": return top > 92 ? B.STONE : (top > 80 ? B.COBBLE : B.GRASS);
      default:
        return top < SEA_LEVEL ? B.DIRT : B.GRASS;
    }
  }

  private decorateColumn(x: number, z: number): void {
    const top = this.heightAt(x, z);
    if (top <= SEA_LEVEL) return;
    const biome = this.biomeAt(x, z);
    const r = hash2(x, z, this.seed + 99);
    const r2 = hash2(x + 313, z - 771, this.seed + 55);

    const surface = this.getBlockNoGen(x, top, z);
    const above = this.getBlockNoGen(x, top + 1, z);
    if (surface === 0 || above !== 0) {
      // water/air surface column handled elsewhere
      if (surface !== 0 && above !== 0) return;
    }

    const canPlant = surface === B.GRASS || surface === B.SNOW;

    if (biome === "desert") {
      if (r < 0.012 && surface === B.SAND) {
        const h = 1 + Math.floor(r2 * 3);
        for (let i = 1; i <= h; i++) this.setGen(x, top + i, z, B.CACTUS);
      }
      return;
    }

    // trees
    const treeP = biome === "forest" ? 0.05 : biome === "snowy" ? 0.01 : 0.012;
    if (r < treeP && canPlant) {
      this.placeOak(x, top + 1, z, 4 + Math.floor(r2 * 3));
      return;
    }

    if (canPlant && biome === "plains" || canPlant && biome === "forest") {
      if (r2 < 0.04) {
        this.setGen(x, top + 1, z, hash2(x, z, 7) < 0.5 ? B.DANDELION : B.POPPY);
      } else if (r2 < 0.30) {
        this.setGen(x, top + 1, z, B.TALL_GRASS);
      }
    }
  }

  private placeOak(x: number, y: number, z: number, h: number): void {
    // trunk
    for (let i = 0; i < h; i++) {
      if (this.getBlockNoGen(x, y + i, z) === 0) this.setGen(x, y + i, z, B.LOG);
    }
    // canopy
    const cy = y + h - 2;
    for (let dy = 0; dy <= 2; dy++) {
      const rad = dy === 2 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < 2) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 2 || hash2(x + dx, z + dz, this.seed) < 0.5)) continue;
          const yy = cy + dy;
          if (this.getBlockNoGen(x + dx, yy, z + dz) === 0) {
            this.setGen(x + dx, yy, z + dz, B.LEAVES);
          }
        }
      }
    }
    if (this.getBlockNoGen(x, cy + 3, z) === 0) this.setGen(x, cy + 3, z, B.LEAVES);
  }

  // ------------------------------------------------------------- physics
  isSolidAt(x: number, y: number, z: number): boolean {
    return BLOCKS[this.getBlock(x, y, z)].solid;
  }

  raycast(ox: number, oy: number, oz: number,
          dx: number, dy: number, dz: number, maxDist: number):
    { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
    // Amanatides & Woo voxel traversal
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : 1e30;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : 1e30;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : 1e30;
    let tMaxX = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX) : 1e30;
    let tMaxY = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY) : 1e30;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : 1e30;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    for (let i = 0; i < 128 && t <= maxDist; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== 0 && BLOCKS[id].solid) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        t = tMaxX; tMaxX += tDeltaX; x += stepX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        t = tMaxY; tMaxY += tDeltaY; y += stepY; nx = 0; ny = -stepY; nz = 0;
      } else {
        t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }
}

export function findSpawn(world: World): { x: number; y: number; z: number } {
  for (let r = 0; r < 40; r++) {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor((mulberry32(r * 31 + i)() - 0.5) * 40);
      const z = Math.floor((mulberry32(r * 17 + i + 9)() - 0.5) * 40);
      const top = world.heightAt(x, z);
      if (top > SEA_LEVEL + 1) {
        return { x: x + 0.5, y: top + 2.2, z: z + 0.5 };
      }
    }
  }
  return { x: 8.5, y: 90, z: 8.5 };
}
