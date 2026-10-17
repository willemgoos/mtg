import { createEngine, variantIdOf } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine (23b, multicolour, colorless, lands): the heuristic bots answer the new prompts and play whole games with
// every card of the three groups.

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);
const lands = (n: number, card: string) => Array<string>(n).fill(card);

const MULTI = [
  'Agatha of the Vile Cauldron',
  'Ash, Party Crasher',
  'Beluna Grandsquall',
  'Faunsbane Troll',
  'Greta, Sweettooth Scourge',
  'Hylda of the Icy Crown',
  'Johann, Apprentice Sorcerer',
  'Obyra, Dreaming Duelist',
  'Rowan, Scion of War',
  'Sharae of Numbing Depths',
  'Syr Armont, the Redeemer',
  'Talion, the Kindly Lord',
  "The Apprentice's Folly",
  'The Goose Mother',
  'Totentanz, Swarm Piper',
  'Will, Scion of Peace',
  'Yenna, Redtooth Regent',
];
const COLORLESS = [
  "Agatha's Soul Cauldron",
  'Candy Trail',
  "Collector's Vault",
  "Eriette's Tempting Apple",
  'Gingerbrute',
  "Hylda's Crown of Winter",
  'Prophetic Prism',
  'Scarecrow Guide',
  'Syr Ginger, the Meal Ender',
];
const LANDS = [
  'Crystal Grotto',
  'Edgewall Inn',
  'Restless Bivouac',
  'Restless Fortress',
  'Restless Spire',
  'Restless Vinestalk',
  'The Autonomous Furnace',
  'The Dross Pits',
  'The Fair Basilica',
  'The Hunter Maze',
  'The Surgical Bay',
];

/** Lets the bot act until the stack is empty and no choice is pending. */
function settle(g: GameDriver, player: 'p1' | 'p2' = 'p1'): void {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'priority' && g.state.stack.length === 0) return;
    if (d.kind === 'priority') {
      g.pass();
      continue;
    }
    g.do(bot.chooseAction(g.state, player));
  }
}

describe('heuristic bots with the Wilds of Eldraine multicolour, colorless and land cards', () => {
  it('Talion: the bot names a number the opponent has shown', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['talion-the-kindly-lord'],
          battlefield: [...lands(3, 'island'), ...lands(2, 'swamp')],
        },
        // Two creatures with mana value 5 / power and toughness 4 each (Serra Angel) and a mana value 2 one.
        p2: { battlefield: ['serra-angel', 'serra-angel', 'llanowar-elves'] },
      }),
    );
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    g.pass();
    g.pass();
    settle(g);
    const talion = g.state.battlefield.find(
      (id) =>
        g.state.objects[id]!.controller === 'p1' &&
        cardDb.get(g.state.objects[id]!.defId)?.name === 'Talion, the Kindly Lord',
    );
    expect(talion).toBeDefined();
    // 4 matches power and toughness of both Angels (mana value 5 matches them too): either names the Angels.
    expect([
      variantIdOf('talion-the-kindly-lord', '4'),
      variantIdOf('talion-the-kindly-lord', '5'),
    ]).toContain(g.state.objects[talion!]!.defId);
  });

  it('Edgewall Inn: the bot names the color its cards need', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: { hand: ['edgewall-inn', 'shivan-dragon', 'shock'] },
      }),
    );
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    g.pass();
    settle(g);
    const inn = g.state.battlefield.find((id) => g.state.objects[id]!.defId === 'edgewall-inn')!;
    expect(g.state.objects[inn]!.chosenColor).toBe('R');
  });

  it('Yenna: the bot finishes the Aura copy prompt', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: { battlefield: ['yenna-redtooth-regent', 'pacifism', ...lands(3, 'plains')] },
        p2: { battlefield: ['savannah-lions'] },
      }),
    );
    const pac = g.state.battlefield.find((id) => g.state.objects[id]!.defId === 'pacifism')!;
    g.state.objects[pac]!.attachedTo = g.state.battlefield.find(
      (id) => g.state.objects[id]!.defId === 'savannah-lions',
    );
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          g.state.objects[a.source]!.defId === 'yenna-redtooth-regent',
      );
    expect(act).toBeDefined();
    g.do(act!);
    g.pass();
    g.pass();
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(
      g.state.battlefield.filter((id) => g.state.objects[id]!.defId === 'pacifism'),
    ).toHaveLength(2);
  });

  it('finish games without errors', () => {
    const cards = [...MULTI, ...COLORLESS, ...LANDS].map(slug);
    const basics = ['plains', 'island', 'swamp', 'mountain', 'forest'];
    const deck = [...cards, ...cards.slice(0, 10), ...basics.flatMap((b) => lands(5, b))];
    for (let seed = 1; seed <= 3; seed++) {
      const r = playMatch(
        engine,
        { p1: deck, p2: deck },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { maxActions: 4000 },
      );
      expect(r.actions.length, `seed ${seed}`).toBeGreaterThan(50);
    }
  }, 240_000);
});
