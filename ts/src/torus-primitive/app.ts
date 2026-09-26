import { webHostImage } from '@flighthq/host-web';
import {
  addNodeChild,
  copyQuaternion,
  createMesh,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';

import { awayDirection, createCameraFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createAwayMatteMaterial } from '../../shared/materials';
import { setupRenderer } from './render.gl';

const DEG = Math.PI / 180;

const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ z: -1000, fov: 60 });

// AwayJS's DirectionalLight defaults to ambient 0 and this sample adds no ambient light, so the torus
// is lit by the directional alone; the helper supplies the matching ~zero ambient. ACES tone mapping
// (below) compresses the single light's highlights into range without a flat fill washing it out.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(0, 0, 1),
  diffuse: 0.7,
});

const lights = createScene3DLights({ ambient, directional });

const image = await loadImageResourceFromUrl(webHostImage, 'dots.png');
// Flight builds the torus in its native right-handed space while the camera helper mirrors z
// (left-handed AwayJS -> right-handed Flight). The unmirrored mesh renders as the z-reflection of the
// original, flipping the texture along the tube (v) axis; mirror v back to match the AwayJS look.
const texture = createTexture({ source: image });
texture.uvScale.y = -1;
texture.uvOffset.y = 1;

const material = createAwayMatteMaterial(0xffffffff);
material.baseColorMap = texture;

// AwayJS PrimitiveTorusPrefab(radius, tube, segmentsR=32 around the ring, segmentsT=16 around the
// tube). Flight's signature is (radius, tube, radialSegments=around the tube, tubularSegments=around
// the ring), so the counts swap to reproduce the original's tessellation (smoother ring, coarser tube).
const geometry = createTorusMeshGeometry(220, 80, 16, 32);
const torus = createMesh(geometry, [material]);
addNodeChild(scene.root, torus);

const yAxis = createVector3(0, 1, 0);
const scratchQuat = createQuaternion();
let rotationY = 0;

function frame(): void {
  rotationY -= DEG;

  setQuaternionFromAxisAngle(scratchQuat, yAxis, rotationY);
  copyQuaternion(torus.rotation, scratchQuat);
  invalidateNodeLocalTransform(torus);

  renderer.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
