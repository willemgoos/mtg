import { describe, expect, it } from 'vitest';
import { Game, scenario } from './helpers.ts';

// Secrets of Strixhaven 14a: prepare, opus, repartee, infusion, increment, converge, paradigm.

function settle(g: Game): Game {
  for (let i = 0; i < 20 && (g.state.stack.length > 0 || g.state.pendingTriggers.length > 0); i++)
    g.passBoth();
  return g;
}

const cast = (g: Game, card: string, ...targets: string[]) =>
  g.do({
    type: 'castSpell',
    player: 'p1',
    card: g.id('p1', card, 'hand'),
    targets: targets.map((t) => g.ref(g.id('p1', t))),
  });

/** The exiled copies of a prepare spell. */
const exiled = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.state.players[player].exile.filter((id) => g.obj(id).defId === defId);

describe('prepare', () => {
  it('a creature that enters prepared gets a copy of its spell in exile', () => {
    const g = new Game(
      scenario({ p1: { hand: ['prep-glass'], battlefield: ['forest', 'forest'] } }),
    );
    settle(cast(g, 'prep-glass'));
    const glass = g.id('p1', 'prep-glass');
    expect(g.obj(glass).prepared).toBeDefined();
    expect(exiled(g, 'p1', 'prep-glass-spell')).toEqual([g.obj(glass).prepared]);
    expect(g.obj(g.obj(glass).prepared!).preparedBy).toBe(glass);
  });

  it("can't cast the prepare spell from hand (only the creature)", () => {
    const g = new Game(scenario({ p1: { hand: ['prep-glass'], battlefield: ['forest'] } }));
    const casts = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'prep-glass', 'hand'));
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.some((a) => a.type === 'castSpell' && a.back)).toBe(false);
  });

  it('the controller may cast the copy; it unprepares the creature and then ceases to exist', () => {
    const g = new Game(
      scenario({ p1: { hand: ['prep-glass'], battlefield: ['forest', 'forest'] } }),
    );
    settle(cast(g, 'prep-glass'));
    const glass = g.id('p1', 'prep-glass');
    const copy = g.obj(glass).prepared!;
    // Only the controller can cast it.
    expect(g.legal('p2').some((a) => a.type === 'castSpell' && a.card === copy)).toBe(false);
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === copy)).toBe(true);
    const handBefore = g.state.players.p1.hand.length;
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    // Casting it unprepares the creature at once; it is a cast (events see it).
    expect(g.obj(glass).prepared).toBeUndefined();
    expect(g.events.some((e) => e.type === 'spellCast' && e.id === copy)).toBe(true);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(handBefore + 1);
    expect(g.zoneOf(copy)).toBe('gone');
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    expect(g.zoneOf(glass)).toBe('battlefield');
    expect(exiled(g, 'p1', 'prep-glass-spell')).toHaveLength(0);
  });

  it('the copy goes away when the creature leaves the battlefield', () => {
    const g = new Game(
      scenario({ p1: { hand: ['prep-glass', 'sos-bounce'], battlefield: ['forest'] } }),
    );
    settle(cast(g, 'prep-glass'));
    const glass = g.id('p1', 'prep-glass');
    const copy = g.obj(glass).prepared!;
    settle(cast(g, 'sos-bounce', 'prep-glass'));
    expect(g.zoneOf(glass)).toBe('hand');
    expect(g.zoneOf(copy)).toBe('gone');
    expect(exiled(g, 'p1', 'prep-glass-spell')).toHaveLength(0);
    expect(g.obj(glass).prepared).toBeUndefined();
  });

  it("a prepared creature can't be prepared again (no second copy)", () => {
    const g = new Game(
      scenario({
        p1: { hand: ['sos-draw', 'sos-draw'], battlefield: ['prep-trigger', 'forest', 'forest'] },
      }),
    );
    const t = g.id('p1', 'prep-trigger');
    expect(g.obj(t).prepared).toBeUndefined();
    settle(cast(g, 'sos-draw'));
    const copy = g.obj(t).prepared;
    expect(copy).toBeDefined();
    settle(cast(g, 'sos-draw'));
    expect(g.obj(t).prepared).toBe(copy);
    expect(exiled(g, 'p1', 'prep-trigger-spell')).toHaveLength(1);
  });

  it('becomes prepared from a trigger, and again after its copy is cast', () => {
    const g = new Game(
      scenario({ p1: { hand: ['sos-draw'], battlefield: ['prep-trigger', 'forest'] } }),
    );
    const t = g.id('p1', 'prep-trigger');
    settle(cast(g, 'sos-draw'));
    const copy = g.obj(t).prepared!;
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    expect(g.obj(t).prepared).toBeUndefined();
    settle(g);
    // Casting the copy was a spell cast, so it prepared the creature anew.
    expect(g.obj(t).prepared).toBeDefined();
    expect(g.obj(t).prepared).not.toBe(copy);
    expect(g.life('p1')).toBe(23);
  });
});

describe('opus', () => {
  it('one counter for a small spell, two when five or more mana was spent', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['sos-draw', 'sos-big-draw'],
          battlefield: ['opus-mage', ...Array<string>(6).fill('forest')],
        },
      }),
    );
    const m = g.id('p1', 'opus-mage');
    settle(cast(g, 'sos-draw'));
    expect(g.obj(m).plusOneCounters).toBe(1);
    settle(cast(g, 'sos-big-draw'));
    expect(g.obj(m).plusOneCounters).toBe(1 + 2);
  });
});

describe('repartee', () => {
  it('triggers only for an instant or sorcery that targets a creature', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['sos-draw', 'sos-zap'],
          battlefield: ['repartee-mage', 'bear', 'forest', 'forest'],
        },
      }),
    );
    const m = g.id('p1', 'repartee-mage');
    settle(cast(g, 'sos-draw'));
    expect(g.obj(m).plusOneCounters).toBe(0);
    settle(cast(g, 'sos-zap', 'bear'));
    expect(g.obj(m).plusOneCounters).toBe(1);
  });
});

describe('infusion', () => {
  it('has its extra effect only if you gained life this turn', () => {
    const draws = (heal: boolean) => {
      const g = new Game(
        scenario({ p1: { hand: heal ? ['sos-heal', 'infusion-draw'] : ['infusion-draw'] } }),
      );
      if (heal) settle(cast(g, 'sos-heal'));
      const before = g.state.players.p1.hand.length;
      settle(cast(g, 'infusion-draw'));
      // The spell itself left the hand.
      return g.state.players.p1.hand.length - before + 1;
    };
    expect(draws(false)).toBe(1);
    expect(draws(true)).toBe(2);
  });
});

describe('increment', () => {
  it('a counter when the mana spent exceeds the lesser of power and toughness', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['sos-draw', 'converge-draw', 'sos-heal'],
          battlefield: ['incr-mage', 'forest', 'forest', 'forest', 'forest', 'forest'],
        },
      }),
    );
    const m = g.id('p1', 'incr-mage');
    // 0 mana is not more than 1.
    settle(cast(g, 'sos-heal'));
    expect(g.obj(m).plusOneCounters).toBe(0);
    // 1 mana is not more than 1.
    settle(cast(g, 'sos-draw'));
    expect(g.obj(m).plusOneCounters).toBe(0);
    // 3 mana is more than 1.
    settle(cast(g, 'converge-draw'));
    expect(g.obj(m).plusOneCounters).toBe(1);
  });
});

describe('converge', () => {
  it('counts the colours of mana spent, not the mana', () => {
    const draws = (lands: string[]) => {
      const g = new Game(scenario({ p1: { hand: ['converge-draw'], battlefield: lands } }));
      const before = g.state.players.p1.hand.length;
      settle(cast(g, 'converge-draw'));
      return g.state.players.p1.hand.length - before + 1;
    };
    expect(draws(['forest', 'forest', 'forest'])).toBe(1);
    expect(draws(['forest', 'mountain', 'forest'])).toBe(2);
  });

  it('a creature enters with a counter for each colour spent', () => {
    const g = new Game(
      scenario({ p1: { hand: ['converge-bear'], battlefield: ['forest', 'mountain', 'forest'] } }),
    );
    settle(cast(g, 'converge-bear'));
    const b = g.id('p1', 'converge-bear');
    expect(g.obj(b).plusOneCounters).toBe(2);
    expect(g.obj(b).manaColors).toEqual(['R', 'G']);
  });
});

describe('paradigm', () => {
  it('is exiled when it resolves, and you may cast a copy at each of your first main phases', () => {
    const g = new Game(scenario({ p1: { hand: ['paradigm-draw'], battlefield: ['forest'] } }));
    settle(cast(g, 'paradigm-draw'));
    const card = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'paradigm-draw')!;
    expect(card).toBeDefined();
    expect(g.state.players.p1.paradigms).toEqual(['paradigm-draw']);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    // To p1's next turn: a copy may be cast without paying.
    const atMain = () =>
      g.state.turn.number > 3 &&
      g.state.turn.activePlayer === 'p1' &&
      g.state.turn.step === 'main1';
    for (let i = 0; i < 80 && !atMain(); i++) g.pass();
    expect(atMain()).toBe(true);
    settle0(g);
    expect(g.decision.kind).toBe('castFree');
    const copy = g.legal('p1').find((a) => a.type === 'castSpell');
    expect(copy).toBeDefined();
    const handBefore = g.state.players.p1.hand.length;
    g.do(copy!);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(handBefore + 1);
    // The card stays in exile; the copy ceased to exist.
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.state.players.p1.exile).toHaveLength(1);
    expect(g.state.players.p1.paradigms).toEqual(['paradigm-draw']);
  });
});

/** Resolve the beginning-of-main trigger until a decision other than priority is up. */
function settle0(g: Game): void {
  for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.passBoth();
}
