// Atlas + GUI sprite loading (explicit Vite asset imports).

import atlasJson from "../../assets/textures/atlas.json";
import guiJson from "../../assets/textures/gui.json";
import atlasPng from "../../assets/textures/atlas.png";
import guiPng from "../../assets/textures/gui.png";

export interface Rect {
  x: number; y: number; w: number; h: number;
}

export class Atlas {
  meta: Record<string, number[]> = atlasJson;
  gui: Record<string, number[]> = guiJson;
  image!: HTMLImageElement;
  guiImage!: HTMLImageElement;

  async load(): Promise<void> {
    const [img, gimg] = await Promise.all([
      loadImage(atlasPng),
      loadImage(guiPng),
    ]);
    this.image = img;
    this.guiImage = gimg;
  }

  rect(name: string): number[] {
    return this.meta[name] || this.meta["stone"];
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
