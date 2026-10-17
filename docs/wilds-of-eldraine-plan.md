# Plan: Wilds of Eldraine (WOE)

Target: Arena's official Wilds of Eldraine products, exact lists: the **15 Story Decks** (60 cards each, on Arena since
6 September 2023; ten two-colour, one per colour pair, and five three-colour) and Arena's **ten Jump In packets** (random
slots included). Then every other card of the main set (`is:booster`) and boosters. Arena's lists exist, so **no decks of
our own and no human-made decks** (the user's rule). No Commander decks (WOC).

One branch, `wilds-of-eldraine`, one sub-phase at a time. Read `docs/tarkir-dragonstorm-plan.md` and
`docs/lord-of-the-rings-plan.md` first: this plan reuses their rules, wiring and agent setup and doesn't repeat them.

## Rules

Same as Tarkir: Dragonstorm: engine vocabulary in its own commented block (`// Wilds of Eldraine (23a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, rules text from
the Scryfall oracle text. **No shortcuts**: a card does exactly what its text says, or it stays out (wording in
`docs/marvel-jumpstart-handoff.md`). Anything not exact goes in `docs/shortcuts.md`.

## Sources

- Story Decks: `packages/cards/scripts/data/woe-story-decks.json`, parsed from Wizards'
  [Wilds of Eldraine Story Decks](https://magic.wizards.com/en/news/mtg-arena/wilds-of-eldraine-story-decks) (all 15 at 60
  cards). mtg.wiki's copy is wrong for Slumber for War (53 cards) and Candy and Crumbs; don't use it.
- Jump In: the ten `"set": "Wilds of Eldraine (WOE)"` entries in `packages/cards/scripts/data/arena-jumpin-packets.json`,
  parsed from Wizards' [Jump In! Update for Wilds of Eldraine](https://magic.wizards.com/en/news/mtg-arena/jump-in-update-for-wilds-of-eldraine).
  12 cards each (`fixed` plus one card per `slots` entry; Wizards lists the first option of each slot in its list). They
  rotated out of Arena's Jump In in 2025 but are Arena's own lists. They include the Phyrexia: All Will Be One Sphere
  lands (The Fair Basilica, The Surgical Bay, The Dross Pits, The Autonomous Furnace, The Hunter Maze).
- Some deck and packet cards are reprints or other printings (Mocking Sprite, Ruby, Evolving Wilds, Quick Study, ...);
  17 of them already have behaviour.

## Build groups

`packages/cards/scripts/data/woe-groups.json` (256 cards without behaviour, front-face names):

| Group | Cards | Phase |
| --- | --- | --- |
| white, blue, black, red, green | 35, 31, 34, 37, 35 (Story Deck and Jump In cards) | 23b |
| multicolour, colorless, land | 17, 9, 11 (Story Deck and Jump In cards) | 23b |
| `<colour>-main`, `multicolour-main`, `colorless-main`, `land-main` | 47 (the rest of the booster set) | 23d |

Layouts: 199 normal, 49 Adventures, 8 Sagas.

## Phases

- **23 wiring**: `src/wilds-of-eldraine.ts` merging `src/woe/<group>.ts` stubs, registered like Lord of the Rings
  (`behaviors.ts`, `pool.ts` `WILDS_OF_ELDRAINE_POOL`, `index.ts`, `cards.test.ts`); `woe` in `SET_PREFERENCE` (check no
  existing card moves printing); `scripts/woe-status.ts`; `'woe'` in `Packet.set`; shared tokens (Roles, Food exists, ...)
  in `src/woe/tokens.ts`.
- **23a**: engine groundwork for the mechanics below, with tests, bot handling and Arena-style prompts. **Done**, see "Phase 23a"
  below.
- **23b**: the Story Deck and Jump In cards, one Sonnet agent per group in worktrees.
- **23c**: the 15 Story Decks in the deck registry (shown as "Wilds of Eldraine story decks") and the ten Jump In packets
  (`ARENA_WOE_PACKETS`, picker group, Quick match set `woe`), bot games over the decks.
- **23d**: the rest of the booster set, then boosters in Expedition, Season and Sealed.

## Mechanics (23a)

| Mechanic | Engine (23a) |
| --- | --- |
| Adventure (49 cards) | existed (Final Fantasy, Tarkir Omens); `hasAdventure` filter, Adventure-spell trigger, counts (23a) |
| Role tokens (Cursed, Monster, Royal, Sorcerer, Virtuous, Wicked, Young Hero; one Role per controller per creature, rule 303.7) | done (23a): `createRole`, the seven tokens, the state-based action |
| Bargain (sacrifice an artifact, enchantment or token as an additional cost; "if this spell was bargained") | done (23a): `bargain()` |
| Celebration (two or more nonland permanents entered under your control this turn) | done (23a) |
| Food | exists |
| Sagas (8) | exist |
| Restless manlands (enter tapped, become a creature until end of turn, attack trigger) | done (23a): the `animate` effect |
| Sphere lands (enter tapped, sacrifice to draw) | existed; `sphereLand()` (23a) |
| "Enchanted creature you control" / "creature with an Aura" counts, Ward, scry, mill, surveil | exist; the anthem now checks `enchanted` (23a) |

## Phase 23a: engine groundwork

**Done** (17 October 2026; engine in `engine/src/woe-23a.ts` plus hooks marked `// Wilds of Eldraine (23a)`, tests
`engine/test/woe-23a-*.test.ts` with the fixture cards in `woe-fixtures.ts`, `ai/test/woe-23a.test.ts` (bot rules in `ai/src/woe.ts`),
`web/test/woe-interaction.test.ts`, `cards/test/woe-vocab.test.ts`; card builders in `cards/src/woe-vocab.ts`). The names below are what
23b card agents use. Every engine name is in `engine/src/types.ts` (search "Wilds of Eldraine (23a)"); the example is the card it was
built for.

**Wiring the set needs** (23b): register `WOE_ROLE_TOKENS` (from `woe-vocab.ts`) in the set file next to the set's own tokens: the
seven Role tokens, ids in `ROLE` (`woe-cursed-role`, `woe-monster-role`, `woe-royal-role`, `woe-sorcerer-role`, `woe-virtuous-role`,
`woe-wicked-role`, `woe-young-hero-role`). `KEYWORDS_AS_ABILITIES` in `build.ts` already has Bargain and Role token; Celebration is an
ability word ("Celebration —"), which `mapKeywords` skips. Food, Treasure and the 1/1 black Rat ("This token can't block.") are the
usual tokens.

### Roles

- `createRole(role, to?)` = `{ kind: 'createRole', role: ROLE[role], to }` ("create a Monster Role token attached to target creature
  you control"; `to` defaults to the first target). For each creature `to` names that is on the battlefield, a Role token under your
  control enters attached to it (an Aura entering: Tanglespan Lookout sees it; token doublers make more, and the extras go at once).
  Nothing is made for a creature that has left. Guard Change `spell: { targets: [yourCreature], effects: [createRole('Monster')] }`;
  Cursed Courtier `etb [createRole('Cursed', 'self')]`; Asinine Antics `createRole('Cursed', { each: 'creature', controller:
  'opponent' })`; Twisted Sewer-Witch `createToken` Rat, then `createRole('Wicked', { each: 'creature', controller: 'you', filter: {
  subtype: 'Rat' } })`; Return Triumphant `[returnToBattlefield { target: 0 }, createRole('Young Hero', 'chosen')]` (the returned
  permanent is 'chosen'); "up to one target" (Cut In, Twisted Fealty, Eriette's Whisper) is an `optional` target: nothing without one.
- Rule 303.7 is a state-based action (`rolesSBA`, 704.5y): a permanent with more than one Role controlled by the same player keeps the
  one with the latest timestamp; the others go to the graveyard. Roles of different players stay (an opponent's Cursed Role and your
  Monster Role: base 1/1, then +1/+1).
- The tokens (`roleToken(role, id?)`: colorless Aura enchantment tokens with Enchant creature, from Scryfall's token text): Cursed
  `attached { basePT: [1, 1] }` (counters and pumps still apply on top); Monster +1/+1 and trample; Royal +1/+1 and `wardOne`;
  Sorcerer +1/+1 and `grantAbilities` "whenever this creature attacks, scry 1" (the creature has it, its controller scries); Virtuous
  +1/+1 for each enchantment the Role's controller controls (itself included); Wicked +1/+1 and `tokenToGraveyard` (each opponent loses
  1 life); Young Hero `grantAbilities` "whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it" (an
  intervening if on the creature's toughness; no +1/+1 of its own).
- The older Roles now use the same definitions under their own ids: Spellbook Vendor's Sorcerer Role (`soc-15b-w-sorcerer-role`), Lord
  Skitter's Blessing's Wicked Role (`soc-15b-b-wicked-role-token`; its enters trigger is `createRole` now, so it replaces your other
  Role), Royal Treatment and Monstrous Rage (`archive-*-role-token`). They are colorless now (they were coloured), Spellbook Vendor's
  scry is the creature's own trigger, and Monstrous Rage targets any creature as printed (it was "creature you control").
- A Role is an enchantment and a token: bargain may sacrifice it, and "whenever an enchantment you control is put into a graveyard from
  the battlefield" sees it go (`whenEnchantmentYouControlToGraveyard(effects)`: Wicked Visitor, Ashiok's Reaper, Knight of Doves,
  Savior of the Sleeping, Warehouse Tabby). "Enchanted creatures you control get +2/+2" is `enchantedCreaturesYouControlGet(2, 2)` (A
  Tale for the Ages, Syr Armont; any Aura makes a creature enchanted). "Whenever an Aura you control enters" is
  `whenEnchantmentYouControlEnters(effects, targets, { subtype: 'Aura' })` (Tanglespan Lookout; the default filter is an enchantment:
  Rimefur Reindeer).

### Bargain

`bargain(opts?)` = `kicker: { cost: {0}, as: 'bargain', sacrifice: ARTIFACT_ENCHANTMENT_OR_TOKEN }`, with `opts.spell` (an instant or
sorcery whose whole text changes when bargained) and `opts.costReduction` ("this spell costs {2} less to cast if it's bargained": Hamlet
Glutton `bargain({ costReduction: 2 })`, Ice Out 1, Johann's Stopgap 2; taken off the generic part). The cast menu has two entries,
"Bargain: sacrifice an artifact, enchantment, or token" (plus "(costs {2} less)") and "Don't bargain"; the first then asks for the
permanent on the board (one cast action per permanent you could sacrifice; lands and nontoken creatures can't be). "If this spell was
bargained" is `wasBargained` (`{ kind: 'wasKicked' }`) and `ifBargained(then, else?)` is an effect (Candy Grapple `ifBargained([-5/-5],
[-3/-3])`, Archon's Glory `[pump +2/+2, ifBargained([flying and lifelink])]`); a permanent remembers: `whenEntersIfBargained(effects,
targets?)` (Agatha's Champion, High Fae Negotiator, Troublemaker Ouphe; Diminisher Witch with `createRole('Cursed')` on `{ what:
'creature', controller: 'opponent' }`). Copies of a bargained spell are bargained. Torch the Tower (Strixhaven Brawl) shows as bargain now.

### Celebration

`celebration` = `{ kind: 'celebration' }`: two or more nonland permanents entered the battlefield under your control this turn (tokens and
Roles count, lands don't; every entering counts, even if the permanent left since; `s.turn.nonlandEntered`, reset each turn).
`celebrationBoost(p, t, keywords?)` is the static (Armory Mice `celebrationBoost(0, 2)`, Grand Ball Guest `(1, 1, ['trample'])`, Gallant
Pie-Wielder `(0, 0, ['doubleStrike'])`, Tuinvale Guide `(1, 0, ['lifelink'])`); `celebrationAtCombat(effects, targets?)` the
beginning-of-combat trigger (Pests of Honor, Belligerent of the Ball, Raging Battle Mouse, Bespoke Battlegarb); Ash, Party Crasher is an
`attacks` trigger with `condition: celebration`.

### The Restless lands and the Sphere lands

- `{ kind: 'animate', what, power, toughness, colors?, subtype?, keywords?, abilities?, permanent? }`: "becomes a P/T <colors> <subtype>
  creature [with <keywords>] until end of turn. It's still a land." It keeps its card types (a land stays a land and still taps for
  mana), gets base P/T, its colours are replaced, `subtype` is its creature type, `abilities` are granted until end of turn ("During
  your turn, this creature has first strike": Restless Spire). `animateSelf(cost, spec, label?)` is the activated ability: Restless
  Bivouac `animateSelf(mana('{1}{R}{W}'), { power: 2, toughness: 2, colors: ['R', 'W'], subtype: 'Ox' })`. The attack trigger is
  `whenThisAttacks(effects, targets?)` (Bivouac's +1/+1 counter, Fortress's drain, Spire's scry, Vinestalk's `pump { setBase: true }`
  3/3 on "up to one other target creature"). `permanent: true` has no end: Brave the Wilds' "target land you control becomes a 3/3
  Elemental creature with haste that's still a land"; Tough Cookie's "becomes a 4/4 artifact creature" is `animate` without colours or
  subtype. Restless Cottage (Strixhaven Brawl) uses it now (it stayed a Horror for good and kept its colours).
- `sphereLand(color)`: "This land enters tapped. {T}: Add {W}. {1}{W}, {T}, Sacrifice this land: Draw a card." in its colour (The
  Fair Basilica: `sphereLand('W')`; the Sphere type comes from Scryfall).

### Tapping the opponent's creatures

`{ on: 'youTapOpponentCreature' }`: whenever you tap an untapped creature an opponent controls with a spell or ability you control (the
`tap` effect; the creature is the subject). `whenYouTapOpponentCreature(effects, opts?)`: Icewrought Sentry (+2/+1 on self); Solitary
Sanctuary with `targets`; Sharae `{ oneOrMore: true, oncePerTurn: true }` (one trigger for a spell that taps two); Hylda `{ cost:
mana('{1}') }`. `tapAndStun(to, n)` = tap and n stun counters (Sharae, Freeze in Place 3, Snaremaster Sprite, Succumb to the Cold on
each target). A custom effect that taps passes the player (`tap(ctx, id, es.controller)`) to count.

### Adventures and other counts

- Adventures need no builder: the fetch script makes the creature (or enchantment) with `adventure: true` and `back` = the Adventure
  spell (subtype Adventure). Cast as the Adventure from hand, the card goes on an adventure in exile; from there only the creature (or
  the Virtue) may be cast. `HAS_ADVENTURE` = `{ hasAdventure: true }`, "a card that has an Adventure" (an Omen card has none): Edgewall
  Inn's graveyard target, Sentinel of Lost Lore, Seek Thrills. As a spell filter it matches the creature spell, not the Adventure
  spell: Beluna Grandsquall `adventurePermanentsCostLess(1)`. `castAdventureSpell(effects)` = `castSpell` with `spell: { subtype:
  'Adventure' }` (Storyteller Pixie; Chancellor of Tales with `copySpell`). `instantSorceryOrAdventureCardsInGraveyard` (Frantic
  Firebolt with `plus: 2`, Hearth Elemental's `costReduction`) is `{ count: 'cardsInGraveyard', filter }` (the count takes a `filter`
  now). `ownsAdventureInExile` (Howling Galefang) = `{ kind: 'ownsInExile', filter }`.
- `creaturesAttackedThisTurn` = `{ count: 'creaturesAttackedThisTurn' }` (Rowdy Research, Witchstalker Frenzy `costReduction`);
  `foodsYouControl` (Night of the Sweets' Revenge, Welcome to Sweettooth); `ARTIFACT_ENCHANTMENT_OR_TOKEN` (Devouring Sugarmaw,
  Lich-Knights' Conquest).
- Existing vocabulary the set needs: "your first instant or sorcery spell each turn" (`castSpell` `'firstInstantOrSorcery'`), "a spell
  with mana value 5 or greater" (`castSpell` `spell: { minManaValue: 5 }`), "the second spell you cast each turn costs {1} less"
  (Tarkir's `spellsCostLessIf` with `spellsCastThisTurn`), stun counters (`namedCounters 'stun'`), "if you control an enchanted
  creature" (`controlsCreature { enchanted: true }`), "enchanted by Auras you control" (`enchantedByYourAura`). `defMatches` (the
  printed-card filter of death and cast triggers) now honours `anyOf`, so "a creature or artifact you control dies" no longer matches
  everything.

### Bots and interface

- Bots: bargain, the permanent to sacrifice and Role targets are chosen by evaluation (a Food is bargained away only when the bigger
  effect is worth it; a Cursed Role goes on the opponent's best creature, a Monster Role on ours). Celebration: before combat the
  evaluation counts the beginning-of-combat celebration payoffs that are on, and a creature isn't held back for after combat while a
  celebration permanent waits for its second nonland permanent. Restless lands: in the first main phase, with nothing better to do, the
  bot animates a land when its attack plan after the activation would use it.
- Interface: the bargain cast menu and prompt ("an artifact, enchantment, or token to sacrifice (bargain)"), tooltips for Role token,
  Bargain, Celebration and Adventure, and on a permanent its stun counters and each Role on it.

### Not covered (23b card-specific work)

One-off pieces the card agents build with a test: Goddric, Cloaked Reveler (a celebration Dragon with base 4/4, flying and an ability:
`while` has no creature type or granted abilities), Archon of the Wild Rose (base 4/4 and flying for creatures enchanted by your Auras:
the anthem has no base P/T), Not Dead After All (the returned creature gets a Wicked Role), Hylda's "you may pay {1}. When you do, choose
one", Redtooth Vanguard (an enchantment-enters trigger from the graveyard), Extraordinary Journey ("entered from exile or was cast from
exile"), Faerie Fencing ("if you controlled a Faerie as you cast this spell"), Agatha's Soul Cauldron, Johann, Virtue of Knowledge,
Virtue of Strength, Ashiok, The End, Beseech the Mirror, Talion, The Irencrag, Likeness Looter, Imodane, Three Bowls of Porridge, Feral
Encounter, Rotisserie Elemental, Lagoon Breach and Misleading Motes (top or bottom), Food Fight. Bots don't animate a Restless land to
block.

## Status and handoff

- **23a done** (17 October 2026) on its own branch; see "Phase 23a" above. 23b can start once it and the set wiring are merged.
- **23c done** (17 October 2026): `WILDS_OF_ELDRAINE_STORY_DECKS` (decks.ts, generated from `woe-story-decks.json`; ten two-colour, five three-colour; blurbs in `deckArt.ts`, art from the face card) in `DECKS` and a "Wilds of Eldraine story decks" group in the deck picker (App.tsx); `ARENA_WOE_PACKETS` (jumpin.ts, from the ten WOE entries of `arena-jumpin-packets.json`) in `PACKETS`, the Jump In picker group and Quick match set `woe`. Tests: `woe-story-decks.test.ts` (cards), `jumpin.test.ts`, `woe-decks.test.ts` (ai; `WOE_WINRATES=1` prints wins). Bittersweet has two Mintstrosity (Wizards lists it on two lines). Five packets have their land as a random slot, so they have `lands: []`. Season/Expedition are not wired: they read booster sheets, and WOE has none until 23d.
