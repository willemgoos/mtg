import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckGameOptions, isPlayable } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Prismari Artistry (U/R).

const ELEMENTAL = 'stx-elemental-ur-token';
const treasures = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === 'treasure-token' && g.obj(id).controller === who,
  );
const elementals = (g: GameDriver) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === ELEMENTAL);

describe('Prismari Artistry: creatures', () => {
  it('Prismari Pledgemage can attack as though it had no defender after magecraft', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['shock'], battlefield: ['prismari-pledgemage', 'mountain'] },
    });
    const pledge = g.id('p1', 'prismari-pledgemage');
    expect(cardDb.get('prismari-pledgemage')!.keywords).toContain('defender');
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    g.passBoth();
    g.attack(pledge);
    expect(g.state.combat!.attackers.map((a) => a.id)).toEqual([pledge]);
  });

  it('Prismari Pledgemage cannot attack without a spell', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['prismari-pledgemage', 'mountain'] },
    });
    g.passBoth();
    expect(() => g.attack(g.id('p1', 'prismari-pledgemage'))).toThrow();
  });

  it('Prismari Apprentice becomes unblockable, and grows from a big spell', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['shock', 'magma-opus'],
        battlefield: ['prismari-apprentice', 'mountain', ...n('island', 9)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const apprentice = g.id('p1', 'prismari-apprentice');
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.obj(apprentice).plusOneCounters).toBe(0);
    g.passBoth();
    g.attack(apprentice);
    expect(getCharacteristics(g.state, cardDb, apprentice).cantBeBlocked).toBe(true);
    // Magma Opus (mana value 8) adds a counter.
    const g2 = game({
      p1: {
        hand: ['magma-opus'],
        battlefield: ['prismari-apprentice', ...n('island', 5), ...n('mountain', 3)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const a2 = g2.id('p1', 'prismari-apprentice');
    settle(
      cast(g2, 'magma-opus', [{ player: 'p2' }, g2.ref(a2), g2.ref(g2.id('p2', 'serra-angel'))], {
        mode: 0,
      }),
    );
    expect(g2.obj(a2).plusOneCounters).toBe(1);
  });

  it('Vortex Runner is unblockable and 3/3 with eight lands only', () => {
    const g = game({ p1: { battlefield: ['vortex-runner', ...n('island', 7)] } });
    const runner = g.id('p1', 'vortex-runner');
    expect(pt(g, runner)).toEqual([2, 3]);
    const g8 = game({ p1: { battlefield: ['vortex-runner', ...n('island', 8)] } });
    expect(pt(g8, g8.id('p1', 'vortex-runner'))).toEqual([3, 3]);
  });

  it('Spectacle Mage makes big instants and sorceries cost {1} less', () => {
    const base = game({
      p1: { hand: ['serpentine-curve'], battlefield: [...n('island', 3)] },
    });
    // Serpentine Curve has mana value 4: not reduced.
    expect(base.legal().some((a) => a.type === 'castSpell')).toBe(false);
    const g = game({
      p1: {
        hand: ['pigment-storm'],
        battlefield: ['spectacle-mage', ...n('mountain', 4)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const g2 = game({
      p1: { hand: ['pigment-storm'], battlefield: [...n('mountain', 4)] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Maelstrom Muse: attacking makes the next instant or sorcery cost its power less', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['heated-debate'], battlefield: ['maelstrom-muse', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'maelstrom-muse'));
    settle(g);
    expect(g.state.players.p1.nextSpellDiscount).toEqual({ turn: g.state.turn.number, amount: 2 });
    // Heated Debate ({2}{R}) costs {R} with the discount.
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'heated-debate', [g.ref(angel)]));
    expect(g.state.players.p1.nextSpellDiscount).toBeUndefined();
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Oggyar Battle-Seer has haste and taps to scry 1', () => {
    const g = game({ p1: { battlefield: ['oggyar-battle-seer'] } });
    const ab = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'oggyar-battle-seer'))!;
    g.do(ab);
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });

  it('Wormhole Serpent makes a creature unblockable', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['wormhole-serpent', 'serra-angel', ...n('island', 4)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const serpent = g.id('p1', 'wormhole-serpent');
    const angel = g.id('p1', 'serra-angel');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: serpent,
      abilityIndex: 0,
      targets: [g.ref(angel)],
    });
    settle(g);
    g.passBoth();
    g.attack(angel);
    expect(getCharacteristics(g.state, cardDb, angel).cantBeBlocked).toBe(true);
  });

  it('Elemental Expressionist: the chosen creature leaves a 4/4 Elemental if it dies', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['elemental-expressionist', 'llanowar-elves', 'mountain'],
      },
    });
    const elves = g.id('p1', 'llanowar-elves');
    cast(g, 'shock', [g.ref(elves)]);
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === elves),
      ),
    );
    expect(g.zoneOf(elves)).toBe('graveyard');
    expect(elementals(g).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Prismari Artistry: spells', () => {
  it('Sudden Breakthrough gives +2/+0 and first strike and makes a Treasure', () => {
    const g = game({
      p1: {
        hand: ['sudden-breakthrough'],
        battlefield: ['llanowar-elves', 'mountain', 'mountain'],
      },
    });
    const elves = g.id('p1', 'llanowar-elves');
    settle(cast(g, 'sudden-breakthrough', [g.ref(elves)]));
    expect(pt(g, elves)).toEqual([3, 1]);
    expect(treasures(g)).toHaveLength(1);
  });

  it('Prismari Command: 2 damage and a Treasure (modes in pairs)', () => {
    const g = game({
      p1: { hand: ['prismari-command'], battlefield: ['island', 'mountain', 'mountain'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elves = g.id('p2', 'llanowar-elves');
    const mode = cardDb
      .get('prismari-command')!
      .modes!.findIndex((m) => m.label!.startsWith('2 damage') && m.label!.includes('Treasure'));
    settle(cast(g, 'prismari-command', [g.ref(elves)], { mode }));
    expect(g.zoneOf(elves)).toBe('graveyard');
    expect(treasures(g)).toHaveLength(1);
  });

  it('Prismari Command: draw two, discard two', () => {
    const g = game({
      p1: {
        hand: ['prismari-command', 'forest', 'forest'],
        battlefield: ['island', 'mountain', 'mountain'],
        library: ['serra-angel', 'serra-angel'],
      },
    });
    const mode = cardDb
      .get('prismari-command')!
      .modes!.findIndex((m) => m.label!.startsWith('Draw two') && m.label!.includes('Treasure'));
    cast(g, 'prismari-command', [], { mode });
    settle(g);
    for (let i = 0; i < 4 && g.decision.kind !== 'priority'; i++) {
      const a = g.legal()[0]!;
      g.do(a);
      settle(g);
    }
    expect(treasures(g)).toHaveLength(1);
    expect(g.state.players.p1.graveyard.length).toBeGreaterThanOrEqual(3);
  });

  it('Magma Opus: damage, tap two permanents, an Elemental and two cards', () => {
    const g = game({
      p1: {
        hand: ['magma-opus'],
        battlefield: [...n('island', 4), ...n('mountain', 4)],
        library: ['island', 'island', 'island'],
      },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const elves = g.id('p2', 'llanowar-elves');
    settle(
      cast(g, 'magma-opus', [g.ref(elves), g.ref(angel), g.ref(g.id('p1', 'island'))], { mode: 0 }),
    );
    expect(g.zoneOf(elves)).toBe('graveyard');
    expect(g.obj(angel).tapped).toBe(true);
    expect(elementals(g)).toHaveLength(1);
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Magma Opus and Elemental Masterpiece can be discarded for a Treasure', () => {
    const g = game({
      p1: { hand: ['magma-opus', 'elemental-masterpiece'], battlefield: ['island', 'mountain'] },
    });
    const opus = g.id('p1', 'magma-opus', 'hand');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === opus)!);
    settle(g);
    expect(treasures(g)).toHaveLength(1);
    expect(g.zoneOf(opus)).toBe('graveyard');
  });

  it('Elemental Masterpiece makes two 4/4 Elementals', () => {
    const g = game({
      p1: {
        hand: ['elemental-masterpiece'],
        battlefield: [...n('island', 4), ...n('mountain', 3)],
      },
    });
    settle(cast(g, 'elemental-masterpiece'));
    expect(elementals(g)).toHaveLength(2);
    expect(pt(g, elementals(g)[0]!)).toEqual([4, 4]);
  });

  it('Elemental Summoning (Lesson) makes a 4/4 Elemental', () => {
    const g = game({
      p1: { hand: ['elemental-summoning'], battlefield: [...n('island', 3), ...n('mountain', 2)] },
    });
    settle(cast(g, 'elemental-summoning'));
    expect(elementals(g)).toHaveLength(1);
  });
});

describe('Prismari Artistry: the deck', () => {
  const deck = deckById('stx-prismari-artistry');

  it('has 60 cards, 24 lands, a Lesson sideboard and only implemented cards', () => {
    expect(deck.cards.reduce((s, [, c]) => s + c, 0)).toBe(60);
    const lands = deck.cards
      .filter(([name]) => ['Island', 'Mountain', 'Prismari Campus'].includes(name))
      .reduce((s, [, c]) => s + c, 0);
    expect(lands).toBe(24);
    expect(deck.sideboard!.reduce((s, [, c]) => s + c, 0)).toBe(4);
    expect(isPlayable(deck)).toBe(true);
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
