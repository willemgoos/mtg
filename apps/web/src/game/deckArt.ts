import { type Decklist, scryfallById, slug } from '@mtg/cards';

/** Face card art: bundled Scryfall data when we have the card, else Scryfall's image redirect. */
export function artFor(d: Decklist): string {
  return (
    scryfallById.get(slug(d.face))?.image?.artCrop ??
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(d.face)}&format=image&version=art_crop`
  );
}

/** One-line pitch per deck, for the deck boxes and the deck view. */
export const BLURBS: Record<string, string> = {
  'arcane-aerialists': 'Angels and birds rule the skies while walls hold the ground.',
  'cat-attack': 'A pride of cats that grows stronger together.',
  'graveyard-gifts': 'Fill the graveyard, then bring the best of it back.',
  'learn-from-the-land': 'Ramp into extra lands and turn them into big threats.',
  'might-of-the-legion': 'Soldiers and goblins go wide and hit fast.',
  'morbid-machinations': 'Sacrifice, recycle and grind value from the graveyard.',
  'path-of-power': 'Mana elves into huge creatures with trample.',
  'reckless-raid': 'Aggressive raiders that punish every attack.',
  'vampiric-hunger': 'Vampires drain life and gain it back tenfold.',
  'wondrous-wizardry': 'Wizards and spells that feed each other.',
  'keep-the-peace': 'Soldiers, angels and lifegain. Hold the line, then take to the air.',
  'aerial-domination': 'Flyers and tricks. Control the ground, win in the skies.',
  'cold-blooded-killers': 'Removal and deathtouch. Nothing of theirs survives for long.',
  'goblins-everywhere': 'Swarm the board with Goblins and burn the rest.',
  'large-and-in-charge': 'Big green creatures, bigger with every land.',
  'brawl-mabels-militia': 'Mabel leads a hundred mice, soldiers and sparks into battle.',
  'msc-avengers-assemble':
    'Captain America rallies the Avengers: every Hero that arrives makes the team stronger.',
  'blb-forage-and-feast': 'Squirrels stash Food and forage their graveyard for value.',
  'blb-warren-rally': 'Rabbits multiply, then the whole warren charges in.',
};
