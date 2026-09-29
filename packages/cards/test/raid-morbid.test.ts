import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for Reckless Raid and Morbid Machinations.

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
  zone: 'hand' | 'graveyard' | 'exile' = 'hand',
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, zone), targets, ...extra });
};
const tokens = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);
const handIds = (g: GameDriver, p: 'p1' | 'p2') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
/** Passes (skipping combat) until the main phase of the given turn. */
const untilTurn = (g: GameDriver, turn: number) => {
  for (let i = 0; i < 300; i++) {
    if (
      g.state.turn.number === turn &&
      g.state.turn.step === 'main1' &&
      g.decision.kind === 'priority'
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else g.pass();
  }
  throw new Error('never reached turn ' + turn);
};
/** Kills a creature with the opponent's Hero's Downfall (they need {1}{B}{B}). */
const downfall = (g: GameDriver, target: string) => {
  cast(g, 'heros-downfall', [g.ref(target)]).passBoth();
};

describe('coming back from the graveyard', () => {
  it('Infernal Vessel returns once as a Demon with two counters', () => {
    const g = game({
      p1: { battlefield: ['infernal-vessel'] },
      p2: { hand: ['heros-downfall', 'heros-downfall'], battlefield: n('swamp', 6) },
      active: 'p2',
    });
    const v = g.id('p1', 'infernal-vessel');
    downfall(g, v);
    g.passBoth(); // the return trigger
    expect(g.zoneOf(v)).toBe('battlefield');
    expect(pt(g, v)).toEqual([4, 3]);
    expect(getCharacteristics(g.state, cardDb, v).subtypes).toContain('Demon');
    downfall(g, v);
    expect(g.state.stack).toHaveLength(0);
    expect(g.zoneOf(v)).toBe('graveyard');
  });

  it('Undying Malice: the creature returns tapped with a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['undying-malice'], battlefield: ['swamp', 'bear-cub'] },
      p2: { hand: ['heros-downfall'], battlefield: n('swamp', 3) },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'undying-malice', [g.ref(bear)]).passBoth();
    g.pass();
    downfall(g, bear);
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });

  it('Fake Your Own Death: returns it and makes a Treasure', () => {
    const g = game({
      p1: { hand: ['fake-your-own-death'], battlefield: [...n('swamp', 2), 'bear-cub'] },
      p2: { hand: ['heros-downfall'], battlefield: n('swamp', 3) },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'fake-your-own-death', [g.ref(bear)]).passBoth();
    expect(pt(g, bear)).toEqual([4, 2]);
    g.pass();
    downfall(g, bear);
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });

  it('Reassembling Skeleton returns itself from the graveyard, tapped', () => {
    const g = game({ p1: { graveyard: ['reassembling-skeleton'], battlefield: n('swamp', 2) } });
    const sk = g.id('p1', 'reassembling-skeleton', 'graveyard');
    g.do({ type: 'activateAbility', player: 'p1', source: sk, abilityIndex: 0, targets: [] });
    g.passBoth();
    expect(g.zoneOf(sk)).toBe('battlefield');
    expect(g.obj(sk).tapped).toBe(true);
  });

  it('Alesha returns a creature card with mana value up to her power at end step after attacking', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: ['alesha-who-laughs-at-fate'],
        graveyard: ['bear-cub', 'gnarlback-rhino'],
      },
    });
    const alesha = g.id('p1', 'alesha-who-laughs-at-fate');
    g.passBoth().attack(alesha).passBoth(); // attack trigger: +1/+1 counter → 3/3
    g.passUntilStep('main2').passBoth(); // to the end step
    const options = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length);
    expect(options).toHaveLength(1); // Bear Cub (MV 2), not Rhino (MV 4)
    g.do(options[0]!).passBoth();
    expect(g.zoneOf(g.id('p1', 'bear-cub'))).toBe('battlefield');
  });
});

describe('sacrifice costs and choices', () => {
  it('Eaten Alive: sacrifice a creature or pay {3}{B}; never target the sacrificed creature', () => {
    const g = game({
      p1: { hand: ['eaten-alive'], battlefield: ['swamp', 'bear-cub'] },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // Only the sacrifice version is affordable, and it can't exile the Bear it sacrifices.
    expect(casts.every((a) => a.type === 'castSpell' && a.sacrifice === bear)).toBe(true);
    const rhino = g.id('p2', 'gnarlback-rhino');
    cast(g, 'eaten-alive', [g.ref(rhino)], { sacrifice: bear }).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.zoneOf(rhino)).toBe('exile');
  });

  it('Vampiric Rites: sacrifice a creature to gain 1 and draw', () => {
    const g = game({ p1: { battlefield: [...n('swamp', 2), 'vampiric-rites', 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'vampiric-rites'),
      abilityIndex: 0,
      targets: [],
      sacrifice: bear,
    }).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.life('p1')).toBe(21);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('Vampire Gourmand may sacrifice another creature to draw and become unblockable', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['vampire-gourmand', 'bear-cub'] },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const vg = g.id('p1', 'vampire-gourmand');
    g.passBoth().attack(vg);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(g.id('p1', 'bear-cub'))] });
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(getCharacteristics(g.state, cardDb, vg).cantBeBlocked).toBe(true);
    g.passBoth(); // to blockers: the Rhino can't block
    expect(g.legal('p2').filter((a) => a.type === 'addBlock')).toHaveLength(0);
  });

  it('Perforating Artist: the opponent sacrifices, discards, or loses 3', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['perforating-artist'] },
      p2: { hand: ['forest'], battlefield: ['bear-cub', 'forest'] },
    });
    g.passBoth().attack(g.id('p1', 'perforating-artist'));
    g.passUntilStep('main2').passBoth().passBoth(); // end step trigger resolves
    expect(g.decision).toMatchObject({ kind: 'punisher', player: 'p2' });
    // Bear Cub, the Forest in hand, or nothing (the land on the battlefield doesn't count).
    expect(g.legal('p2')).toHaveLength(3);
    g.do({ type: 'chooseCard', player: 'p2', card: null });
    expect(g.life('p2')).toBe(20 - 3 - 3);
  });
});

describe('death triggers', () => {
  it('Midnight Reaper: a nontoken creature of yours dies, 1 damage and a card', () => {
    const g = game({
      p1: { battlefield: ['midnight-reaper', 'bear-cub'] },
      p2: { hand: ['heros-downfall'], battlefield: n('swamp', 3) },
      active: 'p2',
    });
    downfall(g, g.id('p1', 'bear-cub'));
    g.passBoth();
    expect(g.life('p1')).toBe(19);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('Massacre Wurm shrinks their creatures and drains 2 for each that dies', () => {
    const g = game({
      p1: { hand: ['massacre-wurm'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['bear-cub', 'savannah-lions', 'gnarlback-rhino'] },
    });
    cast(g, 'massacre-wurm').passBoth().passBoth(); // creature, then the enters trigger
    g.passBoth().passBoth(); // two drain triggers
    expect(g.state.players.p2.graveyard).toHaveLength(2);
    expect(g.life('p2')).toBe(16);
  });

  it('High-Society Hunter draws when another nontoken creature dies', () => {
    const g = game({
      p1: { battlefield: ['high-society-hunter'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'bear-cub'] },
      active: 'p2',
    });
    g.state.objects[g.id('p2', 'bear-cub')]!.damage = 1;
    cast(g, 'shock', [g.ref(g.id('p2', 'bear-cub'))])
      .passBoth()
      .passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});

describe('morbid and raid', () => {
  it('Tragic Banshee: -1/-1, or -13/-13 if a creature died this turn', () => {
    const plain = game({
      p1: { hand: ['tragic-banshee'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const rhino = plain.id('p2', 'gnarlback-rhino');
    cast(plain, 'tragic-banshee').passBoth();
    plain.do({ type: 'chooseTargets', player: 'p1', targets: [plain.ref(rhino)] }).passBoth();
    expect(pt(plain, rhino)).toEqual([3, 3]);

    const morbid = game({
      p1: { hand: ['tragic-banshee'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    morbid.state.turn.creaturesDied = 1;
    const r2 = morbid.id('p2', 'gnarlback-rhino');
    cast(morbid, 'tragic-banshee').passBoth();
    morbid.do({ type: 'chooseTargets', player: 'p1', targets: [morbid.ref(r2)] }).passBoth();
    expect(morbid.zoneOf(r2)).toBe('graveyard');
  });

  it('Wardens of the Cycle: choose a mode at the end step if a creature died', () => {
    const g = game({ step: 'main2', p1: { battlefield: ['wardens-of-the-cycle'] } });
    g.state.turn.creaturesDied = 1;
    g.passBoth(); // to the end step
    const modes = g.legal().map((a) => (a.type === 'chooseTargets' ? a.mode : -1));
    expect(modes.sort()).toEqual([0, 1]);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 }).passBoth();
    expect(g.life('p1')).toBe(22);
  });

  it('Goblin Boarders enters with a counter only if you attacked', () => {
    const g = game({ p1: { hand: ['goblin-boarders'], battlefield: n('mountain', 3) } });
    cast(g, 'goblin-boarders').passBoth();
    expect(g.obj(g.id('p1', 'goblin-boarders')).plusOneCounters).toBe(0);
    const raided = game({ p1: { hand: ['goblin-boarders'], battlefield: n('mountain', 3) } });
    raided.state.players.p1.attackedThisTurn = true;
    cast(raided, 'goblin-boarders').passBoth();
    expect(raided.obj(raided.id('p1', 'goblin-boarders')).plusOneCounters).toBe(1);
  });

  it("Slumbering Cerberus doesn't untap, but a death untaps it at the end step", () => {
    const g = game({
      step: 'main2',
      p1: { battlefield: [{ card: 'slumbering-cerberus', tapped: true }] },
    });
    const c = g.id('p1', 'slumbering-cerberus');
    g.passUntilStep('main1'); // through p2's turn and p1's untap step
    expect(g.obj(c).tapped).toBe(true);
    g.state.turn.creaturesDied = 1;
    g.passUntilStep('end');
    g.passBoth();
    expect(g.obj(c).tapped).toBe(false);
  });

  it('Strongbox Raider: exile two, pick one, play it until the end of your next turn', () => {
    const g = game({
      p1: {
        hand: ['strongbox-raider'],
        battlefield: n('mountain', 4),
        library: ['shock', 'bear-cub', 'forest'],
      },
    });
    g.state.players.p1.attackedThisTurn = true;
    cast(g, 'strongbox-raider').passBoth().passBoth();
    const d = g.decision;
    if (d.kind !== 'pickExiled') throw new Error(`expected pickExiled, got ${d.kind}`);
    const shock = d.options.find((id) => g.obj(id).defId === 'shock')!;
    g.do({ type: 'chooseCard', player: 'p1', card: shock });
    expect(g.obj(shock).zone).toBe('exile');
    untilTurn(g, 5); // p2's turn, then p1's next main phase
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === shock)).toBe(true);
  });
});

describe('other cards', () => {
  it('Cackling Prowler has ward {2}: an opponent pays {2} more to target it', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['cackling-prowler'] },
    });
    const prowler = g.id('p2', 'cackling-prowler');
    const targetsIt = (x: GameDriver) =>
      x
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.targets.some((t) => 'object' in t && t.object.id === prowler),
        );
    expect(targetsIt(g)).toBe(false);
    const rich = game({
      p1: { hand: ['shock'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['cackling-prowler'] },
    });
    const p2 = rich.id('p2', 'cackling-prowler');
    cast(rich, 'shock', [rich.ref(p2)]);
    expect(rich.state.battlefield.filter((id) => rich.obj(id).tapped)).toHaveLength(3);
  });

  it('Quilled Greatwurm: counters for combat damage; cast from the graveyard by removing six', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['quilled-greatwurm', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear).passUntilStep('main2');
    expect(g.obj(bear).plusOneCounters).toBe(2);

    const gy = game({
      p1: {
        graveyard: ['quilled-greatwurm'],
        battlefield: [...n('forest', 6), 'bear-cub', 'gnarlback-rhino'],
      },
    });
    const b = gy.id('p1', 'bear-cub');
    const r = gy.id('p1', 'gnarlback-rhino');
    gy.state.objects[b]!.plusOneCounters = 2;
    gy.state.objects[r]!.plusOneCounters = 4;
    cast(gy, 'quilled-greatwurm', [], {}, 'graveyard').passBoth();
    expect(gy.zoneOf(gy.id('p1', 'quilled-greatwurm'))).toBe('battlefield');
    expect(gy.obj(b).plusOneCounters + gy.obj(r).plusOneCounters).toBe(0);
  });

  it('Scavenging Ooze exiles a creature card to grow and gain 1', () => {
    const g = game({
      p1: { battlefield: ['forest', 'scavenging-ooze'] },
      p2: { graveyard: ['bear-cub'] },
    });
    const ooze = g.id('p1', 'scavenging-ooze');
    const bear = g.id('p2', 'bear-cub', 'graveyard');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: ooze,
      abilityIndex: 0,
      targets: [g.ref(bear)],
    });
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('exile');
    expect(pt(g, ooze)).toEqual([3, 3]);
    expect(g.life('p1')).toBe(21);
  });

  it('Diregraf Ghoul enters tapped', () => {
    const g = game({ p1: { hand: ['diregraf-ghoul'], battlefield: ['swamp'] } });
    cast(g, 'diregraf-ghoul').passBoth();
    expect(g.obj(g.id('p1', 'diregraf-ghoul')).tapped).toBe(true);
  });

  it('Abrade can destroy an artifact', () => {
    const g = game({
      p1: { hand: ['abrade'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['goldvein-pick'] },
    });
    cast(g, 'abrade', [g.ref(g.id('p2', 'goldvein-pick'))], { mode: 1 }).passBoth();
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });

  it('Needletooth Pack puts two counters on a creature at end step with morbid', () => {
    const g = game({ step: 'main2', p1: { battlefield: ['needletooth-pack', 'bear-cub'] } });
    g.state.turn.creaturesDied = 1;
    g.passBoth();
    const bear = g.id('p1', 'bear-cub');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(g.obj(bear).plusOneCounters).toBe(2);
    expect(handIds(g, 'p1')).toEqual([]);
  });
});

describe('ward and mandatory triggers', () => {
  it("a mandatory trigger whose only target has unaffordable ward just doesn't happen", () => {
    const g = game({
      p1: { hand: ['tragic-banshee'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['cackling-prowler'] },
    });
    cast(g, 'tragic-banshee').passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(g.legal()).toEqual([{ type: 'chooseTargets', player: 'p1', targets: [] }]);
    g.do(g.legal()[0]!);
    expect(g.state.stack).toHaveLength(0);
  });
});
