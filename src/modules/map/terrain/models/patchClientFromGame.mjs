import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspectDml, inspectUv } from './buildClientModels.mjs';

/**
 * Replaces client-pack meshes with geometry, UVs and albedo textures exported straight from the game.
 *
 * Usage: node src/modules/map/terrain/models/patchClientFromGame.mjs <export root containing DuneSandbox/Content>
 *
 * Export the game with CUE4Parse/FModel as glTF binary (textures embedded). A mesh is only replaced when its
 * GLB matches the existing mesh (same triangle count, bounds within tolerance) and does not lose a texture;
 * every other mesh keeps its current data. The export is read as untrusted data and re-validated.
 */
const MAX_PACK = 8 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;
const BOUNDS_TOLERANCE_CM = 5;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../assets/models');
const clientRoot = path.join(root, 'client');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SKIP_TEXTURE = /decal|mask|wear|detail|edge|pattern/i;

const halfView = new DataView(new ArrayBuffer(4));
/** Float32 to IEEE half, clamped to the finite range. */
function toHalf(value) {
  if (!Number.isFinite(value)) return 0;
  halfView.setFloat32(0, value);
  const x = halfView.getUint32(0);
  const sign = (x >>> 16) & 0x8000;
  let exponent = ((x >>> 23) & 0xff) - 127 + 15;
  const mantissa = x & 0x7fffff;
  if (exponent >= 31) return sign | 0x7bff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    return sign | ((mantissa | 0x800000) >> (14 - exponent));
  }
  return sign | (exponent << 10) | (mantissa >> 13);
}

/** glTF (metres, Y up) back to Unreal centimetres: x, z, y. Triangle order is kept as exported. */
function convertGlb(document) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let hasUv = true;
  let texture = null;
  const meshes = document.getRoot().listMeshes();
  for (const mesh of meshes) {
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
      const baseColor = material?.getBaseColorTexture();
      if (
        !texture &&
        baseColor &&
        !SKIP_TEXTURE.test(`${material.getName()} ${baseColor.getName()}`) &&
        ['image/png', 'image/jpeg'].includes(baseColor.getMimeType())
      )
        texture = { bytes: Buffer.from(baseColor.getImage()), mime: baseColor.getMimeType() };
    }
  }
  return { positions, uvs: hasUv ? uvs : null, indices, texture };
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
      const q = span > 0 ? Math.round(((positions[i * 3 + k] - lo[k]) / span) * 65535) : 0;
      out.writeUInt16LE(q, 36 + i * 6 + k * 2);
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

async function main() {
  const exportRoot = path.resolve(process.argv[2] ?? '');
  const content = path.join(exportRoot, 'DuneSandbox', 'Content');
  const catalogFile = path.join(clientRoot, 'catalog.json.gz');
  const catalog = JSON.parse(gunzipSync(await fs.readFile(catalogFile)));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const oldPacks = new Map();
  const oldPack = async (prefix, index) => {
    const key = `${prefix}-${index}`;
    if (!oldPacks.has(key))
      oldPacks.set(key, gunzipSync(await fs.readFile(path.join(clientRoot, `${prefix}-${index}.bin.gz`))));
    return oldPacks.get(key);
  };

  const meshWriter = new PackWriter('client-meshes');
  const textureWriter = new PackWriter('client-textures');
  const textures = {};
  const addTexture = async (id, bytes, mime) => {
    if (!textures[id]) {
      const { pack, offset } = textureWriter.add(bytes);
      textures[id] = { pack, offset, length: bytes.byteLength, mime };
    }
    return id;
  };
  const oldTexture = async (id) => {
    const meta = catalog.textures[id];
    const raw = await oldPack('client-textures', meta.pack);
    return addTexture(id, raw.subarray(meta.offset, meta.offset + meta.length), meta.mime);
  };

  const stats = { replaced: 0, texturedFromGame: 0, keptNoGlb: 0, keptMismatch: 0, keptTexture: 0, failures: [] };
  const meshes = [];
  for (const meta of catalog.meshes) {
    const raw = await oldPack('client-meshes', meta.pack);
    const oldDml = raw.subarray(meta.offset, meta.offset + meta.length);
    const oldUv = meta.uvLength
      ? raw.subarray(meta.offset + meta.length, meta.offset + meta.length + meta.uvLength)
      : null;
    let dml = oldDml;
    let uv = oldUv;
    let texture = meta.texture ?? null;
    let triangles = meta.tris;
    const file = path.join(content, `${meta.path.replace(/^\/Game\//, '')}.glb`);
    const inside = path.resolve(file).startsWith(content + path.sep);
    const present =
      inside &&
      (await fs.stat(file).then(
        (s) => s.isFile() && s.size < 64 * 1024 * 1024,
        () => false,
      ));
    if (!present) stats.keptNoGlb++;
    else
      try {
        const converted = convertGlb(await io.read(file));
        const next = encodeDml(converted);
        const oldHeader = inspectDml(oldDml);
        const drift = [0, 1, 2].flatMap((k) => [
          Math.abs(next.lo[k] - oldDml.readFloatLE(12 + k * 4)),
          Math.abs(next.hi[k] - oldDml.readFloatLE(24 + k * 4)),
        ]);
        if (next.triangles !== oldHeader.triangles || Math.max(...drift) > BOUNDS_TOLERANCE_CM) {
          stats.keptMismatch++;
        } else if (meta.texture && !(converted.texture && converted.uvs)) {
          stats.keptTexture++;
        } else {
          const nextUv = converted.uvs ? encodeUv(converted.uvs, next.vertices) : null;
          let nextTexture = null;
          if (nextUv && converted.texture && converted.texture.bytes.byteLength <= MAX_TEXTURE_BYTES)
            nextTexture = await addTexture(
              sha(converted.texture.bytes),
              converted.texture.bytes,
              converted.texture.mime,
            );
          if (nextUv) inspectUv(nextUv, next.vertices);
          dml = next.bytes;
          triangles = next.triangles;
          uv = nextTexture ? nextUv : null;
          texture = nextTexture;
          if (nextTexture) stats.texturedFromGame++;
          stats.replaced++;
        }
      } catch (error) {
        stats.failures.push({ mesh: meta.path, reason: error instanceof Error ? error.message : 'Import failed' });
      }
    if (texture && !textures[texture]) await oldTexture(texture);
    const { pack, offset } = meshWriter.add(uv ? Buffer.concat([dml, uv]) : dml);
    const { uv: _uv, uvLength: _uvLength, texture: _texture, ...rest } = meta;
    meshes.push({
      ...rest,
      pack,
      offset,
      length: dml.byteLength,
      tris: triangles,
      ...(uv && texture ? { uv: dml.byteLength, uvLength: uv.byteLength, texture } : {}),
    });
  }

  const temp = path.join(clientRoot, '.rebuild');
  await fs.rm(temp, { recursive: true, force: true });
  await fs.mkdir(temp, { recursive: true });
  const meshPacks = await meshWriter.write(temp);
  const texturePacks = await textureWriter.write(temp);
  const next = {
    ...catalog,
    meshes,
    textures,
    provenance: {
      ...catalog.provenance,
      gamePatch: `Geometry, UVs and albedo textures replaced by game exports for ${stats.replaced} meshes.`,
    },
  };
  await fs.writeFile(path.join(temp, 'catalog.json.gz'), gzipSync(JSON.stringify(next), { level: 9 }));
  const coveragePath = path.join(clientRoot, 'coverage.json');
  const coverage = JSON.parse(await fs.readFile(coveragePath, 'utf8'));
  Object.assign(coverage, {
    triangles: meshes.reduce((sum, mesh) => sum + mesh.tris, 0),
    textured: Object.values(next.rows).filter((row) => row.mesh >= 0 && meshes[row.mesh]?.texture).length,
    textures: Object.keys(textures).length,
    meshPacks,
    texturePacks,
    gamePatch: stats,
  });
  // Swap in the rebuilt files only after everything was written and validated.
  for (const entry of await fs.readdir(clientRoot))
    if (/^client-(?:meshes|textures)-\d+\.bin\.gz$/.test(entry)) await fs.rm(path.join(clientRoot, entry));
  for (const entry of await fs.readdir(temp)) await fs.rename(path.join(temp, entry), path.join(clientRoot, entry));
  await fs.rmdir(temp);
  await fs.writeFile(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`);
  console.log(JSON.stringify({ ...stats, failures: stats.failures.length, meshPacks, texturePacks }, null, 2));
  if (stats.failures.length) console.log(JSON.stringify(stats.failures.slice(0, 10), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
