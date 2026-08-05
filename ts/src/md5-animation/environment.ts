import type { Environment, Mesh, ScreenSpaceFogEffect } from '@flighthq/sdk';
import {
  createEnvironment,
  createMesh,
  createPlaneMeshGeometry,
  createScreenSpaceFogEffect,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  loadImageResourceFromUrl,
  setTextureUvScale,
} from '@flighthq/sdk';

import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';

export interface EnvironmentData {
  environment: Environment;
  groundMesh: Mesh;
  fogEffect: ScreenSpaceFogEffect;
}

export async function loadEnvironment(): Promise<EnvironmentData> {
  const skyFaceNames = ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'];
  const skyImages = await Promise.all(
    skyFaceNames.map((face) => loadImageResourceFromUrl(`/skybox/grimnight_${face}.png`)),
  );
  const skyTexture = createCubeTextureFromAwayFaces(skyImages);
  // Keep the sky as the backdrop while restraining its IBL contribution: a strong environment fill
  // washes out both the directional contact shadow and the ground normal-map response.
  const environment = createEnvironment({ environment: skyTexture, intensity: 0.45 });

  const [rockDiffuse, rockNormal] = await Promise.all([
    loadImageResourceFromUrl('/rockbase_diffuse.jpg'),
    loadImageResourceFromUrl('/rockbase_normals.png'),
  ]);

  const groundSampler = createTilingSampler();
  const groundDiffuseTexture = createTexture({ source: rockDiffuse });
  const groundNormalTexture = createTexture({ source: rockNormal, colorSpace: 'linear' });
  groundDiffuseTexture.sampler = groundSampler;
  groundNormalTexture.sampler = groundSampler;
  setTextureUvScale(groundDiffuseTexture, 200, 200);
  setTextureUvScale(groundNormalTexture, 200, 200);

  // Deliberately a plain StandardPbrMaterial rather than an extended one carrying the rock's specular
  // map. That map is near-black across the whole plane, so routing it through the specular extension
  // costs most of the ground's brightness while adding nothing a uniform roughness does not already
  // express. The character's body does use the extension — its specular map is genuinely varied.
  const groundMaterial = createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: groundDiffuseTexture,
    metallic: 0,
    normalMap: groundNormalTexture,
    // AwayJS applies the map at full strength; the small lift accounts for Flight's smoother PBR
    // response and makes the same rock relief legible under the moving lights.
    normalScale: 1.35,
    roughness: 0.62,
  });
  groundMaterial.doubleSided = false;

  const groundMesh = createMesh(createPlaneMeshGeometry(50000, 50000, 1, 1), [groundMaterial]);

  // WebGL stores perspective depth nonlinearly. These window-depth values correspond to the AwayJS
  // fog interval of 2,500–5,000 world units for this camera's near/far planes. The background-aware
  // runner leaves the skybox untouched, allowing the ground to fade almost completely into its dark
  // lower horizon before the far-plane clip.
  const fogEffect = createScreenSpaceFogEffect({
    color: 0x02040aff,
    near: 0.995984,
    far: 1,
    density: 4,
  });

  return { environment, groundMesh, fogEffect };
}
