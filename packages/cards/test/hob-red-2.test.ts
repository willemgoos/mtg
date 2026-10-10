import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Action, createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activations, done, exile, gy, hand, passTo, tokens } from './ecl-red-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Hobbit 20b: the red cards (part two: Gandalf, Spark Starter to Tidings of War).

type G = ReturnType<typeof game>;
const bf = (g: G, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);
const kw = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const pick = (g: G, label: RegExp | string) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`no choice: ${d.kind}`);
  const index = d.options.findIndex((o) =>
    typeof label === 'string' ? o.label.startsWith(label) : label.test(o.label),
  );
  if (index < 0) throw new Error(`no option ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  g.do({ type: 'chooseOption', player: g.actor, index });
};
/** Answers a trigger's target choice with exactly these objects (or players). */
const chooseTargets = (g: G, ...targets: ({ player: 'p1' | 'p2' } | string)[]) => {
  const want = targets.map((t) => (typeof t === 'string' ? t : t.player));
  const a = g
    .legal()
    .find(
      (x): x is Extract<Action, { type: 'chooseTargets' }> =>
        x.type === 'chooseTargets' &&
        x.targets.length === want.length &&
        x.targets.every((t, i) => ('object' in t ? t.object.id : t.player) === want[i]),
    );
  if (!a)
    throw new Error(`no such target choice: ${JSON.stringify(want)} in ${JSON.stringify(g.legal())}`);
  g.do(a);
};
function attack(g: G, attackers: string[]): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
}
/** Passes priority until a trigger asks for its targets. */
const toTargets = (g: G) => {
  for (let i = 0; i < 10 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
  expect(g.decision.kind).toBe('chooseTriggerTargets');
};
const setCounters = (g: G, id: string, counters: Record<string, number>) => {
  const o = g.state.objects[id]!;
  g.state = {
    ...g.state,
    objects: { ...g.state.objects, [id]: { ...o, counters: { ...o.counters, ...counters } } },
  };
};
const sacrificing = (g: G, source: string, victim: string) =>
  activations(g, source).find((a) => (a as { sacrifice?: string }).sacrifice === victim)!;

describe('Gandalf, Spark Starter', () => {
  it('deals 3 damage divided among up to three targets', () => {
    const g = game({
      p1: { hand: ['gandalf-spark-starter'], battlefield: n('mountain', 6) },
      p2: { battlefield: ['iron-hills-stalwart', 'dwarven-mauler'] },
    });
    cast(g, 'gandalf-spark-starter');
    settle(g);
    pick(g, '1 damage to Dwarven Mauler');
    pick(g, '1 damage to Your opponent');
    pick(g, '1 damage to Iron Hills Stalwart');
    settle(g);
    expect(bf(g, 'dwarven-mauler', 'p2')).toHaveLength(0);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(g.id('p2', 'iron-hills-stalwart')).damage).toBe(1);
  });
});

describe('Getaway Barrel', () => {
  const run = (library: string[]) => {
    const g = game({
      p1: {
        battlefield: ['getaway-barrel', 'stone-giant-of-high-pass', ...n('mountain', 3)],
        library,
      },
    });
    const sac = sacrificing(g, g.id('p1', 'stone-giant-of-high-pass'), g.id('p1', 'getaway-barrel'));
    expect(sac).toBeDefined();
    g.do({ ...sac, targets: [{ player: 'p2' }] } as never);
    settle(g);
    return g;
  };

  it('puts a random creature of the top thirteen onto the battlefield, the rest on the bottom', () => {
    const g = run([...n('forest', 5), 'dwarven-mauler', ...n('forest', 12)]);
    expect(gy(g)).toContain('getaway-barrel');
    expect(bf(g, 'dwarven-mauler')).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(17);
  });

  it('picks one of several creatures, and puts nothing onto the battlefield without one', () => {
    const two = run([...n('forest', 3), 'dwarven-mauler', 'dori-bearer-of-friends', ...n('forest', 12)]);
    expect(
      bf(two, 'dwarven-mauler').length + bf(two, 'dori-bearer-of-friends').length,
    ).toBe(1);
    const none = run(n('forest', 15));
    expect(none.state.players.p1.library).toHaveLength(15);
  });

  it('only looks at the top thirteen cards', () => {
    const g = run([...n('forest', 13), 'dwarven-mauler']);
    expect(bf(g, 'dwarven-mauler')).toHaveLength(0);
  });
});

describe('Glóin the Mighty // Easy Pickings', () => {
  it('adds {R}{R} at the beginning of your first main phase', () => {
    const g = game({ p1: { battlefield: ['gl-in-the-mighty'] } });
    passTo(g, 'main1', 'p1');
    settle(g);
    expect(g.state.players.p1.pool).toHaveLength(2);
  });

  it('Easy Pickings deals 1 damage to each creature your opponents control', () => {
    const g = game({
      p1: { hand: ['gl-in-the-mighty'], battlefield: [...n('mountain', 3), 'dwarven-mauler'] },
      p2: { battlefield: ['dwarven-mauler', 'iron-hills-stalwart'] },
    });
    const adv = g.legal().find((a) => a.type === 'castSpell' && a.back === true)!;
    g.do(adv as never);
    settle(g);
    expect(bf(g, 'dwarven-mauler', 'p2')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'iron-hills-stalwart')).damage).toBe(1);
    expect(bf(g, 'dwarven-mauler', 'p1')).toHaveLength(1);
    expect(exile(g)).toContain('gl-in-the-mighty');
  });
});

describe('Goblin-town Flunkies', () => {
  it('amasses Goblins 1 when it enters', () => {
    const g = game({ p1: { hand: ['goblin-town-flunkies'], battlefield: n('mountain', 2) } });
    cast(g, 'goblin-town-flunkies');
    settle(g);
    const army = tokens(g, 'hob-goblin-army-token');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
  });
});

describe('Gundabad Opportunist', () => {
  it('exiles the top card; you may play it until the end of your next turn', () => {
    const g = game({
      p1: {
        hand: ['gundabad-opportunist'],
        battlefield: n('mountain', 4),
        library: ['shock', 'forest'],
      },
    });
    cast(g, 'gundabad-opportunist');
    settle(g);
    expect(exile(g)).toEqual(['shock']);
    const canShock = () =>
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'shock');
    expect(canShock()).toBe(false); // tapped out
    passTo(g, 'main1', 'p1');
    expect(canShock()).toBe(true);
  });
});

describe('Iron Hills Stalwart', () => {
  it('attaches target Equipment you control to up to one target creature you control', () => {
    const g = game({
      p1: {
        hand: ['iron-hills-stalwart'],
        battlefield: [...n('mountain', 5), 'ragged-short-spear', 'dori-bearer-of-friends'],
      },
    });
    cast(g, 'iron-hills-stalwart');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 2));
    expect(g.obj(g.id('p1', 'ragged-short-spear')).attachedTo).toBeDefined();
  });
});

describe("Last Light of Durin's Day", () => {
  const LL = 'last-light-of-durins-day';
  const setup = () =>
    game({
      p1: {
        hand: ['mountain', 'smaug-the-magnificent'],
        battlefield: [LL],
        library: ['forest', 'smaug-the-great-calamity', 'forest'],
      },
    });

  it('a Mountain entering adds a quest counter', () => {
    const g = setup();
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    settle(g);
    expect(g.obj(g.id('p1', LL)).counters?.quest).toBe(1);
  });

  it('with six counters it is sacrificed and fetches a Dragon from the library, then shuffles', () => {
    const g = setup();
    setCounters(g, g.id('p1', LL), { quest: 5 });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    settle(g);
    expect(bf(g, LL)).toHaveLength(0);
    // The options are the Dragon in hand and the one in the library.
    const choices = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(choices).toHaveLength(2);
    g.do(choices.find((a) => a.type === 'chooseCard' && g.obj(a.card!).zone === 'library')!);
    settle(g);
    expect(bf(g, 'smaug-the-great-calamity')).toHaveLength(1);
    expect(g.events.some((e) => e.type === 'shuffled' && e.player === 'p1')).toBe(true);
  });

  it('taking the Dragon from your hand does not shuffle', () => {
    const g = setup();
    setCounters(g, g.id('p1', LL), { quest: 5 });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    settle(g);
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).zone === 'hand')!);
    settle(g);
    expect(bf(g, 'smaug-the-magnificent')).toHaveLength(1);
    expect(g.events.some((e) => e.type === 'shuffled' && e.player === 'p1')).toBe(false);
  });

  it('Mountaincycling {2} fetches a Mountain', () => {
    const g = game({
      p1: { hand: [LL], battlefield: n('mountain', 2), library: ['forest', 'mountain'] },
    });
    const cycle = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === g.id('p1', LL, 'hand'))!;
    expect(cycle).toBeDefined();
    g.do(cycle);
    settle(g);
    done(g);
    expect(hand(g)).toEqual(['mountain']);
  });
});

describe('Misty Mountains Raider', () => {
  it('amasses Goblins 2 whenever you attack', () => {
    const g = game({ p1: { battlefield: ['misty-mountains-raider'] } });
    attack(g, [g.id('p1', 'misty-mountains-raider')]);
    settle(g);
    const army = tokens(g, 'hob-goblin-army-token');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([2, 2]);
  });
});

describe('Óin the Brave', () => {
  it('gets +1/+0 and haste with an enduring story', () => {
    const story = game({
      p1: { battlefield: ['in-the-brave', 'getaway-barrel', 'ragged-short-spear'] },
    });
    const oin = story.id('p1', 'in-the-brave');
    expect(pt(story, oin)).toEqual([2, 3]);
    expect(kw(story, oin)).toContain('haste');
    const plain = game({ p1: { battlefield: ['in-the-brave'] } });
    expect(pt(plain, plain.id('p1', 'in-the-brave'))).toEqual([1, 3]);
    expect(kw(plain, plain.id('p1', 'in-the-brave'))).not.toContain('haste');
  });

  it('{1}, {T}, discard a card: draw a card', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['in-the-brave', 'mountain'],
        library: ['dwarven-mauler', 'forest'],
      },
    });
    const act = activations(g, g.id('p1', 'in-the-brave'))[0]!;
    expect(act).toBeDefined();
    g.do(act);
    done(g);
    expect(hand(g)).toEqual(['dwarven-mauler']);
    expect(gy(g)).toEqual(['shock']);
  });
});

describe('Pinecone Strike', () => {
  // Dori makes the Treasure token to destroy (one of Pinecone Strike's targets).
  const setup = () => {
    const g = game({
      p1: { hand: ['dori-bearer-of-friends', 'pinecone-strike'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['dwarven-mauler'] },
    });
    cast(g, 'dori-bearer-of-friends');
    settle(g);
    return g;
  };

  it('deals 3 damage and exiles the creature if it would die', () => {
    const g = setup();
    const mauler = g.id('p2', 'dwarven-mauler');
    const one = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.length === 1 &&
          'object' in a.targets[0]! &&
          a.targets[0].object.id === mauler,
      )!;
    expect(one).toBeDefined();
    g.do(one);
    settle(g);
    expect(exile(g, 'p2')).toContain('dwarven-mauler');
    expect(gy(g, 'p2')).not.toContain('dwarven-mauler');
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });

  it('can destroy an artifact token, or do both', () => {
    const g = setup();
    const both = g.legal().filter((a) => a.type === 'castSpell' && a.targets.length === 2);
    expect(both.length).toBeGreaterThan(0);
    g.do(both[0]!);
    settle(g);
    expect(exile(g, 'p2')).toContain('dwarven-mauler');
    expect(tokens(g, 'treasure-token')).toHaveLength(0);
  });
});

describe('Ragged Short Spear', () => {
  it('may discard a card when it enters; if you do, draw two', () => {
    const g = game({
      p1: {
        hand: ['ragged-short-spear', 'shock'],
        battlefield: n('mountain', 2),
        library: ['forest', 'forest', 'forest'],
      },
    });
    cast(g, 'ragged-short-spear');
    settle(g);
    done(g, { accept: true });
    expect(gy(g)).toEqual(['shock']);
    expect(hand(g)).toEqual(['forest', 'forest']);
  });

  it('gives +2/+0 and equips for {3}', () => {
    const g = game({
      p1: { battlefield: ['ragged-short-spear', 'dwarven-mauler', ...n('mountain', 3)] },
    });
    const spear = g.id('p1', 'ragged-short-spear');
    const mauler = g.id('p1', 'dwarven-mauler');
    const act = activations(g, spear).find(
      (a) => a.targets[0] && 'object' in a.targets[0] && a.targets[0].object.id === mauler,
    );
    expect(act).toBeDefined();
    g.do(act!);
    settle(g);
    expect(pt(g, mauler)).toEqual([4, 1]);
  });
});

describe('Smaug the Magnificent', () => {
  it('attacking deals damage equal to your Treasures to any target', () => {
    const g = game({
      p1: { battlefield: ['smaug-the-magnificent', 'treasure-token', 'treasure-token'] },
    });
    attack(g, [g.id('p1', 'smaug-the-magnificent')]);
    chooseTargets(g, { player: 'p2' });
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('creates a Treasure at the beginning of your upkeep', () => {
    const g = game({ p1: { battlefield: ['smaug-the-magnificent'] } });
    passTo(g, 'upkeep', 'p1');
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });
});

describe("Smaug's Fury", () => {
  it('gives +3/+0, reach and first strike', () => {
    const g = game({
      p1: { hand: ['smaugs-fury'], battlefield: ['dwarven-mauler', 'mountain', 'mountain'] },
    });
    const mauler = g.id('p1', 'dwarven-mauler');
    cast(g, 'smaugs-fury', [g.ref(mauler)]);
    settle(g);
    expect(pt(g, mauler)).toEqual([5, 1]);
    expect(kw(g, mauler)).toContain('reach');
    expect(kw(g, mauler)).toContain('firstStrike');
  });
});

describe('Smaug, the Great Calamity // Spew Flame', () => {
  it('Spew Flame deals 5 damage to target creature, then Smaug can be cast from exile', () => {
    const g = game({
      p1: { hand: ['smaug-the-great-calamity'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['iron-hills-stalwart'] },
    });
    const adv = g.legal().find((a) => a.type === 'castSpell' && a.back === true)!;
    g.do({ ...adv, targets: [g.ref(g.id('p2', 'iron-hills-stalwart'))] } as never);
    settle(g);
    expect(bf(g, 'iron-hills-stalwart', 'p2')).toHaveLength(0);
    expect(exile(g)).toContain('smaug-the-great-calamity');
  });
});

describe('Snowslope Hunter', () => {
  it('sacrifices another creature or artifact to exile the top card, once each turn', () => {
    const g = game({
      p1: {
        battlefield: ['snowslope-hunter', 'dwarven-mauler', 'getaway-barrel'],
        library: ['shock', 'forest', 'forest'],
      },
    });
    const hunter = g.id('p1', 'snowslope-hunter');
    const acts = activations(g, hunter);
    const sacs = acts.map((a) => (a as { sacrifice?: string }).sacrifice);
    expect(sacs).toContain(g.id('p1', 'dwarven-mauler'));
    expect(sacs).toContain(g.id('p1', 'getaway-barrel'));
    expect(sacs).not.toContain(hunter);
    g.do(sacrificing(g, hunter, g.id('p1', 'dwarven-mauler')));
    settle(g);
    expect(exile(g)).toEqual(['shock']);
    expect(bf(g, 'dwarven-mauler')).toHaveLength(0);
    expect(activations(g, hunter)).toHaveLength(0);
  });
});

describe('Stone-Giant of High Pass', () => {
  it('makes a Stone Boulder when it enters; sacrifice an artifact for 4 damage', () => {
    const g = game({ p1: { hand: ['stone-giant-of-high-pass'], battlefield: n('mountain', 10) } });
    cast(g, 'stone-giant-of-high-pass');
    settle(g);
    const boulders = tokens(g, 'hob-stone-boulder-token');
    expect(boulders).toHaveLength(1);
    expect(pt(g, boulders[0]!)).toEqual([3, 1]);
    expect(kw(g, boulders[0]!)).toContain('defender');
    const sac = sacrificing(g, g.id('p1', 'stone-giant-of-high-pass'), boulders[0]!);
    expect(sac).toBeDefined();
    g.do({ ...sac, targets: [{ player: 'p2' }] } as never);
    settle(g);
    expect(g.life('p2')).toBe(16);
    expect(tokens(g, 'hob-stone-boulder-token')).toHaveLength(0);
  });

  it('attacking makes another Stone Boulder', () => {
    const g = game({ p1: { battlefield: ['stone-giant-of-high-pass'] } });
    attack(g, [g.id('p1', 'stone-giant-of-high-pass')]);
    settle(g);
    expect(tokens(g, 'hob-stone-boulder-token')).toHaveLength(1);
  });
});

describe('The Misty Mountains Cold', () => {
  it('makes a Treasure and stays below four Treasures', () => {
    const g = game({ p1: { hand: ['the-misty-mountains-cold'], battlefield: n('mountain', 3) } });
    cast(g, 'the-misty-mountains-cold');
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
    expect(bf(g, 'the-misty-mountains-cold')).toHaveLength(1);
  });

  it('with four Treasures it is sacrificed for a 6/6 flying Dragon', () => {
    const g = game({
      p1: {
        hand: ['the-misty-mountains-cold'],
        battlefield: [...n('mountain', 3), ...n('treasure-token', 3)],
      },
    });
    cast(g, 'the-misty-mountains-cold');
    settle(g);
    expect(bf(g, 'the-misty-mountains-cold')).toHaveLength(0);
    const dragon = tokens(g, 'hob-dragon-token');
    expect(dragon).toHaveLength(1);
    expect(pt(g, dragon[0]!)).toEqual([6, 6]);
    expect(kw(g, dragon[0]!)).toContain('flying');
  });
});

describe('Thorin, Mountain-king', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['thorin-mountain-king'],
        battlefield: [...n('mountain', 4), 'ragged-short-spear', 'dori-bearer-of-friends'],
      },
      p2: { battlefield: ['iron-hills-stalwart', 'dwarven-mauler'] },
    });

  it('attaches Equipment to a creature, which then deals damage equal to its power', () => {
    const g = setup();
    cast(g, 'thorin-mountain-king');
    toTargets(g);
    const dori = g.id('p1', 'dori-bearer-of-friends');
    const spear = g.id('p1', 'ragged-short-spear');
    chooseTargets(g, dori);
    chooseTargets(g, dori, spear);
    chooseTargets(g, dori, spear); // (the pick that finishes the list)
    // The reflexive ability: Dori (3 + 2 power) deals damage to up to one creature.
    toTargets(g);
    chooseTargets(g, g.id('p2', 'iron-hills-stalwart'));
    settle(g);
    expect(g.obj(spear).attachedTo).toBe(dori);
    expect(bf(g, 'iron-hills-stalwart', 'p2')).toHaveLength(0);
  });

  it('does nothing more when no Equipment is attached', () => {
    const g = setup();
    cast(g, 'thorin-mountain-king');
    toTargets(g);
    const dori = g.id('p1', 'dori-bearer-of-friends');
    chooseTargets(g, dori);
    chooseTargets(g, dori);
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.obj(g.id('p2', 'iron-hills-stalwart')).damage).toBe(0);
  });

  it('an Equipment already attached to that creature does not set off the damage', () => {
    const g = setup();
    const dori = g.id('p1', 'dori-bearer-of-friends');
    const spear = g.id('p1', 'ragged-short-spear');
    const o = g.state.objects[spear]!;
    g.state = { ...g.state, objects: { ...g.state.objects, [spear]: { ...o, attachedTo: dori } } };
    cast(g, 'thorin-mountain-king');
    toTargets(g);
    chooseTargets(g, dori);
    chooseTargets(g, dori, spear);
    chooseTargets(g, dori, spear); // (the pick that finishes the list)
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.obj(g.id('p2', 'iron-hills-stalwart')).damage).toBe(0);
  });
});

describe('Tidings of War', () => {
  it('amasses Goblins 1; from the graveyard (flashback) amasses Goblins 3 instead', () => {
    const g = game({ p1: { hand: ['tidings-of-war'], battlefield: n('mountain', 5) } });
    cast(g, 'tidings-of-war');
    settle(g);
    const army = tokens(g, 'hob-goblin-army-token');
    expect(pt(g, army[0]!)).toEqual([1, 1]);
    const flash = g
      .legal()
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'tidings-of-war')!;
    expect(flash).toBeDefined();
    g.do(flash);
    settle(g);
    expect(pt(g, army[0]!)).toEqual([4, 4]);
    expect(exile(g)).toContain('tidings-of-war');
  });
});

describe('The Hobbit red: random games', () => {
  it('plays short random games with every red card in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const groups = JSON.parse(
      readFileSync(new URL('../scripts/data/hob-groups.json', import.meta.url), 'utf8'),
    ) as Record<string, string>;
    const cards = Object.keys(groups)
      .filter((name) => groups[name] === 'red')
      .map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('mountain', 24)].slice(0, 70);
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120000);
});
