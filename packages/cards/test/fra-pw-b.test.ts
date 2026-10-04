import { describe, expect, it } from 'vitest';
import {
  type Action,
  type CardDefinition,
  type EffectDef,
  type TargetChoice,
  createEngine,
  getAbilities,
  getCharacteristics,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { JACE } from '../src/fra/helpers.ts';
import { FRA_JACE } from '../src/fra/tokens.ts';
import { all, n } from './blb-helpers.ts';

// Reality Fracture 17c: the planeswalker uncommons (the Way of the ... cycle and the rest), and the two core pieces made
// exact with them: Inspired Tethermage (only counters you put) and behold (you pick the card; one in hand is revealed).

// ---------------------------------------------------------------------------
// Test-only cards
// ---------------------------------------------------------------------------

const printed = (id: string, over: Partial<CardDefinition>): CardDefinition => ({
  id,
  name: id,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: ['Sorcery'],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...over,
});
const t0 = { target: 0 } as const;
const gainLife = (amount: number) => ({ kind: 'gainLife', who: 'controller', amount }) as EffectDef;

const TEST_CARDS: CardDefinition[] = [
  // "Put three loyalty counters on target permanent" (a planeswalker gets them), at instant speed.
  printed('test-put-loyalty', {
    types: ['Instant'],
    spell: {
      targets: [{ what: 'permanent' }],
      effects: [{ kind: 'loyaltyCounters', to: t0, amount: 3 } as EffectDef],
    },
  }),
  printed('test-proliferate', {
    spell: { targets: [], effects: [{ kind: 'proliferate' }] },
  }),
  printed('test-gain-2', { spell: { targets: [], effects: [gainLife(2)] } }),
  // A cheap Countersculpt stand-in with no target: "behold a Jace or pay {1}" (cast free by Daring Waverider).
  printed('test-sculpt', {
    types: ['Instant'],
    manaCost: { generic: 0, colored: { U: 1 } },
    colors: ['U'],
    beholdOrPay: { filter: JACE, pay: { generic: 1, colored: {} } },
    spell: { targets: [], effects: [gainLife(4)] },
  }),
  // Nontoken Jace and Garruk walkers.
  printed('test-jace', {
    name: 'Test Jace',
    types: ['Planeswalker'],
    subtypes: ['Jace'],
    colors: ['U'],
    loyalty: 4,
    manaCost: { generic: 3, colored: {} },
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [gainLife(1)],
        label: '+1: You gain 1 life',
      },
    ],
  }),
  printed('test-garruk', {
    name: 'Test Garruk',
    types: ['Planeswalker'],
    subtypes: ['Garruk'],
    colors: ['G'],
    loyalty: 3,
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [gainLife(1)],
        label: '+1: You gain 1 life',
      },
    ],
  }),
  // Seven mana value planeswalker and creature cards for Rewrite Regrets.
  printed('test-big-walker', {
    name: 'Test Big Walker',
    types: ['Planeswalker'],
    subtypes: ['Garruk'],
    loyalty: 5,
    manaCost: { generic: 7, colored: {} },
  }),
  printed('test-big-creature', {
    name: 'Test Big Creature',
    types: ['Creature'],
    power: 7,
    toughness: 7,
    manaCost: { generic: 7, colored: {} },
  }),
  printed('test-ox', { types: ['Creature'], power: 4, toughness: 6 }),
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
/** The index of a (printed or granted) ability of a permanent by its label. */
const abilityIndex = (g: GameDriver, source: string, label: RegExp): number => {
  const i = getAbilities(g.state, db, source).findIndex(
    (a) => a.kind === 'activated' && label.test(a.label ?? ''),
  );
  if (i < 0) throw new Error(`No ability ${label} on ${source}`);
  return i;
};
const activate = (
  g: GameDriver,
  source: string,
  label: RegExp | number,
  targets: TargetChoice[] = [],
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: typeof label === 'number' ? label : abilityIndex(g, source, label),
    targets,
  });
const canActivate = (g: GameDriver, source: string, label: RegExp) => {
  const i = abilityIndex(g, source, label);
  return g
    .legal()
    .some((a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === i);
};

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Which of several chooseObject options (by index). */
  pick?: number;
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
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
    } else if (d.kind === 'scry') {
      g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    } else if (d.kind === 'sacrificeSeveral') {
      g.do({ type: 'chooseCard', player: d.player, card: d.options[opts.pick ?? 0]! });
    } else if (d.kind === 'optionalEffect') {
      g.do({ type: 'chooseEffect', player: d.player, accept: true });
    } else break;
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
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, db, id);
  return [c.power, c.toughness];
};
const keywords = (g: GameDriver, id: string) => [...getCharacteristics(g.state, db, id).keywords];
const reveals = (g: GameDriver) => g.events.filter((e) => e.type === 'cardsRevealed');
const tappedLands = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) =>
      g.obj(id).tapped &&
      g.obj(id).controller === p &&
      db.get(g.obj(id).defId)!.types.includes('Land'),
  ).length;

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

// ---------------------------------------------------------------------------
// Core: Inspired Tethermage counts only the loyalty counters you put
// ---------------------------------------------------------------------------

describe('Inspired Tethermage: only counters you put', () => {
  const counters = (g: GameDriver, p: 'p1' | 'p2') =>
    g.obj(g.id(p, 'inspired-tethermage')).plusOneCounters;

  it('counters you put on a planeswalker an opponent controls count', () => {
    const g = game({
      p1: { hand: ['test-put-loyalty'], battlefield: ['inspired-tethermage'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 2 }] },
    });
    const theirs = jaces(g, 'p2')[0]!;
    cast(g, 'test-put-loyalty', [target(g, theirs)]);
    done(g);
    expect(loyalty(g, theirs)).toBe(5);
    expect(counters(g, 'p1')).toBe(1);
  });

  it('counters an opponent puts on your planeswalker do not (they count for their Tethermage)', () => {
    const g = game({
      p1: { battlefield: ['inspired-tethermage', { card: FRA_JACE, loyalty: 2 }] },
      p2: {
        hand: ['test-put-loyalty'],
        battlefield: ['inspired-tethermage'],
      },
      active: 'p2',
    });
    const mine = jaces(g, 'p1')[0]!;
    cast(g, 'test-put-loyalty', [target(g, mine)]);
    done(g);
    expect(loyalty(g, mine)).toBe(5);
    expect(counters(g, 'p1')).toBe(0);
    expect(counters(g, 'p2')).toBe(1);
  });

  it('counters you put on your own planeswalker count, once for each planeswalker', () => {
    const g = game({
      p1: {
        hand: ['test-put-loyalty'],
        battlefield: [
          'inspired-tethermage',
          { card: FRA_JACE, loyalty: 1 },
          { card: 'test-jace', loyalty: 4 },
        ],
      },
    });
    cast(g, 'test-put-loyalty', [target(g, jaces(g)[0]!)]);
    done(g);
    expect(counters(g, 'p1')).toBe(1);
  });

  it('proliferating an opponent planeswalker counts for the player who proliferates', () => {
    const g = game({
      p1: { hand: ['test-proliferate'], battlefield: ['inspired-tethermage'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 2 }] },
    });
    const theirs = jaces(g, 'p2')[0]!;
    cast(g, 'test-proliferate');
    done(g, { pick: 0 });
    expect(loyalty(g, theirs)).toBe(3);
    expect(counters(g, 'p1')).toBe(1);
  });

  it('a loyalty ability that adds loyalty is you putting counters (the activator)', () => {
    const g = game({
      p1: { battlefield: ['inspired-tethermage', { card: 'test-jace', loyalty: 4 }] },
      p2: { battlefield: ['inspired-tethermage'] },
    });
    activate(g, g.id('p1', 'test-jace'), /\+1/);
    done(g);
    expect(counters(g, 'p1')).toBe(1);
    expect(counters(g, 'p2')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Core: behold a Jace
// ---------------------------------------------------------------------------

describe('behold a Jace: you pick the card, and one in hand is revealed', () => {
  const sculpts = (g: GameDriver) =>
    g
      .legal()
      .flatMap((a) =>
        a.type === 'castSpell' && g.obj(a.card).defId === 'countersculpt' ? [a] : [],
      );

  it('offers one cast for each Jace to behold (same-name cards are one choice) and one to pay {1}', () => {
    const g = game({
      p1: {
        hand: ['countersculpt', 'test-jace', 'test-jace', 'test-garruk'],
        battlefield: [
          { card: FRA_JACE, loyalty: 1 },
          { card: FRA_JACE, loyalty: 4 },
          { card: 'test-garruk', loyalty: 3 },
          ...n('island', 3),
        ],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    // Something to counter: the opponent's Shock, on the stack.
    g.pass();
    cast(g, 'shock', [player('p1')]);
    g.pass();
    const casts = sculpts(g);
    const beholds = casts.flatMap((a) =>
      a.type === 'castSpell' && a.beholdCard ? [a.beholdCard] : [],
    );
    // The Jace token, and Test Jace from hand (the second copy is the same choice): no Garruk.
    expect(beholds.map((id) => g.obj(id).defId).sort()).toEqual([FRA_JACE, 'test-jace']);
    expect(beholds.map((id) => g.obj(id).zone).sort()).toEqual(['battlefield', 'hand']);
    expect(casts.filter((a) => a.type === 'castSpell' && !a.beheld)).toHaveLength(1);
    expect(casts).toHaveLength(3);
    // Without the choice in the action the cast is not legal.
    expect(() =>
      cast(g, 'countersculpt', [target(g, g.state.stack[0]!.id)], { beheld: true }),
    ).toThrow();
  });

  it('beholding a Jace you control reveals nothing; one from your hand is revealed (and stays)', () => {
    const board = game({
      p1: {
        hand: ['countersculpt'],
        battlefield: [{ card: FRA_JACE, loyalty: 1 }, 'island', 'island'],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    board.pass();
    cast(board, 'shock', [player('p1')]);
    board.pass();
    cast(board, 'countersculpt', [target(board, board.state.stack[0]!.id)], {
      beheld: true,
      beholdCard: jaces(board)[0]!,
    });
    expect(reveals(board)).toHaveLength(0);
    expect(tappedLands(board)).toBe(2);

    const inHand = game({
      p1: { hand: ['countersculpt', 'test-jace'], battlefield: ['island', 'island'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    inHand.pass();
    cast(inHand, 'shock', [player('p1')]);
    inHand.pass();
    const jace = inHand.id('p1', 'test-jace', 'hand');
    cast(inHand, 'countersculpt', [target(inHand, inHand.state.stack[0]!.id)], {
      beheld: true,
      beholdCard: jace,
    });
    expect(reveals(inHand)).toEqual([
      { type: 'cardsRevealed', player: 'p1', cards: [{ id: jace, defId: 'test-jace' }] },
    ]);
    expect(inHand.zoneOf(jace)).toBe('hand');
    done(inHand);
    expect(gy(inHand, 'p2')).toEqual(['shock']);
    expect(inHand.life('p1')).toBe(20);
  });

  it('a cast that is not beholding but pays {1} reveals nothing', () => {
    const g = game({
      p1: {
        hand: ['countersculpt', 'test-jace'],
        battlefield: n('island', 3),
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.pass();
    cast(g, 'shock', [player('p1')]);
    g.pass();
    cast(g, 'countersculpt', [target(g, g.state.stack[0]!.id)]);
    expect(reveals(g)).toHaveLength(0);
    expect(tappedLands(g)).toBe(3);
  });

  it('a free cast (Daring Waverider) still pays "behold or pay {1}": pick the Jace to behold, or pay', () => {
    const make = () =>
      game({
        p1: {
          hand: ['daring-waverider', 'test-jace'],
          battlefield: n('island', 7),
          graveyard: ['test-sculpt'],
        },
      });
    const g = make();
    cast(g, 'daring-waverider');
    done(g);
    // done() passes priority: it stops at the free-cast decision.
    expect(g.decision.kind).toBe('castFree');
    const options = g.legal().filter((a) => a.type === 'castSpell');
    // Behold Test Jace from hand, or pay {1} (one land is left untapped for it).
    expect(
      options.map((a) => (a.type === 'castSpell' ? (a.beholdCard ? 'behold' : 'pay') : '')).sort(),
    ).toEqual(['behold', 'pay']);
    const behold = options.find((a) => a.type === 'castSpell' && a.beholdCard)!;
    g.do(behold);
    expect(reveals(g)).toHaveLength(1);
    done(g);
    expect(g.life('p1')).toBe(24);
    expect(tappedLands(g)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Countersculpt
// ---------------------------------------------------------------------------

describe('Countersculpt', () => {
  const setup = (p1: ScenarioSpec['p1']) => {
    const g = game({ p1, p2: { hand: ['shock'], battlefield: ['mountain'] } });
    g.pass();
    cast(g, 'shock', [player('p1')]);
    g.pass();
    return g;
  };

  it('is {U}{U}, counters target spell, then empowers Jace 1 (a new token with one loyalty counter)', () => {
    const g = setup({ hand: ['countersculpt'], battlefield: n('island', 3) });
    expect(db.get('countersculpt')!.beholdOrPay).toBeDefined();
    cast(g, 'countersculpt', [target(g, g.state.stack[0]!.id)]);
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock']);
    expect(g.life('p1')).toBe(20);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
    // Paid {U}{U} and {1}: no Jace to behold.
    expect(tappedLands(g)).toBe(3);
  });

  it('beholding a Jace instead of paying {1}: only {U}{U}, the counter goes on that Jace token', () => {
    const g = setup({
      hand: ['countersculpt'],
      battlefield: [{ card: FRA_JACE, loyalty: 2 }, ...n('island', 2)],
    });
    const jace = jaces(g)[0]!;
    cast(g, 'countersculpt', [target(g, g.state.stack[0]!.id)], { beheld: true, beholdCard: jace });
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(loyalty(g, jace)).toBe(3);
    expect(tappedLands(g)).toBe(2);
  });

  it('can be cast with {U}{U}{1} and nothing to behold; with two lands and no Jace it can not be cast', () => {
    const g = setup({ hand: ['countersculpt'], battlefield: n('island', 2) });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('a nontoken Jace you control can be beheld, and it is not the Jace that gets the counter', () => {
    const g = setup({
      hand: ['countersculpt'],
      battlefield: [{ card: 'test-jace', loyalty: 4 }, ...n('island', 2)],
    });
    cast(g, 'countersculpt', [target(g, g.state.stack[0]!.id)], {
      beheld: true,
      beholdCard: g.id('p1', 'test-jace'),
    });
    done(g);
    expect(loyalty(g, g.id('p1', 'test-jace'))).toBe(4);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fatehold Charm
// ---------------------------------------------------------------------------

describe('Fatehold Charm', () => {
  const lands = () => ['plains', 'island'];

  it('is a {W}{U} instant with three modes', () => {
    const d = db.get('fatehold-charm')!;
    expect(d.types).toEqual(['Instant']);
    expect(d.modes).toHaveLength(3);
  });

  it('mode 1: draw a card, then empower Jace 2', () => {
    const g = game({ p1: { hand: ['fatehold-charm'], battlefield: lands() } });
    const before = hand(g).length;
    cast(g, 'fatehold-charm', [], { mode: 0 });
    done(g);
    expect(hand(g).length).toBe(before - 1 + 1);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
  });

  it('mode 2: returns a creature to its owner hand (either side), but not a land or a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['fatehold-charm'],
        battlefield: [...lands(), 'bear-cub', { card: FRA_JACE, loyalty: 1 }],
      },
      p2: { battlefield: ['bear-cub', 'forest', { card: 'test-garruk', loyalty: 3 }] },
    });
    const targets = g
      .legal()
      .flatMap((a) => (a.type === 'castSpell' && a.mode === 1 ? a.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));
    expect(targets.sort()).toEqual([g.id('p1', 'bear-cub'), g.id('p2', 'bear-cub')].sort());
    cast(g, 'fatehold-charm', [target(g, g.id('p2', 'bear-cub'))], { mode: 1 });
    done(g);
    expect(hand(g, 'p2')).toEqual(['bear-cub']);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(jaces(g)).toHaveLength(1); // no Empower Jace in this mode
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
  });

  it('mode 2: returns a spell on the stack to its owner hand (it is not countered)', () => {
    const g = game({
      p1: { hand: ['fatehold-charm'], battlefield: lands() },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.pass();
    cast(g, 'shock', [player('p1')]);
    g.pass();
    const shock = g.state.stack[0]!.id;
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'castSpell' && a.mode === 1 ? [a.targets] : []));
    expect(options).toEqual([[{ object: { id: shock, zcc: g.obj(shock).zcc } }]]);
    cast(g, 'fatehold-charm', [target(g, shock)], { mode: 1 });
    done(g);
    expect(hand(g, 'p2')).toEqual(['shock']);
    expect(gy(g, 'p2')).toEqual([]);
    expect(g.life('p1')).toBe(20);
  });

  it('mode 2: a creature with hexproof can not be targeted by it from an opponent', () => {
    const g = game({
      p1: { battlefield: [] },
      p2: { hand: ['fatehold-charm'], battlefield: lands() },
      active: 'p2',
    });
    g.state.battlefield.push(g.id('p2', 'plains'));
    const h = game({
      p1: { battlefield: ['bear-cub'] },
      p2: { hand: ['fatehold-charm'], battlefield: lands() },
      active: 'p2',
    });
    h.obj(h.id('p1', 'bear-cub')).grantedKeywords = ['hexproof'];
    expect(
      h.legal().some((a) => a.type === 'castSpell' && a.mode === 1 && a.targets.length === 1),
    ).toBe(false);
  });

  it('mode 3: creatures you control get +1/+2 until end of turn (not the opponent)', () => {
    const g = game({
      p1: { hand: ['fatehold-charm'], battlefield: [...lands(), 'bear-cub', 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'fatehold-charm', [], { mode: 2 });
    done(g);
    for (const id of all(g, 'bear-cub'))
      expect(pt(g, id)).toEqual(g.obj(id).controller === 'p1' ? [3, 4] : [2, 2]);
    passTo(g, 'main1', 'p1');
    for (const id of all(g, 'bear-cub')) expect(pt(g, id)).toEqual([2, 2]);
  });
});

// ---------------------------------------------------------------------------
// Kiora of Salt and Sand
// ---------------------------------------------------------------------------

describe('Kiora of Salt and Sand', () => {
  const attackWith = (g: GameDriver, ...ids: string[]) => {
    g.passUntilStep('beginCombat').passBoth();
    for (const id of ids) g.do({ type: 'addAttacker', player: 'p1', attacker: id, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
  };

  it('whenever you attack, if you activated a loyalty ability this turn: untap the attacker, it can not be blocked', () => {
    const g = game({
      p1: {
        battlefield: ['kiora-of-salt-and-sand', 'bear-cub', { card: FRA_JACE, loyalty: 3 }],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    activate(g, jaces(g)[0]!, 0);
    done(g);
    attackWith(g, bear);
    // The trigger asks for its target (the attacking creature).
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!);
    expect(g.state.stack).toHaveLength(1);
    expect(g.obj(bear).tapped).toBe(true);
    done(g);
    expect(g.obj(bear).tapped).toBe(false);
    // Blockers: their bear can not block it, so no block is even offered.
    expect(g.decision.kind).toBe('priority');
    g.passUntilStep('declareBlockers');
    expect(g.state.combat?.attackers[0]?.blocked).toBe(false);
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(18);
  });

  it('does nothing if you did not activate a loyalty ability this turn', () => {
    const g = game({
      p1: {
        battlefield: ['kiora-of-salt-and-sand', 'bear-cub', { card: FRA_JACE, loyalty: 3 }],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    attackWith(g, g.id('p1', 'bear-cub'));
    expect(g.state.stack).toHaveLength(0);
    expect(g.obj(g.id('p1', 'bear-cub')).tapped).toBe(true);
  });

  it('an opponent activating a loyalty ability does not count (it is "you")', () => {
    const g = game({
      p1: { battlefield: ['kiora-of-salt-and-sand', 'bear-cub'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
    });
    g.state.turn.loyaltyActivated = ['p2'];
    attackWith(g, g.id('p1', 'bear-cub'));
    expect(g.state.stack).toHaveLength(0);
  });

  it('target attacking creature: the trigger needs an attacker, and can pick any of them', () => {
    const g = game({
      p1: {
        battlefield: [
          'kiora-of-salt-and-sand',
          'bear-cub',
          'bear-cub',
          { card: FRA_JACE, loyalty: 3 },
        ],
      },
    });
    activate(g, jaces(g)[0]!, 0);
    done(g);
    const [a, b] = all(g, 'bear-cub');
    attackWith(g, a!, b!);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const chosen = g
      .legal()
      .flatMap((x) => (x.type === 'chooseTargets' ? x.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));
    expect(chosen.sort()).toEqual([a, b].sort());
    // The creature that is not attacking is not a choice.
    const h = game({
      p1: {
        battlefield: [
          'kiora-of-salt-and-sand',
          'bear-cub',
          'bear-cub',
          { card: FRA_JACE, loyalty: 3 },
        ],
      },
    });
    activate(h, jaces(h)[0]!, 0);
    done(h);
    attackWith(h, all(h, 'bear-cub')[0]!);
    const only = h
      .legal()
      .flatMap((x) => (x.type === 'chooseTargets' ? x.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));
    expect(only).toEqual([all(h, 'bear-cub')[0]]);
  });

  it('planeswalkers you control have −8: create an 8/8 blue Leviathan creature token with hexproof', () => {
    const g = game({
      p1: {
        battlefield: [
          'kiora-of-salt-and-sand',
          { card: FRA_JACE, loyalty: 9 },
          { card: 'test-jace', loyalty: 8 },
        ],
      },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 8 }] },
    });
    const label = /−8: Create an 8\/8 blue Leviathan creature token with hexproof/;
    // Both of mine have it; the opponent's does not.
    expect(canActivate(g, jaces(g, 'p1')[0]!, label)).toBe(true);
    expect(canActivate(g, g.id('p1', 'test-jace'), label)).toBe(true);
    expect(getAbilities(g.state, db, jaces(g, 'p2')[0]!)).toHaveLength(2);
    const testJace = g.id('p1', 'test-jace');
    activate(g, testJace, label);
    done(g);
    const [leviathan] = all(g, 'fra-leviathan-token');
    expect(leviathan).toBeDefined();
    expect(pt(g, leviathan!)).toEqual([8, 8]);
    expect(keywords(g, leviathan!)).toContain('hexproof');
    expect(db.get('fra-leviathan-token')!.colors).toEqual(['U']);
    expect(db.get('fra-leviathan-token')!.subtypes).toEqual(['Leviathan']);
    expect(g.obj(leviathan!).isToken).toBe(true);
    expect(g.zoneOf(testJace)).not.toBe('battlefield'); // 8 − 8 = 0 loyalty
  });

  it('the −8 needs eight loyalty counters', () => {
    const g = game({
      p1: { battlefield: ['kiora-of-salt-and-sand', { card: FRA_JACE, loyalty: 7 }] },
    });
    expect(canActivate(g, jaces(g)[0]!, /−8/)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mind Meanderer
// ---------------------------------------------------------------------------

describe('Mind Meanderer', () => {
  const lands = () => [...n('forest', 3), ...n('island', 3)];

  it('is a flier that fights up to one target creature an opponent controls when it enters', () => {
    const g = game({
      p1: { hand: ['mind-meanderer'], battlefield: lands() },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'mind-meanderer');
    done(g);
    const mm = g.id('p1', 'mind-meanderer');
    expect(keywords(g, mm)).toContain('flying');
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(g.obj(mm).damage).toBe(2);
  });

  it('"up to one": it may enter with no fight', () => {
    const g = game({
      p1: { hand: ['mind-meanderer'], battlefield: lands() },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'mind-meanderer');
    g.passBoth();
    // The trigger is put on the stack with the chance to choose no target.
    const none = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0);
    expect(none).toBeDefined();
    g.do(none!);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'mind-meanderer')).damage).toBe(0);
  });

  it('only creatures an opponent controls can be fought', () => {
    const g = game({
      p1: { hand: ['mind-meanderer'], battlefield: [...lands(), 'bear-cub'] },
      p2: { battlefield: ['bear-cub', 'forest'] },
    });
    cast(g, 'mind-meanderer');
    g.passBoth();
    const ids = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));
    expect(ids).toEqual([g.id('p2', 'bear-cub')]);
  });

  it('has vigilance as long as you control a Jace planeswalker (token or card), and not otherwise', () => {
    const none = game({ p1: { battlefield: ['mind-meanderer'] } });
    expect(keywords(none, none.id('p1', 'mind-meanderer'))).not.toContain('vigilance');
    const token = game({ p1: { battlefield: ['mind-meanderer', { card: FRA_JACE, loyalty: 1 }] } });
    expect(keywords(token, token.id('p1', 'mind-meanderer'))).toContain('vigilance');
    const card = game({
      p1: { battlefield: ['mind-meanderer', { card: 'test-jace', loyalty: 4 }] },
    });
    expect(keywords(card, card.id('p1', 'mind-meanderer'))).toContain('vigilance');
    const other = game({
      p1: { battlefield: ['mind-meanderer', { card: 'test-garruk', loyalty: 3 }] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
    });
    expect(keywords(other, other.id('p1', 'mind-meanderer'))).not.toContain('vigilance');
  });
});

// ---------------------------------------------------------------------------
// Plan for All Outcomes
// ---------------------------------------------------------------------------

describe('Plan for All Outcomes', () => {
  const cast4 = (g: GameDriver) => cast(g, 'plan-for-all-outcomes');
  const lands = () => n('island', 4);
  const targetsOfTrigger = (g: GameDriver) =>
    g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));

  it('enters: the owner of up to one other target nonland permanent chooses top or bottom of their library', () => {
    const g = game({
      p1: { hand: ['plan-for-all-outcomes'], battlefield: [...lands(), 'bear-cub'] },
      p2: { battlefield: ['bear-cub', 'forest'] },
    });
    cast4(g);
    g.passBoth();
    // Nonland permanents other than the enchantment itself: the two bears (not the Forest, not the Plan).
    expect(targetsOfTrigger(g).sort()).toEqual(all(g, 'bear-cub').sort());
  });

  it('puts your own permanent on top (you choose) or bottom of your library', () => {
    for (const [pattern, where] of [
      [/top/, 0],
      [/bottom/, -1],
    ] as const) {
      const g = game({
        p1: { hand: ['plan-for-all-outcomes'], battlefield: [...lands(), 'bear-cub'] },
        p2: {},
      });
      const bear = g.id('p1', 'bear-cub');
      cast4(g);
      g.passBoth();
      g.do({ type: 'chooseTargets', player: 'p1', targets: [target(g, bear)] });
      g.passBoth();
      expect(g.decision.kind).toBe('chooseOption');
      expect(g.decision.kind === 'chooseOption' && g.decision.player).toBe('p1');
      done(g, { option: pattern });
      expect(g.zoneOf(bear)).toBe('library');
      const library = g.state.players.p1.library;
      expect(library.at(where)).toBe(bear);
    }
  });

  it("the opponent's permanent: its owner (the opponent) makes the choice", () => {
    const g = game({
      p1: { hand: ['plan-for-all-outcomes'], battlefield: lands() },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast4(g);
    g.passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [target(g, bear)] });
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.decision.kind === 'chooseOption' && g.decision.player).toBe('p2');
    done(g, { option: /bottom/ });
    expect(g.state.players.p2.library.at(-1)).toBe(bear);
  });

  it('a token put into a library ceases to exist', () => {
    const g = game({
      p1: {
        hand: ['plan-for-all-outcomes'],
        battlefield: [...lands(), { card: FRA_JACE, loyalty: 2 }],
      },
    });
    const jace = jaces(g)[0]!;
    cast4(g);
    g.passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [target(g, jace)] });
    g.passBoth();
    done(g);
    expect(jaces(g)).toHaveLength(0);
    expect(g.state.players.p1.library).not.toContain(jace);
  });

  it('"up to one": with no target nothing happens', () => {
    const g = game({
      p1: { hand: ['plan-for-all-outcomes'], battlefield: [...lands(), 'bear-cub'] },
    });
    cast4(g);
    g.passBoth();
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.decision.kind).toBe('priority');
  });

  it('whenever you cast your first noncreature spell each turn, empower Jace 1 (not the turn it is cast)', () => {
    const g = game({
      p1: {
        hand: ['test-gain-2', 'test-gain-2', 'test-gain-2', 'bear-cub'],
        battlefield: ['plan-for-all-outcomes', ...n('forest', 3)],
      },
    });
    // A creature spell does not trigger it.
    cast(g, 'bear-cub');
    done(g);
    expect(jaces(g)).toHaveLength(0);
    cast(g, 'test-gain-2');
    // It resolves before the spell that caused it.
    expect(g.state.stack).toHaveLength(2);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
    // The second noncreature spell does not.
    cast(g, 'test-gain-2');
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
    // Next turn, again.
    passTo(g, 'main1', 'p1');
    cast(g, 'test-gain-2');
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
  });

  it('the turn it is cast, its second ability does not trigger for the spell that cast it', () => {
    const g = game({ p1: { hand: ['plan-for-all-outcomes'], battlefield: lands() } });
    cast4(g);
    g.passBoth();
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(jaces(g)).toHaveLength(0);
  });

  it('does not trigger for an opponent noncreature spell', () => {
    const g = game({
      p1: { battlefield: ['plan-for-all-outcomes'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.pass();
    cast(g, 'shock', [player('p1')]);
    done(g);
    expect(jaces(g)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rewrite Regrets
// ---------------------------------------------------------------------------

describe('Rewrite Regrets', () => {
  const lands = () => [...n('swamp', 4)];
  const graveyardTargets = (g: GameDriver) =>
    g
      .legal()
      .flatMap((a) =>
        a.type === 'castSpell' && a.card === g.id('p1', 'rewrite-regrets', 'hand') ? a.targets : [],
      )
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : ''));

  it('returns a creature card with mana value 6 or less from your graveyard to the battlefield, then empowers Jace 2', () => {
    const g = game({
      p1: { hand: ['rewrite-regrets'], battlefield: lands(), graveyard: ['bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub', 'graveyard');
    cast(g, 'rewrite-regrets', [target(g, bear)]);
    done(g);
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.obj(bear).controller).toBe('p1');
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
  });

  it('can return a planeswalker card, which enters with its loyalty counters (not "put": no Tethermage trigger)', () => {
    const g = game({
      p1: {
        hand: ['rewrite-regrets'],
        battlefield: [...lands(), 'inspired-tethermage'],
        graveyard: ['test-jace'],
      },
    });
    const jace = g.id('p1', 'test-jace', 'graveyard');
    cast(g, 'rewrite-regrets', [target(g, jace)]);
    done(g);
    expect(g.zoneOf(jace)).toBe('battlefield');
    expect(loyalty(g, jace)).toBe(4);
    // Only Empower Jace's counters (two on the new token) are put: one trigger.
    expect(g.obj(g.id('p1', 'inspired-tethermage')).plusOneCounters).toBe(1);
  });

  it('only creature and planeswalker cards with mana value 6 or less, only from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['rewrite-regrets'],
        battlefield: lands(),
        graveyard: ['bear-cub', 'test-big-creature', 'test-big-walker', 'forest', 'shock'],
      },
      p2: { graveyard: ['test-jace'] },
    });
    expect(graveyardTargets(g)).toEqual(['bear-cub']);
  });

  it('with no legal target it can not be cast', () => {
    const g = game({
      p1: { hand: ['rewrite-regrets'], battlefield: lands(), graveyard: ['test-big-creature'] },
    });
    expect(graveyardTargets(g)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Teyo, Diamondblade Mage and Teyo, Lightshield Expert
// ---------------------------------------------------------------------------

describe.each([
  ['teyo-diamondblade-mage', 'deathtouch', ['swamp', 'swamp', 'swamp', 'swamp']],
  ['teyo-lightshield-expert', 'hexproof', ['plains', 'plains']],
] as const)('%s', (teyo, keyword, mana) => {
  const lands = () => [...mana];
  /** Casts Teyo (it has flash) and puts its enters trigger on `permanent`. */
  const enter = (g: GameDriver, permanent: string) => {
    cast(g, teyo);
    g.passBoth();
    const pick = g
      .legal()
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.length === 1 &&
          'object' in a.targets[0]! &&
          a.targets[0].object.id === permanent,
      );
    expect(pick).toBeDefined();
    g.do(pick!);
    done(g);
  };

  it('is a legendary creature with flash, and can be cast on the opponent turn', () => {
    const d = db.get(teyo)!;
    expect(d.keywords).toContain('flash');
    expect(d.supertypes).toContain('Legendary');
    const g = game({ p2: { hand: [teyo], battlefield: lands() }, active: 'p1' });
    g.pass();
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it(`target creature gains ${keyword} until end of turn and gets a +1/+1 counter`, () => {
    const g = game({ p1: { hand: [teyo], battlefield: [...lands(), 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    enter(g, bear);
    expect(keywords(g, bear)).toContain(keyword);
    expect(g.obj(bear).plusOneCounters).toBe(1);
    passTo(g, 'main1', 'p1');
    expect(keywords(g, bear)).not.toContain(keyword);
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });

  it(`target planeswalker gains ${keyword} and a loyalty counter (no +1/+1 counter)`, () => {
    const g = game({
      p1: { hand: [teyo], battlefield: [...lands(), { card: 'test-jace', loyalty: 4 }] },
    });
    const jace = g.id('p1', 'test-jace');
    enter(g, jace);
    expect(keywords(g, jace)).toContain(keyword);
    expect(loyalty(g, jace)).toBe(5);
    expect(g.obj(jace).plusOneCounters).toBe(0);
  });

  it('target noncreature nonplaneswalker permanent: just the keyword', () => {
    const g = game({ p1: { hand: [teyo], battlefield: [...lands(), 'forest'] } });
    // The Forest that is not one of the lands paying for Teyo.
    const forest = g.id('p1', 'forest');
    enter(g, forest);
    expect(keywords(g, forest)).toContain(keyword);
    expect(g.obj(forest).plusOneCounters).toBe(0);
    expect(g.obj(forest).counters?.loyalty).toBeUndefined();
  });

  it('can target Teyo itself: it becomes a 2/2 with a +1/+1 counter', () => {
    const g = game({ p1: { hand: [teyo], battlefield: lands() } });
    cast(g, teyo);
    g.passBoth();
    const self = g.id('p1', teyo);
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            'object' in a.targets[0]! &&
            a.targets[0].object.id === self,
        )!,
    );
    done(g);
    expect(g.obj(self).plusOneCounters).toBe(1);
    expect(keywords(g, self)).toContain(keyword);
  });

  it('only permanents you control can be targeted', () => {
    const g = game({
      p1: { hand: [teyo], battlefield: [...lands(), 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, teyo);
    g.passBoth();
    const ids = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).controller : ''));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((c) => c === 'p1')).toBe(true);
  });

  it('the loyalty counter is one you put: it triggers Inspired Tethermage', () => {
    const g = game({
      p1: {
        hand: [teyo],
        battlefield: [...lands(), 'inspired-tethermage', { card: 'test-jace', loyalty: 4 }],
      },
    });
    enter(g, g.id('p1', 'test-jace'));
    expect(g.obj(g.id('p1', 'inspired-tethermage')).plusOneCounters).toBe(1);
  });
});

describe('Teyo, Lightshield Expert: hexproof protects the permanent', () => {
  it('an opponent can not target the planeswalker or creature that gained hexproof', () => {
    const g = game({
      p1: {
        hand: ['teyo-lightshield-expert'],
        battlefield: ['plains', 'plains', { card: 'test-jace', loyalty: 4 }, 'bear-cub'],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const jace = g.id('p1', 'test-jace');
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'teyo-lightshield-expert');
    g.passBoth();
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            'object' in a.targets[0]! &&
            a.targets[0].object.id === jace,
        )!,
    );
    g.passBoth();
    // Now p2 holds priority with Shock: Jace is no legal target, the unprotected bear is.
    g.pass();
    const hit = g
      .legal()
      .flatMap((a) =>
        a.type === 'castSpell' && a.card === g.id('p2', 'shock', 'hand') ? a.targets : [],
      )
      .flatMap((t) => ('object' in t ? [t.object.id] : []));
    expect(hit).toContain(bear);
    expect(hit).not.toContain(jace);
  });
});

describe('Teyo, Diamondblade Mage: deathtouch matters in combat', () => {
  it('the creature kills a bigger blocker', () => {
    const g = game({
      p1: { hand: ['teyo-diamondblade-mage'], battlefield: [...n('swamp', 4), 'bear-cub'] },
      p2: { battlefield: ['test-ox'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'teyo-diamondblade-mage');
    g.passBoth();
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            'object' in a.targets[0]! &&
            a.targets[0].object.id === bear,
        )!,
    );
    done(g);
    g.passUntilStep('beginCombat').passBoth();
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    g.pass();
    g.pass();
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'test-ox'), attacker: bear });
    g.do({ type: 'confirmBlockers', player: 'p2' });
    g.passUntilStep('main2');
    expect(all(g, 'test-ox')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tomik, Orzhov Lawmage
// ---------------------------------------------------------------------------

describe('Tomik, Orzhov Lawmage', () => {
  const attackers = (g: GameDriver) => {
    g.passUntilStep('beginCombat').passBoth();
    return all(g, 'bear-cub');
  };
  const canAttack = (g: GameDriver, attacker: string, walker: string) =>
    g
      .legal()
      .some(
        (a) => a.type === 'addAttacker' && a.attacker === attacker && a.planeswalker === walker,
      );
  const toWalker = (g: GameDriver, attacker: string, walker: string) =>
    g.do({ type: 'addAttacker', player: 'p2', attacker, defender: 'p1', planeswalker: walker });

  it('is a flier', () => {
    const g = game({ p1: { battlefield: ['tomik-orzhov-lawmage'] } });
    expect(keywords(g, g.id('p1', 'tomik-orzhov-lawmage'))).toContain('flying');
  });

  it('no more than one creature can attack each planeswalker you control (each one on its own)', () => {
    const g = game({
      p1: {
        battlefield: [
          'tomik-orzhov-lawmage',
          { card: FRA_JACE, loyalty: 4 },
          { card: 'test-garruk', loyalty: 3 },
        ],
      },
      p2: { battlefield: ['bear-cub', 'bear-cub', 'bear-cub'] },
      active: 'p2',
    });
    const [a, b, c] = attackers(g) as [string, string, string];
    const jace = jaces(g)[0]!;
    const garruk = g.id('p1', 'test-garruk');
    expect(canAttack(g, a, jace)).toBe(true);
    toWalker(g, a, jace);
    // A second creature can not attack the same planeswalker, but another one or the player is fine.
    expect(canAttack(g, b, jace)).toBe(false);
    expect(canAttack(g, b, garruk)).toBe(true);
    toWalker(g, b, garruk);
    expect(canAttack(g, c, garruk)).toBe(false);
    expect(canAttack(g, c, jace)).toBe(false);
    expect(
      g
        .legal()
        .some((x) => x.type === 'addAttacker' && x.attacker === c && x.planeswalker === undefined),
    ).toBe(true);
  });

  it('the attacker already attacking it can be re-declared (moved away) and another may take its place', () => {
    const g = game({
      p1: { battlefield: ['tomik-orzhov-lawmage', { card: FRA_JACE, loyalty: 4 }] },
      p2: { battlefield: ['bear-cub', 'bear-cub'] },
      active: 'p2',
    });
    const [a, b] = attackers(g) as [string, string];
    const jace = jaces(g)[0]!;
    toWalker(g, a, jace);
    expect(canAttack(g, a, jace)).toBe(false); // already attacking it
    expect(canAttack(g, b, jace)).toBe(false);
    g.do({ type: 'removeAttacker', player: 'p2', attacker: a });
    expect(canAttack(g, b, jace)).toBe(true);
  });

  it('without Tomik any number of creatures can attack a planeswalker', () => {
    const g = game({
      p1: { battlefield: [{ card: FRA_JACE, loyalty: 4 }] },
      p2: { battlefield: ['bear-cub', 'bear-cub'] },
      active: 'p2',
    });
    const [a, b] = attackers(g) as [string, string];
    toWalker(g, a, jaces(g)[0]!);
    expect(canAttack(g, b, jaces(g)[0]!)).toBe(true);
  });

  it("Tomik's controller's planeswalkers only: the opponent's walkers are not protected", () => {
    const g = game({
      p1: { battlefield: ['tomik-orzhov-lawmage', 'bear-cub', 'bear-cub'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 4 }] },
    });
    g.passUntilStep('beginCombat').passBoth();
    const [a, b] = all(g, 'bear-cub') as [string, string];
    const jace = jaces(g, 'p2')[0]!;
    g.do({ type: 'addAttacker', player: 'p1', attacker: a, defender: 'p2', planeswalker: jace });
    expect(
      g
        .legal()
        .some((x) => x.type === 'addAttacker' && x.attacker === b && x.planeswalker === jace),
    ).toBe(true);
  });

  it('{T}: target creature with a +1/+1 counter on it gains flying until end of turn', () => {
    const g = game({
      p1: { battlefield: ['tomik-orzhov-lawmage', 'bear-cub', 'bear-cub'] },
    });
    const [grown, plain] = all(g, 'bear-cub') as [string, string];
    g.obj(grown).plusOneCounters = 1;
    const tomik = g.id('p1', 'tomik-orzhov-lawmage');
    const targets = g
      .legal()
      .flatMap((a) => (a.type === 'activateAbility' && a.source === tomik ? a.targets : []))
      .map((t) => ('object' in t ? t.object.id : ''));
    expect(targets.sort()).toEqual([grown].sort()); // Tomik has no counter, the plain bear neither
    activate(g, tomik, 1, [target(g, grown)]);
    done(g);
    expect(g.obj(tomik).tapped).toBe(true);
    expect(keywords(g, grown)).toContain('flying');
    expect(keywords(g, plain)).not.toContain('flying');
    passTo(g, 'main1', 'p1');
    expect(keywords(g, grown)).not.toContain('flying');
  });
});

// ---------------------------------------------------------------------------
// Violent Echoes
// ---------------------------------------------------------------------------

describe('Violent Echoes', () => {
  const lands = () => n('mountain', 4);

  it('deals 6 damage to a creature; the excess is empowered into Jace (a new token gets that many)', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'bear-cub'))]);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    // 6 damage to a 2/2: 4 excess.
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('damage already marked counts toward lethal, so it is more excess', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: [{ card: 'bear-cub', damage: 1 }] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'bear-cub'))]);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(5);
  });

  it('no excess (exactly lethal or more toughness): no Jace', () => {
    const g = game({
      p1: { hand: ['violent-echoes', 'violent-echoes'], battlefield: [...lands(), ...lands()] },
      p2: { battlefield: ['test-ox'] },
    });
    // 4/6: exactly lethal.
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'test-ox'))]);
    done(g);
    expect(all(g, 'test-ox')).toHaveLength(0);
    expect(jaces(g)).toHaveLength(0);
  });

  it('a creature that survives gets no excess', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: ['test-big-creature'] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'test-big-creature'))]);
    done(g);
    expect(all(g, 'test-big-creature')).toHaveLength(1);
    expect(jaces(g)).toHaveLength(0);
  });

  it('for a planeswalker the excess is damage beyond its loyalty', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: [{ card: 'test-garruk', loyalty: 2 }] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'test-garruk'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'test-garruk', 'graveyard'))).toBe('graveyard');
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
    // A planeswalker with more loyalty than 6 survives with none.
    const h = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 9 }] },
    });
    cast(h, 'violent-echoes', [target(h, jaces(h, 'p2')[0]!)]);
    done(h);
    expect(loyalty(h, jaces(h, 'p2')[0]!)).toBe(3);
    expect(jaces(h, 'p1')).toHaveLength(0);
  });

  it('exactly lethal to a planeswalker: no excess, no empower', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: [{ card: 'test-big-walker', loyalty: 6 }] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'test-big-walker'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'test-big-walker', 'graveyard'))).toBe('graveyard');
    expect(jaces(g)).toHaveLength(0);
  });

  it('can only target creatures and planeswalkers', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: lands() },
      p2: { battlefield: ['bear-cub', 'forest', { card: FRA_JACE, loyalty: 1 }] },
    });
    const ids = g
      .legal()
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []))
      .map((t) => ('object' in t ? t.object.id : 'player'));
    expect(ids.sort()).toEqual([g.id('p2', 'bear-cub'), jaces(g, 'p2')[0]!].sort());
  });

  it('with an existing Jace token the excess goes on it (empower never makes a second token)', () => {
    const g = game({
      p1: { hand: ['violent-echoes'], battlefield: [...lands(), { card: FRA_JACE, loyalty: 2 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'violent-echoes', [target(g, g.id('p2', 'bear-cub'))]);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// The Way of the ... cycle
// ---------------------------------------------------------------------------

describe('the ten Ways: legendary enchantments that empower Jace and grant or watch loyalty', () => {
  const WAYS = [
    ['way-of-the-cryomancer', 5],
    ['way-of-the-deathbringer', 5],
    ['way-of-the-healer', 5],
    ['way-of-the-mentor', 5],
    ['way-of-the-mind-sculptor', 5],
    ['way-of-the-necromancer', 2],
    ['way-of-the-paradox', 5],
    ['way-of-the-pyromancer', 2],
    ['way-of-the-warlord', 5],
    ['way-of-the-wildspeaker', 7],
  ] as const;

  it.each(WAYS)(
    '%s is a legendary enchantment that empowers Jace %i as it enters',
    (way, amount) => {
      const d = db.get(way)!;
      expect(d.types).toEqual(['Enchantment']);
      expect(d.supertypes).toEqual(['Legendary']);
      const g = game({
        p1: {
          hand: [way],
          battlefield: [
            ...n('plains', 6),
            ...n('island', 6),
            ...n('swamp', 6),
            ...n('mountain', 6),
            ...n('forest', 6),
          ],
        },
      });
      cast(g, way);
      done(g);
      expect(jaces(g)).toHaveLength(1);
      expect(loyalty(g, jaces(g)[0]!)).toBe(amount);
    },
  );

  it('the Empower Jace goes on the existing Jace token (no second token)', () => {
    const g = game({
      p1: {
        hand: ['way-of-the-warlord'],
        battlefield: [{ card: FRA_JACE, loyalty: 2 }, ...n('mountain', 3)],
      },
    });
    cast(g, 'way-of-the-warlord');
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(7);
  });

  it('each Way gives every planeswalker its controller has the granted ability, and nobody else', () => {
    const g = game({
      p1: {
        battlefield: [
          'way-of-the-healer',
          { card: FRA_JACE, loyalty: 3 },
          { card: 'test-garruk', loyalty: 3 },
        ],
      },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
    });
    const healer = /Create a 2\/2 colorless Wizard Soldier creature token named Cadet/;
    expect(canActivate(g, jaces(g, 'p1')[0]!, healer)).toBe(true);
    expect(canActivate(g, g.id('p1', 'test-garruk'), healer)).toBe(true);
    expect(getAbilities(g.state, db, jaces(g, 'p2')[0]!)).toHaveLength(2);
  });

  it('loyalty abilities are once per turn for each planeswalker, however many it has gained', () => {
    const g = game({
      p1: {
        battlefield: [
          'way-of-the-healer',
          'way-of-the-wildspeaker',
          { card: FRA_JACE, loyalty: 9 },
        ],
      },
    });
    const jace = jaces(g)[0]!;
    activate(g, jace, /Cadet/);
    done(g);
    expect(canActivate(g, jace, /Beast/)).toBe(false);
    expect(canActivate(g, jace, /Surveil 1$/)).toBe(false);
  });

  describe('Way of the Cryomancer', () => {
    const setup = () =>
      game({
        p1: {
          hand: ['shock', 'shock', 'bear-cub'],
          battlefield: [
            'way-of-the-cryomancer',
            { card: FRA_JACE, loyalty: 4 },
            ...n('mountain', 4),
            ...n('forest', 2),
          ],
        },
        p2: { battlefield: ['bear-cub', 'test-ox'] },
      });
    const cryo = /When you next cast an instant or sorcery spell this turn, copy that spell/;

    it('−3: when you next cast an instant or sorcery spell this turn, copy it; you may choose new targets', () => {
      const g = setup();
      const jace = jaces(g)[0]!;
      activate(g, jace, cryo);
      done(g);
      expect(loyalty(g, jace)).toBe(1);
      const bear = g.id('p2', 'bear-cub');
      const ox = g.id('p2', 'test-ox');
      cast(g, 'shock', [target(g, bear)]);
      // The trigger goes on the stack above the spell; resolving it makes the copy.
      expect(g.state.stack).toHaveLength(2);
      g.passBoth();
      // "You may choose new targets": a choice of keeping them or picking another legal target.
      expect(g.decision.kind).toBe('chooseOption');
      if (g.decision.kind !== 'chooseOption') return;
      expect(g.decision.options[0]!.label).toBe('Keep the same targets');
      expect(g.decision.options.length).toBeGreaterThan(2);
      g.do({ type: 'chooseOption', player: 'p1', index: 0 });
      // The copy (same target) and the spell: two Shocks on the stack.
      expect(g.state.stack.filter((x) => x.kind === 'spell')).toHaveLength(2);
      expect(
        g.state.stack.filter((x) => x.kind === 'spell').every((x) => x.targets.length === 1),
      ).toBe(true);
      done(g);
      expect(all(g, 'bear-cub').filter((id) => g.obj(id).controller === 'p2')).toHaveLength(0);
      void ox;
    });

    it('the copy can take a new target', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, cryo);
      done(g);
      const bear = g.id('p2', 'bear-cub');
      const ox = g.id('p2', 'test-ox');
      cast(g, 'shock', [target(g, bear)]);
      g.passBoth();
      const d = g.decision;
      expect(d.kind).toBe('chooseOption');
      if (d.kind !== 'chooseOption') return;
      const i = d.options.findIndex((o, k) => k > 0 && o.label.includes('test-ox'));
      expect(i, d.options.map((o) => o.label).join(' | ')).toBeGreaterThan(0);
      g.do({ type: 'chooseOption', player: 'p1', index: i });
      const spells = g.state.stack.filter((x) => x.kind === 'spell');
      expect(spells).toHaveLength(2);
      // The original keeps its target; the copy (on top) hits the Ox.
      expect(spells[0]!.targets).toEqual([target(g, bear)]);
      expect(spells[1]!.targets).toEqual([target(g, ox)]);
      expect(spells[1]!.copy).toBe(true);
    });

    it('a copy is not cast: no second copy; only the next instant or sorcery is copied', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, cryo);
      done(g);
      cast(g, 'shock', [target(g, g.id('p2', 'bear-cub'))]);
      g.passBoth();
      g.do({ type: 'chooseOption', player: 'p1', index: 0 });
      expect(g.state.stack.filter((x) => x.kind === 'spell')).toHaveLength(2);
      done(g);
      // The second Shock is not copied (the delayed trigger is used up).
      cast(g, 'shock', [target(g, g.id('p2', 'test-ox'))]);
      expect(g.state.stack).toHaveLength(1);
    });

    it('a creature spell is not an instant or sorcery: the trigger waits', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, cryo);
      done(g);
      cast(g, 'bear-cub');
      expect(g.state.stack).toHaveLength(1);
      done(g);
      cast(g, 'shock', [target(g, g.id('p2', 'test-ox'))]);
      expect(g.state.stack).toHaveLength(2);
    });

    it('only this turn', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, cryo);
      done(g);
      passTo(g, 'main1', 'p1');
      g.state.players.p1.hand.push(g.id('p1', 'shock', 'hand'));
      cast(g, 'shock', [player('p2')]);
      expect(g.state.stack).toHaveLength(1);
    });

    it('an opponent spell is not copied for you', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-cryomancer', { card: FRA_JACE, loyalty: 4 }] },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
      });
      activate(g, jaces(g)[0]!, cryo);
      done(g);
      g.pass();
      cast(g, 'shock', [player('p1')]);
      expect(g.state.stack).toHaveLength(1);
    });
  });

  describe('Way of the Deathbringer', () => {
    const label =
      /You may sacrifice a creature\. If you do, create a 4\/4 green Beast creature token with trample/;
    it('−2: you may sacrifice a creature; if you do, create a 4/4 green Beast with trample', () => {
      const g = game({
        p1: {
          battlefield: ['way-of-the-deathbringer', { card: FRA_JACE, loyalty: 3 }, 'bear-cub'],
        },
      });
      const bear = g.id('p1', 'bear-cub');
      activate(g, jaces(g)[0]!, label);
      done(g);
      expect(g.zoneOf(bear)).toBe('graveyard');
      const [beast] = all(g, 'fra-green-beast-token');
      expect(beast).toBeDefined();
      expect(pt(g, beast!)).toEqual([4, 4]);
      expect(keywords(g, beast!)).toContain('trample');
      expect(db.get('fra-green-beast-token')!.colors).toEqual(['G']);
      expect(db.get('fra-green-beast-token')!.subtypes).toEqual(['Beast']);
    });

    it('you can decline to sacrifice: no Beast', () => {
      const g = game({
        p1: {
          battlefield: ['way-of-the-deathbringer', { card: FRA_JACE, loyalty: 3 }, 'bear-cub'],
        },
      });
      activate(g, jaces(g)[0]!, label);
      expect(g.decision.kind).toBe('priority');
      g.passBoth();
      expect(g.decision.kind).toBe('optionalEffect');
      g.do({ type: 'chooseEffect', player: 'p1', accept: false });
      expect(all(g, 'bear-cub')).toHaveLength(1);
      expect(all(g, 'fra-green-beast-token')).toHaveLength(0);
    });

    it('you choose which creature; with no creature nothing is asked', () => {
      const g = game({
        p1: {
          battlefield: [
            'way-of-the-deathbringer',
            { card: FRA_JACE, loyalty: 3 },
            'bear-cub',
            'test-ox',
          ],
        },
      });
      activate(g, jaces(g)[0]!, label);
      g.passBoth();
      g.do({ type: 'chooseEffect', player: 'p1', accept: true });
      expect(g.decision.kind).toBe('sacrificeSeveral');
      if (g.decision.kind !== 'sacrificeSeveral') return;
      expect(g.decision.options.sort()).toEqual(
        [g.id('p1', 'bear-cub'), g.id('p1', 'test-ox')].sort(),
      );
      g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'test-ox') });
      done(g);
      expect(all(g, 'test-ox')).toHaveLength(0);
      expect(all(g, 'bear-cub')).toHaveLength(1);
      const none = game({
        p1: { battlefield: ['way-of-the-deathbringer', { card: FRA_JACE, loyalty: 3 }] },
      });
      activate(none, jaces(none)[0]!, label);
      done(none);
      expect(all(none, 'fra-green-beast-token')).toHaveLength(0);
    });

    it('the Beast is not made if the creature could not be sacrificed (an opponent creature is not an option)', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-deathbringer', { card: FRA_JACE, loyalty: 3 }] },
        p2: { battlefield: ['bear-cub'] },
      });
      activate(g, jaces(g)[0]!, label);
      done(g);
      expect(all(g, 'bear-cub')).toHaveLength(1);
      expect(all(g, 'fra-green-beast-token')).toHaveLength(0);
    });
  });

  describe('Way of the Healer', () => {
    it('−2: create a 2/2 colorless Wizard Soldier token named Cadet, then surveil 1', () => {
      const g = game({
        p1: {
          battlefield: ['way-of-the-healer', { card: FRA_JACE, loyalty: 3 }],
          library: ['bear-cub', 'forest', 'forest'],
        },
      });
      activate(g, jaces(g)[0]!, /Cadet/);
      g.passBoth();
      const cadet = all(g, 'fra-cadet-token')[0]!;
      expect(g.obj(cadet).isToken).toBe(true);
      expect(pt(g, cadet)).toEqual([2, 2]);
      // Surveil 1: put the Bear Cub into the graveyard.
      expect(g.decision.kind).toBe('scry');
      if (g.decision.kind !== 'scry') return;
      g.do({ type: 'scry', player: 'p1', top: [], bottom: g.decision.cards });
      expect(gy(g)).toEqual(['bear-cub']);
      expect(loyalty(g, jaces(g)[0]!)).toBe(1);
    });
  });

  describe('Way of the Mentor', () => {
    it('whenever you gain life, put a loyalty counter on each planeswalker you control', () => {
      const g = game({
        p1: {
          hand: ['test-gain-2'],
          battlefield: [
            'way-of-the-mentor',
            { card: FRA_JACE, loyalty: 1 },
            { card: 'test-garruk', loyalty: 3 },
            'bear-cub',
          ],
        },
        p2: { battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
      });
      cast(g, 'test-gain-2');
      done(g);
      expect(g.life('p1')).toBe(22);
      expect(loyalty(g, jaces(g, 'p1')[0]!)).toBe(2);
      expect(loyalty(g, g.id('p1', 'test-garruk'))).toBe(4);
      expect(loyalty(g, jaces(g, 'p2')[0]!)).toBe(1);
      expect(g.obj(g.id('p1', 'bear-cub')).counters?.loyalty).toBeUndefined();
    });

    it('each life gain is a trigger; the opponent gaining life does nothing', () => {
      const g = game({
        p1: {
          hand: ['test-gain-2', 'test-gain-2'],
          battlefield: ['way-of-the-mentor', { card: FRA_JACE, loyalty: 1 }],
        },
      });
      cast(g, 'test-gain-2');
      done(g);
      cast(g, 'test-gain-2');
      done(g);
      expect(loyalty(g, jaces(g)[0]!)).toBe(3);
      const h = game({
        p1: { battlefield: ['way-of-the-mentor', { card: FRA_JACE, loyalty: 1 }] },
        p2: { hand: ['test-gain-2'] },
        active: 'p2',
      });
      cast(h, 'test-gain-2');
      done(h);
      expect(loyalty(h, jaces(h)[0]!)).toBe(1);
    });

    it("one lifelink creature's combat damage: a trigger for it", () => {
      const g = game({
        p1: { battlefield: ['way-of-the-mentor', { card: FRA_JACE, loyalty: 1 }, 'bear-cub'] },
      });
      g.obj(g.id('p1', 'bear-cub')).grantedKeywords = ['lifelink'];
      g.passUntilStep('beginCombat').passBoth();
      g.do({ type: 'addAttacker', player: 'p1', attacker: g.id('p1', 'bear-cub'), defender: 'p2' });
      g.do({ type: 'confirmAttackers', player: 'p1' });
      g.passUntilStep('main2');
      done(g);
      expect(g.life('p1')).toBe(22);
      expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    });
  });

  describe('Way of the Mind Sculptor', () => {
    it('whenever you activate a loyalty ability and removed two or more counters, draw a card', () => {
      const g = game({
        p1: {
          battlefield: ['way-of-the-mind-sculptor', { card: FRA_JACE, loyalty: 5 }],
        },
      });
      const before = hand(g).length;
      activate(g, jaces(g)[0]!, /Draw a card/);
      // The trigger resolves before the ability.
      g.passBoth();
      expect(hand(g).length).toBe(before + 1);
      expect(g.state.stack).toHaveLength(1);
      done(g);
      expect(hand(g).length).toBe(before + 2);
    });

    it('not for removing one counter, adding counters, or an opponent activating', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-mind-sculptor', { card: FRA_JACE, loyalty: 5 }] },
      });
      const before = hand(g).length;
      activate(g, jaces(g)[0]!, /Surveil 1/);
      done(g);
      expect(hand(g).length).toBe(before);
      const h = game({
        p1: { battlefield: ['way-of-the-mind-sculptor', { card: 'test-jace', loyalty: 4 }] },
      });
      const b = hand(h).length;
      activate(h, h.id('p1', 'test-jace'), /\+1/);
      done(h);
      expect(hand(h).length).toBe(b);
      const o = game({
        p1: { battlefield: ['way-of-the-mind-sculptor'] },
        p2: { battlefield: [{ card: FRA_JACE, loyalty: 5 }] },
        active: 'p2',
      });
      const c = hand(o, 'p1').length;
      activate(o, jaces(o, 'p2')[0]!, /Draw a card/);
      done(o);
      expect(hand(o, 'p1').length).toBe(c);
    });
  });

  describe('Way of the Necromancer', () => {
    it('whenever a creature you control dies, put a loyalty counter on each planeswalker you control', () => {
      const g = game({
        p1: {
          hand: ['shock'],
          battlefield: [
            'way-of-the-necromancer',
            { card: FRA_JACE, loyalty: 1 },
            { card: 'test-garruk', loyalty: 3 },
            'bear-cub',
            ...n('mountain', 1),
          ],
        },
        p2: { battlefield: ['bear-cub', { card: FRA_JACE, loyalty: 1 }] },
      });
      cast(g, 'shock', [target(g, g.id('p1', 'bear-cub'))]);
      done(g);
      expect(all(g, 'bear-cub').filter((id) => g.obj(id).controller === 'p1')).toHaveLength(0);
      expect(loyalty(g, jaces(g, 'p1')[0]!)).toBe(2);
      expect(loyalty(g, g.id('p1', 'test-garruk'))).toBe(4);
      expect(loyalty(g, jaces(g, 'p2')[0]!)).toBe(1);
    });

    it('a creature an opponent controls dying does nothing; a token you control counts', () => {
      const g = game({
        p1: {
          hand: ['shock'],
          battlefield: [
            'way-of-the-necromancer',
            { card: FRA_JACE, loyalty: 1 },
            ...n('mountain', 1),
          ],
        },
        p2: { battlefield: ['bear-cub'] },
      });
      cast(g, 'shock', [target(g, g.id('p2', 'bear-cub'))]);
      done(g);
      expect(loyalty(g, jaces(g)[0]!)).toBe(1);
      const h = game({
        p1: {
          hand: ['shock'],
          battlefield: [
            'way-of-the-necromancer',
            { card: FRA_JACE, loyalty: 1 },
            'mountain',
            'bear-cub',
          ],
        },
      });
      const cub = h.id('p1', 'bear-cub');
      h.obj(cub).isToken = true;
      cast(h, 'shock', [target(h, cub)]);
      done(h);
      expect(loyalty(h, jaces(h)[0]!)).toBe(2);
    });
  });

  describe('Way of the Paradox', () => {
    it('whenever you activate a loyalty ability, gain 1 life and you may play an additional land this turn', () => {
      const g = game({
        p1: {
          hand: ['forest', 'forest', 'forest'],
          battlefield: ['way-of-the-paradox', { card: FRA_JACE, loyalty: 3 }],
        },
      });
      const lands = () => g.legal().filter((a) => a.type === 'playLand').length;
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
      expect(lands()).toBe(0);
      activate(g, jaces(g)[0]!, /Surveil 1/);
      done(g);
      expect(g.life('p1')).toBe(21);
      expect(lands()).toBeGreaterThan(0);
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
      expect(lands()).toBe(0);
    });

    it('each activation (on different walkers) is its own trigger; an opponent activating does nothing', () => {
      const g = game({
        p1: {
          battlefield: [
            'way-of-the-paradox',
            { card: FRA_JACE, loyalty: 3 },
            { card: 'test-jace', loyalty: 4 },
          ],
        },
      });
      activate(g, jaces(g)[0]!, /Surveil 1/);
      done(g);
      activate(g, g.id('p1', 'test-jace'), /\+1/);
      done(g);
      expect(g.life('p1')).toBe(20 + 1 + 1 + 1);
      const h = game({
        p1: { battlefield: ['way-of-the-paradox'] },
        p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
        active: 'p2',
      });
      activate(h, jaces(h, 'p2')[0]!, /Surveil 1/);
      done(h);
      expect(h.life('p1')).toBe(20);
    });
  });

  describe('Way of the Pyromancer', () => {
    it('+1: add {R} (a loyalty ability, so it uses the stack and the counter goes up)', () => {
      const g = game({
        p1: {
          hand: ['shock'],
          battlefield: ['way-of-the-pyromancer', { card: FRA_JACE, loyalty: 2 }],
        },
        p2: { battlefield: ['bear-cub'] },
      });
      const jace = jaces(g)[0]!;
      activate(g, jace, /\+1: Add \{R\}/);
      expect(loyalty(g, jace)).toBe(3);
      expect(g.state.stack).toHaveLength(1); // not a mana ability
      expect(g.state.players.p1.pool?.length ?? 0).toBe(0);
      g.passBoth();
      // It resolved: one red mana is floating (the ability does not use the mana ability path).
      expect(g.state.players.p1.pool?.map((m) => m.produces)).toEqual([['R']]);
      // The red mana pays for Shock.
      cast(g, 'shock', [target(g, g.id('p2', 'bear-cub'))]);
      done(g);
      expect(all(g, 'bear-cub')).toHaveLength(0);
    });

    it('works on a nontoken planeswalker too; once per turn per planeswalker', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-pyromancer', { card: 'test-garruk', loyalty: 3 }] },
      });
      const garruk = g.id('p1', 'test-garruk');
      expect(canActivate(g, garruk, /Add \{R\}/)).toBe(true);
      activate(g, garruk, /Add \{R\}/);
      g.passBoth();
      expect(canActivate(g, garruk, /Add \{R\}/)).toBe(false);
      expect(canActivate(g, garruk, /\+1: You gain 1 life/)).toBe(false);
    });
  });

  describe('Way of the Warlord', () => {
    const label =
      /This planeswalker deals 2 damage to up to one target creature or planeswalker and 2 damage to target player/;
    const setup = () =>
      game({
        p1: {
          battlefield: ['way-of-the-warlord', { card: FRA_JACE, loyalty: 6 }],
        },
        p2: { battlefield: ['bear-cub', 'test-ox', { card: 'test-garruk', loyalty: 3 }] },
      });
    const options = (g: GameDriver) => {
      const i = abilityIndex(g, jaces(g)[0]!, label);
      return g
        .legal()
        .flatMap((a) =>
          a.type === 'activateAbility' && a.source === jaces(g)[0]! && a.abilityIndex === i
            ? [a.targets]
            : [],
        );
    };

    it('−4: 2 damage to target player and to up to one target creature or planeswalker', () => {
      const g = setup();
      const jace = jaces(g)[0]!;
      activate(g, jace, label, [player('p2'), target(g, g.id('p2', 'bear-cub'))]);
      done(g);
      expect(g.life('p2')).toBe(18);
      expect(all(g, 'bear-cub')).toHaveLength(0);
      expect(loyalty(g, jace)).toBe(2);
    });

    it('the second target is optional: just the player takes 2', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, label, [player('p2')]);
      done(g);
      expect(g.life('p2')).toBe(18);
      expect(all(g, 'bear-cub')).toHaveLength(1);
    });

    it('the second target can be a planeswalker; the player target can be you', () => {
      const g = setup();
      activate(g, jaces(g)[0]!, label, [player('p1'), target(g, g.id('p2', 'test-garruk'))]);
      done(g);
      expect(g.life('p1')).toBe(18);
      expect(loyalty(g, g.id('p2', 'test-garruk'))).toBe(1);
    });

    it('legal targets: a player first, then optionally a creature or planeswalker (never a land)', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-warlord', { card: FRA_JACE, loyalty: 6 }, 'forest'] },
        p2: { battlefield: ['bear-cub', 'forest'] },
      });
      const opts = options(g);
      const shapes = new Set(opts.map((t) => t.length));
      expect(shapes).toEqual(new Set([1, 2]));
      const seconds = opts.flatMap((t) =>
        t[1] && 'object' in t[1] ? [g.obj(t[1].object.id).defId] : [],
      );
      expect(new Set(seconds)).toEqual(new Set(['bear-cub', FRA_JACE]));
    });

    it('the damage comes from the planeswalker (lifelink-free): it works with a nontoken walker too', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-warlord', { card: 'test-garruk', loyalty: 5 }] },
        p2: {},
      });
      const garruk = g.id('p1', 'test-garruk');
      activate(g, garruk, label, [player('p2')]);
      done(g);
      expect(g.life('p2')).toBe(18);
      expect(g.zoneOf(garruk)).toBe('battlefield');
      expect(loyalty(g, garruk)).toBe(1);
    });
  });

  describe('Way of the Wildspeaker', () => {
    it('−4: create a 4/4 green Beast creature token with trample', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-wildspeaker', { card: FRA_JACE, loyalty: 7 }] },
      });
      const jace = jaces(g)[0]!;
      activate(g, jace, /Create a 4\/4 green Beast/);
      done(g);
      const [beast] = all(g, 'fra-green-beast-token');
      expect(pt(g, beast!)).toEqual([4, 4]);
      expect(keywords(g, beast!)).toContain('trample');
      expect(loyalty(g, jace)).toBe(3);
    });

    it('needs four loyalty', () => {
      const g = game({
        p1: { battlefield: ['way-of-the-wildspeaker', { card: FRA_JACE, loyalty: 3 }] },
      });
      expect(canActivate(g, jaces(g)[0]!, /Beast/)).toBe(false);
    });
  });

  it('two Ways together grant both abilities (in order), and Tomik and a Way stack too', () => {
    const g = game({
      p1: {
        battlefield: [
          'way-of-the-healer',
          'way-of-the-wildspeaker',
          'tomik-orzhov-lawmage',
          { card: FRA_JACE, loyalty: 8 },
        ],
      },
    });
    const abilities = getAbilities(g.state, db, jaces(g)[0]!);
    expect(abilities.filter((a) => a.kind === 'activated').map((a) => a.label)).toEqual([
      '−1: Surveil 1',
      '−3: Draw a card',
      '−2: Create a 2/2 colorless Wizard Soldier creature token named Cadet. Surveil 1',
      '−4: Create a 4/4 green Beast creature token with trample',
    ]);
  });
});
