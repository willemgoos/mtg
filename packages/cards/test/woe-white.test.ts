import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics, getColors } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { WOE_WHITE, WOE_WHITE_BACKS } from '../src/woe/white.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Wilds of Eldraine (23b): the white cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  all(g, defId).filter((id) => !p || g.obj(id).controller === p);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

/** Resolves the stack and any choices with simple defaults (accepting optional effects). */
function done(g: GameDriver, opts: { option?: number | RegExp; accept?: boolean } = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'scry') g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? true });
    else break;
  }
  return g;
}

/** Casts a card by the first legal action matching the predicate (several targets, bargain or not). */
function castWhere(
  g: GameDriver,
  defId: string,
  pick: (a: Extract<Action, { type: 'castSpell' }>) => boolean = () => true,
) {
  const card = g.id(g.actor, defId, 'hand');
  const a = g
    .legal()
    .find((x): x is Extract<Action, { type: 'castSpell' }> => x.type === 'castSpell' && x.card === card && pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
}
const targetsOf = (a: Extract<Action, { type: 'castSpell' }>, id: string) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);

const activateWhere = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  pick: (a: Extract<Action, { type: 'activateAbility' }>) => boolean = () => true,
) => {
  const a = g
    .legal()
    .find(
      (x): x is Extract<Action, { type: 'activateAbility' }> =>
        x.type === 'activateAbility' && x.source === source && x.abilityIndex === abilityIndex && pick(x),
    );
  if (!a) throw new Error(`can't activate ${abilityIndex}`);
  return g.do(a);
};


/** Casts the Adventure spell side of a card in hand. */
const castBack = (g: GameDriver, defId: string, targets: object[] = []) => {
  const card = g.id(g.actor, defId, 'hand');
  const a = g
    .legal()
    .find(
      (x): x is Extract<Action, { type: 'castSpell' }> =>
        x.type === 'castSpell' && x.card === card && x.back === true,
    );
  if (!a) throw new Error(`can't cast the Adventure of ${defId}`);
  return g.do({ ...a, targets } as Action);
};
const roleOn = (g: GameDriver, role: string, host: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === role && g.obj(id).attachedTo === host);

describe('registration', () => {
  it('every white card has behaviour, and the Adventure sides are backs', () => {
    for (const name of Object.keys(WOE_WHITE)) expect(BEHAVIORS[name]).toBeDefined();
    expect(Object.keys(WOE_WHITE_BACKS).sort()).toEqual([
      'Ardenvale Fealty',
      'Betroth the Beast',
      'Heartflame Slash',
      'Mend the Wilds',
    ]);
  });
  it('the Adventure cards are linked to their spell sides', () => {
    for (const [front, back] of [
      ['besotted-knight', 'betroth-the-beast'],
      ['heartflame-duelist', 'heartflame-slash'],
      ['virtue-of-loyalty', 'ardenvale-fealty'],
      ['woodland-acolyte', 'mend-the-wilds'],
    ] as const) {
      const d = cardDb.get(front)!;
      expect(d.adventure).toBe(true);
      expect(d.back).toBe(back);
    }
  });
});

describe('Besotted Knight // Betroth the Beast', () => {
  it('is a vanilla 3/3', () => {
    const g = game({ p1: { battlefield: ['besotted-knight'] } });
    expect(pt(g, g.id('p1', 'besotted-knight'))).toEqual([3, 3]);
  });
  it('the Adventure creates a Royal Role (+1/+1, ward {1}) attached to a creature you control', () => {
    const g = game({ p1: { hand: ['besotted-knight'], battlefield: ['plains', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    castBack(g, 'besotted-knight', [g.ref(lions)]);
    settle(g);
    expect(roleOn(g, 'woe-royal-role', lions)).toHaveLength(1);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions).has('wardOne')).toBe(true);
    const knight = g.id('p1', 'besotted-knight', 'exile');
    expect(g.obj(knight).onAdventure).toBe(true);
  });
});

describe('A Tale for the Ages', () => {
  it('gives creatures you control that have an Aura (a Role too) +2/+2', () => {
    const g = game({
      p1: {
        hand: ['besotted-knight'],
        battlefield: ['plains', 'a-tale-for-the-ages', 'savannah-lions', 'llanowar-elves'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([2, 1]);
    castBack(g, 'besotted-knight', [g.ref(lions)]);
    settle(g);
    // 2/1, Royal Role +1/+1, the Tale +2/+2.
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 1]);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('Archon of the Wild Rose', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['cooped-up'],
        battlefield: [...n('plains', 2), 'archon-of-the-wild-rose', 'savannah-lions', 'llanowar-elves'],
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
  it('is a 4/4 flyer', () => {
    const g = setup();
    const archon = g.id('p1', 'archon-of-the-wild-rose');
    expect(pt(g, archon)).toEqual([4, 4]);
    expect(keywords(g, archon).has('flying')).toBe(true);
  });
  it('other creatures you control enchanted by your Auras have base 4/4 and flying; counters still count', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    expect(pt(g, lions)).toEqual([3, 2]);
    castWhere(g, 'cooped-up', (a) => targetsOf(a, lions));
    settle(g);
    expect(pt(g, lions)).toEqual([5, 5]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    // Unenchanted creatures are untouched.
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([1, 1]);
    expect(keywords(g, g.id('p1', 'llanowar-elves')).has('flying')).toBe(false);
  });
  it("doesn't change itself or a creature of the opponent's that your Aura enchants", () => {
    const g = setup();
    const archon = g.id('p1', 'archon-of-the-wild-rose');
    castWhere(g, 'cooped-up', (a) => targetsOf(a, archon));
    settle(g);
    expect(pt(g, archon)).toEqual([4, 4]);
    const g2 = setup();
    const theirs = g2.id('p2', 'savannah-lions');
    castWhere(g2, 'cooped-up', (a) => targetsOf(a, theirs));
    settle(g2);
    expect(pt(g2, theirs)).toEqual([2, 1]);
    expect(keywords(g2, theirs).has('flying')).toBe(false);
  });
});

describe("Archon's Glory", () => {
  it('gives +2/+2 until end of turn', () => {
    const g = game({ p1: { hand: ['archons-glory'], battlefield: ['plains', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    castWhere(g, 'archons-glory', (a) => !a.kicked);
    settle(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('flying')).toBe(false);
    expect(keywords(g, lions).has('lifelink')).toBe(false);
  });
  it('bargained (sacrificing an artifact): also flying and lifelink', () => {
    const g = game({
      p1: { hand: ['archons-glory'], battlefield: ['plains', 'savannah-lions', 'glass-casket'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    castWhere(g, 'archons-glory', (a) => !!a.kicked);
    settle(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(keywords(g, lions).has('lifelink')).toBe(true);
    expect(gy(g)).toContain('glass-casket');
  });
});

describe('celebration creatures', () => {
  // Two nonland permanents entering: the Vigil and its Knight token.
  const celebrate = (g: GameDriver) => {
    castWhere(g, 'hopeful-vigil');
    settle(g);
  };
  it('Armory Mice is a 3/1, and a 3/3 with a celebration', () => {
    const g = game({
      p1: { hand: ['hopeful-vigil'], battlefield: [...n('plains', 2), 'armory-mice'] },
    });
    const mice = g.id('p1', 'armory-mice');
    expect(pt(g, mice)).toEqual([3, 1]);
    celebrate(g);
    expect(pt(g, mice)).toEqual([3, 3]);
  });
  it('Gallant Pie-Wielder has first strike, and double strike with a celebration', () => {
    const g = game({
      p1: { hand: ['hopeful-vigil'], battlefield: [...n('plains', 2), 'gallant-pie-wielder'] },
    });
    const pie = g.id('p1', 'gallant-pie-wielder');
    expect(pt(g, pie)).toEqual([2, 3]);
    expect(keywords(g, pie).has('firstStrike')).toBe(true);
    expect(keywords(g, pie).has('doubleStrike')).toBe(false);
    celebrate(g);
    expect(keywords(g, pie).has('doubleStrike')).toBe(true);
  });
  it('Tuinvale Guide is a 2/3 flyer, and gets +1/+0 and lifelink with a celebration', () => {
    const g = game({
      p1: { hand: ['hopeful-vigil'], battlefield: [...n('plains', 2), 'tuinvale-guide'] },
    });
    const guide = g.id('p1', 'tuinvale-guide');
    expect(pt(g, guide)).toEqual([2, 3]);
    expect(keywords(g, guide).has('flying')).toBe(true);
    expect(keywords(g, guide).has('lifelink')).toBe(false);
    celebrate(g);
    expect(pt(g, guide)).toEqual([3, 3]);
    expect(keywords(g, guide).has('lifelink')).toBe(true);
  });
  it('Pests of Honor gets a +1/+1 counter at the beginning of combat with a celebration only', () => {
    const g = game({
      p1: { hand: ['hopeful-vigil'], battlefield: [...n('plains', 2), 'pests-of-honor'] },
    });
    const pests = g.id('p1', 'pests-of-honor');
    celebrate(g);
    g.passBoth();
    settle(g);
    expect(counters(g, pests)).toBe(1);
    const g2 = game({ p1: { battlefield: ['pests-of-honor'] } });
    g2.passBoth();
    settle(g2);
    expect(counters(g2, g2.id('p1', 'pests-of-honor'))).toBe(0);
  });
});

describe('Break the Spell', () => {
  it("destroys an opponent's enchantment and draws nothing", () => {
    const g = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains'] },
      p2: { battlefield: ['hopeful-vigil'] },
    });
    const h = hand(g).length;
    cast(g, 'break-the-spell', [g.ref(g.id('p2', 'hopeful-vigil'))]);
    settle(g);
    expect(gy(g, 'p2')).toContain('hopeful-vigil');
    expect(hand(g).length).toBe(h - 1);
  });
  it('draws a card when the enchantment was one you controlled', () => {
    const g = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains', 'a-tale-for-the-ages'] },
    });
    const h = hand(g).length;
    cast(g, 'break-the-spell', [g.ref(g.id('p1', 'a-tale-for-the-ages'))]);
    settle(g);
    expect(gy(g)).toContain('a-tale-for-the-ages');
    expect(hand(g).length).toBe(h);
  });
  it("draws a card when it destroys a token (an opponent's Role)", () => {
    const g = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains'] },
      p2: { battlefield: ['serra-angel', 'woe-royal-role'] },
    });
    const role = g.id('p2', 'woe-royal-role');
    g.obj(role).isToken = true;
    g.obj(role).attachedTo = g.id('p2', 'serra-angel');
    const h = hand(g).length;
    cast(g, 'break-the-spell', [g.ref(role)]);
    settle(g);
    expect(g.zoneOf(role)).not.toBe('battlefield');
    expect(hand(g).length).toBe(h);
  });
  it('only targets enchantments', () => {
    const g = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains', 'savannah-lions'] },
    });
    const card = g.id('p1', 'break-the-spell', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });
});

describe('Charmed Clothier', () => {
  it('is a 3/3 flyer; its ETB gives another creature you control a Royal Role', () => {
    const g = game({
      p1: { hand: ['charmed-clothier'], battlefield: [...n('plains', 5), 'savannah-lions'] },
    });
    cast(g, 'charmed-clothier');
    settle(g);
    const lions = g.id('p1', 'savannah-lions');
    const clothier = g.id('p1', 'charmed-clothier');
    expect(pt(g, clothier)).toEqual([3, 3]);
    expect(keywords(g, clothier).has('flying')).toBe(true);
    expect(roleOn(g, 'woe-royal-role', lions)).toHaveLength(1);
    expect(roleOn(g, 'woe-royal-role', clothier)).toHaveLength(0);
  });
  it('replaces another Role you control on that creature', () => {
    const g = game({
      p1: {
        hand: ['charmed-clothier', 'besotted-knight'],
        battlefield: [...n('plains', 6), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    castBack(g, 'besotted-knight', [g.ref(lions)]);
    settle(g);
    cast(g, 'charmed-clothier');
    settle(g);
    expect(roleOn(g, 'woe-royal-role', lions)).toHaveLength(1);
    expect(pt(g, lions)).toEqual([3, 2]);
  });
});

describe('Cooped Up', () => {
  it("can't attack or block", () => {
    const g = game({
      p1: { hand: ['cooped-up'], battlefield: ['plains', 'plains', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).summoningSick = false;
    castWhere(g, 'cooped-up', (a) => targetsOf(a, angel));
    settle(g);
    const c = getCharacteristics(g.state, cardDb, angel);
    expect(c.cantAttack).toBe(true);
    expect(c.cantBlock).toBe(true);
  });
  it('{2}{W}: exile enchanted creature', () => {
    const g = game({
      p1: { hand: ['cooped-up'], battlefield: [...n('plains', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    castWhere(g, 'cooped-up', (a) => targetsOf(a, angel));
    settle(g);
    const aura = g.id('p1', 'cooped-up');
    expect(g.obj(aura).attachedTo).toBe(angel);
    activateWhere(g, aura, 1);
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(gy(g)).toContain('cooped-up');
  });
});

describe('Cursed Courtier', () => {
  it('is a lifelink 3/3 that enters with a Cursed Role (base 1/1)', () => {
    const g = game({ p1: { hand: ['cursed-courtier'], battlefield: n('plains', 3) } });
    cast(g, 'cursed-courtier');
    settle(g);
    const courtier = g.id('p1', 'cursed-courtier');
    expect(roleOn(g, 'woe-cursed-role', courtier)).toHaveLength(1);
    expect(pt(g, courtier)).toEqual([1, 1]);
    expect(keywords(g, courtier).has('lifelink')).toBe(true);
  });
});

describe('Dutiful Griffin', () => {
  const activations = (g: GameDriver, griffin: string) =>
    g
      .legal()
      .filter(
        (a): a is Extract<Action, { type: 'activateAbility' }> =>
          a.type === 'activateAbility' && a.source === griffin,
      );
  it('is a 4/4 flyer', () => {
    const g = game({ p1: { battlefield: ['dutiful-griffin'] } });
    const griffin = g.id('p1', 'dutiful-griffin');
    expect(pt(g, griffin)).toEqual([4, 4]);
    expect(keywords(g, griffin).has('flying')).toBe(true);
  });
  it('{2}{W}, sacrifice two enchantments: return it from your graveyard to your hand', () => {
    const g = game({
      p1: {
        graveyard: ['dutiful-griffin'],
        battlefield: [...n('plains', 3), 'hopeful-vigil', 'a-tale-for-the-ages', 'glass-casket'],
      },
    });
    const griffin = g.id('p1', 'dutiful-griffin', 'graveyard');
    const vigil = g.id('p1', 'hopeful-vigil');
    const tale = g.id('p1', 'a-tale-for-the-ages');
    const acts = activations(g, griffin);
    // Two enchantments among three permanents: the one pair, in either order (the board picks them one at a time).
    expect(acts.map((a) => [...(a.sacrificeMany ?? [])].sort().join())).toEqual([
      [vigil, tale].sort().join(),
      [vigil, tale].sort().join(),
    ]);
    g.do(acts[0]!);
    done(g); // the Vigil's scry 2
    expect(hand(g)).toContain('dutiful-griffin');
    expect(g.zoneOf(vigil)).toBe('graveyard');
    expect(g.zoneOf(tale)).toBe('graveyard');
    expect(g.zoneOf(g.id('p1', 'glass-casket'))).toBe('battlefield');
  });
  it('needs two enchantments and the mana', () => {
    const one = game({
      p1: { graveyard: ['dutiful-griffin'], battlefield: [...n('plains', 3), 'hopeful-vigil'] },
    });
    expect(activations(one, one.id('p1', 'dutiful-griffin', 'graveyard'))).toHaveLength(0);
    const broke = game({
      p1: {
        graveyard: ['dutiful-griffin'],
        battlefield: [...n('plains', 2), 'hopeful-vigil', 'a-tale-for-the-ages'],
      },
    });
    expect(activations(broke, broke.id('p1', 'dutiful-griffin', 'graveyard'))).toHaveLength(0);
  });
});

describe('Eerie Interference', () => {
  it('prevents damage creatures would deal to your creatures (and not the opponent’s)', () => {
    const g = game({
      p1: { hand: ['eerie-interference'], battlefield: [...n('plains', 3), 'savannah-lions'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'eerie-interference');
    settle(g);
    const lions = g.id('p1', 'savannah-lions');
    const elves = g.id('p2', 'llanowar-elves');
    g.obj(lions).summoningSick = false;
    g.passBoth();
    g.passBoth();
    g.attack(lions);
    g.passBoth();
    // The opponent blocks: the Elves' damage to the Lions is prevented, the Lions' damage to the Elves is not.
    g.block([elves, lions]);
    g.passUntilStep('endCombat');
    expect(g.state.objects[lions]?.damage ?? 0).toBe(0);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.zoneOf(elves)).toBe('graveyard');
  });
  it('prevents a creature’s damage to you, cast while it attacks', () => {
    const g = game({
      p1: { hand: ['eerie-interference'], battlefield: [...n('plains', 3)] },
      p2: { battlefield: ['serra-angel'] },
      active: 'p2',
      step: 'beginCombat',
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).summoningSick = false;
    g.passBoth();
    g.attack(angel);
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, 'eerie-interference');
    settle(g);
    g.passUntilStep('endCombat');
    expect(g.life('p1')).toBe(20);
  });
  it("doesn't prevent damage from noncreature sources, and ends with the turn", () => {
    const g = game({
      p1: { hand: ['eerie-interference'], battlefield: [...n('plains', 3)] },
      p2: { hand: ['lightning-bolt'], battlefield: ['mountain'] },
    });
    cast(g, 'eerie-interference');
    settle(g);
    g.pass();
    expect(g.actor).toBe('p2');
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    settle(g);
    expect(g.life('p1')).toBe(17);
    expect(g.state.turn.woeCreatureDamagePrevented).toEqual(['p1']);
    for (let i = 0; i < 300 && g.state.turn.number === 3; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else g.pass();
    }
    expect(g.state.turn.number).toBe(4);
    expect(g.state.turn.woeCreatureDamagePrevented).toBeUndefined();
  });
});

describe('Expel the Interlopers', () => {
  const setup = () =>
    game({
      p1: { hand: ['expel-the-interlopers'], battlefield: [...n('plains', 5), 'llanowar-elves'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
  it('asks for a number from 0 to 10', () => {
    const g = setup();
    cast(g, 'expel-the-interlopers');
    g.pass();
    g.pass();
    const d = g.decision;
    expect(d.kind).toBe('chooseOption');
    if (d.kind !== 'chooseOption') return;
    expect(d.options.map((o) => o.label)).toEqual(Array.from({ length: 11 }, (_, i) => String(i)));
    expect(d.title).toMatch(/between 0 and 10/);
  });
  it('destroys every creature with power at least the chosen number', () => {
    const g = setup();
    cast(g, 'expel-the-interlopers');
    done(g, { option: 2 });
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(g.id('p2', 'savannah-lions', 'graveyard'))).toBe('graveyard');
    expect(on(g, 'llanowar-elves')).toHaveLength(1);
  });
  it('0 destroys every creature, yours included; 5 destroys none of these', () => {
    const g = setup();
    cast(g, 'expel-the-interlopers');
    done(g, { option: 0 });
    expect(on(g, 'llanowar-elves')).toHaveLength(0);
    expect(on(g, 'serra-angel')).toHaveLength(0);
    const h = setup();
    cast(h, 'expel-the-interlopers');
    done(h, { option: 5 });
    expect(on(h, 'serra-angel')).toHaveLength(1);
    expect(on(h, 'llanowar-elves')).toHaveLength(1);
  });
  it('4 destroys the 4/4 only', () => {
    const g = setup();
    cast(g, 'expel-the-interlopers');
    done(g, { option: 4 });
    expect(on(g, 'serra-angel')).toHaveLength(0);
    expect(on(g, 'savannah-lions')).toHaveLength(1);
  });
});

describe('Frostbridge Guard', () => {
  it('{2}{W}, {T}: tap target creature', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 3), 'frostbridge-guard'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const guard = g.id('p1', 'frostbridge-guard');
    g.obj(guard).summoningSick = false;
    const angel = g.id('p2', 'serra-angel');
    activateWhere(g, guard, 0, (a) => a.targets.some((t) => 'object' in t && t.object.id === angel));
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(guard).tapped).toBe(true);
    expect(pt(g, guard)).toEqual([2, 2]);
  });
});

describe('Glass Casket', () => {
  it('exiles a creature with mana value 3 or less an opponent controls until it leaves', () => {
    const g = game({
      p1: { hand: ['glass-casket', 'stroke-of-midnight'], battlefield: n('plains', 5) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'glass-casket');
    // The Angel (mana value 5) isn't a legal target.
    expect(g.decision.kind).toBe('priority');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const legal = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(legal.some((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === angel))).toBe(false);
    settle(g);
    expect(g.zoneOf(lions)).toBe('exile');
    expect(g.zoneOf(angel)).toBe('battlefield');
    // The Casket leaves: the creature comes back.
    const casket = g.id('p1', 'glass-casket');
    cast(g, 'stroke-of-midnight', [g.ref(casket)]);
    settle(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
  });
});

describe('Heartflame Duelist // Heartflame Slash', () => {
  it('is a 3/1; instant and sorcery spells you control have lifelink', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['mountain', 'heartflame-duelist'] },
    });
    expect(pt(g, g.id('p1', 'heartflame-duelist'))).toEqual([3, 1]);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });
  it("doesn't give the opponent's spells lifelink", () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['mountain'] },
      p2: { battlefield: ['heartflame-duelist'] },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p1')).toBe(20);
  });
  it('Heartflame Slash deals 3 damage to any target, then the Duelist can be cast from exile', () => {
    const g = game({
      p1: { hand: ['heartflame-duelist'], battlefield: [...n('mountain', 3)] },
    });
    castBack(g, 'heartflame-duelist', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    const card = g.id('p1', 'heartflame-duelist', 'exile');
    expect(g.obj(card).onAdventure).toBe(true);
  });
});

describe('Hopeful Vigil', () => {
  it('creates a 2/2 white Knight with vigilance; scry 2 when it goes to the graveyard; {2}{W}: sacrifice it', () => {
    const g = game({ p1: { hand: ['hopeful-vigil'], battlefield: n('plains', 6) } });
    cast(g, 'hopeful-vigil');
    settle(g);
    const knights = on(g, 'woe-w-knight-token', 'p1');
    expect(knights).toHaveLength(1);
    expect(pt(g, knights[0]!)).toEqual([2, 2]);
    expect(keywords(g, knights[0]!).has('vigilance')).toBe(true);
    expect([...getColors(g.state, cardDb, knights[0]!)]).toEqual(['W']);
    const vigil = g.id('p1', 'hopeful-vigil');
    activateWhere(g, vigil, 2);
    g.passBoth(); // the sacrifice resolves
    g.passBoth(); // the scry trigger resolves
    expect(g.decision.kind).toBe('scry');
    expect(g.zoneOf(vigil)).toBe('graveyard');
    if (g.decision.kind === 'scry') expect(g.decision.cards).toHaveLength(2);
    done(g);
    expect(on(g, 'woe-w-knight-token', 'p1')).toHaveLength(1);
  });
});

describe("Kellan's Lightblades", () => {
  const attacking = () => {
    const g = game({
      p1: { hand: ["kellans-lightblades"], battlefield: [...n('plains', 2), 'glass-casket'] },
      p2: { battlefield: ['serra-angel'] },
      active: 'p2',
      step: 'beginCombat',
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).summoningSick = false;
    g.passBoth();
    g.attack(angel);
    g.pass();
    return { g, angel };
  };
  it('deals 3 damage to target attacking creature', () => {
    const { g, angel } = attacking();
    expect(g.actor).toBe('p1');
    castWhere(g, 'kellans-lightblades', (a) => !a.kicked && targetsOf(a, angel));
    settle(g);
    expect(g.zoneOf(angel)).toBe('battlefield');
    expect(g.obj(angel).damage).toBe(3);
    expect(gy(g)).not.toContain('glass-casket');
  });
  it('bargained: destroys it instead', () => {
    const { g, angel } = attacking();
    castWhere(g, 'kellans-lightblades', (a) => !!a.kicked && targetsOf(a, angel));
    settle(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(gy(g)).toContain('glass-casket');
  });
  it('can only target an attacking or blocking creature', () => {
    const g = game({
      p1: { hand: ["kellans-lightblades"], battlefield: [...n('plains', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const card = g.id('p1', 'kellans-lightblades', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });
});

describe('Knight of Doves', () => {
  it('is a 1/3; makes a 1/1 white flying Bird whenever an enchantment you control goes to the graveyard', () => {
    const g = game({
      p1: {
        hand: ['break-the-spell'],
        battlefield: ['plains', 'knight-of-doves', 'a-tale-for-the-ages'],
      },
      p2: { battlefield: ['hopeful-vigil'] },
    });
    expect(pt(g, g.id('p1', 'knight-of-doves'))).toEqual([1, 3]);
    // The opponent's enchantment going to the graveyard: no Bird.
    const g2 = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains', 'knight-of-doves'] },
      p2: { battlefield: ['hopeful-vigil'] },
    });
    cast(g2, 'break-the-spell', [g2.ref(g2.id('p2', 'hopeful-vigil'))]);
    settle(g2);
    expect(on(g2, 'woe-w-bird-token')).toHaveLength(0);
    cast(g, 'break-the-spell', [g.ref(g.id('p1', 'a-tale-for-the-ages'))]);
    settle(g);
    const birds = on(g, 'woe-w-bird-token', 'p1');
    expect(birds).toHaveLength(1);
    expect(pt(g, birds[0]!)).toEqual([1, 1]);
    expect(keywords(g, birds[0]!).has('flying')).toBe(true);
  });
});

describe('Moment of Valor', () => {
  it('mode 1: untaps a creature, +1/+0 and indestructible until end of turn', () => {
    const g = game({
      p1: { hand: ['moment-of-valor'], battlefield: [...n('plains', 3), { card: 'savannah-lions', tapped: true }] },
    });
    const lions = g.id('p1', 'savannah-lions');
    castWhere(g, 'moment-of-valor', (a) => a.mode === 0 && targetsOf(a, lions));
    settle(g);
    expect(g.obj(lions).tapped).toBe(false);
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions).has('indestructible')).toBe(true);
  });
  it('mode 2: destroys a creature with power 4 or greater only', () => {
    const g = game({
      p1: { hand: ['moment-of-valor'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const targetable = g
      .legal()
      .filter((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && a.mode === 1);
    expect(targetable.some((a) => targetsOf(a, lions))).toBe(false);
    castWhere(g, 'moment-of-valor', (a) => a.mode === 1 && targetsOf(a, angel));
    settle(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.zoneOf(lions)).toBe('battlefield');
  });
});

describe('Plunge into Winter', () => {
  it('taps up to one target creature, scries 1, then draws a card', () => {
    const g = game({
      p1: { hand: ['plunge-into-winter'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const h = hand(g).length;
    castWhere(g, 'plunge-into-winter', (a) => targetsOf(a, angel));
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(hand(g).length).toBe(h);
  });
  it('works with no target: still scries and draws', () => {
    const g = game({ p1: { hand: ['plunge-into-winter'], battlefield: n('plains', 2) } });
    const h = hand(g).length;
    castWhere(g, 'plunge-into-winter', (a) => a.targets.length === 0);
    done(g);
    expect(hand(g).length).toBe(h);
  });
});

describe('Protective Parents', () => {
  it('when it dies, a Young Hero Role on up to one target creature you control', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['mountain', 'protective-parents', 'savannah-lions'] },
    });
    expect(pt(g, g.id('p1', 'protective-parents'))).toEqual([3, 2]);
    const parents = g.id('p1', 'protective-parents');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'lightning-bolt', [g.ref(parents)]);
    settle(g);
    expect(g.zoneOf(parents)).toBe('graveyard');
    expect(roleOn(g, 'woe-young-hero-role', lions)).toHaveLength(1);
  });
  it('with no other creature the trigger does nothing', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['mountain', 'protective-parents'] },
    });
    cast(g, 'lightning-bolt', [g.ref(g.id('p1', 'protective-parents'))]);
    settle(g);
    expect(on(g, 'woe-young-hero-role')).toHaveLength(0);
  });
});

describe('Return Triumphant', () => {
  it('returns a creature card with mana value 3 or less from your graveyard with a Young Hero Role', () => {
    const g = game({
      p1: { hand: ['return-triumphant'], graveyard: ['savannah-lions', 'serra-angel'], battlefield: n('plains', 2) },
    });
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const options = g
      .legal()
      .filter((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell');
    expect(options.some((a) => targetsOf(a, angel))).toBe(false);
    castWhere(g, 'return-triumphant', (a) => targetsOf(a, lions));
    settle(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(roleOn(g, 'woe-young-hero-role', lions)).toHaveLength(1);
  });
});

/** Passes (resolving triggers and their targets, scrying nothing) until it is `player`'s turn number `turn` in the given step with an empty stack. */
function advanceTo(g: GameDriver, turn: number, step: 'main1' | 'end' = 'main1'): GameDriver {
  for (let i = 0; i < 400; i++) {
    const d = g.decision;
    const there =
      g.state.turn.number === turn && g.state.turn.step === step && g.state.stack.length === 0;
    if (there && d.kind === 'priority') return g;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'scry') g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else throw new Error(`Stuck at ${d.kind}`);
  }
  throw new Error(`Never reached turn ${turn} ${step}`);
}

describe('Rimefur Reindeer', () => {
  it('is a 3/4; taps target creature an opponent controls whenever an enchantment you control enters', () => {
    const g = game({
      p1: { hand: ['hopeful-vigil', 'besotted-knight'], battlefield: [...n('plains', 3), 'rimefur-reindeer'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    expect(pt(g, g.id('p1', 'rimefur-reindeer'))).toEqual([3, 4]);
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'hopeful-vigil');
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    // A Role is an enchantment too; a creature entering isn't.
    const g2 = game({
      p1: { hand: ['besotted-knight'], battlefield: [...n('plains', 3), 'rimefur-reindeer', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    castBack(g2, 'besotted-knight', [g2.ref(g2.id('p1', 'savannah-lions'))]);
    settle(g2);
    expect(g2.obj(g2.id('p2', 'serra-angel')).tapped).toBe(true);
    const g3 = game({
      p1: { hand: ['cursed-courtier'], battlefield: [...n('plains', 3), 'rimefur-reindeer'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g3, 'cursed-courtier');
    settle(g3);
    // Its Cursed Role entering taps the Lions, the Courtier itself doesn't.
    expect(g3.obj(g3.id('p2', 'savannah-lions')).tapped).toBe(true);
  });
  it('an opponent’s creature entering or an enchantment they control doesn’t tap anything', () => {
    const g = game({
      p1: { battlefield: ['rimefur-reindeer'] },
      p2: { battlefield: ['serra-angel', 'hopeful-vigil'] },
    });
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
  });
});

describe('Savior of the Sleeping', () => {
  it('is a 2/3 vigilance that gets a +1/+1 counter whenever an enchantment you control goes to the graveyard', () => {
    const g = game({
      p1: {
        hand: ['break-the-spell'],
        battlefield: ['plains', 'savior-of-the-sleeping', 'a-tale-for-the-ages'],
      },
    });
    const savior = g.id('p1', 'savior-of-the-sleeping');
    expect(pt(g, savior)).toEqual([2, 3]);
    expect(keywords(g, savior).has('vigilance')).toBe(true);
    cast(g, 'break-the-spell', [g.ref(g.id('p1', 'a-tale-for-the-ages'))]);
    settle(g);
    expect(counters(g, savior)).toBe(1);
  });
  it("doesn't trigger for the opponent's enchantments", () => {
    const g = game({
      p1: { hand: ['break-the-spell'], battlefield: ['plains', 'savior-of-the-sleeping'] },
      p2: { battlefield: ['hopeful-vigil'] },
    });
    cast(g, 'break-the-spell', [g.ref(g.id('p2', 'hopeful-vigil'))]);
    settle(g);
    expect(counters(g, g.id('p1', 'savior-of-the-sleeping'))).toBe(0);
  });
});

describe('Solitary Sanctuary', () => {
  it('taps an opponent’s creature with a stun counter, and puts a +1/+1 counter on a creature of yours', () => {
    const g = game({
      p1: { hand: ['solitary-sanctuary'], battlefield: [...n('plains', 3), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'solitary-sanctuary');
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(1);
    expect(counters(g, lions)).toBe(1);
  });
  it('triggers again for every untapped opponent creature you tap, but not for one that is tapped already', () => {
    const g = game({
      p1: {
        hand: ['plunge-into-winter', 'plunge-into-winter'],
        battlefield: [...n('plains', 4), 'solitary-sanctuary', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', { card: 'llanowar-elves', tapped: true }] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    const elves = g.id('p2', 'llanowar-elves');
    castWhere(g, 'plunge-into-winter', (a) => targetsOf(a, elves));
    done(g);
    expect(counters(g, lions)).toBe(0);
    castWhere(g, 'plunge-into-winter', (a) => targetsOf(a, angel));
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(counters(g, lions)).toBe(1);
  });
});

describe('Stockpiling Celebrant', () => {
  const setup = () =>
    game({
      p1: { hand: ['stockpiling-celebrant'], battlefield: [...n('plains', 3), 'savannah-lions', 'glass-casket'] },
    });
  it('is a 3/2; may return another nonland permanent you control to hand, then scry 2', () => {
    const g = setup();
    cast(g, 'stockpiling-celebrant');
    settle(g);
    done(g, { accept: true });
    expect(pt(g, g.id('p1', 'stockpiling-celebrant'))).toEqual([3, 2]);
    // The first legal target (the Lions) went back to hand.
    expect(hand(g).length).toBe(1);
    expect(on(g, 'savannah-lions').length + on(g, 'glass-casket').length).toBe(1);
  });
  it('can decline: nothing returns and there is no scry', () => {
    const g = setup();
    cast(g, 'stockpiling-celebrant');
    settle(g);
    done(g, { accept: false });
    expect(on(g, 'savannah-lions')).toHaveLength(1);
    expect(on(g, 'glass-casket')).toHaveLength(1);
    expect(g.decision.kind).toBe('priority');
  });
  it('scries 2 when it returns something', () => {
    const g = setup();
    cast(g, 'stockpiling-celebrant');
    settle(g);
    let scried = false;
    for (let i = 0; i < 20; i++) {
      const d = g.decision;
      if (d.kind === 'scry') {
        scried = true;
        expect(d.cards).toHaveLength(2);
        g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
      } else if (g.legal().some((a) => a.type === 'chooseEffect'))
        g.do({ type: 'chooseEffect', player: g.actor, accept: true });
      else if (d.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(scried).toBe(true);
  });
  it('has no trigger target without another nonland permanent', () => {
    const g = game({ p1: { hand: ['stockpiling-celebrant'], battlefield: n('plains', 3) } });
    cast(g, 'stockpiling-celebrant');
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(on(g, 'stockpiling-celebrant')).toHaveLength(1);
  });
});

describe('Stroke of Midnight', () => {
  it('destroys a nonland permanent; its controller creates a 1/1 white Human', () => {
    const g = game({
      p1: { hand: ['stroke-of-midnight'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'stroke-of-midnight', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    const humans = on(g, 'woe-w-human-token');
    expect(humans).toHaveLength(1);
    expect(g.obj(humans[0]!).controller).toBe('p2');
    expect(pt(g, humans[0]!)).toEqual([1, 1]);
    expect([...getColors(g.state, cardDb, humans[0]!)]).toEqual(['W']);
  });
  it('gives you the Human when you destroy your own permanent', () => {
    const g = game({
      p1: { hand: ['stroke-of-midnight'], battlefield: [...n('plains', 3), 'glass-casket'] },
    });
    cast(g, 'stroke-of-midnight', [g.ref(g.id('p1', 'glass-casket'))]);
    settle(g);
    expect(on(g, 'woe-w-human-token', 'p1')).toHaveLength(1);
  });
  it('the opponent gets the Human even when the destroyed permanent was their token', () => {
    const g = game({
      p1: { hand: ['stroke-of-midnight'], battlefield: n('plains', 3) },
      p2: { battlefield: ['woe-w-human-token'] },
    });
    const human = g.id('p2', 'woe-w-human-token');
    g.obj(human).isToken = true;
    cast(g, 'stroke-of-midnight', [g.ref(human)]);
    settle(g);
    expect(g.zoneOf(human)).not.toBe('battlefield');
    expect(on(g, 'woe-w-human-token', 'p2')).toHaveLength(1);
    expect(on(g, 'woe-w-human-token', 'p1')).toHaveLength(0);
  });
  it("can't target a land", () => {
    const g = game({
      p1: { hand: ['stroke-of-midnight'], battlefield: n('plains', 3) },
      p2: { battlefield: ['plains'] },
    });
    const card = g.id('p1', 'stroke-of-midnight', 'hand');
    const land = g.id('p2', 'plains');
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && a.card === card && a.targets.some((t) => 'object' in t && t.object.id === land)),
    ).toBe(false);
  });
});

describe('The Princess Takes Flight', () => {
  it('I exiles up to one creature, II pumps and gives flying until end of turn, III returns the exiled card', () => {
    const g = game({
      p1: { hand: ['the-princess-takes-flight'], battlefield: [...n('plains', 3), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'the-princess-takes-flight');
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === angel)),
    );
    expect(g.zoneOf(angel)).toBe('exile');
    advanceTo(g, 5);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(g.zoneOf(angel)).toBe('exile');
    advanceTo(g, 7);
    // Chapter III: the Angel is back under its owner's control, and the Saga is sacrificed.
    const back = g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel');
    expect(back).toHaveLength(1);
    expect(g.obj(back[0]!).controller).toBe('p2');
    expect(on(g, 'the-princess-takes-flight')).toHaveLength(0);
    expect(pt(g, lions)).toEqual([2, 1]);
  });
  it('I with no target exiles nothing; III returns nothing', () => {
    const g = game({
      p1: { hand: ['the-princess-takes-flight'], battlefield: n('plains', 3) },
    });
    cast(g, 'the-princess-takes-flight');
    done(g);
    advanceTo(g, 7);
    expect(on(g, 'the-princess-takes-flight')).toHaveLength(0);
  });
  it('a token exiled by chapter I does not come back', () => {
    const g = game({
      p1: { hand: ['the-princess-takes-flight'], battlefield: [...n('plains', 3)] },
      p2: { battlefield: ['woe-w-human-token'] },
    });
    const human = g.id('p2', 'woe-w-human-token');
    g.obj(human).isToken = true;
    cast(g, 'the-princess-takes-flight');
    settle(g);
    expect(g.zoneOf(human)).not.toBe('battlefield');
    advanceTo(g, 7);
    expect(on(g, 'woe-w-human-token')).toHaveLength(0);
  });
});

describe('Unassuming Sage', () => {
  it('a 2/2 that may pay {2} for a Sorcerer Role attached to it', () => {
    const g = game({ p1: { hand: ['unassuming-sage'], battlefield: n('plains', 4) } });
    cast(g, 'unassuming-sage');
    done(g, { accept: true });
    const sage = g.id('p1', 'unassuming-sage');
    expect(roleOn(g, 'woe-sorcerer-role', sage)).toHaveLength(1);
    expect(pt(g, sage)).toEqual([3, 3]);
  });
  it('declining the payment leaves a plain 2/2', () => {
    const g = game({ p1: { hand: ['unassuming-sage'], battlefield: n('plains', 4) } });
    cast(g, 'unassuming-sage');
    done(g, { accept: false });
    const sage = g.id('p1', 'unassuming-sage');
    expect(roleOn(g, 'woe-sorcerer-role', sage)).toHaveLength(0);
    expect(pt(g, sage)).toEqual([2, 2]);
  });
  it('with no spare mana there is no Role', () => {
    const g = game({ p1: { hand: ['unassuming-sage'], battlefield: n('plains', 2) } });
    cast(g, 'unassuming-sage');
    done(g, { accept: true });
    expect(on(g, 'woe-sorcerer-role')).toHaveLength(0);
  });
});

describe('Virtue of Loyalty // Ardenvale Fealty', () => {
  it('at your end step, a +1/+1 counter on each creature you control, untapped', () => {
    const g = game({
      p1: {
        battlefield: ['virtue-of-loyalty', { card: 'savannah-lions', tapped: true }, 'llanowar-elves'],
      },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    advanceTo(g, 3, 'end');
    const lions = g.id('p1', 'savannah-lions');
    const elves = g.id('p1', 'llanowar-elves');
    expect(counters(g, lions)).toBe(1);
    expect(counters(g, elves)).toBe(1);
    expect(g.obj(lions).tapped).toBe(false);
    expect(counters(g, g.id('p2', 'serra-angel'))).toBe(0);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
  });
  it('Ardenvale Fealty makes a 2/2 white Knight with vigilance at instant speed; the Virtue can be cast after', () => {
    const g = game({
      p1: { hand: ['virtue-of-loyalty'], battlefield: n('plains', 7) },
    });
    castBack(g, 'virtue-of-loyalty');
    settle(g);
    const knights = on(g, 'woe-w-knight-token', 'p1');
    expect(knights).toHaveLength(1);
    expect(pt(g, knights[0]!)).toEqual([2, 2]);
    expect(keywords(g, knights[0]!).has('vigilance')).toBe(true);
    const virtue = g.id('p1', 'virtue-of-loyalty', 'exile');
    expect(g.obj(virtue).onAdventure).toBe(true);
    const fromExile = g.legal().find((a) => a.type === 'castSpell' && a.card === virtue && !a.back);
    expect(fromExile).toBeDefined();
    g.do(fromExile!);
    settle(g);
    expect(on(g, 'virtue-of-loyalty')).toHaveLength(1);
  });
});

describe('Werefox Bodyguard', () => {
  it('flash; exiles up to one other non-Fox creature until it leaves the battlefield', () => {
    const g = game({
      p1: { hand: ['werefox-bodyguard'], battlefield: n('plains', 5) },
      p2: { battlefield: ['serra-angel', 'werefox-bodyguard'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const fox = g.id('p2', 'werefox-bodyguard');
    const bodyguard = g.id('p1', 'werefox-bodyguard', 'hand');
    expect(keywords(g, bodyguard).has('flash')).toBe(true);
    // A Fox (the other Bodyguard) isn't a legal target.
    const legalTargets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === bodyguard);
    expect(legalTargets.length).toBeGreaterThan(0);
    cast(g, 'werefox-bodyguard');
    g.pass();
    g.pass();
    const options = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(
      options.some((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === fox)),
    ).toBe(false);
    expect(
      options.some((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === angel)),
    ).toBe(true);
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    // {1}{W}, sacrifice: gain 2 life; the Angel comes back.
    const mine = g.id('p1', 'werefox-bodyguard');
    expect(pt(g, mine)).toEqual([2, 2]);
    activateWhere(g, mine, 1);
    settle(g);
    expect(g.life('p1')).toBe(22);
    expect(g.zoneOf(angel)).toBe('battlefield');
    expect(g.obj(angel).controller).toBe('p2');
  });
  it('the exile ends when the Bodyguard is destroyed too', () => {
    const g = game({
      p1: { hand: ['werefox-bodyguard', 'stroke-of-midnight'], battlefield: n('plains', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'werefox-bodyguard');
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
    cast(g, 'stroke-of-midnight', [g.ref(g.id('p1', 'werefox-bodyguard'))]);
    settle(g);
    expect(g.zoneOf(angel)).toBe('battlefield');
  });
  it('can be cast with no target (up to one)', () => {
    const g = game({ p1: { hand: ['werefox-bodyguard'], battlefield: n('plains', 3) } });
    cast(g, 'werefox-bodyguard');
    settle(g);
    expect(on(g, 'werefox-bodyguard')).toHaveLength(1);
  });
});

describe('Woodland Acolyte // Mend the Wilds', () => {
  it('draws a card when it enters', () => {
    const g = game({ p1: { hand: ['woodland-acolyte'], battlefield: n('plains', 3) } });
    cast(g, 'woodland-acolyte');
    settle(g);
    expect(pt(g, g.id('p1', 'woodland-acolyte'))).toEqual([2, 2]);
    expect(hand(g)).toHaveLength(1);
  });
  it('Mend the Wilds puts a permanent card from your graveyard on top of your library, then the Acolyte can be cast', () => {
    const g = game({
      p1: {
        hand: ['woodland-acolyte'],
        graveyard: ['savannah-lions', 'lightning-bolt'],
        battlefield: ['forest', 'plains', 'plains', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    const bolt = g.id('p1', 'lightning-bolt', 'graveyard');
    // Only permanent cards are legal targets.
    const card = g.id('p1', 'woodland-acolyte', 'hand');
    const targeted = g
      .legal()
      .filter((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && a.card === card && a.back === true);
    expect(targeted.some((a) => targetsOf(a, bolt))).toBe(false);
    expect(targeted.some((a) => targetsOf(a, lions))).toBe(true);
    castBack(g, 'woodland-acolyte', [g.ref(lions)]);
    settle(g);
    expect(g.state.players.p1.library[0]).toBe(lions);
    const acolyte = g.id('p1', 'woodland-acolyte', 'exile');
    expect(g.obj(acolyte).onAdventure).toBe(true);
  });
});
