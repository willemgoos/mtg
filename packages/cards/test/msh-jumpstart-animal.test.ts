import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Animal packet (docs/marvel-jumpstart.md).

const ANIMAL = [
  'Lucky the Pizza Dog',
  'Guerrilla Gorilla',
  'Tigra, Feline Fury',
  'Wakandan Tusker',
  "Ant-Man's Army",
  'Tippy-Toe, Terrific Partner',
  'Pet Avengers',
  'Savage Land Dinosaur',
  'Go Nuts!',
  'Scout the City',
  'Beast Mode',
  'Heroic Feast',
  'Thriving Grove',
  'Forest',
];

type G = ReturnType<typeof game>;

/** Sacrifices the first Food token for {2}: gain 3 life. */
const eatFood = (g: G) => {
  const food = all(g, 'food-token')[0]!;
  return settle(
    g.do({ type: 'activateAbility', player: g.actor, source: food, abilityIndex: 0, targets: [] }),
  );
};

describe('Animal packet', () => {
  it('has every card implemented', () => {
    for (const name of ANIMAL) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('Lucky the Pizza Dog', () => {
  it('makes a Food when you cast a Cat, Dog or Hero spell, not for other spells', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'bear-cub'],
        battlefield: ['lucky-the-pizza-dog', ...n('forest', 2), 'plains'],
      },
    });
    settle(cast(g, 'savannah-lions'));
    expect(all(g, 'food-token')).toHaveLength(1);
    settle(cast(g, 'bear-cub'));
    expect(all(g, 'food-token')).toHaveLength(1);
  });

  it('gets a +1/+1 counter at the end step only if you gained life this turn', () => {
    const quiet = game({ p1: { battlefield: ['lucky-the-pizza-dog'] } });
    const q = quiet.id('p1', 'lucky-the-pizza-dog');
    quiet.passUntilStep('end');
    settle(quiet);
    expect(quiet.obj(q).plusOneCounters ?? 0).toBe(0);

    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['lucky-the-pizza-dog', ...n('plains', 3)] },
    });
    const lucky = g.id('p1', 'lucky-the-pizza-dog');
    settle(cast(g, 'savannah-lions'));
    eatFood(g);
    expect(g.life('p1')).toBe(23);
    g.passUntilStep('end');
    settle(g);
    expect(g.obj(lucky).plusOneCounters).toBe(1);
    expect(pt(g, lucky)).toEqual([3, 3]);
  });
});

describe('Wakandan Tusker', () => {
  it('gains 1 life and scries 1 whenever it becomes tapped (attacking)', () => {
    const g = game({ p1: { battlefield: ['wakandan-tusker'], library: n('forest', 2) } });
    const tusker = g.id('p1', 'wakandan-tusker');
    g.passUntilStep('beginCombat').passBoth().attack(tusker);
    settle(g);
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal()[0]!);
    settle(g);
    expect(g.life('p1')).toBe(21);
  });
});

describe('Tippy-Toe, Terrific Partner', () => {
  it('adds a Food to each token creation, and draws at your end step after gaining life', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['tippy-toe-terrific-partner', 'lucky-the-pizza-dog', ...n('plains', 3)],
        library: n('forest', 3),
      },
    });
    settle(cast(g, 'savannah-lions'));
    // Lucky's Food plus Tippy-Toe's.
    expect(all(g, 'food-token')).toHaveLength(2);
    eatFood(g);
    const hand = handSize(g, 'p1');
    g.passUntilStep('end');
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });

  it('adds a Food to token copies too', () => {
    const g = game({
      p1: {
        hand: ['multiversal-recruitment'],
        battlefield: ['tippy-toe-terrific-partner', 'bear-cub', ...n('island', 4)],
      },
    });
    settle(cast(g, 'multiversal-recruitment', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(all(g, 'bear-cub')).toHaveLength(2);
    expect(all(g, 'food-token')).toHaveLength(1);
  });

  it("doesn't draw if you didn't gain life", () => {
    const g = game({
      p1: { battlefield: ['tippy-toe-terrific-partner'], library: n('forest', 3) },
    });
    g.passUntilStep('end');
    settle(g);
    expect(handSize(g, 'p1')).toBe(0);
  });
});

describe('Scout the City', () => {
  it('Look Around mills three, takes a permanent card and gains 3 life', () => {
    const g = game({
      p1: {
        hand: ['scout-the-city'],
        battlefield: n('forest', 2),
        library: ['giant-growth', 'bear-cub', 'giant-growth', 'forest'],
      },
    });
    settle(cast(g, 'scout-the-city', [], { mode: 0 }));
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    settle(g);
    expect(g.id('p1', 'bear-cub', 'hand')).toBeTruthy();
    expect(g.state.players.p1.graveyard).toHaveLength(3); // two Giant Growths and the spell
    expect(g.state.players.p1.library).toHaveLength(1);
    expect(g.life('p1')).toBe(23);
  });

  it('Bring Down destroys a creature with flying, and only one', () => {
    const g = game({
      p1: { hand: ['scout-the-city'], battlefield: n('forest', 2) },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const bear = g.id('p2', 'bear-cub');
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.mode === 1 &&
            a.targets.some((t) => 'object' in t && t.object.id === bear),
        ),
    ).toBe(false);
    settle(cast(g, 'scout-the-city', [g.ref(angel)], { mode: 1 }));
    expect(g.zoneOf(angel)).toBe('graveyard');
  });
});

describe('Beast Mode', () => {
  it('gives +2/+2 and trample', () => {
    const g = game({ p1: { hand: ['beast-mode'], battlefield: ['bear-cub', ...n('forest', 2)] } });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'beast-mode', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(g.obj(bear).plusOneCounters ?? 0).toBe(0);
  });

  it('with teamwork also puts a +1/+1 counter on it (and taps a Wakandan Tusker)', () => {
    const g = game({
      p1: {
        hand: ['beast-mode'],
        battlefield: ['bear-cub', 'wakandan-tusker', ...n('forest', 2)],
        library: n('forest', 2),
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const tusker = g.id('p1', 'wakandan-tusker');
    cast(g, 'beast-mode', [g.ref(bear)], { kicked: true, teamwork: [tusker] });
    for (let i = 0; i < 10; i++) {
      settle(g);
      if (g.decision.kind !== 'scry') break;
      g.do(g.legal()[0]!);
    }
    expect(g.obj(tusker).tapped).toBe(true);
    expect(g.life('p1')).toBe(21);
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(pt(g, bear)).toEqual([5, 5]);
  });
});
