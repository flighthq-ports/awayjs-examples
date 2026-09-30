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
  createGlyphAtlas,
  createInputManager,
  createRichText,
  createTextInputManager,
  enableGlTextInput,
  enableTextInput,
  focusTextInput,
  getGlyphAtlasEntry,
  invalidateNodeLocalTransform,
  loadFontResourceFromUrl,
} from '@flighthq/sdk';
import { webHostFontLoading, webHostGlyphRasterizer, webHostInputIngress } from '@flighthq/host-web';
import { setupRenderer } from './render.gl';

let width = window.innerWidth;
let height = window.innerHeight;

document.body.style.margin = '0';
const renderer = setupRenderer();
enableGlTextInput();
const font = createFontResource('Georgia');
await loadFontResourceFromUrl(webHostFontLoading, font, 'georgia.ttf');

const atlas = createGlyphAtlas({
  fontFamily: font.family,
  fontSize: 128,
  width: 2048,
  height: 2048,
  padding: 5,
  rasterizerBackend: webHostGlyphRasterizer,
});

// The displayed fields use RichText so they can retain TextField behavior, but this remains an FNT
// generation demo: rasterize the digits into the generated atlas before showing its backing surface.
for (const character of '0123456789') {
  getGlyphAtlasEntry(atlas, character.codePointAt(0)!);
}

const root = createDisplayObject();
root.x = width / 2;
root.y = height / 2;
invalidateNodeLocalTransform(root);

const textFields: RichText[] = [];

for (let i = 0; i < 300; i++) {
  const size = Math.round(10 + Math.random() * 100);
  const tf = createRichText();
  tf.data.defaultTextFormat = {
    font: font.family,
    color: 0xff0000ff,
    size,
  };
  tf.data.text = '12345\n67890';
  tf.data.autoSize = 'right';
  tf.data.background = true;
  tf.data.border = true;
  tf.data.borderColor = 0xff0000ff;
  tf.data.multiline = true;
  tf.data.selectable = true;
  tf.x = (Math.random() - 0.5) * 1000 * (width / height);
  tf.y = (Math.random() - 0.5) * 1000;
  enableTextInput(tf);
  addNodeChild(root, tf);
  textFields.push(tf);
}

let cameraX = 0;
let cameraY = 0;
let cameraZ = -500;

function updateCamera(): void {
  const s = 500 / Math.abs(cameraZ);
  root.scaleX = s;
  root.scaleY = s;
  // Scene coordinates map directly to backing-store pixels, so centre against the backing dimensions.
  root.x = width / 2 - cameraX * s;
  root.y = height / 2 - cameraY * s;
  invalidateNodeLocalTransform(root);
}

const input = createInputManager();
attachKeyboardInput(webHostInputIngress, input, window);
attachTextInput(webHostInputIngress, input, renderer.canvas);
attachWheelInput(webHostInputIngress, input, renderer.canvas);

const textInputManager = createTextInputManager();
connectInputToTextInput(input, textInputManager);

let focusIndex = -1;
connectSignal(input.onKeyDown, (data) => {
  if (data.key === 'Tab') {
    focusIndex = (focusIndex + 1) % textFields.length;
    focusTextInput(textInputManager, textFields[focusIndex]!);
  }
});

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
