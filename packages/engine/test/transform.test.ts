import { describe, expect, it } from 'vitest';
import { Game, scenario } from './helpers.ts';

describe('transform and double-faced cards', () => {
  it('transforms in place, keeping counters and the same object', () => {
    const g = new Game(scenario({ p1: { battlefield: ['banner', 'forest', 'forest'] } }));
    const b = g.id('p1', 'banner');
    g.obj(b).plusOneCounters = 1;
    const zcc = g.obj(b).zcc;
    g.do({ type: 'activateAbility', player: 'p1', source: b, abilityIndex: 0, targets: [] });
    g.passBoth();
    expect(g.obj(b).defId).toBe('hulk');
    expect(g.obj(b).zcc).toBe(zcc);
    expect(g.obj(b).plusOneCounters).toBe(1);
    expect(g.events.some((e) => e.type === 'transformed' && e.id === b)).toBe(true);
  });

  it('turns back to its front when it leaves the battlefield', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['banner', 'forest', 'forest'] },
        p2: { battlefield: ['mountain'], hand: ['shock'] },
      }),
    );
    const b = g.id('p1', 'banner');
    g.do({ type: 'activateAbility', player: 'p1', source: b, abilityIndex: 0, targets: [] });
    g.passBoth();
    g.obj(b).damage = 7;
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(b)],
    });
    g.passBoth();
    expect(g.zoneOf(b)).toBe('graveyard');
    expect(g.obj(b).defId).toBe('banner');
    expect(g.obj(b).front).toBeUndefined();
  });

  it('a modal double-faced card can be cast as its back face', () => {
    const g = new Game(
      scenario({ p1: { hand: ['banner'], battlefield: ['forest', 'forest', 'forest'] } }),
    );
    const b = g.id('p1', 'banner', 'hand');
    const casts = g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === b);
    expect(casts.map((a) => a.type === 'castSpell' && !!a.back)).toEqual([false, true]);
    g.do({ type: 'castSpell', player: 'p1', card: b, targets: [], back: true });
    expect(g.obj(b).defId).toBe('hulk');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(3);
    g.passBoth();
    expect(g.zoneOf(b)).toBe('battlefield');
    expect(g.obj(b).defId).toBe('hulk');
  });
});
