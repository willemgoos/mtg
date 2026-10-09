# Shortcuts to fix later

Cards and features that don't yet do exactly what Arena does. Tick an item off (and remove it from the plan doc it came
from) when it's fixed. Older phases keep their own "Simplifications" lists in `docs/deck-plan.md`,
`docs/marvel-plan.md` and `docs/final-fantasy-plan.md`; this file collects the ones from the human-made decks and packets.

## Packets

- [ ] Arena's Bloomburrow and Foundations Jump In packets use their listed cards; Arena's random alternates for four slots per
      packet aren't modelled (`packages/cards/src/jumpin.ts`).
- [x] Thriving lands may choose their own colour as the "other" colour (`msh/jumpstart.ts`).

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

- [x] Bob, Reluctant HYDRA Agent: "if you do" checks that he's still attacking, not that he actually returned to hand.
- [x] Strategic Intervention: two triggers (pump, then an optional tap) instead of one.
- [ ] Advancing the Spirit: the free power-up isn't optional (it's always your first power-up each turn). Two copies giving
      one free power-up a turn, and none once a power-up was activated before it entered, are the rules.
- [x] Quantum Reduction: "loses all abilities" is applied by a trigger as the Aura enters (like Frozen in Ice), so there's a
      window to respond before the creature loses them.
- [x] Wasp, Shrinking Savior: if her only target becomes illegal, the whole trigger fizzles, including the draw. (That part
      is the rules; choosing no target used to drop the trigger, draw included.)
- [ ] Tippy-Toe, Terrific Partner: the extra Food comes with token copies and the special token paths now, except the
      Strixhaven Brawl decks' one-off token effects (`brawl-15*-effects.ts`).
- [ ] Iron Fist, Hero for Hire: the 5 damage is divided among up to five targets, but the targets and the split are chosen
      as the power-up resolves (one target and its share at a time), not as it's activated (so nothing can respond to them).
- [x] Contract Hero: the attack trigger always asks for a choice, even when you have no artifact and no cards in hand.
- [ ] The Clone Saga, chapter III: "choose a card name" offers only the names of the creatures on the battlefield and the
      creature cards in your hand, not every card name.
- [ ] Impossible Man: while copying, the UI shows the copied card (and its name); the rules see his own name.
- [x] Villainous Syndication: the fourth counter's payoff isn't a separate reflexive trigger (the returned card isn't
      targeted, and there's no chance to respond); the engine picks which Villain to tap (lowest power).
- [x] Radioactive Man: "that player" is always the opponent (two-player only). (Games are two-player, so that's exact.)
- [x] Crimson Cowl, Master of Evil: triggers whenever nontoken Villains attack, without checking they attacked a player.
- [x] Flying Drone: the discount is a second, free version of the spell, offered once another flyer entered under your control
      this turn; that flyer must still be on the battlefield (with flying) to count.
- [x] Vulture, Feathered Fiend: split into a counter trigger per flyer and one batched draw trigger instead of one trigger.
- [x] Grapeshot: storm copies keep the original's target (no new targets), like Ral's storm emblem.
- [x] Wiccan, Young Avenger: "until your next end step" lasts until the end of that turn (playable during the end step and
      cleanup too).
- [x] Wanda's Vision: "exile until you exile a nonland card" uses mana value up to 99 as "no limit". (No card's mana value
      comes near 99, so it plays the same.)
- [x] The Vision and Scarlet Witch: the {R} it adds empties between steps, like all mana in the engine. (That's the rules,
      and Arena: mana empties at the end of each step and phase.)
- [ ] Hulk's Thunderclap: the beheld creature or card isn't chosen or shown (which one doesn't change anything else). Offering
      the behold version whenever a Gamma creature is available, and only with a noncreature artifact or enchantment to
      target, is the rules.
- [x] Secure Detention: mana that another permanent grants the locked one (Clement-style) is still usable.
- [ ] Rhino, Terrible Trampler: one trigger now, but the creatures for the three counters and the split are chosen as it
      resolves (one creature and its share at a time), not as it's put on the stack.
- [x] Rhino's Rampage: the noncreature artifact is chosen as the spell is cast, not by a reflexive trigger on excess damage.
- [ ] Powerful Broker: can only target a permanent (players have no counters in this engine).
- [x] Voracious Brood: its entering counters only apply when it's cast.
- [x] Ms. Marvel, Elastic Ally: base power ignores static "has base power X" abilities (e.g. Hulkbuster Armor).
- [x] Quantum Entanglement: the exile target is chosen when the {1}{W} is paid, not by a separate reflexive trigger.
- [ ] Captain Marvel, Shooting Star: she doesn't see creatures exiled at the same moment as her. ("Enters or attacks" is two
      triggers, which plays the same: one event never sets off both.)
- [ ] Beast, Erudite Aerialist: flying turns on for any +1/+1 counter put on him this turn, even an opponent's.
- [x] Reed Richards, Smartest Man: the replacement still makes four draws when the library has fewer cards. (That's the
      rules: the draws from an empty library lose the game, as on Arena.)
- [ ] Stunning Shot: two modes ("up to one of yours, then up to one of theirs" or "theirs only") instead of two independent
      "up to one" targets, because optional targets can only be dropped from the end.
- [ ] Infinity Formula: the life gain is a trigger on the Equipment, not an ability granted to the creature.
- [ ] Captain America, Liberator: only counts Equipment you control attached to him.
- [ ] Zarda, the Power Princess: no exalted keyword; one trigger gives the lone attacker +X/+X (X = your other Heroes).
- [ ] Doc Ock, Sinister Scientist: "base power and toughness 8/8" is +4/+3 on his printed 4/5; "another Villain" only counts
      creatures.
- [ ] Flying Octobot: only sees Villain creatures entering, not noncreature Villains.

## Reality Fracture (`fra/*.ts`, phase 17a)

- [x] Gallia, Tragic Host: the "exile another creature card from your graveyard" cost picks the card for you (the engine's
      existing `exileFromGraveyard` cost, as for Postmortem Professor); you should choose.
- [x] Rise of the Deathbringer: loses life equal to the greatest power, not the number of cards actually drawn (differs only
      when the library runs out or a draw is replaced).
- Extrapolate the Impossible: left out on purpose ("cards you own from outside the game"; there's no sideboard outside
  Learn). Decided 4 October 2026: not to be added.
- [x] Loot, the Nexus: its mana ability is an activated ability that goes on the stack (like Doc Samson's), not a mana
      ability, so it can't be used while paying a cost.
- [x] Emrakul, the Exigent Doom: "Ward—Sacrifice three permanents" is paid with permanents the engine picks (tokens, then
      cheapest), as for Vein Ripper's ward; the opponent should choose.
- [x] Kindred Judgment (and the older Raise the Palisade): the creature types offered are those of the chooser's own cards,
      not every creature type.
- [x] Hexhaven Dueling Arena: "attacked this turn" matches by object id, so a creature blinked after attacking still counts.
- [x] Uldaros Theorix: free casts never offer additional costs (sacrifice, forage), so a copy of a card with one can't be
      cast this way with it.
- [x] Equipment attack triggers (Medic's Kitesail, Hunter's Axe) sit on the Equipment, not the equipped creature: they
      differ only if the creature changes controller or loses its abilities.
- [x] Loyal Tutor: the searched card isn't revealed to the opponent (no tutor shows a reveal yet).

## Reality Fracture planeswalkers (`fra/pw-*.ts`, phase 17c)

- [x] Inspired Tethermage: "whenever you put one or more loyalty counters on a planeswalker" fires for counters put on a
      walker you control by anyone (the engine doesn't record who puts counters).
- [x] Behold a Jace (Countersculpt, Theorist's Sanctum): you can't pick which Jace, and a Jace card in hand isn't revealed.
- [ ] Theorist's Sanctum: "as this land enters, you may behold a Jace" is an enters-tapped land with an enters trigger that
      untaps it (the shock-land pattern), so in principle the opponent could respond before it untaps.

## Lorwyn Eclipsed (`ecl/*.ts`, phase 18b)

- [ ] "As this enters, choose a creature type" (Chronicle of Victory, Dawn-Blessed Pennant, Gathering Stone, Eclipsed
      Realms) is an enters trigger, like earlier sets' cards, so in principle an opponent could respond before the type is
      set.
- [ ] Hallowed Fountain: the shock-land pattern (enters tapped, a prompt untaps it for 2 life).
- [ ] Springleaf Drum and Foraging Wickermaw's `{1}` ability: mana abilities with a non-tap cost go on the stack (the
      engine's mana abilities take only tap or sacrifice costs), so they can't be used in the middle of paying for a spell.
- [ ] Mirrormind Crown: tokens made by other sets' hand-written custom effects (Brawl, FIC) don't count as "creating
      tokens" for its once-each-turn.
- [ ] Firdoch Core: the Kindred card type isn't in the engine, so it's only an Artifact (nothing in the pool cares).
