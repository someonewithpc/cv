/**
 * Prerender a Space Builder catalog GLB to its catalog thumbnail webp.
 * Uses headless Chrome + Three.js (meshopt) so the catalog matches the live model.
 *
 * Usage: npm run generate:catalog-thumb
 *        node scripts/render-catalog-thumb.mjs <site-path.glb> <out.webp>
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modelPath = process.argv[2] ?? '/demos/space-builder/chair.glb';
const outPath = path.resolve(root, process.argv[3] ?? 'public/demos/space-builder/chair-thumb.webp');
const SIZE = 512;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
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
  AmbientLight,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const SIZE = ${SIZE};
const scene = new Scene();
// far is re-set below, once the model's real extent is known: library GLBs are authored
// in centimetres, so the fixed 100-unit far plane clipped anything bigger than a chair.
const camera = new PerspectiveCamera(32, 1, 0.01, 100);
const renderer = new WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
renderer.setClearColor(0xb7bec6, 1);
document.body.appendChild(renderer.domElement);

scene.add(new HemisphereLight(0xf0f4ff, 0x6a7068, 1.05));
scene.add(new AmbientLight(0xffffff, 0.45));
const key = new DirectionalLight(0xffffff, 1.2);
key.position.set(2.4, 4.2, 2.8);
scene.add(key);
const fill = new DirectionalLight(0xdde7ff, 0.55);
fill.position.set(-2.2, 1.6, -1.4);
scene.add(fill);
// Match catalog card gradient midpoint so the thumb sits cleanly on the tile.
scene.background = null;
renderer.setClearColor(0xb7bec6, 1);

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
  const gltf = await loader.loadAsync('${modelPath}');
  const rootObj = gltf.scene;
  scene.add(rootObj);

  const box = new Box3().setFromObject(rootObj);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  rootObj.position.sub(center);

  // Fit the whole model with padding (length*0.55 framed only the chair's seat).
  const fit = Math.max(size.x, size.y, size.z);
  const radius = fit * 2.15;
  const elev = Math.PI / 5.5;
  const azim = Math.PI / 3.4;
  camera.position.set(
    radius * Math.cos(elev) * Math.sin(azim),
    radius * Math.sin(elev) + size.y * 0.05,
    radius * Math.cos(elev) * Math.cos(azim),
  );
  camera.lookAt(0, -size.y * 0.05, 0);
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
