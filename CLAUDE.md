# Project guidelines

## MTG Arena is the reference

When in doubt about how something should look or what it should contain, do what MTG Arena does.

- **Looks:** match Arena's board layout, card presentation, hand, stack and prompts.
- **Contents:** the card pool is Foundations (FDN). Decks come from Arena's ten Foundations Starter Decks (two-colour, 60 cards each, used in Starter Deck Duel). Take exact lists from https://mtg.wiki/page/Foundations_Starter_Decks, not memory (the page blocks plain fetches; the MediaWiki API works: `api.php?action=parse&page=Foundations_Starter_Decks&prop=wikitext&format=json`).
- Deck roadmap: `docs/deck-plan.md`.
- Second set: Bloomburrow (BLB). Its decks are our own, built like the starter decks, and play against them (mixing sets is normal on Arena). Card text comes from Scryfall like Foundations.
- Arena's five mono-colour decks (the ones against Sparky) are older non-Foundations lists, so they are not a target.
