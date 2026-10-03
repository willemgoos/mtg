import { type Action, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl (15a, white and colourless): the Quintorius deck's staples.

type G = ReturnType<typeof game>;
const activate = (g: G, defId: string, i = 0) => {
  const src = g.id(g.actor, defId);
  const acts = g
    .legal()
    .filter((a) => a.type === 'activateAbility' && a.source === src && a.abilityIndex === i);
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
  const act = g.legal().find((a) => a.type === 'castSpell' && a.card === card);
  expect(act, `${defId} castable from ${zone}`).toBeDefined();
  g.do({ ...(act as Extract<Action, { type: 'castSpell' }>), targets });
  return settle(g);
};
const castableFromGraveyard = (g: G, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const target = (g: G, id: string) => g.ref(id);
const keywords = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const zoneIds = (g: G, p: 'p1' | 'p2', zone: 'graveyard' | 'hand' | 'exile', defId: string) =>
  g.state.players[p][zone].filter((id) => g.obj(id).defId === defId);

describe('artifacts', () => {
  it('Mind Stone taps for mana and cycles itself for a card', () => {
    const g = game({ p1: { battlefield: ['mind-stone', 'plains'] } });
    const hand = handSize(g, 'p1');
    activate(g, 'mind-stone', 1);
    expect(handSize(g, 'p1')).toBe(hand + 1);
    expect(zoneIds(g, 'p1', 'graveyard', 'mind-stone')).toHaveLength(1);
  });

  it('Crucible of Worlds lets you play a land from the graveyard', () => {
    const g = game({ p1: { battlefield: ['crucible-of-worlds'], graveyard: ['plains'] } });
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
  });

  it('Ghost Vacuum exiles a creature card, then returns it as a 1/1 flying Spirit', () => {
    const g = game({
      p1: { battlefield: ['ghost-vacuum', ...n('plains', 6)] },
      p2: { graveyard: ['rumbling-baloth'] },
    });
    const baloth = g.state.players.p2.graveyard[0]!;
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === g.id('p1', 'ghost-vacuum') &&
            JSON.stringify(a.targets).includes(baloth),
        )!,
    );
    settle(g);
    expect(g.zoneOf(baloth)).toBe('exile');
    // Untap and release it.
    g.obj(g.id('p1', 'ghost-vacuum')).tapped = false;
    activate(g, 'ghost-vacuum', 1);
    expect(g.zoneOf(baloth)).toBe('battlefield');
    expect(g.obj(baloth).controller).toBe('p1');
    expect(pt(g, baloth)).toEqual([1, 1]);
    expect(keywords(g, baloth)).toContain('flying');
    expect(getCharacteristics(g.state, cardDb, baloth).subtypes).toContain('Spirit');
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'ghost-vacuum')).toBe(false);
  });
});

describe('lands', () => {
  it('Gate to the Citadel seeks a nonland card, once', () => {
    const g = game({
      p1: {
        battlefield: ['gate-to-the-citadel', ...n('plains', 4)],
        library: ['plains', 'savannah-lions', 'plains'],
      },
    });
    const hand = handSize(g, 'p1');
    activate(g, 'gate-to-the-citadel', 1);
    expect(handSize(g, 'p1')).toBe(hand + 1);
    expect(zoneIds(g, 'p1', 'hand', 'savannah-lions')).toHaveLength(1);
  });

  it('Witch Enchanter is a land you can play as Witch-Blessed Meadow', () => {
    const g = game({ p1: { hand: ['witch-enchanter'] } });
    const land = g.legal().find((a) => a.type === 'playLand');
    expect(land).toBeDefined();
    g.do(land!);
    const id = g.state.battlefield.find((x) => g.obj(x).controller === 'p1')!;
    expect(g.obj(id).defId).toBe('witch-blessed-meadow');
    expect(g.obj(id).tapped).toBe(true);
    // "You may pay 3 life": accepting untaps it.
    settle(g);
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.life('p1')).toBe(17);
    expect(g.obj(id).tapped).toBe(false);
  });
});

describe('creatures', () => {
  it('Witch Enchanter destroys an opponent’s artifact or enchantment', () => {
    const g = game({
      p1: { hand: ['witch-enchanter'], battlefield: n('plains', 4) },
      p2: { battlefield: ['anointed-procession'] },
    });
    cast(g, 'witch-enchanter');
    settle(g);
    expect(all(g, 'anointed-procession')).toHaveLength(0);
  });

  it('Keening Apparition sacrifices to destroy an enchantment', () => {
    const g = game({
      p1: { battlefield: ['keening-apparition'] },
      p2: { battlefield: ['anointed-procession'] },
    });
    activate(g, 'keening-apparition');
    expect(all(g, 'anointed-procession')).toHaveLength(0);
    expect(all(g, 'keening-apparition')).toHaveLength(0);
  });

  it('Selfless Spirit gives your creatures indestructible', () => {
    const g = game({ p1: { battlefield: ['selfless-spirit', 'savannah-lions'] } });
    activate(g, 'selfless-spirit');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('indestructible');
  });

  it('Moonshaker Cavalry gives creatures flying and +X/+X, X their number', () => {
    const g = game({
      p1: { hand: ['moonshaker-cavalry'], battlefield: [...n('plains', 8), 'savannah-lions'] },
    });
    cast(g, 'moonshaker-cavalry');
    settle(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions)).toContain('flying');
  });

  it('Sun Titan returns a cheap permanent card when it enters', () => {
    const g = game({
      p1: { hand: ['sun-titan'], battlefield: n('plains', 6), graveyard: ['savannah-lions'] },
    });
    cast(g, 'sun-titan');
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Skyclave Apparition exiles a permanent; when it leaves, the owner gets an X/X Illusion', () => {
    const g = game({
      p1: { hand: ['skyclave-apparition', 'shock'], battlefield: [...n('plains', 3), 'mountain'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'skyclave-apparition');
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    const apparition = g.id('p1', 'skyclave-apparition');
    cast(g, 'shock', [target(g, apparition)]);
    settle(g);
    const illusions = g.state.battlefield.filter((id) => g.obj(id).defId === 'soc-illusion-token');
    expect(illusions).toHaveLength(1);
    expect(g.obj(illusions[0]!).controller).toBe('p2');
    expect(pt(g, illusions[0]!)).toEqual([4, 4]);
  });

  it('Patchplate Resolute’s boon puts a counter on the next creature spell', () => {
    const g = game({
      p1: { hand: ['patchplate-resolute', 'savannah-lions'], battlefield: n('plains', 4) },
    });
    cast(g, 'patchplate-resolute');
    settle(g);
    expect(g.state.players.p1.creatureBoons).toBe(1);
    cast(g, 'savannah-lions');
    settle(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(g.state.players.p1.creatureBoons).toBe(0);
  });

  it('Furious Forebear returns to hand when a creature of yours dies, for {1}{W}', () => {
    const g = game({
      p1: {
        graveyard: ['furious-forebear'],
        battlefield: ['savannah-lions', 'plains', 'plains', 'mountain'],
        hand: ['shock'],
      },
    });
    const forebear = g.state.players.p1.graveyard[0]!;
    cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.zoneOf(forebear)).toBe('hand');
  });

  it('Lunarch Veteran gains life on creatures entering; disturb brings back Luminous Phantom', () => {
    const g = game({
      p1: {
        battlefield: ['lunarch-veteran', ...n('plains', 2)],
        hand: ['savannah-lions'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p1')).toBe(21);
    const g2 = game({
      p1: { graveyard: ['lunarch-veteran'], battlefield: n('plains', 2) },
    });
    const card = g2.state.players.p1.graveyard[0]!;
    const act = g2.legal().find((a) => a.type === 'castSpell' && a.card === card);
    expect(act).toBeDefined();
    g2.do(act!);
    settle(g2);
    expect(g2.obj(card).defId).toBe('luminous-phantom');
    expect(g2.zoneOf(card)).toBe('battlefield');
    expect(keywords(g2, card)).toContain('flying');
  });
});

describe('spells', () => {
  it('Battle Screech makes two Birds; flashback taps three white creatures', () => {
    const g = game({
      p1: {
        hand: ['battle-screech'],
        battlefield: [...n('plains', 4), 'savannah-lions'],
      },
    });
    cast(g, 'battle-screech');
    settle(g);
    expect(all(g, 'soc-bird-token')).toHaveLength(2);
    expect(castableFromGraveyard(g, 'battle-screech')).toBe(true);
    castFrom(g, 'battle-screech', 'graveyard');
    expect(all(g, 'soc-bird-token')).toHaveLength(4);
    expect(g.zoneOf(g.id('p1', 'battle-screech', 'exile'))).toBe('exile');
  });

  it('Battle Screech flashback needs three untapped white creatures', () => {
    const g = game({
      p1: { graveyard: ['battle-screech'], battlefield: ['savannah-lions', 'savannah-lions'] },
    });
    expect(castableFromGraveyard(g, 'battle-screech')).toBe(false);
  });

  it('Anointed Procession doubles tokens', () => {
    const g = game({
      p1: { hand: ['battle-screech'], battlefield: [...n('plains', 4), 'anointed-procession'] },
    });
    cast(g, 'battle-screech');
    settle(g);
    expect(all(g, 'soc-bird-token')).toHaveLength(4);
  });

  it('Helping Hand returns a creature tapped; Call a Surprise Witness gives it flying and Spirit', () => {
    const g = game({
      p1: {
        hand: ['helping-hand', 'call-a-surprise-witness'],
        battlefield: n('plains', 3),
        graveyard: ['savannah-lions', 'savannah-lions'],
      },
    });
    const [a, b] = g.state.players.p1.graveyard as [string, string];
    cast(g, 'helping-hand', [target(g, a)]);
    settle(g);
    expect(g.zoneOf(a)).toBe('battlefield');
    expect(g.obj(a).tapped).toBe(true);
    cast(g, 'call-a-surprise-witness', [target(g, b)]);
    settle(g);
    expect(keywords(g, b)).toContain('flying');
    expect(getCharacteristics(g.state, cardDb, b).subtypes).toContain('Spirit');
  });

  it('Late to Dinner returns any creature and makes a Food', () => {
    const g = game({
      p1: { hand: ['late-to-dinner'], battlefield: n('plains', 4), graveyard: ['rumbling-baloth'] },
    });
    const baloth = g.state.players.p1.graveyard[0]!;
    cast(g, 'late-to-dinner', [target(g, baloth)]);
    settle(g);
    expect(g.zoneOf(baloth)).toBe('battlefield');
    expect(all(g, 'food-token')).toHaveLength(1);
  });

  it('Sevinne’s Reclamation, flashed back, copies itself for a second card', () => {
    const g = game({
      p1: {
        battlefield: n('plains', 5),
        graveyard: ['sevinnes-reclamation', 'savannah-lions', 'mind-stone'],
      },
    });
    const [, lions] = g.state.players.p1.graveyard as [string, string, string];
    castFrom(g, 'sevinnes-reclamation', 'graveyard', [target(g, lions)]);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(all(g, 'mind-stone')).toHaveLength(1);
  });
});

describe('enchantments', () => {
  it('Sentinel’s Eyes escapes from the graveyard by exiling two other cards', () => {
    const g = game({
      p1: {
        battlefield: ['savannah-lions', 'plains'],
        graveyard: ['sentinels-eyes', 'plains', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(castableFromGraveyard(g, 'sentinels-eyes')).toBe(true);
    castFrom(g, 'sentinels-eyes', 'graveyard', [target(g, lions)]);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('vigilance');
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    expect(g.state.players.p1.exile).toHaveLength(2);
  });

  it('Sentinel’s Eyes needs two other cards to escape', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', 'plains'], graveyard: ['sentinels-eyes', 'plains'] },
    });
    expect(castableFromGraveyard(g, 'sentinels-eyes')).toBe(false);
  });

  it('Deification gives your planeswalkers hexproof and keeps one loyalty counter while you control a creature', () => {
    const walker = [...cardDb.values()].find(
      (d) => d.types.includes('Planeswalker') && !d.back && d.abilities.length > 0,
    )!;
    const canTarget = (gg: G, id: string) =>
      gg
        .legal('p2')
        .some((a) => a.type === 'castSpell' && JSON.stringify(a.targets).includes(`"${id}"`));
    const base = { p2: { hand: ['shock'], battlefield: ['mountain'] }, active: 'p2' as const };
    const plain = game({ ...base, p1: { battlefield: [walker.id] } });
    expect(canTarget(plain, plain.id('p1', walker.id))).toBe(true);
    const protectedWalker = game({ ...base, p1: { battlefield: [walker.id, 'deification'] } });
    expect(canTarget(protectedWalker, protectedWalker.id('p1', walker.id))).toBe(false);

    // Damage (from your own spell, since it can't be targeted by opponents) can't remove the last counter.
    const mine = (creature: boolean) =>
      game({
        p1: {
          battlefield: [
            walker.id,
            'deification',
            'mountain',
            ...(creature ? ['savannah-lions'] : []),
          ],
          hand: ['shock'],
        },
      });
    const withCreature = mine(true);
    const w1 = withCreature.id('p1', walker.id);
    withCreature.obj(w1).counters = { loyalty: 1 };
    cast(withCreature, 'shock', [withCreature.ref(w1)]);
    settle(withCreature);
    expect(withCreature.zoneOf(w1)).toBe('battlefield');
    expect(withCreature.obj(w1).counters?.loyalty).toBe(1);
    const alone = mine(false);
    const w2 = alone.id('p1', walker.id);
    alone.obj(w2).counters = { loyalty: 1 };
    cast(alone, 'shock', [alone.ref(w2)]);
    settle(alone);
    expect(alone.zoneOf(w2)).not.toBe('battlefield');
  });
});
