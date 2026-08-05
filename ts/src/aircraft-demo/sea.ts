import type { Mesh, StandardPbrMaterial, Texture } from '@flighthq/sdk';
import {
  createMesh,
  createPlaneMeshGeometry,
  createStandardPbrMaterial,
  createTexture,
  loadImageResourceFromUrl,
} from '@flighthq/sdk';

// The original AwayJS demo uses NormalSimpleWaterMethod + EffectEnvMapMethod + SpecularFresnelMethod on
// the sea surface. Here we approximate it with a water StandardPbrMaterial (metallic=0.05, roughness=0.25)
// and a scrolling normal map — an in-sample implementation of the WaterMaterial effect, keeping the
// behaviour self-contained until a dedicated WaterMaterial type is added to the SDK.
export interface Sea {
  mesh: Mesh;
  // The sea normal map, scrolled each frame (uvOffset.y) to simulate surface flow.
  normalTex: Texture;
}

export async function createSea(): Promise<Sea> {
  // Sea normal map — shared between water surface material and the aircraft's MethodMaterial in the
  // original. Here used only for the water, matching the original intent.
  const seaNormalImage = await loadImageResourceFromUrl('/sea_normals.jpg');
  const seaNormalTex = createTexture({ source: seaNormalImage });
  // Tile the ripples finely so they read as small, distant waves seen from altitude rather than large
  // close-up swells (the AwayJS look, which is wrong for a jet's height).
  seaNormalTex.uvScale.x = 300;
  seaNormalTex.uvScale.y = 300;

  // Water surface — a distant sea read via StandardPbrMaterial: low roughness makes it reflect the sky
  // environment (a Fresnel sheen strongest toward the horizon), with only a faint, slow normal-map
  // shimmer for a hint of ripple. The point is reflection over surface detail, since the water is far off.
  const seaMaterial: StandardPbrMaterial = createStandardPbrMaterial({
    baseColor: 0x3a6285ff,
    metallic: 0.05,
    roughness: 0.12,
    normalMap: seaNormalTex,
    normalScale: 0.35,
  });
  seaMaterial.doubleSided = true;

  const seaGeometry = createPlaneMeshGeometry(50000, 50000, 1, 1);
  const seaMesh: Mesh = createMesh(seaGeometry, [seaMaterial]);

  return { mesh: seaMesh, normalTex: seaNormalTex };
}
