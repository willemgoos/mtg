import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  board,
  casts,
  done,
  exile,
  game,
  gy,
  hand,
  n,
  pt,
} from './ecl-special-helpers.ts';

// Lorwyn Eclipsed 18b: the five evoke Elemental Incarnations. Each enters with two triggers keyed to the mana spent
// ({W}{W}, {R}{R}, ...), and each can be evoked for its hybrid cost.

const NAMES = ['Catharsis', 'Deceit', 'Emptiness', 'Vibrance', 'Wistfulness'];

describe('the group is in the pool', () => {
  it('every card exists, with evoke', () => {
    for (const name of NAMES) {
      const id = name.toLowerCase();
      expect(cardDb.get(id), name).toBeDefined();
      expect(cardDb.get(id)!.evoke, name).toBeDefined();
    }
  });
});

describe('Catharsis', () => {
  it('{W}{W} spent: two 1/1 Kithkin; no haste pump', () => {
    const g = game({ p1: { hand: ['catharsis'], battlefield: [...n('forest', 4), 'plains', 'plains'] } });
    g.do(casts(g, 'catharsis').find((a) => !a.evoked)!);
    done(g);
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(2);
    expect(pt(g, board(g, 'ecl-kithkin-token')[0]!)).toEqual([1, 1]);
    expect(pt(g, g.id('p1', 'catharsis'))).toEqual([3, 4]);
  });

  it('{R}{R} spent: creatures you control get +1/+1 and haste until end of turn', () => {
    const g = game({
      p1: { hand: ['catharsis'], battlefield: [...n('forest', 4), 'mountain', 'mountain', 'ecl-kithkin-token'] },
    });
    g.do(casts(g, 'catharsis').find((a) => !a.evoked)!);
    done(g);
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(1);
    expect(pt(g, board(g, 'ecl-kithkin-token')[0]!)).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'catharsis'))).toEqual([4, 5]);
  });

  it('one of each: neither trigger', () => {
    const g = game({
      p1: { hand: ['catharsis'], battlefield: [...n('forest', 4), 'mountain', 'plains'] },
    });
    g.do(casts(g, 'catharsis').find((a) => !a.evoked)!);
    done(g);
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(0);
    expect(pt(g, g.id('p1', 'catharsis'))).toEqual([3, 4]);
  });

  it('evoked with {W}{W}: the Kithkin come, then it is sacrificed', () => {
    const g = game({ p1: { hand: ['catharsis'], battlefield: ['plains', 'plains'] } });
    const options = casts(g, 'catharsis');
    expect(options.every((a) => a.evoked)).toBe(true);
    g.do(options[0]!);
    done(g);
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(2);
    expect(board(g, 'catharsis')).toHaveLength(0);
    expect(gy(g)).toContain('catharsis');
  });
});

describe('Deceit', () => {
  it('{U}{U} spent: return up to one other target nonland permanent to its owner\'s hand', () => {
    const g = game({
      p1: { hand: ['deceit'], battlefield: [...n('forest', 4), 'island', 'island'] },
      p2: { battlefield: ['mountain', 'ecl-goblin-token'] },
    });
    g.do(casts(g, 'deceit').find((a) => !a.evoked)!);
    // The only nonland permanents are Deceit itself (not "other") and the Goblin token.
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId !== 'mountain') });
    expect(board(g, 'ecl-goblin-token')).toHaveLength(0);
    expect(board(g, 'deceit')).toHaveLength(1);
  });

  it("can't return itself or a land (only the Goblin is a legal target)", () => {
    const g = game({
      p1: { hand: ['deceit'], battlefield: [...n('forest', 4), 'island', 'island'] },
      p2: { battlefield: ['mountain', 'ecl-goblin-token'] },
    });
    g.do(casts(g, 'deceit').find((a) => !a.evoked)!);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const chosen = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : 'player'));
    expect(chosen).toEqual(['ecl-goblin-token']);
  });

  it('{B}{B} spent: target opponent reveals their hand, you choose a nonland card, they discard it', () => {
    const g = game({
      p1: { hand: ['deceit'], battlefield: [...n('forest', 4), 'swamp', 'swamp'] },
      p2: { hand: ['mountain', 'savannah-lions', 'mountain'] },
    });
    g.do(casts(g, 'deceit').find((a) => !a.evoked)!);
    done(g, { card: (id) => g.obj(id).defId === 'savannah-lions' });
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(hand(g, 'p2')).toEqual(['mountain', 'mountain']);
  });
});

describe('Emptiness', () => {
  it('{W}{W} spent: return target creature card with mana value 3 or less from your graveyard to the battlefield', () => {
    const g = game({
      p1: {
        hand: ['emptiness'],
        battlefield: [...n('forest', 4), 'plains', 'plains'],
        graveyard: ['savannah-lions', 'serra-angel'],
      },
    });
    g.do(casts(g, 'emptiness').find((a) => !a.evoked)!);
    done(g);
    expect(board(g, 'savannah-lions')).toHaveLength(1);
    expect(gy(g)).toEqual(['serra-angel']);
  });

  it('{B}{B} spent: three -1/-1 counters on up to one target creature', () => {
    const g = game({
      p1: { hand: ['emptiness'], battlefield: [...n('forest', 4), 'swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'emptiness').find((a) => !a.evoked)!);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'serra-angel') });
    const dread = board(g, 'serra-angel')[0]!;
    expect(g.obj(dread).counters?.['-1/-1']).toBe(3);
    expect(pt(g, dread)).toEqual([1, 1]);
  });
});

describe('Vibrance', () => {
  it('{R}{R} spent: 3 damage to any target', () => {
    const g = game({
      p1: { hand: ['vibrance'], battlefield: [...n('forest', 3), 'mountain', 'mountain'] },
    });
    g.do(casts(g, 'vibrance').find((a) => !a.evoked)!);
    done(g, { target: (a) => a.targets.some((t) => 'player' in t && t.player === 'p2') });
    expect(g.life('p2')).toBe(17);
  });

  it('{G}{G} spent: search for a land, reveal it, put it into your hand; gain 2 life', () => {
    const g = game({
      p1: {
        hand: ['vibrance'],
        battlefield: n('forest', 5),
        library: ['island', 'forest', 'forest', 'forest'],
      },
    });
    g.do(casts(g, 'vibrance').find((a) => !a.evoked)!);
    done(g, { card: (id) => g.obj(id).defId === 'island' });
    expect(hand(g)).toEqual(['island']);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Wistfulness', () => {
  it('{G}{G} spent: exile target artifact or enchantment an opponent controls', () => {
    const g = game({
      p1: { hand: ['wistfulness'], battlefield: n('forest', 5).concat(['forest']) },
      p2: { battlefield: ['springleaf-drum', 'serra-angel'] },
    });
    g.do(casts(g, 'wistfulness').find((a) => !a.evoked)!);
    done(g);
    expect(exile(g, 'p2')).toEqual(['springleaf-drum']);
    expect(board(g, 'serra-angel')).toHaveLength(1);
  });

  it('{U}{U} spent: draw two cards, then discard a card', () => {
    const g = game({
      p1: { hand: ['wistfulness'], battlefield: [...n('forest', 3), 'island', 'island', 'island'].slice(0, 5) },
    });
    // Three Forests and two Islands: {3}{G/U}{G/U} is paid with the Islands as the hybrid, UU spent.
    g.do(casts(g, 'wistfulness').find((a) => !a.evoked)!);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });

  it('evoked with {G}{G}: the enter trigger happens, then it is sacrificed', () => {
    const g = game({
      p1: { hand: ['wistfulness'], battlefield: ['forest', 'forest'] },
      p2: { battlefield: ['springleaf-drum'] },
    });
    g.do(casts(g, 'wistfulness').find((a) => a.evoked)!);
    done(g);
    expect(exile(g, 'p2')).toEqual(['springleaf-drum']);
    expect(board(g, 'wistfulness')).toHaveLength(0);
  });
});
