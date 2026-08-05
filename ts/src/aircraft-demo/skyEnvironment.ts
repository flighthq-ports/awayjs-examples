import type { CubeTexture, Environment, GlRenderState } from '@flighthq/sdk';
import {
  bakeGlEnvironmentIbl,
  createCubeTexture,
  createEnvironment,
  captureBitmapFromImageResource,
  createBitmapRegion,
  flipBitmapHorizontal,
  flipBitmapVertical,
  loadImageResourceFromUrl,
  setCubeTextureFace,
} from '@flighthq/sdk';

// Environment cube map — individual face images derived from the CubeTextureTest.cube asset.
// AwayJS is left-handed (+Z into screen); Flight is right-handed (+Z out). The Z-negate between the two
// coordinate systems requires: X faces stay in their slot but are h-flipped, Z faces swap AND h-flip,
// Y faces stay but v-flip. See agents/conventions/camera.md for the coordinate convention.
const cubeFaceUrls = [
  'skybox/sky_posX.jpg',
  'skybox/sky_negX.jpg',
  'skybox/sky_posY.jpg',
  'skybox/sky_negY.jpg',
  'skybox/sky_negZ.jpg',
  'skybox/sky_posZ.jpg',
];

export async function createSkyEnvironment(glState: GlRenderState): Promise<Environment> {
  const cubeImages = await Promise.all(cubeFaceUrls.map((url) => loadImageResourceFromUrl(url)));
  const cubeTexture: CubeTexture = createCubeTexture();
  for (let i = 0; i < 6; i++) {
    const image = cubeImages[i];
    const surface = captureBitmapFromImageResource(image);
    const region = createBitmapRegion(surface);
    if (i === 2 || i === 3) {
      flipBitmapVertical(region, region);
    } else {
      flipBitmapHorizontal(region, region);
    }
    setCubeTextureFace(cubeTexture, i, surface);
  }
  const environment = createEnvironment({
    environment: cubeTexture,
    intensity: 1,
  });
  bakeGlEnvironmentIbl(glState, environment);
  return environment;
}
