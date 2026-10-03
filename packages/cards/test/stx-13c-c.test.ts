import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven 13c (group C): the remaining Quandrix, Prismari and multicolour cards.

const FRACTAL = 'stx-fractal-token';
const ELEMENTAL = 'stx-elemental-ur-token';
const activate = (g: GameDriver, source: string, abilityIndex: number, extra = {}) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets: [],
    ...extra,
  } as never);
const fractals = (g: GameDriver) => all(g, FRACTAL);
const pick = (g: GameDriver, type: string) => {
  const legal = g.legal();
  return g.do(
    legal.find((a) => a.type === type && (a as { accept?: boolean }).accept !== false) ?? legal[0]!,
  );
};

describe('13c group C: cards exist', () => {
  it('every card of the list is in the pool', () => {
    for (const id of [
      'aether-helix',
      'augmenter-pugilist',
      'body-of-research',
      'codie-vociferous-codex',
      'creative-outburst',
      'culmination-of-studies',
      'double-major',
      'extus-oriq-overlord',
      'golden-ratio',
      'jadzi-oracle-of-arcavios',
      'kasmina-enigma-sage',
      'kianne-dean-of-substance',
      'manifestation-sage',
      'practical-research',
      'rootha-mercurial-artist',
      'rowan-scholar-of-sparks',
      'square-up',
      'tanazir-quandrix',
      'teach-by-example',
      'torrent-sculptor',
      'uvilda-dean-of-perfection',
      'vineglimmer-snarl',
      'frostboil-snarl',
      'expressive-iteration',
    ])
      expect(cardDb.has(id), id).toBe(true);
  });
});

describe('Quandrix', () => {
  it('Aether Helix bounces a permanent and returns a permanent card from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['aether-helix'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        graveyard: ['bear-cub', 'shock'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const bear = g.id('p1', 'bear-cub', 'graveyard');
    settle(cast(g, 'aether-helix', [g.ref(angel), g.ref(bear)]));
    expect(g.zoneOf(angel)).toBe('hand');
    expect(g.zoneOf(bear)).toBe('hand');
  });

  it('Augmenter Pugilist gets +5/+5 with eight lands', () => {
    const g = game({ p1: { battlefield: ['augmenter-pugilist', ...n('forest', 7)] } });
    expect(pt(g, g.id('p1', 'augmenter-pugilist'))).toEqual([3, 3]);
    const g8 = game({ p1: { battlefield: ['augmenter-pugilist', ...n('forest', 8)] } });
    expect(pt(g8, g8.id('p1', 'augmenter-pugilist'))).toEqual([8, 8]);
  });

  it('Body of Research makes a Fractal with a counter per card in the library', () => {
    const g = game({
      p1: {
        hand: ['body-of-research'],
        battlefield: [...n('forest', 3), ...n('island', 3)],
        library: n('forest', 7),
      },
    });
    settle(cast(g, 'body-of-research'));
    const [f] = fractals(g);
    expect(g.obj(f!).plusOneCounters).toBe(7);
  });

  it('Double Major copies a creature spell, and the copy of a legend is not legendary', () => {
    const g = game({
      p1: {
        hand: ['kianne-dean-of-substance', 'double-major'],
        battlefield: [...n('forest', 4), ...n('island', 1)],
      },
    });
    cast(g, 'kianne-dean-of-substance');
    const spell = g.state.stack[g.state.stack.length - 1]!;
    expect(spell.kind).toBe('spell');
    cast(g, 'double-major', [g.ref(spell.id)]);
    settle(g);
    expect(all(g, 'kianne-dean-of-substance')).toHaveLength(2);
  });

  it('Golden Ratio draws a card for each different power', () => {
    const g = game({
      p1: {
        hand: ['golden-ratio'],
        battlefield: [...n('forest', 2), 'island', 'bear-cub', 'bear-cub', 'serra-angel'],
      },
    });
    const before = handSize(g, 'p1');
    settle(cast(g, 'golden-ratio'));
    expect(handSize(g, 'p1')).toBe(before - 1 + 2);
  });

  it('Manifestation Sage makes a Fractal with a counter per card in hand', () => {
    const g = game({
      p1: {
        hand: ['manifestation-sage', 'shock', 'shock', 'shock'],
        battlefield: n('island', 4),
      },
    });
    settle(cast(g, 'manifestation-sage'));
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(3);
  });

  it('Square Up sets base power and toughness to 4/4', () => {
    const g = game({
      p1: { hand: ['square-up'], battlefield: ['forest', 'island', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'square-up', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
  });

  it('Tanazir Quandrix doubles counters when it enters', () => {
    const g = game({
      p1: {
        hand: ['tanazir-quandrix'],
        battlefield: [...n('forest', 3), ...n('island', 2), 'bear-cub'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    g.state.objects[bear]!.plusOneCounters = 2;
    settle(cast(g, 'tanazir-quandrix'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets[0] !== undefined &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === bear,
      ),
    );
    expect(g.obj(bear).plusOneCounters).toBe(4);
  });

  it('Tanazir Quandrix sets the base size of your other creatures when it attacks', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['tanazir-quandrix', 'bear-cub'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'tanazir-quandrix'));
    for (let i = 0; i < 8 && pt(g, g.id('p1', 'bear-cub'))[0] !== 4; i++) {
      const legal = g.legal();
      g.do(
        legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
          legal.find((a) => a.type === 'confirmAttackers') ??
          legal[0]!,
      );
    }
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([4, 4]);
  });

  it('Vineglimmer Snarl enters tapped unless a Forest or Island is revealed', () => {
    const g = game({ p1: { hand: ['vineglimmer-snarl'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'vineglimmer-snarl', 'hand') });
    expect(g.obj(g.id('p1', 'vineglimmer-snarl')).tapped).toBe(true);
    const g2 = game({ p1: { hand: ['vineglimmer-snarl', 'island'] } });
    g2.do({ type: 'playLand', player: 'p1', card: g2.id('p1', 'vineglimmer-snarl', 'hand') });
    expect(g2.obj(g2.id('p1', 'vineglimmer-snarl')).tapped).toBe(false);
  });

  it('Kianne exiles the top card: a land to hand, else a study counter; the Fractal counts mana values', () => {
    const g = game({
      p1: {
        battlefield: ['kianne-dean-of-substance', ...n('forest', 5)],
        library: ['forest', 'shock', 'serra-angel', 'forest'],
      },
    });
    const kianne = g.id('p1', 'kianne-dean-of-substance');
    g.state.objects[kianne]!.summoningSick = false;
    settle(activate(g, kianne, 0));
    expect(handSize(g, 'p1')).toBe(1);
    g.state.objects[kianne]!.tapped = false;
    settle(activate(g, kianne, 0));
    g.state.objects[kianne]!.tapped = false;
    settle(activate(g, kianne, 0));
    const studied = g.state.players.p1.exile.filter((id) => g.obj(id).counters?.study);
    expect(studied).toHaveLength(2);
    settle(activate(g, kianne, 1));
    // Shock (1) and Serra Angel (5): two different mana values.
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(2);
  });
});

describe('Jadzi, Oracle of Arcavios', () => {
  it('returns to hand by discarding a card', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['jadzi-oracle-of-arcavios'] } });
    const j = g.id('p1', 'jadzi-oracle-of-arcavios');
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: j,
        abilityIndex: 0,
        targets: [],
        discard: g.id('p1', 'shock', 'hand'),
      } as never),
    );
    expect(g.zoneOf(j)).toBe('hand');
  });

  it('magecraft puts a revealed land onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['jadzi-oracle-of-arcavios', 'mountain'],
        library: ['island', 'forest'],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(all(g, 'island')).toHaveLength(1);
  });

  it('magecraft casts a revealed spell by paying {1}', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['jadzi-oracle-of-arcavios', 'mountain', 'mountain'],
        library: ['bear-cub', 'forest'],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
  });
});

describe('Kasmina, Enigma Sage', () => {
  it('makes a Fractal with -X', () => {
    const g = game({
      p1: { hand: ['kasmina-enigma-sage'], battlefield: [...n('forest', 2), 'island'] },
    });
    settle(cast(g, 'kasmina-enigma-sage'));
    const k = g.id('p1', 'kasmina-enigma-sage');
    expect(g.obj(k).counters?.loyalty).toBe(2);
    const xs = g.legal().filter((a) => a.type === 'activateAbility' && a.abilityIndex === 2);
    expect(xs.map((a) => (a as { x?: number }).x)).toEqual([1, 2]);
    settle(g.do(xs[0]!));
    expect(g.obj(k).counters?.loyalty).toBe(1);
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(1);
  });

  it('gives its loyalty abilities to your other planeswalkers', () => {
    const g = game({ p1: { battlefield: ['kasmina-enigma-sage', 'rowan-scholar-of-sparks'] } });
    const rowan = g.id('p1', 'rowan-scholar-of-sparks');
    g.state.objects[rowan]!.counters = { loyalty: 2 };
    const mine = g.legal().filter((a) => a.type === 'activateAbility' && a.source === rowan);
    // Rowan's +1, Kasmina's +2 and the -X choices (the -4 needs loyalty 4).
    expect(mine.length).toBeGreaterThanOrEqual(4);
    const plusTwo = mine.find((a) => a.type === 'activateAbility' && a.abilityIndex === 3)!;
    settle(g.do(plusTwo));
    expect(g.obj(rowan).counters?.loyalty).toBe(4);
  });
});

describe('Prismari', () => {
  it('Creative Outburst deals 5 damage and digs five cards deep', () => {
    const g = game({
      p1: {
        hand: ['creative-outburst'],
        battlefield: [...n('island', 5), ...n('mountain', 2)],
        library: ['shock', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    settle(cast(g, 'creative-outburst', [{ player: 'p2' }]));
    for (let i = 0; i < 4 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    expect(g.life('p2')).toBe(15);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Creative Outburst can be discarded for a Treasure', () => {
    const g = game({ p1: { hand: ['creative-outburst'], battlefield: ['island', 'mountain'] } });
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'creative-outburst', 'hand'),
        abilityIndex: 0,
        targets: [],
      } as never),
    );
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Culmination of Studies pays out per exiled card', () => {
    const g = game({
      p1: {
        hand: ['culmination-of-studies'],
        battlefield: [...n('island', 3), ...n('mountain', 2)],
        library: ['forest', 'island', 'shock', 'forest', 'forest'],
      },
    });
    settle(cast(g, 'culmination-of-studies', [], { x: 3 }));
    // Forest and Island (lands), Shock (red): two Treasures and 1 damage.
    expect(all(g, 'treasure-token')).toHaveLength(2);
    expect(g.life('p2')).toBe(19);
    expect(g.state.players.p1.exile).toHaveLength(3);
  });

  it('Practical Research draws four, then discards an instant or sorcery, or two cards', () => {
    const run = (hand: string[]) => {
      const g = game({
        p1: {
          hand,
          battlefield: [...n('island', 3), ...n('mountain', 2)],
          library: n('forest', 6),
        },
      });
      settle(cast(g, 'practical-research'));
      for (let i = 0; i < 3 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
      return handSize(g, 'p1');
    };
    expect(run(['practical-research', 'shock'])).toBe(4);
    expect(run(['practical-research'])).toBe(2);
  });

  it('Rootha returns to hand to copy an instant or sorcery you control', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['rootha-mercurial-artist', 'mountain', ...n('island', 3)],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    const spell = g.state.stack[g.state.stack.length - 1]!.id;
    const rootha = g.id('p1', 'rootha-mercurial-artist');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: rootha,
      abilityIndex: 0,
      targets: [g.ref(spell)],
    } as never);
    expect(g.zoneOf(rootha)).toBe('hand');
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('Teach by Example copies the next instant or sorcery', () => {
    const g = game({
      p1: { hand: ['teach-by-example', 'shock'], battlefield: [...n('island', 2), 'mountain'] },
    });
    settle(cast(g, 'teach-by-example'));
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
  });

  it('Torrent Sculptor exiles an instant or sorcery for counters (half its mana value, rounded up)', () => {
    const g = game({
      p1: {
        hand: ['torrent-sculptor'],
        battlefield: n('island', 4),
        graveyard: ['lightning-strike'],
      },
    });
    settle(cast(g, 'torrent-sculptor'));
    expect(g.obj(g.id('p1', 'torrent-sculptor')).plusOneCounters).toBe(1);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Uvilda exiles a spell with refine counters; the last one lets you cast it for {4} less', () => {
    const g = game({
      p1: {
        hand: ['aether-helix'],
        battlefield: ['uvilda-dean-of-perfection', 'forest', 'island'],
        graveyard: ['bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const u = g.id('p1', 'uvilda-dean-of-perfection');
    const helix = g.id('p1', 'aether-helix', 'hand');
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: u,
        abilityIndex: 0,
        targets: [],
        discard: helix,
      } as never),
    );
    expect(g.zoneOf(helix)).toBe('exile');
    expect(g.obj(helix).counters?.refine).toBe(3);
    // Each of its owner's upkeeps removes a counter; the last lets them cast it for {4} less.
    for (let i = 0; i < 60 && g.decision.kind !== 'castFree'; i++) {
      if (g.decision.kind === 'priority' && g.state.stack.length) g.pass();
      else if (g.decision.kind === 'priority' && g.state.turn.step === 'upkeep') g.pass();
      else if (g.decision.kind === 'priority') g.passUntilStep('upkeep');
      else g.do(g.legal()[0]!);
    }
    expect(g.decision.kind).toBe('castFree');
    // {3}{G}{U} less {4} leaves {G}{U}; the Forest and Island pay it.
    const cs = g.legal().find((a) => a.type === 'castSpell');
    expect(cs).toBeDefined();
    g.do(cs!);
    settle(g);
    expect(g.zoneOf(helix)).toBe('graveyard');
  });
});

describe('Rowan, Scholar of Sparks // Will, Scholar of Frost', () => {
  it('Rowan makes instants and sorceries cost {1} less', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['rowan-scholar-of-sparks', 'mountain'] },
    });
    settle(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
  });

  it('Rowan +1 pings, or hits for 3 after drawing three cards', () => {
    const g = game({ p1: { battlefield: ['rowan-scholar-of-sparks'] } });
    const rowan = g.id('p1', 'rowan-scholar-of-sparks');
    g.state.objects[rowan]!.counters = { loyalty: 2 };
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: rowan, abilityIndex: 1, targets: [] }),
    );
    expect(g.life('p2')).toBe(19);
    const g3 = game({ p1: { battlefield: ['rowan-scholar-of-sparks'] } });
    const r3 = g3.id('p1', 'rowan-scholar-of-sparks');
    g3.state.objects[r3]!.counters = { loyalty: 2 };
    g3.state.turn.cardsDrawn.p1 = 3;
    settle(
      g3.do({ type: 'activateAbility', player: 'p1', source: r3, abilityIndex: 1, targets: [] }),
    );
    expect(g3.life('p2')).toBe(17);
  });

  it('Rowan -4 gives an emblem that copies spells for {2}', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['rowan-scholar-of-sparks', 'mountain', 'mountain', 'mountain'],
      },
    });
    const rowan = g.id('p1', 'rowan-scholar-of-sparks');
    g.state.objects[rowan]!.counters = { loyalty: 4 };
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: rowan, abilityIndex: 2, targets: [] }),
    );
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    for (let i = 0; i < 4 && g.decision.kind !== 'priority'; i++) pick(g, 'chooseEffect');
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('Will, cast from the back of Rowan, draws two with -3', () => {
    const g = game({
      p1: { hand: ['rowan-scholar-of-sparks'], battlefield: [...n('island', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(g, 'rowan-scholar-of-sparks', [], { back: true }));
    const will = g.state.battlefield.find((id) => g.obj(id).defId === 'will-scholar-of-frost')!;
    expect(g.obj(will).counters?.loyalty).toBe(4);
    const before = handSize(g, 'p1');
    const abilities = g.legal().filter((a) => a.type === 'activateAbility' && a.source === will);
    // +1 (with and without a target) and -3.
    settle(g.do(abilities.find((a) => a.type === 'activateAbility' && a.abilityIndex === 2)!));
    expect(handSize(g, 'p1')).toBe(before + 2);
  });

  it('Will +1 makes a creature 0/2, and -7 swaps permanents for Elementals', () => {
    const g = game({
      p1: { hand: ['rowan-scholar-of-sparks'], battlefield: [...n('island', 5)] },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    settle(cast(g, 'rowan-scholar-of-sparks', [], { back: true }));
    const angel = g.id('p2', 'serra-angel');
    const plus = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.abilityIndex === 1 &&
          a.targets.length === 1 &&
          'object' in a.targets[0]! &&
          a.targets[0].object.id === angel,
      )!;
    settle(g.do(plus));
    expect(pt(g, angel)).toEqual([0, 2]);
    // The ultimate (loyalty set up directly).
    const g2 = game({
      p1: { battlefield: ['will-scholar-of-frost'] },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const w2 = g2.id('p1', 'will-scholar-of-frost');
    g2.state.objects[w2]!.counters = { loyalty: 7 };
    const a2 = g2.id('p2', 'serra-angel');
    const b2 = g2.id('p2', 'bear-cub');
    settle(
      g2.do({
        type: 'activateAbility',
        player: 'p1',
        source: w2,
        abilityIndex: 3,
        targets: [g2.ref(a2), g2.ref(b2)],
      }),
    );
    expect(g2.zoneOf(a2)).toBe('exile');
    expect(g2.zoneOf(b2)).toBe('exile');
    expect(
      g2.state.battlefield.filter(
        (id) => g2.obj(id).defId === ELEMENTAL && g2.obj(id).controller === 'p2',
      ),
    ).toHaveLength(2);
  });
});

describe('Codie, Vociferous Codex', () => {
  it('stops you casting permanent spells but not instants or sorceries', () => {
    const g = game({
      p1: {
        hand: ['bear-cub', 'shock'],
        battlefield: ['codie-vociferous-codex', 'forest', 'mountain'],
      },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bear-cub')).toBe(
      false,
    );
    expect(casts.some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'shock')).toBe(true);
  });

  it('makes five mana, and your next spell finds a cheaper instant or sorcery to cast free', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['codie-vociferous-codex', ...n('forest', 4)],
        library: ['forest', 'serra-angel', 'shock', 'forest'],
      },
    });
    const codie = g.id('p1', 'codie-vociferous-codex');
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: codie, abilityIndex: 1, targets: [] }),
    );
    settle(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    // Shock (mana value 1) is lower than Lightning Strike's 2.
    expect(g.decision.kind).toBe('castFree');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'castSpell' &&
            a.targets[0] !== undefined &&
            'player' in a.targets[0] &&
            a.targets[0].player === 'p2',
        )!,
    );
    settle(g);
    expect(g.life('p2')).toBe(20 - 3 - 2);
  });
});

describe('Extus, Oriq Overlord // Awaken the Blood Avatar', () => {
  it('magecraft returns a nonlegendary creature card from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['extus-oriq-overlord', 'mountain'],
        graveyard: ['bear-cub', 'kianne-dean-of-substance'],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.zoneOf(g.id('p1', 'bear-cub', 'hand'))).toBe('hand');
    expect(
      g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'kianne-dean-of-substance'),
    ).toBe(true);
  });

  it('Awaken the Blood Avatar costs {2} less per creature sacrificed, and makes a 3/6 Avatar', () => {
    const g = game({
      p1: {
        hand: ['extus-oriq-overlord'],
        battlefield: ['bear-cub', 'bear-cub', 'swamp', 'mountain', 'forest', 'forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const bears = all(g, 'bear-cub');
    settle(cast(g, 'extus-oriq-overlord', [], { back: true, sacrificeMany: bears }));
    for (let i = 0; i < 3 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
    const avatar = all(g, 'stx-avatar-token');
    expect(avatar).toHaveLength(1);
    expect(pt(g, avatar[0]!)).toEqual([3, 6]);
  });
});

describe('Kasmina ultimate', () => {
  it('-8 casts an instant or sorcery sharing a colour from your library for free', () => {
    const g = game({
      p1: {
        battlefield: ['kasmina-enigma-sage', 'bear-cub'],
        library: ['forest', 'big-play', 'shock'],
      },
    });
    const k = g.id('p1', 'kasmina-enigma-sage');
    g.state.objects[k]!.counters = { loyalty: 8 };
    g.do({ type: 'activateAbility', player: 'p1', source: k, abilityIndex: 3, targets: [] });
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('searchLibrary');
    // Shock isn't green or blue: only Big Play can be found.
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card !== null);
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    expect(g.decision.kind).toBe('castFree');
    const bear = g.id('p1', 'bear-cub');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'castSpell' &&
            a.targets[0] !== undefined &&
            'object' in a.targets[0] &&
            a.targets[0].object.id === bear,
        )!,
    );
    settle(g);
    expect(pt(g, bear)).toEqual([5, 5]);
  });
});

describe('Backs of the school legends', () => {
  it('Echoing Equation makes your other creatures copies, and they are not legendary', () => {
    const g = game({
      p1: {
        hand: ['augmenter-pugilist'],
        battlefield: [...n('island', 5), 'kianne-dean-of-substance', 'serra-angel', 'bear-cub'],
      },
    });
    const kianne = g.id('p1', 'kianne-dean-of-substance');
    const angel = g.id('p1', 'serra-angel');
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'augmenter-pugilist', [g.ref(kianne)], { back: true }));
    expect(pt(g, angel)).toEqual([2, 2]);
    expect(g.zoneOf(angel)).toBe('battlefield');
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.zoneOf(kianne)).toBe('battlefield');
  });

  it('Journey to the Oracle puts your lands onto the battlefield; with eight lands it can return', () => {
    const g = game({
      p1: {
        hand: ['jadzi-oracle-of-arcavios', 'forest', 'forest', 'forest', 'forest', 'shock'],
        battlefield: n('forest', 4),
      },
    });
    settle(cast(g, 'jadzi-oracle-of-arcavios', [], { back: true }));
    // Eight lands now; the optional discard returns Journey to hand.
    for (let i = 0; i < 4 && g.decision.kind !== 'priority'; i++) pick(g, 'chooseEffect');
    settle(g);
    expect(all(g, 'forest')).toHaveLength(8);
    expect(
      g.state.players.p1.hand.some((id) => g.obj(id).defId === 'jadzi-oracle-of-arcavios'),
    ).toBe(true);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'shock')).toBe(true);
  });

  it('Imbraham studies the top X cards and takes one into your hand', () => {
    const g = game({
      p1: {
        battlefield: ['imbraham-dean-of-theory', ...n('island', 5)],
        library: ['shock', 'serra-angel', 'forest'],
      },
    });
    const im = g.id('p1', 'imbraham-dean-of-theory');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: im,
      abilityIndex: 0,
      targets: [],
      x: 2,
    } as never);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('searchLibrary');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== null)!);
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.players.p1.exile).toHaveLength(1);
  });

  it('Flamethrower Sonata discards, draws, and burns for the discarded spell’s mana value', () => {
    const g = game({
      p1: {
        hand: ['torrent-sculptor', 'lightning-strike'],
        battlefield: ['island', 'mountain'],
        library: n('forest', 3),
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'torrent-sculptor', [g.ref(bear)], { back: true }));
    // Choose the card to discard: Lightning Strike (mana value 2) kills the Bear.
    expect(g.decision.kind).toBe('discard');
    g.do(
      g.legal().find((a) => a.type === 'discard' && g.obj(a.card).defId === 'lightning-strike')!,
    );
    settle(g);
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Nassari exiles the top card of the opponent’s library each upkeep for you to cast', () => {
    const g = game({
      p1: { battlefield: ['nassari-dean-of-expression', ...n('forest', 3)] },
      p2: { library: n('shock', 6) },
    });
    // Skip to p1's next upkeep.
    for (
      let i = 0;
      i < 40 &&
      !(
        g.state.turn.step === 'upkeep' &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.number > 3
      );
      i++
    ) {
      if (g.decision.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    settle(g);
    const exiled = g.state.players.p2.exile;
    expect(exiled).toHaveLength(1);
    expect(g.obj(exiled[0]!).castableBy).toBe('p1');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === exiled[0])).toBe(true);
  });
});
