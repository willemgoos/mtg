import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { done, exile, gy, hand, keywords, library, onStack, tappedLands } from './ecl-blue-helpers.ts';
import { choose, tgt, untilOption } from './tdm-blue-helpers.ts';

// Tarkir: Dragonstorm 19b: the blue cards, instants, sorceries and enchantments.

describe('Dispelling Exhale', () => {
  const setup = (p2battlefield: string[]) =>
    game({
      p1: { hand: ['savannah-lions'], battlefield: n('plains', 6) },
      p2: { hand: ['dispelling-exhale'], battlefield: ['island', 'island', ...p2battlefield] },
    });
  const counterIt = (g: ReturnType<typeof setup>, beheld: boolean) => {
    cast(g, 'savannah-lions');
    const lions = g.state.stack[0]!.id;
    g.pass();
    const action = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p2', 'dispelling-exhale', 'hand') &&
          !!a.kicked === beheld &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      );
    expect(action).toBeDefined();
    g.do(action!);
  };

  it('without a Dragon: counter target spell unless its controller pays {2}', () => {
    const g = setup(['dirgur-island-dragon']);
    counterIt(g, false);
    // The Lions' controller has five Plains left and pays.
    done(g, { accept: true });
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'savannah-lions')).toBe(true);
  });

  it('without a Dragon beheld, an opponent that cannot pay {2} has the spell countered', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains'] },
      p2: { hand: ['dispelling-exhale'], battlefield: ['island', 'island'] },
    });
    counterIt(g, false);
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('if a Dragon was beheld, the cost is {4} instead', () => {
    // p1 has Lions mana plus exactly three spare Plains: {2} is payable, {4} is not.
    const mk = () =>
      game({
        p1: { hand: ['savannah-lions'], battlefield: n('plains', 4) },
        p2: {
          hand: ['dispelling-exhale'],
          battlefield: ['island', 'island', 'dirgur-island-dragon'],
        },
      });
    const plain = mk();
    counterIt(plain as ReturnType<typeof setup>, false);
    for (let i = 0; i < 4 && plain.decision.kind !== 'payOrCounter'; i++) plain.pass();
    expect(plain.decision.kind).toBe('payOrCounter');
    const beheld = mk();
    counterIt(beheld as ReturnType<typeof setup>, true);
    // Only three Plains are left: {4} cannot be paid, so the spell is countered at once.
    done(beheld);
    expect(gy(beheld)).toEqual(['savannah-lions']);
  });

  it('can only behold a Dragon when you have one', () => {
    const g = setup([]);
    cast(g, 'savannah-lions');
    g.pass();
    const casts = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p2', 'dispelling-exhale', 'hand'));
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.type === 'castSpell' && !a.kicked)).toBe(true);
    void onStack;
  });
});

describe('Spectral Denial', () => {
  it('costs {1} less for each creature you control with power 4 or greater; counter unless X is paid', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'plains'] },
      p2: {
        hand: ['spectral-denial'],
        battlefield: ['island', 'island', 'island', 'serra-angel'],
      },
    });
    cast(g, 'savannah-lions');
    const lions = g.state.stack[0]!.id;
    g.pass();
    const casts = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p2', 'spectral-denial', 'hand') &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      );
    // Three Islands pay {X}{U} less {1} for the Angel: X can be 3.
    const xs = casts.map((a) => (a.type === 'castSpell' ? (a.x ?? 0) : -1));
    expect(Math.max(...xs)).toBe(3);
    const three = casts.find((a) => a.type === 'castSpell' && a.x === 3)!;
    g.do(three);
    // p1 has one Plain left and cannot pay {3}.
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('without a big creature it costs the full {X}{U}', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'plains'] },
      p2: { hand: ['spectral-denial'], battlefield: ['island', 'island', 'island'] },
    });
    cast(g, 'savannah-lions');
    g.pass();
    const xs = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p2', 'spectral-denial', 'hand'))
      .map((a) => (a.type === 'castSpell' ? (a.x ?? 0) : -1));
    expect(Math.max(...xs)).toBe(2);
  });
});

describe('Focus the Mind', () => {
  it('costs {2} less if you have cast another spell this turn; draw three, then discard a card', () => {
    const g = game({
      p1: {
        hand: ['focus-the-mind', 'urenis-rebuff'],
        battlefield: n('island', 6),
        library: n('forest', 6),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const focusCasts = () =>
      g.legal().filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'focus-the-mind', 'hand'));
    expect(focusCasts()).toHaveLength(1);
    cast(g, 'urenis-rebuff', [tgt(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(tappedLands(g)).toBe(2);
    cast(g, 'focus-the-mind');
    done(g);
    // {5} less {2}: three more Islands tapped.
    expect(tappedLands(g)).toBe(5);
    expect(hand(g)).toHaveLength(2);
    expect(gy(g)).toHaveLength(3);
  });
});

describe('Riverwalk Technique', () => {
  const setup = () =>
    game({
      p1: { hand: ['riverwalk-technique'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'], library: n('forest', 5) },
    });

  it('mode 1: the owner of target nonland permanent puts it on top or bottom of their library', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'riverwalk-technique', [tgt(g, angel)], { mode: 0 });
    g.pass();
    const labels = untilOption(g);
    expect(labels).toEqual(['Top of your library', 'Bottom of your library']);
    choose(g, /Bottom/);
    done(g);
    expect(library(g, 'p2').at(-1)).toBe('serra-angel');
  });

  it('mode 2: counter target noncreature spell', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['riverwalk-technique'], battlefield: n('island', 4) },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    const shock = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'riverwalk-technique', [tgt(g, shock)], { mode: 1 });
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock']);
    expect(g.life('p1')).toBe(20);
  });
});

describe('Winternight Stories, Unending Whisper and Ureni Rebuff', () => {
  it('Winternight Stories: draw three, then discard two cards unless you discard a creature card', () => {
    const g = game({
      p1: {
        hand: ['winternight-stories'],
        battlefield: n('island', 3),
        library: ['savannah-lions', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'winternight-stories');
    // Hand: Lions, Forest, Forest. The prompt offers discarding the Lions or two cards.
    expect(untilOption(g)).toEqual(['Discard Savannah Lions', 'Discard two cards']);
  });

  it('Winternight Stories: discarding a creature card discards only that card', () => {
    const g = game({
      p1: {
        hand: ['winternight-stories'],
        battlefield: n('island', 3),
        library: ['savannah-lions', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'winternight-stories');
    untilOption(g);
    choose(g, /Savannah Lions/);
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest']);
    expect(gy(g)).toContain('savannah-lions');
  });

  it('Winternight Stories: with no creature card you discard two', () => {
    const g = game({
      p1: { hand: ['winternight-stories'], battlefield: n('island', 3), library: n('forest', 5) },
    });
    cast(g, 'winternight-stories');
    done(g);
    expect(hand(g)).toHaveLength(1);
  });

  it('harmonize: cast from the graveyard for {4}{U}, tapping a creature to pay less, then exiled', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 3), 'serra-angel'],
        graveyard: ['unending-whisper'],
        library: n('forest', 3),
      },
    });
    const card = g.id('p1', 'unending-whisper', 'graveyard');
    const tapped = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === card && a.harmonizeTap);
    expect(tapped).toHaveLength(1);
    g.do(tapped[0]!);
    done(g);
    // {5}{U} less 4 (the Angel's power): {1}{U}, two Islands.
    expect(tappedLands(g)).toBe(2);
    expect(hand(g)).toEqual(['forest']);
    expect(exile(g)).toEqual(['unending-whisper']);
  });

  it("Ureni's Rebuff: return target creature to its owner's hand", () => {
    const g = game({
      p1: { hand: ['urenis-rebuff'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'urenis-rebuff', [tgt(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g)).toEqual(['urenis-rebuff']);
  });
});

describe('Roiling Dragonstorm', () => {
  it('enters: draw two cards, then discard a card', () => {
    const g = game({
      p1: { hand: ['roiling-dragonstorm'], battlefield: n('island', 2), library: n('forest', 4) },
    });
    cast(g, 'roiling-dragonstorm');
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });

  it('returns to its owner hand when a Dragon you control enters', () => {
    const g = game({
      p1: {
        hand: ['firespitter-whelp'],
        battlefield: ['roiling-dragonstorm', 'mountain', 'mountain', 'mountain'],
      },
    });
    cast(g, 'firespitter-whelp');
    done(g);
    expect(hand(g)).toEqual(['roiling-dragonstorm']);
  });

  it('does not return when a non-Dragon enters', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['roiling-dragonstorm', 'plains'] },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(hand(g)).toEqual([]);
  });
});

describe('Wingspan Stride and Fresh Start', () => {
  it('Wingspan Stride: +1/+1 and flying; {2}{U} returns the Aura to its owner hand', () => {
    const g = game({
      p1: { hand: ['wingspan-stride'], battlefield: [...n('island', 4), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'wingspan-stride', [tgt(g, lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    const aura = g.id('p1', 'wingspan-stride');
    const act = g.legal().find((a) => a.type === 'activateAbility' && a.source === aura)!;
    g.do(act);
    done(g);
    expect(hand(g)).toEqual(['wingspan-stride']);
    expect(pt(g, lions)).toEqual([2, 1]);
  });

  it('Fresh Start: flash; enchanted creature gets -5/-0 and loses all abilities', () => {
    const g = game({
      p1: { hand: ['fresh-start'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(keywords(g, g.id('p1', 'fresh-start', 'hand')).has('flash')).toBe(true);
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'fresh-start', [tgt(g, angel)]);
    done(g);
    expect(pt(g, angel)).toEqual([-1, 4]);
    expect(keywords(g, angel).has('flying')).toBe(false);
    expect(keywords(g, angel).has('vigilance')).toBe(false);
  });
});
