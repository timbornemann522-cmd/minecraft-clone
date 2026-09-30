// Chunk storage: 16x16x16 voxel columns, world height 128.

export const CH = 16;
export const WORLD_H = 128;
export const CHUNKS_Y = WORLD_H / CH;

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export class Chunk {
  blocks = new Uint8Array(CH * CH * CH);
  dirty = true;
  generated = false;
  constructor(public cx: number, public cy: number, public cz: number) {}

  static idx(x: number, y: number, z: number): number {
    return (y << 8) | (z << 4) | x;
  }

  get(x: number, y: number, z: number): number {
    return this.blocks[Chunk.idx(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks[Chunk.idx(x, y, z)] = id;
    this.dirty = true;
  }
}
