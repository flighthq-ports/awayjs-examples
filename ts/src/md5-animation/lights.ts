import type { DirectionalLight, PointLight, Scene3DLights } from '@flighthq/sdk';
import { createScene3DLights } from '@flighthq/sdk';

import { awayDirection, setAwayPosition } from '../../shared/camera';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';

export interface Md5LightRig {
  directional: DirectionalLight;
  lights: Scene3DLights;
  update(timeSeconds: number): void;
}

export function createMd5LightRig(): Md5LightRig {
  const redLight = createPointLightFromAway({
    color: 0xff1111,
    diffuse: 1.05,
    range: 5000,
    referenceDistance: 900,
  });
  const blueLight = createPointLightFromAway({
    color: 0x1111ff,
    diffuse: 1.05,
    range: 5000,
    referenceDistance: 900,
  });
  const { directional, ambient } = createDirectionalLightFromAway({
    direction: awayDirection(-50, -20, 10),
    color: 0xffffee,
    diffuse: 1,
    ambient: 1,
    ambientColor: 0x303040,
    // Retain just enough cool fill to read the diffuse texture while giving the white key enough
    // weight for a legible cast shadow and directional normal-map relief. The roaming red/blue lights
    // still define the Doom-like character silhouette.
    //
    // The key's share matters more than its absolute level, for two reasons. Flight's shadow map
    // attenuates only the DIRECTIONAL term, where AwayJS's shadow method darkened the composed lighting,
    // so the ground must take enough of its light from this one light for the shadow to register at all.
    // And this is the ONLY light that casts, while the red/blue pair orbits, so if they dominate the
    // character's shading its lit side swings around with them while the shadow stays pinned left.
    //
    // But the key cannot simply be made dominant either. awayDirection(-50, -20, 10) sits only ~21°
    // above the horizon — a hard side light — so on its own it leaves half the character in near-black
    // and that dead half stays put as the character turns. The source fills exactly that half with two
    // full-strength point lights plus ambient. Hence this balance: the key leads enough to own the form
    // and agree with the shadow, while the roaming pair stays strong enough to keep the off-key side
    // alive and coloured, as in the original.
    tuning: { diffuse: 2.0, ambient: 1.15, ambientColor: 0x3e4556 },
  });

  const lights = createScene3DLights({ ambient, directional, point: [redLight, blueLight] });

  function update(timeSeconds: number): void {
    // AwayJS advanced this phase by 0.01 per 60 Hz frame. Preserve that pace while bringing the
    // orbit inward: Flight point lights use physical inverse-square attenuation whereas AwayJS's
    // enormous default radius kept these lights at full power throughout their 1,500-unit orbit.
    const count = timeSeconds * 0.6;
    setLightPosition(redLight, Math.sin(count) * 950, 250 + Math.sin(count * 0.54) * 180, Math.cos(count * 0.7) * 950);
    setLightPosition(
      blueLight,
      -Math.sin(count * 0.8) * 950,
      250 - Math.sin(count * 0.65) * 180,
      -Math.cos(count * 0.9) * 950,
    );
  }

  update(0);
  return { directional, lights, update };
}

function setLightPosition(light: PointLight, x: number, y: number, z: number): void {
  setAwayPosition(light.position, x, y, z);
}
