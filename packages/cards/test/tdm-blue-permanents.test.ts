import { createEngine } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt } from './blb-helpers.ts';
import {
  activate,
  chars,
  combat,
  done,
  exile,
  gy,
  hand,
  keywords,
  library,
  nextTurn,
  stun,
  tappedLands,
  targeting,
  toStep,
} from './ecl-blue-helpers.ts';
import { choose, counters, tgt, untilOption } from './tdm-blue-helpers.ts';

// Tarkir: Dragonstorm 19b: the blue cards, permanents with abilities of their own.

describe('Ambling Stormshell', () => {
  it('has ward; attacks: three stun counters on it and draw three cards', () => {
    const g = combat(['ambling-stormshell'], [], n('forest', 6));
    const shell = g.id('p1', 'ambling-stormshell');
    expect(keywords(g, shell).has('ward')).toBe(true);
    g.attack(shell);
    done(g);
    expect(g.obj(shell).counters?.stun).toBe(3);
    expect(hand(g)).toHaveLength(3);
  });

  it('whenever you cast a Turtle spell, untap it', () => {
    const g = game({
      p1: {
        hand: ['ambling-stormshell'],
        battlefield: [{ card: 'ambling-stormshell', tapped: true }, ...n('island', 5)],
      },
    });
    const first = g.id('p1', 'ambling-stormshell');
    cast(g, 'ambling-stormshell');
    done(g);
    expect(g.obj(first).tapped).toBe(false);
    expect(all(g, 'ambling-stormshell')).toHaveLength(2);
  });

  it('casting a spell that is not a Turtle does not untap it', () => {
    const g = game({
      p1: {
        hand: ['humbling-elder'],
        battlefield: [{ card: 'ambling-stormshell', tapped: true }, 'island'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'humbling-elder');
    done(g);
    expect(g.obj(g.id('p1', 'ambling-stormshell')).tapped).toBe(true);
  });
});

describe('Dragonologist', () => {
  it('enters: look at the top six, take an instant, sorcery or Dragon card, the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['dragonologist'],
        battlefield: n('island', 3),
        library: ['forest', 'forest', 'shock', 'firespitter-whelp', 'forest', 'forest', 'island'],
      },
    });
    cast(g, 'dragonologist');
    done(g, { pick: undefined });
    expect(hand(g)).toHaveLength(1);
    expect(['shock', 'firespitter-whelp']).toContain(hand(g)[0]);
    expect(library(g)).toHaveLength(6);
  });

  it('untapped Dragons you control have hexproof', () => {
    const g = game({
      p1: { battlefield: ['dragonologist', 'firespitter-whelp', 'savannah-lions'] },
    });
    const whelp = g.id('p1', 'firespitter-whelp');
    expect(keywords(g, whelp).has('hexproof')).toBe(true);
    expect(keywords(g, g.id('p1', 'savannah-lions')).has('hexproof')).toBe(false);
    g.obj(whelp).tapped = true;
    expect(keywords(g, whelp).has('hexproof')).toBe(false);
  });
});

describe('Dragonstorm Forecaster', () => {
  it('{2},{T}: search for a card named Dragonstorm Globe or Boulderborn Dragon, reveal it, put it into your hand', () => {
    const db = new Map(cardDb);
    for (const [id, name] of [
      ['dragonstorm-globe', 'Dragonstorm Globe'],
      ['boulderborn-dragon', 'Boulderborn Dragon'],
    ] as const)
      db.set(id, { ...cardDb.get('savannah-lions')!, id, name });
    const g = new GameDriver(
      createEngine(db),
      buildScenario(db, {
        p1: {
          battlefield: ['dragonstorm-forecaster', 'island', 'island'],
          library: ['forest', 'savannah-lions', 'boulderborn-dragon', 'forest'],
        },
      }),
    );
    const forecaster = g.id('p1', 'dragonstorm-forecaster');
    activate(g, forecaster, 0);
    done(g);
    const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card);
    if (pick) g.do(pick);
    done(g);
    expect(hand(g)).toEqual(['boulderborn-dragon']);
    expect(g.obj(forecaster).tapped).toBe(true);
  });
});

describe('Essence Anchor', () => {
  it('upkeep: surveil 1', () => {
    const g = game({ p1: { battlefield: ['essence-anchor'], library: ['shock', 'forest', 'forest'] } });
    nextTurn(g);
    const d = untilScry(g);
    expect(d).toBe(true);
  });

  it('{T}: a 2/2 black Zombie Druid, only on your turn and only if a card left your graveyard this turn', () => {
    const g = game({
      p1: {
        battlefield: ['essence-anchor', ...n('island', 4), 'savannah-lions'],
        graveyard: ['agent-of-kotis', 'savannah-lions'],
      },
    });
    const anchor = g.id('p1', 'essence-anchor');
    const canTap = () => g.legal().some((a) => a.type === 'activateAbility' && a.source === anchor);
    expect(canTap()).toBe(false);
    // Renew exiles Agent of Kotis from the graveyard: a card left your graveyard.
    activate(g, g.id('p1', 'agent-of-kotis', 'graveyard'), 0, [
      tgt(g, g.id('p1', 'savannah-lions')),
    ]);
    done(g);
    expect(canTap()).toBe(true);
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === anchor)!);
    done(g);
    const druids = all(g, 'tdm-zombie-druid-token');
    expect(druids).toHaveLength(1);
    expect(pt(g, druids[0]!)).toEqual([2, 2]);
    expect(cardDb.get('tdm-zombie-druid-token')!.colors).toEqual(['B']);
    expect(g.obj(anchor).tapped).toBe(true);
  });
});

/** Passes priority until a surveil decision is up. */
function untilScry(g: ReturnType<typeof game>): boolean {
  for (let i = 0; i < 100; i++) {
    if (g.legal().some((a) => a.type === 'scry')) return true;
    const d = g.decision;
    if (d.kind === 'priority') g.pass();
    else done(g);
  }
  return false;
}

describe('Highspire Bell-Ringer', () => {
  it('flying; the second spell you cast each turn costs {1} less', () => {
    const g = game({
      p1: {
        hand: ['unending-whisper', 'sibsig-appraiser', 'sibsig-appraiser'],
        battlefield: ['highspire-bell-ringer', ...n('island', 4)],
        library: n('forest', 6),
      },
    });
    expect(keywords(g, g.id('p1', 'highspire-bell-ringer')).has('flying')).toBe(true);
    cast(g, 'unending-whisper');
    done(g);
    expect(tappedLands(g)).toBe(1);
    cast(g, 'sibsig-appraiser'); // the second spell: {1}{U} instead of {2}{U}
    done(g);
    expect(tappedLands(g)).toBe(3);
    // The third spell costs the full {2}{U}: one Island is not enough.
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'sibsig-appraiser', 'hand')),
    ).toBe(false);
  });
});

describe('Naga Fleshcrafter', () => {
  it('may enter as a copy of any creature on the battlefield', () => {
    const g = game({
      p1: { hand: ['naga-fleshcrafter'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const copy = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p1', 'naga-fleshcrafter', 'hand') &&
          a.copyOf === g.id('p2', 'serra-angel'),
      );
    expect(copy).toBeDefined();
    g.do(copy!);
    done(g);
    const mine = g.state.battlefield.find((id) => g.obj(id).controller === 'p1' && chars(g, id).power === 4);
    expect(mine).toBeDefined();
    expect(keywords(g, mine!).has('flying')).toBe(true);
  });

  it('renew: a +1/+1 counter on target nonlegendary creature you control; each other creature you control becomes a copy of it until end of turn', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 3), 'serra-angel', 'savannah-lions', 'llanowar-elves'],
        graveyard: ['naga-fleshcrafter'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'naga-fleshcrafter', 'graveyard'), 0, [tgt(g, angel)]);
    done(g);
    expect(counters(g, angel)).toBe(1);
    expect(pt(g, angel)).toEqual([5, 5]);
    // The Lions is a Serra Angel until end of turn (its own counters stay; it has none).
    expect(pt(g, lions)).toEqual([4, 4]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(exile(g)).toEqual(['naga-fleshcrafter']);
    nextTurn(g);
    expect(pt(g, lions)).toEqual([2, 1]);
    expect(keywords(g, lions).has('flying')).toBe(false);
  });

  it('renew cannot target a legendary creature', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 3), 'taigam-master-opportunist'],
        graveyard: ['naga-fleshcrafter'],
      },
    });
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'naga-fleshcrafter', 'graveyard')),
    ).toBe(false);
  });
});

describe('Ringing Strike Mastery', () => {
  const setup = () =>
    game({
      p1: { hand: ['ringing-strike-mastery'], battlefield: ['island'] },
      p2: { battlefield: ['serra-angel', ...n('island', 5)] },
    });

  it('taps enchanted creature when it enters; it does not untap during its controller untap step', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'ringing-strike-mastery', [tgt(g, angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    nextTurn(g);
    nextTurn(g);
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('enchanted creature has "{5}: Untap this creature."', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'ringing-strike-mastery', [tgt(g, angel)]);
    done(g);
    nextTurn(g);
    expect(g.state.turn.activePlayer).toBe('p2');
    const untap = g.legal().find((a) => a.type === 'activateAbility' && a.source === angel);
    expect(untap).toBeDefined();
    g.do(untap!);
    done(g);
    expect(g.obj(angel).tapped).toBe(false);
    expect(tappedLands(g, 'p2')).toBe(5);
  });

  it('the ability goes away with the Aura', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'ringing-strike-mastery', [tgt(g, angel)]);
    done(g);
    const aura = g.id('p1', 'ringing-strike-mastery');
    g.state.battlefield = g.state.battlefield.filter((id) => id !== aura);
    g.obj(aura).zone = 'graveyard';
    g.state.players.p1.graveyard.push(aura);
    expect(g.legal('p2').some((a) => a.type === 'activateAbility' && a.source === angel)).toBe(
      false,
    );
  });
});

describe('Sibsig Appraiser', () => {
  it('enters: look at the top two cards; one into your hand, the other into your graveyard', () => {
    const g = game({
      p1: { hand: ['sibsig-appraiser'], battlefield: n('island', 3), library: ['shock', 'forest', 'forest'] },
    });
    cast(g, 'sibsig-appraiser');
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
    expect([...hand(g), ...gy(g)].sort()).toEqual(['forest', 'shock']);
  });
});

describe('Snowmelt Stag', () => {
  it('vigilance; base power and toughness 5/2 during your turn, 2/5 otherwise', () => {
    const g = game({ p1: { battlefield: ['snowmelt-stag'] } });
    const stag = g.id('p1', 'snowmelt-stag');
    expect(keywords(g, stag).has('vigilance')).toBe(true);
    expect(pt(g, stag)).toEqual([5, 2]);
    const h = game({ active: 'p2', p1: { battlefield: ['snowmelt-stag'] } });
    expect(pt(h, h.id('p1', 'snowmelt-stag'))).toEqual([2, 5]);
  });

  it('counters and pump effects still apply on top of the base 5/2', () => {
    const g = game({ p1: { battlefield: ['snowmelt-stag'] } });
    const stag = g.id('p1', 'snowmelt-stag');
    g.obj(stag).plusOneCounters = 2;
    expect(pt(g, stag)).toEqual([7, 4]);
  });

  it("{5}{U}{U}: can't be blocked this turn", () => {
    const g = game({
      p1: { battlefield: ['snowmelt-stag', ...n('island', 7)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const stag = g.id('p1', 'snowmelt-stag');
    expect(chars(g, stag).cantBeBlocked).toBeFalsy();
    activate(g, stag, 1);
    done(g);
    expect(tappedLands(g)).toBe(7);
    expect(chars(g, stag).cantBeBlocked).toBe(true);
    nextTurn(g);
    nextTurn(g);
    expect(chars(g, stag).cantBeBlocked).toBeFalsy();
  });
});

describe('Stillness in Motion', () => {
  it('upkeep: mill three; if your library is empty, exile it and put five cards from your graveyard on top in any order', () => {
    const g = game({
      p1: {
        battlefield: ['stillness-in-motion'],
        library: ['shock', 'savannah-lions', 'serra-angel'],
        graveyard: ['forest', 'island', 'plains'],
      },
    });
    nextTurn(g);
    untilOption(g);
    expect(g.state.players.p1.library).toHaveLength(0);
    // Five picks, the last one on top.
    choose(g, /Shock/);
    choose(g, /Savannah Lions/);
    choose(g, /Serra Angel/);
    choose(g, /Forest/);
    choose(g, /Island/);
    done(g);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'stillness-in-motion')).toBe(false);
    expect(exile(g)).toEqual(['stillness-in-motion']);
    expect(library(g)).toEqual(['island', 'forest', 'serra-angel', 'savannah-lions', 'shock']);
    expect(gy(g)).toEqual(['plains']);
  });

  it('upkeep: with cards left in the library it only mills', () => {
    const g = game({
      p1: { battlefield: ['stillness-in-motion'], library: n('forest', 6) },
    });
    nextTurn(g);
    // p1 draws on its own turn only; the upkeep mill happens on p1's turns.
    toStep(g, 'main1');
    nextTurn(g);
    expect(gy(g).length).toBeGreaterThanOrEqual(3);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'stillness-in-motion')).toBe(true);
  });
});

describe('Taigam, Master Opportunist', () => {
  it('flurry: copy your second spell each turn, then exile the original with four time counters and suspend', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['taigam-master-opportunist', 'mountain', 'mountain'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(18);
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    // The copy resolves (2 damage); the original was exiled with four time counters instead.
    expect(g.life('p2')).toBe(16);
    expect(exile(g)).toEqual(['shock']);
    const shock = g.state.players.p1.exile[0]!;
    expect(g.obj(shock).counters?.time).toBe(4);
  });
});

describe('Temur Devotee', () => {
  it('defender; {1}: add {G}, {U} or {R}, once each turn', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['temur-devotee', 'island', 'island'] },
    });
    expect(keywords(g, g.id('p1', 'temur-devotee')).has('defender')).toBe(true);
    expect(pt(g, g.id('p1', 'temur-devotee'))).toEqual([3, 3]);
    const devotee = g.id('p1', 'temur-devotee');
    const act = g.legal().find((a) => a.type === 'activateAbility' && a.source === devotee);
    expect(act).toBeDefined();
    g.do(act!);
    // The red mana now floats: Shock is castable with the other Island's... {1}: one Island paid.
    expect(g.state.players.p1.pool?.length).toBe(1);
    // Once each turn.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === devotee)).toBe(false);
  });
});

describe('Veteran Ice Climber', () => {
  it("vigilance, can't be blocked; attacks: up to one target player mills cards equal to its power", () => {
    const g = combat(['veteran-ice-climber'], ['serra-angel']);
    const climber = g.id('p1', 'veteran-ice-climber');
    const k = keywords(g, climber);
    expect(k.has('vigilance')).toBe(true);
    expect(chars(g, climber).cantBeBlocked).toBe(true);
    g.attack(climber);
    done(g, {
      pick: (legal) =>
        legal.find(
          (a) => a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
        ),
    });
    expect(gy(g, 'p2')).toHaveLength(1);
    expect(g.obj(climber).tapped).toBe(false);
  });

  it('may choose no target', () => {
    const g = combat(['veteran-ice-climber']);
    g.attack(g.id('p1', 'veteran-ice-climber'));
    done(g, { pick: (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0) });
    expect(gy(g, 'p1')).toHaveLength(0);
    expect(gy(g, 'p2')).toHaveLength(0);
  });
});

describe('Wingblade Disciple', () => {
  it('flying; flurry: a 1/1 white Bird creature token with flying', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['wingblade-disciple', 'mountain', 'mountain'],
      },
    });
    expect(keywords(g, g.id('p1', 'wingblade-disciple')).has('flying')).toBe(true);
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(all(g, 'tdm-bird-token')).toHaveLength(0);
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    const birds = all(g, 'tdm-bird-token');
    expect(birds).toHaveLength(1);
    expect(pt(g, birds[0]!)).toEqual([1, 1]);
    expect(keywords(g, birds[0]!).has('flying')).toBe(true);
  });
});

describe('Whirlwing Stormbrood', () => {
  it('flash and flying; sorcery spells can be cast at instant speed', () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: ['urenis-rebuff'],
        battlefield: ['whirlwing-stormbrood', 'island', 'island'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'urenis-rebuff', 'hand')),
    ).toBe(true);
  });

  it('without it, a sorcery cannot be cast on the opponent turn', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['urenis-rebuff'], battlefield: ['island', 'island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.pass();
    expect(
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'urenis-rebuff', 'hand')),
    ).toBe(false);
  });

  it('Omen Dynamic Soar: put three +1/+1 counters on target creature you control', () => {
    const g = game({
      p1: {
        hand: ['whirlwing-stormbrood'],
        battlefield: [...n('forest', 2), 'island', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'whirlwing-stormbrood', [tgt(g, lions)], { back: true });
    done(g);
    expect(counters(g, lions)).toBe(3);
    expect(g.zoneOf(g.id('p1', 'whirlwing-stormbrood', 'library'))).toBe('library');
  });
});

void [targeting, stun, keywords];
