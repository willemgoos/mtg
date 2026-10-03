# SOS decks for 14a: Silverquill (W/B) and Witherbloom (B/G)

Source: Scryfall `set:sos` (271 cards; main-set collector numbers 1-280). SOS has five Lessons (Restoration Seminar, Echocasting Symposium, Decorum Dissertation, Improvisation Capstone, Germination Practicum), all Paradigm cards; no SOS card has Learn or fetches a Lesson, so **no sideboard**. Difficulty: S keywords/simple, M needs an SOS mechanic (prepare, repartee, infusion) or a small new field, L likely new engine work (none chosen). "Impl" = exact name already in `packages/cards/src` outside generated. Both decks use SOS's own two dual lands (a common tapped surveil land and a rare check land) and run 24 lands. No Converge, Increment, Opus or Paradigm cards appear: SOS has none in these colour pairs worth a slot, and they stay for other decks. Prepare front faces are listed by front name.

## Silverquill Debate Club (W/B)

Cheap targeted instants and sorceries (Last Gasp, Interjection, Silverquill Charm) set off repartee on a crowd of two- and three-drops, which grow, fly or go unblockable while draining. Prepared creatures (Elite Interceptor, Honorbound Page, Quill-Blade Laureate) give a second spell from the same card, and fliers finish.

**36 spells + 24 lands = 60.** Creatures 20, other spells 16. SOS cards: 36/36. Distinct nonland: 28. Curve (MV 0-6+): 0:0 1:6 2:14 3:8 4:6 5:2 6:0.

Creatures: 2 Elite Interceptor, 1 Honorbound Page, 1 Eager Glyphmage, 1 Owlin Historian, 2 Rehearsed Debater, 1 Inkshape Demonstrator, 1 Quill-Blade Laureate, 1 Imperious Inkmage, 2 Inkling Mascot, 2 Scolding Administrator, 1 Snooping Page, 2 Melancholic Poet, 1 Sneering Shadewriter, 1 Conciliator's Duelist, 1 Stirring Hopesinger.

Spells: 2 Silverquill Charm, 1 Harsh Annotation, 2 Last Gasp, 1 Foolish Fate, 1 Stand Up for Yourself, 1 Wander Off, 2 Interjection, 1 Rapier Wit, 1 Killian's Confidence, 1 Render Speechless, 1 Dissection Practice, 1 Graduation Day, 1 Ajani's Response.

Lands: 1 Forum of Amity, 1 Shattered Sanctum, 11 Plains, 11 Swamp.

| Card | # | Rarity | Diff | Impl | Note |
|---|---|---|---|---|---|
| Elite Interceptor | 2 | undefined | M | no | prepare; enters prepared; Rejoinder: tap or untap, draw |
| Honorbound Page | 1 | undefined | M | no | prepare, first strike; Forum's Favor +1/+0 and flying |
| Eager Glyphmage | 1 | undefined | S | no | ETB Inkling 1/1 flier token |
| Owlin Historian | 1 | undefined | S | no | flier, surveil 1; cardsLeaveYourGraveyard exists (STX) |
| Rehearsed Debater | 2 | undefined | M | no | repartee: +1/+1 until EOT |
| Inkshape Demonstrator | 1 | undefined | M | no | ward 2; repartee: +1/+0 and lifelink |
| Quill-Blade Laureate | 1 | undefined | M | no | prepare, double strike; Twofold Intent |
| Imperious Inkmage | 1 | undefined | S | no | vigilance, surveil 2 |
| Inkling Mascot | 2 | undefined | M | no | repartee: flying EOT, surveil 1 |
| Scolding Administrator | 2 | undefined | M | no | menace, repartee counter; dies: move its counters (last-known info) |
| Snooping Page | 1 | undefined | M | no | repartee: unblockable; combat damage: draw, lose 1 |
| Melancholic Poet | 2 | undefined | M | no | repartee: drain 1 |
| Sneering Shadewriter | 1 | undefined | S | no | flier, ETB drain 2 |
| Conciliator's Duelist | 1 | undefined | M | no | rare; ETB draw, each loses 1; repartee: blink any creature to end step |
| Stirring Hopesinger | 1 | undefined | M | no | rare; flying lifelink; repartee: counter on each creature you control |
| Silverquill Charm | 2 | undefined | S | no | modal: two counters / exile power<=2 / drain 3 |
| Harsh Annotation | 1 | undefined | S | no | destroy; its controller gets an Inkling |
| Last Gasp | 2 | undefined | S | no | -3/-3 |
| Foolish Fate | 1 | undefined | M | no | destroy; infusion: controller loses 3 |
| Stand Up for Yourself | 1 | undefined | S | no | destroy power 3 or greater |
| Wander Off | 1 | undefined | S | no | exile target creature |
| Interjection | 2 | undefined | S | no | +2/+2 and first strike; repartee enabler |
| Rapier Wit | 1 | undefined | M | no | tap, stun counter on your turn (stun counter may be new), draw |
| Killian's Confidence | 1 | undefined | M | no | +1/+1, draw; returns from graveyard on combat damage (pay W/B) |
| Render Speechless | 1 | undefined | S | no | look at hand, discard nonland, two counters |
| Dissection Practice | 1 | undefined | M | no | three independent "up to one" modes |
| Graduation Day | 1 | undefined | M | no | repartee enchantment: counter on target creature you control |
| Ajani's Response | 1 | undefined | M | no | costs {3} less if target is tapped |
| Forum of Amity | 1 | common | S | no | tapped dual, surveil ability |
| Shattered Sanctum | 1 | rare | S | no | dual, tapped unless two+ other lands |
| Plains | 11 | common | S | yes |  |
| Swamp | 11 | common | S | yes |  |

## Witherbloom Pest Control (B/G)

Pest tokens and cheap life gain turn on infusion every turn: Old-Growth Educator, Poisoner's Apprentice and Foolish Fate get much better, and Pest Mascot and Blech grow on every gain. Removal buys time while the big green bodies finish.

**36 spells + 24 lands = 60.** Creatures 21, other spells 15. SOS cards: 36/36. Distinct nonland: 29. Curve (MV 0-6+): 0:0 1:2 2:11 3:15 4:5 5:3 6:0.

Creatures: 2 Bogwater Lumaret, 1 Essenceknit Scholar, 2 Old-Growth Educator, 2 Pest Mascot, 1 Teacher's Pest, 1 Lluwen, Exchange Student, 1 Pestbrood Sloth, 1 Shopkeeper's Bane, 2 Mindful Biomancer, 1 Thornfist Striker, 1 Ulna Alley Shopkeep, 2 Sneering Shadewriter, 1 Leech Collector, 1 Poisoner's Apprentice, 1 Blech, Loafing Pest, 1 Moseo, Vein's New Dean.

Spells: 2 Grapple with Death, 1 Witherbloom Charm, 1 Last Gasp, 1 Foolish Fate, 1 Wander Off, 2 Efflorescence, 1 Send in the Pest, 1 Cost of Brilliance, 1 Root Manipulation, 1 Follow the Lumarets, 1 Oracle's Restoration, 1 Lumaret's Favor, 1 Dissection Practice.

Lands: 1 Titan's Grave, 1 Deathcap Glade, 11 Swamp, 11 Forest.

| Card | # | Rarity | Diff | Impl | Note |
|---|---|---|---|---|---|
| Bogwater Lumaret | 2 | undefined | S | no | gain 1 when it or another creature enters |
| Essenceknit Scholar | 1 | undefined | M | no | Pest token; end step draw if a creature died under your control |
| Old-Growth Educator | 2 | undefined | M | no | reach, vigilance; infusion: two counters on ETB |
| Pest Mascot | 2 | undefined | S | no | trample; counter on each life gain |
| Teacher's Pest | 1 | undefined | M | no | menace, attack: gain 1; {B}{G} return from graveyard tapped |
| Lluwen, Exchange Student | 1 | undefined | M | no | prepare, enters prepared; Pest Friend token; exile-creature-from-graveyard prepare activation |
| Pestbrood Sloth | 1 | undefined | S | no | reach; dies: two Pests |
| Shopkeeper's Bane | 1 | undefined | S | no | trample; attack: gain 2 |
| Mindful Biomancer | 2 | undefined | S | no | ETB gain 1; once-per-turn {2}{G} pump |
| Thornfist Striker | 1 | undefined | M | no | ward 1; infusion: team +1/+0 and trample while you gained life |
| Ulna Alley Shopkeep | 1 | undefined | M | no | menace; infusion: +2/+0 while you gained life |
| Sneering Shadewriter | 2 | undefined | S | no | flier, ETB drain 2 |
| Leech Collector | 1 | undefined | M | no | prepare; prepared on first life gain each turn; Bloodletting |
| Poisoner's Apprentice | 1 | undefined | M | no | infusion ETB: -4/-4 on an opposing creature |
| Blech, Loafing Pest | 1 | undefined | M | no | rare; counters on each Pest/Bat/Insect/Snake/Spider on life gain (subtype list filter) |
| Moseo, Vein's New Dean | 1 | undefined | M | no | rare; flier, Pest token; infusion end step: reanimate MV <= life gained (amount of life gained this turn) |
| Grapple with Death | 2 | undefined | S | no | destroy artifact or creature, gain 1 |
| Witherbloom Charm | 1 | undefined | M | no | modal: sacrifice for two cards / gain 5 / destroy MV<=2 |
| Last Gasp | 1 | undefined | S | no | -3/-3 |
| Foolish Fate | 1 | undefined | M | no | destroy; infusion: controller loses 3 |
| Wander Off | 1 | undefined | S | no | exile target creature |
| Efflorescence | 2 | undefined | M | no | two counters; infusion: trample and indestructible |
| Send in the Pest | 1 | undefined | S | no | discard + Pest token |
| Cost of Brilliance | 1 | undefined | S | no | draw two, lose 2, counter on up to one creature |
| Root Manipulation | 1 | undefined | M | no | team +2/+2, menace, and a granted attack-gain-1 trigger until EOT |
| Follow the Lumarets | 1 | undefined | M | no | infusion: look at four, take creature/land (two if gained life) |
| Oracle's Restoration | 1 | undefined | S | no | +1/+1, draw, gain 1 |
| Lumaret's Favor | 1 | undefined | M | no | infusion: copy on cast; +2/+4 |
| Dissection Practice | 1 | undefined | M | no | three independent "up to one" modes |
| Titan's Grave | 1 | common | S | no | tapped dual, surveil ability |
| Deathcap Glade | 1 | rare | S | no | dual, tapped unless two+ other lands |
| Swamp | 11 | common | S | yes |  |
| Forest | 11 | common | S | yes |  |
