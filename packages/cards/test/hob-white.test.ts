import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { HOB_WHITE, HOB_WHITE_BACKS, HOB_WHITE_TOKENS } from '../src/hob/white.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { activate, done, keywords, names, obj, on, toStep } from './hob-white-helpers.ts';

// The Hobbit 20b: the white cards (creatures and the recruit / Storied cards).

describe('the white group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(HOB_WHITE)).toHaveLength(28);
    expect(Object.keys(HOB_WHITE_BACKS)).toHaveLength(3);
    for (const name of Object.keys(HOB_WHITE)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
    for (const t of HOB_WHITE_TOKENS) expect(cardDb.get(t.id), t.id).toBeDefined();
  });
});

describe('recruit cards', () => {
  it('Lake-town Lookout recruits when it dies: a nonland discard makes a Human Soldier', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['lake-town-lookout'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    cast(g, 'lightning-strike', [obj(g, g.id('p1', 'lake-town-lookout'))]);
    done(g, { card: 'giant-growth' });
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
    expect(names(g, 'p1', 'graveyard')).toContain('giant-growth');
  });
  it('Esgaroth Garrison recruits as it enters and is as big as your creature count', () => {
    const g = game({
      p1: { hand: ['esgaroth-garrison', 'giant-growth'], battlefield: n('plains', 5) },
    });
    cast(g, 'esgaroth-garrison');
    done(g, { card: 'giant-growth' });
    const garrison = g.id('p1', 'esgaroth-garrison');
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
    expect(pt(g, garrison)).toEqual([2, 5]);
  });
  it('Celebrate the Mountain-king exiles a permanent until it leaves and recruits', () => {
    const g = game({
      p1: { hand: ['celebrate-the-mountain-king', 'giant-growth'], battlefield: n('plains', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'celebrate-the-mountain-king');
    done(g, { card: 'giant-growth' });
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
  });
  it("The Queen of Dale recruits on the opponent's first noncreature spell each turn only", () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['the-queen-of-dale'] },
      p2: {
        hand: ['giant-growth', 'giant-growth'],
        battlefield: [...n('forest', 4), 'savannah-lions'],
      },
      active: 'p2',
    });
    cast(g, 'giant-growth', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g, { card: 'giant-growth' });
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
    cast(g, 'giant-growth', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g, { card: 'giant-growth' });
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
  });
});

describe('Dwarves and Storied', () => {
  it('Fíli the Pathfinder makes a Dwarf for itself and each nontoken Dwarf, and pumps with an enduring story', () => {
    const g = game({
      p1: {
        hand: ['f-li-the-pathfinder', 'iron-hills-blacksmith'],
        battlefield: [...n('plains', 6), 'hob-axe-token', 'hob-axe-token', 'savannah-lions'],
      },
    });
    cast(g, 'f-li-the-pathfinder');
    done(g);
    expect(on(g, 'hob-dwarf-token', 'p1')).toHaveLength(1);
    // Fíli plus two Axes: an enduring story, so creatures get +1/+1.
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    cast(g, 'iron-hills-blacksmith');
    done(g);
    expect(on(g, 'hob-dwarf-token', 'p1')).toHaveLength(2);
    expect(on(g, 'hob-axe-token', 'p1')).toHaveLength(3);
  });
  it('Ori, Keeper of Songs is a 4/3 with vigilance only with an enduring story', () => {
    const g = game({
      p1: { battlefield: ['ori-keeper-of-songs', 'hob-axe-token', 'hob-axe-token'] },
    });
    const ori = g.id('p1', 'ori-keeper-of-songs');
    expect(pt(g, ori)).toEqual([4, 3]);
    expect(keywords(g, ori)).toContain('vigilance');
    const h = game({ p1: { battlefield: ['ori-keeper-of-songs', 'hob-axe-token'] } });
    expect(pt(h, h.id('p1', 'ori-keeper-of-songs'))).toEqual([3, 3]);
    expect(keywords(h, h.id('p1', 'ori-keeper-of-songs'))).not.toContain('vigilance');
  });
  it('Dáin, Lord of the Iron Hills taxes attackers once you have an enduring story', () => {
    const attackers = (axes: number, lands: number) => {
      const g = game({
        p1: { battlefield: ['d-in-lord-of-the-iron-hills', ...n('hob-axe-token', axes)] },
        p2: { battlefield: ['savannah-lions', ...n('plains', lands)] },
        active: 'p2',
        step: 'beginCombat',
      });
      g.obj(g.id('p2', 'savannah-lions')).summoningSick = false;
      g.passBoth();
      return g.legal().filter((a) => a.type === 'addAttacker').length;
    };
    // Dáin and one Axe: no story yet. With two Axes the attacker must pay {1}, which a player without a land cannot.
    expect(attackers(1, 0)).toBeGreaterThan(0);
    expect(attackers(2, 0)).toBe(0);
    expect(attackers(2, 1)).toBeGreaterThan(0);
  });
  it('Kíli the Resourceful draws for another Dwarf or Equipment, once each turn', () => {
    const g = game({
      p1: {
        hand: ['iron-hills-blacksmith', 'dwarven-shortsword'],
        battlefield: [...n('plains', 8), 'k-li-the-resourceful'],
      },
    });
    const before = g.state.players.p1.hand.length;
    cast(g, 'iron-hills-blacksmith');
    done(g);
    // The Blacksmith (a Dwarf) and its Axe (an Equipment) both enter: one draw only.
    expect(g.state.players.p1.hand.length).toBe(before - 1 + 1);
    cast(g, 'dwarven-shortsword');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before - 2 + 1);
  });
  it('Kíli makes the first equip ability each turn cost {0} with an enduring story', () => {
    const g = game({
      p1: {
        battlefield: ['k-li-the-resourceful', 'hob-axe-token', 'hob-axe-token', 'savannah-lions'],
      },
    });
    const [axe1, axe2] = on(g, 'hob-axe-token', 'p1');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, axe1!, 1, [obj(g, lions)]);
    done(g);
    expect(g.obj(axe1!).attachedTo).toBe(lions);
    // No mana was spent, and the second equip is not free (no lands to pay for it).
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === axe2 && a.abilityIndex === 1),
    ).toBe(false);
  });
  it('Kíli does not make equip free without an enduring story', () => {
    const g = game({
      p1: { battlefield: ['k-li-the-resourceful', 'hob-axe-token', 'savannah-lions'] },
    });
    const [axe] = on(g, 'hob-axe-token', 'p1');
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === axe && a.abilityIndex === 1),
    ).toBe(false);
  });
});

describe('other creatures', () => {
  it('Belladonna Took gains 1, then draws, then pumps the team for the first three tokens each turn', () => {
    const g = game({
      p1: {
        hand: ['dwarven-shortsword', 'dwarven-shortsword', 'dwarven-shortsword'],
        battlefield: [...n('plains', 12), 'belladonna-took', 'savannah-lions'],
      },
    });
    const hand = g.state.players.p1.hand.length;
    cast(g, 'dwarven-shortsword');
    done(g);
    expect(g.life('p1')).toBe(21);
    cast(g, 'dwarven-shortsword');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 2 + 1);
    cast(g, 'dwarven-shortsword');
    done(g);
    expect(
      g.obj(g.id('p1', 'savannah-lions')).counters?.['+1/+1'] ??
        g.obj(g.id('p1', 'savannah-lions')).plusOneCounters,
    ).toBe(1);
    expect(g.obj(g.id('p1', 'belladonna-took')).plusOneCounters).toBe(1);
  });
  it('Dwarven Provisioner pumps the team', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 4), 'dwarven-provisioner', 'savannah-lions'] },
    });
    activate(g, g.id('p1', 'dwarven-provisioner'), 0);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'dwarven-provisioner'))).toEqual([3, 3]);
  });
  it('Eagle of the Great Shelf gets +1/+1 for each other creature when it attacks', () => {
    const g = game({
      p1: { battlefield: ['eagle-of-the-great-shelf', 'savannah-lions', 'savannah-lions'] },
      step: 'beginCombat',
    });
    const eagle = g.id('p1', 'eagle-of-the-great-shelf');
    g.obj(eagle).summoningSick = false;
    g.passBoth();
    g.attack(eagle);
    done(g);
    expect(pt(g, eagle)).toEqual([4, 7]);
  });
  it('Lake-town Toymaker gives another creature +3/+0 and first strike at combat after two draws this turn', () => {
    const draws = (times: number) => {
      const g = game({
        p1: {
          battlefield: [
            ...n('plains', 6),
            'gleaming-splendor',
            'lake-town-toymaker',
            'savannah-lions',
          ],
        },
      });
      for (let i = 0; i < times; i++) {
        activate(g, g.id('p1', 'gleaming-splendor'), 1, [{ player: 'p1' }, { player: 'p2' }]);
        done(g);
      }
      toStep(g, 'beginCombat');
      done(g);
      return g;
    };
    const two = draws(2);
    const lions = two.id('p1', 'savannah-lions');
    expect(pt(two, lions)).toEqual([5, 1]);
    expect(keywords(two, lions)).toContain('firstStrike');
    const one = draws(1);
    expect(pt(one, one.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('Gleaming Splendor', () => {
  it('makes a Treasure when an opponent draws their second card, and lets two players draw', () => {
    const g = game({ p1: { battlefield: [...n('plains', 6), 'gleaming-splendor'] } });
    const hand = g.state.players.p1.hand.length;
    activate(g, g.id('p1', 'gleaming-splendor'), 1, [{ player: 'p1' }, { player: 'p2' }]);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(hand + 1);
    expect(on(g, 'treasure-token', 'p1')).toHaveLength(0);
    activate(g, g.id('p1', 'gleaming-splendor'), 1, [{ player: 'p1' }, { player: 'p2' }]);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(hand + 2);
    expect(g.state.players.p2.hand.length).toBe(2);
    expect(on(g, 'treasure-token', 'p1')).toHaveLength(1);
  });
});
