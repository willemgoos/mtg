# Strixhaven Brawl 15b, black group: simplifications

- Boggart Trawler // Boggart Bog, Fell the Profane // Fell Mire: "you may pay 3 life, otherwise it enters tapped" is modelled as entering tapped, then an optional "pay 3 life, untap it".
- Hateful Eidolon: triggers on any creature dying and counts the Auras at resolution (drawing nothing if there were none), rather than checking "enchanted" when it triggers.
- Kaya's Ghostform: enchants a creature you control (not a planeswalker) and returns it only when it dies, not when it is exiled.
- Cursebound Witch: the spellbook draft is just drawing a card (the spellbook list isn't in the card data).
- Blasphemous Edict: players sacrifice one creature at a time in turn (13 rounds), not all thirteen simultaneously. The {B} cost is a conditional cost reduction (the card's {3}{B}{B} less {3}{B}), not an alternative cost.
- Phyrexian Tower: the "{T}, Sacrifice a creature: Add {B}{B}" ability uses the stack and adds the mana to your pool (it isn't a mana ability).
- Westvale Abbey: the five creatures are sacrificed as the ability resolves, not as a cost (it needs five creatures when activated).
- Thriving Moor: "choose a color other than black" also offers black (which adds nothing).
- Blighted Nightmare: X is the target's mana value, and the blight (X -1/-1 counters, shown as a permanent -X/-X effect) goes on your creature with the greatest toughness; nothing returns if X exceeds that toughness (the Nightmare has already gone to hand). The perpetual +1/+1 is a perpetual static boost on each card.
- Terrors of the Track: double team conjures a copy of the same card with a flag that it has lost double team.
- Lord Skitter's Blessing: the Wicked Role's "only one Role per controller on a creature" replacement isn't implemented.
- Vein Ripper: ward's creature sacrifice takes your creature with the lowest power automatically; the Brawl AI/UI doesn't offer the choice.
- Liliana, Dreadhorde General (-9): each opponent keeps their highest mana value permanent of each type (artifact, creature, enchantment, land, planeswalker) automatically instead of choosing.
- Bone Shards, Bitter Triumph: the discarded card goes to the graveyard directly (no "discard" event, so no discard triggers).
- Snow-Covered Swamp: the Snow supertype has no rules here (no snow mana).
