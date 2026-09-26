import type { GlRenderStateOptions, Node2D } from '@flighthq/sdk';
import {
  beginGlRenderPass,
  createGlScreenRenderTarget,
  createMatrix,
  endGlRenderPass,
  glRenderInfrastructure,
  glRichTextRenderer,
  // glScene2DRenderPreset,
  prepareScene2DRender,
  renderGlScene2D,
  RichTextKind,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

function createMinimalScene2DGlRegistries(): GlRenderStateOptions {
  return { ...glRenderInfrastructure, nodeRenderers: new Map([[RichTextKind, glRichTextRenderer]]) };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene2DRenderPreset; // import all
  const registries = createMinimalScene2DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, 0xccccccff, registries,
  );
  document.getElementById('app')?.replaceChildren(canvas);
  if (!canvas.parentElement) document.body.appendChild(canvas);
  const target = createGlScreenRenderTarget(state.gl);
  return {
    canvas,
    render(root: Readonly<Node2D>): void {
      if (!prepareScene2DRender(state, root)) return;
      const pass = beginGlRenderPass(state, target, clear);
      renderGlScene2D(pass, root, createMatrix(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0));
      endGlRenderPass(pass);
    },
    resize(): void {
      const width = window.innerWidth; const height = window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1; state.pixelRatio = pixelRatio;
      canvas.width = width * pixelRatio; canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      state.gl.viewport(0, 0, canvas.width, canvas.height);
    },
  };
}
