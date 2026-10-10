import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  chars,
  counters,
  done,
  gy,
  hand,
  keywords,
  toStep,
} from './tdm-green-helpers.ts';

// The Lord of the Rings 21b: green cards.

const NAMES = [
  "Bombadil's Song",
  'Brandywine Farmer',
  'Celeborn the Wise',
  'Chance-Met Elves',
  'Dúnedain Rangers',
  'Elanor Gardner',
  'Enraged Huorn',
  "Ent's Fury",
  'Entish Restoration',
  'Galadhrim Bow',
  'Galadhrim Guide',
  'Gift of Strands',
  'Glorfindel, Dauntless Rescuer',
  'Lothlórien Lookout',
  'Meriadoc Brandybuck',
  'Mirkwood Channeler',
  'Mirkwood Spider',
  'Mirrormere Guardian',
  'Peregrin Took',
  "Pippin's Bravery",
  'Quickbeam, Upstart Ent',
  'Revive the Shire',
  'Shower of Arrows',
  'Stew the Coneys',
  'Wose Pathfinder',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Resolves everything (bounded): scries keep the cards on top, triggers take their first real target, options take `option`. */
function run(g: GameDriver, option: number | RegExp = 0): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
    else if (d.kind === 'chooseOption') {
      const index =
        option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => option.test(o.label)),
            )
          : option;
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'sacrificeSeveral') {
      const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action;
      g.do(pick);
    } else if (d.kind === 'chooseObject') {
      // Choosing a Ring-bearer: the first creature on offer.
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action);
    } else if (d.kind === 'searchLibrary') done(g);
    else break;
  }
  return g;
}
const ring = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring;
const types = (g: GameDriver, id: string) => [...chars(g, id).types];
const foods = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => bf(g, 'food-token', p);
/** Passes to the declare-attackers step of p1 and attacks with these. */
function attackWith(g: GameDriver, ...ids: string[]) {
  toStep(g, 'beginCombat');
  g.passBoth();
  g.attack(...ids);
  return g;
}
/** Passes priority until p2 declares blockers. */
function toBlockers(g: GameDriver) {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareBlockers');
  return g;
}
describe('every card is in the pool', () => {
  it('has all 25 green cards', () => {
    expect(NAMES).toHaveLength(25);
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe("Bombadil's Song", () => {
  it('gives +1/+1 and hexproof until end of turn, then the Ring tempts you', () => {
    const g = game({
      p1: { hand: ['bombadils-song'], battlefield: [...n('forest', 2), 'ordinary-bear'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'bombadils-song', [g.ref(bear)]);
    run(g);
    expect(pt(g, bear)).toEqual([5, 6]);
    expect(keywords(g, bear)).toContain('hexproof');
    expect(ring(g)?.tempted).toBe(1);
    expect(ring(g)?.bearer?.id).toBe(bear);
  });
});

describe('Brandywine Farmer', () => {
  it('creates a Food when it enters', () => {
    const g = game({ p1: { hand: ['brandywine-farmer'], battlefield: n('forest', 3) } });
    cast(g, 'brandywine-farmer');
    run(g);
    expect(foods(g)).toHaveLength(1);
  });
  it('creates a Food when it leaves the battlefield', () => {
    const g = game({
      p1: { battlefield: [...n('forest', 2), 'brandywine-farmer'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.pass();
    cast(g, 'shock', [g.ref(g.id('p1', 'brandywine-farmer'))]);
    run(g);
    expect(gy(g)).toContain('brandywine-farmer');
    expect(foods(g)).toHaveLength(1);
  });
});

describe('Celeborn the Wise', () => {
  it('scries 1 when you attack with an Elf, and gets +1/+1 for each card looked at', () => {
    const g = game({ p1: { battlefield: ['celeborn-the-wise'] } });
    const id = g.id('p1', 'celeborn-the-wise');
    attackWith(g, id);
    run(g);
    expect(pt(g, id)).toEqual([4, 4]);
  });
  it('gets +2/+2 from a scry 2', () => {
    const g = game({
      p1: { hand: ['galadhrim-guide'], battlefield: [...n('forest', 4), 'celeborn-the-wise'] },
    });
    cast(g, 'galadhrim-guide');
    run(g);
    expect(pt(g, g.id('p1', 'celeborn-the-wise'))).toEqual([5, 5]);
  });
  it('gets +1/+1 for one card when the library has one card (fewer cards looked at)', () => {
    const g = game({
      p1: {
        hand: ['galadhrim-guide'],
        battlefield: [...n('forest', 4), 'celeborn-the-wise'],
        library: ['forest'],
      },
    });
    cast(g, 'galadhrim-guide');
    run(g);
    expect(pt(g, g.id('p1', 'celeborn-the-wise'))).toEqual([4, 4]);
  });
  it('does not scry when you attack with no Elf', () => {
    const g = game({ p1: { battlefield: ['celeborn-the-wise', 'ordinary-bear'] } });
    const bear = g.id('p1', 'ordinary-bear');
    attackWith(g, bear);
    run(g);
    expect(pt(g, g.id('p1', 'celeborn-the-wise'))).toEqual([3, 3]);
  });
});

describe('Chance-Met Elves', () => {
  it('gets a +1/+1 counter when you scry, only once each turn', () => {
    const g = game({
      p1: {
        hand: ['galadhrim-guide', 'lothl-rien-lookout'],
        battlefield: [...n('forest', 6), 'chance-met-elves'],
      },
    });
    const elves = g.id('p1', 'chance-met-elves');
    cast(g, 'galadhrim-guide');
    run(g);
    expect(counters(g, elves)).toBe(1);
    // A second scry in the same turn (the Lookout attacking is not possible: cast a second Guide instead).
    const g2 = game({
      p1: {
        hand: ['galadhrim-guide', 'galadhrim-guide'],
        battlefield: [...n('forest', 8), 'chance-met-elves'],
      },
    });
    cast(g2, 'galadhrim-guide');
    run(g2);
    cast(g2, 'galadhrim-guide');
    run(g2);
    expect(counters(g2, g2.id('p1', 'chance-met-elves'))).toBe(1);
  });
});

describe('Dúnedain Rangers', () => {
  it('tempts you with landfall when you control no Ring-bearer', () => {
    const g = game({ p1: { hand: ['forest', 'forest'], battlefield: ['d-nedain-rangers'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    run(g);
    expect(ring(g)?.tempted).toBe(1);
    expect(ring(g)?.bearer?.id).toBe(g.id('p1', 'd-nedain-rangers'));
  });
  it('does not tempt you when you already control a Ring-bearer', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['d-nedain-rangers'] } });
    g.state.players.p1.ring = {
      tempted: 1,
      bearer: {
        id: g.id('p1', 'd-nedain-rangers'),
        zcc: g.obj(g.id('p1', 'd-nedain-rangers')).zcc,
      },
    };
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    run(g);
    expect(ring(g)?.tempted).toBe(1);
  });
});

describe('Elanor Gardner', () => {
  it('creates a Food when it enters', () => {
    const g = game({ p1: { hand: ['elanor-gardner'], battlefield: n('forest', 4) } });
    cast(g, 'elanor-gardner');
    run(g);
    expect(foods(g)).toHaveLength(1);
  });
  it('at your end step, if you sacrificed a Food this turn, you may fetch a basic land tapped', () => {
    const g = game({
      p1: {
        battlefield: ['elanor-gardner', 'food-token', ...n('forest', 2)],
        library: ['island', 'forest'],
      },
    });
    const food = g.id('p1', 'food-token');
    activate(g, food, abilityIndex('food-token', 'activated'));
    run(g);
    expect(g.state.players.p1.life).toBe(23);
    toStep(g, 'end');
    run(g);
    const lands = g.state.battlefield.filter(
      (id) => g.obj(id).controller === 'p1' && types(g, id).includes('Land'),
    );
    expect(lands).toHaveLength(3);
    // The fetched land entered tapped.
    expect(lands.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(1);
  });
  it('does nothing at the end step without a sacrificed Food', () => {
    const g = game({
      p1: { battlefield: ['elanor-gardner', 'food-token', ...n('forest', 2)], library: ['island'] },
    });
    toStep(g, 'end');
    run(g);
    expect(g.state.battlefield.filter((id) => types(g, id).includes('Land'))).toHaveLength(2);
  });
  it('declining the search leaves the library alone', () => {
    const g = game({
      p1: { battlefield: ['elanor-gardner', 'food-token', ...n('forest', 2)], library: ['island'] },
    });
    activate(g, g.id('p1', 'food-token'), abilityIndex('food-token', 'activated'));
    run(g);
    for (let i = 0; i < 30 && !g.legal().some((a) => a.type === 'chooseEffect'); i++) {
      if (g.decision.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: 'p1' });
      else g.pass();
    }
    expect(g.legal().some((a) => a.type === 'chooseEffect')).toBe(true);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    run(g);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});

describe('Enraged Huorn', () => {
  it('has trample and tempts you when it enters', () => {
    const g = game({ p1: { hand: ['enraged-huorn'], battlefield: n('forest', 5) } });
    cast(g, 'enraged-huorn');
    run(g);
    const id = g.id('p1', 'enraged-huorn');
    expect(keywords(g, id)).toContain('trample');
    expect(ring(g)?.tempted).toBe(1);
    expect(ring(g)?.bearer?.id).toBe(id);
  });
});

describe("Ent's Fury", () => {
  it('puts a counter on a creature with power 4 or greater, pumps it and fights', () => {
    const g = game({
      p1: { hand: ['ents-fury'], battlefield: [...n('forest', 2), 'ordinary-bear'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'ents-fury', [g.ref(bear), g.ref(angel)]);
    run(g);
    // 4/5 + counter + 1/+1 = 6/7; the Angel (4/4) takes 6 and dies; the Bear takes 4.
    expect(pt(g, bear)).toEqual([6, 7]);
    expect(counters(g, bear)).toBe(1);
    expect(g.obj(bear).damage).toBe(4);
    expect(gy(g, 'p2')).toContain('serra-angel');
  });
  it('gives no counter to a creature with power 3 or less', () => {
    const g = game({
      p1: { hand: ['ents-fury'], battlefield: [...n('forest', 2), 'elanor-gardner'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const elanor = g.id('p1', 'elanor-gardner');
    cast(g, 'ents-fury', [g.ref(elanor), g.ref(g.id('p2', 'serra-angel'))]);
    run(g);
    expect(counters(g, elanor)).toBe(0);
    expect(pt(g, elanor)).toEqual([3, 5]);
  });
});

describe('Entish Restoration', () => {
  const libraryLands = ['forest', 'forest', 'island', 'forest', 'forest'];
  it('sacrifices a land and fetches two basic lands tapped', () => {
    const g = game({
      p1: { hand: ['entish-restoration'], battlefield: n('forest', 3), library: libraryLands },
    });
    cast(g, 'entish-restoration');
    run(g);
    // 3 lands - 1 sacrificed + 2 fetched.
    const lands = g.state.battlefield.filter((id) => types(g, id).includes('Land'));
    expect(lands).toHaveLength(4);
    expect(lands.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(2);
    expect(g.state.players.p1.library).toHaveLength(3);
  });
  it('fetches three with a creature of power 4 or greater', () => {
    const g = game({
      p1: {
        hand: ['entish-restoration'],
        battlefield: [...n('forest', 3), 'ordinary-bear'],
        library: libraryLands,
      },
    });
    cast(g, 'entish-restoration');
    run(g);
    const lands = g.state.battlefield.filter((id) => types(g, id).includes('Land'));
    expect(lands).toHaveLength(5);
    expect(g.state.players.p1.library).toHaveLength(2);
  });
  it('is an instant', () => {
    expect(cardDb.get('entish-restoration')!.types).toContain('Instant');
  });
});

describe('Galadhrim Bow', () => {
  it('attaches to a creature as it enters and untaps it', () => {
    const g = game({
      p1: {
        hand: ['galadhrim-bow'],
        battlefield: [...n('forest', 3), { card: 'ordinary-bear', tapped: true }],
      },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'galadhrim-bow');
    run(g);
    const bow = g.id('p1', 'galadhrim-bow');
    expect(g.obj(bow).attachedTo).toBe(bear);
    expect(g.obj(bear).tapped).toBe(false);
    expect(pt(g, bear)).toEqual([5, 7]);
    expect(keywords(g, bear)).toContain('reach');
  });
  it('has flash and can be moved with equip {2}', () => {
    expect(cardDb.get('galadhrim-bow')!.keywords).toContain('flash');
    const g = game({
      p1: { battlefield: [...n('forest', 2), 'galadhrim-bow', 'ordinary-bear', 'elanor-gardner'] },
    });
    const bow = g.id('p1', 'galadhrim-bow');
    const elanor = g.id('p1', 'elanor-gardner');
    activate(g, bow, abilityIndex('galadhrim-bow', 'activated'), [g.ref(elanor)]);
    run(g);
    expect(g.obj(bow).attachedTo).toBe(elanor);
    expect(pt(g, elanor)).toEqual([3, 6]);
  });
});

describe('Galadhrim Guide', () => {
  it('scries 2 when it enters', () => {
    const g = game({ p1: { hand: ['galadhrim-guide'], battlefield: n('forest', 4) } });
    cast(g, 'galadhrim-guide');
    settle(g);
    expect(g.decision.kind).toBe('scry');
    const d = g.decision;
    expect(d.kind === 'scry' && d.cards).toHaveLength(2);
  });
});

describe('Gift of Strands', () => {
  it('has flash, scries 2 and gives +3/+3', () => {
    expect(cardDb.get('gift-of-strands')!.keywords).toContain('flash');
    const g = game({
      p1: { hand: ['gift-of-strands'], battlefield: [...n('forest', 4), 'ordinary-bear'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'gift-of-strands', [g.ref(bear)]);
    settle(g);
    expect(g.decision.kind).toBe('scry');
    run(g);
    expect(pt(g, bear)).toEqual([7, 8]);
  });
});

describe('Glorfindel, Dauntless Rescuer', () => {
  const scrying = () =>
    game({
      p1: {
        hand: ['galadhrim-guide'],
        battlefield: [...n('forest', 4), 'glorfindel-dauntless-rescuer'],
      },
      p2: { battlefield: ['ordinary-bear', 'serra-angel'] },
    });
  it('on a scry: +1/+1 and must be blocked if able', () => {
    const g = scrying();
    const id = g.id('p1', 'glorfindel-dauntless-rescuer');
    cast(g, 'galadhrim-guide');
    for (
      let i = 0;
      i < 30 && g.state.stack.length + (g.decision.kind === 'priority' ? 0 : 1) > 0;
      i++
    ) {
      if (g.decision.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
      else if (g.decision.kind === 'chooseTriggerTargets') {
        const modeA = g.legal().find((a) => a.type === 'chooseTargets' && a.mode === 0) as Action;
        g.do(modeA);
      } else if (g.decision.kind === 'priority') g.pass();
      else break;
    }
    expect(pt(g, id)).toEqual([4, 3]);
    attackWith(g, id);
    toBlockers(g);
    // Declaring no blockers: the engine makes a creature block it, so no damage reaches the player.
    g.do({ type: 'confirmBlockers', player: 'p2' });
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(20);
  });
  it('on a scry: +1/+1 and can not be blocked by more than one creature', () => {
    const g = scrying();
    const id = g.id('p1', 'glorfindel-dauntless-rescuer');
    cast(g, 'galadhrim-guide');
    for (let i = 0; i < 30; i++) {
      if (g.decision.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
      else if (g.decision.kind === 'chooseTriggerTargets') {
        g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.mode === 1) as Action);
      } else if (g.decision.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(pt(g, id)).toEqual([4, 3]);
    attackWith(g, id);
    toBlockers(g);
    // Not forced to block, and one blocker may block it.
    expect(g.legal().some((a) => a.type === 'confirmBlockers')).toBe(true);
    const bear = g.id('p2', 'ordinary-bear');
    const angel = g.id('p2', 'serra-angel');
    g.do({ type: 'addBlock', player: 'p2', blocker: bear, attacker: id });
    const more = g
      .legal()
      .filter((a) => a.type === 'addBlock' && a.blocker === angel && a.attacker === id);
    expect(more).toHaveLength(0);
  });
});

describe('Lothlórien Lookout', () => {
  it('scries 1 whenever it attacks', () => {
    const g = game({ p1: { battlefield: ['lothl-rien-lookout'] } });
    attackWith(g, g.id('p1', 'lothl-rien-lookout'));
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });
});

describe('Meriadoc Brandybuck', () => {
  it('creates a Food when Halflings you control attack a player, once for the group', () => {
    const g = game({ p1: { battlefield: ['meriadoc-brandybuck', 'elanor-gardner'] } });
    attackWith(g, g.id('p1', 'meriadoc-brandybuck'), g.id('p1', 'elanor-gardner'));
    run(g);
    expect(foods(g)).toHaveLength(1);
  });
  it('does nothing when no Halfling attacks', () => {
    const g = game({ p1: { battlefield: ['meriadoc-brandybuck', 'ordinary-bear'] } });
    attackWith(g, g.id('p1', 'ordinary-bear'));
    run(g);
    expect(foods(g)).toHaveLength(0);
  });
});

describe('Mirkwood Channeler', () => {
  it('gives an Elf trample and +X/+X for the Forests you control at the beginning of combat', () => {
    const g = game({
      p1: { battlefield: ['mirkwood-channeler', ...n('forest', 3), 'island'] },
    });
    const id = g.id('p1', 'mirkwood-channeler');
    toStep(g, 'beginCombat');
    expect(pt(g, id)).toEqual([6, 6]);
    expect(keywords(g, id)).toContain('trample');
  });
  it('only targets Elves you control', () => {
    const g = game({
      p1: { battlefield: ['mirkwood-channeler', 'ordinary-bear', ...n('forest', 2)] },
    });
    toStep(g, 'beginCombat');
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([4, 5]);
    expect(pt(g, g.id('p1', 'mirkwood-channeler'))).toEqual([5, 5]);
  });
});

describe('Mirkwood Spider', () => {
  it('has deathtouch and gives a legendary creature you control deathtouch when it attacks', () => {
    const g = game({ p1: { battlefield: ['mirkwood-spider', 'elanor-gardner', 'ordinary-bear'] } });
    const spider = g.id('p1', 'mirkwood-spider');
    expect(keywords(g, spider)).toContain('deathtouch');
    attackWith(g, spider);
    run(g);
    expect(keywords(g, g.id('p1', 'elanor-gardner'))).toContain('deathtouch');
    expect(keywords(g, g.id('p1', 'ordinary-bear'))).not.toContain('deathtouch');
  });
});

describe('Mirrormere Guardian', () => {
  it('tempts you when it dies', () => {
    const g = game({
      p1: { battlefield: ['mirrormere-guardian', 'ordinary-bear'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    g.pass();
    cast(g, 'shock', [g.ref(g.id('p1', 'mirrormere-guardian'))]);
    run(g);
    expect(gy(g)).toContain('mirrormere-guardian');
    expect(ring(g)?.tempted).toBe(1);
    expect(ring(g)?.bearer?.id).toBe(g.id('p1', 'ordinary-bear'));
  });
});

describe('Peregrin Took', () => {
  it('adds an additional Food whenever tokens would be created under your control', () => {
    const g = game({
      p1: { hand: ['brandywine-farmer'], battlefield: [...n('forest', 3), 'peregrin-took'] },
    });
    cast(g, 'brandywine-farmer');
    run(g);
    // The Food made by the Farmer, plus the additional one.
    expect(foods(g)).toHaveLength(2);
  });
  it('sacrifices three Foods to draw a card', () => {
    const g = game({ p1: { battlefield: ['peregrin-took', ...n('food-token', 3)] } });
    const before = hand(g).length;
    activate(g, g.id('p1', 'peregrin-took'), abilityIndex('peregrin-took', 'activated'));
    run(g);
    expect(foods(g)).toHaveLength(0);
    expect(hand(g).length).toBe(before + 1);
  });
  it('can not sacrifice with fewer than three Foods', () => {
    const g = game({ p1: { battlefield: ['peregrin-took', ...n('food-token', 2)] } });
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'peregrin-took')),
    ).toBe(false);
  });
});

describe("Pippin's Bravery", () => {
  it('sacrifices a Food for +4/+4', () => {
    const g = game({
      p1: { hand: ['pippins-bravery'], battlefield: ['forest', 'food-token', 'ordinary-bear'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'pippins-bravery', [g.ref(bear)]);
    run(g, /Sacrifice a Food/);
    expect(foods(g)).toHaveLength(0);
    expect(pt(g, bear)).toEqual([8, 9]);
  });
  it('may decline to sacrifice: +2/+2 and the Food stays', () => {
    const g = game({
      p1: { hand: ['pippins-bravery'], battlefield: ['forest', 'food-token', 'ordinary-bear'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'pippins-bravery', [g.ref(bear)]);
    run(g, /Don't sacrifice/);
    expect(foods(g)).toHaveLength(1);
    expect(pt(g, bear)).toEqual([6, 7]);
  });
  it("without a Food it gives +2/+2 to any creature, an opponent's too", () => {
    const g = game({
      p1: { hand: ['pippins-bravery'], battlefield: ['forest'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'pippins-bravery', [g.ref(angel)]);
    run(g);
    expect(pt(g, angel)).toEqual([6, 6]);
  });
  it('with several Foods, you pick which one to sacrifice', () => {
    const g = game({
      p1: {
        hand: ['pippins-bravery'],
        battlefield: ['forest', ...n('food-token', 2), 'ordinary-bear'],
      },
    });
    cast(g, 'pippins-bravery', [g.ref(g.id('p1', 'ordinary-bear'))]);
    run(g);
    expect(foods(g)).toHaveLength(1);
  });
});

describe('Quickbeam, Upstart Ent', () => {
  it('gives up to two target creatures +2/+2 and trample when it enters', () => {
    const g = game({
      p1: {
        hand: ['quickbeam-upstart-ent'],
        battlefield: [...n('forest', 6), 'elanor-gardner', 'ordinary-bear'],
      },
    });
    cast(g, 'quickbeam-upstart-ent');
    while (g.state.stack.length || g.decision.kind === 'chooseTriggerTargets') {
      if (g.decision.kind === 'chooseTriggerTargets') {
        const bear = g.id('p1', 'ordinary-bear');
        const elanor = g.id('p1', 'elanor-gardner');
        const act = g
          .legal()
          .find(
            (a) =>
              a.type === 'chooseTargets' &&
              JSON.stringify(a.targets).includes(bear) &&
              JSON.stringify(a.targets).includes(elanor),
          ) as Action;
        expect(act).toBeDefined();
        g.do(act);
      } else g.pass();
      if (g.state.stack.length === 0 && g.decision.kind === 'priority') break;
    }
    expect(pt(g, g.id('p1', 'ordinary-bear'))).toEqual([6, 7]);
    expect(pt(g, g.id('p1', 'elanor-gardner'))).toEqual([4, 6]);
    expect(keywords(g, g.id('p1', 'elanor-gardner'))).toContain('trample');
  });
  it('triggers for another Treefolk you control that enters', () => {
    const g = game({
      p1: {
        hand: ['enraged-huorn'],
        battlefield: [...n('forest', 5), 'quickbeam-upstart-ent', 'ordinary-bear'],
      },
    });
    const quick = g.id('p1', 'quickbeam-upstart-ent');
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'enraged-huorn');
    for (let i = 0; i < 30 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            JSON.stringify(a.targets).includes(quick) &&
            JSON.stringify(a.targets).includes(bear),
        ) as Action,
    );
    run(g);
    expect(pt(g, quick)).toEqual([7, 8]);
    expect(pt(g, bear)).toEqual([6, 7]);
    expect(keywords(g, bear)).toContain('trample');
  });
  it('does not trigger for a creature that is not a Treefolk', () => {
    const g = game({
      p1: { hand: ['elanor-gardner'], battlefield: [...n('forest', 5), 'quickbeam-upstart-ent'] },
    });
    cast(g, 'elanor-gardner');
    run(g);
    expect(pt(g, g.id('p1', 'quickbeam-upstart-ent'))).toEqual([5, 6]);
  });
  it('the targets are optional: with none chosen nothing is pumped', () => {
    const g = game({ p1: { hand: ['quickbeam-upstart-ent'], battlefield: n('forest', 6) } });
    cast(g, 'quickbeam-upstart-ent');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    expect(pt(g, g.id('p1', 'quickbeam-upstart-ent'))).toEqual([5, 6]);
  });
});

describe('Revive the Shire', () => {
  it('returns a permanent card from your graveyard to your hand and creates a Food', () => {
    const g = game({
      p1: {
        hand: ['revive-the-shire'],
        battlefield: n('forest', 2),
        graveyard: ['ordinary-bear', 'shock'],
      },
    });
    const bear = g.id('p1', 'ordinary-bear', 'graveyard');
    cast(g, 'revive-the-shire', [g.ref(bear)]);
    run(g);
    expect(hand(g)).toEqual(['ordinary-bear']);
    expect(foods(g)).toHaveLength(1);
  });
  it('can not target an instant card', () => {
    const g = game({
      p1: { hand: ['revive-the-shire'], battlefield: n('forest', 2), graveyard: ['shock'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Shower of Arrows', () => {
  it('destroys an artifact and scries 1', () => {
    const g = game({
      p1: { hand: ['shower-of-arrows'], battlefield: n('forest', 3) },
      p2: { battlefield: ['food-token'] },
    });
    cast(g, 'shower-of-arrows', [g.ref(g.id('p2', 'food-token'))]);
    settle(g);
    expect(g.decision.kind).toBe('scry');
    run(g);
    expect(bf(g, 'food-token', 'p2')).toHaveLength(0);
  });
  it('destroys a creature with flying but can not target one without', () => {
    const g = game({
      p1: { hand: ['shower-of-arrows'], battlefield: n('forest', 3) },
      p2: { battlefield: ['serra-angel', 'ordinary-bear'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => JSON.stringify((a as Extract<Action, { type: 'castSpell' }>).targets));
    expect(targets.some((t) => t.includes(g.id('p2', 'serra-angel')))).toBe(true);
    expect(targets.some((t) => t.includes(g.id('p2', 'ordinary-bear')))).toBe(false);
    cast(g, 'shower-of-arrows', [g.ref(g.id('p2', 'serra-angel'))]);
    run(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
  });
});

describe('Stew the Coneys', () => {
  it('has your creature deal damage equal to its power to theirs, then creates a Food', () => {
    const g = game({
      p1: { hand: ['stew-the-coneys'], battlefield: [...n('forest', 3), 'ordinary-bear'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    cast(g, 'stew-the-coneys', [g.ref(bear), g.ref(g.id('p2', 'serra-angel'))]);
    run(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(g.obj(bear).damage).toBe(0);
    expect(foods(g)).toHaveLength(1);
  });
});

describe('Wose Pathfinder', () => {
  it('taps for one mana of any color', () => {
    const g = game({ p1: { battlefield: ['wose-pathfinder'] } });
    const produced = cardDb
      .get('wose-pathfinder')!
      .abilities.flatMap((a) => (a.kind === 'mana' ? [a.produces] : []));
    expect(produced.sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    // It pays for a red spell on its own.
    const g2 = game({
      p1: { hand: ['shock'], battlefield: ['wose-pathfinder'] },
      p2: { battlefield: ['ordinary-bear'] },
    });
    expect(g2.legal().some((a) => a.type === 'castSpell')).toBe(true);
    expect(g).toBeDefined();
  });
  it('pumps another target creature +3/+3 with trample for {6}{G}, {T}', () => {
    const g = game({
      p1: { battlefield: ['wose-pathfinder', ...n('forest', 7), 'ordinary-bear'] },
    });
    const bear = g.id('p1', 'ordinary-bear');
    const wose = g.id('p1', 'wose-pathfinder');
    const idx = abilityIndex('wose-pathfinder', 'activated');
    // It can not target itself.
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === wose &&
            JSON.stringify(a.targets).includes(wose),
        ),
    ).toBe(false);
    activate(g, wose, idx, [g.ref(bear)]);
    run(g);
    expect(pt(g, bear)).toEqual([7, 8]);
    expect(keywords(g, bear)).toContain('trample');
    expect(g.obj(wose).tapped).toBe(true);
  });
});
