import type { ImageResource, TextureAtlas } from '@flighthq/sdk';
import { addTextureAtlasRegion, createTexture, createTextureAtlas } from '@flighthq/sdk';

export function createSingleSpriteAtlas(image: ImageResource): TextureAtlas {
  const atlas = createTextureAtlas({ texture: createTexture({ source: image }) });
  addTextureAtlasRegion(atlas, 0, 0, image.width, image.height);
  return atlas;
}
