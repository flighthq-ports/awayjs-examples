import type { AnimationChannel, AnimationClip, AnimationCrossfade, AnimationPlayer } from '@flighthq/sdk';
import {
  advanceAnimationCrossfade,
  advanceAnimationPlayer,
  applyAnimationClipToScene3D,
  createAnimationCrossfade,
  createAnimationPlayer,
  invalidateNodeLocalTransform,
  isAnimationCrossfadeComplete,
  sampleAnimationCrossfade,
  setQuaternion,
  setVector3,
} from '@flighthq/sdk';

const IDLE_NAME = 'idle';
// Keys 1-5 select attack01-attack05, matching the AwayJS reference. The AWD also carries a 'walk'
// clip, but the reference never binds or plays it — including it here shifted every key by one.
const ACTION_NAMES = ['attack01', 'attack02', 'attack03', 'attack04', 'attack05'];
const CROSSFADE_DURATION = 0.3;

export interface AnimationState {
  step(dt: number): void;
}

// The AWD parser creates a fresh {node, path} targetRef per channel per clip. createAnimationCrossfade
// matches channels by targetRef identity, so clips that animate the same joints will fail to pair
// (0 matches → crossfade snaps instead of blending). Normalize all clips to share canonical targetRef
// objects: the first clip seen for each (node, path) pair defines the canonical ref, and all subsequent
// clips reuse it.
function normalizeTargetRefs(clips: Map<string, AnimationClip>): void {
  const canonicalByNode = new Map<unknown, Map<string, unknown>>();
  for (const clip of clips.values()) {
    for (const channel of clip.channels) {
      const ref = channel.targetRef as { node: unknown; path: string } | null;
      if (ref === null || typeof ref !== 'object') continue;
      let pathMap = canonicalByNode.get(ref.node);
      if (!pathMap) {
        pathMap = new Map();
        canonicalByNode.set(ref.node, pathMap);
      }
      const existing = pathMap.get(ref.path);
      if (existing) {
        (channel as { targetRef: unknown }).targetRef = existing;
      } else {
        pathMap.set(ref.path, ref);
      }
    }
  }
}

function applyCrossfadeVisit(sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>): void {
  const target = channel.targetRef as { node: any; path: string } | null;
  if (target === null || typeof target !== 'object' || target.node === undefined) return;
  if (target.path === 'Weights') {
    const morph = target.node.morph;
    if (morph == null) return;
    for (let i = 0; i < morph.weights.length; i++) morph.weights[i] = sampled[i]!;
    return;
  }
  const node = target.node;
  if (target.path === 'Translation') {
    setVector3(node.position, sampled[0]!, sampled[1]!, sampled[2]!);
  } else if (target.path === 'Scale') {
    setVector3(node.scale, sampled[0]!, sampled[1]!, sampled[2]!);
  } else {
    setQuaternion(node.rotation, sampled[0]!, sampled[1]!, sampled[2]!, sampled[3]!);
  }
  invalidateNodeLocalTransform(node);
}

export function createAnimationState(animations: Record<string, AnimationClip | undefined>): AnimationState {
  const clips: Map<string, AnimationClip> = new Map();
  for (const [name, clip] of Object.entries(animations)) {
    if (clip) clips.set(name, clip);
  }

  normalizeTargetRefs(clips);

  const idleClip = clips.get(IDLE_NAME);
  if (!idleClip) throw new Error('Failed to parse AWD skeleton animation');

  let activePlayer: AnimationPlayer = createAnimationPlayer(idleClip, { loop: true, speed: 1 });
  let currentAnim = IDLE_NAME;
  let onceAnim: string | null = null;
  let crossfade: AnimationCrossfade | null = null;
  const crossfadeScratch = new Float32Array(4);

  function play(name: string): void {
    if (currentAnim === name) return;
    const c = clips.get(name);
    if (!c) return;
    currentAnim = name;
    const looping = name === IDLE_NAME;
    const nextPlayer = createAnimationPlayer(c, { loop: looping, speed: 1 });
    const fromPlayer = crossfade !== null ? crossfade.to : activePlayer;
    crossfade = createAnimationCrossfade(fromPlayer, nextPlayer, CROSSFADE_DURATION);
    activePlayer = nextPlayer;
  }

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const idx = parseInt(e.key, 10);
    if (idx >= 1 && idx <= ACTION_NAMES.length) {
      const name = ACTION_NAMES[idx - 1];
      if (name) {
        onceAnim = name;
        play(name);
      }
    }
  });

  return {
    step(dt: number) {
      if (crossfade !== null) {
        advanceAnimationCrossfade(crossfade, dt);
        sampleAnimationCrossfade(crossfadeScratch, crossfade, applyCrossfadeVisit);
        if (isAnimationCrossfadeComplete(crossfade)) {
          activePlayer = crossfade.to;
          crossfade = null;
        }
      } else {
        advanceAnimationPlayer(activePlayer, dt);
        applyAnimationClipToScene3D(activePlayer.clip, activePlayer.time);
      }

      if (onceAnim && !activePlayer.playing && crossfade === null) {
        onceAnim = null;
        play(IDLE_NAME);
      }
    },
  };
}
