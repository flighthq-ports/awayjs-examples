// `import { parserOptions } from './asset.awd?manifest'` is served by @flighthq/vite-plugin-manifest,
// which generates the module at build time from the file's own content. The plugin always exports one
// fragment per backend plus the parser's, so a fragment for a backend this file needs nothing for
// spreads to nothing rather than failing to import.
//
// Declared per extension rather than as one `*?manifest`: which parser field a manifest carries is
// decided by the format (`blocks` for AWD2, a plain options object for the mesh formats), and a single
// declaration would have to make all of them optional — which loses the guarantee that spreading one
// satisfies the parser's options.
declare module '*.awd?manifest' {
  import type { Awd2BlockHandler, CanvasRenderStateOptions, GlRenderStateOptions } from '@flighthq/sdk';

  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
  export const parserOptions: { readonly blocks: readonly Awd2BlockHandler[] };
}

declare module '*.3ds?manifest' {
  import type { GlRenderStateOptions, ThreeDsImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<ThreeDsImportOptions>;
}

declare module '*.md2?manifest' {
  import type { GlRenderStateOptions, Md2ImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<Md2ImportOptions>;
}

declare module '*.md5mesh?manifest' {
  import type { GlRenderStateOptions, Md5ImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<Md5ImportOptions>;
}

declare module '*.obj?manifest' {
  import type { GlRenderStateOptions, ObjImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<ObjImportOptions>;
}
