import type { Color } from '@mtg/engine';

/**
 * Themed half-decks for Jump In!, Arena's mode where you pick two 20-card
 * packets and shuffle them together. Arena's packets use cards we haven't
 * implemented, so these are our own, built from Foundations: twelve spells
 * around a theme, one rare, plus eight basic lands of the packet's colour.
 */
export interface Packet {
  id: string;
  name: string;
  color: Color;
  /** Card shown on the packet. */
  face: string;
  blurb: string;
  /** The twelve spells; the basic lands are added by `packetCards`. */
  spells: [name: string, count: number][];
}

export const PACKET_LANDS = 8;

export const PACKETS: Packet[] = [
  {
    id: 'angels',
    name: 'Angels',
    color: 'W',
    face: 'Giada, Font of Hope',
    blurb: 'Flyers that gain life and grow each other',
    spells: [
      ["Healer's Hawk", 1],
      ['Youthful Valkyrie', 2],
      ['Dazzling Angel', 2],
      ['Inspiring Overseer', 1],
      ['Angel of Vitality', 1],
      ['Giada, Font of Hope', 1],
      ['Vanguard Seraph', 1],
      ['Serra Angel', 1],
      ['Pacifism', 1],
      ['Moment of Triumph', 1],
    ],
  },
  {
    id: 'cats',
    name: 'Cats',
    color: 'W',
    face: 'Arahbo, the First Fang',
    blurb: 'Cheap cats that pounce early and pile on',
    spells: [
      ['Savannah Lions', 1],
      ['Leonin Vanguard', 1],
      ['Helpful Hunter', 2],
      ['Dawnwing Marshal', 1],
      ["Ajani's Pridemate", 1],
      ['Arahbo, the First Fang', 1],
      ['Cat Collector', 1],
      ['Felidar Savior', 1],
      ['Valorous Stance', 1],
      ['Banishing Light', 1],
      ['Claws Out', 1],
    ],
  },
  {
    id: 'wizards',
    name: 'Wizards',
    color: 'U',
    face: 'Drake Hatcher',
    blurb: 'Cast spells, draw cards, counter theirs',
    spells: [
      ['Opt', 2],
      ['Mischievous Mystic', 2],
      ['Drake Hatcher', 1],
      ['Fog Bank', 1],
      ['Exclusion Mage', 1],
      ['Quick Study', 1],
      ['Essence Scatter', 1],
      ['Faebloom Trick', 1],
      ['Arcane Epiphany', 1],
      ['Tolarian Terror', 1],
    ],
  },
  {
    id: 'pirates',
    name: 'Pirates',
    color: 'U',
    face: 'Kiora, the Rising Tide',
    blurb: 'Slippery raiders that dig for the right card',
    spells: [
      ['Spectral Sailor', 2],
      ['Dive Down', 1],
      ['Brineborn Cutthroat', 2],
      ['Chart a Course', 1],
      ['Kiora, the Rising Tide', 1],
      ['Aegis Turtle', 1],
      ['Inspiration from Beyond', 1],
      ['Bigfin Bouncer', 2],
      ['Tolarian Terror', 1],
    ],
  },
  {
    id: 'vampires',
    name: 'Vampires',
    color: 'B',
    face: 'High-Society Hunter',
    blurb: 'Drain life and pick off their creatures',
    spells: [
      ['Vampiric Rites', 1],
      ['Stab', 1],
      ['Vampire Gourmand', 2],
      ['Sanguine Syphoner', 1],
      ['Vengeful Bloodwitch', 1],
      ['Moment of Craving', 1],
      ['Vampire Nighthawk', 1],
      ['Infernal Vessel', 1],
      ['Tribute to Hunger', 1],
      ["Hero's Downfall", 1],
      ['High-Society Hunter', 1],
    ],
  },
  {
    id: 'undead',
    name: 'Undead',
    color: 'B',
    face: 'Midnight Reaper',
    blurb: 'Creatures that keep coming back',
    spells: [
      ['Diregraf Ghoul', 2],
      ['Eaten Alive', 1],
      ['Undying Malice', 1],
      ['Reassembling Skeleton', 1],
      ['Crow of Dark Tidings', 2],
      ['Midnight Reaper', 1],
      ['Bake into a Pie', 1],
      ['Billowing Shriekmass', 1],
      ['Zombify', 1],
      ['Tragic Banshee', 1],
    ],
  },
  {
    id: 'goblins',
    name: 'Goblins',
    color: 'R',
    face: 'Krenko, Mob Boss',
    blurb: 'A swarm of goblins, and a boss who makes more',
    spells: [
      ['Fanatical Firebrand', 1],
      ['Frenzied Goblin', 1],
      ['Burst Lightning', 1],
      ['Kindled Fury', 1],
      ['Swab Goblin', 1],
      ['Courageous Goblin', 1],
      ['Dragon Fodder', 1],
      ['Raging Redcap', 1],
      ['Goblin Boarders', 1],
      ['Guttersnipe', 1],
      ['Goblin Surprise', 1],
      ['Krenko, Mob Boss', 1],
    ],
  },
  {
    id: 'dragonfire',
    name: 'Dragonfire',
    color: 'R',
    face: 'Shivan Dragon',
    blurb: 'Burn a path for a dragon',
    spells: [
      ['Ghitu Lavarunner', 1],
      ['Sure Strike', 1],
      ['Viashino Pyromancer', 1],
      ['Heartfire Immolator', 1],
      ['Firebrand Archer', 1],
      ['Scorching Dragonfire', 1],
      ['Fiery Annihilation', 1],
      ['Ball Lightning', 1],
      ['Spitfire Lagac', 1],
      ['Skyraker Giant', 1],
      ['Dragon Trainer', 1],
      ['Shivan Dragon', 1],
    ],
  },
  {
    id: 'elves',
    name: 'Elves',
    color: 'G',
    face: 'Imperious Perfect',
    blurb: 'Mana elves into a big elf army',
    spells: [
      ['Llanowar Elves', 2],
      ['Giant Growth', 1],
      ['Snakeskin Veil', 1],
      ['Thornweald Archer', 1],
      ["Dwynen's Elite", 1],
      ['Scavenging Ooze', 1],
      ['Bite Down', 1],
      ['Imperious Perfect', 1],
      ['Beast-Kin Ranger', 1],
      ['Wildheart Invoker', 1],
      ['Tajuru Pathwarden', 1],
    ],
  },
  {
    id: 'stompers',
    name: 'Stompers',
    color: 'G',
    face: 'Rampaging Baloths',
    blurb: 'Huge beasts and the mana to cast them',
    spells: [
      ['Llanowar Elves', 1],
      ['Bushwhack', 1],
      ['Giant Growth', 1],
      ['Bear Cub', 1],
      ['Eager Trufflesnout', 1],
      ['Felling Blow', 1],
      ['Gnarlback Rhino', 1],
      ['Magnigoth Sentry', 1],
      ['Needletooth Pack', 1],
      ['Elfsworn Giant', 1],
      ['Rampaging Baloths', 1],
      ['Pelakka Wurm', 1],
    ],
  },
];

const BASICS: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** A packet's full 20 cards: its spells and its basic lands. */
export function packetCards(p: Packet): [string, number][] {
  return [...p.spells, [BASICS[p.color], PACKET_LANDS]];
}
