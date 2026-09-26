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

const nodeDeflate: HostDecompressDeflateCapability = {
  decompress(compressed, _uncompressedLength, framing) {
    try {
      const input = Buffer.from(compressed.buffer, compressed.byteOffset, compressed.byteLength);
      return new Uint8Array(framing === CompressionFraming.Raw ? inflateRawSync(input) : inflateSync(input));
    } catch {
      return null;
    }
  },
};

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
