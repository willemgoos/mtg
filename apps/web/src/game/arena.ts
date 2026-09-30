import type { Cue, Hue } from './juice.ts';

export type ArenaDetail = 'balanced' | 'low' | 'static';
export const ARENA_KEY = 'mtg.arenaDetail';

export function loadArenaDetail(): ArenaDetail {
  try {
    const value = localStorage.getItem(ARENA_KEY);
    return value === 'low' || value === 'static' ? value : 'balanced';
  } catch {
    return 'balanced';
  }
}

export interface ArenaReaction {
  kind: 'runes' | 'surface' | 'impact';
  hue: Hue;
  strength: number;
  delay: number;
  duration: number;
  target?: { object: string } | { player: string };
}

/** Presentation only: never changes engine state or waits for an animation. */
export function arenaReactions(cues: Cue[]): ArenaReaction[] {
  const result: ArenaReaction[] = [];
  for (const cue of cues) {
    if (cue.kind === 'cast')
      result.push({ kind: 'runes', hue: cue.hue, strength: 0.22, delay: 0, duration: 450 });
    else if (cue.kind === 'resolve' && !cue.fizzled)
      result.push({ kind: 'surface', hue: cue.hue, strength: 0.12, delay: 0, duration: 450 });
    else if (cue.kind === 'land')
      result.push({
        kind: 'impact',
        hue: cue.hue,
        strength: Math.min(0.22, 0.08 + cue.weight * 0.02),
        delay: cue.flew ? 470 : 30,
        duration: 450,
        target: { object: cue.id },
      });
    else if (cue.kind === 'hit' && cue.combat)
      result.push({
        kind: 'impact',
        hue: 'R',
        strength: Math.min(0.24, 0.08 + cue.amount * 0.015),
        delay: 0,
        duration: 350,
        target: 'player' in cue.to ? { player: cue.to.player } : { object: cue.to.object.id },
      });
  }
  return result;
}

/** Ignore historical batches when a renderer mounts or its detail changes. */
export function arenaBatchGate(initial: number) {
  let last = initial;
  return (seq: number): boolean => {
    if (seq <= last) return false;
    last = seq;
    return true;
  };
}
