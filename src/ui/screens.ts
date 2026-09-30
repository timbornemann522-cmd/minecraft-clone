// Menus: title, pause, death, options. DOM + pixel text.

import { makeTextCanvas, textWidth } from "./font";
import * as sfx from "../audio/sfx";

export interface Options {
  renderDistance: number;
  sensitivity: number;
  volume: number;
  invertY: boolean;
}

export class Screens {
  root: HTMLElement;
  current = "none";
  options: Options = { renderDistance: 6, sensitivity: 1, volume: 0.7, invertY: false };
  onStart: (loadSave: boolean) => void = () => {};
  onResume: () => void = () => {};
  onRespawn: () => void = () => {};
  onQuit: () => void = () => {};
  onOptions: (o: Options) => void = () => {};

  constructor() {
    this.root = document.getElementById("ui")!;
  }

  hide(): void {
    this.current = "none";
    for (const el of [...this.root.querySelectorAll(".screen")]) el.remove();
  }

  private makeScreen(cls: string): HTMLElement {
    this.hide();
    const s = document.createElement("div");
    s.className = "screen " + cls;
    this.root.appendChild(s);
    return s;
  }

  private button(parent: HTMLElement, label: string, onClick: () => void,
                 slim = false): void {
    const b = document.createElement("button");
    b.className = "pixelbtn" + (slim ? " slimbtn" : "");
    b.textContent = label;
    b.addEventListener("click", () => {
      sfx.resumeAudio();
      sfx.sfxClick();
      onClick();
    });
    parent.appendChild(b);
  }

  showTitle(hasSave: boolean): void {
    this.current = "title";
    const s = this.makeScreen("title");
    const logo = makeTextCanvas("BLOCKCRAFT", "#ffffff", 8, "#3f3f3f");
    logo.style.marginBottom = "8px";
    s.appendChild(logo);
    const sub = makeTextCanvas("A PIXEL VOXEL SANDBOX", "#c7c7c7", 2, "#3f3f3f");
    s.appendChild(sub);
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginTop = "18px";
    s.appendChild(panel);
    if (hasSave) {
      this.button(panel, "Continue World", () => this.onStart(true));
    }
    this.button(panel, hasSave ? "New World" : "Singleplayer", () => {
      if (hasSave) localStorage.removeItem("blockcraft_save_v1");
      this.onStart(false);
    });
    this.button(panel, "Options", () => this.showOptions("title"));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "WASD move - space jump - mouse look - left click mine - right click place";
    s.appendChild(hint);
    const hint2 = document.createElement("div");
    hint2.className = "hint";
    hint2.textContent = "E inventory - F3 debug - ESC pause - no emojis - all pixel";
    s.appendChild(hint2);
  }

  showPause(): void {
    this.current = "pause";
    const s = this.makeScreen("");
    const t = makeTextCanvas("GAME PAUSED", "#ffffff", 4, "#3f3f3f");
    s.appendChild(t);
    const panel = document.createElement("div");
    panel.className = "panel";
    s.appendChild(panel);
    this.button(panel, "Resume", () => this.onResume());
    this.button(panel, "Options", () => this.showOptions("pause"));
    this.button(panel, "Save And Quit", () => this.onQuit());
  }

  showDeath(): void {
    this.current = "death";
    const s = this.makeScreen("");
    s.style.background = "rgba(120,0,0,0.45)";
    const t = makeTextCanvas("YOU DIED!", "#ffffff", 6, "#3f3f3f");
    s.appendChild(t);
    const panel = document.createElement("div");
    panel.className = "panel";
    s.appendChild(panel);
    this.button(panel, "Respawn", () => this.onRespawn());
    this.button(panel, "Title Menu", () => this.onQuit());
  }

  showOptions(back: string): void {
    this.current = "options";
    const s = this.makeScreen("");
    const t = makeTextCanvas("OPTIONS", "#ffffff", 4, "#3f3f3f");
    s.appendChild(t);
    const panel = document.createElement("div");
    panel.className = "panel";
    s.appendChild(panel);

    const row = (label: string) => {
      const r = document.createElement("div");
      r.className = "row";
      const l = document.createElement("div");
      l.style.cssText = "width:220px;color:#222;font-weight:bold;letter-spacing:1px;text-transform:uppercase;";
      l.textContent = label;
      r.appendChild(l);
      panel.appendChild(r);
      return r;
    };

    const rd = row(`Render Distance: ${this.options.renderDistance}`);
    this.button(rd, "-", () => {
      this.options.renderDistance = Math.max(2, this.options.renderDistance - 1);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);
    this.button(rd, "+", () => {
      this.options.renderDistance = Math.min(10, this.options.renderDistance + 1);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);

    const sens = row(`Sensitivity: ${this.options.sensitivity.toFixed(2)}`);
    this.button(sens, "-", () => {
      this.options.sensitivity = Math.max(0.1, this.options.sensitivity - 0.25);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);
    this.button(sens, "+", () => {
      this.options.sensitivity = Math.min(3, this.options.sensitivity + 0.25);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);

    const vol = row(`Volume: ${(this.options.volume * 10).toFixed(0)}`);
    this.button(vol, "-", () => {
      this.options.volume = Math.max(0, this.options.volume - 0.1);
      sfx.setVolume(this.options.volume);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);
    this.button(vol, "+", () => {
      this.options.volume = Math.min(1, this.options.volume + 0.1);
      sfx.setVolume(this.options.volume);
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);

    const inv = row(`Invert Y: ${this.options.invertY ? "ON" : "OFF"}`);
    this.button(inv, "Toggle", () => {
      this.options.invertY = !this.options.invertY;
      this.onOptions(this.options);
      this.showOptions(back);
    }, true);

    this.button(panel, "Done", () => {
      if (back === "title") this.showTitle(true);
      else this.showPause();
    });
  }
}
