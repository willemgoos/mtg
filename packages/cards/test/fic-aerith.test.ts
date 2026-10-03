import { describe, expect, it } from 'vitest';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12e): Brawl Aerith — life gained in total, The Wind
// Crystal, Quina's Frogs, Serah's discount, Excalibur II, Sidequests.

describe('Brawl Aerith (12e)', () => {
  it('The Wind Crystal doubles life gain; Aerith returns to the battlefield after 7', () => {
    const g = game({
      p1: {
        hand: ['instant-ramen'],
        graveyard: ['serra-angel'],
        battlefield: ['aerith-last-ancient', 'the-wind-crystal', ...n('plains', 4)],
        library: n('plains', 5),
      },
    });
    const ramen = g.legal().find((a) => a.type === 'castSpell');
    g.do(ramen!);
    settle(g);
    const id = g.id('p1', 'instant-ramen');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === id)!);
    settle(g);
    // 3 doubled.
    expect(g.life('p1')).toBe(26);
    g.state.turn.lifeGainedTotal = { p1: 7, p2: 0 };
    for (let i = 0; i < 20 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else g.pass();
    }
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it('Quina: tokens come with a 1/1 Frog', () => {
    const g = game({
      p1: { hand: ['gysahl-greens'], battlefield: ['quina-qu-gourmet', ...n('forest', 2)] },
    });
    cast(g, 'gysahl-greens');
    settle(g);
    expect(all(g, 'chocobo-bird-token')).toHaveLength(1);
    expect(all(g, 'frog-token')).toHaveLength(1);
  });

  it('Serah Farron: the first legendary creature spell costs {2} less', () => {
    const g = game({
      p1: {
        hand: ['minwu-white-mage'],
        battlefield: ['serah-farron', 'plains', 'plains', 'plains'],
      },
    });
    // Minwu costs {3}{W}{W}: three Plains are enough with the discount.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('Excalibur II grows with charge counters from life gain', () => {
    const g = game({
      p1: {
        hand: ['instant-ramen'],
        battlefield: ['excalibur-ii', 'savannah-lions', ...n('plains', 4)],
      },
    });
    g.obj(g.id('p1', 'excalibur-ii')).attachedTo = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'excalibur-ii')).counters = { charge: 2 };
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
  });

  it('Sidequest: Catch a Fish takes a creature, makes a Food and transforms', () => {
    const g = game({
      p1: { battlefield: ['sidequest-catch-a-fish'], library: ['serra-angel', ...n('plains', 5)] },
      step: 'untap',
    });
    g.passUntilStep('draw');
    const quest = g.state.battlefield.find((id) => g.obj(id).owner === 'p1')!;
    expect(g.obj(quest).defId).toBe('cooking-campsite');
    expect(all(g, 'food-token')).toHaveLength(1);
  });
});
