import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, deckById, deckGameOptions, deckIds, isPlayable, SCRYFALL } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14a: Witherbloom Pest Control (B/G).

const PEST = 'sos-pest-token';
const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gainedLife = (g: GameDriver, amount: number) => {
  g.state.turn.lifeGains.p1 += 1;
  g.state.turn.lifeGained = { p1: amount, p2: 0 };
};
const activate = (g: GameDriver, source: string, index = 0) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
  } as never);
/** Resolves the stack, taking the first target / declining optional choices. */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept: true });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'discard')
      g.do({ type: 'discard', player: d.player, card: g.state.players[d.player].hand[0]! });
    else break;
  }
  return g;
}

/** Passes to p1's end step, resolving triggers on the way. */
function toEnd(g: GameDriver): void {
  for (
    let i = 0;
    i < 80 && !(g.state.turn.step === 'end' && g.state.stack.length === 0 && i > 0);
    i++
  ) {
    if (g.decision.kind === 'chooseTriggerTargets') settle(g);
    else if (g.decision.kind === 'priority') g.pass();
    else if (g.decision.kind === 'declareAttackers')
      g.do({ type: 'confirmAttackers', player: g.decision.player });
    else if (g.decision.kind === 'declareBlockers')
      g.do({ type: 'confirmBlockers', player: g.decision.player });
    else throw new Error('stuck: ' + g.decision.kind);
    if (g.state.turn.step === 'end' && g.state.stack.length) done(g);
  }
  done(g);
}

describe('the deck', () => {
  const d = deckById('sos-witherbloom-pest-control');
  it('is 60 cards with 24 lands, playable, mostly SOS', () => {
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    const ids = deckIds(d);
    expect(ids.filter((id) => cardDb.get(id)?.types.includes('Land'))).toHaveLength(24);
    const sos = new Set(SCRYFALL.filter((c) => c.set === 'sos').map((c) => c.name));
    const spells = ids.filter((id) => !cardDb.get(id)!.types.includes('Land'));
    expect(spells.filter((id) => sos.has(cardDb.get(id)!.name)).length).toBeGreaterThanOrEqual(30);
  });

  it('plays full random games', () => {
    const engine = createEngine(cardDb);
    const other = deckById('stx-quandrix-equation');
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ ...deckGameOptions(seed % 2 ? d : other, seed % 2 ? other : d), seed }),
        seed * 7919,
      );
      expect(r.truncated).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});

describe('prepare', () => {
  it('Lluwen enters prepared; its Pest Friend copy makes a Pest that gains life when it attacks', () => {
    const g = game({
      p1: { hand: ['lluwen-exchange-student'], battlefield: n('forest', 3).concat(n('swamp', 3)) },
    });
    settle(cast(g, 'lluwen-exchange-student'));
    const [lluwen] = all(g, 'lluwen-exchange-student');
    const copy = g.obj(lluwen!).prepared!;
    expect(copy).toBeDefined();
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    settle(g);
    expect(g.obj(lluwen!).prepared).toBeUndefined();
    expect(all(g, PEST)).toHaveLength(1);
    expect(chars(g, all(g, PEST)[0]!).subtypes).toContain('Pest');
  });

  it('Lluwen exiles a creature card from the graveyard to become prepared again, only when unprepared', () => {
    const g = game({
      p1: {
        battlefield: ['lluwen-exchange-student'],
        graveyard: ['mindful-biomancer', 'mindful-biomancer'],
      },
    });
    const lluwen = g.id('p1', 'lluwen-exchange-student');
    // Not entered by casting here, so it isn't prepared.
    activate(g, lluwen);
    settle(g);
    expect(g.obj(lluwen).prepared).toBeDefined();
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === lluwen)).toBe(false);
  });

  it('Leech Collector becomes prepared on your first life gain each turn; Bloodletting drains 2', () => {
    const g = game({
      p1: {
        hand: ['oracles-restoration'],
        battlefield: ['leech-collector', 'mindful-biomancer', 'forest', 'swamp'],
      },
    });
    const collector = g.id('p1', 'leech-collector');
    expect(g.obj(collector).prepared).toBeUndefined();
    cast(g, 'oracles-restoration', [g.ref(g.id('p1', 'mindful-biomancer'))]);
    done(g);
    const copy = g.obj(collector).prepared!;
    expect(copy).toBeDefined();
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.obj(collector).prepared).toBeUndefined();
  });
});

describe('infusion', () => {
  it('Old-Growth Educator gets two counters only if you gained life this turn', () => {
    const a = game({
      p1: { hand: ['old-growth-educator'], battlefield: n('forest', 2).concat(n('swamp', 2)) },
    });
    settle(cast(a, 'old-growth-educator'));
    expect(pt(a, a.id('p1', 'old-growth-educator'))).toEqual([4, 4]);
    const b = game({
      p1: { hand: ['old-growth-educator'], battlefield: n('forest', 2).concat(n('swamp', 2)) },
    });
    gainedLife(b, 1);
    settle(cast(b, 'old-growth-educator'));
    expect(pt(b, b.id('p1', 'old-growth-educator'))).toEqual([6, 6]);
  });

  it("Poisoner's Apprentice gives -4/-4 only after life gain", () => {
    const a = game({
      p1: { hand: ['poisoners-apprentice'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(a, 'poisoners-apprentice'));
    expect(pt(a, a.id('p2', 'serra-angel'))).toEqual([4, 4]);
    const b = game({
      p1: { hand: ['poisoners-apprentice'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    gainedLife(b, 1);
    settle(cast(b, 'poisoners-apprentice'));
    expect(all(b, 'serra-angel')).toHaveLength(0);
  });

  it('Thornfist Striker and Ulna Alley Shopkeep switch on while you gained life', () => {
    const g = game({ p1: { battlefield: ['thornfist-striker', 'ulna-alley-shopkeep'] } });
    expect(pt(g, g.id('p1', 'ulna-alley-shopkeep'))).toEqual([2, 3]);
    expect(chars(g, g.id('p1', 'ulna-alley-shopkeep')).keywords).not.toContain('trample');
    gainedLife(g, 1);
    expect(pt(g, g.id('p1', 'ulna-alley-shopkeep'))).toEqual([5, 3]);
    expect(chars(g, g.id('p1', 'ulna-alley-shopkeep')).keywords).toContain('trample');
    expect(pt(g, g.id('p1', 'thornfist-striker'))).toEqual([4, 3]);
  });

  it('Efflorescence: two counters, and trample and indestructible after life gain', () => {
    const a = game({
      p1: { hand: ['efflorescence'], battlefield: ['mindful-biomancer', ...n('forest', 3)] },
    });
    cast(a, 'efflorescence', [a.ref(a.id('p1', 'mindful-biomancer'))]);
    done(a);
    expect(pt(a, a.id('p1', 'mindful-biomancer'))).toEqual([4, 4]);
    expect(chars(a, a.id('p1', 'mindful-biomancer')).keywords).not.toContain('indestructible');
    const b = game({
      p1: { hand: ['efflorescence'], battlefield: ['mindful-biomancer', ...n('forest', 3)] },
    });
    gainedLife(b, 1);
    cast(b, 'efflorescence', [b.ref(b.id('p1', 'mindful-biomancer'))]);
    done(b);
    const kw = chars(b, b.id('p1', 'mindful-biomancer')).keywords;
    expect(kw.has('trample') && kw.has('indestructible')).toBe(true);
  });

  it('Foolish Fate destroys; the controller also loses 3 after life gain', () => {
    const g = game({
      p1: { hand: ['foolish-fate'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    gainedLife(g, 1);
    cast(g, 'foolish-fate', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.life('p2')).toBe(17);
  });

  it("Lumaret's Favor is copied on cast after life gain", () => {
    const g = game({
      p1: { hand: ['lumarets-favor'], battlefield: ['mindful-biomancer', ...n('forest', 2)] },
    });
    gainedLife(g, 1);
    cast(g, 'lumarets-favor', [g.ref(g.id('p1', 'mindful-biomancer'))]);
    done(g);
    expect(pt(g, g.id('p1', 'mindful-biomancer'))).toEqual([6, 10]);
  });

  it('Follow the Lumarets takes one creature or land, or two after life gain', () => {
    const lib = ['mindful-biomancer', 'forest', 'shock', 'shock'];
    const a = game({
      p1: { hand: ['follow-the-lumarets'], battlefield: n('forest', 2), library: lib },
    });
    cast(a, 'follow-the-lumarets');
    done(a);
    a.do({ type: 'chooseCard', player: 'p1', card: a.state.players.p1.library[0]! });
    done(a);
    expect(hand(a)).toEqual(['mindful-biomancer']);
    const b = game({
      p1: { hand: ['follow-the-lumarets'], battlefield: n('forest', 2), library: lib },
    });
    gainedLife(b, 1);
    cast(b, 'follow-the-lumarets');
    done(b);
    b.do({ type: 'chooseCard', player: 'p1', card: b.state.players.p1.library[0]! });
    expect(b.decision.kind).toBe('searchLibrary');
    b.do({ type: 'chooseCard', player: 'p1', card: b.state.players.p1.library[0]! });
    done(b);
    expect(hand(b).sort()).toEqual(['forest', 'mindful-biomancer']);
  });

  it('Moseo returns a creature card with mana value up to the life you gained at your end step', () => {
    const g = game({
      p1: {
        battlefield: ['moseo-veins-new-dean'],
        graveyard: ['serra-angel', 'mindful-biomancer'],
      },
    });
    gainedLife(g, 2);
    toEnd(g);
    expect(all(g, 'mindful-biomancer')).toHaveLength(1);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });
});

describe('life gain engines', () => {
  it('Pest Mascot and Blech grow on life gain; Blech grows Pests too', () => {
    const g = game({
      p1: {
        hand: ['bogwater-lumaret'],
        battlefield: ['pest-mascot', 'blech-loafing-pest', 'sos-pest-token', 'forest', 'swamp'],
      },
    });
    settle(cast(g, 'bogwater-lumaret'));
    // Blech's counters go on every Pest: the Mascot gets one of its own and one from Blech.
    expect(pt(g, g.id('p1', 'pest-mascot'))).toEqual([4, 5]);
    expect(pt(g, g.id('p1', 'blech-loafing-pest'))).toEqual([4, 5]);
    expect(pt(g, g.id('p1', 'sos-pest-token'))).toEqual([2, 2]);
    expect(g.life('p1')).toBe(21);
  });

  it('Essenceknit Scholar makes a Pest and draws at end step if a creature died under your control', () => {
    const g = game({
      p1: { hand: ['essenceknit-scholar'], battlefield: n('forest', 2).concat(['swamp']) },
    });
    settle(cast(g, 'essenceknit-scholar'));
    expect(all(g, PEST)).toHaveLength(1);
    g.state.turn.creaturesLost = { p1: 1, p2: 0 };
    const before = g.state.players.p1.hand.length;
    toEnd(g);
    expect(g.state.players.p1.hand.length).toBe(before + 1);
  });

  it("Teacher's Pest returns from the graveyard tapped for {B}{G}", () => {
    const g = game({ p1: { graveyard: ['teachers-pest'], battlefield: ['swamp', 'forest'] } });
    activate(g, g.id('p1', 'teachers-pest', 'graveyard'), 1);
    settle(g);
    const [pest] = all(g, 'teachers-pest');
    expect(g.obj(pest!).tapped).toBe(true);
  });

  it('Pestbrood Sloth leaves two Pests', () => {
    const g = game({
      p1: { hand: ['foolish-fate'], battlefield: ['pestbrood-sloth', ...n('swamp', 3)] },
    });
    cast(g, 'foolish-fate', [g.ref(g.id('p1', 'pestbrood-sloth'))]);
    done(g);
    expect(all(g, PEST)).toHaveLength(2);
  });
});

describe('spells', () => {
  it('Witherbloom Charm: sacrifice a permanent to draw two, gain 5, or destroy a cheap permanent', () => {
    const base = () =>
      game({
        p1: { hand: ['witherbloom-charm'], battlefield: ['mindful-biomancer', 'swamp', 'forest'] },
        p2: { battlefield: ['mindful-biomancer'] },
      });
    const a = base();
    cast(a, 'witherbloom-charm', [], { mode: 1 });
    done(a);
    expect(a.life('p1')).toBe(25);
    const b = base();
    cast(b, 'witherbloom-charm', [b.ref(b.id('p2', 'mindful-biomancer'))], { mode: 2 });
    done(b);
    expect(all(b, 'mindful-biomancer')).toHaveLength(1);
    const c = base();
    cast(c, 'witherbloom-charm', [], { mode: 0 });
    done(c);
    expect(c.decision.kind).toBe('chooseObject');
    c.do({ type: 'chooseCard', player: 'p1', card: c.id('p1', 'mindful-biomancer') } as never);
    done(c);
    expect(c.state.players.p1.hand.length).toBe(2);
  });

  it('Root Manipulation gives the team +2/+2, menace and an attack trigger that gains life', () => {
    const g = game({
      p1: {
        hand: ['root-manipulation'],
        battlefield: ['mindful-biomancer', ...n('forest', 3), ...n('swamp', 2)],
      },
    });
    cast(g, 'root-manipulation');
    done(g);
    const bears = g.id('p1', 'mindful-biomancer');
    expect(pt(g, bears)).toEqual([4, 4]);
    expect(chars(g, bears).keywords).toContain('menace');
  });

  it('Send in the Pest makes the opponent discard and gives you a Pest', () => {
    const g = game({
      p1: { hand: ['send-in-the-pest'], battlefield: n('swamp', 2) },
      p2: { hand: ['shock'] },
    });
    cast(g, 'send-in-the-pest');
    done(g);
    expect(all(g, PEST)).toHaveLength(1);
    expect(g.state.players.p2.hand.length).toBe(0);
  });

  it('Cost of Brilliance draws two, loses 2 life, and counters a creature', () => {
    const g = game({
      p1: { hand: ['cost-of-brilliance'], battlefield: ['mindful-biomancer', ...n('swamp', 3)] },
    });
    cast(g, 'cost-of-brilliance', [{ player: 'p1' }, g.ref(g.id('p1', 'mindful-biomancer'))]);
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.hand.length).toBe(2);
    expect(pt(g, g.id('p1', 'mindful-biomancer'))).toEqual([3, 3]);
  });

  it('Dissection Practice drains 1, +1/+1 and -1/-1 to the chosen creatures', () => {
    const g = game({
      p1: { hand: ['dissection-practice'], battlefield: ['mindful-biomancer', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'dissection-practice', [
      { player: 'p2' },
      g.ref(g.id('p1', 'mindful-biomancer')),
      g.ref(g.id('p2', 'serra-angel')),
    ]);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    expect(pt(g, g.id('p1', 'mindful-biomancer'))).toEqual([3, 3]);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([3, 3]);
  });

  it('Sneering Shadewriter drains 2 as it enters', () => {
    const g = game({ p1: { hand: ['sneering-shadewriter'], battlefield: n('swamp', 5) } });
    settle(cast(g, 'sneering-shadewriter'));
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Deathcap Glade enters tapped unless you control two other lands', () => {
    const a = game({ p1: { hand: ['deathcap-glade'], battlefield: ['forest'] } });
    a.do({ type: 'playLand', player: 'p1', card: a.id('p1', 'deathcap-glade', 'hand') });
    expect(a.obj(a.id('p1', 'deathcap-glade')).tapped).toBe(true);
    const b = game({ p1: { hand: ['deathcap-glade'], battlefield: ['forest', 'swamp'] } });
    b.do({ type: 'playLand', player: 'p1', card: b.id('p1', 'deathcap-glade', 'hand') });
    expect(b.obj(b.id('p1', 'deathcap-glade')).tapped).toBe(false);
  });
});
