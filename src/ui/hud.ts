// HUD: hotbar, hearts, hunger, crosshair, item popup, damage flash.

import { Atlas } from "../render/atlas";
import { drawText, textWidth } from "./font";
import { ITEMS } from "../core/blocks";
import { Player } from "../entities/player";
import armPng from "../../assets/textures/skins/arm.png";

export class Hud {
  hudCanvas: HTMLCanvasElement;
  hotbarCanvas: HTMLCanvasElement;
  handCanvas: HTMLCanvasElement;
  debugEl: HTMLDivElement;
  itemNameEl: HTMLDivElement;
  flashEl: HTMLDivElement;
  atlas: Atlas;
  itemTimer = 0;
  lastItem = "";

  constructor(atlas: Atlas) {
    this.atlas = atlas;
    this.hudCanvas = mkCanvas("hudCanvas", 420, 60);
    this.hotbarCanvas = mkCanvas("hotbarCanvas", 182 * 2, 22 * 2);
    this.handCanvas = mkCanvas("handCanvas", 180, 220);
    this.debugEl = document.createElement("div");
    this.debugEl.id = "debug";
    this.itemNameEl = document.createElement("div");
    this.itemNameEl.id = "itemName";
    this.flashEl = document.createElement("div");
    this.flashEl.style.cssText =
      "position:absolute;inset:0;background:#a00;opacity:0;pointer-events:none;transition:opacity 0.25s;";
    const ui = document.getElementById("ui")!;
    ui.append(this.hudCanvas, this.hotbarCanvas, this.handCanvas,
              this.debugEl, this.itemNameEl, this.flashEl);
  }

  showItemName(name: string): void {
    if (name !== this.lastItem) {
      this.lastItem = name;
      this.itemNameEl.textContent = name;
      this.itemTimer = 2.2;
      this.itemNameEl.style.opacity = "1";
    }
  }

  drawIcon(ctx: CanvasRenderingContext2D, item: string,
           x: number, y: number, size: number): void {
    const def = ITEMS[item];
    if (!def) return;
    const r = this.atlas.rect(def.icon);
    const img = this.atlas.image;
    ctx.imageSmoothingEnabled = false;
    // block items render the side texture; 2D items their icon
    ctx.drawImage(img, r[0], r[1], r[2], r[3], x, y, size, size);
  }

  update(dt: number, p: Player, debug: boolean, debugText: string, swing: number): void {
    this.itemTimer -= dt;
    if (this.itemTimer <= 0) this.itemNameEl.style.opacity = "0";
    this.flashEl.style.opacity = String(Math.min(0.45, p.hurtFlash * 1.3));
    this.debugEl.style.display = debug ? "block" : "none";
    if (debug) this.debugEl.textContent = debugText;

    // ---- hotbar
    const h = this.hotbarCanvas.getContext("2d")!;
    h.imageSmoothingEnabled = false;
    h.clearRect(0, 0, this.hotbarCanvas.width, this.hotbarCanvas.height);
    const bar = this.atlas.gui["hotbar"];
    h.drawImage(this.atlas.guiImage, bar[0], bar[1], bar[2], bar[3],
                0, 0, this.hotbarCanvas.width, this.hotbarCanvas.height);
    for (let i = 0; i < 9; i++) {
      const s = p.inv[i];
      if (s) {
        this.drawIcon(h, s.item, i * 40 + 10, 10, 32);
        if (s.count > 1) {
          drawText(h, String(s.count), i * 40 + 30, 26, "#fff", 2, "#3f3f3f");
        }
      }
    }
    const sel = this.atlas.gui["selector"];
    h.drawImage(this.atlas.guiImage, sel[0], sel[1], sel[2], sel[3],
                p.hotbar * 40 - 2, -2, 48, 48);

    // ---- hearts + hunger
    const u = this.hudCanvas.getContext("2d")!;
    u.imageSmoothingEnabled = false;
    u.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
    const hearts = Math.max(0, p.health) / 2;
    for (let i = 0; i < 10; i++) {
      let name = "heart_empty";
      if (hearts >= i + 1) name = "heart_full";
      else if (hearts > i) name = "heart_half";
      const r = this.atlas.gui[name];
      u.drawImage(this.atlas.guiImage, r[0], r[1], r[2], r[3],
                  200 + i * 18, 0, 18, 18);
    }
    const food = Math.max(0, p.hunger) / 2;
    for (let i = 0; i < 10; i++) {
      let name = "hunger_empty";
      if (food >= i + 1) name = "hunger_full";
      else if (food > i) name = "hunger_half";
      const r = this.atlas.gui[name];
      u.drawImage(this.atlas.guiImage, r[0], r[1], r[2], r[3],
                  396 - i * 18, 0, 18, 18);
    }
    // bubbles when underwater (simple squares)
    if (p.air < 15) {
      for (let i = 0; i < Math.ceil(p.air); i++) {
        u.fillStyle = "#bfe8ff";
        u.fillRect(396 - i * 12, 24, 8, 8);
      }
    }

    // ---- first person hand + held item
    const hc = this.handCanvas.getContext("2d")!;
    hc.imageSmoothingEnabled = false;
    hc.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height);
    hc.save();
    hc.translate(60, 60 + swing * 24);
    hc.rotate(-0.5 + swing * 0.6);
    hc.restore();
    // draw arm sprite from skins (loaded via image url embedded in atlas flow)
    drawHand(hc, this.handAtlasImg, swing);
    const held = p.held();
    if (held) {
      this.drawIcon(hc, held.item, 66, 60 + swing * 20, 56);
    }
  }

  handAtlasImg: HTMLImageElement | null = null;

  async loadArm(): Promise<void> {
    const img = new Image();
    img.src = armPng;
    await img.decode().catch(() => undefined);
    this.handAtlasImg = img;
  }
}

function drawHand(ctx: CanvasRenderingContext2D, arm: HTMLImageElement | null,
                  swing: number): void {
  ctx.save();
  ctx.translate(24, 96 + swing * 30);
  ctx.rotate(0.45 - swing * 0.7);
  if (arm && arm.width > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(arm, 0, 0, arm.width, arm.height, 0, 0, 64, 130);
  } else {
    ctx.fillStyle = "#b98a6b";
    ctx.fillRect(0, 0, 56, 120);
    ctx.fillStyle = "#00a8a8";
    ctx.fillRect(0, 0, 56, 34);
  }
  ctx.restore();
}

function mkCanvas(id: string, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.id = id;
  cv.width = w;
  cv.height = h;
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  return cv;
}
