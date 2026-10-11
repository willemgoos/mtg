import { describe, expect, it } from 'vitest';
import { find, Game, scenario, withRing } from './ltr-fixtures.ts';

// The Lord of the Rings (21a): the Ring's four abilities, gained one at a time.

/** Passes priority until the stack is empty or a choice comes up (bounded). */
const settle = (g: Game) => {
  for (let i = 0; i < 30 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

/** A combat position: p1 attacks (step: beginning of combat), with the Ring tempted `level` times. */
function combat(
  level: number,
  p1: string[],
  p2: string[],
  bearerDef = 'l-bear',
  extra: { hand?: string[]; library?: string[] } = {},
) {
  const state = scenario({
    step: 'beginCombat',
    p1: { battlefield: p1, ...extra },
    p2: { battlefield: p2 },
  });
  withRing(state, 'p1', level, find(state, 'p1', bearerDef));
  const g = new Game(state);
  g.passBoth(); // to declare attackers
  return g;
}

/** Answers discards (the Ring's loot) and passes until the defender declares blockers (bounded). */
const toBlockers = (g: Game) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) {
    if (g.decision.kind === 'discard') g.do(g.legal('p1').find((a) => a.type === 'discard')!);
    else g.pass();
  }
  expect(g.decision.kind).toBe('declareBlockers');
};

/** Plays on to the end of combat: discards answered, no blocks (bounded). */
const toEndCombat = (g: Game) => {
  for (let i = 0; i < 40; i++) {
    if (g.state.turn.step === 'endCombat' && g.decision.kind === 'priority' && g.state.stack.length === 0) return;
    if (g.decision.kind === 'discard') g.do(g.legal('p1').find((a) => a.type === 'discard')!);
    else if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
    else g.pass();
  }
  throw new Error('never reached the end of combat');
};

const blockers = (g: Game, attacker: string) =>
  g
    .legal('p2')
    .filter((a) => a.type === 'addBlock' && a.attacker === attacker)
    .map((a) => (a.type === 'addBlock' ? a.blocker : ''));

describe('Ring level 1: your Ring-bearer is legendary and can\'t be blocked by creatures with greater power', () => {
  it('creatures with greater power can\'t block it; equal or lesser can', () => {
    const g = combat(1, ['l-bear'], ['l-big', 'l-small', 'l-bear-2', 'l-giant']);
    const bear = g.id('p1', 'l-bear');
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    toBlockers(g);
    expect(new Set(blockers(g, bear))).toEqual(
      new Set([g.id('p2', 'l-small'), g.id('p2', 'l-bear-2')]),
    );
  });

  it('only the Ring-bearer is protected: the others can be blocked by anything', () => {
    const g = combat(1, ['l-bear', 'l-small'], ['l-big']);
    const [bear, small] = [g.id('p1', 'l-bear'), g.id('p1', 'l-small')];
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2' });
    g.do({ type: 'addAttacker', player: 'p1', attacker: small, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    toBlockers(g);
    expect(blockers(g, bear)).toEqual([]);
    expect(blockers(g, small)).toEqual([g.id('p2', 'l-big')]);
  });

  it('without the Ring-bearer chosen, nobody is protected', () => {
    const state = scenario({
      step: 'beginCombat',
      p1: { battlefield: ['l-bear'] },
      p2: { battlefield: ['l-big'] },
    });
    withRing(state, 'p1', 4);
    const g = new Game(state);
    g.passBoth();
    const bear = g.id('p1', 'l-bear');
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    toBlockers(g);
    expect(blockers(g, bear)).toEqual([g.id('p2', 'l-big')]);
  });
});

describe('Ring level 2: whenever your Ring-bearer attacks, draw a card, then discard a card', () => {
  it('a trigger of The Ring goes on the stack and loots', () => {
    const g = combat(2, ['l-bear'], [], 'l-bear', { hand: ['l-small'], library: ['l-big', 'l-giant'] });
    const bear = g.id('p1', 'l-bear');
    g.attack(bear);
    expect(g.state.stack).toHaveLength(1);
    const item = g.state.stack[0]!;
    expect(item.kind).toBe('ability');
    if (item.kind === 'ability') {
      expect(item.sourceDefId).toBe('ltr-the-ring');
      expect(item.controller).toBe('p1');
    }
    g.passBoth();
    // Drew l-big (the top of the library); now a discard.
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(g.decision.kind).toBe('discard');
    const discard = g.legal('p1').find((a) => a.type === 'discard')!;
    g.do(discard);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });

  it('does not trigger for another creature, or at level 1', () => {
    const g = combat(2, ['l-bear', 'l-small'], [], 'l-bear', { hand: [], library: ['l-big', 'l-giant'] });
    g.attack(g.id('p1', 'l-small'));
    expect(g.state.stack).toHaveLength(0);
    const g1 = combat(1, ['l-bear'], [], 'l-bear');
    g1.attack(g1.id('p1', 'l-bear'));
    expect(g1.state.stack).toHaveLength(0);
  });
});

describe('Ring level 3: whenever your Ring-bearer becomes blocked by a creature, that creature\'s controller sacrifices it at end of combat', () => {
  it('the creature that blocked it survives combat and is sacrificed at end of combat', () => {
    const g = combat(3, ['l-bear'], ['l-wall']);
    const [bear, wall] = [g.id('p1', 'l-bear'), g.id('p2', 'l-wall')];
    g.attack(bear);
    toBlockers(g);
    g.block([wall, bear]);
    // The trigger: a Ring ability, its subject the blocker.
    expect(g.state.stack).toHaveLength(1);
    g.passBoth();
    expect(g.state.stack).toHaveLength(0);
    expect(g.zoneOf(wall)).toBe('battlefield');
    g.passUntilStep('endCombat');
    settle(g);
    expect(g.zoneOf(wall)).toBe('graveyard');
    expect(g.zoneOf(bear)).toBe('battlefield');
  });

  it('once for each creature that blocks it', () => {
    const g = combat(3, ['l-bear'], ['l-wall', 'l-wall', 'l-small']);
    const bear = g.id('p1', 'l-bear');
    const walls = g.state.battlefield.filter((id) => g.state.objects[id]!.defId === 'l-wall');
    g.attack(bear);
    toBlockers(g);
    g.block([walls[0]!, bear], [walls[1]!, bear]);
    expect(g.state.stack).toHaveLength(2);
    g.passBoth();
    g.passBoth();
    g.passUntilStep('endCombat');
    settle(g);
    expect(walls.every((w) => g.zoneOf(w) === 'graveyard')).toBe(true);
    expect(g.zoneOf(g.id('p2', 'l-small'))).toBe('battlefield');
  });

  it('is not there at level 2', () => {
    const g = combat(2, ['l-bear'], ['l-wall'], 'l-bear', { library: ['l-big', 'l-giant'], hand: ['l-small'] });
    const [bear, wall] = [g.id('p1', 'l-bear'), g.id('p2', 'l-wall')];
    g.attack(bear);
    toBlockers(g); // through the level 2 loot
    g.block([wall, bear]);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Ring level 4: whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life', () => {
  it('3 life on top of the damage', () => {
    const g = combat(4, ['l-bear'], [], 'l-bear', { library: ['l-big', 'l-giant', 'l-small'], hand: [] });
    const bear = g.id('p1', 'l-bear');
    g.attack(bear);
    toEndCombat(g);
    // 2 combat damage, then 3 from the Ring.
    expect(g.life('p2')).toBe(15);
  });

  it('not at level 3', () => {
    const g3 = combat(3, ['l-bear'], [], 'l-bear', { library: ['l-big', 'l-giant', 'l-small'], hand: [] });
    g3.attack(g3.id('p1', 'l-bear'));
    toEndCombat(g3);
    expect(g3.life('p2')).toBe(18);
  });

  it('not when it is blocked: no combat damage to a player', () => {
    const g = combat(4, ['l-bear'], ['l-wall'], 'l-bear', { library: ['l-big', 'l-giant', 'l-small'], hand: [] });
    const [bear, wall] = [g.id('p1', 'l-bear'), g.id('p2', 'l-wall')];
    g.attack(bear);
    toBlockers(g);
    g.block([wall, bear]);
    toEndCombat(g);
    expect(g.life('p2')).toBe(20);
  });
});
