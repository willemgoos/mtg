import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, n, pt } from './blb-helpers.ts';

// Secrets of Strixhaven 14b (group A): white, Silverquill (W/B) and Lorehold (R/W).

const SPIRIT = 'sos-spirit-token';
const INKLING = 'sos-inkling-token';

/** Resolves the stack, answering every prompt with its first (or the `pick`ed) option. */
function run(g: GameDriver, pick?: (legal: Action[]) => Action | undefined): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'gameOver') return g;
    if (d.kind === 'priority') {
      if (g.state.stack.length === 0 && g.state.pendingTriggers.length === 0) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do(
      pick?.(legal) ??
        legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
        legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
        legal[0]!,
    );
  }
  throw new Error('Did not settle');
}

/** Passes (answering prompts) until the condition holds. */
function until(g: GameDriver, done: () => boolean): GameDriver {
  for (let i = 0; i < 200 && !done(); i++) {
    const d = g.decision;
    if (d.kind === 'gameOver') break;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else {
      const legal = g.legal();
      g.do(
        legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
          legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
          legal[0]!,
      );
    }
  }
  if (!done()) throw new Error('Never got there');
  return g;
}
const atStep =
  (g: GameDriver, step: string, player = 'p1') =>
  () =>
    g.state.turn.step === step &&
    g.state.turn.activePlayer === player &&
    g.decision.kind === 'priority' &&
    g.state.stack.length === 0;

const plains = (k: number) => n('plains', k);
const mountains = (k: number) => n('mountain', k);
const swamps = (k: number) => n('swamp', k);
const count = (g: GameDriver, defId: string) => all(g, defId).length;
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
/** Casts the card in `zone` (hand by default) with these targets. */
const castFrom = (
  g: GameDriver,
  defId: string,
  zone: 'hand' | 'graveyard' | 'exile',
  targets: Parameters<typeof cast>[2] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) =>
  g.do({
    type: 'castSpell',
    player: g.actor,
    card: g.id(g.actor, defId, zone),
    targets,
    ...extra,
  });

describe('the pool', () => {
  it('has every group A card with a Spirit token and prepare faces', () => {
    for (const name of [
      'Emeritus of Truce',
      'Joined Researchers',
      'Spiritcall Enthusiast',
      'Abigale, Poet Laureate',
      'Kirol, History Buff',
    ]) {
      const c = cardDb.get(slug(name))!;
      expect(c.prepare, name).toBe(true);
      expect(cardDb.get(c.back!), name).toBeDefined();
    }
    expect(cardDb.get(SPIRIT)!.colors).toEqual(['R', 'W']);
  });
});

describe('white', () => {
  it('Antiquities on the Loose: two Spirits, and with flashback each Spirit gets a counter', () => {
    const g = game({ p1: { hand: ['antiquities-on-the-loose'], battlefield: plains(3) } });
    run(castFrom(g, 'antiquities-on-the-loose', 'hand'));
    expect(count(g, SPIRIT)).toBe(2);
    for (const id of all(g, SPIRIT)) expect(counters(g, id)).toBe(0);
    const f = game({
      p1: { graveyard: ['antiquities-on-the-loose'], battlefield: [...plains(6), SPIRIT] },
    });
    run(castFrom(f, 'antiquities-on-the-loose', 'graveyard'));
    expect(count(f, SPIRIT)).toBe(3);
    for (const id of all(f, SPIRIT)) expect(counters(f, id)).toBe(1);
    expect(f.state.players.p1.exile).toHaveLength(1);
  });

  it('Group Project: flashback taps three untapped creatures instead of paying mana', () => {
    const g = game({
      p1: { graveyard: ['group-project'], battlefield: n(SPIRIT, 3) },
    });
    run(castFrom(g, 'group-project', 'graveyard'));
    expect(count(g, SPIRIT)).toBe(4);
    expect(all(g, SPIRIT).filter((id) => g.obj(id).tapped)).toHaveLength(3);
    expect(g.state.players.p1.exile).toHaveLength(1);
    // With only two untapped creatures it can't be flashed back.
    const h = game({ p1: { graveyard: ['group-project'], battlefield: n(SPIRIT, 2) } });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Soaring Stoneglider: exile two cards from your graveyard, or pay {1}{W} more', () => {
    const g = game({
      p1: {
        hand: ['soaring-stoneglider'],
        graveyard: ['shock', 'shock', 'shock'],
        battlefield: plains(3),
      },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts).toHaveLength(1);
    expect(casts[0]).not.toHaveProperty('kicked');
    g.do(casts[0]!);
    expect(g.state.players.p1.exile).toHaveLength(2);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    run(g);
    expect(pt(g, g.id('p1', 'soaring-stoneglider'))).toEqual([4, 3]);
    // Empty graveyard: only the kicked cast, and only with five mana.
    const h = game({ p1: { hand: ['soaring-stoneglider'], battlefield: plains(5) } });
    const hc = h.legal().filter((a) => a.type === 'castSpell');
    expect(hc).toHaveLength(1);
    expect(hc[0]).toMatchObject({ kicked: true });
    const poor = game({ p1: { hand: ['soaring-stoneglider'], battlefield: plains(3) } });
    expect(poor.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Emeritus of Truce: the chosen player gets an Inkling; it becomes prepared if an opponent has more creatures, and Swords exiles', () => {
    const g = game({
      p1: { hand: ['emeritus-of-truce'], battlefield: plains(4) },
      p2: { battlefield: n(SPIRIT, 3) },
    });
    run(castFrom(g, 'emeritus-of-truce', 'hand'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p1'),
      ),
    );
    expect(count(g, INKLING)).toBe(1);
    const emeritus = g.id('p1', 'emeritus-of-truce');
    const copy = g.obj(emeritus).prepared!;
    expect(copy).toBeDefined();
    const victim = g.id('p2', SPIRIT);
    g.state.players.p1.life = 10;
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [g.ref(victim)] });
    run(g);
    expect(g.state.battlefield).not.toContain(victim);
  });

  it('Emeritus of Truce stays unprepared when the Inkling evens the creature count', () => {
    const g = game({ p1: { hand: ['emeritus-of-truce'], battlefield: plains(3) } });
    run(castFrom(g, 'emeritus-of-truce', 'hand'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      ),
    );
    // The opponent got the Inkling: one creature each, so no.
    expect(g.obj(g.id('p2', INKLING)).controller).toBe('p2');
    expect(g.obj(g.id('p1', 'emeritus-of-truce')).prepared).toBeUndefined();
  });
});

describe('white, more', () => {
  it('Joined Researchers becomes prepared at an end step when an opponent has more cards in hand; Secret Rendezvous draws three each', () => {
    const g = game({
      p1: { battlefield: ['joined-researchers', ...plains(3)], library: n('forest', 10) },
      p2: { hand: n('forest', 3), library: n('forest', 10) },
    });
    const jr = g.id('p1', 'joined-researchers');
    until(g, () => g.obj(jr).prepared !== undefined);
    const copy = g.obj(jr).prepared!;
    until(g, () => g.state.turn.number > 3 && atStep(g, 'main1')());
    const [h1, h2] = [g.state.players.p1.hand.length, g.state.players.p2.hand.length];
    g.do({ type: 'castSpell', player: g.actor, card: copy, targets: [{ player: 'p2' }] });
    run(g);
    expect(g.state.players.p1.hand).toHaveLength(h1 + 3);
    expect(g.state.players.p2.hand).toHaveLength(h2 + 3);
  });

  it('Spiritcall Enthusiast becomes prepared when a token enters; Scrollboost gives +2/+2 to two creatures', () => {
    const g = game({
      p1: {
        hand: ['group-project'],
        battlefield: ['spiritcall-enthusiast', ...plains(5)],
      },
    });
    const enth = g.id('p1', 'spiritcall-enthusiast');
    expect(g.obj(enth).prepared).toBeUndefined();
    run(castFrom(g, 'group-project', 'hand'));
    const copy = g.obj(enth).prepared!;
    expect(copy).toBeDefined();
    const spirit = g.id('p1', SPIRIT);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: copy,
      targets: [g.ref(enth), g.ref(spirit)],
    });
    run(g);
    expect(pt(g, enth)).toEqual([5, 5]);
    expect(pt(g, spirit)).toEqual([4, 4]);
  });

  it('Restoration Seminar returns a nonland permanent card, then keeps coming back (paradigm)', () => {
    const g = game({
      p1: {
        hand: ['restoration-seminar'],
        graveyard: ['stone-docent', 'plains'],
        battlefield: plains(7),
      },
    });
    const docent = g.id('p1', 'stone-docent', 'graveyard');
    run(castFrom(g, 'restoration-seminar', 'hand', [g.ref(docent)]));
    expect(g.zoneOf(docent)).toBe('battlefield');
    expect(g.state.players.p1.paradigms).toEqual(['restoration-seminar']);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('restoration-seminar');
  });

  it('Informed Inkwright makes an Inkling when you target a creature with an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['dig-site-inventory'], battlefield: ['informed-inkwright', ...plains(2)] },
    });
    const inkwright = g.id('p1', 'informed-inkwright');
    run(castFrom(g, 'dig-site-inventory', 'hand', [g.ref(inkwright)]));
    expect(count(g, INKLING)).toBe(1);
    expect(counters(g, inkwright)).toBe(1);
  });

  it('Daydream returns the creature with a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['daydream'], battlefield: ['stone-docent', ...plains(3)] },
    });
    const docent = g.id('p1', 'stone-docent');
    run(castFrom(g, 'daydream', 'hand', [g.ref(docent)]));
    expect(counters(g, g.id('p1', 'stone-docent'))).toBe(1);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('daydream');
  });

  it('Ascendant Dustspeaker: counter on another creature, exiles a graveyard card at the beginning of combat', () => {
    const g = game({
      p1: { hand: ['ascendant-dustspeaker'], battlefield: [SPIRIT, ...plains(5)] },
      p2: { graveyard: ['shock'] },
    });
    run(castFrom(g, 'ascendant-dustspeaker', 'hand'));
    expect(counters(g, g.id('p1', SPIRIT))).toBe(1);
    until(g, () => g.state.players.p2.graveyard.length === 0);
  });

  it('Erode destroys a creature and its controller may fetch a basic land', () => {
    const g = game({
      p1: { hand: ['erode'], battlefield: plains(1) },
      p2: { battlefield: [SPIRIT], library: ['plains', 'forest'] },
    });
    run(castFrom(g, 'erode', 'hand', [g.ref(g.id('p2', SPIRIT))]));
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === SPIRIT)).toHaveLength(0);
    expect(g.state.battlefield.some((id) => g.obj(id).controller === 'p2')).toBe(true);
  });

  it("Practiced Offense: counters on the target player's creatures", () => {
    const g = game({
      p1: { hand: ['practiced-offense'], battlefield: [SPIRIT, SPIRIT, ...plains(3)] },
    });
    const [a, b] = all(g, SPIRIT);
    run(castFrom(g, 'practiced-offense', 'hand', [{ player: 'p1' }, g.ref(a!)]));
    expect(counters(g, a!)).toBe(1);
    expect(counters(g, b!)).toBe(1);
    // The first option is double strike (the other is lifelink).
    expect(getCharacteristics(g.state, cardDb, a!).keywords.has('doubleStrike')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, b!).keywords.has('doubleStrike')).toBe(false);
  });

  it('Primary Research returns a cheap permanent and draws at your end step', () => {
    const g = game({
      p1: { hand: ['primary-research'], graveyard: ['stone-docent'], battlefield: plains(5) },
    });
    const docent = g.id('p1', 'stone-docent', 'graveyard');
    run(castFrom(g, 'primary-research', 'hand'), (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0),
    );
    expect(g.zoneOf(docent)).toBe('battlefield');
    const handBefore = g.state.players.p1.hand.length;
    until(g, () => g.state.players.p1.hand.length > handBefore);
  });

  it('Shattered Acolyte sacrifices itself to destroy an artifact or enchantment', () => {
    const g = game({
      p1: { battlefield: ['shattered-acolyte', ...plains(1)] },
      p2: { battlefield: ['ark-of-hunger'] },
    });
    const ark = g.id('p2', 'ark-of-hunger');
    const acolyte = g.id('p1', 'shattered-acolyte');
    const act = g.legal().find((a) => a.type === 'activateAbility' && a.source === acolyte);
    g.do(act!);
    run(g);
    expect(g.zoneOf(ark)).toBe('graveyard');
    expect(g.zoneOf(acolyte)).toBe('graveyard');
  });

  it('Stone Docent and Summoned Dromedary work from the graveyard at sorcery speed', () => {
    const g = game({
      p1: { graveyard: ['stone-docent', 'summoned-dromedary'], battlefield: plains(3) },
    });
    const docent = g.id('p1', 'stone-docent', 'graveyard');
    const dromedary = g.id('p1', 'summoned-dromedary', 'graveyard');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === docent)!);
    run(g);
    expect(g.life('p1')).toBe(22);
    expect(g.zoneOf(docent)).toBe('exile');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === dromedary)!);
    run(g);
    expect(g.zoneOf(dromedary)).toBe('hand');
  });
});

const activate = (g: GameDriver, source: string, abilityIndex?: number) =>
  g
    .legal()
    .find(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === source &&
        (abilityIndex === undefined || a.abilityIndex === abilityIndex),
    )!;
const castActions = (g: GameDriver, defId: string) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && g.obj(a.card).defId === defId,
    );

describe('Silverquill (W/B)', () => {
  it('Abigale becomes prepared when you cast a creature spell; Heroic Stanza puts a counter', () => {
    const g = game({
      p1: {
        hand: ['abigale-poet-laureate', 'stone-docent'],
        battlefield: [...plains(5), ...swamps(3)],
      },
    });
    run(castFrom(g, 'abigale-poet-laureate', 'hand'));
    const abigale = g.id('p1', 'abigale-poet-laureate');
    expect(g.obj(abigale).prepared).toBeUndefined();
    run(castFrom(g, 'stone-docent', 'hand'));
    const copy = g.obj(abigale).prepared!;
    expect(copy).toBeDefined();
    const docent = g.id('p1', 'stone-docent');
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [g.ref(docent)] });
    run(g);
    expect(counters(g, docent)).toBe(1);
  });

  it("Fix What's Broken: pay X life, return each artifact and creature card with mana value X", () => {
    const g = game({
      p1: {
        hand: ['fix-whats-broken'],
        graveyard: [
          'stone-docent',
          'ascendant-dustspeaker',
          'shock',
          'ark-of-hunger',
          'shattered-acolyte',
        ],
        battlefield: [...plains(2), ...swamps(2)],
      },
    });
    const two = castActions(g, 'fix-whats-broken').find((a) => a.x === 2)!;
    g.do(two);
    expect(g.life('p1')).toBe(18);
    run(g);
    // Stone Docent and Shattered Acolyte (both mana value 2) come back; Ark (4), Dustspeaker (5) and Shock don't.
    expect(count(g, 'stone-docent')).toBe(1);
    expect(count(g, 'shattered-acolyte')).toBe(1);
    expect(count(g, 'ark-of-hunger')).toBe(0);
    expect(count(g, 'ascendant-dustspeaker')).toBe(0);
  });

  it('Moment of Reckoning: up to four modes, the same mode more than once', () => {
    const g = game({
      p1: {
        hand: ['moment-of-reckoning'],
        graveyard: ['stone-docent'],
        battlefield: [...plains(4), ...swamps(3)],
      },
      p2: { battlefield: ['ark-of-hunger', 'ark-of-hunger'] },
    });
    const [a, b] = g.state.battlefield.filter((id) => g.obj(id).defId === 'ark-of-hunger');
    const docent = g.id('p1', 'stone-docent', 'graveyard');
    const combos = castActions(g, 'moment-of-reckoning').map((x) => x.paws?.join());
    expect(combos).toContain('0,0,1');
    const act = castActions(g, 'moment-of-reckoning').find(
      (x) =>
        x.paws?.join() === '0,0,1' &&
        JSON.stringify(x.targets) === JSON.stringify([g.ref(a!), g.ref(b!), g.ref(docent)]),
    )!;
    g.do(act);
    run(g);
    expect(g.zoneOf(a!)).toBe('graveyard');
    expect(g.zoneOf(b!)).toBe('graveyard');
    expect(g.zoneOf(docent)).toBe('battlefield');
  });

  it("Nita, Forum Conciliator: sacrifice a creature to cast an opponent's instant, then every creature gets a counter", () => {
    const g = game({
      p1: { battlefield: ['nita-forum-conciliator', SPIRIT, ...plains(4)] },
      p2: { graveyard: ['shock'] },
    });
    const nita = g.id('p1', 'nita-forum-conciliator');
    const spirit = g.id('p1', SPIRIT);
    const shock = g.id('p2', 'shock', 'graveyard');
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === nita &&
          a.abilityIndex === 1 &&
          a.sacrifice === spirit,
      )!;
    g.do({ ...act, targets: [g.ref(shock)] } as Action);
    run(g);
    expect(g.zoneOf(spirit)).toBe('graveyard');
    expect(g.zoneOf(shock)).toBe('exile');
    // Cast it with white mana (any type), at the opponent.
    const cast1 = g.legal().find((a) => a.type === 'castSpell' && a.card === shock)!;
    g.do({ ...cast1, targets: [{ player: 'p2' }] } as Action);
    run(g);
    expect(g.life('p2')).toBe(18);
    expect(counters(g, nita)).toBe(1);
    // It was exiled rather than put into the graveyard.
    expect(g.zoneOf(shock)).toBe('exile');
    expect(g.state.players.p2.graveyard).toHaveLength(0);
  });

  it('Silverquill, the Disputant: casualty 1 copies your instant or sorcery', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['silverquill-the-disputant', SPIRIT, ...mountains(1)] },
    });
    const spirit = g.id('p1', SPIRIT);
    run(castFrom(g, 'shock', 'hand', [{ player: 'p2' }]), (legal) =>
      legal.find((a) => a.type === 'chooseCard' && a.card === spirit),
    );
    expect(g.life('p2')).toBe(16);
    expect(g.zoneOf(spirit)).toBe('graveyard');
  });

  it('Silverquill, the Disputant: no copy if you decline', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['silverquill-the-disputant', SPIRIT, ...mountains(1)] },
    });
    run(castFrom(g, 'shock', 'hand', [{ player: 'p2' }]), (legal) =>
      legal.find((a) => a.type === 'chooseEffect' && !a.accept),
    );
    expect(g.life('p2')).toBe(18);
    expect(count(g, SPIRIT)).toBe(1);
  });

  it('Social Snub: with a creature you may copy it; each player sacrifices, opponents lose 1 and you gain 1 per copy', () => {
    const g = game({
      p1: { hand: ['social-snub'], battlefield: [SPIRIT, SPIRIT, ...plains(2), ...swamps(1)] },
      p2: { battlefield: [SPIRIT, SPIRIT] },
    });
    run(castFrom(g, 'social-snub', 'hand'));
    expect(count(g, SPIRIT)).toBe(0);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Social Snub with no creature just makes the one sacrifice', () => {
    const g = game({
      p1: { hand: ['social-snub'], battlefield: [...plains(2), ...swamps(1)] },
      p2: { battlefield: [SPIRIT, SPIRIT] },
    });
    run(castFrom(g, 'social-snub', 'hand'));
    expect(count(g, SPIRIT)).toBe(1);
    expect(g.life('p2')).toBe(19);
  });

  it('Stirring Honormancer takes one of the top X cards (X = your creatures) and mills the rest', () => {
    const g = game({
      p1: {
        hand: ['stirring-honormancer'],
        battlefield: [SPIRIT, SPIRIT, ...plains(3), ...swamps(2)],
        library: ['shock', 'plains', 'forest', 'forest'],
      },
    });
    run(castFrom(g, 'stirring-honormancer', 'hand'));
    // Three creatures: the top three cards are looked at.
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});

describe('Lorehold (R/W)', () => {
  it('Ark of Hunger: mill a card and play it; cards leaving the graveyard drain 1', () => {
    const g = game({
      p1: { battlefield: ['ark-of-hunger'], library: ['plains', 'forest'] },
    });
    const ark = g.id('p1', 'ark-of-hunger');
    g.do(activate(g, ark, 1));
    run(g);
    const milled = g.state.players.p1.graveyard[0]!;
    expect(g.obj(milled).defId).toBe('plains');
    const play = g.legal().find((a) => a.type === 'playLand' && a.card === milled)!;
    expect(play).toBeDefined();
    g.do(play);
    run(g);
    expect(g.zoneOf(milled)).toBe('battlefield');
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('Ark of Hunger: a milled spell can be cast, and casting it does not lock out other spells', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['ark-of-hunger', ...mountains(2)],
        library: ['shock', 'forest'],
      },
    });
    const ark = g.id('p1', 'ark-of-hunger');
    g.do(activate(g, ark, 1));
    run(g);
    const milled = g.state.players.p1.graveyard[0]!;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: milled,
      targets: [{ player: 'p2' }],
      via: 'conduit',
    });
    run(g);
    // One life from Ark (the card left the graveyard), two from the Shock.
    expect(g.life('p2')).toBe(17);
    const second = g.legal().find((a) => a.type === 'castSpell' && g.obj(a.card).zone === 'hand');
    expect(second).toBeDefined();
  });

  it('Aziza copies your instant or sorcery by tapping three untapped creatures', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['aziza-mage-tower-captain', SPIRIT, SPIRIT, ...mountains(1)],
      },
    });
    run(castFrom(g, 'shock', 'hand', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
    expect(all(g, SPIRIT).every((id) => g.obj(id).tapped)).toBe(true);
  });

  it('Aziza needs three untapped creatures', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['aziza-mage-tower-captain', SPIRIT, ...mountains(1)] },
    });
    run(castFrom(g, 'shock', 'hand', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
  });

  it("Borrowed Knowledge: discard your hand, then draw for the opponent's hand or for what you discarded", () => {
    const g = game({
      p1: {
        hand: ['borrowed-knowledge', 'shock', 'shock'],
        battlefield: [...mountains(2), ...plains(2)],
      },
      p2: { hand: n('forest', 4) },
    });
    const first = castActions(g, 'borrowed-knowledge').find((a) => a.mode === 0)!;
    g.do(first);
    run(g);
    expect(g.state.players.p1.hand).toHaveLength(4);
    const h = game({
      p1: {
        hand: ['borrowed-knowledge', 'shock', 'shock'],
        battlefield: [...mountains(2), ...plains(2)],
      },
      p2: { hand: n('forest', 4) },
    });
    h.do(castActions(h, 'borrowed-knowledge').find((a) => a.mode === 1)!);
    run(h);
    expect(h.state.players.p1.hand).toHaveLength(2);
  });

  it('Colossus of the Blood Age drains 3 on entering; when it dies discard any number then draw that many plus one', () => {
    const g = game({
      p1: { hand: ['colossus-of-the-blood-age'], battlefield: [...mountains(3), ...plains(3)] },
    });
    run(castFrom(g, 'colossus-of-the-blood-age', 'hand'));
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
    const h = game({
      p1: {
        hand: ['erode', 'shock', 'shock'],
        battlefield: ['colossus-of-the-blood-age', ...plains(1)],
      },
    });
    run(castFrom(h, 'erode', 'hand', [h.ref(h.id('p1', 'colossus-of-the-blood-age'))]));
    // Discarded both Shocks, drew three.
    expect(h.state.players.p1.hand).toHaveLength(3);
  });

  it('Colossus of the Blood Age: discarding nothing still draws one', () => {
    const h = game({
      p1: {
        hand: ['erode', 'shock'],
        battlefield: ['colossus-of-the-blood-age', ...plains(1)],
      },
    });
    run(castFrom(h, 'erode', 'hand', [h.ref(h.id('p1', 'colossus-of-the-blood-age'))]), (legal) =>
      legal.find((a) => a.type === 'chooseEffect' && !a.accept),
    );
    expect(h.state.players.p1.hand).toHaveLength(2);
  });

  it('Hardened Academic: discard for lifelink, and a counter when cards leave your graveyard', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        graveyard: ['stone-docent'],
        battlefield: ['hardened-academic', ...plains(1)],
      },
    });
    const academic = g.id('p1', 'hardened-academic');
    g.do(activate(g, academic, 0));
    run(g);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    const docent = g.id('p1', 'stone-docent', 'graveyard');
    g.do(activate(g, docent));
    run(g);
    expect(counters(g, academic)).toBe(1);
  });

  it('Kirol becomes prepared when a card leaves your graveyard; Pack a Punch mills, adds counters and trample', () => {
    const g = game({
      p1: {
        graveyard: ['stone-docent'],
        battlefield: ['kirol-history-buff', ...plains(3), ...mountains(2)],
        library: ['forest', 'forest'],
      },
    });
    const kirol = g.id('p1', 'kirol-history-buff');
    g.do(activate(g, g.id('p1', 'stone-docent', 'graveyard')));
    run(g);
    const copy = g.obj(kirol).prepared!;
    expect(copy).toBeDefined();
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [g.ref(kirol)] });
    run(g);
    expect(counters(g, kirol)).toBe(2);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('forest');
  });

  it('Lorehold Charm: each mode', () => {
    const base = {
      p1: {
        hand: ['lorehold-charm'],
        graveyard: ['stone-docent'],
        battlefield: [...mountains(1), ...plains(1), SPIRIT],
      },
      p2: { battlefield: ['ark-of-hunger', SPIRIT] },
    };
    const a = game(base);
    a.do(castActions(a, 'lorehold-charm').find((x) => x.mode === 0)!);
    run(a);
    expect(count(a, 'ark-of-hunger')).toBe(0);
    const b = game(base);
    b.do(castActions(b, 'lorehold-charm').find((x) => x.mode === 1)!);
    run(b);
    expect(count(b, 'stone-docent')).toBe(1);
    const c = game(base);
    c.do(castActions(c, 'lorehold-charm').find((x) => x.mode === 2)!);
    run(c);
    expect(pt(c, c.id('p1', SPIRIT))).toEqual([3, 3]);
  });

  it('Lorehold, the Historian: miracle {2} for the first instant or sorcery you draw each turn', () => {
    const g = game({
      p1: {
        battlefield: ['lorehold-the-historian', ...mountains(2)],
        library: ['shock', 'shock', 'forest'],
      },
    });
    // On to p1's next draw step.
    for (let i = 0; i < 200 && g.decision.kind !== 'castFree'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else break;
    }
    expect(g.decision.kind).toBe('castFree');
    const miracle = g.legal().find((a) => a.type === 'castSpell')!;
    g.do({ ...miracle, targets: [{ player: 'p2' }] } as Action);
    run(g);
    expect(g.life('p2')).toBe(18);
    expect(all(g, 'mountain').filter((id) => g.obj(id).tapped)).toHaveLength(2);
  });

  it("Lorehold, the Historian: at an opponent's upkeep you may discard a card to draw a card", () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['lorehold-the-historian'],
        library: ['plains', 'plains'],
      },
    });
    until(
      g,
      () =>
        g.state.turn.step === 'upkeep' &&
        g.state.turn.activePlayer === 'p2' &&
        g.decision.kind !== 'priority',
    );
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    run(g);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('shock');
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['plains']);
  });

  it('Molten Note deals damage equal to the mana spent and untaps your creatures', () => {
    const g = game({
      p1: {
        hand: ['molten-note'],
        battlefield: [
          { card: SPIRIT, tapped: true },
          ...mountains(2),
          ...plains(2),
          ...mountains(2),
        ],
      },
      p2: { battlefield: ['colossus-of-the-blood-age', 'colossus-of-the-blood-age'] },
    });
    const [big] = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'colossus-of-the-blood-age',
    );
    // X = 2: four mana, four damage.
    g.do(
      castActions(g, 'molten-note').find(
        (a) => a.x === 2 && JSON.stringify(a.targets) === JSON.stringify([g.ref(big!)]),
      )!,
    );
    expect(g.obj(g.state.stack[0]!.id).manaSpent).toBe(4);
    run(g);
    expect(g.obj(big!).damage).toBe(4);
    expect(g.obj(g.id('p1', SPIRIT)).tapped).toBe(false);
  });

  it('Molten Note flashback: {6}{R}{W} is eight mana spent', () => {
    const g = game({
      p1: { graveyard: ['molten-note'], battlefield: [...plains(4), ...mountains(4)] },
      p2: { battlefield: ['colossus-of-the-blood-age'] },
    });
    const big = g.id('p2', 'colossus-of-the-blood-age');
    run(castFrom(g, 'molten-note', 'graveyard', [g.ref(big)]));
    expect(g.zoneOf(big)).toBe('graveyard');
  });

  it('Practiced Scrollsmith exiles a noncreature card from your graveyard that you may cast', () => {
    const g = game({
      p1: {
        hand: ['practiced-scrollsmith'],
        graveyard: ['shock'],
        battlefield: [...mountains(3), ...plains(1)],
      },
    });
    run(castFrom(g, 'practiced-scrollsmith', 'hand'));
    const shock = g.state.players.p1.exile[0]!;
    expect(g.obj(shock).defId).toBe('shock');
    g.do({ type: 'castSpell', player: 'p1', card: shock, targets: [{ player: 'p2' }] });
    run(g);
    expect(g.life('p2')).toBe(18);
  });

  it('Pursue the Past: gain 2, may discard to draw two; flashback', () => {
    const g = game({
      p1: { hand: ['pursue-the-past', 'shock'], battlefield: [...mountains(1), ...plains(1)] },
    });
    run(castFrom(g, 'pursue-the-past', 'hand'));
    expect(g.life('p1')).toBe(22);
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('shock');
  });

  it('Spirit Mascot and Startled Relic Sloth', () => {
    const g = game({
      p1: {
        graveyard: ['stone-docent'],
        battlefield: ['spirit-mascot', 'startled-relic-sloth', ...plains(1)],
      },
      p2: { graveyard: ['shock'] },
    });
    const mascot = g.id('p1', 'spirit-mascot');
    g.do(activate(g, g.id('p1', 'stone-docent', 'graveyard')));
    run(g);
    expect(counters(g, mascot)).toBe(1);
    until(g, () => g.state.players.p2.graveyard.length === 0);
  });

  it('Suspend Aggression exiles a permanent and your top card; each owner may play theirs until their next turn ends', () => {
    const g = game({
      p1: {
        hand: ['suspend-aggression'],
        battlefield: [...mountains(1), ...plains(2)],
        library: ['shock', 'forest'],
      },
      p2: { battlefield: ['stone-docent'] },
    });
    const docent = g.id('p2', 'stone-docent');
    run(castFrom(g, 'suspend-aggression', 'hand', [g.ref(docent)]));
    expect(g.zoneOf(docent)).toBe('exile');
    expect(g.obj(docent).playableUntilTurn).toBe(g.state.turn.number + 1);
    const top = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'shock')!;
    expect(g.obj(top).playableUntilTurn).toBe(g.state.turn.number + 2);
  });

  it('Wilt in the Heat costs {2} less after a card left your graveyard, and exiles what it kills', () => {
    const g = game({
      p1: { hand: ['wilt-in-the-heat'], battlefield: [...mountains(1), ...plains(1)] },
      p2: { battlefield: ['stone-docent'] },
    });
    expect(castActions(g, 'wilt-in-the-heat')).toHaveLength(0);
    g.state.turn.leftGraveyard = { p1: 1, p2: 0 };
    const docent = g.id('p2', 'stone-docent');
    run(castFrom(g, 'wilt-in-the-heat', 'hand', [g.ref(docent)]));
    expect(g.zoneOf(docent)).toBe('exile');
  });

  it('Ennis, Debate Moderator: blinks another creature and grows if a card was exiled this turn', () => {
    const g = game({
      p1: { hand: ['ennis-debate-moderator'], battlefield: ['stone-docent', ...plains(2)] },
    });
    run(castFrom(g, 'ennis-debate-moderator', 'hand'));
    const ennis = g.id('p1', 'ennis-debate-moderator');
    // Tokens aren't cards, and the Docent is: it was exiled by Ennis.
    expect(g.state.players.p1.exile).toHaveLength(1);
    until(
      g,
      () => g.state.turn.step === 'end' && g.state.stack.length === 0 && counters(g, ennis) === 1,
    );
    expect(counters(g, ennis)).toBe(1);
    expect(count(g, 'stone-docent')).toBe(1);
  });

  it('lands: Fields of Strife enters tapped; Sundown Pass enters tapped unless you control two other lands', () => {
    const g = game({
      p1: { hand: ['fields-of-strife', 'sundown-pass'], battlefield: plains(1) },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'sundown-pass', 'hand') });
    expect(g.obj(g.id('p1', 'sundown-pass')).tapped).toBe(true);
    const h = game({
      p1: { hand: ['sundown-pass'], battlefield: plains(2) },
    });
    h.do({ type: 'playLand', player: 'p1', card: h.id('p1', 'sundown-pass', 'hand') });
    expect(h.obj(h.id('p1', 'sundown-pass')).tapped).toBe(false);
  });
});
