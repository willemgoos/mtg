import { describe, expect, it } from 'vitest';
import { getCharacteristics, redactFor } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { createHeuristicBot } from '../../ai/src/index.ts';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a, multi-b: W/B, U/R, B/G, R/W, G/U and three-colour gold cards.

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
/** Scenario planeswalkers start without loyalty counters: give them theirs before the first state-based check. */
const loyalty = (g: GameDriver, id: string, n: number) => {
  g.obj(id).counters = { ...g.obj(id).counters, loyalty: n };
};
/** Passes priority while something is on the stack, until a decision other than priority comes up. */
function resolveStack(g: GameDriver): GameDriver {
  for (let i = 0; i < 20 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
  return g;
}
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
}

/** Resolves the stack and any choices with simple defaults (bounded). */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'chooseObject' || d.kind === 'searchLibrary') {
      const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card);
      g.do(pick ?? { type: 'chooseCard', player: d.player, card: null });
    } else if (d.kind === 'sacrificeSeveral' || d.kind === 'sacrifice') {
      g.do(g.legal()[0]!);
    } else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

/** Passes priority until it is `step` (of the turn after the current one if it already is). */
function passToStep(g: GameDriver, step: string): void {
  for (let i = 0; i < 60; i++) {
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

const NAMES = [
  'Blessed Ghoul',
  'Charge the Sanctum',
  'Clash of Elements',
  'Edgar, Ancient Bloodlord',
  'Entrust the Spark',
  'Ferocity of the Hunt',
  'Frostbite Pyromental',
  'Hapatra, the Desert Fang',
  'Karn, Gilded Guardian',
  'Mabel, Valley Hero',
  'Primal Witchstalker',
  'Saheeli, Jewel of Avishkar',
  'Solitary Cell',
  'Tam, the Possibility',
  'Twinned Vision',
  'Twisted Fates',
  'Vindictive Triumph',
  'Vraska, Soul of Stone',
  'Vraska, the Cutting Glare',
  "Warrior's Blades",
];

describe('the pool', () => {
  it('has every multi-b card with its printed characteristics', () => {
    for (const name of NAMES) {
      const d = [...cardDb.values()].find((c) => c.name === name && !c.isToken);
      expect(d, name).toBeDefined();
    }
    const get = (name: string) => [...cardDb.values()].find((c) => c.name === name)!;
    expect(get('Karn, Gilded Guardian').keywords).toEqual(
      expect.arrayContaining(['vigilance', 'trample']),
    );
    expect(get('Karn, Gilded Guardian').manaCost.twoHybrid).toHaveLength(5);
    expect(get('Frostbite Pyromental').keywords).toEqual(
      expect.arrayContaining(['trample', 'haste']),
    );
    expect(get('Ferocity of the Hunt').keywords).toContain('flash');
    expect(get('Blessed Ghoul').keywords).toContain('lifelink');
    expect(get('Primal Witchstalker').keywords).toContain('menace');
    expect(get('Vraska, the Cutting Glare').keywords).toContain('deathtouch');
    expect(get('Twinned Vision').manaCost.hybrid).toEqual([['U', 'R']]);
  });
});

describe('Blessed Ghoul', () => {
  it('returns from the graveyard to your hand for {2}{W/B}, and not from anywhere else', () => {
    const g = game({
      p1: { graveyard: ['blessed-ghoul'], battlefield: ['plains', 'plains', 'plains'] },
    });
    const ghoul = g.id('p1', 'blessed-ghoul', 'graveyard');
    activate(g, ghoul, 0);
    done(g);
    expect(hand(g)).toContain('blessed-ghoul');
    expect(gy(g)).not.toContain('blessed-ghoul');
    // A black mana pays the hybrid pip too.
    const g2 = game({
      p1: { graveyard: ['blessed-ghoul'], battlefield: ['swamp', 'forest', 'forest'] },
    });
    activate(g2, g2.id('p1', 'blessed-ghoul', 'graveyard'), 0);
    done(g2);
    expect(hand(g2)).toContain('blessed-ghoul');
    // Not activatable from the battlefield.
    const g3 = game({ p1: { battlefield: ['blessed-ghoul', ...n('swamp', 3)] } });
    expect(g3.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('has lifelink', () => {
    const g = game({ p1: { battlefield: ['blessed-ghoul'] } });
    expect(keywords(g, g.id('p1', 'blessed-ghoul'))).toContain('lifelink');
  });
});

describe('Charge the Sanctum', () => {
  it('mode 1: creatures you control get +2/+0 until end of turn', () => {
    const g = game({
      p1: {
        hand: ['charge-the-sanctum'],
        battlefield: ['savannah-lions', 'savannah-lions', ...n('plains', 3)],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'charge-the-sanctum', [], { mode: 0 });
    done(g);
    for (const l of all(g, 'savannah-lions')) expect(pt(g, l)).toEqual([4, 1]);
    expect(pt(g, g.id('p2', 'bear-cub'))).toEqual([2, 2]);
  });

  it('mode 2: target creature gets +2/+0, first strike and a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['charge-the-sanctum'], battlefield: ['savannah-lions', ...n('mountain', 3)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'charge-the-sanctum', [g.ref(lions)], { mode: 1 });
    done(g);
    expect(pt(g, lions)).toEqual([5, 2]);
    expect(keywords(g, lions)).toContain('firstStrike');
    expect(g.obj(lions).plusOneCounters).toBe(1);
  });

  it('costs {2}{R/W}: payable with red or white', () => {
    const g = game({ p1: { hand: ['charge-the-sanctum'], battlefield: n('mountain', 3) } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const g2 = game({ p1: { hand: ['charge-the-sanctum'], battlefield: n('forest', 3) } });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Clash of Elements', () => {
  it("the owner may put it on top of their library and takes 2 damage (their choice, even for your permanent's owner)", () => {
    const g = game({
      p1: { hand: ['clash-of-elements'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'clash-of-elements', [g.ref(angel)]);
    g.pass();
    g.pass();
    // The owner (p2) decides.
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(library(g, 'p2')[0]).toBe('serra-angel');
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(20);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it("if they don't, it goes on the bottom and nobody is hurt", () => {
    const g = game({
      p1: { hand: ['clash-of-elements'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'clash-of-elements', [g.ref(g.id('p2', 'serra-angel'))]);
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    done(g);
    const lib = library(g, 'p2');
    expect(lib[lib.length - 1]).toBe('serra-angel');
    expect(g.life('p2')).toBe(20);
  });

  it('can target your own permanent: you choose and take the damage', () => {
    const g = game({
      p1: {
        hand: ['clash-of-elements'],
        battlefield: ['island', 'mountain', 'island', 'savannah-lions'],
      },
    });
    cast(g, 'clash-of-elements', [g.ref(g.id('p1', 'savannah-lions'))]);
    g.pass();
    g.pass();
    expect(g.actor).toBe('p1');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    done(g);
    expect(library(g)[0]).toBe('savannah-lions');
    expect(g.life('p1')).toBe(18);
  });

  it('damages the owner, not the controller, of a stolen permanent', () => {
    const g = game({
      p1: { hand: ['clash-of-elements'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    // p1 controls it, p2 owns it.
    g.obj(lions).controller = 'p1';
    cast(g, 'clash-of-elements', [g.ref(lions)]);
    g.pass();
    g.pass();
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(20);
  });

  it("can't target a land", () => {
    const g = game({
      p1: { hand: ['clash-of-elements'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['forest'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Edgar, Ancient Bloodlord', () => {
  it('gains 1 life whenever another creature or planeswalker you control dies', () => {
    const g = game({
      p1: {
        battlefield: ['edgar-ancient-bloodlord', 'savannah-lions', 'ral-zarek-guest-lecturer'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    loyalty(g, g.id('p1', 'ral-zarek-guest-lecturer'), 3);
    g.obj(g.id('p1', 'savannah-lions')).damage = 5;
    g.pass();
    done(g);
    expect(g.life('p1')).toBe(21);
    // A planeswalker dying (no loyalty left) too.
    g.obj(g.id('p1', 'ral-zarek-guest-lecturer')).counters = { loyalty: 0 };
    g.pass();
    done(g);
    expect(g.life('p1')).toBe(22);
    // The opponent's creatures don't count.
    g.obj(g.id('p2', 'bear-cub')).damage = 5;
    g.pass();
    done(g);
    expect(g.life('p1')).toBe(22);
  });

  it("doesn't trigger for Edgar himself dying", () => {
    const g = game({ p1: { battlefield: ['edgar-ancient-bloodlord'] } });
    g.obj(g.id('p1', 'edgar-ancient-bloodlord')).damage = 5;
    g.pass();
    done(g);
    expect(g.life('p1')).toBe(20);
  });

  it('{2}, sacrifice another creature: +1/+1 counter and menace until end of turn', () => {
    const g = game({
      p1: { battlefield: ['edgar-ancient-bloodlord', 'savannah-lions', 'plains', 'plains'] },
    });
    const edgar = g.id('p1', 'edgar-ancient-bloodlord');
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, edgar)).not.toContain('menace');
    activate(g, edgar, 1, [], { sacrifice: lions });
    done(g);
    expect(g.obj(edgar).plusOneCounters).toBe(1);
    expect(pt(g, edgar)).toEqual([3, 4]);
    expect(keywords(g, edgar)).toContain('menace');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    // The sacrificed creature died: Edgar's own trigger.
    expect(g.life('p1')).toBe(21);
    // Menace ends with the turn.
    for (let i = 0; i < 60 && g.state.turn.activePlayer === 'p1'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(keywords(g, edgar)).not.toContain('menace');
  });

  it('can sacrifice a planeswalker, but never himself', () => {
    const g = game({
      p1: {
        battlefield: ['edgar-ancient-bloodlord', 'ral-zarek-guest-lecturer', 'plains', 'plains'],
      },
    });
    const edgar = g.id('p1', 'edgar-ancient-bloodlord');
    const ral = g.id('p1', 'ral-zarek-guest-lecturer');
    loyalty(g, ral, 3);
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === edgar);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.type === 'activateAbility' && a.sacrifice === ral)).toBe(true);
    activate(g, edgar, 1, [], { sacrifice: ral });
    done(g);
    expect(g.obj(edgar).plusOneCounters).toBe(1);
    expect(g.life('p1')).toBe(21);
    // Alone he has nothing to sacrifice.
    const g2 = game({ p1: { battlefield: ['edgar-ancient-bloodlord', 'plains', 'plains'] } });
    expect(g2.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Entrust the Spark', () => {
  it('sacrifice a planeswalker to put a planeswalker from your library onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['entrust-the-spark'],
        battlefield: [...n('forest', 3), ...n('island', 2), 'ral-zarek-guest-lecturer'],
        library: ['vivien-reid', 'forest', 'forest'],
      },
    });
    loyalty(g, g.id('p1', 'ral-zarek-guest-lecturer'), 3);
    cast(g, 'entrust-the-spark');
    done(g, { accept: true });
    expect(all(g, 'ral-zarek-guest-lecturer')).toHaveLength(0);
    expect(gy(g)).toContain('ral-zarek-guest-lecturer');
    const vivien = g.id('p1', 'vivien-reid');
    expect(g.obj(vivien).zone).toBe('battlefield');
    // It entered with its starting loyalty and survived state-based actions.
    expect(g.obj(vivien).counters?.loyalty).toBe(5);
  });

  it('is optional: declining sacrifices nothing and finds nothing', () => {
    const g = game({
      p1: {
        hand: ['entrust-the-spark'],
        battlefield: [...n('forest', 3), ...n('island', 2), 'ral-zarek-guest-lecturer'],
        library: ['vivien-reid', 'forest', 'forest'],
      },
    });
    loyalty(g, g.id('p1', 'ral-zarek-guest-lecturer'), 3);
    cast(g, 'entrust-the-spark');
    done(g, { accept: false });
    expect(all(g, 'ral-zarek-guest-lecturer')).toHaveLength(1);
    expect(library(g)).toContain('vivien-reid');
  });

  it('does nothing without a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['entrust-the-spark'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: ['vivien-reid', 'forest'],
      },
    });
    cast(g, 'entrust-the-spark');
    done(g, { accept: true });
    expect(library(g)).toContain('vivien-reid');
    expect(all(g, 'vivien-reid')).toHaveLength(0);
  });

  it('with only one planeswalker and none left in the library, it is sacrificed and nothing is found', () => {
    const g = game({
      p1: {
        hand: ['entrust-the-spark'],
        battlefield: [...n('forest', 3), ...n('island', 2), 'vivien-reid'],
        library: ['forest', 'forest'],
      },
    });
    loyalty(g, g.id('p1', 'vivien-reid'), 5);
    cast(g, 'entrust-the-spark');
    done(g, { accept: true });
    expect(all(g, 'vivien-reid')).toHaveLength(0);
    expect(gy(g)).toContain('vivien-reid');
  });
});

describe('Ferocity of the Hunt', () => {
  it('flash Aura: +1/+0 and deathtouch', () => {
    const g = game({
      p1: { hand: ['ferocity-of-the-hunt'], battlefield: ['savannah-lions', 'swamp', 'forest'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'ferocity-of-the-hunt', [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('deathtouch');
  });

  it('can be cast at instant speed (flash) on the opponent’s turn', () => {
    const g = game({
      p1: { hand: ['ferocity-of-the-hunt'], battlefield: ['savannah-lions', 'swamp', 'forest'] },
      active: 'p2',
    });
    g.do({ type: 'passPriority', player: 'p2' });
    expect(g.actor).toBe('p1');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('returns the creature tapped to the battlefield when it dies', () => {
    const g = game({
      p1: { hand: ['ferocity-of-the-hunt'], battlefield: ['savannah-lions', 'swamp', 'forest'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'ferocity-of-the-hunt', [g.ref(lions)]);
    done(g);
    g.obj(lions).damage = 5;
    g.pass();
    done(g);
    const back = all(g, 'savannah-lions');
    expect(back).toHaveLength(1);
    expect(g.obj(back[0]!).tapped).toBe(true);
    expect(gy(g)).toContain('ferocity-of-the-hunt');
    // The Aura is gone: a plain 2/1 now.
    expect(pt(g, back[0]!)).toEqual([2, 1]);
  });

  it("returns an opponent's creature under its owner's control, not yours", () => {
    const g = game({
      p1: { hand: ['ferocity-of-the-hunt'], battlefield: ['swamp', 'forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'ferocity-of-the-hunt', [g.ref(bear)]);
    done(g);
    g.obj(bear).damage = 9;
    g.pass();
    done(g);
    const back = all(g, 'bear-cub');
    expect(back).toHaveLength(1);
    expect(g.obj(back[0]!).controller).toBe('p2');
    expect(g.obj(back[0]!).tapped).toBe(true);
  });

  it("doesn't return a token (it ceases to exist)", () => {
    const g = game({
      p1: { hand: ['ferocity-of-the-hunt'], battlefield: ['swamp', 'forest'] },
      p2: { battlefield: [{ card: 'fra-cadet-token' }] },
    });
    const cadet = g.id('p2', 'fra-cadet-token');
    g.obj(cadet).isToken = true;
    cast(g, 'ferocity-of-the-hunt', [g.ref(cadet)]);
    done(g);
    g.obj(cadet).damage = 9;
    g.pass();
    done(g);
    expect(all(g, 'fra-cadet-token')).toHaveLength(0);
  });
});

describe('Frostbite Pyromental', () => {
  it('has haste and trample, draws two on combat damage to a player, and is sacrificed at the end step', () => {
    const g = game({
      p1: { hand: ['frostbite-pyromental'], battlefield: ['island', 'mountain', 'mountain'] },
      p2: { life: 20 },
    });
    cast(g, 'frostbite-pyromental');
    done(g);
    const pyro = g.id('p1', 'frostbite-pyromental');
    expect(keywords(g, pyro)).toEqual(expect.arrayContaining(['haste', 'trample']));
    const before = g.state.players.p1.hand.length;
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(pyro);
    done(g);
    // Move through combat damage.
    for (let i = 0; i < 12 && g.state.turn.step !== 'main2'; i++) {
      const d = g.decision;
      if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.life('p2')).toBe(16);
    expect(g.state.players.p1.hand.length).toBe(before + 2);
    passToStep(g, 'end');
    done(g);
    expect(all(g, 'frostbite-pyromental')).toHaveLength(0);
    expect(gy(g)).toContain('frostbite-pyromental');
  });

  it('is also sacrificed at the opponent’s end step if it is still around', () => {
    const g = game({ p1: { battlefield: ['frostbite-pyromental'] }, step: 'main2', active: 'p2' });
    passToStep(g, 'end');
    done(g);
    expect(all(g, 'frostbite-pyromental')).toHaveLength(0);
  });
});

describe('Hapatra, the Desert Fang', () => {
  it('puts X -1/-1 counters on up to one target opposing creature, X the greatest mana value in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['hapatra-the-desert-fang'],
        battlefield: [...n('swamp', 3), ...n('forest', 2)],
        graveyard: ['bear-cub', 'serra-angel'],
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'hapatra-the-desert-fang');
    done(g);
    // Serra Angel (mana value 5) is the most expensive card in the graveyard: five counters kill the 4/4.
    expect(g.obj(angel).zone).toBe('graveyard');
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(minus(g, g.id('p2', 'savannah-lions'))).toBe(0);
  });

  it('with a 3 in the graveyard, a 4/4 shrinks to 1/1 and keeps living', () => {
    const g = game({
      p1: {
        hand: ['hapatra-the-desert-fang'],
        battlefield: [...n('swamp', 3), ...n('forest', 2)],
        graveyard: ['bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'hapatra-the-desert-fang');
    done(g);
    const angel = g.id('p2', 'serra-angel');
    expect(minus(g, angel)).toBe(2);
    expect(pt(g, angel)).toEqual([2, 2]);
  });

  it('the target is optional ("up to one") and must be an opponent’s creature', () => {
    const g = game({
      p1: {
        hand: ['hapatra-the-desert-fang'],
        battlefield: [...n('swamp', 3), ...n('forest', 2), 'savannah-lions'],
        graveyard: ['serra-angel'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'hapatra-the-desert-fang');
    g.pass();
    g.pass();
    const d = g.decision;
    expect(d.kind).toBe('chooseTriggerTargets');
    const legal = g.legal().filter((a) => a.type === 'chooseTargets');
    // Targets: nothing, or the opposing Bear; never your own creatures.
    const ids = legal.flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []));
    expect(ids.every((t) => 'object' in t && g.obj(t.object.id).controller === 'p2')).toBe(true);
    g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(minus(g, g.id('p2', 'bear-cub'))).toBe(0);
  });

  it('with an empty graveyard X is 0', () => {
    const g = game({
      p1: { hand: ['hapatra-the-desert-fang'], battlefield: [...n('swamp', 3), ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'hapatra-the-desert-fang');
    done(g);
    expect(minus(g, g.id('p2', 'bear-cub'))).toBe(0);
  });
});

describe('-1/-1 counters', () => {
  it('a +1/+1 counter and a -1/-1 counter on the same creature cancel out', () => {
    const g = game({ p1: { battlefield: ['serra-angel'] } });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).plusOneCounters = 2;
    g.obj(angel).counters = { '-1/-1': 3 };
    expect(pt(g, angel)).toEqual([3, 3]);
    g.pass();
    expect(g.obj(angel).plusOneCounters).toBe(0);
    expect(minus(g, angel)).toBe(1);
    expect(pt(g, angel)).toEqual([3, 3]);
  });
});

describe('Karn, Gilded Guardian', () => {
  it('draws a card for each colour among your other artifacts', () => {
    const g = game({
      p1: {
        hand: ['karn-gilded-guardian'],
        battlefield: [
          ...n('plains', 10),
          'carrot-cake',
          'sinister-monolith',
          'wishing-well',
          'carrot-cake',
        ],
        library: ['forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'karn-gilded-guardian');
    done(g);
    // White, black and blue: three cards.
    expect(g.state.players.p1.hand.length).toBe(3);
    const karn = g.id('p1', 'karn-gilded-guardian');
    expect(keywords(g, karn)).toEqual(expect.arrayContaining(['vigilance', 'trample']));
    expect(pt(g, karn)).toEqual([5, 5]);
  });

  it("doesn't count itself: with no other artifacts it draws nothing", () => {
    const g = game({
      p1: {
        hand: ['karn-gilded-guardian'],
        battlefield: n('plains', 10),
        library: ['forest', 'forest'],
      },
    });
    cast(g, 'karn-gilded-guardian');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(0);
  });

  it('costs {2/W}{2/U}{2/B}{2/R}{2/G}: each pip is one mana of its colour or two of anything', () => {
    const colours = game({
      p1: {
        hand: ['karn-gilded-guardian'],
        battlefield: ['plains', 'island', 'swamp', 'mountain', 'forest'],
      },
    });
    expect(colours.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const nine = game({ p1: { hand: ['karn-gilded-guardian'], battlefield: n('plains', 9) } });
    expect(nine.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const eight = game({ p1: { hand: ['karn-gilded-guardian'], battlefield: n('plains', 8) } });
    expect(eight.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Mabel, Valley Hero', () => {
  it('puts a +1/+1 counter on a creature that entered this turn when Mabel or another creature you control enters', () => {
    const g = game({
      p1: {
        hand: ['mabel-valley-hero', 'savannah-lions'],
        battlefield: ['plains', 'mountain', 'plains', 'plains'],
      },
    });
    cast(g, 'mabel-valley-hero');
    done(g);
    const mabel = g.id('p1', 'mabel-valley-hero');
    // The only creature that entered this turn is Mabel herself.
    expect(g.obj(mabel).plusOneCounters).toBe(1);
    cast(g, 'savannah-lions');
    done(g);
    // The counter may go on any creature that entered this turn: the default pick is the first legal target.
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(mabel).plusOneCounters + g.obj(lions).plusOneCounters).toBe(2);
  });

  it("can put the counter on a creature that entered earlier this turn, even an opponent's, but not an older one", () => {
    const g = game({
      p1: { battlefield: ['mabel-valley-hero', 'bear-cub', 'plains'], hand: ['savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    // The Bear and Mabel entered on an earlier turn; the opposing Lions entered this turn.
    g.obj(g.id('p1', 'mabel-valley-hero')).zoneTurn = 1;
    g.obj(g.id('p1', 'bear-cub')).zoneTurn = 1;
    g.obj(g.id('p2', 'serra-angel')).zoneTurn = 1;
    g.obj(g.id('p2', 'savannah-lions')).zoneTurn = g.state.turn.number;
    cast(g, 'savannah-lions');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const targets = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) =>
        'object' in t ? g.obj(t.object.id).defId + ':' + g.obj(t.object.id).controller : '',
      );
    expect(targets.sort()).toEqual(['savannah-lions:p1', 'savannah-lions:p2']);
    // Put it on the opposing one.
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(g.id('p2', 'savannah-lions'))],
    });
    done(g);
    expect(g.obj(g.id('p2', 'savannah-lions')).plusOneCounters).toBe(1);
  });
});

describe('Primal Witchstalker', () => {
  it('mills four, then returns a land card from your graveyard to the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['primal-witchstalker'],
        battlefield: ['swamp', 'forest', 'swamp'],
        library: ['savannah-lions', 'mountain', 'bear-cub', 'serra-angel', 'forest'],
      },
    });
    cast(g, 'primal-witchstalker');
    done(g);
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions', 'bear-cub', 'serra-angel']));
    expect(library(g)).toEqual(['forest']);
    // The milled Mountain came back, tapped.
    const mountain = g.state.battlefield.find((id) => g.obj(id).defId === 'mountain')!;
    expect(mountain).toBeDefined();
    expect(g.obj(mountain).tapped).toBe(true);
    expect(gy(g)).not.toContain('mountain');
    expect(keywords(g, g.id('p1', 'primal-witchstalker'))).toContain('menace');
  });

  it('may return any land card in the graveyard, not only a milled one', () => {
    const g = game({
      p1: {
        hand: ['primal-witchstalker'],
        battlefield: ['swamp', 'forest', 'swamp'],
        graveyard: ['island'],
        library: n('savannah-lions', 6),
      },
    });
    cast(g, 'primal-witchstalker');
    resolveStack(g);
    // The reflexive trigger asks for a target (the Island is the only land card).
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    done(g);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'island')).toBe(true);
  });

  it('does nothing more when no land is in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['primal-witchstalker'],
        battlefield: ['swamp', 'forest', 'swamp'],
        library: n('savannah-lions', 6),
      },
    });
    cast(g, 'primal-witchstalker');
    done(g);
    expect(gy(g).filter((d) => d === 'savannah-lions')).toHaveLength(4);
    expect(g.state.stack).toHaveLength(0);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Saheeli, Jewel of Avishkar', () => {
  it('makes a 1/1 flying Thopter whenever you cast a noncreature spell, and Thopters have haste', () => {
    const g = game({
      p1: {
        hand: ['twinned-vision', 'savannah-lions'],
        battlefield: ['saheeli-jewel-of-avishkar', ...n('island', 3), 'plains'],
      },
    });
    cast(g, 'twinned-vision');
    done(g);
    const thopters = all(g, 'fra-multi-b-thopter-token');
    expect(thopters).toHaveLength(1);
    const t = thopters[0]!;
    expect(pt(g, t)).toEqual([1, 1]);
    expect(keywords(g, t)).toEqual(expect.arrayContaining(['flying', 'haste']));
    const def = cardDb.get('fra-multi-b-thopter-token')!;
    expect(def.types).toEqual(['Artifact', 'Creature']);
    expect(def.subtypes).toEqual(['Thopter']);
    expect(def.colors).toEqual([]);
    // A creature spell doesn't make one.
    cast(g, 'savannah-lions');
    done(g);
    expect(all(g, 'fra-multi-b-thopter-token')).toHaveLength(1);
    // Only your own Thopters get haste.
    expect(keywords(g, g.id('p1', 'saheeli-jewel-of-avishkar'))).not.toContain('haste');
  });

  it("doesn't trigger on opposing spells", () => {
    const g = game({
      p1: { battlefield: ['saheeli-jewel-of-avishkar'] },
      p2: { hand: ['twinned-vision'], battlefield: ['island', 'island'] },
      active: 'p2',
    });
    cast(g, 'twinned-vision');
    done(g);
    expect(all(g, 'fra-multi-b-thopter-token')).toHaveLength(0);
  });
});

describe('Solitary Cell', () => {
  it('exiles a nonland permanent of an opponent with mana value 3 or less (only those are legal targets)', () => {
    const g = game({
      p1: { hand: ['solitary-cell'], battlefield: ['mountain', 'plains'] },
      p2: { battlefield: ['bear-cub', 'serra-angel', 'forest'] },
    });
    cast(g, 'solitary-cell');
    resolveStack(g);
    // Only the Bear is a legal target (Serra Angel costs five, Forest is a land).
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const targets = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []));
    expect(targets).toHaveLength(1);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(exile(g, 'p2')).toContain('bear-cub');
  });

  it('the exiled permanent returns when the Cell leaves the battlefield', () => {
    const g = game({
      p1: { hand: ['solitary-cell'], battlefield: ['mountain', 'plains'] },
      p2: { battlefield: ['bear-cub'], hand: ['clash-of-elements'] },
    });
    cast(g, 'solitary-cell');
    done(g);
    expect(exile(g, 'p2')).toContain('bear-cub');
    // Bounce the Cell: p2 casts Clash of Elements at it (p1 then puts it on top of their library, or the bottom).
    g.state.turn.activePlayer = 'p2';
    g.state.decision = { kind: 'priority', player: 'p2' };
    for (const land of ['island', 'island', 'mountain'])
      g.state.battlefield.push(
        (() => {
          const o = g.state.objects[g.state.players.p2.library[0]!]!;
          o.defId = land;
          g.state.players.p2.library.shift();
          o.zone = 'battlefield';
          o.summoningSick = false;
          return o.id;
        })(),
      );
    cast(g, 'clash-of-elements', [g.ref(g.id('p1', 'solitary-cell'))]);
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    done(g);
    expect(all(g, 'solitary-cell')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.obj(all(g, 'bear-cub')[0]!).controller).toBe('p2');
    expect(exile(g, 'p2')).not.toContain('bear-cub');
  });

  it('{1}, {T}, discard a legendary card: draw a card (only legendary cards may be discarded)', () => {
    const g = game({
      p1: {
        battlefield: ['solitary-cell', 'mountain', 'plains'],
        hand: ['savannah-lions', 'edgar-ancient-bloodlord'],
        library: ['forest', 'forest'],
      },
    });
    const cell = g.id('p1', 'solitary-cell');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === cell);
    expect(acts).toHaveLength(1);
    const act = acts[0]!;
    expect(act.type === 'activateAbility' && act.discard).toBe(
      g.id('p1', 'edgar-ancient-bloodlord', 'hand'),
    );
    g.do(act);
    done(g);
    expect(gy(g)).toContain('edgar-ancient-bloodlord');
    expect(hand(g)).toEqual(['savannah-lions', 'forest']);
    expect(g.obj(cell).tapped).toBe(true);
  });

  it("can't be activated without a legendary card in hand", () => {
    const g = game({
      p1: { battlefield: ['solitary-cell', 'mountain', 'plains'], hand: ['savannah-lions'] },
    });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Tam, the Possibility', () => {
  it('planeswalker spells you cast cost {1} less', () => {
    const g = game({
      p1: {
        hand: ['ral-zarek-guest-lecturer'],
        battlefield: ['tam-the-possibility', 'swamp', 'swamp'],
      },
    });
    // {1}{B}{B} less {1}: two Swamps are enough.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const g2 = game({
      p1: { hand: ['ral-zarek-guest-lecturer'], battlefield: ['swamp', 'swamp'] },
    });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(false);
    // Other spells don't get cheaper.
    const g3 = game({
      p1: { hand: ['bear-cub'], battlefield: ['tam-the-possibility', 'forest'] },
    });
    expect(g3.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('{W}{U}{B}{R}{G}, {T}: proliferate once for each planeswalker type among your planeswalkers', () => {
    const g = game({
      p1: {
        battlefield: [
          'tam-the-possibility',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'vivien-reid',
          'ral-zarek-guest-lecturer',
          'ral-crackling-wit',
          'savannah-lions',
        ],
      },
    });
    const tam = g.id('p1', 'tam-the-possibility');
    const lions = g.id('p1', 'savannah-lions');
    loyalty(g, g.id('p1', 'vivien-reid'), 5);
    loyalty(g, g.id('p1', 'ral-zarek-guest-lecturer'), 3);
    loyalty(g, g.id('p1', 'ral-crackling-wit'), 4);
    g.obj(lions).plusOneCounters = 1;
    // Vivien and Ral: two types (the two Rals count once).
    activate(g, tam, 1);
    g.pass();
    g.pass();
    // First pass: choose the Lions, then stop.
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: lions });
    // The same permanent can't be chosen twice in one pass; "Done".
    expect(g.decision.kind).toBe('chooseObject');
    expect(g.legal().some((a) => a.type === 'chooseCard' && a.card === lions)).toBe(false);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    // Second pass.
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: lions });
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(g.obj(lions).plusOneCounters).toBe(3);
  });

  it('proliferate gives each chosen permanent another counter of every kind it has, opposing ones too, and loyalty', () => {
    const g = game({
      p1: {
        battlefield: [
          'tam-the-possibility',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'vivien-reid',
        ],
      },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const tam = g.id('p1', 'tam-the-possibility');
    const angel = g.id('p2', 'serra-angel');
    const viv = g.id('p1', 'vivien-reid');
    g.obj(angel).counters = { '-1/-1': 1, stun: 1 };
    g.obj(angel).plusOneCounters = 0;
    g.obj(viv).counters = { loyalty: 5 };
    activate(g, tam, 1);
    g.pass();
    g.pass();
    // Options: the Angel and Vivien, not the Bear or lands (no counters).
    expect(g.decision.kind).toBe('chooseObject');
    const opts = (g.decision as { options: string[] }).options;
    expect(opts.sort()).toEqual([angel, viv].sort());
    g.do({ type: 'chooseCard', player: 'p1', card: angel });
    g.do({ type: 'chooseCard', player: 'p1', card: viv });
    done(g);
    expect(minus(g, angel)).toBe(2);
    expect(g.obj(angel).counters?.stun).toBe(2);
    expect(g.obj(viv).counters?.loyalty).toBe(6);
    expect(g.obj(g.id('p2', 'bear-cub')).counters).toBeUndefined();
  });

  it('with no planeswalkers X is 0 and nothing is asked', () => {
    const g = game({
      p1: {
        battlefield: [
          'tam-the-possibility',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'savannah-lions',
        ],
      },
    });
    g.obj(g.id('p1', 'savannah-lions')).plusOneCounters = 1;
    activate(g, g.id('p1', 'tam-the-possibility'), 1);
    done(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
    expect(g.decision.kind).toBe('priority');
  });

  it('a pass ends by itself once every permanent with counters has been chosen, and later passes find nothing more', () => {
    const g = game({
      p1: {
        battlefield: [
          'tam-the-possibility',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'vivien-reid',
          'ral-crackling-wit',
        ],
      },
    });
    const viv = g.id('p1', 'vivien-reid');
    const ral = g.id('p1', 'ral-crackling-wit');
    loyalty(g, viv, 5);
    loyalty(g, ral, 4);
    activate(g, g.id('p1', 'tam-the-possibility'), 1);
    resolveStack(g);
    // Two types, so two passes. Pass one: both walkers get a counter.
    g.do({ type: 'chooseCard', player: 'p1', card: viv });
    g.do({ type: 'chooseCard', player: 'p1', card: ral });
    // Pass two begins right away: choose just one.
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: viv });
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(g.obj(viv).counters?.loyalty).toBe(7);
    expect(g.obj(ral).counters?.loyalty).toBe(5);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Twinned Vision', () => {
  it('draws a card when cast from your hand', () => {
    const g = game({
      p1: {
        hand: ['twinned-vision'],
        battlefield: ['island', 'mountain'],
        library: n('forest', 5),
      },
    });
    cast(g, 'twinned-vision');
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(gy(g)).toContain('twinned-vision');
  });

  it('flashback {1}{U/R}{U/R}, discard a card: draws two cards, then it is exiled', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        graveyard: ['twinned-vision'],
        battlefield: ['island', 'mountain', 'mountain'],
        library: n('forest', 5),
      },
    });
    const vision = g.id('p1', 'twinned-vision', 'graveyard');
    const casts = g.legal().filter((a) => a.type === 'castSpell' && a.card === vision);
    expect(casts).toHaveLength(1);
    // The additional cost: the card in hand is discarded.
    expect(casts[0]!.type === 'castSpell' && casts[0].discard).toBe(
      g.id('p1', 'savannah-lions', 'hand'),
    );
    g.do(casts[0]!);
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(hand(g)).toEqual(['forest', 'forest']);
    expect(exile(g)).toContain('twinned-vision');
    expect(gy(g)).not.toContain('twinned-vision');
  });

  it("can't be flashed back with an empty hand", () => {
    const g = game({
      p1: { graveyard: ['twinned-vision'], battlefield: ['island', 'mountain', 'mountain'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('flashback costs three mana', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        graveyard: ['twinned-vision'],
        battlefield: ['island', 'mountain'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Twisted Fates', () => {
  it('destroys a nonland permanent and puts a +1/+1 counter on each creature you control (target yourself)', () => {
    const g = game({
      p1: {
        hand: ['twisted-fates'],
        battlefield: [...n('plains', 3), ...n('swamp', 2), 'savannah-lions', 'bear-cub'],
      },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    cast(g, 'twisted-fates', [g.ref(g.id('p2', 'serra-angel')), { player: 'p1' }]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p2', 'llanowar-elves')).plusOneCounters).toBe(0);
  });

  it('the target player may be an opponent', () => {
    const g = game({
      p1: {
        hand: ['twisted-fates'],
        battlefield: [...n('plains', 3), ...n('swamp', 2), 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    cast(g, 'twisted-fates', [g.ref(g.id('p1', 'savannah-lions')), { player: 'p2' }]);
    done(g);
    // The Lions were destroyed first; the opponent's creatures get counters.
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'serra-angel')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p2', 'llanowar-elves')).plusOneCounters).toBe(1);
  });

  it("can't destroy a land", () => {
    const g = game({
      p1: { hand: ['twisted-fates'], battlefield: [...n('plains', 3), ...n('swamp', 2)] },
      p2: { battlefield: ['forest'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Vindictive Triumph', () => {
  it('exiles a creature with mana value 3 or less, returns it tapped under your control, exiles it at the next end step', () => {
    const g = game({
      p1: { hand: ['vindictive-triumph'], battlefield: ['plains', 'swamp', 'swamp'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'vindictive-triumph', [g.ref(g.id('p2', 'bear-cub'))]);
    done(g);
    const bear = all(g, 'bear-cub');
    expect(bear).toHaveLength(1);
    expect(g.obj(bear[0]!).controller).toBe('p1');
    expect(g.obj(bear[0]!).tapped).toBe(true);
    passToStep(g, 'end');
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(exile(g, 'p2')).toContain('bear-cub');
  });

  it('exiles a creature with mana value 4 or more for good', () => {
    const g = game({
      p1: { hand: ['vindictive-triumph'], battlefield: ['plains', 'swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'vindictive-triumph', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(exile(g, 'p2')).toContain('serra-angel');
  });

  it('works on a planeswalker: a cheap one returns under your control, tapped', () => {
    const g = game({
      p1: { hand: ['vindictive-triumph'], battlefield: ['plains', 'swamp', 'swamp'] },
      p2: { battlefield: ['rowan-scholar-of-sparks'] },
    });
    loyalty(g, g.id('p2', 'rowan-scholar-of-sparks'), 2);
    cast(g, 'vindictive-triumph', [g.ref(g.id('p2', 'rowan-scholar-of-sparks'))]);
    done(g);
    const rowan = all(g, 'rowan-scholar-of-sparks');
    expect(rowan).toHaveLength(1);
    expect(g.obj(rowan[0]!).controller).toBe('p1');
    expect(g.obj(rowan[0]!).counters?.loyalty).toBe(2);
    passToStep(g, 'end');
    done(g);
    expect(all(g, 'rowan-scholar-of-sparks')).toHaveLength(0);
  });

  it("a token is exiled and doesn't come back", () => {
    const g = game({
      p1: { hand: ['vindictive-triumph'], battlefield: ['plains', 'swamp', 'swamp'] },
      p2: { battlefield: ['fra-cadet-token'] },
    });
    const cadet = g.id('p2', 'fra-cadet-token');
    g.obj(cadet).isToken = true;
    cast(g, 'vindictive-triumph', [g.ref(cadet)]);
    done(g);
    expect(all(g, 'fra-cadet-token')).toHaveLength(0);
  });

  it("can't target lands or noncreature, nonplaneswalker permanents", () => {
    const g = game({
      p1: { hand: ['vindictive-triumph'], battlefield: ['plains', 'swamp', 'swamp'] },
      p2: { battlefield: ['forest', 'carrot-cake'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Vraska, Soul of Stone', () => {
  it('makes a Sculpture Treasure whenever you cast a noncreature spell; artifact creatures you control have vigilance', () => {
    const g = game({
      p1: {
        hand: ['twinned-vision', 'savannah-lions'],
        battlefield: ['vraska-soul-of-stone', 'island', 'mountain', 'plains'],
      },
    });
    cast(g, 'twinned-vision');
    done(g);
    const tokens = all(g, 'fra-sculpture-treasure-token');
    expect(tokens).toHaveLength(1);
    const t = tokens[0]!;
    expect(pt(g, t)).toEqual([1, 1]);
    expect(keywords(g, t)).toContain('vigilance');
    const def = cardDb.get('fra-sculpture-treasure-token')!;
    expect(def.subtypes).toEqual(['Sculpture', 'Treasure']);
    expect(def.types).toEqual(['Artifact', 'Creature']);
    // Not a creature spell.
    cast(g, 'savannah-lions');
    done(g);
    expect(all(g, 'fra-sculpture-treasure-token')).toHaveLength(1);
    // Non-artifact creatures don't get vigilance.
    expect(keywords(g, g.id('p1', 'vraska-soul-of-stone'))).not.toContain('vigilance');
  });

  it('the token taps and is sacrificed for one mana of any color', () => {
    const g = game({
      p1: { battlefield: ['vraska-soul-of-stone', 'fra-sculpture-treasure-token'] },
    });
    const tok = g.id('p1', 'fra-sculpture-treasure-token');
    g.obj(tok).isToken = true;
    g.obj(tok).summoningSick = false;
    // As a mana ability it is used by paying for a spell: a red spell with the token and nothing else.
    const g2 = game({
      p1: { hand: ['twinned-vision'], battlefield: ['island', 'fra-sculpture-treasure-token'] },
    });
    const tok2 = g2.id('p1', 'fra-sculpture-treasure-token');
    g2.obj(tok2).isToken = true;
    g2.obj(tok2).summoningSick = false;
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(true);
    cast(g2, 'twinned-vision');
    done(g2);
    expect(all(g2, 'fra-sculpture-treasure-token')).toHaveLength(0);
  });
});

describe('Vraska, the Cutting Glare', () => {
  it('with six or more lands destroys target permanent an opponent controls; they create a Treasure', () => {
    const g = game({
      p1: {
        hand: ['vraska-the-cutting-glare'],
        battlefield: [...n('swamp', 3), ...n('forest', 3), 'mountain'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'vraska-the-cutting-glare');
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    const treasure = all(g, 'treasure-token');
    expect(treasure).toHaveLength(1);
    expect(g.obj(treasure[0]!).controller).toBe('p2');
    expect(keywords(g, g.id('p1', 'vraska-the-cutting-glare'))).toContain('deathtouch');
    expect(pt(g, g.id('p1', 'vraska-the-cutting-glare'))).toEqual([4, 4]);
  });

  it('with fewer than six lands (Vraska herself is no land) nothing happens', () => {
    const g = game({
      p1: {
        hand: ['vraska-the-cutting-glare'],
        battlefield: [...n('swamp', 3), ...n('forest', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'vraska-the-cutting-glare');
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(all(g, 'treasure-token')).toHaveLength(0);
  });

  it('can destroy a land, an artifact, or any other permanent', () => {
    const g = game({
      p1: {
        hand: ['vraska-the-cutting-glare'],
        battlefield: [...n('swamp', 3), ...n('forest', 3)],
      },
      p2: { battlefield: ['forest'] },
    });
    cast(g, 'vraska-the-cutting-glare');
    done(g);
    expect(
      g.state.battlefield.filter(
        (id) => g.obj(id).controller === 'p2' && g.obj(id).defId === 'forest',
      ),
    ).toHaveLength(0);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });
});

describe("Warrior's Blades", () => {
  it('deals 3 damage to any target and you gain 3 life when it enters', () => {
    const g = game({
      p1: { hand: ['warriors-blades'], battlefield: ['mountain', 'plains', 'mountain', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'warriors-blades');
    g.pass();
    g.pass();
    // Target the opponent.
    g.do({ type: 'chooseTargets', player: 'p1', targets: [{ player: 'p2' }] });
    done(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });

  it('can hit a creature', () => {
    const g = game({
      p1: { hand: ['warriors-blades'], battlefield: ['mountain', 'plains', 'mountain', 'plains'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'warriors-blades');
    g.pass();
    g.pass();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(g.id('p2', 'bear-cub'))] });
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('equipped creature gets +2/+1; equip {3}', () => {
    const g = game({
      p1: { battlefield: ['warriors-blades', 'savannah-lions', ...n('mountain', 3)] },
    });
    const blades = g.id('p1', 'warriors-blades');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, blades, 2, [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
    // All three mana were spent.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
    ).toHaveLength(0);
  });

  it('equip costs {1} less for each +1/+1 counter on the creature it targets', () => {
    const g = game({
      p1: { battlefield: ['warriors-blades', 'savannah-lions', 'bear-cub', ...n('mountain', 3)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const bear = g.id('p1', 'bear-cub');
    g.obj(lions).plusOneCounters = 2;
    // Without counters the Bear costs {3}; the Lions cost {1}.
    activate(g, g.id('p1', 'warriors-blades'), 2, [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([6, 4]);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
    ).toHaveLength(2);
    expect(g.obj(g.id('p1', 'warriors-blades')).attachedTo).toBe(lions);
    // Moving it to the Bear costs the full {3}: only two Mountains are left.
    const acts = g
      .legal()
      .filter(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      );
    expect(acts).toHaveLength(0);
  });

  it('three counters make it free, but not below zero', () => {
    const g = game({
      p1: { battlefield: ['warriors-blades', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
    g.obj(lions).plusOneCounters = 5;
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(true);
  });
});

describe('bots', () => {
  it('a bot answers a proliferate prompt, one permanent at a time, and finishes', () => {
    const g = game({
      p1: {
        battlefield: [
          'tam-the-possibility',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'vivien-reid',
          'savannah-lions',
        ],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    loyalty(g, g.id('p1', 'vivien-reid'), 5);
    g.obj(g.id('p1', 'savannah-lions')).plusOneCounters = 1;
    g.obj(g.id('p2', 'serra-angel')).counters = { '-1/-1': 1 };
    activate(g, g.id('p1', 'tam-the-possibility'), 1);
    resolveStack(g);
    const bot = createHeuristicBot(cardDb);
    let prompts = 0;
    for (let i = 0; i < 12 && g.decision.kind === 'chooseObject'; i++) {
      prompts++;
      g.do(bot.chooseAction(redactFor(g.state, 'p1', cardDb), 'p1'));
    }
    expect(g.decision.kind).toBe('priority');
    expect(prompts).toBeGreaterThan(0);
    // It helped itself, and hurt the opponent's creature rather than shrinking its own.
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(2);
    expect(minus(g, g.id('p2', 'serra-angel'))).toBe(2);
  });

  it('a bot as the owner answers Clash of Elements', () => {
    const g = game({
      p1: { hand: ['clash-of-elements'], battlefield: ['island', 'mountain', 'island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'clash-of-elements', [g.ref(g.id('p2', 'serra-angel'))]);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const bot = createHeuristicBot(cardDb);
    g.do(bot.chooseAction(redactFor(g.state, 'p2', cardDb), 'p2'));
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });
});
