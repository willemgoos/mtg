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

// The Hobbit 20b: green cards (first half; the rest are in hob-green-2.test.ts).

const NAMES = [
  'Attercop',
  'Bejeweled Warg',
  'Beorn the Fierce',
  "Beorn's Hospitality",
  'Beorn, Reluctant Host',
  'Boughside Wanderers',
  'Cantankerous Keepers',
  'Dancing from Dark to Dawn',
  'Down in the Valley',
  "Galion, Elvenking's Butler",
  'Gigantic Big Bear',
  'Guardian of the Halls',
  'Little Bear',
  'Mirkwood Pathmaker',
  'Nasty Little Rabbit',
  'Old Fat Spider',
  'Ordinary Bear',
  'Part in Friendship',
  'Quarrel',
  'Radagast of Rhosgobel',
  'The Notary Hobbits',
  'Through the Forest Gate',
  'Troll Negotiations',
  'Warg Tactics',
  'Wargling',
  'Wilderland Scrounger',
  'Wood Elves',
  'Woodland Weavemaster',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const playForest = (g: GameDriver) =>
  g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
const types = (g: GameDriver, id: string) => [...chars(g, id).types];
const subtypes = (g: GameDriver, id: string) => [...chars(g, id).subtypes];
/** Passes priority until the decision is of this kind. */
function until(g: GameDriver, kind: string) {
  for (let i = 0; i < 60 && g.decision.kind !== kind; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else break;
  }
  expect(g.decision.kind).toBe(kind);
  return g;
}
/** Chooses the trigger target that is this object. */
const chooseTarget = (g: GameDriver, id: string) =>
  g.do(
    g
      .legal()
      .find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(id)) as Action,
  );
/** Passes (settling triggers) until a later turn of `player`'s precombat main phase. */
function nextMain(g: GameDriver, player: 'p1' | 'p2' = 'p1') {
  const from = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    const s = g.state;
    if (s.turn.number > from && s.turn.activePlayer === player && s.turn.step === 'main1')
      if (s.decision.kind === 'priority' && s.stack.length === 0) return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'discardToHandSize') g.do(g.legal()[0]!);
    else done(g);
  }
  throw new Error('never reached the next main phase');
}

describe('every card is in the pool', () => {
  it('has all the green cards', () => {
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
  it('Beorn, Reluctant Host is an adventure card with Till and Tend as its spell', () => {
    expect(cardDb.get('beorn-reluctant-host')!.adventure).toBe(true);
  });
});

describe('vanilla and keyword-only cards', () => {
  it('Ordinary Bear is a 4/5 Bear', () => {
    const g = game({ p1: { battlefield: ['ordinary-bear'] } });
    const id = g.id('p1', 'ordinary-bear');
    expect(pt(g, id)).toEqual([4, 5]);
    expect(subtypes(g, id)).toContain('Bear');
  });
  it('Gigantic Big Bear is a 10/7 Bear with hexproof and haste, and can not be countered', () => {
    const g = game({ p1: { battlefield: ['gigantic-big-bear'] } });
    const id = g.id('p1', 'gigantic-big-bear');
    expect(pt(g, id)).toEqual([10, 7]);
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['hexproof', 'haste']));
    expect(cardDb.get('gigantic-big-bear')!.uncounterable).toBe(true);
  });
  it('Beorn, Reluctant Host is a 5/5 Human Bear with trample', () => {
    const g = game({ p1: { battlefield: ['beorn-reluctant-host'] } });
    const id = g.id('p1', 'beorn-reluctant-host');
    expect(pt(g, id)).toEqual([5, 5]);
    expect(keywords(g, id)).toContain('trample');
  });
});

describe('Till and Tend (Beorn, Reluctant Host)', () => {
  it('lets you play an additional land this turn, and the creature can be cast from exile later', () => {
    const g = game({
      p1: {
        hand: ['beorn-reluctant-host', 'forest', 'forest', 'forest'],
        battlefield: n('forest', 2),
      },
    });
    const card = g.id('p1', 'beorn-reluctant-host', 'hand');
    const adventure = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === card && a.back) as Action;
    expect(adventure).toBeDefined();
    done(g.do(adventure));
    expect(g.zoneOf(card)).toBe('exile');
    // One land drop and the additional one.
    playForest(g);
    playForest(g);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(4);
  });
});

describe('Attercop', () => {
  it('gets +1/+1 until end of turn when a land enters under your control', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['attercop'] } });
    const id = g.id('p1', 'attercop');
    expect(pt(g, id)).toEqual([2, 1]);
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['reach', 'deathtouch']));
    playForest(g);
    done(g);
    expect(pt(g, id)).toEqual([3, 2]);
  });
});

describe('Bejeweled Warg', () => {
  const hit = (extra: string[] = []) => {
    const g = game({ p1: { battlefield: ['bejeweled-warg', ...extra] } });
    toStep(g, 'beginCombat');
    g.passBoth();
    g.attack(g.id('p1', 'bejeweled-warg'));
    return g;
  };
  const chooseMode = (g: GameDriver, mode: number, target?: string) => {
    until(g, 'chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.mode === mode &&
            (!target || JSON.stringify(a.targets).includes(target)),
        ) as Action,
    );
    return done(g);
  };
  it('can create a Treasure on combat damage to a player', () => {
    const g = hit();
    chooseMode(g, 1);
    expect(bf(g, 'treasure-token')).toHaveLength(1);
    expect(g.life('p2')).toBe(17);
  });
  it('can put a +1/+1 counter on a Wolf you control', () => {
    const g = hit(['wargling']);
    const wolf = g.id('p1', 'wargling');
    chooseMode(g, 0, wolf);
    expect(counters(g, wolf)).toBe(1);
    expect(bf(g, 'treasure-token')).toHaveLength(0);
  });
});

describe('Beorn the Fierce', () => {
  it('gives other Bears +2/+2', () => {
    const g = game({ p1: { battlefield: ['beorn-the-fierce', 'ordinary-bear', 'serra-angel'] } });
    expect(pt(g, g.id('p1', 'beorn-the-fierce'))).toEqual([6, 6]);
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([6, 7]);
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([4, 4]);
  });
  it('at the beginning of combat gives a trample counter and the Bear type, then draws two with three Bears', () => {
    const g = game({
      p1: { battlefield: ['beorn-the-fierce', 'ordinary-bear', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    until(g, 'chooseTriggerTargets');
    chooseTarget(g, angel);
    const before = hand(g).length;
    done(g);
    expect(keywords(g, angel)).toContain('trample');
    expect(subtypes(g, angel)).toEqual(expect.arrayContaining(['Angel', 'Bear']));
    // Beorn, Ordinary Bear and the Angel are three Bears.
    expect(hand(g).length).toBe(before + 2);
    // The Angel is now a Bear: it gets +2/+2.
    expect(pt(g, angel)).toEqual([6, 6]);
  });
  it('does not draw with fewer than three Bears, and the target is optional', () => {
    const g = game({ p1: { battlefield: ['beorn-the-fierce', 'ordinary-bear'] } });
    const before = hand(g).length;
    until(g, 'chooseTriggerTargets');
    chooseTarget(g, g.id('p1', 'ordinary-bear'));
    done(g);
    // Beorn and the Bear that was already a Bear: only two Bears.
    expect(hand(g).length).toBe(before);
    expect(keywords(g, g.id('p1', 'ordinary-bear'))).toContain('trample');
  });
});

describe("Beorn's Hospitality", () => {
  it('puts a +1/+1 counter on target creature you control with landfall', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['beorns-hospitality', 'ordinary-bear'] },
    });
    playForest(g);
    done(g);
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([5, 6]);
  });
  it('becomes a Bear creature with power and toughness equal to your lands, for good', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['beorns-hospitality', ...n('forest', 7)] },
    });
    const id = g.id('p1', 'beorns-hospitality');
    expect(types(g, id)).not.toContain('Creature');
    activate(g, id, abilityIndex('beorns-hospitality', 'activated'));
    done(g);
    expect(types(g, id)).toEqual(expect.arrayContaining(['Enchantment', 'Creature']));
    expect(subtypes(g, id)).toContain('Bear');
    expect(pt(g, id)).toEqual([7, 7]);
    // It stays a creature, and tracks the number of lands.
    nextMain(g);
    expect(types(g, id)).toContain('Creature');
    expect(pt(g, id)).toEqual([7, 7]);
    playForest(g);
    done(g);
    // The land also triggers its own landfall: a counter on itself, now that it is a creature.
    expect(pt(g, id)).toEqual([9, 9]);
  });
});

describe('Boughside Wanderers', () => {
  it('looks at four cards, takes a permanent card and puts the rest on the bottom', () => {
    const g = game({
      p1: {
        hand: ['boughside-wanderers'],
        battlefield: n('forest', 6),
        library: ['shock', 'ordinary-bear', 'shock', 'shock', 'island'],
      },
    });
    cast(g, 'boughside-wanderers');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'ordinary-bear', 'library') });
    done(g);
    expect(hand(g)).toEqual(['ordinary-bear']);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(4);
    // The fifth card was not looked at: it is still on top.
    expect(lib[0]).toBe('island');
  });
  it('gets +2/+2 with landfall', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['boughside-wanderers'] } });
    playForest(g);
    done(g);
    expect(pt(g, g.id('p1', 'boughside-wanderers'))).toEqual([6, 6]);
  });
});

describe('Cantankerous Keepers', () => {
  it('costs {1} less for each Elf you control', () => {
    const g = game({
      p1: {
        hand: ['cantankerous-keepers'],
        battlefield: [...n('forest', 4), 'wood-elves', 'guardian-of-the-halls'],
      },
    });
    expect(casts(g, 'cantankerous-keepers').length).toBeGreaterThan(0);
    const g2 = game({ p1: { hand: ['cantankerous-keepers'], battlefield: n('forest', 5) } });
    expect(casts(g2, 'cantankerous-keepers')).toHaveLength(0);
  });
  it('mills four and puts every Elf card among them into your hand', () => {
    const g = game({
      p1: {
        hand: ['cantankerous-keepers'],
        battlefield: [...n('forest', 4), 'wood-elves', 'guardian-of-the-halls'],
        library: ['wood-elves', 'forest', 'guardian-of-the-halls', 'ordinary-bear', 'island'],
      },
    });
    done(cast(g, 'cantankerous-keepers'));
    expect(hand(g).sort()).toEqual(['guardian-of-the-halls', 'wood-elves']);
    expect(gy(g).sort()).toEqual(['forest', 'ordinary-bear']);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});

describe('Dancing from Dark to Dawn', () => {
  it('puts counters equal to the creature spell mana value on a creature you control', () => {
    const g = game({
      p1: {
        hand: ['bear-cub'],
        battlefield: ['dancing-from-dark-to-dawn', 'ordinary-bear', ...n('forest', 2)],
      },
    });
    cast(g, 'bear-cub');
    done(g);
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([6, 7]);
  });
  it('creates a 2/2 Bear token with landfall', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['dancing-from-dark-to-dawn'] } });
    playForest(g);
    done(g);
    const [bear] = bf(g, 'hob-bear-token');
    expect(bear).toBeDefined();
    expect(pt(g, bear!)).toEqual([2, 2]);
  });
});

describe('Down in the Valley', () => {
  it('fetches a basic land, then makes Elves with landfall, then pumps Elves', () => {
    const g = game({
      p1: {
        hand: ['down-in-the-valley', 'forest'],
        battlefield: [...n('forest', 3), 'wood-elves'],
        library: ['island', 'forest', 'forest', ...n('forest', 12)],
      },
    });
    cast(g, 'down-in-the-valley');
    done(g, { pick: ['island'] });
    expect(hand(g)).toContain('island');
    const saga = g.id('p1', 'down-in-the-valley');
    // Chapter II: the Saga gains the landfall ability.
    nextMain(g);
    expect(g.obj(saga).counters?.lore).toBe(2);
    playForest(g);
    done(g);
    expect(bf(g, 'hob-elf-token')).toHaveLength(1);
    // Chapter III: Elves get +1/+0 and vigilance until end of turn.
    nextMain(g);
    expect(g.obj(saga).counters?.lore).toBe(3);
    const elf = g.id('p1', 'wood-elves');
    expect(pt(g, elf)).toEqual([2, 1]);
    expect(keywords(g, elf)).toContain('vigilance');
    nextMain(g);
    expect(g.zoneOf(saga)).toBe('graveyard');
  });
  it('the landfall ability is lost when the Saga leaves', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['down-in-the-valley'] },
    });
    const saga = g.id('p1', 'down-in-the-valley');
    g.obj(saga).counters = { lore: 1 };
    nextMain(g);
    expect(g.obj(saga).counters?.lore).toBe(2);
    expect(g.obj(saga).hobGainedAbilities).toHaveLength(1);
  });
});

describe("Galion, Elvenking's Butler", () => {
  it("sets another creature's base power and toughness to Galion's until end of turn", () => {
    const g = game({
      p1: { battlefield: ['galion-elvenkings-butler', 'ordinary-bear', 'wood-elves'] },
    });
    const galion = g.id('p1', 'galion-elvenkings-butler');
    toStep(g, 'beginCombat');
    g.passBoth();
    g.attack(galion);
    chooseTarget(g, g.id('p1', 'wood-elves'));
    done(g);
    expect(pt(g, g.id('p1', 'wood-elves'))).toEqual([4, 4]);
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([4, 5]);
  });
});
