import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow step 3a: artifacts, lands, Classes and rares.

const activate = (g: ReturnType<typeof game>, source: string, abilityIndex: number, extra = {}) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets: [], ...extra });

describe('counters', () => {
  it("Innkeeper's Talent at level 3 doubles counters; Stocking the Pantry notices", () => {
    const g = game({
      p1: {
        hand: ['sunshower-druid'],
        battlefield: [...n('forest', 6), 'innkeepers-talent', 'stocking-the-pantry', 'bear-cub'],
      },
    });
    g.state.objects[g.id('p1', 'innkeepers-talent')]!.level = 3;
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'sunshower-druid'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    expect(g.obj(bear).plusOneCounters).toBe(2);
    expect(g.obj(g.id('p1', 'stocking-the-pantry')).counters?.supply).toBe(2);
  });
});

describe('changeling', () => {
  it('Barkform Harvester is every creature type (Valley Questcaller pumps it)', () => {
    const g = game({ p1: { battlefield: ['barkform-harvester', 'valley-questcaller'] } });
    expect(pt(g, g.id('p1', 'barkform-harvester'))).toEqual([3, 4]);
  });
});

describe('artifacts and lands', () => {
  it('Sugar Coat turns a creature into a Food that can be eaten', () => {
    const g = game({
      p1: { hand: ['sugar-coat'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'sugar-coat', [g.ref(angel)]));
    const c = getCharacteristics(g.state, cardDb, angel);
    expect(c.types).toEqual(['Artifact']);
    expect(c.subtypes).toEqual(['Food']);
    expect(c.keywords.size).toBe(0);
  });

  it('Tangle Tumbler becomes a creature by tapping two tokens', () => {
    const g = game({
      p1: { hand: ['hop-to-it'], battlefield: [...n('plains', 3), 'tangle-tumbler'] },
    });
    settle(cast(g, 'hop-to-it'));
    const tumbler = g.id('p1', 'tangle-tumbler');
    settle(activate(g, tumbler, 1));
    expect(all(g, 'rabbit-token').filter((id) => g.obj(id).tapped)).toHaveLength(2);
    expect(getCharacteristics(g.state, cardDb, tumbler).types).toContain('Artifact');
    expect(pt(g, tumbler)).toEqual([6, 6]);
    g.passUntilStep('beginCombat').passBoth().attack(tumbler);
    expect(g.state.combat?.attackers.map((a) => a.id)).toContain(tumbler);
  });

  it('Uncharted Haven taps only for the chosen color', () => {
    const g = game({ p1: { hand: ['uncharted-haven', 'bear-cub'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'uncharted-haven', 'hand') });
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    settle(g.do({ type: 'chooseOption', player: 'p1', index: 4 })); // Green
    expect(g.obj(g.id('p1', 'uncharted-haven')).chosenColor).toBe('G');
  });

  it('Fabled Passage untaps the land if you control four lands', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 3), 'fabled-passage'], library: ['forest', 'island'] },
    });
    activate(g, g.id('p1', 'fabled-passage'), 0);
    settle(g);
    settle(g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!));
    const land = g.state.battlefield.find((id) => ['forest', 'island'].includes(g.obj(id).defId))!;
    expect(g.obj(land).tapped).toBe(false);
  });

  it('Heirloom Epic can be paid by tapping creatures', () => {
    const g = game({
      p1: { battlefield: ['heirloom-epic', ...n('bear-cub', 4)], library: n('forest', 5) },
    });
    settle(activate(g, g.id('p1', 'heirloom-epic'), 0));
    expect(handSize(g, 'p1')).toBe(1);
    expect(all(g, 'bear-cub').every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe('Classes and spells', () => {
  it("Bandit's Talent: the opponent picks how to discard", () => {
    const g = game({
      p1: { hand: ['bandits-talent'], battlefield: n('swamp', 2) },
      p2: { hand: ['forest', 'island', 'bear-cub'] },
    });
    settle(cast(g, 'bandits-talent'));
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    settle(g.do({ type: 'chooseOption', player: 'p2', index: 0 }));
    // Only the nonland card can go.
    expect(g.legal('p2')).toHaveLength(1);
    settle(g.do(g.legal('p2')[0]!));
    expect(g.state.players.p2.hand.map((id) => g.obj(id).defId).sort()).toEqual([
      'forest',
      'island',
    ]);
  });

  it('Stargaze puts X of the top 2X into hand and the rest into the graveyard', () => {
    const g = game({
      p1: {
        hand: ['stargaze'],
        battlefield: n('swamp', 4),
        library: ['bear-cub', 'forest', 'serra-angel', 'island'],
      },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.map((a) => a.type === 'castSpell' && a.x)).toEqual([0, 1, 2]);
    settle(g.do(casts.find((a) => a.type === 'castSpell' && a.x === 2)!));
    for (let i = 0; i < 2; i++) settle(g.do(g.legal()[0]!));
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.state.players.p1.graveyard).toHaveLength(3); // two cards and Stargaze
    expect(g.life('p1')).toBe(18);
  });

  it('Coiling Rebirth with the gift also makes a 1/1 copy', () => {
    const g = game({
      p1: { hand: ['coiling-rebirth'], battlefield: n('swamp', 5), graveyard: ['serra-angel'] },
    });
    settle(
      cast(g, 'coiling-rebirth', [g.ref(g.id('p1', 'serra-angel', 'graveyard'))], { kicked: true }),
    );
    const angels = all(g, 'serra-angel');
    expect(angels).toHaveLength(2);
    expect(
      pt(
        g,
        angels.find((id) => g.obj(id).isToken)!,
      ),
    ).toEqual([1, 1]);
  });

  it('Jolly Gerbils draws when you give a gift', () => {
    const g = game({
      p1: {
        hand: ['peerless-recycling'],
        battlefield: [...n('forest', 2), 'jolly-gerbils'],
        graveyard: ['bear-cub', 'forest'],
      },
    });
    const bear = g.id('p1', 'bear-cub', 'graveyard');
    const forest = g.id('p1', 'forest', 'graveyard');
    settle(cast(g, 'peerless-recycling', [g.ref(bear), g.ref(forest)], { kicked: true }));
    expect(handSize(g, 'p1')).toBe(3); // two returned, one drawn
    expect(handSize(g, 'p2')).toBe(1); // the gift
  });

  it('Early Winter makes the opponent exile an enchantment', () => {
    const g = game({
      p1: { hand: ['early-winter'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['lunar-convocation', 'bear-cub'] },
    });
    settle(cast(g, 'early-winter', [], { mode: 1 }));
    settle(g.do(g.legal('p2')[0]!));
    expect(g.zoneOf(g.id('p2', 'lunar-convocation', 'exile'))).toBe('exile');
  });

  it('Cache Grab takes a Squirrel card and makes a Food', () => {
    const g = game({
      p1: {
        hand: ['cache-grab'],
        battlefield: n('forest', 2),
        library: ['forest', 'vinereap-mentor', 'island', 'island'],
      },
    });
    settle(cast(g, 'cache-grab'));
    const mentor = g
      .legal()
      .find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'vinereap-mentor')!;
    settle(g.do(mentor));
    expect(all(g, 'food-token')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Patchwork Banner pumps the chosen creature type', () => {
    const g = game({
      p1: {
        hand: ['patchwork-banner'],
        battlefield: [...n('plains', 3), 'bear-cub', 'savannah-lions'],
      },
    });
    settle(cast(g, 'patchwork-banner'));
    const bearIndex = (g.decision.kind === 'chooseOption' ? g.decision.options : []).findIndex(
      (o) => o.label === 'Bear',
    );
    settle(g.do({ type: 'chooseOption', player: 'p1', index: bearIndex }));
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});
