// Chunk meshing with per-vertex ambient occlusion and sky light baked
// into vertex colors (Minecraft-style smooth shading on pixel textures).

import * as THREE from "three";
import { B, BLOCKS, isOpaqu } from "./blocks";
import { CH, Chunk, WORLD_H } from "./chunk";
import { World } from "./world";

export interface AtlasMeta {
  [name: string]: number[];
}

interface FaceDef {
  dir: [number, number, number];
  // 4 corners (x,y,z offsets from block corner 0..1), CCW from outside
  corners: [number, number, number][];
  shade: number;
  tileKey: "top" | "bottom" | "side";
}

const FACES: FaceDef[] = [
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8, tileKey: "side" },   // front +Z
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, tileKey: "side" },  // back -Z
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6, tileKey: "side" },  // right -X
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.6, tileKey: "side" },   // left +X
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, tileKey: "top" },    // up
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, tileKey: "bottom" }, // down
];

const UV_CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

export interface MeshBuffers {
  solid: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

function aoLevel(s1: boolean, s2: boolean, c: boolean): number {
  if (s1 && s2) return 0;
  return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
}

export function buildChunkMesh(world: World, chunk: Chunk,
                               atlas: AtlasMeta): MeshBuffers {
  const pos: number[] = [];
  const uvs: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const wpos: number[] = [];
  const wuvs: number[] = [];
  const wcols: number[] = [];
  const widx: number[] = [];

  const bx = chunk.cx << 4, by = chunk.cy << 4, bz = chunk.cz << 4;

  function tileUV(tile: number[], fx: number, fy: number): [number, number] {
    const u = (tile[0] + 0.5 + fx * 15) / 256;
    const v = 1 - (tile[1] + 0.5 + (1 - fy) * 15) / 256;
    return [u, v];
  }

  const sample = (x: number, y: number, z: number): number =>
    world.getBlockNoGen(x, y, z);

  for (let ly = 0; ly < CH; ly++) {
    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        const id = chunk.get(lx, ly, lz);
        if (id === 0) continue;
        const def = BLOCKS[id];
        const x = bx + lx, y = by + ly, z = bz + lz;

        if (def.cross) {
          const tile = atlas[def.tiles.side];
          if (!tile) continue;
          const light = world.skyLight(x, y, z);
          const s = 0.35 + 0.65 * light;
          const quads = [
            [[0.1, 0, 0.1], [0.9, 0, 0.9], [0.9, 1, 0.9], [0.1, 1, 0.1]],
            [[0.9, 0, 0.1], [0.1, 0, 0.9], [0.1, 1, 0.9], [0.9, 1, 0.1]],
          ];
          for (const q of quads) {
            const base = pos.length / 3;
            for (let i = 0; i < 4; i++) {
              pos.push(x + q[i][0], y + q[i][1], z + q[i][2]);
              const [u, v] = tileUV(tile, UV_CORNERS[i][0], UV_CORNERS[i][1]);
              uvs.push(u, v);
              cols.push(s, s, s);
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nId = sample(nx, ny, nz);
          const nDef = BLOCKS[nId];
          let visible: boolean;
          if (nDef.opaque) {
            visible = false;
          } else if (def.liquid) {
            visible = nId !== id;
          } else {
            visible = nId !== id;
          }
          if (!visible) continue;

          const tileName = def.tiles[face.tileKey];
          const tile = atlas[tileName];
          if (!tile) continue;

          const base = (def.liquid ? wpos : pos).length / 3;
          const P = def.liquid ? wpos : pos;
          const U = def.liquid ? wuvs : uvs;
          const C = def.liquid ? wcols : cols;

          const lightHere = world.skyLight(x, y, z);
          for (let i = 0; i < 4; i++) {
            const cor = face.corners[i];
            P.push(x + cor[0], y + cor[1], z + cor[2]);
            const [u, v] = tileUV(tile, UV_CORNERS[i][0], UV_CORNERS[i][1]);
            U.push(u, v);

            let ao = 3;
            if (!def.liquid && !def.cross) {
              const d = face.dir;
              let s1x = x, s1y = y, s1z = z, s2x = x, s2y = y, s2z = z;
              let cx2 = x, cy2 = y, cz2 = z;
              if (d[0] !== 0) {
                const sx = x + d[0];
                const oy = cor[1] === 1 ? 1 : -1;
                const oz = cor[2] === 1 ? 1 : -1;
                s1x = sx; s1y = y + oy; s1z = z;
                s2x = sx; s2y = y; s2z = z + oz;
                cx2 = sx; cy2 = y + oy; cz2 = z + oz;
              } else if (d[1] !== 0) {
                const sy = y + d[1];
                const ox = cor[0] === 1 ? 1 : -1;
                const oz = cor[2] === 1 ? 1 : -1;
                s1x = x + ox; s1y = sy; s1z = z;
                s2x = x; s2y = sy; s2z = z + oz;
                cx2 = x + ox; cy2 = sy; cz2 = z + oz;
              } else {
                const sz = z + d[2];
                const ox = cor[0] === 1 ? 1 : -1;
                const oy = cor[1] === 1 ? 1 : -1;
                s1x = x + ox; s1y = y; s1z = sz;
                s2x = x; s2y = y + oy; s2z = sz;
                cx2 = x + ox; cy2 = y + oy; cz2 = sz;
              }
              ao = aoLevel(isOpaqu(sample(s1x, s1y, s1z)),
                           isOpaqu(sample(s2x, s2y, s2z)),
                           isOpaqu(sample(cx2, cy2, cz2)));
            }
            const aoF = [0.45, 0.65, 0.82, 1.0][ao];
            const s = face.shade * aoF * (0.25 + 0.75 * lightHere);
            C.push(s, s, s);
          }
          const I = def.liquid ? widx : idx;
          I.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const make = (p: number[], u: number[], c: number[], i: number[]) => {
    if (p.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(i);
    g.computeBoundingSphere();
    return g;
  };

  return {
    solid: make(pos, uvs, cols, idx),
    water: make(wpos, wuvs, wcols, widx),
  };
}
