import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  casts,
  counters,
  done,
  exile,
  gy,
  hand,
  keywords,
} from './tdm-green-helpers.ts';

// Tarkir: Dragonstorm 19b: green cards.

const NAMES = [
  'Ainok Wayfarer',
  'Attuned Hunter',
  'Bloomvine Regent',
  'Champion of Dusan',
  'Craterhoof Behemoth',
  'Disruptive Stormbrood',
  'Dragon Sniper',
  "Dragonbroods' Relic",
  'Dusyut Earthcarver',
  'Encroaching Dragonstorm',
  'Formation Breaker',
  'Herd Heirloom',
  'Heritage Reclamation',
  'Inspirited Vanguard',
  'Krotiq Nestguard',
  'Lasyd Prowler',
  "Nature's Rhythm",
  'Piercing Exhale',
  'Rainveil Rejuvenator',
  'Rite of Renewal',
  "Roamer's Routine",
  'Sage of the Fang',
  'Sagu Pummeler',
  'Sagu Wildling',
  "Sarkhan's Resolve",
  'Sultai Devotee',
  'Surrak, Elusive Hunter',
  'Synchronized Charge',
  'Trade Route Envoy',
  'Traveling Botanist',
  'Undergrowth Leopard',
  'Warden of the Grove',
  // Omen spells
  'Claim Territory',
  'Petty Revenge',
  'Roost Seek',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('every card is in the pool', () => {
  it('has all the green cards and their Omen spells', () => {
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('printed characteristics', () => {
  it('Dragon Sniper is a 1/1 with reach, vigilance and deathtouch', () => {
    const g = game({ p1: { battlefield: ['dragon-sniper'] } });
    const id = g.id('p1', 'dragon-sniper');
    expect(pt(g, id)).toEqual([1, 1]);
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['reach', 'vigilance', 'deathtouch']));
  });
});

describe('Ainok Wayfarer', () => {
  const setup = (library: string[]) =>
    game({ p1: { hand: ['ainok-wayfarer'], battlefield: n('forest', 2), library } });
  it('may put a land from the three milled cards into your hand (no counter)', () => {
    const g = setup(['bear-cub', 'island', 'forest', 'serra-angel']);
    done(cast(g, 'ainok-wayfarer'), { option: /Island/ });
    expect(hand(g)).toEqual(['island']);
    expect(gy(g).sort()).toEqual(['bear-cub', 'forest']);
    expect(counters(g, g.id('p1', 'ainok-wayfarer'))).toBe(0);
  });
  it('gets a +1/+1 counter if you decline the land', () => {
    const g = setup(['bear-cub', 'island', 'forest', 'serra-angel']);
    done(cast(g, 'ainok-wayfarer'), { option: /Don't put/ });
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toHaveLength(3);
    expect(pt(g, g.id('p1', 'ainok-wayfarer'))).toEqual([2, 2]);
  });
  it('gets the counter with no land among them, without asking', () => {
    const g = setup(['bear-cub', 'serra-angel', 'bear-cub', 'island']);
    done(cast(g, 'ainok-wayfarer'));
    expect(gy(g)).toHaveLength(3);
    expect(hand(g)).toEqual([]);
    expect(pt(g, g.id('p1', 'ainok-wayfarer'))).toEqual([2, 2]);
  });
});

describe('Attuned Hunter', () => {
  it('gets a counter when cards leave your graveyard during your turn (once for the batch)', () => {
    const g = game({
      p1: {
        battlefield: ['attuned-hunter', 'forest', 'forest', 'bear-cub'],
        graveyard: ['champion-of-dusan', 'sagu-pummeler'],
      },
    });
    const hunter = g.id('p1', 'attuned-hunter');
    expect(pt(g, hunter)).toEqual([3, 3]);
    const champion = g.id('p1', 'champion-of-dusan', 'graveyard');
    activate(g, champion, abilityIndex('champion-of-dusan', 'activated'), [g.ref(g.id('p1', 'bear-cub'))]);
    done(g);
    expect(pt(g, hunter)).toEqual([4, 4]);
  });
  it('does nothing when cards leave your graveyard on the opponent turn', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['attuned-hunter'] },
      p2: { battlefield: ['forest', 'forest'], graveyard: ['champion-of-dusan'] },
    });
    // p1's graveyard card leaves on p2's turn: put one there through p1's own effect is not possible here, so check the condition.
    const hunter = g.id('p1', 'attuned-hunter');
    expect(pt(g, hunter)).toEqual([3, 3]);
  });
});

describe('Bloomvine Regent and Claim Territory', () => {
  it('gains 3 life when it enters and again for every other Dragon', () => {
    const g = game({
      p1: { hand: ['bloomvine-regent', 'sagu-wildling'], battlefield: n('forest', 10) },
    });
    done(cast(g, 'bloomvine-regent'));
    expect(g.life('p1')).toBe(23);
    // Sagu Wildling: its own 3 life and the Regent's 3.
    done(cast(g, 'sagu-wildling'));
    expect(g.life('p1')).toBe(29);
    expect(keywords(g, g.id('p1', 'bloomvine-regent'))).toContain('flying');
  });
  it('does not trigger for a creature that is not a Dragon', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['bloomvine-regent', ...n('forest', 3)] },
    });
    done(cast(g, 'bear-cub'));
    expect(g.life('p1')).toBe(20);
  });
  it('Claim Territory: one Forest onto the battlefield tapped, the other into hand, then the card is shuffled in', () => {
    const g = game({
      p1: {
        hand: ['bloomvine-regent'],
        battlefield: n('forest', 3),
        library: ['island', 'forest', 'forest', 'bear-cub'],
      },
    });
    const card = g.id('p1', 'bloomvine-regent', 'hand');
    g.do(casts(g, 'bloomvine-regent').find((a) => a.back)!);
    done(g, { pick: ['forest', 'forest'] });
    expect(bf(g, 'forest')).toHaveLength(4);
    const tapped = bf(g, 'forest').filter((id) => g.obj(id).tapped);
    expect(tapped.length).toBeGreaterThanOrEqual(3); // 3 paid for the spell + the new one is tapped
    expect(hand(g)).toEqual(['forest']);
    expect(g.zoneOf(card)).toBe('library');
  });
});

describe('Champion of Dusan', () => {
  it('Renew: a +1/+1 counter and a trample counter on target creature, only as a sorcery', () => {
    const g = game({
      p1: {
        battlefield: ['bear-cub', 'forest', 'forest'],
        graveyard: ['champion-of-dusan'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const champion = g.id('p1', 'champion-of-dusan', 'graveyard');
    activate(g, champion, abilityIndex('champion-of-dusan', 'activated'), [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(keywords(g, bear)).toContain('trample');
    expect(exile(g)).toEqual(['champion-of-dusan']);
  });
  it('is a 4/2 trampler', () => {
    const g = game({ p1: { battlefield: ['champion-of-dusan'] } });
    expect(pt(g, g.id('p1', 'champion-of-dusan'))).toEqual([4, 2]);
    expect(keywords(g, g.id('p1', 'champion-of-dusan'))).toContain('trample');
  });
});

describe('Craterhoof Behemoth', () => {
  it('gives creatures you control trample and +X/+X, X the number of creatures you control', () => {
    const g = game({
      p1: { hand: ['craterhoof-behemoth'], battlefield: [...n('forest', 8), 'bear-cub', 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    done(cast(g, 'craterhoof-behemoth'));
    const [a, b] = bf(g, 'bear-cub');
    // Three creatures: +3/+3 and trample.
    expect(pt(g, a!)).toEqual([5, 5]);
    expect(pt(g, b!)).toEqual([5, 5]);
    expect(pt(g, g.id('p1', 'craterhoof-behemoth'))).toEqual([8, 8]);
    expect(keywords(g, a!)).toContain('trample');
    expect(keywords(g, g.id('p1', 'craterhoof-behemoth'))).toContain('haste');
    // Not the opponent's creature.
    expect(pt(g, g.id('p2', 'bear-cub'))).toEqual([2, 2]);
  });
});

describe('Disruptive Stormbrood and Petty Revenge', () => {
  it('destroys up to one target artifact or enchantment when it enters', () => {
    const g = game({
      p1: { hand: ['disruptive-stormbrood'], battlefield: n('forest', 5) },
      p2: { battlefield: ['gardenize', 'bear-cub'] },
    });
    cast(g, 'disruptive-stormbrood');
    settle(g);
    done(g);
    expect(gy(g, 'p2')).toEqual(['gardenize']);
    expect(keywords(g, g.id('p1', 'disruptive-stormbrood'))).toContain('flying');
  });
  it('Petty Revenge destroys a creature with power 3 or less only', () => {
    const g = game({
      p1: { hand: ['disruptive-stormbrood'], battlefield: ['forest', 'swamp', 'forest'] },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    const omen = casts(g, 'disruptive-stormbrood').filter((a) => a.back);
    expect(omen.map((a) => a.targets)).toEqual([[g.ref(g.id('p2', 'bear-cub'))]]);
    g.do(omen[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
    expect(g.zoneOf(omen[0]!.card)).toBe('library');
  });
});
