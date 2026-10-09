import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt } from './blb-helpers.ts';
import {
  activate,
  chars,
  combat,
  done,
  gy,
  hand,
  keywords,
  library,
  minus,
  onStack,
  stun,
  tappedLands,
  targeting,
  toStep,
} from './ecl-blue-helpers.ts';

// Lorwyn Eclipsed 18b: the blue cards (first half; the rest is in ecl-blue-more.test.ts).

/** The printed shape of every card in the group. */
describe('data', () => {
  it('has printed characteristics', () => {
    const g = game({ p1: { hand: ['loch-mare', 'omni-changeling', 'kulrath-mystic'] } });
    expect(pt(g, g.id('p1', 'loch-mare', 'hand'))).toEqual([4, 5]);
    expect(keywords(g, g.id('p1', 'omni-changeling', 'hand')).has('changeling')).toBe(true);
    expect(pt(g, g.id('p1', 'kulrath-mystic', 'hand'))).toEqual([2, 4]);
  });
});

describe('Wild Unraveling', () => {
  const setup = (p1: Parameters<typeof game>[0]['p1']) => {
    const g = game({
      active: 'p2',
      p1,
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
    cast(g, 'savannah-lions');
    g.pass();
    return g;
  };

  it('pay {1}: counters target spell', () => {
    const g = setup({ hand: ['wild-unraveling'], battlefield: n('island', 3) });
    const lions = g.state.stack[0]!.id;
    cast(g, 'wild-unraveling', [onStack(g, lions)]);
    done(g);
    expect(gy(g, 'p2')).toContain('savannah-lions');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(tappedLands(g)).toBe(3);
  });

  it('blight 2 instead: two -1/-1 counters on a creature you control, only {U}{U}', () => {
    const g = setup({ hand: ['wild-unraveling'], battlefield: [...n('island', 2), 'serra-angel'] });
    const angel = g.id('p1', 'serra-angel');
    const lions = g.state.stack[0]!.id;
    const options = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'wild-unraveling', 'hand'));
    expect(options.some((a) => a.type === 'castSpell' && a.blight === angel)).toBe(true);
    cast(g, 'wild-unraveling', [onStack(g, lions)], { blight: angel });
    done(g);
    expect(minus(g, angel)).toBe(2);
    expect(gy(g, 'p2')).toContain('savannah-lions');
    expect(tappedLands(g)).toBe(2);
  });
});

describe('Spell Snare', () => {
  it('counters a spell with mana value 2 only', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['spell-snare'], battlefield: ['island'] },
      p2: {
        hand: ['summit-sentinel', 'serra-angel', 'savannah-lions'],
        battlefield: [...n('plains', 8), 'island'],
      },
    });
    cast(g, 'serra-angel');
    g.pass();
    const angel = g.state.stack[0]!.id;
    const legal = () =>
      g
        .legal()
        .filter(
          (a) =>
            a.type === 'castSpell' &&
            a.card === g.id('p1', 'spell-snare', 'hand') &&
            a.targets.some((t) => 'object' in t && t.object.id === angel),
        );
    expect(legal()).toHaveLength(0);
    g.pass(); // p1 passes; the angel resolves
    done(g);
    // Savannah Lions has mana value 1: not a legal target.
    cast(g, 'savannah-lions');
    g.pass();
    expect(
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'spell-snare', 'hand')),
    ).toBe(false);
    g.pass();
    done(g);
    cast(g, 'summit-sentinel');
    g.pass();
    const sentinel = g.state.stack[0]!.id;
    cast(g, 'spell-snare', [onStack(g, sentinel)]);
    done(g);
    expect(gy(g, 'p2')).toContain('summit-sentinel');
  });
});

describe('Shinestriker', () => {
  it('draws a card for each color among permanents you control', () => {
    const g = game({
      p1: {
        hand: ['shinestriker'],
        battlefield: [...n('island', 6), 'savannah-lions', 'llanowar-elves', 'vampire-nighthawk'],
        library: n('forest', 8),
      },
    });
    cast(g, 'shinestriker');
    done(g);
    // Shinestriker (blue), Savannah Lions (white), Llanowar Elves (green), Vampire Nighthawk (black).
    expect(hand(g)).toHaveLength(4);
  });
});

describe('Glen Elendra Guardian', () => {
  it('has flash, flying and enters with a -1/-1 counter', () => {
    const g = game({ p1: { hand: ['glen-elendra-guardian'], battlefield: n('island', 3) } });
    cast(g, 'glen-elendra-guardian');
    done(g);
    const guardian = g.id('p1', 'glen-elendra-guardian');
    expect(minus(g, guardian)).toBe(1);
    expect(pt(g, guardian)).toEqual([2, 3]);
    expect(keywords(g, guardian).has('flying')).toBe(true);
    expect(keywords(g, guardian).has('flash')).toBe(true);
  });

  it('{1}{U}, remove a counter: counter target noncreature spell; its controller draws a card', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['glen-elendra-guardian', ...n('island', 2)] },
      p2: { hand: ['shock'], battlefield: ['mountain'], library: n('forest', 5) },
    });
    const guardian = g.id('p1', 'glen-elendra-guardian');
    g.obj(guardian).counters = { '-1/-1': 1 };
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    activate(g, guardian, 0, [onStack(g, g.state.stack[0]!.id)]);
    done(g);
    expect(minus(g, guardian)).toBe(0);
    expect(gy(g, 'p2')).toContain('shock');
    expect(g.life('p1')).toBe(20);
    expect(hand(g, 'p2')).toEqual(['forest']);
  });

  it("can't target a creature spell", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['glen-elendra-guardian', ...n('island', 2)] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
    const guardian = g.id('p1', 'glen-elendra-guardian');
    g.obj(guardian).counters = { '-1/-1': 1 };
    cast(g, 'savannah-lions');
    g.pass();
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === guardian)).toBe(
      false,
    );
  });
});

describe("Glen Elendra's Answer", () => {
  it("counters all of the opponent's spells and abilities and makes a Faerie for each; can't be countered", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['glen-elendras-answer'], battlefield: n('island', 4) },
      p2: {
        hand: ['shock', 'shock'],
        battlefield: n('mountain', 2),
      },
    });
    // Two opposing spells, and an opposing trigger (Stratosoarer's enters trigger would be a third; use a cast).
    cast(g, 'shock', [{ player: 'p1' }]);
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    expect(g.state.stack).toHaveLength(2);
    cast(g, 'glen-elendras-answer');
    expect(cardDb.get('glen-elendras-answer')!.uncounterable).toBe(true);
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock', 'shock']);
    expect(g.life('p1')).toBe(20);
    expect(all(g, 'ecl-faerie-token')).toHaveLength(2);
    expect(g.state.stack).toHaveLength(0);
  });

  it('does nothing to its own controller spells and makes no token with nothing to counter', () => {
    const g = game({ p1: { hand: ['glen-elendras-answer'], battlefield: n('island', 4) } });
    cast(g, 'glen-elendras-answer');
    done(g);
    expect(all(g, 'ecl-faerie-token')).toHaveLength(0);
    expect(gy(g)).toEqual(['glen-elendras-answer']);
  });
});

describe('Mirrorform', () => {
  it('each nonland permanent you control becomes a copy of the target non-Aura permanent, for good', () => {
    const g = game({
      p1: {
        hand: ['mirrorform'],
        battlefield: [...n('island', 6), 'savannah-lions', 'pestered-wellguard'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'mirrorform', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    const lions = all(g, 'serra-angel');
    expect(lions).toHaveLength(3);
    for (const id of lions.filter((x) => g.obj(x).controller === 'p1'))
      expect(pt(g, id)).toEqual([4, 4]);
    expect(all(g, 'island')).toHaveLength(6);
    // Still copies on later turns.
    g.state.turn.number += 2;
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it("can't target an Aura", () => {
    const g = game({
      p1: {
        hand: ['mirrorform'],
        battlefield: [...n('island', 6), 'savannah-lions', 'blossombind'],
      },
    });
    const bind = g.id('p1', 'blossombind');
    g.obj(bind).attachedTo = g.id('p1', 'savannah-lions');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets.some((t) => 'object' in t && t.object.id === bind)).toBe(false);
    expect(targets.some((t) => 'object' in t && t.object.id === g.id('p1', 'savannah-lions'))).toBe(
      true,
    );
  });
});

describe('Noggle the Mind', () => {
  it('enchanted creature loses all abilities and is a colorless Noggle 1/1', () => {
    const g = game({
      p1: { hand: ['noggle-the-mind'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'noggle-the-mind', [g.ref(angel)]);
    done(g);
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(keywords(g, angel).size).toBe(0);
    expect(chars(g, angel).subtypes).toEqual(['Noggle']);
    expect(g.state.battlefield.includes(angel)).toBe(true);
    expect(cardDbColors(g, angel)).toEqual([]);
  });

  it('everything is restored when the Aura leaves the battlefield', () => {
    const g = game({
      p1: { hand: ['noggle-the-mind'], battlefield: n('island', 2) },
      p2: { hand: ['disruptor-of-currents'], battlefield: [...n('island', 5), 'serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'noggle-the-mind', [g.ref(angel)]);
    done(g);
    expect(pt(g, angel)).toEqual([1, 1]);
    // p2 flashes in Disruptor of Currents and returns the Aura to p1's hand.
    const aura = g.id('p1', 'noggle-the-mind');
    g.pass();
    expect(g.actor).toBe('p2');
    cast(g, 'disruptor-of-currents');
    done(g, { pick: targeting(aura) });
    expect(hand(g)).toEqual(['noggle-the-mind']);
    expect(pt(g, angel)).toEqual([4, 4]);
    expect(keywords(g, angel).has('flying')).toBe(true);
    expect(chars(g, angel).subtypes).toEqual(['Angel']);
    expect(g.obj(angel).colorless).toBeFalsy();
    expect(g.obj(angel).blank).toBeFalsy();
  });

  it('has flash', () => {
    const g = game({ p1: { hand: ['noggle-the-mind'] } });
    expect(keywords(g, g.id('p1', 'noggle-the-mind', 'hand')).has('flash')).toBe(true);
  });
});

function cardDbColors(g: GameDriver, id: string): string[] {
  // Colors as the engine sees them: through the matching filter for each color.
  return ['W', 'U', 'B', 'R', 'G'].filter(
    (c) =>
      g.engine && cardDb.get(g.obj(id).defId)!.colors.includes(c as never) && !g.obj(id).colorless,
  );
}

describe('Harmonized Crescendo', () => {
  it('convoke; draws a card for each permanent you control of the chosen type', () => {
    const g = game({
      p1: {
        hand: ['harmonized-crescendo'],
        battlefield: [
          ...n('island', 4),
          'pestered-wellguard',
          'silvergill-peddler',
          'savannah-lions',
        ],
        library: n('forest', 8),
      },
    });
    // Two Merfolk (and {4}{U}{U}: four lands plus the two Merfolk tapped for convoke).
    cast(g, 'harmonized-crescendo');
    done(g, { option: /^Merfolk$/ });
    expect(hand(g)).toHaveLength(2);
  });
});

describe('Disruptor of Currents', () => {
  it('has flash and convoke; returns up to one other target nonland permanent', () => {
    const g = game({
      p1: { hand: ['disruptor-of-currents'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel', 'plains'] },
    });
    cast(g, 'disruptor-of-currents');
    done(g, {
      pick: (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0),
    });
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(all(g, 'plains')).toHaveLength(1);
  });

  it('convoke: creatures pay for it', () => {
    const g = game({
      p1: {
        hand: ['disruptor-of-currents'],
        battlefield: [...n('island', 2), 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
    });
    cast(g, 'disruptor-of-currents');
    done(g);
    expect(all(g, 'disruptor-of-currents')).toHaveLength(1);
  });
});

describe('Swat Away', () => {
  it('costs {2} less if a creature is attacking you', () => {
    const g = game({
      active: 'p2',
      step: 'declareAttackers',
      p1: { hand: ['swat-away'], battlefield: n('island', 2) },
      p2: { battlefield: ['savannah-lions'] },
    });
    // No attack: {2}{U}{U} can't be paid with two lands.
    expect(g.legal('p1').some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('the owner puts the target creature on the top or bottom of their library (their choice)', () => {
    const g = game({
      p1: { hand: ['swat-away'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'swat-away', [g.ref(angel)]);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    done(g);
    expect(library(g, 'p2').at(-1)).toBe('serra-angel');
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('top of the library', () => {
    const g = game({
      p1: { hand: ['swat-away'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'swat-away', [g.ref(g.id('p2', 'serra-angel'))]);
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(library(g, 'p2')[0]).toBe('serra-angel');
  });

  it('can target a spell: its owner puts it on their library', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['swat-away'], battlefield: n('island', 4) },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
    cast(g, 'savannah-lions');
    g.pass();
    const lions = g.state.stack[0]!.id;
    cast(g, 'swat-away', [onStack(g, lions)]);
    g.pass();
    g.pass();
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(library(g, 'p2')[0]).toBe('savannah-lions');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Temporal Cleansing', () => {
  it('the owner puts the nonland permanent second from the top or on the bottom of their library', () => {
    const g = game({
      p1: { hand: ['temporal-cleansing'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'], library: ['forest', 'island', 'plains'] },
    });
    cast(g, 'temporal-cleansing', [g.ref(g.id('p2', 'serra-angel'))]);
    g.pass();
    g.pass();
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(library(g, 'p2')).toEqual(['forest', 'serra-angel', 'island', 'plains']);
  });

  it('bottom', () => {
    const g = game({
      p1: { hand: ['temporal-cleansing'], battlefield: n('island', 4) },
      p2: { battlefield: ['serra-angel'], library: ['forest', 'island', 'plains'] },
    });
    cast(g, 'temporal-cleansing', [g.ref(g.id('p2', 'serra-angel'))]);
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    done(g);
    expect(library(g, 'p2').at(-1)).toBe('serra-angel');
  });
});

describe('Gravelgill Scoundrel', () => {
  it('may tap another untapped creature; if it does, it cannot be blocked this turn', () => {
    const g = combat(['gravelgill-scoundrel', 'savannah-lions'], ['serra-angel']);
    const scoundrel = g.id('p1', 'gravelgill-scoundrel');
    g.attack(scoundrel);
    done(g, { option: /Tap Savannah Lions/ });
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    // The opponent has no legal block of it.
    if (g.decision.kind === 'declareBlockers')
      expect(g.legal().some((a) => a.type === 'addBlock')).toBe(false);
    toStep(g, 'endCombat');
    expect(g.life('p2')).toBe(19);
  });

  it('declining leaves it blockable', () => {
    const g = combat(['gravelgill-scoundrel', 'savannah-lions'], ['serra-angel']);
    g.attack(g.id('p1', 'gravelgill-scoundrel'));
    done(g, { option: /Don't tap/ });
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(false);
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    expect(g.legal().some((a) => a.type === 'addBlock')).toBe(true);
  });

  it('has vigilance and no choice without another untapped creature', () => {
    const g = combat(['gravelgill-scoundrel']);
    const s = g.id('p1', 'gravelgill-scoundrel');
    expect(keywords(g, s).has('vigilance')).toBe(true);
    g.attack(s);
    expect(g.decision.kind).not.toBe('chooseOption');
  });
});

describe('Kulrath Mystic', () => {
  it('gets +2/+0 and vigilance when you cast a spell with mana value 4 or greater', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: [...n('plains', 5), 'kulrath-mystic'] },
    });
    const mystic = g.id('p1', 'kulrath-mystic');
    cast(g, 'serra-angel');
    done(g);
    expect(pt(g, mystic)).toEqual([4, 4]);
    expect(keywords(g, mystic).has('vigilance')).toBe(true);
  });

  it('smaller spells do nothing', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'kulrath-mystic'] },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(pt(g, g.id('p1', 'kulrath-mystic'))).toEqual([2, 4]);
  });
});

describe('Tanufel Rimespeaker', () => {
  it('draws a card whenever you cast a spell with mana value 4 or greater', () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'savannah-lions'],
        battlefield: [...n('plains', 6), 'tanufel-rimespeaker'],
        library: n('forest', 5),
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(hand(g)).toEqual(['serra-angel']);
    cast(g, 'serra-angel');
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Blossombind', () => {
  it('taps the creature; it cannot untap or get counters', () => {
    const g = game({
      p1: { hand: ['blossombind'], battlefield: n('island', 2) },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'blossombind', [g.ref(lions)]);
    done(g);
    expect(g.obj(lions).tapped).toBe(true);
    // Through its controller's untap step.
    toStep(g, 'main1');
    g.passUntilStep('main1');
    expect(g.obj(lions).tapped).toBe(true);
  });

  it("can't become untapped by an effect", () => {
    const g = game({
      p1: { hand: ['blossombind', 'glamermite'], battlefield: n('island', 5) },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'blossombind', [g.ref(lions)]);
    done(g);
    expect(g.obj(lions).tapped).toBe(true);
    // Glamermite: untap target creature.
    cast(g, 'glamermite');
    done(g, { pick: (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 1) });
    expect(g.obj(lions).tapped).toBe(true);
  });

  it("can't have counters put on it (not even a stun counter)", () => {
    const g = game({
      p1: { hand: ['blossombind', 'rime-chill'], battlefield: n('island', 8) },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'blossombind', [g.ref(lions)]);
    done(g);
    cast(g, 'rime-chill', [g.ref(lions)]);
    done(g);
    expect(stun(g, lions)).toBe(0);
  });
});
