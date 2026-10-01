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
    const discard = a.type === 'castSpell' ? a.discard : undefined;
    const copyOf = a.type === 'castSpell' ? a.copyOf : undefined;
    const costs: TargetChoice[] = [a.sacrifice, forageFood(a), discard, copyOf].flatMap((id) =>
      id ? [{ object: { id, zcc: -1 } }] : [],
    );
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
}

export function startTargeting(
  source: ObjectId | null,
  label: string,
  actions: Action[],
): Targeting {
  const skip = actions.find((a) => targetsOf(a).length === 0) ?? null;
  return { source, label, candidates: actions.filter((a) => a !== skip), chosen: [], skip };
}

function matching(t: Targeting): Action[] {
  return t.candidates.filter((a) =>
    t.chosen.every((c, i) => {
      const x = targetsOf(a)[i];
      return x !== undefined && targetKey(x) === targetKey(c);
    }),
  );
}

/** Targets that can be picked for the next slot. */
export function targetOptions(t: Targeting): Map<TargetKey, TargetChoice> {
  const out = new Map<TargetKey, TargetChoice>();
  for (const a of matching(t)) {
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
    if (a.type !== 'castSpell' && a.type !== 'activateAbility') continue;
    const forage = a.forage ? (a.forage === 'graveyard' ? 'g' : 'f') : '';
    const key =
      a.type === 'castSpell'
        ? `${a.mode ?? ''}:${a.kicked ? 'k' : ''}:${a.sacrifice ? 's' : ''}:${forage}:${a.x ?? ''}:${a.paws?.join() ?? ''}:${a.via ?? ''}`
        : forage;
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
