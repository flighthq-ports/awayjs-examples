import type {
  Mesh,
  Node3D,
  PerspectiveProjection,
  StandardPbrMaterial,
} from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  buildBitmapGradientRamp,
  computeMeshGeometryNormals,
  copyQuaternion,
  createBitmap,
  createBitmapRegion,
  createCubeTexture,
  createEmissiveMaterial,
  createEnvironment,
  createFxaaEffect,
  createImageResourceFromBitmap,
  createMesh,
  createNode3D,
  createQuaternion,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  DEG_TO_RAD,
  fillBitmapLinearGradient,
  getNodeChildren,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  packOpaqueColor,
  setCubeTextureFace,
  setQuaternionFromAxisAngle,
  setTextureUvScale,
  setVector3,
} from '@flighthq/sdk';

import { awayDirection, createCameraFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { ARMOR_RAMP, buildMetallicRoughnessMap, colorizeByLuminance, STONE_RAMP, VISOR_RAMP } from './colorize';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: packOpaqueColor(0xcec8c6),
  effects: [createToneMapEffect({ operator: 'aces' }), createFxaaEffect()],
});

const scene = createScene3D();

// Far plane raised to enclose the sky dome below.
const camera = createCameraFromAway({ y: 20, z: -50, targetY: 20, fov: 60, near: 0.1, far: 9000 });

// Sky: AwayJS just clears to flat 0xcec8c6. Instead, build a vertical-gradient dome — a large emissive
// (self-lit, unaffected by scene lights) sphere seen from the inside (doubleSided). A tall 1-px-wide
// Bitmap is filled with a linear gradient ramp (warm hazy horizon -> cooler zenith) and mapped up the
// sphere's latitude, so the horizon sits at the equator and the zenith at the top pole. Emissive values
// stay < 1 so the ACES pass keeps them in range.
const SKY_STOPS = { colors: [0x3f74c4, 0xa9c6e6, 0xead9b8], alphas: [1, 1, 1], ratios: [0, 132, 255] };
const skyRamp = new Uint8ClampedArray(256 * 4);
buildBitmapGradientRamp(skyRamp, SKY_STOPS.colors, SKY_STOPS.alphas, SKY_STOPS.ratios);
const skySurface = createBitmap(1, 256);
fillBitmapLinearGradient(createBitmapRegion(skySurface), skyRamp, 0, 0, 0, 256);
const skyMaterial = createEmissiveMaterial({
  emissive: 0xffffffff,
  emissiveMap: createTexture({ source: createImageResourceFromBitmap(skySurface) }),
  emissiveStrength: 1.35,
});
skyMaterial.doubleSided = true;
const skyDome = createMesh(createSphereMeshGeometry(6000, 32, 16), [skyMaterial]);
addNodeChild(scene.root, skyDome);

// Metallic surfaces need an environment to reflect. There's no HDR map here, so bake a cheap IBL from a
// solid-color cube — sky blue overhead (+Y), warm dirt below (-Y), horizon on the sides. The bake blurs
// it, so flat faces are plenty; this is what lets the metallic armor read as metal instead of going gray.
// Kept at a modest intensity so it mainly feeds the metal reflection, not a strong blue diffuse fill.
const SKY_REFLECT = 0x8fb3dcff;
const HORIZON_REFLECT = 0xc3c9c8ff;
const GROUND_REFLECT = 0x9a6a42ff;
const envFaces = [HORIZON_REFLECT, HORIZON_REFLECT, SKY_REFLECT, GROUND_REFLECT, HORIZON_REFLECT, HORIZON_REFLECT];
const envCube = createCubeTexture();
for (let i = 0; i < 6; i++) {
  setCubeTextureFace(envCube, i, createImageResourceFromBitmap(createBitmap(8, 8, envFaces[i])));
}
const environment = createEnvironment({ environment: envCube, intensity: 0.55 });
bakeGlEnvironmentIbl(ctx.state, environment);

// Now that the colorized albedo carries the palette, the light just shades it: a warm-white key (a
// saturated orange key would muddy the olive/orange albedo) with a cool ambient fill for contrast.
// Exposure is moderated so the key lands in the colorful range and the ACES pass (below) compresses the
// highlights instead of clipping the lit surfaces to flat white.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(1, 0, 0),
  color: 0xffe8d0,
  diffuse: 2.8,
  ambient: 0.4,
  ambientColor: 0x85b2cd,
  tuning: { diffuse: 0.45, ambient: 0.5 },
});
const lights = createScene3DLights({ ambient, directional });

const spartanContainer = createNode3D();
setVector3(spartanContainer.scale, 0.25, 0.25, 0.25);
invalidateNodeLocalTransform(spartanContainer);
addNodeChild(scene.root, spartanContainer);

const [spartanObjText, terrainObjText, masterchiefImage, stoneImage] = await Promise.all([
  fetch('/Halo_3_SPARTAN4.obj').then((r) => r.text()),
  fetch('/terrain.obj').then((r) => r.text()),
  loadImageResourceFromUrl('/masterchief_base.png'),
  loadImageResourceFromUrl('/stone_tx.jpg'),
]);

// Scalars stay 1 so the metallicRoughnessMap fully drives both channels per region.
const masterchiefMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  metallic: 1,
  roughness: 1,
});
masterchiefMaterial.baseColorMap = createTexture({
  source: colorizeByLuminance(masterchiefImage, ARMOR_RAMP, VISOR_RAMP),
});
masterchiefMaterial.metallicRoughnessMap = createTexture({
  source: buildMetallicRoughnessMap(masterchiefImage),
});

const stoneMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  metallic: 0,
  roughness: 0.85,
});
const stoneTexture = createTexture({
  source: colorizeByLuminance(stoneImage, STONE_RAMP),
  sampler: createTilingSampler(),
});
setTextureUvScale(stoneTexture, 20, 20);
stoneMaterial.baseColorMap = stoneTexture;

function applyMaterialToObjScene(objScene: Node3D, material: StandardPbrMaterial): void {
  for (const child of getNodeChildren(objScene)) {
    const mesh = child as Mesh;
    if (mesh.geometry) {
      computeMeshGeometryNormals(mesh.geometry, mesh.geometry);
      if (mesh.materials) {
        if (mesh.materials.length === 0) {
          mesh.materials.push(material);
        } else {
          for (let i = 0; i < mesh.materials.length; i++) {
            mesh.materials[i] = material;
          }
        }
      }
    }
  }
}

const spartanScene = createScene3DFromObj(spartanObjText);
applyMaterialToObjScene(spartanScene.root, masterchiefMaterial);
for (const child of getNodeChildren(spartanScene.root)) {
  addNodeChild(spartanContainer, child);
}

const terrainScene = createScene3DFromObj(terrainObjText);
applyMaterialToObjScene(terrainScene.root, stoneMaterial);
let terrainNode: Node3D | undefined;
for (const child of getNodeChildren(terrainScene.root)) {
  addNodeChild(scene.root, child);
  if (!terrainNode) terrainNode = child;
}

if (terrainNode) {
  terrainNode.position.y = 98;
  invalidateNodeLocalTransform(terrainNode);
}

const yAxis = createVector3(0, 1, 0);
const scratchQuat = createQuaternion();
let spartanRotationY = 0;
let terrainRotationY = 0;

function frame(): void {
  spartanRotationY -= 0.4 * DEG_TO_RAD;
  terrainRotationY -= 0.4 * DEG_TO_RAD;

  setVector3(spartanContainer.scale, 0.25, 0.25, 0.25);
  setQuaternionFromAxisAngle(scratchQuat, yAxis, spartanRotationY);
  copyQuaternion(spartanContainer.rotation, scratchQuat);
  invalidateNodeLocalTransform(spartanContainer);

  if (terrainNode) {
    terrainNode.position.y = 98;
    setQuaternionFromAxisAngle(scratchQuat, yAxis, terrainRotationY);
    copyQuaternion(terrainNode.rotation, scratchQuat);
    invalidateNodeLocalTransform(terrainNode);
  }

  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pixelRatio;
  ctx.canvas.height = h * pixelRatio;
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
