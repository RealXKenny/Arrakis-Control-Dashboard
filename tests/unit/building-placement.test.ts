import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BuildingLibrary, toSceneMatrix, unrealMatrix } from '../../src/modules/map/terrain/buildingModels';

function triangleGlb() {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [2, 3, 4] }],
    }),
  );
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + length + 8 + 36);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(32, 20, 20 + length);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(36, 20 + length);
  bytes.writeUInt32LE(0x004e4942, 24 + length);
  Buffer.from(new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 4]).buffer).copy(bytes, 28 + length);
  return bytes;
}

afterEach(() => vi.unstubAllGlobals());

it('places every visual template using native actor and catalogue transforms, including new names and furniture', async () => {
  const templates = [
    'Atreides_Outpost_Stairs',
    'Atreides_Outpost_Ramp',
    'Atreides_Outpost_Roof_Half',
    'Atreides_Outpost_Wall_Inclined_Wide_Left',
    'Atreides_Outpost_Floor_Triangle_Wide_Left',
    'New_Faction_Railing_Corner_Bottom_Right',
  ];
  const local = { offset: [50, -75, 125], rot: [10, 25, -15], scale: [1.2, 0.8, 1.5] };
  const model = triangleGlb();
  const catalog = {
    rows: Object.fromEntries(templates.map((id, index) => [id, { mesh: index, group: 'Test', ...local }])),
    meshes: templates.map(() => ({ pack: 0, offset: 0, length: model.length, tris: 1, format: 'glb' })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          new Uint8Array(gzipSync(url.endsWith('visual-catalog.json.gz') ? JSON.stringify(catalog) : model)),
        ),
    ),
  );
  for (const placeable of [false, true]) {
    const library = new BuildingLibrary(undefined, { visual: true });
    const pieces = templates.flatMap((building_type) =>
      [-350, 0, 30, 90, 180, 280].map((yaw) => ({
        building_type,
        x: 100,
        y: 200,
        z: 300,
        rotation: yaw,
        ry: yaw,
        rx: 20,
        rz: -10,
      })),
    );
    const built = await library.build({ instances: placeable ? [] : pieces, placeables: placeable ? pieces : [] });
    expect(built.pieces).toBe(pieces.length);
    expect(built.parts.map((part) => part.templateId).sort()).toEqual([...templates].sort());
    for (const [index, id] of templates.entries()) {
      const mesh = built.group.getObjectByName(`building-mesh-${index}:Test`) as THREE.InstancedMesh;
      expect(mesh, id).toBeDefined();
      for (const [instance, yaw] of [-350, 0, 30, 90, 180, 280].entries()) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(instance, matrix);
        const expected = toSceneMatrix(
          unrealMatrix([100, 200, 300], [placeable ? 20 : 0, yaw, placeable ? -10 : 0]).multiply(
            unrealMatrix([50, -75, 125], [10, 25, -15], [1.2, 0.8, 1.5]),
          ),
        );
        matrix.elements.forEach((value, component) =>
          expect(value, `${id} yaw ${yaw}`).toBeCloseTo(expected.elements[component], 5),
        );
      }
      mesh.dispose();
    }
    library.dispose();
  }
});
