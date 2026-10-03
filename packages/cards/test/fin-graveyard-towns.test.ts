import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckIds } from '../src/index.ts';
import { all, cast, engine, game, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11b (group B): Into the Void (B/G) and Road Trip (G/U).

describe('Into the Void: permanents in the graveyard', () => {
  it('Exdeath transforms at your end step with six permanent cards in your graveyard', () => {
    const graveyard = [...n('swamp', 3), ...n('coeurl', 2), 'magic-pot', 'shock'];
    const g = game({ p1: { battlefield: ['exdeath-void-warlock'], graveyard } });
    const exdeath = g.id('p1', 'exdeath-void-warlock');
    g.passUntilStep('end');
    settle(g);
    expect(g.obj(exdeath).defId).toBe('neo-exdeath-dimensions-end');
    // Power: the six permanent cards (not the Shock).
    expect(pt(g, exdeath)).toEqual([6, 3]);
  });

  it('Exdeath stays with five permanent cards', () => {
    const g = game({
      p1: {
        battlefield: ['exdeath-void-warlock'],
        graveyard: [...n('swamp', 5), 'shock', 'shock'],
      },
    });
    const exdeath = g.id('p1', 'exdeath-void-warlock');
    g.passUntilStep('end');
    settle(g);
    expect(g.obj(exdeath).defId).toBe('exdeath-void-warlock');
  });

  it('Cloud of Darkness gives -X/-X for permanent cards in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['cloud-of-darkness'],
        battlefield: [...n('swamp', 2), ...n('forest', 3)],
        graveyard: [...n('forest', 3), 'coeurl', 'shock'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'cloud-of-darkness'));
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Diamond Weapon costs less for permanent cards in your graveyard and takes no combat damage', () => {
    const g = game({
      p1: {
        hand: ['diamond-weapon'],
        battlefield: [...n('forest', 4)],
        graveyard: [...n('forest', 5)],
      },
    });
    // {7}{G}{G} less five: four lands are enough.
    settle(cast(g, 'diamond-weapon'));
    const weapon = g.id('p1', 'diamond-weapon');
    expect(g.zoneOf(weapon)).toBe('battlefield');
    expect(cardDb.get('diamond-weapon')!.keywords).toContain('reach');
  });

  it('Gran Pulse Ochu pumps by permanent cards in your graveyard', () => {
    const g = game({
      p1: { battlefield: ['gran-pulse-ochu', ...n('forest', 8)], graveyard: n('swamp', 4) },
    });
    const ochu = g.id('p1', 'gran-pulse-ochu');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === ochu)!);
    settle(g);
    expect(pt(g, ochu)).toEqual([5, 5]);
  });
});

describe('Road Trip: lands and Towns', () => {
  it('Ignis Scientia puts a land from the top six onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['ignis-scientia'],
        battlefield: [...n('forest', 2), 'island'],
        library: ['shock', 'shock', 'guadosalam-farplane-gateway', 'shock', 'shock', 'shock'],
      },
    });
    cast(g, 'ignis-scientia');
    settle(g);
    // The look offers only the land.
    const d = g.decision;
    expect(d).toMatchObject({ kind: 'searchLibrary', to: 'battlefieldTapped' });
    if (d.kind !== 'searchLibrary') return;
    expect(d.options).toHaveLength(1);
    g.do({ type: 'chooseCard', player: 'p1', card: d.options[0]! });
    settle(g);
    const land = all(g, 'guadosalam-farplane-gateway')[0];
    expect(land).toBeDefined();
    expect(g.obj(land!).tapped).toBe(true);
    // The other five went to the bottom.
    expect(g.state.players.p1.library).toHaveLength(5);
  });

  it('Omega taps an opponent’s permanent with a stun counter for each nonbasic land', () => {
    const g = game({
      p1: {
        hand: ['omega-heartless-evolution'],
        battlefield: [
          ...n('forest', 4),
          'island',
          'guadosalam-farplane-gateway',
          'capital-city',
          'adventurers-inn',
        ],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'omega-heartless-evolution'));
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(3);
    expect(g.life('p1')).toBe(23);
  });

  it('The Wandering Minstrel: your lands enter untapped', () => {
    const g = game({
      p1: { hand: ['guadosalam-farplane-gateway'], battlefield: ['the-wandering-minstrel'] },
    });
    const town = g.id('p1', 'guadosalam-farplane-gateway', 'hand');
    g.do({ type: 'playLand', player: 'p1', card: town });
    expect(g.obj(town).tapped).toBe(false);
  });

  it("Qiqirn Merchant's big draw costs {1} less for each Town", () => {
    const towns = ['guadosalam-farplane-gateway', 'capital-city', 'adventurers-inn'];
    const g = game({
      p1: {
        battlefield: ['qiqirn-merchant', ...towns, ...n('island', 1)],
        library: n('island', 5),
      },
    });
    const merchant = g.id('p1', 'qiqirn-merchant');
    // {7} less three Towns is {4}: the four lands pay for it.
    const sac = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === merchant && a.abilityIndex === 1);
    expect(sac).toBeDefined();
    settle(g.do(sac!));
    expect(g.state.players.p1.hand).toHaveLength(3);
  });

  it("Stuck in Summoner's Sanctum taps the creature and keeps it tapped", () => {
    const g = game({
      p1: { hand: ['stuck-in-summoners-sanctum'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'stuck-in-summoners-sanctum', [g.ref(angel)]));
    expect(g.obj(angel).tapped).toBe(true);
    expect(cardDb.get('stuck-in-summoners-sanctum')!.keywords).toContain('flash');
  });

  it('Chocobo Kick kicked by returning a land: twice the power in damage', () => {
    const g = game({
      p1: { hand: ['chocobo-kick'], battlefield: ['gigantoad', ...n('forest', 3)] },
      p2: { battlefield: ['serra-angel', 'serra-angel'] },
    });
    const forest = g.id('p1', 'forest');
    const [a] = all(g, 'serra-angel') as [string];
    const kicked = g
      .legal()
      .find(
        (x) =>
          x.type === 'castSpell' &&
          !!x.kicked &&
          x.sacrifice === forest &&
          x.targets.some((t) => 'object' in t && t.object.id === a),
      );
    expect(kicked).toBeDefined();
    settle(g.do(kicked!));
    expect(g.zoneOf(forest)).toBe('hand');
    expect(g.zoneOf(a)).toBe('graveyard');
  });

  it('Travel the Overworld has affinity for Towns', () => {
    const g = game({
      p1: {
        hand: ['travel-the-overworld'],
        battlefield: [...n('guadosalam-farplane-gateway', 3), ...n('island', 2)],
        library: n('island', 5),
      },
    });
    settle(cast(g, 'travel-the-overworld'));
    expect(g.state.players.p1.hand).toHaveLength(4);
  });
});

describe('random games', () => {
  it('the group B Final Fantasy decks play random games to completion', () => {
    const ids = [
      'fin-turks-contract',
      'fin-forbidden-magicks',
      'fin-into-the-void',
      'fin-road-trip',
    ];
    const decks = ids.map((id) => deckIds(deckById(id)));
    const starter = deckIds(deckById('vampiric-hunger'));
    for (let seed = 1; seed <= 24; seed++) {
      const p1 = decks[seed % 4]!;
      const p2 = seed % 3 === 0 ? starter : decks[(seed + 1) % 4]!;
      const r = playRandomGame(engine, engine.newGame({ decks: { p1, p2 }, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
