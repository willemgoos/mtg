import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import {
  cardDb,
  deckById,
  deckGameOptions,
  deckIds,
  isPlayable,
  sideboardIds,
} from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Rakdos Ruin (B/R).

const ID = 'stx-rakdos-ruin';
const activate = (g: GameDriver, source: string, extra: Record<string, unknown> = {}, index = 0) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
    ...extra,
  } as never);
/** Moves to declare attackers and attacks with these creatures. */
function attackWith(g: GameDriver, ...ids: string[]) {
  g.passBoth();
  g.attack(...ids);
}
/** Answers a sacrifice prompt with the first option, then settles. */
function sacrificeFirst(g: GameDriver) {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'sacrificeSeveral')
      g.do({ type: 'chooseCard', player: d.player, card: d.options[0]! });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
}

describe('the deck', () => {
  it('is 60 cards with 24 lands, a Lesson sideboard, and mostly STX', () => {
    const d = deckById(ID);
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
    const nonland = deckIds(d).filter((id) => !cardDb.get(id)?.types.includes('Land'));
    expect(nonland).toHaveLength(36);
  });

  it('plays full random games', () => {
    const d = deckById(ID);
    const other = deckById('stx-quandrix-equation');
    const engine = createEngine(cardDb);
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

describe('spells', () => {
  it('Lash of Malice gives +2/-2', () => {
    const g = game({
      p1: { hand: ['lash-of-malice'], battlefield: ['swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'lash-of-malice', [g.ref(angel)]);
    settle(g);
    expect(pt(g, angel)).toEqual([6, 2]);
  });

  it('Flunk gives -X/-X where X is 7 minus the controller hand size', () => {
    const g = game({
      p1: { hand: ['flunk'], battlefield: ['swamp', 'swamp'] },
      p2: { hand: n('mountain', 3), battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'flunk', [g.ref(angel)]);
    settle(g);
    // X = 4: 4/4 flyer dies.
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
  });

  it('Flunk shrinks less against a full hand', () => {
    const g = game({
      p1: { hand: ['flunk'], battlefield: ['swamp', 'swamp'] },
      p2: { hand: n('mountain', 6), battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'flunk', [g.ref(angel)]);
    settle(g);
    expect(pt(g, angel)).toEqual([3, 3]);
  });

  it('Crushing Disappointment: each player loses 2 and you draw two', () => {
    const g = game({
      p1: { hand: ['crushing-disappointment'], battlefield: n('swamp', 4), library: n('swamp', 5) },
    });
    cast(g, 'crushing-disappointment');
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Essence Infusion puts two counters and gives lifelink', () => {
    const g = game({
      p1: { hand: ['essence-infusion'], battlefield: ['swamp', 'swamp', 'serra-angel'] },
    });
    const c = g.id('p1', 'serra-angel');
    const [p, t] = pt(g, c);
    cast(g, 'essence-infusion', [g.ref(c)]);
    settle(g);
    expect(pt(g, c)).toEqual([p! + 2, t! + 2]);
  });

  it("Professor's Warning counters or protects", () => {
    const g = game({
      p1: { hand: ['professors-warning'], battlefield: ['swamp', 'serra-angel'] },
    });
    const c = g.id('p1', 'serra-angel');
    const [p] = pt(g, c);
    cast(g, 'professors-warning', [g.ref(c)], { mode: 0 });
    settle(g);
    expect(pt(g, c)[0]).toBe(p! + 1);
  });

  it('Necrotic Fumes exiles a creature at the cost of one of yours', () => {
    const g = game({
      p1: {
        hand: ['necrotic-fumes'],
        battlefield: ['swamp', 'swamp', 'swamp', 'serra-angel'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const mine = g.id('p1', 'serra-angel');
    cast(g, 'necrotic-fumes', [g.ref(angel)], { sacrifice: mine });
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.zoneOf(mine)).not.toBe('battlefield');
  });
});

describe('creatures', () => {
  it('Unwilling Ingredient exiles itself from the graveyard to draw and lose 1', () => {
    const g = game({
      p1: {
        graveyard: ['unwilling-ingredient'],
        battlefield: n('swamp', 3),
        library: n('swamp', 3),
      },
    });
    const card = g.id('p1', 'unwilling-ingredient', 'graveyard');
    activate(g, card);
    settle(g);
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
  });

  it('Novice Dissector sacrifices another creature for a +1/+1 counter', () => {
    const g = game({
      p1: { battlefield: ['novice-dissector', 'swamp', 'eager-first-year', 'serra-angel'] },
    });
    const dis = g.id('p1', 'novice-dissector');
    const angel = g.id('p1', 'serra-angel');
    const fy = g.id('p1', 'eager-first-year');
    const [p] = pt(g, angel);
    activate(g, dis, { sacrifice: fy, targets: [g.ref(angel)] });
    settle(g);
    expect(g.zoneOf(fy)).not.toBe('battlefield');
    expect(pt(g, angel)[0]).toBe(p! + 1);
  });

  it('Daemogoth Titan sacrifices a creature when it attacks, itself if alone', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['daemogoth-titan'] },
    });
    const titan = g.id('p1', 'daemogoth-titan');
    attackWith(g, titan);
    sacrificeFirst(g);
    expect(g.zoneOf(titan)).not.toBe('battlefield');
  });

  it('Daemogoth Titan sacrifices a creature when it blocks too', () => {
    const g = game({
      step: 'beginCombat',
      active: 'p2',
      p1: { battlefield: ['daemogoth-titan', 'serra-angel'] },
      p2: { battlefield: ['eager-first-year'] },
    });
    const angel = g.id('p2', 'eager-first-year');
    const titan = g.id('p1', 'daemogoth-titan');
    g.passBoth();
    g.attack(angel);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'addBlock', player: 'p1', blocker: titan, attacker: angel });
    g.do({ type: 'confirmBlockers', player: 'p1' });
    sacrificeFirst(g);
    const survivors = ['daemogoth-titan', 'serra-angel'].filter((d) =>
      g.state.battlefield.some((id) => g.obj(id).defId === d),
    );
    expect(survivors).toHaveLength(1);
  });

  it('Arrogant Poet may pay 2 life to fly when it attacks', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['arrogant-poet'] } });
    const poet = g.id('p1', 'arrogant-poet');
    attackWith(g, poet);
    settle(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.life('p1')).toBe(18);
  });
});

describe('Efreet Flamepainter', () => {
  it('casts an instant or sorcery from the graveyard for free on combat damage, then exiles it', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['efreet-flamepainter'], graveyard: ['heated-debate'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const efreet = g.id('p1', 'efreet-flamepainter');
    const spell = g.id('p1', 'heated-debate', 'graveyard');
    attackWith(g, efreet);
    for (let i = 0; i < 12 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p2' });
    for (let i = 0; i < 12 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    settle(g);
    for (let i = 0; i < 6 && g.decision.kind === 'castFree'; i++) {
      const legal = g.legal();
      g.do(legal.find((x) => x.type === 'castSpell') ?? legal[0]!);
      settle(g);
    }
    expect(g.zoneOf(spell)).toBe('exile');
  });
});
