import {
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  Spherical,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  DEFAULT_LAYOUT_OPTIONS,
  layoutChairs,
  maxInnerDiameter,
  tagContent,
  type AreaRect,
  type LayoutOptions,
  type LayoutStyle,
} from './layoutEngine';
import { createDemoSkybox } from './demoSkybox';

const GROUND_SIZE = 28;
const GRASS_REPEAT = 5;
/** Subdivisions for MeshStandardMaterial displacement (visible grass only). */
const GRASS_SEGMENTS = 64;
const GRASS_DISPLACEMENT = 0.22;
const CHAIR_TARGET_HEIGHT = 0.95;

// Match Space Builder SelectArea handles (Actions/SelectArea.js), scaled to meters.
const HANDLE_SPHERE_HEIGHT = 1.35;
const HANDLE_SPHERE_RADIUS = 0.18;
const HANDLE_STEM_RADIUS = 0.028;
const HANDLE_BLUE = 0x009acd;
const HANDLE_GREEN = 0x89ab22;
const HANDLE_PINK = 0xe600e6;
const HANDLE_ROTATE_GAP = 1.0;

export type HandleKey =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'right'
  | 'bottomRight'
  | 'bottom'
  | 'bottomLeft'
  | 'left'
  | 'center'
  | 'rotate';

/** World-Y of the SelectArea lollipop sphere center — use for annotation tips. */
export const HANDLE_TIP_Y = HANDLE_SPHERE_HEIGHT;

export type SceneSnapshot = {
  area: AreaRect | null;
  options: LayoutOptions;
  seats: number;
  maxSeats: number;
  /** Upper bound for the Inner Circle slider given the current SelectArea. */
  innerDiameterMax: number;
  valid: boolean;
  flash: string | null;
};

export type SpaceBuilderSceneOptions = {
  canvas: HTMLCanvasElement;
  labelHost: HTMLElement;
  onSnapshot?: (snapshot: SceneSnapshot) => void;
};

const DEFAULT_OPTIONS: LayoutOptions = {
  ...DEFAULT_LAYOUT_OPTIONS,
  blocks: { ...DEFAULT_LAYOUT_OPTIONS.blocks },
};

const ORBIT_RADIUS_MIN = 6;
const ORBIT_RADIUS_MAX = 42;

export class SpaceBuilderScene {
  readonly renderer: WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly interactionPlane = new Plane(new Vector3(0, 1, 0), 0);

  private readonly root: HTMLElement;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly hit = new Vector3();
  private readonly dummy = new Object3D();
  // Keep a side-on orbit: low phi shows the skybox nadir (near-black) around the finite ground.
  private readonly spherical = new Spherical(18, Math.PI * 0.38, Math.PI * 0.28);
  private readonly cameraTarget = new Vector3(0, 0, 0);

  private animationId = 0;
  private active = true;
  private disposed = false;
  private area: AreaRect | null = null;
  private options: LayoutOptions = {
    ...DEFAULT_OPTIONS,
    blocks: { ...DEFAULT_OPTIONS.blocks },
  };
  private flash: string | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private orbiting = false;
  private panning = false;
  private drawing = false;
  private drawStart: Vector3 | null = null;
  private lastPointer = new Vector2();
  private draggingHandle: HandleKey | null = null;
  private handleAreaStart: AreaRect | null = null;
  private readonly handleDragOrigin = new Vector3();
  private readonly panRight = new Vector3();
  private readonly panForward = new Vector3();
  /** Bumped on user camera/area interaction so autoplay rAF tweens stop touching the scene. */
  private interactionEpoch = 0;

  private selectMesh!: Mesh;
  private selectGroup = new Group();
  private handles = new Group();
  private handleByKey = {} as Record<HandleKey, Group>;
  private innerGuide!: Mesh;
  private tagObject!: CSS2DObject;
  private tagEl!: HTMLDivElement;
  private chairs: InstancedMesh | null = null;
  private chairGeometry: BufferGeometry | null = null;
  private chairMaterial: Material | null = null;
  private chairScale = 1;
  private chairYOffset = 0;
  private chairReady: Promise<void> | null = null;
  private ghost: Mesh | null = null;
  private textures: Texture[] = [];
  private skybox: Mesh | null = null;
  private onSnapshot?: (snapshot: SceneSnapshot) => void;
  private resizeObserver: ResizeObserver;

  constructor({ canvas, labelHost, onSnapshot }: SpaceBuilderSceneOptions) {
    this.root = canvas.parentElement ?? labelHost;
    this.onSnapshot = onSnapshot;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x6e8fc4, 1);
    // Cap DPR — full retina + antialias made first WebGL frames noticeably late.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'space-builder-labels';
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    labelHost.appendChild(this.labelRenderer.domElement);

    this.camera = new PerspectiveCamera(42, 1, 0.1, 120);
    this.updateCamera();

    this.scene.background = new Color('#6e8fc4');
    this.scene.fog = null;
    const sunDir = new Vector3(0.42, 0.78, 0.28).normalize();
    this.skybox = createDemoSkybox(sunDir);
    this.scene.add(this.skybox);

    this.scene.add(new AmbientLight(0xdde7ff, 0.45));
    this.scene.add(new HemisphereLight(0x9eb7e0, 0x3f4a2e, 0.55));
    const sun = new DirectionalLight(0xfff2d8, 1.35);
    sun.position.copy(sunDir).multiplyScalar(24);
    this.scene.add(sun);

    this.buildGround();
    this.buildSelectArea();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => {
      // Coalesce layout reads onto the next frame to avoid forced-reflow storms.
      requestAnimationFrame(() => {
        if (!this.disposed) this.resize();
      });
    });
    this.resizeObserver.observe(this.root);
    // Viewport can be 0×0 on the first paint; also watch the app shell so we
    // pick up the settled grid height and don't leave the canvas at 300×150.
    const appShell = canvas.closest('.space-builder-app');
    if (appShell && appShell !== this.root) {
      this.resizeObserver.observe(appShell);
    }

    this.startLoop();
  }

  private startLoop() {
    cancelAnimationFrame(this.animationId);
    const tick = () => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(tick);
      if (!this.active) return;
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    tick();
  }

  pause() {
    this.active = false;
  }

  resume() {
    if (this.disposed) return;
    this.active = true;
  }

  isActive() {
    return this.active && !this.disposed;
  }

  async loadChair(url = '/demos/space-builder/chair.glb') {
    if (this.chairReady) return this.chairReady;
    this.chairReady = this.loadChairInternal(url);
    return this.chairReady;
  }

  whenChairReady() {
    return this.chairReady ?? Promise.resolve();
  }

  private async loadChairInternal(url: string) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (MeshoptDecoder.ready) {
      await MeshoptDecoder.ready;
    }
    const gltf = await loader.loadAsync(url);
    if (this.disposed) return;
    const mesh = this.findFirstMesh(gltf.scene);
    if (!mesh) throw new Error('Chair mesh missing');

    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const height = box.max.y - box.min.y;
    this.chairScale = CHAIR_TARGET_HEIGHT / height;
    this.chairYOffset = -box.min.y * this.chairScale;

    this.chairGeometry = mesh.geometry;
    this.chairMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

    this.ghost = new Mesh(this.chairGeometry, this.chairMaterial);
    this.ghost.scale.setScalar(this.chairScale);
    this.ghost.position.y = this.chairYOffset;
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.emitSnapshot();
  }

  getSnapshot(): SceneSnapshot {
    const result = this.area
      ? layoutChairs(this.area, this.options)
      : { seats: 0, maxSeats: 0, valid: false, poses: [] };
    return {
      area: this.area,
      options: {
        ...this.options,
        blocks: { ...this.options.blocks },
      },
      seats: result.seats,
      maxSeats: result.maxSeats,
      innerDiameterMax: this.area ? maxInnerDiameter(this.area, this.options) : 4,
      valid: result.valid,
      flash: this.flash,
    };
  }

  setOptions(partial: Partial<LayoutOptions>) {
    this.options = {
      ...this.options,
      ...partial,
      blocks: partial.blocks
        ? { ...this.options.blocks, ...partial.blocks }
        : this.options.blocks,
    };
    this.clampInnerDiameter();
    this.reflow();
  }

  setStyle(style: LayoutStyle) {
    this.setOptions({ style });
  }

  setFlash(message: string | null, ms = 1800) {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flash = message;
    this.emitSnapshot();
    if (message) {
      this.flashTimer = setTimeout(() => {
        this.flash = null;
        this.emitSnapshot();
      }, ms);
    }
  }

  clearArea() {
    this.area = null;
    this.selectGroup.visible = false;
    this.tagObject.visible = false;
    this.clearChairs();
    this.emitSnapshot();
  }

  reset() {
    this.clearArea();
    this.options = {
      ...DEFAULT_OPTIONS,
      blocks: { ...DEFAULT_OPTIONS.blocks },
    };
    this.setGhostVisible(false);
    this.setFlash(null);
    this.emitSnapshot();
  }

  setArea(area: AreaRect) {
    this.area = { ...area };
    this.selectGroup.visible = true;
    this.clampInnerDiameter();
    this.updateSelectVisual();
    this.reflow();
  }

  async drawAreaAnimated(
    start: { x: number; z: number },
    end: { x: number; z: number },
    durationMs = 900,
    onProgress?: (point: { x: number; z: number }) => void,
  ) {
    const from = new Vector3(start.x, 0, start.z);
    const to = new Vector3(end.x, 0, end.z);
    const t0 = performance.now();
    const epoch = this.interactionEpoch;
    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        if (this.disposed || epoch !== this.interactionEpoch) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / durationMs);
        const eased = t * t * (3 - 2 * t);
        const cur = from.clone().lerp(to, eased);
        this.setAreaFromCorners(from, cur);
        onProgress?.({ x: cur.x, z: cur.z });
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /** Animate a corner drag so the demo cursor can track a resize. */
  async resizeAreaAnimated(
    end: { width: number; depth: number },
    durationMs = 700,
    onProgress?: (point: { x: number; z: number }) => void,
  ) {
    if (!this.area) return;
    const startArea = { ...this.area };
    const startCorner = {
      x: startArea.x + startArea.width / 2,
      z: startArea.z + startArea.depth / 2,
    };
    const endCorner = {
      x: startArea.x - startArea.width / 2 + end.width,
      z: startArea.z - startArea.depth / 2 + end.depth,
    };
    // Keep the opposite (min) corner fixed while the max corner moves.
    const fixed = {
      x: startArea.x - startArea.width / 2,
      z: startArea.z - startArea.depth / 2,
    };
    const t0 = performance.now();
    const epoch = this.interactionEpoch;
    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        if (this.disposed || !this.area || epoch !== this.interactionEpoch) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / durationMs);
        const eased = t * t * (3 - 2 * t);
        const cur = {
          x: startCorner.x + (endCorner.x - startCorner.x) * eased,
          z: startCorner.z + (endCorner.z - startCorner.z) * eased,
        };
        this.setAreaFromCorners(
          new Vector3(fixed.x, 0, fixed.z),
          new Vector3(cur.x, 0, cur.z),
        );
        onProgress?.(cur);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  nudgeArea(dx: number, dz: number) {
    if (!this.area) return;
    this.setArea({
      ...this.area,
      x: this.area.x + dx,
      z: this.area.z + dz,
    });
  }

  rotateArea(delta: number, snap = false) {
    if (!this.area) return;
    let angle = this.area.angle + delta;
    if (snap) {
      const step = Math.PI / 8;
      angle = Math.round(angle / step) * step;
    }
    this.setArea({ ...this.area, angle });
  }

  setGhostVisible(visible: boolean) {
    if (this.ghost) this.ghost.visible = visible;
  }

  setGhostAt(clientX: number, clientY: number) {
    if (!this.ghost) return;
    const point = this.clientToGround(clientX, clientY);
    if (!point) return;
    this.ghost.position.x = point.x;
    this.ghost.position.z = point.z;
    this.ghost.position.y = this.chairYOffset;
    this.ghost.visible = true;
  }

  placeGhostAsSingle() {
    if (!this.ghost?.visible) return;
    const poses = [{
      x: this.ghost.position.x,
      z: this.ghost.position.z,
      angle: 0,
    }];
    this.renderChairs(poses);
    this.setGhostVisible(false);
    this.emitSnapshot();
  }

  clientToGround(clientX: number, clientY: number): Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const ok = this.raycaster.ray.intersectPlane(this.interactionPlane, this.hit);
    return ok ? this.hit.clone() : null;
  }

  groundToClient(x: number, z: number): { x: number; y: number } | null {
    const v = new Vector3(x, 0, z).project(this.camera);
    if (Math.abs(v.z) > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  beginOrbit(clientX: number, clientY: number) {
    this.interactionEpoch += 1;
    this.orbiting = true;
    this.panning = false;
    this.drawing = false;
    this.draggingHandle = null;
    this.lastPointer.set(clientX, clientY);
  }

  orbit(clientX: number, clientY: number) {
    if (!this.orbiting) return;
    const dx = clientX - this.lastPointer.x;
    const dy = clientY - this.lastPointer.y;
    this.lastPointer.set(clientX, clientY);
    this.spherical.theta -= dx * 0.005;
    // Match OrbitControls: drag down decreases phi (more top-down).
    this.spherical.phi = Math.min(
      Math.max(this.spherical.phi - dy * 0.004, Math.PI * 0.22),
      Math.PI * 0.48,
    );
    this.updateCamera();
    this.updateTagPosition();
  }

  endOrbit() {
    this.orbiting = false;
  }

  isOrbiting() {
    return this.orbiting;
  }

  getOrbitRadius() {
    return this.spherical.radius;
  }

  setOrbitRadius(radius: number) {
    this.interactionEpoch += 1;
    this.spherical.radius = Math.min(ORBIT_RADIUS_MAX, Math.max(ORBIT_RADIUS_MIN, radius));
    this.updateCamera();
    this.updateTagPosition();
  }

  /** Multiply orbit radius (e.g. wheel / pinch). Values > 1 zoom out. */
  dolly(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.setOrbitRadius(this.spherical.radius * factor);
  }

  /** Screen-space pan of the orbit target (Shift/Ctrl-drag or right-drag). */
  beginPan(clientX: number, clientY: number) {
    this.interactionEpoch += 1;
    this.panning = true;
    this.orbiting = false;
    this.drawing = false;
    this.draggingHandle = null;
    this.lastPointer.set(clientX, clientY);
  }

  pan(clientX: number, clientY: number) {
    if (!this.panning) return;
    const dx = clientX - this.lastPointer.x;
    const dy = clientY - this.lastPointer.y;
    this.lastPointer.set(clientX, clientY);
    this.panByScreenDelta(dx, dy);
  }

  /** Apply a pan from screen-pixel deltas (also used by two-finger drag). */
  panByScreenDelta(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.height <= 0) return;

    // Scale like OrbitControls screen-space panning: drag distance vs view height.
    const fov = (this.camera.fov * Math.PI) / 180;
    const targetDistance = this.spherical.radius * Math.tan(fov * 0.5) * 2;
    const panX = (dx / rect.height) * targetDistance;
    const panY = (dy / rect.height) * targetDistance;

    this.camera.updateMatrixWorld();
    this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.panRight.y = 0;
    if (this.panRight.lengthSq() < 1e-8) return;
    this.panRight.normalize();

    this.panForward.setFromMatrixColumn(this.camera.matrixWorld, 2);
    this.panForward.y = 0;
    if (this.panForward.lengthSq() < 1e-8) return;
    this.panForward.normalize();

    // Drag right → world moves right under the cursor (target goes left).
    this.cameraTarget.addScaledVector(this.panRight, -panX);
    this.cameraTarget.addScaledVector(this.panForward, -panY);
    this.updateCamera();
    this.updateTagPosition();
  }

  endPan() {
    this.panning = false;
  }

  isPanning() {
    return this.panning;
  }

  hasArea() {
    return this.area != null;
  }

  /** World position of a SelectArea handle tip (sphere center), or null. */
  getHandleWorldPosition(key: HandleKey): Vector3 | null {
    if (!this.area || !this.selectGroup.visible) return null;
    const handle = this.handleByKey[key];
    if (!handle) return null;
    const world = new Vector3();
    handle.getWorldPosition(world);
    world.y = HANDLE_SPHERE_HEIGHT;
    return world;
  }

  getAreaCenter(): Vector3 | null {
    if (!this.area) return null;
    return new Vector3(this.area.x, 0, this.area.z);
  }

  /** World position of a SelectArea-local XZ point (0,0 = center), for plane annotations. */
  getAreaLocalWorldPosition(localX: number, localZ: number): Vector3 | null {
    if (!this.area || !this.selectGroup.visible) return null;
    const cos = Math.cos(this.area.angle);
    const sin = Math.sin(this.area.angle);
    return new Vector3(
      this.area.x + localX * cos + localZ * sin,
      0.05,
      this.area.z - localX * sin + localZ * cos,
    );
  }

  /** Raycast SelectArea lollipops or fill; null when the pointer is on empty ground. */
  pickHandle(clientX: number, clientY: number, options?: { screenSlop?: number }): HandleKey | null {
    if (!this.area || !this.selectGroup.visible) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const handleMeshes: Mesh[] = [];
    for (const group of Object.values(this.handleByKey)) {
      group.traverse((obj) => {
        if (obj instanceof Mesh) handleMeshes.push(obj);
      });
    }
    const handleHits = this.raycaster.intersectObjects(handleMeshes, false);
    const handleKey = handleHits[0]?.object.userData.handleKey;
    if (typeof handleKey === 'string') return handleKey as HandleKey;

    const slop = options?.screenSlop ?? 0;
    if (slop > 0) {
      let best: HandleKey | null = null;
      let bestDist = slop;
      for (const key of Object.keys(this.handleByKey) as HandleKey[]) {
        const world = this.getHandleWorldPosition(key);
        if (!world) continue;
        const projected = world.project(this.camera);
        if (Math.abs(projected.z) > 1) continue;
        const sx = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
        const dist = Math.hypot(sx - clientX, sy - clientY);
        if (dist <= bestDist) {
          bestDist = dist;
          best = key;
        }
      }
      if (best) return best;
    }

    // Dragging the green fill moves the area (same as the center handle) — otherwise
    // the pointer falls through to orbit and the camera nudges while you "drag the area".
    const fillHits = this.raycaster.intersectObject(this.selectMesh, false);
    return fillHits.length > 0 ? 'center' : null;
  }

  beginHandleDrag(key: HandleKey, clientX: number, clientY: number) {
    if (!this.area) return false;
    const point = this.clientToGround(clientX, clientY);
    if (!point) return false;
    this.interactionEpoch += 1;
    this.draggingHandle = key;
    this.orbiting = false;
    this.panning = false;
    this.drawing = false;
    this.handleAreaStart = { ...this.area };
    this.handleDragOrigin.copy(point);
    this.lastPointer.set(clientX, clientY);
    return true;
  }

  updateHandleDrag(clientX: number, clientY: number, options?: { snap?: boolean }) {
    if (!this.draggingHandle || !this.handleAreaStart) return;
    const point = this.clientToGround(clientX, clientY);
    if (!point) return;
    const start = this.handleAreaStart;

    if (this.draggingHandle === 'center') {
      this.setArea({
        ...start,
        x: start.x + (point.x - this.handleDragOrigin.x),
        z: start.z + (point.z - this.handleDragOrigin.z),
      });
      return;
    }

    if (this.draggingHandle === 'rotate') {
      // Space Builder SelectArea: atan2(dx, dz) - π so the rest pose (handle on −Z) is 0.
      let angle = Math.atan2(point.x - start.x, point.z - start.z) - Math.PI;
      if (options?.snap) {
        const step = Math.PI / 8;
        angle = Math.round(angle / step) * step;
      }
      this.setArea({ ...start, angle });
      return;
    }

    const local = this.worldToLocal(point.x, point.z, start);
    let minX = -start.width / 2;
    let maxX = start.width / 2;
    let minZ = -start.depth / 2;
    let maxZ = start.depth / 2;

    switch (this.draggingHandle) {
      case 'topLeft':
        minX = local.x;
        minZ = local.z;
        break;
      case 'top':
        minZ = local.z;
        break;
      case 'topRight':
        maxX = local.x;
        minZ = local.z;
        break;
      case 'right':
        maxX = local.x;
        break;
      case 'bottomRight':
        maxX = local.x;
        maxZ = local.z;
        break;
      case 'bottom':
        maxZ = local.z;
        break;
      case 'bottomLeft':
        minX = local.x;
        maxZ = local.z;
        break;
      case 'left':
        minX = local.x;
        break;
      default:
        break;
    }

    if (maxX - minX < 0.2) {
      if (this.draggingHandle === 'left' || this.draggingHandle === 'topLeft' || this.draggingHandle === 'bottomLeft') {
        minX = maxX - 0.2;
      } else {
        maxX = minX + 0.2;
      }
    }
    if (maxZ - minZ < 0.2) {
      if (this.draggingHandle === 'top' || this.draggingHandle === 'topLeft' || this.draggingHandle === 'topRight') {
        minZ = maxZ - 0.2;
      } else {
        maxZ = minZ + 0.2;
      }
    }

    const center = this.localToWorld((minX + maxX) / 2, (minZ + maxZ) / 2, start);
    this.setArea({
      x: center.x,
      z: center.z,
      width: maxX - minX,
      depth: maxZ - minZ,
      angle: start.angle,
    });
  }

  endHandleDrag() {
    if (!this.draggingHandle) return;
    this.draggingHandle = null;
    this.handleAreaStart = null;
  }

  isDraggingHandle() {
    return this.draggingHandle != null;
  }

  beginAreaDraw(clientX: number, clientY: number) {
    const point = this.clientToGround(clientX, clientY);
    if (!point) return false;
    this.interactionEpoch += 1;
    this.drawing = true;
    this.orbiting = false;
    this.panning = false;
    this.draggingHandle = null;
    this.drawStart = point.clone();
    this.setAreaFromCorners(point, point);
    return true;
  }

  updateAreaDraw(clientX: number, clientY: number) {
    if (!this.drawing || !this.drawStart) return;
    const point = this.clientToGround(clientX, clientY);
    if (!point) return;
    this.setAreaFromCorners(this.drawStart, point);
  }

  endAreaDraw() {
    this.drawing = false;
    this.drawStart = null;
  }

  isDrawing() {
    return this.drawing;
  }

  private worldToLocal(wx: number, wz: number, area: AreaRect) {
    const dx = wx - area.x;
    const dz = wz - area.z;
    const c = Math.cos(area.angle);
    const s = Math.sin(area.angle);
    // Inverse of Three.js rotation.y applied by selectGroup.
    return {
      x: c * dx - s * dz,
      z: s * dx + c * dz,
    };
  }

  private localToWorld(lx: number, lz: number, area: AreaRect) {
    const c = Math.cos(area.angle);
    const s = Math.sin(area.angle);
    return {
      x: area.x + c * lx + s * lz,
      z: area.z - s * lx + c * lz,
    };
  }

  dispose() {
    this.disposed = true;
    this.active = false;
    cancelAnimationFrame(this.animationId);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.resizeObserver.disconnect();
    this.textures.forEach((t) => t.dispose());
    if (this.skybox) {
      this.skybox.geometry.dispose();
      const mat = this.skybox.material;
      if (!Array.isArray(mat)) mat.dispose();
      this.scene.remove(this.skybox);
      this.skybox = null;
    }
    this.renderer.dispose();
    this.labelRenderer.domElement.remove();
    this.clearChairs();
  }

  private buildGround() {
    const loader = new TextureLoader();
    // Solid fill first so the first frames aren't a white/empty material flash.
    const grassMat = new MeshStandardMaterial({
      color: 0x3f5234,
      roughness: 0.94,
      metalness: 0,
      side: DoubleSide,
      displacementScale: GRASS_DISPLACEMENT,
      displacementBias: -GRASS_DISPLACEMENT * 0.35,
    });
    const grassGeo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GRASS_SEGMENTS, GRASS_SEGMENTS);
    grassGeo.rotateX(-Math.PI / 2);
    const grass = new Mesh(grassGeo, grassMat);
    grass.position.y = 0;
    this.scene.add(grass);

    // Flat invisible plane for raycasts / chairs — displacement is visual only.
    const flat = new Mesh(
      new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new MeshBasicMaterial({ visible: false }),
    );
    flat.rotation.x = -Math.PI / 2;
    flat.position.y = 0.02;
    this.scene.add(flat);

    const configureMap = (texture: Texture, { srgb = false } = {}) => {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      if (srgb) texture.colorSpace = SRGBColorSpace;
      this.textures.push(texture);
      return texture;
    };

    loader.load('/demos/space-builder/grass/color.webp', (color) => {
      if (this.disposed) {
        color.dispose();
        return;
      }
      grassMat.map = configureMap(color, { srgb: true });
      grassMat.color.set(0xffffff);
      grassMat.needsUpdate = true;
    });

    loader.load('/demos/space-builder/grass/normal.webp', (normal) => {
      if (this.disposed) {
        normal.dispose();
        return;
      }
      grassMat.normalMap = configureMap(normal);
      grassMat.normalScale.set(0.85, 0.85);
      grassMat.needsUpdate = true;
    });

    loader.load('/demos/space-builder/grass/displacement.webp', (displacement) => {
      if (this.disposed) {
        displacement.dispose();
        return;
      }
      grassMat.displacementMap = configureMap(displacement);
      grassMat.needsUpdate = true;
    });
  }

  private makeLollipop(color: number) {
    const material = new MeshBasicMaterial({ color });
    const group = new Group();
    const stemHeight = HANDLE_SPHERE_HEIGHT - HANDLE_SPHERE_RADIUS;
    const stem = new Mesh(
      new CylinderGeometry(HANDLE_STEM_RADIUS, HANDLE_STEM_RADIUS, stemHeight, 6, 1, true),
      material,
    );
    stem.position.y = stemHeight / 2;
    const head = new Mesh(new SphereGeometry(HANDLE_SPHERE_RADIUS, 12, 10), material);
    head.position.y = HANDLE_SPHERE_HEIGHT;
    group.add(stem, head);
    return group;
  }

  private buildSelectArea() {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: 0x89ab22,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.selectMesh = new Mesh(geo, mat);
    this.selectMesh.position.y = 0.12;
    this.selectGroup.add(this.selectMesh);

    // Unit ring (r≈1) — scaled in updateSelectVisual to the Inner Circle radius.
    const guideGeo = new RingGeometry(0.92, 1, 64);
    guideGeo.rotateX(-Math.PI / 2);
    this.innerGuide = new Mesh(
      guideGeo,
      new MeshBasicMaterial({
        color: 0xf4f0ea,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.innerGuide.position.y = 0.14;
    this.innerGuide.visible = false;
    this.selectGroup.add(this.innerGuide);

    const specs: Array<[HandleKey, number]> = [
      ['topLeft', HANDLE_BLUE],
      ['top', HANDLE_BLUE],
      ['topRight', HANDLE_BLUE],
      ['right', HANDLE_BLUE],
      ['bottomRight', HANDLE_BLUE],
      ['bottom', HANDLE_BLUE],
      ['bottomLeft', HANDLE_BLUE],
      ['left', HANDLE_BLUE],
      ['center', HANDLE_PINK],
      ['rotate', HANDLE_GREEN],
    ];
    for (const [key, color] of specs) {
      const handle = this.makeLollipop(color);
      handle.traverse((obj) => {
        obj.userData.handleKey = key;
      });
      this.handleByKey[key] = handle;
      this.handles.add(handle);
    }
    // Never scale this group with the area — that flattened the old plane handles.
    this.selectGroup.add(this.handles);

    this.tagEl = document.createElement('div');
    this.tagEl.className = 'space-builder-tag';
    this.tagObject = new CSS2DObject(this.tagEl);
    // Anchor at the top of the pill so the body hangs below the area edge.
    this.tagObject.center.set(0.5, 0);
    this.tagObject.visible = false;
    this.scene.add(this.tagObject);

    this.selectGroup.visible = false;
    this.scene.add(this.selectGroup);
  }

  private setAreaFromCorners(a: Vector3, b: Vector3) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    this.setArea({
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      width: Math.max(0.2, maxX - minX),
      depth: Math.max(0.2, maxZ - minZ),
      angle: this.area?.angle ?? 0,
    });
  }

  private updateSelectVisual() {
    if (!this.area) return;
    this.selectGroup.position.set(this.area.x, 0, this.area.z);
    this.selectGroup.rotation.y = this.area.angle;
    this.selectMesh.scale.set(this.area.width, 1, this.area.depth);

    const hw = this.area.width / 2;
    const hd = this.area.depth / 2;
    this.handleByKey.center.position.set(0, 0, 0);
    this.handleByKey.rotate.position.set(0, 0, -hd - HANDLE_ROTATE_GAP);
    this.handleByKey.topLeft.position.set(-hw, 0, -hd);
    this.handleByKey.top.position.set(0, 0, -hd);
    this.handleByKey.topRight.position.set(hw, 0, -hd);
    this.handleByKey.right.position.set(hw, 0, 0);
    this.handleByKey.bottomRight.position.set(hw, 0, hd);
    this.handleByKey.bottom.position.set(0, 0, hd);
    this.handleByKey.bottomLeft.position.set(-hw, 0, hd);
    this.handleByKey.left.position.set(-hw, 0, 0);

    const mat = this.selectMesh.material as MeshBasicMaterial;
    const result = layoutChairs(this.area, this.options);
    mat.color.set(result.valid ? 0x89ab22 : 0xf76d65);
    this.updateInnerGuide();
    this.updateTagPosition();
  }

  private clampInnerDiameter() {
    if (!this.area) return;
    if (this.options.style !== 'circle' && this.options.style !== 'semi_circle') return;
    const max = maxInnerDiameter(this.area, this.options);
    if (this.options.innerDiameter > max) {
      this.options.innerDiameter = max;
    }
  }

  private updateInnerGuide() {
    const circleLike = this.options.style === 'circle' || this.options.style === 'semi_circle';
    const radius = Math.max(0, this.options.innerDiameter / 2);
    if (!this.area || !circleLike || radius < 0.05) {
      this.innerGuide.visible = false;
      return;
    }
    this.innerGuide.visible = true;
    this.innerGuide.scale.set(radius, 1, radius);
  }

  private updateTagPosition() {
    if (!this.area) {
      this.tagObject.visible = false;
      return;
    }
    const result = layoutChairs(this.area, this.options);
    this.tagEl.textContent = tagContent(result.seats, this.options);
    this.tagObject.visible = result.seats > 0;

    const cameraAngle = this.spherical.theta;
    const h = this.area.depth;
    const w = this.area.width;
    const relative = cameraAngle - this.area.angle;
    const denomCos = Math.cos(relative);
    const denomSin = Math.sin(relative);
    const r = Math.min(
      Math.abs(denomCos) > 1e-4 ? (h / 2) / Math.abs(denomCos) : Infinity,
      Math.abs(denomSin) > 1e-4 ? (w / 2) / Math.abs(denomSin) : Infinity,
    );
    // Extra pad past the silhouette so the capacity pill clears chairs / handles.
    const offset = Number.isFinite(r) ? r + 0.95 : 1.5;
    this.tagObject.position.set(
      this.area.x + offset * Math.sin(cameraAngle),
      0.05,
      this.area.z + offset * Math.cos(cameraAngle),
    );
  }

  private reflow() {
    if (!this.area) {
      this.clearChairs();
      this.emitSnapshot();
      return;
    }
    this.updateSelectVisual();
    const { poses } = layoutChairs(this.area, this.options);
    this.renderChairs(poses);
    this.emitSnapshot();
  }

  private renderChairs(poses: ReturnType<typeof layoutChairs>['poses']) {
    if (!this.chairGeometry || !this.chairMaterial) return;
    if (!this.chairs || this.chairs.count < poses.length) {
      this.clearChairs();
      this.chairs = new InstancedMesh(
        this.chairGeometry,
        this.chairMaterial,
        Math.max(poses.length, 1),
      );
      this.scene.add(this.chairs);
    }
    this.chairs.count = poses.length;
    for (let i = 0; i < poses.length; i += 1) {
      const pose = poses[i];
      this.dummy.position.set(pose.x, this.chairYOffset, pose.z);
      this.dummy.rotation.set(0, pose.angle, 0);
      this.dummy.scale.setScalar(this.chairScale);
      this.dummy.updateMatrix();
      this.chairs.setMatrixAt(i, this.dummy.matrix);
    }
    this.chairs.instanceMatrix.needsUpdate = true;
  }

  private clearChairs() {
    if (this.chairs) {
      this.scene.remove(this.chairs);
      this.chairs.dispose();
      this.chairs = null;
    }
  }

  private findFirstMesh(root: Object3D): Mesh | null {
    let found: Mesh | null = null;
    root.traverse((obj) => {
      if (!found && (obj as Mesh).isMesh) found = obj as Mesh;
    });
    return found;
  }

  private updateCamera() {
    this.camera.position.setFromSpherical(this.spherical).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
    if (this.skybox) {
      this.skybox.position.copy(this.camera.position);
      const far = this.camera.far * 0.85;
      this.skybox.scale.setScalar(far);
    }
  }

  /** Re-measure the viewport — call after Vue finishes the first layout paint. */
  forceResize() {
    this.resize();
  }

  private resize() {
    // Prefer clientWidth/Height — avoids an extra getBoundingClientRect forced reflow.
    const width = Math.max(1, Math.floor(this.root.clientWidth || 1));
    const height = Math.max(1, Math.floor(this.root.clientHeight || 1));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    // Avoid a blank frame after sidebar open/close resizes the canvas.
    if (this.active && !this.disposed) {
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  private emitSnapshot() {
    this.onSnapshot?.(this.getSnapshot());
  }
}
