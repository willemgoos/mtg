import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  done,
  exile,
  gy,
  hand,
  keywords,
  nextTurn,
} from './ecl-blue-helpers.ts';
import { choose, counters, untilOption } from './tdm-blue-helpers.ts';

// Tarkir: Dragonstorm 19b: the blue cards (first half).

describe('Aegis Sculptor', () => {
  const setup = (graveyard: string[]) =>
    game({ p1: { battlefield: ['aegis-sculptor'], graveyard } });

  it('has flying and ward', () => {
    const g = setup([]);
    const k = keywords(g, g.id('p1', 'aegis-sculptor'));
    expect(k.has('flying')).toBe(true);
    expect(k.has('ward')).toBe(true);
  });

  it('upkeep: exile two cards of your choice from your graveyard to put a +1/+1 counter on it', () => {
    const g = setup(['shock', 'savannah-lions', 'forest']);
    const sculptor = g.id('p1', 'aegis-sculptor');
    nextTurn(g); // p2's turn: no upkeep trigger for p1
    expect(counters(g, sculptor)).toBe(0);
    const labels = untilOption(g);
    expect(labels).toEqual(['Exile 2 cards from your graveyard', "Don't exile"]);
    choose(g, /Exile 2/);
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /Shock/);
    choose(g, /Forest/);
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(exile(g).sort()).toEqual(['forest', 'shock']);
    expect(counters(g, sculptor)).toBe(1);
  });

  it('may decline, and is not asked with fewer than two cards', () => {
    const g = setup(['shock', 'savannah-lions']);
    const sculptor = g.id('p1', 'aegis-sculptor');
    nextTurn(g);
    untilOption(g);
    choose(g, /Don't exile/);
    done(g);
    expect(gy(g)).toHaveLength(2);
    expect(counters(g, sculptor)).toBe(0);
    const h = setup(['shock']);
    nextTurn(h);
    nextTurn(h);
    expect(gy(h)).toEqual(['shock']);
    expect(counters(h, h.id('p1', 'aegis-sculptor'))).toBe(0);
  });
});

describe('Kishla Trawlers', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['kishla-trawlers'],
        battlefield: n('island', 3),
        graveyard: ['savannah-lions', 'shock', 'serra-angel'],
      },
    });

  it('exiles a creature card of your choice, then returns a target instant or sorcery card', () => {
    const g = setup();
    cast(g, 'kishla-trawlers');
    done(g, { option: /Serra Angel/ });
    expect(exile(g)).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['shock']);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('may decline: nothing is exiled and nothing returns', () => {
    const g = setup();
    cast(g, 'kishla-trawlers');
    done(g, { option: /Don't exile/ });
    expect(exile(g)).toEqual([]);
    expect(hand(g)).toEqual([]);
  });

  it('with no creature card in the graveyard nothing is asked', () => {
    const g = game({
      p1: { hand: ['kishla-trawlers'], battlefield: n('island', 3), graveyard: ['shock'] },
    });
    cast(g, 'kishla-trawlers');
    done(g);
    expect(hand(g)).toEqual([]);
  });
});

describe('Ambling Stormshell', () => {
  it('attacks: three stun counters on it and draw three; casting a Turtle spell untaps it', () => {
    const g = game({
      p1: {
        hand: ['ambling-stormshell'],
        battlefield: [...n('island', 5)],
        library: n('forest', 6),
      },
    });
    cast(g, 'ambling-stormshell');
    done(g);
    const shell = g.id('p1', 'ambling-stormshell');
    expect(pt(g, shell)).toEqual([5, 9]);
    expect(keywords(g, shell).has('ward')).toBe(true);
  });
});
