declare module '*.awd?manifest' {
  import type { Awd2BlockHandler, CanvasRenderStateOptions, GlRenderStateOptions } from '@flighthq/sdk';
  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
  export const parserOptions: { readonly blocks: readonly Awd2BlockHandler[] };
}
