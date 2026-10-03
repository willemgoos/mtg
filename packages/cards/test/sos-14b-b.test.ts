import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { SOS_BLUE_B, SOS_BLUE_B_BACKS } from '../src/sos/cards-b.ts';
import { all, cast, game, n } from './blb-helpers.ts';

// Secrets of Strixhaven 14b, group B: the remaining blue cards.

const FRACTAL = 'stx-fractal-token';
const ELEMENTAL = 'sos-elemental-3-3-flying-token';
const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const stats = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const hand = (g: GameDriver, who: 'p1' | 'p2' = 'p1') => g.state.players[who].hand.length;
const gy = (g: GameDriver, who: 'p1' | 'p2' = 'p1') => g.state.players[who].graveyard.length;

/** Resolves the stack, answering prompts: `option` for chooseOption, the first choice for the rest. */
function done(g: GameDriver, opts: { option?: number; accept?: boolean } = {}): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: opts.option ?? 0 });
    else if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      const picks = legal.filter((a) => a.type === 'chooseTargets' && a.targets.length > 0);
      g.do(
        picks.find(
          (a) => a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
        ) ??
          picks[0] ??
          legal[0]!,
      );
    } else if (d.kind === 'optionalEffect')
      g.do({ type: 'chooseEffect', player: d.player, accept: opts.accept ?? false });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'priority' || d.kind === 'gameOver') break;
    else g.do(g.legal()[0]!);
  }
  return g;
}
const castCopy = (
  g: GameDriver,
  perm: string,
  targets: Parameters<typeof cast>[2] = [],
  extra: Parameters<typeof cast>[3] = {},
) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets, ...extra });
  return g;
};

describe('the cards are in the pool', () => {
  it('every front and back face has a record', () => {
    for (const name of Object.keys(SOS_BLUE_B)) expect(cardDb.has(slug(name)), name).toBe(true);
    for (const name of Object.keys(SOS_BLUE_B_BACKS)) expect(cardDb.has(slug(name)), name).toBe(true);
    expect(Object.keys(SOS_BLUE_B)).toHaveLength(32);
    expect(Object.keys(SOS_BLUE_B_BACKS)).toHaveLength(8);
  });
});

describe('instants and sorceries', () => {
  it('Banishing Betrayal bounces a nonland permanent and surveils', () => {
    const g = game({
      p1: { hand: ['banishing-betrayal'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'banishing-betrayal', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.state.players.p2.hand.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
  });

  it('Brush Off costs {1}{U} less against an instant or sorcery spell', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['brush-off'], battlefield: n('island', 2) },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    const shock = g.state.stack[0]!.id;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'brush-off', 'hand'),
      targets: [g.ref(shock)],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(gy(g, 'p2')).toBe(1);
  });

  it("Brush Off isn't cheaper against a creature spell", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['brush-off'], battlefield: n('island', 2) },
      p2: { hand: ['serra-angel'], battlefield: n('plains', 5) },
    });
    cast(g, 'serra-angel');
    g.pass();
    const angel = g.state.stack[0]!.id;
    expect(() =>
      g.do({
        type: 'castSpell',
        player: 'p1',
        card: g.id('p1', 'brush-off', 'hand'),
        targets: [g.ref(angel)],
      }),
    ).toThrow();
  });

  it('Chase Inspiration gives +0/+3 and hexproof', () => {
    const g = game({
      p1: { hand: ['chase-inspiration'], battlefield: ['serra-angel', 'island'] },
    });
    const c = g.id('p1', 'serra-angel');
    cast(g, 'chase-inspiration', [g.ref(c)]);
    done(g);
    expect(stats(g, c)).toEqual([4, 7]);
    expect(keywords(g, c).has('hexproof')).toBe(true);
  });

  it('Divergent Equation returns up to X instants and sorceries, then exiles itself', () => {
    const g = game({
      p1: {
        hand: ['divergent-equation'],
        battlefield: n('island', 5),
        graveyard: ['shock', 'shock', 'shock'],
      },
    });
    const [a, b] = g.state.players.p1.graveyard;
    cast(g, 'divergent-equation', [g.ref(a!), g.ref(b!)], { x: 2 });
    done(g);
    expect(hand(g)).toBe(2);
    expect(gy(g)).toBe(1);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('divergent-equation');
  });

  it('Echocasting Symposium: a target player creates a copy of your creature, and it is a paradigm', () => {
    const g = game({
      p1: { hand: ['echocasting-symposium'], battlefield: ['serra-angel', ...n('island', 6)] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'echocasting-symposium', [{ player: 'p2' }, g.ref(angel)]);
    done(g);
    const copies = all(g, 'serra-angel');
    expect(copies).toHaveLength(2);
    expect(copies.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(1);
    expect(g.state.players.p1.paradigms).toEqual(['echocasting-symposium']);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('echocasting-symposium');
  });

  it('Flow State takes one of the top three, or two with an instant and a sorcery in the graveyard', () => {
    const lib = ['island', 'forest', 'plains', 'swamp', 'mountain'];
    const g = game({
      p1: { hand: ['flow-state'], battlefield: n('island', 2), library: lib },
    });
    cast(g, 'flow-state');
    done(g);
    expect(hand(g)).toBe(1);
    const g2 = game({
      p1: {
        hand: ['flow-state'],
        battlefield: n('island', 2),
        library: lib,
        graveyard: ['shock', 'procrastinate'],
      },
    });
    cast(g2, 'flow-state');
    done(g2);
    expect(hand(g2)).toBe(2);
  });

  it("Fractal Anomaly makes a Fractal with a counter for each card you've drawn this turn", () => {
    const g = game({
      p1: { hand: ['homesickness', 'fractal-anomaly'], battlefield: n('island', 7) },
    });
    cast(g, 'homesickness', [{ player: 'p1' }]);
    done(g);
    cast(g, 'fractal-anomaly');
    done(g);
    const [f] = all(g, FRACTAL);
    expect(g.obj(f!).plusOneCounters).toBe(2);
  });

  it('Fractalize sets base power and toughness to X plus 1', () => {
    const g = game({
      p1: { hand: ['fractalize'], battlefield: ['serra-angel', ...n('island', 4)] },
    });
    const c = g.id('p1', 'serra-angel');
    cast(g, 'fractalize', [g.ref(c)], { x: 1 });
    done(g);
    expect(stats(g, c)).toEqual([2, 2]);
  });

  it('Homesickness draws two cards, taps up to two creatures and stuns them', () => {
    const g = game({
      p1: { hand: ['homesickness'], battlefield: n('island', 6) },
      p2: { battlefield: ['serra-angel', 'eager-first-year'] },
    });
    const a = g.id('p2', 'serra-angel');
    const b = g.id('p2', 'eager-first-year');
    cast(g, 'homesickness', [{ player: 'p1' }, g.ref(a), g.ref(b)]);
    done(g);
    expect(hand(g)).toBe(2);
    expect([a, b].map((id) => g.obj(id).tapped)).toEqual([true, true]);
    expect([a, b].map((id) => g.obj(id).counters?.stun)).toEqual([1, 1]);
  });

  it('Mana Sculpt counters a spell and gives {C} at your next main phase if you control a Wizard', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['mana-sculpt'], battlefield: ['muse-seeker', ...n('island', 3)] },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    const shock = g.state.stack[0]!.id;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'mana-sculpt', 'hand'),
      targets: [g.ref(shock)],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.pendingMainMana).toBe(1);
  });

  it("Mana Sculpt's mana arrives at the beginning of your next main phase", () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['island'] } });
    g.state.players.p1.pendingMainMana = 3;
    g.passUntilStep('main2');
    expect(g.state.players.p1.pool?.filter((p) => p.produces[0] === 'C')).toHaveLength(3);
    expect(g.state.players.p1.pendingMainMana).toBeUndefined();
  });

  it('Mathemagics draws 2^X cards', () => {
    const g = game({
      p1: { hand: ['mathemagics'], battlefield: n('island', 6), library: n('island', 10) },
    });
    cast(g, 'mathemagics', [{ player: 'p1' }], { x: 2 });
    done(g);
    expect(hand(g)).toBe(4);
  });

  it("Muse's Encouragement makes a 3/3 flying Elemental and surveils 2", () => {
    const g = game({ p1: { hand: ['muses-encouragement'], battlefield: n('island', 5) } });
    cast(g, 'muses-encouragement');
    done(g);
    const [e] = all(g, ELEMENTAL);
    expect(stats(g, e!)).toEqual([3, 3]);
    expect(keywords(g, e!).has('flying')).toBe(true);
  });

  it('Procrastinate taps a creature and puts twice X stun counters on it', () => {
    const g = game({
      p1: { hand: ['procrastinate'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const a = g.id('p2', 'serra-angel');
    cast(g, 'procrastinate', [g.ref(a)], { x: 3 });
    done(g);
    expect(g.obj(a).tapped).toBe(true);
    expect(g.obj(a).counters?.stun).toBe(6);
  });

  it("Run Behind: the creature's owner puts it on the top or bottom of their library", () => {
    const g = game({
      p1: { hand: ['run-behind'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'], library: n('forest', 3) },
    });
    const a = g.id('p2', 'serra-angel');
    cast(g, 'run-behind', [g.ref(a)]);
    g.passBoth();
    const d = g.decision;
    expect(d.kind).toBe('chooseOption');
    expect('player' in d && d.player).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    expect(g.state.players.p2.library.at(-1)).toBe(a);
  });

  it('Run Behind costs {1} less against an attacking creature', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['run-behind'], battlefield: n('island', 3) },
      p2: { battlefield: [{ card: 'serra-angel', sick: false }] },
      active: 'p2',
    });
    const a = g.id('p2', 'serra-angel');
    g.passBoth();
    g.attack(a);
    for (let i = 0; i < 5 && g.actor !== 'p1'; i++) g.pass();
    cast(g, 'run-behind', [g.ref(a)]);
    done(g);
    expect(g.zoneOf(a)).toBe('library');
  });

  it('Wisdom of Ages returns every instant and sorcery and removes your maximum hand size', () => {
    const g = game({
      p1: {
        hand: ['wisdom-of-ages'],
        battlefield: n('island', 7),
        graveyard: ['shock', 'banishing-betrayal', 'serra-angel'],
      },
    });
    cast(g, 'wisdom-of-ages');
    done(g);
    expect(hand(g)).toBe(2);
    expect(g.state.players.p1.noMaxHandSize).toBe(true);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('wisdom-of-ages');
  });
});

describe('creatures', () => {
  it('Deluge Virtuoso taps and stuns a creature as it enters, and grows with Opus', () => {
    const g = game({
      p1: { hand: ['deluge-virtuoso', 'banishing-betrayal'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const a = g.id('p2', 'serra-angel');
    cast(g, 'deluge-virtuoso');
    done(g);
    expect(g.obj(a).tapped).toBe(true);
    expect(g.obj(a).counters?.stun).toBe(1);
    const v = g.id('p1', 'deluge-virtuoso');
    cast(g, 'banishing-betrayal', [g.ref(a)]);
    done(g);
    expect(stats(g, v)).toEqual([3, 3]);
  });

  it('Exhibition Tidecaller: Opus mills three, or ten for five or more mana', () => {
    const g = game({
      p1: {
        hand: ['banishing-betrayal', 'homesickness'],
        battlefield: ['exhibition-tidecaller', ...n('island', 8)],
      },
      p2: { library: n('forest', 20), battlefield: ['serra-angel'] },
    });
    cast(g, 'banishing-betrayal', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(gy(g, 'p2')).toBe(3);
    cast(g, 'homesickness', [{ player: 'p1' }]);
    done(g);
    expect(gy(g, 'p2')).toBe(13);
  });

  it('Muse Seeker draws and discards, unless five or more mana was spent', () => {
    const g = game({
      p1: {
        hand: ['chase-inspiration', 'shock'],
        battlefield: ['muse-seeker', 'serra-angel', ...n('island', 8)],
      },
    });
    cast(g, 'chase-inspiration', [g.ref(g.id('p1', 'serra-angel'))]);
    done(g);
    // Drew one and discarded one: the hand is where it was (minus the spell), and Chase Inspiration is in the graveyard.
    expect(hand(g)).toBe(1);
    expect(gy(g)).toBe(2);
    const g2 = game({
      p1: { hand: ['homesickness'], battlefield: ['muse-seeker', ...n('island', 8)] },
    });
    cast(g2, 'homesickness', [{ player: 'p1' }]);
    done(g2);
    // Five or more mana: it draws and doesn't discard, plus Homesickness's own two cards.
    expect(hand(g2)).toBe(3);
    expect(gy(g2)).toBe(1);
  });

  it('Matterbending Mage bounces another creature, and an X spell makes it unblockable', () => {
    const g = game({
      p1: {
        hand: ['matterbending-mage', 'procrastinate'],
        battlefield: n('island', 6),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'matterbending-mage');
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'hand'))).toBe('hand');
    const m = g.id('p1', 'matterbending-mage');
    expect(getCharacteristics(g.state, cardDb, m).cantBeBlocked).toBe(false);
  });

  it('Matterbending Mage: casting a spell with {X} in its cost makes it unblockable this turn', () => {
    const g = game({
      p1: { hand: ['mathemagics'], battlefield: ['matterbending-mage', ...n('island', 4)] },
    });
    const m = g.id('p1', 'matterbending-mage');
    cast(g, 'mathemagics', [{ player: 'p1' }], { x: 0 });
    done(g);
    expect(getCharacteristics(g.state, cardDb, m).cantBeBlocked).toBe(true);
  });

  it('Orysa costs {3} less with total toughness 10 or more, and draws two', () => {
    const g = game({
      p1: {
        hand: ['orysa-tide-choreographer'],
        battlefield: [...n('serra-angel', 3), ...n('island', 2)],
      },
    });
    cast(g, 'orysa-tide-choreographer');
    done(g);
    expect(hand(g)).toBe(2);
    const g2 = game({
      p1: { hand: ['orysa-tide-choreographer'], battlefield: n('island', 2) },
    });
    expect(() => cast(g2, 'orysa-tide-choreographer')).toThrow();
  });

  it('Pensive Professor: Increment, and a card each time it gets counters', () => {
    const g = game({
      p1: { hand: ['chase-inspiration'], battlefield: ['pensive-professor', 'island'] },
    });
    const p = g.id('p1', 'pensive-professor');
    // {U} is more than its power 0: a counter, so a card. At 1/3 the next small spell does nothing.
    cast(g, 'chase-inspiration', [g.ref(p)]);
    done(g);
    expect(g.obj(p).plusOneCounters).toBe(1);
    expect(hand(g)).toBe(1);
  });

  it('Pensive Professor does not draw for counters put on other creatures', () => {
    const g = game({
      p1: {
        hand: ['banishing-betrayal'],
        battlefield: ['pensive-professor', 'tester-of-the-tangential', ...n('island', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    g.obj(g.id('p1', 'tester-of-the-tangential')).plusOneCounters = 5;
    cast(g, 'banishing-betrayal', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    // Two mana beats the Professor's power 0 (one counter, one card); the Tester is already too big.
    expect(g.obj(g.id('p1', 'pensive-professor')).plusOneCounters).toBe(1);
    expect(hand(g)).toBe(1);
  });

  it('Textbook Tabulator surveils 2 as it enters', () => {
    const g = game({ p1: { hand: ['textbook-tabulator'], battlefield: n('island', 3) } });
    cast(g, 'textbook-tabulator');
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
  });

  it('Hydro-Channeler pays only for instants and sorceries', () => {
    const g = game({
      p1: {
        hand: ['banishing-betrayal', 'textbook-tabulator'],
        battlefield: [{ card: 'hydro-channeler', sick: false }, 'island'],
      },
    });
    const castable = (card: string) =>
      g.legal().some(
        (a) => a.type === 'castSpell' && a.card === g.id('p1', card, 'hand'),
      );
    expect(castable('banishing-betrayal')).toBe(true);
    expect(castable('textbook-tabulator')).toBe(false);
  });

  it('Tester of the Tangential moves counters onto another creature for {X}', () => {
    const g2 = game({
      p1: {
        battlefield: ['tester-of-the-tangential', 'eager-first-year', ...n('island', 2)],
      },
    });
    const t2 = g2.id('p1', 'tester-of-the-tangential');
    const f2 = g2.id('p1', 'eager-first-year');
    g2.obj(t2).plusOneCounters = 2;
    g2.passBoth();
    // Beginning of combat: the trigger asks how much to pay (option 1: {2}), then who gets them.
    for (let i = 0; i < 6 && g2.decision.kind !== 'chooseOption'; i++) {
      if (g2.decision.kind === 'priority') g2.pass();
      else break;
    }
    expect(g2.decision.kind).toBe('chooseOption');
    g2.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(g2.decision.kind).toBe('chooseOption');
    g2.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g2.obj(t2).plusOneCounters).toBe(0);
    expect(g2.obj(f2).plusOneCounters).toBe(2);
  });
});

describe('prepare cards', () => {
  it('Campus Composer enters prepared; Aqueous Aria makes a 3/3 flying Elemental', () => {
    const g = game({ p1: { hand: ['campus-composer'], battlefield: n('island', 9) } });
    cast(g, 'campus-composer');
    done(g);
    const c = g.id('p1', 'campus-composer');
    castCopy(g, c);
    done(g);
    expect(all(g, ELEMENTAL)).toHaveLength(1);
    expect(g.obj(c).prepared).toBeUndefined();
  });

  it('Emeritus of Ideation: Ancestral Recall draws three; attacking can exile eight cards to prepare it again', () => {
    const g = game({
      p1: { hand: ['emeritus-of-ideation'], battlefield: n('island', 6) },
    });
    cast(g, 'emeritus-of-ideation');
    done(g);
    const e = g.id('p1', 'emeritus-of-ideation');
    castCopy(g, e, [{ player: 'p1' }]);
    done(g);
    expect(hand(g)).toBe(3);
    expect(g.obj(e).prepared).toBeUndefined();
    // Attack with eight cards in the graveyard.
    const g2 = game({
      step: 'beginCombat',
      p1: {
        battlefield: [{ card: 'emeritus-of-ideation', sick: false }],
        graveyard: n('island', 9),
      },
    });
    const e2 = g2.id('p1', 'emeritus-of-ideation');
    g2.passBoth();
    g2.attack(e2);
    done(g2, { accept: true });
    expect(g2.obj(e2).prepared).toBeDefined();
    expect(gy(g2)).toBe(1);
    // Eight cards, and the copy of Ancestral Recall.
    expect(g2.state.players.p1.exile).toHaveLength(9);
  });

  it('Encouraging Aviator becomes prepared when it attacks; Jump gives flying', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [{ card: 'encouraging-aviator', sick: false }, 'eager-first-year', 'island'] },
    });
    const a = g.id('p1', 'encouraging-aviator');
    g.passBoth();
    g.attack(a);
    done(g);
    expect(g.obj(a).prepared).toBeDefined();
    const f = g.id('p1', 'eager-first-year');
    castCopy(g, a, [g.ref(f)]);
    done(g);
    expect(keywords(g, f).has('flying')).toBe(true);
  });

  it('Harmonized Trio taps two other creatures to become prepared; Brainstorm draws three and puts two back', () => {
    const g = game({
      p1: {
        hand: ['shock', 'banishing-betrayal'],
        battlefield: [
          { card: 'harmonized-trio', sick: false },
          'eager-first-year',
          'serra-angel',
          'island',
        ],
        library: ['plains', 'swamp', 'mountain', 'forest'],
      },
    });
    const t = g.id('p1', 'harmonized-trio');
    const ability = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === t);
    expect(ability).toBeDefined();
    g.do(ability!);
    done(g);
    expect(g.obj(t).prepared).toBeDefined();
    expect(g.obj(g.id('p1', 'eager-first-year')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'serra-angel')).tapped).toBe(true);
    castCopy(g, t);
    done(g);
    // Three cards drawn, two put back: the hand grew by one.
    expect(hand(g)).toBe(3);
    expect(g.state.players.p1.library).toHaveLength(4 - 3 + 2);
  });

  it('Jadzi loots on entering; Oracle’s Gift makes X Fractals with X counters each', () => {
    const g = game({
      p1: { hand: ['jadzi-steward-of-fate', 'shock', 'shock'], battlefield: n('island', 9) },
    });
    cast(g, 'jadzi-steward-of-fate');
    done(g);
    // Drew two, discarded two.
    expect(hand(g)).toBe(2);
    const j = g.id('p1', 'jadzi-steward-of-fate');
    castCopy(g, j, [], { x: 2 });
    done(g);
    const fractals = all(g, FRACTAL);
    expect(fractals).toHaveLength(2);
    expect(fractals.map((id) => g.obj(id).plusOneCounters)).toEqual([2, 2]);
  });

  it('Landscape Painter and Spellbook Seeker: Vibrant Idea draws two, Careful Study loots two', () => {
    const g = game({
      p1: { hand: ['landscape-painter', 'spellbook-seeker'], battlefield: n('island', 16) },
    });
    cast(g, 'landscape-painter');
    done(g);
    cast(g, 'spellbook-seeker');
    done(g);
    expect(hand(g)).toBe(0);
    castCopy(g, g.id('p1', 'landscape-painter'));
    done(g);
    expect(hand(g)).toBe(2);
    castCopy(g, g.id('p1', 'spellbook-seeker'));
    done(g);
    expect(hand(g)).toBe(2);
    expect(gy(g)).toBe(2);
  });

  it('Skycoach Conductor has flash; All Aboard blinks a non-Pilot creature you control', () => {
    const g = game({
      p1: { hand: ['skycoach-conductor'], battlefield: ['eager-first-year', ...n('island', 4)] },
    });
    expect(
      keywords(g, g.id('p1', 'skycoach-conductor', 'hand')).has('flash'),
    ).toBe(true);
    cast(g, 'skycoach-conductor');
    done(g);
    const f = g.id('p1', 'eager-first-year');
    g.obj(f).plusOneCounters = 1;
    castCopy(g, g.id('p1', 'skycoach-conductor'), [g.ref(f)]);
    done(g);
    expect(g.obj(g.id('p1', 'eager-first-year')).plusOneCounters).toBe(0);
  });
});
