import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  HANDLE_TIP_Y,
  type HandleKey,
  type SpaceBuilderScene,
} from './SpaceBuilderScene';

export type SceneArrowDef = {
  handle: HandleKey;
  text: string;
  /** World-space shaft length in meters. */
  length?: number;
  /** Optional fixed outward direction in XZ (normalized later). */
  direction?: { x: number; z: number };
};

type ArrowItem = {
  def: SceneArrowDef;
  root: Group;
  shaft: Mesh;
  head: Mesh;
  label: CSS2DObject;
};

const INK = 0xf4f0ea;
const Y_UP = new Vector3(0, 1, 0);
const TMP = new Vector3();
const TMP_B = new Vector3();

/**
 * Technical-drawing arrows in world space: shaft + tip cone + CSS2D label with
 * underline — same vocabulary as {@link ArrowAnnotation.astro}, anchored to
 * SelectArea grab handles.
 */
export class SceneArrowAnnotations {
  private readonly host: SpaceBuilderScene;
  private readonly group = new Group();
  private readonly items: ArrowItem[] = [];
  private readonly shaftGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly headGeo = new ConeGeometry(1, 1, 5);
  private readonly mat = new MeshBasicMaterial({
    color: INK,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  });

  constructor(host: SpaceBuilderScene) {
    this.host = host;
    this.group.renderOrder = 10;
    this.host.scene.add(this.group);
  }

  set(defs: SceneArrowDef[]) {
    this.clearItems();
    for (const def of defs) {
      this.items.push(this.makeItem(def));
    }
    this.sync();
  }

  sync() {
    for (const item of this.items) {
      this.layoutItem(item);
    }
  }

  dispose() {
    this.clearItems();
    this.host.scene.remove(this.group);
    this.shaftGeo.dispose();
    this.headGeo.dispose();
    this.mat.dispose();
  }

  private clearItems() {
    for (const item of this.items) {
      this.group.remove(item.root);
      item.label.element.remove();
    }
    this.items.length = 0;
  }

  private makeItem(def: SceneArrowDef): ArrowItem {
    const root = new Group();
    const shaft = new Mesh(this.shaftGeo, this.mat);
    const head = new Mesh(this.headGeo, this.mat);
    shaft.renderOrder = 11;
    head.renderOrder = 12;
    root.add(shaft);
    root.add(head);

    const el = document.createElement('div');
    el.className = 'sb-scene-anno';
    el.innerHTML = `<span class="sb-scene-anno__text"></span>`;
    const textEl = el.querySelector('.sb-scene-anno__text');
    if (textEl) textEl.textContent = def.text;
    const label = new CSS2DObject(el);
    root.add(label);
    this.group.add(root);

    return { def, root, shaft, head, label };
  }

  private layoutItem(item: ArrowItem) {
    const tip = this.host.getHandleWorldPosition(item.def.handle);
    const center = this.host.getAreaCenter();
    if (!tip || !center) {
      item.root.visible = false;
      return;
    }
    item.root.visible = true;

    const dir = TMP;
    if (item.def.direction) {
      dir.set(item.def.direction.x, 0, item.def.direction.z);
    } else {
      dir.copy(tip).sub(center);
      dir.y = 0;
    }
    if (dir.lengthSq() < 1e-6) {
      dir.set(1, 0, 0.35);
    }
    dir.normalize();

    const length = item.def.length ?? 1.7;
    tip.y = HANDLE_TIP_Y;
    const end = TMP_B.copy(tip).addScaledVector(dir, length);
    end.y = tip.y + 0.45;

    // Shaft: cylinder along Y, then orient tip→end.
    const mid = tip.clone().add(end).multiplyScalar(0.5);
    const shaftLen = tip.distanceTo(end);
    item.shaft.position.copy(mid);
    item.shaft.scale.set(0.018, shaftLen, 0.018);
    item.shaft.quaternion.setFromUnitVectors(Y_UP, end.clone().sub(tip).normalize());

    // Cone tip at the handle — pointy end toward the lollipop (matches SVG marker-start).
    const headLen = 0.22;
    const headRadius = 0.09;
    const towardTip = tip.clone().sub(end).normalize();
    item.head.scale.set(headRadius, headLen, headRadius);
    // ConeGeometry apex is at local +Y * 0.5; park the mesh so the apex sits on `tip`.
    item.head.position.copy(tip).addScaledVector(towardTip, -headLen * 0.5);
    item.head.quaternion.setFromUnitVectors(Y_UP, towardTip);

    item.label.position.copy(end);
  }
}
