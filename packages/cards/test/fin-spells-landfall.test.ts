import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { deckById, deckIds } from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11b (group A): Black Mages' Waltz (B/R) and Chocobo Stampede (R/G).

describe("Black Mages' Waltz", () => {
  it("Black Waltz No. 3 and a Black Mage's Rod Hero each hit the opponent for a noncreature spell", () => {
    const g = game({
      p1: {
        hand: ['black-mages-rod', 'laughing-mad', 'forest'],
        battlefield: [...n('swamp', 3), ...n('mountain', 3), 'black-waltz-no-3'],
      },
    });
    settle(cast(g, 'black-mages-rod'));
    expect(g.life('p2')).toBe(18);
    const hero = g.id('p1', 'fin-hero-token');
    expect(pt(g, hero)).toEqual([2, 1]);
    // Laughing Mad: discard a card as an additional cost.
    const forest = g.id('p1', 'forest', 'hand');
    settle(cast(g, 'laughing-mad', [], { discard: forest }));
    expect(g.life('p2')).toBe(15);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Garland returns from the graveyard as Chaos, which goes to the bottom of the library when it dies', () => {
    const g = game({
      p1: {
        hand: ['sephiroths-intervention'],
        battlefield: [...n('swamp', 6), ...n('mountain', 5)],
        graveyard: ['garland-knight-of-cornelia'],
      },
    });
    const garland = g.id('p1', 'garland-knight-of-cornelia', 'graveyard');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === garland)!);
    settle(g);
    expect(g.zoneOf(garland)).toBe('battlefield');
    expect(g.obj(garland).defId).toBe('chaos-the-endless');
    expect(pt(g, garland)).toEqual([5, 5]);
    settle(cast(g, 'sephiroths-intervention', [g.ref(garland)]));
    expect(g.zoneOf(garland)).toBe('library');
    expect(g.state.players.p1.library.at(-1)).toBe(garland);
  });

  it("Shambling Cie'th returns to hand when you cast a noncreature spell and pay {B}", () => {
    const g = game({
      p1: {
        hand: ['suplex'],
        battlefield: [...n('swamp', 2), ...n('mountain', 2)],
        graveyard: ['shambling-cieth'],
      },
      p2: { battlefield: ['coeurl'] },
    });
    const cieth = g.id('p1', 'shambling-cieth', 'graveyard');
    const coeurl = g.id('p2', 'coeurl');
    cast(g, 'suplex', [g.ref(coeurl)], { mode: 0 });
    for (let i = 0; i < 10 && g.decision.kind !== 'optionalEffect'; i++) g.pass();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.zoneOf(cieth)).toBe('hand');
    // Suplex exiles the creature it kills.
    expect(g.zoneOf(coeurl)).toBe('exile');
  });

  it('Summon: Esper Ramuh chapter I deals damage for each noncreature, nonland card in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['summon-esper-ramuh'],
        battlefield: n('mountain', 4),
        graveyard: [
          'suplex',
          'laughing-mad',
          'black-mages-rod',
          'thunder-magic',
          'coeurl',
          'forest',
        ],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(g, 'summon-esper-ramuh'));
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
  });
});

describe('Chocobo Stampede', () => {
  it('Chocobo Kick kicked returns a tapped land and deals twice the power', () => {
    const g = game({
      p1: { hand: ['chocobo-kick'], battlefield: [...n('forest', 2), 'coeurl'] },
      p2: { battlefield: ['serra-angel'] },
    });
    // Coeurl's power is 2: twice that kills the 4-toughness angel.
    const rex = g.id('p1', 'coeurl');
    const toad = g.id('p2', 'serra-angel');
    const [f1] = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    const kicked = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.kicked &&
          a.sacrifice === f1 &&
          a.targets.some((t) => 'object' in t && t.object.id === toad) &&
          a.targets.some((t) => 'object' in t && t.object.id === rex),
      );
    expect(kicked).toBeDefined();
    settle(g.do(kicked!));
    expect(g.zoneOf(f1!)).toBe('hand');
    expect(g.zoneOf(toad)).toBe('graveyard');
  });

  it("Rydia's Summon returns a Saga card with that mana value with a finality counter and haste", () => {
    const g = game({
      p1: {
        battlefield: [...n('mountain', 3), 'rydia-summoner-of-mist'],
        graveyard: ['summon-g-f-ifrit', 'summon-fenrir'],
      },
    });
    const ifrit = g.id('p1', 'summon-g-f-ifrit', 'graveyard');
    const rydia = g.id('p1', 'rydia-summoner-of-mist');
    const summon = g
      .legal()
      .filter(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === rydia &&
          a.targets.some((t) => 'object' in t && t.object.id === ifrit),
      );
    expect(summon.length).toBe(1);
    settle(g.do(summon[0]!));
    expect(g.zoneOf(ifrit)).toBe('battlefield');
    expect(g.obj(ifrit).counters?.finality).toBe(1);
    expect(g.obj(ifrit).counters?.lore).toBe(1);
  });

  it('Sazh’s Chocobo and Sabotender trigger on landfall; Gladiolus pumps another creature', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: ['sazhs-chocobo', 'sabotender', 'gladiolus-amicitia'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    settle(g);
    expect(g.obj(g.id('p1', 'sazhs-chocobo')).plusOneCounters).toBe(1);
    expect(g.life('p2')).toBe(19);
    const boosted = [g.id('p1', 'sazhs-chocobo'), g.id('p1', 'sabotender')].map((id) => pt(g, id));
    // Sazh's Chocobo: 0/1 with a counter, +2/+2 from Gladiolus.
    expect(boosted).toContainEqual([3, 4]);
  });

  it('Sidequest: Raise a Chocobo becomes Black Chocobo with four Birds and fetches a land', () => {
    const g = game({
      p1: {
        battlefield: [
          'sidequest-raise-a-chocobo',
          'fin-bird-token',
          'fin-bird-token',
          'fin-bird-token',
          'sazhs-chocobo',
        ],
        library: ['mountain', ...n('forest', 5)],
      },
      step: 'upkeep',
    });
    const quest = g.id('p1', 'sidequest-raise-a-chocobo');
    const lands = () =>
      g.state.battlefield.filter(
        (id) => g.obj(id).defId === 'mountain' || g.obj(id).defId === 'forest',
      ).length;
    g.passUntilStep('main1');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseCard') ?? legal[0]);
    for (let i = 0; i < 5 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    settle(g);
    expect(g.obj(quest).defId).toBe('black-chocobo');
    expect(lands()).toBe(1);
  });
});

describe('random games', () => {
  it("Black Mages' Waltz and Chocobo Stampede play random games to completion", () => {
    const waltz = deckIds(deckById('fin-black-mages-waltz'));
    const stampede = deckIds(deckById('fin-chocobo-stampede'));
    const starter = deckIds(deckById('learn-from-the-land'));
    const pairings = [
      { p1: waltz, p2: stampede },
      { p1: stampede, p2: starter },
      { p1: starter, p2: waltz },
    ];
    for (let seed = 1; seed <= 24; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
