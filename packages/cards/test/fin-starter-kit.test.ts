import { describe, expect, it } from 'vitest';
import { getCharacteristics, playRandomGame } from '@mtg/engine';
import {
  cardDb,
  deckById,
  deckIds,
  FINAL_FANTASY_STARTER_KIT_DECKS,
  SCRYFALL,
} from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11d: the Starter Kit (Cloud vs Sephiroth).

type G = ReturnType<typeof game>;

const EXCLUSIVES = [
  "Cloud, Planet's Champion",
  "Sephiroth, Planet's Heir",
  'Beatrix, Loyal General',
  'Rosa, Resolute White Mage',
  'Ultimecia, Temporal Threat',
  'Seymour Flux',
  'Lightning, Security Sergeant',
  'Xande, Dark Mage',
  'Judgment Bolt',
  'Deadly Embrace',
  'Magitek Scythe',
  'Ultima Weapon',
];

const kw = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

function toAttack(g: G): G {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else g.do(g.legal()[0]!);
  }
  return g;
}

describe('the Starter Kit', () => {
  it('both decks have 60 implemented cards, with the twelve exclusives', () => {
    const names = new Set<string>();
    for (const d of FINAL_FANTASY_STARTER_KIT_DECKS) {
      expect(
        d.cards.reduce((k, [, c]) => k + c, 0),
        d.id,
      ).toBe(60);
      for (const id of deckIds(d)) expect(cardDb.has(id), id).toBe(true);
      for (const [name] of d.cards) names.add(name);
    }
    for (const name of EXCLUSIVES) expect(names.has(name), name).toBe(true);
  });

  it('the exclusives use their Starter Kit printings; booster cards keep their main printing', () => {
    for (const name of EXCLUSIVES) {
      const c = SCRYFALL.find((x) => x.name === name)!;
      expect(c.set, name).toBe('fin');
      expect(Number.parseInt(c.collectorNumber, 10), name).toBeGreaterThan(309);
    }
    const coeurl = SCRYFALL.find((x) => x.name === 'Coeurl')!;
    expect(Number.parseInt(coeurl.collectorNumber, 10)).toBeLessThanOrEqual(309);
  });
});

describe('Starter Kit exclusives', () => {
  it('Cloud has double strike and indestructible on your turn while equipped, and equips for {2} less', () => {
    const g = game({
      p1: {
        battlefield: [...n('plains', 3), 'cloud-planets-champion', 'coeurl', 'warriors-sword'],
      },
    });
    const cloud = g.id('p1', 'cloud-planets-champion');
    const coeurl = g.id('p1', 'coeurl');
    const sword = g.id('p1', 'warriors-sword');
    expect(kw(g, cloud).has('doubleStrike')).toBe(false);
    // Equip {5}: {3} onto Cloud, not affordable onto anything else.
    const equips = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === sword)
      .map((a) => a.type === 'activateAbility' && a.targets[0]);
    expect(equips).toContainEqual(g.ref(cloud));
    expect(equips).not.toContainEqual(g.ref(coeurl));
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === sword &&
            'object' in a.targets[0]! &&
            a.targets[0].object.id === cloud,
        )!,
    );
    settle(g);
    expect(g.obj(sword).attachedTo).toBe(cloud);
    expect(kw(g, cloud).has('doubleStrike')).toBe(true);
    expect(kw(g, cloud).has('indestructible')).toBe(true);
    // Not on the opponent's turn.
    g.state.turn.activePlayer = 'p2';
    expect(kw(g, cloud).has('doubleStrike')).toBe(false);
  });

  it('Judgment Bolt deals 5 to a creature and 1 per Equipment to its controller', () => {
    const g = game({
      p1: {
        hand: ['judgment-bolt'],
        battlefield: [...n('mountain', 4), 'warriors-sword', 'magitek-scythe'],
      },
      p2: { battlefield: ['iron-giant'] },
    });
    const giant = g.id('p2', 'iron-giant');
    settle(cast(g, 'judgment-bolt', [g.ref(giant)]));
    expect(g.obj(giant).damage).toBe(5);
    expect(g.life('p2')).toBe(18);
  });

  it('Lightning exiles the top card when it hits a player; it stays playable', () => {
    const g = game({ p1: { battlefield: ['lightning-security-sergeant'] } });
    const lightning = g.id('p1', 'lightning-security-sergeant');
    toAttack(g).attack(lightning);
    for (let i = 0; i < 20 && g.state.players.p1.exile.length === 0; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else g.pass();
    }
    expect(g.life('p2')).toBe(18);
    const card = g.state.players.p1.exile[0]!;
    expect(g.obj(card).playableUntilTurn).toBeGreaterThan(1000);
  });

  it('Magitek Scythe attaches as it enters: first strike, +2/+1, and it must be blocked', () => {
    const g = game({
      p1: { hand: ['magitek-scythe'], battlefield: [...n('plains', 4), 'coeurl'] },
      p2: { battlefield: ['iron-giant'] },
    });
    const coeurl = g.id('p1', 'coeurl');
    const base = pt(g, coeurl);
    settle(cast(g, 'magitek-scythe'));
    expect(pt(g, coeurl)).toEqual([base[0]! + 2, base[1]! + 1]);
    expect(kw(g, coeurl).has('firstStrike')).toBe(true);
    toAttack(g).attack(coeurl);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    // The giant is made to block when the blocks are confirmed.
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat?.attackers[0]?.blockers).toEqual([g.id('p2', 'iron-giant')]);
  });

  it('Seymour Flux pays 1 life at upkeep to draw and grow', () => {
    const g = game({ p1: { battlefield: ['seymour-flux'] }, active: 'p2', step: 'end' });
    const seymour = g.id('p1', 'seymour-flux');
    for (let i = 0; i < 30 && g.decision.kind !== 'optionalEffect'; i++) g.pass();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.life('p1')).toBe(19);
    expect(pt(g, seymour)).toEqual([6, 6]);
    expect(handSize(g, 'p1')).toBeGreaterThanOrEqual(1);
  });

  it("Ultimecia taps the opponent's creatures and draws for combat damage", () => {
    const g = game({
      p1: { hand: ['ultimecia-temporal-threat'], battlefield: [...n('island', 6), 'coeurl'] },
      p2: { battlefield: ['iron-giant'] },
    });
    settle(cast(g, 'ultimecia-temporal-threat'));
    expect(g.obj(g.id('p2', 'iron-giant')).tapped).toBe(true);
    const before = handSize(g, 'p1');
    toAttack(g).attack(g.id('p1', 'coeurl'));
    for (let i = 0; i < 20 && handSize(g, 'p1') === before; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else g.pass();
    }
    expect(handSize(g, 'p1')).toBe(before + 1);
  });
});

describe('random games', () => {
  it('Cloud and Sephiroth play each other and a starter deck to completion', () => {
    const cloud = deckIds(deckById('fin-starter-cloud'));
    const sephiroth = deckIds(deckById('fin-starter-sephiroth'));
    const starter = deckIds(deckById('learn-from-the-land'));
    const pairings = [
      { p1: cloud, p2: sephiroth },
      { p1: sephiroth, p2: starter },
      { p1: starter, p2: cloud },
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
