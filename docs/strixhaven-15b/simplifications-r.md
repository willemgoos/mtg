# Strixhaven Brawl 15b, red group: simplifications

Cards not exactly per Scryfall oracle text (3 October 2026 bulk data). Behaviour: `packages/cards/src/soc/cards-15b-r.ts`,
one-offs in `packages/engine/src/brawl-15b-r-effects.ts`.

- **Return the Favor:** the copy mode targets a spell only (not an activated or triggered ability) and the copy keeps the
  original's targets (no new targets chosen). The change-target mode works on spells with exactly one target, and is a choice
  among the legal new targets (or keep it).
- **Mizzix's Mastery, Arcane Bombardment:** the exiled card itself is cast without paying its mana cost, then returns to exile
  (as a copy would leave it), rather than a true copy being cast. For both you first say yes or no, then may decline each card.
- **Torch the Tower:** "if a permanent dealt damage by this spell would die, exile it instead" is "if the target creature would
  die this turn, exile it instead" (also for damage from other sources); planeswalker targets aren't covered. Bargain is a
  kicker with a sacrifice (an artifact, enchantment or token).
- **Great Train Heist:** the Treasure mode doesn't target (there is one opponent): creatures that deal combat damage to the
  opponent this turn each make a tapped Treasure.
- **Saheeli, Sublime Artificer:** the copy has only the copied permanent's types (it isn't an artifact in addition when it
  copies a creature).
- **Sapphire Collector:** "this ability triggers only once" is a `conjured` named counter on the creature
  (a second Collector triggers on its own). Mox Sapphire is in the pool (Alchemy: Dominaria United printing) so it can be conjured.
- **Glimpse the Impossible:** the Eldrazi Spawn's "Sacrifice this token: Add {C}" is an activated ability (uses the stack),
  not a mana ability, so it never pays costs automatically.
- **Muddle, the Ever-Changing:** myriad is left out (it only matters with more than one opponent).
- **Steam Vents:** "you may pay 2 life; if you don't it enters tapped" is modelled as entering tapped, then paying 2 life untaps it
  (same as the other shock lands).
- **Snow-Covered Mountain:** the snow supertype isn't tracked (nothing in the pool cares).
