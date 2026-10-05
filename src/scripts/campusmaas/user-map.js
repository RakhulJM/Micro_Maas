import L from 'leaflet';

const PATH_COLORS = Object.freeze({
  'Main Road': '#e85d04',
  'Road': '#f2b134',
  'Ground': '#4f9d69',
  'Pedestrian Path': '#2563eb'
});

const PATH_WIDTHS = Object.freeze({
  'Main Road': 5.2,
  'Road': 4.3,
  'Ground': 4.4,
  'Pedestrian Path': 3.8
});

const normalizeCategory = (feature) => {
  const value = String(feature?.properties?.category || '').trim();

  if (PATH_COLORS[value]) return value;

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

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const distanceMeters = (a, b) =>
  L.latLng(Number(a[1]), Number(a[0]))
    .distanceTo(L.latLng(Number(b[1]), Number(b[0])));

const getRoadKind = (feature) =>
  String(feature?.properties?.highway || '').toLowerCase();

const isRoad = (feature) =>
  Boolean(feature?.properties?.highway || feature?.properties?.route);

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

const roadStyle = (feature, casing = false) => {
  const kind = getRoadKind(feature);
  const width = roadWidth[kind] || 3.5;
  const major = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(kind);
  const mainExternalRoad =
    feature?.id === 'way/129894647' ||
    feature?.properties?.ref === 'MDR1137';

  return {
    color: casing
      ? '#c7c5c0'
      : (mainExternalRoad ? '#111827' : (major ? '#e9c67b' : '#ffffff')),
    weight: casing ? width + 2.2 : width,
    opacity: 0.96,
    lineCap: 'round',
    lineJoin: 'round'
  };
};

const buildingLabelSizing = (map, items) => {
  const clamp = (value) => Math.max(8, Math.min(16, value));

  const measureTextAtOnePx = (text) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) return Math.max(1, text.length * 0.55);

    context.font = "500 1px 'DM Sans', sans-serif";
    return Math.max(1, context.measureText(text).width);
  };

  const update = () => {
    const zoom = map.getZoom();

    for (const item of items) {
      const northWest = map.project(item.bounds.getNorthWest(), zoom);
      const southEast = map.project(item.bounds.getSouthEast(), zoom);

      const buildingWidth = Math.max(1, Math.abs(southEast.x - northWest.x));
      const buildingHeight = Math.max(1, Math.abs(southEast.y - northWest.y));

      const availableWidth = buildingWidth * 0.82;
      const availableHeight = buildingHeight * 0.48;
      const textWidthAtOnePx = measureTextAtOnePx(item.name);

      item.label.style.setProperty(
        '--building-label-size',
        clamp(Math.min(
          availableWidth / textWidthAtOnePx,
          availableHeight
        )) + 'px'
      );

      item.label.style.setProperty(
        '--building-label-width',
        availableWidth + 'px'
      );
    }
  };

  return update;
};

const start = async () => {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  const [placesResponse, pathResponse, gatesResponse, perimeterResponse] =
    await Promise.all([
      fetch('/maps/export_places.geojson', { cache: 'no-store' }),
      fetch('/maps/pedestrian_paths_edits.geojson', { cache: 'no-store' }),
      fetch('/maps/gates.geojson', { cache: 'no-store' }),
      fetch('/maps/perimeter.geojson', { cache: 'no-store' })
    ]);

  if (
    !placesResponse.ok ||
    !pathResponse.ok ||
    !gatesResponse.ok ||
    !perimeterResponse.ok
  ) {
    throw new Error('CampusMaaS user map data could not be loaded.');
  }

  const [places, pathData, gates, perimeter] = await Promise.all([
    placesResponse.json(),
    pathResponse.json(),
    gatesResponse.json(),
    perimeterResponse.json()
  ]);

  const perimeterFeature = perimeter?.features?.[0];
  const perimeterCoordinates = perimeterFeature?.geometry?.coordinates?.[0];
  const centerCoordinates = perimeterFeature?.properties?.center;
  const radius = Number(perimeterFeature?.properties?.radius_m) || 1000;

  if (!Array.isArray(perimeterCoordinates) || !Array.isArray(centerCoordinates)) {
    throw new Error('CampusMaaS perimeter data is invalid.');
  }

  const center = L.latLng(
    Number(centerCoordinates[1]),
    Number(centerCoordinates[0])
  );

  const latRadius = radius / 111320;
  const lonRadius =
    radius / (111320 * Math.cos(center.lat * Math.PI / 180));

  const circleBounds = L.latLngBounds(
    [center.lat - latRadius, center.lng - lonRadius],
    [center.lat + latRadius, center.lng + lonRadius]
  );

  const map = L.map(mapElement, {
    zoomControl: false,
    attributionControl: false,
    minZoom: 18,
    maxZoom: 25,
    scrollWheelZoom: true,
    maxBounds: circleBounds,
    maxBoundsViscosity: 1
  }).setView(center, 18);

  mapElement.setAttribute('aria-label', 'CampusMaaS campus map');

  const colors = {
    building: '#dedbd4',
    buildingEdge: '#bdb8af',
    water: '#b9dce7',
    green: '#d9e6d2',
    park: '#d3e4cc',
    land: '#eef0ee'
  };

  const baseLayer = L.geoJSON(places, {
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
    },
    interactive: false
  }).addTo(map);

  const roadCasing = L.geoJSON(places, {
    filter: isRoad,
    style: (feature) => roadStyle(feature, true),
    interactive: false
  }).addTo(map);

  const roads = L.geoJSON(places, {
    filter: isRoad,
    style: (feature) => roadStyle(feature),
    interactive: false
  }).addTo(map);

  const pedestrianCasing = L.geoJSON(pathData, {
    style: (feature) => ({
      color: '#ffffff',
      weight: (PATH_WIDTHS[normalizeCategory(feature)] || 3.8) + 3.2,
      opacity: 0.96,
      lineCap: 'round',
      lineJoin: 'round'
    }),
    interactive: false
  }).addTo(map);

  const pedestrianPaths = L.geoJSON(pathData, {
    style: (feature) => {
      const category = normalizeCategory(feature);

      return {
        color: PATH_COLORS[category],
        weight: PATH_WIDTHS[category],
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      };
    },
    interactive: false
  }).addTo(map);

  const gateLayer = L.geoJSON(gates, {
    style: {
      color: '#475569',
      weight: 2,
      opacity: 0.95,
      fillColor: '#ffffff',
      fillOpacity: 0.18
    },
    interactive: false
  }).addTo(map);

  const buildingLabels = [];

  for (const feature of places?.features || []) {
    const name = feature?.properties?.name;
    const building = feature?.properties?.building;
    const geometry = feature?.geometry;

    if (!name || !building || !geometry?.coordinates) continue;

    const tempLayer = L.geoJSON(feature);
    const bounds = tempLayer.getBounds();

    if (!bounds.isValid()) continue;

    const marker = L.marker(bounds.getCenter(), {
      icon: L.divIcon({
        className: 'building-label',
        html:
          '<span style="--building-label-size:8px;--building-label-width:20px">' +
          escapeHtml(name) +
          '</span>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      interactive: false,
      keyboard: false
    }).addTo(map);

    const label = marker.getElement()?.querySelector('span');

    if (label) {
      buildingLabels.push({
        name: String(name),
        bounds,
        label
      });
    }
  }

  const outer = [
    [center.lat - 1, center.lng - 1],
    [center.lat - 1, center.lng + 1],
    [center.lat + 1, center.lng + 1],
    [center.lat + 1, center.lng - 1]
  ];

  const inner = perimeterCoordinates
    .map(([lng, lat]) => [Number(lat), Number(lng)])
    .reverse();

  L.polygon([outer, inner], {
    stroke: false,
    fillColor: '#eef1f3',
    fillOpacity: 0.9,
    interactive: false
  }).addTo(map);

  /*
   * Keep all final map datasets in a deterministic stack:
   * places → roads → pedestrian casing → 4-color pedestrian network → gates
   * → perimeter mask.
   */
  void baseLayer;
  void roadCasing;
  void roads;
  void pedestrianCasing;
  void pedestrianPaths;
  void gateLayer;

  const updateLabels = buildingLabelSizing(map, buildingLabels);

  map.on('zoomend', updateLabels);
  map.whenReady(() => {
    requestAnimationFrame(() => {
      map.invalidateSize({ pan: false, debounceMoveend: true });
      requestAnimationFrame(updateLabels);
    });
  });
};

void start().catch((error) => {
  console.error(error);
});
