import type { RichText } from '@flighthq/sdk';
import {
  addNodeChild,
  attachKeyboardInput,
  attachTextInput,
  attachWheelInput,
  connectInputToTextInput,
  connectSignal,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createInputManager,
  createRichText,
  createTextInputManager,
  defaultGlRichTextRenderer,
  enableTextInput,
  focusTextInput,
  invalidateNodeLocalTransform,
  loadFontFromUrl,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  RichTextKind,
} from '@flighthq/sdk';

let width = window.innerWidth;
let height = window.innerHeight;

let pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(width, height, pixelRatio);
if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}
document.body.style.margin = '0';

const state = createGlRenderState(canvas, {
  backgroundColor: 0xccccccff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: false },
  pixelRatio,
});

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
const font = await loadFontFromUrl('/georgia.ttf', 'Georgia');

const root = createDisplayObject();
root.x = canvas.width / 2;
root.y = canvas.height / 2;
invalidateNodeLocalTransform(root);

const textFields: RichText[] = [];

for (let i = 0; i < 30; i++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = {
    font: font.name,
    color: 0xff0000,
    size: 40,
  };
  tf.data.text = '12345\n67890';
  tf.data.background = true;
  tf.data.border = true;
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
attachKeyboardInput(input, window);
attachTextInput(input, canvas);
attachWheelInput(input, canvas);

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
  root.x = canvas.width / 2 - cameraX * scale;
  root.y = canvas.height / 2 - cameraY * scale;
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
  prepareScene2DRender(state, root);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  state.pixelRatio = pixelRatio;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
  updateCamera();
});

frame();
