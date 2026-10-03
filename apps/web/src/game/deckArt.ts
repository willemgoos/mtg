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
  'msc-wakanda-forever': 'T’Challa builds a Vibranium arsenal and rules as the monarch.',
  'msc-the-fantastic-four':
    'Invisible Woman leads the family: every spell you cast powers up the team.',
  'msc-doom-prevails':
    'Doctor Doom schemes with an army of Villains, conniving his way to victory.',
  'msc-avengers-assemble':
    'Captain America rallies the Avengers: every Hero that arrives makes the team stronger.',
  'blb-forage-and-feast': 'Squirrels stash Food and forage their graveyard for value.',
  'blb-warren-rally': 'Rabbits multiply, then the whole warren charges in.',
  'blb-hare-raising': 'The Starter Kit’s Rabbits: counters and tokens that grow the team.',
  'blb-otter-limits': 'The Starter Kit’s Otters: cheap spells that power up the board.',
  'blb-night-flight': 'Bats and clerics drain life from above and fell what is left.',
  'blb-valiant-squeak': 'Mice get valiant with tricks and swing in for big damage.',
  'blb-scorching-scales': 'Lizards hit hard with offspring and burn what blocks them.',
  'blb-rat-pack': 'A swarm of rats gets bigger and sneakier the more there are.',
  'blb-otter-antics': 'Otters cast cheap spells to grow and fling damage at the foe.',
  'blb-lilypad-leap': 'Frogs bounce around and bring back creatures to refill the board.',
  'blb-sky-flock': 'Birds peck from the air while spells keep the ground safe.',
  'blb-raccoon-rumble': 'Raccoons and boars bring Treasure and big hits to every fight.',
  'msh-heroes-unite': 'Red and white Heroes team up and strike with every Team-Up.',
  'msh-villainous-schemes': 'Villains and HYDRA agents scheme with removal and card draw.',
  'msh-gamma-smash': 'Smash with giant green creatures and burn spells, led by Hulk.',
  'msh-heroes-of-wakanda': 'Wakandan Heroes and big cats grow with +1/+1 counters.',
  'msh-lone-agents': 'Spies and soldiers pick off blockers and win with Black Widow.',
  'msh-hydra-rising': 'HYDRA agents and burn spells take over the Marvel underworld.',
  'msh-stark-tech': 'Iron Man, drones and spells build a flying Stark tech army.',
  'msh-sky-patrol': 'Flying Heroes and tricks win in the air, led by Falcon.',
  'msh-growing-pains': 'Ant-Man and friends grow bigger and bigger each turn.',
  'msh-savage-uprising': 'Killmonger rallies savage villains with removal and big bodies.',
  'fin-heroes-arsenal': 'Equip heroes with weapons and strike with white and red magic.',
  'fin-eidolons-call': 'Summon mighty Eidolons and Sagas that make big green and white plays.',
  'fin-highwind-workshop': 'Cid builds artifacts and fliers that take over the skies.',
  'fin-time-compression': 'Time-bending spells and dire rats grind out the game.',
  'fin-black-mages-waltz': 'Black Mages and fire magic burn and drain the board away.',
  'fin-chocobo-stampede': 'Chocobos and big beasts stampede over the opposing board.',
  'fin-turks-contract': 'Soldiers and Turks take out the best creatures with black magic.',
  'fin-forbidden-magicks': 'Shantotto casts spells and magic to wipe the table clean.',
  'fin-into-the-void': 'Exdeath rules with black and green monsters and a big void.',
  'fin-road-trip': 'Ride the Road Trip with frogs, summons and Ignis in the lead.',
  'fin-starter-cloud': 'Cloud and his party of heroes chop up foes with swords.',
  'fin-starter-sephiroth': 'Sephiroth and a swarm of rats grind the opposing deck down.',
  'fic-revival-trance': 'Terra calls up spells from the graveyard in a three-colour deck.',
  'fic-limit-break': 'Cloud builds up for a mighty Limit Break with gear and big creatures.',
  'fic-counter-blitz': 'Tidus piles on counters and goes wide with green, white and blue.',
  'fic-scions-spellcraft': 'Y’shtola casts spells and drains life with a white-blue-black plan.',
  'fic-brawl-aerith': 'Aerith heals and grows a big green and white lifegain board.',
  'fic-brawl-emet-selch': 'Emet-Selch controls with blue and black tricks and card draw.',
  'fic-brawl-locke': 'Locke steals treasures and burns the board with black and red.',
};
