// AABB vs voxel collision: axis-separated sweep with auto step-up.

import { World } from "./world";
import { BLOCKS } from "./blocks";

export interface Body {
  x: number; y: number; z: number;   // feet center
  vx: number; vy: number; vz: number;
  w: number;                         // width (full)
  h: number;                         // height (full)
  onGround: boolean;
  inWater: boolean;
  noAI?: boolean;
}

function collides(world: World, x: number, y: number, z: number,
                  w: number, h: number): boolean {
  const x0 = Math.floor(x - w / 2), x1 = Math.floor(x + w / 2 - 1e-7);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-7);
  const z0 = Math.floor(z - w / 2), z1 = Math.floor(z + w / 2 - 1e-7);
  for (let yy = y0; yy <= y1; yy++)
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++) {
        const id = world.getBlock(xx, yy, zz);
        if (BLOCKS[id].solid) return true;
      }
  return false;
}

export function moveBody(world: World, b: Body, dt: number): void {
  const STEP = 0.55;
  b.inWater = (() => {
    const id = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z));
    return id === 11;
  })();

  // gravity applied by caller
  const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;

  // X
  if (dx !== 0) {
    const nx = b.x + dx;
    if (!collides(world, nx, b.y, b.z, b.w, b.h)) {
      b.x = nx;
    } else if (b.onGround && !collides(world, nx, b.y + STEP, b.z, b.w, b.h)) {
      b.y += STEP; b.x = nx;
    } else {
      b.vx = 0;
    }
  }
  // Z
  if (dz !== 0) {
    const nz = b.z + dz;
    if (!collides(world, b.x, b.y, nz, b.w, b.h)) {
      b.z = nz;
    } else if (b.onGround && !collides(world, b.x, b.y + STEP, nz, b.w, b.h)) {
      b.y += STEP; b.z = nz;
    } else {
      b.vz = 0;
    }
  }
  // Y
  b.onGround = false;
  if (dy !== 0) {
    const ny = b.y + dy;
    if (!collides(world, b.x, ny, b.z, b.w, b.h)) {
      b.y = ny;
    } else {
      if (dy < 0) {
        b.onGround = true;
        // snap to ground
        b.y = Math.floor(b.y) + 1e-3;
        while (collides(world, b.x, b.y, b.z, b.w, b.h) && b.y < b.y + 1) b.y += 0.01;
      }
      b.vy = 0;
    }
  }
  // ground probe
  if (!b.onGround) {
    if (collides(world, b.x, b.y - 0.02, b.z, b.w, b.h)) b.onGround = true;
  }
  if (b.inWater) {
    b.vx *= 0.5;
    b.vz *= 0.5;
    if (b.vy < -3) b.vy = -3;
  }
}

export function bodyInBlock(world: World, b: Body): boolean {
  return collides(world, b.x, b.y, b.z, b.w, b.h);
}
