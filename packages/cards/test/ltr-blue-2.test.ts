import type { Action } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { slug } from '../src/build.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  activate,
  chars,
  combat,
  done,
  gy,
  hand,
  keywords,
  nextTurn,
  targeting,
} from './ecl-blue-helpers.ts';

// The Lord of the Rings 21b: the blue cards, part 2 (creatures with combat, mana and prompts).

const id = slug;
const BILL = id('Bill Ferny, Bree Swindler');
const MENELDOR = id('Meneldor, Swift Savior');
const GARRISON = id('Minas Tirith Garrison');
const CAPTAIN = id('Captain of Umbar');
const PELARGIR = id('Pelargir Survivor');
const KINGFISHER = id('Ithilien Kingfisher');
const MARINER = id('Elvish Mariner');
const LEECH = id('Bewitching Leechcraft');

/** The action with the most chosen targets: picks as many targets as the engine allows. */
const mostTargets = (legal: Action[]) =>
  legal
    .filter((a): a is Extract<Action, { type: 'chooseTargets' }> => a.type === 'chooseTargets')
    .sort((a, b) => b.targets.length - a.targets.length)[0];

/** Passes priority until the defending player declares blockers. */
const toBlockers = (g: ReturnType<typeof game>) => {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareBlockers');
};

describe('Bill Ferny, Bree Swindler', () => {
  const setup = (extra: string[] = []) => {
    const g = combat([BILL, ...extra], ['serra-angel']);
    g.attack(g.id('p1', BILL));
    toBlockers(g);
    g.block([g.id('p2', 'serra-angel'), g.id('p1', BILL)]);
    return g;
  };

  it('becomes blocked, first mode: create a Treasure token', () => {
    const g = setup();
    done(g, { option: /Create a Treasure/ });
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it('second mode: the opponent gains control of the Horse; Bill leaves combat; three Treasures', () => {
    const g = setup(['troop-of-ponies']);
    const horse = g.id('p1', 'troop-of-ponies');
    done(g, { option: /gains control of target Horse/ });
    expect(g.obj(horse).controller).toBe('p2');
    expect(all(g, 'treasure-token')).toHaveLength(3);
    // Bill is no longer in combat (no blockers, no damage dealt to or by him).
    expect(g.state.combat?.attackers.some((a) => a.id === g.id('p1', BILL))).toBe(false);
    for (const t of all(g, 'treasure-token')) expect(g.obj(t).controller).toBe('p1');
  });

  const modesOffered = (g: ReturnType<typeof game>) => {
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    return g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .map((a) => (a as { mode?: number }).mode);
  };

  it('the second mode is not offered without a Horse you control', () => {
    const g = setup();
    expect(modesOffered(g)).toEqual([0]);
  });

  it('with a Horse, both modes are offered', () => {
    const g = setup(['troop-of-ponies']);
    expect(new Set(modesOffered(g))).toEqual(new Set([0, 1]));
  });
});

/** Passes priority until the combat damage trigger asks for its target (no creature can block a flyer here). */
const toTrigger = (g: ReturnType<typeof game>) => {
  for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.pass();
  expect(g.decision.kind).toBe('chooseTriggerTargets');
};

describe('Meneldor, Swift Savior', () => {
  it('combat damage to a player: exile up to one creature you own, return it under your control', () => {
    const g = combat([MENELDOR], ['troop-of-ponies']);
    const pony = g.id('p2', 'troop-of-ponies');
    // p1 owns it, p2 controls it.
    g.obj(pony).owner = 'p1';
    // Remove the blocker's chance to block: it is a Horse without reach or flying; Meneldor flies.
    g.attack(g.id('p1', MENELDOR));
    toTrigger(g);
    expect(keywords(g, g.id('p1', MENELDOR))).toContain('flying');
    done(g, { pick: targeting(pony) });
    expect(g.obj(pony).controller).toBe('p1');
    expect(g.life('p2')).toBe(17);
  });

  it("can't target a creature you don't own", () => {
    const g = combat([MENELDOR], ['troop-of-ponies']);
    const pony = g.id('p2', 'troop-of-ponies');
    g.attack(g.id('p1', MENELDOR));
    toTrigger(g);
    // No legal creature to target: the trigger has no targets ("up to one").
    done(g);
    expect(g.obj(pony).controller).toBe('p2');
    expect(g.life('p2')).toBe(17);
  });

  it('a creature you control and own blinks (comes back untapped, summoning sick)', () => {
    const g = combat([MENELDOR, { card: 'savannah-lions', tapped: true } as never]);
    g.attack(g.id('p1', MENELDOR));
    toTrigger(g);
    const lions = g.id('p1', 'savannah-lions');
    const zcc = g.obj(lions).zcc;
    done(g, { pick: targeting(lions) });
    expect(g.obj(lions).zcc).toBeGreaterThan(zcc);
    expect(g.obj(lions).tapped).toBe(false);
  });
});

describe('Captain of Umbar', () => {
  it('{1}, {T}: draw a card, then discard a card', () => {
    const g = game({
      p1: { battlefield: [CAPTAIN, 'island'], library: ['forest', 'island'] },
    });
    const c = g.id('p1', CAPTAIN);
    activate(g, c, 0);
    done(g);
    expect(g.obj(c).tapped).toBe(true);
    // One drawn and one discarded: the hand is empty, the graveyard has the card.
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toHaveLength(1);
  });
});

describe('Pelargir Survivor', () => {
  it('its mana is only for instant and sorcery spells', () => {
    const g = game({
      p1: { battlefield: [PELARGIR, 'island', 'island'], hand: [CAPTAIN, 'opt'] },
    });
    const castable = (defId: string) =>
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
    // Two Islands and the Survivor's mana: Opt costs {U}, the Captain costs {2}{U} (the Survivor's mana can't help).
    expect(castable('opt')).toBe(true);
    expect(castable(CAPTAIN)).toBe(false);
  });

  it('an instant can be cast with its mana alone', () => {
    const g = game({
      p1: { battlefield: [PELARGIR], hand: ['opt'], library: n('forest', 5) },
    });
    cast(g, 'opt');
    done(g);
    expect(g.obj(g.id('p1', PELARGIR)).tapped).toBe(true);
  });

  it('{5}{U}, {T}: target player mills three cards', () => {
    const g = game({
      p1: { battlefield: [PELARGIR, ...n('island', 6)] },
      p2: { library: n('forest', 10) },
    });
    const p = g.id('p1', PELARGIR);
    // The ability is its second one after the five mana abilities.
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === p &&
          a.targets.some((t) => 'player' in t && t.player === 'p2'),
      );
    expect(act).toBeDefined();
    g.do(act!);
    done(g);
    expect(gy(g, 'p2')).toHaveLength(3);
    expect(g.state.players.p2.library).toHaveLength(7);
  });
});

describe('Ithilien Kingfisher', () => {
  it('flying; when it dies, draw a card', () => {
    const g = game({
      p1: { battlefield: [KINGFISHER, 'mountain'], hand: ['shock'], library: n('forest', 3) },
    });
    const k = g.id('p1', KINGFISHER);
    expect(keywords(g, k)).toContain('flying');
    cast(g, 'shock', [g.ref(k)]);
    done(g);
    expect(g.zoneOf(k)).toBe('graveyard');
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Elvish Mariner', () => {
  it('attacks: scry 1, and that scry taps up to one target nonland permanent', () => {
    const g = combat([MARINER], ['serra-angel', 'plains'], n('forest', 5));
    g.attack(g.id('p1', MARINER));
    const angel = g.id('p2', 'serra-angel');
    done(g, { pick: targeting(angel) });
    expect(g.obj(angel).tapped).toBe(true);
  });

  it("can't target a land", () => {
    const g = combat([MARINER], ['plains'], n('forest', 5));
    g.attack(g.id('p1', MARINER));
    done(g);
    expect(g.obj(g.id('p2', 'plains')).tapped).toBe(false);
  });

  /** Casts a scry card, answers the scry, and leaves Mariner's trigger asking for targets. */
  const scryThenTargets = (g: ReturnType<typeof game>, card: string) => {
    cast(g, card);
    for (let i = 0; i < 6 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((a) => a.type === 'scry')!);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
  };

  it('X is the number of cards looked at: scry 2 lets it tap two permanents', () => {
    const g = game({
      p1: { battlefield: [MARINER, ...n('island', 5)], hand: ['willow-wind'], library: n('forest', 8) },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'savannah-lions'] },
    });
    scryThenTargets(g, 'willow-wind');
    settle(g, mostTargets);
    done(g);
    const tapped = g.state.battlefield.filter((x) => g.obj(x).defId !== 'island' && g.obj(x).tapped);
    expect(tapped).toHaveLength(2);
  });

  it('with only one card to look at (a one-card library), X is 1', () => {
    const g = game({
      p1: { battlefield: [MARINER, ...n('island', 5)], hand: ['willow-wind'], library: ['forest'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    scryThenTargets(g, 'willow-wind');
    settle(g, mostTargets);
    done(g);
    const tapped = g.state.battlefield.filter((x) => g.obj(x).defId !== 'island' && g.obj(x).tapped);
    expect(tapped).toHaveLength(1);
  });
});

describe('Minas Tirith Garrison', () => {
  it('its power is the number of cards in your hand; toughness 5', () => {
    const g = game({ p1: { battlefield: [GARRISON], hand: ['forest', 'forest', 'forest'] } });
    expect(pt(g, g.id('p1', GARRISON))).toEqual([3, 5]);
    g.obj(g.id('p1', 'forest', 'hand')).zone = 'hand';
    expect(chars(g, g.id('p1', GARRISON)).toughness).toBe(5);
  });

  const attackWith = (humans: string[], others: string[] = []) => {
    const g = combat([GARRISON, ...humans, ...others], [], n('forest', 8));
    g.attack(g.id('p1', GARRISON));
    return g;
  };
  const chooseLabel = (g: ReturnType<typeof game>, re: RegExp) => {
    const d = g.decision as { kind: string; player: 'p1' | 'p2'; options: { label: string }[] };
    expect(d.kind).toBe('chooseOption');
    const index = d.options.findIndex((o) => re.test(o.label));
    expect(index).toBeGreaterThanOrEqual(0);
    g.do({ type: 'chooseOption', player: d.player, index });
  };
  const toPrompt = (g: ReturnType<typeof game>) => {
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
  };

  it('tap any number of untapped Humans, one at a time; draw a card for each', () => {
    const g = attackWith([CAPTAIN, BILL, PELARGIR], ['savannah-lions']);
    const before = hand(g).length;
    toPrompt(g);
    // Options: Done, the Captain, Bill, the Survivor (the Cat is not a Human; Garrison is tapped from attacking).
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels).toHaveLength(4);
    expect(labels[0]).toBe('Done');
    chooseLabel(g, /Captain/);
    expect(g.obj(g.id('p1', CAPTAIN)).tapped).toBe(true);
    chooseLabel(g, /Bill/);
    expect(g.obj(g.id('p1', BILL)).tapped).toBe(true);
    // Stop: two Humans tapped, two cards drawn.
    chooseLabel(g, /Done/);
    done(g);
    expect(hand(g).length - before).toBe(2);
    expect(g.obj(g.id('p1', PELARGIR)).tapped).toBe(false);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(false); // not a Human
  });

  it('you may tap none: Done at once draws nothing', () => {
    const g = attackWith([CAPTAIN]);
    const before = hand(g).length;
    toPrompt(g);
    chooseLabel(g, /Done/);
    done(g);
    expect(hand(g).length).toBe(before);
    expect(g.obj(g.id('p1', CAPTAIN)).tapped).toBe(false);
  });

  it('tapping every untapped Human ends the prompt and draws', () => {
    const g = attackWith([CAPTAIN]);
    const before = hand(g).length;
    toPrompt(g);
    chooseLabel(g, /Captain/);
    done(g);
    expect(hand(g).length - before).toBe(1);
  });

  it('summoning-sick Humans can be tapped (it is not a {T} cost)', () => {
    const g = attackWith([{ card: CAPTAIN, sick: true } as never]);
    const before = hand(g).length;
    toPrompt(g);
    chooseLabel(g, /Captain/);
    done(g);
    expect(hand(g).length - before).toBe(1);
  });
});

describe('Bewitching Leechcraft', () => {
  const setup = (counters: number) => {
    const g = game({
      p1: { battlefield: ['savannah-lions', ...n('island', 2)], hand: [LEECH] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = counters;
    cast(g, LEECH, [g.ref(lions)]);
    done(g);
    return { g, lions };
  };

  it('when it enters, tap enchanted creature', () => {
    const { g, lions } = setup(0);
    expect(g.obj(lions).tapped).toBe(true);
  });

  it('untap step: a +1/+1 counter is removed and the creature untaps', () => {
    const { g, lions } = setup(2);
    nextTurn(g);
    nextTurn(g);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(g.obj(lions).tapped).toBe(false);
  });

  it("untap step: without a +1/+1 counter it doesn't untap", () => {
    const { g, lions } = setup(0);
    nextTurn(g);
    nextTurn(g);
    expect(g.obj(lions).tapped).toBe(true);
  });

  it('an untapped creature loses no counter', () => {
    const { g, lions } = setup(1);
    g.obj(lions).tapped = false;
    nextTurn(g);
    nextTurn(g);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(g.obj(lions).tapped).toBe(false);
  });

  it("the enchanted creature of the opponent's isn't affected on my untap step", () => {
    const g = game({
      p1: { battlefield: [...n('island', 2)], hand: [LEECH] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: false }] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 1;
    cast(g, LEECH, [g.ref(angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    // Passing to p2's untap step: the counter goes, the angel untaps.
    nextTurn(g);
    expect(g.obj(angel).plusOneCounters).toBe(0);
    expect(g.obj(angel).tapped).toBe(false);
  });
});
