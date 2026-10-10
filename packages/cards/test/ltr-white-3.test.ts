import { describe, expect, it } from 'vitest';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { done, keywords, names, obj, on } from './hob-white-helpers.ts';
import {
  attack,
  canUse,
  ringOf,
  resolveAll,
  settleOn,
  tokensOf,
  use,
} from './ltr-white-helpers.ts';

// Lord of the Rings 21b: the white cards, part three (Nimble Hobbit to Éowyn).

describe('Nimble Hobbit', () => {
  const setup = (opts: { food?: boolean; lands?: number }) =>
    game({
      p1: {
        battlefield: [
          'nimble-hobbit',
          ...(opts.food ? ['food-token'] : []),
          ...n('plains', opts.lands ?? 0),
        ],
      },
      p2: { battlefield: ['serra-angel'] },
    });
  const attackWith = (g: ReturnType<typeof setup>) => attack(g, [g.id('p1', 'nimble-hobbit')]);

  it('taps a creature if you sacrifice a Food', () => {
    const g = setup({ food: true });
    attackWith(g);
    done(g, { option: /Sacrifice/ });
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
  });
  it('taps a creature if you pay {2}{W}', () => {
    const g = setup({ lands: 3 });
    attackWith(g);
    done(g, { option: /Pay/ });
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped),
    ).toHaveLength(3);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
  });
  it('offers both, and doing neither taps nothing and keeps the Food', () => {
    const g = setup({ food: true, lands: 3 });
    attackWith(g);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels).toHaveLength(3);
    expect(labels.some((l) => /Food/.test(l))).toBe(true);
    expect(labels.some((l) => /\{2\}\{W\}/.test(l))).toBe(true);
    done(g, { option: /neither/ });
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped)).toBe(
      false,
    );
  });
  it('asks nothing when it can do neither', () => {
    const g = setup({});
    attackWith(g);
    g.passBoth();
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
  });
});

describe('Rosie Cotton of South Lane', () => {
  it('makes a Food, and each token you create puts a +1/+1 counter on another creature', () => {
    const g = game({
      p1: {
        hand: ['rosie-cotton-of-south-lane'],
        battlefield: [...n('plains', 3), 'savannah-lions'],
      },
    });
    cast(g, 'rosie-cotton-of-south-lane');
    resolveAll(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
    // The Food she made set her second ability off: one counter, on the Lions (not on Rosie).
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'rosie-cotton-of-south-lane'))).toEqual([1, 1]);
  });
  it('triggers for tokens from other sources too', () => {
    const g = game({
      p1: {
        hand: ['second-breakfast'],
        battlefield: [...n('plains', 3), 'rosie-cotton-of-south-lane', 'savannah-lions'],
      },
    });
    cast(g, 'second-breakfast', [obj(g, g.id('p1', 'savannah-lions'))]);
    resolveAll(g, g.id('p1', 'savannah-lions'));
    // +2/+1 from the spell and a +1/+1 counter from Rosie.
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([5, 3]);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
});

describe('Samwise the Stouthearted', () => {
  it('returns a permanent card that went to your graveyard this turn, then the Ring tempts you', () => {
    const g = game({
      p1: {
        hand: ['samwise-the-stouthearted'],
        graveyard: ['giant-growth'],
        battlefield: [...n('plains', 2), 'savannah-lions'],
      },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    // The opponent kills the Lions this turn.
    g.pass();
    cast(g, 'lightning-strike', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(g.state.stack).toHaveLength(0);
    while (g.actor !== 'p1') g.pass();
    cast(g, 'samwise-the-stouthearted');
    g.pass();
    g.pass();
    // Only the Lions went to the graveyard from the battlefield this turn: the Giant Growth was there already.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const choices = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : 'player'));
    expect(new Set(choices)).toEqual(new Set(['savannah-lions']));
    settle(g);
    expect(names(g, 'p1', 'hand')).toContain('savannah-lions');
    expect(names(g, 'p1', 'graveyard')).toEqual(['giant-growth']);
    expect(ringOf(g)?.tempted).toBe(1);
    expect(ringOf(g)?.bearer?.id).toBe(g.id('p1', 'samwise-the-stouthearted'));
  });
  it('can choose nothing and the Ring still tempts you', () => {
    const g = game({
      p1: { hand: ['samwise-the-stouthearted'], battlefield: n('plains', 2) },
    });
    cast(g, 'samwise-the-stouthearted');
    resolveAll(g);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Saradoc, Master of Buckland', () => {
  it('makes a Halfling for itself and for each nontoken creature with power 2 or less', () => {
    const g = game({
      p1: {
        hand: ['saradoc-master-of-buckland', 'took-reaper', 'serra-angel'],
        battlefield: n('plains', 15),
      },
    });
    cast(g, 'saradoc-master-of-buckland');
    resolveAll(g);
    expect(tokensOf(g, 'ltr-halfling-token')).toHaveLength(1);
    // Took Reaper (2/1) is a nontoken creature with power 2 or less; the Halfling token entering does not count.
    cast(g, 'took-reaper');
    resolveAll(g);
    expect(tokensOf(g, 'ltr-halfling-token')).toHaveLength(2);
    // Serra Angel has power 4.
    cast(g, 'serra-angel');
    resolveAll(g);
    expect(tokensOf(g, 'ltr-halfling-token')).toHaveLength(2);
  });
  it('taps two other untapped Halflings to get +2/+0 and lifelink', () => {
    const g = game({
      p1: {
        battlefield: ['saradoc-master-of-buckland', 'ltr-halfling-token', 'ltr-halfling-token'],
      },
    });
    const saradoc = g.id('p1', 'saradoc-master-of-buckland');
    expect(pt(g, saradoc)).toEqual([2, 4]);
    use(g, saradoc, 1);
    resolveAll(g);
    expect(pt(g, saradoc)).toEqual([4, 4]);
    expect(keywords(g, saradoc)).toContain('lifelink');
    expect(tokensOf(g, 'ltr-halfling-token').every((id) => g.obj(id).tapped)).toBe(true);
    expect(g.obj(saradoc).tapped).toBe(false);
  });
  it('needs two other Halflings (Saradoc himself does not count)', () => {
    const g = game({
      p1: { battlefield: ['saradoc-master-of-buckland', 'ltr-halfling-token'] },
    });
    expect(canUse(g, g.id('p1', 'saradoc-master-of-buckland'), 1)).toBe(false);
  });
});

describe('Second Breakfast', () => {
  it('pumps up to two creatures and makes a Food', () => {
    const g = game({
      p1: { hand: ['second-breakfast'], battlefield: [...n('plains', 3), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'second-breakfast', [obj(g, lions), obj(g, angel)]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
    expect(pt(g, angel)).toEqual([6, 5]);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
  it('can be cast with no targets and still makes a Food', () => {
    const g = game({ p1: { hand: ['second-breakfast'], battlefield: n('plains', 3) } });
    cast(g, 'second-breakfast', []);
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
});

describe('Shire Shirriff', () => {
  const setup = (battlefield: string[]) => {
    const g = game({
      p1: { hand: ['shire-shirriff'], battlefield: [...n('plains', 2), ...battlefield] },
      p2: { hand: ['lightning-strike'], battlefield: ['serra-angel', ...n('mountain', 2)] },
    });
    // Permanents put on the battlefield by a test are not tokens unless told so.
    for (const id of g.state.battlefield)
      if (g.obj(id).defId === 'food-token') g.obj(id).isToken = true;
    return g;
  };
  it('sacrifices a token to exile a creature until it leaves the battlefield', () => {
    const g = setup(['food-token']);
    cast(g, 'shire-shirriff');
    done(g, { option: /Sacrifice/ });
    const angel = g.id('p2', 'serra-angel', 'exile');
    expect(g.zoneOf(angel)).toBe('exile');
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
    // The opponent kills the Shirriff: the Angel comes back.
    while (g.actor !== 'p2') g.pass();
    cast(g, 'lightning-strike', [obj(g, g.id('p1', 'shire-shirriff'))]);
    done(g);
    expect(g.zoneOf(g.id('p1', 'shire-shirriff', 'graveyard'))).toBe('graveyard');
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
  });
  it('can decline', () => {
    const g = setup(['food-token']);
    cast(g, 'shire-shirriff');
    done(g, { option: /neither/ });
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
  });
  it('asks nothing without a token (a nontoken creature cannot be sacrificed to it)', () => {
    const g = setup(['savannah-lions']);
    cast(g, 'shire-shirriff');
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
  });
});

describe('Slip On the Ring', () => {
  it('flickers a creature you own and the Ring tempts you', () => {
    const g = game({
      p1: { hand: ['slip-on-the-ring'], battlefield: ['plains', 'plains', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 2;
    const zccBefore = g.obj(lions).zcc;
    cast(g, 'slip-on-the-ring', [obj(g, lions)]);
    done(g);
    const back = g.id('p1', 'savannah-lions');
    // It left and came back: a new object (zone change counter) without its counters.
    expect(g.obj(back).zcc).not.toBe(zccBefore);
    expect(pt(g, back)).toEqual([2, 1]);
    expect(ringOf(g)?.tempted).toBe(1);
    expect(ringOf(g)?.bearer?.id).toBe(back);
  });
});

describe('Soldier of the Grey Host', () => {
  it('gives a creature +2/+0 as it enters', () => {
    const g = game({
      p1: {
        hand: ['soldier-of-the-grey-host'],
        battlefield: [...n('plains', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'soldier-of-the-grey-host');
    resolveAll(g, lions);
    expect(pt(g, lions)).toEqual([4, 1]);
    const soldier = g.id('p1', 'soldier-of-the-grey-host');
    expect(keywords(g, soldier)).toEqual(expect.arrayContaining(['flash', 'flying']));
  });
});

describe('Took Reaper', () => {
  it('tempts you when it dies', () => {
    const g = game({
      p1: { battlefield: ['took-reaper', 'savannah-lions'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    g.pass();
    cast(g, 'lightning-strike', [obj(g, g.id('p1', 'took-reaper'))]);
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
    expect(ringOf(g)?.bearer?.id).toBe(g.id('p1', 'savannah-lions'));
  });
});

describe('Éowyn, Lady of Rohan', () => {
  const toCombat = (g: ReturnType<typeof game>, target: string) => {
    for (let i = 0; i < 12 && g.state.turn.step !== 'beginCombat'; i++) g.pass();
    for (let i = 0; i < 6 && g.decision.kind === 'chooseTriggerTargets'; i++) settleOn(g, target);
  };
  it('gives first strike or vigilance, your choice', () => {
    const g = game({ p1: { battlefield: ['owyn-lady-of-rohan', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    toCombat(g, lions);
    done(g, { option: /Vigilance/ });
    expect(keywords(g, lions)).toContain('vigilance');
    expect(keywords(g, lions)).not.toContain('firstStrike');
  });
  it('gives both to an equipped creature, without a choice', () => {
    const g = game({
      p1: { battlefield: ['owyn-lady-of-rohan', 'savannah-lions', 'barrow-blade'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'barrow-blade')).attachedTo = lions;
    toCombat(g, lions);
    resolveAll(g);
    expect(g.decision.kind).not.toBe('chooseOption');
    expect(keywords(g, lions)).toEqual(expect.arrayContaining(['firstStrike', 'vigilance']));
  });
  it('makes equip abilities cost {1} less', () => {
    const g = game({
      p1: { battlefield: ['owyn-lady-of-rohan', 'savannah-lions', 'barrow-blade'] },
    });
    // Equip {1} costs {0}: no land needed.
    expect(canUse(g, g.id('p1', 'barrow-blade'), 2)).toBe(true);
    const h = game({ p1: { battlefield: ['savannah-lions', 'barrow-blade'] } });
    expect(canUse(h, h.id('p1', 'barrow-blade'), 2)).toBe(false);
  });
});
