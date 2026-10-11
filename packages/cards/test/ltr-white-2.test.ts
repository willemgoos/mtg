import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { casts, done, keywords, obj, on } from './hob-white-helpers.ts';
import { attack, ringOf, subtypes } from './ltr-white-helpers.ts';

// Lord of the Rings 21b: the white cards, part two (Faramir's Ring trigger to Lost to Legend).

describe('Faramir, Field Commander (the Ring)', () => {
  const tempt = (bearer: string) => {
    const g = game({
      p1: {
        hand: ['slip-on-the-ring'],
        battlefield: ['plains', 'plains', 'faramir-field-commander', 'savannah-lions'],
      },
    });
    cast(g, 'slip-on-the-ring', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g, { card: bearer });
    return g;
  };
  it('makes a Human Soldier if you chose another creature as your Ring-bearer', () => {
    const g = tempt('savannah-lions');
    expect(ringOf(g)?.bearer?.id).toBe(g.id('p1', 'savannah-lions'));
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
  });
  it('makes nothing if Faramir is your Ring-bearer', () => {
    const g = tempt('faramir-field-commander');
    expect(ringOf(g)?.bearer?.id).toBe(g.id('p1', 'faramir-field-commander'));
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(0);
  });
});

describe('Fog on the Barrow-Downs', () => {
  it('makes the creature a Spirit that cannot attack or block', () => {
    const g = game({
      p1: { hand: ['fog-on-the-barrow-downs'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(subtypes(g, angel)).toEqual(['Angel']);
    cast(g, 'fog-on-the-barrow-downs', [obj(g, angel)]);
    done(g);
    expect(subtypes(g, angel)).toEqual(['Spirit']);
    const c = getCharacteristics(g.state, cardDb, angel);
    expect(c.cantAttack).toBe(true);
    expect(c.cantBlock).toBe(true);
    // It keeps its power, toughness and abilities.
    expect(pt(g, angel)).toEqual([4, 4]);
    expect(keywords(g, angel)).toContain('flying');
  });
});

describe("Hobbit's Sting", () => {
  it('deals damage equal to your creatures plus your Foods', () => {
    const g = game({
      p1: {
        hand: ['hobbits-sting'],
        battlefield: ['plains', 'plains', 'savannah-lions', 'food-token', 'food-token'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'hobbits-sting', [obj(g, angel)]);
    done(g);
    // One creature plus two Foods (a Food is not a creature).
    expect(g.obj(angel).damage).toBe(3);
  });
});

describe('Landroval, Horizon Witness', () => {
  const setup = () =>
    game({ p1: { battlefield: ['landroval-horizon-witness', 'savannah-lions'] }, p2: {} });
  it('gives an attacking creature without flying flying when two or more creatures attack', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    attack(g, [g.id('p1', 'landroval-horizon-witness'), lions]);
    settle(g);
    expect(keywords(g, lions)).toContain('flying');
  });
  it('does nothing when a creature attacks alone', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    attack(g, [lions]);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(keywords(g, lions)).not.toContain('flying');
  });
});

describe('Lost to Legend', () => {
  const setup = (target: string) =>
    game({
      p1: { hand: ['lost-to-legend'], battlefield: n('plains', 2) },
      p2: {
        battlefield: [target],
        library: ['forest', 'plains', 'island', 'swamp', 'mountain'],
      },
    });
  it("puts a legendary permanent fourth from the top of its owner's library", () => {
    const g = setup('faramir-field-commander');
    cast(g, 'lost-to-legend', [obj(g, g.id('p2', 'faramir-field-commander'))]);
    done(g);
    const lib = g.state.players.p2.library.map((id) => g.obj(id).defId);
    expect(lib).toEqual([
      'forest',
      'plains',
      'island',
      'faramir-field-commander',
      'swamp',
      'mountain',
    ]);
  });
  it('also targets artifacts, but not other nonland permanents or lands', () => {
    expect(casts(setup('lembas'), 'lost-to-legend')).toHaveLength(1);
    expect(casts(setup('serra-angel'), 'lost-to-legend')).toHaveLength(0);
    expect(casts(setup('mountain'), 'lost-to-legend')).toHaveLength(0);
  });
  it('can target the Ring-bearer (it is legendary)', () => {
    const g = setup('savannah-lions');
    expect(casts(g, 'lost-to-legend')).toHaveLength(0);
    g.state.players.p2.ring = { tempted: 1, bearer: { id: g.id('p2', 'savannah-lions'), zcc: 0 } };
    expect(casts(g, 'lost-to-legend')).toHaveLength(1);
  });
});
