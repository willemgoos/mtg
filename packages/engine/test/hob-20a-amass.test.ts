import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { casts, DB, Game, getPower, getToughness, scenario } from './hob-fixtures.ts';

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

/** Passes priority until nothing is on the stack and no choice is pending. */
const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

const armiesOf = (g: Game, player: 'p1' | 'p2') =>
  g.state.battlefield.filter(
    (id) =>
      g.state.objects[id]!.controller === player &&
      getCharacteristics(g.state, DB, id).subtypes.includes('Army'),
  );
const subtypes = (g: Game, id: string) => [...getCharacteristics(g.state, DB, id).subtypes];

/** Azog's enters trigger: put the Ogre (p2's) as its target. */
const azogTargetsOgre = (g: Game) => {
  castFirst(g, 'p1', 'h-azog');
  g.passBoth();
  expect(g.decision.kind).toBe('chooseTriggerTargets');
  const ogre = g.id('p2', 'ogre');
  g.do(
    g
      .legal('p1')
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === ogre),
      )!,
  );
  settle(g);
};

describe('Amass Goblins N', () => {
  it('with no Army, creates a 0/0 black Goblin Army token and puts the counters on it', () => {
    const g = new Game(
      scenario({ p1: { hand: ['h-flunkies'], battlefield: ['mountain', 'mountain'] } }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    const [army] = armiesOf(g, 'p1');
    expect(armiesOf(g, 'p1')).toHaveLength(1);
    expect(g.obj(army!).isToken).toBe(true);
    expect(g.obj(army!).defId).toBe('hob-goblin-army-token');
    expect(g.obj(army!).plusOneCounters).toBe(1);
    expect(getPower(g, army!)).toBe(1);
    expect(getToughness(g, army!)).toBe(1);
    expect(subtypes(g, army!)).toEqual(expect.arrayContaining(['Goblin', 'Army']));
    // The log: an amassed event naming the Army.
    expect(g.events).toContainEqual({
      type: 'amassed',
      player: 'p1',
      id: army,
      subtype: 'Goblin',
      amount: 1,
    });
  });

  it('with an Army, puts the counters on it and makes no new token (counters add up)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['h-flunkies', 'h-rage'],
          battlefield: ['swamp', 'swamp', 'swamp', 'mountain', 'mountain'],
        },
      }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    castFirst(g, 'p1', 'h-rage');
    settle(g);
    const armies = armiesOf(g, 'p1');
    expect(armies).toHaveLength(1);
    expect(g.obj(armies[0]!).plusOneCounters).toBe(3);
    // Rage into the Valley also drew a card and cost 1 life.
    expect(g.life('p1')).toBe(19);
  });

  it('an Army that is not a Goblin becomes one in addition to its other types', () => {
    const g = new Game(
      scenario({ p1: { hand: ['h-flunkies'], battlefield: ['mountain', 'mountain', 'h-army'] } }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    const army = g.id('p1', 'h-army');
    expect(armiesOf(g, 'p1')).toEqual([army]);
    expect(subtypes(g, army)).toEqual(expect.arrayContaining(['Human', 'Army', 'Goblin']));
    expect(g.obj(army).plusOneCounters).toBe(1);
    expect(getPower(g, army)).toBe(3);
    // No token was made.
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });

  it('a creature with changeling is an Army too: it gets the counters, no token', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-flunkies'], battlefield: ['mountain', 'mountain', 'h-shapeshifter'] },
      }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    expect(g.obj(g.id('p1', 'h-shapeshifter')).plusOneCounters).toBe(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });

  it('any type works: amass Orcs makes an Orc Army, and a Goblin Army that amasses Orcs is both', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['h-orc-amass', 'h-flunkies'],
          battlefield: ['swamp', 'swamp', 'mountain', 'mountain'],
        },
      }),
    );
    castFirst(g, 'p1', 'h-orc-amass');
    settle(g);
    const [army] = armiesOf(g, 'p1');
    expect(g.obj(army!).defId).toBe('hob-orc-army-token');
    expect(subtypes(g, army!)).toEqual(expect.arrayContaining(['Orc', 'Army']));
    expect(subtypes(g, army!)).not.toContain('Goblin');
    expect(g.obj(army!).plusOneCounters).toBe(3);
    // Amass Goblins on it: a Goblin Orc Army.
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    expect(armiesOf(g, 'p1')).toEqual([army]);
    expect(subtypes(g, army!)).toEqual(expect.arrayContaining(['Orc', 'Goblin', 'Army']));
    expect(g.obj(army!).plusOneCounters).toBe(4);
  });

  it('"amass 1; amass 3 instead if cast from a graveyard" (Tidings of War, flashback)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['h-tidings'],
          graveyard: [],
          battlefield: ['mountain', 'mountain', 'mountain', 'mountain', 'mountain'],
        },
      }),
    );
    castFirst(g, 'p1', 'h-tidings');
    settle(g);
    const [army] = armiesOf(g, 'p1');
    expect(g.obj(army!).plusOneCounters).toBe(1);
    // Flashback from the graveyard: three more on the same Army.
    const again = casts(g, 'p1', g.id('p1', 'h-tidings', 'graveyard'));
    expect(again.length).toBeGreaterThan(0);
    g.do(again[0]!);
    settle(g);
    expect(armiesOf(g, 'p1')).toEqual([army]);
    expect(g.obj(army!).plusOneCounters).toBe(4);
  });

  it('amass 0 still makes the Army token and chooses it (a 0/0 that is gone once state-based actions are checked)', () => {
    const g = new Game(scenario({ p1: { hand: ['h-amass-zero'], battlefield: ['swamp'] } }));
    castFirst(g, 'p1', 'h-amass-zero');
    settle(g);
    const made = g.events.find(
      (e) =>
        e.type === 'objectMoved' && e.defId === 'hob-goblin-army-token' && e.to === 'battlefield',
    );
    expect(made).toBeDefined();
    expect(g.events).toContainEqual(expect.objectContaining({ type: 'amassed', amount: 0 }));
    expect(armiesOf(g, 'p1')).toHaveLength(0);
  });

  it('with several Armies the player chooses which gets the counters', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['h-flunkies'],
          battlefield: ['mountain', 'mountain', 'h-army', 'h-shapeshifter'],
        },
      }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.player).toBe('p1');
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'h-army (2/2)',
      'h-shapeshifter (1/1)',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.obj(g.id('p1', 'h-army')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'h-shapeshifter')).plusOneCounters).toBe(0);
    expect(subtypes(g, g.id('p1', 'h-army'))).toContain('Goblin');
  });

  it('if two tokens are made (doubled), the player then chooses one; the other stays 0/0 and dies', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-flunkies'], battlefield: ['mountain', 'mountain', 'h-doubler'] },
      }),
    );
    castFirst(g, 'p1', 'h-flunkies');
    settle(g);
    expect(armiesOf(g, 'p1')).toHaveLength(2);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    settle(g);
    expect(armiesOf(g, 'p1')).toHaveLength(1);
    expect(g.obj(armiesOf(g, 'p1')[0]!).plusOneCounters).toBe(1);
  });

  it('another player can amass: Azog\'s "its controller amasses Goblins X" gives the opponent an Army with X counters', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-azog'], battlefield: ['swamp', 'swamp', 'swamp'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    azogTargetsOgre(g);
    expect(g.zoneOf(g.id('p2', 'ogre', 'graveyard'))).toBe('graveyard');
    const theirs = armiesOf(g, 'p2');
    expect(theirs).toHaveLength(1);
    expect(g.obj(theirs[0]!).controller).toBe('p2');
    expect(g.obj(theirs[0]!).plusOneCounters).toBe(3);
    expect(armiesOf(g, 'p1')).toHaveLength(0);
  });

  it('the opponent chooses among their own Armies when they are the one amassing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-azog'], battlefield: ['swamp', 'swamp', 'swamp'] },
        p2: { battlefield: ['ogre', 'h-army', 'h-shapeshifter'] },
      }),
    );
    azogTargetsOgre(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.player).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    expect(g.obj(g.id('p2', 'h-army')).plusOneCounters).toBe(3);
  });

  it('"amass, then attach this Equipment to the amassed Army" (Goblin Plate Mail)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['h-plate-mail'],
          battlefield: ['swamp', 'swamp', 'h-army', 'h-shapeshifter'],
        },
      }),
    );
    castFirst(g, 'p1', 'h-plate-mail');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    settle(g);
    const mail = g.id('p1', 'h-plate-mail');
    expect(g.obj(mail).attachedTo).toBe(g.id('p1', 'h-shapeshifter'));
  });

  it('a creature that dies amasses (Fearsome Goblin Pair), making the Army token if there is none', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock'], battlefield: [{ card: 'h-pair', damage: 1 }, 'mountain'] },
      }),
    );
    const pair = g.id('p1', 'h-pair');
    g.do(
      casts(g, 'p1', g.id('p1', 'shock', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === pair),
      )!,
    );
    settle(g);
    expect(g.zoneOf(g.id('p1', 'h-pair', 'graveyard'))).toBe('graveyard');
    const [army] = armiesOf(g, 'p1');
    expect(army).toBeDefined();
    expect(g.obj(army!).plusOneCounters).toBe(4);
  });
});
