import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlBloomEffectRunner,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  registerBloomEffectPaddingResolver,
  registerGlRenderEffect,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
} from '@flighthq/sdk';


export const width = window.innerWidth;
export const height = window.innerHeight;
const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
export const canvas = createGlCanvasElement(width, height, pixelRatio);
if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}
document.body.style.margin = '0';

export const glState = createGlRenderState(canvas, {
  backgroundColor: 0x2c2c32ff,
  contextAttributes: {
    alpha: false,
    depth: true,
    preserveDrawingBuffer: false,
  },
  pixelRatio,
});
// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(glState);
registerGlStandardPbrMaterial(glState);
registerBloomEffectPaddingResolver(glState);
registerGlRenderEffect(glState, 'BloomEffect', defaultGlBloomEffectRunner);
registerGlRenderEffect(glState, 'FxaaEffect', defaultGlFxaaEffectRunner);
registerGlRenderEffect(glState, 'ToneMapEffect', defaultGlToneMapEffectRunner);

