import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_GREEN_MAIN } from '../src/ltr/green-main.ts';
import { cast, game, handSize, n, pt } from './blb-helpers.ts';
import { done, keywords, names, obj, toStep } from './hob-white-helpers.ts';
import { attack, type Game, ringOf, tokensOf, use } from './ltr-white-helpers.ts';

// Lord of the Rings 22: the green main-set commons and uncommons outside the Jumpstart packets.

/** Resolves everything, keeping scried cards on top. */
function finish(g: Game): void {
  for (let i = 0; i < 10; i++) {
    done(g);
    const d = g.decision;
    if (d.kind !== 'scry') return;
    g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
  }
}

describe('the green main-set group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_GREEN_MAIN)).toHaveLength(7);
    for (const name of Object.keys(LTR_GREEN_MAIN)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Bag End Porter', () => {
  it('gets +X/+X as it attacks for each legendary creature you control', () => {
    const g = game({ p1: { battlefield: ['bag-end-porter', 'gimli-counter-of-kills'] } });
    const porter = g.id('p1', 'bag-end-porter');
    attack(g, [porter]);
    done(g);
    expect(pt(g, porter)).toEqual([5, 5]);
  });
});

describe('Elven Farsight', () => {
  it('draws if the top card is a creature card', () => {
    const g = game({
      p1: {
        hand: ['elven-farsight'],
        battlefield: ['forest'],
        library: ['savannah-lions', ...n('forest', 3)],
      },
    });
    cast(g, 'elven-farsight');
    finish(g);
    expect(names(g, 'p1', 'hand')).toEqual(['savannah-lions']);
  });
  it("doesn't draw for a land", () => {
    const g = game({
      p1: { hand: ['elven-farsight'], battlefield: ['forest'], library: n('forest', 4) },
    });
    cast(g, 'elven-farsight');
    finish(g);
    expect(handSize(g, 'p1')).toBe(0);
  });
});

describe('Generous Ent', () => {
  it('makes a Food as it enters', () => {
    const g = game({ p1: { hand: ['generous-ent'], battlefield: n('forest', 6) } });
    cast(g, 'generous-ent');
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
});

describe('Long List of the Ents', () => {
  it('notes a type; the next creature spell of that type this turn enters with a counter', () => {
    const g = game({
      p1: {
        hand: ['long-list-of-the-ents', 'savannah-lions', 'savannah-lions'],
        battlefield: ['forest', 'plains', 'plains'],
      },
    });
    cast(g, 'long-list-of-the-ents');
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no type prompt');
    // Cats come first: a Savannah Lions is in hand.
    expect(d.options[0]!.label).toBe('Cat');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    done(g);
    cast(g, 'savannah-lions');
    done(g);
    cast(g, 'savannah-lions');
    done(g);
    const lions = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    expect(lions.map((id) => pt(g, id)[0]).sort()).toEqual([2, 3]);
  });
});

describe('Many Partings', () => {
  it('finds a basic land and makes a Food', () => {
    const g = game({
      p1: {
        hand: ['many-partings'],
        battlefield: ['forest'],
        library: ['forest', 'savannah-lions'],
      },
    });
    cast(g, 'many-partings');
    done(g);
    expect(names(g, 'p1', 'hand')).toEqual(['forest']);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
});

describe('Mushroom Watchdogs', () => {
  it('sacrifices a Food for a counter and vigilance', () => {
    const g = game({ p1: { battlefield: ['mushroom-watchdogs', 'food-token'] } });
    const dog = g.id('p1', 'mushroom-watchdogs');
    use(g, dog, 0);
    done(g);
    expect(pt(g, dog)).toEqual([3, 3]);
    expect(keywords(g, dog)).toContain('vigilance');
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
  });
});

describe('Shortcut to Mushrooms', () => {
  it('tempts you, and gives a counter at your end step if a permanent of yours left the battlefield', () => {
    const g = game({
      p1: {
        hand: ['shortcut-to-mushrooms'],
        battlefield: ['mushroom-watchdogs', 'food-token', ...n('forest', 2)],
      },
    });
    cast(g, 'shortcut-to-mushrooms');
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
    const dog = g.id('p1', 'mushroom-watchdogs');
    use(g, dog, 0);
    done(g);
    toStep(g, 'end', 'p1');
    done(g);
    expect(pt(g, dog)).toEqual([4, 4]);
  });
  it('does nothing if none left', () => {
    const g = game({ p1: { battlefield: ['shortcut-to-mushrooms', 'mushroom-watchdogs'] } });
    toStep(g, 'end', 'p1');
    done(g);
    expect(pt(g, g.id('p1', 'mushroom-watchdogs'))).toEqual([2, 2]);
    expect(obj(g, g.id('p1', 'mushroom-watchdogs'))).toBeDefined();
  });
});
