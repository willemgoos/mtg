# Strixhaven 13b: Silverquill Inkwell (W/B)

Deck `stx-silverquill-inkwell`, face Shadrix Silverquill. All 36 spells are STX; 24 lands (Silverquill Campus 4, Plains 10,
Swamp 10); Lesson sideboard of four (Inkling Summoning, Rise of Extus, Reduce to Memory, Hunt for Specimens).
Game plan: cheap magecraft creatures and Inkling tokens, drain and counters, premium removal (Vanishing Verse, Baleful
Mastery, Closing Statement, Onslaught). 48.5% against the ten Foundations starters (20 games per seat each, 400 games).

Engine (blocks marked `Strixhaven (13b)`): `CardFilter.monocolored`, static `spellsCostLessTargeting` (Killian; legal.ts
checks it through `hasTargetCostReduction`), kicker `as: 'alternative'` (Baleful Mastery's cheaper cost, a negative generic
kicker cost, with a Board.tsx label).

Simplifications: Shadrix offers two fixed pairs (Inkling or counters for you, opponent always draws a card and loses 1);
Mage Hunters' Onslaught lacks the blocking life loss; Blot Out the Sky lacks the X 6+ sweep; Exhilarating Elocution's
team pump includes the target; Umbral Juke and Silverquill Command's sacrifice modes don't target; Mage Hunter ignores
opponents' copies; Callous Bloodmage's graveyard mode targets a player. Implemented but not in the deck: none beyond the
Lessons (Elite Spellbinder, Humiliate and others were left out).
