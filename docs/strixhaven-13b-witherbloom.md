# Strixhaven 13b: Witherbloom Bloodroot (B/G)

Deck id `stx-witherbloom-bloodroot`: 24 lands (Witherbloom Campus 4, Forest 10, Swamp 10) and 36 spells, 35 of them STX
(one Foundations Bite Down). Plan: cheap bodies and Pests, life gain payoffs (Blood Researcher, Dina, Honor Troll),
Sedgemoor Witch and Specter of the Fens, removal (Mortality Spear, Baleful Mastery, Onslaught, Tendrils). Lesson
sideboard: Pest Summoning, Basic Conjuration, Containment Breach, Environmental Sciences.

Arena script, 40 games per starter deck, both seats: 50.7% (the first all-STX draft with Trudge and Cram Session won
42-45%; Sedgemoor Witch x2 and fewer value cards was the biggest gain; heavier lists with fewer cheap creatures lost).

Engine: `kicker.replacesCost` (an alternative cost: Baleful Mastery) and the sacrificed creature's power on a spell
(`lkiPower`, Tend the Pests). Simplified: Master Symmetrist has no trample trigger; Mage Hunters' Onslaught leaves out
the "blocks: controller loses 1 life" clause. Implemented but not in the main deck: Brackish Trudge, Cram Session,
Master Symmetrist, Tend the Pests.
