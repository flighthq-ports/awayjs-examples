import type { Bitmap, Image } from '@flighthq/sdk';
import { createImageResourceFromBitmap, captureBitmapFromImageResource } from '@flighthq/sdk';

import { createMetallicRoughnessImage } from '../../shared/pbrConvert';

export interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

export function buildRampChannel(stops: ReadonlyArray<ColorStop>, channel: 'r' | 'g' | 'b'): number[] {
  const lut = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].t && t <= stops[s + 1].t) {
        lo = stops[s];
        hi = stops[s + 1];
        break;
      }
    }
    const span = hi.t - lo.t || 1;
    const f = Math.min(1, Math.max(0, (t - lo.t) / span));
    lut[i] = Math.round(lo[channel] + (hi[channel] - lo[channel]) * f);
  }
  return lut;
}

// The source textures are grayscale (masterchief_base.png averages ~(95,95,94)) — AwayJS gets its color
// purely from the warm light acting on those values. To force the Halo palette, colorize each texture
// with a luminance gradient map: build a 256-entry ramp from color stops and, per pixel, replace it with
// the ramp color at that pixel's luminance. The one exception is the visor: it's the only region with any
// chroma in the source (a gold shield in the atlas), so use that chroma as a free mask and send those
// pixels through a separate orange ramp. captureBitmapFromImageResource gives the editable pixels;
// createImageResourceFromBitmap rasterizes back to a source-backed image the material can upload.

// Colorize a grayscale texture through `baseStops` by luminance. Pixels whose source chroma exceeds
// CHROMA_MASK (only the visor, in this atlas) go through `chromaStops` instead.
export const CHROMA_MASK = 24;
export function colorizeByLuminance(
  image: Image,
  baseStops: ReadonlyArray<ColorStop>,
  chromaStops?: ReadonlyArray<ColorStop>,
): Image {
  const surface = captureBitmapFromImageResource(image);
  const data = surface.data;
  if (data === null) return image;
  const br = buildRampChannel(baseStops, 'r');
  const bg = buildRampChannel(baseStops, 'g');
  const bb = buildRampChannel(baseStops, 'b');
  const xr = chromaStops ? buildRampChannel(chromaStops, 'r') : null;
  const xg = chromaStops ? buildRampChannel(chromaStops, 'g') : null;
  const xb = chromaStops ? buildRampChannel(chromaStops, 'b') : null;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    if (xr !== null && Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_MASK) {
      data[i] = xr[luma];
      data[i + 1] = xg![luma];
      data[i + 2] = xb![luma];
    } else {
      data[i] = br[luma];
      data[i + 1] = bg[luma];
      data[i + 2] = bb[luma];
    }
  }
  return createImageResourceFromBitmap(surface);
}

export const ARMOR_RAMP: ColorStop[] = [
  { t: 0.0, r: 16, g: 14, b: 10 }, // deep shadow / crevices
  { t: 0.3, r: 34, g: 38, b: 24 }, // dark olive (bodysuit / shadowed armor)
  { t: 0.55, r: 90, g: 104, b: 54 }, // olive-green armor panels
  { t: 0.78, r: 150, g: 150, b: 100 }, // lit khaki armor
  { t: 1.0, r: 220, g: 214, b: 175 }, // worn-metal highlights (kept desaturated, not orange)
];

export const VISOR_RAMP: ColorStop[] = [
  { t: 0.0, r: 70, g: 26, b: 6 }, // shadowed visor edge
  { t: 0.4, r: 224, g: 104, b: 22 }, // oakley orange
  { t: 0.75, r: 255, g: 156, b: 44 },
  { t: 1.0, r: 255, g: 206, b: 120 }, // bright amber glint
];

// Warm reddish dirt — a complementary contrast to the olive/oregano armor.
export const STONE_RAMP: ColorStop[] = [
  { t: 0.0, r: 46, g: 24, b: 12 }, // dark umber
  { t: 0.5, r: 158, g: 92, b: 50 }, // warm reddish-brown
  { t: 1.0, r: 226, g: 168, b: 110 }, // sunlit sand
];

// Roughness varies by region, driven off the same grayscale values: the black cloth undersuit (dark) is
// matte, the green metal armor (mid/bright) is more reflective, and the visor (the chroma mask) is the
// glossiest. Written into a metallicRoughnessMap's G channel (glTF: G = roughness, B = metallic); the
// material's roughness scalar stays 1 so the map fully drives it, metallic stays 0 (no env to reflect).
interface ScalarStop {
  t: number;
  v: number;
}
const ROUGH_STOPS: ScalarStop[] = [
  { t: 0.0, v: 0.9 }, // black cloth undersuit -> matte
  { t: 0.28, v: 0.55 }, // green metal armor -> semi-reflective
  { t: 1.0, v: 0.34 }, // bright metal edges -> reflective
];
const ROUGH_VISOR = 0.12; // glass visor -> glossy

// Metallic (map B channel): the armor is real metal, the cloth and visor barely so.
const METAL_STOPS: ScalarStop[] = [
  { t: 0.0, v: 0.05 }, // black cloth -> dielectric
  { t: 0.28, v: 0.45 }, // green metal armor -> metallic
  { t: 1.0, v: 0.55 },
];
const METAL_VISOR = 0.1; // glass visor -> slight

function sampleScalarStops(stops: ReadonlyArray<ScalarStop>, t: number): number {
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let s = 0; s < stops.length - 1; s++) {
    if (t >= stops[s].t && t <= stops[s + 1].t) {
      lo = stops[s];
      hi = stops[s + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  return lo.v + (hi.v - lo.v) * Math.min(1, Math.max(0, (t - lo.t) / span));
}

export function buildMetallicRoughnessMap(image: Image): Bitmap {
  return createMetallicRoughnessImage(image, (r, g, b) => {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const isVisor = Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_MASK / 255;
    return {
      roughness: isVisor ? ROUGH_VISOR : sampleScalarStops(ROUGH_STOPS, luma),
      metallic: isVisor ? METAL_VISOR : sampleScalarStops(METAL_STOPS, luma),
    };
  });
}
