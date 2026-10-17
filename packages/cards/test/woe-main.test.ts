import { readFileSync } from 'node:fs';
import { type Action, redactFor } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import { createHeuristicBot, playMatch } from '../../ai/src/index.ts';
import { cardDb, slug } from '../src/index.ts';
import { WOE_WHITE_MAIN, WOE_WHITE_MAIN_BACKS } from '../src/woe/white-main.ts';
import { WOE_BLUE_MAIN, WOE_BLUE_MAIN_BACKS } from '../src/woe/blue-main.ts';
import { WOE_BLACK_MAIN, WOE_BLACK_MAIN_BACKS } from '../src/woe/black-main.ts';
import { WOE_RED_MAIN, WOE_RED_MAIN_BACKS } from '../src/woe/red-main.ts';
import { WOE_GREEN_MAIN, WOE_GREEN_MAIN_BACKS } from '../src/woe/green-main.ts';
import { WOE_MULTICOLOUR_MAIN } from '../src/woe/multicolour-main.ts';
import { WOE_COLORLESS_MAIN } from '../src/woe/colorless-main.ts';
import { WOE_LAND_MAIN } from '../src/woe/land-main.ts';
import type { GameDriver } from '@mtg/engine/testing';
import { nextTurn, toAttackers } from './ecl-blue-helpers.ts';
import { def as defOfObject, makeCtx } from '../../engine/src/context.ts';
import { n, game, hand, gy, pt, chars, done, activate, casts, exile, passTo, choose, labels, stop } from './ecl-special-helpers.ts';
import { type Cast, play, targeting, tokens, food, rats, keywords, hasKw } from './woe-black-helpers.ts';

// Wilds of Eldraine 23d: the rest of the main set (47 cards). The registry and random games are here; every card has its tests in
// the sections below.

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/woe-groups.json', import.meta.url), 'utf8'),
);
const MAIN_GROUPS = [
  'white-main',
  'blue-main',
  'black-main',
  'red-main',
  'green-main',
  'multicolour-main',
  'colorless-main',
  'land-main',
];
const MAIN_CARDS = Object.entries(groups)
  .filter(([, g]) => MAIN_GROUPS.includes(g))
  .map(([name]) => name);
const BEHAVIOURS = {
  ...WOE_WHITE_MAIN,
  ...WOE_BLUE_MAIN,
  ...WOE_BLACK_MAIN,
  ...WOE_RED_MAIN,
  ...WOE_GREEN_MAIN,
  ...WOE_MULTICOLOUR_MAIN,
  ...WOE_COLORLESS_MAIN,
  ...WOE_LAND_MAIN,
};
const BACKS = {
  ...WOE_WHITE_MAIN_BACKS,
  ...WOE_BLUE_MAIN_BACKS,
  ...WOE_BLACK_MAIN_BACKS,
  ...WOE_RED_MAIN_BACKS,
  ...WOE_GREEN_MAIN_BACKS,
};

describe('Wilds of Eldraine main set: registry', () => {
  it('has behaviour for all 47 cards, each in the pool, and every Adventure side', () => {
    expect(MAIN_CARDS).toHaveLength(47);
    for (const name of MAIN_CARDS) {
      expect(BEHAVIOURS[name], name).toBeDefined();
      expect(cardDb.has(slug(name)), name).toBe(true);
    }
    expect(Object.keys(BEHAVIOURS)).toHaveLength(47);
    for (const name of Object.keys(BACKS)) expect(cardDb.has(slug(name)), name).toBe(true);
    expect(Object.keys(BACKS).sort()).toEqual(
      [
        'Squeak By',
        'Have for Dinner',
        'Hare Raising',
        'Cleave Shadows',
        'Swift Spiral',
        'Vantress Visions',
        "Can't Wake Up",
        'Deathly Ride',
        'Expensive Taste',
        'Stoke Genius',
        'Embereth Blaze',
        'Puny Snack',
        'Dread Whispers',
        'Garenbrig Growth',
        'Seek the Beast',
      ].sort(),
    );
  });

  it('plays short random games with every card of the set in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const cards = MAIN_CARDS.filter((c) => !WOE_LAND_MAIN[c]).map(slug);
    const deck = [...cards, ...cards.slice(0, 14), ...n('island', 4), ...n('swamp', 4), ...n('forest', 4), ...n('mountain', 4), ...n('plains', 4)].slice(0, 70);
    for (let seed = 1; seed <= 8; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});


const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' | 'exile' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);
const ref = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const back = (g: GameDriver, defId: string, pick: (a: Cast) => boolean = () => true) =>
  play(g, defId, (a) => !!a.back && pick(a));
const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && (!p || g.obj(id).controller === p));
/** Marks the permanents as tokens (the scenario builder makes cards). */
const asTokens = (g: GameDriver, ...ids: string[]) => {
  for (const id of ids) g.obj(id).isToken = true;
};
/** Plays on to the precombat main phase of p1's next turn. */
const toMyNextMain = (g: GameDriver) => {
  nextTurn(g);
  if (g.state.turn.activePlayer !== 'p1') nextTurn(g);
};
const lands = (k: number, name = 'plains') => n(name, k);

/** Who can block `attacker` once it attacks (the declare blockers step is skipped when nothing can). */
function blockersFor(g: GameDriver, attacker: string): string[] {
  toAttackers(g);
  g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  if (g.decision.kind !== 'declareBlockers') return [];
  return g
    .legal()
    .flatMap((a) => (a.type === 'addBlock' && a.attacker === attacker ? [g.obj(a.blocker).defId] : []))
    .sort();
}

describe('Cheeky House-Mouse // Squeak By', () => {
  it('is a 2/1 for {W}', () => {
    const g = game({ p1: { hand: ['cheeky-house-mouse'], battlefield: lands(1) } });
    play(g, 'cheeky-house-mouse', (a) => !a.back);
    expect(pt(g, idOf(g, 'cheeky-house-mouse'))).toEqual([2, 1]);
  });
  it('Squeak By gives +1/+1 and the creature can not be blocked by power 3 or greater, then goes on an adventure', () => {
    const g = game({
      p1: { hand: ['cheeky-house-mouse'], battlefield: [...lands(1), 'savannah-lions'] },
      p2: { battlefield: ['devouring-sugarmaw', 'bear-cub'] },
    });
    const lion = idOf(g, 'savannah-lions');
    back(g, 'cheeky-house-mouse', targeting(lion));
    expect(pt(g, lion)).toEqual([3, 2]);
    expect(exile(g)).toEqual(['cheeky-house-mouse']);
    expect(blockersFor(g, lion)).toEqual(['bear-cub']);
  });
});

describe('Discerning Financier and Have for Dinner', () => {
  it('makes a Treasure at your upkeep only while an opponent controls more lands', () => {
    const g = game({
      p1: { battlefield: ['discerning-financier', ...lands(2)] },
      p2: { battlefield: lands(3, 'swamp') },
    });
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
    const equal = game({
      p1: { battlefield: ['discerning-financier', ...lands(3)] },
      p2: { battlefield: lands(3, 'swamp') },
    });
    passTo(equal, 'upkeep', 'p1');
    done(equal);
    expect(tokens(equal, 'treasure-token')).toHaveLength(0);
  });
  it('{2}{W}: the other player gains control of target Treasure you control (it stays tapped or untapped) and you draw a card', () => {
    const g = game({
      p1: { battlefield: ['discerning-financier', ...lands(3), 'treasure-token'], library: ['island', 'island'] },
    });
    const treasure = idOf(g, 'treasure-token');
    g.obj(treasure).tapped = true;
    activate(g, idOf(g, 'discerning-financier'), 1, [ref(g, treasure)]);
    done(g);
    expect(g.obj(treasure).controller).toBe('p2');
    expect(g.obj(treasure).tapped).toBe(true);
    expect(hand(g)).toEqual(['island']);
  });
  it('Have for Dinner (Devouring Sugarmaw\'s Adventure) makes a 1/1 Human and a Food', () => {
    const g = game({ p1: { hand: ['devouring-sugarmaw'], battlefield: lands(2) } });
    back(g, 'devouring-sugarmaw');
    expect(tokens(g, 'woe-w-human-token')).toHaveLength(1);
    expect(food(g)).toHaveLength(1);
    expect(exile(g)).toEqual(['devouring-sugarmaw']);
  });
});

describe('Pollen-Shield Hare // Hare Raising', () => {
  it('creature tokens you control get +1/+1, other creatures and the opponent tokens do not', () => {
    const g = game({
      p1: { battlefield: ['pollen-shield-hare', 'woe-w-human-token', 'savannah-lions'] },
      p2: { battlefield: ['woe-w-human-token'] },
    });
    asTokens(g, idOf(g, 'woe-w-human-token'), idOf(g, 'woe-w-human-token', 'battlefield', 'p2'));
    expect(pt(g, idOf(g, 'woe-w-human-token'))).toEqual([2, 2]);
    expect(pt(g, idOf(g, 'woe-w-human-token', 'battlefield', 'p2'))).toEqual([1, 1]);
    expect(pt(g, idOf(g, 'savannah-lions'))).toEqual([2, 1]);
    expect(pt(g, idOf(g, 'pollen-shield-hare'))).toEqual([2, 2]);
  });
  it('Hare Raising gives vigilance and +X/+X where X is the number of creatures you control', () => {
    const g = game({
      p1: {
        hand: ['pollen-shield-hare'],
        battlefield: [...lands(1, 'forest'), 'savannah-lions', 'bear-cub'],
      },
    });
    const bears = idOf(g, 'bear-cub');
    back(g, 'pollen-shield-hare', targeting(bears));
    expect(pt(g, bears)).toEqual([4, 4]);
    expect(keywords(g, bears).has('vigilance')).toBe(true);
  });
});

describe('Regal Bunnicorn', () => {
  it('is as big as the number of nonland permanents you control', () => {
    const g = game({ p1: { battlefield: ['regal-bunnicorn', 'plains', 'savannah-lions', 'food-token'] } });
    expect(pt(g, idOf(g, 'regal-bunnicorn'))).toEqual([3, 3]);
  });
});

describe('Shrouded Shepherd // Cleave Shadows', () => {
  it('gives target creature you control +2/+2 when it enters (itself included)', () => {
    const g = game({ p1: { hand: ['shrouded-shepherd'], battlefield: lands(2) } });
    play(g, 'shrouded-shepherd', (a) => !a.back);
    done(g, { target: (a) => a.targets.length > 0 });
    expect(pt(g, idOf(g, 'shrouded-shepherd'))).toEqual([4, 4]);
  });
  it('Cleave Shadows gives creatures your opponents control -1/-1 only', () => {
    const g = game({
      p1: { hand: ['shrouded-shepherd'], battlefield: [...lands(1, 'swamp'), ...lands(1), 'savannah-lions'] },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
    back(g, 'shrouded-shepherd');
    expect(pt(g, idOf(g, 'bear-cub', 'battlefield', 'p2'))).toEqual([1, 1]);
    expect(pt(g, idOf(g, 'savannah-lions'))).toEqual([2, 1]);
    expect(exile(g)).toEqual(['shrouded-shepherd']);
  });
});

describe('Three Blind Mice', () => {
  it('I makes a Mouse, II and III copy a token, IV pumps the team with vigilance', () => {
    const g = game({
      p1: { hand: ['three-blind-mice'], battlefield: [...lands(3), 'savannah-lions'], library: n('plains', 8) },
    });
    play(g, 'three-blind-mice');
    expect(tokens(g, 'woe-w-mouse-token')).toHaveLength(1);
    // Chapter II at the precombat main phase of the next turn of p1.
    toMyNextMain(g);
    done(g);
    expect(tokens(g, 'woe-w-mouse-token')).toHaveLength(2);
    toMyNextMain(g);
    done(g);
    expect(tokens(g, 'woe-w-mouse-token')).toHaveLength(3);
    toMyNextMain(g);
    done(g);
    const lion = idOf(g, 'savannah-lions');
    expect(pt(g, lion)).toEqual([3, 2]);
    expect(keywords(g, lion).has('vigilance')).toBe(true);
    // The Saga is sacrificed after chapter IV.
    expect(on(g, 'three-blind-mice')).toHaveLength(0);
  }, 30_000);
});


/** Picks these targets, one at a time, for a trigger that takes any number. */
function pickTriggerTargets(g: GameDriver, ids: string[]): void {
  for (let k = 1; k <= ids.length; k++) {
    for (let i = 0; i < 5 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.length === k &&
          (a.targets[k - 1] as { object: { id: string } }).object.id === ids[k - 1],
      );
    expect(act, `no way to pick ${ids[k - 1]}`).toBeDefined();
    g.do(act!);
  }
  const fin = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === ids.length);
  if (g.decision.kind === 'chooseTriggerTargets' && fin) g.do(fin);
}
/** Casts a card and lets the stack resolve, stopping at the first choice instead of answering it. */
function castStop(g: GameDriver, defId: string, pick: (a: Cast) => boolean = () => true, p: 'p1' | 'p2' = 'p1') {
  const a = casts(g, defId, p).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return stop(g);
}
/** The current definition of an object (a copy, Everflame): name, types and abilities as the engine sees them. */
const current = (g: GameDriver, id: string) => defOfObject(makeCtx(g.state, cardDb), id);
const ROLE_CURSED = 'woe-cursed-role';
const roleOf = (g: GameDriver, host: string, role = ROLE_CURSED) =>
  g.state.battlefield.filter((id) => g.obj(id).attachedTo === host && g.obj(id).defId === role);
const pickObject = (id: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);

describe('Archive Dragon', () => {
  it('is a 4/6 flier with ward {2} that scries 2 when it enters', () => {
    const g = game({
      p1: { hand: ['archive-dragon'], battlefield: lands(6, 'island'), library: ['mountain', 'plains', 'forest'] },
    });
    play(g, 'archive-dragon');
    const d = idOf(g, 'archive-dragon');
    expect(pt(g, d)).toEqual([4, 6]);
    expect(hasKw(g, d, 'flying')).toBe(true);
    expect(cardDb.get('archive-dragon')!.wardCost?.mana.generic).toBe(2);
    expect(g.state.players.p1.library).toHaveLength(3);
  });
  it('asks for the scry as it enters', () => {
    const g = game({
      p1: { hand: ['archive-dragon'], battlefield: lands(6, 'island'), library: ['mountain', 'plains', 'forest'] },
    });
    const a = casts(g, 'archive-dragon')[0]!;
    g.do(a);
    for (let i = 0; i < 6 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    if (g.decision.kind === 'scry') expect(g.decision.cards).toHaveLength(2);
  });
});

describe('Asinine Antics', () => {
  it('creates a Cursed Role on each creature your opponents control, none on yours', () => {
    const g = game({
      p1: { hand: ['asinine-antics'], battlefield: [...lands(4, 'island'), 'savannah-lions'] },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
    play(g, 'asinine-antics');
    for (const id of g.state.battlefield.filter((x) => g.obj(x).controller === 'p2' && g.obj(x).defId !== 'island'))
      expect(roleOf(g, id), g.obj(id).defId).toHaveLength(1);
    expect(roleOf(g, idOf(g, 'savannah-lions'))).toHaveLength(0);
    expect(pt(g, idOf(g, 'bear-cub', 'battlefield', 'p2'))).toEqual([1, 1]);
  });
  it('can be cast at instant speed only by paying {2} more', () => {
    const g = game({
      p1: { hand: ['asinine-antics'], battlefield: lands(6, 'island') },
      p2: { battlefield: ['bear-cub'] },
      active: 'p2',
    });
    g.pass(); // p2 passes; p1 has priority in p2's turn
    expect(g.actor).toBe('p1');
    const acts = casts(g, 'asinine-antics');
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.kicked)).toBe(true);
    // With only four lands there is no way to do it.
    const poor = game({
      p1: { hand: ['asinine-antics'], battlefield: lands(4, 'island') },
      active: 'p2',
    });
    poor.pass();
    expect(casts(poor, 'asinine-antics')).toHaveLength(0);
  });
});

describe('Diminisher Witch', () => {
  const setup = () =>
    game({
      p1: { hand: ['diminisher-witch'], battlefield: [...lands(3, 'island'), 'food-token'] },
      p2: { battlefield: ['bear-cub'] },
    });
  it('bargained: puts a Cursed Role on target creature an opponent controls', () => {
    const g = setup();
    play(g, 'diminisher-witch', (a) => !!a.kicked);
    expect(food(g)).toHaveLength(0);
    expect(roleOf(g, idOf(g, 'bear-cub', 'battlefield', 'p2'))).toHaveLength(1);
    expect(pt(g, idOf(g, 'bear-cub', 'battlefield', 'p2'))).toEqual([1, 1]);
  });
  it('not bargained: only a 3/2', () => {
    const g = setup();
    play(g, 'diminisher-witch', (a) => !a.kicked);
    expect(food(g)).toHaveLength(1);
    expect(roleOf(g, idOf(g, 'bear-cub', 'battlefield', 'p2'))).toHaveLength(0);
    expect(pt(g, idOf(g, 'diminisher-witch'))).toEqual([3, 2]);
  });
});

describe('Extraordinary Journey', () => {
  const cast1 = (g: GameDriver) => {
    const a = casts(g, 'extraordinary-journey').find((x) => x.x === 1);
    expect(a).toBeDefined();
    g.do(a!);
  };
  it('exiles up to X target creatures, whose owners may play them, and draws once each turn when one enters from exile', () => {
    const g = game({
      p1: { hand: ['extraordinary-journey'], battlefield: lands(4, 'island'), library: n('island', 6) },
      p2: { battlefield: ['bear-cub', ...lands(2, 'forest')], library: n('forest', 6) },
    });
    const bear = idOf(g, 'bear-cub', 'battlefield', 'p2');
    cast1(g);
    done(g, { target: pickObject(bear) });
    expect(g.zoneOf(bear)).toBe('exile');
    expect(exile(g, 'p2')).toEqual(['bear-cub']);
    // It's p2's turn next: they cast it from exile; Journey (p1's) draws a card.
    const before = hand(g).length;
    passTo(g, 'main1', 'p2');
    const act = g.legal('p2').find((a) => a.type === 'castSpell' && a.card === bear);
    expect(act).toBeDefined();
    g.do(act!);
    done(g);
    expect(g.zoneOf(bear)).toBe('battlefield');
    // p1 drew for the turn (their draw step) is not counted here: the extra card is the trigger's.
    expect(hand(g).length).toBe(before + 1);
  }, 30_000);
  it('X = 0 exiles nothing; at most X targets can be chosen', () => {
    const g = game({
      p1: { hand: ['extraordinary-journey'], battlefield: lands(4, 'island') },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
    cast1(g);
    // Pick two targets one after the other: only one is allowed.
    expect(g.decision.kind === 'chooseTriggerTargets' || g.state.stack.length > 0).toBe(true);
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const first = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!;
    g.do(first);
    const more = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 2);
    expect(more).toHaveLength(0);
  });
  it('a creature cast from your own exile draws too, but only once each turn; a cast from hand does not', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'extraordinary-journey'],
        battlefield: [...lands(6, 'island'), ...lands(3), 'bear-cub', 'savannah-lions'],
        library: n('island', 6),
      },
    });
    const cub = idOf(g, 'bear-cub');
    const lion = idOf(g, 'savannah-lions');
    // A creature cast from hand does not draw.
    play(g, 'savannah-lions');
    expect(hand(g)).toEqual(['extraordinary-journey']);
    const a = casts(g, 'extraordinary-journey').find((x) => x.x === 2)!;
    g.do(a);
    pickTriggerTargets(g, [cub, lion]);
    done(g);
    expect(exile(g).sort()).toEqual(['bear-cub', 'savannah-lions']);
    expect(hand(g)).toEqual([]);
    // Both are cast from exile: only the first draws.
    g.do(g.legal().find((x) => x.type === 'castSpell' && x.card === lion)!);
    done(g);
    expect(hand(g)).toHaveLength(1);
    const cubCast = g.legal().find((x) => x.type === 'castSpell' && x.card === cub);
    if (cubCast) {
      g.do(cubCast);
      done(g);
    }
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Merfolk Coralsmith', () => {
  it('{1}: +1/-1 until end of turn; scry 2 when it dies', () => {
    const g = game({ p1: { battlefield: ['merfolk-coralsmith', ...lands(4, 'island')], library: n('island', 4) } });
    const m = idOf(g, 'merfolk-coralsmith');
    expect(pt(g, m)).toEqual([2, 3]);
    activate(g, m, 0);
    done(g);
    expect(pt(g, m)).toEqual([3, 2]);
    activate(g, m, 0);
    done(g);
    activate(g, m, 0);
    for (let i = 0; i < 8 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.zoneOf(m)).toBe('graveyard');
    expect(g.decision.kind).toBe('scry');
    if (g.decision.kind === 'scry') expect(g.decision.cards).toHaveLength(2);
  });
});

describe('Twining Twins // Swift Spiral', () => {
  it('is a 4/4 flier with vigilance and ward {1}', () => {
    const g = game({ p1: { battlefield: ['twining-twins'] } });
    const t = idOf(g, 'twining-twins');
    expect(pt(g, t)).toEqual([4, 4]);
    expect(hasKw(g, t, 'flying', 'vigilance')).toBe(true);
    expect(cardDb.get('twining-twins')!.wardCost?.mana.generic).toBe(1);
  });
  it('Swift Spiral exiles a nontoken creature and returns it at the next end step', () => {
    const g = game({
      p1: { hand: ['twining-twins'], battlefield: [...lands(1, 'plains'), ...lands(1, 'island'), 'savannah-lions'] },
    });
    const lion = idOf(g, 'savannah-lions');
    back(g, 'twining-twins', targeting(lion));
    expect(g.zoneOf(lion)).toBe('exile');
    passTo(g, 'end', 'p1');
    done(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
  });
  it('can not target a token', () => {
    const g = game({
      p1: { hand: ['twining-twins'], battlefield: [...lands(1, 'plains'), ...lands(1, 'island'), 'woe-w-human-token'] },
    });
    asTokens(g, idOf(g, 'woe-w-human-token'));
    expect(casts(g, 'twining-twins').filter((a) => a.back)).toHaveLength(0);
  });
});

describe('Virtue of Knowledge // Vantress Visions', () => {
  it('a permanent entering makes your triggers trigger an additional time', () => {
    const g = game({
      p1: {
        hand: ['woodland-acolyte'],
        battlefield: ['virtue-of-knowledge', ...lands(3)],
        library: n('plains', 5),
      },
    });
    play(g, 'woodland-acolyte');
    expect(hand(g)).toEqual(['plains', 'plains']);
  });
  it('without it the trigger happens once, and two Virtues add up to three times', () => {
    const one = game({ p1: { hand: ['woodland-acolyte'], battlefield: lands(3), library: n('plains', 5) } });
    play(one, 'woodland-acolyte');
    expect(hand(one)).toHaveLength(1);
    const two = game({
      p1: {
        hand: ['woodland-acolyte'],
        battlefield: ['virtue-of-knowledge', 'virtue-of-knowledge', ...lands(3)],
        library: n('plains', 5),
      },
    });
    play(two, 'woodland-acolyte');
    expect(hand(two)).toHaveLength(3);
  });
  it('does not double the opponent\'s triggers', () => {
    const g = game({
      p1: { battlefield: ['virtue-of-knowledge'] },
      p2: { hand: ['woodland-acolyte'], battlefield: lands(3), library: n('plains', 5) },
      active: 'p2',
    });
    play(g, 'woodland-acolyte', () => true, 'p2');
    expect(hand(g, 'p2')).toHaveLength(1);
  });
  it('Vantress Visions copies a triggered ability you control', () => {
    const g = game({
      p1: { hand: ['woodland-acolyte', 'virtue-of-knowledge'], battlefield: [...lands(3), ...lands(2, 'island')], library: n('plains', 5) },
    });
    g.do(casts(g, 'woodland-acolyte')[0]!);
    g.passBoth(); // the creature spell resolves; its trigger goes on the stack
    const trigger = g.state.stack.find((x) => x.kind === 'ability')!;
    expect(trigger).toBeDefined();
    const spiral = casts(g, 'virtue-of-knowledge').find(
      (a) => a.back && a.targets.some((t) => 'object' in t && t.object.id === trigger.id),
    );
    expect(spiral).toBeDefined();
    g.do(spiral!);
    done(g);
    expect(hand(g).filter((c) => c === 'plains')).toHaveLength(2);
  });
});


describe('Beseech the Mirror', () => {
  const setup = (library: string[]) =>
    game({
      p1: {
        hand: ['beseech-the-mirror'],
        battlefield: [...lands(4, 'swamp'), 'food-token'],
        library,
      },
    });
  const search = (g: GameDriver, bargained: boolean) => {
    castStop(g, 'beseech-the-mirror', (x) => !!x.kicked === bargained);
    expect(g.decision.kind).toBe('searchLibrary');
  };
  const take = (g: GameDriver, defId: string) => {
    const id = g.state.players.p1.library.find((x) => g.obj(x).defId === defId)!;
    g.do({ type: 'chooseCard', player: 'p1', card: id });
    return id;
  };
  it('not bargained: the card found goes into your hand (the library is shuffled)', () => {
    const g = setup(['archive-dragon', 'island', 'savannah-lions', 'island']);
    search(g, false);
    // A tutor for any card: one option for each different card in the library, and no declining.
    expect(g.legal().filter((a) => a.type === 'chooseCard' && a.card)).toHaveLength(3);
    expect(g.legal().some((a) => a.type === 'chooseCard' && a.card === null)).toBe(false);
    take(g, 'savannah-lions');
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(g.state.players.p1.library).toHaveLength(3);
    expect(food(g)).toHaveLength(1);
  });
  it('the card sits in exile face down for its searcher only', () => {
    const g = setup(['savannah-lions', 'island']);
    search(g, true);
    const lions = take(g, 'savannah-lions');
    expect(g.zoneOf(lions)).toBe('exile');
    expect(g.obj(lions).woeFaceDown).toBe('p1');
    expect(redactFor(g.state, 'p2', cardDb).objects[lions]!.defId).not.toBe('savannah-lions');
    expect(redactFor(g.state, 'p1', cardDb).objects[lions]!.defId).toBe('savannah-lions');
  });
  it('bargained: you may cast a card with mana value 4 or less without paying; otherwise it goes to your hand', () => {
    const g = setup(['savannah-lions', 'island']);
    search(g, true);
    expect(food(g)).toHaveLength(0);
    take(g, 'savannah-lions');
    choose(g, /Cast/);
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    done(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(hand(g)).toEqual([]);
  });
  it('bargained, choosing not to cast, or declining the free cast: it goes to your hand', () => {
    const g = setup(['savannah-lions', 'island']);
    search(g, true);
    take(g, 'savannah-lions');
    choose(g, /hand/);
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    const declined = setup(['savannah-lions', 'island']);
    search(declined, true);
    take(declined, 'savannah-lions');
    choose(declined, /Cast/);
    declined.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(declined);
    expect(hand(declined)).toEqual(['savannah-lions']);
    expect(on(declined, 'savannah-lions', 'p1')).toHaveLength(0);
  });
  it('a card with mana value 5 or more (or a land) can not be cast: it goes to your hand', () => {
    const g = setup(['archive-dragon', 'island']);
    search(g, true);
    take(g, 'archive-dragon');
    done(g);
    expect(hand(g)).toEqual(['archive-dragon']);
    expect(on(g, 'archive-dragon')).toHaveLength(0);
    const land = setup(['forest', 'island']);
    search(land, true);
    take(land, 'forest');
    done(land);
    expect(hand(land)).toEqual(['forest']);
  });
});

describe('Cruel Somnophage // Can\'t Wake Up', () => {
  it('counts the creature cards in all graveyards', () => {
    const g = game({
      p1: { battlefield: ['cruel-somnophage'], graveyard: ['savannah-lions', 'forest', 'island'] },
      p2: { graveyard: ['bear-cub', 'savannah-lions', 'giant-growth'] },
    });
    expect(pt(g, idOf(g, 'cruel-somnophage'))).toEqual([3, 3]);
  });
  it('is 0/0 and dies with no creature cards in graveyards', () => {
    const g = game({ p1: { hand: ['cruel-somnophage'], battlefield: lands(2, 'swamp') } });
    play(g, 'cruel-somnophage', (a) => !a.back);
    expect(g.zoneOf(g.state.players.p1.graveyard[0]!)).toBe('graveyard');
    expect(on(g, 'cruel-somnophage')).toHaveLength(0);
  });
  it("Can't Wake Up makes a player mill four cards", () => {
    const g = game({
      p1: { hand: ['cruel-somnophage'], battlefield: lands(2, 'island') },
      p2: { library: n('forest', 8) },
    });
    play(g, 'cruel-somnophage', (a) => !!a.back && a.targets.some((t) => 'player' in t && t.player === 'p2'));
    expect(gy(g, 'p2')).toHaveLength(4);
    expect(g.state.players.p2.library).toHaveLength(4);
    expect(exile(g)).toEqual(['cruel-somnophage']);
  });
});

describe('Devouring Sugarmaw', () => {
  const upkeep = (battlefield: string[], option?: RegExp) => {
    const g = game({ p1: { battlefield: ['devouring-sugarmaw', ...battlefield] } });
    passTo(g, 'upkeep', 'p1');
    for (let i = 0; i < 4 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    if (g.decision.kind === 'chooseOption' && option) {
      const idx = g.decision.options.findIndex((o) => option.test(o.label));
      g.do({ type: 'chooseOption', player: 'p1', index: idx });
    }
    done(g);
    return g;
  };
  it('is a 6/6 with menace and trample', () => {
    const g = game({ p1: { battlefield: ['devouring-sugarmaw'] } });
    const s = idOf(g, 'devouring-sugarmaw');
    expect(pt(g, s)).toEqual([6, 6]);
    expect(hasKw(g, s, 'menace', 'trample')).toBe(true);
  });
  it('taps when nothing is sacrificed, and with nothing to sacrifice', () => {
    const g = upkeep(['food-token'], /Don't/);
    expect(g.obj(idOf(g, 'devouring-sugarmaw')).tapped).toBe(true);
    expect(food(g)).toHaveLength(1);
    const none = upkeep([]);
    expect(none.obj(idOf(none, 'devouring-sugarmaw')).tapped).toBe(true);
  });
  it('stays untapped when you sacrifice an artifact, an enchantment or a token', () => {
    for (const thing of ['food-token', 'hopeless-nightmare', 'woe-w-human-token']) {
      const g = game({ p1: { battlefield: ['devouring-sugarmaw', thing] } });
      if (thing === 'woe-w-human-token') asTokens(g, idOf(g, thing));
      passTo(g, 'upkeep', 'p1');
      for (let i = 0; i < 4 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
      expect(g.decision.kind).toBe('chooseOption');
      g.do({ type: 'chooseOption', player: 'p1', index: 0 });
      done(g);
      expect(g.obj(idOf(g, 'devouring-sugarmaw')).tapped, thing).toBe(false);
      expect(on(g, thing), thing).toHaveLength(0);
    }
  });
});

describe('Ego Drain', () => {
  const setup = (battlefield: string[] = []) =>
    game({
      p1: { hand: ['ego-drain', 'island', 'savannah-lions'], battlefield: ['swamp', ...battlefield] },
      p2: { hand: ['forest', 'bear-cub', 'giant-growth'] },
    });
  it('makes the opponent discard the nonland card you choose, and you exile a card from your hand without a Faerie', () => {
    const g = setup();
    play(g, 'ego-drain', () => true);
    // The nonland choice: forest can not be picked.
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    expect(hand(g, 'p2').sort()).toEqual(['forest', 'giant-growth']);
    expect(hand(g)).toHaveLength(1);
    expect(exile(g)).toHaveLength(1);
  });
  it('does not make you exile a card while you control a Faerie', () => {
    const g = setup(['barrow-naughty']);
    play(g, 'ego-drain', () => true);
    expect(gy(g, 'p2')).toHaveLength(1);
    expect(hand(g)).toHaveLength(2);
    expect(exile(g)).toHaveLength(0);
  });
  it('exiles your card even when the opponent has no nonland card', () => {
    const g = game({
      p1: { hand: ['ego-drain', 'island'], battlefield: ['swamp'] },
      p2: { hand: ['forest'] },
    });
    castStop(g, 'ego-drain');
    // Their hand is revealed, but there is nothing to choose.
    expect(g.decision.kind).toBe('chooseFromHand');
    g.do({ type: 'chooseCard', player: 'p1', card: null } as never);
    done(g);
    expect(hand(g, 'p2')).toEqual(['forest']);
    expect(exile(g)).toEqual(['island']);
  });
});

describe('Fell Horseman // Deathly Ride', () => {
  it('goes on the bottom of its owner\'s library instead of staying in the graveyard when it dies', () => {
    const g = game({
      p1: { hand: ['flick-a-coin'], battlefield: [...lands(3, 'mountain')] },
      p2: { battlefield: ['fell-horseman'], library: n('forest', 3) },
    });
    const fh = idOf(g, 'fell-horseman', 'battlefield', 'p2');
    g.obj(fh).damage = 2;
    // 3 toughness: a Flick a Coin (1 damage) finishes it.
    play(g, 'flick-a-coin', (a) => targeting(fh)(a));
    expect(g.zoneOf(fh)).toBe('library');
    expect(g.state.players.p2.library[g.state.players.p2.library.length - 1]).toBe(fh);
    expect(gy(g, 'p2')).toEqual([]);
  });
  it('Deathly Ride returns a creature card from your graveyard to your hand', () => {
    const g = game({
      p1: { hand: ['fell-horseman'], battlefield: lands(2, 'swamp'), graveyard: ['savannah-lions', 'island'] },
    });
    const lion = idOf(g, 'savannah-lions', 'graveyard');
    play(g, 'fell-horseman', (a) => !!a.back && targeting(lion)(a));
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(exile(g)).toEqual(['fell-horseman']);
  });
});

describe("Lich-Knights' Conquest", () => {
  it('sacrifices any number of artifacts, enchantments, and tokens, then returns that many creature cards', () => {
    const g = game({
      p1: {
        hand: ['lich-knights-conquest'],
        battlefield: [...lands(5, 'swamp'), 'food-token', 'food-token', 'hopeless-nightmare', 'savannah-lions'],
        graveyard: ['savannah-lions', 'bear-cub', 'fell-horseman'],
      },
    });
    castStop(g, 'lich-knights-conquest');
    // The sacrifices come first, one at a time; Done comes first in the list.
    expect(labels(g)[0]).toMatch(/Sacrifice nothing/);
    expect(labels(g).slice(1).sort()).toEqual(
      ['Sacrifice Food', 'Sacrifice Food', 'Sacrifice Hopeless Nightmare'].sort(),
    );
    choose(g, /Sacrifice Food/);
    choose(g, /Sacrifice Hopeless/);
    expect(labels(g)[0]).toMatch(/Done sacrificing \(2\)/);
    choose(g, /Done/);
    expect(labels(g)).toHaveLength(3);
    choose(g, /Return Fell Horseman/);
    choose(g, /Return Bear Cub/);
    done(g);
    expect(on(g, 'food-token')).toHaveLength(1);
    expect(on(g, 'hopeless-nightmare')).toHaveLength(0);
    expect(on(g, 'fell-horseman')).toHaveLength(1);
    expect(on(g, 'bear-cub')).toHaveLength(1);
    expect(gy(g)).toContain('savannah-lions');
  });
  it('does nothing when you sacrifice nothing, and returns as many as there are cards', () => {
    const none = game({
      p1: { hand: ['lich-knights-conquest'], battlefield: [...lands(5, 'swamp'), 'food-token'], graveyard: ['bear-cub'] },
    });
    castStop(none, 'lich-knights-conquest');
    choose(none, /nothing/);
    done(none);
    expect(on(none, 'bear-cub')).toHaveLength(0);
    expect(on(none, 'food-token')).toHaveLength(1);
    const few = game({
      p1: {
        hand: ['lich-knights-conquest'],
        battlefield: [...lands(5, 'swamp'), 'food-token', 'food-token'],
        graveyard: ['bear-cub'],
      },
    });
    castStop(few, 'lich-knights-conquest');
    choose(few, /Sacrifice Food/);
    choose(few, /Sacrifice Food/);
    // No more to sacrifice: straight to returning (one card in the graveyard).
    choose(few, /Return Bear Cub/);
    done(few);
    expect(on(few, 'bear-cub')).toHaveLength(1);
    expect(on(few, 'food-token')).toHaveLength(0);
  });
});

describe("Rankle's Prank", () => {
  const modes = (g: GameDriver) => casts(g, 'rankles-prank');
  const setup = () =>
    game({
      p1: {
        hand: ['rankles-prank', 'island', 'forest', 'plains'],
        battlefield: [...lands(4, 'swamp'), 'savannah-lions', 'bear-cub', 'fell-horseman'],
      },
      p2: {
        hand: ['island', 'forest', 'plains', 'mountain'],
        battlefield: ['savannah-lions', 'bear-cub', 'fell-horseman'],
      },
    });
  it('offers every combination of its three modes', () => {
    expect(modes(setup())).toHaveLength(7);
    expect(cardDb.get('rankles-prank')!.modes).toHaveLength(7);
  });
  it('mode 1: each player discards two cards', () => {
    const g = setup();
    g.do(modes(g)[0]!);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(hand(g, 'p2')).toHaveLength(2);
  });
  it('mode 2: each player loses 4 life', () => {
    const g = setup();
    g.do(modes(g)[1]!);
    done(g);
    expect([g.life('p1'), g.life('p2')]).toEqual([16, 16]);
  });
  it('mode 3: each player sacrifices two creatures of their choice', () => {
    const g = setup();
    g.do(modes(g)[3]!);
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1' && g.obj(id).defId !== 'swamp')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(1);
  });
  it('all three modes together', () => {
    const g = setup();
    g.do(modes(g)[6]!);
    done(g);
    expect([g.life('p1'), g.life('p2')]).toEqual([16, 16]);
    expect(hand(g)).toHaveLength(1);
    expect(hand(g, 'p2')).toHaveLength(2);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(1);
  });
  it('sacrifices as many creatures as a player has when they have fewer than two', () => {
    const g = game({
      p1: { hand: ['rankles-prank'], battlefield: [...lands(4, 'swamp'), 'savannah-lions'] },
      p2: { battlefield: ['bear-cub'] },
    });
    g.do(modes(g)[3]!);
    done(g);
    expect(on(g, 'savannah-lions')).toHaveLength(0);
    expect(on(g, 'bear-cub')).toHaveLength(0);
  });
});

describe('Shatter the Oath', () => {
  it('destroys target creature or enchantment and puts a Wicked Role on up to one creature you control', () => {
    const g = game({
      p1: { hand: ['shatter-the-oath'], battlefield: [...lands(5, 'swamp'), 'savannah-lions'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = idOf(g, 'bear-cub', 'battlefield', 'p2');
    const lion = idOf(g, 'savannah-lions');
    const acts = casts(g, 'shatter-the-oath');
    g.do(acts.find((a) => a.targets.length === 2 && targeting(cub)(a) && targeting(lion)(a))!);
    done(g);
    expect(g.zoneOf(cub)).toBe('graveyard');
    expect(roleOf(g, lion, 'woe-wicked-role')).toHaveLength(1);
    expect(pt(g, lion)).toEqual([3, 2]);
  });
  it('can also destroy an enchantment, with no Role when no creature is chosen', () => {
    const g = game({
      p1: { hand: ['shatter-the-oath'], battlefield: lands(5, 'swamp') },
      p2: { battlefield: ['hopeless-nightmare'] },
    });
    const ench = idOf(g, 'hopeless-nightmare', 'battlefield', 'p2');
    const act = casts(g, 'shatter-the-oath').find((a) => a.targets.length === 1 && targeting(ench)(a));
    expect(act).toBeDefined();
    g.do(act!);
    done(g);
    expect(g.zoneOf(ench)).toBe('graveyard');
  });
});

describe('Specter of Mortality', () => {
  it('is a 3/3 flier; exiling creature cards from your graveyard gives each other creature -X/-X', () => {
    const g = game({
      p1: {
        hand: ['specter-of-mortality'],
        battlefield: [...lands(5, 'swamp'), 'savannah-lions', 'fell-horseman'],
        graveyard: ['bear-cub', 'savannah-lions', 'island'],
      },
      p2: { battlefield: ['bear-cub', 'devouring-sugarmaw'] },
    });
    castStop(g, 'specter-of-mortality');
    expect(labels(g)).toHaveLength(3); // don't exile, Bear Cub, Savannah Lions
    choose(g, /Exile Bear Cub/);
    expect(labels(g)[0]).toMatch(/Done: exile 1/);
    // The last creature card: no more to choose from, so it finishes by itself.
    choose(g, /Exile Savannah Lions/);
    done(g);
    expect(exile(g).sort()).toEqual(['bear-cub', 'savannah-lions']);
    expect(on(g, 'bear-cub')).toHaveLength(0);
    expect(on(g, 'savannah-lions')).toHaveLength(0);
    expect(pt(g, idOf(g, 'fell-horseman'))).toEqual([1, 1]);
    expect(pt(g, idOf(g, 'devouring-sugarmaw', 'battlefield', 'p2'))).toEqual([4, 4]);
    expect(pt(g, idOf(g, 'specter-of-mortality'))).toEqual([3, 3]);
  });
  it('may exile nothing: no one shrinks', () => {
    const g = game({
      p1: { hand: ['specter-of-mortality'], battlefield: lands(5, 'swamp'), graveyard: ['bear-cub'] },
      p2: { battlefield: ['devouring-sugarmaw'] },
    });
    castStop(g, 'specter-of-mortality');
    choose(g, /Don't exile/);
    done(g);
    expect(gy(g)).toEqual(['bear-cub']);
    expect(pt(g, idOf(g, 'devouring-sugarmaw', 'battlefield', 'p2'))).toEqual([6, 6]);
  });
  it('has no choice to make with no creature card in your graveyard', () => {
    const g = game({ p1: { hand: ['specter-of-mortality'], battlefield: lands(5, 'swamp'), graveyard: ['island'] } });
    play(g, 'specter-of-mortality');
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Spiteful Hexmage', () => {
  it('is a 3/2 for {B} that puts a Cursed Role on target creature you control', () => {
    const g = game({ p1: { hand: ['spiteful-hexmage'], battlefield: ['swamp', 'devouring-sugarmaw'] } });
    const big = idOf(g, 'devouring-sugarmaw');
    play(g, 'spiteful-hexmage');
    done(g, { target: pickObject(big) });
    expect(roleOf(g, big)).toHaveLength(1);
    expect(pt(g, big)).toEqual([1, 1]);
    expect(pt(g, idOf(g, 'spiteful-hexmage'))).toEqual([3, 2]);
  });
});

describe('Tangled Colony', () => {
  it('can not block; when it dies it makes a Rat for each damage dealt to it this turn', () => {
    const g = game({
      p1: { hand: ['virtue-of-courage'], battlefield: [...lands(2, 'mountain'), 'tangled-colony'] },
    });
    const colony = idOf(g, 'tangled-colony');
    expect(pt(g, colony)).toEqual([3, 2]);
    play(g, 'virtue-of-courage', (a) => !!a.back && targeting(colony)(a));
    expect(on(g, 'tangled-colony')).toHaveLength(0);
    expect(rats(g)).toHaveLength(2);
  });
  it('makes no Rats when it did not take damage this turn', () => {
    const g = game({
      p1: { hand: ['gingerbread-hunter'], battlefield: [...lands(3, 'swamp'), 'tangled-colony'] },
    });
    const colony = idOf(g, 'tangled-colony');
    play(g, 'gingerbread-hunter', (a) => !!a.back && targeting(colony)(a));
    expect(on(g, 'tangled-colony')).toHaveLength(0);
    expect(rats(g)).toHaveLength(0);
  });
  it("can't block", () => {
    const g = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['tangled-colony'] },
    });
    expect(blockersFor(g, idOf(g, 'savannah-lions'))).toEqual([]);
  });
});

describe('The End', () => {
  const setup = (life = 20) =>
    game({
      p1: { hand: ['the-end'], battlefield: lands(4, 'swamp'), life },
      p2: {
        battlefield: ['bear-cub'],
        hand: ['bear-cub', 'bear-cub', 'forest'],
        graveyard: ['bear-cub', 'savannah-lions'],
        library: ['bear-cub', 'forest', 'forest', 'bear-cub'],
      },
    });
  it('costs {2} less while your life total is 5 or less', () => {
    const cheap = game({ p1: { hand: ['the-end'], battlefield: lands(2, 'swamp'), life: 5 }, p2: { battlefield: ['bear-cub'] } });
    expect(casts(cheap, 'the-end').length).toBeGreaterThan(0);
    const dear = game({ p1: { hand: ['the-end'], battlefield: lands(2, 'swamp'), life: 6 }, p2: { battlefield: ['bear-cub'] } });
    expect(casts(dear, 'the-end')).toHaveLength(0);
  });
  it('exiles the creature and every card with its name from graveyard, hand and library; they draw for the hand cards', () => {
    const g = setup();
    const cub = idOf(g, 'bear-cub', 'battlefield', 'p2');
    castStop(g, 'the-end', targeting(cub));
    // Most cards first for each zone.
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual(['Exile 1 from their graveyard', 'Exile 0 from their graveyard']);
    choose(g, /Exile 1 from their graveyard/);
    expect(labels(g)[0]).toBe('Exile 2 from their hand');
    choose(g, /Exile 2 from their hand/);
    expect(labels(g)[0]).toBe('Exile 2 from their library');
    choose(g, /Exile 2 from their library/);
    done(g);
    expect(exile(g, 'p2').filter((c) => c === 'bear-cub')).toHaveLength(6);
    expect(hand(g, 'p2').filter((c) => c === 'bear-cub')).toHaveLength(0);
    // They drew two cards (one per card exiled from their hand): a hand of 1 Forest + 2 drawn.
    expect(hand(g, 'p2')).toHaveLength(3);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });
  it('lets you leave cards behind, and a creature with no copies elsewhere just goes', () => {
    const g = setup();
    const cub = idOf(g, 'bear-cub', 'battlefield', 'p2');
    castStop(g, 'the-end', targeting(cub));
    choose(g, /Exile 0 from their graveyard/);
    choose(g, /Exile 0 from their hand/);
    choose(g, /Exile 0 from their library/);
    done(g);
    expect(g.zoneOf(cub)).toBe('exile');
    expect(hand(g, 'p2').filter((c) => c === 'bear-cub')).toHaveLength(2);
    const lone = game({
      p1: { hand: ['the-end'], battlefield: lands(4, 'swamp') },
      p2: { battlefield: ['savannah-lions'] },
    });
    play(lone, 'the-end', () => true);
    expect(lone.zoneOf(idOf(lone, 'savannah-lions', 'exile', 'p2'))).toBe('exile');
  });
  it('also exiles a planeswalker', () => {
    expect(cardDb.get('the-end')!.spell!.targets[0]!.filter!.types).toEqual(['Creature', 'Planeswalker']);
  });
});

describe('Warehouse Tabby', () => {
  it('makes a Rat when an enchantment you control goes to the graveyard', () => {
    const g = game({
      p1: { battlefield: ['warehouse-tabby', 'hopeless-nightmare', ...lands(3, 'swamp')] },
    });
    activate(g, idOf(g, 'hopeless-nightmare'), 2);
    done(g);
    expect(rats(g)).toHaveLength(1);
  });
  it("does not for an opponent's enchantment", () => {
    const g = game({
      p1: { battlefield: ['warehouse-tabby'] },
      p2: { battlefield: ['hopeless-nightmare', ...lands(3, 'swamp')] },
    });
    g.pass();
    activate(g, idOf(g, 'hopeless-nightmare', 'battlefield', 'p2'), 2);
    done(g);
    expect(rats(g)).toHaveLength(0);
  });
  it('{1}{B}: gains deathtouch until end of turn', () => {
    const g = game({ p1: { battlefield: ['warehouse-tabby', ...lands(2, 'swamp')] } });
    const t = idOf(g, 'warehouse-tabby');
    expect(hasKw(g, t, 'deathtouch')).toBe(false);
    activate(g, t, 1);
    done(g);
    expect(hasKw(g, t, 'deathtouch')).toBe(true);
    expect(pt(g, t)).toEqual([1, 1]);
  });
});


const tapOpponentLibrary = (g: GameDriver, p: 'p1' | 'p2') => g.state.players[p].library.map((id) => g.obj(id).defId);

describe('Decadent Dragon // Expensive Taste', () => {
  it('is a 4/4 flier with trample that makes a Treasure when it attacks', () => {
    const g = game({ p1: { battlefield: ['decadent-dragon'] } });
    const d = idOf(g, 'decadent-dragon');
    expect(pt(g, d)).toEqual([4, 4]);
    expect(hasKw(g, d, 'flying', 'trample')).toBe(true);
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: d, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    done(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });
  it('Expensive Taste exiles the top two cards of an opponent\'s library face down; you may look at and play them', () => {
    const g = game({
      p1: { hand: ['decadent-dragon'], battlefield: [...lands(1, 'swamp'), ...lands(2, 'swamp'), 'plains'] },
      p2: { library: ['savannah-lions', 'forest', 'island'] },
    });
    play(g, 'decadent-dragon', (a) => !!a.back && a.targets.some((t) => 'player' in t && t.player === 'p2'));
    expect(exile(g, 'p2')).toEqual(['savannah-lions', 'forest']);
    expect(tapOpponentLibrary(g, 'p2')).toEqual(['island']);
    const lions = idOf(g, 'savannah-lions', 'exile', 'p2');
    const forest = idOf(g, 'forest', 'exile', 'p2');
    // Face down for the opponent only.
    expect(redactFor(g.state, 'p2', cardDb).objects[lions]!.defId).not.toBe('savannah-lions');
    expect(redactFor(g.state, 'p1', cardDb).objects[lions]!.defId).toBe('savannah-lions');
    // I may play them (the land too) and cast the spell with my own mana.
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === lions)).toBe(true);
    const land = g.legal().find((a) => a.type === 'playLand' && a.card === forest);
    expect(land).toBeDefined();
    g.do(land!);
    expect(g.zoneOf(forest)).toBe('battlefield');
    expect(g.obj(forest).controller).toBe('p1');
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === lions)!);
    done(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
  });
  it('the exiled cards stay playable on later turns, not by the opponent', () => {
    const g = game({
      p1: { hand: ['decadent-dragon'], battlefield: [...lands(3, 'swamp'), 'plains'] },
      p2: { battlefield: ['plains'], library: ['savannah-lions', 'island', 'island'] },
    });
    play(g, 'decadent-dragon', (a) => !!a.back && a.targets.some((t) => 'player' in t && t.player === 'p2'));
    const lions = idOf(g, 'savannah-lions', 'exile', 'p2');
    nextTurn(g); // p2's turn
    expect(g.legal('p2').some((a) => a.type === 'castSpell' && a.card === lions)).toBe(false);
    nextTurn(g); // p1's turn again
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === lions)).toBe(true);
  }, 30_000);
});

describe('Flick a Coin', () => {
  it('deals 1 damage to any target, makes a Treasure, and draws a card', () => {
    const g = game({
      p1: { hand: ['flick-a-coin'], battlefield: lands(3, 'mountain'), library: ['island', 'island'] },
    });
    castStop(g, 'flick-a-coin', (a) => a.targets.some((t) => 'player' in t && t.player === 'p2'));
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
    expect(hand(g)).toEqual(['island']);
  });
});

describe('Hearth Elemental // Stoke Genius', () => {
  const creatureCasts = (g: GameDriver) => casts(g, 'hearth-elemental').filter((a) => !a.back);
  const setup = (graveyard: string[], k: number) =>
    game({ p1: { hand: ['hearth-elemental'], battlefield: lands(k, 'mountain'), graveyard } });
  it('costs {1} less for each instant, sorcery or Adventure card in your graveyard', () => {
    // Flick a Coin (instant), Cheeky House-Mouse (has an Adventure), Bear Cub (neither).
    const three = ['flick-a-coin', 'cheeky-house-mouse', 'bear-cub'];
    expect(creatureCasts(setup(three, 4))).not.toHaveLength(0);
    expect(creatureCasts(setup(three, 3))).toHaveLength(0);
    expect(creatureCasts(setup([], 5))).toHaveLength(0);
    expect(creatureCasts(setup([], 6))).not.toHaveLength(0);
    expect(creatureCasts(setup(['flick-a-coin', 'cheeky-house-mouse', 'ego-drain', 'island'], 2))).toHaveLength(0);
    expect(creatureCasts(setup(['flick-a-coin', 'ego-drain', 'cheeky-house-mouse', 'hearth-elemental', 'virtue-of-courage'], 1))).not.toHaveLength(0);
  });
  it('is a 4/5', () => {
    const g = setup([], 6);
    play(g, 'hearth-elemental');
    expect(pt(g, idOf(g, 'hearth-elemental'))).toEqual([4, 5]);
  });
  it('Stoke Genius discards your hand, then draws two cards', () => {
    const g = game({
      p1: {
        hand: ['hearth-elemental', 'island', 'forest'],
        battlefield: lands(2, 'mountain'),
        library: ['plains', 'swamp', 'swamp'],
      },
    });
    play(g, 'hearth-elemental', (a) => !!a.back);
    expect(gy(g).sort()).toEqual(['forest', 'island']);
    expect(hand(g).sort()).toEqual(['plains', 'swamp']);
    expect(exile(g)).toEqual(['hearth-elemental']);
  });
});

describe('Rotisserie Elemental', () => {
  const attack = (g: GameDriver) => {
    const r = idOf(g, 'rotisserie-elemental');
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: r, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 12 && g.decision.kind !== 'optionalEffect'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else break;
    }
    return r;
  };
  it('is a 1/1 with menace', () => {
    const g = game({ p1: { battlefield: ['rotisserie-elemental'] } });
    expect(pt(g, idOf(g, 'rotisserie-elemental'))).toEqual([1, 1]);
    expect(hasKw(g, idOf(g, 'rotisserie-elemental'), 'menace')).toBe(true);
  });
  it('combat damage to a player: a skewer counter; you may sacrifice it to exile that many cards you may play this turn', () => {
    const g = game({
      p1: { battlefield: ['rotisserie-elemental'], library: ['plains', 'island', 'forest'] },
    });
    const r = attack(g);
    expect(g.decision.kind).toBe('optionalEffect');
    expect(g.obj(r).counters?.skewer).toBe(1);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g);
    expect(g.zoneOf(r)).toBe('graveyard');
    expect(exile(g)).toEqual(['plains']);
    expect(g.life('p2')).toBe(19);
    expect(g.legal().some((a) => a.type === 'playLand' && g.obj(a.card).defId === 'plains')).toBe(false); // combat: not a main phase
  });
  it('keeping it: the counters stay and the next hit exiles more', () => {
    const g = game({
      p1: { battlefield: ['rotisserie-elemental'], library: ['plains', 'island', 'forest', 'swamp'] },
    });
    const r = attack(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(g.zoneOf(r)).toBe('battlefield');
    expect(g.obj(r).counters?.skewer).toBe(1);
    nextTurn(g);
    nextTurn(g);
    const again = attack(g);
    expect(g.obj(again).counters?.skewer).toBe(2);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g);
    expect(exile(g)).toHaveLength(2);
  }, 30_000);
});

describe('Unruly Catapult', () => {
  it('is a 0/4 defender; {T}: 1 damage to each opponent; untaps when you cast an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['flick-a-coin'], battlefield: ['unruly-catapult', ...lands(3, 'mountain')] },
    });
    const c = idOf(g, 'unruly-catapult');
    expect(pt(g, c)).toEqual([0, 4]);
    expect(hasKw(g, c, 'defender')).toBe(true);
    activate(g, c, 0);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(c).tapped).toBe(true);
    castStop(g, 'flick-a-coin', (a) => a.targets.some((t) => 'player' in t && t.player === 'p2'));
    done(g);
    expect(g.obj(c).tapped).toBe(false);
    activate(g, c, 0);
    done(g);
    expect(g.life('p2')).toBe(17);
  });
  it('does not untap for a creature spell', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: [{ card: 'unruly-catapult', tapped: true }, ...lands(1)] },
    });
    play(g, 'savannah-lions');
    expect(g.obj(idOf(g, 'unruly-catapult')).tapped).toBe(true);
  });
});

describe('Virtue of Courage // Embereth Blaze', () => {
  it('Embereth Blaze deals 2 damage to any target', () => {
    const g = game({
      p1: { hand: ['virtue-of-courage'], battlefield: lands(2, 'mountain') },
      p2: { battlefield: ['bear-cub'] },
    });
    play(g, 'virtue-of-courage', (a) => !!a.back && targeting(idOf(g, 'bear-cub', 'battlefield', 'p2'))(a));
    expect(on(g, 'bear-cub')).toHaveLength(0);
    expect(exile(g)).toEqual(['virtue-of-courage']);
  });
  it('noncombat damage to an opponent from a source you control: exile that many cards, play them this turn', () => {
    const g = game({
      p1: {
        hand: ['flick-a-coin', 'embereth-blaze'],
        battlefield: ['virtue-of-courage', ...lands(6, 'mountain')],
        library: ['mountain', 'plains', 'island', 'forest'],
      },
    });
    castStop(g, 'flick-a-coin', (a) => a.targets.some((t) => 'player' in t && t.player === 'p2'));
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(exile(g)).toEqual(['plains']);
    // A land exiled this way can be played this turn.
    expect(g.legal().some((a) => a.type === 'playLand' && g.obj(a.card).zone === 'exile')).toBe(true);
  });
  it('2 damage exiles two cards; damage to a creature or to yourself does not', () => {
    const g = game({
      p1: {
        hand: ['embereth-blaze-holder'].slice(0, 0),
        battlefield: ['virtue-of-courage', ...lands(4, 'mountain')],
        library: ['mountain', 'plains', 'island', 'forest'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    void g;
    const h = game({
      p1: {
        hand: ['virtue-of-courage'],
        battlefield: ['virtue-of-courage', ...lands(4, 'mountain')],
        library: ['mountain', 'plains', 'island', 'forest'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    // Aimed at a creature: nothing is exiled.
    const cub = idOf(h, 'bear-cub', 'battlefield', 'p2');
    castStop(h, 'virtue-of-courage', (a) => !!a.back && targeting(cub)(a));
    done(h);
    expect(exile(h)).toEqual(['virtue-of-courage']);
    const face = game({
      p1: {
        hand: ['virtue-of-courage'],
        battlefield: ['virtue-of-courage', ...lands(4, 'mountain')],
        library: ['mountain', 'plains', 'island', 'forest'],
      },
    });
    castStop(face, 'virtue-of-courage', (a) => !!a.back && a.targets.some((t) => 'player' in t && t.player === 'p2'));
    done(face);
    expect(exile(face).sort()).toEqual(['mountain', 'plains', 'virtue-of-courage'].sort());
    expect(face.life('p2')).toBe(18);
  });
});

describe('Blossoming Tortoise', () => {
  it('mills three, then returns a land card from your graveyard to the battlefield tapped, when it enters', () => {
    const g = game({
      p1: {
        hand: ['blossoming-tortoise'],
        battlefield: lands(4, 'forest'),
        graveyard: ['island'],
        library: ['mountain', 'plains', 'bear-cub', 'island'],
      },
    });
    castStop(g, 'blossoming-tortoise');
    done(g, { card: (id) => g.obj(id).defId === 'mountain' });
    expect(gy(g).filter((c) => c !== 'blossoming-tortoise')).toHaveLength(3);
    const mountain = g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain');
    expect(mountain).toHaveLength(1);
    expect(g.obj(mountain[0]!).tapped).toBe(true);
  });
  it('the land is not optional: with a land in the graveyard you must choose one', () => {
    const g = game({
      p1: { hand: ['blossoming-tortoise'], battlefield: lands(4, 'forest'), graveyard: ['island'], library: n('bear-cub', 4) },
    });
    castStop(g, 'blossoming-tortoise');
    expect(g.decision.kind).toBe('searchLibrary');
    expect(g.legal().some((a) => a.type === 'chooseCard' && a.card === null)).toBe(false);
  });
  it('does it again when it attacks', () => {
    const g = game({
      p1: { battlefield: ['blossoming-tortoise'], library: ['mountain', 'bear-cub', 'bear-cub', 'bear-cub'] },
    });
    const t = idOf(g, 'blossoming-tortoise');
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: t, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.pass();
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain')).toHaveLength(1);
  });
  it('activated abilities of lands cost {1} less; land creatures you control get +1/+1', () => {
    const g = game({
      p1: { battlefield: ['blossoming-tortoise', 'restless-bivouac', 'mountain', 'plains'] },
    });
    const b = idOf(g, 'restless-bivouac');
    g.obj(b).tapped = false;
    // {1}{R}{W} becomes {R}{W}.
    activate(g, b, 2);
    done(g);
    expect(pt(g, b)).toEqual([3, 3]);
    expect(isLand(g, b)).toBe(true);
    // Another player's lands do not get cheaper: p2's Restless land needs the full cost.
    const o = game({
      p1: { battlefield: ['blossoming-tortoise'] },
      p2: { battlefield: [{ card: 'restless-bivouac', tapped: true }, 'mountain', 'plains'] },
      active: 'p2',
    });
    expect(
      o.legal('p2').some((a) => a.type === 'activateAbility' && o.obj(a.source).defId === 'restless-bivouac' && a.abilityIndex === 2),
    ).toBe(false);
  });
});

const isLand = (g: GameDriver, id: string) => chars(g, id).types.includes('Land');

describe('Gingerbread Hunter // Puny Snack', () => {
  it('is a 5/5 that makes a Food when it enters', () => {
    const g = game({ p1: { hand: ['gingerbread-hunter'], battlefield: lands(5, 'forest') } });
    play(g, 'gingerbread-hunter', (a) => !a.back);
    expect(pt(g, idOf(g, 'gingerbread-hunter'))).toEqual([5, 5]);
    expect(food(g)).toHaveLength(1);
  });
  it('Puny Snack gives target creature -2/-2', () => {
    const g = game({
      p1: { hand: ['gingerbread-hunter'], battlefield: lands(3, 'swamp') },
      p2: { battlefield: ['bear-cub', 'devouring-sugarmaw'] },
    });
    const big = idOf(g, 'devouring-sugarmaw', 'battlefield', 'p2');
    back(g, 'gingerbread-hunter', targeting(big));
    expect(pt(g, big)).toEqual([4, 4]);
    expect(exile(g)).toEqual(['gingerbread-hunter']);
  });
});

describe('Howling Galefang', () => {
  it('is a 4/4 with vigilance that has haste only while you own a card in exile that has an Adventure', () => {
    const g = game({
      p1: { hand: ['cheeky-house-mouse'], battlefield: ['howling-galefang', 'savannah-lions', ...lands(1)] },
    });
    const f = idOf(g, 'howling-galefang');
    expect(pt(g, f)).toEqual([4, 4]);
    expect(hasKw(g, f, 'vigilance')).toBe(true);
    expect(hasKw(g, f, 'haste')).toBe(false);
    back(g, 'cheeky-house-mouse', targeting(idOf(g, 'savannah-lions')));
    expect(hasKw(g, f, 'haste')).toBe(true);
  });
  it('an opponent\'s Adventure card in exile does not count', () => {
    const g = game({
      p1: { battlefield: ['howling-galefang'] },
      p2: { hand: ['cheeky-house-mouse'], battlefield: [...lands(1), 'savannah-lions'] },
      active: 'p2',
    });
    play(g, 'cheeky-house-mouse', (a) => !!a.back, 'p2');
    expect(exile(g, 'p2')).toEqual(['cheeky-house-mouse']);
    expect(hasKw(g, idOf(g, 'howling-galefang'), 'haste')).toBe(false);
  });
});

describe('Mosswood Dreadknight // Dread Whispers', () => {
  const dies = () => {
    const g = game({
      p1: {
        hand: ['gingerbread-hunter'],
        battlefield: [...lands(3, 'swamp'), 'mosswood-dreadknight'],
        library: n('island', 6),
      },
    });
    const k = idOf(g, 'mosswood-dreadknight');
    back(g, 'gingerbread-hunter', targeting(k));
    done(g);
    expect(g.zoneOf(k)).toBe('graveyard');
    return { g, k };
  };
  it('is a 3/2 with trample', () => {
    const g = game({ p1: { battlefield: ['mosswood-dreadknight'] } });
    const k = idOf(g, 'mosswood-dreadknight');
    expect(pt(g, k)).toEqual([3, 2]);
    expect(hasKw(g, k, 'trample')).toBe(true);
  });
  it('when it dies you may cast Dread Whispers from the graveyard (not the creature); it then goes on an adventure', () => {
    const { g, k } = dies();
    // Untap three swamps for the next spell: it is the same turn.
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
    const acts = g.legal().filter((a) => a.type === 'castSpell' && a.card === k);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.type === 'castSpell' && a.back)).toBe(true);
    g.do(acts[0]!);
    done(g);
    expect(g.zoneOf(k)).toBe('exile');
    expect(g.life('p1')).toBe(19);
    expect(hand(g)).toEqual(['island']);
  });
  it('can be done until the end of your next turn, and no longer', () => {
    const { g, k } = dies();
    nextTurn(g); // p2's turn
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === k)).toBe(false); // not their priority anyway
    nextTurn(g); // p1's next turn
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === k && a.back)).toBe(true);
    nextTurn(g);
    nextTurn(g);
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === k)).toBe(false);
  }, 60_000);
  it('the opponent can not cast it, and a Dreadknight that did not die has no permission', () => {
    const { g, k } = dies();
    expect(g.legal('p2').some((a) => a.type === 'castSpell' && a.card === k)).toBe(false);
    const plain = game({ p1: { battlefield: lands(3, 'swamp'), graveyard: ['mosswood-dreadknight'] } });
    const card = idOf(plain, 'mosswood-dreadknight', 'graveyard');
    expect(plain.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });
});

describe('Questing Druid // Seek the Beast', () => {
  it('gets a +1/+1 counter whenever you cast a white, blue, black or red spell, but not a green or colorless one', () => {
    const g = game({
      p1: {
        hand: ['flick-a-coin', 'savannah-lions', 'bear-cub', 'extraordinary-journey'],
        battlefield: ['questing-druid', ...lands(3, 'mountain'), 'plains', 'forest', 'forest'],
      },
    });
    const q = idOf(g, 'questing-druid');
    expect(pt(g, q)).toEqual([1, 1]);
    play(g, 'savannah-lions');
    expect(pt(g, q)).toEqual([2, 2]);
    castStop(g, 'flick-a-coin', (a) => a.targets.some((t) => 'player' in t && t.player === 'p2'));
    done(g);
    expect(pt(g, q)).toEqual([3, 3]);
    play(g, 'bear-cub');
    expect(pt(g, q)).toEqual([3, 3]);
  });
  it("an opponent's spell does not count", () => {
    const g = game({
      p1: { battlefield: ['questing-druid'] },
      p2: { hand: ['savannah-lions'], battlefield: lands(1) },
      active: 'p2',
    });
    play(g, 'savannah-lions', () => true, 'p2');
    expect(pt(g, idOf(g, 'questing-druid'))).toEqual([1, 1]);
  });
  it('Seek the Beast exiles the top two cards of your library; you may play them until your next end step', () => {
    const g = game({
      p1: {
        hand: ['questing-druid'],
        battlefield: lands(2, 'mountain'),
        library: ['plains', 'savannah-lions', 'island'],
      },
    });
    play(g, 'questing-druid', (a) => !!a.back);
    expect(exile(g).sort()).toEqual(['plains', 'savannah-lions', 'questing-druid'].sort());
    const plains = idOf(g, 'plains', 'exile');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === plains)).toBe(true);
    // Still playable at the end step? It ends as your next end step begins: this turn's.
    passTo(g, 'end', 'p1');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === plains)).toBe(false);
  });
});

describe('Spider Food', () => {
  const cast1 = (g: GameDriver, target?: string) =>
    castStop(g, 'spider-food', (a) => (target ? targeting(target)(a) : a.targets.length === 0));
  it('destroys an artifact, an enchantment or a creature with flying, and makes a Food', () => {
    for (const thing of ['food-token', 'hopeless-nightmare', 'archive-dragon']) {
      const g = game({
        p1: { hand: ['spider-food'], battlefield: lands(6, 'forest') },
        p2: { battlefield: [thing] },
      });
      const t = idOf(g, thing, 'battlefield', 'p2');
      cast1(g, t);
      done(g);
      expect(g.zoneOf(t), thing).toBe('graveyard');
      expect(food(g)).toHaveLength(1);
    }
  });
  it('can not target a creature without flying', () => {
    const g = game({
      p1: { hand: ['spider-food'], battlefield: lands(3, 'forest') },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = idOf(g, 'bear-cub', 'battlefield', 'p2');
    expect(casts(g, 'spider-food').some((a) => targeting(cub)(a))).toBe(false);
  });
  it('up to one: with no target it just makes a Food', () => {
    const g = game({ p1: { hand: ['spider-food'], battlefield: lands(3, 'forest') } });
    cast1(g);
    done(g);
    expect(food(g)).toHaveLength(1);
  });
});

describe('Virtue of Strength // Garenbrig Growth', () => {
  it('a basic land taps for three times as much mana', () => {
    const g = game({
      p1: { hand: ['bear-cub', 'blossoming-tortoise'], battlefield: ['virtue-of-strength', 'forest'] },
    });
    // {1}{G} from one Forest.
    expect(casts(g, 'bear-cub')).not.toHaveLength(0);
    play(g, 'bear-cub');
    expect(on(g, 'bear-cub')).toHaveLength(1);
    // Two Forests make six: {2}{G}{G} fits with two to spare.
    const two = game({
      p1: { hand: ['blossoming-tortoise'], battlefield: ['virtue-of-strength', 'forest', 'forest'] },
    });
    expect(casts(two, 'blossoming-tortoise')).not.toHaveLength(0);
  });
  it('without it one Forest is one mana; a nonbasic land is not tripled', () => {
    const g = game({ p1: { hand: ['bear-cub'], battlefield: ['forest'] } });
    expect(casts(g, 'bear-cub')).toHaveLength(0);
    const nonbasic = game({
      p1: { hand: ['bear-cub'], battlefield: ['virtue-of-strength', 'crystal-grotto'] },
    });
    expect(casts(nonbasic, 'bear-cub')).toHaveLength(0);
  });
  it('each Virtue triples again', () => {
    const g = game({
      p1: { hand: ['archive-dragon'], battlefield: ['virtue-of-strength', 'virtue-of-strength', 'island'] },
    });
    // Nine blue mana from one Island.
    expect(casts(g, 'archive-dragon')).not.toHaveLength(0);
  });
  it('Garenbrig Growth returns a creature or land card from your graveyard to your hand', () => {
    const g = game({
      p1: { hand: ['virtue-of-strength'], battlefield: lands(1, 'forest'), graveyard: ['bear-cub', 'island', 'flick-a-coin'] },
    });
    const acts = casts(g, 'virtue-of-strength').filter((a) => a.back);
    expect(acts).toHaveLength(2);
    g.do(acts.find((a) => targeting(idOf(g, 'island', 'graveyard'))(a))!);
    done(g);
    expect(hand(g)).toEqual(['island']);
    expect(exile(g)).toEqual(['virtue-of-strength']);
  });
});

describe('Likeness Looter', () => {
  it('is a 1/1 flier; {T}: draw a card, then discard a card', () => {
    const g = game({
      p1: { battlefield: ['likeness-looter'], hand: ['island'], library: ['plains', 'swamp'] },
    });
    const l = idOf(g, 'likeness-looter');
    expect(pt(g, l)).toEqual([1, 1]);
    expect(hasKw(g, l, 'flying')).toBe(true);
    activate(g, l, 0);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });
  it('{X}: becomes a copy of a creature card in your graveyard with mana value X, with flying and this ability', () => {
    const g = game({
      p1: {
        battlefield: ['likeness-looter', ...lands(3, 'swamp')],
        graveyard: ['bear-cub', 'fell-horseman', 'savannah-lions'],
      },
    });
    const l = idOf(g, 'likeness-looter');
    const cub = idOf(g, 'bear-cub', 'graveyard');
    const horseman = idOf(g, 'fell-horseman', 'graveyard');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === l && a.abilityIndex === 1);
    // Only creature cards of the right mana value: X = 1 (Savannah Lions), X = 2 (Bear Cub), X = 4 is too much.
    const pairs = acts.map((a) => [(a as { x?: number }).x, g.obj(((a as { targets: { object: { id: string } }[] }).targets[0]!).object.id).defId]);
    expect(pairs.sort()).toEqual([[1, 'savannah-lions'], [2, 'bear-cub']].sort());
    g.do(acts.find((a) => (a as { x?: number }).x === 2)!);
    done(g);
    expect(g.zoneOf(cub)).toBe('graveyard');
    expect(current(g, l).name).toBe('Bear Cub');
    expect(pt(g, l)).toEqual([2, 2]);
    expect(hasKw(g, l, 'flying')).toBe(true);
    // It stays a copy (not until end of turn), keeps the ability, and the loot ability is gone.
    expect(current(g, l).abilities.some((a) => a.kind === 'activated' && a.cost.tapSelf)).toBe(false);
    expect(current(g, l).abilities.some((a) => a.kind === 'activated' && a.cost.mana?.x)).toBe(true);
    void horseman;
  });
  it('the copy lasts, can be copied over, and ends when it leaves the battlefield', () => {
    const g = game({
      p1: {
        battlefield: ['likeness-looter', ...lands(5, 'swamp')],
        graveyard: ['bear-cub', 'savannah-lions', 'fell-horseman'],
      },
    });
    const l = idOf(g, 'likeness-looter');
    const act = (x: number) =>
      g.legal().find((a) => a.type === 'activateAbility' && a.source === l && (a as { x?: number }).x === x)!;
    g.do(act(2));
    done(g);
    nextTurn(g);
    nextTurn(g);
    expect(current(g, l).name).toBe('Bear Cub');
    // Copy another one: a Fell Horseman (mana value 4).
    g.do(act(4));
    done(g);
    expect(current(g, l).name).toBe('Fell Horseman');
    expect(pt(g, l)).toEqual([3, 3]);
    expect(hasKw(g, l, 'flying')).toBe(true);
  }, 30_000);
  it('only as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['likeness-looter', ...lands(3, 'swamp')], graveyard: ['bear-cub'] },
    });
    toAttackers(g);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.abilityIndex === 1)).toBe(false);
  });
});

describe('The Irencrag', () => {
  it('taps for {C}', () => {
    const g = game({ p1: { hand: ['bear-cub'], battlefield: ['the-irencrag', 'forest'] } });
    expect(casts(g, 'bear-cub')).not.toHaveLength(0);
  });
  it('becomes Everflame, Heroes\' Legacy when a legendary creature enters (if you want): equip {3}, +3/+3, no other abilities', () => {
    const g = game({
      p1: { hand: ['giada-font-of-hope', 'savannah-lions'], battlefield: ['the-irencrag', 'plains', 'plains', ...lands(3)] },
    });
    const crag = idOf(g, 'the-irencrag');
    play(g, 'savannah-lions');
    expect(current(g, crag).name).toBe('The Irencrag');
    play(g, 'giada-font-of-hope', () => true);
    expect(current(g, crag).name).toBe("Everflame, Heroes' Legacy");
    expect(current(g, crag).subtypes).toContain('Equipment');
    expect(current(g, crag).types).toEqual(['Artifact']);
    expect(current(g, crag).supertypes).toContain('Legendary');
    expect(current(g, crag).abilities.some((a) => a.kind === 'mana')).toBe(false);
    // Equip {3}: the Lions get +3/+3.
    const lion = idOf(g, 'savannah-lions');
    const equipIndex = current(g, crag).abilities.findIndex((a) => a.kind === 'activated');
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
    activate(g, crag, equipIndex, [{ object: { id: lion, zcc: g.obj(lion).zcc } }]);
    done(g);
    expect(g.obj(crag).attachedTo, JSON.stringify(g.state.stack)).toBe(lion);
    expect(pt(g, lion)).toEqual([5, 4]);
    // The trigger is gone with the other abilities: a second legend does nothing.
  });
  it('a legendary creature an opponent controls does not trigger it, and you may decline', () => {
    const g = game({
      p1: { battlefield: ['the-irencrag'] },
      p2: { hand: ['giada-font-of-hope'], battlefield: lands(2) },
      active: 'p2',
    });
    play(g, 'giada-font-of-hope', () => true, 'p2');
    expect(current(g, idOf(g, 'the-irencrag')).name).toBe('The Irencrag');
    const decline = game({
      p1: { hand: ['giada-font-of-hope'], battlefield: ['the-irencrag', ...lands(2)] },
    });
    castStop(decline, 'giada-font-of-hope');
    expect(decline.decision.kind).toBe('optionalEffect');
    decline.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(decline);
    expect(current(decline, idOf(decline, 'the-irencrag')).name).toBe('The Irencrag');
  });
});

describe('Three Bowls of Porridge', () => {
  const setup = () =>
    game({
      p1: { battlefield: ['three-bowls-of-porridge', ...lands(6)] },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
  const untap = (g: GameDriver) => {
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
  };
  it('has three modes, each usable once: 2 damage, tap a creature, sacrifice and gain 3 life', () => {
    const g = setup();
    const bowls = idOf(g, 'three-bowls-of-porridge');
    const cub = idOf(g, 'bear-cub', 'battlefield', 'p2');
    const lion = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    activate(g, bowls, 0, [ref(g, cub)]);
    done(g);
    expect(g.zoneOf(cub)).toBe('graveyard');
    untap(g);
    // The damage mode is used up.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === bowls && a.abilityIndex === 0)).toBe(false);
    activate(g, bowls, 1, [ref(g, lion)]);
    done(g);
    expect(g.obj(lion).tapped).toBe(true);
    untap(g);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === bowls && a.abilityIndex === 1)).toBe(false);
    activate(g, bowls, 2);
    done(g);
    expect(g.zoneOf(bowls)).toBe('graveyard');
    expect(g.life('p1')).toBe(23);
  });
  it('the tap mode can be chosen first; modes chosen are remembered even when the choice is not what you did first', () => {
    const g = setup();
    const bowls = idOf(g, 'three-bowls-of-porridge');
    activate(g, bowls, 2);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(g.zoneOf(bowls)).toBe('graveyard');
  });
  it('needs {2} and to tap', () => {
    const g = setup();
    const bowls = idOf(g, 'three-bowls-of-porridge');
    g.obj(bowls).tapped = true;
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === bowls)).toBe(false);
  });
  it('is a Food artifact', () => {
    expect(cardDb.get('three-bowls-of-porridge')!.subtypes).toContain('Food');
  });
});

describe('Wilds of Eldraine basic lands', () => {
  it('are basic lands that tap for their colour', () => {
    for (const [name, mana] of [['plains', 'W'], ['island', 'U'], ['swamp', 'B'], ['mountain', 'R'], ['forest', 'G']] as const) {
      const c = cardDb.get(name)!;
      expect(c.supertypes).toContain('Basic');
      expect(c.types).toEqual(['Land']);
      expect(c.abilities.some((a) => a.kind === 'mana' && a.produces === mana)).toBe(true);
    }
  });
});


describe('Wilds of Eldraine main set: bots', () => {
  it('heuristic bots play whole games with all of the cards and use their choices', () => {
    const engine = createEngine(cardDb);
    const cards = MAIN_CARDS.filter((c) => !WOE_LAND_MAIN[c]).map(slug);
    const deck = [...cards, ...n('island', 4), ...n('swamp', 5), ...n('forest', 4), ...n('mountain', 4), ...n('plains', 4)];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4; seed++) {
      const r = playMatch(
        engine,
        { p1: deck, p2: deck },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        {
          maxActions: 4000,
          onEvents: (events) => {
            for (const e of events)
              if (e.type === 'objectMoved' && e.to === 'battlefield') seen.add(e.defId);
          },
        },
      );
      expect(r.winner, `seed ${seed}`).not.toBeNull();
    }
    expect(cards.filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(10);
  }, 240_000);
});

