import { type Action, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes cards added for the draft trophy decks.

/** Answers every prompt with its first option and resolves the stack (bounded). */
function drive(g: ReturnType<typeof game>, pick?: (legal: ReturnType<typeof g.legal>) => unknown) {
  for (let i = 0; i < 40; i++) {
    if (g.decision.kind === 'priority') {
      if (!g.state.stack.length) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do((pick?.(legal) as (typeof legal)[number] | undefined) ?? legal[0]!);
  }
  return g;
}

const activate = (g: ReturnType<typeof game>, source: string, abilityIndex: number, targets = []) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets });

describe('equipment', () => {
  it('S.H.I.E.L.D. Spy Kit untaps and scries once when the creature attacks alone', () => {
    const g = game({
      p1: { battlefield: ['s-h-i-e-l-d-spy-kit', 'bear-cub', 'plains'], library: n('plains', 3) },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(activate(g, g.id('p1', 's-h-i-e-l-d-spy-kit'), 2, [g.ref(bear)] as never));
    expect(pt(g, bear)).toEqual([3, 3]);
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    expect(g.state.stack).toHaveLength(1);
    drive(g);
    expect(g.obj(bear).tapped).toBe(false);
  });

  it('Captain America’s Shield triggers once per attack', () => {
    const g = game({
      p1: { battlefield: ['captain-americas-shield', 'bear-cub', ...n('plains', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.obj(g.id('p1', 'captain-americas-shield')).attachedTo = bear;
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    let asks = 0;
    for (let i = 0; i < 20 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      if (g.decision.kind === 'chooseTriggerTargets') asks++;
      if (g.decision.kind === 'priority') g.pass();
      else
        g.do(
          g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length) ?? g.legal()[0]!,
        );
    }
    expect(asks).toBe(1);
  });
});

describe('replacement effects', () => {
  it('Hawkeye, Young Avenger adds his power to noncombat damage to opponents', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['hawkeye-young-avenger', ...n('mountain', 2)],
      },
    });
    settle(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(g.state.players.p2.life).toBe(15);
  });

  it('Doc Samson puts one more counter on your permanents', () => {
    const g = game({
      p1: {
        hand: ['go-nuts'],
        battlefield: ['doc-samson-super-psychiatrist', 'bear-cub', ...n('forest', 3)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'go-nuts', [g.ref(bear)], { mode: 0 }));
    expect(g.obj(bear).plusOneCounters).toBeGreaterThanOrEqual(2);
  });
});

describe('changing creatures', () => {
  it('Reptil becomes a 3/5 with reach and vigilance', () => {
    const g = game({ p1: { battlefield: ['reptil-dinomorpher', ...n('forest', 3)] } });
    const reptil = g.id('p1', 'reptil-dinomorpher');
    settle(activate(g, reptil, 0));
    expect(pt(g, reptil)).toEqual([3, 5]);
    expect(getCharacteristics(g.state, cardDb, reptil).keywords.has('reach')).toBe(true);
  });

  it('I Am Iron Man makes a 4/4 flyer and draws', () => {
    const g = game({
      p1: {
        hand: ['i-am-iron-man'],
        battlefield: ['bear-cub', ...n('island', 3)],
        library: ['island'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'i-am-iron-man', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    const c = getCharacteristics(g.state, cardDb, bear);
    expect(c.keywords.has('flying')).toBe(true);
    expect(c.types).toContain('Artifact');
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Spider-Woman keeps the creature tapped while you control her', () => {
    const g = game({
      p1: { hand: ['spider-woman-secret-agent'], battlefield: n('plains', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'spider-woman-secret-agent'));
    expect(g.obj(angel).tapped).toBe(true);
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('Frozen in Ice taps the creature, which loses its abilities', () => {
    const g = game({
      p1: { hand: ['frozen-in-ice'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'frozen-in-ice', [g.ref(angel)]));
    expect(g.obj(angel).tapped).toBe(true);
    expect(getCharacteristics(g.state, cardDb, angel).keywords.has('flying')).toBe(false);
  });
});

describe('plans', () => {
  it('Political Triumph pays off on the fourth creature', () => {
    const g = game({
      p1: {
        hand: n('bear-cub', 4),
        battlefield: ['political-triumph', ...n('forest', 8)],
        library: n('forest', 8),
      },
    });
    for (let i = 0; i < 4; i++) {
      drive(cast(g, 'bear-cub'));
    }
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'political-triumph')).toBe(false);
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    for (const b of bears) expect(g.obj(b).plusOneCounters).toBe(1);
  });
});

describe('upkeep choices', () => {
  it('Mister Hyde can remove his counter to draw', () => {
    const g = game({
      p1: { battlefield: ['mister-hyde-monster-within'], library: n('forest', 3) },
    });
    const hyde = g.id('p1', 'mister-hyde-monster-within');
    g.obj(hyde).plusOneCounters = 1;
    const before = handSize(g, 'p1');
    // To p1's next upkeep, taking the second mode when the trigger asks.
    g.passUntilStep('end');
    for (
      let i = 0;
      i < 200 &&
      !(
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.number > 1 &&
        g.state.turn.step === 'main1'
      );
      i++
    ) {
      if (g.decision.kind === 'priority') g.pass();
      else {
        const legal = g.legal();
        g.do(legal.find((a) => a.type === 'chooseTargets' && a.mode === 1) ?? legal[0]!);
      }
    }
    expect(g.obj(hyde).plusOneCounters).toBe(0);
    expect(handSize(g, 'p1')).toBeGreaterThan(before);
  });
});

describe('shortcuts fixed', () => {
  it('Iron Fist gains his tap ability once a spell targets your creature', () => {
    const g = game({
      p1: {
        hand: ['snakeskin-veil'],
        battlefield: ['iron-fist-living-weapon', 'bear-cub', 'forest'],
      },
    });
    const fist = g.id('p1', 'iron-fist-living-weapon');
    const canPunch = () =>
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === fist && a.abilityIndex === 1);
    expect(canPunch()).toBe(false);
    settle(cast(g, 'snakeskin-veil', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(g.obj(fist).tapped).toBe(false);
    expect(canPunch()).toBe(true);
    settle(activate(g, fist, 1, [{ player: 'p2' }] as never));
    expect(g.state.players.p2.life).toBe(18);
    expect(g.obj(fist).tapped).toBe(true);
  });

  it('Misty Knight draws a card for each card discarded this turn', () => {
    const g = game({
      p1: {
        hand: ['island', 'island'],
        battlefield: ['misty-knight-hero-for-hire', ...n('mountain', 2)],
        library: n('island', 5),
      },
    });
    g.state.turn.discards = { p1: 1, p2: 0 };
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'misty-knight-hero-for-hire'),
        abilityIndex: 0,
        targets: [],
        discard: g.id('p1', 'island', 'hand'),
      }),
    );
    // One card kept, plus two drawn (the earlier discard and the one paying for it).
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Loki copies spells with mana value up to his current power, with new targets', () => {
    const run = (counters: number) => {
      const g = game({
        p1: { hand: ['fiery-annihilation'], battlefield: ['loki-laufeyson', ...n('mountain', 4)] },
        p2: { battlefield: ['serra-angel', 'bear-cub'] },
      });
      const loki = g.id('p1', 'loki-laufeyson');
      g.obj(loki).plusOneCounters = counters;
      settle(activate(g, loki, 0));
      cast(g, 'fiery-annihilation', [g.ref(g.id('p2', 'serra-angel'))]);
      // The copy takes a new target: the Bear (option 0 keeps the Angel).
      drive(g, (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseOption' &&
            g.decision.kind === 'chooseOption' &&
            g.decision.options[a.index]!.label.startsWith('Bear Cub'),
        ),
      );
      return g;
    };
    const two = run(0);
    expect(all(two, 'serra-angel')).toHaveLength(0);
    expect(all(two, 'bear-cub')).toHaveLength(1);
    const three = run(1);
    expect(all(three, 'serra-angel')).toHaveLength(0);
    expect(all(three, 'bear-cub')).toHaveLength(0);
  });

  it('Grim Reaper returns the creature tapped and attacking', () => {
    const g = game({
      p1: {
        battlefield: ['grim-reaper-lethal-legionnaire', ...n('swamp', 4)],
        graveyard: ['bear-cub'],
      },
    });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'grim-reaper-lethal-legionnaire'));
    settle(g);
    const bear = g.id('p1', 'bear-cub');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.state.combat?.attackers.map((a) => a.id)).toContain(bear);
    g.passUntilStep('main2');
    expect(g.state.players.p2.life).toBe(15);
  });

  it('Kid Loki gives hexproof to creatures that got +1/+1 counters this turn', () => {
    const g = game({
      p1: {
        hand: ['snakeskin-veil'],
        battlefield: ['kid-loki', 'bear-cub', 'savannah-lions', 'forest'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const hexproof = (id: string) =>
      getCharacteristics(g.state, cardDb, id).keywords.has('hexproof');
    settle(cast(g, 'snakeskin-veil', [g.ref(bear)]));
    // Without Snakeskin Veil's own hexproof.
    g.state.effects = [];
    expect(hexproof(bear)).toBe(true);
    expect(hexproof(g.id('p1', 'savannah-lions'))).toBe(false);
    g.passUntilStep('end').passUntilStep('main1');
    expect(hexproof(bear)).toBe(false);
  });

  it('Hellcat comes back once, with a counter and haste but no abilities', () => {
    const g = game({
      p1: {
        hand: n('lightning-strike', 2),
        battlefield: ['hellcat-undying-vigilante', ...n('mountain', 4)],
      },
    });
    const cat = g.id('p1', 'hellcat-undying-vigilante');
    settle(cast(g, 'lightning-strike', [g.ref(cat)]));
    expect(g.zoneOf(cat)).toBe('battlefield');
    expect(g.obj(cat).plusOneCounters).toBe(1);
    expect(getCharacteristics(g.state, cardDb, cat).keywords.has('haste')).toBe(true);
    settle(cast(g, 'lightning-strike', [g.ref(cat)]));
    expect(g.zoneOf(cat)).toBe('graveyard');
  });

  it('Justice grows when a noncreature permanent of yours returns to hand', () => {
    const g = game({
      p1: {
        hand: ['justice-vance-astrovik'],
        battlefield: ['s-h-i-e-l-d-spy-kit', ...n('island', 3)],
      },
    });
    const kit = g.id('p1', 's-h-i-e-l-d-spy-kit');
    settle(cast(g, 'justice-vance-astrovik'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === kit),
      ),
    );
    expect(g.zoneOf(kit)).toBe('hand');
    expect(g.obj(g.id('p1', 'justice-vance-astrovik')).plusOneCounters).toBe(1);
  });

  it('Klaw chooses among one card plus one per creature card in your graveyard', () => {
    const g = game({
      p1: { hand: ['klaw-sonic-subjugator'], battlefield: n('swamp', 3), graveyard: ['bear-cub'] },
      p2: { hand: ['serra-angel', 'island', 'lightning-strike', 'bear-cub'] },
    });
    cast(g, 'klaw-sonic-subjugator');
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseFromHand'; i++) g.pass();
    const d = g.decision;
    if (d.kind !== 'chooseFromHand') throw new Error(`Expected a choice, got ${d.kind}`);
    // Two cards, picked for them among the cheapest (never the Angel).
    expect(d.options).toHaveLength(2);
    expect(d.options).not.toContain(g.id('p2', 'serra-angel', 'hand'));
  });

  it('Atlantis Attacks gives the Leviathan to the target player', () => {
    const g = game({ p1: { hand: ['atlantis-attacks'], battlefield: n('island', 7) } });
    settle(cast(g, 'atlantis-attacks', [{ player: 'p2' }], { mode: 0 }));
    expect(all(g, 'leviathan-token').map((id) => g.obj(id).controller)).toEqual(['p2']);
  });

  it('Call Damage Control returns two cards only of different types', () => {
    const g = game({
      p1: {
        hand: ['call-damage-control'],
        battlefield: n('forest', 2),
        graveyard: ['bear-cub', 'savannah-lions', 'forest'],
      },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    const isForest = (t: TargetChoice) => 'object' in t && g.obj(t.object.id).defId === 'forest';
    expect(casts.some((a) => a.targets.length === 2 && !a.targets.some(isForest))).toBe(false);
    settle(g.do(casts.find((a) => a.targets.length === 2 && a.targets.some(isForest))!));
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Death to Our Enemies divides 7 damage among targets chosen as it is sacrificed', () => {
    const g = game({
      p1: {
        hand: n('lightning-strike', 4),
        battlefield: ['death-to-our-enemies', ...n('mountain', 8)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    for (let i = 0; i < 3; i++) drive(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(all(g, 'death-to-our-enemies')).toHaveLength(1);
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    drive(g, (legal) =>
      legal.find((a) => {
        if (a.type === 'chooseOption') return a.index === 1; // 5 to the Angel, 2 to them
        if (a.type !== 'chooseTargets' || a.targets.length !== 2) return false;
        const [x, y] = a.targets;
        return 'object' in x! && x.object.id === angel && 'player' in y! && y.player === 'p2';
      }),
    );
    expect(all(g, 'death-to-our-enemies')).toHaveLength(0);
    expect(g.zoneOf(angel)).toBe('graveyard');
    // Four Lightning Strikes, then 2 of the 7.
    expect(g.state.players.p2.life).toBe(20 - 12 - 2);
  });

  // Reality Fracture (17a fixes): a mana ability: X mana of any one colour, paid directly without the stack.
  it('Doc Samson taps for mana of any one colour as a mana ability', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['doc-samson-super-psychiatrist', 'plains', 'plains'],
      },
    });
    const samson = g.obj(g.id('p1', 'doc-samson-super-psychiatrist'));
    expect(samson.tapped).toBe(false);
    // His power is the amount: with two Plains it pays for Serra Angel ({3}{W}{W}).
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    expect(g.state.stack).toHaveLength(1);
    expect(g.obj(g.id('p1', 'doc-samson-super-psychiatrist')).tapped).toBe(true);
  });

  it('Claim the Kingdom puts its indestructible counter on a creature chosen at the end', () => {
    const g = game({
      p1: {
        hand: n('forest', 4),
        battlefield: ['claim-the-kingdom', 'bear-cub', 'savannah-lions'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const lions = g.id('p1', 'savannah-lions');
    // The four +1/+1 counters go on the Bear; the fifth choice, the indestructible counter, on the Lions.
    let asks = 0;
    const pick = (legal: Action[]) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === (asks < 4 ? bear : lions)),
      );
    for (let i = 0; i < 4; i++) {
      g.state.players.p1.landsPlayedThisTurn = 0;
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
      settle(g, (legal) => {
        const a = pick(legal);
        asks++;
        return a;
      });
    }
    expect(asks).toBe(5);
    expect(all(g, 'claim-the-kingdom')).toHaveLength(0);
    expect(g.obj(lions).counters?.indestructible).toBe(1);
    expect(g.obj(bear).counters?.indestructible ?? 0).toBe(0);
    expect(g.obj(bear).plusOneCounters).toBe(4);
  });

  it('Titania costs a discard or {2} more', () => {
    const casts = (lands: number, hand: string[]) => {
      const g = game({
        p1: { hand: ['titania-rugged-rumbler', ...hand], battlefield: n('swamp', lands) },
      });
      return g.legal().filter((a) => a.type === 'castSpell');
    };
    expect(casts(3, [])).toHaveLength(0);
    expect(casts(3, ['island']).map((a) => a.type === 'castSpell' && !!a.discard)).toEqual([true]);
    expect(casts(5, []).map((a) => a.type === 'castSpell' && !!a.discard)).toEqual([false]);
  });

  it('Shuri turns an artifact into a copy of another until end of turn', () => {
    const g = game({
      p1: {
        battlefield: ['shuri-wakandan-inventor', 's-h-i-e-l-d-spy-kit', 'treasure-token', 'island'],
      },
    });
    const kit = g.id('p1', 's-h-i-e-l-d-spy-kit');
    settle(
      activate(g, g.id('p1', 'shuri-wakandan-inventor'), 1, [
        g.ref(kit),
        g.ref(g.id('p1', 'treasure-token')),
      ] as never),
    );
    expect(g.obj(kit).defId).toBe('treasure-token');
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.obj(kit).defId).toBe('s-h-i-e-l-d-spy-kit');
  });
});
