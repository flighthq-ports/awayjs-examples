import type { AnimationPlayer, AnimationTrack, BlinnPhongMaterial, Mesh, Scene3D } from '@flighthq/sdk';

import { applyAwayGloss } from '../../shared/lighting';

import {
  addNodeChild,
  cloneMeshGeometry,
  createAnimationPlayer,
  createBlinnPhongMaterial,
  createMesh,
  createScene3DFromMd2,
  createTexture,
  getNodeChildren,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  setVector3,
} from '@flighthq/sdk';

export interface KnightAnimationBucket {
  driver: Mesh;
  player: AnimationPlayer | null;
  track: AnimationTrack | null;
}

export interface KnightsResult {
  animationBuckets: KnightAnimationBucket[];
  knightMaterials: BlinnPhongMaterial[];
}

export async function loadKnights(scene: Readonly<Scene3D>): Promise<KnightsResult> {
  const knightMaterials: BlinnPhongMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const material = createBlinnPhongMaterial({ diffuse: 0xffffffff });
    // Strength is the source's full 1. The exponent is NOT: AwayJS authored gloss 30, but under Flight's
    // energy-correct Blinn lobe that spreads into a broad matte sheen instead of the polished-steel look
    // the armour wants. Driving it to 120 (×3.6 → shininess 432 via applyAwayGloss's Phong→Blinn
    // conversion) concentrates the same energy into a hard specular glint. This is a deliberate departure
    // from the source value — the demo has no environment map, so a tight highlight is the only cue
    // carrying "metal" here; true reflectivity would need an IBL environment the original never had.
    applyAwayGloss(material, { gloss: 120, specular: 1 });
    knightMaterials.push(material);
  }

  const knightImages = await Promise.all([
    loadImageResourceFromUrl('/pknight1.png'),
    loadImageResourceFromUrl('/pknight2.png'),
    loadImageResourceFromUrl('/pknight3.png'),
    loadImageResourceFromUrl('/pknight4.png'),
  ]);

  for (let i = 0; i < 4; i++) {
    // AwayJS shades directly from the stored 8-bit values — they ARE its reflectances, never decoded.
    // Declaring the skins linear reproduces that: an sRGB decode would instead push the armour's darkest
    // texels ~50× lower, and no amount of ambient recovers them (they are near-zero albedo, so ambient
    // scales them by ~nothing). That is what left the knights reading as black silhouettes.
    knightMaterials[i]!.diffuseMap = createTexture({ source: knightImages[i]!, colorSpace: 'linear' });
  }

  const md2Buffer = await fetch('/pknight.md2').then((r) => r.arrayBuffer());
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

  for (let i = 0; i < numWide; i++) {
    for (let j = 0; j < numDeep; j++) {
      const material = knightMaterials[Math.floor(Math.random() * knightMaterials.length)]!;
      const bucket = animationBuckets[Math.floor(Math.random() * animationBuckets.length)]!;
      const knight = createMesh(bucket.driver.geometry, [material]);

      const x = ((i - (numWide - 1) / 2) * 5000) / numWide;
      const z = ((j - (numDeep - 1) / 2) * 5000) / numDeep;
      setVector3(knight.position, x, 120, z);
      setVector3(knight.scale, 5, 5, 5);
      invalidateNodeLocalTransform(knight);
      addNodeChild(scene.root, knight);
    }
  }

  return { animationBuckets, knightMaterials };
}
