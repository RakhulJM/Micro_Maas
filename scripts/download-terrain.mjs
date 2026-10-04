import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const perimeterPath = path.join(root, 'maps', 'perimeter.geojson');
const outputRoot = path.join(root, 'public', 'maps', 'terrain');
const zoom = 14;
const source =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const perimeterData = JSON.parse(await fs.readFile(perimeterPath, 'utf8'));
const feature = perimeterData.features?.[0];
const ring = feature?.geometry?.coordinates?.[0];
const center = feature?.properties?.center;
const radius = Number(feature?.properties?.radius_m);

if (!Array.isArray(ring) || ring.length < 4 || !Array.isArray(center) || !radius) {
  throw new Error('maps/perimeter.geojson is missing the expected 1 km perimeter data.');
}

const [centerLon, centerLat] = center;

const lonRadius = radius / (111320 * Math.cos(centerLat * Math.PI / 180));
const latRadius = radius / 111320;

const sw = [centerLon - lonRadius, centerLat - latRadius];
const ne = [centerLon + lonRadius, centerLat + latRadius];

const lonToX = (lon) => Math.floor(((lon + 180) / 360) * 2 ** zoom);
const latToY = (lat) => {
  const sinLat = Math.sin(lat * Math.PI / 180);
  return Math.floor(
    ((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2) *
    2 ** zoom
  );
};

const minX = lonToX(sw[0]);
const maxX = lonToX(ne[0]);
const minY = latToY(ne[1]);
const maxY = latToY(sw[1]);

await fs.mkdir(outputRoot, { recursive: true });

const downloaded = [];

for (let x = minX; x <= maxX; x += 1) {
  for (let y = minY; y <= maxY; y += 1) {
    const url = source
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Terrain tile failed: ${response.status} ${url}`);
    }

    const outputDir = path.join(outputRoot, String(zoom), String(x));
    const outputPath = path.join(outputDir, String(y) + '.png');

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

    downloaded.push({
      zoom,
      x,
      y,
      path: `/maps/terrain/${zoom}/${x}/${y}.png`
    });

    console.log(`Downloaded terrain ${zoom}/${x}/${y}.png`);
  }
}

await fs.writeFile(
  path.join(outputRoot, 'manifest.json'),
  JSON.stringify(
    {
      name: 'CampusMaaS local terrain',
      source: 'AWS Open Data - Mapzen Terrain Tiles',
      attribution: 'Terrain Tiles © Mapzen / open data sources',
      encoding: 'terrarium',
      center: [centerLon, centerLat],
      radius_m: radius,
      zoom,
      bounds: [sw[0], sw[1], ne[0], ne[1]],
      tiles: downloaded
    },
    null,
    2
  ) + '\n'
);

console.log(
  `Saved ${downloaded.length} terrain tile(s) for the fixed 1 km CampusMaaS perimeter.`
);
