import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckGameOptions, isPlayable } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Silverquill Inkwell (W/B) and its Lessons.

const INKLING = 'stx-inkling-token';
const PEST = 'stx-pest-token';
const of = (g: GameDriver, defId: string, who: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === who);
/** Resolves the stack, declining any Learn offer (the last option) and optional effects. */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 30; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: false });
    else break;
  }
  return g;
}
const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

describe('Silverquill: magecraft and Inklings', () => {
  it('Silverquill Apprentice gives a target creature +1/+0 on magecraft', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['silverquill-apprentice', 'eager-first-year', ...n('plains', 2)],
      },
    });
    const first = g.id('p1', 'eager-first-year');
    cast(g, 'beaming-defiance', [g.ref(first)]);
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets[0] !== undefined &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === first,
      ),
    );
    // Beaming Defiance +2/+2, the Apprentice's +1/+0 (the target) and Eager First-Year's own +1/+0.
    expect(pt(g, first)).toEqual([2 + 2 + 1 + 1, 4]);
  });

  it('Silverquill Pledgemage gains flying or lifelink as you choose', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['silverquill-pledgemage', ...n('plains', 2)],
      },
    });
    const pledge = g.id('p1', 'silverquill-pledgemage');
    cast(g, 'beaming-defiance', [g.ref(pledge)]);
    g.pass();
    expect(g.legal().filter((a) => a.type === 'chooseOption')).toHaveLength(0);
    done(g);
    expect(keywords(g, pledge)).toContain('hexproof');
    expect(keywords(g, pledge).has('flying') || keywords(g, pledge).has('lifelink')).toBe(true);
  });

  it('Sedgemoor Witch makes a Pest on magecraft and has ward (pay 3 life)', () => {
    const g = game({
      p1: { hand: ['beaming-defiance'], battlefield: ['sedgemoor-witch', ...n('plains', 2)] },
    });
    expect(cardDb.get('sedgemoor-witch')!.wardCost?.life).toBe(3);
    cast(g, 'beaming-defiance', [g.ref(g.id('p1', 'sedgemoor-witch'))]);
    done(g);
    expect(of(g, PEST)).toHaveLength(1);
  });

  it('Inkling Summoning and Umbral Juke make 2/1 flying Inklings', () => {
    const g = game({
      p1: { hand: ['umbral-juke'], battlefield: n('swamp', 3) },
    });
    cast(g, 'umbral-juke', [], { mode: 1 });
    done(g);
    const [token] = of(g, INKLING);
    expect(token).toBeDefined();
    expect(pt(g, token!)).toEqual([2, 1]);
    expect(keywords(g, token!)).toContain('flying');
  });

  it('Umbral Juke can make the opponent sacrifice a creature', () => {
    const g = game({
      p1: { hand: ['umbral-juke'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'umbral-juke', [], { mode: 0 });
    done(g);
    expect(of(g, 'serra-angel', 'p2')).toHaveLength(0);
  });

  it('Dramatic Finale pumps tokens and makes an Inkling once a turn when creatures die', () => {
    const g = game({
      p1: {
        hand: ['mage-hunters-onslaught', 'umbral-juke'],
        battlefield: ['dramatic-finale', 'eager-first-year', ...n('swamp', 8)],
      },
    });
    cast(g, 'umbral-juke', [], { mode: 1 });
    done(g);
    expect(pt(g, of(g, INKLING)[0]!)).toEqual([3, 2]);
    cast(g, 'mage-hunters-onslaught', [g.ref(g.id('p1', 'eager-first-year'))]);
    done(g);
    expect(of(g, INKLING)).toHaveLength(2);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'eager-first-year')).toBe(false);
  });

  it('Blot Out the Sky makes X tapped Inklings', () => {
    const g = game({
      p1: { hand: ['blot-out-the-sky'], battlefield: [...n('plains', 3), ...n('swamp', 2)] },
    });
    cast(g, 'blot-out-the-sky', [], { x: 3 });
    done(g);
    const tokens = of(g, INKLING);
    expect(tokens).toHaveLength(3);
    expect(tokens.every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe('Silverquill: creatures', () => {
  it('Leech Fanatic has lifelink only during your turn', () => {
    const mine = game({ p1: { battlefield: ['leech-fanatic'] } });
    expect(keywords(mine, mine.id('p1', 'leech-fanatic'))).toContain('lifelink');
    const theirs = game({ active: 'p2', p1: { battlefield: ['leech-fanatic'] } });
    expect(keywords(theirs, theirs.id('p1', 'leech-fanatic'))).not.toContain('lifelink');
  });

  it('Killian makes spells that target a creature cost {2} less', () => {
    const g = game({
      p1: {
        hand: ['mage-hunters-onslaught', 'beaming-defiance'],
        battlefield: ['killian-ink-duelist', 'plains', 'swamp', 'swamp'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    // {2}{B}{B} costs {B}{B}; Beaming Defiance ({1}{W}) can't be paid with the rest.
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'mage-hunters-onslaught', [g.ref(angel)]);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Callous Bloodmage offers three modes', () => {
    const g = game({ p1: { hand: ['callous-bloodmage'], battlefield: n('swamp', 3) } });
    cast(g, 'callous-bloodmage');
    for (let i = 0; i < 4 && g.state.stack.length; i++) g.pass();
    const modes = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .map((a) => (a.type === 'chooseTargets' ? a.mode : -1));
    expect(new Set(modes)).toEqual(new Set([0, 1, 2]));
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 });
    done(g);
    expect(of(g, PEST)).toHaveLength(1);
  });

  it('Shadewing Laureate puts a counter on a creature when another flyer you control dies', () => {
    const g = game({
      p1: {
        hand: ['mage-hunters-onslaught'],
        battlefield: ['shadewing-laureate', INKLING, ...n('swamp', 4)],
      },
    });
    const laureate = g.id('p1', 'shadewing-laureate');
    cast(g, 'mage-hunters-onslaught', [g.ref(g.id('p1', INKLING))]);
    done(g);
    expect(g.obj(laureate).plusOneCounters).toBe(1);
  });

  it('Mage Hunter drains an opponent who casts an instant or sorcery', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['mage-hunter'] },
      p2: { hand: ['beaming-defiance'], battlefield: ['eager-first-year', ...n('plains', 2)] },
    });
    cast(g, 'beaming-defiance', [g.ref(g.id('p2', 'eager-first-year'))]);
    done(g);
    expect(g.life('p2')).toBe(19);
  });

  it('Specter of the Fens drains 2 for {5}{B}', () => {
    const g = game({ p1: { battlefield: ['specter-of-the-fens', ...n('swamp', 6)] } });
    g.do(g.legal().find((a) => a.type === 'activateAbility')!);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Spiteful Squad enters with two counters and passes them on when it dies', () => {
    const g = game({
      p1: {
        hand: ['spiteful-squad', 'mage-hunters-onslaught'],
        battlefield: ['eager-first-year', ...n('swamp', 6), 'plains', 'plains', 'plains'],
      },
    });
    cast(g, 'spiteful-squad');
    done(g);
    const squad = g.id('p1', 'spiteful-squad');
    expect(pt(g, squad)).toEqual([2, 2]);
    cast(g, 'mage-hunters-onslaught', [g.ref(squad)]);
    done(g);
    expect(g.obj(g.id('p1', 'eager-first-year')).plusOneCounters).toBe(2);
  });

  it('Tenured Inkcaster drains when a creature with a +1/+1 counter attacks', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['tenured-inkcaster', 'eager-first-year'] },
    });
    g.obj(g.id('p1', 'eager-first-year')).plusOneCounters = 1;
    g.passBoth();
    g.attack(g.id('p1', 'eager-first-year'));
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(g.life('p2')).toBeLessThan(20);
  });

  it('Shadrix Silverquill offers its two pairs at the beginning of combat', () => {
    const g = game({
      step: 'main1',
      p1: { battlefield: ['shadrix-silverquill', 'eager-first-year'] },
    });
    g.passBoth();
    expect(g.legal().some((a) => a.type === 'chooseTargets')).toBe(true);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 });
    done(g);
    expect(of(g, INKLING)).toHaveLength(1);
    expect(g.state.players.p2.hand.length).toBe(1);
  });

  it('Eyetwitch learns when it dies', () => {
    const g = game({
      p1: {
        hand: ['mage-hunters-onslaught'],
        battlefield: ['eyetwitch', ...n('swamp', 4)],
        sideboard: ['inkling-summoning'],
      },
    });
    cast(g, 'mage-hunters-onslaught', [g.ref(g.id('p1', 'eyetwitch'))]);
    for (let i = 0; i < 5 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('inkling-summoning');
  });
});

describe('Silverquill: removal and spells', () => {
  it('Vanishing Verse exiles a monocolored permanent only', () => {
    const g = game({
      p1: { hand: ['vanishing-verse'], battlefield: ['plains', 'swamp'] },
      p2: { battlefield: ['serra-angel', 'silverquill-apprentice'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'vanishing-verse', 'hand'));
    const names = targets.map((a) =>
      a.type === 'castSpell' && a.targets[0] && 'object' in a.targets[0]
        ? g.obj(a.targets[0].object.id).defId
        : '',
    );
    expect(names).toContain('serra-angel');
    expect(names).not.toContain('silverquill-apprentice');
    cast(g, 'vanishing-verse', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
  });

  it('Baleful Mastery: {1}{B} makes an opponent draw a card', () => {
    const g = game({
      p1: { hand: ['baleful-mastery'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'baleful-mastery', [g.ref(angel)], { kicked: true });
    done(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.state.players.p2.hand).toHaveLength(1);
    // With only two lands the full cost is not available.
    const h = game({
      p1: { hand: ['baleful-mastery'], battlefield: ['swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(h.legal().some((a) => a.type === 'castSpell' && !a.kicked)).toBe(false);
  });

  it('Closing Statement costs {2} less in your end step and adds a counter', () => {
    const g = game({
      step: 'end',
      p1: {
        hand: ['closing-statement'],
        battlefield: ['plains', 'swamp', 'swamp', 'eager-first-year'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const mine = g.id('p1', 'eager-first-year');
    cast(g, 'closing-statement', [g.ref(angel), g.ref(mine)]);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.obj(mine).plusOneCounters).toBe(1);
  });

  it('Defend the Campus destroys a creature with power 4 or more', () => {
    const g = game({
      p1: { hand: ['defend-the-campus'], battlefield: [...n('plains', 4)] },
      p2: { battlefield: ['serra-angel', 'eager-first-year'] },
    });
    cast(g, 'defend-the-campus', [g.ref(g.id('p2', 'serra-angel'))], { mode: 1 });
    done(g);
    expect(of(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(of(g, 'eager-first-year', 'p2')).toHaveLength(1);
  });

  it('Silverquill Command has a mode for each pair of its four modes', () => {
    expect(cardDb.get('silverquill-command')!.modes).toHaveLength(6);
  });

  it('Exhilarating Elocution puts two counters on the target', () => {
    const g = game({
      p1: {
        hand: ['exhilarating-elocution'],
        battlefield: ['eager-first-year', ...n('plains', 2), ...n('swamp', 2)],
      },
    });
    const first = g.id('p1', 'eager-first-year');
    cast(g, 'exhilarating-elocution', [g.ref(first)]);
    done(g);
    expect(g.obj(first).plusOneCounters).toBe(2);
  });

  it('Rise of Extus exiles a creature and learns', () => {
    const g = game({
      p1: {
        hand: ['rise-of-extus'],
        battlefield: [...n('plains', 3), ...n('swamp', 3)],
        sideboard: ['inkling-summoning'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'rise-of-extus', [g.ref(g.id('p2', 'serra-angel'))]);
    for (let i = 0; i < 5 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['inkling-summoning']);
  });

  it('Hunt for Specimens makes a Pest', () => {
    const g = game({ p1: { hand: ['hunt-for-specimens'], battlefield: n('swamp', 2) } });
    cast(g, 'hunt-for-specimens');
    done(g);
    expect(of(g, PEST)).toHaveLength(1);
  });
});

describe('Silverquill Inkwell: the deck', () => {
  const deck = deckById('stx-silverquill-inkwell');

  it('has 60 cards, 24 lands, a four-Lesson sideboard and only implemented cards', () => {
    expect(deck.cards.reduce((s, [, c]) => s + c, 0)).toBe(60);
    expect(deck.sideboard!.reduce((s, [, c]) => s + c, 0)).toBe(4);
    expect(isPlayable(deck)).toBe(true);
    const lands = deck.cards
      .filter(([name]) => ['Plains', 'Swamp', 'Silverquill Campus'].includes(name))
      .reduce((s, [, c]) => s + c, 0);
    expect(lands).toBe(24);
  });

  it('plays random games to the end against a starter deck and itself', () => {
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 12; seed++) {
      const other = seed % 2 ? deck : deckById('arcane-aerialists');
      const r = playRandomGame(
        engine,
        engine.newGame({ ...deckGameOptions(deck, other), seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
