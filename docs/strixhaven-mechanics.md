# Strixhaven mechanics: design notes (research only, 3 Oct 2026)

Card text is from the Scryfall API (oracle text), engine facts are from grep of packages/engine/src and packages/cards.
Comprehensive Rules numbers were not looked up (these mechanics are ability words or too new); Scryfall rulings were used instead.
Sizes: S = under half a day, M = about a day, L = several days.

## Summary table

| Mechanic | Size | Fits existing concepts? |
| --- | --- | --- |
| Magecraft (24 STX cards) | S | yes; needs a "spell copied" event |
| Opus (10) | S | yes; `minManaSpent` exists |
| Repartee (12) | S | yes; one new `castSpell` filter |
| Infusion (12) | S | yes; `lifeThisTurn` condition exists |
| Increment (9) | S | yes; `manaSpent` on the spell object exists |
| Converge (9) | M | needs colours of mana spent (only a count is stored) |
| Paradigm (5) | M | new per-player state plus a main-phase trigger |
| Modal DFC (16) | S | **already in the engine** (Marvel); plan's "none" is wrong |
| Learn / Lessons (21 + 20 Lessons) | M | needs a per-player sideboard and one prompt |
| Prepare (36 cards, 38 with keyword) | L | mostly yes; one new object flag and a new cast path |
| Walker commander (Quintorius) | S | nothing in the engine blocks it; test, docs and UI strings do |

## Prepare (priority)

### (a) Rule and Scryfall data

Layout `prepare`: one card, two faces. Face 1 is a creature (the "preparation card"), face 2 is an instant or sorcery
(the "prepare spell"). Not a DFC: both faces sit on one card face (one image, one frame). Rulings (Scryfall, e.g. Emeritus of Conflict):

- Reminder text on every card: "(While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)"
- "As an effect causes a creature with a prepare spell to become prepared (including 'enters prepared'), that creature's
  controller creates a copy of that creature's prepare spell in exile. That copy remains in exile for as long as that
  permanent is on the battlefield and is prepared. That creature's controller may cast that copy as long as it remains
  in exile. As they cast it, that creature stops being prepared."
- A creature already prepared can't become prepared again (no second copy). Becoming unprepared by an effect makes the exiled copy cease to exist.
- Only the current controller can cast the copy. Cast from exile, so ordinary cast rules apply (mana cost paid, targets
  chosen, it is a cast: magecraft-style triggers see it, storm-count includes it). Not an alternative cost.
- Preparation card is a creature card in every zone (the back face is not castable from hand; unlike an MDFC).
- Prepared state is not copiable; it survives losing abilities, stopping being a creature, becoming a copy.
- Spells copied this way: exempt from the "copies in other zones cease to exist" SBA while the permanent stays prepared.
- Nothing changes the permanent's own characteristics: it is still just the creature.

Oracle text of the front face, three patterns (all 36 cards fall into these):

- "enters prepared" (Goblin Glasswright: "This creature enters prepared."; about 17 cards).
- "Whenever X, this creature becomes prepared" with an arbitrary trigger: Emeritus of Conflict ("Whenever you cast your third
  spell each turn"), Encouraging Aviator (attacks), Leech Collector (first life gain each turn), Tam (landfall), Kirol
  (cards leave your graveyard), Spiritcall Enthusiast (tokens enter), Scathing Shadelock (first main phase), Scheming
  Silvertongue / Joined Researchers / Grave Researcher (end step or upkeep condition), Abigale (cast a creature spell).
- Activated: Harmonized Trio ("{T}, Tap two untapped creatures you control: This creature becomes prepared."), Lluwen
  ("Exile a creature card from your graveyard: Lluwen becomes prepared. Activate only as a sorcery.").

Scryfall JSON for a prepare card (checked: Emeritus of Conflict, Goblin Glasswright, Jadzi Steward of Fate):

- `layout: "prepare"`, `name: "Emeritus of Conflict // Lightning Bolt"`, `card_faces` = 2 entries.
- Top level carries the whole card: `mana_cost: "{1}{R} // {R}"`, `type_line: "Creature — Human Wizard // Instant"`,
  `power/toughness` (front's), `colors`, `color_identity`, `keywords: ["First strike","Prepared"]` (both faces'), `cmc` (front's), and
  **`image_uris` (one image for the whole card)**.
- Each face has: `name, mana_cost, type_line, oracle_text, power/toughness (front only), artist, artist_id,
  illustration_id (front only)`. Faces have **no `colors`, no `image_uris`, no `cmc`**.
- `all_parts` lists tokens (Treasure, Fractal) plus a `combo_piece` entry pointing to the card itself.
- Legal in Standard etc. `booster: false` for the whole set (as the plan says).

Back-face names are real card names: Lightning Bolt, Ancestral Recall, Swords to Plowshares, Demonic Tutor, Raise Dead,
Regrowth, Reanimate, Brainstorm, Rampant Growth, Sign in Blood, Jump, Rejoinder, Deep Sight...

### (b) Mapping onto the engine

Nearest existing features:

- Two faces, one card: `back?: CardDefId` on `CardDefinition` (types.ts ~204), `faceRecords()` in
  `packages/cards/scripts/fetch-scryfall.ts` (front gets `back: name`, back gets `front: name`), `withBackFace` (context.ts ~583).
- "Cast from exile": `fromExile` on stack items (Klaw), `castableCards` in legal.ts (hand, command zone, graveyard flashback...).
- Copy of a spell as a token-like stack object: `copySpell` in effects.ts ~1978 (`createObject(..., 'stack', true)`, `copy: true`).
- Counting casts: `spellCast` event with `nth` (stack.ts ~411) feeds "third spell each turn" like the existing `ev.nth === 2` code (triggers.ts ~654).
- Trigger sources needed by cards: `firstLifeGainThisTurn` (exists), landfall (exists), `leftGraveyard` counter (context.ts ~337, no event yet), `beginningOfMain`, end step, attacks.

Proposed model (follows the rulings literally, so rules text stays right):

1. `CardDefinition.prepare?: true` on the front record (set by the fetch script like `adventure`). With it, `legal.ts` line ~419
   (the MDFC "cast the back from hand" branch) must **not** offer the back face from hand; the back stays a spell definition only.
2. `GameObject.prepared?: ObjectId` (the id of its exiled copy). New effect `{ kind: 'prepare', what: Ref }`: no-op if the
   permanent has no `back` or is already prepared; otherwise `createObject(ctx, def.back, controller, 'exile', true)` (token-like,
   like the copySpell object), store its id on the permanent, store the permanent's id on the copy (`preparedBy`).
   "Enters prepared" = a static flag `entersPrepared` or an ETB hook; both reduce to this effect.
3. Cast path: `castableCards` also lists exile objects with `preparedBy` set whose permanent is still on the battlefield and
   controlled by `player`. `castSpell` (stack.ts ~290) then runs the ordinary path with zone 'exile' (cost, targets, `fromExile`,
   `spellCast` emit), and on moving to the stack unprepares the permanent. When it resolves the token-like copy ceases to
   exist (check that `moveObject` of a token from exile/stack to graveyard deletes it, as copySpell relies on).
4. Cleanup: when a prepared permanent leaves the battlefield (context.ts leave-battlefield code ~387-410), delete its exiled copy.
   An explicit `unprepare` effect (no card seems to need one except rulings) can share that helper.
5. Back-face spells that reference "this creature" (Pack a Punch, Bloodletting...) are cast spells with the permanent as
   source: check each; most just read "target creature" / "you".
6. UI (`apps/web`): the prepared state needs a badge on the permanent and a cast button; Arena shows the spell as a
   button on the card. Small, but not in the engine.
7. Bots (packages/ai) see the copy as one more legal `castSpell` action; no new logic needed unless they should value it.

### (c) What is new

- New: `prepared` object state and its exile copy; `prepare` effect; `entersPrepared`; cast path for the copy (reuses exile cast).
- New triggers per card: "cards leave your graveyard" (needs an event; the counter exists), "tokens you control enter" (check),
  "third spell each turn" (nth === 3, copy of the nth===2 code), "end step, if an opponent has more cards in hand".
- Fetch script (see below). Pool/behaviour per card: 36 cards, each with a small front-face trigger and a back-face spell.

Verdict: **fits existing concepts** (token-like objects, cast from exile, `back` faces, `nth` spell counting). It needs one new
object flag, one new effect, one cast-path branch and some triggers; no new zone or rules layer. Size **L** mainly because
of 36 cards x 2 faces, one day for the model and plumbing.

### Fetch script and card records

`fetch-scryfall.ts`: `DOUBLE_FACED = ['modal_dfc','transform']`, `ADVENTURE = 'adventure'`, `isFaced()` (line ~66-72); `main()`
filter (line ~130) skips layouts other than normal/class/saga unless faced; `faceRecords()` builds two `ScryfallCard`s.
`prepare` needs:

- Add `const PREPARE = 'prepare'`, include it in `isFaced`; in `faceRecords` set `...(i === 0 && c.layout === PREPARE ? { prepare: true } : {})`
  and add `prepare?: boolean` to `ScryfallCard` (`packages/cards/src/scryfall-types.ts`).
- **Colours**: `f.colors ?? []` is empty for prepare faces; fall back to the top-level `c.colors` (front) and derive the back's
  colours from its mana cost (or reuse `c.colors`, which matches in the 3 cards checked).
- **Image**: `f.image_uris ?? c.image_uris` already works (the single shared image); both records get the same image.
- **Keywords**: the existing filter keeps keywords whose text appears in the face's text; "Prepared" appears in the front only. Fine.
- **Colour identity** (build.ts `colorIdentityOf`) reads only the one record: use the card's top-level `color_identity` for both
  faces (the back's `{X}{X}{U}` cost is not on the front). Same issue exists for MDFCs: Marvel handled it; check `colorIdentity` on backs.
- **Id collision (surprise)**: card ids are `slug(name)`, and the back faces are names of existing cards (Lightning Bolt,
  Swords to Plowshares, ...). The pool is keyed by name, so a back record would overwrite or duplicate the real card in
  `cardDb`. Give prepare backs a distinct id (for example `slug(front) + '-prepare'` or `slug('Lightning Bolt (Emeritus of Conflict)')`)
  in `faceRecords`/`slug`, and make `back:` refer to that id. The display name stays "Lightning Bolt".
- Tokens: Treasure, Fractal, Inkling, Pest, etc. come from the set's token sheet (`tsos`), as in the plan's wiring step.
- Pool: the pool lists front names (`Emeritus of Conflict`), as FIN does for adventure fronts.

## Magecraft and Opus (shared)

(a) STX: "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+0 until end of turn." (Eager
First-Year.) SOS Opus (Tackle Artist): "Whenever you cast an instant or sorcery spell, put a +1/+1 counter on this creature. If five
or more mana was spent to cast that spell, put two +1/+1 counters on this creature instead." Opus has no "copy".

(b) `castSpell` trigger with `filter: 'instantOrSorcery'` (types.ts ~370-390, `spellMatches` in triggers.ts ~274) and `minManaSpent`
(triggers.ts ~649; `GameObject.manaSpent`, stack.ts ~388) already exist. Magecraft misses copies: `copySpell` (effects.ts ~1978)
creates the copy with no event. Opus's "5 or more instead" is "two triggers" (`minManaSpent` plus a new `maxManaSpent`) or an
effect with `amount` conditional on `manaSpentOnSubject` (types.ts ~809, effects.ts ~391; both exist).

(c) New: a `spellCopied` event emitted by `copySpell` (and a `copied` flag so magecraft's trigger also matches when the
`castSpell` trigger is declared `orCopy: true`). Copies of cast spells in Foundations (Ancestral Communion style) would then
trigger magecraft correctly. Size S (the cards are separate work; 24 + 10 behaviours are mostly one-liners).

## Repartee

(a) "Repartee — Whenever you cast an instant or sorcery spell that targets a creature, ..." (Graduation Day: "put a +1/+1 counter on
target creature you control.").

(b) A new `castSpell` filter next to `'instantOrSorceryTargetingArtifactOrLand'` (types.ts ~385, handled in `spellMatches`
using `item.targets`). Add `'instantOrSorceryTargetingCreature'` (check the target's current types on the battlefield).

(c) S.

## Infusion

(a) "Infusion — If you gained life this turn, that creature also gains trample and indestructible until end of turn." (Efflorescence.)
Also "Infusion — At the beginning of your end step, sacrifice a permanent unless you gained life this turn." (Tragedy Feaster.)

(b) `ctx.s.turn.lifeGains[player]` (effects.ts ~305, reset turn.ts ~162) is already tracked; `ConditionDef` `lifeThisTurn` with
`gained: true` (triggers.ts ~117) tests it. Spell effects with a condition: use the existing conditional effect.

(c) S, no engine work expected. Note: lifelink / lifegain must go through `gainLife` (effects.ts ~298) so it counts; it does.

## Increment

(a) "Increment (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness,
put a +1/+1 counter on this creature.)" (Ambitious Augmenter.) "Power or toughness" means the lesser of the two.

(b) `castSpell` trigger with `caster` default (yours); `GameObject.manaSpent` on the spell object is available at trigger time.

(c) New: trigger field `manaExceedsSourceLowestStat: true` (or a general condition) compared against current P/T via
`characteristics.ts`. Size S. Ambitious Augmenter's death clause (move counters to a Fractal token) needs "had counters" last-known info; check `diesTrigger` support.

## Converge

(a) "Converge — Target player discards X cards, where X is the number of colors of mana spent to cast this spell." (Arcane Omens.)
Also on creatures: "Converge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it." (Magmablood Archaic.)

(b) `{ manaSpentOnSubject: true }` Amount (types.ts ~809, effects.ts ~391) reads `GameObject.manaSpent`, which is only a **count**
(stack.ts ~388 `payment.length`). Payment is a list of source ids (`Payment`, mana.ts), and a source can have several
`produces`, so which colour paid which pip is not recorded.

(c) New: record `manaColors: Color[]` on the spell object when it is cast, using the same assignment the cost check uses
(Arena auto-pays to maximise colours; pick that assignment, or a decision for ambiguous dual lands, as a simplification).
New Amount `{ colorsSpentOnSubject: true }`. For permanents entering with counters, the spell object's colours must survive
to the ETB (copy to the permanent as the stack resolves). Size M (the colour assignment is the work).

## Paradigm

(a) "Paradigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without
paying its mana cost at the beginning of each of your first main phases.)" (Decorum Dissertation; all 5 are Sorcery — Lesson.)

(b) Nearest: `rebound` on spell items (stack.ts ~696, `d.afterResolving === 'exile'`) and `beginningOfMain` trigger (types ~395);
`castFree` effect for the free cast; copying as in `copySpell`.

(c) New: when a Paradigm spell resolves, exile it (not graveyard) and register `paradigms: CardDefId[]` for the player;
at the beginning of each of that player's precombat mains, an optional `castFree` of a copy for each registered name (the copy,
not the card; the card stays in exile). Size M (5 cards; the registration list and prompt are the new part).

## Modal double-faced cards (STX 16)

(a) Cast either face from hand; only the face cast exists on the stack/battlefield. Example: Mila, Crafty Companion // Lukka, Wayward
Bonder (creature front, planeswalker back). All 16 STX MDFCs: the 7 dean/legend pairs, 4 spell-or-permanent pairs (Augmenter
Pugilist // Echoing Equation, Blex, Flamescroll Celebrant, Selfless Glyphweaver, Torrent Sculptor, Pestilent Cauldron, Extus, Jadzi, Rowan // Will, Mila // Lukka).
None has a land back face.

(b) Already implemented for Marvel: `back?: CardDefId` (types.ts ~204), `fetch-scryfall.ts` handles `modal_dfc` (`DOUBLE_FACED`),
`legal.ts` ~419 offers the back face from hand (`withBackFace`), `CastChoice.back` + `castSpell` swaps `o.defId` and sets `o.front`
(stack.ts ~296-305); `transform`-style helpers in context.ts ~570-595. The plan's "none" is wrong.

(c) New / to verify: (1) the back face as a planeswalker (loyalty counters on entering via the back; Marvel had creature/spell
faces; check `loyalty` handling of a swapped `defId`); (2) leaving the battlefield/stack must restore `o.front` (context.ts ~401 does
for transform; check hand/graveyard); (3) `colorIdentity` of the front must include the back's (Brawl); (4) UI face toggle exists for Marvel. Size S.

## Learn / Lessons

(a) Scryfall oracle (Pop Quiz): "Learn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or
discard a card to draw a card.)" (Reminder text is the current one: the older "if you don't, you may discard" wording is gone;
semantics are the same.) Lessons are a spell subtype: STX has 20 (e.g. Introduction to Prophecy, "Sorcery — Lesson"); SOS has 5 more
(the Paradigm ones). In Arena Learn fetches from the deck's sideboard.

(b) Decks: `Decklist` (packages/cards/src/decks.ts line 3) has `cards` and `commander?` only. `deckIds()` and `deckGameOptions()`
(packages/cards/src/index.ts ~58-95) turn it into `NewGameOptions.decks: Record<PlayerId, CardDefId[]>` (engine setup.ts ~11).
Nearest prompts: `searchLibrary` decision (types.ts ~2072, "options: ObjectId[]") and `discard` decision; `optionalEffect` for the "or".
Hidden info: hidden.ts treats library+hand as hidden.

(c) Smallest change (no new zone): 
1. `Decklist.sideboard?: [name, number][]` (optional; STX/SOS decks list their Lessons here, 0 to 5 cards).
2. `NewGameOptions.sideboards?: Record<PlayerId, readonly CardDefId[]>` and `PlayerState.sideboard: CardDefId[]` (ids, not
   objects; an object is created in the hand only when learned). `deckGameOptions` fills it.
3. Effect `{ kind: 'learn' }` -> Decision `learn` offering "reveal Lesson X" for each distinct sideboard id, "discard a card then draw",
   or "skip"; implemented beside `searchLibrary`. Hide `sideboard` in hidden.ts.
4. AI/random-play (`random-play.ts`, packages/ai) must answer the new decision.
5. Web: deck viewer shows the sideboard; deck builder for Season/Expedition: just include the Lessons automatically.
Alternative with even less plumbing: no per-deck sideboard, the engine learns from a fixed `LESSONS` pool for the player's colours.
It is a simplification but needs no decks.ts change; the per-deck version is what Arena does. Size M (prompt, state, hidden info, UI).

## Planeswalker as Brawl commander (Quintorius, History Chaser)

Oracle: "{2}{R}{W}, Legendary Planeswalker — Quintorius, Loyalty 5. ... Quintorius, History Chaser can be your commander."
Also: "Whenever one or more cards leave your graveyard, create a 3/2 red and white Spirit creature token." (the same trigger as Kirol, see Prepare.)

What the engine does: `brawl.ts`/`setup.ts` `putInCommandZone(ctx, defId, player)` take any card definition; `castableCards` (legal.ts ~66) adds
`ps.command`; commander tax is in stack.ts ~232 and counted at ~353; `commanderToOffer` offers the command zone when it dies. None of
them look at the card's types. Colour identity comes from `colorIdentity(def)`.

What blocks it (none is engine logic):
- `packages/cards/test/brawl.test.ts` line ~35: `expect(commander.types).toContain('Creature')`: relax to Creature or Planeswalker.
- `docs/marvel-plan.md` line 78 says "one legendary creature as commander".
- UI: `apps/web/src/game/deckView.ts` section function files the commander under 'Commander' first, so fine. Any commander picker in
  `apps/web` Home/App that filters by Creature: grep found none; check when building.
- Verify walker-specific paths: a commander walker dying (0 loyalty SBA in sba.ts) goes through `commanderToOffer`; casting from the
  command zone for a walker uses the ordinary permanent cast path.
Size S. The Extus/MDFC commander (colour identity of both faces) is a separate check.

## Surprises

- MDFCs are already supported (Marvel); the plan lists them as "none".
- Prepare back-face names collide with real card ids (`slug(name)`): Lightning Bolt, Ancestral Recall, Swords to Plowshares, etc.
- Prepare faces carry no `colors`/`image_uris` in the JSON; only the card top level does.
- `GameObject.manaSpent` is a count; converge needs the colours.
- The copy from `copySpell` emits no event, so magecraft needs a new `spellCopied`.
- A pre-existing `leftGraveyard` counter (context.ts ~337) helps Kirol/Quintorius, but a trigger event is still needed.
