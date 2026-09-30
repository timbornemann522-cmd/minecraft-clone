// Inventory + crafting UI (2x2 from E, 3x3 at a crafting table).

import { Atlas } from "../render/atlas";
import { ITEMS } from "../core/blocks";
import { ItemStack, Player } from "../entities/player";
import { drawText, textWidth } from "./font";
import * as sfx from "../audio/sfx";

interface Recipe {
  pattern?: (string | 0)[][];   // shaped (normalized)
  shapeless?: Record<string, number>;
  out: [string, number];
}

const MATS: Record<string, string> = {
  wood: "block:5", stone: "block:4", iron: "item:iron_ingot", diamond: "item:diamond",
};
const TOOLS: Record<string, [string, number]> = {
  pickaxe: ["pickaxe", 1], axe: ["axe", 1], shovel: ["shovel", 1], sword: ["sword", 1],
};

const RECIPES: Recipe[] = [
  { pattern: [["block:8"]], out: ["block:5", 4] },                    // log -> planks
  { pattern: [["block:5"], ["block:5"]], out: ["item:stick", 4] },    // sticks
  { pattern: [["block:5", "block:5"], ["block:5", "block:5"]], out: ["block:19", 1] }, // table
  { shapeless: { "item:wool": 3, "item:stick": 3 }, out: ["item:bow", 1] },
  { shapeless: { "item:iron_ingot": 1, "item:stick": 1 }, out: ["item:arrow", 4] },
];
for (const [mat, item] of Object.entries(MATS)) {
  const s = "item:stick";
  RECIPES.push({ pattern: [[item, item, item], [0, s, 0], [0, s, 0]], out: [`item:${mat}_pickaxe`, 1] });
  RECIPES.push({ pattern: [[item, item], [item, s], [0, s]], out: [`item:${mat}_axe`, 1] });
  RECIPES.push({ pattern: [[item, item], [s, item], [s, 0]], out: [`item:${mat}_axe`, 1] }); // mirrored
  RECIPES.push({ pattern: [[item], [s], [s]], out: [`item:${mat}_shovel`, 1] });
  RECIPES.push({ pattern: [[item], [item], [s]], out: [`item:${mat}_sword`, 1] });
}

function normalize(pattern: (string | 0)[][]): (string | 0)[][] {
  // trim empty rows/cols
  let rows = pattern.filter((r) => r.some((c) => c !== 0));
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => {
    const rr = r.slice();
    while (rr.length < width) rr.push(0);
    return rr;
  });
  let left = width;
  for (const r of rows) {
    for (let x = 0; x < width; x++) {
      if (r[x] !== 0) { left = Math.min(left, x); break; }
    }
  }
  let right = 0;
  for (const r of rows) {
    for (let x = width - 1; x >= 0; x--) {
      if (r[x] !== 0) { right = Math.max(right, x); break; }
    }
  }
  return rows.map((r) => r.slice(left, right + 1));
}

function sameGrid(a: (string | 0)[][], b: (string | 0)[][]): boolean {
  if (a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false;
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) return false;
  }
  return true;
}

export function matchRecipe(craft: (ItemStack | null)[], size: number): ItemStack | null {
  const grid: (string | 0)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (string | 0)[] = [];
    for (let x = 0; x < size; x++) {
      const s = craft[y * size + x];
      row.push(s ? (s.item as string) : 0);
    }
    grid.push(row);
  }
  const norm = normalize(grid);
  if (!norm.length) return null;
  const counts: Record<string, number> = {};
  for (const s of craft) if (s) counts[s.item] = (counts[s.item] || 0) + 1;

  for (const r of RECIPES) {
    if (r.shapeless) {
      const keys = Object.keys(r.shapeless);
      const all = Object.keys(counts);
      if (all.length !== keys.length) continue;
      if (keys.every((k) => counts[k] === r.shapeless![k])) return { item: r.out[0], count: r.out[1] };
      continue;
    }
    const target = normalize(r.pattern as (string | 0)[][]);
    if (sameGrid(norm, target)) return { item: r.out[0], count: r.out[1] };
  }
  return null;
}

export class InventoryUI {
  el: HTMLCanvasElement;
  cursor: ItemStack | null = null;
  open = false;
  gridSize = 2;
  private atlas: Atlas;
  private player: Player;
  onChangeCraft: () => void = () => {};

  constructor(atlas: Atlas, player: Player) {
    this.atlas = atlas;
    this.player = player;
    this.el = document.createElement("canvas");
    this.el.width = 512;
    this.el.height = 384;
    this.el.style.cssText =
      "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto;image-rendering:pixelated;display:none;cursor:pointer;";
    document.getElementById("ui")!.appendChild(this.el);
    this.el.addEventListener("mousedown", (e) => this.click(e));
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  show(size: number): void {
    this.gridSize = size;
    this.open = true;
    this.el.style.display = "block";
    this.recalc();
    this.draw();
  }

  hide(): void {
    this.open = false;
    this.el.style.display = "none";
    // return cursor + craft grid to inventory
    if (this.cursor) {
      this.player.addItem(this.cursor.item, this.cursor.count);
      this.cursor = null;
    }
    for (let i = 0; i < 9; i++) {
      const s = this.player.craft[i];
      if (s) {
        this.player.addItem(s.item, s.count);
        this.player.craft[i] = null;
      }
    }
  }

  recalc(): void {
    const size = this.gridSize;
    this.player.craftSize = size;
    this.player.craftOut = matchRecipe(this.player.craft, size);
  }

  // slot layout
  private slotRects(): { x: number; y: number; kind: string; index: number }[] {
    const out: { x: number; y: number; kind: string; index: number }[] = [];
    const g = this.gridSize;
    const cw = 40;
    // craft grid
    for (let y = 0; y < g; y++)
      for (let x = 0; x < g; x++)
        out.push({ x: 60 + x * cw, y: 30 + y * cw, kind: "craft", index: y * g + x });
    // result
    out.push({ x: 60 + g * cw + 36, y: 30 + Math.floor(g / 2) * cw, kind: "result", index: 0 });
    // storage 27
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 9; x++)
        out.push({ x: 32 + x * cw, y: 150 + y * cw, kind: "storage", index: 9 + y * 9 + x });
    // hotbar
    for (let x = 0; x < 9; x++)
      out.push({ x: 32 + x * cw, y: 290, kind: "storage", index: x });
    return out;
  }

  private draw(): void {
    const ctx = this.el.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#c6c6c6";
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 378);
    ctx.fillStyle = "#3f3f3f";
    drawText(ctx, "INVENTORY", 32, 10, "#3f3f3f", 2);
    drawText(ctx, this.gridSize === 3 ? "CRAFTING TABLE" : "CRAFTING", 60, 30 + this.gridSize * 40 + 8, "#3f3f3f", 1);

    const slot = this.atlas.gui["slot"];
    for (const r of this.slotRects()) {
      ctx.drawImage(this.atlas.guiImage, slot[0], slot[1], slot[2], slot[3],
                    r.x, r.y, 36, 36);
    }

    const icon = (item: string, count: number, x: number, y: number) => {
      const def = ITEMS[item];
      if (!def) return;
      const ir = this.atlas.rect(def.icon);
      ctx.drawImage(this.atlas.image, ir[0], ir[1], ir[2], ir[3], x + 2, y + 2, 32, 32);
      if (count > 1) drawText(ctx, String(count), x + 18, y + 20, "#fff", 2, "#3f3f3f");
    };

    for (const r of this.slotRects()) {
      if (r.kind === "craft") {
        const s = this.player.craft[r.index];
        if (s) icon(s.item, s.count, r.x, r.y);
      } else if (r.kind === "result") {
        const s = this.player.craftOut;
        if (s) icon(s.item, s.count, r.x, r.y);
      } else {
        const s = this.player.inv[r.index];
        if (s) icon(s.item, s.count, r.x, r.y);
      }
    }
    // crafting arrow
    ctx.fillStyle = "#3f3f3f";
    const ay = 30 + Math.floor(this.gridSize / 2) * 40 + 12;
    ctx.fillRect(60 + this.gridSize * 40 + 8, ay, 16, 6);
    ctx.fillRect(60 + this.gridSize * 40 + 20, ay - 4, 6, 14);

    if (this.cursor) {
      icon(this.cursor.item, this.cursor.count, 8, 340);
    }
    drawText(ctx, "RIGHT CLICK FOR HALF / ONE", 250, 366, "#555", 1);
  }

  private click(e: MouseEvent): void {
    sfx.sfxClick();
    const rect = this.el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 512;
    const my = ((e.clientY - rect.top) / rect.height) * 384;
    const right = e.button === 2;
    for (const r of this.slotRects()) {
      if (mx >= r.x && mx < r.x + 36 && my >= r.y && my < r.y + 36) {
        this.interact(r.kind, r.index, right);
        break;
      }
    }
    this.recalc();
    this.draw();
  }

  private takeStack(): (ItemStack | null)[] {
    return this.player.inv;
  }

  private interact(kind: string, index: number, right: boolean): void {
    const p = this.player;
    let arr: (ItemStack | null)[];
    if (kind === "craft") arr = p.craft;
    else if (kind === "result") {
      // take result, consume grid
      const out = p.craftOut;
      if (!out) return;
      if (!this.cursor) {
        this.cursor = { ...out };
        this.consumeGrid();
      } else if (this.cursor.item === out.item) {
        this.cursor.count += out.count;
        this.consumeGrid();
      }
      return;
    } else arr = p.inv;

    const s = arr[index];
    if (!this.cursor) {
      if (!s) return;
      if (right) {
        const half = Math.ceil(s.count / 2);
        this.cursor = { item: s.item, count: half };
        s.count -= half;
        if (s.count <= 0) arr[index] = null;
      } else {
        this.cursor = s;
        arr[index] = null;
      }
    } else if (!s) {
      if (right) {
        arr[index] = { item: this.cursor.item, count: 1 };
        this.cursor.count--;
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        arr[index] = this.cursor;
        this.cursor = null;
      }
    } else if (s.item === this.cursor.item) {
      const max = ITEMS[s.item]?.stack || 64;
      const add = right ? Math.min(1, max - s.count) : Math.min(this.cursor.count, max - s.count);
      s.count += add;
      this.cursor.count -= add;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      const tmp = arr[index];
      arr[index] = this.cursor;
      this.cursor = tmp;
    }
  }

  private consumeGrid(): void {
    for (let i = 0; i < 9; i++) {
      const s = this.player.craft[i];
      if (s) {
        s.count--;
        if (s.count <= 0) this.player.craft[i] = null;
      }
    }
  }
}
