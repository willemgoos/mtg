import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow step 3b: casting from other zones, copies and X.

describe('casting for free', () => {
  it('Daring Waverider casts an instant from your graveyard for free, then exiles it', () => {
    const g = game({
      p1: {
        hand: ['daring-waverider'],
        battlefield: n('island', 6),
        graveyard: ['pearl-of-wisdom'],
      },
    });
    settle(cast(g, 'daring-waverider'));
    expect(g.decision.kind).toBe('castFree');
    const free = g.legal().find((a) => a.type === 'castSpell')!;
    settle(g.do(free));
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.zoneOf(g.id('p1', 'pearl-of-wisdom', 'exile'))).toBe('exile');
    // Every land was spent on the Waverider: the Pearl cost nothing.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(6);
  });

  it('Wishing Well puts a coin counter on, then can cast a 1-mana spell for free', () => {
    const g = game({
      p1: { battlefield: ['wishing-well'], graveyard: ['might-of-the-meek', 'pearl-of-wisdom'] },
    });
    const well = g.id('p1', 'wishing-well');
    const acts = g.legal().filter((a) => a.type === 'activateAbility');
    // Only Might of the Meek (mana value 1) can be the target with no coins yet.
    const targets = acts.flatMap((a) => (a.type === 'activateAbility' ? a.targets : []));
    expect(targets.map((t) => 'object' in t && g.obj(t.object.id).defId)).toEqual([
      'might-of-the-meek',
    ]);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.targets.length === 0)!);
    settle(g);
    expect(g.obj(well).counters?.coin).toBe(1);
  });

  it('The Infamous Cruelclaw casts the exiled spell by discarding a card', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['forest'],
        battlefield: ['the-infamous-cruelclaw'],
        library: ['island', 'serra-angel', 'forest'],
      },
    });
    g.passBoth().attack(g.id('p1', 'the-infamous-cruelclaw'));
    for (let i = 0; i < 30 && g.decision.kind !== 'castFree'; i++) settle(g.pass());
    expect(g.decision.kind).toBe('castFree');
    const cast = g.legal().find((a) => a.type === 'castSpell' && !!a.discard)!;
    settle(g.do(cast));
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(0);
  });
});

describe('graveyard and exile casts', () => {
  it('Festival of Embers casts instants from the graveyard for 1 life and exiles what dies', () => {
    const g = game({
      p1: {
        battlefield: [...n('mountain', 2), 'festival-of-embers'],
        graveyard: ['playful-shove'],
      },
    });
    const shove = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.via === 'festival' &&
          'player' in a.targets[0]! &&
          a.targets[0].player === 'p2',
      )!;
    settle(g.do(shove));
    expect(g.life('p1')).toBe(19);
    expect(g.zoneOf(g.id('p1', 'playful-shove', 'exile'))).toBe('exile');
  });

  it('Osteomancer Adept lets a creature be cast from the graveyard by foraging, with finality', () => {
    const g = game({
      p1: {
        battlefield: [...n('forest', 2), 'osteomancer-adept', 'carrot-cake'],
        graveyard: ['bear-cub'],
      },
    });
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'osteomancer-adept'),
        abilityIndex: 0,
        targets: [],
      }),
    );
    const cast = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.via === 'osteomancer' &&
          a.forage === g.id('p1', 'carrot-cake'),
      )!;
    g.do(cast);
    settle(g);
    if (g.decision.kind === 'scry') settle(g.do(g.legal()[0]!));
    const bear = g.id('p1', 'bear-cub');
    expect(g.obj(bear).counters?.finality).toBe(1);
  });

  it("Cruelclaw's Heist with the gift lets you cast the stolen card with any mana", () => {
    const g = game({
      p1: { hand: ['cruelclaws-heist'], battlefield: [...n('swamp', 2), ...n('swamp', 2)] },
      p2: { hand: ['bear-cub'] },
    });
    settle(cast(g, 'cruelclaws-heist', [], { kicked: true }));
    settle(g.do(g.legal()[0]!));
    const bear = g.id('p2', 'bear-cub', 'exile');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(true);
  });

  it('Glarb plays lands from the top of your library and shows you the top card', () => {
    const g = game({
      p1: { battlefield: ['glarb-calamitys-augur'], library: ['forest', 'bear-cub'] },
    });
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });
});

describe('copies and X', () => {
  it('Mockingbird enters as a copy that is also a flying Bird', () => {
    const g = game({
      p1: { hand: ['mockingbird'], battlefield: n('island', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const copy = g.legal().find((a) => a.type === 'castSpell' && a.copyOf === bear)!;
    settle(g.do(copy));
    const bird = g.state.battlefield.find(
      (id) => g.obj(id).controller === 'p1' && g.obj(id).originalDefId === 'mockingbird',
    )!;
    const c = getCharacteristics(g.state, cardDb, bird);
    expect(g.obj(bird).defId).toBe('bear-cub');
    expect(c.subtypes).toContain('Bird');
    expect([...c.keywords]).toContain('flying');
    expect(pt(g, bird)).toEqual([2, 2]);
  });

  it('Hugs exiles X cards you may play', () => {
    const g = game({
      p1: {
        hand: ['hugs-grisly-guardian'],
        battlefield: [...n('mountain', 3), ...n('forest', 3)],
        library: n('plains', 5),
      },
    });
    const x2 = g.legal().find((a) => a.type === 'castSpell' && a.x === 2)!;
    settle(g.do(x2));
    expect(g.state.players.p1.exile).toHaveLength(2);
  });

  it('Stormsplitter copies itself when you cast an instant, and the copy leaves at end of turn', () => {
    const g = game({
      p1: { hand: ['playful-shove'], battlefield: [...n('mountain', 2), 'stormsplitter'] },
    });
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    expect(all(g, 'stormsplitter')).toHaveLength(2);
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'stormsplitter')).toHaveLength(1);
  });

  it("Dragonhawk deals 2 per card still exiled at its controller's next end step", () => {
    const g = game({
      p1: {
        hand: ['dragonhawk-fates-tempest'],
        battlefield: n('mountain', 5),
        library: n('forest', 5),
      },
    });
    settle(cast(g, 'dragonhawk-fates-tempest'));
    expect(g.state.players.p1.exile).toHaveLength(1); // Dragonhawk itself has power 5
    g.passUntilStep('end');
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});
