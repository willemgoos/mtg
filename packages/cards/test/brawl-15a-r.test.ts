import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Brawl Quintorius (15a, red): rummage, graveyard play, unearth, Blood.

type G = ReturnType<typeof game>;
const castable = (g: G, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const activate = (g: G, defId: string, zone: 'battlefield' | 'graveyard' = 'battlefield') => {
  const src = g.id('p1', defId, zone);
  const a = g.legal().find((x) => x.type === 'activateAbility' && x.source === src);
  if (!a) throw new Error(`No ability on ${defId}`);
  return g.do(a);
};
/** Answers every optional effect with `accept`, and discards from the front of the hand. */
const resolveAll = (g: G, accept = true) => {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept });
    else if (d.kind === 'discard') {
      const card = g.state.players[d.player].hand[0]!;
      g.do({ type: 'discard', player: d.player, card });
    } else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else return g;
  }
  return g;
};

describe('Brawl Quintorius: red cards', () => {
  it('Big Score: discard as a cost, draw two, two Treasures', () => {
    const g = game({ p1: { hand: ['big-score', 'forest'], battlefield: n('mountain', 4) } });
    cast(g, 'big-score', [], { discard: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('forest');
    expect(handSize(g, 'p1')).toBe(2);
    expect(all(g, 'treasure-token')).toHaveLength(2);
  });

  it('Big Score and Thrill of Possibility need a card to discard', () => {
    const g = game({ p1: { hand: ['big-score', 'thrill-of-possibility'], battlefield: n('mountain', 6) } });
    // The other spell is the card to discard, so both are castable; with a lone card neither is.
    expect(castable(g, 'big-score')).toBe(true);
    const lone = game({ p1: { hand: ['thrill-of-possibility'], battlefield: n('mountain', 6) } });
    expect(castable(lone, 'thrill-of-possibility')).toBe(false);
  });

  it('Faithless Looting: loots two, then flashback from the graveyard', () => {
    const g = game({
      p1: { hand: ['faithless-looting', 'forest', 'forest'], battlefield: n('mountain', 4) },
    });
    cast(g, 'faithless-looting');
    settle(g);
    resolveAll(g);
    expect(g.state.players.p1.graveyard.length).toBeGreaterThanOrEqual(3);
    expect(castable(g, 'faithless-looting')).toBe(true);
  });

  it('Pinnacle Monk: returns an instant or sorcery from the graveyard; prowess', () => {
    const g = game({
      p1: {
        hand: ['pinnacle-monk', 'shock'],
        graveyard: ['lightning-strike'],
        battlefield: n('mountain', 7),
      },
    });
    cast(g, 'pinnacle-monk');
    settle(g);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('lightning-strike');
    const monk = g.id('p1', 'pinnacle-monk');
    expect(pt(g, monk)).toEqual([2, 2]);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(pt(g, monk)).toEqual([3, 3]);
  });

  it('Mystic Peak: the back face is a land that may cost 3 life to enter untapped', () => {
    const paid = game({ p1: { hand: ['pinnacle-monk'] } });
    const play = paid.legal().find((a) => a.type === 'playLand')!;
    expect(play.type === 'playLand' && play.back).toBe(true);
    paid.do(play);
    resolveAll(paid, true);
    const peak = paid.id('p1', 'mystic-peak');
    expect(paid.obj(peak).tapped).toBe(false);
    expect(paid.life('p1')).toBe(17);
    const tapped = game({ p1: { hand: ['pinnacle-monk'] } });
    tapped.do(tapped.legal().find((a) => a.type === 'playLand')!);
    resolveAll(tapped, false);
    expect(tapped.obj(tapped.id('p1', 'mystic-peak')).tapped).toBe(true);
    expect(tapped.life('p1')).toBe(20);
  });

  it('Enduring Courage: other creatures get +2/+0 and haste; it returns as an enchantment', () => {
    const g = game({
      p1: { hand: ['scrapwork-mutt'], battlefield: ['enduring-courage', ...n('mountain', 2)] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    cast(g, 'scrapwork-mutt');
    settle(g);
    resolveAll(g, false);
    const mutt = g.id('p1', 'scrapwork-mutt');
    expect(pt(g, mutt)).toEqual([4, 1]);
    expect(getCharacteristics(g.state, cardDb, mutt).keywords.has('haste')).toBe(true);
    // Kill Enduring Courage (3/3): it comes back as an enchantment, not a creature.
    const ec = g.id('p1', 'enduring-courage');
    g.pass();
    cast(g, 'lightning-strike', [g.ref(ec)]);
    settle(g);
    const back = g.id('p1', 'enduring-courage');
    const c = getCharacteristics(g.state, cardDb, back);
    expect(c.types).not.toContain('Creature');
    expect(c.types).toContain('Enchantment');
  });

  it('Fallaji Antiquarian: conjures a duplicate into the graveyard with unearth {1}{R}', () => {
    const g = game({
      p1: {
        hand: ['fallaji-antiquarian'],
        battlefield: [...n('mountain', 6), 'scrapwork-mutt'],
      },
    });
    cast(g, 'fallaji-antiquarian');
    settle(g);
    const dup = g.state.players.p1.graveyard.find((id) => g.obj(id).defId === 'scrapwork-mutt')!;
    expect(dup).toBeDefined();
    expect(g.id('p1', 'scrapwork-mutt')).not.toBe(dup);
    // The duplicate (and only it, not the real Mutt's copy-less card) can be unearthed.
    const a = g.legal().find((x) => x.type === 'activateAbility' && x.source === dup);
    expect(a).toBeDefined();
  });

  it('Ivora: Blood on entering, a counter whenever you discard', () => {
    const g = game({
      p1: { hand: ['ivora-insatiable-heir', 'thrill-of-possibility', 'forest'], battlefield: n('mountain', 4) },
    });
    cast(g, 'ivora-insatiable-heir');
    settle(g);
    expect(all(g, 'blood-token')).toHaveLength(1);
    const ivora = g.id('p1', 'ivora-insatiable-heir');
    cast(g, 'thrill-of-possibility', [], { discard: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(pt(g, ivora)).toEqual([2, 2]);
  });

  it('Blood: {1}, tap, discard, sacrifice: draw', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['blood-token', ...n('mountain', 2)] },
    });
    const before = handSize(g, 'p1');
    activate(g, 'blood-token');
    settle(g);
    resolveAll(g);
    expect(all(g, 'blood-token')).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(before);
    expect(g.state.players.p1.graveyard.filter((id) => g.obj(id).defId !== 'blood-token')).toHaveLength(1);
  });

  it('Molten Gatekeeper: pings on another creature entering; unearth {R}', () => {
    const g = game({
      p1: {
        hand: ['scrapwork-mutt'],
        battlefield: ['molten-gatekeeper', ...n('mountain', 3)],
        graveyard: [],
      },
    });
    cast(g, 'scrapwork-mutt');
    settle(g);
    resolveAll(g, false);
    expect(g.life('p2')).toBe(19);
    const u = game({ p1: { graveyard: ['molten-gatekeeper'], battlefield: n('mountain', 1) } });
    activate(u, 'molten-gatekeeper', 'graveyard');
    settle(u);
    const gk = u.id('p1', 'molten-gatekeeper');
    expect(getCharacteristics(u.state, cardDb, gk).keywords.has('haste')).toBe(true);
  });

  it('Scrapwork Mutt: may discard to draw', () => {
    const g = game({ p1: { hand: ['scrapwork-mutt', 'forest'], battlefield: n('mountain', 2) } });
    cast(g, 'scrapwork-mutt');
    settle(g);
    resolveAll(g, true);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(1);
    const empty = game({ p1: { hand: ['scrapwork-mutt'], battlefield: n('mountain', 2) } });
    cast(empty, 'scrapwork-mutt');
    settle(empty);
    resolveAll(empty, true);
    expect(handSize(empty, 'p1')).toBe(0);
  });

  it('Seasoned Pyromancer: discard two, draw two, an Elemental per nonland card', () => {
    const g = game({
      p1: {
        hand: ['seasoned-pyromancer', 'forest', 'shock'],
        battlefield: n('mountain', 3),
      },
    });
    cast(g, 'seasoned-pyromancer');
    settle(g);
    resolveAll(g);
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(all(g, 'brawl-elemental-1-1-red-token')).toHaveLength(1);
  });

  it('Seasoned Pyromancer: with an empty hand it still draws two', () => {
    const g = game({ p1: { hand: ['seasoned-pyromancer'], battlefield: n('mountain', 3) } });
    cast(g, 'seasoned-pyromancer');
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
    expect(all(g, 'brawl-elemental-1-1-red-token')).toHaveLength(0);
  });

  it('Seasoned Pyromancer: from the graveyard, two Elementals', () => {
    const g = game({
      p1: { graveyard: ['seasoned-pyromancer'], battlefield: n('mountain', 5) },
    });
    activate(g, 'seasoned-pyromancer', 'graveyard');
    settle(g);
    expect(all(g, 'brawl-elemental-1-1-red-token')).toHaveLength(2);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Squee, the Immortal: castable from the graveyard and from exile', () => {
    const gy = game({ p1: { graveyard: ['squee-the-immortal'], battlefield: n('mountain', 3) } });
    expect(castable(gy, 'squee-the-immortal')).toBe(true);
    // From exile (the scenario has no exile zone, so move it by hand).
    const ex = game({ p1: { graveyard: ['squee-the-immortal'], battlefield: n('mountain', 3) } });
    const squee = ex.id('p1', 'squee-the-immortal', 'graveyard');
    ex.state.players.p1.graveyard = [];
    ex.state.players.p1.exile.push(squee);
    ex.obj(squee).zone = 'exile';
    expect(castable(ex, 'squee-the-immortal')).toBe(true);
    ex.do(ex.legal().find((a) => a.type === 'castSpell' && a.card === squee)!);
    settle(ex);
    expect(ex.zoneOf(squee)).toBe('battlefield');
  });

  it('Tersa Lightshatter: discard up to two, draw that many', () => {
    const g = game({
      p1: { hand: ['tersa-lightshatter', 'forest', 'forest', 'forest'], battlefield: n('mountain', 3) },
    });
    cast(g, 'tersa-lightshatter');
    settle(g);
    const d = g.decision;
    expect(d.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    // The cap of two ends the discarding by itself.
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Tersa Lightshatter: attacking with seven cards in the graveyard exiles one to play', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: ['tersa-lightshatter', ...n('mountain', 2)],
        graveyard: n('forest', 7),
      },
    });
    g.passBoth().attack(g.id('p1', 'tersa-lightshatter'));
    settle(g);
    expect(g.state.players.p1.exile).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(6);
    const exiled = g.state.players.p1.exile[0]!;
    expect(g.obj(exiled).playableUntilTurn).toBe(g.state.turn.number);
  });

  it('Bitter Reunion: rummage for two; sacrifice for haste', () => {
    const g = game({
      p1: { hand: ['bitter-reunion', 'forest'], battlefield: ['scrapwork-mutt', ...n('mountain', 3)] },
    });
    cast(g, 'bitter-reunion');
    settle(g);
    resolveAll(g, true);
    expect(handSize(g, 'p1')).toBe(2);
    activate(g, 'bitter-reunion');
    settle(g);
    const mutt = g.id('p1', 'scrapwork-mutt');
    expect(getCharacteristics(g.state, cardDb, mutt).keywords.has('haste')).toBe(true);
    expect(all(g, 'bitter-reunion')).toHaveLength(0);
  });

  it('Shared Animosity: +1/+0 for each other attacker sharing a creature type', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: ['shared-animosity', 'squee-the-immortal', 'goblin-smuggler', 'scrapwork-mutt'],
      },
    });
    const squee = g.id('p1', 'squee-the-immortal');
    const smuggler = g.id('p1', 'goblin-smuggler');
    const mutt = g.id('p1', 'scrapwork-mutt');
    g.passBoth().attack(squee, smuggler, mutt);
    settle(g);
    expect(pt(g, squee)[0]).toBe(3);
    expect(pt(g, smuggler)[0]).toBe(getCharacteristics(g.state, cardDb, smuggler).power);
    expect(pt(g, smuggler)[0]! - cardDb.get('goblin-smuggler')!.power!).toBe(1);
    expect(pt(g, mutt)[0]).toBe(2);
  });
});
