import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { cardDb } from '../src/index.ts';
import { done } from './ecl-red-helpers.ts';

// Tarkir: Dragonstorm 19b: the Mardu and Temur cards, part 2 (the ones with their own engine pieces).

const MARDU_LANDS = ['mountain', 'plains', 'swamp'];
const keywords = (g: GameDriver, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const toAttackers = (g: GameDriver) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareAttackers');
};
/** Passes (confirming empty attacks and blocks) until `p1`'s next precombat main phase, once its lore counter was added. */
const nextOwnMain = (g: GameDriver) => {
  const turn = g.state.turn.number;
  for (let i = 0; i < 200; i++) {
    if (g.state.turn.number > turn && g.state.turn.activePlayer === 'p1' && g.state.turn.step === 'main1' && g.decision.kind === 'priority' && g.state.stack.length === 0)
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'discardToHandSize') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error('Never got to the next main phase');
};
/** The steps of the events since `from`. */
const stepsSince = (g: GameDriver, from: number) =>
  g.events.slice(from).flatMap((e) => (e.type === 'stepChanged' ? [e.step] : []));

describe('All-Out Assault', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['all-out-assault'],
        battlefield: [...MARDU_LANDS, 'mountain', 'plains', 'savannah-lions', 'bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('gives creatures +1/+1 and deathtouch', () => {
    const g = setup();
    cast(g, 'all-out-assault');
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('deathtouch');
    expect(keywords(g, g.id('p2', 'serra-angel'))).not.toContain('deathtouch');
  });

  it('cast in the first main phase: an extra combat and main phase, then the usual combat and second main phase', () => {
    const g = setup();
    cast(g, 'all-out-assault');
    done(g);
    const from = g.events.length;
    // The extra combat comes first.
    toAttackers(g);
    expect(g.state.turn.extraPhases).toEqual([{ phase: 'combat', resume: 'beginCombat' }]);
    const lions = g.id('p1', 'savannah-lions');
    const bear = g.id('p1', 'bear-cub');
    g.attack(lions, bear);
    // "When you next attack this turn, untap each creature you control."
    done(g);
    expect(g.obj(lions).tapped).toBe(false);
    expect(g.obj(bear).tapped).toBe(false);
    // Blocks (none), damage, end of combat, then the extra (postcombat) main phase.
    for (let i = 0; i < 20 && !(g.state.turn.step === 'main2' && g.decision.kind === 'priority'); i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    expect(g.state.turn.step).toBe('main2');
    expect(g.life('p2')).toBe(20 - 3 - 3);
    expect(g.state.turn.extraPhases).toEqual([{ phase: 'main', resume: 'beginCombat' }]);
    // Then the regular combat, and the regular second main phase. The untap happened once only.
    g.pass();
    g.pass();
    expect(g.state.turn.step).toBe('beginCombat');
    expect(g.state.turn.extraPhases).toEqual([]);
    toAttackers(g);
    g.attack(lions);
    expect(g.obj(lions).tapped).toBe(true);
    for (let i = 0; i < 30 && g.state.turn.step !== 'end'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    expect(stepsSince(g, from).filter((s) => s === 'main2')).toHaveLength(2);
    expect(stepsSince(g, from).filter((s) => s === 'beginCombat')).toHaveLength(2);
    expect(g.state.turn.step).toBe('end');
  });

  it('cast in the second main phase: an extra combat and main phase before the end step', () => {
    const g = setup();
    g.passUntilStep('main2');
    cast(g, 'all-out-assault');
    done(g);
    expect(g.state.turn.extraPhases).toEqual([{ phase: 'pending', resume: 'end' }]);
    g.pass();
    g.pass();
    expect(g.state.turn.step).toBe('beginCombat');
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'));
    for (let i = 0; i < 30 && !(g.state.turn.step === 'main2' && g.decision.kind === 'priority'); i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    expect(g.state.turn.step).toBe('main2');
    g.pass();
    g.pass();
    expect(g.state.turn.step).toBe('end');
  });
});

describe('Mardu Siegebreaker', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['mardu-siegebreaker'],
        battlefield: [...MARDU_LANDS, 'mountain', 'bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('exiles up to one other creature you control until it leaves; on attack, a tapped copy attacks and is sacrificed at the end step', () => {
    const g = setup();
    cast(g, 'mardu-siegebreaker');
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    done(g);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
    const sb = g.id('p1', 'mardu-siegebreaker');
    expect(keywords(g, sb)).toContain('haste');
    toAttackers(g);
    g.attack(sb);
    done(g);
    const copies = all(g, 'bear-cub');
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).isToken).toBe(true);
    expect(g.obj(copies[0]!).tapped).toBe(true);
    expect(g.state.combat?.attackers.some((a) => a.id === copies[0])).toBe(true);
    // Leave combat alone and go to the end step: the copy is sacrificed.
    for (let i = 0; i < 30 && g.state.turn.step !== 'end'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    // The exiled card is still exiled while the Siegebreaker stays.
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
  });

  it('returns the exiled creature when it leaves the battlefield', () => {
    const g = game({
      p1: {
        hand: ['mardu-siegebreaker', 'defibrillating-current'],
        battlefield: [...MARDU_LANDS, ...n('mountain', 7), 'bear-cub'],
      },
    });
    cast(g, 'mardu-siegebreaker');
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    cast(g, 'defibrillating-current', [g.ref(g.id('p1', 'mardu-siegebreaker'))]);
    done(g);
    expect(all(g, 'mardu-siegebreaker')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.state.players.p1.exile).toHaveLength(0);
  });

  it('may exile nothing', () => {
    const g = setup();
    cast(g, 'mardu-siegebreaker');
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    done(g);
    expect(g.state.players.p1.exile).toHaveLength(0);
  });
});

describe('Thunder of Unity', () => {
  it('chapter I draws two and loses 2; chapters II and III drain for each creature entering that turn', () => {
    const g = game({
      p1: {
        hand: ['thunder-of-unity', 'savannah-lions', 'savannah-lions', 'savannah-lions'],
        battlefield: [...MARDU_LANDS, 'plains', 'mountain'],
        library: n('forest', 8),
      },
    });
    cast(g, 'thunder-of-unity');
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(hand(g)).toHaveLength(5);
    // Creatures entering this turn (chapter I) do not drain.
    cast(g, 'savannah-lions');
    done(g);
    expect(g.life('p2')).toBe(20);
    // Chapter II: each creature entering this turn drains 1.
    nextOwnMain(g);
    expect(g.obj(g.id('p1', 'thunder-of-unity')).counters?.lore).toBe(2);
    const p1 = g.life('p1');
    cast(g, 'savannah-lions');
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(p1 + 1);
    // Chapter III likewise, and the Saga is sacrificed afterwards; the drain lasts the turn.
    nextOwnMain(g);
    done(g);
    expect(gy(g)).toContain('thunder-of-unity');
    const before = g.life('p1');
    cast(g, 'savannah-lions');
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(before + 1);
  });
});

describe('Dragonback Assault', () => {
  it('deals 3 damage to each creature and each planeswalker; landfall makes a 4/4 flying Dragon', () => {
    const g = game({
      p1: {
        hand: ['dragonback-assault', 'forest'],
        battlefield: [...n('forest', 2), ...n('island', 2), ...n('mountain', 2), 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    cast(g, 'dragonback-assault');
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') } as never);
    done(g);
    const dragons = all(g, 'tdm-clans-b-dragon-token');
    expect(dragons).toHaveLength(1);
    expect(pt(g, dragons[0]!)).toEqual([4, 4]);
    expect(keywords(g, dragons[0]!)).toContain('flying');
  });
});

describe('Dragonclaw Strike', () => {
  it('doubles power and toughness, then fights up to one opposing creature', () => {
    const g = game({
      p1: { hand: ['dragonclaw-strike'], battlefield: [...n('forest', 5), 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'dragonclaw-strike', [g.ref(bear), g.ref(angel)]);
    done(g);
    // The Bear Cub is a 4/4 now, so it and the 4/4 Serra Angel kill each other.
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('only doubles when there is nothing to fight', () => {
    const g = game({
      p1: { hand: ['dragonclaw-strike'], battlefield: [...n('forest', 5), 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'dragonclaw-strike', [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
  });
});

describe('Ureni, the Song Unending', () => {
  it('deals X damage (X = your lands) divided among creatures and planeswalkers your opponents control, step by step', () => {
    const g = game({
      p1: { hand: ['ureni-the-song-unending'], battlefield: [...n('forest', 6), 'island', 'mountain'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'bear-cub'] },
    });
    cast(g, 'ureni-the-song-unending');
    g.pass();
    g.pass();
    // 8 lands: 4 to Serra Angel, 1 to Savannah Lions, the rest (3) to Bear Cub.
    const pick = (label: RegExp) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error(`Expected a choice, got ${d.kind}`);
      const i = d.options.findIndex((o) => label.test(o.label));
      expect(i).toBeGreaterThanOrEqual(0);
      g.do({ type: 'chooseOption', player: d.player, index: i });
    };
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    pick(/^4 damage to Serra Angel/);
    pick(/^1 damage to Savannah Lions/);
    pick(/^3 damage to Bear Cub/);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('may choose no targets', () => {
    const g = game({
      p1: { hand: ['ureni-the-song-unending'], battlefield: [...n('forest', 6), 'island', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'ureni-the-song-unending');
    g.pass();
    g.pass();
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no choice');
    g.do({ type: 'chooseOption', player: d.player, index: d.options.findIndex((o) => /No targets/.test(o.label)) });
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(0);
  });

  it('has protection from white and from black and flies', () => {
    const g = game({ p1: { battlefield: ['ureni-the-song-unending'] } });
    const k = keywords(g, g.id('p1', 'ureni-the-song-unending'));
    expect(k).toEqual(expect.arrayContaining(['flying', 'protectionWhite', 'protectionBlack']));
  });
});

describe('Eshki Dragonclaw', () => {
  it('draws and grows at the beginning of combat if you cast a creature spell and a noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'shock'],
        battlefield: ['eshki-dragonclaw', ...n('mountain', 3), 'plains'],
        library: n('forest', 4),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'savannah-lions');
    done(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    toAttackers(g);
    done(g);
    expect(pt(g, g.id('p1', 'eshki-dragonclaw'))).toEqual([6, 6]);
    expect(hand(g)).toHaveLength(1);
  });

  it('does nothing with only one of the two kinds', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['eshki-dragonclaw', ...n('mountain', 3), 'plains'],
        library: n('forest', 4),
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    toAttackers(g);
    expect(pt(g, g.id('p1', 'eshki-dragonclaw'))).toEqual([4, 4]);
  });
});

describe('Mammoth Bellow', () => {
  it('creates a 5/5 Elephant, and can be cast again from the graveyard with harmonize', () => {
    const g = game({
      p1: { hand: ['mammoth-bellow'], battlefield: [...n('forest', 4), ...n('island', 2), ...n('mountain', 2)] },
    });
    cast(g, 'mammoth-bellow');
    done(g);
    expect(all(g, 'tdm-elephant-token')).toHaveLength(1);
    expect(gy(g)).toContain('mammoth-bellow');
    // Harmonize {5}{G}{U}{R}: eight lands pay for it.
    const again = g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'mammoth-bellow');
    expect(again.length).toBeGreaterThan(0);
  });
});

describe('Roar of Endless Song', () => {
  it('makes a 5/5 Elephant on chapters I and II, and doubles power and toughness on chapter III', () => {
    const g = game({
      p1: {
        hand: ['roar-of-endless-song'],
        battlefield: [...n('forest', 3), ...n('island', 2), 'mountain', 'bear-cub'],
        library: n('forest', 8),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'roar-of-endless-song');
    done(g);
    expect(all(g, 'tdm-elephant-token')).toHaveLength(1);
    nextOwnMain(g);
    done(g);
    expect(all(g, 'tdm-elephant-token')).toHaveLength(2);
    nextOwnMain(g);
    done(g);
    // Chapter III: Bear Cub 2/2 -> 4/4, each Elephant 5/5 -> 10/10; the opponent's creature is left alone.
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([4, 4]);
    for (const e of all(g, 'tdm-elephant-token')) expect(pt(g, e)).toEqual([10, 10]);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('Songcrafter Mage', () => {
  it('lets an instant or sorcery in your graveyard be cast with harmonize this turn, then it is exiled', () => {
    const g = game({
      p1: {
        hand: ['songcrafter-mage'],
        graveyard: ['shock'],
        battlefield: ['mountain', 'forest', 'island', 'mountain'],
      },
    });
    cast(g, 'songcrafter-mage');
    g.pass();
    g.pass();
    settle(g);
    done(g);
    const again = g
      .legal()
      .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'shock' && g.obj(a.card).zone === 'graveyard');
    expect(again.length).toBeGreaterThan(0);
    // {R} has no generic part for the Mage's power to pay, so there is only the cast without tapping.
    g.do({ ...again[0]!, targets: [{ player: 'p2' }] } as never);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('shock');
  });
});

describe('Temur Battlecrier', () => {
  it('makes spells cost {1} less for each creature you control with power 4 or greater, during your turn only', () => {
    // Battlecrier (4/3) and Serra Angel (4/4): spells cost {2} less. A {3}{W}{W} Serra Angel costs {1}{W}{W}.
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['temur-battlecrier', 'serra-angel', 'plains', 'plains', 'mountain'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'serra-angel')).toBe(true);
    // Without the other 4-power creature: only {1} less, {2}{W}{W} needs four mana, but only three lands.
    const h = game({
      p1: { hand: ['serra-angel'], battlefield: ['temur-battlecrier', 'plains', 'plains', 'mountain'] },
    });
    expect(h.legal().some((a) => a.type === 'castSpell' && h.obj(a.card).defId === 'serra-angel')).toBe(false);
    // On the opponent's turn the discount is gone: it does not apply to a flash spell cast by p1 then.
    const c = game({
      p1: { hand: ['serra-angel'], battlefield: ['temur-battlecrier', 'serra-angel', 'plains', 'plains', 'mountain'] },
      active: 'p2',
    });
    expect(c.legal('p1').some((a) => a.type === 'castSpell' && c.obj(a.card).defId === 'serra-angel')).toBe(false);
  });
});

describe('Temur Tawnyback', () => {
  it('draws a card, then discards a card', () => {
    const g = game({
      p1: {
        hand: ['temur-tawnyback'],
        battlefield: n('forest', 6),
        library: ['island', 'mountain'],
      },
    });
    cast(g, 'temur-tawnyback');
    g.pass();
    g.pass();
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toHaveLength(1);
  });
});
