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

// Alpha look-up table over 0→1 lifetime (uniform samples, linearly interpolated): fades in fast just aft
// of the nozzle, plateaus, then slowly diffuses out. The faint start also keeps the youngest puffs from
// hazing the jet when the camera looks down the trail. No scale curve — young puffs need to be big enough
// to overlap into a line (a thin start reads as discrete dots at the spawn spacing).
const CONTRAIL_ALPHA_CURVE = [0, 0.55, 0.6, 0.48, 0.32, 0.18, 0.08, 0];

// White 'normal'-blend vapor. worldSpace: true bakes each puff into world coordinates at spawn, so puffs
// hang in the air while the jet flies away from them — a genuine contrail rather than a fake. They barely
// drift (near-zero speed), live long, and expand a lot as they age, like ice crystals spreading.
const exhaustConfig: ParticleEmitterConfig = createParticleEmitterConfig({
  worldSpace: true,
  // Keep enough particles for the longest lifetime at this spawn rate, so the far end is not recycled
  // early. At the jet's 220-unit flight speed, 12–15 seconds produces a roughly 2,640–3,300-unit trail.
  maxParticles: 1_400,
  spawnRate: 90,
  loop: true,
  duration: -1,
  lifetimeMin: 12,
  lifetimeMax: 15,
  emitterShape: 'point',
  speedMin: 0,
  speedMax: 3,
  gravityY: 2,
  scaleMin: 10,
  scaleMax: 14,
  scaleEnd: 6,
  colorStartR: 1,
  colorStartG: 0.98,
  colorStartB: 0.96,
  colorEndR: 1,
  colorEndG: 0.98,
  colorEndB: 0.96,
  alphaCurve: CONTRAIL_ALPHA_CURVE,
  alphaStart: 0.65,
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
