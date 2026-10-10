import { describe, expect, it } from 'vitest';
import type { Action } from '../src/types.ts';
import { casts, Game, getPower, scenario } from './tdm-fixtures.ts';

describe('Omen', () => {
  const setup = () =>
    new Game(
      scenario({
        p1: {
          hand: ['t-dawnbreaker'],
          battlefield: ['plains', 'plains', 'plains', 'plains', 'plains'],
        },
        p2: {},
      }),
    );

  it('the Omen side is its own cast action from hand, next to the creature', () => {
    const g = setup();
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    const all = casts(g, 'p1', card);
    expect(all.some((a) => a.back)).toBe(true);
    expect(all.some((a) => !a.back)).toBe(true);
  });

  it('resolving the Omen shuffles the card into its owner library (not the graveyard, not exile)', () => {
    const g = setup();
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    const libraryBefore = g.state.players.p1.library.length;
    g.do(casts(g, 'p1', card).find((a) => a.back)!);
    expect(g.zoneOf(card)).toBe('stack');
    g.passBoth();
    expect(g.life('p1')).toBe(24);
    expect(g.zoneOf(card)).toBe('library');
    expect(g.state.players.p1.library).toContain(card);
    expect(g.state.players.p1.library.length).toBe(libraryBefore + 1);
    expect(g.state.players.p1.graveyard).not.toContain(card);
    expect(g.state.players.p1.exile).not.toContain(card);
    // It is the creature card again, and can be drawn and cast as a Dragon later.
    expect(g.obj(card).defId).toBe('t-dawnbreaker');
    expect(g.events.some((e) => e.type === 'shuffled' && e.player === 'p1')).toBe(true);
  });

  it('casting the creature side puts the creature on the battlefield as usual', () => {
    const g = setup();
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    g.do(casts(g, 'p1', card).find((a) => !a.back)!);
    g.passBoth();
    expect(g.zoneOf(card)).toBe('battlefield');
  });

  it('an Omen that is countered goes to the graveyard instead', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-dawnbreaker'], battlefield: ['plains', 'plains'] },
        p2: { hand: ['t-counterspell'], battlefield: ['island', 'island'] },
      }),
    );
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    g.do(casts(g, 'p1', card).find((a) => a.back)!);
    g.pass();
    const spellId = g.state.stack[0]!.id;
    g.do(
      g
        .legal('p2')
        .find(
          (a): a is Extract<Action, { type: 'castSpell' }> =>
            a.type === 'castSpell' &&
            a.card === g.id('p2', 't-counterspell', 'hand') &&
            a.targets.some((t) => 'object' in t && t.object.id === spellId),
        )!,
    );
    g.passBoth();
    g.passBoth();
    expect(g.life('p1')).toBe(20);
    expect(g.zoneOf(card)).toBe('graveyard');
    expect(g.state.players.p1.library).not.toContain(card);
  });

  it('an Omen cast from hand does not go on an adventure either', () => {
    const g = setup();
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    g.do(casts(g, 'p1', card).find((a) => a.back)!);
    g.passBoth();
    expect(g.state.objects[card]!.onAdventure).toBeFalsy();
  });
});

describe('Flurry', () => {
  const cast = (g: Game, id: string) =>
    g.do(
      casts(g, 'p1', g.id('p1', id, 'hand')).find((a) =>
        a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!,
    );
  const shockAt = (g: Game, target: 'p2' | 'p1' = 'p2') => {
    const shock = g.id('p1', 'shock', 'hand');
    g.do(
      casts(g, 'p1', shock).find((a) =>
        a.targets.some((t) => 'player' in t && t.player === target),
      )!,
    );
    while (g.state.stack.length) g.passBoth();
  };

  it('triggers on the second spell cast each turn, only', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['shock', 'shock', 'shock'],
          battlefield: ['t-duelist', 'mountain', 'mountain', 'mountain'],
        },
        p2: {},
      }),
    );
    shockAt(g); // 1st spell: no flurry. 2 damage.
    expect(g.life('p2')).toBe(18);
    shockAt(g); // 2nd spell: 2 damage + flurry 1.
    expect(g.life('p2')).toBe(15);
    shockAt(g); // 3rd: no flurry.
    expect(g.life('p2')).toBe(13);
  });

  it('the count starts over each turn, and your opponent casting spells does not count', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock', 'shock'], battlefield: ['t-duelist', 'mountain', 'mountain'] },
        p2: { hand: ['shock', 'shock'], battlefield: ['mountain', 'mountain'] },
      }),
    );
    shockAt(g); // our first spell this turn
    // The opponent casts two spells in response... on our turn: they are not "your second spell".
    g.pass();
    for (let i = 0; i < 2; i++) {
      const s = g.id('p2', 'shock', 'hand');
      g.do(
        g
          .legal('p2')
          .find(
            (a): a is Extract<Action, { type: 'castSpell' }> =>
              a.type === 'castSpell' &&
              a.card === s &&
              a.targets.some((t) => 'player' in t && t.player === 'p1'),
          )!,
      );
    }
    expect(g.state.stack.length).toBe(2);
    // None of that was flurry (the duelist's controller has cast one spell so far).
    while (g.state.stack.length) g.passBoth();
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(16);
  });

  it('the trigger goes on the stack above the second spell', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock', 'shock'], battlefield: ['t-duelist', 'mountain', 'mountain'] },
        p2: {},
      }),
    );
    cast(g, 'shock');
    g.passBoth();
    cast(g, 'shock');
    // The flurry trigger is on the stack above the second spell.
    expect(g.state.stack.length).toBe(2);
    expect(g.state.stack[g.state.stack.length - 1]!.kind).toBe('ability');
  });
});

describe('Renew', () => {
  const setup = (extra: Parameters<typeof scenario>[0] = {}) =>
    new Game(
      scenario({
        p1: {
          graveyard: ['t-renewer'],
          battlefield: ['forest', 'forest', 'ogre'],
          ...(extra.p1 ?? {}),
        },
        p2: {},
        ...(extra.step ? { step: extra.step } : {}),
      }),
    );

  it('is activated from the graveyard: exile the card as a cost, then put counters on the target', () => {
    const g = setup();
    const renewer = g.id('p1', 't-renewer', 'graveyard');
    const ogre = g.id('p1', 'ogre');
    const a = g
      .legal('p1')
      .find(
        (x) =>
          x.type === 'activateAbility' &&
          x.source === renewer &&
          x.targets.some((t) => 'object' in t && t.object.id === ogre),
      )!;
    expect(a).toBeDefined();
    g.do(a);
    // The card was exiled as a cost.
    expect(g.zoneOf(renewer)).toBe('exile');
    g.passBoth();
    expect(g.obj(ogre).plusOneCounters).toBe(1);
    expect(g.obj(ogre).counters?.trample).toBe(1);
    expect(getPower(g, ogre)).toBe(4);
  });

  it('can only be activated as a sorcery', () => {
    const g = setup({ step: 'beginCombat' });
    const renewer = g.id('p1', 't-renewer', 'graveyard');
    expect(g.legal('p1').some((x) => x.type === 'activateAbility' && x.source === renewer)).toBe(
      false,
    );
  });

  it('cannot be activated without the mana', () => {
    const g = setup({ p1: { graveyard: ['t-renewer'], battlefield: ['forest', 'ogre'] } });
    const renewer = g.id('p1', 't-renewer', 'graveyard');
    expect(g.legal('p1').some((x) => x.type === 'activateAbility' && x.source === renewer)).toBe(
      false,
    );
  });
});

describe('cards leaving your graveyard (the Renew cost exiles the card)', () => {
  it('"whenever a card leaves your graveyard during your turn" fires for the Renew cost, once each turn', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['t-renewer', 't-renewer'],
          battlefield: ['t-skimmer', 'forest', 'forest', 'forest', 'forest', 'ogre'],
        },
        p2: {},
      }),
    );
    const hand = () => g.state.players.p1.hand.length;
    const activate = () => {
      const renewer = g.state.players.p1.graveyard.find(
        (id) => g.state.objects[id]!.defId === 't-renewer',
      )!;
      g.do(g.legal('p1').find((x) => x.type === 'activateAbility' && x.source === renewer)!);
      while (g.state.stack.length) g.passBoth();
    };
    expect(hand()).toBe(0);
    activate();
    expect(hand()).toBe(1);
    activate();
    expect(hand()).toBe(1);
  });
});
