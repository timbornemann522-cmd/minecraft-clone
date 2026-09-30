// Dropped items, arrows, and primed TNT.

import * as THREE from "three";
import { Body, moveBody } from "../core/physics";
import { World } from "../core/world";
import { BLOCKS } from "../core/blocks";
import { ITEMS } from "../core/blocks";
import * as sfx from "../audio/sfx";

export class ItemDrop {
  body: Body;
  item: string;
  count: number;
  mesh: THREE.Mesh;
  age = 0;
  pickupDelay = 0.5;

  constructor(item: string, count: number, x: number, y: number, z: number,
              iconUv: (item: string) => THREE.Texture) {
    this.item = item;
    this.count = count;
    this.body = { x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: 3, vz: (Math.random() - 0.5) * 1.5, w: 0.25, h: 0.25, onGround: false, inWater: false };
    const mat = new THREE.MeshBasicMaterial({ map: iconUv(item), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat);
  }

  update(dt: number, world: World): boolean {
    this.age += dt;
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    this.body.vy -= 18 * dt;
    moveBody(world, this.body, dt);
    this.mesh.position.set(this.body.x, this.body.y + 0.25 + Math.sin(this.age * 3) * 0.05, this.body.z);
    this.mesh.rotation.y = this.age * 2;
    return this.age < 240;
  }
}

export class Arrow {
  body: Body;
  stuck = false;
  stuckTimer = 0;
  fromPlayer: boolean;
  mesh: THREE.Group;
  life = 60;
  damage = 3;

  constructor(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromPlayer: boolean) {
    this.fromPlayer = fromPlayer;
    this.body = { x, y, z, vx, vy, vz, w: 0.1, h: 0.1, onGround: false, inWater: false };
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xc7c7c7 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), mat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), new THREE.MeshBasicMaterial({ color: 0x999999 }));
    head.position.z = 0.28;
    g.add(shaft, head);
    this.mesh = g;
  }

  update(dt: number, world: World): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;
    if (!this.stuck) {
      this.body.vy -= 20 * dt;
      const b = this.body;
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const nx = b.x + (b.vx * dt) / steps;
        const ny = b.y + (b.vy * dt) / steps;
        const nz = b.z + (b.vz * dt) / steps;
        if (world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
          this.stuck = true;
          this.stuckTimer = 60;
          sfx.sfxArrowHit();
          break;
        }
        b.x = nx; b.y = ny; b.z = nz;
      }
      const dir = new THREE.Vector3(b.vx, b.vy, b.vz).normalize();
      this.mesh.position.set(b.x, b.y, b.z);
      this.mesh.lookAt(b.x + dir.x, b.y + dir.y, b.z + dir.z);
    }
    return true;
  }
}

export class PrimedTnt {
  body: Body;
  fuse = 4;
  mesh: THREE.Mesh;
  onExplode: (x: number, y: number, z: number, power: number) => void;

  constructor(x: number, y: number, z: number,
              onExplode: (x: number, y: number, z: number, power: number) => void) {
    this.onExplode = onExplode;
    this.body = { x, y, z, vx: 0, vy: 0, vz: 0, w: 0.8, h: 0.8, onGround: false, inWater: false };
    const mat = new THREE.MeshBasicMaterial({ color: 0xc33a2b });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
    sfx.sfxHiss();
  }

  update(dt: number, world: World): boolean {
    this.fuse -= dt;
    this.body.vy -= 24 * dt;
    moveBody(world, this.body, dt);
    this.mesh.position.set(this.body.x, this.body.y + 0.4, this.body.z);
    const flash = Math.sin(this.fuse * 20) > 0;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(flash ? 0xffffff : 0xc33a2b);
    if (this.fuse <= 0) {
      this.onExplode(this.body.x, this.body.y + 0.4, this.body.z, 4);
      return false;
    }
    return true;
  }
}
