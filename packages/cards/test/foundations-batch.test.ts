import {
  createEngine,
  getCharacteristics,
  playRandomGame,
  redactFor,
  type TargetChoice,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { createHeuristicBot } from '../../ai/src/index.ts';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import {
  FOUNDATIONS_BATCH_BEHAVIORS,
  FOUNDATIONS_BATCH_VANILLA,
} from '../src/foundations-batch.ts';
const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const mana = (land: string, n: number) => Array<string>(n).fill(land);
const cast = (
  g: GameDriver,
  id: string,
  targets: TargetChoice[] = [],
  extra: { kicked?: boolean } = {},
) =>
  g
    .do({ type: 'castSpell', player: g.actor, card: g.id(g.actor, id, 'hand'), targets, ...extra })
    .passBoth();

describe('Foundations additions: rules', () => {
  it('Day of Judgment destroys creatures without targeting, but respects indestructible', () => {
    const g = game({
      p1: { hand: ['day-of-judgment'], battlefield: mana('plains', 4) },
      p2: { battlefield: ['llanowar-elves', 'zetalpa-primal-dawn'] },
    });
    const elf = g.id('p2', 'llanowar-elves'),
      zetalpa = g.id('p2', 'zetalpa-primal-dawn');
    cast(g, 'day-of-judgment');
    expect(g.zoneOf(elf)).toBe('graveyard');
    expect(g.zoneOf(zetalpa)).toBe('battlefield');
  });
  it('Negate cannot target creature spells and counters a noncreature spell', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['negate'], battlefield: mana('island', 2) },
      p2: { hand: ['shock', 'llanowar-elves'], battlefield: ['mountain', 'forest'] },
    });
    const elf = g.id('p2', 'llanowar-elves', 'hand');
    g.do({ type: 'castSpell', player: 'p2', card: elf, targets: [] }).pass();
    expect(
      engine.getLegalActions(g.state, 'p1').filter((a) => a.type === 'castSpell'),
    ).toHaveLength(0);
    g.passBoth();
    g.pass();
    const shock = g.id('p2', 'shock', 'hand');
    g.do({ type: 'castSpell', player: 'p2', card: shock, targets: [{ player: 'p1' }] }).pass();
    cast(g, 'negate', [g.ref(shock)]);
    expect(g.zoneOf(shock)).toBe('graveyard');
    expect(g.life('p1')).toBe(20);
  });
  it('Think Twice draws from hand, then flashback draws and exiles it', () => {
    const g = game({ p1: { hand: ['think-twice'], battlefield: mana('island', 5) } });
    const card = g.id('p1', 'think-twice', 'hand');
    cast(g, 'think-twice');
    expect(g.state.players.p1.hand).toHaveLength(1);
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] }).passBoth();
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(g.zoneOf(card)).toBe('exile');
  });
  it('Blanchwood Armor counts its controllerâ€™s Forests and updates as lands enter', () => {
    const g = game({
      p1: { hand: ['blanchwood-armor', 'forest'], battlefield: [...mana('forest', 3), 'island'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elf = g.id('p2', 'llanowar-elves');
    cast(g, 'blanchwood-armor', [g.ref(elf)]);
    expect(getCharacteristics(g.state, cardDb, elf).power).toBe(4);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(getCharacteristics(g.state, cardDb, elf).toughness).toBe(5);
  });
  it('Adventuring Gear pumps its equipped creature for landfall, not the Equipment', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['adventuring-gear', 'llanowar-elves', 'forest'] },
    });
    const elf = g.id('p1', 'llanowar-elves');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'adventuring-gear'),
      abilityIndex: 1,
      targets: [g.ref(elf)],
    }).passBoth();
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(getCharacteristics(g.state, cardDb, elf).power).toBe(3);
    g.passUntilStep('end').passBoth();
    expect(getCharacteristics(g.state, cardDb, elf).power).toBe(1);
  });
  it('Angel of Finality lets its controller choose either playerâ€™s graveyard', () => {
    const g = game({
      p1: { hand: ['angel-of-finality'], battlefield: mana('plains', 4), graveyard: ['shock'] },
      p2: { graveyard: ['llanowar-elves', 'forest'] },
    });
    cast(g, 'angel-of-finality');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [{ player: 'p2' }] }).passBoth();
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(g.state.players.p2.exile).toHaveLength(2);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });
  it('Ambush Wolf can exile a graveyard card without treating it as a permanent', () => {
    const g = game({
      p1: { hand: ['ambush-wolf'], battlefield: mana('forest', 3) },
      p2: { graveyard: ['shock'] },
    });
    const shock = g.id('p2', 'shock', 'graveyard');
    cast(g, 'ambush-wolf');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(shock)] }).passBoth();
    expect(g.zoneOf(shock)).toBe('exile');
  });
  it('Elvish Regrower targets a permanent card, not an instant, and returns it to hand', () => {
    const g = game({
      p1: {
        hand: ['elvish-regrower'],
        battlefield: mana('forest', 4),
        graveyard: ['shock', 'forest'],
      },
    });
    const forest = g.id('p1', 'forest', 'graveyard');
    cast(g, 'elvish-regrower');
    const options = engine.getLegalActions(g.state, 'p1');
    expect(options.filter((a) => a.type === 'chooseTargets')).toHaveLength(1);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(forest)] }).passBoth();
    expect(g.zoneOf(forest)).toBe('hand');
  });
  it('Solemn Simulacrum offers a resolution-time search, including declining it', () => {
    const decline = game({ p1: { hand: ['solemn-simulacrum'], battlefield: mana('forest', 4) } });
    cast(decline, 'solemn-simulacrum');
    expect(decline.decision.kind).toBe('priority');
    decline.passBoth();
    expect(decline.decision.kind).toBe('optionalEffect');
    const library = [...decline.state.players.p1.library];
    decline.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(decline.state.players.p1.library).toEqual(library);
    const g = game({
      p1: {
        hand: ['solemn-simulacrum'],
        battlefield: mana('forest', 4),
        library: ['plains', 'shock'],
      },
    });
    cast(g, 'solemn-simulacrum');
    g.passBoth().do({ type: 'chooseEffect', player: 'p1', accept: true });
    const plains = g.id('p1', 'plains', 'library');
    g.do({ type: 'chooseCard', player: 'p1', card: plains });
    expect(g.zoneOf(plains)).toBe('battlefield');
    expect(g.obj(plains).tapped).toBe(true);
  });
  it('Mentor of the Meek asks whether to pay at resolution and a bot can choose the draw', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['mentor-of-the-meek', ...mana('forest', 2)] },
    });
    cast(g, 'llanowar-elves');
    g.passBoth();
    expect(g.decision.kind).toBe('optionalEffect');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(1);
    const bot = createHeuristicBot(cardDb);
    const action = bot.chooseAction(redactFor(g.state, 'p1', cardDb), 'p1');
    expect(action).toEqual({ type: 'chooseEffect', player: 'p1', accept: true });
    g.do(action);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(2);
  });
  it('Rune-Scarred Demon cannot fail an unrestricted search; Vile Entomber puts its choice in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['rune-scarred-demon'],
        battlefield: mana('swamp', 7),
        library: ['shock', 'forest'],
      },
    });
    cast(g, 'rune-scarred-demon');
    g.passBoth();
    expect(
      engine.getLegalActions(g.state, 'p1').some((a) => a.type === 'chooseCard' && a.card === null),
    ).toBe(false);
    const shock = g.id('p1', 'shock', 'library');
    g.do({ type: 'chooseCard', player: 'p1', card: shock });
    expect(g.zoneOf(shock)).toBe('hand');
    const e = game({
      p1: { hand: ['vile-entomber'], battlefield: mana('swamp', 4), library: ['shock'] },
    });
    cast(e, 'vile-entomber');
    e.passBoth();
    const choice = e.id('p1', 'shock', 'library');
    e.do({ type: 'chooseCard', player: 'p1', card: choice });
    expect(e.zoneOf(choice)).toBe('graveyard');
  });
  it('Fierce Empathâ€™s filtered search permits failing to find, and excludes cheaper creatures', () => {
    const g = game({
      p1: {
        hand: ['fierce-empath'],
        battlefield: mana('forest', 3),
        library: ['llanowar-elves', 'zetalpa-primal-dawn'],
      },
    });
    cast(g, 'fierce-empath');
    g.passBoth().do({ type: 'chooseEffect', player: 'p1', accept: true });
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw Error('Missing search');
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['zetalpa-primal-dawn']);
    expect(
      engine.getLegalActions(g.state, 'p1').some((a) => a.type === 'chooseCard' && a.card === null),
    ).toBe(true);
  });
  it('Clinquant Skymage triggers on every draw; Erudite Wizard only on the second', () => {
    const g = game({
      p1: {
        hand: ['quick-study'],
        battlefield: [...mana('island', 3), 'clinquant-skymage', 'erudite-wizard'],
      },
    });
    cast(g, 'quick-study');
    for (let i = 0; i < 3; i++) g.passBoth();
    expect(g.obj(g.id('p1', 'clinquant-skymage')).plusOneCounters).toBe(2);
    expect(g.obj(g.id('p1', 'erudite-wizard')).plusOneCounters).toBe(1);
  });
  it('Hungry Ghoul sacrifices another creature as a cost and cannot sacrifice itself', () => {
    const g = game({ p1: { battlefield: ['hungry-ghoul', 'llanowar-elves', 'swamp'] } });
    const ghoul = g.id('p1', 'hungry-ghoul'),
      elf = g.id('p1', 'llanowar-elves');
    expect(
      engine
        .getLegalActions(g.state, 'p1')
        .filter((a) => a.type === 'activateAbility' && a.source === ghoul)
        .every((a) => a.type === 'activateAbility' && a.sacrifice === elf),
    ).toBe(true);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: ghoul,
      abilityIndex: 0,
      targets: [],
      sacrifice: elf,
    });
    expect(g.zoneOf(elf)).toBe('graveyard');
    g.passBoth();
    expect(g.obj(ghoul).plusOneCounters).toBe(1);
  });
  it('Hare Apparent counts only other Hares, even if its source leaves before resolution', () => {
    const g = game({
      p1: {
        hand: ['hare-apparent', 'unsummon'],
        battlefield: ['hare-apparent', 'hare-apparent', 'plains', ...mana('island', 2)],
      },
    });
    cast(g, 'hare-apparent');
    const hares = g.state.battlefield.filter((id) => g.obj(id).defId === 'hare-apparent');
    const newest = hares[2]!;
    cast(g, 'unsummon', [g.ref(newest)]);
    g.passBoth();
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'rabbit-token')).toHaveLength(2);
  });
  it('kicked Gnarlid Colony enters with two counters and grants trample only to countered creatures', () => {
    const g = game({
      p1: { hand: ['gnarlid-colony'], battlefield: [...mana('forest', 5), 'llanowar-elves'] },
    });
    cast(g, 'gnarlid-colony', [], { kicked: true });
    const colony = g.id('p1', 'gnarlid-colony'),
      elf = g.id('p1', 'llanowar-elves');
    expect(g.obj(colony).plusOneCounters).toBe(2);
    expect(getCharacteristics(g.state, cardDb, colony).keywords.has('trample')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, elf).keywords.has('trample')).toBe(false);
  });
  it('Ghaltaâ€™s reduction uses total creature power and never reduces its two green pips', () => {
    const g = game({
      p1: {
        hand: ['ghalta-primal-hunger'],
        battlefield: ['shivan-dragon', 'terror-of-mount-velus', 'forest', 'forest'],
      },
    });
    cast(g, 'ghalta-primal-hunger');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(2);
    const short = game({
      p1: {
        hand: ['ghalta-primal-hunger'],
        battlefield: ['shivan-dragon', 'terror-of-mount-velus', 'forest'],
      },
    });
    expect(engine.getLegalActions(short.state, 'p1').some((a) => a.type === 'castSpell')).toBe(
      false,
    );
  });
  it('An Offer grants Treasures to the spellâ€™s controller even when the spell cannot be countered', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['an-offer-you-cant-refuse'], battlefield: ['island'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'sphinx-of-the-final-word'] },
    });
    const shock = g.id('p2', 'shock', 'hand');
    g.do({ type: 'castSpell', player: 'p2', card: shock, targets: [{ player: 'p1' }] }).pass();
    cast(g, 'an-offer-you-cant-refuse', [g.ref(shock)]);
    expect(g.zoneOf(shock)).toBe('stack');
    expect(
      g.state.battlefield.filter(
        (id) => g.obj(id).defId === 'treasure-token' && g.obj(id).controller === 'p2',
      ),
    ).toHaveLength(2);
    g.passBoth();
    expect(g.life('p1')).toBe(18);
  });
  it('Prayer of Binding gains life even when no permanent is chosen', () => {
    const g = game({ p1: { hand: ['prayer-of-binding'], battlefield: mana('plains', 4) } });
    cast(g, 'prayer-of-binding');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 }).passBoth();
    expect(g.life('p1')).toBe(22);
  });
  it('Death Baron gives a Skeleton Zombie one bonus, and does not boost itself as a Zombie', () => {
    const g = game({ p1: { battlefield: ['death-baron', 'skeleton-archer'] } });
    const archer = g.id('p1', 'skeleton-archer');
    g.state.objects[archer]!.addedSubtypes = ['Zombie'];
    expect(getCharacteristics(g.state, cardDb, archer).power).toBe(4);
    expect(getCharacteristics(g.state, cardDb, g.id('p1', 'death-baron')).power).toBe(2);
  });
  it('Revenge of the Rats makes tapped Rats per creature card and flashback exiles the spell', () => {
    const g = game({
      p1: {
        hand: ['revenge-of-the-rats'],
        battlefield: mana('swamp', 8),
        graveyard: ['llanowar-elves', 'zetalpa-primal-dawn', 'forest'],
      },
    });
    const spellId = g.id('p1', 'revenge-of-the-rats', 'hand');
    cast(g, 'revenge-of-the-rats');
    const rats = g.state.battlefield.filter((id) => g.obj(id).defId === 'rat-token');
    expect(rats).toHaveLength(2);
    expect(rats.every((id) => g.obj(id).tapped)).toBe(true);
    g.do({ type: 'castSpell', player: 'p1', card: spellId, targets: [] }).passBoth();
    expect(g.zoneOf(spellId)).toBe('exile');
  });
  it('Inspiring Call counts countered creatures and grants indestructible to that group', () => {
    const g = game({
      p1: {
        hand: ['inspiring-call'],
        battlefield: [...mana('forest', 3), 'llanowar-elves', 'kargan-dragonrider'],
      },
    });
    const elf = g.id('p1', 'llanowar-elves'),
      rider = g.id('p1', 'kargan-dragonrider');
    g.state.objects[elf]!.plusOneCounters = 1;
    cast(g, 'inspiring-call');
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(getCharacteristics(g.state, cardDb, elf).keywords.has('indestructible')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, rider).keywords.has('indestructible')).toBe(false);
  });
  it('Cryptic Caves counts itself among five lands, and excludes itself from mana payment', () => {
    const g = game({ p1: { battlefield: ['cryptic-caves', ...mana('forest', 3)] } });
    const cave = g.id('p1', 'cryptic-caves');
    expect(
      engine
        .getLegalActions(g.state, 'p1')
        .some((a) => a.type === 'activateAbility' && a.source === cave),
    ).toBe(false);
    const full = game({ p1: { battlefield: ['cryptic-caves', ...mana('forest', 4)] } });
    const id = full.id('p1', 'cryptic-caves');
    full
      .do({ type: 'activateAbility', player: 'p1', source: id, abilityIndex: 1, targets: [] })
      .passBoth();
    expect(full.zoneOf(id)).toBe('graveyard');
    expect(full.state.players.p1.hand).toHaveLength(1);
  });
  it('Riverâ€™s Rebuke returns only the chosen playerâ€™s nonland permanents', () => {
    const g = game({
      p1: { hand: ['rivers-rebuke'], battlefield: [...mana('island', 6), 'llanowar-elves'] },
      p2: { battlefield: ['forest', 'llanowar-elves', 'basilisk-collar'] },
    });
    const elf = g.id('p2', 'llanowar-elves'),
      collar = g.id('p2', 'basilisk-collar'),
      land = g.id('p2', 'forest');
    cast(g, 'rivers-rebuke', [{ player: 'p2' }]);
    expect(g.zoneOf(elf)).toBe('hand');
    expect(g.zoneOf(collar)).toBe('hand');
    expect(g.zoneOf(land)).toBe('battlefield');
    expect(g.zoneOf(g.id('p1', 'llanowar-elves'))).toBe('battlefield');
  });
  it('Starlight Snare taps the enchanted creature and prevents its normal untap', () => {
    const g = game({
      p1: { hand: ['starlight-snare'], battlefield: mana('island', 3) },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elf = g.id('p2', 'llanowar-elves');
    cast(g, 'starlight-snare', [g.ref(elf)]);
    g.passBoth();
    expect(g.obj(elf).tapped).toBe(true);
    g.passUntilStep('end').passBoth();
    g.passUntilStep('main1');
    expect(g.obj(elf).tapped).toBe(true);
  });
  it('Make Your Move accepts artifacts and power-four creatures, using current power', () => {
    const g = game({
      p1: { hand: ['make-your-move'], battlefield: mana('plains', 3) },
      p2: { battlefield: ['llanowar-elves', 'basilisk-collar', 'shivan-dragon'] },
    });
    const elf = g.id('p2', 'llanowar-elves');
    const legalTargets = () =>
      engine
        .getLegalActions(g.state, 'p1')
        .filter((a) => a.type === 'castSpell')
        .flatMap((a) => (a.type === 'castSpell' ? a.targets : []))
        .filter((t) => 'object' in t)
        .map((t) => ('object' in t ? t.object.id : ''));
    expect(legalTargets()).not.toContain(elf);
    expect(legalTargets()).toContain(g.id('p2', 'basilisk-collar'));
    expect(legalTargets()).toContain(g.id('p2', 'shivan-dragon'));
    g.state.objects[elf]!.plusOneCounters = 3;
    expect(legalTargets()).toContain(elf);
    cast(g, 'make-your-move', [g.ref(elf)]);
    expect(g.zoneOf(elf)).toBe('graveyard');
  });
  it('Mystical Teachings searches for an instant or printed flash card, then supports flashback', () => {
    const g = game({
      p1: {
        hand: ['mystical-teachings'],
        battlefield: [...mana('island', 6), 'swamp'],
        library: ['shock', 'ambush-wolf', 'llanowar-elves', 'day-of-judgment'],
      },
    });
    const wolf = g.id('p1', 'ambush-wolf', 'library');
    const elf = g.id('p1', 'llanowar-elves', 'library');
    const teaching = g.id('p1', 'mystical-teachings', 'hand');
    cast(g, 'mystical-teachings');
    const options = engine.getLegalActions(g.state, 'p1');
    expect(options.some((a) => a.type === 'chooseCard' && a.card === wolf)).toBe(true);
    expect(options.some((a) => a.type === 'chooseCard' && a.card === elf)).toBe(false);
    g.do({ type: 'chooseCard', player: 'p1', card: wolf });
    expect(g.zoneOf(wolf)).toBe('hand');
    g.passUntilStep('end')
      .passBoth()
      .passUntilStep('main1')
      .passUntilStep('end')
      .passBoth()
      .passUntilStep('main1');
    g.do({ type: 'castSpell', player: 'p1', card: teaching, targets: [] }).passBoth();
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(g.zoneOf(teaching)).toBe('exile');
  });
  it('Evolving Wilds sacrifices itself and fetches only a tapped basic land', () => {
    const g = game({
      p1: { battlefield: ['evolving-wilds'], library: ['forest', 'cryptic-caves'] },
    });
    const wilds = g.id('p1', 'evolving-wilds'),
      forest = g.id('p1', 'forest', 'library');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: wilds,
      abilityIndex: 0,
      targets: [],
    }).passBoth();
    expect(g.zoneOf(wilds)).toBe('graveyard');
    expect(
      engine.getLegalActions(g.state, 'p1').filter((a) => a.type === 'chooseCard' && a.card),
    ).toHaveLength(1);
    g.do({ type: 'chooseCard', player: 'p1', card: forest });
    expect(g.zoneOf(forest)).toBe('battlefield');
    expect(g.obj(forest).tapped).toBe(true);
  });
  it('Felidar Retreat lets the player choose counters and vigilance or a Cat Beast', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['felidar-retreat', 'llanowar-elves'] },
    });
    const elf = g.id('p1', 'llanowar-elves');
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 1 }).passBoth();
    expect(g.obj(elf).plusOneCounters).toBe(1);
    expect(getCharacteristics(g.state, cardDb, elf).keywords.has('vigilance')).toBe(true);
  });
  it('Macabre Waltz can return two distinct creatures or choose none and still discard', () => {
    const g = game({
      p1: {
        hand: ['macabre-waltz', 'forest'],
        battlefield: mana('swamp', 2),
        graveyard: ['llanowar-elves', 'ambush-wolf'],
      },
    });
    const elf = g.id('p1', 'llanowar-elves', 'graveyard'),
      wolf = g.id('p1', 'ambush-wolf', 'graveyard');
    cast(g, 'macabre-waltz', [g.ref(elf), g.ref(wolf)]);
    expect(g.zoneOf(elf)).toBe('hand');
    expect(g.zoneOf(wolf)).toBe('hand');
    expect(g.decision.kind).toBe('discard');
    const empty = game({
      p1: { hand: ['macabre-waltz', 'forest'], battlefield: mana('swamp', 2) },
    });
    cast(empty, 'macabre-waltz');
    expect(empty.decision.kind).toBe('discard');
  });
  it('Volley Veteran counts itself and other Goblins, but not other creatures', () => {
    const g = game({
      p1: {
        hand: ['volley-veteran'],
        battlefield: [...mana('mountain', 4), 'goblin-token', 'llanowar-elves'],
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    cast(g, 'volley-veteran');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(dragon)] }).passBoth();
    expect(g.obj(dragon).damage).toBe(2);
  });
  it('new cards play legal, replayable seeded games across the whole batch', () => {
    const ids = [...Object.keys(FOUNDATIONS_BATCH_BEHAVIORS), ...FOUNDATIONS_BATCH_VANILLA].map(
      slug,
    );
    for (let start = 0; start < ids.length; start += 6) {
      const deck = [
        ...ids.slice(start, start + 6).flatMap((id) => Array<string>(4).fill(id)),
        ...['plains', 'island', 'swamp', 'mountain', 'forest'].flatMap((id) =>
          Array<string>(8).fill(id),
        ),
      ];
      const initial = engine.newGame({ decks: { p1: deck, p2: deck }, seed: 100 + start });
      const result = playRandomGame(engine, initial, 900 + start, { maxActions: 8000 });
      expect(result.truncated, `batch ${start}`).toBe(false);
      expect(result.winner).not.toBeNull();
      let state = initial;
      for (const action of result.actions) state = engine.applyAction(state, action).state;
      expect(state).toEqual(result.final);
    }
  }, 60_000); // many full games: slow when the suite runs in parallel
});
