import { SCRYFALL, type ScryfallCard } from '@mtg/cards';
import { manaValue } from './deckView.ts';

/*
 * A pick-order style rating for Limited: how good a card is in a 40-card deck,
 * judged from what it does rather than how rare it is. The scale is rough:
 *
 *   1.5  filler you'd rather not play        3.0  solid playable
 *   2.5  a vanilla creature on curve         4.0  premium removal or a great creature
 *   0    lands and unknown cards             4.5+ bombs
 *
 * It reads the Scryfall record only (cost, type, text, stats, keywords), so it
 * works for every set without per-card tables. It is a heuristic: good enough
 * to build a deck a person would not laugh at, not a solver.
 */

const byName = new Map(SCRYFALL.map((c) => [c.name, c]));

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, x: 2 };
const num = (s: string | undefined): number =>
  s === undefined ? 0 : (NUMBERS[s.toLowerCase()] ?? (Number.parseInt(s, 10) || 0));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Bonus for each keyword a creature has (more for ones that win games in Limited). */
const KEYWORD_VALUE: Record<string, number> = {
  Flying: 0.5,
  Menace: 0.25,
  Trample: 0.15,
  Deathtouch: 0.35,
  Lifelink: 0.3,
  'First strike': 0.25,
  'Double strike': 0.7,
  Vigilance: 0.1,
  Haste: 0.1,
  Ward: 0.2,
  Reach: 0.05,
  Hexproof: 0.15,
  Indestructible: 0.3,
  Flash: 0.1,
  Defender: -0.5,
};

/** The oracle text with the card's own name made generic, lower-cased. */
function textOf(c: ScryfallCard): string {
  const first = c.name.split(' // ')[0]!;
  return (c.oracleText ?? '').split(first).join('~').toLowerCase();
}

/** Value of the spell effects in the text: removal, card advantage and so on. */
function effects(fullText: string, mv: number, isCreature: boolean): number {
  let v = 0;
  let removal = 0;
  // Activated abilities ("{T}: ...", "{7}, sacrifice: ...") cost mana every time: they count for a little.
  const lines = fullText.split('\n');
  const activated = lines.filter((l) => /^(?:\{[^}]+\}|sacrifice|discard|pay)[^.]*?:/.test(l));
  const text = lines.filter((l) => !activated.includes(l)).join('\n');
  if (activated.some((l) => /damage|destroy|exile|draw|create|-\d\/-\d/.test(l))) v += 0.3;

  // Clean removal. Conditions on the target make it narrower.
  const kill = text.match(/(?:destroy|exile) target ([^.,;]*)/);
  if (kill) {
    const t = kill[1]!;
    if (
      /creature|nonland permanent|planeswalker|permanent/.test(t) &&
      !/^(?:artifact|enchantment|land)/.test(t) &&
      !/you control/.test(t)
    ) {
      removal = 1.4;
      if (
        /with |tapped|power \d|mana value|nonblack|nonwhite|nongreen|nonred|nonblue|attacking|blocking/.test(
          t,
        )
      )
        removal -= 0.5;
    }
  }
  if (/destroy all creatures|each creature gets -\d\/-\d/.test(text))
    removal = Math.max(removal, 0.3);

  // Damage: scaled by how much, and what it costs.
  const dmg = text.match(
    /deals (\d+|x) damage to (target creature|any target|up to one target|target [^.,]*)/,
  );
  if (dmg && !/each (?:other )?creature/.test(dmg[0])) {
    const n = dmg[1] === 'x' ? 3 : Number(dmg[1]);
    const anyTarget = /any target/.test(dmg[2]!);
    const hitsCreature = anyTarget || /creature/.test(dmg[2]!);
    if (hitsCreature) {
      let d = 0.5 + 0.25 * Math.min(n, 5) + (anyTarget ? 0.1 : 0);
      d -= 0.1 * Math.max(0, mv - n); // paying a lot for a little
      removal = Math.max(removal, d);
    }
  }
  // -N/-N on a target kills small things; the bigger the N the better.
  const shrink = text.match(/target [^.]*gets [+-]?(\d+)\/-(\d+)/);
  if (shrink && /creature/.test(shrink[0]))
    removal = Math.max(removal, 0.4 + 0.25 * Math.min(Number(shrink[2]), 5));
  // One-sided sweeps: your opponents' creatures shrink.
  const sweep = text.match(/creatures your opponents control get -(\d)\/-(\d)/);
  if (sweep) removal = Math.max(removal, 0.5 + 0.3 * Number(sweep[2]));
  // Fights and bites need a creature of your own.
  if (
    /fights? (?:up to one )?target|deals damage equal to (?:its|~'s|this creature's) power to target/.test(
      text,
    )
  )
    removal = Math.max(removal, 0.9);
  // Auras that neutralise a creature.
  if (
    /enchanted creature can't attack or block|enchanted creature doesn't untap|enchanted permanent can't attack/.test(
      text,
    )
  )
    removal = Math.max(removal, 1.2);
  // Bounce and tapping are tempo, not removal.
  if (/return target (?:creature|nonland permanent|permanent)[^.]* to its owner's hand/.test(text))
    removal = Math.max(removal, 0.5);
  if (/tap target creature/.test(text))
    removal = Math.max(removal, text.includes("doesn't untap") ? 0.6 : 0.3);
  // Taking a creature: Threaten effects are worth little, steal effects a lot.
  if (/gain control of target creature/.test(text))
    removal = Math.max(removal, /until end of turn/.test(text) ? 0.2 : 1.4);
  v += removal;

  // Card advantage.
  const draws = [...text.matchAll(/(?:you )?draw (a|an|one|two|three|x) cards?/g)]
    .filter(
      (m) =>
        !/(?:opponent|player|each) $/.test(text.slice(Math.max(0, m.index! - 12), m.index)) &&
        !/(?:opponent|player) draws/.test(m[0]),
    )
    .reduce((k, m) => k + num(m[1]), 0);
  v += 0.3 * Math.min(draws, 3);
  if (/\bscry \d|surveil \d|look at the top/.test(text)) v += 0.1;
  const tokens = [...text.matchAll(/create (a|an|one|two|three|four|x) [^.]*?token/g)].reduce(
    (k, m) => k + num(m[1]),
    0,
  );
  v += 0.25 * Math.min(tokens, 3);
  if (/return [^.]*from your graveyard to (?:your hand|the battlefield)/.test(text)) v += 0.35;
  if (/search your library for [^.]*(?:creature|card)/.test(text) && !/basic land/.test(text))
    v += 0.2;
  if (/when ~ enters|when ~ dies|whenever ~ attacks/.test(text)) v += 0.15; // ETB / death value
  if (
    /at the beginning of (?:your|each) (?:upkeep|end step)[^.]*(?:draw|create|put a|you gain|each opponent loses)/.test(
      text,
    )
  )
    v += 0.3;
  // Mana on a creature or rock helps a little.
  if (/add (?:one mana of any color|\{[wubrgc]\})/.test(text)) v += isCreature ? 0.2 : 0.1;

  // Narrow or costly drawbacks.
  if (/counter target/.test(text)) v -= 0.3; // reactive and awkward to hold up mana for
  if (
    /sacrifice (?:a|another|two) (?:creature|permanent)|as an additional cost[^.]*sacrifice/.test(
      text,
    )
  )
    v -= 0.3;
  if (/can't block|can't attack/.test(text) && isCreature) v -= 0.3;
  if (/(?:you|~) (?:lose|loses|pay) \d life|discard (?:a|two) cards?\./.test(text)) v -= 0.15;
  if (/sacrifice ~ at|sacrifice it at the beginning|you skip/.test(text)) v -= 0.5;
  return v;
}

const cache = new Map<string, number>();

/** Rates a card by name; 0 for lands and anything unknown. Higher is better. */
export function rateCard(name: string): number {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const r = compute(name);
  cache.set(name, r);
  return r;
}

function compute(name: string): number {
  const c = byName.get(name);
  if (!c) return 0;
  // A back face is rated as the card it belongs to.
  if (c.front && c.front !== name) return rateCard(c.front);
  const type = c.typeLine ?? '';
  if (type.includes('Land') && !c.adventure) return 0;

  const mv = manaValue(c.manaCost ?? '');
  const text = textOf(c);
  const creature = type.includes('Creature');
  const rare = c.rarity === 'rare' || c.rarity === 'mythic';
  const keywords = new Set(c.keywords ?? []);
  const power = Number.parseInt(c.power ?? '', 10);
  let r: number;

  if (type.includes('Planeswalker')) {
    // Walkers that make things or kill are bombs; the loyalty hints at power.
    r =
      3.6 +
      0.08 * (Number(c.loyalty) || 3) +
      effects(text, mv, false) * 0.5 -
      0.1 * Math.max(0, mv - 5);
  } else if (creature) {
    const t = Number.parseInt(c.toughness ?? '', 10);
    const pw = Number.isNaN(power) ? Math.max(1, mv - 1) : power; // */* creatures: assume about average
    const tf = Number.isNaN(t) ? Math.max(1, mv - 1) : t;
    // Stats against cost: 2 mana for 2/2 and 4 for 4/4 is par.
    const par = Math.max(mv, 1) * 2;
    r = 2.5 + clamp((pw + tf - par) * 0.12, -0.7, 0.7) + (pw >= 3 ? 0.05 * (pw - 3) : 0);
    if (mv <= 1) r -= 0.2; // one-drops fall off
    if (mv >= 6) r -= 0.15 * (mv - 5); // a lot of mana for a body
    for (const k of keywords) {
      let bonus = KEYWORD_VALUE[k] ?? 0;
      // Evasion is worth more on a big body; keywords on a 0-power creature do little.
      if (k === 'Flying' || k === 'Menace' || k === 'Trample')
        bonus *= clamp(0.6 + pw * 0.2, 0.6, 1.4);
      if (pw === 0 && bonus > 0) bonus *= 0.3;
      r += bonus;
    }
    r += effects(text, mv, true);
    if (c.adventure || c.back) r += 0.3; // two cards in one
    if (c.prepare) r += 0.3;
  } else if (type.includes('Instant') || type.includes('Sorcery')) {
    r = 2.3 + effects(text, mv, false);
    // Combat tricks and pure lifegain are the weakest kind of playable.
    if (/gets? \+\d\/\+\d until end of turn|gains? [^.]* until end of turn/.test(text)) r -= 0.1;
    if (r < 2.5 && /gain \d+ life/.test(text) && !/draw|damage|create|destroy|exile/.test(text))
      r -= 0.5;
    if (/destroy all|each creature/.test(text)) r -= 0.2; // wraths don't suit a creature deck
    if (mv >= 6) r -= 0.2 * (mv - 5);
    if (c.adventure || c.back) r += 0.1;
  } else if (type.includes('Vehicle')) {
    const p = power || 2;
    const t = Number.parseInt(c.toughness ?? '', 10) || 2;
    r =
      2.3 +
      clamp((p + t - mv * 2) * 0.1, -0.5, 0.5) +
      effects(text, mv, true) +
      (keywords.has('Flying') ? 0.4 : 0);
  } else if (type.includes('Aura') || type.includes('Enchantment')) {
    r = type.includes('Aura') ? 2.1 : 2.4;
    r += effects(text, mv, false);
    if (type.includes('Aura') && /enchanted creature gets \+\d\/\+\d/.test(text)) r += 0.1;
  } else {
    // Equipment, other artifacts: rocks and utility.
    r = 2.3 + effects(text, mv, false) + (/equipped creature gets \+\d\/\+\d/.test(text) ? 0.2 : 0);
    if (mv >= 5) r -= 0.2;
  }

  // Bombs: a rare or mythic that wins the game alone.
  if (
    creature &&
    rare &&
    power >= 4 &&
    (keywords.has('Flying') || keywords.has('Menace') || keywords.has('Trample'))
  )
    r += 0.5;
  if (type.includes('Planeswalker') && rare) r += 0.4;
  // Rarity breaks ties between otherwise equal cards.
  r += { common: 0, uncommon: 0.05, rare: 0.12, mythic: 0.2 }[c.rarity] ?? 0;
  return clamp(r, 0.5, 5);
}

/** True for creature cards (including adventure and double-faced ones). */
export const isCreatureCard = (name: string): boolean =>
  byName.get(name)?.typeLine?.includes('Creature') ?? false;
