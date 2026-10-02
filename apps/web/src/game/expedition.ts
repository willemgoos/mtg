import {
  deckById,
  type Decklist,
  findDeck,
  jumpInPackets,
  pickOpponent,
  registerDeck,
  SCRYFALL,
  scryfallById,
  slug,
} from '@mtg/cards';
import type { CardDefId, Color, NewGameOptions, PlayerId } from '@mtg/engine';
import type { BotKind, LevelBot } from './bot.worker.ts';
import { manaValue } from './deckView.ts';
import { type DeckRecord, rng, type RunSummary } from './gauntlet.ts';

/*
 * Expedition: a roguelike run. You set out with a deck and two boosters, then
 * travel a map of ten floors, choosing one node per floor: duels (each with
 * the pack it pays out), optional elite fights, camps and shrines, and a final
 * battle at the end. From every pack you keep only a few cards, and boons
 * collected along the way bend the rules in your favour. Clear the final
 * battle and you can set out on a new map with the deck and collection you
 * built; lives and boons start over, and the fights are no tougher.
 *
 * The deck follows Limited rules: at least 40 cards, any number of copies of
 * what you own, and basic lands for free. The map and every pack are rolled
 * from the run's seed, so reloading can't reroll them.
 */

export const MIN_DECK = 40;
export const START_PACKS = 2;
/** Cards you keep from each pack. */
export const KEEP = 3;
export const LIVES = 3;
export const BASICS: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
const COLORS = Object.keys(BASICS) as Color[];
const isBasic = (name: string) => Object.values(BASICS).includes(name);

export type Pack = ({ kind: 'booster' } | { kind: 'rare' } | { kind: 'color'; color: Color }) & {
  /** Cards you keep from this pack, when it isn't the run's usual number (a lost duel's, with Scavenger). */
  keep?: number;
};
/** Card name -> copies. */
export type Counts = Record<string, number>;

export interface Build {
  main: Counts;
  /** Cards you own that aren't in the deck. Basic lands are never here: they're free. */
  side: Counts;
  /** Packs opened so far; the next pack's roll depends on it. */
  opened: number;
  /** Packs waiting to be opened. */
  packs: Pack[];
  /** Cards kept from the most recent packs, marked as new in the deck builder. */
  fresh: string[];
}

// ---------------------------------------------------------------------------
// Boons
// ---------------------------------------------------------------------------

export type BoonId =
  | 'hardy'
  | 'initiative'
  | 'prepared'
  | 'trailblazer'
  | 'collector'
  | 'lucky'
  | 'stout'
  | 'scavenger'
  | 'haggler'
  | 'secondWind'
  | 'keenEye'
  | 'deepPockets'
  | 'mapmaker';

export const BOONS: Record<BoonId, { name: string; text: string }> = {
  hardy: { name: 'Hardy', text: 'Start every game at 25 life.' },
  initiative: { name: 'Initiative', text: 'You always play first.' },
  prepared: { name: 'Well Prepared', text: 'Start every game with an extra card in hand.' },
  trailblazer: { name: 'Trailblazer', text: 'Start every game with a basic land in play.' },
  collector: {
    name: 'Collector',
    text: `Keep ${KEEP + 1} cards from each pack instead of ${KEEP}.`,
  },
  lucky: { name: 'Lucky Find', text: 'Every pack has an extra rare.' },
  stout: { name: 'Stout Heart', text: 'One more life for the rest of the run.' },
  scavenger: { name: 'Scavenger', text: 'Lose a duel and you still keep a card from its pack.' },
  haggler: { name: 'Haggler', text: 'Merchants take one of your cards instead of two.' },
  secondWind: { name: 'Second Wind', text: 'The first fight you lose costs no life.' },
  keenEye: { name: 'Keen Eye', text: 'See what waits at mystery nodes before you go.' },
  deepPockets: { name: 'Deep Pockets', text: 'Elites offer four rares to choose from.' },
  mapmaker: { name: 'Mapmaker', text: 'You can also travel to the lanes beside your paths.' },
};
const BOON_IDS = Object.keys(BOONS) as BoonId[];

// ---------------------------------------------------------------------------
// Pacts: a shrine's fourth offer. A big reward for the rest of the run, paid
// for by tougher opponents rather than by making you weaker.
// ---------------------------------------------------------------------------

export type PactId = 'twin' | 'hoarder' | 'gilded' | 'warlord' | 'mythic';

export const PACTS: Record<PactId, { name: string; reward: string; cost: string }> = {
  twin: {
    name: 'Twin Blessing',
    reward: 'Choose two boons now.',
    cost: 'Opponents start every game at 24 life.',
  },
  hoarder: {
    name: "Hoarder's Pact",
    reward: 'Keep 6 cards from every pack.',
    cost: 'Opponents start every game with an extra card in hand.',
  },
  gilded: {
    name: 'Gilded Pact',
    reward: 'Every pack has two extra rares.',
    cost: 'Elites are a step harder, and the final battle starts at 25 life.',
  },
  warlord: {
    name: "Warlord's Pact",
    reward: 'You play first and start every game with two lands in play.',
    cost: 'Every elite has a twist.',
  },
  mythic: {
    name: 'Mythic Pact',
    reward: 'Choose one of three mythics now.',
    cost: 'One fewer life for the rest of the run.',
  },
};
const PACT_IDS = Object.keys(PACTS) as PactId[];

// ---------------------------------------------------------------------------
// Elite twists: an edge the elite starts with, shown on the map. Beating a
// twisted elite also pays a booster.
// ---------------------------------------------------------------------------

export type TwistId = 'tough' | 'quick' | 'ready' | 'armed';

export const TWISTS: Record<TwistId, { name: string; text: string }> = {
  tough: { name: 'Tough', text: 'Starts at 25 life' },
  quick: { name: 'Quick', text: 'Always plays first' },
  ready: { name: 'Ready', text: 'Starts with a land in play' },
  armed: { name: 'Armed', text: 'Starts with an extra card in hand' },
};
const TWIST_IDS = Object.keys(TWISTS) as TwistId[];

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export type NodeKind =
  'duel' | 'elite' | 'camp' | 'shrine' | 'treasure' | 'merchant' | 'mystery' | 'surveyor' | 'boss';

export interface MapNode {
  kind: NodeKind;
  /** The opponent's deck, for fights. */
  opponent?: string;
  /** What a won duel pays out. */
  reward?: Pack;
  /** What happens at a mystery node. */
  event?: EventId;
  /** An elite's edge. */
  twist?: TwistId;
  /** Its lane on the map's grid, from the top (maps saved before the grid spread nodes evenly). */
  row?: number;
  /**
   * Lanes on the next floor this node leads to. Maps saved before paths
   * branched freely don't have it: there every node leads to its neighbours.
   */
  next?: number[];
}

/** Floors on a map, the final battle included. */
export const FLOORS = 10;
/** Lanes on the map's grid; a floor has nodes only where a path passes. */
export const MAX_LANES = 5;
/** Paths walked from the first floor to the last, three to each corridor. */
const PATHS = 9;
/**
 * The corridors paths keep to: top, middle and bottom. Neighbours share a
 * lane, where routes can meet and cross over, but mostly they run apart.
 */
const CORRIDORS: [number, number][] = [
  [0, 1],
  [1, 3],
  [3, 4],
];
/** How often a path goes straight on rather than picking any open step. */
const STRAIGHT = 0.3;

/** The top difficulty: the heuristic bot (the Apprentice), met at the final battle. */
export const MAX_DIFFICULTY = 7;

/**
 * How hard a fight is, from 1 to 7. Duels climb from 1 on the first floor to
 * 4 on the floor before the final battle, elite fights are two steps above
 * their floor, and the final battle is the top. Levels 5 and 6 play nearly as
 * well as the top bot, so only elites reach them and duels stay the easier
 * road. `floors` is the map's length: maps saved before the map grew (seven
 * floors) keep their old, steeper curve.
 */
export function difficultyOf(floor: number, node: MapNode, floors = FLOORS): number {
  if (node.kind === 'boss') return MAX_DIFFICULTY;
  const span = floors >= FLOORS ? 3 : 5;
  const duel = 1 + Math.floor((floor * span) / Math.max(1, floors - 2));
  return Math.min(MAX_DIFFICULTY, duel + (node.kind === 'elite' ? 2 : 0));
}

/** The bot for a difficulty: the easy bot's levels, then the heuristic bot. */
export function botFor(floor: number, node: MapNode, floors = FLOORS): BotKind {
  return botAt(difficultyOf(floor, node, floors));
}

const botAt = (d: number): BotKind =>
  d >= MAX_DIFFICULTY ? 'heuristic' : (`level${d}` as LevelBot);

export function difficultyName(d: number): string {
  return d <= 2 ? 'Very easy' : d <= 4 ? 'Easy' : d <= 6 ? 'Fair' : 'Medium';
}

/** How often each kind turns up in the middle floors, before the rules below. */
const KIND_WEIGHTS: [NodeKind, number][] = [
  ['duel', 40],
  ['mystery', 14],
  ['elite', 13],
  ['camp', 8],
  ['merchant', 8],
  ['shrine', 8],
  ['treasure', 7],
  ['surveyor', 7],
];
/** The first floor (0-based) each kind can turn up on. */
const FIRST_FLOOR: Partial<Record<NodeKind, number>> = {
  elite: 2,
  merchant: 2,
  camp: 2,
  shrine: 1,
  surveyor: 1,
};
/** Each map has at least this many of a kind, and no more than the most. */
const KIND_COUNTS: Partial<Record<NodeKind, { least: number; most: number }>> = {
  elite: { least: 2, most: 4 },
  merchant: { least: 1, most: 2 },
  shrine: { least: 1, most: 3 },
  camp: { least: 1, most: 3 },
  treasure: { least: 0, most: 2 },
  surveyor: { least: 1, most: 2 },
};

/**
 * The map's shape, after Slay the Spire: separate paths walk from the first
 * floor to the one before the final battle across a grid of lanes, each
 * keeping to its corridor. Each step moves at most one lane and never crosses
 * another path's step. Nodes are only where a path passes, so paths split and
 * rejoin inside a corridor (a choice of stops) while the corridors run apart
 * for floors at a time (a choice of route that rules others out). A floor
 * squeezed down to one node is walked again.
 *
 * Returns each floor's grid lanes (top to bottom) and, for each node, the
 * nodes it leads to on the next floor, by their index on that floor.
 */
function walkPaths(next: () => number): { rows: number[][]; paths: number[][][] } {
  const random = (n: number) => Math.floor(next() * n);
  for (let attempt = 0; ; attempt++) {
    const steps: [number, number][][] = Array.from({ length: FLOORS - 2 }, () => []);
    const crosses = (f: number, a: number, b: number) =>
      steps[f]!.some(([c, d]) => (a < c && b > d) || (a > c && b < d));
    const starts: number[] = [];
    for (let p = 0; p < PATHS; p++) {
      const [lo, hi] = CORRIDORS[p % CORRIDORS.length]!;
      let lane = lo + random(hi - lo + 1);
      starts.push(lane);
      for (let f = 0; f < FLOORS - 2; f++) {
        // Going straight never crosses anything, so there's always a way on.
        const options = [lane - 1, lane, lane + 1].filter(
          (l) => l >= lo && l <= hi && !crosses(f, lane, l),
        );
        const to = next() < STRAIGHT ? lane : options[random(options.length)]!;
        if (!steps[f]!.some(([a, b]) => a === lane && b === to)) steps[f]!.push([lane, to]);
        lane = to;
      }
    }
    const lanes = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
    const rows = [lanes(starts), ...steps.map((st) => lanes(st.map(([, b]) => b))), [2]];
    if (attempt < 30 && rows.slice(0, -1).some((r) => r.length < 2)) continue;
    const paths = rows.map((r, f) =>
      r.map((lane) =>
        f === FLOORS - 1
          ? []
          : f === FLOORS - 2
            ? [0]
            : lanes(steps[f]!.filter(([a]) => a === lane).map(([, b]) => rows[f + 1]!.indexOf(b))),
      ),
    );
    return { rows, paths };
  }
}

/**
 * Each grid lane leans one way, so a corridor of the map has some character:
 * riskier (more elites), safer (more camps and mysteries) or richer (more
 * treasure, merchants and surveyors). Weights are multiplied by these.
 */
const LEANS: Partial<Record<NodeKind, number>>[] = [
  {},
  { elite: 2, duel: 1.15, camp: 0.5 },
  { camp: 1.7, mystery: 1.4, elite: 0.5 },
  { treasure: 1.8, merchant: 1.6, surveyor: 1.5, elite: 0.8 },
];

/**
 * A map of ten floors that the run's seed lays out: separate paths across a
 * grid of five lanes (see walkPaths), then the final battle. The first floor
 * is all duels, the last before the final battle always has a camp, and the
 * middle floors are drawn from weighted kinds, leaning by lane, with a few
 * rules: no elite, camp or merchant on the first two floors, never the same
 * kind of stop twice in a row (duels and mysteries aside), and at least two
 * elites and one each of camp, shrine, merchant and surveyor somewhere.
 */
export function makeMap(deck: string, seed: number): MapNode[][] {
  const next = rng((seed ^ 0x5eed_0f) >>> 0);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!;
  const own = deckById(deck).colors;

  // The shape: separate paths across the grid, and how each lane leans.
  const { rows, paths } = walkPaths(next);
  const widths = rows.map((r) => r.length);
  const leans = Array.from({ length: MAX_LANES }, () => pick(LEANS));
  /** The lanes on the floor before that lead to a node. */
  const from = (f: number, lane: number) =>
    f === 0 ? [] : paths[f - 1]!.flatMap((to, i) => (to.includes(lane) ? [i] : []));

  // What waits at each node.
  const kinds: NodeKind[][] = widths.map((w) => Array<NodeKind>(w).fill('duel'));
  kinds[FLOORS - 1]![0] = 'boss';
  const count = (k: NodeKind) => kinds.flat().filter((x) => x === k).length;
  const repeatable = (k: NodeKind) => k === 'duel' || k === 'mystery';
  /** Whether a node could be this kind, given its floor and its neighbours on the map. */
  const allowed = (k: NodeKind, f: number, lane: number) => {
    if (f < (FIRST_FLOOR[k] ?? 1)) return false;
    if (count(k) >= (KIND_COUNTS[k]?.most ?? Infinity)) return false;
    if (repeatable(k)) return true;
    const near = [
      ...kinds[f]!.filter((_, l) => l !== lane),
      ...from(f, lane).map((l) => kinds[f - 1]![l]!),
      ...(paths[f]![lane] ?? []).map((l) => kinds[f + 1]![l]!),
    ];
    return !near.includes(k);
  };
  // The floor before the final battle has a camp in a random lane.
  const campAt = Math.floor(next() * widths[FLOORS - 2]!);
  kinds[FLOORS - 2]![campAt] = 'camp';
  for (let f = 1; f < FLOORS - 1; f++) {
    const lanes = kinds[f]!;
    for (let lane = 0; lane < lanes.length; lane++) {
      if (f === FLOORS - 2 && lane === campAt) continue;
      const lean = leans[rows[f]![lane]!]!;
      const options = KIND_WEIGHTS.filter(
        ([k]) => (f < FLOORS - 2 || k !== 'camp') && allowed(k, f, lane),
      ).map(([k, w]): [NodeKind, number] => [k, w * (lean[k] ?? 1)]);
      let r = next() * options.reduce((n, [, w]) => n + w, 0);
      lanes[lane] = options.find(([, w]) => (r -= w) < 0)?.[0] ?? 'duel';
    }
  }
  // Make up the kinds a map must have by turning nodes in the middle floors into
  // them: duels first, then stops no map needs (mysteries, treasures).
  for (const [k, { least }] of Object.entries(KIND_COUNTS) as [NodeKind, { least: number }][]) {
    while (count(k) < least) {
      const spotsOf = (from: NodeKind[]) =>
        kinds.flatMap((lanes, f) =>
          f > 0 && f < FLOORS - 2
            ? lanes.flatMap((x, lane) =>
                from.includes(x) && allowed(k, f, lane) ? [[f, lane]] : [],
              )
            : [],
        );
      const duels = spotsOf(['duel']);
      const spots = duels.length ? duels : spotsOf(['mystery', 'treasure']);
      if (!spots.length) break;
      const [f, lane] = pick(spots);
      kinds[f!]![lane!] = k;
    }
  }

  // Opponents are mostly Jump In pairs, and none comes back on the same map while others are left.
  const met: string[] = [];
  const foe = () => {
    const id = pickOpponent((n) => Math.floor(next() * n), deck, met);
    met.push(id);
    return id;
  };
  const reward = (): Pack => {
    const r = next();
    if (r < 0.4) return { kind: 'color', color: pick(own.length ? own : COLORS) };
    if (r < 0.7) return { kind: 'color', color: pick(COLORS.filter((c) => !own.includes(c))) };
    return { kind: 'booster' };
  };
  // Mystery events don't repeat until every one has come up.
  const events: EventId[] = [];
  const event = () => {
    if (!events.length) events.push(...EVENT_IDS);
    return events.splice(Math.floor(next() * events.length), 1)[0]!;
  };
  return kinds.map((lanes, f) =>
    lanes.map((kind, lane): MapNode => {
      const to = f < FLOORS - 1 ? { row: rows[f]![lane]!, next: paths[f]![lane]! } : {};
      if (kind === 'duel') return { kind, opponent: foe(), reward: reward(), ...to };
      // About half the elites start with a twist.
      if (kind === 'elite') {
        const opponent = foe();
        return { kind, opponent, ...(next() < 0.5 && { twist: pick(TWIST_IDS) }), ...to };
      }
      if (kind === 'boss') return { kind, opponent: foe(), ...to };
      if (kind === 'mystery') return { kind, event: event(), ...to };
      return { kind, ...to };
    }),
  );
}

/**
 * The lanes on the next floor a node leads to. On maps saved before paths
 * branched freely, every node leads to its neighbouring lanes.
 */
export function links(map: MapNode[][], floor: number, lane: number): number[] {
  const to = map[floor + 1];
  if (!to) return [];
  const node = map[floor]![lane]!;
  if (node.next) return node.next;
  return to.map((_, i) => i).filter((i) => to.length === 1 || Math.abs(i - lane) <= 1);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** How a floor ended: a fight won or lost, or a camp or shrine visited. */
export type Outcome = 'win' | 'loss' | 'done';
export type Pending =
  /** Choose a boon; at a shrine, a pact may be on offer too. Twin Blessing asks for two picks. */
  | { kind: 'boon'; options: BoonId[]; pact?: PactId; picks?: number }
  | { kind: 'camp' }
  | { kind: 'event'; event: EventId }
  | { kind: 'merchant'; offers: string[] }
  /** Pick one of a few rares: after an elite (a boon follows), or mythics from a pact (the floor ends). */
  | { kind: 'rareDraft'; options: string[]; mythic?: boolean }
  /** Pick one of your cards: to throw in a wishing well, or to copy in a mirror. */
  | { kind: 'cardPick'; mode: 'well' | 'mirror' }
  /** A card you were given, shown before you move on. */
  | { kind: 'gift'; card: string; note: string }
  /** The surveyor: special lands that replace some of your basics. */
  | { kind: 'lands'; offers: string[] };

// ---------------------------------------------------------------------------
// Mystery events: a little story and two choices. A risk is always yours to
// take, and you never lose cards you didn't choose to give.
// ---------------------------------------------------------------------------

export type EventId =
  | 'gambler'
  | 'library'
  | 'spring'
  | 'hermit'
  | 'caravan'
  | 'chest'
  | 'ambush'
  | 'well'
  | 'mirror'
  | 'duelist'
  | 'fortune'
  | 'surveyor';

export interface EventChoice {
  label: string;
  text: string;
  /** Lives won back (or lost, when negative). */
  life?: number;
  /** 'main' is a colour pack in your deck's main colour; 'chest' is a rare pack or a booster, by luck. */
  pack?: 'booster' | 'rare' | 'main' | 'chest';
  boon?: boolean;
  /** A fight right here: an ambush (losing costs nothing) or a duelist (losing costs a life). */
  fight?: EventFightKind;
  /** Choose one of your cards next. */
  pick?: 'well' | 'mirror';
  /** Duels on the next two floors pay rare packs. */
  fortune?: boolean;
  /** The surveyor's land upgrades. */
  lands?: boolean;
}

export const EVENTS: Record<EventId, { title: string; text: string; choices: EventChoice[] }> = {
  gambler: {
    title: 'A Grinning Gambler',
    text: 'A stranger rattles a cup of bones. "One life for a rare prize. Fair game, friend?"',
    choices: [
      { label: 'Take the bet', text: 'Lose a life, take a rare pack', life: -1, pack: 'rare' },
      { label: 'Walk on', text: 'Keep your lives' },
    ],
  },
  library: {
    title: 'A Forgotten Library',
    text: 'Dusty shelves lean under spellbooks nobody has opened in a century.',
    choices: [
      { label: 'Study', text: 'Choose a boon', boon: true },
      { label: 'Take a tome', text: 'A pack in your main colour', pack: 'main' },
    ],
  },
  spring: {
    title: 'A Healing Spring',
    text: 'Clear water bubbles up between the stones, warm to the touch.',
    choices: [
      { label: 'Drink', text: 'Win back a life', life: 1 },
      { label: 'Fill your flasks', text: 'Trade them for a booster in town', pack: 'booster' },
    ],
  },
  hermit: {
    title: "A Hermit's Hut",
    text: 'An old mage waves you in for tea and will not stop talking.',
    choices: [
      { label: 'Listen', text: 'Choose a boon', boon: true },
      { label: 'Take the herbs', text: 'Win back a life', life: 1 },
    ],
  },
  caravan: {
    title: 'A Stranded Caravan',
    text: 'A merchant wagon sits in a ditch, one wheel spinning.',
    choices: [
      { label: 'Help push', text: 'They pay you in cards: a booster', pack: 'booster' },
      { label: 'Ask about the road', text: 'Choose a boon', boon: true },
    ],
  },
  chest: {
    title: 'A Locked Chest',
    text: 'Half-buried in moss lies an iron chest with a rusted lock.',
    choices: [
      { label: 'Pick the lock', text: 'A rare pack or a booster, by luck', pack: 'chest' },
      { label: 'Carry it to town', text: 'Sell it for a pack in your main colour', pack: 'main' },
    ],
  },
  ambush: {
    title: 'An Ambush',
    text: 'Bandits leap from the trees, cards already drawn.',
    choices: [
      { label: 'Fight', text: 'Win: a rare pack. Lose: nothing, they flee', fight: 'ambush' },
      { label: 'Slip away', text: 'Grab a booster from their camp as you go', pack: 'booster' },
    ],
  },
  well: {
    title: 'A Wishing Well',
    text: 'Coins and cards glitter at the bottom of a moss-lined well.',
    choices: [
      {
        label: 'Make a wish',
        text: 'Throw in a card, get a random one a rarity higher',
        pick: 'well',
      },
      { label: 'Drink', text: 'Win back a life', life: 1 },
    ],
  },
  mirror: {
    title: 'A Silvered Mirror',
    text: 'Your reflection is holding one of your cards, and it winks.',
    choices: [
      { label: 'Reach in', text: 'Copy a card you own', pick: 'mirror' },
      { label: 'Smash it', text: 'Its shards buy a booster', pack: 'booster' },
    ],
  },
  duelist: {
    title: 'A Wandering Duelist',
    text: 'A masked mage blocks the bridge. "Best me, and I will teach you a trick."',
    choices: [
      { label: 'Accept', text: 'A tough duel. Win: a boon. Lose: a life', fight: 'duelist' },
      { label: 'Ask for a lesson', text: 'They hand you a booster instead', pack: 'booster' },
    ],
  },
  fortune: {
    title: 'A Fortune Teller',
    text: 'Beads clatter as an old seer turns your cards face up, one by one.',
    choices: [
      {
        label: 'Hear your fortune',
        text: 'Duels on the next two floors pay rare packs',
        fortune: true,
      },
      { label: 'Buy a charm', text: 'Choose a boon', boon: true },
    ],
  },
  surveyor: {
    title: 'A Lost Surveyor',
    text: 'A cartographer with a blank map asks the way. Their satchel rattles with deeds to strange lands.',
    choices: [
      { label: 'Show the way', text: 'They pay you in land: upgrade some basics', lands: true },
      { label: 'Trade maps', text: 'A booster from their satchel', pack: 'booster' },
    ],
  },
};
const EVENT_IDS = Object.keys(EVENTS) as EventId[];

export type EventFightKind = 'ambush' | 'duelist';

export interface ExpeditionRun {
  deck: string;
  seed: number;
  map: MapNode[][];
  /** The lane taken on each floor so far. */
  path: number[];
  /** One per finished floor; shorter than `path` while a node is under way. */
  outcomes: Outcome[];
  livesLost: number;
  /** Seed of the match being played at the current node, once it has started. */
  match: number | null;
  boons: BoonId[];
  /** Pacts taken this run (absent on runs saved before pacts). */
  pacts?: PactId[];
  /** Whether Second Wind has spared a life yet. */
  windUsed?: boolean;
  /** A fight a mystery event started at the current node. */
  fight?: { kind: EventFightKind; opponent: string };
  /** A choice waiting at the current node. */
  pending: Pending | null;
  build: Build;
  /** Expeditions cleared with this deck before the current map (absent on the first). */
  loop?: number;
  /** The starting deck, when it isn't one of ours (a Season deck). */
  custom?: Decklist;
}

export interface ExpeditionState {
  run: ExpeditionRun | null;
  records: Record<string, DeckRecord>;
}

const has = (r: ExpeditionRun, b: BoonId) => r.boons.includes(b);
const hasPact = (r: ExpeditionRun, p: PactId) => (r.pacts ?? []).includes(p);

export const maxLives = (r: ExpeditionRun) =>
  LIVES + (has(r, 'stout') ? 1 : 0) - (hasPact(r, 'mythic') ? 1 : 0);
export const keepCount = (r: ExpeditionRun) =>
  hasPact(r, 'hoarder') ? 6 : KEEP + (has(r, 'collector') ? 1 : 0);
/** Cards the merchant asks for in return. */
export const merchantPrice = (r: ExpeditionRun) => (has(r, 'haggler') ? 1 : 2);
/** Rares added to every pack. */
export const extraRares = (r: ExpeditionRun) =>
  (has(r, 'lucky') ? 1 : 0) + (hasPact(r, 'gilded') ? 2 : 0);
const youPlayFirst = (r: ExpeditionRun) => has(r, 'initiative') || hasPact(r, 'warlord');

/** Floors on the run's map (shorter on maps saved before it grew). */
export const floorsOf = (r: ExpeditionRun) => r.map.length;

export function statusOf(r: ExpeditionRun): 'playing' | 'cleared' | 'out' {
  if (r.outcomes[floorsOf(r) - 1] === 'win') return 'cleared';
  if (r.livesLost >= maxLives(r)) return 'out';
  return 'playing';
}

/** The node you're at and haven't finished yet (a fight to play, a choice to make). */
export function currentNode(
  r: ExpeditionRun,
): { floor: number; lane: number; node: MapNode } | null {
  if (r.path.length <= r.outcomes.length) return null;
  const floor = r.path.length - 1;
  const lane = r.path[floor]!;
  return { floor, lane, node: r.map[floor]![lane]! };
}

/** Lanes you can travel to on the next floor. Mapmaker adds the lanes beside your paths. */
export function reachable(r: ExpeditionRun): number[] {
  const floor = r.path.length;
  if (currentNode(r) || r.pending || statusOf(r) !== 'playing' || floor >= floorsOf(r)) return [];
  const lanes = r.map[floor]!.length;
  if (floor === 0) return Array.from({ length: lanes }, (_, i) => i);
  const to = links(r.map, floor - 1, r.path[floor - 1]!);
  if (!has(r, 'mapmaker')) return to;
  const lo = Math.max(0, Math.min(...to) - 1);
  const hi = Math.min(lanes - 1, Math.max(...to) + 1);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export function newBuild(deck: Decklist): Build {
  return {
    main: Object.fromEntries(deck.cards),
    side: {},
    opened: 0,
    packs: Array.from({ length: START_PACKS }, () => ({ kind: 'booster' }) as const),
    fresh: [],
  };
}

/** Sets out with a deck. The run keeps a copy of a Season deck, which can change or go. */
export function startExpedition(s: ExpeditionState, deck: string, seed: number): ExpeditionState {
  const list = deckById(deck);
  const custom = list.series === 'season' ? list : undefined;
  const rec = s.records[deck] ?? { runs: 0, clears: 0, best: 0 };
  return {
    records: { ...s.records, [deck]: { ...rec, runs: rec.runs + 1 } },
    run: {
      deck,
      seed,
      map: makeMap(deck, seed),
      path: [],
      outcomes: [],
      livesLost: 0,
      match: null,
      boons: [],
      pending: null,
      build: newBuild(list),
      ...(custom && { custom }),
    },
  };
}

/**
 * After clearing an expedition: a new map with the same deck and collection.
 * Lives, boons and pacts start over, and the fights climb from the bottom again.
 */
export function continueExpedition(s: ExpeditionState, seed: number): ExpeditionState {
  const r = s.run;
  if (!r || statusOf(r) !== 'cleared') return s;
  const { pacts: _p, windUsed: _w, fight: _f, ...rest } = r;
  return {
    ...s,
    run: {
      ...rest,
      seed,
      map: makeMap(r.deck, seed),
      path: [],
      outcomes: [],
      livesLost: 0,
      match: null,
      boons: [],
      pending: null,
      build: { ...r.build, fresh: [] },
      loop: (r.loop ?? 0) + 1,
    },
  };
}

const withRun = (s: ExpeditionState, f: (r: ExpeditionRun) => ExpeditionRun): ExpeditionState =>
  s.run ? { ...s, run: f(s.run) } : s;

/** A number from 0 to 1 that the run's seed and floor fix, for luck at a node. */
const luck = (r: ExpeditionRun, salt: number) =>
  rng((r.seed ^ Math.imul(r.path.length * 17 + salt, 0x7feb352d)) >>> 0)();

/** Three boons you don't have yet. */
function boonOffer(r: ExpeditionRun): BoonId[] {
  const next = rng((r.seed ^ Math.imul(r.path.length + 7, 0x2c1b3c6d)) >>> 0);
  const left = BOON_IDS.filter((b) => !r.boons.includes(b));
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [left[i], left[j]] = [left[j]!, left[i]!];
  }
  return left.slice(0, 3);
}

/** A pact can't leave you with nothing to pick or on your last life. */
const pactOpen = (r: ExpeditionRun, p: PactId) =>
  p === 'twin'
    ? BOON_IDS.filter((b) => !has(r, b)).length >= 2
    : p === 'mythic'
      ? maxLives(r) - r.livesLost > 1
      : true;

/** The pact a shrine offers beside its boons: one you haven't made yet. */
function pactOffer(r: ExpeditionRun): PactId | undefined {
  const left = PACT_IDS.filter((p) => !hasPact(r, p) && pactOpen(r, p));
  return left[Math.floor(luck(r, 3) * left.length)];
}

/**
 * Rares or mythics, mostly in the deck's colours, for merchants, elites and
 * the Mythic Pact: all but the last in your colours, the last from anywhere.
 * `salt` keeps different offers on the same floor apart.
 */
function rareOffer(r: ExpeditionRun, salt: number, count = 3, mythic = false): string[] {
  const next = rng((r.seed ^ Math.imul(r.path.length * 31 + salt, 0x68e31da4)) >>> 0);
  const colors = deckColors(r.build).slice(0, 2);
  const sheets = SHEETS[packSetOf(r, r.path.length + salt)];
  const rares = mythic ? sheets.mythic : [...sheets.rare, ...sheets.mythic];
  const fits = rares.filter(
    (c) => c.colors.length > 0 && c.colors.every((x) => colors.includes(x as Color)),
  );
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const from = (i < count - 1 && fits.length >= count ? fits : rares).filter(
      (c) => !picked.includes(c.name),
    );
    if (!from.length) break;
    picked.push(from[Math.floor(next() * from.length)]!.name);
  }
  return picked;
}

/** An opponent for a fight a mystery event starts: someone not already on the map, if possible. */
function eventFoe(r: ExpeditionRun): string {
  const next = rng((r.seed ^ Math.imul(r.path.length + 11, 0x27d4eb2f)) >>> 0);
  const met = r.map.flatMap((f) => f.flatMap((n) => n.opponent ?? []));
  return pickOpponent((n) => Math.floor(next() * n), r.deck, met);
}

/**
 * Travels to a node on the next floor. Camps, shrines, merchants and mysteries
 * ask their question straight away; a treasure is a free booster.
 */
export function enterNode(s: ExpeditionState, lane: number): ExpeditionState {
  return withRun(s, (r) => {
    if (!reachable(r).includes(lane)) return r;
    const moved = { ...r, path: [...r.path, lane] };
    const node = r.map[r.path.length]![lane]!;
    switch (node.kind) {
      case 'camp':
        return { ...moved, pending: { kind: 'camp' } };
      case 'shrine': {
        const pact = pactOffer(moved);
        return {
          ...moved,
          pending: { kind: 'boon', options: boonOffer(moved), ...(pact && { pact }) },
        };
      }
      case 'merchant':
        return { ...moved, pending: { kind: 'merchant', offers: rareOffer(moved, 1) } };
      case 'mystery':
        return { ...moved, pending: { kind: 'event', event: node.event ?? 'spring' } };
      case 'surveyor':
        return { ...moved, pending: { kind: 'lands', offers: landOffer(moved) } };
      case 'treasure':
        return {
          ...moved,
          outcomes: [...r.outcomes, 'done'],
          build: { ...r.build, packs: [...r.build.packs, { kind: 'booster' }] },
        };
      default:
        return moved;
    }
  });
}

/**
 * Makes a mystery event's choice. A boon choice asks which boon next, a card
 * choice which card, and a fight waits on the map to be played.
 */
export function resolveEvent(s: ExpeditionState, choice: number): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'event') return r;
    const c = EVENTS[r.pending.event].choices[choice];
    if (!c || !canChoose(r, c)) return r;
    if (c.fight) return { ...r, pending: null, fight: { kind: c.fight, opponent: eventFoe(r) } };
    if (c.pick) return { ...r, pending: { kind: 'cardPick', mode: c.pick } };
    if (c.lands) return { ...r, pending: { kind: 'lands', offers: landOffer(r) } };
    let next: ExpeditionRun = { ...r, pending: null, outcomes: [...r.outcomes, 'done'] };
    if (c.life) next.livesLost = Math.max(0, r.livesLost - c.life);
    if (c.pack) {
      const main = deckColors(r.build)[0];
      const pack: Pack =
        c.pack === 'main' && main
          ? { kind: 'color', color: main }
          : c.pack === 'rare' || (c.pack === 'chest' && luck(r, 5) < 0.5)
            ? { kind: 'rare' }
            : { kind: 'booster' };
      next.build = { ...r.build, packs: [...r.build.packs, pack] };
    }
    // The fortune: duels on the next two floors pay rare packs, and the map shows it.
    if (c.fortune)
      next.map = r.map.map((f, i) =>
        i === r.path.length || i === r.path.length + 1
          ? f.map((n) => (n.kind === 'duel' ? { ...n, reward: { kind: 'rare' } } : n))
          : f,
      );
    if (c.boon) {
      const options = boonOffer(r);
      if (options.length) next = { ...next, pending: { kind: 'boon', options } };
    }
    return next;
  });
}

/** A choice that would cost your last life, or risk it in a fight, isn't on offer. */
export function canChoose(r: ExpeditionRun, c: EventChoice): boolean {
  const cost = Math.max(c.life && c.life < 0 ? -c.life : 0, c.fight === 'duelist' ? 1 : 0);
  return maxLives(r) - r.livesLost > cost;
}

/** How many copies of a card you own, in the deck or the collection. */
export const owned = (b: Build, name: string): number => (b.main[name] ?? 0) + (b.side[name] ?? 0);

/** Takes one copy of a card you own: from the collection first, then the deck. */
function give(b: Build, name: string): Build | null {
  if (isBasic(name) || owned(b, name) < 1) return null;
  return b.side[name]
    ? { ...b, side: bump(b.side, name, -1) }
    : { ...b, main: bump(b.main, name, -1) };
}

/**
 * Buys one of the merchant's cards for two of yours (one with Haggler), taken
 * from the collection first, then the deck. Basic lands aren't currency.
 */
export function trade(s: ExpeditionState, buy: string, pay: string[]): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'merchant' || !r.pending.offers.includes(buy)) return r;
    if (pay.length !== merchantPrice(r)) return r;
    let b: Build | null = r.build;
    for (const name of pay) if (b) b = give(b, name);
    if (!b) return r;
    return {
      ...r,
      pending: null,
      outcomes: [...r.outcomes, 'done'],
      build: { ...b, side: bump(b.side, buy, 1), fresh: [buy] },
    };
  });
}

/** Leaves the merchant without buying. */
export function leaveMerchant(s: ExpeditionState): ExpeditionState {
  return withRun(s, (r) =>
    r.pending?.kind === 'merchant' ? { ...r, pending: null, outcomes: [...r.outcomes, 'done'] } : r,
  );
}

/** Your cards that can go in the wishing well (not mythics) or the mirror: never basic lands. */
export function pickable(r: ExpeditionRun, mode: 'well' | 'mirror'): string[] {
  const names = [...new Set([...Object.keys(r.build.side), ...Object.keys(r.build.main)])]
    .filter((n) => !isBasic(n) && (mode === 'mirror' || byName.get(n)?.rarity !== 'mythic'))
    .sort((a, b) => a.localeCompare(b));
  return names;
}

const RARITY_UP: Record<string, 'uncommon' | 'rare' | 'mythic'> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'mythic',
};

/** What the well gives for a card: a random card of the next rarity, from the card's own set. */
function wish(r: ExpeditionRun, name: string): string {
  const c = byName.get(name);
  const set = c?.set === 'blb' || c?.set === 'msh' || c?.set === 'fdn' ? c.set : packSetOf(r);
  const sheet = SHEETS[set][RARITY_UP[c?.rarity ?? 'common'] ?? 'uncommon'];
  return sheet[Math.floor(luck(r, 9) * sheet.length)]!.name;
}

/**
 * Picks the card for a wishing well (it's swapped for a random card a rarity
 * higher) or a mirror (you get a copy). `null` walks away instead.
 */
export function pickCard(s: ExpeditionState, name: string | null): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'cardPick') return r;
    const done: ExpeditionRun = { ...r, pending: null, outcomes: [...r.outcomes, 'done'] };
    if (name === null) return done;
    const mode = r.pending.mode;
    if (!pickable(r, mode).includes(name)) return r;
    if (mode === 'mirror')
      return {
        ...done,
        build: { ...r.build, side: bump(r.build.side, name, 1), fresh: [name] },
        pending: { kind: 'gift', card: name, note: 'The mirror gives you a copy.' },
      };
    const b = give(r.build, name)!;
    const card = wish(r, name);
    return {
      ...done,
      build: { ...b, side: bump(b.side, card, 1), fresh: [card] },
      pending: { kind: 'gift', card, note: `The well took ${name} and gave you this.` },
    };
  });
}

/** Moves on after seeing a card you were given. */
export function dismissGift(s: ExpeditionState): ExpeditionState {
  return withRun(s, (r) => (r.pending?.kind === 'gift' ? { ...r, pending: null } : r));
}

/**
 * Takes one of the rares on offer. After an elite a boon choice follows; the
 * Mythic Pact's mythic ends the shrine.
 */
export function chooseRare(s: ExpeditionState, name: string): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'rareDraft' || !r.pending.options.includes(name)) return r;
    const build = { ...r.build, side: bump(r.build.side, name, 1), fresh: [name] };
    if (r.pending.mythic) return { ...r, pending: null, outcomes: [...r.outcomes, 'done'], build };
    const options = boonOffer(r);
    return { ...r, pending: options.length ? { kind: 'boon', options } : null, build };
  });
}

/**
 * Makes the pact a shrine offers. Twin Blessing asks for two boons next and
 * the Mythic Pact for a mythic; the others end the shrine.
 */
export function choosePact(s: ExpeditionState, pact: PactId): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'boon' || r.pending.pact !== pact) return r;
    const next = { ...r, pacts: [...(r.pacts ?? []), pact] };
    if (pact === 'twin')
      return { ...next, pending: { kind: 'boon', options: boonOffer(next), picks: 2 } };
    if (pact === 'mythic')
      return {
        ...next,
        pending: { kind: 'rareDraft', options: rareOffer(r, 3, 3, true), mythic: true },
      };
    return { ...next, pending: null, outcomes: [...r.outcomes, 'done'] };
  });
}

// ---------------------------------------------------------------------------
// The surveyor: special lands in place of basics
// ---------------------------------------------------------------------------

/**
 * Lands that work in any deck: colourless mana with a useful ability, or a
 * fetch for a basic. The rest of the pool's lands that need a commander, a
 * creature type, deserts, heroes or more opponents aren't offered.
 */
const UTILITY_LANDS = [
  "Rogue's Passage",
  'Cryptic Caves',
  'Hidden Grotto',
  'Evolving Wilds',
  'Terramorphic Expanse',
  'Fabled Passage',
  'Uncharted Haven',
  'Fountainport',
  'The Great Mound',
  'Baxter Building',
  'Throne of the High City',
];

/** Copies of a land the surveyor gives (and basics it replaces): fewer as the land gets better. */
export const landCopies = (name: string): number =>
  ({ common: 3, uncommon: 2 })[byName.get(name)?.rarity ?? ''] ?? 1;

/** Special lands that suit your deck: they make only its colours, or are utility lands. */
export function landsFor(b: Build): string[] {
  const colors = deckColors(b).slice(0, 2);
  return SCRYFALL.filter((c) => {
    if (!c.typeLine.includes('Land') || c.typeLine.startsWith('Basic') || c.front) return false;
    if (UTILITY_LANDS.includes(c.name)) return true;
    // Lands that only work with more opponents or a commander aren't for duels.
    if (/opponents|commander/i.test(c.oracleText ?? '')) return false;
    const makes = landColors(c.name);
    return makes.length > 0 && makes.every((x) => colors.includes(x));
  }).map((c) => c.name);
}

/**
 * Three land upgrades for the deck: a common one (three copies), an uncommon
 * (two) and a rare (one), each from what suits its colours, never one it
 * already has.
 */
function landOffer(r: ExpeditionRun): string[] {
  const next = rng((r.seed ^ Math.imul(r.path.length + 13, 0x1b873593)) >>> 0);
  const pool = [...new Set(landsFor(r.build))].filter((n) => !owned(r.build, n));
  const picked: string[] = [];
  for (const tier of [['common'], ['uncommon'], ['rare', 'mythic']]) {
    const inTier = pool.filter((n) => tier.includes(byName.get(n)?.rarity ?? ''));
    const from = (inTier.length ? inTier : pool).filter((n) => !picked.includes(n));
    if (from.length) picked.push(from[Math.floor(next() * from.length)]!);
  }
  return picked;
}

/**
 * The basics a land replaces: those of the colours it makes, most numerous
 * first, or your most numerous basics for a colourless land.
 */
function basicsFor(b: Build, land: string, copies: number): string[] {
  const makes = landColors(land);
  const counts = { ...b.main };
  const out: string[] = [];
  for (let i = 0; i < copies; i++) {
    const basics = Object.values(BASICS).filter((n) => (counts[n] ?? 0) > 0);
    const fitting = basics.filter((n) => makes.some((c) => BASICS[c] === n));
    const from = fitting.length ? fitting : basics;
    const most = from.sort((x, y) => (counts[y] ?? 0) - (counts[x] ?? 0))[0];
    if (!most) break;
    out.push(most);
    counts[most] = counts[most]! - 1;
  }
  return out;
}

/** What taking a land upgrade does: the land's copies, and the basics they replace. */
export function landUpgrade(b: Build, land: string): { copies: number; replaces: string[] } {
  const copies = landCopies(land);
  return { copies, replaces: basicsFor(b, land, copies) };
}

/**
 * Takes one of the surveyor's lands: its copies go into the deck in place of
 * that many basics (which go back to the free supply). `null` leaves without one.
 */
export function chooseLand(s: ExpeditionState, land: string | null): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'lands') return r;
    const done: ExpeditionRun = { ...r, pending: null, outcomes: [...r.outcomes, 'done'] };
    if (land === null) return done;
    if (!r.pending.offers.includes(land)) return r;
    const { copies, replaces } = landUpgrade(r.build, land);
    let main = bump(r.build.main, land, copies);
    for (const basic of replaces) main = bump(main, basic, -1);
    const swapped = replaces.length
      ? `It replaces ${replaces.length} basic land${replaces.length > 1 ? 's' : ''} in your deck.`
      : 'It goes into your deck.';
    return {
      ...done,
      build: { ...r.build, main, fresh: [land] },
      pending: {
        kind: 'gift',
        card: land,
        note: `${copies > 1 ? `${copies} copies. ` : ''}${swapped}`,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Fights
// ---------------------------------------------------------------------------

/** A fight's difficulty on this run: the Gilded Pact makes elites a step harder. */
export function difficultyIn(r: ExpeditionRun, floor: number, node: MapNode): number {
  const d = difficultyOf(floor, node, floorsOf(r));
  return Math.min(MAX_DIFFICULTY, d + (node.kind === 'elite' && hasPact(r, 'gilded') ? 1 : 0));
}

/**
 * An elite's twist: its own, or one the Warlord's Pact gives it. Quick does
 * nothing when you always play first, so then it's Armed instead.
 */
export function twistOf(r: ExpeditionRun, floor: number, lane: number): TwistId | undefined {
  const node = r.map[floor]?.[lane];
  if (node?.kind !== 'elite') return undefined;
  const given = hasPact(r, 'warlord')
    ? TWIST_IDS[(Math.imul(r.seed ^ (floor * 31 + lane), 0x9e3779b1) >>> 0) % TWIST_IDS.length]
    : undefined;
  const t = node.twist ?? given;
  return t === 'quick' && youPlayFirst(r) ? 'armed' : t;
}

export interface Fight {
  opponent: string;
  bot: BotKind;
  difficulty: number;
  /** A map node's kind, or the mystery event that started it. */
  kind: NodeKind | EventFightKind;
  twist?: TwistId;
}

/** The fight waiting at the current node: the node's own, or one a mystery event started. */
export function fightOf(r: ExpeditionRun): Fight | null {
  const at = currentNode(r);
  if (!at || r.pending || statusOf(r) !== 'playing') return null;
  if (r.fight) {
    // A duelist fights like an elite; an ambush is a step easier than a duel.
    const d =
      r.fight.kind === 'duelist'
        ? difficultyIn(r, at.floor, { kind: 'elite' })
        : Math.max(1, difficultyIn(r, at.floor, { kind: 'duel' }) - 1);
    return { opponent: r.fight.opponent, bot: botAt(d), difficulty: d, kind: r.fight.kind };
  }
  if (!at.node.opponent) return null;
  const d = difficultyIn(r, at.floor, at.node);
  const twist = twistOf(r, at.floor, at.lane);
  return {
    opponent: at.node.opponent,
    bot: botAt(d),
    difficulty: d,
    kind: at.node.kind,
    ...(twist && { twist }),
  };
}

export function startMatch(s: ExpeditionState, seed: number): ExpeditionState {
  return withRun(s, (r) => (fightOf(r) ? { ...r, match: seed } : r));
}

/**
 * Records a fight. A win pays the node's reward: a duel's pack, an elite's
 * rare choice and boon (and a booster if it had a twist), an ambush's rare
 * pack or a duelist's boon. A loss costs a life and you move on, except at
 * the final battle, which you retry. An ambush costs nothing to lose, Second
 * Wind spares the first life, and Scavenger keeps a card from a lost duel's
 * pack. Only the match the run is waiting on counts. A draw replays it.
 */
export function recordMatch(
  s: ExpeditionState,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): ExpeditionState {
  const r = s.run;
  const at = r && currentNode(r);
  const f = r && fightOf(r);
  if (!r || !at || !f || r.match !== seed) return s;
  if (outcome === 'draw') return { ...s, run: { ...r, match: null } };
  const { fight: event, ...rest } = r;
  const next: ExpeditionRun = { ...rest, match: null };
  const packs = [...r.build.packs];
  if (outcome === 'win') {
    next.outcomes = [...r.outcomes, 'win'];
    if (event?.kind === 'ambush') packs.push({ kind: 'rare' });
    else if (event?.kind === 'duelist') {
      const options = boonOffer(r);
      if (options.length) next.pending = { kind: 'boon', options };
    } else if (at.node.kind === 'duel' && at.node.reward) packs.push(at.node.reward);
    else if (at.node.kind === 'elite') {
      next.pending = { kind: 'rareDraft', options: rareOffer(r, 2, has(r, 'deepPockets') ? 4 : 3) };
      if (f.twist) packs.push({ kind: 'booster' });
    }
  } else {
    const spared = event?.kind === 'ambush' || (has(r, 'secondWind') && !r.windUsed);
    if (!spared) next.livesLost = r.livesLost + 1;
    else if (event?.kind !== 'ambush') next.windUsed = true;
    if (at.node.kind !== 'boss') next.outcomes = [...r.outcomes, 'loss'];
    if (has(r, 'scavenger') && !event && at.node.kind === 'duel' && at.node.reward)
      packs.push({ ...at.node.reward, keep: 1 });
  }
  next.build = { ...r.build, packs };
  const rec = s.records[r.deck] ?? { runs: 1, clears: 0, best: 0 };
  return {
    run: next,
    records: {
      ...s.records,
      [r.deck]: {
        ...rec,
        best: Math.max(rec.best, next.outcomes.length),
        clears: rec.clears + (statusOf(next) === 'cleared' ? 1 : 0),
      },
    },
  };
}

/** At a camp: rest to win back a life, or forage for a booster. */
export function camp(s: ExpeditionState, choice: 'rest' | 'forage'): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'camp') return r;
    const done = { ...r, pending: null, outcomes: [...r.outcomes, 'done' as const] };
    if (choice === 'rest') return { ...done, livesLost: Math.max(0, r.livesLost - 1) };
    return { ...done, build: { ...r.build, packs: [...r.build.packs, { kind: 'booster' }] } };
  });
}

/**
 * Takes a boon: at a shrine (which finishes the floor), after an elite or a
 * duelist, or from an event. Twin Blessing asks for a second one.
 */
export function chooseBoon(s: ExpeditionState, boon: BoonId): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'boon' || !r.pending.options.includes(boon)) return r;
    const boons = [...r.boons, boon];
    const picks = (r.pending.picks ?? 1) - 1;
    const options = r.pending.options.filter((b) => b !== boon);
    if (picks > 0 && options.length)
      return { ...r, boons, pending: { kind: 'boon', options, picks } };
    const atShrine = currentNode(r)?.node.kind === 'shrine';
    return {
      ...r,
      boons,
      pending: null,
      outcomes: atShrine ? [...r.outcomes, 'done'] : r.outcomes,
    };
  });
}

/**
 * The engine setup for the current fight: your boons and pacts, and what
 * makes your opponent tougher (pacts, the elite's twist).
 */
export function gameOptions(r: ExpeditionRun): Omit<NewGameOptions, 'decks' | 'seed'> {
  const f = fightOf(r);
  const twist = f?.twist;
  const theirLife = Math.max(
    20,
    hasPact(r, 'twin') ? 24 : 0,
    twist === 'tough' || (f?.kind === 'boss' && hasPact(r, 'gilded')) ? 25 : 0,
  );
  const theirCards = (hasPact(r, 'hoarder') ? 1 : 0) + (twist === 'armed' ? 1 : 0);
  const life = { ...(has(r, 'hardy') && { p1: 25 }), ...(theirLife > 20 && { p2: theirLife }) };
  const extraCards = {
    ...(has(r, 'prepared') && { p1: 1 }),
    ...(theirCards > 0 && { p2: theirCards }),
  };
  const lands: PlayerId[] = [
    ...(has(r, 'trailblazer') ? (['p1'] as const) : []),
    ...(hasPact(r, 'warlord') ? (['p1', 'p1'] as const) : []),
    ...(twist === 'ready' ? (['p2'] as const) : []),
  ];
  const first = youPlayFirst(r) ? 'p1' : twist === 'quick' ? 'p2' : undefined;
  return {
    ...(Object.keys(life).length > 0 && { life }),
    ...(first && { startingPlayer: first }),
    ...(Object.keys(extraCards).length > 0 && { extraCards }),
    ...(lands.length > 0 && { landInPlay: lands }),
  };
}

export function summarize(r: ExpeditionRun): RunSummary {
  const wins = r.outcomes.filter((o) => o !== 'loss').length;
  return {
    deck: r.deck,
    status: statusOf(r),
    unit: 'Floor',
    step: Math.min(r.outcomes.length + 1, floorsOf(r)),
    steps: floorsOf(r),
    done: wins,
    livesLeft: maxLives(r) - r.livesLost,
    lives: maxLives(r),
  };
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/** The set a booster comes from: Foundations, or the set of a Bloomburrow or Marvel deck. */
export type PackSet = 'fdn' | 'blb' | 'msh';

/** Booster names, by set. */
export const PACK_SET_NAMES: Record<PackSet, string> = {
  fdn: 'Foundations',
  blb: 'Bloomburrow',
  msh: 'Marvel Super Heroes',
};

const asPackSet = (set: string | undefined): PackSet =>
  set === 'blb' || set === 'msh' ? set : 'fdn';

/**
 * The set of the run's `n`th booster: a Bloomburrow or Marvel deck opens that
 * set's boosters, and a Jump In deck mixing two sets alternates between them.
 */
export function packSetOf(r: Pick<ExpeditionRun, 'deck'>, n = 0): PackSet {
  const pair = jumpInPackets(r.deck);
  if (pair) return asPackSet(pair[n % 2]!.set);
  return asPackSet(findDeck(r.deck)?.set);
}

/** Cards of a set we can play, by rarity. Basic lands aren't in packs. */
function sheetsOf(set: PackSet) {
  // A double-faced card's back face comes with its front.
  const cards = SCRYFALL.filter(
    (c) => c.set === set && !c.typeLine.startsWith('Basic') && !c.front,
  );
  const byRarity = (r: string) => cards.filter((c) => c.rarity === r);
  return {
    common: byRarity('common'),
    uncommon: byRarity('uncommon'),
    rare: byRarity('rare'),
    mythic: byRarity('mythic'),
  };
}
const SHEETS = { fdn: sheetsOf('fdn'), blb: sheetsOf('blb'), msh: sheetsOf('msh') };
type Sheet = (typeof SHEETS.fdn)['common'];

export const PACK_SIZE = { rare: 1, uncommon: 3, common: 8 };

/**
 * One pack: a rare (a mythic one time in eight), three uncommons and eight
 * commons, no duplicates. A colour pack draws most slots from that colour; a
 * rare pack swaps a common for another rare, and so does each of `extraRares`
 * (Lucky Find, the Gilded Pact).
 */
export function rollPack(pack: Pack, seed: number, extraRares = 0, set: PackSet = 'fdn'): string[] {
  const sheets = SHEETS[set];
  const next = rng(seed);
  const picked = new Set<string>();
  const inColor = (sheet: Sheet) =>
    pack.kind === 'color' ? sheet.filter((c) => c.colors.includes(pack.color)) : sheet;
  const draw = (sheet: Sheet, themed: boolean) => {
    const from = (themed && inColor(sheet).length ? inColor(sheet) : sheet).filter(
      (c) => !picked.has(c.name),
    );
    const card = from[Math.floor(next() * from.length)];
    if (card) picked.add(card.name);
  };
  const rare = (themed: boolean) => draw(next() < 1 / 8 ? sheets.mythic : sheets.rare, themed);
  const color = pack.kind === 'color';
  const rares = 1 + (pack.kind === 'rare' ? 1 : 0) + extraRares;
  rare(color);
  for (let i = 0; i < PACK_SIZE.uncommon; i++) draw(sheets.uncommon, color && i < 2);
  for (let i = 0; i < PACK_SIZE.common - (rares - 1); i++) draw(sheets.common, color && i < 5);
  for (let i = 1; i < rares; i++) rare(false);
  return [...picked];
}

const packSeed = (r: ExpeditionRun, n: number) => (r.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;

/** The cards in each waiting pack. */
export function pendingPacks(r: ExpeditionRun): string[][] {
  return r.build.packs.map((p, i) => {
    const n = r.build.opened + i;
    return rollPack(p, packSeed(r, n), extraRares(r), packSetOf(r, n));
  });
}

/** Cards you keep from each waiting pack. */
export const packKeeps = (r: ExpeditionRun): number[] =>
  r.build.packs.map((p) => p.keep ?? keepCount(r));

/**
 * Opens the waiting packs, keeping the chosen cards from each (at most the
 * run's keep count, and only cards that were in that pack).
 */
export function openPacks(s: ExpeditionState, kept: string[][]): ExpeditionState {
  return withRun(s, (r) => {
    const packs = pendingPacks(r);
    const keeps = packKeeps(r);
    const cards = packs.flatMap((pack, i) =>
      [...new Set(kept[i] ?? [])].filter((c) => pack.includes(c)).slice(0, keeps[i]),
    );
    const side = { ...r.build.side };
    for (const c of cards) side[c] = (side[c] ?? 0) + 1;
    const b = r.build;
    return {
      ...r,
      build: { ...b, side, opened: b.opened + b.packs.length, packs: [], fresh: cards },
    };
  });
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

/** Moves one copy between deck and collection. Basic lands come from and go back to the free supply. */
export function moveCard(s: ExpeditionState, name: string, to: 'main' | 'side'): ExpeditionState {
  return withRun(s, (r) => {
    const b = r.build;
    const from = to === 'main' ? 'side' : 'main';
    const basic = isBasic(name);
    if (!basic && !b[from][name]) return r;
    let build: Build;
    if (basic && to === 'main') build = { ...b, main: bump(b.main, name, 1) };
    else if (basic) build = b.main[name] ? { ...b, main: bump(b.main, name, -1) } : b;
    else build = { ...b, [from]: bump(b[from], name, -1), [to]: bump(b[to], name, 1) };
    return { ...r, build };
  });
}

function bump(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

export const size = (c: Counts) => Object.values(c).reduce((n, k) => n + k, 0);

export function deckCards(b: Build): CardDefId[] {
  return Object.entries(b.main).flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

const byName = new Map(SCRYFALL.map((c) => [c.name, c]));

/** Colours of the deck's spells, most played first. */
export function deckColors(b: Build): Color[] {
  const n: Partial<Record<Color, number>> = {};
  for (const [name, k] of Object.entries(b.main)) {
    const c = byName.get(name);
    if (!c || c.typeLine.includes('Land')) continue;
    for (const col of c.colors as Color[]) n[col] = (n[col] ?? 0) + k;
  }
  return COLORS.filter((c) => n[c]).sort((a, b) => n[b]! - n[a]!);
}

/**
 * A Season deck as a decklist to set out with. Season decks count cards by
 * id; any we don't know are left out. The deck box shows its best creature.
 */
export function seasonDecklist(
  saveId: string,
  deck: { id: string; name: string; cards: Counts },
): Decklist {
  const cards = Object.entries(deck.cards).flatMap(([id, n]): [string, number][] => {
    const name = scryfallById.get(id)?.name;
    return name && n > 0 ? [[name, n]] : [];
  });
  const spells = cards.map(([n]) => byName.get(n)!).filter((c) => !c.typeLine.includes('Land'));
  const rank = (c: (typeof spells)[number]) =>
    (c.typeLine.includes('Creature') ? 10 : 0) + (RARITY_SCORE[c.rarity] ?? 0) + mv(c.name) / 10;
  const face = [...spells].sort((a, b) => rank(b) - rank(a))[0]?.name ?? cards[0]?.[0] ?? 'Plains';
  const colors = deckColors({
    main: Object.fromEntries(cards),
    side: {},
    opened: 0,
    packs: [],
    fresh: [],
  });
  return {
    id: `season:${saveId}:${deck.id}`,
    name: deck.name,
    colors: colors.length ? colors.slice(0, 2) : ['W'],
    face,
    source: 'custom',
    series: 'season',
    cards,
  };
}

/** The run's deck as a decklist, for the board and the deck view. */
export function runDeck(r: ExpeditionRun): Decklist {
  const base = deckById(r.deck);
  const colors = deckColors(r.build);
  return {
    ...base,
    colors: colors.length ? colors.slice(0, 2) : base.colors,
    cards: Object.entries(r.build.main),
  };
}

// ---------------------------------------------------------------------------
// Deck help: friendly notes and a suggested 40
// ---------------------------------------------------------------------------

export const LANDS_PER_40 = 17;
const COLOR_WORDS: Record<Color, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};
const RARITY_SCORE: Record<string, number> = { common: 1, uncommon: 2, rare: 3, mythic: 4 };
const isLand = (name: string) => byName.get(name)?.typeLine.includes('Land') ?? false;
const colorsOf = (name: string) => (byName.get(name)?.colors ?? []) as Color[];
const mv = (name: string) => manaValue(byName.get(name)?.manaCost ?? '');

/** Colours of mana a land makes: basics by name, others from their "Add {G}" text. */
export function landColors(name: string): Color[] {
  const basic = COLORS.find((c) => BASICS[c] === name);
  if (basic) return [basic];
  const text = byName.get(name)?.oracleText ?? '';
  return COLORS.filter((c) => new RegExp(`Add[^.]*\\{${c}\\}`).test(text));
}

/** Plain-language notes on the deck: land count, colours and mana curve. */
export function deckAdvice(b: Build): string[] {
  const total = size(b.main);
  if (total < MIN_DECK) return [];
  const cards = Object.entries(b.main);
  const count = (pred: (name: string) => boolean) =>
    cards.filter(([n]) => pred(n)).reduce((k, [, c]) => k + c, 0);
  const notes: string[] = [];

  const lands = count(isLand);
  const want = Math.round((total * LANDS_PER_40) / 40);
  if (lands < want - 2)
    notes.push(
      `Only ${lands} lands. About ${want} is usual for ${total} cards, so you can cast your spells on time.`,
    );
  else if (lands > want + 2)
    notes.push(
      `${lands} lands is a lot. About ${want} is usual, which leaves more room for spells.`,
    );
  if (total > 42)
    notes.push(`${total} cards. Trimming toward 40 means you draw your best cards more often.`);

  const perColor = COLORS.map((c) => ({
    c,
    n: count((name) => !isLand(name) && colorsOf(name).includes(c)),
  })).filter((x) => x.n > 0);
  if (perColor.length >= 3) {
    const least = [...perColor].sort((a, b) => a.n - b.n)[0]!;
    notes.push(
      `Your spells use ${perColor.length} colours. Two is much easier to cast; your ${COLOR_WORDS[least.c]} cards (${least.n}) are the easiest to cut.`,
    );
  }
  const makes = new Set(cards.filter(([n]) => isLand(n)).flatMap(([n]) => landColors(n)));
  for (const { c } of perColor)
    if (!makes.has(c))
      notes.push(
        `You have ${COLOR_WORDS[c]} spells but nothing that makes ${COLOR_WORDS[c]} mana. Add some ${BASICS[c]}s.`,
      );
  // Lands that make no coloured mana (fetches for basics aside) can strand coloured spells.
  const colourless = count(
    (n) =>
      isLand(n) &&
      !landColors(n).length &&
      !/search your library for a basic land/i.test(byName.get(n)?.oracleText ?? ''),
  );
  if (colourless > 3)
    notes.push(
      `${colourless} of your lands make no coloured mana. More than 3 can leave coloured spells stuck in hand.`,
    );

  const spells = total - lands;
  const cheap = count((n) => !isLand(n) && mv(n) <= 2);
  const big = count((n) => !isLand(n) && mv(n) >= 5);
  if (spells >= 15 && cheap < Math.round(spells * 0.25))
    notes.push(`Only ${cheap} spells cost 2 or less. A few more cheap cards help you start fast.`);
  if (big > Math.round(spells * 0.25))
    notes.push(`${big} spells cost 5 or more. Too many can leave you with nothing to do early on.`);
  return notes;
}

/**
 * A sensible 40 from everything you own: the two colours with the strongest
 * cards, their best 23 spells (with only a few expensive ones), matching
 * non-basic lands, and basics split by the spells' coloured mana symbols.
 */
export function suggestDeck(b: Build): Pick<Build, 'main' | 'side'> {
  const pool: Counts = {};
  for (const [n, k] of [...Object.entries(b.main), ...Object.entries(b.side)])
    if (!isBasic(n)) pool[n] = (pool[n] ?? 0) + k;
  const score = (n: string) =>
    (RARITY_SCORE[byName.get(n)?.rarity ?? 'common'] ?? 1) +
    (byName.get(n)?.typeLine.includes('Creature') ? 0.5 : 0) -
    (mv(n) >= 6 ? 1 : 0);

  const weight = new Map<Color, number>();
  for (const [n, k] of Object.entries(pool))
    if (!isLand(n)) for (const c of colorsOf(n)) weight.set(c, (weight.get(c) ?? 0) + score(n) * k);
  const two = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c);
  const fits = (n: string) => colorsOf(n).every((c) => two.includes(c));

  const copies = Object.entries(pool)
    .filter(([n]) => !isLand(n))
    .flatMap(([n, k]) => Array<string>(k).fill(n))
    .sort((a, b) => Number(fits(b)) - Number(fits(a)) || score(b) - score(a) || mv(a) - mv(b));
  const spells: string[] = [];
  const later: string[] = [];
  for (const n of copies) {
    if (spells.length >= MIN_DECK - LANDS_PER_40) break;
    const expensive = mv(n) >= 5 && spells.filter((x) => mv(x) >= 5).length >= 4;
    if (!fits(n) || expensive) later.push(n);
    else spells.push(n);
  }
  while (spells.length < MIN_DECK - LANDS_PER_40 && later.length) spells.push(later.shift()!);

  const main: Counts = {};
  const add = (n: string, k = 1) => (main[n] = (main[n] ?? 0) + k);
  spells.forEach((n) => add(n));
  let lands = 0;
  // Special lands that make the deck's colours, and up to three utility lands.
  let utility = 0;
  for (const [n, k] of Object.entries(pool)) {
    if (!isLand(n)) continue;
    const makes = landColors(n);
    const useful = UTILITY_LANDS.includes(n);
    if (!useful && (!makes.length || !makes.every((c) => two.includes(c)))) continue;
    const take = Math.min(k, LANDS_PER_40 - lands, useful ? 3 - utility : Infinity);
    if (take > 0) add(n, take);
    lands += Math.max(0, take);
    if (useful) utility += Math.max(0, take);
  }
  // Basics in proportion to the coloured mana symbols the spells ask for.
  const pips = new Map<Color, number>();
  for (const n of spells)
    for (const [, sym] of (byName.get(n)?.manaCost ?? '').matchAll(/\{([^}]+)\}/g))
      for (const c of COLORS) if (sym!.includes(c)) pips.set(c, (pips.get(c) ?? 0) + 1);
  const colors = two.length ? two : ['G' as Color];
  const totalPips = colors.reduce((k, c) => k + (pips.get(c) ?? 0), 0) || colors.length;
  let left = LANDS_PER_40 - lands;
  colors.forEach((c, i) => {
    const k =
      i === colors.length - 1
        ? left
        : Math.round(((pips.get(c) ?? 1) / totalPips) * (LANDS_PER_40 - lands));
    if (k > 0) add(BASICS[c], k);
    left -= k;
  });

  const side: Counts = {};
  for (const [n, k] of Object.entries(pool))
    if (k - (main[n] ?? 0) > 0) side[n] = k - (main[n] ?? 0);
  return { main, side };
}

/** Replaces the deck with the suggested 40; everything else goes to the collection. */
export function applySuggestion(s: ExpeditionState): ExpeditionState {
  return withRun(s, (r) => ({ ...r, build: { ...r.build, ...suggestDeck(r.build) } }));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.expedition';
// 2: the map. Runs from version 1 (a straight ladder) are dropped; records are kept.
const VERSION = 2;

export function loadExpedition(): ExpeditionState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      (ExpeditionState & { v: number }) | null;
    if (!g) return { run: null, records: {} };
    if (g.v !== VERSION) return { run: null, records: g.records ?? {} };
    const known = (name: string) => byName.has(name);
    const deck = (id: string) => !!findDeck(id);
    const r = g.run;
    if (r?.custom) registerDeck(r.custom);
    const ok =
      r &&
      deck(r.deck) &&
      r.map.every((f) => f.every((n) => !n.opponent || deck(n.opponent))) &&
      Object.keys(r.build.main).every(known) &&
      Object.keys(r.build.side).every(known);
    return { run: ok ? r : null, records: g.records ?? {} };
  } catch {
    return { run: null, records: {} };
  }
}

export function saveExpedition(s: ExpeditionState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Storage unavailable (private mode): the run lasts for this session only.
  }
}
