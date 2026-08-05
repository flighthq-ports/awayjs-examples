import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createClipRegionFromCircle,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  createShape,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  enableGlClipSupport,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  setNode2DClip,
  ShapeKind,
} from '@flighthq/sdk';

const width = window.innerWidth;
const height = window.innerHeight;
const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(width, height, pixelRatio);
if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}
document.body.style.margin = '0';

const state = createGlRenderState(canvas, {
  backgroundColor: 0x777777ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: false },
  pixelRatio,
});
// Shapes are authored in logical units; this device transform scales the scene up to the
// backing-store resolution so it stays crisp on HiDPI displays.
state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(state, defaultGlShapeCommands);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(createCanvasTextureResolvers()));
enableGlClipSupport(state);
const root = createDisplayObject();

function packColor(r: number, g: number, b: number): number {
  return ((Math.round(r * 255) & 0xff) << 16) | ((Math.round(g * 255) & 0xff) << 8) | (Math.round(b * 255) & 0xff);
}

function buildBatmanLogo(fillColor: number, strokeColor: number): Shape {
  const shape = createShape();
  appendShapeBeginFill(shape, fillColor, 1);
  appendShapeLineStyle(shape, 5, strokeColor, 1, false, 'normal', 'round', 'miter', 1.8);
  appendShapeMoveTo(shape, 50, 50);
  appendShapeLineTo(shape, 50, 50);
  appendShapeLineTo(shape, 50, 50);
  appendShapeLineTo(shape, 290, 50);
  appendShapeCurveTo(shape, 290, 150, 450, 150);
  appendShapeLineTo(shape, 460, 60);
  appendShapeLineTo(shape, 470, 100);
  appendShapeLineTo(shape, 530, 100);
  appendShapeLineTo(shape, 540, 60);
  appendShapeLineTo(shape, 550, 150);
  appendShapeCurveTo(shape, 710, 150, 710, 50);
  appendShapeLineTo(shape, 950, 50);
  appendShapeCurveTo(shape, 800, 120, 825, 250);
  appendShapeCurveTo(shape, 630, 280, 500, 450);
  appendShapeCurveTo(shape, 370, 280, 175, 250);
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

  prepareScene2DRender(state, root);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = window.devicePixelRatio || 1;
  canvas.width = w * pr;
  canvas.height = h * pr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
});

frame();
