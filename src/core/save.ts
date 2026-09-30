// World persistence: seed, block diffs, player state, time.

import { World } from "./world";

const KEY = "blockcraft_save_v1";

export interface PlayerSave {
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  health: number; hunger: number;
  hotbar: number;
  inv: ({ item: string; count: number } | null)[];
  creative: boolean;
}

export interface SaveGame {
  seed: number;
  time: number;
  edits: [string, number][];
  player: PlayerSave | null;
}

export function saveGame(world: World, time: number, player: PlayerSave): void {
  const data: SaveGame = {
    seed: world.seed,
    time,
    edits: [...world.edits.entries()],
    player,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // storage full or unavailable; ignore
  }
}

export function loadGame(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveGame;
  } catch {
    return null;
  }
}

export function applyEdits(world: World, edits: [string, number][]): void {
  for (const [k, id] of edits) {
    world.edits.set(k, id);
    const [x, y, z] = k.split(",").map(Number);
    const c = world.chunks.get(`${x >> 4},${y >> 4},${z >> 4}`);
    if (c) c.set(x & 15, y & 15, z & 15, id);
  }
}
