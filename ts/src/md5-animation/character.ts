import type { AnimationClip, Mesh, Node3D, Scene3D, Texture2D } from '@flighthq/sdk';
import {
  addNodeChild,
  createScene3D,
  createScene3DFromMd5Mesh,
  createExtendedPbrMaterial,
  createSpecularPbrExtension,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
  createTexture,
  createTilingSampler,
  getNodeChildren,
  isMesh,
  loadImageResourceFromUrl,
  parseMd5Anim,
} from '@flighthq/sdk';

export const ANIM_NAMES = [
  'idle2',
  'walk7',
  'attack3',
  'turret_attack',
  'attack2',
  'chest',
  'roar1',
  'leftslash',
  'headpain',
  'pain1',
  'pain_luparm',
  'range_attack2',
];
export const IDLE_NAME = 'idle2';
export const WALK_NAME = 'walk7';

export interface CharacterData {
  clips: Map<string, AnimationClip>;
  skinnedMeshes: Mesh[];
  jointNodes: Node3D[];
  characterPositionNode: Scene3D;
  characterNode: Scene3D;
  gobTexture: Texture2D;
}

export async function loadCharacter(): Promise<CharacterData> {
  const [bodyDiffuse, bodyNormal, bodySpecular, gobImage] = await Promise.all([
    loadImageResourceFromUrl('hellknight/hellknight_diffuse.jpg'),
    loadImageResourceFromUrl('hellknight/hellknight_normals.png'),
    loadImageResourceFromUrl('hellknight/hellknight_specular.png'),
    loadImageResourceFromUrl('hellknight/gob.png'),
  ]);
  // The source drives specular strength from hellknight_specular.png. That map is mostly dark, so it is
  // what keeps the hide matte and confines the wet sheen to the eyes, teeth and open wounds — a uniform
  // roughness in its place made the whole body read as glossy rubber.
  const bodyMaterial = createExtendedPbrMaterial({
    standard: createStandardPbrMaterialProperties({
      baseColor: 0xffffffff,
      baseColorMap: createTexture({ source: bodyDiffuse }),
      metallic: 0,
      normalMap: createTexture({ source: bodyNormal, colorSpace: 'linear' }),
      // Held well below the source's full strength on purpose. computeMeshGeometryTangents derives this
      // model's basis from its UV gradients, and the hellknight's heavily mirrored, island-split character
      // UVs make that basis swing between islands — visualising v_tangent shows flat patches of unrelated
      // directions where the normals themselves are perfectly smooth. Applied at full strength the normal
      // map inherits those jumps and the hands, torso and feet each light as if lit from somewhere
      // slightly different. This keeps the musculature readable while staying under that threshold.
      normalScale: 1,
      roughness: 0.46,
    }),
    extensions: [
      createSpecularPbrExtension({
        specular: 1,
        specularColorMap: createTexture({ source: bodySpecular, colorSpace: 'linear' }),
      }),
    ],
  });

  const gobTexture = createTexture({ source: gobImage, sampler: createTilingSampler() });
  const gobMaterial = createStandardPbrMaterial({
    baseColor: 0xcbd8cfff,
    baseColorMap: gobTexture,
    emissive: 0x101810ff,
    emissiveStrength: 0.2,
    metallic: 0,
    roughness: 0.18,
  });
  // Flight now draws blended materials after opaque geometry, so the source's translucent scrolling
  // saliva can be restored without the old transparent depth-write hiding the character body.
  gobMaterial.alphaMode = 'blend';
  gobMaterial.doubleSided = true;

  const meshText = await fetch('hellknight/hellknight.md5mesh').then((r) => r.text());
  const md5Scene = createScene3DFromMd5Mesh(meshText);

  const md5Children = getNodeChildren(md5Scene.root);
  const characterPositionNode = createScene3D();
  const characterNode = createScene3D();
  const skinnedMeshes: Mesh[] = [];
  let meshIndex = 0;
  for (const child of md5Children) {
    if (isMesh(child)) {
      child.materials[0] = meshIndex === 0 ? bodyMaterial : gobMaterial;
      skinnedMeshes.push(child);
      meshIndex++;
    }
    addNodeChild(characterNode.root, child);
  }
  const jointNodes = skinnedMeshes[0]?.skin?.skeleton.joints ?? [];
  addNodeChild(characterPositionNode.root, characterNode.root);

  const animTexts = await Promise.all(
    ANIM_NAMES.map((name) => fetch(`hellknight/${name}.md5anim`).then((r) => r.text())),
  );

  const clips: Map<string, AnimationClip> = new Map();
  for (let i = 0; i < ANIM_NAMES.length; i++) {
    const clip = parseMd5Anim(animTexts[i]!, jointNodes);
    if (!clip) continue;
    // AwayJS consumes joint zero's translation as owner root motion and omits it from the rendered
    // skeleton for every clip. Zero it here so the skeleton doesn't shift inside the mesh.
    for (const channel of clip.channels) {
      const target = channel.targetRef as { node?: Node3D; path?: string } | null;
      if (target?.node === jointNodes[0] && target.path === 'Translation') {
        channel.track.values = new Float32Array(channel.track.values.length);
      }
    }
    clips.set(ANIM_NAMES[i]!, clip);
  }

  return { clips, skinnedMeshes, jointNodes, characterPositionNode, characterNode, gobTexture };
}
