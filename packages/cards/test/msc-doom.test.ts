import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Doom Prevails (9e, without connive): mayhem, unearth, multikicker, overload,
// melee, sagas, suspend, miracle, Propaganda, discard triggers.

const castable = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const passUntil = (g: ReturnType<typeof game>, kind: string, max = 80) => {
  for (let i = 0; i < max && g.decision.kind !== kind; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else g.pass();
  }
  return g;
};

describe('Doom Prevails', () => {
  it('mayhem: a card discarded this turn can be cast from the graveyard', () => {
    const g = game({
      p1: {
        hand: ['abomination-world-ravager', 'containment-construct'],
        battlefield: [...n('mountain', 5), 'currency-converter', ...n('island', 2)],
      },
    });
    expect(castable(g, 'abomination-world-ravager')).toBe(false);
    // Currency Converter's loot discards the Abomination.
    const converter = g.id('p1', 'currency-converter');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === converter)!);
    settle(g);
    const d = g.decision;
    if (d.kind !== 'discard') throw new Error(d.kind);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'abomination-world-ravager', 'hand') });
    settle(g);
    // Currency Converter may exile it: decline.
    if (g.decision.kind === 'optionalEffect')
      g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(castable(g, 'abomination-world-ravager')).toBe(true);
  });

  it('unearth: back with haste, exiled at the next end step', () => {
    const g = game({
      p1: { graveyard: ['tri-sentinel-act-of-vengeance'], battlefield: n('plains', 7) },
    });
    const card = g.state.players.p1.graveyard[0]!;
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === card)!);
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(getCharacteristics(g.state, cardDb, card).keywords.has('haste')).toBe(true);
    passUntil(g, 'priority');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it('multikicker: Batroc enters with a counter per kick and deals damage', () => {
    const g = game({ p1: { hand: ['batroc-the-leaper'], battlefield: n('mountain', 6) } });
    const card = g.id('p1', 'batroc-the-leaper', 'hand');
    const twice = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === card && a.kickCount === 2);
    expect(twice).toBeDefined();
    g.do(twice!);
    g.passBoth();
    expect(g.obj(card).plusOneCounters).toBe(2);
    // Two triggers, each dealing 4 to the opponent.
    for (let i = 0; i < 4 && g.decision.kind === 'chooseTriggerTargets'; i++)
      g.do(
        g
          .legal()
          .find(
            (a) =>
              a.type === 'chooseTargets' &&
              a.targets.some((t) => 'player' in t && t.player === 'p2'),
          )!,
      );
    settle(g);
    expect(g.life('p2')).toBe(12);
  });

  it('overload: Vandalblast destroys each artifact you don’t control', () => {
    const g = game({
      p1: { hand: ['vandalblast'], battlefield: [...n('mountain', 5), 'sol-ring'] },
      p2: { battlefield: ['sol-ring', 'arcane-signet'] },
    });
    const card = g.id('p1', 'vandalblast', 'hand');
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card && a.kicked)!);
    settle(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(0);
    expect(all(g, 'sol-ring')).toHaveLength(1);
  });

  it('melee: Titania’s creatures get +1/+1 as they attack', () => {
    const g = game({
      p1: { battlefield: ['titania-proud-pummeler', 'savannah-lions'] },
      step: 'beginCombat',
    });
    g.pass().pass();
    g.attack(g.id('p1', 'savannah-lions'));
    settle(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
  });

  it('sagas: Age of Ultron goes through its chapters and is sacrificed', () => {
    const g = game({
      p1: { hand: ['age-of-ultron'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'age-of-ultron');
    g.passBoth();
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    const saga = g.id('p1', 'age-of-ultron');
    expect(g.obj(saga).counters?.lore).toBe(1);
    // Next turn's precombat main: chapter II makes a Robot.
    passUntil(g, 'priority');
    g.passUntilStep('end').passUntilStep('main1');
    g.passUntilStep('end').passUntilStep('main1');
    settle(g);
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(all(g, 'robot-villain-token')).toHaveLength(1);
    g.passUntilStep('end').passUntilStep('main1');
    g.passUntilStep('end').passUntilStep('main1');
    settle(g);
    // Chapter III, then sacrificed.
    expect(g.zoneOf(saga)).toBe('graveyard');
    expect(g.obj(all(g, 'robot-villain-token')[0]!).plusOneCounters).toBe(1);
  });

  it('suspend: Kang Prime suspends the next nonland card; it’s cast free two upkeeps later', () => {
    const g = game({
      p1: {
        hand: ['kang-prime'],
        battlefield: [...n('island', 3), ...n('swamp', 2)],
        library: ['island', 'savannah-lions', ...n('island', 8)],
      },
    });
    cast(g, 'kang-prime');
    g.passBoth();
    settle(g);
    const lions = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'savannah-lions')!;
    expect(g.obj(lions).suspended).toBe(true);
    expect(g.obj(lions).counters?.time).toBe(2);
    for (let turn = 0; turn < 2; turn++) {
      g.passUntilStep('end');
      passUntil(g, 'castFree', 120);
      if (g.decision.kind === 'castFree') break;
    }
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(getCharacteristics(g.state, cardDb, lions).keywords.has('haste')).toBe(true);
  });

  it('miracle {0}: Molecule Man casts the first card you draw each turn for free', () => {
    const g = game({
      p1: { battlefield: ['molecule-man'], library: ['savannah-lions', ...n('plains', 5)] },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    passUntil(g, 'castFree');
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Propaganda makes each attacker cost {2}', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', 'bear-cub', ...n('plains', 2)] },
      p2: { battlefield: ['propaganda'] },
      step: 'beginCombat',
    });
    g.pass().pass();
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'addAttacker', player: 'p1', attacker: lions, defender: 'p2' });
    // Two lands pay for one attacker only.
    expect(g.legal().some((a) => a.type === 'addAttacker')).toBe(false);
    g.do({ type: 'confirmAttackers', player: 'p1' });
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped),
    ).toHaveLength(2);
  });

  it('Containment Construct exiles a discarded card to play it this turn', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['containment-construct', 'currency-converter', ...n('plains', 3)],
      },
    });
    const converter = g.id('p1', 'currency-converter');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === converter)!);
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'savannah-lions', 'hand') });
    settle(g);
    // Two triggers: Currency Converter (decline), Containment Construct (accept).
    for (let i = 0; i < 4 && g.decision.kind === 'optionalEffect'; i++) {
      const d = g.decision;
      const construct =
        d.kind === 'optionalEffect' && d.resume.sourceDefId === 'containment-construct';
      g.do({ type: 'chooseEffect', player: 'p1', accept: construct });
      settle(g);
    }
    expect(castable(g, 'savannah-lions')).toBe(true);
    expect(g.zoneOf(g.state.players.p1.exile[0]!)).toBe('exile');
  });

  it('Skullclamp draws two when the equipped creature dies', () => {
    const g = game({ p1: { battlefield: ['skullclamp', 'savannah-lions', 'plains'] } });
    const hand = handSize(g, 'p1');
    const clamp = g.id('p1', 'skullclamp');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === clamp)!);
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(hand + 2);
  });

  it('Spark Double enters as a non-legendary copy with an extra counter', () => {
    const g = game({
      p1: { hand: ['spark-double'], battlefield: ['titania-proud-pummeler', ...n('island', 4)] },
    });
    const titania = g.id('p1', 'titania-proud-pummeler');
    const card = g.id('p1', 'spark-double', 'hand');
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card && a.copyOf === titania)!);
    settle(g);
    expect(all(g, 'titania-proud-pummeler')).toHaveLength(2);
    expect(g.obj(card).plusOneCounters).toBe(1);
  });

  it('Toxic Deluge: pay X life, all creatures get -X/-X', () => {
    const g = game({
      p1: { hand: ['toxic-deluge'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions', 'rumbling-baloth'] },
    });
    const card = g.id('p1', 'toxic-deluge', 'hand');
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card && a.x === 2)!);
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
  });

  it('Extract Power: both top cards can be played for free', () => {
    const g = game({
      p1: {
        hand: ['extract-power'],
        battlefield: n('island', 6),
        library: ['savannah-lions', ...n('island', 5)],
      },
      p2: { library: ['bear-cub', ...n('forest', 5)] },
    });
    cast(g, 'extract-power');
    settle(g);
    expect(castable(g, 'savannah-lions')).toBe(true);
    expect(castable(g, 'bear-cub')).toBe(true);
  });
});

describe('Doom Prevails: connive', () => {
  /** Answers a connive discard with the first card of this kind in hand. */
  const discard = (g: ReturnType<typeof game>, defId: string) => {
    const d = g.decision;
    if (d.kind !== 'discard') throw new Error(`expected a discard, got ${d.kind}`);
    g.do({ type: 'discard', player: d.player, card: g.id(d.player, defId, 'hand') });
    return settle(g);
  };

  it('Doctor Doom: a Villain gets menace and connives at combat; discarding a land drains 2', () => {
    const g = game({
      p1: {
        battlefield: ['doctor-doom-king-of-latveria'],
        hand: ['island'],
        library: n('swamp', 5),
      },
    });
    passUntil(g, 'discard');
    discard(g, 'island');
    const doom = g.id('p1', 'doctor-doom-king-of-latveria');
    // A land discard: no counter, but the opponent loses 2.
    expect(g.obj(doom).plusOneCounters).toBe(0);
    expect(g.life('p2')).toBe(18);
    expect(getCharacteristics(g.state, cardDb, doom).keywords.has('menace')).toBe(true);
  });

  it('Iron Monger and Ultron react to a creature conniving', () => {
    const g = game({
      p1: {
        battlefield: [
          'iron-monger-sadistic-tycoon',
          'ultron-unlimited',
          'villainous-hideout',
          ...n('swamp', 4),
        ],
        hand: ['savannah-lions'],
        library: n('swamp', 5),
      },
    });
    const ultron = g.id('p1', 'ultron-unlimited');
    const hideout = g.id('p1', 'villainous-hideout');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === hideout &&
            a.targets.some((t) => 'object' in t && t.object.id === ultron),
        )!,
    );
    g.passBoth();
    discard(g, 'savannah-lions');
    for (let i = 0; i < 4 && g.decision.kind === 'optionalEffect'; i++) {
      g.do({ type: 'chooseEffect', player: 'p1', accept: true });
      settle(g);
    }
    // Ultron: +1 for the nonland discard, +1 from Iron Monger; a Robot from his own trigger.
    expect(g.obj(ultron).plusOneCounters).toBe(2);
    expect(all(g, 'robot-villain-token')).toHaveLength(1);
  });

  it('Lethal Scheme: the creatures that convoked it connive', () => {
    const g = game({
      p1: {
        hand: ['lethal-scheme', 'savannah-lions'],
        battlefield: ['bear-cub', ...n('swamp', 3)],
        library: n('swamp', 5),
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'lethal-scheme', [g.ref(g.id('p2', 'rumbling-baloth'))]);
    g.passBoth();
    discard(g, 'savannah-lions');
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(1);
  });

  it('Prowler connives when another Villain enters', () => {
    const g = game({
      p1: {
        battlefield: ['prowler-clawed-thief', ...n('swamp', 3)],
        hand: ['tombstone-career-criminal', 'savannah-lions'],
        library: n('swamp', 5),
      },
    });
    cast(g, 'tombstone-career-criminal');
    g.passBoth();
    passUntil(g, 'discard');
    discard(g, 'savannah-lions');
    expect(g.obj(g.id('p1', 'prowler-clawed-thief')).plusOneCounters).toBe(1);
  });
});
