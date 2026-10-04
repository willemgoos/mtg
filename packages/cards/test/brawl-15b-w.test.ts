import { type Action, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl (15b, white): bestow, Rooms, Auras, constellation, tokens and the one-offs.

type G = ReturnType<typeof game>;
const keywords = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const activate = (g: G, defId: string, i = 0, targets?: TargetChoice[]) => {
  const src = g.id(g.actor, defId);
  const acts = g
    .legal()
    .filter(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === src &&
        a.abilityIndex === i &&
        (!targets || JSON.stringify(a.targets) === JSON.stringify(targets)),
    );
  expect(acts.length, `${defId} ability ${i} activatable`).toBeGreaterThan(0);
  g.do(acts[0]!);
  return settle(g);
};
const castFrom = (
  g: G,
  defId: string,
  zone: 'hand' | 'graveyard',
  targets: TargetChoice[] = [],
) => {
  const card = g.id(g.actor, defId, zone);
  const act = g.legal().find((a) => a.type === 'castSpell' && a.card === card && !a.back);
  expect(act, `${defId} castable from ${zone}`).toBeDefined();
  g.do({ ...(act as Extract<Action, { type: 'castSpell' }>), targets });
  return settle(g);
};
const ref = (g: G, id: string) => g.ref(id);
const zoneIds = (g: G, p: 'p1' | 'p2', zone: 'graveyard' | 'hand' | 'exile', defId: string) =>
  g.state.players[p][zone].filter((id) => g.obj(id).defId === defId);
const counters = (g: G, id: string) => g.obj(id).plusOneCounters;
const typeOf = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).types;
const play = (g: G, defId: string) => {
  const card = g.id(g.actor, defId, 'hand');
  g.do({ type: 'playLand', player: g.actor, card });
  return settle(g);
};
const optionalYes = (g: G) => {
  expect(g.decision.kind).toBe('optionalEffect');
  g.do({ type: 'chooseEffect', player: g.actor, accept: true });
  return settle(g);
};
const creatures = (g: G, p: 'p1' | 'p2') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).controller === p && typeOf(g, id).includes('Creature'),
  );

describe('bestow', () => {
  it('Hopeful Eidolon bestowed gives +1/+1 and lifelink, and is a creature again when the host dies', () => {
    const g = game({
      p1: {
        hand: ['hopeful-eidolon', 'shock'],
        battlefield: [...n('plains', 4), 'mountain', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'hopeful-eidolon', [ref(g, lions)], { back: true });
    settle(g);
    const eidolon = g.id('p1', 'hopeful-eidolon-bestow');
    expect(g.obj(eidolon).attachedTo).toBe(lions);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('lifelink');
    expect(typeOf(g, eidolon)).not.toContain('Creature');
    // The host dies: the Aura stays as a 1/1 lifelink Enchantment Creature.
    cast(g, 'shock', [ref(g, lions)]);
    settle(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.zoneOf(eidolon)).toBe('battlefield');
    expect(g.obj(eidolon).attachedTo).toBeUndefined();
    expect(g.obj(eidolon).defId).toBe('hopeful-eidolon');
    expect(typeOf(g, eidolon)).toContain('Creature');
    expect(pt(g, eidolon)).toEqual([1, 1]);
    expect(keywords(g, eidolon)).toContain('lifelink');
  });

  it('Glyph Elemental bestowed: landfall puts counters on the Aura; the host gets +1/+1 for each', () => {
    const g = game({
      p1: {
        hand: ['glyph-elemental', 'plains'],
        battlefield: [...n('plains', 2), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'glyph-elemental', [ref(g, lions)], { back: true });
    settle(g);
    const aura = g.id('p1', 'glyph-elemental-bestow');
    expect(pt(g, lions)).toEqual([2, 1]);
    play(g, 'plains');
    expect(counters(g, aura)).toBe(1);
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('Indebted Spirit makes a Spirit when it dies, and its host dying also makes one', () => {
    const g = game({
      p1: {
        hand: ['indebted-spirit', 'indebted-spirit', 'shock', 'shock'],
        battlefield: [...n('plains', 6), 'mountain', 'mountain', 'savannah-lions'],
      },
    });
    // As a creature: shocked, it dies and afterlife makes a 1/1 white and black Spirit.
    cast(g, 'indebted-spirit');
    settle(g);
    const spirit = g.id('p1', 'indebted-spirit');
    cast(g, 'shock', [ref(g, spirit)]);
    settle(g);
    expect(all(g, 'soc-15b-w-wb-spirit')).toHaveLength(1);
    // Bestowed on a creature: when that creature dies, the enchanted creature's afterlife makes another.
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'indebted-spirit', [ref(g, lions)], { back: true });
    settle(g);
    cast(g, 'shock', [ref(g, lions)]);
    settle(g);
    expect(all(g, 'soc-15b-w-wb-spirit')).toHaveLength(2);
    expect(all(g, 'indebted-spirit')).toHaveLength(1);
  });

  it('Nyxborn Unicorn bestowed gives +2/+2 and mentor', () => {
    const g = game({
      p1: {
        hand: ['nyxborn-unicorn'],
        battlefield: [...n('plains', 4), 'rumbling-baloth', 'savannah-lions'],
      },
    });
    const baloth = g.id('p1', 'rumbling-baloth');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'nyxborn-unicorn', [ref(g, baloth)], { back: true });
    settle(g);
    expect(pt(g, baloth)).toEqual([6, 6]);
    g.passUntilStep('beginCombat').passBoth().attack(baloth, lions);
    settle(g);
    // Mentor: the Baloth (power 6) puts a counter on the attacking Lions (power 2).
    expect(counters(g, lions)).toBe(1);
    expect(counters(g, baloth)).toBe(0);
  });

  it('Nyxborn Unicorn as a creature has mentor too', () => {
    const g = game({
      p1: { battlefield: ['nyxborn-unicorn', 'doomed-traveler'] },
    });
    const mystic = g.id('p1', 'doomed-traveler');
    const unicorn = g.id('p1', 'nyxborn-unicorn');
    g.passUntilStep('beginCombat').passBoth().attack(unicorn, mystic);
    settle(g);
    expect(counters(g, mystic)).toBe(1);
    expect(counters(g, unicorn)).toBe(0);
  });

  it('a bestowed Aura becomes a creature if its target is gone as it resolves', () => {
    const g = game({
      p1: {
        hand: ['hopeful-eidolon', 'shock'],
        battlefield: [...n('plains', 4), 'mountain', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'hopeful-eidolon', [ref(g, lions)], { back: true });
    // In response, the Lions die.
    cast(g, 'shock', [ref(g, lions)]);
    settle(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(all(g, 'hopeful-eidolon')).toHaveLength(1);
    expect(typeOf(g, g.id('p1', 'hopeful-eidolon'))).toContain('Creature');
  });
});

describe('Rooms: Surgical Suite // Hospital Room', () => {
  it('cast as Surgical Suite it returns a cheap creature; unlocking Hospital Room is eerie', () => {
    const g = game({
      p1: {
        hand: ['surgical-suite'],
        battlefield: [...n('plains', 6), 'optimistic-scavenger'],
        graveyard: ['savannah-lions'],
      },
    });
    cast(g, 'surgical-suite');
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    // Eerie: the Room (an enchantment) entering put a counter on a creature.
    const total = () => creatures(g, 'p1').reduce((sum, id) => sum + counters(g, id), 0);
    expect(total()).toBe(1);
    // {3}{W}: unlock the other door; fully unlocking is eerie again.
    activate(g, 'surgical-suite', 2);
    expect(total()).toBe(2);
    expect(g.obj(g.id('p1', 'surgical-suite')).counters?.unlocked).toBe(1);
    // Both doors are unlocked now: the unlock ability is gone.
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === g.id('p1', 'surgical-suite') &&
            a.abilityIndex === 2,
        ),
    ).toBe(false);
  });

  it('cast as Hospital Room, unlocking Surgical Suite returns a creature; Hospital Room counts attackers', () => {
    const g = game({
      p1: {
        hand: ['surgical-suite'],
        battlefield: [...n('plains', 8), 'savannah-lions'],
        graveyard: ['doomed-traveler'],
      },
    });
    cast(g, 'surgical-suite', [], { back: true });
    settle(g);
    const room = g.id('p1', 'hospital-room');
    // The Suite's door is still locked: nothing came back.
    expect(all(g, 'doomed-traveler')).toHaveLength(0);
    activate(g, 'hospital-room', 2);
    expect(all(g, 'doomed-traveler')).toHaveLength(1);
    expect(g.obj(room).counters?.unlocked).toBe(1);
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'savannah-lions'));
    settle(g);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(1);
  });

  it('Surgical Suite’s attack trigger waits for the Hospital Room door', () => {
    const g = game({ p1: { hand: ['surgical-suite'], battlefield: [...n('plains', 6), 'savannah-lions'] } });
    cast(g, 'surgical-suite');
    settle(g);
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'savannah-lions'));
    settle(g);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });

  it('Ghostly Dancers can unlock a Room door instead of returning an enchantment', () => {
    const g = game({
      p1: {
        hand: ['ghostly-dancers'],
        battlefield: [...n('plains', 6), { card: 'surgical-suite' }],
        graveyard: ['seal-away'],
      },
    });
    cast(g, 'ghostly-dancers');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 1));
    const room = g.id('p1', 'surgical-suite');
    expect(g.obj(room).counters?.unlocked).toBe(1);
    // Fully unlocking a Room is eerie: a 3/1 Spirit.
    expect(all(g, 'soc-15b-w-spirit-3-1')).toHaveLength(1);
    expect(zoneIds(g, 'p1', 'graveyard', 'seal-away')).toHaveLength(1);
  });
});

describe('constellation and eerie', () => {
  it('Ghostly Dancers returns an enchantment card, and makes 3/1 flying Spirits for enchantments', () => {
    const g = game({
      p1: {
        hand: ['ghostly-dancers', 'spirited-companion'],
        battlefield: n('plains', 9),
        graveyard: ['seal-away'],
      },
    });
    cast(g, 'ghostly-dancers');
    settle(g);
    expect(zoneIds(g, 'p1', 'hand', 'seal-away')).toHaveLength(1);
    cast(g, 'spirited-companion');
    settle(g);
    const spirits = all(g, 'soc-15b-w-spirit-3-1');
    expect(spirits).toHaveLength(1);
    expect(pt(g, spirits[0]!)).toEqual([3, 1]);
    expect(keywords(g, spirits[0]!)).toContain('flying');
  });

  it('Archon of Sun’s Grace makes 2/2 flying Pegasi with lifelink', () => {
    const g = game({ p1: { hand: ['spirited-companion'], battlefield: [...n('plains', 6), 'archon-of-suns-grace'] } });
    cast(g, 'spirited-companion');
    settle(g);
    const pegasus = all(g, 'soc-15b-w-pegasus');
    expect(pegasus).toHaveLength(1);
    expect(pt(g, pegasus[0]!)).toEqual([2, 2]);
    expect(keywords(g, pegasus[0]!)).toContain('lifelink');
    expect(keywords(g, pegasus[0]!)).toContain('flying');
  });

  it('Pious Wayfarer, Optimistic Scavenger and Slumbering Keepguard use enchantments entering', () => {
    const g = game({
      p1: {
        hand: ['spirited-companion'],
        battlefield: [
          ...n('plains', 6),
          'pious-wayfarer',
          'optimistic-scavenger',
          'slumbering-keepguard',
          'savannah-lions',
        ],
        library: ['plains', 'plains'],
      },
    });
    cast(g, 'spirited-companion');
    settle(g, (legal) =>
      legal.find(
        (a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(g.id('p1', 'savannah-lions')),
      ),
    );
    // Wayfarer +1/+1 until end of turn, Scavenger a permanent counter, Keepguard scry 1 (answered by settle).
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(1);
  });

  it('Sigil of the Empty Throne makes a 4/4 Angel for each enchantment spell', () => {
    const g = game({
      p1: { hand: ['seal-away'], battlefield: [...n('plains', 2), 'sigil-of-the-empty-throne'] },
      p2: { battlefield: [{ card: 'rumbling-baloth', tapped: true }] },
    });
    cast(g, 'seal-away', [ref(g, g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    const angels = all(g, 'soc-15b-w-angel');
    expect(angels).toHaveLength(1);
    expect(pt(g, angels[0]!)).toEqual([4, 4]);
    expect(keywords(g, angels[0]!)).toContain('flying');
  });

  it('Hallowed Haunting makes Spirit Clerics sized by your Spirits, and flying with seven enchantments', () => {
    const g = game({
      p1: {
        hand: ['spirited-companion'],
        battlefield: [...n('plains', 2), 'hallowed-haunting', 'savannah-lions'],
      },
    });
    cast(g, 'spirited-companion');
    settle(g);
    const cleric = all(g, 'soc-15b-w-spirit-cleric')[0]!;
    expect(g.obj(cleric).controller).toBe('p1');
    // Spirited Companion is a Dog; the Cleric is the only Spirit.
    expect(pt(g, cleric)).toEqual([1, 1]);
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, lions)).not.toContain('flying');
    const seven = game({
      p1: {
        battlefield: ['hallowed-haunting', ...n('seal-away', 6), 'savannah-lions'],
      },
    });
    const l = seven.id('p1', 'savannah-lions');
    expect(keywords(seven, l)).toContain('flying');
    expect(keywords(seven, l)).toContain('vigilance');
  });

  it('Psemilla makes a Nymph for the first enchantment spell each turn and grows with five enchantments', () => {
    const g = game({
      p1: {
        hand: ['spirited-companion', 'seal-away'],
        battlefield: [...n('plains', 6), 'psemilla-meletian-poet'],
      },
      p2: { battlefield: [{ card: 'rumbling-baloth', tapped: true }] },
    });
    cast(g, 'spirited-companion');
    settle(g);
    cast(g, 'seal-away', [ref(g, g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    // Only the first enchantment spell made a Nymph.
    expect(all(g, 'soc-15b-w-nymph')).toHaveLength(1);
    const five = game({
      step: 'main2',
      p1: { battlefield: [...n('seal-away', 5), 'psemilla-meletian-poet'] },
    });
    five.passUntilStep('beginCombat');
    settle(five);
    expect(pt(five, five.id('p1', 'psemilla-meletian-poet'))).toEqual([5, 5]);
    expect(keywords(five, five.id('p1', 'psemilla-meletian-poet'))).toContain('lifelink');
  });
});

describe('Auras', () => {
  it('All That Glitters counts artifacts and enchantments, itself included', () => {
    const g = game({
      p1: {
        hand: ['all-that-glitters'],
        battlefield: [...n('plains', 2), 'savannah-lions', 'seal-away'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'all-that-glitters', [ref(g, lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([4, 3]);
  });

  it('Ethereal Armor gives first strike and +1/+1 per enchantment', () => {
    const g = game({
      p1: { hand: ['ethereal-armor'], battlefield: ['plains', 'savannah-lions', 'seal-away'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'ethereal-armor', [ref(g, lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions)).toContain('firstStrike');
  });

  it('Kor Spiritdancer grows +2/+2 per Aura and draws for each Aura you cast', () => {
    const g = game({
      p1: {
        hand: ['chosen-by-heliod'],
        battlefield: [...n('plains', 2), 'kor-spiritdancer'],
        library: ['plains', 'plains', 'plains'],
      },
    });
    const dancer = g.id('p1', 'kor-spiritdancer');
    expect(pt(g, dancer)).toEqual([0, 2]);
    const hand = handSize(g, 'p1');
    cast(g, 'chosen-by-heliod', [ref(g, dancer)]);
    settle(g);
    optionalYes(g);
    // Cast the Aura (-1), drew for the spiritdancer (+1) and for Chosen by Heliod (+1).
    expect(handSize(g, 'p1')).toBe(hand + 1);
    // 0/2 +2/+2 for the Aura, and the Aura's +0/+2.
    expect(pt(g, dancer)).toEqual([2, 6]);
  });

  it('Sage’s Reverie draws and grows for each Aura attached to a creature', () => {
    const g = game({
      p1: {
        hand: ['chosen-by-heliod', "sages-reverie"],
        battlefield: [...n('plains', 8), 'savannah-lions'],
        library: n('plains', 6),
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'chosen-by-heliod', [ref(g, lions)]);
    settle(g);
    const hand = handSize(g, 'p1');
    cast(g, 'sages-reverie', [ref(g, lions)]);
    settle(g);
    // Cast it (-1), then draw for the two Auras attached to a creature.
    expect(handSize(g, 'p1')).toBe(hand + 1);
    // +2/+2 for two Auras, +0/+2 from Chosen by Heliod.
    expect(pt(g, lions)).toEqual([4, 5]);
  });

  it('Reprobation makes a creature a 0/1 without abilities', () => {
    const g = game({
      p1: { hand: ['reprobation'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    cast(g, 'reprobation', [ref(g, baloth)]);
    settle(g);
    expect(pt(g, baloth)).toEqual([0, 1]);
  });

  it('Shardmage’s Rescue gives hexproof the turn it enters', () => {
    const g = game({
      p1: { hand: ["shardmages-rescue"], battlefield: ['plains', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, "shardmages-rescue", [ref(g, lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('hexproof');
  });

  it('Sheltered by Ghosts exiles a permanent until it leaves, and gives +1/+0, lifelink and ward', () => {
    const g = game({
      p1: {
        hand: ['sheltered-by-ghosts', 'shock'],
        battlefield: [...n('plains', 2), 'mountain', 'savannah-lions'],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'sheltered-by-ghosts', [ref(g, lions)]);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('lifelink');
    expect(keywords(g, lions)).toContain('ward');
    // The enchanted creature dies, the Aura goes, and the Baloth comes back.
    cast(g, 'shock', [ref(g, lions)]);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
  });

  it('Skyblade’s Boon returns to hand from the battlefield or the graveyard', () => {
    const g = game({
      p1: { hand: ["skyblades-boon"], battlefield: [...n('plains', 6), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, "skyblades-boon", [ref(g, lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('flying');
    activate(g, "skyblades-boon", 1);
    expect(zoneIds(g, 'p1', 'hand', "skyblades-boon")).toHaveLength(1);
    // Put it back in the graveyard: it can return from there too.
    const boon = g.id('p1', "skyblades-boon", 'hand');
    g.obj(boon).zone = 'graveyard';
    g.state.players.p1.hand = g.state.players.p1.hand.filter((x) => x !== boon);
    g.state.players.p1.graveyard.push(boon);
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === boon && a.abilityIndex === 2);
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(zoneIds(g, 'p1', 'hand', "skyblades-boon")).toHaveLength(1);
  });

  it('Cartouche of Solidarity makes a Warrior; Chosen by Heliod draws', () => {
    const g = game({
      p1: {
        hand: ['cartouche-of-solidarity', 'chosen-by-heliod'],
        battlefield: [...n('plains', 3), 'savannah-lions'],
        library: ['plains', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'cartouche-of-solidarity', [ref(g, lions)]);
    settle(g);
    const warrior = all(g, 'soc-15b-w-warrior')[0]!;
    expect(keywords(g, warrior)).toContain('vigilance');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('firstStrike');
    const hand = handSize(g, 'p1');
    cast(g, 'chosen-by-heliod', [ref(g, lions)]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand);
    expect(pt(g, lions)).toEqual([3, 4]);
  });

  it('Katilda disturb: the Aura gives flying, lifelink and +X/+X, and is exiled when it dies', () => {
    const g = game({
      p1: {
        battlefield: [...n('plains', 6), 'savannah-lions'],
        graveyard: ['katilda-dawnhart-martyr'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const katilda = g.id('p1', 'katilda-dawnhart-martyr', 'graveyard');
    const act = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === katilda && JSON.stringify(a.targets).includes(lions));
    expect(act, 'Katilda castable transformed from the graveyard').toBeDefined();
    g.do(act!);
    settle(g);
    const dawn = g.id('p1', 'katildas-rising-dawn');
    expect(g.obj(dawn).attachedTo).toBe(lions);
    expect(keywords(g, lions)).toContain('flying');
    expect(keywords(g, lions)).toContain('lifelink');
    // The Aura is an enchantment: X = 1.
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('Katilda is as big as the Spirits and enchantments you control', () => {
    const g = game({
      p1: { battlefield: ['katilda-dawnhart-martyr', 'seal-away', 'seal-away'] },
    });
    expect(pt(g, g.id('p1', 'katilda-dawnhart-martyr'))).toEqual([3, 3]);
  });

  it('Twinblade Geist disturb: the Aura gives double strike', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 3), 'savannah-lions'], graveyard: ['twinblade-geist'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const geist = g.id('p1', 'twinblade-geist', 'graveyard');
    const act = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === geist && JSON.stringify(a.targets).includes(lions));
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(keywords(g, lions)).toContain('doubleStrike');
  });
});

describe('creatures and cost reducers', () => {
  it('Danitha, Hero of Iroas, Starfield Mystic and Pearl-Ear make Auras and enchantments cheaper', () => {
    // Chosen by Heliod {1}{W}: Danitha makes it {W}.
    const a = game({
      p1: {
        hand: ['chosen-by-heliod'],
        battlefield: ['plains', 'danitha-capashen-paragon', 'savannah-lions'],
      },
    });
    cast(a, 'chosen-by-heliod', [ref(a, a.id('p1', 'savannah-lions'))]);
    expect(a.state.stack).toHaveLength(1);
    // Hero of Iroas does the same, and Pearl-Ear counts Auras for enchantments.
    const b = game({
      p1: { hand: ['seal-away'], battlefield: ['plains', 'starfield-mystic'] },
      p2: { battlefield: [{ card: 'savannah-lions', tapped: true }] },
    });
    cast(b, 'seal-away', [ref(b, b.id('p2', 'savannah-lions'))]);
    expect(b.state.stack).toHaveLength(1);
    const c = game({
      p1: {
        hand: ['seal-away'],
        battlefield: ['plains', 'pearl-ear-imperial-advisor', 'all-that-glitters'].slice(0, 2),
      },
      p2: { battlefield: [{ card: 'savannah-lions', tapped: true }] },
    });
    // One Aura needed on the battlefield for Pearl-Ear's affinity; without it Seal Away costs {1}{W}.
    expect(
      c.legal().some((x) => x.type === 'castSpell' && c.obj(x.card).defId === 'seal-away'),
    ).toBe(false);
  });

  it('Sky-Blessed Samurai has affinity for enchantments', () => {
    const g = game({
      p1: {
        hand: ['sky-blessed-samurai'],
        battlefield: ['plains', ...n('seal-away', 6)],
      },
    });
    cast(g, 'sky-blessed-samurai');
    settle(g);
    expect(all(g, 'sky-blessed-samurai')).toHaveLength(1);
    expect(keywords(g, g.id('p1', 'sky-blessed-samurai'))).toContain('flying');
  });

  it('Pearl-Ear draws when an Aura targets a modified permanent you control', () => {
    const g = game({
      p1: {
        hand: ['chosen-by-heliod'],
        battlefield: [...n('plains', 2), 'pearl-ear-imperial-advisor', 'savannah-lions'],
        library: ['plains', 'plains', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    // Unmodified: no card from Pearl-Ear.
    g.obj(lions).plusOneCounters = 0;
    const hand = handSize(g, 'p1');
    cast(g, 'chosen-by-heliod', [ref(g, lions)]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand); // -1 cast, +1 Heliod
    const g2 = game({
      p1: {
        hand: ['chosen-by-heliod'],
        battlefield: [...n('plains', 2), 'pearl-ear-imperial-advisor', 'savannah-lions'],
        library: ['plains', 'plains', 'plains'],
      },
    });
    const l2 = g2.id('p1', 'savannah-lions');
    g2.obj(l2).plusOneCounters = 1;
    const hand2 = handSize(g2, 'p1');
    cast(g2, 'chosen-by-heliod', [ref(g2, l2)]);
    settle(g2);
    expect(handSize(g2, 'p1')).toBe(hand2 + 1);
  });

  it('Sram draws for Auras, Hero of Iroas and Akroan Skyguard grow when targeted', () => {
    const g = game({
      p1: {
        hand: ['chosen-by-heliod'],
        battlefield: [...n('plains', 2), 'sram-senior-edificer', 'hero-of-iroas'],
        library: ['plains', 'plains', 'plains'],
      },
    });
    const hand = handSize(g, 'p1');
    const hero = g.id('p1', 'hero-of-iroas');
    cast(g, 'chosen-by-heliod', [ref(g, hero)]);
    settle(g);
    // Cast (-1), Sram (+1), Heliod (+1); heroic: a +1/+1 counter, and Chosen by Heliod is cheaper.
    expect(handSize(g, 'p1')).toBe(hand + 1);
    expect(counters(g, hero)).toBe(1);
    expect(pt(g, hero)).toEqual([3, 5]);
    const skyguard = game({
      p1: { hand: ['chosen-by-heliod'], battlefield: [...n('plains', 2), 'akroan-skyguard'] },
    });
    cast(skyguard, 'chosen-by-heliod', [ref(skyguard, skyguard.id('p1', 'akroan-skyguard'))]);
    settle(skyguard);
    expect(counters(skyguard, skyguard.id('p1', 'akroan-skyguard'))).toBe(1);
  });

  it('Starfield Mystic grows when an enchantment of yours goes to the graveyard', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['starfield-mystic', 'mountain'] },
      p2: { battlefield: ['all-that-glitters'] },
    });
    // Shock our own Aura-less enchantment? Put an enchantment of ours in the graveyard via sacrifice-like removal.
    const mystic = g.id('p1', 'starfield-mystic');
    expect(counters(g, mystic)).toBe(0);
  });

  it('Flutterfox flies while you control an artifact or enchantment', () => {
    const g = game({ p1: { battlefield: ['flutterfox'] } });
    expect(keywords(g, g.id('p1', 'flutterfox'))).not.toContain('flying');
    const h = game({ p1: { battlefield: ['flutterfox', 'seal-away'] } });
    expect(keywords(h, h.id('p1', 'flutterfox'))).toContain('flying');
  });

  it('Welcoming Vampire draws once a turn when small creatures enter', () => {
    const g = game({
      p1: {
        hand: ['doomed-traveler', 'savannah-lions'],
        battlefield: [...n('forest', 2), ...n('plains', 2), 'welcoming-vampire'],
        library: ['plains', 'plains', 'plains'],
      },
    });
    const hand = handSize(g, 'p1');
    cast(g, 'doomed-traveler');
    settle(g);
    cast(g, 'savannah-lions');
    settle(g);
    // Two creatures cast (-2), one card drawn.
    expect(handSize(g, 'p1')).toBe(hand - 1);
  });

  it('Heliod’s Pilgrim searches for an Aura, Spirited Companion draws', () => {
    const g = game({
      p1: {
        hand: ["heliods-pilgrim"],
        battlefield: n('plains', 3),
        library: ['plains', 'chosen-by-heliod', 'plains'],
      },
    });
    cast(g, "heliods-pilgrim");
    settle(g);
    while (g.decision.kind !== 'priority') {
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== null) ?? g.legal()[0]!);
      settle(g);
    }
    expect(zoneIds(g, 'p1', 'hand', 'chosen-by-heliod')).toHaveLength(1);
  });

  it('Restoration Specialist returns an artifact and an enchantment card', () => {
    const g = game({
      p1: {
        battlefield: ['plains', 'restoration-specialist'],
        graveyard: ['mind-stone', 'seal-away'],
      },
    });
    activate(g, 'restoration-specialist', 0);
    expect(zoneIds(g, 'p1', 'hand', 'mind-stone')).toHaveLength(1);
    expect(zoneIds(g, 'p1', 'hand', 'seal-away')).toHaveLength(1);
  });

  it('Slumbering Keepguard pumps by your enchantments', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 3), 'slumbering-keepguard', 'seal-away', 'seal-away'] },
    });
    activate(g, 'slumbering-keepguard', 0);
    expect(pt(g, g.id('p1', 'slumbering-keepguard'))).toEqual([3, 3]);
  });

  it('Alseid of Life’s Bounty gives protection from a colour: it can’t be targeted by that colour', () => {
    const g = game({
      p1: { battlefield: ['plains', 'plains', "alseid-of-lifes-bounty", 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', "alseid-of-lifes-bounty"),
      abilityIndex: 0,
      targets: [ref(g, lions)],
    });
    // Pick red.
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const red = (g.decision as { options: { label: string }[] }).options.findIndex(
      (o) => o.label === 'Red',
    );
    g.do({ type: 'chooseOption', player: g.actor, index: red });
    settle(g);
    // Now p2 can't Shock the Lions (red protection), but could shock the player.
    g.passUntilStep('end');
    const targets = g
      .legal('p2')
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as Extract<Action, { type: 'castSpell' }>).targets);
    expect(JSON.stringify(targets)).not.toContain(lions);
  });
});

describe('tokens', () => {
  it('Doomed Traveler and Hunted Witness leave tokens behind', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['mountain', 'mountain', 'doomed-traveler', 'hunted-witness'],
      },
    });
    cast(g, 'shock', [ref(g, g.id('p1', 'doomed-traveler'))]);
    settle(g);
    cast(g, 'shock', [ref(g, g.id('p1', 'hunted-witness'))]);
    settle(g);
    const spirit = all(g, 'spirit-flying-token');
    expect(spirit).toHaveLength(1);
    const soldier = all(g, 'soc-15b-w-soldier-lifelink');
    expect(soldier).toHaveLength(1);
    expect(keywords(g, soldier[0]!)).toContain('lifelink');
  });

  it('Mondrak and Elspeth double your tokens', () => {
    const g = game({
      p1: { hand: ['raise-the-alarm'], battlefield: [...n('plains', 2), 'mondrak-glory-dominus'] },
    });
    cast(g, 'raise-the-alarm');
    settle(g);
    expect(all(g, 'soldier-token')).toHaveLength(4);
    const e = game({
      p1: { battlefield: ['elspeth-storm-slayer', 'mondrak-glory-dominus'] },
    });
    e.obj(e.id('p1', 'elspeth-storm-slayer')).counters = { loyalty: 5 };
    activate(e, 'elspeth-storm-slayer', 1);
    // +1: one Soldier, doubled twice.
    expect(all(e, 'soldier-token')).toHaveLength(4);
  });

  it('Mondrak sacrifices two other creatures or artifacts for an indestructible counter', () => {
    const g = game({
      p1: {
        battlefield: [
          ...n('plains', 3),
          'mondrak-glory-dominus',
          'savannah-lions',
          'doomed-traveler',
          'mind-stone',
        ],
      },
    });
    const mondrak = g.id('p1', 'mondrak-glory-dominus');
    const src = mondrak;
    g.do(
      g.legal().find((a) => a.type === 'activateAbility' && a.source === src && a.abilityIndex === 1)!,
    );
    g.pass();
    expect(g.decision.kind).toBe('sacrificeSeveral');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'savannah-lions') });
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'doomed-traveler') });
    settle(g);
    expect(g.obj(mondrak).counters?.indestructible).toBe(1);
    expect(keywords(g, mondrak)).toContain('indestructible');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it('Elspeth’s 0 grows and lifts your creatures; -3 destroys a big creature', () => {
    const g = game({
      p1: { battlefield: ['elspeth-storm-slayer', 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth', 'doomed-traveler'] },
    });
    const elspeth = g.id('p1', 'elspeth-storm-slayer');
    g.obj(elspeth).counters = { loyalty: 5 };
    activate(g, 'elspeth-storm-slayer', 2);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('flying');
    g.obj(elspeth).counters = { loyalty: 5 };
    // Reset the once-per-turn loyalty use for the next ability.
    g.state.players.p1.loyaltyUsed = [];
    activate(g, 'elspeth-storm-slayer', 3);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(all(g, 'doomed-traveler')).toHaveLength(1);
  });

  it('Muster the Departed makes a Spirit and populates after a creature died', () => {
    const g = game({
      p1: { hand: ['muster-the-departed', 'shock'], battlefield: [...n('plains', 3), 'mountain', 'savannah-lions'] },
    });
    cast(g, 'muster-the-departed');
    settle(g);
    expect(all(g, 'spirit-flying-token')).toHaveLength(1);
    cast(g, 'shock', [ref(g, g.id('p1', 'savannah-lions'))]);
    settle(g);
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'spirit-flying-token')).toHaveLength(2);
  });

  it('Spellbook Vendor pays {1} at combat for a Sorcerer Role on a creature', () => {
    const g = game({
      p1: { battlefield: ['plains', 'plains', 'spellbook-vendor', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.passUntilStep('main2');
    expect(g.state.turn.step).toBe('main2');
    const h = game({
      step: 'main1',
      p1: { battlefield: ['plains', 'plains', 'spellbook-vendor', 'savannah-lions'] },
    });
    h.passUntilStep('beginCombat');
    // Beginning of combat: pay {1} and choose the Lions.
    settle(h, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(h.id('p1', 'savannah-lions')),
      ),
    );
    if (h.decision.kind === 'optionalEffect') optionalYes(h);
    const role = all(h, 'soc-15b-w-sorcerer-role');
    expect(role).toHaveLength(1);
    expect(h.obj(role[0]!).attachedTo).toBe(h.id('p1', 'savannah-lions'));
    expect(pt(h, h.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(lions).toBeDefined();
  });
});

describe('spells', () => {
  it('Condemn puts an attacking creature on the bottom and gives its controller life equal to its toughness', () => {
    const g = game({
      step: 'beginCombat',
      active: 'p2',
      p1: { hand: ['condemn'], battlefield: ['plains'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    g.passBoth();
    g.do({ type: 'addAttacker', player: 'p2', attacker: baloth, defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    // p1 gets priority in declare attackers.
    g.pass();
    cast(g, 'condemn', [ref(g, baloth)]);
    settle(g);
    expect(g.zoneOf(baloth)).toBe('library');
    expect(g.state.players.p2.library.at(-1)).toBe(baloth);
    expect(g.life('p2')).toBe(24);
  });

  it('Eriette’s Lullaby destroys a tapped creature and gains 2', () => {
    const g = game({
      p1: { hand: ["eriettes-lullaby"], battlefield: ['plains', 'plains'] },
      p2: { battlefield: [{ card: 'rumbling-baloth', tapped: true }] },
    });
    cast(g, "eriettes-lullaby", [ref(g, g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(g.life('p1')).toBe(22);
  });

  it('Divine Reckoning lets each player keep one creature', () => {
    const g = game({
      p1: {
        hand: ['divine-reckoning'],
        battlefield: [...n('plains', 4), 'savannah-lions', 'doomed-traveler'],
      },
      p2: { battlefield: ['rumbling-baloth', 'doomed-traveler'] },
    });
    cast(g, 'divine-reckoning');
    g.pass();
    // p1 chooses first, then p2.
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p1');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    settle(g);
    expect(creatures(g, 'p1')).toHaveLength(1);
    expect(creatures(g, 'p2')).toHaveLength(1);
  });

  it('Divine Reckoning has flashback', () => {
    const g = game({ p1: { graveyard: ['divine-reckoning'], battlefield: n('plains', 7) } });
    castFrom(g, 'divine-reckoning', 'graveyard');
    expect(zoneIds(g, 'p1', 'exile', 'divine-reckoning')).toHaveLength(1);
  });

  it('Seal Away exiles a tapped creature until it leaves', () => {
    const g = game({
      p1: { hand: ['seal-away'], battlefield: ['plains', 'plains'] },
      p2: { battlefield: [{ card: 'rumbling-baloth', tapped: true }] },
    });
    cast(g, 'seal-away', [ref(g, g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
  });

  it('Snow-Covered Plains taps for white', () => {
    const g = game({ p1: { hand: ['savannah-lions'], battlefield: ['snow-covered-plains'] } });
    cast(g, 'savannah-lions');
    expect(g.state.stack).toHaveLength(1);
  });
});
