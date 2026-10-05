import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';

const pedestrianNetworkSavePlugin = () => ({
  name: 'campusmaas-pedestrian-network-save',
  configureServer(server) {
    server.middlewares.use('/__campusmaas/save-gates', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          if (
            payload?.type !== 'FeatureCollection' ||
            payload?.properties?.format !== 'campusmaas-gates' ||
            Number(payload?.properties?.version) < 1 ||
            !Array.isArray(payload?.features)
          ) {
            throw new Error('Invalid gates payload.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'gates.geojson');
          const publicPath = path.join(root, 'public', 'maps', 'gates.geojson');
          const output = JSON.stringify(payload, null, 2) + '\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, features: payload.features.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Gate save failed'
          }));
        }
      });
    });

    server.middlewares.use('/__campusmaas/save-pedestrian-network', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          if (
            payload?.type !== 'FeatureCollection' ||
            payload?.properties?.format !== 'campusmaas-pedestrian-network' ||
            Number(payload?.properties?.version) < 3 ||
            !Array.isArray(payload?.features)
          ) {
            throw new Error('Invalid pedestrian network payload.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'pedestrian_paths_edits.geojson');
          const publicPath = path.join(root, 'public', 'maps', 'pedestrian_paths_edits.geojson');
          const output = JSON.stringify(payload, null, 2) + '\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, features: payload.features.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Save failed'
          }));
        }
      });
    });
  }
});

export default defineConfig({
  output: 'static',
  vite: {
    plugins: [pedestrianNetworkSavePlugin()]
  }
});
