import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14b, group D: red and Prismari (U/R).

const SPIRIT = 'sos-spirit-token';
const ELEMENTAL = 'sos-elemental-3-3-flying-token';
const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const pool = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].pool ?? [];
const ref = (
  g: GameDriver,
  player: 'p1' | 'p2',
  defId: string,
  zone: 'battlefield' | 'stack' = 'battlefield',
) => g.ref(g.id(player, defId, zone));
const castCard = (
  g: GameDriver,
  card: string,
  zone: 'hand' | 'graveyard' | 'exile',
  targets: Parameters<typeof cast>[2] = [],
  extra: Parameters<typeof cast>[3] = {},
) =>
  g.do({ type: 'castSpell', player: g.actor, card: g.id(g.actor, card, zone), targets, ...extra });

describe('pool: every card of the group is implemented', () => {
  it('the prepare cards carry their spell faces', () => {
    for (const [front, back] of [
      ['blazing-firesinger', 'seething-song-blazing-firesinger'],
      ['maelstrom-artisan', 'rocket-volley-maelstrom-artisan'],
      ['pigment-wrangler', 'striking-palette-pigment-wrangler'],
      ['strife-scholar', 'awaken-the-ages-strife-scholar'],
      ['sanar-unfinished-genius', 'wild-idea-sanar-unfinished-genius'],
    ] as const) {
      const d = cardDb.get(front)!;
      expect(d.prepare).toBe(true);
      expect(d.back).toBe(back);
      expect(cardDb.get(back)).toBeDefined();
    }
  });
  it('Magmablood Archaic costs three {2/R} pips (mana value 6)', () => {
    const d = cardDb.get('magmablood-archaic')!;
    expect(d.manaCost.twoHybrid).toEqual(['R', 'R', 'R']);
  });
});

describe('red', () => {
  it('Ancestral Anger gives trample and +1 plus one per copy in your graveyard, and draws', () => {
    const g = game({
      p1: {
        hand: ['ancestral-anger'],
        graveyard: ['ancestral-anger'],
        battlefield: ['mountain', 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    const before = handSize(g, 'p1');
    settle(cast(g, 'ancestral-anger', [g.ref(angel)]));
    expect(pt(g, angel)).toEqual([6, 4]);
    expect(keywords(g, angel)).toContain('trample');
    expect(handSize(g, 'p1')).toBe(before);
  });

  it("Archaic's Agony deals one per colour of mana spent and exiles the excess from your library", () => {
    const g = game({
      p1: {
        hand: ['archaics-agony'],
        battlefield: ['mountain', 'island', 'swamp', 'plains', 'forest'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const lib = g.state.players.p1.library.length;
    settle(cast(g, 'archaics-agony', [ref(g, 'p2', 'llanowar-elves')]));
    expect(all(g, 'llanowar-elves')).toHaveLength(0);
    // Five colours, 1 toughness: 4 excess.
    expect(g.state.players.p1.exile).toHaveLength(4);
    expect(g.state.players.p1.library).toHaveLength(lib - 4);
    for (const id of g.state.players.p1.exile) expect(g.obj(id).playableUntilTurn).toBeDefined();
  });

  it('Artistic Process: 6 damage, sweep for 2, or a hasty 3/3 flying Elemental', () => {
    const lands = n('mountain', 5);
    let g = game({
      p1: { hand: ['artistic-process'], battlefield: lands },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(g, 'artistic-process', [ref(g, 'p2', 'serra-angel')], { mode: 0 }));
    expect(all(g, 'serra-angel')).toHaveLength(0);
    g = game({
      p1: { hand: ['artistic-process'], battlefield: [...lands, 'serra-angel'] },
      p2: { battlefield: ['llanowar-elves', 'serra-angel'] },
    });
    settle(cast(g, 'artistic-process', [], { mode: 1 }));
    expect(all(g, 'llanowar-elves')).toHaveLength(0);
    expect(all(g, 'serra-angel')).toHaveLength(2);
    g = game({ p1: { hand: ['artistic-process'], battlefield: lands } });
    settle(cast(g, 'artistic-process', [], { mode: 2 }));
    const [elemental] = all(g, ELEMENTAL);
    expect(pt(g, elemental!)).toEqual([3, 3]);
    expect(keywords(g, elemental!)).toEqual(expect.arrayContaining(['flying', 'haste']));
  });

  it('Charging Strifeknight loots', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['charging-strifeknight'] } });
    const knight = g.id('p1', 'charging-strifeknight');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: knight,
      abilityIndex: 0,
      targets: [],
      discard: g.id('p1', 'shock', 'hand'),
    });
    settle(g);
    expect(g.obj(knight).tapped).toBe(true);
    expect(all(g, 'shock')).toHaveLength(0);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'shock')).toBe(true);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Choreographed Sparks copies an instant, and a creature spell (hasty, sacrificed at the end step)', () => {
    let g = game({
      p1: { hand: ['shock', 'choreographed-sparks'], battlefield: n('mountain', 3) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    cast(g, 'choreographed-sparks', [ref(g, 'p1', 'shock', 'stack')], { mode: 0 });
    settle(g);
    expect(g.life('p2')).toBe(16);
    expect(cardDb.get('choreographed-sparks')!.cantBeCopied).toBe(true);

    g = game({
      p1: {
        hand: ['serra-angel', 'choreographed-sparks'],
        battlefield: [...n('plains', 5), ...n('mountain', 2)],
      },
    });
    cast(g, 'serra-angel', [], { payWith: all(g, 'plains') });
    cast(g, 'choreographed-sparks', [ref(g, 'p1', 'serra-angel', 'stack')], {
      mode: 1,
      payWith: all(g, 'mountain'),
    });
    settle(g);
    const angels = all(g, 'serra-angel');
    expect(angels).toHaveLength(2);
    const token = angels.find((id) => g.obj(id).isToken)!;
    expect(keywords(g, token)).toContain('haste');
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it('Duel Tactics pings and stops a blocker, then flashes back', () => {
    const g = game({
      p1: { hand: ['duel-tactics'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    settle(cast(g, 'duel-tactics', [ref(g, 'p2', 'serra-angel')]));
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(1);
    expect(g.state.effects.some((e) => e.cantBlock)).toBe(true);
    castCard(g, 'duel-tactics', 'graveyard', [ref(g, 'p2', 'llanowar-elves')]);
    settle(g);
    expect(all(g, 'llanowar-elves')).toHaveLength(0);
    expect(g.state.players.p1.exile.some((id) => g.obj(id).defId === 'duel-tactics')).toBe(true);
  });

  it('Expressive Firedancer gets +1/+1, and double strike on a five-mana spell', () => {
    const g = game({
      p1: {
        hand: ['shock', 'artistic-process'],
        battlefield: ['expressive-firedancer', ...n('mountain', 6)],
      },
    });
    const dancer = g.id('p1', 'expressive-firedancer');
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, dancer)).toEqual([3, 3]);
    expect(keywords(g, dancer)).not.toContain('doubleStrike');
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(pt(g, dancer)).toEqual([4, 4]);
    expect(keywords(g, dancer)).toContain('doubleStrike');
  });

  it('Garrison Excavator makes a Spirit when cards leave your graveyard', () => {
    const g = game({
      p1: {
        graveyard: ['duel-tactics'],
        battlefield: ['garrison-excavator', ...n('mountain', 2)],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    castCard(g, 'duel-tactics', 'graveyard', [ref(g, 'p2', 'llanowar-elves')]);
    settle(g);
    const [spirit] = all(g, SPIRIT);
    expect(pt(g, spirit!)).toEqual([2, 2]);
  });

  it('Heated Argument may exile a graveyard card for 2 damage to the controller', () => {
    const g = game({
      p1: { hand: ['heated-argument'], graveyard: ['shock'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'heated-argument', [ref(g, 'p2', 'serra-angel')]);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.exile.some((id) => g.obj(id).defId === 'shock')).toBe(true);
  });

  it('Impractical Joke hits a creature or planeswalker', () => {
    const g = game({
      p1: { hand: ['impractical-joke'], battlefield: ['mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(g, 'impractical-joke', [ref(g, 'p2', 'serra-angel')]));
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
  });

  it('Improvisation Capstone (paradigm) exiles to four mana value and casts any number free', () => {
    const g = game({
      p1: {
        hand: ['improvisation-capstone'],
        library: ['shock', 'shock', 'shock', 'shock', 'forest', 'forest'],
        battlefield: n('mountain', 7),
      },
    });
    cast(g, 'improvisation-capstone');
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    expect(g.state.players.p1.exile).toHaveLength(4);
    const shocks = () => g.state.players.p1.exile.filter((id) => g.obj(id).defId === 'shock');
    const freeShock = () =>
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'castSpell' &&
            a.card === shocks()[0] &&
            a.targets.some((t) => 'player' in t && t.player === 'p2'),
        )!;
    g.do(freeShock());
    // Offered again: any number may be cast.
    expect(g.decision.kind).toBe('castFree');
    g.do(freeShock());
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(g.life('p2')).toBe(16);
    // The paradigm waits for the first main phase of each of your turns.
    expect(g.state.players.p1.paradigms).toContain('improvisation-capstone');
  });

  it('Living History makes a Spirit, and pumps an attacker if a card left your graveyard', () => {
    const g = game({
      p1: {
        hand: ['living-history'],
        graveyard: ['tome-blast'],
        battlefield: [...n('mountain', 7), 'serra-angel'],
      },
    });
    settle(cast(g, 'living-history'));
    expect(all(g, SPIRIT)).toHaveLength(1);
    // Flashback (a card leaves the graveyard), then attack.
    castCard(g, 'tome-blast', 'graveyard', [{ player: 'p2' }]);
    settle(g);
    const angel = g.id('p1', 'serra-angel');
    g.passUntilStep('beginCombat').passBoth().attack(angel);
    settle(g);
    expect(pt(g, angel)).toEqual([6, 4]);
  });

  it('Living History does nothing when no card left the graveyard', () => {
    const g = game({ p1: { battlefield: ['living-history', 'serra-angel'] } });
    const angel = g.id('p1', 'serra-angel');
    g.passUntilStep('beginCombat').passBoth().attack(angel);
    settle(g);
    expect(pt(g, angel)).toEqual([4, 4]);
  });

  it('Maelstrom Artisan enters prepared; Rocket Volley can only hit a nonbasic land', () => {
    const g = game({
      p1: { hand: ['maelstrom-artisan'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['mountain', 'wind-scarred-crag'] },
    });
    settle(cast(g, 'maelstrom-artisan'));
    const copy = g.obj(g.id('p1', 'maelstrom-artisan')).prepared!;
    expect(copy).toBeDefined();
    const casts = g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === copy);
    expect(casts.length).toBeGreaterThan(0);
    for (const a of casts)
      if (a.type === 'castSpell')
        expect(
          a.targets.every((t) => 'object' in t && t.object.id === g.id('p2', 'wind-scarred-crag')),
        ).toBe(true);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: copy,
      targets: [ref(g, 'p2', 'wind-scarred-crag')],
    });
    settle(g);
    expect(all(g, 'wind-scarred-crag')).toHaveLength(0);
    expect(all(g, 'mountain').filter((id) => g.obj(id).controller === 'p2')).toHaveLength(1);
  });

  it('Magmablood Archaic is paid with {R} or two generic per pip, with a counter per colour', () => {
    const g = game({
      p1: {
        hand: ['magmablood-archaic', 'shock'],
        battlefield: ['mountain', 'mountain', 'island', 'forest', 'mountain'],
      },
    });
    const [m1, m2, island, forest] = [
      ...all(g, 'mountain').slice(0, 2),
      g.id('p1', 'island'),
      g.id('p1', 'forest'),
    ];
    cast(g, 'magmablood-archaic', [], { payWith: [m1!, m2!, island!, forest!] });
    settle(g);
    const archaic = g.id('p1', 'magmablood-archaic');
    // Red, blue and green were spent.
    expect(g.obj(archaic).plusOneCounters).toBe(3);
    expect(pt(g, archaic)).toEqual([5, 5]);
    // A one-colour spell pumps your creatures by one.
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, archaic)).toEqual([6, 5]);
  });

  it('Mica sacrifices an artifact to copy an instant or sorcery you cast', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mica-reader-of-ruins', 'sol-ring', 'mountain'] },
    });
    cast(g, 'shock', [{ player: 'p2' }], { payWith: [g.id('p1', 'mountain')] });
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    settle(g);
    expect(all(g, 'sol-ring')).toHaveLength(0);
    expect(g.life('p2')).toBe(16);
  });

  it('Molten-Core Maestro grows, and adds {R} equal to its power on a five-mana spell', () => {
    const g = game({
      p1: { hand: ['artistic-process'], battlefield: ['molten-core-maestro', ...n('mountain', 5)] },
    });
    const maestro = g.id('p1', 'molten-core-maestro');
    cast(g, 'artistic-process', [], { mode: 2 });
    g.passBoth();
    expect(g.obj(maestro).plusOneCounters).toBe(1);
    expect(pool(g).filter((m) => m.produces[0] === 'R')).toHaveLength(3);
  });

  it('Pigment Wrangler enters prepared; Striking Palette copies your next instant or sorcery', () => {
    const g = game({
      p1: { hand: ['pigment-wrangler', 'shock'], battlefield: n('mountain', 7) },
    });
    settle(cast(g, 'pigment-wrangler'));
    const copy = g.obj(g.id('p1', 'pigment-wrangler')).prepared!;
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    settle(g);
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
  });

  it('Rubble Rouser exiles a graveyard card for {R} and pings each opponent', () => {
    const g = game({ p1: { graveyard: ['shock'], battlefield: ['rubble-rouser'] } });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'rubble-rouser'),
      abilityIndex: 1,
      targets: [],
    });
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(pool(g)).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Seize the Spoils discards a card to draw two and make a Treasure', () => {
    const g = game({
      p1: { hand: ['seize-the-spoils', 'shock'], battlefield: n('mountain', 3) },
    });
    cast(g, 'seize-the-spoils', [], { discard: g.id('p1', 'shock', 'hand') });
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('Steal the Show counts instants and sorceries in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['steal-the-show'],
        graveyard: ['shock', 'shock', 'tome-blast', 'llanowar-elves'],
        battlefield: n('mountain', 3),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    // Modes in printed order: discard/draw, damage, both.
    cast(g, 'steal-the-show', [ref(g, 'p2', 'serra-angel')], { mode: 1 });
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
  });

  it('Strife Scholar enters prepared; Awaken the Ages makes two Spirits', () => {
    const g = game({
      p1: { hand: ['strife-scholar'], battlefield: n('mountain', 9) },
    });
    settle(cast(g, 'strife-scholar'));
    const copy = g.obj(g.id('p1', 'strife-scholar')).prepared!;
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    settle(g);
    expect(all(g, SPIRIT)).toHaveLength(2);
  });

  it('Tablet of Discovery mills a card you may play this turn, and taps for RR for spells', () => {
    const g = game({
      p1: {
        hand: ['tablet-of-discovery', 'artistic-process'],
        library: ['mountain', 'forest', 'forest'],
        battlefield: n('mountain', 6),
      },
    });
    cast(g, 'tablet-of-discovery', [], { payWith: all(g, 'mountain').slice(0, 3) });
    settle(g);
    const milled = g.state.players.p1.graveyard[0]!;
    expect(g.obj(milled).defId).toBe('mountain');
    expect(g.legal('p1').some((a) => a.type === 'playLand' && a.card === milled)).toBe(true);
    g.do({ type: 'playLand', player: 'p1', card: milled });
    expect(all(g, 'mountain')).toHaveLength(7);
    // Three untapped Mountains and the Tablet's RR: five mana for a five-mana sorcery.
    const spent = all(g, 'mountain').filter((id) => g.obj(id).tapped);
    expect(spent).toHaveLength(3);
    cast(g, 'artistic-process', [], {
      mode: 2,
      payWith: [
        ...all(g, 'mountain')
          .filter((id) => !g.obj(id).tapped)
          .slice(0, 3),
        g.id('p1', 'tablet-of-discovery'),
        g.id('p1', 'tablet-of-discovery'),
      ],
    });
    settle(g);
    expect(all(g, ELEMENTAL)).toHaveLength(1);
  });

  it('Thunderdrum Soloist pings each opponent, for 3 on a five-mana spell', () => {
    const g = game({
      p1: {
        hand: ['shock', 'artistic-process'],
        battlefield: ['thunderdrum-soloist', ...n('mountain', 6)],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(g.life('p2')).toBe(14);
  });

  it('Tome Blast deals 2 and flashes back', () => {
    const g = game({ p1: { hand: ['tome-blast'], battlefield: n('mountain', 7) } });
    settle(cast(g, 'tome-blast', [{ player: 'p2' }]));
    castCard(g, 'tome-blast', 'graveyard', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('Unsubtle Mockery deals 4 to a creature', () => {
    const g = game({
      p1: { hand: ['unsubtle-mockery'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'unsubtle-mockery', [ref(g, 'p2', 'serra-angel')]);
    settle(g);
    // Surveil 1: keep it on top.
    g.do({ type: 'scry', player: 'p1', top: g.state.players.p1.library.slice(0, 1), bottom: [] });
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('Zealous Lorecaster returns an instant or sorcery card', () => {
    const g = game({
      p1: {
        hand: ['zealous-lorecaster'],
        graveyard: ['shock', 'llanowar-elves'],
        battlefield: n('mountain', 6),
      },
    });
    cast(g, 'zealous-lorecaster');
    settle(g);
    expect(g.state.players.p1.hand.some((id) => g.obj(id).defId === 'shock')).toBe(true);
  });
});

describe('Prismari', () => {
  it('Abstract Paintmage adds {U}{R} at your first main phase, for instants and sorceries only', () => {
    const g = game({
      p1: { hand: ['shock', 'serra-angel'], battlefield: ['abstract-paintmage'] },
      step: 'upkeep',
    });
    g.passUntilStep('main1');
    settle(g);
    expect(
      pool(g)
        .map((m) => m.produces[0])
        .sort(),
    ).toEqual(['R', 'U']);
    expect(pool(g).every((m) => m.onlyFor === 'InstantOrSorcery')).toBe(true);
    // Shock is payable from it; a creature spell is not.
    expect(
      g.legal('p1').some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'shock', 'hand')),
    ).toBe(true);
    expect(
      g
        .legal('p1')
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'serra-angel', 'hand')),
    ).toBe(false);
  });

  it('Colorstorm Stallion grows, and copies itself on a five-mana spell', () => {
    const g = game({
      p1: { hand: ['artistic-process'], battlefield: ['colorstorm-stallion', ...n('mountain', 5)] },
    });
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(all(g, 'colorstorm-stallion')).toHaveLength(2);
  });

  it('Elemental Mascot exiles a card to play on a five-mana spell', () => {
    const g = game({
      p1: { hand: ['artistic-process'], battlefield: ['elemental-mascot', ...n('mountain', 5)] },
    });
    const mascot = g.id('p1', 'elemental-mascot');
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(pt(g, mascot)).toEqual([2, 4]);
    expect(g.state.players.p1.exile).toHaveLength(1);
    expect(g.obj(g.state.players.p1.exile[0]!).playableUntilTurn).toBeGreaterThan(
      g.state.turn.number,
    );
  });

  it('Prismari Charm: surveil and draw, ping twice, or bounce', () => {
    let g = game({ p1: { hand: ['prismari-charm'], battlefield: ['island', 'mountain'] } });
    cast(g, 'prismari-charm', [], { mode: 0 });
    settle(g);
    if (g.decision.kind !== 'priority')
      g.do({ type: 'scry', player: 'p1', top: g.state.players.p1.library.slice(0, 2), bottom: [] });
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    g = game({
      p1: { hand: ['prismari-charm'], battlefield: ['island', 'mountain'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'prismari-charm', [ref(g, 'p2', 'llanowar-elves'), { player: 'p2' }], { mode: 1 });
    settle(g);
    expect(all(g, 'llanowar-elves')).toHaveLength(0);
    expect(g.life('p2')).toBe(19);
    g = game({
      p1: { hand: ['prismari-charm'], battlefield: ['island', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'prismari-charm', [ref(g, 'p2', 'serra-angel')], { mode: 2 });
    settle(g);
    expect(g.state.players.p2.hand.some((id) => g.obj(id).defId === 'serra-angel')).toBe(true);
  });

  it('Prismari, the Inspiration gives your instants and sorceries storm', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['prismari-the-inspiration', 'mountain', 'mountain'],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    // The second Shock has one spell before it: one copy.
    expect(g.life('p2')).toBe(14);
  });

  it('Rapturous Moment draws three, discards two and adds UURRR', () => {
    const g = game({
      p1: { hand: ['rapturous-moment'], battlefield: [...n('island', 3), ...n('mountain', 3)] },
    });
    cast(g, 'rapturous-moment');
    settle(g);
    for (let i = 0; i < 2; i++)
      g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(
      pool(g)
        .map((m) => m.produces[0])
        .sort(),
    ).toEqual(['R', 'R', 'R', 'U', 'U']);
  });

  it('Resonating Lute makes lands tap for two mana of any colour, for instants and sorceries', () => {
    const g = game({
      p1: {
        hand: ['artistic-process', 'serra-angel'],
        battlefield: ['resonating-lute', 'mountain', 'mountain', 'swamp'],
      },
    });
    // Artistic Process ({3}{R}{R}) from three lands, but not a creature spell.
    expect(
      g
        .legal('p1')
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'artistic-process', 'hand')),
    ).toBe(true);
    expect(
      g
        .legal('p1')
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'serra-angel', 'hand')),
    ).toBe(false);
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(all(g, ELEMENTAL)).toHaveLength(1);
  });

  it('Resonating Lute draws only with seven or more cards in hand', () => {
    const g = game({ p1: { hand: n('forest', 7), battlefield: ['resonating-lute'] } });
    const lute = g.id('p1', 'resonating-lute');
    g.do({ type: 'activateAbility', player: 'p1', source: lute, abilityIndex: 1, targets: [] });
    settle(g);
    expect(handSize(g, 'p1')).toBe(8);
    const g2 = game({ p1: { hand: n('forest', 6), battlefield: ['resonating-lute'] } });
    expect(
      g2
        .legal('p1')
        .some(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === g2.id('p1', 'resonating-lute') &&
            a.abilityIndex === 1,
        ),
    ).toBe(false);
  });

  it('Sanar enters prepared; Wild Idea tutors; it makes a Treasure only after a spell', () => {
    const g = game({
      p1: {
        hand: ['sanar-unfinished-genius', 'shock'],
        library: ['opt', 'forest', 'forest'],
        battlefield: [...n('island', 3), ...n('mountain', 6)],
      },
    });
    settle(cast(g, 'sanar-unfinished-genius'));
    const sanar = g.id('p1', 'sanar-unfinished-genius');
    const treasure = () =>
      g.legal('p1').some((a) => a.type === 'activateAbility' && a.source === sanar);
    expect(treasure()).toBe(false);
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    g.do({ type: 'castSpell', player: 'p1', card: g.obj(sanar).prepared!, targets: [] });
    settle(g);
    if (g.decision.kind === 'searchLibrary')
      g.do({
        type: 'chooseCard',
        player: 'p1',
        card: g.state.players.p1.library.find((id) => g.obj(id).defId === 'opt')!,
      });
    settle(g);
    expect(g.state.players.p1.hand.some((id) => g.obj(id).defId === 'opt')).toBe(true);
  });

  it('Spectacular Skywhale gets +3/+0, or three counters on a five-mana spell', () => {
    const g = game({
      p1: {
        hand: ['shock', 'artistic-process'],
        battlefield: ['spectacular-skywhale', ...n('mountain', 6)],
      },
    });
    const whale = g.id('p1', 'spectacular-skywhale');
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, whale)).toEqual([4, 4]);
    cast(g, 'artistic-process', [], { mode: 2 });
    settle(g);
    expect(g.obj(whale).plusOneCounters).toBe(3);
  });

  it('Splatter Technique draws four, or deals 4 to every creature', () => {
    let g = game({
      p1: { hand: ['splatter-technique'], battlefield: [...n('island', 2), ...n('mountain', 3)] },
    });
    cast(g, 'splatter-technique', [], { mode: 0 });
    settle(g);
    expect(handSize(g, 'p1')).toBe(4);
    g = game({
      p1: {
        hand: ['splatter-technique'],
        battlefield: [...n('island', 2), ...n('mountain', 3), 'serra-angel', 'llanowar-elves'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'splatter-technique', [], { mode: 1 });
    settle(g);
    expect(
      g.state.battlefield.filter(
        (id) => g.obj(id).defId.includes('serra') || g.obj(id).defId.includes('llanowar'),
      ),
    ).toHaveLength(0);
  });

  it('Stadium Tidalmage loots on entering and attacking', () => {
    const g = game({
      p1: {
        hand: ['stadium-tidalmage', 'shock'],
        battlefield: n('island', 2).concat(n('mountain', 2)),
      },
    });
    settle(cast(g, 'stadium-tidalmage'));
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    settle(g);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });

  it('Stress Dream deals 5 and takes one of the top two', () => {
    const g = game({
      p1: {
        hand: ['stress-dream'],
        library: ['opt', 'shock', 'forest'],
        battlefield: [...n('island', 3), ...n('mountain', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'stress-dream', [ref(g, 'p2', 'serra-angel')]);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.state.players.p1.library[0]! });
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(1);
    expect(
      g.state.players.p1.library.at(-1) && g.obj(g.state.players.p1.library.at(-1)!).defId,
    ).toBe('shock');
  });

  it('Traumatic Critique deals X, draws two and discards one', () => {
    const g = game({
      p1: { hand: ['traumatic-critique'], battlefield: [...n('island', 1), ...n('mountain', 4)] },
    });
    cast(g, 'traumatic-critique', [{ player: 'p2' }], { x: 3 });
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Vibrant Outburst deals 3 and taps a creature', () => {
    const g = game({
      p1: { hand: ['vibrant-outburst'], battlefield: ['island', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(cast(g, 'vibrant-outburst', [{ player: 'p2' }, ref(g, 'p2', 'serra-angel')]));
    expect(g.life('p2')).toBe(17);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
  });

  it("Visionary's Dance makes two Elementals, or discards for a look at the top two", () => {
    let g = game({
      p1: { hand: ['visionarys-dance'], battlefield: [...n('island', 3), ...n('mountain', 4)] },
    });
    settle(cast(g, 'visionarys-dance'));
    expect(all(g, ELEMENTAL)).toHaveLength(2);
    g = game({
      p1: {
        hand: ['visionarys-dance'],
        library: ['opt', 'shock', 'forest'],
        battlefield: n('island', 2),
      },
    });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'visionarys-dance', 'hand'),
      abilityIndex: 0,
      targets: [],
    });
    settle(g);
    g.do({ type: 'chooseCard', player: 'p1', card: g.state.players.p1.library[0]! });
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'visionarys-dance')).toBe(
      true,
    );
  });

  it('Zaffai and the Tempests casts one instant or sorcery from hand free each turn', () => {
    const g = game({ p1: { hand: ['shock', 'shock'], battlefield: ['zaffai-and-the-tempests'] } });
    const free = () =>
      g
        .legal('p1')
        .filter((a) => a.type === 'castSpell' && a.via === 'zaffai' && a.targets.length > 0);
    expect(free().length).toBeGreaterThan(0);
    g.do(
      free().find(
        (a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!,
    );
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(free()).toHaveLength(0);
  });

  it('Spectacle Summit enters tapped and surveils; Stormcarved Coast checks your lands', () => {
    const g = game({
      p1: { hand: ['spectacle-summit', 'stormcarved-coast'], battlefield: n('mountain', 2) },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'stormcarved-coast', 'hand') });
    expect(g.obj(g.id('p1', 'stormcarved-coast')).tapped).toBe(false);
    const h = game({
      p1: { hand: ['stormcarved-coast', 'spectacle-summit'], battlefield: ['mountain'] },
    });
    h.do({ type: 'playLand', player: 'p1', card: h.id('p1', 'stormcarved-coast', 'hand') });
    expect(h.obj(h.id('p1', 'stormcarved-coast')).tapped).toBe(true);
    const s = game({ p1: { hand: ['spectacle-summit'] } });
    s.do({ type: 'playLand', player: 'p1', card: s.id('p1', 'spectacle-summit', 'hand') });
    expect(s.obj(s.id('p1', 'spectacle-summit')).tapped).toBe(true);
  });
});
