import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
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
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  DEFAULT_LAYOUT_OPTIONS,
  layoutChairs,
  maxInnerDiameter,
  tagContent,
  type AreaRect,
  type ChairPose,
  type LayoutOptions,
  type LayoutStyle,
} from './layoutEngine';
import { createDemoSkybox } from './demoSkybox';

/** The part of a catalog variant the scene needs to draw it. */
export type CatalogGhostVariant = {
  id: string;
  modelUrl?: string;
  tint?: (string | null)[];
};

/** Repaint a loaded model's materials, slot by slot, in the GLB's own material order. */
function applyTint(root: Object3D, tint: (string | null)[]) {
  let slot = 0;
  root.traverse((obj) => {
    if (!(obj as Mesh).isMesh) return;
    for (const material of [(obj as Mesh).material].flat()) {
      const hex = tint[slot];
      slot += 1;
      if (hex) (material as MeshStandardMaterial).color.set(hex);
    }
  });
}

/**
 * The banquet sets ship Draco-compressed, which is what keeps a dressed table with eight
 * chairs under half a megabyte. The decoder only fetches its wasm once a Draco mesh
 * actually turns up, so the chair, which is not compressed, never pays for it.
 */
let dracoLoader: DRACOLoader | null = null;

function makeGltfLoader() {
  dracoLoader ??= new DRACOLoader().setDecoderPath('/demos/space-builder/draco/');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

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
  /** Called with true when the WebGL context is lost and false when the browser restores it. */
  onContextLost?: (lost: boolean) => void;
};

const DEFAULT_OPTIONS: LayoutOptions = {
  ...DEFAULT_LAYOUT_OPTIONS,
  blocks: { ...DEFAULT_LAYOUT_OPTIONS.blocks },
};

const ORBIT_RADIUS_MIN = 6;
const ORBIT_RADIUS_MAX = 42;
// Phi is measured from the +Y axis — near 0 looks straight down, PI/2 is eye-level.
const ORBIT_PHI_MIN = Math.PI * 0.04;
const ORBIT_PHI_MAX = Math.PI * 0.48;

export class SpaceBuilderScene {
  renderer: WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly interactionPlane = new Plane(new Vector3(0, 1, 0), 0);

  private readonly canvas: HTMLCanvasElement;
  private readonly root: HTMLElement;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly hit = new Vector3();
  private readonly dummy = new Object3D();
  private readonly spherical = new Spherical(18, Math.PI * 0.38, Math.PI * 0.28);
  private readonly cameraTarget = new Vector3(0, 0, 0);

  private animationId = 0;
  private active = true;
  private disposed = false;
  /** True after {@link releaseGpu} — renderer is dead until {@link attachGpu}. */
  private gpuReleased = false;
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
  /** Local-space offset between the click point and the handle's own position at drag start —
   * subtracted every move so resizing tracks the cursor instead of snapping the edge to it. */
  private handleDragOffset = { x: 0, z: 0 };
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
  private tagMetrics: { theta: number; r: number; offset: number } | null = null;
  private tagSuppressed = false;
  private chairs: InstancedMesh | null = null;
  /** Individually drag-placed chairs (Add tool, no area) — accumulate, don't replace. */
  private singlePoses: ChairPose[] = [];
  private chairGeometry: BufferGeometry | null = null;
  private chairMaterial: Material | Material[] | null = null;
  /** The GLB's own colours, so a finish can be swapped for another or cleared. */
  private chairBaseColors: Color[] = [];
  private chairScale = 1;
  private chairYOffset = 0;
  private chairReady: Promise<void> | null = null;
  private ghost: Mesh | null = null;
  /** Non-chair catalog id currently selected in the Add tool ('chair' uses {@link ghost} instead). */
  private activeCatalogId = 'chair';
  /** Hidden, pre-scaled Object3D per real non-chair catalog id — cloned on each placement. */
  private extraTemplates = new Map<string, Object3D>();
  private extraLoading = new Map<string, Promise<void>>();
  /** Clone of the active extra template, positioned like {@link ghost} while placing. */
  private extraGhost: Object3D | null = null;
  /** Individually placed non-chair objects — cleared with the rest of the scene on reset/Clear. */
  private placedExtras: Object3D[] = [];
  /** Space Builder's SelectionHighlight for the object a Single placement just selected. */
  private selectionHighlight: Mesh | null = null;
  private selected: { kind: 'chair' | 'extra'; index: number } | null = null;
  private textures: Texture[] = [];
  private skybox: Mesh | null = null;
  private onSnapshot?: (snapshot: SceneSnapshot) => void;
  private onContextLost?: (lost: boolean) => void;
  private readonly handleContextLost = (event: Event) => {
    // Default-prevented so the browser may restore the context; three re-creates its GL state then.
    event.preventDefault();
    this.onContextLost?.(true);
  };
  private readonly handleContextRestored = () => {
    this.onContextLost?.(false);
  };
  private resizeObserver: ResizeObserver;
  /** The canvas rect, read once and kept until a resize, a scroll or a new gesture; reading it
   * every pointer frame forced a layout each time. */
  private canvasRectCache: DOMRect | null = null;
  private readonly dropCanvasRect = () => {
    this.canvasRectCache = null;
  };

  constructor({ canvas, labelHost, onSnapshot, onContextLost }: SpaceBuilderSceneOptions) {
    this.canvas = canvas;
    this.root = canvas.parentElement ?? labelHost;
    this.onSnapshot = onSnapshot;
    this.onContextLost = onContextLost;
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.renderer = this.createRenderer();

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

    this.scene.add(new AmbientLight(0xdde7ff, 0.24));
    this.scene.add(new HemisphereLight(0x9eb7e0, 0x3f4a2e, 0.42));

    const sun = new DirectionalLight(0xfff2d8, 2.4);
    sun.position.copy(sunDir).multiplyScalar(24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0018;
    sun.shadow.normalBias = 0.02;
    const shadowSpan = GROUND_SIZE / 2 + 2;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 64;
    this.scene.add(sun);

    // Cool, unshadowed fill from the opposite side — keeps shadow-side surfaces
    // (chair backs, area edges) from going flat black under the single key light.
    const fill = new DirectionalLight(0xcfe0ff, 0.55);
    fill.position.set(-sunDir.x, sunDir.y * 0.6, -sunDir.z).multiplyScalar(20);
    this.scene.add(fill);

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
    window.addEventListener('scroll', this.dropCanvasRect, { capture: true, passive: true });
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
    if (this.disposed || this.gpuReleased) return;
    this.active = true;
  }

  isActive() {
    return this.active && !this.disposed && !this.gpuReleased;
  }

  /**
   * Free the WebGL context while this carousel page is off-screen.
   * Scene graph / textures stay; {@link attachGpu} rebuilds the renderer on the same canvas.
   */
  releaseGpu() {
    if (this.disposed || this.gpuReleased) return;
    this.active = false;
    this.gpuReleased = true;
    // dispose() only — forceContextLoss() leaves the canvas unable to get a new context.
    this.renderer.dispose();
    this.resetUnpackState();
  }

  /** Recreate the WebGL renderer after {@link releaseGpu}. */
  attachGpu() {
    if (this.disposed || !this.gpuReleased) return;
    this.resetUnpackState();
    this.renderer = this.createRenderer();
    this.gpuReleased = false;
    this.resize();
  }

  /**
   * The old renderer's last texture upload can leave UNPACK_FLIP_Y/PREMULTIPLY_ALPHA true on
   * the context it shares with the next one; Three's WebGLState reset clears them too late.
   */
  private resetUnpackState() {
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private createRenderer() {
    const renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x6e8fc4, 1);
    // Cap DPR — full retina + antialias made first WebGL frames noticeably late.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    // Filmic response so the sunlit grass highlight rolls off instead of clipping flat.
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    return renderer;
  }

  async loadChair(url = '/demos/space-builder/chair.glb') {
    if (this.chairReady) return this.chairReady;
    this.chairReady = this.loadChairInternal(url);
    return this.chairReady;
  }

  whenChairReady() {
    return this.chairReady ?? Promise.resolve();
  }

  /** Resolves once {@link activateCatalogItem}'s ghost for `id` exists, so a caller can wait out its GLB. */
  async whenCatalogItemReady(id: string) {
    if (id === 'chair') {
      await this.whenChairReady();
      return;
    }
    await (this.extraLoading.get(id) ?? Promise.resolve());
  }

  /**
   * Switch the Add tool's ghost to a non-chair real catalog item (or back to
   * the chair). Loads its GLB the first time it's selected.
   */
  activateCatalogItem(id: string, variant?: CatalogGhostVariant) {
    this.canvasRectCache = null;
    this.activeCatalogId = variant?.id ?? id;
    if (this.extraGhost) {
      this.scene.remove(this.extraGhost);
      this.extraGhost = null;
    }
    if (id === 'chair') {
      this.activeCatalogId = 'chair';
      this.setChairTint(variant?.tint);
      return;
    }
    if (variant?.modelUrl) this.ensureExtraLoaded(this.activeCatalogId, variant);
    this.applyActiveGhostTemplate();
  }

  /**
   * Recolour the chair in place. Space Builder's library keeps every finish as its own
   * object; the demo ships one GLB whose frame and seat are flat colours, so a finish is
   * a base colour per material slot.
   */
  private setChairTint(tint?: (string | null)[]) {
    const materials = [this.chairMaterial].flat().filter(Boolean) as MeshStandardMaterial[];
    materials.forEach((material, slot) => {
      const base = this.chairBaseColors[slot];
      if (!base) return;
      const hex = tint?.[slot];
      material.color.copy(base);
      if (hex) material.color.set(hex);
    });
  }

  private ensureExtraLoaded(id: string, variant: CatalogGhostVariant) {
    if (this.extraTemplates.has(id) || this.extraLoading.has(id)) return;
    this.extraLoading.set(
      id,
      this.loadExtraInternal(id, variant).catch((error) => {
        console.debug('Space Builder extra prop failed to load', id, error);
      }),
    );
  }

  private async loadExtraInternal(id: string, variant: CatalogGhostVariant) {
    const url = variant.modelUrl!;
    // Library GLBs share one export pipeline's arbitrary unit — wait for the
    // primary chair's own raw-height measurement so every extra converts to
    // real meters by the same factor, instead of guessing per model.
    await this.whenChairReady();
    const loader = makeGltfLoader();
    if (MeshoptDecoder.ready) {
      await MeshoptDecoder.ready;
    }
    const gltf = await loader.loadAsync(url);
    if (this.disposed) return;
    const root = gltf.scene;
    if (variant.tint) applyTint(root, variant.tint);
    root.updateMatrixWorld(true);

    const box = new Box3().setFromObject(root);
    const scale = this.chairScale;
    const center = box.getCenter(new Vector3());
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        const mesh = obj as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    const pivot = new Group();
    pivot.add(root);
    this.extraTemplates.set(id, pivot);
    if (this.activeCatalogId === id) this.applyActiveGhostTemplate();
  }

  private applyActiveGhostTemplate() {
    if (this.activeCatalogId === 'chair') return;
    const template = this.extraTemplates.get(this.activeCatalogId);
    if (!template) return;
    this.extraGhost = template.clone(true);
    this.extraGhost.visible = false;
    this.scene.add(this.extraGhost);
  }

  private clearExtras() {
    for (const object of this.placedExtras) this.scene.remove(object);
    this.placedExtras = [];
  }

  private async loadChairInternal(url: string) {
    const { geometry, material } = await this.loadModelAsMergedMesh(url);
    if (this.disposed) return;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const height = box.max.y - box.min.y;
    this.chairScale = CHAIR_TARGET_HEIGHT / height;
    this.chairYOffset = -box.min.y * this.chairScale;

    this.chairGeometry = geometry;
    this.chairMaterial = material;
    this.chairBaseColors = [material].flat().map(
      (slot) => (slot as MeshStandardMaterial).color.clone(),
    );

    this.ghost = new Mesh(this.chairGeometry, this.chairMaterial);
    this.ghost.scale.setScalar(this.chairScale);
    this.ghost.position.y = this.chairYOffset;
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // The area/options set before the (async) chair GLB resolved rendered zero
    // chairs — reflow now so seats appear without needing a follow-up interaction.
    this.reflow();
  }

  /**
   * Load a GLB and flatten every primitive (glTF splits one mesh into a
   * primitive per material) into a single BufferGeometry with per-primitive
   * groups, so the result works as one InstancedMesh/Mesh draw call — even
   * when the source model has more than one material (e.g. a chair frame +
   * cushion). World transforms are baked in so nested nodes merge correctly.
   */
  private async loadModelAsMergedMesh(url: string): Promise<{ geometry: BufferGeometry; material: Material | Material[] }> {
    const loader = makeGltfLoader();
    if (MeshoptDecoder.ready) {
      await MeshoptDecoder.ready;
    }
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    root.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;
      const geom = mesh.geometry.clone();
      geom.applyMatrix4(mesh.matrixWorld);
      // Keep only the attributes every primitive shares — extras like vertex
      // tangents/colour aren't needed for MeshStandardMaterial and would make
      // mergeGeometries reject a set that isn't identical across primitives.
      for (const name of Object.keys(geom.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) geom.deleteAttribute(name);
      }
      if (!geom.getAttribute('uv')) {
        geom.setAttribute('uv', new BufferAttribute(new Float32Array(geom.attributes.position.count * 2), 2));
      }
      geometries.push(geom);
      materials.push(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    });
    if (!geometries.length) throw new Error(`Model has no mesh: ${url}`);

    const geometry = geometries.length > 1 ? mergeGeometries(geometries, true) : geometries[0];
    if (!geometry) throw new Error(`Failed to merge model geometry: ${url}`);

    return { geometry, material: materials.length > 1 ? materials : materials[0] };
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
    this.singlePoses = [];
    this.clearChairs();
    this.clearExtras();
    this.clearSelection();
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

  /** Hide the corner/edge/move/rotate lollipops without hiding the tinted fill plane. */
  setHandlesVisible(visible: boolean) {
    this.handles.visible = visible;
  }

  /** Hide the capacity tag regardless of seat count — for pages with no chairs loaded. */
  setTagSuppressed(suppressed: boolean) {
    this.tagSuppressed = suppressed;
    this.updateTagPosition();
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

  private activeGhost(): Object3D | null {
    return this.activeCatalogId === 'chair' ? this.ghost : this.extraGhost;
  }

  setGhostVisible(visible: boolean) {
    const ghost = this.activeGhost();
    if (ghost) ghost.visible = visible;
  }

  setGhostAt(clientX: number, clientY: number) {
    const ghost = this.activeGhost();
    if (!ghost) return;
    const point = this.clientToGround(clientX, clientY);
    if (!point) return;
    ghost.position.x = point.x;
    ghost.position.z = point.z;
    if (this.activeCatalogId === 'chair') ghost.position.y = this.chairYOffset;
    ghost.visible = true;
  }

  /**
   * The product's `Single.end()` adds the object and selects it. Its highlight is a
   * translucent green plane on the floor under the footprint, 10% wider than the object and
   * at least a metre across (`utils/three/SelectionHighlight.js`, GREEN_HIGHTLIGHT_COLOR).
   */
  private showSelection(box: Box3) {
    if (!this.selectionHighlight) {
      const material = new MeshPhongMaterial({
        color: 0x89ab22,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
      });
      this.selectionHighlight = new Mesh(new PlaneGeometry(1, 1), material);
      this.selectionHighlight.rotation.x = -Math.PI / 2;
      this.selectionHighlight.position.y = 0.004;
      this.scene.add(this.selectionHighlight);
    }
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    this.selectionHighlight.scale.set(Math.max(size.x * 1.1, 1), Math.max(size.z * 1.1, 1), 1);
    this.selectionHighlight.position.x = center.x;
    this.selectionHighlight.position.z = center.z;
    this.selectionHighlight.visible = true;
    return { x: center.x, z: center.z };
  }

  /** `Single.start()` dispatches `selection/clear` before the next object rides the pointer. */
  clearSelection() {
    this.selected = null;
    if (this.selectionHighlight) this.selectionHighlight.visible = false;
  }

  hasSelection() {
    return this.selected !== null;
  }

  /** Objects placed one at a time, in placement order: single chairs first, then the rest. */
  placedCount() {
    return this.singlePoses.length + this.placedExtras.length;
  }

  /** Select the n-th placed object, as a click on it would in view mode; returns its ground centre. */
  selectPlaced(index: number) {
    if (index < this.singlePoses.length) {
      const pose = this.singlePoses[index];
      const bounds = this.chairGeometry?.boundingBox;
      if (!bounds) return null;
      const box = bounds.clone();
      box.min.multiplyScalar(this.chairScale);
      box.max.multiplyScalar(this.chairScale);
      box.translate(new Vector3(pose.x, this.chairYOffset, pose.z));
      this.selected = { kind: 'chair', index };
      return this.showSelection(box);
    }
    const extra = this.placedExtras[index - this.singlePoses.length];
    if (!extra) return null;
    this.selected = { kind: 'extra', index: index - this.singlePoses.length };
    return this.showSelection(new Box3().setFromObject(extra));
  }

  /** The product's Remove action: the selected object leaves the layout and the selection clears. */
  removeSelected() {
    const selected = this.selected;
    if (!selected) return false;
    if (selected.kind === 'chair') {
      this.singlePoses.splice(selected.index, 1);
      this.renderChairs(this.composedChairPoses());
    } else {
      const [extra] = this.placedExtras.splice(selected.index, 1);
      if (extra) this.scene.remove(extra);
    }
    this.clearSelection();
    this.emitSnapshot();
    return true;
  }

  /** False when the selected item's GLB is still in flight, so nothing was placed. */
  placeGhostAsSingle(): boolean {
    const ghost = this.activeGhost();
    if (!ghost?.visible) return false;
    ghost.updateMatrixWorld(true);
    const footprint = new Box3().setFromObject(ghost);

    if (this.activeCatalogId === 'chair') {
      this.singlePoses.push({ x: ghost.position.x, z: ghost.position.z, angle: 0 });
      this.renderChairs(this.composedChairPoses());
      this.selected = { kind: 'chair', index: this.singlePoses.length - 1 };
    } else {
      const placed = ghost.clone(true);
      placed.visible = true;
      this.scene.add(placed);
      this.placedExtras.push(placed);
      this.selected = { kind: 'extra', index: this.placedExtras.length - 1 };
    }
    this.setGhostVisible(false);
    this.showSelection(footprint);
    this.emitSnapshot();
    return true;
  }

  private canvasRect() {
    this.canvasRectCache ??= this.renderer.domElement.getBoundingClientRect();
    return this.canvasRectCache;
  }

  clientToGround(clientX: number, clientY: number): Vector3 | null {
    const rect = this.canvasRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const ok = this.raycaster.ray.intersectPlane(this.interactionPlane, this.hit);
    return ok ? this.hit.clone() : null;
  }

  groundToClient(x: number, z: number): { x: number; y: number } | null {
    const v = new Vector3(x, 0, z).project(this.camera);
    if (Math.abs(v.z) > 1) return null;
    const rect = this.canvasRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  beginOrbit(clientX: number, clientY: number) {
    this.canvasRectCache = null;
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
      Math.max(this.spherical.phi - dy * 0.004, ORBIT_PHI_MIN),
      ORBIT_PHI_MAX,
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

  /** Scripted camera step (radians), for an auto-orbit loop rather than pointer drag. */
  orbitBy(deltaTheta: number) {
    this.spherical.theta += deltaTheta;
    this.updateCamera();
    this.updateTagPosition();
  }

  /** Absolute camera angle set (radians) — for initial framing, not pointer drag. */
  setCameraAngles(theta?: number, phi?: number) {
    if (theta !== undefined) this.spherical.theta = theta;
    if (phi !== undefined) {
      this.spherical.phi = Math.min(Math.max(phi, ORBIT_PHI_MIN), ORBIT_PHI_MAX);
    }
    this.updateCamera();
    this.updateTagPosition();
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
    this.canvasRectCache = null;
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
    const rect = this.canvasRect();
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

  /** Camera-relative tag placement math (see {@link updateTagPosition}), or null when not shown. */
  getTagMetrics(): { theta: number; r: number; offset: number } | null {
    return this.tagObject.visible ? this.tagMetrics : null;
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
    const rect = this.canvasRect();
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

    // The fill itself isn't a handle — clicking it falls through to orbit, same as
    // empty ground. Only the pink center lollipop moves the area.
    return null;
  }

  /** Where a resize handle sits in the area's local space (half-extents, ignoring 'center'/'rotate'). */
  private handleLocalPosition(key: HandleKey, width: number, depth: number): { x: number; z: number } {
    const hw = width / 2;
    const hd = depth / 2;
    switch (key) {
      case 'topLeft': return { x: -hw, z: -hd };
      case 'top': return { x: 0, z: -hd };
      case 'topRight': return { x: hw, z: -hd };
      case 'right': return { x: hw, z: 0 };
      case 'bottomRight': return { x: hw, z: hd };
      case 'bottom': return { x: 0, z: hd };
      case 'bottomLeft': return { x: -hw, z: hd };
      case 'left': return { x: -hw, z: 0 };
      default: return { x: 0, z: 0 };
    }
  }

  beginHandleDrag(key: HandleKey, clientX: number, clientY: number) {
    this.canvasRectCache = null;
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

    // Click point rarely lands exactly on the handle — remember the offset so the
    // edge tracks the cursor's movement instead of snapping to it on the first move.
    if (key === 'center' || key === 'rotate') {
      this.handleDragOffset = { x: 0, z: 0 };
    } else {
      const local = this.worldToLocal(point.x, point.z, this.area);
      const handlePos = this.handleLocalPosition(key, this.area.width, this.area.depth);
      this.handleDragOffset = { x: local.x - handlePos.x, z: local.z - handlePos.z };
    }
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
    local.x -= this.handleDragOffset.x;
    local.z -= this.handleDragOffset.z;
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
    this.canvasRectCache = null;
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
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('scroll', this.dropCanvasRect, { capture: true });
    this.textures.forEach((t) => t.dispose());
    if (this.skybox) {
      this.skybox.geometry.dispose();
      const mat = this.skybox.material;
      if (!Array.isArray(mat)) mat.dispose();
      this.scene.remove(this.skybox);
      this.skybox = null;
    }
    if (!this.gpuReleased) {
      this.renderer.dispose();
      this.gpuReleased = true;
    }
    this.labelRenderer.domElement.remove();
    this.clearChairs();
    this.clearExtras();
    if (this.extraGhost) {
      this.scene.remove(this.extraGhost);
      this.extraGhost = null;
    }
    this.extraTemplates.clear();
    if (this.selectionHighlight) {
      this.selectionHighlight.geometry.dispose();
      (this.selectionHighlight.material as MeshPhongMaterial).dispose();
      this.scene.remove(this.selectionHighlight);
      this.selectionHighlight = null;
    }
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
    grass.receiveShadow = true;
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
      texture.anisotropy = this.gpuReleased
        ? 1
        : Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      if (srgb) texture.colorSpace = SRGBColorSpace;
      this.textures.push(texture);
      return texture;
    };

    this.loadGrassMap(loader, '/demos/space-builder/grass/color.webp', (color) => {
      if (this.disposed) {
        color.dispose();
        return;
      }
      grassMat.map = configureMap(color, { srgb: true });
      grassMat.color.set(0xffffff);
      grassMat.needsUpdate = true;
    });

    this.loadGrassMap(loader, '/demos/space-builder/grass/normal.webp', (normal) => {
      if (this.disposed) {
        normal.dispose();
        return;
      }
      grassMat.normalMap = configureMap(normal);
      grassMat.normalScale.set(0.85, 0.85);
      grassMat.needsUpdate = true;
    });

    this.loadGrassMap(loader, '/demos/space-builder/grass/displacement.webp', (displacement) => {
      if (this.disposed) {
        displacement.dispose();
        return;
      }
      grassMat.displacementMap = configureMap(displacement);
      grassMat.needsUpdate = true;
    });
  }

  /** One retry on a failed texture; after that the flat colour the ground was built with stays. */
  private loadGrassMap(loader: TextureLoader, url: string, apply: (texture: Texture) => void, retry = true) {
    loader.load(url, apply, undefined, () => {
      if (this.disposed) return;
      if (retry) this.loadGrassMap(loader, `${url}?retry`, apply, false);
      else console.debug(`Grass texture ${url} failed twice, keeping the flat colour`);
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
    if (!this.area || this.tagSuppressed) {
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
    const pad = 0.95;
    const offset = Number.isFinite(r) ? r + pad : 1.5;
    this.tagMetrics = { theta: cameraAngle, r: Number.isFinite(r) ? r : 0, offset };
    this.tagObject.position.set(
      this.area.x + offset * Math.sin(cameraAngle),
      0.05,
      this.area.z + offset * Math.cos(cameraAngle),
    );
  }

  /** Area-packed poses (if any) plus every individually drag-placed chair. */
  private composedChairPoses(): ChairPose[] {
    if (!this.area) return this.singlePoses;
    const { poses } = layoutChairs(this.area, this.options);
    return this.singlePoses.length ? [...poses, ...this.singlePoses] : poses;
  }

  private reflow() {
    if (this.area) this.updateSelectVisual();
    this.renderChairs(this.composedChairPoses());
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
      this.chairs.castShadow = true;
      this.chairs.receiveShadow = true;
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
    this.canvasRectCache = null;
    if (this.disposed || this.gpuReleased) return;
    // Prefer clientWidth/Height — avoids an extra getBoundingClientRect forced reflow.
    const width = Math.max(1, Math.floor(this.root.clientWidth || 1));
    const height = Math.max(1, Math.floor(this.root.clientHeight || 1));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    // Avoid a blank frame after sidebar open/close resizes the canvas.
    if (this.active) {
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  private emitSnapshot() {
    this.onSnapshot?.(this.getSnapshot());
  }
}
