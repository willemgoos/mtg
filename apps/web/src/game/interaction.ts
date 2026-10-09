import type { Action, GameState, ObjectId, PlayerId, TargetChoice } from '@mtg/engine';

/** Stable key for a target: "player:p1" or "obj:o12". */
export type TargetKey = string;
export const targetKey = (t: TargetChoice): TargetKey =>
  'player' in t ? `player:${t.player}` : `obj:${t.object.id}`;

/** The Food an action sacrifices to forage, if it forages that way. */
export function forageFood(a: Action): ObjectId | null {
  return (a.type === 'castSpell' || a.type === 'activateAbility') &&
    a.forage &&
    a.forage !== 'graveyard'
    ? a.forage
    : null;
}

/**
 * What the player picks on the board for an action, in order. A creature
 * sacrificed as a cost (Eaten Alive, Vampiric Rites) or a Food sacrificed to
 * forage is picked first, like a target.
 */
export function targetsOf(a: Action): TargetChoice[] {
  if (a.type === 'castSpell' || a.type === 'activateAbility') {
    // Strixhaven (13c): an ability's discard (Jadzi) or exile-from-hand (Uvilda) cost is picked too.
    const discard = a.discard;
    const copyOf = a.type === 'castSpell' ? a.copyOf : undefined;
    // Sneak: the unblocked attacker to return is picked first.
    const sneak = a.type === 'castSpell' ? a.sneak : undefined;
    // Villainous Syndication: the creature tapped for the cost is picked too.
    const tapped = a.type === 'activateAbility' ? a.tapCreature : undefined;
    // Reality Fracture (17a): Tenured Tethermage: the artifacts tapped for the cost are picked too.
    const tappedArtifacts = a.type === 'activateAbility' ? (a.tapArtifacts ?? []) : [];
    // Lorwyn Eclipsed (18a): the creature a blight cost puts its -1/-1 counters on is picked too.
    const blight = a.blight;
    // Lorwyn Eclipsed (18b, white): Kithkeeper: the creatures tapped for "tap three untapped creatures" (any order).
    const tappedCreatures = a.type === 'activateAbility' ? (a.tapCreatures ?? []) : [];
    const costs: TargetChoice[] = [
      a.sacrifice,
      forageFood(a),
      blight,
      discard,
      copyOf,
      sneak,
      tapped,
      ...tappedArtifacts,
      ...tappedCreatures,
    ].flatMap((id) => (id ? [{ object: { id, zcc: -1 } }] : []));
    return [...costs, ...a.targets];
  }
  return a.type === 'chooseTargets' ? a.targets : [];
}

/** An in-progress target selection over a set of legal actions that differ only in targets. */
export interface Targeting {
  /** The card or permanent the spell/ability comes from (for arrows and the prompt). */
  source: ObjectId | null;
  label: string;
  candidates: Action[];
  chosen: TargetChoice[];
  /** An optional trigger: choosing nothing is allowed. */
  skip: Action | null;
  /** Marvel Super Heroes Jumpstart (Blink): "any number of targets", picked one at a time (`skip` is "done"). */
  anyNumber?: boolean;
}

export function startTargeting(
  source: ObjectId | null,
  label: string,
  actions: Action[],
  picked?: TargetChoice[],
): Targeting {
  const n = picked?.length ?? 0;
  const skip = actions.find((a) => targetsOf(a).length === n) ?? null;
  return {
    source,
    label,
    candidates: actions.filter((a) => a !== skip),
    chosen: picked ?? [],
    skip,
    ...(picked ? { anyNumber: true } : {}),
  };
}

/**
 * Lorwyn Eclipsed (18b, white): the slots of an action that are a set rather than a sequence (the creatures tapped for
 * "tap three untapped creatures you control" are picked in any order): [from, to) in `targetsOf(a)`.
 */
function unorderedSlots(a: Action): [number, number] | null {
  if (a.type !== 'activateAbility' || !a.tapCreatures?.length) return null;
  const to = targetsOf(a).length - a.targets.length;
  return [to - a.tapCreatures.length, to];
}

/** Does the chosen list fit this action, the unordered slots in any order? */
function fits(a: Action, chosen: readonly TargetChoice[]): boolean {
  const ts = targetsOf(a);
  const slots = unorderedSlots(a);
  const used = new Set<TargetKey>();
  return chosen.every((c, i) => {
    const k = targetKey(c);
    if (slots && i >= slots[0] && i < slots[1]) {
      if (used.has(k)) return false;
      used.add(k);
      return ts.slice(slots[0], slots[1]).some((x) => targetKey(x) === k);
    }
    const x = ts[i];
    return x !== undefined && targetKey(x) === k;
  });
}

function matching(t: Targeting): Action[] {
  return t.candidates.filter((a) => fits(a, t.chosen));
}

/** Targets that can be picked for the next slot. */
export function targetOptions(t: Targeting): Map<TargetKey, TargetChoice> {
  const out = new Map<TargetKey, TargetChoice>();
  const taken = new Set(t.chosen.map(targetKey));
  for (const a of matching(t)) {
    const slots = unorderedSlots(a);
    if (slots && t.chosen.length >= slots[0] && t.chosen.length < slots[1]) {
      for (const next of targetsOf(a).slice(slots[0], slots[1]))
        if (!taken.has(targetKey(next))) out.set(targetKey(next), next);
      continue;
    }
    const next = targetsOf(a)[t.chosen.length];
    if (next) out.set(targetKey(next), next);
  }
  return out;
}

/** Picks a target: returns the finished action, or the narrowed targeting state. */
export function pickTarget(t: Targeting, key: TargetKey): Action | Targeting | null {
  const choice = targetOptions(t).get(key);
  if (!choice) return null;
  const next: Targeting = { ...t, chosen: [...t.chosen, choice] };
  const left = matching(next);
  const done = left.find((a) => targetsOf(a).length === next.chosen.length);
  // Reality Fracture (17c): "up to one" target after a required one (Way of the Warlord): the choice so far is a finished
  // action, but a further target may still be picked, so finishing is offered as "Done" instead of happening at once.
  if (done && left.some((a) => targetsOf(a).length > next.chosen.length))
    return { ...next, skip: done };
  return done ?? next;
}

export function isTargeting(x: Action | Targeting): x is Targeting {
  return 'candidates' in x;
}

// ---------------------------------------------------------------------------
// What clicking a card can do
// ---------------------------------------------------------------------------

export function handActions(legal: readonly Action[], card: ObjectId): Action[] {
  return legal.filter(
    (a) =>
      (a.type === 'castSpell' ||
        a.type === 'playLand' ||
        a.type === 'discard' ||
        a.type === 'bottomCard') &&
      a.card === card,
  );
}

/**
 * Cast (or activate) actions grouped by how the cost is paid: mode, kicker,
 * sacrifice, forage (any Food, or the graveyard). In legal-action order.
 */
export function castGroups(casts: readonly Action[]): Action[][] {
  const groups = new Map<string, Action[]>();
  for (const a of casts) {
    // Final Fantasy (11a): an adventure land's "play the land" option is a group of its own.
    if (a.type === 'playLand') {
      groups.set('land', [a]);
      continue;
    }
    if (a.type !== 'castSpell' && a.type !== 'activateAbility') continue;
    const forage = a.forage ? (a.forage === 'graveyard' ? 'g' : 'f') : '';
    // Lorwyn Eclipsed (18a): blighting or not, evoke, conspire and the kinds of counters removed are ways of paying too.
    const blight = a.blight ? 'bl' : '';
    const key =
      a.type === 'castSpell'
        ? `${a.mode ?? ''}:${a.kicked ? 'k' : ''}:${a.sacrifice ? 's' : ''}:${forage}:${a.x ?? ''}:${a.paws?.join() ?? ''}:${a.via ?? ''}:${a.back ? 'b' : ''}:${a.sneak ? 'sn' : ''}:${a.beheld ? 'bh' : ''}:${a.beholdCard ?? ''}:${blight}:${a.evoked ? 'ev' : ''}:${a.conspire ? 'cs' : ''}:${a.beholdCards?.join() ?? ''}`
        : `${forage}:${a.x ?? ''}:${blight}:${a.removeKinds?.join() ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()];
}

export function permanentActions(legal: readonly Action[], id: ObjectId): Action[] {
  return legal.filter(
    (a) =>
      (a.type === 'activateAbility' && a.source === id) ||
      ((a.type === 'addAttacker' || a.type === 'removeAttacker') && a.attacker === id) ||
      ((a.type === 'addBlock' || a.type === 'removeBlock') && a.blocker === id),
  );
}

// ---------------------------------------------------------------------------
// Auto-pass (Arena-style: only stop when there's something worth deciding)
// ---------------------------------------------------------------------------

export interface PassSettings {
  fullControl: boolean;
  /** Keep passing until this turn number is over ("End turn" button). */
  passTurn: number | null;
}

export function shouldAutoPass(
  s: GameState,
  legal: readonly Action[],
  me: PlayerId,
  settings: PassSettings,
): boolean {
  const d = s.decision;
  if (d.kind !== 'priority' || d.player !== me) return false;
  // Stop on the opponent's spells and abilities even with no possible response,
  // so the human sees what is about to happen and clicks Resolve (as in Arena).
  const top = s.stack[s.stack.length - 1];
  if (top && top.controller !== me) return false;
  if (legal.length <= 1) return true;
  if (settings.fullControl) return false;
  if (top) return true; // let my own spells resolve
  if (settings.passTurn === s.turn.number) return true;

  const myTurn = s.turn.activePlayer === me;
  const step = s.turn.step;
  if (myTurn && (step === 'main1' || step === 'main2')) return false;
  // After blocks, stop so combat tricks can be cast.
  if (step === 'declareBlockers' && !!s.combat?.attackers.length) return false;
  return true;
}
