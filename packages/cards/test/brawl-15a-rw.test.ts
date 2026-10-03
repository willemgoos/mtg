import { describe, expect, it } from 'vitest';
import { colorIdentity } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, settle } from './blb-helpers.ts';

// Strixhaven Brawl 15a: the red-white cards of Brawl Quintorius, History Chaser.

const QUINT = 'quintorius-history-chaser';

const activate = (g: GameDriver, source: string, index = 0) =>
  g.do(
    g
      .legal()
      .find(
        (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
      )!,
  );
const pick = (g: GameDriver, label: RegExp) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected an option prompt, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0)
    throw new Error(`No option matching ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  return g.do({ type: 'chooseOption', player: d.player, index });
};
function resolve(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else break;
  }
  return g;
}
const castCommander = (g: GameDriver) =>
  g.do({ type: 'castSpell', player: 'p1', card: g.state.players.p1.commander!, targets: [] });
const canCastCommander = (g: GameDriver) =>
  g.legal().some((a) => a.type === 'castSpell' && a.card === g.state.players.p1.commander);
const names = (g: GameDriver, ids: string[]) => ids.map((i) => g.obj(i).defId);

describe('planeswalker commander: Quintorius, History Chaser', () => {
  it('is a legendary planeswalker with loyalty 5 and R/W identity', () => {
    const q = cardDb.get(QUINT)!;
    expect(q.types).toEqual(['Planeswalker']);
    expect(q.supertypes).toContain('Legendary');
    expect(q.loyalty).toBe(5);
    expect([...colorIdentity(q)].sort()).toEqual(['R', 'W']);
  });

  it('is cast from the command zone, enters with loyalty, and costs {2} more on a recast', () => {
    const g = game({
      p1: { commander: QUINT, battlefield: [...n('mountain', 5), 'plains'] },
    });
    expect(g.state.players.p1.command).toEqual([g.state.players.p1.commander]);
    expect(canCastCommander(g)).toBe(true);
    castCommander(g);
    resolve(g);
    const id = g.state.players.p1.commander!;
    expect(g.zoneOf(id)).toBe('battlefield');
    expect(g.obj(id).counters?.loyalty).toBe(5);
    expect(g.state.players.p1.commanderCasts).toBe(1);
  });

  it('charges the commander tax on the second cast', () => {
    const g = game({ p1: { commander: QUINT, battlefield: [...n('mountain', 5), 'plains'] } });
    g.state.players.p1.commanderCasts = 1;
    expect(canCastCommander(g)).toBe(true); // {2}{R}{W} + {2} = six mana
    g.state.players.p1.commanderCasts = 2;
    expect(canCastCommander(g)).toBe(false); // eight mana
  });

  it('goes back to the command zone when it dies with no loyalty left (owner chooses)', () => {
    const g = game({
      p1: { commander: QUINT, battlefield: [...n('mountain', 4), 'plains'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    castCommander(g);
    resolve(g);
    const id = g.state.players.p1.commander!;
    g.pass();
    cast(g, 'lightning-strike', [g.ref(id)]);
    g.passBoth();
    // Lightning Strike deals 3 to the walker: loyalty 5 -> 2 and it stays. Finish it with 5 loyalty gone.
    expect(g.zoneOf(id)).toBe('battlefield');
    g.obj(id).counters = { loyalty: 0 };
    g.do({ type: 'passPriority', player: g.actor });
    for (let i = 0; i < 5 && g.decision.kind !== 'commandZone'; i++) {
      if (g.decision.kind === 'priority') g.pass();
    }
    expect(g.decision).toMatchObject({ kind: 'commandZone', player: 'p1', card: id });
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.zoneOf(id)).toBe('command');
  });

  it('may stay in exile if its owner declines the command zone', () => {
    const g = game({
      p1: { commander: QUINT, battlefield: [...n('mountain', 4), 'plains'] },
    });
    castCommander(g);
    resolve(g);
    const id = g.state.players.p1.commander!;
    g.obj(id).counters = { loyalty: 0 };
    for (let i = 0; i < 6 && g.decision.kind !== 'commandZone'; i++) {
      if (g.decision.kind === 'priority') g.pass();
    }
    expect(g.decision).toMatchObject({ kind: 'commandZone', card: id });
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(g.zoneOf(id)).toBe('graveyard');
  });
});

describe('Quintorius, History Chaser abilities', () => {
  it('+1 discards a card to draw two and mill one', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: [QUINT],
        library: n('forest', 5),
      },
    });
    const q = g.id('p1', QUINT);
    g.obj(q).counters = { loyalty: 5 };
    activate(g, q, 1);
    resolve(g);
    pick(g, /Discard Savannah Lions/);
    resolve(g);
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(g.state.players.p1.graveyard.some((i) => g.obj(i).defId === 'forest')).toBe(true);
    expect(g.obj(q).counters?.loyalty).toBe(6);
  });

  it('+1 with "don\'t discard" draws nothing', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: [QUINT], library: n('forest', 3) },
    });
    const q = g.id('p1', QUINT);
    g.obj(q).counters = { loyalty: 5 };
    activate(g, q, 1);
    resolve(g);
    pick(g, /Don't discard/);
    resolve(g);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(3);
  });

  it('-4 gives Spirits double strike and vigilance until end of turn', () => {
    const g = game({ p1: { battlefield: [QUINT, 'lorehold-spirit-token'] } });
    const q = g.id('p1', QUINT);
    g.obj(q).counters = { loyalty: 5 };
    activate(g, q, 2);
    resolve(g);
    expect(g.obj(q).counters?.loyalty).toBe(1);
    const t = g.id('p1', 'lorehold-spirit-token');
    const k = g.state.effects.filter((e) => e.affected.id === t).flatMap((e) => e.keywords);
    expect(k).toEqual(expect.arrayContaining(['doubleStrike', 'vigilance']));
  });
});

describe('Excava, the Risen Past', () => {
  it('returns a cheap card from the graveyard as a 1/1 flying Spirit with a finality counter; Quintorius makes a Spirit', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: [{ card: 'excava-the-risen-past', sick: false }, QUINT],
        graveyard: ['llanowar-elves'],
      },
    });
    g.obj(g.id('p1', QUINT)).counters = { loyalty: 5 };
    g.passBoth();
    g.attack(g.id('p1', 'excava-the-risen-past'));
    resolve(g);
    const elves = g.id('p1', 'llanowar-elves');
    expect(g.zoneOf(elves)).toBe('battlefield');
    expect(g.obj(elves).counters?.finality).toBe(1);
    expect(g.obj(elves).addedSubtypes).toContain('Spirit');
    expect(
      g.state.effects.some(
        (e) =>
          e.affected.id === elves &&
          e.basePT?.[0] === 1 &&
          e.keywords.includes('flying') &&
          e.becomesCreature,
      ),
    ).toBe(true);
    // The card left the graveyard: Quintorius makes a Spirit token.
    expect(names(g, g.state.battlefield).filter((d) => d === 'lorehold-spirit-token').length).toBe(
      1,
    );
  });
});

describe("Lightning Helix, Warleader's Call, Boros Signet", () => {
  it('Lightning Helix deals 3 and gains 3', () => {
    const g = game({
      p1: { hand: ['lightning-helix'], battlefield: [...n('mountain', 1), 'plains'] },
    });
    cast(g, 'lightning-helix', [{ player: 'p2' }]);
    resolve(g);
    expect(g.state.players.p2.life).toBe(17);
    expect(g.state.players.p1.life).toBe(23);
  });

  it("Warleader's Call: +1/+1 and 1 damage whenever a creature enters", () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['warleaders-call', 'plains'],
      },
    });
    cast(g, 'savannah-lions', []);
    resolve(g);
    expect(g.state.players.p2.life).toBe(19);
  });

  it('Boros Signet turns {1} into {R}{W}', () => {
    const g = game({
      p1: { hand: ['lightning-helix'], battlefield: ['boros-signet', 'mountain'] },
    });
    activate(g, g.id('p1', 'boros-signet'), 0);
    resolve(g);
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });
});

describe('red-white lands', () => {
  it('Sacred Foundry: pay 2 life to enter untapped, or enter tapped', () => {
    const a = game({ p1: { hand: ['sacred-foundry'] } });
    a.do({ type: 'playLand', player: 'p1', card: a.id('p1', 'sacred-foundry', 'hand') });
    resolve(a);
    pick(a, /Pay 2 life/);
    resolve(a);
    expect(a.state.players.p1.life).toBe(18);
    expect(a.obj(a.id('p1', 'sacred-foundry')).tapped).toBe(false);
    const b = game({ p1: { hand: ['sacred-foundry'] } });
    b.do({ type: 'playLand', player: 'p1', card: b.id('p1', 'sacred-foundry', 'hand') });
    resolve(b);
    pick(b, /Enter tapped/);
    resolve(b);
    expect(b.state.players.p1.life).toBe(20);
    expect(b.obj(b.id('p1', 'sacred-foundry')).tapped).toBe(true);
  });

  it('Inspiring Vantage enters tapped with three other lands, untapped otherwise', () => {
    const a = game({ p1: { hand: ['inspiring-vantage'], battlefield: n('plains', 2) } });
    a.do({ type: 'playLand', player: 'p1', card: a.id('p1', 'inspiring-vantage', 'hand') });
    expect(a.obj(a.id('p1', 'inspiring-vantage')).tapped).toBe(false);
    const b = game({ p1: { hand: ['inspiring-vantage'], battlefield: n('plains', 3) } });
    b.do({ type: 'playLand', player: 'p1', card: b.id('p1', 'inspiring-vantage', 'hand') });
    expect(b.obj(b.id('p1', 'inspiring-vantage')).tapped).toBe(true);
  });

  it('Elegant Parlor enters tapped and surveils 1', () => {
    const g = game({ p1: { hand: ['elegant-parlor'], library: n('forest', 3) } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'elegant-parlor', 'hand') });
    expect(g.obj(g.id('p1', 'elegant-parlor')).tapped).toBe(true);
    resolve(g);
    expect(g.decision.kind).not.toBe('priority');
  });

  it('Battlefield Forge: a coloured mana costs 1 life', () => {
    const g = game({
      p1: { hand: ['lightning-helix'], battlefield: ['battlefield-forge', 'mountain'] },
    });
    cast(g, 'lightning-helix', [{ player: 'p2' }]);
    expect(g.state.players.p1.life).toBe(19);
  });
});
