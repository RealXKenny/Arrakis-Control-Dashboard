import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { inspectDml, inspectUv } from './buildClientModels.mjs';

/**
 * Rebuilds the client model packs (`src/assets/models/client`) from a game export.
 *
 * Usage:
 *   node src/modules/map/terrain/models/buildClientFromGame.mjs \
 *     --export <dir containing DuneSandbox/Content (glTF binary meshes)> \
 *     --layers <dir with layers.json and the exported layer textures> \
 *     --previous <dir holding the catalogue/packs this build replaces>
 *
 * Geometry and UVs come from the game's meshes. Dune materials are layered: every material owns a
 * `Layer BaseColor` array of tiling surface textures. A mesh's single albedo is the game layer (or embedded
 * base-colour image) that matches the previous build's choice, re-encoded as a bounded JPEG. Meshes the previous
 * build had no choice for fall back to an embedded game albedo when one exists. Everything is validated again.
 */
const MAX_PACK = 8 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;
const TEXTURE_EDGE = 512;
const MATCH_EDGE = 48;
const MATCH_LIMIT = 10;
const BOUNDS_TOLERANCE_CM = 5;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../assets/models');
const outputRoot = path.join(root, 'client');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SKIP_TEXTURE = /decal|mask|wear|detail|edge|pattern/i;
const option = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Pass --${name} <directory>`);
  return path.resolve(process.argv[index + 1]);
};

const halfView = new DataView(new ArrayBuffer(4));
function toHalf(value) {
  if (!Number.isFinite(value)) return 0;
  halfView.setFloat32(0, value);
  const x = halfView.getUint32(0);
  const sign = (x >>> 16) & 0x8000;
  const exponent = ((x >>> 23) & 0xff) - 127 + 15;
  const mantissa = x & 0x7fffff;
  if (exponent >= 31) return sign | 0x7bff;
  if (exponent <= 0) return exponent < -10 ? sign : sign | ((mantissa | 0x800000) >> (14 - exponent));
  return sign | (exponent << 10) | (mantissa >> 13);
}

/** glTF (metres, Y up) back to Unreal centimetres: x, z, y. Triangle order is kept as exported. */
function convertGlb(document) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const materials = [];
  let hasUv = true;
  let embedded = null;
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error('Non-triangle primitive');
      const position = primitive.getAttribute('POSITION');
      const uv = primitive.getAttribute('TEXCOORD_0');
      const index = primitive.getIndices();
      if (!position || !index) throw new Error('Missing geometry');
      const base = positions.length / 3;
      const v = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, v);
        positions.push(v[0] * 100, v[2] * 100, v[1] * 100);
      }
      if (uv) {
        const t = [0, 0];
        for (let i = 0; i < position.getCount(); i++) {
          uv.getElement(i, t);
          uvs.push(t[0], t[1]);
        }
      } else hasUv = false;
      const one = [0];
      for (let i = 0; i < index.getCount(); i++) indices.push(index.getElement(i, one)[0] + base);
      const material = primitive.getMaterial();
      if (material) materials.push(material.getName());
      const baseColor = material?.getBaseColorTexture();
      if (
        !embedded &&
        baseColor &&
        !SKIP_TEXTURE.test(`${material.getName()} ${baseColor.getName()}`) &&
        ['image/png', 'image/jpeg'].includes(baseColor.getMimeType())
      )
        embedded = Buffer.from(baseColor.getImage());
    }
  return { positions, uvs: hasUv ? uvs : null, indices, materials, embedded };
}

function encodeDml({ positions, indices }) {
  const nv = positions.length / 3;
  const ni = indices.length;
  if (!nv || nv > 1_000_000 || ni % 3 || ni / 3 > 1_000_000) throw new Error('Mesh size limit');
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++)
    for (let k = 0; k < 3; k++) {
      const value = positions[i * 3 + k];
      if (!Number.isFinite(value)) throw new Error('Non-finite position');
      lo[k] = Math.min(lo[k], value);
      hi[k] = Math.max(hi[k], value);
    }
  const offset = Math.ceil((36 + nv * 6) / 4) * 4;
  const wide = nv > 65535;
  const out = Buffer.alloc(offset + ni * (wide ? 4 : 2));
  out.writeUInt32LE(0x314c4d44, 0);
  out.writeUInt32LE(nv, 4);
  out.writeUInt32LE(ni, 8);
  for (let k = 0; k < 3; k++) {
    out.writeFloatLE(lo[k], 12 + k * 4);
    out.writeFloatLE(hi[k], 24 + k * 4);
  }
  for (let i = 0; i < nv; i++)
    for (let k = 0; k < 3; k++) {
      const span = hi[k] - lo[k];
      out.writeUInt16LE(span > 0 ? Math.round(((positions[i * 3 + k] - lo[k]) / span) * 65535) : 0, 36 + i * 6 + k * 2);
    }
  for (let i = 0; i < ni; i++) {
    if (indices[i] >= nv) throw new Error('Index out of range');
    if (wide) out.writeUInt32LE(indices[i], offset + i * 4);
    else out.writeUInt16LE(indices[i], offset + i * 2);
  }
  return { bytes: out, lo, hi, vertices: nv, triangles: ni / 3 };
}

function encodeUv(uvs, vertices) {
  if (uvs.length !== vertices * 2) throw new Error('UV count mismatch');
  const out = Buffer.alloc(8 + vertices * 4);
  out.writeUInt32LE(0x31485655, 0);
  out.writeUInt32LE(vertices, 4);
  for (let i = 0; i < uvs.length; i++) out.writeUInt16LE(toHalf(uvs[i]), 8 + i * 2);
  return out;
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
  async write(directory) {
    const written = [];
    for (const [index, parts] of this.packs.entries()) {
      if (!parts.length) continue;
      const file = `${this.prefix}-${index}.bin.gz`;
      const compressed = gzipSync(Buffer.concat(parts), { level: 9 });
      await fs.writeFile(path.join(directory, file), compressed);
      written.push({ file: `client/${file}`, bytes: this.sizes[index], compressedBytes: compressed.byteLength });
    }
    return written;
  }
}

const rawSmall = (input) => sharp(input).resize(MATCH_EDGE, MATCH_EDGE, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const distance = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};
const encodeTexture = (input) =>
  sharp(input)
    .resize(TEXTURE_EDGE, TEXTURE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

async function main() {
  const exportRoot = option('export');
  const layersRoot = option('layers');
  const previousRoot = option('previous');
  const content = path.join(exportRoot, 'DuneSandbox', 'Content');
  const catalog = JSON.parse(gunzipSync(await fs.readFile(path.join(previousRoot, 'catalog.json.gz'))));
  const layerTable = JSON.parse(await fs.readFile(path.join(layersRoot, 'layers.json'), 'utf8'));
  const layersByMaterial = new Map();
  for (const [materialPath, arrays] of Object.entries(layerTable)) {
    const list = Object.entries(arrays)
      .filter(([name]) => /Layer BaseColor/i.test(name))
      .flatMap(([, textures]) => textures.filter(Boolean));
    if (list.length) layersByMaterial.set(path.basename(materialPath).toLowerCase(), [...new Set(list)]);
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const previousPacks = new Map();
  const previousPack = async (prefix, index) => {
    const key = `${prefix}-${index}`;
    if (!previousPacks.has(key))
      previousPacks.set(key, gunzipSync(await fs.readFile(path.join(previousRoot, `${key}.bin.gz`))));
    return previousPacks.get(key);
  };
  const previousTexture = async (id) => {
    const meta = catalog.textures[id];
    const raw = await previousPack('client-textures', meta.pack);
    return raw.subarray(meta.offset, meta.offset + meta.length);
  };

  const smallCache = new Map();
  const layerSmall = (layerPath) => {
    if (!smallCache.has(layerPath))
      smallCache.set(
        layerPath,
        rawSmall(path.join(layersRoot, `${layerPath}.png`)).catch(() => null),
      );
    return smallCache.get(layerPath);
  };

  const meshWriter = new PackWriter('client-meshes');
  const textureWriter = new PackWriter('client-textures');
  const textures = {};
  const encodedBySource = new Map();
  const addTexture = async (sourceKey, input) => {
    if (!encodedBySource.has(sourceKey)) {
      const bytes = await encodeTexture(input);
      if (!bytes.byteLength || bytes.byteLength > MAX_TEXTURE_BYTES) throw new Error('Texture size limit');
      const id = sha(bytes);
      if (!textures[id]) {
        const { pack, offset } = textureWriter.add(bytes);
        textures[id] = { pack, offset, length: bytes.byteLength, mime: 'image/jpeg' };
      }
      encodedBySource.set(sourceKey, id);
    }
    return encodedBySource.get(sourceKey);
  };

  const stats = {
    meshes: catalog.meshes.length,
    geometryFromGame: 0,
    geometryKept: 0,
    textureFromLayer: 0,
    textureFromEmbedded: 0,
    textureKeptPrevious: 0,
    untextured: 0,
    noGlb: 0,
    failures: [],
  };
  const meshes = [];
  for (const meta of catalog.meshes) {
    const raw = await previousPack('client-meshes', meta.pack);
    const oldDml = raw.subarray(meta.offset, meta.offset + meta.length);
    const oldUv = meta.uvLength
      ? raw.subarray(meta.offset + meta.length, meta.offset + meta.length + meta.uvLength)
      : null;
    let dml = oldDml;
    let uv = oldUv;
    let triangles = meta.tris;
    let textureId = null;
    let converted = null;
    let geometryFromGame = false;
    const file = path.join(content, `${meta.path.replace(/^\/Game\//, '')}.glb`);
    const present =
      path.resolve(file).startsWith(content + path.sep) &&
      (await fs.stat(file).then(
        (s) => s.isFile() && s.size < 64 * 1024 * 1024,
        () => false,
      ));
    if (!present) stats.noGlb++;
    else
      try {
        converted = convertGlb(await io.read(file));
        const next = encodeDml(converted);
        const oldHeader = inspectDml(oldDml);
        const drift = [0, 1, 2].flatMap((k) => [
          Math.abs(next.lo[k] - oldDml.readFloatLE(12 + k * 4)),
          Math.abs(next.hi[k] - oldDml.readFloatLE(24 + k * 4)),
        ]);
        if (next.triangles === oldHeader.triangles && Math.max(...drift) <= BOUNDS_TOLERANCE_CM) {
          dml = next.bytes;
          triangles = next.triangles;
          geometryFromGame = true;
          if (converted.uvs) {
            uv = encodeUv(converted.uvs, next.vertices);
            inspectUv(uv, next.vertices);
          } else uv = null;
        }
      } catch (error) {
        converted = null;
        stats.failures.push({ mesh: meta.path, reason: error instanceof Error ? error.message : 'Import failed' });
      }
    geometryFromGame ? stats.geometryFromGame++ : stats.geometryKept++;

    // Texture: only meshes that carry UVs can be textured.
    if (uv) {
      try {
        const candidates = [];
        if (converted?.embedded)
          candidates.push({ key: `embedded:${sha(converted.embedded)}`, input: converted.embedded });
        for (const name of converted?.materials ?? [])
          for (const layerPath of layersByMaterial.get(name.toLowerCase()) ?? [])
            candidates.push({ key: `layer:${layerPath}`, input: path.join(layersRoot, `${layerPath}.png`), layerPath });
        const known = meta.texture ? await previousTexture(meta.texture) : null;
        let chosen = null;
        if (known) {
          const truth = await rawSmall(known);
          let best = Infinity;
          for (const candidate of candidates) {
            const small = candidate.layerPath ? await layerSmall(candidate.layerPath) : await rawSmall(candidate.input);
            if (!small) continue;
            const d = distance(small, truth);
            if (d < best) {
              best = d;
              chosen = candidate;
            }
          }
          if (best > MATCH_LIMIT) chosen = null;
          if (chosen) {
            textureId = await addTexture(chosen.key, chosen.input);
            stats[chosen.layerPath ? 'textureFromLayer' : 'textureFromEmbedded']++;
          } else {
            // No game image reproduces the previous choice: keep it rather than lose the texture.
            textureId = await addTexture(`previous:${meta.texture}`, known);
            stats.textureKeptPrevious++;
          }
        } else if (converted?.embedded) {
          textureId = await addTexture(`embedded:${sha(converted.embedded)}`, converted.embedded);
          stats.textureFromEmbedded++;
        }
      } catch (error) {
        stats.failures.push({ mesh: meta.path, texture: true, reason: error.message });
      }
    }
    if (!textureId) {
      uv = null;
      stats.untextured++;
    }
    const { pack, offset } = meshWriter.add(uv ? Buffer.concat([dml, uv]) : dml);
    const { uv: _uv, uvLength: _uvLength, texture: _texture, ...rest } = meta;
    meshes.push({
      ...rest,
      pack,
      offset,
      length: dml.byteLength,
      tris: triangles,
      ...(uv && textureId ? { uv: dml.byteLength, uvLength: uv.byteLength, texture: textureId } : {}),
    });
  }

  const temp = path.join(outputRoot, '.rebuild');
  await fs.rm(temp, { recursive: true, force: true });
  await fs.mkdir(temp, { recursive: true });
  const meshPacks = await meshWriter.write(temp);
  const texturePacks = await textureWriter.write(temp);
  const next = {
    ...catalog,
    meshes,
    textures,
    provenance: {
      source: 'Dune: Awakening game files (CUE4Parse glTF export)',
      note: 'Geometry and UV channel 0 from the game; one albedo per mesh from the game surface layers, JPEG re-encoded.',
    },
  };
  await fs.writeFile(path.join(temp, 'catalog.json.gz'), gzipSync(JSON.stringify(next), { level: 9 }));
  const coverage = {
    templates: Object.keys(next.rows).length,
    mapped: Object.values(next.rows).filter((row) => row.mesh >= 0).length,
    textured: Object.values(next.rows).filter((row) => row.mesh >= 0 && meshes[row.mesh]?.texture).length,
    meshes: meshes.length,
    triangles: meshes.reduce((sum, mesh) => sum + mesh.tris, 0),
    textures: Object.keys(textures).length,
    meshPacks,
    texturePacks,
    build: stats,
  };
  await fs.writeFile(path.join(temp, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  // Swap in the rebuilt files only after everything was written.
  for (const entry of await fs.readdir(outputRoot))
    if (/^client-(?:meshes|textures)-\d+\.bin\.gz$/.test(entry)) await fs.rm(path.join(outputRoot, entry));
  for (const entry of await fs.readdir(temp)) await fs.rename(path.join(temp, entry), path.join(outputRoot, entry));
  await fs.rmdir(temp);
  console.log(JSON.stringify({ ...stats, failures: stats.failures.length, meshPacks, texturePacks }, null, 2));
  if (stats.failures.length) console.log(JSON.stringify(stats.failures.slice(0, 10), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
