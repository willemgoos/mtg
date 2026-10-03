import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12a): Revival Trance's new rules — tiered, "creature
// or artifact you control dies", cards leaving your graveyard, creatures
// entering from a graveyard, back-face death triggers, Pathways, Starting Town.

const castable = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
/** Passes (resolving triggers) until p1 declares attackers. */
const toAttack = (g: ReturnType<typeof game>) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++)
    if (g.decision.kind === 'chooseTriggerTargets' || g.state.stack.length) settle(g);
    else g.pass();
  return g;
};

describe('Revival Trance (12a)', () => {
  it('tiered: each mode adds its own cost (Fire Magic)', () => {
    const g = game({
      p1: { hand: ['fire-magic'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const modes = castable(g, 'fire-magic').map((a) => (a.type === 'castSpell' ? a.mode : -1));
    // Fire ({R}) and Fira ({R}+{2}) are affordable with three lands; Firaga ({R}+{5}) isn't.
    expect(modes.sort()).toEqual([0, 1]);
    cast(g, 'fire-magic', [], { mode: 1 });
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.obj(all(g, 'serra-angel')[0]!).damage).toBe(2);
  });

  it('"a creature or artifact you control dies" sees a sacrificed Treasure token (Al Bhed Salvagers)', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['al-bhed-salvagers', 'treasure-token'] },
      p2: { battlefield: ['treasure-token'] },
    });
    // The Treasure pays for Shock and is sacrificed.
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
    expect(g.life('p2')).toBe(20 - 2 - 1);
    expect(g.life('p1')).toBe(21);
  });

  it('cards leaving your graveyard draw once each turn (Fang)', () => {
    const g = game({
      p1: {
        hand: ['reanimate', 'evil-reawakened'],
        graveyard: ['serra-angel', 'savannah-lions'],
        battlefield: ['fang-fearless-lcie', ...n('swamp', 6)],
      },
    });
    const before = handSize(g, 'p1');
    cast(g, 'reanimate', [g.ref(g.state.players.p1.graveyard[0]!)]);
    settle(g);
    // Cast Reanimate (-1), drew one for Serra Angel leaving the graveyard (+1).
    expect(handSize(g, 'p1')).toBe(before);
    expect(g.life('p1')).toBe(20 - 5 - 1);
  });

  it('creatures entering from a graveyard put counters on your team (Celes)', () => {
    const g = game({
      p1: {
        hand: ['evil-reawakened'],
        graveyard: ['savannah-lions'],
        battlefield: ['celes-rune-knight', ...n('swamp', 5)],
      },
    });
    const lions = g.state.players.p1.graveyard[0]!;
    cast(g, 'evil-reawakened', [g.ref(lions)]);
    settle(g);
    // Evil Reawakened's two counters plus Celes's one.
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(pt(g, g.id('p1', 'celes-rune-knight'))).toEqual([5, 5]);
  });

  it("a back face's dies trigger runs (Galian Beast returns front face up)", () => {
    const g = game({
      p1: { battlefield: ['vincent-valentine', ...n('swamp', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const vincent = g.id('p1', 'vincent-valentine');
    toAttack(g);
    g.attack(vincent);
    settle(g);
    if (g.decision.kind === 'optionalEffect')
      g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.obj(vincent).defId).toBe('galian-beast');
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) settle(g.pass());
    g.block([g.id('p2', 'serra-angel'), vincent]);
    for (let i = 0; i < 10 && g.state.turn.step !== 'endCombat'; i++) settle(g.pass());
    expect(g.zoneOf(vincent)).toBe('battlefield');
    expect(g.obj(vincent).defId).toBe('vincent-valentine');
    expect(g.obj(vincent).tapped).toBe(true);
  });

  it('Pathways ask for a face as they enter and tap for its colour', () => {
    const g = game({ p1: { hand: ['brightclimb-pathway'] } });
    const card = g.id('p1', 'brightclimb-pathway', 'hand');
    g.do({ type: 'playLand', player: 'p1', card });
    settle(g);
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error(d.kind);
    expect(d.options.map((o) => o.label)).toEqual([
      'Brightclimb Pathway ({W})',
      'Grimclimb Pathway ({B})',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(g.obj(card).chosenColor).toBe('B');
  });

  it('Starting Town enters untapped only in the first three turns', () => {
    const early = game({ turn: 3, p1: { hand: ['starting-town'] } });
    early.do({ type: 'playLand', player: 'p1', card: early.id('p1', 'starting-town', 'hand') });
    expect(early.obj(early.id('p1', 'starting-town')).tapped).toBe(false);
    const late = game({ turn: 9, p1: { hand: ['starting-town'] } });
    late.do({ type: 'playLand', player: 'p1', card: late.id('p1', 'starting-town', 'hand') });
    expect(late.obj(late.id('p1', 'starting-town')).tapped).toBe(true);
  });

  it("Terra's combat damage may pay {2} to return a small creature tapped", () => {
    const g = game({
      p1: {
        graveyard: ['savannah-lions'],
        battlefield: ['terra-herald-of-hope', ...n('plains', 2)],
        library: n('plains', 10),
      },
    });
    const terra = g.id('p1', 'terra-herald-of-hope');
    toAttack(g);
    // Trance milled two cards and gave Terra flying.
    expect(g.state.players.p1.graveyard).toHaveLength(3);
    g.attack(terra);
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    settle(g);
    const lions = all(g, 'savannah-lions')[0];
    expect(lions).toBeDefined();
    expect(g.obj(lions!).tapped).toBe(true);
    expect(g.life('p2')).toBe(17);
  });
});
