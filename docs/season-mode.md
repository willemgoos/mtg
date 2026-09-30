# Season mode: design decisions

Working design document. Record agreed decisions here as we workshop the mode;
proposals remain open until explicitly agreed. No implementation is authorized by
this document alone.

Core design planning is complete. See the [Arena reference](season-arena-reference.md)
for published reward parameters and fidelity limits, and the
[implementation plan](season-implementation-plan.md) for milestones and validation.

## Agreed direction

- Name the mode **Season**. The name does not imply timed resets or a fixed ending;
  retain the agreed permanent, open-ended progression.
- Build a relaxed, open-ended single-player mode against bot opponents, with no
  fixed ending or required campaign finale.
- Do not include daily quests or daily bonuses in the initial release. Match coin
  rewards remain repeatable whenever the player chooses to play. Daily systems can
  be reconsidered later.
- Quick play pairs the player against a bot with a randomly selected deck, giving
  the feel of an online battle queue in an offline solo game.
- Quick-play matches are best-of-one: one game determines the match result and
  awards the applicable coin reward.
- Select opponent decks from a large roster of curated, prebuilt, viable decklists
  beyond the starter decks. Each list must have a coherent strategy, supporting
  synergies, and a suitable mana base and curve. Randomness chooses the opponent's
  deck; it does not assemble uncoordinated piles of cards.
- Target 30 curated opponent decks initially: the ten starters plus twenty
  additional builds across different strategies. Validate viability through
  bot matches and human playtesting.
- Matchmaking favours opponent decks near the selected player deck's strength,
  with some variation. Judge the selected deck rather than collection size. Bot
  skill remains randomly varied. Strength estimation and selection weights require
  implementation design and playtesting.
- Randomize bot skill in quick play as well: some opponents play better than others,
  creating a mix of easier and tougher matches. Difficulty is not manually selected
  or automatically increased with collection growth. Start with a 25% easier,
  50% medium, 25% stronger bot distribution; tune these weights through playtesting.
- Collections and progress are permanent within each save, with no automatic
  seasonal resets. Support multiple independent saves so players can start fresh
  while keeping an existing collection. Players can also deliberately reset a
  chosen save; resetting must require clear confirmation.
- Saves are named and support create, switch, rename, and reset controls, with no
  fixed save limit. Provide export/import backups containing collection, coins,
  decks, wildcard and Vault progress, starter ownership, and any unfinished match.
  Importing creates a separate save rather than overwriting an existing one.
- Persist an unfinished match within its save so the player can close the game and
  resume later, continuing with the same opponent and game state. Leaving does not
  award coins; award the applicable reward once the match finishes or an eligible
  concession occurs. Returning to a finished result must not award it again.
- Allow an unfinished match to be abandoned explicitly. Treat abandonment as a
  concession: 50 coins once the player's fifth turn has begun, otherwise zero.
  Closing the game alone preserves the match for resuming later.
- Start with one starter deck of the player's choice, then build and modify personal
  decks using owned cards. Offer all ten two-colour Arena Foundations starter decks
  as starting choices; the remaining nine become available in the starter shop.
- Each new save starts with 400 coins alongside its free starter deck, enough to
  buy two Foundations boosters at the initial price. Players may spend or save them.
- Personal decks contain at least 60 cards, with up to four copies of each card
  by name except basic lands and explicit card-rule exceptions. Basic lands are
  available in unlimited quantities. Other cards are limited to owned copies within
  each deck, but the same collection copies can be reused across multiple saved
  decklists without being reserved or consumed.
- Every implemented card in the game is legal in this mode, including cards from
  other sets. Use the same legal card pool for player and bot decks. Player decks
  still require owned copies, except unlimited basic lands; card legality does not
  change which cards can appear in Foundations boosters.
- Other starter decks are available later as one-time purchases with earned coins.
  Show their full contents before purchase; their cards join the collection and can
  be used in any personal deck. Each additional starter costs 1,000 coins initially,
  equivalent to five boosters; tune the price through playtesting if needed.
- Earn booster packs by playing against bots, expanding the cards available for
  deckbuilding.
- Coins are the main reward system: earn coins through matches against bots and
  spend them on booster packs or other starter decks. Initial balance values are
  100 coins for a win, 50 coins for a loss, and 200 coins per Foundations booster.
  Match rewards are fixed regardless of the opponent's bot skill or deck strength.
  These values can be tuned through playtesting. Starter decks cost 1,000 coins;
  drawn matches award 50 coins. Concession and abandonment eligibility are specified
  in their respective rules.
- Conceding after actual play awards the normal 50-coin loss reward. Immediate
  concessions award no coins. A concession becomes eligible once the player's
  fifth turn has begun. Earlier concessions are allowed but award no coins. This
  threshold applies to concessions, not ordinary losses from completed games.
- Target full Magic: The Gathering Foundations card support for the mode. A broad
  collection beyond the starter deck lists is part of the intended experience.
- Build a small playable Season loop using the current cards while completing
  Foundations in batches. Use the prototype to validate rewards, saves, packs, and
  deckbuilding. Full Foundations support and the 30-deck curated opponent roster
  remain goals for the complete release.
- Keep packs and collection acquisition close to established Magic products and
  conventions. Use set-based Foundations boosters rather than custom colour-themed
  shop boosters. Follow MTG Arena as the reference for pack contents and collection
  mechanics, using Arena-style Foundations packs rather than tabletop Play Boosters.
  Published slots, rarity odds, wildcard tracks, and Vault parameters are documented
  in the Arena reference. Unpublished algorithm details and additional Arena product
  scope are tracked there explicitly.
- Include wildcards that can be redeemed for one copy of any implemented collectible
  card of the same rarity, including cards outside Foundations. Obtain them through
  Arena-style wildcard drops inside boosters
  and guaranteed rewards from a pack-opening progress track. Follow Arena's track:
  an uncommon reward every six packs (first reward after three), and a rare/mythic
  reward every six packs cycling through four rare rewards then one mythic reward.
  Published wildcard drop averages are documented in the Arena reference; the exact
  increasing-probability algorithm is not published there. Use the duplicate rules
  specified below.
- All Foundations cards are obtainable: cards outside Arena's Foundations booster
  pool can be crafted with wildcards of the corresponding rarity, and acquired
  through starter decks where included. Booster contents retain Arena's eligible
  card pool rather than adding non-booster cards.
- Use Arena-style duplicate handling for boosters: once four copies of a rare or
  mythic are owned, replace further pulls with an uncompleted card of the same
  rarity from the eligible pack pool. If that rarity's pool is complete, award
  20 coins for a rare or 40 coins for a mythic instead. Excess commons and uncommons
  contribute to a Vault that awards wildcards, with Arena as the reference for
  its thresholds and rewards.
- Starter purchases grant their advertised card quantities up to four owned
  copies per card name. Excess commons and uncommons contribute to Vault progress;
  excess rares award 20 coins and excess mythics award 40 coins each. Do not
  replace starter duplicates with different cards. Unlimited basic lands need no
  duplicate compensation. Cards with explicit copy-limit exceptions need separate
  collection handling if included in a starter.

## Foundations coverage

Audit on 2026-09-30, comparing unique card names in
`packages/cards/src/generated/scryfall.json` against Scryfall's Foundations set:

| Card pool                            | Count |
| ------------------------------------ | ----: |
| Full Foundations set                 |   517 |
| Foundations cards currently included |   224 |
| Foundations cards missing            |   293 |
| Included cards from other sets       |    45 |
| Total current game card pool         |   269 |

Source: [Scryfall Foundations list](https://scryfall.com/search?q=set%3Afdn&unique=cards).
Counts exclude alternate printings of the same card. This is a card-presence audit,
not a verification that every included card's rules and bot behavior are complete.

The full set includes Starter Collection and Beginner Box exclusives as well as
cards found in boosters. Supporting the whole set and choosing the contents of
reward boosters are separate decisions.

## Remaining implementation details and validation

The core mode design is agreed. Resolve the following through reference research,
implementation planning, and playtesting; they do not require another broad design
workshop.

| Topic                               | Questions to resolve                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Booster contents                    | Generate and verify the Arena-eligible card manifest, including the separately coded Foundations Special Guests; published slots and rarity odds are in the Arena reference.   |
| Wildcard and Vault details          | Define the wildcard sampler and transaction ordering using the published reference parameters, and handle collection quantities for explicit copy-limit exceptions.            |
| Opponent implementation and balance | Author the twenty additional decklists, define strength estimation and bot skill behavior, and validate decks and selection weights through bot matches and human playtesting. |
| Save implementation                 | Define storage, backup format, compatibility, and match restoration; verify imported saves preserve progress and cannot replay already-granted rewards.                        |
| Delivery plan                       | Follow the implementation milestones; record actual verification and playtesting evidence as each is delivered.                                                                |

## Proposals discussed, not yet agreed

- One earned currency and a small pack shop with no purchase deadlines.
- No separate XP system unless player levels gain a distinct purpose.
- Starter choices, milestones, or targeted rewards for non-booster cards.
- Treat card completion as rules behavior, required UI choices, and reasonable bot
  usage, rather than only importing card data and artwork.

## Decision log

### 2026-09-30 — Phase 3 implemented

Delivered the shop, eight-reward pack sampler/reveal, wildcard tracks, Vault claims,
and collection/deck-editor crafting. Prototype packs contain 133 registered regular
FDN identities; the refreshed inventory still has 293 missing FDN names and ten
unsupported Special Guests. The documented increasing wildcard sampler is an
approximation calibrated to published averages. Full card implementation and
rules-fidelity validation remain content work alongside the next roster milestone.

### 2026-09-30 — Phase 2 implemented

Added the Season hub and playable match/reward integration, including save controls,
deck editing, pause/resume, concessions, and storage-failure recovery. Current
opponents are the ten starters; shop/crafting UI and the larger calibrated opponent
roster remain later milestones. See the implementation plan for validation evidence.

### 2026-09-30 — Phase 1 implemented

Implemented and tested the Season state/collection/economy foundation and independent
save persistence, including backup validation and replayable match transactions.
See the implementation plan for verification evidence and remaining UI/sampler
integration. The mode is not yet exposed as a playable Season screen.

### 2026-09-30 — Reference research and implementation roadmap

Documented Arena's published pack/wildcard/Vault parameters, checked the existing
code for reusable pieces, and created a five-milestone build plan with a parallel
Foundations content track. Explicitly track Special Guests, Golden Pack scope,
and unpublished wildcard algorithms as limits on exact Arena parity. No Season
implementation or playtesting has been completed as part of this documentation.

### 2026-09-30 — Final core planning decisions

Agreed on named saves with create/switch/rename/reset controls, no fixed save limit,
and export/import backups that create independent saves. Set an initial opponent
target of thirty curated decks (ten starters plus twenty additional builds),
validated by bot matches and human playtesting. Start random bot skill selection at
25% easier, 50% medium, and 25% stronger, with weights subject to tuning.

Build a playable Season prototype with existing cards alongside Foundations
implementation in batches. Full Foundations support and the curated roster remain
complete-release goals. Core design planning is complete; reference details,
implementation milestones, and playtesting remain.

### 2026-09-30 — Matchmaking by deck strength

Favour curated opponent decks close to the player's selected deck strength, with
some variation, while keeping bot skill random. This should give fresh starters
enjoyable matchups without a required difficulty climb or changing coin rewards.
The strength estimate and selection weights remain to be designed and tested.

### 2026-09-30 — Mode name

Keep **Season** as the mode name, with permanent collections and open-ended play
as already agreed.

### 2026-09-30 — Abandoning unfinished matches

Allow explicit abandonment of a saved match and apply the concession rules:
50 coins once the player's fifth turn has begun, otherwise zero. Closing the game
preserves the match instead of abandoning it.

### 2026-09-30 — Draw rewards

Award 50 coins for a drawn match, matching the ordinary loss reward.

### 2026-09-30 — Rewards independent of difficulty

Opponent difficulty does not affect coin rewards. Keep 100 coins per win and
50 per loss regardless of randomly selected bot skill or deck strength, subject
to the previously agreed concession eligibility rule.

### 2026-09-30 — No daily systems initially

Leave daily quests and daily bonuses out of the initial release. Keep progression
available through repeatable match rewards without a daily schedule. This is an
initial scope decision, not a permanent ban on future optional quests.

### 2026-09-30 — Duplicate coin compensation

Award 20 coins per excess rare and 40 coins per excess mythic from starter
purchases. Use the same amounts for booster pulls when every eligible card of
the pulled rarity is already owned in four copies. These are initial balance values.

### 2026-09-30 — Starter purchase duplicates

Grant the advertised starter copies up to four owned per card name. Convert excess
commons/uncommons to Vault progress and excess rares/mythics to coins rather than
substituting other cards. Compensation amounts remain open. Basic lands are already
unlimited; handling for explicit copy-limit exceptions remains to be specified.

### 2026-09-30 — Starter roster

Offer all ten two-colour Arena Foundations starter decks for the initial free
choice. The other nine are available as one-time purchases for 1,000 coins each.

### 2026-09-30 — Starting coins

Give each new save 400 coins in addition to its chosen free starter deck. At the
initial price this buys two Foundations boosters, allowing immediate pack opening
and deckbuilding. The coins can also be saved toward another starter.

### 2026-09-30 — Resume unfinished matches

Save unfinished matches so the player can close the game and resume later. Keep
the same opponent and game state. Award coins on match resolution, including an
eligible concession, rather than on leaving; each match reward is granted once.

### 2026-09-30 — Concession reward threshold

A concession earns 50 coins once the player's fifth turn has begun. Earlier
concessions earn nothing. Ordinary completed-game losses retain their 50-coin
reward regardless of turn count.

### 2026-09-30 — Concession rewards

Award the normal 50-coin loss reward when the player concedes after actual play.
Immediate concessions award no coins. The eligibility threshold is not yet agreed.

### 2026-09-30 — Best-of-one matches

Use best-of-one for quick play. Each game is a complete match, followed by rewards
and the option to play again or edit decks.

### 2026-09-30 — Crafting across the full card pool

Allow wildcards to craft any implemented collectible card of the matching rarity,
including non-Foundations cards. This provides an acquisition path for every legal
deckbuilding card while keeping Foundations booster contents unchanged.

### 2026-09-30 — All implemented cards legal

Allow every implemented card for both player and bot decks, including non-Foundations
cards. Retain the agreed deckbuilding and ownership rules. Foundations boosters
keep their established pool; acquisition routes for other cards remain to be settled.

### 2026-09-30 — Foundations cards outside boosters

Make Foundations cards outside the booster pool craftable with wildcards of the
corresponding rarity. They can also be acquired through starter decks that contain
them. Keep Arena's eligible card pool for Foundations boosters.

### 2026-09-30 — Additional starter price

Agreed to an initial price of 1,000 coins for each additional starter deck, equal
to five Foundations boosters. Each starter remains a one-time purchase. Tune the
price through playtesting if needed.

### 2026-09-30 — Initial coin economy

Agreed to 100 coins per win, 50 per loss, and a 200-coin Foundations booster as the
initial balance values. Two wins buy a pack; a mix of one win and two losses also
buys a pack. Tune through playtesting if needed. Starter prices and match reward
edge cases remain open.

### 2026-09-30 — Duplicate handling

Agreed on booster duplicate protection for rares and mythics, excess common and
uncommon copies contributing to a wildcard-awarding Vault, and coin compensation
when all eligible cards of the pulled rare/mythic rarity are already owned in four
copies. Coin amounts and treatment of duplicates from starter purchases remain open.

### 2026-09-30 — Wildcard acquisition

Agreed to Arena-style wildcard drops inside boosters and guaranteed wildcard
rewards through the pack-opening progress track. Duplicate handling is the next
open decision; Vault rewards are not yet agreed.

### 2026-09-30 — Wildcards

Include Arena-style wildcards for acquiring specific cards of the corresponding
rarity. Exact acquisition rules and duplicate handling remain to be settled.

### 2026-09-30 — Player deckbuilding rules

Agreed on a minimum of 60 cards and a four-copy limit by card name, with exceptions
for basic lands and cards whose rules allow otherwise. Basic lands are unlimited.
Each deck must respect the collection's owned copy counts for other cards, while
saved decks can freely share those copies.

### 2026-09-30 — Initial direction

Established the core idea: start with starter decks, build personal decks, and earn
boosters through matches against bots in a campaign / seasonal mode. Full
Foundations support is the target; the season structure, economy, persistence, and
implementation order remain open.

### 2026-09-30 — Open-ended quick play

Chose a relaxed mode with no real ending: queue into a match against a bot with a
random deck, earn rewards, improve personal decks, and keep playing. This replaces
the earlier campaign-map, league, division-climb, and championship proposals as the
main structure. The reward system remains undecided: XP toward packs, packs per
win, and coins to purchase packs are the options under discussion.

### 2026-09-30 — Coins as the main reward system

Chose coins earned through bot matches and spent on booster packs as the main
reward system. This resolves the earlier choice between XP toward packs, direct
packs per win, and coins. Pack types, prices, win/loss payouts, and any additional
progression systems remain undecided.

### 2026-09-30 — Starting deck and additional starters

Chose one free starter deck of the player's choice at the beginning. Other starters
can be purchased once each with earned coins, with contents visible before buying.
Their cards become part of the player's collection for use in custom decks. The
starter roster and prices remain open.

### 2026-09-30 — Stay close to Magic pack conventions

Established a preference for familiar Magic packs and acquisition conventions.
Removed custom colour-themed shop boosters from consideration; set-based
Foundations boosters are the direction. Whether to mirror Arena packs or tabletop
Play Boosters is still open. The previously agreed starter-deck purchases remain.

### 2026-09-30 — Arena pack and collection reference

Chose MTG Arena as the reference for pack contents and collecting cards. Foundations
packs should follow Arena's format rather than tabletop Play Boosters. Document
the exact pack distribution, wildcard rules, and duplicate handling separately;
this does not automatically adopt Arena's prices or reward pacing.

### 2026-09-30 — Permanent progress and independent saves

Keep collections and progress permanently, without automatic resets. Allow multiple
independent saves for fresh starts without losing an existing collection, and allow
the player to explicitly reset a chosen save with clear confirmation. Each save
owns its collection, coins, decks, and progression. Save-management UI and any save
limit remain open.

### 2026-09-30 — Random opponent skill

Chose randomly varied bot difficulty in quick play to evoke facing players of
different abilities: some opponents are stronger players than others. This replaces
manual difficulty selection or a required difficulty climb as the collection grows.
The distribution of skill levels and how bot skill combines with deck strength
remain undecided.

### 2026-09-30 — Curated opponent deck roster

Require a large selection of prebuilt, viable opponent decks beyond the starters.
Decks should be deliberately built around coordinated strategies, with suitable
mana and supporting cards. Quick play randomly selects a finished decklist rather
than generating a random collection of cards. Roster size, archetype coverage,
and validation criteria remain open.
