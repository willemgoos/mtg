import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11b (group B): Turks' Contract (W/B) and Forbidden Magicks (U/R).

/** Ahriman: "{3}, Sacrifice another creature or artifact: Draw a card." */
function ahriman(g: GameDriver, fodder: string) {
  const source = g.id('p1', 'ahriman');
  g.do(
    g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === source && a.sacrifice === fodder)!,
  );
  settle(g);
}

/** Resolves everything, saying yes to "you may" and taking the first option elsewhere. */
function drive(g: GameDriver) {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'priority' && !g.state.stack.length) return;
    if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept: true });
    else if (d.kind === 'priority') g.pass();
    else g.do(g.legal()[0]!);
  }
}

describe("Turks' Contract: creatures and artifacts dying", () => {
  it('Judge Magister Gabranth grows when your creature or artifact dies, not an opponent’s', () => {
    const g = game({
      p1: {
        hand: ['sephiroths-intervention'],
        battlefield: ['judge-magister-gabranth', 'ahriman', 'magitek-infantry', ...n('swamp', 7)],
        library: n('swamp', 3),
      },
      p2: { battlefield: ['coeurl'] },
    });
    const judge = g.id('p1', 'judge-magister-gabranth');
    ahriman(g, g.id('p1', 'magitek-infantry'));
    expect(g.obj(judge).plusOneCounters).toBe(1);
    settle(cast(g, 'sephiroths-intervention', [g.ref(g.id('p2', 'coeurl'))]));
    expect(g.obj(judge).plusOneCounters).toBe(1);
    expect(pt(g, judge)).toEqual([3, 3]);
  });

  it('Al Bhed Salvagers drains when it dies itself', () => {
    const g = game({
      p1: {
        hand: ['sephiroths-intervention'],
        battlefield: ['al-bhed-salvagers', ...n('swamp', 4)],
      },
    });
    const salvagers = g.id('p1', 'al-bhed-salvagers');
    settle(cast(g, 'sephiroths-intervention', [g.ref(salvagers)]));
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(23);
  });

  it("G'raha Tia draws only once each turn", () => {
    const g = game({
      p1: {
        battlefield: ['graha-tia', 'ahriman', ...n('magitek-infantry', 2), ...n('swamp', 6)],
        library: n('plains', 5),
      },
    });
    const [a, b] = all(g, 'magitek-infantry') as [string, string];
    const hand = handSize(g, 'p1');
    ahriman(g, a);
    expect(handSize(g, 'p1')).toBe(hand + 2);
    ahriman(g, b);
    expect(handSize(g, 'p1')).toBe(hand + 3);
  });

  it("Vayne's Treachery: kicked by sacrificing an artifact, -6/-6", () => {
    const g = game({
      p1: { hand: ['vaynes-treachery'], battlefield: ['magic-pot', ...n('swamp', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const pot = g.id('p1', 'magic-pot');
    const kicked = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          !!a.kicked &&
          a.sacrifice === pot &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      );
    expect(kicked).toBeDefined();
    settle(g.do(kicked!));
    expect(g.zoneOf(pot)).toBe('graveyard');
    expect(g.zoneOf(angel)).toBe('graveyard');
    // Magic Pot's death made a Treasure.
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Rufus Shinra makes Darkstar as he attacks, only while you have none', () => {
    const g = game({ p1: { battlefield: ['rufus-shinra'] } });
    const rufus = g.id('p1', 'rufus-shinra');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(rufus);
    settle(g);
    expect(all(g, 'fin-darkstar-token')).toHaveLength(1);
    expect(cardDb.get('fin-darkstar-token')!.supertypes).toContain('Legendary');
  });

  it('Phoenix Down returns a creature card tapped, exiling itself', () => {
    const g = game({
      p1: { graveyard: ['ahriman'], battlefield: ['phoenix-down', ...n('plains', 2)] },
    });
    const down = g.id('p1', 'phoenix-down');
    const card = g.id('p1', 'ahriman', 'graveyard');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'activateAbility' && a.source === down && a.abilityIndex === 0)!,
    );
    settle(g);
    expect(g.zoneOf(down)).toBe('exile');
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(g.obj(card).tapped).toBe(true);
  });
});

describe('Forbidden Magicks: mana spent on noncreature spells', () => {
  it('Sahagin grows only when at least four mana was spent', () => {
    const g = game({
      p1: {
        hand: ['eject', 'combat-tutorial'],
        battlefield: ['sahagin', ...n('island', 7)],
        library: n('island', 6),
      },
      p2: { battlefield: ['coeurl'] },
    });
    const sahagin = g.id('p1', 'sahagin');
    settle(cast(g, 'combat-tutorial', [{ player: 'p1' }]));
    expect(g.obj(sahagin).plusOneCounters).toBe(0);
    settle(cast(g, 'eject', [g.ref(g.id('p2', 'coeurl'))]));
    expect(g.obj(sahagin).plusOneCounters).toBe(1);
  });

  it('Shantotto gets +X/+0 for the mana spent, and draws at four or more', () => {
    const g = game({
      p1: {
        hand: ['light-of-judgment'],
        battlefield: ['shantotto-tactician-magician', ...n('mountain', 5)],
        library: n('island', 3),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const shantotto = g.id('p1', 'shantotto-tactician-magician');
    settle(cast(g, 'light-of-judgment', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(pt(g, shantotto)).toEqual([5, 4]);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it("The Emperor of Palamecia's mana is only for noncreature spells", () => {
    const g = game({
      p1: {
        hand: ['sahagin', 'dreams-of-laguna'],
        battlefield: ['the-emperor-of-palamecia', 'island'],
      },
    });
    const castable = (id: string) =>
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === id);
    expect(castable('sahagin')).toBe(false);
    expect(castable('dreams-of-laguna')).toBe(true);
  });

  it('The Emperor of Palamecia transforms with its third counter', () => {
    const g = game({
      p1: {
        hand: ['eject'],
        battlefield: ['the-emperor-of-palamecia', ...n('island', 4)],
        library: n('island', 3),
      },
      p2: { battlefield: ['coeurl'] },
    });
    const emperor = g.id('p1', 'the-emperor-of-palamecia');
    g.obj(emperor).plusOneCounters = 2;
    settle(cast(g, 'eject', [g.ref(g.id('p2', 'coeurl'))]));
    expect(g.obj(emperor).defId).toBe('the-lord-master-of-hell');
    expect(g.obj(emperor).plusOneCounters).toBe(3);
  });

  it('Tellah makes a Hero for any noncreature spell and draws two at four mana', () => {
    const g = game({
      p1: {
        hand: ['eject'],
        battlefield: ['tellah-great-sage', ...n('island', 4)],
        library: n('island', 3),
      },
      p2: { battlefield: ['coeurl'] },
    });
    settle(cast(g, 'eject', [g.ref(g.id('p2', 'coeurl'))]));
    expect(all(g, 'fin-hero-token')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Ice Magic (Blizzaga) shuffles the creature into its owner’s library', () => {
    const g = game({
      p1: { hand: ['ice-magic'], battlefield: n('island', 8) },
      p2: { battlefield: ['serra-angel'], library: n('plains', 5) },
    });
    const angel = g.id('p2', 'serra-angel');
    const blizzaga = cardDb.get('ice-magic')!.modes!.findIndex((m) => m.label === 'Blizzaga');
    settle(cast(g, 'ice-magic', [g.ref(angel)], { mode: blizzaga }));
    expect(g.zoneOf(angel)).toBe('library');
    expect(g.state.players.p2.library).toHaveLength(6);
  });

  it("Shambling Cie'th returns from your graveyard as you cast a noncreature spell, for {B}", () => {
    const g = game({
      p1: {
        hand: ['dreams-of-laguna'],
        graveyard: ['shambling-cieth'],
        battlefield: [...n('island', 3), 'swamp'],
        library: n('island', 3),
      },
    });
    const cieth = g.id('p1', 'shambling-cieth', 'graveyard');
    cast(g, 'dreams-of-laguna');
    drive(g);
    expect(g.zoneOf(cieth)).toBe('hand');
  });
});
