import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  choose,
  done,
  game,
  gy,
  hand,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the colorless group (artifacts, Equipment and nonbasic lands).

const NAMES = [
  'Dwarven Mattock',
  'Elven Passage',
  "Elvenking's Halls",
  "Giant's Boulder",
  'Glamdring, Foe-hammer',
  'Goblin-town',
  'Hobbit Hole',
  'Iron Hills',
  'Key to the Side-Door',
  'Lake-town',
  'Long-Bodied Grey Dog',
  'Mirkwood',
  'My Precious',
  'Old Thrush',
  'Orcrist, Goblin-cleaver',
  "Sting, Bilbo's Sword",
  'The Arkenstone',
  'The Black Arrow',
  'The Lonely Mountain',
  "Thrór's Map",
  'Troop of Ponies',
  'Well-Worn Spatula',
];

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

const find = (name: string) => [...cardDb.values()].find((d) => d.name === name);

const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) expect(find(name), name).toBeDefined();
  });
});

describe('the five two-colour lands', () => {
  // [name, colours, the sacrifice cost, creature the counters go on, a creature they may not go on]
  const LANDS: [string, string[], string, string, string][] = [
    ['Lake-town', ['W', 'U'], '{2}{W}{U}', 'hob-human-soldier-token', 'hob-dwarf-token'],
    ['Mirkwood', ['B', 'G'], '{2}{B}{G}', 'hob-wolf-token', 'hob-dwarf-token'],
    ['Iron Hills', ['R', 'W'], '{2}{R}{W}', 'hob-dwarf-token', 'hob-elf-token'],
    ['Goblin-town', ['B', 'R'], '{2}{B}{R}', 'goblin-token', 'hob-dwarf-token'],
    ["Elvenking's Halls", ['G', 'U'], '{2}{G}{U}', 'hob-elf-token', 'hob-dwarf-token'],
  ];
  for (const [name, colours, , yes, no] of LANDS) {
    const id = find(name)!.id;
    it(`${name}: enters tapped, taps for ${colours.join(' or ')}`, () => {
      const g = game({ p1: { hand: [id] } });
      g.do(g.legal().find((a) => a.type === 'playLand' && a.card === g.id('p1', id, 'hand'))!);
      expect(g.obj(g.id('p1', id)).tapped).toBe(true);
      const d = find(name)!;
      const produced = d.abilities.flatMap((a) => (a.kind === 'mana' ? [a.produces] : []));
      expect(produced).toEqual(colours);
    });
    it(`${name}: sacrifice for two +1/+1 counters on a creature of its types, as a sorcery`, () => {
      const lands = ['plains', 'island', 'swamp', 'mountain', 'forest', 'forest'];
      const g = game({ p1: { battlefield: [id, ...lands, yes, no] } });
      const ab = abilityActions(g, g.id('p1', id), 2);
      const hits = ab.flatMap((a) =>
        a.type === 'activateAbility'
          ? a.targets.flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : []))
          : [],
      );
      expect(hits).toContain(yes);
      expect(hits).not.toContain(no);
      const mine = ab.find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === yes),
      )!;
      g.do(mine);
      done(g);
      expect(board(g, id)).toHaveLength(0);
      expect(g.obj(g.id('p1', yes)).plusOneCounters).toBe(2);
      // Not at instant speed.
      const g2 = game({ p1: { battlefield: [id, ...lands, yes] }, active: 'p2' });
      expect(abilityActions(g2, g2.id('p1', id), 2)).toEqual([]);
    });
  }
});

describe('Hobbit Hole', () => {
  it('{T}, sacrifice: a basic land onto the battlefield tapped', () => {
    const g = game({ p1: { battlefield: ['hobbit-hole'], library: ['plains', 'forest'] } });
    activate(g, g.id('p1', 'hobbit-hole'), 0);
    done(g, { card: (id) => g.obj(id).defId === 'plains' });
    expect(board(g, 'hobbit-hole')).toHaveLength(0);
    const p = board(g, 'plains', 'p1');
    expect(p).toHaveLength(1);
    expect(g.obj(p[0]!).tapped).toBe(true);
  });
  it('has Halflingcycling {4} from the hand', () => {
    const d = cardDb.get('hobbit-hole')!;
    expect(
      d.abilities.some((a) => a.kind === 'activated' && a.label === 'Halflingcycling {4}'),
    ).toBe(true);
    const g = game({ p1: { hand: ['hobbit-hole'], battlefield: n('forest', 4) } });
    expect(
      g
        .legal()
        .some(
          (a) => a.type === 'activateAbility' && a.source === g.id('p1', 'hobbit-hole', 'hand'),
        ),
    ).toBe(true);
  });
});

describe('The Lonely Mountain', () => {
  it('enters tapped unless you control an Equipment', () => {
    const g = game({ p1: { hand: ['the-lonely-mountain'] } });
    g.do(
      g
        .legal()
        .find(
          (a) => a.type === 'playLand' && a.card === g.id('p1', 'the-lonely-mountain', 'hand'),
        )!,
    );
    expect(g.obj(g.id('p1', 'the-lonely-mountain')).tapped).toBe(true);
    const g2 = game({
      p1: { hand: ['the-lonely-mountain'], battlefield: ['well-worn-spatula'] },
    });
    g2.do(
      g2
        .legal()
        .find(
          (a) => a.type === 'playLand' && a.card === g2.id('p1', 'the-lonely-mountain', 'hand'),
        )!,
    );
    expect(g2.obj(g2.id('p1', 'the-lonely-mountain')).tapped).toBe(false);
  });
  it('{4}{R}, {T}: a 2/2 Dwarf; {1} less for each Equipment; sorcery speed', () => {
    const lands = n('mountain', 5);
    const g = game({ p1: { battlefield: ['the-lonely-mountain', ...lands] } });
    expect(abilityActions(g, g.id('p1', 'the-lonely-mountain'), 1).length).toBeGreaterThan(0);
    // Four other lands is one short...
    const g1 = game({ p1: { battlefield: ['the-lonely-mountain', ...n('mountain', 4)] } });
    expect(abilityActions(g1, g1.id('p1', 'the-lonely-mountain'), 1)).toEqual([]);
    // ... until an Equipment makes it cost {3}{R}.
    const g2 = game({
      p1: { battlefield: ['the-lonely-mountain', 'well-worn-spatula', ...n('mountain', 4)] },
    });
    expect(abilityActions(g2, g2.id('p1', 'the-lonely-mountain'), 1).length).toBeGreaterThan(0);
    // Two Equipment: {2}{R}.
    const g3 = game({
      p1: {
        battlefield: [
          'the-lonely-mountain',
          'well-worn-spatula',
          'dwarven-mattock',
          ...n('mountain', 3),
        ],
      },
    });
    expect(abilityActions(g3, g3.id('p1', 'the-lonely-mountain'), 1).length).toBeGreaterThan(0);
    activate(g3, g3.id('p1', 'the-lonely-mountain'), 1);
    done(g3);
    const dwarf = board(g3, 'hob-dwarf-token', 'p1');
    expect(dwarf).toHaveLength(1);
    expect(pt(g3, dwarf[0]!)).toEqual([2, 2]);
    // Opponent's turn: no.
    const g4 = game({ p1: { battlefield: ['the-lonely-mountain', ...lands] }, active: 'p2' });
    expect(abilityActions(g4, g4.id('p1', 'the-lonely-mountain'), 1)).toEqual([]);
  });
});

describe('Elven Passage', () => {
  const run = (behold: boolean) => {
    const g = game({
      p1: { battlefield: ['elven-passage', 'llanowar-elves'], library: ['forest', 'plains'] },
    });
    activate(g, g.id('p1', 'elven-passage'), 0);
    done(g, { card: (id) => g.obj(id).defId === 'plains', option: behold ? /Behold/ : /Don't/ });
    return g;
  };
  it('pays 1 life, sacrifices, and finds a basic land tapped', () => {
    const g = run(false);
    expect(g.state.players.p1.life).toBe(19);
    expect(board(g, 'elven-passage')).toHaveLength(0);
    const p = board(g, 'plains', 'p1');
    expect(p).toHaveLength(1);
    expect(g.obj(p[0]!).tapped).toBe(true);
  });
  it('beholding an Elf untaps that land', () => {
    const g = run(true);
    const p = board(g, 'plains', 'p1');
    expect(p).toHaveLength(1);
    expect(g.obj(p[0]!).tapped).toBe(false);
  });
  it('with an Elf in hand, it can be beheld (revealed) too', () => {
    const g = game({
      p1: { battlefield: ['elven-passage'], hand: ['llanowar-elves'], library: ['plains'] },
    });
    activate(g, g.id('p1', 'elven-passage'), 0);
    done(g, { option: /Behold/ });
    expect(g.obj(board(g, 'plains', 'p1')[0]!).tapped).toBe(false);
  });
  it('with no Elf to behold, the land stays tapped', () => {
    const g = game({ p1: { battlefield: ['elven-passage'], library: ['plains'] } });
    activate(g, g.id('p1', 'elven-passage'), 0);
    done(g);
    expect(g.obj(board(g, 'plains', 'p1')[0]!).tapped).toBe(true);
  });
});

describe("Giant's Boulder", () => {
  it('scry 2 when it enters', () => {
    const g = game({ p1: { hand: ['giants-boulder'], battlefield: ['forest'] } });
    cast(g, 'giants-boulder');
    stop(g);
    expect(g.decision.kind).toBe('scry');
  });
  it('{1}, {T}: one mana of any colour, which waits in the pool', () => {
    // A forest pays the {1}; the Boulder's mana is {W} for Savannah Lions.
    const g = game({ p1: { hand: ['savannah-lions'], battlefield: ['giants-boulder', 'forest'] } });
    expect(casts(g, 'savannah-lions')).toEqual([]);
    const a = abilityActions(g, g.id('p1', 'giants-boulder'), 1);
    expect(a.length).toBeGreaterThan(0);
    g.do(a[0]!);
    expect(g.obj(g.id('p1', 'giants-boulder')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(true);
    expect(casts(g, 'savannah-lions').length).toBeGreaterThan(0);
    // Without another mana source it can not pay for itself.
    const g2 = game({ p1: { hand: ['savannah-lions'], battlefield: ['giants-boulder'] } });
    expect(abilityActions(g2, g2.id('p1', 'giants-boulder'), 1)).toEqual([]);
  });
  it('{7}, {T}, sacrifice: destroy target permanent', () => {
    const g = game({
      p1: { battlefield: ['giants-boulder', ...n('forest', 7)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const a = abilityActions(g, g.id('p1', 'giants-boulder'), 2).find(
      (x) =>
        x.type === 'activateAbility' &&
        x.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions'),
    );
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(board(g, 'giants-boulder')).toHaveLength(0);
    expect(board(g, 'savannah-lions')).toHaveLength(0);
    expect(gy(g, 'p2')).toContain('savannah-lions');
  });
});

describe('Equipment', () => {
  it('Well-Worn Spatula: gain 2 life, +1/+1, equip {1}', () => {
    const g = game({
      p1: { hand: ['well-worn-spatula'], battlefield: ['forest', 'forest', 'savannah-lions'] },
    });
    cast(g, 'well-worn-spatula');
    done(g);
    expect(g.state.players.p1.life).toBe(22);
    const spat = g.id('p1', 'well-worn-spatula');
    const eq = abilityActions(g, spat, 2);
    expect(eq.length).toBeGreaterThan(0);
    g.do(eq[0]!);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
  });

  it('Dwarven Mattock: attaches to a Dwarf as it enters; +2/+2 and ward {1}; equip {3}', () => {
    const g = game({
      p1: { hand: ['dwarven-mattock'], battlefield: ['forest', 'forest', 'hob-dwarf-token'] },
    });
    cast(g, 'dwarven-mattock');
    done(g);
    const dwarf = g.id('p1', 'hob-dwarf-token');
    expect(g.obj(g.id('p1', 'dwarven-mattock')).attachedTo).toBe(dwarf);
    expect(pt(g, dwarf)).toEqual([4, 4]);
    expect([...chars(g, dwarf).keywords]).toContain('wardOne');
    // Equip {3} moves it to another creature.
    const g2 = game({
      p1: { battlefield: ['dwarven-mattock', ...n('forest', 3), 'savannah-lions'] },
    });
    const eq = abilityActions(g2, g2.id('p1', 'dwarven-mattock'), 2);
    expect(eq.length).toBeGreaterThan(0);
  });
  it('Dwarven Mattock: only Dwarves are targeted as it enters', () => {
    const g = game({
      p1: { hand: ['dwarven-mattock'], battlefield: ['forest', 'forest', 'savannah-lions'] },
    });
    cast(g, 'dwarven-mattock');
    done(g);
    expect(g.obj(g.id('p1', 'dwarven-mattock')).attachedTo).toBeFalsy();
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('My Precious: equip costs {2} and 2 life; hexproof and unblockable', () => {
    const g = game({ p1: { battlefield: ['my-precious', 'forest', 'forest', 'savannah-lions'] } });
    const eq = abilityActions(g, g.id('p1', 'my-precious'), 1);
    expect(eq.length).toBeGreaterThan(0);
    g.do(eq[0]!);
    done(g);
    expect(g.state.players.p1.life).toBe(18);
    const lions = g.id('p1', 'savannah-lions');
    const k = [...chars(g, lions).keywords];
    expect(k).toContain('hexproof');
  });
  it("My Precious: the equipped creature can't be blocked", () => {
    const g = game({
      p1: { battlefield: ['my-precious', 'savannah-lions'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.state.objects[g.id('p1', 'my-precious')]!.attachedTo = lions;
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(lions);
    // No block can be declared: the opponent is never asked, and the damage goes through.
    let asked = false;
    for (let i = 0; i < 30 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareBlockers') asked = true;
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.life('p2')).toBe(18);
    expect(asked && g.legal().some((x) => x.type === 'addBlock')).toBe(false);
    // Without My Precious the Elf could block.
    const g2 = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    for (let i = 0; i < 20 && g2.decision.kind !== 'declareAttackers'; i++) g2.pass();
    g2.attack(g2.id('p1', 'savannah-lions'));
    for (let i = 0; i < 20 && g2.decision.kind !== 'declareBlockers'; i++) g2.pass();
    expect(g2.legal().some((a) => a.type === 'addBlock')).toBe(true);
  });
  it('My Precious: with 1 life left, the equip can not be paid', () => {
    const g = game({
      p1: { life: 1, battlefield: ['my-precious', 'forest', 'forest', 'savannah-lions'] },
    });
    expect(abilityActions(g, g.id('p1', 'my-precious'), 1)).toEqual([]);
  });

  it("Glamdring: instants and sorceries cost {X} less, X the equipped creature's power", () => {
    const strike = 'lightning-strike';
    // {1}{R} with a Mountain only: not castable without Glamdring.
    const g0 = game({ p1: { hand: [strike], battlefield: ['mountain', 'savannah-lions'] } });
    expect(casts(g0, strike)).toEqual([]);
    const g = game({
      p1: { hand: [strike], battlefield: ['glamdring-foe-hammer', 'mountain', 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    // Not equipped: no reduction.
    expect(casts(g, strike)).toEqual([]);
    const g2 = game({
      p1: { hand: [strike], battlefield: ['glamdring-foe-hammer', 'mountain', 'savannah-lions'] },
    });
    g2.state.objects[g2.id('p1', 'glamdring-foe-hammer')]!.attachedTo = g2.id(
      'p1',
      'savannah-lions',
    );
    // Power 2 -> {1}{R} costs {R}.
    expect(casts(g2, strike).length).toBeGreaterThan(0);
  });

  it('Sting: hone counters for each creature the opponent controls, attached as it enters; +1/+0 per counter', () => {
    const g = game({
      p1: { hand: ['sting-bilbos-sword'], battlefield: ['forest', 'forest', 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions', 'savannah-lions', 'savannah-lions'] },
    });
    cast(g, 'sting-bilbos-sword');
    done(g, { target: (a) => a.targets.length === 2 });
    const sting = g.obj(g.id('p1', 'sting-bilbos-sword'));
    expect(sting.counters?.hone).toBe(3);
    expect(sting.attachedTo).toBe(g.id('p1', 'savannah-lions'));
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([5, 1]);
  });
  it('Sting: with no creature of yours, it just gets the counters', () => {
    const g = game({
      p1: { hand: ['sting-bilbos-sword'], battlefield: ['forest', 'forest'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'sting-bilbos-sword');
    done(g);
    const sting = g.obj(g.id('p1', 'sting-bilbos-sword'));
    expect(sting.counters?.hone).toBe(1);
    expect(sting.attachedTo).toBeFalsy();
  });

  it('The Black Arrow: 1 damage to any target; a damaged Dragon is destroyed; +1/+1 and reach', () => {
    const g = game({
      p1: { hand: ['the-black-arrow'], battlefield: n('forest', 3) },
      p2: { battlefield: ['ancestor-dragon'] },
    });
    cast(g, 'the-black-arrow');
    done(g, { target: (a) => a.targets.some((t) => 'object' in t) });
    expect(board(g, 'ancestor-dragon')).toHaveLength(0);
    expect(gy(g, 'p2')).toContain('ancestor-dragon');
  });
  it('The Black Arrow: a non-Dragon just takes 1', () => {
    const g = game({
      p1: { hand: ['the-black-arrow'], battlefield: n('forest', 3) },
      p2: { battlefield: [{ card: 'llanowar-elves' }] },
    });
    cast(g, 'the-black-arrow');
    done(g, { target: (a) => a.targets.some((t) => 'object' in t) });
    expect(board(g, 'llanowar-elves')).toHaveLength(0);
    // The Arrow stays.
    expect(board(g, 'the-black-arrow')).toHaveLength(1);
  });
  it('The Black Arrow: equipped creature gets +1/+1 and reach', () => {
    const g = game({
      p1: { battlefield: ['the-black-arrow', 'forest', 'savannah-lions'] },
    });
    const eq = abilityActions(g, g.id('p1', 'the-black-arrow'), 2);
    g.do(eq[0]!);
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect([...chars(g, lions).keywords]).toContain('reach');
  });

  it('Orcrist: +2/+2 and trample; combat damage to a player: a Treasure for each creature of the chosen type', () => {
    const g = game({
      p1: {
        battlefield: [
          'orcrist-goblin-cleaver',
          'savannah-lions',
          'savannah-lions',
          'llanowar-elves',
        ],
      },
    });
    const lions = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    g.state.objects[g.id('p1', 'orcrist-goblin-cleaver')]!.attachedTo = lions[0]!;
    expect(pt(g, lions[0]!)).toEqual([4, 3]);
    expect([...chars(g, lions[0]!).keywords]).toContain('trample');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(lions[0]!);
    for (let i = 0; i < 20 && g.decision.kind !== 'chooseOption'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    // Choose a creature type: the types of creatures you control are offered.
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /Cat/);
    done(g);
    expect(g.life('p2')).toBe(16);
    // Two Cats: two Treasures.
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(2);
  });
});

describe('Artifacts', () => {
  it('The Arkenstone: creatures you control get +1/+1; draw at the beginning of your end step', () => {
    const g = game({
      p1: { battlefield: ['the-arkenstone', 'savannah-lions'], library: ['forest', 'plains'] },
    });
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    const handBefore = hand(g).length;
    passTo(g, 'end');
    done(g);
    expect(hand(g).length).toBe(handBefore + 1);
  });
  it("Thrór's Map: search for a basic land into hand; {2}, {T}: loot", () => {
    const g = game({
      p1: { hand: ['thr-rs-map'], battlefield: n('forest', 4), library: ['plains', 'forest'] },
    });
    cast(g, 'thr-rs-map');
    stop(g);
    done(g, { card: (id) => g.obj(id).defId === 'plains' });
    expect(hand(g)).toEqual(['plains']);
    activate(g, g.id('p1', 'thr-rs-map'), 1);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });
  it("Key to the Side-Door: {2}, {T}: target creature can't be blocked", () => {
    const g = game({
      p1: { battlefield: ['key-to-the-side-door', 'forest', 'forest', 'savannah-lions'] },
    });
    const a = abilityActions(g, g.id('p1', 'key-to-the-side-door'), 0);
    expect(a.length).toBeGreaterThan(0);
    g.do(a[0]!);
    done(g);
    expect(g.obj(g.id('p1', 'key-to-the-side-door')).tapped).toBe(true);
  });
  it('Key to the Side-Door: discard a legendary card named like a legendary permanent you control: draw two', () => {
    const g = game({
      p1: {
        battlefield: ['key-to-the-side-door', 'the-arkenstone', 'forest'],
        hand: ['the-arkenstone', 'forest'],
        library: ['plains', 'island', 'swamp'],
      },
    });
    const a = abilityActions(g, g.id('p1', 'key-to-the-side-door'), 1);
    expect(a.length).toBe(1);
    g.do(a[0]!);
    done(g);
    expect(gy(g)).toEqual(['the-arkenstone']);
    expect(hand(g).sort()).toEqual(['forest', 'island', 'plains']);
  });
  it('Key to the Side-Door: not without a legendary permanent of that name', () => {
    const g = game({
      p1: {
        battlefield: ['key-to-the-side-door', 'forest'],
        hand: ['the-arkenstone', 'forest'],
      },
    });
    expect(abilityActions(g, g.id('p1', 'key-to-the-side-door'), 1)).toEqual([]);
  });
});

describe('Creatures', () => {
  it('Long-Bodied Grey Dog: flash, reach; a tapped Treasure', () => {
    const g = game({ p1: { hand: ['long-bodied-grey-dog'], battlefield: n('forest', 3) } });
    cast(g, 'long-bodied-grey-dog');
    done(g);
    const t = board(g, 'treasure-token', 'p1');
    expect(t).toHaveLength(1);
    expect(g.obj(t[0]!).tapped).toBe(true);
  });
  it('Old Thrush: gain 2 life; may put a basic land on top of the library', () => {
    const g = game({
      p1: {
        hand: ['old-thrush'],
        battlefield: n('forest', 2),
        library: ['forest', 'plains', 'island'],
      },
    });
    cast(g, 'old-thrush');
    done(g, { card: (id) => g.obj(id).defId === 'plains' });
    expect(g.state.players.p1.life).toBe(22);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('plains');
  });
  it('Troop of Ponies: sacrifice for one basic onto the battlefield tapped and one into hand', () => {
    const g = game({
      p1: {
        battlefield: ['troop-of-ponies', 'forest', 'forest'],
        library: ['plains', 'island', 'swamp'],
      },
    });
    activate(g, g.id('p1', 'troop-of-ponies'), 0);
    done(g, { card: (id) => ['plains', 'island'].includes(g.obj(id).defId) });
    expect(board(g, 'troop-of-ponies')).toHaveLength(0);
    expect(hand(g)).toHaveLength(1);
    const lands = ['plains', 'island'].flatMap((d) => board(g, d, 'p1'));
    expect(lands).toHaveLength(1);
    expect(g.obj(lands[0]!).tapped).toBe(true);
  });
});

describe('Adventures', () => {
  const legend = [...cardDb.values()].find(
    (d) => d.supertypes.includes('Legendary') && d.types.includes('Creature') && !d.isToken,
  )!;
  it('The Arkenstone // Seek the Heart: fetch a legendary creature, then cast the artifact from exile', () => {
    const g = game({
      p1: {
        hand: ['the-arkenstone'],
        battlefield: [...n('plains', 3), ...n('forest', 5)],
        library: [legend.id, 'forest'],
      },
    });
    const adv = casts(g, 'the-arkenstone').find((a) => a.back === true);
    expect(adv).toBeDefined();
    g.do(adv!);
    done(g, { card: (id) => g.obj(id).defId === legend.id });
    expect(hand(g)).toEqual([legend.id]);
    expect(g.obj(g.id('p1', 'the-arkenstone', 'exile')).onAdventure).toBe(true);
    // Now the artifact itself from exile.
    const again = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === g.id('p1', 'the-arkenstone', 'exile'));
    expect(again).toBeDefined();
    g.do(again!);
    done(g);
    expect(board(g, 'the-arkenstone')).toHaveLength(1);
  });
  it('Allure of Power: sacrifice a creature to draw two cards', () => {
    const g = game({
      p1: {
        hand: ['my-precious'],
        battlefield: ['swamp', 'swamp', 'savannah-lions'],
        library: ['plains', 'island', 'forest'],
      },
    });
    const a = casts(g, 'my-precious').find((x) => x.back === true);
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(board(g, 'savannah-lions')).toHaveLength(0);
    expect(hand(g).sort()).toEqual(['island', 'plains']);
    // Not without a creature to sacrifice.
    const g2 = game({ p1: { hand: ['my-precious'], battlefield: ['swamp', 'swamp'] } });
    expect(casts(g2, 'my-precious').some((x) => x.back === true)).toBe(false);
  });
  it('Gleam of Death: mill six, then the instants and sorceries among them go to your hand', () => {
    const g = game({
      p1: {
        hand: ['glamdring-foe-hammer'],
        battlefield: [...n('island', 4)],
        library: [
          'lightning-strike',
          'forest',
          'savannah-lions',
          'lightning-strike',
          'forest',
          'forest',
          'plains',
          'island',
        ],
      },
    });
    const a = casts(g, 'glamdring-foe-hammer').find((x) => x.back === true);
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(hand(g)).toEqual(['lightning-strike', 'lightning-strike']);
    expect(gy(g).sort()).toEqual(['forest', 'forest', 'forest', 'savannah-lions'].sort());
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});
