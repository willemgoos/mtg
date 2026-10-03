import { describe, expect, it } from 'vitest';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12c): Counter Blitz's counters — proliferate,
// Hardened Scales, saddle, hideaway, "enters with additional counters",
// Luminous Broodmoth, Esper Origins' flashback, Syncopate's X.

describe('Counter Blitz (12c)', () => {
  it('Hardened Scales adds one, before The Earth Crystal doubles', () => {
    const g = game({
      p1: {
        hand: ['combat-tutorial'],
        battlefield: ['hardened-scales', 'the-earth-crystal', 'savannah-lions', ...n('island', 3)],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'combat-tutorial', [g.ref(lions)]);
    settle(g);
    // (1 + 1) × 2 = 4 counters.
    expect(pt(g, lions)).toEqual([6, 5]);
  });

  it('proliferate: your counters grow, an opponent’s stun counter too', () => {
    const g = game({
      p1: {
        battlefield: ['inexorable-tide', 'savannah-lions'],
        hand: ['opt'],
        library: n('island', 5),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).counters = { stun: 1 };
    g.obj(angel).plusOneCounters = 1;
    g.state.players.p1.pool = [{ produces: ['U'] }];
    cast(g, 'opt');
    settle(g);
    expect(g.obj(lions).plusOneCounters).toBe(2);
    expect(g.obj(angel).counters?.stun).toBe(2);
    expect(g.obj(angel).plusOneCounters).toBe(1);
  });

  it('saddle: a saddled Mount gets its attack trigger', () => {
    const g = game({
      p1: { battlefield: ['district-mascot', 'savannah-lions'] },
    });
    const mascot = g.id('p1', 'district-mascot');
    g.obj(mascot).plusOneCounters = 1;
    const saddle = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === mascot && a.targets.length === 0);
    expect(saddle).toBeDefined();
    g.do(saddle!);
    settle(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(mascot);
    settle(g);
    expect(g.obj(mascot).plusOneCounters).toBe(2);
  });

  it('hideaway: Fight Rigging exiles one of the top five, played free with power 7', () => {
    const g = game({
      p1: {
        hand: ['fight-rigging'],
        battlefield: [...n('forest', 3), 'gigantosaurus'],
        library: ['forest', 'serra-angel', 'forest', 'forest', 'forest', ...n('island', 5)],
      },
    });
    cast(g, 'fight-rigging');
    settle(g);
    const rigging = g.id('p1', 'fight-rigging');
    const hidden = g.obj(rigging).exiledWith ?? [];
    expect(hidden.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
    for (let i = 0; i < 10 && g.decision.kind !== 'castFree'; i++) {
      if (g.decision.kind === 'chooseTriggerTargets') settle(g);
      else g.pass();
    }
    expect(g.decision.kind).toBe('castFree');
  });

  it('a creature spell can enter with additional counters (Torgal: one per Dog or Wolf)', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['torgal-a-fine-hound', 'plains'] },
    });
    // Savannah Lions is a Cat, not a Human: no bonus.
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(0);
    // Rosa is a Human: one counter for Torgal (a Wolf).
    const h = game({
      p1: {
        hand: ['rosa-resolute-white-mage'],
        battlefield: ['torgal-a-fine-hound', ...n('plains', 4)],
      },
    });
    cast(h, 'rosa-resolute-white-mage');
    settle(h);
    expect(h.obj(h.id('p1', 'rosa-resolute-white-mage')).plusOneCounters).toBe(1);
  });

  it('Luminous Broodmoth returns a creature once, with a flying counter', () => {
    const g = game({
      p1: { battlefield: ['luminous-broodmoth', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'shock', [g.ref(lions)]);
    settle(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.obj(lions).counters?.flying).toBe(1);
  });

  it('Esper Origins cast from the graveyard returns as Summon: Esper Maduin', () => {
    const g = game({
      p1: { graveyard: ['esper-origins'], battlefield: n('forest', 4), library: n('forest', 6) },
    });
    const card = g.state.players.p1.graveyard[0]!;
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card)!);
    settle(g);
    for (let i = 0; i < 5 && g.decision.kind === 'scry'; i++) g.do(g.legal()[0]!);
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(g.obj(card).defId).toBe('summon-esper-maduin');
    expect(g.obj(card).counters?.finality).toBe(1);
    expect(g.obj(card).counters?.lore).toBe(1);
  });

  it('Syncopate counters unless its controller pays {X}', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['syncopate'], battlefield: n('island', 3) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    const shock = g.state.stack[0]!.id;
    g.pass();
    g.do(
      g
        .legal()
        .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'syncopate' && a.x === 2)!,
    );
    settle(g);
    expect(g.zoneOf(shock)).toBe('graveyard');
    expect(g.life('p2')).toBe(20);
    expect(all(g, 'mountain')).toHaveLength(1);
  });
});
