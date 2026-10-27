import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import { bindExportedMaterials, createMaterialResolver } from './exportedMaterials.mjs';

const HOST = 'https://assets.dune.layout.tools/';
const MAX_ASSET = 32 * 1024 * 1024;
const PACK_TARGET = 4 * 1024 * 1024;
const tablePath = 'Dune/Systems/Building/Data/CDT_BuildingData.json';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Reject external references: the viewer must never fetch a third-party texture or buffer. */
export function inspectEmbeddedGlb(raw) {
  if (
    raw.byteLength < 20 ||
    raw.readUInt32LE(0) !== 0x46546c67 ||
    raw.readUInt32LE(4) !== 2 ||
    raw.readUInt32LE(8) !== raw.byteLength
  )
    throw new Error('Invalid visual GLB');
  const length = raw.readUInt32LE(12);
  if (length > raw.byteLength - 20 || raw.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB JSON');
  const doc = JSON.parse(raw.subarray(20, 20 + length).toString());
  for (const resource of [...(doc.buffers ?? []), ...(doc.images ?? [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('External GLB resource');
  }
  if ((doc.extensionsRequired ?? []).includes('KHR_draco_mesh_compression'))
    throw new Error('Runtime Draco dependency');
  return doc;
}

export async function buildVisualAssets({
  sourceRoot,
  metadataRoot,
  cacheRoot = path.join(os.tmpdir(), 'arrakis-building-source'),
} = {}) {
  const root = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
  const output = path.join(root, 'src/assets/models');
  const native = JSON.parse(gunzipSync(await fs.readFile(path.join(output, 'catalog.json.gz'))));
  await fs.mkdir(cacheRoot, { recursive: true });
  const download = async (relative) => {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('..')) throw new Error('Invalid asset path');
    if (sourceRoot) {
      const local = path.join(path.resolve(sourceRoot), relative);
      try {
        return await fs.readFile(local);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const cachePath = path.join(cacheRoot, `${sha(relative)}.source`);
    try {
      return await fs.readFile(cachePath);
    } catch {
      /* First import downloads once. */
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(new URL(relative, HOST), {
        headers: { 'User-Agent': 'Mozilla/5.0 PowerShell/7.5' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404 || attempt === 2) throw new Error(`Asset unavailable (${response.status})`);
        continue;
      }
      if (Number(response.headers.get('content-length')) > MAX_ASSET) {
        await response.body?.cancel();
        throw new Error('Asset too large');
      }
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > MAX_ASSET) throw new Error('Asset too large');
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const bytes = Buffer.concat(chunks);
      await fs.writeFile(cachePath, bytes);
      return bytes;
    }
    throw new Error('Download failed');
  };
  const tableBytes = await download(tablePath);
  const gameRows = JSON.parse(tableBytes.toString().replace(/^\uFEFF/, ''))[0].Rows;
  const playable = Object.entries(gameRows)
    .filter(([, row]) => row.m_bShowInList !== false && row.m_BuildableFaction?.Name !== 'Blockout')
    .map(([id]) => id);
  const sources = new Map();
  const templateSources = new Map();
  const rows = {};
  const assign = (id, row, meshPath, name) => {
    if (!meshPath?.startsWith('/Game/')) return;
    const relative = `${meshPath.slice(6).split('.')[0]}.glb`;
    templateSources.set(id, relative);
    rows[id] = { ...row, mesh: -1, ...(name ? { name } : {}) };
  };
  for (const [id, row] of Object.entries(native.rows)) {
    if (row.mesh < 0 || row.group === 'Vehicle') continue;
    assign(id, row, native.meshes[row.mesh]?.path);
  }
  // Authoritative CDT mesh paths override collision-hull lookup paths and include current build-menu items.
  for (const [id, row] of Object.entries(gameRows)) {
    assign(
      id,
      native.rows[id] ?? { group: row.m_BuildableFaction?.Name ?? 'Generic', kind: 'building' },
      row.m_StaticMesh?.AssetPathName,
      row.m_DisplayName?.LocalizedString,
    );
  }
  for (const [id, relative] of templateSources) {
    if (!sources.has(relative)) sources.set(relative, []);
    sources.get(relative).push(id);
  }
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
  const materialResolver = sourceRoot ? await createMaterialResolver(sourceRoot, metadataRoot) : null;
  const models = [];
  const failures = [];
  const entries = [...sources.entries()];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= entries.length) break;
        const [relative, templates] = entries[index];
        try {
          const source = await download(relative);
          // FModel material JSON is applied only to explicitly identified texture inputs.
          const document = await io.readBinary(new Uint8Array(source));
          const triangles = document
            .getRoot()
            .listMeshes()
            .reduce(
              (sum, mesh) =>
                sum +
                mesh.listPrimitives().reduce((count, primitive) => {
                  if (primitive.getMode() !== 4) throw new Error('Non-triangle visual primitive');
                  return (
                    count + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3
                  );
                }, 0),
              0,
            );
          if (!triangles || triangles > 1_000_000) throw new Error('Visual mesh complexity limit');
          document
            .getRoot()
            .listExtensionsUsed()
            .find((extension) => extension.extensionName === 'KHR_draco_mesh_compression')
            ?.dispose();
          // FModel leaves glTF metallic at its default of 1; without an environment map this renders black.
          for (const material of document.getRoot().listMaterials()) {
            if (!material.getMetallicRoughnessTexture() && material.getMetallicFactor() === 1)
              material.setMetallicFactor(0);
          }
          // FModel exports Unreal vertex masks as glTF colors; they are not surface tints.
          if (
            materialResolver &&
            (await fs.stat(path.join(path.resolve(sourceRoot), relative)).then(
              () => true,
              () => false,
            ))
          ) {
            for (const mesh of document.getRoot().listMeshes()) {
              for (const primitive of mesh.listPrimitives()) primitive.setAttribute('COLOR_0', null);
            }
          }
          const bindings = materialResolver
            ? await bindExportedMaterials(document, relative, materialResolver)
            : { colorMaps: 0, normalMaps: 0 };
          const bytes = Buffer.from(await io.writeBinary(document));
          if (bytes.length > MAX_ASSET) throw new Error('Decoded model too large');
          const glb = inspectEmbeddedGlb(bytes);
          models.push({
            relative,
            templates,
            bytes,
            tris: triangles,
            sha256: sha(source),
            images: glb.images?.length ?? 0,
            ...bindings,
          });
        } catch (error) {
          failures.push({ path: relative, templates, reason: error.message });
        }
        if ((index + 1) % 100 === 0) console.info(`Visual assets: ${index + 1}/${entries.length}`);
      }
    }),
  );
  models.sort((a, b) => a.relative.localeCompare(b.relative));
  const packs = [];
  const meshes = [];
  let chunks = [],
    length = 0;
  const flush = () => {
    if (length) {
      packs.push(gzipSync(Buffer.concat(chunks), { level: 9 }));
      chunks = [];
      length = 0;
    }
  };
  for (const model of models) {
    if (length && length + model.bytes.length > PACK_TARGET) flush();
    const mesh = meshes.length;
    meshes.push({
      pack: packs.length,
      offset: length,
      length: model.bytes.length,
      tris: model.tris,
      format: 'glb',
      path: `/Game/${model.relative.slice(0, -4)}`,
      sha256: model.sha256,
    });
    chunks.push(model.bytes);
    length += model.bytes.length;
    for (const id of model.templates) rows[id].mesh = mesh;
  }
  flush();
  // The game exposes only collision proxies for these shield surfaces; retain those actual shapes.
  for (const id of ['Choam_PentashieldSurfaceVertical_Placeable', 'Choam_PentashieldSurfaceHorizontal_Placeable']) {
    const nativeRow = native.rows[id];
    if (rows[id]?.mesh >= 0 || !nativeRow || nativeRow.mesh < 0 || !native.meshes[nativeRow.mesh]) continue;
    const fallback = native.meshes[nativeRow.mesh];
    rows[id] = { ...rows[id], group: '__shield', mesh: meshes.length };
    meshes.push({
      pack: fallback.pack,
      offset: fallback.offset,
      length: fallback.length,
      tris: fallback.tris,
      source: 'native',
    });
  }
  const missingPlayable = playable.filter((id) => !rows[id] || rows[id].mesh < 0);
  const report = {
    playable: playable.length,
    availablePlayable: playable.length - missingPlayable.length,
    missingPlayable,
    templates: Object.keys(rows).length,
    visualMeshes: models.length,
    meshesWithImages: models.filter((model) => model.images).length,
    colorMaps: models.reduce((sum, model) => sum + model.colorMaps, 0),
    normalMaps: models.reduce((sum, model) => sum + model.normalMaps, 0),
    packs: packs.length,
    failures,
  };
  await fs.writeFile(path.join(output, 'visual-coverage.json'), JSON.stringify(report, null, 2) + '\n');
  for (let index = 0; index < packs.length; index++) {
    if (packs[index].length > 8 * 1024 * 1024) throw new Error('Visual pack exceeds transfer limit');
    await fs.writeFile(path.join(output, `visual-pack-${index}.bin.gz`), packs[index]);
  }
  await fs.writeFile(
    path.join(output, 'visual-catalog.json.gz'),
    gzipSync(
      JSON.stringify({
        provenance: {
          source: sourceRoot ? 'local FModel export' : HOST,
          tableSha256: sha(tableBytes),
          coordinateSystem: 'glTF right-handed metres, mirrored Z at load',
        },
        rows,
        meshes,
      }),
      { level: 9 },
    ),
  );
  console.info(JSON.stringify(report));
  if (missingPlayable.length)
    throw new Error(`${missingPlayable.length} playable building types have no visual model; see visual-coverage.json`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv
    .find((argument) => argument.startsWith('--source-root='))
    ?.slice('--source-root='.length);
  const metadataRoot = process.argv
    .find((argument) => argument.startsWith('--metadata-root='))
    ?.slice('--metadata-root='.length);
  await buildVisualAssets({ sourceRoot, metadataRoot });
}
