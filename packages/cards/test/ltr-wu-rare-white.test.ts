import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { done, keywords } from './hob-white-helpers.ts';
import { ringOf, tokensOf, use, type Game } from './ltr-white-helpers.ts';
import { LTR_WHITE_RARE } from '../src/ltr/white-rare.ts';
import { LTR_BLUE_RARE } from '../src/ltr/blue-rare.ts';

// Lord of the Rings 21d: the white rares of the packets' random slot.

/** Answers a scry by keeping every card on top. */
function keepScry(g: Game): void {
  const d = g.decision;
  if (d.kind !== 'scry') throw new Error(`Expected a scry, got ${d.kind}`);
  g.do({ type: 'scry', player: d.player, top: [...d.cards], bottom: [] });
}
/** Passes until a decision other than priority-with-a-stack comes up. */
function settleStack(g: Game): void {
  for (let i = 0; i < 20 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
}
const life = (g: Game, p: 'p1' | 'p2') => g.state.players[p].life;
const hand = (g: Game, p: 'p1' | 'p2' = 'p1') => g.state.players[p].hand.map((id) => g.obj(id).defId);

describe('white rares: all there', () => {
  it('has all eight white and eight blue rares in cardDb', () => {
    for (const name of [...Object.keys(LTR_WHITE_RARE), ...Object.keys(LTR_BLUE_RARE)]) {
      const id = name
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      expect(cardDb.has(id), name).toBe(true);
    }
    expect(Object.keys(LTR_WHITE_RARE)).toHaveLength(8);
    expect(Object.keys(LTR_BLUE_RARE)).toHaveLength(8);
  });
});

describe('Boromir, Warden of the Tower', () => {
  const BOROMIR = 'boromir-warden-of-the-tower';
  it('has vigilance', () => {
    const g = game({ p1: { battlefield: [BOROMIR] } });
    expect(keywords(g, g.id('p1', BOROMIR))).toContain('vigilance');
  });
  it('does not counter a spell an opponent paid mana for', () => {
    const g = game({
      p1: { battlefield: [BOROMIR] },
      p2: { hand: ['opt'], battlefield: ['island'] },
      active: 'p2',
    });
    cast(g, 'opt');
    expect(g.state.stack.some((i) => i.kind === 'spell')).toBe(true);
    settleStack(g);
    // Opt resolved (a scry), so it was not countered.
    keepScry(g);
    expect(g.state.players.p2.graveyard.map((id) => g.obj(id).defId)).toContain('opt');
  });
  it('counters a spell an opponent cast without spending mana (Press the Enemy casting an instant for free)', () => {
    const g = game({
      p1: { battlefield: [BOROMIR, 'savannah-lions'] },
      p2: { hand: ['press-the-enemy', 'opt'], battlefield: n('island', 4) },
      active: 'p2',
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'press-the-enemy', [{ object: { id: lions, zcc: g.obj(lions).zcc } }]);
    settleStack(g);
    expect(hand(g, 'p1')).toContain('savannah-lions');
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    // Opt was cast without mana: Boromir's trigger is on the stack above it and counters it.
    expect(g.state.stack.filter((i) => i.kind === 'spell')).toHaveLength(1);
    settleStack(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p2.graveyard.map((id) => g.obj(id).defId)).toContain('opt');
    expect(g.state.stack).toHaveLength(0);
  });
  it('sacrificing it gives your creatures indestructible and the Ring tempts you', () => {
    const g = game({
      p1: { battlefield: [BOROMIR, 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', BOROMIR), 1);
    done(g);
    expect(g.zoneOf(g.id('p1', BOROMIR, 'graveyard'))).toBe('graveyard');
    expect(keywords(g, lions)).toContain('indestructible');
    expect(ringOf(g)?.tempted).toBe(1);
    // The Lions is now the Ring-bearer.
    expect(ringOf(g)?.bearer?.id).toBe(lions);
  });
});

describe('Dawn of a New Age', () => {
  const DAWN = 'dawn-of-a-new-age';
  const hope = (g: Game) => g.obj(g.id('p1', DAWN)).counters?.hope ?? 0;
  const toEnd = (g: Game) => {
    for (let i = 0; i < 20 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: g.actor });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.turn.step).toBe('end');
  };
  it('enters with a hope counter for each creature you control', () => {
    const g = game({
      p1: { hand: [DAWN], battlefield: ['plains', 'plains', 'savannah-lions', 'savannah-lions', 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, DAWN);
    done(g);
    expect(hope(g)).toBe(3);
  });
  it('at your end step removes a counter and draws; with the last counter gone it is sacrificed and you gain 4', () => {
    const g = game({
      p1: { battlefield: [DAWN, 'savannah-lions'] },
    });
    g.obj(g.id('p1', DAWN)).counters = { hope: 2 };
    const handBefore = g.state.players.p1.hand.length;
    toEnd(g);
    done(g);
    expect(hope(g)).toBe(1);
    expect(g.state.players.p1.hand.length).toBe(handBefore + 1);
    expect(life(g, 'p1')).toBe(20);
  });
  it('removing the last counter draws, then sacrifices it and gains 4 life', () => {
    const g = game({ p1: { battlefield: [DAWN] } });
    g.obj(g.id('p1', DAWN)).counters = { hope: 1 };
    const handBefore = g.state.players.p1.hand.length;
    toEnd(g);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(handBefore + 1);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === DAWN)).toBe(false);
    expect(life(g, 'p1')).toBe(24);
  });
  it('with no creatures it enters with no counters: no draw, sacrificed at once at the end step', () => {
    const g = game({ p1: { hand: [DAWN], battlefield: ['plains', 'plains'] } });
    cast(g, DAWN);
    done(g);
    expect(hope(g)).toBe(0);
    const handBefore = g.state.players.p1.hand.length;
    toEnd(g);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(handBefore);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === DAWN)).toBe(false);
    expect(life(g, 'p1')).toBe(24);
  });
  it("doesn't trigger on the opponent's end step", () => {
    const g = game({ p1: { battlefield: [DAWN] }, active: 'p2' });
    g.obj(g.id('p1', DAWN)).counters = { hope: 1 };
    toEnd(g);
    done(g);
    expect(hope(g)).toBe(1);
  });
});

describe('Flowering of the White Tree', () => {
  const TREE = 'flowering-of-the-white-tree';
  it('gives legendary creatures +2/+1 and ward {1}, and nonlegendary creatures +1/+1', () => {
    const g = game({
      p1: { battlefield: [TREE, 'boromir-warden-of-the-tower', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const boromir = g.id('p1', 'boromir-warden-of-the-tower');
    expect(pt(g, boromir)).toEqual([5, 4]);
    expect(keywords(g, boromir)).toContain('wardOne');
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).not.toContain('wardOne');
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
  it('treats the Ring-bearer as legendary', () => {
    const g = game({ p1: { battlefield: [TREE, 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    g.state.players.p1.ring = { tempted: 1, bearer: { id: lions, zcc: g.obj(lions).zcc } };
    expect(pt(g, lions)).toEqual([4, 2]);
    expect(keywords(g, lions)).toContain('wardOne');
  });
});

describe('The Battle of Bywater', () => {
  it('destroys every creature with power 3 or greater, then makes a Food for each creature you control', () => {
    const g = game({
      p1: {
        hand: ['the-battle-of-bywater'],
        battlefield: [...n('plains', 3), 'serra-angel', 'savannah-lions', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    cast(g, 'the-battle-of-bywater');
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions')).toHaveLength(3);
    // Two Lions of yours survived: two Foods (the Angel was destroyed first).
    expect(tokensOf(g, 'food-token')).toHaveLength(2);
    expect(tokensOf(g, 'food-token', 'p2')).toHaveLength(0);
  });
  it('makes no Food if you have no creature left', () => {
    const g = game({
      p1: { hand: ['the-battle-of-bywater'], battlefield: [...n('plains', 3), 'serra-angel'] },
    });
    cast(g, 'the-battle-of-bywater');
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
  });
});

