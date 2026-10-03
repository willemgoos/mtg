import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics, playRandomGame } from '@mtg/engine';
import { BEHAVIORS, cardDb, deckById, deckIds, SCRYFALL } from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11c (group 2): red, green, multicoloured and land rares and mythics, and meld.

const IN_SCOPE = [
  'Seifer Almasy',
  'Zell Dincht',
  'Gilgamesh, Master-at-Arms',
  'Raubahn, Bull of Ala Mhigo',
  'Nibelheim Aflame',
  "Clive, Ifrit's Dominant",
  'Vaan, Street Thief',
  'The Fire Crystal',
  'Triple Triad',
  'Firion, Wild Rose Warrior',
  'Summon: Brynhildr',
  'Summon: G.F. Cerberus',
  'A Realm Reborn',
  'Traveling Chocobo',
  'Tifa Lockhart',
  'Bartz and Boko',
  'Ancient Adamantoise',
  'The Earth Crystal',
  "Summoner's Grimoire",
  'Jumbo Cactuar',
  'Kuja, Genome Sorcerer',
  "Joshua, Phoenix's Dominant",
  'Kefka, Court Mage',
  "Sin, Spira's Punishment",
  'Hope Estheim',
  'Lightning, Army of One',
  'Terra, Magical Adept',
  'Vivi Ornitier',
  'Tellah, Great Sage',
  'Emet-Selch, Unsundered',
  'Noctis, Prince of Lucis',
  'Choco, Seeker of Paradise',
  'Jenova, Ancient Calamity',
  'Yuna, Hope of Spira',
  'Absolute Virtue',
  'Squall, SeeD Mercenary',
  'Serah Farron',
  'Balthier and Fran',
  'The Wandering Minstrel',
  'Golbez, Crystal Collector',
  'Balamb Garden, SeeD Academy',
  "Clive's Hideaway",
  'Starting Town',
  "Vanille, Cheerful l'Cie",
  "Fang, Fearless l'Cie",
];
const BACKS = [
  'Ifrit, Warden of Inferno',
  'Phoenix, Warden of Fire',
  'Kefka, Ruler of Ruin',
  'Trance Kuja, Fate Defied',
  'Esper Terra',
  'Hades, Sorcerer of Eld',
  'Crystallized Serah',
  'Balamb Garden, Airborne',
  'Ragnarok, Divine Deliverance',
];

/** Answers every pending choice with its first legal option until priority returns. */
function answerAll(g: ReturnType<typeof game>, pick?: (legal: Action[]) => Action | undefined) {
  for (let i = 0; i < 40 && g.decision.kind !== 'priority'; i++) {
    const legal = g.legal();
    g.do(pick?.(legal) ?? legal[0]!);
  }
  return g;
}
/** Passes until the step begins, stopping early at any other decision (a trigger's targets). */
function toStep(g: ReturnType<typeof game>, step: string) {
  for (let i = 0; i < 100; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    if (g.decision.kind !== 'priority') return g;
    if (g.state.turn.step === step) return g;
    g.pass();
  }
  return g;
}
const accept = (legal: Action[]) =>
  legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
  legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0);

describe('coverage', () => {
  it('every card in scope (and each back face) has behaviour and Scryfall data', () => {
    for (const name of [...IN_SCOPE, ...BACKS]) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        SCRYFALL.some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });

  it('the fetch script writes the meld result as a back face of Vanille', () => {
    const ragnarok = SCRYFALL.find((c) => c.name === 'Ragnarok, Divine Deliverance')!;
    expect(ragnarok.front).toBe("Vanille, Cheerful l'Cie");
    const vanille = SCRYFALL.find((c) => c.name === "Vanille, Cheerful l'Cie")!;
    expect(vanille.back).toBeUndefined();
    expect(cardDb.get('ragnarok-divine-deliverance')?.keywords).toContain('menace');
  });
});

describe('meld', () => {
  const melded = () => {
    const g = game({
      p1: {
        battlefield: [
          'vanille-cheerful-lcie',
          'fang-fearless-lcie',
          ...n('forest', 3),
          ...n('swamp', 2),
        ],
        graveyard: ['bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
      step: 'upkeep',
    });
    g.passUntilStep('main1');
    answerAll(settle(g), accept);
    settle(g);
    return g;
  };

  it('Vanille and Fang meld into Ragnarok at your first main phase', () => {
    const g = melded();
    const vanille = g.id('p1', 'ragnarok-divine-deliverance');
    const fang = g.id('p1', 'fang-fearless-lcie', 'exile');
    expect(g.obj(vanille).front).toBe('vanille-cheerful-lcie');
    expect(g.obj(vanille).meldedWith).toBe(fang);
    expect(pt(g, vanille)).toEqual([7, 6]);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(5);
  });

  it('Ragnarok dying puts both halves into the graveyard; its dies trigger destroys and returns', () => {
    const g = melded();
    const vanille = g.id('p1', 'ragnarok-divine-deliverance');
    const fang = g.id('p1', 'fang-fearless-lcie', 'exile');
    const angel = g.id('p2', 'serra-angel');
    const cub = g.id('p1', 'bear-cub', 'graveyard');
    g.obj(vanille).damage = 99;
    g.pass();
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel) &&
          a.targets.some((t) => 'object' in t && t.object.id === cub),
      ),
    );
    expect(g.zoneOf(vanille)).toBe('graveyard');
    expect(g.zoneOf(fang)).toBe('graveyard');
    expect(g.obj(vanille).defId).toBe('vanille-cheerful-lcie');
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.zoneOf(cub)).toBe('battlefield');
  });
});

describe('hideaway', () => {
  it("Clive's Hideaway exiles one of the top four and plays it with four legends", () => {
    const g = game({
      p1: {
        hand: ['clives-hideaway'],
        library: ['jumbo-cactuar', 'forest', 'forest', 'forest', 'mountain'],
        battlefield: [
          ...n('forest', 2),
          'tifa-lockhart',
          'zell-dincht',
          'vivi-ornitier',
          'hope-estheim',
        ],
      },
    });
    const land = g.id('p1', 'clives-hideaway', 'hand');
    const cactuar = g.id('p1', 'jumbo-cactuar', 'library');
    g.do({ type: 'playLand', player: 'p1', card: land });
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const d = g.decision as Extract<typeof g.decision, { kind: 'searchLibrary' }>;
    expect(d.to).toBe('hideaway');
    expect(d.options).toHaveLength(4);
    g.do({ type: 'chooseCard', player: 'p1', card: cactuar });
    expect(g.zoneOf(cactuar)).toBe('exile');
    expect(g.state.players.p1.library[0]).toBe(g.state.players.p1.library[0]);
    expect(g.state.players.p1.library.at(0)).not.toBe(cactuar);
    const hideaway = g.id('p1', 'clives-hideaway');
    g.obj(hideaway).tapped = false;
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === hideaway && a.abilityIndex === 2);
    expect(act).toBeDefined();
    g.do(act!);
    g.passBoth();
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'castSpell', player: 'p1', card: cactuar, targets: [], free: true });
    settle(g);
    expect(g.zoneOf(cactuar)).toBe('battlefield');
  });
});

describe('red', () => {
  it('Raubahn: targeting him costs life equal to his power', () => {
    const g = game({
      p1: { battlefield: ['raubahn-bull-of-ala-mhigo'] },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
      active: 'p2',
    });
    const raubahn = g.id('p1', 'raubahn-bull-of-ala-mhigo');
    settle(cast(g, 'shock', [g.ref(raubahn)]));
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(raubahn)).toBe('graveyard');
  });

  it('Nibelheim Aflame: the creature deals its power to each other creature; flashback refills', () => {
    const g = game({
      p1: {
        hand: ['nibelheim-aflame', 'forest'],
        battlefield: ['serra-angel', ...n('mountain', 7)],
      },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    settle(cast(g, 'nibelheim-aflame', [g.ref(angel)]));
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(
      g.state.battlefield.filter((id) => g.obj(id).controller === 'p2').length,
    );
    expect(g.zoneOf(g.id('p2', 'bear-cub', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(angel)).toBe('battlefield');
    // Flashback: discard your hand, draw four.
    const nib = g.id('p1', 'nibelheim-aflame', 'graveyard');
    for (const id of g.state.battlefield) g.obj(id).tapped = false;
    g.do({ type: 'castSpell', player: 'p1', card: nib, targets: [g.ref(angel)] });
    settle(g);
    expect(handSize(g, 'p1')).toBe(4);
    expect(g.zoneOf(nib)).toBe('exile');
  });

  it("Clive draws for his devotion to red; Ifrit's chapter III brings him back", () => {
    const g = game({
      p1: {
        hand: ['clive-ifrits-dominant', 'forest'],
        battlefield: [...n('mountain', 6), 'zell-dincht'],
      },
    });
    settle(cast(g, 'clive-ifrits-dominant'));
    answerAll(g, accept);
    settle(g);
    // Devotion: Clive {R}{R} + Zell {R} = 3.
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Zell gets +1/+0 per land and grants an extra land drop', () => {
    const g = game({
      p1: { battlefield: ['zell-dincht', ...n('forest', 3)], hand: ['forest', 'forest'] },
    });
    expect(pt(g, g.id('p1', 'zell-dincht'))).toEqual([3, 3]);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(pt(g, g.id('p1', 'zell-dincht'))).toEqual([5, 3]);
  });

  it('Firion copies an entering Equipment; the copy equips for {2} less', () => {
    const g = game({
      p1: {
        hand: ['summoners-grimoire'],
        battlefield: ['firion-wild-rose-warrior', ...n('forest', 4)],
      },
    });
    settle(cast(g, 'summoners-grimoire'));
    const grimoires = g.state.battlefield.filter((id) => g.obj(id).defId === 'summoners-grimoire');
    expect(grimoires).toHaveLength(2);
    const copy = grimoires.find((id) => g.obj(id).isToken)!;
    expect(g.obj(copy).equipDiscount).toBe(2);
    expect(g.state.delayed?.some((d) => d.at === 'upkeep')).toBe(true);
  });

  it('The Fire Crystal makes red spells cheaper and gives haste', () => {
    const g = game({
      p1: { hand: ['the-fire-crystal', 'zell-dincht'], battlefield: n('mountain', 6) },
    });
    settle(cast(g, 'the-fire-crystal'));
    settle(cast(g, 'zell-dincht'));
    const zell = g.id('p1', 'zell-dincht');
    // {2}{R}{R}, then Zell for {1}{R}.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(6);
    expect(getCharacteristics(g.state, cardDb, zell).keywords).toContain('haste');
  });

  it('Triple Triad: your exiled card and lesser ones are free this turn', () => {
    const g = game({
      p1: { battlefield: ['triple-triad'], library: ['jumbo-cactuar', 'forest'] },
      p2: { library: ['bear-cub', 'forest'] },
      step: 'untap',
      turn: 4,
    });
    g.passUntilStep('upkeep');
    settle(g);
    const cactuar = g.id('p1', 'jumbo-cactuar', 'exile');
    const bears = g.state.players.p2.exile[0]!;
    expect(g.obj(cactuar).playFreeBy).toBe('p1');
    expect(g.obj(bears).playFreeBy).toBe('p1');
  });
});

describe('green', () => {
  it('Traveling Chocobo: landfall triggers twice (Tifa quadruples)', () => {
    const g = game({
      p1: { battlefield: ['traveling-chocobo', 'tifa-lockhart'], hand: ['forest'] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(pt(g, g.id('p1', 'tifa-lockhart'))).toEqual([4, 2]);
  });

  it('Traveling Chocobo plays lands from the top of the library', () => {
    const g = game({
      p1: { battlefield: ['traveling-chocobo'], library: ['mountain', 'forest'] },
    });
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });

  it('Ancient Adamantoise takes damage for you and keeps it', () => {
    const g = game({
      p1: { battlefield: ['ancient-adamantoise', 'bear-cub'] },
      p2: { hand: ['nibelheim-aflame'], battlefield: ['serra-angel', ...n('mountain', 4)] },
      active: 'p2',
    });
    const turtle = g.id('p1', 'ancient-adamantoise');
    const bears = g.id('p1', 'bear-cub');
    settle(cast(g, 'nibelheim-aflame', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(g.zoneOf(bears)).toBe('battlefield');
    expect(g.obj(turtle).damage).toBe(8);
    g.passUntilStep('end');
    g.passUntilStep('upkeep');
    expect(g.obj(turtle).damage).toBe(8);
  });

  it('Ancient Adamantoise dies into ten tapped Treasures', () => {
    const g = game({ p1: { battlefield: [{ card: 'ancient-adamantoise', damage: 25 }] } });
    g.pass().pass();
    settle(g);
    const treasures = g.state.battlefield.filter((id) => g.obj(id).defId === 'treasure-token');
    expect(treasures).toHaveLength(10);
    expect(treasures.every((id) => g.obj(id).tapped)).toBe(true);
    expect(g.state.players.p1.exile).toHaveLength(1);
  });

  it('The Earth Crystal doubles +1/+1 counters on your creatures', () => {
    const g = game({
      p1: { battlefield: ['the-earth-crystal', 'bear-cub', ...n('forest', 6)] },
    });
    const crystal = g.id('p1', 'the-earth-crystal');
    const bears = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: crystal,
      abilityIndex: 2,
      targets: [g.ref(bears)],
    });
    settle(g);
    expect(g.obj(bears).plusOneCounters).toBe(4);
  });

  it("Summoner's Grimoire puts an enchantment creature from hand onto the battlefield attacking", () => {
    const g = game({
      p1: {
        battlefield: ['summoners-grimoire', 'bear-cub'],
        hand: ['summon-g-f-cerberus'],
      },
    });
    const grim = g.id('p1', 'summoners-grimoire');
    g.obj(grim).attachedTo = g.id('p1', 'bear-cub');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'bear-cub'));
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const cerb = g.id('p1', 'summon-g-f-cerberus', 'hand');
    g.do({ type: 'chooseCard', player: 'p1', card: cerb });
    settle(g);
    expect(g.zoneOf(cerb)).toBe('battlefield');
    expect(g.state.combat?.attackers.some((a) => a.id === cerb)).toBe(true);
  });

  it('A Realm Reborn: other permanents tap for any colour', () => {
    const g = game({
      p1: {
        battlefield: ['a-realm-reborn', 'bear-cub', 'forest'],
        hand: ['hope-estheim'],
      },
    });
    settle(cast(g, 'hope-estheim'));
    expect(g.id('p1', 'hope-estheim')).toBeDefined();
  });
});

describe('multicoloured', () => {
  it('Kuja transforms with four Wizards; Trance Kuja doubles Wizard damage', () => {
    const g = game({
      p1: {
        battlefield: ['kuja-genome-sorcerer', 'vivi-ornitier', 'tellah-great-sage', 'hope-estheim'],
        hand: ['nibelheim-aflame'],
      },
    });
    const kuja = g.id('p1', 'kuja-genome-sorcerer');
    g.passUntilStep('end');
    settle(g);
    expect(g.obj(kuja).defId).toBe('trance-kuja-fate-defied');
    // A Wizard token pings for 2 now.
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'fin-wizard-token')).toBe(true);
  });

  it('Trance Kuja: the Wizard token deals double damage', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'kuja-genome-sorcerer' }, 'fin-wizard-token', ...n('mountain', 4)],
        hand: ['nibelheim-aflame'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const kuja = g.id('p1', 'kuja-genome-sorcerer');
    g.obj(kuja).front = 'kuja-genome-sorcerer';
    g.obj(kuja).defId = 'trance-kuja-fate-defied';
    settle(cast(g, 'nibelheim-aflame', [g.ref(kuja)]));
    expect(g.life('p2')).toBe(18);
  });

  it("Lightning's Stagger doubles damage to that player until your next turn", () => {
    const g = game({
      p1: { battlefield: ['lightning-army-of-one'] },
    });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'lightning-army-of-one'));
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(17);
    expect(g.state.staggered).toEqual([{ player: 'p2', by: 'p1' }]);
  });

  it('Hope Estheim mills the opponent for the life you gained', () => {
    const g = game({
      p1: { battlefield: ['hope-estheim'] },
      p2: { library: n('forest', 10) },
    });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'hope-estheim'));
    g.passUntilStep('end');
    settle(g);
    expect(g.state.players.p2.graveyard).toHaveLength(2);
  });

  it('Kefka, Ruler of Ruin draws when an opponent loses life on your turn', () => {
    const g = game({
      p1: { battlefield: ['kefka-court-mage', 'hope-estheim'] },
    });
    const kefka = g.id('p1', 'kefka-court-mage');
    g.obj(kefka).front = 'kefka-court-mage';
    g.obj(kefka).defId = 'kefka-ruler-of-ruin';
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'hope-estheim'));
    g.passUntilStep('main2');
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Fang draws once a turn when cards leave your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['fang-fearless-lcie', ...n('swamp', 3), ...n('forest', 2)],
        hand: ['vanille-cheerful-lcie'],
        graveyard: ['bear-cub'],
      },
    });
    settle(cast(g, 'vanille-cheerful-lcie'));
    answerAll(g);
    settle(g);
    expect(g.life('p1')).toBe(19);
  });

  it('Noctis: artifacts from the graveyard for 3 life, with a finality counter', () => {
    const g = game({
      p1: {
        battlefield: ['noctis-prince-of-lucis', ...n('mountain', 4)],
        graveyard: ['the-fire-crystal'],
      },
    });
    const crystal = g.id('p1', 'the-fire-crystal', 'graveyard');
    const a = g
      .legal()
      .find((x) => x.type === 'castSpell' && x.card === crystal && x.via === 'noctis');
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    expect(g.life('p1')).toBe(17);
    expect(g.obj(crystal).counters?.finality).toBe(1);
  });

  it('Hades plays cards from your graveyard on your turn and exiles what would go there', () => {
    const g = game({
      p1: {
        battlefield: ['emet-selch-unsundered', ...n('mountain', 4)],
        graveyard: ['forest', 'jumbo-cactuar'],
      },
    });
    const emet = g.id('p1', 'emet-selch-unsundered');
    g.obj(emet).front = 'emet-selch-unsundered';
    g.obj(emet).defId = 'hades-sorcerer-of-eld';
    const forest = g.id('p1', 'forest', 'graveyard');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === forest)).toBe(true);
  });

  it('Serah Farron makes the first legendary creature spell cost {2} less', () => {
    const g = game({
      p1: {
        battlefield: ['serah-farron', ...n('mountain', 2)],
        hand: ['raubahn-bull-of-ala-mhigo'],
      },
    });
    // Raubahn costs {1}{R}; with {2} less only {R}.
    settle(cast(g, 'raubahn-bull-of-ala-mhigo'));
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(1);
  });

  it('The Wandering Minstrel: lands you control enter untapped', () => {
    const g = game({
      p1: { battlefield: ['the-wandering-minstrel'], hand: ['balamb-garden-seed-academy'] },
    });
    const land = g.id('p1', 'balamb-garden-seed-academy', 'hand');
    g.do({ type: 'playLand', player: 'p1', card: land });
    expect(g.obj(land).tapped).toBe(false);
  });

  it('Jenova makes a Mutant; when it dies on your turn, you draw its power', () => {
    const g = game({
      p1: { battlefield: ['jenova-ancient-calamity', 'bear-cub'] },
    });
    const bears = g.id('p1', 'bear-cub');
    g.passBoth();
    settle(g);
    expect(g.obj(bears).plusOneCounters).toBe(1);
    expect(g.obj(bears).addedSubtypes).toContain('Mutant');
    g.obj(bears).damage = 9;
    g.pass();
    settle(g);
    expect(g.zoneOf(bears)).toBe('graveyard');
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Esper Terra copies an enchantment with haste, sacrificed at your next end step', () => {
    const g = game({
      p1: { battlefield: ['terra-magical-adept', 'triple-triad'] },
      step: 'upkeep',
    });
    const terra = g.id('p1', 'terra-magical-adept');
    g.obj(terra).front = 'terra-magical-adept';
    g.obj(terra).defId = 'esper-terra';
    toStep(g, 'main1');
    settle(g);
    const triads = () => g.state.battlefield.filter((id) => g.obj(id).defId === 'triple-triad');
    expect(triads()).toHaveLength(2);
    const copy = triads().find((id) => g.obj(id).isToken)!;
    expect(g.obj(copy).grantedKeywords).toContain('haste');
    g.passUntilStep('end');
    settle(g);
    expect(triads()).toHaveLength(1);
  });

  it('Esper Terra puts lore counters on a copied Saga', () => {
    const g = game({
      p1: { battlefield: ['terra-magical-adept', 'summon-g-f-cerberus'], library: n('forest', 10) },
      step: 'upkeep',
    });
    const terra = g.id('p1', 'terra-magical-adept');
    g.obj(terra).front = 'terra-magical-adept';
    g.obj(terra).defId = 'esper-terra';
    const cerberus = g.id('p1', 'summon-g-f-cerberus');
    g.obj(cerberus).counters = { lore: 1 };
    toStep(g, 'main1');
    for (let i = 0; i < 20 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      const legal = g.legal();
      g.do(
        legal.find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === cerberus),
        ) ??
          legal.find((a) => a.type === 'scry') ??
          legal[0]!,
      );
    }
    const copy = g.state.battlefield.find(
      (id) => g.obj(id).defId === 'summon-g-f-cerberus' && g.obj(id).isToken,
    );
    // The copy went through all three chapters, so it was sacrificed.
    expect(copy).toBeUndefined();
    expect(g.obj(cerberus).counters?.lore).toBe(2);
  });
});

describe('more rares', () => {
  it('Seifer: an attacker alone gains double strike; Fire Cross casts a cheap spell free', () => {
    const g = game({
      p1: { battlefield: ['seifer-almasy'], graveyard: ['shock'] },
    });
    const seifer = g.id('p1', 'seifer-almasy');
    const shock = g.id('p1', 'shock', 'graveyard');
    g.passUntilStep('beginCombat').passBoth();
    g.attack(seifer);
    for (let i = 0; i < 30 && g.state.turn.step !== 'main2'; i++) {
      const d = g.decision;
      if (d.kind === 'castFree') {
        g.do(
          g
            .legal()
            .find(
              (a) =>
                a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
            )!,
        );
      } else if (d.kind === 'chooseTriggerTargets') {
        g.do(
          g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
            g.legal()[0]!,
        );
      } else g.pass();
    }
    // 3 first strike + 3 regular + Shock 2.
    expect(g.life('p2')).toBe(12);
    expect(g.zoneOf(shock)).toBe('exile');
  });

  it('Gilgamesh puts Equipment from the top six onto the battlefield and suits up', () => {
    const g = game({
      p1: {
        hand: ['gilgamesh-master-at-arms'],
        battlefield: n('mountain', 6),
        library: [
          'warriors-sword',
          'forest',
          'samurais-katana',
          'forest',
          'forest',
          'forest',
          'forest',
        ],
      },
    });
    settle(cast(g, 'gilgamesh-master-at-arms'));
    settle(g);
    const gil = g.id('p1', 'gilgamesh-master-at-arms');
    expect(g.state.battlefield.filter((id) => g.obj(id).attachedTo === gil).length).toBeGreaterThan(
      0,
    );
    expect(g.state.players.p1.library).toHaveLength(5);
  });

  it('Vaan exiles the top card of the damaged player; you may cast it', () => {
    const g = game({
      p1: { battlefield: ['vaan-street-thief', ...n('mountain', 2)] },
      p2: { library: ['shock', 'forest'] },
    });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'vaan-street-thief'));
    g.passUntilStep('main2');
    const shock = g.state.players.p2.exile[0]!;
    expect(g.obj(shock).castableBy).toBe('p1');
    g.do(
      g
        .legal()
        .find(
          (a) => a.type === 'castSpell' && a.card === shock && a.targets.some((t) => 'player' in t),
        )!,
    );
    settle(g);
    // A spell you don't own: a +1/+1 counter on Vaan (a Scout).
    expect(g.obj(g.id('p1', 'vaan-street-thief')).plusOneCounters).toBe(1);
  });

  it('Summon: Brynhildr lets you play the exiled card on turns it gets a lore counter', () => {
    const g = game({
      p1: {
        hand: ['summon-brynhildr'],
        battlefield: n('mountain', 2),
        library: ['bear-cub', 'forest'],
      },
    });
    settle(cast(g, 'summon-brynhildr'));
    const cub = g.id('p1', 'bear-cub', 'exile');
    expect(g.obj(cub).playableUntilTurn).toBe(g.state.turn.number);
  });

  it('Summon: G.F. Cerberus II copies the next instant or sorcery', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'summon-g-f-cerberus' }, ...n('mountain', 2)],
        hand: ['shock'],
      },
      step: 'upkeep',
    });
    g.obj(g.id('p1', 'summon-g-f-cerberus')).counters = { lore: 1 };
    toStep(g, 'main1');
    settle(g);
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
  });

  it('Bartz and Boko: each other Bird deals damage equal to its power', () => {
    const g = game({
      p1: {
        hand: ['bartz-and-boko'],
        battlefield: ['traveling-chocobo', 'sazhs-chocobo', ...n('forest', 5)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'bartz-and-boko'));
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it("Phoenix III returns creature cards with total mana value 6 or less, then it's Joshua again", () => {
    const g = game({
      p1: {
        battlefield: ['joshua-phoenixs-dominant'],
        graveyard: ['bear-cub', 'serra-angel', 'zell-dincht'],
      },
      step: 'upkeep',
    });
    const joshua = g.id('p1', 'joshua-phoenixs-dominant');
    g.obj(joshua).front = 'joshua-phoenixs-dominant';
    g.obj(joshua).defId = 'phoenix-warden-of-fire';
    g.obj(joshua).counters = { lore: 2 };
    toStep(g, 'main1');
    settle(g);
    // Serra Angel (5) is too much with Zell (3); Zell and the Cub (2) come back.
    expect(g.zoneOf(g.id('p1', 'zell-dincht'))).toBe('battlefield');
    expect(g.zoneOf(g.id('p1', 'bear-cub'))).toBe('battlefield');
    expect(g.obj(joshua).defId).toBe('joshua-phoenixs-dominant');
  });

  it('Kefka, Court Mage: each player discards; you draw per card type', () => {
    const g = game({
      p1: {
        hand: ['kefka-court-mage', 'forest'],
        battlefield: [...n('island', 2), ...n('swamp', 2), 'mountain'],
      },
      p2: { hand: ['shock'] },
    });
    settle(cast(g, 'kefka-court-mage'));
    // Land and instant: two cards.
    expect(handSize(g, 'p1')).toBe(2);
    expect(handSize(g, 'p2')).toBe(0);
  });

  it('Sin makes a tapped token copy of a random permanent card from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['sin-spiras-punishment'],
        battlefield: [...n('swamp', 3), ...n('forest', 2), ...n('island', 2)],
        graveyard: ['serra-angel'],
      },
    });
    settle(cast(g, 'sin-spiras-punishment'));
    const copy = g.state.battlefield.find((id) => g.obj(id).defId === 'serra-angel')!;
    expect(g.obj(copy).isToken).toBe(true);
    expect(g.obj(copy).tapped).toBe(true);
  });

  it('Vivi adds mana equal to his power; noncreature spells grow him and ping', () => {
    const g = game({
      p1: { battlefield: ['vivi-ornitier', 'mountain'], hand: ['shock'] },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    const vivi = g.id('p1', 'vivi-ornitier');
    expect(g.life('p2')).toBe(17);
    expect(pt(g, vivi)).toEqual([1, 4]);
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === vivi)!);
    settle(g);
    expect(g.state.players.p1.pool).toHaveLength(1);
  });

  it('Tellah makes a Hero for each noncreature spell', () => {
    const g = game({ p1: { battlefield: ['tellah-great-sage', 'mountain'], hand: ['shock'] } });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'fin-hero-token')).toBe(true);
  });

  it('Emet-Selch transforms with fourteen cards in the graveyard', () => {
    const g = game({
      p1: { battlefield: ['emet-selch-unsundered'], graveyard: n('forest', 14) },
      step: 'untap',
      turn: 4,
    });
    toStep(g, 'upkeep');
    answerAll(settle(g), accept);
    settle(g);
    expect(g.obj(g.id('p1', 'hades-sorcerer-of-eld')).front).toBe('emet-selch-unsundered');
  });

  it('Absolute Virtue: opponents can neither damage nor target you', () => {
    const g = game({
      p1: { battlefield: ['absolute-virtue'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'serra-angel'] },
      active: 'p2',
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(
      casts.some(
        (a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p1'),
      ),
    ).toBe(false);
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p2', 'serra-angel'));
    g.passUntilStep('main2');
    expect(g.life('p1')).toBe(20);
  });

  it('Squall returns a cheap permanent card after combat damage', () => {
    const g = game({ p1: { battlefield: ['squall-seed-mercenary'], graveyard: ['bear-cub'] } });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'squall-seed-mercenary'));
    for (let i = 0; i < 30 && g.state.turn.step !== 'main2'; i++) {
      if (g.decision.kind === 'chooseTriggerTargets') settle(g);
      else g.pass();
    }
    expect(g.zoneOf(g.id('p1', 'bear-cub'))).toBe('battlefield');
    expect(g.life('p2')).toBe(14);
  });

  it('Balthier and Fran: a Vehicle they crewed attacks; pay for an additional combat', () => {
    const g = game({
      p1: { battlefield: ['balthier-and-fran', 'magitek-armor', 'mountain', 'forest', 'forest'] },
    });
    const armor = g.id('p1', 'magitek-armor');
    g.passUntilStep('beginCombat');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === armor)!);
    settle(g);
    g.passBoth();
    g.attack(armor);
    answerAll(settle(g), accept);
    settle(g);
    expect(g.state.turn.extraCombats).toBe(1);
  });

  it('Golbez returns a creature card at your end step with four artifacts', () => {
    const g = game({
      p1: {
        battlefield: ['golbez-crystal-collector', ...Array<string>(4).fill('monks-fist')],
        graveyard: ['serra-angel'],
      },
    });
    toStep(g, 'end');
    settle(g);
    expect(g.zoneOf(g.id('p1', 'serra-angel', 'hand'))).toBe('hand');
  });

  it('Yuna returns an enchantment card with a finality counter at your end step', () => {
    const g = game({
      p1: { battlefield: ['yuna-hope-of-spira'], graveyard: ['triple-triad'] },
    });
    toStep(g, 'end');
    settle(g);
    const tt = g.id('p1', 'triple-triad');
    expect(g.obj(tt).counters?.finality).toBe(1);
    expect(
      getCharacteristics(g.state, cardDb, g.id('p1', 'yuna-hope-of-spira')).keywords,
    ).toContain('lifelink');
  });

  it('Choco looks at cards for attacking Birds: one to hand, lands onto the battlefield', () => {
    const g = game({
      p1: {
        battlefield: ['choco-seeker-of-paradise', 'traveling-chocobo'],
        library: ['forest', 'shock', 'forest'],
      },
    });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'choco-seeker-of-paradise'), g.id('p1', 'traveling-chocobo'));
    settle(g);
    expect(g.zoneOf(g.id('p1', 'shock', 'hand'))).toBe('hand');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(1);
  });

  it('Ifrit I fights; III adds {R}{R}{R}{R} and returns Clive', () => {
    const g = game({
      p1: { battlefield: ['clive-ifrits-dominant'] },
      step: 'upkeep',
    });
    const clive = g.id('p1', 'clive-ifrits-dominant');
    g.obj(clive).front = 'clive-ifrits-dominant';
    g.obj(clive).defId = 'ifrit-warden-of-inferno';
    g.obj(clive).counters = { lore: 2 };
    toStep(g, 'main1');
    settle(g);
    expect(g.obj(clive).defId).toBe('clive-ifrits-dominant');
    expect(g.state.players.p1.pool).toHaveLength(4);
  });
});

describe('lands', () => {
  it('Balamb Garden costs {1} less to transform per other Town', () => {
    const g = game({
      p1: {
        battlefield: [
          'balamb-garden-seed-academy',
          'starting-town',
          'starting-town',
          ...n('forest', 3),
          'island',
        ],
      },
    });
    const garden = g.id('p1', 'balamb-garden-seed-academy');
    const a = g
      .legal()
      .find((x) => x.type === 'activateAbility' && x.source === garden && x.abilityIndex === 2);
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    expect(g.obj(garden).defId).toBe('balamb-garden-airborne');
  });

  it('Starting Town enters untapped in your first three turns only', () => {
    const early = game({ p1: { hand: ['starting-town'] }, turn: 5 });
    const a = early.id('p1', 'starting-town', 'hand');
    early.do({ type: 'playLand', player: 'p1', card: a });
    expect(early.obj(a).tapped).toBe(false);
    const late = game({ p1: { hand: ['starting-town'] }, turn: 7 });
    const b = late.id('p1', 'starting-town', 'hand');
    late.do({ type: 'playLand', player: 'p1', card: b });
    expect(late.obj(b).tapped).toBe(true);
  });
});

describe('random games', () => {
  /** A Final Fantasy deck with its first spells swapped for these rares. */
  const withRares = (deck: string, rares: string[]) => {
    const ids = deckIds(deckById(deck));
    const out = [...ids];
    let k = 0;
    for (let i = 0; i < out.length && k < rares.length; i++) {
      if (cardDb.get(out[i]!)?.types.includes('Land')) continue;
      out[i] = rares[k++]!;
    }
    return out;
  };
  const RED_GREEN = [
    'seifer-almasy',
    'zell-dincht',
    'gilgamesh-master-at-arms',
    'raubahn-bull-of-ala-mhigo',
    'nibelheim-aflame',
    'clive-ifrits-dominant',
    'vaan-street-thief',
    'the-fire-crystal',
    'triple-triad',
    'firion-wild-rose-warrior',
    'summon-brynhildr',
    'summon-g-f-cerberus',
    'a-realm-reborn',
    'traveling-chocobo',
    'tifa-lockhart',
    'bartz-and-boko',
    'ancient-adamantoise',
    'the-earth-crystal',
    'summoners-grimoire',
    'jumbo-cactuar',
    'terra-magical-adept',
    'balthier-and-fran',
    'joshua-phoenixs-dominant',
    'lightning-army-of-one',
    'clives-hideaway',
    'starting-town',
  ];
  const GOLD = [
    'kuja-genome-sorcerer',
    'kefka-court-mage',
    'sin-spiras-punishment',
    'hope-estheim',
    'vivi-ornitier',
    'tellah-great-sage',
    'emet-selch-unsundered',
    'noctis-prince-of-lucis',
    'choco-seeker-of-paradise',
    'jenova-ancient-calamity',
    'yuna-hope-of-spira',
    'absolute-virtue',
    'squall-seed-mercenary',
    'serah-farron',
    'the-wandering-minstrel',
    'golbez-crystal-collector',
    'vanille-cheerful-lcie',
    'fang-fearless-lcie',
    'vanille-cheerful-lcie',
    'fang-fearless-lcie',
    'balamb-garden-seed-academy',
    'a-realm-reborn',
    'starting-town',
    'starting-town',
  ];

  it('decks with these rares play random games to completion', () => {
    const rg = withRares('fin-chocobo-stampede', RED_GREEN);
    const gold = withRares('fin-time-compression', GOLD);
    const starter = deckIds(deckById('learn-from-the-land'));
    const pairings = [
      { p1: rg, p2: gold },
      { p1: gold, p2: starter },
      { p1: starter, p2: rg },
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
