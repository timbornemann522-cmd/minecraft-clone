// Pixel particle pool: break debris, smoke, flame, explosion bits.

import * as THREE from "three";

interface Part {
  mesh: THREE.Mesh;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  active: boolean;
}

export class Particles {
  group = new THREE.Group();
  pool: Part[] = [];
  materials: Record<string, THREE.MeshBasicMaterial>;

  constructor() {
    this.materials = {
      smoke: mat(0x909090),
      flame: mat(0xe87820),
      generic: mat(0xb4b4b4),
    };
    const geo = new THREE.PlaneGeometry(0.12, 0.12);
    for (let i = 0; i < 300; i++) {
      const m = new THREE.Mesh(geo, this.materials.generic);
      m.visible = false;
      this.group.add(m);
      this.pool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false });
    }
  }

  spawn(x: number, y: number, z: number, color: number,
        count: number, kind: "smoke" | "flame" | "generic" = "generic",
        spread = 2.2): void {
    const m = this.materials[kind].clone();
    m.color.setHex(color);
    let spawned = 0;
    for (const p of this.pool) {
      if (p.active) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.material = m;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.7,
        y + (Math.random() - 0.5) * 0.7,
        z + (Math.random() - 0.5) * 0.7
      );
      p.vx = (Math.random() - 0.5) * spread;
      p.vy = Math.random() * spread * 0.9 + 0.6;
      p.vz = (Math.random() - 0.5) * spread;
      p.maxLife = kind === "smoke" ? 1.4 : 0.7 + Math.random() * 0.5;
      p.life = p.maxLife;
      if (++spawned >= count) break;
    }
  }

  update(dt: number, cam: THREE.Camera): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.quaternion.copy(cam.quaternion);
      const s = Math.max(0.3, p.life / p.maxLife);
      p.mesh.scale.setScalar(s);
    }
  }
}

function mat(c: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: c, depthWrite: false, transparent: true });
}
