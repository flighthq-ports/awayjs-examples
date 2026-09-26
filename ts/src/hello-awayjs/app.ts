import { webHostImage } from '@flighthq/host-web';
import type { Mesh } from '@flighthq/sdk';
import {
  addNodeChild,
  createMesh,
  createScene3D,
  createScene3DHit,
  createSphereMeshGeometry,
  createTexture,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  pickScene3D,
  setVector3,
} from '@flighthq/sdk';

import { createCameraFromAway } from '../../shared/camera';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ y: 500, z: -600, fov: 60 });

const material = createUnlitMaterial({ baseColor: 0xffffffff });

const geometry = createSphereMeshGeometry(50);

const spheres: Mesh[] = [];

for (let i = 0; i < 100; i++) {
  const mesh = createMesh(geometry, [material]);

  const px = Math.random() * 1000 - 500;
  const py = Math.random() * 1000 - 500;
  const pz = Math.random() * 1000 - 500;

  setVector3(mesh.position, px, py, pz);
  invalidateNodeLocalTransform(mesh);

  spheres.push(mesh);
  addNodeChild(scene.root, mesh);
}

const hit = createScene3DHit();

function pickSphere(event: MouseEvent): Mesh | null {
  const rect = renderer.canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const result = pickScene3D(scene.root, camera, screenX, screenY, hit);
  if (result) {
    const index = spheres.indexOf(result.node as Mesh);
    if (index !== -1) {
      return spheres[index];
    }
  }
  return null;
}

renderer.canvas.addEventListener('mousedown', (event: MouseEvent) => {
  const sphere = pickSphere(event);
  if (sphere) {
    setVector3(sphere.scale, 2, 2, 2);
    invalidateNodeLocalTransform(sphere);
  }
});

renderer.canvas.addEventListener('mouseup', (event: MouseEvent) => {
  const sphere = pickSphere(event);
  if (sphere) {
    setVector3(sphere.scale, 1, 1, 1);
    invalidateNodeLocalTransform(sphere);
  }
});

const image = await loadImageResourceFromUrl(webHostImage, 'floor_diffuse.jpg');
const texture = createTexture({ source: image });
material.baseColorMap = texture;

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

function frame(): void {
  renderer.render(scene.root, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
