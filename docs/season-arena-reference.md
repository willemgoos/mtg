# Season: Arena reference

Checked 2026-09-30. Companion to [design decisions](season-mode.md) and the
[implementation plan](season-implementation-plan.md).

## Pack format

Arena store packs have eight slots: five common, two uncommon, and one rare/mythic.
These are not tabletop Play Boosters.
[Official pack format](https://mtgarena-support.wizards.com/hc/en-us/articles/360025632152-How-do-Preorders-Work).

## Published reward parameters

| Mechanic                                    | Arena reference                                            |
| ------------------------------------------- | ---------------------------------------------------------- |
| Foundations rare upgrades                   | Approximately 1 in 7 becomes mythic                        |
| Foundations Special Guests                  | Approximately 1 in 64 packs replaces a common              |
| Wildcard drops, expected packs per wildcard | Common 3; uncommon 5; rare 30; mythic 30                   |
| Wildcard probability                        | Increases after misses; resets on a hit                    |
| Pack tracks                                 | Both gain one step per opened pack; reward every six steps |
| Uncommon track start                        | Three steps already filled                                 |
| Rare/mythic track cycle                     | Four rare rewards, then one mythic                         |
| Excess commons / uncommons                  | 1 / 3 Vault points per excess copy                         |
| Vault threshold                             | 1,000 points                                               |
| Vault payout                                | 3 uncommon, 2 rare, 1 mythic wildcards                     |
| Rare/mythic booster duplicates              | Substitute an incomplete card of the same rarity and set   |
| Completed rare/mythic pool                  | 20 / 40 gems per pull                                      |

Wildcard drop figures are expected averages, not independent per-slot probabilities.
The published page does not specify the complete increasing-probability algorithm
or ordering of overlapping replacement rolls. Golden Packs also exist; their
purchase-based bonus system has not been adopted for Season.
[Official distributions](https://magic.wizards.com/en/mtgarena/drop-rates).

One wildcard crafts one copy of a card of its rarity. Crafting can happen from the
collection or while editing a deck.
[Official crafting help](https://mtgarena-support.wizards.com/hc/en-us/articles/360001216746-How-to-Redeem-a-Wildcard).

## Card eligibility

Build explicit pack sheets keyed by stable card identity, independently of the
printing chosen for artwork. A card's `set === 'fdn'` does not establish eligibility:
the existing database also includes cards from non-booster Foundations products.
An alternate printing must not increase the weight of a card name in a sheet.

The Foundations product guide distinguishes FDN, J25, FDC, and SPG. Special Guests
are a separate ten-card selection associated with Foundations boosters.
[Official Foundations product guide](https://magic.wizards.com/en/news/feature/collecting-foundations).

Implementation requirements:

- Generate an auditable manifest of regular pack cards, non-booster FDN cards, and
  Foundations Special Guests. Cross-check Arena availability; tabletop booster
  metadata alone is not proof of Arena store-pack eligibility.
- Keep collection identity separate from pack printing and pack rarity. A card can
  have printings with different rarities; define its crafting rarity explicitly.
- Exclude tokens and unlimited basic lands from collectible rewards and crafting.
- A development prototype can use only supported cards, but must identify itself as
  a partial pool. It must not advertise complete Arena-equivalent Foundations packs.
- The earlier 517-card audit counts unique FDN names. It does not include the
  separately coded SPG cards. Inventory their implementation needs separately.

## Season adaptations already agreed

- Coins are earned from solo matches; boosters cost 200 and additional starters
  cost 1,000. Arena's shop prices and daily economy are not our balancing reference.
- Completed rare/mythic pools pay 20/40 **coins**, rather than gems.
- Starter purchases also convert excess copies, using the agreed Vault/coin rules.
- All implemented collectible cards are legal and craftable, across sets.
- Progress belongs to permanent independent saves, with no timed resets.

## Details to resolve during implementation

1. Record an explicit, testable wildcard sampler and replacement ordering. If the
   exact Arena algorithm cannot be verified, label our algorithm as an approximation
   calibrated to the published averages; do not claim exact Arena parity.
2. Confirm the Special Guests manifest and mechanics before enabling that slot.
   Full pack parity requires those cards as well as the regular pack sheets.
3. Golden Packs are outside the currently agreed plan. Adding or deliberately
   omitting them from a parity claim requires a separate scope decision.
4. Define collection quantities for cards that allow more than four copies. Their
   printed deckbuilding exceptions must survive validation and reward processing.
5. Specify claim behavior for the Vault, including overflow and more than one
   threshold crossed in a transaction. Preserve earned rewards across reloads.

These are tracked limits on fidelity, not authorization to change the agreed mode.

## Phase 3 sampler implementation — 2026-09-30

`seasonPacks.ts` uses explicit identity sheets from the generated Foundations
manifest. Base FDN collector numbers 1–271, Arena availability, and unique names
define the provisional regular sheet. After the first content batch, 193 of 271
candidates are registered and eligible. The full inventory contains 517 FDN names
(355 registered, 162 missing) and ten separately listed SPG cards (none registered). See
[content inventory](foundations-inventory.md). The UI labels packs as a partial
prototype; the disabled SPG slot means no full Arena parity claim.

The eight slots are five common, two uncommon, and one high rarity. Roll wildcard
replacements once per pack first: one designated common and uncommon slot each,
then the high slot. Common/uncommon waiting times are uniform over 1–5/1–9 packs.
Their conditional probabilities after `m` misses are `1/(5-m)` and `1/(9-m)`;
a hit resets that counter. The combined rare/mythic wildcard waiting time is
uniform over 1–29 packs, then chooses either rarity equally. This gives mean waits
of 3, 5, and 15 packs, with one rare and one mythic wildcard each per 30 packs on
average. The shared high-rarity counter is an explicit approximation of Arena's
unpublished algorithm, not separate reproduction of its two rarity counters.

If the high slot is not a wildcard, roll a 1/7 mythic upgrade. Sample identities
uniformly within rarity. Rare/mythic cards choose among incomplete same-rarity
sheet identities; once complete, a pull converts to 20/40 coins. No rarity upgrade
or fallback to non-booster cards occurs when a sheet is complete. Commons and
uncommons can repeat and convert excess copies to Vault points. Special Guests
and Golden Packs remain excluded. This is not a full collation emulation.

Crafting rarity is explicitly the selected database printing's rarity; current
regular-sheet cards agree with that rarity, checked by tests. Printed quantity
exceptions control collection capacity, with unlimited basic lands excluded.
Vault claims consume exactly 1,000 points per click, retaining overflow and allowing
repeated claims when more thresholds remain. RNG, wildcard miss counters, rewards,
track progress, and duplicate conversions commit in one storage write. Reveal
buttons only display the persisted receipt. Old saves initialize miss counters
when first opened and remain compatible without a destructive migration.
