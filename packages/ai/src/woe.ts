import {
  type Action,
  type CardDb,
  cloneState,
  type Engine,
  type GameState,
  getAbilities,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';

// Wilds of Eldraine (23a): what the bots need beyond the evaluation for the set's mechanics. Bargain, Roles and the choice of what
// to sacrifice are scored like any other cast (the evaluation sees the sacrificed permanent and the bigger effect).

/** Does `p` control a permanent with a celebration ability (a static or a trigger that checks it)? */
export function hasCelebrationPayoff(s: GameState, db: CardDb, p: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = s.objects[id]!;
    if (o.controller !== p) return false;
    return !!db
      .get(o.defId)
      ?.abilities.some(
        (a) =>
          (a.kind === 'triggered' && a.condition?.kind === 'celebration') ||
          (a.kind === 'static' &&
            a.effect.kind === 'while' &&
            a.effect.condition.kind === 'celebration'),
      );
  });
}

/** Celebration is on for `p`: two or more nonland permanents entered under their control this turn. */
export const celebrating = (s: GameState, p: PlayerId): boolean =>
  (s.turn.nonlandEntered?.[p] ?? 0) >= 2;

/**
 * Before combat on `me`'s turn, the "at the beginning of combat, if two or more nonland permanents entered ..." payoffs that are
 * now switched on (Pests of Honor, Belligerent of the Ball): the evaluation can't see the trigger before it happens.
 */
export function celebrationCombatPayoffs(s: GameState, db: CardDb, me: PlayerId): number {
  if (s.turn.activePlayer !== me || !['upkeep', 'draw', 'main1'].includes(s.turn.step)) return 0;
  if (!celebrating(s, me)) return 0;
  return s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    return (
      o.controller === me &&
      !!db
        .get(o.defId)
        ?.abilities.some(
          (a) =>
            a.kind === 'triggered' &&
            a.trigger.on === 'beginningOfCombat' &&
            a.condition?.kind === 'celebration',
        )
    );
  }).length;
}

/** Is this activation "this land becomes a creature until end of turn" (a Restless land)? */
function animatesSelf(
  engine: Engine,
  view: GameState,
  a: Action,
): a is Extract<Action, { type: 'activateAbility' }> {
  if (a.type !== 'activateAbility') return false;
  const ab = getAbilities(view, engine.db, a.source)[a.abilityIndex];
  return (
    ab?.kind === 'activated' &&
    ab.effects.some((e) => e.kind === 'animate' && e.what === 'self' && !e.permanent)
  );
}

/**
 * The Restless lands: in our first main phase, with nothing better to do, animate a land if it would then be one of our attackers
 * (the attack plan made from the declare attackers step after the activation). Returns the activation, or null.
 */
export function chooseAnimateToAttack(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
  planAttacks: (engine: Engine, view: GameState, me: PlayerId, declared: ObjectId[]) => ObjectId[],
): Action | null {
  if (view.turn.activePlayer !== me || view.turn.step !== 'main1' || view.stack.length > 0)
    return null;
  const seen = new Set<ObjectId>();
  for (const a of legal) {
    if (!animatesSelf(engine, view, a) || seen.has(a.source)) continue;
    seen.add(a.source);
    const land = view.objects[a.source];
    if (!land || land.tapped || land.summoningSick) continue;
    const sim = cloneState(view);
    try {
      engine.applyActionInPlace(sim, a, { trusted: true });
      // Resolve it and go to the declare attackers step (both players pass).
      for (let i = 0; i < 12 && sim.decision.kind !== 'declareAttackers'; i++) {
        const d = sim.decision;
        if (d.kind !== 'priority' || sim.turn.step === 'main2' || sim.turn.step === 'end') break;
        engine.applyActionInPlace(
          sim,
          { type: 'passPriority', player: d.player },
          { trusted: true },
        );
      }
    } catch {
      continue;
    }
    if (sim.decision.kind !== 'declareAttackers' || sim.objects[a.source]?.tapped) continue;
    if (planAttacks(engine, sim, me, []).includes(a.source)) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wilds of Eldraine (23b multi): Talion, the Kindly Lord's number, Edgewall Inn's color
// ---------------------------------------------------------------------------

/** How common each mana value is among spells (a prior for a number to name when nothing has been seen). */
const NUMBER_PRIOR = [0, 3, 6, 6, 5, 4, 2, 1, 0, 0, 0];

/**
 * Talion: "choose a number between 1 and 10" (the options are the numbers). The bot names the number that matches the most
 * cards of the opponent it has seen (mana value, power or toughness), else a common mana value.
 */
export function chooseTalionNumber(
  db: CardDb,
  s: GameState,
  me: PlayerId,
  d: Extract<GameState['decision'], { kind: 'chooseOption' }>,
): Action | undefined {
  if (d.options.length !== 10 || !d.options.every((o, i) => o.label === String(i + 1)))
    return undefined;
  const opp: PlayerId = me === 'p1' ? 'p2' : 'p1';
  const seen = [...s.battlefield, ...s.players[opp].graveyard, ...s.players[opp].exile].filter(
    (id) => s.objects[id]?.owner === opp,
  );
  let best = 0;
  let bestScore = -1;
  for (let n = 1; n <= 10; n++) {
    let score = NUMBER_PRIOR[n]!;
    for (const id of seen) {
      const c = db.get(s.objects[id]!.defId);
      if (!c || c.types.includes('Land')) continue;
      const mv =
        c.manaCost.generic + Object.values(c.manaCost.colored).reduce((a, b) => a + (b ?? 0), 0);
      if (mv === n || c.power === n || c.toughness === n) score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = n - 1;
    }
  }
  return { type: 'chooseOption', player: me, index: best };
}

const COLOR_LABELS: Record<string, string> = {
  White: 'W',
  Blue: 'U',
  Black: 'B',
  Red: 'R',
  Green: 'G',
};

/**
 * "Choose a color" for a land (Edgewall Inn): the color most needed by the cards in hand and on the battlefield (mana symbols in
 * their costs), the first on offer on a tie.
 */
export function chooseLandColor(
  db: CardDb,
  s: GameState,
  me: PlayerId,
  d: Extract<GameState['decision'], { kind: 'chooseOption' }>,
): Action | undefined {
  if (d.options.length === 0 || !d.options.every((o) => o.label in COLOR_LABELS)) return undefined;
  const need: Record<string, number> = {};
  for (const id of [...s.players[me].hand, ...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller !== me) continue;
    const c = db.get(o.defId);
    if (!c || c.types.includes('Land')) continue;
    for (const [k, v] of Object.entries(c.manaCost.colored)) need[k] = (need[k] ?? 0) + (v ?? 0);
  }
  let best = 0;
  d.options.forEach((o, i) => {
    if ((need[COLOR_LABELS[o.label]!] ?? 0) > (need[COLOR_LABELS[d.options[best]!.label]!] ?? 0))
      best = i;
  });
  return { type: 'chooseOption', player: me, index: best };
}
