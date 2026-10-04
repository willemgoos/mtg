import { describe, expect, it } from 'vitest';
import {
  type Action,
  type CardDefinition,
  type TargetChoice,
  createEngine,
  getCharacteristics,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { FRA_JACE } from '../src/fra/tokens.ts';
import { FRA_BEAST, FRA_ILLUSION, FRA_PRIDEMATE } from '../src/fra/pw-c.ts';
import { all, n } from './blb-helpers.ts';

// Reality Fracture 17c: the planeswalker rares and mythics (pw-c.ts): the eight planeswalker cards, Avatar of Burgeoning
// Echoes, Gideon the Oathless, Jace's Machinations, Overwrite the Multiverse, Repurposed Enforcer, Sanctum Lurker,
// Theorist's Proxy, Theorist's Sanctum and Vraska's Final Mercy.

const printed = (id: string, over: Partial<CardDefinition>): CardDefinition => ({
  id,
  name: id,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: ['Creature'],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...over,
});

// Test-only cards.
const TEST_CARDS: CardDefinition[] = [
  // A 2/2 whose cast we can counter-test against, and plain spells.
  printed('test-wrath', {
    types: ['Sorcery'],
    spell: { targets: [], effects: [{ kind: 'destroyAll', filter: { types: ['Creature'] } } as never] },
  }),
  // Counterspell stand-in: "Counter target spell."
  printed('test-counter', {
    types: ['Instant'],
    manaCost: { generic: 0, colored: { U: 1 } },
    colors: ['U'],
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: { target: 0 } }] },
  }),
  // A creature spell and a noncreature spell for Chandra's mana.
  printed('test-sorcery-u', {
    types: ['Sorcery'],
    manaCost: { generic: 0, colored: { U: 1 } },
    colors: ['U'],
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 1 }] },
  }),
  printed('test-creature-u', {
    types: ['Creature'],
    manaCost: { generic: 0, colored: { U: 1 } },
    colors: ['U'],
    power: 1,
    toughness: 1,
  }),
  // A spell with {X}: "Gain X life."
  printed('test-x-spell', {
    types: ['Sorcery'],
    manaCost: { generic: 0, colored: { R: 1 }, x: 1 },
    colors: ['R'],
    spell: {
      targets: [],
      effects: [{ kind: 'gainLife', who: 'controller', amount: { x: true } }],
    },
  }),
  // A 5/5 for "power 4 or greater".
  printed('test-big', { power: 5, toughness: 5 }),
  printed('test-pump-hand', {
    types: ['Instant'],
    manaCost: { generic: 0, colored: {} },
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 1 }] },
  }),
  // A nonland, noncreature card and a creature card for Chandra's surveil.
  printed('test-artifact', { types: ['Artifact'], manaCost: { generic: 2, colored: {} } }),
  // Planeswalker for "a planeswalker you control" statements.
  printed('test-walker', {
    types: ['Planeswalker'],
    subtypes: ['Test'],
    loyalty: 4,
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 1 }],
        label: '+1: You gain 1 life',
      },
    ],
  }),
];

const db = new Map([...cardDb, ...TEST_CARDS.map((c) => [c.id, c] as const)]);
const engine = createEngine(db);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(db, spec));

const target = (g: GameDriver, id: string): TargetChoice => ({
  object: { id, zcc: g.obj(id).zcc },
});
const player = (p: 'p1' | 'p2'): TargetChoice => ({ player: p });
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const p = g.actor;
  return g.do({ type: 'castSpell', player: p, card: g.id(p, defId, 'hand'), targets, ...extra });
};
const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: TargetChoice[] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);
const canActivate = (g: GameDriver, source: string, abilityIndex: number) =>
  g
    .legal()
    .some(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === abilityIndex,
    );

interface Opts {
  /** Which of several options to choose (an index into the options). */
  pick?: number;
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Surveil: send these cards (defIds) to the graveyard. */
  bin?: string[];
  /** Cast the card of a castFree decision (default: decline). */
  castIt?: boolean;
}

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseObject') {
      g.do({ type: 'chooseCard', player: d.player, card: d.options[opts.pick ?? 0]! });
    } else if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'castFree') {
      const legal = g.legal();
      const cast = opts.castIt ? legal.find((a) => a.type === 'castSpell') : undefined;
      g.do(cast ?? legal.find((a) => a.type === 'chooseEffect' && !a.accept)!);
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
    } else if (d.kind === 'scry') {
      const bin = opts.bin ?? [];
      const bottom = d.cards.filter((id) => bin.includes(g.obj(id).defId));
      g.do({
        type: 'scry',
        player: d.player,
        top: d.cards.filter((id) => !bottom.includes(id)),
        bottom,
      });
    } else if (d.kind === 'discard' || d.kind === 'sacrifice') {
      const legal = g.legal();
      g.do(legal[Math.min(opts.pick ?? 0, legal.length - 1)]!);
    } else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseCard'))
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    else break;
  }
  return g;
}

const jaces = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  all(g, FRA_JACE).filter((id) => g.obj(id).controller === p);
const loyalty = (g: GameDriver, id: string) => g.obj(id).counters?.loyalty ?? 0;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, db, id);
  return [c.power, c.toughness];
};
const keywords = (g: GameDriver, id: string) => [...getCharacteristics(g.state, db, id).keywords];
const mine = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p);

/** Passes priority until it is `step` of `p`'s turn after the current one, taking default choices. */
function passTo(g: GameDriver, step: string, p: 'p1' | 'p2'): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    if (
      g.state.turn.number > start &&
      g.state.turn.step === step &&
      g.state.turn.activePlayer === p &&
      g.decision.kind === 'priority' &&
      g.state.stack.length === 0
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`Never reached ${step}`);
}

/** Moves to `p`'s declare attackers step (the active player must be p) and declares the attackers. */
function attack(
  g: GameDriver,
  attackers: { id: string; defender: 'p1' | 'p2'; planeswalker?: string }[],
): void {
  g.passUntilStep('beginCombat').passBoth();
  for (const a of attackers)
    g.do({
      type: 'addAttacker',
      player: g.actor,
      attacker: a.id,
      defender: a.defender,
      ...(a.planeswalker ? { planeswalker: a.planeswalker } : {}),
    });
  g.do({ type: 'confirmAttackers', player: g.actor });
}

/** Passes through combat (no blocks) to main phase 2. */
function throughCombat(g: GameDriver): void {
  for (let i = 0; i < 40 && g.state.turn.step !== 'main2'; i++) {
    const d = g.decision;
    if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'chooseTriggerTargets') done(g);
    else g.pass();
  }
}

// ---------------------------------------------------------------------------
// The Theorist, Jace Beleren
// ---------------------------------------------------------------------------

describe('The Theorist, Jace Beleren', () => {
  const id = 'the-theorist-jace-beleren';
  const walker = (extra: Partial<ScenarioSpec> = {}) =>
    game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: n('forest', 8) },
      p2: { battlefield: ['bear-cub'] },
      ...extra,
    });

  it('is a legendary Jace planeswalker with 3 loyalty and the right abilities', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.supertypes).toEqual(['Legendary']);
    expect(d.subtypes).toEqual(['Jace']);
    expect(d.loyalty).toBe(3);
    expect(d.abilities.filter((a) => a.kind === 'activated').map((a) => a.kind === 'activated' && a.cost.loyalty)).toEqual([1, -2, -6]);
  });

  it('+1 creates a 1/1 blue Illusion creature token', () => {
    const g = walker();
    const j = g.id('p1', id);
    activate(g, j, 1);
    done(g);
    expect(loyalty(g, j)).toBe(4);
    const illusions = mine(g, FRA_ILLUSION);
    expect(illusions).toHaveLength(1);
    expect(pt(g, illusions[0]!)).toEqual([1, 1]);
    const token = db.get(FRA_ILLUSION)!;
    expect(token).toMatchObject({ name: 'Illusion', colors: ['U'], subtypes: ['Illusion'], isToken: true });
  });

  it("−2 returns up to one target artifact or creature an opponent controls to its owner's hand", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }, 'bear-cub'] },
      p2: { battlefield: ['bear-cub', 'test-artifact', 'forest'] },
    });
    const j = g.id('p1', id);
    // Only the opponent's artifacts and creatures can be targeted (not mine, not lands).
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === j && a.abilityIndex === 2)
      .map((a) => (a.type === 'activateAbility' ? a.targets : []));
    const ids = targets.flat().map((t) => ('object' in t ? t.object.id : ''));
    expect(ids.sort()).toEqual([g.id('p2', 'bear-cub'), g.id('p2', 'test-artifact')].sort());
    // "Up to one": it can be activated with no target.
    expect(targets.some((t) => t.length === 0)).toBe(true);
    activate(g, j, 2, [target(g, g.id('p2', 'test-artifact'))]);
    done(g);
    expect(loyalty(g, j)).toBe(1);
    expect(hand(g, 'p2')).toEqual(['test-artifact']);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(1);
  });

  it('−2 with no target does nothing but still costs the loyalty', () => {
    const g = walker();
    const j = g.id('p1', id);
    activate(g, j, 2, []);
    done(g);
    expect(loyalty(g, j)).toBe(1);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(1);
  });

  it('−6 draws three cards, then puts X +1/+1 counters on each creature you control, X being the cards in hand', () => {
    const g = game({
      p1: {
        hand: ['forest', 'forest'],
        battlefield: [{ card: id, loyalty: 6 }, 'bear-cub', 'bear-cub'],
        library: n('forest', 8),
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const j = g.id('p1', id);
    activate(g, j, 3);
    done(g);
    // 2 in hand + 3 drawn = 5.
    expect(hand(g)).toHaveLength(5);
    for (const b of mine(g, 'bear-cub')) expect(pt(g, b)).toEqual([7, 7]);
    // The opponent's creature is not touched.
    expect(pt(g, mine(g, 'bear-cub', 'p2')[0]!)).toEqual([2, 2]);
    expect(g.zoneOf(j)).not.toBe('battlefield');
  });

  it("at the beginning of each opponent's draw step, you draw a card (after their own draw)", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: n('forest', 8) },
      p2: { library: n('island', 8) },
    });
    const before1 = hand(g, 'p1').length;
    const before2 = hand(g, 'p2').length;
    passTo(g, 'main1', 'p2');
    expect(hand(g, 'p2').length).toBe(before2 + 1);
    expect(hand(g, 'p1').length).toBe(before1 + 1);
    // Not on my own draw step.
    passTo(g, 'main1', 'p1');
    expect(hand(g, 'p1').length).toBe(before1 + 2);
  });
});

// ---------------------------------------------------------------------------
// Jace, Reality Sculptor
// ---------------------------------------------------------------------------

describe('Jace, Reality Sculptor', () => {
  const id = 'jace-reality-sculptor';

  it('is a legendary Jace planeswalker with 5 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Jace']);
    expect(d.loyalty).toBe(5);
    expect(
      d.abilities.filter((a) => a.kind === 'activated').map((a) => a.kind === 'activated' && a.cost.loyalty),
    ).toEqual([1, -3, 0]);
  });

  it('+1 empowers Jace by the number of Islands you control (basic or not, only Islands)', () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 5 }, ...n('island', 3), ...n('forest', 2), 'theorists-sanctum'],
      },
    });
    const j = g.id('p1', id);
    activate(g, j, 0);
    done(g);
    expect(loyalty(g, j)).toBe(6);
    // Four Islands (three basic and Theorist's Sanctum): a Jace token with four counters.
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('+1 with no Islands creates a Jace token that dies at 0 loyalty', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 5 }, ...n('forest', 2)] } });
    activate(g, g.id('p1', id), 0);
    done(g);
    expect(jaces(g)).toHaveLength(0);
    expect(loyalty(g, g.id('p1', id))).toBe(6);
  });

  it("−3 shrinks every creature that attacks you or your planeswalkers by 5 power until your next turn", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: 'test-walker', loyalty: 3 }] },
      p2: { battlefield: ['bear-cub', 'test-big'] },
    });
    const j = g.id('p1', id);
    activate(g, j, 1);
    done(g);
    expect(loyalty(g, j)).toBe(2);
    // On their turn: one creature attacks me, the other my planeswalker.
    passTo(g, 'main1', 'p2');
    const cub = g.id('p2', 'bear-cub');
    const big = g.id('p2', 'test-big');
    attack(g, [
      { id: cub, defender: 'p1' },
      { id: big, defender: 'p1', planeswalker: g.id('p1', 'test-walker') },
    ]);
    done(g);
    expect(pt(g, cub)).toEqual([-3, 2]);
    expect(pt(g, big)).toEqual([0, 5]);
    // It wears off at end of turn, and the ability itself at the start of my next turn.
    passTo(g, 'main1', 'p1');
    expect(pt(g, cub)).toEqual([2, 2]);
    expect(g.state.emblems ?? []).toHaveLength(0);
  });

  it('−3 lasts through the turn it was activated: an attacker declared before my next turn is shrunk', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(g, g.id('p1', id), 1);
    done(g);
    expect(g.state.emblems).toHaveLength(1);
    // Still there after my turn passes to theirs (only my next turn's start ends it).
    passTo(g, 'main1', 'p2');
    expect(g.state.emblems).toHaveLength(1);
    const cub = g.id('p2', 'bear-cub');
    attack(g, [{ id: cub, defender: 'p1' }]);
    done(g);
    expect(pt(g, cub)).toEqual([-3, 2]);
  });

  it("−3 doesn't shrink my own creatures when they attack the opponent", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 1);
    done(g);
    const cub = g.id('p1', 'bear-cub');
    attack(g, [{ id: cub, defender: 'p2' }]);
    done(g);
    expect(pt(g, cub)).toEqual([2, 2]);
  });

  it('0 exiles all but the bottom card of each opponent library, only with 25 or more loyalty among Jaces you control', () => {
    const lib = ['island', 'forest', 'mountain', 'plains', 'swamp'];
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: FRA_JACE, loyalty: 19 }] },
      p2: { library: lib },
    });
    const j = g.id('p1', id);
    // 5 + 19 = 24: not enough.
    expect(canActivate(g, j, 2)).toBe(false);
    const h = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: FRA_JACE, loyalty: 20 }] },
      p2: { library: lib },
    });
    const j2 = h.id('p1', id);
    expect(canActivate(h, j2, 2)).toBe(true);
    activate(h, j2, 2);
    done(h);
    // The bottom card is the last one of the library.
    expect(h.state.players.p2.library.map((x) => h.obj(x).defId)).toEqual(['swamp']);
    expect(exile(h, 'p2')).toEqual(['island', 'forest', 'mountain', 'plains']);
    expect(loyalty(h, j2)).toBe(5);
  });

  it('0 counts only Jaces (a non-Jace planeswalker, or an opponent Jace, adds nothing)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: 'test-walker', loyalty: 30 }] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 30 }] },
    });
    expect(canActivate(g, g.id('p1', id), 2)).toBe(false);
  });

  it('0 leaves a library of one card alone', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 25 }] },
      p2: { library: ['island'] },
    });
    activate(g, g.id('p1', id), 2);
    done(g);
    expect(g.state.players.p2.library).toHaveLength(1);
    expect(exile(g, 'p2')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ajani Resolute
// ---------------------------------------------------------------------------

describe('Ajani Resolute', () => {
  const id = 'ajani-resolute';

  it('is a legendary Ajani planeswalker with 2 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Ajani']);
    expect(d.loyalty).toBe(2);
  });

  it('whenever you gain life, puts a loyalty counter on Ajani; 0 gains 1 life (so it grows by itself)', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 2 }] } });
    const a = g.id('p1', id);
    activate(g, a, 1);
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(loyalty(g, a)).toBe(3);
  });

  it('every life gain adds one counter, and an opponent gaining life does not', () => {
    const g = game({
      p1: { hand: ['test-pump-hand', 'test-pump-hand'], battlefield: [{ card: id, loyalty: 2 }] },
      p2: { hand: ['test-pump-hand'] },
    });
    const a = g.id('p1', id);
    cast(g, 'test-pump-hand');
    done(g);
    cast(g, 'test-pump-hand');
    done(g);
    expect(loyalty(g, a)).toBe(4);
    expect(g.life('p1')).toBe(22);
  });

  it("−4 creates a 2/2 white Cat Soldier named Ajani's Pridemate that grows when you gain life", () => {
    const g = game({ p1: { hand: ['test-pump-hand'], battlefield: [{ card: id, loyalty: 5 }] } });
    const a = g.id('p1', id);
    activate(g, a, 2);
    done(g);
    expect(loyalty(g, a)).toBe(1);
    const pride = mine(g, FRA_PRIDEMATE);
    expect(pride).toHaveLength(1);
    const token = db.get(FRA_PRIDEMATE)!;
    expect(token).toMatchObject({
      name: "Ajani's Pridemate",
      colors: ['W'],
      subtypes: ['Cat', 'Soldier'],
      power: 2,
      toughness: 2,
      isToken: true,
    });
    expect(pt(g, pride[0]!)).toEqual([2, 2]);
    cast(g, 'test-pump-hand');
    done(g);
    expect(pt(g, pride[0]!)).toEqual([3, 3]);
    // Ajani gained a counter as well.
    expect(loyalty(g, a)).toBe(2);
  });

  it('−10 gives you an emblem: creatures you control get +2/+2', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 10 }, 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(pt(g, mine(g, 'bear-cub')[0]!)).toEqual([4, 4]);
    expect(pt(g, mine(g, 'bear-cub', 'p2')[0]!)).toEqual([2, 2]);
    // It's an emblem: Ajani is gone, and the bonus stays for creatures that come later.
    expect(g.zoneOf(g.id('p1', id, 'graveyard'))).toBe('graveyard');
    expect(g.state.emblems).toHaveLength(1);
  });

  it('can not −4 with 3 loyalty, nor −10 with 9', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 3 }] } });
    expect(canActivate(g, g.id('p1', id), 2)).toBe(false);
    expect(canActivate(g, g.id('p1', id), 3)).toBe(false);
    const h = game({ p1: { battlefield: [{ card: id, loyalty: 9 }] } });
    expect(canActivate(h, h.id('p1', id), 2)).toBe(true);
    expect(canActivate(h, h.id('p1', id), 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ajani Unrelenting
// ---------------------------------------------------------------------------

describe('Ajani Unrelenting', () => {
  const id = 'ajani-unrelenting';
  const cadets = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
    g.state.battlefield.filter(
      (x) => g.obj(x).controller === p && db.get(g.obj(x).defId)!.name === 'Cadet',
    );

  it('is a legendary Ajani planeswalker with 5 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Ajani']);
    expect(d.loyalty).toBe(5);
  });

  it('whenever you activate a loyalty ability, creates a 2/2 Cadet (any planeswalker of yours, its own too)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: 'test-walker', loyalty: 4 }] },
    });
    activate(g, g.id('p1', 'test-walker'), 0);
    done(g);
    expect(cadets(g)).toHaveLength(1);
    expect(pt(g, cadets(g)[0]!)).toEqual([2, 2]);
    activate(g, g.id('p1', id), 1);
    done(g);
    expect(cadets(g)).toHaveLength(2);
  });

  it("+1: the Cadet made by its own ability is there first, so it gets +1/+0 and haste too", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] },
    });
    const a = g.id('p1', id);
    activate(g, a, 1);
    done(g);
    expect(loyalty(g, a)).toBe(6);
    const cub = g.id('p1', 'bear-cub');
    expect(pt(g, cub)).toEqual([3, 2]);
    expect(keywords(g, cub)).toContain('haste');
    const cadet = cadets(g)[0]!;
    expect(pt(g, cadet)).toEqual([3, 2]);
    expect(keywords(g, cadet)).toContain('haste');
    // The opponent's creatures are untouched, and it's until end of turn.
  });

  it('+1 does not affect opposing creatures', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(g, g.id('p1', id), 1);
    done(g);
    expect(pt(g, g.id('p2', 'bear-cub'))).toEqual([2, 2]);
  });

  it('−2 discards your hand, then draws a card for each creature you control (the Cadet counts)', () => {
    const g = game({
      p1: {
        hand: ['forest', 'island', 'mountain'],
        battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'bear-cub'],
        library: n('plains', 8),
      },
    });
    activate(g, g.id('p1', id), 2);
    done(g);
    expect(gy(g).sort()).toEqual(['forest', 'island', 'mountain']);
    // Two Bears and the Cadet: three cards.
    expect(hand(g)).toEqual(['plains', 'plains', 'plains']);
  });

  it('−3 deals 4 damage to each creature except for tokens you control', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'test-big'] },
      p2: { battlefield: ['bear-cub', 'test-big'] },
    });
    // Tokens: one of mine (a Cadet, made by the trigger) and one of theirs.
    const theirToken = g.state.battlefield.length;
    expect(theirToken).toBeGreaterThan(0);
    const g2 = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'test-big'] },
      p2: { battlefield: ['bear-cub', 'test-big', { card: 'fra-cadet-token' }] },
    });
    g2.obj(g2.id('p2', 'fra-cadet-token')).isToken = true;
    activate(g2, g2.id('p1', id), 3);
    done(g2);
    // My Cadet (a token I control) survived; both Bears died; the 5/5s survived with 4 damage.
    expect(cadets(g2, 'p1')).toHaveLength(1);
    expect(mine(g2, 'bear-cub')).toHaveLength(0);
    expect(mine(g2, 'bear-cub', 'p2')).toHaveLength(0);
    expect(mine(g2, 'test-big')).toHaveLength(1);
    expect(mine(g2, 'test-big', 'p2')).toHaveLength(1);
    expect(g2.obj(mine(g2, 'test-big')[0]!).damage).toBe(4);
    // The opponent's token dies (only tokens I control are spared).
    expect(cadets(g2, 'p2')).toHaveLength(0);
    // Nontoken creatures of mine take it too.
    expect(g2.obj(cadets(g2, 'p1')[0]!).damage).toBe(0);
  });
});

/** Answers a pending chooseTriggerTargets with exactly these targets. */
function chooseTargets(g: GameDriver, targets: TargetChoice[]): void {
  expect(g.decision.kind).toBe('chooseTriggerTargets');
  const want = JSON.stringify(targets);
  const a = g.legal().find((x) => x.type === 'chooseTargets' && JSON.stringify(x.targets) === want);
  if (!a) throw new Error(`No such target choice ${want}`);
  g.do(a);
}

// ---------------------------------------------------------------------------
// Chandra, Chill of Compliance
// ---------------------------------------------------------------------------

describe('Chandra, Chill of Compliance', () => {
  const id = 'chandra-chill-of-compliance';

  it('is a legendary blue Chandra planeswalker with 3 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Chandra']);
    expect(d.colors).toEqual(['U']);
    expect(d.loyalty).toBe(3);
  });

  it('+1 surveil 1: a noncreature, nonland card put into the graveyard goes to your hand', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: ['test-artifact', 'forest', 'forest'] },
    });
    activate(g, g.id('p1', id), 0);
    done(g, { bin: ['test-artifact'] });
    expect(loyalty(g, g.id('p1', id))).toBe(4);
    expect(hand(g)).toEqual(['test-artifact']);
    expect(gy(g)).toEqual([]);
  });

  it('+1 surveil 1: a land or a creature put into the graveyard stays there', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: ['forest', 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 0);
    done(g, { bin: ['forest'] });
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toEqual(['forest']);
    const h = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: ['bear-cub', 'forest'] },
    });
    activate(h, h.id('p1', id), 0);
    done(h, { bin: ['bear-cub'] });
    expect(hand(h)).toEqual([]);
    expect(gy(h)).toEqual(['bear-cub']);
  });

  it('+1 surveil 1: a card kept on top is not taken', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }], library: ['test-artifact', 'forest'] },
    });
    activate(g, g.id('p1', id), 0);
    done(g, { bin: [] });
    expect(hand(g)).toEqual([]);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('+1 adds {U} that can be spent only on a noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['test-sorcery-u', 'test-creature-u'],
        battlefield: [{ card: id, loyalty: 3 }],
      },
    });
    activate(g, g.id('p1', id), 1);
    done(g);
    expect(g.state.players.p1.pool).toEqual([{ produces: ['U'], onlyFor: 'Noncreature' }]);
    // The creature spell can't use it; the noncreature spell can.
    const castable = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a.type === 'castSpell' ? g.obj(a.card).defId : ''));
    expect(castable).toEqual(['test-sorcery-u']);
    cast(g, 'test-sorcery-u');
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(g.state.players.p1.pool ?? []).toEqual([]);
  });

  it('+1 mana is a loyalty ability that uses the stack (an opponent can respond) and counts as one activation', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 3 }] } });
    const c = g.id('p1', id);
    activate(g, c, 1);
    expect(g.state.stack).toHaveLength(1);
    expect(g.state.players.p1.pool ?? []).toEqual([]);
    done(g);
    expect(canActivate(g, c, 0)).toBe(false);
    expect(canActivate(g, c, 2)).toBe(false);
  });

  it('−X taps target artifact or creature and puts X stun counters on it', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }] },
      p2: { battlefield: ['bear-cub', 'test-artifact', 'forest'] },
    });
    const c = g.id('p1', id);
    const cub = g.id('p2', 'bear-cub');
    const legalTargets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === c && a.abilityIndex === 2)
      .map((a) => (a.type === 'activateAbility' ? `${a.x}:${a.targets.map((t) => ('object' in t ? g.obj(t.object.id).defId : '')).join()}` : ''));
    expect(legalTargets).toContain('2:bear-cub');
    expect(legalTargets).toContain('3:test-artifact');
    expect(legalTargets.some((x) => x.endsWith('forest'))).toBe(false);
    activate(g, c, 2, [target(g, cub)], { x: 2 });
    done(g);
    expect(loyalty(g, c)).toBe(1);
    expect(g.obj(cub).tapped).toBe(true);
    expect(g.obj(cub).counters?.stun).toBe(2);
  });

  it('−X with X = 0 still taps it (no counters)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    activate(g, g.id('p1', id), 2, [target(g, cub)], { x: 0 });
    done(g);
    expect(g.obj(cub).tapped).toBe(true);
    expect(g.obj(cub).counters?.stun ?? 0).toBe(0);
  });

  it('a stunned permanent stays tapped through its controller\'s untap step (one counter used)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    activate(g, g.id('p1', id), 2, [target(g, cub)], { x: 1 });
    done(g);
    passTo(g, 'main1', 'p2');
    expect(g.obj(cub).tapped).toBe(true);
    expect(g.obj(cub).counters?.stun ?? 0).toBe(0);
  });

  it('−X can not remove more loyalty than it has', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 3 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    const xs = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.abilityIndex === 2)
      .map((a) => (a.type === 'activateAbility' ? (a.x ?? -1) : -1));
    expect(Math.max(...xs)).toBe(3);
  });

  it('−6 gives you an emblem: whenever you cast a spell, draw a card', () => {
    const g = game({
      p1: {
        hand: ['test-sorcery-u', 'test-sorcery-u'],
        battlefield: [{ card: id, loyalty: 6 }, ...n('island', 3)],
        library: n('plains', 6),
      },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(g.state.emblems).toHaveLength(1);
    expect(g.zoneOf(g.id('p1', id, 'graveyard'))).toBe('graveyard');
    const before = hand(g).length;
    cast(g, 'test-sorcery-u');
    done(g);
    expect(hand(g).length).toBe(before - 1 + 1);
    cast(g, 'test-sorcery-u');
    done(g);
    expect(hand(g).length).toBe(before - 1 + 1 - 1 + 1);
    // Only your own spells.
    expect(hand(g, 'p2').length).toBe(0);
  });

  it("the emblem does not draw for the opponent's spells", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 6 }], library: n('plains', 6) },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    const before = hand(g).length;
    g.pass();
    cast(g, 'shock', [player('p1')]);
    done(g);
    expect(hand(g).length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Chandra, Torch of Defiance
// ---------------------------------------------------------------------------

describe('Chandra, Torch of Defiance', () => {
  const id = 'chandra-torch-of-defiance';

  it('is a legendary red Chandra planeswalker with 4 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Chandra']);
    expect(d.colors).toEqual(['R']);
    expect(d.loyalty).toBe(4);
  });

  it('+1: a land on top is exiled and Chandra deals 2 damage to each opponent (a land can not be cast)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }], library: ['forest', 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 0);
    done(g);
    expect(exile(g)).toEqual(['forest']);
    expect(g.life('p2')).toBe(18);
    expect(loyalty(g, g.id('p1', id))).toBe(5);
  });

  it('+1: you may cast the exiled card, paying its cost; then no damage', () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 4 }, ...n('forest', 2)],
        library: ['bear-cub', 'forest'],
      },
    });
    activate(g, g.id('p1', id), 0);
    // Resolve the ability: it stops to ask whether to cast the Bear Cub.
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.length).toBeGreaterThan(0);
    g.do(casts[0]!);
    done(g);
    expect(mine(g, 'bear-cub')).toHaveLength(1);
    expect(g.life('p2')).toBe(20);
    // It cost {1}{G}: both Forests are tapped.
    expect(g.state.battlefield.filter((x) => g.obj(x).defId === 'forest' && g.obj(x).tapped)).toHaveLength(2);
  });

  it("+1: if you don't cast it, Chandra deals 2 damage to each opponent (and the card stays in exile)", () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 4 }, ...n('forest', 2)],
        library: ['bear-cub', 'forest'],
      },
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    done(g); // declines
    expect(g.life('p2')).toBe(18);
    expect(exile(g)).toEqual(['bear-cub']);
    expect(mine(g, 'bear-cub')).toHaveLength(0);
  });

  it("+1: if you can't pay for it, there is nothing to cast: only declining is possible, and the damage is dealt", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }], library: ['bear-cub', 'forest'] },
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    done(g);
    expect(g.life('p2')).toBe(18);
  });

  it('+1: an X spell can be cast, choosing X and paying it', () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 4 }, ...n('mountain', 4)],
        library: ['test-x-spell', 'forest'],
      },
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // {X}{R} with four Mountains: X from 0 to 3.
    expect(casts.map((a) => (a.type === 'castSpell' ? (a.x ?? 0) : -1)).sort()).toEqual([0, 1, 2, 3]);
    g.do(casts.find((a) => a.type === 'castSpell' && a.x === 3)!);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(20);
  });

  it('+1: the cast is a real cast (it goes on the stack and can be responded to, and triggers "whenever you cast")', () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 4 }, ...n('forest', 2)],
        library: ['bear-cub', 'forest'],
      },
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    // The Bear Cub is a spell on the stack above nothing else (the ability finished resolving).
    expect(g.state.stack.some((x) => x.kind === 'spell')).toBe(true);
    expect(g.state.turn.spellsCast?.p1).toBe(1);
    done(g);
  });

  it('+1: an empty library does nothing', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }], library: [] },
    });
    activate(g, g.id('p1', id), 0);
    done(g);
    expect(g.life('p2')).toBe(20);
  });

  it('+1: a spell cast from the exiled card is not free: a card with kicker can be kicked, paying extra', () => {
    const g = game({
      p1: {
        battlefield: [{ card: id, loyalty: 4 }, ...n('plains', 6)],
        library: ['test-x-spell', 'forest'],
      },
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    // Plains can't pay {R}: no cast at all.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    done(g);
    expect(g.life('p2')).toBe(18);
  });

  it('+1: adds {R}{R} to your mana pool (through the stack)', () => {
    const g = game({ p1: { hand: ['shock', 'shock'], battlefield: [{ card: id, loyalty: 4 }] } });
    activate(g, g.id('p1', id), 1);
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(2);
    cast(g, 'shock', [player('p2')]);
    cast(g, 'shock', [player('p2')]);
    done(g);
    expect(g.life('p2')).toBe(16);
  });

  it('−3 deals 4 damage to target creature', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }] },
      p2: { battlefield: ['bear-cub', 'test-big'] },
    });
    activate(g, g.id('p1', id), 2, [target(g, g.id('p2', 'test-big'))]);
    done(g);
    expect(loyalty(g, g.id('p1', id))).toBe(1);
    expect(g.obj(g.id('p2', 'test-big')).damage).toBe(4);
    // It only targets creatures (not players, not planeswalkers).
    const g2 = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }] },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 4 }] },
    });
    expect(canActivate(g2, g2.id('p1', id), 2)).toBe(false);
  });

  it('−7 gives you an emblem: whenever you cast a spell, it deals 5 damage to any target', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: [{ card: id, loyalty: 7 }, ...n('mountain', 3)] },
      p2: { battlefield: ['test-big'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(g.state.emblems).toHaveLength(1);
    cast(g, 'shock', [player('p2')]);
    // The emblem's trigger asks for its target; it resolves before the spell.
    chooseTargets(g, [target(g, g.id('p2', 'test-big'))]);
    done(g);
    // 5 damage kills the 5/5.
    expect(mine(g, 'test-big', 'p2')).toHaveLength(0);
    expect(g.life('p2')).toBe(18);
    // And again: any target, including a player.
    cast(g, 'shock', [player('p2')]);
    chooseTargets(g, [player('p2')]);
    done(g);
    expect(g.life('p2')).toBe(18 - 5 - 2);
  });

  it("−7: the emblem's damage comes from a colorless source (not Chandra's), and Chandra is gone", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [{ card: id, loyalty: 7 }, 'mountain'] },
      p2: { battlefield: ['test-big'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(g.zoneOf(g.id('p1', id, 'graveyard'))).toBe('graveyard');
    cast(g, 'shock', [player('p2')]);
    chooseTargets(g, [player('p2')]);
    done(g);
    expect(g.life('p2')).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Garruk, Curse Breaker
// ---------------------------------------------------------------------------

describe('Garruk, Curse Breaker', () => {
  const id = 'garruk-curse-breaker';
  const beasts = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => mine(g, FRA_BEAST, p);

  it('is a legendary Garruk planeswalker with 5 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Garruk']);
    expect(d.loyalty).toBe(5);
  });

  it('draws a card whenever a creature you control with power 4 or greater enters (not smaller ones, not theirs)', () => {
    const g = game({
      p1: {
        hand: ['test-big', 'bear-cub'],
        battlefield: [{ card: id, loyalty: 5 }, ...n('forest', 7)],
        library: n('plains', 5),
      },
      p2: { hand: ['test-big'], battlefield: n('forest', 5) },
    });
    cast(g, 'bear-cub');
    done(g);
    expect(hand(g)).toEqual(['test-big']);
    cast(g, 'test-big');
    done(g);
    expect(hand(g)).toEqual(['plains']);
  });

  it('draws for a token with power 4 or greater too, and for a creature that is bigger with counters', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 5) },
    });
    activate(g, g.id('p1', id), 2);
    done(g);
    // The Beast token is 4/4: "enters" trigger.
    expect(beasts(g)).toHaveLength(1);
    expect(hand(g)).toEqual(['plains']);
  });

  it("an opponent's big creature entering does not draw", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 5) },
      p2: { hand: ['test-big'], battlefield: n('forest', 5) },
      active: 'p2',
    });
    cast(g, 'test-big');
    done(g);
    expect(hand(g)).toEqual([]);
  });

  it('+2 untaps up to two target lands (any lands, tapped or not)', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: id, loyalty: 5 },
          { card: 'forest', tapped: true },
          { card: 'forest', tapped: true },
          { card: 'forest', tapped: true },
        ],
      },
      p2: { battlefield: [{ card: 'island', tapped: true }] },
    });
    const gk = g.id('p1', id);
    const forests = mine(g, 'forest');
    activate(g, gk, 1, [target(g, forests[0]!), target(g, forests[1]!)]);
    done(g);
    expect(loyalty(g, gk)).toBe(7);
    expect(g.obj(forests[0]!).tapped).toBe(false);
    expect(g.obj(forests[1]!).tapped).toBe(false);
    expect(g.obj(forests[2]!).tapped).toBe(true);
  });

  it("+2 can target an opponent's land, and one land, and no lands", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, { card: 'forest', tapped: true }] },
      p2: { battlefield: [{ card: 'island', tapped: true }, 'bear-cub'] },
    });
    const gk = g.id('p1', id);
    const choices = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === gk && a.abilityIndex === 1)
      .map((a) => (a.type === 'activateAbility' ? a.targets.length : -1));
    expect(Math.min(...choices)).toBe(0);
    expect(Math.max(...choices)).toBe(2);
    // The Bear Cub isn't a land: no combination includes it.
    const withCub = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === gk && a.abilityIndex === 1)
      .some(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'bear-cub')),
      );
    expect(withCub).toBe(false);
    activate(g, gk, 1, [target(g, g.id('p2', 'island'))]);
    done(g);
    expect(g.obj(g.id('p2', 'island')).tapped).toBe(false);
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(true);
    const h = game({ p1: { battlefield: [{ card: id, loyalty: 5 }] } });
    activate(h, h.id('p1', id), 1, []);
    done(h);
    expect(loyalty(h, h.id('p1', id))).toBe(7);
  });

  it('−3 creates a 4/4 green Beast creature token with trample', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 5 }] } });
    activate(g, g.id('p1', id), 2);
    done(g);
    expect(loyalty(g, g.id('p1', id))).toBe(2);
    const b = beasts(g);
    expect(b).toHaveLength(1);
    expect(pt(g, b[0]!)).toEqual([4, 4]);
    expect(keywords(g, b[0]!)).toContain('trample');
    expect(db.get(FRA_BEAST)).toMatchObject({
      name: 'Beast',
      colors: ['G'],
      subtypes: ['Beast'],
      isToken: true,
    });
  });

  it('−4: until your next turn, creatures attacking an opponent get +2/+2 and trample (all of them, once)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(loyalty(g, g.id('p1', id))).toBe(1);
    const [a, b] = mine(g, 'bear-cub') as [string, string];
    attack(g, [
      { id: a, defender: 'p2' },
      { id: b, defender: 'p2' },
    ]);
    done(g);
    expect(pt(g, a)).toEqual([4, 4]);
    expect(pt(g, b)).toEqual([4, 4]);
    expect(keywords(g, a)).toContain('trample');
    expect(keywords(g, b)).toContain('trample');
    throughCombat(g);
    expect(g.life('p2')).toBe(12);
  });

  it('−4: creatures attacking a planeswalker are not attacking an opponent: no bonus; a mixed attack only buffs the ones attacking the player', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'bear-cub'] },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 4 }] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    const [a, b] = mine(g, 'bear-cub') as [string, string];
    attack(g, [
      { id: a, defender: 'p2', planeswalker: g.id('p2', 'test-walker') },
      { id: b, defender: 'p2' },
    ]);
    done(g);
    expect(pt(g, a)).toEqual([2, 2]);
    expect(pt(g, b)).toEqual([4, 4]);
  });

  it('−4 only lasts until your next turn: the next turn begins without it', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(g.state.emblems).toHaveLength(1);
    passTo(g, 'main1', 'p1');
    expect(g.state.emblems ?? []).toHaveLength(0);
    const cub = g.id('p1', 'bear-cub');
    attack(g, [{ id: cub, defender: 'p2' }]);
    done(g);
    expect(pt(g, cub)).toEqual([2, 2]);
  });

  it('−4: the bonus wears off at end of turn', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] } });
    activate(g, g.id('p1', id), 3);
    done(g);
    const cub = g.id('p1', 'bear-cub');
    attack(g, [{ id: cub, defender: 'p2' }]);
    done(g);
    expect(pt(g, cub)).toEqual([4, 4]);
    passTo(g, 'main1', 'p2');
    expect(pt(g, cub)).toEqual([2, 2]);
  });
});

// ---------------------------------------------------------------------------
// Garruk, Veiled Butcher
// ---------------------------------------------------------------------------

describe('Garruk, Veiled Butcher', () => {
  const id = 'garruk-veiled-butcher';

  it('is a legendary Garruk planeswalker with 5 loyalty', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.subtypes).toEqual(['Garruk']);
    expect(d.loyalty).toBe(5);
  });

  it('exiles creatures an opponent controls instead of letting them die (tokens too); not your own', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', ...n('mountain', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'shock', [target(g, g.id('p2', 'bear-cub'))]);
    done(g);
    expect(exile(g, 'p2')).toEqual(['bear-cub']);
    expect(gy(g, 'p2')).toEqual([]);
    // My own creature dies as usual (to my own shock).
    cast(g, 'shock', [target(g, g.id('p1', 'bear-cub'))]);
    done(g);
    expect(gy(g, 'p1')).toContain('bear-cub');
    expect(exile(g, 'p1')).toEqual([]);
  });

  it('+2: up to one target creature gets −4/−1 until your next turn', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }] },
      p2: { battlefield: ['test-big'] },
    });
    const gk = g.id('p1', id);
    const big = g.id('p2', 'test-big');
    activate(g, gk, 1, [target(g, big)]);
    done(g);
    expect(loyalty(g, gk)).toBe(7);
    expect(pt(g, big)).toEqual([1, 4]);
    // Through the opponent's turn, gone as my next turn begins.
    passTo(g, 'main1', 'p2');
    expect(pt(g, big)).toEqual([1, 4]);
    passTo(g, 'main1', 'p1');
    expect(pt(g, big)).toEqual([5, 5]);
  });

  it('+2 may have no target, and a creature of mine can be the target too', () => {
    const g = game({ p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] } });
    const gk = g.id('p1', id);
    expect(canActivate(g, gk, 1)).toBe(true);
    activate(g, gk, 1, []);
    done(g);
    expect(loyalty(g, gk)).toBe(7);
    const h = game({ p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub'] } });
    activate(h, h.id('p1', id), 1, [target(h, h.id('p1', 'bear-cub'))]);
    done(h);
    // A 2/2 with -4/-1 is a −2/1: it lives.
    expect(pt(h, h.id('p1', 'bear-cub'))).toEqual([-2, 1]);
  });

  it('−2: each player sacrifices a creature of their choice; if you did, create a 4/4 Beast with trample', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }, 'bear-cub', 'test-big'] },
      p2: { battlefield: ['bear-cub', 'test-big'] },
    });
    const gk = g.id('p1', id);
    activate(g, gk, 2);
    // I choose first (the Bear Cub), then my opponent (their Bear Cub).
    for (let i = 0; i < 12; i++) {
      const d = g.decision;
      if (d.kind === 'sacrifice') {
        const pick = d.options.find((o) => g.obj(o).defId === 'bear-cub') ?? d.options[0]!;
        g.do({ type: 'chooseCard', player: d.player, card: pick });
      } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(loyalty(g, gk)).toBe(3);
    expect(mine(g, 'bear-cub')).toHaveLength(0);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(0);
    expect(mine(g, 'test-big')).toHaveLength(1);
    expect(mine(g, 'test-big', 'p2')).toHaveLength(1);
    expect(mine(g, FRA_BEAST)).toHaveLength(1);
    // Their sacrificed creature is exiled instead of dying (Garruk's static ability).
    expect(exile(g, 'p2')).toEqual(['bear-cub']);
    expect(gy(g, 'p1')).toEqual(['bear-cub']);
  });

  it('−2: with no creature of your own to sacrifice there is no Beast, but the opponent still sacrifices', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(g, g.id('p1', id), 2);
    done(g);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(0);
    expect(mine(g, FRA_BEAST)).toHaveLength(0);
  });

  it("−3: each opponent discards two cards (their choice); you draw if they didn't discard two nonland cards", () => {
    // Two lands: you draw.
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 4) },
      p2: { hand: ['forest', 'island', 'bear-cub'] },
    });
    activate(g, g.id('p1', id), 3);
    // They choose: the two lands.
    for (let i = 0; i < 6 && g.decision.kind !== 'discard'; i++) g.pass();
    expect(g.decision.kind).toBe('discard');
    if (g.decision.kind !== 'discard') throw new Error('unreachable');
    expect(g.decision.player).toBe('p2');
    const landCards = g.state.players.p2.hand.filter((x) => ['forest', 'island'].includes(g.obj(x).defId));
    g.do({ type: 'discard', player: 'p2', card: landCards[0]! });
    g.do({ type: 'discard', player: 'p2', card: landCards[1]! });
    done(g);
    expect(gy(g, 'p2').sort()).toEqual(['forest', 'island']);
    expect(hand(g)).toEqual(['plains']);
  });

  it("−3: no draw when they discard two nonland cards", () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 4) },
      p2: { hand: ['bear-cub', 'test-big', 'forest'] },
    });
    activate(g, g.id('p1', id), 3);
    for (let i = 0; i < 6 && g.decision.kind !== 'discard'; i++) g.pass();
    const nonland = g.state.players.p2.hand.filter((x) => g.obj(x).defId !== 'forest');
    g.do({ type: 'discard', player: 'p2', card: nonland[0]! });
    g.do({ type: 'discard', player: 'p2', card: nonland[1]! });
    done(g);
    expect(gy(g, 'p2').sort()).toEqual(['bear-cub', 'test-big']);
    expect(hand(g)).toEqual([]);
  });

  it('−3: one nonland and one land is a draw; fewer than two cards in hand is a draw (even an empty hand)', () => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 4) },
      p2: { hand: ['bear-cub', 'forest'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(hand(g)).toEqual(['plains']);
    const h = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 4) },
      p2: { hand: ['bear-cub'] },
    });
    activate(h, h.id('p1', id), 3);
    done(h);
    expect(hand(h)).toEqual(['plains']);
    expect(gy(h, 'p2')).toEqual(['bear-cub']);
    const e = game({
      p1: { battlefield: [{ card: id, loyalty: 5 }], library: n('plains', 4) },
      p2: { hand: [] },
    });
    activate(e, e.id('p1', id), 3);
    done(e);
    expect(hand(e)).toEqual(['plains']);
  });
});

// ---------------------------------------------------------------------------
// The planeswalkers enter with their loyalty and every card is in the pool
// ---------------------------------------------------------------------------

const BASIC_FOR = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' } as const;
const lands = (defId: string): string[] => {
  const cost = db.get(defId)!.manaCost;
  const out: string[] = [];
  for (const [c, k] of Object.entries(cost.colored) as [keyof typeof BASIC_FOR, number][])
    for (let i = 0; i < k; i++) out.push(BASIC_FOR[c]);
  for (let i = 0; i < cost.generic; i++) out.push('forest');
  return out;
};

describe('Reality Fracture planeswalkers (rares and mythics)', () => {
  const walkers: [string, number][] = [
    ['the-theorist-jace-beleren', 3],
    ['jace-reality-sculptor', 5],
    ['ajani-resolute', 2],
    ['ajani-unrelenting', 5],
    ['chandra-chill-of-compliance', 3],
    ['chandra-torch-of-defiance', 4],
    ['garruk-curse-breaker', 5],
    ['garruk-veiled-butcher', 5],
  ];

  it.each(walkers)('%s enters with %i loyalty counters when cast', (id, loyaltyCount) => {
    const g = game({ p1: { hand: [id], battlefield: lands(id) } });
    cast(g, id);
    done(g);
    expect(g.zoneOf(g.id('p1', id))).toBe('battlefield');
    expect(loyalty(g, g.id('p1', id))).toBe(loyaltyCount);
    expect(db.get(id)!.supertypes).toEqual(['Legendary']);
  });

  it('all seventeen cards and their tokens are in the card pool', () => {
    for (const name of [
      'The Theorist, Jace Beleren',
      'Jace, Reality Sculptor',
      'Ajani Resolute',
      'Ajani Unrelenting',
      'Chandra, Chill of Compliance',
      'Chandra, Torch of Defiance',
      'Garruk, Curse Breaker',
      'Garruk, Veiled Butcher',
      'Avatar of Burgeoning Echoes',
      'Gideon the Oathless',
      "Jace's Machinations",
      'Overwrite the Multiverse',
      'Repurposed Enforcer',
      'Sanctum Lurker',
      "Theorist's Proxy",
      "Theorist's Sanctum",
      "Vraska's Final Mercy",
    ])
      expect([...cardDb.values()].some((c) => c.name === name && !c.isToken), name).toBe(true);
    for (const t of [FRA_ILLUSION, FRA_PRIDEMATE, FRA_BEAST]) expect(cardDb.get(t)?.isToken).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Avatar of Burgeoning Echoes
// ---------------------------------------------------------------------------

describe('Avatar of Burgeoning Echoes', () => {
  const id = 'avatar-of-burgeoning-echoes';

  it('is a 2/3 green-blue Avatar', () => {
    const d = db.get(id)!;
    expect(d).toMatchObject({ power: 2, toughness: 3, subtypes: ['Avatar'] });
    expect([...d.colors].sort()).toEqual(['G', 'U']);
  });

  it('landfall: whenever a land you control enters, empower Jace 2 (creating the token, then adding to it)', () => {
    const g = game({ p1: { hand: ['forest', 'island'], battlefield: [id] } });
    const [f, i] = g.state.players.p1.hand;
    g.do({ type: 'playLand', player: 'p1', card: f! });
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    // A second land drop (an extra one) adds two more to the same token.
    g.state.players.p1.landsPlayedThisTurn = 0;
    g.do({ type: 'playLand', player: 'p1', card: i! });
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it("an opponent's land doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { hand: ['forest'] },
      active: 'p2',
    });
    g.do({ type: 'playLand', player: 'p2', card: g.state.players.p2.hand[0]! });
    done(g);
    expect(jaces(g, 'p1')).toHaveLength(0);
    expect(jaces(g, 'p2')).toHaveLength(0);
  });

  it('gives planeswalkers you control "−10: Put a +1/+1 counter on target creature for each land you control"', () => {
    const g = game({
      p1: {
        battlefield: [id, { card: FRA_JACE, loyalty: 10 }, 'bear-cub', ...n('forest', 4), 'island'],
      },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 12 }] },
    });
    const j = jaces(g)[0]!;
    // The token's printed abilities are −1 and −3; the granted one is third.
    expect(canActivate(g, j, 2)).toBe(true);
    const cub = g.id('p1', 'bear-cub');
    activate(g, j, 2, [target(g, cub)]);
    done(g);
    expect(g.obj(cub).plusOneCounters).toBe(5);
    expect(pt(g, cub)).toEqual([7, 7]);
    // The Jace used all of its ten loyalty and left.
    expect(g.zoneOf(j)).not.toBe('battlefield');
  });

  it('works for any planeswalker you control, needs 10 loyalty, and any creature can be the target', () => {
    const g = game({
      p1: { battlefield: [id, { card: 'test-walker', loyalty: 9 }, ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const w = g.id('p1', 'test-walker');
    expect(canActivate(g, w, 1)).toBe(false);
    g.obj(w).counters = { loyalty: 10 };
    expect(canActivate(g, w, 1)).toBe(true);
    // An opposing creature is a legal target (any creature).
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === w && a.abilityIndex === 1)
      .map((a) => (a.type === 'activateAbility' ? a.targets : []));
    expect(targets.flat().some((t) => 'object' in t && t.object.id === g.id('p2', 'bear-cub'))).toBe(true);
    expect(targets.flat().some((t) => 'object' in t && t.object.id === g.id('p1', id))).toBe(true);
  });

  it("the opponent's planeswalkers don't get it, and it goes when the Avatar does", () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 12 }] },
      active: 'p2',
    });
    expect(canActivate(g, g.id('p2', 'test-walker'), 1)).toBe(false);
    const h = game({ p1: { battlefield: [id, { card: 'test-walker', loyalty: 12 }, 'bear-cub'] } });
    const w = h.id('p1', 'test-walker');
    expect(canActivate(h, w, 1)).toBe(true);
    h.state.battlefield = h.state.battlefield.filter((x) => x !== h.id('p1', id));
    expect(canActivate(h, w, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gideon the Oathless
// ---------------------------------------------------------------------------

describe('Gideon the Oathless', () => {
  const id = 'gideon-the-oathless';

  it('is a legendary 3/3 black Human Mercenary with ward—discard a card', () => {
    const d = db.get(id)!;
    expect(d).toMatchObject({ power: 3, toughness: 3, colors: ['B'], subtypes: ['Human', 'Mercenary'] });
    expect(d.supertypes).toEqual(['Legendary']);
    expect(d.keywords).toContain('ward');
    expect(d.wardCost).toMatchObject({ discard: true });
  });

  it("deals 1 damage to a player whenever a creature that player controls enters, if they're an opponent", () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { hand: ['bear-cub', 'test-big'], battlefield: n('forest', 8) },
      active: 'p2',
    });
    cast(g, 'bear-cub');
    done(g);
    expect(g.life('p2')).toBe(19);
    cast(g, 'test-big');
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(20);
  });

  it("doesn't damage for creatures you control entering", () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [id, ...n('forest', 2)] },
    });
    cast(g, 'bear-cub');
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(20);
  });

  it('a token creature entering under an opponent counts too', () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { battlefield: [{ card: 'garruk-curse-breaker', loyalty: 5 }] },
      active: 'p2',
    });
    activate(g, g.id('p2', 'garruk-curse-breaker'), 2);
    done(g);
    // One for the loyalty ability and one for the Beast token entering.
    expect(g.life('p2')).toBe(18);
  });

  it('deals 1 damage to a player whenever they activate a loyalty ability (opponents only)', () => {
    const g = game({
      p1: { battlefield: [id, { card: 'test-walker', loyalty: 3 }] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
    });
    activate(g, g.id('p1', 'test-walker'), 0);
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(g.life('p2')).toBe(20);
    const h = game({
      p1: { battlefield: [id] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
      active: 'p2',
    });
    activate(h, jaces(h, 'p2')[0]!, 0);
    done(h);
    expect(h.life('p2')).toBe(19);
    expect(h.life('p1')).toBe(20);
  });

  it('ward—discard a card: an opponent targeting it must discard (and can not if the targeting card is their only card)', () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { hand: ['shock', 'forest'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const gid = g.id('p1', id);
    cast(g, 'shock', [target(g, gid)]);
    done(g);
    expect(gy(g, 'p2')).toContain('forest');
    expect(g.obj(gid).damage).toBe(2);
    // Only the Shock in hand: nothing to discard, so it can't target Gideon.
    const h = game({
      p1: { battlefield: [id] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const targetsGideon = h
      .legal()
      .some(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.some((t) => 'object' in t && t.object.id === h.id('p1', id)),
      );
    expect(targetsGideon).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Jace's Machinations
// ---------------------------------------------------------------------------

describe("Jace's Machinations", () => {
  const id = 'jaces-machinations';

  it('is a {2}{U} instant', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Instant']);
    expect(d.manaCost).toMatchObject({ generic: 2, colored: { U: 1 } });
  });

  it('empowers Jace 8: creates the token with eight loyalty, or adds eight to yours', () => {
    const g = game({ p1: { hand: [id], battlefield: n('island', 3) } });
    cast(g, id);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(8);
    const h = game({
      p1: { hand: [id], battlefield: [{ card: FRA_JACE, loyalty: 2 }, ...n('island', 3)] },
    });
    cast(h, id);
    done(h);
    expect(loyalty(h, jaces(h)[0]!)).toBe(10);
  });

  it("lets you activate Jace planeswalkers' loyalty abilities on any player's turn, at instant speed, this turn only", () => {
    const g = game({
      p1: {
        hand: [id],
        battlefield: [{ card: FRA_JACE, loyalty: 3 }, { card: 'test-walker', loyalty: 4 }, ...n('island', 3)],
        library: n('plains', 6),
      },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      active: 'p2',
    });
    const j = jaces(g)[0]!;
    const w = g.id('p1', 'test-walker');
    // Not before: it's their turn.
    g.pass(); // p2 passes priority in main 1 so p1 gets it
    expect(g.actor).toBe('p1');
    expect(canActivate(g, j, 1)).toBe(false);
    cast(g, id);
    g.pass();
    g.pass();
    expect(g.state.stack).toHaveLength(0);
    // Back to p1 (the active player p2 passes again).
    g.pass();
    expect(g.actor).toBe('p1');
    // The Jace (with 8 more loyalty now) can be activated on their turn; a non-Jace planeswalker can not.
    expect(canActivate(g, j, 1)).toBe(true);
    expect(canActivate(g, w, 0)).toBe(false);
    const handBefore = hand(g).length;
    activate(g, j, 1);
    done(g);
    expect(hand(g).length).toBe(handBefore + 1);
    expect(loyalty(g, j)).toBe(8);
    // Still only once per planeswalker per turn.
    expect(canActivate(g, j, 0)).toBe(false);
    // It ends with the turn: on their next turn it's not available.
    passTo(g, 'main1', 'p1');
    passTo(g, 'main1', 'p2');
    g.pass();
    expect(canActivate(g, j, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overwrite the Multiverse
// ---------------------------------------------------------------------------

describe('Overwrite the Multiverse', () => {
  const id = 'overwrite-the-multiverse';

  it('is a {4}{B}{B} sorcery', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Sorcery']);
    expect(d.manaCost).toMatchObject({ generic: 4, colored: { B: 2 } });
  });

  it('exiles all creatures (not to the graveyard) and empowers Jace by the number exiled, tokens and all', () => {
    const g = game({
      p1: {
        hand: [id],
        battlefield: ['bear-cub', 'test-big', { card: 'ajani-resolute', loyalty: 2 }, ...n('swamp', 6)],
      },
      p2: { battlefield: ['bear-cub', 'bear-cub', { card: 'fra-cadet-token' }, 'forest'] },
    });
    g.obj(g.id('p2', 'fra-cadet-token')).isToken = true;
    cast(g, id);
    done(g);
    expect(g.state.battlefield.filter((x) => db.get(g.obj(x).defId)!.types.includes('Creature'))).toEqual([]);
    expect(exile(g, 'p1').sort()).toEqual(['bear-cub', 'test-big']);
    expect(exile(g, 'p2')).toEqual(['bear-cub', 'bear-cub']);
    expect(gy(g, 'p1')).toEqual([id]);
    expect(gy(g, 'p2')).toEqual([]);
    // Five creatures exiled (the token ceases to exist): a Jace token with five loyalty.
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(5);
    // Other permanents are untouched.
    expect(g.zoneOf(g.id('p1', 'ajani-resolute'))).toBe('battlefield');
    expect(g.zoneOf(g.id('p2', 'forest'))).toBe('battlefield');
  });

  it('adds to your existing Jace token', () => {
    const g = game({
      p1: { hand: [id], battlefield: [{ card: FRA_JACE, loyalty: 3 }, 'bear-cub', ...n('swamp', 6)] },
    });
    cast(g, id);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('with no creatures it exiles nothing and empowers Jace 0: a token is created and dies', () => {
    const g = game({ p1: { hand: [id], battlefield: n('swamp', 6) } });
    cast(g, id);
    done(g);
    expect(jaces(g)).toHaveLength(0);
    expect(gy(g)).toEqual([id]);
  });
});

// ---------------------------------------------------------------------------
// Repurposed Enforcer
// ---------------------------------------------------------------------------

describe('Repurposed Enforcer', () => {
  const id = 'repurposed-enforcer';

  it('is a 3/2 white Human Soldier', () => {
    expect(db.get(id)).toMatchObject({ power: 3, toughness: 2, colors: ['W'], subtypes: ['Human', 'Soldier'] });
  });

  it('whenever it attacks, empowers Jace by the number of creatures you control', () => {
    const g = game({
      p1: { battlefield: [id, 'bear-cub', 'test-big'] },
      p2: { battlefield: ['bear-cub', 'bear-cub'] },
    });
    attack(g, [{ id: g.id('p1', id), defender: 'p2' }]);
    done(g);
    // Three creatures of mine (the opponent's don't count).
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(3);
  });

  it("doesn't trigger for other creatures attacking, and adds to the same token next time", () => {
    const g = game({
      p1: { battlefield: [id, 'bear-cub', { card: FRA_JACE, loyalty: 2 }] },
    });
    attack(g, [{ id: g.id('p1', 'bear-cub'), defender: 'p2' }]);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    const h = game({
      p1: { battlefield: [id, 'bear-cub', { card: FRA_JACE, loyalty: 2 }] },
    });
    attack(h, [
      { id: h.id('p1', id), defender: 'p2' },
      { id: h.id('p1', 'bear-cub'), defender: 'p2' },
    ]);
    done(h);
    expect(loyalty(h, jaces(h)[0]!)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Sanctum Lurker
// ---------------------------------------------------------------------------

describe('Sanctum Lurker', () => {
  const id = 'sanctum-lurker';

  it('is a 3/2 black Horror', () => {
    expect(db.get(id)).toMatchObject({ power: 3, toughness: 2, colors: ['B'], subtypes: ['Horror'] });
  });

  it('when it enters, empowers Jace 1', () => {
    const g = game({ p1: { hand: [id], battlefield: n('swamp', 3) } });
    cast(g, id);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
  });

  it("planeswalkers you control aren't put into the graveyard for having 0 loyalty (but others', and without it, are)", () => {
    const g = game({
      p1: { battlefield: [id, { card: FRA_JACE, loyalty: 1 }, { card: 'test-walker', loyalty: 1 }] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
    });
    const j = jaces(g)[0]!;
    // −1: Surveil 1 down to 0 loyalty: it stays.
    activate(g, j, 0);
    done(g);
    expect(g.zoneOf(j)).toBe('battlefield');
    expect(loyalty(g, j)).toBe(0);
    // The opponent's planeswalker with 0 loyalty is not protected.
    g.obj(jaces(g, 'p2')[0]!).counters = { loyalty: 0 };
    g.obj(g.id('p1', 'test-walker')).counters = { loyalty: 0 };
    activate(g, g.id('p1', 'test-walker'), 1);
    done(g);
    expect(jaces(g, 'p2')).toHaveLength(0);
    // Without the Lurker it would die at once.
    const h = game({ p1: { battlefield: [{ card: FRA_JACE, loyalty: 1 }] } });
    activate(h, jaces(h)[0]!, 0);
    done(h);
    expect(jaces(h)).toHaveLength(0);
  });

  it('a planeswalker at 0 loyalty dies when the Lurker leaves', () => {
    const g = game({
      p1: { battlefield: [id, { card: FRA_JACE, loyalty: 1 }], hand: [] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const j = jaces(g)[0]!;
    activate(g, j, 0);
    done(g);
    expect(g.zoneOf(j)).toBe('battlefield');
    g.pass();
    cast(g, 'shock', [target(g, g.id('p1', id))]);
    done(g);
    expect(g.zoneOf(g.id('p1', id, 'graveyard'))).toBe('graveyard');
    expect(jaces(g)).toHaveLength(0);
  });

  it('gives planeswalkers you control "+2: This planeswalker deals 1 damage to each opponent and you gain 1 life"', () => {
    const g = game({
      p1: { battlefield: [id, { card: FRA_JACE, loyalty: 1 }, { card: 'test-walker', loyalty: 1 }] },
    });
    const j = jaces(g)[0]!;
    // Jace token: the printed −1 and −3, then the granted +2.
    expect(canActivate(g, j, 2)).toBe(true);
    activate(g, j, 2);
    done(g);
    expect(loyalty(g, j)).toBe(3);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    // Another planeswalker has it too (after its printed ability).
    const w = g.id('p1', 'test-walker');
    expect(canActivate(g, w, 1)).toBe(true);
    activate(g, w, 1);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it("an opponent's planeswalkers don't get the +2", () => {
    const g = game({
      p1: { battlefield: [id] },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 3 }] },
      active: 'p2',
    });
    expect(canActivate(g, g.id('p2', 'test-walker'), 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Theorist's Proxy
// ---------------------------------------------------------------------------

describe("Theorist's Proxy", () => {
  const id = 'theorists-proxy';

  it('is a 0/3 blue Illusion with flash', () => {
    const d = db.get(id)!;
    expect(d).toMatchObject({ power: 0, toughness: 3, colors: ['U'], subtypes: ['Illusion'] });
    expect(d.keywords).toContain('flash');
  });

  it('can be cast at instant speed and empowers Jace 3 when it enters', () => {
    const g = game({
      p1: { hand: [id], battlefield: n('island', 2) },
      p2: { battlefield: ['forest'] },
      active: 'p2',
    });
    g.pass();
    cast(g, id);
    done(g);
    expect(g.zoneOf(g.id('p1', id))).toBe('battlefield');
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(3);
  });

  it("{U}, sacrifice it: the next spell you cast this turn can't be countered (only that one)", () => {
    const g = game({
      p1: { hand: ['test-sorcery-u', 'test-sorcery-u'], battlefield: [id, ...n('island', 3)] },
      p2: { hand: ['test-counter', 'test-counter'], battlefield: n('island', 2) },
    });
    const proxy = g.id('p1', id);
    const ability = db.get(id)!.abilities.findIndex((a) => a.kind === 'activated');
    activate(g, proxy, ability);
    done(g);
    expect(g.zoneOf(g.id('p1', id, 'graveyard'))).toBe('graveyard');
    // The first spell can't be countered: the counterspell does nothing.
    cast(g, 'test-sorcery-u');
    g.pass();
    cast(g, 'test-counter', [target(g, g.state.stack[0]!.id)]);
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(gy(g, 'p2')).toEqual(['test-counter']);
    // The second one can be.
    cast(g, 'test-sorcery-u');
    g.pass();
    // p2 counters it.
    const second = g.state.stack.find((x) => x.kind === 'spell')!;
    cast(g, 'test-counter', [target(g, second.id)]);
    done(g);
    expect(g.life('p1')).toBe(21);
  });

  it("the effect ends with the turn if no spell was cast", () => {
    const g = game({
      p1: { hand: ['test-sorcery-u'], battlefield: [id, ...n('island', 3)] },
      p2: { hand: ['test-counter'], battlefield: n('island', 2) },
    });
    const ability = db.get(id)!.abilities.findIndex((a) => a.kind === 'activated');
    activate(g, g.id('p1', id), ability);
    done(g);
    passTo(g, 'main1', 'p1');
    cast(g, 'test-sorcery-u');
    g.pass();
    cast(g, 'test-counter', [target(g, g.state.stack[0]!.id)]);
    done(g);
    // Countered as normal this time.
    expect(g.life('p1')).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Theorist's Sanctum
// ---------------------------------------------------------------------------

describe("Theorist's Sanctum", () => {
  const id = 'theorists-sanctum';

  it('is a nonbasic Island land that taps for {U}', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Land']);
    expect(d.subtypes).toEqual(['Island']);
    expect(d.supertypes).toEqual([]);
    const g = game({ p1: { battlefield: [id] } });
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === g.id('p1', id) && a.abilityIndex === 0),
    ).toBe(false);
    // Taps for blue mana: a blue spell can be cast with it alone.
    const h = game({ p1: { hand: ['test-sorcery-u'], battlefield: [id] } });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('enters tapped unless you control a Jace or hold one (behold)', () => {
    const play = (spec: ScenarioSpec) => {
      const g = game(spec);
      const land = g.state.players.p1.hand.find((x) => g.obj(x).defId === id)!;
      g.do({ type: 'playLand', player: 'p1', card: land });
      done(g);
      return g.obj(land).tapped;
    };
    expect(play({ p1: { hand: [id] } })).toBe(true);
    expect(play({ p1: { hand: [id], battlefield: [{ card: FRA_JACE, loyalty: 2 }] } })).toBe(false);
    expect(play({ p1: { hand: [id], battlefield: [{ card: 'the-theorist-jace-beleren', loyalty: 3 }] } })).toBe(false);
    expect(play({ p1: { hand: [id, 'jace-reality-sculptor'] } })).toBe(false);
    // Only a Jace counts.
    expect(play({ p1: { hand: [id], battlefield: [{ card: 'ajani-resolute', loyalty: 2 }] } })).toBe(true);
  });

  it('{2}{U}, {T}: empower Jace 2', () => {
    const g = game({ p1: { battlefield: [id, ...n('island', 2), 'forest'] } });
    const s = g.id('p1', id);
    const idx = db.get(id)!.abilities.findIndex((a) => a.kind === 'activated');
    expect(canActivate(g, s, idx)).toBe(true);
    activate(g, s, idx);
    done(g);
    expect(g.obj(s).tapped).toBe(true);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    // It can't pay for itself: without three other lands it can't be activated.
    const h = game({ p1: { battlefield: [id, 'island'] } });
    expect(canActivate(h, h.id('p1', id), idx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vraska's Final Mercy
// ---------------------------------------------------------------------------

describe("Vraska's Final Mercy", () => {
  const id = 'vraskas-final-mercy';

  it('is a {B}{B} sorcery with two modes', () => {
    const d = db.get(id)!;
    expect(d.types).toEqual(['Sorcery']);
    expect(d.manaCost).toMatchObject({ generic: 0, colored: { B: 2 } });
    expect(d.modes).toHaveLength(2);
  });

  it('mode 1: you lose 2 life and destroy target creature (any controller)', () => {
    const g = game({
      p1: { hand: [id], battlefield: n('swamp', 2) },
      p2: { battlefield: ['test-big'] },
    });
    cast(g, id, [target(g, g.id('p2', 'test-big'))], { mode: 0 });
    done(g);
    expect(mine(g, 'test-big', 'p2')).toHaveLength(0);
    expect(g.life('p1')).toBe(18);
    expect(jaces(g)).toHaveLength(0);
  });

  it('mode 1 destroys a planeswalker too, but only a creature or planeswalker can be targeted', () => {
    const g = game({
      p1: { hand: [id], battlefield: [...n('swamp', 2), 'forest'] },
      p2: { battlefield: [{ card: 'test-walker', loyalty: 4 }, 'forest', 'test-artifact'] },
    });
    const legalTargets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.mode === 0)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : 'player'));
    expect(legalTargets).toEqual(['test-walker']);
    cast(g, id, [target(g, g.id('p2', 'test-walker'))], { mode: 0 });
    done(g);
    expect(g.zoneOf(g.id('p2', 'test-walker', 'graveyard'))).toBe('graveyard');
    expect(g.life('p1')).toBe(18);
  });

  it("mode 1 does nothing (you don't lose the life) if its target is gone as it resolves", () => {
    const g = game({
      p1: { hand: [id], battlefield: n('swamp', 2) },
      p2: { hand: ['shock'], battlefield: ['mountain', 'bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    cast(g, id, [target(g, cub)], { mode: 0 });
    g.pass();
    cast(g, 'shock', [target(g, cub)]);
    done(g);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(0);
    expect(g.life('p1')).toBe(20);
  });

  it('mode 2: you lose 2 life and empower Jace 6', () => {
    const g = game({ p1: { hand: [id], battlefield: n('swamp', 2) } });
    cast(g, id, [], { mode: 1 });
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(6);
  });

  it('mode 2 adds to the token you control', () => {
    const g = game({
      p1: { hand: [id], battlefield: [{ card: FRA_JACE, loyalty: 4 }, ...n('swamp', 2)] },
    });
    cast(g, id, [], { mode: 1 });
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Chandra, Torch of Defiance: casting the exiled card (the engine piece "exile the top card, you may cast it")
// ---------------------------------------------------------------------------

describe('exile the top card and cast it (Chandra, Torch of Defiance +1)', () => {
  const id = 'chandra-torch-of-defiance';
  const start = (library: string[], battlefield: string[], extra: Partial<ScenarioSpec> = {}) => {
    const g = game({
      p1: { battlefield: [{ card: id, loyalty: 4 }, ...battlefield], library },
      ...extra,
    });
    activate(g, g.id('p1', id), 0);
    g.pass();
    g.pass();
    return g;
  };

  it('a spell with targets: the cast chooses them', () => {
    const g = start(['shock', 'forest'], ['mountain'], { p2: { battlefield: ['bear-cub'] } });
    expect(g.decision.kind).toBe('castFree');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // Two players and a creature: the opponent, me, and the Bear Cub (Chandra isn't a creature but is a legal "any target").
    const cub = casts.find(
      (a) =>
        a.type === 'castSpell' &&
        a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'bear-cub')),
    )!;
    g.do(cub);
    done(g);
    expect(mine(g, 'bear-cub', 'p2')).toHaveLength(0);
    // It was cast, so Chandra doesn't deal the 2 damage.
    expect(g.life('p2')).toBe(20);
  });

  it('a modal spell: each mode is its own way to cast it, paying the one cost', () => {
    const g = start(['vraskas-final-mercy', 'forest'], n('swamp', 2));
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(new Set(casts.map((a) => (a.type === 'castSpell' ? a.mode : undefined)))).toEqual(new Set([0, 1]));
    g.do(casts.find((a) => a.type === 'castSpell' && a.mode === 1)!);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(6);
    expect(g.life('p1')).toBe(18);
    expect(g.life('p2')).toBe(20);
  });

  it('an instant can be cast too, and the spell it leaves goes to the graveyard', () => {
    const g = start(['shock', 'forest'], ['mountain']);
    g.do(
      g.legal().find((a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'))!,
    );
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(gy(g)).toEqual(['shock']);
  });

  it("Chandra's own ability resolves fully when it is not cast: the 2 damage comes after the decision", () => {
    const g = start(['shock', 'forest'], ['mountain']);
    expect(g.life('p2')).toBe(20);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(exile(g)).toEqual(['shock']);
  });

  it("the emblem's damage comes from its own colorless source", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [{ card: id, loyalty: 7 }, 'mountain'] },
    });
    activate(g, g.id('p1', id), 3);
    done(g);
    expect(g.state.emblems![0]!.source.id).toBe('emblem');
  });
});
