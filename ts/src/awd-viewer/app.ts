import type { Mesh } from '@flighthq/sdk';
import type {
  PerspectiveProjection,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  addNodeChild,
  createBuiltInScene3DResourceResolver,
  createFxaaEffect,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLightsFromDocument,
  createToneMapEffect,
  isMesh,
  loadScene3DResources,
  parseAwd2,
  prepareMeshSkinning,
  updateMeshSkin,
  walkNodeDescendants,
} from '@flighthq/sdk';

import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createAnimationState } from './animation';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  // AwayJS used the sRGB display color 0x333338. Flight clears into the linear-HDR scene target and the
  // present pass applies the linear->sRGB encode, so a raw 0x333338 clear would display much lighter
  // (~0x7c7c81). Pre-linearize to the value that presents back as 0x333338.
  backgroundColor: 0x08080aff,
  effects: [createToneMapEffect(), createFxaaEffect()],
});

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 70, near: 1, far: 5000 });

const awdBuffer = await fetch('shambler.awd').then((r) => r.arrayBuffer());
const awdDocument = parseAwd2(new Uint8Array(awdBuffer));
const awdScene = createScene3DFromDocument(awdDocument);

// The AWD embeds a directional light plus its ambient contribution. Keep the parsed document long enough
// to build both the live scene and the renderer's separate light set; the adapter also resolves the
// directional light's authored transform into its world-space direction.
const lights: Scene3DLights = createScene3DLightsFromDocument(awdDocument);

// The parsed texture references retain their document resource back-edge, so the ordinary load pass
// resolves the embedded diffuse/normal/specular byte blobs without a material-texture lister.
const resourceResolver = createBuiltInScene3DResourceResolver();
await loadScene3DResources(awdScene, resourceResolver);
addNodeChild(scene.root, awdScene.root);

// The AWD's meshes are skinned — their vertex layout carries joint indices and weights, and the
// parser fills in Mesh.skin. Nothing deforms them until skinning is prepared once per mesh and
// refreshed each frame after the skeleton is posed, so without this the model draws at a degenerate
// bind state and reads as an empty scene.
const skinnedMeshes: Mesh[] = [];
walkNodeDescendants(awdScene.root, (node) => {
  if (isMesh(node) && node.skin) {
    prepareMeshSkinning(node);
    skinnedMeshes.push(node);
  }
  // walkNodeDescendants treats a falsy return as "stop traversing"
  return true;
});

const animation = createAnimationState(awdScene.animations);

const orbit = createOrbitControllerFromAway(camera, {
  distance: 150,
  panAngle: 0,
  tiltAngle: 0,
  minTiltAngle: 5,
  maxTiltAngle: 60,
  targetY: 60,
});

bindOrbitDrag(ctx.canvas, orbit, { minDistance: 100, maxDistance: 2000 });

let lastTs = 0;

function frame(ts: number): void {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;

  animation.step(dt);
  for (const mesh of skinnedMeshes) updateMeshSkin(mesh);
  orbit.update();
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
