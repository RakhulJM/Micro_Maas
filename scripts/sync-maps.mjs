import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapsDir = path.join(root, 'maps');
const publicMapsDir = path.join(root, 'public', 'maps');

fs.mkdirSync(publicMapsDir, { recursive: true });

const files = fs.readdirSync(mapsDir)
  .filter((name) => /\.(geojson|json)$/i.test(name))
  .sort((a, b) => a.localeCompare(b));

for (const name of files) {
  fs.copyFileSync(
    path.join(mapsDir, name),
    path.join(publicMapsDir, name)
  );
}

const manifest = {
  files,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(publicMapsDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

console.log(`Synced ${files.length} map file(s): ${files.join(', ')}`);
