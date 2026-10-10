import { describe, expect, it } from 'vitest';
import { getAbilities, getCharacteristics } from '../src/index.ts';
import type { Action } from '../src/types.ts';
import { casts, DB, Game, getPower, scenario } from './tdm-fixtures.ts';

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

describe('the Sieges: "as this enters, choose X or Y"', () => {
  const setup = () =>
    new Game(
      scenario({
        p1: { hand: ['t-siege'], battlefield: ['plains', 'plains', 'ogre'] },
        p2: {},
      }),
    );

  it('asks for the choice and the permanent has the abilities of that choice', () => {
    const g = setup();
    g.do(casts(g, 'p1', g.id('p1', 't-siege', 'hand'))[0]!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.options.map((o) => o.label)).toEqual(['Abzan', 'Mardu']);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const siege = g.id('p1', 't-siege--abzan');
    expect(g.obj(siege)).toBeDefined();
    // Abzan: creatures get +1/+1.
    expect(getPower(g, g.id('p1', 'ogre'))).toBe(4);
    expect(getAbilities(g.state, DB, siege).some((a) => a.kind === 'static')).toBe(true);
  });

  it('the other choice has its own abilities', () => {
    const g = setup();
    g.do(casts(g, 'p1', g.id('p1', 't-siege', 'hand'))[0]!);
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    const ogre = g.id('p1', 'ogre');
    expect(getPower(g, ogre)).toBe(4);
    expect(getCharacteristics(g.state, DB, ogre).toughness).toBe(3);
    expect(getCharacteristics(g.state, DB, ogre).keywords.has('haste')).toBe(true);
  });

  it('shows its own face again after it leaves the battlefield (no choice carried over)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-siege', 't-smite'], battlefield: ['plains', 'plains', 'plains'] },
        p2: {},
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 't-siege', 'hand'))[0]!);
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const id = g.id('p1', 't-siege--abzan');
    g.do(
      casts(g, 'p1', g.id('p1', 't-smite', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === id),
      )!,
    );
    settle(g);
    expect(g.zoneOf(id)).toBe('graveyard');
    expect(g.obj(id).defId).toBe('t-siege');
    expect(g.obj(id).front).toBeUndefined();
  });
});

describe('Omen spells in the stack and the library', () => {
  it('the card has its creature face in the library afterwards (castable as a Dragon when drawn)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-dawnbreaker'], battlefield: ['plains', 'plains'] },
        p2: {},
      }),
    );
    const card = g.id('p1', 't-dawnbreaker', 'hand');
    g.do(casts(g, 'p1', card).find((a) => a.back)!);
    settle(g);
    expect(g.obj(card).defId).toBe('t-dawnbreaker');
    expect(g.obj(card).front).toBeUndefined();
  });
});

describe('protection from white and from black (Ureni, the Song Unending)', () => {
  it("can't be targeted by white or black spells, but can by red ones", () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['t-ureni'] },
        p2: {
          hand: ['t-white-zap', 't-black-zap', 'shock'],
          battlefield: ['plains', 'swamp', 'mountain'],
        },
        active: 'p2',
      }),
    );
    const ureni = g.id('p1', 't-ureni');
    const at = (card: string) =>
      g
        .legal('p2')
        .filter(
          (a) =>
            a.type === 'castSpell' &&
            a.card === g.id('p2', card, 'hand') &&
            a.targets.some((t) => 'object' in t && t.object.id === ureni),
        );
    expect(at('t-white-zap')).toHaveLength(0);
    expect(at('t-black-zap')).toHaveLength(0);
    expect(at('shock')).toHaveLength(1);
  });

  it("white and black creatures can't block it", () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['t-ureni'] },
        p2: { battlefield: ['t-dawnbreaker', 'ogre'] },
      }),
    );
    g.passBoth();
    g.attack(g.id('p1', 't-ureni'));
    const blocks = g
      .legal('p2')
      .filter((a) => a.type === 'addBlock')
      .map((a) => (a.type === 'addBlock' ? g.obj(a.blocker).defId : ''));
    // The Dragon is white (can't block it); a colourless ogre has no protection issue (but no flying/reach either).
    expect(blocks).not.toContain('t-dawnbreaker');
  });
});

type Cast = Extract<Action, { type: 'castSpell' }>;
const castCard = (g: Game, defId: string, to?: 'p1' | 'p2') => {
  const card = g.id('p1', defId, 'hand');
  const a = casts(g, 'p1', card).find(
    (x: Cast) => to === undefined || x.targets.some((t) => 'player' in t && t.player === to),
  )!;
  g.do(a);
  return a;
};

describe('how many spells you have cast this turn', () => {
  it('costReductionIf: "costs {2} less if you\'ve cast another spell this turn" (Focus the Mind)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-focus', 'shock'], battlefield: ['island', 'island', 'island', 'mountain'] },
        p2: {},
      }),
    );
    // {4}{U} with four lands: not castable; after another spell it costs {2}{U}.
    expect(casts(g, 'p1', g.id('p1', 't-focus', 'hand'))).toHaveLength(0);
    castCard(g, 'shock', 'p2');
    settle(g);
    expect(casts(g, 'p1', g.id('p1', 't-focus', 'hand')).length).toBeGreaterThan(0);
  });

  it('"the second spell you cast each turn costs {1} less" (min 1, max 1: exactly one cast before)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['t-two-mana', 't-two-mana', 't-two-mana'],
          battlefield: ['t-bell-ringer', 'island', 'island', 'island', 'island', 'island'],
        },
        p2: {},
      }),
    );
    const paid = (): number =>
      g.state.battlefield.filter((id) => g.state.objects[id]!.tapped).length;
    castCard(g, 't-two-mana'); // 2 mana
    expect(paid()).toBe(2);
    castCard(g, 't-two-mana'); // the second spell: 1 mana
    expect(paid()).toBe(3);
    castCard(g, 't-two-mana'); // the third: 2 mana
    expect(paid()).toBe(5);
  });

  it('entersWithCountersAmount from "if you\'ve cast two or more spells this turn" (Effortless Master)', () => {
    const one = new Game(scenario({ p1: { hand: ['t-master'], battlefield: ['island'] }, p2: {} }));
    castCard(one, 't-master');
    settle(one);
    expect(one.obj(one.id('p1', 't-master')).plusOneCounters).toBe(0);
    const two = new Game(
      scenario({
        p1: { hand: ['shock', 't-master'], battlefield: ['island', 'mountain'] },
        p2: {},
      }),
    );
    castCard(two, 'shock', 'p2');
    settle(two);
    castCard(two, 't-master');
    settle(two);
    expect(two.obj(two.id('p1', 't-master')).plusOneCounters).toBe(2);
  });

  it('{ count: "spellsCastThisTurn" } as an amount (Narset), with a type filter for "both a creature and a noncreature spell"', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['shock', 't-count-draw'],
          battlefield: ['island', 'island', 'mountain'],
          library: Array<string>(10).fill('island'),
        },
        p2: {},
      }),
    );
    castCard(g, 'shock', 'p2');
    settle(g);
    castCard(g, 't-count-draw');
    settle(g);
    // Two spells cast, the second one counted: two cards drawn (one card left in hand: none; we cast both).
    expect(g.state.players.p1.hand).toHaveLength(2);
    // Creature + two noncreature spells.
    const h = new Game(
      scenario({
        p1: {
          hand: ['t-master', 'shock', 't-both-check'],
          battlefield: ['island', 'island', 'island', 'mountain'],
        },
        p2: {},
      }),
    );
    castCard(h, 't-master');
    settle(h);
    castCard(h, 'shock', 'p2');
    settle(h);
    castCard(h, 't-both-check');
    settle(h);
    expect(h.life('p1')).toBe(25);
  });
});

describe('Flurry that suspends the spell (Taigam, Master Opportunist)', () => {
  it('copies the second spell, then exiles the spell itself with four time counters, suspended', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock', 'shock'], battlefield: ['t-taigam', 'mountain', 'mountain'] },
        p2: {},
      }),
    );
    castCard(g, 'shock', 'p2');
    settle(g);
    expect(g.life('p2')).toBe(18);
    const second = g.id('p1', 'shock', 'hand');
    castCard(g, 'shock', 'p2');
    settle(g);
    // The copy resolved (2 damage); the card was exiled from the stack, not resolved.
    expect(g.life('p2')).toBe(16);
    expect(g.zoneOf(second)).toBe('exile');
    expect(g.obj(second).suspended).toBe(true);
    expect(g.obj(second).counters?.time).toBe(4);
  });
});

describe('"when you cast this spell, if you\'ve cast another spell this turn" (Sage of the Skies)', () => {
  it('copies itself only as the second spell', () => {
    const alone = new Game(
      scenario({ p1: { hand: ['t-sage'], battlefield: ['plains'] }, p2: {} }),
    );
    castCard(alone, 't-sage');
    settle(alone);
    expect(
      alone.state.battlefield.filter((id) => alone.state.objects[id]!.defId === 't-sage'),
    ).toHaveLength(1);
    const second = new Game(
      scenario({ p1: { hand: ['shock', 't-sage'], battlefield: ['plains', 'mountain'] }, p2: {} }),
    );
    castCard(second, 'shock', 'p2');
    settle(second);
    castCard(second, 't-sage');
    settle(second);
    const sages = second.state.battlefield.filter(
      (id) => second.state.objects[id]!.defId === 't-sage',
    );
    expect(sages).toHaveLength(2);
    expect(sages.filter((id) => second.state.objects[id]!.isToken)).toHaveLength(1);
  });
});
