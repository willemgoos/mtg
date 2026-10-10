import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { activate, done, keywords, names, obj, on, toStep, types } from './hob-white-helpers.ts';

// The Hobbit 20b: the white instants, sorceries, enchantments, Sagas and Adventures.

const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

describe("Thorin's Last Stand", () => {
  it('mode 1: creatures you control get +2/+1', () => {
    const g = game({
      p1: { hand: ['thorins-last-stand'], battlefield: [...n('plains', 4), 'savannah-lions'] },
    });
    cast(g, 'thorins-last-stand', [], { mode: 0 });
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 2]);
  });
  it('mode 2: destroys an artifact or enchantment and gains 2 life', () => {
    const g = game({
      p1: { hand: ['thorins-last-stand'], battlefield: n('plains', 4) },
      p2: { battlefield: ['hob-axe-token'] },
    });
    cast(g, 'thorins-last-stand', [obj(g, g.id('p2', 'hob-axe-token'))], { mode: 1 });
    done(g);
    expect(on(g, 'hob-axe-token')).toHaveLength(0);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Moment of Glory', () => {
  it('puts one counter on the target from the hand', () => {
    const g = game({
      p1: {
        hand: ['moment-of-glory'],
        battlefield: ['plains', 'savannah-lions', 'savannah-lions'],
      },
    });
    const [a, b] = on(g, 'savannah-lions');
    cast(g, 'moment-of-glory', [obj(g, a!)]);
    done(g);
    expect(counters(g, a!)).toBe(1);
    expect(counters(g, b!)).toBe(0);
  });
  it('cast with flashback it also puts a counter on each other creature you control', () => {
    const g = game({
      p1: {
        graveyard: ['moment-of-glory'],
        battlefield: [...n('plains', 5), 'savannah-lions', 'savannah-lions'],
      },
    });
    const [a, b] = on(g, 'savannah-lions');
    const card = g.id('p1', 'moment-of-glory', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [obj(g, a!)] });
    done(g);
    expect(counters(g, a!)).toBe(1);
    expect(counters(g, b!)).toBe(1);
    expect(g.zoneOf(card)).toBe('exile');
  });
});

describe('The Eagles Are Coming!', () => {
  it('returns one creature you own and makes a Bird Soldier at the next upkeep', () => {
    const g = game({
      p1: { hand: ['the-eagles-are-coming'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    cast(g, 'the-eagles-are-coming', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(names(g, 'p1', 'hand')).toContain('savannah-lions');
    expect(on(g, 'hob-bird-soldier-token')).toHaveLength(0);
    toStep(g, 'upkeep');
    done(g);
    const birds = on(g, 'hob-bird-soldier-token', 'p1');
    expect(birds).toHaveLength(1);
    expect(pt(g, birds[0]!)).toEqual([4, 4]);
    expect(keywords(g, birds[0]!)).toContain('flying');
  });
  it('kicked, returns any number of creatures you own: a Bird for each', () => {
    const g = game({
      p1: {
        hand: ['the-eagles-are-coming'],
        battlefield: [...n('plains', 6), 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
    });
    const card = g.id('p1', 'the-eagles-are-coming', 'hand');
    const kicked = g.legal().find((a) => a.type === 'castSpell' && a.card === card && a.kicked)!;
    expect(kicked).toBeDefined();
    g.do(kicked);
    // Pick two of the three creatures, one at a time (each answer lists everything picked so far).
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 2)!);
    // The first answer lists the targets picked so far: that is "done".
    g.do(g.legal()[0]!);
    done(g);
    expect(names(g, 'p1', 'hand').filter((d) => d === 'savannah-lions')).toHaveLength(2);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    toStep(g, 'upkeep');
    done(g);
    expect(on(g, 'hob-bird-soldier-token', 'p1')).toHaveLength(2);
  });
  it('can target a creature you own that an opponent controls', () => {
    const g = game({
      p1: { hand: ['the-eagles-are-coming'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    g.obj(lions).owner = 'p1';
    cast(g, 'the-eagles-are-coming', [obj(g, lions)]);
    done(g);
    expect(names(g, 'p1', 'hand')).toContain('savannah-lions');
    // An opponent's own creature is not a legal target.
    const h = game({
      p1: { hand: ['the-eagles-are-coming'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const cards = h.legal().filter((a) => a.type === 'castSpell');
    expect(cards).toHaveLength(0);
  });
});

describe('Settle the Wreckage', () => {
  it('exiles the attackers and lets their controller fetch that many basic lands tapped', () => {
    const g = game({
      p1: { hand: ['settle-the-wreckage'], battlefield: n('plains', 4) },
      p2: {
        battlefield: ['savannah-lions', 'savannah-lions', 'serra-angel'],
        library: [...n('forest', 5), ...n('plains', 5)],
      },
      active: 'p2',
      step: 'beginCombat',
    });
    for (const id of g.state.battlefield)
      if (g.obj(id).controller === 'p2') g.obj(id).summoningSick = false;
    g.passBoth();
    const [a, b] = on(g, 'savannah-lions');
    g.attack(a!, b!);
    // Both players pass to the declare-blockers step; then p1 casts Settle.
    for (let i = 0; i < 10 && g.decision.kind !== 'priority'; i++) {
      g.do({ type: 'confirmAttackers', player: 'p2' } as never);
    }
    for (let i = 0; i < 6; i++) {
      if (g.legal('p1').some((x) => x.type === 'castSpell')) break;
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p1' });
      else g.pass();
    }
    const settle = g
      .legal('p1')
      .find(
        (x) => x.type === 'castSpell' && x.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!;
    expect(settle).toBeDefined();
    g.do(settle);
    done(g);
    expect(on(g, 'savannah-lions')).toHaveLength(0);
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual([
      'savannah-lions',
      'savannah-lions',
    ]);
    // p2 fetched two basic lands onto the battlefield tapped.
    const lands = g.state.battlefield.filter(
      (id) => g.obj(id).controller === 'p2' && types(g, id).includes('Land'),
    );
    expect(lands).toHaveLength(2);
    expect(lands.every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe("Bilbo's Gambit", () => {
  const setup = () =>
    game({
      p1: { hand: ['giant-growth'], battlefield: [...n('forest', 1), 'savannah-lions'] },
      p2: { hand: ['bilbos-gambit', 'giant-growth'], battlefield: [...n('plains', 2), 'forest'] },
    });
  it("returns the spell to its owner's hand", () => {
    const g = setup();
    cast(g, 'giant-growth', [obj(g, g.id('p1', 'savannah-lions'))]);
    g.pass();
    const spell = g.state.stack[0]!;
    const gambit = g
      .legal('p2')
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bilbos-gambit' && !a.kicked)!;
    expect(gambit).toBeDefined();
    g.do({ ...gambit, targets: [{ object: { id: spell.id, zcc: g.obj(spell.id).zcc } }] } as never);
    done(g);
    expect(names(g, 'p1', 'hand')).toContain('giant-growth');
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
  it('with the gift promised, the opponent gets a Treasure and nobody can cast spells this turn', () => {
    const g = setup();
    cast(g, 'giant-growth', [obj(g, g.id('p1', 'savannah-lions'))]);
    g.pass();
    const spell = g.state.stack[0]!;
    const gambit = g
      .legal('p2')
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bilbos-gambit' && a.kicked)!;
    expect(gambit).toBeDefined();
    g.do({ ...gambit, targets: [{ object: { id: spell.id, zcc: g.obj(spell.id).zcc } }] } as never);
    done(g);
    expect(on(g, 'treasure-token', 'p1')).toHaveLength(1);
    expect(names(g, 'p1', 'hand')).toContain('giant-growth');
    expect(g.legal('p1').some((a) => a.type === 'castSpell')).toBe(false);
    expect(g.legal('p2').some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Magnificent End', () => {
  it('deals 5 damage and costs {3} less when it targets a tapped creature', () => {
    const cheap = game({
      p1: { hand: ['magnificent-end'], battlefield: n('plains', 2) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = cheap.id('p2', 'serra-angel');
    cast(cheap, 'magnificent-end', [obj(cheap, angel)]);
    done(cheap);
    expect(cheap.zoneOf(angel)).toBe('graveyard');
    const full = game({
      p1: { hand: ['magnificent-end'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(
      full
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.targets.some((t) => 'object' in t && t.object.id === full.id('p2', 'serra-angel')),
        ),
    ).toBe(false);
  });
});

describe('Stone by Sunlight', () => {
  it('mode 1 destroys a creature with power 4 or greater only', () => {
    const g = game({
      p1: { hand: ['stone-by-sunlight'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && (a.mode ?? 0) === 0)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : ''));
    expect(targets).toEqual(['serra-angel']);
    cast(g, 'stone-by-sunlight', [obj(g, g.id('p2', 'serra-angel'))], { mode: 0 });
    done(g);
    expect(on(g, 'serra-angel')).toHaveLength(0);
  });
  it('mode 2 makes a creature an artifact and indestructible until end of turn', () => {
    const g = game({
      p1: { hand: ['stone-by-sunlight'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'stone-by-sunlight', [obj(g, lions)], { mode: 1 });
    done(g);
    expect(types(g, lions)).toEqual(expect.arrayContaining(['Creature', 'Artifact']));
    expect(keywords(g, lions)).toContain('indestructible');
    // It counts as an artifact for filters too, and wears off at end of turn.
    toStep(g, 'end');
    toStep(g, 'upkeep');
    expect(types(g, lions)).not.toContain('Artifact');
  });
  it('an artifact-creature counts toward the enduring story', () => {
    const g = game({
      p1: {
        hand: ['stone-by-sunlight'],
        battlefield: [...n('plains', 2), 'ori-keeper-of-songs', 'savannah-lions', 'hob-axe-token'],
      },
    });
    const ori = g.id('p1', 'ori-keeper-of-songs');
    expect(pt(g, ori)).toEqual([3, 3]);
    cast(g, 'stone-by-sunlight', [obj(g, g.id('p1', 'savannah-lions'))], { mode: 1 });
    done(g);
    expect(pt(g, ori)).toEqual([4, 3]);
  });
});

describe('Vow to Erebor', () => {
  it('untaps, gives +2/+2 and attaches an Equipment to a Dwarf', () => {
    const g = game({
      p1: {
        hand: ['vow-to-erebor'],
        battlefield: [
          ...n('plains', 2),
          { card: 'dwarven-provisioner', tapped: true },
          'hob-axe-token',
        ],
      },
    });
    const dwarf = g.id('p1', 'dwarven-provisioner');
    cast(g, 'vow-to-erebor', [obj(g, dwarf)]);
    done(g);
    expect(g.obj(dwarf).tapped).toBe(false);
    expect(pt(g, dwarf)).toEqual([5, 4]);
    expect(g.obj(g.id('p1', 'hob-axe-token')).attachedTo).toBe(dwarf);
  });
  it('does not attach to a creature that is not a Dwarf', () => {
    const g = game({
      p1: {
        hand: ['vow-to-erebor'],
        battlefield: [...n('plains', 2), 'savannah-lions', 'hob-axe-token'],
      },
    });
    cast(g, 'vow-to-erebor', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
    expect(g.obj(g.id('p1', 'hob-axe-token')).attachedTo).toBeUndefined();
  });
});

describe('Equipment makers', () => {
  it('Dwarven Shortsword makes a Dwarf and attaches itself to it', () => {
    const g = game({ p1: { hand: ['dwarven-shortsword'], battlefield: n('plains', 4) } });
    cast(g, 'dwarven-shortsword');
    done(g);
    const dwarf = on(g, 'hob-dwarf-token', 'p1')[0]!;
    expect(g.obj(g.id('p1', 'dwarven-shortsword')).attachedTo).toBe(dwarf);
    expect(pt(g, dwarf)).toEqual([3, 4]);
  });
  it('Iron Hills Blacksmith has double strike and makes an Axe that equips for {2}', () => {
    const g = game({ p1: { hand: ['iron-hills-blacksmith'], battlefield: n('plains', 4) } });
    cast(g, 'iron-hills-blacksmith');
    done(g);
    const smith = g.id('p1', 'iron-hills-blacksmith');
    expect(keywords(g, smith)).toContain('doubleStrike');
    const axe = on(g, 'hob-axe-token', 'p1')[0]!;
    expect(getCharacteristics(g.state, cardDb, axe).types).toContain('Artifact');
    activate(g, axe, 1, [obj(g, smith)]);
    done(g);
    expect(pt(g, smith)).toEqual([2, 1]);
  });
});

describe('An Unexpected Party // At the Door', () => {
  it('At the Door makes X Dwarves, then the Party can be cast from exile and pumps the chosen type', () => {
    const g = game({
      p1: { hand: ['an-unexpected-party'], battlefield: [...n('plains', 12), 'savannah-lions'] },
    });
    const card = g.id('p1', 'an-unexpected-party', 'hand');
    const door = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === card && a.back && a.x === 3)!;
    expect(door).toBeDefined();
    g.do(door);
    done(g);
    expect(on(g, 'hob-dwarf-token', 'p1')).toHaveLength(3);
    expect(g.obj(card).onAdventure).toBe(true);
    const party = g.legal().find((a) => a.type === 'castSpell' && a.card === card && !a.back)!;
    g.do(party);
    done(g, { option: /Dwarf/ });
    expect(g.zoneOf(card)).toBe('battlefield');
    const dwarf = on(g, 'hob-dwarf-token', 'p1')[0]!;
    expect(pt(g, dwarf)).toEqual([4, 4]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('Adventure spells', () => {
  it('Gaze in Wonder taps one or two creatures; Velvetwing Butterflies can be cast after', () => {
    const g = game({
      p1: { hand: ['velvetwing-butterflies'], battlefield: n('plains', 6) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const card = g.id('p1', 'velvetwing-butterflies', 'hand');
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const both = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === card && a.back && a.targets.length === 2)!;
    g.do({ ...both, targets: [obj(g, angel), obj(g, lions)] } as never);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.obj(card).onAdventure).toBe(true);
    const creature = g.legal().find((a) => a.type === 'castSpell' && a.card === card && !a.back)!;
    g.do(creature);
    done(g);
    expect(keywords(g, card)).toContain('flying');
    expect(g.zoneOf(card)).toBe('battlefield');
  });
  it('Concerted Care gives an artifact or creature you control hexproof and indestructible', () => {
    const g = game({
      p1: { hand: ['bofur-reliable-guardian'], battlefield: [...n('plains', 3), 'hob-axe-token'] },
    });
    const card = g.id('p1', 'bofur-reliable-guardian', 'hand');
    const axe = g.id('p1', 'hob-axe-token');
    const care = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === card &&
          a.back &&
          a.targets.some((t) => 'object' in t && t.object.id === axe),
      )!;
    expect(care).toBeDefined();
    g.do(care);
    done(g);
    expect(keywords(g, axe)).toEqual(expect.arrayContaining(['hexproof', 'indestructible']));
    const bofur = g.legal().find((a) => a.type === 'castSpell' && a.card === card && !a.back)!;
    g.do(bofur);
    done(g);
    expect(keywords(g, card)).toContain('lifelink');
  });
});

/** Passes to the next time `player` has the first main phase; resolving the saga trigger on the way. */
function nextMain(g: GameDriver): GameDriver {
  const turn = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    const d = g.decision;
    if (
      g.state.turn.number > turn &&
      g.state.turn.step === 'main1' &&
      d.kind === 'priority' &&
      !g.state.stack.length &&
      g.state.turn.activePlayer === 'p1'
    )
      return g;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error('No next main phase');
}

describe("The Mountain-king's Return", () => {
  it('recruits, reanimates a creature with mana value 3 or less, then puts a counter on a creature', () => {
    const g = game({
      p1: {
        hand: ['the-mountain-kings-return', 'giant-growth'],
        graveyard: ['serra-angel', 'savannah-lions'],
        battlefield: [...n('plains', 3), 'llanowar-elves'],
      },
    });
    cast(g, 'the-mountain-kings-return');
    done(g, { card: 'giant-growth' });
    expect(on(g, 'hob-human-soldier-token', 'p1')).toHaveLength(1);
    nextMain(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(0);
    nextMain(g);
    const total = g.state.battlefield.reduce((sum, id) => sum + counters(g, id), 0);
    expect(total).toBe(1);
    nextMain(g);
    expect(g.zoneOf(g.id('p1', 'the-mountain-kings-return', 'graveyard'))).toBe('graveyard');
  });
});

describe('Roads Go Ever, Ever On', () => {
  it('fetches two Plains into exile, returns one at each of II and III, then pumps an attacker by Plains', () => {
    const g = game({
      p1: {
        hand: ['roads-go-ever-ever-on'],
        library: [...n('plains', 6), ...n('forest', 4)],
        battlefield: [...n('plains', 2), 'savannah-lions'],
      },
    });
    cast(g, 'roads-go-ever-ever-on');
    done(g);
    expect(g.life('p1')).toBe(22);
    const [first, second] = g.state.players.p1.exile.slice();
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['plains', 'plains']);
    expect(g.state.players.p1.library).toHaveLength(8);
    nextMain(g);
    // Chapter II: one of the two exiled Plains is in the hand, the other is still exiled.
    expect(g.zoneOf(first!)).toBe('hand');
    expect(g.zoneOf(second!)).toBe('exile');
    nextMain(g);
    expect(g.zoneOf(second!)).toBe('hand');
    // Chapter IV: whenever you attack this turn, +1/+1 for each Plains you control.
    nextMain(g);
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).summoningSick = false;
    const plains = on(g, 'plains', 'p1').length;
    expect(plains).toBe(2);
    g.passUntilStep('beginCombat').passBoth();
    g.attack(lions);
    done(g);
    expect(pt(g, lions)).toEqual([2 + plains, 1 + plains]);
  });
});
