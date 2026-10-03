import { describe, expect, it } from 'vitest';
import { cast, game, n, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12d): Scions & Spellcraft — Adventures, delve,
// Hades and Noctis casting from the graveyard, Authority of the Consuls,
// Y'shtola's end step draw, Matoya, and back faces that can't be cast.

const casts = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);

describe('Scions & Spellcraft (12d)', () => {
  it('Adventure: cast Swift End, then Murderous Rider from exile', () => {
    const g = game({
      p1: { hand: ['murderous-rider'], battlefield: n('swamp', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    const rider = g.id('p1', 'murderous-rider', 'hand');
    const angel = g.id('p2', 'serra-angel');
    const adventure = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === rider && a.back === true);
    expect(adventure).toBeDefined();
    g.do({ ...adventure!, targets: [g.ref(angel)] } as typeof adventure & object);
    settle(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.life('p1')).toBe(18);
    expect(g.zoneOf(rider)).toBe('exile');
    expect(g.obj(rider).onAdventure).toBe(true);
    // The creature can now be cast from exile.
    const creature = g.legal().find((a) => a.type === 'castSpell' && a.card === rider);
    expect(creature).toBeDefined();
    g.do(creature!);
    settle(g);
    expect(g.zoneOf(rider)).toBe('battlefield');
    expect(g.obj(rider).defId).toBe('murderous-rider');
  });

  it("a transform card's back face can't be cast from hand", () => {
    const g = game({ p1: { hand: ['emet-selch-unsundered'], battlefield: n('island', 8) } });
    expect(casts(g, 'emet-selch-unsundered').some((a) => a.type === 'castSpell' && a.back)).toBe(
      false,
    );
  });

  it('delve: Dig Through Time costs less and exiles the cards that paid', () => {
    const g = game({
      p1: {
        hand: ['dig-through-time'],
        graveyard: n('forest', 6),
        battlefield: n('island', 2),
        library: n('island', 10),
      },
    });
    expect(casts(g, 'dig-through-time')).toHaveLength(1);
    cast(g, 'dig-through-time');
    settle(g);
    expect(g.state.players.p1.exile).toHaveLength(6);
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Hades: cards from your graveyard during your turn, and they are exiled instead', () => {
    const g = game({
      p1: { battlefield: ['hades-sorcerer-of-eld', 'mountain'], graveyard: ['shock', 'forest'] },
    });
    expect(casts(g, 'shock')).not.toHaveLength(0);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(true);
    g.do(
      casts(g, 'shock').find(
        (a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!,
    );
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('shock');
  });

  it('Noctis: artifacts from your graveyard for 3 life, with a finality counter', () => {
    const g = game({
      p1: { battlefield: ['noctis-prince-of-lucis', ...n('plains', 2)], graveyard: ['mind-stone'] },
    });
    const stone = g.state.players.p1.graveyard[0]!;
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === stone)!);
    settle(g);
    expect(g.zoneOf(stone)).toBe('battlefield');
    expect(g.obj(stone).counters?.finality).toBe(1);
    expect(g.life('p1')).toBe(17);
  });

  it("Authority of the Consuls: the opponent's creatures enter tapped, you gain 1", () => {
    const g = game({
      p1: { battlefield: ['authority-of-the-consuls'] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.obj(g.id('p2', 'savannah-lions')).tapped).toBe(true);
    expect(g.life('p1')).toBe(21);
  });

  it("Y'shtola: 2 damage for a big noncreature spell; a card at the end step after 4 life lost", () => {
    const g = game({
      p1: {
        hand: ['void-rend'],
        battlefield: ['yshtola-nights-blessed', 'plains', 'island', 'swamp'],
        library: n('island', 5),
      },
      p2: { life: 10, battlefield: ['serra-angel'] },
    });
    cast(g, 'void-rend', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(g.life('p2')).toBe(8);
    const hand = g.state.players.p1.hand.length;
    g.passUntilStep('end');
    settle(g);
    // Only 2 life lost: no card.
    expect(g.state.players.p1.hand.length).toBe(hand);
  });

  it('Matoya draws when you surveil', () => {
    const g = game({
      p1: { hand: ['dreams-of-laguna'], battlefield: ['matoya-archon-elder', ...n('island', 2)] },
    });
    const before = g.state.players.p1.hand.length;
    cast(g, 'dreams-of-laguna');
    for (let i = 0; i < 6; i++) {
      if (g.decision.kind === 'scry') g.do(g.legal()[0]!);
      settle(g);
    }
    // Dreams of Laguna (-1) draws one, Matoya one.
    expect(g.state.players.p1.hand.length).toBe(before + 1);
  });
});
