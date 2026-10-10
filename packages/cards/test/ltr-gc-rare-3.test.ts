import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activate, bf, done, gy, hand, keywords, toStep } from './tdm-green-helpers.ts';
import { attack, toBlockers, use } from './ltr-white-helpers.ts';

// The Lord of the Rings 21d: the colorless rares of the packets' random slot, part 1 (Equipment and the Horns).

const COLORLESS = [
  'Andúril, Flame of the West',
  'Barad-dûr',
  'Glamdring',
  'Horn of Gondor',
  'Horn of the Mark',
  'Minas Tirith',
  'Mines of Moria',
  'Mithril Coat',
  'Mount Doom',
  'Palantír of Orthanc',
  'Phial of Galadriel',
  'Rivendell',
  'Sting, the Glinting Dagger',
  'The One Ring',
  'The Shire',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Resolves everything (bounded): triggers take their first real target, options take the first, scries stay on top. */
function run(g: GameDriver): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
    else if (d.kind === 'chooseOption') g.do({ type: 'chooseOption', player: d.player, index: 0 });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseObject')
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action);
    else break;
  }
  return g;
}
const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const ANDURIL = slug('Andúril, Flame of the West');
const equipIndex = (defId: string) =>
  cardDb.get(defId)!.abilities.findIndex((a) => a.kind === 'activated');

describe('every card is in the pool', () => {
  it('has all 15 colorless rares', () => {
    expect(COLORLESS).toHaveLength(15);
    for (const name of COLORLESS) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('Andúril, Flame of the West', () => {
  const setup = (creature: string) =>
    game({
      p1: { battlefield: [ANDURIL, creature, ...n('plains', 2)] },
    });
  it('equips for {2} and gives +3/+1', () => {
    const g = setup('savannah-lions');
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', ANDURIL), equipIndex(ANDURIL), [lions]);
    done(g);
    expect(pt(g, lions)).toEqual([5, 2]);
  });
  it('creates two tapped 1/1 flying Spirits when a nonlegendary creature attacks', () => {
    const g = setup('savannah-lions');
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', ANDURIL)).attachedTo = lions;
    attack(g, [lions]);
    run(g);
    const spirits = bf(g, 'ltr-spirit-token');
    expect(spirits).toHaveLength(2);
    for (const id of g.state.battlefield.filter((x) => g.obj(x).defId === 'ltr-spirit-token')) {
      expect(g.obj(id).tapped).toBe(true);
      expect(pt(g, id)).toEqual([1, 1]);
      expect(keywords(g, id)).toContain('flying');
      expect(g.state.combat?.attackers.some((a) => a.id === id)).toBe(false);
    }
  });
  it('creates them tapped and attacking when the creature is legendary', () => {
    const g = setup('meriadoc-brandybuck');
    const mer = g.id('p1', 'meriadoc-brandybuck');
    g.obj(g.id('p1', ANDURIL)).attachedTo = mer;
    attack(g, [mer]);
    run(g);
    const spirits = g.state.battlefield.filter((x) => g.obj(x).defId === 'ltr-spirit-token');
    expect(spirits).toHaveLength(2);
    for (const id of spirits) {
      expect(g.obj(id).tapped).toBe(true);
      const rec = g.state.combat?.attackers.find((a) => a.id === id);
      expect(rec).toBeDefined();
      expect(rec?.defender).toBe('p2');
    }
  });
  it('counts a Ring-bearer as legendary', () => {
    const g = setup('savannah-lions');
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', ANDURIL)).attachedTo = lions;
    g.state.players.p1.ring = { tempted: 1, bearer: { id: lions, zcc: g.obj(lions).zcc } };
    attack(g, [lions]);
    run(g);
    const spirits = g.state.battlefield.filter((x) => g.obj(x).defId === 'ltr-spirit-token');
    expect(spirits).toHaveLength(2);
    expect(spirits.every((id) => g.state.combat?.attackers.some((a) => a.id === id))).toBe(true);
  });
  it('the tokens deal combat damage when they attack', () => {
    const g = setup('meriadoc-brandybuck');
    const mer = g.id('p1', 'meriadoc-brandybuck');
    g.obj(g.id('p1', ANDURIL)).attachedTo = mer;
    attack(g, [mer]);
    run(g);
    toStep(g, 'main2');
    // 2 + 3 from Meriadoc with Andúril, plus two Spirits: 5 + 2.
    expect(g.state.players.p2.life).toBe(20 - 5 - 2);
  });
});

describe('Glamdring', () => {
  const setup = (graveyard: string[] = [], hand: string[] = []) =>
    game({
      p1: {
        battlefield: ['glamdring', 'savannah-lions', ...n('plains', 3), ...n('island', 3)],
        graveyard,
        hand,
      },
      p2: { battlefield: [] },
    });
  it('equips for {3}: first strike and +1/+0 for each instant and sorcery card in your graveyard', () => {
    const g = setup(['shock', 'giant-growth', 'ordinary-bear', 'forest']);
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', 'glamdring'), equipIndex('glamdring'), [lions]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(keywords(g, lions)).toContain('firstStrike');
  });
  it('lets you cast an instant or sorcery with mana value at most the damage free when it deals combat damage to a player', () => {
    const g = setup([], ['shock', 'cancel', 'ordinary-bear', 'opt']);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'glamdring')).attachedTo = lions;
    attack(g, [lions]);
    for (let i = 0; i < 40 && g.decision.kind !== 'castFree'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(g.decision.kind).toBe('castFree');
    if (g.decision.kind !== 'castFree') return;
    // 2 damage: Shock (1) and Opt (1) are offered; Cancel (3) and the creature are not.
    expect(g.decision.cards.map((id) => g.obj(id).defId).sort()).toEqual(['opt', 'shock']);
    const shock = g.id('p1', 'shock', 'hand');
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === shock &&
          a.targets.some((t) => 'player' in t && t.player === 'p2'),
      );
    expect(act).toBeDefined();
    g.do(act!);
    run(g);
    expect(gy(g)).toContain('shock');
    // 2 combat damage + 2 from the free Shock.
    expect(g.state.players.p2.life).toBe(20 - 2 - 2);
    // No mana was spent.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped),
    ).toHaveLength(0);
  });
  it('can be declined', () => {
    const g = setup([], ['shock']);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'glamdring')).attachedTo = lions;
    attack(g, [lions]);
    for (let i = 0; i < 40 && g.decision.kind !== 'castFree'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(hand(g)).toContain('shock');
  });
  it("doesn't trigger when the equipped creature is blocked (no damage to a player)", () => {
    const g = game({
      p1: { battlefield: ['glamdring', 'serra-angel'], hand: ['shock'] },
      p2: { battlefield: ['fog-bank'] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(g.id('p1', 'glamdring')).attachedTo = angel;
    attack(g, [angel]);
    toBlockers(g);
    g.block([g.id('p2', 'fog-bank'), angel]);
    toStep(g, 'main2');
    expect(g.decision.kind).toBe('priority');
    expect(hand(g)).toContain('shock');
  });
});

describe('Horn of Gondor', () => {
  it('creates a 1/1 white Human Soldier when it enters', () => {
    const g = game({ p1: { hand: ['horn-of-gondor'], battlefield: n('plains', 3) } });
    cast(g, 'horn-of-gondor');
    run(g);
    const soldiers = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'hob-human-soldier-token',
    );
    expect(soldiers).toHaveLength(1);
    expect(pt(g, soldiers[0]!)).toEqual([1, 1]);
  });
  it('{3}, {T}: creates a Human Soldier for each Human you control', () => {
    const g = game({
      p1: {
        battlefield: [
          'horn-of-gondor',
          'wose-pathfinder',
          'wose-pathfinder',
          'savannah-lions',
          ...n('plains', 3),
        ],
      },
    });
    activate(g, g.id('p1', 'horn-of-gondor'), equipIndex('horn-of-gondor'));
    run(g);
    // Two Humans (the Wose Pathfinders; the Cat isn't one): two Soldiers.
    expect(bf(g, 'hob-human-soldier-token')).toHaveLength(2);
    expect(g.obj(g.id('p1', 'horn-of-gondor')).tapped).toBe(true);
  });
  it('counts the Soldiers it made before (they are Humans too)', () => {
    const g = game({
      p1: {
        battlefield: [
          'horn-of-gondor',
          'hob-human-soldier-token',
          'hob-human-soldier-token',
          ...n('plains', 3),
        ],
      },
    });
    activate(g, g.id('p1', 'horn-of-gondor'), equipIndex('horn-of-gondor'));
    run(g);
    expect(bf(g, 'hob-human-soldier-token')).toHaveLength(4);
  });
});

describe('Horn of the Mark', () => {
  const setup = (attackers: string[], library: string[]) => {
    const g = game({
      p1: { battlefield: ['horn-of-the-mark', ...attackers], library },
    });
    return g;
  };
  it('looks at the top five when two or more creatures attack, taking a creature card into your hand', () => {
    const g = setup(
      ['savannah-lions', 'savannah-lions'],
      ['forest', 'giant-growth', 'enraged-huorn', 'mountain', 'ordinary-bear', 'island', 'plains'],
    );
    attack(g, [
      g.id('p1', 'savannah-lions'),
      g.state.battlefield.filter((x) => g.obj(x).defId === 'savannah-lions')[1]!,
    ]);
    for (let i = 0; i < 20 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    const d = g.decision;
    expect(d.kind).toBe('searchLibrary');
    if (d.kind !== 'searchLibrary') return;
    expect(d.looked).toHaveLength(5);
    // The Bear is the sixth... no: it is the fifth card, so both creature cards are among the five.
    expect(d.options.map((id) => g.obj(id).defId).sort()).toEqual([
      'enraged-huorn',
      'ordinary-bear',
    ]);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'enraged-huorn', 'library') });
    expect(hand(g)).toContain('enraged-huorn');
    // The other four go to the bottom; the sixth and seventh cards are now on top.
    expect(library(g)).toHaveLength(6);
    expect(library(g).slice(0, 2)).toEqual(['island', 'plains']);
    expect(library(g).slice(2).sort()).toEqual([
      'forest',
      'giant-growth',
      'mountain',
      'ordinary-bear',
    ]);
  });
  it("doesn't trigger when only one creature attacks", () => {
    const g = setup(['savannah-lions'], n('forest', 6));
    attack(g, [g.id('p1', 'savannah-lions')]);
    for (let i = 0; i < 6; i++) if (g.decision.kind === 'priority') g.pass();
    expect(g.decision.kind).not.toBe('searchLibrary');
    expect(g.state.stack).toHaveLength(0);
  });
  it('lets you take nothing, putting all five on the bottom', () => {
    const g = setup(
      ['savannah-lions', 'savannah-lions'],
      ['enraged-huorn', 'forest', 'forest', 'forest', 'forest', 'plains'],
    );
    const [a, b] = g.state.battlefield.filter((x) => g.obj(x).defId === 'savannah-lions');
    attack(g, [a!, b!]);
    for (let i = 0; i < 20 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(hand(g)).not.toContain('enraged-huorn');
    expect(library(g)[0]).toBe('plains');
    expect(library(g)).toHaveLength(6);
  });
});

describe('Mithril Coat', () => {
  it('is an Equipment with flash and indestructible', () => {
    const c = cardDb.get('mithril-coat')!;
    expect(c.keywords).toEqual(expect.arrayContaining(['flash', 'indestructible']));
    expect(c.subtypes).toContain('Equipment');
    expect(c.supertypes).toContain('Legendary');
  });
  it('attaches to target legendary creature you control when it enters, which gains indestructible', () => {
    const g = game({
      p1: {
        hand: ['mithril-coat'],
        battlefield: ['meriadoc-brandybuck', 'savannah-lions', ...n('plains', 3)],
      },
    });
    cast(g, 'mithril-coat');
    // The only legal target for the trigger: the legendary creature.
    run(g);
    const mer = g.id('p1', 'meriadoc-brandybuck');
    expect(g.obj(g.id('p1', 'mithril-coat')).attachedTo).toBe(mer);
    expect(keywords(g, mer)).toContain('indestructible');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('indestructible');
  });
  it("can't attach to a nonlegendary creature when it enters", () => {
    const g = game({
      p1: { hand: ['mithril-coat'], battlefield: ['savannah-lions', ...n('plains', 3)] },
    });
    cast(g, 'mithril-coat');
    run(g);
    expect(bf(g, 'mithril-coat')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'mithril-coat')).attachedTo).toBeUndefined();
  });
  it('can be cast at instant speed (flash)', () => {
    const g = game({
      p1: { hand: ['mithril-coat'], battlefield: ['meriadoc-brandybuck', ...n('plains', 3)] },
      active: 'p2',
    });
    g.pass();
    cast(g, 'mithril-coat');
    run(g);
    expect(g.obj(g.id('p1', 'mithril-coat')).attachedTo).toBe(g.id('p1', 'meriadoc-brandybuck'));
  });
  it('equips for {3} to any creature', () => {
    const g = game({
      p1: { battlefield: ['mithril-coat', 'savannah-lions', ...n('plains', 3)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', 'mithril-coat'), equipIndex('mithril-coat'), [lions]);
    done(g);
    expect(keywords(g, lions)).toContain('indestructible');
  });
  it('protects the equipped creature from destroy effects and lethal damage', () => {
    const g = game({
      p1: { battlefield: ['mithril-coat', 'savannah-lions'] },
      p2: { hand: ['doom-blade'], battlefield: ['swamp', 'swamp'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'mithril-coat')).attachedTo = lions;
    g.pass();
    cast(g, 'doom-blade', [g.ref(lions)]);
    run(g);
    expect(bf(g, 'savannah-lions')).toHaveLength(1);
  });
});

describe('Sting, the Glinting Dagger', () => {
  const lionsWith = (extra: Record<string, unknown> = {}) =>
    game({
      p1: { battlefield: ['sting-the-glinting-dagger', 'savannah-lions', ...n('plains', 2)] },
      p2: { battlefield: ['goblin-fireleaper', 'warg-rider', 'serra-angel'] },
      ...extra,
    });
  it('equips for {2}: +1/+1 and haste', () => {
    const g = lionsWith();
    const lions = g.id('p1', 'savannah-lions');
    use(g, g.id('p1', 'sting-the-glinting-dagger'), equipIndex('sting-the-glinting-dagger'), [
      lions,
    ]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('haste');
    expect(keywords(g, lions)).not.toContain('firstStrike');
  });
  it("untaps the equipped creature at the beginning of each combat (yours and others')", () => {
    const g = game({
      p1: { battlefield: ['sting-the-glinting-dagger', { card: 'savannah-lions', tapped: true }] },
      active: 'p2',
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'sting-the-glinting-dagger')).attachedTo = lions;
    expect(g.obj(lions).tapped).toBe(true);
    toStep(g, 'beginCombat');
    run(g);
    expect(g.obj(lions).tapped).toBe(false);
    // And on its controller's own turn.
    const g2 = game({
      p1: { battlefield: ['sting-the-glinting-dagger', { card: 'savannah-lions', tapped: true }] },
    });
    const l2 = g2.id('p1', 'savannah-lions');
    g2.obj(g2.id('p1', 'sting-the-glinting-dagger')).attachedTo = l2;
    toStep(g2, 'beginCombat');
    run(g2);
    expect(g2.obj(l2).tapped).toBe(false);
  });
  it('has first strike while blocked by a Goblin or an Orc', () => {
    for (const blocker of ['goblin-fireleaper', 'warg-rider']) {
      const g = lionsWith();
      const lions = g.id('p1', 'savannah-lions');
      g.obj(g.id('p1', 'sting-the-glinting-dagger')).attachedTo = lions;
      attack(g, [lions]);
      run(g);
      toBlockers(g);
      expect(keywords(g, lions)).not.toContain('firstStrike');
      g.block([g.id('p2', blocker), lions]);
      expect(keywords(g, lions), blocker).toContain('firstStrike');
    }
  });
  it('has no first strike when blocked by something else, or unblocked', () => {
    const g = lionsWith();
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'sting-the-glinting-dagger')).attachedTo = lions;
    attack(g, [lions]);
    run(g);
    toBlockers(g);
    g.block([g.id('p2', 'serra-angel'), lions]);
    expect(keywords(g, lions)).not.toContain('firstStrike');
    const g2 = lionsWith();
    const l2 = g2.id('p1', 'savannah-lions');
    g2.obj(g2.id('p1', 'sting-the-glinting-dagger')).attachedTo = l2;
    attack(g2, [l2]);
    run(g2);
    toBlockers(g2);
    g2.block();
    expect(keywords(g2, l2)).not.toContain('firstStrike');
  });
  it('has first strike while blocking a Goblin or Orc', () => {
    const g = game({
      p1: { battlefield: ['sting-the-glinting-dagger', 'savannah-lions'] },
      p2: { battlefield: ['goblin-fireleaper', 'ordinary-bear'] },
      active: 'p2',
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'sting-the-glinting-dagger')).attachedTo = lions;
    attack(g, [g.id('p2', 'goblin-fireleaper'), g.id('p2', 'ordinary-bear')]);
    run(g);
    toBlockers(g);
    g.block([lions, g.id('p2', 'ordinary-bear')]);
    expect(keywords(g, lions)).not.toContain('firstStrike');
    const g2 = game({
      p1: { battlefield: ['sting-the-glinting-dagger', 'savannah-lions'] },
      p2: { battlefield: ['goblin-fireleaper', 'ordinary-bear'] },
      active: 'p2',
    });
    const l2 = g2.id('p1', 'savannah-lions');
    g2.obj(g2.id('p1', 'sting-the-glinting-dagger')).attachedTo = l2;
    attack(g2, [g2.id('p2', 'goblin-fireleaper'), g2.id('p2', 'ordinary-bear')]);
    run(g2);
    toBlockers(g2);
    g2.block([l2, g2.id('p2', 'goblin-fireleaper')]);
    expect(keywords(g2, l2)).toContain('firstStrike');
  });
});
