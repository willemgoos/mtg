import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { done, exile, gy, hand, keywords, library } from './ecl-blue-helpers.ts';
import { activateFirst, counters, tgt } from './hob-blue-helpers.ts';

// The Hobbit 20b: the blue cards (equipment, enchantments, spells, Gandalf, Bilbo, Elrond).

describe("Wizard's Staff", () => {
  it('equipped creature has prowess that triggers twice', () => {
    const g = game({
      p1: {
        battlefield: ['wizards-staff', 'savannah-lions', ...n('island', 6)],
        hand: ['quick-study'],
      },
    });
    const staff = g.id('p1', 'wizards-staff');
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([2, 1]);
    activateFirst(g, staff, { index: 2 });
    done(g);
    expect(g.obj(staff).attachedTo).toBe(lions);
    cast(g, 'quick-study');
    done(g);
    // Prowess twice: +2/+2 until end of turn.
    expect(pt(g, lions)).toEqual([4, 3]);
  });

  it('Equip Wizard {1} only equips Wizards; the other Equip is {3}', () => {
    const g = game({
      p1: {
        battlefield: [
          'wizards-staff',
          'savannah-lions',
          'gandalf-wandering-wizard',
          ...n('island', 3),
        ],
      },
    });
    const staff = g.id('p1', 'wizards-staff');
    const lions = g.id('p1', 'savannah-lions');
    const gandalf = g.id('p1', 'gandalf-wandering-wizard');
    const equips = g.legal().filter((a) => a.type === 'activateAbility' && a.source === staff);
    // Equip Wizard targets Gandalf only; Equip {3} can target either.
    const wizardOnly = equips.filter((a) => a.type === 'activateAbility' && a.abilityIndex === 1);
    expect(wizardOnly).toHaveLength(1);
    expect(
      wizardOnly.every(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets[0] &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === gandalf,
      ),
    ).toBe(true);
    activateFirst(g, staff, { index: 1 });
    done(g);
    expect(g.obj(staff).attachedTo).toBe(gandalf);
    // Only {2} left (cost {1} was paid): the {3} equip is out of reach.
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === staff && a.abilityIndex === 2),
    ).toBe(false);
    void lions;
  });

  it('the abilities go away when the Staff is no longer attached', () => {
    const g = game({
      p1: {
        battlefield: ['wizards-staff', 'savannah-lions', ...n('island', 6)],
        hand: ['quick-study'],
      },
    });
    const staff = g.id('p1', 'wizards-staff');
    activateFirst(g, staff, { index: 2 });
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(staff).attachedTo = undefined;
    cast(g, 'quick-study');
    done(g);
    expect(pt(g, lions)).toEqual([2, 1]);
  });
});

describe('Uncover the Moon-Letters', () => {
  const setup = () =>
    game({
      p1: {
        battlefield: ['uncover-the-moon-letters', ...n('island', 4)],
        hand: ['quick-study', 'forest', 'forest', 'forest'],
        library: n('island', 10),
      },
    });

  it('casting a noncreature spell: draw X (the mana spent), then discard two', () => {
    const g = setup();
    cast(g, 'quick-study');
    done(g, { accept: true });
    // Hand: 3 forests + 3 drawn (X = 3) - 2 discarded; quick-study drew 2 more.
    expect(hand(g).length).toBe(3 + 3 - 2 + 2);
    expect(gy(g).length).toBe(2 + 1);
  });

  it('may decline: nothing is drawn or discarded', () => {
    const g = setup();
    cast(g, 'quick-study');
    done(g, { accept: false });
    expect(hand(g).length).toBe(3 + 2);
    expect(gy(g).length).toBe(1);
  });

  it('a creature spell does not trigger it', () => {
    const g = game({
      p1: {
        battlefield: ['uncover-the-moon-letters', ...n('plains', 1)],
        hand: ['savannah-lions'],
      },
    });
    cast(g, 'savannah-lions');
    done(g, { accept: true });
    expect(hand(g)).toEqual([]);
  });
});

describe('Gandalf, Wandering Wizard', () => {
  it('has ward {3}', () => {
    const g = game({ p1: { battlefield: ['gandalf-wandering-wizard'] } });
    expect(g.state.battlefield.length).toBeGreaterThan(0);
    expect(keywords(g, g.id('p1', 'gandalf-wandering-wizard')).has('ward')).toBe(true);
  });

  it('{6}: its owner shuffles it into their library and draws three', () => {
    const g = game({
      p1: { battlefield: ['gandalf-wandering-wizard', ...n('island', 6)], library: n('forest', 8) },
    });
    const gandalf = g.id('p1', 'gandalf-wandering-wizard');
    activateFirst(g, gandalf);
    done(g);
    expect(g.state.battlefield.includes(gandalf)).toBe(false);
    expect(hand(g)).toEqual(['forest', 'forest', 'forest']);
    expect(library(g)).toHaveLength(8 - 3 + 1);
    expect(library(g)).toContain('gandalf-wandering-wizard');
  });

  it('when an opponent controls it, the owner (not the controller) draws', () => {
    const g = game({
      p1: { battlefield: [...n('island', 0)], library: n('forest', 8) },
      p2: { battlefield: ['gandalf-wandering-wizard', ...n('island', 6)], library: n('island', 8) },
      active: 'p2',
    });
    const gandalf = g.id('p2', 'gandalf-wandering-wizard');
    // Put it under p1's control to be sure ownership and control differ.
    g.obj(gandalf).owner = 'p1';
    activateFirst(g, gandalf);
    done(g);
    expect(hand(g, 'p1')).toEqual(['forest', 'forest', 'forest']);
    expect(hand(g, 'p2')).toEqual([]);
    expect(library(g, 'p1')).toContain('gandalf-wandering-wizard');
  });
});

describe('Riddles in the Dark', () => {
  it('looks at the top four, splits them into two piles; the opponent picks one for your hand, the other to the graveyard', () => {
    const g = game({
      p1: {
        battlefield: n('island', 3),
        hand: ['riddles-in-the-dark'],
        library: ['shock', 'forest', 'island', 'savannah-lions', 'plains', 'plains'],
      },
    });
    cast(g, 'riddles-in-the-dark');
    done(g);
    expect(g.decision.kind).toBe('splitPiles');
    // Face up: shock + forest; face down: island + lions.
    const lib = g.state.players.p1.library;
    g.do({ type: 'splitPiles', player: 'p1', faceUp: [lib[0]!, lib[1]!] });
    expect(g.decision.kind).toBe('choosePile');
    expect((g.decision as { player?: string }).player).toBe('p2');
    g.do({ type: 'choosePile', player: 'p2', pile: 'faceUp' });
    expect(hand(g).sort()).toEqual(['forest', 'shock']);
    expect(gy(g).sort()).toEqual(['island', 'riddles-in-the-dark', 'savannah-lions']);
  });
});

describe('Most Decrepit Old Bird and Speak Secrets', () => {
  it('Old Bird is 2/2 with threshold', () => {
    const g = game({ p1: { battlefield: ['most-decrepit-old-bird'], graveyard: n('forest', 6) } });
    const bird = g.id('p1', 'most-decrepit-old-bird');
    expect(pt(g, bird)).toEqual([1, 1]);
    const h = game({ p1: { battlefield: ['most-decrepit-old-bird'], graveyard: n('forest', 7) } });
    expect(pt(h, h.id('p1', 'most-decrepit-old-bird'))).toEqual([2, 2]);
  });

  it('Speak Secrets: mill four, then put an instant or sorcery card from among them into your hand', () => {
    const g = game({
      p1: {
        battlefield: n('island', 2),
        hand: ['most-decrepit-old-bird'],
        library: ['forest', 'shock', 'savannah-lions', 'forest', 'plains'],
      },
    });
    cast(g, 'most-decrepit-old-bird', [], { back: true });
    done(g);
    expect(gy(g)).toContain('forest');
    expect(hand(g)).toEqual(['shock']);
    expect(exile(g)).toEqual(['most-decrepit-old-bird']);
  });

  it('Speak Secrets with no instant or sorcery among them just mills', () => {
    const g = game({
      p1: {
        battlefield: n('island', 2),
        hand: ['most-decrepit-old-bird'],
        library: n('forest', 6),
      },
    });
    cast(g, 'most-decrepit-old-bird', [], { back: true });
    done(g);
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toHaveLength(4);
  });

  it('the creature can be cast from exile afterwards', () => {
    const g = game({
      p1: {
        battlefield: n('island', 3),
        hand: ['most-decrepit-old-bird'],
        library: n('forest', 6),
      },
    });
    cast(g, 'most-decrepit-old-bird', [], { back: true });
    done(g);
    const bird = g.id('p1', 'most-decrepit-old-bird', 'exile');
    g.do({ type: 'castSpell', player: 'p1', card: bird, targets: [] });
    done(g);
    expect(g.state.battlefield).toContain(bird);
  });
});

void counters;
void tgt;
