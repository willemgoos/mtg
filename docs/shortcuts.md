# Shortcuts to fix later

Cards and features that don't yet do exactly what Arena does. Tick an item off (and remove it from the plan doc it came
from) when it's fixed. Older phases keep their own "Simplifications" lists in `docs/deck-plan.md`,
`docs/marvel-plan.md` and `docs/final-fantasy-plan.md`; this file collects the ones from the human-made decks and packets.

## Packets

- [ ] Arena's Bloomburrow and Foundations Jump In packets use their listed cards; Arena's random alternates for four slots per
      packet aren't modelled (`packages/cards/src/jumpin.ts`).
- [ ] Thriving lands may choose their own colour as the "other" colour (`msh/jumpstart.ts`).

## Bloomburrow Starter Kit (`blb/others.ts`)

- [ ] Bria, Riptide Rogue: "other creatures you control have prowess" is one trigger on Bria that pumps them all.
- [ ] Thieving Otter: only draws on combat damage to a player (any damage to an opponent should count).

## Marvel draft trophy decks (`msh/draft.ts`)

- [ ] Shuri, Wakandan Inventor: her artifact-copy ability isn't modelled (only the cost reduction).
- [ ] Kid Loki: hexproof for creatures you put +1/+1 counters on this turn isn't modelled.
- [ ] Hellcat, Undying Vigilante: comes back with a counter and haste but doesn't lose her abilities.
- [ ] Loki Laufeyson: copies spells of mana value 2 or less (printed power), not his current power.
- [ ] Misty Knight: draws one card, not one per card discarded this turn.
- [ ] Iron Fist, Living Weapon: deals his damage when the trigger resolves (tapping him) instead of gaining a tap ability.
- [ ] Justice, Vance Astrovik: only counts creatures returned to hand, not other nonland permanents.
- [ ] Klaw, Sonic Subjugator: you choose from the whole hand instead of from the revealed cards.
- [ ] Titania, Rugged Rumbler: the additional cost is always a discard (never {2}); ward is always {2}.
- [ ] Atlantis Attacks: you always get the Leviathan ("target player" isn't offered).
- [ ] Call Damage Control: the two cards don't have to be of different types.
- [ ] Death to Our Enemies: the target for the 7 damage is chosen each time it triggers, and the damage isn't divided.
- [ ] Doc Samson: his mana ability makes green only.
- [ ] Claim the Kingdom: the indestructible counter goes on the creature that got the last +1/+1 counter.
- [ ] Grim Reaper, Lethal Legionnaire: the creature returns tapped but not attacking.

## Foundations draft trophy decks and packets (`foundations-draft.ts`)

- [ ] Time Stop: exiles the other spells, drops abilities and ends combat, but the turn carries on.
- [ ] Bolt Bend: only changes spells' targets (not abilities), and the new target is picked automatically.
- [ ] Blasphemous Edict: sacrifices every creature; the {B} alternative cost isn't offered.
- [ ] Gutless Plunderer: surveils 3 instead of "put one back on top, the rest in the graveyard".
- [ ] Elvish Archdruid: its mana is an activated ability, not a mana ability.
- [ ] Vivien Reid: her emblem gives its bonus from the start of each of your combats instead of all the time.
- [ ] Dropkick Bomber: the Goblin is only sacrificed after combat damage to a player, not to a creature.

## Final Fantasy draft trophy decks (`foundations-draft.ts`)

- [ ] Vial Smasher the Fierce: always hits the opponent, never one of their planeswalkers.

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
- [ ] Iron Fist, Hero for Hire: the power-up's 5 damage goes to up to two targets (5, 4/1 or 3/2) instead of up to five.
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
- [ ] Grapeshot: storm copies keep the original's target (no new targets), like Ral's storm emblem.
- [ ] Wiccan, Young Avenger: "until your next end step" lasts until the end of that turn (playable during the end step and
      cleanup too).
- [ ] Wanda's Vision: "exile until you exile a nonland card" uses mana value up to 99 as "no limit".
- [ ] The Vision and Scarlet Witch: the {R} it adds empties between steps, like all mana in the engine.
- [ ] Hulk's Thunderclap: the beheld creature or card isn't chosen or shown; the behold version is offered whenever a Gamma
      creature is available, and needs a noncreature artifact or enchantment to target.
- [ ] Secure Detention: mana that another permanent grants the locked one (Clement-style) is still usable.
- [ ] Rhino, Terrible Trampler: its three counters are three separate triggers (one counter each, targets chosen per trigger)
      plus a separate destroy trigger, instead of one trigger.
- [ ] Rhino's Rampage: the noncreature artifact is chosen as the spell is cast, not by a reflexive trigger on excess damage.
- [ ] Powerful Broker: can only target a permanent (players have no counters in this engine).
- [ ] Voracious Brood: its entering counters only apply when it's cast.
