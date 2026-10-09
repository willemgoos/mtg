import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame, redactFor, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { ECL_BLACK } from '../src/ecl/black.ts';

// Lorwyn Eclipsed 18b: the black cards.

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/ecl-groups.json', import.meta.url), 'utf8'),
);
const BLACK_CARDS = Object.entries(groups)
  .filter(([, g]) => g === 'black')
  .map(([name]) => name);

type Who = 'p1' | 'p2';
const hand = (g: GameDriver, p: Who = 'p1') => g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: Who = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: Who = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;
const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const onField = (g: GameDriver, defId: string, p: Who = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === p);
const putMinus = (g: GameDriver, id: string, k: number) => {
  g.obj(id).counters = { ...g.obj(id).counters, '-1/-1': k };
};

/** Answers a chooseObject (blight) decision with this creature, or declines. */
function choose(g: GameDriver, card: string | null): GameDriver {
  expect(g.decision.kind).toBe('chooseObject');
  return g.do({ type: 'chooseCard', player: g.actor, card });
}

/** Resolves the stack (first legal target for each trigger) and stops at any other decision. */
const resolve = (g: GameDriver, pick?: Parameters<typeof settle>[1]) => settle(g, pick);

/** All castSpell actions for a card in hand. */
const casts = (
  g: GameDriver,
  card: string,
  p: Who = 'p1',
): Extract<Action, { type: 'castSpell' }>[] =>
  g
    .legal(p)
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && a.card === card,
    );

function passTo(g: GameDriver, step: string, player: Who): void {
  for (let i = 0; i < 80; i++) {
    const t = g.state.turn;
    if (t.step === step && t.activePlayer === player && g.decision.kind === 'priority') return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'chooseTriggerTargets') resolve(g);
    else throw new Error(`stuck at ${d.kind}`);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority until the declare attackers decision, then attacks with these creatures. */
function attackWith(g: GameDriver, ...ids: string[]): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  g.attack(...ids);
}

const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  extra: object = {},
  targets: unknown[] = [],
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

describe('Lorwyn Eclipsed black: registry', () => {
  it('has behaviour for all 37 cards, and each exists in the pool', () => {
    expect(BLACK_CARDS).toHaveLength(37);
    for (const name of BLACK_CARDS) {
      expect(ECL_BLACK[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
    expect(Object.keys(ECL_BLACK)).toHaveLength(37);
  });
});

describe('Barbed Bloodletter', () => {
  it('flashes in, attaches to a creature you control, which gains wither until end of turn; +1/+2', () => {
    const g = game({
      p1: { hand: ['barbed-bloodletter'], battlefield: ['savannah-lions', ...n('swamp', 2)] },
    });
    expect(keywords(g, g.id('p1', 'barbed-bloodletter', 'hand')).has('flash')).toBe(true);
    cast(g, 'barbed-bloodletter');
    resolve(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(g.id('p1', 'barbed-bloodletter')).attachedTo).toBe(lions);
    expect(pt(g, lions)).toEqual([3, 3]);
    expect(keywords(g, lions).has('wither')).toBe(true);
  });
});

describe('Bile-Vial Boggart', () => {
  it('puts a -1/-1 counter on up to one target creature when it dies', () => {
    const g = game({
      p1: { battlefield: ['bile-vial-boggart'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.obj(g.id('p1', 'bile-vial-boggart')).damage = 1;
    g.pass();
    resolve(g);
    expect(minus(g, g.id('p2', 'serra-angel'))).toBe(1);
  });
});

describe('Bitterbloom Bearer', () => {
  it('has flash and flying; each upkeep you lose 1 life and make a 1/1 Faerie with flying', () => {
    const g = game({ p2: { battlefield: ['bitterbloom-bearer'] }, step: 'end' });
    const b = g.id('p2', 'bitterbloom-bearer');
    expect(keywords(g, b).has('flash')).toBe(true);
    expect(keywords(g, b).has('flying')).toBe(true);
    passTo(g, 'upkeep', 'p2');
    resolve(g);
    expect(g.life('p2')).toBe(19);
    const faerie = g.state.battlefield.filter((id) => g.obj(id).isToken);
    expect(faerie).toHaveLength(1);
    expect(pt(g, faerie[0]!)).toEqual([1, 1]);
    expect(keywords(g, faerie[0]!).has('flying')).toBe(true);
  });
});

describe('Blighted Blackthorn', () => {
  it('may blight 2 on enter: draw a card and lose 1 life', () => {
    const g = game({
      p1: { hand: ['blighted-blackthorn'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
    });
    cast(g, 'blighted-blackthorn');
    resolve(g);
    const t = g.id('p1', 'blighted-blackthorn');
    choose(g, t);
    resolve(g);
    expect(minus(g, t)).toBe(2);
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
  });

  it('declining the blight does nothing', () => {
    const g = game({ p1: { hand: ['blighted-blackthorn'], battlefield: n('swamp', 5) } });
    cast(g, 'blighted-blackthorn');
    resolve(g);
    choose(g, null);
    resolve(g);
    expect(hand(g)).toHaveLength(0);
    expect(g.life('p1')).toBe(20);
  });

  it('also triggers when it attacks', () => {
    const g = game({ p1: { battlefield: ['blighted-blackthorn'] } });
    const t = g.id('p1', 'blighted-blackthorn');
    g.obj(t).summoningSick = false;
    attackWith(g, t);
    resolve(g);
    choose(g, t);
    resolve(g);
    expect(minus(g, t)).toBe(2);
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Blight Rot and Darkness Descends', () => {
  it('Blight Rot puts four -1/-1 counters on target creature', () => {
    const g = game({
      p1: { hand: ['blight-rot'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'blight-rot', [g.ref(angel)]);
    resolve(g);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });

  it('Darkness Descends puts two -1/-1 counters on each creature', () => {
    const g = game({
      p1: {
        hand: ['darkness-descends'],
        battlefield: [...n('swamp', 4), 'serra-angel', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    cast(g, 'darkness-descends');
    resolve(g);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(2);
    expect(minus(g, g.id('p2', 'serra-angel'))).toBe(2);
    expect(gy(g)).toContain('savannah-lions');
    expect(gy(g, 'p2')).toContain('llanowar-elves');
  });
});

describe('Bloodline Bidding', () => {
  it('has convoke; returns every creature card of the chosen type from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['bloodline-bidding'],
        battlefield: n('swamp', 8),
        graveyard: ['llanowar-elves', 'scarblade-scout', 'savannah-lions', 'serra-angel'],
      },
    });
    cast(g, 'bloodline-bidding');
    resolve(g);
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    const i = d.options.findIndex((o) => o.label === 'Elf');
    g.do({ type: 'chooseOption', player: 'p1', index: i });
    resolve(g);
    expect(onField(g, 'llanowar-elves')).toHaveLength(1);
    expect(onField(g, 'scarblade-scout')).toHaveLength(1);
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions', 'serra-angel']));
    expect(gy(g)).toContain('bloodline-bidding');
  });

  it('creatures can be tapped to help pay (convoke)', () => {
    const cheap = game({
      p1: {
        hand: ['bloodline-bidding'],
        battlefield: [
          ...n('swamp', 3),
          'llanowar-elves',
          'savannah-lions',
          'serra-angel',
          'serra-angel',
          'serra-angel',
        ],
      },
    });
    // {6}{B}{B} = 8: three swamps and five creatures.
    expect(casts(cheap, cheap.id('p1', 'bloodline-bidding', 'hand')).length).toBeGreaterThan(0);
    const short = game({
      p1: {
        hand: ['bloodline-bidding'],
        battlefield: [...n('swamp', 3), 'llanowar-elves', 'savannah-lions'],
      },
    });
    expect(casts(short, short.id('p1', 'bloodline-bidding', 'hand'))).toHaveLength(0);
  });
});

describe('Boggart Mischief', () => {
  it('may blight 1 on enter to make two Goblin tokens; whenever a Goblin you control dies, drain 1', () => {
    const g = game({
      p1: { hand: ['boggart-mischief'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });
    cast(g, 'boggart-mischief');
    resolve(g);
    choose(g, g.id('p1', 'savannah-lions'));
    resolve(g);
    const goblins = g.state.battlefield.filter((id) => g.obj(id).isToken);
    expect(goblins).toHaveLength(2);
    expect(pt(g, goblins[0]!)).toEqual([1, 1]);
    // A Goblin dies: each opponent loses 1 life and you gain 1.
    g.obj(goblins[0]!).damage = 1;
    g.pass();
    resolve(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('a non-Goblin dying does not trigger it', () => {
    const g = game({ p1: { battlefield: ['boggart-mischief', 'savannah-lions'] } });
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    g.pass();
    resolve(g);
    expect(g.life('p2')).toBe(20);
  });

  it('a changeling that dies counts as a Goblin', () => {
    const g = game({ p1: { battlefield: ['boggart-mischief', 'graveshifter'] } });
    g.obj(g.id('p1', 'graveshifter')).damage = 2;
    g.pass();
    resolve(g);
    expect(g.life('p2')).toBe(19);
  });
});

describe('Boggart Prankster', () => {
  it('gives an attacking Goblin you control +1/+0 whenever you attack', () => {
    const g = game({ p1: { battlefield: ['boggart-prankster', 'bile-vial-boggart'] } });
    const gob = g.id('p1', 'bile-vial-boggart');
    g.obj(gob).summoningSick = false;
    attackWith(g, gob);
    resolve(g);
    expect(pt(g, gob)).toEqual([2, 1]);
  });
});

describe("Bogslither's Embrace", () => {
  it('exiles target creature, blighting a creature of yours', () => {
    const g = game({
      p1: { hand: ['bogslithers-embrace'], battlefield: [...n('swamp', 2), 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const a = casts(g, g.id('p1', 'bogslithers-embrace', 'hand')).find((x) => x.blight)!;
    g.do({ ...a, targets: [g.ref(angel)] });
    resolve(g);
    expect(exile(g, 'p2')).toContain('serra-angel');
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
  });

  it('or pay {3} more instead', () => {
    const g = game({
      p1: { hand: ['bogslithers-embrace'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'bogslithers-embrace', [g.ref(angel)]);
    resolve(g);
    expect(exile(g, 'p2')).toContain('serra-angel');
  });
});

describe('Champion of the Weird', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['champion-of-the-weird'],
        battlefield: [...n('swamp', 4), 'bile-vial-boggart'],
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('exiles a Goblin you control as an additional cost and returns it when Champion leaves', () => {
    const g = setup();
    const champ = g.id('p1', 'champion-of-the-weird', 'hand');
    const a = casts(g, champ).find((x) => x.beholdCard === g.id('p1', 'bile-vial-boggart'));
    expect(a).toBeDefined();
    g.do(a!);
    resolve(g);
    expect(exile(g)).toContain('bile-vial-boggart');
    const c = g.id('p1', 'champion-of-the-weird');
    expect(pt(g, c)).toEqual([5, 5]);
    // It leaves: the exiled card returns to its owner's hand.
    g.obj(c).damage = 5;
    g.pass();
    resolve(g);
    expect(hand(g)).toContain('bile-vial-boggart');
  });

  it('can also exile a Goblin card from your hand', () => {
    const g = game({
      p1: { hand: ['champion-of-the-weird', 'bile-vial-boggart'], battlefield: n('swamp', 4) },
    });
    const a = casts(g, g.id('p1', 'champion-of-the-weird', 'hand'))[0]!;
    expect(a.beholdCard).toBe(g.id('p1', 'bile-vial-boggart', 'hand'));
  });

  it('Pay 1 life, Blight 2: target opponent blights 2 (sorcery speed)', () => {
    const g = game({
      p1: { battlefield: ['champion-of-the-weird'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const c = g.id('p1', 'champion-of-the-weird');
    activate(g, c, 0, { blight: c }, [{ player: 'p2' }]);
    expect(g.life('p1')).toBe(19);
    expect(minus(g, c)).toBe(2);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    expect(g.actor).toBe('p2');
    choose(g, g.id('p2', 'serra-angel'));
    resolve(g);
    expect(minus(g, g.id('p2', 'serra-angel'))).toBe(2);
  });
});

describe('Creakwood Safewright', () => {
  it('is a 5/5 that enters with three -1/-1 counters, and removes one at your end step with an Elf card in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['creakwood-safewright'],
        battlefield: n('swamp', 2),
        graveyard: ['llanowar-elves'],
      },
    });
    cast(g, 'creakwood-safewright');
    resolve(g);
    const s = g.id('p1', 'creakwood-safewright');
    expect(minus(g, s)).toBe(3);
    expect(pt(g, s)).toEqual([2, 2]);
    passTo(g, 'end', 'p1');
    resolve(g);
    expect(minus(g, s)).toBe(2);
  });

  it('does nothing without an Elf card in your graveyard', () => {
    const g = game({
      p1: { battlefield: ['creakwood-safewright'], graveyard: ['savannah-lions'] },
    });
    const s = g.id('p1', 'creakwood-safewright');
    putMinus(g, s, 3);
    passTo(g, 'end', 'p1');
    resolve(g);
    expect(minus(g, s)).toBe(3);
  });
});

describe('Dawnhand Dissident', () => {
  it('{T}, Blight 1: Surveil 1', () => {
    const g = game({ p1: { battlefield: ['dawnhand-dissident', 'serra-angel'] } });
    const d = g.id('p1', 'dawnhand-dissident');
    g.obj(d).summoningSick = false;
    activate(g, d, 0, { blight: g.id('p1', 'serra-angel') });
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
  });

  it('{T}, Blight 2: exile target card from a graveyard', () => {
    const g = game({
      p1: { battlefield: ['dawnhand-dissident', 'serra-angel'] },
      p2: { graveyard: ['savannah-lions'] },
    });
    const d = g.id('p1', 'dawnhand-dissident');
    g.obj(d).summoningSick = false;
    const target = g.id('p2', 'savannah-lions', 'graveyard');
    activate(g, d, 1, { blight: g.id('p1', 'serra-angel') }, [g.ref(target)]);
    resolve(g);
    expect(exile(g, 'p2')).toContain('savannah-lions');
  });

  it('lets you cast your creature cards exiled with it by removing three counters from your creatures', () => {
    const g = game({
      p1: {
        battlefield: ['dawnhand-dissident', 'serra-angel', 'plains'],
        graveyard: ['savannah-lions'],
      },
    });
    const d = g.id('p1', 'dawnhand-dissident');
    g.obj(d).summoningSick = false;
    const target = g.id('p1', 'savannah-lions', 'graveyard');
    const angel = g.id('p1', 'serra-angel');
    activate(g, d, 1, { blight: angel }, [g.ref(target)]);
    resolve(g);
    expect(minus(g, angel)).toBe(2);
    const lions = g.state.players.p1.exile[0]!;
    const castLions = () => g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === lions);
    // Two counters are not enough.
    expect(castLions()).toHaveLength(0);
    putMinus(g, angel, 3);
    expect(castLions().length).toBeGreaterThan(0);
    g.do(castLions()[0]!);
    resolve(g);
    expect(onField(g, 'savannah-lions')).toHaveLength(1);
    expect(minus(g, angel)).toBe(0);
  });
});

describe('Dawnhand Eulogist', () => {
  it('mills three, then drains 2 if an Elf card is in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['dawnhand-eulogist'],
        battlefield: n('swamp', 4),
        library: ['llanowar-elves', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'dawnhand-eulogist');
    resolve(g);
    expect(g.state.players.p1.graveyard).toHaveLength(3);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('does not drain without an Elf card', () => {
    const g = game({
      p1: { hand: ['dawnhand-eulogist'], battlefield: n('swamp', 4) },
    });
    cast(g, 'dawnhand-eulogist');
    resolve(g);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Dose of Dawnglow', () => {
  it('reanimates a creature; at instant speed outside your main phase you then blight 2', () => {
    const g = game({
      p1: {
        hand: ['dose-of-dawnglow'],
        battlefield: [...n('swamp', 5), 'savannah-lions'],
        graveyard: ['serra-angel'],
      },
      step: 'upkeep',
    });
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    cast(g, 'dose-of-dawnglow', [g.ref(angel)]);
    resolve(g);
    choose(g, g.id('p1', 'serra-angel'));
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(2);
  });

  it('in your main phase there is no blight', () => {
    const g = game({
      p1: {
        hand: ['dose-of-dawnglow'],
        battlefield: [...n('swamp', 5)],
        graveyard: ['serra-angel'],
      },
    });
    cast(g, 'dose-of-dawnglow', [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]);
    resolve(g);
    expect(g.decision.kind).toBe('priority');
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(0);
  });
});

describe('Dream Seizer', () => {
  it('may blight 1 on enter: each opponent discards a card', () => {
    const g = game({
      p1: { hand: ['dream-seizer'], battlefield: n('swamp', 4) },
      p2: { hand: ['shock', 'savannah-lions'] },
    });
    cast(g, 'dream-seizer');
    resolve(g);
    choose(g, g.id('p1', 'dream-seizer'));
    resolve(g);
    expect(g.decision.kind).toBe('discard');
  });
});

describe('Gloom Ripper', () => {
  it('gives +X/+0 to your creature and -0/-X to an opponent creature, X counting Elves and Elf cards', () => {
    const g = game({
      p1: {
        hand: ['gloom-ripper'],
        battlefield: [...n('swamp', 5), 'llanowar-elves'],
        graveyard: ['scarblade-scout'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'gloom-ripper');
    resolve(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 2));
    // Elves: Llanowar Elves and Gloom Ripper itself, plus one Elf card in the graveyard: X = 3.
    const angel = g.id('p2', 'serra-angel');
    expect(pt(g, angel)).toEqual([4, 1]);
  });
});

describe('Gnarlbark Elm', () => {
  it('enters with two -1/-1 counters; removing two counters gives -2/-2 (sorcery speed)', () => {
    const g = game({
      p1: { hand: ['gnarlbark-elm'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'gnarlbark-elm');
    resolve(g);
    const e = g.id('p1', 'gnarlbark-elm');
    expect(minus(g, e)).toBe(2);
    expect(pt(g, e)).toEqual([1, 2]);
    g.obj(e).summoningSick = false;
    const angelRef = g.ref(g.id('p2', 'serra-angel'));
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === e &&
          a.targets.some((t) => 'object' in t && t.object.id === angelRef.object.id),
      )!;
    g.do(act);
    resolve(g);
    expect(minus(g, e)).toBe(0);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([2, 2]);
  });
});

describe('Graveshifter', () => {
  it('is a changeling and may return a creature card from your graveyard to your hand', () => {
    const g = game({
      p1: { hand: ['graveshifter'], battlefield: n('swamp', 4), graveyard: ['serra-angel'] },
    });
    cast(g, 'graveshifter');
    resolve(g);
    expect(hand(g)).toEqual(['serra-angel']);
  });
});

describe('Gutsplitter Gang', () => {
  it('at your first main phase you may blight 2; if you do not, you lose 3 life', () => {
    const lose = game({ step: 'upkeep', p1: { battlefield: ['gutsplitter-gang'] } });
    lose.passUntilStep('main1');
    resolve(lose);
    choose(lose, null);
    resolve(lose);
    expect(lose.life('p1')).toBe(17);

    const pay = game({ step: 'upkeep', p1: { battlefield: ['gutsplitter-gang'] } });
    pay.passUntilStep('main1');
    resolve(pay);
    const gang = pay.id('p1', 'gutsplitter-gang');
    choose(pay, gang);
    resolve(pay);
    expect(minus(pay, gang)).toBe(2);
    expect(pay.life('p1')).toBe(20);
  });
});

describe('Heirloom Auntie', () => {
  it('enters with two -1/-1 counters; another creature dying makes you surveil 1 and remove a counter', () => {
    const g = game({
      p1: { hand: ['heirloom-auntie'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });
    cast(g, 'heirloom-auntie');
    resolve(g);
    const a = g.id('p1', 'heirloom-auntie');
    expect(minus(g, a)).toBe(2);
    expect(pt(g, a)).toEqual([2, 2]);
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    g.pass();
    resolve(g);
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((x) => x.type === 'scry')!);
    resolve(g);
    expect(minus(g, a)).toBe(1);
  });
});

describe('Iron-Shield Elf', () => {
  it('discarding a card gives indestructible until end of turn and taps it', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['iron-shield-elf'] } });
    const e = g.id('p1', 'iron-shield-elf');
    activate(g, e, 0, { discard: g.id('p1', 'shock', 'hand') });
    resolve(g);
    expect(keywords(g, e).has('indestructible')).toBe(true);
    expect(g.obj(e).tapped).toBe(true);
  });
});

describe('Moonglove Extractor', () => {
  it('draws a card and loses 1 life when it attacks', () => {
    const g = game({ p1: { battlefield: ['moonglove-extractor'] } });
    const m = g.id('p1', 'moonglove-extractor');
    g.obj(m).summoningSick = false;
    attackWith(g, m);
    resolve(g);
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
  });
});

describe('Moonshadow', () => {
  it('is a 7/7 menace that enters with six -1/-1 counters; permanent cards into your graveyard remove one', () => {
    const g = game({ p1: { hand: ['moonshadow'], battlefield: ['swamp', 'savannah-lions'] } });
    cast(g, 'moonshadow');
    resolve(g);
    const m = g.id('p1', 'moonshadow');
    expect(minus(g, m)).toBe(6);
    expect(pt(g, m)).toEqual([1, 1]);
    expect(keywords(g, m).has('menace')).toBe(true);
    // A creature card dies: one counter comes off.
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    g.pass();
    resolve(g);
    expect(minus(g, m)).toBe(5);
  });

  it('one or more permanent cards milled together remove only one counter; an instant does not count', () => {
    const batch = game({
      p1: {
        hand: ['scarblade-scout'],
        battlefield: ['moonshadow', 'swamp', 'swamp'],
        library: ['forest', 'swamp', 'shock'],
      },
    });
    putMinus(batch, batch.id('p1', 'moonshadow'), 6);
    cast(batch, 'scarblade-scout');
    resolve(batch);
    expect(minus(batch, batch.id('p1', 'moonshadow'))).toBe(5);

    const spells = game({
      p1: {
        hand: ['scarblade-scout'],
        battlefield: ['moonshadow', 'swamp', 'swamp'],
        library: ['shock', 'shock', 'forest'],
      },
    });
    putMinus(spells, spells.id('p1', 'moonshadow'), 6);
    cast(spells, 'scarblade-scout');
    resolve(spells);
    expect(minus(spells, spells.id('p1', 'moonshadow'))).toBe(6);
  });

  it('does nothing without a -1/-1 counter on it, and a token dying does not count', () => {
    const g = game({ p1: { battlefield: ['moonshadow', 'savannah-lions'] } });
    const m = g.id('p1', 'moonshadow');
    expect(minus(g, m)).toBe(0);
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    g.pass();
    resolve(g);
    expect(minus(g, m)).toBe(0);
  });
});

describe('Mornsong Aria', () => {
  it('players cannot draw cards or gain life', () => {
    const g = game({
      p1: { hand: ['dream-seizer'], battlefield: ['mornsong-aria', 'scarblade-scout'] },
    });
    // Moonglove-like draw and lifelink: a lifelinking attacker gains nothing.
    const scout = g.id('p1', 'scarblade-scout');
    g.obj(scout).summoningSick = false;
    attackWith(g, scout);
    for (let i = 0; i < 12 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: g.actor });
      else g.pass();
    }
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(20);
  });

  it('draw effects do nothing (but the rest of the spell or ability still happens)', () => {
    const g = game({ p1: { battlefield: ['mornsong-aria', 'moonglove-extractor'] } });
    const m = g.id('p1', 'moonglove-extractor');
    g.obj(m).summoningSick = false;
    attackWith(g, m);
    resolve(g);
    expect(hand(g)).toHaveLength(0);
    expect(g.life('p1')).toBe(19);
  });

  it('at each draw step that player loses 3 life, tutors a card to hand and shuffles, and draws nothing', () => {
    const g = game({
      step: 'end',
      p1: { battlefield: ['mornsong-aria'] },
      p2: { library: ['forest', 'savannah-lions', 'forest'] },
    });
    passTo(g, 'upkeep', 'p2');
    // To the draw step: the trigger goes on the stack.
    for (let i = 0; i < 10 && g.state.turn.step !== 'draw'; i++) g.pass();
    resolve(g);
    expect(g.life('p2')).toBe(17);
    expect(g.decision.kind).toBe('searchLibrary');
    expect(g.actor).toBe('p2');
    const pick = g
      .legal()
      .find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'savannah-lions')!;
    g.do(pick);
    expect(hand(g, 'p2')).toEqual(['savannah-lions']);
  });
});

describe('Mudbutton Cursetosser', () => {
  it('costs {B} with a Goblin to behold, or {2} more; it cannot block; when it dies destroy a creature with power 2 or less', () => {
    const g = game({
      p1: { hand: ['mudbutton-cursetosser'], battlefield: ['swamp', 'bile-vial-boggart'] },
    });
    const c = g.id('p1', 'mudbutton-cursetosser', 'hand');
    const a = casts(g, c);
    expect(a.some((x) => x.beheld)).toBe(true);
    g.do(a.find((x) => x.beheld)!);
    resolve(g);
    const m = g.id('p1', 'mudbutton-cursetosser');
    expect(cantBlock(g, m)).toBe(true);
  });

  it('destroys a creature an opponent controls with power 2 or less when it dies', () => {
    const g = game({
      p1: { battlefield: ['mudbutton-cursetosser'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    g.obj(g.id('p1', 'mudbutton-cursetosser')).damage = 1;
    g.pass();
    resolve(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });

  it('without a Goblin it needs {2} more', () => {
    const g = game({ p1: { hand: ['mudbutton-cursetosser'], battlefield: n('swamp', 2) } });
    expect(casts(g, g.id('p1', 'mudbutton-cursetosser', 'hand'))).toHaveLength(0);
    const h = game({ p1: { hand: ['mudbutton-cursetosser'], battlefield: n('swamp', 3) } });
    expect(casts(h, h.id('p1', 'mudbutton-cursetosser', 'hand')).length).toBeGreaterThan(0);
  });
});

function cantBlock(g: GameDriver, id: string): boolean {
  return !!getCharacteristics(g.state, cardDb, id).cantBlock;
}

describe('Nameless Inversion', () => {
  it('gives +3/-3 and removes all creature types until end of turn', () => {
    const g = game({
      p1: { hand: ['nameless-inversion'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'nameless-inversion', [g.ref(angel)]);
    resolve(g);
    expect(pt(g, angel)).toEqual([7, 1]);
    expect(getCharacteristics(g.state, cardDb, angel).subtypes).toEqual([]);
  });
});

describe('Nightmare Sower', () => {
  it('puts a -1/-1 counter on up to one target creature when you cast a spell during an opponent’s turn', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['shock'], battlefield: ['nightmare-sower', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.pass(); // p2 passes priority to p1 in their main phase
    expect(g.actor).toBe('p1');
    cast(g, 'shock', [{ player: 'p2' }]);
    const angel = g.id('p2', 'serra-angel');
    resolve(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    );
    expect(minus(g, angel)).toBe(1);
  });

  it('does not trigger on your own turn', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['nightmare-sower', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    resolve(g);
    expect(minus(g, g.id('p2', 'serra-angel'))).toBe(0);
  });
});

describe('Perfect Intimidation', () => {
  it('can make the opponent exile two cards from hand', () => {
    const g = game({
      p1: { hand: ['perfect-intimidation'], battlefield: n('swamp', 4) },
      p2: { hand: ['shock', 'savannah-lions', 'forest'] },
    });
    const a = casts(g, g.id('p1', 'perfect-intimidation', 'hand')).find(
      (x) => x.targets.length === 1 && 'player' in x.targets[0]!,
    )!;
    g.do(a);
    g.passBoth();
    expect(g.decision.kind).toBe('discard');
    expect(g.actor).toBe('p2');
    g.do(g.legal().find((x) => x.type === 'discard')!);
    g.do(g.legal().find((x) => x.type === 'discard')!);
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(exile(g, 'p2')).toHaveLength(2);
  });

  it('can remove all counters from a creature, and both modes can be chosen together', () => {
    const g = game({
      p1: { hand: ['perfect-intimidation'], battlefield: n('swamp', 4) },
      p2: { hand: ['shock', 'savannah-lions'], battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 2;
    g.obj(angel).counters = { '-1/-1': 1, shield: 1 };
    const both = casts(g, g.id('p1', 'perfect-intimidation', 'hand')).find(
      (x) => x.targets.length === 2,
    )!;
    g.do(both);
    g.passBoth();
    g.do(g.legal().find((x) => x.type === 'discard')!);
    g.do(g.legal().find((x) => x.type === 'discard')!);
    expect(hand(g, 'p2')).toHaveLength(0);
    expect(g.obj(angel).plusOneCounters).toBe(0);
    expect(g.obj(angel).counters ?? {}).toEqual({});
  });
});

describe('Requiting Hex', () => {
  it('destroys a creature with mana value 2 or less; blighting makes you gain 2 life', () => {
    const g = game({
      p1: { hand: ['requiting-hex'], battlefield: ['swamp', 'serra-angel'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    const blighted = casts(g, g.id('p1', 'requiting-hex', 'hand')).find((x) => x.blight)!;
    g.do({ ...blighted, targets: [g.ref(lions)] });
    resolve(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.life('p1')).toBe(22);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
  });

  it('without the blight there is no life gain, and mana value 3 is not a legal target', () => {
    const g = game({
      p1: { hand: ['requiting-hex'], battlefield: ['swamp'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const angelCast = casts(g, g.id('p1', 'requiting-hex', 'hand')).filter((x) =>
      x.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel')),
    );
    expect(angelCast).toHaveLength(0);
    cast(g, 'requiting-hex', [g.ref(g.id('p2', 'savannah-lions'))]);
    resolve(g);
    expect(g.life('p1')).toBe(20);
  });
});

describe('Retched Wretch', () => {
  it('returns with all abilities lost if it had a -1/-1 counter when it died', () => {
    const g = game({ p1: { battlefield: ['retched-wretch'] } });
    const w = g.id('p1', 'retched-wretch');
    putMinus(g, w, 1);
    g.obj(w).damage = 3;
    g.pass();
    resolve(g);
    expect(onField(g, 'retched-wretch')).toHaveLength(1);
    const back = onField(g, 'retched-wretch')[0]!;
    expect(minus(g, back)).toBe(0);
    // It has lost all abilities: dying again does not bring it back.
    g.obj(back).damage = 4;
    g.pass();
    resolve(g);
    expect(onField(g, 'retched-wretch')).toHaveLength(0);
    expect(gy(g)).toContain('retched-wretch');
  });

  it('stays dead when it had no -1/-1 counter', () => {
    const g = game({ p1: { battlefield: ['retched-wretch'] } });
    g.obj(g.id('p1', 'retched-wretch')).damage = 2;
    g.pass();
    resolve(g);
    expect(onField(g, 'retched-wretch')).toHaveLength(0);
  });
});

describe('Scarblade Scout', () => {
  it('has lifelink and mills two cards when it enters', () => {
    const g = game({ p1: { hand: ['scarblade-scout'], battlefield: n('swamp', 2) } });
    cast(g, 'scarblade-scout');
    resolve(g);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(keywords(g, g.id('p1', 'scarblade-scout')).has('lifelink')).toBe(true);
  });
});

describe("Scarblade's Malice", () => {
  it('gives deathtouch and lifelink; if that creature dies this turn you get a 2/2 Elf', () => {
    const g = game({
      p1: { hand: ['scarblades-malice'], battlefield: ['swamp', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'scarblades-malice', [g.ref(lions)]);
    resolve(g);
    expect(keywords(g, lions).has('deathtouch')).toBe(true);
    expect(keywords(g, lions).has('lifelink')).toBe(true);
    g.obj(lions).damage = 1;
    g.pass();
    resolve(g);
    const tokens = g.state.battlefield.filter((id) => g.obj(id).isToken);
    expect(tokens).toHaveLength(1);
    expect(pt(g, tokens[0]!)).toEqual([2, 2]);
  });
});

describe('Shimmercreep', () => {
  it('drains X where X is the number of colors among your permanents', () => {
    const g = game({
      p1: { hand: ['shimmercreep'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
    });
    cast(g, 'shimmercreep');
    resolve(g);
    // Black (the creature) and white (Savannah Lions).
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Taster of Wares', () => {
  const setup = (p2hand: string[]) =>
    game({
      p1: { hand: ['taster-of-wares'], battlefield: [...n('swamp', 3), 'mountain'] },
      p2: { hand: p2hand },
    });

  it('the opponent reveals X cards (their choice), you choose one, it is exiled and castable with any mana while you control Taster', () => {
    const g = setup(['shock', 'savannah-lions', 'forest']);
    cast(g, 'taster-of-wares');
    resolve(g);
    // One Goblin: the opponent picks one card to reveal.
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    g.do({
      type: 'chooseOption',
      player: 'p2',
      index: d.options.findIndex((o) => o.label === 'Shock'),
    });
    expect(g.decision.kind).toBe('chooseFromHand');
    expect(g.actor).toBe('p1');
    // You see only the card they revealed, not the rest of their hand.
    const seen = redactFor(g.state, 'p1', cardDb);
    const known = g.state.players.p2.hand.filter((id) => seen.objects[id]!.defId === g.obj(id).defId);
    expect(known.map((id) => g.obj(id).defId)).toEqual(['shock']);
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    resolve(g);
    expect(exile(g, 'p2')).toEqual(['shock']);
    // Castable by p1 with any mana (all lands may make it: tap only swamps).
    const shock = g.state.players.p2.exile[0]!;
    const c = g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === shock);
    expect(c.length).toBeGreaterThan(0);
  });

  it('casts the exiled spell using mana of any type', () => {
    const g = game({
      p1: { hand: ['taster-of-wares'], battlefield: n('swamp', 4) },
      p2: { hand: ['shock'] },
    });
    cast(g, 'taster-of-wares');
    resolve(g);
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    resolve(g);
    const shock = g.state.players.p2.exile[0]!;
    const c = g
      .legal('p1')
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === shock &&
          a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!;
    g.do(c);
    resolve(g);
    expect(g.life('p2')).toBe(18);
    expect(gy(g, 'p2')).toContain('shock');
  });

  it('with more Goblins than cards in their hand, the whole hand is revealed', () => {
    const g = game({
      p1: {
        hand: ['taster-of-wares'],
        battlefield: [...n('swamp', 3), 'bile-vial-boggart', 'bile-vial-boggart'],
      },
      p2: { hand: ['shock', 'forest'] },
    });
    cast(g, 'taster-of-wares');
    resolve(g);
    // Three Goblins, two cards: no choices for them, just the reveal.
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    expect(g.decision.kind).toBe('chooseFromHand');
    const picks = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(picks).toHaveLength(2);
  });

  it('a non-instant/sorcery card is exiled but not castable', () => {
    const g = setup(['savannah-lions']);
    cast(g, 'taster-of-wares');
    resolve(g);
    // Their whole hand is revealed (one card for X = 1).
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    resolve(g);
    expect(exile(g, 'p2')).toEqual(['savannah-lions']);
    const lions = g.state.players.p2.exile[0]!;
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === lions)).toBe(false);
    expect(d.options).toHaveLength(1);
  });

  it('the permission ends when you stop controlling Taster', () => {
    const g = setup(['shock']);
    cast(g, 'taster-of-wares');
    resolve(g);
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    resolve(g);
    const shock = g.state.players.p2.exile[0]!;
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === shock)).toBe(true);
    const taster = g.id('p1', 'taster-of-wares');
    g.obj(taster).damage = 5;
    g.pass();
    resolve(g);
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === shock)).toBe(false);
  });
});

describe('Twilight Diviner', () => {
  it('surveils 2 when it enters', () => {
    const g = game({ p1: { hand: ['twilight-diviner'], battlefield: n('swamp', 3) } });
    cast(g, 'twilight-diviner');
    resolve(g);
    expect(g.decision.kind).toBe('scry');
  });

  it('copies a creature that entered from a graveyard (once each turn)', () => {
    const g = game({
      p1: {
        hand: ['dose-of-dawnglow'],
        battlefield: [...n('swamp', 5), 'twilight-diviner', 'savannah-lions'],
        graveyard: ['serra-angel', 'llanowar-elves'],
      },
    });
    cast(g, 'dose-of-dawnglow', [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]);
    resolve(g);
    // Dose blights 2 only outside the main phase; this is the main phase.
    expect(onField(g, 'serra-angel')).toHaveLength(2);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });

  it('does not copy a creature that entered from your hand', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['twilight-diviner', 'plains'] },
    });
    cast(g, 'savannah-lions');
    resolve(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });

  it('with several creatures entering from the graveyard at once, you pick which to copy', () => {
    const g = game({
      p1: {
        hand: ['bloodline-bidding'],
        battlefield: [...n('swamp', 8), 'twilight-diviner'],
        graveyard: ['llanowar-elves', 'scarblade-scout'],
      },
    });
    cast(g, 'bloodline-bidding');
    resolve(g);
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: d.options.findIndex((o) => o.label === 'Elf'),
    });
    resolve(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    resolve(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });
});

describe('Unbury', () => {
  it('returns one creature card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        hand: ['unbury'],
        battlefield: n('swamp', 2),
        graveyard: ['serra-angel', 'savannah-lions'],
      },
    });
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const one = casts(g, g.id('p1', 'unbury', 'hand')).find(
      (a) => a.mode === 0 && a.targets.some((t) => 'object' in t && t.object.id === angel),
    )!;
    g.do(one);
    resolve(g);
    expect(hand(g)).toEqual(['serra-angel']);
  });

  it('the second mode needs two creature cards that share a creature type', () => {
    const g = game({
      p1: {
        hand: ['unbury'],
        battlefield: n('swamp', 2),
        graveyard: ['llanowar-elves', 'scarblade-scout', 'savannah-lions'],
      },
    });
    const two = casts(g, g.id('p1', 'unbury', 'hand')).filter((a) => a.mode === 1);
    // Only the two Elves share a creature type: one unordered pair.
    expect(two).toHaveLength(1);
    g.do(two[0]!);
    resolve(g);
    expect(hand(g).sort()).toEqual(['llanowar-elves', 'scarblade-scout']);
  });

  it('a changeling shares a creature type with any creature card', () => {
    const g = game({
      p1: {
        hand: ['unbury'],
        battlefield: n('swamp', 2),
        graveyard: ['graveshifter', 'savannah-lions'],
      },
    });
    const two = casts(g, g.id('p1', 'unbury', 'hand')).filter((a) => a.mode === 1);
    expect(two).toHaveLength(1);
  });
});

describe('Lorwyn Eclipsed black: random games', () => {
  it('plays short random games with every black card in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const cards = BLACK_CARDS.map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('swamp', 24)].slice(0, 70);
    for (let seed = 1; seed <= 8; seed++) {
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
