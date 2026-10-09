import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { casts, DB, Game, getPower, scenario } from './ecl-fixtures.ts';

describe('first-main-phase transform', () => {
  const toMainWithTrigger = (g: Game) => {
    g.passUntilStep('main1');
    // "At the beginning of your first main phase, you may pay {G}": the trigger is on the stack.
    expect(g.state.stack).toHaveLength(1);
    const hand = g.state.players.p1.hand.length;
    g.passBoth();
    expect(g.decision.kind).toBe('optionalEffect');
    return hand;
  };

  it('pay {G}: it transforms, and the back face\'s "transforms into" trigger happens', () => {
    const g = new Game(
      scenario({ step: 'upkeep', p1: { battlefield: ['brigid', 'forest'] }, p2: {} }),
    );
    const b = g.id('p1', 'brigid');
    const handBefore = toMainWithTrigger(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.obj(b).defId).toBe('brigid-back');
    expect(g.obj(b).front).toBe('brigid');
    // The back face's trigger (gain 5 life) is waiting on the stack.
    g.passBoth();
    expect(g.life('p1')).toBe(25);
    // The front face's "enters or transforms into" trigger did not fire for the back face (no extra card).
    expect(g.state.players.p1.hand).toHaveLength(handBefore);
  });

  it('declining leaves it as it is, and the {G} is not spent', () => {
    const g = new Game(
      scenario({ step: 'upkeep', p1: { battlefield: ['brigid', 'forest'] }, p2: {} }),
    );
    toMainWithTrigger(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(g.obj(g.id('p1', 'brigid')).defId).toBe('brigid');
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(false);
  });

  it('is not even offered the choice at the second main phase', () => {
    const g = new Game(scenario({ step: 'main2', p1: { battlefield: ['brigid', 'forest'] } }));
    g.passBoth();
    expect(g.state.stack).toHaveLength(0);
  });

  it('"enters or transforms into" fires on entering (the front face)', () => {
    const g = new Game(
      scenario({ p1: { hand: ['brigid'], battlefield: ['plains', 'plains', 'plains'] } }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'brigid', 'hand'))[0]!);
    g.passBoth();
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('when the back face has no {G}-style mana to pay, the trigger does nothing', () => {
    const g = new Game(scenario({ step: 'upkeep', p1: { battlefield: ['brigid'] }, p2: {} }));
    g.passUntilStep('main1');
    g.passBoth();
    // It can't be paid: no prompt, nothing changes.
    expect(g.decision.kind).toBe('priority');
    expect(g.obj(g.id('p1', 'brigid')).defId).toBe('brigid');
  });
});

describe('behold … and exile it', () => {
  it('exile a Kithkin from your hand as the cost; it comes back to your hand when the Champion leaves', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['champion', 'kithkin'],
          battlefield: ['plains', 'plains', 'plains', 'mountain'],
        },
        p2: {},
      }),
    );
    const champion = g.id('p1', 'champion', 'hand');
    const inHand = g.id('p1', 'kithkin', 'hand');
    const options = casts(g, 'p1', champion);
    expect(options.map((a) => a.beholdCard)).toEqual([inHand]);
    g.do(options[0]!);
    expect(g.zoneOf(inHand)).toBe('exile');
    g.passBoth();
    const c = g.id('p1', 'champion');
    expect(g.obj(c).beholdExiled?.id).toBe(inHand);
    // It leaves the battlefield (here: it takes lethal damage).
    g.obj(c).damage = 4;
    g.pass();
    expect(g.zoneOf(c)).toBe('graveyard');
    g.passBoth();
    expect(g.zoneOf(inHand)).toBe('hand');
  });

  it('a Kithkin on the battlefield can be exiled instead; each distinct one is a choice', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['champion'],
          battlefield: [
            'plains',
            'plains',
            'plains',
            'kithkin',
            { card: 'kithkin', tapped: true },
            'kithkin-lord',
          ],
        },
      }),
    );
    const options = casts(g, 'p1', g.id('p1', 'champion', 'hand'));
    // The untapped Kithkin, the tapped Kithkin and the lord: three different ones.
    expect(options).toHaveLength(3);
    const lord = g.id('p1', 'kithkin-lord');
    g.do(options.find((a) => a.beholdCard === lord)!);
    expect(g.zoneOf(lord)).toBe('exile');
    // The plains stay untapped for the mana? Three are tapped for {2}{W}.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'plains'),
    ).toHaveLength(3);
  });

  it("can't be cast with nothing to behold", () => {
    const g = new Game(
      scenario({ p1: { hand: ['champion'], battlefield: ['plains', 'plains', 'plains'] } }),
    );
    expect(casts(g, 'p1', g.id('p1', 'champion', 'hand'))).toHaveLength(0);
  });

  it('countered, the exiled card stays exiled', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['champion', 'kithkin'], battlefield: ['plains', 'plains', 'plains'] },
      }),
    );
    const inHand = g.id('p1', 'kithkin', 'hand');
    g.do(casts(g, 'p1', g.id('p1', 'champion', 'hand'))[0]!);
    expect(g.zoneOf(inHand)).toBe('exile');
  });
});

describe('gains all creature types', () => {
  it('for good: a creature that gained all types counts for creature-type lords', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['typeshifter', 'bear', 'goblin-lord'] },
      }),
    );
    const bear = g.id('p1', 'bear');
    expect(getPower(g, bear)).toBe(2);
    const act = g
      .legal('p1')
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      )!;
    g.do(act);
    g.passBoth();
    // It's a Goblin now: +1/+1 from the lord.
    expect(getPower(g, bear)).toBe(3);
    // It lasts: through the end of the turn.
    g.passUntilStep('end');
    expect(getPower(g, bear)).toBe(3);
  });

  it('"loses all creature types until end of turn" turns a creature-type bonus off, and it comes back', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['typeshifter', 'wall', 'goblin-lord', 'swamp'], hand: ['inversion'] },
      }),
    );
    const wall = g.id('p1', 'wall');
    g.do(
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.targets.some((t) => 'object' in t && t.object.id === wall),
        )!,
    );
    g.passBoth();
    // 0/4 and a Goblin: 1/5.
    expect(getPower(g, wall)).toBe(1);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'inversion', 'hand'),
      targets: [g.ref(wall)],
    });
    g.passBoth();
    // No creature types: no lord bonus. 0/4 plus +3/-3.
    expect(getPower(g, wall)).toBe(3);
    expect(getCharacteristics(g.state, DB, wall).toughness).toBe(1);
  });

  it('Stalactite Dagger: the equipped creature is all creature types', () => {
    const g = new Game(scenario({ p1: { battlefield: ['bear', 'dagger', 'goblin-lord'] } }));
    const bear = g.id('p1', 'bear');
    expect(getPower(g, bear)).toBe(2);
    g.obj(g.id('p1', 'dagger')).attachedTo = bear;
    // +1/+1 from the Dagger, +1/+1 from the Goblin lord (it's a Goblin now).
    expect(getPower(g, bear)).toBe(4);
    expect(getCharacteristics(g.state, DB, bear).toughness).toBe(4);
  });
});
