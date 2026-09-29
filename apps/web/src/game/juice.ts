import { cardDb } from '@mtg/cards';
import {
  type CardDefId,
  type Color,
  type GameEvent,
  type GameState,
  manaValue,
  type ObjectId,
  type PlayerId,
  type TargetChoice,
} from '@mtg/engine';

// ---------------------------------------------------------------------------
// Game events -> visual effects (the particle side of what sound.ts does for
// audio). Pure, so the choices are testable; FxLayer turns cues into pixels.
// ---------------------------------------------------------------------------

/** A mana colour, or C for colourless/gold things. */
export type Hue = Color | 'C';

export type Cue =
  /** A permanent lands; `weight` is how hard (creature mana value, 0 for lands). */
  | { kind: 'land'; id: ObjectId; hue: Hue; weight: number; flew: boolean }
  | { kind: 'mana'; id: ObjectId; hue: Hue }
  | { kind: 'cast'; id: ObjectId; hue: Hue }
  /** A non-permanent spell finishing on the stack (or fizzling). */
  | { kind: 'resolve'; id: ObjectId; hue: Hue; fizzled: boolean }
  | { kind: 'attack'; id: ObjectId; defender: PlayerId }
  | { kind: 'block'; blocker: ObjectId; attacker: ObjectId }
  | { kind: 'hit'; source: ObjectId; to: TargetChoice; amount: number; hue: Hue; combat: boolean }
  | { kind: 'die'; id: ObjectId; hue: Hue }
  | { kind: 'heal'; player: PlayerId; amount: number }
  | { kind: 'win' };

const LAND_HUES: Record<string, Color> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

export function hueOf(defId: CardDefId | undefined): Hue {
  const d = defId ? cardDb.get(defId) : undefined;
  if (!d) return 'C';
  if (d.colors.length) return d.colors[0]!;
  for (const s of d.subtypes) if (LAND_HUES[s]) return LAND_HUES[s];
  return 'C';
}

function weightOf(defId: CardDefId): number {
  const d = cardDb.get(defId);
  if (!d || d.types.includes('Land')) return 0;
  return d.types.includes('Creature') ? manaValue(d.manaCost) : 1;
}

/** The effects one batch of engine events should show, in order. */
export function juiceFor(events: GameEvent[], view: GameState, me: PlayerId): Cue[] {
  const cues: Cue[] = [];
  const defOf = (id: ObjectId) => view.objects[id]?.defId;
  const opponentOf = (p: PlayerId) =>
    (Object.keys(view.players) as PlayerId[]).find((q) => q !== p) ?? p;

  const toBattlefield = new Set<string>();
  const spellsDone = new Map<string, CardDefId>();
  for (const e of events) {
    if (e.type !== 'objectMoved') continue;
    if (e.to === 'battlefield') toBattlefield.add(e.id);
    else if (e.from === 'stack') spellsDone.set(e.id, e.defId);
  }

  for (const e of events) {
    switch (e.type) {
      case 'objectMoved':
        if (e.to === 'battlefield') {
          cues.push({
            kind: 'land',
            id: e.id,
            hue: hueOf(e.defId),
            weight: weightOf(e.defId),
            // useFlip flies cards in from the hand and the stack; others just appear.
            flew: e.from === 'hand' || e.from === 'stack',
          });
        } else if (e.from === 'battlefield' && (e.to === 'graveyard' || e.to === 'exile')) {
          cues.push({ kind: 'die', id: e.id, hue: hueOf(e.defId) });
        }
        break;
      case 'tapped': {
        const def = defOf(e.id);
        if (def && cardDb.get(def)?.types.includes('Land')) {
          cues.push({ kind: 'mana', id: e.id, hue: hueOf(def) });
        }
        break;
      }
      case 'spellCast':
        cues.push({ kind: 'cast', id: e.id, hue: hueOf(defOf(e.id)) });
        break;
      case 'resolved':
      case 'fizzled': {
        const def = spellsDone.get(e.id);
        if (def && !toBattlefield.has(e.id)) {
          cues.push({ kind: 'resolve', id: e.id, hue: hueOf(def), fizzled: e.type === 'fizzled' });
        }
        break;
      }
      case 'attackersDeclared':
        for (const id of e.attackers) {
          const ctl = view.objects[id]?.controller;
          if (ctl) cues.push({ kind: 'attack', id, defender: opponentOf(ctl) });
        }
        break;
      case 'blockersDeclared':
        for (const b of e.blocks) cues.push({ kind: 'block', ...b });
        break;
      case 'damageDealt':
        if (e.amount > 0) {
          cues.push({
            kind: 'hit',
            source: e.source,
            to: e.to,
            amount: e.amount,
            hue: hueOf(defOf(e.source)),
            combat: e.combat,
          });
        }
        break;
      case 'lifeChanged':
        if (e.delta > 0) cues.push({ kind: 'heal', player: e.player, amount: e.delta });
        break;
      case 'gameOver':
        if (e.winner === me) cues.push({ kind: 'win' });
        break;
    }
  }
  return cues;
}
