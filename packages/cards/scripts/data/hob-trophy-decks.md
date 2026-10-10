# The Hobbit (HOB) draft trophy decks

Source: [untapped.gg HOB trophy decks](https://mtga.untapped.gg/limited/draft/the-hobbit/trophy-decks). The page shows only 8 curated decks, but the analytics endpoint it uses (`trophy_decks_by_event_v2/free` with `CardSetFilter=HOB`, `TimeIntervalFilter=LAST_90_DAYS`, `EventTypeFilter=PREMIER_DRAFT` or `QUICK_DRAFT`) returns every trophy deck: 729 Premier Draft and 627 Quick Draft decks (7–0 to 7–2), read on 2026-10-10. Traditional Draft is rejected by the endpoint. 17lands was not used.

Lists are decoded from each deck's `ds` string (Untapped's V4 deck string: base64url, varints, sections of 1/2/3/4/n-copy cards as delta-coded Arena title ids, resolved to names with mtgajson.untapped.gg `cards.json` + `loc_en.json`). Every list totals 40 and every name resolves against Scryfall's HOB card list. Basic lands are included.

Selection per colour pair: best record (7–0 first), Premier before Quick, then most recent. The pair is Untapped's deck colour (`dc`), so a deck can carry an off-colour hybrid card castable with the pair's colours.

## Summary

All ten two-colour pairs have a public 7–0 Premier Draft list; one deck per pair.

## W/U

- Player: ちゃんおー
- Record: 7–0 (Premier Draft, 2026-09-27)
- URL: https://mtga.untapped.gg/profile/23b817f3-3a82-4cc2-9d46-aeccf11c7e40/DPULG7JRLVB4BOJTTJDSHMWSCM/deck/463412b8-a4fd-48e3-879d-1a8975f2348a/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bard's Company
1 Celebrate the Mountain-king
2 Elvenking's Harper
2 Enchanted River's Grasp
2 Esgaroth Garrison
1 Hobbit Hole
9 Island
1 Lakeshore Apothecary
2 Long Lake Nuisance
1 Mirkwood Meditator
1 Mirkwood Nurturer
2 Patient Instructor
7 Plains
4 Plunder the Trollshaws
1 Stone by Sunlight
1 The Mountain-king's Return
2 Uneasy Partings
```

## U/B

- Player: Bpro
- Record: 7–0 (Premier Draft, 2026-09-16)
- URL: https://mtga.untapped.gg/profile/db9c38bc-6b25-4b29-904b-97c3e3f3426b/N3XZPQ3VUJHCBBNJKEHE3N6F7A/deck/9d4459f3-fa5d-4837-92ff-12fc1b8258d6/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Crude Bent Blade
1 Desolation Prowler
1 Down, Down to Goblin-town
2 Duskwatch Hunter
1 Front Porch Sentries
1 Goblin Plate Mail
1 Gollum the Abandoned
1 Great Fierce Bee
2 Hobbit Hole
4 Island
3 Long Lake Nuisance
1 Long-Bodied Grey Dog
1 Patient Instructor
3 Rage into the Valley
3 Reverent Howl
1 Rhovanion Rampager
3 Stony-Voiced Goblins
9 Swamp
1 Thrór's Map
```

## B/R

- Player: Leaodailha
- Record: 7–0 (Premier Draft, 2026-09-28)
- URL: https://mtga.untapped.gg/profile/9369ac6e-9780-49d6-bf9e-8778089e568b/D2IF3FKJQRA75IIXA34BIWPFKA/deck/f2638d92-e602-4615-940e-3da583a62dba/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bilbo's Deadly Slice
1 Bombur, Gentle Dreamer
1 Crude Bent Blade
2 Dori, Bearer of Friends
1 Dreaded Bat-Cloud
1 Dwarven Mauler
1 Gandalf, Spark Starter
2 Goblin Plate Mail
1 Goblin-town Flunkies
1 Gollum the Abandoned
1 Gollum, Silent Slinker
2 Gundabad Opportunist
9 Mountain
1 Nighthowl Pursuer
2 Óin the Brave
1 Pinecone Strike
2 Ragged Short Spear
2 Stir Up Trouble
8 Swamp
```

## R/G

- Player: SisuBug
- Record: 7–0 (Premier Draft, 2026-08-15)
- URL: https://mtga.untapped.gg/profile/764e7cca-97d5-4bfc-899f-de53fc059c22/PP6UZWDPS5AVROO2OID7PBOIFE/deck/c2cba640-8847-408e-a0d1-564a0b66fd8f/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bejeweled Warg
1 Beorn's Hospitality
1 Dori, Bearer of Friends
1 Down in the Valley
9 Forest
1 Galion, Elvenking's Butler
1 Gundabad Opportunist
1 Large Bear
1 Little Bear
1 Misty Mountains Raider
8 Mountain
1 Nasty Little Rabbit
1 Nori, Teller of Tales
2 Óin the Brave
1 Ordinary Bear
2 Pinecone Strike
1 Quarrel
1 Troll Negotiations
1 Warg Tactics
2 Wargling
1 Well-Worn Spatula
1 Wilderland Scrounger
```

## G/W

- Player: JairoVargas
- Record: 7–0 (Premier Draft, 2026-09-12)
- URL: https://mtga.untapped.gg/profile/905d200c-ee36-4bd7-9072-eae0d4ede0f4/5JV6FI5MVZFUVDN54BESAZS22I/deck/e5778278-37b3-432a-9de0-60f56f3a430d/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
2 Attercop
1 Beorn, Reluctant Host
1 Boughside Wanderers
2 Celebrate the Mountain-king
1 Chief Warg's Company
1 Dwarven Provisioner
9 Forest
1 Galion, Elvenking's Butler
2 Guardian of the Halls
1 Hobbit Hole
1 Large Bear
1 Magnificent End
1 Mirkwood
1 Mirkwood Pathmaker
1 Old Fat Spider
1 Ordinary Bear
1 Part in Friendship
5 Plains
1 Quarrel
1 Swamp
1 Troll Negotiations
1 Wargling
1 Wilderland Scrounger
2 Wood Elves
```

## W/B

- Player: CIPOG
- Record: 7–0 (Premier Draft, 2026-08-31)
- URL: https://mtga.untapped.gg/profile/1edf71bb-b232-4a7b-a4f8-e05e6a72bf0e/VQCVLSD7DNDJTC3W44PHCPMRW4/deck/c67cc1d8-4f4b-4df3-87dc-c87879374272/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bilbo's Deadly Slice
1 Bofur, Reliable Guardian
1 Celebrate the Mountain-king
2 Dáin, Lord of the Iron Hills
1 Desolation Prowler
1 Front Porch Sentries
1 Gollum, Silent Slinker
2 Great Fierce Bee
1 Great Ugly-Looking Goblin
1 Head of the Hunt
1 Hobbit Hole
1 Iron Hills Blacksmith
1 Magnificent End
7 Plains
2 Rage into the Valley
1 Settle the Wreckage
1 Stone by Sunlight
1 Stony-Voiced Goblins
8 Swamp
1 The Sackville-Bagginses
4 Velvetwing Butterflies
```

## U/R

- Player: malamalama
- Record: 7–0 (Premier Draft, 2026-09-25)
- URL: https://mtga.untapped.gg/profile/2c44c53c-78a4-4398-97ef-7d380ebd941d/TY5RO2FD3REO3E6IAS7RQCTX3Q/deck/03a83459-4f41-4847-baa8-71bcb3ebefbf/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bard's Company
2 Bilbo Baggins, Burglar
1 Bilbo, Thief in the Night
1 Burn, Burn, Tree and Fern
1 Elven Passage
1 Enchanted River's Grasp
1 Gandalf, Goblins' Bane
2 Iron Hills
8 Island
1 Lakeshore Apothecary
3 Long Lake Nuisance
5 Mountain
1 Óin the Brave
2 Pinecone Strike
1 Plains
3 Plunder the Trollshaws
1 Settle the Wreckage
1 Smaug, the Great Calamity
1 Thranduil, Sindarin Liege
1 Troop of Ponies
2 Uneasy Partings
```

## B/G

- Player: Edson
- Record: 7–0 (Premier Draft, 2026-09-29)
- URL: https://mtga.untapped.gg/profile/afc5e881-c4d9-4eb3-b188-4f9a45138c48/PIK2GCHZKNDUDI4PS4RGY3TMMA/deck/9aef2e68-ffa6-4cf3-bad1-c4808f470cbd/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
2 Attercop
1 Beorn the Fierce
1 Desolation Prowler
1 Duskwatch Hunter
9 Forest
1 Gathering of Darkness
1 Gigantic Big Bear
1 Gollum the Abandoned
1 Guardian of the Halls
1 Little Bear
1 Mirkwood
1 Mirkwood Nurturer
1 Nasty Little Rabbit
1 Ordinary Bear
2 Quarrel
1 Rage into the Valley
1 Stir Up Trouble
7 Swamp
1 The Chief Warg
1 Thranduil, Sindarin Liege
1 Tom, Bert, and William
1 Wargling
1 Wilderland Scrounger
1 Wood Elves
```

## R/W

- Player: MantisRider
- Record: 7–0 (Premier Draft, 2026-09-29)
- URL: https://mtga.untapped.gg/profile/95d98e1d-7d79-4557-81bd-0e9c0fa24540/RIC3KR42J5DQJAUOGF2WNZNGBQ/deck/a6f819cb-72c7-42b9-b620-482d9d690514/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
1 Bifur, Melodic Rider
2 Bofur, Reliable Guardian
1 Bombur, Gentle Dreamer
1 Celebrate the Mountain-king
1 Dori, Bearer of Friends
1 Dwalin, Weaponmaster
2 Dwarven Mattock
1 Dwarven Mauler
1 Fíli the Pathfinder
1 Gandalf, Spark Starter
1 Goblin Plate Mail
1 Gundabad Opportunist
1 Kíli the Resourceful
9 Mountain
2 Óin the Brave
2 Ori, Keeper of Songs
1 Pinecone Strike
8 Plains
1 Ragged Short Spear
2 Thorin Oakenshield
```

## G/U

- Player: Bulbasaur
- Record: 7–0 (Premier Draft, 2026-09-28)
- URL: https://mtga.untapped.gg/profile/e201d3b5-30f3-4e03-b96b-6c984ddfa4e2/U7YEDUWACBFXHLC64AXEGYJDIQ/deck/59a945f8-7206-4fd7-8036-73f75a5f4412/draft-replay?gameType=limited&limitedType=ranked&limitedSet=HOB

```
3 Attercop
1 Dancing from Dark to Dawn
1 Down in the Valley
1 Elven Passage
1 Elvenking's Halls
9 Forest
1 Galion, Elvenking's Butler
1 Guardian of the Halls
1 Hobbit Hole
5 Island
1 Mirkwood Nurturer
2 Mirkwood Pathmaker
1 Old Fat Spider
3 Quarrel
1 Riddles in the Dark
2 Silvan Reveler
1 Thranduil, Sindarin Liege
1 Thranduil's Company
1 Troll Negotiations
2 Wood Elves
1 Woodland Weavemaster
```
