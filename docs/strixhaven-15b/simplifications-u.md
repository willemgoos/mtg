# Strixhaven Brawl 15b, blue group: simplifications

One bullet per card that isn't exactly per Oracle text. Rules text comes from the Scryfall bulk data (3 October 2026).

- **Negate**: already implemented (Foundations); skipped. **Opt**: likewise skipped.
- **Slickshot Lockpicker**: plot is an activated ability from hand at sorcery speed that uses the stack (the opponent can respond), not a special action. The plotted card can only be cast as a sorcery (fine for a creature; no other card in the group has plot).
- **Quicken**: "the next sorcery spell you cast this turn" is kept per player for the turn and used up by the next sorcery cast, whenever it is cast.
- **Silundi Vision**: the revealed card is not shown to the opponent as a reveal; the rest go to the bottom in a random order (as printed).
- **Sink into Stupor**: "target spell or nonland permanent" is two modes ("return target spell" / "return target nonland permanent"), chosen when casting.
- **Unexpected Assistance**: none (convoke).
- **Baral's Expertise**: "up to three targets" is exactly three optional target slots; the free spell is offered from hand (mana value 4 or less) as a cast decision, with no check that you could normally cast it.
- **Distant Melody**: counts the permanents you control (not only creatures) of the chosen creature type, as printed; the creature type list is the engine's usual list of types you could choose.
- **Lazotep Plating**: the Army is chosen by the engine (the first Zombie Army or Army you control); "you and permanents you control gain hexproof" uses the Dawn's Truce effect (permanents on the battlefield now plus the player).
- **Mizzium Skin, Cyclonic Rift**: overload is an alternative cost ("replaces the mana cost") with its own spell, as in other overload cards; the menu says "Alternative cost (...): overload (each)".
- **Part the Waterveil**: awaken 6 is the alternative cost with a target land you control. The awakened land becomes a 0/0 Elemental creature with haste permanently, as printed. The extra turn is queued the usual way (after this one).
- **Rise from the Tides**: the Zombie tokens are the common 2/2 black Zombie token (they enter tapped, as printed).
- **Sea Gate Restoration // Sea Gate, Reborn**, **Soporific Springs**, **Hydroelectric Laboratory**: "you may pay 3 life, if you don't it enters tapped" is modelled as enters tapped plus a "may pay 3 life, then untap" trigger (the permanent is briefly tapped; same as the 15a shock lands).
- **Stock Up, Experimental Augury**: the pick is a "choose a card or none" prompt; the rest go to the bottom in a random order rather than any order. **Experimental Augury / Tezzeret's Gambit**: see proliferate below.
- **Proliferate** (Experimental Augury, Tezzeret's Gambit): the engine chooses for you: it adds one more of each kind of counter (+1/+1, loyalty, named counters except finality, stun, time) to every permanent you control that has any. It never affects opponents' permanents or players' counters.
- **Treasure Cruise**: delve exiles only as many cards as the generic cost needs (the least useful first); you can't choose to exile more or to exile specific cards.
- **Gate to Seatower**: "seek" is the shared random-nonland handler; "activate only once" is per permanent.
- **Mystic Sanctuary**: "enters tapped unless you control three or more other Islands" is evaluated as it enters; "when this land enters untapped" is an intervening-if on the land being untapped, and the card goes on top of the library with no choice of "may" beyond leaving the target out.
- **Hydroelectric Specimen**: the redirect is only offered for a spell with exactly one target and only if the Specimen is a legal target for that spell; "you may" is a yes/no prompt.
- **Ingenious Prodigy**: skulk is the engine's "can't be blocked by creatures with greater power" (greater than its current power).
- **Essence Capture**: none.
- **Syncopate**: "unless its controller pays {X}" with X = the value chosen for Syncopate; an X of 0 lets the spell resolve without a prompt.
- **Better Offer** (Alchemy): the random creature is chosen from the target opponent's library (no search, no reveal, no shuffle). "Perpetually" is a base 0/0-replacing stat set (`copyPT`) that stays with the card in every zone; "perpetually gains ward {1}" is ward {1} only while it stays on the battlefield (it is lost if the card changes zones).
- **Mass Manipulation**: "X target creatures and/or planeswalkers" is at most three targets (never more than X), and fewer than X are allowed. Control is permanent, as printed.
- **Stolen by the Fae**: the target creature's mana value must equal X (checked when you cast it, not again on resolution).
- **Tezzeret's Gambit**: the Phyrexian {U/P} is a choice between the normal {3}{U} and a {3} alternative cost that also pays 2 life ("Alternative cost ({3}): pay 2 life"). Proliferate: see above.
- **Seek New Knowledge, Bounty of the Deep** (Alchemy): "seek" puts a random matching card from your library into your hand (no reveal). Seek New Knowledge puts a card of your choice from your hand on the bottom after seeking.
- **Expropriate** (council's dilemma): you vote first, then your opponent, by a prompt for each (the engine's AI answers the opponent's vote). Each time vote is an extra turn for you. Your own money vote takes back a permanent you own that an opponent controls (the best by mana value, with no choice); an opponent's money vote lets them choose which of their permanents you gain control of (control is permanent; the permanent is summoning sick). Expropriate is exiled as it resolves.
- **Housemeld** (Alchemy): the exiled card perpetually has exactly the enchantment type (it loses its creature type, and any other types) for as long as the card exists (it stays so after it returns to the battlefield and in every zone). A token exiled this way ceases to exist and doesn't return. "At the beginning of your next end step" is a delayed trigger on your next end step (this turn's if it hasn't begun yet).
- **Snow-Covered Island**: snow is a new supertype ("Snow"); nothing in the engine reads it yet (no snow mana).
- **Thriving Isle**: "choose a color other than blue" offers all five colours; choosing blue just makes it a plain Island that enters tapped.
- **Haughty Djinn**: none (power is a characteristic-defining count of instant and sorcery cards in your graveyard).
- **Murmuring Mystic**: the token is a new 1/1 blue Bird Illusion with flying (`soc-15b-u-bird-illusion`).
- **Reflective Rimekin** (Alchemy): the one-time boon is a permanent emblem-style triggered ability, so it copies each of your later instant or sorcery spells with mana value 3 or less. The copy keeps the original's targets ("you may choose new targets" is not offered).
- **Counterspell, Spell Pierce, Spell Swindle, Wash Away, Three Steps Ahead**: Spell Swindle counts X for a spell with {X} in its cost as the announced value; Wash Away's cleave is the alternative cost {1}{U}{U} ("Alternative cost ({1}{U}{U}): cleave") and the unrestricted spell; the normal Wash Away can only target a spell that wasn't cast from its owner's hand. Three Steps Ahead's spree is any non-empty set of its three modes, each with its own additional cost, shown as one cast option per set.
- **Soulblade Djinn, Consider, Preordain, Deduce, Thoughtcast**: none (Thoughtcast's affinity counts artifacts you control, tokens included).
