import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_MULTICOLOUR_MAIN } from '../src/ltr/multicolour-main.ts';
import { LTR_COLORLESS_MAIN } from '../src/ltr/colorless-main.ts';
import { cast, game, handSize, n, pt } from './blb-helpers.ts';
import { casts, done, keywords, names, obj, toStep } from './hob-white-helpers.ts';
import {
  attack,
  canUse,
  type Game,
  ringOf,
  settleOn,
  tokensOf,
  toBlockers,
  use,
} from './ltr-white-helpers.ts';

// Lord of the Rings 22: the multicolour and colorless main-set cards outside the Jumpstart packets.

/** Resolves everything, keeping scried cards on top. */
function finish(g: Game): void {
  for (let i = 0; i < 10; i++) {
    done(g);
    const d = g.decision;
    if (d.kind !== 'scry') return;
    g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
  }
}

describe('the multicolour and colorless main-set groups are registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_MULTICOLOUR_MAIN)).toHaveLength(20);
    expect(Object.keys(LTR_COLORLESS_MAIN)).toHaveLength(6);
    for (const name of [...Object.keys(LTR_MULTICOLOUR_MAIN), ...Object.keys(LTR_COLORLESS_MAIN)]) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Arwen Undómiel', () => {
  it('puts a counter on a creature whenever you scry', () => {
    const g = game({
      p1: {
        battlefield: ['arwen-und-miel', ...n('forest', 3), ...n('island', 3)],
        library: n('island', 3),
      },
    });
    const arwen = g.id('p1', 'arwen-und-miel');
    use(g, arwen, 1);
    finish(g);
    expect(pt(g, arwen)).toEqual([3, 3]);
  });
});

describe('Bilbo, Retired Burglar', () => {
  it('tempts you as he enters and makes a Treasure when he hits a player', () => {
    const g = game({
      p1: { hand: ['bilbo-retired-burglar'], battlefield: ['island', 'island', 'mountain'] },
      p2: {},
    });
    cast(g, 'bilbo-retired-burglar');
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
    const h = game({ p1: { battlefield: ['bilbo-retired-burglar'] }, p2: {} });
    attack(h, [h.id('p1', 'bilbo-retired-burglar')]);
    h.passUntilStep('endCombat');
    done(h);
    expect(tokensOf(h, 'treasure-token')).toHaveLength(1);
  });
});

describe('Butterbur, Bree Innkeeper', () => {
  it('makes a Food at your end step only if you have none', () => {
    const g = game({ p1: { battlefield: ['butterbur-bree-innkeeper'] } });
    toStep(g, 'end', 'p1');
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
    const h = game({ p1: { battlefield: ['butterbur-bree-innkeeper', 'food-token'] } });
    toStep(h, 'end', 'p1');
    done(h);
    expect(tokensOf(h, 'food-token')).toHaveLength(1);
  });
});

describe('Denethor, Ruling Steward', () => {
  it('drains by sacrificing another creature, and makes a Soldier at end step after a death', () => {
    const g = game({
      p1: { battlefield: ['denethor-ruling-steward', 'savannah-lions', ...n('plains', 2)] },
    });
    use(g, g.id('p1', 'denethor-ruling-steward'), 1);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    toStep(g, 'end', 'p1');
    done(g);
    expect(tokensOf(g, 'hob-human-soldier-token')).toHaveLength(1);
  });
});

describe('Friendly Rivalry', () => {
  it('has your creature and your legendary creature each hit their creature', () => {
    const g = game({
      p1: {
        hand: ['friendly-rivalry'],
        battlefield: ['savannah-lions', 'gimli-counter-of-kills', 'mountain', 'forest'],
      },
      p2: { battlefield: ['aegis-turtle'] },
    });
    const turtle = g.id('p2', 'aegis-turtle');
    cast(g, 'friendly-rivalry', [
      obj(g, g.id('p1', 'savannah-lions')),
      obj(g, g.id('p1', 'gimli-counter-of-kills')),
      obj(g, turtle),
    ]);
    done(g);
    // 2 + 4 damage to a 0/5.
    expect(g.zoneOf(turtle)).toBe('graveyard');
  });
});

describe('Frodo Baggins', () => {
  it('tempts you as he enters; as Ring-bearer he must be blocked', () => {
    const g = game({
      p1: { hand: ['frodo-baggins'], battlefield: ['forest', 'plains'] },
      p2: { battlefield: ['aegis-turtle'] },
    });
    cast(g, 'frodo-baggins');
    done(g);
    const frodo = g.id('p1', 'frodo-baggins');
    expect(ringOf(g)?.bearer?.id).toBe(frodo);
    toStep(g, 'main1', 'p2');
    toStep(g, 'main1', 'p1');
    attack(g, [frodo]);
    toBlockers(g);
    // Declaring no blocks, the Turtle blocks him anyway.
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat?.attackers.find((a) => a.id === frodo)?.blockers).toEqual([
      g.id('p2', 'aegis-turtle'),
    ]);
  });
});

describe("Gandalf's Sanction", () => {
  it('deals X to a creature, the excess to its controller', () => {
    const g = game({
      p1: {
        hand: ['gandalfs-sanction'],
        graveyard: [
          'hithlain-knots',
          'hithlain-knots',
          'hithlain-knots',
          'hithlain-knots',
          'birthday-escape',
        ],
        battlefield: ['island', 'island', 'mountain'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'gandalfs-sanction', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    // 5 damage: 1 to the 2/1, 4 to its controller.
    expect(g.life('p2')).toBe(16);
  });
});

describe('Gwaihir the Windlord', () => {
  it('costs {2} less after you have drawn two cards this turn', () => {
    const four = game({
      p1: { hand: ['gwaihir-the-windlord'], battlefield: [...n('island', 3), 'plains'] },
    });
    expect(casts(four, 'gwaihir-the-windlord')).toHaveLength(0);
    const g = game({
      p1: {
        hand: ['gwaihir-the-windlord', 'hithlain-knots', 'birthday-escape'],
        battlefield: [...n('island', 5), ...n('plains', 2)],
        library: n('island', 4),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'hithlain-knots', [obj(g, g.id('p2', 'savannah-lions'))]);
    finish(g);
    cast(g, 'birthday-escape');
    done(g);
    // Four lands left: enough only with the reduction.
    expect(casts(g, 'gwaihir-the-windlord').length).toBeGreaterThan(0);
  });
  it('gives other Birds vigilance', () => {
    const g = game({ p1: { battlefield: ['gwaihir-the-windlord', 'eagles-of-the-north'] } });
    expect(keywords(g, g.id('p1', 'eagles-of-the-north'))).toContain('vigilance');
  });
});

describe('Legolas, Counter of Kills', () => {
  it("grows whenever an opponent's creature dies", () => {
    const g = game({
      p1: { hand: ['rangers-firebrand'], battlefield: ['legolas-counter-of-kills', 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'rangers-firebrand', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g);
    expect(pt(g, g.id('p1', 'legolas-counter-of-kills'))).toEqual([3, 4]);
  });
});

describe('Mauhúr, Uruk-hai Captain', () => {
  it('adds a counter when counters go on an Orc Army', () => {
    const g = game({
      p1: { hand: ['deceive-the-messenger'], battlefield: ['mauh-r-uruk-hai-captain', 'island'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'deceive-the-messenger', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token')[0]!)).toEqual([2, 2]);
  });
});

describe('The Mouth of Sauron', () => {
  it('mills three, then amasses by the instants and sorceries in that graveyard', () => {
    const g = game({
      p1: { hand: ['the-mouth-of-sauron'], battlefield: [...n('island', 3), ...n('swamp', 2)] },
      p2: {
        graveyard: ['hithlain-knots'],
        library: ['birthday-escape', 'island', 'island', 'island'],
      },
    });
    cast(g, 'the-mouth-of-sauron');
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    settle2(g, 'p2');
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(4);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token')[0]!)).toEqual([2, 2]);
  });
});

/** Answers the pending trigger's targets with this player. */
function settle2(g: Game, player: 'p1' | 'p2'): void {
  const a = g
    .legal()
    .find(
      (x) =>
        x.type === 'chooseTargets' && x.targets.some((t) => 'player' in t && t.player === player),
    );
  if (!a) throw new Error('no player target');
  g.do(a);
}

describe('Old Man Willow', () => {
  it('is as big as your land count; attacking, a sacrifice gives -2/-2', () => {
    const g = game({
      p1: { battlefield: ['old-man-willow', 'savannah-lions', ...n('forest', 3)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const willow = g.id('p1', 'old-man-willow');
    expect(pt(g, willow)).toEqual([3, 3]);
    attack(g, [willow]);
    done(g);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });
});

describe('Prince Imrahil the Fair', () => {
  it('makes a Soldier on your second draw each turn', () => {
    const g = game({
      p1: {
        hand: ['hithlain-knots', 'birthday-escape'],
        battlefield: ['prince-imrahil-the-fair', ...n('island', 3)],
        library: n('island', 4),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'hithlain-knots', [obj(g, g.id('p2', 'savannah-lions'))]);
    finish(g);
    cast(g, 'birthday-escape');
    done(g);
    expect(tokensOf(g, 'hob-human-soldier-token')).toHaveLength(1);
  });
});

describe('Ringsight', () => {
  it('tempts you and finds a card sharing a color with your legendary creature', () => {
    const g = game({
      p1: {
        hand: ['ringsight'],
        battlefield: ['gimli-counter-of-kills', 'island', 'island', 'swamp'],
        library: ['savannah-lions', 'rangers-firebrand', 'island'],
      },
    });
    cast(g, 'ringsight');
    done(g);
    // Gimli is red: only the Firebrand qualifies.
    expect(names(g, 'p1', 'hand')).toEqual(['rangers-firebrand']);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Rise of the Witch-king', () => {
  it('each player sacrifices; you return another permanent card to the battlefield', () => {
    const g = game({
      p1: {
        hand: ['rise-of-the-witch-king'],
        graveyard: ['serra-angel'],
        battlefield: ['savannah-lions', ...n('swamp', 2), ...n('forest', 2)],
      },
      p2: { battlefield: ['aegis-turtle'] },
    });
    cast(g, 'rise-of-the-witch-king');
    done(g, { card: 'serra-angel' });
    expect(g.zoneOf(g.id('p1', 'serra-angel'))).toBe('battlefield');
    expect(g.zoneOf(g.id('p2', 'aegis-turtle', 'graveyard'))).toBe('graveyard');
  });
});

describe('Shadow Summoning', () => {
  it('makes two tapped flying Spirits', () => {
    const g = game({ p1: { hand: ['shadow-summoning'], battlefield: ['plains', 'swamp'] } });
    cast(g, 'shadow-summoning');
    done(g);
    const spirits = tokensOf(g, 'ltr-spirit-token');
    expect(spirits).toHaveLength(2);
    expect(spirits.every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe('Shadowfax, Lord of Horses', () => {
  it('puts a smaller creature from your hand onto the battlefield attacking', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['shadowfax-lord-of-horses'] },
      p2: {},
    });
    expect(keywords(g, g.id('p1', 'shadowfax-lord-of-horses'))).toContain('haste');
    attack(g, [g.id('p1', 'shadowfax-lord-of-horses')]);
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.state.combat?.attackers.some((a) => a.id === lions)).toBe(true);
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(14);
  });
});

describe('Strider, Ranger of the North', () => {
  it('pumps on landfall and gives first strike at power 4', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['strider-ranger-of-the-north', 'gimli-counter-of-kills'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    settleOn(g, g.id('p1', 'gimli-counter-of-kills'));
    const gimli = g.id('p1', 'gimli-counter-of-kills');
    expect(pt(g, gimli)).toEqual([5, 4]);
    expect(keywords(g, gimli)).toContain('firstStrike');
  });
});

describe('Théoden, King of Rohan', () => {
  it('gives double strike when a Human of yours enters', () => {
    const g = game({
      p1: {
        hand: ['protector-of-gondor'],
        battlefield: ['th-oden-king-of-rohan', 'savannah-lions', ...n('plains', 4)],
      },
    });
    cast(g, 'protector-of-gondor');
    settleOn(g, g.id('p1', 'savannah-lions'));
    done(g);
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('doubleStrike');
  });
});

describe('Uglúk of the White Hand', () => {
  it('gets two counters for an Orc dying, one for another creature', () => {
    const g = game({
      p1: {
        battlefield: [
          'ugl-k-of-the-white-hand',
          'savannah-lions',
          'mauh-r-uruk-hai-captain',
          'denethor-ruling-steward',
          ...n('plains', 4),
        ],
      },
    });
    const ugluk = g.id('p1', 'ugl-k-of-the-white-hand');
    const denethor = g.id('p1', 'denethor-ruling-steward');
    const sacrifice = (victim: string) => {
      const id = g.id('p1', victim);
      const a = g
        .legal()
        .find(
          (x) =>
            x.type === 'activateAbility' &&
            x.source === denethor &&
            x.abilityIndex === 1 &&
            JSON.stringify(x).includes(id),
        );
      if (!a) throw new Error('no activation');
      g.do(a);
      done(g);
    };
    sacrifice('savannah-lions');
    // Mauhúr adds one: Uglúk is an Orc.
    expect(pt(g, ugluk)).toEqual([5, 5]);
    sacrifice('mauh-r-uruk-hai-captain');
    // Mauhúr is an Orc: two more (he is gone, so no extra).
    expect(pt(g, ugluk)).toEqual([7, 7]);
  });
});

describe('Stone of Erech', () => {
  it("exiles the opponent's dying creatures, and exiles a graveyard to draw", () => {
    const g = game({
      p1: {
        hand: ['rangers-firebrand'],
        battlefield: ['stone-of-erech', ...n('mountain', 3)],
        library: n('mountain', 2),
      },
      p2: { battlefield: ['savannah-lions'], graveyard: ['island'] },
    });
    cast(g, 'rangers-firebrand', [obj(g, g.id('p2', 'savannah-lions'))]);
    done(g);
    expect(names(g, 'p2', 'exile')).toEqual(['savannah-lions']);
    const stone = g.id('p1', 'stone-of-erech');
    const a = g
      .legal()
      .find(
        (x) =>
          x.type === 'activateAbility' &&
          x.source === stone &&
          x.targets.some((t) => 'player' in t && t.player === 'p2'),
      );
    g.do(a!);
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(1);
  });
});

describe("Wizard's Rockets", () => {
  it('enters tapped and draws when it goes to the graveyard', () => {
    const g = game({
      p1: { hand: ['wizards-rockets'], battlefield: ['island'], library: n('island', 2) },
    });
    cast(g, 'wizards-rockets');
    done(g);
    expect(g.obj(g.id('p1', 'wizards-rockets')).tapped).toBe(true);
    const h = game({ p1: { battlefield: ['wizards-rockets'], library: n('island', 2) } });
    use(h, h.id('p1', 'wizards-rockets'), 0);
    done(h);
    expect(handSize(h, 'p1')).toBe(1);
  });
});

describe('Great Hall of the Citadel', () => {
  it('makes two colored mana for legendary spells only', () => {
    const g = game({
      p1: {
        hand: ['frodo-baggins', 'shadow-summoning'],
        battlefield: ['great-hall-of-the-citadel', 'mountain'],
      },
    });
    use(g, g.id('p1', 'great-hall-of-the-citadel'), 1);
    done(g);
    expect(casts(g, 'shadow-summoning')).toHaveLength(0);
    expect(casts(g, 'frodo-baggins').length).toBeGreaterThan(0);
  });
});

describe('The Grey Havens', () => {
  it('makes the colors of legendary creature cards in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['many-partings'],
        graveyard: ['frodo-baggins'],
        battlefield: ['the-grey-havens'],
      },
    });
    expect(casts(g, 'many-partings').length).toBeGreaterThan(0);
    const h = game({ p1: { hand: ['many-partings'], battlefield: ['the-grey-havens'] } });
    expect(casts(h, 'many-partings')).toHaveLength(0);
  });
});

describe('Shire Terrace', () => {
  it('sacrifices itself to fetch a basic land tapped', () => {
    const g = game({
      p1: { battlefield: ['shire-terrace', 'forest'], library: ['plains', 'island'] },
    });
    use(g, g.id('p1', 'shire-terrace'), 1);
    done(g);
    const plains = g.id('p1', 'plains');
    expect(g.zoneOf(plains)).toBe('battlefield');
    expect(g.obj(plains).tapped).toBe(true);
  });
});

describe('Shire Scarecrow', () => {
  it('filters mana only once each turn', () => {
    const g = game({ p1: { battlefield: ['shire-scarecrow', ...n('plains', 3)] } });
    const crow = g.id('p1', 'shire-scarecrow');
    use(g, crow, 0);
    done(g);
    expect(canUse(g, crow, 0)).toBe(false);
  });
});
