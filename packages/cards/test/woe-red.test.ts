import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { cardDb } from '../src/index.ts';
import { activations, chars, has, ids, resolve, toCombat } from './woe-red-helpers.ts';

// Wilds of Eldraine (23b): the red cards. Celebration and the other cards that need no new engine piece are here; see also
// woe-red-2.test.ts and woe-red-3.test.ts.

// ---------------------------------------------------------------------------
// Printed characteristics
// ---------------------------------------------------------------------------

describe('printed characteristics', () => {
  it('every card is in the pool, with its back face where it has an Adventure', () => {
    for (const [front, back] of [
      ['bellowing-bruiser', 'beat-a-path'],
      ['grabby-giant', 'thats-mine'],
      ['imodanes-recruiter', 'train-troops'],
      ['kellan-the-fae-blooded', 'birthright-boon'],
      ['minecart-daredevil', 'ride-the-rails'],
      ['picnic-ruiner', 'stolen-goodies'],
      ['ratcatcher-trainee', 'pest-problem'],
      ['scalding-viper', 'steam-clean'],
      ['two-headed-hunter', 'twice-the-rage'],
    ] as const) {
      const d = cardDb.get(front)!;
      expect(d.adventure, front).toBe(true);
      expect(d.back, front).toBe(back);
      expect(cardDb.get(back)?.subtypes, back).toContain('Adventure');
    }
  });

  it('the Rat token is a 1/1 black Rat that can not block, the Knight a 2/2 white one with vigilance', () => {
    const rat = cardDb.get('woe-rat-token')!;
    expect([rat.power, rat.toughness, rat.colors, rat.subtypes, rat.isToken]).toEqual([
      1,
      1,
      ['B'],
      ['Rat'],
      true,
    ]);
    expect(rat.abilities).toEqual([{ kind: 'static', effect: { kind: 'cantBlock' } }]);
    const knight = cardDb.get('woe-w-knight-token')!;
    expect([knight.power, knight.toughness, knight.colors, knight.keywords]).toEqual([
      2,
      2,
      ['W'],
      ['vigilance'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Celebration cards
// ---------------------------------------------------------------------------

describe('Belligerent of the Ball', () => {
  it('celebration: target creature you control gets +1/+0 and menace at the beginning of combat', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'harried-spearguard'],
        battlefield: ['belligerent-of-the-ball', ...n('mountain', 2)],
      },
    });
    cast(g, 'harried-spearguard');
    resolve(g);
    cast(g, 'harried-spearguard');
    resolve(g);
    toCombat(g);
    resolve(g, {
      pick: (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some(
              (t) => 'object' in t && t.object.id === ids(g, 'belligerent-of-the-ball')[0],
            ),
        ),
    });
    const ball = ids(g, 'belligerent-of-the-ball')[0]!;
    expect(pt(g, ball)).toEqual([4, 3]);
    expect(has(g, ball, 'menace')).toBe(true);
  });

  it('does nothing with only one nonland permanent entered', () => {
    const g = game({
      p1: { hand: ['harried-spearguard'], battlefield: ['belligerent-of-the-ball', 'mountain'] },
    });
    cast(g, 'harried-spearguard');
    resolve(g);
    toCombat(g);
    resolve(g);
    const ball = ids(g, 'belligerent-of-the-ball')[0]!;
    expect(pt(g, ball)).toEqual([3, 3]);
    expect(has(g, ball, 'menace')).toBe(false);
  });
});

describe('Bespoke Battlegarb', () => {
  it('gives +2/+0 and equips for {2}', () => {
    const g = game({
      p1: { battlefield: ['bespoke-battlegarb', 'harried-spearguard', ...n('mountain', 2)] },
    });
    const lions = ids(g, 'harried-spearguard')[0]!;
    const equip = activations(g, ids(g, 'bespoke-battlegarb')[0]!)[0]!;
    g.do({ ...equip, targets: [g.ref(lions)] });
    resolve(g);
    expect(pt(g, lions)).toEqual([3, 1]);
  });

  it('celebration: attaches to up to one target creature you control at the beginning of combat', () => {
    const g = game({
      p1: {
        hand: ['bespoke-battlegarb', 'harried-spearguard'],
        battlefield: n('mountain', 3),
      },
    });
    cast(g, 'bespoke-battlegarb');
    resolve(g);
    cast(g, 'harried-spearguard');
    resolve(g);
    toCombat(g);
    resolve(g);
    const garb = ids(g, 'bespoke-battlegarb')[0]!;
    const guard = ids(g, 'harried-spearguard')[0]!;
    expect(g.obj(garb).attachedTo).toBe(guard);
    expect(pt(g, guard)).toEqual([3, 1]);
  });

  it('the celebration trigger may choose no target', () => {
    const g = game({
      p1: {
        hand: ['bespoke-battlegarb', 'harried-spearguard'],
        battlefield: n('mountain', 3),
      },
    });
    cast(g, 'bespoke-battlegarb');
    resolve(g);
    cast(g, 'harried-spearguard');
    resolve(g);
    toCombat(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const none = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0);
    expect(none).toBeDefined();
    g.do(none!);
    resolve(g);
    expect(g.obj(ids(g, 'bespoke-battlegarb')[0]!).attachedTo).toBeUndefined();
  });
});

describe('Goddric, Cloaked Reveler', () => {
  it('is a 3/3 Human Noble with haste, and a 4/4 flying Dragon once two nonland permanents entered', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'redcap-thief'],
        battlefield: ['goddric-cloaked-reveler', ...n('mountain', 6)],
      },
    });
    const goddric = ids(g, 'goddric-cloaked-reveler')[0]!;
    expect(pt(g, goddric)).toEqual([3, 3]);
    expect(chars(g, goddric).subtypes).toEqual(['Human', 'Noble']);
    expect(has(g, goddric, 'haste')).toBe(true);
    expect(has(g, goddric, 'flying')).toBe(false);
    expect(activations(g, goddric)).toHaveLength(0);
    cast(g, 'harried-spearguard');
    resolve(g);
    // One nonland permanent so far.
    expect(pt(g, goddric)).toEqual([3, 3]);
    cast(g, 'redcap-thief');
    resolve(g);
    expect(pt(g, goddric)).toEqual([4, 4]);
    expect(chars(g, goddric).subtypes).toEqual(['Dragon']);
    expect(has(g, goddric, 'flying')).toBe(true);
    expect(has(g, goddric, 'haste')).toBe(true);
    expect(chars(g, goddric).types).toContain('Creature');
  });

  it('{R}: Dragons you control get +1/+0, and only Dragons', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'redcap-thief'],
        battlefield: [
          'goddric-cloaked-reveler',
          'realm-scorcher-hellkite',
          'edgewall-pack',
          ...n('mountain', 8),
        ],
      },
    });
    const goddric = ids(g, 'goddric-cloaked-reveler')[0]!;
    const hellkite = ids(g, 'realm-scorcher-hellkite')[0]!;
    const pack = ids(g, 'edgewall-pack')[0]!;
    cast(g, 'harried-spearguard');
    resolve(g);
    cast(g, 'redcap-thief');
    resolve(g);
    const pump = activations(g, goddric);
    expect(pump).toHaveLength(1);
    g.do(pump[0]!);
    resolve(g);
    expect(pt(g, goddric)).toEqual([5, 4]);
    expect(pt(g, hellkite)).toEqual([5, 6]);
    expect(pt(g, pack)).toEqual([3, 3]);
  });

  it('is a Human Noble again the next turn (the ability does not stay)', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'redcap-thief'],
        battlefield: ['goddric-cloaked-reveler', ...n('mountain', 6)],
      },
    });
    const goddric = ids(g, 'goddric-cloaked-reveler')[0]!;
    cast(g, 'harried-spearguard');
    resolve(g);
    cast(g, 'redcap-thief');
    resolve(g);
    expect(activations(g, goddric)).toHaveLength(1);
    for (let i = 0; i < 40 && g.state.turn.number < 4; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.actor });
      else resolve(g);
    }
    expect(g.state.turn.number).toBeGreaterThanOrEqual(4);
    expect(pt(g, goddric)).toEqual([3, 3]);
    expect(chars(g, goddric).subtypes).toEqual(['Human', 'Noble']);
    expect(activations(g, goddric)).toHaveLength(0);
  });
});

describe('Grand Ball Guest', () => {
  it('gets +1/+1 and trample once two nonland permanents entered', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'redcap-thief'],
        battlefield: ['grand-ball-guest', ...n('mountain', 5)],
      },
    });
    const guest = ids(g, 'grand-ball-guest')[0]!;
    expect(pt(g, guest)).toEqual([2, 2]);
    expect(has(g, guest, 'trample')).toBe(false);
    cast(g, 'harried-spearguard');
    resolve(g);
    expect(pt(g, guest)).toEqual([2, 2]);
    cast(g, 'redcap-thief');
    resolve(g);
    expect(pt(g, guest)).toEqual([3, 3]);
    expect(has(g, guest, 'trample')).toBe(true);
  });

  it('does not count lands', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'mountain'],
        battlefield: ['grand-ball-guest', 'mountain'],
      },
    });
    const guest = ids(g, 'grand-ball-guest')[0]!;
    cast(g, 'harried-spearguard');
    resolve(g);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    expect(pt(g, guest)).toEqual([2, 2]);
  });
});

describe('Raging Battle Mouse', () => {
  it('the second spell you cast each turn costs {1} less', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'redcap-thief'],
        battlefield: ['raging-battle-mouse', ...n('mountain', 3)],
      },
    });
    cast(g, 'harried-spearguard');
    resolve(g);
    // Redcap Thief costs {2}{R}: with the discount only two of the three lands are needed ({R} + {1} paid; one left over).
    cast(g, 'redcap-thief');
    resolve(g);
    expect(ids(g, 'redcap-thief')).toHaveLength(1);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'mountain'),
    ).toHaveLength(3);
  });

  it('the first spell costs full price', () => {
    const g = game({
      p1: { hand: ['redcap-thief'], battlefield: ['raging-battle-mouse', ...n('mountain', 2)] },
    });
    const card = g.id('p1', 'redcap-thief', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });

  it('celebration: target creature you control gets +1/+1 at the beginning of combat', () => {
    const g = game({
      p1: {
        hand: ['harried-spearguard', 'harried-spearguard'],
        battlefield: ['raging-battle-mouse', ...n('mountain', 2)],
      },
    });
    cast(g, 'harried-spearguard');
    resolve(g);
    cast(g, 'harried-spearguard');
    resolve(g);
    toCombat(g);
    resolve(g, {
      pick: (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some(
              (t) => 'object' in t && t.object.id === ids(g, 'raging-battle-mouse')[0],
            ),
        ),
    });
    expect(pt(g, ids(g, 'raging-battle-mouse')[0]!)).toEqual([3, 2]);
  });
});
