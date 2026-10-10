import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { casts, DB, Game, getPower, getToughness, scenario } from './tdm-fixtures.ts';

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

describe('three-colour mana', () => {
  it('a tri-land taps for whichever of its three colours the cost needs', () => {
    // {R}{W}{B} with a Nomad Outpost, a Plains and a Swamp: the outpost has to make the red.
    const g = new Game(
      scenario({
        p1: { hand: ['t-tricolour'], battlefield: ['t-nomad-outpost', 'plains', 'swamp'] },
        p2: {},
      }),
    );
    const card = g.id('p1', 't-tricolour', 'hand');
    expect(casts(g, 'p1', card)).toHaveLength(1);
    g.do(casts(g, 'p1', card)[0]!);
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
  });

  it('two tri-lands that share colours still pay a three-colour cost together with a basic', () => {
    // Outpost (R/W/B) + Citadel (W/B/G) + Mountain: R from the mountain, W and B from the two tri-lands.
    const g = new Game(
      scenario({
        p1: {
          hand: ['t-tricolour'],
          battlefield: ['t-nomad-outpost', 't-sandsteppe-citadel', 'mountain'],
        },
        p2: {},
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 't-tricolour', 'hand'))).toHaveLength(1);
    // And without the basic: Outpost for R, Citadel can make W or B but only one of them.
    const h = new Game(
      scenario({
        p1: {
          hand: ['t-tricolour'],
          battlefield: ['t-nomad-outpost', 't-sandsteppe-citadel', 'plains'],
        },
        p2: {},
      }),
    );
    expect(casts(h, 'p1', h.id('p1', 't-tricolour', 'hand'))).toHaveLength(1);
  });

  it('is not castable when the colours are not all available', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['t-tricolour'], battlefield: ['t-nomad-outpost', 'plains', 'plains'] },
        p2: {},
      }),
    );
    // R and B can both only come from the outpost.
    expect(casts(g, 'p1', g.id('p1', 't-tricolour', 'hand'))).toHaveLength(0);
  });

  it('twobrid {2/R}{2/W}{2/B}: one pip each from three colours, or two generic for any pip', () => {
    const cheap = new Game(
      scenario({
        p1: { hand: ['t-current'], battlefield: ['mountain', 'plains', 'swamp'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(cheap, 'p1', cheap.id('p1', 't-current', 'hand')).length).toBeGreaterThan(0);
    // Four Forests: 2 + 2 + 2 generic needs six.
    const forests = new Game(
      scenario({
        p1: { hand: ['t-current'], battlefield: Array(5).fill('forest') },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(forests, 'p1', forests.id('p1', 't-current', 'hand'))).toHaveLength(0);
    const six = new Game(
      scenario({
        p1: { hand: ['t-current'], battlefield: Array(6).fill('forest') },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(six, 'p1', six.id('p1', 't-current', 'hand')).length).toBeGreaterThan(0);
    // One red source and four generic: {R} plus two generic pairs.
    const mixed = new Game(
      scenario({
        p1: {
          hand: ['t-current'],
          battlefield: ['mountain', 'forest', 'forest', 'forest', 'forest'],
        },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(mixed, 'p1', mixed.id('p1', 't-current', 'hand')).length).toBeGreaterThan(0);
  });

  it('a Devotee turns one mana into one of its three colours, once each turn, without using the stack', () => {
    // {R}{W}{B} with Plains, Plains, Mountain and a Devotee: the second Plains pays the {1}, the Devotee makes the black.
    const g = new Game(
      scenario({
        p1: {
          hand: ['t-tricolour'],
          battlefield: ['plains', 'plains', 'mountain', 't-devotee'],
        },
        p2: {},
      }),
    );
    const card = g.id('p1', 't-tricolour', 'hand');
    expect(casts(g, 'p1', card)).toHaveLength(0);
    const devotee = g.id('p1', 't-devotee');
    const activation = g
      .legal('p1')
      .find((a) => a.type === 'activateAbility' && a.source === devotee)!;
    expect(activation).toBeDefined();
    g.do(activation);
    // Nothing went on the stack: the mana is in the pool at once.
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.players.p1.pool).toHaveLength(1);
    // Once each turn.
    expect(g.legal('p1').some((a) => a.type === 'activateAbility' && a.source === devotee)).toBe(
      false,
    );
    // Plains + Mountain + the floating mana cast it.
    const cast = casts(g, 'p1', card);
    expect(cast.length).toBeGreaterThan(0);
    g.do(cast[0]!);
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
  });

  it('Abzan Monument: {1}{W}{B}{G} from a three-colour mix of lands makes an X/X Spirit, X the greatest toughness', () => {
    const g = new Game(
      scenario({
        p1: {
          battlefield: [
            't-abzan-monument',
            'plains',
            'swamp',
            't-sandsteppe-citadel',
            'forest',
            'wall',
            'ogre',
          ],
        },
        p2: {},
      }),
    );
    const monument = g.id('p1', 't-abzan-monument');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === monument)!);
    settle(g);
    expect(g.zoneOf(monument)).not.toBe('battlefield');
    const spirit = g.state.battlefield.find(
      (id) => g.state.objects[id]!.defId === 'tdm-spirit-token',
    )!;
    // The wall is 0/4: the greatest toughness is 4.
    expect(getPower(g, spirit)).toBe(4);
    expect(getToughness(g, spirit)).toBe(4);
  });

  it('Abzan Monument cannot be activated without all three colours', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['t-abzan-monument', 'plains', 'plains', 'swamp', 'forest', 'forest'] },
        p2: {},
      }),
    );
    // {1}{W}{B}{G} is payable here (W, B, G and one more)...
    expect(g.legal('p1').some((a) => a.type === 'activateAbility')).toBe(true);
    const h = new Game(
      scenario({
        p1: { battlefield: ['t-abzan-monument', 'plains', 'plains', 'plains', 'forest'] },
        p2: {},
      }),
    );
    // ...but not without black.
    expect(h.legal('p1').some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('Mardu Monument: three Warriors with menace and haste this turn', () => {
    const g = new Game(
      scenario({
        p1: {
          battlefield: ['t-mardu-monument', 'mountain', 'plains', 'swamp', 'forest', 'forest'],
        },
        p2: {},
      }),
    );
    const monument = g.id('p1', 't-mardu-monument');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === monument)!);
    settle(g);
    const warriors = g.state.battlefield.filter(
      (id) => g.state.objects[id]!.defId === 'tdm-warrior-token',
    );
    expect(warriors).toHaveLength(3);
    for (const w of warriors) {
      const k = getCharacteristics(g.state, DB, w).keywords;
      expect(k.has('menace') && k.has('haste')).toBe(true);
    }
  });
});
