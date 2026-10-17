import { createEngine, getCharacteristics, getColors, type CardDefinition } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { mapKeywords } from '../src/build.ts';
import {
  animateSelf,
  bargain,
  castAdventureSpell,
  celebrationAtCombat,
  celebrationBoost,
  createRole,
  enchantedCreaturesYouControlGet,
  ifBargained,
  instantSorceryOrAdventureCardsInGraveyard,
  ROLE,
  roleToken,
  sphereLand,
  tapAndStun,
  whenEnchantmentYouControlToGraveyard,
  whenEntersIfBargained,
  whenThisAttacks,
  whenYouTapOpponentCreature,
  WOE_ROLE_TOKENS,
} from '../src/woe-vocab.ts';
import { cardDb } from '../src/index.ts';

// Wilds of Eldraine (23a): the builders produce what the engine runs.

const card = (d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition => ({
  name: d.id,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: [],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...d,
});
const land = (id: string, produces: 'W' | 'U' | 'B' | 'R' | 'G'): CardDefinition =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, ...extra });
const one = (c: 'W' | 'U' | 'B' | 'R' | 'G') => ({ generic: 0, colored: { [c]: 1 } });
const t0 = { target: 0 } as const;

const DB = new Map(
  [
    land('plains', 'W'),
    land('swamp', 'B'),
    land('mountain', 'R'),
    land('forest', 'G'),
    ...WOE_ROLE_TOKENS,
    creature('bear', 2, 2),
    creature('ogre', 3, 3),
    card({ id: 'trinket', types: ['Artifact'] }),
    // Monstrous Rage's Role half and Spiteful Hexmage's.
    card({
      id: 'monster-rage',
      types: ['Sorcery'],
      manaCost: one('R'),
      spell: { targets: [{ what: 'creature' }], effects: [createRole('Monster')] },
    }),
    card({
      id: 'wicked-mark',
      types: ['Sorcery'],
      manaCost: one('B'),
      spell: {
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [createRole('Wicked')],
      },
    }),
    card({
      id: 'virtue',
      types: ['Sorcery'],
      manaCost: one('W'),
      spell: { targets: [{ what: 'creature' }], effects: [createRole('Virtuous')] },
    }),
    // Candy Grapple.
    card({
      id: 'grapple',
      types: ['Instant'],
      manaCost: { generic: 1, colored: { B: 1 } },
      ...bargain(),
      spell: {
        targets: [{ what: 'creature' }],
        effects: [
          ifBargained(
            [{ kind: 'pump', to: t0, power: -5, toughness: -5 }],
            [{ kind: 'pump', to: t0, power: -3, toughness: -3 }],
          ),
        ],
      },
    }),
    // Ice Out: counter target spell; {1} less bargained.
    card({
      id: 'ice-out',
      types: ['Instant'],
      manaCost: { generic: 1, colored: { U: 2 } },
      ...bargain({ costReduction: 1 }),
      spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: t0 }] },
    }),
    creature('negotiator', 3, 5, {
      manaCost: one('B'),
      ...bargain(),
      abilities: [whenEntersIfBargained([{ kind: 'loseLife', who: 'eachOpponent', amount: 3 }])],
    }),
    creature('mice', 3, 1, { abilities: [celebrationBoost(0, 2)] }),
    creature('pests', 2, 2, {
      abilities: [celebrationAtCombat([{ kind: 'counters', to: 'self', amount: 1 }])],
    }),
    card({
      id: 'bivouac',
      types: ['Land'],
      entersTapped: true,
      abilities: [
        { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
        { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
        animateSelf(
          { generic: 1, colored: { R: 1, W: 1 } },
          { power: 2, toughness: 2, colors: ['R', 'W'], subtype: 'Ox' },
        ),
        whenThisAttacks(
          [{ kind: 'counters', to: t0, amount: 1 }],
          [{ what: 'creature', controller: 'you' }],
        ),
      ],
    }),
    card({ id: 'basilica', types: ['Land'], subtypes: ['Sphere'], ...sphereLand('W') }),
    creature('sentry', 2, 3, {
      abilities: [
        whenYouTapOpponentCreature([{ kind: 'pump', to: 'self', power: 2, toughness: 1 }]),
      ],
    }),
    card({
      id: 'freeze',
      types: ['Sorcery'],
      manaCost: one('W'),
      spell: {
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: tapAndStun(t0, 3),
      },
    }),
    creature('visitor', 2, 2, {
      abilities: [
        whenEnchantmentYouControlToGraveyard([
          { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
        ]),
      ],
    }),
    card({
      id: 'tale',
      types: ['Enchantment'],
      abilities: [enchantedCreaturesYouControlGet(2, 2)],
    }),
    creature('pixie', 3, 3, {
      abilities: [castAdventureSpell([{ kind: 'draw', who: 'controller', amount: 1 }])],
    }),
    card({
      id: 'firebolt',
      types: ['Instant'],
      manaCost: one('R'),
      spell: {
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: instantSorceryOrAdventureCardsInGraveyard, to: t0 }],
      },
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(DB);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(DB, spec));
const castFirst = (
  g: GameDriver,
  defId: string,
  pick: (a: { kicked?: boolean }) => boolean = () => true,
) => {
  const card = g.id('p1', defId, 'hand');
  const a = g.legal('p1').find((x) => x.type === 'castSpell' && x.card === card && pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const settle = (g: GameDriver) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};
const roles = (g: GameDriver, id: string) =>
  g.state.battlefield.filter((x) => g.state.objects[x]!.defId === id);

describe('Role tokens', () => {
  it('seven colorless Aura Role tokens named after their role', () => {
    expect(WOE_ROLE_TOKENS.map((r) => r.name)).toEqual([
      'Cursed Role',
      'Monster Role',
      'Royal Role',
      'Sorcerer Role',
      'Virtuous Role',
      'Wicked Role',
      'Young Hero Role',
    ]);
    for (const r of WOE_ROLE_TOKENS) {
      expect(r.isToken).toBe(true);
      expect(r.colors).toEqual([]);
      expect(r.types).toEqual(['Enchantment']);
      expect(r.subtypes).toEqual(['Aura', 'Role']);
      expect(r.enchant).toEqual({ what: 'creature' });
    }
    expect(roleToken('Wicked', 'other-id').id).toBe('other-id');
  });

  it('createRole attaches the Role; a second Role of the same player replaces the first', () => {
    const g = game({
      p1: { hand: ['monster-rage', 'wicked-mark'], battlefield: ['mountain', 'swamp', 'bear'] },
    });
    const bear = g.id('p1', 'bear');
    castFirst(g, 'monster-rage');
    settle(g);
    expect(getCharacteristics(g.state, DB, bear).power).toBe(3);
    castFirst(g, 'wicked-mark');
    settle(g);
    expect(roles(g, ROLE.Monster)).toHaveLength(0);
    expect(roles(g, ROLE.Wicked)).toHaveLength(1);
    // The Monster Role went to the graveyard; the Wicked one is there now (+1/+1, no trample).
    expect(getCharacteristics(g.state, DB, bear).keywords.has('trample')).toBe(false);
    expect(getCharacteristics(g.state, DB, bear).power).toBe(3);
  });

  it("Virtuous counts the enchantments you control (a Role you control on an opponent's creature too)", () => {
    const g = game({
      p1: { hand: ['virtue'], battlefield: ['plains', 'tale'] },
      p2: { battlefield: ['ogre'] },
    });
    const ogre = g.id('p2', 'ogre');
    castFirst(g, 'virtue');
    settle(g);
    // p1 controls the Role and A Tale for the Ages: +2/+2 (the Tale counts only p1's own creatures).
    expect(getCharacteristics(g.state, DB, ogre).power).toBe(5);
  });

  it('a Wicked Role going to the graveyard: both its trigger and an enchantment-to-graveyard trigger', () => {
    const g = game({
      p1: {
        hand: ['wicked-mark', 'monster-rage'],
        battlefield: ['swamp', 'mountain', 'bear', 'visitor'],
      },
    });
    castFirst(g, 'wicked-mark');
    settle(g);
    castFirst(g, 'monster-rage');
    // Monstrous Rage could target the opponent's creatures too: there are none, so it's on ours (the first target).
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});

describe('bargain', () => {
  it('builds a kicker that sacrifices an artifact, enchantment, or token, and "if bargained"', () => {
    const b = bargain({ costReduction: 2 }).kicker!;
    expect(b.as).toBe('bargain');
    expect(b.costReduction).toBe(2);
    expect(b.sacrifice).toEqual({
      anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }],
    });
    const g = game({
      p1: { hand: ['grapple'], battlefield: ['swamp', 'swamp', 'trinket'] },
      p2: { battlefield: ['ogre'] },
    });
    castFirst(g, 'grapple', (a) => !!a.kicked);
    settle(g);
    expect(g.zoneOf(g.id('p2', 'ogre', 'graveyard'))).toBe('graveyard');
    expect(
      g.state.players.p1.graveyard.some((id) => g.state.objects[id]!.defId === 'trinket'),
    ).toBe(true);
  });

  it('"when this creature enters, if it was bargained"', () => {
    const g = game({ p1: { hand: ['negotiator'], battlefield: ['swamp', 'trinket'] } });
    castFirst(g, 'negotiator', (a) => !!a.kicked);
    settle(g);
    expect(g.life('p2')).toBe(17);
  });
});

describe('celebration', () => {
  it('the static and the beginning-of-combat trigger', () => {
    const g = game({
      p1: { hand: ['trinket', 'tale'], battlefield: ['mice', 'pests'] },
    });
    castFirst(g, 'trinket');
    settle(g);
    expect(getCharacteristics(g.state, DB, g.id('p1', 'mice')).toughness).toBe(1);
    castFirst(g, 'tale');
    settle(g);
    expect(getCharacteristics(g.state, DB, g.id('p1', 'mice')).toughness).toBe(3);
    g.passBoth();
    settle(g);
    expect(g.state.objects[g.id('p1', 'pests')]!.plusOneCounters).toBe(1);
  });
});

describe('lands', () => {
  it('animateSelf: a 2/2 red and white Ox until end of turn, still a land', () => {
    const g = game({ p1: { battlefield: ['bivouac', 'mountain', 'plains', 'mountain'] } });
    const b = g.id('p1', 'bivouac');
    const a = g
      .legal('p1')
      .find((x) => x.type === 'activateAbility' && x.source === b && x.abilityIndex === 2);
    g.do(a!);
    settle(g);
    const c = getCharacteristics(g.state, DB, b);
    expect(c.types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(c.subtypes).toContain('Ox');
    expect([...getColors(g.state, DB, b)].sort()).toEqual(['R', 'W']);
  });

  it('sphereLand: enters tapped, {1}{W}, {T}, sacrifice: draw', () => {
    const d = DB.get('basilica')!;
    expect(d.entersTapped).toBe(true);
    const g = game({ p1: { battlefield: ['basilica', 'plains', 'plains'] } });
    const s = g.id('p1', 'basilica');
    const a = g
      .legal('p1')
      .find((x) => x.type === 'activateAbility' && x.source === s && x.abilityIndex === 1);
    const hand = g.state.players.p1.hand.length;
    g.do(a!);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand + 1);
  });
});

describe('tapping, enchantments, Adventures', () => {
  it('whenYouTapOpponentCreature and tapAndStun', () => {
    const g = game({
      p1: { hand: ['freeze'], battlefield: ['plains', 'sentry'] },
      p2: { battlefield: ['ogre'] },
    });
    castFirst(g, 'freeze');
    settle(g);
    expect(getCharacteristics(g.state, DB, g.id('p1', 'sentry')).power).toBe(4);
    expect(g.state.objects[g.id('p2', 'ogre')]!.counters?.stun).toBe(3);
  });

  it('the real Adventure cards have an Adventure, Omens do not', () => {
    // Bramble Familiar isn't in the pool yet (23b); a Final Fantasy or Tarkir card is enough for the Omen side.
    const omen = [...cardDb.values()].find(
      (d) => d.adventure && d.back && cardDb.get(d.back)?.subtypes.includes('Omen'),
    );
    expect(omen).toBeDefined();
    const g = new GameDriver(
      createEngine(new Map([...DB, [omen!.id, omen!], [omen!.back!, cardDb.get(omen!.back!)!]])),
      buildScenario(new Map([...DB, [omen!.id, omen!], [omen!.back!, cardDb.get(omen!.back!)!]]), {
        p1: { hand: ['firebolt'], battlefield: ['mountain'], graveyard: [omen!.id, 'grapple'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const card = g.id('p1', 'firebolt', 'hand');
    g.do(g.legal('p1').find((x) => x.type === 'castSpell' && x.card === card)!);
    settle(g);
    // Only Candy Grapple counts (an instant); the Omen card has no Adventure.
    expect(g.state.objects[g.id('p2', 'ogre')]!.damage).toBe(1);
  });

  it('keywords: Bargain, Role token and Celebration need no keyword of their own', () => {
    expect(mapKeywords(['Bargain', 'Role token'])).toEqual([]);
    expect(mapKeywords(['Celebration'], 'Celebration — This creature gets +0/+2 ...')).toEqual([]);
  });
});
