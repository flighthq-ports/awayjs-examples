import type { GlRenderState, ShapeRasterizer } from '@flighthq/sdk';
import {
  canvasShapeCommands,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  registerCanvasShapeCommands,
} from '@flighthq/sdk';
import { webHostCanvasGroup, webHostImage } from '@flighthq/host-web';

import type { ExampleGlSurfaceHosts } from './glSurface';

/**
 * The raster fallback for shapes the GPU mesh path declines.
 *
 * `tessellateStrokePath` builds a stroke as a non-overlapping triangle mesh, which is fast and
 * resolution-independent — but it returns null when the centerline crosses itself, because cross
 * sections alone cannot express the overlap. That is a deliberate handoff, not a failure: the
 * contract says the renderer "can preserve Canvas semantics through its raster fallback". A state
 * with no rasterizer registered has nowhere to hand off to, so the stroke is simply not drawn.
 *
 * Both halves stay in play. Every ordinary stroke keeps the GPU path; only the self-crossing ones
 * replay through a canvas. Disabling the stroke tessellator instead would push EVERY stroke onto
 * outline-polygon tessellation, which re-tessellates a growing outline each frame and degrades as the
 * path gets longer.
 *
 * Its own module so the examples that never rasterize keep @flighthq/scene2d-canvas out of their
 * bundles.
 */
export function createExampleShapeRasterizer(): ShapeRasterizer {
  return createCanvasShapeRasterizer(createCanvasTextureResolvers(webHostCanvasGroup.context));
}

/** The hosts the raster replay draws through — pass to `createExampleGlSurface`. */
export const exampleShapeRasterHosts: ExampleGlSurfaceHosts = {
  canvasHost: webHostCanvasGroup.context,
  imageHost: webHostImage,
};

/**
 * Installs the canvas command vocabulary the replay needs. Separate from the rasterizer because the
 * rasterizer is a registry entry fixed at state creation while this writes onto the live state, and
 * the replay runs the WHOLE command stream — not just the parts the mesh path declined — so a partial
 * vocabulary is not enough.
 */
export function enableExampleShapeRaster(state: GlRenderState): void {
  registerCanvasShapeCommands(state, canvasShapeCommands);
}
