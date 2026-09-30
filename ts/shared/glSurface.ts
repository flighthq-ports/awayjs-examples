import type {
  GlRenderState,
  GlRenderStateOptions,
  HostCanvasCapability,
  HostImageCapability,
  RenderTargetClear,
} from '@flighthq/sdk';
import { createGlRenderState, unpackColorRgba } from '@flighthq/sdk';
import { createWebGlContext } from '@flighthq/host-web';

export interface ExampleGlSurface {
  canvas: HTMLCanvasElement;
  clear: RenderTargetClear;
  state: GlRenderState;
}

/**
 * Capabilities a renderer that rasterizes through a 2D canvas has to be handed explicitly.
 *
 * Only RichText needs these today, and they are opt-in rather than always-on so the examples that
 * draw no text keep the canvas and image host code out of their bundles — the same reason the
 * registries are passed per example instead of using the full preset.
 */
export interface ExampleGlSurfaceHosts {
  canvasHost?: Readonly<HostCanvasCapability>;
  imageHost?: Readonly<HostImageCapability>;
}

export function createExampleGlSurface(
  width: number,
  height: number,
  pixelRatio: number,
  backgroundColor: number,
  registries: Readonly<GlRenderStateOptions> = {},
  hosts: Readonly<ExampleGlSurfaceHosts> = {},
): ExampleGlSurface {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const gl = createWebGlContext(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });
  const state = createGlRenderState(gl, { ...registries, pixelRatio });
  // Assigned rather than passed to createGlRenderState: RenderState owns these as mutable fields and
  // GlRenderStateOptions has no slot for them. glRichTextRenderer returns before drawing anything at
  // all — not even the field's background or border — while either is null, and it does so silently,
  // so a text example without them renders an empty canvas and reports no error.
  if (hosts.canvasHost !== undefined) state.canvasHost = hosts.canvasHost;
  if (hosts.imageHost !== undefined) state.imageHost = hosts.imageHost;
  const color: [number, number, number, number] = [0, 0, 0, 0];
  unpackColorRgba(color, backgroundColor);
  return { canvas, clear: { color, depth: 1 }, state };
}
