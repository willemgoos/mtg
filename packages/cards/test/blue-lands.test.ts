import {
  type Action,
  createEngine,
  getCharacteristics,
  redactFor,
  type TargetChoice,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for Learn From the Land and Arcane Aerialists.

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, 'hand'), targets, ...extra });
};
const tokens = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);
const castable = (g: GameDriver, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);

describe('blue', () => {
  it('Exclusion Mage returns an opposing creature to its owner’s hand', () => {
    const g = game({
      p1: { hand: ['exclusion-mage'], battlefield: n('island', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'exclusion-mage').passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(g.zoneOf(bear)).toBe('hand');
  });

  it('High Fae Trickster lets you cast sorcery-speed spells at instant speed', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['bear-cub'], battlefield: [...n('forest', 2), 'high-fae-trickster'] },
    });
    g.pass(); // p2 passes; p1 has priority on p2's turn
    expect(castable(g, 'bear-cub')).toBe(true);
    const without = game({ active: 'p2', p1: { hand: ['bear-cub'], battlefield: n('forest', 2) } });
    without.pass();
    expect(castable(without, 'bear-cub')).toBe(false);
  });

  it('Faebloom Trick makes two Faeries and taps an opposing creature', () => {
    const g = game({
      p1: { hand: ['faebloom-trick'], battlefield: n('island', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'faebloom-trick', [g.ref(bear)]).passBoth();
    expect(tokens(g, 'faerie-token')).toHaveLength(2);
    expect(g.obj(bear).tapped).toBe(true);
    const empty = game({ p1: { hand: ['faebloom-trick'], battlefield: n('island', 3) } });
    expect(castable(empty, 'faebloom-trick')).toBe(true); // no target needed
  });

  it('Chart a Course: draw two, then discard one unless you attacked', () => {
    const g = game({
      p1: {
        hand: ['chart-a-course'],
        battlefield: n('island', 2),
        library: ['bear-cub', 'forest', 'island'],
      },
    });
    cast(g, 'chart-a-course').passBoth();
    expect(g.decision.kind).toBe('discard');
    const card = g.state.players.p1.hand[0]!;
    g.do({ type: 'discard', player: 'p1', card });
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.decision.kind).toBe('priority');

    const raided = game({
      p1: {
        hand: ['chart-a-course'],
        battlefield: n('island', 2),
        library: ['bear-cub', 'forest'],
      },
    });
    raided.state.players.p1.attackedThisTurn = true;
    cast(raided, 'chart-a-course').passBoth();
    expect(raided.state.players.p1.hand).toHaveLength(2);
  });

  it('Mischievous Mystic makes a Faerie on your second draw of the turn', () => {
    const g = game({
      p1: { hand: ['quick-study'], battlefield: [...n('island', 3), 'mischievous-mystic'] },
    });
    cast(g, 'quick-study').passBoth().passBoth();
    expect(tokens(g, 'faerie-token')).toHaveLength(1);
  });

  it('Fog Bank prevents combat damage to and from it', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['gnarlback-rhino'] },
      p2: { battlefield: ['fog-bank'] },
    });
    const rhino = g.id('p1', 'gnarlback-rhino');
    const bank = g.id('p2', 'fog-bank');
    g.passBoth().attack(rhino).passBoth();
    g.block([bank, rhino]).passUntilStep('main2');
    expect(g.zoneOf(bank)).toBe('battlefield');
    expect(g.obj(bank).damage).toBe(0);
    // Trample still assigns lethal (2) to the Fog Bank, where it is prevented; 2 tramples over.
    expect(g.life('p2')).toBe(18);
  });

  it('Curator of Destinies: split into piles; the opponent picks one for your hand', () => {
    const g = game({
      p1: {
        hand: ['curator-of-destinies'],
        battlefield: n('island', 6),
        library: ['bear-cub', 'forest', 'island', 'shock', 'savannah-lions', 'forest'],
      },
    });
    cast(g, 'curator-of-destinies').passBoth().passBoth();
    const d = g.decision;
    if (d.kind !== 'splitPiles') throw new Error(`expected splitPiles, got ${d.kind}`);
    expect(g.legal()).toHaveLength(32);
    const [first, ...rest] = d.cards;
    g.do({ type: 'splitPiles', player: 'p1', faceUp: [first!] });
    const c = g.decision;
    if (c.kind !== 'choosePile') throw new Error('expected choosePile');
    // The chooser sees the face-up card but not the face-down ones.
    const view = redactFor(g.state, 'p2');
    expect(view.objects[first!]!.defId).toBe('bear-cub');
    expect(view.objects[rest[0]!]!.defId).toBe('?');
    g.do({ type: 'choosePile', player: 'p2', pile: 'faceDown' });
    expect(g.state.players.p1.hand).toHaveLength(4);
    expect(g.zoneOf(first!)).toBe('graveyard');
  });
});

describe('white', () => {
  it('Giada: Angels enter with extra counters; her mana only pays for Angels', () => {
    const g = game({
      p1: {
        hand: ['youthful-valkyrie', 'bear-cub'],
        battlefield: ['plains', 'giada-font-of-hope'],
      },
    });
    // Plains + Giada's mana: enough for the Valkyrie ({1}{W}), not for Bear Cub ({1}{G}).
    expect(castable(g, 'youthful-valkyrie')).toBe(true);
    expect(castable(g, 'bear-cub')).toBe(false);
    cast(g, 'youthful-valkyrie').passBoth();
    expect(g.obj(g.id('p1', 'youthful-valkyrie')).plusOneCounters).toBe(1);
  });

  it('Lyra gives other Angels +1/+1 and lifelink; Youthful Valkyrie grows when Angels enter', () => {
    const g = game({
      p1: { hand: ['lyra-dawnbringer'], battlefield: [...n('plains', 5), 'youthful-valkyrie'] },
    });
    cast(g, 'lyra-dawnbringer').passBoth().passBoth();
    const v = g.id('p1', 'youthful-valkyrie');
    expect(pt(g, v)).toEqual([3, 5]);
    expect(getCharacteristics(g.state, cardDb, v).keywords.has('lifelink')).toBe(true);
  });

  it('Stasis Snare (flash) exiles until it leaves', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['stasis-snare'], battlefield: n('plains', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    g.pass();
    cast(g, 'stasis-snare').passBoth();
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(g.id('p2', 'bear-cub'))],
    }).passBoth();
    expect(g.zoneOf(g.id('p2', 'bear-cub', 'exile'))).toBe('exile');
  });

  it('Empyrean Eagle pumps your other flyers', () => {
    const g = game({ p1: { battlefield: ['empyrean-eagle', 'healers-hawk', 'bear-cub'] } });
    expect(pt(g, g.id('p1', 'healers-hawk'))).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
  });
});

describe('green and lands', () => {
  it('Loot lets you play a second land each turn', () => {
    const g = game({
      p1: { hand: ['forest', 'island'], battlefield: ['loot-exuberant-explorer'] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'island', 'hand') });
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);
  });

  it("Loot's ability puts a creature from the top six onto the battlefield; the rest go to the bottom", () => {
    const g = game({
      p1: {
        battlefield: [...n('forest', 6), { card: 'loot-exuberant-explorer', sick: false }],
        library: [
          'forest',
          'gnarlback-rhino',
          'gigantosaurus',
          'forest',
          'forest',
          'forest',
          'island',
        ],
      },
    });
    const loot = g.id('p1', 'loot-exuberant-explorer');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: loot,
      abilityIndex: 1,
      targets: [],
    }).passBoth();
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error('expected a choice');
    // Six lands: Rhino (MV 4) and Gigantosaurus (MV 5) both qualify.
    expect(d.options).toHaveLength(2);
    const rhino = d.options.find((id) => g.obj(id).defId === 'gnarlback-rhino')!;
    g.do({ type: 'chooseCard', player: 'p1', card: rhino });
    expect(g.zoneOf(rhino)).toBe('battlefield');
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('island');
  });

  it('Mossborn Hydra doubles its counters on landfall', () => {
    const g = game({ p1: { hand: ['mossborn-hydra', 'forest'], battlefield: n('forest', 3) } });
    cast(g, 'mossborn-hydra').passBoth();
    const h = g.id('p1', 'mossborn-hydra');
    expect(pt(g, h)).toEqual([1, 1]);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(pt(g, h)).toEqual([2, 2]);
  });

  it('Circuitous Route finds up to two basics or Gates, onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['circuitous-route'],
        battlefield: n('forest', 4),
        library: ['bear-cub', 'simic-guildgate', 'island', 'shock'],
      },
    });
    cast(g, 'circuitous-route').passBoth();
    for (let i = 0; i < 2; i++) {
      const d = g.decision;
      if (d.kind !== 'searchLibrary') throw new Error('expected a search');
      g.do({ type: 'chooseCard', player: 'p1', card: d.options[0]! });
    }
    const found = g.state.battlefield.filter((id) =>
      ['simic-guildgate', 'island'].includes(g.obj(id).defId),
    );
    expect(found).toHaveLength(2);
    expect(found.every((id) => g.obj(id).tapped)).toBe(true);
  });

  it('Apothecary Stomper: choose a mode as it enters', () => {
    const g = game({ p1: { hand: ['apothecary-stomper'], battlefield: n('forest', 6) } });
    cast(g, 'apothecary-stomper').passBoth();
    const modes = g.legal().map((a) => (a.type === 'chooseTargets' ? a.mode : -1));
    expect(new Set(modes)).toEqual(new Set([0, 1]));
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 1 }).passBoth();
    expect(g.life('p1')).toBe(24);
  });

  it('Primeval Bounty: Beasts for creature spells, life for lands', () => {
    const g = game({
      p1: { hand: ['bear-cub', 'forest'], battlefield: [...n('forest', 2), 'primeval-bounty'] },
    });
    cast(g, 'bear-cub').passBoth().passBoth();
    expect(tokens(g, 'beast-3-token')).toHaveLength(1);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(g.life('p1')).toBe(23);
  });

  it('Tatyova: landfall gains 1 and draws', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['tatyova-benthic-druid'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(g.life('p1')).toBe(21);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});
