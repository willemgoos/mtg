import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { bf, counters, done, gy, hand, keywords, toStep } from './tdm-green-helpers.ts';

// The Lord of the Rings 21d: the green rares of the packets' random slot.

const NAMES = [
  'Delighted Halfling',
  'Elven Chorus',
  'Fall of Gil-galad',
  'Fangorn, Tree Shepherd',
  'Last March of the Ents',
  'Legolas, Master Archer',
  'Radagast the Brown',
  'The Ring Goes South',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Resolves everything (bounded): scries keep the cards on top, triggers take their first real target, options take `option`. */
function run(g: GameDriver, option: number | RegExp = 0): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
    else if (d.kind === 'chooseOption') {
      const index =
        option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => option.test(o.label)),
            )
          : option;
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseObject') {
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action);
    } else if (d.kind === 'searchLibrary') done(g);
    else break;
  }
  return g;
}
/** The id of the object of this card in any zone. */
const anyId = (g: GameDriver, p: 'p1' | 'p2', defId: string) =>
  Object.values(g.state.objects).find((o) => o.owner === p && o.defId === defId)!.id;
/** Passes to the declare-attackers step of p1 and attacks with these. */
function attackWith(g: GameDriver, ...ids: string[]) {
  toStep(g, 'beginCombat');
  g.passBoth();
  g.attack(...ids);
  return g;
}

describe('every card is in the pool', () => {
  it('has all 8 green rares', () => {
    expect(NAMES).toHaveLength(8);
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('Delighted Halfling', () => {
  it('is a 1/2 that taps for {C}', () => {
    const g = game({ p1: { hand: ['arcane-signet'], battlefield: n('delighted-halfling', 2) } });
    expect(pt(g, g.id('p1', 'delighted-halfling'))).toEqual([1, 2]);
    // Two {C} pay for the Signet.
    cast(g, 'arcane-signet');
    done(g);
    expect(bf(g, 'arcane-signet')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(2);
  });
  it('is not itself uncounterable (the text is about the spell its mana is spent on)', () => {
    expect(cardDb.get('delighted-halfling')!.uncounterable).toBeFalsy();
  });
  it("makes mana of any color for a legendary spell, which then can't be countered", () => {
    const g = game({
      p1: { hand: ['agent-maria-hill'], battlefield: ['delighted-halfling'] },
      p2: { hand: ['counterspell'], battlefield: n('island', 2) },
    });
    cast(g, 'agent-maria-hill');
    const spell = anyId(g, 'p1', 'agent-maria-hill');
    expect(g.obj(spell).cantBeCountered).toBe(true);
    g.pass();
    // Counterspell is cast but can't counter it.
    cast(g, 'counterspell', [g.ref(spell)]);
    done(g);
    expect(bf(g, 'agent-maria-hill')).toHaveLength(1);
    expect(gy(g, 'p2')).toContain('counterspell');
  });
  it("can't make colored mana for a spell that isn't legendary", () => {
    const g = game({ p1: { hand: ['savannah-lions'], battlefield: ['delighted-halfling'] } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
  it("doesn't make a legendary spell uncounterable when other lands paid for it", () => {
    const g = game({
      p1: { hand: ['agent-maria-hill'], battlefield: ['plains', 'delighted-halfling'] },
    });
    cast(g, 'agent-maria-hill', [], { payWith: [g.id('p1', 'plains')] });
    expect(g.obj(anyId(g, 'p1', 'agent-maria-hill')).cantBeCountered).toBeFalsy();
  });
  it('makes a legendary spell uncounterable when it helps pay (generic and colored)', () => {
    const g = game({
      p1: { hand: ['giada-font-of-hope'], battlefield: ['plains', 'delighted-halfling'] },
    });
    cast(g, 'giada-font-of-hope');
    expect(g.obj(anyId(g, 'p1', 'giada-font-of-hope')).cantBeCountered).toBe(true);
  });
});

describe('Elven Chorus', () => {
  it('lets you cast creature spells from the top of your library', () => {
    const g = game({
      p1: {
        library: ['savannah-lions', 'forest'],
        battlefield: ['elven-chorus', ...n('plains', 2)],
      },
    });
    const top = g.id('p1', 'savannah-lions', 'library');
    const a = g.legal().find((x) => x.type === 'castSpell' && x.card === top);
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(bf(g, 'savannah-lions')).toHaveLength(1);
  });
  it("doesn't let you cast noncreature spells or play lands from the top", () => {
    const g = game({
      p1: { library: ['giant-growth', 'forest'], battlefield: ['elven-chorus', ...n('forest', 2)] },
    });
    expect(g.legal().some((x) => x.type === 'castSpell' && g.obj(x.card).zone === 'library')).toBe(
      false,
    );
    const g2 = game({
      p1: { library: ['forest', 'forest'], battlefield: ['elven-chorus'] },
    });
    expect(g2.legal().some((x) => x.type === 'playLand')).toBe(false);
  });
  it('gives your creatures "{T}: Add one mana of any color"', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['elven-chorus', ...n('savannah-lions', 5)] },
    });
    // {3}{W}{W} from five creatures (no lands at all).
    cast(g, 'serra-angel');
    done(g);
    expect(bf(g, 'serra-angel')).toHaveLength(1);
  });
  it('adds the any-color ability to a creature that already taps for mana', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['elven-chorus', 'llanowar-elves'] },
    });
    // The Elves tap for {G} on their own; with the Chorus they make {W} too.
    cast(g, 'savannah-lions');
    done(g);
    expect(bf(g, 'savannah-lions')).toHaveLength(1);
    const g2 = game({ p1: { hand: ['savannah-lions'], battlefield: ['llanowar-elves'] } });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
  it("doesn't give opponents' creatures that ability", () => {
    const g = game({
      p1: { battlefield: ['elven-chorus'] },
      p2: { hand: ['savannah-lions'], battlefield: ['savannah-lions'] },
      active: 'p2',
    });
    // p2's lions can't tap for {W} to cast the other lions.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Fall of Gil-galad', () => {
  const setup = (lore?: number) => {
    const g = game({
      p1: {
        hand: lore ? [] : ['fall-of-gil-galad'],
        battlefield: [
          ...n('forest', 2),
          'ordinary-bear',
          'savannah-lions',
          ...(lore ? ['fall-of-gil-galad'] : []),
        ],
        library: n('forest', 8),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    if (lore) g.obj(g.id('p1', 'fall-of-gil-galad')).counters = { lore };
    return g;
  };
  /** Passes priority (taking default choices) until a trigger asks for its targets. */
  const toTargets = (g: GameDriver) => {
    for (let i = 0; i < 200 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.decision.kind).toBe('chooseTriggerTargets');
  };
  it('scries 2 as chapter I', () => {
    const g = setup();
    cast(g, 'fall-of-gil-galad');
    done(g);
    const d = g.decision;
    expect(d.kind).toBe('scry');
    if (d.kind === 'scry') expect(d.cards).toHaveLength(2);
  });
  it('puts two +1/+1 counters on a creature you control as chapter II', () => {
    const g = setup(1);
    toTargets(g);
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions)] });
    done(g);
    expect(counters(g, lions)).toBe(2);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(bf(g, 'fall-of-gil-galad')).toHaveLength(1);
  });
  it('chapter III: the creature fights up to one other creature and draws two cards if it dies', () => {
    const g = setup(2);
    toTargets(g);
    const bear = g.id('p1', 'ordinary-bear');
    const angel = g.id('p2', 'serra-angel');
    const before = hand(g, 'p1').length;
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear), g.ref(angel)] });
    done(g);
    // The 4/5 Bear and the 4/4 Angel fight: the Angel dies, the Bear survives.
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(bf(g, 'ordinary-bear')).toHaveLength(1);
    expect(g.obj(bear).damage).toBe(4);
    // The Saga was sacrificed after chapter III.
    expect(gy(g)).toContain('fall-of-gil-galad');
    expect(hand(g, 'p1').length).toBe(before);
  });
  it('chapter III: a creature that dies in the fight draws two cards', () => {
    const g = setup(2);
    toTargets(g);
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    const before = hand(g, 'p1').length;
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions), g.ref(angel)] });
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(gy(g, 'p2')).not.toContain('serra-angel');
    expect(hand(g, 'p1').length).toBe(before + 2);
  });
  it('chapter III: the fight is optional (up to one other target)', () => {
    const g = setup(2);
    toTargets(g);
    const bear = g.id('p1', 'ordinary-bear');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] });
    done(g);
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(g.obj(bear).damage).toBe(0);
    expect(gy(g)).toContain('fall-of-gil-galad');
  });
  it('chapter III: whoever controls the creature as it dies draws the cards', () => {
    const g = game({
      p1: {
        battlefield: ['fall-of-gil-galad', 'savannah-lions', 'mountain'],
        hand: ['shock'],
        library: n('forest', 8),
      },
      p2: { library: n('forest', 8) },
    });
    g.obj(g.id('p1', 'fall-of-gil-galad')).counters = { lore: 2 };
    toTargets(g);
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions)] });
    done(g);
    // The opponent gains control of it, then it dies: they draw the two cards, not you.
    g.obj(lions).controller = 'p2';
    const mine = hand(g, 'p1').length;
    const theirs = hand(g, 'p2').length;
    cast(g, 'shock', [g.ref(lions)]);
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(hand(g, 'p2').length).toBe(theirs + 2);
    expect(hand(g, 'p1').length).toBe(mine - 1);
  });
  it('chapter III: the granted death trigger lasts only until end of turn', () => {
    const g = setup(2);
    toTargets(g);
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions)] });
    done(g);
    const before = hand(g, 'p1').length;
    const thisTurn = g.state.turn.number;
    toStep(g, 'main2');
    // Still this turn: it would still draw.
    expect(g.state.effects.some((e) => e.onDies && e.affected.id === lions)).toBe(true);
    for (let i = 0; i < 40 && g.state.turn.number === thisTurn; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.decision.player });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.effects.some((e) => e.onDies && e.affected.id === lions)).toBe(false);
    expect(hand(g, 'p1').length).toBe(before);
  });
});

describe('Fangorn, Tree Shepherd', () => {
  it('gives Treefolk you control vigilance (and only Treefolk)', () => {
    const g = game({
      p1: { battlefield: ['fangorn-tree-shepherd', 'enraged-huorn', 'savannah-lions'] },
    });
    expect(keywords(g, g.id('p1', 'fangorn-tree-shepherd'))).toContain('vigilance');
    expect(keywords(g, g.id('p1', 'enraged-huorn'))).toContain('vigilance');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('vigilance');
    const g2 = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['fangorn-tree-shepherd'] },
    });
    expect(keywords(g2, g2.id('p1', 'savannah-lions'))).not.toContain('vigilance');
  });
  it('adds {G} twice for each Treefolk that attacked, once for the whole attack', () => {
    const g = game({
      p1: { battlefield: ['fangorn-tree-shepherd', 'enraged-huorn', 'savannah-lions'] },
    });
    const fangorn = g.id('p1', 'fangorn-tree-shepherd');
    const wose = g.id('p1', 'enraged-huorn');
    const lions = g.id('p1', 'savannah-lions');
    g.obj(fangorn).summoningSick = false;
    attackWith(g, fangorn, wose, lions);
    run(g);
    expect(g.state.players.p1.pool?.filter((m) => m.produces[0] === 'G')).toHaveLength(4);
    // The attacking Treefolk didn't tap (vigilance).
    expect(g.obj(fangorn).tapped).toBe(false);
  });
  it("doesn't trigger when no Treefolk attacks", () => {
    const g = game({ p1: { battlefield: ['fangorn-tree-shepherd', 'savannah-lions'] } });
    attackWith(g, g.id('p1', 'savannah-lions'));
    run(g);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });
  it('keeps unspent green mana (not other colours) as steps and phases end', () => {
    const g = game({
      p1: { battlefield: ['fangorn-tree-shepherd', 'enraged-huorn'] },
    });
    g.state.players.p1.pool = [
      { produces: ['G'] },
      { produces: ['G'] },
      { produces: ['R'] },
      { produces: ['C'] },
    ];
    toStep(g, 'main2');
    expect(g.state.players.p1.pool!.map((m) => m.produces[0])).toEqual(['G', 'G']);
    toStep(g, 'end');
    expect(g.state.players.p1.pool!.map((m) => m.produces[0])).toEqual(['G', 'G']);
  });
  it('empties the pool normally without Fangorn', () => {
    const g = game({ p1: { battlefield: ['enraged-huorn'] } });
    g.state.players.p1.pool = [{ produces: ['G'] }];
    toStep(g, 'main2');
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });
});

describe('Last March of the Ents', () => {
  const setup = () =>
    game({
      p1: {
        hand: [
          'last-march-of-the-ents',
          'ordinary-bear',
          'savannah-lions',
          'savannah-lions',
          'giant-growth',
        ],
        library: n('forest', 12),
        battlefield: [...n('forest', 8), 'ordinary-bear'],
      },
    });
  it("can't be countered", () => {
    expect(cardDb.get('last-march-of-the-ents')!.uncounterable).toBe(true);
  });
  it('draws cards equal to the greatest toughness, then puts any number of creature cards from hand onto the battlefield', () => {
    const g = setup();
    cast(g, 'last-march-of-the-ents');
    // Toughness 5 (the Bear): five cards drawn; then the choice.
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    expect(hand(g).length).toBe(4 + 5);
    // Pick Savannah Lions (the options: Done, then each different creature card).
    const labels = () =>
      g.decision.kind === 'chooseOption' ? g.decision.options.map((o) => o.label) : [];
    expect(labels()).toEqual(['Done', 'Ordinary Bear', 'Savannah Lions']);
    g.do({ type: 'chooseOption', player: 'p1', index: 2 });
    // The same card name is offered again (two Lions in hand), the chosen one isn't counted twice.
    expect(labels()).toEqual(['Done', 'Ordinary Bear', 'Savannah Lions']);
    g.do({ type: 'chooseOption', player: 'p1', index: 2 });
    expect(labels()).toEqual(['Done', 'Ordinary Bear']);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    done(g);
    expect(bf(g, 'savannah-lions')).toHaveLength(2);
    expect(bf(g, 'ordinary-bear')).toHaveLength(1); // the one in hand stayed there
    expect(hand(g)).toContain('ordinary-bear');
    expect(gy(g)).toContain('last-march-of-the-ents');
  });
  it('can put nothing onto the battlefield', () => {
    const g = setup();
    cast(g, 'last-march-of-the-ents');
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    done(g);
    expect(bf(g, 'savannah-lions')).toHaveLength(0);
    expect(hand(g)).toContain('savannah-lions');
  });
  it('asks for nothing when there is no creature card in hand', () => {
    const g = game({
      p1: {
        hand: ['last-march-of-the-ents'],
        library: n('forest', 12),
        battlefield: [...n('forest', 8), 'ordinary-bear'],
      },
    });
    cast(g, 'last-march-of-the-ents');
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
  });
});
