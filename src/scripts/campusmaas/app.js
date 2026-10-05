    // Keep the developer shortcut available even if map/data loading is delayed.
    window.addEventListener('keydown', (event) => {
      const isDeveloperShortcut =
        event.ctrlKey &&
        event.shiftKey &&
        (event.code === 'KeyU' || event.key?.toLowerCase() === 'u');

      if (!isDeveloperShortcut) return;

      event.preventDefault();
      event.stopPropagation();

      const panel = document.getElementById('devPanel');
      if (!panel) return;

      const open = panel.classList.toggle('is-open');
      panel.setAttribute('aria-hidden', String(!open));
    }, true);

    /*
     * Edit Mode visibility is handled at document level as well as inside the
     * map controller. The developer switch must immediately show/hide both
     * editor tools even if the Leaflet/data initialization is still running.
     */
    const closeDeveloperOverlay = () => {
      const panel = document.getElementById('devPanel');

      if (!panel) return;

      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    };

    const syncEditorToolVisibility = () => {
      const editModeToggle = document.getElementById('editModeToggle');
      const editToggle = document.getElementById('editToggle');
      const gateToggle = document.getElementById('gateToggle');
      const visible = Boolean(editModeToggle?.checked);

      for (const button of [editToggle, gateToggle]) {
        if (!button) continue;

        button.classList.toggle('is-visible', visible);
        button.classList.toggle('is-active', false);
        button.setAttribute('aria-hidden', String(!visible));
        button.setAttribute('aria-pressed', 'false');
        button.disabled = !visible;
        button.tabIndex = visible ? 0 : -1;
        button.style.display = visible ? 'grid' : 'none';
      }
    };

    const editModeCheckbox = document.getElementById('editModeToggle');
    editModeCheckbox?.addEventListener('change', () => {
      syncEditorToolVisibility();
      closeDeveloperOverlay();
    });
    editModeCheckbox?.addEventListener('input', syncEditorToolVisibility);
    editModeCheckbox?.addEventListener('click', () => {
      requestAnimationFrame(() => {
        syncEditorToolVisibility();
        closeDeveloperOverlay();
      });
    });

    syncEditorToolVisibility();

    // Use document-level click handling for modal close controls so their
    // behavior remains reliable above Leaflet's DOM event layers.
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const developerClose = target.closest('#devPanelClose');
      if (developerClose) {
        event.preventDefault();
        event.stopPropagation();

        const panel = document.getElementById('devPanel');
        panel?.classList.remove('is-open');
        panel?.setAttribute('aria-hidden', 'true');
        return;
      }

      const editorClose = target.closest('#editCancel');
      if (editorClose) {
        event.preventDefault();
        event.stopPropagation();

        const closeEditor = window.__campusMaaSCloseEditTools;
        if (typeof closeEditor === 'function') {
          closeEditor();
          return;
        }

        const card = document.getElementById('editCard');
        card?.classList.remove('is-open');
        card?.setAttribute('aria-hidden', 'true');
      }
    }, true);

    import('leaflet').then(async ({ default: L }) => {
      const [campusResponse, perimeterResponse, pathResponse, pathEditResponse, pathConfigResponse, gatesResponse] = await Promise.all([
        fetch('/maps/export.geojson'),
        fetch('/maps/perimeter.geojson'),
        fetch('/maps/pedestrian_paths.geojson'),
        fetch('/maps/pedestrian_paths_edits.geojson', { cache: 'no-store' }),
        fetch('/maps/pedestrian_path_config.json'),
        fetch('/maps/gates.geojson', { cache: 'no-store' })
      ]);

      if (!campusResponse.ok || !perimeterResponse.ok || !pathResponse.ok) {
        throw new Error('Campus map data could not be loaded.');
      }

      const [campusData, perimeterData, pedestrianPathData, gatesData] = await Promise.all([
        campusResponse.json(),
        perimeterResponse.json(),
        pathResponse.json(),
        gatesResponse?.ok ? gatesResponse.json() : Promise.resolve({
          type: 'FeatureCollection',
          properties: {
            format: 'campusmaas-gates',
            version: 1,
            description: 'Campus entry and access gate geometry'
          },
          features: []
        })
      ]);

      const pedestrianConfig = pathConfigResponse.ok
        ? await pathConfigResponse.json()
        : {
            version: 1,
            routing: {
              walking_speed_mps: 1.4,
              snap_tolerance_m: 8
            },
            render: {
              highlight: {
                casing_weight: 7,
                path_weight: 4
              },
              route: {
                casing_weight: 9,
                path_weight: 5
              },
              editor: {
                preview_weight: 4,
                preview_dash: '7 5'
              }
            }
          };

      const committedPathEdits = pathEditResponse.ok
        ? await pathEditResponse.json()
        : null;

      const cloneJson = (value) => JSON.parse(JSON.stringify(value));

      const pathTypeColors = Object.freeze({
        'Main Road': '#e85d04',
        'Road': '#f2b134',
        'Ground': '#4f9d69',
        'Pedestrian Path': '#2563eb'
      });

      const pathTypeValues = Object.freeze(Object.keys(pathTypeColors));

      const normalizePathCategory = (feature) => {
        const current = String(feature?.properties?.category || '').trim();

        if (pathTypeValues.includes(current)) {
          return current;
        }

        const highway = String(feature?.properties?.highway || '').toLowerCase();

        if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(highway)) {
          return 'Main Road';
        }

        if (['residential', 'unclassified', 'service', 'living_street', 'road', 'track'].includes(highway)) {
          return 'Road';
        }

        if (['path', 'footway', 'pedestrian', 'steps', 'custom'].includes(highway)) {
          return 'Pedestrian Path';
        }

        return 'Pedestrian Path';
      };

      const pathTypeColor = (feature) =>
        pathTypeColors[normalizePathCategory(feature)] ||
        pathTypeColors['Pedestrian Path'];

      const basePedestrianFeatures = cloneJson(
        pedestrianPathData.features || []
      );

      const pedestrianGeometryKey = (coordinates) =>
        coordinates
          .map((coordinate) =>
            Number(coordinate[0]).toFixed(7) + ',' +
            Number(coordinate[1]).toFixed(7)
          )
          .join('|');

      const toLocalMeters = (coordinate) => {
        const scaleX =
          111320 * Math.cos(
            Number(center.lat) * Math.PI / 180
          );
        const scaleY = 111320;

        return {
          x: Number(coordinate[0]) * scaleX,
          y: Number(coordinate[1]) * scaleY
        };
      };

      const localSegmentDistance = (first, second) => {
        const a = toLocalMeters(first[0]);
        const b = toLocalMeters(first[1]);
        const c = toLocalMeters(second[0]);
        const d = toLocalMeters(second[1]);

        const pointSegmentDistance = (point, start, end) => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const lengthSquared = dx * dx + dy * dy;

          if (lengthSquared === 0) {
            return Math.hypot(point.x - start.x, point.y - start.y);
          }

          const fraction = Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                lengthSquared
            )
          );

          return Math.hypot(
            point.x - (start.x + fraction * dx),
            point.y - (start.y + fraction * dy)
          );
        };

        return Math.min(
          pointSegmentDistance(a, c, d),
          pointSegmentDistance(b, c, d),
          pointSegmentDistance(c, a, b),
          pointSegmentDistance(d, a, b)
        );
      };

      const localSegmentAngleDifference = (first, second) => {
        const a = toLocalMeters(first[0]);
        const b = toLocalMeters(first[1]);
        const c = toLocalMeters(second[0]);
        const d = toLocalMeters(second[1]);

        const firstAngle = Math.atan2(
          b.y - a.y,
          b.x - a.x
        );
        const secondAngle = Math.atan2(
          d.y - c.y,
          d.x - c.x
        );

        let difference =
          Math.abs((firstAngle - secondAngle) * 180 / Math.PI) % 180;

        if (difference > 90) {
          difference = 180 - difference;
        }

        return difference;
      };

      const basePedestrianSegments = [];

      for (const feature of basePedestrianFeatures) {
        const geometry = feature?.geometry;
        if (!geometry) continue;

        const lines = geometry.type === 'LineString'
          ? [geometry.coordinates]
          : geometry.type === 'MultiLineString'
            ? geometry.coordinates
            : [];

        for (const line of lines) {
          if (!Array.isArray(line) || line.length < 2) continue;

          for (let index = 0; index < line.length - 1; index += 1) {
            const a = line[index];
            const b = line[index + 1];

            if (!Array.isArray(a) || !Array.isArray(b)) continue;

            basePedestrianSegments.push([a, b]);
          }
        }
      }

      const campusFeatureUsesPedestrianGeometry = (feature) => {
        const geometry = feature?.geometry;
        if (!geometry) return false;

        const lines = geometry.type === 'LineString'
          ? [geometry.coordinates]
          : geometry.type === 'MultiLineString'
            ? geometry.coordinates
            : [];

        for (const line of lines) {
          if (!Array.isArray(line) || line.length < 2) continue;

          let matchedLength = 0;

          for (let index = 0; index < line.length - 1; index += 1) {
            const campusSegment = [line[index], line[index + 1]];
            const campusLength =
              L.latLng(
                Number(line[index][1]),
                Number(line[index][0])
              ).distanceTo(
                L.latLng(
                  Number(line[index + 1][1]),
                  Number(line[index + 1][0])
                )
              );

            let matched = false;

            for (const pedestrianSegment of basePedestrianSegments) {
              const distance = localSegmentDistance(
                campusSegment,
                pedestrianSegment
              );

              if (distance > 3) continue;

              /*
               * Ignore simple perpendicular road crossings. A backed road
               * should run along the pedestrian geometry, not merely cross it.
               */
              const angle = localSegmentAngleDifference(
                campusSegment,
                pedestrianSegment
              );

              if (angle <= 30) {
                matched = true;
                break;
              }
            }

            if (matched) {
              matchedLength += campusLength;
            }
          }

          /*
           * A campus road is considered the backing geometry when at least
           * 4 m of its line follows the pedestrian network. This catches
           * differently segmented/split OSM ways while avoiding unrelated
           * roads that only touch the network at an intersection.
           */
          if (matchedLength >= 4) {
            return true;
          }
        }

        return false;
      };

      const normalizePedestrianFeatures = (features) =>
        (Array.isArray(features) ? features : []).map((feature, index) => {
          const normalized = cloneJson(feature);
          normalized.type = 'Feature';
          normalized.id = String(
            normalized.id ??
            normalized.properties?.['@id'] ??
            'pedestrian-' + String(index + 1).padStart(3, '0')
          );
          normalized.properties = {
            category: normalizePathCategory(feature)
          };
          return normalized;
        });

      const isCleanPedestrianEditFile =
        committedPathEdits?.type === 'FeatureCollection' &&
        Array.isArray(committedPathEdits?.features) &&
        Object.keys(committedPathEdits).every((key) =>
          key === 'type' || key === 'features'
        ) &&
        committedPathEdits.features.every((feature) =>
          feature?.type === 'Feature' &&
          feature?.geometry?.type === 'LineString' &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.length >= 2 &&
          feature?.properties &&
          Object.keys(feature.properties).length === 1 &&
          pathTypeValues.includes(feature.properties.category) &&
          Object.keys(feature).every((key) =>
            key === 'type' || key === 'properties' || key === 'geometry'
          )
        );

      const pathEditState = {
        type: 'FeatureCollection',
        features: normalizePedestrianFeatures(
          isCleanPedestrianEditFile
            ? committedPathEdits.features
            : basePedestrianFeatures
        )
      };

      pedestrianPathData.features = pathEditState.features;

      const normalizedGateFeatures =
        Array.isArray(gatesData?.features)
          ? gatesData.features
              .filter((feature) => feature?.geometry?.type === 'Polygon')
              .map((feature, index) => {
                const normalized = cloneJson(feature);
                normalized.type = 'Feature';
                normalized.id = String(
                  normalized.id ??
                  normalized.properties?.['@id'] ??
                  'gate-' + String(index + 1).padStart(3, '0')
                );

                if (!normalized.properties) normalized.properties = {};
                normalized.properties.type = 'gate';
                normalized.properties.name =
                  normalized.properties.name || 'Unnamed Gate';

                return normalized;
              })
          : [];

      const gateFeatureData = {
        type: 'FeatureCollection',
        properties: {
          format: 'campusmaas-gates',
          version: 1,
          description: 'Campus entry and access gate geometry'
        },
        features: normalizedGateFeatures
      };

      let pathEditDirty = false;

      const perimeterFeature = perimeterData.features[0];
      const ring = perimeterFeature.geometry.coordinates[0];
      const center = L.latLng(
        Number(perimeterFeature.properties.center[1]),
        Number(perimeterFeature.properties.center[0])
      );
      const radius = Number(perimeterFeature.properties.radius_m);

      const latRadius = radius / 111320;
      const lonRadius =
        radius / (111320 * Math.cos(center.lat * Math.PI / 180));

      const circleBounds = L.latLngBounds(
        [center.lat - latRadius, center.lng - lonRadius],
        [center.lat + latRadius, center.lng + lonRadius]
      );

      const map = L.map('map', {
        zoomControl: false,
        minZoom: 18,
        maxZoom: 25,
        scrollWheelZoom: true,
        maxBounds: circleBounds,
        maxBoundsViscosity: 1
      }).setView(center, 18);

      /*
       * Keep the live path being drawn above the existing pedestrian network.
       * This prevents the preview line from disappearing behind the map layers.
       */
      const drawingPreviewPane = map.createPane('drawingPreviewPane');
      drawingPreviewPane.style.zIndex = '650';
      drawingPreviewPane.style.pointerEvents = 'none';

      const gatePane = map.createPane('gatePane');
      gatePane.style.zIndex = '640';

      const colors = {
        background: '#f1f3f5',
        land: '#eef0ee',
        building: '#dedbd4',
        buildingEdge: '#bdb8af',
        water: '#b9dce7',
        green: '#d9e6d2',
        park: '#d3e4cc',
        roadCasing: '#c7c5c0',
        road: '#ffffff',
        majorRoad: '#e9c67b',
        footway: '#d1cec7'
      };

      const roadWidth = {
        motorway: 7,
        trunk: 6.5,
        primary: 6,
        secondary: 5.5,
        tertiary: 5,
        residential: 4.4,
        unclassified: 4,
        service: 3.4,
        footway: 2.7,
        path: 2.4
      };

      const isRoad = (feature) =>
        Boolean(feature?.properties?.highway || feature?.properties?.route);

      const roadStyle = (feature, casing = false) => {
        const kind = feature?.properties?.highway;
        const width = roadWidth[kind] || 3.5;
        const major = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(kind);

        return {
          color: casing
            ? colors.roadCasing
            : (major ? colors.majorRoad : colors.road),
          weight: casing ? width + 2.2 : width,
          opacity: 0.96,
          lineCap: 'round',
          lineJoin: 'round'
        };
      };

      const baseLayer = L.geoJSON(campusData, {
        filter: (feature) => !isRoad(feature),
        style: (feature) => {
          const p = feature?.properties || {};

          if (p.natural === 'water' || p.waterway) {
            return {
              color: '#9ac6d3',
              weight: 1,
              fillColor: colors.water,
              fillOpacity: 0.95
            };
          }

          if (p.leisure || p.landuse) {
            return {
              color: '#b7c7b0',
              weight: 0.7,
              fillColor: p.leisure === 'park' ? colors.park : colors.green,
              fillOpacity: 0.9
            };
          }

          if (p.amenity === 'parking') {
            return {
              color: '#c4c1bb',
              weight: 0.7,
              fillColor: '#dfe0dd',
              fillOpacity: 0.9
            };
          }

          if (p.building) {
            return {
              color: colors.buildingEdge,
              weight: 0.7,
              fillColor: colors.building,
              fillOpacity: 1
            };
          }

          return {
            color: '#d1cec8',
            weight: 0.7,
            fillColor: colors.land,
            fillOpacity: 0.85
          };
        }
      });

      const roadCasing = L.geoJSON(campusData, {
        filter: isRoad,
        style: (feature) => roadStyle(feature, true),
        interactive: false
      });

      const roads = L.geoJSON(campusData, {
        filter: isRoad,
        style: (feature) => roadStyle(feature),
        interactive: false
      });

      const setPedestrianBackedRoadVisibility = (hide) => {
        const applyVisibility = (layer, casing) => {
          layer.eachLayer((child) => {
            const feature = child?.feature;
            if (!child?.setStyle || feature?.geometry?.type !== 'LineString') {
              return;
            }

            if (campusFeatureUsesPedestrianGeometry(feature)) {
              child.setStyle({
                opacity: hide ? 0 : 0.96
              });
              return;
            }

            child.setStyle({
              ...roadStyle(feature, casing),
              opacity: 0.96
            });
          });
        };

        applyVisibility(roadCasing, true);
        applyVisibility(roads, false);
      };

      baseLayer.addTo(map);
      roadCasing.addTo(map);
      roads.addTo(map);

      let pedestrianPathCasing = null;
      let pedestrianPaths = null;
      let gateLayer = null;
      let editableHitLayer = null;
      let pedestrianPathsActive = false;

      // Declared before the gate layer is created during map initialization.
      let editModeEnabled = false;

      const highlightCasingWeight =
        Number(pedestrianConfig.render?.highlight?.casing_weight) || 7;
      const highlightPathWeight =
        Number(pedestrianConfig.render?.highlight?.path_weight) || 4;
      const routeCasingWeight =
        Number(pedestrianConfig.render?.route?.casing_weight) || 9;
      const routePathWeight =
        Number(pedestrianConfig.render?.route?.path_weight) || 5;
      const editorPreviewWeight =
        Number(pedestrianConfig.render?.editor?.preview_weight) || 4;
      const editorPreviewDash =
        pedestrianConfig.render?.editor?.preview_dash || '7 5';

      /*
       * The complete editable pedestrian network is the normal white
       * pedestrian layer. The blue layer is only an active highlight.
       */
      const basePedestrianCasingWeight =
        Math.max(3.5, roadWidth.footway + 0.8);

      const walkingSpeedMetersPerSecond =
        Number(pedestrianConfig.routing?.walking_speed_mps) || 1.4;
      const snapToleranceMeters =
        Number(pedestrianConfig.routing?.snap_tolerance_m) || 8;

      const createPedestrianLayers = () => {
        pedestrianPathCasing = L.geoJSON(pedestrianPathData, {
          style: {
            color: '#ffffff',
            weight: basePedestrianCasingWeight,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
          },
          interactive: false
        });

        pedestrianPaths = L.geoJSON(pedestrianPathData, {
          style: (feature) => ({
            color: pathTypeColor(feature),
            weight: highlightPathWeight,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round'
          }),
          interactive: false
        });


      };

      const refreshPedestrianLayers = () => {
        if (pedestrianPathCasing && map.hasLayer(pedestrianPathCasing)) {
          map.removeLayer(pedestrianPathCasing);
        }

        if (pedestrianPaths && map.hasLayer(pedestrianPaths)) {
          map.removeLayer(pedestrianPaths);
        }

        createPedestrianLayers();

        /*
         * Keep the complete saved working network visible in white.
         * The blue layer is added only when the network is actively
         * highlighted for routing/editing.
         */
        pedestrianPathCasing.addTo(map);

        if (pedestrianPathsActive) {
          pedestrianPaths.addTo(map);
        }

      };

      createPedestrianLayers();

      /*
       * The final working pedestrian network is always visible as the
       * normal white map network, including manually added paths loaded
       * from pedestrian_paths_edits.geojson.
       */
      pedestrianPathCasing.addTo(map);

      const gateFeatureRing = (feature) =>
        feature?.geometry?.type === 'Polygon' &&
        Array.isArray(feature.geometry.coordinates?.[0])
          ? feature.geometry.coordinates[0]
          : null;

      const gateBoundsForFeature = (feature) => {
        const ring = gateFeatureRing(feature);
        if (!ring || ring.length < 4) return null;

        const latlngs = ring.map(([lng, lat]) => [
          Number(lat),
          Number(lng)
        ]);

        return L.latLngBounds(latlngs);
      };

      const createGateLayer = () => {
        gateLayer = L.geoJSON(gateFeatureData, {
          pane: 'gatePane',
          style: {
            color: '#475569',
            weight: 2,
            opacity: 0.95,
            fillColor: '#ffffff',
            fillOpacity: 0.18
          },
          interactive: true,
          onEachFeature: (feature, layer) => {
            layer.on('click', (event) => {
              if (!editModeEnabled || gateModeActive) return;

              event.originalEvent?.stopPropagation();
              event.originalEvent?.preventDefault();
              selectGateForEdit(feature);
            });
          }
        });
      };

      const refreshGateLayer = () => {
        if (gateLayer && map.hasLayer(gateLayer)) {
          map.removeLayer(gateLayer);
        }

        createGateLayer();
        gateLayer?.addTo(map);
      };

      createGateLayer();
      gateLayer.addTo(map);

      let basePedestrianDebugLayer = null;

      const createBasePedestrianDebugLayer = () => {
        if (basePedestrianDebugLayer) {
          map.removeLayer(basePedestrianDebugLayer);
        }

        basePedestrianDebugLayer = L.geoJSON({
          type: 'FeatureCollection',
          features: cloneJson(basePedestrianFeatures)
        }, {
          style: {
            color: '#64748b',
            weight: 2,
            opacity: 0.7,
            dashArray: '5 6',
            lineCap: 'round',
            lineJoin: 'round'
          },
          interactive: false
        });
      };

      createBasePedestrianDebugLayer();

      /*
       * Lightweight pedestrian-network routing for the first prototype.
       * Clicks are snapped to the nearest pedestrian segment and Dijkstra
       * finds the shortest connected walking route.
       */
      let pedestrianSegments = [];
      let pedestrianGraph = new Map();
      let coordinateByKey = new Map();
      let gateRoutingNodes = new Map();

      const graphKey = (coordinate) =>
        Number(coordinate[0]).toFixed(7) + ',' +
        Number(coordinate[1]).toFixed(7);

      const distanceBetween = (a, b) =>
        L.latLng(Number(a[1]), Number(a[0]))
          .distanceTo(L.latLng(Number(b[1]), Number(b[0])));

      const addGraphEdge = (aKey, bKey, distance) => {
        if (!pedestrianGraph.has(aKey)) pedestrianGraph.set(aKey, []);
        if (!pedestrianGraph.has(bKey)) pedestrianGraph.set(bKey, []);

        pedestrianGraph.get(aKey).push({ node: bKey, distance });
        pedestrianGraph.get(bKey).push({ node: aKey, distance });
      };

      const addPedestrianFeatureToGraph = (feature) => {
        const geometry = feature?.geometry;
        if (!geometry) return;

        const lines = geometry.type === 'LineString'
          ? [geometry.coordinates]
          : geometry.type === 'MultiLineString'
            ? geometry.coordinates
            : [];

        for (const line of lines) {
          if (!Array.isArray(line) || line.length < 2) continue;

          const keys = line.map(graphKey);

          for (let i = 0; i < line.length - 1; i += 1) {
            const a = line[i];
            const b = line[i + 1];
            const aKey = keys[i];
            const bKey = keys[i + 1];
            const distance = distanceBetween(a, b);

            if (distance <= 0) continue;

            addGraphEdge(aKey, bKey, distance);
            coordinateByKey.set(aKey, a);
            coordinateByKey.set(bKey, b);

            pedestrianSegments.push({
              a,
              b,
              aKey,
              bKey,
              distance
            });
          }
        }
      };

      const toRoutingXY = (coordinate) => {
        const scaleX = 111320 * Math.cos(center.lat * Math.PI / 180);
        const scaleY = 111320;

        return {
          x: Number(coordinate[0]) * scaleX,
          y: Number(coordinate[1]) * scaleY
        };
      };

      const interpolateCoordinate = (a, b, fraction) => [
        Number(a[0]) + (Number(b[0]) - Number(a[0])) * fraction,
        Number(a[1]) + (Number(b[1]) - Number(a[1])) * fraction
      ];

      const cross2D = (a, b) => a.x * b.y - a.y * b.x;

      const pointOnSegmentFraction = (point, a, b, toleranceMeters = 0.05) => {
        const p = toRoutingXY(point);
        const ax = toRoutingXY(a);
        const bx = toRoutingXY(b);

        const dx = bx.x - ax.x;
        const dy = bx.y - ax.y;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) return null;

        const fraction = Math.max(
          0,
          Math.min(
            1,
            ((p.x - ax.x) * dx + (p.y - ax.y) * dy) / lengthSquared
          )
        );

        const nearest = {
          x: ax.x + dx * fraction,
          y: ax.y + dy * fraction
        };

        if (Math.hypot(p.x - nearest.x, p.y - nearest.y) > toleranceMeters) {
          return null;
        }

        return fraction;
      };

      const segmentIntersectionFractions = (first, second) => {
        const p = toRoutingXY(first.a);
        const p2 = toRoutingXY(first.b);
        const q = toRoutingXY(second.a);
        const q2 = toRoutingXY(second.b);

        const r = {
          x: p2.x - p.x,
          y: p2.y - p.y
        };
        const qMinusP = {
          x: q.x - p.x,
          y: q.y - p.y
        };
        const ss = {
          x: q2.x - q.x,
          y: q2.y - q.y
        };

        const denominator = cross2D(r, ss);
        const fractions = [];

        if (Math.abs(denominator) > 1e-9) {
          const t = cross2D(qMinusP, ss) / denominator;
          const u = cross2D(qMinusP, r) / denominator;

          if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
            fractions.push({
              first: Math.max(0, Math.min(1, t)),
              second: Math.max(0, Math.min(1, u))
            });
          }

          return fractions;
        }

        /*
         * Parallel/collinear case: connect only exact endpoints that lie on
         * the other segment. This avoids creating connections between merely
         * nearby parallel paths.
         */
        const firstStartOnSecond = pointOnSegmentFraction(first.a, second.a, second.b);
        if (firstStartOnSecond !== null) {
          fractions.push({ first: 0, second: firstStartOnSecond });
        }

        const firstEndOnSecond = pointOnSegmentFraction(first.b, second.a, second.b);
        if (firstEndOnSecond !== null) {
          fractions.push({ first: 1, second: firstEndOnSecond });
        }

        const secondStartOnFirst = pointOnSegmentFraction(second.a, first.a, first.b);
        if (secondStartOnFirst !== null) {
          fractions.push({ first: secondStartOnFirst, second: 0 });
        }

        const secondEndOnFirst = pointOnSegmentFraction(second.b, first.a, first.b);
        if (secondEndOnFirst !== null) {
          fractions.push({ first: secondEndOnFirst, second: 1 });
        }

        return fractions;
      };

      const rebuildPedestrianRouting = () => {
        pedestrianSegments = [];
        pedestrianGraph = new Map();
        coordinateByKey = new Map();
        gateRoutingNodes = new Map();

        const rawSegments = [];

        for (const feature of pedestrianPathData.features || []) {
          const geometry = feature?.geometry;
          if (!geometry) continue;

          const lines = geometry.type === 'LineString'
            ? [geometry.coordinates]
            : geometry.type === 'MultiLineString'
              ? geometry.coordinates
              : [];

          for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            if (!Array.isArray(line) || line.length < 2) continue;

            for (let index = 0; index < line.length - 1; index += 1) {
              const a = line[index];
              const b = line[index + 1];
              const distance = distanceBetween(a, b);

              if (distance <= 0) continue;

              rawSegments.push({
                featureId: String(feature.id ?? ''),
                lineIndex,
                segmentIndex: index,
                a,
                b,
                distance
              });
            }
          }
        }

        const splitFractions = rawSegments.map(() => [0, 1]);

        for (let firstIndex = 0; firstIndex < rawSegments.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < rawSegments.length; secondIndex += 1) {
            const first = rawSegments[firstIndex];
            const second = rawSegments[secondIndex];

            if (
              first.featureId === second.featureId &&
              first.lineIndex === second.lineIndex &&
              Math.abs(first.segmentIndex - second.segmentIndex) <= 1
            ) {
              continue;
            }

            const intersections = segmentIntersectionFractions(first, second);

            for (const intersection of intersections) {
              splitFractions[firstIndex].push(intersection.first);
              splitFractions[secondIndex].push(intersection.second);
            }
          }
        }

        for (let segmentIndex = 0; segmentIndex < rawSegments.length; segmentIndex += 1) {
          const segment = rawSegments[segmentIndex];
          const fractions = Array.from(
            new Set(
              splitFractions[segmentIndex]
                .map((value) => Number(Math.max(0, Math.min(1, value)).toFixed(10)))
            )
          ).sort((a, b) => a - b);

          const splitCoordinates = fractions.map((fraction) =>
            interpolateCoordinate(segment.a, segment.b, fraction)
          );

          for (let i = 0; i < splitCoordinates.length - 1; i += 1) {
            const a = splitCoordinates[i];
            const b = splitCoordinates[i + 1];
            const distance = distanceBetween(a, b);

            if (distance <= 0) continue;

            const aKey = graphKey(a);
            const bKey = graphKey(b);

            addGraphEdge(aKey, bKey, distance);
            coordinateByKey.set(aKey, a);
            coordinateByKey.set(bKey, b);

            pedestrianSegments.push({
              a,
              b,
              aKey,
              bKey,
              distance,
              featureId: segment.featureId,
              lineIndex: segment.lineIndex,
              segmentIndex: segment.segmentIndex
            });
          }
        }

        /*
         * Gates are routing access nodes. They do not alter pedestrian
         * geometry; they connect their access point to the nearest graph edge.
         */
        const projectPointToGraphEdge = (point, a, b) => {
          const refLat = Number(point[1]) * Math.PI / 180;
          const scaleX = 111320 * Math.cos(refLat);
          const scaleY = 111320;

          const px = Number(point[0]) * scaleX;
          const py = Number(point[1]) * scaleY;
          const ax = Number(a[0]) * scaleX;
          const ay = Number(a[1]) * scaleY;
          const bx = Number(b[0]) * scaleX;
          const by = Number(b[1]) * scaleY;

          const dx = bx - ax;
          const dy = by - ay;
          const lengthSquared = dx * dx + dy * dy;

          if (lengthSquared === 0) {
            return {
              fraction: 0,
              distance: Math.hypot(px - ax, py - ay),
              alongA: 0,
              alongB: 0
            };
          }

          const fraction = Math.max(
            0,
            Math.min(
              1,
              ((px - ax) * dx + (py - ay) * dy) / lengthSquared
            )
          );

          const nearestX = ax + dx * fraction;
          const nearestY = ay + dy * fraction;
          const edgeLength = Math.hypot(dx, dy);

          return {
            fraction,
            distance: Math.hypot(px - nearestX, py - nearestY),
            alongA: edgeLength * fraction,
            alongB: edgeLength * (1 - fraction)
          };
        };

        for (const gate of gateFeatureData.features || []) {
          const accessPoint =
            gate?.properties?.access_point ||
            gate?.properties?.center;

          if (
            !Array.isArray(accessPoint) ||
            accessPoint.length < 2
          ) {
            continue;
          }

          const gateNodeKey = 'gate:' + String(gate.id);
          let best = null;
          const seenEdges = new Set();

          for (const [aKey, edges] of pedestrianGraph.entries()) {
            const a = coordinateByKey.get(aKey);
            if (!a) continue;

            for (const edge of edges) {
              const bKey = edge.node;
              const b = coordinateByKey.get(bKey);
              if (!b) continue;

              const edgeId = [aKey, bKey].sort().join('|');
              if (seenEdges.has(edgeId)) continue;
              seenEdges.add(edgeId);

              const projection = projectPointToGraphEdge(
                accessPoint,
                a,
                b
              );

              if (!best || projection.distance < best.distance) {
                best = {
                  aKey,
                  bKey,
                  projection
                };
              }
            }
          }

          if (
            !best ||
            best.projection.distance > snapToleranceMeters
          ) {
            continue;
          }

          pedestrianGraph.set(gateNodeKey, []);
          coordinateByKey.set(gateNodeKey, [
            Number(accessPoint[0]),
            Number(accessPoint[1])
          ]);

          const connectorToA =
            best.projection.distance + best.projection.alongA;
          const connectorToB =
            best.projection.distance + best.projection.alongB;

          addGraphEdge(gateNodeKey, best.aKey, connectorToA);
          addGraphEdge(gateNodeKey, best.bKey, connectorToB);

          gateRoutingNodes.set(String(gate.id), {
            gateId: String(gate.id),
            nodeKey: gateNodeKey,
            coordinate: [
              Number(accessPoint[0]),
              Number(accessPoint[1])
            ],
            connectorDistance: best.projection.distance,
            segmentAKey: best.aKey,
            segmentBKey: best.bKey
          });
        }
      };
      rebuildPedestrianRouting();

      const projectToSegment = (point, a, b) => {
        const refLat = point.lat * Math.PI / 180;
        const scaleX = 111320 * Math.cos(refLat);
        const scaleY = 111320;

        const px = point.lng * scaleX;
        const py = point.lat * scaleY;
        const ax = Number(a[0]) * scaleX;
        const ay = Number(a[1]) * scaleY;
        const bx = Number(b[0]) * scaleX;
        const by = Number(b[1]) * scaleY;

        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
          return {
            coordinate: [Number(a[0]), Number(a[1])],
            fraction: 0,
            distance: Math.hypot(px - ax, py - ay)
          };
        }

        const rawFraction = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
        const fraction = Math.max(0, Math.min(1, rawFraction));
        const x = ax + fraction * dx;
        const y = ay + fraction * dy;

        return {
          coordinate: [
            x / scaleX,
            y / scaleY
          ],
          fraction,
          distance: Math.hypot(px - x, py - y)
        };
      };

      const snapToPedestrianPath = (latlng) => {
        let bestGate = null;

        for (const gate of gateFeatureData.features || []) {
          const gateNode = gateRoutingNodes.get(String(gate.id));
          if (!gateNode) continue;

          const candidateLatLng = L.latLng(
            Number(gateNode.coordinate[1]),
            Number(gateNode.coordinate[0])
          );

          const distance = latlng.distanceTo(candidateLatLng);

          if (
            distance <= snapToleranceMeters &&
            (!bestGate || distance < bestGate.distance)
          ) {
            bestGate = {
              type: 'gate',
              gateId: String(gate.id),
              nodeKey: gateNode.nodeKey,
              coordinate: gateNode.coordinate,
              latlng: candidateLatLng,
              distance
            };
          }
        }

        if (bestGate) {
          return bestGate;
        }

        let bestVertex = null;
        let bestSegment = null;

        const seenVertices = new Set();

        for (const segment of pedestrianSegments) {
          for (const [coordinate, key] of [
            [segment.a, segment.aKey],
            [segment.b, segment.bKey]
          ]) {
            if (seenVertices.has(key)) continue;
            seenVertices.add(key);

            const candidateLatLng = L.latLng(
              Number(coordinate[1]),
              Number(coordinate[0])
            );

            const distance = latlng.distanceTo(candidateLatLng);
            if (!bestVertex || distance < bestVertex.distance) {
              bestVertex = {
                type: 'vertex',
                coordinate: [Number(coordinate[0]), Number(coordinate[1])],
                fraction: 0,
                distance,
                nodeKey: key,
                segment
              };
            }
          }
        }

        for (const segment of pedestrianSegments) {
          const projection = projectToSegment(latlng, segment.a, segment.b);
          const candidate = {
            type: 'segment',
            ...projection,
            segment
          };

          if (!bestSegment || candidate.distance < bestSegment.distance) {
            bestSegment = candidate;
          }
        }

        if (
          bestVertex &&
          bestVertex.distance <= snapToleranceMeters
        ) {
          return {
            ...bestVertex,
            latlng: L.latLng(
              Number(bestVertex.coordinate[1]),
              Number(bestVertex.coordinate[0])
            )
          };
        }

        if (!bestSegment) return null;

        return {
          ...bestSegment,
          latlng: L.latLng(
            Number(bestSegment.coordinate[1]),
            Number(bestSegment.coordinate[0])
          )
        };
      };

      const routeBetweenSnaps = (startSnap, endSnap) => {
        const graph = new Map();

        for (const [key, edges] of pedestrianGraph.entries()) {
          graph.set(key, edges.map((edge) => ({ ...edge })));
        }

        const connectSnap = (snapKey, snap) => {
          if (snap.type === 'gate') {
            return snap.nodeKey;
          }

          graph.set(snapKey, []);

          const { segment, fraction } = snap;
          const aDistance = segment.distance * fraction;
          const bDistance = segment.distance * (1 - fraction);

          graph.get(snapKey).push(
            { node: segment.aKey, distance: aDistance },
            { node: segment.bKey, distance: bDistance }
          );

          if (graph.has(segment.aKey)) {
            graph.get(segment.aKey).push({
              node: snapKey,
              distance: aDistance
            });
          }

          if (graph.has(segment.bKey)) {
            graph.get(segment.bKey).push({
              node: snapKey,
              distance: bDistance
            });
          }

          return snapKey;
        };

        const startKey = connectSnap('snap:start', startSnap);
        const endKey = connectSnap('snap:end', endSnap);

        if (
          startSnap.type !== 'gate' &&
          endSnap.type !== 'gate'
        ) {
          const sameSegment =
            startSnap.segment.aKey === endSnap.segment.aKey &&
            startSnap.segment.bKey === endSnap.segment.bKey ||
            startSnap.segment.aKey === endSnap.segment.bKey &&
            startSnap.segment.bKey === endSnap.segment.aKey;

          if (sameSegment) {
            const directDistance =
              Math.abs(startSnap.fraction - endSnap.fraction) *
              startSnap.segment.distance;

            graph.get(startKey).push({
              node: endKey,
              distance: directDistance
            });
            graph.get(endKey).push({
              node: startKey,
              distance: directDistance
            });
          }
        }

        class MinHeap {
          constructor() {
            this.items = [];
          }

          get size() {
            return this.items.length;
          }

          push(item) {
            this.items.push(item);

            let index = this.items.length - 1;

            while (index > 0) {
              const parent = Math.floor((index - 1) / 2);

              if (this.items[parent].distance <= this.items[index].distance) {
                break;
              }

              [this.items[parent], this.items[index]] = [
                this.items[index],
                this.items[parent]
              ];

              index = parent;
            }
          }

          pop() {
            if (!this.items.length) return null;

            const first = this.items[0];
            const last = this.items.pop();

            if (this.items.length && last) {
              this.items[0] = last;

              let index = 0;

              while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;

                if (
                  left < this.items.length &&
                  this.items[left].distance < this.items[smallest].distance
                ) {
                  smallest = left;
                }

                if (
                  right < this.items.length &&
                  this.items[right].distance < this.items[smallest].distance
                ) {
                  smallest = right;
                }

                if (smallest === index) break;

                [this.items[index], this.items[smallest]] = [
                  this.items[smallest],
                  this.items[index]
                ];

                index = smallest;
              }
            }

            return first;
          }
        }

        const distances = new Map([[startKey, 0]]);
        const previous = new Map();
        const visited = new Set();
        const queue = new MinHeap();
        queue.push({ node: startKey, distance: 0 });

        while (queue.size) {
          const current = queue.pop();

          if (!current || visited.has(current.node)) continue;
          visited.add(current.node);

          if (current.node === endKey) break;

          for (const edge of graph.get(current.node) || []) {
            if (visited.has(edge.node)) continue;

            const nextDistance = current.distance + edge.distance;

            if (nextDistance < (distances.get(edge.node) ?? Infinity)) {
              distances.set(edge.node, nextDistance);
              previous.set(edge.node, current.node);
              queue.push({
                node: edge.node,
                distance: nextDistance
              });
            }
          }
        }

        if (!distances.has(endKey)) return null;

        const nodeKeys = [];
        let cursor = endKey;

        while (cursor) {
          nodeKeys.push(cursor);
          cursor = previous.get(cursor);
        }

        nodeKeys.reverse();

        const routeCoordinates = nodeKeys
          .map((key) => coordinateByKey.get(key))
          .filter(Boolean);

        if (startSnap.type !== 'gate') {
          routeCoordinates.unshift(startSnap.coordinate);
        }

        if (endSnap.type !== 'gate') {
          routeCoordinates.push(endSnap.coordinate);
        }

        return {
          coordinates: routeCoordinates,
          distance: distances.get(endKey)
        };
      };

      /*
       * Building labels scale with the actual on-screen building bounds.
       * Every label is hard-limited to 8px–18px.
       */
      const buildingLabels = [];

      const clampLabelSize = (value) =>
        Math.max(8, Math.min(16, value));

      const measureTextAtOnePx = (text) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) return Math.max(1, text.length * 0.55);

        context.font = "500 1px 'DM Sans', sans-serif";
        return Math.max(1, context.measureText(text).width);
      };

      const updateBuildingLabels = () => {
        const zoom = map.getZoom();

        for (const item of buildingLabels) {
          const northWest = map.project(item.bounds.getNorthWest(), zoom);
          const southEast = map.project(item.bounds.getSouthEast(), zoom);

          const buildingWidth = Math.max(1, Math.abs(southEast.x - northWest.x));
          const buildingHeight = Math.max(1, Math.abs(southEast.y - northWest.y));

          // Keep text comfortably inside the building footprint.
          const availableWidth = buildingWidth * 0.82;
          const availableHeight = buildingHeight * 0.48;

          // Estimate the largest one-line size that fits the building width.
          const textWidthAtOnePx = measureTextAtOnePx(item.name);
          const widthBasedSize = availableWidth / textWidthAtOnePx;

          // Also limit by the building height so text never dominates a small building.
          const heightBasedSize = availableHeight;

          item.fontSize = clampLabelSize(
            Math.min(widthBasedSize, heightBasedSize)
          );

          item.label.style.setProperty(
            '--building-label-size',
            item.fontSize + 'px'
          );
          item.label.style.setProperty(
            '--building-label-width',
            availableWidth + 'px'
          );
        }
      };

      for (const feature of campusData.features || []) {
        const name = feature?.properties?.name;
        const building = feature?.properties?.building;
        const geometry = feature?.geometry;

        if (!name || !building || !geometry?.coordinates) continue;

        const tempLayer = L.geoJSON(feature);
        const bounds = tempLayer.getBounds();

        if (!bounds.isValid()) continue;

        const safeName = String(name)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

        const marker = L.marker(bounds.getCenter(), {
          icon: L.divIcon({
            className: 'building-label',
            html:
              '<span style="--building-label-size:8px;--building-label-width:20px">' +
              safeName +
              '</span>',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          }),
          interactive: false,
          keyboard: false
        }).addTo(map);

        const label = marker.getElement()?.querySelector('span');

        if (!label) continue;

        buildingLabels.push({
          name: String(name),
          bounds,
          marker,
          label,
          fontSize: 8
        });
      }

      /*
       * Keep the source geometry as-is, but hide anything outside the
       * 1 km circular viewing area.
       */
      const outer = [
        [center.lat - 1, center.lng - 1],
        [center.lat - 1, center.lng + 1],
        [center.lat + 1, center.lng + 1],
        [center.lat + 1, center.lng - 1]
      ];

      const inner = ring
        .map(([lon, lat]) => [lat, lon])
        .reverse();

      const perimeterMask = L.polygon([outer, inner], {
        stroke: false,
        fillColor: '#eef1f3',
        fillOpacity: 0.9,
        interactive: false
      }).addTo(map);

      // Keep the 1 km view as the normal zoom-out floor.
      // All zooming uses the standard map interactions and +/- controls.
      const perimeterZoom = 18;
      const maxZoom = 25;

      map.setMinZoom(perimeterZoom);
      map.setMaxZoom(maxZoom);
      map.setView(center, perimeterZoom, { animate: false });

      function constrainToPerimeter() {
        const current = map.getCenter();
        const distance = center.distanceTo(current);

        if (distance <= radius) return;

        const bearing = Math.atan2(
          (current.lng - center.lng) * Math.cos(center.lat * Math.PI / 180),
          current.lat - center.lat
        );

        const latOffset = Math.cos(bearing) * radius / 111320;
        const lonOffset =
          Math.sin(bearing) * radius /
          (111320 * Math.cos(center.lat * Math.PI / 180));

        map.setView(
          [center.lat + latOffset, center.lng + lonOffset],
          Math.max(map.getZoom(), perimeterZoom),
          { animate: false }
        );
      }

      map.on('drag', constrainToPerimeter);
      map.on('moveend', constrainToPerimeter);

      // Do not snap zoom back to the 1 km minimum after an intentional override.
      map.on('zoomend', () => {
        if (map.getZoom() >= perimeterZoom) {
          constrainToPerimeter();
        }

        updateBuildingLabels();
      });

      setTimeout(() => {
        map.invalidateSize();
        updateBuildingLabels();
      }, 100);

      const genericStyle = (feature) => {
        const p = feature?.properties || {};

        if (p.highway || p.route) {
          return roadStyle(feature);
        }

        if (p.natural === 'water' || p.waterway) {
          return {
            color: '#9ac6d3',
            weight: 1,
            fillColor: colors.water,
            fillOpacity: 0.95
          };
        }

        if (p.leisure || p.landuse) {
          return {
            color: '#b7c7b0',
            weight: 0.7,
            fillColor: p.leisure === 'park' ? colors.park : colors.green,
            fillOpacity: 0.9
          };
        }

        if (p.building) {
          return {
            color: colors.buildingEdge,
            weight: 0.7,
            fillColor: colors.building,
            fillOpacity: 1
          };
        }

        return {
          color: '#d1cec8',
          weight: 0.7,
          fillColor: colors.land,
          fillOpacity: 0.85
        };
      };

      const campusLayers = [
        baseLayer,
        roadCasing,
        roads,
        ...buildingLabels.map((item) => item.marker)
      ];

      const layerRegistry = new Map([
        ['campus.geojson', campusLayers],
        ['perimeter.geojson', [perimeterMask]]
      ]);

      const renderGenericMapFile = (name) => {
        const url = '/maps/' + encodeURIComponent(name);

        return fetch(url)
          .then((response) => {
            if (!response.ok) throw new Error('Failed to load ' + name);
            return response.json();
          })
          .then((data) => {
            const layer = L.geoJSON(data, {
              style: genericStyle,
              interactive: false
            }).addTo(map);

            layerRegistry.set(name, [layer]);
            return layer;
          });
      };

      const setLayerVisibility = async (name, enabled) => {
        if (!layerRegistry.has(name)) {
          if (!enabled) return;
          try {
            await renderGenericMapFile(name);
          } catch {
            return;
          }
        }

        for (const layer of layerRegistry.get(name) || []) {
          if (enabled) {
            if (!map.hasLayer(layer)) layer.addTo(map);
          } else if (map.hasLayer(layer)) {
            map.removeLayer(layer);
          }
        }
      };

      const manifestResponse = await fetch('/maps/manifest.json');

      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const files = Array.isArray(manifest.files) ? manifest.files : [];
        const list = document.getElementById('mapFileList');
        const count = document.getElementById('mapFileCount');

        if (count) count.textContent = String(files.length);

        if (list) {
          list.innerHTML = '';

          for (const name of files) {
            const row = document.createElement('label');
            row.className = 'map-file-row';

            const info = document.createElement('span');
            const title = document.createElement('strong');
            const path = document.createElement('small');

            title.textContent = name;
            path.textContent = 'maps/' + name;

            info.append(title, path);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked =
              name === 'campus.geojson' ||
              name === 'perimeter.geojson';
            checkbox.setAttribute('data-map-file', name);

            row.append(info, checkbox);
            list.appendChild(row);

            checkbox.addEventListener('change', () => {
              void setLayerVisibility(name, checkbox.checked);
            });
          }
        }
      }

      const pathToggle = document.getElementById('pathToggle');
      const showBasePedestrianToggle = document.getElementById('showBasePedestrianToggle');

      pathToggle?.addEventListener('click', () => {
        pedestrianPathsActive = !pedestrianPathsActive;

        if (pedestrianPathsActive) {
          pedestrianPaths?.addTo(map);
        } else {
          if (pedestrianPaths && map.hasLayer(pedestrianPaths)) {
            map.removeLayer(pedestrianPaths);
          }
        }

        pathToggle.classList.toggle('is-active', pedestrianPathsActive);
        pathToggle.setAttribute('aria-pressed', String(pedestrianPathsActive));
      });

      showBasePedestrianToggle?.addEventListener('change', () => {
        if (!basePedestrianDebugLayer) return;

        if (showBasePedestrianToggle.checked) {
          basePedestrianDebugLayer.addTo(map);
        } else if (map.hasLayer(basePedestrianDebugLayer)) {
          map.removeLayer(basePedestrianDebugLayer);
        }
      });

      const routeToggle = document.getElementById('routeToggle');
      const routeCard = document.getElementById('routeCard');
      const routeStatus = document.getElementById('routeStatus');
      const routeDistance = document.getElementById('routeDistance');
      const routeTime = document.getElementById('routeTime');
      const routeClear = document.getElementById('routeClear');

      let routeModeActive = false;
      let routeStart = null;
      let routeEnd = null;
      let routeStartMarker = null;
      let routeEndMarker = null;
      let routeLine = null;
      let routeLineCasing = null;

      const showRouteCard = (visible = true) => {
        routeCard?.classList.toggle('is-open', visible);
        routeCard?.setAttribute('aria-hidden', String(!visible));
      };

      const clearRouteTest = (keepMode = false) => {
        routeStart = null;
        routeEnd = null;

        if (routeStartMarker) map.removeLayer(routeStartMarker);
        if (routeEndMarker) map.removeLayer(routeEndMarker);
        if (routeLine) map.removeLayer(routeLine);
        if (routeLineCasing) map.removeLayer(routeLineCasing);

        routeStartMarker = null;
        routeEndMarker = null;
        routeLine = null;
        routeLineCasing = null;

        routeDistance.textContent = '—';
        routeTime.textContent = '—';
        routeStatus.textContent = 'Select a start point';

        if (!keepMode) {
          routeModeActive = false;
          routeToggle?.classList.remove('is-active');
          routeToggle?.setAttribute('aria-pressed', 'false');
          showRouteCard(false);
        } else {
          showRouteCard(true);
        }
      };

      const createRouteMarker = (latlng, label, className) =>
        L.marker(latlng, {
          icon: L.divIcon({
            className: 'route-point-marker ' + className,
            html: '<span><b>' + label + '</b></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          }),
          interactive: false,
          keyboard: false
        }).addTo(map);

      routeToggle?.addEventListener('click', () => {
        routeModeActive = !routeModeActive;

        routeToggle.classList.toggle('is-active', routeModeActive);
        routeToggle.setAttribute('aria-pressed', String(routeModeActive));

        if (routeModeActive) {
          clearRouteTest(true);

          if (gateModeActive) {
            closeGateTools();
          }

          if (editModeEnabled) {
            editModeEnabled = false;
            if (editModeToggle) editModeToggle.checked = false;
            showEditIcon(false);
            showGateIcon(false);
            closeEditTools();
            refreshGateLayer();
            buildEditableHitLayer();
          }

          pedestrianPathsActive = true;
          pedestrianPathCasing?.addTo(map);
          pedestrianPaths?.addTo(map);
          pathToggle?.classList.add('is-active');
          pathToggle?.setAttribute('aria-pressed', 'true');
          routeStatus.textContent = 'Select a start point';
          showRouteCard(true);
        } else {
          clearRouteTest(false);
        }
      });

      routeClear?.addEventListener('click', () => {
        clearRouteTest(true);
      });

      map.on('click', (event) => {
        if (!routeModeActive) return;

        const snapped = snapToPedestrianPath(event.latlng);
        if (!snapped) return;

        if (snapped.distance > snapToleranceMeters) return;

        if (!routeStart) {
          routeStart = snapped;
          routeStartMarker = createRouteMarker(
            snapped.latlng,
            'A',
            'route-point-start'
          );
          routeStatus.textContent = 'Select an end point';
          routeCard?.classList.add('is-open');
          return;
        }

        if (!routeEnd) {
          routeEnd = snapped;

          if (routeStart.latlng.distanceTo(routeEnd.latlng) < 1) {
            routeStatus.textContent = 'Choose a different end point';
            routeEnd = null;
            return;
          }

          routeEndMarker = createRouteMarker(
            snapped.latlng,
            'B',
            'route-point-end'
          );

          const route = routeBetweenSnaps(routeStart, routeEnd);

          if (!route) {
            routeStatus.textContent = 'No connected pedestrian route';
            routeDistance.textContent = '—';
            routeTime.textContent = '—';
            return;
          }

          routeLineCasing = L.polyline(
            route.coordinates.map(([lng, lat]) => [lat, lng]),
            {
              color: '#ffffff',
              weight: routeCasingWeight,
              opacity: 0.96,
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false
            }
          ).addTo(map);

          routeLine = L.polyline(
            route.coordinates.map(([lng, lat]) => [lat, lng]),
            {
              color: '#0f4fd8',
              weight: routePathWeight,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false
            }
          ).addTo(map);

          const distanceMeters = route.distance;
          const seconds = distanceMeters / walkingSpeedMetersPerSecond;

          routeStatus.textContent = 'Route ready';
          routeDistance.textContent =
            distanceMeters < 1000
              ? Math.round(distanceMeters) + ' m'
              : (distanceMeters / 1000).toFixed(2) + ' km';
          routeTime.textContent =
            seconds < 60
              ? Math.max(1, Math.round(seconds)) + ' sec'
              : Math.max(1, Math.ceil(seconds / 60)) + ' min';
        }
      });

      const editModeToggle = document.getElementById('editModeToggle');
      const editToggle = document.getElementById('editToggle');
      const editCard = document.getElementById('editCard');
      const editStatus = document.getElementById('editStatus');
      const pathTypePalette = document.getElementById('pathTypePalette');
      const editNewPath = document.getElementById('editNewPath');
      const editUndo = document.getElementById('editUndo');
      const editFinish = document.getElementById('editFinish');
      const editDeletePoint = document.getElementById('editDeletePoint');
      const editDelete = document.getElementById('editDelete');
      const editCancel = document.getElementById('editCancel');
      const savePathEdits = document.getElementById('savePathEdits');
      const pathEditFileStatus = document.getElementById('pathEditFileStatus');
      const saveGateEdits = document.getElementById('saveGateEdits');
      const gateEditFileStatus = document.getElementById('gateEditFileStatus');
      const gateToggle = document.getElementById('gateToggle');
      const gateCard = document.getElementById('gateCard');
      const gateStatus = document.getElementById('gateStatus');
      const gateCancel = document.getElementById('gateCancel');
      const gateNew = document.getElementById('gateNew');
      const gateRename = document.getElementById('gateRename');
      const gateRotateLeft = document.getElementById('gateRotateLeft');
      const gateRotateRight = document.getElementById('gateRotateRight');
      const gateDelete = document.getElementById('gateDelete');
      const gateNameModal = document.getElementById('gateNameModal');
      const gateNameInput = document.getElementById('gateNameInput');
      const gateNameCancel = document.getElementById('gateNameCancel');
      const gateNameCancelButton = document.getElementById('gateNameCancelButton');
      const gateNameConfirm = document.getElementById('gateNameConfirm');
      const deletePointModal = document.getElementById('deletePointModal');
      const deletePointCancel = document.getElementById('deletePointCancel');
      const deletePointMerge = document.getElementById('deletePointMerge');
      const deletePointDrop = document.getElementById('deletePointDrop');

      let pointEditorActive = false;
      let drawingModeActive = false;
      let gateModeActive = false;
      let drawingPoints = [];
      let drawingMarkers = [];
      let drawingLine = null;
      let drawingLineCasing = null;
      let drawingSnapMarker = null;

      let gateEditDirty = false;
      let selectedGate = null;
      let gatePreview = null;
      let gatePointerId = null;
      let gatePointerStart = null;
      let pendingGateBounds = null;
      let gateNameEditId = null;
      let gateHandleMarkers = [];

      let centerGatePointerId = null;
      let centerGatePointerStart = null;
      let centerGateDragStartModel = null;
      let centerGateMapWasEnabled = true;

      let defaultVertexMarkers = [];
      let editableVertexMarkers = [];
      let editablePathLines = new Map();
      let selectedPoint = null;
      let selectedPath = null;

      const showEditIcon = (visible) => {
        if (!editToggle) return;

        editToggle.classList.toggle('is-visible', visible);
        if (!visible) {
          editToggle.classList.remove('is-active');
          editToggle.setAttribute('aria-pressed', 'false');
        }
        editToggle.setAttribute('aria-hidden', String(!visible));
        editToggle.disabled = !visible;
        editToggle.tabIndex = visible ? 0 : -1;
        editToggle.style.display = visible ? 'grid' : 'none';
      };

      const showGateIcon = (visible) => {
        if (!gateToggle) return;

        gateToggle.classList.toggle('is-visible', visible);
        if (!visible) {
          gateToggle.classList.remove('is-active');
          gateToggle.setAttribute('aria-pressed', 'false');
        }
        gateToggle.setAttribute('aria-hidden', String(!visible));
        gateToggle.disabled = !visible;
        gateToggle.tabIndex = visible ? 0 : -1;
        gateToggle.style.display = visible ? 'grid' : 'none';
      };

      const syncEditModeUi = () => {
        const enabled = Boolean(editModeToggle?.checked);
        editModeEnabled = enabled;
        showEditIcon(enabled);
        showGateIcon(enabled);

        /*
         * Keep the DOM-level visibility state synchronized with the map
         * controller state.
         */
        syncEditorToolVisibility();
      };

      const showEditCard = (visible) => {
        editCard?.classList.toggle('is-open', visible);
        editCard?.setAttribute('aria-hidden', String(!visible));
      };

      const setEditActionVisibility = ({
        pointEditor = false,
        drawing = false,
        pointSelected = false,
        pathEditing = false,
        pathDeletable = false
      } = {}) => {
        if (editNewPath) editNewPath.hidden = !pointEditor || drawing;
        if (editUndo) editUndo.hidden = !drawing;
        if (editFinish) editFinish.hidden = !drawing;
        if (editDeletePoint) editDeletePoint.hidden = !pointSelected;
        if (editDelete) editDelete.hidden = !(pathEditing && pathDeletable);
      };

      const clearDrawingSnap = () => {
        if (drawingSnapMarker) {
          map.removeLayer(drawingSnapMarker);
        }

        drawingSnapMarker = null;
      };

      const clearDrawing = () => {
        drawingMarkers.forEach((marker) => map.removeLayer(marker));
        if (drawingLine) map.removeLayer(drawingLine);
        if (drawingLineCasing) map.removeLayer(drawingLineCasing);
        clearDrawingSnap();
        drawingMarkers = [];
        drawingPoints = [];
        drawingLine = null;
        drawingLineCasing = null;
      };

      const clearDefaultVertices = () => {
        defaultVertexMarkers.forEach((marker) => map.removeLayer(marker));
        defaultVertexMarkers = [];
      };

      const buildDefaultVertexMarkers = () => {
        clearDefaultVertices();

        for (const feature of pedestrianPathData.features || []) {
          if (feature?.geometry?.type !== 'LineString') continue;

          feature.geometry.coordinates.forEach(([lng, lat]) => {
            const marker = L.marker(
              [Number(lat), Number(lng)],
              {
                icon: L.divIcon({
                  className: 'path-default-vertex-marker',
                  html: '<span></span>',
                  iconSize: [10, 10],
                  iconAnchor: [5, 5]
                }),
                interactive: false,
                keyboard: false,
                zIndexOffset: 400
              }
            ).addTo(map);

            defaultVertexMarkers.push(marker);
          });
        }
      };

      const clearEditableVertices = () => {
        editableVertexMarkers.forEach((marker) => map.removeLayer(marker));
        editableVertexMarkers = [];

        for (const line of editablePathLines.values()) {
          map.removeLayer(line);
        }

        editablePathLines.clear();
        selectedPoint = null;
      };

      let activePathType = 'Pedestrian Path';

      const syncPathTypePalette = () => {
        if (!pathTypePalette) return;

        pathTypePalette
          .querySelectorAll('[data-path-type]')
          .forEach((option) => {
            const selected =
              option.getAttribute('data-path-type') === activePathType;

            option.classList.toggle('is-selected', selected);
            option.setAttribute('aria-pressed', String(selected));
          });
      };

      const setActivePathType = (category) => {
        if (!pathTypeValues.includes(category)) return;
        activePathType = category;
        syncPathTypePalette();
      };

      const applyPathType = (category) => {
        if (!pathTypeValues.includes(category)) return;

        setActivePathType(category);

        if (!selectedPath || drawingModeActive) {
          if (drawingModeActive) {
            editStatus.textContent =
              'New path type: ' + category;
          }
          return;
        }

        const feature = findEffectiveFeature(selectedPath.id);
        if (!feature) return;

        feature.properties = {
          category
        };

        markPathEditsDirty();
        refreshPedestrianLayers();
        refreshEditableVertexSelection();

        editStatus.textContent =
          'Path type: ' + category;
        showEditCard(true);
      };

      const clearSelectedPath = () => {
        selectedPath = null;
      };

      const closeEditTools = () => {
        showDeletePointModal(false);
        pathTypePalette?.classList.remove('is-open');
        pathTypePalette?.setAttribute('aria-hidden', 'true');
        setPedestrianBackedRoadVisibility(false);
        clearDrawing();
        clearEditableVertices();
        clearSelectedPath();
        pointEditorActive = false;
        drawingModeActive = false;
        editToggle?.classList.remove('is-active');
        editToggle?.setAttribute('aria-pressed', 'false');
        showEditCard(false);
        if (gateModeActive) {
          gateToggle?.classList.remove('is-active');
          gateToggle?.setAttribute('aria-pressed', 'false');
        }
        setEditActionVisibility();

        // Restore the invisible path hit layer after leaving draw mode.
        if (editModeEnabled) {
          buildEditableHitLayer();
        }
      };

      window.__campusMaaSCloseEditTools = closeEditTools;

      const createEditPointMarker = (latlng, number) =>
        L.marker(latlng, {
          icon: L.divIcon({
            className: 'edit-point-marker',
            html: '<span>' + number + '</span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          }),
          interactive: false,
          keyboard: false
        }).addTo(map);

      const renderDrawingLine = () => {
        if (drawingLine) map.removeLayer(drawingLine);
        if (drawingLineCasing) map.removeLayer(drawingLineCasing);

        if (drawingPoints.length < 2) {
          drawingLine = null;
          drawingLineCasing = null;
          return;
        }

        /*
         * Draw a strong live path between the selected points.  The casing
         * keeps it readable over the existing map network, while the solid
         * blue center makes it obvious that this is the path currently being
         * created.
         */
        drawingLineCasing = L.polyline(drawingPoints, {
          pane: 'drawingPreviewPane',
          color: '#ffffff',
          weight: Math.max(editorPreviewWeight + 4, 8),
          opacity: 0.98,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(map);

        drawingLine = L.polyline(drawingPoints, {
          pane: 'drawingPreviewPane',
          color: '#0f4fd8',
          weight: Math.max(editorPreviewWeight + 1, 5),
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(map);

        drawingLine.bringToFront();
        drawingLineCasing.bringToFront();
      };

      const markPathEditsDirty = () => {
        pathEditDirty = true;
        if (pathEditFileStatus) pathEditFileStatus.textContent = 'Unsaved';
      };

      const buildPathEditPayload = () => ({
        type: 'FeatureCollection',
        features: (pedestrianPathData.features || []).map((feature) => ({
          type: 'Feature',
          properties: {
            category: pathTypeValues.includes(feature?.properties?.category)
              ? feature.properties.category
              : 'Pedestrian Path'
          },
          geometry: {
            type: 'LineString',
            coordinates: cloneJson(feature?.geometry?.coordinates || [])
          }
        }))
      });

      const saveCurrentPathEdits = async () => {
        if (!savePathEdits) return;

        savePathEdits.disabled = true;
        if (pathEditFileStatus) pathEditFileStatus.textContent = 'Saving…';

        try {
          const response = await fetch('/__campusmaas/save-pedestrian-network', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(buildPathEditPayload())
          });

          if (!response.ok) {
            throw new Error('Save endpoint unavailable');
          }

          pathEditDirty = false;
          if (pathEditFileStatus) pathEditFileStatus.textContent = 'Saved';
        } catch (error) {
          console.error(error);
          if (pathEditFileStatus) pathEditFileStatus.textContent = 'Save failed';
          alert('Pedestrian GeoJSON could not be saved. Run the project with npm run dev to enable direct file saving.');
        } finally {
          savePathEdits.disabled = false;
        }
      };

      const buildGateEditPayload = () => ({
        type: 'FeatureCollection',
        properties: {
          format: 'campusmaas-gates',
          version: 1,
          description: 'Campus entry and access gate geometry'
        },
        features: cloneJson(gateFeatureData.features || [])
      });

      const saveCurrentGateEdits = async () => {
        if (!saveGateEdits) return;

        saveGateEdits.disabled = true;
        if (gateEditFileStatus) gateEditFileStatus.textContent = 'Saving…';

        try {
          const response = await fetch('/__campusmaas/save-gates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(buildGateEditPayload())
          });

          if (!response.ok) {
            throw new Error('Gate save endpoint unavailable');
          }

          gateEditDirty = false;
          if (gateEditFileStatus) gateEditFileStatus.textContent = 'Saved';
        } catch (error) {
          console.error(error);
          if (gateEditFileStatus) gateEditFileStatus.textContent = 'Save failed';
          alert('Gates GeoJSON could not be saved. Run the project with npm run dev to enable direct file saving.');
        } finally {
          saveGateEdits.disabled = false;
        }
      };

      const markGateEditsDirty = () => {
        gateEditDirty = true;
        if (gateEditFileStatus) gateEditFileStatus.textContent = 'Unsaved';
      };

      const findEffectiveFeature = (featureId) =>
        (pedestrianPathData.features || []).find(
          (feature) => String(feature?.id) === String(featureId)
        ) || null;

      const featureGeometryForEdit = (feature) => {
        if (!feature?.geometry || feature.geometry.type !== 'LineString') {
          return null;
        }

        return feature.geometry.coordinates.map(([lng, lat]) =>
          L.latLng(Number(lat), Number(lng))
        );
      };

      const saveEditedFeatureGeometry = (featureId, coordinates) => {
        const feature = findEffectiveFeature(featureId);
        if (!feature || coordinates.length < 2) return false;

        const geometry = {
          type: 'LineString',
          coordinates: coordinates.map((point) => [
            Number(point.lng.toFixed(7)),
            Number(point.lat.toFixed(7))
          ])
        };

        feature.geometry = geometry;
        markPathEditsDirty();

        return true;
      };

      const nearestEditableSnap = (featureId, vertexIndex, latlng) => {
        let best = null;

        const consider = (candidate) => {
          if (!best || candidate.distance < best.distance) {
            best = candidate;
          }
        };

        for (const feature of pedestrianPathData.features || []) {
          const coordinates = feature?.geometry?.type === 'LineString'
            ? feature.geometry.coordinates
            : [];

          const currentId = String(feature?.id);
          if (!coordinates.length) continue;

          for (let index = 0; index < coordinates.length; index += 1) {
            if (
              currentId === String(featureId) &&
              index === vertexIndex
            ) {
              continue;
            }

            const candidateLatLng = L.latLng(
              Number(coordinates[index][1]),
              Number(coordinates[index][0])
            );

            consider({
              type: 'point',
              distance: latlng.distanceTo(candidateLatLng),
              latlng: candidateLatLng
            });
          }

          for (let index = 0; index < coordinates.length - 1; index += 1) {
            if (
              currentId === String(featureId) &&
              (index === vertexIndex || index + 1 === vertexIndex)
            ) {
              continue;
            }

            const a = coordinates[index];
            const b = coordinates[index + 1];
            const projection = projectToSegment(latlng, a, b);

            consider({
              type: 'line',
              distance: projection.distance,
              latlng: projection.latlng,
              featureId: currentId,
              segmentIndex: index
            });
          }
        }

        if (!best || best.distance > snapToleranceMeters) {
          return null;
        }

        return best;
      };

      const updateEditablePathLine = (featureId, coordinates) => {
        const line = editablePathLines.get(String(featureId));
        if (line) line.setLatLngs(coordinates);
      };

      const createEditableVertexIcon = (selected = false) =>
        L.divIcon({
          className: 'edit-vertex-marker' + (selected ? ' is-selected' : ''),
          html: '<span></span>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

      const refreshEditableVertexSelection = () => {
        for (const item of editableVertexMarkers) {
          const isSelected =
            selectedPoint &&
            String(item.featureId) === String(selectedPoint.featureId) &&
            item.vertexIndex === selectedPoint.vertexIndex;

          item.marker.setIcon(createEditableVertexIcon(isSelected));
        }

        for (const [featureId, line] of editablePathLines.entries()) {
          const isSelected =
            selectedPath &&
            String(selectedPath.id) === String(featureId);
          const feature = findEffectiveFeature(featureId);
          const color = pathTypeColor(feature);

          line.setStyle({
            color,
            weight: isSelected ? 6 : 4,
            opacity: isSelected ? 1 : 0.72,
            dashArray: isSelected ? null : '6 5',
            lineCap: 'round',
            lineJoin: 'round'
          });
        }
      };

      pathTypePalette
        ?.querySelectorAll('[data-path-type]')
        .forEach((option) => {
          option.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const category = option.getAttribute('data-path-type');
            applyPathType(category);
          });
        });

      syncPathTypePalette();

      const selectEditablePoint = (featureId, vertexIndex) => {
        // Existing points are only targets while drawing; they must never
        // enter point-selection/delete state during New Path mode.
        if (drawingModeActive) return;

        selectedPoint = {
          featureId: String(featureId),
          vertexIndex
        };

        const feature = findEffectiveFeature(featureId);
        if (!feature) return;

        selectedPath = {
          id: feature.id,
          name: 'Pedestrian path'
        };
        setActivePathType(feature.properties?.category || 'Pedestrian Path');

        editStatus.textContent =
          'Point ' + (vertexIndex + 1) + ' selected · drag, delete point, or delete path';
        showEditCard(true);
        setEditActionVisibility({
          pointEditor: true,
          pointSelected: true,
          pathEditing: true,
          pathDeletable: true
        });

        refreshEditableVertexSelection();
      };

      const handleEditablePointDrop = (featureId, vertexIndex, marker) => {
        const feature = findEffectiveFeature(featureId);
        const coordinates = featureGeometryForEdit(feature);

        if (!feature || !coordinates || !coordinates[vertexIndex]) return;

        const drop = marker.getLatLng();
        const snap = nearestEditableSnap(featureId, vertexIndex, drop);
        const finalPoint = snap?.latlng || drop;

        marker.setLatLng(finalPoint);
        coordinates[vertexIndex] = finalPoint;
        updateEditablePathLine(featureId, coordinates);

        const saved = saveEditedFeatureGeometry(featureId, coordinates);
        if (!saved) return;

        selectedPoint = {
          featureId: String(featureId),
          vertexIndex
        };

        editStatus.textContent = snap
          ? snap.type === 'point'
            ? 'Point connected to existing point'
            : 'Point connected to pedestrian line'
          : 'Point moved';

        refreshAfterPathChange();
      };

      const buildEditableVertexEditor = () => {
        const previousSelection = selectedPoint
          ? { ...selectedPoint }
          : null;

        clearEditableVertices();

        if (!pointEditorActive) return;

        for (const feature of pedestrianPathData.features || []) {
          if (feature?.geometry?.type !== 'LineString') continue;

          const featureId = String(feature.id);
          const coordinates = feature.geometry.coordinates.map(([lng, lat]) =>
            L.latLng(Number(lat), Number(lng))
          );

          /*
           * Keep the complete path geometry visible while editing.
           * Vertices alone are not enough: the editor must show the actual
           * LineString connecting them, with the selected path emphasized.
           */
          const previewLine = L.polyline(coordinates, {
            color: pathTypeColor(feature),
            weight: 4,
            opacity: 0.72,
            dashArray: '6 5',
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
          }).addTo(map);

          editablePathLines.set(featureId, previewLine);

          coordinates.forEach((latlng, vertexIndex) => {
            const marker = L.marker(latlng, {
              draggable: true,
              zIndexOffset: 1200,
              icon: createEditableVertexIcon(
                previousSelection &&
                String(previousSelection.featureId) === featureId &&
                previousSelection.vertexIndex === vertexIndex
              )
            }).addTo(map);

            marker.on('click', (event) => {
              event.originalEvent?.stopPropagation();
              selectEditablePoint(featureId, vertexIndex);
            });

            marker.on('dragstart', () => {
              selectEditablePoint(featureId, vertexIndex);
            });

            marker.on('drag', () => {
              const line = editablePathLines.get(featureId);
              if (!line) return;

              const liveCoordinates = line.getLatLngs();
              liveCoordinates[vertexIndex] = marker.getLatLng();
              line.setLatLngs(liveCoordinates);
            });

            marker.on('dragend', () => {
              handleEditablePointDrop(featureId, vertexIndex, marker);
            });

            editableVertexMarkers.push({
              featureId,
              vertexIndex,
              marker
            });
          });
        }

        if (previousSelection) {
          selectedPoint = previousSelection;
          refreshEditableVertexSelection();
        }
      };

      const refreshAfterPathChange = () => {
        rebuildPedestrianRouting();
        refreshPedestrianLayers();
        buildDefaultVertexMarkers();

        if (editModeEnabled) {
          buildEditableHitLayer();

          if (pointEditorActive) {
            buildEditableVertexEditor();
          }
        }
      };

      const startPointEditorMode = () => {
        if (!editModeEnabled) return;

        if (routeModeActive) {
          clearRouteTest(false);
        }

        if (gateModeActive) {
          closeGateTools();
        }

        clearDrawing();
        clearSelectedPath();
        pointEditorActive = true;
        drawingModeActive = false;

        pathTypePalette?.classList.add('is-open');
        pathTypePalette?.setAttribute('aria-hidden', 'false');

        setPedestrianBackedRoadVisibility(true);

        pedestrianPathsActive = true;
        pedestrianPathCasing?.addTo(map);
        pedestrianPaths?.addTo(map);

        editToggle?.classList.add('is-active');
        editToggle?.setAttribute('aria-pressed', 'true');
        editStatus.textContent = 'All points active · drag a point or select one';
        showEditCard(true);

        buildEditableHitLayer();
        buildEditableVertexEditor();

        setEditActionVisibility({
          pointEditor: true
        });
      };

      const startDrawingMode = () => {
        if (!editModeEnabled) return;

        clearEditableVertices();
        clearSelectedPath();
        clearDrawing();

        if (editableHitLayer && map.hasLayer(editableHitLayer)) {
          map.removeLayer(editableHitLayer);
        }
        editableHitLayer = null;

        pointEditorActive = false;
        drawingModeActive = true;

        pathTypePalette?.classList.add('is-open');
        pathTypePalette?.setAttribute('aria-hidden', 'false');

        setPedestrianBackedRoadVisibility(true);

        pedestrianPathsActive = true;
        pedestrianPathCasing?.addTo(map);
        pedestrianPaths?.addTo(map);

        editToggle?.classList.add('is-active');
        editToggle?.setAttribute('aria-pressed', 'true');
        editStatus.textContent = 'Click to draw · connect to existing points or cross existing paths';
        showEditCard(true);
        setEditActionVisibility({ drawing: true });
      };

      const findNearestRoutingHub = (latlng) => {
        let best = null;

        for (const [nodeKey, coordinate] of coordinateByKey.entries()) {
          if (String(nodeKey).startsWith('gate:')) continue;

          const degree = (pedestrianGraph.get(nodeKey) || []).length;
          if (degree < 3) continue;

          const candidate = L.latLng(
            Number(coordinate[1]),
            Number(coordinate[0])
          );
          const distance = latlng.distanceTo(candidate);

          if (!best || distance < best.distance) {
            best = {
              type: 'hub',
              latlng: candidate,
              distance,
              nodeKey
            };
          }
        }

        return best;
      };

      const findNearestPedestrianVertex = (latlng) => {
        let best = null;
        const seen = new Set();

        for (const feature of pedestrianPathData.features || []) {
          const geometry = feature?.geometry;
          if (!geometry) continue;

          const lines = geometry.type === 'LineString'
            ? [geometry.coordinates]
            : geometry.type === 'MultiLineString'
              ? geometry.coordinates
              : [];

          for (const line of lines) {
            if (!Array.isArray(line)) continue;

            for (const coordinate of line) {
              if (!Array.isArray(coordinate) || coordinate.length < 2) continue;

              const key =
                Number(coordinate[0]).toFixed(7) + ',' +
                Number(coordinate[1]).toFixed(7);

              if (seen.has(key)) continue;
              seen.add(key);

              const candidate = L.latLng(
                Number(coordinate[1]),
                Number(coordinate[0])
              );

              const distance = latlng.distanceTo(candidate);

              if (!best || distance < best.distance) {
                best = {
                  type: 'vertex',
                  latlng: candidate,
                  distance,
                  nodeKey: key
                };
              }
            }
          }
        }

        return best;
      };

      const findDrawingSnap = (point) => {
        const gate = snapToPedestrianPath(point);

        if (gate?.type === 'gate' && gate.distance <= snapToleranceMeters) {
          return {
            type: 'gate',
            latlng: gate.latlng,
            distance: gate.distance,
            nodeKey: gate.nodeKey
          };
        }

        const hub = findNearestRoutingHub(point);

        if (hub && hub.distance <= snapToleranceMeters) {
          return hub;
        }

        const vertex = findNearestPedestrianVertex(point);

        if (vertex && vertex.distance <= snapToleranceMeters) {
          return vertex;
        }

        const snapped = snapToPedestrianPath(point);

        if (!snapped || snapped.distance > snapToleranceMeters) {
          return {
            type: 'free',
            latlng: point,
            distance: snapped?.distance ?? Infinity,
            nodeKey: null
          };
        }

        return {
          type: snapped.type,
          latlng: snapped.latlng,
          distance: snapped.distance,
          nodeKey: snapped.nodeKey || null
        };
      };

      const updateDrawingSnapIndicator = (point) => {
        if (!drawingModeActive) {
          clearDrawingSnap();
          return null;
        }

        const snap = findDrawingSnap(point);

        if (snap?.type === 'free') {
          clearDrawingSnap();
          return snap;
        }

        if (!drawingSnapMarker) {
          drawingSnapMarker = L.marker(snap.latlng, {
            icon: L.divIcon({
              className: 'drawing-snap-marker',
              html: '<span></span>',
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            }),
            interactive: false,
            keyboard: false,
            zIndexOffset: 1200
          }).addTo(map);
        } else {
          drawingSnapMarker.setLatLng(snap.latlng);
        }

        return snap;
      };

      const snapDrawingPoint = (point) => {
        return findDrawingSnap(point).latlng;
      };

      const finishCustomPath = () => {
        if (drawingPoints.length < 2) {
          editStatus.textContent = 'Add at least 2 points';
          return;
        }

        const effectiveDrawingPoints = drawingPoints.map((point) => snapDrawingPoint(point));
        const customId = 'custom-' + Date.now();

        const geometry = {
          type: 'LineString',
          coordinates: effectiveDrawingPoints.map((point) => [
            Number(point.lng.toFixed(7)),
            Number(point.lat.toFixed(7))
          ])
        };

        pedestrianPathData.features.push({
          type: 'Feature',
          id: customId,
          properties: {
            category: activePathType
          },
          geometry
        });
        markPathEditsDirty();

        rebuildPedestrianRouting();
        refreshPedestrianLayers();

        drawingModeActive = false;
        startPointEditorMode();
        editStatus.textContent = 'Custom path saved · all points active';
      };

      const showGateCard = (visible = true) => {
        gateCard?.classList.toggle('is-open', visible);
        gateCard?.setAttribute('aria-hidden', String(!visible));
      };

      const showGateNameModal = (visible, mode = 'create', feature = null) => {
        gateNameEditId = mode === 'rename' && feature ? String(feature.id) : null;
        gateNameModal?.classList.toggle('is-open', visible);
        gateNameModal?.setAttribute('aria-hidden', String(!visible));

        if (!gateNameInput || !visible) return;

        gateNameInput.value = mode === 'rename'
          ? String(feature?.properties?.name || '')
          : '';

        if (gateNameConfirm) {
          gateNameConfirm.textContent = mode === 'rename' ? 'Save name' : 'Create gate';
        }

        requestAnimationFrame(() => {
          gateNameInput.focus();
          gateNameInput.select();
        });
      };

      const clearGatePreview = () => {
        if (gatePreview) map.removeLayer(gatePreview);
        gatePreview = null;
        pendingGateBounds = null;
      };

      const clearGateHandles = () => {
        gateHandleMarkers.forEach((marker) => map.removeLayer(marker));
        gateHandleMarkers = [];
      };

      const gateHandleIcon = (kind) =>
        L.divIcon({
          className: 'gate-handle-marker gate-handle-' + kind,
          html: '<span></span>',
          iconSize: kind === 'move' ? [30, 30] : [26, 26],
          iconAnchor: kind === 'move' ? [15, 15] : [13, 13]
        });

      const gateMetersPerDegreeLat = 111320;

      const gateLatLngToLocal = (center, point) => {
        const cosLat = Math.cos(center.lat * Math.PI / 180);

        return {
          x: (point.lng - center.lng) * gateMetersPerDegreeLat * cosLat,
          y: (point.lat - center.lat) * gateMetersPerDegreeLat
        };
      };

      const gateLocalToLatLng = (center, x, y) => {
        const cosLat = Math.cos(center.lat * Math.PI / 180);

        return L.latLng(
          center.lat + y / gateMetersPerDegreeLat,
          center.lng + x / (gateMetersPerDegreeLat * cosLat)
        );
      };

      const rotateLocalPoint = (x, y, degrees) => {
        const radians = degrees * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        return {
          x: x * cos - y * sin,
          y: x * sin + y * cos
        };
      };

      const gateModelForFeature = (feature) => {
        const ring = gateFeatureRing(feature);
        if (!ring || ring.length < 5) return null;

        const corners = ring.slice(0, 4).map(([lng, lat]) =>
          L.latLng(Number(lat), Number(lng))
        );

        const center = feature.properties?.center
          ? L.latLng(
              Number(feature.properties.center[1]),
              Number(feature.properties.center[0])
            )
          : L.latLng(
              (corners[0].lat + corners[1].lat + corners[2].lat + corners[3].lat) / 4,
              (corners[0].lng + corners[1].lng + corners[2].lng + corners[3].lng) / 4
            );

        const width = Number(feature.properties?.width_m) ||
          corners[1].distanceTo(corners[2]);

        const height = Number(feature.properties?.height_m) ||
          corners[0].distanceTo(corners[1]);

        let rotation = Number(feature.properties?.rotation_deg);

        if (!Number.isFinite(rotation)) {
          /*
           * Existing gates are created as axis-aligned SW -> NW -> NE -> SE.
           * Recover that orientation when loading an older gate file.
           */
          rotation = 0;
        }

        return {
          center,
          width_m: Math.max(0.5, width),
          height_m: Math.max(0.5, height),
          rotation_deg: rotation
        };
      };

      const gateCornersFromModel = (model) => {
        const halfWidth = model.width_m / 2;
        const halfHeight = model.height_m / 2;

        const localCorners = [
          [-halfWidth, -halfHeight],
          [-halfWidth, halfHeight],
          [halfWidth, halfHeight],
          [halfWidth, -halfHeight]
        ];

        return localCorners.map(([x, y]) => {
          const rotated = rotateLocalPoint(
            x,
            y,
            model.rotation_deg
          );

          return gateLocalToLatLng(
            model.center,
            rotated.x,
            rotated.y
          );
        });
      };

      const updateGateFeatureGeometry = (feature, model) => {
        if (!feature || !model) return;

        const corners = gateCornersFromModel(model);
        const ring = corners.map((point) => [
          Number(point.lng.toFixed(7)),
          Number(point.lat.toFixed(7))
        ]);

        ring.push([...ring[0]]);

        feature.geometry = {
          type: 'Polygon',
          coordinates: [ring]
        };

        feature.properties = {
          ...(feature.properties || {}),
          type: 'gate',
          center: [
            Number(model.center.lng.toFixed(7)),
            Number(model.center.lat.toFixed(7))
          ],
          access_point: [
            Number(model.center.lng.toFixed(7)),
            Number(model.center.lat.toFixed(7))
          ],
          width_m: Number(model.width_m.toFixed(3)),
          height_m: Number(model.height_m.toFixed(3)),
          rotation_deg: Number(model.rotation_deg.toFixed(1))
        };

        markGateEditsDirty();
      };

      const findGateLayer = (featureId) => {
        if (!gateLayer) return null;

        let match = null;

        gateLayer.eachLayer((layer) => {
          if (
            String(layer?.feature?.id) === String(featureId) ||
            String(layer?.options?.featureId) === String(featureId)
          ) {
            match = layer;
          }
        });

        return match;
      };

      const refreshGateLayerGeometry = (feature) => {
        const model = gateModelForFeature(feature);
        if (!model || !gateLayer) return;

        const layer = findGateLayer(feature.id);
        if (!layer?.setLatLngs) return;

        const corners = gateCornersFromModel(model);

        layer.setLatLngs([[
          corners[0],
          corners[1],
          corners[2],
          corners[3]
        ]]);

        layer.redraw?.();
      };

      const refreshGateHandles = () => {
        if (!selectedGate || !editModeEnabled) {
          clearGateHandles();
          return;
        }

        const feature = gateFeatureData.features.find(
          (item) => String(item.id) === String(selectedGate.id)
        );

        const model = gateModelForFeature(feature);

        if (!feature || !model) {
          clearGateHandles();
          return;
        }

        clearGateHandles();

        const corners = gateCornersFromModel(model);
        const cornerKinds = ['sw', 'nw', 'ne', 'se'];

        /*
         * Four corner points resize the rectangle. Holding Shift while
         * dragging a corner rotates the rectangle around its center.
         */
        corners.forEach((latlng, index) => {
          const marker = L.marker(latlng, {
            icon: gateHandleIcon(cornerKinds[index]),
            draggable: true,
            zIndexOffset: 1800,
            keyboard: false
          }).addTo(map);

          let dragStartModel = null;
          let fixedCorner = null;
          let initialPointerAngle = null;

          marker.on('dragstart', () => {
            const currentFeature = gateFeatureData.features.find(
              (item) => String(item.id) === String(selectedGate.id)
            );

            dragStartModel = gateModelForFeature(currentFeature);
            if (!dragStartModel) return;

            const initialCorners = gateCornersFromModel(dragStartModel);
            fixedCorner = initialCorners[(index + 2) % 4];

            const pointerLocal = gateLatLngToLocal(
              dragStartModel.center,
              initialCorners[index]
            );

            initialPointerAngle = Math.atan2(
              pointerLocal.y,
              pointerLocal.x
            );
          });

          marker.on('drag', (event) => {
            if (!dragStartModel) return;

            const currentFeature = gateFeatureData.features.find(
              (item) => String(item.id) === String(selectedGate.id)
            );

            if (!currentFeature) return;

            if (event.originalEvent?.shiftKey && initialPointerAngle !== null) {
              const pointerLocal = gateLatLngToLocal(
                dragStartModel.center,
                marker.getLatLng()
              );

              const currentAngle = Math.atan2(
                pointerLocal.y,
                pointerLocal.x
              );

              const delta =
                (currentAngle - initialPointerAngle) * 180 / Math.PI;

              const nextRotation =
                Math.round((dragStartModel.rotation_deg + delta) * 1) / 1;

              updateGateFeatureGeometry(currentFeature, {
                ...dragStartModel,
                rotation_deg: nextRotation
              });
            } else {
              const pointerLocal = gateLatLngToLocal(
                dragStartModel.center,
                marker.getLatLng()
              );

              const pointerUnrotated = rotateLocalPoint(
                pointerLocal.x,
                pointerLocal.y,
                -dragStartModel.rotation_deg
              );

              const oppositeLocal = gateLatLngToLocal(
                dragStartModel.center,
                fixedCorner
              );

              const oppositeUnrotated = rotateLocalPoint(
                oppositeLocal.x,
                oppositeLocal.y,
                -dragStartModel.rotation_deg
              );

              const halfWidth = Math.max(
                0.25,
                Math.abs(pointerUnrotated.x - oppositeUnrotated.x) / 2
              );

              const halfHeight = Math.max(
                0.25,
                Math.abs(pointerUnrotated.y - oppositeUnrotated.y) / 2
              );

              const newCenterLocal = {
                x: (pointerUnrotated.x + oppositeUnrotated.x) / 2,
                y: (pointerUnrotated.y + oppositeUnrotated.y) / 2
              };

              const centerOffset = rotateLocalPoint(
                newCenterLocal.x,
                newCenterLocal.y,
                dragStartModel.rotation_deg
              );

              updateGateFeatureGeometry(currentFeature, {
                center: gateLocalToLatLng(
                  dragStartModel.center,
                  centerOffset.x,
                  centerOffset.y
                ),
                width_m: halfWidth * 2,
                height_m: halfHeight * 2,
                rotation_deg: dragStartModel.rotation_deg
              });
            }

            selectedGate = currentFeature;
            refreshGateLayerGeometry(currentFeature);
          });

          marker.on('dragend', () => {
            rebuildPedestrianRouting();
            refreshGateHandles();
          });
          gateHandleMarkers.push(marker);
        });

        /*
         * Fifth point: center handle moves the entire gate without changing
         * size or rotation.
         */
        const centerMarker = L.marker(model.center, {
          icon: gateHandleIcon('move'),
          draggable: false,
          zIndexOffset: 1801,
          keyboard: false,
          bubblingMouseEvents: false
        }).addTo(map);

        const centerElement = centerMarker.getElement();

        if (centerElement) {
          centerElement.style.touchAction = 'none';
          centerElement.style.userSelect = 'none';
        }

        let centerPointerId = null;
        let centerPointerStart = null;
        let centerDragStartModel = null;
        let centerDragMapWasEnabled = true;

        const finishCenterDrag = (event) => {
          if (centerPointerId === null) return;
          if (event?.pointerId !== undefined && event.pointerId !== centerPointerId) return;

          event?.preventDefault?.();
          event?.stopPropagation?.();

          try {
            centerElement?.releasePointerCapture?.(centerPointerId);
          } catch {
            // Pointer capture may already be released.
          }

          centerPointerId = null;
          centerPointerStart = null;
          centerDragStartModel = null;

          if (centerDragMapWasEnabled) {
            map.dragging.enable();
          }

          refreshGateHandles();
        };

        const handleCenterPointerDown = (event) => {
          if (centerPointerId !== null) return;
          if (event.button !== undefined && event.button !== 0) return;

          const feature = gateFeatureData.features.find(
            (item) => String(item.id) === String(selectedGate.id)
          );

          const currentModel = gateModelForFeature(feature);
          if (!feature || !currentModel) return;

          event.preventDefault();
          event.stopPropagation();

          centerPointerId = event.pointerId ?? 1;
          centerPointerStart = map.mouseEventToLatLng(event);
          centerDragStartModel = currentModel;
          centerDragMapWasEnabled = map.dragging.enabled();

          map.dragging.disable();
          centerElement?.setPointerCapture?.(centerPointerId);
        };

        const handleCenterPointerMove = (event) => {
          if (centerPointerId === null || event.pointerId !== centerPointerId) return;
          if (!centerDragStartModel || !centerPointerStart) return;

          event.preventDefault();
          event.stopPropagation();

          const currentPointer = map.mouseEventToLatLng(event);
          const delta = gateLatLngToLocal(
            centerPointerStart,
            currentPointer
          );

          const nextCenter = gateLocalToLatLng(
            centerDragStartModel.center,
            delta.x,
            delta.y
          );

          const feature = gateFeatureData.features.find(
            (item) => String(item.id) === String(selectedGate.id)
          );

          if (!feature) return;

          updateGateFeatureGeometry(feature, {
            ...centerDragStartModel,
            center: nextCenter
          });

          selectedGate = feature;
          refreshGateLayerGeometry(feature);

          centerMarker.setLatLng(nextCenter);
        };

        centerElement?.addEventListener('pointerdown', handleCenterPointerDown, { passive: false });
        centerElement?.addEventListener('pointermove', handleCenterPointerMove, { passive: false });
        centerElement?.addEventListener('pointerup', finishCenterDrag, { passive: false });
        centerElement?.addEventListener('pointercancel', finishCenterDrag, { passive: false });

        gateHandleMarkers.push(centerMarker);
      };

      const selectGateForEdit = (feature) => {
        if (!editModeEnabled || gateModeActive || !feature) return;

        selectedGate = feature;
        showGateCard(true);
        gateStatus.textContent =
          (feature.properties?.name || 'Unnamed Gate') + ' · 5-point edit';

        gateNew.hidden = false;
        gateRename.hidden = false;
        gateRotateLeft.hidden = false;
        gateRotateRight.hidden = false;
        gateDelete.hidden = false;

        refreshGateHandles();
      };

      const updateGatePreview = (bounds) => {
        if (!gatePreview) {
          gatePreview = L.rectangle(bounds, {
            pane: 'gatePane',
            color: '#2563eb',
            weight: 2,
            dashArray: '6 5',
            fillColor: '#2563eb',
            fillOpacity: 0.12,
            interactive: false
          }).addTo(map);
        } else {
          gatePreview.setBounds(bounds);
        }
      };

      const startGateMode = () => {
        if (!editModeEnabled) return;

        if (routeModeActive) {
          clearRouteTest(false);
        }

        if (pointEditorActive || drawingModeActive) {
          closeEditTools();
        }

        editToggle?.classList.remove('is-active');
        editToggle?.setAttribute('aria-pressed', 'false');

        clearGatePreview();
        clearGateHandles();
        selectedGate = null;
        gateModeActive = true;

        gateToggle?.classList.add('is-active');
        gateToggle?.setAttribute('aria-pressed', 'true');
        gateStatus.textContent = 'Drag on the map to create a rectangular gate';
        gateNew.hidden = false;
        gateRename.hidden = true;
        gateRotateLeft.hidden = true;
        gateRotateRight.hidden = true;
        gateDelete.hidden = true;
        showGateCard(true);
      };

      const closeGateTools = () => {
        if (gatePointerId !== null) {
          try {
            map.getContainer().releasePointerCapture(gatePointerId);
          } catch {
            // Pointer capture may already be released.
          }
        }

        gatePointerId = null;
        gatePointerStart = null;
        clearGatePreview();
        clearGateHandles();
        selectedGate = null;
        gateModeActive = false;
        gateToggle?.classList.remove('is-active');
        gateToggle?.setAttribute('aria-pressed', 'false');
        showGateCard(false);
        gateRename.hidden = true;
        gateRotateLeft.hidden = true;
        gateRotateRight.hidden = true;
        gateDelete.hidden = true;
        if (map.dragging && !map.dragging.enabled()) {
          map.dragging.enable();
        }
        map.getContainer().classList.remove('is-gate-drawing');
      };

      const createGateFromBounds = (bounds, name) => {
        const centerPoint = bounds.getCenter();
        const sw = bounds.getSouthWest();
        const nw = bounds.getNorthWest();
        const ne = bounds.getNorthEast();
        const se = bounds.getSouthEast();
        const gateId = 'gate-' + Date.now();

        const feature = {
          type: 'Feature',
          id: gateId,
          properties: {
            type: 'gate',
            name,
            center: [
              Number(centerPoint.lng.toFixed(7)),
              Number(centerPoint.lat.toFixed(7))
            ],
            width_m: Number(
              bounds.getSouthWest().distanceTo(bounds.getSouthEast()).toFixed(3)
            ),
            height_m: Number(
              bounds.getSouthWest().distanceTo(bounds.getNorthWest()).toFixed(3)
            ),
            rotation_deg: 0
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [Number(sw.lng.toFixed(7)), Number(sw.lat.toFixed(7))],
              [Number(nw.lng.toFixed(7)), Number(nw.lat.toFixed(7))],
              [Number(ne.lng.toFixed(7)), Number(ne.lat.toFixed(7))],
              [Number(se.lng.toFixed(7)), Number(se.lat.toFixed(7))],
              [Number(sw.lng.toFixed(7)), Number(sw.lat.toFixed(7))]
            ]]
          }
        };

        feature.properties.access_point = [
          Number(centerPoint.lng.toFixed(7)),
          Number(centerPoint.lat.toFixed(7))
        ];

        gateFeatureData.features.push(feature);
        selectedGate = feature;

        // Creation is complete. Keep the selected gate in edit state so the
        // five handles and rotation controls are immediately usable.
        gateModeActive = false;
        gateToggle?.classList.remove('is-active');
        gateToggle?.setAttribute('aria-pressed', 'false');

        markGateEditsDirty();
        refreshGateLayer();

        gateStatus.textContent = name + ' · 5-point edit';
        gateNew.hidden = false;
        gateRename.hidden = false;
        gateRotateLeft.hidden = false;
        gateRotateRight.hidden = false;
        gateDelete.hidden = false;

        refreshGateHandles();
        rebuildPedestrianRouting();
      };

      const cancelGateName = () => {
        showGateNameModal(false);
        clearGatePreview();
        pendingGateBounds = null;
      };

      const confirmGateName = () => {
        const name = gateNameInput?.value.trim();

        if (!name) {
          gateNameInput?.focus();
          return;
        }

        if (gateNameEditId) {
          const feature = gateFeatureData.features.find(
            (item) => String(item.id) === String(gateNameEditId)
          );

          if (feature) {
            feature.properties = {
              ...(feature.properties || {}),
              type: 'gate',
              name
            };
            markGateEditsDirty();
            selectedGate = feature;
            gateStatus.textContent = name + ' · 5-point edit';
          }
        } else if (pendingGateBounds) {
          createGateFromBounds(pendingGateBounds, name);
        }

        showGateNameModal(false);
        clearGatePreview();
        pendingGateBounds = null;
      };

      const beginGatePointer = (event) => {
        if (
          !gateModeActive ||
          selectedGate ||
          gateNameModal?.classList.contains('is-open') ||
          gatePointerId !== null
        ) return;
        if (event.button !== undefined && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        gatePointerId = event.pointerId ?? 1;
        gatePointerStart = map.mouseEventToLatLng(event);
        pendingGateBounds = null;

        map.dragging.disable();
        map.getContainer().classList.add('is-gate-drawing');
        map.getContainer().setPointerCapture?.(gatePointerId);
      };

      const moveGatePointer = (event) => {
        if (!gateModeActive || gatePointerId !== event.pointerId || !gatePointerStart) return;

        event.preventDefault();
        event.stopPropagation();

        const current = map.mouseEventToLatLng(event);
        const bounds = L.latLngBounds(gatePointerStart, current);
        pendingGateBounds = bounds;
        updateGatePreview(bounds);
      };

      const finishGatePointer = (event) => {
        if (gatePointerId !== event.pointerId || !gatePointerStart) return;

        event.preventDefault();
        event.stopPropagation();

        const current = map.mouseEventToLatLng(event);
        const bounds = L.latLngBounds(gatePointerStart, current);
        /*
         * Gates are small campus access objects. Use a meter-based minimum
         * instead of a raw degree threshold so tiny rectangles are still
         * valid and behave consistently at this latitude.
         */
        const gateWidthMeters = L.latLng(
          bounds.getSouth(),
          bounds.getWest()
        ).distanceTo(
          L.latLng(bounds.getSouth(), bounds.getEast())
        );
        const gateHeightMeters = L.latLng(
          bounds.getSouth(),
          bounds.getWest()
        ).distanceTo(
          L.latLng(bounds.getNorth(), bounds.getWest())
        );
        const minimumGateSizeMeters = 0.5;

        try {
          map.getContainer().releasePointerCapture?.(gatePointerId);
        } catch {
          // Ignore a pointer capture that was already released.
        }

        gatePointerId = null;
        gatePointerStart = null;
        map.dragging.enable();
        map.getContainer().classList.remove('is-gate-drawing');

        if (
          gateWidthMeters < minimumGateSizeMeters ||
          gateHeightMeters < minimumGateSizeMeters
        ) {
          clearGatePreview();
          gateStatus.textContent = 'Drag a slightly larger gate rectangle';
          return;
        }

        pendingGateBounds = bounds;
        updateGatePreview(bounds);
        showGateNameModal(true, 'create');
      };

      const rotateSelectedGate = (deltaDegrees) => {
        if (!editModeEnabled || !selectedGate) return;

        const feature = gateFeatureData.features.find(
          (item) => String(item.id) === String(selectedGate.id)
        );

        const model = gateModelForFeature(feature);
        if (!feature || !model) return;

        let nextRotation = model.rotation_deg + deltaDegrees;

        while (nextRotation > 180) nextRotation -= 360;
        while (nextRotation <= -180) nextRotation += 360;

        model.rotation_deg = Number(nextRotation.toFixed(1));

        updateGateFeatureGeometry(feature, model);
        selectedGate = feature;

        /*
         * Update the polygon first, then recreate the five handles from the
         * new geometry. This guarantees the visual gate and handles stay in
         * sync for every 1-degree rotation.
         */
        refreshGateLayerGeometry(feature);
        refreshGateHandles();
        rebuildPedestrianRouting();

        gateStatus.textContent =
          (feature.properties?.name || 'Unnamed Gate') +
          ' · rotation ' + model.rotation_deg.toFixed(1) + '°';
      };

      const deleteSelectedGate = () => {
        if (!selectedGate) return;

        const deletedName = selectedGate.properties?.name || 'Gate';

        gateFeatureData.features = gateFeatureData.features.filter(
          (feature) => String(feature.id) !== String(selectedGate.id)
        );

        selectedGate = null;
        clearGateHandles();
        markGateEditsDirty();
        refreshGateLayer();
        rebuildPedestrianRouting();
        gateStatus.textContent = deletedName + ' deleted';
        gateRename.hidden = true;
        gateRotateLeft.hidden = true;
        gateRotateRight.hidden = true;
        gateDelete.hidden = true;
      };

      gateNameCancel?.addEventListener('click', cancelGateName);
      gateNameCancelButton?.addEventListener('click', cancelGateName);
      gateNameConfirm?.addEventListener('click', confirmGateName);
      gateNameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmGateName();
        }
      });

      gateToggle?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!editModeEnabled || gateToggle.disabled) return;

        if (gateModeActive) {
          closeGateTools();
          return;
        }

        startGateMode();
      });

      gateCancel?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeGateTools();
      });

      gateNew?.addEventListener('click', () => {
        startGateMode();
      });

      gateRotateLeft?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        rotateSelectedGate(-1);
      });

      gateRotateRight?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        rotateSelectedGate(1);
      });

      gateRename?.addEventListener('click', () => {
        if (!selectedGate) return;
        showGateNameModal(true, 'rename', selectedGate);
      });

      gateDelete?.addEventListener('click', deleteSelectedGate);

      const gateContainer = map.getContainer();

      const isPointerOnGateCenter = (event) => {
        if (!editModeEnabled || gateModeActive || !selectedGate) return false;
        if (event.button !== undefined && event.button !== 0) return false;
        if (gateNameModal?.classList.contains('is-open')) return false;

        const feature = gateFeatureData.features.find(
          (item) => String(item.id) === String(selectedGate.id)
        );
        const model = gateModelForFeature(feature);

        if (!feature || !model) return false;

        const rect = gateContainer.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const centerPoint = map.latLngToContainerPoint(model.center);

        return Math.hypot(
          pointerX - centerPoint.x,
          pointerY - centerPoint.y
        ) <= 24;
      };

      const beginCenterGatePointer = (event) => {
        if (centerGatePointerId !== null) return;
        if (!isPointerOnGateCenter(event)) return;

        const feature = gateFeatureData.features.find(
          (item) => String(item.id) === String(selectedGate.id)
        );
        const model = gateModelForFeature(feature);

        if (!feature || !model) return;

        event.preventDefault();
        event.stopPropagation();

        centerGatePointerId = event.pointerId ?? 1;
        centerGatePointerStart = map.mouseEventToLatLng(event);
        centerGateDragStartModel = model;
        centerGateMapWasEnabled = map.dragging.enabled();

        map.dragging.disable();
        gateContainer.classList.add('is-gate-moving');
        gateContainer.setPointerCapture?.(centerGatePointerId);
      };

      const moveCenterGatePointer = (event) => {
        if (
          centerGatePointerId === null ||
          event.pointerId !== centerGatePointerId ||
          !centerGatePointerStart ||
          !centerGateDragStartModel
        ) return;

        event.preventDefault();
        event.stopPropagation();

        const currentPointer = map.mouseEventToLatLng(event);
        const delta = gateLatLngToLocal(
          centerGatePointerStart,
          currentPointer
        );

        const nextCenter = gateLocalToLatLng(
          centerGateDragStartModel.center,
          delta.x,
          delta.y
        );

        const feature = gateFeatureData.features.find(
          (item) => String(item.id) === String(selectedGate.id)
        );

        if (!feature) return;

        updateGateFeatureGeometry(feature, {
          ...centerGateDragStartModel,
          center: nextCenter
        });

        selectedGate = feature;

        const centerMarker = gateHandleMarkers[gateHandleMarkers.length - 1];
        centerMarker?.setLatLng(nextCenter);

        refreshGateLayerGeometry(feature);
      };

      const finishCenterGatePointer = (event) => {
        if (
          centerGatePointerId === null ||
          (event.pointerId !== undefined && event.pointerId !== centerGatePointerId)
        ) return;

        event.preventDefault?.();
        event.stopPropagation?.();

        try {
          gateContainer.releasePointerCapture?.(centerGatePointerId);
        } catch {
          // Pointer capture may already be released.
        }

        centerGatePointerId = null;
        centerGatePointerStart = null;
        centerGateDragStartModel = null;
        gateContainer.classList.remove('is-gate-moving');

        if (centerGateMapWasEnabled) {
          map.dragging.enable();
        }

        refreshGateHandles();
        rebuildPedestrianRouting();
      };

      gateContainer.addEventListener('pointerdown', beginCenterGatePointer, true);
      gateContainer.addEventListener('pointermove', moveCenterGatePointer, true);
      gateContainer.addEventListener('pointerup', finishCenterGatePointer, true);
      gateContainer.addEventListener('pointercancel', finishCenterGatePointer, true);

      gateContainer.addEventListener('pointerdown', beginGatePointer, true);
      gateContainer.addEventListener('pointermove', moveGatePointer, true);
      gateContainer.addEventListener('pointerup', finishGatePointer, true);
      gateContainer.addEventListener('pointercancel', finishGatePointer, true);

      const showDeletePointModal = (visible = true) => {
        deletePointModal?.classList.toggle('is-open', visible);
        deletePointModal?.setAttribute('aria-hidden', String(!visible));
      };

      const mergeDeletedPoint = (target, feature, coordinates) => {
        if (coordinates.length <= 2) {
          pedestrianPathData.features = (pedestrianPathData.features || [])
            .filter((item) => String(item.id) !== String(feature.id));
          editStatus.textContent = 'Path deleted';
          return;
        }

        coordinates.splice(target.vertexIndex, 1);
        saveEditedFeatureGeometry(feature.id, coordinates);
        editStatus.textContent = 'Point deleted · lines merged';
      };

      const removeAttachedLines = (target, feature, coordinates) => {
        /*
         * Removing the two segments attached to a middle vertex splits the
         * original LineString into the valid path pieces on either side.
         */
        if (coordinates.length <= 2 || target.vertexIndex === 0 || target.vertexIndex === coordinates.length - 1) {
          pedestrianPathData.features = (pedestrianPathData.features || [])
            .filter((item) => String(item.id) !== String(feature.id));
          editStatus.textContent = 'Point and attached line deleted';
          return;
        }

        const left = coordinates.slice(0, target.vertexIndex);
        const right = coordinates.slice(target.vertexIndex + 1);

        pedestrianPathData.features = (pedestrianPathData.features || [])
          .filter((item) => String(item.id) !== String(feature.id));

        const sourceProperties = cloneJson(feature.properties || {});
        const makeSplitFeature = (points, suffix) => ({
          type: 'Feature',
          id: String(feature.id) + '-' + suffix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          properties: {
            category: pathTypeValues.includes(sourceProperties.category)
              ? sourceProperties.category
              : 'Pedestrian Path'
          },
          geometry: {
            type: 'LineString',
            coordinates: points.map((point) => [
              Number(point.lng.toFixed(7)),
              Number(point.lat.toFixed(7))
            ])
          }
        });

        if (left.length >= 2) {
          pedestrianPathData.features.push(makeSplitFeature(left, 'left'));
        }

        if (right.length >= 2) {
          pedestrianPathData.features.push(makeSplitFeature(right, 'right'));
        }

        editStatus.textContent = 'Point and attached lines deleted';
      };

      const deleteSelectedPoint = (mode = 'merge') => {
        if (!selectedPoint) return;

        const target = { ...selectedPoint };
        const feature = findEffectiveFeature(target.featureId);
        const coordinates = featureGeometryForEdit(feature);

        if (!feature || !coordinates || !coordinates[target.vertexIndex]) return;

        showDeletePointModal(false);
        selectedPoint = null;
        selectedPath = null;

        if (mode === 'drop') {
          removeAttachedLines(target, feature, coordinates);
        } else {
          mergeDeletedPoint(target, feature, coordinates);
        }

        markPathEditsDirty();
        refreshAfterPathChange();
        setEditActionVisibility({
          pointEditor: pointEditorActive
        });
      };

      const selectPathForEdit = (feature) => {
        if (!editModeEnabled || !feature?.geometry) return;

        if (feature.geometry.type !== 'LineString') {
          editStatus.textContent = 'Only line paths can be selected';
          showEditCard(true);
          return;
        }

        selectedPath = {
          id: feature.id,
          name: 'Pedestrian path'
        };
        setActivePathType(feature.properties?.category || 'Pedestrian Path');

        editStatus.textContent = 'Path selected · Delete path to remove';
        showEditCard(true);
        setEditActionVisibility({
          pointEditor: pointEditorActive,
          pathEditing: true,
          pathDeletable: true,
          pointSelected: Boolean(selectedPoint)
        });

        refreshEditableVertexSelection();
      };

      const deleteSelectedPath = () => {
        if (!selectedPath?.id) return;

        const targetId = String(selectedPath.id);
        const deletedName = selectedPath.name || 'Pedestrian path';

        pedestrianPathData.features = (pedestrianPathData.features || [])
          .filter((item) => String(item.id) !== targetId);

        selectedPath = null;
        selectedPoint = null;

        markPathEditsDirty();
        refreshAfterPathChange();
        editStatus.textContent = deletedName + ' deleted';
        setEditActionVisibility({
          pointEditor: pointEditorActive
        });
      };

      const buildEditableHitLayer = () => {
        if (editableHitLayer && map.hasLayer(editableHitLayer)) {
          map.removeLayer(editableHitLayer);
        }

        editableHitLayer = null;

        if (!editModeEnabled) return;

        editableHitLayer = L.geoJSON(pedestrianPathData, {
          style: {
            color: '#2563eb',
            weight: 15,
            opacity: 0
          },
          interactive: true,
          onEachFeature: (feature, layer) => {
            layer.on('click', (event) => {
              if (!editModeEnabled || drawingModeActive) return;

              event.originalEvent?.stopPropagation();
              event.originalEvent?.preventDefault();
              selectPathForEdit(feature);
            });
          }
        }).addTo(map);
      };

      savePathEdits?.addEventListener('click', saveCurrentPathEdits);
      saveGateEdits?.addEventListener('click', saveCurrentGateEdits);
      editNewPath?.addEventListener('click', startDrawingMode);
      editDeletePoint?.addEventListener('click', () => {
        if (drawingModeActive) return;
        if (selectedPoint) showDeletePointModal(true);
      });
      deletePointMerge?.addEventListener('click', () => deleteSelectedPoint('merge'));
      deletePointDrop?.addEventListener('click', () => deleteSelectedPoint('drop'));
      deletePointCancel?.addEventListener('click', () => showDeletePointModal(false));
      editDelete?.addEventListener('click', deleteSelectedPath);

      editModeToggle?.addEventListener('change', () => {
        syncEditModeUi();
        closeDeveloperOverlay();

        if (editModeEnabled) {
          pedestrianPathsActive = true;
          pedestrianPathCasing?.addTo(map);
          pedestrianPaths?.addTo(map);
          refreshGateLayer();
          buildEditableHitLayer();
        } else {
          closeEditTools();
          closeGateTools();
          clearEditableVertices();
          buildDefaultVertexMarkers();
          buildEditableHitLayer();
          refreshGateLayer();
        }
      });

      const handleEditToggle = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!editModeEnabled || !editToggle || editToggle.disabled) return;

        if (gateModeActive) {
          closeGateTools();
          startPointEditorMode();
          editToggle.focus({ preventScroll: true });
          return;
        }

        if (pointEditorActive || drawingModeActive) {
          closeEditTools();
          editToggle.focus({ preventScroll: true });
          return;
        }

        startPointEditorMode();
      };

      editToggle?.addEventListener('click', handleEditToggle);

      editUndo?.addEventListener('click', () => {
        if (!drawingModeActive || !drawingPoints.length) return;

        drawingPoints.pop();

        const marker = drawingMarkers.pop();
        if (marker) map.removeLayer(marker);

        renderDrawingLine();
        editStatus.textContent = drawingPoints.length
          ? drawingPoints.length + ' point' + (drawingPoints.length === 1 ? '' : 's')
          : 'Click the map to add points';
      });

      editFinish?.addEventListener('click', finishCustomPath);
      editCancel?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeEditTools();
      });

      if (pathEditFileStatus) {
        pathEditFileStatus.textContent = isCleanPedestrianEditFile
          ? 'Loaded'
          : 'Base fallback';
      }

      if (gateEditFileStatus) {
        gateEditFileStatus.textContent =
          gatesResponse?.ok ? 'Loaded' : 'Empty';
      }

      buildDefaultVertexMarkers();

      syncEditModeUi();
      refreshGateLayer();
      buildEditableHitLayer();

      map.on('click', (event) => {
        if (!editModeEnabled || !drawingModeActive || routeModeActive) return;

        /*
         * One click = one vertex in the new path.
         * Snapping uses live routing graph nodes first for gates/intersections,
         * then original vertices, then the nearest path segment.
         */
        const clicked = L.latLng(event.latlng.lat, event.latlng.lng);
        const snap = findDrawingSnap(clicked);
        const connected = snap.type !== 'free';
        const point = snap.latlng;

        drawingPoints.push(point);
        drawingMarkers.push(createEditPointMarker(point, drawingPoints.length));
        renderDrawingLine();
        clearDrawingSnap();

        // Drawing mode owns the controls: no delete/select action can appear.
        setEditActionVisibility({ drawing: true });

        const connectionText = {
          gate: 'connected to gate',
          hub: 'snapped to routing hub',
          vertex: 'connected to existing point',
          segment: 'connected to existing path'
        }[snap.type];

        editStatus.textContent = drawingPoints.length +
          ' point' + (drawingPoints.length === 1 ? '' : 's') +
          (connected
            ? ' · ' + (connectionText || 'connected to routing network')
            : ' · Finish when ready');
      });

      map.on('mousemove', (event) => {
        if (!editModeEnabled || !drawingModeActive || routeModeActive) {
          clearDrawingSnap();
          return;
        }

        updateDrawingSnapIndicator(event.latlng);
      });

      window.addEventListener('keydown', (event) => {
        if (
          editModeEnabled &&
          pointEditorActive &&
          !drawingModeActive &&
          selectedPoint &&
          (event.key === 'Delete' || event.key === 'Backspace') &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
        ) {
          event.preventDefault();
          deleteSelectedPoint();
        }
      });
      const devPanel = document.getElementById('devPanel');

      const closeDevPanel = () => {
        devPanel?.classList.remove('is-open');
        devPanel?.setAttribute('aria-hidden', 'true');
      };

      const toggleDevPanel = () => {
        const open = !devPanel?.classList.contains('is-open');
        devPanel?.classList.toggle('is-open', open);
        devPanel?.setAttribute('aria-hidden', String(!open));
      };

      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        if (devPanel?.classList.contains('is-open')) {
          closeDevPanel();
          return;
        }

        if (gateNameModal?.classList.contains('is-open')) {
          cancelGateName();
          return;
        }

        if (gateModeActive || gateCard?.classList.contains('is-open')) {
          closeGateTools();
          return;
        }

        if (editCard?.classList.contains('is-open')) {
          closeEditTools();
        }
      });

      const devPanelClose = document.getElementById('devPanelClose');

      devPanel?.addEventListener('click', (event) => {
        if (event.target === devPanel) {
          closeDevPanel();
        }
      });

      document.getElementById('resetMapView')?.addEventListener('click', () => {
        map.setView(center, perimeterZoom, { animate: true });
      });

      document.querySelectorAll('[data-map-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.getAttribute('data-map-action');

          if (action === 'zoom-in') {
            map.setZoom(Math.min(maxZoom, map.getZoom() + 1), { animate: true });
            return;
          }

          if (action === 'zoom-out') {
            map.setZoom(Math.max(perimeterZoom, map.getZoom() - 1), { animate: true });
          }
        });
      });

      document.getElementById('locateBtn')?.addEventListener('click', () => {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const location = L.latLng(coords.latitude, coords.longitude);

            if (center.distanceTo(location) > radius) return;

            map.setView(location, Math.max(map.getZoom(), perimeterZoom));
          },
          () => alert('Location permission was not granted.')
        );
      });

      void buildingLabels;
    });