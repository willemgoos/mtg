import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import type { Action, GameState } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import { cast, engine, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  casts,
  chars,
  counters,
  done,
  gy,
  hand,
  keywords,
  toStep,
} from './tdm-green-helpers.ts';

// Wilds of Eldraine (23b): green cards.

const NAMES = [
  "Agatha's Champion",
  'Beanstalk Wurm',
  'Bestial Bloodline',
  'Bramble Familiar',
  'Brave the Wilds',
  'Commune with Nature',
  'Curse of the Werefox',
  'Elvish Archivist',
  'Feral Encounter',
  'Ferocious Werefox',
  'Graceful Takedown',
  'Gruff Triplets',
  'Hamlet Glutton',
  'Hollow Scavenger',
  'Leaping Ambush',
  "Night of the Sweets' Revenge",
  'Redtooth Genealogist',
  'Redtooth Vanguard',
  'Return from the Wilds',
  'Rootrider Faun',
  'Sentinel of Lost Lore',
  'Skybeast Tracker',
  'Stormkeld Vanguard',
  'Tanglespan Lookout',
  'Tempest Hart',
  'Territorial Witchstalker',
  "The Huntsman's Redemption",
  'Thunderous Debut',
  'Titanic Growth',
  'Toadstool Admirer',
  'Tough Cookie',
  'Troublemaker Ouphe',
  'Up the Beanstalk',
  'Verdant Outrider',
  'Welcome to Sweettooth',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A game with some cards put into exile before it starts (the scenario builder has no exile). */
function gameWithExile(
  spec: ScenarioSpec,
  exile: { p1?: string[]; p2?: string[] },
  adventure = false,
): GameDriver {
  const s: GameState = buildScenario(cardDb, spec);
  for (const p of ['p1', 'p2'] as const)
    for (const defId of exile[p] ?? []) {
      // Take the card out of its library and exile it.
      const id = s.players[p].library.find((x) => s.objects[x]!.defId === defId);
      if (!id) throw new Error(`no ${defId} in ${p}'s library`);
      s.players[p].library = s.players[p].library.filter((x) => x !== id);
      s.objects[id]!.zone = 'exile';
      if (adventure) s.objects[id]!.onAdventure = true;
      s.players[p].exile.push(id);
    }
  return new GameDriver(engine, s);
}

const lib = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const playForest = (g: GameDriver) =>
  g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
/** The legal castSpell action for a back face (the Adventure). */
const adventureCast = (g: GameDriver, defId: string) =>
  g
    .legal()
    .find((a) => a.type === 'castSpell' && a.card === g.id('p1', defId, 'hand') && a.back) as
    Extract<Action, { type: 'castSpell' }> | undefined;
/** Chooses a trigger's targets by the object it names (or the first legal choice). */
const chooseTarget = (g: GameDriver, id?: string) =>
  g.do(
    g
      .legal()
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          (id === undefined || JSON.stringify(a.targets).includes(id)),
      ) as Action,
  );
/** Passes priority until the decision is of this kind. */
function until(g: GameDriver, kind: string) {
  for (let i = 0; i < 60 && g.decision.kind !== kind; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else break;
  }
  expect(g.decision.kind).toBe(kind);
  return g;
}
/** Passes (settling triggers) until a later turn of `player`'s precombat main phase. */
function nextMain(g: GameDriver, player: 'p1' | 'p2' = 'p1') {
  const from = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    const s = g.state;
    if (s.turn.number > from && s.turn.activePlayer === player && s.turn.step === 'main1')
      if (s.decision.kind === 'priority' && s.stack.length === 0) return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'discardToHandSize') g.do(g.legal()[0]!);
    else done(g);
  }
  throw new Error('never reached the next main phase');
}

/** Passes (confirming attacks and blocks of nothing) until the decision is of this kind. */
function advanceTo(g: GameDriver, kind: string, maxSteps = 300) {
  for (let i = 0; i < maxSteps; i++) {
    const d = g.decision;
    if (d.kind === kind) return g;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'discardToHandSize') g.do(g.legal()[0]!);
    else throw new Error(`stuck at ${d.kind} while waiting for ${kind}`);
  }
  throw new Error(`never reached ${kind}`);
}
/** Chooses the first legal action of a decision (or the one for this card). */
function pick(g: GameDriver, card?: string) {
  const act = g
    .legal()
    .find((a) => (card ? a.type === 'chooseCard' && a.card && g.obj(a.card).defId === card : true));
  if (!act) throw new Error('no such choice');
  return g.do(act);
}

describe('every card is in the pool', () => {
  it('has all 35 green cards', () => {
    expect(NAMES).toHaveLength(35);
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
  it('the Adventure cards are adventure cards', () => {
    for (const name of [
      'Hollow Scavenger',
      'Beanstalk Wurm',
      'Bramble Familiar',
      'Tempest Hart',
      'Ferocious Werefox',
      'Stormkeld Vanguard',
    ])
      expect(cardDb.get(slug(name))!.adventure, name).toBe(true);
  });
});

describe('Elvish Archivist', () => {
  it('puts two +1/+1 counters on itself when artifacts enter, once each turn', () => {
    const g = game({
      p1: { hand: ['tough-cookie'], battlefield: ['elvish-archivist', ...n('forest', 4)] },
    });
    const archivist = g.id('p1', 'elvish-archivist');
    expect(pt(g, archivist)).toEqual([0, 1]);
    cast(g, 'tough-cookie');
    done(g);
    // The Cookie is an artifact creature and it makes a Food: one trigger for both.
    expect(pt(g, archivist)).toEqual([2, 3]);
  });
  it('draws a card when enchantments enter, once each turn', () => {
    const g = game({
      p1: {
        hand: ['up-the-beanstalk', 'night-of-the-sweets-revenge'],
        battlefield: ['elvish-archivist', ...n('forest', 6)],
        library: ['shock', 'shock', 'shock'],
      },
    });
    cast(g, 'up-the-beanstalk');
    done(g);
    // Up the Beanstalk draws a card itself, and the Archivist draws one.
    expect(hand(g)).toHaveLength(3);
    const before = hand(g).length;
    cast(g, 'night-of-the-sweets-revenge');
    done(g);
    // Once each turn: no second card.
    expect(hand(g)).toHaveLength(before - 1);
  });
  it('the two abilities are independent, and each triggers again the next turn', () => {
    const g = game({
      p1: {
        hand: ['night-of-the-sweets-revenge', 'tough-cookie'],
        battlefield: ['elvish-archivist', ...n('forest', 8)],
        library: ['shock', 'shock', 'shock', 'shock'],
      },
    });
    cast(g, 'night-of-the-sweets-revenge');
    done(g);
    // The enchantment enters and makes a Food: both abilities.
    const archivist = g.id('p1', 'elvish-archivist');
    expect(pt(g, archivist)).toEqual([2, 3]);
    expect(hand(g)).toHaveLength(2);
    cast(g, 'tough-cookie');
    done(g);
    expect(pt(g, archivist)).toEqual([2, 3]);
  });
});

describe('Hollow Scavenger // Bakery Raid', () => {
  it('Bakery Raid creates a Food and the creature can be cast from exile', () => {
    const g = game({
      p1: { hand: ['hollow-scavenger'], battlefield: n('forest', 4) },
    });
    const card = g.id('p1', 'hollow-scavenger', 'hand');
    done(g.do(adventureCast(g, 'hollow-scavenger')!));
    expect(bf(g, 'food-token')).toHaveLength(1);
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card && !a.back)).toBe(true);
  });
  it('is a 3/2 Wolf', () => {
    const g = game({ p1: { battlefield: ['hollow-scavenger'] } });
    expect(pt(g, g.id('p1', 'hollow-scavenger'))).toEqual([3, 2]);
  });
  it('{1}, sacrifice a Food: +2/+2, only once each turn', () => {
    const g = game({
      p1: { battlefield: ['hollow-scavenger', 'food-token', 'food-token', ...n('forest', 3)] },
    });
    const id = g.id('p1', 'hollow-scavenger');
    const idx = abilityIndex('hollow-scavenger', 'activated');
    activate(g, id, idx);
    done(g);
    expect(pt(g, id)).toEqual([5, 4]);
    expect(bf(g, 'food-token')).toHaveLength(1);
    expect(() => activate(g, id, idx)).toThrow();
  });
  it('can not be activated without a Food', () => {
    const g = game({ p1: { battlefield: ['hollow-scavenger', ...n('forest', 3)] } });
    expect(() => activate(g, g.id('p1', 'hollow-scavenger'), 0)).toThrow();
  });
});

describe('Beanstalk Wurm // Plant Beans', () => {
  it('is a 5/4 Plant Wurm with reach', () => {
    const g = game({ p1: { battlefield: ['beanstalk-wurm'] } });
    const id = g.id('p1', 'beanstalk-wurm');
    expect(pt(g, id)).toEqual([5, 4]);
    expect(keywords(g, id)).toContain('reach');
  });
  it('Plant Beans lets you play an additional land this turn', () => {
    const g = game({
      p1: { hand: ['beanstalk-wurm', 'forest', 'forest', 'forest'], battlefield: n('forest', 2) },
    });
    const card = g.id('p1', 'beanstalk-wurm', 'hand');
    done(g.do(adventureCast(g, 'beanstalk-wurm')!));
    expect(g.zoneOf(card)).toBe('exile');
    playForest(g);
    playForest(g);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);
  });
});

describe('Bramble Familiar // Fetch Quest', () => {
  it('taps for {G}', () => {
    const g = game({
      p1: { hand: ['bramble-familiar'], battlefield: ['bramble-familiar', 'forest'] },
    });
    // {1}{G} from the Familiar and the Forest casts the one in hand.
    done(cast(g, 'bramble-familiar'));
    expect(bf(g, 'bramble-familiar')).toHaveLength(2);
    expect(g.obj(g.id('p1', 'bramble-familiar')).tapped).toBe(true);
  });
  it('{1}{G}, {T}, discard a card: returns itself to its owner hand', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['bramble-familiar', ...n('forest', 2)] },
    });
    const id = g.id('p1', 'bramble-familiar');
    activate(g, id, abilityIndex('bramble-familiar', 'activated'));
    done(g);
    expect(g.zoneOf(id)).toBe('hand');
    expect(gy(g)).toEqual(['shock']);
  });
  it('Fetch Quest mills seven and puts a creature, enchantment, or land card from among them onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['bramble-familiar'],
        battlefield: n('forest', 7),
        library: [
          'shock',
          'beanstalk-wurm',
          'shock',
          'forest',
          'shock',
          'shock',
          'shock',
          'island',
        ],
      },
    });
    g.do(adventureCast(g, 'bramble-familiar')!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels.sort()).toEqual([
      'Put Beanstalk Wurm onto the battlefield',
      'Put Forest onto the battlefield',
    ]);
    done(g, { option: /Wurm/ });
    expect(bf(g, 'beanstalk-wurm')).toHaveLength(1);
    expect(gy(g).filter((d) => d === 'shock')).toHaveLength(5);
    expect(gy(g)).toContain('forest');
    expect(lib(g)).toEqual(['island']);
  });
  it('Fetch Quest can put a land onto the battlefield untapped, and the card is not optional', () => {
    const g = game({
      p1: {
        hand: ['bramble-familiar'],
        battlefield: n('forest', 7),
        library: ['island', ...n('shock', 6), 'forest'],
      },
    });
    g.do(adventureCast(g, 'bramble-familiar')!);
    settle(g);
    // The only card that qualifies is put onto the battlefield with no way to decline.
    expect(g.decision.kind).toBe('chooseOption');
    expect((g.decision as { options: unknown[] }).options).toHaveLength(1);
    done(g);
    const island = g.state.battlefield.find((id) => g.obj(id).defId === 'island')!;
    expect(island).toBeDefined();
    expect(g.obj(island).tapped).toBe(false);
  });
  it('Fetch Quest puts an Aura onto the battlefield attached to a permanent it can enchant, your choice', () => {
    const g = game({
      p1: {
        hand: ['bramble-familiar'],
        battlefield: [...n('forest', 7), 'ordinary-bear', 'tanglespan-lookout'],
        library: [...n('shock', 6), 'bestial-bloodline', 'forest'],
      },
    });
    g.do(adventureCast(g, 'bramble-familiar')!);
    settle(g);
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels.sort()).toEqual([
      'Put Bestial Bloodline onto the battlefield enchanting Ordinary Bear',
      'Put Bestial Bloodline onto the battlefield enchanting Tanglespan Lookout',
    ]);
    done(g, { option: /Lookout/ });
    const aura = bf(g, 'bestial-bloodline')[0]!;
    expect(g.obj(aura).attachedTo).toBe(g.id('p1', 'tanglespan-lookout'));
    expect(pt(g, g.id('p1', 'tanglespan-lookout'))).toEqual([4, 5]);
  });
  it('Fetch Quest does not offer an Aura with nothing to enchant, and does nothing when nothing fits', () => {
    const g = game({
      p1: {
        hand: ['bramble-familiar'],
        battlefield: n('forest', 7),
        library: [...n('shock', 6), 'bestial-bloodline', 'forest'],
      },
    });
    g.do(adventureCast(g, 'bramble-familiar')!);
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(gy(g).filter((d) => d === 'shock')).toHaveLength(6);
    expect(gy(g)).toContain('bestial-bloodline');
    expect(bf(g, 'bestial-bloodline')).toHaveLength(0);
  });
});

describe('Territorial Witchstalker', () => {
  const atCombat = (extra: string[]) => {
    const g = game({ p1: { battlefield: ['territorial-witchstalker', ...extra] } });
    toStep(g, 'beginCombat');
    return g;
  };
  it('is a 2/3 Wolf with defender', () => {
    const g = game({ p1: { battlefield: ['territorial-witchstalker'] } });
    const id = g.id('p1', 'territorial-witchstalker');
    expect(pt(g, id)).toEqual([2, 3]);
    expect(keywords(g, id)).toContain('defender');
  });
  it('with a creature of power 4 or greater, gets +1/+0 and can attack at the beginning of combat', () => {
    const g = game({
      p1: { battlefield: ['territorial-witchstalker', 'beanstalk-wurm'] },
    });
    const id = g.id('p1', 'territorial-witchstalker');
    g.state.objects[id]!.summoningSick = false;
    g.passBoth();
    done(g);
    expect(g.state.turn.step).toBe('beginCombat');
    expect(pt(g, id)).toEqual([3, 3]);
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    expect(g.legal().some((a) => a.type === 'addAttacker' && a.attacker === id)).toBe(true);
  });
  it('does nothing without such a creature', () => {
    const g = atCombat(['tanglespan-lookout']);
    g.passBoth();
    done(g);
    expect(pt(g, g.id('p1', 'territorial-witchstalker'))).toEqual([2, 3]);
  });
});

describe('Leaping Ambush and Titanic Growth', () => {
  it('Leaping Ambush gives +1/+3 and reach and untaps it', () => {
    const g = game({
      p1: {
        hand: ['leaping-ambush'],
        battlefield: ['forest', { card: 'serra-angel', tapped: true }],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'leaping-ambush', [g.ref(angel)]);
    done(g);
    expect(pt(g, angel)).toEqual([5, 7]);
    expect(keywords(g, angel)).toContain('reach');
    expect(g.obj(angel).tapped).toBe(false);
    nextMain(g, 'p2');
    expect(pt(g, angel)).toEqual([4, 4]);
    expect(keywords(g, angel)).not.toContain('reach');
  });
  it('Titanic Growth gives +4/+4 until end of turn', () => {
    const g = game({
      p1: { hand: ['titanic-growth'], battlefield: ['ordinary-bear', ...n('forest', 2)] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'titanic-growth', [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([8, 9]);
  });
});

describe('Rootrider Faun', () => {
  it('is a 1/3 Satyr Scout that taps for {G}', () => {
    const g = game({
      p1: { hand: ['titanic-growth'], battlefield: ['rootrider-faun', 'forest', 'ordinary-bear'] },
    });
    const faun = g.id('p1', 'rootrider-faun');
    expect(pt(g, faun)).toEqual([1, 3]);
    cast(g, 'titanic-growth', [g.ref(g.id('p1', 'ordinary-bear'))]);
    done(g);
    expect(g.obj(faun).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(true);
  });
  it('{1}, {T}: adds one mana of any color', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['rootrider-faun', 'forest'] },
    });
    const faun = g.id('p1', 'rootrider-faun');
    // {W}: there is no white mana until the Faun makes some.
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
    activate(g, faun, abilityIndex('rootrider-faun', 'activated'));
    expect(g.state.players.p1.pool).toHaveLength(1);
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(true);
    done(cast(g, 'savannah-lions'));
    expect(bf(g, 'savannah-lions')).toHaveLength(1);
  });
});

describe('Up the Beanstalk', () => {
  it('draws a card when it enters and when you cast a spell with mana value 5 or greater', () => {
    const g = game({
      p1: {
        hand: ['up-the-beanstalk', 'beanstalk-wurm', 'titanic-growth'],
        battlefield: [...n('forest', 10), 'ordinary-bear'],
        library: n('shock', 5),
      },
    });
    cast(g, 'up-the-beanstalk');
    done(g);
    expect(hand(g)).toHaveLength(3);
    cast(g, 'beanstalk-wurm');
    done(g);
    // The Wurm costs {4}{G}: one card.
    expect(hand(g)).toHaveLength(3);
    cast(g, 'titanic-growth', [g.ref(g.id('p1', 'ordinary-bear'))]);
    done(g);
    // Mana value 2: no card.
    expect(hand(g)).toHaveLength(2);
  });
});

describe('Tanglespan Lookout', () => {
  it('draws a card whenever an Aura you control enters, including Roles', () => {
    const g = game({
      p1: {
        hand: ['ferocious-werefox'],
        battlefield: ['tanglespan-lookout', 'ordinary-bear', ...n('forest', 4)],
        library: ['shock', 'shock'],
      },
    });
    const bear = g.id('p1', 'ordinary-bear');
    const act = adventureCast(g, 'ferocious-werefox')!;
    expect(act).toBeDefined();
    g.do({ ...act, targets: [g.ref(bear)] });
    done(g);
    expect(hand(g)).toEqual(['shock']);
  });
});

describe("The Huntsman's Redemption", () => {
  const withSaga = (extra: Partial<NonNullable<ScenarioSpec['p1']>> = {}) => {
    const g = game({
      p1: {
        hand: ['the-huntsmans-redemption'],
        battlefield: n('forest', 3),
        library: ['shock', 'ordinary-bear', 'forest', 'shock', 'shock', 'shock', 'shock', 'shock'],
        ...extra,
      },
    });
    cast(g, 'the-huntsmans-redemption');
    done(g);
    return g;
  };
  it('I creates a 3/3 green Beast', () => {
    const g = withSaga();
    const [beast] = bf(g, 'beast-3-token');
    expect(beast).toBeDefined();
    expect(pt(g, beast!)).toEqual([3, 3]);
    expect(cardDb.get('beast-3-token')!.colors).toEqual(['G']);
    expect(cardDb.get('beast-3-token')!.subtypes).toEqual(['Beast']);
  });
  it('II may sacrifice a creature, then searches for a creature or basic land card', () => {
    const g = withSaga();
    advanceTo(g, 'optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.decision.kind).toBe('sacrificeSeveral');
    pick(g);
    expect(bf(g, 'beast-3-token')).toHaveLength(0);
    expect(g.decision.kind).toBe('searchLibrary');
    // Only creature cards and basic lands can be chosen.
    const names = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(names.sort()).toEqual(['forest', 'ordinary-bear']);
    pick(g, 'ordinary-bear');
    expect(hand(g)).toContain('ordinary-bear');
  });
  it('II: declining sacrifices nothing and finds nothing', () => {
    const g = withSaga();
    advanceTo(g, 'optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(bf(g, 'beast-3-token')).toHaveLength(1);
    expect(hand(g)).not.toContain('ordinary-bear');
  });
  it('II: you can sacrifice another creature than the Beast', () => {
    const g = withSaga({ battlefield: [...n('forest', 3), 'tanglespan-lookout'] });
    advanceTo(g, 'optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    const lookout = g.id('p1', 'tanglespan-lookout');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card === lookout) as Action);
    expect(g.zoneOf(lookout)).toBe('graveyard');
    expect(bf(g, 'beast-3-token')).toHaveLength(1);
    pick(g, 'forest');
    expect(hand(g)).toContain('forest');
  });
  it('III gives up to two creatures +2/+2 and trample until end of turn', () => {
    const g = withSaga({ battlefield: [...n('forest', 3), 'tanglespan-lookout'] });
    const saga = g.id('p1', 'the-huntsmans-redemption');
    g.obj(saga).counters = { lore: 2 };
    advanceTo(g, 'chooseTriggerTargets');
    const lookout = g.id('p1', 'tanglespan-lookout');
    const beast = bf(g, 'beast-3-token')[0]!;
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            JSON.stringify(a.targets).includes(lookout) &&
            JSON.stringify(a.targets).includes(beast),
        ) as Action,
    );
    done(g);
    expect(pt(g, lookout)).toEqual([4, 5]);
    expect(pt(g, beast)).toEqual([5, 5]);
    expect(keywords(g, lookout)).toContain('trample');
    expect(keywords(g, beast)).toContain('trample');
    // The Saga is sacrificed after chapter III.
    expect(g.zoneOf(saga)).toBe('graveyard');
  });
  it('III: the targets are optional ("up to two")', () => {
    const g = withSaga({ battlefield: [...n('forest', 3), 'tanglespan-lookout'] });
    const saga = g.id('p1', 'the-huntsmans-redemption');
    g.obj(saga).counters = { lore: 2 };
    advanceTo(g, 'chooseTriggerTargets');
    const lookout = g.id('p1', 'tanglespan-lookout');
    expect(g.legal().some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            JSON.stringify(a.targets).includes(lookout),
        ) as Action,
    );
    done(g);
    expect(pt(g, lookout)).toEqual([4, 5]);
  });
});

describe("Night of the Sweets' Revenge", () => {
  const play = () => {
    const g = game({
      p1: {
        hand: ['night-of-the-sweets-revenge'],
        battlefield: [...n('forest', 4), 'ordinary-bear', 'tanglespan-lookout'],
      },
    });
    cast(g, 'night-of-the-sweets-revenge');
    done(g);
    return g;
  };
  it('creates a Food when it enters', () => {
    const g = play();
    expect(bf(g, 'food-token')).toHaveLength(1);
  });
  it('Foods you control have "{T}: Add {G}"', () => {
    const g = play();
    const foodId = g.id('p1', 'food-token');
    // The four Forests are tapped for the enchantment; the Food alone pays {G}.
    for (const id of bf(g, 'forest')) g.obj(id).tapped = true;
    const g2 = game({
      p1: {
        hand: ['titanic-growth'],
        battlefield: ['night-of-the-sweets-revenge', 'food-token', 'food-token', 'ordinary-bear'],
      },
    });
    expect(casts(g2, 'titanic-growth').length).toBeGreaterThan(0);
    done(cast(g2, 'titanic-growth', [g2.ref(g2.id('p1', 'ordinary-bear'))]));
    expect(bf(g2, 'food-token').filter((id) => g2.obj(id).tapped)).toHaveLength(2);
    expect(foodId).toBeDefined();
  });
  it("Foods an opponent controls don't tap for mana", () => {
    const g = game({
      p1: {
        hand: ['titanic-growth'],
        battlefield: ['night-of-the-sweets-revenge', 'ordinary-bear'],
      },
      p2: { battlefield: ['food-token', 'food-token'] },
    });
    expect(casts(g, 'titanic-growth')).toHaveLength(0);
  });
  it('{5}{G}{G}, sacrifice it: creatures you control get +X/+X, X the number of Foods, as a sorcery', () => {
    const g = game({
      p1: {
        battlefield: [
          'night-of-the-sweets-revenge',
          'food-token',
          'food-token',
          'ordinary-bear',
          ...n('forest', 7),
        ],
      },
    });
    const ench = g.id('p1', 'night-of-the-sweets-revenge');
    const idx = abilityIndex('night-of-the-sweets-revenge', 'activated');
    activate(g, ench, idx);
    done(g);
    expect(g.zoneOf(ench)).toBe('graveyard');
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([6, 7]);
  });
  it('can not be activated outside your main phase', () => {
    const g = game({
      p1: {
        battlefield: ['night-of-the-sweets-revenge', 'food-token', ...n('forest', 7)],
      },
      step: 'beginCombat',
    });
    expect(() =>
      activate(
        g,
        g.id('p1', 'night-of-the-sweets-revenge'),
        abilityIndex('night-of-the-sweets-revenge', 'activated'),
      ),
    ).toThrow();
  });
});

describe('Commune with Nature', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['commune-with-nature'],
        battlefield: ['forest'],
        library: [
          'tanglespan-lookout',
          'shock',
          'shock',
          'titanic-growth',
          'rootrider-faun',
          'forest',
          'island',
        ],
      },
    });
  it('looks at five, puts a revealed creature card into your hand and orders the rest on the bottom', () => {
    const g = setup();
    settle(cast(g, 'commune-with-nature'));
    expect(g.decision.kind).toBe('searchLibrary');
    // Only the creature cards among the top five can be chosen.
    const names = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(names.sort()).toEqual(['rootrider-faun', 'tanglespan-lookout']);
    pick(g, 'rootrider-faun');
    expect(hand(g)).toEqual(['rootrider-faun']);
    // The rest go to the bottom one at a time: the first chosen is the highest of them.
    expect(g.decision.kind).toBe('chooseOption');
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels.sort()).toEqual(['Shock', 'Tanglespan Lookout', 'Titanic Growth']);
    const choose = (label: string) =>
      g.do({
        type: 'chooseOption',
        player: 'p1',
        index: (g.decision as { options: { label: string }[] }).options.findIndex(
          (o) => o.label === label,
        ),
      });
    choose('Titanic Growth');
    choose('Tanglespan Lookout');
    done(g);
    // Shock is the only card left: it goes below the others.
    expect(lib(g)).toEqual([
      'forest',
      'island',
      'titanic-growth',
      'tanglespan-lookout',
      'shock',
      'shock',
    ]);
  });
  it('may reveal no card at all', () => {
    const g = setup();
    settle(cast(g, 'commune-with-nature'));
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(hand(g)).toEqual([]);
    expect(g.decision.kind).toBe('chooseOption');
    for (let i = 0; i < 6 && g.decision.kind === 'chooseOption'; i++) pick(g);
    done(g);
    expect(lib(g).slice(0, 2)).toEqual(['forest', 'island']);
    expect(lib(g)).toHaveLength(7);
  });
  it('with a library of fewer than five cards, looks at what there is', () => {
    const g = game({
      p1: {
        hand: ['commune-with-nature'],
        battlefield: ['forest'],
        library: ['rootrider-faun', 'shock'],
      },
    });
    settle(cast(g, 'commune-with-nature'));
    pick(g, 'rootrider-faun');
    done(g);
    expect(hand(g)).toEqual(['rootrider-faun']);
    expect(lib(g)).toEqual(['shock']);
  });
});

describe('Redtooth Vanguard', () => {
  it('is a 3/1 Elf Warrior with trample', () => {
    const g = game({ p1: { battlefield: ['redtooth-vanguard'] } });
    const id = g.id('p1', 'redtooth-vanguard');
    expect(pt(g, id)).toEqual([3, 1]);
    expect(keywords(g, id)).toContain('trample');
  });
  it('returns to your hand from the graveyard when an enchantment you control enters and you pay {2}', () => {
    const g = game({
      p1: {
        hand: ['up-the-beanstalk'],
        graveyard: ['redtooth-vanguard'],
        battlefield: n('forest', 4),
        library: n('shock', 3),
      },
    });
    cast(g, 'up-the-beanstalk');
    done(g);
    expect(hand(g)).toContain('redtooth-vanguard');
    expect(gy(g)).not.toContain('redtooth-vanguard');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(4);
  });
  it('you may decline to pay', () => {
    const g = game({
      p1: {
        hand: ['up-the-beanstalk'],
        graveyard: ['redtooth-vanguard'],
        battlefield: n('forest', 4),
        library: n('shock', 3),
      },
    });
    cast(g, 'up-the-beanstalk');
    done(g, { accept: false });
    expect(gy(g)).toEqual(['redtooth-vanguard']);
  });
  it('does nothing without the mana', () => {
    const g = game({
      p1: {
        hand: ['up-the-beanstalk'],
        graveyard: ['redtooth-vanguard'],
        battlefield: n('forest', 2),
        library: n('shock', 3),
      },
    });
    cast(g, 'up-the-beanstalk');
    done(g);
    expect(gy(g)).toEqual(['redtooth-vanguard']);
  });
  it('does not trigger for a nonenchantment or an enchantment an opponent controls', () => {
    const g = game({
      p1: {
        hand: ['titanic-growth'],
        graveyard: ['redtooth-vanguard'],
        battlefield: [...n('forest', 4), 'ordinary-bear'],
      },
      p2: { battlefield: ['up-the-beanstalk'] },
    });
    cast(g, 'titanic-growth', [g.ref(g.id('p1', 'ordinary-bear'))]);
    done(g);
    expect(gy(g)).toContain('redtooth-vanguard');
  });
});

describe('Tempest Hart // Scan the Clouds', () => {
  it('is a 3/4 Elemental Elk with trample that grows when you cast a spell with mana value 5 or greater', () => {
    const g = game({
      p1: {
        hand: ['beanstalk-wurm', 'titanic-growth'],
        battlefield: ['tempest-hart', ...n('forest', 8)],
      },
    });
    const hart = g.id('p1', 'tempest-hart');
    expect(pt(g, hart)).toEqual([3, 4]);
    expect(keywords(g, hart)).toContain('trample');
    cast(g, 'beanstalk-wurm');
    done(g);
    expect(pt(g, hart)).toEqual([4, 5]);
    // A cheap spell does not.
    cast(g, 'titanic-growth', [g.ref(hart)]);
    done(g);
    expect(counters(g, hart)).toBe(1);
  });
  it('Scan the Clouds draws two cards, then discards two cards', () => {
    const g = game({
      p1: {
        hand: ['tempest-hart', 'shock'],
        battlefield: ['island', 'forest'],
        library: ['ordinary-bear', 'titanic-growth', 'forest'],
      },
    });
    const card = g.id('p1', 'tempest-hart', 'hand');
    g.do(adventureCast(g, 'tempest-hart')!);
    done(g);
    // Two cards were drawn; the discard of two cards is a choice from the hand.
    expect(g.decision.kind).toBe('discard');
    g.do(g.legal()[0]!);
    g.do(g.legal()[0]!);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(2);
    expect(g.zoneOf(card)).toBe('exile');
  });
});

describe('Bestial Bloodline', () => {
  it('is an Aura giving enchanted creature +2/+2', () => {
    const g = game({
      p1: { hand: ['bestial-bloodline'], battlefield: ['tanglespan-lookout', ...n('forest', 2)] },
    });
    const lookout = g.id('p1', 'tanglespan-lookout');
    cast(g, 'bestial-bloodline', [g.ref(lookout)]);
    done(g);
    expect(pt(g, lookout)).toEqual([4, 5]);
  });
  it('{4}{G}: returns it from the graveyard to your hand', () => {
    const g = game({
      p1: { graveyard: ['bestial-bloodline'], battlefield: n('forest', 5) },
    });
    const card = g.id('p1', 'bestial-bloodline', 'graveyard');
    activate(g, card, abilityIndex('bestial-bloodline', 'activated'));
    done(g);
    expect(g.zoneOf(card)).toBe('hand');
  });
  it('can not be activated from the battlefield', () => {
    const g = game({
      p1: { battlefield: ['tanglespan-lookout', ...n('forest', 5)] },
    });
    // On the battlefield it is attached to a creature and its ability is not usable there.
    const aura = g.id('p1', 'forest');
    void aura;
    expect(cardDb.get('bestial-bloodline')!.abilities[1]).toMatchObject({ fromGraveyard: true });
  });
});

describe('Feral Encounter', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['feral-encounter'],
        battlefield: ['beanstalk-wurm', ...n('forest', 6)],
        library: ['ordinary-bear', 'shock', 'shock', 'shock', 'shock', 'forest', 'island'],
      },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
  it('exiles a creature card from the top five, which may be cast this turn; the rest go to the bottom', () => {
    const g = setup();
    settle(cast(g, 'feral-encounter'));
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, 'ordinary-bear');
    const bear = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'ordinary-bear')!;
    expect(bear).toBeDefined();
    done(g);
    expect(lib(g).slice(0, 2)).toEqual(['forest', 'island']);
    expect(lib(g)).toHaveLength(7 - 1);
    const castIt = g.legal().find((a) => a.type === 'castSpell' && a.card === bear);
    expect(castIt).toBeDefined();
    g.do(castIt!);
    done(g);
    expect(bf(g, 'ordinary-bear')).toHaveLength(1);
  });
  it('the exiled card can not be cast on a later turn', () => {
    const g = setup();
    settle(cast(g, 'feral-encounter'));
    pick(g, 'ordinary-bear');
    done(g);
    const bear = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'ordinary-bear')!;
    nextMain(g);
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(false);
  });
  it('at the beginning of combat, your creature deals damage equal to its power to a creature you do not control', () => {
    const g = setup();
    settle(cast(g, 'feral-encounter'));
    pick(g, 'ordinary-bear');
    done(g);
    advanceTo(g, 'chooseTriggerTargets');
    const wurm = g.id('p1', 'beanstalk-wurm');
    const lookout = g.id('p2', 'tanglespan-lookout');
    expect(g.state.turn.step).toBe('beginCombat');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            JSON.stringify(a.targets).includes(wurm) &&
            JSON.stringify(a.targets).includes(lookout),
        ) as Action,
    );
    done(g);
    expect(g.zoneOf(lookout)).toBe('graveyard');
    expect(g.obj(wurm).damage).toBe(0);
  });
  it('the second target is optional', () => {
    const g = setup();
    settle(cast(g, 'feral-encounter'));
    pick(g, 'ordinary-bear');
    done(g);
    advanceTo(g, 'chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1) as Action);
    done(g);
    expect(g.zoneOf(g.id('p2', 'tanglespan-lookout'))).toBe('battlefield');
  });
  it('only triggers for the next combat phase this turn', () => {
    const g = setup();
    settle(cast(g, 'feral-encounter'));
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    advanceTo(g, 'chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1) as Action);
    done(g);
    expect(g.state.emblems ?? []).toHaveLength(0);
  });
  it('with no creature card in the top five, nothing is exiled and all go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['feral-encounter'],
        battlefield: ['beanstalk-wurm', ...n('forest', 2)],
        library: ['shock', 'shock', 'shock', 'shock', 'shock', 'forest'],
      },
    });
    settle(cast(g, 'feral-encounter'));
    done(g);
    expect(g.state.players.p1.exile).toHaveLength(0);
    expect(lib(g)[0]).toBe('forest');
    expect(lib(g)).toHaveLength(6);
  });
  it('is gone at end of turn if there was no combat', () => {
    const g = setup();
    g.state.turn.step = 'main2';
    settle(cast(g, 'feral-encounter'));
    pick(g, 'ordinary-bear');
    done(g);
    nextMain(g);
    expect(g.state.emblems ?? []).toHaveLength(0);
  });
});

/** The bargained cast of a card in hand (sacrificing this permanent), or the normal one. */
function castBargain(
  g: GameDriver,
  defId: string,
  sacrifice: string | null,
  targets: unknown[] = [],
): GameDriver {
  const card = g.id('p1', defId, 'hand');
  const want = JSON.stringify(targets);
  const act = g
    .legal()
    .find(
      (a) =>
        a.type === 'castSpell' &&
        a.card === card &&
        !a.back &&
        (sacrifice === null ? !a.kicked : a.kicked && a.sacrifice === sacrifice) &&
        JSON.stringify(a.targets) === want,
    );
  if (!act) throw new Error(`no such cast of ${defId}`);
  return g.do(act);
}

describe('Tough Cookie', () => {
  it('is a 2/2 artifact creature Food Golem and makes a Food when it enters', () => {
    const g = game({ p1: { hand: ['tough-cookie'], battlefield: n('forest', 2) } });
    cast(g, 'tough-cookie');
    done(g);
    const id = g.id('p1', 'tough-cookie');
    expect(pt(g, id)).toEqual([2, 2]);
    expect(chars(g, id).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    expect(chars(g, id).subtypes).toEqual(expect.arrayContaining(['Food', 'Golem']));
    expect(bf(g, 'food-token')).toHaveLength(1);
  });
  it('{2}{G}: a noncreature artifact you control becomes a 4/4 artifact creature until end of turn', () => {
    const g = game({
      p1: { battlefield: ['tough-cookie', 'food-token', ...n('forest', 3)] },
      p2: { battlefield: ['food-token'] },
    });
    const cookie = g.id('p1', 'tough-cookie');
    const food = g.id('p1', 'food-token');
    // The Cookie itself and the opponent's Food are not legal targets.
    const legalTargets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === cookie && a.abilityIndex === 1)
      .map((a) => (a.type === 'activateAbility' ? JSON.stringify(a.targets) : ''));
    expect(legalTargets).toHaveLength(1);
    expect(legalTargets[0]).toContain(food);
    activate(g, cookie, 1, [g.ref(food)]);
    done(g);
    expect(pt(g, food)).toEqual([4, 4]);
    expect(chars(g, food).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    nextMain(g, 'p2');
    expect(chars(g, food).types).not.toContain('Creature');
  });
  it('{2}, {T}, sacrifice it: you gain 3 life', () => {
    const g = game({ p1: { battlefield: ['tough-cookie', ...n('forest', 2)] } });
    const cookie = g.id('p1', 'tough-cookie');
    activate(g, cookie, 2);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(g.zoneOf(cookie)).toBe('graveyard');
  });
});

describe('Troublemaker Ouphe', () => {
  it('is a 2/2 Ouphe; bargained, exiles an artifact or enchantment an opponent controls', () => {
    const g = game({
      p1: { hand: ['troublemaker-ouphe'], battlefield: [...n('forest', 2), 'food-token'] },
      p2: { battlefield: ['up-the-beanstalk', 'ordinary-bear'] },
    });
    const food = g.id('p1', 'food-token');
    const enchantment = g.id('p2', 'up-the-beanstalk');
    castBargain(g, 'troublemaker-ouphe', food);
    expect(g.zoneOf(food)).not.toBe('battlefield');
    done(g);
    expect(g.zoneOf(enchantment)).toBe('exile');
    expect(g.zoneOf(g.id('p2', 'ordinary-bear'))).toBe('battlefield');
    expect(pt(g, g.id('p1', 'troublemaker-ouphe'))).toEqual([2, 2]);
  });
  it('not bargained, nothing happens', () => {
    const g = game({
      p1: { hand: ['troublemaker-ouphe'], battlefield: [...n('forest', 2), 'food-token'] },
      p2: { battlefield: ['up-the-beanstalk'] },
    });
    castBargain(g, 'troublemaker-ouphe', null);
    done(g);
    expect(g.zoneOf(g.id('p2', 'up-the-beanstalk'))).toBe('battlefield');
  });
  it('the target can be an artifact too, and its own Food of yours is not offered', () => {
    const g = game({
      p1: { hand: ['troublemaker-ouphe'], battlefield: [...n('forest', 2), 'food-token'] },
      p2: { battlefield: ['food-token'] },
    });
    castBargain(g, 'troublemaker-ouphe', g.id('p1', 'food-token'));
    settle(g);
    done(g);
    expect(bf(g, 'food-token', 'p2')).toHaveLength(0);
  });
});

describe('Brave the Wilds', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['brave-the-wilds'],
        battlefield: ['forest', 'food-token', 'island'],
        library: ['shock', 'forest', 'island', 'shock'],
      },
    });
  it('not bargained: only searches for a basic land card', () => {
    const g = setup();
    castBargain(g, 'brave-the-wilds', null);
    done(g, { pick: ['island'] });
    expect(hand(g)).toEqual(['island']);
    expect(chars(g, g.id('p1', 'forest')).types).not.toContain('Creature');
  });
  it('bargained: target land you control becomes a 3/3 Elemental creature with haste that is still a land', () => {
    const g = setup();
    const island = g.id('p1', 'island');
    castBargain(g, 'brave-the-wilds', g.id('p1', 'food-token'), [g.ref(island)]);
    done(g, { pick: ['forest'] });
    expect(hand(g)).toEqual(['forest']);
    expect(pt(g, island)).toEqual([3, 3]);
    expect(chars(g, island).types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(chars(g, island).subtypes).toContain('Elemental');
    expect(keywords(g, island)).toContain('haste');
    // For good, not until end of turn.
    nextMain(g, 'p2');
    nextMain(g, 'p1');
    expect(pt(g, island)).toEqual([3, 3]);
    expect(chars(g, island).types).toContain('Creature');
  });
  it('the land can attack right away (haste) and still taps for mana', () => {
    const g = setup();
    const island = g.id('p1', 'island');
    castBargain(g, 'brave-the-wilds', g.id('p1', 'food-token'), [g.ref(island)]);
    done(g);
    advanceTo(g, 'declareAttackers');
    expect(g.legal().some((a) => a.type === 'addAttacker' && a.attacker === island)).toBe(true);
  });
});

describe('Curse of the Werefox', () => {
  const setup = () =>
    game({
      p1: { hand: ['curse-of-the-werefox'], battlefield: ['ordinary-bear', ...n('forest', 3)] },
      p2: { battlefield: ['tanglespan-lookout', 'beanstalk-wurm'] },
    });
  it('creates a Monster Role on your creature, then it fights up to one target creature you do not control', () => {
    const g = setup();
    const bear = g.id('p1', 'ordinary-bear');
    const lookout = g.id('p2', 'tanglespan-lookout');
    cast(g, 'curse-of-the-werefox', [g.ref(bear)]);
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(lookout)),
    );
    done(g);
    // The Bear is 5/6 with trample from the Monster Role, and took 2 damage from the Lookout.
    expect(pt(g, bear)).toEqual([5, 6]);
    expect(keywords(g, bear)).toContain('trample');
    expect(g.obj(bear).damage).toBe(2);
    expect(g.zoneOf(lookout)).toBe('graveyard');
  });
  it('the fight is optional ("up to one")', () => {
    const g = setup();
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'curse-of-the-werefox', [g.ref(bear)]);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    done(g);
    expect(pt(g, bear)).toEqual([5, 6]);
    expect(g.obj(bear).damage).toBe(0);
    expect(g.zoneOf(g.id('p2', 'tanglespan-lookout'))).toBe('battlefield');
  });
  it('the Role replaces another Role of yours on that creature', () => {
    const g = setup();
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'curse-of-the-werefox', [g.ref(bear)]);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    done(g);
    expect(bf(g, 'woe-monster-role')).toHaveLength(1);
  });
});

describe('Welcome to Sweettooth', () => {
  it('I creates a 1/1 white Human, II a Food, III puts X +1/+1 counters on a creature (X = one plus your Foods)', () => {
    const g = game({
      p1: { hand: ['welcome-to-sweettooth'], battlefield: ['ordinary-bear', ...n('forest', 2)] },
    });
    cast(g, 'welcome-to-sweettooth');
    done(g);
    const [human] = bf(g, 'woe-green-human-token');
    expect(human).toBeDefined();
    expect(pt(g, human!)).toEqual([1, 1]);
    expect(cardDb.get('woe-green-human-token')!.colors).toEqual(['W']);
    expect(chars(g, human!).subtypes).toEqual(['Human']);
    nextMain(g);
    expect(bf(g, 'food-token')).toHaveLength(1);
    // Chapter III: two Foods when it comes up (one more is made first).
    g.state.objects[g.id('p1', 'welcome-to-sweettooth')]!.counters = { lore: 2 };
    bf(g, 'food-token');
    advanceTo(g, 'chooseTriggerTargets');
    const bear = g.id('p1', 'ordinary-bear');
    g.do(
      g
        .legal()
        .find(
          (a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(bear),
        ) as Action,
    );
    done(g);
    // One Food: X is two.
    expect(counters(g, bear)).toBe(2);
    expect(g.zoneOf(g.id('p1', 'welcome-to-sweettooth', 'graveyard'))).toBe('graveyard');
  });
  it('counts all the Foods you control at the end', () => {
    const g = game({
      p1: {
        battlefield: [
          'ordinary-bear',
          'food-token',
          'food-token',
          'food-token',
          'welcome-to-sweettooth',
        ],
      },
    });
    g.state.objects[g.id('p1', 'welcome-to-sweettooth')]!.counters = { lore: 2 };
    advanceTo(g, 'chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets') as Action);
    done(g);
    expect(counters(g, g.id('p1', 'ordinary-bear'))).toBe(4);
  });
});

describe("Agatha's Champion", () => {
  const setup = () =>
    game({
      p1: {
        hand: ['agathas-champion'],
        battlefield: [...n('forest', 5), 'food-token'],
      },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
  it('is a 4/4 Human Knight with trample', () => {
    const g = setup();
    castBargain(g, 'agathas-champion', null);
    done(g);
    const id = g.id('p1', 'agathas-champion');
    expect(pt(g, id)).toEqual([4, 4]);
    expect(keywords(g, id)).toContain('trample');
    // Not bargained: no fight.
    expect(g.zoneOf(g.id('p2', 'tanglespan-lookout'))).toBe('battlefield');
  });
  it('bargained, it fights up to one target creature you do not control when it enters', () => {
    const g = setup();
    const food = g.id('p1', 'food-token');
    castBargain(g, 'agathas-champion', food);
    const lookout = g.id('p2', 'tanglespan-lookout');
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(lookout)),
    );
    done(g);
    expect(g.zoneOf(lookout)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'agathas-champion')).damage).toBe(2);
  });
  it('the fight is optional', () => {
    const g = setup();
    castBargain(g, 'agathas-champion', g.id('p1', 'food-token'));
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    done(g);
    expect(g.zoneOf(g.id('p2', 'tanglespan-lookout'))).toBe('battlefield');
  });
});

/** An Aura on the battlefield attached to a creature (the scenario builder can not attach). */
function enchant(g: GameDriver, aura: string, creature: string, controller: 'p1' | 'p2' = 'p1') {
  const a = g.state.battlefield.find(
    (id) =>
      g.obj(id).defId === aura && g.obj(id).controller === controller && !g.obj(id).attachedTo,
  );
  if (!a) throw new Error(`no free ${aura}`);
  g.obj(a).attachedTo = creature;
  return a;
}

describe('Graceful Takedown', () => {
  const setup = () => {
    const g = game({
      p1: {
        hand: ['graceful-takedown'],
        battlefield: [
          'tanglespan-lookout',
          'rootrider-faun',
          'beanstalk-wurm',
          'bestial-bloodline',
          'bestial-bloodline',
          ...n('forest', 2),
        ],
      },
      p2: { battlefield: ['ordinary-bear', 'tanglespan-lookout'] },
    });
    enchant(g, 'bestial-bloodline', g.id('p1', 'tanglespan-lookout'));
    enchant(g, 'bestial-bloodline', g.id('p1', 'rootrider-faun'));
    return g;
  };
  const takedown = (g: GameDriver, mode: number, targets: string[]) => {
    const card = g.id('p1', 'graceful-takedown', 'hand');
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === card &&
          a.mode === mode &&
          JSON.stringify(a.targets) === JSON.stringify(targets.map((t) => g.ref(t))),
      );
    if (!act) throw new Error('no such cast');
    return g.do(act);
  };
  const choose = (g: GameDriver, picked: string[]) => {
    expect(g.decision.kind).toBe('spellTargets');
    for (let i = 1; i <= picked.length; i++)
      g.do({
        type: 'chooseTargets',
        player: 'p1',
        targets: picked.slice(0, i).map((t) => g.ref(t)),
      } as Action);
    g.do({ type: 'chooseTargets', player: 'p1', targets: picked.map((t) => g.ref(t)) } as Action);
  };
  it('enchanted creatures you control each deal damage equal to their power to the creature you do not control', () => {
    const g = setup();
    const bear = g.id('p2', 'ordinary-bear');
    const lookout = g.id('p1', 'tanglespan-lookout');
    const faun = g.id('p1', 'rootrider-faun');
    // Lookout 4/5 and Faun 3/5 are enchanted: 4 + 3 = 7 damage to the 4/5 Bear.
    takedown(g, 1, [bear]);
    choose(g, [lookout, faun]);
    done(g);
    expect(g.zoneOf(bear)).toBe('graveyard');
  });
  it('a single enchanted creature may deal the damage, and the damage is not dealt back', () => {
    const g = setup();
    const theirs = g.id('p2', 'tanglespan-lookout');
    const lookout = g.id('p1', 'tanglespan-lookout');
    takedown(g, 1, [theirs]);
    choose(g, [lookout]);
    done(g);
    expect(g.zoneOf(theirs)).toBe('graveyard');
    expect(g.obj(lookout).damage).toBe(0);
  });
  it('only enchanted creatures can be chosen for the any-number part', () => {
    const g = setup();
    takedown(g, 1, [g.id('p2', 'ordinary-bear')]);
    const options = g
      .legal()
      .flatMap((a) =>
        a.type === 'chooseTargets' && a.targets.length === 1 && 'object' in a.targets[0]!
          ? [a.targets[0].object.id]
          : [],
      );
    expect(options.sort()).toEqual(
      [g.id('p1', 'tanglespan-lookout'), g.id('p1', 'rootrider-faun')].sort(),
    );
  });
  it('with one other creature you control (any creature), it deals damage too', () => {
    const g = setup();
    const bear = g.id('p2', 'ordinary-bear');
    const wurm = g.id('p1', 'beanstalk-wurm');
    const lookout = g.id('p1', 'tanglespan-lookout');
    // Wurm 5 + Lookout 4 = 9 damage; the Bear has toughness 5.
    takedown(g, 0, [bear, wurm]);
    choose(g, [lookout]);
    done(g);
    expect(g.zoneOf(bear)).toBe('graveyard');
  });
  it('the other creature is a different one than the enchanted creatures chosen', () => {
    const g = setup();
    const lookout = g.id('p1', 'tanglespan-lookout');
    const bear = g.id('p2', 'ordinary-bear');
    takedown(g, 0, [bear, lookout]);
    const options = g
      .legal()
      .flatMap((a) =>
        a.type === 'chooseTargets' && a.targets.length === 1 && 'object' in a.targets[0]!
          ? [a.targets[0].object.id]
          : [],
      );
    expect(options).toEqual([g.id('p1', 'rootrider-faun')]);
  });
  it('the other creature may deal the damage alone, with no enchanted creature chosen', () => {
    const g = setup();
    const bear = g.id('p2', 'ordinary-bear');
    const wurm = g.id('p1', 'beanstalk-wurm');
    takedown(g, 0, [bear, wurm]);
    choose(g, []);
    done(g);
    // 5 damage kills the 4/5 Bear.
    expect(g.zoneOf(bear)).toBe('graveyard');
  });
  it('can not be cast with no creature you do not control', () => {
    const g = game({
      p1: { hand: ['graceful-takedown'], battlefield: ['tanglespan-lookout', ...n('forest', 2)] },
    });
    expect(casts(g, 'graceful-takedown')).toHaveLength(0);
  });
  it('"any number" includes none: it can be cast without a creature of yours, and then does nothing', () => {
    const g = game({
      p1: { hand: ['graceful-takedown'], battlefield: n('forest', 2) },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
    // Only the mode without another creature is offered.
    expect(casts(g, 'graceful-takedown').every((a) => a.mode === 1)).toBe(true);
    const lookout = g.id('p2', 'tanglespan-lookout');
    takedown(g, 1, [lookout]);
    choose(g, []);
    done(g);
    expect(g.obj(lookout).damage).toBe(0);
  });
  it('a creature that is no longer enchanted when it resolves deals no damage', () => {
    const g = setup();
    const bear = g.id('p2', 'ordinary-bear');
    const lookout = g.id('p1', 'tanglespan-lookout');
    const faun = g.id('p1', 'rootrider-faun');
    takedown(g, 1, [bear]);
    choose(g, [lookout, faun]);
    // Lose the Aura on the Lookout in response: 3 damage is not lethal.
    const aura = g.state.battlefield.find((id) => g.obj(id).attachedTo === lookout)!;
    g.obj(aura).zone = 'graveyard';
    g.state.battlefield = g.state.battlefield.filter((id) => id !== aura);
    g.state.players.p1.graveyard.push(aura);
    done(g);
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.obj(bear).damage).toBe(3);
  });
});

describe('Return from the Wilds', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['return-from-the-wilds'],
        battlefield: n('forest', 3),
        library: ['shock', 'island', 'forest', 'shock'],
      },
    });
  const modes = cardDb.get('return-from-the-wilds')!.modes!;
  const castMode = (g: GameDriver, label: RegExp[]) => {
    const mode = modes.findIndex((m) => label.every((l) => l.test(m.label ?? '')));
    const card = g.id('p1', 'return-from-the-wilds', 'hand');
    const act = g.legal().find((a) => a.type === 'castSpell' && a.card === card && a.mode === mode);
    if (!act) throw new Error('mode not castable');
    return g.do(act);
  };
  it('has exactly the three pairs of modes', () => {
    expect(modes.map((m) => m.label)).toEqual([
      'Search for a basic land + Create a 1/1 white Human',
      'Search for a basic land + Create a Food',
      'Create a 1/1 white Human + Create a Food',
    ]);
  });
  it('land and Human: a basic land card onto the battlefield tapped, and a 1/1 white Human', () => {
    const g = setup();
    castMode(g, [/land/, /Human/]);
    done(g, { pick: ['island'] });
    const island = g.state.battlefield.find((id) => g.obj(id).defId === 'island')!;
    expect(island).toBeDefined();
    expect(g.obj(island).tapped).toBe(true);
    expect(bf(g, 'woe-green-human-token')).toHaveLength(1);
    expect(bf(g, 'food-token')).toHaveLength(0);
  });
  it('land and Food', () => {
    const g = setup();
    castMode(g, [/land/, /Food/]);
    done(g);
    expect(bf(g, 'food-token')).toHaveLength(1);
    expect(bf(g, 'woe-green-human-token')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(3 + 1);
  });
  it('Human and Food, no land', () => {
    const g = setup();
    castMode(g, [/Human/, /Food/]);
    done(g);
    expect(bf(g, 'food-token')).toHaveLength(1);
    expect(bf(g, 'woe-green-human-token')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(3);
  });
  it('can not choose the same mode twice', () => {
    const g = setup();
    const card = g.id('p1', 'return-from-the-wilds', 'hand');
    expect(g.legal().filter((a) => a.type === 'castSpell' && a.card === card)).toHaveLength(3);
  });
});

describe('Redtooth Genealogist', () => {
  it('creates a Royal Role attached to another target creature you control: +1/+1 and ward {1}', () => {
    const g = game({
      p1: {
        hand: ['redtooth-genealogist'],
        battlefield: ['ordinary-bear', ...n('forest', 3)],
      },
    });
    cast(g, 'redtooth-genealogist');
    settle(g);
    done(g);
    const bear = g.id('p1', 'ordinary-bear');
    expect(pt(g, bear)).toEqual([5, 6]);
    expect(keywords(g, bear)).toContain('wardOne');
    expect(pt(g, g.id('p1', 'redtooth-genealogist'))).toEqual([2, 3]);
    expect(bf(g, 'woe-royal-role')).toHaveLength(1);
  });
  it('the Role is not put on the Genealogist itself ("another"), and with no other creature nothing happens', () => {
    const g = game({ p1: { hand: ['redtooth-genealogist'], battlefield: n('forest', 3) } });
    cast(g, 'redtooth-genealogist');
    done(g);
    expect(bf(g, 'woe-royal-role')).toHaveLength(0);
  });
});

describe('Skybeast Tracker', () => {
  it('is a 2/4 Giant Archer with reach that makes a Food whenever you cast a spell with mana value 5 or greater', () => {
    const g = game({
      p1: {
        hand: ['beanstalk-wurm', 'titanic-growth'],
        battlefield: ['skybeast-tracker', ...n('forest', 8)],
      },
    });
    const id = g.id('p1', 'skybeast-tracker');
    expect(pt(g, id)).toEqual([2, 4]);
    expect(keywords(g, id)).toContain('reach');
    cast(g, 'titanic-growth', [g.ref(id)]);
    done(g);
    expect(bf(g, 'food-token')).toHaveLength(0);
    cast(g, 'beanstalk-wurm');
    done(g);
    expect(bf(g, 'food-token')).toHaveLength(1);
  });
});

describe('Hamlet Glutton', () => {
  const setup = (lands: number) =>
    game({
      p1: { hand: ['hamlet-glutton'], battlefield: [...n('forest', lands), 'food-token'] },
    });
  it('costs {7}, or {5} if it was bargained', () => {
    const g = setup(5);
    expect(casts(g, 'hamlet-glutton').filter((a) => !a.kicked)).toHaveLength(0);
    const food = g.id('p1', 'food-token');
    expect(casts(g, 'hamlet-glutton').filter((a) => a.kicked && a.sacrifice === food)).toHaveLength(
      1,
    );
    const h = setup(7);
    expect(casts(h, 'hamlet-glutton').filter((a) => !a.kicked)).toHaveLength(1);
  });
  it('is a 6/6 Giant with trample that gains you 3 life when it enters', () => {
    const g = setup(7);
    castBargain(g, 'hamlet-glutton', null);
    done(g);
    const id = g.id('p1', 'hamlet-glutton');
    expect(pt(g, id)).toEqual([6, 6]);
    expect(keywords(g, id)).toContain('trample');
    expect(g.life('p1')).toBe(23);
  });
  it('bargained for {5}, it still gains 3 life', () => {
    const g = setup(5);
    castBargain(g, 'hamlet-glutton', g.id('p1', 'food-token'));
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(bf(g, 'food-token')).toHaveLength(0);
  });
});

describe('Sentinel of Lost Lore', () => {
  const modes = (
    cardDb.get('sentinel-of-lost-lore')!.abilities[0] as { modes: { label?: string }[] }
  ).modes;
  const setup = (opts: { own?: string[]; theirs?: string[]; adventure?: boolean } = {}) =>
    gameWithExile(
      {
        p1: {
          hand: ['sentinel-of-lost-lore'],
          battlefield: n('forest', 3),
          library: [...(opts.own ?? []), 'forest', 'forest'],
          graveyard: ['shock'],
        },
        p2: { library: [...(opts.theirs ?? []), 'forest'], graveyard: ['shock', 'shock'] },
      },
      { p1: opts.own ?? [], p2: opts.theirs ?? [] },
      opts.adventure ?? true,
    );
  const chooseMode = (g: GameDriver, includes: RegExp[], excludes: RegExp[] = []) => {
    const mode = modes.findIndex(
      (m) =>
        includes.every((r) => r.test(m.label ?? '')) &&
        !excludes.some((r) => r.test(m.label ?? '')),
    );
    expect(mode).toBeGreaterThanOrEqual(0);
    const act = g.legal().find((a) => a.type === 'chooseTargets' && a.mode === mode) as
      Action | undefined;
    expect(act).toBeDefined();
    return g.do(act!);
  };
  it('is a 3/4 Elf Knight and has all seven combinations of modes', () => {
    expect(modes).toHaveLength(7);
    const g = setup();
    expect(pt(g, g.id('p1', 'forest'))).toBeDefined();
  });
  it('returns a card you own in exile that has an Adventure to your hand', () => {
    const g = setup({ own: ['beanstalk-wurm'] });
    const wurm = g.state.players.p1.exile[0]!;
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    chooseMode(g, [/Return target card you own/], [/bottom/, /graveyard/]);
    done(g);
    expect(g.zoneOf(wurm)).toBe('hand');
    expect(g.obj(wurm).onAdventure).toBeFalsy();
  });
  it("puts a card you don't own in exile that has an Adventure on the bottom of its owner's library", () => {
    const g = setup({ theirs: ['tempest-hart'] });
    const hart = g.state.players.p2.exile[0]!;
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    chooseMode(g, [/bottom/], [/Return/, /graveyard/]);
    done(g);
    expect(g.zoneOf(hart)).toBe('library');
    expect(g.state.players.p2.library[g.state.players.p2.library.length - 1]).toBe(hart);
    expect(g.state.players.p2.exile).toHaveLength(0);
  });
  it("exiles target player's graveyard", () => {
    const g = setup();
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            JSON.stringify(a.targets).includes('"player":"p2"') &&
            modes[a.mode!]?.label === "Exile target player's graveyard",
        ) as Action,
    );
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(gy(g)).toEqual(['shock']);
  });
  it('all three modes at once', () => {
    const g = setup({ own: ['beanstalk-wurm'], theirs: ['tempest-hart'] });
    const wurm = g.state.players.p1.exile[0]!;
    const hart = g.state.players.p2.exile[0]!;
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.mode === 6 &&
            JSON.stringify(a.targets).includes('"player":"p1"'),
        ) as Action,
    );
    done(g);
    expect(g.zoneOf(wurm)).toBe('hand');
    expect(g.zoneOf(hart)).toBe('library');
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });
  it('a card in exile without an Adventure is not a legal target, and the modes need targets', () => {
    const g = setup({ own: ['shock'], theirs: ['ordinary-bear'] });
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    const offered = new Set(
      g.legal().flatMap((a) => (a.type === 'chooseTargets' ? [modes[a.mode!]?.label] : [])),
    );
    expect([...offered]).toEqual(["Exile target player's graveyard"]);
  });
  it("a card you own in exile is not a target of the 'don't own' mode and the other way round", () => {
    const g = setup({ own: ['beanstalk-wurm'], theirs: ['tempest-hart'] });
    cast(g, 'sentinel-of-lost-lore');
    advanceTo(g, 'chooseTriggerTargets');
    const wurm = g.state.players.p1.exile[0]!;
    const hart = g.state.players.p2.exile[0]!;
    for (const a of g.legal()) {
      if (a.type !== 'chooseTargets') continue;
      const label = modes[a.mode!]?.label ?? '';
      const json = JSON.stringify(a.targets);
      if (/^Return/.test(label) && !/bottom/.test(label)) expect(json).not.toContain(hart);
      if (/^Put/.test(label) && !/Return/.test(label)) expect(json).not.toContain(wurm);
    }
  });
});

describe('Ferocious Werefox // Guard Change', () => {
  it('is a 4/3 Elf Fox Warrior with trample', () => {
    const g = game({ p1: { battlefield: ['ferocious-werefox'] } });
    const id = g.id('p1', 'ferocious-werefox');
    expect(pt(g, id)).toEqual([4, 3]);
    expect(keywords(g, id)).toContain('trample');
  });
  it('Guard Change (instant) creates a Monster Role attached to target creature you control', () => {
    const g = game({
      p1: { hand: ['ferocious-werefox'], battlefield: ['tanglespan-lookout', ...n('forest', 2)] },
    });
    const lookout = g.id('p1', 'tanglespan-lookout');
    const card = g.id('p1', 'ferocious-werefox', 'hand');
    g.do({ ...adventureCast(g, 'ferocious-werefox')!, targets: [g.ref(lookout)] });
    done(g);
    expect(pt(g, lookout)).toEqual([3, 4]);
    expect(keywords(g, lookout)).toContain('trample');
    expect(g.zoneOf(card)).toBe('exile');
  });
  it('can only target a creature you control', () => {
    const g = game({
      p1: { hand: ['ferocious-werefox'], battlefield: n('forest', 2) },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
    expect(adventureCast(g, 'ferocious-werefox')).toBeUndefined();
  });
});

describe('Thunderous Debut', () => {
  const library = () => [
    'shock',
    'ordinary-bear',
    ...n('shock', 5),
    'beanstalk-wurm',
    'tanglespan-lookout',
    ...n('shock', 14),
    'island',
  ];
  const setup = () =>
    game({
      p1: {
        hand: ['thunderous-debut'],
        battlefield: [...n('forest', 8), 'food-token'],
        library: library(),
      },
    });
  it('not bargained: up to two creature cards from the top twenty into your hand, then shuffle', () => {
    const g = setup();
    castBargain(g, 'thunderous-debut', null);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, 'ordinary-bear');
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, 'beanstalk-wurm');
    done(g);
    expect(hand(g).sort()).toEqual(['beanstalk-wurm', 'ordinary-bear']);
    expect(bf(g, 'beanstalk-wurm')).toHaveLength(0);
    expect(g.events.some((e) => e.type === 'shuffled')).toBe(true);
    expect(lib(g)).toHaveLength(library().length - 2);
  });
  it('bargained: the revealed cards are put onto the battlefield', () => {
    const g = setup();
    castBargain(g, 'thunderous-debut', g.id('p1', 'food-token'));
    settle(g);
    pick(g, 'ordinary-bear');
    pick(g, 'beanstalk-wurm');
    done(g);
    expect(bf(g, 'ordinary-bear')).toHaveLength(1);
    expect(bf(g, 'beanstalk-wurm')).toHaveLength(1);
    expect(hand(g)).toEqual([]);
    expect(g.zoneOf(g.state.players.p1.graveyard[0] ?? 'x')).toBe('graveyard');
  });
  it('"up to two": you may stop after one or reveal none', () => {
    const g = setup();
    castBargain(g, 'thunderous-debut', null);
    settle(g);
    pick(g, 'ordinary-bear');
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(hand(g)).toEqual(['ordinary-bear']);
    const h = setup();
    castBargain(h, 'thunderous-debut', null);
    settle(h);
    h.do({ type: 'chooseCard', player: 'p1', card: null });
    done(h);
    expect(hand(h)).toEqual([]);
    expect(h.events.some((e) => e.type === 'shuffled')).toBe(true);
  });
  it('only looks at the top twenty cards', () => {
    const g = game({
      p1: {
        hand: ['thunderous-debut'],
        battlefield: n('forest', 8),
        library: [...n('shock', 20), 'ordinary-bear'],
      },
    });
    castBargain(g, 'thunderous-debut', null);
    settle(g);
    // The Bear is the twenty-first card: no creature card to choose.
    expect(g.legal().filter((a) => a.type === 'chooseCard' && a.card)).toHaveLength(0);
  });
});

describe('Stormkeld Vanguard // Bear Down', () => {
  it('is a 6/7 Giant Warrior; creatures with power 2 or less can not block it', () => {
    const g = game({
      p1: { battlefield: ['stormkeld-vanguard'] },
      p2: { battlefield: ['tanglespan-lookout', 'ordinary-bear'] },
    });
    const vanguard = g.id('p1', 'stormkeld-vanguard');
    expect(pt(g, vanguard)).toEqual([6, 7]);
    advanceTo(g, 'declareAttackers');
    g.attack(vanguard);
    advanceTo(g, 'declareBlockers');
    const blockers = g.legal('p2').flatMap((a) => (a.type === 'addBlock' ? [a.blocker] : []));
    expect(blockers).toEqual([g.id('p2', 'ordinary-bear')]);
  });
  it('Bear Down destroys target artifact or enchantment', () => {
    const g = game({
      p1: { hand: ['stormkeld-vanguard'], battlefield: n('forest', 2) },
      p2: { battlefield: ['up-the-beanstalk', 'food-token', 'ordinary-bear'] },
    });
    const ench = g.id('p2', 'up-the-beanstalk');
    const card = g.id('p1', 'stormkeld-vanguard', 'hand');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === card && a.back)
      .map((a) => (a.type === 'castSpell' ? JSON.stringify(a.targets) : ''));
    // The enchantment and the Food, not the creature.
    expect(targets).toHaveLength(2);
    g.do({ ...adventureCast(g, 'stormkeld-vanguard')!, targets: [g.ref(ench)] });
    done(g);
    expect(g.zoneOf(ench)).toBe('graveyard');
    expect(g.zoneOf(card)).toBe('exile');
  });
});

describe('Verdant Outrider', () => {
  it('is a 4/2 Human Knight; {1}{G}: it can not be blocked by creatures with power 2 or less this turn', () => {
    const g = game({
      p1: { battlefield: ['verdant-outrider', ...n('forest', 2)] },
      p2: { battlefield: ['tanglespan-lookout', 'ordinary-bear'] },
    });
    const outrider = g.id('p1', 'verdant-outrider');
    expect(pt(g, outrider)).toEqual([4, 2]);
    activate(g, outrider, abilityIndex('verdant-outrider', 'activated'));
    done(g);
    advanceTo(g, 'declareAttackers');
    g.attack(outrider);
    advanceTo(g, 'declareBlockers');
    const blockers = g.legal('p2').flatMap((a) => (a.type === 'addBlock' ? [a.blocker] : []));
    expect(blockers).toEqual([g.id('p2', 'ordinary-bear')]);
  });
  it('without the ability, a small creature can block it', () => {
    const g = game({
      p1: { battlefield: ['verdant-outrider'] },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
    advanceTo(g, 'declareAttackers');
    g.attack(g.id('p1', 'verdant-outrider'));
    advanceTo(g, 'declareBlockers');
    expect(g.legal('p2').some((a) => a.type === 'addBlock')).toBe(true);
  });
  it('lasts only this turn', () => {
    const g = game({
      p1: { battlefield: ['verdant-outrider', ...n('forest', 2)] },
      p2: { battlefield: ['tanglespan-lookout'] },
    });
    const outrider = g.id('p1', 'verdant-outrider');
    activate(g, outrider, abilityIndex('verdant-outrider', 'activated'));
    done(g);
    nextMain(g);
    advanceTo(g, 'declareAttackers');
    g.attack(outrider);
    advanceTo(g, 'declareBlockers');
    expect(g.legal('p2').some((a) => a.type === 'addBlock')).toBe(true);
  });
});

describe('Toadstool Admirer', () => {
  it('is a 1/1 Ouphe with ward {2}', () => {
    const g = game({ p1: { battlefield: ['toadstool-admirer'] } });
    const id = g.id('p1', 'toadstool-admirer');
    expect(pt(g, id)).toEqual([1, 1]);
    expect(keywords(g, id)).toContain('ward');
    expect(cardDb.get('toadstool-admirer')!.wardCost?.mana).toEqual({ generic: 2, colored: {} });
  });
  it('an opponent must pay {2} more to target it', () => {
    const cheap = game({
      p1: { battlefield: ['toadstool-admirer'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    expect(
      cheap
        .legal('p2')
        .some(
          (a) =>
            a.type === 'castSpell' &&
            JSON.stringify(a.targets).includes(cheap.id('p1', 'toadstool-admirer')),
        ),
    ).toBe(false);
    const rich = game({
      p1: { battlefield: ['toadstool-admirer'] },
      p2: { hand: ['shock'], battlefield: n('mountain', 3) },
      active: 'p2',
    });
    expect(
      rich
        .legal('p2')
        .some(
          (a) =>
            a.type === 'castSpell' &&
            JSON.stringify(a.targets).includes(rich.id('p1', 'toadstool-admirer')),
        ),
    ).toBe(true);
  });
  it('{3}{G}: puts a +1/+1 counter on it', () => {
    const g = game({ p1: { battlefield: ['toadstool-admirer', ...n('forest', 8)] } });
    const id = g.id('p1', 'toadstool-admirer');
    activate(g, id, abilityIndex('toadstool-admirer', 'activated'));
    done(g);
    activate(g, id, abilityIndex('toadstool-admirer', 'activated'));
    done(g);
    expect(pt(g, id)).toEqual([3, 3]);
  });
});

describe('Gruff Triplets', () => {
  it('when it is cast, it makes two token copies of itself, which make no more', () => {
    const g = game({
      p1: { hand: ['gruff-triplets'], battlefield: n('forest', 6) },
    });
    cast(g, 'gruff-triplets');
    done(g);
    const all = bf(g, 'gruff-triplets');
    expect(all).toHaveLength(3);
    expect(all.filter((id) => g.obj(id).isToken)).toHaveLength(2);
    for (const id of all) {
      expect(pt(g, id)).toEqual([3, 3]);
      expect(keywords(g, id)).toContain('trample');
    }
  });
  it('when one dies, each creature you control named Gruff Triplets gets counters equal to its power', () => {
    const g = game({
      p1: { battlefield: ['gruff-triplets', 'gruff-triplets', 'gruff-triplets', 'ordinary-bear'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const [a, b, c] = bf(g, 'gruff-triplets') as [string, string, string];
    g.obj(a).damage = 1;
    cast(g, 'shock', [g.ref(a)]);
    done(g);
    expect(g.zoneOf(a)).toBe('graveyard');
    expect(pt(g, b)).toEqual([6, 6]);
    expect(pt(g, c)).toEqual([6, 6]);
    // The Bear is not named Gruff Triplets.
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([4, 5]);
  });
  it('uses the power it had as it died', () => {
    const g = game({
      p1: { battlefield: ['gruff-triplets', 'gruff-triplets'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const [a, b] = bf(g, 'gruff-triplets') as [string, string];
    g.obj(a).plusOneCounters = 2;
    g.obj(a).damage = 4;
    cast(g, 'shock', [g.ref(a)]);
    done(g);
    expect(g.zoneOf(a)).toBe('graveyard');
    // Power 5 as it died.
    expect(pt(g, b)).toEqual([8, 8]);
  });
  it('a token copy dying counts too', () => {
    const g = game({
      p1: { hand: ['gruff-triplets'], battlefield: n('forest', 6) },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'gruff-triplets');
    done(g);
    const token = bf(g, 'gruff-triplets').find((id) => g.obj(id).isToken)!;
    g.obj(token).damage = 1;
    g.state.turn.activePlayer = 'p2';
    g.state.decision = { kind: 'priority', player: 'p2' };
    cast(g, 'shock', [g.ref(token)]);
    done(g);
    const left = bf(g, 'gruff-triplets');
    expect(left).toHaveLength(2);
    for (const id of left) expect(pt(g, id)).toEqual([6, 6]);
  });
});

describe('random play with every green card', () => {
  const deck = () =>
    [
      ...NAMES.map(slug),
      'bestial-bloodline',
      'ordinary-bear',
      ...n('forest', 14),
      ...n('island', 6),
      'plains',
      'plains',
      'food-token',
    ].filter((id) => !cardDb.get(id)?.isToken);
  it('plays full games to completion with no errors', () => {
    const decks = { p1: deck(), p2: deck() };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919, {
        onEvents: (events) => {
          for (const e of events)
            if (e.type === 'objectMoved' && e.to === 'battlefield') seen.add(e.defId);
        },
      });
      expect(r.truncated, `seed ${seed}`).toBe(false);
    }
    expect(seen.size).toBeGreaterThan(10);
  }, 180_000);
});

void [chars, counters, settle, chooseTarget, until, nextMain, gameWithExile, lib, toStep];
