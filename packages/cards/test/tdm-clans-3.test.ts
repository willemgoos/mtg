import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, settle } from './blb-helpers.ts';
import { activate, board, choose, done, exile, game, gy, hand, labels, n, passTo, stop } from './ecl-special-helpers.ts';

// Tarkir: Dragonstorm 19b, group clans: the Sultai cards, New Way Forward, Rediscover the Way and Call the Spirit Dragons.

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const keywords = (g: GameDriver, id: string) => [...chars(g, id).keywords];
const on = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') => board(g, defId, p);
const lands = (...xs: [string, number][]) => xs.flatMap(([c, k]) => n(c, k));

describe('Sultai', () => {
  it('Death Begets Life: destroys all creatures and enchantments and draws a card for each permanent destroyed', () => {
    const g = game({
      p1: {
        hand: ['death-begets-life'],
        battlefield: [...lands(['swamp', 3], ['forest', 3], ['island', 2]), 'serra-angel', 'banishing-light'],
      },
      p2: { battlefield: ['shivan-dragon', 'sol-ring'] },
    });
    cast(g, 'death-begets-life');
    done(g);
    // Serra Angel, Shivan Dragon and Pacifism are destroyed (the artifact and the lands are not).
    expect(g.state.battlefield.map((id) => g.obj(id).defId)).not.toContain('serra-angel');
    expect(g.state.battlefield.map((id) => g.obj(id).defId)).toContain('sol-ring');
    expect(gy(g).sort()).toEqual(['death-begets-life', 'banishing-light', 'serra-angel'].sort());
    expect(hand(g).length).toBe(3);
  });

  it('Death Begets Life: indestructible permanents are not destroyed and do not draw', () => {
    const g = game({
      p1: {
        hand: ['death-begets-life'],
        battlefield: [...lands(['swamp', 3], ['forest', 3], ['island', 2]), 'kotis-the-fangkeeper', 'serra-angel'],
      },
    });
    cast(g, 'death-begets-life');
    done(g);
    expect(on(g, 'kotis-the-fangkeeper')).toHaveLength(1);
    expect(hand(g).length).toBe(1);
  });

  it('Awaken the Honored Dead: destroys a nonland permanent, mills three, then discard a card to return a creature or land card', () => {
    const g = game({
      p1: {
        hand: ['awaken-the-honored-dead', 'island'],
        graveyard: ['serra-angel', 'plains'],
        battlefield: lands(['swamp', 1], ['forest', 1], ['island', 1]),
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    cast(g, 'awaken-the-honored-dead');
    done(g);
    expect(on(g, 'shivan-dragon', 'p2')).toHaveLength(0);
    // Next turn: chapter II mills three; the turn after, chapter III.
    const library = g.state.players.p1.library.length;
    for (let turns = 0; turns < 2; turns++) {
      passTo(g, 'main1', 'p2');
      passTo(g, 'main1', 'p1');
      done(g);
      if (turns === 0) expect(g.state.players.p1.library.length).toBe(library - 1 - 3);
    }
    // Chapter III: discard the Island to return the Serra Angel.
    done(g, { card: (id) => g.obj(id).defId === 'serra-angel' || g.obj(id).defId === 'island' });
    expect(hand(g)).toContain('serra-angel');
  });

  it('Teval: flying, lifelink; your spells have delve, and each spell you cast makes you lose life equal to its mana value', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        graveyard: ['forest', 'forest', 'forest'],
        battlefield: ['teval-arbiter-of-virtue', ...lands(['plains', 2])],
      },
    });
    expect(keywords(g, g.id('p1', 'teval-arbiter-of-virtue'))).toEqual(expect.arrayContaining(['flying', 'lifelink']));
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // Exiling three cards from the graveyard pays for the {3}.
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.some((a) => a.type === 'castSpell' && a.delve === 3)).toBe(true);
    g.do(casts.find((a) => a.type === 'castSpell' && a.delve === 3)!);
    done(g);
    expect(exile(g)).toHaveLength(3);
    expect(on(g, 'serra-angel')).toHaveLength(1);
    expect(g.life('p1')).toBe(15);
  });

  it('Teval: you choose which cards of your graveyard are exiled for delve, one at a time', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        graveyard: ['forest', 'plains', 'island', 'swamp'],
        battlefield: ['teval-arbiter-of-virtue', ...lands(['plains', 2])],
      },
    });
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.delve === 3)!);
    expect(g.decision.kind).toBe('forageExile');
    const pick = (defId: string) =>
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === defId)!);
    pick('island');
    pick('swamp');
    pick('forest');
    expect(g.decision.kind).toBe('priority');
    expect(exile(g).sort()).toEqual(['forest', 'island', 'swamp']);
    expect(gy(g)).toEqual(['plains']);
    expect(g.state.stack).toHaveLength(2); // the Angel and Teval's trigger
    done(g);
    expect(on(g, 'serra-angel')).toHaveLength(1);
    expect(g.life('p1')).toBe(15);
  });

  it("Teval: the opponent's spells don't make you lose life and don't have delve", () => {
    const g = game({
      p1: { battlefield: ['teval-arbiter-of-virtue'] },
      p2: { hand: ['lightning-bolt'], graveyard: ['forest'], battlefield: lands(['mountain', 1]) },
      active: 'p2',
    });
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    done(g);
    expect(g.life('p1')).toBe(17);
  });

  it("Rakshasa's Bargain: look at the top four, two to your hand, the rest to your graveyard", () => {
    const g = game({
      p1: {
        hand: ["rakshasas-bargain"],
        library: ['lightning-bolt', 'plains', 'forest', 'island', 'swamp'],
        battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]),
      },
    });
    cast(g, 'rakshasas-bargain');
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(gy(g)).toHaveLength(3); // the spell itself and two cards
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it("Fangkeeper's Familiar: flash; gain 3 and surveil 3", () => {
    const g = game({
      p1: { hand: ["fangkeepers-familiar"], battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]) },
    });
    expect(keywords(g, g.id('p1', 'fangkeepers-familiar', 'hand'))).toContain('flash');
    cast(g, 'fangkeepers-familiar');
    stop(g);
    done(g, { option: /gain 3/i });
    expect(g.life('p1')).toBe(23);
  });

  it("Fangkeeper's Familiar: destroy target enchantment", () => {
    const g = game({
      p1: { hand: ["fangkeepers-familiar"], battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]) },
      p2: { battlefield: ['banishing-light'] },
    });
    cast(g, 'fangkeepers-familiar');
    stop(g);
    done(g, { option: /enchantment/i });
    expect(on(g, 'banishing-light', 'p2')).toHaveLength(0);
  });

  it("Fangkeeper's Familiar: counter target creature spell", () => {
    const g = game({
      p1: { hand: ["fangkeepers-familiar"], battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]) },
      p2: { hand: ['serra-angel'], battlefield: lands(['plains', 5]) },
      active: 'p2',
    });
    cast(g, 'serra-angel');
    g.pass();
    cast(g, 'fangkeepers-familiar');
    stop(g);
    done(g, { option: /counter/i });
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(gy(g, 'p2')).toContain('serra-angel');
  });

  it('Lotuslight Dancers: lifelink; puts a black, a green and a blue card from the library into the graveyard', () => {
    const g = game({
      p1: {
        hand: ['lotuslight-dancers'],
        library: ['plains', 'bitter-triumph', 'giant-growth', 'counterspell', 'shivan-dragon'],
        battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]),
      },
    });
    cast(g, 'lotuslight-dancers');
    done(g);
    expect(gy(g).sort()).toEqual(['bitter-triumph', 'counterspell', 'giant-growth']);
    expect(keywords(g, g.id('p1', 'lotuslight-dancers'))).toContain('lifelink');
  });

  it('Kheru Goldkeeper: a Treasure when cards leave your graveyard during your turn; Renew', () => {
    const g = game({
      p1: {
        hand: ['lie-in-wait'],
        graveyard: ['kheru-goldkeeper', 'skirmish-rhino', 'serra-angel'],
        battlefield: ['kheru-goldkeeper', ...lands(['swamp', 3], ['forest', 3], ['island', 3])],
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const treasures = () => on(g, 'treasure-token').length;
    expect(treasures()).toBe(0);
    // Lie in Wait returns a creature card from the graveyard to hand: a card leaves it.
    const rhino = g.id('p1', 'skirmish-rhino', 'graveyard');
    cast(g, 'lie-in-wait', [g.ref(rhino), g.ref(g.id('p2', 'shivan-dragon'))]);
    done(g);
    expect(treasures()).toBe(1);
    // Renew from the graveyard: exile it as a cost (another card leaving), two +1/+1 counters and a flying counter.
    const inGy = g.id('p1', 'kheru-goldkeeper', 'graveyard');
    const target = g.id('p1', 'kheru-goldkeeper');
    activate(g, inGy, 1, [g.ref(target)]);
    done(g);
    expect(g.obj(target).plusOneCounters).toBe(2);
    expect(g.obj(target).counters?.flying).toBe(1);
    expect(treasures()).toBe(2);
  });

  it('Kheru Goldkeeper: no Treasure when cards leave your graveyard on the opponent\'s turn', () => {
    const g = game({
      p1: {
        graveyard: ['skirmish-rhino'],
        battlefield: ['kheru-goldkeeper'],
      },
      p2: { battlefield: ['scavenging-ooze', 'forest'] },
      active: 'p2',
    });
    const rhino = g.id('p1', 'skirmish-rhino', 'graveyard');
    activate(g, g.id('p2', 'scavenging-ooze'), 0, [g.ref(rhino)]);
    done(g);
    expect(exile(g)).toEqual(['skirmish-rhino']);
    expect(on(g, 'treasure-token')).toHaveLength(0);
    expect(on(g, 'treasure-token', 'p2')).toHaveLength(0);
  });

  it('Lie in Wait: returns a creature card to hand and deals damage equal to its power to a creature', () => {
    const g = game({
      p1: {
        hand: ['lie-in-wait'],
        graveyard: ['shivan-dragon'],
        battlefield: lands(['swamp', 1], ['forest', 1], ['island', 1]),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const dragon = g.id('p1', 'shivan-dragon', 'graveyard');
    cast(g, 'lie-in-wait', [g.ref(dragon), g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(hand(g)).toContain('shivan-dragon');
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(0);
  });

  it('Kotis: indestructible; on combat damage exile that many cards from their library and cast any with mana value X or less free', () => {
    const g = game({
      p1: { battlefield: [{ card: 'kotis-the-fangkeeper', sick: false }] },
      p2: { library: ['lightning-bolt', 'serra-angel', 'forest', 'shivan-dragon', 'forest'] },
    });
    expect(keywords(g, g.id('p1', 'kotis-the-fangkeeper'))).toContain('indestructible');
    for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    g.attack(g.id('p1', 'kotis-the-fangkeeper'));
    for (let i = 0; i < 40 && g.decision.kind !== 'castFree' && g.state.turn.step !== 'main2'; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'chooseTriggerTargets') settle(g);
      else break;
    }
    expect(g.life('p2')).toBe(18);
    // Two cards exiled: the Bolt (mana value 1) and Serra Angel (5): only the Bolt can be cast.
    expect(g.decision.kind).toBe('castFree');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'lightning-bolt')).toBe(true);
    g.do(casts.find((a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    done(g);
    expect(g.life('p2')).toBe(15);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });

  it('Gurmag Nightwatch: look at the top three, you may put one back on top, the rest go to the graveyard', () => {
    const g = game({
      p1: {
        hand: ['gurmag-nightwatch'],
        library: ['lightning-bolt', 'plains', 'forest', 'island'],
        battlefield: lands(['swamp', 2], ['forest', 2], ['island', 2]),
      },
    });
    cast(g, 'gurmag-nightwatch');
    done(g, { card: (id) => g.obj(id).defId === 'lightning-bolt' });
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toEqual(['lightning-bolt', 'island']);
    expect(gy(g).sort()).toEqual(['forest', 'plains']);
  });
});

describe('New Way Forward', () => {
  it('prevents the next damage from the chosen source to you, deals that much to its controller and draws that many cards', () => {
    const g = game({
      p1: { hand: ['new-way-forward'], battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]) },
      p2: { hand: ['lightning-bolt'], battlefield: lands(['mountain', 2]) },
      active: 'p2',
    });
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    g.pass();
    cast(g, 'new-way-forward');
    stop(g);
    // The sources on offer: the Lightning Bolt spell.
    expect(labels(g).some((l) => /Lightning Bolt/.test(l))).toBe(true);
    choose(g, /Lightning Bolt/);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(17);
    expect(hand(g).length).toBe(3);
  });

  it('only the chosen source is shielded, once, and only this turn', () => {
    const g = game({
      p1: { hand: ['new-way-forward'], battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]) },
      p2: { hand: ['lightning-bolt', 'shock'], battlefield: lands(['mountain', 2]) },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    cast(g, 'new-way-forward');
    stop(g);
    // The Shock is not the chosen source: it is choosing the Lightning Bolt in hand? It is not a source on the stack or
    // battlefield, so only the Shock and the permanents are offered; the shield is for the Shock.
    expect(labels(g).some((l) => /Lightning Bolt/.test(l))).toBe(false);
    choose(g, /Shock/);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(18);
    // The shield was used up: a second spell from the same player is a different source and hurts.
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    done(g);
    expect(g.life('p1')).toBe(17);
  });

  it('the shield ends with the turn', () => {
    const g = game({
      p1: { hand: ['new-way-forward'], battlefield: [...lands(['island', 2], ['mountain', 2], ['plains', 2]), 'serra-angel'] },
      p2: { battlefield: ['shivan-dragon'] },
    });
    cast(g, 'new-way-forward');
    stop(g);
    choose(g, /Shivan Dragon/);
    done(g);
    expect(g.state.turn.sourceShields).toHaveLength(1);
    passTo(g, 'main1', 'p2');
    expect(g.state.turn.sourceShields).toBeUndefined();
  });
});

describe('Rediscover the Way', () => {
  it('I: look at the top three, one to your hand, the rest on the bottom in the order you choose', () => {
    const g = game({
      p1: {
        hand: ['rediscover-the-way'],
        library: ['lightning-bolt', 'plains', 'island', 'forest', 'swamp'],
        battlefield: lands(['island', 1], ['mountain', 1], ['plains', 1]),
      },
    });
    cast(g, 'rediscover-the-way');
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual(['Lightning Bolt', 'Plains', 'Island']);
    choose(g, /Lightning Bolt/);
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual(['Plains, then Island', 'Island, then Plains']);
    choose(g, /Island, then Plains/);
    done(g);
    expect(hand(g)).toContain('lightning-bolt');
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toEqual(['forest', 'swamp', 'island', 'plains']);
  });

  it('III: whenever you cast a noncreature spell this turn, a creature you control gains double strike', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        battlefield: ['rediscover-the-way', 'serra-angel', ...lands(['mountain', 1])],
      },
    });
    // Put the Saga on its third chapter by hand: two lore counters, then the precombat main phase adds the third.
    g.state.objects[g.id('p1', 'rediscover-the-way')]!.counters = { lore: 2 };
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    done(g);
    expect(keywords(g, g.id('p1', 'serra-angel'))).toContain('doubleStrike');
  });
});

describe('Call the Spirit Dragons', () => {
  it('Dragons you control have indestructible', () => {
    const g = game({ p1: { battlefield: ['call-the-spirit-dragons', 'shivan-dragon', 'serra-angel'] } });
    expect(keywords(g, g.id('p1', 'shivan-dragon'))).toContain('indestructible');
    expect(keywords(g, g.id('p1', 'serra-angel'))).not.toContain('indestructible');
  });

  it('upkeep: a +1/+1 counter on a Dragon of each colour; a single Dragon of a colour is chosen automatically', () => {
    const g = game({ p1: { battlefield: ['call-the-spirit-dragons', 'shivan-dragon'] } });
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(g.obj(g.id('p1', 'shivan-dragon')).plusOneCounters).toBe(1);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'call-the-spirit-dragons')).toBe(true);
    expect(g.decision.kind).not.toBe('gameOver');
  });

  it('a multicoloured Dragon can get a counter for each of its colours', () => {
    const g = game({ p1: { battlefield: ['call-the-spirit-dragons', 'armament-dragon'] } });
    passTo(g, 'upkeep', 'p1');
    done(g);
    // White, black and green: three counters on the same Dragon.
    expect(g.obj(g.id('p1', 'armament-dragon')).plusOneCounters).toBe(3);
  });

  it('five different Dragons that get counters win the game; the player chooses the Dragon when there is a choice', () => {
    const g = game({
      p1: {
        battlefield: [
          'call-the-spirit-dragons',
          'shivan-dragon',
          'jeskai-shrinekeeper',
          'armament-dragon',
          'teval-arbiter-of-virtue',
          'betor-kin-to-all',
        ],
      },
    });
    passTo(g, 'upkeep', 'p1');
    // White: Shrinekeeper, Armament Dragon or Betor; the picks below give five different Dragons.
    stop(g);
    const pick = (label: RegExp) => {
      expect(g.decision.kind).toBe('chooseOption');
      choose(g, label);
      stop(g);
    };
    pick(/Jeskai Shrinekeeper/); // white
    pick(/Teval/); // blue
    pick(/Armament Dragon/); // black
    // Red: Shivan Dragon or Jeskai Shrinekeeper
    pick(/Shivan Dragon/);
    // Green: Betor
    pick(/Betor/);
    done(g);
    expect(g.decision.kind).toBe('gameOver');
    expect(g.state.winner).toBe('p1');
  });

  it('no win when the counters go on fewer than five Dragons', () => {
    const g = game({
      p1: { battlefield: ['call-the-spirit-dragons', 'armament-dragon', 'jeskai-shrinekeeper'] },
    });
    passTo(g, 'upkeep', 'p1');
    stop(g);
    done(g);
    expect(g.decision.kind).not.toBe('gameOver');
  });
});
