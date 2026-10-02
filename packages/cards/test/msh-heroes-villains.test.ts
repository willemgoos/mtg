import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { deckById, deckIds, MARVEL_DECKS } from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10a: Heroes Unite (R/W) and Villainous Schemes (U/B).

describe('teamwork cards', () => {
  it('HULK SMASH! with teamwork does both modes, and Agent Maria Hill draws', () => {
    const g = game({
      p1: {
        hand: ['hulk-smash'],
        battlefield: [...n('mountain', 2), 'agent-maria-hill', 'thor-odinson'],
        library: ['plains'],
      },
      p2: { battlefield: ['pirates-cutlass', 'serra-angel'] },
    });
    const maria = g.id('p1', 'agent-maria-hill');
    const thor = g.id('p1', 'thor-odinson');
    const angel = g.id('p2', 'serra-angel');
    const quinjet = g.id('p2', 'pirates-cutlass');
    cast(g, 'hulk-smash', [g.ref(quinjet), g.ref(thor), g.ref(angel)], {
      kicked: true,
      teamwork: [maria, thor],
    });
    settle(g);
    expect(g.zoneOf(quinjet)).toBe('graveyard');
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.obj(maria).plusOneCounters).toBe(1);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('a teamwork cast needs enough power among untapped creatures', () => {
    const g = game({
      p1: { hand: ['hulk-smash'], battlefield: [...n('mountain', 2), 'agent-of-atlas'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell' && a.kicked)).toBe(false);
    expect(g.legal().some((a) => a.type === 'castSpell' && a.mode === 1)).toBe(true);
  });
});

describe('power-up', () => {
  it('Brave Brawler powers up for {3} the turn it enters, once', () => {
    const g = game({ p1: { hand: ['brave-brawler'], battlefield: n('plains', 5) } });
    settle(cast(g, 'brave-brawler'));
    const b = g.id('p1', 'brave-brawler');
    g.do({ type: 'activateAbility', player: 'p1', source: b, abilityIndex: 0, targets: [] });
    settle(g);
    expect(pt(g, b)).toEqual([4, 3]);
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('connive', () => {
  it('Red Room Recruit connives as it enters', () => {
    const g = game({
      p1: { hand: ['red-room-recruit'], battlefield: n('swamp', 2), library: ['dark-deed'] },
    });
    settle(cast(g, 'red-room-recruit'));
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'dark-deed', 'hand') });
    expect(pt(g, g.id('p1', 'red-room-recruit'))).toEqual([2, 3]);
  });

  it("Trickster's Stratagem: the owner picks second from the top, then yours connives", () => {
    const g = game({
      p1: {
        hand: ['tricksters-stratagem'],
        battlefield: [...n('island', 4), 'agent-of-atlas'],
        library: ['island'],
      },
      p2: { battlefield: ['serra-angel'], library: ['plains', 'plains'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'tricksters-stratagem', [g.ref(angel), g.ref(g.id('p1', 'agent-of-atlas'))]);
    settle(g); // Agent of Atlas's prowess, then the spell
    expect(g.decision).toMatchObject({ kind: 'chooseOption', player: 'p2' });
    g.do(g.legal('p2')[0]!);
    expect(g.state.players.p2.library[1]).toBe(angel);
    expect(g.decision.kind).toBe('discard');
  });
});

describe('double-faced cards', () => {
  it('Monica Rambeau transforms into Photon, Living Light', () => {
    const g = game({
      p1: { battlefield: ['monica-rambeau', ...n('plains', 3), ...n('mountain', 2)] },
    });
    const m = g.id('p1', 'monica-rambeau');
    g.do({ type: 'activateAbility', player: 'p1', source: m, abilityIndex: 1, targets: [] });
    settle(g);
    expect(g.obj(m).defId).toBe('photon-living-light');
    expect(pt(g, m)).toEqual([4, 4]);
  });

  it('Photon, Living Light can be cast directly as the back face', () => {
    const g = game({
      p1: { hand: ['monica-rambeau'], battlefield: [...n('plains', 3), ...n('mountain', 2)] },
    });
    const backs = g.legal().filter((a) => a.type === 'castSpell' && a.back);
    expect(backs).toHaveLength(1);
    settle(g.do(backs[0]!));
    expect(g.obj(g.id('p1', 'photon-living-light')).defId).toBe('photon-living-light');
  });
});

describe('random games', () => {
  it('the Marvel decks play random games to completion, against each other and the starters', () => {
    const [heroes, villains] = MARVEL_DECKS.map(deckIds) as [string[], string[]];
    const starter = deckIds(deckById('might-of-the-legion'));
    const pairings = [
      { p1: heroes, p2: villains },
      { p1: villains, p2: starter },
      { p1: starter, p2: heroes },
    ];
    for (let seed = 1; seed <= 12; seed++) {
      const decks = pairings[seed % 3]!;
      const initial = engine.newGame({ decks, seed });
      const r = playRandomGame(engine, initial, seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 30_000);
});
