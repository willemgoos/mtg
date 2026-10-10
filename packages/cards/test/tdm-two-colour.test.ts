import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import {
  board,
  casts,
  choose,
  chars,
  done,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// Tarkir: Dragonstorm 19b: the two-colour group (gold cards and the Sieges).

const NAMES = [
  'Auroral Procession',
  'Barrensteppe Siege',
  'Cori Mountain Stalwart',
  'Effortless Master',
  'Frontline Rush',
  'Glacial Dragonhunt',
  'Glacierwood Siege',
  'Hardened Tactician',
  'Hollowmurk Siege',
  'Host of the Hereafter',
  'Kishla Skimmer',
  'Marshal of the Lost',
  'Stalwart Successor',
  'Windcrag Siege',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

/** Casts a card from hand, optionally choosing the cast action whose targets satisfy `pick`. */
const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const targetsObject =
  (g: Game, defId: string, p: 'p1' | 'p2' = 'p1') =>
  (a: CastAction) =>
    a.targets.some(
      (t) =>
        'object' in t && g.obj(t.object.id).defId === defId && g.obj(t.object.id).controller === p,
    );
/** Resolves the stack, leaving the next choice (or priority with an empty stack). */
const resolve = (g: Game): Game => stop(g);

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) expect(cardDb.get(idOf(name)), name).toBeDefined();
  });
  it('the Sieges have one hidden definition for each choice', () => {
    for (const [id, choices] of [
      ['barrensteppe-siege', ['abzan', 'mardu']],
      ['glacierwood-siege', ['temur', 'sultai']],
      ['hollowmurk-siege', ['sultai', 'abzan']],
      ['windcrag-siege', ['mardu', 'jeskai']],
    ] as const)
      for (const c of choices) expect(cardDb.get(`${id}--${c}`)?.variantOf, `${id} ${c}`).toBe(id);
  });
});

describe('Auroral Procession', () => {
  it('returns target card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        hand: ['auroral-procession'],
        battlefield: ['forest', 'island'],
        graveyard: ['llanowar-elves', 'savannah-lions'],
      },
      p2: { graveyard: ['elvish-mystic'] },
    });
    // Only cards in your own graveyard are targets.
    const options = casts(g, 'auroral-procession');
    expect(options).toHaveLength(2);
    cast(g, 'auroral-procession', targetsObject(g, 'savannah-lions'));
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(gy(g)).toEqual(['llanowar-elves', 'auroral-procession']);
  });
});

describe('Barrensteppe Siege', () => {
  const siege = (choice: RegExp, extra: Partial<Parameters<typeof game>[0]> = {}): Game => {
    const g = game({
      p1: {
        hand: ['barrensteppe-siege'],
        battlefield: [...n('plains', 2), ...n('swamp', 2), 'savannah-lions', 'llanowar-elves'],
        ...(extra.p1 ?? {}),
      },
      p2: { battlefield: ['elvish-mystic', 'savannah-lions'], ...(extra.p2 ?? {}) },
    });
    cast(g, 'barrensteppe-siege');
    resolve(g);
    expect(labels(g)).toEqual(['Abzan', 'Mardu']);
    choose(g, choice);
    done(g);
    return g;
  };

  it('asks as it enters; the permanent is the chosen half', () => {
    const g = siege(/Abzan/);
    expect(board(g, 'barrensteppe-siege--abzan')).toHaveLength(1);
    expect(g.obj(board(g, 'barrensteppe-siege--abzan')[0]!).front).toBe('barrensteppe-siege');
  });

  it('Abzan: a +1/+1 counter on each creature you control at the beginning of your end step', () => {
    const g = siege(/Abzan/);
    passTo(g, 'end');
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([2, 2]);
    // Not the opponent's.
    expect(pt(g, g.id('p2', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('Mardu: each opponent sacrifices a creature of their choice if a creature died under your control this turn', () => {
    const g = siege(/Mardu/);
    // No creature died: nothing happens.
    passTo(g, 'end');
    done(g);
    expect(board(g, 'elvish-mystic', 'p2')).toHaveLength(1);
    expect(board(g, 'savannah-lions', 'p2')).toHaveLength(1);
  });

  it('Mardu: ... and it does when one did', () => {
    const g = game({
      p1: {
        hand: ['flame-slash'],
        battlefield: [...n('plains', 2), 'mountain', 'savannah-lions', 'barrensteppe-siege--mardu'],
      },
      p2: { battlefield: ['elvish-mystic', 'savannah-lions'] },
    });
    cast(g, 'flame-slash', targetsObject(g, 'savannah-lions', 'p1'));
    done(g);
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(0);
    passTo(g, 'end');
    // The opponent chooses what to sacrifice.
    done(g, { card: (id) => g.obj(id).defId === 'elvish-mystic' });
    expect(board(g, 'elvish-mystic', 'p2')).toHaveLength(0);
    expect(board(g, 'savannah-lions', 'p2')).toHaveLength(1);
  });
});

describe('Cori Mountain Stalwart', () => {
  it('flurry: the second spell each turn deals 2 damage to each opponent and you gain 2 life', () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves', 'savannah-lions', 'giant-growth'],
        battlefield: ['cori-mountain-stalwart', 'forest', 'forest', 'plains'],
      },
    });
    cast(g, 'llanowar-elves');
    resolve(g);
    expect(g.life('p2')).toBe(20);
    cast(g, 'savannah-lions');
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    // Only the second spell.
    cast(g, 'giant-growth', targetsObject(g, 'llanowar-elves'));
    done(g);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Effortless Master', () => {
  const master = (before: boolean): Game => {
    const g = game({
      p1: {
        hand: before ? ['llanowar-elves', 'effortless-master'] : ['effortless-master'],
        battlefield: [...n('island', 2), ...n('mountain', 2), 'forest'],
      },
    });
    if (before) {
      cast(g, 'llanowar-elves');
      resolve(g);
    }
    cast(g, 'effortless-master');
    resolve(g);
    return g;
  };
  it('enters with two +1/+1 counters if you have cast two or more spells this turn', () => {
    const g = master(true);
    expect(pt(g, g.id('p1', 'effortless-master'))).toEqual([6, 5]);
  });
  it('... and without them if it is the only spell', () => {
    const g = master(false);
    expect(pt(g, g.id('p1', 'effortless-master'))).toEqual([4, 3]);
    expect([...chars(g, g.id('p1', 'effortless-master')).keywords]).toEqual(
      expect.arrayContaining(['vigilance', 'menace']),
    );
  });
});

describe('Frontline Rush', () => {
  it('mode one: two 1/1 red Goblin tokens', () => {
    const g = game({ p1: { hand: ['frontline-rush'], battlefield: ['mountain', 'plains'] } });
    const modes = casts(g, 'frontline-rush');
    // No creature to target: only the token mode.
    expect(modes.map((m) => m.mode)).toEqual([0]);
    g.do(modes.find((m) => m.mode === 0)!);
    done(g);
    expect(board(g, 'goblin-token', 'p1')).toHaveLength(2);
  });
  it('mode two: target creature gets +X/+X, X the number of creatures you control', () => {
    const g = game({
      p1: {
        hand: ['frontline-rush'],
        battlefield: ['mountain', 'plains', 'savannah-lions', 'llanowar-elves', 'llanowar-elves'],
      },
    });
    g.do(
      casts(g, 'frontline-rush').find(
        (m) => m.mode === 1 && targetsObject(g, 'savannah-lions')(m),
      )!,
    );
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([5, 4]);
  });
});

describe('Glacial Dragonhunt', () => {
  const hunt = (hand: string[]): Game => {
    const g = game({
      p1: {
        hand: ['glacial-dragonhunt', ...hand],
        battlefield: ['island', 'mountain'],
        library: ['forest', 'forest', 'forest'],
      },
      p2: { battlefield: ['elvish-mystic'] },
    });
    cast(g, 'glacial-dragonhunt');
    resolve(g);
    return g;
  };

  it('discarding a nonland card this way deals 3 damage to target creature', () => {
    const g = hunt(['savannah-lions']);
    // Draw a card, then you may discard a card.
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    g.do(g.legal().find((a) => a.type === 'discard' && g.obj(a.card).defId === 'savannah-lions')!);
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(board(g, 'elvish-mystic', 'p2')).toHaveLength(0);
  });

  it('discarding a land does not', () => {
    const g = hunt(['savannah-lions']);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    const discard = g
      .legal()
      .find((a) => a.type === 'discard' && g.obj(a.card).defId === 'forest')!;
    g.do(discard);
    done(g);
    expect(gy(g)).toContain('forest');
    expect(board(g, 'elvish-mystic', 'p2')).toHaveLength(1);
  });

  it('the discard is optional', () => {
    const g = hunt(['savannah-lions']);
    done(g, { accept: false });
    expect(board(g, 'elvish-mystic', 'p2')).toHaveLength(1);
    expect(hand(g)).toContain('forest');
    expect(hand(g)).toContain('savannah-lions');
  });

  it('harmonize {4}{U}{R}: castable from the graveyard, then exiled', () => {
    const g = game({
      p1: {
        graveyard: ['glacial-dragonhunt'],
        battlefield: [...n('island', 3), ...n('mountain', 3)],
        library: ['forest', 'forest', 'forest'],
      },
    });
    const c = g
      .legal()
      .filter(
        (a) => a.type === 'castSpell' && a.card === g.id('p1', 'glacial-dragonhunt', 'graveyard'),
      );
    expect(c.length).toBeGreaterThan(0);
    g.do(c[0]!);
    done(g, { accept: false });
    expect(gy(g)).not.toContain('glacial-dragonhunt');
  });
});

describe('Glacierwood Siege', () => {
  it('Temur: whenever you cast an instant or sorcery, target player mills four cards', () => {
    const g = game({
      p1: {
        hand: ['giant-growth', 'llanowar-elves'],
        battlefield: ['glacierwood-siege--temur', 'forest', 'forest', 'llanowar-elves'],
      },
      p2: { library: n('island', 8) },
    });
    cast(g, 'llanowar-elves');
    resolve(g);
    expect(gy(g, 'p2')).toHaveLength(0);
    cast(g, 'giant-growth', targetsObject(g, 'llanowar-elves'));
    done(g, { target: (a) => a.targets.some((t) => 'player' in t && t.player === 'p2') });
    expect(gy(g, 'p2')).toHaveLength(4);
  });

  it('Sultai: you may play lands from your graveyard', () => {
    const g = game({
      p1: { battlefield: ['glacierwood-siege--sultai'], graveyard: ['forest'] },
    });
    const play = g.legal().find((a) => a.type === 'playLand');
    expect(play).toBeDefined();
    g.do(play!);
    expect(board(g, 'forest', 'p1')).toHaveLength(1);
  });

  it('is cast as the card and asks Temur or Sultai', () => {
    const g = game({
      p1: { hand: ['glacierwood-siege'], battlefield: ['forest', 'island', 'island'] },
    });
    cast(g, 'glacierwood-siege');
    resolve(g);
    expect(labels(g)).toEqual(['Temur', 'Sultai']);
    choose(g, /Sultai/);
    done(g);
    expect(board(g, 'glacierwood-siege--sultai')).toHaveLength(1);
  });
});

describe('Hardened Tactician', () => {
  it('{1}, Sacrifice a token: draw a card', () => {
    const g = game({
      p1: {
        battlefield: ['hardened-tactician', 'plains', 'goblin-token', 'llanowar-elves'],
        library: ['plains', 'forest'],
      },
    });
    g.obj(g.id('p1', 'goblin-token')).isToken = true;
    const tactician = g.id('p1', 'hardened-tactician');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === tactician);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    expect(board(g, 'goblin-token', 'p1')).toHaveLength(0);
    // The nontoken creature could not be sacrificed.
    expect(board(g, 'llanowar-elves', 'p1')).toHaveLength(1);
    expect(hand(g)).toEqual(['plains']);
  });
  it("can't be activated without a token", () => {
    const g = game({
      p1: { battlefield: ['hardened-tactician', 'plains', 'llanowar-elves'] },
    });
    const tactician = g.id('p1', 'hardened-tactician');
    expect(g.legal().filter((a) => a.type === 'activateAbility' && a.source === tactician)).toEqual(
      [],
    );
  });
});

describe('Hollowmurk Siege', () => {
  it('Sultai: whenever a counter is put on a creature you control, draw a card (once each turn)', () => {
    const g = game({
      p1: {
        hand: ['snakeskin-veil', 'snakeskin-veil'],
        battlefield: ['hollowmurk-siege--sultai', 'forest', 'forest', 'llanowar-elves'],
        library: ['plains', 'island', 'swamp'],
      },
    });
    cast(g, 'snakeskin-veil');
    done(g);
    expect(hand(g)).toEqual(['snakeskin-veil', 'plains']);
    cast(g, 'snakeskin-veil');
    done(g);
    expect(hand(g)).toEqual(['plains']);
  });

  it('Abzan: whenever you attack, a +1/+1 counter on target attacking creature, which gains menace', () => {
    const g = game({
      p1: { battlefield: ['hollowmurk-siege--abzan', 'savannah-lions', 'llanowar-elves'] },
      step: 'beginCombat',
    });
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    g.attack(g.id('p1', 'savannah-lions'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions'),
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect([...chars(g, lions).keywords]).toContain('menace');
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 1]);
  });
});

describe('Host of the Hereafter', () => {
  it('enters with two +1/+1 counters', () => {
    const g = game({
      p1: { hand: ['host-of-the-hereafter'], battlefield: ['swamp', 'swamp', 'forest', 'forest'] },
    });
    cast(g, 'host-of-the-hereafter');
    resolve(g);
    expect(pt(g, g.id('p1', 'host-of-the-hereafter'))).toEqual([4, 4]);
  });

  it('when a creature of yours with counters dies, its counters go on up to one target creature you control', () => {
    const g = game({
      p1: {
        hand: ['flame-slash'],
        battlefield: ['host-of-the-hereafter', 'savannah-lions', 'llanowar-elves', 'mountain'],
      },
    });
    // The Host itself has no counters in this scenario: give the Lions some through the engine.
    const lions = g.id('p1', 'savannah-lions');
    g.state.objects[lions]!.plusOneCounters = 3;
    cast(g, 'flame-slash', targetsObject(g, 'savannah-lions'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'llanowar-elves'),
    });
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(0);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([4, 4]);
  });

  it('a creature without counters does nothing', () => {
    const g = game({
      p1: {
        hand: ['flame-slash'],
        battlefield: ['host-of-the-hereafter', 'savannah-lions', 'llanowar-elves', 'mountain'],
      },
    });
    cast(g, 'flame-slash', targetsObject(g, 'savannah-lions'));
    done(g);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 1]);
  });
});

describe('Kishla Skimmer', () => {
  it('draws when a card leaves your graveyard during your turn, once each turn', () => {
    const g = game({
      p1: {
        hand: ['auroral-procession', 'auroral-procession'],
        battlefield: ['kishla-skimmer', ...n('forest', 2), ...n('island', 2)],
        graveyard: ['llanowar-elves', 'savannah-lions'],
        library: ['plains', 'island', 'swamp'],
      },
    });
    cast(g, 'auroral-procession', targetsObject(g, 'llanowar-elves'));
    done(g);
    expect(hand(g)).toEqual(['auroral-procession', 'llanowar-elves', 'plains']);
    cast(g, 'auroral-procession', targetsObject(g, 'savannah-lions'));
    done(g);
    // The second time this turn draws nothing.
    expect(hand(g).sort()).toEqual(['llanowar-elves', 'plains', 'savannah-lions']);
  });
  it("does not trigger during an opponent's turn", () => {
    const g = game({
      p1: {
        hand: ['auroral-procession'],
        battlefield: ['kishla-skimmer', 'forest', 'island'],
        graveyard: ['llanowar-elves'],
        library: ['plains'],
      },
      active: 'p2',
    });
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, 'auroral-procession');
    done(g);
    expect(hand(g)).toEqual(['llanowar-elves']);
  });
});

describe('Marshal of the Lost', () => {
  it('whenever you attack, target creature gets +X/+X, X the number of attacking creatures', () => {
    const g = game({
      p1: { battlefield: ['marshal-of-the-lost', 'savannah-lions', 'llanowar-elves'] },
      step: 'beginCombat',
    });
    g.passBoth();
    g.attack(g.id('p1', 'savannah-lions'), g.id('p1', 'marshal-of-the-lost'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'llanowar-elves'),
    });
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([3, 3]);
  });
});

describe('Stalwart Successor', () => {
  it('the first time counters are put on a creature you control each turn, it gets another +1/+1 counter', () => {
    const g = game({
      p1: {
        hand: ['snakeskin-veil', 'snakeskin-veil'],
        battlefield: ['stalwart-successor', 'forest', 'forest', 'llanowar-elves'],
      },
    });
    cast(g, 'snakeskin-veil', targetsObject(g, 'llanowar-elves'));
    done(g);
    // The Veil's counter, then the Successor's.
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([3, 3]);
    cast(g, 'snakeskin-veil', targetsObject(g, 'llanowar-elves'));
    done(g);
    // Not the first time this turn: only the Veil's counter.
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([4, 4]);
  });
  it('it counts for each creature on its own', () => {
    const g = game({
      p1: {
        hand: ['snakeskin-veil', 'snakeskin-veil'],
        battlefield: ['stalwart-successor', 'forest', 'forest', 'llanowar-elves'],
      },
    });
    cast(g, 'snakeskin-veil', targetsObject(g, 'llanowar-elves'));
    done(g);
    cast(g, 'snakeskin-veil', targetsObject(g, 'stalwart-successor'));
    done(g);
    expect(pt(g, g.id('p1', 'stalwart-successor'))).toEqual([5, 4]);
  });
});

describe('Windcrag Siege', () => {
  it('Jeskai: at the beginning of your upkeep, a 1/1 Goblin with lifelink and haste until end of turn', () => {
    const g = game({
      p1: { battlefield: ['windcrag-siege--jeskai'] },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    passTo(g, 'upkeep', 'p1');
    done(g);
    const gob = board(g, 'goblin-token', 'p1');
    expect(gob).toHaveLength(1);
    expect([...chars(g, gob[0]!).keywords]).toEqual(expect.arrayContaining(['lifelink', 'haste']));
    passTo(g, 'main2', 'p1');
    expect([...chars(g, gob[0]!).keywords]).toEqual(expect.arrayContaining(['lifelink', 'haste']));
  });

  it('Mardu: an attack-caused triggered ability of your permanents triggers an additional time', () => {
    const g = game({
      p1: { battlefield: ['windcrag-siege--mardu', 'marshal-of-the-lost', 'savannah-lions'] },
      step: 'beginCombat',
    });
    g.passBoth();
    g.attack(g.id('p1', 'marshal-of-the-lost'));
    // Two triggers, each +1/+1.
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions'),
    });
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
  });

  it('Mardu: without it the trigger happens once', () => {
    const g = game({
      p1: { battlefield: ['marshal-of-the-lost', 'savannah-lions'] },
      step: 'beginCombat',
    });
    g.passBoth();
    g.attack(g.id('p1', 'marshal-of-the-lost'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions'),
    });
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
  });

  it('Mardu: two of them trigger it three times', () => {
    const g = game({
      p1: {
        battlefield: [
          'windcrag-siege--mardu',
          'windcrag-siege--mardu',
          'marshal-of-the-lost',
          'savannah-lions',
        ],
      },
      step: 'beginCombat',
    });
    g.passBoth();
    g.attack(g.id('p1', 'marshal-of-the-lost'));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions'),
    });
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([5, 4]);
  });
});
