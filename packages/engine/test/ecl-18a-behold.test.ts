import { describe, expect, it } from 'vitest';
import { casts, Game, scenario } from './ecl-fixtures.ts';

describe('flashback that beholds several cards (Kindle the Inner Flame)', () => {
  it('beholds three Elementals from the battlefield and your hand; the ones in hand are revealed', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['kindle'],
          hand: ['elemental', 'elemental'],
          battlefield: ['mountain', 'elemental'],
        },
      }),
    );
    const kindle = g.id('p1', 'kindle', 'graveyard');
    const options = casts(g, 'p1', kindle);
    // Three Elementals in all: one choice, the permanent first and both in hand.
    expect(options).toHaveLength(1);
    expect(options[0]!.beholdCards).toHaveLength(3);
    g.do(options[0]!);
    expect(g.events.filter((e) => e.type === 'cardsRevealed')).toHaveLength(2);
    // Flashback exiles it afterwards.
    g.passBoth();
    expect(g.zoneOf(kindle)).toBe('exile');
    // The beholding changed nothing about the cards.
    expect(g.state.players.p1.hand).toHaveLength(3);
  });

  it("can't be flashed back with fewer than three Elementals", () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['kindle'], hand: ['elemental'], battlefield: ['mountain', 'elemental'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 'kindle', 'graveyard'))).toHaveLength(0);
  });

  it('offers each distinct way of choosing when there are more than three', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['kindle'],
          hand: ['elemental', 'bear'],
          battlefield: ['mountain', 'elemental', { card: 'elemental', tapped: true }, 'elemental'],
        },
      }),
    );
    const options = casts(g, 'p1', g.id('p1', 'kindle', 'graveyard'));
    // Untapped x2, tapped x1 and one in hand: choose 3 of those four kinds of Elemental, counting alike ones once.
    expect(options.length).toBeGreaterThan(1);
    expect(options.length).toBeLessThanOrEqual(4);
  });
});

describe('behold creatures of a chosen type (Celestial Reunion)', () => {
  const setup = (extra: { hand?: string[]; battlefield?: string[] } = {}) =>
    new Game(
      scenario({
        p1: {
          hand: ['reunion', ...(extra.hand ?? [])],
          battlefield: ['forest', 'forest', 'forest', ...(extra.battlefield ?? [])],
          library: ['ogre', 'elf', 'forest'],
        },
        p2: {},
      }),
    );
  const reunion = (g: Game) => g.id('p1', 'reunion', 'hand');

  it('is only offered kicked when two creatures you could behold share a type', () => {
    const none = setup({ battlefield: ['elf', 'bear'] });
    expect(casts(none, 'p1', reunion(none)).every((a) => !a.kicked)).toBe(true);
    const some = setup({ battlefield: ['elf', 'elf-lord'] });
    expect(casts(some, 'p1', reunion(some)).some((a) => a.kicked)).toBe(true);
  });

  it('choose the type, then each creature; the card found enters the battlefield if it has that type', () => {
    const g = setup({ hand: ['elf'], battlefield: ['elf-lord', 'ogre'] });
    const kicked = casts(g, 'p1', reunion(g)).find((a) => a.kicked && a.x === 1)!;
    g.do(kicked);
    expect(g.decision.kind).toBe('beholdType');
    // The only type two of my creatures share is Elf.
    expect(g.legal('p1')).toHaveLength(1);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    // The Elf in hand and the Elf on the battlefield are the only two: nothing left to choose, so both are beheld.
    expect(g.decision.kind).toBe('priority');
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    const elfInLibrary = g.state.players.p1.library.find((id) => g.obj(id).defId === 'elf')!;
    g.do({ type: 'chooseCard', player: 'p1', card: elfInLibrary });
    expect(g.zoneOf(elfInLibrary)).toBe('battlefield');
  });

  it('a card found that is not the chosen type goes to the hand', () => {
    const g = setup({ hand: ['elf'], battlefield: ['elf-lord'] });
    g.do(casts(g, 'p1', reunion(g)).find((a) => a.kicked && a.x === 1)!);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    g.passBoth();
    const ogre = g.state.players.p1.library.find((id) => g.obj(id).defId === 'ogre')!;
    g.do({ type: 'chooseCard', player: 'p1', card: ogre });
    expect(g.zoneOf(ogre)).toBe('hand');
  });

  it('without the additional cost the card always goes to the hand', () => {
    const g = setup({ battlefield: ['elf-lord'] });
    g.do(casts(g, 'p1', reunion(g)).find((a) => !a.kicked && a.x === 1)!);
    g.passBoth();
    const elfInLibrary = g.state.players.p1.library.find((id) => g.obj(id).defId === 'elf')!;
    g.do({ type: 'chooseCard', player: 'p1', card: elfInLibrary });
    expect(g.zoneOf(elfInLibrary)).toBe('hand');
  });

  it('with three creatures of the type, the creatures are chosen one at a time; a hand card is revealed', () => {
    const g = setup({ hand: ['elf'], battlefield: ['elf-lord', 'elf'] });
    g.do(casts(g, 'p1', reunion(g)).find((a) => a.kicked && a.x === 1)!);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.decision.kind).toBe('beholdType');
    expect(g.legal('p1')).toHaveLength(3);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'elf', 'hand') });
    // One more is needed and two are left: still a choice.
    expect(g.legal('p1')).toHaveLength(2);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'elf-lord') });
    expect(g.events.filter((e) => e.type === 'cardsRevealed')).toHaveLength(1);
    expect(g.decision.kind).toBe('priority');
  });

  it('two changelings are the same type as each other, so any creature type will do', () => {
    const g = setup({ battlefield: ['shifter', 'shifter'] });
    g.do(casts(g, 'p1', reunion(g)).find((a) => a.kicked && a.x === 1)!);
    expect(g.decision.kind).toBe('beholdType');
    const types = (g.decision as { types: string[] }).types;
    expect(types.length).toBeGreaterThan(100);
    expect(types).toContain('Elf');
  });
});
