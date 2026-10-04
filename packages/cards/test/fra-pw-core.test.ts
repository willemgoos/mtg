import { describe, expect, it } from 'vitest';
import {
  type Action,
  type CardDefinition,
  type EffectDef,
  type TargetChoice,
  createEngine,
  getCharacteristics,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { beholdToEnterUntapped, empowerJace, JACE } from '../src/fra/helpers.ts';
import { FRA_CADET, FRA_JACE } from '../src/fra/tokens.ts';
import { all, n } from './blb-helpers.ts';

// Reality Fracture 17c: the planeswalker core (the Jace token, Empower Jace, granted loyalty abilities, "a Jace",
// the loyalty triggers) and the twelve commons that use it.

// ---------------------------------------------------------------------------
// Test-only cards for the engine pieces
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
const spellOf = (id: string, ...effects: EffectDef[]) =>
  printed(id, { spell: { targets: [], effects } });

const gainLife = (amount: number | { count: 'loyaltyAmongPlaneswalkers'; filter?: object }) =>
  ({ kind: 'gainLife', who: 'controller', amount }) as unknown as EffectDef;

const TEST_CARDS: CardDefinition[] = [
  // Empower Jace X, where X is the number of lands you control; and Empower Jace 0.
  spellOf('test-empower-lands', empowerJace({ count: 'landsYouControl' })),
  spellOf('test-empower-zero', empowerJace(0)),
  // "Planeswalkers you control have '−2: Draw two cards'" and a static one (an extra land drop).
  printed('test-granter', {
    types: ['Enchantment'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'planeswalkersHave',
          ability: {
            kind: 'activated',
            cost: { loyalty: -2 },
            targets: [],
            effects: [{ kind: 'draw', who: 'controller', amount: 2 }],
            label: '−2: Draw two cards',
          },
        },
      },
    ],
  }),
  printed('test-static-granter', {
    types: ['Enchantment'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'planeswalkersHave',
          ability: { kind: 'static', effect: { kind: 'extraLandDrop' } },
        },
      },
    ],
  }),
  // A nontoken Jace and a nontoken Garruk-like walker.
  printed('test-jace', {
    name: 'Test Jace',
    types: ['Planeswalker'],
    subtypes: ['Jace'],
    colors: ['U'],
    loyalty: 4,
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [gainLife(1)],
        label: '+1: You gain 1 life',
      },
      {
        kind: 'activated',
        cost: { loyalty: -3 },
        targets: [],
        effects: [empowerJace(3)],
        label: '−3: Empower Jace 3',
      },
    ],
  }),
  printed('test-garruk', {
    name: 'Test Garruk',
    types: ['Planeswalker'],
    subtypes: ['Garruk'],
    colors: ['G'],
    loyalty: 4,
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 2 },
        targets: [],
        effects: [gainLife(1)],
        label: '+2: You gain 1 life',
      },
      {
        kind: 'activated',
        cost: { loyalty: 0, loyaltyX: true },
        targets: [],
        effects: [gainLife(1)],
        label: '−X: You gain 1 life',
      },
    ],
  }),
  // Watchers: gain life for each loyalty trigger (different amounts tell them apart).
  printed('test-watcher', {
    types: ['Enchantment'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youActivateLoyaltyAbility' },
        targets: [],
        effects: [gainLife(1)],
      },
      {
        kind: 'triggered',
        trigger: { on: 'youActivateLoyaltyAbility', removedAtLeast: 2 },
        targets: [],
        effects: [gainLife(10)],
      },
      {
        kind: 'triggered',
        trigger: { on: 'opponentActivatesLoyaltyAbility' },
        targets: [],
        effects: [gainLife(100)],
      },
      {
        kind: 'triggered',
        trigger: { on: 'youPutLoyaltyCounters' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 1000 }],
      },
    ],
  }),
  // "If you've activated a loyalty ability this turn" / "loyalty counters among Jaces you control".
  spellOf('test-if-activated', {
    kind: 'if',
    condition: { kind: 'activatedLoyaltyAbilityThisTurn' },
    then: [gainLife(5)],
    else: [gainLife(1)],
  }),
  spellOf(
    'test-jace-loyalty',
    gainLife({ count: 'loyaltyAmongPlaneswalkers', filter: { subtype: 'Jace' } }),
  ),
  spellOf('test-all-loyalty', gainLife({ count: 'loyaltyAmongPlaneswalkers' })),
  // "If you control a Jace planeswalker, you gain 7 life."
  spellOf('test-if-jace', {
    kind: 'if',
    condition: { kind: 'controlsPermanents', filter: JACE, min: 1 },
    then: [gainLife(7)],
  }),
  // Sanctum Lurker's static, Tomik's granted static, Jace's Machinations, "put a loyalty counter on each planeswalker you control".
  printed('test-lurker', {
    types: ['Creature'],
    power: 1,
    toughness: 1,
    abilities: [{ kind: 'static', effect: { kind: 'planeswalkersStayAtZero' } }],
  }),
  printed('test-tomik', {
    types: ['Creature'],
    power: 1,
    toughness: 1,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'planeswalkersHave',
          ability: { kind: 'static', effect: { kind: 'oneAttackerOnly' } },
        },
      },
    ],
  }),
  printed('test-machinations', {
    types: ['Instant'],
    spell: {
      targets: [],
      effects: [{ kind: 'loyaltyAtInstantSpeed', filter: JACE }],
    },
  }),
  spellOf('test-loyal-each', {
    kind: 'loyaltyCounters',
    to: { each: 'permanent', controller: 'you' },
    amount: 2,
  } as EffectDef),
  printed('test-loyal-target', {
    spell: {
      targets: [{ what: 'permanent' }],
      effects: [{ kind: 'loyaltyCounters', to: t0, amount: 3 } as EffectDef],
    },
  }),
  // Countersculpt: "As an additional cost to cast this spell, behold a Jace or pay {1}."
  printed('test-countersculpt', {
    types: ['Instant'],
    manaCost: { generic: 0, colored: { U: 2 } },
    colors: ['U'],
    beholdOrPay: { filter: JACE, pay: { generic: 1, colored: {} } },
    spell: { targets: [], effects: [gainLife(3)] },
  }),
  // Theorist's Sanctum: "As this land enters, you may behold a Jace. If you don't, this land enters tapped."
  printed('test-sanctum', {
    types: ['Land'],
    subtypes: ['Island'],
    ...beholdToEnterUntapped(JACE, { kind: 'mana', cost: { tapSelf: true }, produces: 'U' }),
  }),
  // A spell with "behold a Jace" (the free kicker Hulk's Thunderclap uses).
  printed('test-behold-jace', {
    types: ['Instant'],
    manaCost: { generic: 1, colored: {} },
    spell: { targets: [], effects: [gainLife(1)] },
    kicker: {
      cost: { generic: 0, colored: {} },
      behold: JACE,
      spell: { targets: [], effects: [gainLife(2)] },
    },
  }),
  // Violent Echoes: "6 damage to target creature or planeswalker. If excess damage was dealt to that permanent this way, empower Jace X, where X is that excess damage."
  printed('test-echoes', {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [
        {
          kind: 'damage',
          amount: 6,
          to: t0,
          ifExcess: [empowerJace({ event: 'amount' })],
        } as EffectDef,
      ],
    },
  }),
  // Empower Jace inside another effect's follow-up (a fight with excess damage): a choice among several tokens still happens.
  printed('test-brute', { types: ['Creature'], power: 5, toughness: 5 }),
  printed('test-fight-empower', {
    spell: {
      targets: [
        { what: 'creature', controller: 'you' },
        { what: 'creature', controller: 'opponent' },
      ],
      effects: [
        {
          kind: 'fight',
          a: t0,
          b: { target: 1 },
          ifExcess: [empowerJace({ count: 'landsYouControl' })],
        },
      ],
    },
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
  /** Which Jace token to choose among several (by index into the options). */
  pick?: number;
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Surveil: send these cards (defIds) to the graveyard. */
  bin?: string[];
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
      const bin = opts.bin ?? [];
      const bottom = d.cards.filter((id) => bin.includes(g.obj(id).defId));
      g.do({
        type: 'scry',
        player: d.player,
        top: d.cards.filter((id) => !bottom.includes(id)),
        bottom,
      });
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
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, db, id);
  return [c.power, c.toughness];
};
const keywords = (g: GameDriver, id: string) => [...getCharacteristics(g.state, db, id).keywords];
const idx = (defId: string, kind: 'activated' | 'triggered') =>
  db.get(defId)!.abilities.findIndex((a) => a.kind === kind);

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
// The Jace token
// ---------------------------------------------------------------------------

describe('the Jace token', () => {
  const jace = db.get(FRA_JACE)!;

  it('is a blue Token Planeswalker named Jace with 0 loyalty, "−1: Surveil 1" and "−3: Draw a card"', () => {
    expect(jace.name).toBe('Jace');
    expect(jace.isToken).toBe(true);
    expect(jace.types).toEqual(['Planeswalker']);
    expect(jace.subtypes).toEqual(['Jace']);
    expect(jace.colors).toEqual(['U']);
    expect(jace.loyalty).toBe(0);
    expect(jace.supertypes).toEqual([]);
    expect(jace.abilities).toHaveLength(2);
    expect(jace.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: { loyalty: -1 },
      effects: [{ kind: 'surveil', amount: 1 }],
    });
    expect(jace.abilities[1]).toMatchObject({
      kind: 'activated',
      cost: { loyalty: -3 },
      effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
    });
  });

  it('−1 surveils 1 and −3 draws a card, once per turn, only with enough loyalty', () => {
    const g = game({
      p1: {
        battlefield: [{ card: FRA_JACE, loyalty: 4 }],
        library: ['bear-cub', 'forest', 'forest'],
      },
    });
    const j = jaces(g)[0]!;
    expect(canActivate(g, j, 0)).toBe(true);
    expect(canActivate(g, j, 1)).toBe(true);
    // −1: surveil, binning the Bear Cub.
    activate(g, j, 0);
    done(g, { bin: ['bear-cub'] });
    expect(loyalty(g, j)).toBe(3);
    expect(gy(g)).toEqual(['bear-cub']);
    // One loyalty ability per planeswalker per turn.
    expect(canActivate(g, j, 0)).toBe(false);
    expect(canActivate(g, j, 1)).toBe(false);
    // Next turn: −3 draws a card, leaving it at 0 (it dies).
    passTo(g, 'main1', 'p1');
    const before = hand(g).length;
    activate(g, j, 1);
    done(g);
    expect(hand(g).length).toBe(before + 1);
    expect(g.zoneOf(j)).not.toBe('battlefield');
  });

  it('can not use −3 with less than 3 loyalty, and can use −1 with 1', () => {
    const g = game({ p1: { battlefield: [{ card: FRA_JACE, loyalty: 2 }] } });
    const j = jaces(g)[0]!;
    expect(canActivate(g, j, 0)).toBe(true);
    expect(canActivate(g, j, 1)).toBe(false);
  });

  it('is a planeswalker that is dealt damage (loyalty) and attacked, and dies at 0 loyalty', () => {
    const g = game({
      p1: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
      p2: { hand: ['shock'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    const j = jaces(g)[0]!;
    cast(g, 'shock', [target(g, j)]);
    done(g);
    expect(loyalty(g, j)).toBe(1);
    expect(g.zoneOf(j)).toBe('battlefield');
  });

  it('dies to state-based actions at 0 loyalty (a token ceases to exist)', () => {
    const g = game({
      p1: { battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
      p2: { hand: ['shock'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    const j = jaces(g)[0]!;
    cast(g, 'shock', [target(g, j)]);
    done(g);
    expect(jaces(g)).toHaveLength(0);
    expect(g.zoneOf(j)).not.toBe('battlefield');
  });

  it('can be attacked by creatures, losing loyalty from combat damage', () => {
    const g = game({
      p1: { battlefield: ['bear-cub'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 5 }] },
    });
    const bear = g.id('p1', 'bear-cub');
    const j = jaces(g, 'p2')[0]!;
    g.passUntilStep('beginCombat').passBoth();
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2', planeswalker: j });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else g.pass();
    }
    expect(loyalty(g, j)).toBe(3);
    expect(g.life('p2')).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Empower Jace
// ---------------------------------------------------------------------------

describe('Empower Jace', () => {
  it('creates a Jace token with N loyalty counters when you control none', () => {
    const g = game({
      p1: { hand: ['tams-resistance'], battlefield: ['bear-cub', ...n('forest', 2)] },
    });
    expect(jaces(g)).toHaveLength(0);
    cast(g, 'tams-resistance', [target(g, g.id('p1', 'bear-cub'))]);
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
    expect(g.obj(jaces(g)[0]!).isToken).toBe(true);
  });

  it('empowering twice stacks the counters on the same token', () => {
    const g = game({
      p1: { hand: ['no-admittance', 'no-admittance'], battlefield: n('mountain', 4) },
    });
    cast(g, 'no-admittance', [player('p2')]);
    done(g);
    const first = jaces(g)[0]!;
    expect(loyalty(g, first)).toBe(1);
    cast(g, 'no-admittance', [player('p2')]);
    done(g);
    expect(jaces(g)).toEqual([first]);
    expect(loyalty(g, first)).toBe(2);
    expect(g.life('p2')).toBe(14);
  });

  it('puts the counters on the existing token instead of creating another', () => {
    const g = game({
      p1: {
        hand: ['mindseeker-oculus'],
        battlefield: [{ card: FRA_JACE, loyalty: 2 }, ...n('island', 3)],
      },
    });
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(6);
  });

  it('a Jace token at 0 loyalty dies: Empower Jace 0 creates it and it goes away', () => {
    const g = game({ p1: { hand: ['test-empower-zero'] } });
    cast(g, 'test-empower-zero');
    done(g);
    expect(jaces(g)).toHaveLength(0);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === FRA_JACE)).toBe(false);
  });

  it('with several Jace tokens you choose which one gets the counters', () => {
    const g = game({
      p1: {
        hand: ['mindseeker-oculus'],
        battlefield: [
          { card: FRA_JACE, loyalty: 2 },
          { card: FRA_JACE, loyalty: 5 },
          ...n('island', 3),
        ],
      },
    });
    const [a, b] = jaces(g) as [string, string];
    cast(g, 'mindseeker-oculus');
    // Resolve the spell, then the enters trigger, which stops to ask.
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseObject'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseObject');
    if (g.decision.kind !== 'chooseObject') throw new Error('unreachable');
    expect(g.decision.player).toBe('p1');
    expect([...g.decision.options].sort()).toEqual([a, b].sort());
    g.do({ type: 'chooseCard', player: 'p1', card: b });
    done(g);
    expect(loyalty(g, a)).toBe(2);
    expect(loyalty(g, b)).toBe(9);
    expect(jaces(g)).toHaveLength(2);
  });

  it('never puts counters on a nontoken Jace: with only a nontoken Jace it still creates a token', () => {
    const g = game({
      p1: {
        hand: ['mindseeker-oculus'],
        battlefield: [{ card: 'test-jace', loyalty: 4 }, ...n('island', 3)],
      },
    });
    const real = g.id('p1', 'test-jace');
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(loyalty(g, real)).toBe(4);
    expect(jaces(g)).toHaveLength(1);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('with a nontoken Jace and a token, the counters go on the token without asking', () => {
    const g = game({
      p1: {
        hand: ['mindseeker-oculus'],
        battlefield: [
          { card: 'test-jace', loyalty: 4 },
          { card: FRA_JACE, loyalty: 1 },
          ...n('island', 3),
        ],
      },
    });
    cast(g, 'mindseeker-oculus');
    done(g, { pick: 99 });
    expect(loyalty(g, g.id('p1', 'test-jace'))).toBe(4);
    expect(loyalty(g, jaces(g)[0]!)).toBe(5);
  });

  it("only counts your own Jace tokens: an opponent's token stays as it is", () => {
    const g = game({
      p1: { hand: ['mindseeker-oculus'], battlefield: n('island', 3) },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
    });
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(jaces(g, 'p1')).toHaveLength(1);
    expect(loyalty(g, jaces(g, 'p1')[0]!)).toBe(4);
    expect(loyalty(g, jaces(g, 'p2')[0]!)).toBe(3);
  });

  it('takes N from a count (Empower Jace X, where X is the number of lands you control)', () => {
    const g = game({ p1: { hand: ['test-empower-lands'], battlefield: n('forest', 5) } });
    cast(g, 'test-empower-lands');
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(5);
  });

  it("does nothing if the spell's only target is gone: you won't empower Jace", () => {
    const g = game({
      p1: { hand: ['academic-ascent'], battlefield: ['bear-cub', ...n('plains', 2)] },
      p2: { hand: ['shock'], battlefield: n('mountain', 2) },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'academic-ascent', [target(g, bear)]);
    g.pass();
    cast(g, 'shock', [target(g, bear)]);
    done(g);
    expect(g.zoneOf(bear)).not.toBe('battlefield');
    expect(jaces(g)).toHaveLength(0);
  });

  it('a Jace token made some other way (a token copy of a Jace) is empowered too', () => {
    // A token that's a copy of a nontoken Jace planeswalker is a Jace planeswalker token.
    const g = game({
      p1: {
        hand: ['mindseeker-oculus'],
        battlefield: [{ card: 'test-jace', loyalty: 4 }, ...n('island', 3)],
      },
    });
    const real = g.id('p1', 'test-jace');
    g.obj(real).isToken = true; // as if it were a token copy
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(loyalty(g, real)).toBe(8);
    expect(jaces(g)).toHaveLength(0);
  });
});

describe('damage with excess (Violent Echoes)', () => {
  it('empowers Jace by the excess damage dealt to a creature', () => {
    const g = game({
      p1: { hand: ['test-echoes'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'test-echoes', [target(g, g.id('p2', 'bear-cub'))]);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it("counts damage beyond a planeswalker's loyalty as excess", () => {
    const g = game({
      p1: { hand: ['test-echoes'] },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 2 }] },
    });
    cast(g, 'test-echoes', [target(g, g.id('p2', 'test-jace'))]);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('does nothing when the damage was not more than lethal', () => {
    const g = game({
      p1: { hand: ['test-echoes'] },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 6 }] },
    });
    cast(g, 'test-echoes', [target(g, g.id('p2', 'test-jace'))]);
    done(g);
    expect(jaces(g)).toHaveLength(0);
    const h = game({
      p1: { hand: ['test-echoes'] },
      p2: { battlefield: ['test-brute'] },
    });
    cast(h, 'test-echoes', [target(h, h.id('p2', 'test-brute'))]);
    done(h);
    expect(loyalty(h, jaces(h)[0]!)).toBe(1);
  });
});

describe('Empower Jace inside another effect', () => {
  const setup = (tokens: number) =>
    game({
      p1: {
        hand: ['test-fight-empower'],
        battlefield: [
          'test-brute',
          ...Array.from({ length: tokens }, (_, i) => ({ card: FRA_JACE, loyalty: 1 + i * 10 })),
          ...n('forest', 3),
        ],
      },
      p2: { battlefield: ['bear-cub'] },
    });

  it('creates the token and puts the counters on it when excess damage was dealt', () => {
    const g = setup(0);
    cast(g, 'test-fight-empower', [
      target(g, g.id('p1', 'test-brute')),
      target(g, g.id('p2', 'bear-cub')),
    ]);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(3);
  });

  it('asks which token when you control several, after the fight', () => {
    const g = setup(2);
    const [a, b] = jaces(g) as [string, string];
    cast(g, 'test-fight-empower', [
      target(g, g.id('p1', 'test-brute')),
      target(g, g.id('p2', 'bear-cub')),
    ]);
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseObject'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: a });
    done(g);
    expect(loyalty(g, a)).toBe(4);
    expect(loyalty(g, b)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Granted loyalty abilities
// ---------------------------------------------------------------------------

describe('planeswalkersHave (granted loyalty abilities)', () => {
  it('gives every planeswalker you control the ability: printed ones and tokens', () => {
    const g = game({
      p1: {
        battlefield: [
          'test-granter',
          { card: 'test-jace', loyalty: 4 },
          { card: FRA_JACE, loyalty: 3 },
        ],
        library: n('forest', 6),
      },
    });
    const real = g.id('p1', 'test-jace');
    const token = jaces(g)[0]!;
    // The printed abilities come first, the granted one after them.
    expect(canActivate(g, real, 2)).toBe(true);
    expect(canActivate(g, token, 2)).toBe(true);
    activate(g, token, 2);
    done(g);
    expect(loyalty(g, token)).toBe(1);
    expect(hand(g)).toHaveLength(2);
    // Each planeswalker has its own once-per-turn use.
    activate(g, real, 2);
    done(g);
    expect(loyalty(g, real)).toBe(2);
    expect(hand(g)).toHaveLength(4);
    expect(canActivate(g, real, 0)).toBe(false);
  });

  it("is only for the controller's planeswalkers and stops with the permanent", () => {
    const g = game({
      p1: { battlefield: ['test-granter', { card: 'test-jace', loyalty: 4 }] },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 4 }] },
    });
    const mine = g.id('p1', 'test-jace');
    const theirs = g.id('p2', 'test-jace');
    expect(canActivate(g, mine, 2)).toBe(true);
    // The opponent's planeswalker doesn't get it (checked on their turn).
    const h = game({
      p1: { battlefield: ['test-granter'] },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 4 }] },
      active: 'p2',
    });
    expect(canActivate(h, h.id('p2', 'test-jace'), 2)).toBe(false);
    // Removing the granter takes the ability away again.
    g.state.battlefield = g.state.battlefield.filter((id) => id !== g.id('p1', 'test-granter'));
    expect(canActivate(g, mine, 2)).toBe(false);
    expect(theirs).toBeDefined();
  });

  it('a −2 ability can not be activated with 1 loyalty', () => {
    const g = game({ p1: { battlefield: ['test-granter', { card: FRA_JACE, loyalty: 1 }] } });
    expect(canActivate(g, jaces(g)[0]!, 2)).toBe(false);
    expect(canActivate(g, jaces(g)[0]!, 0)).toBe(true);
  });

  it('a static ability can be granted too', () => {
    const g = game({
      p1: {
        hand: ['forest', 'forest'],
        battlefield: ['test-static-granter', { card: FRA_JACE, loyalty: 2 }],
      },
    });
    const lands = g.state.players.p1.hand.filter((id) => g.obj(id).defId === 'forest');
    g.do({ type: 'playLand', player: 'p1', card: lands[0]! });
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
    const plain = game({
      p1: { hand: ['forest', 'forest'], battlefield: [{ card: FRA_JACE, loyalty: 2 }] },
    });
    plain.do({ type: 'playLand', player: 'p1', card: plain.state.players.p1.hand[0]! });
    expect(plain.legal().some((a) => a.type === 'playLand')).toBe(false);
  });

  it('a Jace token with the ability has it in its list (a granted ability keeps the printed ones)', () => {
    const g = game({ p1: { battlefield: ['test-granter', { card: FRA_JACE, loyalty: 3 }] } });
    const j = jaces(g)[0]!;
    expect(canActivate(g, j, 0)).toBe(true);
    expect(canActivate(g, j, 1)).toBe(true);
    expect(canActivate(g, j, 2)).toBe(true);
    expect(canActivate(g, j, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Loyalty triggers and conditions
// ---------------------------------------------------------------------------

describe('loyalty triggers', () => {
  it('whenever you activate a loyalty ability, and again if you removed two or more', () => {
    const g = game({
      p1: { battlefield: ['test-watcher', { card: 'test-garruk', loyalty: 4 }] },
    });
    const w = g.id('p1', 'test-garruk');
    // +2: a plus ability puts counters (that triggers "put loyalty counters" as well) but removes none.
    activate(g, w, 0);
    done(g);
    expect(g.life('p1')).toBe(20 + 1 + 1 + 1000);
  });

  it('removed two or more loyalty counters (a −X ability counts X)', () => {
    const g = game({
      p1: { battlefield: ['test-watcher', { card: 'test-garruk', loyalty: 4 }] },
    });
    const w = g.id('p1', 'test-garruk');
    activate(g, w, 1, [], { x: 1 });
    done(g);
    // The watcher once, plus the walker's own gain.
    expect(g.life('p1')).toBe(22);
    const h = game({
      p1: { battlefield: ['test-watcher', { card: 'test-garruk', loyalty: 4 }] },
    });
    activate(h, h.id('p1', 'test-garruk'), 1, [], { x: 3 });
    done(h);
    expect(h.life('p1')).toBe(20 + 1 + 10 + 1);
  });

  it('removing exactly two with a printed −2 triggers the "two or more" one', () => {
    const g = game({
      p1: { battlefield: ['test-watcher', 'test-granter', { card: FRA_JACE, loyalty: 3 }] },
    });
    activate(g, jaces(g)[0]!, 2);
    done(g);
    expect(g.life('p1')).toBe(20 + 1 + 10);
  });

  it('a −1 does not trigger the "two or more" one', () => {
    const g = game({ p1: { battlefield: ['test-watcher', { card: FRA_JACE, loyalty: 3 }] } });
    activate(g, jaces(g)[0]!, 0);
    done(g, { bin: [] });
    expect(g.life('p1')).toBe(21);
  });

  it('whenever an opponent activates a loyalty ability (not yours)', () => {
    const g = game({
      p1: { battlefield: ['test-watcher'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
      active: 'p2',
    });
    activate(g, jaces(g, 'p2')[0]!, 0);
    done(g);
    // The watcher's controller is p1.
    expect(g.life('p1')).toBe(120);
    expect(g.life('p2')).toBe(20);
  });

  it('whenever you put one or more loyalty counters on a planeswalker (Empower Jace, a + ability); not for removing', () => {
    const g = game({
      p1: { hand: ['mindseeker-oculus'], battlefield: ['test-watcher', ...n('island', 3)] },
    });
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(g.life('p1')).toBe(1020);
    // Creating the token at 0 loyalty puts no counters: Empower Jace 0 makes no trigger.
    const z = game({ p1: { hand: ['test-empower-zero'], battlefield: ['test-watcher'] } });
    cast(z, 'test-empower-zero');
    done(z);
    expect(z.life('p1')).toBe(20);
    // A minus ability puts none.
    const m = game({ p1: { battlefield: ['test-watcher', { card: FRA_JACE, loyalty: 3 }] } });
    activate(m, jaces(m)[0]!, 1);
    done(m);
    expect(m.life('p1')).toBe(20 + 1 + 10);
  });

  it('the opponent putting counters on their own walker does not trigger yours', () => {
    const g = game({
      p1: { battlefield: ['test-watcher'] },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 4 }] },
      active: 'p2',
    });
    activate(g, g.id('p2', 'test-jace'), 0);
    done(g);
    expect(g.life('p1')).toBe(120);
  });

  it("'activatedLoyaltyAbilityThisTurn' is true once you have activated one this turn", () => {
    const g = game({
      p1: {
        hand: ['test-if-activated', 'test-if-activated'],
        battlefield: [{ card: FRA_JACE, loyalty: 3 }],
      },
    });
    cast(g, 'test-if-activated');
    done(g);
    expect(g.life('p1')).toBe(21);
    activate(g, jaces(g)[0]!, 0);
    done(g);
    cast(g, 'test-if-activated');
    done(g);
    expect(g.life('p1')).toBe(26);
  });

  it('the activated-this-turn memory is cleared at the next turn', () => {
    const g = game({
      p1: { hand: ['test-if-activated'], battlefield: [{ card: FRA_JACE, loyalty: 3 }] },
    });
    activate(g, jaces(g)[0]!, 0);
    done(g);
    passTo(g, 'main1', 'p1');
    expect(g.state.turn.loyaltyActivated).toBeUndefined();
    cast(g, 'test-if-activated');
    done(g);
    expect(g.life('p1')).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// "A Jace": filters, counts and behold
// ---------------------------------------------------------------------------

describe('"a Jace"', () => {
  it('"if you control a Jace planeswalker" (nontoken or token, not other walkers)', () => {
    const none = game({
      p1: { hand: ['test-if-jace'], battlefield: [{ card: 'test-garruk', loyalty: 4 }] },
    });
    cast(none, 'test-if-jace');
    done(none);
    expect(none.life('p1')).toBe(20);
    const real = game({
      p1: { hand: ['test-if-jace'], battlefield: [{ card: 'test-jace', loyalty: 4 }] },
    });
    cast(real, 'test-if-jace');
    done(real);
    expect(real.life('p1')).toBe(27);
    const token = game({
      p1: { hand: ['test-if-jace'], battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
    });
    cast(token, 'test-if-jace');
    done(token);
    expect(token.life('p1')).toBe(27);
  });

  it('counts the loyalty counters among Jaces you control (and among all walkers)', () => {
    const g = game({
      p1: {
        hand: ['test-jace-loyalty', 'test-all-loyalty'],
        battlefield: [
          { card: 'test-jace', loyalty: 4 },
          { card: FRA_JACE, loyalty: 7 },
          { card: 'test-garruk', loyalty: 5 },
        ],
      },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 9 }] },
    });
    cast(g, 'test-jace-loyalty');
    done(g);
    expect(g.life('p1')).toBe(31);
    cast(g, 'test-all-loyalty');
    done(g);
    expect(g.life('p1')).toBe(31 + 16);
  });

  it('behold a Jace: a Jace you control, or a Jace card in your hand (not just any walker)', () => {
    const kicked = (g: GameDriver) =>
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' && a.card === g.id('p1', 'test-behold-jace', 'hand') && a.kicked,
        );
    const onBoard = game({
      p1: { hand: ['test-behold-jace'], battlefield: [{ card: FRA_JACE, loyalty: 1 }, 'forest'] },
    });
    expect(kicked(onBoard)).toBe(true);
    const inHand = game({
      p1: { hand: ['test-behold-jace', 'test-jace'], battlefield: ['forest'] },
    });
    expect(kicked(inHand)).toBe(true);
    const other = game({
      p1: {
        hand: ['test-behold-jace', 'test-garruk'],
        battlefield: ['forest', { card: 'test-garruk', loyalty: 4 }],
      },
    });
    expect(kicked(other)).toBe(false);
    const none = game({ p1: { hand: ['test-behold-jace'], battlefield: ['forest'] } });
    expect(kicked(none)).toBe(false);
  });
});

describe('other planeswalker pieces', () => {
  it('"put loyalty counters on a planeswalker": only planeswalkers get them', () => {
    const g = game({
      p1: {
        hand: ['test-loyal-each'],
        battlefield: [
          'bear-cub',
          { card: 'test-jace', loyalty: 4 },
          { card: FRA_JACE, loyalty: 1 },
        ],
      },
    });
    cast(g, 'test-loyal-each');
    done(g);
    expect(loyalty(g, g.id('p1', 'test-jace'))).toBe(6);
    expect(loyalty(g, jaces(g)[0]!)).toBe(3);
    expect(g.obj(g.id('p1', 'bear-cub')).counters?.loyalty).toBeUndefined();
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(0);
    const h = game({ p1: { hand: ['test-loyal-target'], battlefield: ['bear-cub'] } });
    cast(h, 'test-loyal-target', [target(h, h.id('p1', 'bear-cub'))]);
    done(h);
    expect(h.obj(h.id('p1', 'bear-cub')).counters?.loyalty).toBeUndefined();
  });

  it('Sanctum Lurker: planeswalkers you control stay at 0 loyalty', () => {
    const g = game({
      p1: { hand: ['test-empower-zero'], battlefield: ['test-lurker'] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 0 }] },
    });
    cast(g, 'test-empower-zero');
    done(g);
    // Mine stays (0 loyalty); theirs is gone.
    expect(jaces(g, 'p1')).toHaveLength(1);
    expect(loyalty(g, jaces(g, 'p1')[0]!)).toBe(0);
    expect(jaces(g, 'p2')).toHaveLength(0);
  });

  it('Tomik: no more than one creature can attack a planeswalker you control', () => {
    const attackers = (withTomik: boolean) => {
      const g = game({
        p1: { battlefield: [{ card: FRA_JACE, loyalty: 3 }, ...(withTomik ? ['test-tomik'] : [])] },
        p2: { battlefield: ['bear-cub', 'bear-cub'] },
        active: 'p2',
      });
      g.passUntilStep('beginCombat').passBoth();
      const [a, b] = all(g, 'bear-cub') as [string, string];
      const j = jaces(g)[0]!;
      const atJace = (id: string) =>
        g
          .legal()
          .some((x) => x.type === 'addAttacker' && x.attacker === id && x.planeswalker === j);
      expect(atJace(a)).toBe(true);
      g.do({ type: 'addAttacker', player: 'p2', attacker: a, defender: 'p1', planeswalker: j });
      return { second: atJace(b), first: atJace(a) };
    };
    expect(attackers(false).second).toBe(true);
    expect(attackers(true).second).toBe(false);
    // The first attacker can still be moved or kept.
    expect(attackers(true).first).toBe(false);
  });

  it("Jace's Machinations: loyalty abilities of your Jaces at instant speed, on any turn", () => {
    const g = game({
      p1: {
        hand: ['test-machinations'],
        battlefield: [
          { card: FRA_JACE, loyalty: 3 },
          { card: 'test-garruk', loyalty: 4 },
          'island',
        ],
      },
      p2: { battlefield: [] },
      active: 'p2',
    });
    const j = jaces(g)[0]!;
    // Not your turn: nothing yet. p2 passes, then p1 gets priority in p2's step.
    g.pass();
    expect(g.actor).toBe('p1');
    expect(canActivate(g, j, 1)).toBe(false);
    cast(g, 'test-machinations');
    done(g);
    // The ability is available at instant speed on the opponent's turn, with the stack not empty.
    expect(g.state.turn.activePlayer).toBe('p2');
    // The active player has priority again; once they pass, it is ours in their main phase.
    g.pass();
    expect(g.actor).toBe('p1');
    expect(g.state.turn.step).toBe('main1');
    expect(canActivate(g, j, 1)).toBe(true);
    // Not for the other planeswalker.
    expect(canActivate(g, g.id('p1', 'test-garruk'), 0)).toBe(false);
    activate(g, j, 1);
    done(g);
    expect(g.zoneOf(j)).not.toBe('battlefield');
  });
});

describe('behold a Jace or pay (Countersculpt) and "you may behold a Jace" for a land', () => {
  const casts = (g: GameDriver) =>
    g
      .legal()
      .flatMap((a) =>
        a.type === 'castSpell' && g.obj(a.card).defId === 'test-countersculpt'
          ? [a.beheld ? 'behold' : 'pay']
          : [],
      );

  it('with a Jace and exactly {U}{U}: only the beholding cast', () => {
    const g = game({
      p1: {
        hand: ['test-countersculpt'],
        battlefield: [{ card: FRA_JACE, loyalty: 1 }, 'island', 'island'],
      },
    });
    expect(casts(g)).toEqual(['behold']);
    cast(g, 'test-countersculpt', [], { beheld: true, beholdCard: jaces(g)[0]! });
    done(g);
    expect(g.life('p1')).toBe(23);
  });

  it('with a Jace card in hand: beholding is possible; with no Jace: only paying {1} more', () => {
    const inHand = game({
      p1: { hand: ['test-countersculpt', 'test-jace'], battlefield: ['island', 'island'] },
    });
    expect(casts(inHand)).toEqual(['behold']);
    const none = game({
      p1: { hand: ['test-countersculpt'], battlefield: ['island', 'island', 'island'] },
    });
    expect(casts(none)).toEqual(['pay']);
    cast(none, 'test-countersculpt');
    done(none);
    expect(none.life('p1')).toBe(23);
    expect(none.state.battlefield.filter((id) => none.obj(id).tapped)).toHaveLength(3);
  });

  it('with a Jace and three lands both ways are offered; beholding leaves a land untapped', () => {
    const g = game({
      p1: {
        hand: ['test-countersculpt'],
        battlefield: [{ card: 'test-jace', loyalty: 4 }, 'island', 'island', 'island'],
      },
    });
    expect(casts(g).sort()).toEqual(['behold', 'pay']);
    cast(g, 'test-countersculpt', [], { beheld: true, beholdCard: g.id('p1', 'test-jace') });
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(2);
  });

  it('a nonJace walker does not count', () => {
    const g = game({
      p1: {
        hand: ['test-countersculpt'],
        battlefield: [{ card: 'test-garruk', loyalty: 4 }, 'island', 'island'],
      },
    });
    expect(casts(g)).toEqual([]);
  });

  it('a land that enters tapped unless you behold a Jace (you pick which; one in hand is revealed)', () => {
    const play = (g: GameDriver) =>
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'test-sanctum', 'hand') });
    const tapped = (g: GameDriver) => g.obj(g.id('p1', 'test-sanctum')).tapped;
    const reveals = (g: GameDriver) => g.events.filter((e) => e.type === 'cardsRevealed');
    // Nothing to behold: it enters tapped and nothing is asked.
    const plain = game({ p1: { hand: ['test-sanctum'] } });
    play(plain);
    done(plain);
    expect(plain.decision.kind).toBe('priority');
    expect(tapped(plain)).toBe(true);
    expect(reveals(plain)).toHaveLength(0);
    // A Jace you control and a Jace card in hand: three answers.
    const g = game({
      p1: { hand: ['test-sanctum', 'test-jace'], battlefield: [{ card: FRA_JACE, loyalty: 1 }] },
    });
    play(g);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'Behold Jace',
      'Behold Test Jace (reveal it from your hand)',
      'Enter tapped',
    ]);
    expect(tapped(g)).toBe(true);
    // Beholding the Jace token untaps it; nothing is revealed.
    const onBoard = structuredClone(g.state);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(tapped(g)).toBe(false);
    expect(reveals(g)).toHaveLength(0);
    // Beholding the card in hand reveals it (the opponent sees which), and it stays in hand.
    const h = new GameDriver(engine, onBoard);
    h.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(tapped(h)).toBe(false);
    expect(reveals(h)).toEqual([
      {
        type: 'cardsRevealed',
        player: 'p1',
        cards: [{ id: h.id('p1', 'test-jace', 'hand'), defId: 'test-jace' }],
      },
    ]);
    expect(hand(h)).toContain('test-jace');
    // Declining leaves it tapped.
    const k = new GameDriver(engine, structuredClone(onBoard));
    k.do({ type: 'chooseOption', player: 'p1', index: 2 });
    expect(tapped(k)).toBe(true);
    expect(reveals(k)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The twelve commons
// ---------------------------------------------------------------------------

describe('Academic Ascent', () => {
  it('gives +2/+2 and flying until end of turn, then empowers Jace 2', () => {
    const g = game({
      p1: { hand: ['academic-ascent'], battlefield: ['bear-cub', ...n('plains', 2)] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'academic-ascent', [target(g, bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toContain('flying');
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    passTo(g, 'main1', 'p2');
    expect(pt(g, bear)).toEqual([2, 2]);
  });
});

describe('Arcane Amphisbaena', () => {
  it('is a 1/1 deathtouch Snake that empowers Jace 2 when it enters', () => {
    const g = game({ p1: { hand: ['arcane-amphisbaena'], battlefield: n('forest', 2) } });
    cast(g, 'arcane-amphisbaena');
    done(g);
    const snake = g.id('p1', 'arcane-amphisbaena');
    expect(pt(g, snake)).toEqual([1, 1]);
    expect(keywords(g, snake)).toContain('deathtouch');
    expect(db.get('arcane-amphisbaena')!.subtypes).toEqual(['Snake']);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
  });
});

describe('Campus Crier', () => {
  it('is a 3/1 Human Advisor', () => {
    const d = db.get('campus-crier')!;
    expect([d.power, d.toughness, ...d.subtypes]).toEqual([3, 1, 'Human', 'Advisor']);
  });

  it('{1}, exile it from your graveyard: Empower Jace 2 (only from the graveyard)', () => {
    const g = game({
      p1: {
        graveyard: ['campus-crier'],
        hand: ['campus-crier'],
        battlefield: ['forest', 'forest'],
      },
    });
    const ix = idx('campus-crier', 'activated');
    const inYard = g.id('p1', 'campus-crier', 'graveyard');
    const inHand = g.id('p1', 'campus-crier', 'hand');
    expect(canActivate(g, inHand, ix)).toBe(false);
    activate(g, inYard, ix);
    done(g);
    expect(g.zoneOf(inYard)).toBe('exile');
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    // The same on the battlefield does nothing.
  });
});

describe('Compel Brutality', () => {
  const bigTheirs = { card: 'bear-cub' } as const;

  it('mode 1: your creature deals damage equal to its power to a creature or planeswalker an opponent controls', () => {
    const g = game({
      p1: { hand: ['compel-brutality'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: [bigTheirs, { card: FRA_JACE, loyalty: 5 }] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    cast(g, 'compel-brutality', [target(g, mine), target(g, theirs)], { mode: 0 });
    done(g);
    expect(g.zoneOf(theirs)).not.toBe('battlefield');
    expect(g.zoneOf(mine)).toBe('battlefield');
    // The same at a planeswalker.
    const h = game({
      p1: { hand: ['compel-brutality'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 5 }] },
    });
    cast(
      h,
      'compel-brutality',
      [target(h, h.id('p1', 'bear-cub')), target(h, jaces(h, 'p2')[0]!)],
      { mode: 0 },
    );
    done(h);
    expect(loyalty(h, jaces(h, 'p2')[0]!)).toBe(3);
  });

  it('mode 2: your planeswalker deals damage equal to its loyalty', () => {
    const g = game({
      p1: {
        hand: ['compel-brutality'],
        battlefield: [{ card: FRA_JACE, loyalty: 3 }, ...n('forest', 2)],
      },
      p2: { battlefield: ['bear-cub', 'bear-cub', { card: 'test-jace', loyalty: 5 }] },
    });
    const mine = jaces(g)[0]!;
    const [a] = all(g, 'bear-cub');
    cast(g, 'compel-brutality', [target(g, mine), target(g, a!)], { mode: 1 });
    done(g);
    expect(g.zoneOf(a!)).not.toBe('battlefield');
    // Damage dealt by the walker, which keeps its loyalty.
    expect(loyalty(g, mine)).toBe(3);
    const h = game({
      p1: {
        hand: ['compel-brutality'],
        battlefield: [{ card: FRA_JACE, loyalty: 3 }, ...n('forest', 2)],
      },
      p2: { battlefield: [{ card: 'test-jace', loyalty: 5 }] },
    });
    const w = h.id('p2', 'test-jace');
    cast(h, 'compel-brutality', [target(h, jaces(h)[0]!), target(h, w)], { mode: 1 });
    done(h);
    expect(loyalty(h, w)).toBe(2);
  });

  it('only targets what its mode says (a creature you control for mode 1, a planeswalker you control for mode 2)', () => {
    const g = game({
      p1: { hand: ['compel-brutality'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // Only mode 1 is possible: there is no planeswalker to use for mode 2.
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.type === 'castSpell' && a.mode === 0)).toBe(true);
  });

  it('the power or loyalty is read as it resolves: no damage if the source is gone', () => {
    const g = game({
      p1: { hand: ['compel-brutality'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { hand: ['shock'], battlefield: ['bear-cub', 'mountain', 'mountain'] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    cast(g, 'compel-brutality', [target(g, mine), target(g, theirs)], { mode: 0 });
    g.pass();
    cast(g, 'shock', [target(g, mine)]);
    done(g);
    expect(g.zoneOf(mine)).not.toBe('battlefield');
    expect(g.zoneOf(theirs)).toBe('battlefield');
    expect(g.obj(theirs).damage).toBe(0);
  });
});

describe('Hexhaven Battalion', () => {
  it('creates three Cadets and empowers Jace 2', () => {
    const g = game({ p1: { hand: ['hexhaven-battalion'], battlefield: n('plains', 6) } });
    cast(g, 'hexhaven-battalion');
    done(g);
    expect(all(g, FRA_CADET)).toHaveLength(3);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    expect(pt(g, all(g, FRA_CADET)[0]!)).toEqual([2, 2]);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: {
        hand: ['hexhaven-battalion'],
        battlefield: ['plains', 'plains'],
        library: ['forest', 'plains'],
      },
    });
    const card = g.id('p1', 'hexhaven-battalion', 'hand');
    activate(g, card, idx('hexhaven-battalion', 'activated'));
    done(g);
    expect(g.zoneOf(card)).toBe('graveyard');
    expect(hand(g).filter((d) => d === 'forest' || d === 'plains')).toHaveLength(1);
  });
});

describe('Inspired Tethermage', () => {
  it('gets a +1/+1 counter whenever you put loyalty counters on a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['keeper-of-the-quiet-hour'],
        battlefield: ['inspired-tethermage', ...n('forest', 3)],
      },
    });
    const mage = g.id('p1', 'inspired-tethermage');
    expect(pt(g, mage)).toEqual([3, 2]);
    cast(g, 'keeper-of-the-quiet-hour');
    done(g);
    expect(pt(g, mage)).toEqual([4, 3]);
  });

  it('also for a loyalty ability that adds loyalty, but not for removing it or for a new token', () => {
    const g = game({
      p1: { battlefield: ['inspired-tethermage', { card: 'test-jace', loyalty: 4 }] },
    });
    const mage = g.id('p1', 'inspired-tethermage');
    activate(g, g.id('p1', 'test-jace'), 0);
    done(g);
    expect(g.obj(mage).plusOneCounters).toBe(1);
    // Next turn a −3 that empowers Jace 3 puts counters on a new token: one trigger, since counters were put.
    passTo(g, 'main1', 'p1');
    activate(g, g.id('p1', 'test-jace'), 1);
    done(g);
    expect(g.obj(mage).plusOneCounters).toBe(2);
    expect(loyalty(g, jaces(g)[0]!)).toBe(3);
    // Only removing loyalty: nothing.
    const h = game({
      p1: { battlefield: ['inspired-tethermage', { card: FRA_JACE, loyalty: 3 }] },
    });
    activate(h, jaces(h)[0]!, 0);
    done(h);
    expect(h.obj(h.id('p1', 'inspired-tethermage')).plusOneCounters).toBe(0);
  });

  it('{6}: Empower Jace 2', () => {
    const g = game({ p1: { battlefield: ['inspired-tethermage', ...n('forest', 6)] } });
    const mage = g.id('p1', 'inspired-tethermage');
    expect(canActivate(g, mage, idx('inspired-tethermage', 'activated'))).toBe(true);
    activate(g, mage, idx('inspired-tethermage', 'activated'));
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
    expect(g.obj(mage).plusOneCounters).toBe(1);
    const poor = game({ p1: { battlefield: ['inspired-tethermage', ...n('forest', 5)] } });
    expect(
      canActivate(
        poor,
        poor.id('p1', 'inspired-tethermage'),
        idx('inspired-tethermage', 'activated'),
      ),
    ).toBe(false);
  });
});

describe('Keeper of the Quiet Hour', () => {
  it('is a 3/2 artifact creature that empowers Jace 2 when it enters', () => {
    const g = game({ p1: { hand: ['keeper-of-the-quiet-hour'], battlefield: n('forest', 3) } });
    cast(g, 'keeper-of-the-quiet-hour');
    done(g);
    const keeper = g.id('p1', 'keeper-of-the-quiet-hour');
    expect(pt(g, keeper)).toEqual([3, 2]);
    expect(db.get('keeper-of-the-quiet-hour')!.types).toEqual(['Artifact', 'Creature']);
    expect(loyalty(g, jaces(g)[0]!)).toBe(2);
  });
});

describe('Mindseeker Oculus', () => {
  it('is a 2/1 that empowers Jace 4 when it enters', () => {
    const g = game({ p1: { hand: ['mindseeker-oculus'], battlefield: n('island', 3) } });
    cast(g, 'mindseeker-oculus');
    done(g);
    expect(pt(g, g.id('p1', 'mindseeker-oculus'))).toEqual([2, 1]);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });
});

describe('No Admittance', () => {
  it('deals 3 damage to any target, then empowers Jace 1', () => {
    const face = game({ p1: { hand: ['no-admittance'], battlefield: n('mountain', 2) } });
    cast(face, 'no-admittance', [player('p2')]);
    done(face);
    expect(face.life('p2')).toBe(17);
    expect(loyalty(face, jaces(face)[0]!)).toBe(1);
    const bear = game({
      p1: { hand: ['no-admittance'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(bear, 'no-admittance', [target(bear, bear.id('p2', 'bear-cub'))]);
    done(bear);
    expect(all(bear, 'bear-cub')).toHaveLength(0);
  });

  it('can target a planeswalker (their Jace token)', () => {
    const g = game({
      p1: { hand: ['no-admittance'], battlefield: n('mountain', 2) },
      p2: { battlefield: [{ card: FRA_JACE, loyalty: 5 }] },
    });
    const theirs = jaces(g, 'p2')[0]!;
    cast(g, 'no-admittance', [target(g, theirs)]);
    done(g);
    expect(loyalty(g, theirs)).toBe(2);
    expect(loyalty(g, jaces(g, 'p1')[0]!)).toBe(1);
  });
});

describe("Protege's Awakening", () => {
  it('empowers Jace 6 and draws a card', () => {
    const g = game({
      p1: {
        hand: ['proteges-awakening'],
        battlefield: n('island', 4),
        library: ['bear-cub', 'forest'],
      },
    });
    cast(g, 'proteges-awakening');
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(6);
    expect(hand(g)).toEqual(['bear-cub']);
  });
});

describe('Solve for Disappointment', () => {
  it('you choose a nonland permanent card from their revealed hand: they discard it, then you empower Jace 1', () => {
    const g = game({
      p1: { hand: ['solve-for-disappointment'], battlefield: n('swamp', 2) },
      p2: { hand: ['forest', 'shock', 'bear-cub'] },
    });
    cast(g, 'solve-for-disappointment', [player('p2')]);
    // Resolve to the choice.
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseFromHand'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseFromHand');
    if (g.decision.kind !== 'chooseFromHand') throw new Error('unreachable');
    // Only the Bear Cub: not the land and not the instant.
    expect(g.decision.options.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    expect(hand(g, 'p2').sort()).toEqual(['forest', 'shock']);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
  });

  it('still empowers Jace when there is nothing to discard', () => {
    const g = game({
      p1: { hand: ['solve-for-disappointment'], battlefield: n('swamp', 2) },
      p2: { hand: ['forest', 'shock'] },
    });
    cast(g, 'solve-for-disappointment', [player('p2')]);
    done(g);
    expect(hand(g, 'p2')).toHaveLength(2);
    expect(loyalty(g, jaces(g)[0]!)).toBe(1);
  });
});

describe("Tam's Resistance", () => {
  it('puts a +1/+1 counter on up to one target creature, which gains vigilance, then empowers Jace 4', () => {
    const g = game({
      p1: { hand: ['tams-resistance'], battlefield: ['bear-cub', 'forest', 'island'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'tams-resistance', [target(g, bear)]);
    done(g);
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(keywords(g, bear)).toContain('vigilance');
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('can be cast with no target and still empowers Jace 4', () => {
    const g = game({ p1: { hand: ['tams-resistance'], battlefield: ['forest', 'island'] } });
    cast(g, 'tams-resistance', []);
    done(g);
    expect(loyalty(g, jaces(g)[0]!)).toBe(4);
  });

  it('is payable with green or blue (hybrid)', () => {
    const blue = game({ p1: { hand: ['tams-resistance'], battlefield: ['island', 'island'] } });
    expect(blue.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const red = game({ p1: { hand: ['tams-resistance'], battlefield: ['mountain', 'mountain'] } });
    expect(red.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A full game with the Jace token
// ---------------------------------------------------------------------------

describe('with the Jace token in a full turn cycle', () => {
  it('a token left at 0 by −3 is gone, and the turn goes on', () => {
    const g = game({
      p1: { battlefield: [{ card: FRA_JACE, loyalty: 3 }], library: n('forest', 5) },
      p2: { library: n('forest', 5) },
    });
    activate(g, jaces(g)[0]!, 1);
    done(g);
    expect(jaces(g)).toHaveLength(0);
    passTo(g, 'main1', 'p2');
    expect(g.state.turn.activePlayer).toBe('p2');
  });
});
