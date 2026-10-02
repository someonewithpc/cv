#!/usr/bin/env node
/**
 * One-shot generator for the MarkerEditor mock map SVG.
 *
 * Fetches OpenStreetMap ways via Overpass (or reads --input) and writes a
 * soft, low-clutter static SVG centered on Tokyo / Kokyo Gaien.
 *
 * Usage:
 *   node scripts/generate-tokyo-map.mjs
 *   node scripts/generate-tokyo-map.mjs --input /tmp/tokyo-map.json
 *   node scripts/generate-tokyo-map.mjs --zoom 15.6 --out path/to/map.svg
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULTS = {
  width: 800,
  height: 800,
  // Park (Kokyo Gaien) sits in the left ~⅓; Marunouchi / Tokyo Station dominate the rest.
  zoom: 16.05,
  centerLat: 35.6785,
  centerLng: 139.7638,
  // Slightly padded bbox around the viewport (degrees)
  padDeg: 0.018,
  out: resolve(ROOT, 'src/components/MarkerEditorDemo/MockMap/map.svg'),
  userAgent: 'HugoSalesCV/1.0 (static map asset generation; personal portfolio)',
};

const MAJOR = new Set(['motorway', 'trunk', 'primary']);
const MEDIUM = new Set(['secondary', 'tertiary']);
const MINOR = new Set(['residential', 'unclassified', 'pedestrian']);

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input' && next) {
      opts.input = resolve(next);
      i++;
    } else if (arg === '--out' && next) {
      opts.out = resolve(next);
      i++;
    } else if (arg === '--zoom' && next) {
      opts.zoom = Number(next);
      i++;
    } else if (arg === '--width' && next) {
      opts.width = Number(next);
      i++;
    } else if (arg === '--height' && next) {
      opts.height = Number(next);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function projectFactory({ width, height, zoom, centerLat, centerLng }) {
  const scale = Math.pow(2, zoom) * 256;
  const centerSin = Math.sin((centerLat * Math.PI) / 180);
  const cx = ((centerLng + 180) / 360) * scale;
  const cy =
    (0.5 - Math.log((1 + centerSin) / (1 - centerSin)) / (4 * Math.PI)) * scale;

  return (lng, lat) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    const worldX = (lng + 180) / 360;
    const worldY = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
    return {
      x: worldX * scale - cx + width / 2,
      y: worldY * scale - cy + height / 2,
    };
  };
}

function geomToPoints(geometry, project, width, height) {
  if (!geometry || geometry.length < 2) return null;
  const pts = geometry.map((g) => project(g.lon, g.lat));
  const margin = 30;
  const anyInside = pts.some(
    (p) => p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin,
  );
  return anyInside ? pts : null;
}

function pathFromPts(pts, close) {
  let d = `M${round(pts[0].x)} ${round(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${round(pts[i].x)} ${round(pts[i].y)}`;
  }
  if (close) d += 'Z';
  return d;
}

function centroid(pts) {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

function layer(paths, close) {
  if (!paths.length) return '';
  return `<path d="${paths.map((p) => pathFromPts(p, close)).join('')}"/>`;
}

function overpassQuery({ centerLat, centerLng, padDeg }) {
  const south = centerLat - padDeg;
  const north = centerLat + padDeg;
  const west = centerLng - padDeg;
  const east = centerLng + padDeg;
  return `[out:json][timeout:90];
(
  way["natural"="water"](${south},${west},${north},${east});
  way["waterway"="riverbank"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian)$"](${south},${west},${north},${east});
);
out geom;`;
}

async function fetchOsm(opts) {
  if (opts.input) {
    console.debug('reading', opts.input);
    return JSON.parse(await readFile(opts.input, 'utf8'));
  }

  const query = overpassQuery(opts);
  console.debug('fetching Overpass…');
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': opts.userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) {
    throw new Error(`Overpass HTTP ${response.status}`);
  }
  return response.json();
}

function buildSvg(data, opts) {
  const { width, height } = opts;
  const project = projectFactory(opts);

  const waters = [];
  const parks = [];
  const roadsMajor = [];
  const roadsMedium = [];
  const roadsMinor = [];
  let kokyoPts = null;

  for (const el of data.elements ?? []) {
    if (el.type !== 'way' || !el.geometry) continue;
    const tags = el.tags || {};
    const pts = geomToPoints(el.geometry, project, width, height);
    if (!pts) continue;

    const nameEn = tags['name:en'] || '';
    if (el.id === 675408602 || /Kokyo Gaien National Garden/i.test(nameEn)) {
      kokyoPts = pts;
    }

    if (tags.natural === 'water' || tags.waterway === 'riverbank') {
      waters.push(pts);
    } else if (tags.leisure === 'park' || tags.leisure === 'garden') {
      parks.push(pts);
    } else if (tags.highway) {
      if (MAJOR.has(tags.highway)) roadsMajor.push(pts);
      else if (MEDIUM.has(tags.highway)) roadsMedium.push(pts);
      else if (MINOR.has(tags.highway)) roadsMinor.push(pts);
    }
  }

  const tokyo = project(139.7638947, 35.6768601);
  const tokyoStation = project(139.76656795, 35.683015983333334);
  const kokyoCentroid = kokyoPts ? centroid(kokyoPts) : null;
  // Keep the park label readable even when the polygon centroid sits near the crop edge.
  const kokyoLabel = kokyoCentroid
    ? { x: Math.min(Math.max(kokyoCentroid.x, 72), width * 0.28), y: kokyoCentroid.y }
    : null;

  // Opaque fills — stacked translucency was reading purple/muddy in the page theme.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
  <!-- Static OSM-derived map around Tokyo Station / Kokyo Gaien. Data © OpenStreetMap contributors (ODbL). -->
  <rect width="${width}" height="${height}" fill="#efebe3"/>
  <g fill="#c3ccb4">${layer(parks, true)}</g>
  ${
    kokyoPts
      ? `<path fill="#b0be9c" d="${pathFromPts(kokyoPts, true)}"/>`
      : ''
  }
  <g fill="#9aada4">${layer(waters, true)}</g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#d2cdc5" stroke-width="0.9" opacity="0.28">${layer(roadsMinor, false)}</g>
    <g stroke="#c6c0b7" stroke-width="1.35" opacity="0.4">${layer(roadsMedium, false)}</g>
    <g stroke="#b5afa5" stroke-width="2.2" opacity="0.48">${layer(roadsMajor, false)}</g>
  </g>
  <g font-family="ui-sans-serif, 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', Meiryo, system-ui, sans-serif" fill="#9a9488" text-anchor="middle">
    ${
      kokyoLabel
        ? `<text x="${round(kokyoLabel.x)}" y="${round(kokyoLabel.y)}" font-size="13" font-weight="500" fill="#a39e92">こうきょがいえん<tspan x="${round(kokyoLabel.x)}" dy="1.15em" font-size="10" font-weight="500" fill="#b0aaa0">Kokyo Gaien</tspan></text>`
        : ''
    }
    <text x="${round(tokyoStation.x)}" y="${round(tokyoStation.y)}" font-size="12" font-weight="500" fill="#a39e92">とうきょうえき<tspan x="${round(tokyoStation.x)}" dy="1.15em" font-size="10" font-weight="500" fill="#b0aaa0">Tokyo Station</tspan></text>
    <text x="${round(tokyo.x)}" y="${round(tokyo.y)}" font-size="17" font-weight="600" letter-spacing="0.12em" fill="#8f897d">とうきょう<tspan x="${round(tokyo.x)}" dy="1.2em" font-size="11" font-weight="500" letter-spacing="0.04em" fill="#a39e92">Tokyo</tspan></text>
  </g>
</svg>
`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/generate-tokyo-map.mjs [--input file.json] [--out map.svg] [--zoom 16.05]`);
    process.exit(0);
  }

  const data = await fetchOsm(opts);
  const svg = buildSvg(data, opts);

  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, svg);
  console.debug(
    `wrote ${opts.out} (${Math.round(Buffer.byteLength(svg) / 1024)}KB, zoom ${opts.zoom}, ${data.elements?.length ?? 0} elements)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
