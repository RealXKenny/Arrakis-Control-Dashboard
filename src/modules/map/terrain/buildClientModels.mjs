import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Converts an extracted MapViewer3D `cdn` data tree into the base preview's client model packs.
 *
 * Usage: node src/modules/map/terrain/buildClientModels.mjs <extracted MapViewer3D-cdn folder>
 *
 * The source tree is read as untrusted data: every path is resolved inside it, every mesh and
 * UV buffer is validated, and the output is bounded by the same limits the browser enforces.
 */
const MAX_PACK = 8 * 1024 * 1024;
const MAX_MESH_TRIANGLES = 1_000_000;
const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;
const TEXTURE_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const outputRoot = path.join(root, 'client');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const packagePath = (value) =>
  String(value)
    .replace(/^\/+/, '')
    .replace(/^Game\//, '')
    .split('.')[0]
    .toLowerCase();

// Rows whose catalogue path is a collision proxy, mapped to the client's actual render mesh.
const RENDER_MESH_OVERRIDES = {
  MTX_Neut_DesertMechanic_Door_Placeable:
    '/Game/DLC/MTX/Environment/PlayerBuilt/Neut/DesertMechanicSet/Skeletons/SK_MTX_Env_PB_Neut_DesertMechanic_Door',
};

function inside(base, relative) {
  const file = path.resolve(base, relative.replace(/^\/+/, ''));
  if (!file.startsWith(base + path.sep)) throw new Error(`Path escapes the source tree: ${relative}`);
  return file;
}

async function readJsonLines(file) {
  return (await fs.readFile(file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** DML1: magic, vertex count, index count, bounds, quantised positions, padding, u16/u32 indices. */
export function inspectDml(bytes) {
  if (bytes.byteLength < 36 || bytes.readUInt32LE(0) !== 0x314c4d44) throw new Error('Invalid DML1 mesh');
  const vertices = bytes.readUInt32LE(4);
  const indices = bytes.readUInt32LE(8);
  const offset = Math.ceil((36 + vertices * 6) / 4) * 4;
  if (
    !vertices ||
    vertices > 1_000_000 ||
    indices % 3 ||
    indices / 3 > MAX_MESH_TRIANGLES ||
    offset + indices * (vertices <= 65535 ? 2 : 4) !== bytes.byteLength
  )
    throw new Error('Invalid DML1 size');
  for (let k = 0; k < 6; k++) if (!Number.isFinite(bytes.readFloatLE(12 + k * 4))) throw new Error('Invalid bounds');
  const view = vertices <= 65535 ? new Uint16Array(indices) : new Uint32Array(indices);
  for (let i = 0; i < indices; i++)
    view[i] = vertices <= 65535 ? bytes.readUInt16LE(offset + i * 2) : bytes.readUInt32LE(offset + i * 4);
  if (view.some((index) => index >= vertices)) throw new Error('Invalid DML1 index');
  return { vertices, triangles: indices / 3 };
}

/** UVH1: magic, vertex count, then one half-float u/v pair per DML1 vertex. */
export function inspectUv(bytes, vertices) {
  if (
    bytes.byteLength !== 8 + vertices * 4 ||
    bytes.readUInt32LE(0) !== 0x31485655 ||
    bytes.readUInt32LE(4) !== vertices
  )
    throw new Error('UV channel does not match its mesh');
}

/** Same rule as the MapViewer3D reference viewer: the first plain base-colour input of a slot. */
export function albedoTexture(slots, textures) {
  for (const slot of slots ?? []) {
    const entries = Object.entries(slot.textures ?? {});
    const match =
      entries.find(
        ([name, texture]) =>
          /base ?color|albedo|diffuse/i.test(name) &&
          !/wear|detail|mask|pattern|decal|edge/i.test(name) &&
          textures.has(packagePath(texture)),
      ) ?? entries.find(([, texture]) => /_D$/.test(texture) && textures.has(packagePath(texture)));
    if (match) return packagePath(match[1]);
  }
  return null;
}

class PackWriter {
  constructor(prefix) {
    this.prefix = prefix;
    this.packs = [[]];
    this.sizes = [0];
  }
  add(bytes) {
    if (bytes.byteLength > MAX_PACK) throw new Error('Asset exceeds the pack limit');
    if (this.sizes.at(-1) + bytes.byteLength > MAX_PACK) {
      this.packs.push([]);
      this.sizes.push(0);
    }
    const pack = this.packs.length - 1;
    const offset = this.sizes[pack];
    this.packs[pack].push(bytes);
    this.sizes[pack] += bytes.byteLength;
    return { pack, offset };
  }
  async write() {
    const written = [];
    for (const [index, parts] of this.packs.entries()) {
      if (!parts.length) continue;
      const file = `${this.prefix}-${index}.bin.gz`;
      const compressed = gzipSync(Buffer.concat(parts), { level: 9 });
      await fs.writeFile(path.join(outputRoot, file), compressed);
      written.push({ file: `client/${file}`, bytes: this.sizes[index], compressedBytes: compressed.byteLength });
    }
    return written;
  }
}

async function main() {
  const source = path.resolve(process.argv[2] ?? '');
  const client = path.join(source, 'client');
  const index = JSON.parse(await fs.readFile(path.join(source, 'buildables', 'index.json'), 'utf8'));
  const indexSha256 = sha(await fs.readFile(path.join(source, 'buildables', 'index.json')));
  const native = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'native', 'catalog.json.gz'))));
  if (JSON.stringify(native.rows) !== JSON.stringify(index.rows))
    throw new Error('buildables/index.json rows differ from the bundled native catalogue');
  // Earlier visual catalogues carry authoritative build-menu mesh paths and glass accessories.
  const visual = await fs
    .readFile(path.join(root, 'visual', 'catalog.json.gz'))
    .then((raw) => JSON.parse(gunzipSync(raw)))
    .catch(() => null);
  const meshes = new Map((await readJsonLines(path.join(client, 'meshes.jsonl'))).map((m) => [packagePath(m.pkg), m]));
  const materials = new Map(
    (await readJsonLines(path.join(client, 'materials.jsonl'))).map((m) => [packagePath(m.pkg), m.slots]),
  );
  const textures = new Map(
    (await readJsonLines(path.join(client, 'textures.jsonl'))).map((t) => [packagePath(t.tex), t]),
  );

  const meshWriter = new PackWriter('client-meshes');
  const textureWriter = new PackWriter('client-textures');
  const outMeshes = [];
  const meshIds = new Map();
  const outTextures = {};
  const textureIds = new Map();
  const failures = [];
  const nativePath = (meshId) => native.meshes[meshId]?.path;

  const addTexture = async (key) => {
    if (textureIds.has(key)) return textureIds.get(key);
    const entry = textures.get(key);
    const mime = TEXTURE_MIME[path.extname(entry?.file ?? '').toLowerCase()];
    let id = null;
    try {
      if (!mime) throw new Error('Unsupported texture type');
      const bytes = await fs.readFile(inside(client, entry.file));
      if (!bytes.byteLength || bytes.byteLength > MAX_TEXTURE_BYTES) throw new Error('Texture size limit');
      id = sha(bytes);
      if (!outTextures[id]) {
        const { pack, offset } = textureWriter.add(bytes);
        outTextures[id] = { pack, offset, length: bytes.byteLength, mime };
      }
    } catch (error) {
      failures.push({ texture: key, reason: error.message });
    }
    textureIds.set(key, id);
    return id;
  };

  /** Returns the client render mesh, or the bundled simplified mesh when the client copy is unusable. */
  const addMesh = async (meshPath, fallbackNativeId) => {
    const key = packagePath(meshPath ?? '');
    if (meshIds.has(key)) return meshIds.get(key);
    let id = -1;
    const entry = meshes.get(key);
    try {
      if (!entry || entry.source !== 'render') throw new Error('No client render mesh');
      const dml = await fs.readFile(inside(client, entry.dml));
      const { vertices, triangles } = inspectDml(dml);
      let uv = null;
      if (entry.uv) {
        uv = await fs.readFile(inside(client, entry.uv));
        inspectUv(uv, vertices);
      }
      const slots = materials.get(key) ?? [];
      const albedo = uv ? albedoTexture(slots, textures) : null;
      const texture = albedo ? await addTexture(albedo) : null;
      const { pack, offset } = meshWriter.add(uv ? Buffer.concat([dml, uv]) : dml);
      id = outMeshes.length;
      outMeshes.push({
        id,
        path: entry.pkg.startsWith('/Game/') ? entry.pkg : `/Game/${entry.pkg.replace(/^\/+/, '')}`,
        kind: entry.kind,
        pack,
        offset,
        length: dml.byteLength,
        tris: triangles,
        ...(uv && texture ? { uv: dml.byteLength, uvLength: uv.byteLength, texture } : {}),
        materials: slots
          .map((slot) =>
            String(slot.material ?? '')
              .split('/')
              .pop()
              .slice(0, 120),
          )
          .filter(Boolean),
      });
    } catch (error) {
      failures.push({ mesh: meshPath, reason: error.message });
      const fallback = native.meshes[fallbackNativeId];
      if (fallback) {
        const dml = await fs.readFile(inside(path.join(source, 'buildables'), `mesh/${fallback.id}.bin`));
        const { triangles } = inspectDml(dml);
        const { pack, offset } = meshWriter.add(dml);
        id = outMeshes.length;
        outMeshes.push({
          id,
          path: fallback.path,
          kind: 'simplified',
          pack,
          offset,
          length: dml.byteLength,
          tris: triangles,
        });
      }
    }
    meshIds.set(key, id);
    return id;
  };

  const byBasename = new Map();
  for (const entry of meshes.values()) {
    const name = packagePath(entry.pkg).split('/').pop();
    byBasename.set(name, [...(byBasename.get(name) ?? []), entry.pkg]);
  }
  const visualPacks = new Map();
  /** Node names of an earlier exported GLB accessory, read from its JSON chunk only. */
  const glbNodeNames = async (meta) => {
    if (!meta?.file || !/^visual\/[a-z0-9-]+-pack\/[a-z0-9-]+\.bin\.gz$/.test(meta.file)) return [];
    if (!visualPacks.has(meta.file)) visualPacks.set(meta.file, gunzipSync(await fs.readFile(inside(root, meta.file))));
    const glb = visualPacks.get(meta.file).subarray(meta.offset, meta.offset + meta.length);
    if (glb.byteLength < 20 || glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(16) !== 0x4e4f534a) return [];
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    return (json.nodes ?? []).filter((node) => Number.isInteger(node.mesh)).map((node) => String(node.name ?? ''));
  };
  /** Separate client glass meshes: `<mesh>_Glass` companions and panes named by earlier exports. */
  const glassCompanions = async (meshPath, visualRow) => {
    const main = packagePath(meshPath);
    const found = new Set();
    if (meshes.has(`${main}_glass`)) found.add(meshes.get(`${main}_glass`).pkg);
    for (const accessory of visualRow?.accessories ?? []) {
      for (const name of await glbNodeNames(visual.meshes[accessory])) {
        const candidates = byBasename.get(name.toLowerCase()) ?? [];
        const sameFolder = candidates.filter(
          (pkg) => packagePath(pkg).split('/').slice(0, -1).join('/') === main.split('/').slice(0, -1).join('/'),
        );
        const pick = sameFolder.length === 1 ? sameFolder[0] : candidates.length === 1 ? candidates[0] : null;
        if (pick && packagePath(pick) !== main) found.add(pick);
      }
    }
    return [...found];
  };

  const rows = {};
  const mapped = [];
  const unsupported = [];
  const resolved = Object.entries(index.rows).map(([templateId, row]) => {
    const visualRow = visual?.rows?.[templateId];
    const visualPath = visualRow && visualRow.mesh >= 0 ? visual.meshes[visualRow.mesh]?.path : undefined;
    const meshPath =
      RENDER_MESH_OVERRIDES[templateId] ?? visualPath ?? (row.mesh >= 0 ? nativePath(row.mesh) : undefined);
    return { templateId, row, visualRow, meshPath };
  });
  // Keep each building set together so a base downloads only the packs its pieces use.
  resolved.sort(
    (a, b) => (a.meshPath ?? '~').localeCompare(b.meshPath ?? '~') || a.templateId.localeCompare(b.templateId),
  );
  for (const { templateId, row, visualRow, meshPath } of resolved) {
    const mesh = meshPath ? await addMesh(meshPath, row.mesh) : -1;
    const accessories = [];
    if (mesh >= 0)
      for (const accessoryPath of await glassCompanions(meshPath, visualRow)) {
        const accessoryId = await addMesh(accessoryPath, -1);
        if (accessoryId >= 0 && accessoryId !== mesh && !accessories.includes(accessoryId))
          accessories.push(accessoryId);
      }
    rows[templateId] = {
      ...row,
      ...(visualRow?.group === '__shield' ? { group: '__shield' } : {}),
      ...(visualRow?.name ? { name: visualRow.name } : {}),
      mesh,
      ...(accessories.length ? { accessories } : {}),
    };
    (mesh >= 0 ? mapped : unsupported).push({
      templateId,
      group: row.group,
      ...(mesh >= 0 ? { mesh: outMeshes[mesh].path, detail: outMeshes[mesh].kind } : {}),
    });
  }

  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  const meshPacks = await meshWriter.write();
  const texturePacks = await textureWriter.write();
  const catalog = {
    format: 'client-dml-1',
    rows,
    meshes: outMeshes,
    textures: outTextures,
    provenance: {
      repository: 'dev-prophet-code/MapViewer3D',
      branch: 'cdn',
      indexSha256,
      note: 'Client LOD0 geometry, UV channel 0 and one albedo texture per mesh; layered materials are approximated.',
    },
  };
  await fs.writeFile(path.join(outputRoot, 'catalog.json.gz'), gzipSync(JSON.stringify(catalog), { level: 9 }));
  const coverage = {
    templates: Object.keys(rows).length,
    mapped: mapped.length,
    clientDetail: mapped.filter((row) => row.detail !== 'simplified').length,
    simplifiedFallback: mapped.filter((row) => row.detail === 'simplified').length,
    glassAccessoryRows: Object.values(rows).filter((row) => row.accessories).length,
    textured: Object.values(rows).filter((row) => row.mesh >= 0 && outMeshes[row.mesh].texture).length,
    unsupported: unsupported.length,
    unsupportedByGroup: unsupported.reduce(
      (groups, row) => ({ ...groups, [row.group]: (groups[row.group] ?? 0) + 1 }),
      {},
    ),
    unsupportedTemplates: unsupported.filter((row) => row.group !== 'Vehicle').map((row) => row.templateId),
    meshes: outMeshes.length,
    triangles: outMeshes.reduce((sum, mesh) => sum + mesh.tris, 0),
    textures: Object.keys(outTextures).length,
    meshPacks,
    texturePacks,
    failures,
  };
  await fs.writeFile(path.join(outputRoot, 'coverage.json'), JSON.stringify(coverage, null, 2) + '\n');
  console.log(JSON.stringify({ ...coverage, unsupportedTemplates: coverage.unsupportedTemplates.length }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
