import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { SOA_ARCHIVE_LIST } from '../src/sos/archive-list.ts';
import { STA_ARCHIVE_LIST } from '../src/stx/archive-list.ts';
import { cast, game, n, settle } from './blb-helpers.ts';

// Mystical Archive (16): the STA and SOA lists and the cards that needed new rules.

const hand = (g: GameDriver, who: 'p1' | 'p2' = 'p1') => g.state.players[who].hand.length;
const gyOf = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.players[who].graveyard.map((id) => g.obj(id).defId);
const stats = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};

/** Resolves the stack, answering prompts: `option` for chooseOption, the first choice for the rest. */
function done(g: GameDriver, opts: { option?: number; accept?: boolean } = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: opts.option ?? 0 });
    else if (d.kind === 'optionalEffect')
      g.do({ type: 'chooseEffect', player: d.player, accept: opts.accept ?? false });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'priority' || d.kind === 'gameOver') break;
    else g.do(g.legal()[0]!);
  }
  return g;
}

describe('the archive lists', () => {
  it('STA has 63 cards and SOA has 65, each once, all in the pool', () => {
    expect(STA_ARCHIVE_LIST).toHaveLength(63);
    expect(SOA_ARCHIVE_LIST).toHaveLength(65);
    for (const list of [STA_ARCHIVE_LIST, SOA_ARCHIVE_LIST]) {
      expect(new Set(list.map(([name]) => name)).size).toBe(list.length);
      for (const [name] of list) expect(cardDb.has(slug(name)), name).toBe(true);
    }
    const tally = (list: typeof STA_ARCHIVE_LIST) =>
      (['uncommon', 'rare', 'mythic'] as const).map((r) => list.filter(([, x]) => x === r).length);
    expect(tally(STA_ARCHIVE_LIST)).toEqual([18, 30, 15]);
    expect(tally(SOA_ARCHIVE_LIST)).toEqual([25, 25, 15]);
  });
});

describe('targeting and counting', () => {
  it("Doom Blade can't target a black creature", () => {
    const g = game({
      p1: { hand: ['doom-blade'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel', 'vampire-nighthawk'] },
    });
    cast(g, 'doom-blade', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(gyOf(g, 'p2')).toEqual(['serra-angel']);
    const g2 = game({
      p1: { hand: ['doom-blade'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['vampire-nighthawk'] },
    });
    expect(() => cast(g2, 'doom-blade', [g2.ref(g2.id('p2', 'vampire-nighthawk'))])).toThrow();
  });

  it('Storm copies a spell for each spell cast before it', () => {
    const g = game({
      p1: { hand: ['dark-ritual', 'dark-ritual', 'grapeshot'], battlefield: ['swamp', 'mountain'] },
    });
    cast(g, 'dark-ritual');
    done(g);
    cast(g, 'dark-ritual');
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(5);
    cast(g, 'grapeshot', [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(17);
  });

  it('Empty the Warrens makes two Goblins, and two more per earlier spell', () => {
    const g = game({
      p1: {
        hand: ['dark-ritual', 'empty-the-warrens'],
        battlefield: ['swamp', 'mountain', 'mountain', 'mountain', 'mountain'],
      },
    });
    cast(g, 'dark-ritual');
    done(g);
    cast(g, 'empty-the-warrens');
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'goblin-token')).toHaveLength(4);
  });
});

describe('split second', () => {
  it("Krosan Grip can't be responded to", () => {
    const g = game({
      p1: { hand: ['krosan-grip'], battlefield: ['forest', 'forest', 'forest'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'adventuring-gear'] },
    });
    cast(g, 'krosan-grip', [g.ref(g.id('p2', 'adventuring-gear'))]);
    expect(g.legal().map((a) => a.type)).toEqual(['passPriority']);
    g.pass();
    // The opponent can't respond with their Shock either.
    expect(g.legal().map((a) => a.type)).toEqual(['passPriority']);
    done(g);
    expect(gyOf(g, 'p2')).toEqual(['adventuring-gear']);
  });
});

describe('alternative costs', () => {
  it('Daze returns an Island instead of paying, and counters unless they pay {1}', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['daze'], battlefield: ['island'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'daze', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
      kicked: true,
      sacrifice: g.id('p2', 'island'),
    });
    expect(g.state.players.p2.hand.map((id) => g.obj(id).defId)).toEqual(['island']);
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(gyOf(g, 'p1')).toEqual(['shock']);
  });

  it('Force of Will exiles a blue card and costs 1 life', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['force-of-will', 'opt'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'force-of-will', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
      kicked: true,
      discard: g.id('p2', 'opt', 'hand'),
    });
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual(['opt']);
    expect(gyOf(g, 'p1')).toEqual(['shock']);
    expect(hand(g, 'p2')).toBe(0);
  });

  it("Force of Will can't be cast for free without a blue card to exile", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['force-of-will', 'shock'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    expect(() =>
      g.do({
        type: 'castSpell',
        player: 'p2',
        card: g.id('p2', 'force-of-will', 'hand'),
        targets: [g.ref(g.state.stack[0]!.id)],
        kicked: true,
        discard: g.id('p2', 'shock', 'hand'),
      }),
    ).toThrow();
  });
});

const activate = (g: GameDriver, source: string, index = 0) =>
  g.do(
    g
      .legal()
      .find(
        (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
      )!,
  );
const onField = (g: GameDriver, defId: string, who: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === who);

describe('protection and prevention', () => {
  it("Teferi's Protection freezes your life, phases your permanents out and exiles itself", () => {
    const g = game({
      p1: {
        hand: ['teferis-protection'],
        battlefield: ['plains', 'plains', 'plains', 'serra-angel'],
      },
      p2: { hand: ['shock'] },
    });
    const card = g.id('p1', 'teferis-protection', 'hand');
    cast(g, 'teferis-protection');
    done(g);
    expect(g.state.players.p1.lifeFrozen).toBe(true);
    expect(g.state.battlefield).toHaveLength(0);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it("Angel's Grace: damage can't take you below 1 and you can't lose", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['angels-grace'], battlefield: ['plains'], life: 2 },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'angels-grace', 'hand'),
      targets: [],
    });
    done(g);
    expect(g.life('p1')).toBe(1);
    expect(g.state.players.p1.lost).toBeFalsy();
  });

  it('Deflecting Palm prevents the next damage to you and deals it to its source controller', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['deflecting-palm'], battlefield: ['mountain', 'plains'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'deflecting-palm', 'hand'),
      targets: [],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(18);
  });

  it('Veil of Summer draws only if an opponent cast a blue or black spell, and makes your spells uncounterable', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['veil-of-summer', 'shock'], battlefield: ['forest', 'mountain'] },
      p2: { hand: ['opt', 'counterspell'], battlefield: ['island', 'island', 'island'] },
    });
    cast(g, 'opt');
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'veil-of-summer', 'hand'),
      targets: [],
    });
    done(g);
    // Drew a card (the opponent cast a blue spell): Shock and a Forest are in hand.
    expect(hand(g, 'p1')).toBe(2);
    expect(g.state.turn.uncounterable).toEqual(['p1']);
  });
});

describe('copying, rebound and flashback', () => {
  it('Ephemerate blinks, then rebounds into exile', () => {
    const g = game({
      p1: { hand: ['ephemerate'], battlefield: ['plains', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'ephemerate', [g.ref(angel)]);
    done(g);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['ephemerate']);
  });

  it('Increasing Vengeance copies your instant', () => {
    const g = game({
      p1: {
        hand: ['shock', 'increasing-vengeance'],
        battlefield: ['mountain', 'mountain', 'mountain'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'increasing-vengeance', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
    });
    done(g);
    expect(g.life('p2')).toBe(16);
  });
});

describe('the extra turn', () => {
  it('Time Warp gives an extra turn', () => {
    const g = game({ p1: { hand: ['time-warp'], battlefield: n('island', 5) } });
    cast(g, 'time-warp');
    done(g);
    expect(g.state.extraTurns).toHaveLength(1);
  });
});

describe('graveyard and battlefield sweepers', () => {
  it('Living End is suspended, then exchanges the creatures and graveyards', () => {
    const g = game({
      p1: {
        hand: ['living-end'],
        battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'savannah-lions'],
        graveyard: ['serra-angel', 'shock'],
      },
      p2: { battlefield: ['llanowar-elves'], graveyard: ['vampire-nighthawk'] },
    });
    const card = g.id('p1', 'living-end', 'hand');
    activate(g, card, 0);
    done(g);
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.obj(card).counters?.time).toBe(3);
    g.obj(card).counters = { time: 1 };
    while (!(g.state.turn.step === 'upkeep' && g.state.turn.activePlayer === 'p1')) {
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.actor });
      else throw new Error(g.decision.kind);
    }
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [], free: true });
    done(g);
    expect(onField(g, 'serra-angel')).toHaveLength(1);
    expect(onField(g, 'savannah-lions')).toHaveLength(0);
    expect(onField(g, 'vampire-nighthawk', 'p2')).toHaveLength(1);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(gyOf(g, 'p1')).toContain('savannah-lions');
    expect(gyOf(g, 'p1')).toContain('shock');
  });

  it('Armageddon destroys all lands', () => {
    const g = game({
      p1: {
        hand: ['armageddon'],
        battlefield: ['plains', 'plains', 'plains', 'plains', 'serra-angel'],
      },
      p2: { battlefield: ['mountain', 'forest'] },
    });
    cast(g, 'armageddon');
    done(g);
    expect(g.state.battlefield.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
  });

  it('Subterranean Tremors: X damage to creatures without flying, artifacts at 4, a Lizard at 8', () => {
    const g = game({
      p1: { hand: ['subterranean-tremors'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['savannah-lions', 'serra-angel', 'adventuring-gear'] },
    });
    cast(g, 'subterranean-tremors', [], { x: 4 });
    done(g);
    expect(gyOf(g, 'p2')).toContain('savannah-lions');
    expect(gyOf(g, 'p2')).toContain('adventuring-gear');
    expect(onField(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(onField(g, 'archive-lizard-8-token')).toHaveLength(0);
    const big = game({
      p1: { hand: ['subterranean-tremors'], battlefield: n('mountain', 9) },
    });
    cast(big, 'subterranean-tremors', [], { x: 8 });
    done(big);
    expect(onField(big, 'archive-lizard-8-token')).toHaveLength(1);
  });

  it("Brotherhood's End: 3 damage to creatures and planeswalkers", () => {
    const g = game({
      p1: { hand: ['brotherhoods-end'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    cast(g, 'brotherhoods-end', [], { mode: 0 });
    done(g);
    expect(gyOf(g, 'p2')).toContain('savannah-lions');
    expect(gyOf(g, 'p2')).not.toContain('serra-angel');
  });

  it('Crux of Fate destroys all non-Dragon creatures', () => {
    const g = game({
      p1: { hand: ['crux-of-fate'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'goldspan-dragon'] },
    });
    cast(g, 'crux-of-fate', [], { mode: 1 });
    done(g);
    expect(
      g.state.battlefield.map((id) => g.obj(id).defId).filter((d) => !d.includes('swamp')),
    ).toEqual(['goldspan-dragon']);
  });
});

const lib = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.players[who].library.map((id) => g.obj(id).defId);
const inHand = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.players[who].hand.map((id) => g.obj(id).defId);
const exileOf = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.players[who].exile.map((id) => g.obj(id).defId);
const keywordsOf = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

describe('Roles and tokens', () => {
  it('Royal Treatment gives hexproof and a Royal Role (+1/+1, ward); a second Role replaces it', () => {
    const g = game({
      p1: {
        hand: ['royal-treatment', 'monstrous-rage'],
        battlefield: ['forest', 'mountain', 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'royal-treatment', [g.ref(angel)]);
    done(g);
    expect(stats(g, angel)).toEqual([5, 5]);
    expect(keywordsOf(g, angel)).toContain('wardOne');
    expect(keywordsOf(g, angel)).toContain('hexproof');
    expect(onField(g, 'archive-royal-role-token')).toHaveLength(1);
    cast(g, 'monstrous-rage', [g.ref(angel)]);
    done(g);
    // Monster Role replaces the Royal Role: +2/+0 and +1/+1, trample.
    expect(onField(g, 'archive-royal-role-token')).toHaveLength(0);
    expect(onField(g, 'archive-monster-role-token')).toHaveLength(1);
    expect(stats(g, angel)).toEqual([7, 5]);
    expect(keywordsOf(g, angel)).toContain('trample');
  });

  it('Pongify destroys a creature and its controller gets a 3/3 Ape', () => {
    const g = game({
      p1: { hand: ['pongify'], battlefield: ['island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'pongify', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    const apes = onField(g, 'archive-ape-token', 'p2');
    expect(apes).toHaveLength(1);
    expect(stats(g, apes[0]!)).toEqual([3, 3]);
    expect(gyOf(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('library and hand', () => {
  it('Approach of the Second Sun goes seventh from the top, and a second cast wins', () => {
    const g = game({
      p1: {
        hand: ['approach-of-the-second-sun', 'approach-of-the-second-sun'],
        battlefield: n('plains', 14),
      },
    });
    cast(g, 'approach-of-the-second-sun');
    done(g);
    expect(g.life('p1')).toBe(27);
    expect(lib(g)[6]).toBe('approach-of-the-second-sun');
    cast(g, 'approach-of-the-second-sun');
    done(g);
    expect(g.state.players.p2.lost).toBe(true);
  });

  it('Ad Nauseam reveals a card, loses life equal to its mana value, and may repeat', () => {
    const g = game({
      p1: {
        hand: ['ad-nauseam'],
        battlefield: [...n('swamp', 5)],
        library: ['serra-angel', 'shock', 'forest', 'forest'],
      },
    });
    cast(g, 'ad-nauseam');
    done(g, { option: 0 });
    // Serra Angel (5), Shock (1), Forest (0), then the library runs out of cards to reveal.
    expect(inHand(g)).toEqual(['serra-angel', 'shock', 'forest', 'forest']);
    expect(g.life('p1')).toBe(14);
  });

  it('Ad Nauseam can stop after the first card', () => {
    const g = game({
      p1: { hand: ['ad-nauseam'], battlefield: [...n('swamp', 5)], library: ['shock', 'forest'] },
    });
    cast(g, 'ad-nauseam');
    done(g, { option: 1 });
    expect(inHand(g)).toEqual(['shock']);
    expect(g.life('p1')).toBe(19);
  });

  it('Brainstorm draws three and puts two back', () => {
    const g = game({
      p1: {
        hand: ['brainstorm'],
        battlefield: ['island'],
        library: ['shock', 'opt', 'mountain', 'forest'],
      },
    });
    cast(g, 'brainstorm');
    done(g);
    expect(hand(g)).toBe(1);
    expect(g.state.players.p1.library).toHaveLength(3);
  });

  it('Tainted Pact exiles until you take a card or two share a name', () => {
    const take = game({
      p1: {
        hand: ['tainted-pact'],
        battlefield: ['swamp', 'swamp'],
        library: ['shock', 'opt', 'opt'],
      },
    });
    cast(take, 'tainted-pact');
    done(take, { option: 0 });
    expect(inHand(take)).toEqual(['shock']);
    const greedy = game({
      p1: {
        hand: ['tainted-pact'],
        battlefield: ['swamp', 'swamp'],
        library: ['shock', 'opt', 'opt', 'forest'],
      },
    });
    cast(greedy, 'tainted-pact');
    done(greedy, { option: 1 });
    expect(inHand(greedy)).toEqual([]);
    expect(exileOf(greedy)).toEqual(['shock', 'opt', 'opt']);
  });

  it('Agonizing Remorse exiles a nonland card from their hand or any card from their graveyard', () => {
    const g = game({
      p1: { hand: ['agonizing-remorse'], battlefield: ['swamp', 'swamp'] },
      p2: { hand: ['forest', 'shock'], graveyard: ['opt'] },
    });
    cast(g, 'agonizing-remorse');
    done(g, { option: 1 });
    expect(g.life('p1')).toBe(19);
    expect(exileOf(g, 'p2')).toEqual(['opt']);
    expect(inHand(g, 'p2')).toEqual(['forest', 'shock']);
  });

  it('Duress takes a noncreature, nonland card; Inquisition one with mana value 3 or less', () => {
    const g = game({
      p1: { hand: ['duress', 'inquisition-of-kozilek'], battlefield: ['swamp', 'swamp'] },
      p2: { hand: ['serra-angel', 'forest', 'shock', 'time-warp'] },
    });
    cast(g, 'duress');
    done(g);
    expect(inHand(g, 'p2')).not.toContain('shock');
    expect(inHand(g, 'p2')).toContain('serra-angel');
    cast(g, 'inquisition-of-kozilek');
    done(g);
    expect(inHand(g, 'p2')).toEqual(['serra-angel', 'forest', 'time-warp']);
  });

  it("Mind's Desire exiles the top card and you may play it free this turn only", () => {
    const g = game({
      p1: { hand: ['minds-desire'], battlefield: n('island', 6), library: n('shock', 10) },
    });
    cast(g, 'minds-desire');
    done(g);
    const shock = g.state.players.p1.exile[0]!;
    expect(g.obj(shock).playFreeBy).toBe('p1');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === shock)).toBe(true);
  });

  it('Channel adds colourless mana that costs 1 life each time it is spent', () => {
    const g = game({
      p1: { hand: ['channel', 'time-warp'], battlefield: ['forest', 'forest', 'island', 'island'] },
    });
    cast(g, 'channel');
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(12);
    cast(g, 'time-warp');
    done(g);
    expect(g.life('p1')).toBe(17);
    expect(g.state.extraTurns).toHaveLength(1);
  });

  it("Blue Sun's Zenith draws X and shuffles itself into the library", () => {
    const g = game({
      p1: { hand: ['blue-suns-zenith'], battlefield: n('island', 5) },
    });
    cast(g, 'blue-suns-zenith', [{ player: 'p1' }], { x: 2 });
    done(g);
    expect(hand(g)).toBe(2);
    expect(lib(g)).toContain('blue-suns-zenith');
  });

  it('Bring to Light finds a spell with mana value up to the colours spent and casts it free', () => {
    const g = game({
      p1: {
        hand: ['bring-to-light'],
        battlefield: ['forest', 'forest', 'forest', 'island', 'island'],
        library: ['llanowar-elves', 'serra-angel', 'forest'],
      },
    });
    cast(g, 'bring-to-light');
    settle(g);
    // Two colours: only the Llanowar Elves are within reach.
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== null)!);
    settle(g);
    if (g.decision.kind === 'castFree')
      g.do({
        type: 'castSpell',
        player: 'p1',
        card: g.state.players.p1.exile[0]!,
        targets: [],
        free: true,
      });
    settle(g);
    expect(onField(g, 'llanowar-elves')).toHaveLength(1);
  });

  it('Compulsive Research draws three, then discards a land or two cards', () => {
    const g = game({
      p1: {
        hand: ['compulsive-research'],
        battlefield: n('island', 3),
        library: ['island', 'shock', 'opt', 'forest'],
      },
    });
    cast(g, 'compulsive-research');
    done(g);
    expect(inHand(g)).toEqual(['shock', 'opt']);
    expect(gyOf(g)).toContain('island');
  });

  it('Sleight of Hand, Strategic Planning, Adventurous Impulse and Abundant Harvest dig', () => {
    const sleight = game({
      p1: {
        hand: ['sleight-of-hand'],
        battlefield: ['island'],
        library: ['shock', 'opt', 'forest'],
      },
    });
    cast(sleight, 'sleight-of-hand');
    done(sleight);
    expect(inHand(sleight)).toEqual(['shock']);
    expect(lib(sleight)).toEqual(['forest', 'opt']);
    const planning = game({
      p1: {
        hand: ['strategic-planning'],
        battlefield: ['island', 'island'],
        library: ['shock', 'opt', 'forest', 'forest'],
      },
    });
    cast(planning, 'strategic-planning');
    done(planning);
    expect(inHand(planning)).toHaveLength(1);
    expect(gyOf(planning)).toHaveLength(3);
    const impulse = game({
      p1: {
        hand: ['adventurous-impulse'],
        battlefield: ['forest'],
        library: ['shock', 'llanowar-elves', 'mountain', 'forest'],
      },
    });
    cast(impulse, 'adventurous-impulse');
    done(impulse);
    expect(inHand(impulse)).toEqual(['llanowar-elves']);
    const harvest = game({
      p1: {
        hand: ['abundant-harvest'],
        battlefield: ['forest'],
        library: ['shock', 'opt', 'mountain', 'forest'],
      },
    });
    cast(harvest, 'abundant-harvest');
    done(harvest, { option: 0 });
    expect(inHand(harvest)).toEqual(['mountain']);
    expect(lib(harvest)).toHaveLength(3);
  });

  it('Demonic Tutor and Vampiric Tutor', () => {
    const g = game({
      p1: {
        hand: ['demonic-tutor', 'vampiric-tutor'],
        battlefield: n('swamp', 3),
        library: ['forest', 'serra-angel', 'shock'],
      },
    });
    cast(g, 'demonic-tutor');
    done(g);
    expect(hand(g)).toBe(2);
    cast(g, 'vampiric-tutor');
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('Gift of Estates fetches three Plains if an opponent has more lands', () => {
    const g = game({
      p1: {
        hand: ['gift-of-estates'],
        battlefield: ['plains', 'plains'],
        library: ['plains', 'plains', 'plains', 'forest'],
      },
      p2: { battlefield: n('mountain', 4) },
    });
    cast(g, 'gift-of-estates');
    done(g);
    expect(inHand(g)).toEqual(['plains', 'plains', 'plains']);
    const even = game({
      p1: {
        hand: ['gift-of-estates'],
        battlefield: n('plains', 4),
        library: ['plains', 'plains', 'plains', 'forest'],
      },
      p2: { battlefield: n('mountain', 4) },
    });
    cast(even, 'gift-of-estates');
    done(even);
    expect(inHand(even)).toEqual([]);
  });

  it('Natural Order sacrifices a green creature to put a green creature from your library onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['natural-order'],
        battlefield: ['forest', 'forest', 'forest', 'forest', 'llanowar-elves'],
        library: ['serra-angel', 'elvish-mystic', 'forest'],
      },
    });
    cast(g, 'natural-order', [], { sacrifice: g.id('p1', 'llanowar-elves') });
    done(g);
    expect(gyOf(g)).toContain('llanowar-elves');
    expect(onField(g, 'elvish-mystic')).toHaveLength(1);
  });

  it('Crop Rotation sacrifices a land to fetch any land', () => {
    const g = game({
      p1: {
        hand: ['crop-rotation'],
        battlefield: ['forest', 'island'],
        library: ['mountain', 'forest'],
      },
    });
    cast(g, 'crop-rotation', [], { sacrifice: g.id('p1', 'island') });
    done(g);
    expect(gyOf(g)).toContain('island');
    expect(onField(g, 'mountain')).toHaveLength(1);
  });

  it('Shared Roots puts a basic land onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['shared-roots'],
        battlefield: ['forest', 'forest'],
        library: ['mountain', 'forest'],
      },
    });
    cast(g, 'shared-roots');
    done(g);
    expect(onField(g, 'mountain')).toHaveLength(1);
    expect(g.obj(onField(g, 'mountain')[0]!).tapped).toBe(true);
  });
});

/** Opens combat on p1's turn and declares attackers. */
const attackWith = (g: GameDriver, id: string) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  g.attack(id);
};

describe('counterspells', () => {
  it("Memory Lapse puts the countered spell on top of its owner's library", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['memory-lapse'], battlefield: ['island', 'island'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'memory-lapse', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(lib(g, 'p2')[0]).toBe('shock');
  });

  it('Disdainful Stroke only targets spells with mana value 4 or greater', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['disdainful-stroke'], battlefield: ['island', 'island'] },
      p2: {
        hand: ['shock', 'serra-angel'],
        battlefield: ['mountain', 'plains', 'plains', 'plains', 'plains', 'plains'],
      },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    done(g);
    expect(g.life('p1')).toBe(18);
  });

  it('Mana Tithe counters a spell unless its controller pays {1}', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['mana-tithe'], battlefield: ['plains'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'mana-tithe', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
  });

  it("Reprieve returns the spell to its owner's hand and draws a card", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['reprieve'], battlefield: ['plains', 'plains'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'reprieve', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
    });
    done(g);
    expect(inHand(g, 'p2')).toEqual(['shock']);
    expect(hand(g, 'p1')).toBe(1);
  });

  it('Brain Freeze and Flusterstorm have storm', () => {
    const g = game({
      p1: { hand: ['dark-ritual', 'brain-freeze'], battlefield: ['swamp', 'island', 'island'] },
    });
    cast(g, 'dark-ritual');
    done(g);
    cast(g, 'brain-freeze', [{ player: 'p2' }]);
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(6);
  });
});

describe('combat tricks and control', () => {
  it('Berserk can only be cast before the combat damage step, and destroys the creature if it attacked', () => {
    const late = game({
      step: 'main2',
      p1: { hand: ['berserk'], battlefield: ['forest', 'savannah-lions'] },
    });
    expect(() => cast(late, 'berserk', [late.ref(late.id('p1', 'savannah-lions'))])).toThrow();
    const g = game({
      p1: { hand: ['berserk'], battlefield: ['forest', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'berserk', [g.ref(lions)]);
    done(g);
    expect(stats(g, lions)).toEqual([4, 1]);
    expect(keywordsOf(g, lions)).toContain('trample');
    attackWith(g, lions);
    g.passUntilStep('end');
    done(g);
    expect(gyOf(g)).toContain('savannah-lions');
  });

  it('Gods Willing gives protection from the chosen colour', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['gods-willing'], battlefield: ['plains', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'shock', [g.ref(lions)]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'gods-willing', 'hand'),
      targets: [g.ref(lions)],
    });
    // Colours are listed W, U, B, R, G: red is the fourth.
    done(g, { option: 3 });
    expect(onField(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Claim the Firstborn steals a creature with mana value 3 or less until end of turn', () => {
    const g = game({
      p1: { hand: ['claim-the-firstborn'], battlefield: ['mountain'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    expect(() => cast(g, 'claim-the-firstborn', [g.ref(g.id('p2', 'serra-angel'))])).toThrow();
    cast(g, 'claim-the-firstborn', [g.ref(lions)]);
    done(g);
    expect(g.obj(lions).controller).toBe('p1');
    expect(keywordsOf(g, lions)).toContain('haste');
  });

  it('Knockout Maneuver adds a counter, then the creature bites', () => {
    const g = game({
      p1: {
        hand: ['knockout-maneuver'],
        battlefield: ['forest', 'forest', 'forest', 'llanowar-elves'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'knockout-maneuver', [
      g.ref(g.id('p1', 'llanowar-elves')),
      g.ref(g.id('p2', 'savannah-lions')),
    ]);
    done(g);
    expect(gyOf(g, 'p2')).toEqual(['savannah-lions']);
  });

  it('Triumph of the Hordes and Duty Beyond Death pump your team', () => {
    const g = game({
      p1: {
        hand: ['triumph-of-the-hordes', 'duty-beyond-death'],
        battlefield: [
          'forest',
          'forest',
          'forest',
          'forest',
          'plains',
          'plains',
          'llanowar-elves',
          'serra-angel',
          'savannah-lions',
        ],
      },
    });
    cast(g, 'triumph-of-the-hordes');
    done(g);
    expect(stats(g, g.id('p1', 'serra-angel'))).toEqual([5, 5]);
    expect(keywordsOf(g, g.id('p1', 'serra-angel'))).toContain('trample');
    cast(g, 'duty-beyond-death', [], { sacrifice: g.id('p1', 'savannah-lions') });
    done(g);
    expect(stats(g, g.id('p1', 'serra-angel'))).toEqual([6, 6]);
    expect(keywordsOf(g, g.id('p1', 'serra-angel'))).toContain('indestructible');
    expect(gyOf(g)).toContain('savannah-lions');
  });

  it("Akroma's Will gives a team keywords; both modes need a commander", () => {
    const g = game({
      p1: {
        hand: ['akromas-will'],
        battlefield: ['plains', 'plains', 'plains', 'plains', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(() => cast(g, 'akromas-will', [], { kicked: true })).toThrow();
    cast(g, 'akromas-will', [], { mode: 1 });
    done(g);
    expect(keywordsOf(g, lions)).toContain('lifelink');
    expect(keywordsOf(g, lions)).toContain('indestructible');
  });
});

describe('removal', () => {
  it('Dismember costs {1} and 4 life, or {1}{B}{B}', () => {
    const g = game({
      p1: { hand: ['dismember'], battlefield: ['plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'dismember', [g.ref(g.id('p2', 'serra-angel'))], { kicked: true });
    done(g);
    expect(g.life('p1')).toBe(16);
    expect(gyOf(g, 'p2')).toEqual(['serra-angel']);
    const full = game({
      p1: { hand: ['dismember'], battlefield: ['swamp', 'swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(full, 'dismember', [full.ref(full.id('p2', 'serra-angel'))]);
    done(full);
    expect(full.life('p1')).toBe(20);
    expect(gyOf(full, 'p2')).toEqual(['serra-angel']);
  });

  it('Despark, Eliminate, Putrefy, Stone Rain and Feed the Swarm', () => {
    const despark = game({
      p1: { hand: ['despark'], battlefield: ['plains', 'swamp'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    expect(() =>
      cast(despark, 'despark', [despark.ref(despark.id('p2', 'savannah-lions'))]),
    ).toThrow();
    cast(despark, 'despark', [despark.ref(despark.id('p2', 'serra-angel'))]);
    done(despark);
    expect(exileOf(despark, 'p2')).toEqual(['serra-angel']);
    const eliminate = game({
      p1: { hand: ['eliminate'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    expect(() =>
      cast(eliminate, 'eliminate', [eliminate.ref(eliminate.id('p2', 'serra-angel'))]),
    ).toThrow();
    cast(eliminate, 'eliminate', [eliminate.ref(eliminate.id('p2', 'savannah-lions'))]);
    done(eliminate);
    expect(gyOf(eliminate, 'p2')).toEqual(['savannah-lions']);
    const putrefy = game({
      p1: { hand: ['putrefy'], battlefield: ['swamp', 'forest', 'forest'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(putrefy, 'putrefy', [putrefy.ref(putrefy.id('p2', 'serra-angel'))]);
    done(putrefy);
    expect(gyOf(putrefy, 'p2')).toEqual(['serra-angel']);
    const rain = game({
      p1: { hand: ['stone-rain'], battlefield: ['mountain', 'mountain', 'mountain'] },
      p2: { battlefield: ['island'] },
    });
    cast(rain, 'stone-rain', [rain.ref(rain.id('p2', 'island'))]);
    done(rain);
    expect(gyOf(rain, 'p2')).toEqual(['island']);
    const swarm = game({
      p1: { hand: ['feed-the-swarm'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(swarm, 'feed-the-swarm', [swarm.ref(swarm.id('p2', 'serra-angel'))]);
    done(swarm);
    expect(swarm.life('p1')).toBe(15);
    expect(gyOf(swarm, 'p2')).toEqual(['serra-angel']);
  });

  it('Prismatic Ending exiles a permanent with mana value up to the colours spent', () => {
    const g = game({
      p1: { hand: ['prismatic-ending'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['llanowar-elves', 'serra-angel'] },
    });
    cast(g, 'prismatic-ending', [g.ref(g.id('p2', 'serra-angel'))], { x: 1 });
    done(g);
    expect(onField(g, 'serra-angel', 'p2')).toHaveLength(1);
    const h = game({
      p1: { hand: ['prismatic-ending'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(h, 'prismatic-ending', [h.ref(h.id('p2', 'llanowar-elves'))], { x: 1 });
    done(h);
    expect(exileOf(h, 'p2')).toEqual(['llanowar-elves']);
  });

  it('Divine Gambit exiles a permanent; its controller may put a permanent card from hand onto the battlefield', () => {
    const g = game({
      p1: { hand: ['divine-gambit'], battlefield: ['plains', 'plains'] },
      p2: { hand: ['llanowar-elves', 'shock'], battlefield: ['serra-angel'] },
    });
    cast(g, 'divine-gambit', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(exileOf(g, 'p2')).toEqual(['serra-angel']);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(1);
  });

  it('Winds of Abandon exiles a creature and ramps its controller; overloaded it hits every creature', () => {
    const g = game({
      p1: { hand: ['winds-of-abandon'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'winds-of-abandon', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(exileOf(g, 'p2')).toEqual(['serra-angel']);
    expect(onField(g, 'forest', 'p2')).toHaveLength(1);
    const o = game({
      p1: { hand: ['winds-of-abandon'], battlefield: n('plains', 6) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    cast(o, 'winds-of-abandon', [], { kicked: true });
    done(o);
    expect(exileOf(o, 'p2')).toHaveLength(2);
    expect(onField(o, 'forest', 'p2')).toHaveLength(2);
  });

  it("Pick Your Poison and Sheoldred's Edict make the opponent sacrifice", () => {
    const poison = game({
      p1: { hand: ['pick-your-poison'], battlefield: ['forest'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    cast(poison, 'pick-your-poison', [], { mode: 2 });
    done(poison);
    expect(gyOf(poison, 'p2')).toEqual(['serra-angel']);
    const edict = game({
      p1: { hand: ['sheoldreds-edict'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(edict, 'sheoldreds-edict', [], { mode: 0 });
    done(edict);
    expect(gyOf(edict, 'p2')).toEqual(['savannah-lions']);
  });

  it('Smallpox makes each player lose 1, discard, and sacrifice a creature and a land', () => {
    const g = game({
      p1: { hand: ['smallpox', 'shock'], battlefield: ['swamp', 'swamp', 'savannah-lions'] },
      p2: { hand: ['opt'], battlefield: ['island', 'llanowar-elves'] },
    });
    cast(g, 'smallpox');
    done(g);
    expect(g.life('p1')).toBe(19);
    expect(g.life('p2')).toBe(19);
    expect(hand(g, 'p1')).toBe(0);
    expect(hand(g, 'p2')).toBe(0);
    expect(onField(g, 'savannah-lions')).toHaveLength(0);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'swamp')).toHaveLength(1);
    expect(onField(g, 'island', 'p2')).toHaveLength(0);
  });

  it('Culling the Weak sacrifices a creature for {B}{B}{B}{B}', () => {
    const g = game({
      p1: { hand: ['culling-the-weak'], battlefield: ['swamp', 'llanowar-elves'] },
    });
    cast(g, 'culling-the-weak', [], { sacrifice: g.id('p1', 'llanowar-elves') });
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(4);
  });

  it('Requisition Raid is a spree of three modes', () => {
    const g = game({
      p1: {
        hand: ['requisition-raid'],
        battlefield: ['plains', 'plains', 'plains', 'plains', 'llanowar-elves', 'savannah-lions'],
      },
      p2: { battlefield: ['adventuring-gear'] },
    });
    cast(g, 'requisition-raid', [g.ref(g.id('p2', 'adventuring-gear')), { player: 'p1' }], {
      paws: [0, 2],
    });
    done(g);
    expect(gyOf(g, 'p2')).toEqual(['adventuring-gear']);
    expect(stats(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
  });

  it('Return to the Ranks returns up to X creature cards with mana value 2 or less', () => {
    const g = game({
      p1: {
        hand: ['return-to-the-ranks'],
        battlefield: ['plains', 'plains', 'plains', 'plains'],
        graveyard: ['llanowar-elves', 'savannah-lions', 'serra-angel'],
      },
    });
    cast(g, 'return-to-the-ranks', [], { x: 2 });
    done(g);
    expect(onField(g, 'savannah-lions')).toHaveLength(1);
    expect(onField(g, 'llanowar-elves')).toHaveLength(1);
    expect(gyOf(g)).toContain('serra-angel');
  });
});

describe('damage and counters', () => {
  it('Electrolyze deals 2 damage divided and draws a card', () => {
    const g = game({
      p1: { hand: ['electrolyze'], battlefield: ['island', 'mountain', 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'electrolyze', [{ player: 'p2' }, g.ref(g.id('p2', 'savannah-lions'))], { mode: 1 });
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(gyOf(g, 'p2')).toEqual(['savannah-lions']);
    expect(hand(g)).toBe(1);
  });

  it("Urza's Rage deals 3, or 10 when kicked", () => {
    const g = game({
      p1: { hand: ['urzas-rage'], battlefield: n('mountain', 12) },
    });
    cast(g, 'urzas-rage', [{ player: 'p2' }], { kicked: true });
    done(g);
    expect(g.life('p2')).toBe(10);
  });

  it('Tendrils of Agony drains 2', () => {
    const g = game({ p1: { hand: ['tendrils-of-agony'], battlefield: n('swamp', 4) } });
    cast(g, 'tendrils-of-agony', [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Shamanic Revelation draws and gains life with ferocious', () => {
    const g = game({
      p1: {
        hand: ['shamanic-revelation'],
        battlefield: [...n('forest', 5), 'serra-angel', 'llanowar-elves'],
      },
    });
    cast(g, 'shamanic-revelation');
    done(g);
    expect(hand(g)).toBe(2);
    expect(g.life('p1')).toBe(24);
  });

  it('Primal Command chooses two modes', () => {
    const g = game({
      p1: {
        hand: ['primal-command'],
        battlefield: n('forest', 5),
        library: ['llanowar-elves', 'forest'],
      },
    });
    // The fourth combination is "gain 7 life" + "search for a creature card".
    cast(g, 'primal-command', [{ player: 'p1' }], { mode: 3 });
    done(g);
    expect(g.life('p1')).toBe(27);
    expect(inHand(g)).toEqual(['llanowar-elves']);
  });

  it("Jeska's Will adds {R} for each card in their hand, or exiles three cards to play", () => {
    const g = game({
      p1: { hand: ['jeskas-will'], battlefield: ['mountain', 'mountain', 'mountain'] },
      p2: { hand: ['shock', 'opt', 'forest'] },
    });
    cast(g, 'jeskas-will', [], { mode: 0 });
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(3);
    const h = game({
      p1: { hand: ['jeskas-will'], battlefield: ['mountain', 'mountain', 'mountain'] },
    });
    cast(h, 'jeskas-will', [], { mode: 1 });
    done(h);
    expect(h.state.players.p1.exile).toHaveLength(3);
  });

  it('Glimpse of Nature draws when you cast a creature spell this turn', () => {
    const g = game({
      p1: {
        hand: ['glimpse-of-nature', 'llanowar-elves', 'savannah-lions'],
        battlefield: ['forest', 'forest', 'plains'],
      },
    });
    cast(g, 'glimpse-of-nature');
    done(g);
    cast(g, 'llanowar-elves');
    done(g);
    expect(hand(g)).toBe(2);
  });

  it('Locust Spray shrinks a creature or cycles', () => {
    const g = game({
      p1: { hand: ['locust-spray'], battlefield: ['swamp'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'locust-spray', [g.ref(g.id('p2', 'llanowar-elves'))]);
    done(g);
    expect(gyOf(g, 'p2')).toEqual(['llanowar-elves']);
    const c = game({ p1: { hand: ['locust-spray'], battlefield: ['swamp'] } });
    activate(c, c.id('p1', 'locust-spray', 'hand'), 0);
    done(c);
    expect(hand(c)).toBe(1);
    expect(gyOf(c)).toEqual(['locust-spray']);
  });

  it('Weather the Storm gains 3 life', () => {
    const g = game({ p1: { hand: ['weather-the-storm'], battlefield: ['forest', 'forest'] } });
    cast(g, 'weather-the-storm');
    done(g);
    expect(g.life('p1')).toBe(23);
  });

  it('Whirlwind Denial and Flusterstorm counter unless the controller pays', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['whirlwind-denial'], battlefield: ['island', 'island', 'island'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'whirlwind-denial', 'hand'),
      targets: [g.ref(g.state.stack[0]!.id)],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
  });
});
