import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

/** Casts Clash of the Eikons to put a lore counter on the Saga (its next chapter triggers). */
function addLore(g: GameDriver, saga: string) {
  const mode = cardDb
    .get('clash-of-the-eikons')!
    .modes!.findIndex((m) => m.label === 'Add a lore counter');
  cast(g, 'clash-of-the-eikons', [g.ref(saga)], { mode });
  settle(g);
}

// Final Fantasy 11a: cards of Heroes' Arsenal (R/W) and Eidolons' Call (G/W).

describe("Heroes' Arsenal", () => {
  it('Slash of Light counts creatures and Equipment you control', () => {
    const g = game({
      p1: {
        hand: ['slash-of-light'],
        battlefield: [...n('plains', 2), 'coeurl', 'dwarven-castle-guard', 'crystal-fragments'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'slash-of-light', [g.ref(angel)]));
    expect(g.obj(angel).damage).toBe(3);
  });

  it('Zidane steals a creature until end of turn, untapped with haste and lifelink', () => {
    const g = game({
      p1: {
        hand: ['zidane-tantalus-thief'],
        battlefield: [...n('plains', 3), ...n('mountain', 2)],
      },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'zidane-tantalus-thief'));
    expect(g.obj(angel).controller).toBe('p1');
    expect(g.obj(angel).tapped).toBe(false);
  });

  it("Machinist's Arsenal: +2/+2 for each artifact you control", () => {
    const g = game({
      p1: { hand: ['machinists-arsenal'], battlefield: [...n('plains', 5), 'crystal-fragments'] },
    });
    settle(cast(g, 'machinists-arsenal'));
    const hero = g.state.battlefield.find((id) => g.obj(id).defId === 'fin-hero-token')!;
    expect(pt(g, hero)).toEqual([5, 5]);
  });

  it('Crystal Fragments transforms into Summon: Alexander, whose chapter I prevents damage to your creatures', () => {
    const g = game({
      p1: { battlefield: ['crystal-fragments', ...n('plains', 7), 'coeurl'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const frag = g.id('p1', 'crystal-fragments');
    g.do({ type: 'activateAbility', player: 'p1', source: frag, abilityIndex: 1, targets: [] });
    settle(g);
    expect(g.obj(frag).defId).toBe('summon-alexander');
    const coeurl = g.id('p1', 'coeurl');
    g.pass();
    const shock = g
      .legal('p2')
      .find(
        (a) =>
          a.type === 'castSpell' &&
          'targets' in a &&
          a.targets.some((t) => 'object' in t && t.object.id === coeurl),
      )!;
    settle(g.do(shock));
    expect(g.zoneOf(coeurl)).toBe('battlefield');
    expect(g.obj(coeurl).damage).toBe(0);
  });
});

describe("Eidolons' Call", () => {
  it('Summon: Fenrir chapter II: the next creature spell enters with a +1/+1 counter', () => {
    const g = game({
      p1: {
        hand: ['coeurl', 'clash-of-the-eikons'],
        battlefield: [...n('plains', 2), 'forest', 'summon-fenrir'],
      },
    });
    const fenrir = g.id('p1', 'summon-fenrir');
    g.obj(fenrir).counters = { lore: 1 };
    addLore(g, fenrir);
    expect(g.obj(fenrir).counters?.lore).toBe(2);
    settle(cast(g, 'coeurl'));
    expect(pt(g, g.id('p1', 'coeurl'))).toEqual([3, 3]);
  });

  it('Rinoa makes Angelo and pumps another attacker by your creature count', () => {
    const g = game({
      p1: {
        hand: ['rinoa-heartilly'],
        battlefield: [...n('forest', 3), ...n('plains', 2), 'coeurl'],
      },
    });
    settle(cast(g, 'rinoa-heartilly'));
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'angelo-token')).toBe(true);
  });

  it('Summon: Titan chapter II returns lands from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['summon-titan', 'clash-of-the-eikons'],
        battlefield: n('forest', 6),
        library: n('plains', 6),
      },
    });
    settle(cast(g, 'summon-titan'));
    expect(g.state.players.p1.graveyard.length).toBe(5);
    const forests = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    // Two forests to the graveyard first (as if destroyed), then chapter II brings them back.
    for (const id of forests.slice(0, 2)) {
      g.state.battlefield.splice(g.state.battlefield.indexOf(id), 1);
      g.state.players.p1.graveyard.push(id);
      g.obj(id).zone = 'graveyard';
    }
    addLore(g, g.id('p1', 'summon-titan'));
    // The five milled Plains come back too.
    expect(
      g.state.players.p1.graveyard.filter((id) => g.obj(id).defId !== 'clash-of-the-eikons'),
    ).toEqual([]);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'plains').length).toBe(5);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest').length).toBe(6);
  });
});
