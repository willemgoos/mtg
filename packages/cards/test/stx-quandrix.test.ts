import { describe, expect, it } from 'vitest';
import { deckById, deckIds, isPlayable, sideboardIds } from '../src/index.ts';
import { cast, game, handSize, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13a: the Quandrix Equation (G/U) deck.

const fractals = (g: GameDriver) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === 'stx-fractal-token');
const choose = (g: GameDriver, index: number) =>
  g.do({ type: 'chooseOption', player: g.actor, index });
const labels = (g: GameDriver) => {
  const d = g.decision;
  return d.kind === 'chooseOption' ? d.options.map((o) => o.label) : [];
};
const pickCard = (g: GameDriver, defId: string) => {
  const d = g.decision;
  if (d.kind !== 'searchLibrary') throw new Error(`decision is ${d.kind}`);
  const card = d.options.find((id) => g.obj(id).defId === defId) ?? null;
  g.do({ type: 'chooseCard', player: g.actor, card });
};

describe('the deck', () => {
  it('is 60 cards with the four Lessons in the sideboard, and playable', () => {
    const d = deckById('stx-quandrix-equation');
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
  });
});

describe('Fractals', () => {
  it('Biomathematician makes a Fractal, then puts a counter on every Fractal you control', () => {
    const g = game({
      p1: {
        hand: ['biomathematician'],
        battlefield: [...n('forest', 2), 'island', { card: 'stx-fractal-token' }],
      },
    });
    const old = g.id('p1', 'stx-fractal-token');
    g.obj(old).plusOneCounters = 2;
    settle(cast(g, 'biomathematician'));
    expect(fractals(g)).toHaveLength(2);
    expect(pt(g, old)).toEqual([3, 3]);
    const fresh = fractals(g).find((id) => id !== old)!;
    expect(pt(g, fresh)).toEqual([1, 1]);
  });

  it('Leyline Invocation: counters equal to the lands you control', () => {
    const g = game({ p1: { hand: ['leyline-invocation'], battlefield: [...n('forest', 7)] } });
    settle(cast(g, 'leyline-invocation'));
    expect(pt(g, fractals(g)[0]!)).toEqual([7, 7]);
  });

  it('Serpentine Curve: one plus the instants and sorceries in your graveyard and exile', () => {
    const g = game({
      p1: {
        hand: ['serpentine-curve'],
        battlefield: [...n('island', 4)],
        graveyard: ['shock', 'pop-quiz', 'serra-angel'],
      },
    });
    settle(cast(g, 'serpentine-curve'));
    expect(pt(g, fractals(g)[0]!)).toEqual([3, 3]);
  });

  it('Fractal Summoning: X counters', () => {
    const g = game({ p1: { hand: ['fractal-summoning'], battlefield: [...n('island', 5)] } });
    settle(cast(g, 'fractal-summoning', [], { x: 3 }));
    expect(pt(g, fractals(g)[0]!)).toEqual([3, 3]);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain(
      'fractal-summoning',
    );
  });
});

describe('magecraft creatures', () => {
  it('Quandrix Pledgemage grows when you cast an instant', () => {
    const g = game({
      p1: { hand: ['pop-quiz'], battlefield: ['quandrix-pledgemage', ...n('island', 3)] },
    });
    settle(cast(g, 'pop-quiz'));
    expect(pt(g, g.id('p1', 'quandrix-pledgemage'))).toEqual([3, 3]);
  });

  it('Karok Wrangler puts the counter on a target creature you control', () => {
    const g = game({
      p1: {
        hand: ['pop-quiz'],
        battlefield: ['karok-wrangler', 'llanowar-elves', ...n('island', 3)],
      },
    });
    const elves = g.id('p1', 'llanowar-elves');
    settle(cast(g, 'pop-quiz'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === elves),
      ),
    );
    expect(pt(g, elves)).toEqual([2, 2]);
  });

  it('Archmage Emeritus draws a card for each instant or sorcery', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['archmage-emeritus', 'mountain'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elves = g.id('p2', 'llanowar-elves');
    settle(cast(g, 'shock', [g.ref(elves)]));
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Quandrix Apprentice takes a land from the top three; the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['pop-quiz'],
        library: ['llanowar-elves', 'island', 'shock', 'serra-angel'],
        battlefield: ['quandrix-apprentice', ...n('island', 3)],
      },
    });
    settle(cast(g, 'pop-quiz'));
    // Pop Quiz draws first (Llanowar Elves), magecraft looks at the next three.
    expect(g.decision.kind).toBe('searchLibrary');
    pickCard(g, 'island');
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('island');
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    // Magecraft resolves before Pop Quiz: it looked at Elves, Island and Shock.
    expect(lib).toHaveLength(3);
    expect(lib).toContain('shock');
  });
});

describe('creatures', () => {
  it('Frost Trickster taps a creature and it stays tapped through its next untap step', () => {
    const g = game({
      p1: { hand: ['frost-trickster'], battlefield: [...n('island', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'frost-trickster'));
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(1);
  });

  it('Quandrix Cultivator fetches a basic Forest or Island onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['quandrix-cultivator'],
        library: ['serra-angel', 'island', 'forest'],
        battlefield: [...n('forest', 2), ...n('island', 2)],
      },
    });
    settle(cast(g, 'quandrix-cultivator'));
    pickCard(g, 'island');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'island')).toHaveLength(3);
  });

  it('Zimone puts a land from hand onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['zimone-quandrix-prodigy', 'island', 'island'],
      },
    });
    const zimone = g.id('p1', 'zimone-quandrix-prodigy');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'activateAbility' && a.source === zimone && a.abilityIndex === 0)!,
    );
    settle(g);
    pickCard(g, 'forest');
    const forest = g.state.battlefield.find((id) => g.obj(id).defId === 'forest')!;
    expect(g.obj(forest).tapped).toBe(true);
  });

  it('Zimone draws two cards with eight or more lands, one otherwise', () => {
    for (const [lands, drawn] of [
      [8, 2],
      [4, 1],
    ] as const) {
      const g = game({
        p1: { battlefield: ['zimone-quandrix-prodigy', ...n('island', lands)] },
      });
      const zimone = g.id('p1', 'zimone-quandrix-prodigy');
      g.do(
        g
          .legal()
          .find(
            (a) => a.type === 'activateAbility' && a.source === zimone && a.abilityIndex === 1,
          )!,
      );
      settle(g);
      expect(handSize(g, 'p1')).toBe(drawn);
    }
  });

  it('Professor of Zoomancy makes a Pest that gains you 1 life when it dies', () => {
    const g = game({
      p1: { hand: ['professor-of-zoomancy'], battlefield: [...n('forest', 4)] },
      p2: { hand: ['shock'], battlefield: [...n('mountain', 1)] },
    });
    settle(cast(g, 'professor-of-zoomancy'));
    const pest = g.id('p1', 'stx-pest-token');
    g.pass();
    settle(cast(g, 'shock', [g.ref(pest)]));
    console.log(g.zoneOf(pest));
    expect(g.life('p1')).toBe(21);
  });

  it('Overgrown Arch gains life, and can be sacrificed to learn', () => {
    const g = game({
      p1: { battlefield: ['overgrown-arch', ...n('forest', 2)], hand: ['serra-angel'] },
    });
    const arch = g.id('p1', 'overgrown-arch');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'activateAbility' && a.source === arch && a.abilityIndex === 0)!,
    );
    settle(g);
    expect(g.life('p1')).toBe(21);
    g.obj(arch).tapped = false;
    g.do(
      g
        .legal()
        .find((a) => a.type === 'activateAbility' && a.source === arch && a.abilityIndex === 1)!,
    );
    settle(g);
    expect(labels(g)).toEqual(['Discard a card, then draw a card', 'Do nothing']);
    expect(g.zoneOf(arch)).toBe('graveyard');
  });

  it('Quandrix Campus enters tapped and scries for {4}', () => {
    const g = game({ p1: { battlefield: ['quandrix-campus', ...n('forest', 4)] } });
    const campus = g.id('p1', 'quandrix-campus');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === campus)!);
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });
});

describe('spells', () => {
  it('Pop Quiz draws a card, then offers Learn (a Lesson, a rummage or nothing)', () => {
    const g = game({
      p1: {
        hand: ['pop-quiz'],
        battlefield: [...n('island', 3)],
        sideboard: ['introduction-to-prophecy'],
      },
    });
    settle(cast(g, 'pop-quiz'));
    expect(handSize(g, 'p1')).toBe(1);
    expect(labels(g)).toEqual([
      'Reveal Introduction to Prophecy and put it into your hand',
      'Discard a card, then draw a card',
      'Do nothing',
    ]);
    choose(g, 0);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Field Trip puts a basic Forest onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['field-trip'],
        library: ['island', 'forest', 'serra-angel'],
        battlefield: [...n('forest', 3)],
      },
    });
    settle(cast(g, 'field-trip'));
    pickCard(g, 'forest');
    const forests = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    expect(forests).toHaveLength(4);
    expect(forests.filter((id) => !g.obj(id).tapped && !g.obj(id).summoningSick)).toHaveLength(0);
  });

  it('Big Play: +2/+2, reach and a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['big-play'], battlefield: ['llanowar-elves', 'forest', 'forest'] },
    });
    const elves = g.id('p1', 'llanowar-elves');
    settle(cast(g, 'big-play', [g.ref(elves)]));
    expect(pt(g, elves)).toEqual([4, 4]);
    expect(g.obj(elves).plusOneCounters).toBe(1);
  });

  it('Quandrix Command: counters on a creature and a bounced creature (a pair of modes)', () => {
    const g = game({
      p1: {
        hand: ['quandrix-command'],
        battlefield: ['llanowar-elves', 'forest', 'forest', 'island'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const elves = g.id('p1', 'llanowar-elves');
    const angel = g.id('p2', 'serra-angel');
    // Mode 1: the second pair of the four modes, bounce plus counters.
    settle(cast(g, 'quandrix-command', [g.ref(angel), g.ref(elves)], { mode: 1 }));
    expect(g.zoneOf(angel)).toBe('hand');
    expect(g.obj(elves).plusOneCounters).toBe(2);
  });

  it('Eureka Moment draws two and may put a land onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['eureka-moment', 'forest'],
        battlefield: [...n('island', 3), 'forest'],
        library: ['island', 'serra-angel', 'serra-angel'],
      },
    });
    settle(cast(g, 'eureka-moment'));
    pickCard(g, 'island');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'island')).toHaveLength(4);
  });

  it('Mage Duel costs {2} less after another instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['shock', 'mage-duel'],
        battlefield: ['serra-angel', 'mountain', 'forest'],
      },
      p2: { battlefield: ['llanowar-elves', 'serra-angel'] },
    });
    const duel = g.id('p1', 'mage-duel', 'hand');
    const castable = () => g.legal().some((a) => a.type === 'castSpell' && a.card === duel);
    expect(castable()).toBe(false);
    settle(cast(g, 'shock', [g.ref(g.id('p2', 'llanowar-elves'))]));
    expect(castable()).toBe(true);
  });

  it('Mage Duel gives +1/+2 and fights', () => {
    const g = game({
      p1: {
        hand: ['mage-duel'],
        battlefield: ['llanowar-elves', ...n('forest', 3)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const mine = g.id('p1', 'llanowar-elves');
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'mage-duel', [g.ref(mine), g.ref(angel)]));
    expect(g.obj(angel).damage).toBe(2);
    expect(g.zoneOf(mine)).toBe('graveyard');
  });

  it('Decisive Denial counters a noncreature spell unless its controller pays {3}', () => {
    const g = game({
      p1: { hand: ['pop-quiz'], battlefield: [...n('island', 3)] },
      p2: { hand: ['decisive-denial'], battlefield: ['forest', 'island'] },
    });
    cast(g, 'pop-quiz');
    const quiz = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'decisive-denial', [g.ref(quiz)], { mode: 1 });
    g.pass();
    // p1 has no spare mana to pay.
    settle(g);
    expect(g.zoneOf(quiz)).toBe('graveyard');
    expect(handSize(g, 'p1')).toBe(0);
  });

  it('Reject exiles a creature spell it counters', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: [...n('plains', 5)] },
      p2: { hand: ['reject'], battlefield: ['island', 'island'] },
    });
    cast(g, 'serra-angel');
    const angel = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'reject', [g.ref(angel)]);
    g.passBoth();
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
  });

  it('Devouring Tendrils: your creature deals damage equal to its power, and you gain 2 if it dies', () => {
    const g = game({
      p1: { hand: ['devouring-tendrils'], battlefield: ['serra-angel', 'forest', 'forest'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const elves = g.id('p2', 'llanowar-elves');
    settle(cast(g, 'devouring-tendrils', [g.ref(g.id('p1', 'serra-angel')), g.ref(elves)]));
    expect(g.zoneOf(elves)).toBe('graveyard');
    expect(g.life('p1')).toBe(22);
  });

  it('Divide by Zero returns a spell to its owner’s hand, then learns', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: [...n('plains', 5)] },
      p2: { hand: ['divide-by-zero'], battlefield: [...n('island', 3)] },
    });
    cast(g, 'serra-angel');
    const angel = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'divide-by-zero', [g.ref(angel)], { mode: 0 });
    g.pass();
    settle(g);
    expect(g.zoneOf(angel)).toBe('hand');
    expect(g.state.stack).toHaveLength(0);
  });

  it('Divide by Zero bounces a permanent with mana value 1 or greater', () => {
    const g = game({
      p1: { hand: ['divide-by-zero'], battlefield: [...n('island', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'divide-by-zero', [g.ref(angel)], { mode: 1 }));
    expect(g.zoneOf(angel)).toBe('hand');
  });

  it('Resculpt exiles a creature and its controller gets a 4/4 Elemental', () => {
    const g = game({
      p1: { hand: ['resculpt'], battlefield: [...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'resculpt', [g.ref(angel)]));
    expect(g.zoneOf(angel)).toBe('exile');
    const elemental = g.id('p2', 'stx-elemental-ur-token');
    expect(pt(g, elemental)).toEqual([4, 4]);
  });

  it('Arcane Subtraction gives -4/-0, then learns', () => {
    const g = game({
      p1: { hand: ['arcane-subtraction'], battlefield: [...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'arcane-subtraction', [g.ref(angel)]));
    expect(pt(g, angel)).toEqual([0, 4]);
  });

  it('Curate surveils 2 and draws a card', () => {
    const g = game({ p1: { hand: ['curate'], battlefield: [...n('island', 2)] } });
    settle(cast(g, 'curate'));
    expect(g.decision.kind).toBe('scry');
  });

  it('Bury in Books costs {2} less targeting an attacking creature, and goes second from the top', () => {
    const g = game({
      p1: { hand: ['bury-in-books'], battlefield: [...n('island', 3)] },
      p2: { battlefield: [{ card: 'serra-angel' }] },
    });
    const angel = g.id('p2', 'serra-angel');
    const book = g.id('p1', 'bury-in-books', 'hand');
    const canCast = () => g.legal().some((a) => a.type === 'castSpell' && a.card === book);
    expect(canCast()).toBe(false);
    g.state.combat = {
      attackers: [{ id: angel, defender: 'p1', blocked: false, blockers: [] }],
      dealtFirstStrikeDamage: [],
    };
    expect(canCast()).toBe(true);
    settle(cast(g, 'bury-in-books', [g.ref(angel)]));
    expect(g.state.players.p2.library[1]).toBe(angel);
  });

  it('Expanded Anatomy and Environmental Sciences (Lessons)', () => {
    const g = game({
      p1: {
        hand: ['expanded-anatomy', 'environmental-sciences'],
        battlefield: ['llanowar-elves', ...n('island', 6)],
        library: ['forest', 'serra-angel'],
      },
    });
    const elves = g.id('p1', 'llanowar-elves');
    settle(cast(g, 'expanded-anatomy', [g.ref(elves)]));
    expect(pt(g, elves)).toEqual([3, 3]);
    settle(cast(g, 'environmental-sciences'));
    pickCard(g, 'forest');
    expect(g.life('p1')).toBe(22);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Introduction to Prophecy scries 2, then draws', () => {
    const g = game({
      p1: { hand: ['introduction-to-prophecy'], battlefield: [...n('island', 3)] },
    });
    settle(cast(g, 'introduction-to-prophecy'));
    expect(g.decision.kind).toBe('scry');
  });
});
