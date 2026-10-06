import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { autoBasics, BASICS, basicColor, COLORS, landTarget } from './deckBuilderLogic.ts';
import { cardEntries, manaValue } from './deckView.ts';
import { landColors, spellColors } from './expedition.ts';
import { rateCard } from './limitedRating.ts';

/** Card name -> copies. */
type Counts = Readonly<Record<string, number>>;

/** One suggested addition to a part-built deck. */
export interface Hint {
  name: string;
  /** Copies to add (at least 1). */
  count: number;
  /** A short, plain-English reason. */
  reason: string;
  land: boolean;
  /** One or two words for a badge on the card: "Removal", "2-drop", "Creature". */
  tag: string;
}

/** The badge for a reason (see `completionHints`). */
export function hintTag(reason: string): string {
  if (reason === 'Removal') return 'Removal';
  if (reason.startsWith('Creature')) return 'Creature';
  const drop = /^Fills your (\d)-drop/.exec(reason);
  if (drop) return `${drop[1]}-drop`;
  if (reason.startsWith('Cheap')) return 'Cheap';
  if (reason.startsWith('Strong')) return 'Strong';
  return 'Good fit';
}

const info = (name: string) => scryfallById.get(slug(name));
const isLandName = (name: string) =>
  basicColor.has(name) || /\bLand\b/.test(info(name)?.typeLine ?? '');
const isCreatureName = (name: string) => /\bCreature\b/.test(info(name)?.typeLine ?? '');
const mvOf = (name: string) => manaValue(info(name)?.manaCost ?? '');

/** Cards that deal with a creature or other permanent: destroy, exile, damage, shrink, fight. */
const REMOVAL =
  /(?:destroy|exile) (?:up to \w+ )?target|deals? \d+ damage to (?:any|target|up to)|target creature gets -\d+\/-\d+|fights? (?:up to one )?(?:another )?target|-\d+\/-\d+ until end of turn/i;
const isRemoval = (name: string) => REMOVAL.test(info(name)?.oracleText ?? '');

/** Whether a card can be cast in these colours: every coloured symbol in its cost has one of them. */
function castable(name: string, colors: readonly Color[]): boolean {
  const c = info(name);
  if (!c) return false;
  if (!c.manaCost) return (c.colors as Color[]).every((k) => colors.includes(k));
  return [...c.manaCost.matchAll(/\{([^}]+)\}/g)].every(([, sym]) => {
    const needs = COLORS.filter((k) => sym!.split('/').includes(k));
    return !needs.length || needs.some((k) => colors.includes(k));
  });
}

/** The two colours the deck is in: its spells' two most-played, filled up from the pool's best pair. */
function pickColors(deck: Counts, pool: Counts, spellWant: number): Color[] {
  const weights = spellColors(deck);
  const own = COLORS.filter((c) => (weights.get(c) ?? 0) > 0).sort(
    (a, b) => weights.get(b)! - weights.get(a)!,
  );
  if (own.length >= 2) return own.slice(0, 2);
  const copies = Object.entries(pool).flatMap(([n, k]) =>
    isLandName(n) || !info(n) ? [] : Array<string>(Math.min(k, 4)).fill(n),
  );
  let best: Color[] = own;
  let bestScore = -1;
  for (let i = 0; i < COLORS.length; i++)
    for (let j = i + 1; j < COLORS.length; j++) {
      const pair = [COLORS[i]!, COLORS[j]!];
      if (own.length && !pair.includes(own[0]!)) continue;
      const score = copies
        .filter((n) => castable(n, pair))
        .map((n) => Math.max(0, rateCard(n) - 1.5))
        .sort((a, b) => b - a)
        .slice(0, spellWant)
        .reduce((a, b) => a + b, 0);
      if (score > bestScore) [bestScore, best] = [score, pair];
    }
  return best;
}

/**
 * What to add to a deck that has fewer than `min` cards, best first: spells
 * that fit its colours and fill its gaps (creatures, cheap plays, removal),
 * then lands. Basics are suggested only with `basics`, split like auto lands.
 * Never suggests more copies than `pool` holds (or more than `maxCopies` of a
 * card in all); returns nothing once the deck has `min` cards.
 */
export function completionHints({
  deck,
  pool,
  min,
  basics = false,
  maxCopies = 4,
}: {
  deck: Counts;
  pool: Counts;
  min: number;
  basics?: boolean;
  maxCopies?: number;
}): Hint[] {
  const have = Object.values(deck).reduce((n, k) => n + k, 0);
  const need = min - have;
  if (need <= 0) return [];

  const landWant = landTarget(min);
  const spellWant = min - landWant;
  const scale = spellWant / 23;
  const deckLands = Object.entries(deck).reduce((n, [c, k]) => n + (isLandName(c) ? k : 0), 0);
  const colors = pickColors(deck, pool, spellWant);

  /* ---- what the deck looks like now */
  const picked: Record<string, number> = {};
  const state = { creatures: 0, removal: 0, cheap: 0, three: 0, four: 0, five: 0, six: 0 };
  const tally = (name: string, k: number) => {
    state.creatures += isCreatureName(name) ? k : 0;
    state.removal += isRemoval(name) ? k : 0;
    const mv = mvOf(name);
    if (mv <= 2) state.cheap += k;
    else if (mv === 3) state.three += k;
    else if (mv === 4) state.four += k;
    if (mv >= 5) state.five += k;
    if (mv >= 6) state.six += k;
  };
  for (const [n, k] of Object.entries(deck)) if (!isLandName(n) && info(n)) tally(n, k);

  /* ---- how many lands, how many spells */
  const nonbasicLands = Object.entries(pool)
    .filter(([n, k]) => k > 0 && !basicColor.has(n) && /\bLand\b/.test(info(n)?.typeLine ?? ''))
    .filter(([n]) => {
      const makes = landColors(n);
      return makes.length > 0 && makes.every((c) => colors.includes(c));
    })
    .sort(([a], [b]) => landColors(b).length - landColors(a).length)
    .map(([n, k]) => [n, Math.min(k, Math.max(0, maxCopies - (deck[n] ?? 0)))] as const)
    .filter(([, k]) => k > 0);
  const landsNeeded = Math.max(0, landWant - deckLands);
  const nonbasicAvail = nonbasicLands.reduce((n, [, k]) => n + k, 0);
  const landCap = Math.min(need, landsNeeded);
  const landNonbasic = Math.min(landCap, nonbasicAvail);
  // Lands first (up to the target), then spells for the rest; short of spells, more lands.
  const spellSlots = need - (basics ? landCap : landNonbasic);

  /* ---- spells */
  const candidates = Object.entries(pool)
    .filter(([n, k]) => k > 0 && !isLandName(n) && info(n) && castable(n, colors))
    .map(([n, k]) => ({ name: n, left: Math.min(k, Math.max(0, maxCopies - (deck[n] ?? 0))) }))
    .filter((c) => c.left > 0);
  const reasons: Record<string, string> = {};
  const order: string[] = [];
  const creatureTarget = Math.round(15 * scale);
  const startCreatures = state.creatures;
  for (let slot = 0; slot < spellSlots; slot++) {
    const slotsLeft = spellSlots - slot;
    let best: (typeof candidates)[number] | null = null;
    let bestScore = -Infinity;
    let bestReason = '';
    for (const c of candidates) {
      if (c.left <= 0) continue;
      const n = c.name;
      const mv = mvOf(n);
      const rate = rateCard(n);
      const creature = isCreatureName(n);
      let score = rate;
      const gaps: [number, string][] = [];
      if (isRemoval(n) && state.removal < Math.round(4 * scale)) gaps.push([0.4, 'Removal']);
      if (creature && state.creatures < creatureTarget) {
        gaps.push([0.35, `Creature (you have ${startCreatures} of ~${creatureTarget})`]);
      }
      if (!creature && creatureTarget - state.creatures >= slotsLeft) score -= 3;
      const cheap = Math.round(5 * scale);
      if (mv <= 2 && state.cheap < cheap && rate >= 2)
        gaps.push([0.3, mv <= 1 ? 'Cheap play for your curve' : 'Fills your 2-drop gap']);
      if (mv === 3 && state.three < Math.round(4 * scale))
        gaps.push([0.15, 'Fills your 3-drop gap']);
      if (mv === 4 && state.four < Math.round(3 * scale)) gaps.push([0.1, 'Fills your 4-drop gap']);
      if (mv >= 5 && state.five >= Math.round(5 * scale)) score -= 1.2;
      if (mv >= 6 && state.six >= Math.round(2 * scale)) score -= 1.2;
      score += gaps.reduce((a, [b]) => a + b, 0);
      if (score > bestScore) {
        bestScore = score;
        best = c;
        gaps.sort((a, b) => b[0] - a[0]);
        bestReason =
          gaps[0]?.[1] === 'Removal'
            ? 'Removal'
            : rate >= 3.6
              ? 'Strong card in your colours'
              : (gaps[0]?.[1] ?? 'Solid playable in your colours');
      }
    }
    if (!best) break;
    best.left--;
    picked[best.name] = (picked[best.name] ?? 0) + 1;
    if (!reasons[best.name]) {
      reasons[best.name] = bestReason;
      order.push(best.name);
    }
    tally(best.name, 1);
  }
  const spellCount = Object.values(picked).reduce((a, b) => a + b, 0);

  /* ---- lands: on-colour nonbasics, then basics split by the deck's colour symbols */
  const hints: Hint[] = order.map((name) => ({
    name,
    count: picked[name]!,
    reason: reasons[name]!,
    land: false,
    tag: hintTag(reasons[name]!),
  }));
  const landSlots = Math.min(need - spellCount, basics ? need : landNonbasic);
  const lands: Record<string, { count: number; reason: string }> = {};
  let landsLeft = landSlots;
  for (const [n, k] of nonbasicLands) {
    const take = Math.min(k, landsLeft);
    if (take <= 0) continue;
    lands[n] = {
      count: take,
      reason: landColors(n).length > 1 ? 'Makes both your colours' : 'Land for your colours',
    };
    landsLeft -= take;
  }
  if (basics && landsLeft > 0 && colors.length) {
    const entries = cardEntries([
      ...Object.entries(deck),
      ...Object.entries(picked),
      ...Object.entries(lands).map(([n, v]) => [n, v.count] as const),
    ]);
    const want = autoBasics(entries, min, colors, colors);
    const added: Record<string, number> = {};
    for (; landsLeft > 0; landsLeft--) {
      const c = colors
        .slice()
        .sort(
          (a, b) =>
            want[b] -
            (deck[BASICS[b]] ?? 0) -
            (added[b] ?? 0) -
            (want[a] - (deck[BASICS[a]] ?? 0) - (added[a] ?? 0)),
        )[0]!;
      added[c] = (added[c] ?? 0) + 1;
    }
    for (const c of colors) {
      if (!added[c]) continue;
      const now = (deck[BASICS[c]] ?? 0) + added[c]!;
      lands[BASICS[c]] = {
        count: added[c]!,
        reason: `You have ${deckLands} of ~${landWant} lands (${now} ${BASICS[c]} for your ${c === colors[0] ? 'main' : 'second'} colour)`,
      };
    }
  }
  for (const [name, v] of Object.entries(lands))
    hints.push({ name, count: v.count, reason: v.reason, land: true, tag: 'Land' });
  return hints;
}
