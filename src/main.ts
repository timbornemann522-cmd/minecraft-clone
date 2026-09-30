// BLOCKCRAFT main: boot, game loop, input, interaction, spawning.

import * as THREE from "three";
import { B, BLOCKS, ITEMS } from "./core/blocks";
import { CHUNKS_Y, chunkKey } from "./core/chunk";
import { World, findSpawn, SEA_LEVEL } from "./core/world";
import { saveGame, loadGame, applyEdits, PlayerSave } from "./core/save";
import { Atlas } from "./render/atlas";
import { Renderer } from "./render/renderer";
import { Sky } from "./render/sky";
import { Particles } from "./render/particles";
import { preloadMobModels, MobView } from "./render/mobview";
import { Player, ItemStack } from "./entities/player";
import { Mob, Species, GameHooks, SPECIES } from "./entities/mob";
import { ItemDrop, Arrow, PrimedTnt } from "./entities/drops";
import { Hud } from "./ui/hud";
import { Screens } from "./ui/screens";
import { InventoryUI } from "./ui/inventory";
import * as sfx from "./audio/sfx";

type Mode = "title" | "loading" | "playing" | "paused" | "dead" | "inventory";

class Game {
  mode: Mode = "title";
  atlas = new Atlas();
  renderer!: Renderer;
  sky = new Sky();
  particles = new Particles();
  world!: World;
  player = new Player();
  hud!: Hud;
  screens = new Screens();
  invUI!: InventoryUI;
  mobs: Mob[] = [];
  drops: ItemDrop[] = [];
  arrows: Arrow[] = [];
  tnts: PrimedTnt[] = [];
  keys: Record<string, boolean> = {};
  mouseDown = false;
  rmbQueued = false;
  mining = false;
  mineTarget: { x: number; y: number; z: number } | null = null;
  mineProgress = 0;
  crack!: THREE.Mesh;
  highlight!: THREE.LineSegments;
  shake = 0;
  spawnTimer = 0;
  saveTimer = 30;
  acc = 0;
  lastT = 0;
  iconTextures = new Map<string, THREE.Texture>();
  handSwing = 0;
  playTime = 0;

  async boot(): Promise<void> {
    await this.atlas.load();
    this.hud = new Hud(this.atlas);
    await this.hud.loadArm();
    const canvas = document.getElementById("game") as HTMLCanvasElement;
    this.renderer = new Renderer(canvas, this.atlas);
    this.renderer.scene.add(this.sky.group, this.particles.group);

    // crack overlay + block highlight
    const crackGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    this.crack = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({
      map: this.atlas.image ? new THREE.CanvasTexture(this.atlas.image as any) : null,
      transparent: true, opacity: 0.75, depthWrite: false,
    }));
    // use atlas texture properly
    const ct = new THREE.Texture(this.atlas.image);
    ct.magFilter = THREE.NearestFilter;
    ct.minFilter = THREE.NearestFilter;
    ct.generateMipmaps = false;
    ct.needsUpdate = true;
    (this.crack.material as THREE.MeshBasicMaterial).map = ct;
    setBoxUV(crackGeo, this.atlas.rect("destroy_0"));
    this.crack.visible = false;
    this.crack.renderOrder = 3;
    this.renderer.scene.add(this.crack);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x101010 }));
    this.highlight.visible = false;
    this.renderer.scene.add(this.highlight);

    this.invUI = new InventoryUI(this.atlas, this.player);

    await preloadMobModels();

    this.screens.onStart = (loadSave: boolean) => this.startWorld(loadSave);
    this.screens.onResume = () => this.resume();
    this.screens.onRespawn = () => this.respawn();
    this.screens.onQuit = () => this.quitToTitle();
    this.screens.onOptions = (o) => {
      this.renderer.renderDistance = o.renderDistance;
    };
    this.screens.showTitle(!!loadGame());

    this.bindInput();
    window.addEventListener("resize", () => this.renderer.resize());
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------- world
  startWorld(loadSave: boolean): void {
    const saved = loadSave ? loadGame() : null;
    this.world = new World(saved ? saved.seed : (Math.random() * 1e9) | 0);
    this.mobs = [];
    this.drops = [];
    this.arrows = [];
    this.tnts = [];
    if (saved) {
      applyEdits(this.world, saved.edits);
      this.playTime = saved.time;
      if (saved.player) {
        const sp = saved.player;
        this.player.body.x = sp.x;
        this.player.body.y = sp.y;
        this.player.body.z = sp.z;
        this.player.yaw = sp.yaw;
        this.player.pitch = sp.pitch;
        this.player.health = sp.health;
        this.player.hunger = sp.hunger;
        this.player.hotbar = sp.hotbar;
        this.player.inv = sp.inv;
        this.player.creative = sp.creative;
      }
    } else {
      const sp = findSpawn(this.world);
      this.player.body.x = sp.x;
      this.player.body.y = sp.y;
      this.player.body.z = sp.z;
      this.player.health = 20;
      this.player.hunger = 20;
      this.player.inv = new Array(36).fill(null);
      this.player.addItem("item:wood_pickaxe", 1);
      this.player.addItem("item:wood_axe", 1);
      this.player.addItem("item:wood_sword", 1);
      this.player.addItem("item:apple", 3);
    }
    this.player.dead = false;
    this.world.spawnX = this.player.body.x;
    this.world.spawnY = this.player.body.y;
    this.world.spawnZ = this.player.body.z;
    this.sky.time = saved ? (saved.time % 600) / 600 : 0.3;
    this.screens.hide();
    this.mode = "playing";
    document.getElementById("game")!.requestPointerLock();
  }

  respawn(): void {
    this.player.respawn(this.world.spawnX, this.world.spawnY + 2, this.world.spawnZ);
    this.screens.hide();
    this.mode = "playing";
    document.getElementById("game")!.requestPointerLock();
  }

  resume(): void {
    this.screens.hide();
    this.mode = "playing";
    document.getElementById("game")!.requestPointerLock();
  }

  quitToTitle(): void {
    this.save();
    document.exitPointerLock();
    this.mode = "title";
    this.screens.showTitle(true);
  }

  save(): void {
    if (!this.world) return;
    const p = this.player;
    const ps: PlayerSave = {
      x: p.body.x, y: p.body.y, z: p.body.z,
      yaw: p.yaw, pitch: p.pitch,
      health: p.health, hunger: p.hunger,
      hotbar: p.hotbar, inv: p.inv,
      creative: p.creative,
    };
    saveGame(this.world, this.playTime, ps);
  }

  // ------------------------------------------------------------- input
  bindInput(): void {
    const canvas = document.getElementById("game")!;
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "F3") {
        e.preventDefault();
        this.debugOn = !this.debugOn;
      }
      if (this.mode === "playing") {
        if (e.code === "KeyE") {
          this.mode = "inventory";
          this.invUI.show(2);
          document.exitPointerLock();
        } else if (e.code === "Escape") {
          this.mode = "paused";
          this.save();
          this.screens.showPause();
          document.exitPointerLock();
        } else if (e.code === "KeyF") {
          this.player.eat();
        } else if (e.code === "KeyG" && this.player.creative) {
          // spawn a pig for testing
        } else if (e.code.startsWith("Digit")) {
          const n = parseInt(e.code.slice(5));
          if (n >= 1 && n <= 9) {
            this.player.hotbar = n - 1;
            const h = this.player.held();
            this.hud.showItemName(h ? ITEMS[h.item].label : "");
          }
        }
      } else if (this.mode === "inventory") {
        if (e.code === "KeyE" || e.code === "Escape") {
          this.invUI.hide();
          this.mode = "playing";
          canvas.requestPointerLock();
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener("wheel", (e) => {
      if (this.mode !== "playing") return;
      this.player.hotbar = (this.player.hotbar + (e.deltaY > 0 ? 1 : 8)) % 9;
      const h = this.player.held();
      this.hud.showItemName(h ? ITEMS[h.item].label : "");
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = this.screens.options.sensitivity * 0.0022;
      this.player.yaw -= e.movementX * s;
      this.player.pitch -= e.movementY * s * (this.screens.options.invertY ? -1 : 1);
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch));
    });
    canvas.addEventListener("mousedown", (e) => {
      sfx.resumeAudio();
      if (this.mode !== "playing") return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        if (!this.attackMob()) {
          this.mining = true;
          this.player.swing = 1;
        }
      } else if (e.button === 2) {
        this.rmbQueued = true;
      } else if (e.button === 1) {
        this.pickBlock();
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.mining = false;
        this.mineTarget = null;
        this.mineProgress = 0;
      }
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("beforeunload", () => this.save());
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas && this.mode === "playing") {
        this.mode = "paused";
        this.save();
        this.screens.showPause();
      }
    });
  }

  debugOn = false;

  attackMob(): boolean {
    const eye = new THREE.Vector3(this.player.body.x, this.player.eyeY, this.player.body.z);
    const dir = this.player.lookDir();
    let best: Mob | null = null;
    let bestT = 4;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const c = new THREE.Vector3(m.body.x, m.body.y + m.def.h / 2, m.body.z);
      const to = c.clone().sub(eye);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = eye.clone().addScaledVector(dir, t);
      const r = Math.max(m.def.w, m.def.h * 0.35) * 0.9;
      if (closest.distanceTo(c) < r + 0.35) {
        best = m;
        bestT = t;
      }
    }
    if (best && this.player.attackCooldown <= 0) {
      this.player.attackCooldown = 0.55;
      this.player.swing = 1;
      best.hurt(this.player.attackDamage(), this.player.body.x, this.player.body.z, this.hooks());
      this.handSwing = 1;
      return true;
    }
    return false;
  }

  pickBlock(): void {
    const hit = this.lookingAt();
    if (!hit) return;
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id === 0) return;
    const name = `block:${id}`;
    for (let i = 0; i < 9; i++) {
      const s = this.player.inv[i];
      if (s && s.item === name) {
        this.player.hotbar = i;
        return;
      }
    }
    if (this.player.creative) {
      this.player.inv[this.player.hotbar] = { item: name, count: 1 };
    }
  }

  lookingAt() {
    const eye = new THREE.Vector3(this.player.body.x, this.player.eyeY, this.player.body.z);
    const dir = this.player.lookDir();
    return this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 5);
  }

  // --------------------------------------------------------- interaction
  updateMining(dt: number): void {
    const hit = this.lookingAt();
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    if (this.rmbQueued) {
      this.rmbQueued = false;
      const h = this.player.held();
      if (hit && this.world.getBlock(hit.x, hit.y, hit.z) === B.CRAFTING) {
        this.mode = "inventory";
        this.invUI.show(3);
        document.exitPointerLock();
        return;
      }
      if (hit && h && ITEMS[h.item].block !== null && ITEMS[h.item].block !== undefined) {
        const bid = ITEMS[h.item].block!;
        const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
        // do not place inside player
        const b = this.player.body;
        const overlap =
          px + 1 > b.x - b.w / 2 && px < b.x + b.w / 2 &&
          py + 1 > b.y && py < b.y + b.h &&
          pz + 1 > b.z - b.w / 2 && pz < b.z + b.w / 2;
        const cur = this.world.getBlock(px, py, pz);
        if (!overlap && (cur === 0 || cur === B.WATER || BLOCKS[cur].cross)) {
          this.world.setBlock(px, py, pz, bid);
          this.player.consumeHeld();
          sfx.sfxPlace(bid === B.STONE ? "stone" : bid === B.SAND ? "sand" : "wood");
          // TNT placement is inert until primed by explosion; punching it primes
        } else if (!overlap && bid === B.TNT && cur === 0) {
          this.world.setBlock(px, py, pz, bid);
          this.player.consumeHeld();
        }
      } else if (hit) {
        // right click on tnt primes it
        const id = this.world.getBlock(hit.x, hit.y, hit.z);
        if (id === B.TNT) {
          this.world.setBlock(hit.x, hit.y, hit.z, 0, true);
          this.tnts.push(new PrimedTnt(hit.x + 0.5, hit.y + 0.1, hit.z + 0.5,
            (x, y, z, pw) => this.explode(x, y, z, pw)));
        }
      }
      this.handSwing = 0.6;
    }

    if (!this.mining || !hit) {
      this.crack.visible = false;
      if (!this.mining) {
        this.mineTarget = null;
        this.mineProgress = 0;
      }
      return;
    }

    const same = this.mineTarget &&
      this.mineTarget.x === hit.x && this.mineTarget.y === hit.y && this.mineTarget.z === hit.z;
    if (!same) {
      this.mineTarget = { x: hit.x, y: hit.y, z: hit.z };
      this.mineProgress = 0;
    }

    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    const def = BLOCKS[id];
    if (def.hardness > 90) return; // bedrock

    this.player.swing = 1;
    const speed = this.player.miningSpeed(id);
    const tierOk = this.player.canHarvest(id);
    this.mineProgress += (dt * speed * (tierOk ? 1 : 0.3)) / Math.max(0.05, def.hardness);

    sfx.sfxDig(def.tool === "pickaxe" ? "stone" : def.tiles.side.includes("sand") ? "sand"
      : def.tiles.side.includes("log") ? "wood" : def.tiles.side.includes("grass") ? "grass" : "dirt");

    const stage = Math.min(9, Math.floor(this.mineProgress * 10));
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    setBoxUV(this.crack.geometry as THREE.BoxGeometry, this.atlas.rect(`destroy_${stage}`));

    if (this.mineProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, id, tierOk);
      this.mineTarget = null;
      this.mineProgress = 0;
      this.crack.visible = false;
    }
  }

  breakBlock(x: number, y: number, z: number, id: number, harvested: boolean): void {
    const def = BLOCKS[id];
    this.world.setBlock(x, y, z, 0, true);
    sfx.sfxBreak(def.tool === "pickaxe" ? "stone" : "dirt");
    const col = id === B.GRASS ? 0x5e9c43 : id === B.SAND ? 0xdbd3a0
      : id === B.STONE || id === B.COBBLE ? 0x8b8b8b
      : id === B.LOG ? 0x6b5333 : id === B.LEAVES ? 0x3e7a28
      : id === B.SNOW ? 0xf2f6f9 : 0x866043;
    this.particles.spawn(x + 0.5, y + 0.5, z + 0.5, col, 10, "generic", 2.4);

    if (id === B.TNT) {
      this.tnts.push(new PrimedTnt(x + 0.5, y + 0.1, z + 0.5,
        (ax, ay, az, pw) => this.explode(ax, ay, az, pw)));
      return;
    }
    if (!harvested) return;
    let dropName = def.drop;
    if (dropName === null) {
      if (id === B.LEAVES && Math.random() < 0.05) dropName = "item:apple";
      else return;
    }
    if (dropName) {
      this.spawnDrop(dropName, 1, x + 0.5, y + 0.4, z + 0.5);
    }
  }

  spawnDrop(item: string, count: number, x: number, y: number, z: number): void {
    const d = new ItemDrop(item, count, x, y, z, (name) => this.iconTexture(name));
    this.drops.push(d);
    this.renderer.scene.add(d.mesh);
  }

  iconTexture(item: string): THREE.Texture {
    let t = this.iconTextures.get(item);
    if (t) return t;
    const def = ITEMS[item];
    const r = this.atlas.rect(def ? def.icon : "stone");
    const cv = document.createElement("canvas");
    cv.width = 16;
    cv.height = 16;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.atlas.image, r[0], r[1], 16, 16, 0, 0, 16, 16);
    t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    this.iconTextures.set(item, t);
    return t;
  }

  explode(x: number, y: number, z: number, power: number): void {
    sfx.sfxExplode();
    this.shake = 0.5;
    this.particles.spawn(x, y, z, 0xe87820, 30, "flame", 6);
    this.particles.spawn(x, y, z, 0x909090, 24, "smoke", 5);
    const r = power;
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > r) continue;
          const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
          const id = this.world.getBlock(bx, by, bz);
          if (id === 0 || id === B.BEDROCK || id === B.WATER) continue;
          const def = BLOCKS[id];
          if (def.tier > 0) continue; // ores survive
          const chance = 1 - d / (r + 0.5);
          if (Math.random() < chance + 0.15) {
            if (id === B.STONE && d > r * 0.6) {
              this.world.setBlock(bx, by, bz, B.COBBLE, true);
            } else {
              this.world.setBlock(bx, by, bz, 0, true);
              if (id === B.TNT) {
                this.tnts.push(new PrimedTnt(bx + 0.5, by + 0.1, bz + 0.5,
                  (ax, ay, az, pw) => this.explode(ax, ay, az, pw)));
              }
            }
          }
        }
      }
    }
    // entity damage
    const hitEnt = (ex: number, ey: number, ez: number) => {
      const dx = ex - x, dy = ey - y, dz = ez - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return Math.max(0, 1 - d / (r + 1));
    };
    const pp = this.player.body;
    const pf = hitEnt(pp.x, pp.y + 0.9, pp.z);
    if (pf > 0) this.player.damage(Math.round(24 * pf), x, z);
    for (const m of this.mobs) {
      const f = hitEnt(m.body.x, m.body.y + 0.5, m.body.z);
      if (f > 0) {
        m.hurt(Math.round(30 * f), x, z, this.hooks());
        m.body.vx += (m.body.x - x) * f * 8;
        m.body.vz += (m.body.z - z) * f * 8;
        m.body.vy += f * 6;
      }
    }
  }

  hooks(): GameHooks {
    return {
      explode: (x, y, z, pw) => this.explode(x, y, z, pw),
      spawnArrow: (x, y, z, vx, vy, vz, fromPlayer) => {
        const a = new Arrow(x, y, z, vx, vy, vz, fromPlayer);
        this.arrows.push(a);
        this.renderer.scene.add(a.mesh);
      },
      dropLoot: (x, y, z, drops) => {
        for (const [n, c] of drops) this.spawnDrop(n, c, x, y, z);
      },
      damagePlayer: (amt, fx, fz) => this.player.damage(amt, fx, fz),
      playerPos: () => new THREE.Vector3(this.player.body.x, this.player.body.y, this.player.body.z),
      playerAlive: () => !this.player.dead,
      isDay: () => this.sky.isDay(),
      alertNear: (x, y, z, r) => {
        for (const m of this.mobs) {
          if (m.species !== "zombie" || m.dead) continue;
          const d = Math.abs(m.body.x - x) + Math.abs(m.body.z - z);
          if (d < r) m.memory = Math.max(m.memory, 4);
        }
      },
      particles: this.particles,
    };
  }

  // ------------------------------------------------------------ spawning
  trySpawn(): void {
    if (this.mobs.length >= 40) return;
    const p = this.player.body;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 24;
      const x = Math.floor(p.x + Math.sin(ang) * dist);
      const z = Math.floor(p.z + Math.cos(ang) * dist);
      let y = -1;
      for (let yy = this.world.columnTop(x, z) + 1; yy > 0; yy--) {
        const g = this.world.getBlock(x, yy - 1, z);
        const a1 = this.world.getBlock(x, yy, z);
        const a2 = this.world.getBlock(x, yy + 1, z);
        if (BLOCKS[g].solid && a1 === 0 && a2 === 0) {
          y = yy;
          break;
        }
      }
      if (y < 0) continue;
      const surface = this.world.getBlock(x, y - 1, z);
      const night = !this.sky.isDay();
      const cavey = y < 42;
      let species: Species | null = null;
      if (night || cavey) {
        const r = Math.random();
        species = r < 0.35 ? "zombie" : r < 0.65 ? "skeleton" : r < 0.85 ? "creeper" : "spider";
      } else {
        if (surface !== B.GRASS) continue;
        const r = Math.random();
        species = r < 0.3 ? "pig" : r < 0.55 ? "cow" : r < 0.8 ? "sheep" : "chicken";
      }
      if (!species) continue;
      const mob = new Mob(species, x + 0.5, y + 0.05, z + 0.5);
      this.mobs.push(mob);
      this.renderer.scene.add(mob.view.object);
      if (species === "spider") mob.provoked = night;
      return;
    }
  }

  // --------------------------------------------------------------- loop
  loop(t: number): void {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;

    if (this.mode === "playing" || this.mode === "paused" || this.mode === "inventory" || this.mode === "dead") {
      this.sky.group.position.set(0, 0, 0);
    }

    if (this.mode === "playing") {
      this.step(dt);
    }

    // render always (world behind menus)
    if (this.world) {
      const cam = this.renderer.camera;
      const p = this.player;
      cam.position.set(p.body.x, p.eyeY, p.body.z);
      cam.rotation.set(0, 0, 0);
      cam.rotateY(p.yaw);
      cam.rotateX(p.pitch);
      if (this.shake > 0) {
        this.shake -= dt;
        cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
        cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      }
      const light = this.sky.update(dt, cam.position);
      this.renderer.setDayLight(light);
      this.renderer.updateChunks(this.world, p.body.x, p.body.z, this.atlas,
        this.mode === "playing" ? 3 : 1);
      this.particles.update(dt, cam);
      this.renderer.render();
    }

    // hud
    if (this.mode !== "title" && this.world) {
      this.handSwing = Math.max(0, this.handSwing - dt * 3);
      let dbg = "";
      if (this.debugOn) {
        const b = this.player.body;
        const bi = this.world.biomeAt(Math.floor(b.x), Math.floor(b.z));
        dbg =
          `BLOCKCRAFT F3 DEBUG\n` +
          `XYZ ${b.x.toFixed(2)} / ${b.y.toFixed(2)} / ${b.z.toFixed(2)}\n` +
          `CHUNK ${Math.floor(b.x) >> 4}, ${Math.floor(b.y) >> 4}, ${Math.floor(b.z) >> 4}\n` +
          `BIOME ${bi.toUpperCase()}\n` +
          `FPS ${Math.round(1 / Math.max(0.001, (performance.now() - this.lastT + 1) / 1000))}\n` +
          `TIME ${(this.sky.time * 24).toFixed(1)} H  ${this.sky.isDay() ? "DAY" : "NIGHT"}\n` +
          `MOBS ${this.mobs.length}  DROPS ${this.drops.length}\n` +
          `SEED ${this.world.seed}\n` +
          `MODE ${this.player.creative ? "CREATIVE" : "SURVIVAL"}${this.player.flying ? " FLY" : ""}`;
      }
      this.hud.update(dt, this.player, this.debugOn, dbg, this.handSwing);
    }
  }

  step(dt: number): void {
    this.playTime += dt;
    const p = this.player;

    // creative fly toggle
    if (p.creative && this.keys["Space"] && this.keys["ShiftLeft"]) {
      // keep
    }

    const input = {
      fwd: (this.keys["KeyW"] ? 1 : 0) - (this.keys["KeyS"] ? 1 : 0),
      strafe: (this.keys["KeyD"] ? 1 : 0) - (this.keys["KeyA"] ? 1 : 0),
      jump: !!this.keys["Space"],
      sneak: !!this.keys["ShiftLeft"],
      sprint: !!this.keys["ControlLeft"] || this.sprintToggle,
    };
    p.update(dt, this.world, input);

    if (p.dead && this.mode === "playing") {
      this.mode = "dead";
      this.save();
      this.screens.showDeath();
      document.exitPointerLock();
      return;
    }

    this.updateMining(dt);

    // mobs
    const hooks = this.hooks();
    const pp = new THREE.Vector3(p.body.x, p.body.y, p.body.z);
    for (const m of this.mobs) {
      m.update(dt, this.world, hooks, this.playTime);
      m.syncView(pp, dt);
      // melee contact for hostile touch damage (spider)
      if (!m.dead && m.species === "spider") {
        const d = m.distToPlayer(pp);
        if (d < 1.2 && m.attackTimer <= 0) {
          m.attackTimer = 0.9;
          p.damage(2, m.body.x, m.body.z);
        }
      }
    }
    this.mobs = this.mobs.filter((m) => {
      if (m.dead && m.deadTimer <= 0) {
        this.renderer.scene.remove(m.view.object);
        return false;
      }
      const dx = m.body.x - p.body.x, dz = m.body.z - p.body.z;
      if (dx * dx + dz * dz > 80 * 80) {
        this.renderer.scene.remove(m.view.object);
        return false;
      }
      return true;
    });

    // drops
    this.drops = this.drops.filter((d) => {
      const keep = d.update(dt, this.world);
      if (!d.pickupDelay && !p.dead) {
        const dx = d.body.x - p.body.x, dy = d.body.y - p.body.y, dz = d.body.z - p.body.z;
        if (dx * dx + dy * dy + dz * dz < 1.6) {
          const left = p.addItem(d.item, d.count);
          if (left === 0) {
            this.hud.showItemName(ITEMS[d.item].label);
            sfx.sfxClick();
            this.renderer.scene.remove(d.mesh);
            return false;
          }
          d.count = left;
        }
      }
      if (!keep) this.renderer.scene.remove(d.mesh);
      return keep;
    });

    // arrows
    this.arrows = this.arrows.filter((a) => {
      const keep = a.update(dt, this.world);
      if (!a.stuck && !a.fromPlayer && !p.dead) {
        const c = new THREE.Vector3(p.body.x, p.body.y + 0.9, p.body.z);
        if (a.mesh.position.distanceTo(c) < 0.6) {
          p.damage(a.damage, a.body.x, a.body.z);
          this.renderer.scene.remove(a.mesh);
          return false;
        }
      }
      if (!keep) this.renderer.scene.remove(a.mesh);
      return keep;
    });

    // tnt
    this.tnts = this.tnts.filter((tnt) => {
      const keep = tnt.update(dt, this.world);
      if (!keep) this.renderer.scene.remove(tnt.mesh);
      return keep;
    });

    // spawn cycle
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      this.trySpawn();
    }

    // autosave
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 30;
      this.save();
    }
  }

  sprintToggle = false;
}

// ---------------------------------------------------------------- helpers
function setBoxUV(geo: THREE.BoxGeometry, rect: number[]): void {
  // map the 6 box faces onto one atlas tile (rect = [x,y,w,h] in 256 atlas)
  const [x, y] = rect;
  const u0 = (x + 0.5) / 256, u1 = (x + 15.5) / 256;
  const v0 = 1 - (y + 15.5) / 256, v1 = 1 - (y + 0.5) / 256;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const quads = [
    [u0, v0, u1, v1],
  ];
  // BoxGeometry has 24 uv coords (4 per face): +X,-X,+Y,-Y,+Z,-Z
  for (let face = 0; face < 6; face++) {
    const i = face * 4;
    uv.setXY(i + 0, u0, v0);
    uv.setXY(i + 1, u1, v0);
    uv.setXY(i + 2, u0, v1);
    uv.setXY(i + 3, u1, v1);
  }
  uv.needsUpdate = true;
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const ui = document.getElementById("ui")!;
  ui.innerHTML = `<div class="screen"><div class="hint">BOOT ERROR: ${e}</div></div>`;
});
