import { describe, expect, it } from 'vitest';
import { redactFor } from '../src/index.ts';
import { Game, scenario } from './helpers.ts';

describe('two-colour lands', () => {
  it('a land that enters tapped comes in tapped', () => {
    const g = new Game(scenario({ p1: { hand: ['gate'] } }));
    const gate = g.id('p1', 'gate', 'hand');
    g.do({ type: 'playLand', player: 'p1', card: gate });
    expect(g.obj(gate).tapped).toBe(true);
  });

  it('a dual land pays for either colour', () => {
    const g = new Game(scenario({ p1: { hand: ['gruul-bear'], battlefield: ['gate', 'gate'] } }));
    const bear = g.id('p1', 'gruul-bear', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(true);
  });

  it('payment assigns flexible sources where they are needed', () => {
    // {1}{R}{R}{G} from mountain, mountain, forest-ish gate and a gate: the gates must cover G and generic.
    const g = new Game(
      scenario({
        p1: { hand: ['big-gruul'], battlefield: ['gate', 'mountain', 'gate', 'mountain'] },
      }),
    );
    const card = g.id('p1', 'big-gruul', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    expect(g.state.battlefield.every((id) => g.obj(id).tapped)).toBe(true);
  });

  it('cannot pay when the colours are not there', () => {
    const g = new Game(
      scenario({ p1: { hand: ['gruul-bear'], battlefield: ['mountain', 'mountain'] } }),
    );
    const bear = g.id('p1', 'gruul-bear', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(false);
  });
});

describe('scry', () => {
  it('a temple asks its controller to scry 1; bottom moves the card down', () => {
    const g = new Game(scenario({ p1: { hand: ['temple'], library: ['ogre', 'bear', 'wall'] } }));
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'temple', 'hand') });
    g.passBoth(); // resolve the enters trigger
    const d = g.decision;
    expect(d.kind).toBe('scry');
    if (d.kind !== 'scry') return;
    const top = d.cards[0]!;
    expect(g.obj(top).defId).toBe('ogre');
    expect(g.legal('p1')).toHaveLength(2);
    g.do({ type: 'scry', player: 'p1', top: [], bottom: [top] });
    const lib = g.state.players.p1.library;
    expect(lib.at(-1)).toBe(top);
    expect(g.obj(lib[0]!).defId).toBe('bear');
    expect(g.decision).toMatchObject({ kind: 'priority', player: 'p1' });
  });

  it('effects after a scry wait for the answer, and the spell finishes resolving', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['peek'], battlefield: ['mountain'], library: ['ogre', 'bear', 'wall'] },
      }),
    );
    const peek = g.id('p1', 'peek', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: peek, targets: [] });
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'scry') throw new Error('expected scry');
    expect(d.cards).toHaveLength(2);
    expect(g.state.players.p1.hand).toHaveLength(0); // no draw yet
    expect(g.zoneOf(peek)).toBe('stack');
    const [ogre, bear] = d.cards as [string, string];
    g.do({ type: 'scry', player: 'p1', top: [bear], bottom: [ogre] });
    expect(g.state.players.p1.hand).toEqual([bear]);
    expect(g.zoneOf(peek)).toBe('graveyard');
    expect(g.state.players.p1.library.at(-1)).toBe(ogre);
  });

  it('the scrying player can see the cards; the opponent cannot', () => {
    const g = new Game(scenario({ p1: { hand: ['temple'], library: ['ogre', 'bear'] } }));
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'temple', 'hand') });
    g.passBoth();
    const top = g.state.players.p1.library[0]!;
    expect(redactFor(g.state, 'p1').objects[top]!.defId).toBe('ogre');
    expect(redactFor(g.state, 'p2').objects[top]!.defId).toBe('?');
  });

  it('scrying an empty library does nothing', () => {
    const g = new Game(scenario({ p1: { hand: ['temple'], library: [] } }));
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'temple', 'hand') });
    g.passBoth();
    expect(g.decision.kind).toBe('priority');
  });
});

describe('legend rule', () => {
  it('a second copy of a legendary permanent replaces the first', () => {
    const g = new Game(scenario({ p1: { hand: ['legend'], battlefield: ['legend', 'mountain'] } }));
    const old = g.id('p1', 'legend');
    const fresh = g.id('p1', 'legend', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: fresh, targets: [] });
    g.passBoth();
    expect(g.zoneOf(fresh)).toBe('battlefield');
    expect(g.zoneOf(old)).toBe('graveyard');
  });

  it('each player may control their own copy', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['legend'], battlefield: ['mountain'] },
        p2: { battlefield: ['legend'] },
      }),
    );
    const theirs = g.id('p2', 'legend');
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'legend', 'hand'), targets: [] });
    g.passBoth();
    expect(g.zoneOf(theirs)).toBe('battlefield');
  });
});

describe('cloneState', () => {
  it('copies named counters instead of sharing them', async () => {
    const { cloneState } = await import('../src/index.ts');
    const s = scenario({ p1: { battlefield: ['bear'] } });
    const id = s.battlefield[0]!;
    s.objects[id]!.counters = { incubation: 3 };
    const c = cloneState(s);
    c.objects[id]!.counters!.incubation = 0;
    expect(s.objects[id]!.counters!.incubation).toBe(3);
  });
});
