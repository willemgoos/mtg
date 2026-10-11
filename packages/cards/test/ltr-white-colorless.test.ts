import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { casts, done, keywords, names } from './hob-white-helpers.ts';
import {
  attack,
  canUse,
  resolveAll,
  ringOf,
  toBlockers,
  use,
  type Game,
} from './ltr-white-helpers.ts';

// Lord of the Rings 21b: the colorless cards.

/** Answers a scry by keeping every card on top. */
function keepScry(g: Game): void {
  for (let i = 0; i < 10 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
  const d = g.decision;
  if (d.kind !== 'scry') throw new Error(`Expected a scry, got ${d.kind}`);
  g.do({ type: 'scry', player: d.player, top: [...d.cards], bottom: [] });
}

describe('Barrow-Blade', () => {
  const setup = () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', 'barrow-blade', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    return g;
  };
  it('equips for {1} and gives +1/+1', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', 'barrow-blade'), 2, [lions]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
  });
  it('makes a creature that blocks the equipped creature lose all abilities', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    g.obj(g.id('p1', 'barrow-blade')).attachedTo = lions;
    expect(keywords(g, angel)).toEqual(expect.arrayContaining(['flying', 'vigilance']));
    attack(g, [lions]);
    toBlockers(g);
    g.block([angel, lions]);
    resolveAll(g);
    expect(keywords(g, angel)).toEqual([]);
  });
  it('makes a creature the equipped creature blocks lose all abilities', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', 'barrow-blade'] },
      p2: { battlefield: ['east-mark-cavalier'] },
      active: 'p2',
    });
    const lions = g.id('p1', 'savannah-lions');
    const cavalier = g.id('p2', 'east-mark-cavalier');
    g.obj(g.id('p1', 'barrow-blade')).attachedTo = lions;
    expect(keywords(g, cavalier)).toContain('vigilance');
    attack(g, [cavalier]);
    toBlockers(g);
    g.block([lions, cavalier]);
    resolveAll(g);
    expect(keywords(g, cavalier)).toEqual([]);
  });
  it('does nothing for a creature the equipped creature does not fight', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    g.obj(g.id('p1', 'barrow-blade')).attachedTo = lions;
    attack(g, [lions]);
    toBlockers(g);
    g.block();
    resolveAll(g);
    expect(keywords(g, angel)).toEqual(expect.arrayContaining(['flying']));
  });
});

describe('Ent-Draught Basin', () => {
  const x = (g: Game, basin: string, creature: string, amount: number) => {
    const a = g
      .legal()
      .find(
        (act) =>
          act.type === 'activateAbility' &&
          act.source === basin &&
          (act.x ?? 0) === amount &&
          act.targets.some((t) => 'object' in t && t.object.id === creature),
      );
    return a;
  };
  it('puts a +1/+1 counter on a creature with power X', () => {
    const g = game({
      p1: {
        battlefield: ['ent-draught-basin', 'savannah-lions', 'serra-angel', ...n('plains', 4)],
      },
    });
    const basin = g.id('p1', 'ent-draught-basin');
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    // Only the right X for each creature is offered.
    expect(x(g, basin, lions, 2)).toBeDefined();
    expect(x(g, basin, lions, 3)).toBeUndefined();
    expect(x(g, basin, angel, 4)).toBeDefined();
    expect(x(g, basin, angel, 2)).toBeUndefined();
    g.do(x(g, basin, lions, 2)!);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    // X was paid with two of the four lands, and the Basin is tapped.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped),
    ).toHaveLength(2);
    expect(g.obj(basin).tapped).toBe(true);
  });
  it('works with X = 0 on a creature with power 0', () => {
    const g = game({ p1: { battlefield: ['ent-draught-basin', 'fog-bank'] } });
    const basin = g.id('p1', 'ent-draught-basin');
    const bank = g.id('p1', 'fog-bank');
    const a = x(g, basin, bank, 0);
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(pt(g, bank)).toEqual([1, 3]);
  });
  it('is activated only as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['ent-draught-basin', 'fog-bank'] },
      p2: {},
      step: 'beginCombat',
    });
    expect(canUse(g, g.id('p1', 'ent-draught-basin'), 0)).toBe(false);
  });
});

describe('Inherited Envelope', () => {
  it('tempts you as it enters', () => {
    const g = game({ p1: { hand: ['inherited-envelope'], battlefield: n('plains', 3) } });
    cast(g, 'inherited-envelope');
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
  });
  it('taps for one mana of any color', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['inherited-envelope'] } });
    expect(casts(g, 'shock').length).toBeGreaterThan(0);
  });
});

describe('Lembas', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['lembas'],
        battlefield: n('plains', 4),
        library: ['island', 'swamp', 'mountain', 'forest'],
      },
    });
  it('scries 1, then draws a card as it enters', () => {
    const g = setup();
    cast(g, 'lembas');
    keepScry(g);
    done(g);
    expect(names(g, 'p1', 'hand')).toEqual(['island']);
  });
  it("can be sacrificed for 3 life and is then shuffled into its owner's library", () => {
    const g = setup();
    cast(g, 'lembas');
    keepScry(g);
    done(g);
    const lembas = g.id('p1', 'lembas');
    expect(g.state.battlefield).toContain(lembas);
    use(g, lembas, 1);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(g.zoneOf(lembas)).toBe('library');
    expect(g.state.players.p1.library).toContain(lembas);
    expect(g.state.players.p1.graveyard).not.toContain(lembas);
  });
});

describe('Mirror of Galadriel', () => {
  const setup = (legendary: string[], lands: number) =>
    game({
      p1: {
        battlefield: ['mirror-of-galadriel', ...legendary, ...n('plains', lands)],
        library: ['island', 'swamp', 'mountain'],
      },
    });
  it('scries 1, then draws, for {5}', () => {
    const g = setup([], 5);
    use(g, g.id('p1', 'mirror-of-galadriel'), 0);
    keepScry(g);
    done(g);
    expect(names(g, 'p1', 'hand')).toEqual(['island']);
  });
  it('costs {1} less for each legendary creature you control (the Mirror itself is not a creature)', () => {
    expect(canUse(setup([], 4), 'o1', 0)).toBe(false);
    const one = setup(['faramir-field-commander'], 4);
    expect(canUse(one, one.id('p1', 'mirror-of-galadriel'), 0)).toBe(true);
    const none = setup([], 4);
    expect(canUse(none, none.id('p1', 'mirror-of-galadriel'), 0)).toBe(false);
    const two = setup(['faramir-field-commander', 'samwise-the-stouthearted'], 3);
    expect(canUse(two, two.id('p1', 'mirror-of-galadriel'), 0)).toBe(true);
    const twoShort = setup(['faramir-field-commander', 'samwise-the-stouthearted'], 2);
    expect(canUse(twoShort, twoShort.id('p1', 'mirror-of-galadriel'), 0)).toBe(false);
  });
});
