import { inflateRawSync, inflateSync } from 'node:zlib';

import type { Plugin } from 'vite';
import type { HostDecompressDeflateCapability } from '@flighthq/types/contract';
import { CompressionFraming } from '@flighthq/types/contract';
import {
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
  createRequirementCatalog,
} from '@flighthq/requirement-catalog/contract';
import { createManifestPlugin } from '@flighthq/vite-plugin-manifest';

/**
 * The build-time decompressor the analyzers need. Without one every compressed asset analyzes to
 * nothing: this repo's AWD corpus (suzanne.awd, shambler.awd, sponza.awd, MonsterHead.awd) is
 * deflate-bodied, so most of it would produce an empty manifest. Node's zlib rather than the SDK's
 * web host because this runs in Vite, not a browser.
 *
 * AWD2 frames its body as raw deflate and SWF as zlib, which is why framing is a parameter and not
 * an assumption.
 */
const nodeDeflate: HostDecompressDeflateCapability = {
  decompress(compressed, _uncompressedLength, framing) {
    try {
      const input = Buffer.from(compressed.buffer, compressed.byteOffset, compressed.byteLength);
      return new Uint8Array(framing === CompressionFraming.Raw ? inflateRawSync(input) : inflateSync(input));
    } catch {
      // null is the contract's "this codec could not read it", which the analyzer turns into a
      // diagnostic. Throwing here would fail the whole build on one malformed asset.
      return null;
    }
  },
};

/**
 * Serves `./asset.awd?manifest` as a generated module naming exactly the handlers that file needs.
 * The plugin reads the bytes with the SDK's own `parse*Requirements` walk and resolves the result
 * against Flight's shipped ownership rows, so an example's handler list is derived from its asset
 * rather than kept in sync with it by hand.
 *
 * The translations are the second argument rather than an afterthought: they carry a
 * `document.format` requirement over to the node kinds a renderer needs, and a catalog built without
 * them resolves the parser fragment while every render fragment comes back empty.
 */
export function createFlightManifestPlugin(): Plugin {
  return createManifestPlugin({
    catalog: createRequirementCatalog(
      BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
      BUILT_IN_REQUIREMENT_TRANSLATIONS,
    ),
    deflate: nodeDeflate,
    onDiagnostic: (message) => console.warn(`[flight-manifest] ${message}`),
  }) as unknown as Plugin;
}
