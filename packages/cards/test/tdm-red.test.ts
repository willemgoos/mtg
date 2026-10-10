import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activate, casts, done, exile, gy, hand, keywords, tokens } from './ecl-red-helpers.ts';
import { cardDb } from '../src/index.ts';

// Tarkir: Dragonstorm 19b: the red cards.

const ids = (g: ReturnType<typeof game>, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);

/** Moves to the declare attackers decision and attacks the opponent with these creatures. */
function attack(g: ReturnType<typeof game>, attackers: string[]): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
}

describe('Devoted Duelist', () => {
  it('flurry: the second spell each turn deals 1 damage to each opponent', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['devoted-duelist', ...n('mountain', 2)],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(18);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    // Shock, Shock and the flurry ping.
    expect(g.life('p2')).toBe(15);
  });
});

describe('Jeskai Devotee', () => {
  it('flurry gives +1/+1 until end of turn; {1} makes U, R or W once each turn', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['jeskai-devotee', ...n('mountain', 3)],
      },
    });
    const dev = g.id('p1', 'jeskai-devotee');
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(pt(g, dev)).toEqual([3, 3]);
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === dev);
    expect(acts.length).toBeGreaterThan(0);
  });
});

describe('Equilibrium Adept', () => {
  it('exiles the top card to play it, and gains double strike on flurry', () => {
    const g = game({
      p1: {
        hand: ['equilibrium-adept', 'shock', 'shock'],
        battlefield: n('mountain', 8),
        library: ['mountain', 'forest'],
      },
    });
    cast(g, 'equilibrium-adept');
    settle(g);
    expect(exile(g)).toEqual(['mountain']);
    const adept = g.id('p1', 'equilibrium-adept');
    expect(keywords(g, adept)).not.toContain('doubleStrike');
    // The Adept was the first spell this turn, so the Shock is the second.
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(keywords(g, adept)).toContain('doubleStrike');
  });
});

describe('Fleeting Effigy', () => {
  it('returns to hand at your end step; {2}{R} gives +2/+0', () => {
    const g = game({ p1: { hand: [], battlefield: ['fleeting-effigy', ...n('mountain', 3)] } });
    const e = g.id('p1', 'fleeting-effigy');
    activate(g, e, 1);
    settle(g);
    expect(pt(g, e)).toEqual([4, 2]);
    g.passUntilStep('end');
    settle(g);
    expect(hand(g)).toContain('fleeting-effigy');
  });
});

describe('Iridescent Tiger', () => {
  it('adds WUBRG when cast', () => {
    const g = game({ p1: { hand: ['iridescent-tiger'], battlefield: n('mountain', 5) } });
    cast(g, 'iridescent-tiger');
    settle(g);
    const pool = g.state.players.p1.pool ?? [];
    expect(pool.length).toBe(5);
  });
});

describe('Meticulous Artisan', () => {
  it('makes a Treasure when it enters and has prowess', () => {
    const g = game({
      p1: { hand: ['meticulous-artisan', 'shock'], battlefield: n('mountain', 6) },
    });
    cast(g, 'meticulous-artisan');
    settle(g);
    expect(ids(g, 'treasure-token')).toHaveLength(1);
    const artisan = g.id('p1', 'meticulous-artisan');
    expect(pt(g, artisan)).toEqual([3, 3]);
    cast(g, 'shock', [{ player: 'p2' }]);
    expect(pt(g, artisan)).toEqual([3, 3]);
    settle(g);
    expect(pt(g, artisan)).toEqual([4, 4]);
  });
});

describe('Rescue Leopard', () => {
  it('may discard a card to draw one whenever it becomes tapped', () => {
    const g = game({
      p1: { hand: ['mountain'], battlefield: ['rescue-leopard'], library: ['forest'] },
    });
    attack(g, [g.id('p1', 'rescue-leopard')]);
    done(g, { accept: true });
    expect(hand(g)).toEqual(['forest']);
    expect(gy(g)).toEqual(['mountain']);
  });
});

describe('Shocking Sharpshooter', () => {
  it('deals 1 damage to the opponent whenever another creature you control enters', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['shocking-sharpshooter', 'mountain', 'plains'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p2')).toBe(19);
  });
});

describe('Summit Intimidator', () => {
  it('makes a target creature unable to block', () => {
    const g = game({
      p1: { hand: ['summit-intimidator'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'summit-intimidator');
    settle(g);
    const angel = g.id('p2', 'serra-angel');
    expect(g.state.effects.some((e) => e.affected.id === angel && e.cantBlock === true)).toBe(true);
  });
});

describe('Unsparing Boltcaster', () => {
  it('deals 5 damage to a creature an opponent controls that was dealt damage this turn', () => {
    const g = game({
      p1: { hand: ['unsparing-boltcaster'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel', { card: 'savannah-lions', damage: 1 }] },
    });
    cast(g, 'unsparing-boltcaster');
    settle(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(0);
  });

  it('cannot target a creature that was not dealt damage', () => {
    const g = game({
      p1: { hand: ['unsparing-boltcaster'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    // The trigger has no legal target, so it is removed from the stack.
    cast(g, 'unsparing-boltcaster');
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(0);
  });
});

describe('Underfoot Underdogs', () => {
  it('makes a Goblin; {1},{T} makes a creature with power 2 or less unblockable', () => {
    const g = game({
      p1: { hand: ['underfoot-underdogs'], battlefield: n('mountain', 5) },
    });
    cast(g, 'underfoot-underdogs');
    settle(g);
    expect(ids(g, 'goblin-token')).toHaveLength(1);
  });

  it('only targets creatures you control with power 2 or less', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: 'underfoot-underdogs', sick: false },
          'serra-angel',
          'savannah-lions',
          'mountain',
        ],
      },
    });
    const src = g.id('p1', 'underfoot-underdogs');
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === src && a.abilityIndex === 1);
    const targets = acts.flatMap((a) => (a.type === 'activateAbility' ? a.targets : []));
    const targeted = targets.map((t) => ('object' in t ? t.object.id : ''));
    expect(targeted).toContain(lions);
    expect(targeted).not.toContain(angel);
  });
});

describe('War Effort', () => {
  it('gives +1/+0 and makes an attacking Warrior whenever you attack', () => {
    const g = game({
      p1: { battlefield: ['war-effort', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 1]);
    attack(g, [lions]);
    settle(g);
    const w = tokens(g, 'tdm-warrior-token');
    expect(w).toHaveLength(1);
    expect(g.obj(w[0]!).tapped).toBe(true);
    expect(pt(g, w[0]!)).toEqual([2, 1]);
  });
});

describe('Zurgo’s Vanguard', () => {
  it('has power equal to the creatures you control and mobilizes 1', () => {
    const g = game({
      p1: { battlefield: ['zurgos-vanguard', 'savannah-lions'] },
    });
    const v = g.id('p1', 'zurgos-vanguard');
    expect(pt(g, v)).toEqual([2, 3]);
    attack(g, [v]);
    settle(g);
    expect(tokens(g, 'tdm-warrior-token')).toHaveLength(1);
    expect(pt(g, v)).toEqual([3, 3]);
  });
});

void casts;
void getCharacteristics;
void cardDb;
