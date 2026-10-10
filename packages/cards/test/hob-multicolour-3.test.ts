import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import {
  abilityActions,
  board,
  casts,
  chars,
  done,
  exile,
  game,
  gy,
  hand,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the multicolour group, part three.

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const pass = (g: Game) => stop(g);
const hasKeyword = (g: Game, id: string, k: string) => chars(g, id).keywords.has(k as never);
const counters = (g: Game, id: string) => g.obj(id).plusOneCounters;
const toAttack = (g: Game): Game => {
  for (let i = 0; i < 60 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
  return g;
};
const attackers = (g: Game, ...ids: string[]) => {
  toAttack(g);
  return g.attack(...ids);
};
/** Picks the trigger target whose object is this card. */
const onCard = (g: Game, defId: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === defId);
const noTarget = (a: Extract<Action, { type: 'chooseTargets' }>) => a.targets.length === 0;
const discardCard = (g: Game, defId: string): Game => {
  const a = g.legal().find((x) => x.type === 'discard' && g.obj(x.card).defId === defId);
  if (!a) throw new Error(`can't discard ${defId}`);
  return g.do(a);
};

describe('Mirkwood Nurturer', () => {
  const setup = () =>
    game({
      p1: { hand: ['mirkwood-nurturer'], battlefield: [...n('forest', 3), 'savannah-lions'] },
    });

  it('returns up to one other permanent you control to hand; if you do, it gets a +1/+1 counter', () => {
    const g = setup();
    cast(g, 'mirkwood-nurturer');
    pass(g);
    done(g, { target: onCard(g, 'savannah-lions') });
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(counters(g, g.id('p1', 'mirkwood-nurturer'))).toBe(1);
  });

  it('with no target, nothing is returned and there is no counter', () => {
    const g = setup();
    cast(g, 'mirkwood-nurturer');
    pass(g);
    done(g, { target: noTarget });
    expect(hand(g)).toEqual([]);
    expect(counters(g, g.id('p1', 'mirkwood-nurturer'))).toBe(0);
  });

  it("can't return itself (only another permanent)", () => {
    const g = game({ p1: { hand: ['mirkwood-nurturer'], battlefield: n('forest', 3) } });
    cast(g, 'mirkwood-nurturer');
    pass(g);
    // The only legal choice is no target.
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(
      picks.every(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.every((t) => 'object' in t && g.obj(t.object.id).defId !== 'mirkwood-nurturer'),
      ),
    ).toBe(true);
  });
});

describe('Nori, Teller of Tales', () => {
  it('gives target attacking creature first strike until end of turn when it attacks', () => {
    const g = game({ p1: { battlefield: ['nori-teller-of-tales', 'savannah-lions'] } });
    attackers(g, g.id('p1', 'nori-teller-of-tales'), g.id('p1', 'savannah-lions'));
    done(g, { target: onCard(g, 'savannah-lions') });
    expect(hasKeyword(g, g.id('p1', 'savannah-lions'), 'firstStrike')).toBe(true);
    expect(hasKeyword(g, g.id('p1', 'nori-teller-of-tales'), 'firstStrike')).toBe(false);
  });
});

describe('Patient Instructor', () => {
  it('has vigilance and recruits when it enters: no token for a land, a Human Soldier for a nonland', () => {
    const a = game({
      p1: { hand: ['patient-instructor', 'savannah-lions'], battlefield: n('plains', 3) },
    });
    expect(hasKeyword(a, a.id('p1', 'patient-instructor', 'hand'), 'vigilance')).toBe(true);
    cast(a, 'patient-instructor');
    pass(a);
    discardCard(a, 'savannah-lions');
    done(a);
    expect(board(a, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
    const b = game({
      p1: { hand: ['patient-instructor', 'savannah-lions'], battlefield: n('plains', 3) },
    });
    cast(b, 'patient-instructor');
    pass(b);
    discardCard(b, 'forest');
    done(b);
    expect(board(b, 'hob-human-soldier-token', 'p1')).toHaveLength(0);
  });
});

describe('Silvan Reveler', () => {
  it('draws, discards, and a discarded land card enters the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['silvan-reveler'],
        battlefield: [...n('forest', 2), ...n('island', 2)],
        library: ['forest', 'forest'],
      },
    });
    cast(g, 'silvan-reveler');
    pass(g);
    discardCard(g, 'forest');
    done(g);
    expect(gy(g)).toEqual([]);
    const forests = board(g, 'forest', 'p1');
    expect(forests).toHaveLength(3);
    expect(forests.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(1);
  });

  it('a discarded nonland card stays in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['silvan-reveler', 'savannah-lions'],
        battlefield: [...n('forest', 2), ...n('island', 2)],
        library: ['forest', 'forest'],
      },
    });
    cast(g, 'silvan-reveler');
    pass(g);
    discardCard(g, 'savannah-lions');
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('landfall in the graveyard: pay {1}{G}{U} to return it to hand', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        graveyard: ['silvan-reveler'],
        battlefield: ['forest', 'island', 'mountain'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    done(g);
    expect(hand(g)).toEqual(['silvan-reveler']);
    expect(gy(g)).toEqual([]);
  });

  it('you may decline to pay', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        graveyard: ['silvan-reveler'],
        battlefield: ['forest', 'island', 'mountain'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    done(g, { accept: false });
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toEqual(['silvan-reveler']);
  });
});

describe('Smaug, Wicked Worm', () => {
  it('creates a tapped Treasure for each artifact your opponents control when it enters', () => {
    const g = game({
      p1: { hand: ['smaug-wicked-worm'], battlefield: [...n('swamp', 3), ...n('mountain', 2)] },
      p2: { battlefield: ['goblin-plate-mail', 'goblin-plate-mail', 'savannah-lions'] },
    });
    cast(g, 'smaug-wicked-worm');
    pass(g);
    const treasures = board(g, 'treasure-token', 'p1');
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => g.obj(id).tapped)).toBe(true);
    expect(hasKeyword(g, g.id('p1', 'smaug-wicked-worm'), 'flying')).toBe(true);
  });

  it('draws a card and loses 1 life when you cast a spell with mana from a Treasure', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['smaug-wicked-worm', 'treasure-token'] },
    });
    cast(g, 'savannah-lions');
    pass(g);
    expect(hand(g)).toEqual(['forest']);
    expect(g.life('p1')).toBe(19);
  });

  it('does nothing when the spell was paid with land mana only', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['smaug-wicked-worm', 'plains'] },
    });
    cast(g, 'savannah-lions');
    pass(g);
    expect(hand(g)).toEqual([]);
    expect(g.life('p1')).toBe(20);
  });
});

describe('The Chief Warg', () => {
  const warg = (extra: string[]) => {
    const g = game({ p1: { battlefield: ['the-chief-warg', ...extra] } });
    attackers(g, g.id('p1', 'the-chief-warg'));
    done(g);
    return g;
  };

  it('draws a card and loses 1 life when you attack while you control a creature with power 4 or greater', () => {
    const g = warg(['large-bear']);
    expect(hand(g)).toEqual(['forest']);
    expect(g.life('p1')).toBe(19);
  });

  it('nothing without a creature with power 4 or greater', () => {
    const g = warg(['savannah-lions']);
    expect(hand(g)).toEqual([]);
    expect(g.life('p1')).toBe(20);
  });

  it('has menace', () => {
    const g = game({ p1: { battlefield: ['the-chief-warg'] } });
    expect(hasKeyword(g, g.id('p1', 'the-chief-warg'), 'menace')).toBe(true);
  });
});

describe('The Great Goblin', () => {
  it('deals 2 damage to target opponent when you put counters on a Goblin, Orc, or Army you control', () => {
    const g = game({
      p1: {
        hand: ['duskwatch-hunter'],
        battlefield: ['the-great-goblin', 'fearsome-goblin-pair', ...n('swamp', 3)],
      },
    });
    cast(g, 'duskwatch-hunter');
    pass(g);
    done(g, { target: onCard(g, 'fearsome-goblin-pair') });
    expect(counters(g, g.id('p1', 'fearsome-goblin-pair'))).toBe(1);
    expect(g.life('p2')).toBe(18);
  });

  it('not for counters on a creature that is not a Goblin, Orc, or Army', () => {
    const g = game({
      p1: {
        hand: ['duskwatch-hunter'],
        battlefield: ['the-great-goblin', 'savannah-lions', ...n('swamp', 3)],
      },
    });
    cast(g, 'duskwatch-hunter');
    pass(g);
    done(g, { target: onCard(g, 'savannah-lions') });
    expect(g.life('p2')).toBe(20);
  });

  it('exiles the top card when another Goblin, Orc, or Army you control dies, and you may play it', () => {
    const g = game({
      p1: {
        battlefield: ['the-great-goblin', { card: 'fearsome-goblin-pair', damage: 1 }],
        library: ['mountain', 'forest'],
      },
    });
    g.pass();
    done(g);
    expect(board(g, 'fearsome-goblin-pair', 'p1')).toHaveLength(0);
    expect(exile(g)).toEqual(['mountain']);
    const card = g.state.players.p1.exile[0]!;
    expect(g.obj(card).playableUntilTurn).toBeGreaterThan(g.state.turn.number);
    // The Pair's own amass put counters on the Army: 2 more damage.
    expect(g.life('p2')).toBe(18);
    // It can be played from exile.
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === card)).toBe(true);
  });

  it('does not trigger for itself dying', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'the-great-goblin', damage: 2 }],
        library: ['mountain', 'forest'],
      },
    });
    g.pass();
    done(g);
    expect(exile(g)).toEqual([]);
  });
});

describe('Thorin Oakenshield', () => {
  const three = ['thorin-oakenshield', 'dwalin-weaponmaster', 'nori-teller-of-tales'];
  it('has trample and, with an enduring story, artifacts and creatures you control have ward {1}', () => {
    const g = game({ p1: { battlefield: [...three, 'savannah-lions', 'goblin-plate-mail'] } });
    expect(hasKeyword(g, g.id('p1', 'thorin-oakenshield'), 'trample')).toBe(true);
    g.passBoth();
    expect(g.state.players.p1.enduringStory).toBe(true);
    expect(hasKeyword(g, g.id('p1', 'savannah-lions'), 'wardOne')).toBe(true);
    expect(hasKeyword(g, g.id('p1', 'goblin-plate-mail'), 'wardOne')).toBe(true);
    // Not the opponent's.
  });

  it('no ward without the enduring story', () => {
    const g = game({ p1: { battlefield: ['thorin-oakenshield', 'savannah-lions'] } });
    g.passBoth();
    expect(g.state.players.p1.enduringStory).toBeFalsy();
    expect(hasKeyword(g, g.id('p1', 'savannah-lions'), 'wardOne')).toBe(false);
  });

  it("the opponent's permanents never get it", () => {
    const g = game({
      p1: { battlefield: three },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.passBoth();
    expect(hasKeyword(g, g.id('p2', 'savannah-lions'), 'wardOne')).toBe(false);
  });
});

describe('Thranduil, the Elvenking', () => {
  it('has the activated abilities of the Elf cards in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves'],
        battlefield: ['thranduil-the-elvenking'],
        graveyard: ['llanowar-elves'],
      },
    });
    // Llanowar Elves is an Elf with "{T}: Add {G}": Thranduil taps for it and pays for the second one.
    cast(g, 'llanowar-elves');
    pass(g);
    expect(board(g, 'llanowar-elves', 'p1')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'thranduil-the-elvenking')).tapped).toBe(true);
  });

  it('nothing from non-Elf cards or from the opponent graveyard', () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves'],
        battlefield: ['thranduil-the-elvenking'],
        graveyard: ['savannah-lions'],
      },
      p2: { graveyard: ['llanowar-elves'] },
    });
    expect(casts(g, 'llanowar-elves')).toHaveLength(0);
  });

  it('draws two cards, then discards a card when another legendary Elf enters under your control', () => {
    const g = game({
      p1: {
        hand: ['thranduil-sindarin-liege'],
        battlefield: ['thranduil-the-elvenking', ...n('forest', 4)],
      },
    });
    cast(g, 'thranduil-sindarin-liege');
    pass(g);
    done(g);
    // Drew two, discarded one.
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });

  it('not for a nonlegendary Elf', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['thranduil-the-elvenking', 'forest'] },
    });
    cast(g, 'llanowar-elves');
    pass(g);
    done(g);
    expect(hand(g)).toEqual([]);
  });
});

describe("Thranduil's Company", () => {
  it('lets you play an additional land only while you control another Elf', () => {
    const lands = ['forest', 'forest', 'forest'];
    const withElf = game({
      p1: { hand: lands, battlefield: ['thranduils-company', 'llanowar-elves'] },
    });
    withElf.do(withElf.legal().find((a) => a.type === 'playLand')!);
    done(withElf);
    expect(withElf.legal().some((a) => a.type === 'playLand')).toBe(true);
    const alone = game({ p1: { hand: lands, battlefield: ['thranduils-company'] } });
    alone.do(alone.legal().find((a) => a.type === 'playLand')!);
    done(alone);
    expect(alone.legal().some((a) => a.type === 'playLand')).toBe(false);
  });

  it('landfall: two +1/+1 counters on target creature you control, which gains vigilance until end of turn', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['thranduils-company', 'savannah-lions'] },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    done(g, { target: onCard(g, 'savannah-lions') });
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(2);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
    expect(hasKeyword(g, g.id('p1', 'savannah-lions'), 'vigilance')).toBe(true);
  });
});

describe('Tom, Bert, and William', () => {
  it('{1}, sacrifice another creature: draw cards equal to its power, then discard a card', () => {
    const g = game({
      p1: { battlefield: ['tom-bert-and-william', 'large-bear', 'forest'] },
    });
    const tbw = g.id('p1', 'tom-bert-and-william');
    const bear = g.id('p1', 'large-bear');
    const act = abilityActions(g, tbw, 0).find((a) => 'sacrifice' in a && a.sacrifice === bear);
    expect(act).toBeDefined();
    g.do(act!);
    pass(g);
    // Five cards drawn, one discarded.
    discardCard(g, 'forest');
    done(g);
    expect(hand(g)).toHaveLength(4);
    expect(board(g, 'large-bear', 'p1')).toHaveLength(0);
  });

  it("can't sacrifice itself", () => {
    const g = game({ p1: { battlefield: ['tom-bert-and-william', 'forest'] } });
    expect(abilityActions(g, g.id('p1', 'tom-bert-and-william'), 0)).toHaveLength(0);
  });

  it("when they die as a creature they return to the battlefield as an artifact that isn't a creature", () => {
    const g = game({
      p1: { battlefield: [{ card: 'tom-bert-and-william', damage: 5 }] },
    });
    g.pass();
    done(g);
    const id = g.id('p1', 'tom-bert-and-william');
    expect(g.obj(id).zone).toBe('battlefield');
    const c = chars(g, id);
    expect(c.types).toContain('Artifact');
    expect(c.types).not.toContain('Creature');
    expect(c.subtypes).toContain('Troll');
    // Dealt damage: it is just an artifact now, so it has no power and toughness to speak of.
    expect(g.obj(id).notCreature).toBe(true);
  });
});
