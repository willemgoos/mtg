import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, settle } from './blb-helpers.ts';

// Foundations cards for the draft trophy decks and Arena's Jump In packets.

/** Answers every prompt with its first option and resolves the stack (bounded). */
function drive(g: ReturnType<typeof game>) {
  for (let i = 0; i < 40; i++) {
    if (g.decision.kind === 'priority') {
      if (!g.state.stack.length) return g;
      g.pass();
      continue;
    }
    g.do(g.legal()[0]!);
  }
  return g;
}

describe('spells', () => {
  it('Luminous Rebuke costs {3} less against a tapped creature', () => {
    const g = game({
      p1: { hand: ['luminous-rebuke'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    g.obj(angel).tapped = true;
    settle(cast(g, 'luminous-rebuke', [g.ref(angel)]));
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Blasphemous Edict makes each player sacrifice their creatures', () => {
    const g = game({
      p1: { hand: ['blasphemous-edict'], battlefield: ['bear-cub', ...n('swamp', 5)] },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    settle(cast(g, 'blasphemous-edict'));
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('Bolt Bend turns a burn spell aimed at your creature onto their side', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('mountain', 4)], hand: ['bolt-bend'] },
      p2: { battlefield: ['savannah-lions', ...n('mountain', 2)], hand: ['lightning-strike'] },
    });
    const angel = g.id('p1', 'bear-cub');
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    cast(g, 'lightning-strike', [g.ref(angel)]);
    const spell = g.state.stack[0]!;
    g.pass();
    cast(g, 'bolt-bend', [{ object: { id: spell.id, zcc: g.obj(spell.id).zcc } }]);
    drive(g);
    expect(g.zoneOf(angel)).toBe('battlefield');
    // It went to their creature or their face instead.
    expect(all(g, 'savannah-lions').length === 0 || g.state.players.p2.life === 17).toBe(true);
  });

  it('Time Stop exiles the other spells on the stack', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['time-stop'] },
      p2: { battlefield: n('mountain', 2), hand: ['lightning-strike'] },
    });
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    const strike = g.id('p2', 'lightning-strike', 'hand');
    cast(g, 'lightning-strike', [{ player: 'p1' }]);
    g.pass();
    cast(g, 'time-stop');
    drive(g);
    expect(g.zoneOf(strike)).toBe('exile');
    expect(g.state.players.p1.life).toBe(20);
  });
});

describe('creatures', () => {
  it('Exemplar of Light grows on life gain and draws only once a turn', () => {
    const g = game({
      p1: {
        hand: n('vampire-spawn', 2),
        battlefield: ['exemplar-of-light', ...n('swamp', 6)],
        library: n('swamp', 3),
      },
    });
    const exemplar = g.id('p1', 'exemplar-of-light');
    drive(cast(g, 'vampire-spawn'));
    drive(cast(g, 'vampire-spawn'));
    expect(g.obj(exemplar).plusOneCounters).toBe(2);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Koma makes four Koma’s Coils on combat damage', () => {
    const g = game({ p1: { battlefield: ['koma-world-eater'] } });
    const koma = g.id('p1', 'koma-world-eater');
    g.obj(koma).summoningSick = false;
    g.passUntilStep('beginCombat').passBoth().attack(koma);
    g.passUntilStep('main2');
    drive(g);
    expect(all(g, 'komas-coil-token')).toHaveLength(4);
  });

  it('Dropkick Bomber’s Goblin flies and is sacrificed after combat damage', () => {
    const g = game({
      p1: { battlefield: ['dropkick-bomber', 'goblin-token', ...n('mountain', 2)] },
    });
    const goblin = g.id('p1', 'goblin-token');
    g.obj(goblin).summoningSick = false;
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'dropkick-bomber'),
        abilityIndex: 1,
        targets: [g.ref(goblin)],
      }),
    );
    g.passUntilStep('beginCombat').passBoth().attack(goblin);
    g.passUntilStep('main2');
    drive(g);
    expect(g.state.players.p2.life).toBe(18);
    expect(g.zoneOf(goblin)).not.toBe('battlefield');
  });

  it('Homunculus Horde copies itself on your second draw', () => {
    const g = game({
      p1: {
        battlefield: ['homunculus-horde', ...n('island', 2)],
        hand: ['chart-a-course'],
        library: n('island', 4),
      },
    });
    drive(cast(g, 'chart-a-course'));
    expect(all(g, 'homunculus-horde')).toHaveLength(2);
  });
});

describe('enchantments and planeswalkers', () => {
  it('Ordeal of Nylea grows the attacker and fetches two lands on its third counter', () => {
    const g = game({
      p1: { battlefield: ['ordeal-of-nylea', 'bear-cub'], library: n('forest', 4) },
    });
    const bear = g.id('p1', 'bear-cub');
    g.obj(g.id('p1', 'ordeal-of-nylea')).attachedTo = bear;
    g.obj(bear).plusOneCounters = 2;
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    drive(g);
    expect(g.obj(bear).plusOneCounters).toBe(3);
    expect(all(g, 'ordeal-of-nylea')).toHaveLength(0);
    expect(all(g, 'forest')).toHaveLength(2);
  });

  it('Vivien Reid’s −3 destroys a flyer', () => {
    const g = game({
      p1: { battlefield: ['vivien-reid'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(g.id('p1', 'vivien-reid')).counters = { loyalty: 5 };
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'vivien-reid'),
        abilityIndex: 1,
        targets: [g.ref(angel)],
      }),
    );
    expect(g.zoneOf(angel)).toBe('graveyard');
  });
});

describe('Final Fantasy trophy deck reprints', () => {
  it('Counterspell counters a spell', () => {
    const g = game({
      p1: { battlefield: n('island', 2), hand: ['counterspell'] },
      p2: { battlefield: n('mountain', 2), hand: ['lightning-strike'] },
    });
    g.passUntilStep('end').passUntilStep('main1');
    cast(g, 'lightning-strike', [{ player: 'p1' }]);
    const spell = g.state.stack[0]!;
    g.pass();
    cast(g, 'counterspell', [{ object: { id: spell.id, zcc: g.obj(spell.id).zcc } }]);
    drive(g);
    expect(g.state.players.p1.life).toBe(20);
  });

  it('Captain Lannery Storm makes a Treasure when she attacks', () => {
    const g = game({ p1: { battlefield: ['captain-lannery-storm'] } });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'captain-lannery-storm'));
    drive(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Vial Smasher deals damage equal to your first spell’s mana value', () => {
    const g = game({
      p1: {
        battlefield: ['vial-smasher-the-fierce', ...n('mountain', 4)],
        hand: n('lightning-strike', 2),
      },
    });
    drive(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    drive(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    // Two strikes (6) and one trigger for the first spell (2).
    expect(g.state.players.p2.life).toBe(12);
  });
});
