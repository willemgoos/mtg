import { describe, expect, it } from 'vitest';
import { redactFor } from '../src/index.ts';
import { DB, Game, scenario } from './helpers.ts';

// Strixhaven 13a: magecraft (cast or copy), Learn, and double-faced cards with a planeswalker back.

function settle(g: Game): Game {
  for (let i = 0; i < 20 && (g.state.stack.length > 0 || g.state.pendingTriggers.length > 0); i++)
    g.passBoth();
  return g;
}

const cast = (g: Game, card: string, zone: 'hand' = 'hand') =>
  g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', card, zone), targets: [] });

describe('magecraft', () => {
  it('triggers on casting an instant or sorcery, and only those', () => {
    const g = new Game(
      scenario({ p1: { hand: ['study', 'flash', 'bear'], battlefield: ['mage', 'forest', 'forest'] } }),
    );
    const mage = g.id('p1', 'mage');
    settle(cast(g, 'study'));
    expect(g.obj(mage).plusOneCounters).toBe(1);
    settle(cast(g, 'flash'));
    expect(g.obj(mage).plusOneCounters).toBe(2);
    settle(cast(g, 'bear'));
    expect(g.obj(mage).plusOneCounters).toBe(2);
  });

  it('also triggers when you copy a spell (orCopy), but a plain cast trigger does not', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['study'], battlefield: ['mage', 'caster', 'twin', 'forest'] },
      }),
    );
    settle(cast(g, 'study'));
    expect(g.events.filter((e) => e.type === 'spellCopied')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'mage')).plusOneCounters).toBe(2);
    expect(g.obj(g.id('p1', 'caster')).plusOneCounters).toBe(1);
  });

  it("does not trigger on an opponent's spell or copy", () => {
    const g = new Game(
      scenario({
        p1: { hand: ['study'], battlefield: ['twin'] },
        p2: { battlefield: ['mage'] },
      }),
    );
    settle(cast(g, 'study'));
    expect(g.obj(g.id('p2', 'mage')).plusOneCounters ?? 0).toBe(0);
  });
});

describe('Learn', () => {
  const learn = (sideboard: string[], hand: string[] = ['learner', 'bear']) => {
    const g = new Game(scenario({ p1: { hand, sideboard } }));
    cast(g, 'learner');
    g.passBoth();
    return g;
  };
  const labels = (g: Game) => {
    const d = g.state.decision;
    return d.kind === 'chooseOption' ? d.options.map((o) => o.label) : [];
  };
  const choose = (g: Game, index: number) => g.do({ type: 'chooseOption', player: 'p1', index });

  it('offers a Lesson from the sideboard, a rummage and nothing', () => {
    const g = learn(['lesson', 'lesson']);
    expect(labels(g)).toEqual([
      'Reveal lesson and put it into your hand',
      'Discard a card, then draw a card',
      'Do nothing',
    ]);
  });

  it('puts the Lesson into hand from outside the game', () => {
    const g = learn(['lesson', 'lesson']);
    choose(g, 0);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId).sort()).toEqual(['bear', 'lesson']);
    expect(g.state.players.p1.sideboard).toEqual(['lesson']);
  });

  it('rummages: discard a card, then draw', () => {
    const g = learn([]);
    expect(labels(g)).toEqual(['Discard a card, then draw a card', 'Do nothing']);
    const lib = g.state.players.p1.library.length;
    choose(g, 0);
    g.do(g.legal('p1')[0]!);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('bear');
    expect(g.state.players.p1.library.length).toBe(lib - 1);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('may do nothing, and skips the prompt when there is nothing to do', () => {
    const g = learn(['lesson']);
    choose(g, 2);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.players.p1.sideboard).toEqual(['lesson']);
    const h = learn([], ['learner']);
    expect(h.state.decision.kind).toBe('priority');
  });

  it('hides the opponent sideboard', () => {
    const g = new Game(scenario({ p1: { sideboard: ['lesson'] } }));
    expect(redactFor(g.state, 'p2', DB).players.p1.sideboard).toEqual(['?']);
    expect(redactFor(g.state, 'p1', DB).players.p1.sideboard).toEqual(['lesson']);
  });
});

describe('modal double-faced cards with a planeswalker back', () => {
  it('enters as the back with loyalty counters, and returns to its front in the graveyard', () => {
    const g = new Game(
      scenario({ p1: { hand: ['walker-mdfc'], battlefield: ['forest', 'forest', 'forest'] } }),
    );
    const c = g.id('p1', 'walker-mdfc', 'hand');
    expect(g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === c)).toHaveLength(2);
    g.do({ type: 'castSpell', player: 'p1', card: c, targets: [], back: true });
    g.passBoth();
    expect(g.zoneOf(c)).toBe('battlefield');
    expect(g.obj(c).defId).toBe('walker-back');
    expect(g.obj(c).counters?.loyalty).toBe(3);
  });
});
