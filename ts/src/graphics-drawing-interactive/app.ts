import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  attachPointerInput,
  clearShapeCommands,
  connectSignal,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createInputManager,
  createMatrix,
  createShape,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  invalidateNodeRender,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';

interface DrawingPathEntry {
  cmd: string;
  x: number;
  y: number;
  cx?: number;
  cy?: number;
}

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
  backgroundColor: 0xddddddff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: false },
  pixelRatio,
});
state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(state, defaultGlShapeCommands);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(createCanvasTextureResolvers()));
const drawingPath: DrawingPathEntry[] = [];
let isMouseDown = false;

const root = createDisplayObject();

const bgShape = createShape();
appendShapeBeginFill(bgShape, 0xdddddd);
appendShapeRectangle(bgShape, 0, 0, window.innerWidth, window.innerHeight);
appendShapeEndFill(bgShape);
addNodeChild(root, bgShape);

const shape = createShape();
addNodeChild(root, shape);

const circleGraphic = createShape();
appendShapeBeginFill(circleGraphic, 0xff0000);
appendShapeCircle(circleGraphic, 0, 0, 30);
appendShapeEndFill(circleGraphic);
circleGraphic.alpha = 0;
invalidateNodeAppearance(circleGraphic);
addNodeChild(root, circleGraphic);

function drawShape(): void {
  clearShapeCommands(shape);
  appendShapeBeginFill(shape, 0xffffff);
  appendShapeLineStyle(shape, 5, 0xff0000, 1, false, undefined, 'round', 'miter', 1.8);

  if (drawingPath.length === 0) {
    invalidateNodeRender(shape);
    return;
  }

  appendShapeMoveTo(shape, drawingPath[0].x, drawingPath[0].y);
  for (let i = 1; i < drawingPath.length; i++) {
    if (drawingPath[i].cmd === 'l') {
      appendShapeLineTo(shape, drawingPath[i].x, drawingPath[i].y);
    } else if (drawingPath[i].cmd === 'c') {
      appendShapeCurveTo(shape, drawingPath[i].cx!, drawingPath[i].cy!, drawingPath[i].x, drawingPath[i].y);
    }
  }
  appendShapeEndFill(shape);
  invalidateNodeRender(shape);
}

function updateNewPointForMousePosition(x: number, y: number): void {
  if (isMouseDown) {
    const last = drawingPath[drawingPath.length - 1];
    const deltaX = x - last.x;
    const deltaY = y - last.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > 20) {
      last.cmd = 'c';
      last.cx = last.x - deltaX;
      last.cy = last.y - deltaY;
    } else {
      last.cmd = 'l';
    }
    drawShape();
  }
}

const input = createInputManager();
attachPointerInput(input, canvas);

connectSignal(input.onPointerDown, (data) => {
  circleGraphic.x = data.x;
  circleGraphic.y = data.y;
  circleGraphic.alpha = 1;
  circleGraphic.scaleX = 1;
  circleGraphic.scaleY = 1;
  invalidateNodeLocalTransform(circleGraphic);
  invalidateNodeAppearance(circleGraphic);

  drawingPath.push({
    cmd: 'l',
    x: data.x,
    y: data.y,
  });

  if (drawingPath.length !== 2) {
    drawShape();
  }
  isMouseDown = true;
});

connectSignal(input.onPointerMove, (data) => {
  updateNewPointForMousePosition(data.x, data.y);
});

connectSignal(input.onPointerUp, (data) => {
  updateNewPointForMousePosition(data.x, data.y);
  isMouseDown = false;
});

function enterFrame(): void {
  if (circleGraphic.alpha > 0) {
    circleGraphic.alpha -= 0.05;
    invalidateNodeAppearance(circleGraphic);
  }
  if (circleGraphic.scaleX > 0.1) {
    circleGraphic.scaleX -= 0.05;
    circleGraphic.scaleY -= 0.05;
    invalidateNodeLocalTransform(circleGraphic);
  }

  prepareScene2DRender(state, root);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  requestAnimationFrame(enterFrame);
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

enterFrame();
