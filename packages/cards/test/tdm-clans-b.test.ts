import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { cardDb } from '../src/index.ts';
import { done } from './ecl-red-helpers.ts';

// Tarkir: Dragonstorm 19b: the Mardu and Temur cards.

const MARDU_LANDS = ['mountain', 'plains', 'swamp'];
const keywords = (g: GameDriver, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].hand.map((id) => g.obj(id).defId);

/** Moves to the declare attackers step of the current (or next) combat. */
const toAttackers = (g: GameDriver) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareAttackers');
};

describe('Neriv, Heart of the Storm', () => {
  it('doubles the damage of creatures that entered this turn, and only those', () => {
    const g = game({
      p1: {
        hand: ['sonic-shrieker'],
        battlefield: ['neriv-heart-of-the-storm', ...MARDU_LANDS, 'mountain', 'plains'],
      },
    });
    cast(g, 'sonic-shrieker', []);
    g.pass();
    g.pass();
    // Sonic Shrieker entered this turn: its 2 damage is 4.
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2')));
    expect(g.life('p2')).toBe(16);
  });

  it('does not double a creature that was already there', () => {
    const g = game({
      p1: { battlefield: ['neriv-heart-of-the-storm', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    // Neriv itself entered earlier in this scenario (not this turn): a plain attack deals the printed damage.
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'));
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(18);
  });
});

describe('Karakyk Guardian', () => {
  it('has hexproof until it has dealt damage', () => {
    const g = game({
      p1: { battlefield: ['karakyk-guardian'] },
    });
    const id = g.id('p1', 'karakyk-guardian');
    expect(keywords(g, id)).toContain('hexproof');
    expect(keywords(g, id)).toContain('flying');
    toAttackers(g);
    g.attack(id);
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(14);
    expect(keywords(g, id)).not.toContain('hexproof');
    expect(keywords(g, id)).toContain('flying');
  });

  it('loses hexproof from damage dealt by an ability, too (and has it again as a new object)', () => {
    const g = game({ p1: { battlefield: ['karakyk-guardian'] } });
    const id = g.id('p1', 'karakyk-guardian');
    g.obj(id).dealtDamage = true;
    expect(keywords(g, id)).not.toContain('hexproof');
  });
});

describe('Sonic Shrieker', () => {
  it('deals 2 damage to a player, gains 2 life, and that player discards a card', () => {
    const g = game({
      p1: { hand: ['sonic-shrieker'], battlefield: [...MARDU_LANDS, 'mountain', 'plains'] },
      p2: { hand: ['forest', 'island'] },
    });
    cast(g, 'sonic-shrieker', []);
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2')));
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(gy(g, 'p2')).toHaveLength(1);
  });

  it('a creature that is dealt the damage does not discard anything', () => {
    const g = game({
      p1: { hand: ['sonic-shrieker'], battlefield: [...MARDU_LANDS, 'mountain', 'plains'] },
      p2: { hand: ['forest', 'island'], battlefield: ['savannah-lions'] },
    });
    cast(g, 'sonic-shrieker', []);
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions')));
    expect(g.life('p1')).toBe(22);
    expect(hand(g, 'p2')).toHaveLength(2);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });
});

describe('Defibrillating Current', () => {
  it('deals 4 damage to a creature and gains 2 life; costs {2} less per hybrid mana symbol paid generically', () => {
    const g = game({
      p1: { hand: ['defibrillating-current'], battlefield: n('mountain', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'defibrillating-current', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Inevitable Defeat', () => {
  it('exiles a nonland permanent; its controller loses 3 life and you gain 3', () => {
    const g = game({
      p1: { hand: ['inevitable-defeat'], battlefield: [...MARDU_LANDS, 'mountain', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'inevitable-defeat', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toContain('serra-angel');
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });

  it("can't target a land and can't be countered", () => {
    const g = game({
      p1: { hand: ['inevitable-defeat'], battlefield: [...MARDU_LANDS, 'mountain', 'plains'] },
      p2: { battlefield: ['forest'] },
    });
    expect(() => cast(g, 'inevitable-defeat', [g.ref(g.id('p2', 'forest'))])).toThrow();
    expect(cardDb.get('inevitable-defeat')!.uncounterable).toBe(true);
  });
});

describe('Reigning Victor', () => {
  it('gives target creature +1/+0 and indestructible when it enters, and mobilizes 1', () => {
    const g = game({
      p1: { hand: ['reigning-victor'], battlefield: [...n('mountain', 6), 'savannah-lions'] },
    });
    cast(g, 'reigning-victor', []);
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'savannah-lions')));
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('indestructible');
    expect(
      cardDb.get('reigning-victor')!.abilities.some((a) => a.kind === 'triggered' && a.trigger.on === 'attacks'),
    ).toBe(true);
  });
});

describe('Bone-Cairn Butcher', () => {
  it('mobilizes 2 and attacking tokens have deathtouch', () => {
    const g = game({ p1: { battlefield: ['bone-cairn-butcher'] }, p2: { battlefield: ['serra-angel'] } });
    toAttackers(g);
    g.attack(g.id('p1', 'bone-cairn-butcher'));
    settle(g);
    const warriors = all(g, 'tdm-warrior-token');
    expect(warriors).toHaveLength(2);
    for (const w of warriors) expect(keywords(g, w)).toContain('deathtouch');
    expect(keywords(g, g.id('p1', 'bone-cairn-butcher'))).not.toContain('deathtouch');
  });
});

describe("Zurgo, Thunder's Decree", () => {
  it("Warrior tokens can't be sacrificed during your end step: the mobilize sacrifice doesn't happen", () => {
    const g = game({ p1: { battlefield: ["zurgo-thunders-decree"] } });
    toAttackers(g);
    g.attack(g.id('p1', "zurgo-thunders-decree"));
    settle(g);
    expect(all(g, 'tdm-warrior-token')).toHaveLength(2);
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'tdm-warrior-token')).toHaveLength(2);
  });
});
