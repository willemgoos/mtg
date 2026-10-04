# Shortcuts to fix later

Cards and features that don't yet do exactly what Arena does. Tick an item off (and remove it from the plan doc it came
from) when it's fixed. Older phases keep their own "Simplifications" lists in `docs/deck-plan.md`,
`docs/marvel-plan.md` and `docs/final-fantasy-plan.md`; this file collects the ones from the human-made decks and packets.

## Packets

- [ ] Arena's Bloomburrow and Foundations Jump In packets use their listed cards; Arena's random alternates for four slots per
      packet aren't modelled (`packages/cards/src/jumpin.ts`).
- [ ] Thriving lands may choose their own colour as the "other" colour (`msh/jumpstart.ts`).

## Bloomburrow Starter Kit (`blb/others.ts`)

- [x] Bria, Riptide Rogue: "other creatures you control have prowess" is one trigger on Bria that pumps them all.
- [x] Thieving Otter: only draws on combat damage to a player (any damage to an opponent should count).

## Marvel draft trophy decks (`msh/draft.ts`)

- [x] Shuri, Wakandan Inventor: her artifact-copy ability isn't modelled (only the cost reduction).
- [ ] Kid Loki: +1/+1 counters an opponent put on your creature this turn count too (only yours should).
- [x] Hellcat, Undying Vigilante: comes back with a counter and haste but doesn't lose her abilities.
- [x] Loki Laufeyson: copies spells of mana value 2 or less (printed power), not his current power.
- [x] Misty Knight: draws one card, not one per card discarded this turn.
- [x] Iron Fist, Living Weapon: deals his damage when the trigger resolves (tapping him) instead of gaining a tap ability.
- [x] Justice, Vance Astrovik: only counts creatures returned to hand, not other nonland permanents.
- [ ] Klaw, Sonic Subjugator: the opponent doesn't choose which cards to reveal (the engine reveals their cheapest), and
      "target player" is always the opponent.
- [ ] Titania, Rugged Rumbler: ward is always {2} (discarding a card instead isn't offered).
- [x] Atlantis Attacks: you always get the Leviathan ("target player" isn't offered).
- [x] Call Damage Control: the two cards don't have to be of different types.
- [ ] Death to Our Enemies: if the second of two targets becomes illegal, the first takes all 7; the "when you do" trigger
      is a "when sacrificed" trigger (any sacrifice sets it off).
- [ ] Doc Samson: his mana is an activated ability on the stack (choose a colour), not a mana ability.
- [ ] Claim the Kingdom: the "when you do" trigger is a "when sacrificed" trigger (any sacrifice sets it off).
- [x] Grim Reaper, Lethal Legionnaire: the creature returns tapped but not attacking.

## Foundations draft trophy decks and packets (`foundations-draft.ts`)

- [x] Time Stop: exiles the other spells, drops abilities and ends combat, but the turn carries on.
- [x] Bolt Bend: only changes spells' targets (not abilities), and the new target is picked automatically.
- [ ] Blasphemous Edict: sacrifices every creature; the {B} alternative cost isn't offered.
- [x] Gutless Plunderer: surveils 3 instead of "put one back on top, the rest in the graveyard".
- [x] Elvish Archdruid: its mana is an activated ability, not a mana ability.
- [x] Vivien Reid: her emblem gives its bonus from the start of each of your combats instead of all the time.
- [x] Dropkick Bomber: the Goblin is only sacrificed after combat damage to a player, not to a creature.

## Final Fantasy draft trophy decks (`foundations-draft.ts`)

- [x] Vial Smasher the Fierce: always hits the opponent, never one of their planeswalkers.

## Marvel Jumpstart packets (`msh/jumpstart-*.ts`)

- [ ] Bob, Reluctant HYDRA Agent: "if you do" checks that he's still attacking, not that he actually returned to hand.
- [ ] Strategic Intervention: two triggers (pump, then an optional tap) instead of one.
- [ ] Advancing the Spirit: the free power-up isn't optional; two copies still give one per turn; it doesn't check that it was
      on the battlefield when the turn's first power-up was activated.
- [ ] Quantum Reduction: "loses all abilities" is applied by a trigger as the Aura enters (like Frozen in Ice), so there's a
      window to respond before the creature loses them.
- [ ] Wasp, Shrinking Savior: if her only target becomes illegal, the whole trigger fizzles, including the draw.
- [ ] Tippy-Toe, Terrific Partner: the extra Food only comes with tokens from the normal create-token effect, not a few
      special token paths (`stack.ts`, `fin-effects.ts`, `fic-effects.ts`).
- [ ] Iron Fist, Hero for Hire: the 5 damage is divided among up to five targets, but the targets and the split are chosen
      as the power-up resolves (one target and its share at a time), not as it's activated (so nothing can respond to them).
- [ ] Contract Hero: the attack trigger always asks for a choice, even when you have no artifact and no cards in hand.
- [ ] The Clone Saga, chapter III: "choose a card name" is choosing a creature you control (up to one); with none, the chapter
      does nothing.
- [ ] Impossible Man: keeping his name only matters for the legend rule; while copying, the UI shows the copied name and he
      doesn't count as "named Impossible Man" for name filters.
- [ ] Villainous Syndication: the fourth counter's payoff isn't a separate reflexive trigger (the returned card isn't
      targeted, and there's no chance to respond); the engine picks which Villain to tap (lowest power).
- [ ] Radioactive Man: "that player" is always the opponent (two-player only).
- [ ] Crimson Cowl, Master of Evil: triggers whenever nontoken Villains attack, without checking they attacked a player.
- [ ] Flying Drone: the discount is a second, free version of the spell, offered once another flyer entered under your control
      this turn; that flyer must still be on the battlefield (with flying) to count.
- [ ] Vulture, Feathered Fiend: split into a counter trigger per flyer and one batched draw trigger instead of one trigger.
- [x] Grapeshot: storm copies keep the original's target (no new targets), like Ral's storm emblem.
- [x] Wiccan, Young Avenger: "until your next end step" lasts until the end of that turn (playable during the end step and
      cleanup too).
- [ ] Wanda's Vision: "exile until you exile a nonland card" uses mana value up to 99 as "no limit".
- [ ] The Vision and Scarlet Witch: the {R} it adds empties between steps, like all mana in the engine.
- [ ] Hulk's Thunderclap: the beheld creature or card isn't chosen or shown; the behold version is offered whenever a Gamma
      creature is available, and needs a noncreature artifact or enchantment to target.
- [ ] Secure Detention: mana that another permanent grants the locked one (Clement-style) is still usable.
- [ ] Rhino, Terrible Trampler: one trigger now, but the creatures for the three counters and the split are chosen as it
      resolves (one creature and its share at a time), not as it's put on the stack.
- [ ] Rhino's Rampage: the noncreature artifact is chosen as the spell is cast, not by a reflexive trigger on excess damage.
- [ ] Powerful Broker: can only target a permanent (players have no counters in this engine).
- [ ] Voracious Brood: its entering counters only apply when it's cast.
- [ ] Ms. Marvel, Elastic Ally: base power ignores static "has base power X" abilities (e.g. Hulkbuster Armor).
- [ ] Quantum Entanglement: the exile target is chosen when the {1}{W} is paid, not by a separate reflexive trigger.
- [ ] Captain Marvel, Shooting Star: "enters or attacks" is two triggers; she doesn't see creatures exiled at the same moment
      as her.
- [ ] Beast, Erudite Aerialist: flying turns on for any +1/+1 counter put on him this turn, even an opponent's.
- [ ] Reed Richards, Smartest Man: the replacement still makes four draws when the library has fewer cards.
