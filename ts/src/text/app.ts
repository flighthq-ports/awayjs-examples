import type { RichText } from '@flighthq/sdk';
import {
  addNodeChild,
  attachKeyboardInput,
  attachTextInput,
  attachWheelInput,
  connectInputToTextInput,
  connectSignal,
  createDisplayObject,
  createFontResource,
  createInputManager,
  createRichText,
  createTextInputManager,
  enableTextInput,
  focusTextInput,
  invalidateNodeLocalTransform,
  loadFontResourceFromUrl,
} from '@flighthq/sdk';
import { webHostFontLoading, webHostInputIngress } from '@flighthq/host-web';
import { setupRenderer } from './render.gl';

let width = window.innerWidth;
let height = window.innerHeight;

document.body.style.margin = '0';
const renderer = setupRenderer();
const font = createFontResource('Georgia');
await loadFontResourceFromUrl(webHostFontLoading, font, 'georgia.ttf');

const root = createDisplayObject();
root.x = width / 2;
root.y = height / 2;
invalidateNodeLocalTransform(root);

const textFields: RichText[] = [];

for (let i = 0; i < 30; i++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = {
    font: font.family,
    color: 0xff0000ff,
    size: 40,
  };
  tf.data.text = '12345\n67890';
  tf.data.background = true;
  tf.data.border = true;
  // 24-bit RGB, deliberately not RGBA like the text color above: glRichTextRenderer puts the border
  // and background through computeRgbHexString (`color & 0xffffff`) while the text color goes through
  // computeRgbaCssString. An 8-digit value here drops the red byte and strokes the field blue.
  tf.data.borderColor = 0xff0000;
  tf.data.multiline = true;
  tf.data.selectable = true;
  tf.x = (Math.random() - 0.5) * 1000 * (width / height);
  tf.y = (Math.random() - 0.5) * 1000;
  enableTextInput(tf);
  addNodeChild(root, tf);
  textFields.push(tf);
}

let focusIndex = -1;

const input = createInputManager();
attachKeyboardInput(webHostInputIngress, input, window);
attachTextInput(webHostInputIngress, input, renderer.canvas);
attachWheelInput(webHostInputIngress, input, renderer.canvas);

const textInputManager = createTextInputManager();
connectInputToTextInput(input, textInputManager);

connectSignal(input.onKeyDown, (data) => {
  if (data.key === 'Tab') {
    focusIndex = (focusIndex + 1) % textFields.length;
    focusTextInput(textInputManager, textFields[focusIndex]!);
  }
});

let cameraX = 0;
let cameraY = 0;
let cameraZ = -500;

function updateCamera(): void {
  const scale = 500 / Math.abs(cameraZ);
  root.scaleX = scale;
  root.scaleY = scale;
  // Scene coordinates map directly to backing-store pixels, so centre against the backing dimensions.
  root.x = width / 2 - cameraX * scale;
  root.y = height / 2 - cameraY * scale;
  invalidateNodeLocalTransform(root);
}

connectSignal(input.onWheel, (data) => {
  if (data.ctrlKey) {
    cameraZ -= data.deltaY;
    if (cameraZ > -100) cameraZ = -100;
    else if (cameraZ < -2000) cameraZ = -2000;
  } else {
    cameraX += data.deltaX;
    cameraY += data.deltaY;
  }
  updateCamera();
});

function frame(): void {
  renderer.render(root);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  renderer.resize();
  updateCamera();
});

frame();
