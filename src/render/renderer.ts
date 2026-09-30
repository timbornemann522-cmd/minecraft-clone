// Renderer: scene, materials, chunk mesh streaming around the player.

import * as THREE from "three";
import { chunkKey, WORLD_H, CH } from "../core/chunk";
import { buildChunkMesh } from "../core/mesher";
import { World } from "../core/world";
import { Atlas } from "./atlas";

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  blockMat: THREE.MeshBasicMaterial;
  waterMat: THREE.MeshBasicMaterial;
  meshes = new Map<string, { solid?: THREE.Mesh; water?: THREE.Mesh }>();
  dayBrightness = 1;
  renderDistance = 6;

  constructor(canvas: HTMLCanvasElement, atlas: Atlas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400);

    const tex = new THREE.Texture(atlas.image);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    this.blockMat = new THREE.MeshBasicMaterial({
      map: tex,
      vertexColors: true,
      alphaTest: 0.4,
    });
    this.waterMat = new THREE.MeshBasicMaterial({
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.scene.fog = new THREE.Fog(0x88aaff, 32, 128);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setDayLight(t: number): void {
    this.dayBrightness = t;
    const c = new THREE.Color(t, t, t * 1.02 + 0.02);
    this.blockMat.color = c;
    this.waterMat.color = c.clone();
    const sky = new THREE.Color().setRGB(0.53 * t + 0.02, 0.72 * t + 0.02, 0.95 * t + 0.05);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color = sky;
    (this.scene.fog as THREE.Fog).near = this.renderDistance * 8;
    (this.scene.fog as THREE.Fog).far = this.renderDistance * 16 + 8;
  }

  updateChunks(world: World, px: number, pz: number, atlas: Atlas,
               budget = 3): void {
    const rd = this.renderDistance;
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    // build missing in spiral order
    const jobs: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        const d = dx * dx + dz * dz;
        if (d > rd * rd) continue;
        jobs.push({ cx: pcx + dx, cz: pcz + cz0(dz), d });
      }
    }
    jobs.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const j of jobs) {
      for (let cy = 0; cy < WORLD_H / CH; cy++) {
        const k = chunkKey(j.cx, cy, j.cz);
        const c = world.getChunk(j.cx, cy, j.cz, true);
        if (!c) continue;
        const entry = this.meshes.get(k);
        if (c.dirty || !entry) {
          if (built >= budget) return;
          this.buildOne(world, c, atlas, k);
          c.dirty = false;
          built++;
        }
      }
    }
    // unload far meshes
    for (const k of [...this.meshes.keys()]) {
      const [cx, , cz] = k.split(",").map(Number);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > (rd + 2) * (rd + 2)) {
        this.removeOne(k);
      }
    }
  }

  private buildOne(world: World, c: any, atlas: Atlas, k: string): void {
    this.removeOne(k);
    const bufs = buildChunkMesh(world, c, atlas.meta);
    const entry: { solid?: THREE.Mesh; water?: THREE.Mesh } = {};
    if (bufs.solid) {
      const m = new THREE.Mesh(bufs.solid, this.blockMat);
      m.frustumCulled = true;
      this.scene.add(m);
      entry.solid = m;
    }
    if (bufs.water) {
      const m = new THREE.Mesh(bufs.water, this.waterMat);
      m.frustumCulled = true;
      m.renderOrder = 2;
      this.scene.add(m);
      entry.water = m;
    }
    this.meshes.set(k, entry);
  }

  private removeOne(k: string): void {
    const e = this.meshes.get(k);
    if (!e) return;
    if (e.solid) {
      this.scene.remove(e.solid);
      e.solid.geometry.dispose();
    }
    if (e.water) {
      this.scene.remove(e.water);
      e.water.geometry.dispose();
    }
    this.meshes.delete(k);
  }

  invalidateChunk(cx: number, cy: number, cz: number, world: World): void {
    const c = world.chunks.get(chunkKey(cx, cy, cz));
    if (c) c.dirty = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

function cz0(z: number): number {
  return z;
}
