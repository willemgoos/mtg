import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, deckById, deckIds, ECL_THEME_DECKS, SCRYFALL } from '../src/index.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  done,
  exile,
  game,
  gy,
  hand,
  n,
  passTo,
  pt,
} from './ecl-special-helpers.ts';

// Lorwyn Eclipsed 18c: Arena's Theme Decks (Pirates and Angels) and the cards they needed.

const NAMES = [
  'Captain Howler, Sea Scourge',
  'Fearless Swashbuckler',
  'Inti, Seneschal of the Sun',
  'Marauding Mako',
  'Scrounging Skyray',
  'Spyglass Siren',
  'Staunch Crewmate',
  'Broadside Barrage',
  'Gastal Thrillroller',
  'Subterranean Schooner',
  'Magmatic Galleon',
  'Lightstall Inquisitor',
  'Starfield Shepherd',
  'Get Lost',
  "Ride's End",
  'Split Up',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Cast = Extract<Action, { type: 'castSpell' }>;
const cast = (g: GameDriver, defId: string, pick?: (a: Cast) => boolean) => {
  const all = casts(g, defId, g.actor);
  const a = (pick ? all.find(pick) : undefined) ?? all[0];
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const onObject = (id: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
/** Crews a Vehicle (its crew ability) with this creature. */
const crewWith = (g: GameDriver, vehicle: string, abilityIndex: number, creature: string) =>
  activate(g, vehicle, abilityIndex, [], { tapCreatures: [creature] });
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const ready = (g: GameDriver, ...ids: string[]) => {
  for (const id of ids) g.state.objects[id]!.summoningSick = false;
};
/** Declares attackers (everyone attacks the player). */
const attackWith = (g: GameDriver, attackers: string[]) => {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
};
/** Gets through blocks and damage to the second main phase. */
const toMain2 = (g: GameDriver, opts: Parameters<typeof done>[1] = {}) => {
  for (let i = 0; i < 60 && g.state.turn.step !== 'main2'; i++) {
    const d = g.decision;
    if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g, opts);
  }
};

describe('the Theme Decks are in the pool', () => {
  it('every new card exists, with its Scryfall printing', () => {
    for (const name of NAMES) {
      expect(cardDb.get(idOf(name)), name).toBeDefined();
      const c = SCRYFALL.find((x) => x.name === name)!;
      expect(['dft', 'lci', 'eoe', 'dsk'], name).toContain(c.set);
    }
    expect(cardDb.get('map-token')).toBeDefined();
  });
});

describe('Marauding Mako and Scrounging Skyray', () => {
  it('cycling {2} draws a card, and a discard puts that many counters on Mako', () => {
    const g = game({
      p1: {
        hand: ['scrounging-skyray'],
        battlefield: ['marauding-mako', ...n('island', 2)],
        library: ['plains', 'forest'],
      },
    });
    const mako = g.id('p1', 'marauding-mako');
    const cycle = abilityActions(g, g.id('p1', 'scrounging-skyray', 'hand'), 1);
    expect(cycle).toHaveLength(1);
    g.do(cycle[0]!);
    done(g);
    expect(gy(g)).toEqual(['scrounging-skyray']);
    expect(hand(g)).toEqual(['plains']);
    expect(counters(g, mako)).toBe(1);
    expect(pt(g, mako)).toEqual([2, 2]);
  });

  it('two cards discarded together give two counters (one trigger, "that many")', () => {
    // Fearless Swashbuckler: "draw three cards, then discard two cards".
    const g = game({
      p1: {
        battlefield: [
          'marauding-mako',
          'fearless-swashbuckler',
          'subterranean-schooner',
          'spyglass-siren',
        ],
        library: n('forest', 8),
      },
    });
    const mako = g.id('p1', 'marauding-mako');
    ready(g, g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner'));
    // The Siren crews the Schooner; the Swashbuckler (a Pirate) and the Schooner (a Vehicle) attack.
    crewWith(g, g.id('p1', 'subterranean-schooner'), 1, g.id('p1', 'spyglass-siren'));
    done(g);
    attackWith(g, [g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner')]);
    toMain2(g);
    expect(counters(g, mako)).toBe(2);
  });
});

describe('Captain Howler, Sea Scourge', () => {
  it('has ward—{2} and 2 life', () => {
    expect(cardDb.get('captain-howler-sea-scourge')!.wardCost).toEqual({
      mana: { generic: 2, colored: {} },
      life: 2,
    });
  });

  it('a discard gives +2/+0 per card discarded; it draws a card when that creature connects', () => {
    const g = game({
      p1: {
        hand: ['broadside-barrage'],
        battlefield: ['captain-howler-sea-scourge', ...n('island', 2), 'mountain', 'mountain'],
        library: n('forest', 6),
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const howler = g.id('p1', 'captain-howler-sea-scourge');
    const bear = g.id('p2', 'bear-cub');
    ready(g, howler);
    cast(g, 'broadside-barrage', targeting(bear));
    // The loot's discard sets off Howler: it targets itself.
    done(g, { target: onObject(howler) });
    expect(pt(g, howler)).toEqual([7, 4]);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    const before = g.state.players.p1.hand.length;
    attackWith(g, [howler]);
    toMain2(g);
    expect(g.life('p2')).toBe(13);
    expect(g.state.players.p1.hand.length).toBe(before + 1);
  });

  it('two cards discarded together give +4/+0', () => {
    const g = game({
      p1: {
        battlefield: [
          'captain-howler-sea-scourge',
          'fearless-swashbuckler',
          'subterranean-schooner',
          'spyglass-siren',
        ],
        library: n('forest', 8),
      },
    });
    const howler = g.id('p1', 'captain-howler-sea-scourge');
    ready(g, g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner'));
    crewWith(g, g.id('p1', 'subterranean-schooner'), 1, g.id('p1', 'spyglass-siren'));
    done(g);
    attackWith(g, [g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner')]);
    toMain2(g, { target: onObject(howler) });
    expect(pt(g, howler)).toEqual([9, 4]);
  });
});

describe('Fearless Swashbuckler', () => {
  it('gives your Vehicles haste', () => {
    const g = game({ p1: { battlefield: ['fearless-swashbuckler', 'gastal-thrillroller'] } });
    expect(chars(g, g.id('p1', 'gastal-thrillroller')).keywords).toContain('haste');
    const g2 = game({ p1: { battlefield: ['subterranean-schooner'] } });
    expect(chars(g2, g2.id('p1', 'subterranean-schooner')).keywords).not.toContain('haste');
    // Not your opponent's Vehicles.
    const g3 = game({
      p1: { battlefield: ['fearless-swashbuckler'] },
      p2: { battlefield: ['subterranean-schooner'] },
    });
    expect(chars(g3, g3.id('p2', 'subterranean-schooner')).keywords).not.toContain('haste');
  });

  it('a Pirate and a Vehicle attacking: draw three, then discard two', () => {
    const g = game({
      p1: {
        battlefield: ['fearless-swashbuckler', 'subterranean-schooner', 'spyglass-siren'],
        library: n('forest', 8),
      },
    });
    ready(g, g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner'));
    crewWith(g, g.id('p1', 'subterranean-schooner'), 1, g.id('p1', 'spyglass-siren'));
    done(g);
    attackWith(g, [g.id('p1', 'fearless-swashbuckler'), g.id('p1', 'subterranean-schooner')]);
    toMain2(g);
    // Three cards drawn, two discarded (and the Schooner's explorer found a land).
    expect(g.state.players.p1.graveyard.length).toBe(2);
    expect(g.state.players.p1.hand.length).toBe(2);
  });

  it('nothing happens when only a Pirate attacks', () => {
    const g = game({
      p1: { battlefield: ['fearless-swashbuckler'], library: n('forest', 8) },
    });
    attackWith(g, [g.id('p1', 'fearless-swashbuckler')]);
    toMain2(g);
    expect(g.state.players.p1.hand.length).toBe(0);
  });

  it('nothing happens when only a Vehicle attacks', () => {
    const g = game({
      p1: {
        battlefield: ['fearless-swashbuckler', 'subterranean-schooner', 'spyglass-siren'],
        library: n('forest', 8),
      },
    });
    ready(g, g.id('p1', 'subterranean-schooner'));
    crewWith(g, g.id('p1', 'subterranean-schooner'), 1, g.id('p1', 'spyglass-siren'));
    done(g);
    attackWith(g, [g.id('p1', 'subterranean-schooner')]);
    toMain2(g);
    expect(g.state.players.p1.graveyard.length).toBe(0);
    expect(g.state.players.p1.hand.length).toBe(1); // only the explore
  });
});

describe('Inti, Seneschal of the Sun', () => {
  it('attacking: discard a card to put a +1/+1 counter and trample on an attacking creature, and exile the top card to play', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: ['inti-seneschal-of-the-sun', 'fearless-swashbuckler'],
        library: ['island', 'forest', 'forest'],
      },
    });
    const inti = g.id('p1', 'inti-seneschal-of-the-sun');
    const swash = g.id('p1', 'fearless-swashbuckler');
    ready(g, inti);
    attackWith(g, [inti, swash]);
    // "You may discard a card": yes, then the counter's target.
    done(g, { target: onObject(swash) });
    expect(gy(g)).toEqual(['mountain']);
    expect(counters(g, swash)).toBe(1);
    expect(chars(g, swash).keywords).toContain('trample');
    // The discard exiled the top card of the library; it can be played until the end step.
    expect(exile(g)).toEqual(['island']);
    expect(g.state.objects[g.id('p1', 'island', 'exile')]!.playableUntilTurn).toBe(
      g.state.turn.number,
    );
  });

  it('declining the discard does nothing', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: ['inti-seneschal-of-the-sun'],
        library: ['island'],
      },
    });
    const inti = g.id('p1', 'inti-seneschal-of-the-sun');
    ready(g, inti);
    attackWith(g, [inti]);
    done(g, { accept: false });
    expect(hand(g)).toEqual(['mountain']);
    expect(counters(g, inti)).toBe(0);
    expect(exile(g)).toEqual([]);
  });

  it('with an empty hand there is nothing to discard', () => {
    const g = game({
      p1: { battlefield: ['inti-seneschal-of-the-sun'], library: ['island'] },
    });
    const inti = g.id('p1', 'inti-seneschal-of-the-sun');
    ready(g, inti);
    attackWith(g, [inti]);
    done(g);
    expect(counters(g, inti)).toBe(0);
    expect(exile(g)).toEqual([]);
  });
});

describe('Spyglass Siren and the Map token', () => {
  it('flies and makes a Map; the Map explores a creature you control, as a sorcery', () => {
    const g = game({
      p1: {
        hand: ['spyglass-siren'],
        battlefield: ['island', 'island', 'bear-cub'],
        library: ['forest', 'plains'],
      },
    });
    cast(g, 'spyglass-siren');
    done(g);
    const siren = g.id('p1', 'spyglass-siren');
    expect(chars(g, siren).keywords).toContain('flying');
    const map = g.id('p1', 'map-token');
    expect(chars(g, map).subtypes).toContain('Map');
    const bear = g.id('p1', 'bear-cub');
    const explores = abilityActions(g, map, 0).filter((a) => a.type === 'activateAbility');
    expect(explores.length).toBeGreaterThan(0);
    // Explore a land: it goes to the hand.
    g.do(
      explores.find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      )!,
    );
    done(g);
    expect(g.state.battlefield.includes(map)).toBe(false);
    expect(hand(g)).toEqual(['forest']);
    expect(counters(g, bear)).toBe(0);
  });
});

describe('explore', () => {
  it('a nonland card: a +1/+1 counter, and the card goes back on top or into the graveyard', () => {
    const run = (toGraveyard: boolean) => {
      const g = game({
        p1: {
          hand: ['spyglass-siren'],
          battlefield: ['island', 'island', 'island', 'bear-cub'],
          library: ['llanowar-elves', 'forest'],
        },
      });
      cast(g, 'spyglass-siren');
      done(g);
      const map = g.id('p1', 'map-token');
      const bear = g.id('p1', 'bear-cub');
      g.do(
        abilityActions(g, map, 0).find(
          (a) =>
            a.type === 'activateAbility' &&
            a.targets.some((t) => 'object' in t && t.object.id === bear),
        )!,
      );
      // Resolve until the explore question.
      for (let i = 0; i < 10 && g.decision.kind === 'priority' && g.state.stack.length; i++)
        g.pass();
      expect(g.decision.kind).toBe('scry');
      const d = g.decision as Extract<typeof g.decision, { kind: 'scry' }>;
      expect(d.explore).toBe(true);
      expect(counters(g, bear)).toBe(1);
      const answers = g.legal().filter((a) => a.type === 'scry') as Extract<
        Action,
        { type: 'scry' }
      >[];
      expect(answers).toHaveLength(2);
      g.do(answers.find((a) => a.bottom.length > 0 === toGraveyard)!);
      done(g);
      return g;
    };
    const keep = run(false);
    expect(gy(keep)).toEqual([]);
    expect(keep.state.players.p1.library.map((id) => keep.obj(id).defId)).toEqual([
      'llanowar-elves',
      'forest',
    ]);
    const bin = run(true);
    expect(gy(bin)).toEqual(['llanowar-elves']);
    expect(bin.state.players.p1.library.map((id) => bin.obj(id).defId)).toEqual(['forest']);
  });

  it("isn't a surveil", () => {
    const g = game({
      p1: {
        hand: ['spyglass-siren'],
        battlefield: ['island', 'island', 'island', 'bear-cub'],
        library: ['llanowar-elves'],
      },
    });
    cast(g, 'spyglass-siren');
    done(g);
    const map = g.id('p1', 'map-token');
    g.do(abilityActions(g, map, 0)[0]!);
    for (let i = 0; i < 10 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    done(g);
    expect(g.state.turn.scriedOrSurveilled ?? []).toEqual([]);
  });
});

describe('Staunch Crewmate', () => {
  it('looks at four, takes an artifact or Pirate, the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['staunch-crewmate'],
        battlefield: ['island', 'island'],
        library: ['forest', 'plains', 'subterranean-schooner', 'island', 'mountain'],
      },
    });
    cast(g, 'staunch-crewmate');
    done(g, { card: (id) => g.obj(id).defId === 'subterranean-schooner' });
    expect(hand(g)).toEqual(['subterranean-schooner']);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(4);
    expect(lib[0]).toBe('mountain');
    expect(lib.slice(1).sort()).toEqual(['forest', 'island', 'plains']);
  });

  it('can take a Pirate creature card', () => {
    const g = game({
      p1: {
        hand: ['staunch-crewmate'],
        battlefield: ['island', 'island'],
        library: ['forest', 'spyglass-siren', 'plains', 'island'],
      },
    });
    cast(g, 'staunch-crewmate');
    done(g, { card: (id) => g.obj(id).defId === 'spyglass-siren' });
    expect(hand(g)).toEqual(['spyglass-siren']);
  });
});

describe('Broadside Barrage', () => {
  it('deals 5 damage to a creature or planeswalker, then draws and discards', () => {
    const g = game({
      p1: {
        hand: ['broadside-barrage', 'mountain'],
        battlefield: ['island', 'mountain', 'mountain'],
        library: ['plains'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const targets = casts(g, 'broadside-barrage', 'p1').map((a) => a.targets);
    expect(targets.length).toBeGreaterThan(0);
    cast(g, 'broadside-barrage');
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    expect(hand(g).length).toBe(1);
    expect(gy(g)).toContain('broadside-barrage');
    expect(gy(g).length).toBe(2);
  });

  it("can't target a player", () => {
    const g = game({
      p1: { hand: ['broadside-barrage'], battlefield: ['island', 'mountain', 'mountain'] },
    });
    expect(casts(g, 'broadside-barrage', 'p1')).toHaveLength(0);
  });
});

describe('Gastal Thrillroller', () => {
  it('enters as an artifact creature until end of turn, with trample and haste', () => {
    const g = game({ p1: { hand: ['gastal-thrillroller'], battlefield: n('mountain', 3) } });
    cast(g, 'gastal-thrillroller');
    done(g);
    const v = g.id('p1', 'gastal-thrillroller');
    expect(chars(g, v).types).toContain('Creature');
    expect(chars(g, v).keywords).toContain('haste');
    expect(chars(g, v).keywords).toContain('trample');
    expect(pt(g, v)).toEqual([4, 2]);
  });

  it('returns from the graveyard with a finality counter for {2}{R} and a discard, as a sorcery', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        graveyard: ['gastal-thrillroller'],
        battlefield: n('mountain', 3),
      },
    });
    const acts = abilityActions(g, g.id('p1', 'gastal-thrillroller', 'graveyard'), 2);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    const v = g.id('p1', 'gastal-thrillroller');
    expect(g.obj(v).zone).toBe('battlefield');
    expect(g.obj(v).counters?.finality).toBe(1);
    expect(gy(g)).toEqual(['mountain']);
  });

  it('can only return as a sorcery', () => {
    const g = game({
      p1: { hand: ['mountain'], graveyard: ['gastal-thrillroller'], battlefield: n('mountain', 3) },
      active: 'p2',
    });
    expect(abilityActions(g, g.id('p1', 'gastal-thrillroller', 'graveyard'), 2)).toHaveLength(0);
  });
});

describe('Subterranean Schooner', () => {
  it('crew 1; when it attacks, a creature that crewed it explores', () => {
    const g = game({
      p1: {
        battlefield: ['subterranean-schooner', 'bear-cub', 'spyglass-siren'],
        library: ['plains', 'forest'],
      },
    });
    const schooner = g.id('p1', 'subterranean-schooner');
    const siren = g.id('p1', 'spyglass-siren');
    ready(g, schooner);
    crewWith(g, schooner, 1, g.id('p1', 'spyglass-siren'));
    done(g);
    expect(g.obj(siren).tapped).toBe(true);
    expect(chars(g, schooner).types).toContain('Creature');
    attackWith(g, [schooner]);
    done(g);
    // A land: to hand.
    expect(hand(g)).toEqual(['plains']);
    toMain2(g);
  });

  it('can only target a creature that crewed it this turn', () => {
    const g = game({
      p1: {
        battlefield: ['subterranean-schooner', 'bear-cub', 'spyglass-siren'],
        library: ['llanowar-elves', 'forest'],
      },
    });
    const schooner = g.id('p1', 'subterranean-schooner');
    const bear = g.id('p1', 'bear-cub');
    const siren = g.id('p1', 'spyglass-siren');
    ready(g, schooner);
    crewWith(g, schooner, 1, g.id('p1', 'spyglass-siren'));
    done(g);
    attackWith(g, [schooner]);
    // The trigger's only legal target is the creature that crewed it.
    const d = g.decision;
    expect(d.kind).toBe('chooseTriggerTargets');
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(picks.length).toBeGreaterThan(0);
    for (const a of picks)
      if (a.type === 'chooseTargets')
        for (const t of a.targets) if ('object' in t) expect([siren, bear]).toContain(t.object.id);
    const targets = picks.flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []));
    expect(targets.some((t) => 'object' in t && t.object.id === bear)).toBe(false);
    expect(targets.some((t) => 'object' in t && t.object.id === siren)).toBe(true);
  });
});

describe('Crew', () => {
  it('offers each smallest set of creatures that reach the crew power, and taps the ones chosen', () => {
    const g = game({
      p1: {
        battlefield: [
          'magmatic-galleon',
          'llanowar-elves',
          'llanowar-elves',
          'savannah-lions',
          'bear-cub',
        ],
      },
    });
    const galleon = g.id('p1', 'magmatic-galleon');
    const ways = abilityActions(g, galleon, 2).map((a) =>
      a.type === 'activateAbility'
        ? (a.tapCreatures ?? []).map((id) => g.obj(id).defId).sort()
        : [],
    );
    // Crew 2: a Savannah Lions or a Bear Cub alone, or two Llanowar Elves; never an extra creature.
    expect(ways).toEqual(
      expect.arrayContaining([
        ['savannah-lions'],
        ['bear-cub'],
        ['llanowar-elves', 'llanowar-elves'],
      ]),
    );
    expect(ways).toHaveLength(3);
    const elves = g.state.battlefield.filter((id) => g.obj(id).defId === 'llanowar-elves');
    activate(g, galleon, 2, [], { tapCreatures: elves });
    expect(g.obj(elves[0]!).tapped && g.obj(elves[1]!).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(false);
    done(g);
    expect(chars(g, galleon).types).toContain('Creature');
  });

  it("can't be crewed without enough power, or by tapped creatures", () => {
    const g = game({
      p1: {
        battlefield: ['magmatic-galleon', 'llanowar-elves', { card: 'bear-cub', tapped: true }],
      },
    });
    expect(abilityActions(g, g.id('p1', 'magmatic-galleon'), 2)).toHaveLength(0);
  });
});

describe('Magmatic Galleon', () => {
  it('deals 5 damage to a creature an opponent controls as it enters; excess noncombat damage makes a Treasure', () => {
    const g = game({
      p1: { hand: ['magmatic-galleon'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'magmatic-galleon');
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    // 5 damage to a 2/2: excess, so a Treasure — dealt after the Galleon entered.
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
  });

  it('no Treasure when the damage is not more than lethal', () => {
    const g = game({
      p1: { hand: ['magmatic-galleon'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['rampaging-baloths'] },
    });
    cast(g, 'magmatic-galleon');
    done(g);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'rampaging-baloths')).damage).toBe(5);
  });

  it('is crewed with crew 2, and other noncombat damage counts (Burst Lightning kicked on a 1/1... at all)', () => {
    const g = game({
      p1: { hand: ['burst-lightning'], battlefield: ['magmatic-galleon', 'mountain'] },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
    cast(g, 'burst-lightning', targeting(g.id('p2', 'savannah-lions')));
    done(g);
    // 2 damage to a 2/1: 1 excess.
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
  });

  it("combat damage doesn't count", () => {
    const g = game({
      p1: { battlefield: ['magmatic-galleon', 'bear-cub'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    ready(g, g.id('p1', 'bear-cub'));
    attackWith(g, [g.id('p1', 'bear-cub')]);
    for (let i = 0; i < 60 && g.state.turn.step !== 'main2'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers')
        g.do({
          type: 'addBlock',
          player: d.player,
          blocker: g.id('p2', 'savannah-lions'),
          attacker: g.id('p1', 'bear-cub'),
        });
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });
});

describe('Lightstall Inquisitor', () => {
  it('vigilance; the opponent exiles a card from their hand and may play it, for {1} more, lands tapped', () => {
    const g = game({
      p1: { hand: ['lightstall-inquisitor'], battlefield: ['plains'] },
      p2: { hand: ['mountain', 'bear-cub'], battlefield: n('forest', 3) },
    });
    cast(g, 'lightstall-inquisitor');
    stopAtChoice(g);
    // The opponent chooses: it's their decision.
    expect(g.decision.kind).toBe('chooseFromHand');
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseFromHand' }>;
    expect(d.player).toBe('p2');
    expect(d.from).toBe('p2');
    const choose = g
      .legal('p2')
      .find((a) => a.type === 'chooseCard' && a.card === g.id('p2', 'bear-cub', 'hand'))!;
    g.do(choose);
    expect(exile(g, 'p2')).toEqual(['bear-cub']);
    expect(chars(g, g.id('p1', 'lightstall-inquisitor')).keywords).toContain('vigilance');
    // On their turn they may cast it from exile for {1} more ({1}{G} -> {2}{G}).
    const bear = g.id('p2', 'bear-cub', 'exile');
    g.state.turn.activePlayer = 'p2';
    g.state.turn.step = 'main1';
    g.state.decision = { kind: 'priority', player: 'p2' };
    const twoLands = g.legal('p2').filter((a) => a.type === 'castSpell' && a.card === bear);
    expect(twoLands.length).toBeGreaterThan(0);
  });

  it('the cost is {1} more: three lands can cast a 3-mana version only', () => {
    const g = game({
      p1: { hand: ['lightstall-inquisitor'], battlefield: ['plains'] },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 2) },
    });
    cast(g, 'lightstall-inquisitor');
    stopAtChoice(g);
    g.do(g.legal('p2')[0]!);
    g.state.turn.activePlayer = 'p2';
    g.state.turn.step = 'main1';
    g.state.decision = { kind: 'priority', player: 'p2' };
    const bear = g.id('p2', 'bear-cub', 'exile');
    // Bear Cub costs {1}{G}; with the tax {2}{G}: two forests are not enough.
    expect(g.legal('p2').filter((a) => a.type === 'castSpell' && a.card === bear)).toHaveLength(0);
    const g2 = game({
      p1: { hand: ['lightstall-inquisitor'], battlefield: ['plains'] },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 3) },
    });
    cast(g2, 'lightstall-inquisitor');
    stopAtChoice(g2);
    g2.do(g2.legal('p2')[0]!);
    g2.state.turn.activePlayer = 'p2';
    g2.state.turn.step = 'main1';
    g2.state.decision = { kind: 'priority', player: 'p2' };
    const bear2 = g2.id('p2', 'bear-cub', 'exile');
    const cast2 = g2.legal('p2').filter((a) => a.type === 'castSpell' && a.card === bear2);
    expect(cast2.length).toBeGreaterThan(0);
    g2.do(cast2[0]!);
    done(g2);
    expect(g2.state.battlefield.some((id) => g2.obj(id).defId === 'bear-cub')).toBe(true);
    expect(
      g2.state.battlefield.filter((id) => g2.obj(id).defId === 'forest' && g2.obj(id).tapped),
    ).toHaveLength(3);
  });

  it('a land played from exile enters tapped', () => {
    const g = game({
      p1: { hand: ['lightstall-inquisitor'], battlefield: ['plains'] },
      p2: { hand: ['mountain'] },
    });
    cast(g, 'lightstall-inquisitor');
    stopAtChoice(g);
    g.do(g.legal('p2')[0]!);
    expect(exile(g, 'p2')).toEqual(['mountain']);
    g.state.turn.activePlayer = 'p2';
    g.state.turn.step = 'main1';
    g.state.decision = { kind: 'priority', player: 'p2' };
    const land = g.id('p2', 'mountain', 'exile');
    const play = g.legal('p2').find((a) => a.type === 'playLand' && a.card === land);
    expect(play).toBeDefined();
    g.do(play!);
    expect(g.obj(land).zone).toBe('battlefield');
    expect(g.obj(land).tapped).toBe(true);
  });

  it('nothing happens when the opponent has no cards in hand', () => {
    const g = game({ p1: { hand: ['lightstall-inquisitor'], battlefield: ['plains'] } });
    cast(g, 'lightstall-inquisitor');
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(exile(g, 'p2')).toEqual([]);
  });
});

/** Passes priority until a decision other than priority comes up. */
function stopAtChoice(g: GameDriver): void {
  for (let i = 0; i < 20 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
}

describe('Starfield Shepherd', () => {
  it('flies; searches for a basic Plains or a creature with mana value 1 or less', () => {
    const g = game({
      p1: {
        hand: ['starfield-shepherd'],
        battlefield: n('plains', 5),
        library: ['forest', 'llanowar-elves', 'plains', 'bear-cub'],
      },
    });
    const picks = (g2: GameDriver) =>
      g2
        .legal()
        .filter((a) => a.type === 'chooseCard' && a.card)
        .map((a) => (a.type === 'chooseCard' ? g2.obj(a.card!).defId : ''));
    cast(g, 'starfield-shepherd', (a) => !a.via && a.kicked !== true);
    stopAtChoice(g);
    // Trigger resolves into a search.
    for (let i = 0; i < 10 && g.decision.kind !== 'searchLibrary'; i++) done(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = picks(g);
    expect(options.sort()).toEqual(['llanowar-elves', 'plains']);
    expect(chars(g, g.id('p1', 'starfield-shepherd')).keywords).toContain('flying');
  });

  it('Warp {1}{W}: cast for the warp cost, exiled at the next end step, castable from exile later', () => {
    const g = game({
      p1: {
        hand: ['starfield-shepherd'],
        battlefield: n('plains', 5),
        library: ['plains', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    const warp = casts(g, 'starfield-shepherd', 'p1').find((a) => a.kicked);
    expect(warp).toBeDefined();
    g.do(warp!);
    done(g);
    expect(hand(g).length).toBe(1);
    const shepherd = g.id('p1', 'starfield-shepherd');
    expect(g.obj(shepherd).zone).toBe('battlefield');
    // At the end step it is exiled.
    for (let i = 0; i < 40 && g.obj(shepherd).zone === 'battlefield'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.obj(shepherd).zone).toBe('exile');
    expect(g.obj(shepherd).owner).toBe('p1');
    // On a later turn it can be cast from exile for its mana cost {3}{W}{W}, without warp.
    passTo(g, 'main1', 'p1');
    const fromExile = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === shepherd) as Cast[];
    expect(fromExile.length).toBeGreaterThan(0);
    expect(fromExile.every((a) => !a.kicked)).toBe(true);
  });
});

describe('Get Lost', () => {
  it('destroys a creature, enchantment or planeswalker; its controller creates two Maps', () => {
    const g = game({
      p1: { hand: ['get-lost'], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'get-lost', targeting(g.id('p2', 'bear-cub')));
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    expect(board(g, 'map-token', 'p2')).toHaveLength(2);
    expect(board(g, 'map-token', 'p1')).toHaveLength(0);
  });

  it('on your own permanent, you get the Maps', () => {
    const g = game({
      p1: { hand: ['get-lost'], battlefield: [...n('plains', 2), 'bear-cub'] },
    });
    cast(g, 'get-lost', targeting(g.id('p1', 'bear-cub')));
    done(g);
    expect(board(g, 'map-token', 'p1')).toHaveLength(2);
  });

  it("can't target a land or artifact", () => {
    const g = game({
      p1: { hand: ['get-lost'], battlefield: n('plains', 2) },
      p2: { battlefield: ['subterranean-schooner', 'mountain'] },
    });
    expect(casts(g, 'get-lost', 'p1').filter(targeting(g.id('p2', 'mountain')))).toHaveLength(0);
    expect(
      casts(g, 'get-lost', 'p1').filter(targeting(g.id('p2', 'subterranean-schooner'))),
    ).toHaveLength(0);
  });
});

describe("Ride's End", () => {
  it('exiles a creature or a Vehicle (a Vehicle that is not a creature too)', () => {
    const g = game({
      p1: { hand: ['rides-end'], battlefield: n('plains', 5) },
      p2: { battlefield: ['subterranean-schooner', 'bear-cub', 'mountain'] },
    });
    const ts = casts(g, 'rides-end', 'p1');
    expect(ts.some(targeting(g.id('p2', 'subterranean-schooner')))).toBe(true);
    expect(ts.some(targeting(g.id('p2', 'bear-cub')))).toBe(true);
    expect(ts.some(targeting(g.id('p2', 'mountain')))).toBe(false);
    cast(g, 'rides-end', targeting(g.id('p2', 'subterranean-schooner')));
    done(g);
    expect(exile(g, 'p2')).toEqual(['subterranean-schooner']);
  });

  it('costs {3} less (two mana) when it targets a tapped permanent', () => {
    const tapped = game({
      p1: { hand: ['rides-end'], battlefield: n('plains', 2) },
      p2: { battlefield: [{ card: 'bear-cub', tapped: true }] },
    });
    expect(casts(tapped, 'rides-end', 'p1').length).toBeGreaterThan(0);
    const untapped = game({
      p1: { hand: ['rides-end'], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(casts(untapped, 'rides-end', 'p1')).toHaveLength(0);
    const full = game({
      p1: { hand: ['rides-end'], battlefield: n('plains', 5) },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(casts(full, 'rides-end', 'p1').length).toBeGreaterThan(0);
    tapped.do(casts(tapped, 'rides-end', 'p1')[0]!);
    done(tapped);
    expect(exile(tapped, 'p2')).toEqual(['bear-cub']);
  });
});

describe('Split Up', () => {
  it('destroys all tapped creatures, or all untapped creatures', () => {
    const setup = () =>
      game({
        p1: {
          hand: ['split-up'],
          battlefield: [...n('plains', 3), { card: 'bear-cub', tapped: true }, 'savannah-lions'],
        },
        p2: { battlefield: [{ card: 'llanowar-elves', tapped: true }, 'bear-cub'] },
      });
    const tappedMode = setup();
    const modes = casts(tappedMode, 'split-up', 'p1');
    expect(modes.map((a) => a.mode).sort()).toEqual([0, 1]);
    tappedMode.do(modes.find((a) => a.mode === 0)!);
    done(tappedMode);
    const left = (g: GameDriver) =>
      g.state.battlefield
        .filter((id) => getCharacteristics(g.state, cardDb, id).types.includes('Creature'))
        .map((id) => g.obj(id).defId + ':' + g.obj(id).controller);
    expect(left(tappedMode).sort()).toEqual(['bear-cub:p2', 'savannah-lions:p1']);
    const untappedMode = setup();
    untappedMode.do(casts(untappedMode, 'split-up', 'p1').find((a) => a.mode === 1)!);
    done(untappedMode);
    expect(left(untappedMode).sort()).toEqual(['bear-cub:p1', 'llanowar-elves:p2']);
  });
});

describe('the Theme Decks', () => {
  it('are two 60-card Arena decks of implemented cards, shown with the Lorwyn Eclipsed decks', () => {
    expect(ECL_THEME_DECKS.map((d) => d.name)).toEqual(['Pirates', 'Angels']);
    for (const d of ECL_THEME_DECKS) {
      expect(d.source).toBe('arena');
      expect(d.set).toBe('ecl');
      expect(
        d.cards.reduce((k, [, c]) => k + c, 0),
        d.id,
      ).toBe(60);
      for (const id of deckIds(d)) expect(cardDb.has(id), id).toBe(true);
      expect(deckById(d.id)).toBe(d);
      // Four copies at most of anything but a basic land.
      for (const [name, count] of d.cards)
        if (!['Plains', 'Island', 'Mountain', 'Forest'].includes(name))
          expect(count, name).toBeLessThanOrEqual(4);
    }
  });

  it('Pirates is blue-red, Angels green-white', () => {
    expect(deckById('ecl-theme-pirates').colors).toEqual(['U', 'R']);
    expect(deckById('ecl-theme-angels').colors).toEqual(['W', 'G']);
  });
});
