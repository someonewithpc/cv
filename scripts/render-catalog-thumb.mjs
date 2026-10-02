/**
 * Prerender a Space Builder catalog GLB to its catalog thumbnail webp.
 * Uses headless Chrome + Three.js (meshopt) so the catalog matches the live model.
 *
 * Usage: npm run generate:catalog-thumb
 *        node scripts/render-catalog-thumb.mjs <site-path.glb> <out.webp> [tint-json] ["incl azim"]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modelPath = process.argv[2] ?? '/src/assets/demos/space-builder/chair.glb';
const outPath = path.resolve(root, process.argv[3] ?? 'public/demos/space-builder/chair-thumb.webp');
// Optional per-material base colour, as the catalog variants declare it: a JSON array of
// hex strings (or nulls) in the GLB's material order.
const tint = process.argv[4] ? JSON.parse(process.argv[4]) : null;
// Optional camera angle, "inclination azimuth" in degrees; the catalog's own is 60 60.
const [inclinationDeg, azimuthDeg] = (process.argv[5] ?? '60 60').split(' ').map(Number);
// Space Builder stores catalog thumbnails at 600px square (Upload/Preview.vue renders 300
// and the platform keeps a 2x original).
const SIZE = 600;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

function contentType(filePath) {
  return MIME[path.extname(filePath)] ?? 'application/octet-stream';
}

function chromePath() {
  return process.env.CHROME_PATH || 'google-chrome-stable';
}

function renderHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: transparent; }
    canvas { display: block; width: ${SIZE}px; height: ${SIZE}px; }
  </style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "/node_modules/three/build/three.module.js",
    "three/addons/": "/node_modules/three/examples/jsm/"
  }
}
</script>
<script type="module">
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const SIZE = ${SIZE};
const TINT = ${JSON.stringify(tint)};
// Space Builder's own catalog renderer (utils/three/render/ObjectImageRender.js): a
// 0.8-radian camera at polar 60 degrees and azimuth 60, one bounding-box diagonal and a
// quarter away, looking at the model's centre. far is re-set once that distance is known,
// because library GLBs are authored in centimetres.
const FOV = (0.8 * 180) / Math.PI;
const INCLINATION = (${inclinationDeg} * Math.PI) / 180;
const AZIMUTH = (${azimuthDeg} * Math.PI) / 180;

const scene = new Scene();
const camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
const renderer = new WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
// Transparent, like the product's stored PNGs: the card paints the gradient behind it.
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

// Space Builder renders a catalog thumbnail by pointing a second camera at the live
// editor scene (utils/three/render/ImageRender.js hijacks the running renderer), so the
// card shows the object under the same light as the floor plan. Copy the demo scene's
// rig from SpaceBuilderScene.ts: a warm sun, a cool fill, and filmic tone mapping. With
// neutral white lights instead, the chair's two greys came out flat white on the card
// while the scene showed a light wood frame and a white seat.
const sunDir = new Vector3(0.42, 0.78, 0.28).normalize();
scene.add(new AmbientLight(0xdde7ff, 0.24));
scene.add(new HemisphereLight(0x9eb7e0, 0x3f4a2e, 0.42));
const sun = new DirectionalLight(0xfff2d8, 2.4);
sun.position.copy(sunDir).multiplyScalar(24);
scene.add(sun);
const fill = new DirectionalLight(0xcfe0ff, 0.55);
fill.position.set(-sunDir.x, sunDir.y * 0.6, -sunDir.z).multiplyScalar(20);
scene.add(fill);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
scene.background = null;

async function post(payload) {
  await fetch('/thumb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

try {
  if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/'));
  const gltf = await loader.loadAsync('${modelPath}');
  const rootObj = gltf.scene;
  if (TINT) {
    let slot = 0;
    rootObj.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const material of [obj.material].flat()) {
        const hex = TINT[slot];
        slot += 1;
        if (hex) material.color.set(hex);
      }
    });
  }
  scene.add(rootObj);

  const box = new Box3().setFromObject(rootObj);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  rootObj.position.sub(center);

  const radius = size.length() * 1.25;
  camera.position.set(
    radius * Math.sin(INCLINATION) * Math.cos(AZIMUTH),
    radius * Math.cos(INCLINATION),
    radius * Math.sin(INCLINATION) * Math.sin(AZIMUTH),
  );
  camera.lookAt(0, 0, 0);
  camera.far = radius * 3;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  renderer.render(scene, camera);

  await post({ dataUrl: renderer.domElement.toDataURL('image/webp', 0.92), error: null });
} catch (error) {
  await post({ dataUrl: null, error: String(error?.stack || error) });
}
</script>
</body>
</html>`;
}

async function main() {
  let receiveResolve;
  const receivePromise = new Promise((resolve) => {
    receiveResolve = resolve;
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/render') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHtml());
        return;
      }
      if (url.pathname === '/thumb' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        receiveResolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(204).end();
        return;
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
      // Astro serves `public/` at the site root.
      const candidates = [
        path.join(root, rel),
        path.join(root, 'public', rel),
      ];
      let data = null;
      let filePath = candidates[0];
      for (const candidate of candidates) {
        if (!candidate.startsWith(root)) continue;
        try {
          data = await readFile(candidate);
          filePath = candidate;
          break;
        } catch {
          // try next
        }
      }
      if (!data) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      res.end(data);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  // Its own profile, so rendering a thumbnail never touches (or fails against) the
  // browser the author already has open.
  const profile = await mkdtemp(path.join(os.tmpdir(), 'catalog-thumb-'));
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    `--window-size=${SIZE},${SIZE}`,
    `http://127.0.0.1:${port}/render`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const result = await Promise.race([
    receivePromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`thumb timeout\n${stderr.slice(-800)}`)), 30000);
    }),
  ]);

  chrome.kill('SIGKILL');
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });

  if (result.error) throw new Error(result.error);
  if (!result.dataUrl?.startsWith('data:image/webp;base64,')) {
    throw new Error('Expected webp data URL from renderer');
  }

  const base64 = result.dataUrl.slice('data:image/webp;base64,'.length);
  await writeFile(outPath, Buffer.from(base64, 'base64'));
  console.debug(`Wrote ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
