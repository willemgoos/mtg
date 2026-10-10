import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { createEngine, type CardDefinition } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
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
  stop,
} from './ecl-special-helpers.ts';

// Tarkir: Dragonstorm 19b: the colourless group (artifacts, Monuments, Ugin and nonbasic lands).

const NAMES = [
  'Abzan Monument',
  'Boulderborn Dragon',
  'Cori Mountain Monastery',
  'Dalkovan Encampment',
  'Dragonfire Blade',
  'Dragonstorm Globe',
  'Embermouth Sentinel',
  'Jade-Cast Sentinel',
  'Jeskai Monument',
  'Kishla Village',
  'Maelstrom of the Spirit Dragon',
  'Mardu Monument',
  'Mistrise Village',
  'Mox Jasper',
  'Opulent Palace',
  'Sandsteppe Citadel',
  'Sultai Monument',
  'Temur Monument',
  'Ugin, Eye of the Storms',
  'Watcher of the Wayside',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

const cast = (
  g: Game,
  defId: string,
  pick?: (a: CastAction) => boolean,
  p: 'p1' | 'p2' = 'p1',
): Game => {
  const a = casts(g, defId, p).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const targets =
  (g: Game, defId: string) =>
  (a: { targets: CastAction['targets'] }): boolean =>
    a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === defId);
const librarySearch = (g: Game, defId: string) =>
  done(g, { card: (id) => g.obj(id).defId === defId });

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) expect(cardDb.get(idOf(name)), name).toBeDefined();
  });
});

describe('Monuments', () => {
  const MONUMENTS: [string, string[], string[], string][] = [
    ['abzan-monument', ['plains', 'swamp', 'forest'], ['island', 'mountain'], '{1}{W}{B}{G}'],
    ['jeskai-monument', ['island', 'mountain', 'plains'], ['swamp', 'forest'], '{1}{U}{R}{W}'],
    ['mardu-monument', ['mountain', 'plains', 'swamp'], ['island', 'forest'], '{2}{R}{W}{B}'],
    ['sultai-monument', ['swamp', 'forest', 'island'], ['plains', 'mountain'], '{2}{B}{G}{U}'],
    ['temur-monument', ['forest', 'island', 'mountain'], ['plains', 'swamp'], '{3}{G}{U}{R}'],
  ];

  for (const [id, yes, no] of MONUMENTS) {
    it(`${id}: when it enters, search for a basic land of its three types (not the other two), reveal it, put it into your hand`, () => {
      const g = game({
        p1: { hand: [id], battlefield: n('forest', 2), library: [...yes, ...no] },
      });
      cast(g, id);
      stop(g);
      expect(g.decision.kind).toBe('searchLibrary');
      const offered = (g.decision as { options: string[] }).options.map((o) => g.obj(o).defId);
      expect(new Set(offered)).toEqual(new Set(yes));
      expect(offered.some((d) => no.includes(d))).toBe(false);
      librarySearch(g, yes[1]!);
      expect(hand(g)).toEqual([yes[1]]);
    });

    it(`${id}: its activated ability can only be used as a sorcery`, () => {
      const g = game({
        p1: {
          battlefield: [
            id,
            ...n('plains', 2),
            ...n('swamp', 2),
            ...n('forest', 2),
            ...n('island', 2),
            ...n('mountain', 2),
          ],
        },
        p2: {},
      });
      const monument = g.id('p1', id);
      expect(abilityActions(g, monument, 1).length).toBeGreaterThan(0);
      // On the opponent's turn it can't be activated.
      const g2 = game({
        p1: {
          battlefield: [
            id,
            ...n('plains', 2),
            ...n('swamp', 2),
            ...n('forest', 2),
            ...n('island', 2),
            ...n('mountain', 2),
          ],
        },
        active: 'p2',
      });
      g2.pass();
      expect(abilityActions(g2, g2.id('p1', id), 1)).toEqual([]);
    });
  }

  it('Abzan Monument: an X/X white Spirit, X the greatest toughness among creatures you control', () => {
    const g = game({
      p1: {
        battlefield: [
          'abzan-monument',
          'plains',
          'swamp',
          'forest',
          'forest',
          'ancestor-dragon',
          'llanowar-elves',
        ],
      },
    });
    activate(g, g.id('p1', 'abzan-monument'), 1);
    done(g);
    expect(board(g, 'abzan-monument')).toHaveLength(0);
    const spirit = board(g, 'tdm-spirit-token', 'p1');
    expect(spirit).toHaveLength(1);
    expect(pt(g, spirit[0]!)).toEqual([6, 6]);
    expect(cardDb.get('tdm-spirit-token')!.colors).toEqual(['W']);
  });

  it('Jeskai Monument: two 1/1 white Bird tokens with flying', () => {
    const g = game({
      p1: { battlefield: ['jeskai-monument', 'island', 'mountain', 'plains', 'plains'] },
    });
    activate(g, g.id('p1', 'jeskai-monument'), 1);
    done(g);
    const birds = board(g, 'tdm-bird-token', 'p1');
    expect(birds).toHaveLength(2);
    expect(pt(g, birds[0]!)).toEqual([1, 1]);
    expect([...chars(g, birds[0]!).keywords]).toContain('flying');
  });

  it('Mardu Monument: three 1/1 red Warriors that gain menace and haste until end of turn', () => {
    const g = game({
      p1: { battlefield: ['mardu-monument', 'mountain', 'plains', 'swamp', 'forest', 'forest'] },
    });
    activate(g, g.id('p1', 'mardu-monument'), 1);
    done(g);
    const warriors = board(g, 'tdm-warrior-token', 'p1');
    expect(warriors).toHaveLength(3);
    expect([...chars(g, warriors[0]!).keywords]).toEqual(
      expect.arrayContaining(['menace', 'haste']),
    );
    // They stay: no sacrifice.
    passTo(g, 'end');
    done(g);
    expect(board(g, 'tdm-warrior-token', 'p1')).toHaveLength(3);
    passTo(g, 'main1', 'p2');
    expect(board(g, 'tdm-warrior-token', 'p1')).toHaveLength(3);
    expect([...chars(g, warriors[0]!).keywords]).not.toContain('menace');
  });

  it('Sultai Monument: two 2/2 black Zombie Druid tokens', () => {
    const g = game({
      p1: { battlefield: ['sultai-monument', 'swamp', 'forest', 'island', 'island', 'island'] },
    });
    activate(g, g.id('p1', 'sultai-monument'), 1);
    done(g);
    const zombies = board(g, 'tdm-zombie-druid-token', 'p1');
    expect(zombies).toHaveLength(2);
    expect(pt(g, zombies[0]!)).toEqual([2, 2]);
  });

  it('Temur Monument: a 5/5 green Elephant token', () => {
    const g = game({
      p1: {
        battlefield: [
          'temur-monument',
          'forest',
          'island',
          'mountain',
          'mountain',
          'mountain',
          'mountain',
        ],
      },
    });
    activate(g, g.id('p1', 'temur-monument'), 1);
    done(g);
    const elephant = board(g, 'tdm-elephant-token', 'p1');
    expect(elephant).toHaveLength(1);
    expect(pt(g, elephant[0]!)).toEqual([5, 5]);
  });
});

describe('Boulderborn Dragon', () => {
  it('has flying and vigilance; whenever it attacks, surveil 1', () => {
    const g = game({
      p1: { battlefield: ['boulderborn-dragon'], library: ['forest', 'island'] },
      step: 'beginCombat',
    });
    expect([...chars(g, g.id('p1', 'boulderborn-dragon')).keywords]).toEqual(
      expect.arrayContaining(['flying', 'vigilance']),
    );
    g.passBoth();
    g.attack(g.id('p1', 'boulderborn-dragon'));
    stop(g);
    expect(g.decision.kind).toBe('scry');
    g.do({ type: 'scry', player: 'p1', top: [], bottom: [g.state.players.p1.library[0]!] });
    done(g);
    expect(gy(g)).toEqual(['forest']);
  });
});

describe('the lands that enter tapped unless you control a basic land type', () => {
  const LANDS: [string, string, string[], string][] = [
    ['cori-mountain-monastery', 'R', ['plains', 'island'], 'forest'],
    ['dalkovan-encampment', 'W', ['swamp', 'mountain'], 'forest'],
    ['kishla-village', 'G', ['island', 'swamp'], 'plains'],
    ['mistrise-village', 'U', ['mountain', 'forest'], 'plains'],
  ];
  for (const [id, , types, other] of LANDS) {
    it(`${id}: enters tapped unless you control ${types.join(' or ')}`, () => {
      for (const t of types) {
        const g = game({ p1: { hand: [id], battlefield: [t] } });
        g.do(g.legal().find((a) => a.type === 'playLand')!);
        expect(g.obj(g.id('p1', id)).tapped).toBe(false);
      }
      const g = game({ p1: { hand: [id], battlefield: [other] } });
      g.do(g.legal().find((a) => a.type === 'playLand')!);
      expect(g.obj(g.id('p1', id)).tapped).toBe(true);
    });
  }

  it('Cori Mountain Monastery: taps for {R}; {3}{R},{T}: exile the top card, you may play it until the end of your next turn', () => {
    const g = game({
      p1: {
        battlefield: ['cori-mountain-monastery', ...n('mountain', 4)],
        library: ['llanowar-elves', 'forest'],
      },
    });
    const land = g.id('p1', 'cori-mountain-monastery');
    activate(g, land, 1);
    done(g);
    expect(exile(g)).toEqual(['llanowar-elves']);
    // Playable this turn and next.
    const elves = g.id('p1', 'llanowar-elves', 'exile');
    expect(g.obj(elves).playableUntilTurn).toBe(g.state.turn.number + 2);
    expect(casts(g, 'llanowar-elves').length).toBe(0);
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === elves)).toBe(false); // no green mana left, only Mountains
  });

  it('Dalkovan Encampment: {2}{W},{T}: whenever you attack this turn, two tapped and attacking Warriors, sacrificed at the next end step', () => {
    const g = game({
      p1: { battlefield: ['dalkovan-encampment', ...n('plains', 3), 'savannah-lions'] },
    });
    activate(g, g.id('p1', 'dalkovan-encampment'), 1);
    done(g);
    g.passUntilStep('beginCombat');
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    g.attack(g.id('p1', 'savannah-lions'));
    done(g);
    const warriors = board(g, 'tdm-warrior-token', 'p1');
    expect(warriors).toHaveLength(2);
    for (const w of warriors) {
      expect(g.obj(w).tapped).toBe(true);
      expect(g.state.combat?.attackers.some((a) => a.id === w)).toBe(true);
    }
    passTo(g, 'end');
    done(g);
    expect(board(g, 'tdm-warrior-token', 'p1')).toHaveLength(0);
  });

  it('Kishla Village: {3}{G},{T}: surveil 2', () => {
    const g = game({
      p1: {
        battlefield: ['kishla-village', ...n('forest', 4)],
        library: ['plains', 'island', 'swamp'],
      },
    });
    activate(g, g.id('p1', 'kishla-village'), 1);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
  });

  it("Mistrise Village: {U},{T}: the next spell you cast this turn can't be countered", () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves', 'giant-growth'],
        battlefield: ['mistrise-village', 'island', 'forest', 'forest'],
      },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    activate(g, g.id('p1', 'mistrise-village'), 1);
    done(g);
    cast(g, 'llanowar-elves');
    // The opponent tries to counter it: it can't be.
    g.pass();
    cast(g, 'cancel', (a) => a.targets.length > 0, 'p2');
    done(g);
    expect(board(g, 'llanowar-elves', 'p1')).toHaveLength(1);
    // The one after that can.
    cast(g, 'giant-growth', targets(g, 'llanowar-elves'));
  });
});

describe('Dragonfire Blade', () => {
  const equipTargets = (g: Game): string[] => {
    const blade = g.id('p1', 'dragonfire-blade');
    return abilityActions(g, blade, 1).flatMap((a) =>
      a.type === 'activateAbility'
        ? a.targets.flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : []))
        : [],
    );
  };
  it('equip {4}, {1} less for each color of the creature it targets', () => {
    const creatures = ['effortless-master', 'savannah-lions', 'jade-cast-sentinel'];
    const g2 = game({ p1: { battlefield: ['dragonfire-blade', ...n('swamp', 2), ...creatures] } });
    expect(equipTargets(g2)).toEqual(['effortless-master']);
    const g3 = game({ p1: { battlefield: ['dragonfire-blade', ...n('swamp', 3), ...creatures] } });
    expect(equipTargets(g3).sort()).toEqual(['effortless-master', 'savannah-lions']);
    const g4 = game({ p1: { battlefield: ['dragonfire-blade', ...n('swamp', 4), ...creatures] } });
    expect(equipTargets(g4).sort()).toEqual([
      'effortless-master',
      'jade-cast-sentinel',
      'savannah-lions',
    ]);
  });

  it('equipped creature gets +2/+2 and hexproof from monocolored (spells and abilities of opponents)', () => {
    const g = game({
      p1: {
        battlefield: ['dragonfire-blade', ...n('swamp', 3), 'savannah-lions', 'llanowar-elves'],
      },
      p2: { hand: ['scorching-dragonfire'], battlefield: n('mountain', 2) },
    });
    const blade = g.id('p1', 'dragonfire-blade');
    const lions = g.id('p1', 'savannah-lions');
    const equip = abilityActions(g, blade, 1).find(
      (a) =>
        a.type === 'activateAbility' &&
        a.targets.some((t) => 'object' in t && t.object.id === lions),
    )!;
    g.do(equip);
    done(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect([...chars(g, lions).keywords]).toContain('hexproofFromMonocolored');
    g.pass();
    expect(g.actor).toBe('p2');
    // A monocolored spell can't target it, but can target the other creature.
    const burn = casts(g, 'scorching-dragonfire', 'p2');
    expect(burn.some(targets(g, 'savannah-lions'))).toBe(false);
    expect(burn.some(targets(g, 'llanowar-elves'))).toBe(true);
  });

  it('a multicolored source can target it', () => {
    const g = game({
      p1: { battlefield: ['dragonfire-blade', ...n('swamp', 3), 'savannah-lions'] },
      p2: { hand: ['izzet-charm'], battlefield: ['mountain', 'island'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do(
      abilityActions(g, g.id('p1', 'dragonfire-blade'), 1).find(
        (a) => a.type === 'activateAbility' && a.targets.length > 0,
      )!,
    );
    done(g);
    g.pass();
    expect(casts(g, 'izzet-charm', 'p2').some(targets(g, 'savannah-lions'))).toBe(true);
    expect(pt(g, lions)).toEqual([4, 3]);
  });
});

describe('Dragonstorm Globe', () => {
  it('each Dragon you control enters with an additional +1/+1 counter', () => {
    const g = game({
      p1: {
        hand: ['firespitter-whelp'],
        battlefield: ['dragonstorm-globe', ...n('mountain', 3)],
      },
    });
    cast(g, 'firespitter-whelp');
    done(g);
    expect(pt(g, g.id('p1', 'firespitter-whelp'))).toEqual([3, 3]);
  });
  it('other creatures do not get one', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['dragonstorm-globe', 'forest'] },
    });
    cast(g, 'llanowar-elves');
    done(g);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 1]);
  });
  it('a Dragon an opponent controls does not', () => {
    const g = game({
      p1: { battlefield: ['dragonstorm-globe'] },
      p2: { hand: ['firespitter-whelp'], battlefield: n('mountain', 3) },
      active: 'p2',
    });
    cast(g, 'firespitter-whelp', undefined, 'p2');
    done(g);
    expect(pt(g, g.id('p2', 'firespitter-whelp'))).toEqual([2, 2]);
  });
  it('{T}: add one mana of any color', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['dragonstorm-globe'] },
    });
    expect(casts(g, 'llanowar-elves').length).toBeGreaterThan(0);
  });
});

describe('Embermouth Sentinel', () => {
  it('without a Dragon: search for a basic land card, reveal it, shuffle and put it on top', () => {
    const g = game({
      p1: {
        hand: ['embermouth-sentinel'],
        battlefield: n('plains', 2),
        library: ['island', 'swamp', 'forest', 'plains'],
      },
    });
    cast(g, 'embermouth-sentinel');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    librarySearch(g, 'forest');
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('forest');
    expect(board(g, 'forest', 'p1')).toHaveLength(0);
  });

  it('with a Dragon: onto the battlefield tapped instead', () => {
    const g = game({
      p1: {
        hand: ['embermouth-sentinel'],
        battlefield: [...n('plains', 2), 'firespitter-whelp'],
        library: ['island', 'swamp', 'forest', 'plains'],
      },
    });
    cast(g, 'embermouth-sentinel');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    librarySearch(g, 'forest');
    const forest = board(g, 'forest', 'p1');
    expect(forest).toHaveLength(1);
    expect(g.obj(forest[0]!).tapped).toBe(true);
  });

  it('the search is optional', () => {
    const g = game({
      p1: {
        hand: ['embermouth-sentinel'],
        battlefield: n('plains', 2),
        library: ['island', 'forest'],
      },
    });
    cast(g, 'embermouth-sentinel');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('island');
  });
});

describe('Jade-Cast Sentinel', () => {
  it("{2},{T}: put target card from a graveyard on the bottom of its owner's library", () => {
    const g = game({
      p1: { battlefield: ['jade-cast-sentinel', 'plains', 'plains'], library: ['forest'] },
      p2: { graveyard: ['elvish-mystic'], library: ['island'] },
    });
    const sentinel = g.id('p1', 'jade-cast-sentinel');
    const acts = abilityActions(g, sentinel, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual([]);
    const lib = g.state.players.p2.library.map((id) => g.obj(id).defId);
    expect(lib[lib.length - 1]).toBe('elvish-mystic');
    expect(g.obj(sentinel).tapped).toBe(true);
  });
  it('has reach', () => {
    const g = game({ p1: { battlefield: ['jade-cast-sentinel'] } });
    expect([...chars(g, g.id('p1', 'jade-cast-sentinel')).keywords]).toContain('reach');
  });
});

describe('Maelstrom of the Spirit Dragon', () => {
  it('{T}: add {C}; the any-colour mana is only for Dragon spells', () => {
    // {2}{R}: the Maelstrom supplies {R} for a Dragon spell.
    const g = game({
      p1: {
        hand: ['firespitter-whelp'],
        battlefield: ['maelstrom-of-the-spirit-dragon', 'plains', 'plains'],
      },
    });
    expect(casts(g, 'firespitter-whelp').length).toBeGreaterThan(0);
    // ... but not for another spell that needs a colour only it could make.
    const g2 = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['maelstrom-of-the-spirit-dragon'] },
    });
    expect(casts(g2, 'llanowar-elves')).toEqual([]);
    // Colorless works for generic costs.
    const g3 = game({
      p1: { hand: ['sol-ring'], battlefield: ['maelstrom-of-the-spirit-dragon'] },
    });
    expect(casts(g3, 'sol-ring').length).toBeGreaterThan(0);
  });

  it('{4},{T}, sacrifice: search your library for a Dragon card, reveal it, put it into your hand', () => {
    const g = game({
      p1: {
        battlefield: ['maelstrom-of-the-spirit-dragon', ...n('mountain', 4)],
        library: ['forest', 'shivan-dragon', 'siege-dragon'],
      },
    });
    activate(
      g,
      g.id('p1', 'maelstrom-of-the-spirit-dragon'),
      cardDb
        .get('maelstrom-of-the-spirit-dragon')!
        .abilities.findIndex((a) => a.kind === 'activated'),
    );
    stop(g);
    expect((g.decision as { options: string[] }).options.map((o) => g.obj(o).defId).sort()).toEqual(
      ['shivan-dragon', 'siege-dragon'],
    );
    librarySearch(g, 'shivan-dragon');
    expect(hand(g)).toEqual(['shivan-dragon']);
    expect(board(g, 'maelstrom-of-the-spirit-dragon')).toHaveLength(0);
  });
});

describe('Mox Jasper', () => {
  it('{T}: add one mana of any color. Activate only if you control a Dragon', () => {
    const without = game({ p1: { hand: ['savannah-lions'], battlefield: ['mox-jasper'] } });
    expect(casts(without, 'savannah-lions')).toEqual([]);
    const withDragon = game({
      p1: { hand: ['savannah-lions'], battlefield: ['mox-jasper', 'firespitter-whelp'] },
    });
    expect(casts(withDragon, 'savannah-lions').length).toBeGreaterThan(0);
  });
});

describe('the tri-lands', () => {
  for (const [id, colors] of [
    ['opulent-palace', ['B', 'G', 'U']],
    ['sandsteppe-citadel', ['W', 'B', 'G']],
  ] as const) {
    it(`${id} enters tapped and taps for ${colors.join(', ')}`, () => {
      const g = game({ p1: { hand: [id] } });
      g.do(g.legal().find((a) => a.type === 'playLand')!);
      expect(g.obj(g.id('p1', id)).tapped).toBe(true);
      const mana = cardDb.get(id)!.abilities.filter((a) => a.kind === 'mana');
      expect(mana.map((a) => (a.kind === 'mana' ? a.produces : ''))).toEqual(colors);
    });
  }
  it('pays for {B}{G}{U} with basics', () => {
    const g = game({
      p1: {
        hand: ['host-of-the-hereafter'],
        battlefield: [{ card: 'opulent-palace' }, 'swamp', 'forest', 'island'],
      },
    });
    // {2}{B}{G}: Palace + 3 basics.
    expect(casts(g, 'host-of-the-hereafter').length).toBeGreaterThan(0);
  });
});

describe('Ugin, Eye of the Storms', () => {
  it('when you cast it, exile up to one target permanent that is one or more colors', () => {
    const g = game({
      p1: { hand: ['ugin-eye-of-the-storms'], battlefield: n('forest', 7) },
      p2: { battlefield: ['llanowar-elves', 'sol-ring', 'forest'] },
    });
    cast(g, 'ugin-eye-of-the-storms');
    stop(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    // Up to one: no target is a choice; colorless permanents and lands are not.
    const named = picks
      .filter((a) => a.type === 'chooseTargets' && a.targets.length > 0)
      .map((a) =>
        a.type === 'chooseTargets'
          ? a.targets.map((t) => ('object' in t ? g.obj(t.object.id).defId : 'player'))
          : [],
      );
    expect(named.sort()).toEqual([['llanowar-elves']]);
    expect(picks.some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    done(g);
    expect(exile(g, 'p2')).toEqual(['llanowar-elves']);
    expect(board(g, 'ugin-eye-of-the-storms')).toHaveLength(1);
    expect(g.state.objects[board(g, 'ugin-eye-of-the-storms')[0]!]!.counters?.loyalty).toBe(7);
  });

  it('whenever you cast a colorless spell, exile up to one target permanent that is one or more colors', () => {
    const g = game({
      p1: {
        hand: ['sol-ring', 'llanowar-elves'],
        battlefield: [{ card: 'ugin-eye-of-the-storms', loyalty: 7 }, 'forest', 'forest'],
      },
      p2: { battlefield: ['llanowar-elves', 'sol-ring'] },
    });
    cast(g, 'sol-ring');
    done(g);
    expect(exile(g, 'p2')).toEqual(['llanowar-elves']);
    // A colored spell doesn't.
    cast(g, 'llanowar-elves');
    done(g);
    expect(g.state.pendingTriggers).toHaveLength(0);
    expect(exile(g, 'p2')).toEqual(['llanowar-elves']);
  });

  it('+2: you gain 3 life and draw a card', () => {
    const g = game({
      p1: { battlefield: [{ card: 'ugin-eye-of-the-storms', loyalty: 7 }], library: ['plains'] },
    });
    activate(g, g.id('p1', 'ugin-eye-of-the-storms'), 2);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(hand(g)).toEqual(['plains']);
    expect(g.obj(g.id('p1', 'ugin-eye-of-the-storms')).counters?.loyalty).toBe(9);
  });

  it('0: add {C}{C}{C}', () => {
    const g = game({
      p1: { hand: ['sol-ring'], battlefield: [{ card: 'ugin-eye-of-the-storms', loyalty: 7 }] },
    });
    expect(casts(g, 'sol-ring')).toEqual([]);
    activate(g, g.id('p1', 'ugin-eye-of-the-storms'), 3);
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(3);
    expect(casts(g, 'sol-ring').length).toBeGreaterThan(0);
  });

  it('−11: search for any number of colorless nonland cards, exile them; cast them free this turn', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'ugin-eye-of-the-storms', loyalty: 11 }, 'forest'],
        library: ['sol-ring', 'forest', 'mind-stone', 'giant-growth', 'arcane-signet'],
      },
    });
    activate(g, g.id('p1', 'ugin-eye-of-the-storms'), 4);
    stop(g);
    expect(g.decision.kind).toBe('searchLibrary');
    // Only colorless nonland cards are offered; "any number": one at a time, stopping when I like.
    const options = (g.decision as { options: string[] }).options.map((o) => g.obj(o).defId).sort();
    expect(options).toEqual(['arcane-signet', 'mind-stone', 'sol-ring']);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'sol-ring', 'library') });
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'mind-stone', 'library') });
    // Stop before the third.
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(exile(g).sort()).toEqual(['mind-stone', 'sol-ring']);
    // Ugin is gone (11 loyalty removed).
    expect(board(g, 'ugin-eye-of-the-storms')).toHaveLength(0);
    // They can be cast without paying their mana costs.
    const sol = g.id('p1', 'sol-ring', 'exile');
    const free = g.legal().find((a) => a.type === 'castSpell' && a.card === sol)!;
    expect(free).toBeDefined();
    g.do(free);
    done(g);
    expect(board(g, 'sol-ring', 'p1')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(false);
    // Not the card left in the library.
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toContain('arcane-signet');
  });

  it('−11: the free casting lasts until end of turn only', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'ugin-eye-of-the-storms', loyalty: 11 }],
        library: ['sol-ring', ...n('forest', 8)],
      },
    });
    activate(g, g.id('p1', 'ugin-eye-of-the-storms'), 4);
    done(g);
    expect(exile(g)).toEqual(['sol-ring']);
    const sol = g.id('p1', 'sol-ring', 'exile');
    const castable = () => g.legal('p1').some((a) => a.type === 'castSpell' && a.card === sol);
    expect(castable()).toBe(true);
    passTo(g, 'upkeep', 'p2');
    passTo(g, 'main1', 'p1');
    expect(g.state.objects[sol]!.zone).toBe('exile');
    expect(castable()).toBe(false);
  });
});

describe('Watcher of the Wayside', () => {
  it('when it enters, target player mills two cards and you gain 2 life', () => {
    const g = game({
      p1: { hand: ['watcher-of-the-wayside'], battlefield: n('plains', 3) },
      p2: { library: ['forest', 'island', 'swamp'] },
    });
    cast(g, 'watcher-of-the-wayside');
    done(g, { target: (a) => a.targets.some((t) => 'player' in t && t.player === 'p2') });
    expect(gy(g, 'p2')).toEqual(['forest', 'island']);
    expect(g.life('p1')).toBe(22);
  });
  it('can target yourself', () => {
    const g = game({
      p1: {
        hand: ['watcher-of-the-wayside'],
        battlefield: n('plains', 3),
        library: ['forest', 'island', 'swamp'],
      },
    });
    cast(g, 'watcher-of-the-wayside');
    done(g, { target: (a) => a.targets.some((t) => 'player' in t && t.player === 'p1') });
    expect(gy(g, 'p1')).toEqual(['forest', 'island']);
  });
});

describe('Maelstrom of the Spirit Dragon: Omen spells', () => {
  const base = {
    manaCost: { generic: 0, colored: {} },
    supertypes: [],
    keywords: [],
    abilities: [],
  };
  // A Dragon creature with an Omen spell side ({1}{R}), as the set's Omen Dragons are.
  const OMEN_DRAGON: CardDefinition = {
    ...base,
    id: 't-omen-dragon',
    name: 'Omen Dragon',
    colors: ['R'],
    types: ['Creature'],
    subtypes: ['Dragon'],
    power: 3,
    toughness: 3,
    manaCost: { generic: 4, colored: { R: 1 } },
    adventure: true,
    back: 't-omen-roar',
  };
  const OMEN_ROAR: CardDefinition = {
    ...base,
    id: 't-omen-roar',
    name: 'Omen Roar',
    colors: ['R'],
    types: ['Sorcery'],
    subtypes: ['Omen'],
    manaCost: { generic: 1, colored: { R: 1 } },
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 4 }] },
  };
  const db = new Map([...cardDb, [OMEN_DRAGON.id, OMEN_DRAGON], [OMEN_ROAR.id, OMEN_ROAR]]);
  const engine = createEngine(db);
  const omenGame = (battlefield: string[]) =>
    new GameDriver(engine, buildScenario(db, { p1: { hand: ['t-omen-dragon'], battlefield } }));

  it('its any-colour mana pays for an Omen spell and for a Dragon spell', () => {
    // {R} for the Omen from the Maelstrom, the generic from a Plains.
    const g = omenGame(['maelstrom-of-the-spirit-dragon', 'plains']);
    const acts = g.legal().filter((a) => a.type === 'castSpell');
    expect(acts.some((a) => a.type === 'castSpell' && a.back)).toBe(true);
    // The Dragon creature itself ({4}{R}) is out of reach with two lands.
    expect(acts.some((a) => a.type === 'castSpell' && !a.back)).toBe(false);
  });

  it('... but not for an ordinary spell', () => {
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: { hand: ['flame-slash'], battlefield: ['maelstrom-of-the-spirit-dragon', 'plains'] },
      }),
    );
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});
