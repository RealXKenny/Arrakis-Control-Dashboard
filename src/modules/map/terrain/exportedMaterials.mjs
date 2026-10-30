import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/** Reconstruct the blue channel of Unreal's alpha/green packed normal maps. */
export function unpackUnrealNormal(pixels) {
  const output = Buffer.from(pixels);
  for (let i = 0; i < output.length; i += 4) {
    const x = (output[i + 3] / 255) * 2 - 1;
    const y = (output[i + 1] / 255) * 2 - 1;
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    output[i] = output[i + 3];
    output[i + 2] = Math.round((z * 0.5 + 0.5) * 255);
    output[i + 3] = 255;
  }
  return output;
}

// FModel exports many shared shader defaults. Only bind explicitly named surface inputs.
const INPUTS = {
  color: [
    'Layer BaseColor',
    'BaseColor',
    'Base Color',
    'Diffuse',
    'Albedo',
    'Tarp - Texture _D',
    'Pattern - Texture _D',
  ],
  normal: ['Layer Normal', 'Normal', 'Tarp - Texture _N', 'Mesh Normal'],
};
const MAX_TEXTURE_BYTES = 32 * 1024 * 1024;

async function tintLayerTexture(bytes, tint) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < data.length; pixel += info.channels) {
    for (let channel = 0; channel < 3; channel++) {
      const srgb = data[pixel + channel] / 255;
      const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      const tinted = linear * tint[channel];
      const output = tinted <= 0.0031308 ? tinted * 12.92 : 1.055 * tinted ** (1 / 2.4) - 0.055;
      data[pixel + channel] = Math.round(Math.max(0, Math.min(1, output)) * 255);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function createMaterialResolver(sourceRoot, metadataRoot, { maxTextureSize = 2048 } = {}) {
  const root = path.resolve(sourceRoot);
  const index = new Map();
  async function visit(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile() && item.name.endsWith('.json')) {
        const name = item.name.slice(0, -5).toLowerCase();
        if (!index.has(name)) index.set(name, []);
        index.get(name).push(file);
      }
    }
  }
  await visit(root);
  const materials = new Map(),
    images = new Map();
  async function texture(reference, maxSize = maxTextureSize) {
    if (
      typeof reference !== 'string' ||
      !/^\/Game\/[\w/.-]+$/.test(reference) ||
      /(?:\.\.|\/dev\/|materialpreview|checker|default|\/testing\/)/i.test(reference)
    )
      return null;
    const relative = reference.slice(6).split('.')[0] + '.png';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return null;
    const cacheKey = `${file}:${maxSize}`;
    if (!images.has(cacheKey))
      images.set(
        cacheKey,
        (async () => {
          try {
            if ((await fs.stat(file)).size > MAX_TEXTURE_BYTES) return null;
            // Bound decoded texture size and embed PNGs; no runtime requests to the export folder.
            const resized = sharp(file, { limitInputPixels: 67108864 }).resize(maxSize, maxSize, {
              fit: 'inside',
              withoutEnlargement: true,
            });
            if (/_N\.png$/i.test(file)) {
              const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
              let blue = 0;
              for (let i = 2; i < data.length; i += 4) blue += data[i];
              if (blue / (data.length / 4) < 10) {
                return sharp(unpackUnrealNormal(data), { raw: { width: info.width, height: info.height, channels: 4 } })
                  .png()
                  .toBuffer();
              }
              return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png()
                .toBuffer();
            }
            return resized.png().toBuffer();
          } catch {
            return null;
          }
        })(),
      );
    return images.get(cacheKey);
  }
  async function resolve(name, modelPath, ancestry = new Set()) {
    const matches = index.get(name.toLowerCase()) ?? [];
    if (!matches.length) return null;
    // Resolve duplicates by the closest shared parent; do not guess when equally close.
    const parts = path.resolve(root, modelPath).toLowerCase().split(path.sep);
    const ranked = matches
      .map((file) => {
        const candidate = file.toLowerCase().split(path.sep);
        let score = 0;
        while (score < parts.length && parts[score] === candidate[score]) score++;
        return { file, score };
      })
      .sort((a, b) => b.score - a.score);
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
    async function read(file) {
      if (!materials.has(file))
        materials.set(
          file,
          fs
            .readFile(file, 'utf8')
            .then(JSON.parse)
            .catch(() => null),
        );
      return materials.get(file);
    }
    const file = ranked[0].file;
    let flattened = normalizeExportedMaterial(await read(file));
    if (!flattened) return null;
    flattened = {
      ...flattened,
      ...(flattened.Parameters ? { Parameters: { ...flattened.Parameters } } : {}),
    };
    const parent = flattened.Parameters?.Parent;
    const parentName = parent?.ObjectName?.match(/'([^']+)'/)?.[1];
    const parentPath = parent?.ObjectPath?.startsWith('/Game/') ? parent.ObjectPath.slice(6).split('.')[0] : null;
    const lineageKey = `${file.toLowerCase()}:${name.toLowerCase()}`;
    if (parentName && parentPath && !ancestry.has(lineageKey)) {
      const inherited = await resolve(parentName, parentPath, new Set([...ancestry, lineageKey]));
      if (inherited?.Parameters) {
        const vectors = new Map();
        for (const value of [
          ...(inherited.Parameters.VectorParameterValues ?? []),
          ...(flattened.Parameters.VectorParameterValues ?? []),
        ]) {
          const info = value.ParameterInfo;
          if (!info?.Name) continue;
          vectors.set(`${info.Association ?? ''}:${info.Index ?? ''}:${info.Name}`, value);
        }
        flattened.Parameters = {
          ...inherited.Parameters,
          ...flattened.Parameters,
          VectorParameterValues: [...vectors.values()],
        };
      }
    }
    if (!metadataRoot) return flattened;
    const candidate = path.join(path.resolve(metadataRoot), path.relative(root, file));
    const raw = normalizeExportedMaterial(await read(candidate));
    if (!raw) return flattened;
    const textures = { ...flattened?.Textures };
    for (const [key, reference] of Object.entries(raw.Textures ?? {})) {
      if (await texture(reference)) textures[key] = reference;
    }
    return { ...flattened, ...raw, Textures: textures };
  }
  return { resolve, texture, clearTextureCache: () => images.clear() };
}

/** Normalize FModel package-property exports without guessing among multiple material layers. */
export function normalizeExportedMaterial(source) {
  if (!Array.isArray(source)) return source;
  const properties = source.find((entry) => entry?.Properties?.TextureParameterValues)?.Properties;
  if (!properties) return null;
  const values = properties.TextureParameterValues;
  const layerIndexes = new Set(
    values
      .filter((item) => item.ParameterInfo?.Association === 'LayerParameter')
      .map((item) => item.ParameterInfo.Index),
  );
  const textures = {};
  const layered = {};
  for (const item of values) {
    const info = item.ParameterInfo;
    if (!info?.Name || typeof item.ParameterValue?.ObjectPath !== 'string') continue;
    if (info.Association === 'LayerParameter' && layerIndexes.size !== 1) continue;
    if (info.Association && !['GlobalParameter', 'LayerParameter'].includes(info.Association)) continue;
    const objectIndex = Number(item.ParameterValue.ObjectPath.split('.').at(-1));
    const array = source[objectIndex];
    if (array?.Type === 'Texture2DRefArray') {
      // A single glTF surface cannot blend the Unreal array; use the first layer as an approximation.
      const references = array.Properties?.Textures?.map((entry) => entry?.ObjectPath ?? null) ?? [];
      if (info.Name === 'Layer BaseColor') layered.colors = references;
      if (info.Name === 'Layer Normal') layered.normals = references;
      const first = references[0];
      if (typeof first === 'string') textures[info.Name] = first;
    } else textures[info.Name] = item.ParameterValue.ObjectPath;
  }
  const layerData = properties.StaticParametersRuntime?.StaticLayerData?.[0];
  if (layerData?.OpaqueLayerIndexMap?.ObjectPath) {
    layered.indexMap = layerData.OpaqueLayerIndexMap.ObjectPath;
    layered.indexUv = layerData.OpaqueLayerIndexSampleUVChannel;
  }
  return { Textures: textures, Parameters: properties, Layered: layered };
}

export async function bindExportedMaterials(document, modelPath, resolver, { layerTileSize = 512 } = {}) {
  let colorMaps = 0,
    normalMaps = 0;
  const embedded = new Map();
  for (const material of document.getRoot().listMaterials()) {
    const source = normalizeExportedMaterial(await resolver.resolve(material.getName(), modelPath));
    if (!source?.Textures) continue;
    // Unreal's tiling surfaces may use the second mesh UV set rather than the unique UVs.
    const primitives = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .filter((primitive) => primitive.getMaterial() === material);
    // A bounded atlas keeps the exported foundation layers in the GLB itself.
    if (
      source.Layered?.colors?.length > 1 &&
      source.Layered.colors.length <= 12 &&
      typeof source.Layered.indexMap === 'string' &&
      source.Layered.indexUv === 1 &&
      primitives.length &&
      primitives.every(
        (primitive) => primitive.getAttribute('TEXCOORD_0') && primitive.getAttribute('TEXCOORD_1'),
      )
    ) {
      const layerTints = new Map();
      for (const parameter of source.Parameters?.VectorParameterValues ?? []) {
        const info = parameter.ParameterInfo;
        if (
          !['Layer ColorTint', 'Layer Override - ColorTint'].includes(info?.Name) ||
          info.Association !== 'LayerParameter' ||
          !Number.isInteger(info.Index)
        )
          continue;
        const value = parameter.ParameterValue ?? {};
        const priority = info.Name === 'Layer Override - ColorTint' ? 2 : 1;
        const existing = layerTints.get(info.Index);
        if (!existing || existing.priority < priority)
          layerTints.set(info.Index, {
            priority,
            tint: [value.R ?? 1, value.G ?? 1, value.B ?? 1].map(Number),
          });
      }
      const indexBytes = await resolver.texture(source.Layered.indexMap);
      if (indexBytes) {
        const tiles = [];
        const normalTiles = [];
        const colorLayerBytes = await Promise.all(
          source.Layered.colors
            .slice(0, 12)
            .map((reference) => (reference ? resolver.texture(reference, layerTileSize) : null)),
        );
        let missing = 0;
        let missingNormals = 0;
        for (let i = 0; i < 12; i++) {
          const reference = source.Layered.colors[i];
          let bytes = colorLayerBytes[i] ?? null;
          if (reference && !bytes) missing++;
          let fallbackIndex = i;
          if (!bytes) {
            fallbackIndex = colorLayerBytes.findIndex(Boolean);
            if (fallbackIndex >= 0) {
              // Some used UV layer IDs export as a dev checker; reuse a real surface instead of flat gray.
              bytes = colorLayerBytes[fallbackIndex];
              for (let candidate = 0; candidate < colorLayerBytes.length; candidate++) {
                if (!colorLayerBytes[candidate]) continue;
                if (Math.abs(candidate - i) < Math.abs(fallbackIndex - i)) fallbackIndex = candidate;
              }
              bytes = colorLayerBytes[fallbackIndex];
            }
          }
          const tint = layerTints.get(i)?.tint ?? layerTints.get(fallbackIndex)?.tint;
          if (bytes && tint) bytes = await tintLayerTexture(bytes, tint);
          const tile = bytes
            ? await sharp(bytes).resize(layerTileSize, layerTileSize, { fit: 'fill' }).png().toBuffer()
            : await sharp({
                create: { width: layerTileSize, height: layerTileSize, channels: 3, background: '#999994' },
              })
                .png()
                .toBuffer();
          tiles.push({ input: tile, left: (i % 4) * layerTileSize, top: Math.floor(i / 4) * layerTileSize });
          if (source.Layered.normals?.length) {
            const normalReference = source.Layered.normals[i];
            const normalBytes = normalReference ? await resolver.texture(normalReference, layerTileSize) : null;
            if (normalReference && !normalBytes) missingNormals++;
            const normalTile = normalBytes
              ? await sharp(normalBytes).resize(layerTileSize, layerTileSize, { fit: 'fill' }).png().toBuffer()
              : await sharp({
                  create: {
                    width: layerTileSize,
                    height: layerTileSize,
                    channels: 4,
                    background: { r: 128, g: 128, b: 255, alpha: 1 },
                  },
                })
                  .png()
                  .toBuffer();
            normalTiles.push({
              input: normalTile,
              left: (i % 4) * layerTileSize,
              top: Math.floor(i / 4) * layerTileSize,
            });
          }
        }
        const atlas = await sharp({
          create: { width: layerTileSize * 4, height: layerTileSize * 3, channels: 4, background: '#999994' },
        })
          .composite(tiles)
          .webp({ quality: 90, effort: 5 })
          .toBuffer();
        const normalAtlas = normalTiles.length
          ? await sharp({
              create: {
                width: layerTileSize * 4,
                height: layerTileSize * 3,
                channels: 4,
                background: { r: 128, g: 128, b: 255, alpha: 1 },
              },
            })
              .composite(normalTiles)
              .webp({ lossless: true, effort: 5 })
              .toBuffer()
          : null;
        material.setExtras({
          ...material.getExtras(),
          arrakisLayers: {
            atlas: 'data:image/webp;base64,' + atlas.toString('base64'),
            index: 'data:image/png;base64,' + indexBytes.toString('base64'),
            ...(normalAtlas
              ? { normals: 'data:image/webp;base64,' + normalAtlas.toString('base64'), missingNormals }
              : {}),
            missing,
            count: source.Layered.colors.length,
          },
        });
      }
    }
    // Without UV0, glTF samples every texture at (0, 0), making whole meshes nearly black.
    if (primitives.length && primitives.some((primitive) => !primitive.getAttribute('TEXCOORD_0'))) continue;
    const tilingUv =
      source.Parameters?.Switches?.UseTilingTexturesUVChannel === true &&
      primitives.length > 0 &&
      primitives.every((primitive) => primitive.getAttribute('TEXCOORD_1'))
        ? 1
        : 0;
    for (const [type, keys] of Object.entries(INPUTS)) {
      for (const key of keys) {
        const reference = source.Textures[key];
        const bytes = await resolver.texture(reference);
        if (!bytes) continue;
        let image = embedded.get(reference);
        if (!image) {
          image = document
            .createTexture(path.basename(reference.split('.')[0]))
            .setMimeType('image/png')
            .setImage(bytes);
          embedded.set(reference, image);
        }
        if (type === 'color') {
          material.setBaseColorTexture(image);
          material.getBaseColorTextureInfo().setTexCoord(tilingUv);
          colorMaps++;
        } else {
          material.setNormalTexture(image);
          material.getNormalTextureInfo().setTexCoord(tilingUv);
          normalMaps++;
        }
        break;
      }
    }
  }
  return { colorMaps, normalMaps };
}
