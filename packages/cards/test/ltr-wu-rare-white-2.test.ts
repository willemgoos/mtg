import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { done, keywords } from './hob-white-helpers.ts';
import { attack, canUse, ringOf, use } from './ltr-white-helpers.ts';
import {
  chars,
  graveyardOf,
  handOf,
  life,
  objRef,
  pickCard,
  settleStack,
  toStepNow,
  toTurnOf,
} from './ltr-wu-rare-helpers.ts';
import type { Game } from './ltr-white-helpers.ts';

// Lord of the Rings 21d: the white rares, part two (War of the Last Alliance, Forge Anew, Frodo, Gandalf).

describe('War of the Last Alliance', () => {
  const WAR = 'war-of-the-last-alliance';
  it('chapters I and II fetch a legendary creature card, III gives double strike and the Ring tempts you', () => {
    const g = game({
      p1: {
        hand: [WAR],
        battlefield: [...n('plains', 4), 'savannah-lions'],
        library: ['forest', 'boromir-warden-of-the-tower', 'faramir-field-commander', 'forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, WAR);
    settleStack(g);
    expect(g.decision.kind).toBe('searchLibrary');
    // Only legendary creature cards can be found.
    const found = g
      .legal()
      .filter((a) => a.type === 'chooseCard' && a.card)
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(found.sort()).toEqual(['boromir-warden-of-the-tower', 'faramir-field-commander']);
    pickCard(g, 'boromir-warden-of-the-tower');
    done(g);
    expect(handOf(g)).toContain('boromir-warden-of-the-tower');
    // Chapter II next turn: Faramir.
    toTurnOf(g, 'p1', ['faramir-field-commander']);
    expect(handOf(g)).toContain('faramir-field-commander');
    expect(ringOf(g)).toBeUndefined();
    // Chapter III the turn after: double strike until end of turn, the Ring tempts you, and the Saga is sacrificed.
    toTurnOf(g, 'p1');
    expect(g.state.battlefield.some((id) => g.obj(id).defId === WAR)).toBe(false);
    expect(ringOf(g)?.tempted).toBe(1);
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('doubleStrike');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('firstStrike');
  });
  it("finds nothing if there is no legendary creature card in the library", () => {
    const g = game({
      p1: { hand: [WAR], battlefield: n('plains', 4), library: n('forest', 5) },
    });
    cast(g, WAR);
    settleStack(g);
    done(g);
    expect(handOf(g)).toEqual([]);
  });
});

describe('Forge Anew', () => {
  const FORGE = 'forge-anew';
  const equipIndex = 2; // Barrow-Blade: its equip ability
  it('returns an Equipment card from your graveyard to the battlefield when it enters', () => {
    const g = game({
      p1: {
        hand: [FORGE],
        battlefield: n('plains', 3),
        graveyard: ['barrow-blade', 'savannah-lions'],
      },
    });
    cast(g, FORGE);
    done(g);
    expect(g.zoneOf(g.id('p1', 'barrow-blade'))).toBe('battlefield');
    expect(graveyardOf(g)).toEqual(['savannah-lions']);
  });
  it('lets you equip at instant speed during your own turn only', () => {
    const g = game({
      p1: { battlefield: [FORGE, 'barrow-blade', 'savannah-lions', 'plains'] },
      step: 'beginCombat',
    });
    expect(canUse(g, g.id('p1', 'barrow-blade'), equipIndex)).toBe(true);
    // Without Forge Anew it needs sorcery timing.
    const plain = game({
      p1: { battlefield: ['barrow-blade', 'savannah-lions', 'plains'] },
      step: 'beginCombat',
    });
    expect(canUse(plain, plain.id('p1', 'barrow-blade'), equipIndex)).toBe(false);
    // Not during the opponent's turn.
    const theirs = game({
      p1: { battlefield: [FORGE, 'barrow-blade', 'savannah-lions', 'plains'] },
      active: 'p2',
    });
    theirs.pass();
    expect(theirs.actor).toBe('p1');
    expect(canUse(theirs, theirs.id('p1', 'barrow-blade'), equipIndex)).toBe(false);
  });
  it('lets you equip with a spell on the stack', () => {
    const g = game({
      p1: {
        hand: ['giant-growth'],
        battlefield: [FORGE, 'barrow-blade', 'savannah-lions', 'forest', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'giant-growth', [objRef(g, lions)]);
    expect(g.state.stack).toHaveLength(1);
    expect(canUse(g, g.id('p1', 'barrow-blade'), equipIndex)).toBe(true);
    use(g, g.id('p1', 'barrow-blade'), equipIndex, [lions]);
    done(g);
    expect(g.obj(g.id('p1', 'barrow-blade')).attachedTo).toBe(lions);
  });
  it('makes the first equip ability each of your turns cost {0}, and the second its normal cost', () => {
    const g = game({
      p1: { battlefield: [FORGE, 'barrow-blade', 'savannah-lions', 'serra-angel', 'plains'] },
    });
    const blade = g.id('p1', 'barrow-blade');
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    use(g, blade, equipIndex, [lions]);
    done(g);
    expect(g.obj(blade).attachedTo).toBe(lions);
    expect(g.obj(g.id('p1', 'plains')).tapped).toBe(false);
    use(g, blade, equipIndex, [angel]);
    done(g);
    expect(g.obj(blade).attachedTo).toBe(angel);
    expect(g.obj(g.id('p1', 'plains')).tapped).toBe(true);
  });
  it('without Forge Anew equip costs its normal cost', () => {
    const g = game({ p1: { battlefield: ['barrow-blade', 'savannah-lions', 'plains'] } });
    use(g, g.id('p1', 'barrow-blade'), equipIndex, [g.id('p1', 'savannah-lions')]);
    done(g);
    expect(g.obj(g.id('p1', 'plains')).tapped).toBe(true);
  });
});

describe("Frodo, Sauron's Bane", () => {
  const FRODO = 'frodo-saurons-bane';
  const setup = () =>
    game({
      p1: { battlefield: [FRODO, ...n('plains', 2), ...n('swamp', 3)] },
      p2: { battlefield: [] },
    });
  const subs = (g: Game) => chars(g, g.id('p1', FRODO)).subtypes;
  const untapAll = (g: Game) => {
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
  };
  /** Frodo attacks an empty board and combat damage is dealt. */
  const hitWithFrodo = (g: Game) => {
    attack(g, [g.id('p1', FRODO)]);
    toStepNow(g, 'main2');
  };
  it('is a 1/2 Halfling Citizen to begin with', () => {
    const g = setup();
    expect(subs(g)).toEqual(['Halfling', 'Citizen']);
    expect(pt(g, g.id('p1', FRODO))).toEqual([1, 2]);
  });
  it('the second ability does nothing unless Frodo is a Scout', () => {
    const g = setup();
    use(g, g.id('p1', FRODO), 1);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Citizen']);
  });
  it('{W/B}{W/B}: a Citizen becomes a Halfling Scout, 2/3 with lifelink', () => {
    const g = setup();
    const frodo = g.id('p1', FRODO);
    use(g, frodo, 0);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Scout']);
    expect(pt(g, frodo)).toEqual([2, 3]);
    expect(keywords(g, frodo)).toContain('lifelink');
    // Activating again does nothing (not a Citizen any more).
    untapAll(g);
    use(g, frodo, 0);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Scout']);
    expect(pt(g, frodo)).toEqual([2, 3]);
  });
  it('can be paid with white or black mana, in any mix', () => {
    const g = game({ p1: { battlefield: [FRODO, 'plains', 'swamp'] } });
    use(g, g.id('p1', FRODO), 0);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Scout']);
  });
  it('{B}{B}{B}: a Scout becomes a Halfling Rogue and keeps its 2/3 lifelink', () => {
    const g = setup();
    const frodo = g.id('p1', FRODO);
    use(g, frodo, 0);
    done(g);
    untapAll(g);
    use(g, frodo, 1);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Rogue']);
    expect(pt(g, frodo)).toEqual([2, 3]);
    expect(keywords(g, frodo)).toContain('lifelink');
  });
  it('as a Rogue, combat damage to a player tempts you with the Ring (the opponent does not lose yet)', () => {
    const g = setup();
    const frodo = g.id('p1', FRODO);
    use(g, g.id('p1', FRODO), 0);
    done(g);
    untapAll(g);
    use(g, frodo, 1);
    done(g);
    hitWithFrodo(g);
    done(g);
    expect(life(g, 'p2')).toBe(18);
    expect(ringOf(g)?.tempted).toBe(1);
    expect(g.state.players.p2.lost).toBe(false);
  });
  it('as a Rogue, combat damage makes the opponent lose once the Ring has tempted you four or more times', () => {
    const g = setup();
    const frodo = g.id('p1', FRODO);
    use(g, frodo, 0);
    done(g);
    untapAll(g);
    use(g, frodo, 1);
    done(g);
    g.state.players.p1.ring = { tempted: 4 };
    hitWithFrodo(g);
    expect(g.state.players.p2.lost).toBe(true);
    expect(g.decision.kind).toBe('gameOver');
  });
  it('as a Scout, combat damage does nothing special', () => {
    const g = setup();
    use(g, g.id('p1', FRODO), 0);
    done(g);
    hitWithFrodo(g);
    done(g);
    expect(ringOf(g)).toBeUndefined();
    expect(life(g, 'p2')).toBe(18);
  });
  it('is a Citizen again after it leaves the battlefield and returns', () => {
    const g = game({ p1: { battlefield: [FRODO, 'plains', 'plains'] }, p2: { battlefield: [] } });
    const frodo = g.id('p1', FRODO);
    use(g, frodo, 0);
    done(g);
    expect(subs(g)).toEqual(['Halfling', 'Scout']);
    // Blink it by hand: it is a new object.
    g.state.battlefield = g.state.battlefield.filter((id) => id !== frodo);
    g.state.players.p1.hand.push(frodo);
    g.obj(frodo).zone = 'hand';
    g.obj(frodo).zcc++;
    g.state.players.p1.hand = g.state.players.p1.hand.filter((id) => id !== frodo);
    g.state.battlefield.push(frodo);
    g.obj(frodo).zone = 'battlefield';
    g.obj(frodo).zcc++;
    delete g.obj(frodo).creatureTypes;
    expect(subs(g)).toEqual(['Halfling', 'Citizen']);
    expect(pt(g, frodo)).toEqual([1, 2]);
  });
});

