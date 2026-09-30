import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeQuadraticCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createClipRegionFromCircle,
  createDisplayObject,
  createShape,
  invalidateNodeLocalTransform,
  setNode2DClip,
} from '@flighthq/sdk';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();
const root = createDisplayObject();

// Flight colors are RGBA, so the alpha byte is part of the value rather than implied. Packing this as
// 24-bit RGB shifts every channel one byte right and leaves alpha at zero, which draws nothing.
// `>>> 0` because the red byte reaching 0x80 makes the shift result negative in int32.
function packColor(r: number, g: number, b: number): number {
  return (
    (((Math.round(r * 255) & 0xff) << 24) |
      ((Math.round(g * 255) & 0xff) << 16) |
      ((Math.round(b * 255) & 0xff) << 8) |
      0xff) >>> 0
  );
}

function buildBatmanLogo(fillColor: number, strokeColor: number): Shape {
  const shape = createShape();
  appendShapeBeginFill(shape, fillColor, 1);
  appendShapeLineStyle(shape, 5, strokeColor, 1, false, 'normal', 'round', 'miter', 1.8);
  appendShapeMoveTo(shape, 50, 50);
  appendShapeLineTo(shape, 50, 50);
  appendShapeLineTo(shape, 50, 50);
  appendShapeLineTo(shape, 290, 50);
  appendShapeQuadraticCurveTo(shape, 290, 150, 450, 150);
  appendShapeLineTo(shape, 460, 60);
  appendShapeLineTo(shape, 470, 100);
  appendShapeLineTo(shape, 530, 100);
  appendShapeLineTo(shape, 540, 60);
  appendShapeLineTo(shape, 550, 150);
  appendShapeQuadraticCurveTo(shape, 710, 150, 710, 50);
  appendShapeLineTo(shape, 950, 50);
  appendShapeQuadraticCurveTo(shape, 800, 120, 825, 250);
  appendShapeQuadraticCurveTo(shape, 630, 280, 500, 450);
  appendShapeQuadraticCurveTo(shape, 370, 280, 175, 250);
  appendShapeEndFill(shape);
  return shape;
}

const logoWidth = 950 - 50;
const logoHeight = 450 - 50;
// AwayJS uses half the bounds dimensions without adding the bounds origin, which leaves the logo
// offset inside its origin-centred mask and makes the clipped Batman contour visible.
const logoPivotX = logoWidth / 2;
const logoPivotY = logoHeight / 2;

const numSpritesV = 5;
const numSpritesH = 5;

const gridScale = 0.1;
const maskRadius = 100;

const animShapes: Shape[] = [];
const animSpeeds: number[] = [];

for (let i = 0; i < numSpritesV; i++) {
  for (let j = 0; j < numSpritesH; j++) {
    const container = createDisplayObject();
    container.x = i * 50;
    container.y = j * 25;
    container.scaleX = gridScale;
    container.scaleY = gridScale;
    invalidateNodeLocalTransform(container);

    const rMult = i / numSpritesV;
    const gMult = 1 - i / numSpritesV;
    const bMult = 1 - j / numSpritesH;

    const fillColor = packColor(rMult, gMult, bMult);
    const strokeColor = packColor(rMult, 0, 0);

    const sprite = buildBatmanLogo(fillColor, strokeColor);
    sprite.pivotX = logoPivotX;
    sprite.pivotY = logoPivotY;
    invalidateNodeLocalTransform(sprite);

    setNode2DClip(sprite, createClipRegionFromCircle(logoPivotX, logoPivotY, maskRadius));

    animShapes.push(sprite);
    animSpeeds.push(0);

    addNodeChild(container, sprite);
    addNodeChild(root, container);
  }
}

function frame(): void {
  for (let i = 0; i < animShapes.length; i++) {
    animShapes[i].rotation += animSpeeds[i];
    animSpeeds[i] += 1 - 2 * Math.random();
    animSpeeds[i] *= 0.98;
    invalidateNodeLocalTransform(animShapes[i]);
  }

  renderer.render(root);
  requestAnimationFrame(frame);
}

renderer.resize();
window.addEventListener('resize', renderer.resize);

frame();
