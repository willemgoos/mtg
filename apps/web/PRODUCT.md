# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Magic: The Gathering players who know MTG Arena, playing solo against bot opponents in the browser on a desktop screen. Sessions are single matches or short runs (Gauntlet, Expedition, Season).

## Product Purpose

A browser duel game built on the Foundations (FDN) card pool: pick or build a deck, play a full rules-enforced match against a bot, and progress through modes. Success is a match that reads instantly and feels as good to play as Arena.

## Positioning

An Arena-style Foundations experience that runs in a browser, with its own modes (Expedition, Gauntlet, Season) on top of the Arena Starter Deck Duel decks.

## Capabilities and Constraints

- Card pool is Foundations; decks are Arena's ten Foundations Starter Decks (exact lists from mtg.wiki).
- Card images and art crops are hotlinked from Scryfall; art crops are 626px wide and must never be stretched beyond that.
- UI scale is user-adjustable (S/M/L/XL); layouts are sized in rem.

## Brand Commitments

- MTG Arena is the reference for layout and contents: board layout, card presentation, hand, stack and prompts. When in doubt, do what Arena does.
- The visual style of controls may move beyond Arena's (user asked for less dated buttons and text, 2026-10-01).

## Evidence on Hand

- Card art and images via Scryfall data in `packages/cards`.
- Design mockups in `design/` (Design Studio project).
