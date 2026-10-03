import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { getCharacteristics, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckIds, FINAL_FANTASY_DECKS } from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11a: the set mechanics (job select, tiered, Saga creatures, Towns, adventure lands).

const heroes = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === 'fin-hero-token' && g.obj(id).controller === p,
  );

/** Passes (settling triggers on the way) until `player`'s next precombat main phase. */
function nextMain(g: GameDriver, player: 'p1' | 'p2' = 'p1') {
  const from = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    const s = g.state;
    if (s.turn.number > from && s.turn.activePlayer === player && s.turn.step === 'main1')
      if (s.decision.kind === 'priority' && s.stack.length === 0) return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'discardToHandSize') g.do(g.legal()[0]!);
    else g.do(g.legal()[0]!);
  }
  throw new Error('No next main phase');
}

describe('job select', () => {
  it("White Mage's Staff makes a Hero, attached, which is a 2/2 Cleric", () => {
    const g = game({ p1: { hand: ['white-mages-staff'], battlefield: n('plains', 2) } });
    settle(cast(g, 'white-mages-staff'));
    const [h] = heroes(g);
    expect(h).toBeDefined();
    const staff = g.id('p1', 'white-mages-staff');
    expect(g.obj(staff).attachedTo).toBe(h);
    expect(pt(g, h!)).toEqual([2, 2]);
    expect(getCharacteristics(g.state, cardDb, h!).subtypes).toContain('Cleric');
  });

  it("Dragoon's Lance gives flying during your turn only", () => {
    const g = game({ p1: { hand: ['dragoons-lance'], battlefield: n('plains', 2) } });
    settle(cast(g, 'dragoons-lance'));
    const [h] = heroes(g);
    expect(getCharacteristics(g.state, cardDb, h!).keywords).toContain('flying');
    nextMain(g, 'p2');
    expect(getCharacteristics(g.state, cardDb, h!).keywords).not.toContain('flying');
  });

  it('the Equipment can be moved with equip and the Hero stays', () => {
    const g = game({
      p1: { hand: ['warriors-sword'], battlefield: [...n('mountain', 9), 'coeurl'] },
    });
    settle(cast(g, 'warriors-sword'));
    const [h] = heroes(g);
    expect(pt(g, h!)).toEqual([4, 3]);
    const sword = g.id('p1', 'warriors-sword');
    const coeurl = g.id('p1', 'coeurl');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: sword,
      abilityIndex: 2,
      targets: [g.ref(coeurl)],
    });
    settle(g);
    expect(pt(g, coeurl)).toEqual([5, 4]);
    expect(pt(g, h!)).toEqual([1, 1]);
  });
});

describe('tiered', () => {
  it('Thunder Magic offers only the tiers you can pay for, each adding its cost', () => {
    const g = game({
      p1: { hand: ['thunder-magic'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const modes = new Set(
      g.legal().flatMap((a) => (a.type === 'castSpell' && a.mode !== undefined ? [a.mode] : [])),
    );
    expect([...modes].sort()).toEqual([0, 1]);
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'thunder-magic', [g.ref(angel)], { mode: 1 }));
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped).length).toBe(4);
  });

  it("Tifa's Limit Break doubles power and toughness", () => {
    const g = game({
      p1: { hand: ['tifas-limit-break'], battlefield: [...n('forest', 3), 'coeurl'] },
    });
    const c = g.id('p1', 'coeurl');
    settle(cast(g, 'tifas-limit-break', [g.ref(c)], { mode: 1 }));
    expect(pt(g, c)).toEqual([4, 4]);
  });
});

describe('Saga creatures', () => {
  it('Summon: Choco/Mog: chapters on a summoning-sick creature, sacrificed after IV', () => {
    const g = game({
      p1: { hand: ['summon-choco-mog'], battlefield: [...n('plains', 3), 'coeurl'] },
    });
    settle(cast(g, 'summon-choco-mog'));
    const saga = g.id('p1', 'summon-choco-mog');
    expect(g.obj(saga).counters?.lore).toBe(1);
    expect(pt(g, g.id('p1', 'coeurl'))).toEqual([3, 2]);
    // It can't attack the turn it enters.
    g.passUntilStep('beginCombat').passBoth();
    expect(g.legal().some((a) => a.type === 'addAttacker' && a.attacker === saga)).toBe(false);
    for (const lore of [2, 3]) {
      nextMain(g);
      expect(g.obj(saga).counters?.lore).toBe(lore);
    }
    nextMain(g);
    expect(g.zoneOf(saga)).toBe('graveyard');
  });

  it('a Summon attacks and blocks like any creature once it has been around', () => {
    const g = game({ p1: { battlefield: ['summon-choco-mog'] } });
    const saga = g.id('p1', 'summon-choco-mog');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(saga);
    g.passUntilStep('end');
    expect(g.life('p2')).toBe(17);
  });

  it('Dion transforms into Bahamut, a Saga that returns him at chapter III', () => {
    const g = game({
      p1: { battlefield: ['dion-bahamuts-dominant', ...n('plains', 6), 'coeurl'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const dion = g.id('p1', 'dion-bahamuts-dominant');
    g.do({ type: 'activateAbility', player: 'p1', source: dion, abilityIndex: 2, targets: [] });
    settle(g);
    expect(g.obj(dion).defId).toBe('bahamut-warden-of-light');
    expect(g.obj(dion).counters?.lore).toBe(1);
    const coeurl = g.id('p1', 'coeurl');
    expect(g.obj(coeurl).plusOneCounters).toBe(1);
    nextMain(g);
    expect(g.obj(coeurl).plusOneCounters).toBe(2);
    nextMain(g);
    // Chapter III destroyed a permanent and returned Bahamut as Dion (a new object, not sacrificed).
    expect(g.obj(dion).defId).toBe('dion-bahamuts-dominant');
    expect(g.zoneOf(dion)).toBe('battlefield');
  });

  it('Garnet removes lore counters from chosen Sagas as she attacks', () => {
    const g = game({
      p1: {
        battlefield: ['garnet-princess-of-alexandria', 'summon-choco-mog', 'summon-fat-chocobo'],
      },
    });
    for (const s of ['summon-choco-mog', 'summon-fat-chocobo'])
      g.obj(g.id('p1', s)).counters = { lore: 2 };
    const garnet = g.id('p1', 'garnet-princess-of-alexandria');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(garnet);
    settle(g);
    expect(g.decision).toMatchObject({ kind: 'chooseObject', optional: true });
    const choco = g.id('p1', 'summon-choco-mog');
    g.do({ type: 'chooseCard', player: 'p1', card: choco });
    // The same Saga isn't offered twice; stop after one.
    expect(g.decision.kind === 'chooseObject' && g.decision.options).not.toContain(choco);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(g.obj(choco).counters?.lore).toBe(1);
    expect(g.obj(g.id('p1', 'summon-fat-chocobo')).counters?.lore).toBe(2);
    expect(g.obj(garnet).plusOneCounters).toBe(1);
  });

  it('Clash of the Eikons can add a lore counter, triggering the chapter', () => {
    const g = game({
      p1: { hand: ['clash-of-the-eikons'], battlefield: ['forest', 'summon-fat-chocobo'] },
    });
    const saga = g.id('p1', 'summon-fat-chocobo');
    g.obj(saga).counters = { lore: 1 };
    const add = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          cardDb.get('clash-of-the-eikons')!.modes![a.mode!]!.label === 'Add a lore counter',
      )!;
    settle(g.do(add));
    expect(g.obj(saga).counters?.lore).toBe(2);
    // Chapter II: creatures you control gain trample.
    expect(getCharacteristics(g.state, cardDb, saga).keywords).toContain('trample');
  });

  it('Esper Origins with flashback enters as Summon: Esper Maduin with a finality counter', () => {
    const g = game({
      p1: { graveyard: ['esper-origins'], battlefield: n('forest', 4), library: n('plains', 5) },
    });
    const card = g.id('p1', 'esper-origins', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    settle(g);
    if (g.decision.kind === 'scry') g.do(g.legal()[0]!);
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(g.obj(card).defId).toBe('summon-esper-maduin');
    expect(g.obj(card).counters?.finality).toBe(1);
    // Chapter I: a permanent card from the top into the hand.
    expect(handSize(g, 'p1')).toBe(1);
  });

  it("a transforming card's back face can't be cast from hand", () => {
    const g = game({ p1: { hand: ['crystal-fragments'], battlefield: n('plains', 7) } });
    expect(g.legal().filter((a) => a.type === 'castSpell' && a.back)).toEqual([]);
  });
});

describe('Towns', () => {
  it("Prishe's Wanderings finds a Town and puts a counter on your creature", () => {
    const g = game({
      p1: {
        hand: ['prishes-wanderings'],
        battlefield: [...n('forest', 3), 'coeurl'],
        library: ['windurst-federation-center', 'serra-angel'],
      },
    });
    const c = g.id('p1', 'coeurl');
    cast(g, 'prishes-wanderings', [g.ref(c)]);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== null)!);
    settle(g);
    const town = g.id('p1', 'windurst-federation-center');
    expect(g.obj(town).tapped).toBe(true);
    expect(g.obj(c).plusOneCounters).toBe(1);
  });
});

describe('adventure lands', () => {
  it('Zanarkand: cast Lasting Fayth from hand, then play the land from exile', () => {
    const g = game({ p1: { hand: ['zanarkand-ancient-metropolis'], battlefield: n('forest', 6) } });
    const card = g.id('p1', 'zanarkand-ancient-metropolis', 'hand');
    const legal = g.legal();
    expect(legal.some((a) => a.type === 'playLand' && a.card === card)).toBe(true);
    const adventure = legal.find((a) => a.type === 'castSpell' && a.card === card && a.back)!;
    expect(adventure).toBeDefined();
    settle(g.do(adventure));
    const [h] = heroes(g);
    expect(pt(g, h!)).toEqual([7, 7]);
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.obj(card).onAdventure).toBe(true);
    expect(g.obj(card).defId).toBe('zanarkand-ancient-metropolis');
    // On an adventure: the land can be played from exile (using the land drop).
    const play = g.legal().find((a) => a.type === 'playLand' && a.card === card)!;
    g.do(play);
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(g.obj(card).tapped).toBe(true);
    expect(g.state.players.p1.landsPlayedThisTurn).toBe(1);
  });

  it('a countered Adventure goes to the graveyard, not on an adventure', () => {
    const g = game({
      p1: { hand: ['lindblum-industrial-regency'], battlefield: n('mountain', 3) },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    const card = g.id('p1', 'lindblum-industrial-regency', 'hand');
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.back)!);
    g.pass();
    const counter = g
      .legal()
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'cancel')!;
    settle(g.do(counter));
    expect(g.zoneOf(card)).toBe('graveyard');
    expect(g.obj(card).defId).toBe('lindblum-industrial-regency');
  });
});

describe('random games', () => {
  it('the Final Fantasy decks play random games to completion, against each other and the starters', () => {
    const [arsenal, eidolons] = FINAL_FANTASY_DECKS.map(deckIds) as [string[], string[]];
    const starter = deckIds(deckById('might-of-the-legion'));
    const pairings = [
      { p1: arsenal, p2: eidolons },
      { p1: eidolons, p2: starter },
      { p1: starter, p2: arsenal },
    ];
    for (let seed = 1; seed <= 24; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
