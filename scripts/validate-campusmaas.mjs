import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const readJson = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
};

const uniqueIds = (items, label, getId = (item) => item?.id) => {
  const seen = new Set();
  for (const item of items) {
    const id = String(getId(item) ?? '').trim();
    if (!id) {
      errors.push(`${label}: item has no ID.`);
    } else if (seen.has(id)) {
      errors.push(`${label}: duplicate ID "${id}".`);
    }
    seen.add(id);
  }
  return seen;
};

const validClock = (value) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const gates = readJson('maps/gates.geojson');
const paths = readJson('maps/pedestrian_paths_edits.geojson');
const access = readJson('maps/campus_access_rules.json');
const vendorsData = readJson('maps/campus_vendors.json');

const gateIds = new Set(
  (gates?.features ?? []).map((feature) => String(feature?.id ?? '')).filter(Boolean)
);
const pathIds = new Set(
  (paths?.features ?? []).map((feature, index) =>
    String(feature?.id ?? feature?.properties?.['@id'] ?? feature?.properties?.id ?? `path-${index + 1}`)
  )
);

for (const [label, collection] of [['gates', gates], ['pedestrian paths', paths]]) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    errors.push(`${label} must be a GeoJSON FeatureCollection with a features array.`);
  }
}

if (gates?.features) uniqueIds(gates.features, 'Gate data');
if (paths?.features) uniqueIds(paths.features, 'Pedestrian path data', (feature, index) =>
  feature?.id ?? feature?.properties?.['@id'] ?? feature?.properties?.id ?? `path-${index + 1}`
);

const groups = new Set(['all', 'students', 'boys', 'girls', 'hostellers', 'day_scholars', 'staff', 'faculty', 'visitors']);
const modes = new Set(['preferred', 'allow', 'deny', 'allow_only_during', 'deny_during']);
const directions = new Set(['in_out', 'in', 'out']);
const days = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

if (access) {
  if (access.version !== 1 || access.timezone !== 'Asia/Kolkata' || !Array.isArray(access.policies)) {
    errors.push('Access rules must use version 1, Asia/Kolkata, and a policies array.');
  }

  uniqueIds(access.policies ?? [], 'Access policies');

  for (const policy of access.policies ?? []) {
    const label = `Access policy "${policy?.id ?? '(missing ID)'}"`;
    if (!groups.has(policy?.group ?? 'all')) errors.push(`${label}: unsupported group.`);
    if (!modes.has(policy?.mode)) errors.push(`${label}: unsupported mode.`);
    if (!directions.has(policy?.direction ?? 'in_out')) errors.push(`${label}: unsupported direction.`);

    const targetType = policy?.target?.type;
    const targetId = String(policy?.target?.id ?? '');
    if (targetType === 'gate' && !gateIds.has(targetId)) {
      errors.push(`${label}: gate target "${targetId}" does not exist.`);
    } else if (targetType === 'path' && !pathIds.has(targetId)) {
      errors.push(`${label}: path target "${targetId}" does not exist.`);
    } else if (!['gate', 'path'].includes(targetType)) {
      errors.push(`${label}: target type must be gate or path.`);
    }

    if (Array.isArray(policy?.days)) {
      for (const day of policy.days) {
        if (!days.has(day)) errors.push(`${label}: invalid day "${day}".`);
      }
    }

    const windows = Array.isArray(policy?.windows) ? policy.windows : [];
    for (const window of windows) {
      if (!validClock(window?.start) || !validClock(window?.end)) {
        errors.push(`${label}: time windows must use HH:MM in 24-hour time.`);
      } else if (window.start >= window.end) {
        errors.push(`${label}: window start must be earlier than its end; overnight windows need explicit support.`);
      }
    }

    if (['allow_only_during', 'deny_during'].includes(policy?.mode) && windows.length === 0) {
      errors.push(`${label}: "${policy.mode}" requires at least one time window.`);
    }
  }

  const explicitGroups = new Set((access.policies ?? []).map((policy) => policy?.group));
  if (!explicitGroups.has('boys')) warnings.push('No explicit boys policy exists; boys currently rely on applicable generic policies.');
  if (!explicitGroups.has('girls')) warnings.push('No explicit girls policy exists; girls currently rely on applicable generic policies.');
}

if (vendorsData) {
  if (vendorsData.version !== 1 || !Array.isArray(vendorsData.vendors)) {
    errors.push('Vendor catalogue must use version 1 and contain a vendors array.');
  }

  uniqueIds(vendorsData.vendors ?? [], 'Vendors');
  const optionIds = new Set();

  for (const vendor of vendorsData.vendors ?? []) {
    if (!String(vendor?.name ?? '').trim()) errors.push(`Vendor "${vendor?.id ?? '(missing ID)'}" has no name.`);
    if (!Array.isArray(vendor?.options)) {
      errors.push(`Vendor "${vendor?.id ?? '(missing ID)'}" must contain an options array.`);
      continue;
    }

    for (const option of vendor.options) {
      const optionId = String(option?.id ?? '');
      if (!optionId || optionIds.has(optionId)) errors.push(`Vendor option ID "${optionId || '(missing)'}" is missing or duplicated.`);
      optionIds.add(optionId);
      if (!String(option?.name ?? '').trim()) errors.push(`Vendor option "${optionId}" has no name.`);
      if (Number(option?.price) < 0 || !Number.isFinite(Number(option?.price))) errors.push(`Vendor option "${optionId}" has an invalid price.`);
      if (Number(option?.service_minutes) < 0 || !Number.isFinite(Number(option?.service_minutes))) errors.push(`Vendor option "${optionId}" has invalid service minutes.`);
      if (!['online', 'offline', 'busy'].includes(String(option?.status ?? 'online').toLowerCase())) {
        errors.push(`Vendor option "${optionId}" has an unsupported status.`);
      }

      if (vendor.id === 'food' && option.enabled !== false) {
        const menu = readJson(`maps/food_menus/${optionId}.json`);
        if (menu && (menu.version !== 1 || menu.vendor_id !== 'food' || menu.service_id !== optionId || !Array.isArray(menu.menu))) {
          errors.push(`Food menu for "${optionId}" has an invalid schema or mismatched IDs.`);
        }
        if (menu?.menu) {
          uniqueIds(menu.menu, `Food menu "${optionId}"');
          for (const item of menu.menu) {
            if (!String(item?.name ?? '').trim()) errors.push(`Food menu "${optionId}" contains an unnamed item.`);
            if (!Number.isFinite(Number(item?.price)) || Number(item.price) < 0) errors.push(`Food item "${item?.id ?? '(missing ID)'}" has an invalid price.`);
          }
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`CampusMaaS validation failed: ${errors.length} error(s), ${warnings.length} warning(s).\n`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  process.exitCode = 1;
} else {
  console.log('CampusMaaS data validation passed.');
  console.log('Checked GeoJSON, access rules, group coverage, vendor catalogue, and food menus.');
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
}
