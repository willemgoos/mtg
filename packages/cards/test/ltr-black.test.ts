import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { LTR_BLACK, LTR_BLACK_BACKS } from '../src/ltr/black.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  done,
  game,
  gy,
  hand,
  n,
  passTo,
  pt,
} from './ecl-special-helpers.ts';

// The Lord of the Rings 21b: the black cards (first half; the rest is in ltr-black-2.test.ts).

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/ltr-groups.json', import.meta.url), 'utf8'),
);
const BLACK_CARDS = Object.entries(groups)
  .filter(([, g]) => g === 'black')
  .map(([name]) => name);

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'ltr-orc-army-token';
const armies = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => board(g, ARMY, p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
/** Casts the first way of casting this card from hand that `pick` accepts, and lets it resolve. */
function play(g: GameDriver, defId: string, pick: (a: Cast) => boolean = () => true): GameDriver {
  const a = casts(g, defId).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return done(g);
}
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
/** Attacks p2 with these creatures, then plays through combat to the second main phase. */
function combat(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}

describe('The Lord of the Rings black: registry', () => {
  it('has behaviour for all 25 cards, and each exists in the pool', () => {
    expect(BLACK_CARDS).toHaveLength(25);
    for (const name of BLACK_CARDS) {
      expect(LTR_BLACK[name], name).toBeDefined();
      expect(cardDb.has(slug(name)), name).toBe(true);
    }
    expect(Object.keys(LTR_BLACK)).toHaveLength(25);
    for (const name of Object.keys(LTR_BLACK_BACKS))
      expect(cardDb.has(slug(name)), name).toBe(true);
  });

  it('keywords come from the text, and the Ballistic Boulder token exists', () => {
    expect(cardDb.get('nazg-l')!.keywords).toContain('deathtouch');
    expect(cardDb.get('warg-rider')!.keywords).toContain('menace');
    expect(cardDb.get('dunland-crebain')!.keywords).toContain('flying');
    expect(cardDb.get('mordor-trebuchet')!.keywords).toContain('defender');
    expect(cardDb.get('grond-the-gatebreaker')!.keywords).toContain('trample');
    const boulder = cardDb.get('ltr-ballistic-boulder-token')!;
    expect(boulder.keywords).toContain('flying');
    expect(boulder.types).toEqual(['Artifact', 'Creature']);
    expect(boulder.subtypes).toEqual(['Construct']);
  });
});

describe('Gríma Wormtongue', () => {
  const sacrificeFor = (g: GameDriver, grima: string, fodder: string) =>
    abilityActions(g, grima, 1).find(
      (a) =>
        a.type === 'activateAbility' &&
        a.sacrifice === fodder &&
        a.targets.some((t) => 'player' in t && t.player === 'p2'),
    )!;

  it("your opponents can't gain life; you can", () => {
    const g = game({
      p1: { battlefield: ['food-token', ...n('swamp', 2)] },
      p2: { battlefield: ['gr-ma-wormtongue'] },
    });
    const foodId = g.id('p1', 'food-token');
    g.do(abilityActions(g, foodId, 0)[0]!);
    done(g);
    expect(g.life('p1')).toBe(20);
    const mine = game({
      p1: { battlefield: ['food-token', 'gr-ma-wormtongue', ...n('swamp', 2)] },
    });
    mine.do(abilityActions(mine, mine.id('p1', 'food-token'), 0)[0]!);
    done(mine);
    expect(mine.life('p1')).toBe(23);
  });

  it('{T}, sacrifice another creature: target player loses 1; no Army for a nonlegendary creature', () => {
    const g = game({ p1: { battlefield: ['gr-ma-wormtongue', 'savannah-lions'] } });
    const grima = g.id('p1', 'gr-ma-wormtongue');
    const lions = g.id('p1', 'savannah-lions');
    // Gríma itself cannot be the sacrifice ("another").
    expect(
      abilityActions(g, grima, 1).some((a) => a.type === 'activateAbility' && a.sacrifice === grima),
    ).toBe(false);
    g.do(sacrificeFor(g, grima, lions));
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(g.obj(grima).tapped).toBe(true);
    expect(armies(g)).toHaveLength(0);
  });

  it('a legendary sacrifice also amasses Orcs 2', () => {
    const g = game({
      p1: { battlefield: ['gr-ma-wormtongue', 'gothmog-morgul-lieutenant'] },
    });
    const grima = g.id('p1', 'gr-ma-wormtongue');
    g.do(sacrificeFor(g, grima, g.id('p1', 'gothmog-morgul-lieutenant')));
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(2);
    expect(chars(g, armies(g)[0]!).subtypes).toEqual(expect.arrayContaining(['Orc', 'Army']));
  });

  it('can target yourself', () => {
    const g = game({ p1: { battlefield: ['gr-ma-wormtongue', 'savannah-lions'] } });
    const grima = g.id('p1', 'gr-ma-wormtongue');
    const a = abilityActions(g, grima, 1).find(
      (x) =>
        x.type === 'activateAbility' &&
        x.sacrifice === g.id('p1', 'savannah-lions') &&
        x.targets.some((t) => 'player' in t && t.player === 'p1'),
    )!;
    g.do(a);
    done(g);
    expect(g.life('p1')).toBe(19);
  });
});

describe("Sam's Desperate Rescue", () => {
  it('returns a creature card from your graveyard to your hand; the Ring tempts you', () => {
    const g = game({
      p1: {
        hand: ['sams-desperate-rescue'],
        graveyard: ['savannah-lions', 'shock'],
        battlefield: ['swamp', 'llanowar-elves'],
      },
    });
    play(g, 'sams-desperate-rescue', targeting(g.id('p1', 'savannah-lions', 'graveyard')));
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(ringLevel(g)).toBe(1);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'llanowar-elves'));
  });

  it('only creature cards are targets', () => {
    const g = game({
      p1: { hand: ['sams-desperate-rescue'], graveyard: ['shock'], battlefield: ['swamp'] },
    });
    expect(casts(g, 'sams-desperate-rescue')).toHaveLength(0);
  });
});

describe('Voracious Fell Beast', () => {
  it('each opponent sacrifices a creature of their choice; a Food for each creature sacrificed', () => {
    const g = game({
      p1: { hand: ['voracious-fell-beast'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
    play(g, 'voracious-fell-beast');
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    expect(board(g, 'savannah-lions', 'p2').length + board(g, 'llanowar-elves', 'p2').length).toBe(1);
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
    expect(kw(g, g.id('p1', 'voracious-fell-beast')).has('flying')).toBe(true);
  });

  it('no Food when the opponent has no creature to sacrifice', () => {
    const g = game({
      p1: { hand: ['voracious-fell-beast'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['swamp'] },
    });
    play(g, 'voracious-fell-beast');
    expect(board(g, 'food-token', 'p1')).toHaveLength(0);
  });
});

describe('Gorbag of Minas Morgul', () => {
  const setup = () =>
    game({
      p1: { battlefield: ['gorbag-of-minas-morgul', 'savannah-lions'] },
      p2: { life: 20 },
    });

  it('may sacrifice the Orc that dealt combat damage; when you do, draw a card', () => {
    const g = setup();
    const gorbag = g.id('p1', 'gorbag-of-minas-morgul');
    combat(g, [gorbag]);
    passTo(g, 'main2', 'p1', { accept: true, target: (a) => a.mode === 0 });
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(gorbag)).toBe('graveyard');
    expect(hand(g)).toHaveLength(1);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });

  it('or create a Treasure token', () => {
    const g = setup();
    const gorbag = g.id('p1', 'gorbag-of-minas-morgul');
    combat(g, [gorbag]);
    passTo(g, 'main2', 'p1', { accept: true, target: (a) => a.mode === 1 });
    expect(g.zoneOf(gorbag)).toBe('graveyard');
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
    expect(hand(g)).toHaveLength(0);
  });

  it('declining keeps the creature and gives nothing', () => {
    const g = setup();
    const gorbag = g.id('p1', 'gorbag-of-minas-morgul');
    combat(g, [gorbag]);
    passTo(g, 'main2', 'p1', { accept: false });
    expect(g.zoneOf(gorbag)).toBe('battlefield');
    expect(hand(g)).toHaveLength(0);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });

  it('a Goblin or Orc of yours triggers it, another creature does not', () => {
    const g = game({ p1: { battlefield: ['gorbag-of-minas-morgul', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    combat(g, [lions]);
    passTo(g, 'main2', 'p1', { accept: true });
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(lions)).toBe('battlefield');
    // An Army (an Orc) does.
    const h = game({ p1: { battlefield: ['gorbag-of-minas-morgul', ARMY] } });
    const army = h.id('p1', ARMY);
    h.state.objects[army]!.plusOneCounters = 2;
    combat(h, [army]);
    passTo(h, 'main2', 'p1', { accept: true, target: (a) => a.mode === 0 });
    expect(['graveyard', 'gone']).toContain(h.zoneOf(army));
    expect(hand(h)).toHaveLength(1);
  });
});

describe('Claim the Precious', () => {
  it('destroys target creature; the Ring tempts you', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), 'llanowar-elves'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    play(g, 'claim-the-precious', targeting(g.id('p2', 'rumbling-baloth')));
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(ringLevel(g)).toBe(1);
  });
});

describe('Nazgûl', () => {
  it('enters: the Ring tempts you, which puts a +1/+1 counter on each Wraith you control', () => {
    const g = game({
      p1: { hand: ['nazg-l'], battlefield: [...n('swamp', 3), 'ringwraiths'] },
      p2: { battlefield: ['nazg-l'] },
    });
    const other = g.id('p1', 'ringwraiths');
    play(g, 'nazg-l');
    const nazgul = g.id('p1', 'nazg-l');
    expect(ringLevel(g)).toBe(1);
    expect(plus(g, nazgul)).toBe(1);
    expect(plus(g, other)).toBe(1);
    expect(plus(g, g.id('p2', 'nazg-l'))).toBe(0);
    expect(pt(g, nazgul)).toEqual([2, 3]);
    expect(kw(g, nazgul).has('deathtouch')).toBe(true);
  });

  it('every later temptation adds another counter; a non-Wraith gets none', () => {
    const g = game({
      p1: {
        hand: ['claim-the-precious'],
        battlefield: [...n('swamp', 3), 'nazg-l', 'savannah-lions'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    play(g, 'claim-the-precious', targeting(g.id('p2', 'llanowar-elves')));
    expect(plus(g, g.id('p1', 'nazg-l'))).toBe(1);
    expect(plus(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });
});

describe('Mirkwood Bats', () => {
  it('whenever you create a token, each opponent loses 1 life', () => {
    const g = game({
      p1: { hand: ['shelobs-ambush'], battlefield: ['mirkwood-bats', 'savannah-lions', 'swamp'] },
    });
    play(g, 'shelobs-ambush', targeting(g.id('p1', 'savannah-lions')));
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
    expect(g.life('p2')).toBe(19);
  });

  it('whenever you sacrifice a token, each opponent loses 1 life; a nontoken does not', () => {
    const g = game({
      p1: { battlefield: ['mirkwood-bats', 'food-token', 'gr-ma-wormtongue', 'savannah-lions', ...n('swamp', 2)] },
    });
    g.do(abilityActions(g, g.id('p1', 'food-token'), 0)[0]!);
    done(g);
    expect(g.life('p2')).toBe(19);
    // Sacrificing a creature (not a token) does nothing more.
    const grima = g.id('p1', 'gr-ma-wormtongue');
    g.do(
      abilityActions(g, grima, 1).find(
        (a) =>
          a.type === 'activateAbility' &&
          a.sacrifice === g.id('p1', 'savannah-lions') &&
          a.targets.some((t) => 'player' in t && t.player === 'p1'),
      )!,
    );
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(19 + 3);
  });

  it("an opponent's tokens do not count", () => {
    const g = game({
      p1: { battlefield: ['mirkwood-bats'] },
      p2: { hand: ['shelobs-ambush'], battlefield: ['savannah-lions', 'swamp'] },
      active: 'p2',
    });
    g.do(casts(g, 'shelobs-ambush', 'p2')[0]!);
    done(g);
    expect(board(g, 'food-token', 'p2')).toHaveLength(1);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Warg Rider', () => {
  it('other Orcs and Goblins you control have menace; nothing else does', () => {
    const g = game({
      p1: { battlefield: ['warg-rider', 'uruk-hai-berserker', 'savannah-lions', ARMY] },
      p2: { battlefield: ['gothmog-morgul-lieutenant', 'uruk-hai-berserker'] },
    });
    expect(kw(g, g.id('p1', 'uruk-hai-berserker')).has('menace')).toBe(true);
    expect(kw(g, g.id('p1', ARMY)).has('menace')).toBe(true);
    expect(kw(g, g.id('p1', 'savannah-lions')).has('menace')).toBe(false);
    expect(kw(g, g.id('p2', 'uruk-hai-berserker')).has('menace')).toBe(false);
    expect(kw(g, g.id('p1', 'warg-rider')).has('menace')).toBe(true);
  });

  it('at the beginning of combat on your turn, amass Orcs 2 (and the Army gains menace)', () => {
    const g = game({ p1: { battlefield: ['warg-rider'] } });
    passTo(g, 'beginCombat', 'p1');
    done(g);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(2);
    expect(kw(g, armies(g)[0]!).has('menace')).toBe(true);
  });

  it('does not amass on the opponent turn', () => {
    const g = game({ p1: { battlefield: ['warg-rider'] }, active: 'p2' });
    passTo(g, 'beginCombat', 'p2');
    done(g);
    expect(armies(g)).toHaveLength(0);
  });
});

describe("Gollum's Bite", () => {
  it('gives target creature -2/-2 until end of turn', () => {
    const g = game({
      p1: { hand: ['gollums-bite'], battlefield: ['swamp'] },
      p2: { battlefield: ['savannah-lions', 'rumbling-baloth'] },
    });
    play(g, 'gollums-bite', targeting(g.id('p2', 'savannah-lions')));
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    const h = game({
      p1: { hand: ['gollums-bite'], battlefield: ['swamp'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = h.id('p2', 'rumbling-baloth');
    const before = pt(h, baloth);
    play(h, 'gollums-bite', targeting(baloth));
    expect(pt(h, baloth)).toEqual([before[0]! - 2, before[1]! - 2]);
  });

  it('{3}{B}, exile it from your graveyard: the Ring tempts you; sorcery speed only', () => {
    const g = game({
      p1: { graveyard: ['gollums-bite'], battlefield: [...n('swamp', 4), 'llanowar-elves'] },
    });
    const bite = g.id('p1', 'gollums-bite', 'graveyard');
    const acts = abilityActions(g, bite, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(g.zoneOf(bite)).toBe('exile');
    expect(ringLevel(g)).toBe(1);
    // Not at instant speed: on the opponent's turn it cannot be activated.
    const h = game({
      p1: { graveyard: ['gollums-bite'], battlefield: n('swamp', 4) },
      step: 'beginCombat',
    });
    expect(abilityActions(h, h.id('p1', 'gollums-bite', 'graveyard'), 0)).toHaveLength(0);
  });

  it('cannot be activated without the mana', () => {
    const g = game({ p1: { graveyard: ['gollums-bite'], battlefield: n('swamp', 3) } });
    expect(abilityActions(g, g.id('p1', 'gollums-bite', 'graveyard'), 0)).toHaveLength(0);
  });
});

describe("Shelob's Ambush", () => {
  it('+1/+2 and deathtouch until end of turn, and a Food token', () => {
    const g = game({
      p1: { hand: ['shelobs-ambush'], battlefield: ['swamp', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const before = pt(g, lions);
    play(g, 'shelobs-ambush', targeting(lions));
    expect(pt(g, lions)).toEqual([before[0]! + 1, before[1]! + 2]);
    expect(kw(g, lions).has('deathtouch')).toBe(true);
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
  });
});

describe('Ringwraiths', () => {
  it('ETB: -3/-3 on a creature an opponent controls; no life loss for a nonlegendary one', () => {
    const g = game({
      p1: { hand: ['ringwraiths'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const before = pt(g, baloth);
    play(g, 'ringwraiths');
    expect(pt(g, baloth)).toEqual([before[0]! - 3, before[1]! - 3]);
    expect(g.life('p2')).toBe(20);
    expect(pt(g, g.id('p1', 'ringwraiths'))).toEqual([5, 5]);
  });

  it('a legendary creature that gets -3/-3 also costs its controller 3 life', () => {
    const g = game({
      p1: { hand: ['ringwraiths'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['gothmog-morgul-lieutenant'] },
    });
    play(g, 'ringwraiths');
    expect(gy(g, 'p2')).toEqual(['gothmog-morgul-lieutenant']);
    expect(g.life('p2')).toBe(17);
  });

  it('when the Ring tempts you, returns from the graveyard to your hand', () => {
    const g = game({
      p1: {
        hand: ['claim-the-precious'],
        graveyard: ['ringwraiths'],
        battlefield: [...n('swamp', 3), 'llanowar-elves'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    play(g, 'claim-the-precious', targeting(g.id('p2', 'savannah-lions')));
    expect(hand(g)).toEqual(['ringwraiths']);
    expect(gy(g)).toEqual(['claim-the-precious']);
  });

  it('stays in the graveyard when the Ring tempts an opponent', () => {
    const g = game({
      p1: { graveyard: ['ringwraiths'] },
      p2: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), 'llanowar-elves'] },
      active: 'p2',
    });
    g.do(casts(g, 'claim-the-precious', 'p2')[0]!);
    done(g);
    expect(gy(g, 'p1')).toEqual(['ringwraiths']);
  });
});

describe('Mordor Trebuchet', () => {
  it('attacking with an Orc makes a tapped and attacking Ballistic Boulder, sacrificed at end of combat', () => {
    const g = game({ p1: { battlefield: ['mordor-trebuchet', 'uruk-hai-berserker'] } });
    const orc = g.id('p1', 'uruk-hai-berserker');
    combat(g, [orc]);
    done(g);
    const boulders = board(g, 'ltr-ballistic-boulder-token', 'p1');
    expect(boulders).toHaveLength(1);
    const b = boulders[0]!;
    expect(g.obj(b).tapped).toBe(true);
    expect(g.state.combat?.attackers.some((a) => a.id === b)).toBe(true);
    expect(pt(g, b)).toEqual([2, 1]);
    expect(kw(g, b).has('flying')).toBe(true);
    expect(chars(g, b).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    passTo(g, 'main2', 'p1');
    // 3 from the Orc, 2 from the Boulder.
    expect(g.life('p2')).toBe(15);
    expect(board(g, 'ltr-ballistic-boulder-token', 'p1')).toHaveLength(0);
  });

  it('one token for the whole attack, however many Goblins and Orcs attack', () => {
    const g = game({
      p1: { battlefield: ['mordor-trebuchet', 'uruk-hai-berserker', ARMY] },
    });
    g.state.objects[g.id('p1', ARMY)]!.plusOneCounters = 1;
    combat(g, [g.id('p1', 'uruk-hai-berserker'), g.id('p1', ARMY)]);
    done(g);
    expect(board(g, 'ltr-ballistic-boulder-token', 'p1')).toHaveLength(1);
  });

  it('no token when no Goblin or Orc attacks', () => {
    const g = game({ p1: { battlefield: ['mordor-trebuchet', 'savannah-lions'] } });
    combat(g, [g.id('p1', 'savannah-lions')]);
    done(g);
    expect(board(g, 'ltr-ballistic-boulder-token', 'p1')).toHaveLength(0);
  });

  it('has defender', () => {
    const g = game({ p1: { battlefield: ['mordor-trebuchet'] } });
    passTo(g, 'declareAttackers', 'p1');
    expect(
      g.legal().some((a) => a.type === 'addAttacker' && a.attacker === g.id('p1', 'mordor-trebuchet')),
    ).toBe(false);
  });
});

describe('Mordor Muster', () => {
  it('draws a card, loses 1 life, and amasses Orcs 1', () => {
    const g = game({ p1: { hand: ['mordor-muster'], battlefield: n('swamp', 2) } });
    play(g, 'mordor-muster');
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
    expect(pt(g, armies(g)[0]!)).toEqual([1, 1]);
  });

  it('adds to the Army you already have', () => {
    const g = game({ p1: { hand: ['mordor-muster'], battlefield: [...n('swamp', 2), ARMY] } });
    g.state.objects[g.id('p1', ARMY)]!.plusOneCounters = 3;
    play(g, 'mordor-muster');
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(4);
  });
});

describe('Gollum, Patient Plotter', () => {
  it('when it leaves the battlefield, the Ring tempts you', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), 'gollum-patient-plotter'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    // Destroy your own Gollum: it leaves, the Ring tempts you (Claim itself tempts as well).
    play(g, 'claim-the-precious', targeting(g.id('p1', 'gollum-patient-plotter')));
    expect(gy(g)).toContain('gollum-patient-plotter');
    expect(ringLevel(g)).toBe(2);
  });

  it('{B}, sacrifice a creature: return it from the graveyard to your hand, at sorcery speed', () => {
    const g = game({
      p1: { graveyard: ['gollum-patient-plotter'], battlefield: ['swamp', 'savannah-lions'] },
    });
    const gollum = g.id('p1', 'gollum-patient-plotter', 'graveyard');
    const acts = abilityActions(g, gollum, 1);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(hand(g)).toEqual(['gollum-patient-plotter']);
    expect(gy(g)).toEqual(['savannah-lions']);
    // Sorcery speed: not on the opponent's turn.
    const h = game({
      p1: { graveyard: ['gollum-patient-plotter'], battlefield: ['swamp', 'savannah-lions'] },
      step: 'beginCombat',
    });
    expect(abilityActions(h, h.id('p1', 'gollum-patient-plotter', 'graveyard'), 1)).toHaveLength(0);
  });

  it('needs a creature to sacrifice', () => {
    const g = game({ p1: { graveyard: ['gollum-patient-plotter'], battlefield: ['swamp'] } });
    expect(abilityActions(g, g.id('p1', 'gollum-patient-plotter', 'graveyard'), 1)).toHaveLength(0);
  });
});

void activate;
