import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  done,
  game,
  gy,
  hand,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Lord of the Rings 21d: the multicolour rares (part one: Lotho, Samwise, Aragorn the Uniter, Elrond, Merry, Éowyn, Arwen,
// Flame of Anor).

type Cast = Extract<Action, { type: 'castSpell' }>;
const SOLDIER = 'hob-human-soldier-token';
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const named = (g: GameDriver, id: string, name: string) => g.obj(id).counters?.[name] ?? 0;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
/** Moves to the declare attackers decision and attacks p2 with these creatures. */
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}
const protections = (g: GameDriver, id: string) =>
  g.state.effects
    .filter((e) => e.affected.id === id && e.protectionFrom)
    .map((e) => e.protectionFrom);

export const NAMES = [
  'Aragorn, Company Leader',
  'Aragorn, the Uniter',
  'Arwen, Mortal Queen',
  'Doors of Durin',
  'Elrond, Master of Healing',
  'Faramir, Prince of Ithilien',
  'Flame of Anor',
  'Galadriel of Lothlórien',
  'Gandalf the Grey',
  'Gimli, Mournful Avenger',
  'King of the Oathbreakers',
  'Lotho, Corrupt Shirriff',
  'Merry, Esquire of Rohan',
  'Pippin, Guard of the Citadel',
  'Samwise Gamgee',
  'Saruman of Many Colors',
  "Sauron's Ransom",
  'Sauron, the Dark Lord',
  'Shagrat, Loot Bearer',
  'Sharkey, Tyrant of the Shire',
  'Shelob, Child of Ungoliant',
  'Sméagol, Helpful Guide',
  "The Balrog, Durin's Bane",
  'Tom Bombadil',
  'Éowyn, Fearless Knight',
];

describe('the multicolour rare Lord of the Rings cards', () => {
  it('are all in cardDb', () => {
    expect(NAMES).toHaveLength(25);
    const groups = JSON.parse(
      readFileSync(new URL('../scripts/data/ltr-groups.json', import.meta.url), 'utf8'),
    ) as Record<string, string>;
    const group = Object.keys(groups).filter((name) => groups[name] === 'multicolour-rare');
    expect(group).toHaveLength(25);
    for (const name of group) expect(cardDb.get(slug(name)), name).toBeDefined();
    expect(group.sort()).toEqual([...NAMES].sort());
  });

  it('play whole random games without getting stuck', () => {
    const engine = createEngine(cardDb);
    const cards = NAMES.map(slug);
    const lands = [
      ...n('plains', 6),
      ...n('island', 6),
      ...n('swamp', 6),
      ...n('mountain', 6),
      ...n('forest', 6),
    ];
    const deck = [...cards, ...cards.slice(0, 5), ...lands].slice(0, 60);
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});

describe('Lotho, Corrupt Shirriff', () => {
  it('whenever a player casts their second spell each turn, you lose 1 life and create a Treasure', () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves', 'llanowar-elves'],
        battlefield: ['lotho-corrupt-shirriff', 'forest', 'forest'],
      },
    });
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    expect(g.life('p1')).toBe(20);
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    expect(g.life('p1')).toBe(19);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
  });

  it('also when an opponent casts their second spell', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['lotho-corrupt-shirriff'] },
      p2: { hand: ['shock', 'shock'], battlefield: ['mountain', 'mountain'] },
    });
    g.do(casts(g, 'shock', 'p2').find(targetingPlayer('p1'))!);
    done(g);
    expect(g.life('p1')).toBe(18);
    g.do(casts(g, 'shock', 'p2').find(targetingPlayer('p2'))!);
    done(g);
    // Lotho's controller (p1) loses 1 life and gets the Treasure.
    expect(g.life('p1')).toBe(17);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
    expect(board(g, 'treasure-token', 'p2')).toHaveLength(0);
  });
});

describe('Samwise Gamgee', () => {
  it('whenever another nontoken creature you control enters, create a Food', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['samwise-gamgee', 'forest'] },
    });
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
  });

  it('not for a token, and not for itself', () => {
    const g = game({
      p1: {
        hand: ['samwise-gamgee', 'llanowar-elves'],
        battlefield: n('forest', 2).concat(['plains', 'plains']),
      },
    });
    g.do(casts(g, 'samwise-gamgee')[0]!);
    done(g);
    expect(board(g, 'food-token', 'p1')).toHaveLength(0);
    expect(board(g, 'samwise-gamgee', 'p1')).toHaveLength(1);
  });

  it('sacrifice three Foods: return target historic card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        graveyard: ['gothmog-morgul-lieutenant', 'savannah-lions', 'soul-guide-lantern'],
        battlefield: ['samwise-gamgee', 'food-token', 'food-token', 'food-token', 'food-token'],
      },
    });
    const sam = g.id('p1', 'samwise-gamgee');
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    const gothmog = g.id('p1', 'gothmog-morgul-lieutenant', 'graveyard');
    const lantern = g.id('p1', 'soul-guide-lantern', 'graveyard');
    const acts = abilityActions(g, sam, 1);
    const targets = acts.flatMap((a) => (a.type === 'activateAbility' ? a.targets : []));
    const ids = targets.flatMap((t) => ('object' in t ? [t.object.id] : []));
    // Legendary and artifact cards are historic; a plain creature is not.
    expect(ids).toContain(gothmog);
    expect(ids).toContain(lantern);
    expect(ids).not.toContain(lions);
    activate(g, sam, 1, [g.ref(gothmog)]);
    done(g);
    expect(hand(g)).toEqual(['gothmog-morgul-lieutenant']);
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
  });

  it('needs three Foods', () => {
    const g = game({
      p1: {
        graveyard: ['gothmog-morgul-lieutenant'],
        battlefield: ['samwise-gamgee', 'food-token', 'food-token'],
      },
    });
    expect(abilityActions(g, g.id('p1', 'samwise-gamgee'), 1)).toHaveLength(0);
  });
});

describe('Aragorn, the Uniter', () => {
  it('a white spell makes a 1/1 Human Soldier', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['aragorn-the-uniter', 'plains'] },
    });
    g.do(casts(g, 'savannah-lions')[0]!);
    done(g);
    expect(board(g, SOLDIER, 'p1')).toHaveLength(1);
  });

  it('a blue spell scries 2', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: ['aragorn-the-uniter', 'island'],
        library: ['plains', 'swamp', 'forest', 'forest'],
      },
    });
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    // The trigger resolves first: scry 2 (the top two cards on offer).
    expect(g.decision.kind).toBe('scry');
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
  });

  it('a red spell deals 3 damage to target opponent', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['aragorn-the-uniter', 'mountain'] },
    });
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    done(g);
    // Shock's 2 and Aragorn's 3.
    expect(g.life('p2')).toBe(15);
  });

  it('a green spell gives target creature +4/+4', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['aragorn-the-uniter', 'forest'] },
    });
    const aragorn = g.id('p1', 'aragorn-the-uniter');
    g.do(casts(g, 'giant-growth').find(targeting(aragorn))!);
    // Both Aragorn's trigger (+4/+4) and Giant Growth (+3/+3) are on the stack.
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === aragorn) });
    expect(pt(g, aragorn)).toEqual([5 + 4 + 3, 5 + 4 + 3]);
  });

  it('a multicolour spell triggers once for each of its colors', () => {
    const g = game({
      p1: {
        hand: ['flame-of-anor'],
        battlefield: ['aragorn-the-uniter', 'island', 'mountain', 'island'],
      },
    });
    g.do(casts(g, 'flame-of-anor').find((a) => a.mode === 0 && targetingPlayer('p1')(a))!);
    stop(g);
    // Blue: scry 2; red: 3 damage.
    for (let i = 0; i < 10 && g.decision.kind !== 'priority'; i++) done(g);
    done(g);
    expect(g.life('p2')).toBe(17);
  });
});

describe('Elrond, Master of Healing', () => {
  it('whenever you scry, a +1/+1 counter on each of up to X target creatures (X = cards looked at)', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: ['elrond-master-of-healing', 'island', 'savannah-lions', 'llanowar-elves'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    // Opt scries 1; then the trigger asks for up to one target (one card looked at).
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((a) => a.type === 'scry')!);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    const pickLions = picks.find(
      (a) =>
        a.type === 'chooseTargets' &&
        a.targets.length === 1 &&
        'object' in a.targets[0]! &&
        a.targets[0].object.id === lions,
    )!;
    g.do(pickLions);
    done(g);
    expect(plus(g, lions)).toBe(1);
    expect(plus(g, g.id('p1', 'elrond-master-of-healing'))).toBe(0);
  });

  it('the scry may leave out all targets', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: ['elrond-master-of-healing', 'island', 'savannah-lions'] },
    });
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    g.do(g.legal().find((a) => a.type === 'scry')!);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    done(g);
    expect(plus(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });

  it('you may draw when an opponent targets a creature of yours with a +1/+1 counter', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['elrond-master-of-healing', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.state.objects[lions]!.plusOneCounters = 1;
    g.do(casts(g, 'shock', 'p2').find(targeting(lions))!);
    done(g, { accept: true });
    expect(hand(g, 'p1')).toHaveLength(1);
  });

  it('no draw for a creature without a +1/+1 counter, or when you target it yourself', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['elrond-master-of-healing', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.do(casts(g, 'shock', 'p2').find(targeting(g.id('p1', 'savannah-lions')))!);
    done(g, { accept: true });
    expect(hand(g, 'p1')).toHaveLength(0);
  });
});

describe('Merry, Esquire of Rohan', () => {
  it('has haste', () => {
    const g = game({ p1: { battlefield: ['merry-esquire-of-rohan'] } });
    expect(kw(g, g.id('p1', 'merry-esquire-of-rohan')).has('haste')).toBe(true);
  });

  it('has first strike as long as it is equipped', () => {
    const g = game({ p1: { battlefield: ['merry-esquire-of-rohan', 'short-bow'] } });
    const merry = g.id('p1', 'merry-esquire-of-rohan');
    expect(kw(g, merry).has('firstStrike')).toBe(false);
    g.state.objects[g.id('p1', 'short-bow')]!.attachedTo = merry;
    expect(kw(g, merry).has('firstStrike')).toBe(true);
  });

  it('draws when Merry attacks with another legendary creature', () => {
    const g = game({
      p1: { battlefield: ['merry-esquire-of-rohan', 'gothmog-morgul-lieutenant'] },
    });
    attack(g, [g.id('p1', 'merry-esquire-of-rohan'), g.id('p1', 'gothmog-morgul-lieutenant')]);
    done(g);
    expect(hand(g)).toHaveLength(1);
  });

  it('no card when Merry attacks alone, or with a nonlegendary creature', () => {
    const alone = game({ p1: { battlefield: ['merry-esquire-of-rohan'] } });
    attack(alone, [alone.id('p1', 'merry-esquire-of-rohan')]);
    done(alone);
    expect(hand(alone)).toHaveLength(0);
    const g = game({ p1: { battlefield: ['merry-esquire-of-rohan', 'savannah-lions'] } });
    attack(g, [g.id('p1', 'merry-esquire-of-rohan'), g.id('p1', 'savannah-lions')]);
    done(g);
    expect(hand(g)).toHaveLength(0);
  });

  it('no card when only the other legendary creature attacks', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'merry-esquire-of-rohan', sick: false }, 'gothmog-morgul-lieutenant'],
      },
    });
    attack(g, [g.id('p1', 'gothmog-morgul-lieutenant')]);
    done(g);
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Éowyn, Fearless Knight', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['owyn-fearless-knight'],
        battlefield: [
          'mountain',
          'mountain',
          'plains',
          'plains',
          'gothmog-morgul-lieutenant',
          'savannah-lions',
        ],
      },
      p2: { battlefield: ['serra-angel', 'rumbling-baloth'] },
    });

  it('has haste', () => {
    const g = setup();
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    done(g);
    expect(kw(g, g.id('p1', 'owyn-fearless-knight')).has('haste')).toBe(true);
  });

  it('exiles a creature an opponent controls with greater power (only those are targets)', () => {
    const g = setup();
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    stop(g);
    const ids = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .flatMap((t) => ('object' in t ? [t.object.id] : []));
    // Éowyn has power 3: Serra Angel (4) is a target, Rumbling Baloth (4) too.
    expect(ids).toContain(g.id('p2', 'serra-angel'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel')),
    });
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
  });

  it('a creature with power 3 or less is not a target', () => {
    const g = game({
      p1: {
        hand: ['owyn-fearless-knight'],
        battlefield: ['mountain', 'mountain', 'plains', 'plains'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    done(g);
    expect(g.state.players.p2.exile).toHaveLength(0);
    expect(board(g, 'savannah-lions', 'p2')).toHaveLength(1);
  });

  it('legendary creatures you control gain protection from each of its colors until end of turn', () => {
    const g = setup();
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel')),
    });
    const eowyn = g.id('p1', 'owyn-fearless-knight');
    const gothmog = g.id('p1', 'gothmog-morgul-lieutenant');
    expect(protections(g, eowyn)).toEqual(['W']);
    expect(protections(g, gothmog)).toEqual(['W']);
    // Not a nonlegendary creature.
    expect(protections(g, g.id('p1', 'savannah-lions'))).toEqual([]);
    // It lasts until end of turn.
    passTo(g, 'main1', 'p2');
    expect(protections(g, gothmog)).toEqual([]);
  });

  it('a multicolour creature gives protection from each of its colors', () => {
    const g = game({
      p1: {
        hand: ['owyn-fearless-knight'],
        battlefield: ['mountain', 'mountain', 'plains', 'plains'],
      },
      p2: { battlefield: ['aragorn-the-uniter'] },
    });
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    done(g);
    expect(protections(g, g.id('p1', 'owyn-fearless-knight')).sort()).toEqual(['G', 'R', 'U', 'W']);
  });

  it('a colorless creature gives no protection', () => {
    const g = game({
      p1: {
        hand: ['owyn-fearless-knight'],
        battlefield: ['mountain', 'mountain', 'plains', 'plains'],
      },
      p2: { battlefield: ['scrawling-crawler'] },
    });
    const crawler = g.id('p2', 'scrawling-crawler');
    g.state.objects[crawler]!.plusOneCounters = 1;
    g.do(casts(g, 'owyn-fearless-knight')[0]!);
    done(g);
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual(['scrawling-crawler']);
    expect(protections(g, g.id('p1', 'owyn-fearless-knight'))).toEqual([]);
  });
});

describe('Arwen, Mortal Queen', () => {
  it('enters with an indestructible counter on her', () => {
    const g = game({
      p1: { hand: ['arwen-mortal-queen'], battlefield: ['forest', 'plains', 'forest'] },
    });
    g.do(casts(g, 'arwen-mortal-queen')[0]!);
    done(g);
    const arwen = g.id('p1', 'arwen-mortal-queen');
    expect(named(g, arwen, 'indestructible')).toBe(1);
    expect(kw(g, arwen).has('indestructible')).toBe(true);
  });

  it('{1}, remove the counter: another target creature gains indestructible, and each gets a +1/+1 and a lifelink counter', () => {
    const g = game({
      p1: { battlefield: ['arwen-mortal-queen', 'savannah-lions', 'forest'] },
    });
    const arwen = g.id('p1', 'arwen-mortal-queen');
    const lions = g.id('p1', 'savannah-lions');
    g.state.objects[arwen]!.counters = { indestructible: 1 };
    // Only another creature is a target.
    expect(
      abilityActions(g, arwen, 0).every(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.every((t) => 'object' in t && t.object.id !== arwen),
      ),
    ).toBe(true);
    activate(g, arwen, 0, [g.ref(lions)]);
    done(g);
    expect(named(g, arwen, 'indestructible')).toBe(0);
    expect(plus(g, arwen)).toBe(1);
    expect(named(g, arwen, 'lifelink')).toBe(1);
    expect(plus(g, lions)).toBe(1);
    expect(named(g, lions, 'lifelink')).toBe(1);
    expect(kw(g, lions).has('indestructible')).toBe(true);
    expect(kw(g, lions).has('lifelink')).toBe(true);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(pt(g, arwen)).toEqual([3, 3]);
    // The indestructible lasts only until end of turn; the counters stay.
    passTo(g, 'main1', 'p2');
    expect(kw(g, lions).has('indestructible')).toBe(false);
    expect(kw(g, lions).has('lifelink')).toBe(true);
  });

  it('cannot be activated without a counter', () => {
    const g = game({ p1: { battlefield: ['arwen-mortal-queen', 'savannah-lions', 'forest'] } });
    expect(abilityActions(g, g.id('p1', 'arwen-mortal-queen'), 0)).toHaveLength(0);
  });
});

describe('Flame of Anor', () => {
  const modeOf = (a: Cast) => a.mode;
  it('choose one: three modes', () => {
    const g = game({
      p1: { hand: ['flame-of-anor'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['serra-angel', 'soul-guide-lantern'] },
    });
    const acts = casts(g, 'flame-of-anor');
    // Without a Wizard: only the three single modes (draw two: 2 players; destroy: 1; damage: 1 creature).
    expect(new Set(acts.map(modeOf))).toEqual(new Set([0, 1, 2]));
    expect(acts.filter((a) => modeOf(a) === 0)).toHaveLength(2);
  });

  it('target player draws two cards', () => {
    const g = game({
      p1: { hand: ['flame-of-anor'], battlefield: ['island', 'mountain', 'island'] },
    });
    g.do(casts(g, 'flame-of-anor').find((a) => modeOf(a) === 0 && targetingPlayer('p1')(a))!);
    done(g);
    expect(hand(g)).toHaveLength(2);
  });

  it('destroy target artifact', () => {
    const g = game({
      p1: { hand: ['flame-of-anor'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['soul-guide-lantern'] },
    });
    g.do(casts(g, 'flame-of-anor').find((a) => modeOf(a) === 1)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['soul-guide-lantern']);
  });

  it('deals 5 damage to target creature', () => {
    const g = game({
      p1: { hand: ['flame-of-anor'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'flame-of-anor').find((a) => modeOf(a) === 2)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('with a Wizard you may choose two instead', () => {
    const g = game({
      p1: {
        hand: ['flame-of-anor'],
        battlefield: ['island', 'mountain', 'island', 'ghitu-lavarunner'],
      },
      p2: { battlefield: ['serra-angel', 'soul-guide-lantern'] },
    });
    const acts = casts(g, 'flame-of-anor');
    expect(new Set(acts.map(modeOf))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    // Destroy the artifact and 5 damage to the Angel.
    const both = acts.find(
      (a) =>
        a.mode === 5 &&
        targeting(g.id('p2', 'soul-guide-lantern'))(a) &&
        targeting(g.id('p2', 'serra-angel'))(a),
    );
    expect(both).toBeDefined();
    g.do(both!);
    done(g);
    expect(gy(g, 'p2').sort()).toEqual(['serra-angel', 'soul-guide-lantern']);
  });

  it('the same artifact creature can be the target of both modes of a pair', () => {
    const g = game({
      p1: {
        hand: ['flame-of-anor'],
        battlefield: ['island', 'mountain', 'island', 'ghitu-lavarunner'],
      },
      p2: { battlefield: ['scrawling-crawler'] },
    });
    const crawler = g.id('p2', 'scrawling-crawler');
    const both = casts(g, 'flame-of-anor').find(
      (a) =>
        a.mode === 5 &&
        a.targets.length === 2 &&
        a.targets.every((t) => 'object' in t && t.object.id === crawler),
    );
    expect(both).toBeDefined();
    g.do(both!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['scrawling-crawler']);
  });

  it('a Wizard that is gone before casting leaves only one mode', () => {
    const g = game({
      p1: {
        hand: ['flame-of-anor'],
        battlefield: ['island', 'mountain', 'island', 'ghitu-lavarunner'],
      },
      p2: { battlefield: ['serra-angel', 'soul-guide-lantern'] },
    });
    g.state.battlefield = g.state.battlefield.filter(
      (id) => g.obj(id).defId !== 'ghitu-lavarunner',
    );
    expect(new Set(casts(g, 'flame-of-anor').map(modeOf))).toEqual(new Set([0, 1, 2]));
  });
});
