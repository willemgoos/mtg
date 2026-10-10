import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARENA_BLB_PACKETS,
  ARENA_ECL_PACKETS,
  ARENA_TDM_PACKETS,
  ARENA_SOS_PACKETS,
  ARENA_FDN_PACKETS,
  cardDb,
  deckById,
  dealPacket,
  deckIds,
  defaultDeal,
  findDeck,
  jumpInDeals,
  jumpInId,
  jumpInPackets,
  JUMP_IN_DECKS,
  MARVEL_JUMPSTART_PACKETS,
  PACKETS,
  packetCards,
  type Packet,
  SCRYFALL,
  slug,
} from '../src/index.ts';

const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const marvelLists: { name: string; cards: [string, number][] }[] = JSON.parse(
  readFileSync(new URL('../scripts/data/marvel-jumpstart-lists.json', import.meta.url), 'utf8'),
);

interface ArenaPacket {
  name: string;
  set: string;
  count: number;
  fixed: [string, number][];
  slots: [number, string][][];
}
const sort = (l: [string, number][]) => [...l].sort((a, b) => a[0].localeCompare(b[0]));
const total = (cards: [string, number][]) => cards.reduce((n, [, k]) => n + k, 0);

/**
 * Arena packets equal the scraped lists: fixed cards and lands, slots with weights adding to 100, the card count.
 * `extraLand`: a land the list leaves out may be added (Bloomburrow's gain-lands, from Wizards' announcement).
 */
function expectArenaLists(
  packets: Packet[],
  tag: string,
  names: Record<string, string> = {},
  extraLand = false,
) {
  const lists: ArenaPacket[] = JSON.parse(
    readFileSync(new URL('../scripts/data/arena-jumpin-packets.json', import.meta.url), 'utf8'),
  ).filter((x: ArenaPacket) => x.set.includes(`(${tag})`));
  expect(packets.length).toBe(lists.length);
  for (const p of packets) {
    const list = lists.find((x) => x.name === (names[p.name] ?? p.name))!;
    expect(list, p.name).toBeDefined();
    expect(p.source).toBe('arena');
    const listed = new Set(list.fixed.map(([n]) => n));
    const extra = extraLand ? (p.lands ?? []).filter(([n]) => !listed.has(n)) : [];
    expect(extra.length, p.name).toBeLessThanOrEqual(1);
    const lands = (p.lands ?? []).filter((l) => !extra.includes(l));
    expect(sort([...p.spells, ...lands]), p.name).toEqual(sort(list.fixed));
    expect(
      p.slots?.map((s) => s.map((a) => [a.weight, a.card])),
      p.name,
    ).toEqual(list.slots);
    for (const s of p.slots ?? [])
      expect(
        s.reduce((n, a) => n + a.weight, 0),
        p.name,
      ).toBe(100);
    expect(total(packetCards(p)), p.name).toBe(list.count + total(extra));
    expect(total(packetCards(p, dealPacket(p, Math.random))), p.name).toBe(
      list.count + total(extra),
    );
  }
}

describe('Jump In packets', () => {
  it.each(MARVEL_JUMPSTART_PACKETS.map((p) => p.name))(
    '%s matches its official Jumpstart list',
    (name) => {
      const packet = MARVEL_JUMPSTART_PACKETS.find((p) => p.name === name);
      expect(packet, name).toBeDefined();
      const official = marvelLists.find((p) => p.name === name)!;
      const sort = (cards: [string, number][]) =>
        cards.slice().sort(([a], [b]) => a.localeCompare(b));
      expect(sort(packetCards(packet!))).toEqual(sort(official.cards));
    },
  );

  it('are 20 implemented cards of their colours with exactly one rare', () => {
    expect(new Set(PACKETS.map((p) => p.id)).size).toBe(PACKETS.length);
    for (const p of PACKETS) {
      const cards = packetCards(p);
      // Arena's packets with random slots are smaller (their own tests check the count).
      if (!p.slots)
        expect(
          cards.reduce((n, [, k]) => n + k, 0),
          p.name,
        ).toBe(20);
      const slotCards = (p.slots ?? []).flat().map((a) => a.card);
      for (const name of new Set([...cards.map(([n]) => n), ...slotCards])) {
        expect(cardDb.has(slug(name)), name).toBe(true);
        const colors = card.get(name)!.colors;
        // Official packets may hold a hybrid card of another colour too (She-Hulk in Trained).
        if (p.source && colors.length > 1)
          expect(
            colors.some((c) => (p.colors as string[]).includes(c)),
            name,
          ).toBe(true);
        else for (const c of colors) expect(p.colors, name).toContain(c);
      }
      const rares = [...p.spells.map(([n]) => n), ...slotCards].filter((n) =>
        ['rare', 'mythic'].includes(card.get(n)!.rarity),
      );
      // Official packets may have more (Agents of S.H.I.E.L.D. has two).
      if (p.source) expect(rares.length, p.name).toBeGreaterThanOrEqual(1);
      else expect(rares, p.name).toHaveLength(1);
      expect(p.spells.some(([n]) => n === p.face) || slotCards.includes(p.face), p.name).toBe(true);
    }
  });

  it('has two base packets per colour in each set, before cross-set custom themes', () => {
    for (const set of [undefined, 'blb', 'msh', 'fin', 'stx', 'sos', 'fra', 'hob'])
      for (const c of ['W', 'U', 'B', 'R', 'G'])
        expect(
          PACKETS.filter((p) => p.set === set && !p.source && !p.crossSet && p.colors.join() === c),
          `${set ?? 'fdn'} ${c}`,
        ).toHaveLength(2);
  });

  it('uses cards of its own set', () => {
    // Official packets and explicitly cross-set custom themes may borrow cards.
    for (const p of PACKETS.filter((x) => x.set && !x.source && !x.crossSet))
      for (const [name] of p.spells) expect(card.get(name)!.set, `${p.name}: ${name}`).toBe(p.set);
  });

  it('builds Final Fantasy packets from booster cards, not the Starter Kit exclusives', () => {
    const fin = PACKETS.filter((p) => p.set === 'fin');
    expect(fin).toHaveLength(10);
    for (const p of fin)
      for (const [name] of p.spells)
        expect(+card.get(name)!.collectorNumber, `${p.name}: ${name}`).toBeLessThanOrEqual(309);
  });

  it('builds ten Reality Fracture packets with planeswalker-related cards, one rare each', () => {
    const fra = PACKETS.filter((p) => p.set === 'fra');
    expect(fra).toHaveLength(10);
    for (const p of fra) {
      let rares = 0;
      for (const [name, k] of p.spells) {
        const c = card.get(name)!;
        if (c.rarity === 'rare' || c.rarity === 'mythic') rares += k;
      }
      expect(rares, p.name).toBe(1);
    }
    // Empower Jace cards are in the packets now (17c).
    expect(fra.some((p) => p.spells.some(([n]) => card.get(n)!.oracleText?.includes('Jace')))).toBe(
      true,
    );
    expect(deckById(jumpInId('fra-lifegain', 'fra-titans')).set).toBe('fra');
    expect(deckById(jumpInId('fra-lifegain', 'angels')).set).toBeUndefined();
  });

  it('builds ten The Hobbit packets of our own', () => {
    const hob = PACKETS.filter((p) => p.set === 'hob');
    expect(hob).toHaveLength(10);
    for (const p of hob) {
      expect(p.id.startsWith('hob-'), p.id).toBe(true);
      expect(p.source).toBeUndefined();
    }
    expect(deckById(jumpInId('hob-dwarves', 'hob-erebor')).set).toBe('hob');
    expect(deckById(jumpInId('hob-dwarves', 'angels')).set).toBeUndefined();
  });

  it("has Arena's ten Lorwyn Eclipsed packets, equal to the scraped lists", () => {
    const ecl = PACKETS.filter((p) => p.set === 'ecl');
    expect(ecl.map((p) => p.id)).toEqual(ARENA_ECL_PACKETS.map((p) => p.id));
    const colours: Record<string, string> = {
      Kithkin: 'WG',
      Merfolk: 'WU',
      Elemental: 'UR',
      Goblins: 'BR',
      Elves: 'BG',
      Flashy: 'U',
      Burdened: 'W',
      Blighted: 'B',
      Giant: 'R',
      Vivid: 'G',
    };
    expect(ecl.map((p) => p.name)).toEqual(Object.keys(colours));
    const lists: ArenaPacket[] = JSON.parse(
      readFileSync(new URL('../scripts/data/arena-jumpin-packets.json', import.meta.url), 'utf8'),
    ).filter((x: ArenaPacket) => x.set.includes('(ECL)'));
    expect(lists).toHaveLength(10);
    for (const p of ecl) {
      const list = lists.find((x) => x.name === p.name)!;
      expect(p.source).toBe('arena');
      expect(p.id).toBe(`ecl-${p.name.toLowerCase()}`);
      expect(p.colors.join(''), p.name).toBe(colours[p.name]);
      // Fixed cards and lands are Arena's, the slots too.
      expect(sort([...p.spells, ...(p.lands ?? [])]), p.name).toEqual(sort(list.fixed));
      expect(
        p.slots?.map((s) => s.map((a) => [a.weight, a.card])),
        p.name,
      ).toEqual(list.slots);
      for (const s of p.slots ?? [])
        expect(
          s.reduce((n, a) => n + a.weight, 0),
          p.name,
        ).toBe(100);
      // Any deal has Arena's card count.
      const total = (cards: [string, number][]) => cards.reduce((n, [, k]) => n + k, 0);
      expect(total(packetCards(p)), p.name).toBe(list.count);
      expect(total(packetCards(p, dealPacket(p, Math.random))), p.name).toBe(list.count);
    }
    expect(deckById(jumpInId('ecl-kithkin', 'ecl-merfolk')).set).toBe('ecl');
  });

  it("has Arena's ten Tarkir: Dragonstorm packets, equal to the scraped lists", () => {
    const tdm = PACKETS.filter((p) => p.set === 'tdm');
    expect(tdm.map((p) => p.id)).toEqual(ARENA_TDM_PACKETS.map((p) => p.id));
    const colours: Record<string, string> = {
      Abzan: 'WBG',
      Discard: 'R',
      Encounter: 'G',
      Graveyard: 'B',
      Jeskai: 'WUR',
      Mardu: 'WBR',
      Mill: 'U',
      Sultai: 'UBG',
      Temur: 'URG',
      Tokens: 'W',
    };
    expect(tdm.map((p) => p.name)).toEqual(Object.keys(colours));
    for (const p of tdm) {
      expect(p.id).toBe(`tdm-${p.name.toLowerCase()}`);
      expect(p.colors.join(''), p.name).toBe(colours[p.name]);
    }
    expectArenaLists(tdm, 'TDM');
    // Two 13-card packets are topped up to 40 with basics of the clans' colours.
    const d = deckById(jumpInId('tdm-abzan', 'tdm-mardu'));
    expect(d.set).toBe('tdm');
    expect(total(d.cards)).toBe(40);
    const basics = new Map(
      d.cards.filter(([n]) => ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(n)),
    );
    expect(total([...basics])).toBe(14);
    expect(basics.has('Island')).toBe(false);
    for (const b of ['Plains', 'Swamp', 'Forest', 'Mountain'])
      expect(basics.get(b), b).toBeGreaterThan(0);
  });

  it("has Arena's ten Secrets of Strixhaven packets next to ours, equal to the scraped lists", () => {
    const sos = PACKETS.filter((p) => p.set === 'sos' && p.source === 'arena');
    expect(sos.map((p) => p.id)).toEqual(ARENA_SOS_PACKETS.map((p) => p.id));
    const colours: Record<string, string> = {
      Aesthetic: 'U',
      'Field Trip': 'G',
      Grave: 'B',
      Lorehold: 'WR',
      Prismari: 'UR',
      Quandrix: 'UG',
      Scribe: 'W',
      Silverquill: 'WB',
      Spellcraft: 'R',
      Witherbloom: 'BG',
    };
    expect(sos.map((p) => p.name)).toEqual(Object.keys(colours));
    for (const p of sos) {
      expect(p.id).toBe(`sos-arena-${p.name.toLowerCase().replace(' ', '-')}`);
      expect(p.colors.join(''), p.name).toBe(colours[p.name]);
    }
    expectArenaLists(sos, 'SOS');
    expect(PACKETS.filter((p) => p.set === 'sos' && !p.source)).toHaveLength(10);
    const d = deckById(jumpInId('sos-arena-lorehold', 'sos-arena-grave'));
    expect(d.set).toBe('sos');
    expect(d.cards.reduce((n, [, k]) => n + k, 0)).toBe(40);
  });

  describe('random slots', () => {
    const rng = (seed: number) => () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const vivid = PACKETS.find((p) => p.id === 'ecl-vivid')!;

    it('deal each slot by its percentages', () => {
      const n = 4000;
      const counts = vivid.slots!.map((s) => s.map(() => 0));
      const next = rng(1);
      for (let i = 0; i < n; i++) dealPacket(vivid, next).forEach((pick, k) => counts[k]![pick]!++);
      vivid.slots!.forEach((alts, i) =>
        alts.forEach((a, k) =>
          expect(counts[i]![k]! / n, `${a.card}`).toBeCloseTo(a.weight / 100, 1),
        ),
      );
    });

    it('make the id say which cards were dealt', () => {
      const id = jumpInId('ecl-vivid', 'ecl-giant', rng(5));
      expect(id).toMatch(/^jump-in:ecl-vivid\+ecl-giant~\d{8}$/);
      // The same id always makes the same deck, with the dealt cards in it.
      expect(deckById(id).cards).toEqual(findDeck(id)!.cards);
      expect(deckIds(deckById(id))).toHaveLength(40);
      const [d1] = jumpInDeals(id)!;
      const names = deckById(id).cards.map(([n]) => n);
      for (const [i, alts] of vivid.slots!.entries()) expect(names).toContain(alts[d1[i]!]!.card);
      const ids = new Set(
        Array.from({ length: 30 }, (_, s) => jumpInId('ecl-vivid', 'ecl-giant', rng(s))),
      );
      expect(ids.size).toBeGreaterThan(5);
    });

    it('tops Arena pairs up to 40 with basics split by mana symbols', () => {
      const d = deckById('jump-in:ecl-flashy+ecl-burdened');
      expect(deckIds(d)).toHaveLength(40);
      const n = (name: string) => d.cards.find(([c]) => c === name)?.[1] ?? 0;
      // Blue-white: both colours get lands, nothing else does.
      expect(n('Island')).toBeGreaterThan(6);
      expect(n('Plains')).toBeGreaterThan(6);
      expect(n('Swamp') + n('Mountain') + n('Forest')).toBe(0);
      expect(deckIds(deckById('jump-in:angels+cats'))).toHaveLength(40);
    });

    it('default to the likeliest card, and ids without slots stay plain', () => {
      expect(defaultDeal(vivid)).toEqual([1, 0, 0]);
      expect(jumpInId('ecl-vivid', 'ecl-giant')).toBe('jump-in:ecl-vivid+ecl-giant');
      expect(jumpInId('angels', 'cats', rng(1))).toBe('jump-in:angels+cats');
      expect(deckById('jump-in:ecl-vivid+ecl-giant').cards.map(([n]) => n)).toContain(
        'Tam, Mindful First-Year',
      );
      expect(findDeck('jump-in:ecl-vivid+ecl-giant~12')).toBeUndefined();
    });
  });

  it('pairs packets across sets; a pair from one set is of that set', () => {
    const mixed = deckById(jumpInId('goblins', 'blb-lizards'));
    expect(deckIds(mixed)).toHaveLength(40);
    expect(mixed.set).toBeUndefined();
    expect(jumpInPackets(mixed.id)?.map((p) => p.set)).toEqual([undefined, 'blb']);
    const d = deckById(jumpInId('msh-hydra', 'msh-robots'));
    expect(d.set).toBe('msh');
    expect(deckIds(d)).toHaveLength(40);
    expect(deckById(jumpInId('blb-bats', 'msh-robots')).set).toBeUndefined();
    expect(deckById(jumpInId('fin-chocobos', 'fin-monsters')).set).toBe('fin');
    expect(deckById(jumpInId('fin-knights', 'angels')).set).toBeUndefined();
    expect(JUMP_IN_DECKS).toHaveLength((PACKETS.length * (PACKETS.length - 1)) / 2);
  });

  it('pairs two packets into a 40-card deck', () => {
    const d = deckById(jumpInId('goblins', 'angels'));
    expect(d.name).toBe('Goblins + Angels');
    expect(d.colors).toEqual(['R', 'W']);
    expect(deckIds(d)).toHaveLength(40);
    expect(deckById(jumpInId('elves', 'stompers')).colors).toEqual(['G']);
    expect(findDeck(jumpInId('elves', 'nope'))).toBeUndefined();
  });

  it('pairs Ten Rings with Cats into a playable white-blue deck with fixing', () => {
    const d = deckById(jumpInId('msh-ten-rings', 'cats'));
    expect(deckIds(d)).toHaveLength(40);
    expect(d.colors).toEqual(['W', 'U']);
    expect(d.cards).toEqual(
      expect.arrayContaining([
        ['Shang-Chi and the Ten Rings', 1],
        ['Thriving Isle', 2],
        ['Island', 3],
        ['Plains', 11],
      ]),
    );
    expect(jumpInPackets(d.id)?.map((p) => p.name)).toEqual(['Ten Rings', 'Cats']);
  });

  it("has Arena's ten Bloomburrow packets, equal to the scraped lists with their random slots", () => {
    expect(ARENA_BLB_PACKETS).toHaveLength(10);
    expectArenaLists(ARENA_BLB_PACKETS, 'BLB', {}, true);
    const d = deckById(jumpInId('blb-arena-bats', 'blb-arena-rats'));
    expect(d.colors).toEqual(['W', 'B']);
    expect(d.set).toBe('blb');
    expect(deckIds(d)).toHaveLength(40);
    // The packets' own land, then basics of both colours for the top-up to 40.
    const counts = new Map(d.cards);
    expect(counts.get('Scoured Barrens')).toBe(1);
    expect(counts.get('Plains')).toBeGreaterThan(0);
    expect(counts.get('Swamp')).toBeGreaterThan(0);
  });

  it("has Arena's eleven Foundations packets, equal to the scraped lists with their random slots", () => {
    expect(ARENA_FDN_PACKETS).toHaveLength(11);
    expectArenaLists(ARENA_FDN_PACKETS, 'FDN', { Goblins: 'Goblin', Zombies: 'Zombie' });
    const d = deckById(jumpInId('fdn-arena-flyers', 'fdn-arena-hares'));
    expect(d.set).toBeUndefined();
    expect(deckIds(d)).toHaveLength(40);
    const counts = new Map(d.cards);
    expect(counts.get('Azorius Guildgate')).toBe(1);
    expect(counts.get('Plains')).toBeGreaterThan(0);
    expect(counts.get('Island')).toBeGreaterThan(0);
  });
});
