import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  board,
  casts,
  chars,
  choose,
  done,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the black cards, second half (hob-black.test.ts has the first).

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'hob-goblin-army-token';
const armies = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => board(g, ARMY, p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
function play(g: GameDriver, defId: string, pick: (a: Cast) => boolean = () => true): GameDriver {
  const a = casts(g, defId).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return done(g);
}
/** Passes to the declare-attackers decision and declares these attackers. */
function attackWith(g: GameDriver, ...ids: string[]): void {
  for (let i = 0; i < 30 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  g.attack(...ids);
  done(g);
}

describe('Gnashing of Teeth', () => {
  it('-5/-5 exiles a creature that would die this turn', () => {
    const g = game({
      p1: { hand: ['gnashing-of-teeth'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const b = g.id('p2', 'rumbling-baloth');
    play(g, 'gnashing-of-teeth', (a) => a.mode === 0 && targeting(b)(a));
    expect(exile(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(gy(g, 'p2')).toEqual([]);
  });

  it("-1/-1 to creatures target player controls (not the other player's)", () => {
    const g = game({
      p1: { hand: ['gnashing-of-teeth'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves', 'rumbling-baloth'] },
    });
    play(g, 'gnashing-of-teeth', (a) => a.mode === 1 && targetingPlayer('p2')(a));
    expect(gy(g, 'p2').sort()).toEqual(['llanowar-elves', 'savannah-lions']);
    expect(pt(g, g.id('p2', 'rumbling-baloth'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('Gollum the Abandoned', () => {
  it('enters: exiles a card from an opponent graveyard and each opponent loses 2 life', () => {
    const g = game({
      p1: { hand: ['gollum-the-abandoned'], battlefield: n('swamp', 2) },
      p2: { graveyard: ['shock', 'savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions', 'graveyard');
    g.do(casts(g, 'gollum-the-abandoned')[0]!);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === lions) });
    expect(exile(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.life('p2')).toBe(18);
  });

  it("can't block", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['gollum-the-abandoned', 'llanowar-elves'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    for (let i = 0; i < 30 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(g.id('p2', 'savannah-lions'));
    while (g.decision.kind === 'priority') g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    const blocks = g.legal('p1').filter((a) => a.type === 'addBlock');
    const blockers = blocks.map((a) => (a as Extract<Action, { type: 'addBlock' }>).blocker);
    expect(blockers).toContain(g.id('p1', 'llanowar-elves'));
    expect(blockers).not.toContain(g.id('p1', 'gollum-the-abandoned'));
  });

  it('{2}, sacrifice an artifact or creature: return it from the graveyard to your hand, as a sorcery', () => {
    const g = game({
      p1: {
        graveyard: ['gollum-the-abandoned'],
        battlefield: [...n('swamp', 2), 'savannah-lions'],
      },
    });
    const gollum = g.id('p1', 'gollum-the-abandoned', 'graveyard');
    const acts = abilityActions(g, gollum, 2);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(hand(g)).toEqual(['gollum-the-abandoned']);
    expect(gy(g)).toEqual(['savannah-lions']);
  });
});

describe('Gollum, Riddle Master', () => {
  it('as it enters you choose odd or even', () => {
    const g = game({ p1: { hand: ['gollum-riddle-master'], battlefield: n('swamp', 2) } });
    g.do(casts(g, 'gollum-riddle-master')[0]!);
    stop(g);
    expect(labels(g)).toEqual(['Odd', 'Even']);
    choose(g, /Even/);
    done(g);
    expect(g.obj(g.id('p1', 'gollum-riddle-master')).chosenType).toBe('even');
  });

  /** Gollum (odd chosen) is out; p2 casts spells in its own main phase. */
  const oddGame = () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['gollum-riddle-master'], library: n('swamp', 10) },
      p2: {
        hand: ['shock', 'vampire-interloper', 'soul-guide-lantern', 'expedition-map'],
        battlefield: [...n('mountain', 6), ...n('swamp', 2)],
      },
    });
    g.obj(g.id('p1', 'gollum-riddle-master')).chosenType = 'odd';
    return g;
  };

  /** The modes the trigger offers (it is p1's choice as the trigger goes on the stack), by index. */
  const modesOffered = (g: GameDriver) =>
    g
      .legal('p1')
      .flatMap((x) => (x.type === 'chooseTargets' && x.mode !== undefined ? [x.mode] : []));
  const pickMode = (g: GameDriver, mode: number) => {
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal('p1').find((x) => x.type === 'chooseTargets' && x.mode === mode)!);
    done(g);
  };

  it('whenever an opponent casts a spell of the chosen quality, choose a mode that has not been chosen', () => {
    const g = oddGame();
    const gollum = g.id('p1', 'gollum-riddle-master');
    // Vampire Interloper has mana value 2 (even): no trigger.
    g.do(casts(g, 'vampire-interloper', 'p2')[0]!);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.pendingTriggers).toHaveLength(0);
    done(g);
    // Shock (mana value 1, odd): the trigger, all three modes offered. First mode: a +1/+1 counter.
    g.do(casts(g, 'shock', 'p2').find(targetingPlayer('p1'))!);
    expect(modesOffered(g)).toEqual([0, 1, 2]);
    pickMode(g, 0);
    expect(plus(g, gollum)).toBe(1);
    expect(g.life('p1')).toBe(18);
    // Soul-Guide Lantern (mana value 1): the counter mode is gone. Each opponent loses 2 life and you gain 2.
    g.do(casts(g, 'soul-guide-lantern', 'p2')[0]!);
    expect(modesOffered(g)).toEqual([1, 2]);
    pickMode(g, 1);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(18);
    // Expedition Map (mana value 1): the last mode, draw a card.
    const before = hand(g).length;
    g.do(casts(g, 'expedition-map', 'p2')[0]!);
    expect(modesOffered(g)).toEqual([2]);
    pickMode(g, 2);
    expect(hand(g).length).toBe(before + 1);
  });

  it('a fourth spell of the chosen quality does nothing: every mode was chosen', () => {
    const g = oddGame();
    const gollum = g.id('p1', 'gollum-riddle-master');
    g.obj(gollum).usedModes = [0, 1, 2];
    g.do(casts(g, 'soul-guide-lantern', 'p2')[0]!);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack.filter((x) => x.kind === 'ability')).toHaveLength(0);
  });
});

describe('Gollum, Silent Slinker and Meager Meal', () => {
  it('Meager Meal: a +1/+1 counter on up to one creature and 2 life for a player, then Gollum is cast from exile', () => {
    const g = game({
      p1: { hand: ['gollum-silent-slinker'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const meal = casts(g, 'gollum-silent-slinker').find(
      (a) => a.back && targeting(lions)(a) && targetingPlayer('p1')(a),
    );
    expect(meal).toBeDefined();
    g.do(meal!);
    done(g);
    expect(plus(g, lions)).toBe(1);
    expect(g.life('p1')).toBe(22);
    expect(exile(g)).toEqual(['gollum-silent-slinker']);
    // Cast the creature from exile: 4/3 menace.
    const again = g.legal('p1').find((a) => a.type === 'castSpell' && !a.back);
    expect(again).toBeDefined();
    g.do(again!);
    done(g);
    const slinker = g.id('p1', 'gollum-silent-slinker');
    expect(pt(g, slinker)).toEqual([4, 3]);
    expect(kw(g, slinker).has('menace')).toBe(true);
  });
});

describe('Great Fierce Bee', () => {
  it('scries 1 once for one or more other creatures dying together', () => {
    const g = game({
      p1: { hand: ['gnashing-of-teeth'], battlefield: [...n('swamp', 3), 'great-fierce-bee'] },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
    g.do(casts(g, 'gnashing-of-teeth').find((a) => a.mode === 1 && targetingPlayer('p2')(a))!);
    let scries = 0;
    for (let i = 0; i < 40; i++) {
      if (g.decision.kind === 'scry') {
        scries++;
        g.do(g.legal().find((a) => a.type === 'scry')!);
      } else if (g.decision.kind === 'priority' && g.state.stack.length) g.pass();
      else if (g.decision.kind !== 'priority') done(g);
      else break;
    }
    expect(gy(g, 'p2')).toHaveLength(2);
    expect(scries).toBe(1);
  });

  it('does not scry when the Bee itself dies', () => {
    const g = game({
      p1: { hand: ['bilbos-deadly-slice'], battlefield: [...n('swamp', 3), 'great-fierce-bee'] },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'great-fierce-bee')));
    expect(g.decision.kind).toBe('priority');
    expect(gy(g)).toContain('great-fierce-bee');
  });
});

describe('Great Ugly-Looking Goblin and Clap! Snap!', () => {
  it('creatures you control with a +1/+1 counter have menace', () => {
    const g = game({
      p1: { battlefield: ['great-ugly-looking-goblin', 'savannah-lions', 'llanowar-elves'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(kw(g, lions).has('menace')).toBe(false);
    g.obj(lions).plusOneCounters = 1;
    expect(kw(g, lions).has('menace')).toBe(true);
    expect(kw(g, g.id('p1', 'llanowar-elves')).has('menace')).toBe(false);
    expect(kw(g, g.id('p1', 'great-ugly-looking-goblin')).has('menace')).toBe(false);
  });

  it('Clap! Snap! amasses Goblins 2, then the Goblin can be cast from exile', () => {
    const g = game({
      p1: { hand: ['great-ugly-looking-goblin'], battlefield: n('swamp', 8) },
    });
    const clap = casts(g, 'great-ugly-looking-goblin').find((a) => a.back);
    expect(clap).toBeDefined();
    g.do(clap!);
    done(g);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(2);
    expect(exile(g)).toEqual(['great-ugly-looking-goblin']);
    // Its menace-granting makes the Army menace once the Goblin is out.
    const again = g.legal('p1').find((a) => a.type === 'castSpell' && !a.back);
    g.do(again!);
    done(g);
    expect(kw(g, armies(g)[0]!).has('menace')).toBe(true);
  });
});

describe('Head of the Hunt', () => {
  it('a creature an opponent controls that would die is exiled, and you create a 2/2 Wolf; yours dies as usual', () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice', 'bilbos-deadly-slice'],
        battlefield: [...n('swamp', 6), 'head-of-the-hunt', 'savannah-lions'],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p2', 'rumbling-baloth')));
    expect(exile(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(gy(g, 'p2')).toEqual([]);
    const wolves = board(g, 'hob-wolf-token', 'p1');
    expect(wolves).toHaveLength(1);
    expect(pt(g, wolves[0]!)).toEqual([2, 2]);
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'savannah-lions')));
    expect(gy(g, 'p1')).toContain('savannah-lions');
    expect(board(g, 'hob-wolf-token', 'p1')).toHaveLength(1);
  });
});

describe('Inside Information', () => {
  const setup = () =>
    game({
      p1: { hand: ['inside-information'], battlefield: n('swamp', 4) },
      p2: { library: ['shock', 'plains', 'savannah-lions', 'forest'] },
    });
  const x2 = (a: Cast) => a.x === 2 && targetingPlayer('p2')(a);

  it('exiles the top X cards of the opponent library; you may play them this turn, paying life for spells', () => {
    const g = setup();
    play(g, 'inside-information', x2);
    expect(exile(g, 'p2')).toEqual(['shock', 'plains']);
    expect(g.state.players.p2.library).toHaveLength(2);
    // The land can be played.
    const land = g.legal('p1').find((a) => a.type === 'playLand');
    expect(land).toBeDefined();
    // Shock: pay 1 life (its mana value) instead of {R}: no mana needed.
    const life = g.life('p1');
    const shock = g
      .legal('p1')
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p2', 'shock', 'exile') &&
          targetingPlayer('p2')(a),
      ) as Cast | undefined;
    expect(shock).toBeDefined();
    g.do(shock!);
    done(g);
    expect(g.life('p1')).toBe(life - 1);
    expect(g.life('p2')).toBe(18);
    expect(gy(g, 'p2')).toContain('shock');
  });

  it('plays an exiled land for free, and the permission ends with the turn', () => {
    const g = setup();
    play(g, 'inside-information', x2);
    g.do(g.legal('p1').find((a) => a.type === 'playLand')!);
    expect(board(g, 'plains', 'p1')).toHaveLength(1);
    const other = g.legal('p1').filter((a) => a.type === 'castSpell');
    expect(other.length).toBeGreaterThan(0);
    // Next turn nothing in exile can be cast any more.
    for (
      let i = 0;
      i < 400 &&
      !(
        g.state.turn.number > 3 &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.step === 'main1' &&
        g.decision.kind === 'priority'
      );
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.legal('p1').filter((a) => a.type === 'castSpell')).toHaveLength(0);
  });

  it('X = 0 exiles nothing', () => {
    const g = setup();
    play(g, 'inside-information', (a) => a.x === 0);
    expect(exile(g, 'p2')).toEqual([]);
  });
});

describe('Nighthowl Pursuer and Ravening Warg (Ferocious)', () => {
  it('Nighthowl Pursuer gets +2/+2 when it attacks while you control a creature with power 4 or greater', () => {
    for (const [big, expected] of [
      [false, [1, 1]],
      [true, [3, 3]],
    ] as const) {
      const g = game({
        p1: { battlefield: big ? ['nighthowl-pursuer', 'rumbling-baloth'] : ['nighthowl-pursuer'] },
        p2: { battlefield: [] },
      });
      const id = g.id('p1', 'nighthowl-pursuer');
      attackWith(g, id);
      expect(pt(g, id)).toEqual(expected);
    }
  });

  it('Ravening Warg gains you 2 life with a creature with power 4 or greater', () => {
    for (const [big, expected] of [
      [false, 20],
      [true, 22],
    ] as const) {
      const g = game({
        p1: { battlefield: big ? ['ravening-warg', 'rumbling-baloth'] : ['ravening-warg'] },
      });
      attackWith(g, g.id('p1', 'ravening-warg'));
      expect(g.life('p1')).toBe(expected);
    }
  });
});

describe('Rage into the Valley and Reverent Howl', () => {
  it('Rage into the Valley: draw a card, lose 1 life, amass Goblins 2', () => {
    const g = game({
      p1: { hand: ['rage-into-the-valley'], battlefield: n('swamp', 3), library: n('swamp', 5) },
    });
    play(g, 'rage-into-the-valley');
    expect(hand(g)).toEqual(['swamp']);
    expect(g.life('p1')).toBe(19);
    expect(plus(g, armies(g)[0]!)).toBe(2);
  });

  it('Reverent Howl: target player draws two and loses 2, or a creature gets +2/+2 and lifelink', () => {
    const a = game({
      p1: { hand: ['reverent-howl'], battlefield: n('swamp', 3), library: n('swamp', 5) },
    });
    play(a, 'reverent-howl', (c) => c.mode === 0 && targetingPlayer('p1')(c));
    expect(hand(a)).toEqual(['swamp', 'swamp']);
    expect(a.life('p1')).toBe(18);
    const b = game({
      p1: { hand: ['reverent-howl'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });
    const lions = b.id('p1', 'savannah-lions');
    play(b, 'reverent-howl', (c) => c.mode === 1 && targeting(lions)(c));
    expect(pt(b, lions)).toEqual([4, 3]);
    expect(kw(b, lions).has('lifelink')).toBe(true);
  });
});

describe('Rhovanion Rampager', () => {
  it('attacking, you may sacrifice another creature for +1/+1 counters equal to its power', () => {
    const g = game({
      p1: { battlefield: ['rhovanion-rampager', 'rumbling-baloth'] },
    });
    const r = g.id('p1', 'rhovanion-rampager');
    attackWith(g, r);
    expect(gy(g)).toEqual(['rumbling-baloth']);
    expect(plus(g, r)).toBe(4);
    expect(pt(g, r)).toEqual([7, 6]);
  });

  it('you may decline the sacrifice', () => {
    const g = game({ p1: { battlefield: ['rhovanion-rampager', 'savannah-lions'] } });
    const r = g.id('p1', 'rhovanion-rampager');
    for (let i = 0; i < 30 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(r);
    done(g, { accept: false });
    expect(plus(g, r)).toBe(0);
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(1);
  });

  it('when it dies, amass Goblins X where X is its power', () => {
    const g = game({
      p1: { hand: ['bilbos-deadly-slice'], battlefield: [...n('swamp', 3), 'rhovanion-rampager'] },
    });
    g.obj(g.id('p1', 'rhovanion-rampager')).plusOneCounters = 2;
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'rhovanion-rampager')));
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(5);
  });
});

describe('Supper for Spiders', () => {
  it('returns the creature cards that went to opponent graveyards this turn, as Food artifacts', () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice', 'supper-for-spiders'],
        battlefield: [...n('swamp', 7), 'savannah-lions'],
      },
      p2: { battlefield: ['rumbling-baloth', 'llanowar-elves'], graveyard: ['vampire-interloper'] },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p2', 'rumbling-baloth')));
    play(g, 'supper-for-spiders');
    // Only the Baloth died this turn; the Interloper was already in the graveyard.
    expect(gy(g, 'p2')).toEqual(['vampire-interloper']);
    const baloth = g.id('p1', 'rumbling-baloth');
    const c = chars(g, baloth);
    expect(c.types).toEqual(['Artifact']);
    expect(c.subtypes).toEqual(['Food']);
    expect(g.obj(baloth).controller).toBe('p1');
    expect(g.state.battlefield).toContain(baloth);
    // It is no creature that entered.
    expect((g.state.turn.creaturesEntered ?? []).map((x) => x.id)).not.toContain(baloth);
    expect(board(g, 'llanowar-elves', 'p2')).toHaveLength(1);
  });

  it("the Food has '{2}, {T}, Sacrifice: gain 3 life' and does not die as a creature", () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice', 'supper-for-spiders'],
        battlefield: [...n('swamp', 10)],
      },
      p2: { battlefield: ['front-porch-sentries'], graveyard: [] },
    });
    // p2's creature dies; p1 takes it. Front Porch Sentries' "dies" must not trigger once it is a Food.
    play(g, 'bilbos-deadly-slice', targeting(g.id('p2', 'front-porch-sentries')));
    play(g, 'supper-for-spiders');
    const food = g.id('p1', 'front-porch-sentries');
    g.obj(food).summoningSick = false;
    const acts = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === food);
    expect(acts.length).toBeGreaterThan(0);
    const life = g.life('p1');
    g.do(acts[acts.length - 1]!);
    done(g);
    expect(g.life('p1')).toBe(life + 3);
    expect(g.zoneOf(food)).toBe('graveyard');
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
  });

  it('tokens are not returned', () => {
    const g = game({
      p1: { hand: ['bilbos-deadly-slice', 'supper-for-spiders'], battlefield: n('swamp', 5) },
      p2: { battlefield: [ARMY] },
    });
    const army = g.id('p2', ARMY);
    g.state.objects[army]!.isToken = true;
    play(g, 'bilbos-deadly-slice', targeting(army));
    play(g, 'supper-for-spiders');
    expect(board(g, ARMY)).toHaveLength(0);
    expect(board(g, ARMY, 'p2')).toHaveLength(0);
  });
});

describe('The Master of Lake-town', () => {
  it('whenever a player loses life, that player mills that many cards', () => {
    const g = game({
      p1: {
        hand: ['rage-into-the-valley', 'shock'],
        battlefield: [...n('swamp', 3), 'the-master-of-lake-town'],
        library: n('swamp', 10),
      },
      p2: { library: n('forest', 10) },
    });
    play(g, 'rage-into-the-valley');
    // p1 lost 1 life: mills 1 (after drawing 1).
    expect(g.state.players.p1.library).toHaveLength(8);
    const mountains = game({
      p1: { hand: ['shock'], battlefield: ['mountain', 'the-master-of-lake-town'] },
      p2: { library: n('forest', 10) },
    });
    play(mountains, 'shock', targetingPlayer('p2'));
    expect(mountains.life('p2')).toBe(18);
    expect(mountains.state.players.p2.library).toHaveLength(8);
    expect(gy(mountains, 'p2')).toEqual(['forest', 'forest']);
  });

  it('when it dies, draw a card for each graveyard with seven or more cards', () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice'],
        battlefield: [...n('swamp', 3), 'the-master-of-lake-town'],
        graveyard: n('swamp', 5),
        library: n('swamp', 10),
      },
      p2: { graveyard: n('forest', 7) },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'the-master-of-lake-town')));
    // p1: 5 + the Slice + the Master = 7; p2: 7. Draw two.
    expect(hand(g)).toHaveLength(2);
  });

  it('draws nothing when no graveyard has seven cards', () => {
    const g = game({
      p1: {
        hand: ['bilbos-deadly-slice'],
        battlefield: [...n('swamp', 3), 'the-master-of-lake-town'],
      },
    });
    play(g, 'bilbos-deadly-slice', targeting(g.id('p1', 'the-master-of-lake-town')));
    expect(hand(g)).toHaveLength(0);
  });
});

describe('The Sackville-Bagginses', () => {
  it('enters: you may sacrifice another creature or artifact to draw a card and create a Treasure', () => {
    const g = game({
      p1: {
        hand: ['the-sackville-bagginses'],
        battlefield: [...n('swamp', 2), 'savannah-lions'],
        library: n('swamp', 5),
      },
    });
    g.do(casts(g, 'the-sackville-bagginses')[0]!);
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(hand(g)).toEqual(['swamp']);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
  });

  it('you may decline', () => {
    const g = game({
      p1: { hand: ['the-sackville-bagginses'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    g.do(casts(g, 'the-sackville-bagginses')[0]!);
    done(g, { accept: false });
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });

  it('whenever you sacrifice a token, target opponent loses 1 life (a Treasure counts)', () => {
    const g = game({
      p1: { battlefield: ['the-sackville-bagginses', 'food-token', 'swamp', 'swamp'] },
    });
    const t = g.id('p1', 'food-token');
    g.state.objects[t]!.isToken = true;
    const sac = g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === t);
    expect(sac).toBeDefined();
    g.do(sac!);
    done(g);
    expect(g.life('p2')).toBe(19);
  });

  it('a nontoken sacrifice does not trigger it', () => {
    const g = game({
      p1: {
        hand: ['stir-up-trouble'],
        battlefield: ['the-sackville-bagginses', 'savannah-lions', 'swamp'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const a = casts(g, 'stir-up-trouble').find((x) => x.sacrifice === g.id('p1', 'savannah-lions'));
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(g.life('p2')).toBe(20);
  });
});
