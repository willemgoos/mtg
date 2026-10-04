import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl (15b, pair): the white-black (Killian) and green-blue (Zimone) cards.

type G = ReturnType<typeof game>;
type Cast = Extract<Action, { type: 'castSpell' }>;
const legalCast = (g: G, defId: string, zone: 'hand' | 'graveyard' | 'exile' = 'hand'): Cast[] => {
  const card = g.id(g.actor, defId, zone);
  return g.legal().filter((a): a is Cast => a.type === 'castSpell' && a.card === card);
};
const activate = (g: G, defId: string, i = 0) => {
  const src = g.id(g.actor, defId);
  const act = g
    .legal()
    .find((a) => a.type === 'activateAbility' && a.source === src && a.abilityIndex === i);
  expect(act, `${defId} ability ${i} can be activated`).toBeDefined();
  g.do(act!);
  return settle(g);
};
const pick = (g: G, label: RegExp) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected an option prompt, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0)
    throw new Error(`No option matching ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  return g.do({ type: 'chooseOption', player: d.player, index });
};
const inZone = (
  g: G,
  p: 'p1' | 'p2',
  zone: 'graveyard' | 'hand' | 'exile' | 'library',
  id: string,
) => g.state.players[p][zone].filter((x) => g.obj(x).defId === id);
const keywords = (g: G, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];
const counters = (g: G, id: string) => g.obj(id).plusOneCounters;
const play = (g: G, defId: string) => {
  const card = g.id(g.actor, defId, 'hand');
  g.do(g.legal().find((a) => a.type === 'playLand' && a.card === card)!);
};
const tapped = (g: G, id: string) => g.obj(id).tapped;

describe('lands and mana rocks', () => {
  it('Godless Shrine enters tapped unless you pay 2 life, and has both basic land types', () => {
    const g = game({ p1: { hand: ['godless-shrine'] } });
    play(g, 'godless-shrine');
    settle(g);
    pick(g, /Pay 2 life/);
    expect(g.life('p1')).toBe(18);
    const id = all(g, 'godless-shrine')[0]!;
    expect(tapped(g, id)).toBe(false);
    expect(getCharacteristics(g.state, cardDb, id).subtypes).toEqual(
      expect.arrayContaining(['Plains', 'Swamp']),
    );
    const h = game({ p1: { hand: ['breeding-pool'] } });
    play(h, 'breeding-pool');
    settle(h);
    pick(h, /Enter tapped/);
    expect(h.life('p1')).toBe(20);
    expect(tapped(h, all(h, 'breeding-pool')[0]!)).toBe(true);
  });

  it('Isolated Chapel enters tapped unless you control a Plains or Swamp', () => {
    const g = game({ p1: { hand: ['isolated-chapel'] } });
    play(g, 'isolated-chapel');
    expect(tapped(g, all(g, 'isolated-chapel')[0]!)).toBe(true);
    const h = game({ p1: { hand: ['isolated-chapel'], battlefield: ['swamp'] } });
    play(h, 'isolated-chapel');
    expect(tapped(h, all(h, 'isolated-chapel')[0]!)).toBe(false);
  });

  it('Lakeside Shack enters untapped only if a player has 13 or less life', () => {
    const g = game({ p1: { hand: ['lakeside-shack'] } });
    play(g, 'lakeside-shack');
    expect(tapped(g, all(g, 'lakeside-shack')[0]!)).toBe(true);
    const h = game({ p1: { hand: ['lakeside-shack'] }, p2: { life: 13 } });
    play(h, 'lakeside-shack');
    expect(tapped(h, all(h, 'lakeside-shack')[0]!)).toBe(false);
  });

  it('Botanical Sanctum enters tapped once you control three other lands', () => {
    const g = game({ p1: { hand: ['botanical-sanctum'], battlefield: n('forest', 3) } });
    play(g, 'botanical-sanctum');
    expect(tapped(g, all(g, 'botanical-sanctum')[0]!)).toBe(true);
    const h = game({ p1: { hand: ['botanical-sanctum'], battlefield: n('forest', 2) } });
    play(h, 'botanical-sanctum');
    expect(tapped(h, all(h, 'botanical-sanctum')[0]!)).toBe(false);
  });

  it('Bleachbone Verge taps for white only while you control a Plains or Swamp', () => {
    const alone = game({ p1: { hand: ['savannah-lions'], battlefield: ['bleachbone-verge'] } });
    expect(legalCast(alone, 'savannah-lions')).toHaveLength(0);
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['bleachbone-verge', 'swamp'] },
    });
    expect(legalCast(g, 'savannah-lions').length).toBeGreaterThan(0);
  });

  it('Caves of Koilos and Talismans deal 1 damage only for coloured mana', () => {
    const g = game({
      p1: { hand: ['savannah-lions', 'mind-stone'], battlefield: ['caves-of-koilos'] },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p1')).toBe(19);
    const h = game({
      p1: { hand: ['mind-stone'], battlefield: ['talisman-of-hierarchy', 'plains'] },
    });
    cast(h, 'mind-stone');
    settle(h);
    expect(h.life('p1')).toBe(20);
  });

  it('Great Hall of Starnheim sacrifices itself and a creature for a 4/4 flying Angel Warrior', () => {
    const g = game({
      p1: {
        battlefield: ['great-hall-of-starnheim', 'plains', 'plains', 'swamp', 'savannah-lions'],
      },
    });
    activate(g, 'great-hall-of-starnheim', 1);
    expect(all(g, 'great-hall-of-starnheim')).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    const angel = all(g, 'soc-15b-pair-angel-warrior');
    expect(angel).toHaveLength(1);
    expect(pt(g, angel[0]!)).toEqual([4, 4]);
    expect(keywords(g, angel[0]!)).toEqual(expect.arrayContaining(['flying', 'vigilance']));
  });

  it('Orzhov Signet turns {1} into {W}{B}', () => {
    const g = game({ p1: { battlefield: ['orzhov-signet', 'plains'] } });
    activate(g, 'orzhov-signet');
    expect(g.state.players.p1.pool?.map((m) => m.produces)).toEqual([['W'], ['B']]);
  });

  it('Shadowy Backstreet surveils 1 as it enters', () => {
    const g = game({
      p1: { hand: ['shadowy-backstreet'], library: ['island', 'forest', 'forest'] },
    });
    play(g, 'shadowy-backstreet');
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });
});

describe('Killian, Eriette, Neva and Scriv', () => {
  it('Killian taps and goads a creature when an enchantment enters, and draws when enchanted creatures attack', () => {
    const g = game({
      p1: {
        hand: ['gift-of-orzhova'],
        battlefield: ['killian-decisive-mentor', 'savannah-lions', ...n('plains', 3)],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'gift-of-orzhova', [g.ref(lions)]);
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(baloth)),
    );
    expect(tapped(g, baloth)).toBe(true);
    expect(g.state.effects.some((e) => e.mustAttack && e.affected.id === baloth)).toBe(true);
    // The enchanted Lions (3/2 flying lifelink) attack: Killian draws a card.
    expect(pt(g, lions)).toEqual([3, 2]);
    g.passUntilStep('beginCombat');
    g.pass().pass();
    const hand = handSize(g, 'p1');
    g.attack(lions);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });

  it('Killian doesn’t draw when no enchanted creature attacks', () => {
    const g = game({
      p1: { battlefield: ['killian-decisive-mentor', 'savannah-lions'] },
      step: 'beginCombat',
    });
    g.pass().pass();
    const hand = handSize(g, 'p1');
    g.attack(g.id('p1', 'savannah-lions'));
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand);
  });

  it('Eriette: creatures enchanted by your Auras can’t attack you', () => {
    const g = game({
      p1: { battlefield: ['eriette-of-the-charmed-apple', 'gift-of-orzhova'] },
      p2: { battlefield: ['rumbling-baloth', 'savannah-lions'] },
      active: 'p2',
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'gift-of-orzhova')).attachedTo = g.id('p2', 'rumbling-baloth');
    g.pass().pass();
    const attackers = g
      .legal()
      .filter((a) => a.type === 'addAttacker')
      .map((a) => (a as { attacker: string }).attacker);
    expect(attackers).toContain(g.id('p2', 'savannah-lions'));
    expect(attackers).not.toContain(g.id('p2', 'rumbling-baloth'));
  });

  it('Eriette drains for each Aura you control at your end step', () => {
    const g = game({
      p1: {
        battlefield: [
          'eriette-of-the-charmed-apple',
          'gift-of-orzhova',
          'gift-of-orzhova',
          'savannah-lions',
        ],
      },
      step: 'end',
    });
    for (const id of g.state.battlefield)
      if (g.obj(id).defId === 'gift-of-orzhova')
        g.obj(id).attachedTo = g.id('p1', 'savannah-lions');
    // Moving into the end step happens at the end of the second main phase.
    g.state.turn.step = 'main2';
    g.passUntilStep('end');
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Neva returns a creature or enchantment card, then grows when an enchantment of yours dies', () => {
    const g = game({
      p1: {
        hand: ['neva-stalked-by-nightmares', 'shock'],
        graveyard: ['gift-of-orzhova'],
        battlefield: [
          'gift-of-orzhova',
          'savannah-lions',
          ...n('plains', 2),
          ...n('swamp', 2),
          'mountain',
        ],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'gift-of-orzhova')).attachedTo = lions;
    cast(g, 'neva-stalked-by-nightmares');
    settle(g);
    expect(inZone(g, 'p1', 'hand', 'gift-of-orzhova')).toHaveLength(1);
    const neva = g.id('p1', 'neva-stalked-by-nightmares');
    expect(counters(g, neva)).toBe(0);
    // Shock the enchanted Lions: the Aura goes to the graveyard, so Neva grows and scries.
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(lions)],
    });
    settle(g);
    expect(counters(g, neva)).toBe(1);
    expect(g.decision.kind).toBe('scry');
  });

  it('Scriv enchants an opposing creature with a Contract on entering and attacking', () => {
    const g = game({
      p1: { hand: ['scriv-the-obligator'], battlefield: [...n('plains', 2), ...n('swamp', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'scriv-the-obligator');
    settle(g);
    const contract = all(g, 'soc-15b-pair-contract');
    expect(contract).toHaveLength(1);
    expect(g.obj(contract[0]!).attachedTo).toBe(g.id('p2', 'rumbling-baloth'));
    expect(g.obj(contract[0]!).controller).toBe('p1');
    expect(keywords(g, g.id('p1', 'scriv-the-obligator'))).toEqual(
      expect.arrayContaining(['flying', 'deathtouch']),
    );
  });

  it('Contract: its creature attacking you costs its controller 2 life; attacking an opponent of the Contract’s controller pumps it', () => {
    const g = game({
      p1: { battlefield: ['soc-15b-pair-contract'] },
      p2: { battlefield: ['savannah-lions'] },
      active: 'p2',
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'soc-15b-pair-contract')).attachedTo = g.id('p2', 'savannah-lions');
    g.pass().pass();
    g.attack(g.id('p2', 'savannah-lions'));
    settle(g);
    expect(g.life('p2')).toBe(18);
    // Under its attacker's own control (the Contract's controller attacks an opponent): +2/+0.
    const h = game({
      p1: { battlefield: ['soc-15b-pair-contract', 'savannah-lions'] },
      step: 'beginCombat',
    });
    h.obj(h.id('p1', 'soc-15b-pair-contract')).attachedTo = h.id('p1', 'savannah-lions');
    h.pass().pass();
    h.attack(h.id('p1', 'savannah-lions'));
    settle(h);
    expect(pt(h, h.id('p1', 'savannah-lions'))).toEqual([4, 1]);
    expect(h.life('p1')).toBe(20);
  });
});

describe('Cruel Celebrant and Elas il-Kor', () => {
  it('Cruel Celebrant drains when it or another creature or planeswalker you control dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['cruel-celebrant', 'savannah-lions', 'mountain'] },
    });
    cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    expect(g.life('p1')).toBe(21);
    expect(g.life('p2')).toBe(19);
  });

  it('Elas il-Kor gains life for creatures entering and drains for creatures dying', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'shock'],
        battlefield: ['elas-il-kor-sadistic-pilgrim', 'plains', 'mountain', 'mountain'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p1')).toBe(21);
    cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    expect(g.life('p2')).toBe(19);
  });
});

describe('white-black spells', () => {
  it('Glasswing Grace is an Aura that gives +2/+2, flying and lifelink; Age-Graced Chapel is a tapped land', () => {
    const g = game({
      p1: {
        hand: ['glasswing-grace', 'glasswing-grace'],
        battlefield: ['savannah-lions', ...n('plains', 3), ...n('swamp', 2)],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const grace = g.state.players.p1.hand[0]!;
    g.do({ type: 'castSpell', player: 'p1', card: grace, targets: [g.ref(lions)] });
    settle(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions)).toEqual(expect.arrayContaining(['flying', 'lifelink']));
    const land = g.legal().find((a) => a.type === 'playLand');
    expect(land).toBeDefined();
    g.do(land!);
    const chapel = g.state.battlefield.find((id) => g.obj(id).defId === 'age-graced-chapel');
    expect(chapel).toBeDefined();
    expect(tapped(g, chapel!)).toBe(true);
  });

  it('Damn destroys a creature, or every creature when overloaded', () => {
    const board = {
      p1: { hand: ['damn'], battlefield: ['savannah-lions', ...n('plains', 2), ...n('swamp', 2)] },
      p2: { battlefield: ['rumbling-baloth', 'savannah-lions'] },
    };
    const g = game(board);
    const single = legalCast(g, 'damn').filter((a) => !a.kicked);
    expect(single.length).toBeGreaterThan(0);
    g.do(single.find((a) => JSON.stringify(a.targets).includes(g.id('p2', 'rumbling-baloth')))!);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(2);
    // Overload {2}{W}{W} works without any black mana.
    const h = game({
      ...board,
      p1: { ...board.p1, battlefield: ['savannah-lions', ...n('plains', 4)] },
    });
    const overload = legalCast(h, 'damn').find((a) => a.kicked)!;
    expect(overload).toBeDefined();
    h.do(overload);
    settle(h);
    expect(all(h, 'savannah-lions')).toHaveLength(0);
    expect(all(h, 'rumbling-baloth')).toHaveLength(0);
  });

  it('Lingering Souls makes two flying Spirits and has flashback {1}{B}', () => {
    const g = game({
      p1: { hand: ['lingering-souls'], battlefield: [...n('plains', 3), ...n('swamp', 2)] },
    });
    cast(g, 'lingering-souls');
    settle(g);
    expect(all(g, 'spirit-flying-token')).toHaveLength(2);
    expect(inZone(g, 'p1', 'graveyard', 'lingering-souls')).toHaveLength(1);
    const fb = legalCast(g, 'lingering-souls', 'graveyard');
    expect(fb.length).toBeGreaterThan(0);
    g.do(fb[0]!);
    settle(g);
    expect(all(g, 'spirit-flying-token')).toHaveLength(4);
    expect(inZone(g, 'p1', 'exile', 'lingering-souls')).toHaveLength(1);
  });

  it('Rite of Oblivion sacrifices a nonland permanent to exile a nonland permanent, and flashes back', () => {
    const g = game({
      p1: {
        hand: ['rite-of-oblivion'],
        battlefield: ['savannah-lions', 'mind-stone', ...n('plains', 4), ...n('swamp', 2)],
      },
      p2: { battlefield: ['rumbling-baloth', 'savannah-lions'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const options = legalCast(g, 'rite-of-oblivion');
    // A land can't be sacrificed; the Mind Stone and the Lions can.
    const sacs = new Set(options.map((a) => a.sacrifice));
    expect(sacs.has(g.id('p1', 'mind-stone'))).toBe(true);
    expect(sacs.has(g.id('p1', 'savannah-lions'))).toBe(true);
    expect([...sacs].some((id) => id && g.obj(id).defId === 'plains')).toBe(false);
    g.do(
      options.find(
        (a) =>
          a.sacrifice === g.id('p1', 'mind-stone') && JSON.stringify(a.targets).includes(baloth),
      )!,
    );
    settle(g);
    expect(g.zoneOf(baloth)).toBe('exile');
    expect(all(g, 'mind-stone')).toHaveLength(0);
    // Flashback {2}{W}{B}, and its additional cost again.
    const fb = legalCast(g, 'rite-of-oblivion', 'graveyard');
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every((a) => a.sacrifice === g.id('p1', 'savannah-lions'))).toBe(true);
  });

  it('Hidden Stockpile makes a Servo at the end step after a permanent left, and scries for a sacrifice', () => {
    const g = game({
      p1: { battlefield: ['hidden-stockpile', 'savannah-lions', 'plains', 'swamp'] },
    });
    // No revolt yet: no Servo.
    g.state.turn.step = 'main2';
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'soc-15b-pair-servo')).toHaveLength(0);
    // Sacrifice the Lions: a permanent left the battlefield this turn.
    const h = game({
      p1: { battlefield: ['hidden-stockpile', 'savannah-lions', 'plains', 'swamp'] },
    });
    h.do(
      h
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === h.id('p1', 'hidden-stockpile') &&
            (a as { sacrifice?: string }).sacrifice === h.id('p1', 'savannah-lions'),
        )!,
    );
    settle(h);
    expect(h.decision.kind).toBe('scry');
    h.do(h.legal().find((a) => a.type === 'scry')!);
    h.passUntilStep('end');
    settle(h);
    expect(all(h, 'soc-15b-pair-servo')).toHaveLength(1);
    expect(pt(h, all(h, 'soc-15b-pair-servo')[0]!)).toEqual([1, 1]);
  });
});

describe('green-blue creatures', () => {
  it('Zimone grows by two on your first X spell and discounts only the first X spell each turn', () => {
    const board = {
      p1: {
        hand: ['hydroid-krasis', 'hydroid-krasis'],
        battlefield: ['zimone-infinite-analyst', ...n('forest', 2), ...n('island', 2)],
      },
    };
    const g = game(board);
    const zimone = g.id('p1', 'zimone-infinite-analyst');
    expect(pt(g, zimone)).toEqual([0, 4]);
    // With two counters the first X spell costs {2} less: X = 4 for four mana.
    g.obj(zimone).plusOneCounters = 2;
    const [first, second] = g.state.players.p1.hand;
    const canX = (card: string, x: number) =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === card && a.x === x);
    expect(canX(first!, 4)).toBe(true);
    g.do({ type: 'castSpell', player: 'p1', card: first!, targets: [], x: 0 });
    settle(g);
    expect(counters(g, zimone)).toBe(4);
    // Lands are untapped again; the second X spell gets no discount.
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
    expect(canX(second!, 2)).toBe(true);
    expect(canX(second!, 4)).toBe(false);
  });

  it('Altered Ego enters as a copy of a creature with X additional counters', () => {
    const g = game({
      p1: { hand: ['altered-ego'], battlefield: [...n('forest', 3), ...n('island', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const act = legalCast(g, 'altered-ego').find((a) => a.copyOf === baloth && a.x === 1)!;
    expect(act).toBeDefined();
    g.do(act);
    settle(g);
    const copy = g.state.battlefield.find(
      (id) => g.obj(id).controller === 'p1' && g.obj(id).defId === 'rumbling-baloth',
    )!;
    expect(copy).toBeDefined();
    expect(pt(g, copy)).toEqual([5, 5]);
  });

  it('Hydroid Krasis gains half X life and draws half X cards on cast, and enters with X counters', () => {
    const g = game({
      p1: { hand: ['hydroid-krasis'], battlefield: [...n('forest', 4), ...n('island', 3)] },
    });
    const hand = handSize(g, 'p1');
    g.do(legalCast(g, 'hydroid-krasis').find((a) => a.x === 5)!);
    settle(g);
    expect(g.life('p1')).toBe(22);
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
    const krasis = all(g, 'hydroid-krasis')[0]!;
    expect(counters(g, krasis)).toBe(5);
    expect(keywords(g, krasis)).toEqual(expect.arrayContaining(['flying', 'trample']));
  });

  it('Primo enters with twice X counters', () => {
    const g = game({
      p1: { hand: ['primo-the-unbounded'], battlefield: [...n('forest', 4), ...n('island', 2)] },
    });
    g.do(legalCast(g, 'primo-the-unbounded').find((a) => a.x === 2)!);
    settle(g);
    const primo = all(g, 'primo-the-unbounded')[0]!;
    expect(counters(g, primo)).toBe(4);
    expect(pt(g, primo)).toEqual([4, 4]);
  });

  it('Primo makes one Fractal with counters equal to the damage dealt by creatures with base power 0', () => {
    const g = game({
      p1: { battlefield: ['primo-the-unbounded', 'hydroid-krasis', 'savannah-lions'] },
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'primo-the-unbounded')).plusOneCounters = 4;
    g.obj(g.id('p1', 'hydroid-krasis')).plusOneCounters = 3;
    g.pass().pass();
    g.attack(
      g.id('p1', 'primo-the-unbounded'),
      g.id('p1', 'hydroid-krasis'),
      g.id('p1', 'savannah-lions'),
    );
    settle(g);
    g.passUntilStep('endCombat');
    settle(g);
    const fractals = all(g, 'stx-fractal-token');
    expect(fractals).toHaveLength(1);
    // Primo (4) and Krasis (3) have base power 0; the Lions' damage doesn't count.
    expect(counters(g, fractals[0]!)).toBe(7);
    expect(g.life('p2')).toBe(20 - 4 - 3 - 2);
  });

  it('Troyan’s mana pays only for spells with mana value 5 or greater or with X', () => {
    const g = game({
      p1: { hand: ['hydroid-krasis', 'mind-stone'], battlefield: ['troyan-gutsy-explorer'] },
    });
    activate(g, 'troyan-gutsy-explorer', 0);
    expect(g.state.players.p1.pool).toHaveLength(2);
    expect(legalCast(g, 'hydroid-krasis').length).toBeGreaterThan(0);
    expect(legalCast(g, 'mind-stone')).toHaveLength(0);
  });

  it('Troyan loots for {U}', () => {
    const g = game({
      p1: { hand: ['mind-stone'], battlefield: ['troyan-gutsy-explorer', 'island'] },
    });
    activate(g, 'troyan-gutsy-explorer', 1);
    expect(g.decision.kind).toBe('discard');
  });

  it('Maraleaf Pixie taps for G or U', () => {
    const g = game({ p1: { hand: ['llanowar-elves'], battlefield: ['maraleaf-pixie'] } });
    expect(legalCast(g, 'llanowar-elves').length).toBeGreaterThan(0);
    const h = game({ p1: { hand: ['mind-stone'], battlefield: ['maraleaf-pixie', 'forest'] } });
    expect(legalCast(h, 'mind-stone').length).toBeGreaterThan(0);
  });
});

describe('green-blue spells', () => {
  it('Growth Spiral draws a card and may put a land from hand onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['growth-spiral', 'forest'],
        battlefield: ['forest', 'island'],
        library: n('island', 5),
      },
    });
    cast(g, 'growth-spiral');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== null)!);
    expect(inZone(g, 'p1', 'hand', 'forest')).toHaveLength(0);
    expect(all(g, 'forest')).toHaveLength(2);
  });

  it('Planar Genesis puts a land onto the battlefield tapped or a card into your hand, the rest on the bottom', () => {
    const g = game({
      p1: {
        hand: ['planar-genesis'],
        battlefield: ['forest', 'island'],
        library: ['island', 'rumbling-baloth', 'forest', 'savannah-lions', 'plains', 'plains'],
      },
    });
    cast(g, 'planar-genesis');
    settle(g);
    pick(g, /Put Island onto the battlefield tapped/);
    expect(all(g, 'island')).toHaveLength(2);
    expect(all(g, 'island').some((id) => tapped(g, id))).toBe(true);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(5);
    expect(lib.slice(0, 2)).toEqual(['plains', 'plains']);
    // Declining the land: the chosen card goes into your hand instead.
    const h = game({
      p1: {
        hand: ['planar-genesis'],
        battlefield: ['forest', 'island'],
        library: ['island', 'rumbling-baloth', 'forest', 'savannah-lions', 'plains'],
      },
    });
    cast(h, 'planar-genesis');
    settle(h);
    pick(h, /Put Rumbling Baloth into your hand/);
    expect(inZone(h, 'p1', 'hand', 'rumbling-baloth')).toHaveLength(1);
    expect(all(h, 'island')).toHaveLength(1);
  });

  it('Repulsive Mutation puts X counters on your creature and counters a spell unless its controller pays the greatest power', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['savannah-lions', 'mountain'] },
      p2: {
        hand: ['repulsive-mutation'],
        battlefield: ['savannah-lions', 'forest', 'forest', 'island', 'island'],
      },
    });
    // p1 casts Shock at p2's Lions; p2 responds.
    cast(g, 'shock', [g.ref(g.id('p2', 'savannah-lions'))]);
    const shock = g.id('p1', 'shock', 'stack');
    g.pass();
    expect(g.actor).toBe('p2');
    const lions = g.id('p2', 'savannah-lions');
    const act = legalCast(g, 'repulsive-mutation').find(
      (a) =>
        a.x === 2 &&
        JSON.stringify(a.targets).includes(lions) &&
        JSON.stringify(a.targets).includes(shock),
    );
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    // The Lions have two counters (4/3 greatest power 4); p1 has one Mountain tapped: can't pay {4}.
    expect(counters(g, lions)).toBe(2);
    expect(g.zoneOf(shock)).toBe('graveyard');
    expect(all(g, 'savannah-lions')).toHaveLength(2);
    expect(g.life('p2')).toBe(20);
  });

  it('Ornate Imitations conjures a creature for each number from 1 to X, and X can’t be 0', () => {
    const g = game({
      p1: { hand: ['ornate-imitations'], battlefield: [...n('forest', 3), ...n('island', 2)] },
    });
    const acts = legalCast(g, 'ornate-imitations');
    expect(acts.some((a) => a.x === 0)).toBe(false);
    g.do(acts.find((a) => a.x === 3)!);
    settle(g);
    const conjured = g.state.battlefield
      .filter(
        (id) =>
          g.obj(id).controller === 'p1' &&
          getCharacteristics(g.state, cardDb, id).types.includes('Creature'),
      )
      .map((id) => cardDb.get(g.obj(id).defId)!)
      .map((d) => d.manaCost.generic + Object.values(d.manaCost.colored).reduce((a, b) => a + b, 0))
      .sort();
    // A conjured creature may leave at once (it can have a drawback), so count those in the graveyard too.
    const gone = g.state.players.p1.graveyard.filter(
      (id) => g.obj(id).defId !== 'ornate-imitations',
    ).length;
    expect(conjured.length + gone).toBe(3);
  });

  it('Simic Charm can bounce a creature', () => {
    const g = game({
      p1: { hand: ['simic-charm'], battlefield: ['savannah-lions', 'forest', 'island'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const bounce = legalCast(g, 'simic-charm').find(
      (a) => a.mode === 2 && JSON.stringify(a.targets).includes(baloth),
    )!;
    g.do(bounce);
    settle(g);
    expect(inZone(g, 'p2', 'hand', 'rumbling-baloth')).toHaveLength(1);
  });

  it('Simic Charm gives permanents you control hexproof', () => {
    const g = game({
      p1: { hand: ['simic-charm'], battlefield: ['savannah-lions', 'forest', 'island'] },
    });
    g.do(legalCast(g, 'simic-charm').find((a) => a.mode === 1)!);
    settle(g);
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('hexproof');
  });

  it('Make Your Own Luck plots a nonland card (cast free as a sorcery on a later turn) and takes the rest', () => {
    const g = game({
      p1: {
        hand: ['make-your-own-luck'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: ['rumbling-baloth', 'forest', 'savannah-lions', 'forest'],
      },
    });
    const hand = handSize(g, 'p1');
    cast(g, 'make-your-own-luck');
    settle(g);
    pick(g, /Exile Rumbling Baloth/);
    expect(inZone(g, 'p1', 'exile', 'rumbling-baloth')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
    // Not castable on the turn it was plotted.
    expect(legalCast(g, 'rumbling-baloth', 'exile')).toHaveLength(0);
    g.state.turn.number += 2;
    const act = legalCast(g, 'rumbling-baloth', 'exile');
    expect(act.length).toBeGreaterThan(0);
    g.do(act[0]!);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
  });

  it('Unexpected Results casts a revealed nonland card free', () => {
    const g = game({
      p1: {
        hand: ['unexpected-results'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: n('savannah-lions', 6),
      },
    });
    cast(g, 'unexpected-results');
    settle(g);
    pick(g, /Cast it without paying/);
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Unexpected Results puts a nonland card back on top if you don’t cast it', () => {
    const g = game({
      p1: {
        hand: ['unexpected-results'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: n('savannah-lions', 6),
      },
    });
    cast(g, 'unexpected-results');
    settle(g);
    pick(g, /Don't cast/);
    expect(g.state.players.p1.library).toHaveLength(6);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('savannah-lions');
  });

  it('Unexpected Results puts a revealed land onto the battlefield and returns itself to your hand', () => {
    const g = game({
      p1: {
        hand: ['unexpected-results'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: n('forest', 6),
      },
    });
    cast(g, 'unexpected-results');
    settle(g);
    pick(g, /Put it onto the battlefield/);
    expect(all(g, 'forest')).toHaveLength(4);
    expect(inZone(g, 'p1', 'hand', 'unexpected-results')).toHaveLength(1);
  });

  it('a copy of Unexpected Results that finds a land resolves without error', () => {
    const g = game({
      p1: {
        hand: ['reflective-rimekin', 'unexpected-results'],
        battlefield: [...n('forest', 5), ...n('island', 5)],
        library: n('forest', 8),
      },
    });
    cast(g, 'reflective-rimekin');
    settle(g);
    cast(g, 'unexpected-results');
    settle(g);
    pick(g, /Put it onto the battlefield/); // the copy
    settle(g);
    pick(g, /Put it onto the battlefield/); // the original
    expect(g.decision.kind).toBe('priority');
    expect(inZone(g, 'p1', 'hand', 'unexpected-results')).toHaveLength(1);
  });

  it('Urban Evolution draws three cards and allows an additional land', () => {
    const g = game({
      p1: {
        hand: ['urban-evolution', 'forest', 'island'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
      },
    });
    cast(g, 'urban-evolution');
    settle(g);
    expect(handSize(g, 'p1')).toBe(2 + 3);
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);
  });
});
