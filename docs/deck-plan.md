# Plan: Arena's Foundations Starter Decks

Target: all ten of Arena's Foundations Starter Decks (60 cards, two colours each), with the exact lists from
[mtg.wiki](https://mtg.wiki/page/Foundations_Starter_Decks). That is 167 cards we don't have yet.

Decks are paired so that each phase adds a group of engine mechanics. "New cards" counts what each deck adds once
the earlier decks are done. Blue comes last because counterspells and graveyard tricks are the hardest parts for
both the engine and the bots.

## Done criteria (every phase)

- Every card in the deck is implemented. A coverage test fails if a listed card has rules text but no behavior.
- Unit tests for each new mechanic, plus the existing random-game fuzz test passing with the new decks.
- The arena script runs the heuristic bot and the search bot on every matchup of available decks without errors, and win rates look sensible.
- The deck is playable in the web UI. Any new choice (mode, scry, search, etc.) gets an Arena-style prompt.

## Phase 1: two-colour infrastructure (no new decks) — done

Simplifications to revisit:

- Legend rule keeps the newest copy instead of asking the player.
- Scry of 2 or more: the UI can't reorder the cards kept on top. The engine supports reordering.
- Bots forget what they saw while scrying once the choice is made.
- Face cards for the deck boxes are our pick; the wiki doesn't list Arena's.

- Deck registry: decks stored as data with name, colours and face card, loaded from the wiki lists.
- Deck picker in the web UI for the player and the bot, in the style of Arena's deck selection.
- Lands that make either of two colours: Guildgates (enter tapped), gain-lands (enter tapped, gain 1 life), Temples (enter tapped, scry 1).
- Scry, including the prompt and the bot's decision.
- Legend rule.
- Bots: paying for mana with two colours, and choosing which land to play when some enter tapped.
- Card-coverage test (see the done criteria).

## Phase 2: Path of Power (Red/Green, 18 new) + Might of the Legion (Red/White, 18 new)

Aggressive decks built on colours we mostly support already.

- Modal spells ("choose one"): Bushwhack, Valorous Stance, Goblin Surprise
- Kicker: Burst Lightning
- Flashback: Bulk Up
- Searching the library for a land: Bushwhack
- Equipment: Celestial Armor (also has flash)
- Indestructible, extra combat phase (Aurelia), power/toughness based on a count (Crusader of Odric, Krenko)
- Casting from the top of the library: Vizier of the Menagerie

**Done.** Also added: Treasure and Food tokens, "you may pay" triggers (Frenzied Goblin), "activate only once", beginning-of-combat and "another creature dies" triggers.

Simplifications to revisit:

- Mild-Mannered Librarian doesn't become a Werewolf; nothing in the pool cares.
- Spinner of Souls always takes its "you may"; it can only help.
- Vizier: the UI shows your top card only when you can cast it, not all the time.

## Phase 3: Cat Attack (Green/White, 16 new) + Vampiric Hunger (White/Black, 21 new)

- Auras: Angelic Destiny, Unflinching Courage
- Exile until this leaves the battlefield: Banishing Light
- Cost reduction: Claws Out
- Lifegain triggers: Ajani's Pridemate, Elenda, Sun-Blessed Healer
- Opponent chooses what to sacrifice: Tribute to Hunger
- Destroying enchantments: Mortify

**Milestone:** four real decks covering white, black, red and green. **Remove Mono-Red Aggro and Mono-Green Stompy** once these play well.

**Done.** Mono-Red Aggro, Mono-Green Stompy and the Gruul test deck are removed; the four Arena decks are the only decks. Also added: surveil, "up to N" targets, targeting cards in graveyards (Fiendish Panda, Sun-Blessed Healer), kicker on creatures, hexproof from instants, and life-total conditions (Elenda, Twinblade Paladin).

Simplifications to revisit:

- Angelic Destiny doesn't make the creature an Angel.
- An Aura put onto the battlefield without being cast (none can be yet) goes straight to the graveyard instead of asking what to attach to.
- The "starting life total" for Elenda is fixed at 20.
- The old red and green cards not used by any Arena deck (Shivan Dragon, Seismic Rupture, etc.) are still in the pool and tests; they are harmless but could be pruned.

## Phase 4: Reckless Raid (Black/Red, 16 new) + Morbid Machinations (Black/Green, 15 new)

- Returning cards from the graveyard: Alesha, Reassembling Skeleton
- Milling, and effects that care about the graveyard: Scavenging Ooze, Infestation Sage
- Death and sacrifice triggers: Midnight Reaper, Vampire Gourmand
- -X/-X effects: Massacre Wurm
- Treasure and artifacts: Strongbox Raider, Abrade

**Done.** Also added: morbid, granted "when this dies, return it" (Undying Malice, Fake Your Own Death), abilities from the graveyard (Reassembling Skeleton), sacrifice as a cost (Eaten Alive, Vampiric Rites), modal triggers (Wardens of the Cycle), "sacrifice, discard or lose life" (Perforating Artist), cards playable from exile (Strongbox Raider), can't be blocked, ward {2}, and Quilled Greatwurm's cast-from-graveyard.

Simplifications to revisit:

- Ward is charged up front as an extra {2} when targeting, instead of a trigger that counters the spell unless paid. A mandatory trigger that can't pay just doesn't happen.
- "You may sacrifice another creature" (Vampire Gourmand, High-Society Hunter) is chosen as the trigger goes on the stack, like a target.
- Quilled Greatwurm removes counters automatically, from the creatures with the most first.

## Phase 5: Learn From the Land (Green/Blue, 14 new) + Arcane Aerialists (White/Blue, 16 new)

- Blue arrives here.
- Flash, and bouncing permanents back to hand: Exclusion Mage
- Extra land plays and landfall: Tatyova, Loot, Mossborn Hydra
- Looking at and choosing from the top of the library: Curator of Destinies
- Tapping creatures: Faebloom Trick

**Done.** Also added: bounce, tapping, "cast as though it had flash" (High Fae Trickster), extra land drops and looking at the top six (Loot), searching for lands or Gates onto the battlefield (Circuitous Route), discarding as an effect (Chart a Course), Curator of Destinies' piles, second-draw triggers (Mischievous Mystic), combat damage prevention (Fog Bank), Angel-only mana and entering counters (Giada), and flyer/Angel anthems.

Simplifications to revisit:

- Empyrean Eagle only pumps creatures with printed flying (not flying from Equipment or Auras).
- Faebloom Trick's "tap target creature" is chosen when casting, instead of as a reflexive trigger on resolution.
- Giada's extra counters only apply to Angels that are cast, not ones put onto the battlefield another way.
- Curator of Destinies' "can't be countered" has no effect until counterspells exist (Phase 6).

## Phase 6: Wondrous Wizardry (Blue/Red, 15 new) + Graveyard Gifts (Blue/Black, 18 new)

- Counterspells: Essence Scatter. The bots have to learn to hold mana up and to respond.
- Triggers on casting a noncreature spell: Archmage of Runes, Balmor
- Ward: Tolarian Terror
- Returning creatures from the graveyard to the battlefield: Zombify, Rise of the Dark Realms
- Threshold

**Done.** All ten Arena decks are playable. Also added: spells on the stack as targets, "can't be countered", mill, threshold and other graveyard counts, reanimation, token copies (Abyssal Harvester), cheaper instants and sorceries, ward with a life cost (Ovika), named counters (Drake Hatcher's incubation), noncombat-damage draws (Niv-Mizzet), no maximum hand size, the opponent discarding, and a mandatory sacrifice cost (Arbiter of Woe).

Simplifications to revisit:

- The bots counter spells when they can, but don't hold mana up on purpose to do it.
- Fiery Annihilation's second target can be any Equipment, not only one attached to the creature.
- Kiora's Scion of the Deep and Spinner-style "you may" effects are always taken.
- Incubation counters aren't shown on the card in the UI yet.
- Graveyard Gifts and Learn From the Land are the weakest decks for the bots: they don't plan graveyard or ramp synergies.

## Phase 7: Arena's Color Challenge decks (mono-colour, the decks Sparky plays)

Lists from https://mtg.wiki/page/Color_Challenge_decks (the upgraded 60-card lists; sideboards left out). Arena-only cards come from Scryfall's digital Arena Beginner Set (`anb`).

**7a: Keep the Peace (W), Goblins Everywhere! (R), Large and in Charge (G): done.** Added: lure (Prized Unicorn), tokens entering tapped and attacking (Leonin Warleader), extra life gain (Angel of Vitality), Pacifism, "becomes blocked" and "whenever a small creature attacks" triggers, cast restrictions (Confront the Assault), sacrificing a Goblin as a cost, two-mana sources (Ilysian Caryatid), same-name references (Charmed Stray, Baloth Packhunter, Goblin Gathering) and World Shaper's land return.

Simplifications: Ilysian Caryatid's two mana may be of different colours; lure is enforced by moving blockers onto the lure creature when blocks are confirmed.

**7b: Aerial Domination (U), Cold-Blooded Killers (B): to do.**

## Phase 8: Bloomburrow (BLB), a second set

Our own two-colour decks built like the starter decks (36 spells, 24 lands), shown in their own deck section but matched against the Foundations starter decks. Card behaviour lives in `packages/cards/src/blb/` (one file per pair of animal decks, plus others, Seasons and mythics), merged in `bloomburrow.ts`.

**8a: mechanics + Forage and Feast (B/G Squirrels) and Warren Rally (G/W Rabbits): done.** Added: offspring (kicker that makes a 1/1 token copy), gift (a free kicker; the opponent gets a card, Food or tapped Fish first), forage (as a cost or "you may forage", choosing which three graveyard cards to exile), expend (mana spent per turn), valiant, "when you sacrifice" triggers, and a few counts and conditions. Bot-vs-bot: about 55% and 49% against the ten Foundations starter decks.

Simplifications: Wick's Patrol picks its target before milling; Curious Forager's return isn't targeted; Valley-style "one or more enter" batching isn't modelled (no such card yet).

**8b: the other eight animal decks: done.** Night Flight (W/B Bats), Valiant Squeak (R/W Mice), Scorching Scales (B/R Lizards), Rat Pack (U/B Rats), Otter Antics (U/R Otters), Lilypad Leap (G/U Frogs), Sky Flock (W/U Birds) and Raccoon Rumble (R/G Raccoons). Added Classes, hybrid mana, X costs, a mana pool, delayed triggers, casting from other zones, token and spell copies, control changes, stun and finality counters, changeling and ward variants.

**8c: every rare and mythic, then Bloomburrow boosters: done.** Planeswalkers (Ral, Crackling Wit with its emblem; creatures can attack planeswalkers), the Season cycle's pawprint modes, Ygra, Kitsa, Maha and the rest. Expedition with a Bloomburrow deck opens Bloomburrow boosters; Season sells both boosters and the Bloomburrow decks as starters.

Bot-vs-bot over 160 games against the ten Foundations starter decks: Forage and Feast 53%, Warren Rally 55%, Night Flight 59%, Valiant Squeak 52%, Scorching Scales 60%, Rat Pack 55%, Otter Antics 52%, Lilypad Leap 47%, Sky Flock 44%, Raccoon Rumble 65%.

More simplifications: Portent of Calamity takes one card per type; ward costs that discard or sacrifice Food pick automatically; copies keep their targets; bots don't attack planeswalkers; Rottenmouth Viper's sacrifices and tapped tokens are picked automatically; Fecund Greenshell always puts the land onto the battlefield; Helga's mana can mix colours.

## Phases 9 and 10: Marvel Super Heroes

The four Commander precons as Brawl decks (9a to 9e), then the MSH main set like Bloomburrow (10). See `docs/marvel-plan.md`.

**Phase 9 done:** Brawl with its own mode and deck picker, and all four Marvel Super Heroes Commander precons (Avengers
Assemble, Wakanda Forever, The Fantastic Four, Doom Prevails) played as printed, plus our test deck Mabel's Militia. Bot
win rates between the precons are within 35–65% except The Fantastic Four's two hardest matchups (33% and 30%); details
and simplifications in `docs/marvel-plan.md`.

## Phases 11 and 12: Final Fantasy

The Final Fantasy (FIN) main set like Bloomburrow and MSH (11a to 11d: mechanics and the first two decks, the other
eight decks, every rare and mythic with Jump In and boosters, then the Starter Kit), then the Final Fantasy Commander
decks as Brawl, as Arena sells them (12a to 12g). See `docs/final-fantasy-plan.md`.

**Phases 11 and 12 done:** all 293 FIN booster cards and the Starter Kit's 12 exclusives, with job select, tiered, Saga
creatures, Towns, Adventure lands, meld and hideaway. Ten FIN decks of our own (45–53% against the Foundations starter
decks), the two Starter Kit decks (Cloud 61%, Sephiroth 57%), ten FIN Jump In packets, FIN boosters in Expedition and
Season, and the seven Arena FIC Brawl decks (39–64% among the Brawl decks). Details and simplifications in
`docs/final-fantasy-plan.md`.

## Notes

- Some cards will turn out to be one-offs. Put them in `custom` handlers instead of growing the engine vocabulary for a single card.
- If a phase is too big for one pass, ship one deck at a time. The decks within a phase are independent.
