// Player: pointer-lock first person, survival stats, mining, placing, combat.

import * as THREE from "three";
import { Body, moveBody } from "../core/physics";
import { World } from "../core/world";
import { BLOCKS, ITEMS, B } from "../core/blocks";
import * as sfx from "../audio/sfx";

export interface ItemStack {
  item: string;
  count: number;
}

export class Player {
  body: Body = {
    x: 0.5, y: 80, z: 0.5, vx: 0, vy: 0, vz: 0,
    w: 0.6, h: 1.8, onGround: false, inWater: false,
  };
  yaw = 0;
  pitch = 0;
  health = 20;
  hunger = 20;
  air = 15;
  creative = false;
  flying = false;
  dead = false;
  fallPeakY = 80;
  hungerTimer = 0;
  regenTimer = 0;
  starveTimer = 0;
  attackCooldown = 0;
  swing = 0;
  hurtFlash = 0;
  stepDist = 0;

  inv: (ItemStack | null)[] = new Array(36).fill(null);
  hotbar = 0;
  craft: (ItemStack | null)[] = new Array(9).fill(null);
  craftSize = 2;
  craftOut: ItemStack | null = null;

  constructor() {
    // starter kit in creative; survival starts empty
  }

  get eyeY(): number {
    return this.body.y + 1.62;
  }

  lookDir(): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    );
  }

  held(): ItemStack | null {
    return this.inv[this.hotbar];
  }

  heldDef() {
    const h = this.held();
    return h ? ITEMS[h.item] : null;
  }

  addItem(name: string, count: number): number {
    const def = ITEMS[name];
    if (!def) return count;
    // stack into existing
    for (let i = 0; i < 36; i++) {
      const s = this.inv[i];
      if (s && s.item === name && s.count < def.stack) {
        const add = Math.min(count, def.stack - s.count);
        s.count += add;
        count -= add;
        if (count <= 0) return 0;
      }
    }
    for (let i = 0; i < 36; i++) {
      if (!this.inv[i]) {
        const add = Math.min(count, def.stack);
        this.inv[i] = { item: name, count: add };
        count -= add;
        if (count <= 0) return 0;
      }
    }
    return count;
  }

  consumeHeld(): void {
    if (this.creative) return;
    const s = this.inv[this.hotbar];
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.inv[this.hotbar] = null;
  }

  damage(amount: number, fromX: number, fromZ: number): void {
    if (this.dead || this.creative) return;
    this.health -= amount;
    this.hurtFlash = 0.35;
    sfx.sfxHurt();
    const dx = this.body.x - fromX;
    const dz = this.body.z - fromZ;
    const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    this.body.vx += (dx / d) * 5;
    this.body.vz += (dz / d) * 5;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  respawn(x: number, y: number, z: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.health = 20;
    this.hunger = 20;
    this.air = 15;
    this.dead = false;
    this.fallPeakY = y;
  }

  update(dt: number, world: World, input: {
    fwd: number; strafe: number; jump: boolean; sneak: boolean; sprint: boolean;
  }): void {
    if (this.dead) return;
    const b = this.body;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const inWaterFeet = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.3), Math.floor(b.z)) === B.WATER;
    const inWaterHead = world.getBlock(Math.floor(b.x), Math.floor(this.eyeY), Math.floor(b.z)) === B.WATER;

    let speed = input.sneak ? 1.3 : input.sprint && this.hunger > 6 ? 5.6 : 4.3;
    if (this.creative && this.flying) speed = 10.5;
    if (inWaterFeet) speed *= 0.55;

    // movement in look space
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;
    let wx = fx * input.fwd + rx * input.strafe;
    let wz = fz * input.fwd + rz * input.strafe;
    const wl = Math.sqrt(wx * wx + wz * wz);
    if (wl > 0.01) {
      wx /= wl; wz /= wl;
      b.vx = wx * speed;
      b.vz = wz * speed;
    } else if (b.onGround || this.flying) {
      b.vx *= 0.6;
      b.vz *= 0.6;
    }

    if (this.creative && this.flying) {
      b.vy = input.jump ? 8 : (input.sneak ? -8 : 0);
    } else if (inWaterFeet) {
      b.vy -= 10 * dt;
      if (input.jump) b.vy = 3.2;
    } else {
      b.vy -= 32 * dt;
      if (input.jump && b.onGround) {
        b.vy = 8.4;
        b.onGround = false;
      }
    }

    // fall tracking
    if (b.onGround || this.flying) {
      if (!this.creative && this.fallPeakY - b.y > 3.2 && !inWaterFeet) {
        const dmg = Math.floor(this.fallPeakY - b.y - 3);
        if (dmg > 0) this.damage(dmg, b.x + 0.01, b.z + 0.01);
      }
      this.fallPeakY = b.y;
    } else {
      this.fallPeakY = Math.max(this.fallPeakY, b.y);
    }

    moveBody(world, b, dt);

    // footsteps
    const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (b.onGround && sp > 0.5) {
      this.stepDist += sp * dt;
      if (this.stepDist > 2.2) {
        this.stepDist = 0;
        const below = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z));
        const mat = below === B.GRASS ? "grass" : below === B.SAND ? "sand"
          : below === B.STONE || below === B.COBBLE ? "stone"
          : below === B.SNOW ? "snow" : below === B.PLANKS || below === B.LOG ? "wood" : "dirt";
        sfx.sfxStep(mat);
      }
    }

    // drowning
    if (inWaterHead) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.regenTimer += dt;
        if (this.regenTimer > 1) {
          this.regenTimer = 0;
          this.damage(2, b.x, b.z);
        }
      }
    } else {
      this.air = Math.min(15, this.air + dt * 4);
    }

    if (!this.creative) {
      // hunger drain
      this.hungerTimer += dt * (input.sprint && sp > 1 ? 0.06 : 0.012);
      if (this.hungerTimer > 1) {
        this.hungerTimer = 0;
        this.hunger = Math.max(0, this.hunger - 1);
      }
      // regen / starve
      if (this.hunger >= 18 && this.health < 20) {
        this.starveTimer += dt;
        if (this.starveTimer > 3.5) {
          this.starveTimer = 0;
          this.health = Math.min(20, this.health + 1);
          this.hunger = Math.max(0, this.hunger - 0.4);
        }
      } else if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer > 4) {
          this.starveTimer = 0;
          if (this.health > 1) this.health -= 1;
        }
      } else {
        this.starveTimer = 0;
      }
    }

    if (b.y < -10) {
      this.damage(1000, b.x, b.z);
    }
  }

  eat(): void {
    const h = this.held();
    if (!h) return;
    const def = ITEMS[h.item];
    if (def.heal <= 0 || this.hunger >= 20) return;
    this.hunger = Math.min(20, this.hunger + def.heal);
    this.consumeHeld();
    sfx.sfxEat();
  }

  miningSpeed(blockId: number): number {
    const def = BLOCKS[blockId];
    const held = this.heldDef();
    let mult = 1;
    if (held && held.tool === def.tool) mult = held.speed;
    else if (held && held.tool && held.tool !== "none") mult = 1.2;
    return mult;
  }

  canHarvest(blockId: number): boolean {
    const def = BLOCKS[blockId];
    if (def.tier === 0) return true;
    const held = this.heldDef();
    if (!held) return def.tier === 0;
    if (held.tool !== "pickaxe") return false;
    return held.tier >= def.tier;
  }

  attackDamage(): number {
    const held = this.heldDef();
    return held ? held.damage : 1;
  }
}
