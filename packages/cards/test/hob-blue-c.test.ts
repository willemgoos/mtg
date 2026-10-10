import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  chars,
  done,
  exile,
  gy,
  hand,
  keywords,
  library,
  nextTurn,
  onStack,
  targeting,
  toStep,
} from './ecl-blue-helpers.ts';
import { activate } from './ecl-blue-helpers.ts';
import { passStack, tgt } from './hob-blue-helpers.ts';

// The Hobbit 20b: the blue cards (Sagas, Bilbo, Aura, draw matters).

const SOLDIER = 'hob-human-soldier-token';
const soldiers = (g: ReturnType<typeof game>, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === SOLDIER && g.obj(id).controller === p);
/** Answers the recruit discard with this card (a legal discard action for it). */
const discardCard = (g: ReturnType<typeof game>, defId: string) => {
  const a = g.legal().find((x) => x.type === 'discard' && g.obj(x.card).defId === defId);
  if (!a) throw new Error(`no discard of ${defId}: ${JSON.stringify(g.legal()).slice(0, 200)}`);
  g.do(a);
};

describe("Old Fat Spider Can't See Me", () => {
  it('I: target creature you control gains hexproof as long as the Saga remains', () => {
    const g = game({
      p1: {
        battlefield: ['savannah-lions', ...n('island', 3)],
        hand: ['old-fat-spider-cant-see-me'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'old-fat-spider-cant-see-me');
    done(g, { pick: targeting(lions) });
    expect(keywords(g, lions).has('hexproof')).toBe(true);
    // The Saga leaves: the hexproof ends.
    const saga = g.id('p1', 'old-fat-spider-cant-see-me');
    g.state.effects = g.state.effects.filter((e) => e.whileSourceId !== saga);
    expect(keywords(g, lions).has('hexproof')).toBe(false);
  });

  it('II: prevents all damage dealt by up to one target creature while the Saga remains', () => {
    const g = game({
      p1: { battlefield: ['old-fat-spider-cant-see-me'], life: 20 },
      p2: { battlefield: ['serra-angel'] },
    });
    const saga = g.id('p1', 'old-fat-spider-cant-see-me');
    g.obj(saga).counters = { lore: 1 };
    const angel = g.id('p2', 'serra-angel');
    // Go to p1's next precombat main phase: chapter II triggers; target the Angel.
    for (let i = 0; i < 80 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    done(g, { pick: targeting(angel) });
    expect(g.state.effects.some((e) => e.preventDamageDealt)).toBe(true);
    // p2's turn: the Angel attacks, but its damage is prevented.
    nextTurn(g);
    expect(g.state.turn.activePlayer).toBe('p2');
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(angel);
    toStep(g, 'endCombat');
    expect(g.life('p1')).toBe(20);
  });

  it('II: the target is optional', () => {
    const g = game({ p1: { battlefield: ['old-fat-spider-cant-see-me'] } });
    const saga = g.id('p1', 'old-fat-spider-cant-see-me');
    g.obj(saga).counters = { lore: 1 };
    nextTurn(g);
    nextTurn(g);
    expect(g.state.effects.some((e) => e.preventDamageDealt)).toBe(false);
  });

  it('III and IV: draw a card, then it is sacrificed', () => {
    const g = game({
      p1: { battlefield: ['old-fat-spider-cant-see-me'], library: n('forest', 20) },
    });
    const saga = g.id('p1', 'old-fat-spider-cant-see-me');
    g.obj(saga).counters = { lore: 2 };
    nextTurn(g);
    nextTurn(g);
    done(g); // chapter III resolves: the draw step and the chapter
    expect(hand(g)).toEqual(['forest', 'forest']);
    nextTurn(g);
    nextTurn(g);
    done(g);
    // Chapter IV draws too, and the Saga is sacrificed after it.
    expect(hand(g).length).toBe(4);
    expect(g.state.battlefield.includes(saga)).toBe(false);
  });
});

describe('Bilbo Baggins, Burglar and Take a Glance', () => {
  it('enters: draw a card', () => {
    const g = game({
      p1: { battlefield: n('island', 3), hand: ['bilbo-baggins-burglar'], library: n('forest', 5) },
    });
    cast(g, 'bilbo-baggins-burglar');
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Take a Glance: scry 2, then the creature can be cast from exile', () => {
    const g = game({
      p1: { battlefield: n('island', 4), hand: ['bilbo-baggins-burglar'], library: n('forest', 5) },
    });
    cast(g, 'bilbo-baggins-burglar', [], { back: true });
    done(g);
    expect(exile(g)).toEqual(['bilbo-baggins-burglar']);
    const card = g.id('p1', 'bilbo-baggins-burglar', 'exile');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    done(g);
    expect(g.state.battlefield).toContain(card);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Fateful Discovery', () => {
  it('whenever an artifact you control enters, draw a card', () => {
    const g = game({
      p1: {
        battlefield: ['fateful-discovery', ...n('island', 4)],
        hand: ['wizards-staff', 'savannah-lions'],
        library: n('forest', 5),
      },
    });
    cast(g, 'wizards-staff');
    done(g);
    expect(hand(g)).toEqual(['savannah-lions', 'forest']);
  });

  it('a creature or land does not draw', () => {
    const g = game({
      p1: {
        battlefield: ['fateful-discovery', ...n('plains', 1)],
        hand: ['savannah-lions'],
        library: n('forest', 5),
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(hand(g)).toEqual([]);
  });

  it("an opponent's artifact does not draw", () => {
    const g = game({
      p1: { battlefield: ['fateful-discovery'], library: n('forest', 5) },
      p2: { battlefield: n('island', 2), hand: ['wizards-staff'] },
      active: 'p2',
    });
    cast(g, 'wizards-staff');
    done(g);
    expect(hand(g)).toEqual([]);
  });
});

describe("Bilbo, Luckwearer and Burglar's Plot", () => {
  it("can't be blocked; combat damage to a player: draw a card, then discard a card", () => {
    const g = game({
      p1: { battlefield: ['bilbo-luckwearer'], hand: ['shock'], library: n('forest', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const bilbo = g.id('p1', 'bilbo-luckwearer');
    expect(chars(g, bilbo).cantBeBlocked).toBe(true);
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(bilbo);
    toStep(g, 'endCombat');
    expect(g.life('p2')).toBe(19);
    // Drew a Forest and discarded a card (the first legal one).
    expect(hand(g).length).toBe(1);
    expect(gy(g).length).toBe(1);
  });

  it("Burglar's Plot: exchange control of two target nonland permanents that share a card type", () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', ...n('island', 5)], hand: ['bilbo-luckwearer'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'bilbo-luckwearer', [tgt(g, lions), tgt(g, angel)], { back: true });
    done(g);
    expect(g.obj(lions).controller).toBe('p2');
    expect(g.obj(angel).controller).toBe('p1');
    // They have summoning sickness under their new controllers.
    expect(g.obj(angel).summoningSick).toBe(true);
  });

  it("Burglar's Plot: only pairs that share a card type are offered", () => {
    const g = game({
      p1: {
        battlefield: ['savannah-lions', 'wizards-staff', ...n('island', 5)],
        hand: ['bilbo-luckwearer'],
      },
      p2: { battlefield: ['serra-angel', 'fateful-discovery'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const staff = g.id('p1', 'wizards-staff');
    const angel = g.id('p2', 'serra-angel');
    const discovery = g.id('p2', 'fateful-discovery');
    const pairs = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.back)
      .map((a) =>
        a.type === 'castSpell'
          ? a.targets
              .map((t) => ('object' in t ? t.object.id : ''))
              .sort()
              .join()
          : '',
      );
    expect(pairs).toContain([lions, angel].sort().join());
    expect(pairs).not.toContain([lions, staff].sort().join());
    expect(pairs).not.toContain([staff, discovery].sort().join());
    expect(pairs).not.toContain([lions, discovery].sort().join());
    expect(pairs).not.toContain([angel, discovery].sort().join());
  });

  it("Burglar's Plot: two permanents under the same control change nothing", () => {
    const g = game({
      p1: {
        battlefield: ['savannah-lions', 'serra-angel', ...n('island', 5)],
        hand: ['bilbo-luckwearer'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'bilbo-luckwearer', [tgt(g, lions), tgt(g, angel)], { back: true });
    done(g);
    expect(g.obj(lions).controller).toBe('p1');
    expect(g.obj(angel).controller).toBe('p1');
  });
});

describe('The Lord of the Eagles', () => {
  it('costs {X} less, X the total power of creatures you control with flying', () => {
    const g = game({
      p1: { battlefield: ['serra-angel', ...n('island', 5)], hand: ['the-lord-of-the-eagles'] },
    });
    // {7}{U}{U} minus 4 (Serra Angel's power): {3}{U}{U}.
    cast(g, 'the-lord-of-the-eagles');
    done(g);
    expect(g.state.battlefield).toContain(g.id('p1', 'the-lord-of-the-eagles'));
    const k = keywords(g, g.id('p1', 'the-lord-of-the-eagles'));
    expect(k.has('flash')).toBe(true);
    expect(k.has('flying')).toBe(true);
  });

  it('is not castable for five mana without flyers', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', ...n('island', 5)], hand: ['the-lord-of-the-eagles'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe("Elvenking's Harper", () => {
  it('{4}{U}: target creature cannot be blocked this turn', () => {
    const g = game({
      p1: { battlefield: ['elvenkings-harper', 'savannah-lions', ...n('island', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(chars(g, lions).cantBeBlocked).toBe(false);
    activate(g, g.id('p1', 'elvenkings-harper'), 0, [tgt(g, lions)]);
    done(g);
    expect(chars(g, lions).cantBeBlocked).toBe(true);
  });
});

describe('Confusticate and Bebother', () => {
  it('mode 2: draw two cards, then discard a card', () => {
    const g = game({
      p1: {
        battlefield: n('island', 3),
        hand: ['confusticate-and-bebother'],
        library: n('forest', 5),
      },
    });
    cast(g, 'confusticate-and-bebother', [], { mode: 1 });
    done(g);
    expect(hand(g).length).toBe(1);
    expect(gy(g).length).toBe(2);
  });

  it('mode 1: counter target spell unless its controller pays {4}', () => {
    const g = game({
      p1: { battlefield: n('island', 3), hand: ['quick-study'] },
      p2: { battlefield: n('island', 3), hand: ['confusticate-and-bebother'] },
    });
    cast(g, 'quick-study');
    const spell = g.id('p1', 'quick-study', 'stack');
    g.pass();
    cast(g, 'confusticate-and-bebother', [onStack(g, spell)], { mode: 0 });
    done(g);
    // p1 couldn't pay {4}: Quick Study is countered.
    expect(gy(g)).toEqual(['quick-study']);
    expect(hand(g)).toEqual([]);
  });
});

describe('Roll-Roll-Roll-Roll', () => {
  it('I: exile up to one target creature or land you control, return it at the beginning of the next end step', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', ...n('island', 3)], hand: ['roll-roll-roll-roll'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    cast(g, 'roll-roll-roll-roll');
    done(g, { pick: targeting(lions) });
    expect(exile(g)).toEqual(['savannah-lions']);
    toStep(g, 'end');
    expect(exile(g)).toEqual([]);
    const back = g.state.battlefield.find((id) => g.obj(id).defId === 'savannah-lions')!;
    expect(back).toBeDefined();
    expect(pt(g, back)).toEqual([2, 1]);
  });

  it('works with a land', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'island', tapped: true }, ...n('island', 3)],
        hand: ['roll-roll-roll-roll'],
      },
    });
    const tapped = g.state.battlefield.find((id) => g.obj(id).tapped)!;
    cast(g, 'roll-roll-roll-roll');
    done(g, { pick: targeting(tapped) });
    expect(exile(g)).toEqual(['island']);
    toStep(g, 'end');
    expect(exile(g)).toEqual([]);
  });
});

describe('Lakeshore Apothecary and Ravenhill Flock', () => {
  it('Apothecary gets a +1/+1 counter when you draw your second card each turn', () => {
    const g = game({
      p1: {
        battlefield: ['lakeshore-apothecary', ...n('island', 3)],
        hand: ['quick-study'],
        library: n('forest', 5),
      },
    });
    const a = g.id('p1', 'lakeshore-apothecary');
    cast(g, 'quick-study');
    done(g);
    expect(g.obj(a).plusOneCounters).toBe(1);
    expect(pt(g, a)).toEqual([2, 3]);
  });

  it('Apothecary: a single draw is not enough', () => {
    const g = game({
      p1: {
        battlefield: ['lakeshore-apothecary', ...n('island', 4)],
        hand: ['bilbo-baggins-burglar'],
        library: n('forest', 5),
      },
    });
    cast(g, 'bilbo-baggins-burglar');
    done(g);
    expect(g.obj(g.id('p1', 'lakeshore-apothecary')).plusOneCounters).toBe(0);
  });

  it('Flock gets a +1/+1 counter whenever you draw a card', () => {
    const g = game({
      p1: {
        battlefield: ['ravenhill-flock', ...n('island', 3)],
        hand: ['quick-study'],
        library: n('forest', 5),
      },
    });
    const f = g.id('p1', 'ravenhill-flock');
    cast(g, 'quick-study');
    done(g);
    expect(g.obj(f).plusOneCounters).toBe(2);
    expect(keywords(g, f).has('flying')).toBe(true);
  });
});

describe("Enchanted River's Grasp", () => {
  const setup = () =>
    game({
      p1: { battlefield: n('island', 3), hand: ['enchanted-rivers-grasp'] },
      p2: { battlefield: ['serra-angel'] },
    });

  it('taps the creature, removes all counters, and it loses all abilities', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 2;
    g.obj(angel).counters = { stun: 1, shield: 1 };
    cast(g, 'enchanted-rivers-grasp', [tgt(g, angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).plusOneCounters).toBe(0);
    expect(Object.values(g.obj(angel).counters ?? {}).every((c) => c === 0)).toBe(true);
    const k = keywords(g, angel);
    expect(k.has('flying')).toBe(false);
    expect(k.has('vigilance')).toBe(false);
  });

  it("doesn't untap during its controller's untap step", () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'enchanted-rivers-grasp', [tgt(g, angel)]);
    done(g);
    nextTurn(g);
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(angel).tapped).toBe(true);
  });
});

describe('Mirkwood Meditator', () => {
  const setup = () => game({ p1: { battlefield: ['mirkwood-meditator'], hand: ['forest'] } });
  const land = (g: ReturnType<typeof game>) =>
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });

  it('landfall: may have its base power and toughness become 4/2 until end of turn', () => {
    const g = setup();
    const m = g.id('p1', 'mirkwood-meditator');
    expect(pt(g, m)).toEqual([2, 4]);
    land(g);
    done(g, { accept: true });
    expect(pt(g, m)).toEqual([4, 2]);
  });

  it('may decline', () => {
    const g = setup();
    const m = g.id('p1', 'mirkwood-meditator');
    land(g);
    done(g, { accept: false });
    expect(pt(g, m)).toEqual([2, 4]);
  });

  it('keeps counters on top of the new base', () => {
    const g = setup();
    const m = g.id('p1', 'mirkwood-meditator');
    g.obj(m).plusOneCounters = 1;
    land(g);
    done(g, { accept: true });
    expect(pt(g, m)).toEqual([5, 3]);
  });
});

describe("Master's Councillors", () => {
  it('+2/+0 for each graveyard with seven or more cards in it', () => {
    const base = game({ p1: { battlefield: ['masters-councillors'] } });
    expect(pt(base, base.id('p1', 'masters-councillors'))).toEqual([1, 3]);
    const one = game({ p1: { battlefield: ['masters-councillors'], graveyard: n('forest', 7) } });
    expect(pt(one, one.id('p1', 'masters-councillors'))).toEqual([3, 3]);
    const both = game({
      p1: { battlefield: ['masters-councillors'], graveyard: n('forest', 7) },
      p2: { graveyard: n('forest', 8) },
    });
    expect(pt(both, both.id('p1', 'masters-councillors'))).toEqual([5, 3]);
    const six = game({ p1: { battlefield: ['masters-councillors'], graveyard: n('forest', 6) } });
    expect(pt(six, six.id('p1', 'masters-councillors'))).toEqual([1, 3]);
  });

  it('whenever you draw your second card each turn, target player mills three cards', () => {
    const g = game({
      p1: {
        battlefield: ['masters-councillors', ...n('island', 3)],
        hand: ['quick-study'],
        library: n('forest', 8),
      },
      p2: { library: n('island', 8) },
    });
    cast(g, 'quick-study');
    done(g, { pick: targeting('p2') as never });
    const milled = gy(g, 'p1').length - 1 + gy(g, 'p2').length;
    expect(milled).toBe(3);
  });
});

describe('Plunder the Trollshaws', () => {
  it('draws a card from hand; cast with flashback it draws two instead', () => {
    const g = game({
      p1: {
        battlefield: n('island', 6),
        hand: ['plunder-the-trollshaws'],
        library: n('forest', 8),
      },
    });
    cast(g, 'plunder-the-trollshaws');
    done(g);
    expect(hand(g)).toEqual(['forest']);
    const card = g.id('p1', 'plunder-the-trollshaws', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest', 'forest']);
    expect(exile(g)).toEqual(['plunder-the-trollshaws']);
  });
});

describe('Great Gilded Boat', () => {
  it('crew 2 makes it a 4/4 artifact creature', () => {
    const g = game({ p1: { battlefield: ['great-gilded-boat', 'savannah-lions'] } });
    const boat = g.id('p1', 'great-gilded-boat');
    expect(chars(g, boat).types).not.toContain('Creature');
    activate(g, boat, 1, []);
    done(g);
    expect(chars(g, boat).types).toContain('Creature');
    expect(pt(g, boat)).toEqual([4, 4]);
  });

  it('whenever you attack, recruit: a nonland discard makes a 1/1 Human Soldier', () => {
    const g = game({
      p1: {
        battlefield: ['great-gilded-boat', 'savannah-lions'],
        hand: ['shock'],
        library: n('forest', 5),
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(lions);
    passStack(g);
    expect((g.decision as { kind: string }).kind).toBe('discard');
    discardCard(g, 'shock');
    done(g);
    expect(soldiers(g)).toHaveLength(1);
    expect(gy(g)).toEqual(['shock']);
  });

  it('recruit with a land discard makes no token', () => {
    const g = game({
      p1: {
        battlefield: ['great-gilded-boat', 'savannah-lions'],
        hand: [],
        library: n('forest', 5),
      },
    });
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(g.id('p1', 'savannah-lions'));
    done(g);
    expect(soldiers(g)).toHaveLength(0);
    expect(gy(g)).toEqual(['forest']);
  });
});

describe('Elven Raft-Steerer', () => {
  const setup = () =>
    game({
      p1: {
        battlefield: [
          { card: 'elven-raft-steerer', sick: false },
          { card: 'savannah-lions', tapped: true },
        ],
        hand: ['forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
  const land = (g: ReturnType<typeof game>) =>
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });

  it('landfall: tap target creature an opponent controls', () => {
    const g = setup();
    land(g);
    done(g, { option: /Tap target/ });
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
  });

  it('landfall: untap target creature you control', () => {
    const g = setup();
    land(g);
    done(g, { option: /Untap target/, pick: targeting(g.id('p1', 'savannah-lions')) });
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(false);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
  });
});

describe('Long Lake Nuisance', () => {
  it('enters: recruit', () => {
    const g = game({
      p1: {
        battlefield: n('island', 4),
        hand: ['long-lake-nuisance', 'shock'],
        library: n('forest', 5),
      },
    });
    cast(g, 'long-lake-nuisance');
    passStack(g);
    expect((g.decision as { kind: string }).kind).toBe('discard');
    discardCard(g, 'shock');
    done(g);
    expect(soldiers(g)).toHaveLength(1);
  });
});

describe('Sound the Trumpets', () => {
  const setup = (spell: string) =>
    game({
      p1: { battlefield: n('mountain', 3), hand: [spell] },
      p2: {
        battlefield: n('island', 3),
        hand: ['sound-the-trumpets', 'savannah-lions'],
        library: n('forest', 5),
      },
    });

  it('counters the spell; mana value 2 or less: recruit', () => {
    const g = setup('shock');
    cast(g, 'shock', [{ player: 'p2' }]);
    const shock = g.id('p1', 'shock', 'stack');
    g.pass();
    cast(g, 'sound-the-trumpets', [onStack(g, shock)]);
    passStack(g);
    expect((g.decision as { kind: string }).kind).toBe('discard');
    discardCard(g, 'savannah-lions');
    done(g);
    expect(gy(g, 'p1')).toEqual(['shock']);
    expect(g.life('p2')).toBe(20);
    expect(soldiers(g, 'p2')).toHaveLength(1);
  });

  it('a spell with mana value 3 or more is countered without recruiting', () => {
    const g = game({
      p1: { battlefield: n('island', 3), hand: ['quick-study'] },
      p2: { battlefield: n('island', 3), hand: ['sound-the-trumpets'], library: n('forest', 5) },
    });
    cast(g, 'quick-study');
    const spell = g.id('p1', 'quick-study', 'stack');
    g.pass();
    cast(g, 'sound-the-trumpets', [onStack(g, spell)]);
    done(g);
    expect(gy(g, 'p1')).toEqual(['quick-study']);
    expect(hand(g, 'p2')).toEqual([]);
    expect(soldiers(g, 'p2')).toHaveLength(0);
  });
});

describe('Uneasy Partings', () => {
  it("target creature's owner puts it on their choice of the top or bottom of their library", () => {
    const g = game({
      p1: { battlefield: n('island', 4), hand: ['uneasy-partings'] },
      p2: { battlefield: ['serra-angel'], library: n('forest', 3) },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'uneasy-partings', [tgt(g, angel)]);
    done(g, { option: /Bottom/ });
    expect(library(g, 'p2')).toEqual(['forest', 'forest', 'forest', 'serra-angel']);
    const h = game({
      p1: { battlefield: n('island', 4), hand: ['uneasy-partings'] },
      p2: { battlefield: ['serra-angel'], library: n('forest', 3) },
    });
    cast(h, 'uneasy-partings', [tgt(h, h.id('p2', 'serra-angel'))]);
    done(h, { option: /Top/ });
    expect(library(h, 'p2')[0]).toBe('serra-angel');
  });

  it('costs {1} less if it targets an attacking nontoken creature', () => {
    const g = game({
      p1: { battlefield: n('island', 3), hand: ['uneasy-partings'] },
      p2: { battlefield: ['serra-angel'], library: n('forest', 3) },
      active: 'p2',
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).summoningSick = false;
    // Not attacking: {3}{U} is out of reach with three lands.
    expect(g.legal('p1').some((a) => a.type === 'castSpell')).toBe(false);
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(angel);
    for (let i = 0; i < 5 && g.decision.player !== 'p1'; i++) g.pass();
    expect(g.legal('p1').some((a) => a.type === 'castSpell')).toBe(true);
  });
});

describe("Thranduil's Decree", () => {
  it('counters a permanent spell, exiles it, and lets you cast it for free while it stays exiled', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['thranduils-decree'] },
      p2: { battlefield: n('plains', 5), hand: ['serra-angel'], library: n('plains', 5) },
      active: 'p2',
    });
    cast(g, 'serra-angel');
    const angel = g.id('p2', 'serra-angel', 'stack');
    g.pass();
    cast(g, 'thranduils-decree', [onStack(g, angel)]);
    done(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g, 'p2')).toEqual([]);
    // On p1's turn the Angel can be cast without paying its mana cost.
    nextTurn(g);
    expect(g.state.turn.activePlayer).toBe('p1');
    const card = g.id('p2', 'serra-angel', 'exile');
    const free = g.legal('p1').find((a) => a.type === 'castSpell' && a.card === card);
    expect(free).toBeDefined();
    g.do(free!);
    done(g);
    expect(g.obj(card).controller).toBe('p1');
    expect(g.state.battlefield).toContain(card);
  });

  it('an instant or sorcery is countered into the graveyard as usual', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['thranduils-decree'] },
      p2: { battlefield: n('mountain', 1), hand: ['shock'] },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    const shock = g.id('p2', 'shock', 'stack');
    g.pass();
    cast(g, 'thranduils-decree', [onStack(g, shock)]);
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock']);
    expect(exile(g, 'p2')).toEqual([]);
    expect(g.life('p1')).toBe(20);
  });
});
