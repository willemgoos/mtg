import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  casts,
  chars,
  counters,
  done,
  gy,
  hand,
  keywords,
  toStep,
} from './tdm-green-helpers.ts';

// The Hobbit 20b: green cards (second half; the first is in hob-green.test.ts).

const subtypes = (g: GameDriver, id: string) => [...chars(g, id).subtypes];
function until(g: GameDriver, kind: string) {
  for (let i = 0; i < 60 && g.decision.kind !== kind; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else break;
  }
  expect(g.decision.kind).toBe(kind);
  return g;
}
/** Answers a chooseOption with the first option matching the pattern. */
const pickOption = (g: GameDriver, pattern: RegExp) => {
  expect(g.decision.kind).toBe('chooseOption');
  const d = g.decision as Extract<GameDriver['decision'], { kind: 'chooseOption' }>;
  const index = d.options.findIndex((o) => pattern.test(o.label));
  expect(index, `option ${pattern}`).toBeGreaterThanOrEqual(0);
  return g.do({ type: 'chooseOption', player: d.player, index });
};
const attackWith = (g: GameDriver, ...ids: string[]) => {
  toStep(g, 'beginCombat');
  g.passBoth();
  return g.attack(...ids);
};

describe('Guardian of the Halls', () => {
  it('puts three +1/+1 counters on itself for {5}{G}{G}', () => {
    const g = game({ p1: { battlefield: ['guardian-of-the-halls', ...n('forest', 7)] } });
    const id = g.id('p1', 'guardian-of-the-halls');
    expect(keywords(g, id)).toContain('trample');
    activate(g, id, abilityIndex('guardian-of-the-halls', 'activated'));
    done(g);
    expect(pt(g, id)).toEqual([5, 5]);
  });
});

describe('Little Bear', () => {
  it('has flash, untaps another creature you control and puts a counter on it if it is a Bear', () => {
    const g = game({
      p1: {
        hand: ['little-bear'],
        battlefield: [...n('forest', 3), { card: 'ordinary-bear', tapped: true }],
      },
    });
    expect(keywords(g, g.id('p1', 'little-bear', 'hand'))).toContain('flash');
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'little-bear');
    done(g);
    expect(g.obj(bear).tapped).toBe(false);
    expect(pt(g, bear)).toEqual([5, 6]);
  });
  it('untaps a creature that is not a Bear without a counter', () => {
    const g = game({
      p1: {
        hand: ['little-bear'],
        battlefield: [...n('forest', 3), { card: 'serra-angel', tapped: true }],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'little-bear');
    done(g);
    expect(g.obj(angel).tapped).toBe(false);
    expect(pt(g, angel)).toEqual([4, 4]);
  });
});

describe('Mirkwood Pathmaker', () => {
  it('has power and toughness equal to the number of lands you control', () => {
    const g = game({ p1: { battlefield: ['mirkwood-pathmaker', ...n('forest', 5)] } });
    expect(pt(g, g.id('p1', 'mirkwood-pathmaker'))).toEqual([5, 5]);
    const g2 = game({ p1: { battlefield: ['mirkwood-pathmaker'] } });
    expect(g2.state.players.p1.life).toBe(20);
  });
});

describe('Nasty Little Rabbit', () => {
  it('gets a counter at the beginning of combat with a creature of power 4 or greater', () => {
    const g = game({ p1: { battlefield: ['nasty-little-rabbit', 'ordinary-bear'] } });
    toStep(g, 'beginCombat');
    done(g);
    expect(pt(g, g.id('p1', 'nasty-little-rabbit'))).toEqual([2, 3]);
  });
  it('gets nothing without one', () => {
    const g = game({ p1: { battlefield: ['nasty-little-rabbit', 'bear-cub'] } });
    toStep(g, 'beginCombat');
    done(g);
    expect(pt(g, g.id('p1', 'nasty-little-rabbit'))).toEqual([1, 2]);
  });
});

describe('Old Fat Spider', () => {
  it("can't be blocked by creatures with power 2 or less", () => {
    const g = game({
      p1: { battlefield: ['old-fat-spider'] },
      p2: { battlefield: ['bear-cub', 'ordinary-bear'] },
    });
    attackWith(g, g.id('p1', 'old-fat-spider'));
    g.passBoth();
    expect(g.decision.kind).toBe('declareBlockers');
    const blockers = g.legal('p2').flatMap((a) => (a.type === 'addBlock' ? [a.blocker] : []));
    expect(blockers).toContain(g.id('p2', 'ordinary-bear'));
    expect(blockers).not.toContain(g.id('p2', 'bear-cub'));
    expect(keywords(g, g.id('p1', 'old-fat-spider'))).toContain('reach');
  });
  it('draws a card when an opponent targets it', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['old-fat-spider'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const before = hand(g).length;
    cast(g, 'shock', [g.ref(g.id('p1', 'old-fat-spider'))]);
    done(g);
    expect(hand(g).length).toBe(before + 1);
  });
  it('does not draw when you target it yourself', () => {
    const g = game({
      p1: { hand: ['shock', 'mountain'], battlefield: ['old-fat-spider', 'mountain'] },
    });
    const before = hand(g).length;
    cast(g, 'shock', [g.ref(g.id('p1', 'old-fat-spider'))]);
    done(g);
    expect(hand(g).length).toBe(before - 1);
  });
});

describe('Part in Friendship', () => {
  const setup = (library: string[], extra: string[] = []) =>
    game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: [
          'part-in-friendship',
          'mountain',
          'mountain',
          ...n('forest', 3),
          'bear-cub',
          ...extra,
        ],
        library,
      },
    });
  it('puts the creature onto the battlefield when its mana value is at most your lands', () => {
    const g = setup(['shock', 'bear-cub', ...n('forest', 4)]);
    cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]);
    done(g);
    expect(gy(g)).toContain('bear-cub');
    expect(bf(g, 'bear-cub')).toHaveLength(1);
    // The non-creature card went to the bottom of the library.
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(5);
    expect(lib[lib.length - 1]).toBe('shock');
  });
  it('puts the creature into your hand when its mana value is greater than your lands', () => {
    const g = setup(['gigantic-big-bear', ...n('forest', 4)]);
    cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]);
    done(g);
    expect(hand(g)).toContain('gigantic-big-bear');
    expect(bf(g, 'gigantic-big-bear')).toHaveLength(0);
  });
  it('triggers only once each turn', () => {
    const g = setup(['bear-cub', 'bear-cub', ...n('forest', 4)], ['bear-cub']);
    cast(g, 'shock', [g.ref(bf(g, 'bear-cub')[0]!)]);
    done(g);
    expect(bf(g, 'bear-cub')).toHaveLength(2);
    cast(g, 'shock', [g.ref(bf(g, 'bear-cub')[0]!)]);
    done(g);
    // The second death did not trigger it: the second Bear Cub card is still on top of the library.
    expect(bf(g, 'bear-cub')).toHaveLength(1);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('bear-cub');
  });
});

describe('Quarrel', () => {
  it('has your creature deal damage equal to its power to a creature an opponent controls', () => {
    const g = game({
      p1: { hand: ['quarrel'], battlefield: [...n('forest', 2), 'ordinary-bear'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'quarrel', [g.ref(g.id('p1', 'ordinary-bear')), g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
    // One-sided: Serra Angel dealt nothing back.
    expect(g.obj(g.id('p1', 'ordinary-bear')).damage ?? 0).toBe(0);
  });
});

describe('Radagast of Rhosgobel', () => {
  it('makes the first creature spell each turn cost {2} less and gives it flash', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['ordinary-bear', 'ordinary-bear'],
        battlefield: ['radagast-of-rhosgobel', 'forest', 'forest'],
      },
    });
    // {3}{G} with two lands: only possible with the discount, and in combat only with flash.
    expect(casts(g, 'ordinary-bear').length).toBeGreaterThan(0);
    cast(g, 'ordinary-bear');
    done(g);
    expect(bf(g, 'ordinary-bear')).toHaveLength(1);
  });
  it('does not apply to a second creature spell', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['bear-cub', 'ordinary-bear'],
        battlefield: ['radagast-of-rhosgobel', ...n('forest', 3)],
      },
    });
    cast(g, 'bear-cub');
    done(g);
    expect(casts(g, 'ordinary-bear')).toHaveLength(0);
  });
  it('has no flash and no discount without it', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['ordinary-bear'], battlefield: ['forest', 'forest'] },
    });
    expect(casts(g, 'ordinary-bear')).toHaveLength(0);
  });
});

describe('The Notary Hobbits', () => {
  it('makes two nonlegendary token copies of itself when it enters', () => {
    const g = game({ p1: { hand: ['the-notary-hobbits'], battlefield: n('forest', 5) } });
    done(cast(g, 'the-notary-hobbits'));
    // The tokens are not legendary: the legend rule leaves all three.
    expect(bf(g, 'the-notary-hobbits')).toHaveLength(3);
    expect(bf(g, 'the-notary-hobbits').filter((id) => g.obj(id).isToken)).toHaveLength(2);
  });
  it('taps for {C} for each Halfling you control', () => {
    const solo = game({
      p1: { hand: ['gigantic-big-bear'], battlefield: ['the-notary-hobbits', ...n('forest', 2)] },
    });
    // Two lands and one Halfling: three mana, far short of {5}{G}{G}.
    expect(casts(solo, 'gigantic-big-bear')).toHaveLength(0);
    const g = game({
      p1: { hand: ['the-notary-hobbits', 'gigantic-big-bear'], battlefield: n('forest', 5) },
    });
    done(cast(g, 'the-notary-hobbits'));
    // Next turn all three can tap for three each.
    for (let i = 0; i < 300; i++) {
      if (
        g.state.turn.number > 3 &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.step === 'main1' &&
        g.decision.kind === 'priority'
      )
        break;
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.actor });
      else done(g);
    }
    // Only two Forests stay untapped (for {G}{G}): the {5} comes from the Halflings.
    for (const id of bf(g, 'forest').slice(2)) g.obj(id).tapped = true;
    expect(casts(g, 'gigantic-big-bear').length).toBeGreaterThan(0);
  });
});

describe('Through the Forest Gate', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['through-the-forest-gate'],
        battlefield: n('forest', 8),
        library: ['island', 'ordinary-bear', 'mountain', ...n('shock', 17), 'plains'],
      },
    });
  it('puts the chosen lands from the top twenty onto the battlefield tapped and gains 8 life', () => {
    const g = setup();
    cast(g, 'through-the-forest-gate');
    settle(g);
    pickOption(g, /Island/);
    pickOption(g, /Mountain/);
    pickOption(g, /Done/);
    done(g);
    const island = bf(g, 'island')[0]!;
    expect(island).toBeDefined();
    expect(g.obj(island).tapped).toBe(true);
    expect(bf(g, 'mountain')).toHaveLength(1);
    // The Plains was 21st: not looked at, so it may be anywhere after the shuffle.
    expect(bf(g, 'plains')).toHaveLength(0);
    expect(g.life('p1')).toBe(28);
    // 21 cards in the library minus the two lands.
    expect(g.state.players.p1.library).toHaveLength(21 - 2 + 0);
  });
  it('may put no lands onto the battlefield', () => {
    const g = setup();
    cast(g, 'through-the-forest-gate');
    settle(g);
    pickOption(g, /no lands/);
    done(g);
    expect(bf(g, 'island')).toHaveLength(0);
    expect(g.life('p1')).toBe(28);
    expect(g.state.players.p1.library).toHaveLength(21);
  });
  it('gains the life even with no lands in the top twenty', () => {
    const g = game({
      p1: {
        hand: ['through-the-forest-gate'],
        battlefield: n('forest', 8),
        library: n('shock', 5),
      },
    });
    cast(g, 'through-the-forest-gate');
    done(g);
    expect(g.life('p1')).toBe(28);
  });
});

describe('Troll Negotiations', () => {
  it('puts two counters on your creature, then it fights a creature an opponent controls', () => {
    const g = game({
      p1: { hand: ['troll-negotiations'], battlefield: [...n('forest', 4), 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const cub = g.id('p1', 'bear-cub');
    cast(g, 'troll-negotiations', [g.ref(cub), g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    // The 4/4 Bear Cub and the 4/4 Angel kill each other.
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(g.id('p1', 'bear-cub', 'graveyard'))).toBe('graveyard');
  });
  it('the counters stay on a survivor', () => {
    const g = game({
      p1: { hand: ['troll-negotiations'], battlefield: [...n('forest', 4), 'ordinary-bear'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'troll-negotiations', [g.ref(bear), g.ref(g.id('p2', 'bear-cub'))]);
    done(g);
    expect(pt(g, bear)).toEqual([6, 7]);
    expect(g.obj(bear).damage).toBe(2);
  });
});

describe('Warg Tactics', () => {
  it('destroys target creature with flying', () => {
    const g = game({
      p1: { hand: ['warg-tactics'], battlefield: n('forest', 2) },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.do(
      casts(g, 'warg-tactics').find(
        (a) => a.mode === 0 && JSON.stringify(a.targets).includes(angel),
      )!,
    );
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(
      casts(
        game({ p1: { hand: ['warg-tactics'], battlefield: n('forest', 2) } }),
        'warg-tactics',
      ).some((a) => a.mode === 0),
    ).toBe(false);
  });
  it('puts a counter on a creature you control and gives it trample and hexproof', () => {
    const g = game({
      p1: { hand: ['warg-tactics'], battlefield: [...n('forest', 2), 'bear-cub'] },
    });
    const cub = g.id('p1', 'bear-cub');
    g.do(casts(g, 'warg-tactics').find((a) => a.mode === 1)!);
    done(g);
    expect(pt(g, cub)).toEqual([3, 3]);
    expect(keywords(g, cub)).toEqual(expect.arrayContaining(['trample', 'hexproof']));
  });
});

describe('Wargling', () => {
  it('gets +1/+0 and gives your creatures trample when it attacks with ferocious', () => {
    const g = game({ p1: { battlefield: ['wargling', 'ordinary-bear'] } });
    const wargling = g.id('p1', 'wargling');
    attackWith(g, wargling);
    done(g);
    expect(pt(g, wargling)).toEqual([3, 2]);
    expect(keywords(g, g.id('p1', 'ordinary-bear'))).toContain('trample');
    expect(subtypes(g, wargling)).toContain('Wolf');
  });
  it('does nothing without a creature with power 4 or greater', () => {
    const g = game({ p1: { battlefield: ['wargling', 'bear-cub'] } });
    const wargling = g.id('p1', 'wargling');
    attackWith(g, wargling);
    done(g);
    expect(pt(g, wargling)).toEqual([2, 2]);
    expect(keywords(g, g.id('p1', 'bear-cub'))).not.toContain('trample');
  });
});

describe('Wilderland Scrounger', () => {
  it('puts a +1/+1 counter on each creature you control when it attacks with ferocious', () => {
    const g = game({ p1: { battlefield: ['wilderland-scrounger', 'ordinary-bear', 'bear-cub'] } });
    attackWith(g, g.id('p1', 'wilderland-scrounger'));
    done(g);
    expect(counters(g, g.id('p1', 'wilderland-scrounger'))).toBe(1);
    expect(counters(g, g.id('p1', 'ordinary-bear'))).toBe(1);
    expect(counters(g, g.id('p1', 'bear-cub'))).toBe(1);
  });
  it('does nothing without ferocious', () => {
    const g = game({ p1: { battlefield: ['wilderland-scrounger', 'bear-cub'] } });
    attackWith(g, g.id('p1', 'wilderland-scrounger'));
    done(g);
    expect(counters(g, g.id('p1', 'bear-cub'))).toBe(0);
  });
});

describe('Wood Elves', () => {
  it('searches for a Forest card and puts it onto the battlefield untapped', () => {
    const g = game({
      p1: {
        hand: ['wood-elves'],
        battlefield: n('forest', 3),
        library: ['island', 'forest', 'forest'],
      },
    });
    done(cast(g, 'wood-elves'), { pick: ['forest'] });
    expect(bf(g, 'forest')).toHaveLength(4);
    const fresh = bf(g, 'forest').filter((id) => !g.obj(id).tapped);
    expect(fresh.length).toBeGreaterThan(0);
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});

describe('Woodland Weavemaster', () => {
  it('gets +1/+1 until end of turn when another Elf enters under your control', () => {
    const g = game({
      p1: {
        hand: ['guardian-of-the-halls'],
        battlefield: ['woodland-weavemaster', 'forest', 'forest'],
      },
    });
    const id = g.id('p1', 'woodland-weavemaster');
    expect(keywords(g, id)).toContain('vigilance');
    done(cast(g, 'guardian-of-the-halls'));
    expect(pt(g, id)).toEqual([2, 3]);
  });
  it('taps for mana only for Elf spells', () => {
    const elf = game({
      p1: { hand: ['guardian-of-the-halls'], battlefield: ['woodland-weavemaster', 'forest'] },
    });
    expect(casts(elf, 'guardian-of-the-halls').length).toBeGreaterThan(0);
    const bear = game({
      p1: { hand: ['bear-cub'], battlefield: ['woodland-weavemaster', 'forest'] },
    });
    expect(casts(bear, 'bear-cub')).toHaveLength(0);
  });
});

describe('Beorn the Fierce, no target', () => {
  it('still draws two with three Bears when the target is left out', () => {
    const g = game({
      p1: { battlefield: ['beorn-the-fierce', 'ordinary-bear', 'gigantic-big-bear'] },
    });
    const before = hand(g).length;
    until(g, 'chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0) as Action);
    done(g);
    expect(hand(g).length).toBe(before + 2);
  });
});

describe('Cards are in the pool with their printed numbers', () => {
  it.each([
    ['attercop', 2, 1],
    ['bejeweled-warg', 3, 2],
    ['beorn-the-fierce', 6, 6],
    ['galion-elvenkings-butler', 4, 4],
    ['old-fat-spider', 6, 7],
    ['radagast-of-rhosgobel', 2, 5],
    ['the-notary-hobbits', 1, 1],
    ['wilderland-scrounger', 3, 6],
  ])('%s is %i/%i', (id, p, t) => {
    expect([cardDb.get(id)!.power, cardDb.get(id)!.toughness]).toEqual([p, t]);
  });
});
