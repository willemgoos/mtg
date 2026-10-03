import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13c, group A: white, blue, Silverquill and Lorehold boosters cards.

const activate = (g: GameDriver, source: string, index = 0) =>
  g.do(
    g
      .legal()
      .find(
        (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
      )!,
  );
/** Answers a 'chooseOption' decision with the first option whose label matches. */
const pick = (g: GameDriver, label: RegExp) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected an option prompt, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0)
    throw new Error(`No option matching ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  return g.do({ type: 'chooseOption', player: d.player, index });
};
/** Resolves the stack: first target for triggers, optional effects declined. */
function resolve(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else break;
  }
  return g;
}
/** Like `resolve`, but answers every other prompt too (option prompts: "You" if offered, else the first). */
function answerAll(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'gameOver') break;
    if (d.kind === 'chooseOption') {
      const you = d.options.findIndex((o) => /^You$/.test(o.label));
      g.do({ type: 'chooseOption', player: d.player, index: Math.max(0, you) });
    } else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority') {
      if (g.state.stack.length) g.pass();
      else break;
    } else g.do(g.legal()[0]!);
  }
  return g;
}
const hand = (g: GameDriver, p: 'p1' | 'p2') => g.state.players[p].hand.length;
const zone = (g: GameDriver, p: 'p1' | 'p2', z: 'graveyard' | 'exile' | 'library' | 'hand') =>
  g.state.players[p][z].map((id) => g.obj(id).defId);

const lands = (c: string, k: number) => n(c, k);

describe('the pool', () => {
  it('has every card of the group, with the back faces', () => {
    for (const id of [
      'kelpie-guide',
      'silverquill-silencer',
      'velomachus-lorehold',
      'academic-probation',
      'multiple-choice',
      'flamescroll-celebrant',
      'revel-in-silence',
      'mentors-guidance',
      'semesters-end',
      'stonebinders-familiar',
      'mila-crafty-companion',
      'lukka-wayward-bonder',
      'devastating-mastery',
      'secret-rendezvous',
      'reconstruct-history',
      'fracture',
      'lorehold-excavation',
      'shineshadow-snarl',
      'selfless-glyphweaver',
      'deadly-vanity',
      'plargg-dean-of-chaos',
      'augusta-dean-of-order',
      'show-of-confidence',
      'solve-the-equation',
      'test-of-talents',
      'hofri-ghostforge',
      'shaile-dean-of-radiance',
      'embrose-dean-of-shadow',
      'mercurial-transformation',
      'thrilling-discovery',
      'tempted-by-the-oriq',
      'radiant-scrollwielder',
      'humiliate',
    ])
      expect(cardDb.has(id), id).toBe(true);
    expect(cardDb.get('lukka-wayward-bonder')!.loyalty).toBe(5);
  });
});

describe('white', () => {
  it('Academic Probation: names a card the opponent cannot cast until your next turn', () => {
    const g = game({
      p1: { hand: ['academic-probation'], battlefield: lands('plains', 2) },
      p2: { hand: ['shock'], battlefield: lands('mountain', 1) },
    });
    cast(g, 'academic-probation', [], { mode: 0 });
    resolve(g);
    pick(g, /^Shock$/);
    resolve(g);
    g.do({ type: 'passPriority', player: 'p1' });
    expect(g.actor).toBe('p2');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Academic Probation: a permanent cannot attack, block or activate until your next turn', () => {
    const g = game({
      p1: { hand: ['academic-probation'], battlefield: lands('plains', 2) },
      p2: { battlefield: ['kelpie-guide'] },
    });
    const guide = g.id('p2', 'kelpie-guide');
    cast(g, 'academic-probation', [g.ref(guide)], { mode: 1 });
    resolve(g);
    const e = g.state.effects.find((x) => x.affected.id === guide)!;
    expect(e.cantAttack && e.cantBlock && e.noActivate).toBe(true);
  });

  it('Devastating Mastery: destroys all nonland permanents; the alternative cost lets the opponent return two', () => {
    const run = (alt: boolean) => {
      const g = game({
        p1: {
          hand: ['devastating-mastery'],
          battlefield: [...lands('plains', alt ? 4 : 6), 'savannah-lions', 'llanowar-elves'],
        },
        p2: { battlefield: ['savannah-lions', 'llanowar-elves', 'pacifism', 'forest'] },
      });
      cast(g, 'devastating-mastery', [], alt ? { kicked: true } : {});
      resolve(g);
      return g;
    };
    const full = run(false);
    expect(
      full.state.battlefield.filter(
        (id) => full.obj(id).defId !== 'plains' && full.obj(id).defId !== 'forest',
      ),
    ).toHaveLength(0);
    const alt = run(true);
    expect(alt.decision.kind).toBe('chooseOption');
    pick(alt, /Return Savannah Lions/);
    pick(alt, /Return Llanowar Elves/);
    resolve(alt);
    expect(zone(alt, 'p2', 'hand').sort()).toEqual(['llanowar-elves', 'savannah-lions']);
    expect(alt.state.battlefield.filter((id) => alt.obj(id).defId === 'pacifism')).toHaveLength(0);
    expect(
      alt.state.battlefield.filter((id) => alt.obj(id).defId === 'savannah-lions'),
    ).toHaveLength(0);
  });

  it('Secret Rendezvous: each player draws three', () => {
    const g = game({ p1: { hand: ['secret-rendezvous'], battlefield: lands('plains', 3) } });
    cast(g, 'secret-rendezvous');
    resolve(g);
    expect(hand(g, 'p1')).toBe(3);
    expect(hand(g, 'p2')).toBe(3);
  });

  it("Semester's End: exiled creatures return at the end step with a +1/+1 counter", () => {
    const g = game({
      p1: { hand: ['semesters-end'], battlefield: [...lands('plains', 4), 'savannah-lions'] },
    });
    const lion = g.id('p1', 'savannah-lions');
    cast(g, 'semesters-end', [g.ref(lion)]);
    resolve(g);
    expect(g.zoneOf(lion)).toBe('exile');
    g.passUntilStep('end');
    resolve(g);
    const back = g.id('p1', 'savannah-lions');
    expect(pt(g, back)).toEqual([3, 2]);
  });

  it("Stonebinder's Familiar: a +1/+1 counter once each turn cards are exiled on your turn", () => {
    const g = game({
      p1: {
        hand: ['semesters-end'],
        battlefield: [...lands('plains', 4), 'stonebinders-familiar', 'savannah-lions'],
      },
    });
    const fam = g.id('p1', 'stonebinders-familiar');
    cast(g, 'semesters-end', [g.ref(g.id('p1', 'savannah-lions'))]);
    resolve(g);
    expect(pt(g, fam)).toEqual([2, 2]);
  });

  it('Show of Confidence: copies for each other instant or sorcery cast this turn', () => {
    const g = game({
      p1: {
        hand: ['shock', 'show-of-confidence'],
        battlefield: [...lands('plains', 2), ...lands('mountain', 1), 'savannah-lions'],
      },
      p2: { life: 20 },
    });
    const lion = g.id('p1', 'savannah-lions');
    cast(g, 'shock', [{ player: 'p2' }]);
    resolve(g);
    cast(g, 'show-of-confidence', [g.ref(lion)]);
    resolve(g);
    // The original plus one copy: two counters.
    expect(g.obj(lion).plusOneCounters).toBe(2);
  });

  it('Mila: draws when an opponent targets your permanent; loyalty when planeswalkers are attacked', () => {
    const g = game({
      p1: { battlefield: ['mila-crafty-companion'] },
      p2: { hand: ['pacifism'], battlefield: lands('plains', 2) },
      active: 'p2',
    });
    const mila = g.id('p1', 'mila-crafty-companion');
    cast(g, 'pacifism', [g.ref(mila)]);
    resolve(g);
    // Mila's controller may draw: accept.
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    resolve(g);
    expect(hand(g, 'p1')).toBe(1);
  });

  it('Selfless Glyphweaver exiles itself to make your creatures indestructible', () => {
    const g = game({
      p1: { battlefield: ['selfless-glyphweaver', 'savannah-lions'] },
    });
    const lion = g.id('p1', 'savannah-lions');
    const weaver = g.id('p1', 'selfless-glyphweaver');
    activate(g, weaver);
    resolve(g);
    expect(g.zoneOf(weaver)).toBe('exile');
    expect(
      g.state.effects.some((e) => e.affected.id === lion && e.keywords.includes('indestructible')),
    ).toBe(true);
  });

  it('Deadly Vanity destroys every creature and planeswalker but the chosen one', () => {
    const g = game({
      p1: {
        hand: ['selfless-glyphweaver'],
        battlefield: [...lands('swamp', 8), 'savannah-lions', 'llanowar-elves'],
      },
      p2: { battlefield: ['savannah-lions', 'sol-ring'] },
    });
    cast(g, 'selfless-glyphweaver', [], { back: true });
    resolve(g);
    pick(g, /Llanowar Elves \(yours\)/);
    resolve(g);
    const left = g.state.battlefield.map((id) => g.obj(id).defId).filter((d) => d !== 'swamp');
    expect(left.sort()).toEqual(['llanowar-elves', 'sol-ring']);
  });

  it('Humiliate: the opponent discards a nonland card; you put a +1/+1 counter on a creature', () => {
    const g = game({
      p1: {
        hand: ['humiliate'],
        battlefield: [...lands('plains', 1), ...lands('swamp', 1), 'savannah-lions'],
      },
      p2: { hand: ['forest', 'shock'] },
    });
    cast(g, 'humiliate');
    answerAll(g);
    expect(zone(g, 'p2', 'graveyard')).toEqual(['shock']);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
  });
});

describe('blue', () => {
  it('Kelpie Guide untaps another permanent; taps a permanent only with eight lands', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'forest', tapped: true }, 'kelpie-guide', ...lands('island', 7)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const guide = g.id('p1', 'kelpie-guide');
    const forest = g.id('p1', 'forest');
    g.obj(guide).summoningSick = false;
    const untap = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === guide && a.abilityIndex === 0)!;
    g.do({ ...untap, targets: [g.ref(forest)] } as never);
    resolve(g);
    expect(g.obj(forest).tapped).toBe(false);
    // Eight lands now (forest + seven Islands): the tap ability is available once untapped.
    g.obj(guide).tapped = false;
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === guide && a.abilityIndex === 1),
    ).toBe(true);
    const g2 = game({ p1: { battlefield: ['kelpie-guide', ...lands('island', 7)] } });
    g2.obj(g2.id('p1', 'kelpie-guide')).summoningSick = false;
    expect(g2.legal().some((a) => a.type === 'activateAbility' && a.abilityIndex === 1)).toBe(
      false,
    );
  });

  it("Mentor's Guidance: copied only with a planeswalker or a Cleric, Druid, Shaman, Warlock or Wizard", () => {
    const run = (battlefield: string[]) => {
      const g = game({
        p1: { hand: ['mentors-guidance'], battlefield: [...lands('island', 3), ...battlefield] },
      });
      cast(g, 'mentors-guidance');
      answerAll(g);
      return hand(g, 'p1');
    };
    expect(run([])).toBe(1);
    expect(run(['selfless-glyphweaver'])).toBe(2);
  });

  it('Mercurial Transformation: a permanent becomes a 1/1 Frog or a 4/4 Octopus without abilities until end of turn', () => {
    const g = game({
      p1: { hand: ['mercurial-transformation'], battlefield: lands('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'mercurial-transformation', [g.ref(angel)]);
    resolve(g);
    pick(g, /Frog/);
    resolve(g);
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(g.obj(angel).blank).toBe(true);
    g.passUntilStep('end');
    expect(pt(g, angel)).toEqual([1, 1]);
    g.passUntilStep('upkeep');
    expect(pt(g, angel)).toEqual([4, 4]);
    expect(g.obj(angel).blank).toBeFalsy();
  });

  it('Multiple Choice does one part per X, and all of them from X = 4', () => {
    const run = (xv: number) => {
      const g = game({
        p1: {
          hand: ['multiple-choice'],
          battlefield: [...lands('island', 5), 'savannah-lions'],
          library: n('island', 10),
        },
        p2: { battlefield: ['llanowar-elves'] },
      });
      cast(g, 'multiple-choice', [], { x: xv });
      answerAll(g);
      return g;
    };
    const g1 = run(1);
    expect(hand(g1, 'p1')).toBe(1);
    const g2 = run(2);
    expect(g2.state.players.p1.hand.map((id) => g2.obj(id).defId)).toEqual(['savannah-lions']);
    const g3 = run(3);
    expect(g3.state.battlefield.some((id) => g3.obj(id).defId === 'stx-elemental-ur-token')).toBe(
      true,
    );
    const g4 = run(4);
    expect(g4.state.battlefield.some((id) => g4.obj(id).defId === 'stx-elemental-ur-token')).toBe(
      true,
    );
    expect(hand(g4, 'p1')).toBe(2);
  });

  it('Solve the Equation finds an instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['solve-the-equation'],
        battlefield: lands('island', 3),
        library: ['forest', 'shock', 'forest'],
      },
    });
    cast(g, 'solve-the-equation');
    resolve(g);
    if (g.decision.kind === 'searchLibrary') g.do(g.legal()[0]!);
    resolve(g);
    expect(zone(g, 'p1', 'hand')).toEqual(['shock']);
  });

  it('Tempted by the Oriq steals a creature with mana value 3 or less for good', () => {
    const g = game({
      p1: { hand: ['tempted-by-the-oriq'], battlefield: lands('island', 4) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const lion = g.id('p2', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(
      casts.some(
        (a) =>
          a.type === 'castSpell' && a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    ).toBe(false);
    cast(g, 'tempted-by-the-oriq', [g.ref(lion)]);
    resolve(g);
    expect(g.obj(lion).controller).toBe('p1');
  });

  it('Test of Talents counters an instant or sorcery and exiles its copies from graveyard, hand and library', () => {
    const g = game({
      p1: { hand: ['test-of-talents'], battlefield: lands('island', 2) },
      p2: {
        hand: ['shock', 'shock', 'forest'],
        graveyard: ['shock'],
        library: ['shock', 'forest', 'forest'],
        battlefield: lands('mountain', 1),
      },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass(); // p2 passes priority with the Shock on the stack; p1 may respond
    cast(g, 'test-of-talents', [g.ref(g.state.stack[0]!.id)]);
    resolve(g);
    expect(zone(g, 'p2', 'exile').filter((d) => d === 'shock')).toHaveLength(4);
    expect(zone(g, 'p2', 'hand').includes('shock')).toBe(false);
    // A card for the Shock that was in hand (the other Shock was the one cast).
    expect(hand(g, 'p2')).toBe(2);
  });
});

describe('Silverquill (W/B)', () => {
  it('Fracture destroys an artifact, enchantment or planeswalker', () => {
    const g = game({
      p1: { hand: ['fracture'], battlefield: [...lands('plains', 1), ...lands('swamp', 1)] },
      p2: { battlefield: ['sol-ring', 'savannah-lions'] },
    });
    const ring = g.id('p2', 'sol-ring');
    const lion = g.id('p2', 'savannah-lions');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets.some((t) => 'object' in t && t.object.id === lion)).toBe(false);
    cast(g, 'fracture', [g.ref(ring)]);
    resolve(g);
    expect(g.zoneOf(ring)).toBe('graveyard');
  });

  it('Shineshadow Snarl enters tapped unless a Plains or Swamp is revealed', () => {
    const play = (handCards: string[]) => {
      const g = game({ p1: { hand: ['shineshadow-snarl', ...handCards] } });
      const land = g.id('p1', 'shineshadow-snarl', 'hand');
      g.do(g.legal().find((a) => a.type === 'playLand' && a.card === land)!);
      return g.obj(land).tapped;
    };
    expect(play(['forest'])).toBe(true);
    expect(play(['swamp'])).toBe(false);
  });

  it('Silverquill Silencer: an opponent casting the chosen name loses 3 life and you draw', () => {
    const g = game({
      p1: {
        hand: ['silverquill-silencer'],
        battlefield: [...lands('plains', 1), ...lands('swamp', 1)],
      },
      p2: { hand: ['shock'], battlefield: lands('mountain', 1) },
    });
    cast(g, 'silverquill-silencer');
    resolve(g);
    pick(g, /^Shock$/);
    resolve(g);
    expect(g.obj(g.id('p1', 'silverquill-silencer')).chosenName).toBe('shock');
    g.do({ type: 'passPriority', player: 'p1' });
    cast(g, 'shock', [{ player: 'p1' }]);
    resolve(g);
    expect(g.life('p2')).toBe(17);
    expect(hand(g, 'p1')).toBe(1);
  });
});

describe('Lorehold (R/W)', () => {
  it('Flamescroll Celebrant pings an opponent who activates an ability; pumps for {1}{R}', () => {
    const g = game({
      p1: { battlefield: ['flamescroll-celebrant', ...lands('mountain', 2)] },
      p2: { battlefield: ['kelpie-guide', ...lands('island', 1)] },
      active: 'p2',
    });
    const guide = g.id('p2', 'kelpie-guide');
    g.obj(guide).summoningSick = false;
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === guide && a.abilityIndex === 0)!;
    g.do({ ...act, targets: [g.ref(g.id('p2', 'island'))] } as never);
    resolve(g);
    expect(g.life('p2')).toBe(19);
  });

  it('Revel in Silence: the opponent cannot cast spells or activate loyalty abilities this turn', () => {
    const g = game({
      p1: { hand: ['flamescroll-celebrant'], battlefield: lands('plains', 2) },
      p2: { hand: ['shock'], battlefield: [...lands('mountain', 1), 'lukka-wayward-bonder'] },
    });
    cast(g, 'flamescroll-celebrant', [], { back: true });
    resolve(g);
    expect(zone(g, 'p1', 'exile')).toEqual(['flamescroll-celebrant']);
    g.do({ type: 'passPriority', player: 'p1' });
    expect(g.actor).toBe('p2');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    expect(g.state.turn.noLoyalty).toEqual(['p2']);
  });

  it('Velomachus Lorehold casts an instant or sorcery from the top seven, free, by mana value up to its power', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'velomachus-lorehold', sick: false }],
        library: ['forest', 'forest', 'shock', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    g.passBoth().passBoth();
    g.attack(g.id('p1', 'velomachus-lorehold'));
    resolve(g);
    expect(g.decision.kind).toBe('castFree');
    const free = g.legal().find((a) => a.type === 'castSpell')!;
    g.do({ ...free, targets: [{ player: 'p2' }] } as never);
    resolve(g);
    expect(g.life('p2')).toBe(18);
    // The rest went to the bottom.
    expect(g.state.players.p1.library).toHaveLength(7);
  });

  it('Lorehold Excavation: a land gains 1 life, a nonland deals 1 damage; makes Spirits from the graveyard', () => {
    const run = (top: string) => {
      const g = game({
        p1: { battlefield: ['lorehold-excavation'], library: [top, 'forest', 'forest'] },
        step: 'main2',
      });
      g.passUntilStep('end');
      resolve(g);
      return g;
    };
    const land = run('forest');
    expect(land.life('p1')).toBe(21);
    expect(land.life('p2')).toBe(20);
    const spell = run('shock');
    expect(spell.life('p2')).toBe(19);
    expect(zone(spell, 'p1', 'graveyard')).toEqual(['shock']);
    const g = game({
      p1: {
        battlefield: ['lorehold-excavation', ...lands('mountain', 5)],
        graveyard: ['savannah-lions'],
      },
    });
    activate(g, g.id('p1', 'lorehold-excavation'), 1);
    resolve(g);
    const spirit = g.state.battlefield.find((id) => g.obj(id).defId === 'lorehold-spirit-token')!;
    expect(g.obj(spirit).tapped).toBe(true);
    expect(zone(g, 'p1', 'graveyard')).toEqual([]);
  });

  it('Plargg: {T}, discard: draw; the big ability casts a cheap nonlegendary card free', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: [{ card: 'plargg-dean-of-chaos', sick: false }, ...lands('mountain', 5)],
        library: ['plargg-dean-of-chaos', 'serra-angel', 'shock', 'forest'],
      },
    });
    const plargg = g.id('p1', 'plargg-dean-of-chaos');
    activate(g, plargg, 1);
    resolve(g);
    // Plargg is legendary, Serra Angel costs five: Shock is the first card that qualifies.
    expect(g.decision.kind).toBe('castFree');
    const free = g.legal().find((a) => a.type === 'castSpell')!;
    g.do({ ...free, targets: [{ player: 'p2' }] } as never);
    resolve(g);
    expect(g.life('p2')).toBe(18);
    const g2 = game({
      p1: {
        hand: ['forest'],
        battlefield: [{ card: 'plargg-dean-of-chaos', sick: false }],
        library: ['shock', 'forest'],
      },
    });
    activate(g2, g2.id('p1', 'plargg-dean-of-chaos'), 0);
    resolve(g2);
    expect(zone(g2, 'p1', 'hand')).toEqual(['shock']);
    expect(zone(g2, 'p1', 'graveyard')).toEqual(['forest']);
  });

  it('Augusta: tapped creatures get +1/+0, untapped +0/+1; attacking untaps your creatures', () => {
    const g = game({
      p1: {
        hand: ['plargg-dean-of-chaos'],
        battlefield: [
          ...lands('plains', 3),
          { card: 'savannah-lions', tapped: true },
          'llanowar-elves',
        ],
      },
    });
    cast(g, 'plargg-dean-of-chaos', [], { back: true });
    resolve(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 1]);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 2]);
  });

  it('Hofri Ghostforge: Spirits get +1/+1, trample and haste; a nontoken creature dying comes back as a Spirit copy', () => {
    const g = game({
      p1: { battlefield: ['hofri-ghostforge', 'savannah-lions'] },
      p2: { hand: ['shock', 'shock'], battlefield: lands('mountain', 2) },
      active: 'p2',
    });
    const lion = g.id('p1', 'savannah-lions');
    cast(g, 'shock', [g.ref(lion)]);
    resolve(g);
    expect(g.zoneOf(lion)).toBe('exile');
    const token = g.state.battlefield.find(
      (id) => g.obj(id).defId === 'savannah-lions' && g.obj(id).isToken,
    )!;
    // A 2/1 Spirit with Hofri's +1/+1.
    expect(pt(g, token)).toEqual([3, 2]);
    expect(g.obj(token).addedSubtypes).toContain('Spirit');
    // When the token leaves, the exiled card goes to its owner's graveyard.
    cast(g, 'shock', [g.ref(token)]);
    resolve(g);
    expect(g.zoneOf(token)).toBe('gone');
    expect(g.zoneOf(lion)).toBe('graveyard');
  });

  it('Radiant Scrollwielder: instants and sorceries have lifelink; an instant from the graveyard is castable and then exiled', () => {
    const g = game({
      p1: {
        battlefield: ['radiant-scrollwielder', ...lands('mountain', 1)],
        graveyard: ['shock'],
      },
      step: 'untap',
    });
    g.passUntilStep('upkeep');
    resolve(g);
    const shock = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'shock')!;
    expect(shock).toBeDefined();
    const c = g.legal().find((a) => a.type === 'castSpell' && a.card === shock)!;
    g.do({ ...c, targets: [{ player: 'p2' }] } as never);
    resolve(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    expect(zone(g, 'p1', 'exile')).toEqual(['shock']);
    expect(zone(g, 'p1', 'graveyard')).toEqual([]);
  });

  it('Reconstruct History returns one card of each type from your graveyard, then is exiled', () => {
    const g = game({
      p1: {
        hand: ['reconstruct-history'],
        battlefield: [...lands('mountain', 2), ...lands('plains', 2)],
        graveyard: ['sol-ring', 'pacifism', 'shock', 'savannah-lions'],
      },
    });
    const ring = g.id('p1', 'sol-ring', 'graveyard');
    const pac = g.id('p1', 'pacifism', 'graveyard');
    const shock = g.id('p1', 'shock', 'graveyard');
    cast(g, 'reconstruct-history', [g.ref(ring), g.ref(pac), g.ref(shock)]);
    resolve(g);
    expect(zone(g, 'p1', 'hand').sort()).toEqual(['pacifism', 'shock', 'sol-ring']);
    expect(zone(g, 'p1', 'graveyard')).toEqual(['savannah-lions']);
    expect(zone(g, 'p1', 'exile')).toEqual(['reconstruct-history']);
  });

  it('Thrilling Discovery gains 2 life; discarding two draws three', () => {
    const g = game({
      p1: {
        hand: ['thrilling-discovery', 'forest', 'forest', 'forest'],
        battlefield: [...lands('mountain', 1), ...lands('plains', 1)],
      },
    });
    cast(g, 'thrilling-discovery');
    resolve(g);
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    answerAll(g);
    expect(g.life('p1')).toBe(22);
    expect(hand(g, 'p1')).toBe(4);
    expect(zone(g, 'p1', 'graveyard').filter((d) => d === 'forest')).toHaveLength(2);
  });
});

describe('modal double-faced backs', () => {
  it('Shaile puts a counter on each creature that entered this turn; Embrose pings and draws', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: 'shaile-dean-of-radiance', sick: false },
          'savannah-lions',
          'llanowar-elves',
        ],
      },
    });
    g.obj(g.id('p1', 'llanowar-elves')).zoneTurn = g.state.turn.number - 1;
    g.obj(g.id('p1', 'savannah-lions')).zoneTurn = g.state.turn.number;
    activate(g, g.id('p1', 'shaile-dean-of-radiance'));
    resolve(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'llanowar-elves')).plusOneCounters).toBe(0);
    const h = game({
      p1: {
        hand: ['shaile-dean-of-radiance'],
        battlefield: [...lands('swamp', 4), 'llanowar-elves'],
      },
    });
    cast(h, 'shaile-dean-of-radiance', [], { back: true });
    resolve(h);
    const embrose = h.id('p1', 'embrose-dean-of-shadow');
    h.obj(embrose).summoningSick = false;
    const elves = h.id('p1', 'llanowar-elves');
    const act = h.legal().find((a) => a.type === 'activateAbility' && a.source === embrose)!;
    h.do({ ...act, targets: [h.ref(elves)] } as never);
    resolve(h);
    // +1/+1 counter, then 2 damage: a 2/2 Elves survives the damage? It has toughness 2, so it dies; Embrose draws.
    expect(h.zoneOf(elves)).toBe('graveyard');
    expect(hand(h, 'p1')).toBe(1);
  });

  it('Lukka, Wayward Bonder: loots, reanimates with haste and exiles at your next upkeep', () => {
    const g = game({
      p1: {
        hand: ['mila-crafty-companion', 'savannah-lions'],
        battlefield: lands('mountain', 6),
        graveyard: ['llanowar-elves'],
        library: n('forest', 5),
      },
    });
    cast(g, 'mila-crafty-companion', [], { back: true });
    resolve(g);
    const lukka = g.id('p1', 'lukka-wayward-bonder');
    expect(g.obj(lukka).counters?.loyalty).toBe(5);
    // +1: discard the creature card, draw two.
    activate(g, lukka, 0);
    resolve(g);
    pick(g, /Discard Savannah Lions/);
    resolve(g);
    expect(hand(g, 'p1')).toBe(2);
    expect(g.obj(lukka).counters?.loyalty).toBe(6);
    // Only one loyalty ability a turn.
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === lukka && a.abilityIndex === 1),
    ).toBe(false);
    // Next turn: -2 brings the Elves back with haste.
    g.obj(lukka).onceTurns = {};
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === lukka && a.abilityIndex === 1)!;
    const elves = g.id('p1', 'llanowar-elves', 'graveyard');
    g.do({ ...act, targets: [g.ref(elves)] } as never);
    resolve(g);
    expect(g.zoneOf(elves)).toBe('battlefield');
    expect(g.obj(lukka).counters?.loyalty).toBe(4);
    expect(g.obj(elves).grantedKeywords).toContain('haste');
    // Exiled as your next upkeep begins.
    for (let i = 0; i < 120; i++) {
      if (
        g.state.turn.step === 'upkeep' &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.number > 3
      ) {
        answerAll(g);
        break;
      }
      if (g.decision.kind === 'priority') g.pass();
      else answerAll(g);
    }
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.zoneOf(elves)).toBe('exile');
  });

  it('Lukka, Wayward Bonder: the emblem deals damage equal to the power of each creature that enters', () => {
    const g = game({
      p1: {
        hand: ['mila-crafty-companion', 'savannah-lions'],
        battlefield: [...lands('mountain', 6), 'plains'],
      },
    });
    cast(g, 'mila-crafty-companion', [], { back: true });
    resolve(g);
    const lukka = g.id('p1', 'lukka-wayward-bonder');
    g.obj(lukka).counters = { loyalty: 7 };
    activate(g, lukka, 2);
    resolve(g);
    expect(g.state.emblems).toHaveLength(1);
    cast(g, 'savannah-lions');
    g.passBoth();
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      ),
    );
    expect(g.life('p2')).toBe(18);
  });

  it('Mila: an opponent attacking your planeswalker puts a loyalty counter on each of your planeswalkers', () => {
    const g = game({
      p1: { battlefield: ['mila-crafty-companion', 'lukka-wayward-bonder'] },
      p2: { battlefield: [{ card: 'savannah-lions', sick: false }] },
      active: 'p2',
    });
    const lukka = g.id('p1', 'lukka-wayward-bonder');
    g.obj(lukka).counters = { loyalty: 5 };
    g.passBoth().passBoth();
    const attacker = g.id('p2', 'savannah-lions');
    g.do({
      type: 'addAttacker',
      player: 'p2',
      attacker,
      defender: 'p1',
      planeswalker: lukka,
    } as never);
    g.do({ type: 'confirmAttackers', player: 'p2' });
    answerAll(g);
    expect(g.obj(lukka).counters?.loyalty).toBe(6);
  });
});
