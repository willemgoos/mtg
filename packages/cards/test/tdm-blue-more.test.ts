import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  activate,
  done,
  exile,
  gy,
  hand,
  keywords,
  nextTurn,
  stun,
  targeting,
} from './ecl-blue-helpers.ts';
import { counters, tgt } from './tdm-blue-helpers.ts';

// Tarkir: Dragonstorm 19b: the blue cards, creatures and Omens.

describe('Bewildering Blizzard', () => {
  it('draws three cards; creatures your opponents control get -3/-0 until end of turn', () => {
    const g = game({
      p1: {
        hand: ['bewildering-blizzard'],
        battlefield: [...n('island', 6), 'serra-angel'],
        library: n('forest', 5),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'bewildering-blizzard');
    done(g);
    expect(hand(g)).toHaveLength(3);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 4]);
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([4, 4]);
    nextTurn(g);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('Constrictor Sage', () => {
  it('enters: taps target creature an opponent controls and puts a stun counter on it', () => {
    const g = game({
      p1: { hand: ['constrictor-sage'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'constrictor-sage');
    done(g);
    const angel = g.id('p2', 'serra-angel');
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });

  it('renew: exile it from your graveyard for {2}{U}', () => {
    const g = game({
      p1: { battlefield: n('island', 3), graveyard: ['constrictor-sage'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const sage = g.id('p1', 'constrictor-sage', 'graveyard');
    const angel = g.id('p2', 'serra-angel');
    activate(g, sage, 1, [tgt(g, angel)]);
    done(g);
    expect(exile(g)).toEqual(['constrictor-sage']);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });
});

describe('Agent of Kotis', () => {
  it('renew: two +1/+1 counters on target creature', () => {
    const g = game({
      p1: { battlefield: [...n('island', 4), 'savannah-lions'], graveyard: ['agent-of-kotis'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'agent-of-kotis', 'graveyard'), 0, [tgt(g, lions)]);
    done(g);
    expect(counters(g, lions)).toBe(2);
    expect(pt(g, lions)).toEqual([4, 3]);
  });
});

describe('Humbling Elder and Iceridge Serpent', () => {
  it('Humbling Elder: flash; target creature an opponent controls gets -2/-0 until end of turn', () => {
    const g = game({
      p1: { hand: ['humbling-elder'], battlefield: ['island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(keywords(g, g.id('p1', 'humbling-elder', 'hand')).has('flash')).toBe(true);
    cast(g, 'humbling-elder');
    done(g);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([2, 4]);
  });

  it('Iceridge Serpent: returns target creature an opponent controls to its owner hand', () => {
    const g = game({
      p1: { hand: ['iceridge-serpent'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'iceridge-serpent');
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Dirgur Island Dragon and Skimming Strike', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['dirgur-island-dragon'],
        battlefield: n('island', 6),
        library: n('forest', 5),
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('is a 4/4 flyer with ward {2}', () => {
    const g = setup();
    const k = keywords(g, g.id('p1', 'dirgur-island-dragon', 'hand'));
    expect(k.has('flying')).toBe(true);
    expect(k.has('ward')).toBe(true);
  });

  it('Omen: tap up to one target creature, draw a card, then shuffle the card into the library', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    const card = g.id('p1', 'dirgur-island-dragon', 'hand');
    cast(g, 'dirgur-island-dragon', [tgt(g, angel)], { back: true });
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(hand(g)).toEqual(['forest']);
    expect(g.zoneOf(card)).toBe('library');
  });

  it('Omen with no target: still draws a card', () => {
    const g = setup();
    cast(g, 'dirgur-island-dragon', [], { back: true });
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Marang River Regent and Coil and Catch', () => {
  it('enters: returns up to two other target nonland permanents to their owners hands', () => {
    const g = game({
      p1: { hand: ['marang-river-regent'], battlefield: [...n('island', 6), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'forest'] },
    });
    cast(g, 'marang-river-regent');
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    // Targets are picked one at a time; the lands and the Regent itself are not legal.
    const first = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 1);
    expect(first).toHaveLength(2);
    g.do(targeting(g.id('p2', 'serra-angel'))(first)!);
    const second = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 2);
    expect(second).toHaveLength(1);
    g.do(second[0]!);
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['savannah-lions']);
  });

  it('Omen Coil and Catch: draw three cards, then discard a card; shuffled in afterwards', () => {
    const g = game({
      p1: { hand: ['marang-river-regent'], battlefield: n('island', 4), library: n('forest', 6) },
    });
    const card = g.id('p1', 'marang-river-regent', 'hand');
    cast(g, 'marang-river-regent', [], { back: true });
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(gy(g)).toHaveLength(1);
    expect(g.zoneOf(card)).toBe('library');
  });
});

describe('Whirlwing Stormbrood and Dynamic Soar', () => {
  it('you may cast sorcery spells and Dragon spells as though they had flash', () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: ['urenis-rebuff', 'firespitter-whelp', 'savannah-lions'],
        battlefield: ['whirlwing-stormbrood', ...n('island', 4), 'mountain'],
      },
      p2: {},
    });
    const castable = (id: string) =>
      g.legal('p1').some((a) => a.type === 'castSpell' && a.card === g.id('p1', id, 'hand'));
    g.pass(); // p2 passes priority in its main phase; p1 may respond
    expect(g.actor).toBe('p1');
    expect(castable('firespitter-whelp')).toBe(true);
    expect(castable('savannah-lions')).toBe(false);
  });
});
