import type {
  BlinnPhongMaterial,
  Material,
  Mesh,
  Node3D,
  ObjMaterialLibrary,
  StandardPbrMaterial,
  Vector3,
} from '@flighthq/sdk';
import {
  computeMeshGeometryNormals,
  createScene3DFromObj,
  createStandardPbrMaterial,
  createTexture,
  createVector3,
  forEachNodeDescendant,
  isMesh,
  loadImageResourceFromUrl,
  parseObjMaterialLibrary,
} from '@flighthq/sdk';

// The articulated F14. The upstream AwayJS demo lets the OBJ loader assign a material per part from
// f14d.mtl; its `MethodMaterial(seaNormal)` local is dead code, never bound to the geometry, so each part
// actually wears its own map_Kd texture. We reproduce that per-part texturing while keeping a metallic-PBR
// jet: parse the MTL and build the scene against it so every `usemtl` subset keeps its own material slot,
// then swap each slot for a StandardPbrMaterial carrying that part's map_Kd as baseColorMap (one shared
// material per texture). Parts with no map_Kd fall back to a plain metallic material.
export interface Aircraft {
  // Root node the demo scales/rotates/flies. Not yet parented — the caller adds it to the scene.
  container: Node3D;
  // Articulated groups, driven by the caller each frame.
  gearMeshes: Mesh[];
  leftWing: Mesh[];
  rightWing: Mesh[];
}

const f14AssetBase = 'f14';

// The OBJ splits each movable wing across seven named groups. Bind the articulation to those groups
// directly: their geometry bounds can change when parser internals or vertex layouts change, while the
// authored group names describe the model parts that are meant to move.
const LEFT_WING_PART_NAMES = new Set(['Part174', 'Part176', 'Part177', 'Part178', 'Part179', 'Part180', 'Part181']);
const RIGHT_WING_PART_NAMES = new Set(['Part165', 'Part166', 'Part168', 'Part169', 'Part170', 'Part171', 'Part172']);

// Each MTL map_Kd is a bare filename (f14fuselage.jpg). A Texture no longer carries its own resource
// reference — unresolved refs live on the scene's resource working set — so read the filename straight
// off the parsed material library by material name, load each image once from the f14 asset directory,
// and build one PBR material per texture.
function f14DiffuseUri(library: ObjMaterialLibrary, material: Material | null): string | null {
  const name = material?.name;
  return name == null ? null : (library.materials.get(name)?.mapDiffuse ?? null);
}

// A mesh's position-bounds midpoint places landing-gear parts into the gear envelope below.
function meshCenter(mesh: Mesh): Vector3 | null {
  const geometry = mesh.geometry;
  if (!geometry) return null;
  const v = geometry.vertices;
  const stride = geometry.layout.stride / 4; // floats per vertex; position is the first three
  if (stride === 0 || v.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < v.length; i += stride) {
    const x = v[i];
    const y = v[i + 1];
    const z = v[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return createVector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
}

export async function createAircraft(): Promise<Aircraft> {
  const f14ObjText = await fetch(`${f14AssetBase}/f14d.obj`).then((r) => r.text());
  const f14MtlText = await fetch(`${f14AssetBase}/f14d.mtl`).then((r) => r.text());
  const f14Library = parseObjMaterialLibrary(f14MtlText);

  const f14Scene = createScene3DFromObj(f14ObjText, f14Library);
  const f14Meshes: Mesh[] = [];
  // Parser scene structure is not part of the model's articulation: collect meshes at any depth instead
  // of assuming that every OBJ group is a direct child of the scene root.
  forEachNodeDescendant(f14Scene.root, (node) => {
    if (isMesh(node)) f14Meshes.push(node);
  });

  const f14PlainMaterial: StandardPbrMaterial = createStandardPbrMaterial({
    baseColor: 0xccccccff,
    metallic: 0.7,
    roughness: 0.2,
  });

  const f14DiffuseUris = new Set<string>();
  for (const mesh of f14Meshes) {
    for (const material of mesh.materials ?? []) {
      const uri = f14DiffuseUri(f14Library, material);
      if (uri !== null) f14DiffuseUris.add(uri);
    }
  }

  const f14MaterialByUri = new Map<string, StandardPbrMaterial>();
  await Promise.all(
    Array.from(f14DiffuseUris, async (uri) => {
      const image = await loadImageResourceFromUrl(`${f14AssetBase}/${uri}`);
      f14MaterialByUri.set(
        uri,
        createStandardPbrMaterial({
          baseColor: 0xffffffff,
          baseColorMap: createTexture({ source: image }),
          metallic: 0.7,
          roughness: 0.2,
        }),
      );
    }),
  );

  // Canopy glass — MTL Material__33 (dissolve 0.38) is the only translucent part, which the parser
  // surfaces as an alpha-blended BlinnPhong. Replace it with a see-through tinted glass: near-mirror
  // smoothness, a faint blue tint, and a low baseColor alpha so the cockpit shows through. Tint, opacity
  // (the low byte of baseColor), and roughness are the knobs to dial the look.
  const f14CanopyGlass: StandardPbrMaterial = createStandardPbrMaterial({
    baseColor: 0x0c1622aa,
    metallic: 0.1,
    roughness: 0.05,
  });
  f14CanopyGlass.alphaMode = 'blend';
  f14CanopyGlass.doubleSided = true;

  const gearMeshes: Mesh[] = [];
  const leftWing: Mesh[] = [];
  const rightWing: Mesh[] = [];

  for (const mesh of f14Meshes) {
    if (RIGHT_WING_PART_NAMES.has(mesh.name ?? '')) rightWing.push(mesh);
    else if (LEFT_WING_PART_NAMES.has(mesh.name ?? '')) leftWing.push(mesh);

    if (mesh.geometry) computeMeshGeometryNormals(mesh.geometry, mesh.geometry);
    const materials = mesh.materials;
    if (!materials) continue;
    let isGear = false;
    for (let i = 0; i < materials.length; i++) {
      const source = materials[i] as BlinnPhongMaterial | null;
      if (source?.alphaMode === 'blend') {
        materials[i] = f14CanopyGlass;
        continue;
      }
      const uri = f14DiffuseUri(f14Library, source);
      if (uri === 'f14landinggear.jpg') isGear = true;
      materials[i] = (uri !== null ? f14MaterialByUri.get(uri) : undefined) ?? f14PlainMaterial;
    }
    // The two discs just inside the exhaust nozzles are visible down the tailpipes. Keep their original
    // diffuse texture as both the base and emissive map so panel/grime detail remains visible, then push
    // the warm emissive above 1.0 so the aircraft demo's bloom pass can form the engine halo.
    if (mesh.name === 'Part187' || mesh.name === 'Part188') {
      const worn = materials[0] as StandardPbrMaterial | null;
      const map = worn?.baseColorMap ?? null;
      const engineInterior = createStandardPbrMaterial({
        baseColor: 0x2a1c12ff,
        baseColorMap: map,
        metallic: 0.4,
        roughness: 0.5,
        emissive: 0xff5a1eff,
        emissiveMap: map,
        emissiveStrength: 10,
      });
      for (let i = 0; i < materials.length; i++) materials[i] = engineInterior;
      continue;
    }
    const center = meshCenter(mesh);
    // Landing gear: the gear-textured struts, plus the full main-gear clusters (hanging low, outboard of
    // centerline, forward of the tail) and the two nose-gear struts by name. The nose gear is otherwise
    // interlocked with the lower-nose fuselage, so an envelope alone can't separate it cleanly.
    const inMainGear =
      center !== null && Math.abs(center.x) > 1.5 && center.y > -3.3 && center.y < -2 && center.z < -0.3;
    if (isGear || inMainGear || mesh.name === 'Part48' || mesh.name === 'Part120') {
      gearMeshes.push(mesh);
      continue;
    }
  }

  if (leftWing.length === 0 || rightWing.length === 0) {
    console.warn('Aircraft wing articulation could not find both authored wing groups.');
  }

  const container = f14Scene.root;

  return { container, gearMeshes, leftWing, rightWing };
}
