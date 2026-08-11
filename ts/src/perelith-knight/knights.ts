import type { AnimationPlayer, AnimationTrack, Environment, Mesh, Scene3D, StandardPbrMaterial } from '@flighthq/sdk';

import {
  addNodeChild,
  cloneMeshGeometry,
  createAnimationPlayer,
  createCubeTexture,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createScene3DFromMd2,
  createStandardPbrMaterial,
  createTexture,
  getNodeChildren,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  setCubeTextureFace,
  setVector3,
} from '@flighthq/sdk';

export interface KnightAnimationBucket {
  driver: Mesh;
  player: AnimationPlayer | null;
  track: AnimationTrack | null;
}

export interface KnightsResult {
  animationBuckets: KnightAnimationBucket[];
  knightMaterials: StandardPbrMaterial[];
  environment: Environment;
}

/**
 * A sky-over-ground gradient, built on a canvas rather than loaded, because this demo ships no skybox.
 *
 * Metal is defined by what it reflects. With a single directional light and nothing in the world to
 * mirror, polished steel has no way to announce itself — the previous material chased the look by
 * driving the Blinn exponent to four times the source value, which buys one hard glint per surface and
 * leaves everything facing away from the light reading as flat white plastic. Widening the lobe instead
 * only spreads that into a sheen; measured, it moved highlight coverage from 6.9% to 7.9% and changed
 * nothing about the character of the surface.
 *
 * Six 64px faces of bright sky above, mid grey at the horizon and near-black below is the smallest
 * environment that fixes it. Armour picks up a light top edge and a dark underside, which is the cue
 * the eye actually reads as metal. It is never drawn — the background stays black as in the source —
 * so this only feeds the IBL.
 */
function buildGradientEnvironment(): Environment {
  const SIZE = 64;
  const SKY = '#dfe6f2';
  const HORIZON = '#8f97a8';
  const GROUND = '#14161c';
  const faces = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    // Face order is +X, -X, +Y, -Y, +Z, -Z: the poles are flat, the four sides carry the gradient.
    if (face === 2) {
      ctx.fillStyle = SKY;
    } else if (face === 3) {
      ctx.fillStyle = GROUND;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, SIZE);
      gradient.addColorStop(0, SKY);
      gradient.addColorStop(0.5, HORIZON);
      gradient.addColorStop(1, GROUND);
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, SIZE, SIZE);
    faces.push(createImageResourceFromCanvas(canvas));
  }
  const cube = createCubeTexture();
  for (let face = 0; face < faces.length; face++) setCubeTextureFace(cube, face, faces[face]!);
  return createEnvironment({ environment: cube, intensity: 1 });
}

export async function loadKnights(scene: Readonly<Scene3D>): Promise<KnightsResult> {
  const environment = buildGradientEnvironment();
  const knightMaterials: StandardPbrMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    // Metallic rather than Blinn-Phong, so the skins act as reflectance rather than as paint: the steel
    // plates mirror the gradient above and the shields keep their copper. Held just under fully metallic
    // because these maps are not pure armour — they carry cloth, leather and painted heraldry too, and at
    // 1.0 those lose their diffuse entirely and read as foil.
    const material = createStandardPbrMaterial({ baseColor: 0xffffffff, metallic: 0.9, roughness: 0.3 });
    knightMaterials.push(material);
  }

  const knightImages = await Promise.all([
    loadImageResourceFromUrl('pknight1.png'),
    loadImageResourceFromUrl('pknight2.png'),
    loadImageResourceFromUrl('pknight3.png'),
    loadImageResourceFromUrl('pknight4.png'),
  ]);

  for (let i = 0; i < 4; i++) {
    // AwayJS shades directly from the stored 8-bit values — they ARE its reflectances, never decoded.
    // Declaring the skins linear reproduces that: an sRGB decode would instead push the armour's darkest
    // texels ~50× lower, and no amount of ambient recovers them (they are near-zero albedo, so ambient
    // scales them by ~nothing). That is what left the knights reading as black silhouettes.
    knightMaterials[i]!.baseColorMap = createTexture({ source: knightImages[i]!, colorSpace: 'linear' });
  }

  const md2Buffer = await fetch('pknight.md2').then((r) => r.arrayBuffer());
  const md2Scene = await createScene3DFromMd2(new Uint8Array(md2Buffer));
  const md2Clips = Object.values(md2Scene.animations);

  let templateMesh: Mesh | null = null;
  for (const child of getNodeChildren(md2Scene.root)) {
    if (isMesh(child)) {
      templateMesh = child as Mesh;
      break;
    }
  }

  if (!templateMesh?.geometry) {
    throw new Error('No mesh found in MD2 file');
  }

  const templateGeometry = templateMesh.geometry;
  const templateMorph = templateMesh.morph;

  const animationBuckets: KnightAnimationBucket[] = [];
  const numWide = 20;
  const numDeep = 20;
  // CPU morphing rewrites and uploads a full geometry each frame, so the crowd shares phased geometries
  // rather than giving all 400 knights their own. AwayJS animates every knight independently; buckets buy
  // that variety back at a linear CPU cost. The count is deliberately NOT capped by the clip count — the
  // model only carries 16 named actions, but each bucket also starts at its own offset into its clip, so
  // more buckets keep going even once every clip is in use. Every visible knight still has its own
  // transform/material and participates in both the shadow and forward passes.
  const ANIMATION_BUCKETS = 48;
  const animationBucketCount = templateMorph != null && md2Clips.length > 0 ? ANIMATION_BUCKETS : 1;

  for (let i = 0; i < animationBucketCount; i++) {
    const geometry = cloneMeshGeometry(templateGeometry);
    const driver = createMesh(geometry, []);
    const clip = md2Clips[i % md2Clips.length] ?? null;
    let player: AnimationPlayer | null = null;
    let track: AnimationTrack | null = null;
    if (templateMorph != null && clip != null) {
      driver.morph = { targets: templateMorph.targets, weights: new Float32Array(templateMorph.weights.length) };
      player = createAnimationPlayer(clip, {
        loop: true,
        time: (i / animationBucketCount) * clip.duration,
      });
      track = clip.channels[0]?.track ?? null;
    }
    animationBuckets.push({ driver, player, track });
  }

  // Seeded rather than Math.random(). The army needs to look unplanned, but it does not need to be
  // different every time the page loads — and while it was, no two runs of this example could be
  // compared. A regression that changed how the knights shade was indistinguishable from the shuffle
  // handing you a different mix of skins and poses, which is exactly the trap it laid for the review
  // that found the winding bug. One constant makes the scene reproducible while looking identical.
  let rngState = 0x9e3779b9;
  const nextRandom = (): number => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };

  for (let i = 0; i < numWide; i++) {
    for (let j = 0; j < numDeep; j++) {
      const material = knightMaterials[Math.floor(nextRandom() * knightMaterials.length)]!;
      const bucket = animationBuckets[Math.floor(nextRandom() * animationBuckets.length)]!;
      const knight = createMesh(bucket.driver.geometry, [material]);

      const x = ((i - (numWide - 1) / 2) * 5000) / numWide;
      const z = ((j - (numDeep - 1) / 2) * 5000) / numDeep;
      setVector3(knight.position, x, 120, z);
      setVector3(knight.scale, 5, 5, 5);
      invalidateNodeLocalTransform(knight);
      addNodeChild(scene.root, knight);
    }
  }

  return { animationBuckets, knightMaterials, environment };
}
