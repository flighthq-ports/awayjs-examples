import type {
  PerspectiveProjection,
} from '@flighthq/sdk';
import {
  addNodeChild,
  BlendMode,
  copyQuaternion,
  createBoxMeshGeometry,
  createCustomShaderMaterial,
  createFxaaEffect,
  createMesh,
  createQuaternion,
  createSampler,
  createScene3D,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  multiplyQuaternion,
  registerGlCustomMaterialShader,
  registerGlCustomShaderMaterial,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import { awayDirection, awayPosition, createCameraFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const DEG = Math.PI / 180;
const CUTOUT_SHADER = 'cubePrimitiveCutout';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});

registerGlCustomShaderMaterial(ctx.state);
registerGlCustomMaterialShader(ctx.state, CUTOUT_SHADER, {
  vertex: `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
out vec3 v_normal;
out vec2 v_uv;
void main() {
  v_normal = u_normalMatrix * a_normal;
  v_uv = a_uv0;
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}`,
  fragment: `#version 300 es
precision highp float;
in vec3 v_normal;
in vec2 v_uv;
uniform sampler2D u_diffuseMap;
uniform vec3 u_diffuseTint;
uniform vec3 u_lightDirection;
uniform vec3 u_lightRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_contribution;
out vec4 o_color;
void main() {
  vec4 texel = texture(u_diffuseMap, v_uv);
  // Reject filtered transition texels; leaving them blended turns the lit side of each transparent
  // window into a pale outline on both the cube and the more heavily minified torus.
  if (texel.a < 0.99) discard;
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  float nDotL = max(dot(normal, -normalize(u_lightDirection)), 0.0);
  vec3 albedo = texel.rgb * u_diffuseTint;
  vec3 radiance = albedo * (u_ambientRadiance + u_lightRadiance * nDotL);
  o_color = vec4(radiance * u_contribution, u_contribution);
}`,
});

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

const image = await loadImageResourceFromUrl('spacy_texture.png');
// The texture contains hard, binary-alpha window cutouts. Mipmap averaging turns those cutouts into
// bright partial-coverage texels, which show up as pale borders under additive blending. Match the
// source ImageSampler's smooth base-level sampling without generating alpha-bleeding mip levels.
const texture = createTexture({
  source: image,
  sampler: createSampler({ magFilter: 'linear', minFilter: 'linear', mipmaps: false }),
});

// AwayJS MethodMaterial is a classic lit material. Keep the same bright, non-PBR response for both
// meshes, but let the cube contribute less additive radiance so the background remains visible
// through its body as it does in AwayJS. The hard alpha boundary remains identical for both.
function createCutoutMaterial(contribution: number) {
  return createCustomShaderMaterial({
    shaderKey: CUTOUT_SHADER,
    textures: { u_diffuseMap: texture },
    uniforms: {
      // Linear-space equivalents of the source white material and AwayJS light values.
      u_diffuseTint: [1, 1, 1],
      u_lightDirection: [1, 0, 0],
      u_lightRadiance: [2.8, 2.8, 2.8],
      u_ambientRadiance: [0.094, 0.178, 0.244],
      u_contribution: contribution,
    },
    alphaMode: 'blend',
    blendMode: BlendMode.Add,
    doubleSided: true,
  });
}

const torusMaterial = createCutoutMaterial(1);
const cubeMaterial = createCutoutMaterial(0.55);

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

frame();
