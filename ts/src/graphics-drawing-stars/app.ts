import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  attachKeyboardInput,
  attachPointerInput,
  clearShapeCommands,
  connectSignal,
  createDisplayObject,
  createInputManager,
  createShape,
  invalidateNodeLocalTransform,
  invalidateNodeRender,
  removeNodeChildren,
} from '@flighthq/sdk';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();
const { canvas } = renderer;
const root = createDisplayObject();

let activeStar: Shape | null = null;
let startX = 0;
let startY = 0;

function addBackground(): void {
  const bg = createShape();
  appendShapeBeginFill(bg, 0xdddddd, 1);
  appendShapeRectangle(bg, 0, 0, window.innerWidth, window.innerHeight);
  appendShapeEndFill(bg);
  addNodeChild(root, bg);
}

addBackground();

function packColor(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function drawStar(star: Shape, radiusOuter: number): void {
  const radiusInner = radiusOuter / 2 + Math.random() * (radiusOuter / 2);

  const r = Math.floor(Math.random() * 255);
  const g = Math.floor(Math.random() * 255);
  const b = Math.floor(Math.random() * 255);
  const spikes = Math.round(2 + Math.random() * 100);
  const fillColor = packColor(r, g, b);
  const strokeColor = packColor(255 - r, 255 - g, 255 - b);
  const thickness = 1 + Math.random() * 3;
  const alpha = 0.5 + Math.random() * 0.5;

  clearShapeCommands(star);
  appendShapeBeginFill(star, fillColor, alpha);
  appendShapeLineStyle(star, thickness, strokeColor, alpha, false, undefined, 'round', 'miter', 1.8);
  appendShapeMoveTo(star, radiusOuter * Math.cos(0), radiusOuter * Math.sin(0));

  const aDelta = (360 / spikes) * 0.5;
  let a = 0;
  for (let i = 0; i < spikes; i++) {
    a += aDelta;
    appendShapeLineTo(star, radiusInner * Math.cos(a * (Math.PI / 180)), radiusInner * Math.sin(a * (Math.PI / 180)));
    a += aDelta;
    appendShapeLineTo(star, radiusOuter * Math.cos(a * (Math.PI / 180)), radiusOuter * Math.sin(a * (Math.PI / 180)));
  }
  appendShapeEndFill(star);
  invalidateNodeRender(star);
}

const input = createInputManager();
attachPointerInput(input, canvas);
attachKeyboardInput(input, window);

connectSignal(input.onPointerDown, (data) => {
  startX = data.x;
  startY = data.y;

  activeStar = createShape();
  activeStar.x = startX;
  activeStar.y = startY;
  invalidateNodeLocalTransform(activeStar);
  drawStar(activeStar, 10);
  addNodeChild(root, activeStar);
});

connectSignal(input.onPointerMove, (data) => {
  if (!activeStar) return;
  const dx = data.x - startX;
  const dy = data.y - startY;
  let distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 10) distance = 10;
  drawStar(activeStar, distance);
});

connectSignal(input.onPointerUp, () => {
  activeStar = null;
});

connectSignal(input.onKeyDown, (data) => {
  if (data.key === 'c') {
    removeNodeChildren(root);
    addBackground();
  }
});

function frame(): void {
  renderer.render(root);
  requestAnimationFrame(frame);
}

renderer.resize();
window.addEventListener('resize', renderer.resize);

frame();
