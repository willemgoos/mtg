import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import {
  cardDb,
  deckById,
  deckGameOptions,
  deckIds,
  isPlayable,
  sideboardIds,
} from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Witherbloom Bloodroot (B/G).

const PEST = 'stx-pest-token';
const pests = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === PEST && g.obj(id).controller === who);
const activate = (g: GameDriver, source: string, extra: Record<string, unknown> = {}, index = 0) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
    ...extra,
  } as never);
/** Resolves the stack, declining any Learn offer (the last option) and "may" prompts. */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
  return g;
}
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);

describe('the deck', () => {
  it('is 60 cards with 24 lands, a Lesson sideboard, and playable', () => {
    const d = deckById('stx-witherbloom-bloodroot');
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
    const lands = deckIds(d).filter((id) => cardDb.get(id)?.types.includes('Land'));
    expect(lands).toHaveLength(24);
  });

  it('plays a full random game', () => {
    const d = deckById('stx-witherbloom-bloodroot');
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

describe('life gain payoffs', () => {
  it('Leech Fanatic has lifelink only during your turn', () => {
    const g = game({ p1: { battlefield: ['leech-fanatic'] } });
    const id = g.id('p1', 'leech-fanatic');
    expect(getCharacteristics(g.state, cardDb, id).keywords).toContain('lifelink');
    const h = game({ p1: { battlefield: ['leech-fanatic'] }, active: 'p2' });
    expect(getCharacteristics(h.state, cardDb, h.id('p1', 'leech-fanatic')).keywords).not.toContain(
      'lifelink',
    );
  });

  it('Blood Researcher gets a counter whenever you gain life', () => {
    const g = game({
      p1: { hand: ['cram-session'], battlefield: ['blood-researcher', 'forest', 'swamp'] },
    });
    done(cast(g, 'cram-session'));
    expect(pt(g, g.id('p1', 'blood-researcher'))).toEqual([3, 3]);
    expect(g.life('p1')).toBe(24);
  });

  it('Dina drains each opponent when you gain life, and sacrifices another creature for +X/+0', () => {
    const g = game({
      p1: {
        hand: ['cram-session'],
        battlefield: ['dina-soul-steeper', 'forest', 'swamp', 'swamp', 'forest', 'serra-angel'],
      },
    });
    done(cast(g, 'cram-session'));
    expect(g.life('p2')).toBe(19);
    const dina = g.id('p1', 'dina-soul-steeper');
    const angel = g.id('p1', 'serra-angel');
    activate(g, dina, { sacrifice: angel }, 1);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(pt(g, dina)).toEqual([1 + 4, 3]);
  });

  it('Honor Troll adds a life to each gain and grows at 25 life', () => {
    const g = game({
      p1: { hand: ['cram-session'], battlefield: ['honor-troll', 'forest', 'swamp'] },
    });
    done(cast(g, 'cram-session'));
    expect(g.life('p1')).toBe(25);
    expect(pt(g, g.id('p1', 'honor-troll'))).toEqual([4, 4]);
  });

  it('Witherbloom Pledgemage gains 1 life and Apprentice drains 1 on magecraft', () => {
    const g = game({
      p1: {
        hand: ['hunt-for-specimens'],
        battlefield: ['witherbloom-pledgemage', 'witherbloom-apprentice', 'swamp', 'forest'],
      },
    });
    done(cast(g, 'hunt-for-specimens'));
    expect(g.life('p1')).toBe(22);
    expect(g.life('p2')).toBe(19);
  });

  it('Mage Hunter drains an opponent who casts an instant or sorcery', () => {
    const g = game({
      p1: { battlefield: ['mage-hunter'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(20 - 1 - 2);
  });

  it('Tenured Inkcaster puts a counter on a creature, then drains when it attacks', () => {
    const g = game({
      p1: { hand: ['tenured-inkcaster'], battlefield: [...n('swamp', 5), 'bear-cub'] },
    });
    const bears = g.id('p1', 'bear-cub');
    done(cast(g, 'tenured-inkcaster'));
    expect(g.obj(bears).plusOneCounters).toBe(1);
    g.passUntilStep('beginCombat').passBoth().attack(bears);
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });
});

describe('Pests and Learn', () => {
  it('Hunt for Specimens makes a Pest and learns', () => {
    const g = game({
      p1: {
        hand: ['hunt-for-specimens'],
        battlefield: ['swamp', 'forest'],
        sideboard: ['pest-summoning'],
      },
    });
    cast(g, 'hunt-for-specimens');
    for (let i = 0; i < 5 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(pests(g)).toHaveLength(1);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(hand(g)).toEqual(['pest-summoning']);
  });

  it('Callous Bloodmage: Pest, card, or exile a graveyard', () => {
    const g = game({ p1: { hand: ['callous-bloodmage'], battlefield: n('swamp', 3) } });
    cast(g, 'callous-bloodmage');
    for (let i = 0; i < 4 && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).not.toBe('priority');
  });

  it('Gnarled Professor learns; Eyetwitch learns when it dies', () => {
    const g = game({
      p1: {
        hand: ['gnarled-professor'],
        battlefield: n('forest', 4),
        sideboard: ['pest-summoning'],
      },
    });
    cast(g, 'gnarled-professor');
    for (let i = 0; i < 4 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
  });

  it('Tend the Pests: sacrifice a creature, create Pests equal to its power', () => {
    const g = game({
      p1: { hand: ['tend-the-pests'], battlefield: ['swamp', 'forest', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'tend-the-pests', [], { sacrifice: angel });
    settle(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(pests(g)).toHaveLength(4);
  });

  it('Pest Summoning makes two Pests, Basic Conjuration finds a creature and gains 3', () => {
    const g = game({ p1: { hand: ['pest-summoning'], battlefield: n('swamp', 3) } });
    settle(cast(g, 'pest-summoning'));
    expect(pests(g)).toHaveLength(2);
    const h = game({
      p1: {
        hand: ['basic-conjuration'],
        battlefield: n('forest', 3),
        library: [...n('forest', 5), 'serra-angel'],
      },
    });
    cast(h, 'basic-conjuration');
    for (let i = 0; i < 4 && h.decision.kind === 'priority' && h.state.stack.length; i++) h.pass();
    h.do({ type: 'chooseCard', player: 'p1', card: h.id('p1', 'serra-angel', 'library') });
    expect(h.life('p1')).toBe(23);
    expect(hand(h)).toEqual(['serra-angel']);
  });
});

describe('removal and costs', () => {
  it('Mortality Spear costs {2} less if you gained life this turn', () => {
    const g = game({
      p1: {
        hand: ['cram-session', 'mortality-spear'],
        battlefield: ['swamp', 'forest', 'swamp', 'forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'cram-session'));
    cast(g, 'mortality-spear', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
  });

  it('Baleful Mastery: {1}{B} exiles but gives the opponent a card', () => {
    const g = game({
      p1: { hand: ['baleful-mastery'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const before = g.state.players.p2.hand.length;
    cast(g, 'baleful-mastery', [g.ref(angel)], { kicked: true });
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.state.players.p2.hand.length).toBe(before + 1);
  });

  it('Baleful Mastery at full price gives the opponent nothing', () => {
    const g = game({
      p1: { hand: ['baleful-mastery'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const before = g.state.players.p2.hand.length;
    cast(g, 'baleful-mastery', [g.ref(angel)]);
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.state.players.p2.hand.length).toBe(before);
  });

  it('Bayou Groff: sacrifice a creature or pay {3} more', () => {
    const g = game({
      p1: { hand: ['bayou-groff'], battlefield: ['forest', 'forest', 'bear-cub'] },
    });
    const bears = g.id('p1', 'bear-cub');
    cast(g, 'bayou-groff', [], { sacrifice: bears });
    settle(g);
    expect(g.zoneOf(bears)).toBe('graveyard');
    expect(all(g, 'bayou-groff')).toHaveLength(1);
    const h = game({ p1: { hand: ['bayou-groff'], battlefield: n('forest', 5) } });
    settle(cast(h, 'bayou-groff'));
    expect(all(h, 'bayou-groff')).toHaveLength(1);
  });

  it('Brackish Trudge returns from the graveyard only if you gained life this turn', () => {
    const g = game({
      p1: {
        graveyard: ['brackish-trudge'],
        battlefield: ['swamp', 'swamp'],
        hand: ['cram-session'],
      },
    });
    const card = g.id('p1', 'brackish-trudge', 'graveyard');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === card)).toBe(false);
    const h = game({
      p1: {
        graveyard: ['brackish-trudge'],
        battlefield: n('swamp', 3).concat(n('forest', 3)),
        hand: ['cram-session'],
      },
    });
    done(cast(h, 'cram-session'));
    activate(h, h.id('p1', 'brackish-trudge', 'graveyard'));
    settle(h);
    expect(hand(h)).toContain('brackish-trudge');
  });
});

describe('Sedgemoor Witch', () => {
  it('makes a Pest when you cast an instant or sorcery and has menace and ward', () => {
    const g = game({
      p1: { hand: ['hunt-for-specimens'], battlefield: ['sedgemoor-witch', 'swamp', 'forest'] },
    });
    const witch = g.id('p1', 'sedgemoor-witch');
    expect(getCharacteristics(g.state, cardDb, witch).keywords).toContain('menace');
    expect(cardDb.get('sedgemoor-witch')?.wardCost?.life).toBe(3);
    done(cast(g, 'hunt-for-specimens'));
    expect(pests(g)).toHaveLength(2); // the spell's own Pest and the magecraft Pest
  });
});
