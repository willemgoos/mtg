import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Foundations cards for the draft trophy decks and Arena's Jump In packets.

/** Answers every prompt with `pick`'s or its first option and resolves the stack (bounded). */
function drive(g: ReturnType<typeof game>, pick?: (legal: Action[]) => Action | undefined) {
  for (let i = 0; i < 40; i++) {
    if (g.decision.kind === 'priority') {
      if (!g.state.stack.length) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do(pick?.(legal) ?? legal[0]!);
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
    // Strixhaven Brawl's Blasphemous Edict: each player sacrifices thirteen creatures of their choice.
    drive(cast(g, 'blasphemous-edict'));
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

  it('Time Stop exiles the other spells on the stack and ends the turn', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['time-stop'] },
      p2: { battlefield: [...n('mountain', 2), 'bear-cub'], hand: ['lightning-strike'] },
    });
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    const turn = g.state.turn.number;
    const strike = g.id('p2', 'lightning-strike', 'hand');
    const stop = g.id('p1', 'time-stop', 'hand');
    cast(g, 'lightning-strike', [{ player: 'p1' }]);
    g.pass();
    cast(g, 'time-stop');
    g.passBoth();
    expect(g.zoneOf(strike)).toBe('exile');
    expect(g.zoneOf(stop)).toBe('exile');
    expect(g.state.players.p1.life).toBe(20);
    // Straight to p1's next turn: p2 never got to combat.
    expect(g.state.turn.number).toBe(turn + 1);
    expect(g.state.turn.activePlayer).toBe('p1');
  });

  it('Time Stop during combat stops the attack', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['time-stop'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.passUntilStep('end').passUntilStep('beginCombat');
    g.passBoth().attack(g.id('p2', 'serra-angel'));
    g.pass();
    cast(g, 'time-stop');
    g.passBoth();
    expect(g.state.players.p1.life).toBe(20);
    expect(g.state.turn.activePlayer).toBe('p1');
  });

  it('Bolt Bend changes the target of an ability, to the target you choose', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('mountain', 4)], hand: ['bolt-bend'] },
      p2: { battlefield: ['fanatical-firebrand', 'savannah-lions'] },
    });
    g.passUntilStep('end').passUntilStep('main1');
    const ping = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.length === 1 &&
          'player' in a.targets[0]! &&
          a.targets[0].player === 'p1',
      )!;
    g.do(ping).pass();
    const ability = g.state.stack[0]!;
    cast(g, 'bolt-bend', [{ object: { id: ability.id, zcc: 0 } }]);
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error(`Expected a choice, got ${d.kind}`);
    const lions = d.options.findIndex((o) => o.label.startsWith('Savannah Lions'));
    g.do({ type: 'chooseOption', player: 'p1', index: lions });
    drive(g);
    expect(g.state.players.p1.life).toBe(20);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
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

  it('Dropkick Bomber’s Goblin is sacrificed after combat damage to a creature too', () => {
    const g = game({
      p1: { battlefield: ['dropkick-bomber', 'goblin-token', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const goblin = g.id('p1', 'goblin-token');
    g.obj(goblin).plusOneCounters = 10;
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
    g.passBoth().block([g.id('p2', 'serra-angel'), goblin]);
    g.passUntilStep('main2');
    drive(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.zoneOf(goblin)).not.toBe('battlefield');
  });

  it('Gutless Plunderer keeps one of the top three on top and mills the rest', () => {
    const g = game({
      p1: {
        hand: ['gutless-plunderer'],
        battlefield: n('swamp', 3),
        library: ['forest', 'island', 'mountain', 'plains'],
      },
    });
    g.state.players.p1.attackedThisTurn = true;
    cast(g, 'gutless-plunderer');
    for (let i = 0; i < 10 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    const island = g.id('p1', 'island', 'library');
    g.do({ type: 'chooseCard', player: 'p1', card: island });
    drive(g);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toEqual(['island', 'plains']);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId).sort()).toEqual([
      'forest',
      'mountain',
    ]);
  });

  it('Elvish Archdruid is a mana ability making {G} for each Elf', () => {
    const g = game({
      p1: {
        hand: ['elvish-archdruid'],
        battlefield: [
          'elvish-archdruid',
          { card: 'llanowar-elves', tapped: true },
          { card: 'llanowar-elves', tapped: true },
        ],
      },
    });
    settle(cast(g, 'elvish-archdruid'));
    expect(all(g, 'elvish-archdruid')).toHaveLength(2);
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

  it('Vivien Reid’s emblem pumps your creatures all the time, from now on', () => {
    const g = game({ p1: { battlefield: ['vivien-reid', 'bear-cub'] } });
    const vivien = g.id('p1', 'vivien-reid');
    const bear = g.id('p1', 'bear-cub');
    g.obj(vivien).counters = { loyalty: 8 };
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: vivien, abilityIndex: 2, targets: [] }),
    );
    expect(pt(g, bear)).toEqual([4, 4]);
    const keywords = getCharacteristics(g.state, cardDb, bear).keywords;
    for (const k of ['vigilance', 'trample', 'indestructible'] as const)
      expect(keywords.has(k)).toBe(true);
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(pt(g, bear)).toEqual([4, 4]);
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

  it('Vial Smasher may hit one of their planeswalkers instead', () => {
    const g = game({
      p1: {
        battlefield: ['vial-smasher-the-fierce', ...n('mountain', 2)],
        hand: ['lightning-strike'],
      },
      p2: { battlefield: ['vivien-reid'] },
    });
    const vivien = g.id('p2', 'vivien-reid');
    g.obj(vivien).counters = { loyalty: 5 };
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    drive(g, (legal) =>
      legal.find(
        (a) =>
          (a.type === 'chooseOption' && a.index === 1) ||
          (a.type === 'chooseCard' && a.card === vivien),
      ),
    );
    expect(g.obj(vivien).counters?.loyalty).toBe(3);
    expect(g.state.players.p2.life).toBe(17);
  });
});
