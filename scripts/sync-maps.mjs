import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapsDir = path.join(root, 'maps');
const publicMapsDir = path.join(root, 'public', 'maps');

const supported = /\.(geojson|json|tif|tiff)$/i;
const manifestSupported = /\.(geojson|json)$/i;

fs.rmSync(publicMapsDir, { recursive: true, force: true });
fs.mkdirSync(publicMapsDir, { recursive: true });

const files = [];
const hiddenFromPublic = new Set(['campus_orders.json']);

function collectFiles(directory, relativeDirectory = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeDirectory
      ? path.join(relativeDirectory, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      if (relativePath === 'legacy' || relativePath.startsWith('legacy/')) {
        continue;
      }

      collectFiles(absolutePath, relativePath);
      continue;
    }

    if (supported.test(entry.name)) {
      const normalizedPath = relativePath.replaceAll(path.sep, '/');
      if (!hiddenFromPublic.has(normalizedPath)) {
        files.push(normalizedPath);
      }
    }
  }
}

collectFiles(mapsDir);
files.sort((a, b) => a.localeCompare(b));

for (const relativePath of files) {
  const source = path.join(mapsDir, relativePath);
  const destination = path.join(publicMapsDir, relativePath);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const hiddenFromManifest = new Set();

const manifest = {
  files: files.filter(
    (file) =>
      manifestSupported.test(file) &&
      !hiddenFromManifest.has(file)
  ),
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(publicMapsDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

console.log(`Synced ${files.length} map file(s): ${files.join(', ')}`);
