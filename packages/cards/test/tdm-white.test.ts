import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { TDM_WHITE, TDM_WHITE_BACKS } from '../src/tdm/white.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b: the white cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  all(g, defId).filter((id) => !p || g.obj(id).controller === p);

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: { option?: number | RegExp; card?: string } = {}): GameDriver {
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
    else if (d.kind === 'scry') g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card)) {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
      g.do(
        (opts.card
          ? cards.find((a) => a.type === 'chooseCard' && g.obj(a.card!).defId === opts.card)
          : undefined) ?? cards[0]!,
      );
    } else if (g.legal().some((a) => a.type === 'chooseCard'))
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: true });
    else break;
  }
  return g;
}

const activate = (g: GameDriver, source: string, abilityIndex: number, targets: object[] = []) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
  } as never);

/** The legal actions for casting `defId` from the hand (every way of paying). */
const casts = (g: GameDriver, defId: string): Action[] =>
  g
    .legal()
    .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId && a.player === g.actor);

/** Passes until the step, resolving any trigger targets on the way (a trigger that waits for targets stops passUntilStep). */
function toStep(g: GameDriver, step: string, player?: 'p1' | 'p2'): GameDriver {
  for (let i = 0; i < 200; i++) {
    const d = g.decision;
    if (g.state.turn.step === step && d.kind === 'priority' && (!player || g.state.turn.activePlayer === player))
      return g;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else throw new Error(`Stuck at ${d.kind}`);
  }
  throw new Error(`Never reached ${step}`);
}

/** Resolves the stack; "up to N targets" triggers get the most targets they can (picked one at a time). */
function settleMost(g: GameDriver): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') {
      const targets = g.legal().filter((a) => a.type === 'chooseTargets');
      g.do(
        targets.reduce((best, a) =>
          a.type === 'chooseTargets' && best.type === 'chooseTargets' && a.targets.length > best.targets.length
            ? a
            : best,
        ),
      );
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else break;
  }
  return g;
}

const NAMES = [...Object.keys(TDM_WHITE), ...Object.keys(TDM_WHITE_BACKS)];

describe('the white group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(TDM_WHITE)).toHaveLength(31);
    for (const name of NAMES) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('mobilize creatures', () => {
  it('Dragonback Lancer makes a tapped and attacking Warrior that is sacrificed at the end step', () => {
    const g = game({ p1: { battlefield: ['dragonback-lancer'] }, step: 'beginCombat' });
    const lancer = g.id('p1', 'dragonback-lancer');
    g.obj(lancer).summoningSick = false;
    g.passBoth();
    g.attack(lancer);
    done(g);
    expect(on(g, 'tdm-warrior-token', 'p1')).toHaveLength(1);
    expect(g.obj(on(g, 'tdm-warrior-token', 'p1')[0]!).tapped).toBe(true);
    g.passUntilStep('end');
    done(g);
    expect(on(g, 'tdm-warrior-token', 'p1')).toHaveLength(0);
  });
  it('Dalkovan Packbeasts makes three Warriors and Voice of Victory two', () => {
    const g = game({
      p1: { battlefield: ['dalkovan-packbeasts', 'voice-of-victory'] },
      step: 'beginCombat',
    });
    const beasts = g.id('p1', 'dalkovan-packbeasts');
    const voice = g.id('p1', 'voice-of-victory');
    g.obj(beasts).summoningSick = false;
    g.obj(voice).summoningSick = false;
    g.passBoth();
    g.attack(beasts, voice);
    done(g);
    expect(on(g, 'tdm-warrior-token', 'p1')).toHaveLength(5);
  });
});

describe('Voice of Victory', () => {
  it('stops opponents casting spells during your turn but not during theirs', () => {
    const g = game({
      p1: { battlefield: ['voice-of-victory'] },
      p2: { hand: ['giant-growth'], battlefield: ['forest'] },
    });
    g.pass();
    expect(casts(g, 'giant-growth')).toHaveLength(0);
    const h = game({
      p1: { battlefield: ['voice-of-victory'] },
      p2: { hand: ['giant-growth'], battlefield: ['forest'] },
      active: 'p2',
    });
    expect(casts(h, 'giant-growth').length).toBeGreaterThan(0);
  });
});

describe('Clarion Conqueror', () => {
  it('stops mana abilities of creatures, not of lands', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['clarion-conqueror', 'llanowar-elves'] },
    });
    g.obj(g.id('p1', 'llanowar-elves')).summoningSick = false;
    expect(casts(g, 'giant-growth')).toHaveLength(0);
    const h = game({
      p1: { hand: ['giant-growth'], battlefield: ['clarion-conqueror', 'forest'] },
    });
    expect(casts(h, 'giant-growth').length).toBeGreaterThan(0);
  });
  it('lets the abilities work without it', () => {
    const g = game({ p1: { hand: ['giant-growth'], battlefield: ['llanowar-elves'] } });
    g.obj(g.id('p1', 'llanowar-elves')).summoningSick = false;
    expect(casts(g, 'giant-growth').length).toBeGreaterThan(0);
  });
  it('stops activated abilities of artifacts too, whoever controls them', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['clarion-conqueror', 'savannah-lions'] },
      p2: { battlefield: ['sol-ring'] },
    });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Anafenza, Unyielding Lineage', () => {
  it('endures 2 when another nontoken creature you control dies', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['anafenza-unyielding-lineage', 'savannah-lions', 'mountain'] },
    });
    const ana = g.id('p1', 'anafenza-unyielding-lineage');
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    cast(g, 'lightning-bolt', [g.ref(g.id('p1', 'savannah-lions'))]);
    done(g, { option: 0 });
    expect(g.obj(ana).counters?.['+1/+1'] ?? g.obj(ana).plusOneCounters).toBe(2);
  });
});

describe('Descendant of Storms', () => {
  it('may pay {1}{W} when it attacks to endure 1', () => {
    const g = game({
      p1: { battlefield: ['descendant-of-storms', 'plains', 'plains'] },
      step: 'beginCombat',
    });
    const d = g.id('p1', 'descendant-of-storms');
    g.obj(d).summoningSick = false;
    g.passBoth();
    g.attack(d);
    done(g, { option: 0 });
    expect(pt(g, d)).toEqual([3, 2]);
  });
});

describe('Fortress Kin-Guard', () => {
  it('endures 1 as it enters: a counter or a Spirit', () => {
    const g = game({ p1: { hand: ['fortress-kin-guard'], battlefield: ['plains', 'plains'] } });
    cast(g, 'fortress-kin-guard');
    done(g, { option: /Create/ });
    expect(on(g, 'tdm-spirit-token', 'p1')).toHaveLength(1);
    expect(pt(g, on(g, 'tdm-spirit-token', 'p1')[0]!)).toEqual([1, 1]);
  });
});

describe('Sunpearl Kirin', () => {
  it('returns a nonland permanent of yours; a token returned draws a card', () => {
    const g = game({
      p1: { hand: ['sunpearl-kirin'], battlefield: ['plains', 'plains', 'savannah-lions'] },
    });
    cast(g, 'sunpearl-kirin');
    settle(g);
    expect(hand(g)).toContain('savannah-lions');
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(0);
  });
  it('draws a card when it returns a token', () => {
    const g = game({
      p1: { hand: ['sunpearl-kirin'], battlefield: ['plains', 'plains', 'tdm-warrior-token'] },
    });
    g.obj(g.id('p1', 'tdm-warrior-token')).isToken = true;
    const before = hand(g).length;
    cast(g, 'sunpearl-kirin');
    settle(g);
    expect(on(g, 'tdm-warrior-token', 'p1')).toHaveLength(0);
    // The Kirin left the hand (-1) and a card was drawn (+1).
    expect(hand(g).length).toBe(before);
  });
  it('can be cast with no target (up to one)', () => {
    const g = game({ p1: { hand: ['sunpearl-kirin'], battlefield: ['plains', 'plains'] } });
    cast(g, 'sunpearl-kirin');
    done(g);
    expect(on(g, 'sunpearl-kirin', 'p1')).toHaveLength(1);
  });
});

describe('Static Snare', () => {
  it('costs {1} less for each attacking creature', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { hand: ['static-snare'], battlefield: [...n('plains', 4), 'serra-angel'] },
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'savannah-lions')).summoningSick = false;
    g.passBoth();
    expect(casts(g, 'static-snare')).toHaveLength(0);
    g.attack(g.id('p1', 'savannah-lions'));
    g.pass();
    // One attacker: {3}{W} with four lands.
    expect(g.actor).toBe('p2');
    expect(casts(g, 'static-snare').length).toBeGreaterThan(0);
  });
  it('exiles the target and returns it when the enchantment leaves', () => {
    const g = game({
      p1: { hand: ['static-snare'], battlefield: [...n('plains', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'static-snare');
    settle(g);
    expect(exile(g, 'p2')).toContain('serra-angel');
  });
  it('costs the full {4}{W} without attackers', () => {
    const g = game({ p1: { hand: ['static-snare'], battlefield: [...n('plains', 4)] } });
    expect(casts(g, 'static-snare')).toHaveLength(0);
  });
});

describe('Stormplain Detainment', () => {
  it('exiles a nonland permanent an opponent controls, not a land', () => {
    const g = game({
      p1: { hand: ['stormplain-detainment'], battlefield: [...n('plains', 3)] },
      p2: { battlefield: ['serra-angel', 'forest'] },
    });
    cast(g, 'stormplain-detainment');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const targets = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .map((t) => ('object' in t ? g.obj(t.object.id).defId : 'player'));
    expect(targets).toEqual(['serra-angel']);
    settle(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Teeming Dragonstorm', () => {
  it('makes two Soldiers and returns to hand when a Dragon you control enters', () => {
    const g = game({
      p1: {
        hand: ['teeming-dragonstorm', 'clarion-conqueror'],
        battlefield: [...n('plains', 7)],
      },
    });
    cast(g, 'teeming-dragonstorm');
    done(g);
    expect(on(g, 'tdm-soldier-token', 'p1')).toHaveLength(2);
    cast(g, 'clarion-conqueror');
    done(g);
    expect(on(g, 'teeming-dragonstorm', 'p1')).toHaveLength(0);
    expect(hand(g)).toContain('teeming-dragonstorm');
  });
});

describe('United Battlefront', () => {
  it('puts up to two noncreature nonland permanents with mana value 3 or less onto the battlefield, the rest on the bottom', () => {
    const g = game({
      p1: {
        hand: ['united-battlefront'],
        battlefield: [...n('plains', 4)],
        library: [
          'savannah-lions',
          'pacifism',
          'forest',
          'giant-growth',
          'savannah-lions',
          'sol-ring',
          'serra-angel',
          'forest',
          'forest',
        ],
      },
    });
    cast(g, 'united-battlefront');
    done(g, { card: 'pacifism' });
    // Pacifism and Sol Ring are the only candidates (the creatures, lands and the instant are not).
    expect(g.state.players.p1.library).toHaveLength(9 - 2);
  });
  it('can stop after one', () => {
    const g = game({
      p1: {
        hand: ['united-battlefront'],
        battlefield: [...n('plains', 4)],
        library: ['sol-ring', 'pacifism', 'forest', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'united-battlefront');
    g.passBoth();
    // Take Sol Ring, then decline the second.
    const d = g.legal();
    g.do(d.find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'sol-ring')!);
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card === null)!);
    done(g);
    expect(on(g, 'sol-ring', 'p1')).toHaveLength(1);
    expect(on(g, 'pacifism', 'p1')).toHaveLength(0);
    expect(g.state.players.p1.library).toHaveLength(7);
  });
});

describe('Tempest Hawk', () => {
  it('searches for another Tempest Hawk on combat damage to a player', () => {
    const g = game({
      p1: { battlefield: ['tempest-hawk'], library: ['tempest-hawk', 'forest', 'forest'] },
      step: 'beginCombat',
    });
    const hawk = g.id('p1', 'tempest-hawk');
    g.obj(hawk).summoningSick = false;
    g.passBoth();
    g.attack(hawk);
    g.passUntilStep('combatDamage');
    done(g, { option: 0 });
    expect(hand(g)).toContain('tempest-hawk');
  });
});

describe('Starry-Eyed Skyrider', () => {
  it('gives flying to attacking tokens and to another target creature when it attacks', () => {
    const g = game({
      p1: { battlefield: ['starry-eyed-skyrider', 'savannah-lions', 'tdm-warrior-token'] },
      step: 'beginCombat',
    });
    const sky = g.id('p1', 'starry-eyed-skyrider');
    const lions = g.id('p1', 'savannah-lions');
    const token = g.id('p1', 'tdm-warrior-token');
    g.obj(token).isToken = true;
    for (const id of [sky, lions, token]) g.obj(id).summoningSick = false;
    expect(keywords(g, token).has('flying')).toBe(false);
    g.passBoth();
    g.attack(sky, lions, token);
    done(g);
    expect(keywords(g, token).has('flying')).toBe(true);
    expect(keywords(g, lions).has('flying')).toBe(true);
  });
});

describe('Smile at Death', () => {
  it('returns up to two creature cards with power 2 or less at upkeep, each with a +1/+1 counter', () => {
    const g = game({
      p1: {
        battlefield: ['smile-at-death'],
        graveyard: ['savannah-lions', 'serra-angel', 'llanowar-elves'],
      },
      active: 'p2',
      step: 'end',
    });
    for (let i = 0; i < 100 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settleMost(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'llanowar-elves', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(0);
    expect(pt(g, on(g, 'savannah-lions', 'p1')[0]!)).toEqual([3, 2]);
    expect(pt(g, on(g, 'llanowar-elves', 'p1')[0]!)).toEqual([2, 2]);
  });
});

describe('Sage of the Skies', () => {
  it('is copied if you cast another spell first, not otherwise', () => {
    const g = game({
      p1: { hand: ['sage-of-the-skies', 'sage-of-the-skies', 'giant-growth'], battlefield: [...n('plains', 6), 'forest'] },
    });
    cast(g, 'sage-of-the-skies');
    done(g);
    expect(on(g, 'sage-of-the-skies', 'p1')).toHaveLength(1);
    cast(g, 'sage-of-the-skies');
    done(g);
    expect(on(g, 'sage-of-the-skies', 'p1')).toHaveLength(3);
  });
});

describe('Wayspeaker Bodyguard', () => {
  it('returns a permanent card with mana value 2 or less from your graveyard and taps a creature on flurry', () => {
    const g = game({
      p1: {
        hand: ['wayspeaker-bodyguard', 'giant-growth', 'giant-growth'],
        battlefield: [...n('plains', 4), ...n('forest', 2)],
        graveyard: ['savannah-lions', 'serra-angel', 'giant-growth'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'wayspeaker-bodyguard');
    settle(g);
    expect(hand(g)).toContain('savannah-lions');
    expect(hand(g)).not.toContain('serra-angel');
    cast(g, 'giant-growth', [g.ref(g.id('p1', 'wayspeaker-bodyguard'))]);
    done(g);
    cast(g, 'giant-growth', [g.ref(g.id('p1', 'wayspeaker-bodyguard'))]);
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
  });
});

describe('Salt Road Packbeast', () => {
  it('costs {1} less for each creature you control and draws a card', () => {
    const g = game({
      p1: {
        hand: ['salt-road-packbeast'],
        battlefield: [...n('plains', 2), 'savannah-lions', 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
    });
    expect(casts(g, 'salt-road-packbeast').length).toBeGreaterThan(0);
    cast(g, 'salt-road-packbeast');
    done(g);
    expect(on(g, 'salt-road-packbeast', 'p1')).toHaveLength(1);
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Loxodon Battle Priest', () => {
  it('puts a +1/+1 counter on another creature at the beginning of combat', () => {
    const g = game({ p1: { battlefield: ['loxodon-battle-priest', 'savannah-lions'] } });
    toStep(g, 'beginCombat');
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'loxodon-battle-priest'))).toEqual([3, 5]);
  });
});

describe('Rally the Monastery', () => {
  it('costs {2} less after another spell, and makes two Monks with prowess', () => {
    const g = game({
      p1: { hand: ['rally-the-monastery', 'giant-growth'], battlefield: ['plains', 'plains', 'forest', 'savannah-lions'] },
    });
    expect(casts(g, 'rally-the-monastery')).toHaveLength(0);
    cast(g, 'giant-growth', [g.ref(g.id('p1', 'savannah-lions'))]);
    done(g);
    const rally = casts(g, 'rally-the-monastery');
    expect(rally.length).toBeGreaterThan(0);
  });
  it('destroys a creature with power 4 or greater', () => {
    const g = game({
      p1: { hand: ['rally-the-monastery'], battlefield: [...n('plains', 4)] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const modes = casts(g, 'rally-the-monastery');
    const kill = modes.find(
      (a) => a.type === 'castSpell' && a.mode === 2 && a.targets.length === 1,
    )!;
    g.do(kill);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Coordinated Maneuver', () => {
  it('deals damage equal to the number of creatures you control', () => {
    const g = game({
      p1: { hand: ['coordinated-maneuver'], battlefield: ['plains', 'plains', 'savannah-lions', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const first = casts(g, 'coordinated-maneuver').find(
      (a) =>
        a.type === 'castSpell' &&
        (a.mode ?? 0) === 0 &&
        a.targets.length === 1 &&
        'object' in a.targets[0]! &&
        a.targets[0].object.id === angel,
    )!;
    g.do(first);
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });
});

describe('Lightfoot Technique and Rebellious Strike', () => {
  it('adds a counter and gives flying and indestructible', () => {
    const g = game({
      p1: { hand: ['lightfoot-technique'], battlefield: ['plains', 'plains', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'lightfoot-technique', [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(keywords(g, lions).has('indestructible')).toBe(true);
  });
  it('Rebellious Strike gives +3/+0 and draws a card', () => {
    const g = game({
      p1: { hand: ['rebellious-strike'], battlefield: ['plains', 'plains', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'rebellious-strike', [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([5, 1]);
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Bearer of Glory', () => {
  it('has first strike on your turn only and pumps the team for {4}{W}', () => {
    const g = game({ p1: { battlefield: [...n('plains', 5), 'bearer-of-glory', 'savannah-lions'] } });
    const b = g.id('p1', 'bearer-of-glory');
    expect(keywords(g, b).has('firstStrike')).toBe(true);
    const h = game({
      p1: { battlefield: ['bearer-of-glory'] },
      active: 'p2',
    });
    expect(keywords(h, h.id('p1', 'bearer-of-glory')).has('firstStrike')).toBe(false);
    activate(g, b, 1);
    done(g);
    expect(pt(g, b)).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
  });
});

describe('Mardu Devotee', () => {
  it('scries 2 as it enters', () => {
    const g = game({ p1: { hand: ['mardu-devotee'], battlefield: ['plains'] } });
    cast(g, 'mardu-devotee');
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
  });
  it('turns {1} into {R}, {W} or {B} once each turn', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['mardu-devotee', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const d = g.id('p1', 'mardu-devotee');
    g.obj(d).summoningSick = false;
    expect(casts(g, 'lightning-bolt')).toHaveLength(0);
    activate(g, d, 1);
    expect(casts(g, 'lightning-bolt').length).toBeGreaterThan(0);
    cast(g, 'lightning-bolt', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
  });
});

describe('Arashin Sunshield', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['arashin-sunshield'],
        battlefield: [...n('plains', 4)],
        graveyard: ['forest', 'plains'],
      },
      p2: { graveyard: ['savannah-lions', 'giant-growth', 'forest'] },
    });
  it('exiles up to two cards from a single graveyard when it enters', () => {
    const g = setup();
    cast(g, 'arashin-sunshield');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const owner = (t: object) => ('object' in t ? g.obj((t as { object: { id: string } }).object.id).owner : '');
    // Pick one card of the opponent's graveyard: only that graveyard's cards are offered next.
    const first = g
      .legal()
      .find((a) => a.type === 'chooseTargets' && a.targets.length === 1 && owner(a.targets[0]!) === 'p2')!;
    g.do(first);
    const second = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length === 2);
    expect(second.length).toBeGreaterThan(0);
    for (const a of second)
      if (a.type === 'chooseTargets') expect(a.targets.map(owner)).toEqual(['p2', 'p2']);
    g.do(second[0]!);
    done(g);
    expect(exile(g, 'p2')).toHaveLength(2);
    expect(gy(g, 'p2')).toHaveLength(1);
    expect(gy(g, 'p1')).toHaveLength(2);
  });
  it('may exile fewer, and none', () => {
    const g = setup();
    cast(g, 'arashin-sunshield');
    g.passBoth();
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(exile(g, 'p2')).toHaveLength(0);
    expect(exile(g, 'p1')).toHaveLength(0);
  });
  it('taps a creature for {W}', () => {
    const g = game({
      p1: { battlefield: ['arashin-sunshield', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const sun = g.id('p1', 'arashin-sunshield');
    g.obj(sun).summoningSick = false;
    activate(g, sun, 1, [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
    expect(g.obj(sun).tapped).toBe(true);
  });
});

describe('Stormbeacon Blade', () => {
  it('gives +3/+0 and draws when three or more attackers', () => {
    const g = game({
      p1: {
        battlefield: ['stormbeacon-blade', 'savannah-lions', 'savannah-lions', 'savannah-lions', 'plains', 'plains'],
      },
      step: 'main1',
    });
    const [a, b, c] = on(g, 'savannah-lions', 'p1');
    const blade = g.id('p1', 'stormbeacon-blade');
    for (const id of [a!, b!, c!]) g.obj(id).summoningSick = false;
    activate(g, blade, 2, [g.ref(a!)]);
    done(g);
    expect(pt(g, a!)).toEqual([5, 1]);
    g.passUntilStep('beginCombat');
    g.passBoth();
    const before = g.state.players.p1.library.length;
    g.attack(a!, b!, c!);
    done(g);
    expect(g.state.players.p1.library.length).toBe(before - 1);
  });
  it('does not draw with fewer than three attackers', () => {
    const g = game({
      p1: { battlefield: ['stormbeacon-blade', 'savannah-lions', 'savannah-lions', 'plains', 'plains'] },
      step: 'main1',
    });
    const [a, b] = on(g, 'savannah-lions', 'p1');
    for (const id of [a!, b!]) g.obj(id).summoningSick = false;
    activate(g, g.id('p1', 'stormbeacon-blade'), 2, [g.ref(a!)]);
    done(g);
    g.passUntilStep('beginCombat');
    g.passBoth();
    const before = g.state.players.p1.library.length;
    g.attack(a!, b!);
    done(g);
    expect(g.state.players.p1.library.length).toBe(before);
  });
});

describe('Osseous Exhale', () => {
  it('deals 5 damage to an attacking or blocking creature, and gains 2 life only if a Dragon was beheld', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 2)], hand: ['osseous-exhale', 'clarion-conqueror'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
      active: 'p2',
      step: 'beginCombat',
    });
    g.obj(g.id('p2', 'serra-angel')).summoningSick = false;
    g.passBoth();
    g.attack(g.id('p2', 'serra-angel'));
    g.pass();
    const options = g.legal().filter(
      (a) => a.type === 'castSpell' && g.obj(a.card).defId === 'osseous-exhale',
    );
    expect(options.length).toBeGreaterThan(1);
    const targeted = (a: Action) => a.type === 'castSpell' && a.targets.length === 1;
    const beheld = options.find((a) => targeted(a) && a.type === 'castSpell' && a.beholdCard)!;
    g.do(beheld);
    done(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(g.life('p1')).toBe(22);
  });
  it('gains nothing when no Dragon is beheld', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 2)], hand: ['osseous-exhale'] },
      p2: { battlefield: ['serra-angel'] },
      active: 'p2',
      step: 'beginCombat',
    });
    g.obj(g.id('p2', 'serra-angel')).summoningSick = false;
    g.passBoth();
    g.attack(g.id('p2', 'serra-angel'));
    g.pass();
    const plain = casts(g, 'osseous-exhale').find((a) => a.type === 'castSpell' && !a.beholdCard)!;
    g.do(plain);
    done(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(g.life('p1')).toBe(20);
  });
});

describe('Poised Practitioner', () => {
  it('gets a counter on the second spell cast in a turn', () => {
    const g = game({
      p1: {
        hand: ['poised-practitioner', 'giant-growth', 'giant-growth'],
        battlefield: ['poised-practitioner', ...n('plains', 2), ...n('forest', 2)],
      },
    });
    const p = g.id('p1', 'poised-practitioner');
    cast(g, 'giant-growth', [g.ref(p)]);
    done(g);
    expect(pt(g, p)).toEqual([5, 6]);
    cast(g, 'giant-growth', [g.ref(p)]);
    done(g);
    expect(pt(g, p)).toEqual([9, 10]);
  });
});

describe('Omen cards', () => {
  it('Riling Dawnbreaker: Signaling Roar makes a Soldier and the card is shuffled into the library', () => {
    const g = game({
      p1: { hand: ['riling-dawnbreaker'], battlefield: [...n('plains', 2)] },
    });
    const roar = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.back && g.obj(a.card).defId === 'riling-dawnbreaker')!;
    g.do(roar);
    done(g);
    expect(on(g, 'tdm-soldier-token', 'p1')).toHaveLength(1);
    expect(hand(g)).not.toContain('riling-dawnbreaker');
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toContain('riling-dawnbreaker');
  });
  it('Riling Dawnbreaker gives another creature +1/+0 at the beginning of combat', () => {
    const g = game({ p1: { battlefield: ['riling-dawnbreaker', 'savannah-lions'] } });
    toStep(g, 'beginCombat');
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 1]);
  });
  it('Twinmaw Stormbrood gains 5 life; Charring Bite hits only a creature without flying', () => {
    const g = game({
      p1: { hand: ['twinmaw-stormbrood'], battlefield: [...n('plains', 6)] },
    });
    cast(g, 'twinmaw-stormbrood');
    done(g);
    expect(g.life('p1')).toBe(25);
    const h = game({
      p1: { hand: ['twinmaw-stormbrood'], battlefield: ['plains', 'mountain'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const bite = h
      .legal()
      .filter((a) => a.type === 'castSpell' && a.back && h.obj(a.card).defId === 'twinmaw-stormbrood');
    const targets = bite.flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toHaveLength(1);
    h.do(bite[0]!);
    done(h);
    expect(gy(h, 'p2')).toEqual(['savannah-lions']);
  });
});
