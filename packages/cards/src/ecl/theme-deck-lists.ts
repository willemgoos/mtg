import type { Decklist } from '../decks.ts';

/**
 * Lorwyn Eclipsed (18c): Arena's two Theme Decks (January 2026), lists from
 * https://mtg.wiki/page/Lorwyn_Eclipsed/Theme_Decks. Shown with the other Lorwyn Eclipsed decks (series 'starter', like the
 * Final Fantasy Starter Kit's decks). See docs/lorwyn-eclipsed-plan.md.
 */
export const ECL_THEME_DECKS: Decklist[] = [
  {
    id: 'ecl-theme-pirates',
    name: 'Pirates',
    colors: ['U', 'R'],
    face: 'Captain Howler, Sea Scourge',
    source: 'arena',
    series: 'starter',
    set: 'ecl',
    cards: [
      ['Captain Howler, Sea Scourge', 2],
      ['Fearless Swashbuckler', 3],
      ['Inti, Seneschal of the Sun', 3],
      ['Marauding Mako', 4],
      ['Scrounging Skyray', 4],
      ['Spyglass Siren', 4],
      ['Staunch Crewmate', 2],
      ['Broadside Barrage', 2],
      ['Burst Lightning', 4],
      ['Spell Snare', 2],
      ['Gastal Thrillroller', 1],
      ['Subterranean Schooner', 3],
      ['Magmatic Galleon', 2],
      ['Secluded Courtyard', 4],
      ['Swiftwater Cliffs', 4],
      ['Island', 8],
      ['Mountain', 8],
    ],
  },
  {
    id: 'ecl-theme-angels',
    name: 'Angels',
    colors: ['W', 'G'],
    face: 'Lyra Dawnbringer',
    source: 'arena',
    series: 'starter',
    set: 'ecl',
    cards: [
      ['Chomping Changeling', 1],
      ['Exemplar of Light', 3],
      ['Giada, Font of Hope', 4],
      ['Inspiring Overseer', 4],
      ['Llanowar Elves', 4],
      ['Lightstall Inquisitor', 2],
      ['Lyra Dawnbringer', 2],
      ['Pawpatch Recruit', 1],
      ['Starfield Shepherd', 4],
      ['Youthful Valkyrie', 4],
      ['Get Lost', 1],
      ['Personify', 2],
      ["Ride's End", 2],
      ['Split Up', 2],
      ['Blossoming Sands', 4],
      ['Secluded Courtyard', 4],
      ['Plains', 8],
      ['Forest', 8],
    ],
  },
];
