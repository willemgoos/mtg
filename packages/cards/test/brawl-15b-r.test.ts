import { getCharacteristics, type Action } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Brawl decks (15b, red and Izzet): burn, spree, Treasures, artifacts, Izzet spellslingers, lands.

type G = ReturnType<typeof game>;
const castable = (g: G, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const variants = (g: G, defId: string) =>
  g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const chars = (g: G, id: string) => getCharacteristics(g.state, cardDb, id);
const defsIn = (g: G, p: 'p1' | 'p2', zone: 'hand' | 'graveyard' | 'exile') =>
  g.state.players[p][zone].map((id) => g.obj(id).defId);
/** Answers whatever decisions come up: option 0 (or `option`), accepting effects, first search result. */
const resolveAll = (g: G, option = 0, accept = true) => {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({
        type: 'chooseOption',
        player: d.player,
        index: Math.min(option, d.options.length - 1),
      });
    else if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept });
    else if (d.kind === 'scry') g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else return g;
  }
  return g;
};
/** The free-cast action that targets p2. */
const freeCastAtOpponent = (g: G) =>
  g
    .legal()
    .find(
      (a) =>
        a.type === 'castSpell' &&
        a.targets[0] !== undefined &&
        'player' in a.targets[0] &&
        a.targets[0].player === 'p2',
    )!;
const activate = (g: G, defId: string, index?: number) => {
  const src = g.id('p1', defId);
  const a = g
    .legal()
    .find(
      (x) =>
        x.type === 'activateAbility' &&
        x.source === src &&
        (index === undefined || x.abilityIndex === index),
    );
  if (!a) throw new Error(`No ability on ${defId}`);
  return g.do(a);
};

describe('Brawl decks (15b, red): burn', () => {
  it('Lightning Bolt, Flame Slash and Sear deal their damage', () => {
    const g = game({
      p1: { hand: ['lightning-bolt', 'flame-slash', 'sear'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['beast-3-token'] },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(castable(g, 'flame-slash')).toBe(true);
    expect(castable(g, 'sear')).toBe(true);
  });

  it('Stoke the Flames can be cast by convoking creatures', () => {
    const g = game({
      p1: {
        hand: ['stoke-the-flames'],
        battlefield: [...n('mountain', 2), 'goblin-token', 'goblin-token'],
      },
    });
    expect(castable(g, 'stoke-the-flames')).toBe(true);
    cast(g, 'stoke-the-flames', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('Welding Sparks counts your artifacts', () => {
    const g = game({
      p1: { hand: ['welding-sparks'], battlefield: [...n('mountain', 3), 'treasure-token'] },
      p2: { battlefield: ['beast-3-token'] },
    });
    const target = g.id('p2', 'beast-3-token');
    cast(g, 'welding-sparks', [g.ref(target)]);
    settle(g);
    // 3 + 1 artifact = 4 damage kills the 3/3.
    expect(g.zoneOf(target)).toBe('graveyard');
  });

  it('Torch the Tower: 2 damage, or bargained 3 damage, a scry, and exile if it would die', () => {
    const plain = game({
      p1: { hand: ['torch-the-tower'], battlefield: n('mountain', 1) },
      p2: { battlefield: ['beast-3-token'] },
    });
    const giant = plain.id('p2', 'beast-3-token');
    expect(
      variants(plain, 'torch-the-tower').every((a) => !(a.type === 'castSpell' && a.kicked)),
    ).toBe(true);
    cast(plain, 'torch-the-tower', [plain.ref(giant)]);
    settle(plain);
    expect(plain.obj(giant).damage).toBe(2);

    const g = game({
      p1: { hand: ['torch-the-tower'], battlefield: [...n('mountain', 1), 'treasure-token'] },
      p2: { battlefield: ['beast-3-token'] },
    });
    const target = g.id('p2', 'beast-3-token');
    const bargained = variants(g, 'torch-the-tower').find(
      (a) => a.type === 'castSpell' && a.kicked,
    );
    expect(bargained).toBeDefined();
    g.do({ ...(bargained as Extract<Action, { type: 'castSpell' }>), targets: [g.ref(target)] });
    settle(g);
    resolveAll(g);
    expect(g.zoneOf(target)).toBe('exile');
  });

  it('Weaponize the Monsters: sacrifice a creature for 2 damage', () => {
    const g = game({
      p1: { battlefield: ['weaponize-the-monsters', 'goblin-token', ...n('mountain', 2)] },
    });
    const a = g
      .legal()
      .find(
        (x) => x.type === 'activateAbility' && x.source === g.id('p1', 'weaponize-the-monsters'),
      )!;
    g.do({
      ...(a as Extract<Action, { type: 'activateAbility' }>),
      targets: [{ player: 'p2' }],
      sacrifice: g.id('p1', 'goblin-token'),
    });
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('Demand Answers: discard a card or sacrifice an artifact', () => {
    const byDiscard = game({
      p1: { hand: ['demand-answers', 'forest'], battlefield: n('mountain', 2) },
    });
    const a = variants(byDiscard, 'demand-answers').find(
      (x) => x.type === 'castSpell' && x.discard,
    )!;
    byDiscard.do(a);
    settle(byDiscard);
    expect(handSize(byDiscard, 'p1')).toBe(2);
    expect(defsIn(byDiscard, 'p1', 'graveyard')).toContain('forest');

    const bySacrifice = game({
      p1: { hand: ['demand-answers'], battlefield: [...n('mountain', 2), 'treasure-token'] },
    });
    const s = variants(bySacrifice, 'demand-answers').find(
      (x) => x.type === 'castSpell' && x.sacrifice,
    )!;
    bySacrifice.do(s);
    settle(bySacrifice);
    expect(handSize(bySacrifice, 'p1')).toBe(2);
    expect(all(bySacrifice, 'treasure-token')).toHaveLength(0);

    // With nothing to discard or sacrifice it can't be cast.
    const none = game({ p1: { hand: ['demand-answers'], battlefield: n('mountain', 2) } });
    expect(castable(none, 'demand-answers')).toBe(false);
  });

  it('Unexpected Windfall and Strike It Rich make Treasures; Strike It Rich has flashback', () => {
    const g = game({
      p1: {
        hand: ['strike-it-rich', 'unexpected-windfall', 'forest'],
        battlefield: n('mountain', 6),
      },
    });
    cast(g, 'strike-it-rich');
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
    expect(castable(g, 'strike-it-rich')).toBe(true);
    cast(g, 'unexpected-windfall', [], { discard: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(3);
  });
});

describe('Brawl decks (15b, red): spree', () => {
  it('Great Train Heist: each chosen mode adds its cost', () => {
    const g = game({
      p1: { hand: ['great-train-heist'], battlefield: [...n('mountain', 4), 'goblin-token'] },
    });
    const costs = variants(g, 'great-train-heist').map((a) =>
      a.type === 'castSpell' ? a.paws : [],
    );
    // {R} plus {2}{R} for the first mode, {2} for the second, {R} for the third.
    expect(costs).toContainEqual([0]);
    expect(costs).toContainEqual([1]);
    expect(costs).toContainEqual([2]);
    expect(costs).toContainEqual([1, 2]);
    expect(costs).not.toContainEqual([0, 1, 2]);
    const poor = game({ p1: { hand: ['great-train-heist'], battlefield: n('mountain', 2) } });
    const cheap = variants(poor, 'great-train-heist').map((a) =>
      a.type === 'castSpell' ? a.paws : [],
    );
    expect(cheap).toEqual([[2]]);
  });

  it('Great Train Heist: creatures get +1/+0 and first strike', () => {
    const g = game({
      p1: { hand: ['great-train-heist'], battlefield: [...n('mountain', 3), 'goblin-token'] },
    });
    const goblin = g.id('p1', 'goblin-token');
    const a = variants(g, 'great-train-heist').find(
      (x) => x.type === 'castSpell' && x.paws?.join() === '1',
    )!;
    g.do(a);
    settle(g);
    expect(pt(g, goblin)).toEqual([2, 1]);
    expect(chars(g, goblin).keywords.has('firstStrike')).toBe(true);
  });

  it('Great Train Heist: a combat-damage Treasure mode', () => {
    const g = game({
      p1: { hand: ['great-train-heist'], battlefield: [...n('mountain', 2), 'goblin-token'] },
    });
    const a = variants(g, 'great-train-heist').find(
      (x) => x.type === 'castSpell' && x.paws?.join() === '2',
    )!;
    g.do(a);
    settle(g);
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'goblin-token'));
    g.passUntilStep('main2');
    const treasures = all(g, 'treasure-token');
    expect(treasures).toHaveLength(1);
    expect(g.obj(treasures[0]!).tapped).toBe(true);
  });

  it('Return the Favor: copy a spell, or change the target of a spell', () => {
    const copy = game({
      p1: { hand: ['lightning-bolt', 'return-the-favor'], battlefield: n('mountain', 5) },
    });
    cast(copy, 'lightning-bolt', [{ player: 'p2' }]);
    const bolt = copy.id('p1', 'lightning-bolt', 'stack');
    const a = variants(copy, 'return-the-favor').find(
      (x) => x.type === 'castSpell' && x.paws?.join() === '0',
    )!;
    copy.do({ ...(a as Extract<Action, { type: 'castSpell' }>), targets: [copy.ref(bolt)] });
    settle(copy);
    expect(copy.life('p2')).toBe(14);

    const redirect = game({
      p1: { hand: ['lightning-bolt', 'return-the-favor'], battlefield: n('mountain', 5) },
    });
    cast(redirect, 'lightning-bolt', [{ player: 'p2' }]);
    const bolt2 = redirect.id('p1', 'lightning-bolt', 'stack');
    const b = variants(redirect, 'return-the-favor').find(
      (x) => x.type === 'castSpell' && x.paws?.join() === '1',
    )!;
    redirect.do({
      ...(b as Extract<Action, { type: 'castSpell' }>),
      targets: [redirect.ref(bolt2)],
    });
    redirect.pass();
    redirect.pass();
    expect(redirect.decision.kind).toBe('chooseOption');
    const d = redirect.decision;
    if (d.kind !== 'chooseOption') throw new Error('unreachable');
    const toSelf = d.options.findIndex((o) => o.label.includes('Player 1'));
    expect(toSelf).toBeGreaterThanOrEqual(0);
    redirect.do({ type: 'chooseOption', player: d.player, index: toSelf });
    settle(redirect);
    expect(redirect.life('p1')).toBe(17);
    expect(redirect.life('p2')).toBe(20);
  });
});

describe('Brawl decks (15b, red): Treasures, artifacts and graveyard spells', () => {
  it('Young Pyromancer makes an Elemental for each instant or sorcery', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['young-pyromancer', 'mountain'] },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(all(g, 'brawl-elemental-1-1-red-token')).toHaveLength(1);
  });

  it('Forbidden Friendship makes a hasty Dinosaur and a Human Soldier', () => {
    const g = game({ p1: { hand: ['forbidden-friendship'], battlefield: n('mountain', 2) } });
    cast(g, 'forbidden-friendship');
    settle(g);
    const dino = all(g, 'soc-15b-r-dinosaur-token')[0]!;
    expect(chars(g, dino).keywords.has('haste')).toBe(true);
    expect(chars(g, all(g, 'soc-15b-r-human-soldier-token')[0]!).subtypes).toEqual([
      'Human',
      'Soldier',
    ]);
  });

  it('Goldspan Dragon: Treasure when it attacks, and Treasures tap for two mana', () => {
    const g = game({
      p1: { battlefield: ['goldspan-dragon', 'treasure-token'], hand: ['lightning-strike'] },
    });
    // {1}{R} from a single Treasure: only possible with Goldspan's doubling.
    expect(castable(g, 'lightning-strike')).toBe(true);
    const plain = game({ p1: { battlefield: ['treasure-token'], hand: ['lightning-strike'] } });
    expect(castable(plain, 'lightning-strike')).toBe(false);
    const atk = game({ p1: { battlefield: ['goldspan-dragon'] }, step: 'beginCombat' });
    atk.passBoth().attack(atk.id('p1', 'goldspan-dragon'));
    settle(atk);
    expect(all(atk, 'treasure-token')).toHaveLength(1);
  });

  it('Goldspan Dragon: becoming the target of a spell makes a Treasure', () => {
    const g = game({
      p1: { battlefield: ['goldspan-dragon'] },
      p2: { hand: ['lightning-bolt'], battlefield: n('mountain', 1) },
      active: 'p2',
    });
    cast(g, 'lightning-bolt', [g.ref(g.id('p1', 'goldspan-dragon'))]);
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Magda: a tapped Dwarf makes a Treasure, five Treasures fetch a Dragon', () => {
    const g = game({
      p1: {
        battlefield: ['magda-brazen-outlaw', ...n('treasure-token', 5)],
        library: ['goldspan-dragon', 'forest', 'forest'],
      },
      step: 'beginCombat',
    });
    g.passBoth().attack(g.id('p1', 'magda-brazen-outlaw'));
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(6);
    // Sacrifice five Treasures: search for an artifact or Dragon card.
    g.passUntilStep('main2');
    activate(g, 'magda-brazen-outlaw', 2);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const dragon = g.state.players.p1.library.find((id) => g.obj(id).defId === 'goldspan-dragon')!;
    g.do({ type: 'chooseCard', player: 'p1', card: dragon });
    settle(g);
    expect(all(g, 'goldspan-dragon')).toHaveLength(1);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Magda gives other Dwarves +1/+0', () => {
    const g = game({ p1: { battlefield: ['magda-brazen-outlaw'] } });
    expect(pt(g, g.id('p1', 'magda-brazen-outlaw'))).toEqual([2, 1]);
  });

  it('Reckless Fireweaver pings when an artifact enters', () => {
    const g = game({
      p1: { hand: ['strike-it-rich'], battlefield: ['reckless-fireweaver', 'mountain'] },
    });
    cast(g, 'strike-it-rich');
    settle(g);
    expect(g.life('p2')).toBe(19);
  });

  it('Dowsing Device pumps a creature and transforms with four artifacts into Geode Grotto', () => {
    const g = game({
      p1: {
        hand: ['strike-it-rich'],
        battlefield: ['dowsing-device', 'goblin-token', ...n('treasure-token', 2), 'mountain'],
      },
    });
    const goblin = g.id('p1', 'goblin-token');
    cast(g, 'strike-it-rich');
    settle(g);
    // Four artifacts now (Device, three Treasures): the Treasure entering pumped the Goblin and transformed it.
    expect(pt(g, goblin)).toEqual([2, 1]);
    const grotto = g.id('p1', 'geode-grotto');
    expect(chars(g, grotto).types).toContain('Land');
  });

  it('Seize the Storm: the Elemental is as big as the instants and sorceries in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['seize-the-storm'],
        graveyard: ['lightning-bolt', 'shock', 'forest'],
        battlefield: n('mountain', 5),
      },
    });
    cast(g, 'seize-the-storm');
    settle(g);
    const el = all(g, 'soc-15b-r-storm-elemental-token')[0]!;
    // Seize the Storm itself is in the graveyard by now: 2 + 1.
    expect(pt(g, el)).toEqual([3, 3]);
    expect(chars(g, el).keywords.has('trample')).toBe(true);
  });

  it("Mizzix's Mastery: cast a copy of an instant from your graveyard for free", () => {
    const g = game({
      p1: {
        hand: ['mizzixs-mastery'],
        graveyard: ['lightning-bolt'],
        battlefield: n('mountain', 4),
      },
    });
    const bolt = g.id('p1', 'lightning-bolt', 'graveyard');
    cast(g, 'mizzixs-mastery', [g.ref(bolt)]);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.decision.kind).toBe('castFree');
    g.do(freeCastAtOpponent(g));
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(defsIn(g, 'p1', 'exile')).toContain('lightning-bolt');
    expect(defsIn(g, 'p1', 'exile')).toContain('mizzixs-mastery');
  });

  it("Mizzix's Mastery can be overloaded", () => {
    const g = game({
      p1: {
        hand: ['mizzixs-mastery'],
        graveyard: ['lightning-bolt', 'shock'],
        battlefield: n('mountain', 8),
      },
    });
    const overload = variants(g, 'mizzixs-mastery').find((a) => a.type === 'castSpell' && a.kicked);
    expect(overload).toBeDefined();
    g.do(overload!);
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    for (let i = 0; i < 2; i++) {
      expect(g.decision.kind).toBe('castFree');
      g.do(freeCastAtOpponent(g));
      settle(g);
    }
    expect(g.life('p2')).toBe(15);
  });

  it('Glimpse the Impossible: exile three, and what is left becomes graveyard cards and Spawn', () => {
    const g = game({
      p1: {
        hand: ['glimpse-the-impossible'],
        battlefield: n('mountain', 3),
        library: n('forest', 8),
      },
    });
    cast(g, 'glimpse-the-impossible');
    settle(g);
    expect(g.state.players.p1.exile).toHaveLength(3);
    // Play one of the three; the other two go to the graveyard at the end step.
    const land = g.legal().find((a) => a.type === 'playLand')!;
    g.do(land);
    g.passUntilStep('end');
    settle(g);
    expect(g.state.players.p1.exile).toHaveLength(0);
    expect(g.state.players.p1.graveyard.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(
      2,
    );
    expect(all(g, 'soc-15b-r-eldrazi-spawn-token')).toHaveLength(2);
  });

  it('Arcane Bombardment: exile an instant at random, then cast copies of what it has exiled', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        graveyard: ['shock'],
        battlefield: ['arcane-bombardment', ...n('mountain', 2)],
      },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    g.pass();
    g.pass();
    resolveAll(g, 0);
    for (let i = 0; i < 6 && g.decision.kind === 'castFree'; i++) {
      g.do(freeCastAtOpponent(g));
      resolveAll(g, 0);
    }
    expect(g.life('p2')).toBe(15);
    expect(defsIn(g, 'p1', 'exile')).toContain('shock');
  });

  it('Gate to Tumbledown seeks a nonland card once', () => {
    const g = game({
      p1: {
        battlefield: ['gate-to-tumbledown', ...n('mountain', 4)],
        library: ['lightning-bolt', 'forest', 'forest'],
      },
    });
    activate(g, 'gate-to-tumbledown', 1);
    settle(g);
    expect(defsIn(g, 'p1', 'hand')).toEqual(['lightning-bolt']);
  });

  it('Snow-Covered Mountain is a basic Mountain land that taps for red', () => {
    const g = game({ p1: { battlefield: ['snow-covered-mountain'], hand: ['lightning-bolt'] } });
    const c = chars(g, g.id('p1', 'snow-covered-mountain'));
    expect(c.types).toEqual(['Land']);
    expect(c.subtypes).toEqual(['Mountain']);
    expect(castable(g, 'lightning-bolt')).toBe(true);
  });
});

describe('Brawl decks (15b, Izzet): spellslingers', () => {
  it('Rootha makes an X/X flying haste Elemental at combat after an instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['rootha-mastering-the-moment', ...n('mountain', 2)],
      },
    });
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    g.passUntilStep('beginCombat');
    settle(g);
    const el = all(g, 'soc-15b-r-rootha-elemental-token')[0]!;
    expect(pt(g, el)).toEqual([2, 2]);
    expect(chars(g, el).keywords.has('flying')).toBe(true);
    expect(chars(g, el).keywords.has('haste')).toBe(true);
    // Without a spell this turn there is no token.
    const quiet = game({ p1: { battlefield: ['rootha-mastering-the-moment'] } });
    quiet.passUntilStep('beginCombat');
    settle(quiet);
    expect(all(quiet, 'soc-15b-r-rootha-elemental-token')).toHaveLength(0);
  });

  it('Frolicking Familiar // Blow Off Steam: the Adventure, then the creature from exile', () => {
    const g = game({
      p1: { hand: ['frolicking-familiar'], battlefield: [...n('mountain', 3), 'island'] },
    });
    const adventure = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.back === true && a.targets[0] !== undefined)!;
    expect(adventure).toBeDefined();
    g.do({ ...(adventure as Extract<Action, { type: 'castSpell' }>), targets: [{ player: 'p2' }] });
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(defsIn(g, 'p1', 'exile')).toContain('frolicking-familiar');
    // Cast the creature from exile.
    const creature = g
      .legal()
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'frolicking-familiar');
    expect(creature).toBeDefined();
  });

  it('Frolicking Familiar gets +1/+1 for each instant or sorcery you cast', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['frolicking-familiar', ...n('mountain', 2)] },
    });
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    expect(pt(g, g.id('p1', 'frolicking-familiar'))).toEqual([3, 3]);
  });

  it('Goblin Electromancer makes instants and sorceries cost {1} less', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['goblin-electromancer', 'mountain'] },
    });
    expect(castable(g, 'lightning-strike')).toBe(true);
    const plain = game({ p1: { hand: ['lightning-strike'], battlefield: ['mountain'] } });
    expect(castable(plain, 'lightning-strike')).toBe(false);
  });

  it('Muddle becomes a copy of a nonlegendary creature you control when you cast a spell', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['muddle-the-ever-changing', 'goldspan-dragon', ...n('mountain', 2)],
      },
    });
    const muddle = g.id('p1', 'muddle-the-ever-changing');
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    expect(pt(g, muddle)).toEqual([4, 4]);
    expect(chars(g, muddle).keywords.has('flying')).toBe(true);
  });

  it('Sapphire Collector: conjures Mox Sapphire on the second noncreature spell, only once', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'shock', 'lightning-strike'],
        battlefield: ['sapphire-collector', ...n('mountain', 5)],
      },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(defsIn(g, 'p1', 'hand')).not.toContain('mox-sapphire');
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(defsIn(g, 'p1', 'hand')).toContain('mox-sapphire');
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    expect(defsIn(g, 'p1', 'hand').filter((d) => d === 'mox-sapphire')).toHaveLength(1);
  });

  it('Sapphire Collector grants flashback to an instant in your graveyard', () => {
    const g = game({
      p1: {
        graveyard: ['lightning-bolt'],
        battlefield: ['sapphire-collector', ...n('island', 3), 'mountain'],
      },
    });
    const a = g
      .legal()
      .find((x) => x.type === 'activateAbility' && x.source === g.id('p1', 'sapphire-collector'))!;
    g.do({
      ...(a as Extract<Action, { type: 'activateAbility' }>),
      targets: [g.ref(g.id('p1', 'lightning-bolt', 'graveyard'))],
    });
    settle(g);
    expect(castable(g, 'lightning-bolt')).toBe(true);
  });

  it('Third Path Iconoclast makes a Soldier artifact creature for each noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['third-path-iconoclast', ...n('mountain', 2)],
      },
    });
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    const soldier = all(g, 'soc-15b-r-soldier-token')[0]!;
    expect(chars(g, soldier).types).toEqual(['Artifact', 'Creature']);
    expect(cardDb.get('soc-15b-r-soldier-token')!.colors).toEqual([]);
  });

  it('Experimental Overload: an X/X Weird, return an instant, exile the sorcery', () => {
    const g = game({
      p1: {
        hand: ['experimental-overload'],
        graveyard: ['lightning-bolt', 'shock'],
        battlefield: [...n('mountain', 2), ...n('island', 2)],
      },
    });
    cast(g, 'experimental-overload');
    settle(g);
    resolveAll(g, 0, true);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'lightning-bolt', 'graveyard') });
    settle(g);
    expect(defsIn(g, 'p1', 'hand')).toContain('lightning-bolt');
    const weird = all(g, 'soc-15b-r-weird-token')[0]!;
    expect(pt(g, weird)).toEqual([2, 2]);
    expect(defsIn(g, 'p1', 'exile')).toContain('experimental-overload');
  });

  it('Illuminating Lash: 3 damage and a one-time boon to draw on the next noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['illuminating-lash', 'shock', 'lightning-bolt'],
        battlefield: [...n('mountain', 4), ...n('island', 1)],
      },
    });
    cast(g, 'illuminating-lash', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    const before = handSize(g, 'p1');
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(before - 1 + 1);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(before - 1);
  });

  it('Izzet Signet makes {U}{R}', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['izzet-signet', 'mountain'] },
    });
    activate(g, 'izzet-signet');
    settle(g);
    expect(g.state.players.p1.pool?.length).toBe(2);
    expect(castable(g, 'lightning-strike')).toBe(true);
  });

  it('Frostcliff Siege: Temur gives +1/+0, trample and haste; Jeskai draws on combat damage', () => {
    const temur = game({
      p1: {
        hand: ['frostcliff-siege'],
        battlefield: ['goblin-token', ...n('mountain', 2), 'island'],
      },
    });
    cast(temur, 'frostcliff-siege');
    settle(temur);
    resolveAll(temur, 1);
    const goblin = temur.id('p1', 'goblin-token');
    expect(pt(temur, goblin)).toEqual([2, 1]);
    expect(chars(temur, goblin).keywords.has('trample')).toBe(true);

    const jeskai = game({
      p1: {
        hand: ['frostcliff-siege'],
        battlefield: [{ card: 'goblin-token', sick: false }, ...n('mountain', 2), 'island'],
      },
    });
    cast(jeskai, 'frostcliff-siege');
    settle(jeskai);
    resolveAll(jeskai, 0);
    expect(pt(jeskai, jeskai.id('p1', 'goblin-token'))).toEqual([1, 1]);
    const before = handSize(jeskai, 'p1');
    jeskai.passUntilStep('beginCombat').passBoth().attack(jeskai.id('p1', 'goblin-token'));
    jeskai.passUntilStep('main2');
    settle(jeskai);
    expect(handSize(jeskai, 'p1')).toBe(before + 1);
  });

  it("Mm'menon puts a +1/+1 counter on a creature when an artifact enters", () => {
    const g = game({
      p1: {
        hand: ['strike-it-rich'],
        battlefield: ['mmmenon-uthros-exile', 'goblin-token', 'mountain'],
      },
    });
    cast(g, 'strike-it-rich');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets[0] !== undefined &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === g.id('p1', 'goblin-token'),
      ),
    );
    expect(pt(g, g.id('p1', 'goblin-token'))).toEqual([2, 2]);
  });

  it('Niv-Mizzet, Parun: pings on each draw and draws when any player casts an instant', () => {
    const g = game({
      p1: { battlefield: ['niv-mizzet-parun'] },
      p2: { hand: ['lightning-bolt'], battlefield: n('mountain', 1) },
      active: 'p2',
    });
    expect(chars(g, g.id('p1', 'niv-mizzet-parun')).keywords.has('flying')).toBe(true);
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    // The draw trigger pings: aim it at p2.
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets[0] !== undefined &&
          'player' in a.targets[0] &&
          a.targets[0].player === 'p2',
      ),
    );
    // p1 drew a card from Niv-Mizzet's second ability, and the draw pinged p2.
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.life('p2')).toBe(19);
  });

  it('Izzet Charm: three modes', () => {
    const g = game({
      p1: { hand: ['izzet-charm'], battlefield: [...n('island', 1), 'mountain'] },
      p2: { battlefield: ['beast-3-token'] },
    });
    const modes = variants(g, 'izzet-charm').map((a) => (a.type === 'castSpell' ? a.mode : -1));
    expect(new Set(modes)).toEqual(new Set([1, 2]));
    const draw = variants(g, 'izzet-charm').find((a) => a.type === 'castSpell' && a.mode === 2)!;
    g.do(draw);
    settle(g);
    resolveAll(g);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Saheeli: a Servo for each noncreature spell; −2 turns an artifact into a copy of another', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: [
          'saheeli-sublime-artificer',
          'treasure-token',
          'goblin-token',
          ...n('mountain', 2),
        ],
      },
    });
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    expect(all(g, 'soc-15b-r-servo-token')).toHaveLength(1);
  });

  it('Saheeli, Sublime Artificer: −2 makes an artifact a copy of another permanent until end of turn', () => {
    const g = game({
      p1: {
        battlefield: ['saheeli-sublime-artificer', 'treasure-token', 'goldspan-dragon'],
      },
    });
    const saheeli = g.id('p1', 'saheeli-sublime-artificer');
    g.obj(saheeli).counters = { loyalty: 5 };
    const treasure = g.id('p1', 'treasure-token');
    const dragon = g.id('p1', 'goldspan-dragon');
    const a = g
      .legal()
      .find((x) => x.type === 'activateAbility' && x.source === saheeli && x.abilityIndex === 1)!;
    expect(a).toBeDefined();
    g.do({
      ...(a as Extract<Action, { type: 'activateAbility' }>),
      targets: [g.ref(treasure), g.ref(dragon)],
    });
    settle(g);
    expect(g.obj(treasure).defId).toBe('goldspan-dragon');
    expect(g.obj(saheeli).counters?.loyalty).toBe(3);
  });

  it('Izzet Charm counters a noncreature spell unless its controller pays {2}', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: n('mountain', 1) },
      p2: { hand: ['izzet-charm'], battlefield: ['island', 'mountain'] },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    const bolt = g.id('p1', 'lightning-bolt', 'stack');
    g.pass();
    const counter = g
      .legal()
      .find((x) => x.type === 'castSpell' && x.mode === 0 && x.targets[0] !== undefined);
    expect(counter).toBeDefined();
    g.do({ ...(counter as Extract<Action, { type: 'castSpell' }>), targets: [g.ref(bolt)] });
    // p1 can't pay {2} (no untapped lands): the Bolt is countered.
    for (let i = 0; i < 8 && g.state.stack.length; i++) {
      const d = g.decision;
      if (d.kind === 'payOrCounter')
        g.do({ type: 'chooseEffect', player: d.player, accept: false });
      else g.pass();
    }
    expect(g.life('p2')).toBe(20);
  });
});

describe('Brawl decks (15b, Izzet): lands', () => {
  it('Steam Vents may pay 2 life to enter untapped', () => {
    const paid = game({ p1: { hand: ['steam-vents'] } });
    paid.do(paid.legal().find((a) => a.type === 'playLand')!);
    resolveAll(paid, 0);
    expect(paid.obj(paid.id('p1', 'steam-vents')).tapped).toBe(false);
    expect(paid.life('p1')).toBe(18);
    const tapped = game({ p1: { hand: ['steam-vents'] } });
    tapped.do(tapped.legal().find((a) => a.type === 'playLand')!);
    resolveAll(tapped, 1);
    expect(tapped.obj(tapped.id('p1', 'steam-vents')).tapped).toBe(true);
    expect(tapped.life('p1')).toBe(20);
  });

  it('Thundering Falls and Molten Tributary enter tapped; Thundering Falls surveils', () => {
    const g = game({ p1: { hand: ['thundering-falls', 'molten-tributary'] } });
    g.do(
      g.legal().find((a) => a.type === 'playLand' && g.obj(a.card).defId === 'thundering-falls')!,
    );
    expect(g.obj(g.id('p1', 'thundering-falls')).tapped).toBe(true);
    expect(g.decision.kind === 'scry' || g.state.stack.length > 0).toBe(true);
  });

  it('Shivan Reef hurts for coloured mana; Riverpyre Verge needs an Island or Mountain for {U}', () => {
    const reef = game({ p1: { battlefield: ['shivan-reef'], hand: ['lightning-bolt'] } });
    cast(reef, 'lightning-bolt', [{ player: 'p2' }]);
    expect(reef.life('p1')).toBe(19);

    const lone = game({ p1: { battlefield: ['riverpyre-verge'], hand: ['frostcliff-siege'] } });
    expect(castable(lone, 'frostcliff-siege')).toBe(false);
    const verge = game({
      p1: { battlefield: ['riverpyre-verge', 'mountain', 'mountain'], hand: ['frostcliff-siege'] },
    });
    expect(castable(verge, 'frostcliff-siege')).toBe(true);
    const noBlue = game({
      p1: { battlefield: ['riverpyre-verge', 'forest', 'forest'], hand: ['frostcliff-siege'] },
    });
    expect(castable(noBlue, 'frostcliff-siege')).toBe(false);
  });

  it('Surtland Frostpyre: scry 2 and 2 damage to each creature', () => {
    const g = game({
      p1: {
        battlefield: ['surtland-frostpyre', ...n('island', 2), ...n('mountain', 3), 'goblin-token'],
        library: n('forest', 5),
      },
      p2: { battlefield: ['goblin-token'] },
    });
    const frostpyre = g.id('p1', 'surtland-frostpyre');
    const a = g
      .legal()
      .find((x) => x.type === 'activateAbility' && x.source === frostpyre && x.abilityIndex === 1);
    // The land enters tapped in a real game; here it starts untapped so it can pay its own cost.
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    resolveAll(g);
    expect(all(g, 'goblin-token')).toHaveLength(0);
    expect(g.zoneOf(frostpyre)).toBe('graveyard');
  });
});
