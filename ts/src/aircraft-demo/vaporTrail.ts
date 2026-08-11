import type {
  ParticleEmitter3D,
  ParticleEmitterConfig,
  ParticleEmitterState,
  Scene3D,
  Node3D,
} from '@flighthq/sdk';
import {
  addNodeChild,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  loadImageResourceFromUrl,
  setVector3,
  updateParticleEmitter3D,
} from '@flighthq/sdk';

import { createSingleSpriteAtlas } from '../../shared/particles';

// Engine exhaust vapor. drawGlScene3D draws emitter nodes on its own; each emitter is a scene child stepped
// in step(); its world position is refreshed each step so the two trails ride the nozzles. The bundled
// white.png is a hard-edged square, so generate a soft round sprite at runtime: a radial gradient, opaque
// white core fading to transparent, as a data URL. Gives true-white soft puffs.
function createSoftVaporSpriteUrl(): string {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx !== null) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c.toDataURL('image/png');
}

// Alpha look-up table over 0→1 lifetime (uniform samples, linearly interpolated). The dense samples near
// zero leave the hot exhaust effectively invisible for roughly 0.2–0.3 seconds before condensation forms,
// then keep additive overlap restrained as the wake disperses. alphaCurve is the complete opacity value —
// ParticleEmitterConfig's alphaStart is ignored whenever a curve is present.
const CONTRAIL_ALPHA_CURVE = [
  0, 0, 0.025, 0.06, 0.09, 0.11, 0.12, 0.12, 0.115, 0.105, 0.095, 0.085, 0.075, 0.065, 0.055, 0.047,
  0.04, 0.034, 0.029, 0.024, 0.02, 0.016, 0.013, 0.01, 0.008, 0.006, 0.0045, 0.003, 0.002, 0.001,
  0.0005, 0, 0,
];

// White 'normal'-blend vapor. worldSpace: true bakes each puff into world coordinates at spawn, so puffs
// hang in the air while the jet flies away from them — a genuine contrail rather than a fake. They barely
// drift (near-zero speed), live long, and expand a lot as they age, like ice crystals spreading.
const exhaustConfig: ParticleEmitterConfig = createParticleEmitterConfig({
  worldSpace: true,
  // Keep enough particles for the longest lifetime at this spawn rate, so the far end is not recycled
  // early. At the jet's 220-unit flight speed, 10–13 seconds produces a roughly 2,200–2,860-unit trail.
  maxParticles: 950,
  spawnRate: 70,
  loop: true,
  duration: -1,
  lifetimeMin: 10,
  lifetimeMax: 13,
  emitterShape: 'point',
  speedMin: 0.5,
  speedMax: 2,
  gravityY: 0.15,
  scaleMin: 5,
  scaleMax: 8,
  scaleEnd: 3,
  colorStartR: 1,
  colorStartG: 0.98,
  colorStartB: 0.96,
  colorEndR: 1,
  colorEndG: 0.98,
  colorEndB: 0.96,
  alphaCurve: CONTRAIL_ALPHA_CURVE,
});

interface VaporEmitter {
  emitter: ParticleEmitter3D;
  state: ParticleEmitterState;
  config: ParticleEmitterConfig;
}

export interface VaporTrail {
  // Attach an exhaust emitter to a model-space nozzle offset on `mesh`. The offset is transformed by the
  // mesh's world matrix each step so the emit origin tracks the flying jet's roll.
  attachToNozzle(mesh: Node3D, x: number, y: number, z: number): void;
  // Advance every attached emitter by one fixed timestep, refreshing each nozzle's world position first.
  step(dt: number): void;
}

export async function createVaporTrail(_scene: Scene3D): Promise<VaporTrail> {
  const vaporImage = await loadImageResourceFromUrl(createSoftVaporSpriteUrl());
  const vaporAtlas = createSingleSpriteAtlas(vaporImage);

  const emitters: VaporEmitter[] = [];

  function attachToNozzle(mesh: Node3D, x: number, y: number, z: number): void {
    // Offset out to the engine and back a bit forward of the nozzle exit (deeper in the model, so the
    // trail emerges from within the fuselage).
    const emitter = createParticleEmitter3D();
    emitter.blendMode = 'add';
    emitter.data.atlas = vaporAtlas;
    const state = createParticleEmitterState();
    setVector3(emitter.position, x, y, z);
    addNodeChild(mesh, emitter);
    emitters.push({ emitter, state, config: exhaustConfig });
  }

  function step(dt: number): void {
    for (const vapor of emitters) {
      updateParticleEmitter3D(vapor.emitter, vapor.state, vapor.config, dt);
    }
  }

  return { attachToNozzle, step };
}
