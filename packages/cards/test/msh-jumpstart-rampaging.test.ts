import { getCharacteristics, type Action } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packets: Tenacious and Rampaging.

const TENACIOUS = [
  'Undercover Skrull',
  'White Tiger, Amulet Keeper',
  'Hellcat, Undying Vigilante',
  'Gert and Old Lace, Runaways',
  'Voracious Brood',
  'Pet Avengers',
  'Savage Land Dinosaur',
  'Return of the Mole Man',
  'Scout the City',
  'Call Damage Control',
  'Accelerated Evolution',
  'Punishing Punch',
  'Thriving Grove',
  'Terramorphic Expanse',
  'Forest',
];

const RAMPAGING = [
  'Serpent Specialist',
  'Knight of Wundagore',
  'Bushmaster, Coiled Henchman',
  'Titania, Rugged Rumbler',
  'Powerful Broker',
  'Mister Hyde, Monster Within',
  'Atlas, Sizable Stooge',
  'Rhino, Terrible Trampler',
  "Rhino's Rampage",
  'Beast Mode',
  'Colossal Collision',
  'Claim the Kingdom',
  'Thriving Grove',
  'Forest',
];

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];
const ref = (g: G, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });

describe('Tenacious and Rampaging packets', () => {
  it('have every card implemented', () => {
    expect(TENACIOUS.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
    expect(RAMPAGING.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Voracious Brood', () => {
  it('enters with a counter per creature card in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['voracious-brood'],
        battlefield: n('forest', 3),
        graveyard: ['bear-cub', 'llanowar-elves', 'forest', 'lightning-strike'],
      },
    });
    settle(cast(g, 'voracious-brood'));
    expect(pt(g, g.id('p1', 'voracious-brood'))).toEqual([3, 3]);
  });

  it('grows by that many when creature cards are milled together, once', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['voracious-brood', 'return-of-the-mole-man'],
        library: ['bear-cub', 'llanowar-elves', 'forest'],
      },
    });
    const brood = g.id('p1', 'voracious-brood');
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    // One trigger for both cards.
    expect(g.state.stack).toHaveLength(1);
    settle(g);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(pt(g, brood)).toEqual([3, 3]);
  });

  it("grows when your creature dies, but not for tokens or opponents' cards", () => {
    const g = game({
      p1: { battlefield: ['voracious-brood', 'bear-cub'] },
      p2: { hand: ['lightning-strike', 'lightning-strike'], battlefield: n('mountain', 4) },
      active: 'p2',
    });
    const brood = g.id('p1', 'voracious-brood');
    settle(cast(g, 'lightning-strike', [ref(g, g.id('p1', 'bear-cub'))]));
    expect(pt(g, brood)).toEqual([2, 2]);
    // An opponent's spell card going to their graveyard doesn't count.
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });
});

describe('Return of the Mole Man', () => {
  it('may decline the landfall mill', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['return-of-the-mole-man'], library: n('forest', 4) },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(g.state.players.p1.library).toHaveLength(4);
  });

  it('sacrifices itself for a Moloid per permanent card in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['return-of-the-mole-man', ...n('forest', 6)],
        graveyard: ['bear-cub', 'forest', 'lightning-strike', 'cancel'],
      },
    });
    const mole = g.id('p1', 'return-of-the-mole-man');
    g.do({ type: 'activateAbility', player: 'p1', source: mole, abilityIndex: 1, targets: [] });
    settle(g);
    // Bear Cub, Forest and the enchantment itself.
    expect(all(g, 'moloid-token')).toHaveLength(3);
    expect(g.state.players.p1.graveyard).toContain(mole);
  });

  it('is sorcery speed', () => {
    const g = game({
      p1: { battlefield: ['return-of-the-mole-man', ...n('forest', 6)] },
      step: 'beginCombat',
    });
    const mole = g.id('p1', 'return-of-the-mole-man');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === mole)).toBe(false);
  });
});

describe('Bushmaster, Coiled Henchman', () => {
  it('gives deathtouch to your other creatures with +1/+1 counters', () => {
    const g = game({
      p1: { battlefield: ['bushmaster-coiled-henchman', 'bear-cub', 'llanowar-elves'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const [bear, theirs] = all(g, 'bear-cub');
    g.obj(bear!).plusOneCounters = 1;
    g.obj(theirs!).plusOneCounters = 1;
    expect(keywords(g, g.id('p1', 'bushmaster-coiled-henchman'))).toContain('deathtouch');
    expect(keywords(g, bear!)).toContain('deathtouch');
    expect(keywords(g, g.id('p1', 'llanowar-elves'))).not.toContain('deathtouch');
    expect(keywords(g, theirs!)).not.toContain('deathtouch');
  });
});

describe('Powerful Broker', () => {
  it('adds one more counter of each kind on the target', () => {
    const g = game({ p1: { battlefield: ['powerful-broker', 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.obj(bear).plusOneCounters = 2;
    g.obj(bear).counters = { shield: 1 };
    const broker = g.id('p1', 'powerful-broker');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: broker,
      abilityIndex: 0,
      targets: [ref(g, bear)],
    });
    settle(g);
    expect(g.obj(bear).plusOneCounters).toBe(3);
    expect(g.obj(bear).counters).toEqual({ shield: 2 });
    expect(g.obj(broker).tapped).toBe(true);
  });

  it('does nothing to a permanent without counters', () => {
    const g = game({ p1: { battlefield: ['powerful-broker', 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'powerful-broker'),
      abilityIndex: 0,
      targets: [ref(g, bear)],
    });
    settle(g);
    expect(g.obj(bear).plusOneCounters).toBe(0);
  });
});

describe('Atlas, Sizable Stooge', () => {
  it('gains 1 life per creature with power 4 or greater when it attacks', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['atlas-sizable-stooge', 'serra-angel', 'bear-cub'] },
    });
    expect(keywords(g, g.id('p1', 'atlas-sizable-stooge'))).toContain('reach');
    g.passBoth().attack(g.id('p1', 'atlas-sizable-stooge'));
    settle(g);
    expect(g.state.players.p1.life).toBe(22);
  });

  it('gains life when it blocks', () => {
    const g = game({
      step: 'beginCombat',
      active: 'p2',
      p1: { battlefield: ['atlas-sizable-stooge', 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    g.passBoth().attack(g.id('p2', 'bear-cub'));
    settle(g);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    g.block([g.id('p1', 'atlas-sizable-stooge'), g.id('p2', 'bear-cub')]);
    settle(g);
    expect(g.state.players.p1.life).toBe(21);
  });
});

describe('Rhino, Terrible Trampler', () => {
  it('destroys an artifact or land and hands out three counters with trample', () => {
    const g = game({
      p1: { hand: ['rhino-terrible-trampler'], battlefield: [...n('forest', 6), 'bear-cub'] },
      p2: { battlefield: ['mountain', 'llanowar-elves'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const mountain = g.id('p2', 'mountain');
    cast(g, 'rhino-terrible-trampler');
    const picks: Action[] = [];
    settle(g, (legal) => {
      const pick =
        legal.find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            'object' in a.targets[0]! &&
            [mountain, bear].includes(a.targets[0].object.id),
        ) ?? legal[0];
      if (pick) picks.push(pick);
      return pick;
    });
    expect(picks).toHaveLength(4);
    expect(g.state.players.p2.graveyard).toContain(mountain);
    // All three counters on the Bear Cub.
    expect(pt(g, bear)).toEqual([5, 5]);
    expect(keywords(g, bear)).toContain('trample');
    expect(keywords(g, g.id('p1', 'rhino-terrible-trampler'))).toContain('trample');
  });

  it("can't put the counters on itself", () => {
    const g = game({
      p1: { hand: ['rhino-terrible-trampler'], battlefield: n('forest', 6) },
    });
    cast(g, 'rhino-terrible-trampler');
    const rhino = () =>
      g.state.battlefield.find((id) => g.obj(id).defId === 'rhino-terrible-trampler');
    let offered = false;
    settle(g, (legal) => {
      const r = rhino();
      if (
        legal.some(
          (a) =>
            a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === r),
        )
      )
        offered = true;
      return undefined;
    });
    expect(offered).toBe(false);
    expect(g.obj(rhino()!).plusOneCounters).toBe(0);
  });
});

describe("Rhino's Rampage", () => {
  it('pumps and fights; excess damage destroys the chosen artifact', () => {
    const g = game({
      p1: { hand: [slug("Rhino's Rampage")], battlefield: ['forest', 'bear-cub'] },
      p2: { battlefield: ['llanowar-elves', 'swiftfoot-boots'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const elves = g.id('p2', 'llanowar-elves');
    const boots = g.id('p2', 'swiftfoot-boots');
    settle(cast(g, slug("Rhino's Rampage"), [ref(g, bear), ref(g, elves), ref(g, boots)]));
    expect(g.state.players.p2.graveyard).toEqual(expect.arrayContaining([elves, boots]));
    expect(g.obj(bear).damage).toBe(1);
  });

  it('leaves the artifact without excess damage', () => {
    const g = game({
      p1: { hand: [slug("Rhino's Rampage")], battlefield: ['forest', 'llanowar-elves'] },
      p2: { battlefield: ['bear-cub', 'swiftfoot-boots'] },
    });
    const elves = g.id('p1', 'llanowar-elves');
    const bear = g.id('p2', 'bear-cub');
    const boots = g.id('p2', 'swiftfoot-boots');
    settle(cast(g, slug("Rhino's Rampage"), [ref(g, elves), ref(g, bear), ref(g, boots)]));
    // 2 damage to a 2/2: lethal, not excess.
    expect(g.state.players.p2.graveyard).toEqual([bear]);
    expect(g.state.battlefield).toContain(boots);
  });
});
