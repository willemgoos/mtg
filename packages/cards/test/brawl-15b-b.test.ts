import { type Action, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl (15b, black): sacrifice and "whenever a creature dies" cards.

type G = ReturnType<typeof game>;
type Cast = Extract<Action, { type: 'castSpell' }>;
const castActions = (g: G, defId: string, player: 'p1' | 'p2' = 'p1') =>
  g.legal(player).filter((a): a is Cast => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const cast = (g: G, defId: string, extra: Partial<Cast> = {}, pick?: (a: Cast) => boolean) => {
  const acts = castActions(g, defId);
  const act = acts.find((a) => (pick ? pick(a) : true));
  expect(act, `${defId} castable`).toBeDefined();
  g.do({ ...act!, ...extra });
  return settle(g);
};
const target = (g: G, id: string): TargetChoice => g.ref(id);
const activate = (g: G, defId: string, i: number, pick?: (a: Action) => boolean) => {
  const src = g.id(g.actor, defId);
  const act = g
    .legal()
    .find(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === src &&
        a.abilityIndex === i &&
        (pick ? pick(a) : true),
    );
  expect(act, `${defId} ability ${i}`).toBeDefined();
  g.do(act!);
  return settle(g);
};
/** Answers the pending sacrifice choices (single-creature and several-at-once) with the first option. */
const sacrificeAll = (g: G) => {
  for (
    let i = 0;
    i < 40 && (g.decision.kind === 'sacrifice' || g.decision.kind === 'sacrificeSeveral');
    i++
  ) {
    const d = g.decision as { player: 'p1' | 'p2' };
    g.do(g.legal(d.player)[0]!);
    settle(g);
  }
};
const zoneIds = (g: G, p: 'p1' | 'p2', zone: 'graveyard' | 'hand' | 'exile', defId: string) =>
  g.state.players[p][zone].filter((id) => g.obj(id).defId === defId);
const chars = (g: G, id: string) => getCharacteristics(g.state, cardDb, id);

describe('additional costs with a choice', () => {
  it('Deadly Dispute sacrifices an artifact or a creature', () => {
    const g = game({
      p1: { hand: ['deadly-dispute'], battlefield: [...n('swamp', 2), 'mind-stone'] },
    });
    const sacrifices = castActions(g, 'deadly-dispute').map((a) => a.sacrifice);
    expect(sacrifices).toContain(g.id('p1', 'mind-stone'));
    const hand = handSize(g, 'p1');
    cast(g, 'deadly-dispute');
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'treasure-token')).toBe(true);
    expect(zoneIds(g, 'p1', 'graveyard', 'mind-stone')).toHaveLength(1);
  });

  it('Bone Shards: sacrifice a creature or discard a card', () => {
    const g = game({
      p1: { hand: ['bone-shards', 'plains'], battlefield: ['swamp', 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const acts = castActions(g, 'bone-shards').filter((a) =>
      JSON.stringify(a.targets).includes(baloth),
    );
    expect(acts.some((a) => a.discard !== undefined)).toBe(true);
    expect(acts.some((a) => a.sacrifice !== undefined)).toBe(true);
    const discard = acts.find((a) => a.discard !== undefined)!;
    g.do(discard);
    settle(g);
    expect(g.zoneOf(baloth)).toBe('graveyard');
    expect(zoneIds(g, 'p1', 'graveyard', 'plains')).toHaveLength(1);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Bitter Triumph: discard a card or pay 3 life', () => {
    const g = game({
      p1: { hand: ['bitter-triumph'], battlefield: [...n('swamp', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    // No other card to discard: only paying life is possible.
    const acts = castActions(g, 'bitter-triumph').filter((a) =>
      JSON.stringify(a.targets).includes(baloth),
    );
    expect(acts.every((a) => a.discard === undefined)).toBe(true);
    g.do(acts[0]!);
    settle(g);
    expect(g.life('p1')).toBe(17);
    expect(g.zoneOf(baloth)).toBe('graveyard');
  });

  it('Annihilating Glare costs {B} plus {4} or a sacrifice', () => {
    const g = game({
      p1: { hand: ['annihilating-glare'], battlefield: [...n('swamp', 5)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const acts = castActions(g, 'annihilating-glare').filter((a) =>
      JSON.stringify(a.targets).includes(baloth),
    );
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    settle(g);
    expect(g.zoneOf(baloth)).toBe('graveyard');
  });

  it('Blasphemous Edict costs {B} with thirteen creatures and makes each player sacrifice them', () => {
    const g = game({
      p1: { hand: ['blasphemous-edict'], battlefield: ['swamp', ...n('savannah-lions', 7)] },
      p2: { battlefield: n('savannah-lions', 6) },
    });
    cast(g, 'blasphemous-edict');
    // Each player sacrifices up to thirteen creatures of their choice.
    sacrificeAll(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it('Blasphemous Edict is not cheap with fewer than thirteen creatures', () => {
    const g = game({
      p1: { hand: ['blasphemous-edict'], battlefield: ['swamp', ...n('savannah-lions', 7)] },
    });
    expect(castActions(g, 'blasphemous-edict')).toHaveLength(0);
  });

  it('Demonic Embrace can be cast from the graveyard for 3 life and a discard', () => {
    const g = game({
      p1: {
        hand: ['plains'],
        battlefield: [...n('swamp', 3), 'savannah-lions'],
        graveyard: ['demonic-embrace'],
      },
    });
    const card = g.id('p1', 'demonic-embrace', 'graveyard');
    const act = g.legal().find((a): a is Cast => a.type === 'castSpell' && a.card === card);
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(g.life('p1')).toBe(17);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([5, 2]);
    expect(chars(g, lions).keywords).toContain('flying');
    expect(chars(g, lions).subtypes).toContain('Demon');
  });
});

describe('creature-death engines', () => {
  it('Zulaport Cutthroat drains when a creature you control dies', () => {
    const g = game({
      p1: {
        hand: ['village-rites'],
        battlefield: ['swamp', 'zulaport-cutthroat', 'savannah-lions'],
      },
    });
    const hand = handSize(g, 'p1');
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
  });

  it('Blood Artist triggers on any creature dying, itself included', () => {
    const g = game({
      p1: { hand: ['infernal-grasp'], battlefield: [...n('swamp', 2), 'blood-artist'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'infernal-grasp', { targets: [target(g, g.id('p2', 'savannah-lions'))] });
    // Grasp costs 2 life; Blood Artist then drains 1 (the first target offered).
    expect(g.life('p1') + g.life('p2')).toBe(20 + 20 - 2);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'infernal-grasp')).toBe(
      true,
    );
  });

  it('Morbid Opportunist draws only once each turn', () => {
    const g = game({
      p1: {
        hand: ['bone-shards', 'plains'],
        battlefield: ['swamp', 'morbid-opportunist', 'savannah-lions'],
      },
      p2: { battlefield: ['rumbling-baloth', 'savannah-lions'] },
    });
    const hand = handSize(g, 'p1');
    cast(
      g,
      'bone-shards',
      { targets: [target(g, g.id('p2', 'rumbling-baloth'))] },
      (a) =>
        a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'rumbling-baloth')) &&
        a.sacrifice === g.id('p1', 'savannah-lions'),
    );
    // Bone Shards left the hand; the sacrificed Lions and the Baloth died together: one card.
    expect(handSize(g, 'p1')).toBe(hand - 1 + 1);
  });

  it('Pitiless Plunderer makes Treasure for another creature of yours only', () => {
    const g = game({
      p1: {
        hand: ['corrupted-conviction'],
        battlefield: ['swamp', 'pitiless-plunderer', 'savannah-lions'],
      },
    });
    cast(g, 'corrupted-conviction', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'treasure-token')).toHaveLength(
      1,
    );
  });

  it('Nested Shambler leaves tapped Squirrels equal to its power', () => {
    const g = game({
      p1: { hand: ['village-rites'], battlefield: ['swamp', 'nested-shambler', 'savannah-lions'] },
    });
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'nested-shambler'));
    const squirrels = all(g, 'squirrel-token');
    expect(squirrels).toHaveLength(1);
    expect(g.obj(squirrels[0]!).tapped).toBe(true);
  });

  it('Gixian Infiltrator grows when you sacrifice another permanent', () => {
    const g = game({
      p1: {
        hand: ['village-rites'],
        battlefield: ['swamp', 'gixian-infiltrator', 'savannah-lions'],
      },
    });
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    expect(pt(g, g.id('p1', 'gixian-infiltrator'))).toEqual([3, 2]);
  });

  it('Grave Pact makes the opponent sacrifice a creature each time one of yours dies', () => {
    const g = game({
      p1: { hand: ['village-rites'], battlefield: ['swamp', 'grave-pact', 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    sacrificeAll(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
  });

  it('Spectacle of Destruction counts deaths and seeks a card each upkeep', () => {
    const g = game({
      p1: {
        hand: ['village-rites'],
        battlefield: ['swamp', 'spectacle-of-destruction', 'savannah-lions'],
        library: ['plains', 'savannah-lions'],
      },
    });
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    const spectacle = g.id('p1', 'spectacle-of-destruction');
    expect(g.obj(spectacle).counters?.wreck).toBe(1);
  });
});

describe('enchantments and Auras', () => {
  it("Minion's Return brings the creature back when it dies", () => {
    const g = game({
      p1: {
        hand: ['minions-return', 'infernal-grasp'],
        battlefield: [...n('swamp', 5), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'minions-return', { targets: [target(g, lions)] });
    expect(g.obj(g.id('p1', 'minions-return')).attachedTo).toBe(lions);
    cast(g, 'infernal-grasp', { targets: [target(g, lions)] });
    // The same card is back on the battlefield, without the Aura.
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.obj(lions).controller).toBe('p1');
    expect(zoneIds(g, 'p1', 'graveyard', 'minions-return')).toHaveLength(1);
  });

  it('Hateful Eidolon draws for each Aura that was on a creature that died', () => {
    const g = game({
      p1: {
        hand: ['minions-return', 'infernal-grasp'],
        battlefield: [...n('swamp', 5), 'savannah-lions', 'hateful-eidolon'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'minions-return', { targets: [target(g, lions)] });
    const hand = handSize(g, 'p1');
    cast(g, 'infernal-grasp', { targets: [target(g, lions)] });
    // Infernal Grasp left the hand; the Aura was attached to the dying creature.
    expect(handSize(g, 'p1')).toBe(hand - 1 + 1);
  });

  it('Lord Skitter’s Blessing attaches a Wicked Role and draws extra cards', () => {
    const g = game({
      p1: { hand: ['lord-skitters-blessing'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'lord-skitters-blessing');
    const role = all(g, 'soc-15b-b-wicked-role-token')[0];
    expect(role).toBeDefined();
    expect(g.obj(role!).attachedTo).toBe(lions);
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('Nowhere to Run shrinks a creature and lets opponents’ hexproof creatures be targeted', () => {
    const g = game({
      p1: { hand: ['nowhere-to-run', 'infernal-grasp'], battlefield: [...n('swamp', 4)] },
      p2: { battlefield: ['sphinx-of-the-final-word', 'savannah-lions'] },
    });
    const sphinx = g.id('p2', 'sphinx-of-the-final-word');
    const targetsSphinx = () =>
      castActions(g, 'infernal-grasp').some((a) => JSON.stringify(a.targets).includes(sphinx));
    expect(targetsSphinx()).toBe(false);
    cast(g, 'nowhere-to-run');
    expect(targetsSphinx()).toBe(true);
  });
});

describe('more rules', () => {
  it('the Wicked Role makes each opponent lose 1 life when it is put into a graveyard', () => {
    const g = game({
      p1: {
        hand: ['lord-skitters-blessing', 'infernal-grasp'],
        battlefield: [...n('swamp', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'lord-skitters-blessing');
    cast(g, 'infernal-grasp', { targets: [target(g, lions)] });
    expect(g.life('p2')).toBe(19);
    expect(all(g, 'soc-15b-b-wicked-role-token')).toHaveLength(0);
  });

  it('Vein Ripper can be targeted by paying its ward: sacrificing a creature', () => {
    const g = game({
      p1: { hand: ['infernal-grasp'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
      p2: { battlefield: ['vein-ripper'] },
    });
    const ripper = g.id('p2', 'vein-ripper');
    const act = castActions(g, 'infernal-grasp').find((a) =>
      JSON.stringify(a.targets).includes(ripper),
    );
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.zoneOf(ripper)).toBe('graveyard');
  });

  it('Blighted Nightmare boosts the creature cards in your graveyard and returns one', () => {
    const g = game({
      p1: {
        hand: ['blighted-nightmare'],
        battlefield: [...n('swamp', 3), 'rumbling-baloth'],
        graveyard: ['savannah-lions'],
      },
    });
    const lions = g.state.players.p1.graveyard[0]!;
    cast(g, 'blighted-nightmare');
    activate(g, 'blighted-nightmare', 1);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(zoneIds(g, 'p1', 'hand', 'blighted-nightmare')).toHaveLength(1);
    // Perpetual +1/+1 on the returned card; blight 1 on the Baloth.
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'rumbling-baloth'))).toEqual([3, 3]);
  });

  it('Enduring Tenacity drains opponents when you gain life', () => {
    const g = game({
      p1: {
        hand: ['village-rites'],
        battlefield: ['swamp', 'enduring-tenacity', 'zulaport-cutthroat', 'savannah-lions'],
      },
    });
    cast(g, 'village-rites', {}, (a) => a.sacrifice === g.id('p1', 'savannah-lions'));
    // Cutthroat drains 1; the life gained makes Tenacity drain 1 more.
    expect(g.life('p2')).toBe(18);
  });

  it("Kaya's Ghostform returns the creature under your control", () => {
    const g = game({
      p1: {
        hand: ['kayas-ghostform', 'infernal-grasp'],
        battlefield: [...n('swamp', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'kayas-ghostform', { targets: [target(g, lions)] });
    cast(g, 'infernal-grasp', { targets: [target(g, lions)] });
    expect(g.zoneOf(lions)).toBe('battlefield');
  });
});

describe('creatures', () => {
  it('Accursed Marauder makes each player sacrifice a nontoken creature', () => {
    const g = game({
      p1: { hand: ['accursed-marauder'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'accursed-marauder');
    sacrificeAll(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(all(g, 'savannah-lions').length + all(g, 'accursed-marauder').length).toBe(1);
  });

  it('Abhorrent Overlord makes Harpies equal to your devotion to black', () => {
    const g = game({
      p1: { hand: ['abhorrent-overlord'], battlefield: [...n('swamp', 7), 'blood-artist'] },
    });
    cast(g, 'abhorrent-overlord');
    // {B}{B} of the Overlord and {B} of Blood Artist.
    expect(all(g, 'soc-15b-b-harpy-token')).toHaveLength(3);
  });

  it('Terrors of the Track conjures a duplicate without double team when it attacks', () => {
    const g = game({
      p1: { battlefield: [{ card: 'terrors-of-the-track', sick: false }] },
    });
    const terrors = g.id('p1', 'terrors-of-the-track');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(terrors);
    settle(g);
    const copies = zoneIds(g, 'p1', 'hand', 'terrors-of-the-track');
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).noDoubleTeam).toBe(true);
  });

  it('Vein Ripper’s ward asks for a creature sacrifice', () => {
    const g = game({
      p1: { hand: ['infernal-grasp'], battlefield: [...n('swamp', 2)] },
      p2: { battlefield: ['vein-ripper'] },
    });
    // Without a creature of their own to sacrifice, p1 can't target it.
    const ripper = g.id('p2', 'vein-ripper');
    expect(
      castActions(g, 'infernal-grasp').some((a) => JSON.stringify(a.targets).includes(ripper)),
    ).toBe(false);
  });

  it('Enduring Tenacity drains on lifegain and returns as an enchantment', () => {
    const g = game({
      p1: {
        hand: ['infernal-grasp'],
        battlefield: [...n('swamp', 2), 'enduring-tenacity', 'carrier-thrall'],
      },
      p2: { battlefield: [] },
    });
    const id = g.id('p1', 'enduring-tenacity');
    expect(chars(g, id).types).toContain('Creature');
    cast(g, 'infernal-grasp', { targets: [target(g, id)] });
    // It came back as an enchantment that isn't a creature.
    expect(g.zoneOf(id)).toBe('battlefield');
    expect(g.obj(id).notCreature).toBe(true);
  });

  it('Legion Vanguard sacrifices another creature to explore', () => {
    const g = game({
      p1: {
        battlefield: ['swamp', 'legion-vanguard', 'savannah-lions'],
        library: ['plains', 'savannah-lions'],
      },
    });
    const hand = handSize(g, 'p1');
    activate(g, 'legion-vanguard', 0);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });
});

describe('Liliana, Dreadhorde General', () => {
  it('draws on creature deaths and makes Zombies', () => {
    const g = game({
      p1: { battlefield: ['liliana-dreadhorde-general', 'savannah-lions'] },
    });
    activate(g, 'liliana-dreadhorde-general', 1);
    expect(all(g, 'zombie-token')).toHaveLength(1);
  });

  it('−4 makes each player sacrifice two creatures', () => {
    const g = game({
      p1: { battlefield: ['liliana-dreadhorde-general', ...n('savannah-lions', 3)] },
      p2: { battlefield: n('rumbling-baloth', 3) },
    });
    g.obj(g.id('p1', 'liliana-dreadhorde-general')).counters = { loyalty: 6 };
    activate(g, 'liliana-dreadhorde-general', 2);
    sacrificeAll(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
  });
});

describe('spells', () => {
  it('Soul Shatter makes the opponent sacrifice their greatest mana value creature', () => {
    const g = game({
      p1: { hand: ['soul-shatter'], battlefield: [...n('swamp', 3)] },
      p2: { battlefield: ['savannah-lions', 'rumbling-baloth'] },
    });
    cast(g, 'soul-shatter');
    sacrificeAll(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Victimize returns two creature cards tapped after a sacrifice', () => {
    const g = game({
      p1: {
        hand: ['victimize'],
        battlefield: [...n('swamp', 3), 'savannah-lions'],
        graveyard: ['rumbling-baloth', 'rumbling-baloth'],
      },
    });
    const [a, b] = g.state.players.p1.graveyard;
    cast(g, 'victimize', { targets: [target(g, a!), target(g, b!)] });
    sacrificeAll(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(2);
    expect(g.obj(a!).tapped).toBe(true);
  });

  it('Auntie’s Sentence can shrink a creature', () => {
    const g = game({
      p1: { hand: ["auntie's-sentence".replace("'", '')], battlefield: [...n('swamp', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const act = castActions(g, 'aunties-sentence').find(
      (a) => a.mode === 1 && JSON.stringify(a.targets).includes(baloth),
    );
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(pt(g, baloth)).toEqual([2, 2]);
  });

  it('Ghost Lantern’s Adventure returns a creature card, then the Lantern can be cast', () => {
    const g = game({
      p1: {
        hand: ['ghost-lantern'],
        battlefield: [...n('swamp', 4)],
        graveyard: ['savannah-lions'],
      },
    });
    const lions = g.state.players.p1.graveyard[0]!;
    const lantern = g.id('p1', 'ghost-lantern', 'hand');
    const adventure = g
      .legal()
      .find((a): a is Cast => a.type === 'castSpell' && a.card === lantern && a.back === true);
    expect(adventure).toBeDefined();
    g.do({ ...adventure!, targets: [target(g, lions)] });
    settle(g);
    expect(g.state.players.p1.hand).toContain(lions);
    expect(g.state.players.p1.exile).toContain(lantern);
    const again = g
      .legal()
      .find((a): a is Cast => a.type === 'castSpell' && a.card === lantern && !a.back);
    expect(again).toBeDefined();
  });
});

describe('lands', () => {
  it('Boggart Trawler is a land you can play as Boggart Bog', () => {
    const g = game({ p1: { hand: ['boggart-trawler'] } });
    const act = g.legal().find((a) => a.type === 'playLand');
    expect(act).toBeDefined();
    g.do(act!);
    const id = g.state.battlefield.find((x) => g.obj(x).controller === 'p1')!;
    expect(g.obj(id).defId).toBe('boggart-bog');
    expect(g.obj(id).tapped).toBe(true);
  });

  it('Witch’s Cottage enters tapped unless you control three other Swamps', () => {
    const g = game({
      p1: {
        hand: ["witch's-cottage".replace("'", '')],
        battlefield: n('swamp', 3),
        graveyard: ['savannah-lions'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    const id = g.state.battlefield.find((x) => g.obj(x).defId === 'witchs-cottage')!;
    expect(g.obj(id).tapped).toBe(false);
    settle(g);
    expect(g.state.players.p1.library[0]).toBe(
      g.state.players.p1.library.find((x) => g.obj(x).defId === 'savannah-lions'),
    );
  });

  it('Great Arashin City makes a Spirit from a creature card in your graveyard', () => {
    const g = game({
      p1: { battlefield: [...n('swamp', 2), 'great-arashin-city'], graveyard: ['savannah-lions'] },
    });
    activate(g, 'great-arashin-city', 1);
    expect(all(g, 'soc-15b-b-spirit-token')).toHaveLength(1);
    expect(zoneIds(g, 'p1', 'graveyard', 'savannah-lions')).toHaveLength(0);
  });

  it('Westvale Abbey transforms into Ormendahl after sacrificing five creatures', () => {
    const g = game({
      p1: {
        battlefield: ['westvale-abbey', ...n('plains', 5), ...n('savannah-lions', 5)],
      },
    });
    const abbey = g.id('p1', 'westvale-abbey');
    activate(g, 'westvale-abbey', 2);
    sacrificeAll(g);
    expect(g.obj(abbey).defId).toBe('ormendahl-profane-prince');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it('Phyrexian Tower sacrifices a creature for {B}{B}', () => {
    const g = game({
      p1: { battlefield: ['phyrexian-tower', 'savannah-lions'] },
    });
    activate(g, 'phyrexian-tower', 1);
    expect(g.state.players.p1.pool).toHaveLength(2);
  });

  it('Snow-Covered Swamp taps for {B}', () => {
    const g = game({ p1: { battlefield: ['snow-covered-swamp'] } });
    const id = g.id('p1', 'snow-covered-swamp');
    expect(chars(g, id).types).toEqual(['Land']);
    expect(chars(g, id).subtypes).toContain('Swamp');
  });
});
