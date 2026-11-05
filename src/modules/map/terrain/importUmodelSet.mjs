import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';

const MAX_ASSET = 32 * 1024 * 1024;
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const glassParentNameAliases = new Map([
  [
    normalize('SM_MTX_Env_PB_Atre_Breakfast_Window_01_Glass'),
    [normalize('SM_MTX_Env_PB_Atre_BreakfastRoom_Window_01')],
  ],
  [
    normalize('SM_Env_PB_Atre_Window_Glass_04'),
    [normalize('SM_Env_PB_Atre_Outpost_Window_01'), normalize('SM_Env_PB_Atre_Outpost_Window_04')],
  ],
  [normalize('SM_Env_PB_Atre_Window_Glass_05'), [normalize('SM_Env_PB_Atre_Outpost_Window_02')]],
  [normalize('SM_Env_PB_Atre_Window_Glass_06'), [normalize('SM_Env_PB_Atre_Outpost_Window_03')]],
  [normalize('SM_Env_PB_Hark_Level3_WindowGlass'), [normalize('SM_Env_PB_Hark_Level3_Window')]],
]);
const explicitTemplateByAsset = new Map([
  ['smmtxenvpbneutdesertmechanicprudencedoor', ['MTX_Neut_DesertMechanic_Prudence_Door_Placeable']],
]);

/** Import one UModel set of GLTF meshes into the base preview catalog. */
export async function importUmodelSet({ sourceRoot, packName: requestedPackName, appendPack = false } = {}) {
  if (!sourceRoot) throw new Error('Pass the UModel export set directory as --source-root');
  const root = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
  const output = path.join(root, 'src/assets/models');
  const visualOutput = path.join(output, 'visual');
  const sourceSegments = path.resolve(sourceRoot).split(path.sep);
  const playerBuiltIndex = sourceSegments.findIndex((part) => part.toLowerCase() === 'playerbuilt');
  const factionFolder = playerBuiltIndex >= 0 ? sourceSegments[playerBuiltIndex + 1] : path.basename(sourceRoot);
  const factionKey = normalize(factionFolder ?? 'visual');
  const packName = requestedPackName ?? { atre: 'atreides', hark: 'harkonnen' }[factionKey] ?? factionKey;
  if (!/^[a-z0-9-]{1,80}$/.test(packName)) throw new Error('Invalid UModel pack name');
  const visualPackDirectory = `visual/${packName}-pack`;
  const visualPacks = path.join(root, 'src/assets/models', visualPackDirectory);
  await fs.mkdir(visualPacks, { recursive: true });
  const sourceDirectory = path.resolve(sourceRoot);
  const meshesRoot = sourceDirectory;
  const catalogPath = path.join(visualOutput, 'catalog.json.gz');
  const catalog = JSON.parse(gunzipSync(await fs.readFile(catalogPath)));
  const files = [];
  const collectMeshes = async (directory, relative = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!/^(?:collisions|physicsassets)$/i.test(entry.name)) await collectMeshes(child, childRelative);
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.gltf') &&
        !/(?:_COL|_UCX|_UBX|_MCDCX)\.gltf$/i.test(entry.name)
      ) {
        files.push({ name: entry.name, relative: childRelative });
      }
    }
  };
  await collectMeshes(meshesRoot);

  const nativeByName = new Map();
  for (const mesh of catalog.meshes) {
    // DLC/MTX building geometry is represented by aggregate meshes in the native catalog.
    if (!mesh.path || !['native', 'agg'].includes(mesh.source)) continue;
    const name = normalize(path.posix.basename(mesh.path));
    if (!nativeByName.has(name)) nativeByName.set(name, []);
    nativeByName.get(name).push(mesh);
  }
  // The shield surfaces use native collision proxies in the visual catalog. Those
  // fallback entries omit their source path, so recover their names from the native catalog.
  const nativeCatalog = JSON.parse(gunzipSync(await fs.readFile(path.join(output, 'native', 'catalog.json.gz'))));
  for (const [templateId, nativeRow] of Object.entries(nativeCatalog.rows)) {
    const nativeMesh = nativeCatalog.meshes[nativeRow.mesh];
    const visualRow = catalog.rows[templateId];
    if (!nativeMesh?.path || !visualRow || catalog.meshes[visualRow.mesh]?.source !== 'native') continue;
    const name = normalize(path.posix.basename(nativeMesh.path));
    if (!nativeByName.has(name)) nativeByName.set(name, []);
    const candidates = nativeByName.get(name);
    if (!candidates.some((candidate) => candidate.id === visualRow.mesh))
      candidates.push({ ...nativeMesh, id: visualRow.mesh });
  }

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
  const imported = [];
  const unmatched = [];
  const failures = [];

  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const assetName = path.parse(file.name).name;
    const normalizedAssetName = normalize(assetName);
    const isGlassAccessory = /(?:_Glass(?:_0[4-6])?|WindowGlass)$/i.test(assetName);
    const normalizedName = normalize(
      isGlassAccessory ? assetName.replace(/(?:_Glass(?:_0[4-6])?|WindowGlass)$/i, '') : assetName,
    );
    const aliasTargets = glassParentNameAliases.get(normalizedAssetName);
    const name = aliasTargets?.[0] ?? normalizedName;
    const matches = [
      ...new Map(
        (aliasTargets ?? [name]).flatMap((target) => nativeByName.get(target) ?? []).map((mesh) => [mesh.path, mesh]),
      ).values(),
    ];
    const templateIds = explicitTemplateByAsset.get(normalize(assetName)) ?? [];
    if (!matches.length && !templateIds.length) {
      unmatched.push(file.name);
      continue;
    }
    try {
      const inputPath = path.join(meshesRoot, file.relative);
      const document = await io.read(inputPath);
      let triangles = 0;
      for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          if (primitive.getMode() !== 4) throw new Error('Non-triangle visual primitive');
          triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3;
        }
      }
      if (!triangles || triangles > 1_000_000) throw new Error('Visual mesh complexity limit');

      // UModel uses red/gray dummy factors when a layered Dune material cannot be exported.
      // White lets the existing faction palette render without inventing surface textures.
      for (const material of document.getRoot().listMaterials()) {
        if (!material.getBaseColorTexture()) material.setBaseColorFactor([1, 1, 1, 1]);
        if (!material.getMetallicRoughnessTexture()) material.setMetallicFactor(0);
      }
      document
        .getRoot()
        .listExtensionsUsed()
        .find((extension) => extension.extensionName === 'KHR_draco_mesh_compression')
        ?.dispose();

      const bytes = Buffer.from(await io.writeBinary(document));
      if (bytes.length > MAX_ASSET) throw new Error('Decoded model too large');
      const jsonLength = bytes.readUInt32LE(12);
      const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
      for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
        if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('External GLB resource');
      }
      if ((gltf.extensionsRequired ?? []).includes('KHR_draco_mesh_compression'))
        throw new Error('Runtime Draco dependency');
      const sourceAssetPath = `/Game/DLC/MTX/Environment/PlayerBuilt/${factionFolder}/${file.relative
        .replaceAll(path.sep, '/')
        .replace(/\.gltf$/i, '')}`;
      imported.push({
        path: matches[0]?.path ?? sourceAssetPath,
        ...(isGlassAccessory ? { accessoryPaths: matches.map((mesh) => mesh.path) } : {}),
        nativeIds: isGlassAccessory ? [] : matches.map((mesh) => mesh.id),
        templateIds,
        bytes,
        triangles,
        images: gltf.images?.length ?? 0,
      });
    } catch (error) {
      failures.push({ file: file.name, reason: error instanceof Error ? error.message : 'Import failed' });
    }
  }

  if (!imported.length) throw new Error('No UModel meshes matched the native catalog');

  const firstPack = catalog.meshes.reduce(
    (next, mesh) => (mesh.source === 'native' ? next : Math.max(next, mesh.pack + 1)),
    0,
  );
  const packs = [];
  let packIndex = firstPack;
  let chunks = [];
  let packLength = 0;
  const modelFile = `${packName}-models.bin.gz`;
  const modelPath = path.join(visualPacks, modelFile);
  if (appendPack) {
    try {
      const existing = gunzipSync(await fs.readFile(modelPath));
      chunks.push(existing);
      packLength = existing.length;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const flush = () => {
    if (!packLength) return;
    const bytes = gzipSync(Buffer.concat(chunks), { level: 9 });
    if (bytes.length > MAX_ASSET) throw new Error('Visual pack exceeds transfer limit');
    packs.push({ index: packIndex++, bytes });
    chunks = [];
    packLength = 0;
  };

  const importedByNativeId = new Map();
  const importedByPath = new Map();
  const importedAccessoriesByPath = new Map();
  const importedByTemplateId = new Map();
  const legacyDesertMechanicDoorPath =
    '/Game/DLC/MTX/Environment/PlayerBuilt/DesertMechanicSet/Meshes/SM_MTX_Env_PB_Neut_DesertMechanic_PrudenceDoor';
  for (const mesh of catalog.meshes) {
    if (mesh.path === legacyDesertMechanicDoorPath)
      mesh.path = legacyDesertMechanicDoorPath.replace('/PlayerBuilt/', '/PlayerBuilt/Neut/');
  }
  for (const model of imported) {
    const id = catalog.meshes.length;
    const meta = {
      pack: packIndex,
      offset: packLength,
      length: model.bytes.length,
      tris: model.triangles,
      format: 'glb',
      source: 'umodel',
      path: model.path,
      file: `${visualPackDirectory}/${modelFile}`,
      ...(model.accessoryPaths ? { accessory: true } : {}),
    };
    catalog.meshes.push(meta);
    chunks.push(model.bytes);
    packLength += model.bytes.length;
    if (model.accessoryPaths) {
      for (const accessoryPath of model.accessoryPaths) {
        const accessories = importedAccessoriesByPath.get(accessoryPath) ?? [];
        accessories.push(id);
        importedAccessoriesByPath.set(accessoryPath, accessories);
      }
    } else {
      importedByPath.set(model.path, id);
    }
    for (const templateId of model.templateIds) importedByTemplateId.set(templateId, id);
    for (const nativeId of model.nativeIds) importedByNativeId.set(nativeId, id);
  }
  flush();
  if (packs.length !== 1) throw new Error('Each UModel set must fit in one visual pack');

  // Replacing a model path also refreshes older visual rows that already pointed to it.
  for (let id = 0; id < catalog.meshes.length; id++) {
    const meta = catalog.meshes[id];
    if (meta.source !== 'umodel') continue;
    const replacementId = meta.accessory
      ? importedAccessoriesByPath.get(meta.path)?.at(-1)
      : importedByPath.get(meta.path);
    if (replacementId === undefined || replacementId === id) continue;
    Object.assign(meta, catalog.meshes[replacementId]);
  }
  let updatedRows = 0;
  for (const [templateId, row] of Object.entries(catalog.rows)) {
    const currentPath = catalog.meshes[row.mesh]?.path;
    const accessoryIds = importedAccessoriesByPath.get(currentPath) ?? [];
    if (accessoryIds.length) {
      const retained = (row.accessories ?? []).filter(
        (id) => catalog.meshes[id]?.path !== currentPath || !catalog.meshes[id]?.accessory,
      );
      row.accessories = [...new Set([...retained, ...accessoryIds])];
    }
    const importedId =
      importedByTemplateId.get(templateId) ?? importedByNativeId.get(row.mesh) ?? importedByPath.get(currentPath);
    if (importedId !== undefined) {
      row.mesh = importedId;
      if (/^Choam_PentashieldSurface(?:Horizontal|Vertical)_Placeable$/.test(templateId)) row.group = '__shield';
      updatedRows++;
    }
  }

  for (const pack of packs) {
    const temp = path.join(visualPacks, `visual-pack-${pack.index}.bin.gz.tmp`);
    await fs.writeFile(temp, pack.bytes);
    await fs.rename(temp, path.join(visualPacks, modelFile));
  }
  const tempCatalog = `${catalogPath}.tmp`;
  await fs.writeFile(tempCatalog, gzipSync(JSON.stringify(catalog), { level: 9 }));
  await fs.rename(tempCatalog, catalogPath);

  const report = {
    set: path.basename(path.resolve(sourceRoot)),
    templates: Object.keys(catalog.rows).length,
    imported: imported.length,
    glassAccessories: imported.filter((model) => model.accessoryPaths).length,
    explicitlyMappedTemplates: [...importedByTemplateId.keys()],
    updatedCatalogRows: updatedRows,
    nativeFallbackRows: Object.values(catalog.rows).filter((row) => catalog.meshes[row.mesh]?.source === 'native')
      .length,
    unmatched: unmatched.length,
    unmatchedFiles: unmatched,
    failed: failures.length,
    failures,
    meshesWithImages: imported.filter((model) => model.images).length,
    textureNote:
      'UModel GLTFs contain no embedded images; exported _M TGA masks are not treated as base-color textures.',
    packs: packs.map(({ index, bytes }) => ({ index, compressedBytes: bytes.length })),
  };
  if (!appendPack) {
    const reportPath = path.join(visualPacks, 'coverage.json');
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.info(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = process.argv.find((value) => value.startsWith('--source-root='));
  const packArgument = process.argv.find((value) => value.startsWith('--pack-name='));
  const appendPack = process.argv.includes('--append-pack');
  importUmodelSet({
    sourceRoot: argument?.slice('--source-root='.length),
    packName: packArgument?.slice('--pack-name='.length),
    appendPack,
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'UModel import failed');
    process.exitCode = 1;
  });
}
