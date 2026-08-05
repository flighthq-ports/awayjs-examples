# AwayJS Examples (Flight SDK)

26 examples from [awayjs/awayjs-examples](https://github.com/awayjs/awayjs-examples), ported to
[Flight](https://github.com/flighthq/flight) — built against
[`@flighthq/sdk`](https://www.npmjs.com/package/@flighthq/sdk).

## Build and run

```bash
cd ts
npm install
npm run dev
```

Examples live in `ts/src/<name>/`.

| Command | |
| --- | --- |
| `npm run dev` | dev server and example index |
| `npm run build` | build every example |
| `npm run dist` | the full published output — thumbs, sizes, gallery, build |
| `npm run eject <name>` | copy one example out |
| `npm run thumbs` | capture gallery thumbnails (needs playwright; not committed) |
| `npm run sizes` | write `SIZES.md` and `src/sizes.json` |
| `npm run lint:assets` | check asset references |

Thumbnails and sizes are optional. They are gitignored and the gallery picks them up at view time,
so a plain clone renders fine without them and a published build is richer for having them.

These examples are WebGL only — 3D content has no Canvas or DOM equivalent, so unlike the sibling
OpenFL port there are no renderer variants to publish.

Unlike the sibling ports, examples here share 3D helpers from `ts/shared/` — camera rigs, lighting,
PBR conversion — rather than each carrying its own copy. `npm run eject` copies an example's
directory but not those helpers.
