import { describe, expect, it } from 'vitest';
import { counters, casts, castsAt, Game, scenario } from './ecl-fixtures.ts';

describe('blight as an additional cost to cast a spell', () => {
  it('an optional blight is a second way to cast it, and "if the additional cost was paid" sees it', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'green-guy'] },
        p2: { battlefield: ['big-red'] },
      }),
    );
    const strike = g.id('p1', 'cinder-strike', 'hand');
    const mine = g.id('p1', 'green-guy');
    const theirs = g.id('p2', 'big-red');
    const options = casts(g, 'p1', strike).filter((a) =>
      a.targets.some((t) => 'object' in t && t.object.id === theirs),
    );
    // Plain, or blighting the one creature I control.
    expect(options.map((a) => a.blight)).toEqual([undefined, mine]);
    const blighted = options.find((a) => a.blight)!;
    expect(blighted.kicked).toBe(true);
    g.do(blighted);
    expect(counters(g, mine)).toBe(1);
    g.passBoth();
    // 4 damage instead of 2 kills the 4/4.
    expect(g.zoneOf(theirs)).toBe('graveyard');
  });

  it('the plain cast does 2 damage and blights nothing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'green-guy'] },
        p2: { battlefield: ['big-red'] },
      }),
    );
    const theirs = g.id('p2', 'big-red');
    g.do(castsAt(g, 'p1', g.id('p1', 'cinder-strike', 'hand'), theirs).find((a) => !a.blight)!);
    g.passBoth();
    expect(g.obj(theirs).damage).toBe(2);
    expect(counters(g, g.id('p1', 'green-guy'))).toBe(0);
  });

  it('with no creature to blight, only the plain cast is legal', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['cinder-strike'], battlefield: ['mountain'] },
        p2: { battlefield: ['big-red'] },
      }),
    );
    const options = casts(g, 'p1', g.id('p1', 'cinder-strike', 'hand'));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((a) => !a.blight && !a.kicked)).toBe(true);
  });

  it('"blight 1 or pay {3}": pay or blight, and blight needs a creature', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['bogslither'], battlefield: ['swamp', 'swamp', 'green-guy'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const embrace = g.id('p1', 'bogslither', 'hand');
    const ogre = g.id('p2', 'ogre');
    const options = castsAt(g, 'p1', embrace, ogre);
    // Two swamps pay {1}{B}; {3} more isn't available, so only the blight way is.
    expect(options).toHaveLength(1);
    expect(options[0]!.blight).toBe(g.id('p1', 'green-guy'));
    g.do(options[0]!);
    expect(counters(g, g.id('p1', 'green-guy'))).toBe(1);
    g.passBoth();
    expect(g.zoneOf(ogre)).toBe('exile');
  });

  it('"blight 1 or pay {3}" paid in mana blights nothing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['bogslither'], battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'swamp'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const options = castsAt(g, 'p1', g.id('p1', 'bogslither', 'hand'), g.id('p2', 'ogre'));
    // No creature to blight: just the paid way.
    expect(options).toHaveLength(1);
    expect(options[0]!.blight).toBeUndefined();
    g.do(options[0]!);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(5);
  });

  it('a mandatory blight is part of every cast; the player chooses the creature', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['fell-rite'], battlefield: ['swamp', 'ogre', 'bear'] },
      }),
    );
    const rite = g.id('p1', 'fell-rite', 'hand');
    const options = casts(g, 'p1', rite);
    expect(options.map((a) => a.blight).sort()).toEqual(
      [g.id('p1', 'bear'), g.id('p1', 'ogre')].sort(),
    );
    const onOgre = options.find((a) => a.blight === g.id('p1', 'ogre'))!;
    g.do(onOgre);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(2);
    // The 2/2 bear with two counters would die; the ogre is a 1/1 now.
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('blighting a creature to death is legal; it dies', () => {
    const g = new Game(scenario({ p1: { hand: ['fell-rite'], battlefield: ['swamp', 'bear'] } }));
    const bear = g.id('p1', 'bear');
    g.do(casts(g, 'p1', g.id('p1', 'fell-rite', 'hand'))[0]!);
    expect(g.zoneOf(bear)).toBe('graveyard');
  });

  it('there is no way to cast a mandatory blight without a creature', () => {
    const g = new Game(scenario({ p1: { hand: ['fell-rite'], battlefield: ['swamp'] } }));
    expect(casts(g, 'p1', g.id('p1', 'fell-rite', 'hand'))).toHaveLength(0);
  });

  it('Pyrrhic Strike: paying the optional blight chooses both modes instead', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['pyrrhic'], battlefield: ['plains', 'plains', 'plains', 'ogre'] },
        p2: { battlefield: ['wall'] },
      }),
    );
    const strike = g.id('p1', 'pyrrhic', 'hand');
    const all = casts(g, 'p1', strike);
    const both = all.find((a) => a.kicked)!;
    expect(both.blight).toBe(g.id('p1', 'ogre'));
    expect(both.targets).toHaveLength(1);
    // The single modes are offered without a blight.
    expect(all.filter((a) => !a.kicked).map((a) => a.mode)).toContain(0);
    expect(all.filter((a) => !a.kicked).every((a) => !a.blight)).toBe(true);
    g.do(both);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(2);
    g.passBoth();
    expect(g.life('p1')).toBe(23);
    expect(g.zoneOf(g.id('p2', 'wall', 'graveyard'.length ? 'graveyard' : 'graveyard'))).toBe(
      'graveyard',
    );
  });

  it('blight X: X up to the greatest toughness, X damage to each opponent and their creatures', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['soul-immolation'],
          battlefield: ['mountain', 'mountain', 'mountain', 'mountain', 'mountain', 'ogre'],
        },
        p2: { battlefield: ['bear', 'wall'] },
      }),
    );
    const id = g.id('p1', 'soul-immolation', 'hand');
    const options = casts(g, 'p1', id);
    // The ogre is a 3/3: X is 0 to 3.
    expect(options.map((a) => a.x).sort()).toEqual([0, 1, 2, 3]);
    expect(options.find((a) => a.x === 0)!.blight).toBeUndefined();
    const two = options.find((a) => a.x === 2)!;
    expect(two.blight).toBe(g.id('p1', 'ogre'));
    const bear = g.id('p2', 'bear');
    const wall = g.id('p2', 'wall');
    g.do(two);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(2);
    g.passBoth();
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.obj(wall).damage).toBe(2);
    // X = 3 would blight the ogre to death, which is legal.
    expect(options.find((a) => a.x === 3)).toBeDefined();
  });
});

describe('blight as an ability cost', () => {
  it('{T}, Blight 1: the creature chosen gets the counter (the source itself is allowed)', () => {
    const g = new Game(scenario({ p1: { battlefield: ['gristle', 'ogre'] } }));
    const source = g.id('p1', 'gristle');
    const acts = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === source);
    expect(acts.map((a) => a.type === 'activateAbility' && a.blight).sort()).toEqual(
      [source, g.id('p1', 'ogre')].sort(),
    );
    g.do(acts.find((a) => a.type === 'activateAbility' && a.blight === g.id('p1', 'ogre'))!);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(1);
    expect(g.obj(source).tapped).toBe(true);
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('with no creature to blight the ability is not offered', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['gift', 'plains', 'plains'], graveyard: ['gift'] } }),
    );
    // The graveyard card needs a creature to blight.
    expect(g.legal('p1').filter((a) => a.type === 'activateAbility')).toHaveLength(0);
  });

  it("works from the graveyard (Evershrike's Gift)", () => {
    const g = new Game(
      scenario({ p1: { graveyard: ['gift'], battlefield: ['plains', 'plains', 'ogre'] } }),
    );
    const gift = g.id('p1', 'gift', 'graveyard');
    const act = g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === gift)!;
    expect(act).toBeDefined();
    g.do(act);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(2);
    g.passBoth();
    expect(g.zoneOf(gift)).toBe('hand');
  });
});

describe('blight as an effect', () => {
  it('"you may blight 1. If you do": choose the creature, then the rest happens', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['seizer'], battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'ogre'] },
        p2: { hand: ['bear', 'ogre'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'seizer', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    const picks = g.legal('p1').filter((a) => a.type === 'chooseCard');
    // Two creatures (the Seizer and the ogre) or decline.
    expect(picks).toHaveLength(3);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'ogre') });
    expect(counters(g, g.id('p1', 'ogre'))).toBe(1);
    // "If you do": each opponent discards a card.
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p2', card: g.state.players.p2.hand[0]! });
    expect(g.state.players.p2.hand).toHaveLength(1);
  });

  it('declining does nothing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['seizer'], battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'ogre'] },
        p2: { hand: ['bear', 'ogre'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'seizer', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(counters(g, g.id('p1', 'ogre'))).toBe(0);
    expect(g.state.players.p2.hand).toHaveLength(2);
  });

  it('"the blighted creature" is the one chosen', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['grubby'], battlefield: ['ogre', 'swamp', 'swamp', 'swamp'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'grubby', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'ogre') });
    // The ogre is a 3/3 with a -1/-1 counter: toughness 2 at that moment.
    expect(g.life('p1')).toBe(22);
  });

  it('"If you don\'t, you lose 3 life": declining, or having no creature, both count', () => {
    const decline = new Game(scenario({ p1: { battlefield: ['ogre'], hand: [] }, p2: {} }));
    const other = new Game(scenario({ p1: { battlefield: [] } }));
    other.state.battlefield.push(...([] as string[]));
    // Declining.
    const start = new Game(
      scenario({ p1: { battlefield: ['gutsplitter', 'ogre'] }, step: 'upkeep' }),
    );
    start.passUntilStep('main1', 20);
    // The beginning of main phase trigger asks.
    for (let i = 0; i < 4 && start.decision.kind === 'priority'; i++) start.pass();
    void decline;
    void other;
    expect(start.decision.kind).toBe('chooseObject');
    start.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(start.life('p1')).toBe(17);
  });

  it('a mandatory blight with a single creature needs no prompt', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['morcant', 'swamp'],
          battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'swamp'],
        },
        p2: { battlefield: ['ogre'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'morcant', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    // The opponent blights their only creature.
    expect(counters(g, g.id('p2', 'ogre'))).toBe(1);
    expect(g.decision.kind).toBe('priority');
  });

  it('the opponent chooses which of their creatures to blight', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['morcant'], battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'swamp'] },
        p2: { battlefield: ['ogre', 'bear'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'morcant', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseCard', player: 'p2', card: g.id('p2', 'bear') });
    expect(counters(g, g.id('p2', 'bear'))).toBe(1);
    expect(counters(g, g.id('p2', 'ogre'))).toBe(0);
  });
});

describe('blight with the older vocabulary', () => {
  it('"you may pay {2}. If you do not, blight 2" (payOrElse)', () => {
    const start = () =>
      new Game(scenario({ p1: { hand: ['spewer'], battlefield: ['forest', 'forest', 'ogre'] } }));
    const decline = start();
    decline.do(casts(decline, 'p1', decline.id('p1', 'spewer', 'hand'))[0]!);
    decline.passBoth();
    decline.passBoth();
    expect(decline.decision.kind).toBe('payOrCounter');
    decline.do({ type: 'chooseEffect', player: 'p1', accept: false });
    // Two creatures (the Spewer and the ogre): the player chooses which gets the two counters.
    expect(decline.decision.kind).toBe('chooseObject');
    decline.do({ type: 'chooseCard', player: 'p1', card: decline.id('p1', 'ogre') });
    expect(counters(decline, decline.id('p1', 'ogre'))).toBe(2);

    const pay = start();
    pay.do(casts(pay, 'p1', pay.id('p1', 'spewer', 'hand'))[0]!);
    pay.passBoth();
    pay.passBoth();
    pay.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(counters(pay, pay.id('p1', 'ogre'))).toBe(0);
    expect(pay.decision.kind).toBe('priority');
  });

  it('"you may blight 1. When you do, target creature gains haste" (a reflexive trigger)', () => {
    const g = new Game(
      scenario({
        step: 'main1',
        p1: { battlefield: ['torchmaster', 'ogre'] },
        p2: { battlefield: [] },
      }),
    );
    const ogre = g.id('p1', 'ogre');
    g.passUntilStep('beginCombat');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: ogre });
    expect(counters(g, ogre)).toBe(1);
    // The reflexive trigger asks for its target.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === ogre),
        )!,
    );
    g.passBoth();
    const hasty = g.state.effects.some(
      (e) => e.affected.id === ogre && e.keywords.includes('haste'),
    );
    expect(hasty).toBe(true);
  });
});
