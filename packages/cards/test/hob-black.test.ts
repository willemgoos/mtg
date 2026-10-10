import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { HOB_BLACK, HOB_BLACK_BACKS } from '../src/hob/black.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  choose,
  done,
  game,
  gy,
  hand,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the black cards (first half; the rest is in hob-black-2.test.ts).

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/hob-groups.json', import.meta.url), 'utf8'),
);
const BLACK_CARDS = Object.entries(groups)
  .filter(([, g]) => g === 'black')
  .map(([name]) => name);

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'hob-goblin-army-token';
const armies = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => board(g, ARMY, p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
/** Casts the first way of casting this card from hand with these targets, and lets it resolve. */
function play(
  g: GameDriver,
  defId: string,
  pick: (a: Cast) => boolean = () => true,
  p: 'p1' | 'p2' = 'p1',
): GameDriver {
  const a = casts(g, defId, p).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return done(g);
}
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
const pickTarget = (id: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);

describe('The Hobbit black: registry', () => {
  it('has behaviour for all 27 cards, and each exists in the pool', () => {
    expect(BLACK_CARDS).toHaveLength(27);
    for (const name of BLACK_CARDS) {
      expect(HOB_BLACK[name], name).toBeDefined();
      expect(cardDb.has(slug(name)), name).toBe(true);
    }
    expect(Object.keys(HOB_BLACK)).toHaveLength(27);
    for (const name of Object.keys(HOB_BLACK_BACKS))
      expect(cardDb.has(slug(name)), name).toBe(true);
  });

  it('the Adventure sides are black spells; keywords come from the text', () => {
    expect(cardDb.get('meager-meal')!.colors).toEqual(['B']);
    expect(cardDb.get('clap-snap')!.colors).toEqual(['B']);
    expect(cardDb.get('gollum-silent-slinker')!.keywords).toContain('menace');
    expect(cardDb.get('dreaded-bat-cloud')!.keywords).toEqual(
      expect.arrayContaining(['flying', 'deathtouch']),
    );
    expect(cardDb.get('head-of-the-hunt')!.keywords).toContain('flash');
  });
});

describe('Along the Crooked Way', () => {
  it('returns a creature card from your graveyard, which amasses Goblins 1; Goblins and Orcs gain menace', () => {
    const g = game({
      p1: {
        hand: ['along-the-crooked-way'],
        graveyard: ['savannah-lions', 'shock'],
        battlefield: [...n('swamp', 5), 'front-porch-sentries', 'llanowar-elves'],
      },
    });
    play(g, 'along-the-crooked-way');
    expect(hand(g)).toContain('savannah-lions');
    expect(gy(g)).not.toContain('savannah-lions');
    // The creature card left the graveyard: amass Goblins 1.
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
    // {1}{B}: Goblins and Orcs you control gain menace.
    const crooked = g.id('p1', 'along-the-crooked-way');
    const acts = abilityActions(g, crooked, 2);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(kw(g, g.id('p1', 'front-porch-sentries')).has('menace')).toBe(true);
    expect(kw(g, armies(g)[0]!).has('menace')).toBe(true);
    expect(kw(g, g.id('p1', 'llanowar-elves')).has('menace')).toBe(false);
  });

  it('a noncreature card leaving the graveyard does not amass; each creature card does', () => {
    const g = game({
      p1: {
        hand: ['along-the-crooked-way', 'gathering-of-darkness'],
        graveyard: ['savannah-lions', 'llanowar-elves'],
        battlefield: [...n('swamp', 9)],
      },
    });
    g.do(casts(g, 'along-the-crooked-way')[0]!);
    done(g, { target: pickTarget(g.id('p1', 'savannah-lions', 'graveyard')) });
    expect(plus(g, armies(g)[0]!)).toBe(1);
    // Gathering of Darkness returns another creature card (+1) and amasses 3 itself.
    g.do(
      casts(g, 'gathering-of-darkness').find(targeting(g.id('p1', 'llanowar-elves', 'graveyard')))!,
    );
    done(g);
    expect(plus(g, armies(g)[0]!)).toBe(1 + 1 + 3);
  });
});

describe("Azog, Moria's Ruin", () => {
  const azogTarget = (g: GameDriver, id: string) => {
    g.do(casts(g, 'azog-morias-ruin')[0]!);
    done(g, { target: pickTarget(id) });
  };

  it("destroys an opponent's creature; its controller amasses Goblins X (its power); you draw nothing", () => {
    const g = game({
      p1: { hand: ['azog-morias-ruin'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const handBefore = hand(g).length;
    azogTarget(g, g.id('p2', 'rumbling-baloth'));
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(armies(g, 'p2')).toHaveLength(1);
    expect(plus(g, armies(g, 'p2')[0]!)).toBe(4);
    expect(armies(g, 'p1')).toHaveLength(0);
    expect(hand(g).length).toBe(handBefore - 1);
  });

  it('if you controlled the creature, you amass and draw a card', () => {
    const g = game({
      p1: { hand: ['azog-morias-ruin'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });
    azogTarget(g, g.id('p1', 'savannah-lions'));
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(plus(g, armies(g)[0]!)).toBe(2);
    expect(hand(g)).toHaveLength(1);
  });

  it('a token destroyed with Azog still gives its power and controller (the token is gone)', () => {
    const g = game({
      p1: { hand: ['azog-morias-ruin'], battlefield: n('swamp', 3) },
      p2: { battlefield: [ARMY] },
    });
    const army = g.id('p2', ARMY);
    g.state.objects[army]!.isToken = true;
    g.state.objects[army]!.plusOneCounters = 3;
    azogTarget(g, army);
    expect(g.zoneOf(army)).toBe('gone');
    // The destroyed Army was p2's only one; p2 gets a new Army with 3 counters.
    expect(armies(g, 'p2')).toHaveLength(1);
    expect(plus(g, armies(g, 'p2')[0]!)).toBe(3);
  });

  it('with no target chosen, nothing is destroyed and nobody amasses', () => {
    const g = game({
      p1: { hand: ['azog-morias-ruin'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.do(casts(g, 'azog-morias-ruin')[0]!);
    done(g, {
      target: (a) => a.targets.length === 0,
    });
    expect(board(g, 'savannah-lions', 'p2')).toHaveLength(1);
    expect(armies(g, 'p1')).toHaveLength(0);
    expect(armies(g, 'p2')).toHaveLength(0);
  });
});

describe("Bilbo's Deadly Slice, Stir Up Trouble, Crude Bent Blade", () => {
  it("Bilbo's Deadly Slice destroys target creature", () => {
    const g = game({
      p1: { hand: ['bilbos-deadly-slice'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p2', 'rumbling-baloth')));
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
  });

  it('Stir Up Trouble costs {B} and a sacrificed artifact or creature, or {4} more', () => {
    const g = game({
      p1: { hand: ['stir-up-trouble'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const all = casts(g, 'stir-up-trouble').filter(targeting(baloth));
    // One way sacrifices the Lions, the other pays {4}.
    expect(all.some((a) => a.sacrifice !== undefined)).toBe(true);
    expect(all.some((a) => a.sacrifice === undefined)).toBe(true);
    const paying = all.find((a) => a.sacrifice === undefined)!;
    g.do(paying);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(5);
  });

  it('Stir Up Trouble can sacrifice a creature instead of paying {4}', () => {
    const g = game({
      p1: { hand: ['stir-up-trouble'], battlefield: [...n('swamp', 1), 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const a = casts(g, 'stir-up-trouble').find(
      (x) => targeting(baloth)(x) && x.sacrifice === g.id('p1', 'savannah-lions'),
    );
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(gy(g, 'p1')).toContain('savannah-lions');
  });

  it('Crude Bent Blade: the opponent sacrifices a creature; equipped creature gets +2/+1', () => {
    const g = game({
      p1: { hand: ['crude-bent-blade'], battlefield: [...n('swamp', 6), 'savannah-lions'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    play(g, 'crude-bent-blade');
    expect(gy(g, 'p2')).toEqual(['llanowar-elves']);
    const blade = g.id('p1', 'crude-bent-blade');
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([2, 1]);
    const eq = abilityActions(g, blade, 2).find(
      (a) =>
        a.type === 'activateAbility' &&
        a.targets.some((t) => 'object' in t && t.object.id === lions),
    );
    expect(eq).toBeDefined();
    g.do(eq!);
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
  });
});

describe('Desolation Prowler, Front Porch Sentries, Stony-Voiced Goblins', () => {
  it('Desolation Prowler: pay 2 life for +2/+2, once each turn', () => {
    const g = game({ p1: { battlefield: ['desolation-prowler'] } });
    const id = g.id('p1', 'desolation-prowler');
    expect(pt(g, id)).toEqual([2, 2]);
    const acts = abilityActions(g, id, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(pt(g, id)).toEqual([4, 4]);
    expect(g.life('p1')).toBe(18);
    expect(abilityActions(g, id, 0)).toHaveLength(0);
  });

  it('Front Porch Sentries: when it dies, target creature an opponent controls gets -1/-1', () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice'],
        battlefield: [...n('swamp', 3), 'front-porch-sentries'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'front-porch-sentries')));
    // 2/1 Lions got -1/-1 until end of turn: now 1/0, so it died.
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });

  it('Stony-Voiced Goblins: each opponent discards a card', () => {
    const g = game({
      p1: { hand: ['stony-voiced-goblins'], battlefield: n('swamp', 2) },
      p2: { hand: ['shock', 'plains'] },
    });
    play(g, 'stony-voiced-goblins');
    done(g, { option: 0 });
    expect(g.state.players.p2.hand).toHaveLength(1);
    expect(gy(g, 'p2')).toHaveLength(1);
  });
});

/** Passes until p1's next precombat main phase (a new turn), resolving what comes up. */
function nextMain(g: GameDriver): void {
  const turn = g.state.turn.number;
  for (let i = 0; i < 400; i++) {
    const t = g.state.turn;
    if (
      t.number > turn &&
      t.activePlayer === 'p1' &&
      t.step === 'main1' &&
      g.decision.kind === 'priority' &&
      !g.state.stack.length
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error('never reached the next main phase');
}

describe('Down, Down to Goblin-town', () => {
  it('I discards a nonland card of your choice; II amasses; III and IV drain 1; then it is sacrificed', () => {
    const g = game({
      p1: {
        hand: ['down-down-to-goblin-town'],
        battlefield: n('swamp', 3),
        library: n('swamp', 20),
      },
      p2: { hand: ['shock', 'plains'], library: n('forest', 20) },
    });
    play(g, 'down-down-to-goblin-town');
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock']);
    expect(g.state.players.p2.hand).toHaveLength(1);
    const saga = g.id('p1', 'down-down-to-goblin-town');
    expect(g.obj(saga).counters?.lore).toBe(1);
    nextMain(g);
    done(g);
    expect(g.obj(saga).counters?.lore).toBe(2);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
    nextMain(g);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    nextMain(g);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    done(g);
    expect(g.zoneOf(saga)).toBe('graveyard');
  });
});

describe('Dreaded Bat-Cloud', () => {
  it('costs {3} less when a creature died this turn', () => {
    const noDeath = game({
      p1: { hand: ['dreaded-bat-cloud'], battlefield: n('swamp', 2) },
    });
    expect(casts(noDeath, 'dreaded-bat-cloud')).toHaveLength(0);
    const g = game({
      p1: {
        hand: ['dreaded-bat-cloud', 'bilbos-deadly-slice'],
        battlefield: [...n('swamp', 5)],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    expect(casts(g, 'dreaded-bat-cloud')).toHaveLength(1); // five lands pay {4}{B}
    play(g, 'bilbos-deadly-slice', targeting(g.id('p2', 'llanowar-elves'))); // 3 mana: two lands left
    const cheap = casts(g, 'dreaded-bat-cloud');
    expect(cheap).toHaveLength(1);
    g.do(cheap[0]!);
    done(g);
    expect(board(g, 'dreaded-bat-cloud', 'p1')).toHaveLength(1);
  });
});

void choose;
void stop;
void activate;
void targetingPlayer;
