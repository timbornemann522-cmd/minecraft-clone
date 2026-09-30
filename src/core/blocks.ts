// Block registry. Tile names map into assets/textures/atlas.json.

export const B = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLE: 4,
  PLANKS: 5,
  SAND: 6,
  GRAVEL: 7,
  LOG: 8,
  LEAVES: 9,
  GLASS: 10,
  WATER: 11,
  BEDROCK: 12,
  COAL_ORE: 13,
  IRON_ORE: 14,
  GOLD_ORE: 15,
  DIAMOND_ORE: 16,
  SNOW: 17,
  SANDSTONE: 18,
  CRAFTING: 19,
  TNT: 20,
  CACTUS: 21,
  DANDELION: 22,
  POPPY: 23,
  TALL_GRASS: 24,
} as const;

export type Tool = "pickaxe" | "axe" | "shovel" | "none";

export interface BlockDef {
  id: number;
  name: string;
  label: string;
  tiles: { top: string; bottom: string; side: string };
  solid: boolean;     // has collision
  opaque: boolean;    // fully hides neighbor faces + blocks light
  cross: boolean;     // X-quad plant
  liquid: boolean;
  hardness: number;   // seconds to break bare-handed-ish
  tool: Tool;
  tier: number;       // min tool tier for drops: 0 hand, 1 wood/stone pick ok, 2 stone, 3 iron
  drop: string | null;    // item name dropped (null = block itself as item "block:<id>")
  light: number;      // emitted light 0..1
}

function def(id: number, name: string, label: string, tiles: any,
            opts: Partial<BlockDef> = {}): BlockDef {
  return {
    id, name, label,
    tiles: typeof tiles === "string"
      ? { top: tiles, bottom: tiles, side: tiles }
      : tiles,
    solid: true, opaque: true, cross: false, liquid: false,
    hardness: 1, tool: "none", tier: 0,
    drop: `block:${id}`, light: 0, ...opts,
  };
}

export const BLOCKS: BlockDef[] = [
  def(0, "air", "Air", "stone", { solid: false, opaque: false, drop: null, hardness: 0 }),
  def(1, "stone", "Stone", "stone", { hardness: 1.5, tool: "pickaxe", tier: 1, drop: "block:4" }),
  def(2, "grass", "Grass Block", { top: "grass_top", bottom: "dirt", side: "grass_side" }, { hardness: 0.6, tool: "shovel", drop: "block:3" }),
  def(3, "dirt", "Dirt", "dirt", { hardness: 0.5, tool: "shovel" }),
  def(4, "cobblestone", "Cobblestone", "cobblestone", { hardness: 2, tool: "pickaxe", tier: 1 }),
  def(5, "planks", "Oak Planks", "planks", { hardness: 2, tool: "axe" }),
  def(6, "sand", "Sand", "sand", { hardness: 0.5, tool: "shovel" }),
  def(7, "gravel", "Gravel", "gravel", { hardness: 0.6, tool: "shovel" }),
  def(8, "log", "Oak Log", { top: "log_top", bottom: "log_top", side: "log_side" }, { hardness: 2, tool: "axe" }),
  def(9, "leaves", "Oak Leaves", "leaves", { opaque: false, hardness: 0.2, tool: "none", drop: null }),
  def(10, "glass", "Glass", "glass", { opaque: false, hardness: 0.3, drop: null }),
  def(11, "water", "Water", "water", { solid: false, opaque: false, liquid: true, hardness: 100, drop: null }),
  def(12, "bedrock", "Bedrock", "bedrock", { hardness: 1e9 }),
  def(13, "coal_ore", "Coal Ore", "coal_ore", { hardness: 3, tool: "pickaxe", tier: 1, drop: "item:coal" }),
  def(14, "iron_ore", "Iron Ore", "iron_ore", { hardness: 3, tool: "pickaxe", tier: 2 }),
  def(15, "gold_ore", "Gold Ore", "gold_ore", { hardness: 3, tool: "pickaxe", tier: 3 }),
  def(16, "diamond_ore", "Diamond Ore", "diamond_ore", { hardness: 3, tool: "pickaxe", tier: 3, drop: "item:diamond" }),
  def(17, "snow", "Snow Block", "snow", { hardness: 0.6, tool: "shovel" }),
  def(18, "sandstone", "Sandstone", { top: "sandstone_top", bottom: "sandstone_top", side: "sandstone_side" }, { hardness: 2, tool: "pickaxe", tier: 1 }),
  def(19, "crafting_table", "Crafting Table", { top: "crafting_top", bottom: "planks", side: "crafting_side" }, { hardness: 2.5, tool: "axe" }),
  def(20, "tnt", "TNT", { top: "tnt_top", bottom: "tnt_bottom", side: "tnt_side" }, { hardness: 0.1 }),
  def(21, "cactus", "Cactus", { top: "cactus_top", bottom: "cactus_top", side: "cactus_side" }, { opaque: false, hardness: 0.4 }),
  def(22, "dandelion", "Dandelion", "dandelion", { solid: false, opaque: false, cross: true, hardness: 0.1, drop: "block:22" }),
  def(23, "poppy", "Poppy", "poppy", { solid: false, opaque: false, cross: true, hardness: 0.1, drop: "block:23" }),
  def(24, "tall_grass", "Tall Grass", "tall_grass", { solid: false, opaque: false, cross: true, hardness: 0.1, drop: null }),
];

export const BLOCK_NAME: Record<string, number> = {};
for (const b of BLOCKS) BLOCK_NAME[b.name] = b.id;

export function isOpaqu(id: number): boolean {
  return id !== 0 && BLOCKS[id].opaque;
}

export function isSolid(id: number): boolean {
  return id !== 0 && BLOCKS[id].solid;
}

// ------------------------------------------------------------- items
export interface ItemDef {
  name: string;
  label: string;
  icon: string;         // atlas tile
  stack: number;
  block: number | null; // placeable block id
  tool: Tool | null;
  tier: number;         // 0 wood, 1 stone, 2 iron, 3 diamond (tools)
  damage: number;       // attack damage (swords/tools)
  speed: number;        // mining speed multiplier
  heal: number;         // food
}

function item(name: string, label: string, icon: string,
              opts: Partial<ItemDef> = {}): ItemDef {
  return {
    name, label, icon, stack: 64, block: null, tool: null, tier: 0,
    damage: 1, speed: 1, heal: 0, ...opts,
  };
}

export const ITEMS: Record<string, ItemDef> = {};
function reg(it: ItemDef) { ITEMS[it.name] = it; }

for (const b of BLOCKS) {
  if (b.id === 0 || b.id === 11) continue;
  const tile = b.id === 2 ? "grass_top" : b.tiles.side;
  reg(item(`block:${b.id}`, b.label, tile, { block: b.id }));
}
reg(item("item:stick", "Stick", "icon_stick"));
reg(item("item:coal", "Coal", "icon_coal"));
reg(item("item:iron_ingot", "Iron Ingot", "icon_iron_ingot"));
reg(item("item:gold_ingot", "Gold Ingot", "icon_gold_ingot"));
reg(item("item:diamond", "Diamond", "icon_diamond"));
reg(item("item:apple", "Apple", "icon_apple", { heal: 4 }));
reg(item("item:bow", "Bow", "icon_bow", { stack: 1, damage: 1 }));
reg(item("item:arrow", "Arrow", "icon_arrow"));
reg(item("item:egg", "Egg", "icon_egg"));
reg(item("item:wool", "Wool", "icon_wool", { block: -1 }));
reg(item("item:porkchop", "Raw Porkchop", "icon_porkchop", { heal: 3 }));
reg(item("item:beef", "Raw Beef", "icon_beef", { heal: 3 }));

const TIER_LABEL = ["", "stone", "iron", "diamond"];
const TIER_MAT = ["wood", "stone", "iron", "diamond"];
for (let t = 0; t < 4; t++) {
  for (const tool of ["pickaxe", "axe", "shovel"] as Tool[]) {
    const name = `item:${TIER_MAT[t]}_${tool}`;
    reg(item(name, `${TIER_LABEL[t]} ${tool}`.replace(" ", " ").trim(), `icon_${TIER_MAT[t]}_${tool}`, {
      stack: 1, tool, tier: t + 1,
      damage: t + 2, speed: 2 + t * 2,
    }));
  }
  reg(item(`item:${TIER_MAT[t]}_sword`, `${TIER_LABEL[t]} sword`, `icon_${TIER_MAT[t]}_sword`, {
    stack: 1, tool: "none", tier: 0,
    damage: 4 + t, speed: 1.5,
  }));
}
// fix labels for wood tier
ITEMS["item:wood_pickaxe"].label = "Wooden Pickaxe";
ITEMS["item:wood_axe"].label = "Wooden Axe";
ITEMS["item:wood_shovel"].label = "Wooden Shovel";
ITEMS["item:wood_sword"].label = "Wooden Sword";
ITEMS["item:stone_pickaxe"].label = "Stone Pickaxe";
ITEMS["item:stone_axe"].label = "Stone Axe";
ITEMS["item:stone_shovel"].label = "Stone Shovel";
ITEMS["item:stone_sword"].label = "Stone Sword";
ITEMS["item:iron_pickaxe"].label = "Iron Pickaxe";
ITEMS["item:iron_axe"].label = "Iron Axe";
ITEMS["item:iron_shovel"].label = "Iron Shovel";
ITEMS["item:iron_sword"].label = "Iron Sword";
ITEMS["item:diamond_pickaxe"].label = "Diamond Pickaxe";
ITEMS["item:diamond_axe"].label = "Diamond Axe";
ITEMS["item:diamond_shovel"].label = "Diamond Shovel";
ITEMS["item:diamond_sword"].label = "Diamond Sword";

// wool block placement is cosmetic; map to snow tile look via custom id later if needed
ITEMS["item:wool"].icon = "icon_wool";
