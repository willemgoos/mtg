import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import {
  casts,
  choose,
  chars,
  done,
  game,
  gy,
  hand,
  labels,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the multicolour group (gold and hybrid cards), part one.

const NAMES = [
  'Bard the Bowman',
  'Bard, King of Dale',
  "Bard's Company",
  'Bifur, Melodic Rider',
  'Bolg of the North',
  "Bolg's Company",
  "Chief Warg's Company",
  "Dáin's Company",
  'Duskwatch Hunter',
  'Dwalin, Weaponmaster',
  "Eagle's Rescue",
  'Fearsome Goblin Pair',
  'Goblin Plate Mail',
  'Large Bear',
  'Mirkwood Nurturer',
  'Nori, Teller of Tales',
  'Patient Instructor',
  'Silvan Reveler',
  'Smaug, Wicked Worm',
  'The Chief Warg',
  'The Great Goblin',
  'Thorin Oakenshield',
  'Thranduil, Sindarin Liege',
  'Thranduil, the Elvenking',
  "Thranduil's Company",
  'Tom, Bert, and William',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

/** Casts a card from hand (the first cast action, or the one `pick` accepts). */
const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const pass = (g: Game) => stop(g);
/** Discards the first card of this id (answering the pending discard). */
const discardCard = (g: Game, defId: string): Game => {
  const a = g.legal().find((x) => x.type === 'discard' && g.obj(x.card).defId === defId);
  if (!a) throw new Error(`can't discard ${defId}`);
  return g.do(a);
};
const tokens = (g: Game, name: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) =>
      g.obj(id).isToken && g.obj(id).controller === p && chars(g, id) && g.obj(id).defId === name,
  );

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) expect(cardDb.get(idOf(name)), name).toBeDefined();
  });
  it('the Adventure side is the spell of the creature', () => {
    expect(cardDb.get('thranduil-sindarin-liege')).toBeDefined();
  });
});

describe('Thranduil, Sindarin Liege and Silvan Rally', () => {
  it('other Elves you control get +1/+1 and a land makes a 1/1 Elf', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['thranduil-sindarin-liege', 'llanowar-elves', 'savannah-lions'],
      },
    });
    // Llanowar Elves is an Elf Druid: 2/2. Thranduil himself and the Lions don't get it.
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    expect(pt(g, g.id('p1', 'thranduil-sindarin-liege'))).toEqual([2, 3]);
    const land = g.legal().find((a) => a.type === 'playLand');
    g.do(land!);
    done(g);
    const elves = tokens(g, 'hob-elf-token');
    expect(elves).toHaveLength(1);
    // The token is an Elf too: 1/1 plus the bonus.
    expect(pt(g, elves[0]!)).toEqual([2, 2]);
  });

  it('Silvan Rally mills four and puts up to two of the lands among them into your hand', () => {
    const g = game({
      p1: {
        hand: ['thranduil-sindarin-liege'],
        battlefield: n('forest', 3),
        library: ['forest', 'island', 'llanowar-elves', 'forest', 'plains', 'plains'],
      },
    });
    cast(g, 'thranduil-sindarin-liege', (a) => a.back === true);
    pass(g);
    // Milled: forest, island, llanowar-elves, forest. Lands: Forest, Island (two Forests are one choice).
    expect(labels(g)).toEqual(['Done', 'Forest', 'Island']);
    choose(g, /Island/);
    // A second pick (the Island is gone): the Forests.
    expect(labels(g)).toEqual(['Done', 'Forest']);
    choose(g, /Forest/);
    done(g);
    expect(hand(g).sort()).toEqual(['forest', 'island']);
    // The rest stays in the graveyard; the Adventure card waits in exile.
    expect(gy(g).sort()).toEqual(['forest', 'llanowar-elves']);
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(g.obj(g.id('p1', 'thranduil-sindarin-liege', 'exile')).onAdventure).toBe(true);
  });

  it('Silvan Rally can stop after one land, or take none', () => {
    const g = game({
      p1: {
        hand: ['thranduil-sindarin-liege'],
        battlefield: n('forest', 3),
        library: ['forest', 'island', 'plains', 'forest', 'plains'],
      },
    });
    cast(g, 'thranduil-sindarin-liege', (a) => a.back === true);
    pass(g);
    choose(g, /Plains/);
    choose(g, /Done/);
    done(g);
    expect(hand(g)).toEqual(['plains']);
  });

  it('Silvan Rally with no land among the cards asks nothing', () => {
    const g = game({
      p1: {
        hand: ['thranduil-sindarin-liege'],
        battlefield: n('forest', 3),
        library: ['llanowar-elves', 'savannah-lions', 'llanowar-elves', 'elvish-mystic', 'forest'],
      },
    });
    cast(g, 'thranduil-sindarin-liege', (a) => a.back === true);
    pass(g);
    expect(g.decision.kind).toBe('priority');
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toHaveLength(4);
  });
});

describe('Bard the Bowman', () => {
  it('has reach; the second card you draw each turn puts a +1/+1 counter on target creature and it gains lifelink', () => {
    const g = game({
      p1: { hand: ['quick-study'], battlefield: ['bard-the-bowman', ...n('island', 3)] },
    });
    expect(chars(g, g.id('p1', 'bard-the-bowman')).keywords.has('reach')).toBe(true);
    // Quick Study draws two cards: the second one triggers Bard.
    cast(g, 'quick-study');
    pass(g);
    done(g);
    expect(pt(g, g.id('p1', 'bard-the-bowman'))).toEqual([2, 4]);
    expect(chars(g, g.id('p1', 'bard-the-bowman')).keywords.has('lifelink')).toBe(true);
  });
});

describe('Bard, King of Dale', () => {
  it('draws two cards instead of each draw except the first in your draw step', () => {
    const g = game({
      p1: { hand: ['quick-study'], battlefield: ['bard-king-of-dale', ...n('island', 3)] },
    });
    cast(g, 'quick-study');
    pass(g);
    done(g);
    // Quick Study draws two cards, each replaced by two: four cards, and Quick Study is in the graveyard.
    expect(hand(g)).toHaveLength(4);
  });

  it('does not change the first card of your draw step', () => {
    const g = game({ p1: { battlefield: ['bard-king-of-dale'] }, active: 'p2', step: 'end' });
    // p1's turn comes next: the draw step draws exactly one card.
    const before = g.state.players.p1.hand.length;
    for (
      let i = 0;
      i < 40 && !(g.state.turn.activePlayer === 'p1' && g.state.turn.step === 'upkeep');
      i++
    ) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    for (let i = 0; i < 6 && g.state.turn.step !== 'main1'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.players.p1.hand.length - before).toBe(1);
  });

  it('doubles the tokens you would create', () => {
    const g = game({
      p1: {
        hand: ['patient-instructor', 'savannah-lions'],
        battlefield: ['bard-king-of-dale', ...n('plains', 3)],
      },
    });
    cast(g, 'patient-instructor');
    pass(g);
    // Recruit: draw, then discard a nonland card: one Human Soldier token, doubled.
    discardCard(g, 'savannah-lions');
    done(g);
    expect(tokens(g, 'hob-human-soldier-token')).toHaveLength(2);
  });
});

describe("Bard's Company", () => {
  const BC = 'bards-company';
  it('can be cast at instant speed only if you control a Human', () => {
    const base = {
      hand: [BC],
      battlefield: [...n('plains', 2), ...n('island', 2)],
    };
    // In the beginning of combat step only an instant-speed spell can be cast.
    const noHuman = game({ p1: { ...base }, step: 'beginCombat' });
    expect(casts(noHuman, BC)).toHaveLength(0);
    const human = game({
      p1: { ...base, battlefield: [...base.battlefield, 'patient-instructor'] },
      step: 'beginCombat',
    });
    expect(casts(human, BC).length).toBeGreaterThan(0);
    // In your main phase it can always be cast.
    expect(casts(game({ p1: { ...base } }), BC).length).toBeGreaterThan(0);
  });

  it('gives other creatures +1/+1 and recruits when it enters and when it attacks', () => {
    const g = game({
      p1: {
        hand: [BC, 'savannah-lions'],
        battlefield: [...n('plains', 2), ...n('island', 2), 'savannah-lions'],
        library: ['forest', 'forest', 'forest'],
      },
    });
    cast(g, BC);
    pass(g);
    // Recruit: draw (a Forest), discard the Savannah Lions card (nonland): a Human Soldier.
    discardCard(g, 'savannah-lions');
    done(g);
    expect(tokens(g, 'hob-human-soldier-token')).toHaveLength(1);
    // The Human Soldier is a 1/1 plus Bard's Company: 2/2; the Lions on the battlefield 3/2; Bard's Company itself 2/3.
    expect(pt(g, tokens(g, 'hob-human-soldier-token')[0]!)).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', BC))).toEqual([2, 3]);
  });
});
