# Plan: Marvel Super Heroes, in two parallel streams

Target: the whole Marvel release as Arena has it (on Arena since 23 June 2026):

- **Stream A, Brawl precons:** the four 100-card Marvel Super Heroes Commander (MSC) precons, played as **Brawl**, Arena's 1v1 Commander.
- **Stream B, main set:** the 276-card Marvel Super Heroes (MSH) set, done like Bloomburrow: our own two-colour 60-card decks, every rare and mythic, then boosters.

The two streams are worked on at the same time by two agents, each in its own worktree. Read **Shared rules** first, then
only your own stream.

## Shared rules (both streams)

### Before you start

- Read `CLAUDE.md` (Arena is the reference), the done criteria in `docs/deck-plan.md`, and how Bloomburrow was built (phase 8
  there, `packages/cards/src/blb/`, `packages/cards/src/bloomburrow.ts`). Follow the same patterns.
- Card text comes from Scryfall (`pnpm cards:fetch`). Decklists come from `https://mtg.wtf/deck/msc/<slug>`, checked against mtg.wiki
  through the MediaWiki API.

### Branches

- `marvel` is the integration branch, cut from `bloomburrow`.
- Stream A works on `marvel-brawl`, Stream B on `marvel-msh`, each in its own git worktree, both cut from `marvel`.
- Commit at the end of each sub-phase, with tests, typecheck and lint green. The user merges into `marvel`. Before starting the next
  sub-phase, merge `marvel` into your branch so you pick up the other stream's work.

### Who owns what

Each mechanic is built by **one** stream. If you need something the other stream owns and it isn't on `marvel` yet, do another part
of your phase first. Don't build a second version.

| Built by A | Built by B |
|---|---|
| Brawl format: command zone, commander tax, colour identity, "your commander" | Power-up |
| Cycling (B's landcycling/typecycling extend it) | Teamwork |
| Sagas | Transform (double-faced cards) |
| Phasing | **Connive** (A's Doom Prevails needs it, so A does that deck last) |
| Damage replacement and redirection | Sneak |
| "Cast as though it had flash" | Investigate / Clue, improvise, enrage, boast, extort |
| Goad, mayhem, unearth, multikicker, overload, melee | Landcycling, typecycling |
| Rebound, cascade, discover, escalate, metalcraft | |

### Shared files

- **Engine vocabulary** (`packages/engine/src/types.ts`, `effects.ts`): add new effect kinds and fields in a block for your
  mechanic, with a comment naming it. Don't reorder or reformat existing code, so merges stay simple.
- **`packages/cards/scripts/fetch-scryfall.ts`:** A adds the `msc` set, `saga` layout and Marvel names (`flavor_name`); B adds
  `msh` and the `transform` layout. Both are small edits; merge them by hand if they conflict.
- **`packages/cards/src/generated/scryfall.json`:** never merge by hand. After a merge, run `pnpm cards:fetch` and commit the result.
- **`packages/cards/src/decks.ts`, `pool.ts`, `behaviors.ts`:** add your own lists and blocks (A: `MARVEL_BRAWL_DECKS`, B:
  `MARVEL_DECKS`). Touch the shared arrays only to add them.
- Card behaviour goes in its own folders: A in `packages/cards/src/msc/`, B in `packages/cards/src/msh/`.

### Done criteria (every sub-phase)

As in `docs/deck-plan.md`:

- Every card in the deck is implemented; the coverage test fails otherwise.
- Unit tests for each new mechanic.
- The random-game fuzz test passes with the new decks.
- The arena script (`pnpm arena`) runs bot vs bot without errors and with sensible win rates.
- The deck is playable in the web UI, with an Arena-style prompt for any new choice.

At the end of each sub-phase, record any simplifications in that stream's **Simplifications** list at the bottom of this file.

---

## Stream A: Brawl and the four precons (`marvel-brawl`): done

Done and merged into `marvel`: Brawl (command zone, commander tax, colour identity, 25 life, free first mulligan, a Brawl
mode on Home with its own deck picker, a command-zone slot by each portrait, a 100-card deck view), the shared staples, and
all four precons as printed, plus a test deck of our own (Mabel's Militia). Each sub-phase lists its simplifications at the
bottom of this file.

### Brawl rules (as on Arena)

- 1v1 only, **25 starting life**, no commander damage.
- 100-card singleton (basic lands excepted), with one legendary creature as commander. Every card must fit the commander's colour identity.
- The commander starts in the **command zone** and can be cast from there. Each earlier cast from the command zone adds {2} to the cost (commander tax).
- If the commander would go to the graveyard or exile, or into the hand or library, its owner may put it into the command zone instead (Arena asks).
- The first mulligan is free.

### The precons

"Cards" counts the different non-basic cards in each deck. We already have 1 to 4 of each deck's cards, so effectively all of them are new.

| Deck (mtg.wtf slug) | Commander | Colours | Cards | Main mechanics |
|---|---|---|---|---|
| Avengers Assemble (`avengers-assemble`) | Captain America, Team Leader | W/U/R | 84 | Heroes, +1/+1 counters, equipment, flash enablers |
| Wakanda Forever (`wakanda-forever`) | T'Challa, the Black Panther | G/W | 76 | Artifacts (24), equipment (6), crew, metalcraft, affinity |
| The Fantastic Four (`the-fantastic-four`) | Invisible Woman | W/U/R/G | 83 | 23 sorceries, rebound (8), flashback, cascade, discover, escalate |
| Doom Prevails (`doom-prevails`) | Doctor Doom, King of Latveria | U/B/R | 85 | Connive (9, from B), goad, mayhem, unearth, sagas |

The four decks have 295 different non-basic cards in total, and 20 of them appear in more than one deck: Sol Ring, Arcane Signet,
Command Tower, Path of Ancestry, Exotic Orchard, Terramorphic Expanse, Talismans, dual lands. 9a does these once.

13 reprints carry a Marvel name in the decklist (e.g. "S.H.I.E.L.D. Spy Satellite" is Fellwar Stone, "Raise Repulsor Shields" is Raise the
Palisade). Store the Oracle name and show the Marvel name, as the printed card does.

The collector's editions have the same lists as the regular decks and are skipped.

### 9a: Brawl format and the shared staples: done

Engine (`packages/engine`):

- `ZoneName` gains `'command'`; each player gets a command zone. `setup.ts` takes a commander per player and puts it there.
- Casting from the command zone, with the tax tracked per commander (number of casts from there so far).
- The "put it into the command zone instead" replacement, as a decision for the owner.
- Game option `format: 'brawl'`: 25 life and a free first mulligan.
- "Your commander" in card text (Jocasta, Bastion Protector, Command Tower, Arcane Signet, Path of Ancestry, Tome of Legends, Folk Hero).
- Colour identity: mana cost plus mana symbols in the rules text. Command Tower and Arcane Signet make mana of the commander's colours.
- Cycling (for cycling lands and spells in the precons).

Cards (`packages/cards`):

- `Decklist` gains `commander?: string`, `series: 'brawl'` and `set: 'msc'`. A test checks every Brawl deck has 100 cards, is singleton and fits its colour identity.
- `fetch-scryfall.ts`: the `msc` set, `saga` layout, Marvel names.
- The shared staples: mana rocks (Sol Ring, Arcane Signet, Talismans, Fellwar Stone, Thought Vessel) and lands (Command Tower,
  Exotic Orchard, Path of Ancestry; check-, slow-, pain-, snarl- and cycling lands; Terramorphic Expanse, Evolving Wilds).
- A test-only Brawl deck from existing cards plus the staples, so the format is tested before any precon lands.

Web (`apps/web`):

- A command-zone slot by each player's portrait, as on Arena, showing the commander and its current tax.
- A **Brawl** entry on Home with its own deck picker. Brawl decks only play Brawl decks.
- A prompt for "move to the command zone?".
- DeckView handles 100 cards: grouped by type, commander on top.

Bots (`packages/ai`): cast the commander from the command zone like a normal spell, with the tax included in its cost. Always send
it back to the command zone. Use 25 life in evaluation.

### 9b: Avengers Assemble (W/U/R): done

- Damage replacement: Thor (+1 damage to opponents and their permanents) and Heroic Sacrifice (all your damage redirected to one creature).
- "Cast spells as though they had flash": Quicksilver while tapped, Captain Mar-Vell's Cosmic Awareness.
- "Untap it the first time it becomes tapped this turn" (Captain America, Living Legend).
- Phasing (Vision).
- Base P/T from equipment (Hulkbuster Armor) and "Equip Hero".
- Exile face down, then cast free (Scarlet Witch). "Costs less if a creature is attacking you" (Heroic Return, Avenge).
- Hero cost reduction and Hero-only mana (Director Nick Fury, Avengers Tower).

After 9b, Avengers Assemble plays the test deck from 9a.

### 9c: Wakanda Forever (G/W): done (with the monarch, which the plan didn't list)

- 24 artifacts, 6 with equip, 3 vehicles. Crew already exists, so the work is mainly equip variants and auto-attach.
- Metalcraft, affinity for artifacts.
- The Bead cards (AV / Prime / Communication Bead) and the vibranium cards as `custom` handlers.

### 9d: The Fantastic Four (W/U/R/G): done (goad and "attacks each combat" built here)

- 23 sorceries: rebound (exile it, cast it again at your next upkeep), cascade, discover, escalate.
- Flashback already exists; check it covers this deck.
- The first four-colour deck: tests colour identity and the bots' mana with four colours.

### 9e: Doom Prevails (U/B/R): done

Last, because it needs connive from Stream B (10a).

- Goad: in 1v1, the goaded creature attacks each combat if able.
- Mayhem, unearth, multikicker, overload, melee.
- Sagas (Age of Ultron, Kang Dynasty): lore counters, chapter triggers, sacrifice after the last chapter.
- The mercenary and contraband one-offs (Hire a Mercenary, Sell Contraband, Buy Information) as `custom` handlers.

After 9e, the arena script runs every Brawl matchup of the four precons. Aim for 35 to 65% each.

### Stream A out of scope

- Multiplayer (paper Commander with 3 or 4 players) and commander damage: Arena's Brawl has neither.
- Brawl deck building: the precons are played as printed.

---

## Stream B: Marvel Super Heroes main set (`marvel-msh`)

Like Bloomburrow (phase 8 in `docs/deck-plan.md`):

- Our own two-colour 60-card decks (36 spells, 24 lands), shown in their own deck section, with `set: 'msh'`.
- They play against the Foundations and Bloomburrow decks.
- Card behaviour goes in `packages/cards/src/msh/`, one file per pair of decks plus others/mythics, merged in `packages/cards/src/marvel.ts`.

The set: 276 non-basic cards (91 common, 100 uncommon, 60 rare, 25 mythic).

Most keywords exist already: flying, flash, vigilance, reach, trample, lifelink, deathtouch, haste, menace, first/double strike,
indestructible, hexproof, ward, equip, crew, Treasure, Food, scry, surveil, mill, fight, prowess, landfall, flashback, convoke.
Named abilities such as "Radar Sense" or "Street Justice" are just labels with no rules of their own.

### 10a: the set mechanics and the first two decks: done

Done: connive, power-up, teamwork (with a board prompt to pick the creatures to tap), double-faced cards (the five Marvel ones are
modal: either face can be cast, and the front transforms; hover shows the other face, a permanent flips as it transforms), the
set's gain-lands, and two decks: **Heroes Unite** (R/W teamwork and power-up, with Monica Rambeau) and **Villainous Schemes** (U/B
connive villains). Bot vs bot over 160 games against the ten Foundations starter decks: Heroes Unite 50%, Villainous Schemes 47%.


- **Power-up** (24 cards): an activated ability usable once per card. Its cost is reduced by the card's mana cost if it entered
  this turn. (E.g. Abomination: "Power-up {5}{R/G}{R/G}: put a +1/+1 counter on him; he fights up to one target creature".)
- **Teamwork** (12 cards): an optional additional cost of tapping any number of your creatures with total power N or more, which
  improves the spell. It needs a prompt to pick the creatures, and Agent Maria Hill cares about "becomes tapped to pay a teamwork cost".
- **Connive** (11 cards here; Stream A needs it too): draw a card, then discard a card; if it was a nonland card, put a +1/+1 counter
  on the creature. Do it early in 10a and get it merged into `marvel` soon.
- **Transform** (6 cards): double-faced cards in the engine, the Scryfall import (`transform` layout) and the card UI (show the other face, flip animation as on Arena).
- Two decks whose themes use these mechanics, e.g. Heroes/teamwork and villains/connive.

### 10b: the rest of the decks: done

Done: eight more decks, so one per colour pair: **Gamma Smash** (R/G power-up and big creatures), **Heroes of Wakanda** (G/W
+1/+1 counters and Heroes), **Lone Agents** (W/B creatures attacking alone), **HYDRA Rising** (B/R Villains), **Stark Tech** (U/R
artifacts), **Sky Patrol** (W/U fliers), **Growing Pains** (G/U counters, Ant-Man) and **Savage Uprising** (B/G creature cards in
the graveyard). Added: enrage ("whenever this is dealt damage"), "attacks alone", investigate and Clues, the power-up discount
static (Hulk, Gamma Goliath), conditional amounts ("costs {2} less if ..."). Sneak, improvise, boast and extort are only on
rares, so they move to 10c; landcycling and typecycling wait for Stream A's cycling.

Bot vs bot against the ten Foundations starter decks (160 games, 320 for the last two): Heroes Unite 50%, Villainous Schemes 47%,
Gamma Smash 46%, Heroes of Wakanda 48%, Lone Agents 46%, HYDRA Rising 46%, Sky Patrol 48%, Growing Pains 52%, Stark Tech 48%,
Savage Uprising 49%.


- About ten decks in total, one per colour pair, built around the set's themes, as Bloomburrow did with its animal decks.
- New along the way: sneak (cast for its sneak cost by returning an unblocked attacker to hand; it enters tapped and attacking),
  landcycling and typecycling (extending Stream A's cycling), investigate/Clue, improvise, enrage, boast, extort.
- Bot vs bot across the Foundations starter decks: aim for 45 to 65% per deck, as in phase 8.

### 10c: every rare and mythic, then boosters: done except nine cards waiting on Stream A

Done: 51 of 60 rares and 24 of 25 mythics, the five basic-landcycling commons (on Stream A's cycling), and MSH boosters in
Expedition (with a Marvel deck) and Season (with the ten Marvel decks as starters). New along the way: sneak, improvise,
extort (as a trigger), shield counters, extra turns, X in activated abilities, "you have hexproof", "opponents can't cast spells
during your turn", starting the game with a card in play, damage that doesn't accumulate, equipment doubling damage, casting a
spell for free from the top of a library, and custom effects for the true one-offs (`packages/engine/src/msh-effects.ts`).

Waiting on Stream A (built on `marvel-brawl`, not yet on `marvel`): the six Sagas (The Coming of Galactus, Armor Wars, Avengers:
Under Siege, Origin of the Avengers, The Super Hero Civil War, World War Hulk) need Sagas, and Absorbing Man, Taskmaster and
Secret Invasion need "becomes a copy".


- All 60 rares and 25 mythics, including those not in any of our decks.
- MSH boosters in Expedition and Season, as was done for Bloomburrow.

---

## Simplifications to revisit

### Stream A

9a (Brawl format and staples):

- "Move to the command zone?" is asked when a player would next get priority, for every zone (graveyard, exile, hand,
  library). For hand and library the rules make it a replacement; nothing in the pool can tell the difference yet.
- A commander's identity is never hidden from the opponent, even in a library (it simplifies the bots' guessing).
- Snarls always reveal when they can.
- Exotic Orchard and Fellwar Stone look only at the opponent's lands' fixed mana abilities (not at another Orchard).
- Path of Ancestry's scry checks the commander's printed creature types; any mana from it counts.
- Sungrass Prairie and the like make floating mana through an activated ability, so bots rarely use them.
- Bots always send the commander back, and value it like a card in hand while it waits.
- Test-only deck: Mabel's Militia (Mabel, Heir to Cragflame, R/W), our own list from Foundations and Bloomburrow
  cards plus the staples. It stays as a Brawl opponent once the precons land.

9b (Avengers Assemble):

- Four of the deck's cards are printed in the MSH main set (Captain Mar-Vell, Patriot, Speed, Captain America, Living
  Legend), and Avengers Tower in a promo set. They are implemented in `msc/avengers.ts`; Stream B should not define
  them again. 9b also adds `msh` and `pmei` to `SET_PREFERENCE` (the same `msh` line as Stream B's).
- Crew N is a real cost now (`cost.crew`); the engine picks which creatures to tap (one big enough, else the largest).
- Phasing: phased-out permanents leave the battlefield list but keep their zone; nothing shows them on the board.
- Heroic Sacrifice: the counters go to a creature you choose when it dies (not targeted).
- Photon's mana can be of mixed colours; Arcane Denial's opponent always draws two.
- Scarlet Witch's exiled cards are face up to the opponent.
- "As this enters, choose a creature type" (Herald's Horn, Metallic Mimic, Door of Destinies, Kindred Discovery) is
  an enters trigger, as for the earlier cards that choose.
- Captain Marvel copies +1/+1 counters only.
- Avengers Tower's and Plaza of Heroes' restricted mana can't pay for abilities.

9c (Wakanda Forever):

- The monarch is new (not in the original plan): the end-step draw and taking it with combat damage happen
  directly, not as triggers on the stack. A crown marks the monarch's portrait.
- Okoye's double strike and trample apply from the beginning of combat when an opponent is the monarch, rather than
  when the creature attacks the monarch.
- Vibranium mana can't pay for abilities either (only artifact spells).
- Gilded Lotus and Coveted Jewel make three mana that may be of different colours.
- Heart-Shaped Herb returns the creature by blinking it (no "dies" triggers).
- Wakanda Forever! puts the six revealed cards into the graveyard first, then picks from there.
- Ancestral Communion's copy takes another legal target automatically.
- King Solomon's Frogs' "if you cast it" isn't checked.
- Divine Visitation only replaces tokens from token-making effects, not token copies.
- Conduit of Worlds can only make permanent cards castable (as printed), and its "no more spells" lasts the turn.
- Bot win rates: Wakanda Forever is behind (6–14 against Avengers, 8–12 against Mabel's Militia over 20 games); to
  revisit with the 9e arena tuning.

9d (The Fantastic Four):

- Goad and "attacks each combat if able" (Galactus, Silver Surfer) are built here, not in 9e: such creatures are
  declared as attackers already and can't be taken back. Goad lasts until the goader's next turn.
- Invisible Force Field gives every creature you control indestructible, untargeted (four optional targets among a
  dozen permanents are thousands of combinations for the bots). Clever Concealment phases out all your nonland
  permanents. Collective Effort's counters go on your own creatures.
- Free casts (cascade, discover, rebound, Mind's Dilation) don't offer additional sacrifice or forage costs.
- Explore never puts the card into the graveyard. Expressive Iteration exiles the first of the other two and bottoms
  the second. Genesis Ultimatum puts every permanent card onto the battlefield.
- Tragic Arrogance and Promise of Loyalty pick what each player keeps (the caster's best, the opponent's worst; each
  player's strongest creature).
- The Thing doubles only its own counters; Mister Fantastic copies the top triggered ability you control (not a
  chosen one); Willie Lumpkin's opponent never takes the optional draw; Human Torch's paid ability does nothing in 1v1.
- Convoke creatures pay generic mana only.

9e (Doom Prevails), part 1 (everything but connive):

- The connive cards came after Stream B's merge (Doctor Doom, Lethal Scheme, Prowler, Glorious Purpose, Iron Monger,
  Ultron, Villainous Hideout, Moonstone). Baron Strucker, Madame Hydra and Kang, Temporal Tyrant are Stream B's.
- Glorious Purpose's sixth plan counter offers four free casts from the exiled cards one at a time; the rest go to hand.

Arena (9e): every Brawl matchup runs without errors. The bots' evaluation now values being the monarch, noncreature
permanents by mana value, cards still to come (rebound, suspend, castable in exile) and, before combat, The Fantastic
Four's "if you've cast a noncreature spell" payoffs (`WEIGHTS` in `packages/ai/src/evaluate.ts`). The 60-card decks
against the Foundations starters barely move with the new weights (one deck by 8 points of 36 games).

Precon matchups, heuristic bot against heuristic bot (60 games; 100 for the three with The Fantastic Four):

| | Wakanda Forever | The Fantastic Four | Doom Prevails |
|---|---|---|---|
| Avengers Assemble | 58% | 67% | 50% |
| Wakanda Forever | | 53% | 40% |
| The Fantastic Four | | | 30% |

Two are just outside 35–65%, both against The Fantastic Four: Avengers at 67% and Doom Prevails at 70%. Raising the
precombat-payoff weight (to 3) didn't move them. With the search bot (12 games), The Fantastic Four wins 58% against Doom
Prevails (the control, Doom Prevails with the search bot, wins 83%): the deck needs a bot that plans ahead more than a
different weight, and Doom Prevails also hoses it (The Frightful Four taxes every first noncreature spell). To revisit
with smarter bots, not with deck changes (the precons are played as printed).
- Overload is modelled as kicker (Vandalblast: {R} plus {4}, labelled "Overload").
- Multikicker is offered up to three times; Batroc deals its damage to up to two targets.
- Melee: each attacking creature you control gets +1/+1 (one opponent).
- Typhoid Mary: you always choose the mode (not at random).
- Helmut Zemo casts the instant or sorcery for free, and gets its counter either way.
- Archnemesis isn't attached to a player: it acts on the one opponent.
- Puppet Master's Treasure ability never triggers in 1v1; its goaded creature also can't block until your next turn.
- Propaganda: attackers that can't be paid for stay home; the engine pays with any mana.
- Stilt-Man's control lasts until your next turn begins, and the permanent can still be sacrificed.
- Miracle (Molecule Man) and suspend casts go through the usual "cast for free" prompt.
- Spark Double and Chameleon copies aren't legendary (Chameleon keeps its own name in the rules).
- Bot win rates: The Fantastic Four is behind (5–15 against Avengers, 2–18 against Mabel's Militia, 10–10 against
  Wakanda Forever over 20 games); to revisit with the 9e arena tuning.

### Stream B

10a:

- Teamwork: bots (and free casts) let the engine pick the creatures to tap: ones that want tapping (Agent Maria Hill), then
  summoning-sick ones, then the biggest; mana creatures are spared when possible. The heuristic bot never pays teamwork on its own
  turn before combat, since its evaluation can't see the lost attack.
- Power-up: the cost shown in the ability menu is the printed one, not the reduced one. Wonder Man's extra activation, Hulk's
  {3} discount and Kang's "power-up abilities can't be activated" are not built yet (10c).
- Transform: after a permanent transforms, "activate only once" bookkeeping is by ability index, so it isn't reset or remapped
  between faces (no current card cares).
- K'un-Lun Warrior (not in a deck now) offers only the discard, not "sacrifice an artifact".
- Baron Strucker's "you may have it connive. Do this only once each turn" triggers once each turn even if you decline.
- Leader, Super-Genius's connive replacement is not built (10c).

10b:

- "Target player" on Restorative Technique and Panther Pounce is always you.
- Red Hulk's and Bullseye's "when you do" targets are chosen as the trigger goes on the stack. Bullseye offers only the discard
  (not "sacrifice an artifact"), and its activated ability may discard a land.
- Spider-Man, To the Rescue: the target is chosen up front, and "nonattacking" isn't checked.
- The Thing counts combat damage only. The Tiger God's "can't be blocked by more than one creature" is not modelled.
- H.E.R.B.I.E. Scout Unit doesn't offer to put a land from your hand onto the battlefield; Vision of Love offers only the discard.
- Raft Security Officer's "costs {1} less if it targets power 3 or less" is two abilities ({1} for small creatures, {2} for any).
- Knight of Wundagore and Ant-Man count any +1/+1 counter put on a creature you control, not only ones you put there.
- Left out of the decks for now (each needs a new engine piece): U.S.Agent's attached Sturdy Shield, S.H.I.E.L.D. Spy Kit,
  Spider-Woman, Captain America (Living Legend), Justice, Hellcat, Grim Reaper, Titania, Beast, Kid Loki, Frozen in Ice,
  the Vehicles (Crew N), Hulkling and Thirst for Knowledge. They come with 10c where they are rares, or when a deck needs them.

10c:

- Quicksilver always begins the game on the battlefield; Construct a Cosmic Cube's "control target opponent during their next
  turn" is an extra turn for you; Baron Helmut Zemo has no boast.
- Engine picks instead of the player: Vision Quest (the biggest artifact creature), Worlds Within Worlds (every creature card
  from every hand), Earth's Mightiest Heroes with teamwork (every creature card), The Astonishing Ant-Man (removes all its
  counters), Scientist Supreme (copies the topmost ability of your artifacts, no target).
- Doom Reigns Supreme casts one spell, not up to two; The Ruinous Wrecking Crew picks one mode, and "destroy target token" isn't
  offered; Heroic Feast puts one counter per life-gain event; The Vision may pick the same mode twice in a turn.
- Cosmic Cube counts the greatest power among all your creatures, not only attackers.
- Thor, God of Thunder returns the exiled card to your hand; The Ten Rings gives no maximum hand size instead of ten; Moon Girl
  gets +4/+4 instead of base 6/6; Ms. Marvel's base power isn't set.
- Not modelled: Black Widow, Super Spy's exile-and-cast (always the counter), Iron Man Armor's {2} becomes-a-creature ability,
  Ultron's noncreature copies becoming 2/2 creatures, Tony Stark's Equipment attaching, Nick Fury transforming what he finds,
  Winter Soldier attaching Equipment as he returns, Super-Soldier Serum's legendary Soldier and Equipment attaching, Storm giving
  flying to targeted creatures, The Serpent Society's poison ward, Avengers Disassembled's replacement basic land,
  Daredevil's Radar Sense, Hawkeye's Net and Boomerang arrows (only Explosive, when he attacks), Cloak and Dagger's hand card
  coming back (it stays exiled), Worlds Within Worlds exiling itself.
