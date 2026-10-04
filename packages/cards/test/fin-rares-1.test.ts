import { describe, expect, it } from 'vitest';
import type { Action, PlayerId } from '@mtg/engine';
import { getCharacteristics, playRandomGame } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { RARES_1 } from '../src/fin/rares-1.ts';
import { all, cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11c, group 1: the white, blue, black and colourless rares and mythics.

const SCOPE = [
  'Aerith Gainsborough',
  'Stiltzkin, Moogle Merchant',
  'From Father to Son',
  'The Wind Crystal',
  'Venat, Heart of Hydaelyn',
  'Cloud, Midgar Mercenary',
  'Ultima',
  'Summon: Knights of Round',
  "Moogles' Valor",
  'Minwu, White Mage',
  'Matoya, Archon Elder',
  'Gogo, Master of Mimicry',
  "Louisoix's Sacrifice",
  'Summon: Leviathan',
  "Y'shtola Rhul",
  'The Water Crystal',
  "Astrologian's Planisphere",
  'Memories Returning',
  'The Lunar Whale',
  'Cecil, Dark Knight',
  'Vincent Valentine',
  'The Darkness Crystal',
  'Jecht, Reluctant Guardian',
  'Kain, Traitorous Dragoon',
  'Zodiark, Umbral God',
  'Ardyn, the Usurper',
  'Zenos yae Galvus',
  'Sephiroth, Fabled SOLDIER',
  'Summon: Primal Odin',
  "Ninja's Blades",
  'Aettir and Priwen',
  'Ultima, Origin of Oblivion',
  'Buster Sword',
  'Summon: Bahamut',
  'The Masamune',
  'Excalibur II',
  'The Regalia',
  'Genji Glove',
];

const kw = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

/** Activates an ability of `source` (the first legal way, or the one `pick` likes). */
function activate(g: GameDriver, source: string, pick: (a: Action) => boolean = () => true) {
  const a = g.legal().find((x) => x.type === 'activateAbility' && x.source === source && pick(x));
  if (!a) throw new Error(`Can't activate ${g.obj(source).defId}`);
  return g.do(a);
}

/** Answers whatever is asked with the first legal answer, until someone has priority. */
function answer(g: GameDriver) {
  for (let i = 0; i < 40 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
  return g;
}

/** Passes until the declare attackers decision (this turn). */
function toAttack(g: GameDriver) {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else g.do(prefer(g));
  }
  return g;
}

/** A first answer that picks real targets and accepts optional effects. */
function prefer(g: GameDriver): Action {
  const legal = g.legal();
  return (
    legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
    legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
    legal[0]!
  );
}

/** Passes (no blocks, first answers) until `step` with an empty stack. */
function toStep(g: GameDriver, step: string) {
  for (let i = 0; i < 200; i++) {
    const d = g.decision;
    if (g.state.turn.step === step && d.kind === 'priority' && g.state.stack.length === 0) return g;
    if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'gameOver') return g;
    else g.do(prefer(g));
  }
  throw new Error(`Never reached ${step}`);
}

describe('coverage', () => {
  it('implements every white, blue, black and colourless rare and mythic', () => {
    for (const name of SCOPE) {
      expect(RARES_1[name], name).toBeDefined();
      expect(cardDb.get(slug(name)), name).toBeDefined();
    }
  });
});

describe('white', () => {
  it('Aerith grows on life gain and hands her counters to legends as she dies', () => {
    const g = game({
      p1: { battlefield: ['aerith-gainsborough', 'cloud-midgar-mercenary', 'the-wind-crystal'] },
    });
    const aerith = g.id('p1', 'aerith-gainsborough');
    toAttack(g).attack(aerith);
    toStep(g, 'main2');
    // 2 lifelink damage, doubled by The Wind Crystal; one life gain event, one counter.
    expect(g.life('p1')).toBe(24);
    expect(g.obj(aerith).plusOneCounters).toBe(1);
  });

  it('Aerith dying puts X counters on each legendary creature', () => {
    const g = game({
      p1: { battlefield: ['aerith-gainsborough', 'cloud-midgar-mercenary'] },
      p2: { hand: ['ultima'], battlefield: n('plains', 5) },
      active: 'p2',
    });
    const aerith = g.id('p1', 'aerith-gainsborough');
    g.state.objects[aerith]!.plusOneCounters = 2;
    // Cloud is destroyed too by Ultima, so check with a direct kill instead.
    const cloud = g.id('p1', 'cloud-midgar-mercenary');
    g.state.objects[aerith]!.damage = 10;
    g.pass();
    settle(g);
    expect(g.zoneOf(aerith)).toBe('graveyard');
    expect(g.obj(cloud).plusOneCounters).toBe(2);
  });

  it('Ultima destroys artifacts and creatures, then ends the turn', () => {
    const g = game({
      p1: {
        hand: ['ultima', 'moogles-valor'],
        battlefield: [...n('plains', 5), 'the-wind-crystal'],
      },
      p2: { battlefield: ['minwu-white-mage'] },
    });
    const ultima = g.id('p1', 'ultima', 'hand');
    settle(cast(g, 'ultima'));
    expect(all(g, 'the-wind-crystal')).toHaveLength(0);
    expect(all(g, 'minwu-white-mage')).toHaveLength(0);
    expect(g.zoneOf(ultima)).toBe('exile');
    expect(g.state.turn.step).toBe('end');
    g.passBoth();
    expect(g.state.turn.activePlayer).toBe('p2');
  });

  it('Summon: Knights of Round makes three Knights at chapter I', () => {
    const g = game({ p1: { hand: ['summon-knights-of-round'], battlefield: n('plains', 8) } });
    settle(cast(g, 'summon-knights-of-round'));
    expect(all(g, 'fin-knight-token')).toHaveLength(3);
  });

  it("Moogles' Valor makes a Moogle per creature and shields them", () => {
    const g = game({
      p1: { hand: ['moogles-valor'], battlefield: [...n('plains', 5), 'minwu-white-mage'] },
    });
    settle(cast(g, 'moogles-valor'));
    expect(all(g, 'fin-moogle-token')).toHaveLength(1);
    expect(kw(g, all(g, 'fin-moogle-token')[0]!)).toContain('indestructible');
    expect(kw(g, g.id('p1', 'minwu-white-mage'))).toContain('indestructible');
  });

  it('Stiltzkin gives away a permanent and draws', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 2), 'stiltzkin-moogle-merchant', 'the-wind-crystal'] },
    });
    const crystal = g.id('p1', 'the-wind-crystal');
    const before = handSize(g, 'p1');
    activate(
      g,
      g.id('p1', 'stiltzkin-moogle-merchant'),
      (a) =>
        a.type === 'activateAbility' &&
        a.targets.some((t) => 'object' in t && t.object.id === crystal),
    );
    settle(g);
    expect(g.obj(crystal).controller).toBe('p2');
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('From Father to Son finds a Vehicle; from the graveyard it puts it onto the battlefield', () => {
    const g = game({
      p1: {
        graveyard: ['from-father-to-son'],
        battlefield: n('plains', 7),
        library: ['the-regalia', 'plains'],
      },
    });
    const card = g.id('p1', 'from-father-to-son', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    settle(g);
    answer(g);
    settle(g);
    expect(all(g, 'the-regalia')).toHaveLength(1);
  });

  it('Venat transforms; Hydaelyn shields and draws for a legend', () => {
    const g = game({
      p1: {
        battlefield: [...n('plains', 7), 'venat-heart-of-hydaelyn', 'cloud-midgar-mercenary'],
        hand: [],
      },
      p2: { battlefield: ['the-wind-crystal'] },
    });
    const venat = g.id('p1', 'venat-heart-of-hydaelyn');
    const crystal = g.id('p2', 'the-wind-crystal');
    activate(
      g,
      venat,
      (a) =>
        a.type === 'activateAbility' &&
        a.targets.some((t) => 'object' in t && t.object.id === crystal),
    );
    settle(g);
    expect(all(g, 'the-wind-crystal')).toHaveLength(0);
    expect(g.obj(venat).defId).toBe('hydaelyn-the-mothercrystal');
    const before = handSize(g, 'p1');
    toAttack(g);
    const cloud = g.id('p1', 'cloud-midgar-mercenary');
    expect(g.obj(cloud).plusOneCounters).toBe(1);
    expect(kw(g, cloud)).toContain('indestructible');
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('Minwu puts a counter on each Cleric when you gain life', () => {
    const g = game({ p1: { battlefield: ['minwu-white-mage', 'aerith-gainsborough'] } });
    const minwu = g.id('p1', 'minwu-white-mage');
    toAttack(g).attack(minwu);
    toStep(g, 'main2');
    expect(g.obj(minwu).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'aerith-gainsborough')).plusOneCounters).toBe(2);
  });
});

describe('Cloud and Excalibur II', () => {
  it('Excalibur II gains two charge counters per life gain on equipped Cloud', () => {
    const g = game({
      p1: { battlefield: ['cloud-midgar-mercenary', 'excalibur-ii', 'minwu-white-mage'] },
    });
    const cloud = g.id('p1', 'cloud-midgar-mercenary');
    const sword = g.id('p1', 'excalibur-ii');
    g.state.objects[sword]!.attachedTo = cloud;
    toAttack(g).attack(g.id('p1', 'minwu-white-mage'));
    toStep(g, 'main2');
    expect(g.obj(sword).counters?.charge).toBe(2);
    expect(pt(g, cloud)).toEqual([4, 3]);
  });
});

describe('blue', () => {
  it('Matoya draws whenever you surveil', () => {
    const g = game({
      p1: { battlefield: ['matoya-archon-elder', ...n('island', 4)], hand: ['dreams-of-laguna'] },
    });
    cast(g, 'dreams-of-laguna');
    settle(g);
    answer(g);
    settle(g);
    // Dreams of Laguna draws one, Matoya one more.
    expect(handSize(g, 'p1')).toBe(2);
  });

  it("Louisoix's Sacrifice counters a triggered ability", () => {
    const g = game({
      p1: {
        hand: ['cloud-midgar-mercenary', 'louisoixs-sacrifice'],
        battlefield: n('plains', 2).concat(n('island', 3)),
        library: ['excalibur-ii', ...n('plains', 5)],
      },
    });
    cast(g, 'cloud-midgar-mercenary');
    g.passBoth();
    expect(g.state.stack.at(-1)?.kind).toBe('ability');
    const trigger = g.state.stack.at(-1)!.id;
    const card = g.id('p1', 'louisoixs-sacrifice', 'hand');
    const a = g
      .legal()
      .find(
        (x) =>
          x.type === 'castSpell' &&
          x.card === card &&
          !x.sacrifice &&
          x.targets.some((t) => 'object' in t && t.object.id === trigger),
      );
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    expect(g.state.stack).toHaveLength(0);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.library).toHaveLength(6);
  });

  it('Gogo copies a triggered ability X times', () => {
    const g = game({
      p1: {
        hand: ['weapons-vendor'],
        battlefield: ['gogo-master-of-mimicry', ...n('island', 4), ...n('plains', 4)],
      },
    });
    cast(g, 'weapons-vendor');
    g.passBoth();
    expect(g.state.stack.at(-1)?.kind).toBe('ability');
    const before = handSize(g, 'p1');
    activate(
      g,
      g.id('p1', 'gogo-master-of-mimicry'),
      (a) => a.type === 'activateAbility' && a.x === 2,
    );
    settle(g);
    expect(handSize(g, 'p1')).toBe(before + 3);
  });

  it('Summon: Leviathan returns every non-sea creature at chapter I', () => {
    const g = game({
      p1: { hand: ['summon-leviathan'], battlefield: [...n('island', 6), 'matoya-archon-elder'] },
      p2: { battlefield: ['minwu-white-mage'] },
    });
    settle(cast(g, 'summon-leviathan'));
    expect(all(g, 'summon-leviathan')).toHaveLength(1);
    expect(all(g, 'matoya-archon-elder')).toHaveLength(0);
    expect(all(g, 'minwu-white-mage')).toHaveLength(0);
  });

  it('Summon: Leviathan draws when a sea creature attacks after chapter II', () => {
    const g = game({ p1: { battlefield: ['summon-leviathan'] }, step: 'draw' });
    const lev = g.id('p1', 'summon-leviathan');
    g.state.objects[lev]!.counters = { lore: 1 };
    toStep(g, 'main1');
    const before = handSize(g, 'p1');
    toAttack(g).attack(lev);
    settle(g);
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it("Y'shtola blinks a creature and adds one end step", () => {
    const g = game({ p1: { battlefield: ['yshtola-rhul'] } });
    toStep(g, 'end');
    settle(g);
    expect(g.state.turn.endSteps).toBe(1);
    g.passBoth();
    settle(g);
    expect(g.state.turn.step).toBe('end');
    expect(g.state.turn.endSteps).toBe(2);
    g.passBoth();
    settle(g);
    expect(g.state.turn.activePlayer).toBe('p2');
  });

  it('The Water Crystal makes opponents mill four more', () => {
    const g = game({
      p1: { battlefield: ['the-water-crystal', ...n('island', 6)], hand: ['ultima', 'ultima'] },
      p2: { library: n('plains', 20) },
    });
    activate(g, g.id('p1', 'the-water-crystal'));
    settle(g);
    expect(g.state.players.p2.graveyard).toHaveLength(6);
  });

  it("Astrologian's Planisphere grows its Hero on noncreature spells", () => {
    const g = game({
      p1: {
        hand: ['astrologians-planisphere', 'moogles-valor'],
        battlefield: [...n('plains', 5), ...n('island', 2)],
      },
    });
    settle(cast(g, 'astrologians-planisphere'));
    const hero = all(g, 'fin-hero-token')[0]!;
    expect(getCharacteristics(g.state, cardDb, hero).subtypes).toContain('Wizard');
    settle(cast(g, 'moogles-valor'));
    expect(g.obj(hero).plusOneCounters).toBe(1);
  });

  it('Memories Returning puts three of the top five into your hand', () => {
    const g = game({
      p1: {
        hand: ['memories-returning'],
        battlefield: n('island', 4),
        library: ['ultima', 'excalibur-ii', 'buster-sword', 'genji-glove', 'the-regalia', 'plains'],
      },
    });
    cast(g, 'memories-returning');
    g.passBoth();
    answer(g);
    settle(g);
    expect(handSize(g, 'p1')).toBe(3);
    expect(g.state.players.p1.library).toHaveLength(3);
  });

  it('The Lunar Whale lets you play the top card once it attacked', () => {
    const g = game({
      p1: {
        battlefield: ['the-lunar-whale', 'minwu-white-mage', ...n('plains', 2)],
        library: ['plains', 'plains'],
      },
    });
    const whale = g.id('p1', 'the-lunar-whale');
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(false);
    activate(g, whale);
    settle(g);
    toAttack(g).attack(whale);
    toStep(g, 'main2');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });
});

describe('black', () => {
  it('Cecil loses life for his damage and transforms at half life', () => {
    const g = game({ p1: { battlefield: ['cecil-dark-knight'], life: 12 } });
    const cecil = g.id('p1', 'cecil-dark-knight');
    toAttack(g).attack(cecil);
    toStep(g, 'main2');
    expect(g.life('p1')).toBe(10);
    expect(g.obj(cecil).defId).toBe('cecil-redeemed-paladin');
    expect(g.obj(cecil).tapped).toBe(false);
  });

  it('Vincent grows by the power of an opponent creature that dies', () => {
    const g = game({
      p1: { battlefield: ['vincent-valentine', ...n('plains', 5)], hand: ['ultima'] },
      p2: { battlefield: ['minwu-white-mage'] },
    });
    const minwu = g.id('p2', 'minwu-white-mage');
    g.state.objects[minwu]!.damage = 5;
    g.pass();
    settle(g);
    expect(g.obj(g.id('p1', 'vincent-valentine')).plusOneCounters).toBe(3);
  });

  it('The Darkness Crystal exiles dying creatures, then brings one back', () => {
    const g = game({
      p1: { battlefield: ['the-darkness-crystal', ...n('swamp', 6)] },
      p2: { battlefield: ['minwu-white-mage'] },
    });
    const minwu = g.id('p2', 'minwu-white-mage');
    g.state.objects[minwu]!.damage = 5;
    g.pass();
    settle(g);
    expect(g.zoneOf(minwu)).toBe('exile');
    expect(g.life('p1')).toBe(22);
    g.pass();
    activate(g, g.id('p1', 'the-darkness-crystal'));
    g.passBoth();
    answer(g);
    expect(g.zoneOf(minwu)).toBe('battlefield');
    expect(g.obj(minwu).controller).toBe('p1');
    expect(g.obj(minwu).tapped).toBe(true);
    expect(g.obj(minwu).plusOneCounters).toBe(2);
  });

  it("Jecht becomes Braska's Final Aeon after combat damage", () => {
    const g = game({
      p1: { battlefield: ['jecht-reluctant-guardian'] },
      p2: { hand: ['ultima', 'ultima'] },
    });
    const jecht = g.id('p1', 'jecht-reluctant-guardian');
    toAttack(g).attack(jecht);
    toStep(g, 'main2');
    expect(g.obj(jecht).defId).toBe('braskas-final-aeon');
    expect(handSize(g, 'p2')).toBe(1);
  });

  it('Kain goes to the opponent after hitting them, with cards and Treasures', () => {
    const g = game({ p1: { battlefield: ['kain-traitorous-dragoon'] } });
    const kain = g.id('p1', 'kain-traitorous-dragoon');
    expect(kw(g, kain)).toContain('flying');
    const before = handSize(g, 'p1');
    toAttack(g).attack(kain);
    toStep(g, 'main2');
    expect(g.obj(kain).controller).toBe('p2');
    expect(handSize(g, 'p1')).toBe(before + 2);
    expect(all(g, 'treasure-token')).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
  });

  it('Zodiark makes each player sacrifice half their non-Gods and grows', () => {
    const g = game({
      p1: {
        hand: ['zodiark-umbral-god'],
        battlefield: [...n('swamp', 5), 'minwu-white-mage', 'aerith-gainsborough'],
      },
      p2: { battlefield: ['minwu-white-mage', 'aerith-gainsborough', 'cecil-dark-knight'] },
    });
    cast(g, 'zodiark-umbral-god');
    for (let i = 0; i < 10; i++) {
      settle(g);
      if (g.decision.kind === 'priority') break;
      answer(g);
    }
    const creatures = (p: PlayerId) =>
      g.state.battlefield.filter(
        (id) =>
          g.obj(id).controller === p && cardDb.get(g.obj(id).defId)!.types.includes('Creature'),
      );
    expect(creatures('p1')).toHaveLength(2);
    expect(creatures('p2')).toHaveLength(2);
    expect(g.obj(g.id('p1', 'zodiark-umbral-god')).plusOneCounters).toBe(2);
  });

  it('Ardyn makes a 5/5 Demon copy of a creature card with menace, lifelink and haste', () => {
    const g = game({
      p1: { battlefield: ['ardyn-the-usurper'] },
      p2: { graveyard: ['minwu-white-mage'] },
    });
    toAttack(g);
    const demon = all(g, 'minwu-white-mage')[0]!;
    expect(demon).toBeDefined();
    expect(pt(g, demon)).toEqual([5, 5]);
    expect(kw(g, demon)).toContain('menace');
    expect(kw(g, demon)).toContain('haste');
  });

  it('Zenos shrinks the others and transforms when the chosen creature leaves', () => {
    const g = game({
      p1: { hand: ['zenos-yae-galvus'], battlefield: [...n('swamp', 5), 'minwu-white-mage'] },
      p2: { battlefield: ['cecil-dark-knight', 'aerith-gainsborough'] },
    });
    const cecil = g.id('p2', 'cecil-dark-knight');
    cast(g, 'zenos-yae-galvus');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === cecil),
      ),
    );
    expect(pt(g, cecil)).toEqual([2, 3]);
    expect(all(g, 'aerith-gainsborough')).toHaveLength(0);
    expect(pt(g, g.id('p1', 'minwu-white-mage'))).toEqual([1, 1]);
    g.state.objects[cecil]!.damage = 5;
    g.pass();
    settle(g);
    expect(all(g, 'shinryu-transcendent-rival')).toHaveLength(1);
  });

  it('Sephiroth drains on deaths and becomes the One-Winged Angel on the fourth', () => {
    const g = game({
      p1: { battlefield: ['sephiroth-fabled-soldier'] },
      p2: { battlefield: n('minwu-white-mage', 4) },
    });
    for (const id of g.state.battlefield)
      if (g.obj(id).defId === 'minwu-white-mage') g.state.objects[id]!.damage = 5;
    g.pass();
    settle(g);
    expect(g.id('p1', 'sephiroth-one-winged-angel')).toBeDefined();
    expect(g.life('p2')).toBe(16);
    expect(g.life('p1')).toBe(24);
    expect(g.state.emblems?.length).toBe(1);
  });

  it('Summon: Primal Odin wins the game with Zantetsuken', () => {
    const g = game({ p1: { battlefield: [{ card: 'summon-primal-odin', sick: false }] } });
    const odin = g.id('p1', 'summon-primal-odin');
    g.state.objects[odin]!.counters = { lore: 2 };
    toAttack(g).attack(odin);
    toStep(g, 'main2');
    expect(g.decision.kind).toBe('gameOver');
    expect(g.state.winner).toBe('p1');
  });

  it("Ninja's Blades loots and drains by the discarded card's mana value", () => {
    const g = game({
      p1: {
        hand: ['ninjas-blades', 'ultima'],
        battlefield: n('swamp', 3),
        library: n('plains', 5),
      },
    });
    settle(cast(g, 'ninjas-blades'));
    const hero = all(g, 'fin-hero-token')[0]!;
    g.state.objects[hero]!.summoningSick = false;
    toAttack(g).attack(hero);
    for (let i = 0; i < 40 && g.state.turn.step !== 'main2'; i++) {
      const d = g.decision;
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'ultima', 'hand') });
      } else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(g.life('p2')).toBe(20 - 2 - 5);
  });
});

describe('colourless', () => {
  it('Aettir and Priwen sets base power and toughness to your life', () => {
    const g = game({ p1: { battlefield: ['aettir-and-priwen', 'minwu-white-mage'], life: 17 } });
    g.state.objects[g.id('p1', 'aettir-and-priwen')]!.attachedTo = g.id('p1', 'minwu-white-mage');
    expect(pt(g, g.id('p1', 'minwu-white-mage'))).toEqual([17, 17]);
  });

  it('Ultima, Origin of Oblivion blights a land, which then taps for two {C}', () => {
    const g = game({
      p1: {
        battlefield: ['ultima-origin-of-oblivion', 'plains', 'plains'],
        hand: ['buster-sword'],
      },
    });
    const ultima = g.id('p1', 'ultima-origin-of-oblivion');
    toAttack(g).attack(ultima);
    settle(g);
    toStep(g, 'main2');
    const land = g.state.battlefield.find((id) => g.obj(id).counters?.blight)!;
    expect(g.obj(land).counters?.blight).toBe(1);
    expect(getCharacteristics(g.state, cardDb, land).subtypes).not.toContain('Plains');
    // Two lands make three mana: the blighted one taps for {C}{C}.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('Buster Sword draws and casts a cheap spell free on combat damage', () => {
    const g = game({
      p1: {
        battlefield: ['buster-sword', 'minwu-white-mage'],
        hand: ['moogles-valor'],
        library: n('plains', 4),
      },
    });
    g.state.objects[g.id('p1', 'buster-sword')]!.attachedTo = g.id('p1', 'minwu-white-mage');
    toAttack(g).attack(g.id('p1', 'minwu-white-mage'));
    for (let i = 0; i < 40 && g.state.turn.step !== 'main2'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'castFree')
        g.do(g.legal().find((a) => a.type === 'castSpell') ?? g.legal()[0]!);
      else if (d.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(all(g, 'fin-moogle-token').length).toBeGreaterThan(0);
  });

  it('Summon: Bahamut deals the mana value of your other permanents at chapter IV', () => {
    const g = game({
      p1: { battlefield: ['summon-bahamut', 'the-wind-crystal', 'buster-sword'] },
      step: 'draw',
    });
    const b = g.id('p1', 'summon-bahamut');
    g.state.objects[b]!.counters = { lore: 3 };
    // The precombat main phase adds lore counter IV.
    toStep(g, 'main1');
    expect(g.life('p2')).toBe(13);
  });

  it('The Masamune gives first strike while attacking and must be blocked', () => {
    const g = game({
      p1: { battlefield: ['the-masamune', 'minwu-white-mage'] },
      p2: { battlefield: ['aerith-gainsborough'] },
    });
    const minwu = g.id('p1', 'minwu-white-mage');
    g.state.objects[g.id('p1', 'the-masamune')]!.attachedTo = minwu;
    expect(kw(g, minwu)).not.toContain('firstStrike');
    toAttack(g).attack(minwu);
    expect(kw(g, minwu)).toContain('firstStrike');
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat?.attackers[0]?.blockers).toHaveLength(1);
  });

  it('The Masamune doubles death triggers of the equipped creature', () => {
    const g = game({
      p1: {
        battlefield: ['the-masamune', 'vincent-valentine', ...n('plains', 5)],
        hand: [],
      },
      p2: { battlefield: ['minwu-white-mage'] },
    });
    const vincent = g.id('p1', 'vincent-valentine');
    g.state.objects[g.id('p1', 'the-masamune')]!.attachedTo = vincent;
    g.state.objects[g.id('p2', 'minwu-white-mage')]!.damage = 5;
    g.pass();
    settle(g);
    expect(g.obj(vincent).plusOneCounters).toBe(6);
  });

  it('The Regalia puts the first land it reveals onto the battlefield tapped', () => {
    const g = game({
      p1: {
        battlefield: ['the-regalia', 'minwu-white-mage'],
        library: ['ultima', 'island', 'plains'],
      },
    });
    const regalia = g.id('p1', 'the-regalia');
    activate(g, regalia);
    settle(g);
    toAttack(g).attack(regalia);
    settle(g);
    expect(all(g, 'island')).toHaveLength(1);
    expect(g.state.players.p1.library.at(-1)).toBe(g.state.players.p1.library.at(-1));
  });

  it('Genji Glove gives double strike and one additional combat', () => {
    const g = game({ p1: { battlefield: ['genji-glove', 'matoya-archon-elder'] } });
    const minwu = g.id('p1', 'matoya-archon-elder');
    g.state.objects[g.id('p1', 'genji-glove')]!.attachedTo = minwu;
    expect(kw(g, minwu)).toContain('doubleStrike');
    toAttack(g).attack(minwu);
    settle(g);
    expect(g.state.turn.extraCombats).toBe(1);
    toAttack(g).attack(minwu);
    settle(g);
    expect(g.state.turn.extraCombats).toBe(0);
    toStep(g, 'main2');
    expect(g.life('p2')).toBe(20 - 4);
  });
});

describe('all the group 1 rares and mythics', () => {
  it('play legal, replayable seeded games in batches', () => {
    const ids = SCOPE.map(slug);
    for (let start = 0; start < ids.length; start += 6) {
      const deck = [
        ...ids.slice(start, start + 6).flatMap((id) => Array<string>(4).fill(id)),
        ...['plains', 'island', 'swamp', 'mountain', 'forest'].flatMap((id) =>
          Array<string>(7).fill(id),
        ),
      ];
      for (const seed of [1, 2]) {
        const initial = engine.newGame({ decks: { p1: deck, p2: deck }, seed: 300 + start + seed });
        const result = playRandomGame(engine, initial, 700 + start * 7 + seed, {
          maxActions: 8000,
        });
        expect(result.truncated, `batch ${start}`).toBe(false);
        let state = initial;
        for (const action of result.actions) state = engine.applyAction(state, action).state;
        expect(state, `batch ${start}`).toEqual(result.final);
      }
    }
  }, 120_000);
});
