import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow step 3b: casting from other zones, copies and X.

describe('casting for free', () => {
  it('Daring Waverider casts an instant from your graveyard for free, then exiles it', () => {
    const g = game({
      p1: {
        hand: ['daring-waverider'],
        battlefield: n('island', 6),
        graveyard: ['pearl-of-wisdom'],
      },
    });
    settle(cast(g, 'daring-waverider'));
    expect(g.decision.kind).toBe('castFree');
    const free = g.legal().find((a) => a.type === 'castSpell')!;
    settle(g.do(free));
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.zoneOf(g.id('p1', 'pearl-of-wisdom', 'exile'))).toBe('exile');
    // Every land was spent on the Waverider: the Pearl cost nothing.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(6);
  });

  it('Wishing Well puts a coin counter on, then can cast a 1-mana spell for free', () => {
    const g = game({
      p1: { battlefield: ['wishing-well'], graveyard: ['might-of-the-meek', 'pearl-of-wisdom'] },
    });
    const well = g.id('p1', 'wishing-well');
    const acts = g.legal().filter((a) => a.type === 'activateAbility');
    // Only Might of the Meek (mana value 1) can be the target with no coins yet.
    const targets = acts.flatMap((a) => (a.type === 'activateAbility' ? a.targets : []));
    expect(targets.map((t) => 'object' in t && g.obj(t.object.id).defId)).toEqual([
      'might-of-the-meek',
    ]);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.targets.length === 0)!);
    settle(g);
    expect(g.obj(well).counters?.coin).toBe(1);
  });

  it('The Infamous Cruelclaw casts the exiled spell by discarding a card', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['forest'],
        battlefield: ['the-infamous-cruelclaw'],
        library: ['island', 'serra-angel', 'forest'],
      },
    });
    g.passBoth().attack(g.id('p1', 'the-infamous-cruelclaw'));
    for (let i = 0; i < 30 && g.decision.kind !== 'castFree'; i++) settle(g.pass());
    expect(g.decision.kind).toBe('castFree');
    const cast = g.legal().find((a) => a.type === 'castSpell' && !!a.discard)!;
    settle(g.do(cast));
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(0);
  });
});

describe('graveyard and exile casts', () => {
  it('Festival of Embers casts instants from the graveyard for 1 life and exiles what dies', () => {
    const g = game({
      p1: {
        battlefield: [...n('mountain', 2), 'festival-of-embers'],
        graveyard: ['playful-shove'],
      },
    });
    const shove = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.via === 'festival' &&
          'player' in a.targets[0]! &&
          a.targets[0].player === 'p2',
      )!;
    settle(g.do(shove));
    expect(g.life('p1')).toBe(19);
    expect(g.zoneOf(g.id('p1', 'playful-shove', 'exile'))).toBe('exile');
  });

  it('Osteomancer Adept lets a creature be cast from the graveyard by foraging, with finality', () => {
    const g = game({
      p1: {
        battlefield: [...n('forest', 2), 'osteomancer-adept', 'carrot-cake'],
        graveyard: ['bear-cub'],
      },
    });
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'osteomancer-adept'),
        abilityIndex: 0,
        targets: [],
      }),
    );
    const cast = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.via === 'osteomancer' &&
          a.forage === g.id('p1', 'carrot-cake'),
      )!;
    g.do(cast);
    settle(g);
    if (g.decision.kind === 'scry') settle(g.do(g.legal()[0]!));
    const bear = g.id('p1', 'bear-cub');
    expect(g.obj(bear).counters?.finality).toBe(1);
  });

  it("Cruelclaw's Heist with the gift lets you cast the stolen card with any mana", () => {
    const g = game({
      p1: { hand: ['cruelclaws-heist'], battlefield: [...n('swamp', 2), ...n('swamp', 2)] },
      p2: { hand: ['bear-cub'] },
    });
    settle(cast(g, 'cruelclaws-heist', [], { kicked: true }));
    settle(g.do(g.legal()[0]!));
    const bear = g.id('p2', 'bear-cub', 'exile');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(true);
  });

  it('Glarb plays lands from the top of your library and shows you the top card', () => {
    const g = game({
      p1: { battlefield: ['glarb-calamitys-augur'], library: ['forest', 'bear-cub'] },
    });
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });
});

describe('copies and X', () => {
  it('Mockingbird enters as a copy that is also a flying Bird', () => {
    const g = game({
      p1: { hand: ['mockingbird'], battlefield: n('island', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const copy = g.legal().find((a) => a.type === 'castSpell' && a.copyOf === bear)!;
    settle(g.do(copy));
    const bird = g.state.battlefield.find(
      (id) => g.obj(id).controller === 'p1' && g.obj(id).originalDefId === 'mockingbird',
    )!;
    const c = getCharacteristics(g.state, cardDb, bird);
    expect(g.obj(bird).defId).toBe('bear-cub');
    expect(c.subtypes).toContain('Bird');
    expect([...c.keywords]).toContain('flying');
    expect(pt(g, bird)).toEqual([2, 2]);
  });

  it('Hugs exiles X cards you may play', () => {
    const g = game({
      p1: {
        hand: ['hugs-grisly-guardian'],
        battlefield: [...n('mountain', 3), ...n('forest', 3)],
        library: n('plains', 5),
      },
    });
    const x2 = g.legal().find((a) => a.type === 'castSpell' && a.x === 2)!;
    settle(g.do(x2));
    expect(g.state.players.p1.exile).toHaveLength(2);
  });

  it('Stormsplitter copies itself when you cast an instant, and the copy leaves at end of turn', () => {
    const g = game({
      p1: { hand: ['playful-shove'], battlefield: [...n('mountain', 2), 'stormsplitter'] },
    });
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    expect(all(g, 'stormsplitter')).toHaveLength(2);
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'stormsplitter')).toHaveLength(1);
  });

  it("Dragonhawk deals 2 per card still exiled at its controller's next end step", () => {
    const g = game({
      p1: {
        hand: ['dragonhawk-fates-tempest'],
        battlefield: n('mountain', 5),
        library: n('forest', 5),
      },
    });
    settle(cast(g, 'dragonhawk-fates-tempest'));
    expect(g.state.players.p1.exile).toHaveLength(1); // Dragonhawk itself has power 5
    g.passUntilStep('end');
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});

describe('the last rares', () => {
  it('Ygra makes other creatures Foods and grows when they die', () => {
    const g = game({
      p1: { hand: ['fell'], battlefield: [...n('swamp', 2), 'ygra-eater-of-all', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const c = getCharacteristics(g.state, cardDb, bear);
    expect(c.subtypes).toContain('Food');
    expect(c.types).toContain('Artifact');
    settle(cast(g, 'fell', [g.ref(bear)]));
    expect(g.obj(g.id('p1', 'ygra-eater-of-all')).plusOneCounters).toBe(2);
  });

  it("Maha gives the opponent's creatures base toughness 1", () => {
    const g = game({
      p1: { battlefield: ['maha-its-feathers-night'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 1]);
  });

  it('Rottenmouth Viper costs {1} less per permanent sacrificed', () => {
    const g = game({
      p1: {
        hand: ['rottenmouth-viper'],
        battlefield: [...n('swamp', 3), 'carrot-cake', 'bear-cub'],
      },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    // It costs six: three Swamps and two sacrifices are not enough.
    expect(casts).toHaveLength(0);
    const g2 = game({
      p1: {
        hand: ['rottenmouth-viper'],
        battlefield: [...n('swamp', 4), 'carrot-cake', 'bear-cub'],
      },
    });
    const viper = g2.legal().find((a) => a.type === 'castSpell')!;
    expect(viper.type === 'castSpell' && viper.sacrificeMany).toHaveLength(2);
  });

  it('Eluge counts flooded lands as Islands', () => {
    const g = game({
      p1: { hand: ['eluge-the-shoreless-sea'], battlefield: [...n('island', 3), 'forest'] },
    });
    settle(cast(g, 'eluge-the-shoreless-sea'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'forest'),
      ),
    );
    expect(pt(g, g.id('p1', 'eluge-the-shoreless-sea'))).toEqual([4, 4]);
  });

  it('Kitnap steals a creature (stunned without the gift)', () => {
    const g = game({
      p1: { hand: ['kitnap'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'kitnap', [g.ref(angel)]));
    expect(g.obj(angel).controller).toBe('p1');
    expect(g.obj(angel).counters?.stun).toBe(3);
  });

  it('For the Common Good copies a token X times', () => {
    const g = game({
      p1: {
        hand: ['hop-to-it', 'for-the-common-good'],
        battlefield: [...n('plains', 3), ...n('forest', 5)],
      },
    });
    settle(cast(g, 'hop-to-it'));
    const rabbit = all(g, 'rabbit-token')[0]!;
    const x2 = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.x === 2 &&
          a.targets.some((t) => 'object' in t && t.object.id === rabbit),
      )!;
    settle(g.do(x2));
    expect(all(g, 'rabbit-token')).toHaveLength(5);
    expect(g.life('p1')).toBe(25);
  });
});

describe('planeswalkers and copies', () => {
  it('Ral enters with loyalty, uses one loyalty ability a turn, and can be attacked', () => {
    const g = game({
      p1: { hand: ['ral-crackling-wit'], battlefield: [...n('island', 2), ...n('mountain', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    settle(cast(g, 'ral-crackling-wit'));
    const ral = g.id('p1', 'ral-crackling-wit');
    expect(g.obj(ral).counters?.loyalty).toBe(4);
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: ral, abilityIndex: 1, targets: [] }),
    );
    expect(g.obj(ral).counters?.loyalty).toBe(5);
    expect(all(g, 'otter-token')).toHaveLength(1);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === ral)).toBe(false);
    // The opponent's Bear attacks Ral.
    g.passUntilStep('upkeep').passUntilStep('beginCombat').passBoth();
    const bear = g.id('p2', 'bear-cub');
    g.do({ type: 'addAttacker', player: 'p2', attacker: bear, defender: 'p1', planeswalker: ral });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    for (
      let i = 0;
      i < 20 && g.state.turn.step !== 'endCombat' && g.state.turn.step !== 'main2';
      i++
    ) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p1' });
      else g.pass();
    }
    expect(g.obj(ral).counters?.loyalty).toBe(3);
    expect(g.life('p1')).toBe(20);
  });

  it('Shock can target Ral, and Ral dies at zero loyalty', () => {
    const g = game({
      p1: { hand: ['ral-crackling-wit'], battlefield: [...n('island', 2), ...n('mountain', 2)] },
      p2: { hand: ['lightning-strike', 'lightning-strike'], battlefield: n('mountain', 4) },
    });
    settle(cast(g, 'ral-crackling-wit'));
    const ral = g.id('p1', 'ral-crackling-wit');
    g.pass();
    settle(cast(g, 'lightning-strike', [g.ref(ral)]));
    expect(g.obj(ral).counters?.loyalty).toBe(1);
    g.pass();
    settle(cast(g, 'lightning-strike', [g.ref(ral)]));
    expect(g.zoneOf(ral)).toBe('graveyard');
  });

  it('Alania copies the first instant you cast this turn', () => {
    const g = game({
      p1: {
        hand: ['playful-shove', 'playful-shove'],
        battlefield: [...n('mountain', 4), 'alania-divergent-storm'],
      },
    });
    const shove = g
      .legal()
      .find(
        (a) => a.type === 'castSpell' && 'player' in a.targets[0]! && a.targets[0].player === 'p2',
      )!;
    g.do(shove);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 1));
    // The copy and the original each deal 1.
    expect(g.life('p2')).toBe(18);
    expect(handSize(g, 'p2')).toBe(1); // Alania's draw for the opponent
  });

  it('Kitsa copies your instant once its power is 3', () => {
    const g = game({
      p1: { hand: ['playful-shove'], battlefield: [...n('mountain', 4), 'kitsa-otterball-elite'] },
    });
    const kitsa = g.id('p1', 'kitsa-otterball-elite');
    g.state.objects[kitsa]!.plusOneCounters = 2;
    const shove = g
      .legal()
      .find(
        (a) => a.type === 'castSpell' && 'player' in a.targets[0]! && a.targets[0].player === 'p2',
      )!;
    g.do(shove);
    const copy = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === kitsa && a.targets.length === 1)!;
    g.do(copy);
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});
