# Strixhaven 13a: Lorehold and Quandrix decks

Data from Scryfall oracle text (STX boosters plus STX Lessons). No FDN reprints used. Difficulty: S simple/keywords, M needs a
trigger or effect that probably exists (or the planned 13a vocabulary: magecraft, learn), L likely new engine work.
Already implemented (exact name outside `generated/`): only Rip Apart (msc/avengers.ts); everything else is new.
Learn cards are M because of the new learn prompt and sideboard, not because of the card itself.

## Deck 1: Lorehold Reckoning (R/W)

Game plan: curve out with cheap magecraft creatures and Spirit tokens, then cast burn, tricks and Learn spells to pump them while
Illustrious Historian, Pillardrop Rescuer and Returned Pastcaller turn the graveyard into card advantage. Burn and Expel handle blockers.

**Creatures (25):** Eager First-Year 3, Lorehold Pledgemage 3, Professor of Symbology 2, Stonerise Spirit 2, Lorehold Apprentice 2,
Illustrious Historian 2, Combat Professor 2, Pillardrop Rescuer 2, Twinscroll Shaman 2, Returned Pastcaller 1, Quintorius,
Field Historian 1, Storm-Kiln Artist 1, Pillardrop Warden 1, Tome Shredder 1.
**Spells (18):** Rip Apart 2, Igneous Inspiration 3, Heated Debate 2, Expel 2, Make Your Mark 2, Pigment Storm 1, Lorehold Command 1,
Beaming Defiance 1, Study Break 1, Academic Dispute 1, Enthusiastic Study 1, Guiding Voice 1.
**Lands (17):** Lorehold Campus 4, Plains 7, Mountain 6.
**Curve (43 non-land):** MV1 4, MV2 15, MV3 14, MV4 4, MV5 5, MV6 1.

**Lesson sideboard (5):** Spirit Summoning, Reduce to Memory, Start from Scratch, Introduction to Prophecy, Expanded Anatomy.

| Card | # | Rarity | Diff | Note |
|---|---|---|---|---|
| Eager First-Year | 3 | C | M | magecraft +1/+0 until end of turn |
| Lorehold Pledgemage | 3 | C | M | first strike, magecraft pump; hybrid cost |
| Professor of Symbology | 2 | U | M | ETB learn |
| Stonerise Spirit | 2 | C | M | flying; exile-from-graveyard cost grants flying |
| Lorehold Apprentice | 2 | U | L | magecraft grants Spirits a temporary "{T}: 1 damage to each opponent" |
| Illustrious Historian | 2 | C | M | activated from graveyard, tapped Spirit token |
| Combat Professor | 2 | C | M | flying; beginning-of-combat +1/+0 and vigilance |
| Pillardrop Rescuer | 2 | C | M | flying; ETB return creature MV 3 or less |
| Twinscroll Shaman | 2 | C | S | double strike |
| Returned Pastcaller | 1 | U | M | flying; return Spirit/instant/sorcery; hybrid in cost |
| Quintorius, Field Historian | 1 | U | L | needs a "cards leave your graveyard" event; Spirits +1/+0 |
| Storm-Kiln Artist | 1 | U | M | +1/+0 per artifact; magecraft makes Treasure |
| Pillardrop Warden | 1 | C | M | reach; sorcery-speed sacrifice to return instant/sorcery |
| Tome Shredder | 1 | C | M | haste; exile instant/sorcery from graveyard as cost |
| Rip Apart | 2 | U | S | already implemented |
| Igneous Inspiration | 3 | U | M | 3 damage any target, learn |
| Heated Debate | 2 | C | S | 4 damage, can't be countered |
| Expel | 2 | C | S | exile target tapped creature |
| Make Your Mark | 2 | C | M | hybrid; delayed "dies this turn" Spirit token |
| Pigment Storm | 1 | C | M | excess damage to controller |
| Lorehold Command | 1 | R | M | choose two of four modes |
| Beaming Defiance | 1 | C | S | +2/+2 and hexproof |
| Study Break | 1 | C | M | tap up to two, learn |
| Academic Dispute | 1 | U | M | must block, optional reach, learn |
| Enthusiastic Study | 1 | C | M | +3/+1 trample, learn |
| Guiding Voice | 1 | C | M | +1/+1 counter, learn |
| Lorehold Campus | 4 | C | S | tapped dual, {4},{T} scry 1 |
| Plains / Mountain | 7 / 6 | - | S | basics |
| Sideboard: Spirit Summoning | 1 | C | M | hybrid cost, 3/2 Spirit token |
| Sideboard: Reduce to Memory | 1 | U | M | exile permanent, controller gets Spirit |
| Sideboard: Start from Scratch | 1 | U | M | modal 1 damage / destroy artifact |
| Sideboard: Introduction to Prophecy | 1 | C | S | scry 2, draw |
| Sideboard: Expanded Anatomy | 1 | C | S | two counters, vigilance |

## Deck 2: Quandrix Equation (G/U)

Game plan: ramp with Field Trip, Cultivator and Zimone, and grow Fractal tokens and magecraft creatures with +1/+1 counters. Leyline
Invocation and Serpentine Curve make big Fractals late while Frost Trickster, Waterfall Aerialist and Needlethorn Drake fly over.

**Creatures (22):** Biomathematician 3, Quandrix Pledgemage 3, Quandrix Apprentice 2, Needlethorn Drake 2, Frost Trickster 2,
Waterfall Aerialist 2, Karok Wrangler 2, Quandrix Cultivator 1, Zimone, Quandrix Prodigy 1, Professor of Zoomancy 1,
Springmane Cervin 1, Overgrown Arch 1, Archmage Emeritus 1. (Counts above sum to 22.)
**Spells (21):** Leyline Invocation 2, Serpentine Curve 2, Field Trip 2, Pop Quiz 2, Big Play 2, Quandrix Command 1, Eureka Moment 1,
Mage Duel 1, Decisive Denial 1, Devouring Tendrils 1, Divide by Zero 1, Resculpt 1, Arcane Subtraction 1, Curate 1, Bury in Books 1,
Reject 1.
**Lands (17):** Quandrix Campus 4, Forest 7, Island 6.
**Curve (43 non-land):** MV1 0, MV2 14, MV3 16, MV4 8, MV5 3, MV6 2.

**Lesson sideboard (4):** Fractal Summoning, Introduction to Prophecy, Expanded Anatomy, Environmental Sciences.

| Card | # | Rarity | Diff | Note |
|---|---|---|---|---|
| Biomathematician | 3 | C | M | Fractal 0/0 token, then +1/+1 counter on each Fractal you control |
| Quandrix Pledgemage | 3 | C | M | magecraft +1/+1 counter; hybrid cost |
| Quandrix Apprentice | 2 | U | M | magecraft: look at top 3, take a land, rest on bottom in any order |
| Needlethorn Drake | 2 | C | S | flying, deathtouch |
| Frost Trickster | 2 | C | M | flying; ETB tap, doesn't untap next untap step |
| Waterfall Aerialist | 2 | C | S | flying, ward {2} (check ward exists) |
| Karok Wrangler | 2 | U | M | magecraft counter on target creature |
| Quandrix Cultivator | 1 | U | M | ETB search Forest or Island onto battlefield |
| Zimone, Quandrix Prodigy | 1 | U | M | land from hand to battlefield; draw, two with 8+ lands |
| Professor of Zoomancy | 1 | C | M | Pest token (dies: gain 1 life) |
| Springmane Cervin | 1 | C | S | ETB gain 2 |
| Overgrown Arch | 1 | U | M | defender, tap gain 1, sacrifice for learn |
| Archmage Emeritus | 1 | R | M | magecraft draw |
| Leyline Invocation | 2 | C | M | Fractal with X = lands you control |
| Serpentine Curve | 2 | C | M | X = 1 + instants/sorceries in your graveyard and exile |
| Field Trip | 2 | C | M | basic Forest tapped, learn |
| Pop Quiz | 2 | C | M | draw, learn |
| Big Play | 2 | C | S | +2/+2, reach, +1/+1 counter |
| Quandrix Command | 1 | R | M | choose two of four, incl. shuffle graveyard mode |
| Eureka Moment | 1 | C | S | draw two, optional land drop |
| Mage Duel | 1 | C | M | conditional cost reduction, +1/+2 then fight |
| Decisive Denial | 1 | U | M | modal: fight / counter noncreature unless pay {3} |
| Devouring Tendrils | 1 | U | M | one-sided bite, gain 2 if it dies this turn |
| Divide by Zero | 1 | U | M | bounce spell or permanent (MV 1+), learn |
| Resculpt | 1 | C | M | exile, controller gets 4/4 blue-red Elemental |
| Arcane Subtraction | 1 | C | M | -4/-0, learn |
| Curate | 1 | C | M | surveil 2, draw |
| Bury in Books | 1 | C | M | conditional cost, put second from top |
| Reject | 1 | C | M | counter creature spell unless pay {3}, exile instead |
| Quandrix Campus | 4 | C | S | tapped dual, {4},{T} scry 1 |
| Forest / Island | 7 / 6 | - | S | basics |
| Sideboard: Fractal Summoning | 1 | C | M | X spell, hybrid cost |
| Sideboard: Introduction to Prophecy | 1 | C | S | scry 2, draw |
| Sideboard: Expanded Anatomy | 1 | C | S | two counters, vigilance |
| Sideboard: Environmental Sciences | 1 | C | S | fetch basic land, gain 2 |

## Totals and risks

Lorehold: 29 distinct main-deck names (26 non-basic) plus 5 Lessons; 1 implemented (Rip Apart). Quandrix: 32 distinct (29 non-basic)
plus 4 Lessons; 0 implemented. Shared Lessons (Introduction to Prophecy, Expanded Anatomy) count once in the pool. L cards: 2, both
Lorehold (Lorehold Apprentice, Quintorius). Rares: Lorehold Command, Quandrix Command, Archmage Emeritus. Risks: Quandrix is
Learn-heavy (Pop Quiz, Field Trip, Divide by Zero, Arcane Subtraction, Overgrown Arch), so it depends on the sideboard prompt;
Quandrix Apprentice needs a reorder-to-bottom prompt; conditional cost reduction (Mage Duel, Bury in Books) may be new.

## Quandrix Equation: as built

Card behaviour in `packages/cards/src/stx/quandrix.ts` (all 30 listed cards and the four Lessons). The shipped list differs from
the draft above: the draft (17 lands, 43 spells) won 14% against the ten Foundations starter decks (bot vs bot) and a pure
Quandrix list with 24 lands 15%, so the deck is built like the starter decks (24 lands, 36 spells) with Foundations and
Bloomburrow bodies and removal (Gnarlback Rhino 4, Thrashing Brontodon 4, Scrapshooter 2, Knightfisher, Lilysplash Mentor,
Dreamdew Entrancer, Bite Down 3) around Biomathematician, Quandrix Pledgemage, Frost Trickster, Needlethorn Drake, Professor of
Zoomancy, Cultivator, Serpentine Curve, Leyline Invocation, Field Trip, Mage Duel 2 and Devouring Tendrils 2. 45% over 400 games.
Implemented but not in the main deck: Apprentice, Zimone, Karok Wrangler, Overgrown Arch, Archmage Emeritus, Pop Quiz, Big Play,
Quandrix Command, Eureka Moment, Decisive Denial, Divide by Zero, Resculpt, Arcane Subtraction, Curate, Bury in Books, Reject,
Springmane Cervin, Waterfall Aerialist, and the Lessons Fractal Summoning, Introduction to Prophecy, Expanded Anatomy and
Environmental Sciences (the sideboard, fetched by Learn).
