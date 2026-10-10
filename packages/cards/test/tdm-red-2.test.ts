import { describe, expect, it } from 'vitest';
import { getCharacteristics, type Action } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activate, casts, done, exile, gy, hand, keywords, tokens } from './ecl-red-helpers.ts';

// Tarkir: Dragonstorm 19b: the red cards that need more setting up.

type G = ReturnType<typeof game>;
const on = (g: G, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);

function attack(g: G, attackers: string[]): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
}

/** The legal casts from the graveyard of this card. */
const gyCasts = (g: G, defId: string) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && g.obj(a.card).defId === defId && g.obj(a.card).zone === 'graveyard',
    );

describe('Channeled Dragonfire', () => {
  it('deals 2 damage to any target', () => {
    const g = game({ p1: { hand: ['channeled-dragonfire'], battlefield: ['mountain'] } });
    cast(g, 'channeled-dragonfire', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(gy(g)).toEqual(['channeled-dragonfire']);
  });

  it('harmonize: cast from the graveyard for {5}{R}{R}, tapping a creature to pay less, then exiled', () => {
    const g = game({
      p1: {
        graveyard: ['channeled-dragonfire'],
        battlefield: ['serra-angel', ...n('mountain', 3)],
      },
    });
    // 3 lands and no tap: not enough.
    const angel = g.id('p1', 'serra-angel');
    const options = gyCasts(g, 'channeled-dragonfire');
    expect(options.every((a) => a.harmonizeTap === angel)).toBe(true);
    expect(options.length).toBeGreaterThan(0);
    g.do({ ...options[0]!, targets: [{ player: 'p2' }] });
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(g.obj(angel).tapped).toBe(true);
    expect(exile(g)).toEqual(['channeled-dragonfire']);
  });
});

describe('Wild Ride', () => {
  it('gives +3/+0 and haste; harmonize {4}{R} from the graveyard', () => {
    const g = game({
      p1: { hand: ['wild-ride'], battlefield: ['savannah-lions', 'mountain'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'wild-ride', [g.ref(lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([5, 1]);
    expect(keywords(g, lions)).toContain('haste');
    expect(gy(g)).toEqual(['wild-ride']);
  });

  it('is cast again from the graveyard with harmonize and then exiled', () => {
    const g = game({
      p1: { graveyard: ['wild-ride'], battlefield: ['savannah-lions', ...n('mountain', 5)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const opts = gyCasts(g, 'wild-ride').filter((a) => !a.harmonizeTap);
    expect(opts.length).toBeGreaterThan(0);
    g.do({ ...opts.find((a) => a.targets.some((t) => 'object' in t && t.object.id === lions))! });
    settle(g);
    expect(pt(g, lions)).toEqual([5, 1]);
    expect(exile(g)).toEqual(['wild-ride']);
  });
});

describe('Cori-Steel Cutter', () => {
  it('gives +1/+1, trample and haste to the equipped creature', () => {
    const g = game({ p1: { battlefield: ['cori-steel-cutter', 'savannah-lions', ...n('mountain', 2)] } });
    const lions = g.id('p1', 'savannah-lions');
    const cutter = g.id('p1', 'cori-steel-cutter');
    activate(g, cutter, 2, [g.ref(lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toEqual(expect.arrayContaining(['trample', 'haste']));
  });

  it('flurry: makes a Monk with prowess and may attach itself to it', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['cori-steel-cutter', 'savannah-lions', ...n('mountain', 2)],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(on(g, 'tdm-monk-token')).toHaveLength(0);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    done(g, { accept: true });
    const monk = on(g, 'tdm-monk-token');
    expect(monk).toHaveLength(1);
    expect(g.obj(g.id('p1', 'cori-steel-cutter')).attachedTo).toBe(monk[0]);
    expect(keywords(g, monk[0]!)).toEqual(expect.arrayContaining(['trample', 'haste']));
  });

  it('flurry: declining to attach leaves the Equipment where it was', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['cori-steel-cutter', ...n('mountain', 2)],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    done(g, { accept: false });
    expect(on(g, 'tdm-monk-token')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'cori-steel-cutter')).attachedTo).toBeUndefined();
  });
});

describe('Fire-Rim Form', () => {
  it('has flash, gives first strike this turn and +2/+0', () => {
    const g = game({
      p1: { hand: ['fire-rim-form'], battlefield: ['savannah-lions', ...n('mountain', 2)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(casts(g, 'fire-rim-form').length).toBeGreaterThan(0);
    cast(g, 'fire-rim-form', [g.ref(lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(keywords(g, lions)).toContain('firstStrike');
  });
});

describe('Shock Brigade', () => {
  it('has menace and mobilizes 1', () => {
    const g = game({ p1: { battlefield: ['shock-brigade'] } });
    const b = g.id('p1', 'shock-brigade');
    expect(keywords(g, b)).toContain('menace');
    attack(g, [b]);
    settle(g);
    expect(tokens(g, 'tdm-warrior-token')).toHaveLength(1);
  });
});

describe('Stadium Headliner', () => {
  it('sacrifices itself to deal damage equal to the creatures you control to a creature', () => {
    const g = game({
      p1: {
        battlefield: ['stadium-headliner', 'savannah-lions', 'savannah-lions', ...n('mountain', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const src = g.id('p1', 'stadium-headliner');
    activate(g, src, 1, [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    // Two Lions are left once the Headliner is sacrificed: 2 damage.
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
    expect(gy(g)).toContain('stadium-headliner');
  });
});

describe('Sunset Strikemaster', () => {
  it('taps for R; sacrificed, deals 6 damage to a creature with flying', () => {
    const g = game({
      p1: { battlefield: ['sunset-strikemaster', ...n('mountain', 3)] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const sm = g.id('p1', 'sunset-strikemaster');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === sm);
    const targeted = acts.flatMap((a) => (a.type === 'activateAbility' ? a.targets : []));
    expect(targeted.every((t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel'))).toBe(true);
    activate(g, sm, 1, [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g)).toContain('sunset-strikemaster');
  });
});

describe('Twin Bolt', () => {
  const pick = (g: G, label: string) => {
    settle(g);
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error(`no choice for ${label}`);
    const index = d.options.findIndex((o) => o.label.startsWith(label));
    expect(index, label).toBeGreaterThanOrEqual(0);
    g.do({ type: 'chooseOption', player: g.actor, index });
  };

  it('deals all 2 damage to one target', () => {
    const g = game({
      p1: { hand: ['twin-bolt'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'twin-bolt');
    pick(g, '2 damage to Serra Angel');
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });

  it('divides 1 and 1 between two targets, and does not offer "no targets"', () => {
    const g = game({
      p1: { hand: ['twin-bolt'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'twin-bolt');
    settle(g);
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error('no choice');
    expect(d.options.some((o) => o.label === 'No targets')).toBe(false);
    pick(g, '1 damage to Serra Angel');
    pick(g, '1 damage to Your opponent');
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(1);
    expect(g.life('p2')).toBe(19);
  });
});

describe('Molten Exhale', () => {
  it('deals 4 damage to a creature or planeswalker; a Dragon beheld gives it flash', () => {
    const g = game({
      p1: { hand: ['molten-exhale'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'molten-exhale', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('is a sorcery without a Dragon to behold: not castable outside your main phase', () => {
    const g = game({
      p1: { hand: ['molten-exhale'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
      step: 'beginCombat',
    });
    expect(
      g.legal('p1').filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'molten-exhale'),
    ).toHaveLength(0);
  });

  it('beholding a Dragon from your hand makes it castable at instant speed', () => {
    const g = game({
      p1: { hand: ['molten-exhale', 'shivan-dragon'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
      step: 'beginCombat',
    });
    const flash = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'molten-exhale');
    expect(flash.length).toBeGreaterThan(0);
    expect(flash.every((a) => a.type === 'castSpell' && a.beholdCard !== undefined)).toBe(true);
  });
});

describe('Narset’s Rebuke', () => {
  it('deals 5 damage, adds URW and exiles the creature if it would die', () => {
    const g = game({
      p1: { hand: ['narsets-rebuke'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'narsets-rebuke', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g, 'p2')).toEqual([]);
    expect((g.state.players.p1.pool ?? []).length).toBe(3);
  });
});

describe('Overwhelming Surge', () => {
  it('can deal 3 damage to a creature, destroy a noncreature artifact, or both', () => {
    const g = game({
      p1: { hand: ['overwhelming-surge'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel', 'sol-ring'] },
    });
    const opts = casts(g, 'overwhelming-surge');
    const both = opts.filter((a) => a.targets.length === 2);
    expect(both.length).toBeGreaterThan(0);
    expect(opts.filter((a) => a.targets.length === 1).length).toBeGreaterThan(0);
    g.do(both[0]!);
    settle(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
    expect(gy(g, 'p2')).toContain('sol-ring');
  });
});

describe('Reverberating Summons', () => {
  it('becomes a 3/3 Monk with haste at combat after two spells', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: ['reverberating-summons', ...n('mountain', 2)] },
    });
    const rs = g.id('p1', 'reverberating-summons');
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    g.passUntilStep('beginCombat');
    settle(g);
    expect(pt(g, rs)).toEqual([3, 3]);
    expect(keywords(g, rs)).toContain('haste');
    const ch = getCharacteristics(g.state, cardDb, rs);
    expect(ch.types).toEqual(expect.arrayContaining(['Enchantment', 'Creature']));
    expect(ch.types).not.toContain('Artifact');
    expect(ch.subtypes).toContain('Monk');
  });

  it('stays an enchantment with fewer than two spells', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['reverberating-summons', 'mountain'] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    g.passUntilStep('beginCombat');
    settle(g);
    expect(getCharacteristics(g.state, cardDb, g.id('p1', 'reverberating-summons')).types).toEqual([
      'Enchantment',
    ]);
  });

  it('{1}{R}, discard your hand, sacrifice: draw two cards', () => {
    const g = game({
      p1: {
        hand: ['mountain', 'forest', 'plains'],
        battlefield: ['reverberating-summons', ...n('mountain', 2)],
        library: ['island', 'swamp', 'forest'],
      },
    });
    activate(g, g.id('p1', 'reverberating-summons'), 1);
    settle(g);
    expect(hand(g)).toEqual(['island', 'swamp']);
    expect(gy(g).sort()).toEqual(['forest', 'mountain', 'plains', 'reverberating-summons']);
  });

  it('can be activated with an empty hand', () => {
    const g = game({
      p1: { battlefield: ['reverberating-summons', ...n('mountain', 2)], library: ['island', 'swamp'] },
    });
    activate(g, g.id('p1', 'reverberating-summons'), 1);
    settle(g);
    expect(hand(g)).toEqual(['island', 'swamp']);
  });
});

describe('Runescale Stormbrood // Chilling Screech', () => {
  it('gets +2/+0 for noncreature spells and Dragon spells, not for other creature spells', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shivan-dragon', 'frenzied-goblin'],
        battlefield: ['runescale-stormbrood', ...n('mountain', 8)],
      },
    });
    const r = g.id('p1', 'runescale-stormbrood');
    expect(pt(g, r)).toEqual([2, 4]);
    cast(g, 'frenzied-goblin');
    settle(g);
    expect(pt(g, r)).toEqual([2, 4]);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(pt(g, r)).toEqual([4, 4]);
    cast(g, 'shivan-dragon');
    settle(g);
    expect(pt(g, r)).toEqual([6, 4]);
  });

  it('Chilling Screech counters a spell with mana value 2 or less and shuffles back', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['runescale-stormbrood'], battlefield: ['island', 'island'], library: ['forest'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    const screech = g
      .legal('p2')
      .filter((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && !!a.back);
    expect(screech.length).toBeGreaterThan(0);
    g.do({ ...screech[0]!, targets: screech[0]!.targets });
    g.pass();
    g.pass();
    settle(g);
    expect(g.life('p2')).toBe(20);
    expect(gy(g)).toEqual(['shock']);
    expect(gy(g, 'p2')).toEqual([]);
    expect(g.state.players.p2.library).toHaveLength(2);
  });
});

describe('Stormshriek Feral // Flush Out', () => {
  it('has flying and haste; {1}{R} gives +1/+0', () => {
    const g = game({ p1: { battlefield: ['stormshriek-feral', ...n('mountain', 2)] } });
    const f = g.id('p1', 'stormshriek-feral');
    expect(keywords(g, f)).toEqual(expect.arrayContaining(['flying', 'haste']));
    activate(g, f, 0);
    settle(g);
    expect(pt(g, f)).toEqual([4, 3]);
  });

  it('Flush Out discards a card and draws two, then shuffles itself into the library', () => {
    const g = game({
      p1: {
        hand: ['stormshriek-feral', 'mountain'],
        battlefield: n('mountain', 2),
        library: ['island', 'swamp'],
      },
    });
    const flush = g
      .legal()
      .filter((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && !!a.back);
    expect(flush.length).toBeGreaterThan(0);
    g.do(flush[0]!);
    done(g);
    expect(hand(g).sort()).toEqual(['island', 'swamp']);
    expect(gy(g)).toEqual(['mountain']);
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toContain('stormshriek-feral');
  });
});

describe('Stormscale Scion', () => {
  it('gives other Dragons +1/+1', () => {
    const g = game({ p1: { battlefield: ['stormscale-scion', 'shivan-dragon'] } });
    expect(pt(g, g.id('p1', 'shivan-dragon'))).toEqual([6, 6]);
    expect(pt(g, g.id('p1', 'stormscale-scion'))).toEqual([4, 4]);
  });

  it('storm: copies itself for each spell cast before it this turn, by either player', () => {
    const g = game({
      p1: {
        hand: ['stormscale-scion', 'shock', 'shock'],
        battlefield: n('mountain', 9),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'stormscale-scion');
    settle(g);
    // The original and two copies, which are tokens.
    expect(on(g, 'stormscale-scion')).toHaveLength(3);
    expect(on(g, 'stormscale-scion').filter((id) => g.obj(id).isToken)).toHaveLength(2);
  });
});

describe('Stormscale Scion storm count', () => {
  it('counts the opponent’s spells too', () => {
    const g = game({
      p1: { hand: ['stormscale-scion', 'shock'], battlefield: n('mountain', 8) },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    // The opponent responds with a Shock of their own.
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [{ player: 'p1' }],
    });
    settle(g);
    cast(g, 'stormscale-scion');
    settle(g);
    expect(on(g, 'stormscale-scion')).toHaveLength(3);
  });

  it('does not count spells cast in response to the storm trigger', () => {
    const g = game({
      p1: { hand: ['stormscale-scion', 'shock'], battlefield: n('mountain', 8) },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'stormscale-scion');
    // The trigger is on the stack above the creature spell; the opponent responds with a Shock.
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [{ player: 'p1' }],
    });
    settle(g);
    // One spell (the first Shock) was cast before the Scion: the original and one copy.
    expect(on(g, 'stormscale-scion')).toHaveLength(2);
  });
});

describe('Sarkhan, Dragon Ascendant', () => {
  it('may behold a Dragon to make a Treasure', () => {
    const g = game({
      p1: { hand: ['sarkhan-dragon-ascendant', 'shivan-dragon'], battlefield: n('mountain', 2) },
    });
    cast(g, 'sarkhan-dragon-ascendant');
    settle(g);
    done(g, { option: 0 });
    expect(on(g, 'treasure-token')).toHaveLength(1);
    expect(hand(g)).toContain('shivan-dragon');
  });

  it('whenever a Dragon enters: +1/+1 counter and becomes a flying Dragon until end of turn', () => {
    const g = game({
      p1: { hand: ['shivan-dragon'], battlefield: ['sarkhan-dragon-ascendant', ...n('mountain', 6)] },
    });
    const s = g.id('p1', 'sarkhan-dragon-ascendant');
    cast(g, 'shivan-dragon');
    settle(g);
    expect(pt(g, s)).toEqual([3, 3]);
    expect(keywords(g, s)).toContain('flying');
  });
});

describe('Seize Opportunity', () => {
  it('mode 1: exiles the top two cards to play them', () => {
    const g = game({
      p1: {
        hand: ['seize-opportunity'],
        battlefield: n('mountain', 3),
        library: ['island', 'swamp', 'forest'],
      },
    });
    const opts = casts(g, 'seize-opportunity');
    expect(opts.length).toBeGreaterThan(1);
    g.do(opts.find((a) => a.mode === 0)!);
    settle(g);
    expect(exile(g)).toEqual(['island', 'swamp']);
  });

  it('mode 2: up to two target creatures get +2/+1', () => {
    const g = game({
      p1: {
        hand: ['seize-opportunity'],
        battlefield: ['savannah-lions', 'savannah-lions', ...n('mountain', 3)],
      },
    });
    const [a, b] = on(g, 'savannah-lions');
    const opts = casts(g, 'seize-opportunity').filter((x) => x.mode === 1);
    expect(opts.length).toBeGreaterThan(0);
    g.do(opts[0]!);
    // Targets are picked one at a time.
    for (let i = 0; i < 4 && g.decision.kind !== 'priority'; i++) {
      const pick = g.legal().find((x) => x.type === 'chooseTargets' && x.targets.length > 0);
      if (!pick) break;
      g.do(pick);
    }
    settle(g);
    const bumped = [a!, b!].filter((id) => pt(g, id)[0] === 4 && pt(g, id)[1] === 2);
    expect(bumped.length).toBeGreaterThan(0);
    expect(bumped.length).toBeLessThanOrEqual(2);
  });

  it('mode 2 can target none, one or two creatures, never three', () => {
    const g = game({
      p1: {
        hand: ['seize-opportunity'],
        battlefield: ['savannah-lions', 'savannah-lions', 'serra-angel', ...n('mountain', 3)],
      },
    });
    const sizes = new Set(
      casts(g, 'seize-opportunity')
        .filter((x) => x.mode === 1)
        .map((x) => x.targets.length),
    );
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
  });
});

describe('Magmatic Hellkite', () => {
  it('destroys a nonbasic land; its controller fetches a basic tapped with a stun counter', () => {
    const g = game({
      p1: { hand: ['magmatic-hellkite'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['azorius-guildgate'], library: ['plains', 'forest'] },
    });
    cast(g, 'magmatic-hellkite');
    settle(g);
    done(g);
    const lands = g.state.battlefield.filter(
      (id) => g.obj(id).controller === 'p2' && g.obj(id).defId === 'plains',
    );
    expect(gy(g, 'p2')).toEqual(['azorius-guildgate']);
    expect(lands).toHaveLength(1);
    expect(g.obj(lands[0]!).tapped).toBe(true);
    expect(g.obj(lands[0]!).counters?.stun).toBe(1);
  });
});

describe('Breaching Dragonstorm', () => {
  it('exiles until a nonland card; casts it free if its mana value is 8 or less', () => {
    const g = game({
      p1: {
        hand: ['breaching-dragonstorm'],
        battlefield: n('mountain', 5),
        library: ['mountain', 'savannah-lions', 'forest'],
      },
    });
    cast(g, 'breaching-dragonstorm');
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    // The Lions were cast free; the Mountain stays in exile.
    expect(on(g, 'savannah-lions')).toHaveLength(1);
    expect(exile(g)).toEqual(['mountain']);
  });

  it('puts a card into your hand if you do not cast it', () => {
    const g = game({
      p1: {
        hand: ['breaching-dragonstorm'],
        battlefield: n('mountain', 5),
        library: ['savannah-lions', 'forest'],
      },
    });
    cast(g, 'breaching-dragonstorm');
    settle(g);
    // Decline the free cast.
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(hand(g)).toContain('savannah-lions');
  });

  it('returns to hand when a Dragon you control enters', () => {
    const g = game({
      p1: { hand: ['shivan-dragon'], battlefield: ['breaching-dragonstorm', ...n('mountain', 6)] },
    });
    cast(g, 'shivan-dragon');
    settle(g);
    expect(hand(g)).toEqual(['breaching-dragonstorm']);
  });
});

describe('Dracogenesis', () => {
  it('lets you cast Dragon spells without paying their mana costs', () => {
    const g = game({
      p1: { hand: ['shivan-dragon', 'savannah-lions'], battlefield: ['dracogenesis'] },
    });
    const dragon = g.id('p1', 'shivan-dragon', 'hand');
    const free = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === dragon && a.via === 'freeMatching');
    expect(free).toHaveLength(1);
    // The Lions are not a Dragon, and nothing else is castable with no lands.
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
    g.do(free[0]!);
    settle(g);
    expect(on(g, 'shivan-dragon')).toHaveLength(1);
  });

  it('only for its controller', () => {
    const g = game({
      p1: { battlefield: ['dracogenesis'] },
      p2: { hand: ['shivan-dragon'] },
      active: 'p2',
    });
    expect(
      g.legal('p2').filter((a) => a.type === 'castSpell' && a.via === 'freeMatching'),
    ).toHaveLength(0);
  });
});
