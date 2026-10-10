import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  activate,
  activations,
  casts,
  exile,
  gy,
  hand,
  passTo,
  tokens,
} from './ecl-red-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Lord of the Rings 21b: the red cards (part one: spells, Sagas and Equipment).

type G = ReturnType<typeof game>;
const ARMY = 'ltr-orc-army-token';
const SOLDIER = 'hob-human-soldier-token';
const bf = (g: G, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);
const kw = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const lands = (count: number) => n('mountain', count);
const one = (g: G, def: string, p: 'p1' | 'p2' = 'p1') => bf(g, def, p)[0]!;

const NAMES = [
  'Assault on Osgiliath',
  'Battle-Scarred Goblin',
  'Book of Mazarbul',
  'Erebor Flamesmith',
  'Erkenbrand, Lord of Westfold',
  'Fear, Fire, Foes!',
  'Foray of Orcs',
  "Gimli's Axe",
  "Gimli's Fury",
  'Gimli, Counter of Kills',
  'Goblin Fireleaper',
  'Grishnákh, Brash Instigator',
  'Haradrim Spearmaster',
  'Olog-hai Crusher',
  "Quarrel's End",
  'Rally at the Hornburg',
  'Relentless Rohirrim',
  'Riders of the Mark',
  'Rising of the Day',
  'Rohirrim Lancer',
  'Rush the Room',
  'Smite the Deathless',
  'Swarming of Moria',
  'Éomer of the Riddermark',
];

describe('the red Lord of the Rings cards', () => {
  it('are all in cardDb', () => {
    expect(NAMES).toHaveLength(24);
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
    const groups = JSON.parse(
      readFileSync(new URL('../scripts/data/ltr-groups.json', import.meta.url), 'utf8'),
    ) as Record<string, string>;
    expect(
      Object.keys(groups)
        .filter((name) => groups[name] === 'red')
        .sort(),
    ).toEqual([...NAMES].sort());
  });

  it('play whole random games without getting stuck', () => {
    const engine = createEngine(cardDb);
    const cards = NAMES.map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('mountain', 24)].slice(0, 70);
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120000);
});

describe('Rush the Room', () => {
  const setup = (target: string) =>
    game({
      p1: { hand: ['rush-the-room'], battlefield: [...lands(1), target] },
    });

  it('gives +1/+0 and first strike, and no haste to a creature that is neither Goblin nor Orc', () => {
    const g = setup('llanowar-elves');
    const elf = one(g, 'llanowar-elves');
    cast(g, 'rush-the-room', [g.ref(elf)]);
    settle(g);
    expect(pt(g, elf)).toEqual([2, 1]);
    expect(kw(g, elf).has('firstStrike')).toBe(true);
    expect(kw(g, elf).has('haste')).toBe(false);
  });

  it('also gives haste to a Goblin', () => {
    const g = setup('goblin-fireleaper');
    const goblin = one(g, 'goblin-fireleaper');
    cast(g, 'rush-the-room', [g.ref(goblin)]);
    settle(g);
    expect(pt(g, goblin)).toEqual([2, 1]);
    expect(kw(g, goblin).has('haste')).toBe(true);
  });

  it('also gives haste to an Orc (an Orc Army)', () => {
    const g = setup(ARMY);
    const army = one(g, ARMY);
    g.obj(army).plusOneCounters = 1;
    cast(g, 'rush-the-room', [g.ref(army)]);
    settle(g);
    expect(kw(g, army).has('haste')).toBe(true);
    expect(kw(g, army).has('firstStrike')).toBe(true);
  });
});

describe('Book of Mazarbul', () => {
  const setup = () =>
    game({
      p1: { hand: ['book-of-mazarbul'], battlefield: [...lands(3), 'llanowar-elves'] },
    });

  it('I: amass Orcs 1 makes a 1/1 Orc Army token', () => {
    const g = setup();
    cast(g, 'book-of-mazarbul');
    settle(g);
    const army = bf(g, ARMY);
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
    expect(g.obj(g.id('p1', 'book-of-mazarbul')).counters?.lore).toBe(1);
  });

  it('II puts two more counters on the Army; III gives creatures +1/+0 and menace until end of turn, then the Saga goes', () => {
    const g = setup();
    cast(g, 'book-of-mazarbul');
    settle(g);
    passTo(g, 'main1', 'p1');
    settle(g);
    const army = one(g, ARMY);
    expect(bf(g, ARMY)).toHaveLength(1);
    expect(pt(g, army)).toEqual([3, 3]);
    expect(g.obj(g.id('p1', 'book-of-mazarbul')).counters?.lore).toBe(2);
    passTo(g, 'main1', 'p1');
    settle(g);
    const elf = one(g, 'llanowar-elves');
    expect(pt(g, elf)).toEqual([2, 1]);
    expect(kw(g, elf).has('menace')).toBe(true);
    expect(pt(g, army)).toEqual([4, 3]);
    expect(kw(g, army).has('menace')).toBe(true);
    // Sacrificed after chapter III.
    expect(bf(g, 'book-of-mazarbul')).toHaveLength(0);
  });
});

describe('Swarming of Moria', () => {
  it('creates a Treasure and amasses Orcs 2', () => {
    const g = game({ p1: { hand: ['swarming-of-moria'], battlefield: lands(3) } });
    cast(g, 'swarming-of-moria');
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
    const army = bf(g, ARMY);
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([2, 2]);
    expect(g.state.objects[army[0]!]!.isToken).toBe(true);
  });

  it('puts the counters on an Army you already have, and it becomes an Orc', () => {
    const g = game({ p1: { hand: ['swarming-of-moria'], battlefield: [...lands(3), ARMY] } });
    cast(g, 'swarming-of-moria');
    settle(g);
    expect(bf(g, ARMY)).toHaveLength(1);
    expect(pt(g, one(g, ARMY))).toEqual([2, 2]);
  });
});

describe('Assault on Osgiliath', () => {
  it('amasses Orcs X, then Goblins and Orcs you control gain double strike and haste', () => {
    const g = game({
      p1: {
        hand: ['assault-on-osgiliath'],
        battlefield: [...lands(5), 'goblin-fireleaper', 'llanowar-elves'],
      },
      p2: { battlefield: ['battle-scarred-goblin'] },
    });
    cast(g, 'assault-on-osgiliath', [], { x: 2 });
    settle(g);
    const army = one(g, ARMY);
    expect(pt(g, army)).toEqual([2, 2]);
    for (const id of [army, one(g, 'goblin-fireleaper')]) {
      expect(kw(g, id).has('doubleStrike')).toBe(true);
      expect(kw(g, id).has('haste')).toBe(true);
    }
    expect(kw(g, one(g, 'llanowar-elves')).has('doubleStrike')).toBe(false);
    // Only yours.
    expect(kw(g, one(g, 'battle-scarred-goblin', 'p2')).has('doubleStrike')).toBe(false);
  });

  it('costs {X}{R}{R}{R}: X = 0 makes a 0/0 Army that dies', () => {
    const g = game({ p1: { hand: ['assault-on-osgiliath'], battlefield: lands(3) } });
    cast(g, 'assault-on-osgiliath', [], { x: 0 });
    settle(g);
    expect(bf(g, ARMY)).toHaveLength(0);
  });
});

describe('Foray of Orcs', () => {
  it("amasses Orcs 2, then deals damage equal to the Army's power to a creature an opponent controls", () => {
    const g = game({
      p1: { hand: ['foray-of-orcs'], battlefield: lands(4) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'foray-of-orcs');
    settle(g);
    expect(pt(g, one(g, ARMY))).toEqual([2, 2]);
    expect(g.obj(one(g, 'serra-angel', 'p2')).damage).toBe(2);
  });

  it("uses the whole Army's power when it already had counters", () => {
    const g = game({
      p1: { hand: ['foray-of-orcs'], battlefield: [...lands(4), ARMY] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.obj(one(g, ARMY)).plusOneCounters = 3;
    cast(g, 'foray-of-orcs');
    settle(g);
    expect(pt(g, one(g, ARMY))).toEqual([5, 5]);
    // 5 damage kills the 4/4.
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(0);
  });

  it('only targets creatures an opponent controls', () => {
    const g = game({
      p1: { hand: ['foray-of-orcs'], battlefield: [...lands(4), 'llanowar-elves'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'foray-of-orcs');
    settle(g);
    // Your own Elf is not a target; the opponent's Angel is the only one.
    expect(g.obj(one(g, 'llanowar-elves')).damage).toBe(0);
    expect(g.obj(one(g, 'serra-angel', 'p2')).damage).toBe(2);
  });
});

describe('Fear, Fire, Foes!', () => {
  const setup = () =>
    game({
      p1: { hand: ['fear-fire-foes'], battlefield: [...lands(4), 'llanowar-elves'] },
      p2: { battlefield: ['serra-angel', 'llanowar-elves', 'llanowar-elves'] },
    });

  it('deals X damage to the target and 1 damage to each other creature with the same controller', () => {
    const g = setup();
    const angel = one(g, 'serra-angel', 'p2');
    cast(g, 'fear-fire-foes', [g.ref(angel)], { x: 3 });
    settle(g);
    expect(g.obj(angel).damage).toBe(3);
    // The two 1/1 Elves of the same controller die; your own Elf is untouched.
    expect(bf(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(g.obj(one(g, 'llanowar-elves')).damage).toBe(0);
    expect(g.state.turn.ltrDamageUnpreventable).toBe(true);
  });

  it('with X = 0 the target takes nothing and the others take 1', () => {
    const g = setup();
    const angel = one(g, 'serra-angel', 'p2');
    cast(g, 'fear-fire-foes', [g.ref(angel)], { x: 0 });
    settle(g);
    expect(g.obj(angel).damage).toBe(0);
    expect(bf(g, 'llanowar-elves', 'p2')).toHaveLength(0);
  });

  it('can target your own creature: your other creatures take 1', () => {
    const g = game({
      p1: { hand: ['fear-fire-foes'], battlefield: [...lands(3), 'serra-angel', 'llanowar-elves'] },
    });
    cast(g, 'fear-fire-foes', [g.ref(one(g, 'serra-angel'))], { x: 2 });
    settle(g);
    expect(g.obj(one(g, 'serra-angel')).damage).toBe(2);
    expect(bf(g, 'llanowar-elves')).toHaveLength(0);
  });

  it("damage can't be prevented this turn, and the flag ends with the turn", () => {
    const g = game({
      p1: { hand: ['fear-fire-foes', 'shock'], battlefield: [...lands(5), 'llanowar-elves'] },
      p2: { battlefield: ['serra-angel'] },
    });
    // Damage to p2's creatures is prevented (Summon: Alexander's shield) ...
    g.state.turn.creaturesShielded = ['p2'];
    const angel = one(g, 'serra-angel', 'p2');
    cast(g, 'shock', [g.ref(angel)]);
    settle(g);
    expect(g.obj(angel).damage).toBe(0);
    // ... until Fear, Fire, Foes! resolves.
    cast(g, 'fear-fire-foes', [g.ref(angel)], { x: 2 });
    settle(g);
    expect(g.obj(angel).damage).toBe(2);
    passTo(g, 'main1', 'p2');
    expect(g.state.turn.ltrDamageUnpreventable).toBeUndefined();
  });
});

describe("Gimli's Axe", () => {
  const setup = () =>
    game({
      p1: {
        hand: [],
        battlefield: [...lands(2), 'gimlis-axe', 'llanowar-elves', 'erkenbrand-lord-of-westfold'],
      },
    });

  it('gives +3/+0, and menace only to a legendary creature', () => {
    const g = setup();
    const axe = one(g, 'gimlis-axe');
    const elf = one(g, 'llanowar-elves');
    activate(g, axe, 1, [g.ref(elf)]);
    settle(g);
    expect(pt(g, elf)).toEqual([4, 1]);
    expect(kw(g, elf).has('menace')).toBe(false);
    expect(g.obj(axe).attachedTo).toBe(elf);
  });

  it('a legendary equipped creature has menace', () => {
    const g = setup();
    const axe = one(g, 'gimlis-axe');
    const legend = one(g, 'erkenbrand-lord-of-westfold');
    expect(activations(g, axe, 1).length).toBeGreaterThan(0);
    activate(g, axe, 1, [g.ref(legend)]);
    settle(g);
    expect(pt(g, legend)).toEqual([6, 3]);
    expect(kw(g, legend).has('menace')).toBe(true);
  });
});

describe("Gimli's Fury", () => {
  it('gives +3/+2, and trample if the creature is legendary', () => {
    const g = game({
      p1: {
        hand: ['gimlis-fury', 'gimlis-fury'],
        battlefield: [...lands(4), 'llanowar-elves', 'erkenbrand-lord-of-westfold'],
      },
    });
    const elf = one(g, 'llanowar-elves');
    const legend = one(g, 'erkenbrand-lord-of-westfold');
    cast(g, 'gimlis-fury', [g.ref(elf)]);
    settle(g);
    expect(pt(g, elf)).toEqual([4, 3]);
    expect(kw(g, elf).has('trample')).toBe(false);
    cast(g, 'gimlis-fury', [g.ref(legend)]);
    settle(g);
    expect(pt(g, legend)).toEqual([6, 5]);
    expect(kw(g, legend).has('trample')).toBe(true);
  });
});

describe('Rising of the Day', () => {
  it('gives your creatures haste and your legendary creatures +1/+0', () => {
    const g = game({
      p1: {
        battlefield: ['rising-of-the-day', 'llanowar-elves', 'erkenbrand-lord-of-westfold'],
      },
      p2: { battlefield: [slug('Grishnákh, Brash Instigator'), 'serra-angel'] },
    });
    const elf = one(g, 'llanowar-elves');
    const legend = one(g, 'erkenbrand-lord-of-westfold');
    expect(kw(g, elf).has('haste')).toBe(true);
    expect(kw(g, legend).has('haste')).toBe(true);
    expect(pt(g, elf)).toEqual([1, 1]);
    expect(pt(g, legend)).toEqual([4, 3]);
    // Not the opponent's.
    expect(kw(g, one(g, 'serra-angel', 'p2')).has('haste')).toBe(false);
    expect(pt(g, one(g, slug('Grishnákh, Brash Instigator'), 'p2'))).toEqual([1, 1]);
  });
});

describe('Smite the Deathless', () => {
  it('deals 3 damage; if the creature would die this turn it is exiled instead', () => {
    const g = game({
      p1: { hand: ['smite-the-deathless'], battlefield: lands(2) },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elf = one(g, 'llanowar-elves', 'p2');
    cast(g, 'smite-the-deathless', [g.ref(elf)]);
    settle(g);
    expect(exile(g, 'p2')).toEqual(['llanowar-elves']);
    expect(gy(g, 'p2')).toEqual([]);
  });

  it('the creature loses indestructible until end of turn, so it can die (and is exiled)', () => {
    const g = game({
      p1: { hand: ['smite-the-deathless', 'shock'], battlefield: lands(3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = one(g, 'serra-angel', 'p2');
    g.obj(angel).counters = { indestructible: 1 };
    expect(kw(g, angel).has('indestructible')).toBe(true);
    cast(g, 'smite-the-deathless', [g.ref(angel)]);
    settle(g);
    expect(g.obj(angel).damage).toBe(3);
    expect(kw(g, angel).has('indestructible')).toBe(false);
    // 3 + 2 damage is lethal for a 4/4 that is no longer indestructible.
    cast(g, 'shock', [g.ref(angel)]);
    settle(g);
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });

  it('indestructible comes back with the next turn', () => {
    const g = game({
      p1: { hand: ['smite-the-deathless'], battlefield: lands(2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = one(g, 'serra-angel', 'p2');
    g.obj(angel).counters = { indestructible: 1 };
    cast(g, 'smite-the-deathless', [g.ref(angel)]);
    settle(g);
    passTo(g, 'main1', 'p2');
    expect(kw(g, angel).has('indestructible')).toBe(true);
  });
});

describe("Quarrel's End", () => {
  it('needs a card to discard, then draws two and makes a Human Soldier', () => {
    const g = game({
      p1: { hand: ['quarrels-end', 'shock'], battlefield: lands(3) },
    });
    const shock = g.id('p1', 'shock', 'hand');
    const acts = casts(g, 'quarrels-end');
    expect(acts.length).toBeGreaterThan(0);
    cast(g, 'quarrels-end', [], { discard: shock });
    settle(g);
    expect(gy(g)).toContain('shock');
    expect(hand(g)).toEqual(['forest', 'forest']);
    expect(tokens(g, SOLDIER)).toHaveLength(1);
  });

  it("can't be cast with no other card in hand", () => {
    const g = game({ p1: { hand: ['quarrels-end'], battlefield: lands(3) } });
    expect(casts(g, 'quarrels-end')).toHaveLength(0);
  });
});

describe('Rally at the Hornburg', () => {
  it('creates two Human Soldiers, and Humans you control gain haste', () => {
    const g = game({
      p1: {
        hand: ['rally-at-the-hornburg'],
        battlefield: [...lands(2), 'erkenbrand-lord-of-westfold', 'llanowar-elves'],
      },
    });
    cast(g, 'rally-at-the-hornburg');
    settle(g);
    const soldiers = tokens(g, SOLDIER);
    expect(soldiers).toHaveLength(2);
    for (const id of soldiers) expect(kw(g, id).has('haste')).toBe(true);
    expect(kw(g, one(g, 'erkenbrand-lord-of-westfold')).has('haste')).toBe(true);
    expect(kw(g, one(g, 'llanowar-elves')).has('haste')).toBe(false);
  });
});

describe('Relentless Rohirrim and Rohirrim Lancer', () => {
  it('Rohirrim: when it enters, the Ring tempts you (it becomes the Ring-bearer)', () => {
    const g = game({ p1: { hand: ['relentless-rohirrim'], battlefield: lands(4) } });
    cast(g, 'relentless-rohirrim');
    settle(g);
    const ring = g.state.players.p1.ring;
    expect(ring?.tempted).toBe(1);
    expect(ring?.bearer?.id).toBe(one(g, 'relentless-rohirrim'));
  });

  it('Lancer: menace, and when it dies the Ring tempts you', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [...lands(1), 'rohirrim-lancer'] },
    });
    const lancer = one(g, 'rohirrim-lancer');
    expect(kw(g, lancer).has('menace')).toBe(true);
    expect(g.state.players.p1.ring).toBeUndefined();
    cast(g, 'shock', [g.ref(lancer)]);
    settle(g);
    expect(bf(g, 'rohirrim-lancer')).toHaveLength(0);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
  });
});

describe('Erebor Flamesmith', () => {
  it('deals 1 damage to each opponent whenever you cast an instant or sorcery, not a creature', () => {
    const g = game({
      p1: {
        hand: ['shock', 'llanowar-elves'],
        battlefield: [...lands(2), 'erebor-flamesmith', 'forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'llanowar-elves');
    settle(g);
    expect(g.life('p2')).toBe(20);
    cast(g, 'shock', [g.ref(one(g, 'serra-angel', 'p2'))]);
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(20);
  });
});
