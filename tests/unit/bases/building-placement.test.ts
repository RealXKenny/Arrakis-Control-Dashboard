import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BuildingLibrary, toSceneMatrix, unrealMatrix } from '../../../src/features/map/terrain/models/buildingModels';

/** One-triangle DML1 mesh in the client pack format. */
function triangleMesh() {
  const bytes = Buffer.alloc(62);
  bytes.writeUInt32LE(0x314c4d44, 0);
  bytes.writeUInt32LE(3, 4);
  bytes.writeUInt32LE(3, 8);
  [0, 0, 0, 200, 300, 400].forEach((value, index) => bytes.writeFloatLE(value, 12 + index * 4));
  [0, 0, 0, 65535, 0, 0, 0, 65535, 65535].forEach((value, index) => bytes.writeUInt16LE(value, 36 + index * 2));
  [0, 1, 2].forEach((value, index) => bytes.writeUInt16LE(value, 56 + index * 2));
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
  const model = triangleMesh();
  const catalog = {
    rows: Object.fromEntries(templates.map((id, index) => [id, { mesh: index, group: 'Test', ...local }])),
    meshes: templates.map(() => ({ pack: 0, offset: 0, length: model.length, tris: 1 })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          new Uint8Array(gzipSync(url.endsWith('client/catalog.json.gz') ? JSON.stringify(catalog) : model)),
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
