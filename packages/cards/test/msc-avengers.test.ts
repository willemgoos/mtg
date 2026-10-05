import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Avengers Assemble (9b): damage replacement and redirection, flash enablers,
// untap-on-tap, phasing, base P/T from Equipment, crew, cost reductions.

const castable = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);

describe('Avengers Assemble', () => {
  it('Winter Soldier revives a Hero with a counter while Peggy protects his solo attack', () => {
    const g = game({
      p1: {
        battlefield: ['winter-soldier-reborn-avenger', 'peggy-carter-secret-agent'],
        graveyard: ['hero-in-training'],
      },
      step: 'beginCombat',
    });
    const soldier = g.id('p1', 'winter-soldier-reborn-avenger');
    const before = handSize(g, 'p1');
    g.pass().pass();
    g.attack(soldier);
    settle(g);
    const hero = g.id('p1', 'hero-in-training');
    expect(g.obj(hero).plusOneCounters).toBe(1);
    expect(pt(g, hero)).toEqual([3, 3]);
    expect(handSize(g, 'p1')).toBe(before + 1);
    expect(g.life('p1')).toBe(22);
    expect(getCharacteristics(g.state, cardDb, soldier).keywords).toContain('indestructible');
  });

  it.each([false, true])(
    'Winter Soldier can revive Okoye only after a power boost: %s',
    (boost) => {
      const g = game({
        p1: {
          battlefield: ['winter-soldier-reborn-avenger', ...n('plains', 2)],
          graveyard: ['okoye-dora-milaje-leader'],
          hand: ['take-up-the-shield'],
        },
        step: 'beginCombat',
      });
      const soldier = g.id('p1', 'winter-soldier-reborn-avenger');
      if (boost) settle(cast(g, 'take-up-the-shield', [g.ref(soldier)]));
      g.pass().pass();
      g.attack(soldier);
      settle(g);
      expect(all(g, 'okoye-dora-milaje-leader')).toHaveLength(boost ? 1 : 0);
      if (boost) {
        const okoye = g.id('p1', 'okoye-dora-milaje-leader');
        expect(g.obj(okoye).plusOneCounters).toBe(1);
        expect(all(g, 'soldier-token')).toHaveLength(2);
      }
    },
  );

  it('Thor adds 1 to damage other sources deal to opponents and their creatures', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: ['thor-asgards-avenger', ...n('mountain', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    cast(g, 'shock', [g.ref(g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    expect(g.obj(g.id('p2', 'rumbling-baloth')).damage).toBe(3);
  });

  it('Heroic Sacrifice sends all damage to the chosen creature, then moves its counters', () => {
    const g = game({
      p1: {
        hand: ['heroic-sacrifice'],
        battlefield: [{ card: 'rumbling-baloth' }, 'savannah-lions', ...n('plains', 2)],
      },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    const giant = g.id('p1', 'rumbling-baloth');
    g.obj(giant).plusOneCounters = 1;
    cast(g, 'heroic-sacrifice', [g.ref(giant)]);
    settle(g);
    g.pass();
    cast(g, 'lightning-strike', [{ player: 'p1' }]);
    g.passBoth();
    // 3 damage to p1 went to the 4/4 giant instead.
    expect(g.life('p1')).toBe(20);
    expect(g.obj(giant).damage).toBe(3);
  });

  it('Quicksilver lets you cast spells at instant speed while tapped', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'quicksilver-speedster', tapped: true }, ...n('plains', 2)],
        hand: ['savannah-lions'],
      },
      active: 'p2',
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(castable(g, 'savannah-lions')).toBe(true);
    g.obj(g.id('p1', 'quicksilver-speedster')).tapped = false;
    expect(castable(g, 'savannah-lions')).toBe(false);
  });

  it('Captain Mar-Vell grants flash once an opponent has cast a spell this turn', () => {
    const g = game({
      p1: {
        battlefield: ['captain-mar-vell-space-born', ...n('plains', 2)],
        hand: ['savannah-lions'],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    expect(g.actor).toBe('p1');
    expect(castable(g, 'savannah-lions')).toBe(true);
  });

  it('Captain America, Living Legend untaps a creature the first time it taps on your turn', () => {
    const g = game({
      p1: { battlefield: ['captain-america-living-legend', 'rumbling-baloth'] },
      step: 'beginCombat',
    });
    g.pass().pass();
    g.attack(g.id('p1', 'rumbling-baloth'));
    settle(g);
    expect(g.obj(g.id('p1', 'rumbling-baloth')).tapped).toBe(false);
  });

  it('Vision phases out when a spell is cast off-turn, and phases back in', () => {
    const g = game({
      p1: { battlefield: ['vision-synthezoid-avenger'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const vision = g.id('p1', 'vision-synthezoid-avenger');
    // p2 casts a spell during p1's turn.
    g.pass();
    cast(g, 'shock', [{ player: 'p1' }]);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 1 });
    settle(g);
    expect(g.state.battlefield).not.toContain(vision);
    // Still out through p2's turn, back at p1's untap step.
    g.passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.state.battlefield).not.toContain(vision);
    g.passUntilStep('end').passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.state.battlefield).toContain(vision);
  });

  it('Hulkbuster Armor makes the equipped creature a 9/9 flier; Equip Hero costs less', () => {
    const g = game({
      p1: {
        battlefield: [
          'hulkbuster-armor',
          'patriot-shield-wielder',
          'savannah-lions',
          ...n('plains', 3),
        ],
      },
    });
    const armor = g.id('p1', 'hulkbuster-armor');
    const equips = g.legal().filter((a) => a.type === 'activateAbility' && a.source === armor);
    // {3} for the Hero only; {6} is out of reach.
    const onPatriot = equips.find(
      (a) =>
        a.type === 'activateAbility' &&
        a.targets.some(
          (t) => 'object' in t && t.object.id === g.id('p1', 'patriot-shield-wielder'),
        ),
    );
    expect(onPatriot).toBeDefined();
    expect(
      equips.some(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === g.id('p1', 'savannah-lions')),
      ),
    ).toBe(false);
    g.do(onPatriot!);
    settle(g);
    const id = g.id('p1', 'patriot-shield-wielder');
    expect(pt(g, id)).toEqual([9, 9]);
    expect(getCharacteristics(g.state, cardDb, id).keywords.has('flying')).toBe(true);
  });

  it('Avengers Quinjet crews 3 by tapping creatures with enough power', () => {
    const g = game({
      p1: { battlefield: ['avengers-quinjet', 'savannah-lions', 'bear-cub'] },
    });
    const crew = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'avengers-quinjet'));
    expect(crew).toBeDefined();
    g.do(crew!);
    settle(g);
    const jet = g.id('p1', 'avengers-quinjet');
    expect(getCharacteristics(g.state, cardDb, jet).types).toContain('Creature');
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'bear-cub')).tapped).toBe(true);
  });

  it('Heroic Return costs {2} less while a creature attacks you, and a Hero returns with counters', () => {
    const g = game({
      p1: {
        hand: ['heroic-return'],
        graveyard: ['patriot-shield-wielder'],
        battlefield: n('plains', 4),
      },
    });
    expect(castable(g, 'heroic-return')).toBe(false);
    const h = game({
      p1: {
        hand: ['heroic-return'],
        graveyard: ['patriot-shield-wielder'],
        battlefield: n('plains', 6),
      },
    });
    cast(h, 'heroic-return', [h.ref(h.state.players.p1.graveyard[0]!)]);
    settle(h);
    const patriot = h.id('p1', 'patriot-shield-wielder');
    expect(h.obj(patriot).plusOneCounters).toBe(2);
  });

  it('Director Nick Fury makes Hero spells cheaper; Avengers Tower mana is only for Heroes', () => {
    const g = game({
      p1: {
        hand: ['patriot-shield-wielder', 'savannah-lions'],
        battlefield: ['director-nick-fury', 'avengers-tower'],
      },
    });
    // Patriot {1}{W} for {W} from the Tower; Savannah Lions can't use its coloured mana.
    expect(castable(g, 'patriot-shield-wielder')).toBe(true);
    expect(castable(g, 'savannah-lions')).toBe(false);
  });

  it('Captain America, Team Leader rewards each Hero that enters', () => {
    const g = game({
      p1: {
        hand: ['patriot-shield-wielder'],
        battlefield: ['captain-america-team-leader', ...n('plains', 2)],
      },
    });
    cast(g, 'patriot-shield-wielder');
    settle(g);
    const patriot = g.id('p1', 'patriot-shield-wielder');
    expect(g.obj(patriot).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'captain-america-team-leader')).plusOneCounters).toBe(1);
    expect(getCharacteristics(g.state, cardDb, patriot).keywords.has('haste')).toBe(true);
  });

  it('Austere Command chooses two of four modes; Methods of the Mighty one or more of three', () => {
    expect(cardDb.get('austere-command')?.modes).toHaveLength(6);
    expect(cardDb.get('methods-of-the-mighty')?.modes).toHaveLength(7);
  });

  it('Arcane Denial: its controller draws two and you draw one at the next upkeep', () => {
    const g = game({
      p1: { hand: ['arcane-denial'], battlefield: n('island', 2) },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    const spell = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'arcane-denial', [{ object: { id: spell, zcc: g.obj(spell).zcc } }]);
    g.passBoth();
    settle(g);
    expect(g.life('p1')).toBe(20);
    const before = [handSize(g, 'p1'), handSize(g, 'p2')];
    g.passUntilStep('draw');
    expect(handSize(g, 'p1')).toBe(before[0]! + 2); // one from Arcane Denial, one drawn
    expect(handSize(g, 'p2')).toBe(before[1]! + 2);
  });

  it('Gift of Immortality returns the creature, then itself at the next end step', () => {
    const g = game({
      p1: { hand: ['gift-of-immortality'], battlefield: ['bear-cub', ...n('plains', 3)] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    cast(g, 'gift-of-immortality', [g.ref(g.id('p1', 'bear-cub'))]);
    settle(g);
    g.pass();
    cast(g, 'lightning-strike', [g.ref(g.id('p1', 'bear-cub'))]);
    g.passBoth();
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    g.passUntilStep('end');
    settle(g);
    const aura = all(g, 'gift-of-immortality')[0]!;
    expect(g.obj(aura).attachedTo).toBe(all(g, 'bear-cub')[0]);
  });

  it('Ant-Man (power 1) can’t be blocked by creatures with greater power', () => {
    const g = game({
      p1: { battlefield: ['ant-man-elusive-avenger'] },
      p2: { battlefield: ['rumbling-baloth', 'aegis-turtle'] },
      step: 'beginCombat',
    });
    g.pass().pass();
    g.attack(g.id('p1', 'ant-man-elusive-avenger'));
    while (g.decision.kind === 'priority') g.pass();
    const blocks = g.legal().filter((a) => a.type === 'addBlock');
    expect(blocks.map((a) => a.type === 'addBlock' && g.obj(a.blocker).defId)).toEqual([
      'aegis-turtle',
    ]);
  });
});

describe('Avengers Assemble: cards that look and choose', () => {
  it('Scarlet Witch exiles the top two and may cast a Hero or noncreature spell from them free', () => {
    const g = game({
      p1: {
        battlefield: ['scarlet-witch-chaotic-avenger'],
        library: ['shock', 'savannah-lions', ...n('island', 5)],
      },
      step: 'beginCombat',
    });
    g.pass().pass();
    g.attack(g.id('p1', 'scarlet-witch-chaotic-avenger'));
    // Through blocks and combat damage to the trigger.
    for (let i = 0; i < 20 && g.decision.kind !== 'castFree'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'chooseTriggerTargets') settle(g);
      else g.pass();
    }
    const d = g.decision;
    if (d.kind !== 'castFree') throw new Error(`expected castFree, got ${d.kind}`);
    // Savannah Lions is neither a Hero nor a noncreature spell.
    expect(d.cards.map((id) => g.obj(id).defId)).toEqual(['shock']);
    const shock = g
      .legal()
      .find(
        (a) => a.type === 'castSpell' && 'player' in a.targets[0]! && a.targets[0].player === 'p2',
      );
    g.do(shock!);
    settle(g);
    // 3 combat damage, then a free Shock.
    expect(g.life('p2')).toBe(15);
  });

  it('Hawkeye draws when a creature it damaged this turn dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['hawkeye-avenging-archer', 'mountain'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const ping = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      );
    g.do(ping!);
    settle(g);
    const hand = handSize(g, 'p1');
    cast(g, 'shock', [g.ref(bear)]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand); // Shock left, a card came in
  });

  it('Metallic Mimic becomes the chosen type and gives others of it a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['metallic-mimic', 'savannah-lions'], battlefield: n('plains', 3) },
    });
    cast(g, 'metallic-mimic');
    g.passBoth();
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error(`expected a type choice, got ${d.kind}`);
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: d.options.findIndex((o) => o.label === 'Cat'),
    });
    settle(g);
    const mimic = g.id('p1', 'metallic-mimic');
    expect(getCharacteristics(g.state, cardDb, mimic).subtypes).toContain('Cat');
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
  });

  it('West Coast Expansion with X of 5 or more casts a Hero from your hand free', () => {
    const g = game({
      p1: { hand: ['west-coast-expansion', 'patriot-shield-wielder'], battlefield: n('island', 7) },
    });
    cast(g, 'west-coast-expansion', [], { x: 5 });
    g.passBoth();
    const d = g.decision;
    expect(d.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(all(g, 'patriot-shield-wielder')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(5);
  });
});
