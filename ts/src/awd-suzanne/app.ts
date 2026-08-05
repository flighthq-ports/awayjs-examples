import type {
  BlinnPhongMaterial,
  Material,
  Mesh,
  PerspectiveProjection,
  Scene3DHit,
} from '@flighthq/sdk';
import {
  addNodeChild,
  appendMatrix4,
  createBlinnPhongMaterial,
  createFxaaEffect,
  createMatrix4,
  createMesh,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DHit,
  createScene3DLights,
  createToneMapEffect,
  createVector3,
  DEG_TO_RAD,
  findNode,
  getNodeLocalMatrix4,
  isMesh,
  pickScene3D,
  rotateMatrix4,
  scaleMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  setDirectionalLightTarget,
  setMatrix4Identity,
  setNodeLocalMatrix4,
  translateMatrix4,
} from '@flighthq/sdk';
import { awayDirection, createCameraFromAway, setAwayPosition } from '../../shared/camera';
import { applyAwayGloss, createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, far: 6000 });

// Original Away3D light values (see awayjs/src/app.ts): an orange key over a blue ambient. The AWD's
// own texture is a near-white AO map, so all of the model's color comes from these lights. The shared
// helper converts the AwayJS diffuse/ambient intensities and sRgb colors into Flight's linear-HDR
// equivalents — see agents/conventions/lighting.md.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(1, 0, 0),
  color: 0x683019,
  diffuse: 2.8,
  ambient: 0.1,
  ambientColor: 0x85b2cd,
  // Flight look tuning (see AwayLightTuning). Flight is linear + energy-correct where AwayJS is
  // gamma-space and clips, so a faithful conversion renders flatter and cooler. The AwayJS ambient is a
  // dim blue that its pipeline shows as a barely-there lift; in linear space that sRgb blue reads as a
  // haze, so the fill is retuned to copper — the reference is monochromatic copper (dark-copper shadows,
  // not gray or blue), and a white/blue fill grays the shadows and washes the head pale.
  tuning: {
    diffuse: 0.95,
    ambient: 0.6,
    ambientColor: 0xa06038,
  },
});
const lights = createScene3DLights({ ambient, directional });

const hoverMaterial: Material = createBlinnPhongMaterial({
  diffuse: 0xff0000ff,
  specular: 0x000000ff,
});

const buffer = await fetch('/suzanne.awd').then((r) => r.arrayBuffer());
const modelScene = createScene3DFromAwd2(new Uint8Array(buffer));

const templateMesh = findNode(modelScene.root, isMesh) as Mesh | null;
if (!templateMesh?.geometry) throw new Error('No mesh found in suzanne.awd');
const templateGeometry = templateMesh.geometry;
const defaultMaterial = templateMesh.materials[0] as BlinnPhongMaterial;
// AwayJS lit this with a glossy MethodMaterial (default gloss 50) boosted by light.specular = 1.8. The AWD
// imports near-matte, so re-derive the tight bright highlight from those literals — otherwise the flat
// headlight reads as matte orange silicone rather than darker glossy paint.
applyAwayGloss(defaultMaterial, { gloss: 50, specular: 1.8 });

// The AWD mesh node carries a 90°-X that stands the Z-up geometry upright in Y-up world. We instance
// bare geometry across the scene, so re-apply that authored orientation as the innermost transform
// on every instance (append = applied first to the vertex). For this asset the mesh sits directly
// under the scene root, so its localMatrix is already the world orientation.
const orient = createMatrix4();
const orientSource = getNodeLocalMatrix4(templateMesh);
orient.m.set(orientSource.m);

const yAxis = createVector3(0, 1, 0);

const scratchMatrix = createMatrix4();

function placeMesh(scale: number, tx: number, ty: number, tz: number, rotationY: number): Mesh {
  const mesh = createMesh(templateGeometry, [defaultMaterial]);
  setMatrix4Identity(scratchMatrix);
  translateMatrix4(scratchMatrix, scratchMatrix, tx, ty, tz);
  rotateMatrix4(scratchMatrix, scratchMatrix, yAxis, rotationY);
  scaleMatrix4(scratchMatrix, scratchMatrix, scale, scale, scale);
  appendMatrix4(scratchMatrix, scratchMatrix, orient);
  setNodeLocalMatrix4(mesh, scratchMatrix);
  addNodeChild(scene.root, mesh);
  return mesh;
}

placeMesh(500, 0, -100, 0, 0);

for (let i = 0; i < 80; i++) {
  const scale = 50 + Math.random() * 150;
  placeMesh(
    scale,
    (Math.random() - 0.5) * 4000,
    (Math.random() - 0.5) * 4000,
    (Math.random() - 0.5) * 4000,
    Math.random() * 360 * DEG_TO_RAD,
  );
}

let cameraAngle = 0;
const distance = 1400;
const lookAt = createVector3(0, 0, 0);
const up = createVector3(0, 1, 0);
const eye = createVector3(0, 0, 0);

function updateCamera(): void {
  setAwayPosition(eye, Math.cos(cameraAngle) * distance, 0, Math.sin(cameraAngle) * distance);
  setCamera3DViewMatrix4FromLookAt(camera, eye, lookAt, up);
}

let lastHovered: Mesh | null = null;
const hit: Scene3DHit = createScene3DHit();

ctx.canvas.addEventListener('mousemove', (e: MouseEvent) => {
  const rect = ctx.canvas.getBoundingClientRect();
  // pickScene3D expects normalized device coordinates in [-1, 1], not pixels; the Y axis flips (screen
  // Y grows down, NDC Y grows up). Using rect dimensions keeps this correct under devicePixelRatio.
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  const result = pickScene3D(scene.root, camera, ndcX, ndcY, hit);

  if (lastHovered && lastHovered !== result?.node) {
    lastHovered.materials[0] = defaultMaterial;
    lastHovered = null;
  }

  const mesh = result?.node ?? null;
  if (mesh) {
    mesh.materials[0] = hoverMaterial;
    lastHovered = mesh;
  }
});

updateCamera();

function frame(): void {
  cameraAngle += 0.01;
  updateCamera();

  // Headlight matching AwayJS's per-frame `light.direction = -cameraPos`: the key travels from the
  // camera toward the model, so the face the viewer sees is always the lit side.
  setDirectionalLightTarget(directional, eye.x, eye.y, eye.z, lookAt.x, lookAt.y, lookAt.z);

  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pr;
  ctx.canvas.height = h * pr;
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
