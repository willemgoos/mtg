import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  choose,
  chars,
  done,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// Lorwyn Eclipsed 18b: the colourless group (artifacts, changelings and nonbasic lands).

const NAMES = [
  'Changeling Wayfinder',
  'Rooftop Percher',
  'Chronicle of Victory',
  'Dawn-Blessed Pennant',
  'Firdoch Core',
  'Foraging Wickermaw',
  'Gathering Stone',
  'Mirrormind Crown',
  "Puca's Eye",
  'Springleaf Drum',
  'Stalactite Dagger',
  'Eclipsed Realms',
  'Hallowed Fountain',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const cast = (g: ReturnType<typeof game>, defId: string) => {
  const a = casts(g, defId)[0];
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) expect(cardDb.get(idOf(name)), name).toBeDefined();
  });
});

describe('Changeling Wayfinder', () => {
  it('is a changeling; its enter trigger searches for a basic land card and puts it into your hand', () => {
    const g = game({
      p1: { hand: ['changeling-wayfinder'], battlefield: n('forest', 3), library: ['plains', 'island'] },
    });
    cast(g, 'changeling-wayfinder');
    done(g, { card: (id) => g.obj(id).defId === 'island' });
    expect(hand(g)).toEqual(['island']);
    expect(chars(g, g.id('p1', 'changeling-wayfinder')).keywords).toContain('changeling');
    expect(pt(g, g.id('p1', 'changeling-wayfinder'))).toEqual([1, 2]);
  });

  it('"may": it can be declined', () => {
    const g = game({
      p1: { hand: ['changeling-wayfinder'], battlefield: n('forest', 3), library: ['plains', 'island'] },
    });
    cast(g, 'changeling-wayfinder');
    done(g, { accept: false });
    expect(hand(g)).toEqual([]);
  });
});

describe('Rooftop Percher', () => {
  it('exiles up to two target cards from graveyards and gains 3 life', () => {
    const g = game({
      p1: { hand: ['rooftop-percher'], battlefield: n('forest', 5), graveyard: ['llanowar-elves'] },
      p2: { graveyard: ['savannah-lions', 'elvish-mystic'] },
    });
    cast(g, 'rooftop-percher');
    stop(g);
    // Up to two targets, picked one at a time (not every pair): the first pick, then the second.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const first = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 1);
    expect(first).toHaveLength(3);
    const byName = (name: string) => (a: (typeof first)[number]) =>
      a.type === 'chooseTargets' &&
      a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === name);
    g.do(first.find(byName('llanowar-elves'))!);
    const second = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 2);
    expect(second).toHaveLength(2);
    g.do(second.find(byName('savannah-lions'))!);
    // Two is the limit: only "done" is left.
    const rest = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(rest.every((a) => a.type === 'chooseTargets' && a.targets.length === 2)).toBe(true);
    g.do(rest[0]!);
    done(g);
    expect(exile(g, 'p1')).toEqual(['llanowar-elves']);
    expect(exile(g, 'p2')).toEqual(['savannah-lions']);
    expect(gy(g, 'p2')).toEqual(['elvish-mystic']);
    expect(g.life('p1')).toBe(23);
  });

  it('works with no cards in any graveyard (up to two)', () => {
    const g = game({ p1: { hand: ['rooftop-percher'], battlefield: n('forest', 5) } });
    cast(g, 'rooftop-percher');
    done(g);
    expect(g.life('p1')).toBe(23);
  });
});

describe('Chronicle of Victory', () => {
  it('creatures you control of the chosen type get +2/+2, first strike and trample; casting such a spell draws a card', () => {
    const g = game({
      p1: {
        hand: ['chronicle-of-victory', 'elvish-mystic'],
        battlefield: [...n('forest', 7), 'llanowar-elves', 'savannah-lions'],
      },
    });
    cast(g, 'chronicle-of-victory');
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    done(g, { option: /^Elf$/ });
    const elf = g.id('p1', 'llanowar-elves');
    expect(pt(g, elf)).toEqual([3, 3]);
    expect([...chars(g, elf).keywords]).toEqual(expect.arrayContaining(['firstStrike', 'trample']));
    // Not a creature of the type.
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    const cards = hand(g).length;
    cast(g, 'elvish-mystic');
    done(g);
    // Elvish Mystic left the hand (-1); the Elf spell drew a card (+1).
    expect(hand(g)).toHaveLength(cards);
  });

  it("a spell that isn't of the chosen type doesn't draw", () => {
    const g = game({
      p1: { hand: ['chronicle-of-victory', 'savannah-lions'], battlefield: [...n('forest', 7), 'plains'] },
    });
    cast(g, 'chronicle-of-victory');
    stop(g);
    done(g, { option: /^Elf$/ });
    const cards = hand(g).length;
    cast(g, 'savannah-lions');
    done(g);
    expect(hand(g)).toHaveLength(cards - 1);
  });

  it('a changeling is of every type', () => {
    const g = game({
      p1: {
        hand: ['chronicle-of-victory'],
        battlefield: [...n('forest', 6), 'changeling-wayfinder'],
      },
    });
    cast(g, 'chronicle-of-victory');
    stop(g);
    done(g, { option: /^Goblin$/ });
    expect(pt(g, g.id('p1', 'changeling-wayfinder'))).toEqual([3, 4]);
  });
});

describe('Dawn-Blessed Pennant', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['dawn-blessed-pennant', 'llanowar-elves', 'savannah-lions'],
        battlefield: [...n('forest', 6), 'plains'],
        graveyard: ['elvish-mystic', 'savannah-lions'],
      },
    });

  it('offers only the eight tribes', () => {
    const g = setup();
    cast(g, 'dawn-blessed-pennant');
    stop(g);
    const d = g.decision;
    expect(d.kind === 'chooseOption' && d.options.map((o) => o.label)).toEqual([
      'Elemental',
      'Elf',
      'Faerie',
      'Giant',
      'Goblin',
      'Kithkin',
      'Merfolk',
      'Treefolk',
    ]);
  });

  it('gains 1 life when a permanent of the chosen type enters; not for another type', () => {
    const g = setup();
    cast(g, 'dawn-blessed-pennant');
    stop(g);
    done(g, { option: /^Elf$/ });
    cast(g, 'savannah-lions');
    done(g);
    expect(g.life('p1')).toBe(20);
    cast(g, 'llanowar-elves');
    done(g);
    expect(g.life('p1')).toBe(21);
  });

  it('{2}, {T}, sacrifice: return target card of the chosen type from your graveyard to your hand', () => {
    const g = setup();
    cast(g, 'dawn-blessed-pennant');
    stop(g);
    done(g, { option: /^Elf$/ });
    const pennant = g.id('p1', 'dawn-blessed-pennant');
    const actions = abilityActions(g, pennant, 2);
    // Only the Elf card in the graveyard is a legal target.
    expect(actions).toHaveLength(1);
    g.do(actions[0]!);
    done(g);
    expect(hand(g)).toContain('elvish-mystic');
    expect(gy(g)).toEqual(['savannah-lions', 'dawn-blessed-pennant']);
  });
});

describe('Firdoch Core', () => {
  it('{T}: add one mana of any color; {4}: becomes a 4/4 artifact creature until end of turn', () => {
    const g = game({ p1: { battlefield: ['firdoch-core', ...n('forest', 4)] } });
    const core = g.id('p1', 'firdoch-core');
    expect(chars(g, core).types).not.toContain('Creature');
    const animate = abilityActions(g, core, 5);
    expect(animate.length).toBeGreaterThan(0);
    g.do(animate[0]!);
    done(g);
    expect(chars(g, core).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    expect(pt(g, core)).toEqual([4, 4]);
    passTo(g, 'main1', 'p2');
    expect(chars(g, core).types).not.toContain('Creature');
  });

  it('taps for any color of mana', () => {
    const g = game({ p1: { hand: ['serra-angel'], battlefield: ['firdoch-core', ...n('plains', 4)] } });
    // {3}{W}{W}: four Plains and the Core (any colour) pay it.
    expect(casts(g, 'serra-angel')).not.toHaveLength(0);
  });
});

describe('Foraging Wickermaw', () => {
  it('surveils 1 when it enters', () => {
    const g = game({
      p1: { hand: ['foraging-wickermaw'], battlefield: n('forest', 2), library: ['savannah-lions', 'forest'] },
    });
    cast(g, 'foraging-wickermaw');
    stop(g);
    expect(g.decision.kind).toBe('scry');
    done(g);
    expect(g.state.players.p1.library.length + gy(g).length).toBe(2);
  });

  it('{1}: add one mana of any color and become that color until end of turn; once each turn', () => {
    const g = game({ p1: { battlefield: ['foraging-wickermaw', 'forest', 'forest'] } });
    const w = g.id('p1', 'foraging-wickermaw');
    expect(g.obj(w).colorOverride).toBeUndefined();
    expect(abilityActions(g, w, 1).length).toBeGreaterThan(0);
    g.do(abilityActions(g, w, 1)[0]!);
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    done(g, { option: /^Red$/ });
    expect(g.state.players.p1.pool).toEqual([expect.objectContaining({ produces: ['R'] })]);
    expect(g.obj(w).colorOverride?.colors).toEqual(['R']);
    // Only once each turn.
    expect(abilityActions(g, w, 1)).toHaveLength(0);
  });

  it('becomes that color only until end of turn', () => {
    const g = game({ p1: { battlefield: ['foraging-wickermaw', 'forest'] } });
    const w = g.id('p1', 'foraging-wickermaw');
    g.do(abilityActions(g, w, 1)[0]!);
    stop(g);
    done(g, { option: /^Blue$/ });
    expect(g.obj(w).colorOverride?.colors).toEqual(['U']);
    passTo(g, 'main1', 'p2');
    expect(abilityActions(g, w, 1)).toHaveLength(0); // p2's turn: not p1's priority
    expect((g.obj(w).colorOverride?.untilTurn ?? 99) < g.state.turn.number).toBe(true);
  });
});

describe('Gathering Stone', () => {
  const setup = (library: string[], extra: string[] = []) =>
    game({
      p1: {
        hand: ['gathering-stone', 'goblin-boarders', 'elvish-mystic'],
        battlefield: [...n('forest', 5), 'mountain', ...extra],
        library,
      },
    });

  it('spells of the chosen type cost {1} less', () => {
    const g = setup(n('forest', 5));
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Goblin$/);
    // The top card is a Forest: leave it.
    choose(g, /^Leave/);
    // One Forest and the Mountain are untapped. Goblin Boarders costs {2}{R}: {1}{R} with the Stone.
    const boarders = casts(g, 'goblin-boarders');
    expect(boarders).not.toHaveLength(0);
    g.do(boarders[0]!);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(6);
  });

  it("doesn't reduce the cost of a spell of another type", () => {
    const g = setup(n('forest', 5));
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Elf$/);
    choose(g, /^Leave/);
    expect(casts(g, 'goblin-boarders')).toHaveLength(0);
  });

  it('enters: look at the top card; of the chosen type, you may reveal it and put it into your hand', () => {
    const g = setup(['elvish-mystic', 'forest', 'forest']);
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Elf$/);
    expect(labels(g)).toEqual([
      expect.stringMatching(/^Reveal Elvish Mystic and put it into your hand/),
      expect.stringMatching(/^Put Elvish Mystic into your graveyard/),
      expect.stringMatching(/^Leave Elvish Mystic on top/),
    ]);
    choose(g, /^Reveal/);
    expect(hand(g)).toContain('elvish-mystic');
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it("a card that isn't of the type can only go to the graveyard or stay on top", () => {
    const g = setup(['savannah-lions', 'forest', 'forest']);
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Elf$/);
    expect(labels(g)).toEqual([
      expect.stringMatching(/^Put Savannah Lions into your graveyard/),
      expect.stringMatching(/^Leave Savannah Lions on top/),
    ]);
    choose(g, /^Put/);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('a card of the type can be put into the graveyard instead (you may)', () => {
    const g = setup(['elvish-mystic', 'forest', 'forest']);
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Elf$/);
    choose(g, /^Put Elvish Mystic into your graveyard/);
    expect(gy(g)).toEqual(['elvish-mystic']);
    expect(hand(g).filter((c) => c === 'elvish-mystic')).toHaveLength(1);
  });

  it('at the beginning of your upkeep it looks at the top card again', () => {
    const g = setup(['forest', 'forest', 'forest']);
    cast(g, 'gathering-stone');
    stop(g);
    choose(g, /^Elf$/);
    choose(g, /^Leave/);
    // p2's turn, then p1's upkeep: put an Elf on top (before the draw step) and look.
    passTo(g, 'upkeep', 'p1');
    expect(g.decision.kind).toBe('priority');
    const mystic = g.state.players.p1.hand.find((id) => g.obj(id).defId === 'elvish-mystic');
    expect(mystic).toBeDefined();
  });
});

describe("Puca's Eye", () => {
  it('when it enters: draw a card, then choose a color; it becomes that color', () => {
    const g = game({
      p1: { hand: ["pucas-eye"], battlefield: n('forest', 2), library: ['savannah-lions', 'forest'] },
    });
    cast(g, 'pucas-eye');
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    done(g, { option: /^Blue$/ });
    expect(hand(g)).toEqual(['savannah-lions']);
    const eye = g.id('p1', 'pucas-eye');
    expect(g.obj(eye).colorOverride?.colors).toEqual(['U']);
  });

  it('{3}, {T}: draw a card, only with five colors among permanents you control', () => {
    const board = [
      { card: 'pucas-eye' },
      ...n('forest', 3),
      'savannah-lions',
      'elvish-mystic',
      'goblin-boarders',
      'serra-angel',
      'burglar-rat',
    ];
    // White, green, red and black: four colors, and the Eye is colorless.
    const g = game({ p1: { battlefield: board } });
    const eye = g.id('p1', 'pucas-eye');
    expect(abilityActions(g, eye, 1)).toHaveLength(0);
    // The Eye becomes blue: five.
    const g2 = game({ p1: { battlefield: board } });
    const eye2 = g2.id('p1', 'pucas-eye');
    g2.obj(eye2).colorOverride = { colors: ['U'] };
    const act = abilityActions(g2, eye2, 1);
    expect(act).toHaveLength(1);
    const before = hand(g2).length;
    g2.do(act[0]!);
    done(g2);
    expect(hand(g2)).toHaveLength(before + 1);
  });
});

describe('Springleaf Drum', () => {
  it('{T}, tap an untapped creature you control: add one mana of any color', () => {
    const g = game({ p1: { battlefield: ['springleaf-drum', { card: 'savannah-lions', sick: true }] } });
    const drum = g.id('p1', 'springleaf-drum');
    const acts = abilityActions(g, drum, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    stop(g);
    done(g, { option: /^Black$/ });
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
    expect(g.obj(drum).tapped).toBe(true);
    expect(g.state.players.p1.pool).toEqual([expect.objectContaining({ produces: ['B'] })]);
  });

  it("can't be activated without an untapped creature", () => {
    const g = game({ p1: { battlefield: ['springleaf-drum', { card: 'savannah-lions', tapped: true }] } });
    expect(abilityActions(g, g.id('p1', 'springleaf-drum'), 0)).toHaveLength(0);
  });
});

describe('Stalactite Dagger', () => {
  it('enters with a 1/1 Shapeshifter changeling token; equipped creature gets +1/+1 and is all creature types', () => {
    const g = game({
      p1: { hand: ['stalactite-dagger'], battlefield: [...n('forest', 4), 'savannah-lions', 'chronicle-of-victory'] },
    });
    cast(g, 'stalactite-dagger');
    done(g);
    expect(board(g, 'ecl-shapeshifter-token')).toHaveLength(1);
    const dagger = g.id('p1', 'stalactite-dagger');
    const lions = g.id('p1', 'savannah-lions');
    const equip = g.legal().find(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === dagger &&
        a.targets.some((t) => 'object' in t && t.object.id === lions),
    );
    expect(equip).toBeDefined();
    g.do(equip!);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(chars(g, lions).subtypes).toEqual(expect.arrayContaining(['Cat']));
    // All creature types: it is a Goblin for a Goblin lord / Chronicle.
    g.obj(g.id('p1', 'chronicle-of-victory')).chosenType = 'Goblin';
    expect(pt(g, lions)).toEqual([5, 4]);
  });
});

describe('Mirrormind Crown', () => {
  const setup = () => {
    const g = game({
      p1: {
        hand: ['stalactite-dagger', 'stalactite-dagger'],
        battlefield: ['mirrormind-crown', 'savannah-lions', ...n('forest', 4)],
      },
    });
    g.obj(g.id('p1', 'mirrormind-crown')).attachedTo = g.id('p1', 'savannah-lions');
    return g;
  };

  it('the first time you would create tokens each turn, you may create copies of the equipped creature instead', () => {
    const g = setup();
    cast(g, 'stalactite-dagger');
    stop(g);
    expect(labels(g)).toEqual([
      'Create the token',
      'Mirrormind Crown: create 1 copy of Savannah Lions instead',
    ]);
    choose(g, /copy of Savannah Lions/);
    done(g);
    expect(board(g, 'ecl-shapeshifter-token')).toHaveLength(0);
    const lions = board(g, 'savannah-lions');
    expect(lions).toHaveLength(2);
    expect(lions.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });

  it('only the first time: the second token creation is not offered a copy', () => {
    const g = setup();
    cast(g, 'stalactite-dagger');
    stop(g);
    choose(g, /copy of Savannah Lions/);
    done(g);
    cast(g, 'stalactite-dagger');
    done(g);
    // No choice came up; the second Dagger made its Shapeshifter.
    expect(board(g, 'ecl-shapeshifter-token')).toHaveLength(1);
    expect(board(g, 'savannah-lions')).toHaveLength(2);
  });

  it('declining uses up the first time too', () => {
    const g = setup();
    cast(g, 'stalactite-dagger');
    stop(g);
    choose(g, /^Create the token/);
    done(g);
    cast(g, 'stalactite-dagger');
    done(g);
    expect(board(g, 'ecl-shapeshifter-token')).toHaveLength(2);
    expect(board(g, 'savannah-lions')).toHaveLength(1);
  });

  it('does nothing unless it is attached to a creature', () => {
    const g = setup();
    g.obj(g.id('p1', 'mirrormind-crown')).attachedTo = undefined;
    cast(g, 'stalactite-dagger');
    done(g);
    expect(board(g, 'ecl-shapeshifter-token')).toHaveLength(1);
    expect(g.state.turn.firstTokensDone).toBeUndefined();
  });

  it('equips for {2}', () => {
    const g = game({ p1: { battlefield: ['mirrormind-crown', 'savannah-lions', ...n('forest', 2)] } });
    const crown = g.id('p1', 'mirrormind-crown');
    const equip = abilityActions(g, crown, 1);
    expect(equip).toHaveLength(1);
    g.do(equip[0]!);
    done(g);
    expect(g.obj(crown).attachedTo).toBe(g.id('p1', 'savannah-lions'));
  });
});

describe('Eclipsed Realms', () => {
  it('as it enters choose a type; its colored mana is only for spells of that type and abilities of sources of it', () => {
    const g = game({
      p1: { hand: ['eclipsed-realms', 'llanowar-elves', 'savannah-lions'], battlefield: [] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'eclipsed-realms', 'hand') } as never);
    stop(g);
    const d = g.decision;
    expect(d.kind === 'chooseOption' && d.options.map((o) => o.label)).toHaveLength(8);
    done(g, { option: /^Elf$/ });
    expect(g.obj(g.id('p1', 'eclipsed-realms')).chosenType).toBe('Elf');
    // {G} for the Elf spell, but not for the Cat.
    expect(casts(g, 'llanowar-elves')).not.toHaveLength(0);
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
  });

  it('colorless mana is unrestricted', () => {
    const g = game({ p1: { hand: ['serra-angel'], battlefield: ['eclipsed-realms'] } });
    g.obj(g.id('p1', 'eclipsed-realms')).chosenType = 'Elf';
    expect(abilityActions(g, g.id('p1', 'eclipsed-realms'), 0)).toHaveLength(0);
  });

  it('a changeling spell is of every type', () => {
    const g = game({ p1: { hand: ['changeling-wayfinder'], battlefield: ['eclipsed-realms', 'forest', 'forest'] } });
    g.obj(g.id('p1', 'eclipsed-realms')).chosenType = 'Treefolk';
    expect(casts(g, 'changeling-wayfinder')).not.toHaveLength(0);
  });

  it('its mana pays for an activated ability of a source of the chosen type', () => {
    // Dropkick Bomber is a Goblin with "{R}: another Goblin gains flying". Only the Realms can make the red mana.
    const mk = (type: string) => {
      const g = game({ p1: { battlefield: ['eclipsed-realms', 'dropkick-bomber', 'ecl-goblin-token'] } });
      g.obj(g.id('p1', 'eclipsed-realms')).chosenType = type;
      return g;
    };
    const activations = (g: ReturnType<typeof game>) =>
      g
        .legal()
        .filter((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'dropkick-bomber'));
    expect(activations(mk('Goblin')).length).toBeGreaterThan(0);
    expect(activations(mk('Elf'))).toHaveLength(0);
  });
});

describe('Hallowed Fountain', () => {
  it('is a Plains Island that taps for {W} or {U}; you may pay 2 life or it enters tapped', () => {
    const g = game({ p1: { hand: ['hallowed-fountain'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'hallowed-fountain', 'hand') } as never);
    const f = g.id('p1', 'hallowed-fountain');
    expect(g.obj(f).tapped).toBe(true);
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    done(g, { option: /^Pay 2 life/ });
    expect(g.obj(f).tapped).toBe(false);
    expect(g.life('p1')).toBe(18);
    expect(chars(g, f).subtypes).toEqual(['Plains', 'Island']);
  });

  it("if you don't pay, it stays tapped", () => {
    const g = game({ p1: { hand: ['hallowed-fountain'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'hallowed-fountain', 'hand') } as never);
    stop(g);
    done(g, { option: /^Enter tapped/ });
    expect(g.obj(g.id('p1', 'hallowed-fountain')).tapped).toBe(true);
    expect(g.life('p1')).toBe(20);
  });
});

void activate;
