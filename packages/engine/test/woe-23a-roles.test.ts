import { describe, expect, it } from 'vitest';
import { getCharacteristics, getColors } from '../src/index.ts';
import {
  castAt,
  DB,
  Game,
  getPower,
  getToughness,
  onField,
  ROLES,
  scenario,
  settle,
  toAttackers,
} from './woe-fixtures.ts';

// Wilds of Eldraine (23a): Role tokens and rule 303.7 (a player keeps one Role on a creature).

describe('Role tokens', () => {
  it('a Monster Role enters attached: a colorless Aura Role token, +1/+1 and trample', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-guard-change'], battlefield: ['forest', 'bear'] } }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-guard-change', [bear]);
    settle(g);
    const [role] = onField(g, ROLES.monster);
    expect(role).toBeDefined();
    const r = g.obj(role!);
    expect(r.attachedTo).toBe(bear);
    expect(r.isToken).toBe(true);
    expect(r.controller).toBe('p1');
    expect([...getColors(g.state, DB, role!)]).toEqual([]);
    expect(getCharacteristics(g.state, DB, role!).types).toEqual(['Enchantment']);
    expect(getPower(g, bear)).toBe(3);
    expect(getToughness(g, bear)).toBe(3);
    expect(getCharacteristics(g.state, DB, bear).keywords.has('trample')).toBe(true);
  });

  it('a second Role from the same player puts the first into the graveyard (rule 303.7)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-betroth-royal', 'w-guard-change'],
          battlefield: ['plains', 'forest', 'bear'],
        },
      }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-betroth-royal', [bear]);
    settle(g);
    expect(onField(g, ROLES.royal)).toHaveLength(1);
    expect(getCharacteristics(g.state, DB, bear).keywords.has('wardOne')).toBe(true);
    castAt(g, 'p1', 'w-guard-change', [bear]);
    settle(g);
    // The Royal Role is gone (a token in the graveyard ceases to exist); the Monster Role stays.
    expect(onField(g, ROLES.royal)).toHaveLength(0);
    expect(onField(g, ROLES.monster)).toHaveLength(1);
    expect(getPower(g, bear)).toBe(3);
    expect(getCharacteristics(g.state, DB, bear).keywords.has('wardOne')).toBe(false);
    expect(getCharacteristics(g.state, DB, bear).keywords.has('trample')).toBe(true);
  });

  it("a Cursed Role on an opponent's creature and the owner's own Monster Role both stay", () => {
    const g = new Game(
      scenario({
        active: 'p2',
        p1: { battlefield: ['ogre'] },
        p2: { hand: ['w-curse'], battlefield: ['swamp'] },
      }),
    );
    const ogre = g.id('p1', 'ogre');
    castAt(g, 'p2', 'w-curse', [ogre]);
    settle(g);
    const [cursed] = onField(g, ROLES.cursed);
    expect(g.obj(cursed!).controller).toBe('p2');
    expect(getPower(g, ogre)).toBe(1);
    expect(getToughness(g, ogre)).toBe(1);
    // p1's Guard Change (an instant) on their own creature, cast in p2's turn.
    const h = new Game(
      scenario({
        active: 'p2',
        p1: { hand: ['w-guard-change'], battlefield: ['forest', 'ogre'] },
        p2: { hand: ['w-curse'], battlefield: ['swamp'] },
      }),
    );
    const ogre2 = h.id('p1', 'ogre');
    castAt(h, 'p2', 'w-curse', [ogre2]);
    settle(h);
    h.pass(); // p2 passes in their main phase with an empty stack: p1 gets priority
    castAt(h, 'p1', 'w-guard-change', [ogre2]);
    settle(h);
    expect(onField(h, ROLES.cursed)).toHaveLength(1);
    expect(onField(h, ROLES.monster)).toHaveLength(1);
    // Base 1/1 (Cursed), then +1/+1 (Monster): 2/2 with trample.
    expect(getPower(h, ogre2)).toBe(2);
    expect(getToughness(h, ogre2)).toBe(2);
    expect(getCharacteristics(h.state, DB, ogre2).keywords.has('trample')).toBe(true);
  });

  it('Cursed sets the base: counters and pumps still apply on top', () => {
    const g = new Game(scenario({ p1: { hand: ['w-curse'], battlefield: ['swamp', 'ogre'] } }));
    const ogre = g.id('p1', 'ogre');
    g.obj(ogre).plusOneCounters = 1;
    castAt(g, 'p1', 'w-curse', [ogre]);
    settle(g);
    expect(getPower(g, ogre)).toBe(2);
    expect(getToughness(g, ogre)).toBe(2);
  });

  it('Asinine Antics: a Cursed Role on each creature the opponents control, none on yours', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-antics'], battlefield: ['island', 'bear'] },
        p2: { battlefield: ['ogre', 'wurm'] },
      }),
    );
    castAt(g, 'p1', 'w-antics');
    settle(g);
    const roles = onField(g, ROLES.cursed);
    expect(roles).toHaveLength(2);
    expect(roles.map((r) => g.obj(r).attachedTo).sort()).toEqual(
      [g.id('p2', 'ogre'), g.id('p2', 'wurm')].sort(),
    );
    expect(roles.every((r) => g.obj(r).controller === 'p1')).toBe(true);
    expect(getPower(g, g.id('p2', 'wurm'))).toBe(1);
    expect(getPower(g, g.id('p1', 'bear'))).toBe(2);
  });

  it('Cursed Courtier: its own Cursed Role makes it a 1/1 with lifelink', () => {
    const g = new Game(scenario({ p1: { hand: ['w-courtier'], battlefield: ['plains'] } }));
    castAt(g, 'p1', 'w-courtier');
    settle(g);
    const courtier = g.id('p1', 'w-courtier');
    expect(g.obj(onField(g, ROLES.cursed)[0]!).attachedTo).toBe(courtier);
    expect(getPower(g, courtier)).toBe(1);
    expect(getToughness(g, courtier)).toBe(1);
    expect(getCharacteristics(g.state, DB, courtier).keywords.has('lifelink')).toBe(true);
  });

  it('no Role is made for a creature that left the battlefield', () => {
    const g = new Game(scenario({ p1: { hand: ['w-courtier'], battlefield: ['plains'] } }));
    castAt(g, 'p1', 'w-courtier');
    g.passBoth(); // the creature resolves; its enters trigger waits on the stack
    const courtier = g.id('p1', 'w-courtier');
    expect(g.state.stack).toHaveLength(1);
    // It leaves before the trigger resolves.
    g.state.battlefield = g.state.battlefield.filter((id) => id !== courtier);
    g.obj(courtier).zone = 'graveyard';
    g.state.players.p1.graveyard.push(courtier);
    settle(g);
    expect(onField(g, ROLES.cursed)).toHaveLength(0);
  });

  it('Sorcerer: the creature has "whenever this creature attacks, scry 1" (its controller scries)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-sorcerer-role'],
          battlefield: ['island', 'bear'],
          library: ['forest', 'mountain'],
        },
      }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-sorcerer-role', [bear]);
    settle(g);
    expect(getPower(g, bear)).toBe(3);
    toAttackers(g);
    g.attack(bear);
    expect(g.state.stack.some((x) => x.kind === 'ability' && x.controller === 'p1')).toBe(true);
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
  });

  it('Young Hero: an attacking creature with toughness 3 or less gets a +1/+1 counter', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-young-hero-role'], battlefield: ['mountain', 'bear'] } }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-young-hero-role', [bear]);
    settle(g);
    // Young Hero gives no +1/+1 of its own.
    expect(getPower(g, bear)).toBe(2);
    toAttackers(g);
    g.attack(bear);
    settle(g);
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });

  it('Young Hero: no counter for a creature with toughness 4 or more (the "if" is checked)', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-young-hero-role'], battlefield: ['mountain', 'wall'] } }),
    );
    const wall = g.id('p1', 'wall');
    // The wall (0/4) can attack in this fixture.
    castAt(g, 'p1', 'w-young-hero-role', [wall]);
    settle(g);
    toAttackers(g);
    g.attack(wall);
    settle(g);
    expect(g.obj(wall).plusOneCounters).toBe(0);
    expect(g.state.stack).toHaveLength(0);
  });

  it('Virtuous: +1/+1 for each enchantment you control (the Role itself is one)', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-virtuous-role'], battlefield: ['plains', 'bear', 'w-charm'] } }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-virtuous-role', [bear]);
    settle(g);
    expect(getPower(g, bear)).toBe(4);
    expect(getToughness(g, bear)).toBe(4);
  });

  it('Wicked: when it goes to the graveyard (replaced by another Role), each opponent loses 1 life', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-wicked-role', 'w-guard-change'], battlefield: ['swamp', 'forest', 'bear'] },
      }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-wicked-role', [bear]);
    settle(g);
    expect(getPower(g, bear)).toBe(3);
    castAt(g, 'p1', 'w-guard-change', [bear]);
    settle(g);
    expect(onField(g, ROLES.wicked)).toHaveLength(0);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(20);
  });

  it('a Role going to the graveyard is an enchantment you control put into a graveyard (Wicked Visitor)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-wicked-role', 'w-guard-change'],
          battlefield: ['swamp', 'forest', 'bear', 'w-visitor'],
        },
      }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-wicked-role', [bear]);
    settle(g);
    castAt(g, 'p1', 'w-guard-change', [bear]);
    settle(g);
    // Wicked Role's own trigger and Wicked Visitor's.
    expect(g.life('p2')).toBe(18);
  });

  it('a Role entering is an Aura you control entering (Tanglespan Lookout draws)', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-guard-change'], battlefield: ['forest', 'bear', 'w-lookout'] } }),
    );
    const hand = g.state.players.p1.hand.length;
    castAt(g, 'p1', 'w-guard-change', [g.id('p1', 'bear')]);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand); // the instant left, one card drawn
  });

  it('Return Triumphant: the Role goes on the card that was returned ("attached to it")', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-return-triumphant'], battlefield: ['plains'], graveyard: ['bear'] },
      }),
    );
    const card = g.id('p1', 'bear', 'graveyard');
    castAt(g, 'p1', 'w-return-triumphant', [card]);
    settle(g);
    const bear = g.id('p1', 'bear');
    expect(g.obj(onField(g, ROLES.youngHero)[0]!).attachedTo).toBe(bear);
  });

  it('enchanted creatures you control get +2/+2 (a Role makes a creature enchanted)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-guard-change'], battlefield: ['forest', 'bear', 'ogre', 'w-tale'] },
      }),
    );
    const bear = g.id('p1', 'bear');
    castAt(g, 'p1', 'w-guard-change', [bear]);
    settle(g);
    expect(getPower(g, bear)).toBe(5);
    expect(getPower(g, g.id('p1', 'ogre'))).toBe(3);
  });
});
