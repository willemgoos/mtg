import { describe, expect, it } from 'vitest';
import { getCharacteristics, getColors } from '../src/index.ts';
import type { Action } from '../src/types.ts';
import { casts, DB, Game, getPower, getToughness, scenario } from './tdm-fixtures.ts';

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

/** Passes priority until nothing is on the stack and no choice is pending. */
const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

const tokensOf = (g: Game, defId: string) =>
  g.state.battlefield.filter((id) => g.state.objects[id]?.defId === defId);

describe('Endure', () => {
  it('asks the controller: N +1/+1 counters on it, or an N/N white Spirit token', () => {
    const g = new Game(
      scenario({ p1: { hand: ['t-kin-guard'], battlefield: ['plains', 'plains'] }, p2: {} }),
    );
    castFirst(g, 'p1', 't-kin-guard');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.player).toBe('p1');
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'Put 2 +1/+1 counters on t-kin-guard',
      'Create a 2/2 white Spirit creature token',
    ]);
  });

  it('counters: the creature gets N +1/+1 counters and no token is made', () => {
    const g = new Game(
      scenario({ p1: { hand: ['t-kin-guard'], battlefield: ['plains', 'plains'] }, p2: {} }),
    );
    castFirst(g, 'p1', 't-kin-guard');
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const guard = g.id('p1', 't-kin-guard');
    expect(g.obj(guard).plusOneCounters).toBe(2);
    expect(getPower(g, guard)).toBe(3);
    expect(tokensOf(g, 'tdm-spirit-token')).toHaveLength(0);
  });

  it('token: an N/N white Spirit, and the creature is unchanged', () => {
    const g = new Game(
      scenario({ p1: { hand: ['t-kin-guard'], battlefield: ['plains', 'plains'] }, p2: {} }),
    );
    castFirst(g, 'p1', 't-kin-guard');
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    const guard = g.id('p1', 't-kin-guard');
    expect(g.obj(guard).plusOneCounters).toBe(0);
    const [spirit] = tokensOf(g, 'tdm-spirit-token');
    expect(spirit).toBeDefined();
    expect(getPower(g, spirit!)).toBe(2);
    expect(getToughness(g, spirit!)).toBe(2);
    expect([...getColors(g.state, DB, spirit!)]).toEqual(['W']);
    expect(g.obj(spirit!).isToken).toBe(true);
  });

  it('if the creature is not on the battlefield, only the token is made (no choice)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['shock'],
          battlefield: [{ card: 't-anafenza', damage: 1 }, 'mountain'],
        },
        p2: {},
      }),
    );
    const anafenza = g.id('p1', 't-anafenza');
    g.do(
      casts(g, 'p1', g.id('p1', 'shock', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === anafenza),
      )!,
    );
    settle(g);
    expect(g.zoneOf(anafenza)).toBe('graveyard');
    expect(g.decision.kind).toBe('priority');
    const [spirit] = tokensOf(g, 'tdm-spirit-token');
    expect(spirit).toBeDefined();
    expect(getPower(g, spirit!)).toBe(2);
  });

  it('endures X for another creature, X from the counters on the source (Warden of the Grove)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['t-warden', 'bear'],
          battlefield: ['forest', 'forest', 'forest', 'forest', 'forest'],
        },
        p2: {},
      }),
    );
    castFirst(g, 'p1', 't-warden');
    settle(g);
    const warden = g.id('p1', 't-warden');
    expect(g.obj(warden).plusOneCounters).toBe(2);
    castFirst(g, 'p1', 'bear');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.options[0]!.label).toBe('Put 2 +1/+1 counters on bear');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const bear = g.id('p1', 'bear');
    expect(g.obj(bear).plusOneCounters).toBe(2);
    expect(g.obj(warden).plusOneCounters).toBe(2);
  });
});

describe('Endure X as an activated ability (Krumar Initiate)', () => {
  const setup = () =>
    new Game(
      scenario({
        p1: { battlefield: ['t-krumar', 'swamp', 'swamp', 'swamp'] },
        p2: {},
      }),
    );
  it('X mana and X life: the creature endures X', () => {
    const g = setup();
    const krumar = g.id('p1', 't-krumar');
    const acts = g
      .legal('p1')
      .filter((a) => a.type === 'activateAbility' && a.source === krumar);
    // X from 0 to 3 ({X}{B} with three Swamps: X up to 2).
    expect(acts.map((a) => (a.type === 'activateAbility' ? (a.x ?? 0) : -1)).sort()).toEqual([
      0, 1, 2,
    ]);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.x === 2)!);
    expect(g.life('p1')).toBe(18);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.obj(krumar).plusOneCounters).toBe(2);
  });

  it("X can't be more than your life", () => {
    const g = new Game(
      scenario({
        p1: { life: 1, battlefield: ['t-krumar', 'swamp', 'swamp', 'swamp'] },
        p2: {},
      }),
    );
    const xs = g
      .legal('p1')
      .flatMap((a) => (a.type === 'activateAbility' ? [a.x ?? 0] : []));
    expect(Math.max(...xs)).toBe(1);
  });
});

describe('Mobilize', () => {
  const attackWith = (g: Game, id: string) => {
    g.passBoth(); // to declare attackers
    g.attack(g.id('p1', id));
    settle(g);
  };

  it('creates N tapped and attacking 1/1 red Warriors when it attacks', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: ['t-mobilizer'] }, p2: {} }),
    );
    attackWith(g, 't-mobilizer');
    const warriors = tokensOf(g, 'tdm-warrior-token');
    expect(warriors).toHaveLength(2);
    for (const w of warriors) {
      expect(g.obj(w).tapped).toBe(true);
      expect(g.state.combat!.attackers.some((a) => a.id === w)).toBe(true);
    }
    // They hit for 1 each along with the 3/3.
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(15);
  });

  it('sacrifices the Warriors at the beginning of the next end step', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: ['t-mobilizer'] }, p2: {} }),
    );
    attackWith(g, 't-mobilizer');
    g.passUntilStep('endCombat');
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
    g.passUntilStep('main2');
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
    g.passUntilStep('end');
    settle(g);
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(0);
    expect(g.zoneOf(g.id('p1', 't-mobilizer'))).toBe('battlefield');
  });

  it('mobilize X: X is counted as the creature attacks (creature cards in your graveyard)', () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['t-grave-mobilizer'], graveyard: ['ogre', 'bear', 'shock'] },
        p2: {},
      }),
    );
    attackWith(g, 't-grave-mobilizer');
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
  });

  it("Zurgo-style: Warriors can't be sacrificed during your end step, so they stay", () => {
    const g = new Game(scenario({ step: 'beginCombat', p1: { battlefield: ['t-zurgo'] }, p2: {} }));
    attackWith(g, 't-zurgo');
    g.passUntilStep('end');
    settle(g);
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
  });

  it('attacking tokens you control have deathtouch (Bone-Cairn Butcher-style)', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: ['t-butcher'] }, p2: {} }),
    );
    attackWith(g, 't-butcher');
    const [w] = tokensOf(g, 'tdm-warrior-token');
    expect(getCharacteristics(g.state, DB, w!).keywords).toContain('deathtouch');
    // A non-attacking token would not have it, nor does the butcher itself get it (it is not a token).
    expect(getCharacteristics(g.state, DB, g.id('p1', 't-butcher')).keywords).not.toContain(
      'deathtouch',
    );
  });

  it('is a trigger on attack only: the tokens are not declared attackers (no second mobilize)', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: ['t-mobilizer'] }, p2: {} }),
    );
    attackWith(g, 't-mobilizer');
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
    expect(g.legal('p1').some((a: Action) => a.type === 'addAttacker')).toBe(false);
  });
});

describe('Decayed', () => {
  it("can't block, and is sacrificed at end of combat when it attacks", () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['t-decayed'] },
        p2: { battlefield: ['t-decayed'] },
      }),
    );
    g.passBoth();
    g.attack(g.id('p1', 't-decayed'));
    // The defender's decayed creature can't block it.
    expect(g.legal('p2').some((a) => a.type === 'addBlock')).toBe(false);
    g.passUntilStep('endCombat');
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(g.id('p1', 't-decayed', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(g.id('p2', 't-decayed'))).toBe('battlefield');
  });
});

describe('"whenever you attack" that makes tapped and attacking Warriors', () => {
  it('War Effort: one Warrior each time you attack, sacrificed at the next end step', () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['t-war-effort', 'ogre'] },
        p2: {},
      }),
    );
    g.passBoth();
    g.attack(g.id('p1', 'ogre'));
    settle(g);
    const warriors = tokensOf(g, 'tdm-warrior-token');
    expect(warriors).toHaveLength(1);
    expect(g.obj(warriors[0]!).tapped).toBe(true);
    g.passUntilStep('endCombat');
    // The ogre (4/3 with +1/+0) and the Warrior (2/1).
    expect(g.life('p2')).toBe(14);
    g.passUntilStep('end');
    settle(g);
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(0);
  });

  it('Dalkovan Encampment: until end of turn, whenever you attack, two Warriors', () => {
    const g = new Game(
      scenario({
        step: 'main1',
        p1: { battlefield: ['t-encampment', 'plains', 'plains', 'plains', 'ogre'] },
        p2: {},
      }),
    );
    const camp = g.id('p1', 't-encampment');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === camp)!);
    settle(g);
    g.passUntilStep('beginCombat');
    g.passBoth();
    g.attack(g.id('p1', 'ogre'));
    settle(g);
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(2);
    g.passUntilStep('end');
    settle(g);
    expect(tokensOf(g, 'tdm-warrior-token')).toHaveLength(0);
  });
});
