import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { slug } from '../src/build.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { bf, chars, done, gy, hand, keywords, toStep } from './tdm-green-helpers.ts';
import { attack } from './ltr-white-helpers.ts';

// The Lord of the Rings 21d: the colorless rares of the packets' random slot, part 2 (lands and the other artifacts).

const BARAD = slug('Barad-dûr');
const MINAS = slug('Minas Tirith');
const MINES = slug('Mines of Moria');
const DOOM = slug('Mount Doom');
const PALANTIR = slug('Palantír of Orthanc');
const PHIAL = slug('Phial of Galadriel');
const RIVENDELL = slug('Rivendell');
const SHIRE = slug('The Shire');
const RING = slug('The One Ring');

/** Resolves everything (bounded): triggers take their first real target, options take the first, scries stay on top. */
function run(g: GameDriver, option = 0): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
    else if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: option });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseObject')
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action);
    else break;
  }
  return g;
}
const abilities = (defId: string) => cardDb.get(defId)!.abilities;
const idx = (defId: string, nth = 0) => {
  let seen = 0;
  const a = abilities(defId);
  for (let i = 0; i < a.length; i++) if (a[i]!.kind === 'activated' && seen++ === nth) return i;
  throw new Error(`no activated ability #${nth} on ${defId}`);
};
const canActivate = (g: GameDriver, source: string, index: number) =>
  g
    .legal()
    .some((a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index);
const act = (
  g: GameDriver,
  source: string,
  index: number,
  extra: Partial<Extract<Action, { type: 'activateAbility' }>> = {},
) => {
  const a = g
    .legal()
    .find(
      (x) =>
        x.type === 'activateAbility' &&
        x.source === source &&
        x.abilityIndex === index &&
        Object.entries(extra).every(([k, v]) => (x as unknown as Record<string, unknown>)[k] === v),
    );
  if (!a) throw new Error(`No legal activation of ability ${index} of ${source}`);
  return g.do(a);
};
const play = (g: GameDriver, defId: string) =>
  g.do({ type: 'playLand', player: 'p1', card: g.id('p1', defId, 'hand') });

describe('the legendary lands', () => {
  for (const [name, defId] of [
    ['Barad-dûr', BARAD],
    ['Minas Tirith', MINAS],
    ['Mines of Moria', MINES],
    ['Rivendell', RIVENDELL],
    ['The Shire', SHIRE],
  ] as const) {
    it(`${name} enters tapped unless you control a legendary creature`, () => {
      const c = cardDb.get(defId)!;
      expect(c.types).toContain('Land');
      expect(c.supertypes).toContain('Legendary');
      const g = game({ p1: { hand: [defId], battlefield: ['savannah-lions'] } });
      play(g, defId);
      expect(g.obj(g.id('p1', defId)).tapped).toBe(true);
      const g2 = game({ p1: { hand: [defId], battlefield: ['meriadoc-brandybuck'] } });
      play(g2, defId);
      expect(g2.obj(g2.id('p1', defId)).tapped).toBe(false);
    });
  }
  it('a Ring-bearer counts as a legendary creature for them', () => {
    const g = game({ p1: { hand: [SHIRE], battlefield: ['savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    g.state.players.p1.ring = { tempted: 1, bearer: { id: lions, zcc: g.obj(lions).zcc } };
    play(g, SHIRE);
    expect(g.obj(g.id('p1', SHIRE)).tapped).toBe(false);
  });
});

describe('Barad-dûr', () => {
  const setup = (died: boolean) => {
    const g = game({ p1: { battlefield: [BARAD, ...n('swamp', 6)] } });
    if (died) g.state.turn.creaturesDied = 1;
    return g;
  };
  it('taps for {B}', () => {
    const g = game({
      p1: { hand: ['doom-blade'], battlefield: [BARAD, 'swamp'] },
      p2: { battlefield: ['ordinary-bear'] },
    });
    cast(g, 'doom-blade', [g.ref(g.id('p2', 'ordinary-bear'))]);
    done(g);
    expect(gy(g, 'p2')).toContain('ordinary-bear');
    expect(g.obj(g.id('p1', BARAD)).tapped).toBe(true);
    // And only black: it can't pay for a red spell.
    const g2 = game({ p1: { hand: ['shock'], battlefield: [BARAD] } });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
  it("can't be activated unless a creature died this turn", () => {
    const g = setup(false);
    expect(canActivate(g, g.id('p1', BARAD), idx(BARAD))).toBe(false);
    const g2 = setup(true);
    expect(canActivate(g2, g2.id('p1', BARAD), idx(BARAD))).toBe(true);
  });
  it('{X}{X}{B}, {T}: amasses Orcs X (X of 2 costs five mana)', () => {
    const g = setup(true);
    act(g, g.id('p1', BARAD), idx(BARAD), { x: 2 });
    run(g);
    const army = bf(g, 'ltr-orc-army-token');
    expect(army).toHaveLength(1);
    const a = g.state.battlefield.find((id) => g.obj(id).defId === 'ltr-orc-army-token')!;
    expect(pt(g, a)).toEqual([2, 2]);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'swamp' && g.obj(id).tapped),
    ).toHaveLength(5);
    expect(g.obj(g.id('p1', BARAD)).tapped).toBe(true);
  });
  it('X can be smaller, and costs {X}{X}{B}', () => {
    const g = setup(true);
    const xs = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === g.id('p1', BARAD))
      .map((a) => (a as { x?: number }).x ?? 0);
    expect(xs).toEqual(expect.arrayContaining([0, 1, 2]));
    // Six Swamps pay {X}{X}{B} for X up to 2 (5 mana), not 3 (7).
    expect(Math.max(...xs)).toBe(2);
  });
  it('adds to an existing Army', () => {
    const g = game({
      p1: { battlefield: [BARAD, ...n('swamp', 6), { card: 'ltr-orc-army-token' }] },
    });
    const army = g.id('p1', 'ltr-orc-army-token');
    g.obj(army).isToken = true;
    g.obj(army).plusOneCounters = 1;
    g.state.turn.creaturesDied = 1;
    act(g, g.id('p1', BARAD), idx(BARAD), { x: 1 });
    run(g);
    expect(bf(g, 'ltr-orc-army-token')).toHaveLength(1);
    expect(g.obj(army).plusOneCounters).toBe(2);
  });
});

describe('Minas Tirith', () => {
  it('{1}{W}, {T}: draws a card, only if you attacked with two or more creatures this turn', () => {
    const g = game({
      p1: {
        battlefield: [MINAS, 'savannah-lions', 'savannah-lions', ...n('plains', 2)],
        library: n('forest', 5),
      },
    });
    const m = g.id('p1', MINAS);
    expect(canActivate(g, m, idx(MINAS))).toBe(false);
    const lions = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    attack(g, [lions[0]!]);
    run(g);
    expect(canActivate(g, m, idx(MINAS))).toBe(false);
    // Another game: two attackers.
    const g2 = game({
      p1: {
        battlefield: [MINAS, 'savannah-lions', 'savannah-lions', ...n('plains', 2)],
        library: n('forest', 5),
      },
    });
    const l2 = g2.state.battlefield.filter((id) => g2.obj(id).defId === 'savannah-lions');
    expect(canActivate(g2, g2.id('p1', MINAS), idx(MINAS))).toBe(false);
    attack(g2, l2);
    run(g2);
    const before = hand(g2).length;
    act(g2, g2.id('p1', MINAS), idx(MINAS));
    run(g2);
    expect(hand(g2).length).toBe(before + 1);
  });
  it('counts attackers that have died since', () => {
    const g = game({
      p1: {
        battlefield: [MINAS, 'savannah-lions', 'savannah-lions', ...n('plains', 2)],
        library: n('forest', 5),
      },
    });
    const l = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    attack(g, l);
    run(g);
    // One of them is gone.
    g.state.battlefield = g.state.battlefield.filter((id) => id !== l[0]);
    g.obj(l[0]!).zone = 'graveyard';
    expect(canActivate(g, g.id('p1', MINAS), idx(MINAS))).toBe(true);
  });
  it("doesn't count attacks of another turn: nothing on the opponent's turn", () => {
    const g = game({
      p1: { battlefield: [MINAS, 'savannah-lions', 'savannah-lions', ...n('plains', 2)] },
      active: 'p2',
    });
    g.pass();
    expect(canActivate(g, g.id('p1', MINAS), idx(MINAS))).toBe(false);
  });
});

describe('Mines of Moria', () => {
  it('{3}{R}, {T}, exile three cards from your graveyard: creates two Treasures', () => {
    const g = game({
      p1: { battlefield: [MINES, ...n('mountain', 4)], graveyard: ['shock', 'opt', 'forest'] },
    });
    act(g, g.id('p1', MINES), idx(MINES));
    run(g);
    expect(bf(g, 'treasure-token')).toHaveLength(2);
    expect(gy(g)).toHaveLength(0);
    expect(g.state.players.p1.exile).toHaveLength(3);
  });
  it('needs three cards in the graveyard', () => {
    const g = game({
      p1: { battlefield: [MINES, ...n('mountain', 4)], graveyard: ['shock', 'opt'] },
    });
    expect(canActivate(g, g.id('p1', MINES), idx(MINES))).toBe(false);
  });
  it('lets you choose which three when there are more', () => {
    const g = game({
      p1: {
        battlefield: [MINES, ...n('mountain', 4)],
        graveyard: ['shock', 'opt', 'forest', 'plains', 'island'],
      },
    });
    act(g, g.id('p1', MINES), idx(MINES));
    expect(g.decision.kind).toBe('forageExile');
    for (const want of ['island', 'plains', 'forest']) {
      expect(g.decision.kind).toBe('forageExile');
      const card = g.id('p1', want, 'graveyard');
      g.do({ type: 'chooseCard', player: 'p1', card });
    }
    run(g);
    expect(gy(g).sort()).toEqual(['opt', 'shock']);
    expect(bf(g, 'treasure-token')).toHaveLength(2);
  });
});

describe('Rivendell', () => {
  it('{1}{U}, {T}: scry 2, only if you control a legendary creature', () => {
    const g = game({ p1: { battlefield: [RIVENDELL, 'savannah-lions', ...n('island', 2)] } });
    expect(canActivate(g, g.id('p1', RIVENDELL), idx(RIVENDELL))).toBe(false);
    const g2 = game({ p1: { battlefield: [RIVENDELL, 'meriadoc-brandybuck', ...n('island', 2)] } });
    act(g2, g2.id('p1', RIVENDELL), idx(RIVENDELL));
    for (let i = 0; i < 3 && g2.decision.kind === 'priority'; i++) g2.pass();
    const d = g2.decision;
    expect(d.kind).toBe('scry');
    if (d.kind === 'scry') expect(d.cards).toHaveLength(2);
  });
});

describe('The Shire', () => {
  it('{1}{G}, {T}, tap an untapped creature you control: creates a Food', () => {
    const g = game({ p1: { battlefield: [SHIRE, 'savannah-lions', ...n('forest', 2)] } });
    act(g, g.id('p1', SHIRE), idx(SHIRE));
    run(g);
    expect(bf(g, 'food-token')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
    expect(g.obj(g.id('p1', SHIRE)).tapped).toBe(true);
  });
  it("can't be activated without an untapped creature", () => {
    const g = game({
      p1: { battlefield: [SHIRE, { card: 'savannah-lions', tapped: true }, ...n('forest', 2)] },
    });
    expect(canActivate(g, g.id('p1', SHIRE), idx(SHIRE))).toBe(false);
    const g2 = game({ p1: { battlefield: [SHIRE, ...n('forest', 2)] } });
    expect(canActivate(g2, g2.id('p1', SHIRE), idx(SHIRE))).toBe(false);
  });
  it('can tap a summoning-sick creature', () => {
    const g = game({
      p1: { battlefield: [SHIRE, { card: 'savannah-lions', sick: true }, ...n('forest', 2)] },
    });
    expect(canActivate(g, g.id('p1', SHIRE), idx(SHIRE))).toBe(true);
  });
});

describe('Mount Doom', () => {
  it('taps for {B} or {R}, paying 1 life', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: [DOOM] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(g.state.players.p1.life).toBe(19);
    expect(g.state.players.p2.life).toBe(18);
    expect(g.obj(g.id('p1', DOOM)).tapped).toBe(true);
    // It makes {B} too: a one-mana black spell is castable from it alone (paying 1 life).
    const g2 = game({ p1: { hand: ['vampire-interloper'], battlefield: [DOOM] } });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false); // {1}{B}: one mana is not enough
  });
  it('costs no life when other lands pay', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: [DOOM, 'mountain'] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(g.state.players.p1.life).toBe(20);
    expect(g.obj(g.id('p1', DOOM)).tapped).toBe(false);
  });
  it("can't pay life it doesn't have", () => {
    const g = game({ p1: { hand: ['shock'], battlefield: [DOOM], life: 0 } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
  it('{1}{B}{R}, {T}: deals 1 damage to each opponent', () => {
    const g = game({ p1: { battlefield: [DOOM, 'swamp', 'mountain', 'swamp'] } });
    act(g, g.id('p1', DOOM), idx(DOOM, 0));
    run(g);
    expect(g.state.players.p2.life).toBe(19);
    expect(g.state.players.p1.life).toBe(20);
  });
  const big = (extra: Record<string, unknown> = {}) =>
    game({
      p1: {
        battlefield: [
          DOOM,
          'mithril-coat',
          'savannah-lions',
          'ordinary-bear',
          ...n('swamp', 4),
          ...n('mountain', 3),
        ],
      },
      p2: { battlefield: ['serra-angel', 'fog-bank'] },
      ...extra,
    });
  it('keeps the two creatures you choose and destroys every other creature', () => {
    const g = big();
    act(g, g.id('p1', DOOM), idx(DOOM, 1));
    // Resolve the ability; the prompt offers each creature (and "None").
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const pick = (re: RegExp) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error('no prompt');
      const index = d.options.findIndex((o) => re.test(o.label));
      expect(index).toBeGreaterThanOrEqual(0);
      g.do({ type: 'chooseOption', player: d.player, index });
    };
    pick(/Serra Angel/);
    pick(/Ordinary Bear/);
    run(g);
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(bf(g, 'ordinary-bear')).toHaveLength(1);
    expect(bf(g, 'savannah-lions')).toHaveLength(0);
    expect(bf(g, 'fog-bank', 'p2')).toHaveLength(0);
    // Mount Doom and the Coat were sacrificed.
    expect(gy(g)).toEqual(expect.arrayContaining([DOOM, 'mithril-coat', 'savannah-lions']));
  });
  it('can keep one creature, or none (Done / None)', () => {
    const g = big();
    act(g, g.id('p1', DOOM), idx(DOOM, 1));
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    let d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no prompt');
    g.do({
      type: 'chooseOption',
      player: d.player,
      index: d.options.findIndex((o) => /Fog Bank/.test(o.label)),
    });
    d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no second prompt');
    expect(d.options[0]!.label).toMatch(/Done/);
    g.do({ type: 'chooseOption', player: d.player, index: 0 });
    run(g);
    expect(bf(g, 'fog-bank', 'p2')).toHaveLength(1);
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(bf(g, 'ordinary-bear')).toHaveLength(0);
    const g2 = big();
    act(g2, g2.id('p1', DOOM), idx(DOOM, 1));
    for (let i = 0; i < 4 && g2.decision.kind === 'priority'; i++) g2.pass();
    const d2 = g2.decision;
    if (d2.kind !== 'chooseOption') throw new Error('no prompt');
    expect(d2.options[0]!.label).toMatch(/None/);
    g2.do({ type: 'chooseOption', player: d2.player, index: 0 });
    run(g2);
    expect(
      g2.state.battlefield.filter((id) => chars(g2, id).types.includes('Creature')),
    ).toHaveLength(0);
  });
  it('destroys, so an indestructible creature survives', () => {
    const g = big();
    g.obj(g.id('p1', 'mithril-coat')).attachedTo = g.id('p1', 'savannah-lions');
    // The Coat is sacrificed as the cost, so the Lions lose indestructible; use Serra Angel's side: none.
    act(g, g.id('p1', DOOM), idx(DOOM, 1));
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    run(g, 0);
    expect(bf(g, 'savannah-lions')).toHaveLength(0);
  });
  it('can only be activated as a sorcery, with a legendary artifact to sacrifice', () => {
    const g = big();
    g.pass();
    const g2 = big({ active: 'p2' });
    expect(canActivate(g2, g2.id('p1', DOOM), idx(DOOM, 1))).toBe(false);
    const g3 = game({
      p1: {
        battlefield: [DOOM, 'savannah-lions', 'sol-ring', ...n('swamp', 4), ...n('mountain', 3)],
      },
    });
    expect(canActivate(g3, g3.id('p1', DOOM), idx(DOOM, 1))).toBe(false);
    const g4 = big();
    expect(canActivate(g4, g4.id('p1', DOOM), idx(DOOM, 1))).toBe(true);
  });
});

describe('Palantír of Orthanc', () => {
  const toEnd = (g: GameDriver) => {
    for (
      let i = 0;
      i < 40 && !(g.decision.kind === 'scry' || g.decision.kind === 'chooseOption');
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'chooseTriggerTargets') settle(g);
      else g.pass();
    }
  };
  it('puts an influence counter on itself and scries 2 at the beginning of your end step', () => {
    const g = game({ p1: { battlefield: [PALANTIR] } });
    toEnd(g);
    expect(g.obj(g.id('p1', PALANTIR)).counters?.influence).toBe(1);
    const d = g.decision;
    expect(d.kind).toBe('scry');
    if (d.kind === 'scry') expect(d.cards).toHaveLength(2);
  });
  it('lets the opponent have you draw a card', () => {
    const g = game({
      p1: { battlefield: [PALANTIR], library: n('forest', 6) },
      p2: { library: n('forest', 6) },
    });
    toEnd(g);
    g.do(g.legal().find((a) => a.type === 'scry') as Action);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    // The opponent decides.
    expect(g.decision.player).toBe('p2');
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'Have them draw a card',
      expect.stringMatching(/Don't/),
    ]);
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    run(g);
    expect(hand(g, 'p1')).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(5);
  });
  it('otherwise you mill X cards (X the influence counters) and they lose life equal to their total mana value', () => {
    const g = game({
      p1: {
        battlefield: [PALANTIR],
        library: ['ordinary-bear', 'shock', 'serra-angel', 'forest', 'forest'],
      },
    });
    g.obj(g.id('p1', PALANTIR)).counters = { influence: 1 };
    toEnd(g);
    g.do(g.legal().find((a) => a.type === 'scry') as Action);
    expect(g.obj(g.id('p1', PALANTIR)).counters?.influence).toBe(2);
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    run(g);
    // Two counters: the top two cards (Ordinary Bear {3}{G}, Shock {R}) are milled: 4 + 1 life.
    expect(gy(g)).toEqual(expect.arrayContaining(['ordinary-bear', 'shock']));
    expect(gy(g)).toHaveLength(2);
    expect(g.state.players.p2.life).toBe(15);
    expect(hand(g, 'p1')).toHaveLength(0);
  });
  it("does nothing at the opponent's end step", () => {
    const g = game({ p1: { battlefield: [PALANTIR] }, active: 'p2' });
    for (let i = 0; i < 30 && g.state.turn.number === 3; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.obj(g.id('p1', PALANTIR)).counters?.influence).toBeUndefined();
  });
});

describe('Phial of Galadriel', () => {
  it('draws two cards instead of one while you have no cards in hand', () => {
    const g = game({
      p1: {
        hand: ['think-twice'],
        battlefield: [PHIAL, ...n('island', 2)],
        library: n('forest', 6),
      },
    });
    cast(g, 'think-twice');
    run(g);
    // Think Twice left your hand: the draw is replaced by two.
    expect(hand(g)).toHaveLength(2);
  });
  it('draws one card as usual with cards in hand', () => {
    const g = game({
      p1: {
        hand: ['think-twice', 'ordinary-bear'],
        battlefield: [PHIAL, ...n('island', 2)],
        library: n('forest', 6),
      },
    });
    cast(g, 'think-twice');
    run(g);
    expect(hand(g)).toHaveLength(2);
  });
  it('replaces the draw step draw too', () => {
    const g = game({ p1: { battlefield: [PHIAL], library: n('forest', 6) }, active: 'p2' });
    for (let i = 0; i < 80 && !(g.state.turn.number === 4 && g.state.turn.step === 'main1'); i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    // It is p1's turn 4 now: the draw step's single draw was replaced by two (nothing in hand).
    expect(hand(g, 'p1')).toHaveLength(2);
  });
  it('doubles life gained while you have 5 or less life', () => {
    const g = game({ p1: { battlefield: [PHIAL, 'food-token', ...n('plains', 2)], life: 5 } });
    g.obj(g.id('p1', 'food-token')).isToken = true;
    const food = g.id('p1', 'food-token');
    act(g, food, idx('food-token'));
    run(g);
    expect(g.state.players.p1.life).toBe(5 + 6);
  });
  it("doesn't double it above 5 life", () => {
    const g = game({ p1: { battlefield: [PHIAL, 'food-token', ...n('plains', 2)], life: 6 } });
    g.obj(g.id('p1', 'food-token')).isToken = true;
    act(g, g.id('p1', 'food-token'), idx('food-token'));
    run(g);
    expect(g.state.players.p1.life).toBe(9);
  });
  it("doesn't help the opponent", () => {
    const g = game({
      p1: { battlefield: [PHIAL] },
      p2: { battlefield: ['food-token', ...n('plains', 2)], life: 3 },
      active: 'p2',
    });
    g.obj(g.id('p2', 'food-token')).isToken = true;
    act(g, g.id('p2', 'food-token'), idx('food-token'));
    run(g);
    expect(g.state.players.p2.life).toBe(6);
  });
  it('{T}: adds one mana of any color', () => {
    const g = game({ p1: { hand: ['serra-angel'], battlefield: [PHIAL, ...n('plains', 4)] } });
    cast(g, 'serra-angel');
    done(g);
    expect(bf(g, 'serra-angel')).toHaveLength(1);
    expect(g.obj(g.id('p1', PHIAL)).tapped).toBe(true);
  });
});

describe('The One Ring', () => {
  it('is indestructible', () => {
    expect(
      keywords(
        game({ p1: { battlefield: [RING] } }),
        game({ p1: { battlefield: [RING] } }).id('p1', RING),
      ),
    ).toEqual(expect.arrayContaining(['indestructible']));
  });
  it('gives you protection from everything until your next turn when you cast it', () => {
    const g = game({
      p1: { hand: [RING], battlefield: n('plains', 4) },
      p2: { hand: ['shock'], battlefield: [...n('mountain', 2), 'ordinary-bear'] },
    });
    cast(g, RING);
    run(g);
    expect(g.state.players.p1.ltrProtected).toBe(true);
    // An opponent can't target you.
    g.pass();
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p1'),
        ),
    ).toBe(false);
  });
  it('prevents all damage to you, from any source, but not life loss', () => {
    const g = game({
      p1: { hand: [RING], battlefield: n('plains', 4) },
      p2: { battlefield: ['ordinary-bear'] },
    });
    cast(g, RING);
    run(g);
    // The opponent's turn: the Bear attacks.
    toStep(g, 'main2');
    for (
      let i = 0;
      i < 40 && !(g.state.turn.activePlayer === 'p2' && g.state.turn.step === 'declareAttackers');
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'priority') g.pass();
      else done(g);
    }
    g.attack(g.id('p2', 'ordinary-bear'));
    toStep(g, 'main2');
    expect(g.state.players.p1.life).toBe(20);
    // Control: without the Ring the same attack hurts.
    const c = game({
      p1: { battlefield: n('plains', 4) },
      p2: { battlefield: ['ordinary-bear'] },
      active: 'p2',
    });
    c.pass();
    for (
      let i = 0;
      i < 40 && !(c.state.turn.activePlayer === 'p2' && c.state.turn.step === 'declareAttackers');
      i++
    ) {
      if (c.decision.kind === 'priority') c.pass();
      else done(c);
    }
    c.attack(c.id('p2', 'ordinary-bear'));
    toStep(c, 'main2');
    expect(c.state.players.p1.life).toBe(16);
  });
  it("doesn't stop life loss", () => {
    const g = game({
      p1: { hand: [RING], battlefield: n('plains', 4) },
      p2: { battlefield: [DOOM, 'swamp', 'mountain', 'swamp'] },
    });
    cast(g, RING);
    run(g);
    g.pass();
    // Mount Doom's ping targets nothing: it deals 1 damage to each opponent, which is prevented.
    act(g, g.id('p2', DOOM), idx(DOOM, 0));
    run(g);
    expect(g.state.players.p1.life).toBe(20);
  });
  it('lasts until your next turn begins', () => {
    const g = game({ p1: { hand: [RING], battlefield: n('plains', 4) } });
    cast(g, RING);
    run(g);
    expect(g.state.players.p1.ltrProtected).toBe(true);
    const start = g.state.turn.number;
    for (
      let i = 0;
      i < 120 && !(g.state.turn.number > start + 1 && g.state.turn.step === 'upkeep');
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.state.players.p1.ltrProtected).toBeFalsy();
  });
  it('protection also stops your own spells from targeting you', () => {
    const g = game({ p1: { hand: [RING, 'shock'], battlefield: [...n('plains', 4), 'mountain'] } });
    cast(g, RING);
    run(g);
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p1'),
        ),
    ).toBe(false);
  });
  it("doesn't give protection when it enters without being cast", () => {
    const g = game({ p1: { battlefield: [RING] } });
    expect(g.state.players.p1.ltrProtected).toBeFalsy();
  });
  it('{T}: puts a burden counter on it, then you draw a card for each burden counter', () => {
    const g = game({ p1: { battlefield: [RING], library: n('forest', 8) } });
    const ring = g.id('p1', RING);
    act(g, ring, idx(RING));
    run(g);
    expect(g.obj(ring).counters?.burden).toBe(1);
    expect(hand(g)).toHaveLength(1);
    // Untap and again: two counters, two cards.
    g.obj(ring).tapped = false;
    act(g, ring, idx(RING));
    run(g);
    expect(g.obj(ring).counters?.burden).toBe(2);
    expect(hand(g)).toHaveLength(3);
  });
  it('at the beginning of your upkeep you lose 1 life for each burden counter', () => {
    const g = game({ p1: { battlefield: [RING] }, active: 'p2' });
    g.obj(g.id('p1', RING)).counters = { burden: 3 };
    const start = g.state.turn.number;
    for (
      let i = 0;
      i < 120 &&
      !(
        g.state.turn.number > start &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.step === 'draw'
      );
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.players.p1.life).toBe(17);
    expect(g.state.players.p2.life).toBe(20);
  });
  it('without burden counters the upkeep trigger does nothing', () => {
    const g = game({ p1: { battlefield: [RING] }, active: 'p2' });
    const start = g.state.turn.number;
    for (
      let i = 0;
      i < 120 &&
      !(
        g.state.turn.number > start &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.step === 'draw'
      );
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.players.p1.life).toBe(20);
  });
});
