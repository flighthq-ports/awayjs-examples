import { webHostImage } from '@flighthq/host-web';
import {
  addNodeChild,
  BlendMode,
  copyQuaternion,
  createBoxMeshGeometry,
  createBlinnPhongMaterial,
  createMesh,
  createQuaternion,
  createSampler,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  multiplyQuaternion,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import { awayDirection, awayPosition, createCameraFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { setupRenderer } from './render.gl';

const DEG = Math.PI / 180;
const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 120, near: 0.1 });

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(1, 0, 0),
  color: 0xffffff,
  diffuse: 2.8,
  ambient: 0.4,
  ambientColor: 0x85b2cd,
  shading: 'phong',
});
const lights = createScene3DLights({ ambient, directional });

const image = await loadImageResourceFromUrl(webHostImage, 'spacy_texture.png');
// The texture contains hard, binary-alpha window cutouts. Mipmap averaging turns those cutouts into
// bright partial-coverage texels, which show up as pale borders under additive blending. Match the
// source ImageSampler's smooth base-level sampling without generating alpha-bleeding mip levels.
const texture = createTexture({
  source: image,
  sampler: createSampler({ magFilter: 'linear', minFilter: 'linear', mipmaps: false }),
});

/**
 * AwayJS MethodMaterial is a classic lit material, so this is BlinnPhongMaterial — the Flight model
 * that keeps the same gamma-space Lambert term with no energy-conserving /π divide. That is the whole
 * reason the lights above are built with `shading: 'phong'`; see shared/lighting.ts.
 *
 * The additive blend is AwayJS's own, not a stand-in for translucency. What the mesh contributes is
 * decided by how the light model shades it, so both meshes take the same material and the scene lights
 * drive them — an earlier hand-rolled Lambert shader here computed its own radiance from hardcoded
 * uniforms, ignored those lights entirely, and had to dim the cube by a fixed 0.55 to stop it washing
 * out. With the matching model that scaling is not needed.
 *
 * `mask` at 0.99 rather than `blend`: the texture's window cutouts are binary, and any partial-coverage
 * texel additively blends into a pale outline around every window.
 */
function createCutoutMaterial() {
  return createBlinnPhongMaterial({
    diffuse: 0xffffffff,
    diffuseMap: texture,
    // The source material carries no specular lobe, and an additive one would read as blown highlights.
    specular: 0x000000ff,
    alphaMode: 'mask',
    alphaCutoff: 0.99,
    blendMode: BlendMode.Add,
    doubleSided: true,
  });
}

const torusMaterial = createCutoutMaterial();
const cubeMaterial = createCutoutMaterial();

const torusGeometry = createTorusMeshGeometry(150, 80, 32, 16);
const torus = createMesh(torusGeometry, [torusMaterial]);
addNodeChild(scene.root, torus);

const cubeGeometry = createBoxMeshGeometry(20, 20, 20);
const cube = createMesh(cubeGeometry, [cubeMaterial]);
setVector3(cube.position, ...awayPosition(130, 0, 40));
invalidateNodeLocalTransform(cube);
addNodeChild(scene.root, cube);

const eye = createVector3(130, 0, 0);
const lookTarget = createVector3(...awayPosition(130, 0, 40));
const up = createVector3(0, 1, 0);
const xAxis = createVector3(1, 0, 0);
const yAxis = createVector3(0, 1, 0);
const scratchQuatA = createQuaternion();
const scratchQuatB = createQuaternion();

let cameraAngle = 0;
let torusAngleY = 0;
let cubeAngleX = 0;
let cubeAngleY = 0;

setCamera3DViewMatrix4FromLookAt(camera, eye, lookTarget, up);

function frame(): void {
  cameraAngle += DEG;
  torusAngleY -= DEG;
  cubeAngleX -= 0.4 * DEG;
  cubeAngleY -= 0.4 * DEG;

  up.x = -Math.sin(cameraAngle);
  up.y = Math.cos(cameraAngle);
  up.z = 0;

  setCamera3DViewMatrix4FromLookAt(camera, eye, lookTarget, up);

  setQuaternionFromAxisAngle(scratchQuatA, yAxis, torusAngleY);
  setQuaternionFromAxisAngle(scratchQuatB, xAxis, Math.PI / 2);
  multiplyQuaternion(scratchQuatA, scratchQuatA, scratchQuatB);
  copyQuaternion(torus.rotation, scratchQuatA);
  invalidateNodeLocalTransform(torus);

  setQuaternionFromAxisAngle(scratchQuatA, yAxis, cubeAngleY);
  setQuaternionFromAxisAngle(scratchQuatB, xAxis, cubeAngleX);
  multiplyQuaternion(scratchQuatA, scratchQuatA, scratchQuatB);
  copyQuaternion(cube.rotation, scratchQuatA);
  invalidateNodeLocalTransform(cube);

  renderer.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
