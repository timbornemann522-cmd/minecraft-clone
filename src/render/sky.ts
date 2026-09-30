// Sky: sun, moon, blocky cloud slab, day/night cycle (10 min full day).

import * as THREE from "three";

export class Sky {
  group = new THREE.Group();
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  clouds: THREE.Mesh;
  time = 0.3; // 0..1, 0.25 = noon-ish
  DAY_LENGTH = 600; // seconds for full cycle

  constructor() {
    // pixel sun 16x16 style via canvas
    const sunTex = makePixelTex((px) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          const col = d < 5.5 ? "#fff7c0" : d < 6.8 ? "#ffe98a" : null;
          if (col) px(x, y, col);
        }
    });
    const moonTex = makePixelTex((px) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 6.8) continue;
          const col = d > 5.2 ? "#c7c7d8" : (x + y) % 5 === 0 ? "#a0a0b8" : "#e4e4f0";
          px(x, y, col);
        }
    });
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false })
    );
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false })
    );
    // cloud slab: one large plane with repeated pixel cloud texture
    const cloudTex = makeCloudTex();
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(6, 6);
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.85,
        depthWrite: false, fog: true, side: THREE.DoubleSide,
      })
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 96;
    this.group.add(this.sun, this.moon, this.clouds);
  }

  update(dt: number, camPos: THREE.Vector3): number {
    this.time = (this.time + dt / this.DAY_LENGTH) % 1;
    const ang = this.time * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.sin(ang), Math.cos(ang), 0.25).normalize();
    this.sun.position.copy(camPos).addScaledVector(sunDir, 180);
    this.sun.lookAt(camPos);
    this.moon.position.copy(camPos).addScaledVector(sunDir, -180);
    this.moon.lookAt(camPos);
    this.clouds.position.x = camPos.x;
    this.clouds.position.z = camPos.z;
    const mt = (this.clouds.material as THREE.MeshBasicMaterial).map!;
    mt.offset.x += dt * 0.004;

    // brightness 0.12 at night .. 1 at day
    const dayness = Math.max(0, Math.sin(this.time * Math.PI * 2));
    return 0.15 + 0.85 * Math.pow(dayness, 0.6);
  }

  isDay(): boolean {
    return Math.sin(this.time * Math.PI * 2) > 0.05;
  }
}

function makePixelTex(draw: (px: (x: number, y: number, c: string) => void) => void): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = 16;
  cv.height = 16;
  const ctx = cv.getContext("2d")!;
  draw((x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  });
  const t = new THREE.Texture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function makeCloudTex(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  // deterministic blocky blobs
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * 64);
    const y = Math.floor(rnd() * 64);
    const w = 4 + Math.floor(rnd() * 10);
    const h = 3 + Math.floor(rnd() * 6);
    ctx.fillRect(x, y, w, h);
    ctx.fillRect((x + 2) % 64, (y + 3) % 64, w, h);
  }
  const t = new THREE.Texture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
