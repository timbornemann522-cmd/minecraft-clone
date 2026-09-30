// Mobs: finite state machine AI per species with voxel steering.
// States: idle, wander, chase, attack, flee, fuse, shoot, climb.

import * as THREE from "three";
import { Body, moveBody } from "../core/physics";
import { World, SEA_LEVEL } from "../core/world";
import { BLOCKS } from "../core/blocks";
import { MobView, AnimState } from "../render/mobview";
import { sfxExplode, sfxGroan, sfxHiss, sfxHurtMob, sfxBow, sfxFusePop } from "../audio/sfx";

export type Species = "zombie" | "skeleton" | "creeper" | "spider" | "pig" | "cow" | "sheep" | "chicken";

export interface SpeciesDef {
  hp: number;
  w: number;
  h: number;
  speed: number;
  hostile: boolean;
  burnsInSun: boolean;
  dmg: number;
  aggro: number;
  eye: number;
  drops: [string, number][];
}

export const SPECIES: Record<Species, SpeciesDef> = {
  zombie: { hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, burnsInSun: true, dmg: 3, aggro: 40, eye: 1.74, drops: [] },
  skeleton: { hp: 20, w: 0.6, h: 1.99, speed: 2.2, hostile: true, burnsInSun: true, dmg: 3, aggro: 40, eye: 1.8, drops: [["item:arrow", 2]] },
  creeper: { hp: 20, w: 0.6, h: 1.7, speed: 2.2, hostile: true, burnsInSun: false, dmg: 0, aggro: 16, eye: 1.5, drops: [] },
  spider: { hp: 16, w: 1.4, h: 0.9, speed: 2.6, hostile: true, burnsInSun: false, dmg: 2, aggro: 24, eye: 0.7, drops: [] },
  pig: { hp: 10, w: 0.9, h: 0.9, speed: 1.2, hostile: false, burnsInSun: false, dmg: 0, aggro: 0, eye: 0.75, drops: [["item:porkchop", 2]] },
  cow: { hp: 10, w: 0.9, h: 1.4, speed: 1.2, hostile: false, burnsInSun: false, dmg: 0, aggro: 0, eye: 1.2, drops: [["item:beef", 2]] },
  sheep: { hp: 8, w: 0.9, h: 1.3, speed: 1.2, hostile: false, burnsInSun: false, dmg: 0, aggro: 0, eye: 1.1, drops: [["item:wool", 1]] },
  chicken: { hp: 4, w: 0.4, h: 0.7, speed: 1.1, hostile: false, burnsInSun: false, dmg: 0, aggro: 0, eye: 0.6, drops: [] },
};

export type MobState = "idle" | "wander" | "chase" | "attack" | "flee" | "fuse" | "shoot" | "climb" | "dead";

export interface GameHooks {
  explode(x: number, y: number, z: number, power: number): void;
  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromPlayer: boolean): void;
  dropLoot(x: number, y: number, z: number, drops: [string, number][]): void;
  damagePlayer(amount: number, fromX: number, fromZ: number): void;
  playerPos(): THREE.Vector3;
  playerAlive(): boolean;
  isDay(): boolean;
  alertNear(x: number, y: number, z: number, r: number): void;
  particles: {
    spawn(x: number, y: number, z: number, color: number, count: number,
          kind?: "smoke" | "flame" | "generic", spread?: number): void;
  };
}

export class Mob {
  body: Body;
  species: Species;
  def: SpeciesDef;
  view: MobView;
  state: MobState = "idle";
  hp: number;
  yaw = 0;
  walkPhase = 0;
  stateTimer = 0;
  attackTimer = 0;
  hurtFlash = 0;
  fuse = 0;
  fuseLit = false;
  memory = 0;
  provoked = false;
  wanderX = 0;
  wanderZ = 0;
  idleTimer = 0;
  groanTimer = Math.random() * 8;
  fallPeakY = 0;
  dead = false;
  deadTimer = 0;
  sheared = false;
  wingFlap = 0;
  strafeDir = Math.random() < 0.5 ? 1 : -1;

  constructor(species: Species, x: number, y: number, z: number) {
    this.species = species;
    this.def = SPECIES[species];
    this.hp = this.def.hp;
    this.body = {
      x, y, z, vx: 0, vy: 0, vz: 0,
      w: this.def.w, h: this.def.h, onGround: false, inWater: false,
    };
    this.view = new MobView(species);
    if (species === "sheep") this.view.setFurVisible(Math.random() < 0.6);
  }

  get eyeY(): number {
    return this.body.y + this.def.eye;
  }

  distToPlayer(p: THREE.Vector3): number {
    const dx = p.x - this.body.x;
    const dy = p.y - this.eyeY;
    const dz = p.z - this.body.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  canSee(world: World, p: THREE.Vector3): boolean {
    const dx = p.x - this.body.x;
    const dy = (p.y + 1.5) - this.eyeY;
    const dz = p.z - this.body.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > this.def.aggro) return false;
    const hit = world.raycast(this.body.x, this.eyeY, this.body.z,
      dx / d, dy / d, dz / d, d - 0.4);
    return !hit;
  }

  hurt(amount: number, fromX: number, fromZ: number, hooks: GameHooks): void {
    if (this.dead) return;
    this.hp -= amount;
    this.hurtFlash = 0.35;
    sfxHurtMob(this.species);
    const dx = this.body.x - fromX;
    const dz = this.body.z - fromZ;
    const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    this.body.vx += (dx / d) * 5;
    this.body.vz += (dz / d) * 5;
    this.body.vy = Math.max(this.body.vy, 3.5);
    this.provoked = true;
    if (!this.def.hostile && this.hp > 0) {
      this.state = "flee";
      this.stateTimer = 8;
    }
    if (this.hp <= 0) this.die(hooks);
  }

  die(hooks: GameHooks): void {
    this.dead = true;
    this.deadTimer = 0.5;
    this.state = "dead";
    this.body.vx = 0;
    this.body.vz = 0;
    if (this.def.drops.length) {
      hooks.dropLoot(this.body.x, this.body.y + 0.4, this.body.z,
        this.def.drops.map(([n, c]) => [n, 1 + Math.floor(Math.random() * c)] as [string, number]));
    }
  }

  steerTo(world: World, tx: number, tz: number, speed: number, avoidLedge: boolean): boolean {
    const dx = tx - this.body.x;
    const dz = tz - this.body.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) {
      this.body.vx *= 0.8;
      this.body.vz *= 0.8;
      return true;
    }
    const nx = dx / d, nz = dz / d;
    this.yaw = Math.atan2(nx, nz);
    this.body.vx = nx * speed;
    this.body.vz = nz * speed;

    // jump obstacles
    const aheadX = this.body.x + nx * 0.6;
    const aheadZ = this.body.z + nz * 0.6;
    const feetY = Math.floor(this.body.y);
    if (this.body.onGround) {
      if (BLOCKS[world.getBlock(Math.floor(aheadX), feetY, Math.floor(aheadZ))].solid) {
        this.body.vy = 8.4;
      } else if (avoidLedge) {
        const gap = world.getBlock(Math.floor(aheadX), feetY - 1, Math.floor(aheadZ));
        if (!BLOCKS[gap].solid) {
          this.body.vx *= -1;
          this.body.vz *= -1;
          this.wanderX = this.body.x + (Math.random() - 0.5) * 6;
          this.wanderZ = this.body.z + (Math.random() - 0.5) * 6;
          return false;
        }
      }
    }
    return false;
  }

  update(dt: number, world: World, hooks: GameHooks, time: number): void {
    if (this.dead) {
      this.deadTimer -= dt;
      moveBody(world, this.body, dt);
      return;
    }
    const b = this.body;
    const p = hooks.playerPos();
    const dist = this.distToPlayer(p);
    const see = hooks.playerAlive() && this.canSee(world, p);
    if (see) this.memory = 5;
    else this.memory = Math.max(0, this.memory - dt);

    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      if (dist < 14) sfxGroan(this.species);
      this.groanTimer = 6 + Math.random() * 10;
    }

    // gravity + physics
    b.vy -= (b.inWater ? 10 : 32) * dt;
    if (b.inWater && this.species !== "chicken") b.vy += 22 * dt;
    if (this.species === "chicken" && b.vy < -1.2) b.vy = -1.2;
    if (b.onGround && b.vy < 0) {
      if (this.fallPeakY - b.y > 3.5 && this.species !== "chicken") {
        this.hurt(Math.floor(this.fallPeakY - b.y - 3), b.x, b.z, hooks);
      }
      this.fallPeakY = b.y;
    } else {
      this.fallPeakY = Math.max(this.fallPeakY, b.y);
    }
    moveBody(world, b, dt);

    // burn in daylight
    if (this.def.burnsInSun && hooks.isDay()) {
      const light = world.skyLight(Math.floor(b.x), Math.floor(this.eyeY), Math.floor(b.z));
      if (light > 0.95) {
        this.stateTimer += dt;
        if (this.stateTimer > 0.8) {
          this.stateTimer = 0;
          this.hurt(1, b.x + 0.01, b.z + 0.01, hooks);
          hooks.particles.spawn(b.x, b.y + this.def.h * 0.7, b.z, 0xe87820, 3, "flame", 0.6);
        }
      }
    }

    // fall into void
    if (b.y < -10) {
      this.hp = 0;
      this.die(hooks);
      return;
    }

    this.stateTimer -= dt;
    this.attackTimer -= dt;

    switch (this.species) {
      case "zombie": this.aiZombie(dt, world, hooks, p, dist, see); break;
      case "skeleton": this.aiSkeleton(dt, world, hooks, p, dist, see); break;
      case "creeper": this.aiCreeper(dt, world, hooks, p, dist, see); break;
      case "spider": this.aiSpider(dt, world, hooks, p, dist, see); break;
      case "chicken": this.aiChicken(dt, world, hooks); break;
      default: this.aiPassive(dt, world, hooks, p); break;
    }

    // walk animation
    const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    this.walkPhase += dt * (4 + sp * 2.4);
  }

  aiZombie(dt: number, world: World, hooks: GameHooks, p: THREE.Vector3,
           dist: number, see: boolean): void {
    const b = this.body;
    if (this.memory > 0 && hooks.playerAlive()) {
      this.state = dist < 1.8 ? "attack" : "chase";
      if (this.state === "chase") {
        this.steerTo(world, p.x, p.z, this.def.speed, false);
      } else {
        b.vx *= 0.5; b.vz *= 0.5;
        this.yaw = Math.atan2(p.x - b.x, p.z - b.z);
        if (this.attackTimer <= 0 && dist < 2.4) {
          this.attackTimer = 1.0;
          hooks.damagePlayer(this.def.dmg, b.x, b.z);
        }
      }
      hooks.alertNear(b.x, b.y, b.z, 16);
    } else {
      this.wander(dt, world, 1.4);
    }
  }

  aiSkeleton(dt: number, world: World, hooks: GameHooks, p: THREE.Vector3,
              dist: number, see: boolean): void {
    const b = this.body;
    if (this.memory > 0 && hooks.playerAlive()) {
      if (dist < 5) {
        this.state = "flee";
        this.steerTo(world, b.x - (p.x - b.x), b.z - (p.z - b.z), this.def.speed, false);
      } else if (dist > 16) {
        this.state = "chase";
        this.steerTo(world, p.x, p.z, this.def.speed, false);
      } else {
        this.state = "shoot";
        // strafe orbit
        const ang = Math.atan2(p.x - b.x, p.z - b.z) + (Math.PI / 2) * this.strafeDir;
        this.steerTo(world, b.x + Math.sin(ang) * 3, b.z + Math.cos(ang) * 3, 1.2, true);
        this.yaw = Math.atan2(p.x - b.x, p.z - b.z);
        if (this.attackTimer <= 0 && see) {
          this.attackTimer = 1.2;
          // lead the shot
          const tx = p.x + (p.x - b.x) * 0.04;
          const ty = p.y + 1.5;
          const tz = p.z + (p.z - b.z) * 0.04;
          const dx = tx - b.x, dy = ty - this.eyeY, dz = tz - b.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const speed = 18;
          const inacc = 0.026 * (1 + dist / 24);
          hooks.spawnArrow(b.x, this.eyeY, b.z,
            (dx / d + (Math.random() - 0.5) * inacc) * speed,
            (dy / d + 0.5 + (Math.random() - 0.5) * inacc) * speed * 0.55 + d * 0.055,
            (dz / d + (Math.random() - 0.5) * inacc) * speed,
            false);
          sfxBow();
        }
      }
      if (Math.random() < dt * 0.4) this.strafeDir *= -1;
    } else {
      this.wander(dt, world, 1.2);
    }
  }

  aiCreeper(dt: number, world: World, hooks: GameHooks, p: THREE.Vector3,
            dist: number, see: boolean): void {
    const b = this.body;
    if (this.memory > 0 && hooks.playerAlive()) {
      if (this.fuseLit) {
        this.state = "fuse";
        this.fuse += dt / 1.5;
        b.vx *= 0.8; b.vz *= 0.8;
        this.yaw = Math.atan2(p.x - b.x, p.z - b.z);
        // abort check
        if (dist > 4.5 && !see && Math.random() < dt * 2) {
          this.fuseLit = false;
          this.fuse = 0;
          return;
        }
        if (this.fuse >= 1) {
          hooks.explode(b.x, b.y + 0.5, b.z, 3);
          this.hp = 0;
          this.die(hooks);
          this.deadTimer = 0;
        }
      } else if (dist < 2.5 && see) {
        this.fuseLit = true;
        this.fuse = 0;
        sfxHiss();
        sfxFusePop();
      } else {
        this.state = "chase";
        this.steerTo(world, p.x, p.z, this.def.speed, false);
      }
    } else {
      if (this.fuseLit) {
        this.fuseLit = false;
        this.fuse = 0;
      }
      this.wander(dt, world, 1.3);
    }
  }

  aiSpider(dt: number, world: World, hooks: GameHooks, p: THREE.Vector3,
           dist: number, see: boolean): void {
    const b = this.body;
    const dark = !hooks.isDay();
    const aggressive = this.provoked || dark;
    if (aggressive && this.memory > 0 && hooks.playerAlive()) {
      this.state = "chase";
      // wall climb when target above and blocked
      const blocked = BLOCKS[world.getBlock(
        Math.floor(b.x + Math.sin(this.yaw) * 0.7),
        Math.floor(b.y + 0.3),
        Math.floor(b.z + Math.cos(this.yaw) * 0.7))].solid;
      if (blocked && p.y > b.y + 0.5) {
        this.state = "climb";
        b.vy = 2.4;
        this.steerTo(world, p.x, p.z, 1.2, false);
      } else {
        this.steerTo(world, p.x, p.z, this.def.speed, false);
        // pounce
        if (dist > 3 && dist < 5 && b.onGround && see) {
          const dx = p.x - b.x, dz = p.z - b.z;
          const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
          b.vx = (dx / d) * 6;
          b.vz = (dz / d) * 6;
          b.vy = 5;
        }
      }
      if (dist < 1.4 && this.attackTimer <= 0) {
        this.attackTimer = 0.9;
        hooks.damagePlayer(this.def.dmg, b.x, b.z);
      }
    } else {
      this.wander(dt, world, 1.1);
    }
    // day light check for neutral: if provoked persists
  }

  aiChicken(dt: number, world: World, hooks: GameHooks): void {
    this.wingFlap = Math.max(0, this.wingFlap - dt * 4);
    if (Math.random() < dt * 0.35 && this.body.onGround) {
      this.body.vy = 5.5;
      this.wingFlap = 1;
    }
    if (this.state === "flee" && this.stateTimer > 0) {
      this.steerTo(world, this.wanderX, this.wanderZ, 1.8, true);
    } else {
      this.wander(dt, world, this.def.speed);
    }
  }

  aiPassive(dt: number, world: World, hooks: GameHooks, p: THREE.Vector3): void {
    if (this.state === "flee" && this.stateTimer > 0) {
      this.steerTo(world, this.wanderX, this.wanderZ, 2.0, true);
    } else {
      this.wander(dt, world, this.def.speed);
    }
  }

  wander(dt: number, world: World, speed: number): void {
    this.idleTimer -= dt;
    const dx = this.wanderX - this.body.x;
    const dz = this.wanderZ - this.body.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (this.idleTimer <= 0 || d < 1) {
      this.idleTimer = 4 + Math.random() * 5;
      if (Math.random() < 0.4) {
        this.wanderX = this.body.x;
        this.wanderZ = this.body.z;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 5;
        this.wanderX = this.body.x + Math.sin(a) * r;
        this.wanderZ = this.body.z + Math.cos(a) * r;
      }
      this.state = "wander";
    }
    if (d > 0.5) {
      this.steerTo(world, this.wanderX, this.wanderZ, speed, true);
    } else {
      this.body.vx *= 0.85;
      this.body.vz *= 0.85;
    }
  }

  animState(): AnimState {
    const sp = Math.sqrt(this.body.vx ** 2 + this.body.vz ** 2);
    return {
      walkPhase: this.walkPhase,
      speed: sp,
      lookYaw: 0,
      lookPitch: 0,
      attacking: this.state === "attack" && this.attackTimer > 0.5,
      hurt: this.hurtFlash > 0 ? this.hurtFlash / 0.35 : 0,
      fuse: this.fuseLit ? this.fuse : 0,
      wingFlap: this.wingFlap,
      climbing: this.state === "climb",
      dead: this.dead,
    };
  }

  syncView(p: THREE.Vector3, dt: number): void {
    const b = this.body;
    this.view.object.position.set(b.x, b.y, b.z);
    this.view.object.rotation.y = this.yaw;
    const st = this.animState();
    // head look toward player
    const dx = p.x - b.x, dz = p.z - b.z, dy = (p.y + 1.5) - this.eyeY;
    const flat = Math.sqrt(dx * dx + dz * dz);
    let lookYaw = Math.atan2(dx, dz) - this.yaw;
    while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
    while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
    st.lookYaw = Math.max(-1.1, Math.min(1.1, lookYaw));
    st.lookPitch = Math.max(-0.6, Math.min(0.5, Math.atan2(dy, flat) * 0.7));
    this.view.update(dt, st);
  }
}
