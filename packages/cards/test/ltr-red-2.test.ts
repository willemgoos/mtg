import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activate, hand, passTo, toEndStep, tokens } from './ecl-red-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Lord of the Rings 21b: the red cards (part two: creatures).

type G = ReturnType<typeof game>;
const ARMY = 'ltr-orc-army-token';
const SOLDIER = 'hob-human-soldier-token';
const GRISHNAKH = slug('Grishnákh, Brash Instigator');
const EOMER = slug('Éomer of the Riddermark');
const ERKENBRAND = 'erkenbrand-lord-of-westfold';
const bf = (g: G, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);
const kw = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const lands = (count: number) => n('mountain', count);
const one = (g: G, def: string, p: 'p1' | 'p2' = 'p1') => bf(g, def, p)[0]!;

/** Moves to the declare attackers decision and attacks the opponent with these creatures. */
function attack(g: G, attackers: string[]): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
}

/** Passes until the defending player is asked to declare blockers. */
function toBlocks(g: G): void {
  for (let i = 0; i < 12 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareBlockers');
}

/** The targets a trigger's controller may choose between (one chooseTargets action each). */
const triggerTargets = (g: G): string[] =>
  g
    .legal()
    .filter((a): a is Extract<Action, { type: 'chooseTargets' }> => a.type === 'chooseTargets')
    .flatMap((a) => a.targets.map((t) => ('object' in t ? t.object.id : t.player)));

describe('Erkenbrand, Lord of Westfold', () => {
  it('whenever it or another Human you control enters, creatures you control get +1/+0 until end of turn', () => {
    const g = game({
      p1: { hand: ['rally-at-the-hornburg'], battlefield: [...lands(2), ERKENBRAND] },
    });
    cast(g, 'rally-at-the-hornburg');
    settle(g);
    // Two Human Soldier tokens entered: two triggers, each pumping everything you control.
    expect(pt(g, one(g, ERKENBRAND))).toEqual([5, 3]);
    for (const id of tokens(g, SOLDIER)) expect(pt(g, id)).toEqual([3, 1]);
  });

  it('triggers when Erkenbrand itself enters', () => {
    const g = game({
      p1: { hand: [ERKENBRAND], battlefield: [...lands(4), 'llanowar-elves'] },
    });
    cast(g, ERKENBRAND);
    settle(g);
    expect(pt(g, one(g, 'llanowar-elves'))).toEqual([2, 1]);
    expect(pt(g, one(g, ERKENBRAND))).toEqual([4, 3]);
  });

  it("doesn't trigger for a non-Human or for an opponent's Human", () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['forest', ERKENBRAND] },
      p2: { hand: ['rally-at-the-hornburg'], battlefield: lands(2) },
      active: 'p1',
    });
    cast(g, 'llanowar-elves');
    settle(g);
    expect(pt(g, one(g, ERKENBRAND))).toEqual([3, 3]);
  });
});

describe('Gimli, Counter of Kills', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['shock'],
        battlefield: [...lands(1), 'gimli-counter-of-kills', 'llanowar-elves'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });

  it('has trample', () => {
    const g = setup();
    expect(kw(g, one(g, 'gimli-counter-of-kills')).has('trample')).toBe(true);
  });

  it('deals 1 damage to the controller of a creature an opponent controls that dies', () => {
    const g = setup();
    cast(g, 'shock', [g.ref(one(g, 'llanowar-elves', 'p2'))]);
    settle(g);
    expect(bf(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(20);
  });

  it("doesn't trigger when your own creature dies", () => {
    const g = setup();
    cast(g, 'shock', [g.ref(one(g, 'llanowar-elves'))]);
    settle(g);
    expect(bf(g, 'llanowar-elves')).toHaveLength(0);
    expect(g.life('p2')).toBe(20);
    expect(g.life('p1')).toBe(20);
  });
});

describe('Goblin Fireleaper', () => {
  it('{1}{R}: gets +1/+0 until end of turn', () => {
    const g = game({ p1: { battlefield: [...lands(2), 'goblin-fireleaper'] } });
    const goblin = one(g, 'goblin-fireleaper');
    activate(g, goblin, 0);
    settle(g);
    expect(pt(g, goblin)).toEqual([2, 1]);
  });

  it('when it dies, it deals damage equal to its power to target creature an opponent controls', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [...lands(3), 'goblin-fireleaper', 'llanowar-elves'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const goblin = one(g, 'goblin-fireleaper');
    activate(g, goblin, 0);
    settle(g);
    cast(g, 'shock', [g.ref(goblin)]);
    settle(g);
    expect(bf(g, 'goblin-fireleaper')).toHaveLength(0);
    // Its power as it died (2), dealt to the only creature an opponent controls.
    expect(g.obj(one(g, 'serra-angel', 'p2')).damage).toBe(2);
    expect(g.obj(one(g, 'llanowar-elves')).damage).toBe(0);
  });

  it('with its base power, 1 damage', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [...lands(1), 'goblin-fireleaper'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'shock', [g.ref(one(g, 'goblin-fireleaper'))]);
    settle(g);
    expect(g.obj(one(g, 'serra-angel', 'p2')).damage).toBe(1);
  });
});

describe('Battle-Scarred Goblin', () => {
  it('whenever it becomes blocked, it deals 1 damage to each creature blocking it', () => {
    const g = game({
      p1: { battlefield: ['battle-scarred-goblin'] },
      p2: { battlefield: ['llanowar-elves', 'llanowar-elves', 'serra-angel'] },
    });
    const goblin = one(g, 'battle-scarred-goblin');
    attack(g, [goblin]);
    toBlocks(g);
    const [elf1, elf2] = bf(g, 'llanowar-elves', 'p2');
    const angel = one(g, 'serra-angel', 'p2');
    g.do({ type: 'addBlock', player: 'p2', blocker: elf1!, attacker: goblin });
    g.do({ type: 'addBlock', player: 'p2', blocker: elf2!, attacker: goblin });
    g.do({ type: 'addBlock', player: 'p2', blocker: angel, attacker: goblin });
    g.do({ type: 'confirmBlockers', player: 'p2' });
    settle(g);
    // The two Elves took 1 and died; the Angel took 1 and lives.
    expect(bf(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(g.obj(angel).damage).toBeGreaterThanOrEqual(1);
  });

  it("doesn't trigger when it isn't blocked", () => {
    const g = game({
      p1: { battlefield: ['battle-scarred-goblin'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    attack(g, [one(g, 'battle-scarred-goblin')]);
    toBlocks(g);
    g.do({ type: 'confirmBlockers', player: 'p2' });
    settle(g);
    expect(bf(g, 'llanowar-elves', 'p2')).toHaveLength(1);
    expect(g.obj(one(g, 'llanowar-elves', 'p2')).damage).toBe(0);
  });
});

describe('Haradrim Spearmaster', () => {
  it('has reach; at the beginning of combat another target creature you control gets +1/+0', () => {
    const g = game({
      p1: { battlefield: ['haradrim-spearmaster', 'llanowar-elves'] },
    });
    expect(kw(g, one(g, 'haradrim-spearmaster')).has('reach')).toBe(true);
    for (let i = 0; i < 12 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    // Another creature: not itself.
    expect(triggerTargets(g)).toEqual([one(g, 'llanowar-elves')]);
    settle(g);
    expect(pt(g, one(g, 'llanowar-elves'))).toEqual([2, 1]);
    expect(pt(g, one(g, 'haradrim-spearmaster'))).toEqual([2, 3]);
  });

  it('does nothing when it is the only creature', () => {
    const g = game({ p1: { battlefield: ['haradrim-spearmaster'] } });
    g.passUntilStep('beginCombat');
    expect(g.state.stack).toHaveLength(0);
    expect(pt(g, one(g, 'haradrim-spearmaster'))).toEqual([2, 3]);
  });
});

describe('Grishnákh, Brash Instigator', () => {
  const setup = (extra: string[] = []) =>
    game({
      p1: { hand: [GRISHNAKH], battlefield: lands(3) },
      p2: { battlefield: ['llanowar-elves', 'serra-angel', GRISHNAKH, ...extra] },
    });

  it("amasses Orcs 2, then steals a nonlegendary creature with power at most the Army's until end of turn", () => {
    const g = setup(['battle-scarred-goblin']);
    // Tapped, with a power of 1: legal.
    g.obj(one(g, 'llanowar-elves', 'p2')).tapped = true;
    cast(g, GRISHNAKH);
    g.pass(); // Grishnákh resolves; its trigger waits for an Army and a target
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(pt(g, one(g, ARMY))).toEqual([2, 2]);
    // Power at most 2, nonlegendary: the Elf (1) and the 2/2 Goblin; not the 4/4 Angel, not the legendary Grishnákh.
    expect(triggerTargets(g).sort()).toEqual(
      [one(g, 'llanowar-elves', 'p2'), one(g, 'battle-scarred-goblin', 'p2')].sort(),
    );
    const elf = one(g, 'llanowar-elves', 'p2');
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(elf)],
    });
    settle(g);
    expect(g.obj(elf).controller).toBe('p1');
    expect(g.obj(elf).tapped).toBe(false);
    expect(kw(g, elf).has('haste')).toBe(true);
    // Until end of turn.
    passTo(g, 'upkeep', 'p2');
    expect(g.obj(elf).controller).toBe('p2');
  });

  it("uses the whole Army's power when it was already bigger", () => {
    // An existing 2/2 Army gets two more counters: a 4/4, so the Angel is a legal target.
    const g = game({
      p1: { hand: [GRISHNAKH], battlefield: [...lands(3), ARMY] },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    g.obj(one(g, ARMY)).plusOneCounters = 2;
    cast(g, GRISHNAKH);
    g.pass();
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(pt(g, one(g, ARMY))).toEqual([4, 4]);
    expect(triggerTargets(g)).toContain(one(g, 'serra-angel', 'p2'));
  });

  it('gains nothing when every creature is too strong or legendary', () => {
    const g = game({
      p1: { hand: [GRISHNAKH], battlefield: lands(3) },
      p2: { battlefield: ['serra-angel', GRISHNAKH] },
    });
    cast(g, GRISHNAKH);
    settle(g);
    expect(pt(g, one(g, ARMY))).toEqual([2, 2]);
    expect(bf(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(bf(g, GRISHNAKH, 'p2')).toHaveLength(1);
  });
});

describe('Olog-hai Crusher', () => {
  it("has trample and can't block unless you control a Goblin or Orc", () => {
    const g = game({ p1: { battlefield: ['olog-hai-crusher'] } });
    const crusher = one(g, 'olog-hai-crusher');
    expect(kw(g, crusher).has('trample')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, crusher).cantBlock).toBe(true);
    for (const helper of ['goblin-fireleaper', ARMY]) {
      const h = game({ p1: { battlefield: ['olog-hai-crusher', helper] } });
      if (helper === ARMY) h.obj(one(h, ARMY)).plusOneCounters = 1;
      expect(getCharacteristics(h.state, cardDb, one(h, 'olog-hai-crusher')).cantBlock).toBe(false);
    }
    // A Goblin the opponent controls doesn't help.
    const o = game({
      p1: { battlefield: ['olog-hai-crusher'] },
      p2: { battlefield: ['goblin-fireleaper'] },
    });
    expect(getCharacteristics(o.state, cardDb, one(o, 'olog-hai-crusher')).cantBlock).toBe(true);
  });

  it('is not offered as a blocker without a Goblin or Orc, and is with one', () => {
    for (const [extra, blocks] of [
      [[] as string[], false],
      [['goblin-fireleaper'], true],
    ] as const) {
      const g = game({
        p1: { battlefield: ['llanowar-elves'] },
        p2: { battlefield: ['olog-hai-crusher', ...extra] },
      });
      const elf = one(g, 'llanowar-elves');
      attack(g, [elf]);
      // Without a creature able to block there is no declare blockers decision at all.
      for (
        let i = 0;
        i < 12 && g.decision.kind !== 'declareBlockers' && g.state.turn.step !== 'main2';
        i++
      )
        g.pass();
      const crusher = one(g, 'olog-hai-crusher', 'p2');
      const can =
        g.decision.kind === 'declareBlockers' &&
        g.legal().some((a) => a.type === 'addBlock' && a.blocker === crusher && a.attacker === elf);
      expect(can).toBe(blocks);
    }
  });
});

describe('Riders of the Mark', () => {
  it('costs {1} less for each Human you control', () => {
    const none = game({
      p1: { hand: ['riders-of-the-mark'], battlefield: lands(4) },
    });
    expect(
      none
        .legal()
        .some(
          (a) => a.type === 'castSpell' && a.card === none.id('p1', 'riders-of-the-mark', 'hand'),
        ),
    ).toBe(false);
    const three = game({
      p1: {
        hand: ['riders-of-the-mark'],
        battlefield: [...lands(4), SOLDIER, SOLDIER, ERKENBRAND],
      },
    });
    expect(
      three
        .legal()
        .some(
          (a) => a.type === 'castSpell' && a.card === three.id('p1', 'riders-of-the-mark', 'hand'),
        ),
    ).toBe(true);
  });

  it('has trample and haste; after attacking it returns to hand at your end step and makes Soldiers equal to its toughness', () => {
    const g = game({ p1: { battlefield: ['riders-of-the-mark'] } });
    const riders = one(g, 'riders-of-the-mark');
    expect(kw(g, riders).has('haste')).toBe(true);
    expect(kw(g, riders).has('trample')).toBe(true);
    attack(g, [riders]);
    toEndStep(g);
    settle(g);
    expect(hand(g)).toEqual(['riders-of-the-mark']);
    expect(tokens(g, SOLDIER)).toHaveLength(4);
    expect(g.life('p2')).toBe(13);
  });

  it("stays on the battlefield if it didn't attack", () => {
    const g = game({ p1: { battlefield: ['riders-of-the-mark'] } });
    toEndStep(g);
    settle(g);
    expect(bf(g, 'riders-of-the-mark')).toHaveLength(1);
    expect(tokens(g, SOLDIER)).toHaveLength(0);
  });

  it('makes tokens equal to its toughness as it left the battlefield (with a bonus)', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: [...lands(1), 'forest', 'riders-of-the-mark'] },
    });
    const riders = one(g, 'riders-of-the-mark');
    attack(g, [riders]);
    cast(g, 'giant-growth', [g.ref(riders)]);
    settle(g);
    toEndStep(g);
    settle(g);
    expect(tokens(g, SOLDIER)).toHaveLength(7);
    expect(hand(g)).toContain('riders-of-the-mark');
  });
});

describe('Éomer of the Riddermark', () => {
  it('has haste; whenever it attacks, if you control a creature with the greatest power, you get a Human Soldier', () => {
    const g = game({
      p1: { battlefield: [EOMER] },
      p2: { battlefield: ['serra-angel'] },
    });
    const eomer = one(g, EOMER);
    expect(kw(g, eomer).has('haste')).toBe(true);
    attack(g, [eomer]);
    settle(g);
    expect(tokens(g, SOLDIER)).toHaveLength(1);
  });

  it('a tie for the greatest power counts', () => {
    const g = game({
      p1: { hand: ['rush-the-room'], battlefield: [...lands(1), EOMER] },
      p2: { battlefield: ['serra-angel'] },
    });
    // Serra Angel 4+1 = 5, like Éomer.
    cast(g, 'rush-the-room', [g.ref(one(g, 'serra-angel', 'p2'))]);
    settle(g);
    attack(g, [one(g, EOMER)]);
    settle(g);
    expect(tokens(g, SOLDIER)).toHaveLength(1);
  });

  it('no token if any creature (yours or theirs) has more power', () => {
    const g = game({
      p1: { battlefield: [EOMER] },
      p2: { battlefield: ['ghalta-primal-hunger'] },
    });
    attack(g, [one(g, EOMER)]);
    settle(g);
    expect(tokens(g, SOLDIER)).toHaveLength(0);
  });

  it('another creature of yours with the greatest power is enough', () => {
    const g = game({
      p1: {
        hand: ['giant-growth'],
        battlefield: [...lands(0), 'forest', EOMER, 'riders-of-the-mark'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    attack(g, [one(g, EOMER)]);
    settle(g);
    expect(tokens(g, SOLDIER)).toHaveLength(1);
  });
});
