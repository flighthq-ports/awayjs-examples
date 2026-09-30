import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeQuadraticCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  attachPointerInput,
  clearShapeCommands,
  connectSignal,
  createDisplayObject,
  createInputManager,
  createShape,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  invalidateNodeRender,
} from '@flighthq/sdk';
import { webHostInputIngress } from '@flighthq/host-web';
import { setupRenderer } from './render.gl';

interface DrawingPathEntry {
  cmd: string;
  x: number;
  y: number;
  cx?: number;
  cy?: number;
}

document.body.style.margin = '0';
const renderer = setupRenderer();
const drawingPath: DrawingPathEntry[] = [];
let isMouseDown = false;
// The last raw pointer sample, kept alongside the path because a curve entry stores the midpoint
// rather than the sample it came from — so the path's own tail is not the pen's last position.
let lastSampleX = 0;
let lastSampleY = 0;

const root = createDisplayObject();

const bgShape = createShape();
appendShapeBeginFill(bgShape, 0xddddddff);
appendShapeRectangle(bgShape, 0, 0, window.innerWidth, window.innerHeight);
appendShapeEndFill(bgShape);
addNodeChild(root, bgShape);

const shape = createShape();
addNodeChild(root, shape);

const circleGraphic = createShape();
appendShapeBeginFill(circleGraphic, 0xff0000ff);
appendShapeCircle(circleGraphic, 0, 0, 30);
appendShapeEndFill(circleGraphic);
circleGraphic.alpha = 0;
invalidateNodeAppearance(circleGraphic);
addNodeChild(root, circleGraphic);

function drawShape(): void {
  clearShapeCommands(shape);
  appendShapeBeginFill(shape, 0xffffffff);
  appendShapeLineStyle(shape, 5, 0xff0000ff, 1, false, undefined, 'round', 'miter', 1.8);

  if (drawingPath.length === 0) {
    invalidateNodeRender(shape);
    return;
  }

  appendShapeMoveTo(shape, drawingPath[0].x, drawingPath[0].y);
  for (let i = 1; i < drawingPath.length; i++) {
    if (drawingPath[i].cmd === 'l') {
      appendShapeLineTo(shape, drawingPath[i].x, drawingPath[i].y);
    } else if (drawingPath[i].cmd === 'c') {
      appendShapeQuadraticCurveTo(shape, drawingPath[i].cx!, drawingPath[i].cy!, drawingPath[i].x, drawingPath[i].y);
    }
  }
  appendShapeEndFill(shape);
  invalidateNodeRender(shape);
}

// Each entry is the END of one segment, so a stroke has to APPEND as the pointer moves. Mutating the
// tail instead — which is what this did — leaves the path one point long forever, and drawShape()
// then emits a bare moveTo and draws nothing at all.
function updateNewPointForMousePosition(x: number, y: number): void {
  if (!isMouseDown) return;

  const deltaX = x - lastSampleX;
  const deltaY = y - lastSampleY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (distance > 20) {
    // The pointer skipped, so round the corner instead of cornering at the sample: curve to the
    // midpoint using the previous sample as the control point. That keeps the curve tangent to the
    // stroke, which a quadratic ending on the sample itself would not be.
    drawingPath.push({
      cmd: 'c',
      cx: lastSampleX,
      cy: lastSampleY,
      x: lastSampleX + deltaX / 2,
      y: lastSampleY + deltaY / 2,
    });
  } else {
    drawingPath.push({ cmd: 'l', x, y });
  }

  lastSampleX = x;
  lastSampleY = y;
  drawShape();
}

const input = createInputManager();
attachPointerInput(webHostInputIngress, input, renderer.canvas);

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
  lastSampleX = data.x;
  lastSampleY = data.y;

  drawShape();
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

  renderer.render(root);
  requestAnimationFrame(enterFrame);
}

window.addEventListener('resize', () => {
  renderer.resize();
});

enterFrame();
