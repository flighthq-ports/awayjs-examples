import { cpSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, 'src');
const assetsDir = resolve(here, '../assets');
const outDir = resolve(here, 'dist');

/**
 * Every directory under src/ is an example. The shared 3D helpers deliberately live in ts/shared/
 * rather than src/_shared/ so this stays true with no denylist — see the README for why this repo
 * has shared code at all when the sibling ports do not.
 */
export function listExamples(): string[] {
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(resolve(srcDir, e.name, 'index.html')))
    .map((e) => e.name)
    .sort();
}

/** thumbs/ is generated for publishing and gitignored; copy it into the build when it exists. */
function copyThumbs(): Plugin {
  return {
    name: 'flight-copy-thumbs',
    apply: 'build',
    closeBundle() {
      const from = resolve(srcDir, 'thumbs');
      if (existsSync(from)) cpSync(from, resolve(outDir, 'thumbs'), { recursive: true });
    },
  };
}

/** sizes.json is generated for publishing and gitignored; the gallery fetches it if it is there. */
function copySizes(): Plugin {
  return {
    name: 'flight-copy-sizes',
    apply: 'build',
    closeBundle() {
      const from = resolve(srcDir, 'sizes.json');
      if (existsSync(from)) cpSync(from, resolve(outDir, 'sizes.json'));
    },
  };
}

export default defineConfig(() => {
  // Building one example alone is what makes a per-example bundle size meaningful; with every
  // entry in the graph, Rollup shares chunks and the total describes the gallery rather than any
  // one program. `npm run sizes` sets this per build.
  const single = process.env.SAMPLE;

  // Measurement builds skip the asset copy: `npm run sizes` only reads the emitted JS, and the
  // corpus here is 62 MB. Vite types publicDir as `string | false`, hence the annotation.
  const publicDir: string | false = single ? false : assetsDir;

  const input = single
    ? { [single]: resolve(srcDir, single, 'index.html') }
    : {
        index: resolve(srcDir, 'index.html'),
        ...Object.fromEntries(listExamples().map((e) => [e, resolve(srcDir, e, 'index.html')])),
      };

  return {
    // src/ is the web root, so an example is served at /<name>/ rather than /src/<name>/ — the
    // directory layout should not show up in the URL a visitor sees.
    root: srcDir,
    plugins: [copyThumbs(), copySizes()],
    publicDir,
    build: { target: 'es2022', outDir, emptyOutDir: true, rollupOptions: { input } },
  };
});
