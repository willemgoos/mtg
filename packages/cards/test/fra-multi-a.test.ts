import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a, group multi-a: the W/U, U/B, B/R, R/G and G/W gold cards.

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

interface Opts {
  option?: number | RegExp;
  accept?: boolean;
}

/** Resolves the stack and any choices with simple defaults. */
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
    else if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (d.kind === 'castFree' && opts.accept)
      g.do(g.legal().find((a) => a.type === 'castSpell')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

const castCopy = (
  g: GameDriver,
  perm: string,
  targets: Parameters<typeof cast>[2] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets, ...extra });
  return g;
};

/** Passes priority until it is `step` of `player`'s turn (on a later turn), taking default choices. */
function passTo(g: GameDriver, step: string, player: 'p1' | 'p2' = 'p1'): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 200; i++) {
    const t = g.state.turn;
    if (t.number > start && t.step === step && t.activePlayer === player) return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority within this turn until `step` (stopping at triggers' target choices). */
function toStep(g: GameDriver, step: string): void {
  for (let i = 0; i < 60; i++) {
    if (g.state.turn.step === step) return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
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

const canActivate = (g: GameDriver, source: string) =>
  g.legal().some((a) => a.type === 'activateAbility' && a.source === source);

describe('the cards are all there', () => {
  it('every multi-a card is in the card pool, with its prepare spell', () => {
    for (const id of [
      'aerid-konstrari',
      'bloombrute',
      'craftwork-crusher',
      'denzilore-fatehold',
      'desperate-futurescribe',
      'emergency-phytomedic',
      'fatehold-chronologist',
      'grim-repriser',
      'ingris-stingerquill',
      'konstrari-charm',
      'konstrari-improviser',
      'kwia-vigorbloom',
      'null-summoner',
      'paradox-shaper',
      'proctor-of-potential',
      'prudent-fateseer',
      'recursive-recruitment',
      'solarium-sentry',
      'stingerquill-charm',
      'stingerquill-voxmancer',
      'stinging-vitriol',
      'tenured-tethermage',
      'theorix-charm',
      'theorix-metamage',
      'uldaros-theorix',
      'vigorbloom-charm',
      'vigorbloom-vanguard',
      'whiplash-wordsmith',
      'woodwork-prodigy',
    ])
      expect(cardDb.get(id), id).toBeDefined();
    for (const id of [
      'peer-review-fatehold-chronologist',
      'peer-review-prudent-fateseer',
      'soul-tether-konstrari-improviser',
      'soul-tether-woodwork-prodigy',
      'vicious-verse-whiplash-wordsmith',
      'vicious-verse-stingerquill-voxmancer',
      'seed-suture-vigorbloom-vanguard',
      'seed-suture-emergency-phytomedic',
      'omit-variables-paradox-shaper',
      'omit-variables-theorix-metamage',
    ])
      expect(cardDb.get(id), id).toBeDefined();
  });
});

describe('white-blue: scry and surveil', () => {
  it('Fatehold Chronologist enters prepared; Peer Review makes a Cadet and surveils 1', () => {
    const g = game({
      p1: { hand: ['fatehold-chronologist'], battlefield: [...n('plains', 3), ...n('island', 3)] },
    });
    done(cast(g, 'fatehold-chronologist'));
    const c = g.id('p1', 'fatehold-chronologist');
    expect(keywords(g, c)).toContain('flying');
    expect(g.obj(c).prepared).toBeDefined();
    castCopy(g, c);
    done(g);
    const cadets = bf(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(1);
    expect(pt(g, cadets[0]!)).toEqual([2, 2]);
    expect(g.obj(cadets[0]!).isToken).toBe(true);
    expect(g.obj(c).prepared).toBeUndefined();
    // Surveil 1 happened: the player has scried or surveilled this turn.
    expect(g.state.turn.scriedOrSurveilled).toContain('p1');
  });

  it('Prudent Fateseer: creatures get +1/+0 when you scry or surveil, once each turn', () => {
    const g = game({
      p1: {
        hand: ['prudent-fateseer', 'fatehold-chronologist'],
        battlefield: [...n('plains', 6), ...n('island', 6)],
      },
    });
    done(cast(g, 'prudent-fateseer'));
    done(cast(g, 'fatehold-chronologist'));
    const f = g.id('p1', 'prudent-fateseer');
    const c = g.id('p1', 'fatehold-chronologist');
    expect(g.obj(f).prepared).toBeDefined();
    expect(pt(g, f)).toEqual([1, 4]);
    castCopy(g, c);
    done(g);
    expect(pt(g, f)).toEqual([2, 4]);
    expect(pt(g, c)).toEqual([2, 2]);
    // A second surveil in the same turn doesn't trigger it again.
    castCopy(g, f);
    done(g);
    expect(pt(g, f)).toEqual([2, 4]);
    expect(pt(g, c)).toEqual([2, 2]);
  });

  it('Prudent Fateseer: the bonus lasts only until end of turn', () => {
    const g = game({
      p1: {
        hand: ['prudent-fateseer'],
        battlefield: [...n('plains', 3), ...n('island', 3)],
      },
    });
    done(cast(g, 'prudent-fateseer'));
    const f = g.id('p1', 'prudent-fateseer');
    castCopy(g, f);
    done(g);
    expect(pt(g, f)).toEqual([2, 4]);
    passTo(g, 'main1', 'p2');
    expect(pt(g, f)).toEqual([1, 4]);
  });

  it('Desperate Futurescribe: another creature gets +1/+1 at the beginning of combat', () => {
    const g = game({ p1: { battlefield: ['desperate-futurescribe', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    toStep(g, 'beginCombat');
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(counters(g, lions)).toBe(0);
    expect(keywords(g, g.id('p1', 'desperate-futurescribe'))).toContain('flying');
  });

  it('Desperate Futurescribe: the target is another creature, not itself', () => {
    const g = game({ p1: { battlefield: ['desperate-futurescribe'] } });
    toStep(g, 'beginCombat');
    // No other creature: the trigger has no target and nothing happens.
    done(g);
    expect(pt(g, g.id('p1', 'desperate-futurescribe'))).toEqual([3, 4]);
  });

  it('Desperate Futurescribe: a +1/+1 counter instead if you scried or surveilled this turn', () => {
    const g = game({
      p1: {
        hand: ['fatehold-chronologist'],
        battlefield: [
          'desperate-futurescribe',
          'savannah-lions',
          ...n('plains', 3),
          ...n('island', 3),
        ],
      },
    });
    done(cast(g, 'fatehold-chronologist'));
    castCopy(g, g.id('p1', 'fatehold-chronologist'));
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    toStep(g, 'beginCombat');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets[0] &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === lions,
      ),
    );
    done(g);
    expect(counters(g, lions)).toBe(1);
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('Denzilore Fatehold has flash and flying, and puts a +1/+1 counter on each creature when you scry or surveil', () => {
    const g = game({
      p1: {
        hand: ['fatehold-chronologist'],
        battlefield: ['denzilore-fatehold', 'savannah-lions', ...n('plains', 3), ...n('island', 3)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const d = g.id('p1', 'denzilore-fatehold');
    expect(keywords(g, d)).toEqual(expect.arrayContaining(['flash', 'flying']));
    done(cast(g, 'fatehold-chronologist'));
    castCopy(g, g.id('p1', 'fatehold-chronologist'));
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(counters(g, d)).toBe(1);
    expect(counters(g, lions)).toBe(1);
    expect(counters(g, g.id('p1', 'fatehold-chronologist'))).toBe(1);
    // The Cadet was made before the surveil, so it gets one too.
    expect(counters(g, bf(g, 'fra-cadet-token')[0]!)).toBe(1);
    // Only your creatures.
    expect(counters(g, g.id('p2', 'serra-angel'))).toBe(0);
  });

  it('Proctor of Potential surveils when it or another creature you control enters', () => {
    const g = game({
      p1: {
        hand: ['proctor-of-potential', 'savannah-lions'],
        battlefield: ['plains', 'plains', 'island'],
      },
    });
    done(cast(g, 'proctor-of-potential'));
    expect(g.state.turn.scriedOrSurveilled).toContain('p1');
    g.state.turn.scriedOrSurveilled = [];
    done(cast(g, 'savannah-lions'));
    expect(g.state.turn.scriedOrSurveilled).toContain('p1');
    expect(pt(g, g.id('p1', 'proctor-of-potential'))).toEqual([3, 1]);
  });

  it('Proctor of Potential: returns from the graveyard with a finality counter, only after scrying or surveilling', () => {
    const g = game({
      p1: { graveyard: ['proctor-of-potential'], battlefield: ['plains', 'island', 'plains'] },
    });
    const p = g.id('p1', 'proctor-of-potential', 'graveyard');
    expect(canActivate(g, p)).toBe(false);
    g.state.turn.scriedOrSurveilled = ['p1'];
    expect(canActivate(g, p)).toBe(true);
    activate(g, p, 1);
    done(g);
    const back = g.id('p1', 'proctor-of-potential');
    expect(g.obj(back).counters?.finality).toBe(1);
  });

  it('Proctor of Potential: a player who scried is not enough if it was the opponent', () => {
    const g = game({
      p1: { graveyard: ['proctor-of-potential'], battlefield: ['plains', 'island'] },
    });
    g.state.turn.scriedOrSurveilled = ['p2'];
    expect(canActivate(g, g.id('p1', 'proctor-of-potential', 'graveyard'))).toBe(false);
  });

  it('a real scry or surveil records that you did it this turn, and it resets next turn', () => {
    const g = game({
      p1: { hand: ['fatehold-chronologist'], battlefield: [...n('plains', 3), ...n('island', 3)] },
    });
    expect(g.state.turn.scriedOrSurveilled).toBeUndefined();
    done(cast(g, 'fatehold-chronologist'));
    castCopy(g, g.id('p1', 'fatehold-chronologist'));
    done(g);
    expect(g.state.turn.scriedOrSurveilled).toEqual(['p1']);
    passTo(g, 'main1', 'p2');
    expect(g.state.turn.scriedOrSurveilled ?? []).toEqual([]);
  });

  it('surveilling with an empty library still counts', () => {
    const g = game({
      p1: {
        hand: ['fatehold-chronologist'],
        battlefield: [...n('plains', 3), ...n('island', 3)],
        library: [],
      },
    });
    done(cast(g, 'fatehold-chronologist'));
    castCopy(g, g.id('p1', 'fatehold-chronologist'));
    done(g);
    expect(g.state.turn.scriedOrSurveilled).toContain('p1');
  });
});

describe('blue-black: mill and threshold', () => {
  it('Paradox Shaper becomes prepared at your upkeep; Omit Variables mills three', () => {
    const g = game({ p1: { battlefield: ['paradox-shaper', 'island', 'swamp'] } });
    const s = g.id('p1', 'paradox-shaper');
    expect(g.obj(s).prepared).toBeUndefined();
    passTo(g, 'upkeep');
    done(g);
    expect(g.obj(s).prepared).toBeDefined();
    toStep(g, 'main1');
    done(g);
    const before = g.state.players.p1.graveyard.length;
    castCopy(g, s);
    done(g);
    expect(g.state.players.p1.graveyard.length).toBe(before + 3);
    expect(g.obj(s).prepared).toBeUndefined();
  });

  it('Paradox Shaper: {2} puts a card from your graveyard on the bottom of your library', () => {
    const g = game({
      p1: {
        battlefield: ['paradox-shaper', 'island', 'swamp'],
        graveyard: ['serra-angel', 'shock'],
      },
    });
    const s = g.id('p1', 'paradox-shaper');
    const target = g.id('p1', 'serra-angel', 'graveyard');
    activate(g, s, 1, [g.ref(target)]);
    done(g);
    expect(gy(g)).toEqual(['shock']);
    const lib = g.state.players.p1.library;
    expect(g.obj(lib[lib.length - 1]!).defId).toBe('serra-angel');
  });

  it('Paradox Shaper: it does not become prepared again while it is prepared', () => {
    const g = game({ p1: { hand: ['paradox-shaper'], battlefield: [...n('island', 2), 'swamp'] } });
    done(cast(g, 'paradox-shaper'));
    const s = g.id('p1', 'paradox-shaper');
    // It didn't enter prepared.
    expect(g.obj(s).prepared).toBeUndefined();
    passTo(g, 'upkeep');
    done(g);
    const copy = g.obj(s).prepared;
    expect(copy).toBeDefined();
    passTo(g, 'upkeep', 'p2');
    passTo(g, 'upkeep');
    done(g);
    expect(g.obj(s).prepared).toBe(copy);
  });

  it('Theorix Metamage: enters prepared; threshold gives +1/+0 and flying at seven cards in the graveyard', () => {
    const g = game({
      p1: { hand: ['theorix-metamage'], battlefield: [...n('island', 3), 'swamp'] },
    });
    done(cast(g, 'theorix-metamage'));
    const m = g.id('p1', 'theorix-metamage');
    expect(g.obj(m).prepared).toBeDefined();
    expect(pt(g, m)).toEqual([2, 3]);
    expect(keywords(g, m)).not.toContain('flying');
    for (let i = 0; i < 6; i++)
      g.state.players.p1.graveyard.push(g.state.players.p1.library.shift()!);
    for (const id of g.state.players.p1.graveyard) g.obj(id).zone = 'graveyard';
    expect(pt(g, m)).toEqual([2, 3]);
    castCopy(g, m);
    done(g);
    // Omit Variables milled three more: now nine cards.
    expect(g.state.players.p1.graveyard.length).toBeGreaterThanOrEqual(7);
    expect(pt(g, m)).toEqual([3, 3]);
    expect(keywords(g, m)).toContain('flying');
  });

  it('Null Summoner: exiles a nonland card from the opponent’s hand when you cast it', () => {
    const g = game({
      p1: { hand: ['null-summoner'], battlefield: ['island', 'swamp', 'forest', 'forest'] },
      p2: { hand: ['forest', 'serra-angel'] },
    });
    done(cast(g, 'null-summoner'));
    expect(hand(g, 'p2')).toEqual(['forest']);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });

  it('Null Summoner: no ability when it did not enter by being cast', () => {
    const g = game({
      p1: {
        graveyard: ['null-summoner'],
        battlefield: [...n('swamp', 9)],
        hand: ['rise-of-the-dark-realms'],
      },
      p2: { hand: ['serra-angel'] },
    });
    // Rise of the Dark Realms puts it onto the battlefield without casting it.
    done(cast(g, 'rise-of-the-dark-realms'));
    expect(bf(g, 'null-summoner')).toHaveLength(1);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(exile(g, 'p2')).toEqual([]);
  });

  it('Null Summoner: the exiled card can be cast only with threshold, with mana of any type', () => {
    const g = game({
      p1: {
        hand: ['null-summoner'],
        battlefield: ['island', 'swamp', ...n('forest', 7)],
        graveyard: n('forest', 6),
      },
      p2: { hand: ['serra-angel'] },
    });
    done(cast(g, 'null-summoner'));
    const angel = g.id('p2', 'serra-angel', 'exile');
    const canCast = () =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === angel && !a.free);
    // Six cards in the graveyard: not enough.
    expect(canCast()).toBe(false);
    g.state.players.p1.graveyard.push(g.id('p1', 'forest', 'library'));
    const moved = g.state.players.p1.library.shift()!;
    g.state.players.p1.graveyard.push(moved);
    g.obj(moved).zone = 'graveyard';
    expect(g.state.players.p1.graveyard.length).toBeGreaterThanOrEqual(7);
    expect(canCast()).toBe(true);
    // Mana of any type: five forests pay for {3}{W}{W}.
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: angel,
      targets: [],
    });
    done(g);
    expect(bf(g, 'serra-angel', 'p1')).toHaveLength(1);
  });

  it('Null Summoner: threshold must still hold later; with fewer cards it can’t be cast again', () => {
    const g = game({
      p1: {
        hand: ['null-summoner'],
        battlefield: ['island', 'swamp', ...n('forest', 7)],
        graveyard: n('forest', 7),
      },
      p2: { hand: ['serra-angel'] },
    });
    done(cast(g, 'null-summoner'));
    const angel = g.id('p2', 'serra-angel', 'exile');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === angel)).toBe(true);
    g.state.players.p1.graveyard.pop();
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === angel)).toBe(false);
  });

  it('Theorix Charm: the opponent may pay {2} to keep the spell', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain', 'mountain', 'mountain'] },
      p2: { hand: ['theorix-charm'], battlefield: ['island', 'swamp'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    cast(g, 'theorix-charm', [g.ref(g.state.stack[0]!.id)], { mode: 0 });
    g.pass();
    g.pass();
    // p1 is asked to pay {2}.
    expect(g.decision.kind).toBe('payOrCounter');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g);
    expect(g.life('p2')).toBe(18);
  });

  it('Theorix Charm: counter mode counters a noncreature spell (no payment possible)', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['theorix-charm'], battlefield: ['island', 'swamp'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    cast(g, 'theorix-charm', [g.ref(g.state.stack[0]!.id)], { mode: 0 });
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(gy(g, 'p1')).toContain('shock');
  });

  it('Theorix Charm: the counter mode can’t target a creature spell', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'llanowar-elves'] },
      p2: { hand: ['theorix-charm'], battlefield: ['island', 'swamp'] },
    });
    cast(g, 'savannah-lions');
    g.pass();
    const legal = g.legal();
    expect(
      legal.some(
        (a) =>
          a.type === 'castSpell' && a.card === g.id('p2', 'theorix-charm', 'hand') && a.mode === 0,
      ),
    ).toBe(false);
    expect(
      legal.some(
        (a) =>
          a.type === 'castSpell' && a.card === g.id('p2', 'theorix-charm', 'hand') && a.mode === 1,
      ),
    ).toBe(true);
  });

  it('Theorix Charm: -2/-2 kills a small creature', () => {
    const g = game({
      p1: { hand: ['theorix-charm'], battlefield: ['island', 'swamp', 'savannah-lions'] },
    });
    done(cast(g, 'theorix-charm', [g.ref(g.id('p1', 'savannah-lions'))], { mode: 1 }));
    expect(gy(g)).toContain('savannah-lions');
  });

  it('Theorix Charm: mill three cards, then draw a card', () => {
    const g = game({ p1: { hand: ['theorix-charm'], battlefield: ['island', 'swamp'] } });
    done(cast(g, 'theorix-charm', [], { mode: 2 }));
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual([
      'forest',
      'forest',
      'forest',
      'theorix-charm',
    ]);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Recursive Recruitment: two Cadets from your hand, no counters', () => {
    const g = game({
      p1: { hand: ['recursive-recruitment'], battlefield: ['island', 'swamp', 'island', 'swamp'] },
    });
    done(cast(g, 'recursive-recruitment'));
    const cadets = bf(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(2);
    for (const c of cadets) expect(pt(g, c)).toEqual([2, 2]);
    expect(gy(g)).toContain('recursive-recruitment');
  });

  it('Recursive Recruitment: flashback puts a +1/+1 counter on each Cadet for every three cards in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 4), ...n('swamp', 4)],
        graveyard: ['recursive-recruitment', ...n('forest', 6)],
      },
    });
    const card = g.id('p1', 'recursive-recruitment', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    done(g);
    const cadets = bf(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(2);
    // Six forests are left in the graveyard while it resolves: two counters each.
    for (const c of cadets) expect(pt(g, c)).toEqual([4, 4]);
    // Flashback exiles it.
    expect(exile(g)).toContain('recursive-recruitment');
  });

  it('Recursive Recruitment: flashback with fewer than three other cards adds no counters; rounds down', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 4), ...n('swamp', 4)],
        graveyard: ['recursive-recruitment', ...n('forest', 5)],
      },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'recursive-recruitment', 'graveyard'),
      targets: [],
    });
    done(g);
    for (const c of bf(g, 'fra-cadet-token')) expect(pt(g, c)).toEqual([3, 3]);
  });
});

describe('Uldaros Theorix', () => {
  const setup = (graveyard: string[]) =>
    game({
      p1: {
        hand: ['uldaros-theorix'],
        battlefield: ['island', 'swamp', 'swamp', ...n('forest', 3)],
        graveyard,
      },
      p2: { life: 20 },
    });
  const pickTargets = (g: GameDriver, ...ids: string[]) => {
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    let picked: string[] = [];
    for (const id of ids) {
      const next = g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === picked.length + 1 &&
            a.targets.some((t) => 'object' in t && t.object.id === id),
        );
      expect(next, `can pick ${id}`).toBeDefined();
      g.do(next!);
      picked = [...picked, id];
    }
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: picked.map((id) => g.ref(id)),
    });
  };

  it('offers one card of each card type, one at a time', () => {
    const g = setup(['serra-angel', 'savannah-lions', 'shock', 'sol-ring', 'duress', 'pacifism']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    const shock = g.id('p1', 'shock', 'graveyard');
    const ring = g.id('p1', 'sol-ring', 'graveyard');
    const duress = g.id('p1', 'duress', 'graveyard');
    const pacifism = g.id('p1', 'pacifism', 'graveyard');
    const offered = (picked: number) =>
      g
        .legal()
        .flatMap((a) =>
          a.type === 'chooseTargets' && a.targets.length === picked + 1
            ? a.targets.flatMap((t, i) => (i === picked && 'object' in t ? [t.object.id] : []))
            : [],
        );
    // First pick: any of the six cards (and stopping with none is allowed).
    expect(new Set(offered(0))).toEqual(new Set([angel, lions, shock, ring, duress, pacifism]));
    expect(g.legal().some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    pickTargets(g, angel);
  });

  it('after one creature card is picked, no other creature card is offered, but every other type is', () => {
    const g = setup(['serra-angel', 'savannah-lions', 'shock', 'sol-ring', 'duress', 'pacifism']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    const next = g
      .legal()
      .flatMap((a) =>
        a.type === 'chooseTargets' && a.targets.length === 2 && 'object' in a.targets[1]!
          ? [a.targets[1].object.id]
          : [],
      );
    expect(next).not.toContain(lions);
    expect(next).not.toContain(angel);
    expect(next).toHaveLength(4);
  });

  it('an artifact creature may stand for either type, leaving the other type to another card', () => {
    // Sol Ring (artifact) and Serra Angel (creature) are taken; a card that is both would take the free type.
    const g = setup(['serra-angel', 'sol-ring']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const ring = g.id('p1', 'sol-ring', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    const next = g
      .legal()
      .flatMap((a) =>
        a.type === 'chooseTargets' && a.targets.length === 2 && 'object' in a.targets[1]!
          ? [a.targets[1].object.id]
          : [],
      );
    expect(next).toEqual([ring]);
  });

  it('exiles the chosen cards, copies them and casts them free up to total mana value 6; permanents become tokens', () => {
    const g = setup(['serra-angel', 'savannah-lions', 'shock', 'sol-ring']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const shock = g.id('p1', 'shock', 'graveyard');
    const ring = g.id('p1', 'sol-ring', 'graveyard');
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    // Pick the angel: the other creature card isn't offered afterwards.
    const first = g
      .legal()
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.length === 1 &&
          'object' in a.targets[0]! &&
          a.targets[0].object.id === angel,
      )!;
    g.do(first);
    const second = g.legal().flatMap((a) => (a.type === 'chooseTargets' ? [a] : []));
    const offeredIds = second.flatMap((a) =>
      a.targets.length === 2 && 'object' in a.targets[1]! ? [a.targets[1].object.id] : [],
    );
    expect(offeredIds).not.toContain(lions);
    expect(offeredIds).toEqual(expect.arrayContaining([shock, ring]));
    g.do(
      second.find(
        (a) =>
          a.targets.length === 2 && 'object' in a.targets[1]! && a.targets[1].object.id === shock,
      )!,
    );
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel), g.ref(shock)] });
    // Resolve the ability: the copies are offered.
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    // The originals are exiled; the lions stay.
    expect(exile(g)).toEqual(expect.arrayContaining(['serra-angel', 'shock']));
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions', 'sol-ring']));
    // Cast the angel copy (MV 5), then the Shock copy (MV 1) at the opponent.
    const castable = () => g.legal().filter((a) => a.type === 'castSpell');
    const angelCast = castable().find(
      (a) => a.type === 'castSpell' && g.obj(a.card).defId === 'serra-angel',
    )!;
    g.do(angelCast);
    expect(g.decision.kind).toBe('castFree');
    const shockCast = castable().find(
      (a) =>
        a.type === 'castSpell' &&
        g.obj(a.card).defId === 'shock' &&
        a.targets[0] &&
        'player' in a.targets[0] &&
        a.targets[0].player === 'p2',
    )!;
    g.do(shockCast);
    done(g);
    expect(g.life('p2')).toBe(18);
    const angels = bf(g, 'serra-angel');
    expect(angels).toHaveLength(1);
    expect(g.obj(angels[0]!).isToken).toBe(true);
    // No copies are left lying around in exile, and the original cards are still exiled.
    expect(exile(g)).toEqual(expect.arrayContaining(['serra-angel', 'shock']));
    expect(exile(g)).toHaveLength(2);
    expect(Object.values(g.state.objects).filter((o) => o.spellCopyCard)).toHaveLength(0);
  });

  it('only offers copies that still fit in the total mana value', () => {
    const g = setup(['serra-angel', 'shock', 'sol-ring']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const shock = g.id('p1', 'shock', 'graveyard');
    const ring = g.id('p1', 'sol-ring', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel), g.ref(shock)] });
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(angel), g.ref(shock), g.ref(ring)],
    });
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(angel), g.ref(shock), g.ref(ring)],
    });
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    const names = () =>
      new Set(g.legal().flatMap((a) => (a.type === 'castSpell' ? [g.obj(a.card).defId] : [])));
    expect(names()).toEqual(new Set(['serra-angel', 'shock', 'sol-ring']));
    g.do(g.legal().find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'serra-angel')!);
    // 5 spent: only the 1-mana cards fit; one more, then nothing else fits.
    expect(names()).toEqual(new Set(['shock', 'sol-ring']));
    g.do(g.legal().find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'sol-ring')!);
    // 6 spent: the Shock copy no longer fits, so the choice is over and the copy is gone.
    expect(g.decision.kind).not.toBe('castFree');
    expect(
      Object.values(g.state.objects).filter((o) => o.spellCopyCard && o.zone === 'exile'),
    ).toHaveLength(0);
    done(g);
    expect(bf(g, 'sol-ring')).toHaveLength(1);
    expect(g.obj(bf(g, 'sol-ring')[0]!).isToken).toBe(true);
    expect(bf(g, 'serra-angel')).toHaveLength(1);
    expect(g.life('p2')).toBe(20);
  });

  it('copies not cast cease to exist, and may be declined', () => {
    const g = setup(['shock', 'sol-ring']);
    cast(g, 'uldaros-theorix');
    g.pass();
    g.pass();
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(g.id('p1', 'shock', 'graveyard'))],
    });
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [g.ref(g.id('p1', 'shock', 'graveyard'))],
    });
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(Object.values(g.state.objects).filter((o) => o.spellCopyCard)).toHaveLength(0);
    expect(exile(g)).toEqual(['shock']);
  });

  // Reality Fracture (17a fixes): free casts offer the card's additional costs, as a normal cast would.
  describe('additional costs of the free casts', () => {
    const copiesOf = (g: GameDriver, defId: string) =>
      g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
    const reachCopies = (g: GameDriver, card: string) => {
      cast(g, 'uldaros-theorix');
      g.pass();
      g.pass();
      g.do({
        type: 'chooseTargets',
        player: 'p1',
        targets: [g.ref(g.id('p1', card, 'graveyard'))],
      });
      g.do({
        type: 'chooseTargets',
        player: 'p1',
        targets: [g.ref(g.id('p1', card, 'graveyard'))],
      });
      g.pass();
      g.pass();
      expect(g.decision.kind).toBe('castFree');
    };

    it('Eaten Alive: the creature to sacrifice is chosen (the {3}{B} option can not be paid)', () => {
      const g = game({
        p1: {
          hand: ['uldaros-theorix'],
          battlefield: ['island', 'swamp', 'swamp', ...n('forest', 3), 'savannah-lions'],
          graveyard: ['eaten-alive'],
        },
        p2: { battlefield: ['serra-angel'] },
      });
      reachCopies(g, 'eaten-alive');
      const angel = g.id('p2', 'serra-angel');
      const lions = g.id('p1', 'savannah-lions');
      const casts = copiesOf(g, 'eaten-alive').filter(
        (a) => a.type === 'castSpell' && JSON.stringify(a.targets).includes(angel),
      );
      // Every offered way sacrifices a creature: Uldaros or the Lions.
      expect(casts.every((a) => a.type === 'castSpell' && a.sacrifice)).toBe(true);
      const sacrificed = new Set(casts.map((a) => (a.type === 'castSpell' ? a.sacrifice : '')));
      expect(sacrificed).toEqual(new Set([lions, g.id('p1', 'uldaros-theorix')]));
      g.do(casts.find((a) => a.type === 'castSpell' && a.sacrifice === lions)!);
      done(g);
      expect(bf(g, 'savannah-lions')).toHaveLength(0);
      expect(bf(g, 'serra-angel')).toHaveLength(0);
      expect(bf(g, 'uldaros-theorix')).toHaveLength(1);
    });

    it('Feed the Cycle: forage with the graveyard (choosing which three cards), or pay {B}', () => {
      const g = game({
        p1: {
          hand: ['uldaros-theorix'],
          battlefield: [...n('forest', 3), 'island', ...n('swamp', 4)],
          graveyard: ['feed-the-cycle', 'duress', 'pacifism', 'forest', 'plains'],
        },
        p2: { battlefield: ['serra-angel'] },
      });
      reachCopies(g, 'feed-the-cycle');
      const angel = g.id('p2', 'serra-angel');
      const casts = copiesOf(g, 'feed-the-cycle').filter(
        (a) => a.type === 'castSpell' && JSON.stringify(a.targets).includes(angel),
      );
      // Forage (the graveyard has the cards) or pay {B}: both are offered.
      expect(casts.some((a) => a.type === 'castSpell' && a.forage === 'graveyard')).toBe(true);
      expect(casts.some((a) => a.type === 'castSpell' && !a.forage)).toBe(true);
      g.do(casts.find((a) => a.type === 'castSpell' && a.forage === 'graveyard')!);
      expect(g.decision.kind).toBe('forageExile');
      for (const card of ['pacifism', 'forest', 'plains'])
        g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', card, 'graveyard') });
      // The free cast goes on once the forage is paid.
      expect(g.decision.kind).not.toBe('forageExile');
      done(g);
      expect(exile(g)).toEqual(
        expect.arrayContaining(['feed-the-cycle', 'pacifism', 'forest', 'plains']),
      );
      expect(gy(g)).toContain('duress');
      expect(bf(g, 'serra-angel')).toHaveLength(0);
    });

    it('a kicker is an additional cost: not offered if it can not be paid', () => {
      const g = game({
        p1: {
          hand: ['uldaros-theorix'],
          battlefield: ['island', 'swamp', 'swamp', ...n('forest', 3)],
          graveyard: ['burst-lightning'],
        },
      });
      reachCopies(g, 'burst-lightning');
      const casts = copiesOf(g, 'burst-lightning');
      expect(casts.length).toBeGreaterThan(0);
      expect(casts.some((a) => a.type === 'castSpell' && a.kicked)).toBe(false);
    });

    it('a kicker is offered when the lands to pay it are there', () => {
      const g = game({
        p1: {
          hand: ['uldaros-theorix'],
          battlefield: ['island', 'swamp', 'swamp', ...n('forest', 3), ...n('mountain', 4)],
          graveyard: ['burst-lightning'],
        },
      });
      reachCopies(g, 'burst-lightning');
      const kicked = copiesOf(g, 'burst-lightning').filter(
        (a) => a.type === 'castSpell' && a.kicked,
      );
      expect(kicked.length).toBeGreaterThan(0);
      g.do(
        kicked.find(
          (a) =>
            a.type === 'castSpell' &&
            a.targets[0] &&
            'player' in a.targets[0] &&
            a.targets[0].player === 'p2',
        )!,
      );
      done(g);
      // Kicked: 4 damage, and the four Mountains were tapped for the kicker.
      expect(g.life('p2')).toBe(16);
      expect(
        g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
      ).toHaveLength(0);
    });
  });

  it('does nothing when it did not enter by being cast', () => {
    const g = game({
      p1: {
        hand: ['rise-of-the-dark-realms'],
        battlefield: n('swamp', 9),
        graveyard: ['uldaros-theorix', 'shock'],
      },
    });
    done(cast(g, 'rise-of-the-dark-realms'));
    expect(bf(g, 'uldaros-theorix')).toHaveLength(1);
    expect(g.state.stack).toHaveLength(0);
    expect(g.decision.kind).toBe('priority');
    expect(gy(g)).toEqual(expect.arrayContaining(['shock', 'rise-of-the-dark-realms']));
  });
});

describe('black-red: noncombat damage', () => {
  it('Grim Repriser has prowess', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['grim-repriser', 'mountain'] },
    });
    const r = g.id('p1', 'grim-repriser');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, r)).toEqual([3, 3]);
  });

  it('Grim Repriser returns from the graveyard with a finality counter only if an opponent was dealt noncombat damage', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        graveyard: ['grim-repriser'],
        battlefield: ['mountain', 'swamp', 'mountain'],
      },
    });
    const r = g.id('p1', 'grim-repriser', 'graveyard');
    expect(canActivate(g, r)).toBe(false);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
    expect(canActivate(g, r)).toBe(true);
    activate(g, r, 1);
    done(g);
    const back = g.id('p1', 'grim-repriser');
    expect(g.obj(back).counters?.finality).toBe(1);
  });

  it('Grim Repriser: combat damage doesn’t count, nor damage to yourself or a creature', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        graveyard: ['grim-repriser'],
        battlefield: ['mountain', 'swamp', 'mountain', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const r = g.id('p1', 'grim-repriser', 'graveyard');
    done(cast(g, 'shock', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(canActivate(g, r)).toBe(false);
    done(cast(g, 'shock', [{ player: 'p1' }]));
    expect(canActivate(g, r)).toBe(false);
    // Combat damage to the opponent.
    toStep(g, 'declareAttackers');
    g.attack(g.id('p1', 'savannah-lions'));
    for (let i = 0; i < 10 && g.state.turn.step !== 'endCombat'; i++) {
      if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.decision.player });
      else g.pass();
    }
    expect(g.life('p2')).toBe(18);
    expect(g.state.turn.noncombatDamaged ?? []).toEqual(['p1']);
  });

  it('noncombat damage is remembered only for the turn it was dealt', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        graveyard: ['grim-repriser'],
        battlefield: ['mountain', 'swamp', 'mountain'],
      },
    });
    done(cast(g, 'shock', [{ player: 'p2' }]));
    passTo(g, 'main1', 'p2');
    expect(g.state.turn.noncombatDamaged ?? []).toEqual([]);
  });

  it('Whiplash Wordsmith enters prepared and has flying and haste only after an opponent was dealt noncombat damage', () => {
    const g = game({
      p1: {
        hand: ['whiplash-wordsmith'],
        battlefield: ['mountain', 'swamp', 'mountain', 'swamp', 'mountain'],
      },
    });
    done(cast(g, 'whiplash-wordsmith'));
    const w = g.id('p1', 'whiplash-wordsmith');
    expect(g.obj(w).prepared).toBeDefined();
    expect(keywords(g, w)).not.toContain('flying');
    expect(keywords(g, w)).not.toContain('haste');
    castCopy(g, w, [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(keywords(g, w)).toEqual(expect.arrayContaining(['flying', 'haste']));
    expect(pt(g, w)).toEqual([3, 3]);
  });

  it('Stingerquill Voxmancer becomes prepared at your upkeep; Vicious Verse deals 1 to an opponent', () => {
    const g = game({ p1: { battlefield: ['stingerquill-voxmancer', 'mountain'] } });
    const v = g.id('p1', 'stingerquill-voxmancer');
    expect(g.obj(v).prepared).toBeUndefined();
    passTo(g, 'upkeep');
    done(g);
    expect(g.obj(v).prepared).toBeDefined();
    toStep(g, 'main1');
    done(g);
    castCopy(g, v, [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(v).prepared).toBeUndefined();
  });

  it('Vicious Verse can’t target you, only an opponent', () => {
    const g = game({
      p1: { hand: ['stingerquill-voxmancer'], battlefield: ['mountain', 'swamp'] },
    });
    done(cast(g, 'stingerquill-voxmancer'));
    const v = g.id('p1', 'stingerquill-voxmancer');
    passTo(g, 'upkeep');
    done(g);
    toStep(g, 'main1');
    done(g);
    const copy = g.obj(v).prepared!;
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === copy)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toEqual([{ player: 'p2' }]);
  });

  it('Ingris Stingerquill: each attacking creature deals 1 damage to each opponent', () => {
    const g = game({
      p1: { battlefield: ['ingris-stingerquill', 'savannah-lions', 'savannah-lions'] },
    });
    toStep(g, 'declareAttackers');
    g.attack(...all(g, 'savannah-lions'));
    for (let i = 0; i < 6 && g.state.stack.length === 0; i++) g.pass();
    done(g);
    // Two triggers resolved: 2 life lost before combat damage.
    expect(g.life('p2')).toBe(18);
  });

  it('Ingris Stingerquill triggers for itself, and the damage comes from the attacker', () => {
    const g = game({ p1: { battlefield: ['ingris-stingerquill'] } });
    toStep(g, 'declareAttackers');
    g.attack(g.id('p1', 'ingris-stingerquill'));
    done(g);
    expect(g.life('p2')).toBeLessThanOrEqual(19);
    expect(g.state.turn.noncombatDamaged).toContain('p2');
  });

  it('Ingris Stingerquill: {4} creates a Cadet, then your creatures gain haste', () => {
    const g = game({
      p1: {
        battlefield: [
          'ingris-stingerquill',
          { card: 'savannah-lions', sick: true },
          ...n('swamp', 4),
        ],
      },
    });
    activate(g, g.id('p1', 'ingris-stingerquill'), 1);
    done(g);
    const cadets = bf(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(1);
    expect(keywords(g, cadets[0]!)).toContain('haste');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('haste');
  });

  it('Stinging Vitriol: 2 damage to the opponent, who reveals their hand; you choose a nonland card to discard', () => {
    const g = game({
      p1: { hand: ['stinging-vitriol'], battlefield: ['swamp', 'mountain'] },
      p2: { hand: ['forest', 'serra-angel', 'forest'] },
    });
    done(cast(g, 'stinging-vitriol', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g, 'p2')).toEqual(['forest', 'forest']);
  });

  it('Stinging Vitriol with only lands in their hand discards nothing', () => {
    const g = game({
      p1: { hand: ['stinging-vitriol'], battlefield: ['swamp', 'mountain'] },
      p2: { hand: ['forest', 'forest'] },
    });
    done(cast(g, 'stinging-vitriol', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
    expect(hand(g, 'p2')).toHaveLength(2);
  });

  it('Stingerquill Charm: 3 damage to any target', () => {
    const g = game({ p1: { hand: ['stingerquill-charm'], battlefield: ['swamp', 'mountain'] } });
    done(cast(g, 'stingerquill-charm', [{ player: 'p2' }], { mode: 0 }));
    expect(g.life('p2')).toBe(17);
  });

  it('Stingerquill Charm: a creature gains first strike and deathtouch', () => {
    const g = game({
      p1: { hand: ['stingerquill-charm'], battlefield: ['swamp', 'mountain', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'stingerquill-charm', [g.ref(lions)], { mode: 1 }));
    expect(keywords(g, lions)).toEqual(expect.arrayContaining(['firstStrike', 'deathtouch']));
  });

  it('Stingerquill Charm: a Cadet token with haste', () => {
    const g = game({ p1: { hand: ['stingerquill-charm'], battlefield: ['swamp', 'mountain'] } });
    done(cast(g, 'stingerquill-charm', [], { mode: 2 }));
    const cadets = bf(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(1);
    expect(keywords(g, cadets[0]!)).toContain('haste');
  });
});

describe('red-green: Heartwood and artifacts', () => {
  const heartwood = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => bf(g, 'fra-heartwood-token', p);

  it('Heartwood taps for {R} or {G}', () => {
    const g = game({ p1: { hand: ['savannah-lions', 'llanowar-elves'] } });
    const def = cardDb.get('fra-heartwood-token')!;
    expect(
      def.abilities
        .filter((a) => a.kind === 'mana')
        .map((a) => (a as { produces: string }).produces),
    ).toEqual(['R', 'G']);
    expect(g).toBeDefined();
  });

  it('Aerid Konstrari makes a Heartwood when it enters and when it dies', () => {
    const g = game({
      p1: {
        hand: ['aerid-konstrari', 'shock'],
        battlefield: ['mountain', 'forest', 'forest', 'forest'],
      },
    });
    done(cast(g, 'aerid-konstrari'));
    const a = g.id('p1', 'aerid-konstrari');
    expect(keywords(g, a)).toContain('flying');
    expect(heartwood(g)).toHaveLength(1);
    // Kill it with damage.
    g.obj(a).damage = 4;
    g.pass();
    done(g);
    expect(gy(g)).toContain('aerid-konstrari');
    expect(heartwood(g)).toHaveLength(2);
  });

  it('Aerid Konstrari: {6} makes a Heartwood, then gets +X/+0 for the artifacts you control', () => {
    const g = game({
      p1: { battlefield: ['aerid-konstrari', 'sol-ring', ...n('forest', 6)] },
    });
    const a = g.id('p1', 'aerid-konstrari');
    activate(g, a, 2);
    done(g);
    expect(heartwood(g)).toHaveLength(1);
    // Sol Ring and the new Heartwood: +2/+0.
    expect(pt(g, a)).toEqual([7, 4]);
  });

  it('Woodwork Prodigy becomes prepared at your upkeep; Soul Tether makes a Heartwood', () => {
    const g = game({ p1: { battlefield: ['woodwork-prodigy', 'mountain', 'forest', 'forest'] } });
    const w = g.id('p1', 'woodwork-prodigy');
    passTo(g, 'upkeep');
    done(g);
    expect(g.obj(w).prepared).toBeDefined();
    toStep(g, 'main1');
    done(g);
    castCopy(g, w);
    done(g);
    expect(heartwood(g)).toHaveLength(1);
    expect(g.obj(w).prepared).toBeUndefined();
  });

  it('Konstrari Improviser enters prepared; Soul Tether makes a Heartwood', () => {
    const g = game({
      p1: { hand: ['konstrari-improviser'], battlefield: ['mountain', ...n('forest', 4)] },
    });
    done(cast(g, 'konstrari-improviser'));
    const k = g.id('p1', 'konstrari-improviser');
    expect(g.obj(k).prepared).toBeDefined();
    expect(pt(g, k)).toEqual([2, 2]);
    castCopy(g, k);
    done(g);
    expect(heartwood(g)).toHaveLength(1);
  });

  it('Tenured Tethermage: sacrifice a land to make two tapped Heartwoods', () => {
    const g = game({
      p1: { hand: ['tenured-tethermage'], battlefield: ['mountain', 'forest', 'forest', 'plains'] },
    });
    done(cast(g, 'tenured-tethermage'), { accept: true });
    expect(heartwood(g)).toHaveLength(2);
    for (const h of heartwood(g)) expect(g.obj(h).tapped).toBe(true);
    expect(
      g.state.battlefield.filter(
        (id) =>
          g.obj(id).defId === 'forest' ||
          g.obj(id).defId === 'mountain' ||
          g.obj(id).defId === 'plains',
      ),
    ).toHaveLength(3);
  });

  it('Tenured Tethermage: declining the sacrifice makes nothing', () => {
    const g = game({
      p1: { hand: ['tenured-tethermage'], battlefield: ['mountain', 'forest', 'forest'] },
    });
    done(cast(g, 'tenured-tethermage'), { accept: false });
    expect(heartwood(g)).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(2);
  });

  it('Tenured Tethermage: tap two untapped artifacts for two +1/+1 counters, choosing which', () => {
    const g = game({
      p1: {
        battlefield: [
          'tenured-tethermage',
          'sol-ring',
          'sol-ring',
          { card: 'sol-ring', tapped: true },
        ],
      },
    });
    const t = g.id('p1', 'tenured-tethermage');
    const rings = all(g, 'sol-ring').filter((id) => !g.obj(id).tapped);
    expect(rings).toHaveLength(2);
    expect(pt(g, t)).toEqual([1, 1]);
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === t) as Extract<
      Action,
      { type: 'activateAbility' }
    >[];
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) expect(a.tapArtifacts).toHaveLength(2);
    activate(g, t, 1, [], { tapArtifacts: rings });
    done(g);
    for (const r of rings) expect(g.obj(r).tapped).toBe(true);
    expect(pt(g, t)).toEqual([3, 3]);
    // Nothing untapped is left: it can't be activated again.
    expect(canActivate(g, t)).toBe(false);
  });

  it('Tenured Tethermage: one untapped artifact is not enough', () => {
    const g = game({ p1: { battlefield: ['tenured-tethermage', 'sol-ring'] } });
    expect(canActivate(g, g.id('p1', 'tenured-tethermage'))).toBe(false);
  });

  it('Tenured Tethermage: the artifacts tapped can be chosen from artifacts that differ', () => {
    const g = game({
      p1: {
        battlefield: [
          'tenured-tethermage',
          'sol-ring',
          'fra-heartwood-token',
          'fra-heartwood-token',
        ],
      },
    });
    const t = g.id('p1', 'tenured-tethermage');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === t) as Extract<
      Action,
      { type: 'activateAbility' }
    >[];
    const kinds = new Set(
      acts.map((a) =>
        a
          .tapArtifacts!.map((id) => g.obj(id).defId)
          .sort()
          .join('+'),
      ),
    );
    expect(kinds).toEqual(
      new Set(['fra-heartwood-token+sol-ring', 'fra-heartwood-token+fra-heartwood-token']),
    );
  });

  it('Konstrari Charm: 6 damage to a creature with flying only', () => {
    const g = game({
      p1: { hand: ['konstrari-charm'], battlefield: ['mountain', 'forest'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const legal = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.mode === 0)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(legal).toEqual([g.ref(g.id('p2', 'serra-angel'))]);
    done(cast(g, 'konstrari-charm', [g.ref(g.id('p2', 'serra-angel'))], { mode: 0 }));
    expect(gy(g, 'p2')).toContain('serra-angel');
  });

  it('Konstrari Charm: two +1/+1 counters and trample', () => {
    const g = game({
      p1: { hand: ['konstrari-charm'], battlefield: ['mountain', 'forest', 'savannah-lions'] },
    });
    const l = g.id('p1', 'savannah-lions');
    done(cast(g, 'konstrari-charm', [g.ref(l)], { mode: 1 }));
    expect(counters(g, l)).toBe(2);
    expect(keywords(g, l)).toContain('trample');
  });

  it('Konstrari Charm: add {C}{C}{C}', () => {
    const g = game({
      p1: { hand: ['konstrari-charm'], battlefield: ['mountain', 'forest'] },
    });
    cast(g, 'konstrari-charm', [], { mode: 2 });
    g.pass();
    g.pass();
    expect(g.state.players.p1.pool).toHaveLength(3);
    expect(g.state.players.p1.pool!.every((m) => m.produces[0] === 'C')).toBe(true);
  });

  it('Craftwork Crusher has trample; choose two: 4 damage and a Cadet', () => {
    const g = game({
      p1: { hand: ['craftwork-crusher'], battlefield: [...n('mountain', 4), ...n('forest', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'craftwork-crusher');
    g.pass();
    g.pass();
    expect(keywords(g, g.id('p1', 'craftwork-crusher'))).toContain('trample');
    expect(pt(g, g.id('p1', 'craftwork-crusher'))).toEqual([7, 5]);
    const angel = g.id('p2', 'serra-angel');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.mode !== undefined &&
          a.targets[0] !== undefined &&
          'object' in a.targets[0] &&
          a.targets[0].object.id === angel,
      ),
    );
    done(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(bf(g, 'fra-cadet-token')).toHaveLength(1);
    expect(hand(g)).toHaveLength(0);
  });

  it('Craftwork Crusher: choose two: a Cadet and a card', () => {
    const g = game({
      p1: { hand: ['craftwork-crusher'], battlefield: [...n('mountain', 4), ...n('forest', 3)] },
    });
    cast(g, 'craftwork-crusher');
    g.pass();
    g.pass();
    // The Cadet and the card: the third pair of modes.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .filter((a) => a.type === 'chooseTargets')
        .find((a) => a.type === 'chooseTargets' && a.mode === 2)!,
    );
    done(g);
    expect(bf(g, 'fra-cadet-token')).toHaveLength(1);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Craftwork Crusher: the modes come in pairs, three ways to choose two', () => {
    const g = game({
      p1: { hand: ['craftwork-crusher'], battlefield: [...n('mountain', 4), ...n('forest', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'craftwork-crusher');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const modes = new Set(
      g
        .legal()
        .flatMap((a) => (a.type === 'chooseTargets' && a.mode !== undefined ? [a.mode] : [])),
    );
    expect(modes.size).toBe(3);
  });
});

describe('green-white: lifegain and +1/+1 counters', () => {
  it('Bloombrute draws a card the first time you gain life each turn', () => {
    const g = game({
      p1: {
        hand: ['emergency-phytomedic'],
        battlefield: ['bloombrute', ...n('forest', 4), ...n('plains', 4)],
      },
    });
    done(cast(g, 'emergency-phytomedic'));
    const e = g.id('p1', 'emergency-phytomedic');
    castCopy(g, e, [g.ref(e)]);
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Bloombrute: the draw triggers only once each turn', () => {
    const g = game({
      p1: {
        hand: ['vigorbloom-charm', 'vigorbloom-charm'],
        battlefield: ['bloombrute', ...n('forest', 2), ...n('plains', 2)],
      },
    });
    done(cast(g, 'vigorbloom-charm', [], { mode: 1 }));
    expect(hand(g)).toHaveLength(3);
    done(cast(g, 'vigorbloom-charm', [], { mode: 1 }));
    // Each charm draws a card itself (+1 each); only the first lifegain drew an extra card.
    expect(hand(g)).toHaveLength(3);
    expect(g.life('p1')).toBe(26);
  });

  it('Bloombrute: {4}{G}{W} gives a creature trample and lifelink', () => {
    const g = game({
      p1: { battlefield: ['bloombrute', ...n('forest', 3), ...n('plains', 3)] },
    });
    const b = g.id('p1', 'bloombrute');
    activate(g, b, 1, [g.ref(b)]);
    done(g);
    expect(keywords(g, b)).toEqual(expect.arrayContaining(['trample', 'lifelink']));
  });

  it('Vigorbloom Vanguard enters prepared; creatures with +1/+1 counters have vigilance; Seed Suture', () => {
    const g = game({
      p1: {
        hand: ['vigorbloom-vanguard'],
        battlefield: ['savannah-lions', ...n('forest', 2), ...n('plains', 2)],
      },
    });
    done(cast(g, 'vigorbloom-vanguard'));
    const v = g.id('p1', 'vigorbloom-vanguard');
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, lions)).not.toContain('vigilance');
    expect(keywords(g, v)).not.toContain('vigilance');
    castCopy(g, v, [g.ref(lions)]);
    done(g);
    expect(counters(g, lions)).toBe(1);
    expect(g.life('p1')).toBe(21);
    expect(keywords(g, lions)).toContain('vigilance');
    expect(keywords(g, v)).not.toContain('vigilance');
    // Itself too, once it has a counter. Opponents' creatures are not affected.
    g.obj(v).plusOneCounters = 1;
    expect(keywords(g, v)).toContain('vigilance');
  });

  it('Vigorbloom Vanguard doesn’t give vigilance to the opponent’s creatures with counters', () => {
    const g = game({
      p1: { battlefield: ['vigorbloom-vanguard'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.obj(g.id('p2', 'savannah-lions')).plusOneCounters = 2;
    expect(keywords(g, g.id('p2', 'savannah-lions'))).not.toContain('vigilance');
  });

  it('Emergency Phytomedic enters prepared; Seed Suture puts a counter on a creature and gains 1 life', () => {
    const g = game({
      p1: { hand: ['emergency-phytomedic'], battlefield: ['savannah-lions', 'forest', 'plains'] },
    });
    done(cast(g, 'emergency-phytomedic'));
    const e = g.id('p1', 'emergency-phytomedic');
    expect(g.obj(e).prepared).toBeDefined();
    const lions = g.id('p1', 'savannah-lions');
    castCopy(g, e, [g.ref(lions)]);
    done(g);
    expect(counters(g, lions)).toBe(1);
    expect(g.life('p1')).toBe(21);
  });

  it('Seed Suture can target any creature', () => {
    const g = game({
      p1: { hand: ['emergency-phytomedic'], battlefield: ['forest', 'plains'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    done(cast(g, 'emergency-phytomedic'));
    const e = g.id('p1', 'emergency-phytomedic');
    const copy = g.obj(e).prepared!;
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === copy)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toEqual(
      expect.arrayContaining([g.ref(e), g.ref(g.id('p2', 'savannah-lions'))]),
    );
  });

  it('Kwia Vigorbloom: flying, vigilance, lifelink, ward {2}', () => {
    const g = game({ p1: { battlefield: ['kwia-vigorbloom'] } });
    expect(keywords(g, g.id('p1', 'kwia-vigorbloom'))).toEqual(
      expect.arrayContaining(['flying', 'vigilance', 'lifelink', 'ward']),
    );
    expect(pt(g, g.id('p1', 'kwia-vigorbloom'))).toEqual([6, 6]);
  });

  it('Kwia Vigorbloom: gaining life makes a Lotus, once each turn', () => {
    const g = game({
      p1: {
        hand: ['vigorbloom-charm', 'vigorbloom-charm'],
        battlefield: ['kwia-vigorbloom', ...n('forest', 2), ...n('plains', 2)],
      },
    });
    done(cast(g, 'vigorbloom-charm', [], { mode: 1 }));
    expect(bf(g, 'fra-lotus-token')).toHaveLength(1);
    done(cast(g, 'vigorbloom-charm', [], { mode: 1 }));
    expect(bf(g, 'fra-lotus-token')).toHaveLength(1);
  });

  it('Lotus: {T}, sacrifice it for three mana of any one color', () => {
    const lotus = cardDb.get('fra-lotus-token')!;
    expect(lotus.name).toBe('Lotus');
    expect(lotus.types).toEqual(['Artifact']);
    expect(lotus.colors).toEqual([]);
    const mana = lotus.abilities.filter((a) => a.kind === 'mana');
    expect(mana.map((a) => (a as { produces: string }).produces).sort()).toEqual([
      'B',
      'G',
      'R',
      'U',
      'W',
    ]);
    for (const a of mana) {
      expect((a as { amount?: number }).amount).toBe(3);
      expect((a as { cost: object }).cost).toEqual({ tapSelf: true, sacrificeSelf: true });
    }
    // Spending it: three mana of one color pays for a two-white-mana spell and the Lotus is gone.
    const g = game({
      p1: { hand: ['pacifism'], battlefield: ['fra-lotus-token'] },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'pacifism', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(bf(g, 'fra-lotus-token')).toHaveLength(0);
    expect(bf(g, 'pacifism')).toHaveLength(1);
  });

  it('Solarium Sentry: 3/3; gain 2 life when an opponent casts a spell with mana value 2 or less', () => {
    const g = game({
      p1: { battlefield: ['solarium-sentry'] },
      p2: { hand: ['shock', 'serra-angel'], battlefield: ['mountain', ...n('plains', 5)] },
    });
    expect(pt(g, g.id('p1', 'solarium-sentry'))).toEqual([3, 3]);
    g.pass();
    cast(g, 'shock', [{ player: 'p1' }]);
    done(g);
    // Shock hurt p1 for 2, and Sentry gained 2.
    expect(g.life('p1')).toBe(20);
  });

  it('Solarium Sentry: not for bigger spells, nor your own', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['solarium-sentry', 'mountain'] },
      p2: { hand: ['cancel'], battlefield: [...n('island', 3)] },
    });
    // Your own spell with mana value 1 doesn't trigger it.
    cast(g, 'shock', [{ player: 'p2' }]);
    expect(g.life('p1')).toBe(20);
    g.pass();
    // Cancel has mana value 3.
    cast(g, 'cancel', [g.ref(g.state.stack[0]!.id)]);
    done(g);
    expect(gy(g, 'p1')).toContain('shock');
    expect(g.life('p1')).toBe(20);
    expect(g.state.stack).toHaveLength(0);
  });

  it('Vigorbloom Charm: a permanent you control gains hexproof and indestructible', () => {
    const g = game({
      p1: { hand: ['vigorbloom-charm'], battlefield: ['forest', 'plains', 'sol-ring'] },
    });
    const ring = g.id('p1', 'sol-ring');
    done(cast(g, 'vigorbloom-charm', [g.ref(ring)], { mode: 0 }));
    expect(keywords(g, ring)).toEqual(expect.arrayContaining(['hexproof', 'indestructible']));
  });

  it('Vigorbloom Charm: draw a card and gain 3 life', () => {
    const g = game({ p1: { hand: ['vigorbloom-charm'], battlefield: ['forest', 'plains'] } });
    done(cast(g, 'vigorbloom-charm', [], { mode: 1 }));
    expect(hand(g)).toEqual(['forest']);
    expect(g.life('p1')).toBe(23);
  });

  it('Vigorbloom Charm: +1/+1 counter on your creature, then it fights an opponent’s creature', () => {
    const g = game({
      p1: { hand: ['vigorbloom-charm'], battlefield: ['forest', 'plains', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(
      cast(g, 'vigorbloom-charm', [g.ref(lions), g.ref(g.id('p2', 'llanowar-elves'))], { mode: 2 }),
    );
    expect(counters(g, lions)).toBe(1);
    expect(gy(g, 'p2')).toContain('llanowar-elves');
    expect(g.obj(lions).damage).toBe(1);
  });
});
