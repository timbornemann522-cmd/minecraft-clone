// MobView: loads Blender-exported GLB models and animates them procedurally
// through the named pivot nodes (head_piv, arm_l_piv, leg_fl_piv, ...).

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import zombieUrl from "../../assets/models/zombie.glb?url";
import skeletonUrl from "../../assets/models/skeleton.glb?url";
import creeperUrl from "../../assets/models/creeper.glb?url";
import spiderUrl from "../../assets/models/spider.glb?url";
import pigUrl from "../../assets/models/pig.glb?url";
import cowUrl from "../../assets/models/cow.glb?url";
import sheepUrl from "../../assets/models/sheep.glb?url";
import chickenUrl from "../../assets/models/chicken.glb?url";

export const MODEL_URLS: Record<string, string> = {
  zombie: zombieUrl,
  skeleton: skeletonUrl,
  creeper: creeperUrl,
  spider: spiderUrl,
  pig: pigUrl,
  cow: cowUrl,
  sheep: sheepUrl,
  chicken: chickenUrl,
};

const templates = new Map<string, THREE.Object3D>();

export async function preloadMobModels(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    Object.entries(MODEL_URLS).map(async ([name, url]) => {
      const gltf = await loader.loadAsync(url);
      const root = gltf.scene;
      // flat pixel materials
      root.traverse((o: any) => {
        if (o.isMesh) {
          const src = o.material as THREE.MeshStandardMaterial;
          const m = new THREE.MeshBasicMaterial({
            map: src.map || null,
            transparent: true,
            alphaTest: 0.3,
          });
          m.map && ((m.map as THREE.Texture).magFilter = THREE.NearestFilter,
            (m.map as THREE.Texture).minFilter = THREE.NearestFilter,
            ((m.map as THREE.Texture).generateMipmaps = false),
            ((m.map as THREE.Texture).needsUpdate = true));
          o.material = m;
          o.frustumCulled = true;
        }
      });
      templates.set(name, root);
    })
  );
}

export interface AnimState {
  walkPhase: number;
  speed: number;
  lookYaw: number;
  lookPitch: number;
  attacking: boolean;
  hurt: number;          // 0..1 flash
  fuse: number;          // creeper 0..1
  wingFlap: number;      // chicken
  climbing: boolean;
  dead: boolean;
}

export class MobView {
  object: THREE.Object3D;
  nodes = new Map<string, THREE.Object3D>();
  base = new Map<string, THREE.Quaternion>();
  materials: THREE.MeshBasicMaterial[] = [];
  furNodes: THREE.Object3D[] = [];

  constructor(species: string) {
    const tpl = templates.get(species)!;
    this.object = tpl.clone(true);
    this.object.traverse((o: any) => {
      this.nodes.set(o.name, o);
      if (o.name.endsWith("_piv")) this.base.set(o.name, o.quaternion.clone());
      if (o.isMesh) {
        // clone material so hurt/fuse flashes stay per-instance
        const m = (o.material as THREE.MeshBasicMaterial).clone();
        o.material = m;
        this.materials.push(m);
        if (o.name.startsWith("fur_")) this.furNodes.push(o);
      }
    });
  }

  setFurVisible(v: boolean): void {
    for (const n of this.furNodes) n.visible = v;
  }

  private piv(name: string): THREE.Object3D | undefined {
    return this.nodes.get(name + "_piv");
  }

  private setRot(name: string, x: number, y: number, z: number): void {
    const p = this.piv(name);
    if (!p) return;
    p.rotation.set(x, y, z);
  }

  update(dt: number, st: AnimState): void {
    const swing = Math.sin(st.walkPhase) * Math.min(1, st.speed / 2.5);
    const amp = 0.7;

    // humanoids + creeper bipeds: legs opposite phase, arms same as legs
    this.setRot("leg_r", swing * amp, 0, 0);
    this.setRot("leg_l", -swing * amp, 0, 0);

    // arms: opposite to same-side leg
    let armR = -swing * amp;
    let armL = swing * amp;
    if (st.attacking) armR = -2.2;
    this.setRot("arm_r", armR, 0, st.attacking ? 0 : 0.08);
    this.setRot("arm_l", armL, 0, -0.08);

    // quadruped legs (diagonal pairs)
    this.setRot("leg_fl", swing * amp, 0, 0);
    this.setRot("leg_br", swing * amp, 0, 0);
    this.setRot("leg_fr", -swing * amp, 0, 0);
    this.setRot("leg_bl", -swing * amp, 0, 0);

    // fur legs follow
    for (const nm of ["fur_leg_fl", "fur_leg_fr", "fur_leg_bl", "fur_leg_br"]) {
      const src = nm.replace("fur_", "");
      const p = this.piv(nm);
      const s = this.piv(src);
      if (p && s) p.rotation.copy(s.rotation);
    }

    // head look
    const hp = this.piv("head");
    if (hp) {
      const b = this.base.get("head_piv")!;
      const e = new THREE.Euler().setFromQuaternion(b);
      hp.rotation.set(
        e.x + st.lookPitch,
        e.y + st.lookYaw,
        e.z
      );
    }

    // creeper legs: 4-leg gait
    if (this.nodes.has("leg_fl_piv")) {
      if (this.nodes.has("body_piv") && !this.nodes.has("arm_l_piv") && !this.nodes.has("leg_r_piv")) {
        // quadruped handled above; creeper uses leg_fl/fr/bl/br too
      }
    }

    // spider legs wave
    let any = false;
    for (const [name, node] of this.nodes) {
      if (name.startsWith("leg_l") || name.startsWith("leg_r")) {
        if (name.length > 6 && name.includes("_piv")) {
          const b = this.base.get(name);
          if (!b) continue;
          const e = new THREE.Euler().setFromQuaternion(b);
          const phase = st.climbing ? st.walkPhase * 2 : st.walkPhase;
          node.rotation.set(
            e.x + Math.sin(phase + name.charCodeAt(5) * 1.3) * (st.speed > 0.1 ? 0.35 : 0.08),
            e.y,
            e.z
          );
          any = true;
        }
      }
    }

    // chicken wings
    if (st.wingFlap > 0) {
      this.setRot("wing_r", 0, 0, -0.4 - Math.sin(st.walkPhase * 8) * 0.8);
      this.setRot("wing_l", 0, 0, 0.4 + Math.sin(st.walkPhase * 8) * 0.8);
    } else {
      this.setRot("wing_r", 0, 0, -0.15);
      this.setRot("wing_l", 0, 0, 0.15);
    }

    // fuse scale pulse + white flash (creeper)
    const body = this.nodes.get("body");
    if (st.fuse > 0) {
      const s = 1 + Math.sin(st.fuse * 40) * 0.04;
      this.object.scale.setScalar(s);
      const whiteness = st.fuse;
      for (const m of this.materials) {
        m.color.setRGB(1 + whiteness * 2, 1 + whiteness * 2, 1 + whiteness * 2);
      }
    } else if (st.hurt > 0) {
      this.object.scale.setScalar(1);
      for (const m of this.materials) {
        m.color.setRGB(1 + st.hurt * 2, 1 - st.hurt * 0.4, 1 - st.hurt * 0.4);
      }
    } else {
      this.object.scale.setScalar(1);
      for (const m of this.materials) m.color.setRGB(1, 1, 1);
    }

    if (st.dead) {
      this.object.rotateX(Math.min(1, (1 - st.hurt) * 3) * 0.05);
    }
  }

  setPoseIdle(): void {
    for (const [name, q] of this.base) {
      const n = this.nodes.get(name);
      if (n) n.quaternion.copy(q);
    }
  }
}
