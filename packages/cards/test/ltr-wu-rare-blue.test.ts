import { describe, expect, it } from 'vitest';
import { cast, game, n } from './blb-helpers.ts';
import { casts, done } from './hob-white-helpers.ts';
import { canUse, use } from './ltr-white-helpers.ts';
import {
  graveyardOf,
  handOf,
  keepScry,
  objRef,
  settleStack,
  toStepNow,
  toTurnOf,
} from './ltr-wu-rare-helpers.ts';
import type { Game } from './ltr-white-helpers.ts';

// Lord of the Rings 21d: the blue rares of the packets' random slot, part one.

/** Chooses the option of the current chooseOption decision whose label matches. */
function pickOption(g: Game, label: RegExp): void {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected a choice, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0) throw new Error(`No option ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  g.do({ type: 'chooseOption', player: d.player, index });
}
const optionLabels = (g: Game): string[] => {
  const d = g.decision;
  return d.kind === 'chooseOption' ? d.options.map((o) => o.label) : [];
};

describe('Borne Upon a Wind', () => {
  const BORNE = 'borne-upon-a-wind';
  it('draws a card', () => {
    const g = game({ p1: { hand: [BORNE], battlefield: n('island', 2) } });
    cast(g, BORNE);
    done(g);
    expect(handOf(g)).toEqual(['forest']);
    expect(graveyardOf(g)).toEqual([BORNE]);
  });
  it('lets you cast spells this turn as though they had flash, but not later turns', () => {
    const g = game({
      p1: { hand: [BORNE, 'savannah-lions'], battlefield: ['island', 'island', 'plains'] },
      p2: { battlefield: [] },
    });
    // Without it a creature can't be cast in combat.
    toStepNow(g, 'beginCombat');
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
    const h = game({
      p1: { hand: [BORNE, 'savannah-lions'], battlefield: ['island', 'island', 'plains'] },
      p2: { battlefield: [] },
    });
    cast(h, BORNE);
    done(h);
    toStepNow(h, 'beginCombat');
    expect(casts(h, 'savannah-lions').length).toBeGreaterThan(0);
    // The next turn it is over.
    toTurnOf(h, 'p1');
    toStepNow(h, 'beginCombat');
    expect(casts(h, 'savannah-lions')).toHaveLength(0);
  });
  it("works on the opponent's turn for your spells, and not for theirs", () => {
    const g = game({
      p1: { hand: [BORNE, 'savannah-lions'], battlefield: ['island', 'island', 'plains'] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, BORNE);
    done(g);
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.actor).toBe('p2');
    // p2 (the active player) can cast its sorcery-speed spell anyway; p1 gets flash on its own spells only.
    g.pass();
    expect(g.actor).toBe('p1');
    expect(casts(g, 'savannah-lions').length).toBeGreaterThan(0);
  });
});

describe('Goldberry, River-Daughter', () => {
  const GOLDBERRY = 'goldberry-river-daughter';
  const setup = (extra: string[] = []) =>
    game({
      p1: { battlefield: [GOLDBERRY, 'savannah-lions', 'island', 'island', ...extra] },
      p2: { battlefield: ['serra-angel'] },
    });
  const counters = (g: Game, id: string) => ({
    plus: g.obj(id).plusOneCounters,
    ...(g.obj(id).counters ?? {}),
  });
  it('{T}: moves a counter of each kind not on Goldberry from another permanent you control onto her', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 2;
    g.obj(lions).counters = { stun: 2, verse: 3 };
    g.obj(gold).counters = { verse: 1 };
    use(g, gold, 0, [lions]);
    done(g);
    // +1/+1 and stun moved (one each); verse was already on Goldberry, so it stays put.
    expect(counters(g, gold)).toMatchObject({ plus: 1, stun: 1, verse: 1 });
    expect(counters(g, lions)).toMatchObject({ plus: 1, stun: 1, verse: 3 });
    expect(g.obj(gold).tapped).toBe(true);
  });
  it('moves only counters Goldberry lacks: nothing if she has every kind', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 2;
    g.obj(gold).plusOneCounters = 1;
    use(g, gold, 0, [lions]);
    done(g);
    expect(g.obj(gold).plusOneCounters).toBe(1);
    expect(g.obj(lions).plusOneCounters).toBe(2);
  });
  it('can only target another permanent you control', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    expect(canUse(g, gold, 0)).toBe(true);
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === gold && a.abilityIndex === 0)
      .flatMap((a) => (a as { targets: { object: { id: string } }[] }).targets.map((t) => t.object.id));
    expect(targets).not.toContain(gold);
    expect(targets).not.toContain(g.id('p2', 'serra-angel'));
    expect(targets).toContain(g.id('p1', 'savannah-lions'));
  });
  it('{U}, {T}: moves counters from Goldberry one at a time, then you draw a card', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(gold).plusOneCounters = 2;
    g.obj(gold).counters = { verse: 1 };
    use(g, gold, 1, [lions]);
    settleStack(g);
    expect(g.decision.kind).toBe('chooseOption');
    // At first one counter must be moved ("one or more"): no Done yet.
    expect(optionLabels(g)).toHaveLength(2);
    pickOption(g, /\+1\/\+1/);
    expect(optionLabels(g).some((l) => /Done/.test(l))).toBe(true);
    pickOption(g, /verse/);
    expect(optionLabels(g).some((l) => /Done/.test(l))).toBe(true);
    const before = g.state.players.p1.hand.length;
    pickOption(g, /Done/);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before + 1);
    expect(g.obj(gold).plusOneCounters).toBe(1);
    expect(g.obj(gold).counters?.verse ?? 0).toBe(0);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(g.obj(lions).counters?.verse).toBe(1);
  });
  it('moving the last counter draws a card without asking again', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(gold).counters = { verse: 1 };
    use(g, gold, 1, [lions]);
    settleStack(g);
    const before = g.state.players.p1.hand.length;
    pickOption(g, /verse/);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.hand.length).toBe(before + 1);
    expect(g.obj(lions).counters?.verse).toBe(1);
  });
  it('with no counters on Goldberry nothing is moved and no card is drawn', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const before = g.state.players.p1.hand.length;
    use(g, gold, 1, [g.id('p1', 'savannah-lions')]);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before);
  });
  it('stun counters moved onto a creature work', () => {
    const g = setup();
    const gold = g.id('p1', GOLDBERRY);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(gold).counters = { stun: 1 };
    use(g, gold, 1, [lions]);
    settleStack(g);
    pickOption(g, /stun/);
    expect(g.obj(lions).counters?.stun).toBe(1);
  });
});

describe('Lost Isle Calling', () => {
  const LOST = 'lost-isle-calling';
  const verse = (g: Game) => g.obj(g.id('p1', LOST)).counters?.verse ?? 0;
  it('whenever you scry, puts a verse counter on it (not when the opponent does)', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: [LOST, 'island'] },
      p2: { hand: ['opt'], battlefield: ['island'] },
    });
    cast(g, 'opt');
    settleStack(g);
    keepScry(g);
    done(g);
    expect(verse(g)).toBe(1);
    // The opponent scrying does nothing.
    const h = game({
      p1: { battlefield: [LOST] },
      p2: { hand: ['opt'], battlefield: ['island'] },
      active: 'p2',
    });
    cast(h, 'opt');
    settleStack(h);
    keepScry(h);
    done(h);
    expect(h.obj(h.id('p1', LOST)).counters?.verse ?? 0).toBe(0);
  });
  it('{4}{U}{U}, exile it: draws a card for each verse counter', () => {
    const g = game({ p1: { battlefield: [LOST, ...n('island', 6)] } });
    g.obj(g.id('p1', LOST)).counters = { verse: 3 };
    const before = g.state.players.p1.hand.length;
    use(g, g.id('p1', LOST), 1);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before + 3);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual([LOST]);
    expect(g.state.extraTurns ?? []).toHaveLength(0);
  });
  it('with seven or more verse counters it also takes an extra turn after this one', () => {
    const g = game({ p1: { battlefield: [LOST, ...n('island', 6)] } });
    g.obj(g.id('p1', LOST)).counters = { verse: 7 };
    const before = g.state.players.p1.hand.length;
    use(g, g.id('p1', LOST), 1);
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before + 7);
    expect(g.state.extraTurns).toHaveLength(1);
    expect(g.state.extraTurns![0]!.player).toBe('p1');
  });
  it('six verse counters are not enough for the extra turn', () => {
    const g = game({ p1: { battlefield: [LOST, ...n('island', 6)] } });
    g.obj(g.id('p1', LOST)).counters = { verse: 6 };
    use(g, g.id('p1', LOST), 1);
    done(g);
    expect(g.state.extraTurns ?? []).toHaveLength(0);
  });
  it('can only be activated as a sorcery', () => {
    const g = game({ p1: { battlefield: [LOST, ...n('island', 6)] }, step: 'beginCombat' });
    expect(canUse(g, g.id('p1', LOST), 1)).toBe(false);
    const h = game({ p1: { hand: ['opt'], battlefield: [LOST, ...n('island', 7)] } });
    cast(h, 'opt');
    expect(canUse(h, h.id('p1', LOST), 1)).toBe(false);
  });
});

describe('Press the Enemy', () => {
  const PRESS = 'press-the-enemy';
  const setup = (hand: string[] = [], p2: string[] = ['serra-angel']) =>
    game({
      p1: { hand: [PRESS, ...hand], battlefield: n('island', 6) },
      p2: { battlefield: [...p2, 'plains'] },
    });
  it("returns an opponent's nonland permanent to its owner's hand", () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, PRESS, [objRef(g, angel)]);
    done(g, { option: 0 });
    expect(g.zoneOf(angel)).toBe('hand');
    expect(handOf(g, 'p2')).toContain('serra-angel');
  });
  it('can not target lands, your own permanents, or the spell itself', () => {
    const g = setup([], ['serra-angel']);
    g.state.battlefield.push(createOwn(g));
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === PRESS)
      .flatMap((a) => (a as { targets: { object: { id: string } }[] }).targets.map((t) => t.object.id));
    expect(targets).toEqual([g.id('p2', 'serra-angel')]);
  });
  it("returns an opponent's spell to its owner's hand", () => {
    const g = game({
      p1: { hand: [PRESS], battlefield: n('island', 4) },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    cast(g, 'savannah-lions');
    const spell = g.state.stack.find((i) => i.kind === 'spell')!;
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, PRESS, [objRef(g, spell.id)]);
    done(g, { option: 0 });
    expect(handOf(g, 'p2')).toContain('savannah-lions');
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'savannah-lions')).toBe(false);
  });
  it('then you may cast an instant or sorcery with equal or lesser mana value from your hand for free', () => {
    // Serra Angel has mana value 5: Opt (1), Day of Judgment (4) and Overrun (5) can be cast; a creature can't.
    const g = setup(['opt', 'day-of-judgment', 'overrun', 'savannah-lions']);
    cast(g, PRESS, [objRef(g, g.id('p2', 'serra-angel'))]);
    settleStack(g);
    expect(g.decision.kind).toBe('castFree');
    const offered = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(offered.sort()).toEqual(['day-of-judgment', 'opt', 'overrun']);
    g.do(g.legal().find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'opt')!);
    settleStack(g);
    keepScry(g);
    // The six Islands: Press cost four; Opt cost nothing.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'island')).toHaveLength(4);
    expect(graveyardOf(g)).toContain('opt');
  });
  it('only offers spells with mana value equal to or less than the returned permanent', () => {
    // Savannah Lions has mana value 1: Opt (1) yes, Day of Judgment (4) no.
    const g = setup(['opt', 'day-of-judgment'], ['savannah-lions']);
    cast(g, PRESS, [objRef(g, g.id('p2', 'savannah-lions'))]);
    settleStack(g);
    expect(g.decision.kind).toBe('castFree');
    const offered = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(offered).toEqual(['opt']);
  });
  it('the returned card itself may be cast if it is an instant or sorcery with a low enough mana value', () => {
    const g = game({
      p1: { hand: [PRESS], battlefield: n('island', 4) },
      p2: { hand: ['opt'], battlefield: ['island'] },
      active: 'p2',
    });
    cast(g, 'opt');
    const spell = g.state.stack.find((i) => i.kind === 'spell')!;
    g.pass();
    cast(g, PRESS, [objRef(g, spell.id)]);
    settleStack(g);
    // Opt is now in p2's hand, not p1's: p1 has nothing to cast.
    expect(g.decision.kind).toBe('priority');
  });
  it('you may decline to cast', () => {
    const g = setup(['opt']);
    cast(g, PRESS, [objRef(g, g.id('p2', 'serra-angel'))]);
    settleStack(g);
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(handOf(g)).toEqual(['opt']);
  });
  it("counts X in a returned spell's mana value", () => {
    // Blue Sun's Zenith with X=1 on the stack has mana value 4: Bake into a Pie (4) can be cast, not with X ignored (3).
    const g = game({
      p1: { hand: [PRESS, 'bake-into-a-pie'], battlefield: n('island', 4) },
      p2: { hand: ['blue-suns-zenith'], battlefield: ['savannah-lions', ...n('island', 4)] },
      active: 'p2',
    });
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'blue-suns-zenith', 'hand'),
      targets: [{ player: 'p2' }],
      x: 1,
    });
    const spell = g.state.stack.find((i) => i.kind === 'spell')!;
    g.pass();
    cast(g, PRESS, [objRef(g, spell.id)]);
    settleStack(g);
    expect(g.decision.kind).toBe('castFree');
    expect(
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bake-into-a-pie'),
    ).toBe(true);
  });
  it('nothing is cast if the target became illegal', () => {
    const g = setup(['opt']);
    const angel = g.id('p2', 'serra-angel');
    cast(g, PRESS, [objRef(g, angel)]);
    // The Angel leaves in response.
    g.state.battlefield = g.state.battlefield.filter((id) => id !== angel);
    g.obj(angel).zone = 'graveyard';
    g.obj(angel).zcc++;
    g.state.players.p2.graveyard.push(angel);
    settleStack(g);
    expect(g.decision.kind).toBe('priority');
    expect(handOf(g)).toEqual(['opt']);
  });
});

/** A permanent of p1's that Press the Enemy must not be able to target (a Savannah Lions). */
function createOwn(g: Game): string {
  return g.id('p1', 'island');
}
