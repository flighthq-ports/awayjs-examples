import type { GlRenderStateOptions, Node2D } from '@flighthq/sdk';
import {
  beginGlRenderPass,
  createGlScreenRenderTarget,
  createMatrix,
  endGlRenderPass,
  glRenderInfrastructure,
  // glScene2DRenderPreset,
  glShapeRenderer,
  prepareScene2DRender,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

function createMinimalScene2DGlRegistries(): GlRenderStateOptions {
  return {
    ...glRenderInfrastructure,
    // Back to the default compact open outlines. glRenderInfrastructure opts into
    // tessellateStrokePath, which buys hollow closed rings at the cost of pathological-geometry
    // rejection — and a tracer is exactly the geometry it rejects: one long, self-intersecting open
    // polyline. A rejected stroke makes the mesh path report "not drawn" and fall through to the
    // raster path, which this example registers no rasterizer for, so the trail silently vanished.
    // It went oldest-first, because the longest range is the likeliest to contain a rejected span:
    // black (the oldest 50%) dropped out first, then grey, until only the newest 10% was left.
    // Nothing here needs closed rings, so the rejection is pure downside.
    strokeTessellator: null,
    nodeRenderers: new Map([[ShapeKind, glShapeRenderer]]),
  };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene2DRenderPreset; // import all
  const registries = createMinimalScene2DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, 0x777777ff, registries,
  );
  document.getElementById('app')?.replaceChildren(canvas);
  if (!canvas.parentElement) document.body.appendChild(canvas);
  const target = createGlScreenRenderTarget(state.gl);
  return {
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
