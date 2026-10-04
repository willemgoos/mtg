import type { TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Heroes for Hire packet (docs/marvel-jumpstart.md).

const HIRE = [
  'Stark Industries Executive',
  "K'un-Lun Warrior",
  'Misty Knight, Hero for Hire',
  'Iron Fist, Hero for Hire',
  'Contract Hero',
  'Jessica Jones, Private Eye',
  'Luke Cage, Hero for Hire',
  'Red Hulk',
  'Bionic Blow',
  'Big Score',
  'Heroes for Hire',
  'Marvelous Melee',
  'Thriving Bluff',
  'Mountain',
];

type G = ReturnType<typeof game>;

/** Answers 'chooseOption' decisions with `index` and resolves the stack. */
const resolveChoosing = (g: G, index: number) => {
  for (let i = 0; i < 20; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'chooseOption') g.do({ type: 'chooseOption', player: g.actor, index });
    else if (d.kind !== 'priority') g.do(g.legal()[0]!);
    else return g;
  }
  return g;
};

describe('Heroes for Hire packet', () => {
  it('has every card implemented', () => {
    for (const name of HIRE) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('Iron Fist, Hero for Hire', () => {
  const setup = () => {
    const g = game({
      p1: { battlefield: ['iron-fist-hero-for-hire', ...n('mountain', 8)] },
      p2: { battlefield: ['bear-cub', 'rumbling-baloth'] },
    });
    const fist = g.id('p1', 'iron-fist-hero-for-hire');
    g.obj(fist).zoneTurn = 0;
    return { g, fist, bear: g.id('p2', 'bear-cub'), baloth: g.id('p2', 'rumbling-baloth') };
  };
  const activate = (g: G, source: string, targets: TargetChoice[]) =>
    g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex: 1, targets });

  it('has trample and prowess', () => {
    const g = game({ p1: { battlefield: ['iron-fist-hero-for-hire'] } });
    const fist = g.id('p1', 'iron-fist-hero-for-hire');
    expect(cardDb.get('iron-fist-hero-for-hire')!.keywords).toContain('trample');
    expect(pt(g, fist)).toEqual([2, 2]);
  });

  /** Answers each of Iron Fist's "divide" prompts with the option starting with the next label. */
  const divide = (g: G, ...labels: string[]) => {
    for (const label of labels) {
      settle(g);
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error(`no choice for ${label}`);
      const index = d.options.findIndex((o) => o.label.startsWith(label));
      expect(index, label).toBeGreaterThanOrEqual(0);
      g.do({ type: 'chooseOption', player: g.actor, index });
    }
    return settle(g);
  };

  it('power-up deals 5 damage to one target and puts five counters on him', () => {
    const { g, fist, baloth } = setup();
    divide(activate(g, fist, []), "5 damage to Rumbling Baloth (opponent's)");
    // A 4/4: 5 damage kills it.
    expect(g.state.battlefield).not.toContain(baloth);
    expect(g.obj(fist).plusOneCounters).toBe(5);
    expect(pt(g, fist)).toEqual([7, 7]);
  });

  it('power-up divides the damage among up to five targets', () => {
    const { g, fist, bear, baloth } = setup();
    divide(
      activate(g, fist, []),
      "1 damage to Rumbling Baloth (opponent's)",
      "2 damage to Bear Cub (opponent's)",
      '1 damage to Your opponent',
      '1 damage to You',
    );
    expect(g.decision.kind).toBe('priority');
    expect(g.obj(baloth).damage).toBe(1);
    expect(g.state.battlefield).not.toContain(bear);
    expect(g.state.players.p2.life).toBe(19);
    expect(g.state.players.p1.life).toBe(19);
    expect(g.obj(fist).plusOneCounters).toBe(5);
  });

  it('each target is chosen once, and choosing none is allowed', () => {
    const { g, fist } = setup();
    activate(g, fist, []);
    settle(g);
    const first = g.decision;
    if (first.kind !== 'chooseOption') throw new Error('no choice');
    expect(first.options[0]!.label).toBe('No targets');
    divide(g, '3 damage to Your opponent');
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no choice');
    expect(d.options.some((o) => o.label.includes('Your opponent'))).toBe(false);
    expect(d.options.some((o) => o.label === 'No targets')).toBe(false);
  });

  it('power-up can hit a player', () => {
    const { g, fist } = setup();
    divide(activate(g, fist, []), '5 damage to Your opponent');
    expect(g.state.players.p2.life).toBe(15);
  });
});

describe('Contract Hero', () => {
  it('makes a Treasure when it enters', () => {
    const g = game({ p1: { hand: ['contract-hero'], battlefield: n('mountain', 3) } });
    settle(cast(g, 'contract-hero'));
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('sacrifices an artifact when it attacks to get +2/+0', () => {
    const g = game({ p1: { battlefield: ['contract-hero', 'treasure-token'] } });
    const hero = g.id('p1', 'contract-hero');
    g.passUntilStep('beginCombat').passBoth().attack(hero);
    resolveChoosing(g, 0);
    expect(all(g, 'treasure-token')).toHaveLength(0);
    expect(pt(g, hero)).toEqual([4, 3]);
  });

  it('discards a card when it attacks to get +2/+0', () => {
    const g = game({ p1: { battlefield: ['contract-hero'], hand: ['mountain'] } });
    const hero = g.id('p1', 'contract-hero');
    g.passUntilStep('beginCombat').passBoth().attack(hero);
    resolveChoosing(g, 1);
    expect(handSize(g, 'p1')).toBe(0);
    expect(pt(g, hero)).toEqual([4, 3]);
  });

  it('gets nothing without a card to discard', () => {
    const g = game({ p1: { battlefield: ['contract-hero'] } });
    const hero = g.id('p1', 'contract-hero');
    g.passUntilStep('beginCombat').passBoth().attack(hero);
    resolveChoosing(g, 1);
    expect(pt(g, hero)).toEqual([2, 3]);
  });
});

describe('Luke Cage, Hero for Hire', () => {
  it('makes a Treasure at the beginning of combat on your turn', () => {
    const g = game({ p1: { battlefield: ['luke-cage-hero-for-hire'] } });
    expect(cardDb.get('luke-cage-hero-for-hire')!.keywords).toContain('trample');
    g.passUntilStep('beginCombat');
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it("doesn't on an opponent's turn", () => {
    const g = game({ p1: { battlefield: ['luke-cage-hero-for-hire'] }, active: 'p2' });
    g.passUntilStep('beginCombat');
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(0);
  });
});

describe('Bionic Blow', () => {
  it('pumps your creature by X, then it deals damage equal to its power', () => {
    const g = game({
      p1: { hand: ['bionic-blow'], battlefield: ['bear-cub', ...n('mountain', 5)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const baloth = g.id('p2', 'rumbling-baloth');
    settle(cast(g, 'bionic-blow', [g.ref(bear), g.ref(baloth)], { x: 3 }));
    expect(pt(g, bear)).toEqual([5, 2]);
    expect(g.state.battlefield).not.toContain(baloth);
    expect(g.obj(bear).damage).toBe(0);
  });

  it('can just pump', () => {
    const g = game({
      p1: { hand: ['bionic-blow'], battlefield: ['bear-cub', ...n('mountain', 3)] },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'bionic-blow', [g.ref(bear)], { x: 1 }));
    expect(pt(g, bear)).toEqual([3, 2]);
  });
});

describe('Heroes for Hire', () => {
  it('makes three Treasures; sacrificing one exiles the top card, playable this turn', () => {
    const g = game({
      p1: { hand: ['heroes-for-hire'], battlefield: n('mountain', 5), library: ['mountain'] },
    });
    settle(cast(g, 'heroes-for-hire'));
    expect(all(g, 'treasure-token')).toHaveLength(3);
    const hire = g.id('p1', 'heroes-for-hire');
    const act = g.legal().find((a) => a.type === 'activateAbility' && a.source === hire);
    expect(act).toBeDefined();
    settle(g.do(act!));
    expect(all(g, 'treasure-token')).toHaveLength(2);
    const top = g.state.players.p1.exile[0]!;
    expect(g.obj(top).defId).toBe('mountain');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });
});

describe('Marvelous Melee', () => {
  it('deals 6 damage to target creature', () => {
    const g = game({
      p1: { hand: ['marvelous-melee'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    settle(cast(g, 'marvelous-melee', [g.ref(baloth)]));
    expect(g.state.battlefield).not.toContain(baloth);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: { hand: ['marvelous-melee'], battlefield: n('mountain', 2), library: ['mountain'] },
    });
    const card = g.id('p1', 'marvelous-melee', 'hand');
    g.do({ type: 'activateAbility', player: 'p1', source: card, abilityIndex: 0, targets: [] });
    for (let i = 0; i < 10 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      if (g.decision.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(g.state.players.p1.graveyard).toContain(card);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['mountain']);
  });
});
