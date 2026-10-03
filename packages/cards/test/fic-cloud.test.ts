import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12b): Limit Break's Equipment rules — job select,
// cheaper equip, extra land plays, first-combat checks, forced blocks, spree.

const equipActions = (g: ReturnType<typeof game>, defId: string) =>
  g
    .legal()
    .filter(
      (a) =>
        a.type === 'activateAbility' && g.obj(a.source).defId === defId && a.targets.length === 1,
    );

describe('Limit Break (12b)', () => {
  it('job select: the Equipment enters attached to a new 1/1 Hero', () => {
    const g = game({ p1: { hand: ['samurais-katana'], battlefield: n('mountain', 3) } });
    cast(g, 'samurais-katana');
    settle(g);
    const heroes = all(g, 'hero-1-1-token');
    expect(heroes).toHaveLength(1);
    expect(g.obj(g.id('p1', 'samurais-katana')).attachedTo).toBe(heroes[0]);
    expect(pt(g, heroes[0]!)).toEqual([3, 3]);
    const c = getCharacteristics(g.state, cardDb, heroes[0]!);
    expect(c.keywords.has('trample') && c.keywords.has('haste')).toBe(true);
  });

  it('equip abilities cost less (Arms Scavenger: {1} less)', () => {
    const g = game({
      p1: {
        battlefield: ['arms-scavenger', 'sword-of-vengeance', 'savannah-lions', ...n('plains', 2)],
      },
    });
    // Equip {3} costs {2}: two Plains are enough.
    expect(equipActions(g, 'sword-of-vengeance').length).toBeGreaterThan(0);
    const h = game({
      p1: { battlefield: ['sword-of-vengeance', 'savannah-lions', ...n('plains', 2)] },
    });
    expect(equipActions(h, 'sword-of-vengeance')).toHaveLength(0);
  });

  it('Explore: an additional land this turn', () => {
    const g = game({
      p1: { hand: ['explore', 'forest', 'mountain'], battlefield: n('forest', 2) },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);
    cast(g, 'explore');
    settle(g);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
  });

  it("Hero's Heirloom gives trample and haste only to a legendary creature", () => {
    const g = game({
      p1: {
        battlefield: ['heros-heirloom', 'savannah-lions', 'adelbert-steiner', ...n('plains', 2)],
      },
    });
    const heirloom = g.id('p1', 'heros-heirloom');
    const lions = g.id('p1', 'savannah-lions');
    const steiner = g.id('p1', 'adelbert-steiner');
    g.obj(heirloom).attachedTo = lions;
    expect(getCharacteristics(g.state, cardDb, lions).keywords.has('trample')).toBe(false);
    g.obj(heirloom).attachedTo = steiner;
    expect(getCharacteristics(g.state, cardDb, steiner).keywords.has('trample')).toBe(true);
    // Adelbert Steiner: 2/1, +1/+1 per Equipment, +2/+1 from the Heirloom.
    expect(pt(g, steiner)).toEqual([5, 3]);
  });

  it('Aettir and Priwen: base power and toughness equal to your life', () => {
    const g = game({ p1: { life: 17, battlefield: ['aettir-and-priwen', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'aettir-and-priwen')).attachedTo = lions;
    expect(pt(g, lions)).toEqual([17, 17]);
  });

  it('Requisition Raid (spree): each mode adds {1}', () => {
    const g = game({
      p1: { hand: ['requisition-raid'], battlefield: n('plains', 2) },
      p2: { battlefield: ['sol-ring'] },
    });
    const modes = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a.type === 'castSpell' ? a.mode : -1));
    // {W}+{1}: one mode at a time (the enchantment mode has no target).
    expect(modes.sort()).toEqual([0, 3]);
  });

  it('Genji Glove: an extra combat only from the first combat', () => {
    const g = game({
      p1: { battlefield: ['genji-glove', 'savannah-lions'] },
      step: 'beginCombat',
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'genji-glove')).attachedTo = lions;
    g.pass().pass();
    g.attack(lions);
    settle(g);
    expect(g.state.turn.extraCombats).toBe(1);
    expect(g.obj(lions).tapped).toBe(false);
  });

  it('Fighter Class level 3: the chosen creature blocks the attacker', () => {
    const g = game({
      p1: { battlefield: ['fighter-class', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'fighter-class')).level = 3;
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    g.pass().pass();
    g.attack(lions);
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    );
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    // p2 declares no blocks; the Angel blocks anyway.
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat?.attackers.find((a) => a.id === lions)?.blockers).toEqual([angel]);
  });
});
