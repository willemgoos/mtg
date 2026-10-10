import { describe, expect, it } from 'vitest';
import type { Action } from '../src/types.ts';
import { casts, Game, scenario } from './tdm-fixtures.ts';

type Cast = Extract<Action, { type: 'castSpell' }>;

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

describe('Harmonize', () => {
  const toP2 = (a: Cast) => a.targets.some((t) => 'player' in t && t.player === 'p2');

  it('is cast from the graveyard for the harmonize cost, then exiled', () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-wild-ride'], battlefield: Array(5).fill('mountain') },
        p2: {},
      }),
    );
    const card = g.id('p1', 't-wild-ride', 'graveyard');
    const plain = casts(g, 'p1', card).find((a) => !a.harmonizeTap && toP2(a))!;
    expect(plain).toBeDefined();
    g.do(plain);
    // All five lands were needed.
    expect(g.state.battlefield.filter((id) => g.state.objects[id]!.tapped)).toHaveLength(5);
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it("can't be cast without the mana when there is no creature to tap", () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-wild-ride'], battlefield: Array(4).fill('mountain') },
        p2: {},
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 't-wild-ride', 'graveyard'))).toHaveLength(0);
  });

  it('tapping an untapped creature reduces the generic cost by its power, and it taps as part of casting', () => {
    // {4}{R} with three lands: an ogre (power 3) brings it to {1}{R}.
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['t-wild-ride'],
          battlefield: ['mountain', 'mountain', 'mountain', 'ogre'],
        },
        p2: {},
      }),
    );
    const card = g.id('p1', 't-wild-ride', 'graveyard');
    const ogre = g.id('p1', 'ogre');
    const all = casts(g, 'p1', card).filter(toP2);
    // Only the version that taps the ogre is affordable.
    expect(all.every((a) => a.harmonizeTap === ogre)).toBe(true);
    expect(all).toHaveLength(1);
    g.do(all[0]!);
    expect(g.obj(ogre).tapped).toBe(true);
    // {1}{R}: two of the three lands tapped.
    expect(
      g.state.battlefield.filter(
        (id) => g.state.objects[id]!.defId === 'mountain' && g.state.objects[id]!.tapped,
      ),
    ).toHaveLength(2);
    settle(g);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it("with mana to spare, tapping the creature is the player's choice (both are offered)", () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-wild-ride'], battlefield: [...Array(5).fill('mountain'), 'ogre'] },
        p2: {},
      }),
    );
    const all = casts(g, 'p1', g.id('p1', 't-wild-ride', 'graveyard')).filter(toP2);
    expect(all.map((a) => !!a.harmonizeTap).sort()).toEqual([false, true]);
  });

  it('the reduction is only of generic mana: a big creature still leaves the coloured pip', () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-wild-ride'], battlefield: ['mountain', 'trampler'] },
        p2: {},
      }),
    );
    const all = casts(g, 'p1', g.id('p1', 't-wild-ride', 'graveyard')).filter(toP2);
    expect(all).toHaveLength(1);
    g.do(all[0]!);
    expect(g.state.objects[g.id('p1', 'mountain')]!.tapped).toBe(true);
  });

  it('a tapped creature, or one with no power, cannot be tapped for it', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['t-wild-ride'],
          battlefield: ['mountain', 'mountain', 'mountain', { card: 'ogre', tapped: true }, 'wall'],
        },
        p2: {},
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 't-wild-ride', 'graveyard'))).toHaveLength(0);
  });

  it('the creature tapped for harmonize is not tapped for mana as well', () => {
    // One land and a 3-power mana creature: {4}{R} - 3 = {1}{R} would need two mana, but the creature is tapped for the cost.
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-wild-ride'], battlefield: ['mountain', 't-elf-mana'] },
        p2: {},
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 't-wild-ride', 'graveyard'))).toHaveLength(0);
  });

  it("X: the cost keeps its {X} when cast from the graveyard (Nature's Rhythm)", () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['t-rhythm'], battlefield: [...Array(4).fill('forest'), 'ogre'] },
        p2: {},
      }),
    );
    const all = casts(g, 'p1', g.id('p1', 't-rhythm', 'graveyard'));
    // {X}{G}{G}{G}{G}: with four Forests X is 0 on its own, and up to 3 when the ogre (power 3) is tapped.
    expect(Math.max(...all.filter((a) => !a.harmonizeTap).map((a) => a.x ?? 0))).toBe(0);
    const tapped = all.filter((a) => a.harmonizeTap);
    expect(Math.max(...tapped.map((a) => a.x ?? 0))).toBe(3);
    g.do(tapped.find((a) => a.x === 3)!);
    settle(g);
    expect(g.life('p1')).toBe(23);
    expect(g.zoneOf(g.id('p1', 't-rhythm', 'exile'))).toBe('exile');
  });

  it('is also cast normally from hand for its mana cost (no tap, not exiled)', () => {
    const g = new Game(
      scenario({ p1: { hand: ['t-wild-ride'], battlefield: ['mountain', 'ogre'] }, p2: {} }),
    );
    const card = g.id('p1', 't-wild-ride', 'hand');
    const a = casts(g, 'p1', card).find(toP2)!;
    expect(a.harmonizeTap).toBeUndefined();
    g.do(a);
    settle(g);
    expect(g.zoneOf(card)).toBe('graveyard');
  });

  it('Songcrafter Mage: the target gains harmonize (its mana cost) until end of turn, then it is exiled', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['shock'],
          hand: ['t-songcrafter'],
          battlefield: ['mountain', 'forest', 'forest'],
        },
        p2: {},
      }),
    );
    const shock = g.id('p1', 'shock', 'graveyard');
    expect(casts(g, 'p1', shock)).toHaveLength(0);
    g.do(casts(g, 'p1', g.id('p1', 't-songcrafter', 'hand'))[0]!);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal('p1')[0]!);
    settle(g);
    const again = casts(g, 'p1', shock).find(toP2);
    expect(again).toBeDefined();
    g.do(again!);
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(shock)).toBe('exile');
  });
});

describe('Behold a Dragon', () => {
  it('"behold a Dragon or pay {1}": a Dragon you control makes it cost {B}', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-caustic'], battlefield: ['swamp', 't-dragon'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const card = g.id('p1', 't-caustic', 'hand');
    const ogre = g.id('p2', 'ogre');
    const behold = casts(g, 'p1', card).find(
      (a) => a.beheld && a.targets.some((t) => 'object' in t && t.object.id === ogre),
    )!;
    expect(behold).toBeDefined();
    g.do(behold);
    settle(g);
    expect(g.zoneOf(ogre)).toBe('graveyard');
  });

  it('a Dragon card in hand can be beheld too, and is revealed', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-caustic', 't-dragon'], battlefield: ['swamp'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const card = g.id('p1', 't-caustic', 'hand');
    const dragon = g.id('p1', 't-dragon', 'hand');
    const behold = casts(g, 'p1', card).find((a) => a.beheld)!;
    expect(behold.beholdCard).toBe(dragon);
    g.do(behold);
    expect(g.events.some((e) => e.type === 'cardsRevealed')).toBe(true);
  });

  it('without a Dragon it costs {1}{B}', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-caustic'], battlefield: ['swamp'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 't-caustic', 'hand'))).toHaveLength(0);
  });

  it('"you may behold a Dragon … if a Dragon was beheld": the bonus only with the behold', () => {
    const run = (beheld: boolean) => {
      const g = new Game(
        scenario({
          step: 'beginCombat',
          active: 'p2',
          p1: { hand: ['t-osseous'], battlefield: ['plains', 'plains', 't-dragon'] },
          p2: { battlefield: ['ogre'] },
        }),
      );
      g.passBoth();
      const ogre = g.id('p2', 'ogre');
      g.attack(ogre);
      g.pass(); // p2 passes; p1 may respond
      const card = g.id('p1', 't-osseous', 'hand');
      const a = casts(g, 'p1', card).find((x) => !!x.kicked === beheld)!;
      expect(a).toBeDefined();
      g.do(a);
      settle(g);
      expect(g.zoneOf(ogre)).toBe('graveyard');
      return g.life('p1');
    };
    expect(run(true)).toBe(22);
    expect(run(false)).toBe(20);
  });

  it('Sarkhan-style "you may behold a Dragon. If you do, ...": asks which card, or to decline', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-sarkhan', 't-dragon'], battlefield: ['mountain', 'mountain'] },
        p2: {},
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 't-sarkhan', 'hand'))[0]!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'Behold t-dragon (reveal it from your hand)',
      "Don't behold",
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.life('p1')).toBe(23);
    expect(g.events.some((e) => e.type === 'cardsRevealed')).toBe(true);
  });

  it('declining the behold gives nothing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-sarkhan'], battlefield: ['mountain', 'mountain', 't-dragon'] },
        p2: {},
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 't-sarkhan', 'hand'))[0]!);
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(g.life('p1')).toBe(20);
  });

  it('with nothing to behold, nothing is asked and nothing happens', () => {
    const g = new Game(
      scenario({ p1: { hand: ['t-sarkhan'], battlefield: ['mountain', 'mountain'] }, p2: {} }),
    );
    g.do(casts(g, 'p1', g.id('p1', 't-sarkhan', 'hand'))[0]!);
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.life('p1')).toBe(20);
  });

  it('"if you control a Dragon" is a creature-control condition on a subtype', () => {
    const withDragon = new Game(
      scenario({ p1: { hand: ['t-dragon-check'], battlefield: ['forest', 't-dragon'] }, p2: {} }),
    );
    withDragon.do(casts(withDragon, 'p1', withDragon.id('p1', 't-dragon-check', 'hand'))[0]!);
    settle(withDragon);
    expect(withDragon.life('p1')).toBe(22);
    const without = new Game(
      scenario({ p1: { hand: ['t-dragon-check'], battlefield: ['forest'] }, p2: {} }),
    );
    without.do(casts(without, 'p1', without.id('p1', 't-dragon-check', 'hand'))[0]!);
    settle(without);
    expect(without.life('p1')).toBe(20);
  });

  it('Molten Exhale: a sorcery that can be cast at instant speed if you behold a Dragon', () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { hand: ['t-molten'], battlefield: ['mountain', 'mountain', 't-dragon'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const all = casts(g, 'p1', g.id('p1', 't-molten', 'hand'));
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.kicked)).toBe(true);
    // And at sorcery speed both ways are offered.
    const main = new Game(
      scenario({
        p1: { hand: ['t-molten'], battlefield: ['mountain', 'mountain', 't-dragon'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const both = casts(main, 'p1', main.id('p1', 't-molten', 'hand'));
    expect(both.some((a) => a.kicked)).toBe(true);
    expect(both.some((a) => !a.kicked)).toBe(true);
    // Without a Dragon it cannot be cast at instant speed.
    const none = new Game(
      scenario({
        step: 'beginCombat',
        p1: { hand: ['t-molten'], battlefield: ['mountain', 'mountain'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(none, 'p1', none.id('p1', 't-molten', 'hand'))).toHaveLength(0);
  });
});
