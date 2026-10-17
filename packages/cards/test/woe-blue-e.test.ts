import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';
import {
  activate,
  done,
  gy,
  hand,
  keywords,
  stun,
  targeting,
  toAttackers,
} from './ecl-blue-helpers.ts';

// Wilds of Eldraine (23b): the blue creatures with abilities.

const ISLANDS = (k: number) => n('island', k);
const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);
type Cast = Extract<Action, { type: 'castSpell' }>;
const castsOf = (g: GameDriver, defId: string, target?: string): Cast[] =>
  g
    .legal()
    .filter(
      (a): a is Cast =>
        a.type === 'castSpell' &&
        !a.back &&
        a.card === g.id(g.actor, defId, 'hand') &&
        (target === undefined || a.targets.some((t) => 'object' in t && t.object.id === target)),
    );
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
/** Passes priority while the stack has something on it, stopping at any other decision (a trigger's targets included). */
const resolve = (g: GameDriver) => {
  for (let i = 0; i < 40 && g.decision.kind === 'priority' && g.state.stack.length > 0; i++)
    g.pass();
  return g;
};

describe('Galvanic Giant', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['into-the-fae-court', 'freeze-in-place'],
        battlefield: [...ISLANDS(8), 'galvanic-giant'],
        library: n('forest', 8),
      },
      p2: { battlefield: ['serra-angel'] },
    });
  it('is a 3/3', () => {
    const g = setup();
    expect(pt(g, idOf(g, 'galvanic-giant'))).toEqual([3, 3]);
  });
  it('taps target creature an opponent controls and puts a stun counter on it when you cast a spell with mana value 5 or greater', () => {
    const g = setup();
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    cast(g, 'into-the-fae-court');
    done(g, { pick: targeting(angel) });
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });
  it('does not trigger for a cheaper spell', () => {
    const g = setup();
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    settle(g);
    // Freeze in Place itself puts three stun counters on it; Giant adds none.
    expect(stun(g, angel)).toBe(3);
  });
});

describe('Icewrought Sentry', () => {
  it('has vigilance and is a 2/3', () => {
    const g = game({ p1: { battlefield: ['icewrought-sentry'] } });
    const id = idOf(g, 'icewrought-sentry');
    expect(pt(g, id)).toEqual([2, 3]);
    expect(keywords(g, id).has('vigilance')).toBe(true);
  });
  it('whenever you tap an untapped creature an opponent controls, it gets +2/+1 until end of turn', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: [...ISLANDS(2), 'icewrought-sentry'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    done(g);
    expect(pt(g, idOf(g, 'icewrought-sentry'))).toEqual([4, 4]);
  });
  it('tapping a creature that is already tapped does nothing for it', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: [...ISLANDS(2), 'icewrought-sentry'] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    done(g);
    expect(pt(g, idOf(g, 'icewrought-sentry'))).toEqual([2, 3]);
  });
  it('when it attacks you may pay {1}{U}: tap target creature an opponent controls (and it grows)', () => {
    const g = game({
      p1: { battlefield: [...ISLANDS(2), 'icewrought-sentry'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const sentry = idOf(g, 'icewrought-sentry');
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: sentry, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!);
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(pt(g, sentry)).toEqual([4, 4]);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'island' && g.obj(id).tapped).length,
    ).toBe(2);
  });
  it('the payment is optional', () => {
    const g = game({
      p1: { battlefield: [...ISLANDS(2), 'icewrought-sentry'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const sentry = idOf(g, 'icewrought-sentry');
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: sentry, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    settle(g);
    expect(g.obj(angel).tapped).toBe(false);
    expect(pt(g, sentry)).toEqual([2, 3]);
  });
  it('without {1}{U} only declining is offered', () => {
    const g = game({
      p1: { battlefield: [...ISLANDS(1), 'icewrought-sentry'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const sentry = idOf(g, 'icewrought-sentry');
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker: sentry, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    const offers = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(offers.every((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
  });
});

describe('Living Lectern', () => {
  const setup = () =>
    game({
      p1: {
        battlefield: ['island', 'island', 'living-lectern', 'savannah-lions'],
        library: n('forest', 5),
      },
    });
  it('is a 0/4 artifact Construct creature', () => {
    const def = cardDb.get('living-lectern')!;
    expect(def.types).toEqual(['Artifact', 'Creature']);
    expect(def.subtypes).toEqual(['Construct']);
    expect([def.power, def.toughness]).toEqual([0, 4]);
  });
  it('{1}, sacrifice: draw a card and a Sorcerer Role on up to one other target creature you control', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions');
    const lectern = idOf(g, 'living-lectern');
    activate(g, lectern, 0, [tgt(g, lions)]);
    done(g);
    expect(g.obj(lectern).zone).toBe('graveyard');
    expect(hand(g)).toEqual(['forest']);
    expect(all(g, 'woe-sorcerer-role').length).toBe(1);
    // +1/+1 and "whenever this creature attacks, scry 1".
    expect(pt(g, lions)).toEqual([3, 2]);
  });
  it('the target is optional', () => {
    const g = game({
      p1: { battlefield: ['island', 'living-lectern'], library: n('forest', 5) },
    });
    activate(g, idOf(g, 'living-lectern'), 0, []);
    done(g);
    expect(hand(g)).toEqual(['forest']);
    expect(all(g, 'woe-sorcerer-role').length).toBe(0);
  });
  it('cannot target itself', () => {
    const g = setup();
    const lectern = idOf(g, 'living-lectern');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === lectern);
    expect(
      acts.some(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === lectern),
      ),
    ).toBe(false);
  });
  it('activate only as a sorcery', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['island', 'living-lectern'], library: n('forest', 5) },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === idOf(g, 'living-lectern')),
    ).toBe(false);
  });
});

describe('Sleep-Cursed Faerie', () => {
  it('is a 3/3 flyer with ward {2}', () => {
    const def = cardDb.get('sleep-cursed-faerie')!;
    expect([def.power, def.toughness]).toEqual([3, 3]);
    expect(def.keywords).toEqual(expect.arrayContaining(['flying', 'ward']));
    expect(def.wardCost).toEqual({ mana: { generic: 2, colored: {} } });
  });
  it('enters tapped with three stun counters on it', () => {
    const g = game({ p1: { hand: ['sleep-cursed-faerie'], battlefield: ISLANDS(2) } });
    cast(g, 'sleep-cursed-faerie');
    done(g);
    const f = idOf(g, 'sleep-cursed-faerie');
    expect(g.obj(f).tapped).toBe(true);
    expect(stun(g, f)).toBe(3);
  });
  it('{1}{U}: untap this creature removes a stun counter instead, until none is left', () => {
    const g = game({
      p1: { battlefield: [{ card: 'sleep-cursed-faerie', tapped: true }, ...ISLANDS(8)] },
    });
    const f = idOf(g, 'sleep-cursed-faerie');
    g.obj(f).counters = { stun: 3 };
    for (let k = 2; k >= 0; k--) {
      activate(g, f, 0);
      done(g);
      expect(g.obj(f).tapped).toBe(true);
      expect(stun(g, f)).toBe(k);
    }
    activate(g, f, 0);
    done(g);
    expect(g.obj(f).tapped).toBe(false);
  });
});

describe('Snaremaster Sprite', () => {
  it('is a 1/1 flyer', () => {
    const g = game({ p1: { battlefield: ['snaremaster-sprite'] } });
    const id = idOf(g, 'snaremaster-sprite');
    expect(pt(g, id)).toEqual([1, 1]);
    expect(keywords(g, id).has('flying')).toBe(true);
  });
  it('when it enters you may pay {2}: tap target creature an opponent controls and put a stun counter on it', () => {
    const g = game({
      p1: { hand: ['snaremaster-sprite'], battlefield: ISLANDS(3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    cast(g, 'snaremaster-sprite');
    resolve(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!);
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });
  it('the payment is optional', () => {
    const g = game({
      p1: { hand: ['snaremaster-sprite'], battlefield: ISLANDS(3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    cast(g, 'snaremaster-sprite');
    resolve(g);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    settle(g);
    expect(g.obj(angel).tapped).toBe(false);
    expect(stun(g, angel)).toBe(0);
  });
  it('with no spare {2} nothing happens', () => {
    const g = game({
      p1: { hand: ['snaremaster-sprite'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'snaremaster-sprite');
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.obj(idOf(g, 'serra-angel', 'battlefield', 'p2')).tapped).toBe(false);
  });
});

describe('Splashy Spellcaster', () => {
  const setup = (extra: string[] = ['savannah-lions']) =>
    game({
      p1: {
        hand: ['freeze-in-place', 'freeze-in-place'],
        battlefield: [...ISLANDS(4), 'splashy-spellcaster', ...extra],
      },
      p2: { battlefield: ['serra-angel'] },
    });
  it('is a 2/4', () => {
    const g = setup();
    expect(pt(g, idOf(g, 'splashy-spellcaster'))).toEqual([2, 4]);
  });
  it('whenever you cast an instant or sorcery, a Sorcerer Role on up to one other target creature you control', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions');
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    done(g, { pick: targeting(lions) });
    expect(all(g, 'woe-sorcerer-role').length).toBe(1);
    expect(pt(g, lions)).toEqual([3, 2]);
    // The Spellcaster itself is not a legal target ("other").
    expect(pt(g, idOf(g, 'splashy-spellcaster'))).toEqual([2, 4]);
  });
  it('a second Role of yours on the same creature replaces the first', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions');
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    for (let i = 0; i < 2; i++) {
      g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
      done(g, { pick: targeting(lions) });
    }
    expect(all(g, 'woe-sorcerer-role').length).toBe(1);
    expect(pt(g, lions)).toEqual([3, 2]);
  });
  it('with no other creature it makes nothing', () => {
    const g = setup([]);
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    done(g);
    expect(all(g, 'woe-sorcerer-role').length).toBe(0);
  });
  it('a creature spell does not trigger it', () => {
    const g = game({
      p1: {
        hand: ['picklock-prankster'],
        battlefield: [...ISLANDS(4), 'splashy-spellcaster', 'savannah-lions'],
      },
    });
    cast(g, 'picklock-prankster');
    done(g);
    expect(all(g, 'woe-sorcerer-role').length).toBe(0);
  });
});

describe('Stormkeld Prowler', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['into-the-fae-court', 'freeze-in-place'],
        battlefield: [...ISLANDS(8), 'stormkeld-prowler'],
        library: n('forest', 8),
      },
      p2: { battlefield: ['serra-angel'] },
    });
  it('is a 2/1', () => {
    const g = setup();
    expect(pt(g, idOf(g, 'stormkeld-prowler'))).toEqual([2, 1]);
  });
  it('puts two +1/+1 counters on itself when you cast a spell with mana value 5 or greater', () => {
    const g = setup();
    cast(g, 'into-the-fae-court');
    done(g);
    const p = idOf(g, 'stormkeld-prowler');
    expect(counters(g, p)).toBe(2);
    expect(pt(g, p)).toEqual([4, 3]);
  });
  it('not for a cheaper spell', () => {
    const g = setup();
    g.do(castsOf(g, 'freeze-in-place', idOf(g, 'serra-angel', 'battlefield', 'p2'))[0]!);
    done(g);
    expect(counters(g, idOf(g, 'stormkeld-prowler'))).toBe(0);
  });
});

describe("Talion's Messenger", () => {
  const setup = () =>
    game({
      p1: {
        hand: ['water-wings'],
        battlefield: ['talions-messenger', 'picklock-prankster', 'savannah-lions'],
        library: n('forest', 5),
      },
    });
  const attackWith = (g: GameDriver, ids: string[]) => {
    toAttackers(g);
    for (const attacker of ids)
      g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
  };
  it('is a 1/3 flyer', () => {
    const g = setup();
    const id = idOf(g, 'talions-messenger');
    expect(pt(g, id)).toEqual([1, 3]);
    expect(keywords(g, id).has('flying')).toBe(true);
  });
  it('whenever you attack with one or more Faeries: draw, then discard; when you discard, a +1/+1 counter on target Faerie', () => {
    const g = setup();
    const prankster = idOf(g, 'picklock-prankster');
    attackWith(g, [prankster]);
    // The ability resolves: draw, then discard a card (the hand has two cards now).
    settle(g);
    expect(g.decision.kind).toBe('discard');
    g.do(g.legal().find((a) => a.type === 'discard')!);
    // The reflexive trigger: target a Faerie you control.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === prankster),
        )!,
    );
    settle(g);
    expect(counters(g, prankster)).toBe(1);
    expect(counters(g, idOf(g, 'talions-messenger'))).toBe(0);
    expect(handSize(g, 'p1')).toBe(1);
    expect(gy(g).length).toBe(1);
  });
  it('triggers once for several Faeries attacking', () => {
    const g = setup();
    attackWith(g, [idOf(g, 'talions-messenger'), idOf(g, 'picklock-prankster')]);
    settle(g);
    g.do(g.legal().find((a) => a.type === 'discard')!);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!);
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.players.p1.library.length).toBe(4);
  });
  it('does not trigger when only a non-Faerie attacks', () => {
    const g = setup();
    attackWith(g, [idOf(g, 'savannah-lions')]);
    settle(g);
    expect(g.decision.kind).not.toBe('discard');
    expect(handSize(g, 'p1')).toBe(1);
    expect(hand(g)).toEqual(['water-wings']);
  });
});

describe('Tenacious Tomeseeker', () => {
  const setup = (battlefield: string[]) =>
    game({
      p1: {
        hand: ['tenacious-tomeseeker'],
        graveyard: ['freeze-in-place', 'savannah-lions'],
        battlefield: [...ISLANDS(3), ...battlefield],
      },
    });
  it('is a 3/2', () => {
    const def = cardDb.get('tenacious-tomeseeker')!;
    expect([def.power, def.toughness]).toEqual([3, 2]);
  });
  it('bargained: returns target instant or sorcery card from your graveyard to your hand', () => {
    const g = setup(['food-token']);
    const food = idOf(g, 'food-token');
    g.do(castsOf(g, 'tenacious-tomeseeker').find((a) => a.kicked && a.sacrifice === food)!);
    resolve(g);
    // Only the sorcery is a legal target.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!);
    settle(g);
    expect(hand(g)).toEqual(['freeze-in-place']);
    // The Lions card stays (the sacrificed Food is there too).
    expect(gy(g)).toContain('savannah-lions');
    expect(gy(g)).not.toContain('freeze-in-place');
  });
  it('not bargained: nothing is returned', () => {
    const g = setup(['food-token']);
    g.do(castsOf(g, 'tenacious-tomeseeker').find((a) => !a.kicked)!);
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(hand(g)).toEqual([]);
    expect(gy(g).length).toBe(2);
  });
});
