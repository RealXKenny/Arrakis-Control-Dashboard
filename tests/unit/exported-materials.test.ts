import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  bindExportedMaterials,
  createMaterialResolver,
  normalizeExportedMaterial,
  unpackUnrealNormal,
} from '../../src/modules/map/terrain/exportedMaterials.mjs';

describe('FModel material conversion', () => {
  it('bundles the foundation index map and all twelve material layers', async () => {
    const document = new Document();
    document.createBuffer();
    const material = document.createMaterial('Foundation');
    const buffer = document.getRoot().listBuffers()[0];
    const positions = document
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const uv = document
      .createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer);
    document
      .createMesh()
      .addPrimitive(
        document
          .createPrimitive()
          .setAttribute('POSITION', positions)
          .setAttribute('TEXCOORD_0', uv)
          .setAttribute('TEXCOORD_1', uv)
          .setMaterial(material),
      );
    const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#887766' } })
      .png()
      .toBuffer();
    const resolver = {
      resolve: async () => ({
        Textures: {},
        Layered: {
          colors: Array.from({ length: 12 }, (_, index) => `/Game/layer-${index}.png`),
          indexMap: '/Game/index.png',
          indexUv: 1,
        },
      }),
      texture: async (reference: string | undefined) => (reference ? image : null),
    };
    await bindExportedMaterials(document, 'Dune/Meshes/foundation.glb', resolver);
    const layers = material.getExtras().arrakisLayers;
    expect(layers.count).toBe(12);
    expect(layers.missing).toBe(0);
    expect(layers.index).toMatch(/^data:image\/png;base64,/);
    expect(layers.atlas).toMatch(/^data:image\/webp;base64,/);
  });
  it('reconstructs upward-facing normals from Unreal alpha and green channels', () => {
    const result = unpackUnrealNormal(Buffer.from([0, 128, 0, 128]));
    expect(result[0]).toBe(128);
    expect(result[1]).toBe(128);
    expect(result[2]).toBe(255);
    expect(result[3]).toBe(255);
  });
  it('reads raw FModel parameters without guessing between multiple layers', () => {
    const parameter = (name: string, index: number, value: string) => ({
      ParameterInfo: { Name: name, Association: 'LayerParameter', Index: index },
      ParameterValue: { ObjectPath: value },
    });
    const single = [
      { Properties: { TextureParameterValues: [parameter('Layer BaseColor', 0, '/Game/Dune/stone.stone')] } },
    ];
    expect(normalizeExportedMaterial(single)?.Textures['Layer BaseColor']).toBe('/Game/Dune/stone.stone');
    const multiple = [
      {
        Properties: {
          TextureParameterValues: [
            parameter('Layer BaseColor', 0, '/Game/Dune/stone.stone'),
            parameter('Layer BaseColor', 1, '/Game/Dune/metal.metal'),
          ],
        },
      },
    ];
    expect(normalizeExportedMaterial(multiple)?.Textures['Layer BaseColor']).toBeUndefined();
  });
  it('uses the first texture from a layered export as an approximation', () => {
    const data = [
      {
        Properties: {
          TextureParameterValues: [
            {
              ParameterInfo: { Name: 'Layer BaseColor', Association: 'GlobalParameter' },
              ParameterValue: { ObjectPath: '/Game/Material.1' },
            },
          ],
        },
      },
      {
        Type: 'Texture2DRefArray',
        Properties: {
          Textures: [{ ObjectPath: '/Game/Dune/first.first' }, { ObjectPath: '/Game/Dune/second.second' }],
        },
      },
    ];
    expect(normalizeExportedMaterial(data)?.Textures['Layer BaseColor']).toBe('/Game/Dune/first.first');
  });
  it('embeds real surface maps and skips placeholders and invalid paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arrakis-material-'));
    try {
      await mkdir(path.join(root, 'Dune', 'Materials'), { recursive: true });
      await mkdir(path.join(root, 'Dune', 'Textures'), { recursive: true });
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#887766' } })
        .png()
        .toBuffer();
      await writeFile(path.join(root, 'Dune', 'Textures', 'surface.png'), png);
      await writeFile(
        path.join(root, 'Dune', 'Materials', 'Wall.json'),
        JSON.stringify({
          Parameters: { Switches: { UseTilingTexturesUVChannel: true } },
          Textures: {
            'Layer BaseColor': '/Game/Dune/Textures/surface.surface',
            'Layer Normal': '/Game/Dune/Textures/surface.surface',
          },
        }),
      );
      await writeFile(
        path.join(root, 'Dune', 'Materials', 'Foundation.json'),
        JSON.stringify({
          Textures: {
            'Layer BaseColor': '/Game/Dune/Dev/checker.checker',
            Normal: '/Game/../outside.outside',
          },
        }),
      );
      const resolver = await createMaterialResolver(root);
      const document = new Document();
      document.createBuffer();
      const wall = document.createMaterial('Wall');
      const foundation = document.createMaterial('Foundation');
      const positions = document
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(document.getRoot().listBuffers()[0]);
      const uv = document
        .createAccessor()
        .setType('VEC2')
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
        .setBuffer(document.getRoot().listBuffers()[0]);
      const primitive = document
        .createPrimitive()
        .setAttribute('POSITION', positions)
        .setAttribute('TEXCOORD_1', uv)
        .setMaterial(wall);
      document.createMesh().addPrimitive(primitive);
      const result = await bindExportedMaterials(document, 'Dune/Meshes/wall.glb', resolver);
      expect(result).toEqual({ colorMaps: 1, normalMaps: 1 });
      expect(wall.getBaseColorTexture()).toBe(wall.getNormalTexture());
      expect(wall.getBaseColorTextureInfo()?.getTexCoord()).toBe(1);
      expect(wall.getNormalTextureInfo()?.getTexCoord()).toBe(1);
      expect(foundation.getBaseColorTexture()).toBeNull();
      expect(foundation.getNormalTexture()).toBeNull();
      const bytes = await new NodeIO().writeBinary(document);
      const reread = await new NodeIO().readBinary(bytes);
      expect(reread.getRoot().listTextures()[0].getImage()).toBeTruthy();
      expect(await resolver.texture('/Game/../outside.outside')).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
