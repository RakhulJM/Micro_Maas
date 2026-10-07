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

    server.middlewares.use('/__campusmaas/save-access-rules', (req, res, next) => {
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

          const timePattern = /^([01]\\d|2[0-3]):[0-5]\\d$/;
          const validModes = new Set(['preferred', 'allow_only_during']);
          const validDirections = new Set(['in_out', 'in', 'out']);

          if (
            payload?.version !== 1 ||
            payload?.timezone !== 'Asia/Kolkata' ||
            !Array.isArray(payload?.policies)
          ) {
            throw new Error('Invalid access rules root.');
          }

          const validPolicies = payload.policies.every((policy) => {
            const target = policy?.target;

            if (
              !policy?.id ||
              target?.type !== 'gate' ||
              !target?.id ||
              policy.group !== 'students' ||
              !validModes.has(policy.mode) ||
              !validDirections.has(policy.direction)
            ) {
              return false;
            }

            if (policy.mode === 'preferred') {
              return Number.isInteger(policy.priority) &&
                policy.priority >= 0 &&
                policy.priority <= 100;
            }

            if (policy.mode === 'allow_only_during') {
              return Array.isArray(policy.windows) &&
                policy.windows.length >= 1 &&
                policy.windows.every((window) => {
                  if (
                    !timePattern.test(String(window?.start || '')) ||
                    !timePattern.test(String(window?.end || ''))
                  ) {
                    return false;
                  }

                  const [startHour, startMinute] = window.start.split(':').map(Number);
                  const [endHour, endMinute] = window.end.split(':').map(Number);
                  const start = startHour * 60 + startMinute;
                  const end = endHour * 60 + endMinute;

                  return start < end;
                });
            }

            return false;
          });

          if (!validPolicies) {
            throw new Error('Invalid student gate rule.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'campus_access_rules.json');
          const publicPath = path.join(root, 'public', 'maps', 'campus_access_rules.json');
          const output = JSON.stringify(payload, null, 2) + '\\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, policies: payload.policies.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Access rules save failed'
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

          const validPathCategories = new Set([
            'Main Road',
            'Road',
            'Ground',
            'Pedestrian Path'
          ]);

          const validRoot =
            payload?.type === 'FeatureCollection' &&
            Array.isArray(payload?.features) &&
            Object.keys(payload).every((key) =>
              key === 'type' || key === 'features'
            );

          const validFeatures = payload.features.every((feature) => {
            const featureKeys = Object.keys(feature || {});
            const propertyKeys = Object.keys(feature?.properties || {});

            return (
              feature?.type === 'Feature' &&
              featureKeys.every((key) =>
                key === 'type' || key === 'properties' || key === 'geometry'
              ) &&
              featureKeys.length === 3 &&
              propertyKeys.length === 1 &&
              propertyKeys[0] === 'category' &&
              validPathCategories.has(feature.properties.category) &&
              feature?.geometry?.type === 'LineString' &&
              Array.isArray(feature.geometry.coordinates) &&
              feature.geometry.coordinates.length >= 2 &&
              feature.geometry.coordinates.every((coordinate) =>
                Array.isArray(coordinate) &&
                coordinate.length >= 2 &&
                Number.isFinite(Number(coordinate[0])) &&
                Number.isFinite(Number(coordinate[1]))
              )
            );
          });

          if (!validRoot || !validFeatures) {
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
