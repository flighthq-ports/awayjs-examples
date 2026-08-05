import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  clearShapeCommands,
  convertNodeVector2LocalToGlobal,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  createShape,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
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

let WIDTH = window.innerWidth;
let HEIGHT = window.innerHeight;
const MAX_PATH_LENGTH = 500;

interface PathPoint {
  x: number;
  y: number;
}

const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(WIDTH, HEIGHT, pixelRatio);
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
state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(state, defaultGlShapeCommands);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(createCanvasTextureResolvers()));
const drawingPath: PathPoint[][] = [[], [], [], []];

const offsets: [number, number][] = [
  [-50, -50],
  [50, -50],
  [-50, 50],
  [50, 50],
];

const root = createDisplayObject();

// SDK v652's canvas-backed Shape renderer does not flush a pending path when lineStyle changes. If all
// three styles are appended to one Shape, its final white 5px style strokes the entire path. Separate
// shapes force separate raster/stroke passes and preserve the black → gray → white tracer progression.
const tracerShapes = [
  { shape: createShape(), thickness: 1, color: 0x000000 },
  { shape: createShape(), thickness: 3, color: 0xcccccc },
  { shape: createShape(), thickness: 5, color: 0xffffff },
] as const;
for (const tracer of tracerShapes) {
  addNodeChild(root, tracer.shape);
}

const movingRect = createDisplayObject();
movingRect.x = WIDTH / 2;
movingRect.y = HEIGHT / 2;
invalidateNodeLocalTransform(movingRect);

const markers = offsets.map(([dx, dy]) => {
  const c = createShape();
  appendShapeBeginFill(c, 0xdddddd, 1);
  appendShapeCircle(c, 0, 0, 5);
  appendShapeEndFill(c);
  c.x = dx;
  c.y = dy;
  invalidateNodeLocalTransform(c);
  addNodeChild(movingRect, c);
  return c;
});

addNodeChild(root, movingRect);

let dirX = 0;
let dirY = 0;
// DisplayObject.rotation is degrees (matching AwayJS), not radians.
let rotationRate = 3;
let scaleChange = 0;
const markerOrigin = { x: 0, y: 0 };
const markerWorld = { x: 0, y: 0 };

function drawTracerShape(): void {
  for (let i = 0; i < markers.length; i++) {
    // Read the same composed parent + child matrix the renderer uses for the circle. The former manual
    // formula treated movingRect.rotation as radians even though the SDK stores degrees, so the tracer
    // and marker diverged as soon as the container rotated.
    convertNodeVector2LocalToGlobal(markerWorld, markers[i]!, markerOrigin);
    drawingPath[i].push({ x: markerWorld.x, y: markerWorld.y });
    if (drawingPath[i].length > MAX_PATH_LENGTH) {
      drawingPath[i].shift();
    }
  }

  for (const tracer of tracerShapes) {
    clearShapeCommands(tracer.shape);
    appendShapeLineStyle(tracer.shape, tracer.thickness, tracer.color, 1, false, undefined, 'round', 'miter', 1.8);
  }

  for (let p = 0; p < 4; p++) {
    const path = drawingPath[p];
    if (path.length < 2) continue;

    const grayStart = Math.floor(path.length * 0.5) + 1;
    const whiteStart = Math.floor(path.length * 0.9) + 1;
    const ranges: ReadonlyArray<readonly [number, number]> = [
      [1, Math.min(grayStart, path.length)],
      [Math.max(1, grayStart), Math.min(whiteStart, path.length)],
      [Math.max(1, whiteStart), path.length],
    ];

    for (let styleIndex = 0; styleIndex < tracerShapes.length; styleIndex++) {
      const [start, end] = ranges[styleIndex]!;
      if (start >= end) continue;
      const styledShape = tracerShapes[styleIndex]!.shape;
      appendShapeMoveTo(styledShape, path[start - 1]!.x, path[start - 1]!.y);
      for (let i = start; i < end; i++) {
        appendShapeLineTo(styledShape, path[i]!.x, path[i]!.y);
      }
    }
  }

  for (const tracer of tracerShapes) {
    invalidateNodeAppearance(tracer.shape);
  }
}

function enterFrame(): void {
  rotationRate += 0.1 - Math.random() * 0.2;
  scaleChange = 0.005 - Math.random() * 0.01;
  dirX += 0.1 - Math.random() * 0.2;
  dirY += 0.1 - Math.random() * 0.2;

  if (movingRect.x <= -71 * movingRect.scaleX || movingRect.x >= WIDTH + 71 * movingRect.scaleX) {
    dirX *= -1;
  }
  if (movingRect.y <= -71 * movingRect.scaleX || movingRect.y >= HEIGHT + 71 * movingRect.scaleX) {
    dirY *= -1;
  }

  movingRect.x += dirX;
  movingRect.y += dirY;
  movingRect.rotation += rotationRate;
  movingRect.scaleX += scaleChange;
  movingRect.scaleY += scaleChange;
  invalidateNodeLocalTransform(movingRect);

  drawTracerShape();
  prepareScene2DRender(state, root);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  requestAnimationFrame(enterFrame);
}

window.addEventListener('resize', () => {
  WIDTH = window.innerWidth;
  HEIGHT = window.innerHeight;
  const pr = window.devicePixelRatio || 1;
  canvas.width = WIDTH * pr;
  canvas.height = HEIGHT * pr;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
});

enterFrame();
