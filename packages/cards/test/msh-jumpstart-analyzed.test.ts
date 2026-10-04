import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Analyzed packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Virtual Assistant',
  'TVA Bureaucrat',
  'Viv Vision, Teen Synthezoid',
  'Echo, Perceptive Prodigy',
  'Machine Man, Model X-51',
  'Victor Mancha, Runaway',
  'Vision, Spectral Synthezoid',
  'We Say Thee Nay!',
  'Quantum Reduction',
  'Frozen in Ice',
  'Timeline Inquiry',
  'Atlantis Attacks',
  'Thriving Isle',
  'Island',
];

const ASSISTANT = slug('Virtual Assistant');
const ECHO = slug('Echo, Perceptive Prodigy');
const MACHINE_MAN = slug('Machine Man, Model X-51');
const VICTOR = slug('Victor Mancha, Runaway');
const VISION = slug('Vision, Spectral Synthezoid');
const ROBOT_TOKEN = 'robot-hero-flying-token';

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

const castsOf = (g: G, defId: string) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && g.obj(a.card).defId === defId,
    );

const freeCasts = (g: G, defId: string) =>
  castsOf(g, defId).filter((a) => a.via === 'freeOnceEachTurn');

describe('Analyzed packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Virtual Assistant', () => {
  it('has defender', () => {
    expect(cardDb.get(ASSISTANT)!.keywords).toContain('defender');
  });

  it('makes a flying 1/1 Robot Hero when you cast a spell using teamwork', () => {
    const g = game({
      p1: { hand: ['quantum-reduction'], battlefield: [ASSISTANT, 'bear-cub', ...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'quantum-reduction', [g.ref(angel)], { kicked: true, teamwork: [bear] }));
    const robots = all(g, ROBOT_TOKEN);
    expect(robots).toHaveLength(1);
    const robot = getCharacteristics(g.state, cardDb, robots[0]!);
    expect(robot.types).toEqual(['Artifact', 'Creature']);
    expect(robot.subtypes).toEqual(['Robot', 'Hero']);
    expect(cardDb.get(ROBOT_TOKEN)!.colors).toEqual([]);
    expect(pt(g, robots[0]!)).toEqual([1, 1]);
    expect(keywords(g, robots[0]!).has('flying')).toBe(true);
  });

  it("doesn't trigger for a teamwork spell cast without teamwork, or other spells", () => {
    const g = game({
      p1: {
        hand: ['quantum-reduction', 'shock'],
        battlefield: [ASSISTANT, ...n('island', 2), ...n('mountain', 1)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'quantum-reduction', [g.ref(angel)]));
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(all(g, ROBOT_TOKEN)).toHaveLength(0);
  });
});

describe('Machine Man, Model X-51', () => {
  it('gets a +1/+1 counter and flying until end of turn when you cast a noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['shock', 'bear-cub'],
        battlefield: [MACHINE_MAN, ...n('mountain', 2), ...n('forest', 2)],
      },
    });
    const mm = g.id('p1', MACHINE_MAN);
    expect(keywords(g, mm).has('flying')).toBe(false);
    settle(cast(g, 'bear-cub'));
    expect(g.obj(mm).plusOneCounters).toBe(0);
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.obj(mm).plusOneCounters).toBe(1);
    expect(pt(g, mm)).toEqual([3, 4]);
    expect(keywords(g, mm).has('flying')).toBe(true);
    g.passUntilStep('end');
    for (let i = 0; i < 20 && g.state.turn.activePlayer === 'p1'; i++) g.pass();
    expect(keywords(g, mm).has('flying')).toBe(false);
    expect(g.obj(mm).plusOneCounters).toBe(1);
  });

  it("doesn't trigger on an opponent's noncreature spell", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [MACHINE_MAN] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    settle(cast(g, 'shock', [{ player: 'p1' }]));
    expect(g.obj(g.id('p1', MACHINE_MAN)).plusOneCounters).toBe(0);
  });
});

describe('Echo, Perceptive Prodigy', () => {
  it('has vigilance', () => {
    expect(cardDb.get(ECHO)!.keywords).toContain('vigilance');
  });

  /** Activates Echo targeting the topmost ability on the stack. */
  const activateEcho = (g: G) => {
    const echo = g.id('p1', ECHO);
    const top = g.state.stack[g.state.stack.length - 1]!;
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === echo &&
          a.targets.some((t) => 'object' in t && t.object.id === top.id),
      );
    expect(act).toBeDefined();
    g.do(act!);
    return echo;
  };

  it('copies an activated ability of a creature (sacrificed as a cost), choosing a new target', () => {
    const g = game({
      p1: { battlefield: [ECHO, 'fanatical-firebrand', 'island'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'fanatical-firebrand'),
      abilityIndex: 0,
      targets: [g.ref(bear)],
    });
    const echo = activateEcho(g);
    expect(g.obj(echo).tapped).toBe(true);
    // Echo's ability resolves: the copy may aim at the opponent instead.
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as Extract<G['decision'], { kind: 'chooseOption' }>;
    expect(d.options[0]!.label).toBe('Keep the same targets');
    const face = d.options.findIndex((o) => o.label === 'Your opponent');
    expect(face).toBeGreaterThan(0);
    g.do({ type: 'chooseOption', player: 'p1', index: face });
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(bear).damage).toBe(1);
  });

  it('copies a triggered ability, keeping its target if you like', () => {
    const g = game({
      p1: { hand: ['exclusion-mage'], battlefield: [ECHO, ...n('island', 4)] },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'exclusion-mage');
    g.pass();
    g.pass();
    // The trigger targets the bear.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === bear),
        )!,
    );
    activateEcho(g);
    g.pass();
    g.pass();
    const d = g.decision as Extract<G['decision'], { kind: 'chooseOption' }>;
    expect(d.kind).toBe('chooseOption');
    const toAngel = d.options.findIndex((o) => o.label.startsWith('Serra Angel'));
    expect(toAngel).toBeGreaterThan(0);
    g.do({ type: 'chooseOption', player: 'p1', index: toAngel });
    settle(g);
    expect(g.state.players.p2.hand).toContain(bear);
    expect(g.state.players.p2.hand).toContain(angel);
  });

  it("can't target an ability from a noncreature source, or an opponent's ability", () => {
    const g = game({
      p1: { hand: ['robotics-mastery'], battlefield: [ECHO, 'bear-cub', ...n('island', 5)] },
      p2: { battlefield: ['fanatical-firebrand'] },
    });
    const echo = g.id('p1', ECHO);
    cast(g, 'robotics-mastery', [g.ref(g.id('p1', 'bear-cub'))]);
    g.pass();
    g.pass();
    // Robotics Mastery's enter trigger (an Aura's) is on the stack.
    expect(g.state.stack).toHaveLength(1);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === echo)).toBe(false);
    settle(g);
    // The opponent's creature's ability isn't yours.
    g.pass();
    g.do({
      type: 'activateAbility',
      player: 'p2',
      source: g.id('p2', 'fanatical-firebrand'),
      abilityIndex: 0,
      targets: [{ player: 'p1' }],
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === echo)).toBe(false);
  });
});

describe('Victor Mancha, Runaway', () => {
  it('exiles a card from your graveyard that you may play while you control him', () => {
    const g = game({
      p1: {
        hand: [VICTOR],
        graveyard: ['shock', 'island'],
        battlefield: [...n('mountain', 6)],
      },
    });
    const shock = g.id('p1', 'shock', 'graveyard');
    cast(g, VICTOR);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === shock),
        )!,
    );
    settle(g);
    expect(g.zoneOf(shock)).toBe('exile');
    expect(castsOf(g, 'shock').length).toBeGreaterThan(0);
    settle(
      g.do(
        castsOf(g, 'shock').find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!,
      ),
    );
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(shock)).toBe('graveyard');
  });

  it('lets you play an exiled land', () => {
    const g = game({
      p1: { hand: [VICTOR], graveyard: ['island'], battlefield: [...n('mountain', 5)] },
    });
    settle(cast(g, VICTOR));
    const island = g.id('p1', 'island', 'exile');
    const play = g.legal().find((a) => a.type === 'playLand' && a.card === island);
    expect(play).toBeDefined();
    g.do(play!);
    expect(g.zoneOf(island)).toBe('battlefield');
  });

  it('stops the permission once he leaves', () => {
    const g = game({
      p1: { hand: [VICTOR], graveyard: ['shock'], battlefield: [...n('mountain', 6)] },
      p2: { hand: ['unsummon'], battlefield: ['island'] },
    });
    settle(cast(g, VICTOR));
    const shock = g.id('p1', 'shock', 'exile');
    expect(castsOf(g, 'shock').length).toBeGreaterThan(0);
    const victor = g.id('p1', VICTOR);
    g.pass();
    expect(g.actor).toBe('p2');
    settle(cast(g, 'unsummon', [g.ref(victor)]));
    expect(g.state.players.p1.hand).toContain(victor);
    expect(g.zoneOf(shock)).toBe('exile');
    expect(g.actor).toBe('p1');
    expect(castsOf(g, 'shock')).toHaveLength(0);
  });
});

describe('Vision, Spectral Synthezoid', () => {
  it('has flying', () => {
    expect(cardDb.get(VISION)!.keywords).toContain('flying');
  });

  it('casts one noncreature or Robot spell from your hand free during each of your turns', () => {
    const g = game({
      p1: { hand: ['shock', 'flying-drone', 'bear-cub'], battlefield: [VISION] },
    });
    expect(freeCasts(g, 'shock').length).toBeGreaterThan(0);
    expect(freeCasts(g, 'flying-drone').length).toBeGreaterThan(0);
    expect(castsOf(g, 'bear-cub')).toHaveLength(0);
    settle(g.do(freeCasts(g, 'flying-drone')[0]!));
    expect(all(g, 'flying-drone')).toHaveLength(1);
    // Only once this turn.
    expect(castsOf(g, 'shock')).toHaveLength(0);
  });

  it("doesn't work on an opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['shock'], battlefield: [VISION] },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(castsOf(g, 'shock')).toHaveLength(0);
  });

  it('works again on your next turn', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: [VISION], library: n('island', 5) },
      p2: { library: n('island', 5) },
    });
    settle(
      g.do(
        freeCasts(g, 'shock').find((a) =>
          a.targets.some((t) => 'player' in t && t.player === 'p2'),
        )!,
      ),
    );
    expect(g.life('p2')).toBe(18);
    const advance = (done: () => boolean) => {
      for (let i = 0; i < 80 && !done(); i++) {
        if (g.decision.kind === 'priority') g.pass();
        else g.do(g.legal()[0]!);
      }
    };
    advance(() => g.state.turn.activePlayer === 'p2');
    advance(
      () =>
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.step === 'main1' &&
        g.decision.kind === 'priority',
    );
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(freeCasts(g, 'shock').length).toBeGreaterThan(0);
  });

  it('still makes you pay kicker, and X is 0', () => {
    const g = game({
      p1: { hand: ['burst-lightning'], battlefield: [VISION, ...n('mountain', 3)] },
    });
    // Unkicked: free. Kicked: {4}, which three Mountains can't pay.
    const casts = freeCasts(g, 'burst-lightning');
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => !a.kicked)).toBe(true);
    const g2 = game({
      p1: { hand: ['burst-lightning'], battlefield: [VISION, ...n('mountain', 4)] },
    });
    const kicked = freeCasts(g2, 'burst-lightning').find(
      (a) => a.kicked && a.targets.some((t) => 'player' in t && t.player === 'p2'),
    );
    expect(kicked).toBeDefined();
    settle(g2.do(kicked!));
    expect(g2.life('p2')).toBe(16);
    expect(g2.state.battlefield.filter((id) => g2.obj(id).tapped)).toHaveLength(4);
  });
});
